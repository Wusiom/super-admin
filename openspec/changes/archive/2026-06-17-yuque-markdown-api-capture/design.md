## 背景

当前知识采集依赖 Chrome 扩展发送已渲染页面的 HTML 快照。后端用 JSDOM 解析快照，用 Readability 提取正文，再用 Turndown 转成 Markdown，最后保存为已发布的 `KnowledgeItem`。

这条通用管线不适合作为语雀文档的真实数据源。语雀 Lake Editor 文档通过 `ne-*` 自定义元素和动态卡片渲染，静态 DOM 快照可能遗漏或压平标题、列表、代码块、图片等结构。语雀 Web 页面本身已经在 `window.appData` 中暴露文档身份信息，语雀文档 API 也能通过 `mode=markdown` 返回服务端生成的 Markdown。

本变更保持现有通用采集架构不变，只在扩展能提供足够页面元数据时，为语雀增加一条使用更可靠数据源的专用路径。

## 目标 / 非目标

**目标：**

- 标准语雀文档通过语雀文档 API 采集 Markdown。
- 非语雀页面采集行为保持不变。
- 扩展只负责浏览器状态采集，不负责文档转换。
- 对可恢复的语雀 API 失败，保留现有 HTML 快照 fallback。
- 对语雀认证失败给出明确失败状态，避免保存明知不完整的内容。
- 不新增数据库迁移，不新增运行时依赖。

**非目标：**

- 不实现 Lake XML 到 Markdown 的自研转换器。
- MVP 不承诺完整支持语雀表格、画板或其他非 doc 类型。
- 不修改 Markdown 编辑器、知识条目 schema 或任务生命周期。
- 不在现有采集请求流程之外持久化 cookie、localStorage 或 `window.appData`。

## 技术决策

### 后端调用语雀 API，而不是扩展直接调用

扩展只提取 `window.appData` 元数据（`bookId`、`articleSlug`、`host`），并随现有采集请求发送给后端。后端使用这些元数据和采集到的 cookie 调用语雀文档 API。

这样可以保持扩展轻量，并符合现有架构：后端 processor 负责内容提取、错误处理和持久化。备选方案是在扩展里直接拉 Markdown，但这会把抽取行为和 fallback 分支推入 service worker，让扩展职责变重。

### 在通用 HTML 管线之前增加语雀专用路径

processor 会检测语雀 URL 和有效的 `pageAppData`。两者都存在时，请求：

`https://{host}/api/docs/{articleSlug}?book_id={bookId}&merge_dynamic_data=false&mode=markdown`

当响应包含有效的 `data.sourcecode` 时，processor 将其存为 `contentMarkdown`，优先使用 API 标题，可用时将 API HTML `data.content` 存为 `contentHtml`，并标记 `source = "yuque"`。

如果 URL 不是语雀，或页面元数据缺失，则继续走现有 HTML 快照管线。

### 可恢复失败走 fallback，认证失败直接失败

网络错误、异常 API 响应、空 Markdown、缺少元数据时，回退到当前 HTML 管线。这样不牺牲可用性，也避免让语雀采集比当前行为更脆。

语雀 API 返回 `401` 或 `403` 时抛出 `LOCKED_CONTENT`。这表示用户 cookie 对文档 API 未授权，HTML 快照也很可能是登录页或残缺页面。此时明确失败，比把残缺 Markdown 当作成功结果保存更可靠。

### 复用现有数据模型

不需要新增 Prisma 字段。现有 `KnowledgeItem.contentMarkdown`、`contentHtml`、`source`、`title`、`url`、`status`、`jobId` 已足够表达结果。可选请求元数据可通过 controller DTO 和 job data 传递，无需迁移。

## 风险 / 权衡

- 语雀内部 API 结构可能变化 -> 将 API URL 构造和响应解析隔离在小 helper 中，并对非认证失败保留 HTML fallback。
- 企业版或私有语雀部署可能不同 -> 使用页面提供的 host 和采集到的 cookie，MVP 保证范围限定为标准 `*.yuque.com` 文档页。
- API 可能返回合法但过短的 Markdown -> 只有非空且有意义的 Markdown 才接受，否则 fallback。
- cookie 属于敏感数据 -> 沿用现有“仅请求内临时存在”的处理，不持久化 cookie 或 `pageAppData`。
- fallback 对语雀仍可能产出较差 Markdown -> 仅对可恢复 API 失败接受 fallback；认证失败必须显式失败，避免假成功。

## 迁移计划

1. 更新扩展采集逻辑，附带可选 `pageAppData`。
2. 更新后端 DTO 和 processor，消费可选 `pageAppData`。
3. 增加扩展 payload 行为测试和后端语雀路由测试。
4. 运行后端测试/构建和扩展单元测试。
5. 部署后端，并重新加载或重新打包 Chrome 扩展。

回滚很简单：移除或忽略 `pageAppData` 处理，processor 就会回到现有 HTML 快照管线。不涉及数据库迁移回滚。

## 待确认问题

- 企业版语雀是否使用同样的 `/api/docs/{slug}` endpoint 和响应结构？
- 语雀表格或画板文档应该显式跳过，还是允许先尝试 API、无 Markdown 时 fallback？
