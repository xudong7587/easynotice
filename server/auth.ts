import type { NextFunction, Request, Response } from 'express';
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { db, getSetting, purgeExpiredSessions, setSetting } from './db.js';
import { hashToken, randomToken } from './crypto.js';
import { sessionCookie } from './config.js';

const router = Router();
const attempts = new Map<string, { count: number; resetAt: number }>();
const sessionDays = 30;

function sessionOptions(maxAge = sessionDays * 24 * 60 * 60 * 1000) {
  return {
    httpOnly: true,
    sameSite: 'strict' as const,
    secure: process.env.EASYNOTICE_COOKIE_SECURE === 'true',
    path: '/',
    maxAge,
  };
}

function createSession(response: Response): void {
  purgeExpiredSessions();
  const token = randomToken(32);
  const now = Date.now();
  db.prepare('INSERT INTO sessions (token_hash, expires_at, created_at) VALUES (?, ?, ?)')
    .run(hashToken(token), now + sessionDays * 24 * 60 * 60 * 1000, now);
  response.cookie(sessionCookie, token, sessionOptions());
}

function isAuthenticated(request: Request): boolean {
  const token = request.cookies?.[sessionCookie] as string | undefined;
  if (!token) return false;
  const row = db.prepare('SELECT expires_at FROM sessions WHERE token_hash = ?').get(hashToken(token)) as
    | { expires_at: number }
    | undefined;
  return Boolean(row && row.expires_at > Date.now());
}

export function requireAuth(request: Request, response: Response, next: NextFunction): void {
  if (!isAuthenticated(request)) {
    response.status(401).json({ error: '请先登录 EasyNotice' });
    return;
  }
  next();
}

router.get('/setup/status', (request, response) => {
  const admin = db.prepare('SELECT id FROM admin WHERE id = 1').get();
  response.json({
    needsSetup: !admin,
    authenticated: isAuthenticated(request),
    setupComplete: getSetting('setup_complete') === 'true',
    appName: getSetting('app_name', 'EasyNotice'),
  });
});

const setupSchema = z.object({
  password: z.string().min(8, '管理密码至少需要 8 位'),
  baseUrl: z.string().trim().optional().default(''),
});

router.post('/setup', async (request, response) => {
  if (db.prepare('SELECT id FROM admin WHERE id = 1').get()) {
    response.status(409).json({ error: '初始化已经完成' });
    return;
  }
  const parsed = setupSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: parsed.error.issues[0]?.message || '初始化信息不完整' });
    return;
  }
  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  const now = Date.now();
  db.transaction(() => {
    db.prepare('INSERT INTO admin (id, password_hash, created_at, updated_at) VALUES (1, ?, ?, ?)')
      .run(passwordHash, now, now);
    if (parsed.data.baseUrl) setSetting('base_url', parsed.data.baseUrl.replace(/\/$/, ''));
  })();
  createSession(response);
  response.status(201).json({ ok: true });
});

const loginSchema = z.object({ password: z.string().min(1) });

router.post('/auth/login', async (request, response) => {
  const key = request.ip || 'local';
  const current = attempts.get(key);
  if (current && current.resetAt > Date.now() && current.count >= 8) {
    response.status(429).json({ error: '尝试次数过多，请 10 分钟后再试' });
    return;
  }
  const parsed = loginSchema.safeParse(request.body);
  const admin = db.prepare('SELECT password_hash FROM admin WHERE id = 1').get() as
    | { password_hash: string }
    | undefined;
  const valid = Boolean(parsed.success && admin && await bcrypt.compare(parsed.data.password, admin.password_hash));
  if (!valid) {
    const resetAt = current?.resetAt && current.resetAt > Date.now() ? current.resetAt : Date.now() + 10 * 60_000;
    attempts.set(key, { count: (current?.count || 0) + 1, resetAt });
    response.status(401).json({ error: '密码不正确' });
    return;
  }
  attempts.delete(key);
  createSession(response);
  response.json({ ok: true });
});

router.post('/auth/logout', (request, response) => {
  const token = request.cookies?.[sessionCookie] as string | undefined;
  if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token));
  response.clearCookie(sessionCookie, sessionOptions(0));
  response.json({ ok: true });
});

router.get('/auth/me', requireAuth, (_request, response) => {
  response.json({ authenticated: true });
});

export const authRouter = router;
