import { useEffect, useState } from 'react';
import { BookOpen, CheckCircle2, FileCheck2, Plus, ShieldAlert } from 'lucide-react';
import { api, type DashboardPayload } from '../lib/api';
import type { AcademicMapping, LearnerSkill } from '../core/types';

interface SkillProofViewProps {
  dashboard: DashboardPayload;
  onUpdated: (dashboard: DashboardPayload) => void;
  onStartAssessment: (skillId: string) => void;
}

const KNOWN_SKILLS: { skillId: string; skillName: string; category: LearnerSkill['category'] }[] = [
  { skillId: 'html', skillName: 'HTML', category: 'Frontend' },
  { skillId: 'css', skillName: 'CSS', category: 'Frontend' },
  { skillId: 'javascript', skillName: 'JavaScript', category: 'Language' },
  { skillId: 'dom', skillName: 'DOM Manipulation', category: 'Frontend' },
  { skillId: 'react', skillName: 'React', category: 'Frontend' },
  { skillId: 'nodejs', skillName: 'Node.js', category: 'Backend' },
  { skillId: 'rest-apis', skillName: 'REST APIs', category: 'Backend' },
  { skillId: 'sql', skillName: 'SQL', category: 'Database' },
  { skillId: 'db-integration', skillName: 'Database Integration', category: 'Database' },
  { skillId: 'python', skillName: 'Python', category: 'Language' },
  { skillId: 'pandas', skillName: 'Data Cleaning & Pandas', category: 'Data & AI' },
  { skillId: 'statistics', skillName: 'Statistics & Probability', category: 'Data & AI' },
  { skillId: 'git', skillName: 'Git & Version Control', category: 'DevOps & Tools' },
];

export function SkillProofView({
  dashboard,
  onUpdated,
  onStartAssessment,
}: SkillProofViewProps) {
  const skillMap = new Map<string, { skillId: string; skillName: string; category: LearnerSkill['category'] }>();
  for (const req of dashboard.career.requirements) {
    skillMap.set(req.skillId, {
      skillId: req.skillId,
      skillName: req.skillName,
      category: req.category,
    });
  }
  for (const sk of dashboard.skills) {
    if (!skillMap.has(sk.skillId)) {
      skillMap.set(sk.skillId, {
        skillId: sk.skillId,
        skillName: sk.skillName,
        category: sk.category,
      });
    }
  }
  for (const ks of KNOWN_SKILLS) {
    if (!skillMap.has(ks.skillId)) {
      skillMap.set(ks.skillId, ks);
    }
  }
  const availableSkills = Array.from(skillMap.values());

  const [tab, setTab] = useState<'skills' | 'evidence' | 'mappings'>('skills');
  const [stateFilter, setStateFilter] = useState<string>('ALL');

  // Declare skill form
  const [newSkillId, setNewSkillId] = useState(
    dashboard.career.requirements[0]?.skillId || 'javascript'
  );
  const [declaredLevel, setDeclaredLevel] = useState<'Beginner' | 'Intermediate' | 'Advanced'>('Beginner');
  const [addingSkill, setAddingSkill] = useState(false);

  // Submit evidence form
  const [evSkillId, setEvSkillId] = useState(
    dashboard.career.requirements[0]?.skillId || 'python'
  );
  const [evType, setEvType] = useState<'PROJECT' | 'CREDENTIAL' | 'MENTOR_REVIEW'>('PROJECT');
  const [evTitle, setEvTitle] = useState('');
  const [evDesc, setEvDesc] = useState('');
  const [evUrl, setEvUrl] = useState('');
  const [submittingEv, setSubmittingEv] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Academic mappings
  const [mappings, setMappings] = useState<AcademicMapping[]>([]);
  const [mapSubject, setMapSubject] = useState('');
  const [mapOutcomes, setMapOutcomes] = useState('');
  const [mapComps, setMapComps] = useState('');
  const [mapSkills, setMapSkills] = useState('sql');
  const [mapSource, setMapSource] = useState('');

  useEffect(() => {
    api
      .getMappings()
      .then((res) => setMappings(res.mappings))
      .catch(() => {});
  }, []);

  const { skills, evidence, attempts, readiness } = dashboard;

  const declaredCount = skills.filter((s) => s.evidenceState === 'Declared').length;
  const demonstratedCount = skills.filter((s) => s.evidenceState === 'Demonstrated').length;
  const validatedCount = skills.filter((s) => s.evidenceState === 'Validated').length;
  const unassessedCount = readiness.unassessedCount;
  const needsReassess = skills.filter((s) => s.needsReassessment).length;

  const filteredSkills = skills.filter((s) =>
    stateFilter === 'ALL' ? true : s.evidenceState === stateFilter
  );

  async function handleDeclareSkill(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setFeedback(null);
    setAddingSkill(true);
    try {
      const meta = availableSkills.find((s) => s.skillId === newSkillId) ?? availableSkills[0];
      const res = await api.addDeclaredSkill({
        skillId: meta.skillId,
        skillName: meta.skillName,
        category: meta.category,
        declaredLevel,
      });
      onUpdated(res.dashboard);
      setFeedback(
        `${meta.skillName} added as Declared. Take a diagnostic assessment or submit project evidence to promote it to Demonstrated.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to declare skill');
    } finally {
      setAddingSkill(false);
    }
  }

  async function handleSubmitEvidence(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setFeedback(null);
    setSubmittingEv(true);
    try {
      const meta = availableSkills.find((s) => s.skillId === evSkillId) ?? {
        skillId: evSkillId,
        skillName: evSkillId.toUpperCase(),
      };
      const res = await api.submitSkillEvidence({
        skillId: meta.skillId,
        skillName: meta.skillName,
        evidenceType: evType,
        title: evTitle,
        description: evDesc,
        artifactUrl: evUrl,
      });
      onUpdated(res.dashboard);
      setEvTitle('');
      setEvDesc('');
      setEvUrl('');
      setFeedback(`Evidence logged and audited for ${meta.skillName}. Career readiness recalculated.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit evidence');
    } finally {
      setSubmittingEv(false);
    }
  }

  async function handleAddMapping(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const res = await api.createMapping({
        subjectName: mapSubject,
        learningOutcomes: mapOutcomes.split(',').map((s) => s.trim()).filter(Boolean),
        technicalCompetencies: mapComps.split(',').map((s) => s.trim()).filter(Boolean),
        industrySkillIds: mapSkills.split(',').map((s) => s.trim()).filter(Boolean),
        careerIds: [dashboard.career.id],
        source: mapSource,
      });
      setMappings(res.mappings);
      setMapSubject('');
      setMapOutcomes('');
      setMapComps('');
      setMapSource('');
      setFeedback('Academic mapping saved with Pending Review status.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save mapping');
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl text-[#24231F]">SkillProof Intelligence</h1>
          <p className="text-sm text-[#636159] mt-1">
            Evidence-backed 0–5 competency ledger. Course completion, XP, and streaks never modify
            proficiency directly.
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-[#E8E3D8] bg-[#FDFBF6] p-1">
          {(
            [
              { id: 'skills', label: 'Competency Matrix' },
              { id: 'evidence', label: 'Evidence & Assessments' },
              { id: 'mappings', label: 'Academic Mapping' },
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

      {/* Summary Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="rounded-xl border border-[#E8E3D8] bg-[#FDFBF6] p-4">
          <div className="text-xl font-bold tabular-nums">{declaredCount}</div>
          <div className="text-xs text-[#636159]">Declared Only</div>
        </div>
        <div className="rounded-xl border border-[#E8E3D8] bg-[#FDFBF6] p-4">
          <div className="text-xl font-bold text-[#77764B] tabular-nums">{demonstratedCount}</div>
          <div className="text-xs text-[#636159]">Demonstrated</div>
        </div>
        <div className="rounded-xl border border-[#E8E3D8] bg-[#FDFBF6] p-4">
          <div className="text-xl font-bold text-[#24231F] tabular-nums">{validatedCount}</div>
          <div className="text-xs text-[#636159]">Validated</div>
        </div>
        <div className="rounded-xl border border-[#E8E3D8] bg-[#FDFBF6] p-4">
          <div className="text-xl font-bold text-[#636159] tabular-nums">{unassessedCount}</div>
          <div className="text-xs text-[#636159]">Unassessed Career Skills</div>
        </div>
        <div className="rounded-xl border border-[#E8E3D8] bg-[#FDFBF6] p-4">
          <div className="text-xl font-bold text-[#D77B43] tabular-nums">{needsReassess}</div>
          <div className="text-xs text-[#636159]">Needs Reassessment</div>
        </div>
      </div>

      {feedback && (
        <div className="rounded-xl border border-[#77764B]/40 bg-[#77764B]/10 px-4 py-3 text-sm text-[#24231F]">
          {feedback}
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-[#D77B43] bg-[#D77B43]/10 px-4 py-3 text-sm text-[#24231F]">
          {error}
        </div>
      )}

      {tab === 'skills' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8 rounded-2xl border border-[#E8E3D8] bg-[#FDFBF6] p-6">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <h2 className="text-lg font-semibold text-[#24231F]">Tracked Competencies</h2>
              <div className="flex items-center gap-1 rounded-lg border border-[#E8E3D8] bg-white p-1">
                {['ALL', 'Declared', 'Demonstrated', 'Validated'].map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setStateFilter(st)}
                    className={`rounded px-2.5 py-1 text-xs font-medium cursor-pointer ${
                      stateFilter === st ? 'bg-[#F4E3B2] text-[#24231F] font-semibold' : 'text-[#636159]'
                    }`}
                  >
                    {st === 'ALL' ? 'All' : st}
                  </button>
                ))}
              </div>
            </div>

            {filteredSkills.length === 0 ? (
              <div className="py-10 text-center text-sm text-[#636159]">
                No skills match this filter yet. Declare a skill or take a diagnostic assessment.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-[#E8E3D8] text-[11px] font-semibold uppercase tracking-wider text-[#636159]">
                      <th className="py-2 pr-3">Skill</th>
                      <th className="py-2 px-2">Category</th>
                      <th className="py-2 px-2">Evidence State</th>
                      <th className="py-2 px-2">Proficiency</th>
                      <th className="py-2 pl-2 text-right">Diagnostic</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E8E3D8]/70 text-sm">
                    {filteredSkills.map((sk) => (
                      <tr key={sk.id} className="h-12">
                        <td className="py-2 pr-3 font-semibold text-[#24231F]">
                          {sk.skillName}
                          {sk.needsReassessment && (
                            <span className="ml-2 text-[11px] font-medium text-[#D77B43]">
                              (Reassess)
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-2 text-xs text-[#636159]">{sk.category}</td>
                        <td className="py-2 px-2 text-xs font-semibold">
                          <span
                            className={
                              sk.evidenceState === 'Validated' || sk.evidenceState === 'Demonstrated'
                                ? 'text-[#77764B]'
                                : sk.evidenceState === 'Declared'
                                  ? 'text-[#D77B43]'
                                  : 'text-[#636159]'
                            }
                          >
                            {sk.evidenceState}
                          </span>
                        </td>
                        <td className="py-2 px-2 font-mono text-xs tabular-nums">
                          {sk.proficiency}/5
                        </td>
                        <td className="py-2 pl-2 text-right">
                          <button
                            type="button"
                            onClick={() => onStartAssessment(sk.skillId)}
                            className="rounded-lg border border-[#E8E3D8] bg-white px-3 py-1 text-xs font-semibold text-[#24231F] hover:bg-[#E8B52E]/20 cursor-pointer whitespace-nowrap"
                          >
                            Assess Skill
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {readiness.skillGaps.some((g) => g.evidenceState === 'Unassessed') && (
              <div className="mt-6 border-t border-[#E8E3D8] pt-4">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[#636159] mb-2">
                  Unassessed {dashboard.career.title} Requirements
                </h3>
                <div className="flex flex-wrap gap-2">
                  {readiness.skillGaps
                    .filter((g) => g.evidenceState === 'Unassessed')
                    .map((g) => (
                      <button
                        key={g.skillId}
                        type="button"
                        onClick={() => onStartAssessment(g.skillId)}
                        className="rounded-lg border border-[#E8E3D8] bg-white px-3 py-1.5 text-xs font-medium text-[#24231F] hover:border-[#24231F] cursor-pointer"
                      >
                        + Assess {g.skillName}
                      </button>
                    ))}
                </div>
              </div>
            )}
          </div>

          <div className="lg:col-span-4 space-y-6">
            <form
              onSubmit={handleDeclareSkill}
              className="rounded-2xl border border-[#E8E3D8] bg-[#FDFBF6] p-5 space-y-3"
            >
              <h2 className="text-base font-semibold text-[#24231F] flex items-center gap-2">
                <Plus className="h-4 w-4 text-[#77764B]" aria-hidden="true" />
                <span>Declare a Skill</span>
              </h2>
              <p className="text-xs text-[#636159]">
                Self-declared skills are logged as Declared (0/5 evidence) until assessed.
              </p>
              <div>
                <label htmlFor="sp-add-skill" className="block text-xs font-medium mb-1">
                  Skill
                </label>
                <select
                  id="sp-add-skill"
                  value={newSkillId}
                  onChange={(e) => setNewSkillId(e.target.value)}
                  className="w-full rounded-lg border border-[#E8E3D8] bg-white px-3 py-2 text-sm"
                >
                  {availableSkills.map((s) => (
                    <option key={s.skillId} value={s.skillId}>
                      {s.skillName} ({s.category})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="sp-add-lvl" className="block text-xs font-medium mb-1">
                  Self-Reported Level
                </label>
                <select
                  id="sp-add-lvl"
                  value={declaredLevel}
                  onChange={(e) =>
                    setDeclaredLevel(e.target.value as 'Beginner' | 'Intermediate' | 'Advanced')
                  }
                  className="w-full rounded-lg border border-[#E8E3D8] bg-white px-3 py-2 text-sm"
                >
                  <option value="Beginner">Beginner</option>
                  <option value="Intermediate">Intermediate</option>
                  <option value="Advanced">Advanced</option>
                </select>
              </div>
              <button
                type="submit"
                disabled={addingSkill}
                className="w-full rounded-lg bg-[#24231F] py-2 text-xs font-semibold text-[#F8F6EF] cursor-pointer"
              >
                {addingSkill ? 'Saving…' : 'Add Declared Skill'}
              </button>
            </form>

            <form
              onSubmit={handleSubmitEvidence}
              className="rounded-2xl border border-[#E8E3D8] bg-[#FDFBF6] p-5 space-y-3"
            >
              <h2 className="text-base font-semibold text-[#24231F] flex items-center gap-2">
                <FileCheck2 className="h-4 w-4 text-[#D77B43]" aria-hidden="true" />
                <span>Submit Supporting Evidence</span>
              </h2>
              <div>
                <label htmlFor="ev-skill" className="block text-xs font-medium mb-1">
                  Skill
                </label>
                <select
                  id="ev-skill"
                  value={evSkillId}
                  onChange={(e) => setEvSkillId(e.target.value)}
                  className="w-full rounded-lg border border-[#E8E3D8] bg-white px-3 py-2 text-sm"
                >
                  {availableSkills.map((s) => (
                    <option key={s.skillId} value={s.skillId}>
                      {s.skillName}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="ev-type" className="block text-xs font-medium mb-1">
                  Evidence Type
                </label>
                <select
                  id="ev-type"
                  value={evType}
                  onChange={(e) =>
                    setEvType(e.target.value as 'PROJECT' | 'CREDENTIAL' | 'MENTOR_REVIEW')
                  }
                  className="w-full rounded-lg border border-[#E8E3D8] bg-white px-3 py-2 text-sm"
                >
                  <option value="PROJECT">Practical Project (→ Demonstrated)</option>
                  <option value="CREDENTIAL">Verified Credential (→ Validated)</option>
                  <option value="MENTOR_REVIEW">Authorized Mentor Review (→ Validated)</option>
                </select>
              </div>
              <div>
                <label htmlFor="ev-title" className="block text-xs font-medium mb-1">
                  Artifact Title
                </label>
                <input
                  id="ev-title"
                  type="text"
                  required
                  value={evTitle}
                  onChange={(e) => setEvTitle(e.target.value)}
                  placeholder="e.g., Inventory SQL Schema"
                  className="w-full rounded-lg border border-[#E8E3D8] bg-white px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label htmlFor="ev-desc" className="block text-xs font-medium mb-1">
                  Evidence Description
                </label>
                <textarea
                  id="ev-desc"
                  rows={2}
                  required
                  value={evDesc}
                  onChange={(e) => setEvDesc(e.target.value)}
                  placeholder="Describe what you built, tested, or verified."
                  className="w-full rounded-lg border border-[#E8E3D8] bg-white px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label htmlFor="ev-url" className="block text-xs font-medium mb-1">
                  Artifact URL (optional)
                </label>
                <input
                  id="ev-url"
                  type="url"
                  value={evUrl}
                  onChange={(e) => setEvUrl(e.target.value)}
                  placeholder="https://github.com/..."
                  className="w-full rounded-lg border border-[#E8E3D8] bg-white px-3 py-2 text-sm"
                />
              </div>
              <button
                type="submit"
                disabled={submittingEv}
                className="w-full rounded-lg bg-[#E8B52E] py-2 text-xs font-semibold text-[#24231F] cursor-pointer"
              >
                {submittingEv ? 'Auditing Evidence…' : 'Submit & Audit Evidence'}
              </button>
            </form>
          </div>
        </div>
      )}

      {tab === 'evidence' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <section className="rounded-2xl border border-[#E8E3D8] bg-[#FDFBF6] p-6">
            <h2 className="text-lg font-semibold text-[#24231F] mb-4">Evidence History</h2>
            {evidence.length === 0 ? (
              <p className="text-sm text-[#636159]">No evidence records yet.</p>
            ) : (
              <div className="space-y-3">
                {evidence.map((ev) => (
                  <div key={ev.id} className="rounded-xl border border-[#E8E3D8] bg-white p-4">
                    <div className="flex items-center justify-between text-xs text-[#636159]">
                      <span>
                        {ev.evidenceType} · {ev.skillId.toUpperCase()}
                      </span>
                      <span className="font-semibold text-[#77764B]">{ev.resultingState}</span>
                    </div>
                    <div className="text-sm font-semibold text-[#24231F] mt-1">{ev.title}</div>
                    <p className="text-xs text-[#24231F]/75 mt-1">{ev.description}</p>
                    <div className="text-[11px] text-[#636159] mt-2">
                      Reviewed by: {ev.verifiedBy} · {new Date(ev.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-[#E8E3D8] bg-[#FDFBF6] p-6">
            <h2 className="text-lg font-semibold text-[#24231F] mb-4">Assessment History</h2>
            {attempts.length === 0 ? (
              <p className="text-sm text-[#636159]">
                No diagnostic attempts yet. Select any skill to take an assessment.
              </p>
            ) : (
              <div className="space-y-3">
                {attempts.map((a) => (
                  <div key={a.id} className="rounded-xl border border-[#E8E3D8] bg-white p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-[#24231F]">{a.skillName}</span>
                      <span className="font-mono text-sm font-bold tabular-nums text-[#24231F]">
                        {a.scorePercent}%
                      </span>
                    </div>
                    <div className="text-xs text-[#636159] mt-1">
                      Decision: {a.adaptiveDecision.replace('_', ' ')} ·{' '}
                      <span className="tabular-nums">
                        {a.correctCount}/{a.totalCount}
                      </span>
                    </div>
                    {a.weakConcepts.length > 0 && (
                      <div className="text-xs text-[#D77B43] mt-1">
                        Weak concepts: {a.weakConcepts.join(', ')}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {tab === 'mappings' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8 space-y-4">
            <div className="rounded-xl border border-[#E8E3D8] bg-[#FDFBF6] p-4 flex items-start gap-3 text-xs text-[#24231F]/80">
              <ShieldAlert className="h-4 w-4 text-[#D77B43] shrink-0 mt-0.5" aria-hidden="true" />
              <span>
                Studying an academic subject explains how syllabus outcomes map to industry skills,
                but does <strong>not</strong> automatically prove mastery without diagnostic or
                project evidence.
              </span>
            </div>

            {mappings.map((m) => (
              <article
                key={m.id}
                className="rounded-2xl border border-[#E8E3D8] bg-[#FDFBF6] p-5 space-y-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-base font-semibold text-[#24231F] flex items-center gap-2">
                    <BookOpen className="h-4 w-4 text-[#77764B]" aria-hidden="true" />
                    <span>{m.subjectName}</span>
                  </h3>
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#77764B]">
                    <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>{m.reviewStatus}</span>
                  </span>
                </div>
                <div className="text-xs text-[#636159]">Source: {m.source}</div>
                <div className="pt-2 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <div className="font-semibold text-[#24231F]">Learning Outcomes</div>
                    <ul className="list-disc pl-4 mt-1 space-y-0.5 text-[#24231F]/80">
                      {m.learningOutcomes.map((o) => (
                        <li key={o}>{o}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <div className="font-semibold text-[#24231F]">
                      Technical Competencies → Industry Skills
                    </div>
                    <p className="mt-1 text-[#24231F]/80">{m.technicalCompetencies.join(' · ')}</p>
                    <p className="mt-1 font-mono text-[#77764B]">
                      Maps to: {m.industrySkillIds.join(', ')}
                    </p>
                  </div>
                </div>
              </article>
            ))}
          </div>

          <form
            onSubmit={handleAddMapping}
            className="lg:col-span-4 rounded-2xl border border-[#E8E3D8] bg-[#FDFBF6] p-5 space-y-3 h-fit"
          >
            <h2 className="text-base font-semibold text-[#24231F]">Add Missing Syllabus Mapping</h2>
            <p className="text-xs text-[#636159]">
              Missing syllabus mappings require a verifiable curriculum source and enter Pending
              Review.
            </p>
            <div>
              <label htmlFor="mp-sub" className="block text-xs font-medium mb-1">
                Academic Subject
              </label>
              <input
                id="mp-sub"
                type="text"
                required
                value={mapSubject}
                onChange={(e) => setMapSubject(e.target.value)}
                placeholder="e.g., Operating Systems"
                className="w-full rounded-lg border border-[#E8E3D8] bg-white px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label htmlFor="mp-out" className="block text-xs font-medium mb-1">
                Learning Outcomes (comma separated)
              </label>
              <input
                id="mp-out"
                type="text"
                required
                value={mapOutcomes}
                onChange={(e) => setMapOutcomes(e.target.value)}
                placeholder="Process concurrency, Memory isolation"
                className="w-full rounded-lg border border-[#E8E3D8] bg-white px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label htmlFor="mp-comp" className="block text-xs font-medium mb-1">
                Technical Competencies (comma separated)
              </label>
              <input
                id="mp-comp"
                type="text"
                required
                value={mapComps}
                onChange={(e) => setMapComps(e.target.value)}
                placeholder="Threads, Async I/O, Linux CLI"
                className="w-full rounded-lg border border-[#E8E3D8] bg-white px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label htmlFor="mp-sk" className="block text-xs font-medium mb-1">
                Industry Skill IDs
              </label>
              <input
                id="mp-sk"
                type="text"
                required
                value={mapSkills}
                onChange={(e) => setMapSkills(e.target.value)}
                placeholder="nodejs, python"
                className="w-full rounded-lg border border-[#E8E3D8] bg-white px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label htmlFor="mp-src" className="block text-xs font-medium mb-1">
                Curriculum Source
              </label>
              <input
                id="mp-src"
                type="text"
                required
                value={mapSource}
                onChange={(e) => setMapSource(e.target.value)}
                placeholder="e.g., University CS302 Syllabus 2026"
                className="w-full rounded-lg border border-[#E8E3D8] bg-white px-3 py-2 text-sm"
              />
            </div>
            <button
              type="submit"
              className="w-full rounded-lg bg-[#24231F] py-2 text-xs font-semibold text-[#F8F6EF] cursor-pointer"
            >
              Submit Mapping
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
