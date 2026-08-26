import crypto from 'node:crypto';
import { Router } from 'express';
import { nanoid } from 'nanoid';
import { decryptSecret } from './crypto.js';
import { db } from './db.js';
import type { WeComAppConfig } from './types.js';

const router = Router();

interface CallbackChannelRow {
  id: string;
  type: string;
  config_encrypted: string;
  enabled: number;
}

function queryValue(value: unknown): string {
  if (Array.isArray(value)) return String(value[0] || '');
  return typeof value === 'string' ? value : '';
}

function xmlValue(xml: string, tag: string): string {
  const match = xml.match(new RegExp(
    `<${tag}>\\s*(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([\\s\\S]*?))\\s*</${tag}>`,
    'i',
  ));
  return (match?.[1] ?? match?.[2] ?? '').trim();
}

export function weComSignature(token: string, timestamp: string, nonce: string, encrypted: string): string {
  return crypto.createHash('sha1').update([token, timestamp, nonce, encrypted].sort().join('')).digest('hex');
}

function signatureMatches(token: string, timestamp: string, nonce: string, encrypted: string, supplied: string): boolean {
  const expected = weComSignature(token, timestamp, nonce, encrypted);
  const expectedBytes = Buffer.from(expected);
  const suppliedBytes = Buffer.from(supplied.toLowerCase());
  return expectedBytes.length === suppliedBytes.length && crypto.timingSafeEqual(expectedBytes, suppliedBytes);
}

export function decryptWeComPayload(
  encrypted: string,
  encodingAesKey: string,
  expectedReceiveId: string,
): { message: string; receiveId: string } {
  const aesKey = Buffer.from(`${encodingAesKey}=`, 'base64');
  if (aesKey.length !== 32) throw new Error('EncodingAESKey 无效');
  const decipher = crypto.createDecipheriv('aes-256-cbc', aesKey, aesKey.subarray(0, 16));
  decipher.setAutoPadding(false);
  const padded = Buffer.concat([decipher.update(encrypted, 'base64'), decipher.final()]);
  const padding = padded[padded.length - 1];
  if (!padding || padding > 32 || padding > padded.length) throw new Error('企业微信回调填充无效');
  for (let index = padded.length - padding; index < padded.length; index += 1) {
    if (padded[index] !== padding) throw new Error('企业微信回调填充无效');
  }
  const plain = padded.subarray(0, padded.length - padding);
  if (plain.length < 20) throw new Error('企业微信回调内容不完整');
  const messageLength = plain.readUInt32BE(16);
  const messageEnd = 20 + messageLength;
  if (messageEnd > plain.length) throw new Error('企业微信回调消息长度无效');
  const message = plain.subarray(20, messageEnd).toString('utf8');
  const receiveId = plain.subarray(messageEnd).toString('utf8');
  if (receiveId !== expectedReceiveId) throw new Error('企业微信回调 CorpID 不匹配');
  return { message, receiveId };
}

function loadConfig(channelId: string): WeComAppConfig | undefined {
  const row = db.prepare('SELECT id, type, config_encrypted, enabled FROM channels WHERE id = ?').get(channelId) as
    | CallbackChannelRow
    | undefined;
  if (!row || !row.enabled || row.type !== 'wecom_app') return undefined;
  const config = decryptSecret<WeComAppConfig>(row.config_encrypted);
  if (!config.callbackEnabled || !config.callbackToken || !config.callbackEncodingAesKey) return undefined;
  return config;
}

router.get('/callback/wecom/:channelId', (request, response) => {
  const config = loadConfig(request.params.channelId);
  if (!config) {
    response.status(404).type('text/plain').send('callback disabled');
    return;
  }
  const signature = queryValue(request.query.msg_signature || request.query.msgsignature);
  const timestamp = queryValue(request.query.timestamp);
  const nonce = queryValue(request.query.nonce);
  const echo = queryValue(request.query.echostr);
  try {
    if (!signature || !timestamp || !nonce || !echo
      || !signatureMatches(config.callbackToken!, timestamp, nonce, echo, signature)) {
      throw new Error('企业微信回调签名无效');
    }
    const decrypted = decryptWeComPayload(echo, config.callbackEncodingAesKey!, config.corpId);
    response.type('text/plain; charset=utf-8').send(decrypted.message);
  } catch {
    response.status(403).type('text/plain').send('invalid callback');
  }
});

router.post('/callback/wecom/:channelId', (request, response) => {
  const config = loadConfig(request.params.channelId);
  if (!config) {
    response.status(404).type('text/plain').send('callback disabled');
    return;
  }
  const signature = queryValue(request.query.msg_signature || request.query.msgsignature);
  const timestamp = queryValue(request.query.timestamp);
  const nonce = queryValue(request.query.nonce);
  const envelope = typeof request.body === 'string' ? request.body : '';
  const encrypted = xmlValue(envelope, 'Encrypt');
  try {
    if (!signature || !timestamp || !nonce || !encrypted
      || !signatureMatches(config.callbackToken!, timestamp, nonce, encrypted, signature)) {
      throw new Error('企业微信回调签名无效');
    }
    const decrypted = decryptWeComPayload(encrypted, config.callbackEncodingAesKey!, config.corpId);
    const fromUser = xmlValue(decrypted.message, 'FromUserName');
    const createTime = xmlValue(decrypted.message, 'CreateTime');
    const eventType = xmlValue(decrypted.message, 'Event');
    const changeType = xmlValue(decrypted.message, 'ChangeType');
    const messageId = xmlValue(decrypted.message, 'MsgId')
      || (fromUser && createTime ? `event:${fromUser}:${createTime}:${eventType}:${changeType}` : null);
    db.prepare(`
      INSERT OR IGNORE INTO wecom_callback_events (
        id, channel_id, message_id, message_type, event_type, from_user, raw_xml, received_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      nanoid(),
      request.params.channelId,
      messageId,
      xmlValue(decrypted.message, 'MsgType'),
      eventType,
      fromUser,
      decrypted.message.slice(0, 200_000),
      Date.now(),
    );
    response.status(200).end();
  } catch {
    response.status(403).type('text/plain').send('invalid callback');
  }
});

export const weComCallbackRouter = router;
