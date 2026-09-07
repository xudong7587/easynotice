import { db } from './db.js';
import { decryptSecret, encryptSecret } from './crypto.js';
import { storeNotice } from './events.js';
import { redactSensitiveText } from './security.js';
import { wakeWorker } from './worker.js';
import {
  fetchUgreenRawMessages,
  normalizeUgreenBaseUrl,
  normalizeUgreenMessage,
  type UgreenCredentials,
  type UgreenSession,
} from './ugreen.js';

const schedulerIntervalMs = 15_000;
const sessionCache = new Map<string, { identity: string; session: UgreenSession }>();
const activeSources = new Set<string>();
let schedulerRunning = false;
let timer: NodeJS.Timeout | undefined;

interface CollectorRow {
  source_id: string;
  config_encrypted: string;
  interval_minutes: number;
  import_recent: number;
  initialized: number;
  last_checked_at: number | null;
  last_success_at: number | null;
  last_error: string | null;
  created_at: number;
  updated_at: number;
}

interface RunnableCollectorRow extends CollectorRow {
  source_name: string;
  source_enabled: number;
}

export interface UgreenCollectorInput extends UgreenCredentials {
  intervalMinutes: number;
  importRecent: boolean;
}

export interface UgreenCollectorView {
  type: 'ugreen-dxp';
  baseUrl: string;
  username: string;
  passwordConfigured: boolean;
  allowSelfSigned: boolean;
  intervalMinutes: number;
  importRecent: boolean;
  initialized: boolean;
  lastCheckedAt?: number;
  lastSuccessAt?: number;
  lastError?: string;
  nextRunAt?: number;
  lastRun?: {
    trigger: 'scheduled' | 'manual';
    status: 'running' | 'success' | 'failed';
    startedAt: number;
    completedAt?: number;
    found: number;
    seen: number;
    queued: number;
    newestMessageAt?: number;
    error?: string;
  };
}

export interface UgreenRunResult {
  found: number;
  seen: number;
  queued: number;
  newestMessageAt?: number;
  initialized: boolean;
  seeded: boolean;
}

function collectorRow(sourceId: string): CollectorRow | undefined {
  return db.prepare('SELECT * FROM ugreen_collectors WHERE source_id = ?').get(sourceId) as CollectorRow | undefined;
}

function decryptCredentials(row: CollectorRow): UgreenCredentials {
  return decryptSecret<UgreenCredentials>(row.config_encrypted);
}

function identity(credentials: UgreenCredentials): string {
  return `${credentials.baseUrl}\n${credentials.username}\n${credentials.allowSelfSigned}`;
}

function normalizeInput(input: UgreenCollectorInput): UgreenCollectorInput {
  return {
    ...input,
    baseUrl: normalizeUgreenBaseUrl(input.baseUrl),
    username: input.username.trim(),
    password: input.password,
    intervalMinutes: Math.max(1, Math.min(60, Math.round(input.intervalMinutes))),
    allowSelfSigned: Boolean(input.allowSelfSigned),
    importRecent: Boolean(input.importRecent),
  };
}

export function createUgreenCollector(sourceId: string, input: UgreenCollectorInput): void {
  const normalized = normalizeInput(input);
  const now = Date.now();
  db.prepare(`
    INSERT INTO ugreen_collectors (
      source_id, config_encrypted, interval_minutes, import_recent, initialized,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, 0, ?, ?)
  `).run(
    sourceId,
    encryptSecret({
      baseUrl: normalized.baseUrl,
      username: normalized.username,
      password: normalized.password,
      allowSelfSigned: normalized.allowSelfSigned,
    } satisfies UgreenCredentials),
    normalized.intervalMinutes,
    normalized.importRecent ? 1 : 0,
    now,
    now,
  );
}

export function updateUgreenCollector(sourceId: string, input: Partial<UgreenCollectorInput>): UgreenCollectorView {
  const row = collectorRow(sourceId);
  if (!row) throw Object.assign(new Error('这个入口没有绿联采集配置'), { statusCode: 404 });
  const current = decryptCredentials(row);
  const merged = normalizeInput({
    baseUrl: input.baseUrl ?? current.baseUrl,
    username: input.username ?? current.username,
    password: input.password || current.password,
    allowSelfSigned: input.allowSelfSigned ?? current.allowSelfSigned,
    intervalMinutes: input.intervalMinutes ?? row.interval_minutes,
    importRecent: input.importRecent ?? Boolean(row.import_recent),
  });
  const credentialsChanged = merged.baseUrl !== current.baseUrl
    || merged.username !== current.username
    || merged.password !== current.password
    || merged.allowSelfSigned !== current.allowSelfSigned;
  const now = Date.now();

  db.transaction(() => {
    db.prepare(`
      UPDATE ugreen_collectors SET
        config_encrypted = ?, interval_minutes = ?, import_recent = ?,
        initialized = ?, last_checked_at = ?, last_success_at = ?, last_error = NULL, updated_at = ?
      WHERE source_id = ?
    `).run(
      encryptSecret({
        baseUrl: merged.baseUrl,
        username: merged.username,
        password: merged.password,
        allowSelfSigned: merged.allowSelfSigned,
      } satisfies UgreenCredentials),
      merged.intervalMinutes,
      merged.importRecent ? 1 : 0,
      credentialsChanged ? 0 : row.initialized,
      credentialsChanged ? null : row.last_checked_at,
      credentialsChanged ? null : row.last_success_at,
      now,
      sourceId,
    );
    if (credentialsChanged) db.prepare('DELETE FROM ugreen_seen_messages WHERE source_id = ?').run(sourceId);
  })();
  sessionCache.delete(sourceId);
  return getUgreenCollectorView(sourceId)!;
}

export function getUgreenCollectorView(sourceId: string): UgreenCollectorView | undefined {
  const row = collectorRow(sourceId);
  if (!row) return undefined;
  const credentials = decryptCredentials(row);
  const lastRun = db.prepare(`
    SELECT trigger_type, status, started_at, completed_at, found_count, seen_count,
      queued_count, newest_message_at, error
    FROM ugreen_collector_runs WHERE source_id = ? ORDER BY started_at DESC LIMIT 1
  `).get(sourceId) as {
    trigger_type: 'scheduled' | 'manual'; status: 'running' | 'success' | 'failed';
    started_at: number; completed_at: number | null; found_count: number; seen_count: number;
    queued_count: number; newest_message_at: number | null; error: string | null;
  } | undefined;
  return {
    type: 'ugreen-dxp',
    baseUrl: credentials.baseUrl,
    username: credentials.username,
    passwordConfigured: Boolean(credentials.password),
    allowSelfSigned: credentials.allowSelfSigned,
    intervalMinutes: row.interval_minutes,
    importRecent: Boolean(row.import_recent),
    initialized: Boolean(row.initialized),
    lastCheckedAt: row.last_checked_at || undefined,
    lastSuccessAt: row.last_success_at || undefined,
    lastError: row.last_error || undefined,
    nextRunAt: row.last_checked_at ? row.last_checked_at + row.interval_minutes * 60_000 : Date.now(),
    lastRun: lastRun ? {
      trigger: lastRun.trigger_type,
      status: lastRun.status,
      startedAt: lastRun.started_at,
      completedAt: lastRun.completed_at || undefined,
      found: lastRun.found_count,
      seen: lastRun.seen_count,
      queued: lastRun.queued_count,
      newestMessageAt: lastRun.newest_message_at || undefined,
      error: lastRun.error || undefined,
    } : undefined,
  };
}

export async function testUgreenConnection(input: UgreenCollectorInput): Promise<{ messageCount: number }> {
  const normalized = normalizeInput(input);
  const result = await fetchUgreenRawMessages(normalized);
  return { messageCount: result.messages.length };
}

export async function testStoredUgreenConnection(sourceId: string): Promise<{ messageCount: number }> {
  const row = collectorRow(sourceId);
  if (!row) throw Object.assign(new Error('这个入口没有绿联采集配置'), { statusCode: 404 });
  const result = await fetchUgreenRawMessages(decryptCredentials(row));
  return { messageCount: result.messages.length };
}

function loadRunnable(sourceId: string): RunnableCollectorRow | undefined {
  return db.prepare(`
    SELECT uc.*, s.name AS source_name, s.enabled AS source_enabled
    FROM ugreen_collectors uc
    JOIN sources s ON s.id = uc.source_id
    WHERE uc.source_id = ?
  `).get(sourceId) as RunnableCollectorRow | undefined;
}

function rememberMessages(sourceId: string, messages: Array<{ fingerprint: string }>, seenAt: number): void {
  const insert = db.prepare(`
    INSERT INTO ugreen_seen_messages (source_id, fingerprint, seen_at)
    VALUES (?, ?, ?)
    ON CONFLICT(source_id, fingerprint) DO UPDATE SET seen_at = excluded.seen_at
  `);
  for (const message of messages) insert.run(sourceId, message.fingerprint, seenAt);
  db.prepare(`
    DELETE FROM ugreen_seen_messages
    WHERE source_id = ? AND fingerprint NOT IN (
      SELECT fingerprint FROM ugreen_seen_messages WHERE source_id = ? ORDER BY seen_at DESC LIMIT 500
    )
  `).run(sourceId, sourceId);
}

function trimRunHistory(sourceId: string): void {
  db.prepare(`
    DELETE FROM ugreen_collector_runs WHERE source_id = ? AND id NOT IN (
      SELECT id FROM ugreen_collector_runs WHERE source_id = ? ORDER BY started_at DESC LIMIT 100
    )
  `).run(sourceId, sourceId);
}

export async function runUgreenCollector(sourceId: string, trigger: 'scheduled' | 'manual' = 'manual'): Promise<UgreenRunResult> {
  if (activeSources.has(sourceId)) throw Object.assign(new Error('绿联通知正在检查，请稍后再试'), { statusCode: 409 });
  const row = loadRunnable(sourceId);
  if (!row) throw Object.assign(new Error('绿联通知入口不存在'), { statusCode: 404 });
  if (!row.source_enabled) throw Object.assign(new Error('请先启用这个通知入口'), { statusCode: 409 });

  activeSources.add(sourceId);
  const checkedAt = Date.now();
  const runId = Number(db.prepare(`
    INSERT INTO ugreen_collector_runs (source_id, trigger_type, status, started_at)
    VALUES (?, ?, 'running', ?)
  `).run(sourceId, trigger, checkedAt).lastInsertRowid);
  db.prepare('UPDATE ugreen_collectors SET last_checked_at = ?, updated_at = ? WHERE source_id = ?')
    .run(checkedAt, checkedAt, sourceId);
  try {
    const credentials = decryptCredentials(row);
    const cached = sessionCache.get(sourceId);
    const fetched = await fetchUgreenRawMessages(
      credentials,
      cached?.identity === identity(credentials) ? cached.session : undefined,
    );
    sessionCache.set(sourceId, { identity: identity(credentials), session: fetched.session });
    const messages = fetched.messages
      .map((message) => normalizeUgreenMessage(message, credentials.baseUrl))
      .sort((left, right) => left.receivedAt - right.receivedAt);
    const seenRows = messages.length
      ? db.prepare(`SELECT fingerprint FROM ugreen_seen_messages WHERE source_id = ? AND fingerprint IN (${messages.map(() => '?').join(',')})`)
        .all(sourceId, ...messages.map((message) => message.fingerprint)) as Array<{ fingerprint: string }>
      : [];
    const seen = new Set(seenRows.map((item) => item.fingerprint));
    const firstRun = !row.initialized;
    const pending = firstRun && !row.import_recent ? [] : messages.filter((message) => !seen.has(message.fingerprint));
    const completedAt = Date.now();
    const newestMessageAt = messages.reduce((latest, message) => Math.max(latest, message.receivedAt), 0) || undefined;

    db.transaction(() => {
      for (const message of pending) {
        storeNotice({
          sourceId,
          requestId: `ugreen-${message.fingerprint.slice(0, 24)}`,
          notice: message.notice,
          receivedAt: message.receivedAt,
        });
      }
      rememberMessages(sourceId, messages, completedAt);
      db.prepare(`
        UPDATE ugreen_collectors SET initialized = 1, last_success_at = ?, last_error = NULL, updated_at = ?
        WHERE source_id = ?
      `).run(completedAt, completedAt, sourceId);
      db.prepare(`
        UPDATE ugreen_collector_runs SET status = 'success', completed_at = ?, found_count = ?,
          seen_count = ?, queued_count = ?, newest_message_at = ? WHERE id = ?
      `).run(completedAt, messages.length, seen.size, pending.length, newestMessageAt || null, runId);
      trimRunHistory(sourceId);
    })();
    if (pending.length) wakeWorker();
    return { found: messages.length, seen: seen.size, queued: pending.length, newestMessageAt, initialized: true, seeded: firstRun && !row.import_recent };
  } catch (error) {
    sessionCache.delete(sourceId);
    const message = redactSensitiveText(error instanceof Error ? error.message : '检查绿联通知失败').slice(0, 800);
    const failedAt = Date.now();
    db.transaction(() => {
      db.prepare('UPDATE ugreen_collectors SET last_error = ?, updated_at = ? WHERE source_id = ?')
        .run(message, failedAt, sourceId);
      db.prepare("UPDATE ugreen_collector_runs SET status = 'failed', completed_at = ?, error = ? WHERE id = ?")
        .run(failedAt, message, runId);
      trimRunHistory(sourceId);
    })();
    throw new Error(message);
  } finally {
    activeSources.delete(sourceId);
  }
}

async function schedulerTick(): Promise<void> {
  if (schedulerRunning) return;
  schedulerRunning = true;
  try {
    const now = Date.now();
    const due = db.prepare(`
      SELECT uc.source_id
      FROM ugreen_collectors uc
      JOIN sources s ON s.id = uc.source_id
      WHERE s.enabled = 1
        AND (uc.last_checked_at IS NULL OR uc.last_checked_at + uc.interval_minutes * 60000 <= ?)
      ORDER BY COALESCE(uc.last_checked_at, 0) ASC
      LIMIT 10
    `).all(now) as Array<{ source_id: string }>;
    for (const item of due) {
      try {
        await runUgreenCollector(item.source_id, 'scheduled');
      } catch (error) {
        console.warn('[EasyNotice] 绿联通知检查失败：', redactSensitiveText(error instanceof Error ? error.message : String(error)));
      }
    }
  } finally {
    schedulerRunning = false;
  }
}

export function startUgreenCollectors(): void {
  timer = setInterval(() => void schedulerTick(), schedulerIntervalMs);
  timer.unref();
  void schedulerTick();
}

export function stopUgreenCollectors(): void {
  if (timer) clearInterval(timer);
  timer = undefined;
  sessionCache.clear();
}
