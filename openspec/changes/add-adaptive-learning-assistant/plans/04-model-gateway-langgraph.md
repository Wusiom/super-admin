# 模型网关与 LangGraph 实施计划

> **供智能体执行者使用：** 必须使用子技能 `superpowers:subagent-driven-development`（推荐）或 `superpowers:executing-plans`，逐项实施本计划。步骤使用复选框（`- [ ]`）跟踪进度。

**目标：** 提供安全、可观测的模型边界，以及可暂停和恢复、但不会成为第二业务数据库的持久教学图。

**状态：** ⏳ 未开始

**架构：** 所有模型调用统一经过 `ModelGateway`，使用不可变配置/Prompt、Zod 输出校验、配额预检、有界重试和降级。LangGraph 使用 `PostgresSaver`，设置 `thread_id = tutoringSession.id`，状态仅含可 JSON 序列化游标，并通过 `interrupt()`/`Command({ resume })` 交互；仅领域 Service 持久化轮次、证据和掌握度。

**技术栈：** LangChain JS、LangGraph JS、`@langchain/langgraph-checkpoint-postgres`、Zod、Node crypto AES-256-GCM、Prisma、Jest。

---

### 任务 1：加密 Provider 与不可变配置

**文件：**
- 新建：`server/src/ai/secrets/secret-box.service.ts`、`server/src/ai/config/model-config.service.ts`、`server/src/ai/config/model-config.dto.ts`
- 测试：`server/src/ai/secrets/secret-box.service.spec.ts`、`server/src/ai/config/model-config.service.spec.ts`

- [ ] 编写失败测试，覆盖 AES-256-GCM 往返、Nonce 唯一性、篡改拒绝、脱敏 Provider DTO、已发布 Profile/Prompt 不可变及既有会话版本固定。
- [ ] 运行聚焦测试，预期因符号缺失而失败。
- [ ] 使用校验后的 32 字节加密密钥实现带版本的密文信封；实现草稿/验证/发布记录，以及仅暴露 `secretConfigured: boolean` 的 DTO。
- [ ] 重新运行测试；搜索序列化 DTO/审计样例中的明文密钥，预期无匹配。
- [ ] 提交：`git commit -m "feat: secure model configurations"`。

### 任务 2：配额预检与模型调用账本

**文件：**
- 新建：`server/src/ai/quota/quota.service.ts`、`server/src/ai/usage/model-call.service.ts`
- 测试：`server/src/ai/quota/quota.service.spec.ts`、`server/src/ai/usage/model-call.service.spec.ts`

- [ ] 编写失败测试，覆盖平台默认值、用户覆盖值、月度 Token/存储限制、并发会话限制、调用 Provider 前拒绝，以及脱敏的成本/延迟/错误记录。
- [ ] 运行聚焦测试并确认失败。
- [ ] 实现有效配额解析及原子预留/结算账本；仅存储用途、模型/Profile/Prompt 版本、Token、延迟、校验状态、降级和关联信息。
- [ ] 重新运行测试，预期超额调用保持教学会话可恢复，且不会调用 Provider Mock。
- [ ] 提交：`git commit -m "feat: enforce model quotas"`。

### 任务 3：ModelGateway 结构化输出

**文件：**
- 新建：`server/src/ai/gateway/model-gateway.ts`、`openai-compatible.factory.ts`、`structured-call.ts`、`model-gateway.errors.ts`
- 测试：`server/src/ai/gateway/model-gateway.spec.ts`

- [ ] 编写失败测试，覆盖 Profile/Prompt 解析、超时、可重试 Provider 故障、一次 Schema 修复、降级顺序、Zod 校验、Token 计量及脱敏终止错误。
- [ ] 运行聚焦测试，预期因 Gateway 缺失而失败。
- [ ] 使用 `ChatOpenAI.withStructuredOutput`、`AbortSignal.timeout`、有界重试/降级、配额预留及 ModelCall 结算，实现 `invokeStructured<T>(request, schema)`。
- [ ] 重新运行测试；预期最终输出无效时抛出 `MODEL_OUTPUT_INVALID`，且不写入领域数据。
- [ ] 提交：`git commit -m "feat: add structured model gateway"`。

### 任务 4：教学动作与来源有据评估契约

**文件：**
- 新建：`server/src/tools/learning-assistant/tutoring/tutor-action.schema.ts`、`evaluation-result.schema.ts`、`grounding-validator.service.ts`
- 测试：对应的 `.spec.ts` 文件

- [ ] 编写失败测试，覆盖精确动作枚举（`EXPLAIN`、`ASK_RECALL`、`ASK_SELF_EXPLAIN`、`ASK_TRANSFER`、`GIVE_HINT`、`GIVE_EXAMPLE`、`COMPARE`、`CHALLENGE`、`SUMMARIZE`、`MAKE_NOTE`）、拒绝未知动作、评分字段、保留分歧及校验当前版本锚点。
- [ ] 运行聚焦测试，确认因 Schema 缺失而失败。
- [ ] 实现带判别字段的 Zod 动作载荷、含 verdict/reasoning/citations/disagreements/evidence kind 的 EvaluationResult，以及针对可信项目版本的锚点校验。
- [ ] 重新运行测试；预期外部用户/缺失锚点和不支持的动作字符串在持久化前失败。
- [ ] 提交：`git commit -m "feat: constrain tutoring model output"`。

### 任务 5：PostgreSQL Checkpointer 生命周期

**文件：**
- 新建：`server/src/ai/graph/langgraph-checkpointer.service.ts`、`langgraph.module.ts`
- 测试：`server/src/ai/graph/langgraph-checkpointer.service.spec.ts`、`server/test/langgraph-checkpoint.e2e-spec.ts`

- [ ] 编写失败测试，覆盖仅执行一次 `PostgresSaver.setup()`、由自有领域会话派生 Thread ID、Service 重建后恢复检查点、删除来源时清理，以及管理/领域 DTO 不含 Graph State。
- [ ] 运行聚焦测试并确认失败。
- [ ] 在应用生命周期中初始化 `PostgresSaver`，并提供仅暴露编译配置、状态删除和健康状态的窄接口；Controller 不得暴露任意检查点读取。
- [ ] 使用临时 PostgreSQL 重新运行，在新建 Nest 测试模块后仍应恢复成功。
- [ ] 提交：`git commit -m "feat: persist langgraph checkpoints"`。

### 任务 6：首个可中断教学图

**文件：**
- 新建：`server/src/tools/learning-assistant/tutoring/tutoring.state.ts`、`tutoring.graph.ts` 及 `tutoring/nodes/` 下的节点
- 测试：`server/src/tools/learning-assistant/tutoring/tutoring.graph.spec.ts`

- [ ] 编写失败图测试，覆盖 `observe -> chooseAction -> render -> interrupt`、通过 `Command({ resume })` 恢复、`evaluate -> persistEvidence -> chooseNext`、状态可 JSON 序列化，以及中断前代码确定性重放。
- [ ] 运行聚焦测试，确认因 Graph 缺失而失败。
- [ ] 定义仅包含 ID、节点游标、待处理交互、符合 Schema 的瞬态输出引用及幂等键的图状态；向节点注入领域/模型 Port。
- [ ] 实现节点：中断后的副作用受领域幂等保护；使用 Checkpointer 编译，并设置 `{ configurable: { thread_id: session.id } }`；重新运行，预期 `PASS`。
- [ ] 提交：`git commit -m "feat: add durable tutoring graph"`。

### 任务 7：证明图与领域分离

**文件：**
- 新建：`server/test/langgraph-domain-boundary.e2e-spec.ts`

- [ ] 添加测试：在图输入中伪造掌握度/角色/userId、重放检查点、重复恢复中断、破坏瞬态动作，以及在中断与恢复间重启。
- [ ] 运行并记录所有边界失败。
- [ ] 收紧图输入构造、可信主体注入、Schema 解析和领域幂等性，直至图控制值无法直接改变授权或掌握度。
- [ ] 运行全部 AI、认证、来源和 Schema 测试及构建；预期零失败。
- [ ] 提交：`git commit -m "test: enforce graph domain boundary"`。
