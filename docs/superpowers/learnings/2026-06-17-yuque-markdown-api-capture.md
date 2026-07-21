# 2026-06-17 语雀 Markdown API 采集经验

## 背景

本轮实现目标是：语雀文档采集优先使用语雀文档 API 返回的服务端 Markdown，而不是依赖页面渲染后的普通文本或 HTML 转 Markdown。

相关变更已经归档到 OpenSpec：

- `openspec/changes/archive/2026-06-17-yuque-markdown-api-capture/`
- `openspec/specs/browser-extension/spec.md`
- `openspec/specs/knowledge-capture/spec.md`

## 关键结论

1. 语雀线上页面不稳定暴露 `window.appData.doc`。
   实测有页面 `window.appData?.doc` 是 `undefined`，但 `window.appData?.book?.id` 和 `location.pathname` 可用。因此扩展侧不能只依赖 `appData.doc`，需要从 `appData.book.id` + URL slug 组合元数据。

2. Chrome 扩展读取语雀 Cookie 需要 `host_permissions`。
   仅有 `cookies` 权限时，`chrome.cookies.getAll({ url })` 可能返回空数组。Manifest V3 需要在 `extension/manifest.json` 增加对应 host 权限，否则后端调用语雀 API 会缺少登录态。

3. SPA 切换文档时，页面全局数据可能滞后。
   用户从一个语雀文档切到另一个文档后，扩展采集到的 `pageAppData.articleSlug` 可能仍是上一次文档。后端构造语雀 API URL 时必须优先使用提交的 `inputUrl` 解析 slug，只把 `pageAppData` 当作补充元数据。

4. BullMQ 和前端状态值要统一到实际存储模型。
   当前数据库任务成功状态是 `success`，不是 `completed`。前端筛选应传 `success`；后端可以兼容 `completed -> success`，避免旧 UI 或旧请求查不到结果。

5. SSE 增量更新不能只更新已存在行。
   当任务列表当前页已满时，新任务完成事件仍要插入顶部并裁剪页大小，否则用户会以为“采集后必须手动刷新”。

## 后续维护建议

- 调试“采集到普通文字”时，优先看最新 `Job.data` 是否包含 `pageAppData`、Cookie 数量是否大于 0、生成的 `KnowledgeItem.source` 是否为 `yuque`。
- 调试“切换文档后采错内容”时，对比 `Job.data.inputUrl` 和 `pageAppData.articleSlug`；以后端 URL 解析结果为准。
- 调试“成功列表没数据”时，检查前端传入的 `status` 参数和后端 DB 存储状态是否一致。
- 修改采集链路时，同时检查 controller、processor、extension service worker、任务列表 UI、BullMQ 生命周期测试。

## 已验证命令

- `node --test extension/service-worker-snapshot.test.js`
- `node --test extension/integration.test.js`
- `pnpm run test -- capture.processor.spec.ts --runInBand`
- `pnpm run test -- knowledge-capture.controller.spec.ts capture.processor.spec.ts --runInBand`
- `pnpm run test -- --runInBand`
- `pnpm run test -- jobs.controller.spec.ts --runInBand`
- `pnpm --filter client build`
