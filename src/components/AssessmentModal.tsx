import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, HelpCircle, Play, Sparkles, X } from 'lucide-react';
import { api, type DashboardPayload } from '../lib/api';
import type { AssessmentQuestion } from '../core/types';
import type { AssessmentGradingOutput } from '../core/assessment';
import type { NavPage } from './SidebarShell';

interface AssessmentModalProps {
  skillId: string;
  onClose: () => void;
  onUpdated: (dashboard: DashboardPayload) => void;
  onNavigate: (page: NavPage) => void;
}

export function AssessmentModal({
  skillId,
  onClose,
  onUpdated,
  onNavigate,
}: AssessmentModalProps) {
  const [questions, setQuestions] = useState<Omit<AssessmentQuestion, 'correctAnswer'>[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [practicalNotes, setPracticalNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AssessmentGradingOutput | null>(null);
  const [revealedHints, setRevealedHints] = useState<Record<string, number>>({});

  useEffect(() => {
    let active = true;
    setLoading(true);
    api
      .getAssessment(skillId)
      .then((res) => {
        if (active) {
          setQuestions(res.questions);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (active) {
          setError(err instanceof Error ? err.message : 'Failed to load assessment');
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [skillId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const formatted = questions.map((q) => ({
      questionId: q.id,
      answer: answers[q.id] ?? '',
    }));

    if (formatted.some((a) => !a.answer)) {
      setError('Please answer every diagnostic question before submitting.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.submitAssessment(skillId, {
        answers: formatted,
        practicalNotes,
      });
      setResult(res.evaluation);
      onUpdated(res.dashboard);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to grade assessment');
    } finally {
      setSubmitting(false);
    }
  }

  function nextHint(questionId: string) {
    setRevealedHints((prev) => ({
      ...prev,
      [questionId]: Math.min(3, (prev[questionId] ?? 0) + 1),
    }));
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#24231F]/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="assess-modal-title"
    >
      <div className="w-full max-w-3xl max-h-[90vh] flex flex-col rounded-2xl border border-[#E8E3D8] bg-[#FDFBF6] shadow-xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-[#E8E3D8] px-6 py-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-[#77764B]">
              Adaptive Diagnostic Assessment
            </div>
            <h2 id="assess-modal-title" className="font-serif text-2xl text-[#24231F] mt-0.5">
              {skillId.toUpperCase()} Competency Check
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close assessment"
            className="rounded-lg p-1.5 text-[#89877F] hover:bg-[#E8E3D8]/50 hover:text-[#24231F] cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="py-12 text-center text-sm text-[#89877F]">
              Loading multi-format diagnostic questions…
            </div>
          ) : error && !result ? (
            <div className="rounded-xl border border-[#D77B43] bg-[#D77B43]/10 p-4 text-sm text-[#24231F]">
              {error}
            </div>
          ) : null}

          {!loading && !result && (
            <form onSubmit={handleSubmit} className="space-y-6">
              {questions.map((q, idx) => {
                const hintLevel = revealedHints[q.id] ?? 0;
                return (
                  <fieldset
                    key={q.id}
                    className="rounded-xl border border-[#E8E3D8] bg-white p-5 space-y-3"
                  >
                    <div className="flex items-center justify-between gap-2 text-xs text-[#89877F]">
                      <span>
                        Question {idx + 1} of {questions.length} · {q.type.replace('_', ' ')} ·{' '}
                        {q.conceptTag}
                      </span>
                      <button
                        type="button"
                        onClick={() => nextHint(q.id)}
                        className="inline-flex items-center gap-1 font-semibold text-[#77764B] hover:text-[#24231F] cursor-pointer"
                      >
                        <HelpCircle className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>
                          {hintLevel === 0
                            ? 'Show Hint'
                            : hintLevel < 3
                              ? `Next Hint (${hintLevel}/3)`
                              : 'All Hints Shown'}
                        </span>
                      </button>
                    </div>

                    <legend className="text-sm font-semibold text-[#24231F]">{q.prompt}</legend>

                    {q.codeSnippet && (
                      <pre className="rounded-lg bg-[#24231F] p-3.5 text-xs font-mono text-[#F8F6EF] overflow-x-auto">
                        <code>{q.codeSnippet}</code>
                      </pre>
                    )}

                    {hintLevel > 0 && (
                      <div className="rounded-lg border border-[#E8B52E]/50 bg-[#E8B52E]/10 px-3 py-2 text-xs text-[#24231F]">
                        <span className="font-semibold">Hint {hintLevel}: </span>
                        {q.hintLadder[hintLevel - 1]}
                      </div>
                    )}

                    <div className="space-y-2 pt-1">
                      {(q.options ?? []).map((opt) => {
                        const selected = answers[q.id] === opt;
                        return (
                          <label
                            key={opt}
                            className={`flex items-start gap-3 rounded-lg border px-3.5 py-2.5 text-sm cursor-pointer transition-colors ${
                              selected
                                ? 'border-[#24231F] bg-[#F8F6EF] font-medium'
                                : 'border-[#E8E3D8] hover:border-[#24231F]/40'
                            }`}
                          >
                            <input
                              type="radio"
                              name={`q-${q.id}`}
                              value={opt}
                              checked={selected}
                              onChange={() => setAnswers((prev) => ({ ...prev, [q.id]: opt }))}
                              className="mt-1 accent-[#24231F]"
                            />
                            <span className="text-[#24231F]">{opt}</span>
                          </label>
                        );
                      })}
                    </div>
                  </fieldset>
                );
              })}

              <div className="rounded-xl border border-[#E8E3D8] bg-white p-5">
                <label
                  htmlFor="practical-notes"
                  className="block text-sm font-semibold text-[#24231F]"
                >
                  Practical Application / Reasoning Notes (optional)
                </label>
                <p className="text-xs text-[#89877F] mt-0.5 mb-2">
                  Briefly explain how you applied {skillId} in code or queries to support rubric
                  evaluation.
                </p>
                <textarea
                  id="practical-notes"
                  rows={2}
                  value={practicalNotes}
                  onChange={(e) => setPracticalNotes(e.target.value)}
                  placeholder="e.g., Built an async fetch wrapper with array map/filter and explicit error handling."
                  className="w-full rounded-lg border border-[#E8E3D8] bg-[#FDFBF6] px-3 py-2 text-sm"
                />
              </div>

              <div className="flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg border border-[#E8E3D8] px-4 py-2 text-sm font-medium text-[#24231F] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#24231F] px-5 py-2.5 text-sm font-semibold text-[#F8F6EF] hover:bg-[#37352f] disabled:opacity-60 cursor-pointer"
                >
                  <Play className="h-4 w-4" aria-hidden="true" />
                  <span>{submitting ? 'Scoring & Running Agents…' : 'Submit Diagnostic'}</span>
                </button>
              </div>
            </form>
          )}

          {result && (
            <div className="space-y-5">
              <div
                className={`rounded-xl border p-5 ${
                  result.adaptiveDecision === 'REMEDIAL_REQUIRED'
                    ? 'border-[#D77B43] bg-[#D77B43]/10'
                    : result.adaptiveDecision === 'TARGETED_PRACTICE'
                      ? 'border-[#E8B52E] bg-[#E8B52E]/15'
                      : 'border-[#77764B] bg-[#77764B]/10'
                }`}
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2.5">
                    {result.adaptiveDecision === 'REMEDIAL_REQUIRED' ? (
                      <AlertTriangle className="h-5 w-5 text-[#D77B43]" />
                    ) : (
                      <CheckCircle2 className="h-5 w-5 text-[#77764B]" />
                    )}
                    <h3 className="text-lg font-bold text-[#24231F]">
                      Score: <span className="tabular-nums">{result.scorePercent}%</span> (
                      <span className="tabular-nums">
                        {result.correctCount}/{result.totalCount}
                      </span>{' '}
                      correct)
                    </h3>
                  </div>
                  <span className="text-xs font-semibold uppercase tracking-wider text-[#24231F]">
                    {result.adaptiveDecision.replace('_', ' ')}
                  </span>
                </div>

                <p className="text-sm text-[#24231F] mt-2">{result.rubricSummary}</p>

                <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-[#24231F]/80">
                  <span>
                    Updated Evidence State: <strong>{result.recommendedEvidenceState}</strong>
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="tabular-nums">
                    Proficiency: <strong>{result.recommendedProficiency}/5</strong>
                  </span>
                  {result.weakConcepts.length > 0 && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>
                        Weak Concepts: <strong>{result.weakConcepts.join(', ')}</strong>
                      </span>
                    </>
                  )}
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-[#24231F]">Question-by-Question Review</h4>
                {result.questionResults.map((qr, i) => (
                  <div
                    key={qr.questionId}
                    className="rounded-xl border border-[#E8E3D8] bg-white p-4 text-sm"
                  >
                    <div className="flex items-center justify-between text-xs font-semibold">
                      <span>
                        Q{i + 1} · {qr.conceptTag}
                      </span>
                      <span className={qr.correct ? 'text-[#77764B]' : 'text-[#D77B43]'}>
                        {qr.correct ? 'Correct' : 'Needs Review'}
                      </span>
                    </div>
                    <p className="text-xs text-[#89877F] mt-1">{qr.explanation}</p>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#E8E3D8] pt-4">
                {result.adaptiveDecision === 'REMEDIAL_REQUIRED' ? (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onNavigate('mentor');
                    }}
                    className="inline-flex items-center gap-2 rounded-lg bg-[#E8B52E] px-4 py-2 text-xs font-semibold text-[#24231F] cursor-pointer"
                  >
                    <Sparkles className="h-4 w-4" aria-hidden="true" />
                    <span>Ask AI Mentor for Progressive Hints</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onNavigate('roadmap');
                    }}
                    className="rounded-lg bg-[#E8B52E] px-4 py-2 text-xs font-semibold text-[#24231F] cursor-pointer"
                  >
                    View Updated Roadmap
                  </button>
                )}

                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg bg-[#24231F] px-4 py-2 text-xs font-semibold text-[#F8F6EF] cursor-pointer"
                >
                  Done
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
