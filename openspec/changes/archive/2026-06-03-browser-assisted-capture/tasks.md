## 1. Spike — 权限验证

- [x] 1.1 创建最小 MV3 扩展（manifest.json + 空 popup），声明 `activeTab` + `cookies` 权限，在目标网站（小报童/知识星球）测试 `chrome.cookies.getAll({url})`，决定最终权限策略

## 2. 后端 ApiToken 基础设施

- [x] 2.1 在 `server/prisma/schema.prisma` 新增 `ApiToken` model（id, token SHA-256 hash, label, createdAt）并生成迁移
- [x] 2.2 创建 `server/src/core/auth/` 目录，实现 `api-token.service.ts`：`crypto.randomBytes(32)` 生成 64 字符 hex token → SHA-256 哈希 → 入库；首次启动自动生成并在控制台打印；后续启动不覆盖
- [x] 2.3 实现 `api-token.guard.ts`：提取 `Authorization: Bearer <token>` → SHA-256 哈希 → 查 DB 比对 → 通过/拒绝
- [x] 2.4 实现 `api-token.controller.ts`：`GET /api/auth/token` 生成新 raw token + 覆盖旧哈希 + 返回 `{ token }`
- [x] 2.5 创建 `auth.module.ts` 注册服务、守卫、控制器

## 3. 后端适配

- [x] 3.1 修改 `server/src/main.ts`：CORS 改为动态 origin 函数，允许 `http://localhost:5173` + `chrome-extension://` 来源
- [x] 3.2 修改 `server/src/main.ts`：`app.use(json({ limit: '5mb' }))`
- [x] 3.3 在 `knowledge-capture.controller.ts` 添加 `@UseGuards(ApiTokenGuard)`（与现有 session 认证共存）

## 4. Chrome 扩展

- [x] 4.1 创建 `extension/` 顶级目录，生成 PEM 密钥对 → 提取公钥写入 `manifest.json` 的 `"key"` → 算出固定扩展 ID → 填入 `client/.env`（`VITE_EXTENSION_ID`）
- [x] 4.2 创建 `extension/manifest.json`：MV3，权限 `activeTab` + `storage` + `cookies` + `scripting`，`externally_connectable.matches` 包含 localhost 和生产域名，复用 `client/public/browser-plugin-icon.svg` 为图标
- [x] 4.3 实现 `extension/content-script.js`：正确遍历 `localStorage`（`storage.length` / `storage.key(i)` / `storage.getItem(key)`）序列化为普通对象，响应 `getLocalStorage` 消息
- [x] 4.4 实现 `extension/service-worker.js`：监听 popup 的 `capture` 消息 → `chrome.cookies.getAll({url})` → `chrome.tabs.sendMessage` 获取 localStorage → `JSON.stringify` → `fetch POST /capture`（4 分钟 timeout）；监听 `chrome.runtime.onMessageExternal` 的 `setConfig` 消息 → 写入 `chrome.storage.local`
- [x] 4.5 实现 `extension/popup.html`：内联 CSS + HTML + script，含未配置引导（前往设置页按钮）、采集按钮（显示当前 URL）、loading/成功/错误状态、"查看任务"链接、成功 5 秒后自动关闭

## 5. Web 前端

- [x] 5.1 创建 `client/src/views/settings/SettingsPage.vue`：显示扩展安装步骤、"授权此浏览器"按钮（调 `GET /api/auth/token` → `chrome.runtime.sendMessage(extId, { setConfig })`）、扩展状态指示（已授权/未检测到）
- [x] 5.2 添加 `/settings` 路由（`client/src/router/index.ts`）和 DefaultLayout 侧边栏入口
- [x] 5.3 在 `CapturePage.vue` 顶部添加扩展引导 banner："💡 推荐使用 Chrome 扩展一键采集"，保留手动输入区

## 6. 文档

- [x] 6.1 更新部署文档：补充 Chrome 扩展加载步骤（`chrome://extensions/` → 开发者模式 → "加载已解压的扩展"）、扩展 ID 固定说明、PEM 私钥管理、生产环境 `externally_connectable` 配置

## 7. 验证

- [x] 7.1 单元测试：`content-script.js` 的 `serializeStorage()` 函数（覆盖正常数据、空 Storage、特殊字符 key/value）
- [x] 7.2 集成测试：使用 mock 后端验证扩展 → `POST /capture` 的完整消息流（请求格式、token header、错误响应处理）
- [x] 7.3 端到端兼容性测试：xiaobot.net（SPA + localStorage auth）、知识星球（Cookie auth）、普通文章页（无 auth）；CSP 兼容性验证
