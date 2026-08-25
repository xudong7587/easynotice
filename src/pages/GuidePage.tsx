import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Brain,
  Broadcast,
  CheckCircle,
  DeviceMobile,
  Funnel,
  PaperPlaneTilt,
  Question,
  ShieldCheck,
  WebhooksLogo,
} from '@phosphor-icons/react';
import { Button, Callout, PageHeader } from '../components/ui';

export function GuidePage() {
  return <div>
    <PageHeader title="新手指南" description="不要求你先学会 Webhook。先理解通知从哪里来、最后到哪里去。" />
    <section className="guide-hero section-block"><div><span className="guide-hero__icon"><Question size={27} weight="duotone" /></span><h2>Webhook 到底是什么？</h2><p>你可以把它理解成一个“收件地址”。原 Docker 发生事情后，把标题、正文和图片送到 EasyNotice 给出的地址。EasyNotice 再决定发到企业微信、Telegram 还是 Bark。</p></div><Link to="/sources"><Button>现在接入一个应用<ArrowRight size={16} /></Button></Link></section>

    <section className="section-block"><div className="section-heading"><div><h2>一条通知会经过四步</h2><p>每一步都可单独测试，也会留下明确记录。</p></div></div><div className="notice-flow">
      <div><span><WebhooksLogo size={23} /></span><strong>接住</strong><p>每个 Docker 使用独立的长地址，支持 POST、GET、JSON、表单和纯文本。</p></div><ArrowRight />
      <div><span><Funnel size={23} /></span><strong>看懂</strong><p>自动识别 title、content、message、poster 等常见字段。</p></div><ArrowRight />
      <div><span><Broadcast size={23} /></span><strong>判断</strong><p>按事件匹配图片和模板，再决定同时发送还是失败后补位。</p></div><ArrowRight />
      <div><span><PaperPlaneTilt size={23} /></span><strong>送达</strong><p>企微应用、群机器人、Telegram 和 Bark 各自适配最佳消息形式。</p></div>
    </div></section>

    <div className="guide-grid section-block">
      <section className="panel guide-card"><div className="guide-card__head"><span><ShieldCheck size={23} /></span><div><h2>企微应用为什么会需要补位？</h2><p>企业可信 IP 是安全限制。</p></div></div><div className="guide-card__body"><p>EasyNotice 先尝试企微应用。如果公网 IP 变化导致鉴权失败，它会把失败原因记下来，然后立刻尝试下一顺位的企微群机器人。</p><ol><li>添加“企业微信应用”并测试</li><li>再添加“企业微信群机器人”并测试</li><li>在入口详情中选择“失败后补位”</li><li>把应用排第一，机器人排第二</li></ol><Link to="/channels" className="text-link">配置通知出口<ArrowRight size={15} /></Link></div></section>
      <section className="panel guide-card"><div className="guide-card__head"><span><DeviceMobile size={23} /></span><div><h2>Bark 是什么？</h2><p>给 iPhone 的简洁推送工具。</p></div></div><div className="guide-card__body"><p>在 iPhone 安装 Bark 后，应用首页会显示一条专属推送地址。EasyNotice 只需要末尾的 Key，就能发送标题、正文、声音、分组和点击链接。</p><ol><li>在 iPhone 安装并打开 Bark</li><li>复制首页显示的推送 URL</li><li>把 URL 最后一段填入 Bark Key</li><li>发送测试消息并允许系统通知</li></ol><Link to="/channels" className="text-link">添加 Bark<ArrowRight size={15} /></Link></div></section>
    </div>

    <section className="panel section-block faq-list"><div className="panel__header"><div><h2>常见问题</h2><p>遇到问题时先看通知记录，那里会显示具体失败在哪一步。</p></div></div>
      <details open><summary>原应用只有一个 URL 输入框，没有请求头和请求体怎么办？</summary><p>直接粘贴 EasyNotice 的接口地址。它同时支持 GET 查询参数、表单和纯文本。能选择 JSON 时优先选择 JSON；无法选择也可以先发送一次测试，再到通知记录查看 EasyNotice 实际收到了什么。</p></details>
      <details><summary>固定地址会不会泄露？</summary><p>每个入口地址都含有高强度随机密钥，无法靠项目名猜出。不要把完整地址发到公开论坛；怀疑泄露时，可以在入口详情中更换接口密钥，旧地址会立即失效。</p></details>
      <details><summary>图片为什么在某些渠道看起来不同？</summary><p>Telegram 可以直接发送图片文件；企业微信机器人可以先发图片再发文字；企微图文和 Bark 图标需要公网可访问的图片 URL。EasyNotice 会根据渠道能力自动选择，不会假装所有平台完全一致。</p></details>
      <details><summary>除了 Webhook，还考虑过哪些入口？</summary><p>当前版本把 HTTP Webhook 做成稳定核心，同时兼容 GET API、表单和纯文本。后续可在不改变现有地址的前提下增加 MQTT、SMTP 邮件接收和日志/Syslog 适配器。它们都会先进入同一套标准通知模型。</p></details>
      <details><summary>AI 配置助手会自动改动我的 Docker 吗？</summary><p>不会。AI 只把项目说明或截图翻译成建议，结果必须由你确认。核心接入和发送完全不依赖 AI，即使 API Key 失效，已有通知仍正常工作。</p></details>
    </section>

    <Callout title="仍然不确定时，做一次最小测试">先创建通用 Webhook，只复制接口地址并发送。EasyNotice 会保留原始数据，你可以根据实际字段再补规则，不需要一次配置完美。</Callout>
  </div>;
}
