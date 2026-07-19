# Frontend Workspaces Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the approved authentication, learning assistant, settings, notes, learner profile, and platform administration interfaces with correct roles and recovery states.

**Architecture:** Feature folders own typed API clients, Pinia stores, routes, views, and components. Access JWT is memory-only and Axios performs a single-flight cookie refresh. The learning session consumes authenticated fetch/SSE and renders one primary task; admin components accept sanitized DTOs that cannot represent protected content.

**Tech Stack:** Vue 3, TypeScript, Pinia, Vue Router, Element Plus, Tailwind, Axios/fetch, Vitest, Vue Test Utils, happy-dom.

---

### Task 1: Install the client test harness and typed authentication

**Files:**
- Modify: `client/package.json`, `client/vite.config.ts`, `client/src/api/index.ts`, `client/src/api/auth.ts`, `client/src/stores/auth.ts`
- Create: `client/src/test/setup.ts`, `client/src/stores/auth.spec.ts`, `client/src/api/index.spec.ts`

- [ ] Configure `test`, happy-dom, setup, Vue Test Utils, and Pinia testing; add failing tests for memory-only access token, cookie refresh, concurrent `401` single-flight, refresh failure logout, and no localStorage token.
- [ ] Run `pnpm --filter client test -- --run`; expect failures against current localStorage behavior.
- [ ] Implement credentials-enabled Axios, request bearer injection, one queued refresh promise, retry-once marker, and typed `SessionUser { id, email, role, status }` Pinia state.
- [ ] Rerun tests and assert localStorage contains no access/refresh credential.
- [ ] Commit with `git commit -m "feat: add safe frontend sessions"`.

### Task 2: Authentication views and route guards

**Files:**
- Create: `client/src/views/auth/RegisterPage.vue`, `VerifyEmailPage.vue`, `ForgotPasswordPage.vue`, `ResetPasswordPage.vue`, `client/src/router/guards.ts`
- Modify: `client/src/views/login/index.vue`, `client/src/router/index.ts`
- Test: `client/src/views/auth/auth-flow.spec.ts`, `client/src/router/guards.spec.ts`

- [ ] Write failing tests for registration/verification/login/recovery/reset success and errors, unverified state, guest redirect, USER admin-route denial, ADMIN access, and return-to route.
- [ ] Run focused Vitest and verify failures.
- [ ] Implement the forms with field-level server errors and generic recovery confirmation; add public/auth/admin route metadata and async session hydration guard.
- [ ] Rerun tests and expect direct `/admin/*` USER navigation to end at a forbidden/not-found view without rendering admin data.
- [ ] Commit with `git commit -m "feat: add account flows and route guards"`.

### Task 3: Navigation, settings, and extension tokens

**Files:**
- Modify: `client/src/layouts/DefaultLayout.vue`, `client/src/stores/tools.ts`, `client/src/views/settings/SettingsPage.vue`
- Create: `client/src/views/learning/manifest.ts`, `client/src/components/settings/AccountPanel.vue`, `SessionPanel.vue`, `ExtensionTokensPanel.vue`
- Test: `client/src/layouts/DefaultLayout.spec.ts`, `client/src/views/settings/SettingsPage.spec.ts`

- [ ] Write failing tests for enabled manifest menu, “学习助手” at `/learning`, ADMIN-only static “后台管理” at `/admin`, no top-level “学习助手管理”, disabled/empty tools, session revocation, and extension-token lifecycle.
- [ ] Run focused tests and verify failures.
- [ ] Register the learning ToolManifest, render role-aware static entries, and split settings into account/session/extension panels with token one-time handoff and revoke feedback.
- [ ] Rerun tests and expect USER/ADMIN menu matrices to pass.
- [ ] Commit with `git commit -m "feat: add role-aware navigation and settings"`.

### Task 4: Learning home, import, source detail, and contract

**Files:**
- Create: `client/src/features/learning/api.ts`, `store.ts`, `routes.ts`, views `LearningHomePage.vue`, `SourceDetailPage.vue`, `LearningContractPage.vue`, components `ImportSourceDialog.vue`, `ParsingProgress.vue`, `ContentMapEditor.vue`
- Test: colocated `.spec.ts` files
- Modify: `client/src/router/index.ts`

- [ ] Write failing component tests for empty/list states, captured-source choice, EPUB/PDF admission/progress/errors, scanned PDF recovery, quality warnings, split/merge/reorder/skip/confirm, and contract goal/time/prior knowledge/unit scope.
- [ ] Run focused Vitest and verify failures.
- [ ] Implement typed APIs/store/routes and components matching prototype screens 2–4 and import states; preserve unsaved edits and disable start until valid confirmation.
- [ ] Rerun tests and expect loading, empty, disabled, error, and success states to pass at desktop and narrow container widths.
- [ ] Commit with `git commit -m "feat: build learning source setup"`.

### Task 5: Focus session, evidence drawers, recovery, and report

**Files:**
- Create: `client/src/views/learning/LearningSessionPage.vue`, `LearningReportPage.vue`, `client/src/features/learning/useTutoringStream.ts`, components `PrimaryTaskCard.vue`, `FeedbackCard.vue`, `SourceEvidenceDrawer.vue`, `ConceptMapDrawer.vue`, `UnitProgressDrawer.vue`, `NoteDraftDrawer.vue`
- Test: colocated `.spec.ts` files

- [ ] Write failing tests for one primary task, idempotency key reuse, SSE progress/content/committed/error, disconnect resume, hints, feedback/disagreement, end confirmation, drawers, and completion report sections.
- [ ] Run focused tests and verify failures.
- [ ] Implement authenticated fetch/SSE parsing, reconnect with last event ID, disabled duplicate submit, public event rendering, and prototype screens 5–6 plus feedback/recovery states.
- [ ] Rerun tests and assert no raw Graph State or hidden Prompt property can be rendered.
- [ ] Commit with `git commit -m "feat: build focused tutoring session"`.

### Task 6: Atomic notes and learner profile

**Files:**
- Create: `client/src/views/learning/NotesPage.vue`, `NoteDetailPage.vue`, `LearnerProfilePage.vue`, components `NoteConfirmationDialog.vue`, `LinkSuggestions.vue`, `ProfileStrategyCard.vue`
- Test: colocated `.spec.ts` files

- [ ] Write failing tests for note draft/edit/confirm/reject, three-link maximum, per-link confirmation, search/filter/detail/delete/export, profile evidence/confidence/effect, insufficient evidence, disable/delete/reset controls.
- [ ] Run focused tests and verify failures.
- [ ] Implement prototype screens 7–8 and all destructive confirmations; render only API allowlist types and confirmed export actions.
- [ ] Rerun tests and expect foreign/draft/rejected content fixtures to be absent.
- [ ] Commit with `git commit -m "feat: add notes and learner profile UI"`.

### Task 7: Administration workspace shell, users, and tools

**Files:**
- Create: `client/src/features/admin/api.ts`, `routes.ts`, `AdminLayout.vue`, views `AdminHomePage.vue`, `AdminUsersPage.vue`, `AdminToolsPage.vue`, `LearningAssistantConfigPage.vue`
- Test: colocated `.spec.ts` files
- Modify: `client/src/router/index.ts`

- [ ] Write failing tests for ADMIN-only shell, privacy notice, user filters/detail allowlist, reason-required high-risk actions, last-admin conflict, tool enable/disable, config field errors, and learning config nested at `/admin/tools/learning-assistant`.
- [ ] Run focused tests and verify failures.
- [ ] Implement prototype screens 9–11 with dedicated admin DTO types that contain no content-body fields.
- [ ] Rerun tests and verify no top-level learning-assistant administration menu appears.
- [ ] Commit with `git commit -m "feat: build admin users and tools UI"`.

### Task 8: Administration models, quotas, jobs, health, and audit

**Files:**
- Create: admin views `AdminModelsPage.vue`, `AdminQuotasPage.vue`, `AdminJobsPage.vue`, `AdminHealthPage.vue`, `AdminAuditPage.vue` and supporting components
- Test: colocated `.spec.ts` files

- [ ] Write failing tests for secret masking, connection test timeout/result, immutable publish, quota defaults/override reason, sanitized job filters/retry boundary, dependency health, audit filters/export, and protected-field sentinels.
- [ ] Run focused Vitest and verify failures.
- [ ] Implement prototype screens 12–15 with reason dialogs, status semantics, retry eligibility, masked indicators, and sanitized export controls.
- [ ] Rerun tests and expect no sentinel source/answer/note/prompt/secret/Graph data in DOM or snapshots.
- [ ] Commit with `git commit -m "feat: complete administration workspace"`.

### Task 9: Responsive visual and full client gate

**Files:**
- Modify: `client/src/styles/index.css`, `client/src/styles/theme.css`, affected learning/admin components
- Create: `client/src/test/accessibility.spec.ts`

- [ ] Add assertions for keyboard focus, dialog labels, status text beyond color, 320 px overflow, loading skeletons, empty/error recovery, reduced motion, and prototype design tokens.
- [ ] Run tests and inspect failures.
- [ ] Apply focused style/accessibility corrections without changing approved information architecture.
- [ ] Run full client tests/build and manually compare every approved prototype screen/state; expect zero automated failures and record visual deviations.
- [ ] Commit with `git commit -m "test: polish learning and admin workspaces"`.

