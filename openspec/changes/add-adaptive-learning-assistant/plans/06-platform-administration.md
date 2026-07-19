# Platform Administration Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provide administrators with safe platform-wide operations while preventing default access to user learning content and secrets.

**Architecture:** All `/api/admin/*` routes use server-side ADMIN authorization and return dedicated allowlist DTOs. High-risk mutations require a reason, recheck invariants inside one transaction, revoke affected sessions where needed, and append an immutable audit event for both success and failure.

**Tech Stack:** NestJS, Prisma/PostgreSQL, BullMQ/Redis, ModelGateway, object storage, mail transport, Jest/Supertest.

---

### Task 1: Immutable audit wrapper

**Files:**
- Create: `server/src/admin/audit/audit.service.ts`, `audited-operation.service.ts`, `audit.controller.ts`, `audit.dto.ts`
- Test: `server/src/admin/audit/audited-operation.service.spec.ts`

- [ ] Write failing tests for actor/target/action/reason/before/after/result/correlation/timestamp, rejected operation recording, metadata redaction, filters, and sanitized CSV export.
- [ ] Run focused suite and confirm missing implementation.
- [ ] Implement append-only audit writes and `executeAudited()` that records success or sanitized failure without swallowing the original error.
- [ ] Rerun tests and verify secrets and protected content keys are removed recursively.
- [ ] Commit with `git commit -m "feat: add immutable administration audit"`.

### Task 2: Administrative user lifecycle

**Files:**
- Create: `server/src/admin/users/admin-users.controller.ts`, `admin-user.dto.ts`
- Modify: `server/src/admin/users/admin-users.service.ts`
- Test: `server/test/admin-users.e2e-spec.ts`

- [ ] Write failing e2e tests for search/filter/detail allowlist, role/status change with reason, session revoke, quota override, last-admin rejection, USER denial, and absence of source/answer/note/Graph fields.
- [ ] Run focused e2e and verify failures.
- [ ] Implement paginated metadata-only DTOs and audited transactions that protect the last admin and revoke target sessions after role/status changes.
- [ ] Rerun tests and expect `PASS` for success and rejected-attempt audit cases.
- [ ] Commit with `git commit -m "feat: administer platform users"`.

### Task 3: Tool registry and learning module configuration

**Files:**
- Modify: `server/src/core/tool-manifest.interface.ts`, `tool-registry.service.ts`, `tools.controller.ts`
- Create: `server/src/admin/tools/admin-tools.controller.ts`, `tool-config.service.ts`
- Test: `server/src/admin/tools/tool-config.service.spec.ts`, `server/test/admin-tools.e2e-spec.ts`

- [ ] Write failing tests for manifest metadata, enabled/version/processor state, disable reason/shutdown policy, invalid config field errors, unavailable model profile, immutable config versions, and route rejection when disabled.
- [ ] Run suites and confirm failures.
- [ ] Extend ToolManifest with config schema/version/shutdown/retry metadata; implement audited publish/enable/disable and learning-assistant config fields for model profile, Prompt, file limit, and strategy switches.
- [ ] Rerun tests and verify there is no separate learning-assistant admin product or user-facing diagnostic leakage.
- [ ] Commit with `git commit -m "feat: administer tool configurations"`.

### Task 4: Model service and quota administration

**Files:**
- Create: `server/src/admin/models/admin-models.controller.ts`, `server/src/admin/quotas/admin-quotas.controller.ts`
- Test: `server/test/admin-models-quotas.e2e-spec.ts`

- [ ] Write failing tests for masked secrets, bounded non-domain connection test, timeout/sanitized result, immutable profile/Prompt publish, fallback order, default quotas, overrides, reason requirement, and pre-call rejection.
- [ ] Run focused e2e and verify failures.
- [ ] Expose the existing model config/quota services through allowlist DTOs and `executeAudited`; connection test uses a fixed benign message, strict timeout, and no domain source or prompt.
- [ ] Rerun tests; verify response/audit/log fixtures cannot reconstruct secrets.
- [ ] Commit with `git commit -m "feat: administer models and quotas"`.

### Task 5: Cross-tool jobs and safe retry

**Files:**
- Create: `server/src/admin/jobs/admin-jobs.controller.ts`, `admin-job.dto.ts`
- Modify: `server/src/core/bullmq.service.ts`, `processor.interface.ts`, `jobs.controller.ts`
- Test: `server/test/admin-jobs.e2e-spec.ts`, `server/src/core/bullmq.service.spec.ts`

- [ ] Write failing tests for paginated filters, sanitized detail, failed/idempotent eligibility, nonfailed/unrecoverable/nonidempotent rejection, reason/audit, re-enqueue of the same domain Job, and duplicate lifecycle events.
- [ ] Run tests and confirm legacy direct execution/retry behavior fails.
- [ ] Add declared retry policy to processors and make BullMQ the only retry executor; atomically reset/re-enqueue the existing Job and update lifecycle by `bullmqJobId` idempotently.
- [ ] Rerun tests and expect no duplicate Job or completed domain effect.
- [ ] Commit with `git commit -m "fix: enforce safe queued job retry"`.

### Task 6: Platform health

**Files:**
- Create: `server/src/admin/health/platform-health.service.ts`, `platform-health.controller.ts`
- Test: `server/src/admin/health/platform-health.service.spec.ts`

- [ ] Write failing tests for PostgreSQL, Redis, BullMQ worker heartbeat, object storage, mail, and configured model providers with timeout and sanitized categories.
- [ ] Run focused suite and verify failures.
- [ ] Implement bounded read-only probes and aggregate `healthy|degraded|unhealthy` results without URLs, credentials, user content, or model response text.
- [ ] Rerun tests and expect one failing dependency not to block other probe results.
- [ ] Commit with `git commit -m "feat: expose sanitized platform health"`.

### Task 7: Administration privacy contract

**Files:**
- Create: `server/test/admin-privacy.e2e-spec.ts`, `server/src/admin/privacy/admin-response.interceptor.ts`
- Modify: `server/src/admin/admin.module.ts`

- [ ] Seed sentinel strings in source bodies, answers, notes, prompts, provider secrets, Graph State, and Job raw metadata; assert every admin list/detail/export/health/audit response excludes them and unsupported content access returns `403` or an omitted field.
- [ ] Run the suite and record leaks.
- [ ] Replace implicit Prisma object spreading with explicit DTO projections and add a defense-in-depth forbidden-key response interceptor for admin routes.
- [ ] Rerun all admin/auth/jobs suites and expect zero sentinel matches.
- [ ] Commit with `git commit -m "test: enforce administration content privacy"`.

