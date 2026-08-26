import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import { installationSecret, uploadDir } from './config.js';
import { db, getSetting } from './db.js';

const router = Router();

function assetSignature(assetId: string): string {
  return crypto.createHmac('sha256', installationSecret)
    .update(`easynotice:asset:${assetId}`)
    .digest('base64url');
}

function signatureMatches(assetId: string, supplied: string): boolean {
  const expected = Buffer.from(assetSignature(assetId));
  const actual = Buffer.from(supplied);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

export function publicAssetUrl(assetId: string): string | undefined {
  const baseUrl = getSetting('base_url').trim().replace(/\/$/, '');
  if (!/^https?:\/\//i.test(baseUrl)) return undefined;
  return `${baseUrl}/media/${encodeURIComponent(assetId)}/${assetSignature(assetId)}`;
}

router.get('/media/:assetId/:signature', (request, response) => {
  if (!signatureMatches(request.params.assetId, request.params.signature)) {
    response.status(404).end();
    return;
  }
  const row = db.prepare('SELECT stored_name, mime_type FROM assets WHERE id = ?').get(request.params.assetId) as
    | { stored_name: string; mime_type: string }
    | undefined;
  if (!row) {
    response.status(404).end();
    return;
  }
  const filePath = path.resolve(uploadDir, row.stored_name);
  if (!filePath.startsWith(`${path.resolve(uploadDir)}${path.sep}`) || !fs.existsSync(filePath)) {
    response.status(404).end();
    return;
  }
  response.type(row.mime_type);
  response.setHeader('Cache-Control', 'public, max-age=86400, immutable');
  response.sendFile(filePath);
});

export const publicMediaRouter = router;
