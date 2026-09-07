export interface RecipeWebhookTemplate {
  id: string;
  name: string;
  summary: string;
  location: string;
  support: 'native' | 'scheduled' | 'unavailable';
  bodyTemplate?: string;
  note?: string;
  defaultSelected?: boolean;
}

export interface Recipe {
  id: string;
  name: string;
  category: string;
  summary: string;
  confidence: 'verified' | 'community' | 'generic';
  method: 'POST' | 'GET';
  contentType: string;
  pathStyle: 'hook' | 'legacy';
  bodyTemplate: string;
  steps: string[];
  tips: string[];
  searchTerms: string[];
  setupMode?: 'openwrt-pushbot' | 'ugreen-dxp';
  webhookTemplates?: RecipeWebhookTemplate[];
}

export const recipes: Recipe[] = [
  {
    id: 'generic',
    name: '通用 Webhook',
    category: '推荐先试',
    summary: '不知道格式也没关系。先发一次，EasyNotice 会自动找标题、正文、图片和链接。',
    confidence: 'generic',
    method: 'POST',
    contentType: 'application/json',
    pathStyle: 'hook',
    bodyTemplate: `{
  "title": "通知标题",
  "content": "这里填写通知内容",
  "event": "default",
  "image": "https://example.com/image.jpg",
  "url": "https://example.com/detail"
}`,
    steps: [
      '把接口地址粘贴到原应用的 Webhook URL。',
      '请求方式优先选择 POST，格式优先选择 JSON。',
      '发送测试后，在通知记录里检查识别结果。',
    ],
    tips: ['兼容 title/subject、content/body/message、image/poster/thumb、url/link 等常见字段。'],
    searchTerms: ['webhook', '通用', '未知', '自定义'],
  },
  {
    id: 'lucky',
    name: 'Lucky',
    category: '网络与软路由',
    summary: '适合公网 IP 变化、域名续签、端口转发等事件。',
    confidence: 'verified',
    method: 'POST',
    contentType: 'application/json',
    pathStyle: 'hook',
    bodyTemplate: `{
  "title": "公网IP更新",
  "content": "在{time}更新为{ipAddr}",
  "event": "ip_changed"
}`,
    steps: [
      '先勾选要接入的通知场景，再按生成卡片标注的位置进入 Lucky 的 Webhook 或 CallWeb 设置。',
      '粘贴同一个 EasyNotice 接口地址；不同场景只需要更换各自的请求体。',
      '请求方法选择 POST，请求头填写 application/json。',
      '把对应 JSON 完整粘贴到请求体；“接口调用成功包含的字符串”填写 success，然后保存并测试。',
    ],
    tips: [
      'DDNS 中可直接使用 {time}、{ipAddr}；STUN 的局部变量建议保留 #{变量名} 写法。端口转发和 Web 服务状态只能通过计划任务定时报告，并不代表目标服务真实可用。',
      '如果 Lucky 持续弹出 connection refused，请在所有 DDNS/STUN 任务及全局 WebHook 中查找旧地址，替换或关闭旧配置；只关闭错误弹窗不会停止重试。',
    ],
    searchTerms: ['lucky', '公网ip', 'ddns', '软路由'],
    webhookTemplates: [
      {
        id: 'ddns_changed',
        name: 'DDNS / 公网 IP 变化',
        summary: '公网地址发生变化并完成 DDNS 同步时发送。',
        location: '动态域名 → DDNS 任务 → 编辑 → Webhook',
        support: 'native',
        defaultSelected: true,
        bodyTemplate: `{
  "title": "公网IP更新",
  "content": "在{time}更新为{ipAddr}",
  "event": "ip_changed"
}`,
      },
      {
        id: 'stun_changed',
        name: 'STUN 公网地址变化',
        summary: 'STUN 穿透得到的公网 IP 或端口变化时发送。',
        location: 'STUN 内网穿透 → 穿透规则 → 编辑 → Webhook，或 STUN 设置 → 全局 Webhook',
        support: 'native',
        bodyTemplate: `{
  "title": "STUN地址更新",
  "content": "在#{time}，#{ruleName}更新为#{ipAddr}",
  "event": "stun_changed"
}`,
      },
      {
        id: 'device_online',
        name: '设备上线',
        summary: 'Lucky 检测到指定网络唤醒设备上线时发送。',
        location: '网络唤醒 → 对应设备 → 上下线 Webhook（具体位置随 Lucky 版本不同）',
        support: 'native',
        note: '复制后把“设备名称”替换成 NAS、电脑等实际名称。',
        bodyTemplate: `{
  "title": "设备名称已上线",
  "content": "{NowDatetime}：设备名称已经上线",
  "event": "device_online"
}`,
      },
      {
        id: 'device_offline',
        name: '设备离线',
        summary: 'Lucky 检测到指定网络唤醒设备离线时发送。',
        location: '网络唤醒 → 对应设备 → 上下线 Webhook（具体位置随 Lucky 版本不同）',
        support: 'native',
        note: '复制后把“设备名称”替换成 NAS、电脑等实际名称。',
        bodyTemplate: `{
  "title": "设备名称已离线",
  "content": "{NowDatetime}：设备名称已经离线，请检查网络或电源",
  "event": "device_offline"
}`,
      },
      {
        id: 'cron_result',
        name: '计划任务执行结果',
        summary: '先运行脚本或其他子任务，再由 CallWeb 发送其执行结果。',
        location: '计划任务 → 新建或编辑任务 → 在被报告任务后添加 CallWeb',
        support: 'scheduled',
        note: '把“任务名称”改成真实名称；末尾 1 代表第一个子任务。',
        bodyTemplate: `{
  "title": "计划任务完成",
  "content": "{NowDatetime}：{CRON_任务名称_1}",
  "event": "cron_result"
}`,
      },
      {
        id: 'port_forward_status',
        name: '端口转发状态报告',
        summary: '通过计划任务定时报告规则开关状态，不是端口故障事件。',
        location: '计划任务 → 添加 CallWeb，并设置需要的执行周期',
        support: 'scheduled',
        note: '把“规则名”改成端口转发中的真实规则名称；on 只表示规则已开启。',
        bodyTemplate: `{
  "title": "端口转发状态",
  "content": "{NowDatetime}：规则状态为{PF_规则名_STATUS}",
  "event": "port_forward_status"
}`,
      },
      {
        id: 'web_service_status',
        name: 'Web 服务状态报告',
        summary: '通过计划任务定时报告 Lucky Web 规则开关状态。',
        location: '计划任务 → 添加 CallWeb，并设置需要的执行周期',
        support: 'scheduled',
        note: '把主规则名、子规则名替换成 Lucky 中完全一致的名称。',
        bodyTemplate: `{
  "title": "Web服务状态",
  "content": "{NowDatetime}：反向代理状态为{WEB_主规则名_子规则名_STATUS}",
  "event": "web_service_status"
}`,
      },
      {
        id: 'certificate_renewal',
        name: '证书续签结果',
        summary: 'Lucky 当前没有可直接复制使用的原生续签完成 Webhook。',
        location: 'SSL 证书模块',
        support: 'unavailable',
        note: '只有自行编写证书检查脚本后，才能通过计划任务 CallWeb 发送脚本结果。',
      },
    ],
  },
  {
    id: 'openwrt-istoreos',
    name: 'OpenWrt 全能推送 / PushBot',
    category: '网络与软路由',
    summary: '已有 PushBot 用户可复制整段配置；首次接入 OpenWrt 优先推荐微信推送（wechatpush），两者配置不可混用。',
    confidence: 'verified',
    method: 'POST',
    contentType: 'application/json',
    pathStyle: 'hook',
    bodyTemplate: `{
  "title": "\${1}",
  "content": "\${2}",
  "event": "openwrt_notice"
}`,
    steps: [
      '打开 OpenWrt：服务 → 全能推送 → 基本设置，并勾选“启用”。',
      '在“推送模式”下拉框选择“自定义推送”。页面没有单独的 URL 输入框，这是正常的。',
      '清空“自定义推送”大文本框中的示例内容，点击上方“复制整段配置”，完整粘贴一次；不要拆分 URL、请求头和请求体。',
      '保存并应用后，点击文本框下方“发送测试”。随后回到 EasyNotice 的通知记录确认已收到。',
      '测试成功后，再到“推送内容”页勾选公网 IP、设备上下线、负载温度、Web/SSH 登录等需要的事件。',
      '手动测试后还需验证一次真实事件。仅当 PushBot 日志提示“请填写正确的 Token/Webhook”时，使用入口详情的兼容命令。',
    ],
    tips: [
      '首次接入 OpenWrt 优先推荐微信推送（luci-app-wechatpush）。本预设是全能推送 PushBot 专用配置；微信推送请按其自定义 API 说明接入通用 Webhook。已有正常配置不必迁移。',
      '生成内容已包含 EasyNotice 地址、POST JSON、标题 ${1}、正文 ${2} 和旧版 PushBot 需要的格式字段，不需要再手工修改。',
      'OpenWrt 必须能够访问配置中生成的 EasyNotice 地址；如果 EasyNotice 填的是仅浏览器可用的域名，请先确认路由器自身也能解析和访问。',
      'luci-app-pushbot 5.10 及以上仅支持 LuCI 23.05 及以上；旧固件请选择相应的兼容版本。',
      '部分 PushBot 版本会在 DIY 模式下错误检查内置渠道凭证，导致后台任务未运行；EasyNotice 会在入口详情提供可复制的兼容命令。',
    ],
    setupMode: 'openwrt-pushbot',
    searchTerms: ['openwrt', 'istore', 'istoreos', '软路由', 'pushbot', 'wechatpush', '全能推送', '自定义api'],
  },
  {
    id: 'ugreen-dxp',
    name: '绿联 NAS / UGOS Pro',
    category: 'NAS 系统通知',
    summary: 'EasyNotice 定时读取绿联 DXP 的系统消息，不需要在绿联系统里寻找 Webhook。',
    confidence: 'community',
    method: 'POST',
    contentType: 'application/json',
    pathStyle: 'hook',
    bodyTemplate: '{}',
    steps: [
      '填写浏览器访问绿联管理后台时使用的局域网地址，例如 http://192.168.1.20:9999。',
      '填写绿联本地用户的用户名和密码。EasyNotice 会加密保存密码，只用于登录这台 NAS。',
      '先点击“测试连接”；成功后，EasyNotice 会按设定间隔检查系统通知并自动去重。',
      '新通知会直接进入当前入口的图片规则和出口路由，不需要再配置企业微信机器人。',
    ],
    tips: [
      '首次连接默认只记录当前已有消息，不会补发历史通知；需要补发时可在创建入口时主动勾选。',
      '如果绿联账号启用了登录双重验证，当前本地接口可能无法完成无人值守登录；建议单独建立一个权限受控的本地账号。',
      'HTTPS 使用自签名证书时，需要打开“允许自签名证书”；只应对你确认属于自己的 NAS 使用。',
    ],
    setupMode: 'ugreen-dxp',
    searchTerms: ['绿联', 'ugreen', 'ugos', 'ugos pro', 'dxp', 'dxp2800', 'dxp4800', 'dxp6800', 'nas系统'],
  },
  {
    id: 'media-hub',
    name: '影视库中枢',
    category: 'MoviePilot、MediaIndex、NASTool 等',
    summary: '接收订阅、下载、整理、入库和任务失败等影视自动化通知。',
    confidence: 'community',
    method: 'POST',
    contentType: 'application/json',
    pathStyle: 'hook',
    bodyTemplate: `{
  "title": "影视库任务通知",
  "content": "订阅、下载或入库结果",
  "event": "media_task",
  "image": "https://example.com/poster.jpg",
  "url": "https://example.com/detail"
}`,
    steps: [
      'MoviePilot：在插件市场安装官方 WebHook 插件，在插件设置中把第三方地址填写为上面的 EasyNotice 接口地址；插件会自动发送事件内容。',
      'MediaIndex：如果当前版本提供“自定义 Webhook / 通知 URL”，选择 POST 与 JSON 后粘贴接口地址；如果页面只能填写企微机器人 Key，则该版本不能直接改成 EasyNotice 地址。',
      'NASTool：官方内置通知以企微、Telegram 等渠道为主；只有安装支持自定义 Webhook 的插件或转发组件后，才填写 EasyNotice 地址。',
      '发送一次真实的订阅、整理或入库测试，再到 EasyNotice 通知记录中确认标题、正文、海报和事件字段。',
    ],
    tips: [
      'MoviePilot 的 WebHook 插件只需要 EasyNotice 入口地址，不要把 MoviePilot 的管理员 API_TOKEN 填到 EasyNotice。',
      '不同版本发出的字段不完全一致；EasyNotice 可接收 JSON、表单和纯文本，第一次通知后再按实际事件添加图片规则。',
    ],
    searchTerms: ['moviepilot', 'movie pilot', 'mediaindex', 'media index', 'nastool', 'nas-tools', '订阅', '下载', '入库', '整理', '影视库'],
  },
  {
    id: 'mdc-ng',
    name: '影音与刮削',
    category: 'Emby、MDC-NG 等',
    summary: '接收播放、入库、刮削完成和失败事件，可按内容配置海报或状态图片。',
    confidence: 'verified',
    method: 'POST',
    contentType: 'application/json',
    pathStyle: 'hook',
    bodyTemplate: `{
  "event": "{{ event }}",
  "data": {
    "title": "{{ title }}",
    "number": "{{ number }}",
    "category": "{{ category }}",
    "poster": "{{ poster }}",
    "error_message": "{{ error_message }}"
  }
}`,
    steps: [
      'MDC-NG：在通知设置中新增 Endpoint，选择 POST，URL 粘贴接口地址，并使用下方 JSON 模板。',
      'Emby：先在插件目录安装 Webhooks 通知服务，再到通知设置新增 Webhook 并粘贴接口地址；Emby 会自动生成请求体，不需要粘贴 MDC-NG 模板。',
      'Jellyfin、Plex 或其他影音服务：找到 Webhook/Notifications 设置，优先选择 POST 与 JSON。',
      '先触发一次播放、入库或刮削事件，在通知记录中确认实际字段后再添加匹配图片。',
    ],
    tips: ['MDC-NG 的 poster 会自动作为图片；Emby 等产品的 Webhook 格式由其插件版本决定，也可以在 EasyNotice 中按成功/失败覆盖图片。'],
    searchTerms: ['mdc', 'mdc-ng', 'emby', 'jellyfin', 'plex', '刮削', '播放', '媒体', 'movie data capture'],
  },
  {
    id: 'uptime-kuma',
    name: 'Uptime Kuma',
    category: '监控',
    summary: '接收服务上线、掉线和证书告警。',
    confidence: 'community',
    method: 'POST',
    contentType: 'application/json',
    pathStyle: 'hook',
    bodyTemplate: `{
  "title": "{{ monitorJSON.name }}",
  "content": "{{ msg }}",
  "event": "{{ heartbeatJSON.status }}"
}`,
    steps: [
      '在通知设置里选择 Webhook。',
      '粘贴接口地址，请求体格式选择 JSON。',
      '先发送测试消息，再保存。',
    ],
    tips: ['不同版本的模板字段可能不同，EasyNotice 会同时尝试识别 msg 和 monitorJSON。'],
    searchTerms: ['uptime', 'kuma', '监控', '掉线'],
  },
  {
    id: 'watchtower',
    name: 'Watchtower / Shoutrrr',
    category: 'Docker',
    summary: '接收容器更新结果。HTTP 入口同时支持 JSON、表单和纯文本。',
    confidence: 'community',
    method: 'POST',
    contentType: 'application/json',
    pathStyle: 'hook',
    bodyTemplate: `{
  "title": "Docker 镜像更新",
  "content": "{{ message }}",
  "event": "container_update"
}`,
    steps: [
      '在通知 URL 或 Webhook URL 中粘贴接口地址。',
      '如果可以选择格式，优先选择 JSON。',
      '发送一次测试，EasyNotice 会显示实际收到的字段。',
    ],
    tips: ['只支持 URL 的程序也可以使用 GET：在地址后添加 ?title=标题&content=正文。'],
    searchTerms: ['watchtower', 'shoutrrr', 'docker', '更新'],
  },
];

export function getRecipe(id: string): Recipe {
  return recipes.find((recipe) => recipe.id === id) ?? recipes.find((recipe) => recipe.id === 'generic')!;
}

export function inferLegacyRecipeId(name: string, recipeId: string): string {
  if (recipeId !== 'generic') return recipeId;
  return /openwrt|istore\s*os|pushbot|全能推送/i.test(name) ? 'openwrt-istoreos' : recipeId;
}
