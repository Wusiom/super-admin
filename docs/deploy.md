# Super Admin 部署指南

## 当前生产链路

当前已经跑通的链路是：

```text
push 到 main
  -> GitHub Actions 触发 .github/workflows/deploy.yml
  -> Actions 通过 SSH 登录 VPS
  -> VPS 进入 /opt/super-admin
  -> git fetch origin main
  -> git reset --hard origin/main
  -> COMPOSE_PARALLEL_LIMIT=1 docker compose build
  -> docker compose up -d --no-build
  -> docker compose ps
  -> curl -fsS http://127.0.0.1/
  -> curl -fsS http://127.0.0.1/api/tools
  -> docker image prune -f
```

生产访问地址：

```text
http://8.130.118.128/
```

## 和旧链路的区别

旧链路的问题不是 SSH，也不是 GitHub Actions。SSH 已经能连到 VPS，VPS 也能拉到 `origin/main`。

真正卡住的是 VPS 本机构建：

- 旧命令是 `docker compose up -d --build`，Compose 会并发构建 `server` 和 `client`。
- 2 核 2GB 的 VPS 同时跑多个 Docker build 阶段，多个 `pnpm install` 一起下载和安装依赖。
- server/client Dockerfile 之前都会复制对方的 `package.json`，导致安装范围偏大。
- 结果就是部署日志长时间停在 `pnpm install`，看起来像“部署失败”，实际是小机器被构建压住了。

现在的区别：

- 构建和启动拆开：先 `docker compose build`，再 `docker compose up -d --no-build`。
- 设置 `COMPOSE_PARALLEL_LIMIT=1`，让 Compose 串行构建镜像，降低 VPS 内存压力。
- server 镜像只安装 server workspace 依赖：`pnpm install --filter server`。
- client 镜像只安装 client workspace 依赖：`pnpm install --filter client`。
- 启动后立刻跑 `docker compose ps` 和两个 `curl` 自检，失败点会直接暴露在 Actions 日志里。

## 前置要求

- VPS / 云服务器，当前生产机器为阿里云 ECS，Ubuntu 22.04 64 位。
- Docker 和 Docker Compose 已安装。
- VPS 上项目目录固定为 `/opt/super-admin`。
- GitHub 仓库配置以下 Secrets：
  - `VPS_HOST`
  - `VPS_USERNAME`
  - `VPS_SSH_KEY`
- 防火墙至少允许 HTTP 访问：
  - `80/tcp`
  - 如后续配置 HTTPS，再开放 `443/tcp`

## 首次部署

首次部署需要先在 VPS 上准备项目目录和环境变量。

```bash
cd /opt
git clone <your-repo-url> super-admin
cd /opt/super-admin
```

创建 `.env`：

```bash
cat > .env << 'EOF'
CLIENT_PORT=80
SERVER_PORT=3001
DATABASE_URL=file:/app/data/prod.db
REDIS_HOST=redis
REDIS_PORT=6379
EOF
```

首次手动启动：

```bash
COMPOSE_PARALLEL_LIMIT=1 docker compose build
docker compose up -d --no-build
docker compose ps
curl -fsS http://127.0.0.1/
curl -fsS http://127.0.0.1/api/tools
```

## 日常部署

日常部署不需要 SSH 手动执行命令。

只要把代码 push 到 `main`：

```bash
git push origin main
```

GitHub Actions 会自动 SSH 到 VPS 并执行部署脚本。

如果必须手动在 VPS 上部署，使用和 Actions 一致的命令：

```bash
cd /opt/super-admin
git fetch origin main
git reset --hard origin/main
COMPOSE_PARALLEL_LIMIT=1 docker compose build
docker compose up -d --no-build
docker compose ps
curl -fsS http://127.0.0.1/
curl -fsS http://127.0.0.1/api/tools
docker image prune -f
```

不要再用下面这个旧命令作为生产部署入口：

```bash
docker compose up -d --build
```

它在本机开发可以用，但在 2 核 2GB VPS 上容易因为并发构建和依赖安装拖很久。

## 服务组成

`docker-compose.yml` 启动 3 个服务：

- `redis`：BullMQ 队列依赖，数据保存在 `redis-data` volume。
- `server`：NestJS API，容器内监听 `3000`，宿主机默认映射到 `3001`。
- `client`：nginx 托管 Vue 静态资源，并把 `/api/` 反向代理到 `server:3000`。

生产访问一般走 `client` 的 80 端口：

```text
用户浏览器 -> http://8.130.118.128/ -> client nginx -> /api -> server -> redis / SQLite
```

`client` nginx 已配置 `client_max_body_size 5m`，与 NestJS 的 JSON body 上限保持一致。知识采集扩展发送较大的页面快照时，请求体应先到达后端并返回应用层认证或校验结果，而不是被 nginx 拦截为 `413 Request Entity Too Large`。

SQLite 数据库位于容器内 `/app/data/prod.db`，通过 `server-data` volume 持久化。

## 验证部署

在 VPS 上验证：

```bash
cd /opt/super-admin
docker compose ps
curl -fsS http://127.0.0.1/
curl -fsS http://127.0.0.1/api/tools
```

在本机浏览器验证：

```text
http://8.130.118.128/
```

如果 GitHub Actions 失败，优先看日志停在哪一步：

- `git fetch` / `git reset` 失败：仓库权限或 VPS 网络问题。
- `docker compose build` 失败：镜像构建或依赖安装问题。
- `docker compose up -d --no-build` 失败：容器启动问题。
- `curl http://127.0.0.1/` 失败：前端 nginx 没起来或 80 端口异常。
- `curl http://127.0.0.1/api/tools` 失败：后端健康检查、API、Redis 或数据库异常。

## 备份数据库

SQLite 数据库在 Docker volume 中。备份前建议确认服务状态：

```bash
cd /opt/super-admin
docker compose ps
docker cp super-admin-server-1:/app/data/prod.db ./backup-$(date +%Y%m%d).db
```

恢复：

```bash
cd /opt/super-admin
docker cp ./backup-20260529.db super-admin-server-1:/app/data/prod.db
docker compose restart server
```

定时备份示例：

```cron
0 3 * * * docker cp super-admin-server-1:/app/data/prod.db /opt/backups/super-admin-$(date +\%Y\%m\%d).db
```

## 日志与排查

常用命令：

```bash
cd /opt/super-admin
docker compose logs -f --tail=100 server
docker compose logs -f --tail=100 client
docker compose logs -f --tail=100 redis
docker compose ps
```

常见问题：

| 问题 | 检查方式 |
| --- | --- |
| GitHub Actions SSH 失败 | 检查 `VPS_HOST`、`VPS_USERNAME`、`VPS_SSH_KEY` |
| 构建长时间卡住 | 确认使用 `COMPOSE_PARALLEL_LIMIT=1 docker compose build` |
| 前端无法访问 | `curl -fsS http://127.0.0.1/`，检查 `client` 容器日志 |
| API 无法访问 | `curl -fsS http://127.0.0.1/api/tools`，检查 `server` 容器日志 |
| Redis 连接失败 | `docker compose exec redis redis-cli PING` |
| 数据库错误 | `docker compose logs server | grep -i error` |
| 内存不足 | 给 VPS 增加 swap，或继续减少 Docker 构建阶段的依赖安装量 |

## Chrome 扩展部署

扩展不通过 Chrome Web Store 发布，当前方式是开发者模式加载 `extension/` 目录。

加载步骤：

1. 打开 Chrome，访问 `chrome://extensions/`。
2. 开启右上角“开发者模式”。
3. 点击“加载已解压的扩展程序”。
4. 选择项目中的 `extension/` 目录。

扩展 ID 由 `extension/manifest.json` 里的 `"key"` 字段固定。这个 key 来自 `extension/extension.pem`，不要随意删除或重新生成，否则扩展 ID 会变化，已授权的扩展需要重新授权。

生产环境需要确保 `externally_connectable.matches` 包含当前访问地址。当前公网 IP 应包含：

```json
{
  "externally_connectable": {
    "matches": [
      "http://localhost:*/*",
      "http://127.0.0.1:*/*",
      "http://8.130.118.128/*"
    ]
  }
}
```

如果后续绑定 HTTPS 域名，再加入：

```json
"https://your-domain.com/*"
```

扩展权限说明：

| 权限 | 用途 |
| --- | --- |
| `activeTab` | 用户点击扩展时获取当前标签页 URL |
| `storage` | 存储 API token 和后端 URL 配置 |
| `cookies` | 读取当前页面 Cookie |
| `scripting` | 注入脚本提取 localStorage |

## HTTPS

当前公网 IP 已可通过 HTTP 访问。

后续如果绑定域名，推荐在 VPS 上用 Caddy 做 HTTPS 反向代理：

```caddyfile
your-domain.com {
    reverse_proxy localhost:80
}
```

如果外层反向代理也限制请求体大小，需要允许至少 5MB，否则知识采集的大页面快照仍可能在 Caddy 或其他代理层被拦截。

然后重新加载 Caddy：

```bash
sudo systemctl reload caddy
```

Chrome 扩展的 `externally_connectable.matches` 也需要加入生产域名，例如：

```json
{
  "externally_connectable": {
    "matches": [
      "http://localhost:*/*",
      "http://127.0.0.1:*/*",
      "http://8.130.118.128/*",
      "https://your-domain.com/*"
    ]
  }
}
```
