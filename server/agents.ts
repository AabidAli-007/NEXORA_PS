import crypto from 'node:crypto';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import { z } from 'zod';
import {
  db,
  getAssessmentAttempts,
  getLatestEntryAssessment,
  getLearnerProfile,
  getLearnerSkills,
  getRoadmapForUser,
  getSkillEvidence,
} from './db';
import { CAREERS_CATALOG } from '../src/data/catalog';
import { getDomainMeta } from '../src/data/domainsCatalog';
import { calculateCareerReadiness } from '../src/core/readiness';
import { sanitizeUntrustedPromptText } from '../src/core/security';
import type {
  AgentName,
  AgentRunStatus,
  EntryAiProfileSummary,
  EntryAssessmentResult,
} from '../src/core/types';

export function getGeminiKeyConfigured(): boolean {
  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  return Boolean(apiKey && apiKey !== 'MY_GEMINI_API_KEY');
}

let cachedGeminiClient: { key: string; client: GoogleGenAI } | null = null;

function getGeminiClient(): GoogleGenAI | null {
  if (!getGeminiKeyConfigured()) {
    return null;
  }
  const key = process.env.GEMINI_API_KEY!.trim();
  if (cachedGeminiClient && cachedGeminiClient.key === key) {
    return cachedGeminiClient.client;
  }
  const client = new GoogleGenAI({
    apiKey: key,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
  cachedGeminiClient = { key, client };
  return client;
}

// Zod validation schemas for agent outputs
const SkillAuditSchema = z.object({
  summary: z.string().min(5),
  missingEvidenceSkills: z.array(z.string()),
  reassessmentRecommended: z.array(z.string()),
  evidenceQualityNotes: z.string(),
});

const CareerArchitectSchema = z.object({
  summary: z.string().min(5),
  topPriorityGaps: z.array(z.string()),
  transferableStrengths: z.array(z.string()),
  readinessInterpretation: z.string(),
});

const LearningStrategistSchema = z.object({
  summary: z.string().min(5),
  recommendedFocusOrder: z.array(z.string()),
  weeklyScheduleAdvice: z.string(),
  remedialAction: z.string(),
});

const ProgressEvaluatorSchema = z.object({
  summary: z.string().min(5),
  trendStatus: z.enum(['IMPROVING', 'STALLED', 'NEEDS_REMEDIATION', 'BASELINE']),
  detectedWeakConcepts: z.array(z.string()),
  replanRequired: z.boolean(),
});

export type OrchestratorEvent =
  | { type: 'PROFILE_SAVED' }
  | { type: 'POOR_ASSESSMENT'; skillId: string; scorePercent: number; weakConcepts: string[] }
  | { type: 'CAREER_CHANGED'; previousCareerId: string; newCareerId: string }
  | { type: 'PROJECT_SUBMITTED'; skillId: string; title: string; detectedStack: string[] };

const EVENT_AGENT_MAP: Record<OrchestratorEvent['type'], AgentName[]> = {
  PROFILE_SAVED: ['SKILL_AUDITOR', 'CAREER_ARCHITECT', 'LEARNING_STRATEGIST'],
  POOR_ASSESSMENT: ['PROGRESS_EVALUATOR', 'LEARNING_STRATEGIST', 'ADAPTIVE_MENTOR'],
  CAREER_CHANGED: ['CAREER_ARCHITECT', 'SKILL_AUDITOR', 'LEARNING_STRATEGIST'],
  PROJECT_SUBMITTED: ['SKILL_AUDITOR'],
};

const EntryProfileSummarySchema = z.object({
  strengthsSummary: z.string().min(5),
  weakAreasSummary: z.string().min(5),
  recommendedPace: z.string().min(5),
  nextSteps: z.array(z.string()).min(1),
});

type GeminiContentPart = {
  role: 'user' | 'model';
  parts: { text: string }[];
};

async function invokeStructuredGemini<T>(
  contents: string | GeminiContentPart[],
  systemInstruction: string,
  responseSchema: Record<string, unknown>,
  zodSchema: z.ZodType<T>,
  fallback: () => T,
  timeoutMs = 5_000
): Promise<{ result: T; usedAi: boolean; retried: boolean; error?: string }> {
  const ai = getGeminiClient();
  if (!ai) {
    return {
      result: fallback(),
      usedAi: false,
      retried: false,
    };
  }

  let retried = false;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await Promise.race([
        ai.models.generateContent({
          model: 'gemini-3.1-flash-lite',
          contents,
          config: {
            systemInstruction,
            responseMimeType: 'application/json',
            responseSchema,
          },
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('TIMEOUT: Gemini request timed out')), timeoutMs)
        ),
      ]);
      const raw = (response.text ?? '').trim();
      const parsed = JSON.parse(raw);
      const validated = zodSchema.parse(parsed);
      return { result: validated, usedAi: true, retried };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Gemini call failed';
      const upper = message.toUpperCase();
      const isNonRetryable =
        message.startsWith('TIMEOUT:') ||
        message.includes('fetch failed') ||
        message.includes('ENOTFOUND') ||
        message.includes('ECONNREFUSED') ||
        upper.includes('RESOURCE_EXHAUSTED') ||
        /\b429\b|\b403\b|\b404\b/.test(message);

      if (isNonRetryable) {
        return { result: fallback(), usedAi: false, retried, error: message };
      }

      if (attempt === 0) {
        retried = true;
        continue;
      }
      return { result: fallback(), usedAi: false, retried, error: message };
    }
  }
  return { result: fallback(), usedAi: false, retried };
}

export async function runOrchestratorEvent(
  userId: string,
  event: OrchestratorEvent
): Promise<{
  runId: string;
  status: AgentRunStatus;
  agentsInvoked: AgentName[];
  summary: string;
  outputs: Record<string, unknown>;
}> {
  const start = Date.now();
  const runId = `run-${crypto.randomUUID()}`;
  const agentsInvoked = EVENT_AGENT_MAP[event.type];
  const createdAt = new Date().toISOString();

  db.prepare(
    `INSERT INTO agent_runs (id, user_id, trigger_event, agents_invoked_json, status, summary, payload_json, error_message, duration_ms, created_at)
     VALUES (?, ?, ?, ?, 'RUNNING', 'Executing controlled agent sequence...', '{}', NULL, 0, ?)`
  ).run(runId, userId, event.type, JSON.stringify(agentsInvoked), createdAt);

  const profile = getLearnerProfile(userId);
  const skills = getLearnerSkills(userId);
  const evidence = getSkillEvidence(userId);
  const attempts = getAssessmentAttempts(userId);
  const career =
    CAREERS_CATALOG.find((c) => c.id === profile?.targetCareerId) ?? CAREERS_CATALOG[0];
  const readiness = calculateCareerReadiness(
    career,
    skills,
    event.type === 'CAREER_CHANGED' ? event.previousCareerId : null
  );

  const outputs: Record<string, unknown> = {};
  let hadRetry = false;
  let lastError: string | null = null;

  try {
    await Promise.all(
      agentsInvoked.map(async (agent) => {
        if (agent === 'SKILL_AUDITOR') {
          const missingEvidence = readiness.skillGaps
            .filter((g) => g.isUnassessed)
            .map((g) => g.skillName);
          const res = await invokeStructuredGemini(
            `Audit learner skills against evidence. Learner: ${profile?.displayName}. Skills: ${JSON.stringify(
              skills.map((s) => ({
                name: s.skillName,
                state: s.evidenceState,
                proficiency: s.proficiency,
              }))
            )}. Evidence count: ${evidence.length}. Target Career: ${career.title}.`,
            'You are NEXORA Agent 1: Skill Auditor. Never promote Declared skills to Demonstrated without evidence. Return concise JSON.',
            {
              type: Type.OBJECT,
              properties: {
                summary: { type: Type.STRING },
                missingEvidenceSkills: { type: Type.ARRAY, items: { type: Type.STRING } },
                reassessmentRecommended: { type: Type.ARRAY, items: { type: Type.STRING } },
                evidenceQualityNotes: { type: Type.STRING },
              },
              required: ['summary', 'missingEvidenceSkills', 'reassessmentRecommended', 'evidenceQualityNotes'],
            },
            SkillAuditSchema,
            () => ({
              summary: `Audited ${skills.length} skill records and ${evidence.length} evidence artifacts. ${missingEvidence.length} career skills still require assessment or project proof.`,
              missingEvidenceSkills: missingEvidence.slice(0, 6),
              reassessmentRecommended: skills
                .filter((s) => s.needsReassessment)
                .map((s) => s.skillName),
              evidenceQualityNotes:
                'Declared skills are held separately from Demonstrated/Validated evidence until verified by diagnostic scoring or practical review.',
            })
          );
          if (res.retried) hadRetry = true;
          if (res.error) lastError = res.error;
          outputs.skillAuditor = res.result;
        }

        if (agent === 'CAREER_ARCHITECT') {
          const topGaps = readiness.priorityGaps.slice(0, 4).map((g) => g.skillName);
          const transferables = readiness.transferableSkills.map((g) => g.skillName);
          const res = await invokeStructuredGemini(
            `Interpret deterministic career readiness (${readiness.readinessScore}%) for ${career.title}. Priority gaps: ${topGaps.join(', ')}. Transferable: ${transferables.join(', ')}.`,
            'You are NEXORA Agent 2: Career Architect. Explain deterministic gaps and transferable skills without inventing scores.',
            {
              type: Type.OBJECT,
              properties: {
                summary: { type: Type.STRING },
                topPriorityGaps: { type: Type.ARRAY, items: { type: Type.STRING } },
                transferableStrengths: { type: Type.ARRAY, items: { type: Type.STRING } },
                readinessInterpretation: { type: Type.STRING },
              },
              required: ['summary', 'topPriorityGaps', 'transferableStrengths', 'readinessInterpretation'],
            },
            CareerArchitectSchema,
            () => ({
              summary: `${career.title} readiness is ${readiness.readinessScore}% based on weighted demonstrated evidence.`,
              topPriorityGaps: topGaps,
              transferableStrengths: transferables,
              readinessInterpretation:
                transferables.length > 0
                  ? `Preserved ${transferables.length} transferable competencies (${transferables.join(', ')}) so you do not restart from zero.`
                  : `Focus first on ${topGaps.slice(0, 2).join(' and ') || 'core foundations'} to reduce weighted skill gaps.`,
            })
          );
          if (res.retried) hadRetry = true;
          if (res.error) lastError = res.error;
          outputs.careerArchitect = res.result;
        }

        if (agent === 'PROGRESS_EVALUATOR') {
          const weakConcepts =
            event.type === 'POOR_ASSESSMENT'
              ? event.weakConcepts
              : attempts[0]?.weakConcepts ?? [];
          const res = await invokeStructuredGemini(
            `Evaluate learner assessment trend. Recent attempts: ${JSON.stringify(
              attempts.slice(0, 5).map((a) => ({
                skill: a.skillName,
                score: a.scorePercent,
                decision: a.adaptiveDecision,
              }))
            )}. Weak concepts: ${weakConcepts.join(', ')}.`,
            'You are NEXORA Agent 4: Progress Evaluator. Detect weak concepts and determine whether remedial replanning is required.',
            {
              type: Type.OBJECT,
              properties: {
                summary: { type: Type.STRING },
                trendStatus: { type: Type.STRING },
                detectedWeakConcepts: { type: Type.ARRAY, items: { type: Type.STRING } },
                replanRequired: { type: Type.BOOLEAN },
              },
              required: ['summary', 'trendStatus', 'detectedWeakConcepts', 'replanRequired'],
            },
            ProgressEvaluatorSchema,
            () => ({
              summary:
                event.type === 'POOR_ASSESSMENT'
                  ? `Assessment scored ${event.scorePercent}% (< 60%). Detected weak concepts: ${weakConcepts.join(', ') || 'core fundamentals'}.`
                  : 'Baseline progression analyzed from assessment history.',
              trendStatus:
                event.type === 'POOR_ASSESSMENT' && event.scorePercent < 60
                  ? 'NEEDS_REMEDIATION'
                  : 'BASELINE',
              detectedWeakConcepts: weakConcepts,
              replanRequired: event.type === 'POOR_ASSESSMENT' && event.scorePercent < 60,
            })
          );
          if (res.retried) hadRetry = true;
          if (res.error) lastError = res.error;
          outputs.progressEvaluator = res.result;
        }

        if (agent === 'LEARNING_STRATEGIST') {
          const roadmap = getRoadmapForUser(userId, career.id);
          const focusOrder = roadmap.steps
            .filter((s) => s.status !== 'COMPLETED')
            .slice(0, 4)
            .map((s) => s.skillName);
          const weeklyHours = profile?.weeklyHours ?? 8;

          const res = await invokeStructuredGemini(
            `Build adaptive study strategy for ${career.title} at ${weeklyHours} hrs/week. Next roadmap steps: ${focusOrder.join(' -> ')}. Event: ${JSON.stringify(event)}.`,
            'You are NEXORA Agent 3: Learning Strategist. Respect prerequisites and weekly study hours. Do not invent external course URLs.',
            {
              type: Type.OBJECT,
              properties: {
                summary: { type: Type.STRING },
                recommendedFocusOrder: { type: Type.ARRAY, items: { type: Type.STRING } },
                weeklyScheduleAdvice: { type: Type.STRING },
                remedialAction: { type: Type.STRING },
              },
              required: ['summary', 'recommendedFocusOrder', 'weeklyScheduleAdvice', 'remedialAction'],
            },
            LearningStrategistSchema,
            () => ({
              summary: `Roadmap synchronized for ${career.title} (${weeklyHours} hrs/week). Next priorities: ${focusOrder.join(' → ')}.`,
              recommendedFocusOrder: focusOrder,
              weeklyScheduleAdvice: `At ${weeklyHours} hours/week, dedicate ~${Math.max(
                2,
                Math.round(weeklyHours * 0.6)
              )}h to guided practice and ~${Math.max(
                1,
                Math.round(weeklyHours * 0.4)
              )}h to diagnostic reassessment.`,
              remedialAction:
                event.type === 'POOR_ASSESSMENT'
                  ? `Inserted remedial revision module for ${event.skillId} targeting ${event.weakConcepts.join(', ') || 'core concepts'}.`
                  : 'Prerequisite order verified with zero circular dependencies.',
            })
          );
          if (res.retried) hadRetry = true;
          if (res.error) lastError = res.error;
          outputs.learningStrategist = res.result;
        }

        if (agent === 'ADAPTIVE_MENTOR') {
          const weakLabel =
            event.type === 'POOR_ASSESSMENT'
              ? event.weakConcepts.join(', ') || 'foundational syntax'
              : 'active roadmap concepts';
          const guidanceMsg =
            event.type === 'POOR_ASSESSMENT'
              ? `I noticed your ${event.skillId} assessment scored ${event.scorePercent}%. Let's focus on ${weakLabel}. Here is a 3-step recovery plan:\n1. Review the remedial guide in your Learning Roadmap.\n2. Ask me for a Level 1 conceptual hint on ${weakLabel}.\n3. Retake the diagnostic once you feel ready.`
              : `Your roadmap for ${career.title} has been updated. Ask me anytime for progressive hints without spoiling solutions.`;

          outputs.adaptiveMentor = {
            guidanceNote: guidanceMsg,
          };
          db.prepare(
            `INSERT INTO ai_interactions (id, user_id, role, message, hint_level, context_skill_id, created_at)
             VALUES (?, ?, 'assistant', ?, 1, ?, ?)`
          ).run(
            `msg-${crypto.randomUUID()}`,
            userId,
            guidanceMsg,
            event.type === 'POOR_ASSESSMENT' ? event.skillId : null,
            new Date().toISOString()
          );
        }
      })
    );

    const summaryParts = Object.values(outputs)
      .map((v) => (v && typeof v === 'object' && 'summary' in v ? String((v as { summary: string }).summary) : ''))
      .filter(Boolean);
    const summary =
      summaryParts[0] || `Completed ${agentsInvoked.join(' → ')} for ${event.type}.`;
    const durationMs = Date.now() - start;
    const finalStatus: AgentRunStatus = hadRetry && lastError ? 'RETRYING' : 'COMPLETED';

    db.prepare(
      `UPDATE agent_runs
       SET status = ?, summary = ?, payload_json = ?, error_message = ?, duration_ms = ?
       WHERE id = ?`
    ).run(
      finalStatus === 'RETRYING' ? 'COMPLETED' : finalStatus,
      summary,
      JSON.stringify(outputs),
      lastError,
      durationMs,
      runId
    );

    return {
      runId,
      status: 'COMPLETED',
      agentsInvoked,
      summary,
      outputs,
    };
  } catch (err) {
    const durationMs = Date.now() - start;
    const msg = err instanceof Error ? err.message : 'Orchestrator execution failed';
    db.prepare(
      `UPDATE agent_runs
       SET status = 'FAILED', summary = 'Fallback applied after orchestration error', error_message = ?, duration_ms = ?
       WHERE id = ?`
    ).run(msg, durationMs, runId);
    return {
      runId,
      status: 'FAILED',
      agentsInvoked,
      summary: 'Orchestration logged an error and preserved existing records safely.',
      outputs,
    };
  }
}

export class MentorServiceError extends Error {
  statusCode: number;
  code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.name = 'MentorServiceError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

function classifyGeminiMentorError(err: unknown): MentorServiceError {
  const rawMessage = err instanceof Error ? err.message : String(err || 'Gemini call failed');
  const upper = rawMessage.toUpperCase();

  if (rawMessage.startsWith('TIMEOUT:')) {
    return new MentorServiceError(
      504,
      'AI_TIMEOUT',
      'The AI Mentor took too long to respond (>30s). Please click Retry.'
    );
  }
  if (
    upper.includes('API_KEY_INVALID') ||
    upper.includes('PERMISSION_DENIED') ||
    upper.includes('API KEY NOT VALID') ||
    /\b403\b/.test(rawMessage)
  ) {
    return new MentorServiceError(
      503,
      'AI_KEY_INVALID',
      'Gemini authentication failed. Check that GEMINI_API_KEY in AI Studio Settings > Secrets is valid, then click Retry.'
    );
  }
  if (upper.includes('RESOURCE_EXHAUSTED') || /\b429\b/.test(rawMessage)) {
    const isDailyQuota =
      upper.includes('PERDAY') ||
      upper.includes('PER DAY') ||
      upper.includes('FREE_TIER') ||
      upper.includes('EXCEEDED YOUR CURRENT QUOTA');
    return new MentorServiceError(
      429,
      'AI_RATE_LIMITED',
      isDailyQuota
        ? 'Your Gemini API key has reached its free-tier quota limit. Check usage or update your key in AI Studio Settings > Secrets, then click Retry.'
        : 'Gemini rate limit reached. Wait a few seconds and click Retry.'
    );
  }
  if (upper.includes('NOT_FOUND') || /\b404\b/.test(rawMessage)) {
    return new MentorServiceError(
      502,
      'AI_MODEL_UNAVAILABLE',
      'The Gemini model is temporarily unavailable. Please click Retry.'
    );
  }
  return new MentorServiceError(
    502,
    'AI_UPSTREAM_ERROR',
    'AI Mentor could not complete your request right now. Please click Retry.'
  );
}
export async function askAdaptiveMentor(
  userId: string,
  userMessage: string,
  hintLevel: 1 | 2 | 3 | 4,
  contextSkillId?: string
): Promise<{
  reply: string;
  hintStageLabel: string;
  nextRecommendedAction: string;
  usedAi: boolean;
}> {
  const ai = getGeminiClient();
  if (!ai) {
    throw new MentorServiceError(
      503,
      'AI_KEY_MISSING',
      'AI Mentor requires a configured GEMINI_API_KEY in AI Studio Settings > Secrets. Add your key and click Retry.'
    );
  }

  const profile = getLearnerProfile(userId);
  const skills = getLearnerSkills(userId);
  const attempts = getAssessmentAttempts(userId);
  const entryResult = getLatestEntryAssessment(userId);
  const career =
    CAREERS_CATALOG.find((c) => c.id === profile?.targetCareerId) ?? CAREERS_CATALOG[0];
  const domainMeta = getDomainMeta(profile?.domainId);
  const roadmap = getRoadmapForUser(userId, career.id);
  const activeStep =
    roadmap.steps.find((s) => s.status === 'NEEDS_REVISION' || s.status === 'IN_PROGRESS') ??
    roadmap.steps.find((s) => s.status === 'NOT_STARTED');

  const weakConcepts = Array.from(
    new Set([
      ...attempts.slice(0, 4).flatMap((a) => a.weakConcepts),
      ...(entryResult?.weakTopics ?? []),
    ])
  );

  const hintStages: Record<1 | 2 | 3 | 4, string> = {
    1: 'Conceptual Clue',
    2: 'Guided Steps',
    3: 'Worked Scaffold',
    4: 'Direct Answer',
  };

  const safeQuestion = sanitizeUntrustedPromptText(userMessage, 2000);
  const contextSkillObj = contextSkillId
    ? career.requirements.find((r) => r.skillId === contextSkillId) ||
      skills.find((s) => s.skillId === contextSkillId)
    : null;
  const targetFocus = contextSkillObj?.skillName || activeStep?.skillName || career.title;

  // Load multi-turn conversation history (last 12 interactions)
  const historyRows = db
    .prepare(
      `SELECT role, message FROM ai_interactions
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT 12`
    )
    .all(userId) as { role: string; message: string }[];

  const chronologicalHistory = historyRows.reverse();
  const contents: GeminiContentPart[] = [];
  for (const row of chronologicalHistory) {
    const geminiRole: 'user' | 'model' = row.role === 'user' ? 'user' : 'model';
    const text = row.message.trim();
    if (!text) continue;
    if (contents.length === 0 && geminiRole === 'model') {
      continue;
    }
    const prev = contents[contents.length - 1];
    if (prev && prev.role === geminiRole) {
      prev.parts[0].text += `\n\n${text}`;
    } else {
      contents.push({ role: geminiRole, parts: [{ text }] });
    }
  }

  const modeDirective =
    hintLevel === 4
      ? 'Give a direct, clear, accurate answer and thorough explanation right away.'
      : hintLevel === 1
        ? 'Give ONLY a focused conceptual clue and one guiding question without revealing the final solution.'
        : hintLevel === 2
          ? 'Give clear step-by-step guidance tailored to this question.'
          : 'Provide a structured worked scaffold or code/outline with clear blanks for the learner to complete.';

  const currentTurnText = `${safeQuestion}\n\n[Requested Mode: ${hintStages[hintLevel]} — ${modeDirective}${
    contextSkillId ? ` | Focus Topic: ${targetFocus}` : ''
  }]`;
  const lastTurn = contents[contents.length - 1];
  if (lastTurn && lastTurn.role === 'user') {
    lastTurn.parts[0].text += `\n\n${currentTurnText}`;
  } else {
    contents.push({ role: 'user', parts: [{ text: currentTurnText }] });
  }

  const systemInstruction = `You are NEXORA AI Learning Mentor — an accurate, helpful, domain-aware tutor.

Learner Context (use when helpful, never force unrelated domain framing):
- Name: ${profile?.displayName || 'Learner'}
- Academic Domain: ${domainMeta.name}
- Enrolled Course: ${profile?.courseName || career.title}${profile?.specialization ? ` (${profile.specialization})` : ''}
- Academic Stage: ${profile?.educationLevel || 'Undergraduate'} · ${profile?.semesterStage || profile?.academicYear || 'Current'}
- Primary Goal: ${profile?.primaryGoal || career.title}
- Entry Diagnostic Baseline: ${
    entryResult
      ? `${entryResult.scorePercent}% (${entryResult.skillLevel}); Strong: ${entryResult.strongTopics.join(', ') || 'N/A'}; Priority Gaps: ${entryResult.weakTopics.join(', ') || 'N/A'}`
      : 'Not taken yet'
  }
- Verified Skills: ${
    skills
      .filter((s) => s.evidenceState === 'Demonstrated' || s.evidenceState === 'Validated')
      .map((s) => `${s.skillName} (${s.proficiency}/5)`)
      .join(', ') || 'None verified yet'
  }
- Priority Revision Topics: ${weakConcepts.join(', ') || 'None flagged'}
- Active Roadmap Step: ${activeStep?.skillName || 'General'}

Critical Rules:
1. ACCURACY FIRST: Answer the learner's exact question accurately, clearly, and honestly. Double-check code, math, formulas, definitions, clinical/financial/legal principles, and reasoning. Never fabricate facts, statistics, citations, or outputs. If details are missing or ambiguous, state your assumption clearly.
2. COURSE CONTEXT + UNIVERSAL SCOPE: Connect examples to ${profile?.courseName || career.title} when directly relevant, AND accurately answer ANY question even if it falls outside ${domainMeta.name}. Never inject unrelated ${domainMeta.name} topics into an off-domain question.
3. RESPONSE MODE: Strictly follow the Requested Mode on the latest turn (default is Direct Answer: give the complete, accurate answer directly).
4. FORMATTING: Write clean Markdown using short headings, bullet/numbered lists, bold key terms, inline code, and properly tagged fenced code blocks (e.g. \`\`\`python, \`\`\`sql, \`\`\`ts) when code or formulas help clarity.
5. INTEGRITY: Never claim to alter verified SkillProof proficiency scores directly.`;

  let replyText = '';
  let lastErr: unknown = null;
  const mentorModels: Array<'gemini-4-hydrogen' | 'gemini-3.1-flash-lite'> = [
    'gemini-4-hydrogen',
    'gemini-3.1-flash-lite',
  ];

  outer: for (const model of mentorModels) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const config =
          model === 'gemini-4-hydrogen'
            ? {
                systemInstruction,
                thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
              }
            : { systemInstruction };

        const response = await Promise.race([
          ai.models.generateContent({
            model,
            contents,
            config,
          }),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('TIMEOUT: Gemini mentor request timed out')), 30_000)
          ),
        ]);

        const candidate = (response.text ?? '').trim();
        if (!candidate) {
          throw new MentorServiceError(
            502,
            'AI_EMPTY_RESPONSE',
            'AI Mentor received an empty response. Please click Retry.'
          );
        }
        replyText = candidate;
        break outer;
      } catch (err) {
        lastErr = err;
        const classified = err instanceof MentorServiceError ? err : classifyGeminiMentorError(err);
        if (classified.code === 'AI_KEY_INVALID' || classified.code === 'AI_KEY_MISSING') {
          console.error('[AI Mentor Error]', classified.code, err instanceof Error ? err.message : err);
          throw classified;
        }
        const shouldRetrySameModel =
          attempt === 0 &&
          (classified.code === 'AI_UPSTREAM_ERROR' || classified.code === 'AI_EMPTY_RESPONSE');
        if (shouldRetrySameModel) {
          continue;
        }
        console.warn(
          `[AI Mentor] ${model} failed (${classified.code}):`,
          err instanceof Error ? err.message : err
        );
        // Break inner loop to fall back to next configured Gemini model (e.g. gemini-3.1-flash-lite)
        break;
      }
    }
  }

  if (!replyText) {
    throw lastErr instanceof MentorServiceError
      ? lastErr
      : new MentorServiceError(502, 'AI_UPSTREAM_ERROR', 'AI Mentor failed to generate a reply. Please click Retry.');
  }

  const nextRecommendedAction = activeStep
    ? `Continue "${activeStep.skillName}" in your Learning Roadmap`
    : `Review your ${profile?.courseName || career.title} study plan`;

  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO ai_interactions (id, user_id, role, message, hint_level, context_skill_id, created_at)
     VALUES (?, ?, 'user', ?, ?, ?, ?)`
  ).run(`msg-${crypto.randomUUID()}`, userId, safeQuestion, hintLevel, contextSkillId ?? null, now);

  db.prepare(
    `INSERT INTO ai_interactions (id, user_id, role, message, hint_level, context_skill_id, created_at)
     VALUES (?, ?, 'assistant', ?, ?, ?, ?)`
  ).run(
    `msg-${crypto.randomUUID()}`,
    userId,
    replyText,
    hintLevel,
    contextSkillId ?? null,
    new Date(Date.now() + 10).toISOString()
  );

  return {
    reply: replyText,
    hintStageLabel: hintStages[hintLevel],
    nextRecommendedAction,
    usedAi: true,
  };
}

export async function synthesizeEntryLearnerProfile(
  userId: string,
  draftResult: Omit<EntryAssessmentResult, 'aiProfile'>
): Promise<EntryAiProfileSummary> {
  const profile = getLearnerProfile(userId);
  const domainMeta = getDomainMeta(draftResult.domainId);
  const weeklyHours = profile?.weeklyHours ?? 8;

  const fallbackSummary = (): Omit<EntryAiProfileSummary, 'usedAi'> => {
    const strongLabel =
      draftResult.strongTopics.length > 0
        ? draftResult.strongTopics.slice(0, 3).join(', ')
        : 'foundational reasoning';
    const weakLabel =
      draftResult.weakTopics.length > 0
        ? draftResult.weakTopics.slice(0, 3).join(', ')
        : 'applied problem-solving depth';

    return {
      strengthsSummary: `You demonstrated solid accuracy (${draftResult.scorePercent}% · ${draftResult.skillLevel}) in ${strongLabel} within ${draftResult.courseName}.`,
      weakAreasSummary:
        draftResult.weakTopics.length > 0
          ? `Prioritize strengthening ${weakLabel} next to build consistent confidence across ${domainMeta.name} core modules.`
          : `No major baseline gaps detected — continue advancing into applied ${draftResult.courseName} synthesis and case work.`,
      recommendedPace: `At ${weeklyHours} hours/week, allocate ~${Math.max(2, Math.round(weeklyHours * 0.55))}h to your priority weak subjects and ~${Math.max(2, Math.round(weeklyHours * 0.45))}h to applied drills.`,
      nextSteps: [
        `Review ${draftResult.weakTopics[0] || draftResult.courseName} foundations in your Learning Roadmap`,
        `Practice 2 targeted drills in ${draftResult.subjectBreakdown[draftResult.subjectBreakdown.length - 1]?.subject || domainMeta.name}`,
        `Use the AI Mentor at Hint Stage 1–2 whenever you hit a tricky concept`,
      ],
    };
  };

  const prompt = `Synthesize a supportive, concrete entry diagnostic profile for learner ${profile?.displayName || 'Student'}:
- Domain: ${domainMeta.name}
- Course: ${draftResult.courseName}
- Overall Score: ${draftResult.scorePercent}% (${draftResult.correctCount}/${draftResult.totalCount}) -> Classified Level: ${draftResult.skillLevel}
- Subject Breakdown: ${JSON.stringify(draftResult.subjectBreakdown)}
- Strong Topics: ${draftResult.strongTopics.join(', ') || 'None'}
- Weak Topics: ${draftResult.weakTopics.join(', ') || 'None'}
- Weekly Study Hours: ${weeklyHours}
- Primary Goal: ${profile?.primaryGoal || 'Academic Mastery'}`;

  const res = await invokeStructuredGemini(
    prompt,
    'You are NEXORA Learner Intelligence Architect. Summarize baseline assessment strengths, prioritized study gaps, weekly pace, and 3 concrete next steps. Never claim formal certification.',
    {
      type: Type.OBJECT,
      properties: {
        strengthsSummary: { type: Type.STRING },
        weakAreasSummary: { type: Type.STRING },
        recommendedPace: { type: Type.STRING },
        nextSteps: { type: Type.ARRAY, items: { type: Type.STRING } },
      },
      required: ['strengthsSummary', 'weakAreasSummary', 'recommendedPace', 'nextSteps'],
    },
    EntryProfileSummarySchema,
    fallbackSummary,
    5_000
  );

  return {
    ...res.result,
    usedAi: res.usedAi,
  };
}
