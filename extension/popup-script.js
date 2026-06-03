/**
 * Super Admin 采集助手 — Popup Script
 *
 * 状态机：unconfigured → ready → loading → success | error
 */

// --- DOM refs ---
const el = (id) => document.getElementById(id);
const states = ['state-unconfigured', 'state-ready', 'state-loading', 'state-success', 'state-error'];

function showState(activeId) {
  states.forEach((s) => el(s).classList.toggle('hidden', s !== activeId));
}

// --- 初始化 ---
async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = tab?.url || '未知';
  el('current-url').textContent = url;

  const config = await chrome.storage.local.get(['token', 'backendUrl']);
  if (config.token && config.backendUrl) {
    showState('state-ready');
  } else {
    showState('state-unconfigured');
  }
}

// --- 未配置 → 打开设置页 ---
el('btn-go-settings').addEventListener('click', async () => {
  const config = await chrome.storage.local.get(['backendUrl']);
  const settingsUrl = config.backendUrl || 'http://localhost:5173';
  chrome.tabs.create({ url: `${settingsUrl}/settings` });
});

// --- 采集 ---
let countdownTimer = null;

el('btn-capture').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  showState('state-loading');

  try {
    const result = await chrome.runtime.sendMessage({
      action: 'capture',
      tabUrl: tab.url,
      tabId: tab.id,
    });

    if (result.success) {
      // 成功
      el('job-id-display').textContent = `（任务 #${result.jobId}）`;
      const config = await chrome.storage.local.get(['backendUrl']);
      const baseUrl = config.backendUrl || 'http://localhost:5173';
      el('job-link').href = `${baseUrl}/jobs`;
      showState('state-success');

      // 5 秒倒计时自动关闭
      let sec = 5;
      el('countdown').textContent = `${sec} 秒后自动关闭`;
      countdownTimer = setInterval(() => {
        sec--;
        if (sec <= 0) {
          clearInterval(countdownTimer);
          window.close();
        } else {
          el('countdown').textContent = `${sec} 秒后自动关闭`;
        }
      }, 1000);
    } else {
      showError(result.error, result.detail);
    }
  } catch (err) {
    showError('extension_error', err.message);
  }
});

// --- 重试 ---
el('btn-retry').addEventListener('click', () => {
  if (countdownTimer) clearInterval(countdownTimer);
  init();
});

// --- 错误展示 ---
function showError(errorCode, detail) {
  const messages = {
    not_configured: '扩展未配置，请先前往设置页授权。',
    cookie_error: '无法获取 Cookie：' + (detail || '权限不足'),
    unauthorized: 'Token 已失效，请前往设置页重新授权。',
    server_error: '服务器错误：' + (detail || '未知'),
    timeout: '请求超时（4 分钟），请前往 Web 前端查看采集结果。',
    network_error: '无法连接后端：' + (detail || '请确认后端已启动'),
    extension_error: '扩展内部错误：' + (detail || '未知'),
  };
  el('error-message').textContent = messages[errorCode] || `未知错误：${errorCode}`;
  showState('state-error');
}

// --- 启动 ---
init();
