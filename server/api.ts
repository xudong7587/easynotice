import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import { nanoid } from 'nanoid';
import { db, getSetting } from './db.js';
import { maxUploadBytes, uploadDir } from './config.js';
import { recipes } from './recipes.js';
import { channelsRouter } from './routes/channels.js';
import { sourcesRouter } from './routes/sources.js';
import { rulesRouter } from './routes/rules.js';
import { eventsRouter } from './routes/events.js';
import { settingsRouter } from './routes/settings.js';

const router = Router();

router.use('/channels', channelsRouter);
router.use('/sources', sourcesRouter);
router.use('/rules', rulesRouter);
router.use('/events', eventsRouter);
router.use('/settings', settingsRouter);

router.get('/recipes', (_request, response) => {
  response.json({ recipes });
});

router.get('/dashboard', (_request, response) => {
  const since = Date.now() - 24 * 60 * 60 * 1000;
  const scalar = (sql: string, ...params: unknown[]) => Number((db.prepare(sql).get(...params) as { count: number }).count);
  const sourceCount = scalar('SELECT COUNT(*) AS count FROM sources WHERE enabled = 1');
  const channelCount = scalar('SELECT COUNT(*) AS count FROM channels WHERE enabled = 1');
  const eventCount24h = scalar('SELECT COUNT(*) AS count FROM events WHERE received_at >= ?', since);
  const successCount24h = scalar("SELECT COUNT(*) AS count FROM events WHERE received_at >= ? AND status IN ('success', 'partial')", since);
  const failedCount24h = scalar("SELECT COUNT(*) AS count FROM events WHERE received_at >= ? AND status = 'failed'", since);
  const skippedCount24h = scalar("SELECT COUNT(*) AS count FROM events WHERE received_at >= ? AND status = 'skipped'", since);
  const pendingCount = scalar("SELECT COUNT(*) AS count FROM events WHERE status IN ('pending', 'processing')");
  const configuredRoutes = scalar('SELECT COUNT(*) AS count FROM source_channels');
  const recent = db.prepare(`
    SELECT e.id, e.title, e.body, e.status, e.severity, e.event_type, e.received_at,
      s.id AS source_id, s.name AS source_name
    FROM events e JOIN sources s ON s.id = e.source_id
    ORDER BY e.received_at DESC LIMIT 8
  `).all() as Array<Record<string, unknown>>;
  const channelHealth = db.prepare(`
    SELECT id, name, type, enabled, last_status, last_error, last_success_at
    FROM channels ORDER BY enabled DESC, created_at ASC
  `).all() as Array<Record<string, unknown>>;

  response.json({
    metrics: {
      sourceCount,
      channelCount,
      eventCount24h,
      successCount24h,
      failedCount24h,
      pendingCount,
      successRate24h: eventCount24h > skippedCount24h ? Math.round((successCount24h / (eventCount24h - skippedCount24h)) * 100) : null,
    },
    quickStart: {
      hasChannel: channelCount > 0,
      hasSource: sourceCount > 0,
      hasRoute: configuredRoutes > 0,
      setupComplete: getSetting('setup_complete') === 'true',
    },
    recentEvents: recent.map((row) => ({
      id: row.id,
      title: row.title,
      body: row.body,
      status: row.status,
      severity: row.severity,
      eventType: row.event_type,
      receivedAt: row.received_at,
      sourceId: row.source_id,
      sourceName: row.source_name,
    })),
    channelHealth: channelHealth.map((row) => ({
      id: row.id,
      name: row.name,
      type: row.type,
      enabled: Boolean(row.enabled),
      lastStatus: row.last_status,
      lastError: row.last_error,
      lastSuccessAt: row.last_success_at,
    })),
  });
});

const extensionByMime: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

const upload = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    filename: (_request, file, callback) => callback(null, `${nanoid()}${extensionByMime[file.mimetype] || ''}`),
  }),
  limits: { fileSize: maxUploadBytes, files: 1 },
  fileFilter: (_request, file, callback) => {
    if (!extensionByMime[file.mimetype]) {
      callback(new Error('只支持 PNG、JPEG、WebP 或 GIF 图片'));
      return;
    }
    callback(null, true);
  },
});

router.get('/assets', (_request, response) => {
  const rows = db.prepare('SELECT * FROM assets ORDER BY created_at DESC').all() as Array<Record<string, unknown>>;
  response.json({
    assets: rows.map((row) => ({
      id: row.id,
      name: row.original_name,
      mimeType: row.mime_type,
      size: row.size,
      createdAt: row.created_at,
      url: `/api/assets/${row.id}`,
    })),
  });
});

router.post('/assets', upload.single('image'), (request, response) => {
  if (!request.file) {
    response.status(400).json({ error: '请选择图片' });
    return;
  }
  const id = nanoid();
  const now = Date.now();
  db.prepare(`
    INSERT INTO assets (id, original_name, stored_name, mime_type, size, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, request.file.originalname.slice(0, 240), request.file.filename, request.file.mimetype, request.file.size, now);
  response.status(201).json({
    asset: { id, name: request.file.originalname, mimeType: request.file.mimetype, size: request.file.size, createdAt: now, url: `/api/assets/${id}` },
  });
});

router.get('/assets/:id', (request, response) => {
  const row = db.prepare('SELECT * FROM assets WHERE id = ?').get(request.params.id) as
    | { stored_name: string; mime_type: string; original_name: string }
    | undefined;
  if (!row) {
    response.status(404).json({ error: '图片不存在' });
    return;
  }
  const filePath = path.join(uploadDir, row.stored_name);
  if (!fs.existsSync(filePath)) {
    response.status(404).json({ error: '图片文件已经丢失' });
    return;
  }
  response.type(row.mime_type);
  response.setHeader('Cache-Control', 'private, max-age=3600');
  response.sendFile(filePath);
});

router.delete('/assets/:id', (request, response) => {
  const row = db.prepare('SELECT stored_name FROM assets WHERE id = ?').get(request.params.id) as { stored_name: string } | undefined;
  if (!row) {
    response.status(404).json({ error: '图片不存在' });
    return;
  }
  const filePath = path.resolve(uploadDir, row.stored_name);
  if (!filePath.startsWith(`${path.resolve(uploadDir)}${path.sep}`)) {
    response.status(400).json({ error: '图片路径无效' });
    return;
  }
  db.prepare('DELETE FROM assets WHERE id = ?').run(request.params.id);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  response.json({ ok: true });
});

export const apiRouter = router;
