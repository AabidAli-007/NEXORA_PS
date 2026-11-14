import { useEffect, useRef, useState } from 'react';
import { RefreshCw, Send, Sparkles, Trash2 } from 'lucide-react';
import { api, type DashboardPayload, type MentorMessage } from '../lib/api';
import { getDomainMeta } from '../data/domainsCatalog';
import type { AcademicDomainId } from '../core/types';
import { MarkdownMessage } from './MarkdownMessage';

interface AiMentorViewProps {
  dashboard: DashboardPayload;
}

const HINT_MODES: { level: 1 | 2 | 3 | 4; label: string; description: string }[] = [
  { level: 4, label: 'Direct Answer (Default)', description: 'Complete, accurate answer right away' },
  { level: 1, label: 'Conceptual Clue', description: 'Short clue & guiding question first' },
  { level: 2, label: 'Guided Steps', description: 'Step-by-step reasoning hints' },
  { level: 3, label: 'Worked Scaffold', description: 'Structured outline with blanks' },
];

const HINT_LABEL_MAP: Record<1 | 2 | 3 | 4, string> = {
  1: 'Conceptual Clue',
  2: 'Guided Steps',
  3: 'Worked Scaffold',
  4: 'Direct Answer',
};

const DOMAIN_SUGGESTED_PROMPTS: Record<AcademicDomainId, string[]> = {
  engineering: [
    'Explain async/await vs Promises in JavaScript with a clean code example.',
    'Explain SQL LEFT JOIN vs INNER JOIN and how COUNT() behaves with NULLs.',
    'Based on my entry assessment, what topics should I revise first?',
  ],
  'ai-tech': [
    'How do I choose precision vs recall for an imbalanced classification dataset?',
    'Show a clean Python example comparing L1 vs L2 regularization.',
    'What should I focus on next in my study plan?',
  ],
  medical: [
    'Explain how preload and afterload affect cardiac output step by step.',
    'How do renal impairment and therapeutic index change drug dosing?',
    'What are my priority weak areas from my baseline diagnostic?',
  ],
  commerce: [
    'Explain how depreciation flows through the Income Statement and Cash Flow Statement.',
    'Compare Current Ratio vs Quick Ratio with a numerical example.',
    'What should I revise first based on my assessment result?',
  ],
  arts: [
    'How do I structure a thesis-driven comparative humanities argument?',
    'Contrast primary vs secondary historical sources with concrete examples.',
    'Suggest a study sequence for my weak topics.',
  ],
  management: [
    'Explain LTV:CAC vs payback period with a simple unit-economics example.',
    'Walk me through diagnosing an operational bottleneck using throughput analysis.',
    'What should I focus on next in my study plan?',
  ],
  law: [
    'Walk me through applying the IRAC framework to a negligence fact pattern.',
    'Explain offer vs invitation to treat in contract formation with examples.',
    'What legal topics need the most revision from my assessment?',
  ],
  other: [
    'Explain falsifiability vs verification with a clear scientific example.',
    'Summarize my baseline strengths and what I should study next.',
    'Give me a structured practice exercise for my active module.',
  ],
};

export function AiMentorView({ dashboard }: AiMentorViewProps) {
  const [messages, setMessages] = useState<MentorMessage[]>([]);
  const [input, setInput] = useState('');
  const [hintLevel, setHintLevel] = useState<1 | 2 | 3 | 4>(4);
  const [contextSkillId, setContextSkillId] = useState<string>('');
  const [sending, setSending] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [aiConfigured, setAiConfigured] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastFailedPrompt, setLastFailedPrompt] = useState<string | null>(null);

  const threadEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    api
      .getMentorHistory()
      .then((res) => {
        setMessages(res.messages);
        if (typeof res.aiConfigured === 'boolean') {
          setAiConfigured(res.aiConfigured);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  const domainMeta = dashboard.domainMeta ?? getDomainMeta(dashboard.profile.domainId);
  const weakConcepts = Array.from(
    new Set([
      ...dashboard.attempts.slice(0, 4).flatMap((a) => a.weakConcepts),
      ...(dashboard.entryAssessment?.weakTopics ?? []),
    ])
  );
  const activeStep =
    dashboard.roadmap.steps.find((s) => s.status === 'NEEDS_REVISION' || s.status === 'IN_PROGRESS') ??
    dashboard.roadmap.steps.find((s) => s.status === 'NOT_STARTED');

  const suggestedPrompts =
    DOMAIN_SUGGESTED_PROMPTS[dashboard.profile.domainId] || DOMAIN_SUGGESTED_PROMPTS.other;

  async function sendQuestion(questionText: string) {
    const trimmed = questionText.trim();
    if (!trimmed || sending) return;
    setError(null);
    setLastFailedPrompt(null);
    setSending(true);
    const tempId = `temp-${Date.now()}`;
    const optimistic: MentorMessage = {
      id: tempId,
      role: 'user',
      message: trimmed,
      hintLevel,
      contextSkillId: contextSkillId || null,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    setInput('');

    try {
      const res = await api.sendMentorMessage({
        message: trimmed,
        hintLevel,
        contextSkillId: contextSkillId || undefined,
      });
      if (typeof res.aiConfigured === 'boolean') {
        setAiConfigured(res.aiConfigured);
      }
      setMessages((prev) => [
        ...prev,
        {
          id: `reply-${Date.now()}`,
          role: 'assistant',
          message: res.reply,
          hintLevel,
          contextSkillId: contextSkillId || null,
          createdAt: new Date().toISOString(),
        },
      ]);
    } catch (err) {
      // Do not keep failed unpersisted turn in chat thread; restore prompt for retry
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setLastFailedPrompt(trimmed);
      setInput(trimmed);
      setError(
        err instanceof Error
          ? err.message
          : 'AI Mentor could not complete your request. Please click Retry.'
      );
    } finally {
      setSending(false);
    }
  }

  async function handleClearHistory() {
    if (clearing || sending) return;
    setClearing(true);
    setError(null);
    setLastFailedPrompt(null);
    try {
      await api.clearMentorHistory();
      setMessages([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not clear conversation.');
    } finally {
      setClearing(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl text-[#24231F]">AI Learning Mentor</h1>
          <p className="text-sm text-[#636159] mt-1">
            Accurate multi-turn tutor anchored to your {domainMeta.name} ({dashboard.profile.courseName}) context — answers any question clearly.
          </p>
        </div>

        {messages.length > 0 && (
          <button
            type="button"
            disabled={clearing || sending}
            onClick={handleClearHistory}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#E8E3D8] bg-[#FDFBF6] px-3 py-2 text-xs font-semibold text-[#636159] hover:text-[#24231F] cursor-pointer self-start sm:self-auto whitespace-nowrap shrink-0"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{clearing ? 'Clearing…' : 'New Conversation'}</span>
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Authorized Context Sidebar */}
        <aside className="lg:col-span-4 space-y-4">
          <div className="rounded-2xl border border-[#E8E3D8] bg-[#FDFBF6] p-5 space-y-4">
            <h2 className="text-sm font-semibold text-[#24231F] flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-[#E8B52E]" aria-hidden="true" />
              <span>Learner Context</span>
            </h2>
            <div className="space-y-2 text-xs">
              <div>
                <span className="text-[#636159]">Course &amp; Domain: </span>
                <strong className="text-[#24231F]">
                  {dashboard.profile.courseName} · {domainMeta.name}
                </strong>
              </div>
              <div>
                <span className="text-[#636159]">Target Plan: </span>
                <strong className="text-[#24231F]">{dashboard.career.title}</strong>
              </div>
              {dashboard.entryAssessment && (
                <div>
                  <span className="text-[#636159]">Entry Diagnostic: </span>
                  <strong className="text-[#61603B] tabular-nums">
                    {dashboard.entryAssessment.scorePercent}% ({dashboard.entryAssessment.skillLevel})
                  </strong>
                </div>
              )}
              <div>
                <span className="text-[#636159]">Active Roadmap Step: </span>
                <strong className="text-[#24231F]">{activeStep?.skillName ?? 'None'}</strong>
              </div>
              <div>
                <span className="text-[#636159]">Priority Revision Topics: </span>
                <strong className="text-[#A34E1D]">
                  {weakConcepts.length > 0 ? weakConcepts.slice(0, 4).join(', ') : 'None flagged yet'}
                </strong>
              </div>
            </div>

            <div className="border-t border-[#E8E3D8] pt-4">
              <div className="text-xs font-semibold text-[#24231F] mb-2">
                Response Style
              </div>
              <div className="space-y-1.5" role="group" aria-label="AI Mentor response style">
                {HINT_MODES.map((mode) => (
                  <button
                    key={mode.level}
                    type="button"
                    aria-pressed={hintLevel === mode.level}
                    onClick={() => setHintLevel(mode.level)}
                    className={`w-full text-left rounded-lg border px-3 py-2 text-xs transition-colors cursor-pointer ${
                      hintLevel === mode.level
                        ? 'border-[#24231F] bg-[#F4E3B2] text-[#24231F]'
                        : 'border-[#E8E3D8] bg-white text-[#24231F]/80 hover:border-[#24231F]/40'
                    }`}
                  >
                    <div className="font-semibold">{mode.label}</div>
                    <div className="text-[11px] text-[#636159]">{mode.description}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="border-t border-[#E8E3D8] pt-4">
              <label htmlFor="mentor-skill" className="block text-xs font-semibold text-[#24231F] mb-1">
                Focus Topic (optional)
              </label>
              <select
                id="mentor-skill"
                value={contextSkillId}
                onChange={(e) => setContextSkillId(e.target.value)}
                className="w-full rounded-lg border border-[#E8E3D8] bg-white px-3 py-2 text-xs"
              >
                <option value="">Auto-detect or answer open question</option>
                {dashboard.career.requirements.map((r) => (
                  <option key={r.skillId} value={r.skillId}>
                    {r.skillName}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="rounded-2xl border border-[#E8E3D8] bg-[#FDFBF6] p-5 space-y-2">
            <div className="text-xs font-semibold text-[#24231F]">
              Suggested Questions
            </div>
            {suggestedPrompts.map((p) => (
              <button
                key={p}
                type="button"
                disabled={sending}
                onClick={() => sendQuestion(p)}
                className="w-full text-left rounded-lg border border-[#E8E3D8] bg-white px-3 py-2 text-xs text-[#24231F] hover:border-[#24231F] cursor-pointer disabled:opacity-50"
              >
                {p}
              </button>
            ))}
          </div>
        </aside>

        {/* Chat Thread */}
        <section
          aria-label="AI Mentor chat session"
          className="lg:col-span-8 rounded-2xl border border-[#E8E3D8] bg-[#FDFBF6] flex flex-col min-h-[560px] max-h-[78vh]"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E8E3D8] px-5 py-3.5 text-xs">
            <span className="font-semibold text-[#24231F]">
              Mentor Session · {HINT_LABEL_MAP[hintLevel]}
            </span>
            <span className="text-[#636159]">
              {aiConfigured === false
                ? 'Configure GEMINI_API_KEY in AI Studio Settings > Secrets'
                : 'Gemini Multi-Turn Tutoring'}
            </span>
          </div>

          <div
            role="log"
            aria-live="polite"
            aria-label="AI Mentor conversation"
            className="flex-1 overflow-y-auto p-5 space-y-4"
          >
            {messages.length === 0 ? (
              <div className="rounded-xl border border-[#E8E3D8] bg-white p-5 text-sm text-[#24231F]/85 space-y-2">
                <p>
                  Ask any question about <strong>{dashboard.profile.courseName}</strong>, coding, math, science, case studies, or general concepts.
                </p>
                <p className="text-xs text-[#636159]">
                  By default, NEXORA gives direct, accurate answers with formatted code and examples. Switch to Conceptual Clue or Guided Steps anytime on the left if you want hints first.
                </p>
              </div>
            ) : (
              messages.map((m) => (
                <div
                  key={m.id}
                  className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                      m.role === 'user'
                        ? 'bg-[#F4E3B2] text-[#24231F] whitespace-pre-wrap'
                        : 'border border-[#E8E3D8] bg-white text-[#24231F]'
                    }`}
                  >
                    <div className="text-[11px] font-semibold text-[#636159] mb-1.5">
                      {m.role === 'user'
                        ? 'You'
                        : `NEXORA Mentor · ${HINT_LABEL_MAP[(m.hintLevel as 1 | 2 | 3 | 4) || 4] ?? 'Direct Answer'}`}
                    </div>
                    {m.role === 'user' ? (
                      m.message
                    ) : (
                      <MarkdownMessage content={m.message} />
                    )}
                  </div>
                </div>
              ))
            )}

            {sending && (
              <div className="flex justify-start" role="status" aria-live="polite">
                <div className="rounded-2xl border border-[#E8E3D8] bg-white px-4 py-3 text-xs text-[#61603B] font-medium">
                  Generating accurate response…
                </div>
              </div>
            )}
            <div ref={threadEndRef} />
          </div>

          {error && (
            <div
              role="alert"
              className="mx-5 mb-2 rounded-xl border border-[#D77B43] bg-[#D77B43]/10 px-4 py-3 text-xs text-[#24231F] flex flex-wrap items-center justify-between gap-3"
            >
              <div className="space-y-0.5 flex-1 min-w-[200px]">
                <div className="font-semibold text-[#24231F]">Unable to get AI Mentor response</div>
                <div className="text-[#24231F]/85">{error}</div>
              </div>
              {lastFailedPrompt && (
                <button
                  type="button"
                  disabled={sending}
                  onClick={() => sendQuestion(lastFailedPrompt)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[#24231F]/30 bg-white px-3 py-1.5 text-xs font-semibold hover:border-[#24231F] cursor-pointer whitespace-nowrap shrink-0"
                >
                  <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Retry</span>
                </button>
              )}
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              sendQuestion(input);
            }}
            className="border-t border-[#E8E3D8] p-4 flex items-center gap-3"
          >
            <label htmlFor="mentor-question-input" className="sr-only">
              Ask AI Mentor a question
            </label>
            <input
              id="mentor-question-input"
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={`Ask any question about ${dashboard.profile.courseName} or any topic…`}
              className="flex-1 rounded-xl border border-[#E8E3D8] bg-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#E8B52E]"
            />
            <button
              type="submit"
              disabled={sending || !input.trim()}
              aria-label="Send message to AI Mentor"
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#E8B52E] text-[#24231F] hover:bg-[#dca923] disabled:opacity-50 cursor-pointer"
            >
              <Send className="h-4 w-4" aria-hidden="true" />
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
