import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import supertest from 'supertest';

const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'easynotice-test-'));
process.env.EASYNOTICE_DATA_DIR = testDir;
process.env.EASYNOTICE_SECRET = 'integration-test-secret-with-enough-entropy';
process.env.NODE_ENV = 'test';

let agent: ReturnType<typeof supertest.agent>;
let database: { close: () => void };

beforeAll(async () => {
  const [{ createApp }, { db }] = await Promise.all([import('./app.js'), import('./db.js')]);
  database = db;
  agent = supertest.agent(createApp());
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
    const hookPath = new URL(source.endpoint.hookUrl).pathname;
    const received = await agent.post(hookPath).send({
      title: '公网IP更新', content: '更新为 203.0.113.8', event: 'ip_changed',
    }).expect(202);
    expect(received.body.success).toBe(true);
    expect(received.body.recognized.title).toBe('公网IP更新');

    const events = await agent.get('/api/events').expect(200);
    expect(events.body.events).toHaveLength(1);
    expect(events.body.events[0].eventType).toBe('ip_changed');
  });

  it('rejects an invalid webhook token', async () => {
    await agent.post('/hook/not-a-real-token').send({ title: '不应接收' }).expect(404);
  });

  it('永久删除前要求先停用通知出口', async () => {
    const created = await agent.post('/api/channels').send({
      name: '待删除机器人',
      type: 'wecom_robot',
      config: { webhookUrl: '693a91f6-example-key' },
      enabled: true,
    }).expect(201);
    const channelId = String(created.body.channel.id);

    await agent.delete(`/api/channels/${channelId}/permanent`).expect(409);
    await agent.delete(`/api/channels/${channelId}`).expect(200);
    await agent.delete(`/api/channels/${channelId}/permanent`).expect(200);

    const channels = await agent.get('/api/channels').expect(200);
    expect(channels.body.channels).not.toContainEqual(expect.objectContaining({ id: channelId }));
  });
});
