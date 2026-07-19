# Learning Sources and Contracts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn captured pages, EPUBs, and text PDFs into immutable, owner-scoped learning sources with stable anchors and user-confirmed learning contracts.

**Architecture:** Raw files/snapshots become immutable SourceVersions; BullMQ parses them through observable idempotent stages. Domain APIs expose sanitized status and stable anchors, while ModelGateway proposes—but the user confirms—the concept map, unit order, and learning contract.

**Tech Stack:** NestJS, Prisma, BullMQ, S3-compatible storage, `file-type`, EPUB/PDF parsers, Zod, Jest.

---

### Task 1: Object storage and immutable source versions

**Files:**
- Create: `server/src/storage/object-storage.service.ts`, `local-object-storage.adapter.ts`, `s3-object-storage.adapter.ts`, `storage.module.ts`, `server/src/tools/learning-assistant/sources/source.service.ts`, `source.module.ts`
- Test: `server/src/storage/object-storage.service.spec.ts`, `server/src/tools/learning-assistant/sources/source.service.spec.ts`

- [ ] Write failing contract tests for put/get/delete, key traversal rejection, SHA-256 verification, owner-scoped source lookup, immutable versions, and same-content idempotency.
- [ ] Run the two suites and expect missing symbols.
- [ ] Implement the storage interface/adapters and transactional `SourceService.createVersion` using normalized content hash plus owner/version uniqueness.
- [ ] Rerun tests; expect `PASS` and no object bytes in returned metadata DTOs.
- [ ] Commit with `git commit -m "feat: add immutable learning sources"`.

### Task 2: Secure EPUB/PDF upload admission

**Files:**
- Create: `server/src/tools/learning-assistant/sources/source.controller.ts`, `dto/upload-source.dto.ts`, `upload-policy.service.ts`
- Test: `server/src/tools/learning-assistant/sources/upload-policy.service.spec.ts`, `server/test/source-upload.e2e-spec.ts`

- [ ] Add failing cases for unauthenticated upload, ownership/quota, 50 MB boundary, extension/MIME/signature mismatch, corrupt file, unsupported type, and no storage/job write on rejection.
- [ ] Run focused tests and verify failures.
- [ ] Implement streaming upload admission with authentication and quota checks before storage, `file-type` signature verification, exact EPUB/PDF allowlist, sanitized filenames, and `413`/`415` domain errors.
- [ ] Create SourceVersion and parse Job only after successful storage; compensate object write if the database transaction fails; rerun tests and expect `PASS`.
- [ ] Commit with `git commit -m "feat: validate book uploads"`.

### Task 3: Parsing pipeline and quality stages

**Files:**
- Create: `server/src/tools/learning-assistant/parsing/parse-source.processor.ts`, `epub-extractor.ts`, `pdf-extractor.ts`, `quality-diagnostics.ts`, `anchor-builder.ts`, `parsing.errors.ts`
- Test: corresponding `.spec.ts` files and fixtures under `server/test/fixtures/sources/`
- Modify: `server/src/tools/learning-assistant/manifest.ts`

- [ ] Add minimal licensed/generated fixtures and failing tests for valid EPUB, text PDF, scanned PDF, corrupt archive, insufficient text, deterministic paragraph anchors, retryable storage outage, and resume from the last completed stage.
- [ ] Run the parser suites and expect missing processors.
- [ ] Implement stages `VALIDATED -> STORED -> TEXT_EXTRACTED -> ANCHORED -> MAP_PENDING -> READY`; classify scanned/empty PDFs as `SCANNED_PDF_UNSUPPORTED`, and declare only infrastructure failures retryable.
- [ ] Register an idempotent BullMQ processor that upserts anchors by `(sourceVersionId, anchorKey)` and never creates a duplicate version; rerun suites and expect `PASS`.
- [ ] Commit with `git commit -m "feat: parse books into stable anchors"`.

### Task 4: Migrate Web capture into unified sources

**Files:**
- Modify: `server/src/tools/knowledge-capture/capture.processor.ts`, `knowledge-capture.controller.ts`, `knowledge-capture.module.ts`
- Test: `server/src/tools/knowledge-capture/capture.processor.spec.ts`, `knowledge-capture.controller.spec.ts`

- [ ] Change tests to expect successful capture to create an owned WEB source/version and compatibility DTO, while missing snapshot, invalid metadata, and foreign access remain rejected.
- [ ] Run focused tests and confirm they fail against `KnowledgeItem` writes.
- [ ] Route extracted Markdown/HTML through `SourceService.createVersion`, preserve legacy endpoint shapes only where the modified spec requires them, and sanitize Job input/output metadata.
- [ ] Rerun capture, ownership, lifecycle, and extension suites; expect `PASS` without raw snapshot bodies in Job reads.
- [ ] Commit with `git commit -m "refactor: store captures as learning sources"`.

### Task 5: Content map and unit confirmation

**Files:**
- Create: `server/src/tools/learning-assistant/content-map/content-map.service.ts`, `content-map.schemas.ts`, `content-map.controller.ts`
- Test: `server/src/tools/learning-assistant/content-map/content-map.service.spec.ts`

- [ ] Write failing tests for schema-valid concepts/dependencies/units, valid current-version anchors, invalid/cross-version anchor rejection, and user split/merge/reorder/skip preserving retained anchor coverage.
- [ ] Run the focused suite and expect missing service failures.
- [ ] Implement Zod contracts, proposal persistence separated from confirmation, anchor resolution, and atomic confirmation revisions; call `ModelGateway` only through a mockable interface.
- [ ] Rerun the suite and expect invalid model output to leave no confirmed plan.
- [ ] Commit with `git commit -m "feat: add confirmed learning units"`.

### Task 6: Learning contract and start gate

**Files:**
- Create: `server/src/tools/learning-assistant/contracts/learning-contract.service.ts`, `learning-contract.controller.ts`, `dto/create-learning-contract.dto.ts`
- Test: `server/src/tools/learning-assistant/contracts/learning-contract.service.spec.ts`, `server/test/learning-contract.e2e-spec.ts`

- [ ] Write failing tests for transferable outcome, time budget, prior knowledge, selected confirmed units, zero-unit conflict, foreign source/project, and attempt to start before confirmation.
- [ ] Run focused tests and verify failures.
- [ ] Implement immutable contract versions and a `assertStartable(projectId, userId)` gate used by future tutoring-session creation.
- [ ] Rerun all source/contract tests and expect `PASS`.
- [ ] Commit with `git commit -m "feat: add user-confirmed learning contracts"`.

### Task 7: Source APIs, retry, deletion, and cleanup

**Files:**
- Modify: `server/src/tools/learning-assistant/sources/source.controller.ts`, `server/src/core/bullmq.service.ts`, `server/src/core/jobs.controller.ts`
- Create: `server/src/tools/learning-assistant/sources/delete-source.processor.ts`, `server/test/source-lifecycle.e2e-spec.ts`

- [ ] Write failing e2e tests for owned list/detail/version/stage, sanitized failures, eligible idempotent retry, unsafe retry rejection, deletion of DB/object/checkpoint descendants, and no effect on another user.
- [ ] Run the suite and record failures.
- [ ] Implement owner-scoped APIs, processor-declared retry policy, actual BullMQ re-enqueueing, staged cleanup with recoverable failure, and deletion progress metadata.
- [ ] Rerun source, jobs, BullMQ, and IDOR suites; expect `PASS` and no direct inline retry execution.
- [ ] Commit with `git commit -m "feat: complete source lifecycle"`.

