import { useEffect, useState } from 'react';
import { ArrowsClockwise, CheckCircle, FloppyDisk, HardDrives, PlugsConnected } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { api } from '../lib/api';
import { timeAgo } from '../lib/format';
import type { Source, UgreenCollector } from '../types';
import { Button, Callout, StatusBadge } from './ui';
import { UgreenCollectorFields, type UgreenCollectorDraft } from './UgreenCollectorFields';

interface Props {
  source: Source;
  onUpdated: (collector: UgreenCollector) => void;
}

function draftFrom(collector: UgreenCollector): UgreenCollectorDraft {
  return {
    baseUrl: collector.baseUrl,
    username: collector.username,
    password: '',
    allowSelfSigned: collector.allowSelfSigned,
    intervalMinutes: collector.intervalMinutes,
    importRecent: collector.importRecent,
  };
}

export function UgreenCollectorPanel({ source, onUpdated }: Props) {
  const collector = source.collector!;
  const [draft, setDraft] = useState<UgreenCollectorDraft>(() => draftFrom(collector));
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [running, setRunning] = useState(false);

  useEffect(() => setDraft(draftFrom(collector)), [collector.baseUrl, collector.username, collector.allowSelfSigned, collector.intervalMinutes, collector.importRecent]);

  const save = async () => {
    setSaving(true);
    try {
      const result = await api<{ collector: UgreenCollector }>(`/api/sources/${source.id}/ugreen`, {
        method: 'PUT',
        body: JSON.stringify({ ...draft, password: draft.password || undefined }),
      });
      onUpdated(result.collector);
      setDraft(draftFrom(result.collector));
      toast.success('绿联连接设置已保存');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    setTesting(true);
    const toastId = toast.loading('正在测试已保存的绿联连接');
    try {
      const result = await api<{ messageCount: number }>(`/api/sources/${source.id}/ugreen/test`, { method: 'POST', body: '{}' });
      toast.success(`连接成功，当前可读取 ${result.messageCount} 条系统消息`, { id: toastId });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '连接测试失败', { id: toastId });
    } finally {
      setTesting(false);
    }
  };

  const run = async () => {
    setRunning(true);
    const toastId = toast.loading('正在检查绿联消息中心');
    try {
      const result = await api<{ found: number; queued: number; seeded: boolean; collector: UgreenCollector }>(`/api/sources/${source.id}/ugreen/run`, { method: 'POST', body: '{}' });
      onUpdated(result.collector);
      if (result.seeded) toast.success(`已建立消息起点，当前 ${result.found} 条历史消息没有补发`, { id: toastId });
      else if (result.queued) toast.success(`发现 ${result.queued} 条新通知，已进入发送队列`, { id: toastId });
      else toast.success('检查完成，没有发现新通知', { id: toastId });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '检查失败', { id: toastId });
    } finally {
      setRunning(false);
    }
  };

  return <section className="panel section-block ugreen-collector-panel">
    <div className="panel__header"><div><h2>绿联消息采集</h2><p>EasyNotice 主动读取 UGOS Pro 消息中心，不需要配置 Webhook。</p></div><StatusBadge status={collector.lastError ? 'failed' : collector.lastSuccessAt ? 'success' : 'untested'} label={collector.lastError ? '最近检查失败' : collector.lastSuccessAt ? '采集正常' : '等待首次检查'} /></div>
    <div className="collector-health">
      <div><span><HardDrives size={20} /></span><small>设备地址</small><strong>{collector.baseUrl}</strong></div>
      <div><span><ArrowsClockwise size={20} /></span><small>检查频率</small><strong>每 {collector.intervalMinutes} 分钟</strong></div>
      <div><span><CheckCircle size={20} /></span><small>最近成功</small><strong>{collector.lastSuccessAt ? timeAgo(collector.lastSuccessAt) : '尚未成功'}</strong></div>
    </div>
    {collector.lastError ? <Callout tone="danger" title="最近一次检查失败">{collector.lastError}</Callout> : null}
    <div className="collector-form">
      <UgreenCollectorFields value={draft} onChange={setDraft} passwordOptional />
      <div className="collector-actions">
        <Button variant="secondary" onClick={() => void test()} disabled={testing || saving}><PlugsConnected size={17} />{testing ? '正在测试…' : '测试已保存连接'}</Button>
        <Button variant="secondary" onClick={() => void run()} disabled={running || saving}><ArrowsClockwise size={17} />{running ? '正在检查…' : '立即检查消息'}</Button>
        <Button onClick={() => void save()} disabled={saving || running || !draft.baseUrl || !draft.username}><FloppyDisk size={17} />{saving ? '正在保存…' : '保存连接设置'}</Button>
      </div>
    </div>
  </section>;
}
