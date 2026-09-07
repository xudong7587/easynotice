import { CheckCircle, Info, WarningCircle } from '@phosphor-icons/react';
import { buildOpenWrtPushBotConfig } from '../lib/openwrtPushBot';
import { CopyButton } from './ui';

export function OpenWrtPushBotSetup({ endpointUrl }: { endpointUrl: string }) {
  const config = buildOpenWrtPushBotConfig(endpointUrl);
  const compatibilityCommand = `uci set pushbot.pushbot.dd_webhook='diy-placeholder'
uci commit pushbot
/etc/init.d/pushbot restart`;

  return <div className="pushbot-setup">
    <div className="pushbot-setup__intro">
      <span><Info size={21} /></span>
      <div><small>首次接入建议</small><strong>优先选择“微信推送”（luci-app-wechatpush）</strong><p>微信推送与全能推送是同源的不同项目，设备检测能力和配置格式并不完全相同。已有通知正常工作的用户可以继续使用原配置。下面整段配置仅适用于全能推送 PushBot，不要直接粘贴到微信推送；微信推送请按其自定义 API 说明接入 EasyNotice 通用 Webhook。</p></div>
    </div>
    <div className="pushbot-setup__intro">
      <span><CheckCircle size={21} weight="fill" /></span>
      <div><small>PushBot 专用配置</small><strong>这里只复制一次，不需要找地址栏</strong><p>EasyNotice 地址、发送方式、标题和正文规则已经全部放进下面这段配置。</p></div>
    </div>
    <div className="code-block pushbot-config">
      <div className="code-block__header"><span>粘贴到 OpenWrt 的“自定义推送”大文本框</span><CopyButton value={config} label="复制整段配置" /></div>
      <pre>{config}</pre>
      <p className="pushbot-config__note"><Info size={15} />不要只复制其中的 URL，也不要把这段内容粘贴到浏览器地址栏。</p>
    </div>
    <div className="pushbot-setup__compatibility">
      <span className="pushbot-setup__warning-icon"><WarningCircle size={21} weight="fill" /></span>
      <div className="pushbot-setup__compatibility-body">
        <small>实际通知没有发出？</small>
        <strong>部分 PushBot 版本需要额外绕过 DIY 模式的凭证检查</strong>
        <p>手动测试成功只说明测试发送链路可用。只有运行日志明确出现“请填写正确的 Token/Webhook”时，才使用下面的兼容命令；它不能修复设备漏检、过滤或免打扰问题。已有正常通知无需执行。</p>
        <div className="pushbot-setup__command">
          <pre>{compatibilityCommand}</pre>
          <CopyButton value={compatibilityCommand} label="复制 SSH 命令" />
        </div>
        <p>执行后仍需保持推送模式为“自定义推送”，并在“推送内容”页勾选需要的事件。升级或重装 PushBot 后若问题重现，再执行一次。</p>
      </div>
    </div>
  </div>;
}
