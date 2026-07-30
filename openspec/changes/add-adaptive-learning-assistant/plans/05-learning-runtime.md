# 自适应教学、学习者画像与笔记实施计划

> **供智能体执行者使用：** 必须使用子技能 `superpowers:subagent-driven-development`（推荐）或 `superpowers:executing-plans`，逐项实施本计划。步骤使用复选框（`- [ ]`）跟踪进度。

**目标：** 交付基于证据的学习闭环、完成报告、透明的学习者策略及由用户确认的原子笔记。

**状态：** ⏳ 未开始

**架构：** 每次提交答案都以幂等键创建一个领域轮次，再依据不可变来源锚点独立评估。仅校验通过的评估写入证据；只有迁移应用证据能通过掌握度门禁。画像更新仅消费已评估结果，笔记在用户明确确认前始终为草稿。

**技术栈：** NestJS、Prisma、LangGraph、ModelGateway、基于认证 fetch 的 SSE、Zod、用于大型导出的 BullMQ、Jest/Supertest。

---

### 任务 1：会话创建、恢复与轮次幂等

**文件：**
- 新建：`server/src/tools/learning-assistant/tutoring/tutoring-session.service.ts`、`tutoring.controller.ts`、`turn-idempotency.service.ts`
- 测试：`server/src/tools/learning-assistant/tutoring/tutoring-session.service.spec.ts`、`server/test/tutoring-session.e2e-spec.ts`

- [ ] 编写失败测试，覆盖基于已确认契约开始、外部用户/未确认冲突、单活跃会话配额、刷新/重启后恢复、重复提交返回同一轮次，以及重复恢复中断不产生额外证据。
- [ ] 运行聚焦测试并确认失败。
- [ ] 实现事务化会话/轮次创建、唯一 `(sessionId, idempotencyKey)`、图 Thread 关联、当前中断查询及结束会话状态。
- [ ] 重新运行测试，预期重复请求和模块重建后 ID/结果保持稳定。
- [ ] 提交：`git commit -m "feat: add resumable tutoring sessions"`。

### 任务 2：教学动作与认证 SSE

**文件：**
- 新建：`server/src/tools/learning-assistant/tutoring/tutoring-stream.controller.ts`、`tutoring-event.ts`、`tutoring-event.service.ts`
- 测试：`server/test/tutoring-stream.e2e-spec.ts`

- [ ] 编写失败 SSE 测试，覆盖认证连接、节点进度、可见增量文本、单一主要思考任务、可恢复错误、最终已提交结果、断线/重连游标，以及不发送隐藏 Prompt/Graph State 事件。
- [ ] 运行聚焦端到端测试并确认失败。
- [ ] 实现事件类型 `progress`、`content`、`interaction`、`recoverable_error`、`committed`、`done`；仅持久化可安全重放的公开事件，并在推流前验证会话所有者。
- [ ] 重新运行测试，预期通过 `Last-Event-ID` 重连后完成重放，但不重复领域轮次。
- [ ] 提交：`git commit -m "feat: stream tutoring progress"`。

### 任务 3：独立评估与掌握度门禁

**文件：**
- 新建：`server/src/tools/learning-assistant/evaluation/evaluation.service.ts`、`mastery-policy.service.ts`、`evidence.repository.ts`
- 测试：对应的 `.spec.ts` 文件及 `server/test/mastery.e2e-spec.ts`

- [ ] 编写失败用例，覆盖基于来源的评估、模型/用户分歧、Schema/锚点失败时不写入、仅回忆证据不能掌握、迁移失败不能掌握，以及有效迁移产生 `TRANSFER_VALIDATED`。
- [ ] 运行聚焦测试并确认失败。
- [ ] 实现独立评估 Prompt/Profile 选择、校验后的证据写入、只追加证据、确定性概念状态归约，以及唯一的迁移掌握状态转换。
- [ ] 重新运行测试，预期阅读时间、回答数量、图声明和画像偏好均不能提升掌握度。
- [ ] 提交：`git commit -m "feat: gate mastery on transfer evidence"`。

### 任务 4：完成状态与学习报告

**文件：**
- 新建：`server/src/tools/learning-assistant/reports/learning-report.service.ts`、`learning-report.controller.ts`
- 测试：`server/src/tools/learning-assistant/reports/learning-report.service.spec.ts`

- [ ] 编写失败测试，覆盖单元完成、综合迁移任务、可迁移能力、薄弱概念、分歧、引用、未完成会话报告及所有者隔离。
- [ ] 运行聚焦测试并确认失败。
- [ ] 仅根据契约、轮次、已验证证据、概念状态和锚点投影报告；保留未解决分歧，不进行覆盖。
- [ ] 重新运行测试，预期未经 Schema 校验且未关联来源的模型自由文本不会出现。
- [ ] 提交：`git commit -m "feat: generate learning reports"`。

### 任务 5：证据支持的学习者策略画像

**文件：**
- 新建：`server/src/tools/learning-assistant/profile/learner-profile.service.ts`、`learner-profile.controller.ts`、`strategy-policy.ts`
- 测试：`server/src/tools/learning-assistant/profile/learner-profile.service.spec.ts`

- [ ] 编写失败测试，覆盖仅基于有效结果更新、置信度/证据/通俗效果说明、证据不足、单项策略禁用、删除证据、禁用个性化、重置，以及不推断职业或人格。
- [ ] 运行聚焦测试并确认失败。
- [ ] 实现有界策略枚举和确定性证据聚合；评分标准、权限、来源校验和掌握阈值不得作为画像输入。
- [ ] 重新运行测试，预期操纵画像仅能改变教学动作偏好。
- [ ] 提交：`git commit -m "feat: add transparent learner strategies"`。

### 任务 6：原子笔记草稿与确认

**文件：**
- 新建：`server/src/tools/learning-assistant/notes/atomic-note.service.ts`、`atomic-note.controller.ts`、`atomic-note.schema.ts`
- 测试：`server/src/tools/learning-assistant/notes/atomic-note.service.spec.ts`

- [ ] 编写失败测试，覆盖草稿仅源于用户回答、来源/版本/锚点/轮次引用、单一论断校验、编辑、确认、拒绝，以及 Agent 无法自动确认。
- [ ] 运行聚焦测试并确认失败。
- [ ] 实现 Zod 草稿生成及显式用户状态转换 `DRAFT -> CONFIRMED|REJECTED`；拒绝仅来源或仅模型的出处。
- [ ] 重新运行测试，预期仅所有者可读取或修改笔记。
- [ ] 提交：`git commit -m "feat: add confirmed atomic notes"`。

### 任务 7：笔记链接、知识库、导出与删除

**文件：**
- 新建：`server/src/tools/learning-assistant/notes/note-link.service.ts`、`note-export.service.ts`、`note-export.processor.ts`
- 测试：对应的 `.spec.ts` 文件及 `server/test/note-lifecycle.e2e-spec.ts`

- [ ] 编写失败测试，覆盖最多三个按所有者隔离的建议、逐链接确认、搜索/来源筛选/详情/删除、小型同步导出、大型队列导出，以及 Markdown 仅含已确认笔记/链接。
- [ ] 运行聚焦测试并确认失败。
- [ ] 实现不泄露正文的链接候选、确认记录、确定性 Markdown 排序、基于存储的大型导出、仅所有者可用的签名下载及清理。
- [ ] 重新运行测试；断言草稿、被拒链接、外部用户笔记、原始图数据和隐藏 Prompt 均不存在。
- [ ] 提交：`git commit -m "feat: complete atomic note lifecycle"`。

### 任务 8：运行时恢复矩阵

**文件：**
- 新建：`server/test/tutoring-recovery.e2e-spec.ts`

- [ ] 添加完整矩阵：刷新、服务端重启、重复答案、重复恢复、SSE 断线、模型超时、Schema 失败、降级成功/失败、仅回忆失败、迁移成功、配额拒绝及已结束会话。
- [ ] 运行并记录每一项失败。
- [ ] 仅修复矩阵暴露出的事务、幂等、检查点或响应契约缺口。
- [ ] 运行全部服务端测试及构建，预期零失败。
- [ ] 提交：`git commit -m "test: verify tutoring recovery matrix"`。
