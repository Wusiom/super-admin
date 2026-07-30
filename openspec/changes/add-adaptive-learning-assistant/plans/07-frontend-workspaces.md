# 前端工作区实施计划

> **供智能体执行者使用：** 必须使用子技能 `superpowers:subagent-driven-development`（推荐）或 `superpowers:executing-plans`，逐项实施本计划。步骤使用复选框（`- [ ]`）跟踪进度。

**目标：** 按已批准设计实现认证、学习助手、设置、笔记、学习者画像和平台后台管理界面，并正确处理角色与恢复状态。

**状态：** ⏳ 未开始

**架构：** 功能目录负责各自的强类型 API Client、Pinia Store、路由、View 和组件。访问 JWT 仅保存在内存中，Axios 使用单航班 Cookie 刷新。学习会话通过已认证 fetch/SSE 接收数据并只呈现一个主要任务；管理组件仅接收无法表示受保护内容的脱敏 DTO。

**技术栈：** Vue 3、TypeScript、Pinia、Vue Router、Element Plus、Tailwind、Axios/fetch、Vitest、Vue Test Utils、happy-dom。

---

### 任务 1：安装客户端测试框架并实现强类型认证

**文件：**
- 修改：`client/package.json`、`client/vite.config.ts`、`client/src/api/index.ts`、`client/src/api/auth.ts`、`client/src/stores/auth.ts`
- 新建：`client/src/test/setup.ts`、`client/src/stores/auth.spec.ts`、`client/src/api/index.spec.ts`

- [ ] 配置 `test`、happy-dom、Setup、Vue Test Utils 和 Pinia Testing；新增失败测试，覆盖访问令牌仅驻留内存、Cookie 刷新、并发 `401` 单航班处理、刷新失败登出及 localStorage 不存令牌。
- [ ] 运行 `pnpm --filter client test -- --run`；预期当前 localStorage 行为导致失败。
- [ ] 实现携带凭据的 Axios、请求 Bearer 注入、单一排队刷新 Promise、仅重试一次标记，以及强类型 `SessionUser { id, email, role, status }` Pinia 状态。
- [ ] 重新运行测试，断言 localStorage 不包含访问或刷新凭据。
- [ ] 提交：`git commit -m "feat: add safe frontend sessions"`。

### 任务 2：认证页面与路由守卫

**文件：**
- 新建：`client/src/views/auth/RegisterPage.vue`、`VerifyEmailPage.vue`、`ForgotPasswordPage.vue`、`ResetPasswordPage.vue`、`client/src/router/guards.ts`
- 修改：`client/src/views/login/index.vue`、`client/src/router/index.ts`
- 测试：`client/src/views/auth/auth-flow.spec.ts`、`client/src/router/guards.spec.ts`

- [ ] 编写失败测试，覆盖注册/验证/登录/找回/重置成功与错误、未验证状态、访客重定向、USER 禁止管理路由、ADMIN 可访问及返回原路由。
- [ ] 运行聚焦 Vitest 并确认失败。
- [ ] 实现带字段级服务端错误的表单和通用找回确认；添加公开/认证/管理路由元数据及异步会话恢复守卫。
- [ ] 重新运行测试，预期 USER 直接访问 `/admin/*` 时进入无权限/未找到页面，且不渲染管理数据。
- [ ] 提交：`git commit -m "feat: add account flows and route guards"`。

### 任务 3：导航、设置与扩展令牌

**文件：**
- 修改：`client/src/layouts/DefaultLayout.vue`、`client/src/stores/tools.ts`、`client/src/views/settings/SettingsPage.vue`
- 新建：`client/src/views/learning/manifest.ts`、`client/src/components/settings/AccountPanel.vue`、`SessionPanel.vue`、`ExtensionTokensPanel.vue`
- 测试：`client/src/layouts/DefaultLayout.spec.ts`、`client/src/views/settings/SettingsPage.spec.ts`

- [ ] 编写失败测试，覆盖启用 Manifest 后 `/learning` 显示“学习助手”、仅 ADMIN 在 `/admin` 显示“后台管理”、不存在顶级“学习助手管理”菜单、工具禁用/为空、会话撤销及扩展令牌生命周期。
- [ ] 运行聚焦测试并确认失败。
- [ ] 注册学习 ToolManifest，渲染角色感知的静态菜单项，并将设置拆分为账户/会话/扩展面板，支持令牌单次交接和撤销反馈。
- [ ] 重新运行测试，预期 USER/ADMIN 菜单矩阵通过。
- [ ] 提交：`git commit -m "feat: add role-aware navigation and settings"`。

### 任务 4：学习首页、导入、来源详情与学习契约

**文件：**
- 新建：`client/src/features/learning/api.ts`、`store.ts`、`routes.ts`；页面 `LearningHomePage.vue`、`SourceDetailPage.vue`、`LearningContractPage.vue`；组件 `ImportSourceDialog.vue`、`ParsingProgress.vue`、`ContentMapEditor.vue`
- 测试：同目录 `.spec.ts` 文件
- 修改：`client/src/router/index.ts`

- [ ] 编写失败组件测试，覆盖空状态/列表、选择已采集来源、EPUB/PDF 准入/进度/错误、扫描型 PDF 恢复、质量警告、拆分/合并/排序/跳过/确认，以及契约目标/时间/已有知识/单元范围。
- [ ] 运行聚焦 Vitest 并确认失败。
- [ ] 实现强类型 API/Store/路由和匹配原型第 2～4 屏及导入状态的组件；保留未保存编辑，有效确认前禁止开始。
- [ ] 重新运行测试，预期加载、空、禁用、错误和成功状态在桌面及窄容器宽度下均通过。
- [ ] 提交：`git commit -m "feat: build learning source setup"`。

### 任务 5：专注学习会话、证据抽屉、恢复与报告

**文件：**
- 新建：`client/src/views/learning/LearningSessionPage.vue`、`LearningReportPage.vue`、`client/src/features/learning/useTutoringStream.ts`；组件 `PrimaryTaskCard.vue`、`FeedbackCard.vue`、`SourceEvidenceDrawer.vue`、`ConceptMapDrawer.vue`、`UnitProgressDrawer.vue`、`NoteDraftDrawer.vue`
- 测试：同目录 `.spec.ts` 文件

- [ ] 编写失败测试，覆盖单一主要任务、幂等键复用、SSE 进度/内容/提交/错误、断线恢复、提示、反馈/分歧、结束确认、抽屉及完成报告区块。
- [ ] 运行聚焦测试并确认失败。
- [ ] 实现认证 fetch/SSE 解析、携带最后事件 ID 重连、禁止重复提交、公开事件渲染，以及原型第 5～6 屏和反馈/恢复状态。
- [ ] 重新运行测试，断言原始 Graph State 或隐藏 Prompt 属性均不可渲染。
- [ ] 提交：`git commit -m "feat: build focused tutoring session"`。

### 任务 6：原子笔记与学习者画像

**文件：**
- 新建：`client/src/views/learning/NotesPage.vue`、`NoteDetailPage.vue`、`LearnerProfilePage.vue`；组件 `NoteConfirmationDialog.vue`、`LinkSuggestions.vue`、`ProfileStrategyCard.vue`
- 测试：同目录 `.spec.ts` 文件

- [ ] 编写失败测试，覆盖笔记草稿/编辑/确认/拒绝、最多三条链接、逐链接确认、搜索/筛选/详情/删除/导出、画像证据/置信度/效果、证据不足，以及禁用/删除/重置控制。
- [ ] 运行聚焦测试并确认失败。
- [ ] 实现原型第 7～8 屏及全部破坏性操作确认；仅渲染 API 白名单类型和已确认导出操作。
- [ ] 重新运行测试，预期外部用户/草稿/已拒绝内容固定样例均不存在。
- [ ] 提交：`git commit -m "feat: add notes and learner profile UI"`。

### 任务 7：后台管理工作区外壳、用户与工具

**文件：**
- 新建：`client/src/features/admin/api.ts`、`routes.ts`、`AdminLayout.vue`；页面 `AdminHomePage.vue`、`AdminUsersPage.vue`、`AdminToolsPage.vue`、`LearningAssistantConfigPage.vue`
- 测试：同目录 `.spec.ts` 文件
- 修改：`client/src/router/index.ts`

- [ ] 编写失败测试，覆盖仅 ADMIN 可用的外壳、隐私提示、用户筛选/详情白名单、高风险操作原因必填、末位管理员冲突、工具启用/禁用、配置字段错误，以及学习助手配置位于 `/admin/tools/learning-assistant`。
- [ ] 运行聚焦测试并确认失败。
- [ ] 实现原型第 9～11 屏，并使用不包含内容正文字段的专用管理 DTO 类型。
- [ ] 重新运行测试，验证不存在顶级“学习助手管理”菜单。
- [ ] 提交：`git commit -m "feat: build admin users and tools UI"`。

### 任务 8：后台管理模型、配额、任务、健康与审计

**文件：**
- 新建：管理页面 `AdminModelsPage.vue`、`AdminQuotasPage.vue`、`AdminJobsPage.vue`、`AdminHealthPage.vue`、`AdminAuditPage.vue` 及配套组件
- 测试：同目录 `.spec.ts` 文件

- [ ] 编写失败测试，覆盖秘密掩码、连接测试超时/结果、不可变发布、配额默认值/覆盖原因、脱敏任务筛选/重试边界、依赖健康、审计筛选/导出及受保护字段哨兵。
- [ ] 运行聚焦 Vitest 并确认失败。
- [ ] 实现原型第 12～15 屏，包括原因对话框、状态语义、重试资格、掩码指示及脱敏导出控制。
- [ ] 重新运行测试，预期 DOM 和快照中不存在哨兵来源/答案/笔记/Prompt/秘密/Graph 数据。
- [ ] 提交：`git commit -m "feat: complete administration workspace"`。

### 任务 9：响应式视觉与完整客户端门禁

**文件：**
- 修改：`client/src/styles/index.css`、`client/src/styles/theme.css` 及受影响的学习/管理组件
- 新建：`client/src/test/accessibility.spec.ts`

- [ ] 添加断言，覆盖键盘焦点、对话框标签、不仅依赖颜色的状态文本、320 px 溢出、加载骨架、空/错误恢复、减少动态效果及原型设计 Token。
- [ ] 运行测试并检查失败。
- [ ] 在不改变已批准信息架构的前提下进行聚焦样式/可访问性修正。
- [ ] 运行完整客户端测试/构建，并人工对比每个已批准原型页面/状态；预期自动化零失败，并记录视觉偏差。
- [ ] 提交：`git commit -m "test: polish learning and admin workspaces"`。
