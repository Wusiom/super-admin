## ADDED Requirements

### Requirement: Extension-only capture console
The system SHALL provide a knowledge capture page that presents Chrome extension capture as the only primary capture workflow.

#### Scenario: Use knowledge capture as visible page title
- **WHEN** the user opens the extension-only capture page
- **THEN** the visible page title is "知识采集"
- **AND** the UI does not require users to learn a separate "采集控制台" concept

#### Scenario: Show usage instructions in page subtitle
- **WHEN** the user opens the knowledge capture page
- **THEN** the page subtitle directly explains the operation: "打开目标网页并确认正文完整显示后，点击 Chrome 扩展按钮采集。"
- **AND** the subtitle does not use vague descriptive copy such as "通过 Chrome 扩展采集当前网页内容"

#### Scenario: Display extension capture guidance
- **WHEN** the user opens the knowledge capture page
- **THEN** the page displays instructions to open the target page, confirm the full article is visible, and click the Super Admin Chrome extension button
- **AND** the page does not present a manual URL form as the primary capture action

#### Scenario: Manual URL entry is not a primary workflow
- **WHEN** manual URL capture remains available for debugging or public pages
- **THEN** it MUST be hidden behind an advanced/public-page-only affordance
- **AND** it MUST explain that authenticated, paid, or subscription content requires extension capture

### Requirement: Capture dashboard metrics
The page SHALL show high-level capture metrics above the task table.

#### Scenario: Display task metric cards
- **WHEN** the page loads
- **THEN** it displays cards for total captured items, running tasks, recent success rate, and failed tasks
- **AND** each card uses job and knowledge item data returned by the backend

#### Scenario: Dashboard appears before task list
- **WHEN** the page renders
- **THEN** dashboard metric cards appear above filters and the task table
- **AND** the task table remains visible below the metrics without navigating away

### Requirement: Capture task table
The page SHALL list knowledge capture tasks with status, target title or URL, diagnostics, created time, and contextual actions.

#### Scenario: Display capture tasks
- **WHEN** capture tasks are available
- **THEN** the page displays a table with task ID, status, title or URL, diagnostics, created time, and actions
- **AND** the table does not include a source column because all primary capture tasks are extension initiated
- **AND** the table does not include a tool column because the page is dedicated to knowledge capture

#### Scenario: Display diagnostics column
- **WHEN** a task row is shown
- **THEN** the diagnostics column summarizes the most useful state, such as "快照已收到", "未收到快照", "登录态为空", "正文识别失败", or "采集中"
- **AND** the diagnostics summary is derived from backend diagnostics instead of raw frontend JSON parsing

#### Scenario: Filter capture tasks
- **WHEN** the user selects a status filter
- **THEN** the table updates to show all, running, successful, or failed tasks
- **AND** the page provides a clear filter reset action

### Requirement: Inline task details
The page SHALL show task details inline without navigating to a separate page.

#### Scenario: Expand failed task details
- **WHEN** the user opens details for a failed task
- **THEN** the page displays URL, snapshot status, pageHtml size when available, cookie count, localStorage key count, error message, and suggested next action
- **AND** the page shows a retry action for failed tasks

#### Scenario: Expand successful task details
- **WHEN** the user opens details for a successful task
- **THEN** the page displays title, URL, Markdown length, HTML length, capture time, and actions to view Markdown or delete the captured item

### Requirement: Capture task actions
The page SHALL expose actions based on each task's lifecycle state.

#### Scenario: Failed task actions
- **WHEN** a task has status `failed`
- **THEN** the page displays actions to retry and view details

#### Scenario: Successful task actions
- **WHEN** a task has status `success` or `completed`
- **THEN** the page displays actions to view Markdown and delete the related knowledge item

#### Scenario: Running task actions
- **WHEN** a task has status `pending` or `running`
- **THEN** the page displays a details action and refreshes running task state periodically
