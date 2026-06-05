# Markdown 分屏编辑器 — 设计文档

**日期**: 2026-06-05
**状态**: 设计中
**范围**: 知识采集 — 阅读/编辑体验

## 问题

知识采集后存入 `KnowledgeItem.contentMarkdown`，当前在知识列表弹窗中用 `<pre>` 标签展示原始 Markdown 源码，没有任何渲染，阅读体验差。用户需要一个 Markdown 编辑器的功能来改善阅读和编辑体验。

## 核心决策

| 决策点 | 选择 | 理由 |
|---|---|---|
| 编辑器库 | **md-editor-v3** | Vue 3 原生、CodeMirror 6 + highlight.js 代码高亮、内置分屏预览、类型完善 |
| 交互模式 | 始终分屏（左编辑 + 右预览） | 不需要模式切换，打开就能看渲染效果和源码 |
| 触发方式 | 保持现有 `@row-click` | 不改变现有交互习惯 |
| 全屏入口 | Dialog 内「全屏」按钮 → `/knowledge/edit/:id` | 弹窗适合快速浏览，全屏适合长时间编辑 |
| 保存方式 | `Ctrl+S` → `PUT /items/:id` | 无额外 UI 按钮，快捷键自然 |
| 安全 | md-editor-v3 内置 DOMPurify | XSS 防护零配置 |

## UI 结构

### 弹窗（KnowledgeList.vue dialog 内）

```
┌──────────────────────────────────────────────────────────────┐
│  深入理解 JavaScript 闭包                          [⛶ 全屏] ✕ │
├──────────────────────────────────────────────────────────────┤
│  ┌─ 编辑（CodeMirror 6）──┐ ┌─ 预览（渲染 + 高亮）─────────┐ │
│  │                        │ │                              │ │
│  │  Markdown 源码          │ │  渲染后的阅读视图              │ │
│  │                        │ │                              │ │
│  └────────────────────────┘ └──────────────────────────────┘ │
│                                                              │
│  最后保存：06-05 14:30                             Ctrl+S 保存│
└──────────────────────────────────────────────────────────────┘
```

### 全屏页（/knowledge/edit/:id）

```
┌──────────────────────────────────────────────────────────────────────┐
│ ← 返回列表    深入理解 JavaScript 闭包                    Ctrl+S 保存 │
├──────────────────────────────────────────────────────────────────────┤
│  ┌─ 编辑 ─────────────────────┐ ┌─ 预览 ───────────────────────────┐ │
│  │                            │ │                                  │ │
│  │       CodeMirror 6         │ │    Markdown 渲染 + 代码高亮       │ │
│  │                            │ │                                  │ │
│  └────────────────────────────┘ └──────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────┘
```

## 组件设计

### MarkdownEditor.vue（新增通用组件）

封装 md-editor-v3，全屏页和弹窗复用。

```
Props:
  modelValue: string    — Markdown 内容（v-model）
  height?: string       — 容器高度，默认 '60vh'

Events:
  update:modelValue — 输入变动
  save              — Ctrl+S 触发

内部行为：
  - 始终 split 模式
  - 监听 Ctrl+S → emit('save')
  - 代码高亮开箱即用
```

### MarkdownEditPage.vue（新增全屏页）

```
路由: /knowledge/edit/:id

行为：
  1. onMounted → GET /items/:id 加载内容
  2. MarkdownEditor v-model 绑定
  3. @save → PUT /items/:id → ElMessage 反馈
  4. 离开时检测未保存 → beforeunload 提示
```

### KnowledgeList.vue（修改）

改动范围：只改 dialog 内容区。

```diff
- <pre class="whitespace-pre-wrap ...">{{ currentMarkdown }}</pre>
+ <MarkdownEditor
+   v-model="currentMarkdown"
+   height="60vh"
+   @save="handleSave"
+ />
```

同时 dialog 标题栏新增「全屏」按钮 → `router.push('/knowledge/edit/' + row.id)`

## API 设计

### 新增 PUT /api/tools/knowledge-capture/items/:id

```
Request:
  Content-Type: application/json
  Body: { "contentMarkdown": "# 修改后的内容" }

Response 200:
  { "id": 1, "title": "...", "contentMarkdown": "...", "updatedAt": "..." }

Errors:
  404 → { "message": "Knowledge item not found" }
  400 → { "message": "contentMarkdown is required" }
```

## 数据流

```
点击行（现有交互）
  │
  ▼
GET /items/:id（现有 API）
  │
  ▼
Dialog 打开
  │
  ├─ MarkdownEditor (始终分屏)
  │     │
  │     ├─ [全屏] → router.push → MarkdownEditPage
  │     │               │
  │     │               └── Ctrl+S → PUT /items/:id
  │     │
  │     └── Ctrl+S → PUT /items/:id
  │
  └── 关闭弹窗 → 列表刷新
```

## 文件清单

| 文件 | 操作 | 说明 |
|---|---|---|
| `client/src/components/MarkdownEditor.vue` | 新增 | md-editor-v3 封装组件 |
| `client/src/views/knowledge/KnowledgeList.vue` | 修改 | dialog: pre → MarkdownEditor + 全屏按钮 |
| `client/src/views/knowledge/MarkdownEditPage.vue` | 新增 | 全屏编辑页面 |
| `client/src/router/index.ts` | 修改 | 新增 `/knowledge/edit/:id` 路由 |
| `client/src/api/knowledge.ts` | 修改 | 新增 `updateKnowledgeItem()` |
| `server/src/tools/knowledge-capture/knowledge-capture.controller.ts` | 修改 | 新增 `PUT /items/:id` |

## 未保存提示

- 弹窗关闭时检测 dirty 状态，弹出 `ElMessageBox.confirm` 确认
- 全屏页使用 `beforeunload` 事件防止意外离开

## 安装依赖

```bash
pnpm --filter client add md-editor-v3
```
