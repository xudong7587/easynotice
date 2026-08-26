import { Router } from 'express';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { db } from '../db.js';
import { decryptSecret, encryptSecret } from '../crypto.js';
import { deliverToChannel } from '../channels.js';
import { maskChannelConfig, parseChannelConfig } from '../validation.js';
import type { ChannelConfig, ChannelType } from '../types.js';
import { requestBaseUrl } from '../url.js';
import { redactSensitiveText } from '../security.js';
import { buildChannelPreview } from '../preview.js';

const router = Router();

interface ChannelRow {
  id: string;
  name: string;
  type: ChannelType;
  config_encrypted: string;
  enabled: number;
  last_status: string;
  last_error: string | null;
  last_success_at: number | null;
  created_at: number;
  updated_at: number;
}

function serialize(row: ChannelRow, baseUrl: string) {
  const config = decryptSecret<ChannelConfig>(row.config_encrypted);
  const callback = row.type === 'wecom_app'
    ? db.prepare(`
      SELECT message_type, event_type, received_at
      FROM wecom_callback_events WHERE channel_id = ? ORDER BY received_at DESC LIMIT 1
    `).get(row.id) as { message_type: string; event_type: string; received_at: number } | undefined
    : undefined;
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    enabled: Boolean(row.enabled),
    lastStatus: row.last_status,
    lastError: row.last_error,
    lastSuccessAt: row.last_success_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    callbackUrl: row.type === 'wecom_app' ? `${baseUrl}/callback/wecom/${row.id}` : undefined,
    lastCallbackAt: callback?.received_at,
    lastCallbackType: callback ? callback.event_type || callback.message_type || 'unknown' : undefined,
    config: maskChannelConfig(row.type, config),
  };
}

router.get('/', (request, response) => {
  const rows = db.prepare('SELECT * FROM channels ORDER BY enabled DESC, created_at ASC').all() as ChannelRow[];
  const baseUrl = requestBaseUrl(request);
  response.json({ channels: rows.map((row) => serialize(row, baseUrl)) });
});

const channelSchema = z.object({
  name: z.string().trim().min(1, '请填写渠道名称').max(80),
  type: z.enum(['wecom_app', 'wecom_robot', 'telegram', 'bark']),
  config: z.record(z.string(), z.unknown()),
  enabled: z.boolean().optional().default(true),
});

router.post('/', (request, response) => {
  const input = channelSchema.parse(request.body);
  const config = parseChannelConfig(input.type, input.config);
  const now = Date.now();
  const id = nanoid();
  db.prepare(`
    INSERT INTO channels (id, name, type, config_encrypted, enabled, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, input.name, input.type, encryptSecret(config), input.enabled ? 1 : 0, now, now);
  const row = db.prepare('SELECT * FROM channels WHERE id = ?').get(id) as ChannelRow;
  response.status(201).json({ channel: serialize(row, requestBaseUrl(request)) });
});

router.put('/:id', (request, response) => {
  const existing = db.prepare('SELECT * FROM channels WHERE id = ?').get(request.params.id) as ChannelRow | undefined;
  if (!existing) {
    response.status(404).json({ error: '通知渠道不存在' });
    return;
  }
  const input = channelSchema.partial().parse(request.body);
  const currentConfig = decryptSecret<ChannelConfig>(existing.config_encrypted);
  const type = input.type || existing.type;
  const config = input.config ? parseChannelConfig(type, input.config, currentConfig) : currentConfig;
  db.prepare(`
    UPDATE channels SET name = ?, type = ?, config_encrypted = ?, enabled = ?, updated_at = ? WHERE id = ?
  `).run(
    input.name || existing.name,
    type,
    encryptSecret(config),
    input.enabled === undefined ? existing.enabled : input.enabled ? 1 : 0,
    Date.now(),
    existing.id,
  );
  const row = db.prepare('SELECT * FROM channels WHERE id = ?').get(existing.id) as ChannelRow;
  response.json({ channel: serialize(row, requestBaseUrl(request)) });
});

router.get('/:id/callback-events', (request, response) => {
  const row = db.prepare('SELECT id, type FROM channels WHERE id = ?').get(request.params.id) as
    | { id: string; type: ChannelType }
    | undefined;
  if (!row || row.type !== 'wecom_app') {
    response.status(404).json({ error: '企业微信应用出口不存在' });
    return;
  }
  const events = db.prepare(`
    SELECT id, message_type, event_type, from_user, received_at
    FROM wecom_callback_events WHERE channel_id = ? ORDER BY received_at DESC LIMIT 20
  `).all(row.id) as Array<Record<string, unknown>>;
  response.json({
    events: events.map((event) => ({
      id: event.id,
      messageType: event.message_type,
      eventType: event.event_type,
      fromUser: event.from_user,
      receivedAt: event.received_at,
    })),
  });
});

router.post('/:id/test', async (request, response, next) => {
  const row = db.prepare('SELECT * FROM channels WHERE id = ?').get(request.params.id) as ChannelRow | undefined;
  if (!row) {
    response.status(404).json({ error: '通知渠道不存在' });
    return;
  }
  const input = z.object({ sourceId: z.string().trim().optional() }).parse(request.body || {});
  const notice = buildChannelPreview(input.sourceId || undefined, requestBaseUrl(request));
  if (!notice) {
    response.status(404).json({ error: '用于预览的通知来源不存在' });
    return;
  }
  const startedAt = Date.now();
  try {
    const result = await deliverToChannel(row.type, decryptSecret<ChannelConfig>(row.config_encrypted), notice);
    db.prepare(`
      UPDATE channels SET last_status = 'success', last_error = NULL, last_success_at = ?, updated_at = ? WHERE id = ?
    `).run(Date.now(), Date.now(), row.id);
    response.json({
      ok: true,
      durationMs: Date.now() - startedAt,
      detail: result.responseExcerpt,
      preview: {
        sourceName: notice.sourceName,
        title: notice.title,
        eventType: notice.eventType,
        hasImage: row.type !== 'wecom_robot' && Boolean(notice.imageAssetPath || notice.imageUrl),
      },
    });
  } catch (error) {
    const message = redactSensitiveText(error instanceof Error ? error.message : '消息预览发送失败');
    db.prepare(`UPDATE channels SET last_status = 'failed', last_error = ?, updated_at = ? WHERE id = ?`)
      .run(message.slice(0, 800), Date.now(), row.id);
    next(Object.assign(new Error(message), { statusCode: 502 }));
  }
});

router.delete('/:id', (request, response) => {
  const row = db.prepare('SELECT id FROM channels WHERE id = ?').get(request.params.id);
  if (!row) {
    response.status(404).json({ error: '通知渠道不存在' });
    return;
  }
  db.transaction(() => {
    db.prepare('DELETE FROM source_channels WHERE channel_id = ?').run(request.params.id);
    db.prepare(`UPDATE channels SET enabled = 0, last_status = 'archived', updated_at = ? WHERE id = ?`)
      .run(Date.now(), request.params.id);
  })();
  response.json({ ok: true });
});

router.delete('/:id/permanent', (request, response) => {
  const row = db.prepare('SELECT id, enabled FROM channels WHERE id = ?').get(request.params.id) as
    | { id: string; enabled: number }
    | undefined;
  if (!row) {
    response.status(404).json({ error: '通知渠道不存在' });
    return;
  }
  if (row.enabled) {
    response.status(409).json({ error: '请先停用通知出口，再执行永久删除' });
    return;
  }
  db.prepare('DELETE FROM channels WHERE id = ?').run(row.id);
  response.json({ ok: true });
});

export const channelsRouter = router;
