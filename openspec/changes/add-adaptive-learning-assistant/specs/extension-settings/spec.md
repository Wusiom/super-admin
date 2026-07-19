## ADDED Requirements

### Requirement: Extension Token Inventory
The settings page SHALL list the current user's extension-token metadata and allow independent revocation without displaying raw token values.

#### Scenario: List authorized extension tokens
- **WHEN** an authenticated user opens extension settings
- **THEN** the page displays token label, scopes, creation time, last-used time, and revoked status for that user only
- **AND** never displays a raw token after creation

#### Scenario: Revoke an extension token
- **WHEN** a user confirms revocation of an owned token
- **THEN** the token is revoked and the page shows that reauthorization is required for the affected browser

## MODIFIED Requirements

### Requirement: Settings page route and navigation
The system SHALL provide an authenticated `/settings` page from the sidebar with account, session, and Chrome extension authorization settings appropriate to the current user.

#### Scenario: Settings page accessible
- **WHEN** an authenticated user navigates to `/settings`
- **THEN** the page renders account and extension-token controls within the application layout

#### Scenario: Settings in sidebar
- **WHEN** an authenticated user views the sidebar
- **THEN** a “设置” entry is visible and links to `/settings`

### Requirement: Extension authorization button
The settings page SHALL authorize the browser by creating a user-owned token with `capture:create` scope and sending the one-time raw value to the installed Chrome extension.

#### Scenario: Authorize extension successfully
- **WHEN** the user clicks authorize, supplies a token label, and the extension is installed
- **THEN** the page creates a `capture:create` token for the current user
- **AND** sends `{ action: "setConfig", token, backendUrl }` to the configured extension ID
- **AND** discards the raw token from Web application state after acknowledged delivery
- **AND** displays the authorized token metadata

#### Scenario: Extension not detected after token creation
- **WHEN** token creation succeeds but extension messaging fails or returns no acknowledgement
- **THEN** the page warns that the extension was not authorized
- **AND** offers immediate revocation of the newly created token
- **AND** displays installation guidance

#### Scenario: Backend URL auto-derivation
- **WHEN** the page sends configuration to the extension
- **THEN** the backend URL is derived from the approved environment configuration or current origin
- **AND** cannot be overridden by untrusted page content

### Requirement: Extension installation guidance
The settings page SHALL provide concise installation and reauthorization instructions without requiring users to manually copy a global administrator token.

#### Scenario: Installation instructions
- **WHEN** no authorized extension token exists or the extension is not detected
- **THEN** the page explains how to install the unpacked extension, return to settings, label the browser, and authorize it

### Requirement: CapturePage extension banner
The capture page SHALL recommend the Chrome extension while preserving permitted manual capture behavior for the authenticated user.

#### Scenario: Banner display
- **WHEN** the user visits the capture page
- **THEN** the page links to extension installation and user-token authorization settings

#### Scenario: Manual capture still functional
- **WHEN** the banner is displayed
- **THEN** the existing permitted manual capture workflow remains available
- **AND** resulting content is assigned to the authenticated Web user

