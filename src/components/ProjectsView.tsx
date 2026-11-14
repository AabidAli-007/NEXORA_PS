import { useState } from 'react';
import { ExternalLink, FileCheck2, FolderGit2, ShieldCheck } from 'lucide-react';
import { api, type DashboardPayload } from '../lib/api';
import { getDomainMeta } from '../data/domainsCatalog';

interface ProjectsViewProps {
  dashboard: DashboardPayload;
  onUpdated: (dashboard: DashboardPayload) => void;
}

export function ProjectsView({ dashboard, onUpdated }: ProjectsViewProps) {
  const domainMeta = dashboard.domainMeta ?? getDomainMeta(dashboard.profile.domainId);
  const supportsGitHub = domainMeta.supportsGitHubProjects;

  const defaultSkillId = dashboard.career.requirements[0]?.skillId || 'react';
  const [repoUrl, setRepoUrl] = useState('');
  const [targetSkillId, setTargetSkillId] = useState(defaultSkillId);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [artifactUrl, setArtifactUrl] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [resultMsg, setResultMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleAnalyzeGitHub(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResultMsg(null);
    setAnalyzing(true);
    try {
      const res = await api.analyzeGitHubRepo({
        repoUrl,
        targetSkillId,
        title: title.trim() || undefined,
      });
      onUpdated(res.dashboard);
      setResultMsg(
        `Analyzed ${res.canonicalUrl}. Detected stack: ${res.detectedStack.join(', ')}. ${res.notes}`
      );
      setRepoUrl('');
      setTitle('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'GitHub analysis failed');
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleSubmitAcademicArtifact(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResultMsg(null);
    setAnalyzing(true);
    try {
      const skillMeta = dashboard.career.requirements.find((r) => r.skillId === targetSkillId);
      const res = await api.submitSkillEvidence({
        skillId: targetSkillId,
        skillName: skillMeta?.skillName || targetSkillId,
        evidenceType: 'PROJECT',
        title: title.trim(),
        description: description.trim(),
        artifactUrl: artifactUrl.trim() || undefined,
      });
      onUpdated(res.dashboard);
      setResultMsg(
        `Submitted ${domainMeta.artifactLabel.toLowerCase()} artifact for ${skillMeta?.skillName || targetSkillId}.`
      );
      setTitle('');
      setDescription('');
      setArtifactUrl('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Submission failed');
    } finally {
      setAnalyzing(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-3xl text-[#24231F]">
          {supportsGitHub ? 'Projects & GitHub Intelligence' : domainMeta.artifactLabel}
        </h1>
        <p className="text-sm text-[#89877F] mt-1">
          {supportsGitHub
            ? 'Submit public GitHub repositories for safe metadata inspection. Private network URLs are blocked, repository code is never executed, and detected stack items serve as potential evidence only.'
            : `Document case analyses, clinical logs, financial audits, legal briefs, or research syntheses in ${domainMeta.name} (${dashboard.profile.courseName}) as applied learning artifacts.`}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {supportsGitHub ? (
          <form
            onSubmit={handleAnalyzeGitHub}
            className="lg:col-span-5 rounded-2xl border border-[#E8E3D8] bg-[#FDFBF6] p-6 space-y-4 h-fit"
          >
            <div className="flex items-center gap-2 text-base font-semibold text-[#24231F]">
              <FolderGit2 className="h-5 w-5 text-[#D77B43]" aria-hidden="true" />
              <span>Analyze Public GitHub Repository</span>
            </div>

            <div className="rounded-xl border border-[#E8E3D8] bg-white p-3 text-xs text-[#89877F] flex items-start gap-2">
              <ShieldCheck className="h-4 w-4 text-[#77764B] shrink-0 mt-0.5" aria-hidden="true" />
              <span>
                Enforces HTTPS github.com URLs, blocks localhost/private IP ranges, applies timeouts,
                and sanitizes README/metadata against prompt injection.
              </span>
            </div>

            {error && (
              <div className="rounded-lg border border-[#D77B43] bg-[#D77B43]/10 px-3 py-2 text-xs text-[#24231F]">
                {error}
              </div>
            )}
            {resultMsg && (
              <div className="rounded-lg border border-[#77764B]/40 bg-[#77764B]/10 px-3 py-2 text-xs text-[#24231F]">
                {resultMsg}
              </div>
            )}

            <div>
              <label htmlFor="gh-url" className="block text-xs font-semibold text-[#24231F] mb-1">
                Public GitHub URL
              </label>
              <input
                id="gh-url"
                type="url"
                required
                value={repoUrl}
                onChange={(e) => setRepoUrl(e.target.value)}
                placeholder="https://github.com/owner/repository"
                className="w-full rounded-lg border border-[#E8E3D8] bg-white px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label htmlFor="gh-skill" className="block text-xs font-semibold text-[#24231F] mb-1">
                Target Competency
              </label>
              <select
                id="gh-skill"
                value={targetSkillId}
                onChange={(e) => setTargetSkillId(e.target.value)}
                className="w-full rounded-lg border border-[#E8E3D8] bg-white px-3 py-2 text-sm"
              >
                {dashboard.career.requirements.map((r) => (
                  <option key={r.skillId} value={r.skillId}>
                    {r.skillName}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="gh-title" className="block text-xs font-semibold text-[#24231F] mb-1">
                Project Title (optional)
              </label>
              <input
                id="gh-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Full Stack Campus Portal"
                className="w-full rounded-lg border border-[#E8E3D8] bg-white px-3 py-2 text-sm"
              />
            </div>

            <button
              type="submit"
              disabled={analyzing}
              className="w-full rounded-lg bg-[#24231F] py-2.5 text-xs font-semibold text-[#F8F6EF] hover:bg-[#37352f] disabled:opacity-60 cursor-pointer"
            >
              {analyzing ? 'Inspecting Repository Safely…' : 'Analyze Repository & Audit Evidence'}
            </button>
          </form>
        ) : (
          <form
            onSubmit={handleSubmitAcademicArtifact}
            className="lg:col-span-5 rounded-2xl border border-[#E8E3D8] bg-[#FDFBF6] p-6 space-y-4 h-fit"
          >
            <div className="flex items-center gap-2 text-base font-semibold text-[#24231F]">
              <FileCheck2 className="h-5 w-5 text-[#D77B43]" aria-hidden="true" />
              <span>Log {domainMeta.name} Artifact</span>
            </div>

            {error && (
              <div className="rounded-lg border border-[#D77B43] bg-[#D77B43]/10 px-3 py-2 text-xs text-[#24231F]">
                {error}
              </div>
            )}
            {resultMsg && (
              <div className="rounded-lg border border-[#77764B]/40 bg-[#77764B]/10 px-3 py-2 text-xs text-[#24231F]">
                {resultMsg}
              </div>
            )}

            <div>
              <label htmlFor="art-skill" className="block text-xs font-semibold text-[#24231F] mb-1">
                Target Competency
              </label>
              <select
                id="art-skill"
                value={targetSkillId}
                onChange={(e) => setTargetSkillId(e.target.value)}
                className="w-full rounded-lg border border-[#E8E3D8] bg-white px-3 py-2 text-sm"
              >
                {dashboard.career.requirements.map((r) => (
                  <option key={r.skillId} value={r.skillId}>
                    {r.skillName}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="art-title" className="block text-xs font-semibold text-[#24231F] mb-1">
                Artifact Title
              </label>
              <input
                id="art-title"
                type="text"
                required
                minLength={3}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Case Analysis / Audit Workbook / Research Memo"
                className="w-full rounded-lg border border-[#E8E3D8] bg-white px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label htmlFor="art-desc" className="block text-xs font-semibold text-[#24231F] mb-1">
                Summary &amp; Methodology
              </label>
              <textarea
                id="art-desc"
                rows={3}
                required
                minLength={10}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe findings, methodology, and outcomes demonstrated…"
                className="w-full rounded-lg border border-[#E8E3D8] bg-white px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label htmlFor="art-url" className="block text-xs font-semibold text-[#24231F] mb-1">
                Reference / Document URL (optional)
              </label>
              <input
                id="art-url"
                type="url"
                value={artifactUrl}
                onChange={(e) => setArtifactUrl(e.target.value)}
                placeholder="https://…"
                className="w-full rounded-lg border border-[#E8E3D8] bg-white px-3 py-2 text-sm"
              />
            </div>

            <button
              type="submit"
              disabled={analyzing}
              className="w-full rounded-lg bg-[#24231F] py-2.5 text-xs font-semibold text-[#F8F6EF] hover:bg-[#37352f] disabled:opacity-60 cursor-pointer"
            >
              {analyzing ? 'Submitting Artifact…' : 'Submit & Audit Artifact'}
            </button>
          </form>
        )}

        <section className="lg:col-span-7 rounded-2xl border border-[#E8E3D8] bg-[#FDFBF6] p-6 space-y-4">
          <h2 className="text-lg font-semibold text-[#24231F]">
            {supportsGitHub ? 'Submitted Projects' : 'Submitted Academic & Portfolio Artifacts'}
          </h2>
          {dashboard.projects.length === 0 ? (
            <p className="text-sm text-[#89877F]">
              No submissions logged yet. Add an artifact on the left to record applied evidence in
              SkillProof.
            </p>
          ) : (
            <div className="space-y-3">
              {dashboard.projects.map((p) => (
                <article
                  key={p.id}
                  className="rounded-xl border border-[#E8E3D8] bg-white p-4 space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-base font-semibold text-[#24231F]">{p.title}</h3>
                    <span className="text-xs font-semibold text-[#77764B]">{p.reviewStatus}</span>
                  </div>
                  <p className="text-xs text-[#24231F]/80">{p.description}</p>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-[#89877F]">
                    <span>Competency: {p.skillId.toUpperCase()}</span>
                    {p.detectedStack.length > 0 && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>Focus: {p.detectedStack.join(', ')}</span>
                      </>
                    )}
                    {p.repoUrl && (
                      <>
                        <span aria-hidden="true">·</span>
                        <a
                          href={p.repoUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 font-medium text-[#24231F] hover:underline"
                        >
                          <span>Link</span>
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </>
                    )}
                  </div>
                  {p.reviewerNotes && (
                    <div className="text-[11px] text-[#89877F] border-t border-[#E8E3D8]/60 pt-2">
                      {p.reviewerNotes}
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
