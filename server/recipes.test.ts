import { describe, expect, it } from 'vitest';
import { getRecipe } from './recipes.js';

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
});
