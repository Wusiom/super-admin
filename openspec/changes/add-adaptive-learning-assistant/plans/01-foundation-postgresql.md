# Foundation and PostgreSQL Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish a reproducible green baseline and the PostgreSQL data foundation required by every later learning-assistant slice.

**Architecture:** Keep one NestJS process and one Prisma schema, but replace SQLite with PostgreSQL and add normalized, owner-aware domain tables. Infrastructure configuration is validated at startup; migration is a separate, rehearsable command that never mutates the SQLite source.

**Tech Stack:** NestJS Config, Prisma 6, PostgreSQL 16, Redis 7, MinIO/S3, Mailpit/SMTP, Jest, Docker Compose.

---

### Task 1: Record and protect the existing baseline

**Files:**
- Create: `docs/baselines/2026-07-20-learning-assistant.md`
- Modify: `package.json`

- [ ] Run `pnpm --filter server test -- --runInBand`, `pnpm --filter server build`, `pnpm --filter client build`, and all `node --test extension/*.test.js`; copy command, exit code, pass/fail count, and any pre-existing failure verbatim into the baseline document.
- [ ] Add root scripts `test:server`, `test:extension`, `test`, `db:validate`, and `db:generate` that only compose the existing package commands; run `pnpm test` and expect the recorded baseline result.
- [ ] Add a Jest test in `server/src/app.module.spec.ts` asserting `AppModule` compiles with infrastructure services mocked; run it and confirm it fails before mocks/config seams exist.
- [ ] Add only the minimal provider overrides needed for deterministic module compilation; rerun the focused Jest test and expect `PASS`.
- [ ] Commit only baseline and script changes with `git commit -m "test: record learning assistant baseline"`.

### Task 2: Pin dependencies and validate environment configuration

**Files:**
- Modify: `server/package.json`, `client/package.json`, `pnpm-lock.yaml`
- Create: `server/src/config/environment.ts`, `server/src/config/environment.spec.ts`, `.env.example`
- Modify: `server/src/app.module.ts`

- [ ] Add a failing table-driven test for missing `DATABASE_URL`, `JWT_ACCESS_SECRET`, `TOKEN_ENCRYPTION_KEY`, malformed object-storage values, and a valid local configuration; run `pnpm --filter server test -- environment.spec.ts --runInBand` and expect missing module/function failures.
- [ ] Install exact lockfile-resolved versions of `@nestjs/jwt`, `argon2`, `cookie-parser`, `zod`, `@langchain/core`, `@langchain/openai`, `@langchain/langgraph`, `@langchain/langgraph-checkpoint-postgres`, `pg`, `file-type`, `epub2`, `pdf-parse`, `@aws-sdk/client-s3`, `nodemailer`, and `@nestjs/throttler`; install `vitest`, `@vue/test-utils`, `happy-dom`, and `@pinia/testing` for the client.
- [ ] Implement `environmentSchema` with Zod and export a typed `Environment`; configure `ConfigModule.forRoot({ isGlobal: true, validate })`; rerun the focused test and expect every invalid case to throw its field name.
- [ ] Populate `.env.example` with non-secret local defaults and documented required production values; run `rg -n "(password|secret|token)=.+" .env.example` and expect no real credential-like value.
- [ ] Run server/client builds and commit with `git commit -m "build: add validated learning dependencies"`.

### Task 3: Add PostgreSQL and supporting services

**Files:**
- Modify: `docker-compose.yml`, `server/Dockerfile`
- Create: `docker-compose.test.yml`

- [ ] Write a Compose configuration test in `server/src/config/compose-contract.spec.ts` that parses both Compose files and expects PostgreSQL, Redis, object storage, mail, health checks, and server dependencies; verify it fails.
- [ ] Add PostgreSQL 16, MinIO, and Mailpit services with named volumes and health checks; change server `DATABASE_URL` to PostgreSQL and add storage/SMTP variables without embedding production secrets.
- [ ] Update `server/Dockerfile` build-time `DATABASE_URL` to a syntactically valid PostgreSQL URL and keep `prisma migrate deploy` before application start.
- [ ] Run `docker compose config`, the focused contract test, and `docker compose -f docker-compose.yml -f docker-compose.test.yml config`; expect all to exit `0`.
- [ ] Commit with `git commit -m "build: add postgres storage and mail services"`.

### Task 4: Define the complete PostgreSQL domain schema

**Files:**
- Modify: `server/prisma/schema.prisma`
- Create: `server/prisma/schema.contract.spec.ts`

- [ ] Write a schema contract test asserting the datasource is `postgresql`, all models named in OpenSpec tasks 2.2–2.5 exist, every user-owned root has `userId`, and the `Role`, source, parsing, tutoring, note, audit, and quota enums exist; verify it fails.
- [ ] Add identity models (`User`, `WebSession`, `EmailToken`, `PasswordResetToken`, user-owned `ApiToken`, `AuditEvent`) with unique normalized email, token hashes, expiry/revocation fields, and last-admin-query indexes.
- [ ] Add learning models (`LearningSource`, immutable `SourceVersion`, `SourceAnchor`, `Concept`, `LearningUnit`, `LearningProject`, `LearningContract`) with version/hash/ownership constraints and source-version foreign keys.
- [ ] Add runtime and operations models (`TutoringSession`, `TutoringTurn`, `UnderstandingEvidence`, `ConceptState`, `LearnerStrategy`, `ProfileEvidence`, `AtomicNote`, `AtomicNoteLink`, `ModelProvider`, `ModelProfile`, `PromptVersion`, `ModelCall`, `QuotaPolicy`, `UserQuotaOverride`) and extend `Job` with owner, sanitized metadata, retry, timestamps, and idempotency fields.
- [ ] Run schema contract, `prisma format`, `prisma validate`, and `prisma generate`; expect all to pass, then commit with `git commit -m "feat: define learning assistant postgres schema"`.

### Task 5: Create and verify migration history

**Files:**
- Create: `server/prisma/migrations/0_postgresql_baseline/migration.sql`, `server/prisma/migrations/migration_lock.toml`
- Create: `server/test/prisma-schema.e2e-spec.ts`

- [ ] Add an e2e test that migrates an empty disposable database, creates two users with same owned-resource numeric IDs where applicable, and verifies composite ownership/uniqueness constraints; confirm it fails without migration SQL.
- [ ] Generate the PostgreSQL baseline using `pnpm --filter server exec prisma migrate diff --from-empty --to-schema server/prisma/schema.prisma --script`, review it for all foreign keys and indexes, and save it as the immutable baseline migration.
- [ ] Apply with `prisma migrate deploy` to the disposable database; rerun the e2e test and expect `PASS`.
- [ ] Run `prisma migrate status` and expect `Database schema is up to date`; record PostgreSQL and Prisma versions in the slice evidence.
- [ ] Commit schema and migration history with `git commit -m "db: add postgres baseline migration"`.

### Task 6: Build the one-way SQLite import rehearsal

**Files:**
- Create: `server/scripts/migrate-sqlite-to-postgres.ts`, `server/scripts/migrate-sqlite-to-postgres.spec.ts`, `docs/migrations/sqlite-to-postgresql.md`
- Modify: `server/package.json`

- [ ] Create a fixture SQLite database with Tool, Job, ApiToken, and KnowledgeItem rows and write a failing test for dry-run counts, initial-admin ownership, content SHA-256 equality, Job linkage, and refusal to overwrite a non-empty target.
- [ ] Implement `db:migrate:sqlite` as a one-way importer that requires `--source`, `--target`, `--initial-admin-email`, and `--dry-run`; it creates the initial verified ADMIN, maps every KnowledgeItem to one WEB `LearningSource` plus immutable `SourceVersion`, assigns Jobs, and never imports raw global tokens.
- [ ] Add transaction boundaries, an `LegacyIdMap` record/file, deterministic content hashes, resumable batch cursors, and sanitized progress output; rerun the focused tests and expect `PASS`.
- [ ] Rehearse dry-run and real import against disposable databases, compare row counts and hashes, then restore the SQLite fixture and confirm the source bytes are unchanged.
- [ ] Document freeze, backup, import, verification, cutover, and rollback commands and commit with `git commit -m "feat: add rehearsable sqlite import"`.

