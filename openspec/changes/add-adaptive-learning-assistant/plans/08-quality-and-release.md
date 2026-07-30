# 安全、迁移与验收实施计划

> **供智能体执行者使用：** 必须使用子技能 `superpowers:subagent-driven-development`（推荐）或 `superpowers:executing-plans`，逐项实施本计划。步骤使用复选框（`- [ ]`）跟踪进度。

**目标：** 证明完整系统安全、可观测、经过校准、可迁移、可恢复，并与设计及 OpenSpec 契约一致。

**状态：** ⏳ 未开始

**架构：** 在可行时，横切测试直接验证部署边界，而非内部 Mock。关联上下文串联请求、任务、模型调用、图节点、轮次和审计，同时不记录受保护数据。在迁移演练、评估校准、浏览器验收和回滚证据全部完成前阻止发布。

**技术栈：** NestJS Interceptor、AsyncLocalStorage、限流、Jest/Supertest、Vitest、Docker Compose、Prisma Migrate、浏览器 QA、Markdown 文档。

---

### 任务 1：关联追踪与结构化脱敏日志

**文件：**
- 新建：`server/src/observability/correlation.service.ts`、`correlation.interceptor.ts`、`redacting-logger.service.ts`
- 测试：`server/src/observability/correlation.service.spec.ts`、`server/test/correlation.e2e-spec.ts`
- 修改：请求、Job、ModelCall、教学轮次和 AuditEvent 的创建路径

- [ ] 编写失败测试，验证同一关联 ID 贯穿 HTTP 请求、BullMQ Job、模型调用、图节点、领域轮次和审计事件，同时日志绝不出现秘密/内容哨兵。
- [ ] 运行聚焦测试并确认失败。
- [ ] 实现 AsyncLocalStorage 关联、通过 Job 数据和图配置显式传播、结构化白名单日志，以及入站 ID 校验/生成。
- [ ] 重新运行测试，预期关联完整且哨兵匹配数为零。
- [ ] 提交：`git commit -m "feat: correlate learning operations"`。

### 任务 2：对所有易滥用边界实施限流

**文件：**
- 新建：`server/src/security/rate-limit/rate-limit.module.ts`、`rate-limit.policy.ts`
- 测试：`server/test/rate-limits.e2e-spec.ts`
- 修改：认证、上传、令牌、教学及管理连接测试 Controller

- [ ] 编写失败测试，覆盖注册、验证重发、重置、登录、模型调用、上传、API 令牌创建和 Provider 测试；按 IP 和/或用户键限流，并返回含重试元数据的 `429`。
- [ ] 运行聚焦端到端测试并确认失败。
- [ ] 配置具名限流策略和可信 Key；确保被拒请求不产生邮件、对象、模型调用、令牌或管理变更。
- [ ] 重新运行测试，预期不同用户不会消耗彼此的认证配额。
- [ ] 提交：`git commit -m "feat: rate limit sensitive operations"`。

### 任务 3：Prompt 注入与授权对抗测试

**文件：**
- 新建：`server/test/security/prompt-injection.e2e-spec.ts`、`server/test/security/idor-matrix.e2e-spec.ts` 及 `server/test/fixtures/security/` 下的固定样例

- [ ] 添加指示模型变更角色、调用工具、泄露 Prompt、引用无效锚点、自动确认笔记或降低评分标准的来源文本；为每个自有资源端点添加双用户矩阵。
- [ ] 运行测试并记录所有成功攻击。
- [ ] 仅在测试暴露缺口处收紧系统/数据分离、Schema、锚点检查、工具白名单、所有者选择条件和 DTO 投影。
- [ ] 重新运行测试，预期所有注入均被当作来源数据，所有外部用户 ID 均不泄露受保护元数据。
- [ ] 提交：`git commit -m "test: block injection and cross-user access"`。

### 任务 4：人工标注的评估校准

**文件：**
- 新建：`server/test/fixtures/evaluation/answer-cases.json`、`citation-cases.json`、`server/scripts/run-evaluation-calibration.ts`、`docs/evaluation/calibration.md`
- 修改：`server/package.json`

- [ ] 编写至少 30 个答案用例，覆盖正确、部分正确、误解、无依据、仅回忆和迁移回答，每例含人工判定和来源锚点；另编写引用支持标签。
- [ ] 添加确定性 Runner：校验固定样例 Schema、调用评估边界、计算一致率/混淆矩阵及引用支持率；一致率低于 85% 或已接受引用支持率低于 95% 时以非零退出。
- [ ] 使用已配置评估模型/Profile 运行，检查分歧，并调整评分标准/Prompt 版本，不得硬编码样例答案。
- [ ] 重复运行直至通过阈值；保存模型/Profile/Prompt 版本、日期、数量、指标及剩余分歧。
- [ ] 提交：`git commit -m "test: calibrate learning evaluation"`。

### 任务 5：完整删除与隐私生命周期

**文件：**
- 新建：`server/test/security/deletion.e2e-spec.ts`、`server/test/security/privacy-export.e2e-spec.ts`

- [ ] 植入完整用户数据图：会话/令牌、来源对象/版本/锚点、任务、图检查点、轮次/证据/画像、笔记/链接、导出、模型调用及审计；为每个存储编写失败删除断言。
- [ ] 运行聚焦测试并记录残留项。
- [ ] 实现分阶段用户/来源删除，包含可重试对象/检查点/导出清理、令牌/会话撤销、必要审计保留/匿名化及所有权安全补偿。
- [ ] 重新运行删除和隐私导出测试；预期不存在可恢复用户内容，且不影响对照用户。
- [ ] 提交：`git commit -m "feat: complete learning data deletion"`。

### 任务 6：PostgreSQL 迁移与回滚演练

**文件：**
- 修改：`docs/migrations/sqlite-to-postgresql.md`
- 新建：`docs/release-evidence/learning-assistant-migration.md`

- [ ] 备份代表性 SQLite 固定样例，记录 SHA-256，冻结写入并执行导入器试运行；记录计数和预期映射。
- [ ] 应用 PostgreSQL 迁移并真实导入；比较每张表计数、KnowledgeItem/来源内容哈希、Job 关联、Tool 启用状态和初始管理员所有权。
- [ ] 启动新栈，执行已认证读取/采集/来源路径，然后停止新写入并恢复未修改的 SQLite 备份，以模拟回滚。
- [ ] 记录精确命令、时间戳、输出、已接受的切换后数据丢失边界和运维签字；在恢复后的旧栈可提供读取前，不得声称回滚成功。
- [ ] 提交：`git commit -m "docs: record postgres migration rehearsal"`。

### 任务 7：完整自动化质量门禁

**文件：**
- 新建：`scripts/verify-learning-assistant.ps1`、`docs/release-evidence/learning-assistant-tests.md`

- [ ] 实现快速失败脚本，依次运行 Prisma validate/generate/migrate status、服务端单元/端到端测试、扩展 Node 测试、客户端 Vitest、服务端/客户端构建、OpenSpec 严格校验及校准阈值。
- [ ] 针对临时 PostgreSQL/Redis/对象存储/邮件依赖运行脚本，并记录完整版本及退出码。
- [ ] 仅修复失败根因；每次修正后先重新运行最小失败命令。
- [ ] 在干净进程中重新运行完整脚本，预期退出码 `0`；保存汇总证据。
- [ ] 提交：`git commit -m "test: add learning assistant release gate"`。

### 任务 8：依据已批准页面进行浏览器验收

**文件：**
- 新建：`docs/release-evidence/learning-assistant-browser-acceptance.md`

- [ ] 执行注册、验证、登录、采集所有权、EPUB 导入、文本型 PDF 导入、扫描型 PDF 失败、单元编辑/确认、契约、会话恢复、迁移掌握、笔记确认/导出、画像控制、USER 菜单、ADMIN 菜单、管理隔离及账户删除。
- [ ] 在桌面和窄屏宽度下对比全部 15 个已批准原型页面及导入/反馈/恢复状态；记录路由、角色、视口、结果和截图引用。
- [ ] 检查浏览器控制台/网络中的错误、重复提交、未认证流、受保护字段或原始秘密；修复根因并重复受影响流程。
- [ ] 仅当所有场景通过，且管理响应或 DOM 中不存在受保护学习内容时，才标记验收完成。
- [ ] 提交：`git commit -m "test: complete learning assistant acceptance"`。

### 任务 9：文档与发布一致性

**文件：**
- 修改：`README.md`、`AGENTS.md`、`docs/design.md`、扩展文档、部署文档
- 新建：`docs/architecture/learning-assistant.md`、`docs/admin/learning-assistant.md`、`docs/privacy/learning-data.md`、`docs/operations/learning-assistant-runbook.md`

- [ ] 使用精确的当前命令/路由记录架构边界、环境变量、部署/迁移/回滚、扩展重新授权、用户/管理员工作流、隐私排除项、配额、健康、审计、恢复和已知非目标。
- [ ] 运行 `$markers = @('T'+'ODO', 'T'+'BD', 'implement'+' later'); rg -n "SQLite|global API Token|学习助手管理|$($markers -join '|')" README.md docs extension AGENTS.md`，修正过时描述或禁止的占位符。
- [ ] 运行 OpenSpec 严格校验和完整发布门禁；预期两者均通过。
- [ ] 检查 `docs/design.md`、proposal/design/specs/tasks、计划和 UI 文案，确保菜单名称、角色、来源类型、50 MB 限制、掌握度门禁和隐私边界一致。
- [ ] 提交：`git commit -m "docs: finalize learning assistant release"`。
