## MODIFIED Requirements

### Requirement: Login state extraction
The extension SHALL extract the current page's cookies, localStorage, and rendered page HTML snapshot when the user initiates a capture, and SHALL NOT persist target-site credentials or page snapshots to extension storage.

#### Scenario: Cookie extraction
- **WHEN** the user clicks "采集" on a configured extension
- **THEN** the service worker calls `chrome.cookies.getAll({url: tab.url})` and includes the result in the capture request payload

#### Scenario: localStorage extraction via content script
- **WHEN** the service worker needs localStorage data for the current page
- **THEN** it requests serialized localStorage from `content-script.js`
- **AND** the content script traverses the Storage interface using `storage.length`, `storage.key(i)`, and `storage.getItem(key)` to produce a plain object

#### Scenario: Rendered page snapshot extraction via content script
- **WHEN** the user clicks "采集" on a configured extension
- **THEN** the service worker requests the current page snapshot from `content-script.js`
- **AND** the snapshot includes rendered HTML from `document.documentElement.outerHTML`

#### Scenario: Direct tab read fallback
- **WHEN** content-script messaging fails or returns no page snapshot
- **THEN** the service worker uses `chrome.scripting.executeScript` in the active tab to read localStorage and rendered page HTML directly
- **AND** the capture request includes the direct-read page snapshot when available

#### Scenario: Credentials and snapshots never persisted
- **WHEN** cookies, localStorage, and page HTML are extracted from the current page
- **THEN** they SHALL only exist in memory during the capture request
- **AND** they SHALL NOT be written to `chrome.storage` or any persistent extension storage

### Requirement: Backward-compatible capture request format
The extension SHALL send capture requests to the existing capture endpoint while extending the JSON body with rendered page HTML snapshot data.

#### Scenario: Capture request payload format
- **WHEN** the extension sends a capture request to `POST /api/tools/knowledge-capture/capture`
- **THEN** the request body contains `url` (string), `cookies` (JSON-encoded string), `localStorage` (JSON-encoded string), and `pageHtml` when a snapshot is available
- **AND** the request includes `Authorization: Bearer <token>` header

#### Scenario: Snapshot payload size limit
- **WHEN** the rendered page HTML exceeds the extension snapshot size limit
- **THEN** the extension omits `pageHtml`
- **AND** the request includes snapshot metadata describing that the snapshot was truncated or omitted

#### Scenario: Request timeout handling
- **WHEN** a capture request exceeds 4 minutes without response
- **THEN** the extension cancels the request and displays a message directing the user to check results in the Web frontend
