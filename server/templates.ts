import { getByPath } from './normalize.js';
import type { NormalizedNotice, NoticeDefaults, RuleRow } from './types.js';

export function renderTemplate(template: string, context: Record<string, unknown>): string {
  return template.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_match, path: string) => {
    const value = getByPath(context, path);
    if (value === null || value === undefined) return '';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  });
}

function fieldValue(rule: RuleRow, notice: NormalizedNotice): string {
  if (rule.match_field === 'always') return '';
  if (rule.match_field === 'any') {
    return `${notice.title}\n${notice.body}\n${notice.eventType}\n${notice.severity}\n${JSON.stringify(notice.raw)}`;
  }
  return String(notice[rule.match_field] ?? '');
}

export function ruleMatches(rule: RuleRow, notice: NormalizedNotice): boolean {
  if (!rule.enabled) return false;
  if (rule.match_operator === 'always' || rule.match_field === 'always') return true;

  const haystack = fieldValue(rule, notice).slice(0, 20_000);
  const needle = rule.match_value.slice(0, 240);
  if (!needle) return false;

  if (rule.match_operator === 'equals') return haystack.localeCompare(needle, undefined, { sensitivity: 'accent' }) === 0;
  if (rule.match_operator === 'contains') return haystack.toLocaleLowerCase().includes(needle.toLocaleLowerCase());
  if (rule.match_operator === 'regex') {
    try {
      return new RegExp(needle, 'i').test(haystack);
    } catch {
      return false;
    }
  }
  return false;
}

export function applyFirstRule(notice: NormalizedNotice, rules: RuleRow[], defaults: NoticeDefaults = {}): {
  notice: NormalizedNotice;
  matchedRule?: RuleRow;
  imageAssetId?: string;
} {
  const matchedRule = rules.find((rule) => ruleMatches(rule, notice));
  if (!matchedRule) return {
    notice: {
      ...notice,
      imageUrl: notice.imageUrl || defaults.imageUrl,
      linkUrl: defaults.linkUrl || notice.linkUrl,
    },
    imageAssetId: notice.imageUrl ? undefined : defaults.imageAssetId,
  };

  const context: Record<string, unknown> = {
    ...notice.raw,
    notice,
    title: notice.title,
    body: notice.body,
    eventType: notice.eventType,
    severity: notice.severity,
  };

  return {
    notice: {
      ...notice,
      title: matchedRule.title_template
        ? renderTemplate(matchedRule.title_template, context).trim() || notice.title
        : notice.title,
      body: matchedRule.body_template
        ? renderTemplate(matchedRule.body_template, context).trim() || notice.body
        : notice.body,
      imageUrl: matchedRule.image_url || notice.imageUrl || defaults.imageUrl,
      linkUrl: matchedRule.link_template
        ? renderTemplate(matchedRule.link_template, context).trim() || defaults.linkUrl || notice.linkUrl
        : defaults.linkUrl || notice.linkUrl,
    },
    matchedRule,
    imageAssetId: matchedRule.image_asset_id || (matchedRule.image_url || notice.imageUrl ? undefined : defaults.imageAssetId),
  };
}
