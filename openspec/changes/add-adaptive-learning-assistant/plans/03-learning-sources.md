# 学习来源与学习契约实施计划

> **供智能体执行者使用：** 必须使用子技能 `superpowers:subagent-driven-development`（推荐）或 `superpowers:executing-plans`，逐项实施本计划。步骤使用复选框（`- [ ]`）跟踪进度。

**目标：** 将采集的网页、EPUB 和文本型 PDF 转换为不可变、按所有者隔离、具备稳定锚点的学习来源，并生成由用户确认的学习契约。

**状态：** ⏳ 未开始

**架构：** 原始文件/快照形成不可变 SourceVersion；BullMQ 通过可观测、幂等的阶段进行解析。领域 API 对外提供脱敏状态和稳定锚点；ModelGateway 仅负责提出概念图、单元顺序和学习契约建议，最终由用户确认。

**技术栈：** NestJS、Prisma、BullMQ、S3 兼容对象存储、`file-type`、EPUB/PDF 解析器、Zod、Jest。

---

### 任务 1：对象存储与不可变来源版本

**文件：**
- 新建：`server/src/storage/object-storage.service.ts`、`local-object-storage.adapter.ts`、`s3-object-storage.adapter.ts`、`storage.module.ts`、`server/src/tools/learning-assistant/sources/source.service.ts`、`source.module.ts`
- 测试：`server/src/storage/object-storage.service.spec.ts`、`server/src/tools/learning-assistant/sources/source.service.spec.ts`

- [ ] 编写失败契约测试，覆盖 put/get/delete、拒绝 Key 路径穿越、SHA-256 校验、按所有者查找来源、版本不可变及相同内容幂等。
- [ ] 运行两个测试套件，预期因符号缺失而失败。
- [ ] 实现存储接口/适配器，以及事务化的 `SourceService.createVersion`，使用规范化内容哈希和所有者/版本唯一约束。
- [ ] 重新运行测试，预期 `PASS`，且返回的元数据 DTO 不包含对象字节。
- [ ] 提交：`git commit -m "feat: add immutable learning sources"`。

### 任务 2：安全准入 EPUB/PDF 上传

**文件：**
- 新建：`server/src/tools/learning-assistant/sources/source.controller.ts`、`dto/upload-source.dto.ts`、`upload-policy.service.ts`
- 测试：`server/src/tools/learning-assistant/sources/upload-policy.service.spec.ts`、`server/test/source-upload.e2e-spec.ts`

- [ ] 新增失败用例，覆盖未认证上传、所有权/配额、50 MB 边界、扩展名/MIME/文件签名不一致、文件损坏、不支持的类型，以及拒绝时不得写入存储或任务。
- [ ] 运行聚焦测试并确认失败。
- [ ] 实现流式上传准入：写入存储前完成认证和配额检查，使用 `file-type` 校验签名，采用精确 EPUB/PDF 白名单、净化文件名，并返回 `413`/`415` 领域错误。
- [ ] 仅在存储成功后创建 SourceVersion 和解析 Job；数据库事务失败时补偿删除对象；重新运行测试，预期 `PASS`。
- [ ] 提交：`git commit -m "feat: validate book uploads"`。

### 任务 3：解析流水线与质量阶段

**文件：**
- 新建：`server/src/tools/learning-assistant/parsing/parse-source.processor.ts`、`epub-extractor.ts`、`pdf-extractor.ts`、`quality-diagnostics.ts`、`anchor-builder.ts`、`parsing.errors.ts`
- 测试：对应的 `.spec.ts` 文件及 `server/test/fixtures/sources/` 下的固定样例
- 修改：`server/src/tools/learning-assistant/manifest.ts`

- [ ] 添加最小化的许可/生成样例及失败测试，覆盖有效 EPUB、文本型 PDF、扫描型 PDF、损坏归档、文本不足、确定性段落锚点、可重试存储故障，以及从最后完成阶段恢复。
- [ ] 运行解析器测试，预期因 Processor 缺失而失败。
- [ ] 实现阶段 `VALIDATED -> STORED -> TEXT_EXTRACTED -> ANCHORED -> MAP_PENDING -> READY`；将扫描/空白 PDF 分类为 `SCANNED_PDF_UNSUPPORTED`，且仅基础设施故障可重试。
- [ ] 注册幂等 BullMQ Processor，按 `(sourceVersionId, anchorKey)` upsert 锚点且不创建重复版本；重新运行测试，预期 `PASS`。
- [ ] 提交：`git commit -m "feat: parse books into stable anchors"`。

### 任务 4：将网页采集迁移到统一来源

**文件：**
- 修改：`server/src/tools/knowledge-capture/capture.processor.ts`、`knowledge-capture.controller.ts`、`knowledge-capture.module.ts`
- 测试：`server/src/tools/knowledge-capture/capture.processor.spec.ts`、`knowledge-capture.controller.spec.ts`

- [ ] 调整测试：成功采集应创建用户所有的 WEB 来源/版本及兼容 DTO；快照缺失、元数据无效和跨用户访问仍应被拒绝。
- [ ] 运行聚焦测试，确认当前写入 `KnowledgeItem` 的实现导致失败。
- [ ] 将提取的 Markdown/HTML 交给 `SourceService.createVersion`，仅在修订规格要求的范围内保留旧端点形状，并对 Job 输入/输出元数据脱敏。
- [ ] 重新运行采集、所有权、生命周期和扩展测试；预期 `PASS`，且读取 Job 时不包含原始快照正文。
- [ ] 提交：`git commit -m "refactor: store captures as learning sources"`。

### 任务 5：内容图谱与学习单元确认

**文件：**
- 新建：`server/src/tools/learning-assistant/content-map/content-map.service.ts`、`content-map.schemas.ts`、`content-map.controller.ts`
- 测试：`server/src/tools/learning-assistant/content-map/content-map.service.spec.ts`

- [ ] 编写失败测试，覆盖符合 Schema 的概念/依赖/单元、有效当前版本锚点、拒绝无效或跨版本锚点，以及用户拆分/合并/排序/跳过后仍覆盖保留锚点。
- [ ] 运行聚焦测试，预期因 Service 缺失而失败。
- [ ] 实现 Zod 契约、建议与确认分离持久化、锚点解析及原子化确认修订；仅通过可模拟接口调用 `ModelGateway`。
- [ ] 重新运行测试，预期无效模型输出不会产生已确认计划。
- [ ] 提交：`git commit -m "feat: add confirmed learning units"`。

### 任务 6：学习契约与开始门禁

**文件：**
- 新建：`server/src/tools/learning-assistant/contracts/learning-contract.service.ts`、`learning-contract.controller.ts`、`dto/create-learning-contract.dto.ts`
- 测试：`server/src/tools/learning-assistant/contracts/learning-contract.service.spec.ts`、`server/test/learning-contract.e2e-spec.ts`

- [ ] 编写失败测试，覆盖可迁移学习成果、时间预算、已有知识、选定的已确认单元、零单元冲突、外部用户来源/项目，以及确认前尝试开始学习。
- [ ] 运行聚焦测试并确认失败。
- [ ] 实现不可变契约版本及供后续教学会话创建调用的 `assertStartable(projectId, userId)` 门禁。
- [ ] 重新运行全部来源/契约测试，预期 `PASS`。
- [ ] 提交：`git commit -m "feat: add user-confirmed learning contracts"`。

### 任务 7：来源 API、重试、删除与清理

**文件：**
- 修改：`server/src/tools/learning-assistant/sources/source.controller.ts`、`server/src/core/bullmq.service.ts`、`server/src/core/jobs.controller.ts`
- 新建：`server/src/tools/learning-assistant/sources/delete-source.processor.ts`、`server/test/source-lifecycle.e2e-spec.ts`

- [ ] 编写失败端到端测试，覆盖自有列表/详情/版本/阶段、脱敏失败信息、符合条件的幂等重试、拒绝不安全重试、删除数据库/对象/检查点后代数据，以及不影响其他用户。
- [ ] 运行测试并记录失败。
- [ ] 实现按所有者隔离的 API、由 Processor 声明的重试策略、真实 BullMQ 重新入队、带可恢复失败的分阶段清理，以及删除进度元数据。
- [ ] 重新运行来源、任务、BullMQ 和 IDOR 测试；预期 `PASS`，且不存在直接内联重试执行。
- [ ] 提交：`git commit -m "feat: complete source lifecycle"`。
