import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import supertest from 'supertest';

const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'easynotice-ugreen-test-'));
process.env.EASYNOTICE_DATA_DIR = testDir;
process.env.EASYNOTICE_SECRET = 'ugreen-integration-test-secret-with-enough-entropy';
process.env.NODE_ENV = 'test';

const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const encodedPublicKey = Buffer.from(publicKey.export({ type: 'spki', format: 'pem' })).toString('base64');
const messages: Record<string, unknown>[] = [{ id: 'old', time: 1_780_000_000, level: 'info', body: '已有历史消息' }];
let nasServer: http.Server;
let nasBaseUrl = '';
let agent: ReturnType<typeof supertest.agent>;
let database: { close: () => void; prepare: (sql: string) => { get: (...params: unknown[]) => unknown } };

function decrypt(value: string): string {
  return crypto.privateDecrypt({ key: privateKey, padding: crypto.constants.RSA_PKCS1_PADDING }, Buffer.from(value, 'base64')).toString('utf8');
}

beforeAll(async () => {
  nasServer = http.createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
      response.setHeader('Content-Type', 'application/json');
      if (request.url?.startsWith('/ugreen/v1/verify/check')) {
        response.setHeader('X-Rsa-Token', encodedPublicKey);
        response.end(JSON.stringify({ code: 200 }));
      } else if (request.url === '/ugreen/v1/verify/login') {
        expect(decrypt(String(body.password))).toBe('top-secret-nas-password');
        response.end(JSON.stringify({ code: 200, data: { public_key: encodedPublicKey, token: 'session-token', token_id: 'token-id' } }));
      } else if (request.url === '/ugreen/v1/desktop/message/list') {
        response.end(JSON.stringify({ code: 200, data: { List: messages } }));
      } else {
        response.statusCode = 404;
        response.end(JSON.stringify({ code: 404 }));
      }
    });
  });
  await new Promise<void>((resolve) => nasServer.listen(0, '127.0.0.1', resolve));
  const address = nasServer.address();
  nasBaseUrl = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;

  const [{ createApp }, { db }] = await Promise.all([import('./app.js'), import('./db.js')]);
  database = db as unknown as typeof database;
  agent = supertest.agent(createApp());
  await agent.post('/api/setup').send({ password: 'test-password-123', baseUrl: 'http://nas.local:18088' }).expect(201);
});

afterAll(async () => {
  database.close();
  await new Promise<void>((resolve) => nasServer.close(() => resolve()));
  fs.rmSync(testDir, { recursive: true, force: true });
});

describe('UGREEN collector integration', () => {
  it('encrypts credentials, seeds without spam, then queues each new message once', async () => {
    const created = await agent.post('/api/sources').send({
      name: '书房绿联 NAS',
      recipeId: 'ugreen-dxp',
      routeMode: 'failover',
      channelIds: [],
      enabled: true,
      collectorConfig: {
        baseUrl: nasBaseUrl,
        username: 'sunny',
        password: 'top-secret-nas-password',
        allowSelfSigned: false,
        intervalMinutes: 5,
        importRecent: false,
      },
    }).expect(201);
    const sourceId = String(created.body.source.id);
    expect(created.body.source.collector).toMatchObject({ baseUrl: nasBaseUrl, username: 'sunny', passwordConfigured: true, intervalMinutes: 5 });
    expect(created.body.source.collector).not.toHaveProperty('password');

    const stored = database.prepare('SELECT config_encrypted FROM ugreen_collectors WHERE source_id = ?').get(sourceId) as { config_encrypted: string };
    expect(stored.config_encrypted).toMatch(/^v1\./);
    expect(stored.config_encrypted).not.toContain('top-secret-nas-password');

    await agent.post(`/api/sources/${sourceId}/ugreen/test`).send({}).expect(200);
    const updated = await agent.put(`/api/sources/${sourceId}/ugreen`).send({ intervalMinutes: 2 }).expect(200);
    expect(updated.body.collector).toMatchObject({ username: 'sunny', passwordConfigured: true, intervalMinutes: 2 });
    expect(updated.body.collector).not.toHaveProperty('password');

    const first = await agent.post(`/api/sources/${sourceId}/ugreen/run`).send({}).expect(200);
    expect(first.body).toMatchObject({ found: 1, queued: 0, seeded: true });
    expect((await agent.get('/api/events').expect(200)).body.events).toHaveLength(0);

    messages.push({ id: 'new', time: 1_780_000_060, level: 'warning', body: '磁盘温度较高' });
    const second = await agent.post(`/api/sources/${sourceId}/ugreen/run`).send({}).expect(200);
    expect(second.body).toMatchObject({ found: 2, queued: 1, seeded: false });
    const events = await agent.get('/api/events').expect(200);
    expect(events.body.events).toHaveLength(1);
    expect(events.body.events[0]).toMatchObject({ title: '绿联 NAS 系统告警', body: '磁盘温度较高', eventType: 'ugreen_warning' });

    const third = await agent.post(`/api/sources/${sourceId}/ugreen/run`).send({}).expect(200);
    expect(third.body.queued).toBe(0);
    expect((await agent.get('/api/events').expect(200)).body.events).toHaveLength(1);
  });
});
