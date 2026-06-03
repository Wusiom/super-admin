# E2E 兼容性测试清单

## 测试环境
- Chrome 浏览器（最新稳定版）
- 服务端 `docker compose up -d` 运行中
- 扩展已通过 `chrome://extensions/` → 开发者模式 → 加载已解压的扩展程序加载
- 扩展已通过 `/settings` 页面授权

---

## 1. xiaobot.net（SPA + localStorage auth）

### 1.1 登录态采集
- [ ] 在 Chrome 中登录 xiaobot.net
- [ ] 浏览到任意专栏文章页面
- [ ] 点击扩展图标，确认 popup 显示当前 URL
- [ ] 点击「📸 开始采集」
- [ ] **期望**：显示「✅ 已提交（任务 #N）」+ 5 秒自动关闭
- [ ] **验证**：前往 `/jobs` 查看任务状态，确认采集成功且内容包含文章正文

### 1.2 未登录态采集
- [ ] 退出 xiaobot.net 登录
- [ ] 浏览到任意公开页面
- [ ] 点击「📸 开始采集」
- [ ] **期望**：成功提交任务，但采集结果可能是公开页面内容（取决于目标站权限）

---

## 2. 知识星球（Cookie auth）

### 2.1 登录态采集
- [ ] 在 Chrome 中登录知识星球（zsxq.com）
- [ ] 浏览到某个星球文章页面
- [ ] 点击扩展图标，点击「📸 开始采集」
- [ ] **期望**：成功提交任务，采集结果包含登录后才能看到的内容
- [ ] **验证**：检查 Cookie 提取是否包含知识星球的 auth cookie

### 2.2 CSP 兼容性
- [ ] 打开 DevTools Console
- [ ] 点击扩展采集
- [ ] **期望**：Console 无 CSP 相关错误（content-script 在 isolated world 中运行不受页面 CSP 限制）

---

## 3. 普通文章页（无 auth）

### 3.1 公开网页采集
- [ ] 浏览到任意公开网页（如 `https://example.com`、博客文章等）
- [ ] 点击「📸 开始采集」
- [ ] **期望**：成功提交任务，无需任何认证信息

### 3.2 特殊页面
- [ ] 测试 `chrome://` 页面（如 `chrome://extensions/`）
- [ ] **期望**：popup 正常显示但 localStorage 提取失败（chrome:// 页面无法注入 content script），Cookie 提取也可能为空

- [ ] 测试 `about:blank`
- [ ] **期望**：popup 正常显示，无崩溃

- [ ] 测试本地文件 `file:///...`
- [ ] **期望**：popup 正常显示，注意 `file://` 页面的 Cookie/localStorage 权限

---

## 4. CSP 兼容性

### 4.1 严格 CSP 页面
- [ ] 找到或搭建一个设置了 `script-src 'none'` CSP header 的页面
- [ ] 点击扩展采集
- [ ] **期望**：content-script 仍能正常注入并提取 localStorage（MV3 isolated world 不受 CSP 限制）

### 4.2 HTTPS 页面
- [ ] 浏览到 HTTPS 页面
- [ ] 点击扩展采集
- [ ] **期望**：Cookie 提取正常（Secure cookies 可通过 `chrome.cookies.getAll` 获取）

---

## 5. 错误场景

### 5.1 后端未启动
- [ ] 停止服务端（`docker compose stop server`）
- [ ] 点击扩展采集
- [ ] **期望**：显示「无法连接后端」错误提示

### 5.2 Token 已失效
- [ ] 在 `/settings` 点击「授权此浏览器」生成新 token（覆盖旧 token）
- [ ] 旧扩展（未更新的）点击采集
- [ ] **期望**：显示「Token 已失效，请重新授权」

### 5.3 超大 localStorage
- [ ] 在目标页面中运行 JS 创建超大 localStorage（> 2MB）：
  ```js
  let big = '';
  for (let i = 0; i < 500000; i++) big += 'x';
  for (let i = 0; i < 10; i++) localStorage.setItem('big_' + i, big);
  ```
- [ ] 点击扩展采集
- [ ] **期望**：提交成功但 localStorage 被截断（包含 `__truncated__` 标记）
- [ ] **验证**：服务端采集使用截断的 localStorage，Cookie 仍完整

---

## 6. 回归测试

### 6.1 Web 前端采集不受影响
- [ ] 打开 CapturePage（`/knowledge/capture`）
- [ ] 手动输入 URL 点击「开始采集」（不使用扩展）
- [ ] **期望**：与之前行为一致，采集正常提交

### 6.2 设置页功能
- [ ] 打开 `/settings`
- [ ] **期望**：显示扩展安装步骤 + 授权按钮
- [ ] 点击「🔑 授权此浏览器」
- [ ] **期望**：显示「✅ 扩展已授权」
- [ ] 刷新页面
- [ ] **期望**：状态保持（扩展已检测到）

### 6.3 CapturePage banner
- [ ] 打开 `/knowledge/capture`
- [ ] **期望**：顶部显示蓝色扩展引导 banner
- [ ] 点击 banner 中的「查看安装指南 →」
- [ ] **期望**：跳转到 `/settings`

---

## 测试结果

| 场景 | 结果 | 备注 |
|------|------|------|
| 1.1 xiaobot 登录态采集 | ⬜ | |
| 1.2 xiaobot 未登录 | ⬜ | |
| 2.1 知识星球登录态 | ⬜ | |
| 2.2 CSP 兼容性 | ⬜ | |
| 3.1 公开网页 | ⬜ | |
| 3.2 特殊页面 | ⬜ | |
| 4.1 严格 CSP | ⬜ | |
| 4.2 HTTPS 页面 | ⬜ | |
| 5.1 后端未启动 | ⬜ | |
| 5.2 Token 失效 | ⬜ | |
| 5.3 超大 localStorage | ⬜ | |
| 6.1 回归-Web 采集 | ⬜ | |
| 6.2 回归-设置页 | ⬜ | |
| 6.3 回归-Banner | ⬜ | |
