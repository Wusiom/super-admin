const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');

const mockStorage = {
  token: 'valid-token',
  backendUrl: 'http://localhost:3000',
};

global.chrome = {
  storage: {
    local: {
      async get() {
        return { ...mockStorage };
      },
      async set(items) {
        Object.assign(mockStorage, items);
      },
    },
  },
  cookies: { getAll: async () => [] },
  tabs: {
    sendMessage: async (_tabId, message) => {
      if (message.action === 'getLocalStorage') {
        return { success: true, data: {} };
      }
      if (message.action === 'getPageSnapshot') {
        return {
          success: true,
          data: {
            title: 'Rendered Article',
            html: '<html><body><article>Rendered body</article></body></html>',
          },
        };
      }
      return { success: false };
    },
  },
  scripting: {
    executeScript: async () => [
      {
        result: {
          localStorage: { auth: 'direct-token' },
          pageHtml: '<html><body><article>Direct rendered body</article></body></html>',
        },
      },
    ],
  },
  runtime: {
    onMessage: { addListener() {} },
    onMessageExternal: { addListener() {} },
  },
};

class MockResponse {
  constructor(body, status = 200) {
    this._body = typeof body === 'string' ? body : JSON.stringify(body);
    this.status = status;
    this.ok = status >= 200 && status < 300;
  }
  async json() {
    return JSON.parse(this._body);
  }
  async text() {
    return this._body;
  }
}

const originalFetch = global.fetch;
const defaultSendMessage = chrome.tabs.sendMessage;
const defaultExecuteScript = chrome.scripting.executeScript;

describe('service worker page snapshot capture', () => {
  beforeEach(() => {
    delete require.cache[require.resolve('./service-worker.js')];
  });

  afterEach(() => {
    global.fetch = originalFetch;
    chrome.tabs.sendMessage = defaultSendMessage;
    chrome.scripting.executeScript = defaultExecuteScript;
  });

  it('sends rendered page HTML to the capture endpoint', async () => {
    const { handleCapture } = require('./service-worker.js');
    let capturedBody = null;

    global.fetch = async (_url, init) => {
      capturedBody = JSON.parse(init.body);
      return new MockResponse({ jobId: 1 }, 201);
    };

    const result = await handleCapture('https://example.com/page', 1);

    assert.strictEqual(result.success, true);
    assert.strictEqual(
      capturedBody.pageHtml,
      '<html><body><article>Rendered body</article></body></html>',
    );
    assert.deepStrictEqual(JSON.parse(capturedBody.pageHtmlMeta), {
      title: 'Rendered Article',
    });
    assert.strictEqual(Object.hasOwn(capturedBody, 'pageAppData'), false);
  });

  it('falls back to direct tab execution when content-script has no snapshot', async () => {
    chrome.tabs.sendMessage = async (_tabId, message) => {
      if (message.action === 'getLocalStorage') {
        return { success: true, data: {} };
      }
      if (message.action === 'getPageSnapshot') {
        return { success: false };
      }
      return { success: false };
    };

    const { handleCapture } = require('./service-worker.js');
    let capturedBody = null;

    global.fetch = async (_url, init) => {
      capturedBody = JSON.parse(init.body);
      return new MockResponse({ jobId: 2 }, 201);
    };

    const result = await handleCapture('https://example.com/page', 1);

    assert.strictEqual(result.success, true);
    assert.strictEqual(
      capturedBody.pageHtml,
      '<html><body><article>Direct rendered body</article></body></html>',
    );
    assert.deepStrictEqual(JSON.parse(capturedBody.localStorage), {
      auth: 'direct-token',
    });
  });

  it('sends Yuque pageAppData when window.appData.doc is available', async () => {
    const scriptCalls = [];
    chrome.scripting.executeScript = async (options) => {
      scriptCalls.push(options);
      const { func } = options;
      return [
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
    };

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
    assert.strictEqual(scriptCalls[0].world, 'MAIN');
    assert.strictEqual(capturedBody.url, 'https://www.yuque.com/team/api-capture');
    assert.ok(capturedBody.pageHtml);
  });

  it('derives Yuque pageAppData from appData.book and the current URL when doc is unavailable', async () => {
    const originalWindow = global.window;
    chrome.scripting.executeScript = async (options) => {
      const { func } = options;
      if (func.toString().includes('appData')) {
        global.window = {
          appData: {
            book: {
              id: 41382127,
            },
          },
          location: {
            host: 'www.yuque.com',
            pathname: '/lgdsunday/cbt5mq/aquxnv5eccueqvgn',
          },
        };
        try {
          return [{ result: func() }];
        } finally {
          global.window = originalWindow;
        }
      }

      return [
        {
          result: {
            localStorage: {},
            pageTitle: 'Yuque Book Fallback',
            pageHtml: '<html><body><article>Direct rendered body</article></body></html>',
          },
        },
      ];
    };

    const { handleCapture } = require('./service-worker.js');
    let capturedBody = null;

    global.fetch = async (_url, init) => {
      capturedBody = JSON.parse(init.body);
      return new MockResponse({ jobId: 6 }, 201);
    };

    const result = await handleCapture(
      'https://www.yuque.com/lgdsunday/cbt5mq/aquxnv5eccueqvgn',
      1,
    );

    assert.strictEqual(result.success, true);
    assert.deepStrictEqual(JSON.parse(capturedBody.pageAppData), {
      bookId: 41382127,
      articleSlug: 'aquxnv5eccueqvgn',
      host: 'www.yuque.com',
    });
  });

  it('preserves large pageHtml truncation metadata when adding title', async () => {
    const largeHtml = `<html><head><title>Large</title></head><body>${'x'.repeat(
      3 * 1024 * 1024 + 1,
    )}</body></html>`;
    chrome.tabs.sendMessage = async (_tabId, message) => {
      if (message.action === 'getLocalStorage') {
        return { success: true, data: {} };
      }
      if (message.action === 'getPageSnapshot') {
        return {
          success: true,
          data: {
            title: 'Large Article',
            html: largeHtml,
          },
        };
      }
      return { success: false };
    };

    const { handleCapture } = require('./service-worker.js');
    let capturedBody = null;

    global.fetch = async (_url, init) => {
      capturedBody = JSON.parse(init.body);
      return new MockResponse({ jobId: 4 }, 201);
    };

    const result = await handleCapture('https://example.com/large', 1);

    assert.strictEqual(result.success, true);
    assert.strictEqual(Object.hasOwn(capturedBody, 'pageHtml'), false);
    assert.deepStrictEqual(JSON.parse(capturedBody.pageHtmlMeta), {
      __truncated__: true,
      __reason__: 'pageHtml payload exceeds 3MB limit',
      __original_size__: new TextEncoder().encode(largeHtml).length,
      title: 'Large Article',
    });
  });

  it('removes optional snapshot fields when payload remains too large after localStorage truncation', async () => {
    const largeHtml = `<html><body>${'x'.repeat(2 * 1024 * 1024)}</body></html>`;
    chrome.tabs.sendMessage = async (_tabId, message) => {
      if (message.action === 'getLocalStorage') {
        return { success: true, data: { huge: 'y'.repeat(2 * 1024 * 1024) } };
      }
      if (message.action === 'getPageSnapshot') {
        return {
          success: true,
          data: {
            title: 'Still Too Large',
            html: largeHtml,
          },
        };
      }
      return { success: false };
    };

    const { handleCapture } = require('./service-worker.js');
    let capturedInit = null;

    global.fetch = async (_url, init) => {
      capturedInit = init;
      return new MockResponse({ jobId: 5 }, 201);
    };

    const result = await handleCapture('https://example.com/too-large', 1);
    const capturedBody = JSON.parse(capturedInit.body);
    const bodySize = new TextEncoder().encode(capturedInit.body).length;

    assert.strictEqual(result.success, true);
    assert.ok(bodySize <= 2 * 1024 * 1024);
    assert.strictEqual(Object.hasOwn(capturedBody, 'pageHtml'), false);
    const localStorage = JSON.parse(capturedBody.localStorage);
    assert.strictEqual(localStorage.__truncated__, true);
    assert.strictEqual(localStorage.__reason__, 'localStorage payload exceeds 2MB limit');
    assert.ok(localStorage.__original_size__ > 2 * 1024 * 1024);
    assert.strictEqual(capturedBody.url, 'https://example.com/too-large');
    assert.strictEqual(capturedBody.cookies, '[]');
  });
});
