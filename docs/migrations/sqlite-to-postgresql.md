# SQLite 到 PostgreSQL 单向迁移

本流程把旧版 SQLite 中的 `Tool`、`Job`、`KnowledgeItem` 导入 PostgreSQL，并为每条知识记录创建一条 `WEB` 类型的 `LearningSource` 和不可变的 `SourceVersion(version=1)`。运行环境要求 Node.js 22 或更高版本、Prisma 6 和 PostgreSQL 16。

迁移脚本始终以只读方式打开 SQLite，不会原地升级或修改源文件。旧版全局 `ApiToken` 不会导入；脚本只报告跳过数量。初始管理员使用不可知的安全随机密码生成 Argon2id 哈希，迁移过程不会输出明文，因此切换后必须通过密码重置流程设置新密码。

## 1. 冻结写入并备份

先停止会写入旧 SQLite 的服务和后台任务，确认没有运行中的采集任务，再备份数据库及其校验值。以下命令在仓库根目录执行：

```powershell
Copy-Item -LiteralPath .\server\prisma\dev.db -Destination D:\backup\super-admin-before-postgresql.db
Get-FileHash -Algorithm SHA256 .\server\prisma\dev.db
Get-FileHash -Algorithm SHA256 D:\backup\super-admin-before-postgresql.db
```

两份 SHA-256 必须一致。若 SQLite 使用 WAL 模式，应在冻结写入并正常关闭旧进程后再复制，避免仅复制主文件而遗漏未 checkpoint 的 WAL 数据。

## 2. 准备空目标

目标必须是只部署了 baseline migration 的空 schema。脚本通过 PostgreSQL catalog 枚举当前 schema 的全部 base table 并逐表计数，唯一忽略 `_prisma_migrations`。任何其他表（包括 `PromptVersion`、`QuotaPolicy`、`ModelProvider` 或未知扩展表）只要有一行，都会在任何写入前拒绝。

```powershell
$env:DATABASE_URL = 'postgresql://<user>:<password>@127.0.0.1:5432/<database>?schema=import'
pnpm --filter server exec prisma migrate deploy --schema prisma/schema.prisma
```

不要把真实连接串写入仓库、命令历史或迁移记录。

正式运行使用编译后的 `dist/scripts/migrate-sqlite-to-postgres.js`，不要在生产环境依赖 `ts-node`。先完成构建：

```powershell
pnpm --filter server build
```

若在生产 Docker 容器内运行，镜像必须包含 Node.js 22+、生产依赖、生成后的 Prisma Client 和 `server/dist`；同时把冻结后的 SQLite 备份以只读文件挂载到容器，并把 sidecar 所在目录以可写持久卷挂载。`pg` 是正式运行所需的生产依赖。

## 3. dry-run

所有必需参数都必须提供。`--dry-run` 只读取 SQLite 和 PostgreSQL，不创建管理员、不写业务表、不写 `AuditEvent` journal，也不创建 sidecar：

```powershell
pnpm --filter server run db:migrate:sqlite -- `
  --source .\prisma\dev.db `
  --target $env:DATABASE_URL `
  --initial-admin-email admin@example.test `
  --id-map D:\backup\super-admin-legacy-id-map.json `
  --batch-size 100 `
  --dry-run
```

核对输出中的 `Tool`、`Job`、`KnowledgeItem`、`LearningSource`、`SourceVersion` 和“跳过旧 ApiToken”计数。日志只显示阶段、计数及哈希/指纹摘要，不显示源内容、token、密码或完整目标 URL。

脚本会在读取目标 catalog 前，用独立 PostgreSQL 会话获取 session advisory lock，并保持到本次命令结束；dry-run、真实导入和恢复流程均受同一把锁保护。锁键只由目标的 protocol、hostname、port、database、schema 指纹推导，不包含用户名、密码或管理员邮箱；`postgres://` 与 `postgresql://` 会先统一为同一逻辑协议，因此更换协议别名、凭据或管理员参数都不能绕过同一目标的互斥保护。若已有迁移或预演占用该目标，后启动的命令会立即安全拒绝。

脚本会在写入前拒绝以下不完整数据：

- `KnowledgeItem.jobId` 指向不存在的旧 `Job`；
- 多条 `KnowledgeItem` 指向同一旧 `Job`，违反目标的一对一约束。

重复 `canonicalUrl` 采用确定性策略：按旧 `KnowledgeItem.id` 升序，第一条保留 URL，后续重复项写为 `NULL`。这样仍为每条知识记录创建独立 `LearningSource`，同时满足目标唯一约束。

## 4. 真实导入

再次确认写入已冻结、备份哈希未变，然后使用与 dry-run 完全相同的参数并省略 `--dry-run`：

```powershell
pnpm --filter server run db:migrate:sqlite -- `
  --source .\prisma\dev.db `
  --target $env:DATABASE_URL `
  --initial-admin-email admin@example.test `
  --id-map D:\backup\super-admin-legacy-id-map.json `
  --batch-size 100
```

导入边界如下：

- 一个事务创建初始管理员、全部 `Tool` 及 bootstrap journal；
- `Job` 按 `--batch-size` 分批，每批数据与对应 journal 在同一事务提交；
- `KnowledgeItem`、对应 `LearningSource`、对应 `SourceVersion` 及该批 journal 在同一事务提交；
- 最后一批提交后重新读取 SQLite 文件并校验 SHA-256；只有仍与启动快照一致时，才以独立事务写入 completed journal；
- 每次数据库事务提交后，脚本再用“临时文件 + 原子 rename”更新 `LegacyIdMap` sidecar。

内容哈希规范固定为：

```text
SHA-256(UTF-8(contentMarkdown ?? contentHtml ?? ''))
```

## 5. PostgreSQL journal、中断恢复与 sidecar 保管

每个批次都会在 PostgreSQL `AuditEvent` 留下一条预期的迁移 journal。journal 使用源 SHA-256、完全去凭据的目标指纹和管理员邮箱推导 correlation/import key，记录 phase、cursor 和该批完整 legacy→target ID 映射。journal 不保存完整目标 URL、用户名、密码、源内容或 raw token。目标指纹只包含 protocol、hostname、port、database、schema，数据库凭据轮换不会改变指纹。

`AuditEvent` journal 是跨数据库/文件崩溃恢复的真相来源。sidecar 是 journal 的文件镜像，仍应与 SQLite 备份一起放在受控目录，禁止手工编辑。

中断后原样重跑命令。即使数据库事务已经提交而 sidecar 尚未 rename、sidecar 缺失或落后，脚本也会从匹配 journal 重建 sidecar。恢复前必须同时满足：

- journal 的源 SHA-256、目标指纹、管理员、phase 顺序、映射键集合和 cursor 完全覆盖已提交源记录；目标指纹中的协议已规范化，两个 PostgreSQL URL 协议别名等价；
- 每条 `AuditEvent` 外层必须是 `SUCCESS`，`targetId` 必须等于本次 import key，`actorUserId` 与 `targetUserId` 必须等于 journal 初始管理员；任何 null、他人身份或同 correlationId 的伪事件均拒绝；
- metadata 必须使用受支持版本和 `bootstrap`、`jobs`、`knowledge-items`、`completed` 四种 phase；每种 phase 只能携带其规定的映射，未知 phase、缺字段或跨 phase mapping 均拒绝；
- journal 映射的 Tool key、Job owner/字段、KnowledgeItem owner/jobId/内容、LearningSource owner/type/canonical URL、SourceVersion owner/sourceId/version/contentHash 均与源快照一致；
- catalog 中除本次导入能证明的管理员、实体和 journal 外，所有表行数均为 0；
- `AuditEvent` 只包含本次迁移 journal，没有未知审计行。

journal 与 sidecar 不一致时，以通过上述验证的数据库 journal 重建 sidecar；不能通过验证则安全拒绝。状态为 `completed` 时再次运行会报告 `already-completed`，不会重复导入。迁移 journal 属于预期保留的审计记录，不应在切换后删除。

如果最终 SHA-256 校验发现 SQLite 在迁移期间发生变化，脚本拒绝写入 `completed`，已提交的 journal 保持可审计的进行中状态。此时不要继续修改源文件或手工补 journal；重新冻结旧系统，从已核验备份重建一个空目标 schema，再从头迁移。

## 6. 验证

导入前后再次比较 SQLite SHA-256：

```powershell
Get-FileHash -Algorithm SHA256 .\server\prisma\dev.db
Get-FileHash -Algorithm SHA256 D:\backup\super-admin-before-postgresql.db
```

在 PostgreSQL 中至少验证：

```sql
SELECT COUNT(*) FROM "Tool";
SELECT COUNT(*) FROM "Job";
SELECT COUNT(*) FROM "KnowledgeItem";
SELECT COUNT(*) FROM "LearningSource";
SELECT COUNT(*) FROM "SourceVersion";
SELECT COUNT(*) FROM "ApiToken";

SELECT k.id, k."jobId", j.id AS linked_job, k."userId", j."userId"
FROM "KnowledgeItem" k
LEFT JOIN "Job" j ON j.id = k."jobId";

SELECT s.id, s."userId", s."canonicalUrl", v.version, v."contentHash"
FROM "LearningSource" s
JOIN "SourceVersion" v ON v."sourceId" = s.id AND v."userId" = s."userId";

SELECT "emailNormalized", role, "emailVerifiedAt"
FROM "User";
```

要求：

- 目标实体计数与 dry-run 一致；
- `KnowledgeItem.jobId` 全部正确重连，且用户归属与对应 `Job` 一致；
- 所有旧 `Job`、`KnowledgeItem`、`LearningSource`、`SourceVersion` 属于初始管理员；
- 独立按上述 UTF-8 规则计算的 SHA-256 与 `SourceVersion.contentHash` 相同；
- `ApiToken` 为 0，旧 raw global token 未进入目标；
- 管理员为 `ADMIN`、邮箱已验证、密码字段为 Argon2id 哈希。

## 7. 切换

验证通过后，在维护窗口内把应用 `DATABASE_URL` 切到已验证的 PostgreSQL schema，启动服务并检查健康状态。不要删除 SQLite 备份或 sidecar。管理员首次使用前必须完成密码重置。

## 8. 回滚

若切换后出现问题：

1. 立即停止新系统写入；
2. 将应用配置恢复到切换前版本和旧 SQLite 备份；
3. 启动旧版本并验证读取、采集和任务队列；
4. 保留 PostgreSQL 临时 schema、日志摘要和 sidecar 用于排查，不要把 PostgreSQL 数据反向写回 SQLite。

这是单向迁移，没有 PostgreSQL→SQLite 的自动回写。需要重做时，删除或重建独立的临时目标 schema，从校验过的 SQLite 备份重新开始。
