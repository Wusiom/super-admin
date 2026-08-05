# 切片 02 / 任务 02：轮换 Web 会话与密码重置完成记录

**状态：** ✅ 已完成（真实 PostgreSQL E2E 已纳入强制门禁，待具备数据库连接的环境补跑）  
**完成日期：** 2026-08-05  
**对应计划：** [02-identity-ownership.md](../plans/02-identity-ownership.md)

## 完成内容

- 实现 15 分钟访问 JWT，以及仅以 SHA-256 哈希持久化的 32 字节刷新令牌。
- 实现刷新令牌族轮换、重用检测和整族撤销；并发兑换时最多重试 3 次，序列化冲突耗尽后返回 503，不伪装为无效令牌。
- 实现登录、刷新、登出和全部登出接口。刷新 Cookie 名为 `super_admin_refresh`，具备 `HttpOnly`、`SameSite=Lax`、`Path=/api/auth`，生产环境启用 `Secure`。
- 仅在 JWT 验签与字段校验成功后创建可信 `AuthPrincipal`；登出和全部登出只使用该主体，忽略请求体中的伪造身份。
- 实现 Argon2id 密码重置：先无副作用预检令牌，再在 Serializable 事务内重新读取、条件消费、更新密码并撤销该用户全部 Web 会话。
- 新增 PostgreSQL HTTP 集成测试：并发刷新与重置、Cookie 解析与属性、响应不泄露刷新令牌、登出持久化、全部登出所有者隔离、伪造 JWT 拒绝。

## 验证证据

- TDD：先观察刷新轮换、重置一次性消费、冲突错误分类和 Cookie 安全属性的失败，再实现并转绿。
- 独立复跑：`pnpm --filter server run test -- --runInBand` 通过，22 个套件、268 个测试。
- `pnpm --filter server run build`、生产代码 ESLint、Prettier 与 `git diff --check` 通过。
- 规格验收与 Terra 最高推理质量审查均通过，未遗留 Critical 或 Important 问题。
- `server/test/auth-sessions.postgres.e2e-spec.ts` 已默认要求 `DATABASE_URL`，缺失时明确失败而非跳过；当前机器未配置 `DATABASE_URL`，本地 Docker 守护进程、`psql` 与 5432/15432 PostgreSQL 端口均不可用，因此真实 PostgreSQL 并发 E2E 尚未实跑，也未被表述为已通过。

## 提交记录

| 提交 | 内容 |
| --- | --- |
| `18e5a38` | 实现轮换 Web 会话与密码重置 |
| `eaec829` | 修复令牌族撤销事务与冲突重试 |
| `57057d6` | 加固重置预检、503 冲突分类与 PostgreSQL 集成测试 |
| `02876fa` | 通过 PostgreSQL HTTP 流程验证会话边界 |
| `6ea84be` | 补强登出持久化与生产 Secure Cookie 测试 |

## 后续工作

下一项为任务 3“RBAC、末位管理员保护与所有者隔离 Repository”。在具备 PostgreSQL 连接的环境中，应执行：

`DATABASE_URL=postgresql://... pnpm --filter server run test:e2e -- --runInBand test/auth-sessions.postgres.e2e-spec.ts`
