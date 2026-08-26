import { afterEach, describe, expect, it, vi } from 'vitest';
import { deliverToChannel } from './channels.js';
import { parseChannelConfig } from './validation.js';
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

describe('企业微信机器人投递', () => {
  it('把单独的机器人 Key 自动补全为官方 Webhook', () => {
    const parsed = parseChannelConfig('wecom_robot', { webhookUrl: '693a91f6-example-key' });
    expect(parsed).toMatchObject({
      webhookUrl: 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=693a91f6-example-key',
    });
  });

  it('普通通知使用 text 类型发送', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ errcode: 0, errmsg: 'ok' }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await deliverToChannel('wecom_robot', {
      webhookUrl: 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=example',
    }, notice);

    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(request.body))).toMatchObject({
      msgtype: 'text',
      text: { content: expect.stringContaining('测试通知') },
    });
  });

  it('自动将公网图片发送为图文卡片', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ errcode: 0, errmsg: 'ok' }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await deliverToChannel('wecom_robot', {
      webhookUrl: 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=example',
    }, { ...notice, imageUrl: 'https://example.com/poster.jpg' });

    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(request.body))).toMatchObject({
      msgtype: 'news',
      news: { articles: [{ picurl: 'https://example.com/poster.jpg' }] },
    });
  });
});
