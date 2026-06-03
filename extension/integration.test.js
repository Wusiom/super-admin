/**
 * 集成测试：扩展 → POST /capture 的完整消息流
 *
 * 运行方式：node --test extension/integration.test.js
 */

const { describe, it, beforeEach, afterEach, before } = require('node:test');
const assert = require('node:assert');

// --- MOCK 基础设施 ---
const mockStorage = {};

// Mock chrome.* API
global.chrome = {
  storage: {
    local: {
      async get(keys) {
        if (Array.isArray(keys)) {
          const result = {};
          keys.forEach((k) => { if (mockStorage[k] !== undefined) result[k] = mockStorage[k]; });
          return result;
        }
        return { ...mockStorage };
      },
      async set(items) {
        Object.assign(mockStorage, items);
      },
    },
  },
  cookies: { getAll: async () => [] },
  tabs: { sendMessage: async () => ({ success: true, data: {} }) },
  runtime: {
    onMessage: { addListener() {}, _listeners: [] },
    onMessageExternal: { addListener() {}, _listeners: [] },
  },
};

// Mock fetch — 由测试控制
class MockResponse {
  constructor(body, status = 200) {
    this._body = typeof body === 'string' ? body : JSON.stringify(body);
    this.status = status;
    this.ok = status >= 200 && status < 300;
  }
  async json() { return JSON.parse(this._body); }
  async text() { return this._body; }
}

const originalFetch = global.fetch;
function mockFetch(fn) {
  global.fetch = fn;
}
function restoreFetch() {
  global.fetch = originalFetch;
}

function resetState() {
  Object.keys(mockStorage).forEach((k) => delete mockStorage[k]);
  delete require.cache[require.resolve('./service-worker.js')];
}

describe('集成测试：采集消息流', () => {
  let handleCapture;

  before(() => {
    // 加载 service worker 并获取导出的 handleCapture
    const sw = require('./service-worker.js');
    handleCapture = sw.handleCapture;
  });

  beforeEach(() => {
    resetState();
  });

  afterEach(() => {
    restoreFetch();
  });

  it('已配置 + 有效 token → 201 + { jobId }', async () => {
    mockStorage.token = 'valid-token';
    mockStorage.backendUrl = 'http://localhost:3000';

    let capturedInit = null;
    mockFetch(async (url, init) => {
      capturedInit = init;
      return new MockResponse({ jobId: 123 }, 201);
    });

    const result = await handleCapture('https://example.com/article', 1);

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.jobId, 123);
    assert.strictEqual(capturedInit.headers['Authorization'], 'Bearer valid-token');
    assert.strictEqual(capturedInit.headers['Content-Type'], 'application/json');
    assert.strictEqual(capturedInit.method, 'POST');

    const body = JSON.parse(capturedInit.body);
    assert.strictEqual(body.url, 'https://example.com/article');
  });

  it('未配置 → not_configured', async () => {
    mockStorage.token = '';
    mockStorage.backendUrl = '';

    mockFetch(async () => {
      return new MockResponse({ jobId: 1 }, 201);
    });

    const result = await handleCapture('https://example.com', 1);

    assert.strictEqual(result.success, false);
    assert.strictEqual(result.error, 'not_configured');
  });

  it('401 → unauthorized', async () => {
    mockStorage.token = 'bad-token';
    mockStorage.backendUrl = 'http://localhost:3000';

    mockFetch(async () => {
      return new MockResponse({ message: 'Invalid API token' }, 401);
    });

    const result = await handleCapture('https://example.com', 1);

    assert.strictEqual(result.success, false);
    assert.strictEqual(result.error, 'unauthorized');
  });

  it('500 → server_error', async () => {
    mockStorage.token = 'valid-token';
    mockStorage.backendUrl = 'http://localhost:3000';

    mockFetch(async () => {
      return new MockResponse('Internal Server Error', 500);
    });

    const result = await handleCapture('https://example.com', 1);

    assert.strictEqual(result.success, false);
    assert.strictEqual(result.error, 'server_error');
  });

  it('网络错误 → network_error', async () => {
    mockStorage.token = 'valid-token';
    mockStorage.backendUrl = 'http://localhost:3000';

    mockFetch(async () => {
      throw new Error('ECONNREFUSED');
    });

    const result = await handleCapture('https://example.com', 1);

    assert.strictEqual(result.success, false);
    assert.strictEqual(result.error, 'network_error');
  });

  it('请求体包含 cookies 和 localStorage 的 JSON 序列化字符串', async () => {
    mockStorage.token = 'valid-token';
    mockStorage.backendUrl = 'http://localhost:3000';

    // Mock cookies
    chrome.cookies.getAll = async () => [
      { name: 'session', value: 'abc123', domain: '.example.com', path: '/' },
    ];
    // Mock localStorage via tabs.sendMessage
    chrome.tabs.sendMessage = async () => ({
      success: true,
      data: { auth: 'ls-token', theme: 'dark' },
    });

    let capturedBody = null;
    mockFetch(async (url, init) => {
      capturedBody = JSON.parse(init.body);
      return new MockResponse({ jobId: 1 }, 201);
    });

    const result = await handleCapture('https://example.com/page', 1);
    assert.strictEqual(result.success, true);

    // 验证 cookies 格式
    const cookies = JSON.parse(capturedBody.cookies);
    assert.strictEqual(cookies.length, 1);
    assert.strictEqual(cookies[0].name, 'session');

    // 验证 localStorage 格式
    const ls = JSON.parse(capturedBody.localStorage);
    assert.strictEqual(ls.auth, 'ls-token');
    assert.strictEqual(ls.theme, 'dark');
  });

  it('超大 payload > 2MB 截断 localtorage', async () => {
    mockStorage.token = 'valid-token';
    mockStorage.backendUrl = 'http://localhost:3000';

    // 生成接近 3MB 的 localStorage 数据
    const hugeValue = 'x'.repeat(1024 * 1024); // 1MB per value
    chrome.tabs.sendMessage = async () => ({
      success: true,
      data: { huge1: hugeValue, huge2: hugeValue, huge3: hugeValue },
    });
    chrome.cookies.getAll = async () => [];

    let capturedBody = null;
    mockFetch(async (url, init) => {
      capturedBody = JSON.parse(init.body);
      return new MockResponse({ jobId: 1 }, 201);
    });

    await handleCapture('https://example.com', 1);

    const ls = JSON.parse(capturedBody.localStorage);
    assert.strictEqual(ls.__truncated__, true);
    assert.ok(ls.__original_size__ > 2 * 1024 * 1024);
  });
});

describe('外部消息配置', () => {
  let sw;

  before(() => {
    resetState();
    sw = require('./service-worker.js');
  });

  it('setConfig 写入 storage', async () => {
    // 直接测试 getConfig 和 storage
    await chrome.storage.local.set({ token: 'test', backendUrl: 'http://localhost:3000' });
    const config = await sw.getConfig();
    assert.strictEqual(config.token, 'test');
    assert.strictEqual(config.backendUrl, 'http://localhost:3000');
  });
});
