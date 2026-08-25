import { useEffect, useState, type FormEvent } from 'react';
import { Brain, FloppyDisk, HardDrives, Key, LockKey, ShieldCheck } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { api } from '../lib/api';
import { Button, Callout, Field, Input, PageHeader, Skeleton } from '../components/ui';

interface SettingsData {
  appName: string;
  baseUrl: string;
  setupComplete: boolean;
  ai: { configured: boolean; baseUrl: string; model: string; apiKeyHint: string };
}

export function SettingsPage() {
  const [settings, setSettings] = useState<SettingsData>();
  const [appName, setAppName] = useState('EasyNotice');
  const [baseUrl, setBaseUrl] = useState('');
  const [aiBaseUrl, setAiBaseUrl] = useState('https://api.openai.com/v1');
  const [aiModel, setAiModel] = useState('gpt-4.1-mini');
  const [apiKey, setApiKey] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState('');

  const load = () => api<SettingsData>('/api/settings').then((result) => {
    setSettings(result); setAppName(result.appName); setBaseUrl(result.baseUrl); setAiBaseUrl(result.ai.baseUrl); setAiModel(result.ai.model);
  }).catch((error) => toast.error(error.message));
  useEffect(() => { void load(); }, []);

  const saveGeneral = async (event: FormEvent) => {
    event.preventDefault(); setSaving('general');
    try { await api('/api/settings', { method: 'PUT', body: JSON.stringify({ appName, baseUrl }) }); toast.success('基础设置已保存'); load(); }
    catch (error) { toast.error(error instanceof Error ? error.message : '保存失败'); }
    finally { setSaving(''); }
  };
  const saveAi = async (event: FormEvent) => {
    event.preventDefault(); setSaving('ai');
    try { await api('/api/settings', { method: 'PUT', body: JSON.stringify({ ai: { baseUrl: aiBaseUrl, model: aiModel, apiKey } }) }); toast.success('AI 配置已加密保存'); setApiKey(''); load(); }
    catch (error) { toast.error(error instanceof Error ? error.message : '保存失败'); }
    finally { setSaving(''); }
  };
  const changePassword = async (event: FormEvent) => {
    event.preventDefault();
    if (newPassword !== confirmPassword) { toast.error('两次输入的新密码不一致'); return; }
    setSaving('password');
    try { await api('/api/settings/password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) }); toast.success('密码已更新，请重新登录'); window.setTimeout(() => window.location.reload(), 700); }
    catch (error) { toast.error(error instanceof Error ? error.message : '修改失败'); setSaving(''); }
  };

  if (!settings) return <div><PageHeader title="系统设置" /><Skeleton lines={8} /></div>;
  return <div>
    <PageHeader title="系统设置" description="管理访问地址、AI 辅助能力和本地安全设置。" />
    <div className="settings-layout section-block">
      <section className="panel settings-section"><div className="settings-section__head"><span><HardDrives size={22} /></span><div><h2>基础设置</h2><p>决定新生成的 Webhook 地址使用哪个 NAS 地址。</p></div></div><form className="settings-form" onSubmit={saveGeneral}><Field label="应用名称"><Input value={appName} onChange={(event) => setAppName(event.target.value)} /></Field><Field label="其他容器访问 EasyNotice 的地址" hint="不要填写 localhost。请使用 NAS 局域网 IP、域名或反向代理地址。"><Input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder="http://192.168.1.10:18088" /></Field><Callout tone="warning">修改地址只会改变页面上显示的新复制内容。如果 NAS IP 同时变化，原 Docker 中粘贴的地址也要更新。</Callout><Button type="submit" disabled={saving === 'general'}><FloppyDisk size={16} />{saving === 'general' ? '正在保存…' : '保存基础设置'}</Button></form></section>

      <section className="panel settings-section"><div className="settings-section__head"><span><Brain size={22} /></span><div><h2>AI 配置助手</h2><p>可选能力，只分析项目说明和截图，不参与真实通知发送。</p></div></div><form className="settings-form" onSubmit={saveAi}><div className="form-grid form-grid--2"><Field label="OpenAI 兼容接口地址"><Input value={aiBaseUrl} onChange={(event) => setAiBaseUrl(event.target.value)} /></Field><Field label="模型名称"><Input value={aiModel} onChange={(event) => setAiModel(event.target.value)} /></Field></div><Field label="API Key" hint={settings.ai.configured ? `已配置 ${settings.ai.apiKeyHint}，留空表示不修改` : '密钥将使用 AES-256-GCM 加密保存'}><Input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder={settings.ai.configured ? '已保存，输入新 Key 才会替换' : 'sk-...'} required={!settings.ai.configured} /></Field><Callout>截图可能包含敏感信息。上传前请遮住 Token、Cookie、Webhook Key 和公网 IP 等内容。</Callout><Button type="submit" disabled={saving === 'ai'}><Key size={16} />{saving === 'ai' ? '正在保存…' : '保存 AI 配置'}</Button></form></section>

      <section className="panel settings-section"><div className="settings-section__head"><span><LockKey size={22} /></span><div><h2>修改管理密码</h2><p>修改后会让所有已登录设备退出。</p></div></div><form className="settings-form" onSubmit={changePassword}><Field label="当前密码"><Input type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required /></Field><div className="form-grid form-grid--2"><Field label="新密码"><Input type="password" autoComplete="new-password" minLength={8} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required /></Field><Field label="再次输入新密码"><Input type="password" autoComplete="new-password" minLength={8} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required /></Field></div><Button type="submit" variant="secondary" disabled={saving === 'password'}><ShieldCheck size={16} />{saving === 'password' ? '正在更新…' : '更新密码'}</Button></form></section>
    </div>
  </div>;
}
