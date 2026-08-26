import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react';
import { CheckCircle, Copy, Info, WarningCircle, XCircle } from '@phosphor-icons/react';
import { toast } from 'sonner';

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'quiet' | 'danger'; size?: 'sm' | 'md' }) {
  return <button className={`button button--${variant} button--${size} ${className}`} {...props} />;
}

export function IconButton({ label, className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return <button className={`icon-button ${className}`} aria-label={label} title={label} {...props} />;
}

export function Field({
  label,
  hint,
  error,
  required,
  children,
}: { label: string; hint?: ReactNode; error?: string; required?: boolean; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field__label">{label}{required ? <span aria-hidden="true"> *</span> : null}</span>
      {children}
      {error ? <span className="field__error">{error}</span> : hint ? <span className="field__hint">{hint}</span> : null}
    </label>
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`input ${props.className || ''}`} {...props} />;
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`textarea ${props.className || ''}`} {...props} />;
}

export function NativeSelect(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={`select ${props.className || ''}`} {...props} />;
}

export function PageHeader({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <header className="page-header">
      <div>
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
      {action ? <div className="page-header__action">{action}</div> : null}
    </header>
  );
}

const statusMap: Record<string, { label: string; tone: string }> = {
  success: { label: '已送达', tone: 'success' },
  partial: { label: '备用送达', tone: 'warning' },
  failed: { label: '发送失败', tone: 'danger' },
  pending: { label: '等待发送', tone: 'neutral' },
  processing: { label: '正在发送', tone: 'info' },
  untested: { label: '尚未验证', tone: 'neutral' },
  archived: { label: '已停用', tone: 'neutral' },
  skipped: { label: '未启用备用', tone: 'neutral' },
  sending: { label: '正在发送', tone: 'info' },
};

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  const value = statusMap[status] || { label: status, tone: 'neutral' };
  return <span className={`status status--${value.tone}`}>{label || value.label}</span>;
}

export function SeverityIcon({ severity, size = 18 }: { severity: string; size?: number }) {
  if (severity === 'error') return <XCircle size={size} weight="fill" className="tone-danger" />;
  if (severity === 'warning') return <WarningCircle size={size} weight="fill" className="tone-warning" />;
  if (severity === 'success') return <CheckCircle size={size} weight="fill" className="tone-success" />;
  return <Info size={size} weight="fill" className="tone-info" />;
}

export function CopyButton({ value, label = '复制' }: { value: string; label?: string }) {
  const copy = async () => {
    await navigator.clipboard.writeText(value);
    toast.success('已复制到剪贴板');
  };
  return <Button type="button" variant="secondary" size="sm" onClick={copy}><Copy size={16} />{label}</Button>;
}

export function EmptyState({ icon, title, description, action }: { icon: ReactNode; title: string; description: string; action?: ReactNode }) {
  return (
    <div className="empty-state">
      <div className="empty-state__icon">{icon}</div>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}

export function Skeleton({ lines = 3 }: { lines?: number }) {
  return <div className="skeleton" aria-label="正在加载">{Array.from({ length: lines }, (_, index) => <span key={index} />)}</div>;
}

export function Callout({ tone = 'info', title, children }: { tone?: 'info' | 'warning' | 'success' | 'danger'; title?: string; children: ReactNode }) {
  const Icon = tone === 'success' ? CheckCircle : tone === 'warning' ? WarningCircle : tone === 'danger' ? XCircle : Info;
  return (
    <div className={`callout callout--${tone}`}>
      <Icon size={20} weight="fill" />
      <div>{title ? <strong>{title}</strong> : null}<div>{children}</div></div>
    </div>
  );
}
