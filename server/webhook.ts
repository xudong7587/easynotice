import type { Request, Response } from 'express';
import { Router } from 'express';
import { nanoid } from 'nanoid';
import { db } from './db.js';
import { hashToken, safeEqualHash } from './crypto.js';
import { normalizeIncoming } from './normalize.js';
import { applyFirstRule } from './templates.js';
import type { RuleRow } from './types.js';
import { wakeWorker } from './worker.js';

const router = Router();

interface SourceRow {
  id: string;
  name: string;
  slug: string;
  token_hash: string;
  enabled: number;
}

function bearerToken(request: Request): string | undefined {
  const authorization = request.header('authorization');
  if (authorization?.toLowerCase().startsWith('bearer ')) return authorization.slice(7).trim();
  return request.header('x-easynotice-token') || undefined;
}

function resolveSource(request: Request): SourceRow | undefined {
  const directToken = Array.isArray(request.params.token) ? request.params.token[0] : request.params.token;
  if (directToken) {
    return db.prepare('SELECT id, name, slug, token_hash, enabled FROM sources WHERE token_hash = ?')
      .get(hashToken(directToken)) as SourceRow | undefined;
  }

  const slug = Array.isArray(request.params.slug) ? request.params.slug[0] : request.params.slug;
  if (!slug) return undefined;
  const source = db.prepare('SELECT id, name, slug, token_hash, enabled FROM sources WHERE slug = ?')
    .get(slug) as SourceRow | undefined;
  if (!source) return undefined;

  const supplied = String(request.query.token || bearerToken(request) || '');
  if (!supplied || !safeEqualHash(source.token_hash, supplied)) return undefined;
  return source;
}

function receive(request: Request, response: Response): void {
  const source = resolveSource(request);
  if (!source || !source.enabled) {
    response.status(404).json({ success: false, error: '通知入口不存在或已停用' });
    return;
  }

  const normalized = normalizeIncoming({
    method: request.method,
    query: request.query as Record<string, unknown>,
    body: request.body,
    rawText: typeof request.body === 'string' ? request.body : undefined,
  });
  const rules = db.prepare(`
    SELECT * FROM rules WHERE source_id = ? AND enabled = 1 ORDER BY priority ASC, created_at ASC
  `).all(source.id) as RuleRow[];
  const applied = applyFirstRule(normalized, rules);
  const eventId = nanoid();
  const requestId = request.header('x-request-id')?.slice(0, 120) || nanoid(12);
  const now = Date.now();

  db.transaction(() => {
    db.prepare(`
      INSERT INTO events (
        id, source_id, request_id, status, title, body, event_type, severity,
        image_url, link_url, raw_json, matched_rule_id, received_at
      ) VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      eventId,
      source.id,
      requestId,
      applied.notice.title,
      applied.notice.body,
      applied.notice.eventType,
      applied.notice.severity,
      applied.notice.imageUrl || null,
      applied.notice.linkUrl || null,
      JSON.stringify(applied.notice.raw),
      applied.matchedRule?.id || null,
      now,
    );
    db.prepare('UPDATE sources SET last_received_at = ?, updated_at = ? WHERE id = ?').run(now, now, source.id);
  })();

  wakeWorker();
  response.status(202).json({
    success: true,
    message: 'EasyNotice 已收到，正在按路由发送',
    eventId,
    recognized: {
      title: applied.notice.title,
      eventType: applied.notice.eventType,
      severity: applied.notice.severity,
      matchedRule: applied.matchedRule?.name || null,
    },
  });
}

router.all('/hook/:token', receive);
router.all('/api/v1/notify/:slug', receive);

export const webhookRouter = router;
