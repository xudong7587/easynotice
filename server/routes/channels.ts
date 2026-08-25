import { Router } from 'express';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { db } from '../db.js';
import { decryptSecret, encryptSecret } from '../crypto.js';
import { deliverToChannel } from '../channels.js';
import { maskChannelConfig, parseChannelConfig } from '../validation.js';
import type { ChannelConfig, ChannelType, NoticeForDelivery } from '../types.js';

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

function serialize(row: ChannelRow) {
  const config = decryptSecret<ChannelConfig>(row.config_encrypted);
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
    config: maskChannelConfig(row.type, config),
  };
}

router.get('/', (_request, response) => {
  const rows = db.prepare('SELECT * FROM channels ORDER BY enabled DESC, created_at ASC').all() as ChannelRow[];
  response.json({ channels: rows.map(serialize) });
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
  response.status(201).json({ channel: serialize(row) });
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
  response.json({ channel: serialize(row) });
});

router.post('/:id/test', async (request, response, next) => {
  const row = db.prepare('SELECT * FROM channels WHERE id = ?').get(request.params.id) as ChannelRow | undefined;
  if (!row) {
    response.status(404).json({ error: '通知渠道不存在' });
    return;
  }
  const notice: NoticeForDelivery = {
    eventId: `test-${nanoid(8)}`,
    sourceName: 'EasyNotice 自检',
    title: request.body?.title || '渠道连接成功',
    body: request.body?.body || '这是一条测试通知。收到它说明这个出口已经可以正常工作。',
    eventType: 'channel_test',
    severity: 'success',
    raw: {},
  };
  const startedAt = Date.now();
  try {
    const result = await deliverToChannel(row.type, decryptSecret<ChannelConfig>(row.config_encrypted), notice);
    db.prepare(`
      UPDATE channels SET last_status = 'success', last_error = NULL, last_success_at = ?, updated_at = ? WHERE id = ?
    `).run(Date.now(), Date.now(), row.id);
    response.json({ ok: true, durationMs: Date.now() - startedAt, detail: result.responseExcerpt });
  } catch (error) {
    const message = error instanceof Error ? error.message : '测试发送失败';
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

export const channelsRouter = router;
