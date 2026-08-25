import { useState, type FormEvent } from 'react';
import { BellRinging, Check, LockKey, ShieldCheck } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { api } from '../lib/api';
import { Button, Callout, Field, Input } from '../components/ui';

function AuthFrame({ children, eyebrow, title, description }: { children: React.ReactNode; eyebrow: string; title: string; description: string }) {
  return (
    <div className="auth-layout">
      <section className="auth-story">
        <div className="brand brand--large"><span className="brand__mark"><BellRinging size={24} weight="fill" /></span><strong>EasyNotice</strong></div>
        <div className="auth-story__content">
          <span className="auth-eyebrow">{eyebrow}</span>
          <h1>{title}</h1>
          <p>{description}</p>
          <ul className="auth-benefits">
            <li><Check weight="bold" />一个地址接住 NAS 中的通知</li>
            <li><Check weight="bold" />主渠道失败时自动启用备用渠道</li>
            <li><Check weight="bold" />配置和密钥只保存在你的 NAS</li>
          </ul>
        </div>
        <small>数据默认仅保存在本机挂载目录</small>
      </section>
      <section className="auth-panel">{children}</section>
    </div>
  );
}

export function SetupPage({ onDone }: { onDone: () => void }) {
  const detectedBase = window.location.port === '5173'
    ? `${window.location.protocol}//${window.location.hostname}:18088`
    : window.location.origin;
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [baseUrl, setBaseUrl] = useState(detectedBase);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (password !== confirm) {
      toast.error('两次输入的密码不一致');
      return;
    }
    setSubmitting(true);
    try {
      await api('/api/setup', { method: 'POST', body: JSON.stringify({ password, baseUrl }) });
      toast.success('EasyNotice 初始化完成');
      onDone();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '初始化失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthFrame eyebrow="首次启动" title="先保护好你的通知中枢" description="设置管理密码和 NAS 访问地址，之后所有密钥都会加密保存。">
      <form className="auth-form" onSubmit={submit}>
        <div className="auth-form__heading"><ShieldCheck size={28} weight="duotone" /><div><h2>创建管理员</h2><p>只需要完成一次</p></div></div>
        <Field label="管理密码" hint="至少 8 位，建议与 NAS 登录密码不同" required><Input type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={8} /></Field>
        <Field label="再次输入密码" required><Input type="password" autoComplete="new-password" value={confirm} onChange={(event) => setConfirm(event.target.value)} required minLength={8} /></Field>
        <Field label="EasyNotice 访问地址" hint="其他容器会用这个地址发送通知，请填写它们能够访问的 NAS 地址"><Input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder="http://192.168.1.10:18088" /></Field>
        <Callout>以后可以在系统设置中修改访问地址，不会影响已有通知记录。</Callout>
        <Button type="submit" disabled={submitting}>{submitting ? '正在初始化…' : '保存并开始配置'}</Button>
      </form>
    </AuthFrame>
  );
}

export function LoginPage({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ password }) });
      onDone();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '登录失败');
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <AuthFrame eyebrow="欢迎回来" title="你的通知，仍由自己掌控" description="登录后查看入口状态、失败原因和最近的投递记录。">
      <form className="auth-form" onSubmit={submit}>
        <div className="auth-form__heading"><LockKey size={28} weight="duotone" /><div><h2>登录 EasyNotice</h2><p>输入初始化时设置的密码</p></div></div>
        <Field label="管理密码" required><Input autoFocus type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></Field>
        <Button type="submit" disabled={submitting}>{submitting ? '正在登录…' : '登录'}</Button>
      </form>
    </AuthFrame>
  );
}
