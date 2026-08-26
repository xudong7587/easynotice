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

const router = Router();

interface SourceRow {
  id: string;
  name: string;
  slug: string;
  recipe_id: string;
  token_encrypted: string;
  enabled: number;
  route_mode: RouteMode;
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
    endpoint: endpointFor(row, baseUrl),
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

const sourceSchema = z.object({
  name: z.string().trim().min(1, '请填写入口名称').max(80),
  recipeId: z.string().trim().min(1).default('generic'),
  routeMode: z.enum(['failover', 'broadcast']).default('failover'),
  channelIds: z.array(z.string()).default([]),
  enabled: z.boolean().default(true),
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
        id, name, slug, recipe_id, token_hash, token_encrypted, enabled, route_mode, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      input.name,
      slug,
      input.recipeId,
      hashToken(token),
      encryptSecret(token),
      input.enabled ? 1 : 0,
      input.routeMode,
      now,
      now,
    );
    replaceChannels(id, input.channelIds);
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
  const input = sourceSchema.partial().parse(request.body);
  db.transaction(() => {
    db.prepare(`
      UPDATE sources SET name = ?, recipe_id = ?, enabled = ?, route_mode = ?, updated_at = ? WHERE id = ?
    `).run(
      input.name || existing.name,
      input.recipeId || existing.recipe_id,
      input.enabled === undefined ? existing.enabled : input.enabled ? 1 : 0,
      input.routeMode || existing.route_mode,
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
  const applied = applyFirstRule(sample, rules);
  const id = nanoid();
  const now = Date.now();
  db.prepare(`
    INSERT INTO events (
      id, source_id, request_id, status, title, body, event_type, severity,
      image_url, link_url, raw_json, matched_rule_id, received_at
    ) VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, source.id, `manual-preview-${nanoid(8)}`, applied.notice.title, applied.notice.body,
    applied.notice.eventType, applied.notice.severity, applied.notice.imageUrl || null,
    applied.notice.linkUrl || null, encryptStoredData(applied.notice.raw), applied.matchedRule?.id || null, now,
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
