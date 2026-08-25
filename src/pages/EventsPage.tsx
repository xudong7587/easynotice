import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowClockwise, CheckCircle, Clock, MagnifyingGlass, PaperPlaneTilt, WarningCircle } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { api } from '../lib/api';
import { formatDate } from '../lib/format';
import type { EventDetail, NoticeEvent, Source } from '../types';
import { channelMeta } from '../components/channelMeta';
import { DialogShell } from '../components/DialogShell';
import { Button, Callout, EmptyState, NativeSelect, PageHeader, SeverityIcon, Skeleton, StatusBadge } from '../components/ui';

interface EventsResponse {
  events: NoticeEvent[];
  pagination: { page: number; limit: number; total: number; pages: number };
}

export function EventsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [events, setEvents] = useState<NoticeEvent[]>();
  const [sources, setSources] = useState<Source[]>([]);
  const [pagination, setPagination] = useState<EventsResponse['pagination']>();
  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [sourceId, setSourceId] = useState(searchParams.get('sourceId') || '');
  const [status, setStatus] = useState(searchParams.get('status') || '');
  const [page, setPage] = useState(Number(searchParams.get('page') || 1));
  const [detail, setDetail] = useState<EventDetail>();
  const [detailOpen, setDetailOpen] = useState(false);

  const load = useCallback(async () => {
    const query = new URLSearchParams();
    if (search) query.set('search', search);
    if (sourceId) query.set('sourceId', sourceId);
    if (status) query.set('status', status);
    query.set('page', String(page));
    try {
      const result = await api<EventsResponse>(`/api/events?${query}`);
      setEvents(result.events); setPagination(result.pagination); setSearchParams(query, { replace: true });
    } catch (error) { toast.error(error instanceof Error ? error.message : '加载记录失败'); }
  }, [search, sourceId, status, page, setSearchParams]);

  useEffect(() => { api<{ sources: Source[] }>('/api/sources').then((result) => setSources(result.sources)); }, []);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 180); return () => window.clearTimeout(timer); }, [load]);

  const openDetail = async (id: string) => {
    setDetailOpen(true); setDetail(undefined);
    try { const result = await api<{ event: EventDetail }>(`/api/events/${id}`); setDetail(result.event); }
    catch (error) { toast.error(error instanceof Error ? error.message : '加载通知详情失败'); }
  };
  useEffect(() => { const id = searchParams.get('open'); if (id) void openDetail(id); }, []);
  const retry = async () => {
    if (!detail) return;
    try { await api(`/api/events/${detail.id}/retry`, { method: 'POST' }); toast.success('通知已经重新加入队列'); setDetailOpen(false); void load(); }
    catch (error) { toast.error(error instanceof Error ? error.message : '重试失败'); }
  };

  return <div>
    <PageHeader title="通知记录" description="每次接收、识别、规则匹配、主备切换和发送结果都有据可查。" action={<Button variant="secondary" onClick={() => void load()}><ArrowClockwise size={17} />刷新</Button>} />
    <div className="filters section-block"><label className="filter-search"><MagnifyingGlass size={18} /><input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="搜索标题、正文或来源" /></label><NativeSelect aria-label="按入口筛选" value={sourceId} onChange={(event) => { setSourceId(event.target.value); setPage(1); }}><option value="">全部入口</option>{sources.map((source) => <option key={source.id} value={source.id}>{source.name}</option>)}</NativeSelect><NativeSelect aria-label="按状态筛选" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="">全部状态</option><option value="success">已送达</option><option value="partial">备用送达</option><option value="failed">失败</option><option value="pending">等待发送</option><option value="processing">正在发送</option></NativeSelect></div>
    {!events ? <Skeleton lines={8} /> : events.length ? <><div className="events-table section-block"><div className="events-table__head"><span>通知</span><span>来源 / 类型</span><span>时间</span><span>状态</span></div>{events.map((event) => <button type="button" key={event.id} className="events-table__row" onClick={() => void openDetail(event.id)}><span className="event-cell"><SeverityIcon severity={event.severity} /><span><strong>{event.title}</strong><small>{event.body}</small></span></span><span><strong>{event.sourceName}</strong><small>{event.eventType}</small></span><span><strong>{formatDate(event.receivedAt)}</strong><small>{event.matchedRuleName ? `规则：${event.matchedRuleName}` : '使用原始样式'}</small></span><span><StatusBadge status={event.status} />{event.failedCount > 0 ? <small>{event.failedCount} 次失败</small> : null}</span></button>)}</div>{pagination && pagination.pages > 1 ? <div className="pagination"><Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>上一页</Button><span>第 {pagination.page} / {pagination.pages} 页，共 {pagination.total} 条</span><Button variant="secondary" size="sm" disabled={page >= pagination.pages} onClick={() => setPage(page + 1)}>下一页</Button></div> : null}</> : <EmptyState icon={<PaperPlaneTilt size={36} />} title="没有符合条件的通知" description="可以清除筛选条件，或者从某个通知入口发送整链路测试。" />}

    <DialogShell open={detailOpen} onOpenChange={setDetailOpen} title={detail?.title || '正在读取通知详情'} description={detail ? `${detail.sourceName} · ${formatDate(detail.receivedAt)}` : undefined} size="xl" footer={detail ? <><Button variant="secondary" onClick={() => setDetailOpen(false)}>关闭</Button>{!['pending', 'processing'].includes(detail.status) ? <Button onClick={retry}><ArrowClockwise size={16} />重新发送</Button> : null}</> : undefined}>
      {!detail ? <Skeleton lines={6} /> : <div className="event-detail">
        <div className="event-detail__summary"><div><SeverityIcon severity={detail.severity} size={22} /><span><small>识别后的正文</small><p>{detail.body}</p></span></div><StatusBadge status={detail.status} /></div>
        {detail.error ? <Callout tone="danger" title="最终失败原因">{detail.error}</Callout> : detail.status === 'partial' ? <Callout tone="warning" title="备用渠道完成了补位">主渠道发送失败，但后续渠道已经成功送达。</Callout> : null}
        <section><h3>投递过程</h3>{detail.deliveries.length ? <div className="delivery-timeline">{detail.deliveries.map((delivery) => { const meta = channelMeta[delivery.channelType]; const Icon = delivery.status === 'success' ? CheckCircle : delivery.status === 'failed' ? WarningCircle : Clock; return <div className={`delivery-step delivery-step--${delivery.status}`} key={delivery.id}><span className="delivery-step__icon"><Icon size={18} weight="fill" /></span><div><div><strong>{delivery.channelName}</strong><StatusBadge status={delivery.status} /></div><p>{delivery.error || delivery.detail || (delivery.status === 'skipped' ? '前一个渠道已经送达' : '等待结果')}</p><small>{meta.short}{delivery.attempt > 0 ? ` · 第 ${delivery.attempt} 次尝试` : ''}{delivery.durationMs !== undefined ? ` · ${delivery.durationMs} ms` : ''}</small></div></div>; })}</div> : <Callout>消息仍在队列中，几秒后刷新详情即可看到投递结果。</Callout>}</section>
        <details className="raw-payload"><summary>查看原始 Webhook 数据</summary><div><small>请求 ID：{detail.requestId}</small><pre>{JSON.stringify(detail.raw, null, 2)}</pre></div></details>
      </div>}
    </DialogShell>
  </div>;
}
