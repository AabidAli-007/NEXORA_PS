import crypto from 'node:crypto';
import type { CookieOptions, NextFunction, Request, Response } from 'express';
import { db } from './db';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    emailVerified: boolean;
    authProvider: 'local' | 'google' | 'microsoft';
    role: 'student' | 'admin';
    isDemo: boolean;
  };
}

export const SESSION_COOKIE_NAME = 'nexora_session';

export function isHttpsRequest(req: Request): boolean {
  const fwdProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  if (fwdProto === 'https' || req.secure || req.protocol === 'https') {
    return true;
  }
  return false;
}

export function getCookieOptions(req: Request, maxAgeMs: number): CookieOptions {
  const https = isHttpsRequest(req);
  return {
    httpOnly: true,
    sameSite: https ? 'none' : 'lax',
    secure: https,
    maxAge: maxAgeMs,
    path: '/',
  };
}

export function resolvePublicBaseUrl(req: Request): string {
  const appUrl = (process.env.APP_URL || '').trim();
  if (appUrl && appUrl !== 'MY_APP_URL' && /^https?:\/\//i.test(appUrl)) {
    return appUrl.replace(/\/+$/, '');
  }
  const proto = isHttpsRequest(req) ? 'https' : req.protocol || 'http';
  const host = req.get('x-forwarded-host') || req.get('host') || 'localhost:3000';
  return `${proto}://${host}`;
}

export function createSession(userId: string, rememberMe = true): { token: string; maxAgeMs: number } {
  const token = crypto.randomBytes(32).toString('hex');
  const now = new Date();
  const maxAgeMs = (rememberMe ? 30 : 1) * 24 * 60 * 60 * 1000;
  const expires = new Date(now.getTime() + maxAgeMs);
  db.prepare(
    `INSERT INTO sessions (token, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)`
  ).run(token, userId, expires.toISOString(), now.toISOString());
  return { token, maxAgeMs };
}

export function deleteSession(token: string): void {
  db.prepare(`DELETE FROM sessions WHERE token = ?`).run(token);
}

export function resolveUserFromRequest(req: Request): AuthenticatedRequest['user'] | undefined {
  const cookieToken = req.cookies?.[SESSION_COOKIE_NAME];
  const authHeader = req.headers.authorization;
  const bearerToken =
    authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : undefined;

  const token = bearerToken || cookieToken;
  if (!token) return undefined;

  const row = db
    .prepare(
      `SELECT u.id, u.email, u.email_verified, u.auth_provider, u.role, u.is_demo, s.expires_at
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token = ?`
    )
    .get(token) as
    | {
        id: string;
        email: string;
        email_verified: number;
        auth_provider: string;
        role: string;
        is_demo: number;
        expires_at: string;
      }
    | undefined;

  if (!row) return undefined;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    deleteSession(token);
    return undefined;
  }

  return {
    id: row.id,
    email: row.email,
    emailVerified: Boolean(row.email_verified),
    authProvider: (row.auth_provider as 'local' | 'google' | 'microsoft') || 'local',
    role: row.role === 'admin' ? 'admin' : 'student',
    isDemo: Boolean(row.is_demo),
  };
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const user = resolveUserFromRequest(req);
  if (!user) {
    return res.status(401).json({ error: 'Authentication required. Please log in.' });
  }
  req.user = user;
  return next();
}

export function timingSafeHexEqual(aHex: string, bHex: string): boolean {
  if (!aHex || !bHex || aHex.length !== bHex.length) return false;
  try {
    const a = Buffer.from(aHex, 'hex');
    const b = Buffer.from(bHex, 'hex');
    if (a.length === 0 || a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function securityHeadersMiddleware(req: Request, res: Response, next: NextFunction) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-DNS-Prefetch-Control', 'off');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  if (isHttpsRequest(req)) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  return next();
}

export function csrfOriginGuard(req: Request, res: Response, next: NextFunction) {
  const method = req.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    return next();
  }
  const originHeader = req.headers.origin;
  if (!originHeader || originHeader === 'null') {
    return next();
  }

  let parsedOrigin: URL;
  try {
    parsedOrigin = new URL(originHeader);
  } catch {
    return res.status(403).json({ error: 'Invalid request origin header.' });
  }

  const originHost = parsedOrigin.host.toLowerCase();
  const originHostname = parsedOrigin.hostname.toLowerCase();
  const requestHost = (req.get('x-forwarded-host') || req.get('host') || '').toLowerCase();
  const appUrl = (process.env.APP_URL || '').trim();
  let appHost = '';
  try {
    if (appUrl && /^https?:\/\//i.test(appUrl)) {
      appHost = new URL(appUrl).host.toLowerCase();
    }
  } catch {
    appHost = '';
  }

  const isTrustedOrigin =
    (requestHost && originHost === requestHost) ||
    (appHost && originHost === appHost) ||
    originHostname === 'localhost' ||
    originHostname === '127.0.0.1' ||
    originHostname.endsWith('.run.app');

  if (!isTrustedOrigin) {
    return res.status(403).json({ error: 'Cross-origin state-changing request blocked.' });
  }
  return next();
}

// Simple per-IP/user in-memory rate limiter with bounded memory eviction
const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(maxRequests: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    if (buckets.size > 500) {
      for (const [k, v] of buckets.entries()) {
        if (v.resetAt < now) buckets.delete(k);
      }
    }
    const key = `${req.path}:${req.ip || 'local'}`;
    const existing = buckets.get(key);
    if (!existing || existing.resetAt < now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }
    if (existing.count >= maxRequests) {
      res.setHeader('Retry-After', String(Math.max(1, Math.ceil((existing.resetAt - now) / 1000))));
      return res.status(429).json({
        error: 'Too many requests. Please wait a moment and try again.',
      });
    }
    existing.count += 1;
    return next();
  };
}
