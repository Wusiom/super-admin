/**
 * 编辑器语法高亮 — 暗金设计系统配色
 *
 * 参考 designs/markdown-editor-v0.html 中的代码高亮样式
 *
 * 使用显式 CSS class 名，配合 MarkdownEditor.vue 中的样式规则。
 * 这样避免了依赖 StyleModule 自动生成的不可预测类名。
 */

import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags } from '@lezer/highlight'
import type { Extension } from '@codemirror/state'

const goldHighlight = HighlightStyle.define(
  [
    // 关键字 → .cm-gold-kw
    { tag: tags.keyword, class: 'cm-gold-kw' },
    // 字符串
    { tag: [tags.string, tags.special(tags.string)], class: 'cm-gold-str' },
    // 数字 / 布尔值 / 常量
    {
      tag: [tags.number, tags.bool, tags.constant(tags.name), tags.standard(tags.name)],
      class: 'cm-gold-num',
    },
    // 注释
    { tag: [tags.comment], class: 'cm-gold-cmt' },
    // 标题 (# ## …) — 覆盖整个标题行
    { tag: tags.heading, class: 'cm-gold-h' },
    { tag: tags.heading1, class: 'cm-gold-h1' },
    { tag: tags.heading2, class: 'cm-gold-h2' },
    { tag: tags.heading3, class: 'cm-gold-h3' },
    { tag: tags.heading4, class: 'cm-gold-h4' },
    { tag: tags.heading5, class: 'cm-gold-h5' },
    { tag: tags.heading6, class: 'cm-gold-h6' },
    // 标记符号 (# > - * `)
    { tag: tags.processingInstruction, class: 'cm-gold-mk' },
    // 链接
    { tag: tags.link, class: 'cm-gold-lnk' },
    { tag: tags.url, class: 'cm-gold-url' },
    // 粗体
    { tag: tags.strong, class: 'cm-gold-b' },
    // 斜体
    { tag: tags.emphasis, class: 'cm-gold-i' },
    // 列表
    { tag: tags.list, class: 'cm-gold-list' },
    // 引用
    { tag: tags.quote, class: 'cm-gold-q' },
    // 行内代码
    { tag: tags.monospace, class: 'cm-gold-code' },
    // 类型 / 类名 / 命名空间
    { tag: [tags.typeName, tags.className, tags.namespace], class: 'cm-gold-type' },
    // 运算符
    { tag: [tags.operator, tags.operatorKeyword], class: 'cm-gold-op' },
    // 删除线
    { tag: tags.strikethrough, class: 'cm-gold-s' },
    // 元信息
    { tag: tags.meta, class: 'cm-gold-meta' },
    // 名称 / 变量 / 函数 — 正文色（无特殊颜色，只保证不被默认主题覆盖）
    {
      tag: [
        tags.name,
        tags.function(tags.variableName),
        tags.labelName,
        tags.variableName,
        tags.attributeName,
        tags.propertyName,
      ],
      class: 'cm-gold-name',
    },
  ],
  {
    // 默认所有未匹配 token 使用正文色，防止默认主题残留高亮
    all: 'cm-gold-text',
  },
)

export function goldHighlightExtension(): Extension {
  return syntaxHighlighting(goldHighlight)
}
