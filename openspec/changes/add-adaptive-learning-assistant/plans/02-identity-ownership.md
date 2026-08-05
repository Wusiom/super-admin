# 身份、所有权与扩展令牌实施计划

> **供智能体执行者使用：** 必须使用子技能 `superpowers:subagent-driven-development`（推荐）或 `superpowers:executing-plans`，逐项实施本计划。步骤使用复选框（`- [ ]`）跟踪进度。

**目标：** 以完整的邮箱身份体系、可撤销 Web 会话、服务端强制角色、所有者隔离和限定作用域的扩展令牌，替代宽松的全局令牌访问。

**状态：** 🔄 进行中（任务 3：RBAC、末位管理员保护与所有者隔离 Repository）

**任务记录：** [任务 1：邮件抽象与账户注册](../summaries/02-task-01-mail-accounts.md)｜[任务 2：轮换 Web 会话与密码重置](../summaries/02-task-02-sessions-password-reset.md)

**架构：** 仅由 Web JWT 或哈希 API 令牌守卫创建可信请求主体。Controller 将该主体传给按所有者隔离的 Service；Repository 的每个选择条件均包含 `userId`。刷新令牌轮换采用令牌族和重用检测，扩展令牌则是仅限 `capture:create` 的独立凭据。

**技术栈：** NestJS、Argon2id、`@nestjs/jwt`、Prisma/PostgreSQL、Nodemailer、HttpOnly Cookie、Jest/Supertest。

---

### 任务 1：邮件抽象与账户注册

**文件：**
- 新建：`server/src/auth/mail/mail.service.ts`、`mail.module.ts`、`diagnostic-mail.transport.ts`、`smtp-mail.transport.ts`、`server/src/auth/accounts/accounts.service.ts`、`accounts.controller.ts`、`dto/register.dto.ts`
- 测试：`server/src/auth/accounts/accounts.service.spec.ts`
- 修改：`server/src/app.module.ts`

- [x] 编写失败测试，覆盖规范化邮箱唯一性、Argon2id 哈希存储、未验证账户拒绝登录、限时哈希验证令牌、重发限流及一致的找回响应。
- [x] 运行 `pnpm --filter server test -- accounts.service.spec.ts --runInBand`；预期因 Provider 和方法缺失而失败。
- [x] 实现 `MailService.sendVerification`/`sendPasswordReset`、诊断与 SMTP Transport、账户注册、验证令牌兑换和重发频率边界，且不持久化原始令牌。
- [x] 重新运行聚焦测试；预期全部通过，快照和日志断言均不含密码或原始令牌。
- [x] 提交：`git commit -m "feat: add verified email accounts"`。

### 任务 2：轮换 Web 会话与密码重置

**文件：**
- 新建：`server/src/auth/sessions/session.service.ts`、`session.controller.ts`、`jwt-auth.guard.ts`、`current-user.decorator.ts`、`auth-principal.ts`、`server/src/auth/password/password-reset.service.ts`
- 测试：`server/src/auth/sessions/session.service.spec.ts`、`server/src/auth/password/password-reset.service.spec.ts`
- 修改：`server/src/main.ts`、`server/src/app.module.ts`

- [x] 编写失败测试，覆盖短期访问 JWT、刷新令牌哈希存储、单次轮换、检测重用后撤销令牌族、登出、全部登出、重置令牌过期/单次兑换及重置密码触发会话撤销。
- [x] 运行两个聚焦测试套件，确认因实现缺失而失败。
- [x] 实现名为 `super_admin_refresh` 的刷新 Cookie，设置 `HttpOnly`、`SameSite=Lax`、路径 `/api/auth`，生产环境设置 `Secure`；刷新令牌使用 SHA-256 哈希，访问 JWT 进行签名，Argon2id 仅用于密码。
- [x] 添加 `cookie-parser`、Controller 端点、通用找回响应及可信 `AuthPrincipal { userId, role, sessionId, kind: 'web' }`；重新运行测试，预期 `PASS`。
- [x] 提交：`git commit -m "feat: add rotating web sessions"`。

### 任务 3：RBAC、末位管理员保护与所有者隔离 Repository

**文件：**
- 新建：`server/src/auth/rbac/roles.decorator.ts`、`roles.guard.ts`、`server/src/common/ownership/owned-resource.service.ts`、`server/src/admin/users/admin-users.service.ts`
- 测试：`server/src/auth/rbac/roles.guard.spec.ts`、`server/src/common/ownership/owned-resource.service.spec.ts`、`server/test/auth-ownership.e2e-spec.ts`
- 修改：`server/src/core/jobs.controller.ts`、`server/src/core/tools.controller.ts`、`server/src/tools/knowledge-capture/knowledge-capture.controller.ts`

- [ ] 编写失败端到端用例，覆盖未认证请求返回 `401`、USER 访问 `/api/admin/*` 返回 `403`、跨用户来源/任务 ID 不泄露内容、ADMIN 以所有者身份使用学习路由，以及拒绝降级或禁用最后一个启用的管理员。
- [ ] 运行聚焦单元/端到端测试，验证现有宽松守卫导致测试失败。
- [ ] 实现 `@Roles('ADMIN')`、带显式公开路由元数据的全局 Web 认证保护、原子化末位管理员计数/更新，以及始终将资源 ID 与主体 `userId` 组合的所有者选择条件。
- [ ] 将所有权隔离应用于任务和知识兼容端点；返回脱敏且按所有者隔离的列表，外部用户 ID 返回 `404`；重新运行并预期所有隔离测试通过。
- [ ] 提交：`git commit -m "feat: enforce roles and resource ownership"`。

### 任务 4：替换全局 API 令牌

**文件：**
- 替换：`server/src/core/auth/api-token.service.ts`、`api-token.guard.ts`、`api-token.controller.ts`
- 测试：`server/src/core/auth/api-token.service.spec.ts`、`server/test/extension-token.e2e-spec.ts`
- 修改：`server/src/core/auth/auth.module.ts`、`server/src/tools/knowledge-capture/knowledge-capture.controller.ts`

- [ ] 编写失败测试，覆盖原始令牌仅展示一次、仅持久化 SHA-256、标签/列表/最后使用时间/撤销元数据、强制 `capture:create`、已撤销令牌返回 `401`，以及扩展令牌无法用于学习/管理端点。
- [ ] 运行聚焦测试，确认旧有自动生成/可选 Header 行为导致测试失败。
- [ ] 使用 32 个随机字节创建令牌，持久化 `tokenHash`、前缀、标签、作用域、userId、lastUsedAt、revokedAt；守卫生成 `AuthPrincipal { kind: 'api-token' }` 并检查路由作用域。
- [ ] 删除启动时令牌创建及覆盖式刷新端点；采集必须具备该作用域，并从主体分配 Job/来源所有权；重新运行，预期 `PASS`。
- [ ] 提交：`git commit -m "feat: add scoped user extension tokens"`。

### 任务 5：更新设置与 Chrome 扩展授权

**文件：**
- 新建：`client/src/api/api-tokens.ts`、`client/src/components/settings/ExtensionTokensPanel.vue`
- 修改：`client/src/views/settings/SettingsPage.vue`、`extension/popup-script.js`、`extension/service-worker.js`、`extension/popup.html`
- 测试：`client/src/components/settings/ExtensionTokensPanel.spec.ts`、`extension/integration.test.js`、`extension/service-worker-snapshot.test.js`

- [ ] 编写失败的客户端/扩展测试，覆盖创建标签、单次交付、仅含元数据的列表、撤销状态、重新授权，以及已撤销令牌的 `401` 提示不得清除无关扩展设置。
- [ ] 运行 Vitest 和 Node 扩展测试，确认旧 `/api/auth/token` 流程下测试失败。
- [ ] 实现设置面板、创建/选择/撤销 API、一次性 `chrome.runtime.sendMessage({ action: 'setConfig' })`，以及扩展收到 `401` 后返回设置页的指引。
- [ ] 断言单次交接后，渲染 DOM、扩展存储、控制台输出和请求固定样例均不包含令牌；重新运行测试，预期 `PASS`。
- [ ] 提交：`git commit -m "feat: authorize extension with user tokens"`。

### 任务 6：闭合认证安全场景

**文件：**
- 新建：`server/test/auth-security.e2e-spec.ts`
- 修改：`server/src/main.ts`、`server/src/auth/**`

- [ ] 新增端到端测试，覆盖刷新令牌重用、验证/重置接口防枚举、已禁用用户、过期令牌、角色变更触发会话撤销、在请求体/来源/模型数据中伪造身份，以及日志/审计/任务中不存在秘密。
- [ ] 运行聚焦端到端测试，记录每个失败场景。
- [ ] 仅补充这些测试识别出的守卫、事务、响应塑形或脱敏缺口。
- [ ] 运行全部服务端和扩展测试及构建；预期零失败。
- [ ] 提交：`git commit -m "test: close identity and token boundaries"`。
