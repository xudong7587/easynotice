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
  webhookTemplates?: RecipeWebhookTemplate[];
}

export const recipes: Recipe[] = [
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
    id: 'mdc-ng',
    name: 'MDC-NG',
    category: '影音与刮削',
    summary: '接收刮削完成、失败和媒体分类信息，可按事件配置不同图片。',
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
      '在 MDC-NG 通知设置中新增 Endpoint，名称可以写 EasyNotice。',
      '请求方式选择 POST，URL 粘贴接口地址。',
      '新增 Content-Type: application/json 请求头。',
      'Body 模板粘贴提供的 JSON，可按需要勾选 finished 和 failed。',
    ],
    tips: ['海报 poster 会自动作为图片；也可以在 EasyNotice 里按成功/失败覆盖图片。'],
    searchTerms: ['mdc', 'mdc-ng', '刮削', '媒体', 'movie data capture'],
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
  {
    id: 'generic',
    name: '通用 Webhook',
    category: '通用',
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
];

export function getRecipe(id: string): Recipe {
  return recipes.find((recipe) => recipe.id === id) ?? recipes[recipes.length - 1];
}
