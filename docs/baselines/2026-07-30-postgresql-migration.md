# PostgreSQL 不可变迁移基线证据

日期：2026-07-30

## 结论

旧的 3 个 SQLite 迁移已整体替换为单一 PostgreSQL 不可变基线
`0_postgresql_baseline`，`migration_lock.toml` 已锁定为 `postgresql`。
真实 E2E 使用唯一 Compose project `codex-task5-postgresql`，只启动 PostgreSQL，
宿主机仅通过 `127.0.0.1:15432` 访问测试数据库。

测试凭据全部来自 `docker-compose.test.yml` 中明确声明的非生产测试值；本文不记录任何真实秘密。

## 基线生成

基线没有手写。工作区依赖布局下，Prisma 6.19.3 使用如下等价参数生成：

```powershell
node node_modules/prisma/build/index.js migrate diff `
  --from-empty `
  --to-schema-datamodel server/prisma/schema.prisma `
  --script `
  --output server/prisma/migrations/0_postgresql_baseline/migration.sql
```

Prisma 6.19.3 的 `migrate diff` 不支持计划中的 `--to-schema` 参数，
对应参数为 `--to-schema-datamodel`。

生成 SQL 审查结果：

- 39 个 `CREATE TABLE`
- 133 个普通或唯一索引
- 82 个外键
- `LearningSource(userId, canonicalUrl)`、`LearnerStrategy(userId, strategyKey)`、
  `Job(userId, toolKey, idempotencyKey)`、`UserQuotaOverride(userId, metric)` 均为
  owner-scoped 唯一约束
- `SourceVersion(sourceId, userId)` 引用 `LearningSource(id, userId)`，并使用
  `ON DELETE CASCADE`
- `ConceptAnchor` 的 concept 和 anchor 外键均包含 `sourceVersionId`，阻止跨版本关系
- `SourceVersion` 的章节、分块、锚点、概念等直接内容树均通过
  `ON DELETE CASCADE` 连接

## RED

先写入 `server/test/prisma-schema.e2e-spec.ts`，随后在真实 PostgreSQL 已健康、
基线文件尚不可见时运行（完整启动命令见“从干净环境复现”）：

```powershell
$env:DATABASE_URL = 'postgresql://super_admin_test:test-postgres-password@127.0.0.1:15432/super_admin_test?schema=public'
Set-Location server
node ../node_modules/jest/bin/jest.js `
  --config ./test/jest-e2e.json `
  test/prisma-schema.e2e-spec.ts `
  --runInBand
Set-Location ..
```

预期且实际失败证据：

```text
Expected: true
Received: false
at expect(existsSync(baselinePath)).toBe(true)
Test Suites: 1 failed, 1 total
Tests:       5 failed, 5 total
```

该次运行在断言前已成功执行 `SELECT version()`，因此失败原因是
`0_postgresql_baseline/migration.sql` 缺失，不是数据库不可达、mock 或测试编译错误。

## GREEN

恢复由 Prisma CLI 生成的基线后，在同一个空测试数据库运行相同 focused E2E：

```text
Test Suites: 1 passed, 1 total
Tests:       5 passed, 5 total
```

覆盖行为：

- 空数据库可由 `prisma migrate deploy` 部署，且迁移表只有已完成的
  `0_postgresql_baseline`
- 每个 Jest suite 使用 `randomUUID()` 生成仅含 `[a-z0-9_]` 的唯一 schema，
  并断言 `current_schema()` 正是该隔离 schema
- 两个用户可分别复用相同的 canonical URL、strategy key、Job idempotency key
  和 quota metric
- 跨用户的 `SourceVersion -> LearningSource` 复合外键写入返回 Prisma `P2003`
- 跨版本 `ConceptAnchor` 写入返回 Prisma `P2003`
- 硬删除 `LearningSource` 后，对应 `SourceVersion`、`SourceSection`、
  `SourceChunk`、`SourceAnchor`、`Concept` 均不存在
- `afterAll` 从独立清理连接删除 suite schema，并在 `finally` 中断开所有
  Prisma Client

Compose 契约 focused 测试：

```text
Test Suites: 1 passed, 1 total
Tests:       22 passed, 22 total
```

`prisma validate` 结果：

```text
The schema at prisma\schema.prisma is valid
```

`prisma generate` 结果：

```text
Generated Prisma Client (v6.19.3)
```

## 迁移状态与版本

`prisma migrate status --schema prisma/schema.prisma`：

```text
1 migration found in prisma/migrations
Database schema is up to date!
```

数据库迁移记录：

```text
0_postgresql_baseline|finished
```

版本：

- PostgreSQL：16.14
- Prisma CLI：6.19.3
- `@prisma/client`：6.19.3
- 临时宿主端口：`127.0.0.1:15432`

## 从干净环境复现

以下值均为 `docker-compose.test.yml` 明确使用的测试值，不得用于生产：

```powershell
$env:POSTGRES_PASSWORD = 'test-postgres-password'
$env:MINIO_ROOT_USER = 'test-minio-access-key'
$env:MINIO_ROOT_PASSWORD = 'test-minio-secret-key'
$env:OBJECT_STORAGE_ACCESS_KEY = 'test-app-access-key'
$env:OBJECT_STORAGE_SECRET_KEY = 'test-app-secret-key'
$env:JWT_ACCESS_SECRET = 'test-jwt-access-secret-at-least-32-characters'
$env:TOKEN_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
$env:TEST_POSTGRES_PORT = '15432'
$env:TEST_CLIENT_PORT = '18080'

docker compose -p codex-task5-postgresql `
  -f docker-compose.yml `
  -f docker-compose.test.yml `
  up -d --wait postgres

$env:DATABASE_URL = 'postgresql://super_admin_test:test-postgres-password@127.0.0.1:15432/super_admin_test?schema=public'

Set-Location server
node ../node_modules/jest/bin/jest.js `
  --config ./test/jest-e2e.json `
  test/prisma-schema.e2e-spec.ts `
  --runInBand
node ../node_modules/prisma/build/index.js `
  migrate deploy `
  --schema prisma/schema.prisma
node ../node_modules/prisma/build/index.js `
  migrate status `
  --schema prisma/schema.prisma
Set-Location ..

docker compose -p codex-task5-postgresql `
  -f docker-compose.yml `
  -f docker-compose.test.yml `
  down --volumes --remove-orphans
```

清理后 `docker compose ... ps -a` 无容器，项目网络一并移除；PostgreSQL 使用测试
override 的 tmpfs 且执行了 `--volumes`，未保留测试数据。

E2E 只在随机隔离 schema 中部署迁移，并在 `afterAll` 删除该 schema；它不会保留
`public` 的迁移状态。因此上述干净环境流程在查询 status 前，显式对 `public`
执行一次 `migrate deploy`。

## 质量复审修复

复审先增加失败断言，再做最小修复。

隔离 schema RED：

```text
Expected: "prisma_e2e_<uuid>"
Received: "public"
Test Suites: 1 failed, 1 total
Tests:       1 failed, 4 passed, 5 total
```

Compose 环境污染 RED（调用者设置 `TEST_POSTGRES_PORT=25432`）：

```text
Expected published: "15432"
Received published: "25432"
Test Suites: 1 failed, 1 total
Tests:       1 failed, 21 passed, 22 total
```

修复后：

```text
prisma-schema.e2e-spec.ts：5 passed, 5 total
compose-contract.spec.ts：22 passed, 22 total
```

稳定性约束：

- `beforeAll` / `afterAll` Jest hook 预算为 30 秒
- `prisma migrate deploy` 子进程硬超时为 25 秒
- Compose 合并契约显式固定 `TEST_POSTGRES_PORT=15432` 和
  `TEST_CLIENT_PORT=18080`，不受调用者环境变量污染
- E2E 完成后查询 `information_schema.schemata`，匹配
  `prisma_e2e_%` 的 schema 数量为 `0`
- 从干净库复验时，E2E 清理隔离 schema 后另行部署 `public`，随后
  `migrate status` 输出 `Database schema is up to date!`
