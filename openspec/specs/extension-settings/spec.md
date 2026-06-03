## ADDED Requirements

### Requirement: Settings page route and navigation
The system SHALL provide a `/settings` page accessible from the sidebar navigation.

#### Scenario: Settings page accessible
- **WHEN** a logged-in user navigates to `/settings`
- **THEN** the page renders the extension authorization settings UI within the DefaultLayout

#### Scenario: Settings in sidebar
- **WHEN** the user views the sidebar navigation
- **THEN** a "设置" (Settings) entry is visible and links to `/settings`

### Requirement: Extension authorization button
The settings page SHALL provide a "授权此浏览器" button that fetches an API token and sends it to the Chrome extension.

#### Scenario: Authorize extension successfully
- **WHEN** the user clicks "授权此浏览器" with the Chrome extension installed
- **THEN** the page calls `GET /api/auth/token` to obtain a raw token, then calls `chrome.runtime.sendMessage(extId, { action: 'setConfig', token, backendUrl })`, and displays "✅ 扩展已授权"

#### Scenario: Extension not detected
- **WHEN** `chrome.runtime.sendMessage` fails or returns no response
- **THEN** the page displays "⚠️ 未检测到扩展，请确认扩展已安装" with installation instructions

#### Scenario: Backend URL auto-derivation
- **WHEN** the settings page sends configuration to the extension
- **THEN** the backend URL is derived automatically: `http://localhost:3000` for localhost frontend, or `window.location.origin` for other origins

### Requirement: Extension installation guidance
The settings page SHALL provide guidance for users who have not yet installed the extension.

#### Scenario: Installation instructions
- **WHEN** the settings page renders
- **THEN** it displays concise installation steps: (1) Load unpacked extension from `chrome://extensions/` in Developer Mode, (2) Select the `extension/` directory, (3) Return to this page and click "授权此浏览器"

### Requirement: CapturePage extension banner
The CapturePage SHALL display a banner recommending the Chrome extension for easier capture.

#### Scenario: Banner display
- **WHEN** the user visits CapturePage
- **THEN** a banner is displayed at the top: "💡 推荐使用 Chrome 扩展一键采集，无需手动配置 Cookie/Token。详见[安装指南]"

#### Scenario: Manual capture still functional
- **WHEN** the extension banner is displayed
- **THEN** the existing manual Cookie/Token input form remains fully functional below the banner
