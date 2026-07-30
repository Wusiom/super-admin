# 切片 01：基础设施与 PostgreSQL 完成总结

**状态：** ✅ 已完成

**完成日期：** 2026-07-30

**对应计划：** [01-foundation-postgresql.md](../plans/01-foundation-postgresql.md)

## 完成内容

- 建立服务端、客户端和 Chrome 扩展的可复现测试与构建基线。
- 锁定学习助手所需依赖，并使用 Zod 对 PostgreSQL、Redis、对象存储、SMTP、会话秘密和模型配置进行启动时校验。
- 在 Docker Compose 中加入 PostgreSQL 16、MinIO 和 Mailpit，补齐健康检查、合并配置契约及生产安全边界。
- 将 Prisma 数据源从 SQLite 切换为 PostgreSQL，建立身份、学习来源、教学运行时、模型调用、配额、审计和笔记等完整领域模型。
- 生成并验证不可变 PostgreSQL 基线迁移 `0_postgresql_baseline`。
- 实现可试运行、可恢复、拒绝非空目标库且不修改源库的 SQLite → PostgreSQL 单向导入器。

## 验证结果

| 验证项 | 结果 |
| --- | --- |
| 服务端测试 | 16 个测试套件、194 个测试通过 |
| Chrome 扩展测试 | 18 个测试通过 |
| SQLite 导入器聚焦测试 | 34/34 通过 |
| TypeScript 与单文件 ESLint | 通过 |
| 服务端构建 | 通过 |
| 客户端构建 | 通过 |
| 真实 PostgreSQL 迁移与导入演练 | `dry-run → completed → already-completed` |
| 切片级代码审查 | 无严重、重要或轻微阻塞项 |

真实导入验证确认：

- 初始已验证 ADMIN、Tool、Job、KnowledgeItem、LearningSource 和 SourceVersion 的数量及关联正确。
- 内容 SHA-256 一致。
- 旧全局原始令牌未导入。
- 源 SQLite 文件哈希在导入前后保持一致。
- 临时容器和演练文件已清理。

详细证据：

- [开发基线](../../../../docs/baselines/2026-07-20-learning-assistant.md)
- [PostgreSQL 迁移证据](../../../../docs/baselines/2026-07-30-postgresql-migration.md)
- [SQLite 导入演练证据](../../../../docs/baselines/2026-07-30-sqlite-import-rehearsal.md)
- [迁移操作说明](../../../../docs/migrations/sqlite-to-postgresql.md)

## 提交记录

| 提交 | 日期 | 内容 |
| --- | --- | --- |
| `23de9cc` | 2026-07-20 | 记录学习助手开发基线 |
| `94df065` | 2026-07-20 | 改进基线脚本与隔离断言 |
| `062fc14` | 2026-07-20 | 添加学习助手依赖与环境校验 |
| `c689333` | 2026-07-20 | 防止环境校验泄露秘密 |
| `36020f5` | 2026-07-20 | 收紧基础设施环境校验 |
| `a383cb6` | 2026-07-20 | 验证 SQLite 数据库文件路径 |
| `3b67953` | 2026-07-20 | 添加 PostgreSQL 与配套服务 |
| `ad2608d` | 2026-07-20 | 完善 Compose 合并契约与部署说明 |
| `b9c152f` | 2026-07-20 | 收紧基础设施生产安全边界 |
| `3c0d2f7` | 2026-07-30 | 定义学习助手 PostgreSQL 领域模型 |
| `0a3947c` | 2026-07-30 | 添加 PostgreSQL 基线迁移 |
| `6f6420b` | 2026-07-30 | 添加可演练的 SQLite 单向导入 |

## 偏差与决策

- Prisma 6.19.3 使用 `--to-schema-datamodel` 生成基线迁移，而不是计划中的 `--to-schema`。
- 导入器使用 PostgreSQL 审计日志作为恢复真相源，并以 Sidecar 映射文件辅助恢复；故障后可从已提交游标继续。
- 以上偏差均已通过测试与真实数据库演练验证，没有遗留阻塞项。

## 后续工作

下一个实施切片为 [02：身份、所有权与扩展令牌](../plans/02-identity-ownership.md)，当前尚未开始。
