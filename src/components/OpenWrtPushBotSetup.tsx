import { CheckCircle, Info } from '@phosphor-icons/react';
import { buildOpenWrtPushBotConfig } from '../lib/openwrtPushBot';
import { CopyButton } from './ui';

export function OpenWrtPushBotSetup({ endpointUrl }: { endpointUrl: string }) {
  const config = buildOpenWrtPushBotConfig(endpointUrl);

  return <div className="pushbot-setup">
    <div className="pushbot-setup__intro">
      <span><CheckCircle size={21} weight="fill" /></span>
      <div><small>PushBot 专用配置</small><strong>这里只复制一次，不需要找地址栏</strong><p>EasyNotice 地址、发送方式、标题和正文规则已经全部放进下面这段配置。</p></div>
    </div>
    <div className="code-block pushbot-config">
      <div className="code-block__header"><span>粘贴到 OpenWrt 的“自定义推送”大文本框</span><CopyButton value={config} label="复制整段配置" /></div>
      <pre>{config}</pre>
      <p className="pushbot-config__note"><Info size={15} />不要只复制其中的 URL，也不要把这段内容粘贴到浏览器地址栏。</p>
    </div>
  </div>;
}
