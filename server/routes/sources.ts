import { Router } from 'express';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { db } from '../db.js';
import { decryptSecret, encryptSecret, encryptStoredData, hashToken, randomToken } from '../crypto.js';
import { getRecipe } from '../recipes.js';
import { requestBaseUrl } from '../url.js';
import { slugify } from '../validation.js';
import { applyFirstRule } from '../templates.js';
import type { NormalizedNotice, RuleRow, RouteMode } from '../types.js';
import { wakeWorker } from '../worker.js';
import { buildPreviewSample } from '../preview-samples.js';
import {
  createUgreenCollector,
  getUgreenCollectorView,
  runUgreenCollector,
  testStoredUgreenConnection,
  testUgreenConnection,
  updateUgreenCollector,
} from '../ugreen-collector.js';

const router = Router();

interface SourceRow {
  id: string;
  name: string;
  slug: string;
  recipe_id: string;
  token_encrypted: string;
  enabled: number;
  route_mode: RouteMode;
  default_image_url: string | null;
  default_image_asset_id: string | null;
  default_link_url: string | null;
  last_received_at: number | null;
  created_at: number;
  updated_at: number;
}

function endpointFor(row: SourceRow, baseUrl: string) {
  const token = decryptSecret<string>(row.token_encrypted);
  const recipe = getRecipe(row.recipe_id);
  const hookUrl = `${baseUrl}/hook/${token}`;
  const legacyUrl = `${baseUrl}/api/v1/notify/${row.slug}?token=${encodeURIComponent(token)}`;
  return {
    url: recipe.pathStyle === 'legacy' ? legacyUrl : hookUrl,
    hookUrl,
    legacyUrl,
    method: recipe.method,
    contentType: recipe.contentType,
    bodyTemplate: recipe.bodyTemplate,
  };
}

function channelsFor(sourceId: string): string[] {
  return (db.prepare('SELECT channel_id FROM source_channels WHERE source_id = ? ORDER BY sort_order ASC').all(sourceId) as Array<{ channel_id: string }>)
    .map((row) => row.channel_id);
}

function serialize(row: SourceRow, baseUrl: string) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    recipeId: row.recipe_id,
    enabled: Boolean(row.enabled),
    routeMode: row.route_mode,
    lastReceivedAt: row.last_received_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    channelIds: channelsFor(row.id),
    defaultImageUrl: row.default_image_url || '',
    defaultImageAssetId: row.default_image_asset_id || '',
    defaultImageAssetUrl: row.default_image_asset_id ? `/api/assets/${row.default_image_asset_id}` : '',
    defaultLinkUrl: row.default_link_url || '',
    endpoint: endpointFor(row, baseUrl),
    collector: row.recipe_id === 'ugreen-dxp' ? getUgreenCollectorView(row.id) : undefined,
  };
}

router.get('/', (request, response) => {
  const rows = db.prepare('SELECT * FROM sources ORDER BY enabled DESC, created_at ASC').all() as SourceRow[];
  const baseUrl = requestBaseUrl(request);
  response.json({ sources: rows.map((row) => serialize(row, baseUrl)), baseUrl });
});

router.get('/:id', (request, response) => {
  const row = db.prepare('SELECT * FROM sources WHERE id = ?').get(request.params.id) as SourceRow | undefined;
  if (!row) {
    response.status(404).json({ error: '通知入口不存在' });
    return;
  }
  response.json({ source: serialize(row, requestBaseUrl(request)) });
});

const ugreenCollectorSchema = z.object({
  baseUrl: z.string().trim().min(1, '请填写绿联管理地址').max(500),
  username: z.string().trim().min(1, '请填写绿联用户名').max(128),
  password: z.string().min(1, '请填写绿联密码').max(256),
  allowSelfSigned: z.boolean().default(false),
  intervalMinutes: z.number().int().min(1).max(60).default(5),
  importRecent: z.boolean().default(false),
});

const sourceFields = z.object({
  name: z.string().trim().min(1, '请填写入口名称').max(80),
  recipeId: z.string().trim().min(1).default('generic'),
  routeMode: z.enum(['failover', 'broadcast']).default('failover'),
  channelIds: z.array(z.string()).default([]),
  enabled: z.boolean().default(true),
  defaultImageUrl: z.union([z.string().url('默认图片地址格式不正确'), z.literal('')]).optional().default(''),
  defaultImageAssetId: z.string().optional().default(''),
  defaultLinkUrl: z.union([z.string().url('图文跳转链接格式不正确'), z.literal('')]).optional().default(''),
  collectorConfig: ugreenCollectorSchema.optional(),
});

const sourceSchema = sourceFields.superRefine((input, context) => {
  if (input.recipeId === 'ugreen-dxp' && !input.collectorConfig) {
    context.addIssue({ code: 'custom', path: ['collectorConfig'], message: '请填写绿联 NAS 的连接信息' });
  }
});
const sourceUpdateSchema = sourceFields.omit({ collectorConfig: true }).partial();

router.post('/ugreen/test-connection', async (request, response) => {
  const input = ugreenCollectorSchema.parse(request.body);
  const result = await testUgreenConnection(input);
  response.json({ ok: true, ...result });
});

function uniqueSlug(preferred: string): string {
  const base = slugify(preferred);
  let candidate = base;
  let number = 2;
  while (db.prepare('SELECT id FROM sources WHERE slug = ?').get(candidate)) {
    candidate = `${base}-${number}`;
    number += 1;
  }
  return candidate;
}

function replaceChannels(sourceId: string, channelIds: string[]): void {
  const unique = [...new Set(channelIds)];
  db.prepare('DELETE FROM source_channels WHERE source_id = ?').run(sourceId);
  const insert = db.prepare('INSERT INTO source_channels (source_id, channel_id, sort_order) VALUES (?, ?, ?)');
  unique.forEach((channelId, index) => insert.run(sourceId, channelId, index));
}

router.post('/', (request, response) => {
  const input = sourceSchema.parse(request.body);
  const token = randomToken();
  const id = nanoid();
  const now = Date.now();
  const slug = uniqueSlug(input.recipeId !== 'generic' ? input.recipeId : input.name);
  db.transaction(() => {
    db.prepare(`
      INSERT INTO sources (
        id, name, slug, recipe_id, token_hash, token_encrypted, enabled, route_mode,
        default_image_url, default_image_asset_id, default_link_url, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      input.name,
      slug,
      input.recipeId,
      hashToken(token),
      encryptSecret(token),
      input.enabled ? 1 : 0,
      input.routeMode,
      input.defaultImageUrl || null,
      input.defaultImageAssetId || null,
      input.defaultLinkUrl || null,
      now,
      now,
    );
    replaceChannels(id, input.channelIds);
    if (input.recipeId === 'ugreen-dxp' && input.collectorConfig) createUgreenCollector(id, input.collectorConfig);
  })();
  const row = db.prepare('SELECT * FROM sources WHERE id = ?').get(id) as SourceRow;
  response.status(201).json({ source: serialize(row, requestBaseUrl(request)) });
});

router.put('/:id', (request, response) => {
  const existing = db.prepare('SELECT * FROM sources WHERE id = ?').get(request.params.id) as SourceRow | undefined;
  if (!existing) {
    response.status(404).json({ error: '通知入口不存在' });
    return;
  }
  const input = sourceUpdateSchema.parse(request.body);
  const hasUgreenCollector = Boolean(db.prepare('SELECT 1 FROM ugreen_collectors WHERE source_id = ?').get(existing.id));
  db.transaction(() => {
    db.prepare(`
      UPDATE sources SET name = ?, recipe_id = ?, enabled = ?, route_mode = ?,
        default_image_url = ?, default_image_asset_id = ?, default_link_url = ?, updated_at = ? WHERE id = ?
    `).run(
      input.name || existing.name,
      hasUgreenCollector ? 'ugreen-dxp' : input.recipeId || existing.recipe_id,
      input.enabled === undefined ? existing.enabled : input.enabled ? 1 : 0,
      input.routeMode || existing.route_mode,
      input.defaultImageUrl === undefined ? existing.default_image_url : input.defaultImageUrl || null,
      input.defaultImageAssetId === undefined ? existing.default_image_asset_id : input.defaultImageAssetId || null,
      input.defaultLinkUrl === undefined ? existing.default_link_url : input.defaultLinkUrl || null,
      Date.now(),
      existing.id,
    );
    if (input.channelIds) replaceChannels(existing.id, input.channelIds);
  })();
  const row = db.prepare('SELECT * FROM sources WHERE id = ?').get(existing.id) as SourceRow;
  response.json({ source: serialize(row, requestBaseUrl(request)) });
});

router.post('/:id/regenerate-token', (request, response) => {
  const existing = db.prepare('SELECT * FROM sources WHERE id = ?').get(request.params.id) as SourceRow | undefined;
  if (!existing) {
    response.status(404).json({ error: '通知入口不存在' });
    return;
  }
  const token = randomToken();
  db.prepare('UPDATE sources SET token_hash = ?, token_encrypted = ?, updated_at = ? WHERE id = ?')
    .run(hashToken(token), encryptSecret(token), Date.now(), existing.id);
  const row = db.prepare('SELECT * FROM sources WHERE id = ?').get(existing.id) as SourceRow;
  response.json({ source: serialize(row, requestBaseUrl(request)) });
});

router.put('/:id/ugreen', (request, response) => {
  const existing = db.prepare('SELECT source_id FROM ugreen_collectors WHERE source_id = ?').get(request.params.id);
  if (!existing) {
    response.status(404).json({ error: '绿联通知入口不存在' });
    return;
  }
  const input = ugreenCollectorSchema.partial().parse(request.body);
  response.json({ collector: updateUgreenCollector(request.params.id, input) });
});

router.post('/:id/ugreen/test', async (request, response) => {
  const result = await testStoredUgreenConnection(request.params.id);
  response.json({ ok: true, ...result });
});

router.post('/:id/ugreen/run', async (request, response) => {
  const result = await runUgreenCollector(request.params.id);
  response.json({ ok: true, ...result, collector: getUgreenCollectorView(request.params.id) });
});

router.post('/:id/test', (request, response) => {
  const source = db.prepare('SELECT * FROM sources WHERE id = ?').get(request.params.id) as SourceRow | undefined;
  if (!source) {
    response.status(404).json({ error: '通知入口不存在' });
    return;
  }
  const recipeSample = buildPreviewSample(source.name, source.recipe_id);
  const sample: NormalizedNotice = {
    ...recipeSample,
    title: request.body?.title || recipeSample.title,
    body: request.body?.body || recipeSample.body,
    eventType: request.body?.eventType || recipeSample.eventType,
  };
  const rules = db.prepare('SELECT * FROM rules WHERE source_id = ? AND enabled = 1 ORDER BY priority ASC, created_at ASC')
    .all(source.id) as RuleRow[];
  const applied = applyFirstRule(sample, rules, {
    imageUrl: source.default_image_url || undefined,
    imageAssetId: source.default_image_asset_id || undefined,
    linkUrl: source.default_link_url || undefined,
  });
  const id = nanoid();
  const now = Date.now();
  db.prepare(`
    INSERT INTO events (
      id, source_id, request_id, status, title, body, event_type, severity,
      image_url, image_asset_id, link_url, raw_json, matched_rule_id, received_at
    ) VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, source.id, `manual-preview-${nanoid(8)}`, applied.notice.title, applied.notice.body,
    applied.notice.eventType, applied.notice.severity, applied.notice.imageUrl || null,
    applied.imageAssetId || null, applied.notice.linkUrl || null, encryptStoredData(applied.notice.raw), applied.matchedRule?.id || null, now,
  );
  wakeWorker();
  response.status(202).json({ ok: true, eventId: id });
});

router.delete('/:id', (request, response) => {
  const exists = db.prepare('SELECT id FROM sources WHERE id = ?').get(request.params.id);
  if (!exists) {
    response.status(404).json({ error: '通知入口不存在' });
    return;
  }
  db.prepare('UPDATE sources SET enabled = 0, updated_at = ? WHERE id = ?').run(Date.now(), request.params.id);
  response.json({ ok: true });
});

router.delete('/:id/permanent', (request, response) => {
  const row = db.prepare('SELECT id, enabled FROM sources WHERE id = ?').get(request.params.id) as
    | { id: string; enabled: number }
    | undefined;
  if (!row) {
    response.status(404).json({ error: '通知入口不存在' });
    return;
  }
  if (row.enabled) {
    response.status(409).json({ error: '请先停用通知入口，再执行永久删除' });
    return;
  }
  db.prepare('DELETE FROM sources WHERE id = ?').run(row.id);
  response.json({ ok: true });
});

export const sourcesRouter = router;
