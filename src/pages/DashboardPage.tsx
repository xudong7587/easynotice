import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Broadcast,
  CheckCircle,
  ClockCountdown,
  PaperPlaneTilt,
  Plus,
  WarningCircle,
} from '@phosphor-icons/react';
import { api } from '../lib/api';
import { timeAgo } from '../lib/format';
import type { NoticeEvent } from '../types';
import { Button, Callout, PageHeader, SeverityIcon, Skeleton, StatusBadge } from '../components/ui';
import { channelMeta } from '../components/channelMeta';

interface DashboardData {
  metrics: {
    sourceCount: number;
    channelCount: number;
    eventCount24h: number;
    successCount24h: number;
    failedCount24h: number;
    pendingCount: number;
    successRate24h: number | null;
  };
  quickStart: { hasChannel: boolean; hasSource: boolean; hasRoute: boolean; setupComplete: boolean };
  recentEvents: NoticeEvent[];
  channelHealth: Array<{
    id: string;
    name: string;
    type: keyof typeof channelMeta;
    enabled: boolean;
    lastStatus: string;
    lastError?: string;
    lastSuccessAt?: number;
  }>;
}

export function DashboardPage() {
  const [data, setData] = useState<DashboardData>();
  const [error, setError] = useState('');

  useEffect(() => {
    api<DashboardData>('/api/dashboard').then(setData).catch((reason) => setError(reason.message));
  }, []);

  if (!data) {
    return <div><PageHeader title="总览" description="正在汇总 EasyNotice 的运行状态" /><Skeleton lines={6} />{error ? <Callout tone="danger">{error}</Callout> : null}</div>;
  }

  const steps = [
    { done: data.quickStart.hasChannel, title: '添加第一个通知出口', detail: '建议先添加企业微信机器人，测试成功后再继续。', to: '/channels' },
    { done: data.quickStart.hasSource, title: '接入一个 Docker 应用', detail: '选择 Lucky、MDC-NG 或通用 Webhook，复制系统给出的内容。', to: '/sources' },
    { done: data.quickStart.hasRoute, title: '排好主渠道与备用渠道', detail: '把企微应用放在第一位，群机器人放在第二位。', to: '/sources' },
  ];
  const complete = steps.every((step) => step.done);

  return (
    <div>
      <PageHeader
        title="总览"
        description="从收到 Webhook 到送达手机，每一步都能在这里确认。"
        action={<Link to="/sources"><Button><Plus size={17} />添加通知入口</Button></Link>}
      />

      {!complete ? (
        <section className="quickstart section-block">
          <div className="section-heading"><div><h2>先完成这三件事</h2><p>按顺序配置，通常几分钟就能收到第一条测试通知。</p></div><span>{steps.filter((step) => step.done).length}/3</span></div>
          <div className="quickstart__steps">
            {steps.map((step) => (
              <Link key={step.title} to={step.to} className={`quickstart__step ${step.done ? 'is-done' : ''}`}>
                {step.done ? <CheckCircle size={24} weight="fill" /> : <span className="quickstart__number">{steps.indexOf(step) + 1}</span>}
                <div><strong>{step.title}</strong><p>{step.detail}</p></div>
                <ArrowRight size={18} />
              </Link>
            ))}
          </div>
        </section>
      ) : (
        <Callout tone="success" title="通知链路已经就绪">入口、路由和出口都已配置。建议偶尔查看失败记录，及时发现密钥或网络问题。</Callout>
      )}

      <section className="metrics-grid section-block" aria-label="最近 24 小时数据">
        <div className="metric"><span className="metric__icon"><Broadcast size={21} /></span><div><small>已接入应用</small><strong>{data.metrics.sourceCount}</strong></div></div>
        <div className="metric"><span className="metric__icon"><PaperPlaneTilt size={21} /></span><div><small>24 小时通知</small><strong>{data.metrics.eventCount24h}</strong></div></div>
        <div className="metric"><span className="metric__icon"><CheckCircle size={21} /></span><div><small>送达率</small><strong>{data.metrics.successRate24h === null ? '暂无' : `${data.metrics.successRate24h}%`}</strong></div></div>
        <div className="metric"><span className="metric__icon"><WarningCircle size={21} /></span><div><small>发送失败</small><strong>{data.metrics.failedCount24h}</strong></div></div>
      </section>

      <div className="dashboard-columns section-block">
        <section className="panel">
          <div className="panel__header"><div><h2>最近通知</h2><p>最新收到的 8 条事件</p></div><Link to="/events" className="text-link">查看全部<ArrowRight size={15} /></Link></div>
          {data.recentEvents.length ? (
            <div className="event-list">
              {data.recentEvents.map((event) => (
                <Link to={`/events?open=${event.id}`} key={event.id} className="event-row">
                  <SeverityIcon severity={event.severity} />
                  <div className="event-row__content"><strong>{event.title}</strong><span>{event.sourceName} · {timeAgo(event.receivedAt)}</span></div>
                  <StatusBadge status={event.status} />
                </Link>
              ))}
            </div>
          ) : <div className="panel-empty"><ClockCountdown size={28} /><p>还没有收到通知。完成入口配置后，记录会出现在这里。</p></div>}
        </section>

        <section className="panel">
          <div className="panel__header"><div><h2>出口健康</h2><p>最近一次真实连接结果</p></div><Link to="/channels" className="text-link">管理<ArrowRight size={15} /></Link></div>
          {data.channelHealth.length ? (
            <div className="channel-health-list">
              {data.channelHealth.map((channel) => {
                const meta = channelMeta[channel.type];
                const Icon = meta.icon;
                return <div className="channel-health" key={channel.id}><span className="channel-logo"><Icon size={20} weight="duotone" /></span><div><strong>{channel.name}</strong><small>{channel.lastSuccessAt ? `成功于 ${timeAgo(channel.lastSuccessAt)}` : '请先发送消息预览'}</small></div><StatusBadge status={channel.enabled ? channel.lastStatus : 'archived'} /></div>;
              })}
            </div>
          ) : <div className="panel-empty"><PaperPlaneTilt size={28} /><p>还没有通知出口。先添加一个群机器人或 Bark。</p></div>}
        </section>
      </div>
    </div>
  );
}
