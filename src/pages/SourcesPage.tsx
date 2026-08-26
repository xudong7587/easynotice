import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  Archive,
  ArrowLeft,
  ArrowRight,
  Brain,
  Broadcast,
  Check,
  Copy,
  ImageSquare,
  MagnifyingGlass,
  Plus,
  Sparkle,
  Trash,
  WebhooksLogo,
} from '@phosphor-icons/react';
import { toast } from 'sonner';
import { api } from '../lib/api';
import { timeAgo } from '../lib/format';
import type { Channel, Recipe, RouteMode, Source } from '../types';
import { channelMeta } from '../components/channelMeta';
import { DialogShell } from '../components/DialogShell';
import { Button, Callout, EmptyState, Field, Input, PageHeader, Skeleton, StatusBadge, Textarea } from '../components/ui';
import { EndpointBlock } from '../components/EndpointBlock';

type WizardStep = 'choose' | 'ai' | 'configure' | 'done';

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('无法读取截图'));
    reader.readAsDataURL(file);
  });
}

export function SourcesPage() {
  const [sources, setSources] = useState<Source[]>();
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<WizardStep>('choose');
  const [search, setSearch] = useState('');
  const [recipeId, setRecipeId] = useState('generic');
  const [name, setName] = useState('');
  const [routeMode, setRouteMode] = useState<RouteMode>('failover');
  const [channelIds, setChannelIds] = useState<string[]>([]);
  const [created, setCreated] = useState<Source>();
  const [saving, setSaving] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiScreenshot, setAiScreenshot] = useState<string>();
  const [aiResult, setAiResult] = useState<Record<string, unknown>>();
  const [aiLoading, setAiLoading] = useState(false);

  const load = () => Promise.all([
    api<{ sources: Source[] }>('/api/sources'),
    api<{ recipes: Recipe[] }>('/api/recipes'),
    api<{ channels: Channel[] }>('/api/channels'),
  ]).then(([sourceResult, recipeResult, channelResult]) => {
    setSources(sourceResult.sources); setRecipes(recipeResult.recipes); setChannels(channelResult.channels.filter((channel) => channel.enabled));
  }).catch((error) => toast.error(error.message));
  useEffect(() => { void load(); }, []);

  const filteredRecipes = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    if (!query) return recipes;
    return recipes.filter((recipe) => `${recipe.name} ${recipe.category} ${recipe.summary} ${recipe.searchTerms.join(' ')}`.toLocaleLowerCase().includes(query));
  }, [recipes, search]);
  const recipe = recipes.find((item) => item.id === recipeId);

  const start = () => {
    setStep('choose'); setSearch(''); setRecipeId('generic'); setName(''); setRouteMode('failover'); setChannelIds(channels.map((channel) => channel.id)); setCreated(undefined); setAiResult(undefined); setAiPrompt(''); setAiScreenshot(undefined); setOpen(true);
  };
  const chooseRecipe = (value: Recipe) => { setRecipeId(value.id); setName(value.id === 'generic' ? '' : value.name); setStep('configure'); };
  const toggleChannel = (id: string) => setChannelIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);

  const create = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true);
    try {
      const result = await api<{ source: Source }>('/api/sources', { method: 'POST', body: JSON.stringify({ name, recipeId, routeMode, channelIds, enabled: true }) });
      setCreated(result.source); setStep('done'); toast.success('通知入口已创建'); void load();
    } catch (error) { toast.error(error instanceof Error ? error.message : '创建失败'); }
    finally { setSaving(false); }
  };

  const analyze = async () => {
    setAiLoading(true); setAiResult(undefined);
    try {
      const result = await api<{ analysis: Record<string, unknown> }>('/api/settings/ai/analyze', { method: 'POST', body: JSON.stringify({ prompt: aiPrompt, screenshotDataUrl: aiScreenshot }) });
      setAiResult(result.analysis);
      const recommended = String(result.analysis.recommendedRecipeId || 'generic');
      if (recipes.some((item) => item.id === recommended)) setRecipeId(recommended);
    } catch (error) { toast.error(error instanceof Error ? error.message : 'AI 识别失败'); }
    finally { setAiLoading(false); }
  };

  const acceptAi = () => {
    const selected = recipes.find((item) => item.id === recipeId) || recipes.find((item) => item.id === 'generic');
    setName(String(aiResult?.detectedProduct || selected?.name || '新通知入口'));
    setStep('configure');
  };

  const archive = async (source: Source) => {
    if (!window.confirm(`停用“${source.name}”？旧入口地址会立即停止接收通知。`)) return;
    try {
      await api(`/api/sources/${source.id}`, { method: 'DELETE' });
      toast.success('通知入口已停用');
      void load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '停用失败');
    }
  };

  const remove = async (source: Source) => {
    if (!window.confirm(`永久删除“${source.name}”？相关规则、通知记录和投递明细都会一并删除，此操作无法恢复。`)) return;
    try {
      await api(`/api/sources/${source.id}/permanent`, { method: 'DELETE' });
      toast.success('通知入口已永久删除');
      void load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '删除失败');
    }
  };

  return <div>
    <PageHeader title="通知入口" description="每个应用或设备拥有独立入口。选择对应预设，照着页面指引复制、测试，不需要理解 Webhook 细节。" action={<Button onClick={start}><Plus size={17} />添加通知入口</Button>} />
    {!sources ? <Skeleton lines={6} /> : sources.length ? <div className="source-list section-block">{sources.map((source) => {
      const sourceRecipe = recipes.find((item) => item.id === source.recipeId);
      return <article className={`source-row ${!source.enabled ? 'is-disabled' : ''}`} key={source.id}>
        <span className="source-row__icon"><Broadcast size={22} weight="duotone" /></span>
        <div className="source-row__main"><div className="source-row__title"><h2>{source.name}</h2><StatusBadge status={source.enabled ? (source.lastReceivedAt ? 'success' : 'untested') : 'archived'} label={source.enabled ? (source.lastReceivedAt ? '已收到数据' : '等待首条通知') : '已停用'} /></div><p>{sourceRecipe?.summary || '通用 Webhook 入口'}</p><div className="source-row__meta"><span>{source.routeMode === 'failover' ? '按顺序补位' : '同时发送'}</span><span>{source.channelIds.length} 个出口</span><span>最近收到：{timeAgo(source.lastReceivedAt)}</span></div></div>
        <div className="source-row__endpoint"><code>{source.endpoint.url}</code><button type="button" className="icon-button" aria-label="复制接口地址" onClick={() => { void navigator.clipboard.writeText(source.endpoint.url); toast.success('接口地址已复制'); }}><Copy size={17} /></button></div>
        <div className="source-row__actions"><Link to={`/sources/${source.id}`}><Button variant="secondary" size="sm">配置<ArrowRight size={15} /></Button></Link>{source.enabled ? <Button variant="quiet" size="sm" onClick={() => void archive(source)}><Archive size={15} />停用</Button> : <Button variant="quiet" size="sm" onClick={() => void remove(source)}><Trash size={15} />删除</Button>}</div>
      </article>;
    })}</div> : <EmptyState icon={<WebhooksLogo size={38} />} title="还没有通知来源" description="选择项目或设备名称后，EasyNotice 会按它真实的配置页面生成专用指引。" action={<Button onClick={start}><Plus size={17} />接入第一个来源</Button>} />}

    <DialogShell open={open} onOpenChange={setOpen} title={step === 'done' ? '入口已经准备好' : step === 'ai' ? 'AI 配置助手' : '添加通知入口'} description={step === 'choose' ? '先告诉 EasyNotice 是哪个应用，其余内容会自动准备。' : step === 'configure' ? '选择通知会从哪些渠道发出。' : undefined} size="xl" footer={step === 'configure' ? <><Button variant="secondary" onClick={() => setStep('choose')}><ArrowLeft size={16} />上一步</Button><Button type="submit" form="source-form" disabled={saving || !name}>{saving ? '正在创建…' : '创建入口'}<ArrowRight size={16} /></Button></> : step === 'done' ? <><Button variant="secondary" onClick={() => setOpen(false)}>完成</Button>{created ? <Link to={`/sources/${created.id}`} onClick={() => setOpen(false)}><Button>继续配置图片规则<ArrowRight size={16} /></Button></Link> : null}</> : undefined}>
      {step === 'choose' ? <div className="wizard-choose">
        <button type="button" className="ai-entry" onClick={() => setStep('ai')}><span><Brain size={25} weight="duotone" /></span><div><strong>不知道怎么选？让 AI 看截图</strong><p>粘贴项目名或上传配置页面截图，只生成建议，不会自动修改设置。</p></div><ArrowRight size={19} /></button>
        <div className="search-box"><MagnifyingGlass size={18} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索 Lucky、MDC-NG、监控…" /></div>
        <div className="recipe-grid">{filteredRecipes.map((item) => <button type="button" key={item.id} className="recipe-option" onClick={() => chooseRecipe(item)}><div><span className="recipe-option__category">{item.category}</span><strong>{item.name}</strong><p>{item.summary}</p></div><ArrowRight size={17} /></button>)}</div>
      </div> : null}

      {step === 'ai' ? <div className="ai-assistant">
        <Button variant="quiet" size="sm" onClick={() => setStep('choose')}><ArrowLeft size={16} />返回应用列表</Button>
        <Callout title="AI 只负责翻译配置页面">截图中的文字会作为不可信内容处理。密钥不会被要求，也不会把分析结果直接写入配置。</Callout>
        <Field label="项目名称或你看到的设置说明" hint="例如：这是 Lucky 的 Webhook 设置，我应该分别填什么？"><Textarea rows={4} value={aiPrompt} onChange={(event) => setAiPrompt(event.target.value)} placeholder="粘贴项目名称、README 里的通知说明，或者描述截图…" /></Field>
        <label className="screenshot-drop"><input type="file" accept="image/png,image/jpeg,image/webp" onChange={async (event) => { const file = event.target.files?.[0]; if (file) setAiScreenshot(await fileToDataUrl(file)); }} />{aiScreenshot ? <><img src={aiScreenshot} alt="待分析的配置截图" /><span>更换截图</span></> : <><ImageSquare size={28} /><strong>上传配置页面截图</strong><span>PNG、JPEG 或 WebP，截图前请遮住密钥</span></>}</label>
        <Button type="button" onClick={analyze} disabled={aiLoading || (!aiPrompt && !aiScreenshot)}><Sparkle size={17} weight="fill" />{aiLoading ? '正在识别…' : '分析配置方式'}</Button>
        {aiResult ? <div className="ai-result"><div className="ai-result__header"><span><Sparkle size={19} weight="fill" /></span><div><small>识别结果</small><h3>{String(aiResult.detectedProduct || '未能确定项目')}</h3></div><StatusBadge status={String(aiResult.confidence) === 'high' ? 'success' : 'partial'} label={`可信度：${String(aiResult.confidence || 'low')}`} /></div><p>{String(aiResult.explanation || '')}</p>{Array.isArray(aiResult.uncertainties) && aiResult.uncertainties.length ? <Callout tone="warning" title="需要你确认">{aiResult.uncertainties.map(String).join('；')}</Callout> : null}<Button onClick={acceptAi}>采用建议并继续<ArrowRight size={16} /></Button></div> : null}
      </div> : null}

      {step === 'configure' ? <form id="source-form" className="dialog-form" onSubmit={create}>
        <div className="selected-recipe"><span><Check size={18} weight="bold" /></span><div><small>已选择预设</small><strong>{recipe?.name || '通用 Webhook'}</strong></div><button type="button" onClick={() => setStep('choose')}>更换</button></div>
        <Field label="入口名称" hint="建议直接使用 Docker 或应用名称，通知列表更容易识别" required><Input value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：Lucky 主路由" /></Field>
        <fieldset className="field-group"><legend>发送方式</legend><label className={`choice-card ${routeMode === 'failover' ? 'is-selected' : ''}`}><input type="radio" name="routeMode" value="failover" checked={routeMode === 'failover'} onChange={() => setRouteMode('failover')} /><span><strong>按顺序补位（推荐）</strong><small>第一个失败才尝试第二个，适合企微应用 + 群机器人。</small></span></label><label className={`choice-card ${routeMode === 'broadcast' ? 'is-selected' : ''}`}><input type="radio" name="routeMode" value="broadcast" checked={routeMode === 'broadcast'} onChange={() => setRouteMode('broadcast')} /><span><strong>所有渠道都发送</strong><small>每条通知同时发到全部已选渠道。</small></span></label></fieldset>
        <fieldset className="field-group"><legend>通知出口</legend>{channels.length ? <div className="route-options">{channels.map((channel, index) => { const meta = channelMeta[channel.type]; const Icon = meta.icon; const selected = channelIds.includes(channel.id); return <label className={`route-option ${selected ? 'is-selected' : ''}`} key={channel.id}><input type="checkbox" checked={selected} onChange={() => toggleChannel(channel.id)} /><span className="channel-logo"><Icon size={19} /></span><span><strong>{channel.name}</strong><small>{routeMode === 'failover' && selected ? `顺位 ${channelIds.indexOf(channel.id) + 1}` : meta.short}</small></span>{selected ? <Check size={17} weight="bold" /> : null}</label>; })}</div> : <Callout tone="warning">还没有可用通知出口。可以先创建入口，之后再到详情页添加路由。</Callout>}</fieldset>
      </form> : null}

      {step === 'done' && created ? <div className="wizard-done"><div className="success-orb"><Check size={30} weight="bold" /></div><div><h2>{created.name} 已经可以接收通知</h2><p>{recipe?.setupMode === 'openwrt-pushbot' ? '复制下面整段配置，粘贴到 OpenWrt 的“自定义推送”大文本框。保存后点一次“发送测试”。' : '将下面内容粘贴到原应用。保存后先发一条测试，在通知记录中确认字段是否识别正确。'}</p></div><EndpointBlock source={created} recipe={recipe} />{recipe ? <div className="setup-steps"><h3>在 {recipe.name} 中这样填写</h3>{recipe.steps.map((item, index) => <div key={item}><span>{index + 1}</span><p>{item}</p></div>)}</div> : null}</div> : null}
    </DialogShell>
  </div>;
}
