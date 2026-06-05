## Context

The current system has three separate surfaces for one workflow: `/knowledge/capture` for URL submission, `/jobs` for task status and retry, and `/knowledge/list` for viewing or deleting captured content. That structure made sense for public URL capture, but it breaks down for authenticated content because the backend cannot reliably reconstruct the user's browser state from a URL alone.

The extension already sits at the right point in the workflow: the user is looking at the page they are allowed to read. The system should capture from that active tab, then use the web UI to explain and manage the resulting task.

## Goals / Non-Goals

**Goals:**

- Make Chrome extension capture the only primary knowledge capture path.
- Capture the rendered page HTML snapshot from the active tab.
- Keep cookies/localStorage as supporting auth context for backend fallback.
- Prefer `pageHtml` extraction on the backend, then fall back to Playwright navigation.
- Give the frontend normalized job diagnostics so the UI does not parse raw JSON.
- Merge capture guidance, task metrics, task list, details, retry, view, and delete into one capture console.
- Remove tool/source noise from the capture table because the console is dedicated to extension knowledge capture.

**Non-Goals:**

- Multi-browser support beyond Chrome.
- Background or automatic capture without a user click.
- Bulk URL capture.
- Chrome Web Store packaging.
- Public sharing or bypassing login/subscription controls.

## Decisions

### Decision 1: Extension capture is the primary entry point

Manual URL capture remains a backend fallback capability, but it is no longer the product's main UI path. The user-facing workflow becomes: open target page, confirm full text is visible, click the extension, inspect the task in the capture console.

Alternative considered: keep the URL form and add more warnings. Rejected because the URL form keeps teaching users the wrong mental model for authenticated pages.

### Decision 2: Send rendered `pageHtml` from the active tab

The extension sends the current tab URL, cookies, localStorage, and rendered HTML. The backend extracts from `pageHtml` first because it represents what the user actually saw.

Alternative considered: send only cookies/localStorage and let Playwright recreate the page. That failed on sites where auth state is incomplete, dynamic content loads differently, or subscription UI remains visible in the server-rendered session.

### Decision 3: Direct tab execution fallback in the service worker

The extension first asks the content script for localStorage and page snapshot. If that path fails or returns no snapshot, the service worker uses `chrome.scripting.executeScript` against the active tab to read `document.documentElement.outerHTML` and localStorage directly.

Alternative considered: rely only on the content script. Rejected because content scripts can fail to inject, be stale after extension reload, or be unavailable on certain pages.

### Decision 4: Backend diagnostics are derived server-side

The job list endpoint should return a `diagnostics` object derived from `Job.input`, `Job.output`, and any related `KnowledgeItem`. Frontend components should not directly parse raw JSON to decide whether a snapshot was received, how many cookies existed, or which action to show.

Alternative considered: parse `input` and `output` in Vue. Rejected because it spreads fragile parsing and product rules into the UI.

### Decision 5: One capture console replaces page hopping

The console shows dashboard cards, filters, a task table, inline expandable details, retry for failures, view/delete for successes, and guidance for extension capture. `/jobs` can either redirect to this console or become the implementation route for it.

Alternative considered: keep `/jobs`, `/knowledge/capture`, and `/knowledge/list` separate. Rejected because users need to complete one loop in one place.

### Confirmed UI Structure

The visible page title should remain **知识采集**. Do not introduce "知识采集控制台" as visible product terminology unless needed internally. The page behaves like a console, but the user-facing concept stays simple: knowledge capture.

The subtitle must directly describe how to use the feature, not merely what the feature is. Use: **打开目标网页并确认正文完整显示后，点击 Chrome 扩展按钮采集。**

Primary usage:

```text
+--------------------------------------------------------------------------------+
| 知识采集                                                                        |
| 打开目标网页并确认正文完整显示后，点击 Chrome 扩展按钮采集。                      |
+--------------------------------------------------------------------------------+
```

Dashboard cards:

```text
+----------------+ +----------------+ +----------------+ +----------------+
| 总采集         | | 进行中         | | 成功率         | | 失败           |
| 1,247          | | 3              | | 94.2%          | | 8              |
| 今日 +12       | | 采集中         | | 过去 24h       | | 待处理         |
+----------------+ +----------------+ +----------------+ +----------------+
```

Task list:

```text
+--------------------------------------------------------------------------------+
| 采集任务                                                                        |
|                                                                                |
| 筛选： [全部] [进行中] [成功] [失败]                         [刷新]              |
|                                                                                |
| +------+--------+----------------------+--------------+----------------------+ |
| | 任务 | 状态   | 标题 / URL            | 诊断         | 操作                 | |
| +------+--------+----------------------+--------------+----------------------+ |
| | #31  | 成功   | 第20章 sdd flow...    | 快照已收到   | [查看] [删除]        | |
| | #30  | 失败   | xiaobot.net/post/...  | 未收到快照   | [重试] [详情]        | |
| | #29  | 失败   | xiaobot.net/post/...  | 登录态为空   | [重试] [详情]        | |
| | #28  | 进行中 | example.com/article   | 采集中       | [详情]               | |
| +------+--------+----------------------+--------------+----------------------+ |
+--------------------------------------------------------------------------------+
```

Failed task inline detail:

```text
+--------------------------------------------------------------------------------+
| 任务 #30                                                                        |
| 状态：失败                                                                       |
| URL：https://xiaobot.net/post/...                                                |
|                                                                                |
| 诊断信息                                                                        |
|   页面快照          未收到                                                       |
|   Cookie            0 个                                                         |
|   localStorage      0 项                                                         |
|   错误              需要登录或订阅后才能查看全文                                  |
|                                                                                |
| 建议操作                                                                        |
|   重新加载 Chrome 扩展，刷新目标网页，然后再次点击扩展按钮采集。                  |
|                                                                                |
| [重试] [收起]                                                                    |
+--------------------------------------------------------------------------------+
```

Successful task inline detail:

```text
+--------------------------------------------------------------------------------+
| 任务 #31                                                                        |
| 状态：成功                                                                       |
| 标题：第20章 sdd flow：轻量流程预设与可插拔编排实战                              |
| URL：https://xiaobot.net/post/...                                                |
|                                                                                |
| 内容信息                                                                        |
|   Markdown 长度       12,430 字符                                                |
|   HTML 长度           35,820 字符                                                |
|   采集时间            2026-06-05 06:20                                           |
|                                                                                |
| [查看 Markdown] [删除] [收起]                                                    |
+--------------------------------------------------------------------------------+
```

Manual URL capture should not appear in this primary layout. If it is ever restored, place it below the task list as a collapsed advanced section labeled for public pages only.

## Risks / Trade-offs

- Large page snapshots can exceed request limits. Mitigation: extension keeps a hard size limit and sends metadata when truncating.
- Rendered HTML may include private data. Mitigation: capture is explicit user action, credentials are not persisted by the extension, and this remains a personal archival tool.
- Readability may still select the wrong content. Mitigation: keep diagnostics and leave room for future site-specific extractors.
- Removing the manual URL form may reduce public-page convenience. Mitigation: if needed later, reintroduce it as an advanced public-page-only control, not the primary path.
- Existing routes and navigation labels may confuse users during migration. Mitigation: consolidate sidebar labels and redirect deprecated routes after the console lands.

## Migration Plan

1. Add backend support for normalized job diagnostics.
2. Ensure extension payload includes `pageHtml` or `pageHtmlMeta`.
3. Update the capture console UI to use extension-only guidance and a task table.
4. Add inline detail panels and actions for retry, view Markdown, and delete.
5. Remove or hide the manual URL form from the primary UI.
6. Update docs and AGENTS/CLAUDE architecture notes after implementation.

Rollback: keep the backend URL capture endpoint intact. If the console UI causes issues, restore navigation to the previous `/jobs` and `/knowledge/list` views while retaining the safer extension payload support.
