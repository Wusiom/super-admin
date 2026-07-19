## ADDED Requirements

### Requirement: User-Managed Scoped API Token
The system SHALL allow an authenticated user to create, list, label, and revoke multiple API Tokens with explicitly allowed scopes, and SHALL display the raw token only once at creation.

#### Scenario: Create a capture token
- **WHEN** an authenticated user creates a token with label and `capture:create` scope
- **THEN** the system generates a cryptographically random raw token
- **AND** stores only its SHA-256 hash, owner, label, scopes, creation time, and revocation metadata
- **AND** returns the raw token exactly once

#### Scenario: List user tokens
- **WHEN** a user lists API Tokens
- **THEN** the response contains only that user's token metadata and last-used time
- **AND** contains no raw token or reusable hash

#### Scenario: Revoke a token
- **WHEN** a user revokes an owned token
- **THEN** subsequent requests using that token return `401 Unauthorized`
- **AND** other tokens owned by the user remain valid

## MODIFIED Requirements

### Requirement: ApiToken database model
The system SHALL persist API Tokens as SHA-256 hashes with user ownership, labels, scopes, lifecycle timestamps, and optional revocation metadata.

#### Scenario: Token table schema
- **WHEN** the database schema is applied
- **THEN** `ApiToken` contains an ID, unique token hash, `userId`, label, scopes, created time, last-used time, and revoked time
- **AND** the owner relation is indexed for token management

#### Scenario: No plaintext token storage
- **WHEN** a token is created or used
- **THEN** the raw token is never written to database, log, audit event, job metadata, or error response

### Requirement: Bearer token authentication guard
The system SHALL validate Bearer tokens by hash, reject revoked tokens, attach the token owner and scopes to a trusted request context, and enforce endpoint-required scopes.

#### Scenario: Valid scoped token access
- **WHEN** a request presents a valid non-revoked token containing every required scope
- **THEN** the guard authenticates the token owner and allows the request
- **AND** updates last-used metadata without exposing the raw token

#### Scenario: Valid token lacks required scope
- **WHEN** a valid token does not contain an endpoint's required scope
- **THEN** the guard returns `403 Forbidden`

#### Scenario: Invalid or revoked token
- **WHEN** a request presents an unknown, malformed, or revoked token
- **THEN** the guard returns `401 Unauthorized` with a generic invalid-token response

#### Scenario: Missing token on token-protected endpoint
- **WHEN** an extension-only endpoint receives no Bearer token
- **THEN** the guard returns `401 Unauthorized`

### Requirement: Capture endpoint guard integration
The capture endpoint SHALL require a valid user-owned token with `capture:create` scope and SHALL assign all resulting jobs and sources to that token user.

#### Scenario: Extension capture with valid token
- **WHEN** the extension sends a valid `capture:create` Bearer token and valid snapshot
- **THEN** the capture executes under the token owner's identity
- **AND** every created Job, LearningSource, and SourceVersion is owned by that user

#### Scenario: Extension capture without token
- **WHEN** the extension sends no valid Bearer token
- **THEN** the request returns `401 Unauthorized`
- **AND** creates no data

#### Scenario: Web frontend capture
- **WHEN** a Web-session-authenticated user invokes an endpoint that explicitly supports Web capture
- **THEN** the operation uses the Web user's trusted identity and normal authorization
- **AND** does not mint or simulate an API Token

## REMOVED Requirements

### Requirement: Automatic token generation on first start
**Reason**: A global platform token cannot provide user ownership, least privilege, independent revocation, or safe multi-user capture.

**Migration**: Revoke the legacy token during migration. Each user must create a new `capture:create` token and reauthorize the extension.

### Requirement: Token refresh endpoint
**Reason**: Overwriting one global token would invalidate every user's extension and cannot support multiple devices or labels.

**Migration**: Replace `GET /api/auth/token` with authenticated create/list/revoke token endpoints. Existing settings UI must use the new user-owned token lifecycle.

