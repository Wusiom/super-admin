## 1. Backend Capture Contract

- [ ] 1.1 Update `POST /api/tools/knowledge-capture/capture` tests to cover `pageHtml`, cookies, localStorage, and snapshot metadata payloads.
- [ ] 1.2 Ensure `capture.processor.ts` prefers `pageHtml` extraction and only falls back to Playwright when no usable snapshot exists.
- [ ] 1.3 Ensure Playwright fallback injects localStorage, reloads the page, and attempts extraction immediately with short polling rather than fixed long waits.
- [ ] 1.4 Treat locked-content extraction as a failed job with a clear `LOCKED_CONTENT` classification and no KnowledgeItem.

## 2. Job Diagnostics API

- [ ] 2.1 Add a diagnostics mapper for Job records that derives url, hasPageHtml, pageHtmlSize, cookieCount, localStorageKeyCount, error, and suggestion without exposing raw credential values.
- [ ] 2.2 Join or lookup related KnowledgeItem data from `output.itemId` so successful jobs include itemId, itemTitle, markdownLength, htmlLength, and capturedAt.
- [ ] 2.3 Update `GET /api/jobs` response types and tests to include diagnostics.
- [ ] 2.4 Keep retry behavior working for failed capture jobs and preserve job input across retry.

## 3. Chrome Extension Capture

- [ ] 3.1 Ensure `content-script.js` returns rendered page HTML from `document.documentElement.outerHTML`.
- [ ] 3.2 Ensure `service-worker.js` includes pageHtml in capture requests when the snapshot is under the size limit.
- [ ] 3.3 Ensure `service-worker.js` falls back to `chrome.scripting.executeScript` when content-script messaging fails or returns no snapshot.
- [ ] 3.4 Add extension tests for snapshot capture, direct tab fallback, localStorage serialization, and oversized snapshot handling.

## 4. Capture Console UI

- [ ] 4.1 Replace the primary manual URL capture page with an extension-first knowledge capture console.
- [ ] 4.2 Add dashboard cards for total captured items, running tasks, recent success rate, and failed tasks.
- [ ] 4.3 Replace the task table columns with task ID, status, title/URL, diagnostics, created time, and actions.
- [ ] 4.4 Remove source/tool columns from the capture console table.
- [ ] 4.5 Add status filters for all, running, success, and failed plus a clear-filter action.
- [ ] 4.6 Add inline expanded details for failed tasks showing snapshot status, auth counts, error, and suggested next action.
- [ ] 4.7 Add inline expanded details for successful tasks showing item metadata and content lengths.
- [ ] 4.8 Add contextual actions: failed tasks can retry/details, successful tasks can view Markdown/delete, running tasks can view details.

## 5. Route and Navigation Cleanup

- [ ] 5.1 Decide whether `/jobs` redirects to the capture console or becomes the capture console route.
- [ ] 5.2 Remove or hide the manual URL form from the primary navigation.
- [ ] 5.3 Keep advanced manual URL capture unavailable by default unless explicitly reintroduced as public-page-only.
- [ ] 5.4 Update extension popup "view task" link to the final capture console route.

## 6. Verification and Documentation

- [ ] 6.1 Run server build and server tests.
- [ ] 6.2 Run extension syntax checks and extension tests.
- [ ] 6.3 Verify extension capture produces a job whose diagnostics show `hasPageHtml=true` for a normal article page.
- [ ] 6.4 Verify failed capture details show actionable guidance when snapshot is missing or auth state is empty.
- [ ] 6.5 Update `docs/design-20260531-browser-assisted-capture.md` to describe snapshot-first extension capture and extension-only UI.
- [ ] 6.6 Update `AGENTS.md` and `CLAUDE.md` architecture notes after implementation.
