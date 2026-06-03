## ADDED Requirements

### Requirement: ApiToken database model
The system SHALL persist API tokens as SHA-256 hashed values in a new `ApiToken` table.

#### Scenario: Token table schema
- **WHEN** the database schema is applied
- **THEN** an `ApiToken` table exists with columns: `id` (auto-increment), `token` (SHA-256 hash, unique), `label` (string), `createdAt` (datetime)

#### Scenario: No plaintext token storage
- **WHEN** a token is stored in the database
- **THEN** only the SHA-256 hash of the raw token is persisted; the raw token itself is never written to disk

### Requirement: Automatic token generation on first start
The system SHALL automatically generate an API token on first startup if none exists.

#### Scenario: First startup token generation
- **WHEN** the server starts and no ApiToken record exists in the database
- **THEN** the system generates a 64-character hex token via `crypto.randomBytes(32)`, stores its SHA-256 hash in the database, and prints the raw token to the console

#### Scenario: Subsequent startup no regeneration
- **WHEN** the server starts and an ApiToken record already exists
- **THEN** the system does NOT generate a new token; the existing token continues to function

### Requirement: Token refresh endpoint
The system SHALL provide a `GET /api/auth/token` endpoint that generates a new token and invalidates the old one.

#### Scenario: Generate new token
- **WHEN** a user calls `GET /api/auth/token` (authenticated via session or development bypass in MVP)
- **THEN** the system generates a new raw token, stores its SHA-256 hash in the database (overwriting the previous value), and returns the raw token in the response body as `{ "token": "..." }`

#### Scenario: Old token invalidated on refresh
- **WHEN** a new token is generated via `GET /api/auth/token`
- **THEN** the previous token immediately becomes invalid for API authentication

### Requirement: Bearer token authentication guard
The system SHALL protect API endpoints with a guard that validates Bearer tokens against the ApiToken database.

#### Scenario: Valid token access
- **WHEN** a request includes `Authorization: Bearer <valid-raw-token>` header
- **THEN** the guard computes SHA-256 of the token, finds a matching record in ApiToken table, and allows the request to proceed

#### Scenario: Invalid token rejection
- **WHEN** a request includes an invalid or expired Bearer token
- **THEN** the guard responds with `401 Unauthorized` and `{ "statusCode": 401, "message": "Invalid API token" }`

#### Scenario: Missing token rejection
- **WHEN** a request has no Authorization header
- **THEN** the guard responds with `401 Unauthorized`

### Requirement: Capture endpoint guard integration
The capture endpoint SHALL use the ApiTokenGuard to authenticate extension-originated requests.

#### Scenario: Extension capture with valid token
- **WHEN** the Chrome extension sends `POST /api/tools/knowledge-capture/capture` with a valid Bearer token
- **THEN** the request is processed normally and returns `201 Created` with `{ "jobId": <id> }`

#### Scenario: Extension capture without token
- **WHEN** the Chrome extension sends `POST /api/tools/knowledge-capture/capture` without a valid token
- **THEN** the request returns `401 Unauthorized`

#### Scenario: Web frontend capture unaffected
- **WHEN** the existing CapturePage.vue (session-authenticated user) sends a capture request
- **THEN** the request continues to work normally — the guard is added alongside existing authentication, not as a replacement
