import { Router } from 'express';
import { db } from '../db.js';
import { wakeWorker } from '../worker.js';

const router = Router();

function serializeEvent(row: Record<string, unknown>) {
  return {
    id: row.id,
    sourceId: row.source_id,
    sourceName: row.source_name,
    status: row.status,
    title: row.title,
    body: row.body,
    eventType: row.event_type,
    severity: row.severity,
    imageUrl: row.image_url,
    linkUrl: row.link_url,
    matchedRuleName: row.matched_rule_name,
    error: row.error,
    receivedAt: row.received_at,
    processedAt: row.processed_at,
    successCount: Number(row.success_count || 0),
    failedCount: Number(row.failed_count || 0),
    skippedCount: Number(row.skipped_count || 0),
  };
}

router.get('/', (request, response) => {
  const page = Math.max(1, Number(request.query.page || 1));
  const limit = Math.min(100, Math.max(10, Number(request.query.limit || 30)));
  const filters: string[] = [];
  const params: unknown[] = [];

  const sourceId = String(request.query.sourceId || '');
  const status = String(request.query.status || '');
  const search = String(request.query.search || '').trim();
  if (sourceId) {
    filters.push('e.source_id = ?');
    params.push(sourceId);
  }
  if (status) {
    filters.push('e.status = ?');
    params.push(status);
  }
  if (search) {
    filters.push('(e.title LIKE ? OR e.body LIKE ? OR s.name LIKE ?)');
    const like = `%${search.slice(0, 100)}%`;
    params.push(like, like, like);
  }
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const totalRow = db.prepare(`SELECT COUNT(*) AS count FROM events e JOIN sources s ON s.id = e.source_id ${where}`)
    .get(...params) as { count: number };
  const rows = db.prepare(`
    SELECT e.*, s.name AS source_name, r.name AS matched_rule_name,
      (SELECT COUNT(*) FROM deliveries d WHERE d.event_id = e.id AND d.status = 'success') AS success_count,
      (SELECT COUNT(*) FROM deliveries d WHERE d.event_id = e.id AND d.status = 'failed') AS failed_count,
      (SELECT COUNT(*) FROM deliveries d WHERE d.event_id = e.id AND d.status = 'skipped') AS skipped_count
    FROM events e
    JOIN sources s ON s.id = e.source_id
    LEFT JOIN rules r ON r.id = e.matched_rule_id
    ${where}
    ORDER BY e.received_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, limit, (page - 1) * limit) as Array<Record<string, unknown>>;
  response.json({
    events: rows.map(serializeEvent),
    pagination: { page, limit, total: totalRow.count, pages: Math.max(1, Math.ceil(totalRow.count / limit)) },
  });
});

router.get('/:id', (request, response) => {
  const row = db.prepare(`
    SELECT e.*, s.name AS source_name, r.name AS matched_rule_name
    FROM events e
    JOIN sources s ON s.id = e.source_id
    LEFT JOIN rules r ON r.id = e.matched_rule_id
    WHERE e.id = ?
  `).get(request.params.id) as Record<string, unknown> | undefined;
  if (!row) {
    response.status(404).json({ error: '通知记录不存在' });
    return;
  }
  const deliveries = db.prepare(`
    SELECT d.*, c.name AS channel_name, c.type AS channel_type
    FROM deliveries d JOIN channels c ON c.id = d.channel_id
    WHERE d.event_id = ? ORDER BY COALESCE(d.started_at, d.completed_at) ASC, d.attempt ASC
  `).all(request.params.id) as Array<Record<string, unknown>>;
  response.json({
    event: {
      ...serializeEvent(row),
      raw: JSON.parse(String(row.raw_json || '{}')),
      requestId: row.request_id,
      deliveries: deliveries.map((delivery) => ({
        id: delivery.id,
        channelId: delivery.channel_id,
        channelName: delivery.channel_name,
        channelType: delivery.channel_type,
        attempt: delivery.attempt,
        status: delivery.status,
        startedAt: delivery.started_at,
        completedAt: delivery.completed_at,
        durationMs: delivery.duration_ms,
        httpStatus: delivery.http_status,
        detail: delivery.response_excerpt,
        error: delivery.error,
      })),
    },
  });
});

router.post('/:id/retry', (request, response) => {
  const row = db.prepare('SELECT status FROM events WHERE id = ?').get(request.params.id) as { status: string } | undefined;
  if (!row) {
    response.status(404).json({ error: '通知记录不存在' });
    return;
  }
  if (['pending', 'processing'].includes(row.status)) {
    response.status(409).json({ error: '这条通知仍在处理中' });
    return;
  }
  db.prepare(`UPDATE events SET status = 'pending', error = NULL, processed_at = NULL WHERE id = ?`).run(request.params.id);
  wakeWorker();
  response.status(202).json({ ok: true });
});

export const eventsRouter = router;
