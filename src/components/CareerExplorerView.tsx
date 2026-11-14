import { useState } from 'react';
import { ArrowRight, CheckCircle2, RefreshCw } from 'lucide-react';
import { api, type DashboardPayload } from '../lib/api';
import { CAREERS_CATALOG } from '../data/catalog';
import { calculateCareerReadiness } from '../core/readiness';
import type { CareerProfile } from '../core/types';
import { NEXORA_ASSETS } from '../lib/assets';

interface CareerExplorerViewProps {
  dashboard: DashboardPayload;
  onUpdated: (dashboard: DashboardPayload) => void;
}

const THUMB_MAP: Record<CareerProfile['thumbnailKey'], string> = {
  fullstack: NEXORA_ASSETS.careerFullstack,
  data: NEXORA_ASSETS.careerData,
  aiml: NEXORA_ASSETS.careerAiml,
};

export function CareerExplorerView({ dashboard, onUpdated }: CareerExplorerViewProps) {
  const [filter, setFilter] = useState<'All' | 'My Domain' | 'Tech & Data' | 'Clinical & Bio' | 'Business & Law' | 'Humanities'>('All');
  const [selectedCareerId, setSelectedCareerId] = useState<string>(dashboard.career.id);
  const [switching, setSwitching] = useState(false);
  const [switchBanner, setSwitchBanner] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const filteredCareers = CAREERS_CATALOG.filter((c) => {
    if (filter === 'All') return true;
    if (filter === 'My Domain') {
      return c.domainId === dashboard.profile.domainId || c.id === dashboard.career.id;
    }
    if (filter === 'Tech & Data') {
      return ['Tech', 'Data', 'Security', 'Cloud', 'Engineering'].includes(c.category);
    }
    if (filter === 'Clinical & Bio') {
      return c.category === 'Medical';
    }
    if (filter === 'Business & Law') {
      return ['Commerce', 'Management', 'Law'].includes(c.category);
    }
    if (filter === 'Humanities') {
      return ['Arts', 'General'].includes(c.category);
    }
    return true;
  });

  const inspectedCareer =
    CAREERS_CATALOG.find((c) => c.id === selectedCareerId) ?? dashboard.career;

  const previewReadiness = calculateCareerReadiness(
    inspectedCareer,
    dashboard.skills,
    dashboard.career.id
  );

  async function handleSwitchCareer(careerId: string) {
    setError(null);
    setSwitchBanner(null);
    setSwitching(true);
    try {
      const res = await api.selectCareer(careerId);
      onUpdated(res.dashboard);
      const transferCount = res.dashboard.readiness.transferableSkills.length;
      setSwitchBanner(
        `Career switched to ${res.dashboard.career.title}. Preserved ${transferCount} transferable demonstrated skills and rebuilt your roadmap.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to switch career');
    } finally {
      setSwitching(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl text-[#24231F]">Career Explorer</h1>
          <p className="text-sm text-[#636159] mt-1">
            Structured industry profiles with weighted requirements. Switch goals anytime without
            losing verified skill evidence.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1 rounded-lg border border-[#E8E3D8] bg-[#FDFBF6] p-1">
          {(['All', 'My Domain', 'Tech & Data', 'Clinical & Bio', 'Business & Law', 'Humanities'] as const).map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setFilter(cat)}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                filter === cat
                  ? 'bg-[#E8B52E] text-[#24231F]'
                  : 'text-[#636159] hover:text-[#24231F]'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {switchBanner && (
        <div className="rounded-xl border border-[#77764B]/40 bg-[#77764B]/10 px-4 py-3 text-sm text-[#24231F]">
          {switchBanner}
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-[#D77B43] bg-[#D77B43]/10 px-4 py-3 text-sm text-[#24231F]">
          {error}
        </div>
      )}

      {/* Career Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {filteredCareers.map((career) => {
          const isCurrent = career.id === dashboard.career.id;
          const isSelected = career.id === inspectedCareer.id;
          const sim = calculateCareerReadiness(career, dashboard.skills, dashboard.career.id);

          return (
            <article
              key={career.id}
              className={`rounded-2xl border bg-[#FDFBF6] overflow-hidden flex flex-col justify-between transition-colors ${
                isSelected ? 'border-[#24231F]' : 'border-[#E8E3D8]'
              }`}
            >
              <div>
                <div className="h-36 w-full overflow-hidden border-b border-[#E8E3D8] bg-[#F8F6EF]">
                  <img
                    src={THUMB_MAP[career.thumbnailKey]}
                    alt={`${career.title} editorial illustration`}
                    className="h-full w-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                </div>
                <div className="p-5">
                  <div className="flex items-center justify-between gap-2 text-xs text-[#636159]">
                    <span>
                      {career.category} · {career.demandLabel}
                    </span>
                    {isCurrent && (
                      <span className="font-semibold text-[#77764B]">Active Goal</span>
                    )}
                  </div>
                  <h2 className="text-lg font-semibold text-[#24231F] mt-1">{career.title}</h2>
                  <p className="text-xs text-[#24231F]/75 mt-1.5 leading-relaxed">
                    {career.summary}
                  </p>
                </div>
              </div>

              <div className="px-5 pb-5 pt-2 flex items-center justify-between gap-3 border-t border-[#E8E3D8]/60">
                <div className="text-xs text-[#636159]">
                  Est. Readiness:{' '}
                  <strong className="text-[#24231F] font-mono tabular-nums">
                    {sim.readinessScore}%
                  </strong>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedCareerId(career.id)}
                    className="rounded-lg border border-[#E8E3D8] bg-white px-3 py-1.5 text-xs font-semibold text-[#24231F] hover:border-[#24231F] cursor-pointer"
                  >
                    Inspect
                  </button>
                  {!isCurrent && (
                    <button
                      type="button"
                      disabled={switching}
                      onClick={() => handleSwitchCareer(career.id)}
                      className="inline-flex items-center gap-1 rounded-lg bg-[#E8B52E] px-3 py-1.5 text-xs font-semibold text-[#24231F] hover:bg-[#dca923] cursor-pointer"
                    >
                      <RefreshCw className="h-3 w-3" aria-hidden="true" />
                      <span>Switch</span>
                    </button>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {/* Selected Career Requirement & Transferable Skills Inspector */}
      <section className="rounded-2xl border border-[#E8E3D8] bg-[#FDFBF6] p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#E8E3D8] pb-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-[#77764B]">
              Structured Career Profile Inspector
            </div>
            <h2 className="font-serif text-2xl text-[#24231F] mt-0.5">{inspectedCareer.title}</h2>
          </div>
          {inspectedCareer.id !== dashboard.career.id ? (
            <button
              type="button"
              disabled={switching}
              onClick={() => handleSwitchCareer(inspectedCareer.id)}
              className="inline-flex items-center gap-2 rounded-lg bg-[#24231F] px-4 py-2 text-xs font-semibold text-[#F8F6EF] hover:bg-[#37352f] cursor-pointer whitespace-nowrap"
            >
              <span>
                {switching ? 'Switching & Rebuilding Roadmap…' : `Switch Goal to ${inspectedCareer.title}`}
              </span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#77764B]">
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              <span>Current Active Target Career</span>
            </span>
          )}
        </div>

        {previewReadiness.transferableSkills.length > 0 && (
          <div className="mt-4 rounded-xl border border-[#77764B]/30 bg-[#77764B]/10 p-4 text-xs text-[#24231F]">
            <strong>Transferable Competencies Preserved:</strong>{' '}
            {previewReadiness.transferableSkills
              .map((t) => `${t.skillName} (${t.demonstratedProficiency}/5)`)
              .join(', ')}
            . Switching to {inspectedCareer.title} preserves all assessment and project evidence.
          </div>
        )}

        <div className="mt-5 overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#E8E3D8] text-[11px] font-semibold uppercase tracking-wider text-[#636159]">
                <th className="py-2 pr-3">Required Skill</th>
                <th className="py-2 px-2">Target (R)</th>
                <th className="py-2 px-2">Weight (W)</th>
                <th className="py-2 px-2">Your Evidence (D)</th>
                <th className="py-2 px-2">Prerequisites</th>
                <th className="py-2 pl-2">Practical Expectation</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E8E3D8]/60 text-xs">
              {previewReadiness.skillGaps.map((g) => {
                const req = inspectedCareer.requirements.find((r) => r.skillId === g.skillId);
                return (
                  <tr key={g.skillId} className="h-11">
                    <td className="py-2 pr-3 font-semibold text-[#24231F] whitespace-nowrap">
                      {g.skillName}
                    </td>
                    <td className="py-2 px-2 font-mono tabular-nums">{g.requiredProficiency}/5</td>
                    <td className="py-2 px-2 font-mono tabular-nums">{g.weight.toFixed(1)}</td>
                    <td className="py-2 px-2 font-mono tabular-nums">
                      {g.demonstratedProficiency}/5 ({g.evidenceState})
                    </td>
                    <td className="py-2 px-2 text-[#636159]">
                      {req?.prerequisites.length ? req.prerequisites.join(', ') : 'None'}
                    </td>
                    <td className="py-2 pl-2 text-[#24231F]/80">{req?.practicalExpectation}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
