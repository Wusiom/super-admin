# Model Gateway and LangGraph Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provide a secure, observable model boundary and a durable tutoring graph that can pause and resume without becoming a second business database.

**Architecture:** All model calls use one `ModelGateway` with immutable profiles/prompts, Zod output validation, quota preflight, bounded retry, and fallback. LangGraph uses `PostgresSaver`, `thread_id = tutoringSession.id`, JSON-serializable cursor state, and `interrupt()`/`Command({ resume })`; domain services alone persist turns, evidence, and mastery.

**Tech Stack:** LangChain JS, LangGraph JS, `@langchain/langgraph-checkpoint-postgres`, Zod, Node crypto AES-256-GCM, Prisma, Jest.

---

### Task 1: Encrypted providers and immutable configurations

**Files:**
- Create: `server/src/ai/secrets/secret-box.service.ts`, `server/src/ai/config/model-config.service.ts`, `server/src/ai/config/model-config.dto.ts`
- Test: `server/src/ai/secrets/secret-box.service.spec.ts`, `server/src/ai/config/model-config.service.spec.ts`

- [ ] Write failing tests for AES-256-GCM round trip, nonce uniqueness, tamper rejection, masked provider DTOs, immutable published profiles/prompts, and existing-session version pinning.
- [ ] Run focused suites and expect missing symbols.
- [ ] Implement versioned ciphertext envelopes using the validated 32-byte encryption key; implement draft/validate/publish records and DTOs exposing only `secretConfigured: boolean`.
- [ ] Rerun tests; search serialized DTOs/audit fixtures for plaintext keys and expect no matches.
- [ ] Commit with `git commit -m "feat: secure model configurations"`.

### Task 2: Quota preflight and model-call ledger

**Files:**
- Create: `server/src/ai/quota/quota.service.ts`, `server/src/ai/usage/model-call.service.ts`
- Test: `server/src/ai/quota/quota.service.spec.ts`, `server/src/ai/usage/model-call.service.spec.ts`

- [ ] Write failing tests for platform defaults, per-user overrides, monthly token/storage limits, concurrent-session limit, pre-provider rejection, and sanitized cost/latency/error records.
- [ ] Run focused suites and verify failures.
- [ ] Implement effective-quota resolution and an atomic reservation/finalization ledger; store purpose, model/profile/prompt versions, tokens, latency, validation status, fallback, and correlation only.
- [ ] Rerun tests and expect an over-quota call to leave the tutoring session resumable and invoke no provider mock.
- [ ] Commit with `git commit -m "feat: enforce model quotas"`.

### Task 3: ModelGateway structured output

**Files:**
- Create: `server/src/ai/gateway/model-gateway.ts`, `openai-compatible.factory.ts`, `structured-call.ts`, `model-gateway.errors.ts`
- Test: `server/src/ai/gateway/model-gateway.spec.ts`

- [ ] Write failing tests for profile/prompt resolution, timeout, retriable provider failure, one schema-repair attempt, fallback order, Zod validation, token accounting, and sanitized terminal errors.
- [ ] Run the focused suite and expect missing gateway failures.
- [ ] Implement `invokeStructured<T>(request, schema)` with `ChatOpenAI.withStructuredOutput`, `AbortSignal.timeout`, bounded retry/fallback, quota reservation, and ModelCall finalization.
- [ ] Rerun tests; expect invalid final output to throw `MODEL_OUTPUT_INVALID` and perform no domain write.
- [ ] Commit with `git commit -m "feat: add structured model gateway"`.

### Task 4: Tutor action and grounded evaluation contracts

**Files:**
- Create: `server/src/tools/learning-assistant/tutoring/tutor-action.schema.ts`, `evaluation-result.schema.ts`, `grounding-validator.service.ts`
- Test: corresponding `.spec.ts` files

- [ ] Write failing tests for the exact action enum (`EXPLAIN`, `ASK_RECALL`, `ASK_SELF_EXPLAIN`, `ASK_TRANSFER`, `GIVE_HINT`, `GIVE_EXAMPLE`, `COMPARE`, `CHALLENGE`, `SUMMARIZE`, `MAKE_NOTE`), unknown action rejection, rubric fields, disagreement preservation, and current-version anchor validation.
- [ ] Run focused suites and confirm missing schema failures.
- [ ] Implement discriminated Zod action payloads, EvaluationResult with verdict/reasoning/citations/disagreements/evidence kind, and anchor validation against trusted project version.
- [ ] Rerun suites; expect foreign/missing anchors and unsupported action strings to fail before persistence.
- [ ] Commit with `git commit -m "feat: constrain tutoring model output"`.

### Task 5: PostgreSQL checkpointer lifecycle

**Files:**
- Create: `server/src/ai/graph/langgraph-checkpointer.service.ts`, `langgraph.module.ts`
- Test: `server/src/ai/graph/langgraph-checkpointer.service.spec.ts`, `server/test/langgraph-checkpoint.e2e-spec.ts`

- [ ] Write failing tests for one-time `PostgresSaver.setup()`, thread IDs derived from owned domain sessions, checkpoint resume after service recreation, source deletion cleanup, and no Graph State in admin/domain DTOs.
- [ ] Run focused tests and confirm failures.
- [ ] Implement application-lifecycle initialization of `PostgresSaver` and a narrow service exposing compile config, state deletion, and health only; never expose arbitrary checkpoint reads through controllers.
- [ ] Rerun with disposable PostgreSQL and expect resume after a new Nest testing module is created.
- [ ] Commit with `git commit -m "feat: persist langgraph checkpoints"`.

### Task 6: Initial interruptible tutoring graph

**Files:**
- Create: `server/src/tools/learning-assistant/tutoring/tutoring.state.ts`, `tutoring.graph.ts`, nodes under `tutoring/nodes/`
- Test: `server/src/tools/learning-assistant/tutoring/tutoring.graph.spec.ts`

- [ ] Write failing graph tests for `observe -> chooseAction -> render -> interrupt`, resume via `Command({ resume })`, `evaluate -> persistEvidence -> chooseNext`, JSON-serializable state, and deterministic replay of code before interrupt.
- [ ] Run focused suite and confirm missing graph failures.
- [ ] Define graph state containing only IDs, node cursor, pending interaction, schema-valid transient output references, and idempotency key; inject domain/model ports into nodes.
- [ ] Implement nodes with side effects after interrupts guarded by domain idempotency; compile with checkpointer and use `{ configurable: { thread_id: session.id } }`; rerun and expect `PASS`.
- [ ] Commit with `git commit -m "feat: add durable tutoring graph"`.

### Task 7: Prove graph/domain separation

**Files:**
- Create: `server/test/langgraph-domain-boundary.e2e-spec.ts`

- [ ] Add tests that forge mastery/role/userId in graph input, replay a checkpoint, duplicate an interrupt resume, corrupt a transient action, and restart between interrupt and resume.
- [ ] Run and record any boundary failures.
- [ ] Tighten graph input construction, trusted principal injection, schema parsing, and domain idempotency until graph-controlled values cannot change authorization or mastery directly.
- [ ] Run all AI, auth, source, and schema tests plus build; expect zero failures.
- [ ] Commit with `git commit -m "test: enforce graph domain boundary"`.

