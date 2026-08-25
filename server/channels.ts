import fs from 'node:fs';
import path from 'node:path';
import type {
  BarkConfig,
  ChannelConfig,
  ChannelType,
  NoticeForDelivery,
  TelegramConfig,
  WeComAppConfig,
  WeComRobotConfig,
} from './types.js';

export interface DeliveryResult {
  httpStatus?: number;
  responseExcerpt: string;
}

const TIMEOUT_MS = 12_000;

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function excerpt(value: unknown): string {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.replace(/[\r\n]+/g, ' ').slice(0, 500);
}

async function request(url: string, init: RequestInit): Promise<{ response: Response; data: unknown }> {
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const text = await response.text();
  let data: unknown = text;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    // Keep text responses for diagnostics.
  }
  return { response, data };
}

function ensureHttpUrl(value: string, field: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${field} 不是有效地址`);
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error(`${field} 仅支持 HTTP 或 HTTPS`);
  return parsed;
}

function noticeText(notice: NoticeForDelivery): string {
  const source = `来源：${notice.sourceName}`;
  return `${notice.title}\n${notice.body}\n\n${source}`.trim();
}

function wecomMarkdown(notice: NoticeForDelivery): string {
  const severity = {
    info: 'info',
    success: 'info',
    warning: 'warning',
    error: 'warning',
  }[notice.severity];
  const title = notice.severity === 'error'
    ? `<font color="warning">${notice.title}</font>`
    : `<font color="${severity}">${notice.title}</font>`;
  return `${title}\n${notice.body}\n>来源：${notice.sourceName}`.slice(0, 4000);
}

async function postWeComRobot(url: string, payload: unknown): Promise<DeliveryResult> {
  const { response, data } = await request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const result = data as { errcode?: number; errmsg?: string };
  if (!response.ok || result.errcode !== 0) {
    throw new Error(`企业微信机器人拒绝了消息：${result.errmsg || response.status}`);
  }
  return { httpStatus: response.status, responseExcerpt: excerpt(data) };
}

async function deliverWeComRobot(config: WeComRobotConfig, notice: NoticeForDelivery): Promise<DeliveryResult> {
  const url = ensureHttpUrl(config.webhookUrl, '机器人 Webhook').toString();

  if (notice.imageAssetPath && fs.existsSync(notice.imageAssetPath)) {
    const bytes = fs.readFileSync(notice.imageAssetPath);
    if (bytes.byteLength <= 2 * 1024 * 1024) {
      const md5 = await import('node:crypto').then(({ createHash }) => createHash('md5').update(bytes).digest('hex'));
      await postWeComRobot(url, {
        msgtype: 'image',
        image: { base64: bytes.toString('base64'), md5 },
      });
    }
  } else if (notice.imageUrl && notice.linkUrl) {
    await postWeComRobot(url, {
      msgtype: 'news',
      news: {
        articles: [{
          title: notice.title.slice(0, 128),
          description: notice.body.slice(0, 512),
          url: notice.linkUrl,
          picurl: notice.imageUrl,
        }],
      },
    });
    return { httpStatus: 200, responseExcerpt: '图文消息发送成功' };
  }

  const markdown = wecomMarkdown(notice);
  return postWeComRobot(url, {
    msgtype: 'markdown',
    markdown: { content: markdown },
  });
}

async function getWeComToken(config: WeComAppConfig): Promise<string> {
  const url = new URL('https://qyapi.weixin.qq.com/cgi-bin/gettoken');
  url.searchParams.set('corpid', config.corpId);
  url.searchParams.set('corpsecret', config.corpSecret);
  const { response, data } = await request(url.toString(), { method: 'GET' });
  const result = data as { errcode?: number; errmsg?: string; access_token?: string };
  if (!response.ok || result.errcode !== 0 || !result.access_token) {
    throw new Error(`企业微信应用鉴权失败：${result.errmsg || response.status}`);
  }
  return result.access_token;
}

async function sendWeComAppMessage(
  token: string,
  config: WeComAppConfig,
  message: Record<string, unknown>,
): Promise<DeliveryResult> {
  const url = new URL('https://qyapi.weixin.qq.com/cgi-bin/message/send');
  url.searchParams.set('access_token', token);
  const payload = {
    touser: config.toUser || '@all',
    toparty: config.toParty || undefined,
    agentid: Number(config.agentId),
    ...message,
  };
  const { response, data } = await request(url.toString(), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const result = data as { errcode?: number; errmsg?: string };
  if (!response.ok || result.errcode !== 0) {
    throw new Error(`企业微信应用发送失败：${result.errmsg || response.status}`);
  }
  return { httpStatus: response.status, responseExcerpt: excerpt(data) };
}

async function uploadWeComImage(token: string, assetPath: string, mimeType?: string): Promise<string> {
  const bytes = fs.readFileSync(assetPath);
  if (bytes.byteLength > 2 * 1024 * 1024) throw new Error('企业微信图片不能超过 2 MB');
  const form = new FormData();
  form.set('media', new Blob([bytes], { type: mimeType || 'image/png' }), path.basename(assetPath));
  const url = new URL('https://qyapi.weixin.qq.com/cgi-bin/media/upload');
  url.searchParams.set('access_token', token);
  url.searchParams.set('type', 'image');
  const { response, data } = await request(url.toString(), { method: 'POST', body: form });
  const result = data as { errcode?: number; errmsg?: string; media_id?: string };
  if (!response.ok || result.errcode !== 0 || !result.media_id) {
    throw new Error(`企业微信图片上传失败：${result.errmsg || response.status}`);
  }
  return result.media_id;
}

async function deliverWeComApp(config: WeComAppConfig, notice: NoticeForDelivery): Promise<DeliveryResult> {
  const token = await getWeComToken(config);
  if (notice.imageAssetPath && fs.existsSync(notice.imageAssetPath)) {
    const mediaId = await uploadWeComImage(token, notice.imageAssetPath, notice.imageMimeType);
    await sendWeComAppMessage(token, config, { msgtype: 'image', image: { media_id: mediaId } });
  }

  if (notice.imageUrl && notice.linkUrl) {
    return sendWeComAppMessage(token, config, {
      msgtype: 'news',
      news: {
        articles: [{
          title: notice.title.slice(0, 128),
          description: notice.body.slice(0, 512),
          url: notice.linkUrl,
          picurl: notice.imageUrl,
        }],
      },
    });
  }
  if (notice.linkUrl) {
    return sendWeComAppMessage(token, config, {
      msgtype: 'textcard',
      textcard: {
        title: notice.title.slice(0, 128),
        description: notice.body.slice(0, 512),
        url: notice.linkUrl,
        btntxt: '查看详情',
      },
    });
  }
  return sendWeComAppMessage(token, config, {
    msgtype: 'text',
    text: { content: noticeText(notice).slice(0, 2000) },
  });
}

async function deliverTelegram(config: TelegramConfig, notice: NoticeForDelivery): Promise<DeliveryResult> {
  const base = (config.apiBase || 'https://api.telegram.org').replace(/\/$/, '');
  ensureHttpUrl(base, 'Telegram API 地址');
  const caption = `<b>${escapeHtml(notice.title)}</b>\n${escapeHtml(notice.body)}\n\n<i>来源：${escapeHtml(notice.sourceName)}</i>`;
  let method = 'sendMessage';
  let body: FormData | URLSearchParams;

  if (notice.imageAssetPath && fs.existsSync(notice.imageAssetPath)) {
    method = 'sendPhoto';
    body = new FormData();
    const bytes = fs.readFileSync(notice.imageAssetPath);
    body.set('photo', new Blob([bytes], { type: notice.imageMimeType || 'image/png' }), path.basename(notice.imageAssetPath));
    body.set('caption', caption.slice(0, 1024));
    body.set('chat_id', config.chatId);
    body.set('parse_mode', 'HTML');
    if (config.disableNotification) body.set('disable_notification', 'true');
  } else if (notice.imageUrl) {
    method = 'sendPhoto';
    body = new URLSearchParams({
      chat_id: config.chatId,
      photo: notice.imageUrl,
      caption: caption.slice(0, 1024),
      parse_mode: 'HTML',
      disable_notification: String(Boolean(config.disableNotification)),
    });
  } else {
    body = new URLSearchParams({
      chat_id: config.chatId,
      text: caption.slice(0, 4096),
      parse_mode: 'HTML',
      disable_notification: String(Boolean(config.disableNotification)),
    });
    if (notice.linkUrl) body.set('link_preview_options', JSON.stringify({ is_disabled: false }));
  }

  const { response, data } = await request(`${base}/bot${config.botToken}/${method}`, {
    method: 'POST',
    headers: body instanceof URLSearchParams ? { 'content-type': 'application/x-www-form-urlencoded' } : undefined,
    body,
  });
  const result = data as { ok?: boolean; description?: string };
  if (!response.ok || !result.ok) throw new Error(`Telegram 发送失败：${result.description || response.status}`);
  return { httpStatus: response.status, responseExcerpt: 'Telegram 已接收消息' };
}

async function deliverBark(config: BarkConfig, notice: NoticeForDelivery): Promise<DeliveryResult> {
  const base = (config.serverUrl || 'https://api.day.app').replace(/\/$/, '');
  ensureHttpUrl(base, 'Bark 服务器地址');
  const payload: Record<string, unknown> = {
    title: notice.title.slice(0, 200),
    body: notice.body.slice(0, 4000),
    group: config.group || notice.sourceName,
    sound: config.sound || undefined,
    level: config.level || 'active',
    url: notice.linkUrl,
    icon: notice.imageUrl,
  };
  const { response, data } = await request(`${base}/${encodeURIComponent(config.deviceKey)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const result = data as { code?: number; message?: string };
  if (!response.ok || (result.code !== undefined && result.code !== 200)) {
    throw new Error(`Bark 发送失败：${result.message || response.status}`);
  }
  return { httpStatus: response.status, responseExcerpt: excerpt(data) };
}

export async function deliverToChannel(
  type: ChannelType,
  config: ChannelConfig,
  notice: NoticeForDelivery,
): Promise<DeliveryResult> {
  if (type === 'wecom_robot') return deliverWeComRobot(config as WeComRobotConfig, notice);
  if (type === 'wecom_app') return deliverWeComApp(config as WeComAppConfig, notice);
  if (type === 'telegram') return deliverTelegram(config as TelegramConfig, notice);
  if (type === 'bark') return deliverBark(config as BarkConfig, notice);
  throw new Error('不支持的通知渠道');
}
