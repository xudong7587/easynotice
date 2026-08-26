# EasyNotice

EasyNotice 是面向 NAS 用户的统一通知 Docker。它把不同容器发来的 Webhook 先转换成同一种通知格式，再按你设置的顺序发送到企业微信应用、企业微信群机器人、Telegram 或 Bark。

核心目标不是增加更多配置项，而是让不熟悉 Webhook 的用户也能完成三件事：

1. 选择原应用，复制 EasyNotice 给出的地址、请求方法、内容类型和请求体。
2. 先测试单个通知出口，再选择“全部发送”或“失败后补位”。
3. 在通知记录中明确看到收到什么、命中哪条规则、在哪个渠道失败、最终是否由备用渠道送达。

## 已实现

- Lucky、MDC-NG、Uptime Kuma、Watchtower / Shoutrrr 和通用 Webhook 预设
- `POST`、`GET`、JSON、表单和纯文本入口
- 常见字段自动识别：`title`、`subject`、`content`、`body`、`message`、`poster`、`thumb`、`url` 等
- 每个入口使用独立随机密钥，可随时更换
- 企业微信应用、企业微信群机器人、Telegram Bot、Bark 出口
- 失败后自动补位，例如“企微应用 -> 企微群机器人”
- 全部渠道同时发送
- SQLite 持久队列，服务重启后恢复未完成事件
- 每个入口可配置多条图片和模板规则
- 本地图片素材库
- 逐次投递记录、失败原因、整链路测试和手动重试
- 首次启动向导、内置新手指南、深色模式和手机布局
- 可选 OpenAI 兼容 AI 助手，通过项目名称或截图生成待确认的接入建议
- 管理密码、HttpOnly 会话、AES-256-GCM 密钥加密

## 推荐部署：GitHub 自动构建镜像

不需要在 NAS 或本机执行 `docker build`。推荐把仓库命名为 `easynotice` 并推送到 GitHub：

1. `.github/workflows/ci.yml` 会执行类型检查、测试和生产构建。
2. `.github/workflows/publish-image.yml` 会在推送到 `main` 后再次通过检查，再构建 `linux/amd64` 和 `linux/arm64`；检查失败不会发布镜像。
3. 镜像自动发布为 `ghcr.io/xudong7587/easynotice:latest`。
4. 打开 GitHub 仓库的 Packages 页面。如果希望 NAS 免登录拉取，把该 Package 的可见性设置为 Public。
5. 复制 `.env.example` 为 `.env`，把镜像地址改成自己的地址。

官方 Compose 只拉取公开的独立镜像，不依赖源码目录、Node.js 或开发电脑。服务在容器内明确监听 `0.0.0.0:18088`，宿主机端口也明确绑定到 `0.0.0.0`，默认通过 NAS 的 `18088` 端口向全部 IPv4 局域网网卡开放。可以在 `.env` 中用 `EASYNOTICE_PORT` 修改 NAS 侧端口。

```bash
cp .env.example .env
docker compose pull
docker compose up -d
```

以后更新：

```bash
docker compose pull
docker compose up -d
```

如果 GHCR Package 保持私有，需要先在 NAS 登录：

```bash
echo "你的GitHub PAT" | docker login ghcr.io -u 你的GitHub用户名 --password-stdin
```

PAT 只需要 `read:packages` 权限。

## 本地构建（仅开发时需要）

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build
```

部署后打开：

```text
http://你的NAS地址:18088
```

### 反代能打开、局域网 IP 却打不开

先在地址栏明确输入 `http://NAS局域网IP:18088/health`，不要写成 `https://`。如果外网反向代理正常，说明 EasyNotice 进程和网页通常都已经启动；此时最常见的是旧容器尚未重建、宿主机端口只监听回环地址，或 NAS 防火墙阻止局域网直接访问该端口。

先在 NAS 的终端依次检查：

```bash
docker compose pull
docker compose up -d --force-recreate
docker compose ps
docker port easynotice 18088
curl http://127.0.0.1:18088/health
```

正常时应看到类似 `0.0.0.0:18088->18088/tcp` 或 `0.0.0.0:18088` 的端口映射，并收到包含 `"status":"ok"` 的健康检查结果。若 `docker compose ps` 显示的不是 `0.0.0.0`，检查正在使用的 Compose 文件和 `.env`：

```dotenv
EASYNOTICE_PORT=18088
EASYNOTICE_BIND_IP=0.0.0.0
```

如果 NAS 本机的 `curl` 成功，但同一局域网设备访问 `http://192.168.11.239:18088/health` 失败，问题已经位于 EasyNotice 容器之外。请在 NAS 防火墙或安全套件中允许来源局域网（例如 `192.168.11.0/24`）访问 TCP `18088`，并检查访客 Wi-Fi、AP 隔离、VLAN 或路由访问控制。反向代理仍能工作并不能排除这种情况，因为反向代理通常从 NAS 本机回环地址或 Docker 内部网络访问容器，不会经过局域网入站防火墙。

如果 NAS 本机的 `curl` 也失败，查看容器状态和日志：

```bash
docker compose ps
docker compose logs --tail=100 easynotice
```

端口被占用时容器通常无法启动；数据目录权限或数据库启动失败也会直接出现在日志里。

首次进入会要求：

- 创建至少 8 位的管理密码
- 确认其他容器能够访问的 EasyNotice 地址，例如 `http://192.168.1.10:18088`

数据默认保存在项目目录的 `./data`，其中包含：

- `easynotice.db`：设置、入口、规则和通知记录
- `.installation-secret`：本机加密主密钥
- `uploads/`：通知图片素材

请把整个 `data` 目录一起备份。只备份数据库而漏掉 `.installation-secret`，已保存的企微 Secret、Bot Token 等内容将无法解密。

### NAS 挂载目录权限

容器启动时会检查 `/app/data`，为宿主机挂载目录创建 `uploads` 并修复所有权，然后立即降权为 UID 1000 的 `node` 用户运行 EasyNotice。因此直接使用默认的 `./data:/app/data` 即可，不需要执行 `chmod 777`。

如果数据目录位于禁止修改所有权的 NFS、SMB 或特殊共享存储上，请改用 Docker 命名卷，或在 NAS 上预先为 UID 1000 授予读写权限。

## 推荐的第一次配置

1. 在“通知出口”中添加企业微信群机器人或 Bark。
2. 点击“发送测试”，确认手机或群聊已经收到。
3. 在“通知入口”中选择 Lucky、MDC-NG 或通用 Webhook。
4. 把生成的四项内容复制到原应用。
5. 从入口详情发送“整链路测试”。
6. 打开“通知记录”，确认识别结果和投递过程。

## 企业微信主备补位

企业微信应用获取 Token 时可能受到企业可信 IP 限制。公网 IP 变化后，企微应用可能先返回鉴权失败。

EasyNotice 的推荐配置是：

1. 添加“企业微信应用”。
2. 添加“企业微信群机器人”。
3. 在通知入口详情中选择“失败后补位”。
4. 把企业微信应用排在顺位 1。
5. 把群机器人排在顺位 2。

每条消息会先尝试企微应用，失败后重试一次，再自动尝试群机器人。通知记录会保留两边的结果。

## Bark 简介

Bark 是面向 iPhone 的推送工具。打开 Bark 后会看到类似下面的个人推送地址：

```text
https://api.day.app/你的设备Key/
```

在 EasyNotice 中添加 Bark 时填写：

- Bark Key：可直接粘贴 Bark 首页的完整测试地址，EasyNotice 会自动拆分；手工填写时使用服务器域名后的第一段设备 Key
- Bark 服务器：默认 `https://api.day.app`，也可以填写自建服务
- 分组：例如 `EasyNotice`
- 通知铃声：可选，例如 `minuet`
- 时效级别：普通、时效通知或静默

EasyNotice 会发送标题、正文、分组、点击链接和公网图片图标。本地上传的图片不能直接充当 Bark `icon`，因为 Bark 服务必须能够从公网访问图片地址。

## 通用入口

推荐 JSON：

```json
{
  "title": "通知标题",
  "content": "通知正文",
  "event": "default",
  "image": "https://example.com/image.jpg",
  "url": "https://example.com/detail"
}
```

只支持 URL 的程序也可以使用 GET：

```text
http://NAS:18088/hook/你的入口密钥?title=通知标题&content=通知正文
```

兼容旧式路径：

```text
http://NAS:18088/api/v1/notify/入口名称?token=入口密钥
```

还可以把入口密钥放在请求头：

```text
Authorization: Bearer 入口密钥
```

或：

```text
X-EasyNotice-Token: 入口密钥
```

## 图片与内容规则

每个入口可以创建多条规则。规则按优先级从小到大匹配，第一条命中的规则生效。

可检查的字段：

- 标题
- 正文
- 事件类型
- 严重级别：`info`、`success`、`warning`、`error`
- 标题、正文和原始数据的任意位置

可用条件：包含、等于、正则表达式、所有通知。

标题和正文模板支持简单路径占位符：

```text
[失败] {{ title }}
{{ body }} / {{ data.number }}
```

模板不会执行 JavaScript 或 Jinja2，只读取收到的数据字段。

## AI 配置助手

AI 助手是可选功能，真实通知链路不依赖 AI。

在“系统设置”中填写：

- OpenAI 兼容的 `/v1` 接口地址
- 模型名称
- API Key

之后在添加通知入口时，可以：

- 输入项目名称或 README 中的通知说明
- 上传 Webhook 配置页面截图

AI 只返回待确认建议，不会自动创建入口或修改 Docker。上传截图前请遮住 Token、Cookie、Webhook Key 和不希望发送到模型服务的 IP 地址。

## 当前入口边界

当前版本以 HTTP Webhook 为稳定核心，同时兼容 GET、表单和纯文本。没有直接开启 SMTP、MQTT 或 Syslog 监听端口。

这些协议适合以后作为独立适配器加入：

- MQTT：订阅 NAS 内部消息主题
- SMTP：把仅支持邮件通知的设备邮件转换为标准通知
- Syslog：接收路由器和系统日志，再按规则筛选
- Apprise / Shoutrrr 兼容 URL：让已有通知生态直接指向 EasyNotice

它们都会先进入现有的标准通知模型，因此不会改变规则、路由和出口层。

## 安全说明

- 管理 API 需要登录，会话 Cookie 使用 `HttpOnly` 和 `SameSite=Strict`。
- 渠道密钥和 AI API Key 使用 AES-256-GCM 加密。
- 每个入口地址使用独立高强度随机密钥。
- 更换入口密钥后，旧地址立即失效。
- 图片上传限制为 4 MB，只接受 PNG、JPEG、WebP 和 GIF。
- 企业微信图片上限按 2 MB 校验。
- AI 截图最大约 6 MB，服务端只接受图片 Data URL。
- 默认没有公网暴露要求。建议只在局域网访问管理页面；需要反向代理时同时启用 HTTPS。
- 如果在 HTTPS 反向代理后运行，可设置 `EASYNOTICE_COOKIE_SECURE=true`。
- 可以通过 `EASYNOTICE_SECRET` 显式提供加密主密钥；未提供时会自动生成并保存在数据目录。

## 本地开发

需要 Node.js 22 或更高版本。

```bash
npm install
npm run dev
```

- 管理前端：`http://localhost:5173`
- API：`http://localhost:18088`

检查和测试：

```bash
npm run check
npm test
npm run build
```

## 健康检查

```text
GET /health
```

成功时返回：

```json
{
  "status": "ok",
  "service": "easynotice"
}
```

## 项目结构

```text
server/
  channels.ts       四类通知出口适配
  normalize.ts      Webhook 字段归一化
  templates.ts      规则匹配与安全模板
  worker.ts         持久队列与主备补位
  routes/           管理 API
src/
  pages/            管理页面与向导
  components/       基础组件和产品外壳
data/               数据库、密钥和上传素材
```

EasyNotice 参考了通知聚合工具的通用思路，但实现重点放在小白可完成的向导、可解释失败、主备路由和按事件识别图片上。
