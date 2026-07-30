# SQLite 导入 PostgreSQL 演练基线（2026-07-30）

## 范围

- Node.js：24.14.0（脚本最低要求 22）
- PostgreSQL：16 Alpine
- Compose project：`super_admin_task6_review_20260730`
- 绑定：仅 `127.0.0.1:15433`
- 目标：独立 schema `task6_journal`；非空保护 schema `task6_nonempty`
- baseline migration：`0_postgresql_baseline`

演练 fixture 包含 1 个 `Tool`、2 个 `Job`、1 个旧全局 `ApiToken`、2 个 `KnowledgeItem`。两个知识条目使用相同 URL，用于验证确定性去重策略。

## 证据

源 SQLite 导入前 SHA-256：

```text
6abb8841715151a51662659c124f01705f11e570e2f868655e9ac28312690d00
```

dry-run：

```text
状态：dry-run
源文件 SHA-256：6abb88417151…
目标指纹：fda6b448349d…
计数：Tool=1，Job=2，KnowledgeItem=2，LearningSource=2，SourceVersion=2
跳过旧 ApiToken：1
```

真实导入：

```text
状态：completed
源文件 SHA-256：6abb88417151…
目标指纹：fda6b448349d…
计数：Tool=1，Job=2，KnowledgeItem=2，LearningSource=2，SourceVersion=2
跳过旧 ApiToken：1
```

目标验证：

| 项目                         | 结果 |
| ---------------------------- | ---: |
| User                         |    1 |
| Tool                         |    1 |
| Job                          |    2 |
| KnowledgeItem                |    2 |
| LearningSource               |    2 |
| SourceVersion                |    2 |
| ApiToken                     |    0 |
| AuditEvent migration journal |    6 |

- 管理员：`ADMIN`，邮箱已验证，密码为 Argon2id 哈希；
- 所有 Job、KnowledgeItem、LearningSource、SourceVersion 的 `userId` 均为管理员 ID；
- 两个 KnowledgeItem 分别重连目标 Job 1、2；
- 重复 canonical URL 结果为第一条保留、第二条 `NULL`；
- 两条内容哈希均由独立代码按 `SHA-256(UTF-8(markdown ?? html ?? ''))` 重算并相等：
  - `dd603a0916c0c79b6aaeb9962887a23857aeca00cfbd8237a0647643171e126c`
  - `3fbf6d15717502dfda55e4d960e74d6198008d2376d593c2de09a9ee9a5d802a`
- 导入后源 SQLite SHA-256 仍为 `6abb8841715151a51662659c124f01705f11e570e2f868655e9ac28312690d00`。
- journal phase 为 `bootstrap, jobs, jobs, knowledge-items, knowledge-items, completed`；metadata 检查确认不含目标 URL、用户名、密码、HTML、Markdown 或旧 token。

真实故障注入发生在首个 Job 与 journal 已同事务提交、sidecar 尚未写入时。故障后证据为：

```text
sidecar jobCursor=null
PostgreSQL Job=1
journal phases=bootstrap,jobs
journal Job cursor=10
```

原命令重跑后从 journal 重建 sidecar 并返回 `completed`，最终只有 2 个 Job 且关联正确；再次运行返回 `already-completed`。

在 `task6_nonempty` 仅写入 `PromptVersion=1`、`QuotaPolicy=1` 后，dry-run 和真实导入都在任何迁移写入前拒绝：

```text
目标 PostgreSQL 含有应用数据（PromptVersion, QuotaPolicy）
```

## 伪 AuditEvent 防护复审

RED 阶段新增 10 个伪 journal 用例：未知 phase、metadata 缺字段、错误 `result`、错误 `targetId`、null/他人 actor/target，以及四类 phase 携带非法映射。缺少运行时 parser 时这些测试均失败；实现 envelope 与 metadata 白名单解析后 focused suite 为 28/28 GREEN。

真实 PostgreSQL 使用独立 schema `task6_guard` 完成正常导入后，插入一条与本次迁移完全相同 correlationId、action、targetType、正确 actor/target 且 `result=SUCCESS`，但 metadata `phase=forged` 的 AuditEvent。再次运行明确拒绝：

```text
迁移失败：迁移 journal metadata 身份、版本、phase 或字段无效
```

删除该伪 AuditEvent 后再次运行返回 `already-completed`，证明正常 journal 未受破坏。演练使用唯一 Compose project `super_admin_task6_journal_guard_20260730`，结束后容器、网络、卷、schema、fixture 与 sidecar 均已清理。

## 并发锁、最终源校验与正式入口复审

RED 阶段新增 5 类回归用例：目标读取前未获取锁、源文件在最后一批后变化仍写入 completed、正式脚本仍依赖 `ts-node`、目标 URL 含非法 percent 编码时抛出原始异常，以及释放锁失败覆盖主异常。实现后 focused suite 为 33/33 GREEN：

- 独立 `pg` 会话在读取目标前获取 session advisory lock，并在 dry-run、成功和失败路径中释放；
- 锁键来自完全去凭据的目标指纹，与连接用户名、密码和管理员邮箱无关；
- 写入 completed journal 前重新计算源 SQLite SHA-256；
- `db:migrate:sqlite` 运行编译后的 `dist/scripts/migrate-sqlite-to-postgres.js`，开发入口单独保留为 `db:migrate:sqlite:dev`；
- 非法 percent 编码和清理错误均输出净化后的安全消息，且清理失败不覆盖原始业务失败。

真实 PostgreSQL 使用 Compose project `super_admin_task6_lock_20260730` 验证：

- 编译产物 `server/dist/scripts/migrate-sqlite-to-postgres.js` 存在，并通过正式 `node dist/...` 入口完成 dry-run；
- 首个迁移持有同一 schema 锁时，第二个进程改用不同数据库用户名/密码和不同管理员邮箱仍立即拒绝：

```text
迁移失败：目标 PostgreSQL 正在执行另一个迁移或预演，无法获取排他锁
```

- 在最后一批知识记录提交后修改源文件，源 SHA-256 从
  `d6a2be5f5312c9d6d8d9a7ec60553a447c8d368947004f5c8ba5ffaee344ebe9`
  变为
  `789c6a011ac60703be6cf689b66e3fa8489fb5a188125bb2155e5bde9f040fe5`，脚本拒绝完成：

```text
源 SQLite 在迁移期间发生变化，拒绝写入 completed journal
```

数据库核对得到 journal phase 仅为 `bootstrap, jobs, knowledge-items`，没有 `completed`。本轮专用容器、网络和仓库内 `.task6*` fixture、marker、日志及 sidecar 已全部清理。

## 协议别名锁身份复审

最终质量复审发现，同一 PostgreSQL 目标若分别使用 `postgres://` 与
`postgresql://`，原实现会生成不同的目标指纹和 advisory lock key。新增两条
回归测试后，RED 为 32 项通过、2 项失败；将协议统一规范化为逻辑值
`postgresql` 后，focused suite 为 34/34 GREEN。

最终实现仍使用 hostname、port、database 和 schema 区分目标，但凭据、管理员邮箱
及 PostgreSQL URL 协议别名都不会改变同一目标的锁身份。

## 清理

演练结束后执行 `docker compose down --volumes`，并检查 project 容器和网络为空。fixture、sidecar 和独立 schema 随临时 Compose 数据卷一并清理；仓库内临时文件已删除。
