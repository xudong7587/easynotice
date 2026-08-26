import { describe, expect, it } from 'vitest';
import { buildPreviewSample } from './preview-samples.js';

describe('buildPreviewSample', () => {
  it('为 Lucky 生成可触发 DDNS 图片规则的真实样例字段', () => {
    const sample = buildPreviewSample('Lucky 主路由', 'lucky');
    expect(sample).toMatchObject({
      title: '公网 IP 已更新',
      eventType: 'ddns_changed',
      severity: 'success',
      raw: {
        oldIp: '198.51.100.24',
        ipAddress: '203.0.113.86',
        domain: 'home.example.com',
      },
    });
    expect(sample.body).toContain('DDNS：home.example.com');
  });

  it('为 OpenWrt 生成设备上线样例', () => {
    const sample = buildPreviewSample('OpenWrt', 'openwrt-istoreos');
    expect(sample.eventType).toBe('device_online');
    expect(sample.body).toContain('客厅电视');
    expect(sample.raw).toMatchObject({ onlineClients: 18 });
  });
});
