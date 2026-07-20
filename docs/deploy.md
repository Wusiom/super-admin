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
  -> COMPOSE_PARALLEL_LIMIT=1 docker compose build（生产 .env 已启用生产覆盖）
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
- 后续持续集成环境也应安装 Docker Compose，使真实合并契约始终执行；未安装时该项测试会明确标记为跳过，静态标签契约仍会执行。
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
COMPOSE_FILE=docker-compose.yml:docker-compose.production.yml
CLIENT_PORT=80
POSTGRES_DB=super_admin
POSTGRES_USER=super_admin
POSTGRES_PASSWORD=<使用秘密管理器生成的数据库密码>
MINIO_ROOT_USER=<仅用于初始化的根访问密钥>
MINIO_ROOT_PASSWORD=<仅用于初始化的根秘密密钥>
OBJECT_STORAGE_BUCKET=learning-assistant
OBJECT_STORAGE_ACCESS_KEY=<server 使用的桶级访问密钥>
OBJECT_STORAGE_SECRET_KEY=<server 使用的桶级秘密密钥>
JWT_ACCESS_SECRET=<至少32个字符的随机秘密>
TOKEN_ENCRYPTION_KEY=<64位十六进制随机密钥>
SMTP_HOST=smtp.example.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_FROM=noreply@example.com
APP_PUBLIC_URL=https://your-domain.example
EOF
```

`POSTGRES_PASSWORD` 会直接拼入 PostgreSQL URL，只能使用 URL 非保留字符：大小写字母、数字、点、下划线、波浪号和连字符。不要在该值中使用 `@`、`:`、`/`、`?`、`#` 或空白。

`POSTGRES_PASSWORD`、两项 MinIO 根凭据、两项对象存储应用凭据、`JWT_ACCESS_SECRET` 和 `TOKEN_ENCRYPTION_KEY` 是主 Compose 的必填变量。MinIO 根凭据只供 `minio-init` 创建桶、应用用户和桶级策略；`server` 只能使用 `OBJECT_STORAGE_ACCESS_KEY` 与 `OBJECT_STORAGE_SECRET_KEY`，不能使用根凭据。

生产环境还必须设置四项 SMTP 变量。`COMPOSE_FILE` 让生产部署自动叠加 `docker-compose.production.yml`：Mailpit 不会启动，server 对 Mailpit 的依赖变成非必需，并连接外部 SMTP。所有生产秘密必须由 `.env` 或秘密管理器注入，不能提交到仓库。

构建前先检查变量插值和 Compose 结构：

```bash
docker compose config --quiet
```

未使用 `.env` 时，需要在执行 `docker compose config` 的同一环境中显式注入全部必填变量，并明确指定生产覆盖文件：

```bash
docker compose -f docker-compose.yml -f docker-compose.production.yml config --quiet
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

`docker-compose.yml` 包含 6 个长期服务和 1 个一次性初始化服务：

- `postgres`：PostgreSQL 16，应用主数据库，数据保存在 `postgres-data` volume。
- `redis`：Redis 7，提供 BullMQ 队列，数据保存在 `redis-data` volume。
- `minio`：S3 兼容对象存储，API 与管理控制台分别监听容器端口 `9000`、`9001`，数据保存在 `minio-data` volume。
- `minio-init`：等待 MinIO 健康后创建 `OBJECT_STORAGE_BUCKET`，再创建独立应用用户、桶级最小权限策略并完成绑定；成功退出后 `server` 才会启动。重复运行时，`mc admin user add` 会更新已有用户密码，`mc admin policy create` 会覆盖已有策略，因此既幂等又支持密钥轮换。它不常驻，也不持有独立数据卷。
- `mailpit`：默认本地开发邮件服务，SMTP 与网页界面分别监听容器端口 `1025`、`8025`。生产覆盖将其放入未启用的 `local-mailpit` 配置组，server 改用外部 SMTP。
- `server`：NestJS API，默认本地开发时等待 PostgreSQL、Redis、MinIO、建桶任务和 Mailpit 就绪，容器内监听 `3000`；生产覆盖下 Mailpit 不是必需依赖。
- `client`：nginx 托管 Vue 静态资源，等待 server 健康后启动，并把 `/api/` 反向代理到 `server:3000`。

主配置默认只把 `client` 的端口发布到宿主机。PostgreSQL、Redis、MinIO、Mailpit 和 server 只在 Compose 内部网络可达，避免绕过 nginx 或把基础设施暴露到公网。如需本地调试这些端口，应使用显式开发覆盖，并只绑定到 `127.0.0.1`。

持久化数据卷只有 `postgres-data`、`redis-data` 和 `minio-data`。生产迁移或清理前必须分别评估数据库、队列和对象文件的备份需求。

生产访问一般走 `client` 的 80 端口：

```text
用户浏览器 -> http://8.130.118.128/ -> client nginx -> /api -> server -> PostgreSQL / Redis / MinIO / SMTP
```

`client` nginx 已配置 `client_max_body_size 5m`，与 NestJS 的 JSON body 上限保持一致。知识采集扩展发送较大的页面快照时，请求体应先到达后端并返回应用层认证或校验结果，而不是被 nginx 拦截为 `413 Request Entity Too Large`。

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

PostgreSQL 数据保存在 `postgres-data` 数据卷。执行人工备份时先停止 server，避免业务在备份窗口继续写入；使用带清理语句的逻辑备份，备份结束后重新启动 server：

```bash
cd /opt/super-admin
docker compose ps
docker compose stop server
BACKUP_FILE="./backup-$(date +%Y%m%d-%H%M%S).sql"
docker compose exec -T postgres sh -ec 'pg_dump --clean --if-exists --no-owner --no-privileges -U "$POSTGRES_USER" -d "$POSTGRES_DB"' > "$BACKUP_FILE"
test -s "$BACKUP_FILE"
tail -n 20 "$BACKUP_FILE" | grep -q 'PostgreSQL database dump complete'
docker compose start server
curl -fsS http://127.0.0.1/api/tools
```

如果备份命令或文件验证失败，也必须先执行 `docker compose start server` 恢复服务，再排查原因。定时任务应封装同样的停写、文件验证、恢复服务和失败告警流程，不能只运行一条无人检查的 `pg_dump`。

恢复会覆盖目标数据库。先验证恢复文件，停止 server，并额外备份当前数据库作为回滚点；随后删除并重建目标数据库，使用单事务和 `ON_ERROR_STOP`，任何 SQL 错误都会终止且不会留下半恢复事务：

```bash
cd /opt/super-admin
RESTORE_FILE=./backup-20260529.sql
ROLLBACK_FILE="./pre-restore-$(date +%Y%m%d-%H%M%S).sql"
test -s "$RESTORE_FILE"
tail -n 20 "$RESTORE_FILE" | grep -q 'PostgreSQL database dump complete'
docker compose stop server
docker compose exec -T postgres sh -ec 'pg_dump --clean --if-exists --no-owner --no-privileges -U "$POSTGRES_USER" -d "$POSTGRES_DB"' > "$ROLLBACK_FILE"
test -s "$ROLLBACK_FILE"
tail -n 20 "$ROLLBACK_FILE" | grep -q 'PostgreSQL database dump complete'
docker compose exec -T postgres sh -ec 'dropdb --if-exists -U "$POSTGRES_USER" "$POSTGRES_DB" && createdb -U "$POSTGRES_USER" "$POSTGRES_DB"'
docker compose exec -T postgres sh -ec 'psql -v ON_ERROR_STOP=1 --single-transaction -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < "$RESTORE_FILE"
docker compose exec -T postgres sh -ec 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT 1"'
docker compose start server
curl -fsS http://127.0.0.1/api/tools
```

恢复或健康验证失败时，不要启动 server。明确执行以下回滚，再验证数据库和接口：

```bash
docker compose exec -T postgres sh -ec 'dropdb --if-exists -U "$POSTGRES_USER" "$POSTGRES_DB" && createdb -U "$POSTGRES_USER" "$POSTGRES_DB"'
docker compose exec -T postgres sh -ec 'psql -v ON_ERROR_STOP=1 --single-transaction -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < "$ROLLBACK_FILE"
docker compose exec -T postgres sh -ec 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT 1"'
docker compose start server
curl -fsS http://127.0.0.1/api/tools
```

保留原恢复文件、回滚文件和失败日志，确认业务数据无误后再清理。如果回滚导入或验证仍失败，保持 server 停止并升级处理，不要恢复业务流量。

`minio-data` 中的对象文件需要独立备份到另一个存储位置；`redis-data` 是否备份取决于是否需要保留待执行任务，不能用数据库备份替代。

## 日志与排查

常用命令：

```bash
cd /opt/super-admin
docker compose logs -f --tail=100 server
docker compose logs -f --tail=100 client
docker compose logs -f --tail=100 redis
docker compose logs --tail=100 postgres minio minio-init mailpit
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
| PostgreSQL 连接失败 | `docker compose exec postgres pg_isready`，再检查 `postgres` 与 `server` 日志 |
| 对象存储桶未创建 | 检查 `docker compose logs minio minio-init`，确认 MinIO 凭据和 `OBJECT_STORAGE_BUCKET` |
| 邮件未送达 Mailpit | 检查 `mailpit` 健康状态和 server 的 `SMTP_HOST`、`SMTP_PORT` |
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
