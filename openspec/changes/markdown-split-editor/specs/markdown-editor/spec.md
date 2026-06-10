## ADDED Requirements

### Requirement: Split-pane Markdown Editor Component

The system SHALL provide a reusable `MarkdownEditor` Vue component that renders a split-pane layout: left pane for editing Markdown source via CodeMirror 6, right pane for previewing rendered Markdown. The component MUST always be in split mode with no mode toggle.

#### Scenario: Component renders in split mode

- **WHEN** `MarkdownEditor` mounts with a non-empty `modelValue`
- **THEN** the left pane displays the provided Markdown source text in a CodeMirror 6 editor
- **AND** the right pane displays the rendered HTML preview
- **AND** both panes are visible at equal width

#### Scenario: v-model two-way binding

- **WHEN** user types in the left editor pane
- **THEN** the component emits `update:modelValue` with the updated content
- **AND** the right preview pane reflects the changes in real time

#### Scenario: Ctrl+S triggers save event

- **WHEN** user presses `Ctrl+S` (or `Cmd+S` on Mac) while focused in the editor
- **THEN** the default browser save dialog is prevented
- **AND** the component emits a `save` event

#### Scenario: Component accepts configurable height

- **WHEN** `MarkdownEditor` is created with `height="60vh"` prop
- **THEN** the editor container height is set to 60vh
- **WHEN** no height prop is provided
- **THEN** the default height is 60vh

#### Scenario: Code syntax highlighting in preview

- **WHEN** the Markdown source contains a fenced code block with a language identifier (e.g. `javascript`)
- **THEN** the preview pane displays the code block with syntax-highlighted tokens

### Requirement: Full-screen Edit Page

The system SHALL provide a full-screen edit page at route `/knowledge/edit/:id` that loads and displays a knowledge item's Markdown content in a split-pane editor.

#### Scenario: Page loads item content

- **WHEN** user navigates to `/knowledge/edit/1` for an existing item
- **THEN** the page fetches `GET /api/tools/knowledge-capture/items/1`
- **AND** the title is displayed in the top bar
- **AND** the Markdown content is loaded into the editor

#### Scenario: Page handles missing item

- **WHEN** user navigates to `/knowledge/edit/999` for a non-existent item
- **THEN** an error message is displayed
- **AND** a link or button to return to the list is shown

#### Scenario: Ctrl+S saves and shows feedback

- **WHEN** user edits content and presses `Ctrl+S`
- **THEN** the updated content is sent via `PUT /api/tools/knowledge-capture/items/:id`
- **AND** a success toast ("保存成功") is displayed

#### Scenario: Unsaved changes prompt on leave

- **WHEN** user has unsaved changes and attempts to navigate away (close tab, back button)
- **THEN** the browser `beforeunload` event triggers a confirmation dialog

### Requirement: Dialog Full-screen Entry

The system SHALL provide a "全屏" button in the knowledge detail dialog title bar that navigates to the full-screen edit page.

#### Scenario: Full-screen button navigates to edit page

- **WHEN** user clicks the "全屏" button while viewing a knowledge item in the dialog
- **THEN** the browser navigates to `/knowledge/edit/<id>` for the current item

### Requirement: Unsaved Changes Detection in Dialog

When editing markdown content inside the dialog and the content differs from the originally loaded value, the system SHALL detect "dirty" state and prompt before closing.

#### Scenario: Close unsaved dialog — user confirms discard

- **WHEN** the dialog contains unsaved edits
- **AND** user clicks the close button
- **THEN** an `ElMessageBox.confirm` dialog appears asking "有未保存的更改，确定关闭？"
- **WHEN** user confirms
- **THEN** the dialog closes and changes are discarded

#### Scenario: Close unsaved dialog — user cancels

- **WHEN** the dialog contains unsaved edits
- **AND** user clicks the close button
- **AND** user cancels the confirm dialog
- **THEN** the dialog stays open with edits preserved
