# EasyNotice

EasyNotice 是一个面向 NAS 和家庭服务器的统一通知中心。它接收 Lucky、OpenWrt / iStoreOS 通知插件、MoviePilot、Emby、MDC-NG、Uptime Kuma、Watchtower 等应用发来的 Webhook，统一整理标题、正文、图片和链接，再按规则发送到企业微信、Telegram 或 Bark。

当前稳定版本：[`v0.1.5`](https://github.com/xudong7587/easynotice/releases/tag/v0.1.5)

普通用户只需要 Docker Compose，不需要安装 Node.js，也不需要下载源码后自行构建镜像。

## 它能做什么

- 接收 `POST`、`GET`、JSON、表单和纯文本 Webhook
- 内置通用 Webhook、Lucky、OpenWrt / iStoreOS、影视库中枢、影音与刮削、Uptime Kuma、Watchtower / Shoutrrr 预设
- 自动识别 `title`、`subject`、`content`、`body`、`message`、`poster`、`thumb`、`url` 等常见字段
- 发送到企业微信应用、企业微信群机器人、Telegram Bot 和 Bark
- 企业微信应用可选接收成员消息和事件回调，自动验签、解密并留档
- 每个入口可勾选出口、单独测试，并选择“每个出口都发送”或“失败后按顺序补位”
- 按通知内容匹配标题、正文、图片和链接规则
- 保存每一次接收、匹配、重试和投递结果
- SQLite 持久队列，容器重启后继续处理未完成通知
- 管理密码、HttpOnly 会话和 AES-256-GCM 密钥加密
- 首次启动向导、出口配置引导、深色模式和手机布局

通知链路可以简单理解为：

```text
原应用 → EasyNotice Webhook → 内容识别与规则 → 主备路由 → 企微 / Telegram / Bark
```

## 推荐部署：Docker Compose

这是普通用户的推荐部署方式。官方镜像同时支持 `linux/amd64` 和 `linux/arm64`。

NAS 有终端时，可以直接下载仓库中的最新版 Compose 文件：

```bash
mkdir -p easynotice
cd easynotice
curl -fsSL https://raw.githubusercontent.com/xudong7587/easynotice/main/docker-compose.yml -o docker-compose.yml
```

下载完成后，可以直接跳到下面的“2. 启动”。使用 NAS 图形界面或希望手工核对配置时，按接下来的步骤创建文件。

### 1. 创建 Compose 项目

在 NAS 上新建一个 `easynotice` 文件夹，在里面保存下面的内容为 `docker-compose.yml`：

```yaml
services:
  easynotice:
    image: ghcr.io/xudong7587/easynotice:latest
    container_name: easynotice
    restart: unless-stopped
    ports:
      - "18088:18088"
    environment:
      TZ: Asia/Shanghai
      HOST: 0.0.0.0
      PORT: 18088
    volumes:
      - ./data:/app/data
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://127.0.0.1:18088/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 15s
```

仓库中的 [`docker-compose.yml`](./docker-compose.yml) 就是当前维护中的官方版本。建议优先使用仓库文件，README 里的内容用于直接复制和核对。

不需要创建 `.env`。要修改 NAS 对外端口，只改端口映射左边的数字。例如改用 `28088`：

```yaml
ports:
  - "28088:18088"
```

右边的容器端口 `18088` 保持不变。

### 2. 启动

在 `docker-compose.yml` 所在目录执行：

```bash
docker compose pull
docker compose up -d
docker compose ps
```

正常时，`docker compose ps` 会显示容器正在运行，端口类似：

```text
0.0.0.0:18088->18088/tcp
```

然后打开：

```text
http://你的NAS局域网IP:18088
```

例如：

```text
http://192.168.11.239:18088
```

### NAS 图形界面部署

群晖 Container Manager、威联通 Container Station、Portainer 和其他支持 Compose/Stack 的管理工具都可以使用同一份配置：

1. 新建 Compose 项目或 Stack。
2. 粘贴上面的 `docker-compose.yml`。
3. 确认项目目录中的 `./data` 会挂载到容器 `/app/data`。
4. 部署项目，等待健康状态变为正常。
5. 用 `http://NAS局域网IP:18088` 打开管理页面。

不建议在 NAS 图形界面中手工逐项创建一个普通容器。Compose 能完整保留端口、数据目录、健康检查和重启策略，后续更新也更容易复现。

## 首次使用

第一次打开管理页面时：

1. 创建至少 8 位的管理密码。
2. 填写“其他容器访问 EasyNotice 的地址”。
3. 这个地址应使用其他容器能访问的 NAS IP，例如 `http://192.168.11.239:18088`，不要填写 `localhost`。

接下来建议按这个顺序跑通第一条通知：

1. 打开“通知出口”，添加企业微信群机器人或 Bark。
2. 按页面里的逐步引导取得 Webhook、Token、Chat ID 或 Bark Key。
3. 保存出口后点击“图文预览”，选择 Lucky、OpenWrt 等来源查看真实标题、正文和图片效果。
4. 打开“通知入口”，选择原应用预设或通用 Webhook。
5. 把 EasyNotice 生成的地址、请求方式、内容类型和请求体复制到原应用。
6. 在入口详情发送“整链路测试”。
7. 到“通知记录”查看识别结果和每次投递过程。

选择 Lucky 入口时，可以直接勾选 DDNS、STUN、设备上下线或计划任务等场景；页面会分别生成可复制的 JSON，并注明应粘贴到 Lucky 的哪个位置。端口转发和 Web 服务仅能通过计划任务定时报告规则开关状态，不等同于真实可用性检测。Lucky 当前没有原生的证书续签完成 Webhook，因此 EasyNotice 会明确标为不可直接配置，而不会生成虚假的开箱即用模板。

OpenWrt 与 iStoreOS 本身没有统一的系统通知 Webhook。对应预设用于 `luci-app-wechatpush`、`luci-app-pushbot` 等支持自定义 API 的通知插件，页面会明确提示先安装匹配固件版本的插件。

“影视库中枢”面向 MoviePilot、MediaIndex、NASTool 等订阅与整理工具。MoviePilot 可以使用官方 WebHook 插件直接填写 EasyNotice 地址；MediaIndex 和 NASTool 是否能直连取决于具体版本是否提供自定义 Webhook，只有企微机器人 Key 而没有自定义 URL 的版本不能直接替换地址。“影音与刮削”则面向 Emby、MDC-NG、Jellyfin、Plex 等播放、入库和刮削事件。

## 通知出口怎么选

### 企业微信群机器人

配置最简单，只填写群聊机器人 Webhook 中 `key=` 后面的机器人 Key。原应用仍然只连接 `https://你的EasyNotice地址/hook/随机令牌`，不会接触企微官方地址或机器人 Key；EasyNotice 在服务端补全并调用企微接口，适合先跑通通知，也适合作为企微应用的备用渠道。

新版企业微信通常在目标内部群的“消息推送 → 自定义消息推送”中创建；旧版客户端中可能显示为“群机器人 → 添加机器人”。EasyNotice 的添加出口弹窗中有完整步骤和字段对照。

EasyNotice 会自动选择企微机器人消息类型：普通通知发送纯文字；匹配到本地或公网图片时发送一条图文卡片，点击卡片后打开通知链接，没有通知链接时则打开图片。本地图片会使用带签名的只读公网地址，因此系统设置中的 EasyNotice 外部地址必须能被企业微信访问。机器人 Key 属于敏感凭证，不要公开。

### 企业微信应用

适合向指定成员或部门发送应用消息，需要：

- 企业 ID（CorpID）
- 自建应用的 AgentId
- 自建应用的 Secret
- 接收成员账号或部门 ID
- 正确配置企业可信 IP

企业可信 IP 应填写 NAS 访问互联网时使用的公网出口 IP，不是 `192.168.x.x` 局域网地址。如果公网 IP 经常变化，推荐同时添加群机器人作为备用出口。

企微应用匹配到本地图片时，会先上传临时素材，再用 `mpnews` 合成为一条包含缩略图、标题和正文的图文消息，不再拆成一条文字和一条图片；使用公网图片时发送普通图文卡片。

EasyNotice 的企业微信应用出口默认只负责主动发送通知。因此在不启用交互回调时，企业微信后台“接收消息 → 设置 API 接收”中的回调 URL、Token、EncodingAESKey 均不需要填写，网页授权回调域也不是发送通知的必要配置。保存出口并发送图文预览时，如果企业微信返回错误 `60020`，EasyNotice 会在错误详情中直接显示企微识别到的公网出口 IP；把这个 IP 加入“开发者接口 → 企业可信 IP”后再测试即可。

如需为后续交互做准备，可以在保存企微应用出口后重新编辑，按需启用“接收消息与事件回调”。EasyNotice 会生成专属回调 URL，完成企业微信 GET 验证、签名校验和 AES 解密，并留存最近收到的消息或事件；当前版本不会自动回复成员。Token 与 EncodingAESKey 必须和企微后台完全一致，配置时先保存 EasyNotice，再在企微后台保存验证。回调地址必须能从公网访问，建议使用标准 HTTPS 443。

### Telegram Bot

需要在官方 `@BotFather` 创建 Bot，再取得目标私聊、群组或频道的 Chat ID。中国大陆网络无法直连 Telegram API 时，可以填写自己可信的 API 反向代理地址，不要使用来历不明的公共代理。

### Bark

适合推送到个人 iPhone。可以把 Bark 首页显示的完整测试地址直接粘贴到“Bark Key”，EasyNotice 会自动拆分服务器地址和设备 Key。

还可以设置通知分组、铃声和时效级别。远程图片或本地素材的带签名地址都必须能被 Bark 服务器从公网访问，才能显示为通知图标。

## 企业微信主备补位

推荐顺序：

1. 添加并测试“企业微信应用”。
2. 添加并测试“企业微信群机器人”。
3. 在通知入口详情选择“失败后补位”。
4. 把企微应用排在顺位 1。
5. 把群机器人排在顺位 2。

每条通知会先尝试企微应用。重试后仍失败，EasyNotice 会自动尝试群机器人，并在通知记录中保留两边的结果。

## 更新、固定版本和回退

### 更新 `latest`

进入 Compose 项目目录执行：

```bash
docker compose pull
docker compose up -d --force-recreate
docker compose ps
```

`docker compose restart` 不会拉取新镜像，更新时不要只执行 restart。

### 固定到某个版本

把 Compose 中的镜像标签从 `latest` 改为固定版本：

```yaml
image: ghcr.io/xudong7587/easynotice:v0.1.5
```

再执行：

```bash
docker compose pull
docker compose up -d --force-recreate
```

所有已发布版本都在 [GitHub Releases](https://github.com/xudong7587/easynotice/releases) 中。

### 回退

把 Compose 中的镜像标签改回上一个版本，再重新拉取并创建容器：

```bash
docker compose pull
docker compose up -d --force-recreate
```

回退前建议先备份 `data`。新版数据库如果发生结构升级，旧版程序不一定能够读取。

## 数据目录与备份

默认挂载：

```yaml
volumes:
  - ./data:/app/data
```

也就是说，数据保存在 Compose 项目目录的 `data` 文件夹：

```text
data/
├── easynotice.db
├── easynotice.db-wal
├── easynotice.db-shm
├── .installation-secret
└── uploads/
```

- `easynotice.db`：设置、入口、规则、队列和通知记录
- `.installation-secret`：本机加密主密钥
- `uploads/`：上传的通知图片素材

备份时必须复制整个 `data` 文件夹。只备份数据库而漏掉 `.installation-secret`，已经保存的企微 Secret、Bot Token 和其他加密配置将无法解密。

默认模式兼顾开箱即用：`.installation-secret` 会以仅容器用户可读的权限保存在持久化目录。数据库中的企微 Secret、机器人 Key、Telegram Token、Bark Key、AI API Key、入口令牌、原始 Webhook 数据和企微回调原文均使用 AES-256-GCM 加密；管理密码使用 bcrypt，登录会话和入口令牌同时保存不可逆哈希。

如果整份 `data` 目录被一并复制，目录中的主密钥仍可用于解密数据库。安全要求更高时，可把主密钥放在持久化目录之外，并只读挂载到容器：

```yaml
services:
  easynotice:
    environment:
      EASYNOTICE_SECRET_FILE: /run/secrets/easynotice_master
    secrets:
      - easynotice_master

secrets:
  easynotice_master:
    file: ./secrets/easynotice_master
```

密钥文件内容至少 32 个字符，生成后不能随意更换；否则已有加密配置无法读取。上面的加固是可选项，默认 Compose 不需要 `.env` 或额外密钥文件。

为了得到一致的 SQLite 备份，建议短暂停止服务后再复制：

```bash
docker compose stop
tar -czf easynotice-data-backup.tar.gz data
docker compose start
```

容器启动时会创建 `uploads`、修复默认绑定目录的所有权，然后降权为 UID 1000 的 `node` 用户运行，不需要执行 `chmod 777`。

如果 `data` 位于不允许修改所有权的 NFS、SMB 或特殊共享存储，请为 UID 1000 预先授予读写权限，或改用 Docker 命名卷。

## 健康检查与局域网排障

### 1. 检查容器和端口

```bash
docker compose ps
docker port easynotice 18088
docker compose logs --tail=100 easynotice
```

正常端口映射应包含：

```text
0.0.0.0:18088
```

如果显示 `127.0.0.1:18088`，说明当前运行的不是仓库中的官方端口配置。确认 Compose 使用下面这行，然后强制重建容器：

```yaml
ports:
  - "18088:18088"
```

```bash
docker compose up -d --force-recreate
```

### 2. 在 NAS 本机测试

```bash
curl http://127.0.0.1:18088/health
```

正常会返回：

```json
{
  "status": "ok",
  "service": "easynotice"
}
```

### 3. 从局域网设备测试

```text
http://192.168.11.239:18088/health
```

如果 NAS 本机健康检查成功，但局域网设备打不开，问题已经位于 EasyNotice 容器之外。请检查：

- NAS 系统防火墙或安全套件是否允许 TCP `18088`
- 防火墙规则是否允许来源网段，例如 `192.168.11.0/24`
- 手机或电脑是否连接了访客 Wi-Fi
- 路由器是否启用了 AP 隔离、VLAN 隔离或访问控制
- NAS 是否有多个网卡，而访问的 IP 并不是当前有效地址

“外网反向代理能打开，但 `192.168.11.239:18088` 打不开”通常也是这个原因。反向代理可能从 NAS 本机回环地址或 Docker 内部网络访问容器，不会经过局域网入站防火墙。

## 反向代理

EasyNotice 不要求公网访问。只在局域网使用时，直接访问 NAS IP 即可。

需要反向代理时建议：

- 使用 HTTPS
- 将代理目标指向 `http://127.0.0.1:18088` 或 Docker 网络中的 EasyNotice
- 传递正确的 `Host`、`X-Forwarded-Host` 和 `X-Forwarded-Proto`
- 在 Compose 的 `environment` 中增加 `EASYNOTICE_COOKIE_SECURE: "true"`
- 不要公开 Webhook 密钥、机器人地址、Bot Token 和管理密码

注意：“其他容器访问 EasyNotice 的地址”必须真的能被那些容器访问。如果公网域名在内网不能回环，仍应填写 NAS 局域网地址。

## 通用 Webhook

推荐发送 JSON：

```json
{
  "title": "通知标题",
  "content": "通知正文",
  "event": "default",
  "image": "https://example.com/image.jpg",
  "url": "https://example.com/detail"
}
```

只支持 URL 的程序可以使用 GET：

```text
http://NAS:18088/hook/入口密钥?title=通知标题&content=通知正文
```

兼容旧式地址：

```text
http://NAS:18088/api/v1/notify/入口名称?token=入口密钥
```

入口密钥也可以放在请求头：

```text
Authorization: Bearer 入口密钥
```

或：

```text
X-EasyNotice-Token: 入口密钥
```

## 内容和图片规则

每个入口可以创建多条规则。规则按优先级从小到大检查，第一条匹配的规则生效。

可以匹配：

- 标题
- 正文
- 事件类型
- 严重级别：`info`、`success`、`warning`、`error`
- 标题、正文和原始数据中的任意内容

可以使用包含、等于、正则表达式或“所有通知”条件。

标题和正文模板支持安全的路径占位符：

```text
[失败] {{ title }}
{{ body }} / {{ data.number }}
```

模板只读取收到的数据字段，不会执行 JavaScript 或 Jinja2。

## 可选 AI 配置助手

AI 助手不是通知链路的必需组件。即使没有配置 AI，所有入口、规则、队列和出口仍可正常工作。

在“系统设置”中可以填写：

- OpenAI 兼容的 `/v1` 接口地址
- 模型名称
- API Key

之后可输入项目名称、通知说明或上传 Webhook 设置截图，让 AI 生成一份待确认的接入建议。AI 不会自动修改 Docker 或直接创建入口。

上传截图前请遮住 Token、Cookie、Webhook Key 和不希望发送给模型服务的地址。

## 安全说明

- 管理 API 登录后才能访问
- 会话 Cookie 使用 `HttpOnly` 和 `SameSite=Strict`
- 渠道密钥、AI API Key、入口令牌、原始请求数据和企微回调原文使用 AES-256-GCM 加密
- Webhook 中名为 token、secret、password、key、authorization、cookie 等字段会在入库前脱敏
- 数据目录默认使用 `0700`，数据库、主密钥和上传文件默认使用 `0600`；不支持 POSIX 权限的 NAS 文件系统需依赖共享文件夹 ACL
- 通知标题、正文、事件类型、发送状态和必要的来源标识会以可检索形式保存；请不要把密码或密钥写进通知正文
- 每个通知入口使用独立随机密钥，可随时更换
- 更换入口密钥后旧地址立即失效
- 图片上传限制为 4 MB，只接受 PNG、JPEG、WebP 和 GIF
- 企业微信图片按 2 MB 上限校验
- 默认不要求公网暴露管理页面
- 反向代理到公网时应启用 HTTPS 和安全 Cookie
- 本地图片供企微机器人或 Bark 拉取时使用不可猜测的签名只读地址，素材管理接口仍需要登录

## 查看状态和日志

```bash
docker compose ps
docker compose logs -f --tail=100 easynotice
```

只测试健康状态：

```bash
curl http://127.0.0.1:18088/health
```

## 本地开发

这一节只适用于参与开发，不是普通部署步骤。

需要 Node.js 22 或更高版本：

```bash
npm install
npm run dev
```

- 前端开发地址：`http://localhost:5173`
- API 地址：`http://localhost:18088`

检查和构建：

```bash
npm run check
npm test
npm run build
```

使用 Compose 构建本地源码镜像：

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build
```

## 项目结构

```text
server/
  channels.ts       通知出口适配
  normalize.ts      Webhook 字段归一化
  templates.ts      规则匹配与安全模板
  worker.ts         持久队列与主备补位
  routes/           管理 API
src/
  pages/            管理页面和向导
  components/       基础组件和出口配置引导
docker-compose.yml  推荐部署文件
data/               数据库、密钥和图片素材
```

- 镜像包：[GitHub Container Registry](https://github.com/xudong7587/easynotice/pkgs/container/easynotice)
- 版本发布：[GitHub Releases](https://github.com/xudong7587/easynotice/releases)
