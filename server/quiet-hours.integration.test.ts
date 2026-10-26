import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import supertest from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultQuietHours } from './quiet-hours.js';
import type { QuietHours, RouteMode } from './types.js';

const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'easynotice-quiet-'));
process.env.EASYNOTICE_DATA_DIR = testDir;
process.env.EASYNOTICE_SECRET = 'quiet-hours-test-secret-with-enough-entropy';
process.env.NODE_ENV = 'test';

let agent: ReturnType<typeof supertest.agent>;
let db: Database.Database;
let storeNotice: typeof import('./events.js').storeNotice;
let wakeWorker: typeof import('./worker.js').wakeWorker;
const night = { ...defaultQuietHours, enabled: true };

beforeAll(async () => {
  // Simulate an existing installation before the new column is introduced.
  const legacy = new Database(path.join(testDir, 'easynotice.db'));
  legacy.exec(`CREATE TABLE channels (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL, config_encrypted TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1, last_status TEXT NOT NULL DEFAULT 'untested',
    last_error TEXT, last_success_at INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
  ); INSERT INTO channels (id, name, type, config_encrypted, created_at, updated_at)
    VALUES ('legacy', '旧出口', 'wecom_robot', 'preserved-encrypted-config', 1, 1);`);
  legacy.close();
  const database = await import('./db.js');
  db = database.db;
  const row = db.prepare('SELECT * FROM channels WHERE id = ?').get('legacy') as Record<string, unknown>;
  expect(JSON.parse(String(row.quiet_hours))).toEqual(defaultQuietHours);
  expect(row.config_encrypted).toBe('preserved-encrypted-config');
  db.prepare('DELETE FROM channels WHERE id = ?').run('legacy');
  const { createApp } = await import('./app.js');
  ({ storeNotice } = await import('./events.js'));
  ({ wakeWorker } = await import('./worker.js'));
  agent = supertest.agent(createApp());
  await agent.post('/api/setup').send({ password: 'quiet-test-password-123', baseUrl: 'http://nas.local:18088' }).expect(201);
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-26T15:00:00Z')); // 北京时间 23:00
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{"errcode":0}', { status: 200 })));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

afterAll(() => {
  db?.close();
  fs.rmSync(testDir, { recursive: true, force: true });
});

async function createChannel(quietHours?: QuietHours) {
  const result = await agent.post('/api/channels').send({
    name: '测试出口', type: 'wecom_robot', config: { webhookUrl: 'quiet-hours-test-key' }, quietHours,
  }).expect(201);
  return result.body.channel as { id: string; enabled: boolean; quietHours: QuietHours };
}

async function createSource(channelIds: string[], routeMode: RouteMode = 'failover') {
  const result = await agent.post('/api/sources').send({ name: '测试入口', recipeId: 'generic', channelIds, routeMode }).expect(201);
  return String(result.body.source.id);
}

async function sendNotice(sourceId: string) {
  const id = storeNotice({
    sourceId, requestId: 'quiet-hours-test',
    notice: { title: '夜间通知', body: '内容', eventType: 'test', severity: 'error', raw: {} },
  });
  wakeWorker();
  await waitProcessed(id);
  return id;
}

async function waitProcessed(id: string) {
  await vi.waitFor(() => {
    const row = db.prepare('SELECT status FROM events WHERE id = ?').get(id) as { status: string };
    expect(['pending', 'processing']).not.toContain(row.status);
  });
}

describe('通知出口免打扰', () => {
  it('默认关闭，保存和读取设置，更新其他字段时保留免打扰及停用状态', async () => {
    const channel = await createChannel();
    expect(channel.quietHours).toEqual(defaultQuietHours);
    await agent.put(`/api/channels/${channel.id}`).send({ quietHours: night, enabled: false }).expect(200);
    const updated = await agent.put(`/api/channels/${channel.id}`).send({ name: '改名' }).expect(200);
    expect(updated.body.channel).toMatchObject({ name: '改名', enabled: false, quietHours: night });
    const list = await agent.get('/api/channels').expect(200);
    expect(list.body.channels).toContainEqual(expect.objectContaining({ id: channel.id, quietHours: night }));
  });

  it('创建及更新均校验配置，无效更新不会覆盖原设置', async () => {
    const channel = await createChannel(night);
    for (const invalid of [{ start: '24:00' }, { end: '22:00' }, { timeZone: 'bad-zone' }, { enabled: 'true' }]) {
      await agent.put(`/api/channels/${channel.id}`).send({ quietHours: { ...night, ...invalid } }).expect(400);
    }
    await agent.post('/api/channels').send({
      name: '错误设置', type: 'wecom_robot', config: { webhookUrl: 'test-key' }, quietHours: { ...night, end: '' },
    }).expect(400);
    expect(JSON.parse((db.prepare('SELECT quiet_hours FROM channels WHERE id = ?').get(channel.id) as { quiet_hours: string }).quiet_hours)).toEqual(night);
  });

  it('全部免打扰时保留跳过记录，不发送、不修改渠道健康、不计为失败，重发仍遵守免打扰', async () => {
    const channel = await createChannel(night);
    const source = await createSource([channel.id]);
    const id = await sendNotice(source);
    const detail = await agent.get(`/api/events/${id}`).expect(200);
    expect(detail.body.event).toMatchObject({ status: 'skipped', error: null });
    expect(detail.body.event.deliveries).toEqual([expect.objectContaining({ status: 'skipped', attempt: 0, detail: expect.stringContaining('免打扰') })]);
    await agent.post(`/api/events/${id}/retry`).expect(202);
    await waitProcessed(id);
    expect(fetch).not.toHaveBeenCalled();
    expect(db.prepare('SELECT last_status, last_error FROM channels WHERE id = ?').get(channel.id)).toEqual({ last_status: 'untested', last_error: null });
    const filtered = await agent.get('/api/events?status=skipped').expect(200);
    expect(filtered.body.events).toContainEqual(expect.objectContaining({ id }));
    const dashboard = await agent.get('/api/dashboard').expect(200);
    expect(dashboard.body.metrics).toMatchObject({ failedCount24h: 0, successRate24h: null });
  });

  it.each(['failover', 'broadcast'] as const)('%s 跳过免打扰出口后仍发送到其他出口', async (mode) => {
    const quiet = await createChannel(night);
    const active = await createChannel();
    const source = await createSource([quiet.id, active.id], mode);
    const id = await sendNotice(source);
    const detail = await agent.get(`/api/events/${id}`).expect(200);
    expect(detail.body.event.status).toBe('success');
    expect(detail.body.event.deliveries).toEqual(expect.arrayContaining([
      expect.objectContaining({ channelId: quiet.id, status: 'skipped' }),
      expect.objectContaining({ channelId: active.id, status: 'success' }),
    ]));
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('测试预览也受拦截，结束后恢复且不会自动补发夜间记录', async () => {
    const channel = await createChannel(night);
    const blocked = await agent.post(`/api/channels/${channel.id}/test`).send({}).expect(409);
    expect(blocked.body.error).toContain('免打扰');
    const source = await createSource([channel.id]);
    const nightId = await sendNotice(source);
    expect(fetch).not.toHaveBeenCalled();
    vi.setSystemTime(new Date('2026-10-27T00:00:00Z')); // 北京时间 08:00
    await agent.post(`/api/channels/${channel.id}/test`).send({}).expect(200);
    const dayId = await sendNotice(source);
    expect(db.prepare('SELECT status FROM events WHERE id = ?').get(dayId)).toEqual({ status: 'success' });
    expect(db.prepare('SELECT status FROM events WHERE id = ?').get(nightId)).toEqual({ status: 'skipped' });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('关闭免打扰后恢复发送', async () => {
    const channel = await createChannel(night);
    await agent.put(`/api/channels/${channel.id}`).send({ quietHours: { ...night, enabled: false } }).expect(200);
    const source = await createSource([channel.id]);
    const id = await sendNotice(source);
    expect(db.prepare('SELECT status FROM events WHERE id = ?').get(id)).toEqual({ status: 'success' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('自动重试跨入免打扰时段后不再发送', async () => {
    vi.setSystemTime(new Date('2026-10-26T13:59:59Z'));
    vi.mocked(fetch).mockImplementationOnce(async () => {
      vi.setSystemTime(new Date('2026-10-26T14:00:00Z'));
      throw new Error('暂时不可用');
    });
    const channel = await createChannel(night);
    const source = await createSource([channel.id]);
    const id = await sendNotice(source);
    const detail = await agent.get(`/api/events/${id}`).expect(200);
    expect(detail.body.event.deliveries).toEqual(expect.arrayContaining([
      expect.objectContaining({ attempt: 1, status: 'failed' }),
      expect.objectContaining({ attempt: 0, status: 'skipped' }),
    ]));
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
