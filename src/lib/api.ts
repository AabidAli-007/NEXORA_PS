import type {
  AcademicDomainId,
  AcademicMapping,
  AgentRunLog,
  AssessmentAttempt,
  AssessmentQuestion,
  BossChallenge,
  CareerProfile,
  CareerQuestMission,
  DailyChallenge,
  EntryAssessmentResult,
  EntryQuestionItem,
  LearnerProfile,
  LearnerSkill,
  LearningResource,
  ReadinessResult,
  RoadmapStep,
  SkillEvidence,
} from '../core/types';
import type { AssessmentGradingOutput } from '../core/assessment';
import type { DomainMeta } from '../data/domainsCatalog';

export interface ProjectSubmissionRecord {
  id: string;
  title: string;
  skillId: string;
  repoUrl: string | null;
  description: string;
  detectedStack: string[];
  reviewStatus: string;
  reviewerNotes: string;
  createdAt: string;
}

export interface GamificationPayload {
  totalXp: number;
  level: {
    level: number;
    name: string;
    minXp: number;
    nextXp: number | null;
  };
  progressPercent: number;
  xpToNext: number;
  streak: {
    current: number;
    longest: number;
    lastActiveDate: string | null;
    activityDates: string[];
  };
  xpHistory: {
    id: string;
    activityType: string;
    xpAmount: number;
    description: string;
    createdAt: string;
  }[];
  earnedAchievements: { achievement_id: string; awarded_at: string }[];
}

export interface DashboardPayload {
  profile: LearnerProfile;
  domainMeta?: DomainMeta;
  entryAssessment?: EntryAssessmentResult | null;
  career: CareerProfile;
  skills: LearnerSkill[];
  evidence: SkillEvidence[];
  readiness: ReadinessResult;
  roadmap: {
    roadmapId: string;
    steps: RoadmapStep[];
  };
  attempts: AssessmentAttempt[];
  agentRuns: AgentRunLog[];
  snapshots: { readiness_score: number; created_at: string; career_id: string }[];
  projects: ProjectSubmissionRecord[];
  gamification: GamificationPayload;
}

export interface PlayStatePayload {
  dailyChallenges: (Omit<DailyChallenge, 'question'> & {
    solved: boolean;
    question: Omit<AssessmentQuestion, 'correctAnswer'>;
  })[];
  quests: (CareerQuestMission & { completed: boolean; unlocked: boolean })[];
  bossChallenges: BossChallenge[];
  achievementsCatalog: {
    id: string;
    title: string;
    description: string;
    criteria: string;
  }[];
  leaderboard: {
    rank: number;
    displayName: string;
    isCurrentUser: boolean;
    totalXp: number;
    levelName: string;
  }[];
}

export interface InstitutionalAnalyticsPayload {
  privacyNote: string;
  totalLearners: number;
  careerDistribution: { careerId: string; careerTitle: string; learnerCount: number }[];
  skillGapTrends: { skillName: string; provenCount: number; declaredOnlyCount: number }[];
  assessmentSummary: { attempts: number; avgScore: number };
}

export interface MentorMessage {
  id: string;
  role: 'user' | 'assistant';
  message: string;
  hintLevel: number;
  contextSkillId: string | null;
  createdAt: string;
}

export interface OAuthProviderInfo {
  configured: boolean;
  authPath: string;
  callbackUrl: string;
  requiredEnvVars: string[];
}

export interface OAuthProvidersPayload {
  google: OAuthProviderInfo;
  microsoft: OAuthProviderInfo;
  geminiConfigured: boolean;
}

export interface EntryTestStartPayload {
  sessionId: string;
  domainId: AcademicDomainId;
  domainMeta: DomainMeta;
  courseId: string;
  courseName: string;
  totalQuestions: number;
  savedAnswers: Record<string, string>;
  questions: Omit<EntryQuestionItem, 'correctAnswer' | 'explanation'>[];
}

export class ApiError extends Error {
  status: number;
  details: Record<string, unknown>;

  constructor(message: string, status: number, details: Record<string, unknown> = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

const AUTH_TOKEN_KEY = 'nexora_auth_token';
let inMemoryAuthToken: string | null = null;

export function getAuthToken(): string | null {
  if (inMemoryAuthToken) return inMemoryAuthToken;
  try {
    return window.sessionStorage.getItem(AUTH_TOKEN_KEY) || window.localStorage.getItem(AUTH_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setAuthToken(token: string | null, rememberMe = true): void {
  inMemoryAuthToken = token;
  try {
    if (!token) {
      window.sessionStorage.removeItem(AUTH_TOKEN_KEY);
      window.localStorage.removeItem(AUTH_TOKEN_KEY);
      return;
    }
    window.sessionStorage.setItem(AUTH_TOKEN_KEY, token);
    if (rememberMe) {
      window.localStorage.setItem(AUTH_TOKEN_KEY, token);
    } else {
      window.localStorage.removeItem(AUTH_TOKEN_KEY);
    }
  } catch {
    // Fallback to in-memory token if iframe blocks storage
  }
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  let res: Response;
  const token = getAuthToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options?.headers as Record<string, string> | undefined) ?? {}),
  };
  if (token && !headers.Authorization && !headers.authorization) {
    headers.Authorization = `Bearer ${token}`;
  }

  try {
    res = await fetch(url, {
      credentials: 'include',
      ...options,
      headers,
    });
  } catch (err) {
    throw new ApiError(
      err instanceof Error ? err.message : 'Network connection failed. Check your connection and retry.',
      0,
      { isNetworkError: true }
    );
  }
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new ApiError(String(data.error || `Request failed (${res.status})`), res.status, data);
  }
  return data as T;
}

export const api = {
  setToken: (token: string | null, rememberMe = true) => setAuthToken(token, rememberMe),
  clearToken: () => setAuthToken(null),
  me: async () => {
    const res = await request<{ authenticated: boolean; user: unknown; dashboard: DashboardPayload | null }>(
      '/api/auth/me'
    );
    if (!res.authenticated) {
      setAuthToken(null);
    }
    return res;
  },
  login: async (email: string, password: string, rememberMe = true) => {
    const res = await request<{ token?: string; dashboard: DashboardPayload }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password, rememberMe }),
    });
    if (res.token) setAuthToken(res.token, rememberMe);
    return res;
  },
  register: async (email: string, password: string, displayName: string, rememberMe = true) => {
    const res = await request<{
      token?: string;
      dashboard: DashboardPayload;
      verificationPreviewCode?: string;
    }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, displayName, rememberMe }),
    });
    if (res.token) setAuthToken(res.token, rememberMe);
    return res;
  },
  verifyEmail: (code: string) =>
    request<{ ok: boolean; dashboard: DashboardPayload }>('/api/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify({ code }),
    }),
  resendVerification: () =>
    request<{ ok: boolean; message: string; verificationPreviewCode?: string }>(
      '/api/auth/resend-verification',
      { method: 'POST' }
    ),
  forgotPassword: (email: string) =>
    request<{ ok: boolean; message: string; resetPreviewToken?: string }>('/api/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),
  resetPassword: async (token: string, newPassword: string) => {
    const res = await request<{ ok: boolean; token?: string; dashboard: DashboardPayload }>(
      '/api/auth/reset-password',
      {
        method: 'POST',
        body: JSON.stringify({ token, newPassword }),
      }
    );
    if (res.token) setAuthToken(res.token, true);
    return res;
  },
  getOAuthProviders: () => request<OAuthProvidersPayload>('/api/auth/oauth/providers'),
  getOAuthUrl: (provider: 'google' | 'microsoft', origin: string) =>
    request<{ url: string }>(`/api/auth/oauth/${provider}/url?origin=${encodeURIComponent(origin)}`),
  demoLogin: async () => {
    const res = await request<{ token?: string; dashboard: DashboardPayload }>('/api/auth/demo-login', {
      method: 'POST',
    });
    if (res.token) setAuthToken(res.token, true);
    return res;
  },
  logout: async () => {
    try {
      return await request<{ ok: boolean }>('/api/auth/logout', { method: 'POST' });
    } finally {
      setAuthToken(null);
    }
  },

  getDashboard: () => request<DashboardPayload>('/api/dashboard'),
  saveOnboarding: (payload: Record<string, unknown>) =>
    request<{ dashboard: DashboardPayload; orchestration: unknown }>('/api/profile/onboarding', {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  saveOnboardingStep: (payload: Record<string, unknown>) =>
    request<{ dashboard: DashboardPayload }>('/api/onboarding/step', {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  startEntryTest: (payload?: { questionCount?: number; reset?: boolean }) =>
    request<EntryTestStartPayload>('/api/onboarding/entry-test/start', {
      method: 'POST',
      body: JSON.stringify(payload ?? {}),
    }),
  saveEntryAnswer: (payload: {
    sessionId: string;
    questionId?: string;
    answer?: string;
    answers?: Record<string, string>;
  }) =>
    request<{ ok: boolean; answeredCount: number; savedAnswers: Record<string, string> }>(
      '/api/onboarding/entry-test/answer',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    ),
  submitEntryTest: (payload: { sessionId: string; answers?: Record<string, string> }) =>
    request<{ result: EntryAssessmentResult; dashboard: DashboardPayload }>(
      '/api/onboarding/entry-test/submit',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    ),
  completeOnboarding: () =>
    request<{ dashboard: DashboardPayload; orchestration: unknown }>('/api/onboarding/complete', {
      method: 'POST',
    }),
  selectCourse: (payload: {
    domainId: AcademicDomainId;
    courseId: string;
    courseName?: string;
    specialization?: string;
  }) =>
    request<{ dashboard: DashboardPayload; orchestration: unknown }>('/api/courses/select', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateProfile: (payload: Record<string, unknown>) =>
    request<{ dashboard: DashboardPayload }>('/api/profile', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  addDeclaredSkill: (payload: {
    skillId: string;
    skillName: string;
    category: LearnerSkill['category'];
    declaredLevel: 'Beginner' | 'Intermediate' | 'Advanced';
  }) =>
    request<{ dashboard: DashboardPayload }>('/api/skills', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  submitSkillEvidence: (payload: {
    skillId: string;
    skillName: string;
    evidenceType: 'PROJECT' | 'CREDENTIAL' | 'MENTOR_REVIEW';
    title: string;
    description: string;
    artifactUrl?: string;
  }) =>
    request<{ dashboard: DashboardPayload; orchestration: unknown }>('/api/skills/evidence', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getMappings: () => request<{ mappings: AcademicMapping[] }>('/api/mappings'),
  createMapping: (payload: Record<string, unknown>) =>
    request<{ mappings: AcademicMapping[] }>('/api/mappings', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getCareers: () =>
    request<{ careers: CareerProfile[]; resources: LearningResource[] }>('/api/careers'),
  selectCareer: (careerId: string) =>
    request<{ dashboard: DashboardPayload; orchestration: unknown }>('/api/careers/select', {
      method: 'POST',
      body: JSON.stringify({ careerId }),
    }),

  updateRoadmapStep: (stepId: string, payload: Record<string, unknown>) =>
    request<{ dashboard: DashboardPayload }>(`/api/roadmap/steps/${stepId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  getAssessment: (skillId: string) =>
    request<{ skillId: string; questions: Omit<AssessmentQuestion, 'correctAnswer'>[] }>(
      `/api/assessments/${skillId}`
    ),
  submitAssessment: (
    skillId: string,
    payload: { answers: { questionId: string; answer: string }[]; practicalNotes?: string }
  ) =>
    request<{
      evaluation: AssessmentGradingOutput;
      orchestration: unknown;
      dashboard: DashboardPayload;
    }>(`/api/assessments/${skillId}/submit`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getMentorHistory: () =>
    request<{ messages: MentorMessage[]; aiConfigured?: boolean }>('/api/mentor/history'),
  clearMentorHistory: () =>
    request<{ ok: boolean }>('/api/mentor/history', { method: 'DELETE' }),
  sendMentorMessage: (payload: {
    message: string;
    hintLevel: 1 | 2 | 3 | 4;
    contextSkillId?: string;
  }) =>
    request<{
      reply: string;
      hintStageLabel: string;
      nextRecommendedAction: string;
      usedAi: boolean;
      aiConfigured?: boolean;
    }>('/api/mentor/chat', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getPlayState: () => request<PlayStatePayload>('/api/play/state'),
  submitDailyChallenge: (challengeId: string, answer: string) =>
    request<{
      passed: boolean;
      explanation: string;
      xpResult: { awarded: boolean; xpAmount: number; totalXp: number };
      integrityNote: string;
      dashboard: DashboardPayload;
    }>(`/api/play/daily/${challengeId}/submit`, {
      method: 'POST',
      body: JSON.stringify({ answer }),
    }),
  completeQuest: (questId: string) =>
    request<{
      xpResult: { awarded: boolean; xpAmount: number; totalXp: number };
      dashboard: DashboardPayload;
    }>(`/api/play/quests/${questId}/complete`, { method: 'POST' }),
  submitBossChallenge: (
    bossId: string,
    payload: { summary: string; repoUrl?: string; checkedCriteriaIds: string[] }
  ) =>
    request<{
      xpResult: { awarded: boolean; xpAmount: number; totalXp: number };
      rubricCoverage: number;
      executionDisclaimer: string;
      dashboard: DashboardPayload;
    }>(`/api/play/boss/${bossId}/submit`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  analyzeGitHubRepo: (payload: { repoUrl: string; targetSkillId: string; title?: string }) =>
    request<{
      canonicalUrl: string;
      detectedStack: string[];
      fetchedLive: boolean;
      notes: string;
      orchestration: unknown;
      dashboard: DashboardPayload;
    }>('/api/projects/analyze-github', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getInstitutionalAnalytics: () =>
    request<InstitutionalAnalyticsPayload>('/api/institutional/analytics'),
};
