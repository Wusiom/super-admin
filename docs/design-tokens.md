# 设计系统 Token 参考

暗色主题 + 金色 accent + 暖调文字。写新页面时直接用这些类名。

## 快速上手

所有 token 已映射为 Tailwind 类名，导入后即用：

```vue
<!-- 页面底色 -->
<div class="bg-ground text-foreground min-h-screen">

<!-- 卡片 -->
<div class="bg-card border border-border rounded-lg p-4">

<!-- 主按钮 -->
<el-button type="primary">提交</el-button>

<!-- 次要文字 -->
<span class="text-muted-fg">提示信息</span>

<!-- 成功/警告/危险 -->
<span class="text-success">已完成</span>
<span class="text-warning">处理中</span>
<span class="text-danger">失败</span>
```

## Token 对照表

### 底色

| Tailwind 类名 | CSS 变量 | 色值 | 用途 |
|---|---|---|---|
| `bg-ground` | `--background-deep` | `hsl(225,11%,3.5%)` `#08090A` | 页面最深底 |
| `bg-surface` | `--background` | `hsl(234,10%,7%)` `#0F1014` | 侧边栏、面板底 |
| `bg-card` | `--card` | `hsl(234,10%,10%)` `#16171C` | 卡片、表格底 |
| `bg-popover` | `--popover` | `hsl(234,10%,11%)` `#1C1D23` | 弹窗、下拉面板 |

### 文字

| Tailwind 类名 | CSS 变量 | 色值 | 用途 |
|---|---|---|---|
| `text-foreground` | `--foreground` | `hsl(44,16%,88%)` `#E6E3DB` | 正文 |
| `text-muted-fg` | `--muted-foreground` | `hsl(44,7%,67%)` `#B0ADA5` | 次要信息 |
| `text-primary` | `--primary` | `hsl(43,60%,58%)` `#D4A853` | 金色强调 |

### 边框

| Tailwind 类名 | CSS 变量 | 色值 | 用途 |
|---|---|---|---|
| `border-border` | `--border` | `hsl(234,8%,18%)` | 默认边框 |
| `ring-ring` | `--ring` | `hsl(43,60%,58%)` | 聚焦环（金色） |

### 语义色

| Tailwind 类名 | 用途 |
|---|---|
| `text-success` / `bg-success` | 成功 |
| `text-warning` / `bg-warning` | 警告 |
| `text-danger` / `bg-danger` | 危险/失败 |
| `text-info` | 信息 |

### Hairline 边框

更细的分割线，直接用：

```html
<div class="border-b border-[rgba(255,255,255,0.06)]" />
```

## Element Plus 组件

Element Plus 的 `--el-color-primary` 已覆盖为金色。直接使用 Element Plus 组件即可继承主题：

- `<el-button type="primary">` → 金色按钮
- `<el-tag type="primary">` → 金色标签
- `<el-menu>` → 自动适配暗色背景
- `<el-input>` → 聚焦态金色边框（已在 scoped style 中处理）
- `<el-checkbox>` → 选中态金色
- `<el-pagination>` → 当前页金色

## 字体

项目使用 Google Fonts（已在 `index.html` 引入）：

| 用途 | 字体 | Tailwind 用法 |
|---|---|---|
| 标题/Logo | Space Grotesk | `font-[Space_Grotesk]` |
| 正文/UI | Inter | 默认 |
| 代码/ID/状态 | JetBrains Mono | `font-[JetBrains_Mono]` |
