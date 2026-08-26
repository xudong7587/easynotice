import { afterEach, describe, expect, it, vi } from 'vitest';
import { deliverToChannel } from './channels.js';
import type { NoticeForDelivery, WeComAppConfig } from './types.js';

const config: WeComAppConfig = {
  corpId: 'wwexample',
  corpSecret: 'secret',
  agentId: '1000002',
  toUser: '@all',
};

const notice: NoticeForDelivery = {
  eventId: 'event-1',
  sourceName: '测试入口',
  title: '测试通知',
  body: '测试正文',
  eventType: 'test',
  severity: 'info',
  raw: {},
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('企业微信应用投递诊断', () => {
  it('在错误 60020 中显示企业微信识别到的公网出口 IP 和正确配置入口', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ errcode: 0, access_token: 'token' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        errcode: 60020,
        errmsg: 'not allow to access from your ip, hint: [123], from ip: 203.0.113.8, more info',
      }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(deliverToChannel('wecom_app', config, notice)).rejects.toThrow(
      /公网出口 IP 203\.0\.113\.8.*接收消息.*EncodingAESKey/,
    );
  });
});
