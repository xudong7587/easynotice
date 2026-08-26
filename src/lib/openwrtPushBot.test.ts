import { describe, expect, it } from 'vitest';
import { buildOpenWrtPushBotConfig } from './openwrtPushBot';

describe('buildOpenWrtPushBotConfig', () => {
  it('generates a complete PushBot DIY JSON document', () => {
    const endpoint = 'http://192.168.1.10:18088/hook/example-token';
    const config = JSON.parse(buildOpenWrtPushBotConfig(endpoint)) as Record<string, unknown>;
    const type = config.type as Record<string, string>;

    expect(config.url).toBe(endpoint);
    expect(config.data).toBe('@${tempjsonpath}');
    expect(config.content_type).toBe('Content-Type: application/json');
    expect(config).toMatchObject({
      str_linefeed: '\\n',
      str_splitline: '\\n----\\n',
      font_success: '',
      font_fail: '',
      font_title: '',
      percentsym: '25',
    });
    expect(type.title).toBe('"${1}"');
    expect(type.content).toBe('"${nowtime}${str_linefeed}${2}"');
    expect(type.event).toBe('"openwrt_notice"');
  });
});
