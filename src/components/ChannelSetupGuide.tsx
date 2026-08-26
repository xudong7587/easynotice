import type { ReactNode } from 'react';
import { ArrowSquareOut, BookOpenText, CaretDown } from '@phosphor-icons/react';
import type { ChannelType } from '../types';

interface GuideStep {
  title: string;
  detail: ReactNode;
}

interface GuideField {
  name: string;
  source: ReactNode;
}

interface ChannelGuide {
  title: string;
  intro: string;
  steps: GuideStep[];
  fields: GuideField[];
  note: ReactNode;
  docsUrl: string;
  docsLabel: string;
}

const guides: Record<ChannelType, ChannelGuide> = {
  wecom_robot: {
    title: '先在目标企业微信群里创建机器人',
    intro: '这是最容易配置的企微出口，只需要群里生成的一条完整 Webhook 地址。',
    steps: [
      {
        title: '打开目标内部群',
        detail: <>建议使用企业微信电脑端。进入要接收通知的内部群，打开右上角的群聊信息；有些版本也可右键群聊后选择“管理聊天信息”。</>,
      },
      {
        title: '添加自定义消息推送',
        detail: <>依次查找“消息推送 → 自定义消息推送”；旧版客户端中名称可能是“群机器人 → 添加机器人”。填写机器人名称并保存。</>,
      },
      {
        title: '复制完整 Webhook',
        detail: <>复制以 <code>https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=</code> 开头的完整地址，不要只复制最后的 key。</>,
      },
      {
        title: '保存后发送测试',
        detail: <>粘贴到下方“机器人 Webhook 地址”，保存出口，再回到出口卡片点击“发送测试”。</>,
      },
    ],
    fields: [
      { name: '机器人 Webhook 地址', source: '机器人创建完成页里的完整 Webhook URL' },
    ],
    note: <>已有机器人的 Webhook 通常只有创建者能查看。找不到添加入口时，先确认这是企业内部群，并检查自己是否有群管理权限、企业管理员是否限制了机器人。</>,
    docsUrl: 'https://developer.work.weixin.qq.com/document/path/91770',
    docsLabel: '企业微信群机器人文档',
  },
  wecom_app: {
    title: '先在企业微信管理后台创建自建应用',
    intro: '自建应用能把通知发给成员或部门，但需要 CorpID、AgentId、Secret 和企业可信 IP。',
    steps: [
      {
        title: '创建自建应用',
        detail: <>登录企业微信管理后台，进入“应用管理 → 自建 → 创建应用”，并把需要接收通知的人加入应用的可见范围。</>,
      },
      {
        title: '复制 AgentId 和 Secret',
        detail: <>进入刚创建的应用详情页，复制数字形式的 AgentId；在 Secret 右侧点击“查看”，按企微提示取得 Secret。</>,
      },
      {
        title: '复制企业 ID',
        detail: <>进入“我的企业 → 企业信息”，在页面底部找到企业 ID（CorpID）。它通常以 <code>ww</code> 开头。</>,
      },
      {
        title: '设置企业可信 IP',
        detail: <>回到应用详情，在“开发者接口 → 企业可信 IP”里添加 NAS 访问互联网时使用的公网出口 IP。不要填写 <code>192.168.x.x</code> 这类局域网地址。</>,
      },
      {
        title: '确认接收范围并测试',
        detail: <>“接收成员”可先保留 <code>@all</code>，它只会覆盖该应用可见范围。指定成员时填写成员账号而不是显示昵称，多个值用 <code>|</code> 分隔。</>,
      },
    ],
    fields: [
      { name: '企业 ID (CorpID)', source: '我的企业 → 企业信息 → 企业 ID' },
      { name: '应用 AgentId', source: '应用管理 → 自建应用详情 → AgentId' },
      { name: '应用 Secret', source: '同一应用详情页 → Secret → 查看' },
      { name: '接收成员 / 部门', source: <>通讯录中的成员账号 / 部门 ID；不确定时先用 <code>@all</code></> },
    ],
    note: <>最常见的失败是 Secret 所属应用不匹配、成员不在应用可见范围，或企业可信 IP 没填当前公网出口 IP。公网 IP 会变化时，建议再配置一个群机器人作为下一顺位。</>,
    docsUrl: 'https://developer.work.weixin.qq.com/document/path/90236',
    docsLabel: '企业微信应用消息文档',
  },
  telegram: {
    title: '先向 BotFather 创建机器人，再取得会话 ID',
    intro: '需要两项：BotFather 给出的 Bot Token，以及目标私聊、群组或频道的 Chat ID。',
    steps: [
      {
        title: '创建 Bot',
        detail: <>在 Telegram 打开官方 <a href="https://t.me/BotFather" target="_blank" rel="noreferrer">@BotFather</a>，发送 <code>/newbot</code>，按提示设置名称和用户名，然后复制 Bot Token。</>,
      },
      {
        title: '让目标会话产生一条更新',
        detail: <>私聊时打开新 Bot，点击 Start 并发一条消息；群组中先添加 Bot 再发消息；频道中需把 Bot 设为管理员并发布一条消息。</>,
      },
      {
        title: '查找 Chat ID',
        detail: <>在浏览器访问 <code>https://api.telegram.org/bot&lt;你的Token&gt;/getUpdates</code>，刷新后查找 <code>message.chat.id</code>；频道则查找 <code>channel_post.chat.id</code>。群组和频道 ID 通常是负数，负号也要复制。</>,
      },
      {
        title: '填写并测试',
        detail: <>把 Token 和 Chat ID 填到下方。API 地址通常保持官方默认值，保存后发送测试。</>,
      },
    ],
    fields: [
      { name: 'Bot Token', source: '@BotFather 创建完成后的整串令牌' },
      { name: 'Chat ID', source: <><code>getUpdates</code> 返回结果里的 <code>chat.id</code></> },
      { name: 'API 地址', source: <><code>https://api.telegram.org</code>，不要附加 <code>/bot...</code></> },
    ],
    note: <>Bot Token 等同密码，不要发给他人。中国大陆网络若无法连接官方 API，请只使用自己可信的反向代理，并把“API 地址”改为代理根地址；随机公共代理可以读取 Token 和消息内容。</>,
    docsUrl: 'https://core.telegram.org/bots/tutorial',
    docsLabel: 'Telegram 官方 Bot 教程',
  },
  bark: {
    title: '先在 iPhone 的 Bark 首页复制测试地址',
    intro: 'Bark 适合个人 iPhone 推送。安装后，应用首页会给每台设备生成专属推送地址。',
    steps: [
      {
        title: '安装并允许通知',
        detail: <>在 iPhone 安装 Bark，首次打开时允许系统通知。若之前拒绝，可到“系统设置 → 通知 → Bark”重新开启。</>,
      },
      {
        title: '复制测试 URL',
        detail: <>在 Bark 首页复制测试地址，通常类似 <code>https://api.day.app/设备Key/测试推送</code>。</>,
      },
      {
        title: '直接粘贴完整地址',
        detail: <>可把完整测试地址直接粘贴到下方“Bark Key”，EasyNotice 会自动拆分服务器地址和设备 Key；也可以只粘贴 URL 中域名后的第一段 Key。</>,
      },
      {
        title: '选择分组和提醒级别',
        detail: <>分组用于把 EasyNotice 通知归在一起；“时效通知”可在专注模式中显示，“静默”只进入通知中心。保存后发送测试。</>,
      },
    ],
    fields: [
      { name: 'Bark Key', source: <>推送 URL 中服务器域名后的第一段，例如 <code>AbCd1234</code></> },
      { name: 'Bark 服务器', source: <><code>https://api.day.app</code>，自建时改为自己的 Bark Server 地址</> },
      { name: '通知铃声', source: <>可选，填写 Bark 支持的铃声名，例如 <code>minuet</code></> },
    ],
    note: <>完整推送地址和设备 Key 都应按密钥保管。远程图片图标必须能被 Bark 服务器从公网访问，本地素材不能直接作为 Bark 图标。</>,
    docsUrl: 'https://github.com/Finb/Bark/blob/master/docs/en-us/tutorial.md',
    docsLabel: 'Bark 官方推送教程',
  },
};

export function ChannelSetupGuide({ type }: { type: ChannelType }) {
  const guide = guides[type];
  return (
    <details className="channel-setup-guide" open>
      <summary className="channel-setup-guide__heading">
        <span><BookOpenText size={21} weight="duotone" /></span>
        <div>
          <small>配置前准备</small>
          <h3>{guide.title}</h3>
          <p>{guide.intro}</p>
        </div>
        <CaretDown className="channel-setup-guide__caret" size={17} />
      </summary>
      <div className="channel-setup-guide__body">
        <ol className="channel-guide-steps">
          {guide.steps.map((step, index) => <li key={step.title}>
            <span>{index + 1}</span>
            <div><strong>{step.title}</strong><p>{step.detail}</p></div>
          </li>)}
        </ol>
        <div className="channel-guide-fields">
          <strong>EasyNotice 字段对照</strong>
          <dl>{guide.fields.map((field) => <div key={field.name}><dt>{field.name}</dt><dd>{field.source}</dd></div>)}</dl>
        </div>
        <div className="channel-guide-note"><strong>容易卡住的地方</strong><p>{guide.note}</p></div>
        <a className="text-link channel-guide-docs" href={guide.docsUrl} target="_blank" rel="noreferrer">
          查看 {guide.docsLabel}<ArrowSquareOut size={14} />
        </a>
      </div>
    </details>
  );
}
