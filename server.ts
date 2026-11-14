import 'dotenv/config';
import path from 'node:path';
import crypto from 'node:crypto';
import express from 'express';
import cookieParser from 'cookie-parser';
import { createServer as createViteServer } from 'vite';
import { z } from 'zod';
import {
  db,
  generateOrSyncRoadmapForUser,
  getAcademicMappings,
  getAgentRuns,
  getAssessmentAttempts,
  getLatestEntryAssessment,
  getLearnerProfile,
  getLearnerSkills,
  getRoadmapForUser,
  getSkillEvidence,
  hashPassword,
  upsertTopicPerformance,
  verifyPassword,
} from './server/db';
import {
  type AuthenticatedRequest,
  createSession,
  deleteSession,
  getCookieOptions,
  rateLimit,
  requireAuth,
  resolvePublicBaseUrl,
  resolveUserFromRequest,
  SESSION_COOKIE_NAME,
} from './server/auth';
import {
  askAdaptiveMentor,
  getGeminiKeyConfigured,
  MentorServiceError,
  runOrchestratorEvent,
  synthesizeEntryLearnerProfile,
} from './server/agents';
import {
  ACHIEVEMENTS_CATALOG,
  BOSS_CHALLENGES,
  CAREERS_CATALOG,
  CAREER_QUESTS,
  DAILY_CHALLENGES,
  getQuestionsForSkill,
  LEARNING_RESOURCES,
} from './src/data/catalog';
import { ACADEMIC_DOMAINS, getCourseMeta, getDomainMeta } from './src/data/domainsCatalog';
import { ENTRY_QUESTION_BANK, selectEntryQuestions } from './src/data/entryQuestionsBank';
import { gradeEntryAssessment } from './src/core/entryAssessment';
import type { AcademicDomainId } from './src/core/types';
import { calculateCareerReadiness } from './src/core/readiness';
import { evaluateAssessmentSubmission } from './src/core/assessment';
import {
  computeLevelFromXp,
  computeUpdatedStreak,
  getLocalDateString,
  SERVER_XP_REWARDS,
  type XpActivityType,
} from './src/core/gamification';
import { sanitizeUntrustedPromptText, validateGitHubRepoUrl } from './src/core/security';
import { arePrerequisitesMet, validateDependencyGraph } from './src/core/dependencies';

const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

const isProd = process.env.NODE_ENV === 'production';

function setSessionCookie(
  req: express.Request,
  res: express.Response,
  token: string,
  maxAgeMs = 30 * 24 * 60 * 60 * 1000
) {
  res.cookie(SESSION_COOKIE_NAME, token, getCookieOptions(req, maxAgeMs));
}

function sha256Hex(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function renderOAuthPopupHtml(payload: {
  ok: boolean;
  provider: 'google' | 'microsoft';
  token?: string;
  error?: string;
  targetOrigin?: string;
}) {
  const safePayload = JSON.stringify({
    type: payload.ok ? 'OAUTH_AUTH_SUCCESS' : 'OAUTH_AUTH_ERROR',
    provider: payload.provider,
    token: payload.token || null,
    error: payload.error || null,
  });
  const origin = payload.targetOrigin && payload.targetOrigin !== 'null' ? JSON.stringify(payload.targetOrigin) : '"*"';
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>NEXORA Authentication</title></head>
<body style="font-family: sans-serif; background: #F8F6EF; color: #24231F; display:flex; align-items:center; justify-content:center; min-height:100vh; margin:0;">
  <div style="text-align:center; padding:24px;">
    <p style="font-weight:600; margin-bottom:8px;">${
      payload.ok ? 'Sign-in complete. Returning to NEXORA…' : 'Authentication could not be completed.'
    }</p>
    <p style="font-size:13px; color:#77764B;">${
      payload.ok ? 'You can close this window if it does not close automatically.' : (payload.error || 'Please try again.')
    }</p>
  </div>
  <script>
    (function () {
      try {
        if (window.opener) {
          window.opener.postMessage(${safePayload}, ${origin});
        }
      } catch (e) {}
      setTimeout(function () { window.close(); }, 350);
    })();
  </script>
</body>
</html>`;
}

function awardServerXp(
  userId: string,
  activityType: XpActivityType,
  eventKey: string,
  description: string
): { awarded: boolean; xpAmount: number; totalXp: number } {
  const xpAmount = SERVER_XP_REWARDS[activityType];
  const existing = db
    .prepare(`SELECT id FROM xp_transactions WHERE user_id = ? AND event_key = ?`)
    .get(userId, eventKey);

  if (existing) {
    const total = (
      db.prepare(`SELECT COALESCE(SUM(xp_amount), 0) as total FROM xp_transactions WHERE user_id = ?`).get(
        userId
      ) as { total: number }
    ).total;
    return { awarded: false, xpAmount: 0, totalXp: total };
  }

  db.prepare(
    `INSERT INTO xp_transactions (id, user_id, activity_type, event_key, xp_amount, description, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(`xp-${crypto.randomUUID()}`, userId, activityType, eventKey, xpAmount, description, new Date().toISOString());

  const total = (
    db.prepare(`SELECT COALESCE(SUM(xp_amount), 0) as total FROM xp_transactions WHERE user_id = ?`).get(
      userId
    ) as { total: number }
  ).total;

  return { awarded: true, xpAmount, totalXp: total };
}

function recordStreakActivity(userId: string, timezone: string) {
  const today = getLocalDateString(new Date(), timezone);
  const row = db.prepare(`SELECT * FROM learning_streaks WHERE user_id = ?`).get(userId) as
    | { current_streak: number; longest_streak: number; last_active_date: string | null; activity_dates_json: string }
    | undefined;

  const updated = computeUpdatedStreak(
    row?.last_active_date ?? null,
    row?.current_streak ?? 0,
    row?.longest_streak ?? 0,
    today
  );
  const prevDates: string[] = row ? JSON.parse(row.activity_dates_json || '[]') : [];
  const dateSet = new Set(prevDates);
  dateSet.add(today);
  const nextDates = Array.from(dateSet).slice(-30);

  if (!row) {
    db.prepare(
      `INSERT INTO learning_streaks (user_id, current_streak, longest_streak, last_active_date, activity_dates_json)
       VALUES (?, ?, ?, ?, ?)`
    ).run(userId, updated.currentStreak, updated.longestStreak, updated.lastActiveDate, JSON.stringify(nextDates));
  } else {
    db.prepare(
      `UPDATE learning_streaks
       SET current_streak = ?, longest_streak = ?, last_active_date = ?, activity_dates_json = ?
       WHERE user_id = ?`
    ).run(updated.currentStreak, updated.longestStreak, updated.lastActiveDate, JSON.stringify(nextDates), userId);
  }

  if (updated.currentStreak >= 7) {
    grantAchievement(userId, 'ach-streak-7');
  }
}

function grantAchievement(userId: string, achievementId: string): boolean {
  const existing = db
    .prepare(`SELECT id FROM learner_achievements WHERE user_id = ? AND achievement_id = ?`)
    .get(userId, achievementId);
  if (existing) return false;
  db.prepare(
    `INSERT INTO learner_achievements (id, user_id, achievement_id, awarded_at) VALUES (?, ?, ?, ?)`
  ).run(`lach-${crypto.randomUUID()}`, userId, achievementId, new Date().toISOString());
  return true;
}

function recordReadinessSnapshot(userId: string, careerId: string, readinessScore: number) {
  db.prepare(
    `INSERT INTO readiness_snapshots (id, user_id, career_id, readiness_score, created_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(`snap-${crypto.randomUUID()}`, userId, careerId, readinessScore, new Date().toISOString());
}

function buildUserDashboardPayload(userId: string) {
  const profile = getLearnerProfile(userId);
  if (!profile) return null;

  const skills = getLearnerSkills(userId);
  const evidence = getSkillEvidence(userId);
  const attempts = getAssessmentAttempts(userId);
  const career =
    CAREERS_CATALOG.find((c) => c.id === profile.targetCareerId) ?? CAREERS_CATALOG[0];
  const readiness = calculateCareerReadiness(career, skills);
  const roadmap = getRoadmapForUser(userId, career.id);
  const agentRuns = getAgentRuns(userId);

  const xpRows = db
    .prepare(`SELECT * FROM xp_transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 25`)
    .all(userId) as Record<string, unknown>[];
  const totalXp = (
    db.prepare(`SELECT COALESCE(SUM(xp_amount), 0) as total FROM xp_transactions WHERE user_id = ?`).get(
      userId
    ) as { total: number }
  ).total;
  const levelInfo = computeLevelFromXp(totalXp);

  const streakRow = db.prepare(`SELECT * FROM learning_streaks WHERE user_id = ?`).get(userId) as
    | { current_streak: number; longest_streak: number; last_active_date: string | null; activity_dates_json: string }
    | undefined;

  const earnedAchievements = db
    .prepare(`SELECT * FROM learner_achievements WHERE user_id = ?`)
    .all(userId) as { achievement_id: string; awarded_at: string }[];

  const projects = db
    .prepare(`SELECT * FROM project_submissions WHERE user_id = ? ORDER BY created_at DESC`)
    .all(userId) as Record<string, unknown>[];

  const snapshots = db
    .prepare(`SELECT readiness_score, created_at, career_id FROM readiness_snapshots WHERE user_id = ? ORDER BY created_at ASC LIMIT 15`)
    .all(userId) as { readiness_score: number; created_at: string; career_id: string }[];

  const entryAssessment = getLatestEntryAssessment(userId);
  const domainMeta = getDomainMeta(profile.domainId);

  return {
    profile,
    domainMeta,
    entryAssessment,
    career,
    skills,
    evidence,
    readiness,
    roadmap,
    attempts,
    agentRuns,
    snapshots,
    projects: projects.map((p) => ({
      id: String(p.id),
      title: String(p.title),
      skillId: String(p.skill_id),
      repoUrl: p.repo_url ? String(p.repo_url) : null,
      description: String(p.description),
      detectedStack: JSON.parse(String(p.detected_stack_json || '[]')),
      reviewStatus: String(p.review_status),
      reviewerNotes: String(p.reviewer_notes),
      createdAt: String(p.created_at),
    })),
    gamification: {
      totalXp,
      level: levelInfo.current,
      progressPercent: levelInfo.progressPercent,
      xpToNext: levelInfo.xpToNext,
      streak: {
        current: streakRow?.current_streak ?? 0,
        longest: streakRow?.longest_streak ?? 0,
        lastActiveDate: streakRow?.last_active_date ?? null,
        activityDates: streakRow ? JSON.parse(streakRow.activity_dates_json || '[]') : [],
      },
      xpHistory: xpRows.map((x) => ({
        id: String(x.id),
        activityType: String(x.activity_type),
        xpAmount: Number(x.xp_amount),
        description: String(x.description),
        createdAt: String(x.created_at),
      })),
      earnedAchievements,
    },
  };
}

// ---------------- AUTH ROUTES ----------------

function issueVerificationCode(userId: string): string {
  const code = String(crypto.randomInt(100000, 999999));
  const now = new Date();
  const expires = new Date(now.getTime() + 15 * 60 * 1000);
  db.prepare(`DELETE FROM email_verification_tokens WHERE user_id = ?`).run(userId);
  db.prepare(
    `INSERT INTO email_verification_tokens (id, user_id, code_hash, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(`evtok-${crypto.randomUUID()}`, userId, sha256Hex(code), expires.toISOString(), now.toISOString());
  return code;
}

function upsertOAuthUser(params: {
  provider: 'google' | 'microsoft';
  subject: string;
  email: string;
  displayName: string;
}): string {
  const normalizedEmail = params.email.trim().toLowerCase();
  const existing = db
    .prepare(`SELECT id FROM users WHERE email = ? OR (auth_provider = ? AND provider_subject = ?)`)
    .get(normalizedEmail, params.provider, params.subject) as { id: string } | undefined;

  const now = new Date().toISOString();
  if (existing) {
    db.prepare(
      `UPDATE users SET email_verified = 1, auth_provider = ?, provider_subject = ? WHERE id = ?`
    ).run(params.provider, params.subject, existing.id);
    return existing.id;
  }

  const userId = `user-${crypto.randomUUID()}`;
  const { hash, salt } = hashPassword(crypto.randomBytes(24).toString('hex'));
  db.prepare(
    `INSERT INTO users (id, email, password_hash, password_salt, role, is_demo, email_verified, auth_provider, provider_subject, created_at)
     VALUES (?, ?, ?, ?, 'student', 0, 1, ?, ?, ?)`
  ).run(userId, normalizedEmail, hash, salt, params.provider, params.subject, now);

  db.prepare(
    `INSERT INTO learner_profiles (
      user_id, display_name, onboarding_completed, onboarding_step, domain_id, course_id, course_name,
      target_career_id, weekly_hours, created_at, updated_at
    ) VALUES (?, ?, 0, 1, 'engineering', 'eng-cse', 'Computer Science Engineering', 'full-stack-developer', 8, ?, ?)`
  ).run(userId, params.displayName.trim() || normalizedEmail.split('@')[0], now, now);

  db.prepare(
    `INSERT INTO learning_streaks (user_id, current_streak, longest_streak, last_active_date, activity_dates_json)
     VALUES (?, 0, 0, NULL, '[]')`
  ).run(userId);

  return userId;
}

const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  displayName: z.string().min(2).max(80),
  rememberMe: z.boolean().optional().default(true),
});

app.post('/api/auth/register', rateLimit(20, 60_000), (req, res) => {
  const parsed = RegisterSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Valid email, display name, and 8+ char password are required.' });
  }
  const email = parsed.data.email.trim().toLowerCase();
  const existing = db.prepare(`SELECT id FROM users WHERE email = ?`).get(email);
  if (existing) {
    return res.status(409).json({ error: 'An account with this email already exists.' });
  }

  const userId = `user-${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  const { hash, salt } = hashPassword(parsed.data.password);

  db.prepare(
    `INSERT INTO users (id, email, password_hash, password_salt, role, is_demo, email_verified, auth_provider, created_at)
     VALUES (?, ?, ?, ?, 'student', 0, 0, 'local', ?)`
  ).run(userId, email, hash, salt, now);

  db.prepare(
    `INSERT INTO learner_profiles (
      user_id, display_name, onboarding_completed, onboarding_step, domain_id, course_id, course_name,
      target_career_id, weekly_hours, created_at, updated_at
    ) VALUES (?, ?, 0, 1, 'engineering', 'eng-cse', 'Computer Science Engineering', 'full-stack-developer', 8, ?, ?)`
  ).run(userId, parsed.data.displayName.trim(), now, now);

  db.prepare(
    `INSERT INTO learning_streaks (user_id, current_streak, longest_streak, last_active_date, activity_dates_json)
     VALUES (?, 0, 0, NULL, '[]')`
  ).run(userId);

  const verificationCode = issueVerificationCode(userId);
  const session = createSession(userId, parsed.data.rememberMe);
  setSessionCookie(req, res, session.token, session.maxAgeMs);

  return res.status(201).json({
    token: session.token,
    user: { id: userId, email, emailVerified: false, authProvider: 'local', role: 'student', isDemo: false },
    verificationPreviewCode: verificationCode,
    dashboard: buildUserDashboardPayload(userId),
  });
});

app.post('/api/auth/verify-email', requireAuth, rateLimit(20, 60_000), (req: AuthenticatedRequest, res) => {
  const schema = z.object({ code: z.string().trim().min(6).max(6) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Enter the 6-digit verification code.' });
  }
  const userId = req.user!.id;
  const row = db
    .prepare(
      `SELECT id, code_hash, expires_at FROM email_verification_tokens
       WHERE user_id = ? ORDER BY created_at DESC LIMIT 1`
    )
    .get(userId) as { id: string; code_hash: string; expires_at: string } | undefined;

  if (!row || new Date(row.expires_at).getTime() < Date.now()) {
    return res.status(400).json({ error: 'Verification code expired or not found. Request a new code.' });
  }
  if (sha256Hex(parsed.data.code) !== row.code_hash) {
    return res.status(400).json({ error: 'Invalid verification code. Check your 6-digit code and try again.' });
  }

  db.prepare(`UPDATE users SET email_verified = 1 WHERE id = ?`).run(userId);
  db.prepare(`DELETE FROM email_verification_tokens WHERE user_id = ?`).run(userId);

  return res.json({
    ok: true,
    user: { ...req.user, emailVerified: true },
    dashboard: buildUserDashboardPayload(userId),
  });
});

app.post('/api/auth/resend-verification', requireAuth, rateLimit(10, 60_000), (req: AuthenticatedRequest, res) => {
  const code = issueVerificationCode(req.user!.id);
  return res.json({
    ok: true,
    message: 'A new 6-digit verification code has been generated.',
    verificationPreviewCode: code,
  });
});

app.post('/api/auth/forgot-password', rateLimit(15, 60_000), (req, res) => {
  const schema = z.object({ email: z.string().email() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }
  const email = parsed.data.email.trim().toLowerCase();
  const user = db.prepare(`SELECT id, is_demo FROM users WHERE email = ?`).get(email) as
    | { id: string; is_demo: number }
    | undefined;

  if (!user || user.is_demo) {
    return res.json({
      ok: true,
      message: 'If an eligible account exists for this email, password reset instructions have been prepared.',
    });
  }

  const rawToken = crypto.randomBytes(24).toString('hex');
  const now = new Date();
  const expires = new Date(now.getTime() + 30 * 60 * 1000);
  db.prepare(
    `INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at, used_at, created_at)
     VALUES (?, ?, ?, ?, NULL, ?)`
  ).run(`prt-${crypto.randomUUID()}`, user.id, sha256Hex(rawToken), expires.toISOString(), now.toISOString());

  return res.json({
    ok: true,
    message: 'Password reset token generated (valid for 30 minutes).',
    resetPreviewToken: rawToken,
  });
});

app.post('/api/auth/reset-password', rateLimit(15, 60_000), (req, res) => {
  const schema = z.object({
    token: z.string().trim().min(12),
    newPassword: z.string().min(8).max(128),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Valid reset token and 8+ character password are required.' });
  }

  const row = db
    .prepare(
      `SELECT id, user_id, expires_at, used_at FROM password_reset_tokens WHERE token_hash = ?`
    )
    .get(sha256Hex(parsed.data.token)) as
    | { id: string; user_id: string; expires_at: string; used_at: string | null }
    | undefined;

  if (!row || row.used_at || new Date(row.expires_at).getTime() < Date.now()) {
    return res.status(400).json({ error: 'Reset token is invalid, expired, or has already been used.' });
  }

  const { hash, salt } = hashPassword(parsed.data.newPassword);
  const now = new Date().toISOString();
  db.prepare(`UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?`).run(hash, salt, row.user_id);
  db.prepare(`UPDATE password_reset_tokens SET used_at = ? WHERE id = ?`).run(now, row.id);
  db.prepare(`DELETE FROM sessions WHERE user_id = ?`).run(row.user_id);

  const session = createSession(row.user_id, true);
  setSessionCookie(req, res, session.token, session.maxAgeMs);

  const uRow = db
    .prepare(`SELECT id, email, email_verified, auth_provider, role, is_demo FROM users WHERE id = ?`)
    .get(row.user_id) as {
      id: string;
      email: string;
      email_verified: number;
      auth_provider: string;
      role: string;
      is_demo: number;
    };

  return res.json({
    ok: true,
    token: session.token,
    user: {
      id: uRow.id,
      email: uRow.email,
      emailVerified: Boolean(uRow.email_verified),
      authProvider: uRow.auth_provider,
      role: uRow.role,
      isDemo: Boolean(uRow.is_demo),
    },
    dashboard: buildUserDashboardPayload(row.user_id),
  });
});

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  rememberMe: z.boolean().optional().default(true),
});

app.post('/api/auth/login', rateLimit(25, 60_000), (req, res) => {
  const parsed = LoginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }
  const email = parsed.data.email.trim().toLowerCase();
  const row = db
    .prepare(
      `SELECT id, email, password_hash, password_salt, email_verified, auth_provider, role, is_demo
       FROM users WHERE email = ?`
    )
    .get(email) as
    | {
        id: string;
        email: string;
        password_hash: string;
        password_salt: string;
        email_verified: number;
        auth_provider: string;
        role: string;
        is_demo: number;
      }
    | undefined;

  if (!row || !verifyPassword(parsed.data.password, row.password_hash, row.password_salt)) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  const session = createSession(row.id, parsed.data.rememberMe);
  setSessionCookie(req, res, session.token, session.maxAgeMs);

  return res.json({
    token: session.token,
    user: {
      id: row.id,
      email: row.email,
      emailVerified: Boolean(row.email_verified),
      authProvider: row.auth_provider || 'local',
      role: row.role,
      isDemo: Boolean(row.is_demo),
    },
    dashboard: buildUserDashboardPayload(row.id),
  });
});

app.post('/api/auth/demo-login', rateLimit(30, 60_000), (req, res) => {
  const row = db
    .prepare(`SELECT id, email, email_verified, auth_provider, role, is_demo FROM users WHERE email = 'demo@nexora.edu'`)
    .get() as
    | {
        id: string;
        email: string;
        email_verified: number;
        auth_provider: string;
        role: string;
        is_demo: number;
      }
    | undefined;

  if (!row) {
    return res.status(404).json({ error: 'Demo learner account is unavailable.' });
  }

  const session = createSession(row.id, true);
  setSessionCookie(req, res, session.token, session.maxAgeMs);

  return res.json({
    token: session.token,
    user: {
      id: row.id,
      email: row.email,
      emailVerified: Boolean(row.email_verified),
      authProvider: row.auth_provider || 'local',
      role: row.role,
      isDemo: true,
    },
    dashboard: buildUserDashboardPayload(row.id),
  });
});

app.post('/api/auth/logout', (req, res) => {
  const cookieToken = req.cookies?.[SESSION_COOKIE_NAME];
  const authHeader = req.headers.authorization;
  const bearerToken =
    authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : undefined;
  if (cookieToken) deleteSession(cookieToken);
  if (bearerToken && bearerToken !== cookieToken) deleteSession(bearerToken);
  const opts = getCookieOptions(req, 0);
  res.clearCookie(SESSION_COOKIE_NAME, {
    path: '/',
    httpOnly: opts.httpOnly,
    sameSite: opts.sameSite,
    secure: opts.secure,
  });
  return res.json({ ok: true });
});

app.get('/api/auth/me', (req, res) => {
  const user = resolveUserFromRequest(req);
  if (!user) {
    return res.json({ authenticated: false, user: null, dashboard: null });
  }
  return res.json({
    authenticated: true,
    user,
    dashboard: buildUserDashboardPayload(user.id),
  });
});

// ---------------- REAL OAUTH 2.0 (GOOGLE & MICROSOFT) ----------------

function isGoogleOAuthConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim());
}

function isMicrosoftOAuthConfigured() {
  return Boolean(process.env.MICROSOFT_CLIENT_ID?.trim() && process.env.MICROSOFT_CLIENT_SECRET?.trim());
}

app.get('/api/auth/oauth/providers', (req, res) => {
  const baseUrl = resolvePublicBaseUrl(req);
  return res.json({
    google: {
      configured: isGoogleOAuthConfigured(),
      authPath: '/api/auth/oauth/google/url',
      callbackUrl: `${baseUrl}/api/auth/oauth/google/callback`,
      requiredEnvVars: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'],
    },
    microsoft: {
      configured: isMicrosoftOAuthConfigured(),
      authPath: '/api/auth/oauth/microsoft/url',
      callbackUrl: `${baseUrl}/api/auth/oauth/microsoft/callback`,
      requiredEnvVars: ['MICROSOFT_CLIENT_ID', 'MICROSOFT_CLIENT_SECRET', 'MICROSOFT_TENANT_ID (optional)'],
    },
    geminiConfigured: getGeminiKeyConfigured(),
  });
});

app.get('/api/auth/oauth/google/url', (req, res) => {
  const baseUrl = resolvePublicBaseUrl(req);
  const callbackUrl = `${baseUrl}/api/auth/oauth/google/callback`;
  if (!isGoogleOAuthConfigured()) {
    return res.status(503).json({
      error:
        'Google OAuth is not configured on this server. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in AI Studio Settings > Secrets and authorize the callback URL below.',
      missingEnvVars: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'],
      callbackUrl,
    });
  }

  const state = crypto.randomBytes(24).toString('hex');
  const now = new Date();
  const expires = new Date(now.getTime() + 10 * 60 * 1000);
  const origin = String(req.query.origin || baseUrl);
  db.prepare(
    `INSERT INTO oauth_states (state, provider, redirect_origin, expires_at, created_at)
     VALUES (?, 'google', ?, ?, ?)`
  ).run(state, origin, expires.toISOString(), now.toISOString());

  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!.trim(),
    redirect_uri: callbackUrl,
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'offline',
    prompt: 'select_account',
    state,
  });

  const url = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  if (req.query.redirect === '1') {
    return res.redirect(url);
  }
  return res.json({ url });
});

app.get(['/api/auth/oauth/google/callback', '/api/auth/oauth/google/callback/'], async (req, res) => {
  const code = String(req.query.code || '');
  const state = String(req.query.state || '');
  const oauthErr = String(req.query.error || '');

  const stateRow = db
    .prepare(`SELECT state, redirect_origin, expires_at FROM oauth_states WHERE state = ? AND provider = 'google'`)
    .get(state) as { state: string; redirect_origin: string; expires_at: string } | undefined;

  if (state) {
    db.prepare(`DELETE FROM oauth_states WHERE state = ?`).run(state);
  }

  if (oauthErr) {
    return res.status(400).send(
      renderOAuthPopupHtml({
        ok: false,
        provider: 'google',
        error: oauthErr,
        targetOrigin: stateRow?.redirect_origin,
      })
    );
  }

  if (!stateRow || new Date(stateRow.expires_at).getTime() < Date.now() || !code) {
    return res.status(400).send(
      renderOAuthPopupHtml({
        ok: false,
        provider: 'google',
        error: 'Invalid or expired OAuth state.',
        targetOrigin: stateRow?.redirect_origin,
      })
    );
  }

  if (!isGoogleOAuthConfigured()) {
    return res.status(503).send(
      renderOAuthPopupHtml({
        ok: false,
        provider: 'google',
        error: 'Google OAuth credentials are not configured.',
        targetOrigin: stateRow.redirect_origin,
      })
    );
  }

  try {
    const baseUrl = resolvePublicBaseUrl(req);
    const callbackUrl = `${baseUrl}/api/auth/oauth/google/callback`;
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID!.trim(),
        client_secret: process.env.GOOGLE_CLIENT_SECRET!.trim(),
        redirect_uri: callbackUrl,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenRes.ok) {
      return res.status(400).send(
        renderOAuthPopupHtml({
          ok: false,
          provider: 'google',
          error: 'Google token exchange failed.',
          targetOrigin: stateRow.redirect_origin,
        })
      );
    }

    const tokens = (await tokenRes.json()) as { access_token?: string };
    const profileRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token || ''}` },
    });
    if (!profileRes.ok) {
      return res.status(400).send(
        renderOAuthPopupHtml({
          ok: false,
          provider: 'google',
          error: 'Failed to retrieve Google user profile.',
          targetOrigin: stateRow.redirect_origin,
        })
      );
    }

    const userInfo = (await profileRes.json()) as { sub?: string; email?: string; name?: string };
    if (!userInfo.email || !userInfo.sub) {
      return res.status(400).send(
        renderOAuthPopupHtml({
          ok: false,
          provider: 'google',
          error: 'Google account did not return an email address.',
          targetOrigin: stateRow.redirect_origin,
        })
      );
    }

    const userId = upsertOAuthUser({
      provider: 'google',
      subject: userInfo.sub,
      email: userInfo.email,
      displayName: userInfo.name || userInfo.email.split('@')[0],
    });
    const session = createSession(userId, true);
    setSessionCookie(req, res, session.token, session.maxAgeMs);

    return res.send(
      renderOAuthPopupHtml({
        ok: true,
        provider: 'google',
        token: session.token,
        targetOrigin: stateRow.redirect_origin,
      })
    );
  } catch {
    return res.status(500).send(
      renderOAuthPopupHtml({
        ok: false,
        provider: 'google',
        error: 'Unexpected error completing Google sign-in.',
        targetOrigin: stateRow.redirect_origin,
      })
    );
  }
});

app.get('/api/auth/oauth/microsoft/url', (req, res) => {
  const baseUrl = resolvePublicBaseUrl(req);
  const callbackUrl = `${baseUrl}/api/auth/oauth/microsoft/callback`;
  if (!isMicrosoftOAuthConfigured()) {
    return res.status(503).json({
      error:
        'Microsoft OAuth is not configured on this server. Add MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET in AI Studio Settings > Secrets and authorize the callback URL below.',
      missingEnvVars: ['MICROSOFT_CLIENT_ID', 'MICROSOFT_CLIENT_SECRET'],
      callbackUrl,
    });
  }

  const tenant = (process.env.MICROSOFT_TENANT_ID || 'common').trim();
  const state = crypto.randomBytes(24).toString('hex');
  const now = new Date();
  const expires = new Date(now.getTime() + 10 * 60 * 1000);
  const origin = String(req.query.origin || baseUrl);
  db.prepare(
    `INSERT INTO oauth_states (state, provider, redirect_origin, expires_at, created_at)
     VALUES (?, 'microsoft', ?, ?, ?)`
  ).run(state, origin, expires.toISOString(), now.toISOString());

  const params = new URLSearchParams({
    client_id: process.env.MICROSOFT_CLIENT_ID!.trim(),
    response_type: 'code',
    redirect_uri: callbackUrl,
    response_mode: 'query',
    scope: 'openid profile email User.Read',
    prompt: 'select_account',
    state,
  });

  const url = `https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/authorize?${params.toString()}`;
  if (req.query.redirect === '1') {
    return res.redirect(url);
  }
  return res.json({ url });
});

app.get(['/api/auth/oauth/microsoft/callback', '/api/auth/oauth/microsoft/callback/'], async (req, res) => {
  const code = String(req.query.code || '');
  const state = String(req.query.state || '');
  const oauthErr = String(req.query.error_description || req.query.error || '');

  const stateRow = db
    .prepare(`SELECT state, redirect_origin, expires_at FROM oauth_states WHERE state = ? AND provider = 'microsoft'`)
    .get(state) as { state: string; redirect_origin: string; expires_at: string } | undefined;

  if (state) {
    db.prepare(`DELETE FROM oauth_states WHERE state = ?`).run(state);
  }

  if (oauthErr) {
    return res.status(400).send(
      renderOAuthPopupHtml({
        ok: false,
        provider: 'microsoft',
        error: oauthErr,
        targetOrigin: stateRow?.redirect_origin,
      })
    );
  }

  if (!stateRow || new Date(stateRow.expires_at).getTime() < Date.now() || !code) {
    return res.status(400).send(
      renderOAuthPopupHtml({
        ok: false,
        provider: 'microsoft',
        error: 'Invalid or expired Microsoft OAuth state.',
        targetOrigin: stateRow?.redirect_origin,
      })
    );
  }

  if (!isMicrosoftOAuthConfigured()) {
    return res.status(503).send(
      renderOAuthPopupHtml({
        ok: false,
        provider: 'microsoft',
        error: 'Microsoft OAuth credentials are not configured.',
        targetOrigin: stateRow.redirect_origin,
      })
    );
  }

  try {
    const tenant = (process.env.MICROSOFT_TENANT_ID || 'common').trim();
    const baseUrl = resolvePublicBaseUrl(req);
    const callbackUrl = `${baseUrl}/api/auth/oauth/microsoft/callback`;

    const tokenRes = await fetch(
      `https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: process.env.MICROSOFT_CLIENT_ID!.trim(),
          client_secret: process.env.MICROSOFT_CLIENT_SECRET!.trim(),
          code,
          redirect_uri: callbackUrl,
          grant_type: 'authorization_code',
        }),
      }
    );

    if (!tokenRes.ok) {
      return res.status(400).send(
        renderOAuthPopupHtml({
          ok: false,
          provider: 'microsoft',
          error: 'Microsoft token exchange failed.',
          targetOrigin: stateRow.redirect_origin,
        })
      );
    }

    const tokens = (await tokenRes.json()) as { access_token?: string; id_token?: string };
    const graphRes = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: { Authorization: `Bearer ${tokens.access_token || ''}` },
    });

    let email = '';
    let subject = '';
    let displayName = '';

    if (graphRes.ok) {
      const me = (await graphRes.json()) as {
        id?: string;
        mail?: string;
        userPrincipalName?: string;
        displayName?: string;
      };
      subject = me.id || '';
      email = me.mail || me.userPrincipalName || '';
      displayName = me.displayName || '';
    } else if (tokens.id_token) {
      const parts = tokens.id_token.split('.');
      if (parts.length >= 2) {
        const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as {
          sub?: string;
          email?: string;
          preferred_username?: string;
          name?: string;
        };
        subject = claims.sub || '';
        email = claims.email || claims.preferred_username || '';
        displayName = claims.name || '';
      }
    }

    if (!email || !subject) {
      return res.status(400).send(
        renderOAuthPopupHtml({
          ok: false,
          provider: 'microsoft',
          error: 'Microsoft account did not return a valid email address.',
          targetOrigin: stateRow.redirect_origin,
        })
      );
    }

    const userId = upsertOAuthUser({
      provider: 'microsoft',
      subject,
      email,
      displayName: displayName || email.split('@')[0],
    });
    const session = createSession(userId, true);
    setSessionCookie(req, res, session.token, session.maxAgeMs);

    return res.send(
      renderOAuthPopupHtml({
        ok: true,
        provider: 'microsoft',
        token: session.token,
        targetOrigin: stateRow.redirect_origin,
      })
    );
  } catch {
    return res.status(500).send(
      renderOAuthPopupHtml({
        ok: false,
        provider: 'microsoft',
        error: 'Unexpected error completing Microsoft sign-in.',
        targetOrigin: stateRow.redirect_origin,
      })
    );
  }
});

// ---------------- PROTECTED WORKSPACE & ONBOARDING ----------------

app.get('/api/dashboard', requireAuth, (req: AuthenticatedRequest, res) => {
  const payload = buildUserDashboardPayload(req.user!.id);
  if (!payload) return res.status(404).json({ error: 'Profile not found' });
  return res.json(payload);
});

const OnboardingSchema = z.object({
  displayName: z.string().min(2).max(80),
  domainId: z
    .enum(['engineering', 'medical', 'commerce', 'arts', 'ai-tech', 'management', 'law', 'other'])
    .optional(),
  courseId: z.string().max(80).optional(),
  courseName: z.string().max(120).optional(),
  specialization: z.string().max(120).optional().default(''),
  educationLevel: z.string().max(80).optional().default('Undergraduate'),
  semesterStage: z.string().max(60).optional().default(''),
  previousBackground: z.string().max(300).optional().default(''),
  graduationYear: z.string().max(20).optional().default(''),
  learningGoals: z.array(z.string()).optional().default([]),
  primaryGoal: z.string().max(160).optional().default(''),
  institution: z.string().max(120).optional().default(''),
  degree: z.string().max(120).optional().default(''),
  academicYear: z.string().max(40).optional().default(''),
  fieldOfStudy: z.string().max(120).optional().default(''),
  subjects: z.array(z.string()).optional().default([]),
  academicTopics: z.array(z.string()).optional().default([]),
  certifications: z.array(z.string()).optional().default([]),
  academicProjects: z.array(z.string()).optional().default([]),
  declaredSkills: z
    .array(
      z.object({
        skillId: z.string(),
        skillName: z.string(),
        category: z.string().optional().default('Language'),
        declaredLevel: z.enum(['Beginner', 'Intermediate', 'Advanced']).optional().default('Beginner'),
      })
    )
    .optional()
    .default([]),
  technicalInterests: z.array(z.string()).optional().default([]),
  targetCareerId: z.string().min(2),
  secondaryCareerIds: z.array(z.string()).optional().default([]),
  careerObjectives: z.string().max(500).optional().default(''),
  weeklyHours: z.number().int().min(1).max(60),
  preferredFormat: z
    .enum(['Interactive & Practice', 'Reading & Docs', 'Project-Based', 'Mixed'])
    .optional()
    .default('Interactive & Practice'),
  preferredLanguage: z.string().max(40).optional().default('English'),
  timezone: z.string().max(60).optional().default('UTC'),
});

app.put('/api/profile/onboarding', requireAuth, async (req: AuthenticatedRequest, res) => {
  const parsed = OnboardingSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid onboarding data', issues: parsed.error.issues });
  }
  const d = parsed.data;
  const userId = req.user!.id;
  const now = new Date().toISOString();
  const current = getLearnerProfile(userId);

  const careerExists = CAREERS_CATALOG.some((c) => c.id === d.targetCareerId);
  if (!careerExists) {
    return res.status(400).json({ error: 'Unknown target career selected.' });
  }

  const nextDomainId = d.domainId ?? current?.domainId ?? 'engineering';
  const nextCourseId = d.courseId ?? current?.courseId ?? 'eng-cse';
  const nextCourseName = d.courseName ?? current?.courseName ?? d.degree ?? 'Computer Science Engineering';

  db.prepare(
    `UPDATE learner_profiles SET
      display_name = ?, onboarding_completed = 1, onboarding_step = 5,
      domain_id = ?, course_id = ?, course_name = ?, specialization = ?,
      education_level = ?, semester_stage = ?, previous_background = ?, graduation_year = ?,
      learning_goals_json = ?, primary_goal = ?,
      institution = ?, degree = ?, academic_year = ?,
      field_of_study = ?, subjects_json = ?, academic_topics_json = ?, certifications_json = ?,
      academic_projects_json = ?, technical_interests_json = ?, target_career_id = ?,
      secondary_career_ids_json = ?, career_objectives = ?, weekly_hours = ?,
      preferred_format = ?, preferred_language = ?, timezone = ?, updated_at = ?
     WHERE user_id = ?`
  ).run(
    d.displayName.trim(),
    nextDomainId,
    nextCourseId,
    nextCourseName,
    d.specialization.trim(),
    d.educationLevel.trim(),
    (d.semesterStage || d.academicYear).trim(),
    d.previousBackground.trim(),
    d.graduationYear.trim(),
    JSON.stringify(d.learningGoals),
    d.primaryGoal.trim(),
    d.institution.trim(),
    d.degree.trim() || nextCourseName,
    d.academicYear.trim() || d.semesterStage.trim(),
    d.fieldOfStudy.trim() || getDomainMeta(nextDomainId).name,
    JSON.stringify(d.subjects),
    JSON.stringify(d.academicTopics),
    JSON.stringify(d.certifications),
    JSON.stringify(d.academicProjects),
    JSON.stringify(d.technicalInterests),
    d.targetCareerId,
    JSON.stringify(d.secondaryCareerIds),
    d.careerObjectives.trim(),
    d.weeklyHours,
    d.preferredFormat,
    d.preferredLanguage,
    d.timezone,
    now,
    userId
  );

  // Add declared skills safely: Declared skills NEVER auto-promote to Demonstrated
  for (const sk of d.declaredSkills) {
    const existing = db
      .prepare(`SELECT id FROM learner_skills WHERE user_id = ? AND skill_id = ?`)
      .get(userId, sk.skillId);
    if (!existing) {
      db.prepare(
        `INSERT INTO learner_skills (
          id, user_id, skill_id, skill_name, category, evidence_state, proficiency, declared_level, updated_at
        ) VALUES (?, ?, ?, ?, ?, 'Declared', 0, ?, ?)`
      ).run(`sk-${crypto.randomUUID()}`, userId, sk.skillId, sk.skillName, sk.category, sk.declaredLevel, now);
    }
  }

  generateOrSyncRoadmapForUser(userId, d.targetCareerId);
  const orchestration = await runOrchestratorEvent(userId, { type: 'PROFILE_SAVED' });

  const dashboard = buildUserDashboardPayload(userId);
  if (dashboard) {
    recordReadinessSnapshot(userId, d.targetCareerId, dashboard.readiness.readinessScore);
  }

  return res.json({ dashboard, orchestration });
});

// ---------------- RESUMABLE 5-STEP ONBOARDING & ENTRY ASSESSMENT ----------------

const OnboardingStepSchema = z.object({
  onboardingStep: z.number().int().min(1).max(5).optional(),
  displayName: z.string().min(2).max(80).optional(),
  domainId: z
    .enum(['engineering', 'medical', 'commerce', 'arts', 'ai-tech', 'management', 'law', 'other'])
    .optional(),
  courseId: z.string().min(1).max(80).optional(),
  courseName: z.string().min(2).max(120).optional(),
  specialization: z.string().max(120).optional(),
  educationLevel: z.string().max(80).optional(),
  semesterStage: z.string().max(60).optional(),
  previousBackground: z.string().max(300).optional(),
  graduationYear: z.string().max(20).optional(),
  institution: z.string().max(120).optional(),
  degree: z.string().max(120).optional(),
  weeklyHours: z.number().int().min(1).max(60).optional(),
  timezone: z.string().max(60).optional(),
  preferredFormat: z.enum(['Interactive & Practice', 'Reading & Docs', 'Project-Based', 'Mixed']).optional(),
  learningGoals: z.array(z.string()).optional(),
  primaryGoal: z.string().max(160).optional(),
  careerObjectives: z.string().max(500).optional(),
  declaredSkills: z
    .array(
      z.object({
        skillId: z.string(),
        skillName: z.string(),
        category: z.string().optional().default('Foundations'),
        declaredLevel: z.enum(['Beginner', 'Intermediate', 'Advanced']).optional().default('Beginner'),
      })
    )
    .optional(),
});

app.put('/api/onboarding/step', requireAuth, (req: AuthenticatedRequest, res) => {
  const parsed = OnboardingStepSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid onboarding step fields.', issues: parsed.error.issues });
  }

  const userId = req.user!.id;
  const current = getLearnerProfile(userId);
  if (!current) return res.status(404).json({ error: 'Profile not found' });

  const d = parsed.data;
  const nextDomainId = (d.domainId ?? current.domainId) as AcademicDomainId;
  const nextCourseId = d.courseId ?? current.courseId;
  const courseMeta = getCourseMeta(nextDomainId, nextCourseId);
  const nextCourseName = d.courseName?.trim() || courseMeta?.name || current.courseName;
  const nextTargetCareerId =
    d.domainId || d.courseId
      ? courseMeta?.mappedCareerId || current.targetCareerId
      : current.targetCareerId;
  const nextStep = d.onboardingStep ?? current.onboardingStep;
  const now = new Date().toISOString();

  db.prepare(
    `UPDATE learner_profiles SET
      display_name = ?, onboarding_step = ?, domain_id = ?, course_id = ?, course_name = ?,
      specialization = ?, education_level = ?, semester_stage = ?, previous_background = ?,
      graduation_year = ?, institution = ?, degree = ?, academic_year = ?, field_of_study = ?,
      learning_goals_json = ?, primary_goal = ?, career_objectives = ?, weekly_hours = ?,
      preferred_format = ?, timezone = ?, target_career_id = ?, updated_at = ?
     WHERE user_id = ?`
  ).run(
    d.displayName?.trim() || current.displayName,
    nextStep,
    nextDomainId,
    nextCourseId,
    nextCourseName,
    d.specialization !== undefined ? d.specialization.trim() : current.specialization,
    d.educationLevel !== undefined ? d.educationLevel.trim() : current.educationLevel,
    d.semesterStage !== undefined ? d.semesterStage.trim() : current.semesterStage,
    d.previousBackground !== undefined ? d.previousBackground.trim() : current.previousBackground,
    d.graduationYear !== undefined ? d.graduationYear.trim() : current.graduationYear,
    d.institution !== undefined ? d.institution.trim() : current.institution,
    d.degree !== undefined ? d.degree.trim() : nextCourseName,
    d.semesterStage !== undefined ? d.semesterStage.trim() : current.academicYear,
    getDomainMeta(nextDomainId).name,
    JSON.stringify(d.learningGoals ?? current.learningGoals),
    d.primaryGoal !== undefined ? d.primaryGoal.trim() : current.primaryGoal,
    d.careerObjectives !== undefined ? d.careerObjectives.trim() : d.primaryGoal || current.careerObjectives,
    d.weeklyHours ?? current.weeklyHours,
    d.preferredFormat ?? current.preferredFormat,
    d.timezone ?? current.timezone,
    nextTargetCareerId,
    now,
    userId
  );

  if (d.declaredSkills) {
    for (const sk of d.declaredSkills) {
      const existing = db
        .prepare(`SELECT id FROM learner_skills WHERE user_id = ? AND skill_id = ?`)
        .get(userId, sk.skillId);
      if (!existing) {
        db.prepare(
          `INSERT INTO learner_skills (
            id, user_id, skill_id, skill_name, category, evidence_state, proficiency, declared_level, updated_at
          ) VALUES (?, ?, ?, ?, ?, 'Declared', 0, ?, ?)`
        ).run(`sk-${crypto.randomUUID()}`, userId, sk.skillId, sk.skillName, sk.category, sk.declaredLevel, now);
      }
    }
  }

  return res.json({ dashboard: buildUserDashboardPayload(userId) });
});

app.post('/api/onboarding/entry-test/start', requireAuth, (req: AuthenticatedRequest, res) => {
  const schema = z.object({
    questionCount: z.number().int().min(15).max(25).optional().default(15),
    reset: z.boolean().optional().default(false),
  });
  const parsed = schema.safeParse(req.body ?? {});
  const questionCount = parsed.success ? parsed.data.questionCount : 15;
  const reset = parsed.success ? parsed.data.reset : false;

  const userId = req.user!.id;
  const profile = getLearnerProfile(userId);
  if (!profile) return res.status(404).json({ error: 'Profile not found' });

  const existing = db
    .prepare(
      `SELECT * FROM entry_assessment_sessions
       WHERE user_id = ? AND status = 'IN_PROGRESS' AND domain_id = ? AND course_id = ?
       ORDER BY created_at DESC LIMIT 1`
    )
    .get(userId, profile.domainId, profile.courseId) as Record<string, unknown> | undefined;

  let sessionId = '';
  let questionIds: string[] = [];
  let savedAnswers: Record<string, string> = {};

  if (existing && !reset) {
    const existingIds = JSON.parse(String(existing.question_ids_json || '[]')) as string[];
    if (existingIds.length === questionCount) {
      sessionId = String(existing.id);
      questionIds = existingIds;
      savedAnswers = JSON.parse(String(existing.answers_json || '{}')) as Record<string, string>;
    }
  }

  if (!sessionId) {
    const selected = selectEntryQuestions(profile.domainId, questionCount, profile.courseId);
    questionIds = selected.map((q) => q.id);
    sessionId = `entry-${crypto.randomUUID()}`;
    const now = new Date().toISOString();

    db.prepare(
      `UPDATE entry_assessment_sessions SET status = 'ABANDONED', updated_at = ?
       WHERE user_id = ? AND status = 'IN_PROGRESS'`
    ).run(now, userId);

    db.prepare(
      `INSERT INTO entry_assessment_sessions (
        id, user_id, domain_id, course_id, course_name, question_ids_json, answers_json, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, '{}', 'IN_PROGRESS', ?, ?)`
    ).run(sessionId, userId, profile.domainId, profile.courseId, profile.courseName, JSON.stringify(questionIds), now, now);
  }

  db.prepare(`UPDATE learner_profiles SET onboarding_step = 4, updated_at = ? WHERE user_id = ?`).run(
    new Date().toISOString(),
    userId
  );

  const qMap = new Map(ENTRY_QUESTION_BANK.map((q) => [q.id, q]));
  const questions = questionIds
    .map((id) => qMap.get(id))
    .filter((q): q is NonNullable<typeof q> => Boolean(q))
    .map(({ correctAnswer: _c, explanation: _e, ...rest }) => rest);

  return res.json({
    sessionId,
    domainId: profile.domainId,
    domainMeta: getDomainMeta(profile.domainId),
    courseId: profile.courseId,
    courseName: profile.courseName,
    totalQuestions: questions.length,
    savedAnswers,
    questions,
  });
});

app.post('/api/onboarding/entry-test/answer', requireAuth, (req: AuthenticatedRequest, res) => {
  const schema = z.object({
    sessionId: z.string().min(4),
    questionId: z.string().optional(),
    answer: z.string().optional(),
    answers: z.record(z.string(), z.string()).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid answer payload.' });
  }

  const userId = req.user!.id;
  const session = db
    .prepare(`SELECT * FROM entry_assessment_sessions WHERE id = ? AND user_id = ?`)
    .get(parsed.data.sessionId, userId) as Record<string, unknown> | undefined;

  if (!session) {
    return res.status(404).json({ error: 'Entry assessment session not found.' });
  }
  if (session.status === 'COMPLETED') {
    return res.status(409).json({ error: 'This assessment session is already completed.' });
  }

  const currentAnswers = JSON.parse(String(session.answers_json || '{}')) as Record<string, string>;
  if (parsed.data.answers) {
    Object.assign(currentAnswers, parsed.data.answers);
  }
  if (parsed.data.questionId && parsed.data.answer !== undefined) {
    currentAnswers[parsed.data.questionId] = parsed.data.answer;
  }

  const now = new Date().toISOString();
  db.prepare(`UPDATE entry_assessment_sessions SET answers_json = ?, updated_at = ? WHERE id = ?`).run(
    JSON.stringify(currentAnswers),
    now,
    String(session.id)
  );

  return res.json({
    ok: true,
    answeredCount: Object.keys(currentAnswers).filter((k) => Boolean(currentAnswers[k]?.trim())).length,
    savedAnswers: currentAnswers,
  });
});

app.post('/api/onboarding/entry-test/submit', requireAuth, async (req: AuthenticatedRequest, res) => {
  const schema = z.object({
    sessionId: z.string().min(4),
    answers: z.record(z.string(), z.string()).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid entry assessment submission.' });
  }

  const userId = req.user!.id;
  const session = db
    .prepare(`SELECT * FROM entry_assessment_sessions WHERE id = ? AND user_id = ?`)
    .get(parsed.data.sessionId, userId) as Record<string, unknown> | undefined;

  if (!session) {
    return res.status(404).json({ error: 'Entry assessment session not found.' });
  }

  const mergedAnswers = {
    ...(JSON.parse(String(session.answers_json || '{}')) as Record<string, string>),
    ...(parsed.data.answers ?? {}),
  };

  const questionIds = JSON.parse(String(session.question_ids_json || '[]')) as string[];
  const qMap = new Map(ENTRY_QUESTION_BANK.map((q) => [q.id, q]));
  const sessionQuestions = questionIds
    .map((id) => qMap.get(id))
    .filter((q): q is NonNullable<typeof q> => Boolean(q));

  const domainId = String(session.domain_id) as AcademicDomainId;
  const courseId = String(session.course_id);
  const courseName = String(session.course_name);

  const graded = gradeEntryAssessment({
    sessionId: String(session.id),
    domainId,
    courseId,
    courseName,
    questions: sessionQuestions,
    answers: mergedAnswers,
  });

  const aiProfile = await synthesizeEntryLearnerProfile(userId, graded);
  const fullResult = { ...graded, aiProfile };
  const now = new Date().toISOString();

  db.prepare(
    `UPDATE entry_assessment_sessions
     SET answers_json = ?, result_json = ?, status = 'COMPLETED', updated_at = ?, completed_at = ?
     WHERE id = ?`
  ).run(JSON.stringify(mergedAnswers), JSON.stringify(fullResult), now, now, String(session.id));

  for (const subj of fullResult.subjectBreakdown) {
    upsertTopicPerformance(userId, domainId, subj.subject, subj.scorePercent, subj.level);
  }

  // Record baseline attempt & advance learner to Step 5 (Analysis screen)
  db.prepare(
    `INSERT INTO assessment_attempts (
      id, user_id, skill_id, skill_name, score_percent, correct_count, total_count,
      weak_concepts_json, adaptive_decision, practical_notes, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    `att-${crypto.randomUUID()}`,
    userId,
    `entry:${courseId}`,
    `${courseName} Entry Assessment`,
    fullResult.scorePercent,
    fullResult.correctCount,
    fullResult.totalCount,
    JSON.stringify(fullResult.weakTopics),
    fullResult.scorePercent < 60 ? 'REMEDIAL_REQUIRED' : fullResult.scorePercent >= 85 ? 'PROGRESSION_ELIGIBLE' : 'TARGETED_PRACTICE',
    `Classified entry level: ${fullResult.skillLevel}`,
    now
  );

  awardServerXp(
    userId,
    'ASSESSMENT_COMPLETE',
    `entry-test:${String(session.id)}`,
    `Completed ${courseName} Entry Diagnostic (${fullResult.scorePercent}%)`
  );

  db.prepare(`UPDATE learner_profiles SET onboarding_step = 5, updated_at = ? WHERE user_id = ?`).run(
    now,
    userId
  );

  const profile = getLearnerProfile(userId);
  if (profile) {
    recordStreakActivity(userId, profile.timezone);
    generateOrSyncRoadmapForUser(userId, profile.targetCareerId);
  }

  return res.json({
    result: fullResult,
    dashboard: buildUserDashboardPayload(userId),
  });
});

app.post('/api/onboarding/complete', requireAuth, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const profile = getLearnerProfile(userId);
  if (!profile) return res.status(404).json({ error: 'Profile not found' });

  const now = new Date().toISOString();
  db.prepare(
    `UPDATE learner_profiles SET onboarding_completed = 1, onboarding_step = 5, updated_at = ? WHERE user_id = ?`
  ).run(now, userId);

  generateOrSyncRoadmapForUser(userId, profile.targetCareerId);
  const orchestration = await runOrchestratorEvent(userId, { type: 'PROFILE_SAVED' });

  const dashboard = buildUserDashboardPayload(userId);
  if (dashboard) {
    recordReadinessSnapshot(userId, profile.targetCareerId, dashboard.readiness.readinessScore);
  }

  return res.json({ dashboard, orchestration });
});

app.get('/api/domains', (_req, res) => {
  return res.json({ domains: ACADEMIC_DOMAINS });
});

app.post('/api/courses/select', requireAuth, async (req: AuthenticatedRequest, res) => {
  const schema = z.object({
    domainId: z.enum(['engineering', 'medical', 'commerce', 'arts', 'ai-tech', 'management', 'law', 'other']),
    courseId: z.string().min(1).max(80),
    courseName: z.string().min(2).max(120).optional(),
    specialization: z.string().max(120).optional().default(''),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Valid academic domain and course selection are required.' });
  }

  const userId = req.user!.id;
  const profile = getLearnerProfile(userId);
  if (!profile) return res.status(404).json({ error: 'Profile not found' });

  const courseMeta = getCourseMeta(parsed.data.domainId, parsed.data.courseId);
  const domainMeta = getDomainMeta(parsed.data.domainId);
  const nextCareerId = courseMeta?.mappedCareerId || profile.targetCareerId;
  const nextCourseName = parsed.data.courseName?.trim() || courseMeta?.name || profile.courseName;
  const now = new Date().toISOString();

  db.prepare(
    `UPDATE learner_profiles SET
      domain_id = ?, course_id = ?, course_name = ?, specialization = ?,
      field_of_study = ?, degree = ?, target_career_id = ?, updated_at = ?
     WHERE user_id = ?`
  ).run(
    parsed.data.domainId,
    parsed.data.courseId,
    nextCourseName,
    parsed.data.specialization.trim(),
    domainMeta.name,
    nextCourseName,
    nextCareerId,
    now,
    userId
  );

  generateOrSyncRoadmapForUser(userId, nextCareerId);
  const orchestration = await runOrchestratorEvent(userId, {
    type: 'CAREER_CHANGED',
    previousCareerId: profile.targetCareerId,
    newCareerId: nextCareerId,
  });

  const dashboard = buildUserDashboardPayload(userId);
  if (dashboard) {
    recordReadinessSnapshot(userId, nextCareerId, dashboard.readiness.readinessScore);
  }

  return res.json({ dashboard, orchestration });
});

const PatchProfileSchema = z.object({
  displayName: z.string().min(2).max(80).optional(),
  institution: z.string().max(120).optional(),
  degree: z.string().max(120).optional(),
  academicYear: z.string().max(40).optional(),
  fieldOfStudy: z.string().max(120).optional(),
  careerObjectives: z.string().max(500).optional(),
  weeklyHours: z.number().int().min(1).max(60).optional(),
  preferredFormat: z.enum(['Interactive & Practice', 'Reading & Docs', 'Project-Based', 'Mixed']).optional(),
  timezone: z.string().max(60).optional(),
  privacyLeaderboardOptIn: z.boolean().optional(),
  subjects: z.array(z.string()).optional(),
});

app.patch('/api/profile', requireAuth, (req: AuthenticatedRequest, res) => {
  const parsed = PatchProfileSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid profile update payload.' });
  }
  const userId = req.user!.id;
  const current = getLearnerProfile(userId);
  if (!current) return res.status(404).json({ error: 'Profile not found' });

  const d = parsed.data;
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE learner_profiles SET
      display_name = ?, institution = ?, degree = ?, academic_year = ?, field_of_study = ?,
      career_objectives = ?, weekly_hours = ?, preferred_format = ?, timezone = ?,
      privacy_leaderboard_opt_in = ?, subjects_json = ?, updated_at = ?
     WHERE user_id = ?`
  ).run(
    d.displayName ?? current.displayName,
    d.institution ?? current.institution,
    d.degree ?? current.degree,
    d.academicYear ?? current.academicYear,
    d.fieldOfStudy ?? current.fieldOfStudy,
    d.careerObjectives ?? current.careerObjectives,
    d.weeklyHours ?? current.weeklyHours,
    d.preferredFormat ?? current.preferredFormat,
    d.timezone ?? current.timezone,
    d.privacyLeaderboardOptIn !== undefined ? (d.privacyLeaderboardOptIn ? 1 : 0) : current.privacyLeaderboardOptIn ? 1 : 0,
    JSON.stringify(d.subjects ?? current.subjects),
    now,
    userId
  );

  if (d.weeklyHours !== undefined) {
    generateOrSyncRoadmapForUser(userId, current.targetCareerId);
  }

  return res.json({ dashboard: buildUserDashboardPayload(userId) });
});

// ---------------- SKILLPROOF & EVIDENCE ----------------

const AddSkillSchema = z.object({
  skillId: z.string().min(1).max(50),
  skillName: z.string().min(1).max(80),
  category: z.enum([
    'Language',
    'Frontend',
    'Backend',
    'Database',
    'Data & AI',
    'DevOps & Tools',
    'Security',
    'Foundations',
    'Clinical & Bio',
    'Finance & Quant',
    'Humanities & Social',
    'Management & Strategy',
    'Legal & Policy',
    'Engineering Systems',
  ]),
  declaredLevel: z.enum(['Beginner', 'Intermediate', 'Advanced']),
});

app.post('/api/skills', requireAuth, (req: AuthenticatedRequest, res) => {
  const parsed = AddSkillSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid skill fields.' });
  }
  const userId = req.user!.id;
  const d = parsed.data;
  const now = new Date().toISOString();

  const existing = db
    .prepare(`SELECT id, evidence_state FROM learner_skills WHERE user_id = ? AND skill_id = ?`)
    .get(userId, d.skillId) as { id: string; evidence_state: string } | undefined;

  if (existing) {
    db.prepare(`UPDATE learner_skills SET declared_level = ?, updated_at = ? WHERE id = ?`).run(
      d.declaredLevel,
      now,
      existing.id
    );
  } else {
    db.prepare(
      `INSERT INTO learner_skills (
        id, user_id, skill_id, skill_name, category, evidence_state, proficiency, declared_level, updated_at
      ) VALUES (?, ?, ?, ?, ?, 'Declared', 0, ?, ?)`
    ).run(`sk-${crypto.randomUUID()}`, userId, d.skillId, d.skillName, d.category, d.declaredLevel, now);

    db.prepare(
      `INSERT INTO skill_evidence (
        id, user_id, skill_id, evidence_type, title, description, artifact_url, score_percent, verified_by, resulting_state, created_at
      ) VALUES (?, ?, ?, 'DECLARATION', ?, ?, NULL, NULL, 'Self-Declared', 'Declared', ?)`
    ).run(
      `ev-${crypto.randomUUID()}`,
      userId,
      d.skillId,
      `Self-Declared ${d.skillName} (${d.declaredLevel})`,
      'Declared competencies require diagnostic assessment or project evidence before contributing to readiness.',
      now
    );
  }

  return res.status(201).json({ dashboard: buildUserDashboardPayload(userId) });
});

const SubmitEvidenceSchema = z.object({
  skillId: z.string().min(1),
  skillName: z.string().min(1),
  evidenceType: z.enum(['PROJECT', 'CREDENTIAL', 'MENTOR_REVIEW']),
  title: z.string().min(3).max(120),
  description: z.string().min(10).max(1200),
  artifactUrl: z.string().url().optional().or(z.literal('')),
});

app.post('/api/skills/evidence', requireAuth, async (req: AuthenticatedRequest, res) => {
  const parsed = SubmitEvidenceSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Provide a valid title, skill, and 10+ character description.' });
  }
  const userId = req.user!.id;
  const d = parsed.data;
  const now = new Date().toISOString();

  // Credentials or mentor-reviewed evidence with verified URL can reach Validated;
  // self-submitted project descriptions reach Demonstrated (pending external review for Validated).
  const resultingState = d.evidenceType === 'PROJECT' ? 'Demonstrated' : 'Validated';
  const targetProficiency = resultingState === 'Validated' ? 4 : 3;

  const existing = db
    .prepare(`SELECT * FROM learner_skills WHERE user_id = ? AND skill_id = ?`)
    .get(userId, d.skillId) as { id: string; proficiency: number; evidence_state: string } | undefined;

  if (!existing) {
    db.prepare(
      `INSERT INTO learner_skills (
        id, user_id, skill_id, skill_name, category, evidence_state, proficiency, declared_level, last_assessed_at, updated_at
      ) VALUES (?, ?, ?, ?, 'Language', ?, ?, 'Intermediate', ?, ?)`
    ).run(
      `sk-${crypto.randomUUID()}`,
      userId,
      d.skillId,
      d.skillName,
      resultingState,
      targetProficiency,
      now,
      now
    );
  } else {
    const nextProf = Math.max(existing.proficiency, targetProficiency);
    const nextState = existing.evidence_state === 'Validated' ? 'Validated' : resultingState;
    db.prepare(
      `UPDATE learner_skills SET evidence_state = ?, proficiency = ?, last_assessed_at = ?, needs_reassessment = 0, updated_at = ? WHERE id = ?`
    ).run(nextState, nextProf, now, now, existing.id);
  }

  db.prepare(
    `INSERT INTO skill_evidence (
      id, user_id, skill_id, evidence_type, title, description, artifact_url, score_percent, verified_by, resulting_state, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)`
  ).run(
    `ev-${crypto.randomUUID()}`,
    userId,
    d.skillId,
    d.evidenceType,
    d.title.trim(),
    d.description.trim(),
    d.artifactUrl || null,
    d.evidenceType === 'PROJECT' ? 'Skill Auditor Rubric' : 'Credential / Reviewer Check',
    resultingState,
    now
  );

  if (d.evidenceType === 'PROJECT') {
    db.prepare(
      `INSERT INTO project_submissions (
        id, user_id, title, skill_id, repo_url, description, detected_stack_json, review_status, reviewer_notes, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, '[]', 'Reviewed', 'Evidence logged and evaluated by Skill Auditor.', ?)`
    ).run(`proj-${crypto.randomUUID()}`, userId, d.title.trim(), d.skillId, d.artifactUrl || null, d.description.trim(), now);
    grantAchievement(userId, 'ach-first-project');
  }

  const profile = getLearnerProfile(userId);
  if (profile) {
    recordStreakActivity(userId, profile.timezone);
    generateOrSyncRoadmapForUser(userId, profile.targetCareerId);
  }

  awardServerXp(
    userId,
    'PROJECT_SUBMITTED',
    `evidence:${d.skillId}:${d.title.toLowerCase().slice(0, 30)}`,
    `Submitted practical evidence: ${d.title.trim()}`
  );

  const orchestration = await runOrchestratorEvent(userId, {
    type: 'PROJECT_SUBMITTED',
    skillId: d.skillId,
    title: d.title,
    detectedStack: [d.skillName],
  });

  const dashboard = buildUserDashboardPayload(userId);
  if (dashboard && profile) {
    recordReadinessSnapshot(userId, profile.targetCareerId, dashboard.readiness.readinessScore);
  }

  return res.status(201).json({ dashboard, orchestration });
});

// ---------------- ACADEMIC-TO-INDUSTRY MAPPINGS ----------------

app.get('/api/mappings', requireAuth, (_req, res) => {
  return res.json({ mappings: getAcademicMappings() });
});

const CreateMappingSchema = z.object({
  subjectName: z.string().min(2).max(100),
  learningOutcomes: z.array(z.string().min(2)).min(1),
  technicalCompetencies: z.array(z.string().min(2)).min(1),
  industrySkillIds: z.array(z.string().min(1)).min(1),
  careerIds: z.array(z.string().min(1)).min(1),
  source: z.string().min(3).max(150),
});

app.post('/api/mappings', requireAuth, (req: AuthenticatedRequest, res) => {
  const parsed = CreateMappingSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'All mapping fields and a verifiable syllabus source are required.' });
  }
  const d = parsed.data;
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO competency_mappings (
      id, subject_name, learning_outcomes_json, technical_competencies_json,
      industry_skill_ids_json, career_ids_json, source, review_status, created_by_user_id, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'Pending Review', ?, ?)`
  ).run(
    `map-${crypto.randomUUID()}`,
    d.subjectName.trim(),
    JSON.stringify(d.learningOutcomes),
    JSON.stringify(d.technicalCompetencies),
    JSON.stringify(d.industrySkillIds),
    JSON.stringify(d.careerIds),
    d.source.trim(),
    req.user!.id,
    now
  );
  return res.status(201).json({ mappings: getAcademicMappings() });
});

// ---------------- CAREERS & CAREER SWITCHING ----------------

app.get('/api/careers', requireAuth, (_req, res) => {
  return res.json({ careers: CAREERS_CATALOG, resources: LEARNING_RESOURCES });
});

app.post('/api/careers/select', requireAuth, async (req: AuthenticatedRequest, res) => {
  const schema = z.object({ careerId: z.string().min(2) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'careerId is required.' });
  }
  const targetCareer = CAREERS_CATALOG.find((c) => c.id === parsed.data.careerId);
  if (!targetCareer) {
    return res.status(404).json({ error: 'Career profile not found in structured catalogue.' });
  }

  const userId = req.user!.id;
  const profile = getLearnerProfile(userId);
  if (!profile) return res.status(404).json({ error: 'Profile not found' });

  const previousCareerId = profile.targetCareerId;
  const now = new Date().toISOString();

  db.prepare(`UPDATE learner_profiles SET target_career_id = ?, updated_at = ? WHERE user_id = ?`).run(
    targetCareer.id,
    now,
    userId
  );

  // Preserve all existing skills & evidence, regenerate roadmap for new career
  generateOrSyncRoadmapForUser(userId, targetCareer.id);
  const orchestration = await runOrchestratorEvent(userId, {
    type: 'CAREER_CHANGED',
    previousCareerId,
    newCareerId: targetCareer.id,
  });

  const skills = getLearnerSkills(userId);
  const readinessWithTransfer = calculateCareerReadiness(targetCareer, skills, previousCareerId);
  recordReadinessSnapshot(userId, targetCareer.id, readinessWithTransfer.readinessScore);

  const dashboard = buildUserDashboardPayload(userId);
  return res.json({
    dashboard: dashboard ? { ...dashboard, readiness: readinessWithTransfer } : null,
    orchestration,
  });
});

app.post('/api/dependencies/validate', requireAuth, (req, res) => {
  const schema = z.object({
    edges: z.array(z.object({ skillId: z.string(), prerequisites: z.array(z.string()) })),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid dependency graph payload.' });
  const validation = validateDependencyGraph(parsed.data.edges);
  if (!validation.valid) {
    return res.status(422).json({
      valid: false,
      error: `Circular dependency detected: ${validation.cyclePath?.join(' → ')}`,
      cyclePath: validation.cyclePath,
    });
  }
  return res.json(validation);
});

// ---------------- ROADMAP & STEPS ----------------

app.patch('/api/roadmap/steps/:stepId', requireAuth, (req: AuthenticatedRequest, res) => {
  const schema = z.object({
    learnCompleted: z.boolean().optional(),
    practiceCompleted: z.boolean().optional(),
    assessCompleted: z.boolean().optional(),
    demonstrateCompleted: z.boolean().optional(),
    status: z.enum(['LOCKED', 'NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'NEEDS_REVISION']).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid step update.' });

  const userId = req.user!.id;
  const step = db
    .prepare(
      `SELECT rs.*, r.user_id, r.career_id
       FROM roadmap_steps rs
       JOIN roadmaps r ON r.id = rs.roadmap_id
       WHERE rs.id = ? AND r.user_id = ?`
    )
    .get(req.params.stepId, userId) as Record<string, unknown> | undefined;

  if (!step) {
    return res.status(404).json({ error: 'Roadmap step not found.' });
  }
  if (step.status === 'LOCKED') {
    return res.status(409).json({ error: 'Prerequisites for this step are not yet satisfied.' });
  }

  const d = parsed.data;
  const learn = d.learnCompleted !== undefined ? (d.learnCompleted ? 1 : 0) : Number(step.learn_completed);
  const practice =
    d.practiceCompleted !== undefined ? (d.practiceCompleted ? 1 : 0) : Number(step.practice_completed);
  const assess =
    d.assessCompleted !== undefined ? (d.assessCompleted ? 1 : 0) : Number(step.assess_completed);
  const demonstrate =
    d.demonstrateCompleted !== undefined
      ? (d.demonstrateCompleted ? 1 : 0)
      : Number(step.demonstrate_completed);

  let nextStatus = d.status ?? String(step.status);
  if (learn && practice && assess && demonstrate) {
    nextStatus = 'COMPLETED';
  } else if ((learn || practice) && nextStatus === 'NOT_STARTED') {
    nextStatus = 'IN_PROGRESS';
  }

  db.prepare(
    `UPDATE roadmap_steps
     SET learn_completed = ?, practice_completed = ?, assess_completed = ?, demonstrate_completed = ?, status = ?
     WHERE id = ?`
  ).run(learn, practice, assess, demonstrate, nextStatus, req.params.stepId);

  if (nextStatus === 'COMPLETED') {
    grantAchievement(userId, 'ach-first-mission');
    awardServerXp(
      userId,
      'MISSION_COMPLETE',
      `step:${req.params.stepId}`,
      `Completed roadmap step: ${String(step.skill_name)}`
    );
  }

  const profile = getLearnerProfile(userId);
  if (profile) {
    recordStreakActivity(userId, profile.timezone);
    generateOrSyncRoadmapForUser(userId, String(step.career_id));
  }

  return res.json({ dashboard: buildUserDashboardPayload(userId) });
});

// ---------------- ADAPTIVE ASSESSMENT ENGINE ----------------

app.get('/api/assessments/:skillId', requireAuth, (req, res) => {
  const skillId = req.params.skillId;
  const questions = getQuestionsForSkill(skillId).map(({ correctAnswer: _hidden, ...q }) => q);
  return res.json({ skillId, questions });
});

const SubmitAssessmentSchema = z.object({
  answers: z.array(z.object({ questionId: z.string(), answer: z.string() })).min(1),
  practicalNotes: z.string().max(1000).optional(),
});

app.post('/api/assessments/:skillId/submit', requireAuth, async (req: AuthenticatedRequest, res) => {
  const parsed = SubmitAssessmentSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Answers are required to submit an assessment.' });
  }

  const userId = req.user!.id;
  const skillId = req.params.skillId;
  const questions = getQuestionsForSkill(skillId);
  const skills = getLearnerSkills(userId);
  const currentSkill = skills.find((s) => s.skillId === skillId);

  const evaluation = evaluateAssessmentSubmission(
    questions,
    parsed.data.answers,
    currentSkill,
    { reflectionNotes: parsed.data.practicalNotes }
  );

  const now = new Date().toISOString();
  const careerSkillMeta = CAREERS_CATALOG.flatMap((c) => c.requirements).find(
    (r) => r.skillId === skillId
  );
  const skillName = currentSkill?.skillName || careerSkillMeta?.skillName || skillId.toUpperCase();
  const category = currentSkill?.category || careerSkillMeta?.category || 'Language';

  // Persist attempt
  db.prepare(
    `INSERT INTO assessment_attempts (
      id, user_id, skill_id, skill_name, score_percent, correct_count, total_count,
      weak_concepts_json, adaptive_decision, practical_notes, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    `att-${crypto.randomUUID()}`,
    userId,
    skillId,
    skillName,
    evaluation.scorePercent,
    evaluation.correctCount,
    evaluation.totalCount,
    JSON.stringify(evaluation.weakConcepts),
    evaluation.adaptiveDecision,
    parsed.data.practicalNotes?.trim() || null,
    now
  );

  // Update SkillProof record according to rubric
  if (!currentSkill) {
    db.prepare(
      `INSERT INTO learner_skills (
        id, user_id, skill_id, skill_name, category, evidence_state, proficiency,
        declared_level, last_assessed_at, needs_reassessment, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'Not Listed', ?, ?, ?)`
    ).run(
      `sk-${crypto.randomUUID()}`,
      userId,
      skillId,
      skillName,
      category,
      evaluation.recommendedEvidenceState,
      evaluation.recommendedProficiency,
      now,
      evaluation.scorePercent < 60 ? 1 : 0,
      now
    );
  } else {
    db.prepare(
      `UPDATE learner_skills
       SET evidence_state = ?, proficiency = ?, last_assessed_at = ?, needs_reassessment = ?, updated_at = ?
       WHERE id = ?`
    ).run(
      evaluation.recommendedEvidenceState,
      evaluation.recommendedProficiency,
      now,
      evaluation.scorePercent < 60 ? 1 : 0,
      now,
      currentSkill.id
    );
  }

  // Record skill evidence history
  db.prepare(
    `INSERT INTO skill_evidence (
      id, user_id, skill_id, evidence_type, title, description, artifact_url, score_percent, verified_by, resulting_state, created_at
    ) VALUES (?, ?, ?, 'ASSESSMENT', ?, ?, NULL, ?, 'NEXORA Assessment Rubric', ?, ?)`
  ).run(
    `ev-${crypto.randomUUID()}`,
    userId,
    skillId,
    `${skillName} Diagnostic (${evaluation.scorePercent}%)`,
    evaluation.rubricSummary,
    evaluation.scorePercent,
    evaluation.recommendedEvidenceState,
    now
  );

  if (skillId === 'sql' && evaluation.recommendedEvidenceState === 'Demonstrated') {
    grantAchievement(userId, 'ach-sql-explorer');
  }

  const profile = getLearnerProfile(userId);
  let orchestration = null;

  if (profile) {
    recordStreakActivity(userId, profile.timezone);
    if (evaluation.adaptiveDecision === 'REMEDIAL_REQUIRED') {
      generateOrSyncRoadmapForUser(userId, profile.targetCareerId, {
        skillId,
        weakConcepts: evaluation.weakConcepts,
      });
      orchestration = await runOrchestratorEvent(userId, {
        type: 'POOR_ASSESSMENT',
        skillId,
        scorePercent: evaluation.scorePercent,
        weakConcepts: evaluation.weakConcepts,
      });
    } else {
      // Clear remedial step if passed
      db.prepare(
        `UPDATE roadmap_steps SET status = 'COMPLETED', assess_completed = 1
         WHERE is_remedial = 1 AND skill_id = ? AND roadmap_id IN (SELECT id FROM roadmaps WHERE user_id = ?)`
      ).run(skillId, userId);

      if (evaluation.adaptiveDecision === 'PROGRESSION_ELIGIBLE') {
        db.prepare(
          `UPDATE roadmap_steps SET assess_completed = 1, demonstrate_completed = 1, status = 'COMPLETED'
           WHERE is_remedial = 0 AND skill_id = ? AND status != 'LOCKED' AND roadmap_id IN (SELECT id FROM roadmaps WHERE user_id = ?)`
        ).run(skillId, userId);
        grantAchievement(userId, 'ach-first-mission');
      }
      generateOrSyncRoadmapForUser(userId, profile.targetCareerId);
    }
  }

  // Award server-side XP for completing an assessment (deduped by skill + day + decision)
  awardServerXp(
    userId,
    'ASSESSMENT_COMPLETE',
    `assess:${skillId}:${now.slice(0, 13)}:${evaluation.scorePercent}`,
    `Completed ${skillName} Diagnostic (${evaluation.scorePercent}%)`
  );

  const dashboard = buildUserDashboardPayload(userId);
  if (dashboard && profile) {
    recordReadinessSnapshot(userId, profile.targetCareerId, dashboard.readiness.readinessScore);
  }

  return res.json({
    evaluation,
    orchestration,
    dashboard,
  });
});

// ---------------- AI MENTOR & AGENT RUNS ----------------

app.get('/api/mentor/history', requireAuth, (req: AuthenticatedRequest, res) => {
  const rows = db
    .prepare(`SELECT * FROM ai_interactions WHERE user_id = ? ORDER BY created_at ASC LIMIT 60`)
    .all(req.user!.id) as Record<string, unknown>[];
  return res.json({
    aiConfigured: getGeminiKeyConfigured(),
    messages: rows.map((r) => ({
      id: String(r.id),
      role: String(r.role),
      message: String(r.message),
      hintLevel: Number(r.hint_level),
      contextSkillId: r.context_skill_id ? String(r.context_skill_id) : null,
      createdAt: String(r.created_at),
    })),
  });
});

app.delete('/api/mentor/history', requireAuth, (req: AuthenticatedRequest, res) => {
  db.prepare(`DELETE FROM ai_interactions WHERE user_id = ?`).run(req.user!.id);
  return res.json({ ok: true });
});

const MentorChatSchema = z.object({
  message: z.string().trim().min(1).max(2000),
  hintLevel: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).default(4),
  contextSkillId: z.string().optional(),
});

app.post('/api/mentor/chat', requireAuth, rateLimit(25, 60_000), async (req: AuthenticatedRequest, res) => {
  const parsed = MentorChatSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Please enter a valid question for AI Mentor.' });
  }
  try {
    const result = await askAdaptiveMentor(
      req.user!.id,
      parsed.data.message,
      parsed.data.hintLevel,
      parsed.data.contextSkillId
    );
    return res.json({ ...result, aiConfigured: getGeminiKeyConfigured() });
  } catch (err) {
    if (err instanceof MentorServiceError) {
      return res.status(err.statusCode).json({
        error: err.message,
        code: err.code,
        aiConfigured: getGeminiKeyConfigured(),
      });
    }
    return res.status(500).json({
      error: 'Unexpected error while reaching AI Mentor. Please click Retry.',
      code: 'AI_INTERNAL_ERROR',
      aiConfigured: getGeminiKeyConfigured(),
    });
  }
});

app.get('/api/agents/runs', requireAuth, (req: AuthenticatedRequest, res) => {
  return res.json({ runs: getAgentRuns(req.user!.id) });
});

// ---------------- NEXORA PLAY ----------------

app.get('/api/play/state', requireAuth, (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const profile = getLearnerProfile(userId);
  const skills = getLearnerSkills(userId);
  const careerId = profile?.targetCareerId ?? 'full-stack-developer';

  const solvedDailyIds = (
    db
      .prepare(`SELECT DISTINCT challenge_id FROM challenge_attempts WHERE user_id = ? AND passed = 1`)
      .all(userId) as { challenge_id: string }[]
  ).map((r) => r.challenge_id);

  const completedQuestIds = (
    db.prepare(`SELECT quest_id FROM quest_progress WHERE user_id = ?`).all(userId) as {
      quest_id: string;
    }[]
  ).map((r) => r.quest_id);

  const questsForCareer = CAREER_QUESTS.filter((q) => q.careerId === careerId);
  const activeQuests = questsForCareer.length > 0 ? questsForCareer : CAREER_QUESTS.filter((q) => q.careerId === 'full-stack-developer');

  const completedSet = new Set(completedQuestIds);
  const enrichedQuests = activeQuests.map((q) => ({
    ...q,
    completed: completedSet.has(q.id),
    unlocked: arePrerequisitesMet(q.prerequisites, skills, completedSet),
  }));

  // Privacy-conscious leaderboard: ONLY users who opted in, using display name + XP/Level only (never private skill/assessment data)
  const leaderboardRows = db
    .prepare(
      `SELECT p.display_name, u.id as user_id, COALESCE(SUM(x.xp_amount), 0) as total_xp
       FROM users u
       JOIN learner_profiles p ON p.user_id = u.id
       LEFT JOIN xp_transactions x ON x.user_id = u.id
       WHERE p.privacy_leaderboard_opt_in = 1
       GROUP BY u.id
       ORDER BY total_xp DESC
       LIMIT 10`
    )
    .all() as { display_name: string; user_id: string; total_xp: number }[];

  return res.json({
    dailyChallenges: DAILY_CHALLENGES.map((c) => ({
      ...c,
      solved: solvedDailyIds.includes(c.id),
      question: {
        ...c.question,
        correctAnswer: undefined,
      },
    })),
    quests: enrichedQuests,
    bossChallenges: BOSS_CHALLENGES,
    achievementsCatalog: ACHIEVEMENTS_CATALOG,
    leaderboard: leaderboardRows.map((r, idx) => ({
      rank: idx + 1,
      displayName: r.display_name,
      isCurrentUser: r.user_id === userId,
      totalXp: r.total_xp,
      levelName: computeLevelFromXp(r.total_xp).current.name,
    })),
  });
});

app.post('/api/play/daily/:challengeId/submit', requireAuth, (req: AuthenticatedRequest, res) => {
  const schema = z.object({ answer: z.string().min(1) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Select an answer first.' });

  const challenge = DAILY_CHALLENGES.find((c) => c.id === req.params.challengeId);
  if (!challenge) return res.status(404).json({ error: 'Daily challenge not found.' });

  const userId = req.user!.id;
  const passed =
    parsed.data.answer.trim().toLowerCase() === challenge.question.correctAnswer.trim().toLowerCase();
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO challenge_attempts (id, user_id, challenge_id, category, passed, submitted_answer, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(`cha-${crypto.randomUUID()}`, userId, challenge.id, challenge.category, passed ? 1 : 0, parsed.data.answer, now);

  let xpResult = { awarded: false, xpAmount: 0, totalXp: 0 };
  if (passed) {
    // Duplicate XP prevented via unique (user_id, event_key)
    xpResult = awardServerXp(
      userId,
      'DAILY_CHALLENGE',
      `daily:${challenge.id}`,
      `Solved Daily Brain Arena: ${challenge.title}`
    );
    const profile = getLearnerProfile(userId);
    if (profile) recordStreakActivity(userId, profile.timezone);

    if (challenge.category === 'Find Bugs') {
      grantAchievement(userId, 'ach-debug-specialist');
    }
    if (challenge.skillId === 'sql') {
      grantAchievement(userId, 'ach-sql-explorer');
    }
  }

  // Critical integrity: Daily challenges NEVER alter SkillProof proficiency or evidenceState!
  return res.json({
    passed,
    explanation: challenge.question.explanation,
    correctAnswer: passed ? challenge.question.correctAnswer : undefined,
    xpResult,
    integrityNote:
      'Engagement XP and streaks update here; SkillProof proficiency remains unchanged until verified by diagnostic assessment or project evidence.',
    dashboard: buildUserDashboardPayload(userId),
  });
});

app.post('/api/play/quests/:questId/complete', requireAuth, (req: AuthenticatedRequest, res) => {
  const quest = CAREER_QUESTS.find((q) => q.id === req.params.questId);
  if (!quest) return res.status(404).json({ error: 'Career quest mission not found.' });

  const userId = req.user!.id;
  const skills = getLearnerSkills(userId);
  const completedRows = db
    .prepare(`SELECT quest_id FROM quest_progress WHERE user_id = ?`)
    .all(userId) as { quest_id: string }[];
  const completedSet = new Set(completedRows.map((r) => r.quest_id));

  if (!arePrerequisitesMet(quest.prerequisites, skills, completedSet)) {
    return res.status(409).json({
      error: `Prerequisites not yet met: ${quest.prerequisites.join(', ')}`,
    });
  }

  const now = new Date().toISOString();
  db.prepare(
    `INSERT OR IGNORE INTO quest_progress (id, user_id, quest_id, career_id, status, completed_at)
     VALUES (?, ?, ?, ?, 'COMPLETED', ?)`
  ).run(`qp-${crypto.randomUUID()}`, userId, quest.id, quest.careerId, now);

  const xpResult = awardServerXp(
    userId,
    'MISSION_COMPLETE',
    `quest:${quest.id}`,
    `Completed Career Quest: ${quest.title}`
  );

  grantAchievement(userId, 'ach-first-mission');
  const careerQuests = CAREER_QUESTS.filter((q) => q.careerId === quest.careerId);
  const nowCompletedCount = (
    db
      .prepare(`SELECT COUNT(*) as c FROM quest_progress WHERE user_id = ? AND career_id = ?`)
      .get(userId, quest.careerId) as { c: number }
  ).c;
  if (nowCompletedCount >= careerQuests.length) {
    grantAchievement(userId, 'ach-quest-finisher');
  }

  const profile = getLearnerProfile(userId);
  if (profile) recordStreakActivity(userId, profile.timezone);

  return res.json({ xpResult, dashboard: buildUserDashboardPayload(userId) });
});

app.post('/api/play/boss/:bossId/submit', requireAuth, (req: AuthenticatedRequest, res) => {
  const schema = z.object({
    summary: z.string().min(15).max(1200),
    repoUrl: z.string().url().optional().or(z.literal('')),
    checkedCriteriaIds: z.array(z.string()).min(1),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Provide a 15+ character architecture summary and rubric checklist.' });
  }

  const boss = BOSS_CHALLENGES.find((b) => b.id === req.params.bossId);
  if (!boss) return res.status(404).json({ error: 'Boss challenge not found.' });

  const userId = req.user!.id;
  const now = new Date().toISOString();
  const totalRubricWeight = boss.rubricCriteria
    .filter((c) => parsed.data.checkedCriteriaIds.includes(c.id))
    .reduce((acc, c) => acc + c.weight, 0);

  db.prepare(
    `INSERT INTO project_submissions (
      id, user_id, title, skill_id, repo_url, description, detected_stack_json, review_status, reviewer_notes, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, '[]', 'Submitted (Rubric Self-Check)', ?, ?)`
  ).run(
    `proj-${crypto.randomUUID()}`,
    userId,
    `Boss Challenge: ${boss.title}`,
    boss.skillId,
    parsed.data.repoUrl || null,
    parsed.data.summary.trim(),
    `Rubric checklist coverage: ${totalRubricWeight}% (Note: code was not executed in a sandbox).`,
    now
  );

  grantAchievement(userId, 'ach-first-project');
  const xpResult = awardServerXp(
    userId,
    'BOSS_CHALLENGE',
    `boss:${boss.id}`,
    `Submitted Boss Challenge: ${boss.title}`
  );

  const profile = getLearnerProfile(userId);
  if (profile) recordStreakActivity(userId, profile.timezone);

  return res.json({
    xpResult,
    rubricCoverage: totalRubricWeight,
    executionDisclaimer:
      'Rubric recorded without claiming remote code execution. Submit verified evidence in SkillProof to advance proficiency.',
    dashboard: buildUserDashboardPayload(userId),
  });
});

// ---------------- PROJECTS & GITHUB REPO INTELLIGENCE ----------------

app.post('/api/projects/analyze-github', requireAuth, rateLimit(15, 60_000), async (req: AuthenticatedRequest, res) => {
  const schema = z.object({
    repoUrl: z.string().min(5).max(300),
    targetSkillId: z.string().min(1),
    title: z.string().min(3).max(120).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Valid GitHub repository URL and target skill are required.' });
  }

  const check = validateGitHubRepoUrl(parsed.data.repoUrl);
  if (!check.valid || !check.owner || !check.repo || !check.canonicalUrl) {
    return res.status(400).json({ error: check.error || 'Invalid GitHub URL.' });
  }

  const userId = req.user!.id;
  const detectedStack: string[] = [];
  let repoDescription = '';
  let fetchedLive = false;

  // Safe outbound call strictly to api.github.com with timeout and size limit
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const resp = await fetch(`https://api.github.com/repos/${check.owner}/${check.repo}`, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'NEXORA-SkillAuditor' },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (resp.ok) {
      const json = (await resp.json()) as { language?: string; description?: string; topics?: string[] };
      fetchedLive = true;
      if (json.language) detectedStack.push(json.language);
      if (Array.isArray(json.topics)) {
        for (const t of json.topics.slice(0, 6)) detectedStack.push(t);
      }
      if (json.description) {
        repoDescription = sanitizeUntrustedPromptText(json.description, 400);
      }
    }
  } catch {
    // Graceful offline / rate-limit fallback without executing anything
  }

  if (detectedStack.length === 0) {
    detectedStack.push(parsed.data.targetSkillId);
  }

  const now = new Date().toISOString();
  const projTitle = parsed.data.title?.trim() || `${check.owner}/${check.repo}`;
  const notes = fetchedLive
    ? `Public GitHub metadata inspected safely (${detectedStack.join(', ')}). Potential evidence only — pair with assessment or review to validate proficiency.`
    : `Repository URL validated safely (${check.canonicalUrl}). Live GitHub API unreachable; logged as pending potential project evidence without executing code.`;

  db.prepare(
    `INSERT INTO project_submissions (
      id, user_id, title, skill_id, repo_url, description, detected_stack_json, review_status, reviewer_notes, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'Pending Review', ?, ?)`
  ).run(
    `proj-${crypto.randomUUID()}`,
    userId,
    projTitle,
    parsed.data.targetSkillId,
    check.canonicalUrl,
    repoDescription || `GitHub project submitted for ${parsed.data.targetSkillId} evidence review.`,
    JSON.stringify(detectedStack),
    notes,
    now
  );

  // Record potential evidence (keeps state safe — does NOT blindly mark Validated)
  db.prepare(
    `INSERT INTO skill_evidence (
      id, user_id, skill_id, evidence_type, title, description, artifact_url, score_percent, verified_by, resulting_state, created_at
    ) VALUES (?, ?, ?, 'GITHUB_ANALYSIS', ?, ?, ?, NULL, 'GitHub Intelligence (Untrusted Input)', 'Declared', ?)`
  ).run(
    `ev-${crypto.randomUUID()}`,
    userId,
    parsed.data.targetSkillId,
    `GitHub Repo: ${projTitle}`,
    notes,
    check.canonicalUrl,
    now
  );

  grantAchievement(userId, 'ach-first-project');
  const orchestration = await runOrchestratorEvent(userId, {
    type: 'PROJECT_SUBMITTED',
    skillId: parsed.data.targetSkillId,
    title: projTitle,
    detectedStack,
  });

  return res.status(201).json({
    canonicalUrl: check.canonicalUrl,
    detectedStack,
    fetchedLive,
    notes,
    orchestration,
    dashboard: buildUserDashboardPayload(userId),
  });
});

// ---------------- INSTITUTIONAL AGGREGATE ANALYTICS ----------------

app.get('/api/institutional/analytics', requireAuth, (_req, res) => {
  // Privacy-protected aggregate query: no individual learner names, emails, or PII returned
  const totalLearners = (db.prepare(`SELECT COUNT(*) as c FROM users`).get() as { c: number }).c;
  const careerDist = db
    .prepare(
      `SELECT target_career_id as careerId, COUNT(*) as learnerCount
       FROM learner_profiles
       GROUP BY target_career_id`
    )
    .all() as { careerId: string; learnerCount: number }[];

  const skillStateDist = db
    .prepare(
      `SELECT skill_name as skillName,
              SUM(CASE WHEN evidence_state IN ('Demonstrated', 'Validated') THEN 1 ELSE 0 END) as provenCount,
              SUM(CASE WHEN evidence_state = 'Declared' THEN 1 ELSE 0 END) as declaredOnlyCount
       FROM learner_skills
       GROUP BY skill_name
       ORDER BY (provenCount + declaredOnlyCount) DESC
       LIMIT 8`
    )
    .all() as { skillName: string; provenCount: number; declaredOnlyCount: number }[];

  const avgAssessmentRow = db
    .prepare(`SELECT COUNT(*) as attempts, COALESCE(ROUND(AVG(score_percent)), 0) as avgScore FROM assessment_attempts`)
    .get() as { attempts: number; avgScore: number };

  return res.json({
    privacyNote: 'Aggregated cohort telemetry only. Individual learner identities and private records are never exposed.',
    totalLearners,
    careerDistribution: careerDist.map((c) => ({
      careerId: c.careerId,
      careerTitle: CAREERS_CATALOG.find((k) => k.id === c.careerId)?.title || c.careerId,
      learnerCount: c.learnerCount,
    })),
    skillGapTrends: skillStateDist,
    assessmentSummary: avgAssessmentRow,
  });
});

// ---------------- VITE / STATIC SERVER ----------------

async function startServer() {
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const port = Number(process.env.PORT || 3000);
  app.listen(port, '0.0.0.0', () => {
    console.log(`NEXORA server running on http://0.0.0.0:${port}`);
  });
}

startServer();
