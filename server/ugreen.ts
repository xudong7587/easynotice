import crypto from 'node:crypto';
import http from 'node:http';
import https from 'node:https';
import type { IncomingHttpHeaders } from 'node:http';
import type { NormalizedNotice } from './types.js';

const requestTimeoutMs = 12_000;
const maxResponseBytes = 2 * 1024 * 1024;

export interface UgreenCredentials {
  baseUrl: string;
  username: string;
  password: string;
  allowSelfSigned: boolean;
}

export interface UgreenSession {
  tokenId: string;
  token: string;
}

export interface UgreenMessage {
  raw: Record<string, unknown>;
  fingerprint: string;
  notice: NormalizedNotice;
  receivedAt: number;
}

interface JsonResponse {
  status: number;
  headers: IncomingHttpHeaders;
  body: Record<string, unknown>;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function textValue(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
}

function plainText(value: unknown): string {
  return textValue(value)
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replaceAll('&nbsp;', ' ')
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .trim();
}

export function normalizeUgreenBaseUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error('绿联管理地址格式不正确，请填写例如 http://192.168.1.20:9999');
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('绿联管理地址只支持 HTTP 或 HTTPS');
  if (url.username || url.password) throw new Error('绿联管理地址中不要包含用户名或密码');
  if (url.pathname !== '/' || url.search || url.hash) throw new Error('绿联管理地址只填写协议、IP 和端口，不要附加路径或参数');
  return url.origin;
}

function jsonRequest(
  baseUrl: string,
  pathname: string,
  payload: Record<string, unknown>,
  headers: Record<string, string>,
  allowSelfSigned: boolean,
): Promise<JsonResponse> {
  const url = new URL(pathname, `${baseUrl}/`);
  const data = Buffer.from(JSON.stringify(payload));
  const client = url.protocol === 'https:' ? https : http;

  return new Promise((resolve, reject) => {
    const request = client.request(url, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'Content-Length': String(data.length),
        'User-Agent': 'EasyNotice/UGREEN-collector',
        'x-specify-language': 'zh-CN',
        ...headers,
      },
      ...(url.protocol === 'https:' ? { rejectUnauthorized: !allowSelfSigned } : {}),
    }, (response) => {
      const chunks: Buffer[] = [];
      let size = 0;
      response.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > maxResponseBytes) {
          request.destroy(new Error('绿联接口返回内容过大'));
          return;
        }
        chunks.push(chunk);
      });
      response.on('end', () => {
        const status = response.statusCode || 0;
        if (status < 200 || status >= 300) {
          reject(new Error(`绿联接口返回 HTTP ${status}`));
          return;
        }
        try {
          const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
          resolve({ status, headers: response.headers, body: asRecord(parsed) });
        } catch {
          reject(new Error('绿联接口没有返回有效 JSON'));
        }
      });
    });
    request.setTimeout(requestTimeoutMs, () => request.destroy(new Error('连接绿联 NAS 超时')));
    request.on('error', (error) => reject(new Error(`无法连接绿联 NAS：${error.message}`)));
    request.end(data);
  });
}

function apiSucceeded(body: Record<string, unknown>): boolean {
  return Number(body.code) === 200;
}

function encryptWithRsa(encodedPublicKey: string, plaintext: string): string {
  let publicKey: string;
  try {
    publicKey = Buffer.from(encodedPublicKey, 'base64').toString('utf8');
    if (!publicKey.includes('PUBLIC KEY')) throw new Error('invalid key');
  } catch {
    throw new Error('绿联 NAS 返回的登录公钥无效');
  }
  try {
    return crypto.publicEncrypt({ key: publicKey, padding: crypto.constants.RSA_PKCS1_PADDING }, Buffer.from(plaintext, 'utf8')).toString('base64');
  } catch {
    throw new Error('无法加密绿联登录凭据');
  }
}

export async function loginUgreen(credentials: UgreenCredentials): Promise<UgreenSession> {
  const check = await jsonRequest(
    credentials.baseUrl,
    '/ugreen/v1/verify/check?token=',
    { username: credentials.username },
    {},
    credentials.allowSelfSigned,
  );
  const rsaToken = Array.isArray(check.headers['x-rsa-token'])
    ? check.headers['x-rsa-token'][0]
    : check.headers['x-rsa-token'];
  if (!rsaToken) throw new Error('绿联 NAS 未返回登录公钥，请确认地址和系统版本');

  const login = await jsonRequest(
    credentials.baseUrl,
    '/ugreen/v1/verify/login',
    {
      username: credentials.username,
      password: encryptWithRsa(rsaToken, credentials.password),
      keepalive: true,
      is_simple: true,
    },
    {},
    credentials.allowSelfSigned,
  );
  if (!apiSucceeded(login.body)) {
    const message = plainText(login.body.message || login.body.msg);
    throw new Error(message ? `绿联登录失败：${message}` : '绿联登录失败，请检查用户名、密码和双重验证设置');
  }
  const data = asRecord(login.body.data);
  const tokenId = textValue(data.token_id || data.tokenId);
  const token = textValue(data.token);
  const publicKey = textValue(data.public_key || data.publicKey);
  if (!tokenId || !token || !publicKey) throw new Error('绿联登录成功，但没有返回完整会话信息');
  return { tokenId, token: encryptWithRsa(publicKey, token) };
}

async function requestMessages(credentials: UgreenCredentials, session: UgreenSession): Promise<JsonResponse> {
  return jsonRequest(
    credentials.baseUrl,
    '/ugreen/v1/desktop/message/list',
    { level: ['info', 'important', 'warning'], page: 1, size: 50 },
    { 'x-ugreen-security-key': session.tokenId, 'x-ugreen-token': session.token },
    credentials.allowSelfSigned,
  );
}

export async function fetchUgreenRawMessages(
  credentials: UgreenCredentials,
  existingSession?: UgreenSession,
): Promise<{ session: UgreenSession; messages: Record<string, unknown>[] }> {
  let session = existingSession || await loginUgreen(credentials);
  let response = await requestMessages(credentials, session);
  if (!apiSucceeded(response.body)) {
    session = await loginUgreen(credentials);
    response = await requestMessages(credentials, session);
  }
  if (!apiSucceeded(response.body)) {
    const message = plainText(response.body.message || response.body.msg);
    throw new Error(message ? `读取绿联通知失败：${message}` : '读取绿联通知失败，请稍后重试');
  }
  const data = asRecord(response.body.data);
  const list = Array.isArray(data.List) ? data.List : Array.isArray(data.list) ? data.list : [];
  return { session, messages: list.map(asRecord) };
}

function messageTime(raw: Record<string, unknown>): number {
  const value = Number(raw.time || raw.timestamp || raw.created_at || raw.createdAt || 0);
  if (!Number.isFinite(value) || value <= 0) return Date.now();
  return value > 10_000_000_000 ? value : value * 1000;
}

function messageSeverity(raw: Record<string, unknown>): NormalizedNotice['severity'] {
  const level = textValue(raw.level || raw.severity || raw.type).toLowerCase();
  if (/error|danger|critical|fatal|严重|错误|失败/.test(level)) return 'error';
  if (/warning|warn|important|告警|警告|重要/.test(level)) return 'warning';
  if (/success|成功|完成/.test(level)) return 'success';
  return 'info';
}

function eventType(raw: Record<string, unknown>, severity: NormalizedNotice['severity']): string {
  const source = textValue(raw.event || raw.event_type || raw.type || raw.level || severity).toLowerCase();
  const normalized = source.replace(/[^a-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60);
  return `ugreen_${normalized || severity}`;
}

export function normalizeUgreenMessage(raw: Record<string, unknown>, baseUrl: string): UgreenMessage {
  const body = plainText(raw.body || raw.content || raw.message || raw.description) || '绿联 NAS 发来一条系统通知';
  const severity = messageSeverity(raw);
  const suppliedTitle = plainText(raw.title || raw.subject || raw.name);
  const title = suppliedTitle || (severity === 'warning' || severity === 'error' ? '绿联 NAS 系统告警' : '绿联 NAS 系统通知');
  const receivedAt = messageTime(raw);
  const fingerprintSource = [raw.id, raw.msg_id, raw.message_id, raw.time, raw.timestamp, title, body]
    .map((value) => textValue(value)).join('|');
  const fingerprint = crypto.createHash('sha256').update(fingerprintSource).digest('hex');
  return {
    raw,
    fingerprint,
    receivedAt,
    notice: {
      title,
      body,
      eventType: eventType(raw, severity),
      severity,
      linkUrl: baseUrl,
      raw: { provider: 'ugreen-dxp', ...raw },
    },
  };
}
