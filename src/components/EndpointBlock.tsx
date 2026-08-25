import type { Source } from '../types';
import { CopyButton } from './ui';

export function EndpointBlock({ source }: { source: Source }) {
  return <div className="endpoint-block">
    <div className="copy-field"><div><small>接口地址</small><code>{source.endpoint.url}</code></div><CopyButton value={source.endpoint.url} /></div>
    <div className="endpoint-block__grid"><div><small>请求方法</small><strong>{source.endpoint.method}</strong></div><div><small>请求头 / 内容类型</small><strong>{source.endpoint.contentType}</strong></div></div>
    <div className="code-block"><div className="code-block__header"><span>请求体</span><CopyButton value={source.endpoint.bodyTemplate} /></div><pre>{source.endpoint.bodyTemplate}</pre></div>
  </div>;
}
