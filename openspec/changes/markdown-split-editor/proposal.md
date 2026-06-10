## Why

知识采集后存入 `KnowledgeItem.contentMarkdown`，当前在知识列表弹窗中用 `<pre>` 标签展示原始 Markdown 源码，无渲染、无编辑能力，阅读体验差。用户需要一个分屏编辑器——左侧编辑 Markdown 源码，右侧实时预览渲染结果——同时支持快速编辑和保存。

## What Changes

- 新增 `MarkdownEditor.vue` 通用组件，封装 `md-editor-v3`，始终分屏模式（左编辑 + 右预览）
- 弹窗（`CaptureConsole.vue` dialog）内容区从 `<pre>` 替换为 `MarkdownEditor`，dialog 标题栏新增「全屏」按钮
- 新增全屏编辑页 `MarkdownEditPage.vue`，路由 `/knowledge/edit/:id`
- 新增 `PUT /api/tools/knowledge-capture/items/:id` 接口，支持更新 Markdown 内容
- 新增 `Ctrl+S` 保存语义，编辑器内快捷键触发更新
- 安装 `md-editor-v3` 依赖

## Capabilities

### New Capabilities

- `markdown-editor`: 分屏 Markdown 编辑与预览——左编辑（CodeMirror 6 + 语法高亮）右预览（DOMPurify 安全渲染），含全屏页入口、Ctrl+S 保存、未保存提示
- `knowledge-item-update`: 通过 `PUT /items/:id` 更新已采集知识条目的 Markdown 内容，含 404/400 错误处理

### Modified Capabilities

- `knowledge-capture`: 查看知识条目详情的 UI 从纯文本 `<pre>` 变为分屏编辑器；新增 contentMarkdown 更新 API

## Impact

- **前端依赖**: 新增 `md-editor-v3`（Vue 3 原生、CodeMirror 6 + highlight.js + DOMPurify）
- **前端新增**: `client/src/components/MarkdownEditor.vue`、`client/src/views/knowledge/MarkdownEditPage.vue`
- **前端修改**: `CaptureConsole.vue`（dialog 内容区）、`router/index.ts`（新增路由、移除 /knowledge/list）、`api/knowledge.ts`（新增 API 方法）
- **前端删除**: `KnowledgeList.vue`（功能已合并到 CaptureConsole）
- **后端修改**: `knowledge-capture.controller.ts`（新增 `PUT /items/:id`）
- **无数据库变更**: 复用现有 `KnowledgeItem.contentMarkdown` 字段
