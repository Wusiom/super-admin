## Context

当前知识采集系统将抓取的网页内容转为 Markdown 存入 `KnowledgeItem.contentMarkdown`，但查看时仅用 `<pre>` 展示源码——无渲染、无编辑。设计文档 `docs/superpowers/specs/2026-06-05-markdown-editor-design.md` 已确定核心方案。

**约束**:
- 前端: Vue 3 + Element Plus + Tailwind CSS v4
- 后端: NestJS + Prisma + SQLite
- 暗金设计系统: 深色主题，金色强调，Space Grotesk / JetBrains Mono 字体
- 不改变现有采集流程，只改变阅读/编辑体验

## Goals / Non-Goals

**Goals:**
- 弹窗内分屏编辑器: 左 Markdown 源码（CodeMirror 6 编辑）+ 右渲染预览
- 全屏编辑页: 独立路由 `/knowledge/edit/:id`，更大的编辑空间
- `Ctrl+S` 保存语义，前后端完整流程
- 未保存离开提示（弹窗 confirm / 全屏 beforeunload）
- 代码块语法高亮、XSS 防护（md-editor-v3 内置 DOMPurify）

**Non-Goals:**
- 不提供"仅编辑"或"仅预览"单栏模式——始终分屏，零模式切换
- 不实现多人协作/版本历史
- 不改变知识采集管道

## Decisions

### 编辑器库: md-editor-v3

| 选项 | 排除理由 |
|---|---|
| @kangc/v-md-editor | Vue 2 遗留，Vue 3 支持不完整，CmMirror 5 |
| milkdown | 插件生态复杂，开箱分屏需要额外配置 |
| bytemd | Svelte 内核，Vue wrapper 不成熟 |
| **md-editor-v3** | ✅ Vue 3 原生 + CodeMirror 6 + highlight.js + DOMPurify + 内置分屏 + 类型完善 |

### 交互模式: 始终分屏

不做"编辑 / 预览 / 分屏"模式切换。打开即看到源码和渲染结果各占一半。理由: 减少 UI 状态，减少用户认知负担，用户打开弹窗的目标就是快速阅读 + 偶尔修改，不需要模式切换耗费步骤。

### 保存方式: Ctrl+S 快捷键，无按钮

理由:
- 工具栏上加保存按钮会占用宝贵的编辑区垂直空间
- `Ctrl+S` 是文本编辑器的通用心理模型
- 底部状态栏显示快捷键提示，可发现性足够

### 触发方式: 保持现有 `@row-click`

不改变 CaptureConsole 中点击「查看」按钮查看详情的现有交互——只替换弹窗内部内容。

### 全屏入口: Dialog 标题栏「全屏」按钮 → 独立路由

弹窗适合快速浏览，全屏适合长时间编辑。独立路由支持浏览器前进/后退。

## Risks / Trade-offs

- **md-editor-v3 包体积**: ~300KB gzipped（CodeMirror 6 + highlight.js），首次加载时可能略慢 → 由 Vite code-split 按需加载缓解
- **编辑器 v-model 双向绑定**: 弹窗关闭时组件销毁、dirty 状态检测需要额外逻辑 → 通过 `watch` + `beforeunload` 覆盖
- **XSS**: 用户可能粘贴恶意 Markdown → md-editor-v3 内置 DOMPurify 零配置
