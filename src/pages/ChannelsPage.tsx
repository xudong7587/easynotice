import { useEffect, useState, type FormEvent } from 'react';
import { Archive, ArrowRight, Check, PaperPlaneTilt, PencilSimple, Plus, TestTube, Trash } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { api } from '../lib/api';
import { formatDate } from '../lib/format';
import type { Channel, ChannelType } from '../types';
import { channelMeta } from '../components/channelMeta';
import { ChannelSetupGuide } from '../components/ChannelSetupGuide';
import { DialogShell } from '../components/DialogShell';
import { Button, Callout, EmptyState, Field, Input, NativeSelect, PageHeader, Skeleton, StatusBadge } from '../components/ui';

const types = Object.keys(channelMeta) as ChannelType[];

function blankConfig(type: ChannelType): Record<string, unknown> {
  if (type === 'wecom_app') return { corpId: '', corpSecret: '', agentId: '', toUser: '@all', toParty: '' };
  if (type === 'wecom_robot') return { webhookUrl: '' };
  if (type === 'telegram') return { botToken: '', chatId: '', apiBase: 'https://api.telegram.org', disableNotification: false };
  return { serverUrl: 'https://api.day.app', deviceKey: '', group: 'EasyNotice', sound: '', level: 'active' };
}

function editConfig(channel: Channel): Record<string, unknown> {
  const config = { ...blankConfig(channel.type), ...channel.config };
  if (channel.type === 'wecom_app') config.corpSecret = '';
  if (channel.type === 'wecom_robot') config.webhookUrl = '';
  if (channel.type === 'telegram') config.botToken = '';
  if (channel.type === 'bark') config.deviceKey = '';
  return config;
}

function ChannelFields({ type, config, setConfig, editing }: { type: ChannelType; config: Record<string, unknown>; setConfig: (value: Record<string, unknown>) => void; editing: boolean }) {
  const set = (key: string, value: unknown) => setConfig({ ...config, [key]: value });
  const secretHint = editing ? '已保存，留空表示不修改' : undefined;
  if (type === 'wecom_robot') return <>
    <Field label="企业微信机器人 Key" hint={secretHint || '只填写机器人 Webhook 中 key= 后面的内容'} required><Input type="password" value={String(config.webhookUrl || '')} onChange={(event) => set('webhookUrl', event.target.value)} placeholder={editing ? '已保存，输入新 Key 才会替换' : '例如 693a91f6-7xxx-4bc4-97a0-0ec2sifa5aaa'} required={!editing} /></Field>
    <Callout title="外部应用只连接 EasyNotice">原应用使用通知入口生成的 EasyNotice 地址，不会看到企微官方地址或机器人 Key。EasyNotice 会自动发送纯文字、本地图片加文字，或公网图片图文卡片。</Callout>
    <Callout>群机器人通常不依赖企业可信 IP，适合放在企微应用后面作为备用渠道。</Callout>
  </>;
  if (type === 'wecom_app') return <>
    <div className="form-grid form-grid--2"><Field label="企业 ID (CorpID)" hint="我的企业 → 企业信息 → 企业 ID" required><Input value={String(config.corpId || '')} onChange={(event) => set('corpId', event.target.value)} placeholder="wwxxxxxxxxxxxxxxxx" /></Field><Field label="应用 AgentId" hint="自建应用详情页中的数字 ID" required><Input inputMode="numeric" value={String(config.agentId || '')} onChange={(event) => set('agentId', event.target.value)} placeholder="1000002" /></Field></div>
    <Field label="应用 Secret" hint={secretHint || '自建应用详情页 → Secret → 查看'} required><Input type="password" value={String(config.corpSecret || '')} onChange={(event) => set('corpSecret', event.target.value)} placeholder={editing ? '已保存，输入新 Secret 才会替换' : '应用 Secret（不要填写通讯录 Secret）'} required={!editing} /></Field>
    <div className="form-grid form-grid--2"><Field label="接收成员" hint="默认 @all，也可填写成员账号并用 | 分隔"><Input value={String(config.toUser || '')} onChange={(event) => set('toUser', event.target.value)} /></Field><Field label="接收部门" hint="可选，多个部门用 | 分隔"><Input value={String(config.toParty || '')} onChange={(event) => set('toParty', event.target.value)} /></Field></div>
    <Callout tone="warning" title="企业可信 IP 在企微后台配置，不填在这里">路径是“应用管理 → 自建应用 → 开发者接口 → 企业可信 IP”。先保存并发送测试；若企微返回错误 60020，错误详情会直接显示需要加入的公网出口 IP。</Callout>
    <Callout title="无需填写回调 URL、Token、EncodingAESKey">这些字段属于“接收消息服务器”，仅用于企业微信向 EasyNotice 推送成员消息或事件。当前出口只主动发送通知，不使用回调，也不需要可信域名或网页授权回调域。</Callout>
  </>;
  if (type === 'telegram') return <>
    <Field label="Bot Token" hint={secretHint || '在官方 @BotFather 发送 /newbot 后获得'} required><Input type="password" value={String(config.botToken || '')} onChange={(event) => set('botToken', event.target.value)} placeholder={editing ? '已保存，输入新 Token 才会替换' : '123456789:AA...'} required={!editing} /></Field>
    <Field label="Chat ID" hint="getUpdates 结果中的 message.chat.id；群组或频道通常带负号" required><Input value={String(config.chatId || '')} onChange={(event) => set('chatId', event.target.value)} placeholder="例如 -1001234567890" /></Field>
    <Field label="API 地址" hint="通常保留默认值；仅填写 API 根地址，不要附加 /bot... 路径"><Input value={String(config.apiBase || '')} onChange={(event) => set('apiBase', event.target.value)} /></Field>
    <label className="check-row"><input type="checkbox" checked={Boolean(config.disableNotification)} onChange={(event) => set('disableNotification', event.target.checked)} /><span><strong>静默发送</strong><small>消息到达时不播放提示音</small></span></label>
  </>;
  const setBarkKey = (value: string) => {
    if (/^https?:\/\//i.test(value.trim())) {
      try {
        const url = new URL(value.trim());
        const [deviceKey] = url.pathname.split('/').filter(Boolean);
        if (deviceKey) {
          setConfig({ ...config, serverUrl: url.origin, deviceKey });
          return;
        }
      } catch {
        // Keep the original input so server-side validation can show a useful error.
      }
    }
    set('deviceKey', value);
  };
  return <>
    <Field label="Bark Key" hint={secretHint || '可只填设备 Key，也可直接粘贴 Bark 首页的完整测试地址'} required><Input type="password" value={String(config.deviceKey || '')} onChange={(event) => setBarkKey(event.target.value)} placeholder={editing ? '已保存，输入新 Key 或完整地址才会替换' : '设备 Key 或 https://api.day.app/设备Key/测试'} required={!editing} /></Field>
    <Field label="Bark 服务器" hint="使用官方服务可保留默认值；也支持自建 Bark Server"><Input value={String(config.serverUrl || '')} onChange={(event) => set('serverUrl', event.target.value)} /></Field>
    <div className="form-grid form-grid--2"><Field label="通知分组" hint="相同分组会在 Bark 中归类显示"><Input value={String(config.group || '')} onChange={(event) => set('group', event.target.value)} /></Field><Field label="通知铃声（可选）" hint="填写 Bark 铃声名，例如 minuet"><Input value={String(config.sound || '')} onChange={(event) => set('sound', event.target.value)} placeholder="默认铃声" /></Field></div>
    <Field label="时效级别"><NativeSelect value={String(config.level || 'active')} onChange={(event) => set('level', event.target.value)}><option value="active">普通：立即亮屏并显示</option><option value="timeSensitive">时效通知：可穿过专注模式</option><option value="passive">静默：只进入通知中心</option></NativeSelect></Field>
    <Callout>Bark 是 iPhone 推送工具。EasyNotice 会把标题、正文、分组、链接和远程图片图标一起发送过去。</Callout>
  </>;
}

export function ChannelsPage() {
  const [channels, setChannels] = useState<Channel[]>();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Channel>();
  const [type, setType] = useState<ChannelType>('wecom_robot');
  const [name, setName] = useState('企业微信群机器人');
  const [config, setConfig] = useState<Record<string, unknown>>(blankConfig('wecom_robot'));
  const [saving, setSaving] = useState(false);

  const load = () => api<{ channels: Channel[] }>('/api/channels').then((result) => setChannels(result.channels)).catch((error) => toast.error(error.message));
  useEffect(() => { void load(); }, []);

  const startCreate = () => {
    setEditing(undefined); setType('wecom_robot'); setName('企业微信群机器人'); setConfig(blankConfig('wecom_robot')); setOpen(true);
  };
  const startEdit = (channel: Channel) => {
    setEditing(channel); setType(channel.type); setName(channel.name); setConfig(editConfig(channel)); setOpen(true);
  };
  const chooseType = (value: ChannelType) => {
    setType(value); setName(channelMeta[value].name); setConfig(blankConfig(value));
  };
  const save = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true);
    try {
      const path = editing ? `/api/channels/${editing.id}` : '/api/channels';
      await api(path, { method: editing ? 'PUT' : 'POST', body: JSON.stringify({ name, type, config, enabled: true }) });
      toast.success(editing ? '渠道设置已保存' : '通知出口已添加'); setOpen(false); load();
    } catch (error) { toast.error(error instanceof Error ? error.message : '保存失败'); }
    finally { setSaving(false); }
  };
  const test = async (channel: Channel) => {
    const toastId = toast.loading(`正在测试 ${channel.name}`);
    try { const result = await api<{ durationMs: number }>(`/api/channels/${channel.id}/test`, { method: 'POST', body: '{}' }); toast.success(`测试消息已发送，用时 ${result.durationMs} ms`, { id: toastId }); load(); }
    catch (error) { toast.error(error instanceof Error ? error.message : '测试失败', { id: toastId }); load(); }
  };
  const archive = async (channel: Channel) => {
    if (!window.confirm(`停用“${channel.name}”？它会从所有通知路由中移除。`)) return;
    await api(`/api/channels/${channel.id}`, { method: 'DELETE' }); toast.success('通知出口已停用'); load();
  };
  const remove = async (channel: Channel) => {
    if (!window.confirm(`永久删除“${channel.name}”？相关投递明细也会一并删除，此操作无法恢复。`)) return;
    await api(`/api/channels/${channel.id}/permanent`, { method: 'DELETE' }); toast.success('通知出口已永久删除'); load();
  };

  return <div>
    <PageHeader title="通知出口" description="消息最终发送到哪里。先测试单个出口，再为入口设置主备顺序。" action={<Button onClick={startCreate}><Plus size={17} />添加通知出口</Button>} />
    <Callout title="推荐的补位方式">企业微信应用放第一位，企业微信群机器人放第二位。应用因可信 IP 失败后，EasyNotice 会自动尝试机器人。</Callout>
    {!channels ? <Skeleton lines={5} /> : channels.length ? <div className="channel-grid section-block">{channels.map((channel) => {
      const meta = channelMeta[channel.type]; const Icon = meta.icon;
      return <article className={`channel-card ${!channel.enabled ? 'is-disabled' : ''}`} key={channel.id}>
        <div className="channel-card__top"><span className="channel-logo channel-logo--large"><Icon size={25} weight="duotone" /></span><StatusBadge status={channel.enabled ? channel.lastStatus : 'archived'} /></div>
        <h2>{channel.name}</h2><p>{meta.description}</p>
        <dl className="channel-card__facts"><div><dt>渠道类型</dt><dd>{meta.short}</dd></div><div><dt>最近成功</dt><dd>{channel.lastSuccessAt ? formatDate(channel.lastSuccessAt) : '尚未测试'}</dd></div></dl>
        {channel.lastError ? <div className="inline-error">{channel.lastError}</div> : null}
        <div className="channel-card__actions"><Button variant="secondary" size="sm" onClick={() => test(channel)} disabled={!channel.enabled}><TestTube size={16} />发送测试</Button><Button variant="quiet" size="sm" onClick={() => startEdit(channel)}><PencilSimple size={16} />编辑</Button>{channel.enabled ? <Button variant="quiet" size="sm" onClick={() => archive(channel)}><Archive size={16} />停用</Button> : <Button variant="quiet" size="sm" onClick={() => remove(channel)}><Trash size={16} />删除</Button>}</div>
      </article>;
    })}</div> : <EmptyState icon={<PaperPlaneTilt size={34} />} title="还没有通知出口" description="从企业微信群机器人或 Bark 开始最简单，配置后先发送一条测试消息。" action={<Button onClick={startCreate}><Plus size={17} />添加第一个出口</Button>} />}

    <DialogShell open={open} onOpenChange={setOpen} title={editing ? '编辑通知出口' : '添加通知出口'} description="密钥会在服务端加密保存，保存后不会在页面中明文显示。" size="lg" footer={<><Button variant="secondary" onClick={() => setOpen(false)}>取消</Button><Button type="submit" form="channel-form" disabled={saving}>{saving ? '正在保存…' : '保存出口'}<ArrowRight size={16} /></Button></>}>
      <form id="channel-form" className="dialog-form" onSubmit={save}>
        {!editing ? <div className="channel-type-picker">{types.map((value) => { const meta = channelMeta[value]; const Icon = meta.icon; return <button type="button" key={value} className={`channel-type-option ${type === value ? 'is-selected' : ''}`} onClick={() => chooseType(value)}><Icon size={23} weight="duotone" /><span><strong>{meta.short}</strong><small>{meta.description}</small></span>{type === value ? <Check size={18} weight="bold" /> : null}</button>; })}</div> : null}
        <ChannelSetupGuide type={type} />
        <Field label="渠道名称" required><Input value={name} onChange={(event) => setName(event.target.value)} /></Field>
        <ChannelFields type={type} config={config} setConfig={setConfig} editing={Boolean(editing)} />
      </form>
    </DialogShell>
  </div>;
}
