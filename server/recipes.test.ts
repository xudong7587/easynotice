import { describe, expect, it } from 'vitest';
import { getRecipe, recipes } from './recipes.js';

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
      name: 'OpenWrt / iStoreOS',
      confidence: 'community',
    });
    expect(getRecipe('media-hub')).toMatchObject({
      name: '影视库中枢',
    });
    expect(getRecipe('missing-recipe').id).toBe('generic');
  });
});
