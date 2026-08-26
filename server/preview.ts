import fs from 'node:fs';
import path from 'node:path';
import { nanoid } from 'nanoid';
import { db, getSetting } from './db.js';
import { uploadDir } from './config.js';
import { publicAssetUrl } from './media.js';
import { buildPreviewSample } from './preview-samples.js';
import { applyFirstRule } from './templates.js';
import type { NoticeForDelivery, RuleRow } from './types.js';

interface PreviewSourceRow {
  id: string;
  name: string;
  recipe_id: string;
}

interface PreviewAssetRow {
  id: string;
  stored_name: string;
  mime_type: string;
}

export function builtInPreviewImagePath(): string | undefined {
  const candidates = [
    path.resolve(process.cwd(), 'public', 'notification-preview.png'),
    path.resolve(process.cwd(), 'dist', 'notification-preview.png'),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate));
}

export function builtInPreviewImageUrl(baseUrl = getSetting('base_url')): string | undefined {
  const normalized = baseUrl.trim().replace(/\/$/, '');
  if (!/^https?:\/\//i.test(normalized)) return undefined;
  return `${normalized}/notification-preview.png`;
}

function loadPreviewAsset(rule?: RuleRow): PreviewAssetRow | undefined {
  if (!rule?.image_asset_id) return undefined;
  return db.prepare('SELECT id, stored_name, mime_type FROM assets WHERE id = ?')
    .get(rule.image_asset_id) as PreviewAssetRow | undefined;
}

export function buildChannelPreview(sourceId: string | undefined, baseUrl: string): NoticeForDelivery | undefined {
  const source = sourceId
    ? db.prepare('SELECT id, name, recipe_id FROM sources WHERE id = ?').get(sourceId) as PreviewSourceRow | undefined
    : undefined;
  if (sourceId && !source) return undefined;

  const sourceName = source?.name || 'Lucky 主路由';
  const sample = buildPreviewSample(sourceName, source?.recipe_id || 'lucky');
  const rules = source
    ? db.prepare('SELECT * FROM rules WHERE source_id = ? AND enabled = 1 ORDER BY priority ASC, created_at ASC')
      .all(source.id) as RuleRow[]
    : [];
  const applied = applyFirstRule(sample, rules);
  const asset = loadPreviewAsset(applied.matchedRule);
  const assetPath = asset ? path.resolve(uploadDir, asset.stored_name) : undefined;
  const validAssetPath = assetPath && fs.existsSync(assetPath) ? assetPath : undefined;
  const needsFallbackImage = !validAssetPath && !applied.notice.imageUrl;

  return {
    ...applied.notice,
    eventId: `preview-${nanoid(8)}`,
    sourceName,
    imageAssetPath: validAssetPath || (needsFallbackImage ? builtInPreviewImagePath() : undefined),
    imageAssetUrl: validAssetPath
      ? publicAssetUrl(asset!.id)
      : needsFallbackImage ? builtInPreviewImageUrl(baseUrl) : undefined,
    imageMimeType: validAssetPath ? asset?.mime_type : needsFallbackImage ? 'image/png' : undefined,
  };
}
