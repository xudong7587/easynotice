import { Router } from 'express';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { db } from '../db.js';

const router = Router();

const ruleSchema = z.object({
  sourceId: z.string().min(1),
  name: z.string().trim().min(1, '请填写规则名称').max(80),
  enabled: z.boolean().default(true),
  priority: z.number().int().min(0).max(10_000).default(0),
  matchField: z.enum(['always', 'any', 'title', 'body', 'eventType', 'severity']).default('always'),
  matchOperator: z.enum(['always', 'contains', 'equals', 'regex']).default('always'),
  matchValue: z.string().max(240).default(''),
  titleTemplate: z.string().max(500).optional().default(''),
  bodyTemplate: z.string().max(10_000).optional().default(''),
  imageUrl: z.union([z.string().url('图片地址格式不正确'), z.literal('')]).optional().default(''),
  imageAssetId: z.string().optional().default(''),
  linkTemplate: z.string().max(1000).optional().default(''),
});

function serialize(row: Record<string, unknown>) {
  return {
    id: row.id,
    sourceId: row.source_id,
    name: row.name,
    enabled: Boolean(row.enabled),
    priority: row.priority,
    matchField: row.match_field,
    matchOperator: row.match_operator,
    matchValue: row.match_value,
    titleTemplate: row.title_template || '',
    bodyTemplate: row.body_template || '',
    imageUrl: row.image_url || '',
    imageAssetId: row.image_asset_id || '',
    assetUrl: row.image_asset_id ? `/api/assets/${row.image_asset_id}` : '',
    linkTemplate: row.link_template || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

router.get('/', (request, response) => {
  const sourceId = String(request.query.sourceId || '');
  if (!sourceId) {
    response.status(400).json({ error: '缺少 sourceId' });
    return;
  }
  const rows = db.prepare('SELECT * FROM rules WHERE source_id = ? ORDER BY priority ASC, created_at ASC')
    .all(sourceId) as Array<Record<string, unknown>>;
  response.json({ rules: rows.map(serialize) });
});

router.post('/', (request, response) => {
  const input = ruleSchema.parse(request.body);
  if (!db.prepare('SELECT id FROM sources WHERE id = ?').get(input.sourceId)) {
    response.status(404).json({ error: '通知入口不存在' });
    return;
  }
  const id = nanoid();
  const now = Date.now();
  db.prepare(`
    INSERT INTO rules (
      id, source_id, name, enabled, priority, match_field, match_operator, match_value,
      title_template, body_template, image_url, image_asset_id, link_template, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, input.sourceId, input.name, input.enabled ? 1 : 0, input.priority,
    input.matchField, input.matchOperator, input.matchValue, input.titleTemplate || null,
    input.bodyTemplate || null, input.imageUrl || null, input.imageAssetId || null,
    input.linkTemplate || null, now, now,
  );
  const row = db.prepare('SELECT * FROM rules WHERE id = ?').get(id) as Record<string, unknown>;
  response.status(201).json({ rule: serialize(row) });
});

router.put('/:id', (request, response) => {
  const existing = db.prepare('SELECT * FROM rules WHERE id = ?').get(request.params.id) as Record<string, unknown> | undefined;
  if (!existing) {
    response.status(404).json({ error: '通知规则不存在' });
    return;
  }
  const merged = {
    sourceId: existing.source_id,
    name: existing.name,
    enabled: Boolean(existing.enabled),
    priority: existing.priority,
    matchField: existing.match_field,
    matchOperator: existing.match_operator,
    matchValue: existing.match_value,
    titleTemplate: existing.title_template || '',
    bodyTemplate: existing.body_template || '',
    imageUrl: existing.image_url || '',
    imageAssetId: existing.image_asset_id || '',
    linkTemplate: existing.link_template || '',
    ...request.body,
  };
  const input = ruleSchema.parse(merged);
  db.prepare(`
    UPDATE rules SET name = ?, enabled = ?, priority = ?, match_field = ?, match_operator = ?,
      match_value = ?, title_template = ?, body_template = ?, image_url = ?, image_asset_id = ?,
      link_template = ?, updated_at = ? WHERE id = ?
  `).run(
    input.name, input.enabled ? 1 : 0, input.priority, input.matchField, input.matchOperator,
    input.matchValue, input.titleTemplate || null, input.bodyTemplate || null, input.imageUrl || null,
    input.imageAssetId || null, input.linkTemplate || null, Date.now(), request.params.id,
  );
  const row = db.prepare('SELECT * FROM rules WHERE id = ?').get(request.params.id) as Record<string, unknown>;
  response.json({ rule: serialize(row) });
});

router.delete('/:id', (request, response) => {
  const result = db.prepare('DELETE FROM rules WHERE id = ?').run(request.params.id);
  if (!result.changes) {
    response.status(404).json({ error: '通知规则不存在' });
    return;
  }
  response.json({ ok: true });
});

export const rulesRouter = router;
