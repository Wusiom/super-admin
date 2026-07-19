# Security, Migration, and Acceptance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove the complete system is secure, observable, calibrated, migratable, recoverable, and aligned with its design and OpenSpec contracts.

**Architecture:** Cross-cutting tests exercise the deployed boundaries rather than internal mocks wherever practical. A correlation context links requests, jobs, model calls, graph nodes, turns, and audits without logging protected data. Release is blocked until migration rehearsal, evaluation calibration, browser acceptance, and rollback evidence are complete.

**Tech Stack:** NestJS interceptors, AsyncLocalStorage, throttling, Jest/Supertest, Vitest, Docker Compose, Prisma Migrate, browser QA, Markdown documentation.

---

### Task 1: Correlation and structured redacted logging

**Files:**
- Create: `server/src/observability/correlation.service.ts`, `correlation.interceptor.ts`, `redacting-logger.service.ts`
- Test: `server/src/observability/correlation.service.spec.ts`, `server/test/correlation.e2e-spec.ts`
- Modify: request, Job, ModelCall, tutoring turn, and AuditEvent creation paths

- [ ] Write failing tests that one correlation ID crosses HTTP request, BullMQ job, model call, graph node, domain turn, and audit event while secret/content sentinels never appear in logs.
- [ ] Run focused tests and verify failures.
- [ ] Implement AsyncLocalStorage correlation, explicit propagation through job data and graph config, structured allowlist logging, and inbound ID validation/generation.
- [ ] Rerun tests and expect complete correlation with zero sentinel matches.
- [ ] Commit with `git commit -m "feat: correlate learning operations"`.

### Task 2: Rate-limit all abuse-sensitive boundaries

**Files:**
- Create: `server/src/security/rate-limit/rate-limit.module.ts`, `rate-limit.policy.ts`
- Test: `server/test/rate-limits.e2e-spec.ts`
- Modify: auth, upload, token, tutoring, and admin connection-test controllers

- [ ] Write failing tests for registration, verification resend, reset, login, model calls, uploads, API-token creation, and provider tests using per-IP and/or per-user keys with `429` plus retry metadata.
- [ ] Run focused e2e and confirm failures.
- [ ] Configure named throttling policies and trusted keys; ensure a rejected request creates no mail, object, model, token, or admin mutation.
- [ ] Rerun tests and expect independent users not to consume each other's authenticated quotas.
- [ ] Commit with `git commit -m "feat: rate limit sensitive operations"`.

### Task 3: Prompt-injection and authorization adversarial suite

**Files:**
- Create: `server/test/security/prompt-injection.e2e-spec.ts`, `server/test/security/idor-matrix.e2e-spec.ts`, fixtures under `server/test/fixtures/security/`

- [ ] Add source strings instructing the model to change roles, call tools, reveal prompts, cite invalid anchors, auto-confirm notes, or lower the rubric; add a two-user matrix for every owned resource endpoint.
- [ ] Run the suites and record any successful attack.
- [ ] Tighten system/data separation, schemas, anchor checks, tool allowlists, owner selectors, and DTO projections only where tests expose a gap.
- [ ] Rerun suites and expect every injection to be treated as source data and every foreign ID to disclose no protected metadata.
- [ ] Commit with `git commit -m "test: block injection and cross-user access"`.

### Task 4: Human-labeled evaluation calibration

**Files:**
- Create: `server/test/fixtures/evaluation/answer-cases.json`, `citation-cases.json`, `server/scripts/run-evaluation-calibration.ts`, `docs/evaluation/calibration.md`
- Modify: `server/package.json`

- [ ] Author at least 30 answer cases across correct, partial, misconception, unsupported, recall-only, and transfer responses, each with human verdict and source anchors; author citation support labels.
- [ ] Add a deterministic runner that validates fixture schema, calls the evaluation boundary, computes agreement/confusion matrix and citation support, and exits nonzero below 85% agreement or 95% accepted-citation support.
- [ ] Run against the configured evaluation model/profile, inspect disagreements, and adjust rubric/Prompt version rather than hard-code fixture answers.
- [ ] Rerun until thresholds pass; save model/profile/Prompt versions, date, counts, metrics, and remaining disagreements.
- [ ] Commit with `git commit -m "test: calibrate learning evaluation"`.

### Task 5: Complete deletion and privacy lifecycle

**Files:**
- Create: `server/test/security/deletion.e2e-spec.ts`, `server/test/security/privacy-export.e2e-spec.ts`

- [ ] Seed a complete user graph: sessions/tokens, source objects/versions/anchors, jobs, graph checkpoints, turns/evidence/profile, notes/links, exports, model calls, and audits; write failing deletion assertions for every store.
- [ ] Run focused tests and record survivors.
- [ ] Implement staged user/source deletion with retryable object/checkpoint/export cleanup, token/session revocation, required audit retention/anonymization, and ownership-safe compensation.
- [ ] Rerun deletion and privacy exports; expect no recoverable user content and no impact on the control user.
- [ ] Commit with `git commit -m "feat: complete learning data deletion"`.

### Task 6: PostgreSQL migration and rollback rehearsal

**Files:**
- Modify: `docs/migrations/sqlite-to-postgresql.md`
- Create: `docs/release-evidence/learning-assistant-migration.md`

- [ ] Back up a representative SQLite fixture, record SHA-256, freeze writes, and run importer dry-run; capture counts and expected mappings.
- [ ] Apply PostgreSQL migrations and real import; compare every table count, KnowledgeItem/source content hash, Job association, Tool enabled state, and initial-admin ownership.
- [ ] Start the new stack, execute authenticated read/capture/source paths, then simulate rollback by stopping new writes and restoring the unchanged SQLite backup.
- [ ] Record exact commands, timestamps, outputs, accepted post-cutover data-loss boundary, and operator sign-off; do not claim rollback success without the restored old stack serving reads.
- [ ] Commit with `git commit -m "docs: record postgres migration rehearsal"`.

### Task 7: Full automated quality gate

**Files:**
- Create: `scripts/verify-learning-assistant.ps1`, `docs/release-evidence/learning-assistant-tests.md`

- [ ] Implement a fail-fast script running Prisma validate/generate/migrate status, server unit/e2e, extension Node tests, client Vitest, server/client builds, OpenSpec strict validation, and calibration thresholds.
- [ ] Run the script against disposable PostgreSQL/Redis/object-storage/mail dependencies and capture full versions and exit codes.
- [ ] Fix only root causes for failures; rerun the smallest failing command after each correction.
- [ ] Rerun the full script from a clean process and expect exit `0`; save the summarized evidence.
- [ ] Commit with `git commit -m "test: add learning assistant release gate"`.

### Task 8: Browser acceptance against approved screens

**Files:**
- Create: `docs/release-evidence/learning-assistant-browser-acceptance.md`

- [ ] Execute registration, verification, login, capture ownership, EPUB import, text-PDF import, scanned-PDF failure, unit editing/confirmation, contract, session resume, transfer mastery, note confirmation/export, profile controls, USER menu, ADMIN menu, admin isolation, and account deletion.
- [ ] Compare all 15 approved prototype screens plus import/feedback/recovery states at desktop and narrow widths; capture route, role, viewport, result, and screenshot reference.
- [ ] Inspect browser console/network for errors, duplicate submissions, unauthenticated streams, protected fields, or raw secrets; fix any root cause and repeat the affected flow.
- [ ] Mark acceptance complete only when every scenario passes and no protected learning content appears in admin responses or DOM.
- [ ] Commit with `git commit -m "test: complete learning assistant acceptance"`.

### Task 9: Documentation and release consistency

**Files:**
- Modify: `README.md`, `AGENTS.md`, `docs/design.md`, extension docs, deployment docs
- Create: `docs/architecture/learning-assistant.md`, `docs/admin/learning-assistant.md`, `docs/privacy/learning-data.md`, `docs/operations/learning-assistant-runbook.md`

- [ ] Document architecture boundaries, environment variables, deployment/migration/rollback, extension reauthorization, user/admin workflows, privacy exclusions, quotas, health, audit, recovery, and known non-goals with exact current commands/routes.
- [ ] Run `$markers = @('T'+'ODO', 'T'+'BD', 'implement'+' later'); rg -n "SQLite|global API Token|学习助手管理|$($markers -join '|')" README.md docs extension AGENTS.md` and correct stale claims or forbidden placeholders.
- [ ] Run OpenSpec strict validation and the full release gate; expect both to pass.
- [ ] Review `docs/design.md`, proposal/design/specs/tasks, plan, and UI copy for matching menu names, roles, source types, 50 MB limit, mastery gate, and privacy boundary.
- [ ] Commit with `git commit -m "docs: finalize learning assistant release"`.
