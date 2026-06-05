async function getConfig() {
  return chrome.storage.local.get(['token', 'backendUrl']);
}

chrome.runtime.onMessageExternal.addListener((message, _sender, sendResponse) => {
  if (message.action === 'setConfig') {
    const { token, backendUrl } = message;
    chrome.storage.local.set({ token: token || '', backendUrl: backendUrl || '' }).then(() => {
      sendResponse({ success: true });
    });
    return true;
  }
  sendResponse({ success: false, error: 'Unknown action' });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === 'capture') {
    handleCapture(message.tabUrl, message.tabId)
      .then(sendResponse)
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }
});

async function readFromContentScript(tabId) {
  const result = {
    localStorage: {},
    pageHtml: '',
  };

  try {
    const localStorageRes = await chrome.tabs.sendMessage(tabId, {
      action: 'getLocalStorage',
    });
    if (localStorageRes && localStorageRes.success && localStorageRes.data) {
      result.localStorage = localStorageRes.data;
    }
  } catch (err) {
    console.warn('[Super Admin] content-script localStorage failed:', err.message);
  }

  try {
    const snapshotRes = await chrome.tabs.sendMessage(tabId, {
      action: 'getPageSnapshot',
    });
    if (snapshotRes && snapshotRes.success && snapshotRes.data && snapshotRes.data.html) {
      result.pageHtml = snapshotRes.data.html;
    }
  } catch (err) {
    console.warn('[Super Admin] content-script snapshot failed:', err.message);
  }

  return result;
}

async function readDirectlyFromTab(tabId) {
  if (!chrome.scripting || !chrome.scripting.executeScript) {
    return { localStorage: {}, pageHtml: '' };
  }

  try {
    const [injection] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const localStorageData = {};
        try {
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key !== null) {
              localStorageData[key] = localStorage.getItem(key);
            }
          }
        } catch (err) {
          localStorageData.__serialize_error__ = err.message;
        }

        return {
          localStorage: localStorageData,
          pageHtml: document.documentElement ? document.documentElement.outerHTML : '',
        };
      },
    });

    return injection && injection.result
      ? injection.result
      : { localStorage: {}, pageHtml: '' };
  } catch (err) {
    console.warn('[Super Admin] direct tab read failed:', err.message);
    return { localStorage: {}, pageHtml: '' };
  }
}

async function readTabState(tabId) {
  const fromContentScript = await readFromContentScript(tabId);
  if (fromContentScript.pageHtml) {
    return fromContentScript;
  }

  const fromDirectRead = await readDirectlyFromTab(tabId);
  return {
    localStorage:
      Object.keys(fromContentScript.localStorage).length > 0
        ? fromContentScript.localStorage
        : fromDirectRead.localStorage,
    pageHtml: fromDirectRead.pageHtml,
  };
}

function attachPageHtmlIfSmall(payload, pageHtml) {
  if (!pageHtml) return;

  const htmlSize = new TextEncoder().encode(pageHtml).length;
  if (htmlSize <= 3 * 1024 * 1024) {
    payload.pageHtml = pageHtml;
  } else {
    payload.pageHtmlMeta = JSON.stringify({
      __truncated__: true,
      __reason__: 'pageHtml payload exceeds 3MB limit',
      __original_size__: htmlSize,
    });
  }
}

async function handleCapture(tabUrl, tabId) {
  const config = await getConfig();
  if (!config.token || !config.backendUrl) {
    return { success: false, error: 'not_configured' };
  }

  let cookies;
  try {
    cookies = await chrome.cookies.getAll({ url: tabUrl });
  } catch (err) {
    return { success: false, error: 'cookie_error', detail: err.message };
  }

  const tabState = await readTabState(tabId);
  const payload = {
    url: tabUrl,
    cookies: JSON.stringify(cookies),
    localStorage: JSON.stringify(tabState.localStorage),
  };
  attachPageHtmlIfSmall(payload, tabState.pageHtml);

  const bodySize = new TextEncoder().encode(JSON.stringify(payload)).length;
  if (bodySize > 2 * 1024 * 1024) {
    payload.localStorage = JSON.stringify({
      __truncated__: true,
      __reason__: 'localStorage payload exceeds 2MB limit',
      __original_size__: bodySize,
    });
  }

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
      return {
        success: false,
        error: 'timeout',
        detail: 'Request exceeded 4 minutes. Check the web app for job result.',
      };
    }
    return { success: false, error: 'network_error', detail: err.message };
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    attachPageHtmlIfSmall,
    getConfig,
    handleCapture,
    readDirectlyFromTab,
    readFromContentScript,
    readTabState,
  };
}
