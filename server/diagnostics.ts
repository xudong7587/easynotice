import fs from 'node:fs';
import path from 'node:path';
import { db } from './db.js';
import { redactSensitiveText } from './security.js';

function appVersion(): string {
  try {
    const value = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf8')) as { version?: string };
    return value.version || 'unknown';
  } catch {
    return 'unknown';
  }
}

function iso(value: unknown): string | null {
  const timestamp = Number(value || 0);
  return timestamp > 0 ? new Date(timestamp).toISOString() : null;
}

export function buildDiagnosticBundle(): Record<string, unknown> {
  const generatedAt = Date.now();
  const sources = db.prepare(`
    SELECT id, recipe_id, enabled, route_mode, last_received_at, created_at
    FROM sources ORDER BY created_at ASC
  `).all() as Array<Record<string, unknown>>;
  const sourceAliases = new Map(sources.map((source, index) => [String(source.id), `source-${index + 1}`]));
  const channels = db.prepare(`
    SELECT id, type, enabled, last_status, last_error, last_success_at, created_at
    FROM channels ORDER BY created_at ASC
  `).all() as Array<Record<string, unknown>>;
  const channelAliases = new Map(channels.map((channel, index) => [String(channel.id), `channel-${index + 1}`]));
  const collectors = db.prepare(`
    SELECT source_id, interval_minutes, import_recent, initialized, last_checked_at,
      last_success_at, last_error, created_at, updated_at
    FROM ugreen_collectors ORDER BY created_at ASC
  `).all() as Array<Record<string, unknown>>;
  const collectorRuns = db.prepare(`
    SELECT source_id, trigger_type, status, started_at, completed_at, found_count,
      seen_count, queued_count, newest_message_at, error
    FROM ugreen_collector_runs ORDER BY started_at DESC LIMIT 200
  `).all() as Array<Record<string, unknown>>;
  const events = db.prepare(`
    SELECT source_id, status, event_type, severity, error, received_at, processed_at
    FROM events ORDER BY received_at DESC LIMIT 200
  `).all() as Array<Record<string, unknown>>;
  const deliveries = db.prepare(`
    SELECT e.source_id, d.channel_id, c.type AS channel_type, d.attempt, d.status,
      d.started_at, d.completed_at, d.duration_ms, d.http_status, d.error
    FROM deliveries d
    JOIN events e ON e.id = d.event_id
    JOIN channels c ON c.id = d.channel_id
    ORDER BY COALESCE(d.completed_at, d.started_at) DESC LIMIT 300
  `).all() as Array<Record<string, unknown>>;

  return {
    format: 'easynotice-diagnostics-v1',
    generatedAt: new Date(generatedAt).toISOString(),
    runtime: {
      version: appVersion(),
      node: process.version,
      platform: `${process.platform}/${process.arch}`,
      uptimeSeconds: Math.round(process.uptime()),
    },
    summary: {
      sources: sources.length,
      channels: channels.length,
      eventsIncluded: events.length,
      deliveriesIncluded: deliveries.length,
      collectorRunsIncluded: collectorRuns.length,
    },
    sources: sources.map((row) => ({
      source: sourceAliases.get(String(row.id)), recipe: row.recipe_id, enabled: Boolean(row.enabled),
      routeMode: row.route_mode, lastReceivedAt: iso(row.last_received_at), createdAt: iso(row.created_at),
    })),
    channels: channels.map((row) => ({
      channel: channelAliases.get(String(row.id)), type: row.type, enabled: Boolean(row.enabled),
      lastStatus: row.last_status, lastSuccessAt: iso(row.last_success_at),
      lastError: row.last_error ? redactSensitiveText(String(row.last_error)) : null,
    })),
    ugreenCollectors: collectors.map((row) => ({
      source: sourceAliases.get(String(row.source_id)), intervalMinutes: row.interval_minutes,
      importRecent: Boolean(row.import_recent), initialized: Boolean(row.initialized),
      lastCheckedAt: iso(row.last_checked_at), lastSuccessAt: iso(row.last_success_at),
      lastError: row.last_error ? redactSensitiveText(String(row.last_error)) : null,
      createdAt: iso(row.created_at), updatedAt: iso(row.updated_at),
    })),
    ugreenCollectorRuns: collectorRuns.map((row) => ({
      source: sourceAliases.get(String(row.source_id)), trigger: row.trigger_type, status: row.status,
      startedAt: iso(row.started_at), completedAt: iso(row.completed_at), found: row.found_count,
      alreadySeen: row.seen_count, queued: row.queued_count, newestMessageAt: iso(row.newest_message_at),
      error: row.error ? redactSensitiveText(String(row.error)) : null,
    })),
    recentEvents: events.map((row) => ({
      source: sourceAliases.get(String(row.source_id)), status: row.status, eventType: row.event_type,
      severity: row.severity, receivedAt: iso(row.received_at), processedAt: iso(row.processed_at),
      error: row.error ? redactSensitiveText(String(row.error)) : null,
    })),
    recentDeliveries: deliveries.map((row) => ({
      source: sourceAliases.get(String(row.source_id)), channel: channelAliases.get(String(row.channel_id)),
      channelType: row.channel_type, attempt: row.attempt, status: row.status,
      startedAt: iso(row.started_at), completedAt: iso(row.completed_at), durationMs: row.duration_ms,
      httpStatus: row.http_status, error: row.error ? redactSensitiveText(String(row.error)) : null,
    })),
    privacy: '不包含入口令牌、管理地址、用户名、密码、会话令牌、出口配置、消息标题、正文或原始载荷。',
  };
}
