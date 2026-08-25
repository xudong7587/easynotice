import { describe, expect, it } from 'vitest';
import { normalizeIncoming } from './normalize.js';

describe('normalizeIncoming', () => {
  it('recognizes Lucky style payloads', () => {
    const result = normalizeIncoming({
      method: 'POST',
      body: { title: '公网IP更新', content: '在 12:30 更新为 203.0.113.8', event: 'ip_changed' },
    });
    expect(result).toMatchObject({
      title: '公网IP更新',
      body: '在 12:30 更新为 203.0.113.8',
      eventType: 'ip_changed',
      severity: 'info',
    });
  });

  it('recognizes nested MDC-NG payloads and posters', () => {
    const result = normalizeIncoming({
      method: 'POST',
      body: {
        event: 'finished',
        data: { title: '示例影片', poster: 'https://example.com/poster.jpg', category: '电影' },
      },
    });
    expect(result.title).toBe('示例影片');
    expect(result.eventType).toBe('finished');
    expect(result.imageUrl).toBe('https://example.com/poster.jpg');
    expect(result.severity).toBe('success');
  });

  it('accepts GET query parameters and blocks unsafe image schemes', () => {
    const result = normalizeIncoming({
      method: 'GET',
      query: { subject: '测试', message: '正文', image: 'file:///etc/passwd' },
    });
    expect(result.title).toBe('测试');
    expect(result.body).toBe('正文');
    expect(result.imageUrl).toBeUndefined();
  });

  it('falls back to useful fields without throwing', () => {
    const result = normalizeIncoming({ method: 'POST', body: { custom: 'value', count: 3 } });
    expect(result.title).toBe('新通知');
    expect(result.body).toContain('custom: value');
  });
});
