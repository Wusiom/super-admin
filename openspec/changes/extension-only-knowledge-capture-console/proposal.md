## Why

The current capture experience still presents URL submission as the primary workflow, but authenticated article capture only works reliably when initiated from the user's active browser tab. This mismatch causes repeated failures where the backend receives only a URL or empty auth context, then opens a locked preview page.

We need to make Chrome extension capture the product's single primary workflow and turn the web UI into a capture task console that explains what happened, supports retry, and lets users view or delete successful captures without jumping between pages.

## What Changes

- **BREAKING**: Knowledge capture is no longer designed around manual URL submission as the main user path.
- Chrome extension capture becomes the only primary capture entry point.
- Extension capture requests include the active tab URL, cookies, localStorage, and the rendered page HTML snapshot when available.
- The backend prioritizes `pageHtml` extraction before falling back to Playwright navigation.
- The backend exposes job diagnostics derived from job input/output and related knowledge items.
- The web UI merges capture guidance, job status, retry, detail, view, and delete actions into one knowledge capture console.
- Manual URL capture is removed from the primary UI. If kept later, it must be hidden behind an advanced/public-page-only affordance.

## Capabilities

### New Capabilities

- `capture-console`: Defines the extension-only knowledge capture console, dashboard metrics, task list, inline details, retry, view, and delete behavior.

### Modified Capabilities

- `knowledge-capture`: Capture job creation and execution now accept rendered page snapshots, prioritize snapshot extraction, and expose diagnostics for task UI.
- `browser-extension`: Extension capture now collects rendered page HTML in addition to cookies/localStorage and falls back to direct tab execution when content-script messaging fails.

## Impact

- Backend API:
  - `POST /api/tools/knowledge-capture/capture` accepts optional `pageHtml`.
  - `GET /api/jobs` should return diagnostics suitable for the capture console.
  - Retry behavior remains available for failed capture jobs.
- Backend processing:
  - `capture.processor.ts` extracts from `pageHtml` first.
  - Playwright navigation remains as a fallback path.
- Chrome extension:
  - `content-script.js` exposes rendered page snapshots.
  - `service-worker.js` reads snapshots via content-script or `chrome.scripting.executeScript`.
- Frontend:
  - `/knowledge/capture`, `/jobs`, and knowledge item actions should converge into one task-oriented capture console.
  - Manual URL form should not be the main surface.
- Documentation:
  - Browser-assisted capture docs and AGENTS/CLAUDE architecture notes need updates after implementation.
