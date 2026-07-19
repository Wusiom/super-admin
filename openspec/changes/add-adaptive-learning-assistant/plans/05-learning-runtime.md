# Adaptive Tutoring, Profile, and Notes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the evidence-backed learning loop, completion report, transparent learner strategies, and user-confirmed atomic notes.

**Architecture:** Each submitted answer is a domain turn with an idempotency key, then independently evaluated against immutable source anchors. Only validated evaluation writes evidence; only transfer evidence crosses the mastery gate. Profile updates consume evaluated outcomes, and notes remain drafts until explicit user confirmation.

**Tech Stack:** NestJS, Prisma, LangGraph, ModelGateway, SSE over authenticated fetch, Zod, BullMQ for large exports, Jest/Supertest.

---

### Task 1: Session creation, resume, and turn idempotency

**Files:**
- Create: `server/src/tools/learning-assistant/tutoring/tutoring-session.service.ts`, `tutoring.controller.ts`, `turn-idempotency.service.ts`
- Test: `server/src/tools/learning-assistant/tutoring/tutoring-session.service.spec.ts`, `server/test/tutoring-session.e2e-spec.ts`

- [ ] Write failing tests for confirmed-contract start, foreign/unconfirmed conflict, one active-session quota, refresh/restart resume, duplicate submission returning the same turn, and duplicate interrupt resume producing no extra evidence.
- [ ] Run focused tests and confirm failures.
- [ ] Implement transactional session/turn creation, unique `(sessionId, idempotencyKey)`, graph thread correlation, current interrupt lookup, and end-session state.
- [ ] Rerun tests and expect stable IDs/results across duplicate requests and module recreation.
- [ ] Commit with `git commit -m "feat: add resumable tutoring sessions"`.

### Task 2: Teaching actions and authenticated SSE

**Files:**
- Create: `server/src/tools/learning-assistant/tutoring/tutoring-stream.controller.ts`, `tutoring-event.ts`, `tutoring-event.service.ts`
- Test: `server/test/tutoring-stream.e2e-spec.ts`

- [ ] Write failing SSE tests for authenticated connection, node progress, visible incremental text, one primary thinking task, recoverable error, final committed result, disconnect/reconnect cursor, and no hidden prompt/Graph State event.
- [ ] Run focused e2e and verify failures.
- [ ] Implement event types `progress`, `content`, `interaction`, `recoverable_error`, `committed`, `done`; persist only replay-safe public events and authorize the session owner before streaming.
- [ ] Rerun tests and expect reconnect from `Last-Event-ID` to replay without repeating the domain turn.
- [ ] Commit with `git commit -m "feat: stream tutoring progress"`.

### Task 3: Independent evaluation and mastery gate

**Files:**
- Create: `server/src/tools/learning-assistant/evaluation/evaluation.service.ts`, `mastery-policy.service.ts`, `evidence.repository.ts`
- Test: corresponding `.spec.ts` files and `server/test/mastery.e2e-spec.ts`

- [ ] Write failing cases for source-grounded evaluation, model/user disagreement, schema/anchor failure with no write, recall-only evidence not mastering, failed transfer not mastering, and valid transfer producing `TRANSFER_VALIDATED`.
- [ ] Run focused suites and confirm failures.
- [ ] Implement independent evaluation Prompt/profile selection, validated evidence writes, append-only evidence, deterministic concept-state reduction, and the sole transfer mastery transition.
- [ ] Rerun suites and expect reading time, number of answers, graph claims, and profile preference never to raise mastery.
- [ ] Commit with `git commit -m "feat: gate mastery on transfer evidence"`.

### Task 4: Completion and learning reports

**Files:**
- Create: `server/src/tools/learning-assistant/reports/learning-report.service.ts`, `learning-report.controller.ts`
- Test: `server/src/tools/learning-assistant/reports/learning-report.service.spec.ts`

- [ ] Write failing tests for unit completion, comprehensive transfer task, transferable abilities, fragile concepts, disagreements, citations, incomplete-session report, and owner isolation.
- [ ] Run focused suite and verify failures.
- [ ] Implement report projection solely from contracts, turns, validated evidence, concept states, and anchors; preserve unresolved disagreement rather than overwrite it.
- [ ] Rerun tests and expect no model free text to appear unless schema-validated and source-linked.
- [ ] Commit with `git commit -m "feat: generate learning reports"`.

### Task 5: Evidence-backed learner strategy profile

**Files:**
- Create: `server/src/tools/learning-assistant/profile/learner-profile.service.ts`, `learner-profile.controller.ts`, `strategy-policy.ts`
- Test: `server/src/tools/learning-assistant/profile/learner-profile.service.spec.ts`

- [ ] Write failing tests for valid-outcome-only updates, confidence/evidence/plain-language effect, insufficient evidence, per-strategy disable, evidence deletion, personalization disable, reset, and no occupation/personality inference.
- [ ] Run focused tests and confirm failures.
- [ ] Implement a bounded strategy enum and deterministic evidence aggregation; keep rubrics, permissions, grounding, and mastery thresholds outside profile inputs.
- [ ] Rerun tests and expect profile manipulation to change teaching-action preference only.
- [ ] Commit with `git commit -m "feat: add transparent learner strategies"`.

### Task 6: Atomic note drafts and confirmation

**Files:**
- Create: `server/src/tools/learning-assistant/notes/atomic-note.service.ts`, `atomic-note.controller.ts`, `atomic-note.schema.ts`
- Test: `server/src/tools/learning-assistant/notes/atomic-note.service.spec.ts`

- [ ] Write failing tests for draft provenance from user answer only, source/version/anchor/turn references, single-claim validation, edit, confirm, reject, and Agent inability to auto-confirm.
- [ ] Run focused suite and verify failures.
- [ ] Implement Zod draft generation and explicit user state transitions `DRAFT -> CONFIRMED|REJECTED`; reject source-only/model-only provenance.
- [ ] Rerun tests and expect only the owner to read or mutate the note.
- [ ] Commit with `git commit -m "feat: add confirmed atomic notes"`.

### Task 7: Note links, library, export, and deletion

**Files:**
- Create: `server/src/tools/learning-assistant/notes/note-link.service.ts`, `note-export.service.ts`, `note-export.processor.ts`
- Test: corresponding `.spec.ts` files and `server/test/note-lifecycle.e2e-spec.ts`

- [ ] Write failing tests for at most three owner-scoped suggestions, per-link confirmation, search/source filter/detail/delete, small synchronous export, large queued export, and Markdown containing confirmed notes/links only.
- [ ] Run focused suites and confirm failures.
- [ ] Implement link candidates without body disclosure, confirmation rows, deterministic Markdown ordering, storage-backed large exports, signed owner-only download, and cleanup.
- [ ] Rerun suites; assert drafts, rejected links, foreign notes, raw graph data, and hidden prompts are absent.
- [ ] Commit with `git commit -m "feat: complete atomic note lifecycle"`.

### Task 8: Runtime recovery matrix

**Files:**
- Create: `server/test/tutoring-recovery.e2e-spec.ts`

- [ ] Add the complete matrix: refresh, server restart, duplicate answer, duplicate resume, SSE disconnect, model timeout, schema failure, fallback success/failure, recall-only failure, transfer success, quota rejection, and ended session.
- [ ] Run and record each failing row.
- [ ] Fix only transactional, idempotency, checkpoint, or response-contract gaps exposed by the matrix.
- [ ] Run all server tests/build and expect zero failures.
- [ ] Commit with `git commit -m "test: verify tutoring recovery matrix"`.

