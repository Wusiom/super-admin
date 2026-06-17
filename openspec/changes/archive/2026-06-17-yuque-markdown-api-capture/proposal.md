## 为什么

当前语雀文档通过 HTML 快照管线采集时，会丢失大量 Markdown 结构，因为语雀 Lake Editor 的正文由 `ne-*` 自定义元素和动态卡片渲染。语雀自身已经提供可返回服务端 Markdown 的文档 API，所以对语雀页面使用该 API 直采，能从根因上解决格式错乱，同时保持通用网页采集不变。

## 改动内容

- 扩展采集 payload，在页面存在 `window.appData` 时附带语雀文档元数据。
- 后端知识采集处理器识别语雀 URL，并使用采集到的 cookie 和页面元数据调用语雀文档 API 获取 Markdown。
- 将语雀 API 的 `sourcecode` 存入 `KnowledgeItem.contentMarkdown`，可用时将 API 返回的 HTML 存入 `contentHtml`，并标记 `source = "yuque"`。
- 非语雀页面继续使用现有 HTML 快照、Readability、Turndown 管线；语雀 API 可恢复失败时也回退到该管线。
- 语雀 API 认证失败时标记为 `LOCKED_CONTENT`，不静默保存可能残缺的 fallback 内容。
- 增加聚焦测试，覆盖语雀 API 成功、fallback、认证失败，以及非语雀采集回归。

## 能力范围

### 新增能力

- 无。

### 修改能力

- `knowledge-capture`：语雀页面先尝试通过语雀文档 API 采集 Markdown，再按需回退到现有 HTML 快照管线。
- `browser-extension`：采集请求可携带从 `window.appData` 临时提取的语雀页面元数据，且不持久化。

## 影响范围

- 后端相关文件：`server/src/tools/knowledge-capture/knowledge-capture.controller.ts`、`server/src/tools/knowledge-capture/capture.processor.ts` 及相关测试。
- 扩展相关文件：`extension/service-worker.js` 及相关测试。
- API payload：`POST /api/tools/knowledge-capture/capture` 接收可选字段 `pageAppData`。
- 不需要新增数据库字段，也不需要新增 npm 运行时依赖。
- 部署时需要重建后端，并重新加载或重新打包 Chrome 扩展。
