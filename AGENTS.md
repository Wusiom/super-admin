# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Coding Rules

- Do not rewrite unrelated files.
- Do not introduce new frameworks unless explicitly requested.
- Keep changes small and focused.
- Follow the existing folder structure.
- Prefer fixing root causes over patching symptoms.
- When changing backend behavior, check related controller, service, processor, Prisma schema, and job lifecycle.
- When changing frontend behavior, check related API client, store, router, view, and component usage.
- If a change affects architecture, update docs.

## 常用命令

```bash
# 开发（前端 + 后端并行启动）
pnpm dev                          # concurrently 启动 server:dev + client:dev

# 单独启动
pnpm --filter server dev           # NestJS 开发服务器（--watch，端口 3000）
pnpm --filter client dev           # Vite 开发服务器（端口 5173，API 代理到 :3000）

# 构建
pnpm build                         # server build → client build
pnpm --filter server build         # nest build（需要先 prisma generate）
pnpm --filter client build         # vue-tsc -b && vite build

# 测试（server）
pnpm --filter server test          # jest
pnpm --filter server test:watch    # jest --watch
pnpm --filter server test:cov      # jest --coverage
pnpm --filter server test:e2e      # jest --config ./test/jest-e2e.json

# Lint（server）
pnpm --filter server lint          # eslint "{src,apps,libs,test}/**/*.ts" --fix

# 数据库（server）
cd server && npx prisma generate   # 生成 Prisma Client
cd server && npx prisma db push    # 同步 schema 到 SQLite
cd server && npx prisma studio     # 打开 Prisma Studio

# Docker
docker compose up -d               # 启动全部服务（redis + server + client）
docker compose up -d --build       # 重新构建并启动
```

## 架构概览

### 技术栈

- **后端**: NestJS + Prisma + SQLite + BullMQ + Redis + Playwright (Chromium)
- **前端**: Vue 3 + Element Plus + Tailwind CSS v4 + Vite + Pinia + Vue Router
- **扩展**: Chrome Extension (Manifest V3) — 一键采集 Cookie + localStorage
- **包管理**: pnpm workspace（`server/` + `client/`）
- **部署**: Docker Compose（redis + server + client [nginx]）

### 后端架构（NestJS）

**模块层次**：`main.ts` → `AppModule` → `CoreModule` + `AuthModule` + 工具模块

```
server/src/
  main.ts                     — NestFactory 创建，CORS 动态放行，body 5MB 限制
  app.module.ts               — 顶层组装：ConfigModule + PrismaModule + CoreModule + AuthModule + KnowledgeCaptureModule
  prisma/
    prisma.service.ts         — PrismaClient 封装，OnModuleInit 连接
    prisma.module.ts          — @Global() 模块
  core/
    core.module.ts            — 核心能力注册
    tool-registry.service.ts  — 工具注册中心：接收 ToolManifest，upsert DB + 注册 BullMQ 队列
    bullmq.service.ts         — BullMQ 队列/Worker/QueueEvents 管理，含完整生命周期
    tools.controller.ts       — GET /api/tools → 返回启用的工具列表
    jobs.controller.ts        — GET/POST /api/jobs → 任务列表/重试
    cleanup.service.ts        — @Cron 每 5 分钟标记过期 pending job 为 failed
    processor.interface.ts    — Processor 接口定义
    tool-manifest.interface.ts— ToolManifest 接口定义
    auth/
      api-token.service.ts    — SHA-256 哈希 API Token，首次启动自动生成
      api-token.guard.ts      — 守卫：无 Authorization header 放行，有则验证 Bearer token
      api-token.controller.ts — GET /api/auth/token → 刷新 token
      auth.module.ts
  tools/knowledge-capture/    — 示例工具模块（插拔式）
    manifest.ts               — 工具声明（key, name, icon, route, processors）
    knowledge-capture.module.ts — OnModuleInit 时 self-register 到 ToolRegistry
    knowledge-capture.controller.ts — POST capture / GET items / DELETE items
    capture.processor.ts      — Playwright 浏览器 + Readability + Turndown 内容提取
```

**核心设计模式 — 工具注册**：

1. 工具模块 in `tools/` 实现 `ToolManifest`（含 key、route、processors）
2. `onModuleInit` 时调用 `ToolRegistry.register(manifest)`
3. ToolRegistry 将工具信息 upsert 到 SQLite，并为每个 processor 动态创建 BullMQ 队列
4. 前端 `GET /api/tools` 动态获取工具列表 → 侧边栏自动渲染

**BullMQ 任务生命周期**：
`pending` → `running` → `success`/`failed`，通过 QueueEvents 监听 `completed`/`failed` 事件同步到 DB。

### 前端架构（Vue 3）

```
client/src/
  main.ts                     — createApp → Pinia → Router → ElementPlus → 挂载
  App.vue                     — 根组件
  api/index.ts                — axios 实例（baseURL: /api，30s 超时）
  api/auth.ts                 — loginApi, getUserInfoApi
  api/tools.ts                — fetchTools
  api/knowledge.ts            — 知识采集相关 API
  api/jobs.ts                 — 任务相关 API
  stores/auth.ts              — Pinia 认证状态（token, user, login/logout）
  stores/tools.ts             — Pinia 工具列表状态（动态加载）
  router/index.ts             — 路由：/login, / → DefaultLayout (jobs/knowledge/capture|list/settings)
  layouts/DefaultLayout.vue   — 含动态侧边栏（从 tools store 获取菜单项）
  views/
    login/index.vue
    knowledge/CapturePage.vue — 采集页（URL + Cookie + localStorage 输入）
    knowledge/KnowledgeList.vue — 知识列表（el-table + 分页 + Markdown 弹窗 + 删除）
    jobs/JobCenter.vue        — 任务中心（筛选 + 状态着色 + 重试 + 3s 轮询）
    settings/SettingsPage.vue
    NotFound.vue
  components/                 — 公共组件
```

**前端代理**：Vite 开发服务器将 `/api` 代理到 `http://localhost:3000`。

### 数据库（SQLite）

4 个表：`Tool`（注册的工具）、`Job`（任务记录）、`ApiToken`（SHA-256 哈希存储）、`KnowledgeItem`（采集的知识内容）。Schema 路径：`server/prisma/schema.prisma`。

### Chrome 扩展（extension/）

Manifest V3 扩展，核心文件：

- `service-worker.js` — 后台脚本，接收 popup 消息，读取 Cookie + localStorage 并发送到后端
- `content-script.js` — 内容脚本（注入所有页面，预留扩展能力）
- `popup.html` + `popup-script.js` — 弹窗 UI

## Skill routing

When the user's request matches an available skill, invoke it via the Skill tool. The
skill has multi-step workflows, checklists, and quality gates that produce better
results than an ad-hoc answer. When in doubt, invoke the skill. A false positive is
cheaper than a false negative.

Key routing rules:

- Product ideas, "is this worth building", brainstorming → invoke /office-hours
- Strategy, scope, "think bigger", "what should we build" → invoke /plan-ceo-review
- Architecture, "does this design make sense" → invoke /plan-eng-review
- Design system, brand, "how should this look" → invoke /design-consultation
- Design review of a plan → invoke /plan-design-review
- Developer experience of a plan → invoke /plan-devex-review
- "Review everything", full review pipeline → invoke /autoplan
- Bugs, errors, "why is this broken", "wtf", "this doesn't work" → invoke /investigate
- Test the site, find bugs, "does this work" → invoke /qa (or /qa-only for report only)
- Code review, check the diff, "look at my changes" → invoke /review
- Visual polish, design audit, "this looks off" → invoke /design-review
- Developer experience audit, try onboarding → invoke /devex-review
- Ship, deploy, create a PR, "send it" → invoke /ship
- Merge + deploy + verify → invoke /land-and-deploy
- Configure deployment → invoke /setup-deploy
- Post-deploy monitoring → invoke /canary
- Update docs after shipping → invoke /document-release
- Weekly retro, "how'd we do" → invoke /retro
- Second opinion, codex review → invoke /codex
- Safety mode, careful mode, lock it down → invoke /careful or /guard
- Restrict edits to a directory → invoke /freeze or /unfreeze
- Save progress, "save my work" → invoke /context-save
- Resume, restore, "where was I" → invoke /context-restore
- Security audit, OWASP, "is this secure" → invoke /cso
- Make a PDF, document, publication → invoke /make-pdf
- Launch real browser for QA → invoke /open-gstack-browser
- Import cookies for authenticated testing → invoke /setup-browser-cookies
- Performance regression, page speed, benchmarks → invoke /benchmark
- Review what gstack has learned → invoke /learn
- Tune question sensitivity → invoke /plan-tune
- Code quality dashboard → invoke /health

## 以第一性原理！从原始需求和问题本质出发，不从惯例或模板出发。

1. 不要假设我清楚自己想要什么。动机或目标不清晰时，停下来讨论。
2. 目标清晰但路径不是最短的，直接告诉我并建议更好的办法。
3. 遇到问题追根因，不打补丁。每个决策都要能回答"为什么"。
4. 输出说重点，砍掉一切不改变决策的信息。
