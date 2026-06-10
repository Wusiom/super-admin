## MODIFIED Requirements

### Requirement: View Knowledge Item Detail

The system SHALL return the full content of a knowledge item including its Markdown body, and SHALL display it in a split-pane Markdown editor (left: source, right: rendered preview) instead of raw text.

#### Scenario: View existing item

- **WHEN** user requests `GET /api/tools/knowledge-capture/items/:id` for an existing item
- **THEN** the response includes all fields: id, title, url, source, contentHtml, contentMarkdown, status, capturedAt, createdAt

#### Scenario: Item not found

- **WHEN** user requests an item ID that does not exist
- **THEN** the response returns HTTP 404

#### Scenario: Display in split-pane editor

- **WHEN** user clicks a knowledge item row in the list
- **THEN** a dialog opens displaying the item title in the header
- **AND** the dialog body contains a split-pane Markdown editor with source on the left and rendered preview on the right
