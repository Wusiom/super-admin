## 1. Baseline and Dependencies

- [x] 1.1 Record current server/client build and test baselines and document any pre-existing failures
- [x] 1.2 Add LangGraph, LangChain, PostgreSQL, Argon2id, file-signature, EPUB/PDF parsing, object-storage, and mail dependencies with pinned compatible versions
- [x] 1.3 Add validated environment configuration for PostgreSQL, Redis, object storage, SMTP, model providers, session secrets, and public application URL
- [x] 1.4 Extend Docker Compose and environment examples with PostgreSQL, object storage, and required health checks

## 2. PostgreSQL Schema and Migration

- [x] 2.1 Replace the Prisma SQLite datasource with PostgreSQL and keep the existing Tool and Job semantics compatible
- [x] 2.2 Add User, WebSession, EmailToken, PasswordResetToken, user-owned ApiToken, Role, and AuditEvent schema
- [x] 2.3 Add LearningSource, SourceVersion, SourceAnchor, Concept, LearningUnit, LearningProject, and LearningContract schema
- [x] 2.4 Add TutoringSession, TutoringTurn, UnderstandingEvidence, ConceptState, LearnerStrategy, and ProfileEvidence schema
- [x] 2.5 Add AtomicNote, AtomicNoteLink, ModelProvider, ModelProfile, PromptVersion, ModelCall, QuotaPolicy, and UserQuotaOverride schema
- [x] 2.6 Add ownership, idempotency, source-version, BullMQ, audit, and lookup indexes and constraints
- [x] 2.7 Implement and test the SQLite-to-PostgreSQL migration that assigns existing KnowledgeItems and Jobs to the initial administrator
- [x] 2.8 Verify Prisma generation, migration application, record counts, content hashes, and rollback backup instructions

## 3. Authentication and Ownership

- [ ] 3.1 Implement MailService abstraction with local diagnostic and SMTP transports
- [ ] 3.2 Implement registration, Argon2id password hashing, email verification, resend throttling, and generic recovery responses
- [ ] 3.3 Implement login, rotating hashed refresh-token families, access-token refresh, logout, and logout-all behavior
- [ ] 3.4 Implement password-reset token issue, expiry, one-time redemption, and session revocation
- [ ] 3.5 Implement trusted authentication context and `USER`/`ADMIN` authorization guards for Web and API routes
- [ ] 3.6 Add ownership-aware repository helpers and apply them to every user-domain query and mutation
- [ ] 3.7 Add unit and e2e tests for token reuse detection, admin route denial, last-administrator protection, and cross-user IDOR attempts

## 4. User-Scoped Extension Tokens

- [ ] 4.1 Replace the global ApiToken service with create, list, use, and revoke operations for user-owned scoped tokens
- [ ] 4.2 Enforce `capture:create` scope and trusted token-owner context on the extension capture endpoint
- [ ] 4.3 Remove first-start global-token generation and the legacy overwrite-style token refresh behavior
- [ ] 4.4 Update extension settings API and UI to create a labeled token, deliver it once to the extension, list metadata, and revoke tokens
- [ ] 4.5 Update the Chrome extension configuration and failure handling for revoked or reauthorized user tokens
- [ ] 4.6 Add tests proving raw tokens never enter persistence, logs, audit events, job metadata, or read responses

## 5. Learning Source Ingestion

- [ ] 5.1 Implement the object-storage abstraction with local-development and S3-compatible adapters
- [ ] 5.2 Implement LearningSource and immutable SourceVersion services with normalized content hashing and ownership checks
- [ ] 5.3 Migrate successful knowledge capture to create versioned Web learning sources while preserving compatibility endpoints
- [ ] 5.4 Implement EPUB/PDF upload validation for authentication, quota, 50 MB size, extension, MIME, and file signature
- [ ] 5.5 Implement BullMQ processors for EPUB extraction, text PDF extraction, quality diagnostics, anchor generation, and cleanup
- [ ] 5.6 Detect scanned PDFs and fail with `SCANNED_PDF_UNSUPPORTED` before content-map generation
- [ ] 5.7 Expose owner-scoped source lists, detail, version, parsing-stage, retry, and deletion APIs
- [ ] 5.8 Add parsing fixtures and tests for valid EPUB, valid text PDF, corrupt files, type mismatch, oversize upload, scanned PDF, and retryable infrastructure failure

## 6. Content Map and Learning Contract

- [ ] 6.1 Implement stable source anchors scoped to immutable source versions and validate anchor resolution
- [ ] 6.2 Implement schema-valid concept, dependency, and proposed learning-unit generation through ModelGateway
- [ ] 6.3 Implement user confirmation, split, merge, reorder, and skip operations for proposed units
- [ ] 6.4 Prevent project or session creation until at least one valid unit is user-confirmed
- [ ] 6.5 Implement learning-contract creation for transferable outcome, time budget, prior knowledge, and unit scope
- [ ] 6.6 Add tests for invalid anchors, cross-version references, unconfirmed units, and edited unit plans

## 7. Model Gateway and LangGraph Foundation

- [ ] 7.1 Implement encrypted-at-rest provider secrets and administration DTOs that expose only masked presence indicators
- [ ] 7.2 Implement versioned ModelProfile and PromptVersion selection, connection tests, timeouts, retry policy, and fallback order
- [ ] 7.3 Implement ModelGateway structured output validation, repair, fallback, Token accounting, cost metadata, and sanitized errors
- [ ] 7.4 Define TutorAction and EvaluationResult schemas and reject unknown actions or invalid anchors
- [ ] 7.5 Implement PostgreSQL LangGraph checkpoint storage with domain session and Interrupt correlation
- [ ] 7.6 Implement the initial tutoring graph nodes for observe, choose action, render interaction, interrupt, evaluate, persist evidence, and choose next step
- [ ] 7.7 Add tests proving Graph State is resumable but cannot independently change domain mastery or authorization

## 8. Adaptive Tutoring Runtime

- [ ] 8.1 Implement authenticated session creation and resume from the user-confirmed learning contract
- [ ] 8.2 Implement the allowed teaching actions and their structured user-facing payloads
- [ ] 8.3 Implement independent source-grounded answer evaluation and disagreement preservation
- [ ] 8.4 Implement understanding evidence and concept-state transitions with transfer validation as the mastery gate
- [ ] 8.5 Implement idempotency keys for answer submission and Interrupt resume
- [ ] 8.6 Implement authenticated SSE for node progress, visible text, recoverable errors, and final committed results
- [ ] 8.7 Implement active session ending, unit completion, comprehensive transfer task, and source learning report generation
- [ ] 8.8 Add graph and e2e tests for refresh resume, server restart resume, duplicate submission, disconnect recovery, schema failure, recall-only failure, and transfer success

## 9. Learner Profile

- [ ] 9.1 Implement evidence-backed strategy preference updates that consume only valid evaluated outcomes
- [ ] 9.2 Keep evaluation rubrics, permissions, source grounding, and mastery thresholds independent of profile preferences
- [ ] 9.3 Implement profile read APIs with confidence, evidence references, plain-language effect, and insufficient-evidence state
- [ ] 9.4 Implement per-strategy disable, evidence-reference deletion, personalization disable, and full profile reset
- [ ] 9.5 Add tests preventing unsupported occupation/personality inference and profile-driven permission or rubric changes

## 10. Atomic Notes and Export

- [ ] 10.1 Implement atomic-note draft creation only from user answers with source and answer provenance
- [ ] 10.2 Implement draft editing, explicit confirmation, rejection, and atomic-claim structure validation
- [ ] 10.3 Implement up to three owner-scoped link suggestions with per-link confirmation
- [ ] 10.4 Implement note library search, source filtering, note detail, deletion, and ownership enforcement
- [ ] 10.5 Implement synchronous and queued Markdown export for confirmed notes and links only
- [ ] 10.6 Add tests excluding drafts, other users' notes, raw graph data, hidden prompts, and rejected links from exports

## 11. Platform Administration Backend

- [ ] 11.1 Implement administrator user search, filter, detail DTO, role/status changes, session revocation, and per-user quota override
- [ ] 11.2 Implement platform tool registry administration, enable/disable policy, module configuration validation, and version metadata
- [ ] 11.3 Implement learning-assistant module configuration for model profile, Prompt version, file limit, and strategy switches
- [ ] 11.4 Implement model provider/profile/Prompt administration with masked secrets, bounded connection tests, and immutable publishing
- [ ] 11.5 Implement platform-default and per-user Token, storage, file, and concurrency quota enforcement
- [ ] 11.6 Implement cross-tool administrative job filters, sanitized detail, retry eligibility, and audited idempotent retry
- [ ] 11.7 Implement health checks for PostgreSQL, Redis, BullMQ workers, object storage, mail, and configured model providers
- [ ] 11.8 Implement immutable audit recording and filtered export for success and failure of protected operations
- [ ] 11.9 Add administration tests for content-field exclusion, secret masking, last-admin protection, unsafe retry rejection, quota rejection, and audit completeness

## 12. Frontend Authentication and Navigation

- [ ] 12.1 Implement registration, verification, login, refresh, logout, recovery, and reset views and authentication API client
- [ ] 12.2 Implement Pinia session state, safe refresh rotation, route guards, and logout-all response handling
- [ ] 12.3 Register the learning-assistant ToolManifest and add the `/learning` workspace routes
- [ ] 12.4 Add the static role-protected `/admin` navigation and routes without introducing a “学习助手管理” top-level menu
- [ ] 12.5 Update settings with account, session, and user-scoped extension-token management
- [ ] 12.6 Add frontend tests for `USER`/`ADMIN` menu visibility, direct-route denial, auth error states, and token revocation UI

## 13. Learning Workspace Frontend

- [ ] 13.1 Implement learning home with empty state, captured-source selection, EPUB/PDF import modal, parsing progress, and errors
- [ ] 13.2 Implement source detail, content map, parsing quality, and learning-unit editing and confirmation
- [ ] 13.3 Implement the learning-contract flow for goal, time, prior knowledge, and unit scope
- [ ] 13.4 Implement the focus session with one primary task, answer submission, SSE progress, feedback, hints, recovery, and end-session control
- [ ] 13.5 Implement source-evidence, concept-map, unit-progress, and atomic-note drawers without exposing raw Graph State
- [ ] 13.6 Implement completion report with transferable abilities, fragile concepts, disagreements, and comprehensive-task result
- [ ] 13.7 Implement atomic-note library, note detail, confirmation, link suggestions, deletion, and Markdown export
- [ ] 13.8 Implement learner-profile evidence, controls, empty state, and reset confirmation
- [ ] 13.9 Match the approved design prototype and add responsive, loading, empty, disabled, and recoverable error states

## 14. Administration Workspace Frontend

- [ ] 14.1 Implement the platform administration landing page and privacy boundary notice
- [ ] 14.2 Implement user list filters and user-detail drawer with protected high-risk actions
- [ ] 14.3 Implement tool list and learning-assistant module configuration pages
- [ ] 14.4 Implement model service, Prompt version, connection-test, and secret-masking pages
- [ ] 14.5 Implement platform quota defaults and user override pages
- [ ] 14.6 Implement cross-tool job and error pages with retry eligibility and sanitized detail
- [ ] 14.7 Implement system health and audit-log pages with filters and export
- [ ] 14.8 Add frontend tests proving administrative pages never render protected learning-content fields

## 15. Security, Observability, and Quality Gates

- [ ] 15.1 Add structured correlation across Web request, BullMQ job, model call, LangGraph node, domain turn, and audit event
- [ ] 15.2 Add rate limits for authentication, verification, reset, model calls, uploads, token creation, and administrative connection tests
- [ ] 15.3 Add prompt-injection tests proving source text cannot change tools, permissions, schemas, or evaluation criteria
- [ ] 15.4 Create at least 30 human-labeled answer cases and calibrate pass/fail agreement to at least 85 percent
- [ ] 15.5 Create source-citation fixtures and verify at least 95 percent human support for accepted evaluation citations
- [ ] 15.6 Add deletion tests that verify database, object-storage, checkpoint, export, token, and session cleanup
- [ ] 15.7 Run server unit/e2e tests, client tests, builds, Prisma validation, and migration rehearsal and record results
- [ ] 15.8 Complete end-to-end acceptance for registration, capture ownership, book import, unit confirmation, resume, transfer mastery, note export, admin isolation, and account deletion
- [ ] 15.9 Update deployment, environment, architecture, extension authorization, administrator, privacy, migration, and rollback documentation
