# R4 PC 全量客户端迁移与 Tauri 重写设计

更新时间：2026-08-17

状态：待用户审阅

## 目标

直接将 `Auralis-PC` 全量切换到冻结的 Auralis 新契约，覆盖鉴权、HTTP 请求基础层、运行时地址、所有主页面 API、Pinia Store、cursor 同步、本地数据库和 Tauri 桌面边界；移除尚未上线的旧响应包装、旧 `/ws/sync`、固定本机地址、旧 cursor 模型和旧本地字段。

本设计覆盖 R4-01、R4-02、R4-03 的全部 PC 内容，不迁移 Mobile/Tablet 页面，不修改后端 Controller 或服务器数据库迁移。真实 Provider、浏览器/Tauri GUI、Windows 安装升级和人工业务验收仍单列为验收证据，不把构建结果写成已验收。

## 已确认的契约

- REST 业务成功响应为直接 DTO，不使用旧 `{ code, data, message }` 包装。
- Auth 使用 `/api/auth/register`、`/login`、`/refresh`、`/logout`、`/me` 和 `/sessions`。
- 注册和登录请求必须携带 `deviceId`、`deviceName`、`platform`；PC device ID 使用持久化 UUID。
- access token 只放在 `Authorization: Bearer`；refresh token 只提交给 refresh endpoint，不放入 WebSocket URL。
- 错误使用 Problem Details，至少读取 `status`、`code`、`detail`、`traceId` 和 `fieldErrors`。
- Realtime 先调用 `POST /api/realtime/ticket`，再使用服务端返回的 `websocketUrl` 连接 `/ws/events`；ticket 一次性、短期有效，重连必须重新申请。
- Realtime 事件包含 `type`、`resourceType`、`resourceId`、`cursor`、`occurredAt`；WebSocket 只通知，业务数据仍通过 REST/Sync 拉取。
- Sync 使用 `GET /api/sync/pull?cursor&limit`、`POST /api/sync/push` 和 `GET /api/sync/snapshot`，过期 cursor 通过 `resetRequired=true` 触发 snapshot，而不是旧 `afterId/truncated/lastMutationId`。

## 方案选择

### 方案 A：保留旧 request，额外增加新适配器

不采用。它能降低首轮破坏面，但会继续保留两套错误、刷新、地址和 WebSocket 语义；R4 后续迁移必须同时维护两条主路径，且容易把旧接口误当成兼容层。

### 方案 B：直接重写 PC 基础请求与实时链路

只重写基础请求、Auth、Sync、路由守卫和实时入口，业务页面继续分阶段迁移。不采用，因为本轮已经确认需要一次完成 PC 迁移。

### 方案 C：一次性迁移所有 PC 页面、本地模型和 Tauri（采用）

直接删除旧 PC API/Store/本地同步语义，按冻结 OpenAPI 重新建立统一调用链；一次迁移 Dashboard、SubjectHall、SubjectWorkspace、Asset、Timeline、Profile、Pomodoro 和 AI 伴读相关数据流，并同步 Tauri SQL、权限和构建配置。旧 API 从未部署，因而不保留线上兼容层；风险通过模块化提交、测试和人工验收边界控制。

## 架构与模块边界

### 运行时配置

新增单一运行时配置模块，读取：

- `VITE_API_BASE_URL`：REST 基址；Web 默认允许为空并使用当前 origin，Tauri/跨域部署必须显式提供。
- `VITE_WS_BASE_URL`：可选 WebSocket 基址；未提供时从 REST 基址的 `http/https` 推导 `ws/wss`。
- `VITE_DEV_API_TARGET`、`VITE_DEV_WS_TARGET`：仅用于 Vite 开发代理，不进入生产请求逻辑。

配置模块负责清理末尾 `/`、解析相对 `websocketUrl`，并在 Tauri 环境缺少必要基址时 fail-fast。生产代码不出现 `127.0.0.1`、`localhost` 或旧 `/ws/sync`。

### HTTP 请求基础层

`Auralis-PC/src/api/request.ts` 重写为新契约 transport：

- 默认返回直接 DTO，204 返回 `undefined`。
- 请求统一带 `Authorization`，登录、注册、刷新和公开健康接口不强制带 token。
- 401 只允许单次 refresh；并发请求进入队列；refresh 成功后重试原请求一次。
- refresh 失败时清理会话、停止实时连接并跳转 `/login`。
- 非 2xx 统一转换为可展示的 `ApiProblem`，保留稳定 `code` 和 `traceId`，日志不得输出 token、refresh token 或 API key。
- 生成 SDK 的路径、方法、参数和响应类型作为调用边界；`schema.ts` 继续由脚本生成，禁止手改。

### Auth Store 与路由

`useAuthStore` 负责 access token、refresh token、用户公开资料、sessionId、deviceId 和会话状态。device ID 为 PC 本地持久化 UUID，不能随每次登录变化。登录/注册 API wrapper 在发送请求前补齐 PC 的 device metadata。

路由守卫改为纯同步判定：

- 受保护路由且没有 access token：重定向 `/login`，保留原目标 query。
- 已登录访问 `/login`：重定向 `/`。
- 其它情况放行。

应用启动时只在已有会话时初始化 realtime；登出、refresh 失败或 token 被清理时必须断开 realtime。

### Cursor Sync 与 Realtime

`useSyncApi` 改用新 cursor envelope；`useSyncStore` 保存 `syncCursor` 和 `resetRequired`，不再读取或写入 `afterId`、`lastMutationId`、`truncated`。本次全量迁移同时完成业务资源 DTO merge、SQLite schema、snapshot/reset 和冲突状态，不保留 R4-02 的旧本地同步边界。

新增 PC realtime service：

1. 取得当前 device ID。
2. 调用 `/api/realtime/ticket`。
3. 将服务端相对 `websocketUrl` 解析为配置后的 `ws/wss` URL，并连接 `/ws/events?ticket=...`。
4. 收到事件后按 `type/resourceType/resourceId/cursor` 去重，推进本地 cursor，并触发 Sync refresh signal；不直接写业务表。
5. 连接关闭或 ticket 过期时按指数退避重新申请 ticket；每次连接使用新 ticket。
6. 显式停止时清除 timer、事件监听和 WebSocket，不安排新的重连。

不发送旧 PING/PONG JSON，不把 access token 或 refresh token 放入 WebSocket URL，不解析旧 Redis serializer 数组格式。

### Tauri

`api/tauri.ts` 只保留 Rust command invoke 和必要的桌面能力封装；WebSocket 逻辑移出该文件，Web 和 Tauri 共用同一个 realtime service。`src-tauri` 保留 SQL、crypto 和 log 插件，但校验 SQL 权限、数据库路径、网络访问和窗口配置。`npm.cmd run tauri -- build` 作为制品构建门禁；安装、升级、卸载、本地数据保留和 Windows GUI 仍单列人工验收。

### PC 业务 API 与页面迁移

所有 PC 页面改用冻结 OpenAPI 的 typed client 和直接 DTO，不再在 Store 或页面内直接调用 axios，也不再解析旧 `res.data.data`。按领域建立或重写以下边界：

- Auth：登录、注册、refresh、logout、me、sessions。
- Subject / KnowledgeBlock / Task：列表 cursor、创建、更新、删除、恢复和 `baseVersion`。
- Source / Asset / Relation：Source 生命周期、presigned intent、完成/下载 URL、关系和用户归属。
- Review / Stats：due、events、history、overview、weekly。
- Sync / Realtime：push、pull、snapshot、ticket、`/ws/events`。
- AI：Provider 设置、Conversation、消息 SSE、citation 和上传/摄取上下文；旧 `/api/ai/chat`、`/api/ai/ingest` 等调用全部删除或映射到当前契约。

页面职责保持现有正式路由不变，但数据来源改为 Store → typed API → local repository：

- Dashboard：Subject/Task/Stats 的服务端 DTO 和本地缓存。
- SubjectHall / SubjectWorkspace：Subject、Source、Asset、KnowledgeBlock、Relation 和 AI 上下文。
- Asset：upload intent → presigned PUT → complete → download URL。
- Timeline / Pomodoro：Task、状态、排期和 Review/Stats 数据。
- Profile：Auth me、sessions、AI settings；不显示敏感 key。

页面必须显式区分 loading、empty、error、offline、saving、synced、conflict 和 reset；不以本地假数据或旧字段填充新接口响应。

### 本地数据库与离线同步

重写 `localDb.ts` 为 user-scoped local repository。Tauri 使用 SQLite；Web fallback 可以继续使用浏览器存储，但键和记录必须按当前 `userId` 命名空间隔离，并遵守同一 DTO 映射。

- `sync_metadata` 至少保存 `userId`、`deviceId`、`cursor`、`resetRequired` 和 schema version。
- 本地资源记录保存 `userId`、服务器 `version`、`deletedAt`、`syncStatus` 和必要的 `baseVersion`。
- `local_mutations` 保存 `clientMutationId`、资源类型/ID、mutation type、`baseVersion`、payload、创建时间和同步状态；禁止使用旧 `clientId/entityType/action/lastMutationId` 作为新契约字段。
- chat session/message、Subject、Source、Asset、KnowledgeBlock、Task、Relation、Review 本地表或缓存均按用户隔离；查询不得依赖全局主键唯一来推断用户归属。
- snapshot/reset 在事务中保留未提交 mutation，替换服务器快照后再按冲突策略重放；不得执行旧的静默 hard delete cold start。
- 版本冲突保留本地 mutation 和服务器 DTO，交给页面冲突状态处理；不使用 last-write-wins。

## 错误与边界

- 登录/注册 400：展示字段错误或安全 detail，不吞掉失败。
- access 401：统一 refresh；refresh 失败清理本地会话并返回登录页。
- ticket 401/过期：断开当前连接，重新申请 ticket；重试达到上限后显示离线状态，不能伪装已同步。
- 重复事件：只保留一次刷新信号，不重复推进 cursor。
- `resetRequired=true`：保留本地待提交 mutation，设置 reset 状态并执行本次迁移实现的 snapshot/merge 流程；不得静默清空数据。
- 离线：暂停连接和请求重试，保留本地会话与待同步数据；恢复网络后重新申请 ticket 和 cursor pull。

## 文件范围

预计修改：

- `Auralis-PC/src/api/request.ts`
- `Auralis-PC/src/api/useAuthApi.ts`
- `Auralis-PC/src/api/useSyncApi.ts`
- `Auralis-PC/src/api/tauri.ts`
- `Auralis-PC/src/api/aiClient.ts`
- `Auralis-PC/src/api/useAssetApi.ts`
- `Auralis-PC/src/api/useStatsApi.ts`
- `Auralis-PC/src/api/useSubjectApi.ts`（新增或替换现有调用边界）
- `Auralis-PC/src/api/useKnowledgeApi.ts`（新增或替换现有调用边界）
- `Auralis-PC/src/api/useTaskApi.ts`（新增或替换现有调用边界）
- `Auralis-PC/src/api/useSourceApi.ts`（新增或替换现有调用边界）
- `Auralis-PC/src/api/useRelationApi.ts`（新增或替换现有调用边界）
- `Auralis-PC/src/api/useReviewApi.ts`（新增或替换现有调用边界）
- `Auralis-PC/src/router/index.ts`
- `Auralis-PC/src/store/useAuthStore.ts`
- `Auralis-PC/src/store/useSubjectStore.ts`
- `Auralis-PC/src/store/useBlockStore.ts`
- `Auralis-PC/src/store/useTaskStore.ts`
- `Auralis-PC/src/store/useChatStore.ts`
- `Auralis-PC/src/store/useSyncStore.ts`
- `Auralis-PC/src/services/localDb.ts`
- `Auralis-PC/src/App.vue`
- `Auralis-PC/src/views/Dashboard/index.vue`
- `Auralis-PC/src/views/SubjectHall/index.vue`
- `Auralis-PC/src/views/SubjectWorkspace/index.vue`
- `Auralis-PC/src/views/Asset/index.vue`
- `Auralis-PC/src/views/Timeline/index.vue`
- `Auralis-PC/src/views/Profile/index.vue`
- `Auralis-PC/src/views/Pomodoro/index.vue`
- `Auralis-PC/vite.config.ts`
- `Auralis-PC/src-tauri/tauri.conf.json`
- `Auralis-PC/src-tauri/capabilities/default.json`
- `Auralis-PC/src-tauri/src/lib.rs`
- `Auralis-PC/src-tauri/Cargo.toml`（仅在权限/插件确有变化时）
- `Auralis-PC/package.json`

预计新增：

- `Auralis-PC/src/config/runtime.ts`
- `Auralis-PC/src/api/realtime.ts`
- `Auralis-PC/src/types/api.ts`（只放非生成的错误/运行时辅助类型）
- `Auralis-PC/src/types/domain.ts`（页面和 Store 共用的当前 DTO 映射类型）
- `Auralis-PC/scripts/check-r4-pc.mjs`
- `Auralis-PC/scripts/test-r4-pc.mjs`（可在当前 Node 工具链下运行的纯协议/映射测试）

必须同步：

- `docs/modules/FrontendPC.md`
- `docs/design/Frontend.md`（仅记录鉴权失效、离线、同步和实时连接交互）
- `docs/contracts/API.md`
- `docs/contracts/Database.md`（同步本地 userId/version/deletedAt/baseVersion 边界）
- `docs/current/Status.md`
- `docs/current/IssuesAndReview.md`
- `docs/planning/PreDeploymentReadinessTasks.md`
- `docs/release/Changelog.md`

不修改：Mobile/Tablet 代码、生成 `schema.ts`、后端 Controller/服务器数据库迁移、`.claude/` 本机配置。生成 schema 必须通过既有脚本；如果 typed client 模板需要改变，只修改生成脚本并重新生成，不手改 schema。

## 测试与验收

实现遵循 Red-Green-Refactor，并按领域分批完成但保持本次任务总范围不变：

1. 先增加 PC 全量静态契约检查，确认当前旧路径、固定地址、旧字段和旧 API 调用会失败。
2. 先写纯协议/映射测试：直接 DTO、Problem Details、route guard、refresh 队列、ticket 重连、事件去重、cursor reset、版本冲突和 userId namespace。
3. 最小实现新 runtime、HTTP/Auth、route guard、全部 typed API、cursor/realtime 和本地 repository。
4. 按页面域迁移 Store 和页面，删除旧 `axios` 直调、旧字段映射和本地假数据。
5. 运行 `npm.cmd run check:r4-pc`、`npm.cmd run build` 和 `npm.cmd run tauri -- build`。
6. 运行 `scripts/check-openapi.ps1 -SkipExport`，确认生成契约未漂移。
7. 运行后端 Compose 联调 smoke，并单独记录浏览器登录/刷新/退出、真实 WebSocket、断网重连、Tauri GUI、安装升级和本地数据保留结果；任何未执行项都不能写成已验收。

## 完成定义

PC 全量 R4 只有在以下条件全部满足时才标记完成：

- PC 所有正式页面、Store、API 和 AI/Asset/Sync 调用均使用冻结新契约，不再存在旧 DTO、旧同步路径或本地假数据主路径。
- PC 路由守卫、直接 DTO Auth、环境基址、refresh、userId 隔离、version/deletedAt/baseVersion 和冲突语义均切换到新契约。
- PC 不再通过生产代码访问固定 `127.0.0.1`、`localhost` 或 `/ws/sync`。
- PC realtime 通过 ticket 连接 `/ws/events`，重连重新取 ticket，事件 cursor 去重并保留 reset 边界。
- Tauri SQL、权限、网络配置和构建边界通过自动检查；`tauri build` 有实际退出码和制品记录。
- PC 全量静态检查、协议测试、类型检查、Web build、Tauri build 和 OpenAPI drift 检查通过。
- 相关前端模块、设计、API、Database、状态、风险、任务和 Changelog 文档已同步。
- 未把代码存在、构建通过、自动测试通过、真实联调或 GUI 验收合并成同一个状态。
