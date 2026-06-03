/**
 * Super Admin 采集助手 — Service Worker
 *
 * 职责：
 * 1. 监听 popup 的 `capture` 消息 → 采集登录态 → fetch POST /capture
 * 2. 监听外部 `setConfig` 消息 → 写入 chrome.storage.local
 */

// --- 配置管理 ---

/**
 * 从 chrome.storage.local 读取配置
 * @returns {Promise<{token?: string, backendUrl?: string}>}
 */
async function getConfig() {
  return chrome.storage.local.get(['token', 'backendUrl']);
}

chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  if (message.action === 'setConfig') {
    const { token, backendUrl } = message;
    chrome.storage.local.set({ token: token || '', backendUrl: backendUrl || '' }).then(() => {
      sendResponse({ success: true });
    });
    return true; // 保持异步 callback
  }
  sendResponse({ success: false, error: 'Unknown action' });
});

// --- 采集流程 ---

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'capture') {
    handleCapture(message.tabUrl, message.tabId)
      .then(sendResponse)
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true; // 保持异步 callback
  }
});

/**
 * 完整采集流程：Cookie → localStorage → POST /capture
 */
async function handleCapture(tabUrl, tabId) {
  const config = await getConfig();
  if (!config.token || !config.backendUrl) {
    return { success: false, error: 'not_configured' };
  }

  // 1. 提取 Cookie
  let cookies;
  try {
    cookies = await chrome.cookies.getAll({ url: tabUrl });
  } catch (err) {
    return { success: false, error: 'cookie_error', detail: err.message };
  }

  // 2. 提取 localStorage（通过 content-script）
  let localStorageData = {};
  try {
    const res = await chrome.tabs.sendMessage(tabId, { action: 'getLocalStorage' });
    if (res && res.success) {
      localStorageData = res.data;
    }
  } catch (err) {
    // content-script 注入失败（chrome:// 页面等）→ 继续但无 localStorage
    console.warn('[Super Admin] localStorage 提取失败:', err.message);
  }

  // 3. 大小检查（2MB hard limit）
  const payload = {
    url: tabUrl,
    cookies: JSON.stringify(cookies),
    localStorage: JSON.stringify(localStorageData),
  };
  const bodySize = new TextEncoder().encode(JSON.stringify(payload)).length;
  if (bodySize > 2 * 1024 * 1024) {
    payload.localStorage = JSON.stringify({
      __truncated__: true,
      __reason__: 'localStorage payload 超过 2MB 限制',
      __original_size__: bodySize,
    });
  }

  // 4. POST /capture（4 分钟 timeout）
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 4 * 60 * 1000);

  try {
    const res = await fetch(`${config.backendUrl}/api/tools/knowledge-capture/capture`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.token}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (res.status === 401) {
      return { success: false, error: 'unauthorized' };
    }
    if (!res.ok) {
      const text = await res.text();
      return { success: false, error: 'server_error', detail: text };
    }

    const data = await res.json();
    return { success: true, jobId: data.jobId };
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      return { success: false, error: 'timeout', detail: '请求超过 4 分钟，请前往 Web 前端查看结果' };
    }
    return { success: false, error: 'network_error', detail: err.message };
  }
}

// 导出供测试使用
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { handleCapture, getConfig };
}
