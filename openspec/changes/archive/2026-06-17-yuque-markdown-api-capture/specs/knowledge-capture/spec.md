## MODIFIED Requirements

### Requirement: Create Capture Job

系统 SHALL 允许 Chrome 扩展提交页面快照用于采集。请求 MUST 包含有效 URL 和页面 HTML 快照，除非站点专用采集路径可以使用可选页面元数据。请求 MAY 为站点专用采集处理器携带 `pageAppData`。响应 SHALL 返回用于追踪的 job ID。

#### Scenario: Submit page snapshot for capture

- **WHEN** Chrome 扩展提交 `POST /api/tools/knowledge-capture/capture`，body 为 `{ "url": "https://example.com/article", "pageHtml": "<html>...</html>" }`
- **THEN** 系统创建新的 Job 记录，`toolKey = "knowledge-capture"`，`status = "running"`
- **AND** 采集 processor 被内联调用，从 `pageHtml` 中提取内容
- **AND** 响应以 HTTP 201 返回 `{ "jobId": <id> }`

#### Scenario: Submit Yuque page metadata for capture

- **WHEN** Chrome 扩展提交 `POST /api/tools/knowledge-capture/capture`，并携带语雀 `url`、`pageHtml`、`cookies` 和 `pageAppData`
- **THEN** 系统创建新的 Job 记录，`toolKey = "knowledge-capture"`，`status = "running"`
- **AND** 采集 processor 接收到用于语雀专用提取的 `pageAppData`
- **AND** 响应以 HTTP 201 返回 `{ "jobId": <id> }`

#### Scenario: Submit without pageHtml

- **WHEN** 采集请求未提交 `pageHtml`，或 `pageHtml` 为空
- **THEN** 系统创建 Job 记录，状态为 `failed`，错误为 "Page snapshot was not received from the extension"
- **AND** 响应以 HTTP 201 返回 `{ "jobId": <id> }`，表示 job 已创建但已经失败

#### Scenario: Submit invalid URL

- **WHEN** 用户提交格式错误的 URL，例如 `{ "url": "not-a-url" }`
- **THEN** 系统返回 HTTP 400，错误信息为 "Invalid URL format"
- **AND** 不创建 Job 记录

#### Scenario: Submit empty URL

- **WHEN** 用户提交空 URL 或缺少 `url` 字段
- **THEN** 系统返回 HTTP 400，并包含校验错误详情

### Requirement: Execute Capture from Page Snapshot

对通用网页，采集 processor SHALL 使用 JSDOM 解析 Chrome 扩展提交的页面 HTML 快照，使用 Mozilla Readability 提取正文，并将结果转换为 Markdown。服务端不启动浏览器。对具备有效页面元数据和 cookie 的语雀文档页，processor SHALL 先尝试语雀 API Markdown 采集，再按需回退到通用 HTML 管线。

#### Scenario: Successful page capture

- **WHEN** 采集 processor 使用非语雀页面的有效 `pageHtml` 快照执行
- **THEN** JSDOM 解析 HTML
- **AND** Mozilla Readability 提取正文内容
- **AND** 提取出的 HTML 使用 Turndown 转换为 Markdown
- **AND** 系统创建 KnowledgeItem 记录，包含 title、url、contentHtml、contentMarkdown、`status = "published"` 和 jobId
- **AND** Job 记录更新为 `success`，`output = { "itemId": <knowledgeItemId> }`

#### Scenario: Successful Yuque API Markdown capture

- **WHEN** 采集 processor 使用语雀 URL、有效 `pageAppData`、已采集 cookie 执行，并且语雀 API 在 `data.sourcecode` 中返回 Markdown
- **THEN** processor 将 `data.sourcecode` 存为 `KnowledgeItem.contentMarkdown`
- **AND** processor 在可用时将语雀 API HTML 内容存为 `KnowledgeItem.contentHtml`
- **AND** processor 在可用时使用语雀 API 标题
- **AND** KnowledgeItem 使用 `source = "yuque"`、`status = "published"` 和当前 jobId 创建
- **AND** Job 记录更新为 `success`，`output = { "itemId": <knowledgeItemId> }`

#### Scenario: Yuque metadata missing

- **WHEN** 采集 processor 使用语雀 URL 执行，但缺少有效 `pageAppData`
- **THEN** processor 使用现有 JSDOM、Readability 和 Turndown 管线
- **AND** job 结果遵循通用页面采集结果

#### Scenario: Yuque API recoverable failure fallback

- **WHEN** 采集 processor 使用语雀 URL 和有效 `pageAppData` 执行，但语雀 API 请求出现网络错误、响应格式异常或 Markdown 为空
- **THEN** processor 使用现有 JSDOM、Readability 和 Turndown 管线作为 fallback
- **AND** job 结果遵循通用页面采集结果

#### Scenario: Yuque API authentication failure

- **WHEN** 采集 processor 使用语雀 URL 执行，且语雀 API 返回 HTTP 401 或 403
- **THEN** Job 记录状态变为 `failed`，错误类型为 `LOCKED_CONTENT`
- **AND** processor 不从 fallback HTML 内容创建 KnowledgeItem
- **AND** job 不重试

#### Scenario: Readability extraction fails (EXTRACTION_FAILED)

- **WHEN** `pageHtml` 有效，但 Readability 无法识别正文
- **THEN** Job 记录状态变为 `failed`，错误类型为 `EXTRACTION_FAILED`
- **AND** job 不重试，因为需要人工判断
- **AND** 不创建 KnowledgeItem

#### Scenario: Page is a CAPTCHA or verification page (BLOCKED)

- **WHEN** `pageHtml` 包含验证码、滑块验证或访问拒绝特征
- **THEN** Job 记录状态变为 `failed`，错误类型为 `BLOCKED`
- **AND** job 不重试

#### Scenario: Page requires login or subscription (LOCKED_CONTENT)

- **WHEN** `pageHtml` 包含付费墙或登录墙特征
- **THEN** Job 记录状态变为 `failed`，错误类型为 `LOCKED_CONTENT`
- **AND** job 不重试

#### Scenario: Extracted content is empty (EMPTY_CONTENT)

- **WHEN** Readability 提取出内容，但结果为空或少于 100 个字符
- **THEN** Job 记录状态变为 `failed`，错误类型为 `EMPTY_CONTENT`
- **AND** job 不重试

#### Scenario: No page snapshot received (NO_SNAPSHOT)

- **WHEN** processor 收到的 job 没有 `pageHtml` 字段，或 `pageHtml` 为空
- **THEN** Job 记录状态变为 `failed`，错误类型为 `NO_SNAPSHOT`
- **AND** job 不重试
