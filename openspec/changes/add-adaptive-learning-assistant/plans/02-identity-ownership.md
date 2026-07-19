# Identity, Ownership, and Extension Tokens Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace permissive global-token access with complete email identity, revocable Web sessions, server-enforced roles, owner isolation, and scoped extension tokens.

**Architecture:** A trusted request principal is created only by Web JWT or hashed API-token guards. Controllers pass that principal to owner-scoped services; repository methods include `userId` in every selector. Refresh rotation uses token families and reuse detection, while extension tokens are independent credentials limited to `capture:create`.

**Tech Stack:** NestJS, Argon2id, `@nestjs/jwt`, Prisma/PostgreSQL, Nodemailer, HttpOnly cookies, Jest/Supertest.

---

### Task 1: Mail abstraction and account registration

**Files:**
- Create: `server/src/auth/mail/mail.service.ts`, `mail.module.ts`, `diagnostic-mail.transport.ts`, `smtp-mail.transport.ts`, `server/src/auth/accounts/accounts.service.ts`, `accounts.controller.ts`, `dto/register.dto.ts`
- Test: `server/src/auth/accounts/accounts.service.spec.ts`
- Modify: `server/src/app.module.ts`

- [ ] Write failing tests for normalized unique email, Argon2id hash storage, unverified login denial, time-limited hashed verification tokens, resend throttling, and identical recovery responses.
- [ ] Run `pnpm --filter server test -- accounts.service.spec.ts --runInBand`; expect missing providers and methods.
- [ ] Implement `MailService.sendVerification`/`sendPasswordReset`, diagnostic and SMTP transports, account registration, verification redemption, and resend rate boundary with no raw token persisted.
- [ ] Rerun the focused suite; expect all cases to pass and snapshots/log assertions to contain neither password nor raw token.
- [ ] Commit with `git commit -m "feat: add verified email accounts"`.

### Task 2: Rotating Web sessions and password reset

**Files:**
- Create: `server/src/auth/sessions/session.service.ts`, `session.controller.ts`, `jwt-auth.guard.ts`, `current-user.decorator.ts`, `auth-principal.ts`, `server/src/auth/password/password-reset.service.ts`
- Test: `server/src/auth/sessions/session.service.spec.ts`, `server/src/auth/password/password-reset.service.spec.ts`
- Modify: `server/src/main.ts`, `server/src/app.module.ts`

- [ ] Write failing tests for short access JWTs, hashed refresh storage, single-use rotation, family revocation on reuse, logout, logout-all, reset expiry/one-time redemption, and reset-triggered session revocation.
- [ ] Run both focused suites and confirm missing implementation failures.
- [ ] Implement refresh cookies named `super_admin_refresh` with `HttpOnly`, `SameSite=Lax`, path `/api/auth`, production `Secure`; hash refresh tokens with SHA-256, sign access JWTs, and use Argon2id only for passwords.
- [ ] Add `cookie-parser`, controller endpoints, generic recovery responses, and trusted `AuthPrincipal { userId, role, sessionId, kind: 'web' }`; rerun suites and expect `PASS`.
- [ ] Commit with `git commit -m "feat: add rotating web sessions"`.

### Task 3: RBAC, last-admin protection, and owner-scoped repositories

**Files:**
- Create: `server/src/auth/rbac/roles.decorator.ts`, `roles.guard.ts`, `server/src/common/ownership/owned-resource.service.ts`, `server/src/admin/users/admin-users.service.ts`
- Test: `server/src/auth/rbac/roles.guard.spec.ts`, `server/src/common/ownership/owned-resource.service.spec.ts`, `server/test/auth-ownership.e2e-spec.ts`
- Modify: `server/src/core/jobs.controller.ts`, `server/src/core/tools.controller.ts`, `server/src/tools/knowledge-capture/knowledge-capture.controller.ts`

- [ ] Write failing e2e cases for unauthenticated `401`, USER `/api/admin/*` `403`, cross-user source/job IDs revealing no content, ADMIN using learning routes as owner, and rejection of demoting/disabling the last enabled admin.
- [ ] Run the focused unit/e2e tests and verify the existing permissive guard causes failures.
- [ ] Implement `@Roles('ADMIN')`, global Web auth protection with explicit public-route metadata, atomic last-admin count/update, and owned selectors that always combine resource ID with principal `userId`.
- [ ] Apply ownership to jobs and knowledge compatibility endpoints; return sanitized owner-scoped lists and `404` for foreign IDs; rerun and expect all isolation tests to pass.
- [ ] Commit with `git commit -m "feat: enforce roles and resource ownership"`.

### Task 4: Replace the global API token

**Files:**
- Replace: `server/src/core/auth/api-token.service.ts`, `api-token.guard.ts`, `api-token.controller.ts`
- Test: `server/src/core/auth/api-token.service.spec.ts`, `server/test/extension-token.e2e-spec.ts`
- Modify: `server/src/core/auth/auth.module.ts`, `server/src/tools/knowledge-capture/knowledge-capture.controller.ts`

- [ ] Write failing tests for one-time raw token display, SHA-256-only persistence, label/list/last-used/revoke metadata, mandatory `capture:create`, revoked-token `401`, and inability to use an extension token on learning/admin endpoints.
- [ ] Run focused tests and confirm the legacy auto-generation/optional-header behavior fails them.
- [ ] Implement token creation using 32 random bytes, persist `tokenHash`, prefix, label, scopes, userId, lastUsedAt, revokedAt; guard produces `AuthPrincipal { kind: 'api-token' }` and checks route scope.
- [ ] Delete startup token creation and overwrite refresh endpoint; make capture require the scope and assign Job/source ownership from the principal; rerun and expect `PASS`.
- [ ] Commit with `git commit -m "feat: add scoped user extension tokens"`.

### Task 5: Update settings and Chrome extension authorization

**Files:**
- Create: `client/src/api/api-tokens.ts`, `client/src/components/settings/ExtensionTokensPanel.vue`
- Modify: `client/src/views/settings/SettingsPage.vue`, `extension/popup-script.js`, `extension/service-worker.js`, `extension/popup.html`
- Test: `client/src/components/settings/ExtensionTokensPanel.spec.ts`, `extension/integration.test.js`, `extension/service-worker-snapshot.test.js`

- [ ] Write failing client/extension tests for label creation, one-time delivery, metadata-only list, revoke state, reauthorization, and a revoked-token `401` message that never clears unrelated extension settings.
- [ ] Run Vitest and Node extension suites and confirm failures against the legacy `/api/auth/token` flow.
- [ ] Implement the settings panel, create/select/revoke APIs, one-time `chrome.runtime.sendMessage({ action: 'setConfig' })`, and extension `401` guidance to return to settings.
- [ ] Assert rendered DOM, extension storage, console output, and request fixtures never contain a token after the one-time handoff; rerun suites and expect `PASS`.
- [ ] Commit with `git commit -m "feat: authorize extension with user tokens"`.

### Task 6: Close authentication security scenarios

**Files:**
- Create: `server/test/auth-security.e2e-spec.ts`
- Modify: `server/src/main.ts`, `server/src/auth/**`

- [ ] Add e2e tests for refresh reuse, verification/reset enumeration resistance, disabled user, expired tokens, role change session revocation, forged identity in body/source/model data, and secret absence from logs/audit/jobs.
- [ ] Run the focused e2e suite and record each failing scenario.
- [ ] Apply only the missing guard, transaction, response-shaping, or redaction changes identified by those tests.
- [ ] Run all server and extension tests plus builds; expect zero failures.
- [ ] Commit with `git commit -m "test: close identity and token boundaries"`.

