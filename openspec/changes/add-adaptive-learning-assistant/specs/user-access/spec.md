## ADDED Requirements

### Requirement: Email Account Lifecycle
The system SHALL support account registration, email verification, login, logout, password recovery, and password reset without exposing whether an unrelated email address exists.

#### Scenario: Register and verify an account
- **WHEN** a visitor submits a valid unique email and password
- **THEN** the system creates an unverified account with an Argon2id password hash
- **AND** sends a time-limited verification link through `MailService`
- **AND** prevents login until the link is successfully redeemed

#### Scenario: Verification token is invalid or expired
- **WHEN** a visitor submits an invalid, already-used, or expired verification token
- **THEN** the system rejects verification without activating the account
- **AND** offers a rate-limited way to request a new link

#### Scenario: Request password reset
- **WHEN** a visitor submits an email to the password recovery endpoint
- **THEN** the response is identical whether or not the email exists
- **AND** an existing verified account receives a single-use, time-limited reset link

### Requirement: Revocable Web Session
The system SHALL authenticate Web users with a short-lived access token and a hashed, rotating refresh token that can be revoked per session or for all sessions belonging to a user.

#### Scenario: Refresh a valid session
- **WHEN** a client presents a valid unused refresh token
- **THEN** the system invalidates that refresh token
- **AND** returns a new access token and new refresh token
- **AND** persists only the hash of the new refresh token

#### Scenario: Reuse a rotated refresh token
- **WHEN** a client presents a refresh token that has already been rotated or revoked
- **THEN** the system returns `401 Unauthorized`
- **AND** revokes the affected refresh-token family

#### Scenario: Logout all sessions
- **WHEN** a user or authorized administrator revokes all sessions for that user
- **THEN** all current refresh tokens for the user become invalid
- **AND** existing access tokens cannot be refreshed after they expire

### Requirement: Two-Level Role Authorization
The system SHALL support `USER` and `ADMIN` roles and SHALL enforce administrative authorization on the server for every `/api/admin/*` operation.

#### Scenario: User opens the learning workspace
- **WHEN** an authenticated `USER` navigates to `/learning`
- **THEN** the learning workspace is available
- **AND** the “后台管理” menu is not rendered

#### Scenario: User attempts an administrative request
- **WHEN** an authenticated `USER` requests any `/api/admin/*` endpoint or `/admin/*` page
- **THEN** the server returns `403 Forbidden`
- **AND** no administrative data is returned

#### Scenario: Administrator uses both workspaces
- **WHEN** an authenticated `ADMIN` loads the application
- **THEN** both “学习助手” and “后台管理” menus are rendered
- **AND** the administrator can use the learning workspace as an ordinary resource owner

### Requirement: Resource Ownership Isolation
The system SHALL scope sources, projects, sessions, evidence, learner profiles, notes, exports, and extension tokens to the authenticated owner's `userId`.

#### Scenario: Read an owned resource
- **WHEN** a user requests a resource ID that belongs to the same authenticated `userId`
- **THEN** the system returns the resource subject to its normal capability rules

#### Scenario: Attempt cross-user access by ID
- **WHEN** a user requests or mutates a resource ID that belongs to another user
- **THEN** the system returns `404 Not Found` or `403 Forbidden` according to the endpoint policy
- **AND** does not disclose the other user's content or ownership metadata

#### Scenario: Model output contains identity claims
- **WHEN** model output or source content includes a user ID, role, or permission claim
- **THEN** the system ignores that claim for authorization
- **AND** uses only the trusted authentication context

### Requirement: Protected Administrator Lifecycle
The system SHALL allow administrators to search users, change roles, disable or restore accounts, and revoke sessions while preserving at least one enabled administrator.

#### Scenario: Change a user role
- **WHEN** an administrator changes a user's role and supplies a reason
- **THEN** the system applies the role change
- **AND** revokes the target user's sessions
- **AND** records an audit event with actor, target, old role, new role, reason, and result

#### Scenario: Attempt to remove the last administrator
- **WHEN** an operation would disable or demote the last enabled `ADMIN`
- **THEN** the system rejects the operation with a conflict error
- **AND** records the rejected attempt in the audit log

