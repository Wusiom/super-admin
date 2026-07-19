## ADDED Requirements

### Requirement: Unified Learning Source
The system SHALL represent captured Web articles, uploaded EPUB files, and uploaded text PDFs as user-owned `LearningSource` records with one or more immutable `SourceVersion` records.

#### Scenario: Captured article becomes a learning source
- **WHEN** an authenticated capture completes successfully
- **THEN** the system creates or updates a Web `LearningSource` owned by that user
- **AND** creates an immutable `SourceVersion` containing the extracted content and source metadata

#### Scenario: Same source changes later
- **WHEN** a user imports content whose canonical source already exists but whose normalized content hash is different
- **THEN** the system creates a new `SourceVersion`
- **AND** preserves learning evidence tied to earlier versions

### Requirement: Secure Book Upload
The system SHALL accept EPUB and text PDF uploads up to 50 MB and MUST validate declared MIME type, file extension, and file signature before persisting the object.

#### Scenario: Upload a valid EPUB
- **WHEN** an authenticated user uploads a file whose extension, MIME type, signature, and size match the EPUB policy
- **THEN** the system writes the object through the object-storage abstraction
- **AND** creates a pending source version and an asynchronous parsing job owned by that user

#### Scenario: Upload type mismatch
- **WHEN** a file extension, declared MIME type, or signature conflicts with the allowed format
- **THEN** the system returns `400 Bad Request`
- **AND** does not persist the object or create a parsing job

#### Scenario: Upload exceeds the size limit
- **WHEN** a user uploads a file larger than 50 MB
- **THEN** the system rejects the request before writing to object storage

### Requirement: Parsing and Quality State
The system SHALL expose file validation, text extraction, anchor generation, and content-map generation as observable asynchronous stages with recoverable failure information.

#### Scenario: Parse a text PDF successfully
- **WHEN** a queued text PDF contains sufficient extractable text
- **THEN** the system generates chapters or sections, paragraphs, stable source anchors, core concepts, dependencies, and proposed learning units
- **AND** marks the source version as ready for user review

#### Scenario: Reject a scanned PDF
- **WHEN** PDF quality diagnostics classify the file as scanned or without sufficient extractable text
- **THEN** the parsing job fails with `SCANNED_PDF_UNSUPPORTED`
- **AND** no content map or learning project is created

#### Scenario: Recover a retryable parser failure
- **WHEN** parsing fails because of a retryable infrastructure error
- **THEN** the source preserves its last completed stage
- **AND** an authorized retry resumes from an idempotent boundary without duplicating versions or anchors

### Requirement: Stable Source Anchors
The system SHALL assign anchors that uniquely identify a passage within a specific immutable source version, and every source-grounded evaluation SHALL reference anchors from the version being learned.

#### Scenario: Resolve an evaluation citation
- **WHEN** an evaluation contains a source anchor
- **THEN** the anchor resolves to an existing passage in the project's current source version

#### Scenario: Reject an invalid citation
- **WHEN** model output references a missing anchor or an anchor from another source version
- **THEN** structure validation fails
- **AND** no mastery evidence is written

### Requirement: User-Confirmed Content Map
The system SHALL present proposed concepts and learning units for user confirmation before a learning project can start.

#### Scenario: Confirm proposed units
- **WHEN** a user confirms the learning units and their order
- **THEN** the system persists the confirmed plan as part of the learning project
- **AND** permits the user to establish a learning contract

#### Scenario: Edit proposed units
- **WHEN** a user splits, merges, reorders, or skips proposed units
- **THEN** the system validates that retained units still reference valid source anchors
- **AND** saves only the user-confirmed plan

#### Scenario: Attempt to start without confirmation
- **WHEN** a user attempts to create a learning session before confirming units
- **THEN** the system rejects the request with a conflict error

### Requirement: Source Deletion Cleanup
The system SHALL delete a source and its dependent database records, stored objects, and LangGraph checkpoints without affecting another user's resources.

#### Scenario: Delete an owned source
- **WHEN** a user confirms deletion of an owned source
- **THEN** the system schedules or executes cleanup of versions, objects, projects, sessions, evidence, and checkpoints associated only with that source
- **AND** reports cleanup completion or a recoverable cleanup failure

