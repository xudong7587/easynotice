import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
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

  it('把本地匹配图片和文字合成为一条 mpnews 图文消息', async () => {
    const imagePath = path.join(os.tmpdir(), `easynotice-mpnews-${Date.now()}.png`);
    fs.writeFileSync(imagePath, Buffer.from('test-image'));
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ errcode: 0, access_token: 'token' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ errcode: 0, media_id: 'media-1' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ errcode: 0, errmsg: 'ok' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    try {
      await deliverToChannel('wecom_app', config, {
        ...notice,
        imageAssetPath: imagePath,
        imageMimeType: 'image/png',
      });
    } finally {
      fs.rmSync(imagePath, { force: true });
    }

    expect(fetchMock).toHaveBeenCalledTimes(3);
    const request = fetchMock.mock.calls[2]?.[1] as RequestInit;
    expect(JSON.parse(String(request.body))).toMatchObject({
      msgtype: 'mpnews',
      mpnews: {
        articles: [{
          title: '测试通知',
          thumb_media_id: 'media-1',
          digest: '测试正文',
          content: expect.stringContaining('测试正文'),
        }],
      },
    });
  });

  it('把公网匹配图片发送为单条 news 图文卡片', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ errcode: 0, access_token: 'token' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ errcode: 0, errmsg: 'ok' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await deliverToChannel('wecom_app', config, {
      ...notice,
      imageUrl: 'https://example.com/poster.jpg',
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const request = fetchMock.mock.calls[1]?.[1] as RequestInit;
    expect(JSON.parse(String(request.body))).toMatchObject({
      msgtype: 'news',
      news: { articles: [{ picurl: 'https://example.com/poster.jpg' }] },
    });
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

  it('有公网图片时仍然只发送文字', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ errcode: 0, errmsg: 'ok' }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await deliverToChannel('wecom_robot', {
      webhookUrl: 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=example',
    }, { ...notice, imageUrl: 'https://example.com/poster.jpg' });

    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(request.body))).toMatchObject({
      msgtype: 'text',
      text: { content: expect.stringContaining('测试通知') },
    });
  });

  it('有本地素材时仍然只发送文字', async () => {
    const imagePath = path.join(os.tmpdir(), `easynotice-robot-news-${Date.now()}.png`);
    fs.writeFileSync(imagePath, Buffer.from('test-image'));
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ errcode: 0, errmsg: 'ok' }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    try {
      await deliverToChannel('wecom_robot', {
        webhookUrl: 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=example',
      }, {
        ...notice,
        imageAssetPath: imagePath,
        imageAssetUrl: 'https://notice.example/media/asset/signature',
        imageMimeType: 'image/png',
      });
    } finally {
      fs.rmSync(imagePath, { force: true });
    }

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(request.body))).toMatchObject({
      msgtype: 'text',
      text: { content: expect.stringContaining('测试通知') },
    });
  });
});
