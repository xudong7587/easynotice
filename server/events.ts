import { nanoid } from 'nanoid';
import { db } from './db.js';
import { encryptStoredData } from './crypto.js';
import { applyFirstRule } from './templates.js';
import type { NormalizedNotice, RuleRow } from './types.js';
import { wakeWorker } from './worker.js';

export interface EnqueueNoticeInput {
  sourceId: string;
  requestId: string;
  notice: NormalizedNotice;
  receivedAt?: number;
}

export function storeNotice(input: EnqueueNoticeInput): string {
  const rules = db.prepare(`
    SELECT * FROM rules WHERE source_id = ? AND enabled = 1 ORDER BY priority ASC, created_at ASC
  `).all(input.sourceId) as RuleRow[];
  const applied = applyFirstRule(input.notice, rules);
  const eventId = nanoid();
  const receivedAt = input.receivedAt || Date.now();
  const updatedAt = Date.now();

  db.transaction(() => {
    db.prepare(`
      INSERT INTO events (
        id, source_id, request_id, status, title, body, event_type, severity,
        image_url, link_url, raw_json, matched_rule_id, received_at
      ) VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      eventId,
      input.sourceId,
      input.requestId.slice(0, 120),
      applied.notice.title,
      applied.notice.body,
      applied.notice.eventType,
      applied.notice.severity,
      applied.notice.imageUrl || null,
      applied.notice.linkUrl || null,
      encryptStoredData(applied.notice.raw),
      applied.matchedRule?.id || null,
      receivedAt,
    );
    db.prepare('UPDATE sources SET last_received_at = ?, updated_at = ? WHERE id = ?')
      .run(updatedAt, updatedAt, input.sourceId);
  })();

  return eventId;
}

export function enqueueNotice(input: EnqueueNoticeInput): string {
  const eventId = storeNotice(input);
  wakeWorker();
  return eventId;
}
