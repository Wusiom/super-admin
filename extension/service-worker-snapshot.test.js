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

describe('service worker page snapshot capture', () => {
  beforeEach(() => {
    delete require.cache[require.resolve('./service-worker.js')];
  });

  afterEach(() => {
    global.fetch = originalFetch;
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
  });

  it('falls back to direct tab execution when content-script has no snapshot', async () => {
    const originalSendMessage = chrome.tabs.sendMessage;
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

    chrome.tabs.sendMessage = originalSendMessage;
  });
});
