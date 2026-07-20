# 学习助手开发基线（2026-07-20）

## 记录目的

本文记录学习助手开发开始前的可复现基线，用于区分后续改动引入的回归与仓库中已经存在的警告。所有结果均在起始提交 `78c3753f8c9fb7e0cbb05f6295afd397712df2df` 上重新执行所得，不是根据预期结果抄录。

## 执行环境

- 操作系统：`Microsoft Windows NT 10.0.26200.0`
- 时区：`Asia/Shanghai`
- Node.js：`v24.14.0`
- pnpm：`9.3.0`
- npm：`11.9.0`
- Jest CLI：`30.4.1`
- Nest CLI：`11.0.21`
- NestJS Core：`11.1.24`
- Prisma：`6.19.3`
- Vite：`8.0.14`
- TypeScript：`5.9.3`
- 工作目录：`D:\Work\super-admin\.worktrees\adaptive-learning-assistant`

## 原始基线结果

### 服务端全量 Jest

执行命令：

```powershell
& '.\node_modules\.bin\jest.CMD' --config server/package.json --runInBand
```

- 退出码：`0`
- 测试套件：`8 passed / 8 total`
- 测试：`39 passed / 39 total`
- 快照：`0 total`
- 耗时：`2.102 s`
- 既有警告：`CleanupService` 测试会输出两条预期日志，分别为 `Marked 2 stale pending jobs as failed` 和 `Marked 1 stalled running jobs as failed`；不影响退出码。
- Windows 说明：当前 pnpm 9 工作区在包级 `exec` 下无法稳定找到 Jest 二进制，因此根脚本直接使用 `node_modules\.bin\jest.CMD`，并显式传入 `--config server/package.json --runInBand`。

### 服务端构建

执行命令：

```powershell
pnpm --filter server build
```

- 退出码：`0`
- 结果：`nest build` 完成。
- 既有警告：无。

### 客户端构建

执行命令：

```powershell
pnpm --filter client build
```

- 退出码：`0`
- 结果：`vue-tsc -b && vite build` 完成，Vite 转换 `3645` 个模块，构建耗时 `1.34 s`。
- 既有警告一：第三方文件 `@vueuse/core/dist/index.js` 的 `/* #__PURE__ */` 注释位置无法被 Rolldown 解释，共出现两处，位置为 `3362:1` 与 `5780:23`。
- 既有警告二：压缩后存在大于 `500 kB` 的分块；本次较大的输出包括 `MarkdownEditor` 约 `543.02 kB` 与主 `index` 约 `1,358.10 kB`。这是非致命体积提示。

### Chrome 扩展测试

执行命令：

```powershell
node --test extension/*.test.js
```

- 退出码：`0`
- 测试套件：`5`
- 测试：`18 passed / 18 total`
- 失败、取消、跳过、待办：均为 `0`
- 耗时：`242.5915 ms`
- 覆盖文件：`extension` 目录下全部四个 `*.test.js` 文件。
- 既有警告：无。

## AppModule 确定性编译基线

新增测试通过 Nest `TestingModule` 将 `PrismaService` 与 `BullMqService` 替换为内存替身，再编译并初始化真实 `AppModule`。测试不连接真实 Redis 或数据库，也不修改生产模块。

TDD 证据：

- 有效 RED：在尚未注册 provider override 时，断言取得的 `PrismaService` 应为测试替身但实际为真实实例；单测结果为 `1 failed / 1 total`，退出码 `1`。这证明测试能发现缺失的基础设施隔离 seam。
- GREEN：加入 `.overrideProvider(PrismaService).useValue(prisma)` 与 `.overrideProvider(BullMqService).useValue(bullMq)` 后，同一测试编译并初始化成功；结果为 `1 passed / 1 total`，退出码 `0`。
- 额外说明：最初导入完整 `AppModule` 时，Jest 30 无法解析 `jsdom` 依赖链中的 ESM 文件 `@exodus/bytes/encoding-lite.js`。该错误与基础设施 seam 无关，因此没有作为 RED 证据；最终只在测试文件内 mock `jsdom` 的模块加载，未改生产行为或 Jest 全局配置。

## 根脚本

根 `package.json` 提供以下稳定入口：

- `pnpm test`：依次运行 `test:server` 与 `test:extension`。
- `pnpm run test:server`：运行 Windows Jest 全量测试入口。
- `pnpm run test:extension`：运行扩展全部 `*.test.js`。
- `pnpm run db:validate`：使用仅限当前 CLI 进程的 SQLite URL 验证 `server/prisma/schema.prisma`。
- `pnpm run db:generate`：使用同一 CLI 解析 URL，根据该 schema 生成 Prisma Client。

这些脚本只组合仓库已有工具，不新增依赖，也不改变数据库 schema。
