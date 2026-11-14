import { useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Activity, Building2, Info, ShieldCheck } from 'lucide-react';
import { api, type DashboardPayload, type InstitutionalAnalyticsPayload } from '../lib/api';

interface CareerReadinessViewProps {
  dashboard: DashboardPayload;
}

export function CareerReadinessView({ dashboard }: CareerReadinessViewProps) {
  const [tab, setTab] = useState<'report' | 'agents' | 'institutional'>('report');
  const [institutional, setInstitutional] = useState<InstitutionalAnalyticsPayload | null>(null);

  useEffect(() => {
    if (tab === 'institutional' && !institutional) {
      api
        .getInstitutionalAnalytics()
        .then(setInstitutional)
        .catch(() => {});
    }
  }, [tab, institutional]);

  const { readiness, career, agentRuns, projects, attempts } = dashboard;

  const chartData = readiness.skillGaps.map((g) => ({
    name: g.skillName.length > 12 ? `${g.skillName.slice(0, 11)}…` : g.skillName,
    Required: g.requiredProficiency,
    Demonstrated: g.demonstratedProficiency,
    WeightedGap: g.weightedGap,
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl text-[#24231F]">
            Career Readiness &amp; Intelligence Report
          </h1>
          <p className="text-sm text-[#636159] mt-1">
            Transparent gap math, AI orchestrator execution logs, and privacy-protected cohort
            analytics.
          </p>
        </div>

        <div className="flex items-center gap-1 rounded-lg border border-[#E8E3D8] bg-[#FDFBF6] p-1">
          {(
            [
              { id: 'report', label: 'Readiness Report' },
              { id: 'agents', label: 'AI Agent Logs' },
              { id: 'institutional', label: 'Institutional Insights' },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                tab === t.id ? 'bg-[#24231F] text-[#F8F6EF]' : 'text-[#636159] hover:text-[#24231F]'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'report' && (
        <div className="space-y-6">
          {/* Methodology Banner */}
          <section className="rounded-2xl border border-[#E8E3D8] bg-[#FDFBF6] p-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-[#77764B]">
                  {career.title} · Prototype Readiness Indicator
                </div>
                <div className="mt-1 flex items-baseline gap-3">
                  <span className="font-serif text-4xl text-[#24231F] tabular-nums">
                    {readiness.readinessScore}%
                  </span>
                  <span className="text-xs font-mono text-[#636159] tabular-nums">
                    Weighted Gap: {readiness.totalWeightedGaps} / {readiness.totalWeightedRequirements}
                  </span>
                </div>
              </div>
              <div className="max-w-lg rounded-xl border border-[#E8E3D8] bg-white p-3.5 text-xs text-[#24231F]/80 flex items-start gap-2.5">
                <Info className="h-4 w-4 text-[#77764B] shrink-0 mt-0.5" aria-hidden="true" />
                <span>{readiness.methodologyNote}</span>
              </div>
            </div>

            <div className="mt-6 h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 16, left: -12, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E8E3D8" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#24231F' }} />
                  <YAxis domain={[0, 5]} tick={{ fontSize: 11, fill: '#636159' }} />
                  <Tooltip />
                  <Bar dataKey="Required" fill="#E8E3D8" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Demonstrated" fill="#E8B52E" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          {/* Explainable Skill-by-Skill Table */}
          <section className="rounded-2xl border border-[#E8E3D8] bg-[#FDFBF6] p-6">
            <h2 className="text-lg font-semibold text-[#24231F] mb-4">
              Explainable Competency Breakdown
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#E8E3D8] text-[11px] font-semibold uppercase tracking-wider text-[#636159]">
                    <th className="py-2 pr-3">Skill</th>
                    <th className="py-2 px-2">Status</th>
                    <th className="py-2 px-2">Req (R)</th>
                    <th className="py-2 px-2">Demo (D)</th>
                    <th className="py-2 px-2">Weight (W)</th>
                    <th className="py-2 px-2">Weighted Gap</th>
                    <th className="py-2 pl-2">Explanation</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E8E3D8]/60 text-xs">
                  {readiness.skillGaps.map((g) => (
                    <tr key={g.skillId} className="align-top">
                      <td className="py-3 pr-3 font-semibold text-[#24231F] whitespace-nowrap">
                        {g.skillName}
                      </td>
                      <td className="py-3 px-2 whitespace-nowrap font-semibold">
                        <span
                          className={
                            g.statusLabel === 'Validated' || g.statusLabel === 'Demonstrated'
                              ? 'text-[#77764B]'
                              : g.statusLabel === 'Declared Only' || g.statusLabel === 'Needs Improvement'
                                ? 'text-[#D77B43]'
                                : 'text-[#636159]'
                          }
                        >
                          {g.statusLabel}
                        </span>
                      </td>
                      <td className="py-3 px-2 font-mono tabular-nums">{g.requiredProficiency}</td>
                      <td className="py-3 px-2 font-mono tabular-nums">{g.demonstratedProficiency}</td>
                      <td className="py-3 px-2 font-mono tabular-nums">{g.weight.toFixed(1)}</td>
                      <td className="py-3 px-2 font-mono tabular-nums text-[#D77B43]">
                        {g.weightedGap.toFixed(2)}
                      </td>
                      <td className="py-3 pl-2 text-[#24231F]/80">{g.explanation}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <section className="rounded-2xl border border-[#E8E3D8] bg-[#FDFBF6] p-5">
              <h3 className="text-base font-semibold text-[#24231F] mb-2">
                Priority Gaps to Address Next
              </h3>
              <ul className="space-y-2 text-xs">
                {readiness.priorityGaps.slice(0, 5).map((g) => (
                  <li
                    key={g.skillId}
                    className="flex items-center justify-between rounded-lg border border-[#E8E3D8] bg-white px-3 py-2"
                  >
                    <span className="font-semibold text-[#24231F]">{g.skillName}</span>
                    <span className="font-mono text-[#D77B43] tabular-nums">
                      Weighted Gap {g.weightedGap.toFixed(1)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="rounded-2xl border border-[#E8E3D8] bg-[#FDFBF6] p-5">
              <h3 className="text-base font-semibold text-[#24231F] mb-2">
                Evidence Summary
              </h3>
              <div className="space-y-2 text-xs text-[#24231F]/80">
                <div>
                  Completed Diagnostics: <strong className="tabular-nums">{attempts.length}</strong>
                </div>
                <div>
                  Submitted Practical Projects:{' '}
                  <strong className="tabular-nums">{projects.length}</strong>
                </div>
                <div>
                  Transferable Competencies:{' '}
                  <strong>
                    {readiness.transferableSkills.length > 0
                      ? readiness.transferableSkills.map((t) => t.skillName).join(', ')
                      : 'Evaluated automatically on career switch'}
                  </strong>
                </div>
              </div>
            </section>
          </div>
        </div>
      )}

      {tab === 'agents' && (
        <section className="rounded-2xl border border-[#E8E3D8] bg-[#FDFBF6] p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-[#77764B]" aria-hidden="true" />
            <h2 className="text-lg font-semibold text-[#24231F]">
              Central AI Orchestrator Execution Logs
            </h2>
          </div>
          <p className="text-xs text-[#636159]">
            Controlled event-driven execution across Skill Auditor, Career Architect, Learning
            Strategist, Progress Evaluator, and Adaptive Mentor.
          </p>

          <div className="space-y-3">
            {agentRuns.map((run) => (
              <article
                key={run.id}
                className="rounded-xl border border-[#E8E3D8] bg-white p-4 space-y-1.5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="font-semibold text-[#24231F]">
                    Event: {run.triggerEvent} · Agents: {run.agentsInvoked.join(' → ')}
                  </span>
                  <span className="font-mono text-[#77764B] tabular-nums">
                    {run.status} · {run.durationMs}ms
                  </span>
                </div>
                <p className="text-sm text-[#24231F]/85">{run.summary}</p>
                {run.errorMessage && (
                  <p className="text-xs text-[#D77B43]">
                    Fallback note: {run.errorMessage}
                  </p>
                )}
              </article>
            ))}
          </div>
        </section>
      )}

      {tab === 'institutional' && (
        <section className="rounded-2xl border border-[#E8E3D8] bg-[#FDFBF6] p-6 space-y-5">
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-[#77764B]" aria-hidden="true" />
            <h2 className="text-lg font-semibold text-[#24231F]">
              Institutional Cohort Analytics (Aggregated)
            </h2>
          </div>

          {!institutional ? (
            <p className="text-sm text-[#636159]">Loading aggregated cohort metrics…</p>
          ) : (
            <>
              <div className="rounded-xl border border-[#77764B]/30 bg-[#77764B]/10 px-4 py-3 text-xs text-[#24231F] flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-[#77764B] shrink-0" aria-hidden="true" />
                <span>{institutional.privacyNote}</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="rounded-xl border border-[#E8E3D8] bg-white p-4">
                  <div className="text-2xl font-bold tabular-nums">{institutional.totalLearners}</div>
                  <div className="text-xs text-[#636159]">Active Cohort Learners</div>
                </div>
                <div className="rounded-xl border border-[#E8E3D8] bg-white p-4">
                  <div className="text-2xl font-bold tabular-nums">
                    {institutional.assessmentSummary.attempts}
                  </div>
                  <div className="text-xs text-[#636159]">Cohort Diagnostics Logged</div>
                </div>
                <div className="rounded-xl border border-[#E8E3D8] bg-white p-4">
                  <div className="text-2xl font-bold tabular-nums">
                    {institutional.assessmentSummary.avgScore}%
                  </div>
                  <div className="text-xs text-[#636159]">Mean Cohort Diagnostic Score</div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="rounded-xl border border-[#E8E3D8] bg-white p-4">
                  <h3 className="text-sm font-semibold text-[#24231F] mb-3">
                    Target Career Distribution
                  </h3>
                  <div className="space-y-2 text-xs">
                    {institutional.careerDistribution.map((c) => (
                      <div key={c.careerId} className="flex justify-between">
                        <span>{c.careerTitle}</span>
                        <span className="font-mono tabular-nums font-semibold">
                          {c.learnerCount} learners
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl border border-[#E8E3D8] bg-white p-4">
                  <h3 className="text-sm font-semibold text-[#24231F] mb-3">
                    Common Skill Evidence Gaps
                  </h3>
                  <div className="space-y-2 text-xs">
                    {institutional.skillGapTrends.map((s) => (
                      <div key={s.skillName} className="flex justify-between">
                        <span>{s.skillName}</span>
                        <span className="font-mono tabular-nums text-[#636159]">
                          {s.provenCount} proven · {s.declaredOnlyCount} declared only
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}
        </section>
      )}
    </div>
  );
}
