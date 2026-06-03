## Why

当前知识采集需要用户手动 F12 分析目标网站的 Cookie/localStorage 然后复制粘贴到采集页面，流程繁琐易出错，对非技术用户不友好。通过 Chrome 扩展自动桥接浏览器登录态，用户只需浏览到目标页面、点击扩展按钮即可完成采集——消除手动复制步骤，同时复用现有后端采集管线（Playwright → Readability → Turndown → DB）。

## What Changes

- **新增 Chrome 扩展**（MV3）：popup.html + service-worker.js + content-script.js，约 100 行代码。负责提取当前页面的 Cookie 和 localStorage，通过 HTTP 发送给后端
- **新增 ApiToken 认证体系**：数据库表 + token 生成/哈希/验证守卫，保护采集端点不被未授权调用
- **新增 Web 设置页**：`/settings` 路由，提供"授权此浏览器"按钮，通过 `chrome.runtime.sendMessage` 将 token 推送给扩展（零复制粘贴）
- **CORS 动态配置**：允许 `chrome-extension://` 来源的请求
- **Body size 上限提升**：`app.use(json({ limit: '5mb' }))` 适配极端 localStorage payload
- **CapturePage 加扩展引导 banner**：推荐使用扩展采集，保留手动输入区作为降级路径

## Capabilities

### New Capabilities
- `browser-extension`: Chrome MV3 扩展——popup UI、service-worker 调度、content-script 提取 localStorage。与后端通过 HTTP API 通信
- `api-token-auth`: 后端 API Token 基础设施——数据库 model、token 自动生成（SHA-256 哈希存储）、Bearer 验证守卫、token 刷新端点
- `extension-settings`: Web 前端设置页——扩展授权按钮、token 外发至扩展、扩展状态展示

### Modified Capabilities
<!-- 无既有 spec，此次变更不修改任何已有 capability 的 spec 级别行为 -->

## Impact

- **新增代码库**: `extension/` 顶级目录（不含构建工具，纯 JS + HTML）
- **后端新增**: `server/prisma/schema.prisma`（ApiToken model）、`server/src/core/auth/`（auth.module, api-token.service, api-token.guard, api-token.controller）
- **后端修改**: `server/src/main.ts`（CORS + body size）、`server/src/tools/knowledge-capture/knowledge-capture.controller.ts`（加守卫）
- **前端新增**: `client/src/views/settings/SettingsPage.vue`
- **前端修改**: `client/src/views/knowledge/CapturePage.vue`（加 banner）
- **前端配置**: `client/.env`（新增 `VITE_EXTENSION_ID`）
- **不改变**: 后端采集管线（captureProcessor: Playwright → Readability → Turndown → DB）保持不变
