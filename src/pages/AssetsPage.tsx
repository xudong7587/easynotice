import { useEffect, useRef, useState } from 'react';
import { ImageSquare, Plus, Trash, UploadSimple } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { api } from '../lib/api';
import { formatBytes, formatDate } from '../lib/format';
import type { Asset } from '../types';
import { Button, Callout, EmptyState, PageHeader, Skeleton } from '../components/ui';

export function AssetsPage() {
  const [assets, setAssets] = useState<Asset[]>();
  const [uploading, setUploading] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const load = () => api<{ assets: Asset[] }>('/api/assets').then((result) => setAssets(result.assets)).catch((error) => toast.error(error.message));
  useEffect(() => { void load(); }, []);

  const upload = async (file?: File) => {
    if (!file) return; setUploading(true);
    const body = new FormData(); body.set('image', file);
    try { await api('/api/assets', { method: 'POST', body }); toast.success('图片已经加入素材库'); load(); }
    catch (error) { toast.error(error instanceof Error ? error.message : '上传失败'); }
    finally { setUploading(false); if (input.current) input.current.value = ''; }
  };
  const remove = async (asset: Asset) => {
    if (!window.confirm(`删除“${asset.name}”？引用它的规则会改回无图片。`)) return;
    await api(`/api/assets/${asset.id}`, { method: 'DELETE' }); toast.success('图片已删除'); load();
  };

  return <div>
    <PageHeader title="图片素材" description="为不同 Docker、成功/失败事件准备易于辨认的图片。" action={<><input ref={input} hidden type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(event) => void upload(event.target.files?.[0])} /><Button onClick={() => input.current?.click()} disabled={uploading}><UploadSimple size={17} />{uploading ? '正在上传…' : '上传图片'}</Button></>} />
    <Callout title="图片如何送达">本地图片会在企业微信应用中合成为单条图文消息，在 Telegram 中作为带说明的图片发送；企微机器人固定发送纯文字，Bark 可使用公网图片作为图标。</Callout>
    {!assets ? <Skeleton lines={6} /> : assets.length ? <div className="asset-grid section-block">{assets.map((asset) => <article className="asset-card" key={asset.id}><div className="asset-card__preview"><img src={asset.url} alt={asset.name} /></div><div className="asset-card__body"><div><strong title={asset.name}>{asset.name}</strong><small>{formatBytes(asset.size)} · {formatDate(asset.createdAt)}</small></div><button type="button" className="icon-button" aria-label={`删除 ${asset.name}`} onClick={() => void remove(asset)}><Trash size={17} /></button></div></article>)}</div> : <EmptyState icon={<ImageSquare size={38} />} title="素材库还是空的" description="上传 PNG、JPEG、WebP 或 GIF。图片会保存在 EasyNotice 的数据卷中。" action={<Button onClick={() => input.current?.click()}><Plus size={17} />上传第一张图片</Button>} />}
  </div>;
}
