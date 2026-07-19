## MODIFIED Requirements

### Requirement: Dynamic Menu Generation
The frontend SHALL generate user-facing tool navigation from enabled registered tool manifests and SHALL add role-aware static platform entries without exposing administrative navigation to non-administrators.

#### Scenario: Menu renders registered tools
- **WHEN** an authenticated user loads the frontend and calls `GET /api/tools`
- **THEN** the sidebar displays enabled tools that the user's role may access
- **AND** each tool item shows the manifest icon and name and navigates to the manifest route
- **AND** the learning-assistant manifest renders the “学习助手” entry at `/learning`

#### Scenario: Administrator sees the platform workspace
- **WHEN** an authenticated `ADMIN` loads the frontend
- **THEN** the sidebar displays enabled user-facing tools
- **AND** separately displays the static “后台管理” entry at `/admin`

#### Scenario: Ordinary user does not see platform administration
- **WHEN** an authenticated `USER` loads the frontend
- **THEN** no “后台管理” entry is rendered
- **AND** the tools API returns no administrative configuration or diagnostic fields

#### Scenario: Disabled tool not shown
- **WHEN** a tool's `enabled` field is `false`
- **THEN** the tool is omitted from the user-facing tools response and sidebar
- **AND** new user operations for that tool are rejected according to the tool shutdown policy

#### Scenario: No tools registered
- **WHEN** no user-facing tools are registered or enabled
- **THEN** the sidebar retains permitted static entries such as settings and administration
- **AND** the main content displays an empty-tool state

### Requirement: Job Center
The platform SHALL provide owner-scoped job visibility for ordinary users and a role-protected cross-tool administration center for administrators. Every job MUST track owner, tool, status, sanitized input metadata, sanitized output metadata, error category, retry eligibility, and its BullMQ reference.

#### Scenario: User views owned jobs
- **WHEN** an authenticated user requests a job list outside the administration API
- **THEN** only jobs whose `userId` matches the authenticated user are returned
- **AND** each row includes the tool, status, creation time, and permitted actions

#### Scenario: Administrator views all jobs
- **WHEN** an administrator opens `/admin/jobs`
- **THEN** a paginated table shows sanitized jobs across tools ordered by creation time descending
- **AND** no source body, tutoring answer, note body, secret, or Graph State is returned

#### Scenario: Filter jobs by tool and status
- **WHEN** an authorized caller supplies tool and status filters
- **THEN** only jobs within the caller's ownership scope and matching both filters are returned

#### Scenario: Retry an eligible failed job
- **WHEN** an authorized caller retries a failed job whose processor declares idempotent retry support
- **THEN** the existing domain job is reset to `pending` and re-enqueued
- **AND** no duplicate completed domain effect or duplicate Job record is created

#### Scenario: Reject an ineligible retry
- **WHEN** a job is not failed, is unrecoverable, is non-idempotent, or is outside the caller's ownership scope
- **THEN** the retry request is rejected without enqueueing work

### Requirement: Job Lifecycle
The platform SHALL manage job state transitions as `pending` to `running` to `success` or `failed`. The Worker SHALL handle the `pending` to `running` transition, QueueEvents SHALL synchronize terminal status, and each record SHALL reference its BullMQ job through `bullmqJobId`.

#### Scenario: Successful job execution
- **WHEN** a BullMQ processor starts and completes successfully
- **THEN** the Job record transitions from `pending` to `running` to `success`
- **AND** stores sanitized output metadata and completion time

#### Scenario: Failed job execution
- **WHEN** a processor throws an error
- **THEN** QueueEvents updates the matching Job record to `failed`
- **AND** stores a sanitized error category and message
- **AND** BullMQ retries only according to the processor's declared retry policy

#### Scenario: Non-retriable error
- **WHEN** a processor raises an error declared unrecoverable, including `EXTRACTION_FAILED`, `BLOCKED`, `EMPTY_CONTENT`, or `SCANNED_PDF_UNSUPPORTED`
- **THEN** BullMQ performs no automatic retry
- **AND** the Job record is marked failed with `retryEligible=false`

#### Scenario: BullMQ enqueue failure
- **WHEN** a Job record is created but Redis or BullMQ enqueue fails
- **THEN** the record remains pending with its ownership and input metadata intact
- **AND** cleanup marks stale pending records failed with a sanitized enqueue-failure category

#### Scenario: Duplicate lifecycle event
- **WHEN** QueueEvents or a recovery worker processes a duplicate event for the same `bullmqJobId`
- **THEN** the lifecycle update is idempotent
- **AND** cannot duplicate output domain effects

