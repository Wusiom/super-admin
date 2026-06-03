## Why

用户需要做多个小工具（知识采集、面试复盘、AI 总结等），但不想每个工具单独起一个项目。同时市面上的工具都是单一功能产品，没有一个轻量的"工具容器"可以让开发者像搭积木一样接入新工具。这个项目做一个可扩展的个人后台容器平台，用第一个工具（知识采集）验证插件架构，并部署上线作为全栈能力的简历证明。

## What Changes

- 新增平台核心框架：工具注册中心、动态菜单系统、统一任务队列
- 新增知识采集工具：服务端 Playwright 采集网页内容，提取为 Markdown 存入知识库
- 新增任务中心：所有工具的异步任务统一可见、可追踪、可重试
- 新增 Docker Compose 部署方案：PostgreSQL + Redis + NestJS + Vue 3 一键启动

## Capabilities

### New Capabilities

- `platform`: 后台容器核心——工具注册协议、动态菜单渲染、统一任务队列基础设施。每个工具只需编写 NestJS Module + Vue 页面 + manifest 声明即可接入系统。
- `knowledge-capture`: 知识采集工具——输入 URL，服务端 Playwright 渲染页面，Readability 提取正文转为 Markdown，存入知识库。支持查看、搜索、删除已采集内容。

### Modified Capabilities

<!-- 新项目，无已有能力需要修改 -->

## Impact

- 新建 `server/`（NestJS 后端）和 `client/`（Vue 3 前端）
- 依赖：PostgreSQL、Redis、Playwright（Chromium）
- 部署：Docker Compose，目标为 VPS 或云轻量服务器
- 数据模型：Tool、Job、KnowledgeItem 三张核心表
