import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  ChatText,
  Check,
  FloppyDisk,
  ImageSquare,
  MagicWand,
  PencilSimple,
  Plus,
  Repeat,
  TestTube,
  Trash,
} from '@phosphor-icons/react';
import { toast } from 'sonner';
import { api } from '../lib/api';
import { formatBytes, timeAgo } from '../lib/format';
import type { Asset, Channel, NoticeRule, Recipe, RouteMode, Source } from '../types';
import { channelMeta } from '../components/channelMeta';
import { DialogShell } from '../components/DialogShell';
import { Button, Callout, Field, Input, NativeSelect, PageHeader, Skeleton, StatusBadge, Textarea } from '../components/ui';
import { EndpointBlock } from '../components/EndpointBlock';
import { UgreenCollectorPanel } from '../components/UgreenCollectorPanel';

interface RuleDraft {
  name: string;
  enabled: boolean;
  priority: number;
  matchField: NoticeRule['matchField'];
  matchOperator: NoticeRule['matchOperator'];
  matchValue: string;
  titleTemplate: string;
  bodyTemplate: string;
  imageUrl: string;
  imageAssetId: string;
  linkTemplate: string;
}

function emptyRule(priority: number): RuleDraft {
  return { name: '新的通知样式', enabled: true, priority, matchField: 'any', matchOperator: 'contains', matchValue: '', titleTemplate: '', bodyTemplate: '', imageUrl: '', imageAssetId: '', linkTemplate: '' };
}

export function SourceDetailPage() {
  const { id = '' } = useParams();
  const [source, setSource] = useState<Source>();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [rules, setRules] = useState<NoticeRule[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [routeIds, setRouteIds] = useState<string[]>([]);
  const [routeMode, setRouteMode] = useState<RouteMode>('failover');
  const [savingRoute, setSavingRoute] = useState(false);
  const [testingChannelId, setTestingChannelId] = useState<string>();
  const [ruleOpen, setRuleOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<NoticeRule>();
  const [ruleDraft, setRuleDraft] = useState<RuleDraft>(emptyRule(0));
  const [savingRule, setSavingRule] = useState(false);
  const [uploading, setUploading] = useState(false);

  const load = async () => {
    try {
      const [sourceResult, channelResult, recipeResult, ruleResult, assetResult] = await Promise.all([
        api<{ source: Source }>(`/api/sources/${id}`),
        api<{ channels: Channel[] }>('/api/channels'),
        api<{ recipes: Recipe[] }>('/api/recipes'),
        api<{ rules: NoticeRule[] }>(`/api/rules?sourceId=${encodeURIComponent(id)}`),
        api<{ assets: Asset[] }>('/api/assets'),
      ]);
      setSource(sourceResult.source); setRouteIds(sourceResult.source.channelIds); setRouteMode(sourceResult.source.routeMode);
      setChannels(channelResult.channels.filter((channel) => channel.enabled)); setRecipes(recipeResult.recipes); setRules(ruleResult.rules); setAssets(assetResult.assets);
    } catch (error) { toast.error(error instanceof Error ? error.message : '加载入口失败'); }
  };
  useEffect(() => { void load(); }, [id]);

  if (!source) return <div><PageHeader title="通知入口" /><Skeleton lines={8} /></div>;
  const recipe = recipes.find((item) => item.id === source.recipeId);

  const move = (channelId: string, direction: -1 | 1) => {
    setRouteIds((current) => {
      const index = current.indexOf(channelId); const next = index + direction;
      if (index < 0 || next < 0 || next >= current.length) return current;
      const copy = [...current]; [copy[index], copy[next]] = [copy[next], copy[index]]; return copy;
    });
  };
  const toggle = (channelId: string) => setRouteIds((current) => current.includes(channelId) ? current.filter((item) => item !== channelId) : [...current, channelId]);
  const saveRoute = async () => {
    setSavingRoute(true);
    try { const result = await api<{ source: Source }>(`/api/sources/${id}`, { method: 'PUT', body: JSON.stringify({ routeMode, channelIds: routeIds }) }); setSource(result.source); toast.success('出口设置已保存'); }
    catch (error) { toast.error(error instanceof Error ? error.message : '保存失败'); }
    finally { setSavingRoute(false); }
  };
  const test = async () => {
    const toastId = toast.loading('正在生成一条测试预览');
    try { await api(`/api/sources/${id}/test`, { method: 'POST', body: '{}' }); toast.success('测试预览已进入发送队列', { id: toastId }); }
    catch (error) { toast.error(error instanceof Error ? error.message : '测试失败', { id: toastId }); }
  };
  const testChannel = async (channel: Channel) => {
    setTestingChannelId(channel.id);
    const previewKind = channel.type === 'wecom_robot' ? '文字预览' : '图文预览';
    const toastId = toast.loading(`正在通过 ${channel.name} 发送${previewKind}`);
    try {
      const result = await api<{ durationMs: number; preview: { title: string } }>(`/api/channels/${channel.id}/test`, { method: 'POST', body: JSON.stringify({ sourceId: source.id }) });
      toast.success(`${channel.name} 已发送“${result.preview.title}”，用时 ${result.durationMs} ms`, { id: toastId });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '消息预览发送失败', { id: toastId });
    } finally {
      setTestingChannelId(undefined);
    }
  };
  const regenerate = async () => {
    if (!window.confirm('重新生成后，原接口地址会立即失效。确定继续吗？')) return;
    const result = await api<{ source: Source }>(`/api/sources/${id}/regenerate-token`, { method: 'POST' }); setSource(result.source); toast.success('接口地址已经更新');
  };
  const openNewRule = () => { setEditingRule(undefined); setRuleDraft(emptyRule(rules.length * 10)); setRuleOpen(true); };
  const openEditRule = (rule: NoticeRule) => { setEditingRule(rule); setRuleDraft({ name: rule.name, enabled: rule.enabled, priority: rule.priority, matchField: rule.matchField, matchOperator: rule.matchOperator, matchValue: rule.matchValue, titleTemplate: rule.titleTemplate, bodyTemplate: rule.bodyTemplate, imageUrl: rule.imageUrl, imageAssetId: rule.imageAssetId, linkTemplate: rule.linkTemplate }); setRuleOpen(true); };
  const saveRule = async (event: FormEvent) => {
    event.preventDefault(); setSavingRule(true);
    try {
      await api(editingRule ? `/api/rules/${editingRule.id}` : '/api/rules', { method: editingRule ? 'PUT' : 'POST', body: JSON.stringify({ sourceId: id, ...ruleDraft }) });
      toast.success(editingRule ? '通知样式已更新' : '通知样式已添加'); setRuleOpen(false); await load();
    } catch (error) { toast.error(error instanceof Error ? error.message : '保存规则失败'); }
    finally { setSavingRule(false); }
  };
  const removeRule = async (rule: NoticeRule) => {
    if (!window.confirm(`删除“${rule.name}”？已经产生的通知记录不会受影响。`)) return;
    await api(`/api/rules/${rule.id}`, { method: 'DELETE' }); toast.success('规则已删除'); await load();
  };
  const upload = async (file?: File) => {
    if (!file) return; setUploading(true);
    try { const body = new FormData(); body.set('image', file); const result = await api<{ asset: Asset }>('/api/assets', { method: 'POST', body }); setAssets((current) => [result.asset, ...current]); setRuleDraft((current) => ({ ...current, imageAssetId: result.asset.id, imageUrl: '' })); toast.success('图片已上传'); }
    catch (error) { toast.error(error instanceof Error ? error.message : '上传失败'); }
    finally { setUploading(false); }
  };

  return <div>
    <Link to="/sources" className="back-link"><ArrowLeft size={16} />返回通知入口</Link>
    <PageHeader title={source.name} description={`${recipe?.name || '通用 Webhook'} · ${source.collector?.lastCheckedAt ? `最近检查于 ${timeAgo(source.collector.lastCheckedAt)}` : source.lastReceivedAt ? `最近收到于 ${timeAgo(source.lastReceivedAt)}` : '等待第一条真实通知'}`} action={<Button variant="secondary" onClick={test}><TestTube size={17} />整链路测试预览</Button>} />

    <div className="detail-layout">
      <div className="detail-main">
        {source.collector ? <UgreenCollectorPanel source={source} onUpdated={(collector) => setSource({ ...source, collector })} /> : <section className="panel section-block">
          <div className="panel__header"><div><h2>{recipe?.setupMode === 'openwrt-pushbot' ? '复制整段 PushBot 配置' : '复制到原应用'}</h2><p>{recipe?.setupMode === 'openwrt-pushbot' ? '在 OpenWrt 中完整粘贴一次，不需要分别填写地址、请求头和请求体。' : '按照下面四项填写即可，不需要自行拼接参数。'}</p></div><StatusBadge status={source.lastReceivedAt ? 'success' : 'untested'} label={source.lastReceivedAt ? '入口正常' : '等待测试'} /></div>
          <EndpointBlock source={source} recipe={recipe} />
          {recipe ? <div className="setup-steps setup-steps--compact"><h3>{recipe.name} 配置说明</h3>{recipe.steps.map((item, index) => <div key={item}><span>{index + 1}</span><p>{item}</p></div>)}{recipe.tips.map((tip) => <Callout key={tip}>{tip}</Callout>)}</div> : null}
          <div className="panel__footer"><Button variant="quiet" size="sm" onClick={regenerate}><Repeat size={16} />更换接口密钥</Button></div>
        </section>}

        <section className="panel section-block">
          <div className="panel__header"><div><h2>不同通知使用不同图片</h2><p>按标题、正文或事件类型匹配。第一条命中的规则生效。</p></div><Button size="sm" onClick={openNewRule}><Plus size={16} />添加样式规则</Button></div>
          {rules.length ? <div className="rule-list">{rules.map((rule) => <div className="rule-row" key={rule.id}>
            <div className="rule-row__image">{rule.assetUrl || rule.imageUrl ? <img src={rule.assetUrl || rule.imageUrl} alt={`${rule.name} 的通知图片`} /> : <MagicWand size={22} />}</div>
            <div className="rule-row__content"><div><strong>{rule.name}</strong><StatusBadge status={rule.enabled ? 'success' : 'archived'} label={rule.enabled ? '启用' : '停用'} /></div><p>{rule.matchField === 'always' ? '匹配所有通知' : `${rule.matchField} ${rule.matchOperator} “${rule.matchValue}”`}</p>{rule.titleTemplate || rule.bodyTemplate ? <small>已自定义标题或正文模板</small> : null}</div>
            <div className="rule-row__actions"><Button variant="quiet" size="sm" onClick={() => openEditRule(rule)}><PencilSimple size={16} />编辑</Button><Button variant="quiet" size="sm" onClick={() => removeRule(rule)}><Trash size={16} />删除</Button></div>
          </div>)}</div> : <div className="panel-empty panel-empty--roomy"><MagicWand size={30} /><p>目前直接使用来源自带的标题、正文和图片。添加规则后，可以让成功、失败等通知一眼可辨。</p><Button variant="secondary" size="sm" onClick={openNewRule}><Plus size={16} />添加第一条规则</Button></div>}
        </section>
      </div>

      <aside className="detail-aside">
        <section className="panel route-editor">
          <div className="panel__header"><div><h2>出口设置</h2><p>勾选通知要发往的出口</p></div></div>
          <div className="segmented"><button type="button" className={routeMode === 'failover' ? 'is-active' : ''} onClick={() => setRouteMode('failover')}>失败后按顺序补位</button><button type="button" className={routeMode === 'broadcast' ? 'is-active' : ''} onClick={() => setRouteMode('broadcast')}>每个出口都发送</button></div>
          <div className="route-editor__list">{channels.map((channel) => { const selected = routeIds.includes(channel.id); const index = routeIds.indexOf(channel.id); const meta = channelMeta[channel.type]; const Icon = meta.icon; const PreviewIcon = channel.type === 'wecom_robot' ? ChatText : ImageSquare; const previewKind = channel.type === 'wecom_robot' ? '文字预览' : '图文预览'; return <div className={`route-editor__row ${selected ? 'is-selected' : ''}`} key={channel.id}>
            <label><input type="checkbox" checked={selected} onChange={() => toggle(channel.id)} /><span className="channel-logo"><Icon size={18} /></span><span><strong>{channel.name}</strong><small>{selected && routeMode === 'failover' ? `顺位 ${index + 1}` : meta.short}</small></span></label>
            <div className="route-editor__actions"><button type="button" className="route-editor__test" onClick={() => void testChannel(channel)} disabled={testingChannelId === channel.id} aria-label={`通过 ${channel.name} 发送${previewKind}`}><PreviewIcon size={14} /><span>{testingChannelId === channel.id ? '发送中' : '预览'}</span></button>{selected && routeMode === 'failover' ? <div className="route-editor__moves"><button type="button" onClick={() => move(channel.id, -1)} disabled={index === 0} aria-label="上移"><ArrowUp size={15} /></button><button type="button" onClick={() => move(channel.id, 1)} disabled={index === routeIds.length - 1} aria-label="下移"><ArrowDown size={15} /></button></div> : null}</div>
          </div>; })}</div>
          {routeMode === 'failover' && routeIds.length > 1 ? <Callout title="当前发送顺序">先尝试 {routeIds.map((channelId) => channels.find((channel) => channel.id === channelId)?.name).filter(Boolean).join('；失败后再尝试 ')}</Callout> : null}
          <Button onClick={saveRoute} disabled={savingRoute}><FloppyDisk size={16} />{savingRoute ? '正在保存…' : '保存出口设置'}</Button>
        </section>
      </aside>
    </div>

    <DialogShell open={ruleOpen} onOpenChange={setRuleOpen} title={editingRule ? '编辑通知样式' : '添加通知样式'} description="规则从上到下匹配，第一条符合条件的规则会决定最终标题、正文和图片。" size="lg" footer={<><Button variant="secondary" onClick={() => setRuleOpen(false)}>取消</Button><Button type="submit" form="rule-form" disabled={savingRule}>{savingRule ? '正在保存…' : '保存规则'}</Button></>}>
      <form id="rule-form" className="dialog-form" onSubmit={saveRule}>
        <div className="form-grid form-grid--2"><Field label="规则名称" required><Input value={ruleDraft.name} onChange={(event) => setRuleDraft({ ...ruleDraft, name: event.target.value })} /></Field><Field label="优先级" hint="数字越小越先匹配"><Input type="number" min={0} value={ruleDraft.priority} onChange={(event) => setRuleDraft({ ...ruleDraft, priority: Number(event.target.value) })} /></Field></div>
        <label className="check-row"><input type="checkbox" checked={ruleDraft.enabled} onChange={(event) => setRuleDraft({ ...ruleDraft, enabled: event.target.checked })} /><span><strong>启用这条规则</strong><small>停用后不会参与匹配，但配置会保留</small></span></label>
        <fieldset className="field-group"><legend>什么时候使用</legend><div className="form-grid form-grid--3"><Field label="检查字段"><NativeSelect value={ruleDraft.matchField} onChange={(event) => setRuleDraft({ ...ruleDraft, matchField: event.target.value as RuleDraft['matchField'], matchOperator: event.target.value === 'always' ? 'always' : ruleDraft.matchOperator === 'always' ? 'contains' : ruleDraft.matchOperator })}><option value="any">标题或正文任意位置</option><option value="title">标题</option><option value="body">正文</option><option value="eventType">事件类型</option><option value="severity">严重级别</option><option value="always">所有通知</option></NativeSelect></Field><Field label="条件"><NativeSelect disabled={ruleDraft.matchField === 'always'} value={ruleDraft.matchOperator} onChange={(event) => setRuleDraft({ ...ruleDraft, matchOperator: event.target.value as RuleDraft['matchOperator'] })}><option value="contains">包含</option><option value="equals">等于</option><option value="regex">正则表达式</option><option value="always">总是</option></NativeSelect></Field><Field label="匹配内容" hint={ruleDraft.matchField === 'severity' ? 'info / success / warning / error' : undefined}><Input disabled={ruleDraft.matchField === 'always'} value={ruleDraft.matchValue} onChange={(event) => setRuleDraft({ ...ruleDraft, matchValue: event.target.value })} placeholder="例如：failed 或 IP更新" /></Field></div></fieldset>
        <fieldset className="field-group"><legend>通知内容（可选）</legend><Field label="标题模板" hint="留空沿用原标题。可以使用 {{ title }}、{{ eventType }} 或原始 JSON 字段"><Input value={ruleDraft.titleTemplate} onChange={(event) => setRuleDraft({ ...ruleDraft, titleTemplate: event.target.value })} placeholder="例如：[失败] {{ title }}" /></Field><Field label="正文模板" hint="留空沿用原正文"><Textarea rows={3} value={ruleDraft.bodyTemplate} onChange={(event) => setRuleDraft({ ...ruleDraft, bodyTemplate: event.target.value })} placeholder="{{ body }}" /></Field><Field label="点击链接模板"><Input value={ruleDraft.linkTemplate} onChange={(event) => setRuleDraft({ ...ruleDraft, linkTemplate: event.target.value })} placeholder="https://example.com/detail/{{ id }}" /></Field></fieldset>
        <fieldset className="field-group"><legend>通知图片</legend><div className="image-choice"><label className="upload-tile"><input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(event) => void upload(event.target.files?.[0])} /><ImageSquare size={25} /><strong>{uploading ? '正在上传…' : '上传新图片'}</strong><small>企微图片建议不超过 2 MB</small></label>{assets.map((asset) => <button type="button" key={asset.id} className={`asset-choice ${ruleDraft.imageAssetId === asset.id ? 'is-selected' : ''}`} onClick={() => setRuleDraft({ ...ruleDraft, imageAssetId: asset.id, imageUrl: '' })}><img src={asset.url} alt={asset.name} />{ruleDraft.imageAssetId === asset.id ? <span><Check size={15} weight="bold" /></span> : null}<small>{formatBytes(asset.size)}</small></button>)}</div><Field label="或者使用公网图片地址" hint="Telegram、Bark 和企微图文会直接使用这个地址"><Input value={ruleDraft.imageUrl} onChange={(event) => setRuleDraft({ ...ruleDraft, imageUrl: event.target.value, imageAssetId: event.target.value ? '' : ruleDraft.imageAssetId })} placeholder="https://example.com/notice.jpg" /></Field></fieldset>
      </form>
    </DialogShell>
  </div>;
}
