## ADDED Requirements

### Requirement: Update Knowledge Item Markdown

The system SHALL allow updating the `contentMarkdown` field of an existing knowledge item via `PUT /api/tools/knowledge-capture/items/:id`.

#### Scenario: Successful update

- **WHEN** user sends `PUT /api/tools/knowledge-capture/items/1` with body `{ "contentMarkdown": "# Updated content" }`
- **THEN** the knowledge item's `contentMarkdown` field is updated in the database
- **AND** the `updatedAt` timestamp is set to the current time
- **AND** the response returns HTTP 200 with the updated item including `id`, `title`, `contentMarkdown`, `updatedAt`

#### Scenario: Item not found

- **WHEN** user sends `PUT /api/tools/knowledge-capture/items/999` for a non-existent item
- **THEN** the response returns HTTP 404 with body `{ "message": "Knowledge item not found" }`

#### Scenario: Missing contentMarkdown

- **WHEN** user sends `PUT /api/tools/knowledge-capture/items/1` with an empty or missing `contentMarkdown` field
- **THEN** the response returns HTTP 400 with body `{ "message": "contentMarkdown is required" }`

#### Scenario: Empty contentMarkdown is valid

- **WHEN** user sends `PUT /api/tools/knowledge-capture/items/1` with `{ "contentMarkdown": "" }`
- **THEN** the knowledge item's `contentMarkdown` is updated to an empty string
- **AND** the response returns HTTP 200
