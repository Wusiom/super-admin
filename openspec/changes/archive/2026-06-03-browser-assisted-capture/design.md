## Context

当前知识采集流程要求用户 F12 手动分析目标网站的 Cookie/localStorage 然后复制粘贴到 `CapturePage`。此设计引入 Chrome 扩展自动桥接浏览器登录态，消除手动步骤。后端采集管线（Playwright → Readability → Turndown → DB）保持不变。

**约束：**
- 合法登录前提：用户必须已在浏览器中登录目标网站
- 不绕过付费墙：只采集用户有权限访问的内容
- 个人归档用途
- MVP 仅 Chrome（Manifest V3），通过开发者模式加载，不发布 Chrome Web Store
- 架构支持未来分发给其他用户

## Goals / Non-Goals

**Goals:**
- 用户浏览到目标页 → 点击扩展按钮 → 完成采集，无需离开页面、DevTools、理解 Cookie vs localStorage
- 扩展只做登录态桥接，不做内容提取/页面解析
- 后端新增 API Token 鉴权，保护采集端点
- Web 前端提供设置页，一键授权扩展（零复制粘贴）
- 复用现有后端采集管线，仅新增基础设施

**Non-Goals:**
- Firefox/Safari 扩展
- Chrome Web Store 发布
- 扩展内做 Readability 提取
- 后台自动采集
- 多 URL 批量采集
- sessionStorage 提取
- 多用户 / 用户登录系统
- API Token 列表管理

## Decisions

### 1. 架构：浏览器扩展 + 服务端 Playwright（vs persistentContext vs bookmarklet）

**选型理由：**
- **persistentContext**（方案 B）：改动极小但不能消除手动操作，跨机器不可移植，服务器端无法使用
- **bookmarklet**（方案 C）：仍需手动操作，不解决问题根本
- **扩展（方案 A 选中）**：用户体验最简（一键采集），架构清晰（扩展=轻量桥接，后端=重渲染引擎），扩展代码极简（~100 行），天然支持未来分发

### 2. 权限模型：`activeTab` + `cookies`

优先使用 `activeTab` 权限（仅在用户主动点击时运行），若不足以提取 Cookie 则回退为 `<all_urls>` 主机权限。需在 Step 0 Spike 中验证。

### 3. 扩展配置：Web 推送而非手动输入

API Token 由 Web 前端通过 `chrome.runtime.sendMessage(extId, ...)` 直接推送到扩展，存入 `chrome.storage.local`。用户只需点击一个按钮，无需输入框/复制粘贴。后端地址由前端自动推导。

### 4. 鉴权模型：共享密钥

MVP 使用单一 API Token（SHA-256 哈希存储），每次 `GET /api/auth/token` 生成新 token 并覆盖旧值。Token 首次启动时自动生成，控制台打印原始值。不关联用户——这是服务鉴权，不是用户鉴权。

### 5. 扩展代码零构建

三个纯 JS 文件 + 一个 HTML，不引入 Webpack/Vite。popup.html 内联 CSS + script。MV3 原生支持 JS 文件，代码量不值得引入构建工具。

### 6. CSP 兼容：`chrome.scripting.executeScript` isolated world

MV3 的 `chrome.scripting.executeScript` 在 isolated world 中注入 content-script.js，不受页面 CSP 限制。

### 7. localStorage 序列化

`JSON.stringify(localStorage)` 在 Chrome 中返回 `"{}"`（Storage 接口不是普通对象）。正确方式：遍历 `storage.length` + `storage.key(i)` + `storage.getItem(key)` 构建普通对象后序列化。

### 8. 扩展 ID 固定：manifest.json 的 `"key"` 字段

从 PEM 私钥提取公钥写入 `manifest.json` 的 `"key"` 字段，确保扩展 ID 稳定。Web 前端通过 `VITE_EXTENSION_ID` 环境变量获取固定 ID。

### 9. Payload 大小限制

NestJS `app.use(json({ limit: '5mb' }))` + 扩展端 2MB hard limit（超出截断并警告）。实际 auth token < 10KB，此限制为安全兜底。

### 10. 错误处理策略

- 未配置 → 引导前往设置页
- 后端不可达 → 连接失败提示
- 401 → 重新授权提示
- 采集成功 → "已提交 (任务 #N) [查看任务]" 链接 + 5 秒自动关闭
- 超时（4 min）→ 提示去 Web 前端查看结果

## Risks / Trade-offs

- **[跨子域 localStorage]** content-script 注入当前页面后 `localStorage` 读取的是当前 origin 的数据。若 auth token 存储在子域（如 `accounts.example.com`），扩展提取不到。已知目标网站不受影响。→ 文档中注明此限制
- **[MV3 service worker 存活]** Chrome 在 5 分钟无活动后终止 service worker。→ 扩展端 fetch 设置 4 分钟 timeout；采集通常 15-45 秒完成，极少触发
- **[CSP 极严格网站]** `script-src 'none'` + SRI 可能阻止注入。→ 需实测验证，概率极低
- **[Chrome profile 锁定]** 不涉及（与方案 B 不同，服务端 Playwright 是独立 headless 实例）
- **[扩展 ID 变更]** PEM 私钥丢失会导致扩展 ID 变化，需重新配置。→ 将 PEM 私钥纳入版本控制（仅开发用，无安全风险）
- **[Token 覆盖导致旧扩展失效]** 每次生成新 token 会覆盖旧值。→ MVP 单扩展可接受；FUTURE 改为列表管理
