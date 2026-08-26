import { describe, expect, it } from 'vitest';
import { getRecipe, inferLegacyRecipeId, recipes } from './recipes.js';

describe('Lucky recipe webhook templates', () => {
  it('提供可复制的原生与计划任务模板，并明确排除伪造的证书回调', () => {
    const templates = getRecipe('lucky').webhookTemplates || [];
    expect(templates.find((template) => template.id === 'ddns_changed')).toMatchObject({
      support: 'native',
      defaultSelected: true,
    });
    expect(templates.find((template) => template.id === 'stun_changed')).toMatchObject({ support: 'native' });
    expect(templates.find((template) => template.id === 'port_forward_status')).toMatchObject({ support: 'scheduled' });
    const certificate = templates.find((template) => template.id === 'certificate_renewal');
    expect(certificate).toMatchObject({ support: 'unavailable' });
    expect(certificate?.bodyTemplate).toBeUndefined();
    for (const template of templates.filter((item) => item.bodyTemplate)) {
      expect(() => JSON.parse(template.bodyTemplate!)).not.toThrow();
    }
  });

  it('把通用入口置顶，并提供软路由和影视库中枢入口', () => {
    expect(recipes[0]?.id).toBe('generic');
    expect(getRecipe('openwrt-istoreos')).toMatchObject({
      name: 'OpenWrt 全能推送 / PushBot',
      confidence: 'verified',
      setupMode: 'openwrt-pushbot',
    });
    expect(getRecipe('media-hub')).toMatchObject({
      name: '影视库中枢',
    });
    expect(getRecipe('missing-recipe').id).toBe('generic');
  });

  it('把旧版通用 OpenWrt 入口识别为 PushBot 专用入口', () => {
    expect(inferLegacyRecipeId('OpenWrt / iStoreOS', 'generic')).toBe('openwrt-istoreos');
    expect(inferLegacyRecipeId('全能推送', 'generic')).toBe('openwrt-istoreos');
    expect(inferLegacyRecipeId('普通 Webhook', 'generic')).toBe('generic');
    expect(inferLegacyRecipeId('OpenWrt', 'lucky')).toBe('lucky');
  });
});
