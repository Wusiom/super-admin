# 基础设施与 PostgreSQL 实施计划

> **供智能体执行者使用：** 必须使用子技能 `superpowers:subagent-driven-development`（推荐）或 `superpowers:executing-plans`，逐项实施本计划。步骤使用复选框（`- [ ]`）跟踪进度。

**目标：** 建立可复现的绿色基线，以及后续所有学习助手切片所需的 PostgreSQL 数据基础。

**状态：** ✅ 已完成（2026-07-30）

**完成总结：** [summaries/01-foundation-postgresql.md](../summaries/01-foundation-postgresql.md)

**架构：** 保持单一 NestJS 进程和单一 Prisma Schema，将 SQLite 替换为 PostgreSQL，并新增规范化且支持所有权隔离的领域表。基础设施配置在启动时校验；迁移作为可独立演练的命令执行，且绝不修改 SQLite 源库。

**技术栈：** NestJS Config、Prisma 6、PostgreSQL 16、Redis 7、MinIO/S3、Mailpit/SMTP、Jest、Docker Compose。

---

### 任务 1：记录并保护现有基线

**文件：**
- 新建：`docs/baselines/2026-07-20-learning-assistant.md`
- 修改：`package.json`

- [x] 运行 `pnpm --filter server test -- --runInBand`、`pnpm --filter server build`、`pnpm --filter client build` 以及全部 `node --test extension/*.test.js`；将命令、退出码、通过/失败数量和任何既有失败原样记录到基线文档。
- [x] 在根目录新增仅组合现有包命令的脚本 `test:server`、`test:extension`、`test`、`db:validate` 和 `db:generate`；运行 `pnpm test`，预期结果与已记录基线一致。
- [x] 在 `server/src/app.module.spec.ts` 新增 Jest 测试，断言模拟基础设施服务后 `AppModule` 能完成编译；确认在尚无模拟或配置接缝时失败。
- [x] 仅添加确定性编译模块所需的最小 Provider 覆盖；重新运行该测试，预期 `PASS`。
- [x] 仅提交基线和脚本变更：`git commit -m "test: record learning assistant baseline"`。

### 任务 2：锁定依赖并校验环境配置

**文件：**
- 修改：`server/package.json`、`client/package.json`、`pnpm-lock.yaml`
- 新建：`server/src/config/environment.ts`、`server/src/config/environment.spec.ts`、`.env.example`
- 修改：`server/src/app.module.ts`

- [x] 新增表驱动失败测试，覆盖缺失 `DATABASE_URL`、`JWT_ACCESS_SECRET`、`TOKEN_ENCRYPTION_KEY`、对象存储配置格式错误及有效本地配置；运行 `pnpm --filter server test -- environment.spec.ts --runInBand`，预期因模块或函数缺失而失败。
- [x] 安装锁文件解析出的精确版本：`@nestjs/jwt`、`argon2`、`cookie-parser`、`zod`、`@langchain/core`、`@langchain/openai`、`@langchain/langgraph`、`@langchain/langgraph-checkpoint-postgres`、`pg`、`file-type`、`epub2`、`pdf-parse`、`@aws-sdk/client-s3`、`nodemailer`、`@nestjs/throttler`；客户端安装 `vitest`、`@vue/test-utils`、`happy-dom` 和 `@pinia/testing`。
- [x] 使用 Zod 实现 `environmentSchema` 并导出强类型 `Environment`；配置 `ConfigModule.forRoot({ isGlobal: true, validate })`；重新运行测试，预期每个无效用例抛出对应字段名。
- [x] 在 `.env.example` 中填写不含秘密的本地默认值，并注明生产环境必填项；运行 `rg -n "(password|secret|token)=.+" .env.example`，预期不存在类似真实凭据的值。
- [x] 运行服务端和客户端构建，然后提交：`git commit -m "build: add validated learning dependencies"`。

### 任务 3：添加 PostgreSQL 及配套服务

**文件：**
- 修改：`docker-compose.yml`、`server/Dockerfile`
- 新建：`docker-compose.test.yml`

- [x] 在 `server/src/config/compose-contract.spec.ts` 编写 Compose 配置测试，解析两份 Compose 文件并断言包含 PostgreSQL、Redis、对象存储、邮件、健康检查和服务端依赖；确认测试失败。
- [x] 添加带命名卷和健康检查的 PostgreSQL 16、MinIO、Mailpit 服务；将服务端 `DATABASE_URL` 改为 PostgreSQL，并添加存储/SMTP 变量，不嵌入生产秘密。
- [x] 将 `server/Dockerfile` 构建期 `DATABASE_URL` 更新为语法有效的 PostgreSQL URL，并保持应用启动前执行 `prisma migrate deploy`。
- [x] 运行 `docker compose config`、聚焦契约测试及 `docker compose -f docker-compose.yml -f docker-compose.test.yml config`；预期全部以 `0` 退出。
- [x] 提交：`git commit -m "build: add postgres storage and mail services"`。

### 任务 4：定义完整的 PostgreSQL 领域模型

**文件：**
- 修改：`server/prisma/schema.prisma`
- 新建：`server/prisma/schema.contract.spec.ts`

- [x] 编写 Schema 契约测试，断言数据源为 `postgresql`、OpenSpec 任务 2.2～2.5 中列出的全部模型均存在、每个用户所有的根实体都含 `userId`，并存在角色、来源、解析、教学、笔记、审计和配额枚举；确认测试失败。
- [x] 添加身份模型（`User`、`WebSession`、`EmailToken`、`PasswordResetToken`、用户所有的 `ApiToken`、`AuditEvent`），包含规范化邮箱唯一约束、令牌哈希、过期/撤销字段及末位管理员查询索引。
- [x] 添加学习模型（`LearningSource`、不可变 `SourceVersion`、`SourceAnchor`、`Concept`、`LearningUnit`、`LearningProject`、`LearningContract`），包含版本、哈希、所有权约束及来源版本外键。
- [x] 添加运行时和运维模型（`TutoringSession`、`TutoringTurn`、`UnderstandingEvidence`、`ConceptState`、`LearnerStrategy`、`ProfileEvidence`、`AtomicNote`、`AtomicNoteLink`、`ModelProvider`、`ModelProfile`、`PromptVersion`、`ModelCall`、`QuotaPolicy`、`UserQuotaOverride`），并为 `Job` 扩展所有者、脱敏元数据、重试、时间戳和幂等字段。
- [x] 运行 Schema 契约测试、`prisma format`、`prisma validate` 和 `prisma generate`；预期全部通过，然后提交：`git commit -m "feat: define learning assistant postgres schema"`。

### 任务 5：创建并验证迁移历史

**文件：**
- 新建：`server/prisma/migrations/0_postgresql_baseline/migration.sql`、`server/prisma/migrations/migration_lock.toml`
- 新建：`server/test/prisma-schema.e2e-spec.ts`

- [x] 新增端到端测试：迁移空白临时数据库，在适用场景下为两个用户创建数值 ID 相同的自有资源，并验证复合所有权/唯一性约束；确认缺少迁移 SQL 时失败。
- [x] 使用 `pnpm --filter server exec prisma migrate diff --from-empty --to-schema server/prisma/schema.prisma --script` 生成 PostgreSQL 基线，检查全部外键和索引，并保存为不可变基线迁移。
- [x] 对临时数据库执行 `prisma migrate deploy`；重新运行端到端测试，预期 `PASS`。
- [x] 运行 `prisma migrate status`，预期输出 `Database schema is up to date`；在切片证据中记录 PostgreSQL 和 Prisma 版本。
- [x] 提交 Schema 和迁移历史：`git commit -m "db: add postgres baseline migration"`。

### 任务 6：构建 SQLite 单向导入演练

**文件：**
- 新建：`server/scripts/migrate-sqlite-to-postgres.ts`、`server/scripts/migrate-sqlite-to-postgres.spec.ts`、`docs/migrations/sqlite-to-postgresql.md`
- 修改：`server/package.json`

- [x] 创建含 Tool、Job、ApiToken 和 KnowledgeItem 数据的 SQLite 固定样例库，并编写失败测试，覆盖试运行计数、初始管理员所有权、内容 SHA-256 一致性、Job 关联及拒绝覆盖非空目标库。
- [x] 将 `db:migrate:sqlite` 实现为单向导入器，要求提供 `--source`、`--target`、`--initial-admin-email` 和 `--dry-run`；创建首个已验证 ADMIN，将每个 KnowledgeItem 映射为一个 WEB `LearningSource` 及不可变 `SourceVersion`，分配 Jobs，且绝不导入原始全局令牌。
- [x] 添加事务边界、`LegacyIdMap` 记录/文件、确定性内容哈希、可恢复的批次游标和脱敏进度输出；重新运行聚焦测试，预期 `PASS`。
- [x] 针对临时数据库演练试运行和真实导入，比较行数与哈希，然后还原 SQLite 固定样例并确认源文件字节未变化。
- [x] 记录冻结、备份、导入、验证、切换和回滚命令，并提交：`git commit -m "feat: add rehearsable sqlite import"`。
