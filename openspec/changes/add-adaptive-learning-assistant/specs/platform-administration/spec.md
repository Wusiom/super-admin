## ADDED Requirements

### Requirement: Platform Administration Workspace
The system SHALL provide a platform-wide `/admin` workspace visible only to `ADMIN` users, and SHALL expose learning-assistant configuration as a module under tool management rather than as a separate top-level administration product.

#### Scenario: Administrator opens the workspace
- **WHEN** an authenticated `ADMIN` navigates to `/admin`
- **THEN** the workspace provides entry points for users, tools, model services, quotas, jobs, system status, and audit logs

#### Scenario: Learning assistant configuration location
- **WHEN** an administrator opens `/admin/tools/learning-assistant`
- **THEN** the page exposes the learning assistant's model profile, Prompt version, file limits, and strategy switches
- **AND** the sidebar contains no top-level “学习助手管理” entry

### Requirement: Administrative User Management
The system SHALL let administrators search and filter accounts, inspect non-content account metadata, change roles, disable or restore accounts, revoke sessions, and apply per-user quota overrides.

#### Scenario: View user details
- **WHEN** an administrator selects a user
- **THEN** the administration DTO includes account, role, verification, status, quota, usage, and security-event metadata
- **AND** excludes source bodies, tutoring answers, atomic notes, and LangGraph State

#### Scenario: Perform a high-risk user operation
- **WHEN** an administrator submits a role or status change with a reason
- **THEN** the system revalidates last-administrator protection
- **AND** applies the operation atomically with session revocation and an audit event

### Requirement: Tool Registry Administration
The system SHALL expose registered ToolManifest metadata, enabled state, version, processor state, and validated module configuration to administrators.

#### Scenario: Disable a tool
- **WHEN** an administrator disables a tool and supplies a reason
- **THEN** the tool is removed from user navigation and rejects new user operations
- **AND** existing jobs and resumable sessions follow the tool's declared shutdown policy
- **AND** the action is audited

#### Scenario: Save invalid module configuration
- **WHEN** module configuration fails its schema or references an unavailable model profile
- **THEN** the system rejects the change without publishing a new version
- **AND** returns field-level validation errors

### Requirement: Model Service Administration
The system SHALL manage OpenAI-compatible providers, model profiles, Prompt versions, timeouts, retry policies, and fallback order while never returning stored secret values.

#### Scenario: Read a model configuration
- **WHEN** an administrator requests a provider configuration
- **THEN** secret fields are returned only as masked presence indicators
- **AND** cannot be reconstructed from the response or audit log

#### Scenario: Test a provider connection
- **WHEN** an administrator explicitly requests a connection test
- **THEN** the system performs a bounded, non-domain test with timeout
- **AND** records latency and a sanitized result without exposing the secret

#### Scenario: Publish a model configuration
- **WHEN** a validated model or Prompt configuration is published with a reason
- **THEN** the system creates an immutable configuration version
- **AND** new sessions use that version while existing sessions retain their creation version

### Requirement: Quota Administration
The system SHALL support platform defaults and per-user overrides for model tokens, stored bytes, file size, and concurrent learning sessions.

#### Scenario: Reject an over-quota model call
- **WHEN** a user would exceed an applicable Token quota
- **THEN** the system rejects the call before contacting the model provider
- **AND** preserves the tutoring session in a resumable state

#### Scenario: Change a user override
- **WHEN** an administrator changes a per-user quota and supplies a reason
- **THEN** the new quota applies to subsequent operations
- **AND** the old value, new value, actor, target, and reason are audited

### Requirement: Cross-Tool Job Administration
The system SHALL let administrators filter jobs across tools, inspect sanitized failure metadata, and retry only failed jobs whose processors declare idempotent retry support.

#### Scenario: Retry an idempotent failed job
- **WHEN** an administrator requests retry for an eligible failed job and supplies a reason
- **THEN** the existing domain job is re-enqueued without duplicating completed effects
- **AND** the retry is audited

#### Scenario: Reject unsafe retry
- **WHEN** a failed job is non-idempotent, unrecoverable, or has already completed its domain effect
- **THEN** the system rejects retry and explains the retry boundary

### Requirement: Platform Health Visibility
The system SHALL expose health status for PostgreSQL, Redis, BullMQ workers, object storage, mail transport, and configured model providers without exposing credentials or user content.

#### Scenario: Dependency is unhealthy
- **WHEN** a platform dependency health check fails
- **THEN** the administration workspace identifies the dependency and sanitized failure category
- **AND** does not include connection secrets, source content, answers, or notes

### Requirement: Immutable Administrative Audit
The system SHALL record administrative security and configuration operations with actor, target, action, reason, before/after metadata, result, request correlation ID, and timestamp.

#### Scenario: Filter and export audit events
- **WHEN** an administrator filters audit events by actor, action, target, result, or date and requests export
- **THEN** the system exports only matching sanitized audit metadata
- **AND** excludes secrets and user learning content

#### Scenario: Administrative operation fails
- **WHEN** a protected administrative operation is rejected or fails
- **THEN** the attempted action and sanitized result are still recorded

### Requirement: Administration Content Privacy
Administrative list, detail, metric, job, health, and audit responses MUST NOT include user source bodies, tutoring answers, atomic-note bodies, hidden prompts, or LangGraph State.

#### Scenario: Administrator requests unsupported user content
- **WHEN** an administrator attempts to obtain protected learning content through an administration endpoint
- **THEN** the system returns `403 Forbidden` or omits the field according to the endpoint contract
- **AND** records the access attempt when it represents a protected operation

