## 1. 依赖安装

- [x] 1.1 安装 md-editor-v3: `pnpm --filter client add md-editor-v3`

## 2. 后端 API

- [x] 2.1 新增 `PUT /api/tools/knowledge-capture/items/:id` 接口（controller + validation）
- [x] 2.2 编写 controller 单元测试（200/404/400）

## 3. 核心组件

- [x] 3.1 新增 `client/src/components/MarkdownEditor.vue`（封装 md-editor-v3，v-model + Ctrl+S + 始终分屏）
- [x] 3.2 新增 `client/src/api/knowledge.ts` 中的 `updateKnowledgeItem()` API 方法

## 4. 路由与页面

- [x] 4.1 新增路由 `/knowledge/edit/:id` → `MarkdownEditPage`（`router/index.ts`）
- [x] 4.2 新增 `client/src/views/knowledge/MarkdownEditPage.vue`（加载 + 编辑 + 保存 + beforeunload）

## 5. Dialog 改造

- [x] 5.1 `KnowledgeList.vue`: dialog 内容区 `<pre>` → `<MarkdownEditor>`，新增全屏按钮
- [x] 5.2 实现 dialog 关闭时的 dirty 检测与 `ElMessageBox.confirm` 提示

## 6. 验证

- [ ] 6.1 手动验证：弹窗分屏编辑 → Ctrl+S 保存 → 全屏按钮 → 全屏页编辑 → 未保存离开提示
- [ ] 6.2 验证 XSS 防护：粘贴含 `<script>` 的 Markdown，确认预览区不执行
