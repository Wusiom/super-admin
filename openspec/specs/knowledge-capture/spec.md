## Purpose

定义知识采集工具的行为规范：Chrome 扩展将用户浏览器中已渲染的页面 DOM 快照（pageHtml）发送到后端，后端使用 Mozilla Readability 提取正文并转换为 Markdown 存储。对于具备有效页面元数据和 cookie 的语雀文档页，后端优先调用语雀文档 API 获取服务端 Markdown，再按需回退到通用 HTML 快照管线。采集是同步内联执行的（不经过 BullMQ 队列），整个流程在单次 HTTP 请求中完成。本规格覆盖采集任务的创建、执行、错误处理，以及知识条目的查询、查看和删除。

## Requirements

### Requirement: Create Capture Job

The system SHALL allow the Chrome extension to submit a page snapshot for capture. The request MUST include a valid URL and a page HTML snapshot, unless a site-specific capture path can use optional page metadata. The request MAY include `pageAppData` for site-specific capture processors. The response SHALL return the job ID for tracking.

#### Scenario: Submit page snapshot for capture

- **WHEN** Chrome extension submits `POST /api/tools/knowledge-capture/capture` with body `{ "url": "https://example.com/article", "pageHtml": "<html>...</html>" }`
- **THEN** a new Job record is created with `toolKey = "knowledge-capture"`, `status = "running"`
- **AND** the capture processor is invoked inline to extract content from the pageHtml
- **AND** the response returns `{ "jobId": <id> }` with HTTP 201

#### Scenario: Submit Yuque page metadata for capture

- **WHEN** Chrome extension submits `POST /api/tools/knowledge-capture/capture` with Yuque `url`, `pageHtml`, `cookies`, and `pageAppData`
- **THEN** a new Job record is created with `toolKey = "knowledge-capture"`, `status = "running"`
- **AND** the capture processor receives `pageAppData` for Yuque-specific extraction
- **AND** the response returns `{ "jobId": <id> }` with HTTP 201

#### Scenario: Submit without pageHtml

- **WHEN** a capture request is submitted without `pageHtml` (or with an empty pageHtml), and no site-specific capture path can use the submitted metadata
- **THEN** a Job record is created with `status = "failed"` and error "Page snapshot was not received from the extension"
- **AND** the response returns `{ "jobId": <id> }` with HTTP 201 (the job itself is created but already failed)

#### Scenario: Submit invalid URL

- **WHEN** user submits a capture request with a malformed URL (e.g. `{ "url": "not-a-url" }`)
- **THEN** the system returns HTTP 400 with an error message "Invalid URL format"
- **AND** no Job record is created

#### Scenario: Submit empty URL

- **WHEN** user submits a capture request with an empty or missing `url` field
- **THEN** the system returns HTTP 400 with validation error details

### Requirement: Execute Capture from Page Snapshot

For generic pages, the capture processor SHALL parse the page HTML snapshot from the Chrome extension using JSDOM, extract the main content using Mozilla Readability, and convert the result to Markdown. No browser is launched server-side. For Yuque document pages with valid page metadata and cookies, the processor SHALL try Yuque API Markdown capture before falling back to the generic HTML pipeline when appropriate.

#### Scenario: Successful page capture

- **WHEN** the capture processor executes with a valid non-Yuque pageHtml snapshot
- **THEN** JSDOM parses the HTML
- **AND** Mozilla Readability extracts the main article content
- **AND** the extracted HTML is converted to Markdown using Turndown
- **AND** a KnowledgeItem record is created with title, url, contentHtml, contentMarkdown, status="published", and jobId
- **AND** the Job record is updated to status `success` with `output = { "itemId": <knowledgeItemId> }`

#### Scenario: Successful Yuque API Markdown capture

- **WHEN** the capture processor executes with Yuque URL, valid `pageAppData`, collected cookies, and the Yuque API returns Markdown in `data.sourcecode`
- **THEN** the processor stores `data.sourcecode` as `KnowledgeItem.contentMarkdown`
- **AND** the processor stores Yuque API HTML content as `KnowledgeItem.contentHtml` when available
- **AND** the processor uses the Yuque API title when available
- **AND** the KnowledgeItem is created with `source = "yuque"`, `status = "published"`, and the current jobId
- **AND** the Job record is updated to status `success` with `output = { "itemId": <knowledgeItemId> }`

#### Scenario: Yuque metadata missing

- **WHEN** the capture processor executes with a Yuque URL but without valid `pageAppData`
- **THEN** the processor uses the existing JSDOM, Readability, and Turndown pipeline
- **AND** the job result follows the generic page capture result

#### Scenario: Yuque API recoverable failure fallback

- **WHEN** the capture processor executes with Yuque URL and valid `pageAppData`, but the Yuque API request has a network error, unexpected response shape, non-auth HTTP error, or empty Markdown
- **THEN** the processor uses the existing JSDOM, Readability, and Turndown pipeline as fallback when a usable page snapshot exists
- **AND** the job result follows the generic page capture result

#### Scenario: Yuque API authentication failure

- **WHEN** the capture processor executes with a Yuque URL and the Yuque API returns HTTP 401 or 403
- **THEN** the Job record status becomes `failed` with error type `LOCKED_CONTENT`
- **AND** the processor does NOT create a KnowledgeItem from fallback HTML content
- **AND** the job is NOT retried

#### Scenario: Readability extraction fails (EXTRACTION_FAILED)

- **WHEN** pageHtml is valid but Readability cannot identify main content
- **THEN** the Job record status becomes `failed` with error type `EXTRACTION_FAILED`
- **AND** the job is NOT retried (requires human judgment)
- **AND** no KnowledgeItem is created

#### Scenario: Page is a CAPTCHA or verification page (BLOCKED)

- **WHEN** the pageHtml contains CAPTCHA, slider verification, or access-denied patterns
- **THEN** the Job record status becomes `failed` with error type `BLOCKED`
- **AND** the job is NOT retried

#### Scenario: Page requires login or subscription (LOCKED_CONTENT)

- **WHEN** the pageHtml contains paywall or login-wall patterns
- **THEN** the Job record status becomes `failed` with error type `LOCKED_CONTENT`
- **AND** the job is NOT retried

#### Scenario: Extracted content is empty (EMPTY_CONTENT)

- **WHEN** Readability extracts content but the result is empty or below 100 characters
- **THEN** the Job record status becomes `failed` with error type `EMPTY_CONTENT`
- **AND** the job is NOT retried

#### Scenario: No page snapshot received (NO_SNAPSHOT)

- **WHEN** the processor receives a job without a pageHtml field or with an empty one
- **THEN** the Job record status becomes `failed` with error type `NO_SNAPSHOT`
- **AND** the job is NOT retried

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
