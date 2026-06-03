# Super Admin 部署指南

## 前置要求

- VPS / 云服务器（推荐 2 核 4GB 以上，因为 Playwright Chromium 需要约 500MB 内存）
- 操作系统：Ubuntu 22.04+ / Debian 12+
- 域名（可选，但推荐配置 HTTPS）

## 1. 服务器初始化

### 安装 Docker

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# 重新登录使权限生效
```

### 开放端口

```bash
# 仅需开放 80/443 端口
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

## 2. 部署步骤

### 2.1 拉取项目代码

> 确保代码已推送到 Git 远程仓库（GitHub / GitLab 等），VPS 能访问该仓库。

```bash
# 在 VPS 上
cd /opt
git clone <your-repo-url> super-admin
cd super-admin
```

### 2.2 配置环境变量

```bash
# 创建 .env 文件
cat > .env << 'EOF'
# 服务端口
CLIENT_PORT=80

# 服务端数据库路径（容器内绝对路径）
DATABASE_URL=file:/app/data/prod.db

# Redis（使用容器内 hostname）
REDIS_HOST=redis
REDIS_PORT=6379
EOF
```

### 2.3 启动服务

```bash
docker compose up -d
# 查看状态
docker compose ps
# 查看日志
docker compose logs -f
```

### 2.4 验证

```bash
# 检查 API
curl http://localhost/api/tools
# 检查前端
curl http://localhost/
```

## 3. 配置 HTTPS（推荐 Caddy）

```bash
# 安装 Caddy
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
echo "deb [signed-by=/usr/share/keyrings/caddy-stable-archive-keyring.gpg] https://dl.cloudsmith.io/public/caddy/stable/deb/debian any-version main" | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install caddy
```

Caddyfile（`/etc/caddy/Caddyfile`）:
```
your-domain.com {
    reverse_proxy localhost:80
}
```

```bash
sudo systemctl reload caddy
```

## 4. 更新部署

```bash
cd /opt/super-admin
# 拉取最新代码
git pull
# 重新构建并启动（--build 重建镜像）
docker compose up -d --build
# 清理旧镜像
docker image prune -f
```

## 5. 备份数据库

SQLite 数据库文件位于 Docker volume 中：

```bash
# 备份
docker cp super-admin-server-1:/app/data/prod.db ./backup-$(date +%Y%m%d).db
# 恢复
docker cp ./backup-20260529.db super-admin-server-1:/app/data/prod.db
docker compose restart server
```

或用 crontab 定时备份：
```
0 3 * * * docker cp super-admin-server-1:/app/data/prod.db /opt/backups/super-admin-$(date +\%Y\%m\%d).db
```

## 6. 日志与监控

```bash
# 查看各服务日志
docker compose logs -f --tail=100 server
docker compose logs -f --tail=100 client

# 设置日志轮转（/etc/docker/daemon.json）
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  }
}
```

## 7. Chrome 扩展部署

### 7.1 扩展加载

1. 打开 Chrome 浏览器，访问 `chrome://extensions/`
2. 开启右上角 **开发者模式**
3. 点击 **加载已解压的扩展程序**
4. 选择项目中的 `extension/` 目录

### 7.2 扩展 ID 固定

扩展 ID 由 `manifest.json` 中的 `"key"` 字段决定。该字段是 PEM 公钥的 base64 编码，从 `extension/extension.pem` 私钥提取。

**⚠️ 重要：** PEM 私钥丢失会导致扩展 ID 变化，需要重新配置：
- 前端环境变量 `VITE_EXTENSION_ID` 需要更新
- 已授权的扩展需要重新授权
- 生产环境的 `externally_connectable.matches` 配置不受影响（基于域名而非 ID）

`extension.pem` 已纳入版本控制，请勿删除或重新生成。

### 7.3 PEM 私钥管理

- **开发环境**：PEM 私钥位于 `extension/extension.pem`，已纳入 Git 版本控制
- **安全说明**：Chrome 扩展密钥仅用于固定扩展 ID，不涉及服务器密钥或用户数据加密
- 如需重新生成：
  ```bash
  # 生成新的 RSA 密钥对（仅在私钥泄露或丢失时操作）
  node -e "
  const crypto = require('crypto');
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  require('fs').writeFileSync('extension/extension.pem', privateKey);
  // 手动更新 manifest.json 的 "key" 和 client/.env 的 VITE_EXTENSION_ID
  "
  ```
  重新生成后需要重新加载扩展并重新授权。

### 7.4 生产环境 externally_connectable 配置

生产环境部署时，需要在 `extension/manifest.json` 的 `externally_connectable.matches` 中添加生产域名：

```json
"externally_connectable": {
  "matches": [
    "http://localhost:*/*",
    "http://127.0.0.1:*/*",
    "https://your-domain.com/*"
  ]
}
```

修改后需重新加载扩展（`chrome://extensions/` → 点击扩展卡片上的刷新按钮）。

### 7.5 扩展权限说明

| 权限 | 用途 |
|------|------|
| `activeTab` | 仅在用户点击扩展时获取当前标签页 URL |
| `storage` | 存储 API token 和后端 URL 配置 |
| `cookies` | 读取当前页面的登录 Cookie |
| `scripting` | 注入 content script 提取 localStorage |

扩展不在 Chrome Web Store 发布，仅通过开发者模式加载。

## 8. 故障排查

| 问题 | 检查方法 |
|------|---------|
| 端口占用 | `ss -tlnp \| grep :80` |
| 容器未启动 | `docker compose ps -a` |
| 数据库错误 | `docker compose logs server \| grep -i error` |
| Redis 连接失败 | `docker compose exec redis redis-cli PING` |
| Playwright 崩溃 | `docker compose logs server \| grep -i browser` |
| 内存不足 | Playwright Chromium 需约 500MB，考虑增加 swap：`fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile` |
| 扩展无法连接 | 检查 `externally_connectable.matches` 是否包含当前前端地址；检查 CORS 配置 |
