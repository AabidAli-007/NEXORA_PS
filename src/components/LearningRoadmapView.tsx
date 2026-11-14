import { useState } from 'react';
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ExternalLink,
  Lock,
  Play,
  RotateCcw,
} from 'lucide-react';
import { api, type DashboardPayload } from '../lib/api';
import type { RoadmapStep } from '../core/types';

interface LearningRoadmapViewProps {
  dashboard: DashboardPayload;
  onUpdated: (dashboard: DashboardPayload) => void;
  onStartAssessment: (skillId: string) => void;
}

export function LearningRoadmapView({
  dashboard,
  onUpdated,
  onStartAssessment,
}: LearningRoadmapViewProps) {
  const [busyStepId, setBusyStepId] = useState<string | null>(null);
  const [weeklyHoursInput, setWeeklyHoursInput] = useState(dashboard.profile.weeklyHours);
  const [savingHours, setSavingHours] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { roadmap, career } = dashboard;

  async function toggleActivity(
    step: RoadmapStep,
    field: 'learnCompleted' | 'practiceCompleted' | 'assessCompleted' | 'demonstrateCompleted'
  ) {
    setError(null);
    setBusyStepId(step.id);
    try {
      const res = await api.updateRoadmapStep(step.id, {
        [field]: !step[field],
      });
      onUpdated(res.dashboard);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update roadmap step');
    } finally {
      setBusyStepId(null);
    }
  }

  async function handleSaveWeeklyHours(e: React.FormEvent) {
    e.preventDefault();
    setSavingHours(true);
    setError(null);
    try {
      const res = await api.updateProfile({ weeklyHours: weeklyHoursInput });
      onUpdated(res.dashboard);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update schedule');
    } finally {
      setSavingHours(false);
    }
  }

  // Learning Time Optimizer: group non-completed steps into realistic weekly buckets
  const pendingSteps = roadmap.steps.filter((s) => s.status !== 'COMPLETED');
  const minutesPerWeek = Math.max(60, dashboard.profile.weeklyHours * 60);
  const scheduleWeeks: { week: number; totalMinutes: number; items: RoadmapStep[] }[] = [];
  let currentWeek = 1;
  let currentBucket: RoadmapStep[] = [];
  let currentMins = 0;

  for (const st of pendingSteps) {
    if (currentMins > 0 && currentMins + st.estimatedMinutes > minutesPerWeek) {
      scheduleWeeks.push({ week: currentWeek, totalMinutes: currentMins, items: currentBucket });
      currentWeek += 1;
      currentBucket = [st];
      currentMins = st.estimatedMinutes;
    } else {
      currentBucket.push(st);
      currentMins += st.estimatedMinutes;
    }
  }
  if (currentBucket.length > 0) {
    scheduleWeeks.push({ week: currentWeek, totalMinutes: currentMins, items: currentBucket });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl text-[#24231F]">Personalized Learning Roadmap</h1>
          <p className="text-sm text-[#89877F] mt-1">
            {career.title} · Prerequisite-validated path following LEARN → PRACTICE → ASSESS →
            DEMONSTRATE.
          </p>
        </div>

        <form
          onSubmit={handleSaveWeeklyHours}
          className="flex items-center gap-2 rounded-xl border border-[#E8E3D8] bg-[#FDFBF6] px-3 py-2"
        >
          <CalendarClock className="h-4 w-4 text-[#77764B]" aria-hidden="true" />
          <label htmlFor="rm-hours" className="text-xs font-medium text-[#24231F] whitespace-nowrap">
            Weekly Study Hours:
          </label>
          <input
            id="rm-hours"
            type="number"
            min={1}
            max={60}
            value={weeklyHoursInput}
            onChange={(e) => setWeeklyHoursInput(Number(e.target.value) || 8)}
            className="w-14 rounded border border-[#E8E3D8] bg-white px-2 py-1 text-xs font-mono tabular-nums"
          />
          <button
            type="submit"
            disabled={savingHours}
            className="rounded-lg bg-[#24231F] px-3 py-1 text-xs font-semibold text-[#F8F6EF] cursor-pointer whitespace-nowrap"
          >
            {savingHours ? 'Saving…' : 'Optimize'}
          </button>
        </form>
      </div>

      {error && (
        <div className="rounded-xl border border-[#D77B43] bg-[#D77B43]/10 px-4 py-3 text-sm text-[#24231F]">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Steps List */}
        <div className="lg:col-span-8 space-y-4">
          {roadmap.steps.map((step) => {
            const locked = step.status === 'LOCKED';
            const completed = step.status === 'COMPLETED';
            const needsRevision = step.status === 'NEEDS_REVISION';

            return (
              <article
                key={step.id}
                className={`rounded-2xl border p-5 transition-colors ${
                  step.isRemedial
                    ? 'border-[#D77B43] bg-[#D77B43]/10'
                    : completed
                      ? 'border-[#77764B]/40 bg-[#FDFBF6]'
                      : locked
                        ? 'border-[#E8E3D8] bg-[#F8F6EF] opacity-80'
                        : 'border-[#E8B52E] bg-[#FDFBF6]'
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 text-xs text-[#89877F]">
                      <span className="font-semibold text-[#24231F] tabular-nums">
                        {step.isRemedial ? 'Remedial Insert' : `Phase 0${step.phaseNumber}`}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="tabular-nums">{step.estimatedMinutes} mins</span>
                      {step.prerequisites.length > 0 && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>Requires: {step.prerequisites.join(', ')}</span>
                        </>
                      )}
                    </div>
                    <h2 className="text-lg font-semibold text-[#24231F] mt-1">{step.skillName}</h2>
                    <p className="text-xs text-[#24231F]/75 mt-1">{step.learningObjective}</p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={`inline-flex items-center gap-1 text-xs font-semibold ${
                        completed
                          ? 'text-[#77764B]'
                          : needsRevision || step.isRemedial
                            ? 'text-[#D77B43]'
                            : locked
                              ? 'text-[#89877F]'
                              : 'text-[#24231F]'
                      }`}
                    >
                      {completed ? (
                        <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                      ) : locked ? (
                        <Lock className="h-4 w-4" aria-hidden="true" />
                      ) : needsRevision ? (
                        <RotateCcw className="h-4 w-4" aria-hidden="true" />
                      ) : (
                        <AlertTriangle className="h-4 w-4 text-[#E8B52E]" aria-hidden="true" />
                      )}
                      <span>{step.status.replace('_', ' ')}</span>
                    </span>
                  </div>
                </div>

                {/* Verified Resource & Practice */}
                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="rounded-xl border border-[#E8E3D8] bg-white p-3">
                    <div className="font-semibold text-[#89877F]">Approved Resource</div>
                    <a
                      href={step.resourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 inline-flex items-center gap-1 font-semibold text-[#24231F] hover:text-[#77764B] underline underline-offset-2"
                    >
                      <span>{step.resourceTitle}</span>
                      <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
                    </a>
                  </div>
                  <div className="rounded-xl border border-[#E8E3D8] bg-white p-3">
                    <div className="font-semibold text-[#89877F]">Practice Exercise</div>
                    <p className="mt-1 text-[#24231F]/80">{step.practiceExercise}</p>
                  </div>
                </div>

                {/* LEARN -> PRACTICE -> ASSESS -> DEMONSTRATE Controls */}
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[#E8E3D8]/80 pt-3">
                  <div className="flex flex-wrap items-center gap-3 text-xs">
                    {(
                      [
                        { key: 'learnCompleted', label: '1. Learn' },
                        { key: 'practiceCompleted', label: '2. Practice' },
                        { key: 'assessCompleted', label: '3. Assess' },
                        { key: 'demonstrateCompleted', label: '4. Demonstrate' },
                      ] as const
                    ).map((stage) => (
                      <label
                        key={stage.key}
                        className={`inline-flex items-center gap-1.5 ${
                          locked ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
                        }`}
                      >
                        <input
                          type="checkbox"
                          disabled={locked || busyStepId === step.id}
                          checked={step[stage.key]}
                          onChange={() => toggleActivity(step, stage.key)}
                          className="accent-[#24231F]"
                        />
                        <span className="font-medium text-[#24231F]">{stage.label}</span>
                      </label>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() => onStartAssessment(step.skillId)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#24231F] px-3.5 py-1.5 text-xs font-semibold text-[#F8F6EF] hover:bg-[#37352f] cursor-pointer whitespace-nowrap"
                  >
                    <Play className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>{needsRevision || step.isRemedial ? 'Reassess Skill' : 'Take Diagnostic'}</span>
                  </button>
                </div>
              </article>
            );
          })}
        </div>

        {/* Learning Time Optimizer Sidebar */}
        <aside className="lg:col-span-4 space-y-4">
          <div className="rounded-2xl border border-[#E8E3D8] bg-[#FDFBF6] p-5 sticky top-6">
            <h2 className="text-base font-semibold text-[#24231F]">Learning Time Optimizer</h2>
            <p className="text-xs text-[#89877F] mt-1">
              Realistic weekly pacing based on your{' '}
              <strong className="text-[#24231F] tabular-nums">
                {dashboard.profile.weeklyHours} hrs/week
              </strong>{' '}
              availability. Rescheduling preserves all existing progress.
            </p>

            {scheduleWeeks.length === 0 ? (
              <div className="mt-4 rounded-xl border border-[#77764B]/40 bg-[#77764B]/10 p-4 text-xs text-[#24231F]">
                All current roadmap milestones are completed!
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                {scheduleWeeks.slice(0, 5).map((wk) => (
                  <div key={wk.week} className="rounded-xl border border-[#E8E3D8] bg-white p-3.5">
                    <div className="flex items-center justify-between text-xs font-semibold text-[#24231F]">
                      <span>Week {wk.week}</span>
                      <span className="font-mono text-[#77764B] tabular-nums">
                        {(wk.totalMinutes / 60).toFixed(1)} hrs
                      </span>
                    </div>
                    <ul className="mt-2 space-y-1 text-xs text-[#24231F]/80">
                      {wk.items.map((item) => (
                        <li key={item.id} className="flex items-center justify-between gap-2">
                          <span className="truncate">{item.skillName}</span>
                          <span className="text-[11px] font-mono text-[#89877F] tabular-nums shrink-0">
                            {item.estimatedMinutes}m
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
