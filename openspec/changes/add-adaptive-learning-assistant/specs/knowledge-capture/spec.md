## MODIFIED Requirements

### Requirement: Create Capture Job
The system SHALL allow the Chrome extension to submit a rendered page snapshot using a valid user-owned API Token with `capture:create` scope. The request MUST include a valid URL and non-empty page HTML, and every created job MUST be owned by the authenticated token user.

#### Scenario: Submit page snapshot for capture
- **WHEN** the extension submits `POST /api/tools/knowledge-capture/capture` with a valid scoped Bearer token, URL, and page HTML
- **THEN** a user-owned Job record is created with `toolKey="knowledge-capture"` and `status="running"`
- **AND** the capture processor runs inline
- **AND** the response returns `201 Created` with the job ID

#### Scenario: Submit without pageHtml
- **WHEN** an authenticated capture request omits page HTML or submits empty page HTML
- **THEN** a user-owned Job is created as failed with error category `NO_SNAPSHOT`
- **AND** no learning source is created

#### Scenario: Submit invalid URL
- **WHEN** an authenticated user submits a malformed URL
- **THEN** the system returns `400 Bad Request`
- **AND** creates no Job or learning source

#### Scenario: Submit empty URL
- **WHEN** an authenticated user omits the URL or submits an empty URL
- **THEN** the system returns `400 Bad Request` with validation details
- **AND** creates no Job

#### Scenario: Token lacks capture scope
- **WHEN** the extension submits a valid token without `capture:create` scope
- **THEN** the system returns `403 Forbidden`
- **AND** creates no Job or learning source

### Requirement: Execute Capture from Page Snapshot
The capture processor SHALL parse the submitted page snapshot with JSDOM, extract primary content with Mozilla Readability, convert it to Markdown with Turndown, and store the result as a versioned user-owned learning source without launching a server-side browser.

#### Scenario: Successful page capture
- **WHEN** the capture processor receives a valid snapshot and Readability extracts sufficient content
- **THEN** the system creates or versions a Web `LearningSource` owned by the Job user
- **AND** stores title, canonical URL, extracted HTML, Markdown, content hash, source anchors, and capture metadata in a `SourceVersion`
- **AND** marks the Job successful with sanitized output containing the source and version IDs

#### Scenario: Readability extraction fails (EXTRACTION_FAILED)
- **WHEN** page HTML is valid but Readability cannot identify primary content
- **THEN** the Job fails with `EXTRACTION_FAILED` and `retryEligible=false`
- **AND** no learning source version is created

#### Scenario: Page is a CAPTCHA or verification page (BLOCKED)
- **WHEN** page HTML matches CAPTCHA, verification, or access-denied patterns
- **THEN** the Job fails with `BLOCKED` and `retryEligible=false`
- **AND** no learning source version is created

#### Scenario: Page requires login or subscription (LOCKED_CONTENT)
- **WHEN** page HTML matches a login wall or paywall pattern
- **THEN** the Job fails with `LOCKED_CONTENT`
- **AND** no learning source version is created

#### Scenario: Extracted content is empty (EMPTY_CONTENT)
- **WHEN** extracted content is empty or below the configured quality threshold
- **THEN** the Job fails with `EMPTY_CONTENT` and `retryEligible=false`
- **AND** no learning source version is created

#### Scenario: No page snapshot received (NO_SNAPSHOT)
- **WHEN** the processor receives missing or empty page HTML
- **THEN** the Job fails with `NO_SNAPSHOT` and `retryEligible=false`

### Requirement: List Knowledge Items
The legacy knowledge-item list endpoint SHALL return a compatibility projection of the authenticated user's captured Web learning sources and SHALL never return another user's sources.

#### Scenario: Query first page of items
- **WHEN** an authenticated user requests `GET /api/tools/knowledge-capture/items?page=1&pageSize=20`
- **THEN** the response contains up to 20 Web sources owned by that user ordered by capture time descending
- **AND** each item includes compatibility fields plus its learning-source ID and current processing status
- **AND** the response includes the owner-scoped total count

#### Scenario: Empty knowledge base
- **WHEN** the authenticated user owns no captured Web sources
- **THEN** the response returns an empty array and total count zero even if other users own sources

### Requirement: View Knowledge Item Detail
The legacy detail endpoint SHALL return a compatibility projection of the latest version of an authenticated user's captured Web source.

#### Scenario: View existing item
- **WHEN** a user requests an owned captured-source ID
- **THEN** the response includes permitted compatibility fields, extracted content, source-version ID, status, and timestamps

#### Scenario: Item not found
- **WHEN** the requested source does not exist or belongs to another user
- **THEN** the response returns `404 Not Found`
- **AND** discloses no ownership information

### Requirement: Delete Knowledge Item
The legacy delete endpoint SHALL delete an authenticated user's captured Web source through the unified source-cleanup workflow.

#### Scenario: Delete existing item
- **WHEN** a user confirms deletion of an owned captured Web source
- **THEN** the system deletes or schedules deletion of its versions, dependent learning data, stored objects, and checkpoints
- **AND** returns the cleanup result according to the unified source contract

#### Scenario: Delete non-existent item
- **WHEN** the source does not exist or belongs to another user
- **THEN** the response returns `404 Not Found`
- **AND** deletes nothing

