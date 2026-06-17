## MODIFIED Requirements

### Requirement: Login state extraction

扩展 SHALL 在用户发起采集时提取当前页面的 cookies 和 localStorage，并且 SHALL NOT 将它们持久化到任何存储。扩展 SHALL 在可用时从 `window.appData` 提取语雀文档元数据，并且 SHALL NOT 将该元数据持久化到任何存储。

#### Scenario: Cookie extraction

- **WHEN** 用户在已配置扩展中点击“采集”
- **THEN** service worker 调用 `chrome.cookies.getAll({url: tab.url})`，并将结果包含在采集请求 payload 中

#### Scenario: localStorage extraction via content script

- **WHEN** service worker 需要当前页面的 localStorage 数据
- **THEN** 它通过 `chrome.scripting.executeScript` 向当前 tab 注入 `content-script.js`，并通过 `chrome.tabs.sendMessage` 接收序列化后的 localStorage 数据

#### Scenario: localStorage serialization correctness

- **WHEN** `content-script.js` 序列化 `localStorage`
- **THEN** 它 SHALL 使用 `storage.length`、`storage.key(i)` 和 `storage.getItem(key)` 遍历 Storage 接口并生成普通对象，而不是直接调用 `JSON.stringify(localStorage)`

#### Scenario: Yuque page metadata extraction

- **WHEN** 用户在已配置扩展中点击“采集”，且当前页面暴露 `window.appData.doc`
- **THEN** service worker 从页面上下文提取 `bookId`、`articleSlug` 和 `host`
- **AND** 提取出的元数据作为 `pageAppData` 包含在采集请求 payload 中

#### Scenario: Yuque page metadata unavailable

- **WHEN** 用户在未暴露兼容 `window.appData.doc` 的页面点击“采集”
- **THEN** 扩展省略 `pageAppData` 或将其发送为 null
- **AND** 采集请求仍包含正常的 URL、cookies、localStorage 和页面快照字段

#### Scenario: Credentials and page metadata never persisted

- **WHEN** cookies、localStorage 和 `pageAppData` 从当前页面被提取
- **THEN** 它们 SHALL 只在采集请求期间存在于内存中，并且 SHALL NOT 写入 `chrome.storage` 或任何持久化存储

### Requirement: Backward-compatible capture request format

扩展 SHALL 使用与现有 `CapturePage.vue` Web 表单相同的 JSON 格式发送采集请求，并为站点专用 processor 支持可选页面元数据。

#### Scenario: Capture request payload format

- **WHEN** 扩展向 `POST /api/tools/knowledge-capture/capture` 发送采集请求
- **THEN** 请求 body 包含 `url` 字符串、JSON 字符串形式的 `cookies`、JSON 字符串形式的 `localStorage`，并带有 `Authorization: Bearer <token>` header

#### Scenario: Optional Yuque metadata payload format

- **WHEN** 扩展为已提取语雀元数据的页面发送采集请求
- **THEN** 请求 body 包含 JSON 字符串形式的 `pageAppData`，其中包含 `bookId`、`articleSlug` 和 `host`
- **AND** 现有请求字段保持不变

#### Scenario: Request timeout handling

- **WHEN** 采集请求超过 4 分钟仍无响应
- **THEN** 扩展取消请求，并显示提示，让用户到 Web 前端查看结果
