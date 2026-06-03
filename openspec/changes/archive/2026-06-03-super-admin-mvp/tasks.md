## 1. 项目初始化

- [x] 1.1 初始化 git 仓库，创建 `.gitignore`（node_modules, dist, .env, prisma/migrations）
- [x] 1.2 创建 monorepo 结构：`server/`（NestJS）和 `client/`（Vue 3 + Vite）
- [x] 1.3 配置 pnpm workspaces，共享 TypeScript、ESLint、Prettier 配置
- [x] 1.4 安装后端依赖：NestJS CLI、Prisma、BullMQ、Playwright、@mozilla/readability、turndown、class-validator
- [x] 1.5 安装前端依赖：Vue 3、Vite、Vue Router、Pinia、Element Plus、Axios、Tailwind CSS v4（`tailwindcss @tailwindcss/vite`）

## 2. 数据库

- [x] 2.1 编写 Prisma schema：Tool、Job、KnowledgeItem 模型（含字段、类型、默认值、关系）
- [x] 2.2 执行 `prisma migrate dev` 生成初始迁移
- [x] 2.3 配置 Prisma Module（NestJS 全局模块，注入 PrismaService）

## 3. 平台核心——后端

- [x] 3.1 定义 `ToolManifest` TypeScript 接口（key, name, icon, route, module, processors）
- [x] 3.2 实现 `ToolRegistry` 服务：`register(manifest)` 方法，持久化到 Tool 表，注册 BullMQ 处理器
- [x] 3.3 创建 `GET /api/tools` 端点，返回 `enabled=true` 的工具列表
- [x] 3.4 配置 BullMQ（连接 Redis），实现全局事件监听器（同步 completed/failed/active 到 Job 表）
- [x] 3.5 实现 `GET /api/jobs` 端点（分页 + 按 toolKey/status 过滤）
- [x] 3.6 实现 `POST /api/jobs/:id/retry` 端点（重新入队失败任务）
- [x] 3.7 实现定时清理任务：每 5 分钟扫描超过 10 分钟的 pending 记录，标记为 failed
- [x] 3.8 配置 CORS（允许前端开发端口 5173）

## 4. 知识采集工具——后端

- [x] 4.1 创建 `KnowledgeCaptureModule`，含 manifest、controller、processor
- [x] 4.2 实现 `POST /api/tools/knowledge-capture/capture`：校验 URL → 写 Job 表 → 入 BullMQ 队列
- [x] 4.3 实现采集 processor：Playwright 启动 Chromium → 导航到 URL → Readability 提取 → Turndown 转 Markdown → 写 KnowledgeItem 表
- [x] 4.4 实现错误分类处理：NETWORK_ERROR、TIMEOUT、EXTRACTION_FAILED、BLOCKED、BROWSER_CRASH、EMPTY_CONTENT
- [x] 4.5 实现 `GET /api/tools/knowledge-capture/items` 端点（分页查询）
- [x] 4.6 实现 `GET /api/tools/knowledge-capture/items/:id` 端点（含 Markdown 正文）
- [x] 4.7 实现 `DELETE /api/tools/knowledge-capture/items/:id` 端点
- [x] 4.8 Playwright 启动配置：headless、--disable-dev-shm-usage、30s 超时、并发限制

## 5. 前端容器框架

- [x] 5.1 配置 Tailwind CSS：`vite.config.ts` 添加 `@tailwindcss/vite` 插件，CSS 入口 `@import "tailwindcss"`
- [x] 5.2 创建后台 Layout：Tailwind 弹性布局 + Element Plus `el-menu` 侧边栏 + `router-view` 主内容区
- [x] 5.3 配置 Vue Router：根路由 + layout 子路由，404 兜底
- [x] 5.4 实现动态菜单：页面加载时调用 `GET /api/tools`，根据返回数据渲染 `el-menu-item`
- [x] 5.5 配置 Axios 实例：baseURL 指向后端、错误拦截、请求/响应类型

## 6. 知识采集工具——前端

- [x] 6.1 创建 `manifest.ts`（key, name, icon, route）
- [x] 6.2 创建采集页面：URL 输入框（`el-input`）+ 采集按钮（`el-button`），带 loading 状态
- [x] 6.3 采集成功后 toast 提示，显示 jobId，不阻塞页面
- [x] 6.4 创建知识列表页：`el-table` 展示 title/url/source/capturedAt/status + `el-pagination` 分页
- [x] 6.5 支持点击行展开查看 Markdown 正文（`el-dialog` 或展开行渲染）
- [x] 6.6 支持删除操作（`el-popconfirm` 确认后调 DELETE API）

## 7. 任务中心——前端

- [x] 7.1 创建任务中心页面：`el-table` 展示所有 Job（toolKey/status/createdAt/error/操作）
- [x] 7.2 实现筛选：按工具（`el-select`）和状态（`el-select`）过滤
- [x] 7.3 状态列使用 `el-tag` 渲染（pending=灰色, running=蓝色, success=绿色, failed=红色）
- [x] 7.4 失败任务显示错误摘要 tooltip，提供重试按钮
- [x] 7.5 短轮询：页面打开时每 3 秒刷新 pending/running 任务状态

## 8. Docker 与部署

- [x] 8.1 编写 NestJS Dockerfile（基于 node:22-slim，安装 Chromium 依赖，npx playwright install chromium）
- [x] 8.2 编写 Vue 前端 Dockerfile（多阶段构建：vite build → nginx 托管静态文件）
- [x] 8.3 编写 `docker-compose.yml`（redis + server + client，网络和 volume 配置）
- [x] 8.4 配置前端 Nginx 反向代理（`/api/` → server:3000，其余走静态文件）
- [x] 8.5 本地验证 Docker Compose 一键启动
- [x] 8.6 准备部署：选择 VPS/云服务器，配置域名，部署上线
