import { useState } from 'react';
import { Check, Clock, Info, Prohibit } from '@phosphor-icons/react';
import type { RecipeWebhookTemplate } from '../types';
import { CopyButton } from './ui';

const supportMeta = {
  native: { label: 'Lucky 原生触发', icon: Check },
  scheduled: { label: '计划任务 / CallWeb', icon: Clock },
  unavailable: { label: '暂无原生回调', icon: Prohibit },
} as const;

export function WebhookTemplatePicker({ templates }: { templates: RecipeWebhookTemplate[] }) {
  const [selectedIds, setSelectedIds] = useState(() => templates
    .filter((template) => template.defaultSelected && template.bodyTemplate)
    .map((template) => template.id));
  const selected = templates.filter((template) => selectedIds.includes(template.id) && template.bodyTemplate);
  const unavailable = templates.filter((template) => template.support === 'unavailable');
  const toggle = (template: RecipeWebhookTemplate) => {
    if (!template.bodyTemplate) return;
    setSelectedIds((current) => current.includes(template.id)
      ? current.filter((id) => id !== template.id)
      : [...current, template.id]);
  };

  return <div className="webhook-template-picker">
    <div className="webhook-template-picker__heading">
      <div><small>通知内容</small><strong>选择要接入的 Lucky 通知</strong></div>
      <p>可以多选；每个场景会生成一段需要粘贴到 Lucky 的 JSON。</p>
    </div>
    <div className="webhook-template-options">{templates.map((template) => {
      const available = Boolean(template.bodyTemplate);
      const checked = selectedIds.includes(template.id);
      const meta = supportMeta[template.support];
      const Icon = meta.icon;
      return <label key={template.id} className={`webhook-template-option ${checked ? 'is-selected' : ''} ${!available ? 'is-disabled' : ''}`}>
        <input type="checkbox" checked={checked} disabled={!available} onChange={() => toggle(template)} />
        <span className="webhook-template-option__icon"><Icon size={17} weight="bold" /></span>
        <span className="webhook-template-option__content">
          <span><strong>{template.name}</strong><small data-support={template.support}>{meta.label}</small></span>
          <em>{template.summary}</em>
        </span>
      </label>;
    })}</div>
    {unavailable.map((template) => template.note ? <div key={template.id} className="webhook-template-limitation"><Prohibit size={17} /><span><strong>{template.name}：</strong>{template.note}</span></div> : null)}
    {!selected.length ? <div className="webhook-template-empty"><Info size={18} /><span>勾选上面的通知场景后，这里会出现可复制的请求体。</span></div> : null}
    <div className="webhook-template-results">{selected.map((template) => <article key={template.id} className="webhook-template-result">
      <div className="webhook-template-result__header">
        <div><small>在 Lucky 中的位置</small><strong>{template.name}</strong><p>{template.location}</p></div>
        <CopyButton value={template.bodyTemplate || ''} />
      </div>
      <pre>{template.bodyTemplate}</pre>
      {template.note ? <p className="webhook-template-result__note"><Info size={15} />{template.note}</p> : null}
    </article>)}</div>
  </div>;
}
