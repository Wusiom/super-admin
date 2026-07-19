## Why

现有知识采集功能只能保存文章，不能验证用户是否真正理解并能在新情境中调用内容。需要增加一个以主动解释、迁移验证和可追溯证据为核心的学习助手，同时把当前单用户工具升级为具备完整认证、权限和平台运维能力的多用户系统。

## What Changes

- 新增“学习助手”一级菜单，支持从已采集文章、EPUB 和文本 PDF 创建学习来源。
- 新增来源解析、内容地图、用户确认的学习单元和学习契约流程。
- 使用 LangGraph 编排可恢复的教学会话，使用 LangChain 提供模型适配和结构化输出；业务真相仍存储在 Prisma/PostgreSQL 中。
- 新增基于主动解释、追问、提示、案例和迁移任务的自适应教学循环，以及独立、来源可追溯的评价结果。
- 新增持久但可查看、禁用和重置的学习策略画像。
- 新增从用户回答提炼、必须经用户确认的原子笔记、链接建议和 Markdown 导出。
- 新增注册、邮箱验证、登录、刷新、退出和密码重置，以及 `USER`/`ADMIN` 两级 RBAC。
- 新增平台级“后台管理”，覆盖用户、工具、模型、配额、任务、系统状态和审计；学习助手配置作为工具模块配置存在。
- **BREAKING**：将全局 API Token 改为用户所有、带 `capture:create` 作用域的可撤销 Token，扩展采集结果必须归属于 Token 用户。
- **BREAKING**：将现有 `KnowledgeItem` 迁移为用户所有的 `LearningSource`/`SourceVersion`，并将 SQLite 迁移到 PostgreSQL。
- **BREAKING**：统一任务中心和工具菜单变为认证与角色感知，普通用户不能访问平台级任务、配置或诊断数据。

## Capabilities

### New Capabilities

- `user-access`: 邮箱密码认证、会话轮换、账号恢复、两级 RBAC、资源所有权和跨用户隔离。
- `learning-sources`: 文章、EPUB 和文本 PDF 的统一来源、版本、异步解析、来源锚点、内容地图与单元确认。
- `adaptive-tutoring`: 学习契约、LangGraph 会话、教学动作、评价、迁移验证、Interrupt 恢复和幂等提交。
- `learner-profile`: 有证据支持的教学策略画像，以及用户查看、禁用、删除依据和重置控制。
- `atomic-notes`: 从用户回答生成的原子笔记草稿、确认、编辑、链接建议和 Markdown 导出。
- `platform-administration`: 平台用户、工具、模型、配额、任务、系统状态和审计管理，以及内容隐私边界。

### Modified Capabilities

- `platform`: 动态菜单变为角色感知；统一任务中心增加用户所有权、管理员跨工具视图和安全重试约束。
- `knowledge-capture`: 采集任务和内容归属于认证用户，成功结果写入统一学习来源模型。
- `api-token-auth`: 全局自动生成 Token 改为用户级、带作用域、可撤销且仅显示一次的扩展 Token。
- `extension-settings`: 扩展授权改为当前用户创建或选择采集 Token，并展示撤销与重新授权状态。

## Impact

- **Backend**：新增认证、用户、学习来源、教学会话、画像、笔记和后台管理模块；调整 ToolRegistry、Job 生命周期、采集处理器和权限守卫。
- **Data**：Prisma 从 SQLite 迁移到 PostgreSQL；新增用户所有权、来源版本、学习证据、Checkpoint 关联、配额、模型配置和审计实体；文件进入对象存储抽象。
- **AI orchestration**：引入 LangGraph 和 LangChain，增加 PostgreSQL Checkpoint、结构输出校验、Prompt 版本和模型调用记录。
- **Frontend**：新增认证流程、“学习助手”工作区和角色受限的“后台管理”，覆盖已批准设计原型中的页面与状态。
- **Extension**：继续发送页面快照，但使用用户级作用域 Token，采集结果自动进入该用户的学习来源库。
- **Infrastructure**：增加 PostgreSQL、对象存储和 SMTP 配置；继续使用 Redis/BullMQ 承载异步解析与清理任务。
