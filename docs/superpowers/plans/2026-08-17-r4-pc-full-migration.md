# R4 PC Full Client Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 Auralis-PC 的正式 Web/Tauri 客户端一次性迁移到当前 OpenAPI 直 DTO、短期 ticket 实时事件、用户隔离本地数据和完整 Tauri 运行时边界，完成 R4-01、R4-02、R4-03 的可验证实现。

**Architecture:** 保留现有正式 PC 路由和视觉页面边界，以 `runtime -> request -> typed API -> Store -> local repository/view` 为数据流；云端接口只消费 `src/api/generated/schema.ts` 的 DTO 类型，浏览器和 Tauri 共用业务代码，只有运行时地址、SQLite/浏览器本地存储和 Tauri invoke 有平台分支。实时层先申请一次性 ticket，再连接 `/ws/events`；同步层以服务端 cursor、快照 reset 和带 `baseVersion` 的本地 mutation 为唯一增量边界。

**Tech Stack:** Vue 3, TypeScript, Pinia, Axios/fetch, Vite, Tauri 2, `tauri-plugin-sql`, WebSocket, SSE, Node built-in test runner, PowerShell, Docker Compose。

## Global Constraints

- 修改前继续遵守 `AGENTS.md`，保护现有用户改动；`Auralis-PC/src/api/generated/schema.ts` 只能由 OpenAPI 生成脚本更新，禁止手工编辑。
- PC 正式路由保持 `/login`、`/`、`/subjects`、`/subject/:id`、`/asset`、`/timeline`、`/profile`、`/pomodoro`；不借 R4 恢复归档页面，不修改 Mobile/Tablet 或后端 Controller/数据库迁移。
- 客户端成功响应只接受直 DTO；错误只接受 RFC 9457 Problem Details。生产代码不得读取旧 `Result`/`code`/`data` 包装，不得保留 `/ws/sync`、token 放在 WebSocket URL、旧 `afterId`/`lastMutationId`/`truncated` 或固定生产地址。
- 运行时地址来自 `VITE_API_BASE_URL`、`VITE_WS_BASE_URL`、`VITE_DEV_API_TARGET`、`VITE_DEV_WS_TARGET`；Web 构建允许同源回退，Tauri 运行时必须显式配置，生产主路径不得依赖 `localhost` 或 `127.0.0.1`。
- 本地实体必须包含 `userId`、`version`、`deletedAt`、`syncStatus`；本地 mutation 必须包含 `clientMutationId`、`resourceType`、`resourceId`、`mutationType`、`baseVersion`、`payload`。冲突不使用静默 last-write-wins，快照 reset 不得删除待上传 mutation。
- access token、refresh token、ticket、Provider key 不得写入普通日志、URL 查询参数或提交到仓库；退出登录必须清理当前用户作用域的内存会话和浏览器临时状态。
- 每个任务先添加可失败的测试或静态断言，再实现，再运行该任务的定向命令；没有命令输出证据不宣称任务完成。代码存在、构建通过、自动测试通过和业务验收分别记录。

## Task 1: 建立 R4 PC 红灯检查与运行时配置边界

**Files:** Create `Auralis-PC/scripts/check-r4-pc.mjs`, `Auralis-PC/scripts/r4-pc-protocol.test.mjs`, `Auralis-PC/src/config/runtime.ts`, `Auralis-PC/src/types/api.ts`; modify `Auralis-PC/package.json`, `Auralis-PC/.env.example`.

- [ ] 在 `check-r4-pc.mjs` 中限定扫描 `src/api`、`src/store`、`src/services`、`src/views`、`src/router`、`src/App.vue` 和 `src-tauri/src`，断言旧包装字段、`/ws/sync`、旧同步字段、生产固定地址和 URL token 不存在；允许测试、文档和 `vite.config.ts` 的开发代理说明单独处理。
- [ ] 在 `r4-pc-protocol.test.mjs` 先写 Node built-in tests，覆盖 `parseProblemDetails`、`isProblemDetails`、`normalizeCursor`、`isNewerCursor`、`dedupeEventKey` 的边界：空错误、单个事件重复、数字 cursor 字符串化和 reset 标记。
- [ ] 定义运行时接口并实现只读解析：

  ```ts
  export interface RuntimeConfig {
    apiBaseUrl: string;
    websocketBaseUrl: string;
    devApiTarget?: string;
    devWebsocketTarget?: string;
    isTauri: boolean;
  }

  export function getRuntimeConfig(env: Record<string, string | undefined>): RuntimeConfig;
  export function resolveWebsocketUrl(relativeOrAbsolute: string, config: RuntimeConfig): string;
  ```

- [ ] 在 `types/api.ts` 中定义客户端公共类型 `ApiProblem`、`AuthSession`、`SyncCursorState`、`RealtimeEvent`、`LocalEntity<T>`、`LocalMutation`，字段名与当前 API/Database 文档一致，cursor 统一在客户端边界以字符串保存。
- [ ] 为 `npm.cmd run check:r4-pc` 和 `npm.cmd run test:r4-pc` 增加脚本；先运行并确认现有旧代码让静态检查失败，记录失败文件和原因，再提交测试/配置基线。

**Commands and expected evidence:**

```powershell
Set-Location Auralis-PC
npm.cmd run test:r4-pc
node scripts/check-r4-pc.mjs
```

预期：协议测试通过；静态检查以当前旧 `/ws/sync`、旧同步字段或旧响应包装报告失败，作为后续迁移的红灯基线。

## Task 2: 迁移 HTTP 传输、Problem Details 和刷新队列

**Files:** Modify `Auralis-PC/src/api/request.ts`, `Auralis-PC/src/config/runtime.ts`, `Auralis-PC/src/types/api.ts`; add `Auralis-PC/src/api/httpError.ts`; update `Auralis-PC/src/api/generated/client.ts` only through the generator if transport typing requires it.

- [ ] 先扩展 `r4-pc-protocol.test.mjs`，断言 `unwrapDirectDto` 保留 `204` 空响应、拒绝 `{code,data}`、将 Problem Details 映射为 `ApiProblemError`，并断言并发 401 只调用一次 refresh。
- [ ] 将 Axios 实例改为使用 `getRuntimeConfig(import.meta.env).apiBaseUrl`，导出 `apiClient` 和一个只返回 DTO 的泛型请求函数；响应拦截器不再检查 `response.data.code`，错误拦截器只解析 `application/problem+json` 或 Problem Details JSON。
- [ ] 实现单飞刷新队列：`refreshAccessToken(refreshToken)` 只请求 `{refreshToken}`，同一时间的原请求等待同一个 Promise；refresh 失败时清空会话并跳转 `/login`，不把 token 放入错误文本或日志。
- [ ] 保留非敏感请求追踪字段，禁止打印 Authorization、Cookie、refreshToken、ticket 和请求体中的 Provider key；为请求函数添加 `signal` 和 `timeout` 透传。
- [ ] 运行 HTTP 纯协议测试、TypeScript 检查和静态检查，确认旧 wrapper 相关断言只剩未迁移调用点。

**Commands and expected evidence:**

```powershell
Set-Location Auralis-PC
npm.cmd run test:r4-pc
npm.cmd run type-check
```

预期：HTTP 协议测试通过；类型检查只允许显示尚未迁移的业务调用错误，不再出现 request 层自身的 wrapper 类型错误。

## Task 3: 完成 Auth DTO、设备身份和路由守卫

**Files:** Modify `Auralis-PC/src/api/useAuthApi.ts`, `Auralis-PC/src/store/useAuthStore.ts`, `Auralis-PC/src/router/index.ts`, `Auralis-PC/src/views/Login.vue`; add `Auralis-PC/src/auth/deviceIdentity.ts`.

- [ ] 先为 `deviceIdentity.ts` 写纯函数测试：稳定生成/读取 UUID、平台值只允许 `WEB`/`WINDOWS`、设备名不超过接口约束；测试不能读取真实 token。
- [ ] 按 `API.md` 实现 `login`、`register`、`refresh`、`logout`、`listSessions`、`revokeSession` 的直 DTO 调用。登录和注册请求必须包含 `deviceId`、`deviceName`、`platform`。
- [ ] 将 Store 状态改为 `user`、`tokens`、`sessionId`、`deviceId`、`isHydrated`，持久化只保存必要会话信息；恢复时校验字段完整性，异常数据整体丢弃。
- [ ] 导出 `resolveAuthRedirect(path, requiresAuth, hasSession)`，路由 `beforeEach` 使用它保护 Dashboard 和其他正式页面；登录页已登录时回到 `/`，未登录访问受保护页回到 `/login`。
- [ ] 登录页补齐 loading、Problem Details 字段错误和注销后的清理行为；不在页面中直接写 localStorage key 或 axios。

**Commands and expected evidence:**

```powershell
Set-Location Auralis-PC
npm.cmd run test:r4-pc
npm.cmd run type-check
npm.cmd run build
```

预期：Auth/路由测试通过，构建成功，`useAuthApi.ts` 和 `useAuthStore.ts` 不再引用旧 response wrapper。

## Task 4: 接入 realtime ticket 与 cursor 驱动事件流

**Files:** Create `Auralis-PC/src/api/realtime.ts`, `Auralis-PC/src/services/realtimeController.ts`; modify `Auralis-PC/src/api/tauri.ts`, `Auralis-PC/src/App.vue`, `Auralis-PC/src/store/useSyncStore.ts`.

- [ ] 先添加 realtime 测试：ticket 响应中的相对 `websocketUrl` 能按 Web/Tauri 配置解析；重复事件只消费一次；连接关闭后使用新 ticket，禁止复用旧 ticket。
- [ ] 实现 `requestRealtimeTicket(deviceId)` 调用 `POST /api/realtime/ticket`，实现 `RealtimeController.start()`、`stop()`、`reconnect()`；WebSocket 只连接 `/ws/events?ticket=...`，不发送旧 PING，不把 access token 放入 URL。
- [ ] 事件处理只接受 `{type,resourceType,resourceId,cursor,occurredAt}`，按 cursor 去重并调用 `useSyncStore.pullChanges({ reason: 'realtime' })`；网络恢复、401、ticket 过期分别走有界退避和重新申请 ticket。
- [ ] `App.vue` 在认证会话建立/退出时管理 controller 生命周期；`tauri.ts` 只保留 Rust invoke（数据库、文件、窗口等），删除旧 Redis 数组解析、旧 block/task 通知和固定 WebSocket 地址。
- [ ] 运行定向协议测试和静态检查，确认 `/ws/sync`、`PING/PONG`、`lastMutationId` 等旧实时实现全部消失。

## Task 5: 建立覆盖全域的 typed API 边界

**Files:** Create `Auralis-PC/src/api/useSubjectApi.ts`, `useKnowledgeApi.ts`, `useTaskApi.ts`, `useSourceApi.ts`, `useRelationApi.ts`, `useReviewApi.ts`; modify `useAssetApi.ts`, `useStatsApi.ts`, `aiClient.ts`; add `Auralis-PC/src/api/sse.ts`.

- [ ] 先为每组 API 写路径/DTO 契约测试，断言请求方法、路径、查询参数和 body 使用 `schema.ts` 中的 DTO 类型，不允许直接 `axios.get/post` 绕过 `request.ts`。
- [ ] 实现以下 wrapper 方法并让返回值为 generated DTO 或明确的 `AsyncIterable`：

  ```ts
  listSubjects(params?: { cursor?: string; limit?: number }): Promise<SubjectView[]>;
  getKnowledgeBlocks(subjectId: string, params?: PageQuery): Promise<KnowledgeBlockView[]>;
  listTasks(params?: TaskQuery): Promise<TaskView[]>;
  createUploadIntent(body: AssetUploadIntentRequest): Promise<AssetUploadIntentView>;
  completeUpload(assetId: string, body: AssetCompleteRequest): Promise<AssetView>;
  getReviewQueue(params: ReviewQuery): Promise<ReviewItemView[]>;
  getStatsOverview(params: StatsQuery): Promise<StatsOverviewView>;
  streamAiMessage(body: AiMessageRequest, signal?: AbortSignal): AsyncIterable<AiStreamEvent>;
  ```

- [ ] 将 Asset 从旧 presigned/bind 流程迁移到 upload-intent、对象存储上传、complete、download-url；上传失败只能保留明确的本地 pending 状态，不能伪造云端成功。
- [ ] `sse.ts` 解析 `event`/`data`/空行，支持 abort、服务器 Problem Details 和连接结束；`aiClient.ts` 删除 `/api/ai/chat`、`/api/ai/ingest` 等旧路径，改用 API 文档中的 conversation/message、ingest、task extraction 和 context 接口。
- [ ] 运行 API 契约测试和类型检查，确保正式 Store 不再依赖 `any` 返回值。

## Task 6: 重写用户隔离的本地 repository 与 SQLite schema

**Files:** Modify `Auralis-PC/src/services/localDb.ts`, `Auralis-PC/src/types/api.ts`; add `Auralis-PC/src/services/localRepository.ts`, `Auralis-PC/src/services/localSchema.ts`, `Auralis-PC/src/services/legacyLocalData.ts`.

- [ ] 先写本地 schema 测试：同一设备的两个 `userId` 不能互读；`deletedAt` 记录 tombstone；`version`/`baseVersion` 不匹配时返回 conflict；snapshot reset 保留所有 pending mutation。
- [ ] 为 Tauri SQLite 定义版本化 schema：`sync_metadata(user_id, device_id, cursor, reset_required, schema_version)`、带 `user_id/version/deleted_at/sync_status` 的资源表、`local_mutations(client_mutation_id, user_id, resource_type, resource_id, mutation_type, base_version, payload, status)`；所有查询必须带 `user_id` 条件。
- [ ] 为浏览器 fallback 使用带 userId/deviceId 前缀的 localStorage/IndexedDB 逻辑；不再使用未命名的全局 `auralis_*` 业务数据 key。
- [ ] 实现 `LocalRepository` 的 `read/list/upsert/tombstone/enqueueMutation/listPending/markApplied/saveCursor/replaceSnapshotPreservingPending`，把 snake_case 仅限制在数据库适配层，返回前转换为 camelCase DTO。
- [ ] 对已有未归属旧数据执行可恢复迁移：复制到 `legacy_unassigned` 备份空间，首次登录仅显示“导入当前账号”或“保留未归属备份”的明确选择；不得静默把旧数据归入任意账号，也不得无确认删除。
- [ ] 运行本地 repository 测试，使用临时 SQLite 数据库和独立 localStorage namespace，证明用户隔离、tombstone 和 pending 保留。

## Task 7: 迁移 cursor sync API 和 Store

**Files:** Modify `Auralis-PC/src/api/useSyncApi.ts`, `Auralis-PC/src/store/useSyncStore.ts`, `Auralis-PC/src/services/localRepository.ts`; add `Auralis-PC/src/types/sync.ts`.

- [ ] 先写 sync 测试覆盖：空 cursor 首次拉取、`resetRequired=true`、服务端快照覆盖本地 tombstone、push partial failure、重复 `clientMutationId` 和冲突返回。
- [ ] 实现新接口：

  ```ts
  pullChanges(input: { cursor?: string; limit?: number }): Promise<SyncPullResponse>;
  pushChanges(input: { deviceId: string; mutations: LocalMutation[] }): Promise<SyncPushResponse>;
  getSnapshot(): Promise<SyncSnapshotResponse>;
  ```

  `SyncPullResponse` 只使用当前 contract 的 `cursor/events/resetRequired` 语义，不再暴露 `afterId`、`lastMutationId` 或 `truncated`。
- [ ] Store 以 `cursor`、`resetRequired`、`isPulling`、`isPushing` 和 `lastSyncError` 为状态；realtime 事件、启动恢复和网络恢复都调用同一 `pullChanges`。
- [ ] reset 流程先把远端 snapshot 写入当前用户作用域，再重放 pending mutations；push 成功仅标记服务端确认的 mutation，冲突进入可见 conflict 状态并保留 payload。
- [ ] 删除旧 cold-start hard delete 和旧 block/task merge；用 resource/version/deletedAt 统一合并 Subjects、KnowledgeBlocks、Tasks、Sources、Assets、Relations、Reviews。
- [ ] 运行 sync 定向测试和 `check:r4-pc`，静态断言不得命中任何旧 cursor 字段。

## Task 8: 迁移 Subject、KnowledgeBlock、Source、Asset 主流程

**Files:** Modify `Auralis-PC/src/store/useSubjectStore.ts`, `Auralis-PC/src/views/SubjectHall.vue`, `Auralis-PC/src/views/SubjectWorkspace.vue`, `Auralis-PC/src/views/Asset.vue`; add `Auralis-PC/src/store/useKnowledgeStore.ts`, `useSourceStore.ts`, `useAssetStore.ts`.

- [ ] 先添加 Store mapping tests，使用固定 DTO fixture 验证 subject/source/asset/knowledge block 的字段转换、分页 cursor、deletedAt 和 optimistic mutation 记录。
- [ ] `useSubjectStore` 改为 typed API 优先、local repository 缓存；创建、重命名、归档、排序和切换 subject 都携带当前 userId、version 和 `clientMutationId`。
- [ ] `useKnowledgeStore` 管理 workspace blocks、关联 source/asset 和加载状态；workspace 读取远端 DTO 后写入本地，离线时只读当前用户缓存并显示离线状态。
- [ ] `useSourceStore` 和 `useAssetStore` 完成 source/asset/relation API、upload intent/complete/download-url；删除、关联和上传状态不能只改内存数组。
- [ ] `SubjectHall`、`SubjectWorkspace`、`Asset` 删除直接 axios、旧 snake_case 和伪造本地云端 ID；AI 摘要、资料关联和上下文查询改调用 typed API。
- [ ] 运行 Store mapping、组件类型检查和 PC build，人工确认正式三页能从登录会话进入并显示空态、加载态、错误态、离线态。

## Task 9: 迁移 Task、Review、Stats 和剩余正式页面

**Files:** Modify `Auralis-PC/src/store/useTaskStore.ts`, `useStatsStore.ts`, `useReviewStore.ts`, `useChatStore.ts`, `src/views/Dashboard.vue`, `Timeline.vue`, `Profile.vue`, `Pomodoro.vue`; add missing typed Stores under `Auralis-PC/src/store/` as needed by the existing route components.

- [ ] 先写 domain mapping tests，验证 Task 状态/时间字段、Review queue、Stats query range、Timeline event 和 Pomodoro 本地状态都通过统一类型，不接受旧字段 `loadText`、`startTime` 等作为云端 DTO。
- [x] `useTaskStore` 改为 Task API + local repository + sync mutation；任务创建、拖拽排序、完成、删除和 subject 关联均记录 version/baseVersion。
- [x] `useReviewStore`、`useStatsStore` 使用 API 文档要求的 query 参数和 direct DTO；Dashboard、Timeline 只读 Store，不直接调用 axios 或 localDb。
- [x] Profile 展示当前 Auth DTO 的 user/session/device 状态并支持会话撤销；Pomodoro 将计时器 UI 状态与可同步任务状态分离，刷新页面不丢 pending mutation。
- [x] `useChatStore` 仅管理 conversation/message/citation 的本地缓存和 SSE 状态，不再把旧本地 chat 表当成云端事实；R4 Store mapping、类型检查和构建通过。

执行记录（2026-08-20）：Task/Review/Stats mapping 已覆盖，`test:r4-pc` 为 51/51；当前仍保留第一项未勾选，因为 Timeline event 与 Pomodoro store 尚未拥有独立的组件级测试。

## Task 10: 完成 AI 对话、资料摄取和上下文主流程

**Files:** Modify `Auralis-PC/src/store/useChatStore.ts`, `Auralis-PC/src/views/SubjectWorkspace.vue`, `Auralis-PC/src/components/**` 中实际使用旧 AI 接口的组件; add `Auralis-PC/src/services/aiStreamController.ts`.

- [ ] 先写 SSE/controller tests，覆盖首 token、多个 event、abort、Problem Details、断线重连不重复追加消息和 citation 顺序稳定。
- [x] `aiStreamController` 接收 `conversationId`、消息内容和当前知识库 context，调用 typed AI API，把增量事件归并为一个可重试的 assistant message；取消请求不标记为成功。当前 API 的 `AiMessageCommand` 不含独立 `subjectId` 字段，subject context 通过 retrievalEnabled/topK 和消息上下文传递。
- [ ] 资料摄取先创建/更新 source 和 asset，再调用 ingest/context API；任务抽取和日程建议写入待确认结果，不能直接静默创建任务或修改日历。
- [ ] Workspace 的摘要、AI context、相关资料和聊天面板全部从 Store 获取状态；Provider 未配置、限流、超时和无检索结果分别显示可理解的 Problem Details/UI 状态。
- [x] 运行 SSE reducer、Store、类型、构建和静态检查，确认生产源码没有旧 `/api/ai/chat`、`/api/ai/ingest/file` 等路径。

执行记录（2026-08-20）：SSE reducer 覆盖 delta、completed fallback 和 citation 去重；`check:r4-pc` 扫描 57 个生产文件通过。Controller 的独立 abort/Problem Details/重连测试与资料摄取真实服务验证仍待联调阶段。

## Task 11: 完成 Vite/Web/Tauri 运行时与权限边界

**Files:** Modify `Auralis-PC/vite.config.ts`, `Auralis-PC/src-tauri/tauri.conf.json`, `Auralis-PC/src-tauri/capabilities/default.json`, `Auralis-PC/src-tauri/src/lib.rs`, `Auralis-PC/package.json`; add `Auralis-PC/src-tauri/capabilities/production.json` if the installed Tauri version supports split capability files.

- [x] 先写配置测试，断言 dev API/WS target 只从环境读取，Tauri capability 不授予未使用的 shell/http/fs 权限，SQL 仅打开应用数据目录中的数据库。
- [x] Vite 代理改为 `VITE_DEV_API_TARGET` 和 `VITE_DEV_WS_TARGET`；`tauri.conf.json` 的 `devUrl` 和 `beforeDevCommand` 仅服务本地开发，打包运行时从显式环境/配置读取 API/WS base URL。
- [x] Rust 端仅保留当前必要 invoke 和 SQL/日志插件；配置 `sql:default`、`log:default` 和最小化文件权限，未把 access token 或 ticket 交给 Rust 日志。
- [ ] 检查 Windows installer、bundle identifier、自动更新/升级和 uninstall data retention 的现有配置；将“安装/升级/卸载后的数据保留”作为手工证据边界记录，不把打包通过写成安装验收通过。
- [ ] 运行 `npm.cmd run build` 和 `npm.cmd run tauri -- build`，保存构建日志和生成物路径；若环境缺少 Tauri bundler 依赖，只记录准确阻断，不改成假通过。

执行记录（2026-08-20）：runtime config 测试 3/3、Web build 和 `tauri -- build --no-bundle` 通过，应用本体位于 `Auralis-PC/src-tauri/target/release/app.exe`；完整 `tauri build` 在 MSI/WiX bundling 阶段返回宿主 `拒绝访问 (os error 5)`，installer/升级/卸载仍未验证。

## Task 12: 全量验证、文档回写和 G4 证据

**Files:** Modify `docs/current/Status.md`, `docs/current/IssuesAndReview.md`, `docs/modules/FrontendPC.md`, `docs/design/Frontend.md`, `docs/contracts/API.md` only for verified client-boundary changes, `docs/contracts/Database.md` only for verified local schema changes, `docs/planning/PreDeploymentReadinessTasks.md`, `docs/release/Changelog.md`, and `docs/README.md`.

- [ ] 先运行静态和单元检查：

  ```powershell
  Set-Location Auralis-PC
  npm.cmd run check:r4-pc
  npm.cmd run test:r4-pc
  npm.cmd run type-check
  npm.cmd run build
  npm.cmd run tauri -- build
  Set-Location ..
  .\scripts\check-openapi.ps1 -SkipExport
  .\scripts\check-docker-compose.ps1
  ```

  预期：R4 静态检查、协议测试、类型检查、Web 构建、Tauri 构建和 OpenAPI/Compose 检查均有可复制输出；失败项原样记录。
- [ ] 启动 Compose 后执行最小前后端联调：注册/登录带设备字段、refresh、获取 realtime ticket、连接 `/ws/events`、subject/task CRUD、upload intent/complete、cursor pull/push、reset 保留 pending、AI SSE；每一步保存请求/响应摘要但脱敏 token/key。
- [ ] 用浏览器和 Windows Tauri GUI 分别完成登录、工作台、资料、任务、时间线、个人资料、番茄钟主路径；记录“代码存在/构建/自动测试/GUI 验收/安装升级”五类证据。
- [ ] 仅在证据齐全后更新 R4-01、R4-02、R4-03 和 G4 勾选，回写已知风险；若 Tauri 安装或真实 Provider 尚未验证，保持对应风险未关闭。
- [ ] `git diff --check`、`git status --short` 和文档索引检查通过后，创建一个聚合提交；不自动 push，等待用户明确要求发布。

## Completion Criteria

- 所有正式 PC 页面和 Store 已通过当前 OpenAPI DTO/API 边界，成功响应无旧 wrapper，错误响应为 Problem Details。
- Auth 使用设备维度会话和刷新队列；realtime 使用一次性 ticket、`/ws/events` 和 cursor 去重；代码中不存在旧 `/ws/sync`、旧 cursor 字段或生产固定地址。
- Subject、KnowledgeBlock、Task、Source、Asset、Relation、Review、Stats、AI 主流程均有 typed API、用户隔离本地缓存和可追踪 sync mutation。
- 浏览器 fallback 与 Tauri SQLite 均按 userId 隔离，reset 不丢 pending mutation，冲突不会静默 last-write-wins。
- Web build、Tauri build、R4 静态/协议检查、OpenAPI/Compose 检查和已执行的手工边界证据均已记录；未完成的真实 Provider、GUI 安装升级或外部环境事项明确列为未关闭风险。
