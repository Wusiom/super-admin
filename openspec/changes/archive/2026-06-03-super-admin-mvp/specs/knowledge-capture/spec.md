## Purpose

定义知识采集工具的行为规范：输入 URL，通过 Playwright 服务端渲染页面，使用 Mozilla Readability 提取正文并转换为 Markdown 存储。本规格覆盖采集任务的创建、执行、错误处理，以及知识条目的查询、查看和删除。

## Requirements

### Requirement: Create Capture Job

The system SHALL allow users to submit a URL for capture by creating an asynchronous job. The request MUST include a valid URL. The response SHALL return the job ID for tracking.

#### Scenario: Submit valid URL for capture

- **WHEN** user submits `POST /api/tools/knowledge-capture/capture` with body `{ "url": "https://example.com/article" }`
- **THEN** a new Job record is created with `toolKey = "knowledge-capture"`, `status = "pending"`, and `input = { "url": "https://example.com/article" }`
- **AND** the job is enqueued into the `knowledge-capture` BullMQ queue
- **AND** the Job record's `bullmqJobId` is set to the BullMQ job ID for lifecycle tracking
- **AND** the response returns `{ "jobId": <id> }` with HTTP 201

#### Scenario: Submit invalid URL

- **WHEN** user submits a capture request with a malformed URL (e.g. `{ "url": "not-a-url" }`)
- **THEN** the system returns HTTP 400 with an error message "Invalid URL format"
- **AND** no Job record is created

#### Scenario: Submit empty URL

- **WHEN** user submits a capture request with an empty or missing `url` field
- **THEN** the system returns HTTP 400 with validation error details

### Requirement: Execute Capture via Playwright

The capture processor SHALL launch a headless Chromium browser via Playwright, navigate to the target URL, wait for the page to load, extract the main content using Mozilla Readability, and convert the result to Markdown.

#### Scenario: Successful page capture

- **WHEN** the capture processor executes for a valid, accessible URL
- **THEN** Playwright navigates to the URL and waits for the page `load` event (30s timeout)
- **AND** Mozilla Readability extracts the main article content
- **AND** the extracted HTML is converted to Markdown using Turndown or equivalent
- **AND** a KnowledgeItem record is created with title, url, source, contentHtml, contentMarkdown, status="published", and jobId
- **AND** the Job record is updated to status `success` with `output = { "itemId": <knowledgeItemId> }`

#### Scenario: URL unreachable (NETWORK_ERROR)

- **WHEN** Playwright cannot reach the target URL (DNS failure, connection refused)
- **THEN** the Job record status becomes `failed` with error type `NETWORK_ERROR`
- **AND** BullMQ retries once automatically
- **AND** no KnowledgeItem is created

#### Scenario: Page load timeout (TIMEOUT)

- **WHEN** the page does not finish loading within 30 seconds
- **THEN** the Job record status becomes `failed` with error type `TIMEOUT`
- **AND** BullMQ retries once automatically

#### Scenario: Readability extraction fails (EXTRACTION_FAILED)

- **WHEN** Playwright loads the page successfully but Readability cannot identify main content
- **THEN** the Job record status becomes `failed` with error type `EXTRACTION_FAILED`
- **AND** the job is NOT retried (requires human judgment)
- **AND** no KnowledgeItem is created

#### Scenario: Page blocks the bot (BLOCKED)

- **WHEN** the target page returns a CAPTCHA, 403, or bot detection challenge
- **THEN** the Job record status becomes `failed` with error type `BLOCKED`
- **AND** the job is NOT retried

#### Scenario: Extracted content is empty (EMPTY_CONTENT)

- **WHEN** Readability extracts content but the result is empty or contains only navigation text
- **THEN** the Job record status becomes `failed` with error type `EMPTY_CONTENT`
- **AND** the job is NOT retried

#### Scenario: Chromium crash (BROWSER_CRASH)

- **WHEN** the Chromium process crashes during capture
- **THEN** the Job record status becomes `failed` with error type `BROWSER_CRASH`
- **AND** BullMQ retries up to 2 times

### Requirement: List Knowledge Items

The system SHALL provide a paginated list of captured knowledge items, ordered by capture time descending.

#### Scenario: Query first page of items

- **WHEN** user requests `GET /api/tools/knowledge-capture/items?page=1&pageSize=20`
- **THEN** the response returns up to 20 items ordered by `capturedAt` descending
- **AND** each item includes id, title, url, source, status, and capturedAt
- **AND** the response header or body includes total count for pagination

#### Scenario: Empty knowledge base

- **WHEN** no items have been captured yet
- **THEN** the response returns an empty array with total count 0

### Requirement: View Knowledge Item Detail

The system SHALL return the full content of a knowledge item including its Markdown body.

#### Scenario: View existing item

- **WHEN** user requests `GET /api/tools/knowledge-capture/items/:id` for an existing item
- **THEN** the response includes all fields: id, title, url, source, contentHtml, contentMarkdown, status, capturedAt, createdAt

#### Scenario: Item not found

- **WHEN** user requests an item ID that does not exist
- **THEN** the response returns HTTP 404

### Requirement: Delete Knowledge Item

The system SHALL allow users to delete a knowledge item permanently.

#### Scenario: Delete existing item

- **WHEN** user sends `DELETE /api/tools/knowledge-capture/items/:id` for an existing item
- **THEN** the item is permanently removed from the database
- **AND** the response returns HTTP 204

#### Scenario: Delete non-existent item

- **WHEN** user sends DELETE for an item ID that does not exist
- **THEN** the response returns HTTP 404
