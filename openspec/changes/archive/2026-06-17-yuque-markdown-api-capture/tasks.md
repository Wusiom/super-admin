## 1. 扩展采集元数据

- [x] 1.1 在 `extension/service-worker.js` 中增加轻量的 `window.appData.doc` 提取逻辑，可用时返回 `bookId`、`articleSlug` 和 `host`。
- [x] 1.2 将提取出的语雀元数据合并到 `readTabState`，不改变现有 content-script 和 direct-read fallback 行为。
- [x] 1.3 在采集请求 payload 中以 JSON 字符串形式附带可选字段 `pageAppData`。
- [x] 1.4 更新扩展单元测试，覆盖元数据存在、元数据缺失和 payload 兼容性。

## 2. 后端语雀 API 采集

- [x] 2.1 扩展知识采集 controller DTO，接收可选 `pageAppData`。
- [x] 2.2 在 `capture.processor.ts` 中增加可选 `pageAppData` 的解析和校验。
- [x] 2.3 增加语雀 URL 检测，仅将兼容的语雀文档 URL 路由到 API 采集路径。
- [x] 2.4 实现聚焦的语雀 API fetch helper：构造 cookie header，请求 Markdown mode，将 401/403 处理为 `LOCKED_CONTENT`，并在可用时读取标题和 HTML 内容。
- [x] 2.5 将成功获取的语雀 API Markdown 写入 `KnowledgeItem.contentMarkdown`，并写入 `contentHtml`、标题、`source = "yuque"`、状态和 jobId。
- [x] 2.6 保留非语雀页面、缺失元数据、可恢复语雀 API 失败时的现有 HTML 快照管线。

## 3. 后端测试

- [x] 3.1 增加 processor 测试：语雀 API Markdown 成功采集。
- [x] 3.2 增加 processor 测试：缺少语雀元数据时 fallback 到现有 HTML 管线。
- [x] 3.3 增加 processor 测试：可恢复的语雀 API 失败 fallback 到现有 HTML 管线。
- [x] 3.4 增加 processor 测试：语雀 API 401/403 产生 `LOCKED_CONTENT`，且不创建 KnowledgeItem。
- [x] 3.5 增加回归覆盖，确认非语雀采集行为保持不变。

## 4. 验证

- [x] 4.1 运行相关扩展测试套件。
- [x] 4.2 运行相关 server knowledge-capture 测试。
- [x] 4.3 运行 server build 或可用的类型检查。
- [x] 4.4 手动采集一篇标准语雀文档，确认标题、列表、代码块和图片在 Markdown 编辑器中正确显示。
