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
      '在 Lucky 的 Webhook 设置中粘贴接口地址。',
      '请求方法选择 POST，请求头填写 application/json。',
      '把提供的请求体完整粘贴进去，然后保存并测试。',
    ],
    tips: ['Lucky 的 {time}、{ipAddr} 等变量会在发送时自动替换。'],
    searchTerms: ['lucky', '公网ip', 'ddns', '软路由'],
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
