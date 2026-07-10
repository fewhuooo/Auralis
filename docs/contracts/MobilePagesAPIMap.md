# Mobile / Tablet 页面 API 与数据映射

更新时间：2026-07-10

文档状态：现行，按代码确认

权威范围：当前手机和平板页面使用的远程 API、Store、端侧服务、本地键和未接后端边界

事实来源：`Auralis-Mobile/src/pages.json`、页面 import、Store、`api/` 与 `services/`

## 全局网络与会话

- Mobile Auth Store 基址当前为 `http://127.0.0.1:8080/api`。
- 通用请求封装位于 `src/api/request.ts`。
- token 本地键：`token`、`refreshToken`、`username`。
- Sync HTTP：`/api/sync/pull`、`/api/sync/push`。
- Sync WebSocket：`ws://localhost:8080/ws/sync`。
- AI chat：`/api/ai/chat`。

风险：模拟器或真机中的 `127.0.0.1` / `localhost` 指向设备自身；必须通过环境配置或局域网地址联调。

## 数据层

| 层 | 位置 | 作用 |
| --- | --- | --- |
| Pinia | `src/store/` | 页面状态、业务数据和会话 |
| SQLite | `services/localDb.ts` | 块、任务、学科、来源、mutation、笔记 |
| Storage | `uni.get/setStorageSync` | token、偏好及轻量页面数据 |
| Remote | `api/` | Auth、Sync、AI、WebSocket |

页面存在不等于已有远程 API。下表明确区分远程、Store 和本地数据。

## 启动页

### `pages/launch/index`

- 远程 API：无。
- 输入：平台条件和设备/布局判断。
- 输出：手机首页或 Tablet 仪表盘。
- 微信行为：固定手机首页。
- 约束：只做一次性分流，不监听尺寸持续跨端跳转。

## 手机页面

### Login

路径：`pages/mobile/login/index`

| 操作 | API | Store/本地 |
| --- | --- | --- |
| 登录 | `POST /api/auth/login` | `useAuthStore` 保存 token、refreshToken、username |
| 注册 | `POST /api/auth/register` | 成功后返回登录流程 |
| 刷新 | `POST /api/auth/refresh` | 更新两类 token |
| 退出 | 无 | 删除三个本地键并回登录页 |

错误必须显示服务端 message 或网络错误；禁止吞掉失败后伪装登录成功。

### Home

路径：`pages/mobile/home/index`

- 主要数据：`useTaskStore`、`useSubjectStore`、本地任务/学科。
- 远程 API：无页面直接字面调用；数据通过 Store 和 Sync 间接进入。
- 本地交互：周日期、重点任务、快速日程、统计摘要。
- 风险：页面展示统计时必须明确来源，不能把本地派生值写成 Server Stats 契约。

### Pomodoro

路径：`pages/mobile/pomodoro/index`

- 数据：任务 Store、计时状态和本地持久化。
- 远程 API：无直接调用。
- 同步：任务完成或状态变化通过 Store/mutation 进入同步。
- 必测：后台、锁屏、页面重建和跨日计时。

### AI Search

路径：`pages/mobile/ai-search/index`

- 远程 API：`POST /api/ai/chat`，由 `chatWithAI` 调用。
- 输入：用户消息和可选上下文。
- 页面状态：历史、当前输入、生成中、成功、失败。
- 当前客户端主要使用 POST；Server 同时提供 SSE GET，但 Mobile 页面不能自动视为已接流式实现。

### Stats

路径：`pages/mobile/stats/index`

- 数据：本地任务、专注与页面统计模型。
- 远程 API：源码扫描未发现页面直接调用 `/api/stats/*`。
- 约束：若后续接 Server Stats，必须定义强类型响应并更新本文件。

### Settings

路径：`pages/mobile/settings/index`

- 数据：`useSettingsStore` 和 Storage。
- 远程 API：无直接调用。
- 内容：主题、偏好、导航到账号相关页面。

### Timeline

路径：`pages/mobile/timeline/index`

- 数据：任务 Store、本地任务、设备振动辅助。
- 远程 API：无直接调用。
- 同步：任务修改通过 Store/mutation。
- 约束：拖拽或时间编辑必须保留排序和 startTime。

### Review

路径：`pages/mobile/review/index`

- 数据：知识块 Store、本地扩展字段如 mastery/reviewAt。
- 远程 API：无直接调用。
- 风险：部分复习字段只存在 Mobile 本地表，尚无完整 Server 字段契约。

### Asset

路径：`pages/mobile/asset/index`

- 当前 import `convertHandwritingToMarkdown`，最终调用 AI 手写转换能力。
- 源码扫描未发现完整预签名上传与 Asset bind 的 Mobile 页面直接实现。
- 结论：页面存在不等于 Mobile 文件上传闭环已接通；需按实际实现补 FileStorage/Asset 调用。

### Profile

路径：`pages/mobile/profile/index`

- 数据：Auth/Settings Store 和本地用户显示值。
- 远程 API：无独立 profile API。
- 约束：禁止展示未从当前会话获得的敏感字段。

### Handwriting

路径：`pages/mobile/handwriting/index`

- 服务：手写引擎/本地状态、设备振动。
- 可用 AI：手写转换，但是否由当前页面触发以页面代码为准。
- 约束：转换前保留原始笔迹或文本，AI 失败不得丢失输入。

## Tablet 页面

Tablet 页面不进入微信产物。

### Dashboard

- 数据：Task/Subject/Settings Store 与本地统计。
- 远程 API：无页面直接调用。
- 通过 Sync Store 间接获得远程块和任务。

### Subject Hall

- 数据：`useSubjectStore`。
- 远程 API：Store 可通过 `/api/ai/chat` 生成或辅助学科内容；学科本身没有独立 Server CRUD。
- 风险：学科跨端权威尚未形成正式 API。

### Workspace

- 数据：Subject、Block、Task Store，文件/笔记服务。
- 远程 API：`chatWithAI` → `/api/ai/chat`。
- 本地服务：文件上下文、`tabletNoteRepository`、`handwritingEngine`。
- 约束：总结、知识提炼和批注保存必须区分 AI 输出与本地持久化。

### Handwriting

- 数据：`tablet_notes`、`NoteDocument`、仓库和手写引擎。
- 远程 API：当前无 Tablet notes 同步 API。
- feature flag：入口可关闭；代码和本地数据仍保留。

### Pomodoro / Review

- 数据：本地 Store 与 SQLite。
- 远程 API：无页面直接调用。
- 同步：任务/知识变化通过全局 Sync Store。

### Profile

- 数据：Settings/Auth Store。
- `getAiConfig` / `setAiConfig` 属于客户端 AI 配置使用点；禁止允许用户覆盖服务端密钥或 base URL。

### AI Search

- 远程 API：`chatWithAI` → `/api/ai/chat`。
- 数据：页面会话历史与当前上下文。
- 约束：会话列表当前是否仅本地必须在实现中明确，Server 没有会话历史 CRUD。

### Login

与手机共享 Auth Store 和 `/api/auth/*`，成功后进入 Tablet 内部导航。

## 全局同步

`App.vue` 启动实时同步：

- HTTP pull/push：`useSyncStore` → `useSyncApi`。
- WebSocket：`api/sync.ts`。
- 本地 mutation：`local_mutations`。
- 块/任务 merge：`localDb.ts`。

必须验证：未登录不连接、登录后连接、refresh 后更新 token、退出断连、离线重试、重复 mutation、delete 和冷启动。

## 当前缺口

- Mobile Auth 基址硬编码，不适合真机。
- 多数页面依赖本地 Store，没有一一对应 Server 页面 API。
- Mobile 资产上传/绑定闭环尚未由当前页面字面调用证明。
- 学科、复习扩展字段、AI 会话历史和 Tablet notes 缺完整 Server 契约。
- Stats 页面未直接接 `/api/stats/*`。
- App/微信/Tablet 真机未完成全流程联调。

## 修改规则

页面新增或删除 API 调用、Store、Storage 键、端侧表或数据来源时必须更新对应页面段落；接口本身变化同时更新 `API.md`，表字段变化同时更新 `Database.md`。
