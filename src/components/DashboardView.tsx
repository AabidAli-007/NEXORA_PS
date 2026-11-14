import {
  ArrowRight,
  CheckCircle2,
  Clock,
  Edit3,
  Lock,
  MessageSquare,
  Play,
  Sparkles,
} from 'lucide-react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import type { DashboardPayload } from '../lib/api';
import type { NavPage } from './SidebarShell';
import { NEXORA_ASSETS } from '../lib/assets';
import { getDomainMeta } from '../data/domainsCatalog';

interface DashboardViewProps {
  dashboard: DashboardPayload;
  onNavigate: (page: NavPage) => void;
  onStartAssessment: (skillId: string) => void;
}

export function DashboardView({
  dashboard,
  onNavigate,
  onStartAssessment,
}: DashboardViewProps) {
  const { profile, career, readiness, roadmap, agentRuns, gamification, entryAssessment } = dashboard;
  const domainMeta = dashboard.domainMeta ?? getDomainMeta(profile.domainId);
  const firstName = profile.displayName.split(' ')[0];

  const nextStep =
    roadmap.steps.find((s) => s.status === 'NEEDS_REVISION') ??
    roadmap.steps.find((s) => s.status === 'IN_PROGRESS') ??
    roadmap.steps.find((s) => s.status === 'NOT_STARTED') ??
    roadmap.steps[0];

  const totalSkillsInPlan = readiness.requiredCount;
  const verifiedCount = readiness.demonstratedOrValidatedCount;
  const declaredCount = readiness.declaredOnlyCount;
  const missingCount = readiness.unassessedCount;

  const donutData = [
    { name: 'Proven (Demonstrated/Validated)', value: Math.max(0, verifiedCount), color: '#E8B52E' },
    { name: 'Declared Only', value: Math.max(0, declaredCount), color: '#D77B43' },
    { name: 'Missing Evidence', value: Math.max(0, missingCount), color: '#E8E3D8' },
  ].filter((d) => d.value > 0);

  const safeDonut =
    donutData.length > 0
      ? donutData
      : [{ name: 'No Requirements', value: 1, color: '#E8E3D8' }];

  const phases = [1, 2, 3, 4].map((pNum) => {
    const stepsInPhase = roadmap.steps.filter((s) => s.phaseNumber === pNum);
    const completed = stepsInPhase.filter((s) => s.status === 'COMPLETED').length;
    const anyNeedsRev = stepsInPhase.some((s) => s.status === 'NEEDS_REVISION');
    const anyInProg = stepsInPhase.some((s) => s.status === 'IN_PROGRESS' || s.status === 'NOT_STARTED');
    const allLocked = stepsInPhase.length > 0 && stepsInPhase.every((s) => s.status === 'LOCKED');
    return {
      phaseNumber: pNum,
      title:
        pNum === 1
          ? 'Core Foundations'
          : pNum === 2
            ? domainMeta.supportsGitHubProjects
              ? 'Applied Architecture'
              : 'Applied Methods & Cases'
            : pNum === 3
              ? domainMeta.supportsGitHubProjects
                ? 'Backend & Data Systems'
                : 'Domain Synthesis & Analysis'
              : 'Capstone & Integration',
      subtitle: stepsInPhase.map((s) => s.skillName).slice(0, 3).join(', ') || 'Career Modules',
      completed,
      total: stepsInPhase.length,
      state:
        stepsInPhase.length > 0 && completed === stepsInPhase.length
          ? 'completed'
          : anyNeedsRev
            ? 'remedial'
            : allLocked
              ? 'locked'
              : anyInProg
                ? 'active'
                : 'locked',
    };
  });

  // Key dependency nodes for visual Skill Dependency Map
  const depNodes = career.requirements.slice(0, 6);
  const gapLookup = new Map(readiness.skillGaps.map((g) => [g.skillId, g]));

  return (
    <div className="space-y-6">
      {/* Greeting & Domain Context */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl text-[#24231F]">
            Good morning, {firstName}
          </h1>
          <p className="text-sm text-[#636159] mt-1">
            {domainMeta.name} · {profile.courseName}
            {profile.specialization ? ` (${profile.specialization})` : ''} ·{' '}
            {profile.semesterStage || profile.academicYear || 'Current Stage'} ·{' '}
            {profile.weeklyHours} hrs/week
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs text-[#77764B]">
          <span className="tabular-nums font-semibold">
            Streak: {gamification.streak.current} day{gamification.streak.current === 1 ? '' : 's'}
          </span>
          <span aria-hidden="true">·</span>
          <span className="tabular-nums font-semibold">
            {gamification.level.name} ({gamification.totalXp} XP)
          </span>
        </div>
      </div>

      {/* Career Goal Featured Banner */}
      <section className="rounded-2xl border border-[#E8E3D8] bg-[#FDFBF6] overflow-hidden grid grid-cols-1 lg:grid-cols-12">
        <div className="lg:col-span-8 p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-xs font-semibold uppercase tracking-wider text-[#77764B]">
                Your Career Goal
              </span>
              <button
                type="button"
                onClick={() => onNavigate('careers')}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#24231F] hover:text-[#77764B] cursor-pointer whitespace-nowrap"
              >
                <Edit3 className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Switch Career</span>
              </button>
            </div>
            <h2 className="font-serif text-2xl sm:text-3xl text-[#24231F] mt-1">
              {career.title}
            </h2>
          </div>

          <div className="mt-6">
            <div className="flex items-center justify-between text-sm mb-2">
              <span className="font-medium text-[#24231F]">Career Readiness</span>
              <span className="font-bold text-[#24231F] tabular-nums">
                {readiness.readinessScore}%
              </span>
            </div>
            <div className="h-3 w-full rounded-full bg-[#E8E3D8] overflow-hidden">
              <div
                className="h-full rounded-full bg-[#E8B52E] transition-all duration-300"
                style={{ width: `${Math.max(4, readiness.readinessScore)}%` }}
              />
            </div>
            <p className="text-xs text-[#636159] mt-2">
              Prototype readiness derived from Demonstrated &amp; Validated evidence only (excludes
              self-declared claims).
            </p>
          </div>
        </div>

        <div className="lg:col-span-4 min-h-[180px] relative border-t lg:border-t-0 lg:border-l border-[#E8E3D8]">
          <img
            src={NEXORA_ASSETS.workspaceLaptop}
            alt="Developer laptop coding workspace"
            className="h-full w-full object-cover"
            referrerPolicy="no-referrer"
          />
        </div>
      </section>

      {/* 4 KPI Strip + Next Learning Step */}
      <section className="grid grid-cols-2 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-2 rounded-xl border border-[#E8E3D8] bg-[#FDFBF6] p-4">
          <div className="text-2xl font-bold text-[#24231F] tabular-nums">{totalSkillsInPlan}</div>
          <div className="text-xs text-[#636159] mt-1">Career Skills</div>
        </div>
        <div className="lg:col-span-2 rounded-xl border border-[#E8E3D8] bg-[#FDFBF6] p-4">
          <div className="text-2xl font-bold text-[#77764B] tabular-nums">{verifiedCount}</div>
          <div className="text-xs text-[#636159] mt-1">Proven Evidence</div>
        </div>
        <div className="lg:col-span-2 rounded-xl border border-[#E8E3D8] bg-[#FDFBF6] p-4">
          <div className="text-2xl font-bold text-[#D77B43] tabular-nums">{declaredCount}</div>
          <div className="text-xs text-[#636159] mt-1">Declared Only</div>
        </div>
        <div className="lg:col-span-2 rounded-xl border border-[#E8E3D8] bg-[#FDFBF6] p-4">
          <div className="text-2xl font-bold text-[#24231F] tabular-nums">{missingCount}</div>
          <div className="text-xs text-[#636159] mt-1">Unassessed</div>
        </div>

        <div className="col-span-2 lg:col-span-4 rounded-xl border border-[#E8E3D8] bg-[#FDFBF6] p-4 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="text-xs font-semibold text-[#77764B]">Next Learning Step</div>
            <div className="text-base font-semibold text-[#24231F] truncate mt-0.5">
              {nextStep ? nextStep.skillName : 'All Steps Complete'}
            </div>
            <div className="text-xs text-[#636159] flex items-center gap-1.5 mt-1 tabular-nums">
              <Clock className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{nextStep ? `${nextStep.estimatedMinutes} mins` : 'Ready for review'}</span>
            </div>
          </div>
          {nextStep && (
            <button
              type="button"
              onClick={() => onStartAssessment(nextStep.skillId)}
              aria-label={`Assess ${nextStep.skillName}`}
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#E8B52E] text-[#24231F] hover:bg-[#dca923] transition-colors cursor-pointer"
            >
              <Play className="h-4 w-4 fill-current" />
            </button>
          )}
        </div>
      </section>

      {/* Entry Assessment Baseline Card (shown when onboarding entry test was completed) */}
      {entryAssessment && (
        <section className="rounded-2xl border border-[#E8E3D8] bg-[#FDFBF6] p-5 grid grid-cols-1 lg:grid-cols-12 gap-5 items-center">
          <div className="lg:col-span-5 space-y-1.5">
            <div className="text-xs font-semibold uppercase tracking-wider text-[#77764B]">
              Entry Diagnostic Baseline · {entryAssessment.courseName}
            </div>
            <div className="flex items-baseline gap-3">
              <span className="text-2xl font-bold text-[#24231F] tabular-nums">
                {entryAssessment.scorePercent}%
              </span>
              <span className="text-sm font-semibold text-[#D77B43]">
                {entryAssessment.skillLevel} Level
              </span>
            </div>
            <p className="text-xs text-[#24231F]/80 leading-relaxed">
              {entryAssessment.aiProfile.weakAreasSummary}
            </p>
          </div>
          <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {entryAssessment.subjectBreakdown.slice(0, 4).map((sb) => (
              <div key={sb.subject} className="rounded-xl border border-[#E8E3D8] bg-white px-3.5 py-2.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-[#24231F] truncate">{sb.subject}</span>
                  <span className="font-mono font-bold tabular-nums text-[#24231F]">
                    {sb.scorePercent}%
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 w-full rounded-full bg-[#E8E3D8] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[#E8B52E]"
                    style={{ width: `${Math.max(4, sb.scorePercent)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Middle Row: Skill Analysis (SkillProof) + Skill Dependency Map */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Skill Analysis Card */}
        <section className="lg:col-span-7 rounded-2xl border border-[#E8E3D8] bg-[#FDFBF6] p-6">
          <div className="flex items-center justify-between gap-4 mb-5">
            <div>
              <h2 className="text-lg font-semibold text-[#24231F]">
                Skill Analysis (SkillProof)
              </h2>
              <p className="text-xs text-[#636159]">
                Declared claims vs. demonstrated evidence for {career.title}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('skillproof')}
              className="inline-flex items-center gap-1 rounded-lg border border-[#E8E3D8] bg-white px-3 py-1.5 text-xs font-semibold text-[#24231F] hover:border-[#24231F]/40 whitespace-nowrap cursor-pointer"
            >
              <span>View Details</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
            <div className="md:col-span-8 overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#E8E3D8] text-[11px] font-semibold uppercase tracking-wider text-[#636159]">
                    <th className="py-2 pr-3">Skill</th>
                    <th className="py-2 px-2">Declared</th>
                    <th className="py-2 px-2">Evidence</th>
                    <th className="py-2 pl-2 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E8E3D8]/60 text-sm">
                  {readiness.skillGaps.slice(0, 5).map((item) => (
                    <tr key={item.skillId} className="h-11">
                      <td className="py-2 pr-3 font-medium text-[#24231F] whitespace-nowrap">
                        {item.skillName}
                      </td>
                      <td className="py-2 px-2 text-xs text-[#636159] whitespace-nowrap">
                        {item.declaredLevel}
                      </td>
                      <td className="py-2 px-2">
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-2 rounded-full bg-[#E8E3D8] overflow-hidden shrink-0">
                            <div
                              className="h-full rounded-full bg-[#E8B52E]"
                              style={{
                                width: `${Math.round(
                                  (item.demonstratedProficiency / item.requiredProficiency) * 100
                                )}%`,
                              }}
                            />
                          </div>
                          <span className="text-xs font-mono tabular-nums text-[#24231F]">
                            {item.demonstratedProficiency}/{item.requiredProficiency}
                          </span>
                        </div>
                      </td>
                      <td className="py-2 pl-2 text-right">
                        <button
                          type="button"
                          onClick={() => onStartAssessment(item.skillId)}
                          className="text-xs font-semibold text-[#77764B] hover:text-[#24231F] underline-offset-2 hover:underline whitespace-nowrap cursor-pointer"
                        >
                          {item.isUnassessed ? 'Prove' : 'Reassess'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="md:col-span-4 flex flex-col items-center">
              <div className="relative h-36 w-36">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={safeDonut}
                      innerRadius={44}
                      outerRadius={60}
                      paddingAngle={2}
                      dataKey="value"
                      stroke="none"
                    >
                      {safeDonut.map((entry) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-2xl font-bold text-[#24231F] tabular-nums">
                    {readiness.readinessScore}%
                  </span>
                  <span className="text-[11px] text-[#636159]">Skill Match</span>
                </div>
              </div>
              <div className="mt-2 space-y-1 text-xs text-[#636159]">
                <div>Proven: {verifiedCount}</div>
                <div>Declared Only: {declaredCount}</div>
                <div>Unassessed: {missingCount}</div>
              </div>
            </div>
          </div>
        </section>

        {/* Skill Dependency Map */}
        <section className="lg:col-span-5 rounded-2xl border border-[#E8E3D8] bg-[#FDFBF6] p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold text-[#24231F]">Skill Dependency Map</h2>
              <p className="text-xs text-[#636159]">
                Prerequisite-validated learning sequence
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {depNodes.map((node) => {
              const gap = gapLookup.get(node.skillId);
              const proven = gap && !gap.isUnassessed && gap.gap === 0;
              const step = roadmap.steps.find((s) => s.skillId === node.skillId && !s.isRemedial);
              const isLocked = step?.status === 'LOCKED';
              const needsRev = step?.status === 'NEEDS_REVISION';

              return (
                <div
                  key={node.skillId}
                  className={`flex items-center justify-between rounded-xl border px-4 py-2.5 ${
                    needsRev
                      ? 'border-[#D77B43] bg-[#D77B43]/10'
                      : proven
                        ? 'border-[#77764B]/40 bg-[#77764B]/10'
                        : isLocked
                          ? 'border-[#E8E3D8] bg-[#F8F6EF] opacity-75'
                          : 'border-[#E8B52E] bg-[#E8B52E]/10'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    {proven ? (
                      <CheckCircle2 className="h-4 w-4 text-[#77764B] shrink-0" aria-hidden="true" />
                    ) : isLocked ? (
                      <Lock className="h-4 w-4 text-[#636159] shrink-0" aria-hidden="true" />
                    ) : (
                      <Play className="h-4 w-4 text-[#D77B43] shrink-0" aria-hidden="true" />
                    )}
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-[#24231F] truncate">
                        {node.skillName}
                      </div>
                      <div className="text-[11px] text-[#636159] truncate">
                        {node.prerequisites.length > 0
                          ? `Requires: ${node.prerequisites.join(', ')}`
                          : 'Foundational entry skill'}
                      </div>
                    </div>
                  </div>
                  <span className="text-xs font-medium text-[#24231F]/80 whitespace-nowrap ml-2">
                    {proven ? 'Proven' : needsRev ? 'Revise' : isLocked ? 'Locked' : 'Unlocked'}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      {/* Bottom Row: Learning Roadmap Phases + AI Agent Orchestrator / Mentor */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <section className="lg:col-span-7 rounded-2xl border border-[#E8E3D8] bg-[#FDFBF6] p-6">
          <div className="flex items-center justify-between gap-4 mb-4">
            <div>
              <h2 className="text-lg font-semibold text-[#24231F]">Your Learning Roadmap</h2>
              <p className="text-xs text-[#636159]">
                Adaptive sequence: LEARN → PRACTICE → ASSESS → DEMONSTRATE
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('roadmap')}
              className="inline-flex items-center gap-1 rounded-lg border border-[#E8E3D8] bg-white px-3 py-1.5 text-xs font-semibold text-[#24231F] hover:border-[#24231F]/40 whitespace-nowrap cursor-pointer"
            >
              <span>View Full Roadmap</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="space-y-3">
            {phases.map((p) => (
              <div
                key={p.phaseNumber}
                className={`flex items-center justify-between rounded-xl border px-4 py-3 ${
                  p.state === 'active' || p.state === 'remedial'
                    ? 'border-[#E8B52E] bg-[#E8B52E]/15'
                    : 'border-[#E8E3D8] bg-white'
                }`}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-xs text-[#636159]">
                    <span className="font-semibold text-[#24231F] tabular-nums">
                      Phase 0{p.phaseNumber}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="truncate">{p.title}</span>
                  </div>
                  <div className="text-xs text-[#636159] mt-0.5 truncate">{p.subtitle}</div>
                </div>
                <div className="flex items-center gap-3 shrink-0 ml-3">
                  <span className="text-xs font-mono tabular-nums text-[#24231F]">
                    {p.completed}/{p.total}
                  </span>
                  {p.state === 'completed' ? (
                    <CheckCircle2 className="h-4 w-4 text-[#77764B]" />
                  ) : p.state === 'locked' ? (
                    <Lock className="h-4 w-4 text-[#636159]" />
                  ) : (
                    <Play className="h-4 w-4 text-[#D77B43]" />
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="lg:col-span-5 rounded-2xl border border-[#E8E3D8] bg-[#FDFBF6] p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold text-[#24231F]">
                AI Intelligence &amp; Mentor
              </h2>
              <Sparkles className="h-4 w-4 text-[#E8B52E]" aria-hidden="true" />
            </div>
            <p className="text-xs text-[#636159]">
              Latest coordinated orchestrator run across NEXORA’s five specialized agents:
            </p>
            <div className="mt-4 rounded-xl border border-[#E8E3D8] bg-white p-4">
              {agentRuns[0] ? (
                <>
                  <div className="text-xs font-semibold text-[#77764B]">
                    {agentRuns[0].agentsInvoked.join(' → ')}
                  </div>
                  <p className="text-sm text-[#24231F] mt-2 leading-relaxed">
                    {agentRuns[0].summary}
                  </p>
                </>
              ) : (
                <p className="text-sm text-[#636159]">
                  Complete an assessment or update your profile to trigger adaptive orchestration.
                </p>
              )}
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => onNavigate('mentor')}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#24231F] px-3 py-2.5 text-xs font-semibold text-[#F8F6EF] hover:bg-[#37352f] cursor-pointer"
            >
              <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Ask AI Mentor</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigate('play')}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#E8B52E] px-3 py-2.5 text-xs font-semibold text-[#24231F] hover:bg-[#dca923] cursor-pointer"
            >
              <span>Daily Brain Arena</span>
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
