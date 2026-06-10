<script setup lang="ts">
import { computed } from 'vue'
import { MdEditor } from 'md-editor-v3'
import 'md-editor-v3/lib/style.css'

interface Props {
  modelValue: string
  height?: string
}

const props = withDefaults(defineProps<Props>(), {
  height: '60vh',
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
  save: []
}>()

const model = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

function handleSave(_v: string, _h: Promise<string>) {
  emit('save')
}
</script>

<template>
  <MdEditor
    v-model="model"
    :style="{ height: height }"
    :toolbars="[]"
    :footers="[]"
    :scroll-auto="true"
    :show-code-row-number="true"
    :tab-width="2"
    theme="dark"
    preview-theme="default"
    code-theme="atom"
    placeholder="Markdown 内容..."
    @on-save="handleSave"
  />
</template>

<style>
/* md-editor-v3 dark theme overrides — match 暗金设计系统 */
.md-editor-dark {
  --md-bk-color: hsl(234, 10%, 7%);
  --md-bk-color-outstand: hsl(234, 10%, 10%);
  --md-bk-color-hover: rgba(255, 255, 255, 0.04);
  --md-bk-color-deep: hsl(234, 10%, 12%);
  --md-color: hsl(44, 16%, 88%);
  --md-color-deep: hsl(44, 7%, 67%);
  --md-color-muted: hsl(40, 5%, 41%);
  --md-border: rgba(255, 255, 255, 0.06);
  --md-border-dark: rgba(255, 255, 255, 0.04);
  --md-hover-bk-color: rgba(212, 168, 83, 0.08);
  --md-primary-color: hsl(43, 60%, 58%);
  --md-split-line-color: rgba(255, 255, 255, 0.06);
  font-family: var(--font-body, system-ui, sans-serif);
}

/* Editor pane — use JetBrains Mono */
.md-editor-dark .cm-editor {
  font-family: 'JetBrains Mono', 'Consolas', monospace;
  font-size: 13px;
  line-height: 1.7;
}

/* ================================================================
   Editor syntax highlighting — 暗金设计系统
   使用 child combinator > 确保覆盖 CodeMirror 默认 token 样式
   ================================================================ */
/* 正文色 */
.md-editor-dark .cm-editor .cm-gold-text { color: hsl(44, 16%, 88%); }
/* 关键字 — 柔和蓝 */
.md-editor-dark .cm-editor .cm-gold-kw { color: hsl(220, 50%, 65%); }
/* 字符串 */
.md-editor-dark .cm-editor .cm-gold-str { color: hsl(150, 50%, 60%); }
/* 数字 / 布尔值 */
.md-editor-dark .cm-editor .cm-gold-num { color: hsl(150, 50%, 60%); }
/* 注释 */
.md-editor-dark .cm-editor .cm-gold-cmt { color: hsl(40, 5%, 41%); font-style: italic; }
/* 标题 — 暗金色 + 加粗 */
.md-editor-dark .cm-editor .cm-gold-h,
.md-editor-dark .cm-editor .cm-gold-h1,
.md-editor-dark .cm-editor .cm-gold-h2,
.md-editor-dark .cm-editor .cm-gold-h3,
.md-editor-dark .cm-editor .cm-gold-h4,
.md-editor-dark .cm-editor .cm-gold-h5,
.md-editor-dark .cm-editor .cm-gold-h6 {
  color: hsl(43, 60%, 58%);
  font-weight: 600;
}
/* 标记符号 (# > - * `) */
.md-editor-dark .cm-editor .cm-gold-mk { color: hsl(43, 60%, 58%); }
/* 链接 */
.md-editor-dark .cm-editor .cm-gold-lnk { color: hsl(200, 60%, 65%); text-decoration: underline; }
.md-editor-dark .cm-editor .cm-gold-url { color: hsl(200, 60%, 65%); }
/* 粗体 — 暖金调白，跟正文有明显区分 */
.md-editor-dark .cm-editor .cm-gold-b { color: hsl(43, 40%, 84%); font-weight: 700; }
/* 斜体 — 稍亮于注释，有层次 */
.md-editor-dark .cm-editor .cm-gold-i { font-style: italic; color: hsl(44, 10%, 75%); }
/* 列表 */
.md-editor-dark .cm-editor .cm-gold-list { color: hsl(44, 16%, 88%); }
/* 引用 */
.md-editor-dark .cm-editor .cm-gold-q { color: hsl(40, 5%, 41%); }
/* 行内代码 */
.md-editor-dark .cm-editor .cm-gold-code { color: hsl(200, 60%, 65%); }
/* 类型 / 类名 */
.md-editor-dark .cm-editor .cm-gold-type { color: hsl(43, 60%, 58%); }
/* 运算符 */
.md-editor-dark .cm-editor .cm-gold-op { color: hsl(220, 50%, 65%); }
/* 名称 / 变量 */
.md-editor-dark .cm-editor .cm-gold-name { color: hsl(44, 16%, 88%); }
/* 删除线 */
.md-editor-dark .cm-editor .cm-gold-s { text-decoration: line-through; }
/* 元信息 */
.md-editor-dark .cm-editor .cm-gold-meta { color: hsl(40, 5%, 41%); }

/* Preview pane — use body font */
.md-editor-dark .md-editor-preview-wrapper {
  font-family: system-ui, -apple-system, sans-serif;
  font-size: 14px;
  line-height: 1.75;
}

/* Preview content styling to match design reference */
.md-editor-dark .md-editor-preview-wrapper h1 {
  font-family: 'Space Grotesk', system-ui, sans-serif;
  font-size: 22px;
  font-weight: 700;
  letter-spacing: -0.02em;
}

.md-editor-dark .md-editor-preview-wrapper h2 {
  font-family: 'Space Grotesk', system-ui, sans-serif;
  font-size: 17px;
  font-weight: 600;
}

.md-editor-dark .md-editor-preview-wrapper h3 {
  font-family: 'Space Grotesk', system-ui, sans-serif;
  font-size: 14px;
  font-weight: 600;
}

/* Code blocks in preview */
.md-editor-dark .md-editor-preview-wrapper code {
  font-family: 'JetBrains Mono', 'Consolas', monospace;
  font-size: 12px;
  background: rgba(212, 168, 83, 0.15);
  color: hsl(43, 60%, 58%);
  padding: 2px 6px;
  border-radius: 3px;
}

.md-editor-dark .md-editor-preview-wrapper pre {
  background: hsl(234, 10%, 7%);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 4px;
}

.md-editor-dark .md-editor-preview-wrapper pre code {
  background: none;
  padding: 0;
  color: hsl(44, 16%, 88%);
}

/* Bold / Strong */
.md-editor-dark .md-editor-preview-wrapper strong {
  color: hsl(43, 40%, 84%);
  font-weight: 700;
}

/* Blockquote */
.md-editor-dark .md-editor-preview-wrapper blockquote {
  border-left: 2px solid hsl(43, 60%, 58%);
  padding-left: 14px;
  color: hsl(44, 7%, 67%);
  font-style: italic;
}

/* Links */
.md-editor-dark .md-editor-preview-wrapper a {
  color: hsl(43, 60%, 58%);
}
</style>
