## Context

个人开发者需要多个小工具（知识采集、面试复盘、AI 总结等），但不想每个工具单独新建项目。需要一个"后台容器"让工具以插件方式接入。这是全新项目，无历史包袱。MVP 阶段单用户，需部署上线作为简历亮点。

## Goals / Non-Goals

**Goals:**
- 提供统一的工具注册协议，新工具只需写 Module + 页面 + manifest 即可接入
- 平台级任务队列，所有工具的异步任务统一追踪
- 第一个落地工具：知识采集（Playwright 服务端采集 + Readability 提取）
- Docker Compose 一键部署

**Non-Goals:**
- 不做多用户/登录/权限（v2）
- 不做工具间互调和流程串联（v2）
- 不做浏览器扩展（服务端采集）
- 不做动态插件热加载（第一版静态注册，构建时解析）

## Decisions

### 1. 分层架构 vs 全栈框架

**选择：** NestJS（后端）+ Vue 3（前端）分层部署，不选 Nuxt 3 全栈。

**理由：** 简历含金量更高。NestJS 的 Module 体系天然映射到"一个工具 = 一个 Module"的插件模型。前后端分离让架构边界清晰，面试时更容易讲清楚。Nuxt 3 虽然开发快但耦合度高，加第三个工具后维护成本上升。

### 2. 工具注册：DB 持久化 + 内存缓存

**选择：** 工具信息在 `Tool` 表中持久化，`GET /api/tools` 从 DB 读取，前端 `import.meta.glob` 构建时扫描 manifest。

**理由：** DB 作为单一真相源，未来 `enabled` 字段可切换工具的启用/禁用。前端构建时扫描避免了运行时加载的复杂度，第一版不需要 SSR。

### 3. 任务队列：DB 优先，BullMQ 为执行层

**选择：** 任务状态以 `Job` 表为准，BullMQ 只负责异步执行和重试。全局事件监听器同步 BullMQ 状态到 DB。双写失败由定时任务兜底。

**理由：** 前端任务中心只查 DB 不连 Redis，架构更简洁。BullMQ 故障不影响任务记录的完整性。这是最小化双写风险的折中方案。

### 4. 单 Queue 多 Processor vs 每工具一个 Queue

**选择：** 每个工具一个 BullMQ Queue。知识采集工具拥有自己的 `knowledge-capture` queue。

**理由：** 隔离故障域——一个工具的任务堆积不影响其他工具。BullMQ 的 concurrency 参数控制每个工具的并发数，比如知识采集限制 1 并发（Chromium 内存占用高）。

## Risks / Trade-offs

- **Playwright 内存占用：** Chromium 单实例 500MB-1.5GB → VPS 最低 2GB RAM + 2GB swap，启动参数加 `--disable-dev-shm-usage`，限制并发采集为 1
- **双写一致性：** DB 写入成功但 BullMQ enqueue 失败 → 定时任务扫超过 10 分钟的 pending 记录标记 failed
- **Windows 本地开发：** Redis 不原生支持 Windows → Docker Desktop 或 WSL2 跑 Redis，NestJS 和 Vue 在宿主机跑
- **工具注册是静态的：** 新增工具需要重新构建前端和重启后端 → MVP 阶段可接受，v2 可改为数据库驱动的前端菜单
