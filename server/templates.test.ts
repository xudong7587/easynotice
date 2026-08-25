import { describe, expect, it } from 'vitest';
import { applyFirstRule, renderTemplate, ruleMatches } from './templates.js';
import type { NormalizedNotice, RuleRow } from './types.js';

const notice: NormalizedNotice = {
  title: '刮削失败',
  body: '网络超时',
  eventType: 'failed',
  severity: 'error',
  raw: { data: { number: 'ABP-123' } },
};

function rule(overrides: Partial<RuleRow> = {}): RuleRow {
  return {
    id: 'rule-1', source_id: 'source-1', name: '失败样式', enabled: 1, priority: 0,
    match_field: 'eventType', match_operator: 'equals', match_value: 'failed',
    title_template: '[失败] {{ title }}', body_template: '{{ body }} / {{ data.number }}',
    image_url: 'https://example.com/failed.png', image_asset_id: null, link_template: null,
    ...overrides,
  };
}

describe('notification rules', () => {
  it('renders nested paths without evaluating code', () => {
    expect(renderTemplate('{{ data.number }} {{ missing }}', notice.raw)).toBe('ABP-123 ');
  });

  it('matches event types and severity', () => {
    expect(ruleMatches(rule(), notice)).toBe(true);
    expect(ruleMatches(rule({ match_field: 'severity', match_value: 'warning' }), notice)).toBe(false);
  });

  it('applies only the first matching rule', () => {
    const result = applyFirstRule(notice, [rule(), rule({ id: 'rule-2', title_template: '不应生效' })]);
    expect(result.matchedRule?.id).toBe('rule-1');
    expect(result.notice.title).toBe('[失败] 刮削失败');
    expect(result.notice.body).toBe('网络超时 / ABP-123');
    expect(result.notice.imageUrl).toBe('https://example.com/failed.png');
  });

  it('ignores invalid regular expressions', () => {
    expect(ruleMatches(rule({ match_operator: 'regex', match_value: '[' }), notice)).toBe(false);
  });
});
