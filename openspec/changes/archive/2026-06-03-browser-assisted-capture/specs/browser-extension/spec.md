## ADDED Requirements

### Requirement: Popup UI for capture action
The extension SHALL provide a popup UI that is displayed when the user clicks the extension icon in the toolbar. The popup SHALL show the current tab's URL and action states.

#### Scenario: Extension not configured
- **WHEN** the extension has no API token configured in `chrome.storage.local`
- **THEN** the popup displays a message directing the user to the super-admin settings page to authorize the extension, with a button that opens the settings page

#### Scenario: Extension configured and ready
- **WHEN** the extension has a valid API token and backend URL configured
- **THEN** the popup displays the current page URL and a "采集" (Capture) button

#### Scenario: Capture in progress
- **WHEN** the user clicks "采集" on a configured extension
- **THEN** the popup displays a loading state while the capture request is in flight

#### Scenario: Capture successful
- **WHEN** the backend responds with a job ID
- **THEN** the popup displays "已提交 (任务 #N)" with a "查看任务" link pointing to the JobCenter page, and automatically closes after 5 seconds

#### Scenario: Capture failed
- **WHEN** the backend responds with an error or is unreachable
- **THEN** the popup displays a contextual error message (connection failure, auth failure, or generic error) and remains open for the user to retry

#### Scenario: Popup auto-close on success
- **WHEN** the popup shows success state
- **THEN** it SHALL close automatically after 5 seconds

### Requirement: Login state extraction
The extension SHALL extract the current page's cookies and localStorage when the user initiates a capture, and SHALL NOT persist them to any storage.

#### Scenario: Cookie extraction
- **WHEN** the user clicks "采集" on a configured extension
- **THEN** the service worker calls `chrome.cookies.getAll({url: tab.url})` and includes the result in the capture request payload

#### Scenario: localStorage extraction via content script
- **WHEN** the service worker needs localStorage data for the current page
- **THEN** it injects `content-script.js` into the current tab via `chrome.scripting.executeScript` and receives serialized localStorage data via `chrome.tabs.sendMessage`

#### Scenario: localStorage serialization correctness
- **WHEN** content-script.js serializes `localStorage`
- **THEN** it SHALL traverse the Storage interface using `storage.length`, `storage.key(i)`, and `storage.getItem(key)` to produce a plain object, rather than calling `JSON.stringify(localStorage)` directly

#### Scenario: Credentials never persisted
- **WHEN** cookies and localStorage are extracted from the current page
- **THEN** they SHALL only exist in memory during the capture request and SHALL NOT be written to `chrome.storage` or any persistent storage

### Requirement: External configuration via Web push
The extension SHALL accept configuration (API token and backend URL) from the super-admin web app via `chrome.runtime.onMessageExternal`, and persist it to `chrome.storage.local`.

#### Scenario: Receive configuration from Web app
- **WHEN** the super-admin settings page sends `{ action: 'setConfig', token, backendUrl }` via `chrome.runtime.sendMessage`
- **THEN** the service worker stores the token and backendUrl in `chrome.storage.local` and responds with `{ success: true }`

#### Scenario: Reject unknown external messages
- **WHEN** the extension receives an external message with an unrecognized action
- **THEN** the service worker does nothing and responds with `{ success: false }`

### Requirement: Backward-compatible capture request format
The extension SHALL send capture requests in the same JSON format as the existing `CapturePage.vue` web form.

#### Scenario: Capture request payload format
- **WHEN** the extension sends a capture request to `POST /api/tools/knowledge-capture/capture`
- **THEN** the request body contains `url` (string), `cookies` (JSON-encoded string), and `localStorage` (JSON-encoded string), with `Authorization: Bearer <token>` header

#### Scenario: Request timeout handling
- **WHEN** a capture request exceeds 4 minutes without response
- **THEN** the extension cancels the request and displays a message directing the user to check results in the Web frontend

### Requirement: Manifest V3 compliance
The extension SHALL be a Manifest V3 Chrome extension with minimal permissions.

#### Scenario: Permissions declaration
- **WHEN** the extension is loaded in Chrome
- **THEN** manifest.json declares permissions: `activeTab`, `storage`, `cookies`, `scripting`; and `externally_connectable.matches` includes both localhost and production frontend origins

#### Scenario: Fixed extension ID
- **WHEN** the extension is built for developer mode loading
- **THEN** manifest.json contains a `"key"` field derived from a PEM public key, ensuring a stable extension ID
