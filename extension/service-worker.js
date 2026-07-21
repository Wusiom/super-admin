async function getConfig() {
  return chrome.storage.local.get(['token', 'backendUrl']);
}

const MAX_CAPTURE_BODY_BYTES = 2 * 1024 * 1024;

function isAllowedExternalSender(sender) {
  const rawUrl = sender?.origin || sender?.url || '';
  if (!rawUrl) return false;

  try {
    const url = new URL(rawUrl);
    if (url.protocol !== 'http:') return false;

    return (
      url.hostname === 'localhost' ||
      url.hostname === '127.0.0.1' ||
      url.hostname === '8.130.118.128'
    );
  } catch {
    return false;
  }
}

chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  if (message.action === 'setConfig') {
    if (!isAllowedExternalSender(sender)) {
      sendResponse({ success: false, error: 'forbidden_origin' });
      return false;
    }

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
    pageTitle: '',
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
      result.pageTitle = snapshotRes.data.title || '';
    }
  } catch (err) {
    console.warn('[Super Admin] content-script snapshot failed:', err.message);
  }

  return result;
}

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

function yuqueSlugFromLocation(locationLike) {
  const pathname = locationLike && typeof locationLike.pathname === 'string'
    ? locationLike.pathname
    : '';
  const parts = pathname.split('/').filter(Boolean);
  return parts.length >= 3 ? parts[2] : '';
}

async function readYuquePageAppData(tabId) {
  if (!chrome.scripting || !chrome.scripting.executeScript) {
    return null;
  }

  try {
    const [injection] = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: () => {
        const appData = window.appData || {};
        const doc = appData.doc || appData?.data?.doc || null;
        const book = doc?.book || appData.book || {};
        const pathParts = window.location.pathname.split('/').filter(Boolean);
        return {
          bookId: doc?.bookId || doc?.book_id || book.id || book.bookId || book.book_id,
          articleSlug:
            doc?.articleSlug ||
            doc?.article_slug ||
            doc?.slug ||
            doc?.docSlug ||
            (pathParts.length >= 3 ? pathParts[2] : ''),
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

async function readDirectlyFromTab(tabId) {
  if (!chrome.scripting || !chrome.scripting.executeScript) {
    return { localStorage: {}, pageHtml: '', pageTitle: '' };
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
          pageTitle: document.title || '',
          pageHtml: document.documentElement ? document.documentElement.outerHTML : '',
        };
      },
    });

    return injection && injection.result
      ? injection.result
      : { localStorage: {}, pageHtml: '', pageTitle: '' };
  } catch (err) {
    console.warn('[Super Admin] direct tab read failed:', err.message);
    return { localStorage: {}, pageHtml: '', pageTitle: '' };
  }
}

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

function getJsonSize(value) {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

function readPageHtmlMeta(payload) {
  if (!payload.pageHtmlMeta) return {};

  try {
    const parsed = JSON.parse(payload.pageHtmlMeta);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function mergePageHtmlMeta(payload, meta) {
  payload.pageHtmlMeta = JSON.stringify({
    ...readPageHtmlMeta(payload),
    ...meta,
  });
}

function ensureCapturePayloadFits(payload) {
  let bodySize = getJsonSize(payload);

  if (bodySize > MAX_CAPTURE_BODY_BYTES) {
    payload.localStorage = JSON.stringify({
      __truncated__: true,
      __reason__: 'localStorage payload exceeds 2MB limit',
      __original_size__: bodySize,
    });
  }

  bodySize = getJsonSize(payload);
  if (bodySize <= MAX_CAPTURE_BODY_BYTES) return;

  if (payload.pageHtml) {
    delete payload.pageHtml;
    mergePageHtmlMeta(payload, {
      __truncated__: true,
      __reason__: 'request payload exceeds 2MB limit',
      __original_size__: bodySize,
    });
  }

  bodySize = getJsonSize(payload);
  if (bodySize <= MAX_CAPTURE_BODY_BYTES) return;

  if (payload.pageAppData) {
    delete payload.pageAppData;
  }

  bodySize = getJsonSize(payload);
  if (bodySize <= MAX_CAPTURE_BODY_BYTES) return;

  if (payload.pageHtmlMeta) {
    delete payload.pageHtmlMeta;
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
  if (tabState.pageAppData) {
    payload.pageAppData = JSON.stringify(tabState.pageAppData);
  }
  if (tabState.pageTitle) {
    mergePageHtmlMeta(payload, { title: tabState.pageTitle });
  }
  ensureCapturePayloadFits(payload);

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
    ensureCapturePayloadFits,
    getConfig,
    handleCapture,
    isAllowedExternalSender,
    mergePageHtmlMeta,
    normalizeYuquePageAppData,
    readDirectlyFromTab,
    readFromContentScript,
    readTabState,
    readYuquePageAppData,
    yuqueSlugFromLocation,
  };
}
