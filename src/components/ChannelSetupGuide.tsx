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
    intro: '这里只保存机器人 Key；原应用始终连接 EasyNotice，不会接触企微官方地址。',
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
        title: '从 Webhook 中取出 Key',
        detail: <>机器人创建完成页会显示一条 Webhook。只复制其中 <code>key=</code> 后面的完整内容，不需要把前半段地址交给 EasyNotice。</>,
      },
      {
        title: '保存后发送文字预览',
        detail: <>粘贴到下方“企业微信机器人 Key”，保存出口，再回到出口卡片点击“文字预览”。收到带有“测试”标记的标题和正文，就说明机器人可以正常补位。</>,
      },
      {
        title: '机器人固定使用纯文字',
        detail: <>无论入口是否带图片、是否匹配图片规则，群机器人都只发送标题、正文和来源信息，不会跳转到默认封面。需要图文时请使用企业微信应用或 Telegram。</>,
      },
    ],
    fields: [
      { name: '企业微信机器人 Key', source: <>机器人 Webhook 中 <code>key=</code> 后面的内容</> },
    ],
    note: <>外部应用应使用 EasyNotice 通知入口生成的 <code>/hook/随机令牌</code> 地址；机器人 Key 只在这个出口中加密保存。已有机器人的 Key 通常只有创建者能查看，请勿公开。</>,
    docsUrl: 'https://developer.work.weixin.qq.com/document/path/91770',
    docsLabel: '企业微信群机器人文档',
  },
  wecom_app: {
    title: '配置企业微信自建应用',
    intro: '主动发送只需 CorpID、AgentId、Secret、可见范围和企业可信 IP；接收消息回调可以稍后按需启用。',
    steps: [
      {
        title: '创建自建应用',
        detail: <>登录企业微信管理后台，进入“应用管理 → 自建 → 创建应用”，并把需要接收通知的人加入应用的可见范围。</>,
      },
      {
        title: '复制三项应用资料',
        detail: <>在“我的企业 → 企业信息”复制通常以 <code>ww</code> 开头的企业 ID；再回到自建应用详情，复制数字形式的 AgentId，并在 Secret 右侧点击“查看”取得该应用的 Secret。</>,
      },
      {
        title: '设置企业可信 IP',
        detail: <>在“应用管理 → 该自建应用 → 开发者接口 → 企业可信 IP → 配置”中添加 EasyNotice 访问互联网时使用的公网出口 IP。这里填写的是公网 IP，不是 <code>192.168.x.x</code> 这类 NAS 局域网地址。</>,
      },
      {
        title: '按需启用交互回调',
        detail: <>只发送通知时无需设置回调。以后需要接收成员消息或事件时，先保存出口，再次编辑并开启“接收消息与事件回调”；EasyNotice 会提供专属 URL，并校验 Token、EncodingAESKey、签名和加密内容。</>,
      },
      {
        title: '保存并发送图文预览',
        detail: <>“接收成员”可先保留 <code>@all</code>，它只覆盖应用可见范围。保存后点击“图文预览”；若提示错误 <code>60020</code>，EasyNotice 会直接显示企微识别到的 <code>from ip</code>，把该 IP 加入企业可信 IP 后重试。</>,
      },
    ],
    fields: [
      { name: '企业 ID (CorpID)', source: '我的企业 → 企业信息 → 企业 ID' },
      { name: '应用 AgentId', source: '应用管理 → 自建应用详情 → AgentId' },
      { name: '应用 Secret', source: '同一应用详情页 → Secret → 查看' },
      { name: '接收成员 / 部门', source: <>通讯录中的成员账号 / 部门 ID；不确定时先用 <code>@all</code></> },
      { name: '回调 URL / Token / EncodingAESKey', source: '可选；保存出口后再次编辑，按页面顺序配置' },
    ],
    note: <>“企业可信 IP”和“接收消息服务器”是两个独立设置。前者限制谁能调用企微 API，主动发送必须配置；后者让企微把消息或事件推给 EasyNotice，只有启用交互回调时才配置。若公网出口 IP 会变化，建议再配置群机器人作为下一顺位。</>,
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
        detail: <>把 Token 和 Chat ID 填到下方。API 地址通常保持官方默认值，保存后发送图文预览。</>,
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
        detail: <>分组用于把 EasyNotice 通知归在一起；“时效通知”可在专注模式中显示，“静默”只进入通知中心。保存后发送图文预览。</>,
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
