import { useEffect, useState } from 'react';
import {
  Award,
  CheckCircle2,
  ExternalLink,
  Flame,
  Lock,
  ShieldCheck,
  Swords,
  Trophy,
  Zap,
} from 'lucide-react';
import { api, type DashboardPayload, type PlayStatePayload } from '../lib/api';

interface NexoraPlayViewProps {
  dashboard: DashboardPayload;
  onUpdated: (dashboard: DashboardPayload) => void;
}

export function NexoraPlayView({ dashboard, onUpdated }: NexoraPlayViewProps) {
  const [playState, setPlayState] = useState<PlayStatePayload | null>(null);
  const [tab, setTab] = useState<'arena' | 'quests' | 'boss' | 'ledger'>('arena');
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, string>>({});
  const [challengeFeedback, setChallengeFeedback] = useState<
    Record<string, { passed: boolean; message: string; xpAwarded: number }>
  >({});

  // Boss challenge modal/drawer state
  const [activeBossId, setActiveBossId] = useState<string | null>(null);
  const [bossSummary, setBossSummary] = useState('');
  const [bossRepo, setBossRepo] = useState('');
  const [bossChecks, setBossChecks] = useState<string[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refreshPlayState() {
    const data = await api.getPlayState();
    setPlayState(data);
  }

  useEffect(() => {
    refreshPlayState().catch(() => {});
  }, [dashboard.career.id]);

  const { gamification } = dashboard;

  async function handleSubmitDaily(challengeId: string) {
    const answer = selectedAnswers[challengeId];
    if (!answer) {
      setError('Please select an answer option first.');
      return;
    }
    setError(null);
    setBusyId(challengeId);
    try {
      const res = await api.submitDailyChallenge(challengeId, answer);
      setChallengeFeedback((prev) => ({
        ...prev,
        [challengeId]: {
          passed: res.passed,
          message: res.explanation,
          xpAwarded: res.xpResult.xpAmount,
        },
      }));
      onUpdated(res.dashboard);
      await refreshPlayState();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit challenge');
    } finally {
      setBusyId(null);
    }
  }

  async function handleCompleteQuest(questId: string) {
    setError(null);
    setBanner(null);
    setBusyId(questId);
    try {
      const res = await api.completeQuest(questId);
      onUpdated(res.dashboard);
      await refreshPlayState();
      setBanner(
        res.xpResult.awarded
          ? `Quest completed! +${res.xpResult.xpAmount} XP credited server-side.`
          : 'Quest already completed (duplicate XP prevented).'
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Cannot complete quest yet');
    } finally {
      setBusyId(null);
    }
  }

  async function handleSubmitBoss(e: React.FormEvent) {
    e.preventDefault();
    if (!activeBossId) return;
    setError(null);
    setBanner(null);
    setBusyId(activeBossId);
    try {
      const res = await api.submitBossChallenge(activeBossId, {
        summary: bossSummary,
        repoUrl: bossRepo,
        checkedCriteriaIds: bossChecks,
      });
      onUpdated(res.dashboard);
      await refreshPlayState();
      setBanner(
        `Boss Challenge submitted (${res.rubricCoverage}% rubric checklist). ${
          res.xpResult.awarded ? `+${res.xpResult.xpAmount} XP awarded.` : 'XP already claimed.'
        } ${res.executionDisclaimer}`
      );
      setActiveBossId(null);
      setBossSummary('');
      setBossRepo('');
      setBossChecks([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit Boss Challenge');
    } finally {
      setBusyId(null);
    }
  }

  const earnedSet = new Set(gamification.earnedAchievements.map((a) => a.achievement_id));
  const activeBoss = playState?.bossChallenges.find((b) => b.id === activeBossId);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[#77764B]">
            NEXORA PLAY — Learn. Play. Prove.
          </p>
          <h1 className="font-serif text-3xl text-[#24231F] mt-1">Gamified Practice Arena</h1>
        </div>

        <div className="flex flex-wrap items-center gap-1 rounded-lg border border-[#E8E3D8] bg-[#FDFBF6] p-1">
          {(
            [
              { id: 'arena', label: 'Daily Brain Arena' },
              { id: 'quests', label: 'Career Quests' },
              { id: 'boss', label: 'Boss Challenges' },
              { id: 'ledger', label: 'Achievements & XP' },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                tab === t.id ? 'bg-[#E8B52E] text-[#24231F]' : 'text-[#636159] hover:text-[#24231F]'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Level, XP, Streak & Gamification Integrity Header */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-5 rounded-2xl border border-[#E8E3D8] bg-[#FDFBF6] p-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-[#636159]">Engagement Level</div>
              <div className="text-xl font-bold text-[#24231F] mt-0.5">
                Lvl {gamification.level.level} · {gamification.level.name}
              </div>
            </div>
            <div className="text-right">
              <div className="text-lg font-mono font-bold text-[#24231F] tabular-nums">
                {gamification.totalXp} XP
              </div>
              <div className="text-[11px] text-[#636159] tabular-nums">
                {gamification.level.nextXp
                  ? `${gamification.xpToNext} XP to next tier`
                  : 'Max tier reached'}
              </div>
            </div>
          </div>
          <div className="mt-3 h-2.5 w-full rounded-full bg-[#E8E3D8] overflow-hidden">
            <div
              className="h-full rounded-full bg-[#E8B52E]"
              style={{ width: `${gamification.progressPercent}%` }}
            />
          </div>
        </div>

        <div className="lg:col-span-3 rounded-2xl border border-[#E8E3D8] bg-[#FDFBF6] p-5 flex items-center justify-between">
          <div>
            <div className="text-xs text-[#636159]">Learning Streak ({dashboard.profile.timezone})</div>
            <div className="text-2xl font-bold text-[#24231F] tabular-nums mt-0.5">
              {gamification.streak.current} Day{gamification.streak.current === 1 ? '' : 's'}
            </div>
            <div className="text-[11px] text-[#636159] tabular-nums">
              Longest: {gamification.streak.longest} days
            </div>
          </div>
          <Flame className="h-7 w-7 text-[#D77B43]" aria-hidden="true" />
        </div>

        <div className="lg:col-span-4 rounded-2xl border border-[#E8E3D8] bg-[#FDFBF6] p-5 flex items-start gap-3">
          <ShieldCheck className="h-5 w-5 text-[#77764B] shrink-0 mt-0.5" aria-hidden="true" />
          <div className="text-xs text-[#24231F]/80 leading-relaxed">
            <strong>Gamification Integrity:</strong> XP, levels, and streaks measure engagement
            only. They are server-calculated, duplicate-protected, and{' '}
            <strong>never</strong> directly increase SkillProof proficiency.
          </div>
        </div>
      </section>

      {banner && (
        <div className="rounded-xl border border-[#77764B]/40 bg-[#77764B]/10 px-4 py-3 text-sm text-[#24231F]">
          {banner}
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-[#D77B43] bg-[#D77B43]/10 px-4 py-3 text-sm text-[#24231F]">
          {error}
        </div>
      )}

      {/* TAB 1: Daily Brain Arena */}
      {tab === 'arena' && playState && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {playState.dailyChallenges.map((ch) => {
            const fb = challengeFeedback[ch.id];
            return (
              <article
                key={ch.id}
                className="rounded-2xl border border-[#E8E3D8] bg-[#FDFBF6] p-5 flex flex-col justify-between space-y-4"
              >
                <div>
                  <div className="flex items-center justify-between text-xs text-[#636159]">
                    <span>
                      {ch.category} · {ch.estimatedMinutes} mins
                    </span>
                    <span className="font-mono font-semibold text-[#77764B] tabular-nums">
                      {ch.solved ? 'Solved' : `+${ch.xpReward} XP`}
                    </span>
                  </div>
                  <h2 className="text-lg font-semibold text-[#24231F] mt-1">{ch.title}</h2>
                  <p className="text-sm text-[#24231F]/85 mt-2">{ch.question.prompt}</p>

                  {ch.question.codeSnippet && (
                    <pre className="mt-3 rounded-lg bg-[#24231F] p-3 text-xs font-mono text-[#F8F6EF] overflow-x-auto">
                      <code>{ch.question.codeSnippet}</code>
                    </pre>
                  )}

                  <div className="mt-3 space-y-1.5">
                    {(ch.question.options ?? []).map((opt) => (
                      <label
                        key={opt}
                        className={`flex items-start gap-2.5 rounded-lg border px-3 py-2 text-xs cursor-pointer ${
                          selectedAnswers[ch.id] === opt
                            ? 'border-[#24231F] bg-white font-medium'
                            : 'border-[#E8E3D8] bg-white/70'
                        }`}
                      >
                        <input
                          type="radio"
                          name={`daily-${ch.id}`}
                          value={opt}
                          checked={selectedAnswers[ch.id] === opt}
                          onChange={() =>
                            setSelectedAnswers((prev) => ({ ...prev, [ch.id]: opt }))
                          }
                          className="mt-0.5 accent-[#24231F]"
                        />
                        <span>{opt}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  {fb && (
                    <div
                      className={`rounded-lg border px-3 py-2 text-xs ${
                        fb.passed
                          ? 'border-[#77764B]/40 bg-[#77764B]/10 text-[#24231F]'
                          : 'border-[#D77B43] bg-[#D77B43]/10 text-[#24231F]'
                      }`}
                    >
                      <strong>
                        {fb.passed
                          ? fb.xpAwarded > 0
                            ? `Correct (+${fb.xpAwarded} XP)!`
                            : 'Correct (XP already earned for this challenge)!'
                          : 'Not quite:'}
                      </strong>{' '}
                      {fb.message}
                    </div>
                  )}

                  <button
                    type="button"
                    disabled={busyId === ch.id}
                    onClick={() => handleSubmitDaily(ch.id)}
                    className="w-full rounded-lg bg-[#24231F] py-2 text-xs font-semibold text-[#F8F6EF] hover:bg-[#37352f] disabled:opacity-60 cursor-pointer"
                  >
                    {busyId === ch.id ? 'Verifying…' : 'Check Answer'}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* TAB 2: Career Quests */}
      {tab === 'quests' && playState && (
        <div className="space-y-3">
          {playState.quests.map((q) => (
            <article
              key={q.id}
              className={`rounded-2xl border p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                q.completed
                  ? 'border-[#77764B]/40 bg-[#FDFBF6]'
                  : q.unlocked
                    ? 'border-[#E8B52E] bg-[#FDFBF6]'
                    : 'border-[#E8E3D8] bg-[#F8F6EF] opacity-80'
              }`}
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-xs text-[#636159]">
                  <span className="font-semibold text-[#24231F] tabular-nums">
                    Mission 0{q.orderIndex}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>Target: {q.targetSkillId.toUpperCase()}</span>
                  <span aria-hidden="true">·</span>
                  <span className="tabular-nums">{q.estimatedMinutes} mins</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono text-[#77764B] tabular-nums">+{q.xpReward} XP</span>
                </div>
                <h2 className="text-base font-semibold text-[#24231F]">{q.title}</h2>
                <p className="text-xs text-[#24231F]/80">{q.objective}</p>
                <div className="flex flex-wrap items-center gap-3 pt-1 text-xs">
                  <a
                    href={q.resourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 font-medium text-[#77764B] hover:text-[#24231F] underline"
                  >
                    <span>{q.resourceTitle}</span>
                    <ExternalLink className="h-3 w-3" />
                  </a>
                  {q.prerequisites.length > 0 && (
                    <span className="text-[#636159]">
                      Prerequisites: {q.prerequisites.join(', ')}
                    </span>
                  )}
                </div>
              </div>

              <div className="shrink-0">
                {q.completed ? (
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#77764B]">
                    <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                    <span>Completed</span>
                  </span>
                ) : !q.unlocked ? (
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#636159]">
                    <Lock className="h-4 w-4" aria-hidden="true" />
                    <span>Prerequisites Locked</span>
                  </span>
                ) : (
                  <button
                    type="button"
                    disabled={busyId === q.id}
                    onClick={() => handleCompleteQuest(q.id)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#E8B52E] px-4 py-2 text-xs font-semibold text-[#24231F] hover:bg-[#dca923] cursor-pointer whitespace-nowrap"
                  >
                    <Zap className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>{busyId === q.id ? 'Completing…' : 'Complete Mission'}</span>
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      {/* TAB 3: Boss Challenges */}
      {tab === 'boss' && playState && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {playState.bossChallenges.map((b) => (
            <article
              key={b.id}
              className="rounded-2xl border border-[#E8E3D8] bg-[#FDFBF6] p-6 flex flex-col justify-between space-y-4"
            >
              <div>
                <div className="flex items-center justify-between text-xs text-[#636159]">
                  <span>
                    {b.difficulty} · ~{b.estimatedHours} hrs
                  </span>
                  <span className="font-mono font-semibold text-[#D77B43] tabular-nums">
                    +{b.xpReward} XP
                  </span>
                </div>
                <h2 className="text-lg font-semibold text-[#24231F] mt-1 flex items-center gap-2">
                  <Swords className="h-4 w-4 text-[#D77B43]" aria-hidden="true" />
                  <span>{b.title}</span>
                </h2>
                <p className="text-xs text-[#24231F]/80 mt-2">{b.description}</p>
                <ul className="mt-3 list-disc pl-4 space-y-1 text-xs text-[#24231F]/75">
                  {b.requirements.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              </div>
              <button
                type="button"
                onClick={() => {
                  setActiveBossId(b.id);
                  setBossChecks([]);
                }}
                className="w-full rounded-lg bg-[#24231F] py-2 text-xs font-semibold text-[#F8F6EF] hover:bg-[#37352f] cursor-pointer"
              >
                Open Rubric &amp; Submit Build
              </button>
            </article>
          ))}
        </div>
      )}

      {/* Boss Submission Modal */}
      {activeBoss && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#24231F]/45 p-4"
          role="dialog"
          aria-modal="true"
        >
          <form
            onSubmit={handleSubmitBoss}
            className="w-full max-w-lg rounded-2xl border border-[#E8E3D8] bg-[#FDFBF6] p-6 space-y-4 shadow-xl"
          >
            <h3 className="font-serif text-2xl text-[#24231F]">{activeBoss.title}</h3>
            <p className="text-xs text-[#636159]">
              Verify which rubric requirements your project satisfies. Note: NEXORA does not execute
              arbitrary submitted code in a browser sandbox.
            </p>
            <div className="space-y-2">
              {activeBoss.rubricCriteria.map((c) => {
                const checked = bossChecks.includes(c.id);
                return (
                  <label
                    key={c.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-[#E8E3D8] bg-white px-3 py-2 text-xs cursor-pointer"
                  >
                    <span className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          setBossChecks((prev) =>
                            checked ? prev.filter((x) => x !== c.id) : [...prev, c.id]
                          )
                        }
                        className="accent-[#24231F]"
                      />
                      <span>{c.label}</span>
                    </span>
                    <span className="font-mono text-[#636159] tabular-nums">{c.weight}%</span>
                  </label>
                );
              })}
            </div>
            <div>
              <label htmlFor="boss-sum" className="block text-xs font-medium mb-1">
                Implementation &amp; Testing Summary
              </label>
              <textarea
                id="boss-sum"
                rows={3}
                required
                minLength={15}
                value={bossSummary}
                onChange={(e) => setBossSummary(e.target.value)}
                placeholder="Describe architecture decisions, edge cases handled, and tests run."
                className="w-full rounded-lg border border-[#E8E3D8] bg-white px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label htmlFor="boss-repo" className="block text-xs font-medium mb-1">
                GitHub URL (optional)
              </label>
              <input
                id="boss-repo"
                type="url"
                value={bossRepo}
                onChange={(e) => setBossRepo(e.target.value)}
                placeholder="https://github.com/username/project"
                className="w-full rounded-lg border border-[#E8E3D8] bg-white px-3 py-2 text-sm"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setActiveBossId(null)}
                className="rounded-lg border border-[#E8E3D8] px-4 py-2 text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busyId === activeBoss.id}
                className="rounded-lg bg-[#E8B52E] px-4 py-2 text-xs font-semibold text-[#24231F] cursor-pointer"
              >
                Submit Boss Challenge
              </button>
            </div>
          </form>
        </div>
      )}

      {/* TAB 4: Achievements, XP Ledger & Opt-in Leaderboard */}
      {tab === 'ledger' && playState && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <section className="lg:col-span-7 rounded-2xl border border-[#E8E3D8] bg-[#FDFBF6] p-6 space-y-4">
            <h2 className="text-lg font-semibold text-[#24231F] flex items-center gap-2">
              <Award className="h-5 w-5 text-[#E8B52E]" aria-hidden="true" />
              <span>Achievements</span>
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {playState.achievementsCatalog.map((ach) => {
                const earned = earnedSet.has(ach.id);
                return (
                  <div
                    key={ach.id}
                    className={`rounded-xl border p-4 ${
                      earned
                        ? 'border-[#E8B52E] bg-[#E8B52E]/15'
                        : 'border-[#E8E3D8] bg-white opacity-75'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs font-semibold">
                      <span>{ach.title}</span>
                      <span className={earned ? 'text-[#77764B]' : 'text-[#636159]'}>
                        {earned ? 'Earned' : 'Locked'}
                      </span>
                    </div>
                    <p className="text-xs text-[#24231F]/75 mt-1">{ach.description}</p>
                  </div>
                );
              })}
            </div>

            <div className="pt-4 border-t border-[#E8E3D8]">
              <h3 className="text-sm font-semibold text-[#24231F] mb-3">
                Server-Verified XP Transaction Ledger
              </h3>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {gamification.xpHistory.map((tx) => (
                  <div
                    key={tx.id}
                    className="flex items-center justify-between rounded-lg border border-[#E8E3D8] bg-white px-3 py-2 text-xs"
                  >
                    <span className="text-[#24231F]">{tx.description}</span>
                    <span className="font-mono font-semibold text-[#77764B] tabular-nums">
                      +{tx.xpAmount} XP
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="lg:col-span-5 rounded-2xl border border-[#E8E3D8] bg-[#FDFBF6] p-6 space-y-3 h-fit">
            <h2 className="text-lg font-semibold text-[#24231F] flex items-center gap-2">
              <Trophy className="h-5 w-5 text-[#D77B43]" aria-hidden="true" />
              <span>Opt-In Engagement Leaderboard</span>
            </h2>
            <p className="text-xs text-[#636159]">
              Privacy-first: shows engagement XP only for learners who opted in under Settings.
              Private skill records are never exposed.
            </p>
            <div className="space-y-2 pt-2">
              {playState.leaderboard.map((row) => (
                <div
                  key={`${row.rank}-${row.displayName}`}
                  className={`flex items-center justify-between rounded-xl border px-4 py-2.5 text-xs ${
                    row.isCurrentUser ? 'border-[#E8B52E] bg-[#E8B52E]/15 font-semibold' : 'border-[#E8E3D8] bg-white'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-[#636159] tabular-nums">#{row.rank}</span>
                    <span>
                      {row.displayName} {row.isCurrentUser ? '(You)' : ''}
                    </span>
                  </div>
                  <div className="font-mono tabular-nums text-[#24231F]">
                    {row.totalXp} XP · {row.levelName}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
