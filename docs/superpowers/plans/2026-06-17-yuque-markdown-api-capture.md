# Yuque Markdown API Capture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让语雀文档采集优先使用语雀文档 API 返回的服务端 Markdown，同时保持普通网页和可恢复失败的 HTML 快照采集行为不变。

**Architecture:** Chrome 扩展只负责从页面上下文临时提取 `window.appData.doc` 元数据，并随现有采集请求发送 `pageAppData` JSON 字符串。NestJS controller 解析该字段并传给 `captureProcessor`；processor 在通用 JSDOM/Readability/Turndown 管线之前尝试语雀 API，成功后直接创建 `KnowledgeItem`，401/403 显式失败，其他失败回落到现有管线。

**Tech Stack:** Chrome Extension Manifest V3 service worker、Node `node:test`、NestJS、Jest、Prisma、JSDOM、Readability、Turndown、内置 `fetch`。

---

## 文件结构

- Modify: `extension/service-worker.js`
  - 增加 `readYuquePageAppData(tabId)`，从页面上下文读取 `window.appData.doc`。
  - 扩展 `readTabState(tabId)` 返回值，加入可选 `pageAppData`。
  - 在 `handleCapture()` 中把 `pageAppData` 作为 JSON 字符串放入请求 body。
  - 导出新 helper，供 Node 单元测试直接验证。
- Modify: `extension/service-worker-snapshot.test.js`
  - 覆盖 `pageAppData` 存在、缺失、content-script 快照仍可用三种路径。
- Modify: `extension/integration.test.js`
  - 覆盖完整采集请求仍保持 `url`、`cookies`、`localStorage` 字段，且语雀页面额外携带 `pageAppData`。
- Modify: `server/src/tools/knowledge-capture/knowledge-capture.controller.ts`
  - `CaptureDto` 新增可选字符串字段 `pageAppData`。
  - `capture()` 解析 `pageAppData` 并写入 job input / mock job data。
  - 无效 JSON 返回中文错误，不创建 job。
- Modify: `server/src/tools/knowledge-capture/knowledge-capture.controller.spec.ts`
  - 覆盖 `pageAppData` 正确解析和无效 JSON。
- Modify: `server/src/tools/knowledge-capture/capture.processor.ts`
  - 增加小型语雀 helper：元数据解析、URL 检测、cookie header、API URL 构造、响应解析。
  - 在 `captureProcessor()` 开始通用 HTML 管线之前尝试语雀 API。
  - 成功时写入 `source: 'yuque'`；401/403 抛 `LOCKED_CONTENT`；网络错误、异常结构、空 Markdown 回落。
- Modify: `server/src/tools/knowledge-capture/capture.processor.spec.ts`
  - Mock `global.fetch`，新增语雀成功、缺少元数据 fallback、可恢复失败 fallback、认证失败、非语雀回归测试。
- No Change: `server/prisma/schema.prisma`
  - 现有 `KnowledgeItem.contentMarkdown`、`contentHtml`、`source`、`status`、`jobId` 足够表达本变更。

---

### Task 1: 扩展提取语雀页面元数据

**Files:**
- Modify: `extension/service-worker.js`
- Test: `extension/service-worker-snapshot.test.js`

- [ ] **Step 1: 写失败测试，验证请求体携带语雀 `pageAppData`**

在 `extension/service-worker-snapshot.test.js` 的 `describe('service worker page snapshot capture', ...)` 内追加：

```js
it('sends Yuque pageAppData when window.appData.doc is available', async () => {
  const originalExecuteScript = chrome.scripting.executeScript;
  chrome.scripting.executeScript = async ({ func }) => [
    {
      result: func.toString().includes('appData')
        ? {
            bookId: 1001,
            articleSlug: 'api-capture',
            host: 'www.yuque.com',
          }
        : {
            localStorage: { auth: 'direct-token' },
            pageTitle: 'Direct Article',
            pageHtml: '<html><body><article>Direct rendered body</article></body></html>',
          },
    },
  ];

  const { handleCapture } = require('./service-worker.js');
  let capturedBody = null;

  global.fetch = async (_url, init) => {
    capturedBody = JSON.parse(init.body);
    return new MockResponse({ jobId: 3 }, 201);
  };

  const result = await handleCapture('https://www.yuque.com/team/api-capture', 1);

  assert.strictEqual(result.success, true);
  assert.deepStrictEqual(JSON.parse(capturedBody.pageAppData), {
    bookId: 1001,
    articleSlug: 'api-capture',
    host: 'www.yuque.com',
  });
  assert.strictEqual(capturedBody.url, 'https://www.yuque.com/team/api-capture');
  assert.ok(capturedBody.pageHtml);

  chrome.scripting.executeScript = originalExecuteScript;
});
```

- [ ] **Step 2: 运行扩展快照测试，确认失败**

Run: `node --test extension/service-worker-snapshot.test.js`

Expected: FAIL，错误显示 `capturedBody.pageAppData` 为 `undefined`。

- [ ] **Step 3: 实现 `readYuquePageAppData`**

在 `extension/service-worker.js` 的 `readDirectlyFromTab` 函数前添加：

```js
function normalizeYuquePageAppData(raw) {
  if (!raw || typeof raw !== 'object') return null;

  const bookId =
    raw.bookId ||
    raw.book_id ||
    raw.book?.id ||
    raw.book?.bookId ||
    raw.book?.book_id;
  const articleSlug =
    raw.articleSlug ||
    raw.article_slug ||
    raw.slug ||
    raw.id ||
    raw.docSlug;
  const host = raw.host || raw.hostname || '';

  if (!bookId || !articleSlug || !host) return null;

  return {
    bookId,
    articleSlug: String(articleSlug),
    host: String(host),
  };
}

async function readYuquePageAppData(tabId) {
  if (!chrome.scripting || !chrome.scripting.executeScript) {
    return null;
  }

  try {
    const [injection] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const appData = window.appData || {};
        const doc = appData.doc || appData?.data?.doc || null;
        if (!doc) return null;

        const book = doc.book || appData.book || {};
        return {
          bookId: doc.bookId || doc.book_id || book.id || book.bookId || book.book_id,
          articleSlug: doc.articleSlug || doc.article_slug || doc.slug || doc.id || doc.docSlug,
          host: window.location.host,
        };
      },
    });

    return normalizeYuquePageAppData(injection?.result);
  } catch (err) {
    console.warn('[Super Admin] Yuque appData read failed:', err.message);
    return null;
  }
}
```

- [ ] **Step 4: 合并 `pageAppData` 到 `readTabState`**

将 `readTabState(tabId)` 替换为：

```js
async function readTabState(tabId) {
  const pageAppData = await readYuquePageAppData(tabId);
  const fromContentScript = await readFromContentScript(tabId);
  if (fromContentScript.pageHtml) {
    return { ...fromContentScript, pageAppData };
  }

  const fromDirectRead = await readDirectlyFromTab(tabId);
  return {
    localStorage:
      Object.keys(fromContentScript.localStorage).length > 0
        ? fromContentScript.localStorage
        : fromDirectRead.localStorage,
    pageHtml: fromDirectRead.pageHtml,
    pageTitle: fromDirectRead.pageTitle || fromContentScript.pageTitle || '',
    pageAppData,
  };
}
```

- [ ] **Step 5: 将 `pageAppData` 写入 capture payload 并导出 helper**

在 `handleCapture()` 中 `attachPageHtmlIfSmall(payload, tabState.pageHtml);` 后添加：

```js
if (tabState.pageAppData) {
  payload.pageAppData = JSON.stringify(tabState.pageAppData);
}
```

在 `module.exports` 中加入：

```js
normalizeYuquePageAppData,
readYuquePageAppData,
```

- [ ] **Step 6: 运行扩展快照测试，确认通过**

Run: `node --test extension/service-worker-snapshot.test.js`

Expected: PASS，3 个以上测试全部通过。

- [ ] **Step 7: 提交扩展元数据读取**

```bash
git add extension/service-worker.js extension/service-worker-snapshot.test.js
git commit -m "feat(extension): capture yuque page metadata"
```

---

### Task 2: 扩展请求格式回归覆盖

**Files:**
- Modify: `extension/integration.test.js`

- [ ] **Step 1: 写失败测试，验证集成请求携带 JSON 字符串形式的 `pageAppData`**

在 `extension/integration.test.js` 的 `describe('集成测试：采集消息流', ...)` 内追加：

```js
it('语雀页面请求体额外包含 pageAppData JSON 字符串', async () => {
  mockStorage.token = 'valid-token';
  mockStorage.backendUrl = 'http://localhost:3000';

  chrome.cookies.getAll = async () => [
    { name: '_yuque_session', value: 'cookie-value', domain: '.yuque.com', path: '/' },
  ];
  chrome.tabs.sendMessage = async (_tabId, message) => {
    if (message.action === 'getLocalStorage') {
      return { success: true, data: { theme: 'dark' } };
    }
    if (message.action === 'getPageSnapshot') {
      return {
        success: true,
        data: {
          title: 'Yuque API Capture',
          html: '<html><body><main><h1>Yuque API Capture</h1><p>Rendered snapshot body</p></main></body></html>',
        },
      };
    }
    return { success: false };
  };
  chrome.scripting = {
    executeScript: async () => [
      {
        result: {
          bookId: 3001,
          articleSlug: 'api-capture',
          host: 'www.yuque.com',
        },
      },
    ],
  };

  let capturedBody = null;
  mockFetch(async (_url, init) => {
    capturedBody = JSON.parse(init.body);
    return new MockResponse({ jobId: 456 }, 201);
  });

  const result = await handleCapture('https://www.yuque.com/team/api-capture', 1);

  assert.strictEqual(result.success, true);
  assert.strictEqual(result.jobId, 456);
  assert.strictEqual(capturedBody.url, 'https://www.yuque.com/team/api-capture');
  assert.deepStrictEqual(JSON.parse(capturedBody.cookies), [
    { name: '_yuque_session', value: 'cookie-value', domain: '.yuque.com', path: '/' },
  ]);
  assert.deepStrictEqual(JSON.parse(capturedBody.localStorage), { theme: 'dark' });
  assert.deepStrictEqual(JSON.parse(capturedBody.pageAppData), {
    bookId: 3001,
    articleSlug: 'api-capture',
    host: 'www.yuque.com',
  });
});
```

- [ ] **Step 2: 运行扩展集成测试，确认失败或定位 mock 缺口**

Run: `node --test extension/integration.test.js`

Expected before Task 1 implementation: FAIL，`pageAppData` 缺失。Expected after Task 1 implementation: PASS。

- [ ] **Step 3: 如果测试污染全局 chrome mock，补充 beforeEach 重置**

在 `beforeEach(() => { resetState(); })` 中扩展为：

```js
beforeEach(() => {
  resetState();
  chrome.cookies.getAll = async () => [];
  chrome.tabs.sendMessage = async () => ({ success: true, data: {} });
  chrome.scripting = {
    executeScript: async () => [
      {
        result: null,
      },
    ],
  };
});
```

- [ ] **Step 4: 运行所有扩展测试**

Run:

```bash
node --test extension/service-worker-snapshot.test.js
node --test extension/integration.test.js
node --test extension/content-script.test.js
node --test extension/content-script-snapshot.test.js
```

Expected: PASS。

- [ ] **Step 5: 提交扩展请求格式测试**

```bash
git add extension/integration.test.js
git commit -m "test(extension): cover yuque capture payload"
```

---

### Task 3: Controller 接收并转发 `pageAppData`

**Files:**
- Modify: `server/src/tools/knowledge-capture/knowledge-capture.controller.ts`
- Test: `server/src/tools/knowledge-capture/knowledge-capture.controller.spec.ts`

- [ ] **Step 1: 写失败测试，验证 controller 解析 `pageAppData` 到 job input**

在 `KnowledgeCaptureController capture` describe 内追加：

```ts
it('stores pageAppData in the job input for Yuque captures', async () => {
  const createdJobs: any[] = [];
  const prisma = {
    job: {
      create: jest.fn().mockImplementation(async ({ data }) => {
        createdJobs.push(data);
        return { id: 14, ...data };
      }),
      update: jest.fn(),
    },
  };
  const controller = new KnowledgeCaptureController(prisma as any, {} as any, mockJobEvents());

  const result = await controller.capture({
    url: 'https://www.yuque.com/team/api-capture',
    cookies: '[{"name":"_yuque_session","value":"abc"}]',
    localStorage: '{}',
    pageHtml: '<html><body><main>Yuque rendered snapshot with enough text for diagnostics</main></body></html>',
    pageAppData: '{"bookId":3001,"articleSlug":"api-capture","host":"www.yuque.com"}',
  } as any);

  expect(result).toEqual({ jobId: 14 });
  const input = JSON.parse(createdJobs[0].input);
  expect(input.pageAppData).toEqual({
    bookId: 3001,
    articleSlug: 'api-capture',
    host: 'www.yuque.com',
  });
  expect(input.pageHtml).toContain('Yuque rendered snapshot');
});
```

- [ ] **Step 2: 写失败测试，验证无效 `pageAppData` 不创建 job**

追加：

```ts
it('returns error for invalid pageAppData JSON', async () => {
  const prisma = {
    job: {
      create: jest.fn(),
      update: jest.fn(),
    },
  };
  const controller = new KnowledgeCaptureController(prisma as any, {} as any, mockJobEvents());

  const result = await controller.capture({
    url: 'https://www.yuque.com/team/api-capture',
    pageHtml: '<html>test</html>',
    pageAppData: 'not-json',
  } as any);

  expect(result).toEqual({ error: 'pageAppData 格式错误，需要合法的 JSON 对象' });
  expect(prisma.job.create).not.toHaveBeenCalled();
});
```

- [ ] **Step 3: 运行 controller 测试，确认失败**

Run: `pnpm --filter server test -- knowledge-capture.controller.spec.ts --runInBand`

Expected: FAIL，`pageAppData` 未出现在 job input，或无效 JSON 未被处理。

- [ ] **Step 4: 扩展 DTO 和解析逻辑**

在 `CaptureDto` 中添加：

```ts
@IsOptional()
@IsString()
pageAppData?: string;
```

在 `capture()` 中 `pageHtmlMeta` 解析块之后添加：

```ts
if (dto.pageAppData) {
  try {
    jobData.pageAppData = JSON.parse(dto.pageAppData);
  } catch {
    return { error: 'pageAppData 格式错误，需要合法的 JSON 对象' };
  }
}
```

- [ ] **Step 5: 运行 controller 测试，确认通过**

Run: `pnpm --filter server test -- knowledge-capture.controller.spec.ts --runInBand`

Expected: PASS。

- [ ] **Step 6: 提交 controller 变更**

```bash
git add server/src/tools/knowledge-capture/knowledge-capture.controller.ts server/src/tools/knowledge-capture/knowledge-capture.controller.spec.ts
git commit -m "feat(server): accept yuque page app data"
```

---

### Task 4: Processor 增加语雀 API helper

**Files:**
- Modify: `server/src/tools/knowledge-capture/capture.processor.ts`
- Test: `server/src/tools/knowledge-capture/capture.processor.spec.ts`

- [ ] **Step 1: 在测试文件准备 `fetch` mock 清理**

在 `capture.processor.spec.ts` 顶部 mock 区域后添加：

```ts
const originalFetch = global.fetch;
var mockFetch = jest.fn();
```

在 `beforeEach()` 中添加：

```ts
mockFetch = jest.fn();
global.fetch = mockFetch as any;
```

在 `describe` 末尾添加：

```ts
afterAll(() => {
  global.fetch = originalFetch;
});
```

- [ ] **Step 2: 写失败测试，验证语雀 API 成功直写 Markdown**

在 `describe('captureProcessor snapshot capture', ...)` 内追加：

```ts
it('captures Yuque Markdown from the Yuque document API before HTML fallback', async () => {
  mockFetch.mockResolvedValue({
    status: 200,
    ok: true,
    json: async () => ({
      data: {
        title: 'API Title',
        sourcecode: '# API Title\n\n- one\n- two\n\n```ts\nconst ok = true;\n```',
        content: '<h1>API Title</h1><ul><li>one</li><li>two</li></ul>',
      },
    }),
  });

  const result = await captureProcessor({
    data: {
      url: 'https://www.yuque.com/team/api-capture',
      jobRecordId: 21,
      cookies: [{ name: '_yuque_session', value: 'abc' }],
      pageAppData: { bookId: 3001, articleSlug: 'api-capture', host: 'www.yuque.com' },
      pageHtml: `
        <html>
          <head><title>Rendered Title</title></head>
          <body>
            <main><h1>Rendered Title</h1><p>This fallback body should not be saved when API succeeds.</p><p>More fallback content.</p><p>Enough fallback content.</p></main>
          </body>
        </html>
      `,
    },
  } as any);

  expect(mockFetch).toHaveBeenCalledWith(
    'https://www.yuque.com/api/docs/api-capture?book_id=3001&merge_dynamic_data=false&mode=markdown',
    expect.objectContaining({
      headers: expect.objectContaining({
        cookie: '_yuque_session=abc',
      }),
    }),
  );
  expect(mockCreate).toHaveBeenCalledWith({
    data: expect.objectContaining({
      title: 'API Title',
      url: 'https://www.yuque.com/team/api-capture',
      contentMarkdown: '# API Title\n\n- one\n- two\n\n```ts\nconst ok = true;\n```',
      contentHtml: '<h1>API Title</h1><ul><li>one</li><li>two</li></ul>',
      source: 'yuque',
      status: 'published',
      jobId: 21,
    }),
  });
  expect(result).toEqual({ itemId: 42 });
});
```

- [ ] **Step 3: 运行 processor 测试，确认失败**

Run: `pnpm --filter server test -- capture.processor.spec.ts --runInBand`

Expected: FAIL，`mockFetch` 未被调用，保存的是 fallback HTML。

- [ ] **Step 4: 添加语雀 helper 类型和解析函数**

在 `interface ExtractedContent` 后添加：

```ts
interface YuquePageAppData {
  bookId: string | number;
  articleSlug: string;
  host: string;
}

interface YuqueApiCapture {
  title: string;
  contentMarkdown: string;
  contentHtml: string;
}
```

在 `parsePageHtmlMeta()` 后添加：

```ts
function parsePageAppData(raw: unknown): YuquePageAppData | null {
  const value = parsePageHtmlMeta(raw);
  const bookId = value.bookId ?? value.book_id;
  const articleSlug = value.articleSlug ?? value.article_slug ?? value.slug;
  const host = value.host ?? value.hostname;

  if (!bookId || !articleSlug || !host) return null;

  return {
    bookId,
    articleSlug: String(articleSlug),
    host: String(host),
  };
}

function isYuqueDocumentUrl(url: string) {
  try {
    const parsed = new URL(url);
    return (
      parsed.hostname === 'yuque.com' ||
      parsed.hostname.endsWith('.yuque.com')
    );
  } catch {
    return false;
  }
}

function sanitizeYuqueHost(host: string) {
  const trimmed = host.trim().replace(/^https?:\/\//, '').split('/')[0];
  if (trimmed === 'yuque.com' || trimmed.endsWith('.yuque.com')) {
    return trimmed;
  }
  return '';
}

function buildYuqueApiUrl(pageAppData: YuquePageAppData) {
  const host = sanitizeYuqueHost(pageAppData.host);
  if (!host) return '';

  const slug = encodeURIComponent(pageAppData.articleSlug);
  const bookId = encodeURIComponent(String(pageAppData.bookId));
  return `https://${host}/api/docs/${slug}?book_id=${bookId}&merge_dynamic_data=false&mode=markdown`;
}

function buildCookieHeader(cookies: unknown) {
  if (!Array.isArray(cookies)) return '';
  return cookies
    .filter((cookie) => cookie && typeof cookie === 'object')
    .map((cookie: any) => {
      if (!cookie.name || typeof cookie.value === 'undefined') return '';
      return `${encodeURIComponent(String(cookie.name))}=${encodeURIComponent(String(cookie.value))}`;
    })
    .filter(Boolean)
    .join('; ');
}
```

- [ ] **Step 5: 添加语雀 API fetch helper**

继续在 helper 区域添加：

```ts
async function fetchYuqueMarkdown(
  pageAppData: YuquePageAppData,
  cookies: unknown,
): Promise<YuqueApiCapture | null> {
  const apiUrl = buildYuqueApiUrl(pageAppData);
  if (!apiUrl) return null;

  const response = await fetch(apiUrl, {
    method: 'GET',
    headers: {
      accept: 'application/json',
      cookie: buildCookieHeader(cookies),
    },
  });

  if (response.status === 401 || response.status === 403) {
    throw Object.assign(
      new Error('Yuque document API requires authentication'),
      { jobErrorType: 'LOCKED_CONTENT' },
    );
  }

  if (!response.ok) return null;

  const body = await response.json().catch(() => null);
  const data = body?.data;
  const contentMarkdown =
    typeof data?.sourcecode === 'string' ? data.sourcecode.trim() : '';
  if (contentMarkdown.length < 10) return null;

  return {
    title: cleanTitle(data?.title) || String(pageAppData.articleSlug),
    contentMarkdown,
    contentHtml: typeof data?.content === 'string' ? data.content : '',
  };
}
```

- [ ] **Step 6: 运行 processor 测试，确认仍失败但 helper 编译通过**

Run: `pnpm --filter server test -- capture.processor.spec.ts --runInBand`

Expected: FAIL，原因仍是 `captureProcessor()` 尚未调用 helper；没有 TypeScript 编译错误。

- [ ] **Step 7: 暂不提交**

本任务只建立 helper，和 Task 5 的 processor 编排一起提交，避免中间提交产生死代码。

---

### Task 5: Processor 编排语雀 API、fallback 和认证失败

**Files:**
- Modify: `server/src/tools/knowledge-capture/capture.processor.ts`
- Test: `server/src/tools/knowledge-capture/capture.processor.spec.ts`

- [ ] **Step 1: 写失败测试，缺少 `pageAppData` 时回落 HTML 管线且不请求 API**

追加：

```ts
it('falls back to the HTML pipeline for Yuque URLs without pageAppData', async () => {
  const result = await captureProcessor({
    data: {
      url: 'https://www.yuque.com/team/missing-metadata',
      jobRecordId: 22,
      pageHtml: `
        <html>
          <head><title>Fallback Title</title></head>
          <body>
            <main class="doc-reader">
              <h1>Fallback Title</h1>
              <p>This paragraph is rendered from the snapshot because metadata is missing.</p>
              <p>Another complete paragraph keeps fallback extraction valid.</p>
              <p>The third paragraph keeps the body above the extractor threshold.</p>
            </main>
          </body>
        </html>
      `,
    },
  } as any);

  expect(mockFetch).not.toHaveBeenCalled();
  expect(mockCreate).toHaveBeenCalledWith({
    data: expect.objectContaining({
      title: 'Fallback Title',
      source: undefined,
      jobId: 22,
    }),
  });
  expect(result).toEqual({ itemId: 42 });
});
```

- [ ] **Step 2: 写失败测试，可恢复 API 失败回落 HTML 管线**

追加：

```ts
it('falls back to the HTML pipeline when Yuque API returns unusable Markdown', async () => {
  mockFetch.mockResolvedValue({
    status: 200,
    ok: true,
    json: async () => ({ data: { title: 'API Empty', sourcecode: '   ', content: '' } }),
  });

  await captureProcessor({
    data: {
      url: 'https://www.yuque.com/team/api-empty',
      jobRecordId: 23,
      cookies: [{ name: '_yuque_session', value: 'abc' }],
      pageAppData: { bookId: 3001, articleSlug: 'api-empty', host: 'www.yuque.com' },
      pageHtml: `
        <html>
          <head><title>Fallback After Empty API</title></head>
          <body>
            <article>
              <h1>Fallback After Empty API</h1>
              <p>The API returned empty markdown so the rendered snapshot remains useful.</p>
              <p>A second paragraph gives the extractor enough meaningful prose.</p>
              <p>A third paragraph keeps the content above the acceptance threshold.</p>
            </article>
          </body>
        </html>
      `,
    },
  } as any);

  expect(mockFetch).toHaveBeenCalledTimes(1);
  expect(mockCreate).toHaveBeenCalledWith({
    data: expect.objectContaining({
      title: 'Fallback After Empty API',
      source: undefined,
      jobId: 23,
    }),
  });
});
```

- [ ] **Step 3: 写失败测试，401/403 抛 `LOCKED_CONTENT` 且不创建 KnowledgeItem**

追加：

```ts
it('fails with LOCKED_CONTENT when Yuque API returns 401 or 403', async () => {
  mockFetch.mockResolvedValue({
    status: 403,
    ok: false,
    json: async () => ({ message: 'Forbidden' }),
  });

  await expect(
    captureProcessor({
      data: {
        url: 'https://www.yuque.com/team/private-doc',
        jobRecordId: 24,
        cookies: [{ name: '_yuque_session', value: 'expired' }],
        pageAppData: { bookId: 3001, articleSlug: 'private-doc', host: 'www.yuque.com' },
        pageHtml: `
          <html>
            <body>
              <main>
                <h1>Private Doc Snapshot</h1>
                <p>This fallback snapshot must not be saved after API authorization failure.</p>
                <p>Even with enough text, the processor should fail explicitly.</p>
                <p>This third paragraph proves the fallback would otherwise be acceptable.</p>
              </main>
            </body>
          </html>
        `,
      },
    } as any),
  ).rejects.toMatchObject({
    message: 'Yuque document API requires authentication',
    jobErrorType: 'LOCKED_CONTENT',
  });

  expect(mockCreate).not.toHaveBeenCalled();
});
```

- [ ] **Step 4: 写回归测试，非语雀页面不请求语雀 API**

追加：

```ts
it('keeps non-Yuque snapshot capture behavior unchanged', async () => {
  await captureProcessor({
    data: {
      url: 'https://example.com/article',
      jobRecordId: 25,
      pageAppData: { bookId: 3001, articleSlug: 'ignored', host: 'www.yuque.com' },
      pageHtml: `
        <html>
          <head><title>Example Article</title></head>
          <body>
            <article>
              <h1>Example Article</h1>
              <p>This non-Yuque article should stay on the generic snapshot pipeline.</p>
              <p>A second paragraph keeps the test representative.</p>
              <p>A third paragraph keeps the extractor threshold satisfied.</p>
            </article>
          </body>
        </html>
      `,
    },
  } as any);

  expect(mockFetch).not.toHaveBeenCalled();
  expect(mockCreate).toHaveBeenCalledWith({
    data: expect.objectContaining({
      title: 'Example Article',
      url: 'https://example.com/article',
      jobId: 25,
    }),
  });
});
```

- [ ] **Step 5: 运行 processor 测试，确认新增测试失败**

Run: `pnpm --filter server test -- capture.processor.spec.ts --runInBand`

Expected: FAIL，成功路径和 401/403 行为尚未编排。

- [ ] **Step 6: 在 `captureProcessor()` 中先尝试语雀 API**

将函数开头：

```ts
const { url, jobRecordId, pageHtml } = job.data;
const pageHtmlMeta = parsePageHtmlMeta(job.data.pageHtmlMeta);
```

替换为：

```ts
const { url, jobRecordId, pageHtml } = job.data;
const pageHtmlMeta = parsePageHtmlMeta(job.data.pageHtmlMeta);
const pageAppData = parsePageAppData(job.data.pageAppData);
```

在 pageHtml 快照校验之后、`try { const documentDom = ... }` 之前添加：

```ts
if (isYuqueDocumentUrl(url) && pageAppData) {
  let yuqueCapture: YuqueApiCapture | null = null;
  try {
    yuqueCapture = await fetchYuqueMarkdown(pageAppData, job.data.cookies);
  } catch (err: any) {
    if (err.jobErrorType === 'LOCKED_CONTENT') {
      throw err;
    }
    yuqueCapture = null;
  }

  if (yuqueCapture) {
    const item = await prisma.knowledgeItem.create({
      data: {
        title: yuqueCapture.title,
        url,
        contentHtml: yuqueCapture.contentHtml,
        contentMarkdown: yuqueCapture.contentMarkdown,
        source: 'yuque',
        status: 'published',
        jobId: jobRecordId,
      },
    });

    return { itemId: item.id };
  }
}
```

- [ ] **Step 7: 确认 catch 不把认证失败改写为 `EXTRACTION_FAILED`**

保持现有外层 `catch` 逻辑不变，因为认证失败在进入通用管线前已经抛出，不会被外层通用管线 catch 包裹。如果未来把语雀逻辑移动进通用 `try`，必须保留：

```ts
if (!err.jobErrorType) {
  throw Object.assign(err, { jobErrorType: 'EXTRACTION_FAILED' });
}
throw err;
```

- [ ] **Step 8: 运行 processor 测试，确认通过**

Run: `pnpm --filter server test -- capture.processor.spec.ts --runInBand`

Expected: PASS。

- [ ] **Step 9: 提交 processor 变更**

```bash
git add server/src/tools/knowledge-capture/capture.processor.ts server/src/tools/knowledge-capture/capture.processor.spec.ts
git commit -m "feat(server): capture yuque markdown via api"
```

---

### Task 6: 端到端验证与 OpenSpec 勾选

**Files:**
- Modify: `openspec/changes/yuque-markdown-api-capture/tasks.md`

- [ ] **Step 1: 运行扩展测试套件**

Run:

```bash
node --test extension/service-worker-snapshot.test.js
node --test extension/integration.test.js
node --test extension/content-script.test.js
node --test extension/content-script-snapshot.test.js
```

Expected: PASS。

- [ ] **Step 2: 运行后端聚焦测试**

Run:

```bash
pnpm --filter server test -- knowledge-capture.controller.spec.ts capture.processor.spec.ts --runInBand
```

Expected: PASS。

- [ ] **Step 3: 运行后端构建**

Run: `pnpm --filter server build`

Expected: PASS，`dist/` 生成成功，没有 TypeScript 编译错误。

- [ ] **Step 4: 运行全量 server 测试**

Run: `pnpm --filter server test -- --runInBand`

Expected: PASS。

- [ ] **Step 5: 手动验证标准语雀文档采集**

Run: `pnpm dev`

Manual steps:

1. 在 Chrome 中重新加载 `extension/` 扩展。
2. 打开一篇标准 `https://www.yuque.com/...` 文档页，并确认当前浏览器已登录语雀。
3. 触发扩展采集。
4. 打开前端知识采集控制台，等待 job 成功。
5. 打开生成的 KnowledgeItem，确认 `contentMarkdown` 保留标题、列表、代码块和图片 Markdown。
6. 在数据库或列表响应中确认该条目 `source = "yuque"`。

Expected: job 成功，Markdown 来自 API，不是 Lake DOM 快照压平后的 HTML 转换结果。

- [ ] **Step 6: 手动验证认证失败**

Manual steps:

1. 使用无效或过期语雀登录状态采集同一篇需要授权的语雀文档。
2. 查看 job 状态。

Expected: job 失败，错误为 `Yuque document API requires authentication` 或映射后的 `LOCKED_CONTENT` 诊断，不创建新的 KnowledgeItem。

- [ ] **Step 7: 勾选 OpenSpec tasks**

将 `openspec/changes/yuque-markdown-api-capture/tasks.md` 中 1.1 到 4.4 全部从 `- [ ]` 改为 `- [x]`，前提是 Step 1-6 都完成。

- [ ] **Step 8: 提交验证和 OpenSpec 状态**

```bash
git add openspec/changes/yuque-markdown-api-capture/tasks.md
git commit -m "chore(openspec): complete yuque markdown capture tasks"
```

---

## 自检

- Spec coverage:
  - 扩展 `window.appData.doc` 元数据提取：Task 1、Task 2。
  - `POST /capture` 接收 `pageAppData`：Task 3。
  - 语雀 API 成功写入 `contentMarkdown`、`contentHtml`、标题、`source = "yuque"`：Task 4、Task 5。
  - 缺少元数据和可恢复 API 失败 fallback：Task 5。
  - 401/403 显式 `LOCKED_CONTENT` 且不创建 KnowledgeItem：Task 5。
  - 非语雀采集行为保持不变：Task 5。
  - 无数据库迁移、无新运行时依赖：文件结构和 Task 6 构建验证覆盖。
- Placeholder scan:
  - 本计划没有遗留占位步骤；每个代码变更点都给出了具体测试、实现片段和验证命令。
- Type consistency:
  - 扩展 payload 字段统一为 `pageAppData`。
  - 后端 job data 字段统一为 `pageAppData`。
  - 语雀 helper 类型统一为 `YuquePageAppData` 和 `YuqueApiCapture`。
  - 错误类型统一使用现有 `jobErrorType: 'LOCKED_CONTENT'`。
