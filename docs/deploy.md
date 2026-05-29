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

## 7. 故障排查

| 问题 | 检查方法 |
|------|---------|
| 端口占用 | `ss -tlnp \| grep :80` |
| 容器未启动 | `docker compose ps -a` |
| 数据库错误 | `docker compose logs server \| grep -i error` |
| Redis 连接失败 | `docker compose exec redis redis-cli PING` |
| Playwright 崩溃 | `docker compose logs server \| grep -i browser` |
| 内存不足 | Playwright Chromium 需约 500MB，考虑增加 swap：`fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile` |
