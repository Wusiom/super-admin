## MODIFIED Requirements

### Requirement: Create Capture Job

The system SHALL create asynchronous knowledge capture jobs from Chrome extension capture requests. The request MUST include a valid URL and MAY include rendered page HTML, cookies, and localStorage captured from the active browser tab.

#### Scenario: Submit extension capture request with page snapshot

- **WHEN** the extension submits `POST /api/tools/knowledge-capture/capture` with body containing `url`, `pageHtml`, `cookies`, and `localStorage`
- **THEN** a new Job record is created with `toolKey = "knowledge-capture"` and the submitted payload in `input`
- **AND** the job starts processing asynchronously
- **AND** the response returns `{ "jobId": <id> }` with HTTP 201

#### Scenario: Submit extension capture request without page snapshot

- **WHEN** the extension submits a valid capture request with `url` but no usable `pageHtml`
- **THEN** a new Job record is created
- **AND** the job remains eligible for Playwright fallback processing
- **AND** diagnostics for the job indicate that page snapshot was not received

#### Scenario: Submit invalid URL

- **WHEN** user submits a capture request with a malformed URL (e.g. `{ "url": "not-a-url" }`)
- **THEN** the system returns HTTP 400 with an error message "Invalid URL format"
- **AND** no Job record is created

#### Scenario: Submit empty URL

- **WHEN** user submits a capture request with an empty or missing `url` field
- **THEN** the system returns HTTP 400 with validation error details

### Requirement: Execute Capture via Playwright

The capture processor SHALL prefer rendered page HTML snapshots when available, extract the main content using Mozilla Readability, convert the result to Markdown, and create a KnowledgeItem. If no usable snapshot is available, the processor SHALL fall back to Playwright navigation using submitted cookies and localStorage.

#### Scenario: Successful snapshot capture

- **WHEN** a capture job contains valid `pageHtml` from the active tab
- **THEN** the processor extracts article content directly from `pageHtml`
- **AND** the extracted HTML is converted to Markdown using Turndown or equivalent
- **AND** a KnowledgeItem record is created with title, url, source, contentHtml, contentMarkdown, status="published", and jobId
- **AND** the Job record is updated to status `success` with `output = { "itemId": <knowledgeItemId> }`

#### Scenario: Successful Playwright fallback capture

- **WHEN** a capture job does not contain usable `pageHtml`
- **THEN** Playwright navigates to the URL, applies submitted cookies/localStorage when present, and waits for page loading
- **AND** the processor repeatedly attempts extraction until article content is available or the fallback timeout expires
- **AND** a successful extraction creates a KnowledgeItem and marks the Job `success`

#### Scenario: Locked or subscription-only content detected

- **WHEN** extracted article content contains a login, subscription, or unlock-full-content prompt instead of article text
- **THEN** the Job record status becomes `failed` with error type `LOCKED_CONTENT`
- **AND** no KnowledgeItem is created

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
- **AND** the job is NOT retried automatically
- **AND** no KnowledgeItem is created

#### Scenario: Page blocks the bot (BLOCKED)

- **WHEN** the target page returns a CAPTCHA, 403, or bot detection challenge
- **THEN** the Job record status becomes `failed` with error type `BLOCKED`
- **AND** the job is NOT retried automatically

#### Scenario: Extracted content is empty (EMPTY_CONTENT)

- **WHEN** Readability extracts content but the result is empty or contains only navigation text
- **THEN** the Job record status becomes `failed` with error type `EMPTY_CONTENT`
- **AND** the job is NOT retried automatically

#### Scenario: Chromium crash (BROWSER_CRASH)

- **WHEN** the Chromium process crashes during capture
- **THEN** the Job record status becomes `failed` with error type `BROWSER_CRASH`
- **AND** BullMQ retries up to 2 times

## ADDED Requirements

### Requirement: Job diagnostics for capture console
The system SHALL expose normalized diagnostics for knowledge capture jobs so the frontend can render task details without parsing raw job payloads.

#### Scenario: Diagnostics for failed capture
- **WHEN** the console requests jobs and a job has failed
- **THEN** each job includes diagnostics with url, hasPageHtml, pageHtmlSize, cookieCount, localStorageKeyCount, error, and suggestion

#### Scenario: Diagnostics for successful capture
- **WHEN** the console requests jobs and a job has a related KnowledgeItem
- **THEN** diagnostics include itemId, itemTitle, markdownLength, htmlLength, and capturedAt

#### Scenario: Diagnostics hide raw credentials
- **WHEN** job diagnostics are returned
- **THEN** the response MUST NOT include raw cookie values, localStorage values, or full pageHtml content inside the diagnostics object
