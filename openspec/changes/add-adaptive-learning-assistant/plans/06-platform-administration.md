# 平台后台管理实施计划

> **供智能体执行者使用：** 必须使用子技能 `superpowers:subagent-driven-development`（推荐）或 `superpowers:executing-plans`，逐项实施本计划。步骤使用复选框（`- [ ]`）跟踪进度。

**目标：** 为管理员提供安全的平台级运维能力，同时默认禁止访问用户学习内容和秘密。

**状态：** ⏳ 未开始

**架构：** 所有 `/api/admin/*` 路由在服务端强制 ADMIN 授权，并返回专用白名单 DTO。高风险变更必须填写原因，在同一事务内重新检查不变量，必要时撤销受影响会话，并为成功和失败追加不可变审计事件。

**技术栈：** NestJS、Prisma/PostgreSQL、BullMQ/Redis、ModelGateway、对象存储、邮件 Transport、Jest/Supertest。

---

### 任务 1：不可变审计包装器

**文件：**
- 新建：`server/src/admin/audit/audit.service.ts`、`audited-operation.service.ts`、`audit.controller.ts`、`audit.dto.ts`
- 测试：`server/src/admin/audit/audited-operation.service.spec.ts`

- [ ] 编写失败测试，覆盖操作者/目标/动作/原因/变更前/变更后/结果/关联 ID/时间戳、记录被拒操作、元数据脱敏、筛选及脱敏 CSV 导出。
- [ ] 运行聚焦测试，确认因实现缺失而失败。
- [ ] 实现只追加审计写入及 `executeAudited()`，在不吞掉原始错误的前提下记录成功或脱敏失败。
- [ ] 重新运行测试，验证秘密和受保护内容字段会被递归移除。
- [ ] 提交：`git commit -m "feat: add immutable administration audit"`。

### 任务 2：管理员用户生命周期

**文件：**
- 新建：`server/src/admin/users/admin-users.controller.ts`、`admin-user.dto.ts`
- 修改：`server/src/admin/users/admin-users.service.ts`
- 测试：`server/test/admin-users.e2e-spec.ts`

- [ ] 编写失败端到端测试，覆盖搜索/筛选/详情白名单、带原因的角色/状态变更、撤销会话、配额覆盖、末位管理员保护、USER 拒绝访问，以及不包含来源/答案/笔记/Graph 字段。
- [ ] 运行聚焦端到端测试并确认失败。
- [ ] 实现分页且仅含元数据的 DTO，以及保护末位管理员并在角色/状态变更后撤销目标会话的审计事务。
- [ ] 重新运行测试，预期成功及被拒尝试的审计用例均 `PASS`。
- [ ] 提交：`git commit -m "feat: administer platform users"`。

### 任务 3：工具注册表与学习模块配置

**文件：**
- 修改：`server/src/core/tool-manifest.interface.ts`、`tool-registry.service.ts`、`tools.controller.ts`
- 新建：`server/src/admin/tools/admin-tools.controller.ts`、`tool-config.service.ts`
- 测试：`server/src/admin/tools/tool-config.service.spec.ts`、`server/test/admin-tools.e2e-spec.ts`

- [ ] 编写失败测试，覆盖 Manifest 元数据、启用/版本/Processor 状态、禁用原因/停机策略、无效配置字段错误、模型 Profile 不可用、配置版本不可变及禁用时路由拒绝。
- [ ] 运行测试并确认失败。
- [ ] 为 ToolManifest 扩展配置 Schema/版本/停机/重试元数据；实现带审计的发布/启用/禁用，以及学习助手的模型 Profile、Prompt、文件上限和策略开关配置。
- [ ] 重新运行测试，验证不存在独立的“学习助手后台产品”，也不会向用户泄露诊断信息。
- [ ] 提交：`git commit -m "feat: administer tool configurations"`。

### 任务 4：模型服务与配额管理

**文件：**
- 新建：`server/src/admin/models/admin-models.controller.ts`、`server/src/admin/quotas/admin-quotas.controller.ts`
- 测试：`server/test/admin-models-quotas.e2e-spec.ts`

- [ ] 编写失败测试，覆盖秘密掩码、受限且不含领域数据的连接测试、超时/脱敏结果、不可变 Profile/Prompt 发布、降级顺序、默认配额、覆盖值、原因必填及调用前拒绝。
- [ ] 运行聚焦端到端测试并确认失败。
- [ ] 通过白名单 DTO 和 `executeAudited` 暴露现有模型配置/配额 Service；连接测试使用固定无害消息、严格超时，且不包含领域来源或 Prompt。
- [ ] 重新运行测试，验证响应/审计/日志固定样例无法还原秘密。
- [ ] 提交：`git commit -m "feat: administer models and quotas"`。

### 任务 5：跨工具任务与安全重试

**文件：**
- 新建：`server/src/admin/jobs/admin-jobs.controller.ts`、`admin-job.dto.ts`
- 修改：`server/src/core/bullmq.service.ts`、`processor.interface.ts`、`jobs.controller.ts`
- 测试：`server/test/admin-jobs.e2e-spec.ts`、`server/src/core/bullmq.service.spec.ts`

- [ ] 编写失败测试，覆盖分页筛选、脱敏详情、失败/幂等重试资格、拒绝非失败/不可恢复/非幂等任务、原因/审计、同一领域 Job 重新入队及重复生命周期事件。
- [ ] 运行测试，确认旧有直接执行/重试行为导致失败。
- [ ] 为 Processor 添加显式重试策略，并让 BullMQ 成为唯一重试执行器；原子重置并重新入队现有 Job，按 `bullmqJobId` 幂等更新生命周期。
- [ ] 重新运行测试，预期不产生重复 Job 或重复完成的领域效果。
- [ ] 提交：`git commit -m "fix: enforce safe queued job retry"`。

### 任务 6：平台健康状态

**文件：**
- 新建：`server/src/admin/health/platform-health.service.ts`、`platform-health.controller.ts`
- 测试：`server/src/admin/health/platform-health.service.spec.ts`

- [ ] 编写失败测试，覆盖 PostgreSQL、Redis、BullMQ Worker 心跳、对象存储、邮件及已配置模型 Provider，并校验超时和脱敏分类。
- [ ] 运行聚焦测试并确认失败。
- [ ] 实现有界只读探针，聚合为 `healthy|degraded|unhealthy`，且不返回 URL、凭据、用户内容或模型响应文本。
- [ ] 重新运行测试，预期单个依赖失败不会阻塞其他探针结果。
- [ ] 提交：`git commit -m "feat: expose sanitized platform health"`。

### 任务 7：后台管理隐私契约

**文件：**
- 新建：`server/test/admin-privacy.e2e-spec.ts`、`server/src/admin/privacy/admin-response.interceptor.ts`
- 修改：`server/src/admin/admin.module.ts`

- [ ] 在来源正文、答案、笔记、Prompt、Provider 秘密、Graph State 和 Job 原始元数据中植入哨兵字符串；断言所有管理列表/详情/导出/健康/审计响应均排除它们，且不支持的内容访问返回 `403` 或省略字段。
- [ ] 运行测试并记录泄露。
- [ ] 用显式 DTO 投影替换隐式 Prisma 对象展开，并为管理路由添加纵深防御的禁用字段响应 Interceptor。
- [ ] 重新运行全部管理/认证/任务测试，预期哨兵匹配数为零。
- [ ] 提交：`git commit -m "test: enforce administration content privacy"`。
