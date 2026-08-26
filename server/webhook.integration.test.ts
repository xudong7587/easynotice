import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import supertest from 'supertest';

const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'easynotice-test-'));
process.env.EASYNOTICE_DATA_DIR = testDir;
process.env.EASYNOTICE_SECRET = 'integration-test-secret-with-enough-entropy';
process.env.NODE_ENV = 'test';

let agent: ReturnType<typeof supertest.agent>;
let publicClient: ReturnType<typeof supertest>;
let database: {
  close: () => void;
  prepare: (sql: string) => { get: (...params: unknown[]) => unknown };
};

function encryptWeCom(message: string, encodingAesKey: string, receiveId: string): string {
  const aesKey = Buffer.from(`${encodingAesKey}=`, 'base64');
  const messageBytes = Buffer.from(message);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(messageBytes.length);
  const plain = Buffer.concat([Buffer.alloc(16, 7), length, messageBytes, Buffer.from(receiveId)]);
  const paddingLength = 32 - (plain.length % 32 || 32) || 32;
  const padded = Buffer.concat([plain, Buffer.alloc(paddingLength, paddingLength)]);
  const cipher = crypto.createCipheriv('aes-256-cbc', aesKey, aesKey.subarray(0, 16));
  cipher.setAutoPadding(false);
  return Buffer.concat([cipher.update(padded), cipher.final()]).toString('base64');
}

function callbackSignature(token: string, timestamp: string, nonce: string, encrypted: string): string {
  return crypto.createHash('sha1').update([token, timestamp, nonce, encrypted].sort().join('')).digest('hex');
}

beforeAll(async () => {
  const [{ createApp }, { db }] = await Promise.all([import('./app.js'), import('./db.js')]);
  database = db as unknown as typeof database;
  const app = createApp();
  agent = supertest.agent(app);
  publicClient = supertest(app);
  await agent.post('/api/setup').send({ password: 'test-password-123', baseUrl: 'http://nas.local:18088' }).expect(201);
});

afterAll(() => {
  database.close();
  fs.rmSync(testDir, { recursive: true, force: true });
});

describe('webhook integration', () => {
  it('creates an authenticated source and receives a public webhook', async () => {
    const created = await agent.post('/api/sources').send({
      name: 'Lucky 测试', recipeId: 'lucky', routeMode: 'failover', channelIds: [], enabled: true,
    }).expect(201);
    const source = created.body.source as { endpoint: { hookUrl: string } };
    expect((created.body.source as { endpoint: { url: string } }).endpoint.url).toBe(source.endpoint.hookUrl);
    expect(source.endpoint.hookUrl).not.toContain('/api/v1/notify/');
    const hookPath = new URL(source.endpoint.hookUrl).pathname;
    const received = await agent.post(hookPath).send({
      title: '公网IP更新', content: '更新为 203.0.113.8', event: 'ip_changed',
    }).expect(200);
    expect(received.body.success).toBe(true);
    expect(received.body.recognized.title).toBe('公网IP更新');

    const events = await agent.get('/api/events').expect(200);
    expect(events.body.events).toHaveLength(1);
    expect(events.body.events[0].eventType).toBe('ip_changed');
  });

  it('rejects an invalid webhook token', async () => {
    await agent.post('/hook/not-a-real-token').send({ title: '不应接收' }).expect(404);
  });

  it('加密原始请求并在入库前隐藏入口令牌和业务密钥', async () => {
    const created = await agent.post('/api/sources').send({
      name: '安全测试', recipeId: 'generic', routeMode: 'failover', channelIds: [], enabled: true,
    }).expect(201);
    const legacyUrl = new URL(String(created.body.source.endpoint.legacyUrl));
    const entryToken = legacyUrl.searchParams.get('token')!;
    const sourceId = String(created.body.source.id);
    const received = await agent.post(`${legacyUrl.pathname}${legacyUrl.search}`).send({
      title: '安全存储测试',
      content: '普通正文',
      apiKey: 'business-api-key-must-not-leak',
    }).expect(200);
    const eventId = String(received.body.eventId);
    const stored = database.prepare('SELECT raw_json FROM events WHERE id = ?').get(eventId) as { raw_json: string };

    expect(stored.raw_json).toMatch(/^v1\./);
    expect(stored.raw_json).not.toContain(entryToken);
    expect(stored.raw_json).not.toContain('business-api-key-must-not-leak');
    const storedSource = database.prepare('SELECT token_hash, token_encrypted FROM sources WHERE id = ?').get(sourceId) as { token_hash: string; token_encrypted: string };
    expect(storedSource.token_encrypted).toMatch(/^v1\./);
    expect(storedSource.token_encrypted).not.toContain(entryToken);
    expect(storedSource.token_hash).not.toBe(entryToken);

    const detail = await agent.get(`/api/events/${eventId}`).expect(200);
    expect(detail.body.event.raw).toMatchObject({
      token: '[已隐藏]',
      apiKey: '[已隐藏]',
      title: '安全存储测试',
    });
  });

  it('只通过带签名的公开地址提供本地图片', async () => {
    const uploaded = await agent.post('/api/assets')
      .attach('image', Buffer.from('not-a-real-image-but-valid-upload-test'), { filename: 'notice.png', contentType: 'image/png' })
      .expect(201);
    const { publicAssetUrl } = await import('./media.js');
    const signed = new URL(publicAssetUrl(String(uploaded.body.asset.id))!);

    await publicClient.get(`${signed.pathname}${signed.search}`).expect(200).expect('Content-Type', /image\/png/);
    await publicClient.get(`${signed.pathname.slice(0, signed.pathname.lastIndexOf('/') + 1)}invalid-signature`).expect(404);
  });

  it('永久删除前要求先停用通知入口', async () => {
    const created = await agent.post('/api/sources').send({
      name: '待删除入口', recipeId: 'generic', routeMode: 'failover', channelIds: [], enabled: true,
    }).expect(201);
    const sourceId = String(created.body.source.id);

    await agent.delete(`/api/sources/${sourceId}/permanent`).expect(409);
    await agent.delete(`/api/sources/${sourceId}`).expect(200);
    await agent.delete(`/api/sources/${sourceId}/permanent`).expect(200);
    await agent.get(`/api/sources/${sourceId}`).expect(404);
  });

  it('永久删除前要求先停用通知出口', async () => {
    const created = await agent.post('/api/channels').send({
      name: '待删除机器人',
      type: 'wecom_robot',
      config: { webhookUrl: '693a91f6-example-key' },
      enabled: true,
    }).expect(201);
    const channelId = String(created.body.channel.id);
    const encrypted = database.prepare('SELECT config_encrypted FROM channels WHERE id = ?').get(channelId) as { config_encrypted: string };
    expect(encrypted.config_encrypted).toMatch(/^v1\./);
    expect(encrypted.config_encrypted).not.toContain('693a91f6-example-key');

    await agent.delete(`/api/channels/${channelId}/permanent`).expect(409);
    await agent.delete(`/api/channels/${channelId}`).expect(200);
    await agent.delete(`/api/channels/${channelId}/permanent`).expect(200);

    const channels = await agent.get('/api/channels').expect(200);
    expect(channels.body.channels).not.toContainEqual(expect.objectContaining({ id: channelId }));
  });

  it('验证、解密并留存可选的企业微信应用回调', async () => {
    const corpId = 'wwcallbacktest';
    const callbackToken = 'CallbackToken123';
    const callbackEncodingAesKey = Buffer.from('0123456789abcdef0123456789abcdef')
      .toString('base64').replace(/=$/, '');
    const created = await agent.post('/api/channels').send({
      name: '企微回调测试',
      type: 'wecom_app',
      config: {
        corpId,
        corpSecret: 'app-secret',
        agentId: '1000002',
        toUser: '@all',
        callbackEnabled: true,
        callbackToken,
        callbackEncodingAesKey,
      },
      enabled: true,
    }).expect(201);
    const channelId = String(created.body.channel.id);
    const callbackPath = new URL(String(created.body.channel.callbackUrl)).pathname;
    const timestamp = '1770000000';
    const nonce = 'nonce123';

    const encryptedEcho = encryptWeCom('easy-notice-ok', callbackEncodingAesKey, corpId);
    await agent.get(callbackPath).query({
      msg_signature: callbackSignature(callbackToken, timestamp, nonce, encryptedEcho),
      timestamp,
      nonce,
      echostr: encryptedEcho,
    }).expect(200, 'easy-notice-ok');

    const message = '<xml><ToUserName><![CDATA[wwcallbacktest]]></ToUserName><FromUserName><![CDATA[user-1]]></FromUserName><CreateTime>1770000000</CreateTime><MsgType><![CDATA[text]]></MsgType><Content><![CDATA[你好]]></Content><MsgId>123456</MsgId><AgentID>1000002</AgentID></xml>';
    const encryptedMessage = encryptWeCom(message, callbackEncodingAesKey, corpId);
    const envelope = `<xml><ToUserName><![CDATA[${corpId}]]></ToUserName><Encrypt><![CDATA[${encryptedMessage}]]></Encrypt><AgentID><![CDATA[1000002]]></AgentID></xml>`;
    await agent.post(callbackPath).query({
      msg_signature: callbackSignature(callbackToken, timestamp, nonce, encryptedMessage),
      timestamp,
      nonce,
    }).set('Content-Type', 'application/xml').send(envelope).expect(200, '');

    const events = await agent.get(`/api/channels/${channelId}/callback-events`).expect(200);
    expect(events.body.events[0]).toMatchObject({
      messageType: 'text',
      fromUser: 'user-1',
    });
    const stored = database.prepare('SELECT raw_xml FROM wecom_callback_events WHERE channel_id = ?').get(channelId) as { raw_xml: string };
    expect(stored.raw_xml).toMatch(/^v1\./);
    expect(stored.raw_xml).not.toContain('你好');
  });
});
