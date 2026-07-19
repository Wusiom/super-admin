## ADDED Requirements

### Requirement: User-Derived Note Draft
The system SHALL create an atomic-note draft only from the authenticated user's own tutoring answer and confirmed context, and SHALL preserve references to that answer and the supporting source anchors.

#### Scenario: Draft a note from an answer
- **WHEN** a tutoring turn contains a coherent user explanation suitable for reuse
- **THEN** the Agent may propose a title, atomic claim, context, and source references
- **AND** stores the result as an unconfirmed draft

#### Scenario: Source summary has no user explanation
- **WHEN** the Agent has source text but no corresponding user explanation
- **THEN** it does not create an atomic-note draft from the source summary alone

### Requirement: Explicit Note Confirmation
The system SHALL require explicit user confirmation before an atomic note becomes part of the note library.

#### Scenario: Confirm an edited draft
- **WHEN** a user edits a draft and confirms save
- **THEN** the system stores the edited note as confirmed
- **AND** preserves its provenance to the source version, anchors, answer, and confirmation time

#### Scenario: Reject a draft
- **WHEN** a user discards a draft
- **THEN** the draft does not appear in the confirmed note library or Markdown export

### Requirement: Atomic Note Quality
Each confirmed note SHALL express one reusable claim with enough context and boundary conditions to be understood independently of the original tutoring conversation.

#### Scenario: Draft contains multiple independent claims
- **WHEN** structure validation detects multiple independently reusable claims in one draft
- **THEN** the Agent proposes separate drafts
- **AND** the user confirms or rejects each draft independently

#### Scenario: Draft lacks context
- **WHEN** a draft cannot be understood without the original conversation
- **THEN** the system requests clarification or proposes missing context before confirmation

### Requirement: Confirmed Link Suggestions
The system SHALL suggest no more than three relevant links from a note to existing confirmed notes, and SHALL require confirmation for each link.

#### Scenario: Accept a suggested link
- **WHEN** a user confirms a suggested relationship and relation type
- **THEN** the system creates the link between two notes owned by that user

#### Scenario: Suggested target belongs to another user
- **WHEN** a link target is not owned by the current user
- **THEN** the system rejects the suggestion and discloses no target content

### Requirement: Markdown Note Export
The system SHALL export only the current user's confirmed notes, confirmed links, and provenance metadata as Markdown.

#### Scenario: Export confirmed notes
- **WHEN** a user requests Markdown export
- **THEN** the generated file includes confirmed note content and confirmed relationships
- **AND** excludes drafts, rejected links, other users' data, raw Graph State, and hidden prompts

#### Scenario: Export contains many notes
- **WHEN** an export exceeds the synchronous threshold
- **THEN** the system creates an asynchronous export job owned by the user
- **AND** provides a time-limited download when the job succeeds

### Requirement: Note Ownership and Deletion
The system SHALL enforce user ownership on note reads, mutations, links, exports, and deletion.

#### Scenario: Delete a confirmed note
- **WHEN** a user confirms deletion of an owned note
- **THEN** the note and its link edges are deleted
- **AND** the original learning evidence remains intact

