import type { NormalizedNotice } from './types.js';
import { redactSensitiveData } from './security.js';

export interface IncomingPayload {
  method: string;
  query?: Record<string, unknown>;
  body?: unknown;
  rawText?: string;
}

const aliases = {
  title: [
    'title', 'subject', 'name', 'notification.title', 'message.title', 'data.title',
    'data.name', 'monitorJSON.name', 'monitor.name', 'data.number', 'number',
  ],
  body: [
    'content', 'body', 'message', 'msg', 'text', 'description', 'detail',
    'notification.body', 'message.content', 'data.content', 'data.body', 'data.message',
    'error_message', 'data.error_message', 'heartbeatJSON.msg',
  ],
  eventType: [
    'event', 'event_type', 'eventType', 'type', 'action', 'status', 'data.event',
    'data.status', 'heartbeatJSON.status',
  ],
  imageUrl: [
    'image', 'image_url', 'imageUrl', 'picurl', 'picture', 'cover', 'poster', 'thumb',
    'data.image', 'data.image_url', 'data.poster', 'data.thumb', 'notification.image',
  ],
  linkUrl: [
    'url', 'link', 'link_url', 'linkUrl', 'detail_url', 'web_url', 'data.url',
    'data.link', 'notification.url',
  ],
  severity: ['severity', 'level', 'priority', 'data.severity', 'data.level'],
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function flatten(value: unknown, prefix = '', output: Record<string, unknown> = {}, depth = 0): Record<string, unknown> {
  if (depth > 5 || !isRecord(value)) return output;
  for (const [key, nested] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    output[path] = nested;
    if (isRecord(nested)) flatten(nested, path, output, depth + 1);
  }
  return output;
}

function toDisplayString(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map(toDisplayString).filter(Boolean).join('、');
  return '';
}

function first(flat: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = toDisplayString(flat[key]);
    if (value) return value;
  }
  return '';
}

function normalizeSeverity(value: string, title: string, body: string): NormalizedNotice['severity'] {
  const text = `${value} ${title} ${body}`.toLowerCase();
  if (/error|failed|failure|fatal|critical|down|失败|错误|异常|离线|掉线/.test(text)) return 'error';
  if (/warn|warning|注意|警告|过期/.test(text)) return 'warning';
  if (/success|finished|completed|up|成功|完成|上线|恢复/.test(text)) return 'success';
  return 'info';
}

function sanitizeUrl(value: string): string | undefined {
  if (!value) return undefined;
  if (value.startsWith('/api/assets/')) return value;
  try {
    const parsed = new URL(value);
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.toString() : undefined;
  } catch {
    return undefined;
  }
}

function parseRawBody(body: unknown, rawText?: string): Record<string, unknown> {
  if (isRecord(body)) return body;
  if (typeof body === 'string') {
    try {
      const parsed = JSON.parse(body) as unknown;
      if (isRecord(parsed)) return parsed;
    } catch {
      return { content: body };
    }
  }
  if (rawText) {
    try {
      const parsed = JSON.parse(rawText) as unknown;
      if (isRecord(parsed)) return parsed;
    } catch {
      return { content: rawText };
    }
  }
  return {};
}

export function normalizeIncoming(input: IncomingPayload): NormalizedNotice {
  const rawBody = parseRawBody(input.body, input.rawText);
  const merged = redactSensitiveData({
    ...(input.query ?? {}),
    ...rawBody,
  }) as Record<string, unknown>;
  const flat = flatten(merged);

  let title = first(flat, aliases.title);
  let body = first(flat, aliases.body);
  const eventType = first(flat, aliases.eventType) || 'default';

  if (!body && title && Object.keys(merged).length === 1) {
    body = title;
    title = '新通知';
  }
  if (!title) title = eventType !== 'default' ? eventType : '新通知';
  if (!body) {
    const useful = Object.entries(flat)
      .filter(([, value]) => ['string', 'number', 'boolean'].includes(typeof value))
      .slice(0, 8)
      .map(([key, value]) => `${key}: ${toDisplayString(value)}`)
      .join('\n');
    body = useful || 'EasyNotice 收到了一条未包含正文的通知。';
  }

  const severityText = first(flat, aliases.severity);
  return {
    title: title.slice(0, 200),
    body: body.slice(0, 10_000),
    eventType: eventType.slice(0, 120),
    severity: normalizeSeverity(severityText || eventType, title, body),
    imageUrl: sanitizeUrl(first(flat, aliases.imageUrl)),
    linkUrl: sanitizeUrl(first(flat, aliases.linkUrl)),
    raw: merged,
  };
}

export function getByPath(value: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((current, key) => {
    if (!isRecord(current)) return undefined;
    return current[key];
  }, value);
}
