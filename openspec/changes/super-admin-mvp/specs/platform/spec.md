## Purpose

定义 super-admin 后台容器平台核心能力：工具注册协议、动态菜单渲染、统一任务队列基础设施。本规格覆盖平台框架自身的行为，不涉及具体工具的业务逻辑。

## Requirements

### Requirement: Tool Registration

The platform SHALL provide a tool registration mechanism where each tool module registers itself via a manifest on application startup. The manifest MUST include the tool's key, name, icon, and route. After registration, the tool information SHALL be persisted in the Tool database table and exposed via the GET /api/tools endpoint.

#### Scenario: Tool module registers on startup

- **WHEN** the NestJS application starts and a tool module calls `ToolRegistry.register(manifest)` in its `onModuleInit` hook
- **THEN** the tool information is persisted to the `Tool` table (inserted if new key, skipped if already exists)
- **AND** the tool's BullMQ processors are registered with the queue system
- **AND** the tool appears in the response of `GET /api/tools`

#### Scenario: Tool already registered

- **WHEN** a tool module registers with a key that already exists in the `Tool` table
- **THEN** the registration is silently skipped (no duplicate insert)
- **AND** the existing tool record remains unchanged

### Requirement: Dynamic Menu Generation

The frontend SHALL automatically generate the sidebar navigation menu from registered tool manifests without hardcoding any tool entries. The menu MUST reflect the tool list returned by the GET /api/tools endpoint.

#### Scenario: Menu renders registered tools

- **WHEN** the frontend application loads and calls `GET /api/tools`
- **THEN** the sidebar menu displays all tools with `enabled=true`
- **AND** each menu item shows the tool's icon and name
- **AND** clicking a menu item navigates to the tool's route

#### Scenario: Disabled tool not shown

- **WHEN** a tool's `enabled` field is set to `false` in the database
- **THEN** that tool SHALL NOT appear in the response of `GET /api/tools`
- **AND** the tool SHALL NOT appear in the sidebar menu

#### Scenario: No tools registered

- **WHEN** no tools are registered in the system
- **THEN** the sidebar menu displays an empty state
- **AND** the main content area shows a welcome page or dashboard placeholder

### Requirement: Job Center

The platform SHALL provide a unified job center where users can view the status of all asynchronous tasks across all tools. Each job MUST track its associated tool, current status, input parameters, output results, and error information.

#### Scenario: View all jobs

- **WHEN** user navigates to the job center page
- **THEN** a paginated table displays all jobs ordered by creation time descending
- **AND** each row shows: tool name, status badge, creation time, and action buttons

#### Scenario: Filter jobs by tool

- **WHEN** user selects a specific tool from the filter dropdown and the page reloads
- **THEN** only jobs belonging to that tool are displayed

#### Scenario: Filter jobs by status

- **WHEN** user selects a status filter (pending/running/success/failed)
- **THEN** only jobs matching that status are displayed

#### Scenario: Retry failed job

- **WHEN** user clicks "retry" on a job with status `failed`
- **THEN** the job is re-enqueued into its tool's BullMQ queue
- **AND** a new Job record is NOT created; the existing record's status resets to `pending`

### Requirement: Job Lifecycle

The platform SHALL manage job state transitions in the following order: pending → active → completed or failed. The Worker process SHALL handle the pending→active transition, and the QueueEvents system SHALL handle the active→success and active→failed transitions. Each Job record SHALL reference its BullMQ job via a `bullmqJobId` field for precise status matching.

#### Scenario: Successful job execution

- **WHEN** a BullMQ processor completes successfully
- **THEN** the QueueEvents `completed` listener updates the corresponding Job record (matched by `bullmqJobId`) from `active` to `success`
- **AND** the job's `output` field is populated with the processor's return value

#### Scenario: Failed job execution

- **WHEN** a BullMQ processor throws an error
- **THEN** the QueueEvents `failed` listener updates the corresponding Job record (matched by `bullmqJobId`) from `active` to `failed`
- **AND** the job's `error` field is populated with the error message
- **AND** BullMQ automatically retries according to the configured backoff strategy (up to 3 attempts)

#### Scenario: Non-retriable error

- **WHEN** a processor throws an error with `jobErrorType` in `EXTRACTION_FAILED`, `BLOCKED`, or `EMPTY_CONTENT`
- **THEN** the Worker wraps it as an `UnrecoverableError` so BullMQ does not retry
- **AND** the QueueEvents `failed` listener still records the failure in the Job record

#### Scenario: BullMQ enqueue failure

- **WHEN** a job record is inserted into the `Job` table but the BullMQ enqueue fails (e.g. Redis unavailable)
- **THEN** the Job record remains in `pending` status
- **AND** a scheduled cleanup task (every 5 minutes) scans for pending records older than 10 minutes and marks them as `failed` with error "BullMQ enqueue failed: Redis unavailable"
