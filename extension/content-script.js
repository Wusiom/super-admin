/**
 * Super Admin 采集助手 — Content Script
 *
 * 注入到目标网页，负责正确序列化 localStorage。
 * MV3 isolated world 下不受页面 CSP 限制。
 */

/**
 * 将 Storage 接口序列化为普通对象。
 * JSON.stringify(localStorage) 在 Chrome 中返回 "{}"，
 * 因为 Storage 不是普通 JS 对象，必须手动遍历。
 *
 * @param {Storage} storage — localStorage 或 sessionStorage
 * @returns {{ [key: string]: string }} 可被 JSON.stringify 的普通对象
 */
function serializeStorage(storage) {
  const result = {};
  try {
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key !== null) {
        try {
          result[key] = storage.getItem(key);
        } catch (e) {
          // 个别 key 读取失败不影响其他
          result[key] = '[Error: ' + e.message + ']';
        }
      }
    }
  } catch (e) {
    // Storage 接口可能被禁用（第三方 iframe 等）
    result['__serialize_error__'] = e.message;
  }
  return result;
}

function createPageSnapshot() {
  return {
    title: document.title || '',
    html: document.documentElement ? document.documentElement.outerHTML : '',
  };
}

// 响应 service worker 的请求
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === 'getLocalStorage') {
    try {
      const data = serializeStorage(localStorage);
      sendResponse({ success: true, data });
    } catch (err) {
      sendResponse({ success: false, error: err.message });
    }
  }
  if (message.action === 'getPageSnapshot') {
    try {
      sendResponse({ success: true, data: createPageSnapshot() });
    } catch (err) {
      sendResponse({ success: false, error: err.message });
    }
  }
});

// 为测试导出（Node.js 环境）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { serializeStorage, createPageSnapshot };
}
