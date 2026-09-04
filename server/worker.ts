import path from 'node:path';
import { nanoid } from 'nanoid';
import { db } from './db.js';
import { decryptSecret, decryptStoredData } from './crypto.js';
import { uploadDir } from './config.js';
import { publicAssetUrl } from './media.js';
import { deliverToChannel } from './channels.js';
import type { ChannelConfig, ChannelType, NoticeForDelivery, RouteMode } from './types.js';
import { redactSensitiveText } from './security.js';
import { builtInPreviewImagePath, builtInPreviewImageUrl } from './preview.js';

interface EventRow {
  id: string;
  source_id: string;
  request_id: string;
  title: string;
  body: string;
  event_type: string;
  severity: NoticeForDelivery['severity'];
  image_url: string | null;
  image_asset_id: string | null;
  link_url: string | null;
  raw_json: string;
  matched_rule_id: string | null;
}

interface RouteRow {
  id: string;
  name: string;
  type: ChannelType;
  config_encrypted: string;
  route_mode: RouteMode;
  source_name: string;
}

interface AssetRow {
  id: string;
  stored_name: string;
  mime_type: string;
}

let running = false;
let timer: NodeJS.Timeout | undefined;

function claimNextEvent(): EventRow | undefined {
  const transaction = db.transaction(() => {
    const row = db.prepare(`
      SELECT * FROM events
      WHERE status = 'pending'
      ORDER BY received_at ASC
      LIMIT 1
    `).get() as EventRow | undefined;
    if (!row) return undefined;
    const result = db.prepare(`
      UPDATE events SET status = 'processing', error = NULL
      WHERE id = ? AND status = 'pending'
    `).run(row.id);
    return result.changes === 1 ? row : undefined;
  });
  return transaction();
}

function loadRoutes(sourceId: string): RouteRow[] {
  return db.prepare(`
    SELECT c.id, c.name, c.type, c.config_encrypted, s.route_mode, s.name AS source_name
    FROM source_channels sc
    JOIN channels c ON c.id = sc.channel_id
    JOIN sources s ON s.id = sc.source_id
    WHERE sc.source_id = ? AND c.enabled = 1 AND s.enabled = 1
    ORDER BY sc.sort_order ASC, c.created_at ASC
  `).all(sourceId) as RouteRow[];
}

function loadAsset(event: EventRow): AssetRow | undefined {
  if (!event.image_asset_id) return undefined;
  return db.prepare('SELECT id, stored_name, mime_type FROM assets WHERE id = ?')
    .get(event.image_asset_id) as AssetRow | undefined;
}

function buildNotice(event: EventRow, sourceName: string): NoticeForDelivery {
  const asset = loadAsset(event);
  const needsPreviewImage = event.request_id.startsWith('manual-preview-') && !asset && !event.image_url;
  return {
    eventId: event.id,
    sourceName,
    title: event.title,
    body: event.body,
    eventType: event.event_type,
    severity: event.severity,
    imageUrl: event.image_url || undefined,
    linkUrl: event.link_url || undefined,
    raw: decryptStoredData<Record<string, unknown>>(event.raw_json),
    imageAssetPath: asset ? path.join(uploadDir, asset.stored_name) : needsPreviewImage ? builtInPreviewImagePath() : undefined,
    imageAssetUrl: asset ? publicAssetUrl(asset.id) : needsPreviewImage ? builtInPreviewImageUrl() : undefined,
    imageMimeType: asset?.mime_type || (needsPreviewImage ? 'image/png' : undefined),
  };
}

async function sendOne(event: EventRow, route: RouteRow, notice: NoticeForDelivery): Promise<boolean> {
  let lastError = '';
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const deliveryId = nanoid();
    const startedAt = Date.now();
    db.prepare(`
      INSERT INTO deliveries (id, event_id, channel_id, attempt, status, started_at)
      VALUES (?, ?, ?, ?, 'sending', ?)
    `).run(deliveryId, event.id, route.id, attempt, startedAt);
    try {
      const config = decryptSecret<ChannelConfig>(route.config_encrypted);
      const result = await deliverToChannel(route.type, config, notice);
      const completedAt = Date.now();
      db.prepare(`
        UPDATE deliveries
        SET status = 'success', completed_at = ?, duration_ms = ?, http_status = ?, response_excerpt = ?
        WHERE id = ?
      `).run(completedAt, completedAt - startedAt, result.httpStatus ?? null, redactSensitiveText(result.responseExcerpt), deliveryId);
      db.prepare(`
        UPDATE channels SET last_status = 'success', last_error = NULL, last_success_at = ?, updated_at = ?
        WHERE id = ?
      `).run(completedAt, completedAt, route.id);
      return true;
    } catch (error) {
      const completedAt = Date.now();
      lastError = redactSensitiveText(error instanceof Error ? error.message : '未知发送错误');
      db.prepare(`
        UPDATE deliveries SET status = 'failed', completed_at = ?, duration_ms = ?, error = ?
        WHERE id = ?
      `).run(completedAt, completedAt - startedAt, lastError.slice(0, 800), deliveryId);
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 700));
    }
  }
  db.prepare(`
    UPDATE channels SET last_status = 'failed', last_error = ?, updated_at = ? WHERE id = ?
  `).run(lastError.slice(0, 800), Date.now(), route.id);
  return false;
}

async function processEvent(event: EventRow): Promise<void> {
  const routes = loadRoutes(event.source_id);
  if (!routes.length) {
    db.prepare(`UPDATE events SET status = 'failed', error = ?, processed_at = ? WHERE id = ?`)
      .run('还没有为这个入口配置通知出口', Date.now(), event.id);
    return;
  }

  const notice = buildNotice(event, routes[0].source_name);
  let successes = 0;
  let failures = 0;
  const routeMode = routes[0].route_mode;

  for (let index = 0; index < routes.length; index += 1) {
    const route = routes[index];
    if (routeMode === 'failover' && successes > 0) {
      db.prepare(`
        INSERT INTO deliveries (id, event_id, channel_id, attempt, status, completed_at, response_excerpt)
        VALUES (?, ?, ?, 0, 'skipped', ?, ?)
      `).run(nanoid(), event.id, route.id, Date.now(), '前一个渠道已送达，无需启用备用渠道');
      continue;
    }
    const success = await sendOne(event, route, notice);
    if (success) successes += 1;
    else failures += 1;
  }

  const status = successes === 0 ? 'failed' : failures > 0 ? 'partial' : 'success';
  db.prepare(`UPDATE events SET status = ?, processed_at = ?, error = ? WHERE id = ?`).run(
    status,
    Date.now(),
    successes === 0 ? '所有通知渠道均发送失败' : null,
    event.id,
  );
}

async function tick(): Promise<void> {
  if (running) return;
  running = true;
  try {
    for (let count = 0; count < 10; count += 1) {
      const event = claimNextEvent();
      if (!event) break;
      await processEvent(event);
    }
  } finally {
    running = false;
  }
}

export function startWorker(): void {
  db.prepare(`
    UPDATE events SET status = 'pending', error = '服务重启后恢复处理'
    WHERE status = 'processing' AND received_at < ?
  `).run(Date.now() - 5 * 60_000);
  timer = setInterval(() => void tick(), 900);
  timer.unref();
  void tick();
}

export function stopWorker(): void {
  if (timer) clearInterval(timer);
}

export function wakeWorker(): void {
  void tick();
}
