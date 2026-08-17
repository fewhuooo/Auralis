# R4-01 PC 鉴权、环境与实时协议重写设计

更新时间：2026-08-17

状态：待用户审阅

## 目标

直接将 `Auralis-PC` 的鉴权、HTTP 请求基础层、运行时地址和实时同步入口切换到冻结的 Auralis 新契约，移除尚未上线的旧响应包装、旧 `/ws/sync`、固定本机地址和旧 cursor 模型，为 R4-02 的业务页面迁移提供单一基础。

本设计只覆盖 PC Web/Tauri 的 R4-01，不迁移 Mobile/Tablet 页面，不处理 PC 业务页面 DTO，不把真实 Provider 或 GUI/Tauri 人工验收写成自动测试结果。

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

### 方案 B：直接重写 PC 基础请求与实时链路（采用）

重写现有 `request.ts`、Auth API、Sync API、路由守卫和实时入口，让 PC 主请求基础层只遵守新契约。旧 API 尚未部署，删除旧包装和 `/ws/sync` 不产生线上兼容负担；业务页面将在 R4-02 逐项改用新 DTO。

### 方案 C：一次性迁移所有 PC 页面和本地模型

暂不采用。它会把 R4-02 的业务 DTO、SQLite userId 隔离、版本/墓碑和页面验收混入 R4-01，无法形成一个可审查、可回滚的鉴权/实时基础提交。

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

`useSyncApi` 改用新 cursor envelope；`useSyncStore` 保存 `syncCursor` 和 `resetRequired`，不再读取或写入 `afterId`、`lastMutationId`、`truncated`。业务资源的完整 DTO merge 和 SQLite schema 迁移属于 R4-02，但 R4-01 先建立新 cursor 生命周期和可重试边界。

新增 PC realtime service：

1. 取得当前 device ID。
2. 调用 `/api/realtime/ticket`。
3. 将服务端相对 `websocketUrl` 解析为配置后的 `ws/wss` URL，并连接 `/ws/events?ticket=...`。
4. 收到事件后按 `type/resourceType/resourceId/cursor` 去重，推进本地 cursor，并触发 Sync refresh signal；不直接写业务表。
5. 连接关闭或 ticket 过期时按指数退避重新申请 ticket；每次连接使用新 ticket。
6. 显式停止时清除 timer、事件监听和 WebSocket，不安排新的重连。

不发送旧 PING/PONG JSON，不把 access token 或 refresh token 放入 WebSocket URL，不解析旧 Redis serializer 数组格式。

### Tauri

`api/tauri.ts` 只保留 Rust command invoke 和必要的桌面能力封装；WebSocket 逻辑移出该文件，Web 和 Tauri 共用同一个 realtime service。Tauri 权限、安装包和 Windows GUI 仍单列人工验收。

## 错误与边界

- 登录/注册 400：展示字段错误或安全 detail，不吞掉失败。
- access 401：统一 refresh；refresh 失败清理本地会话并返回登录页。
- ticket 401/过期：断开当前连接，重新申请 ticket；重试达到上限后显示离线状态，不能伪装已同步。
- 重复事件：只保留一次刷新信号，不重复推进 cursor。
- `resetRequired=true`：保留本地待提交 mutation，设置 reset 状态，交由 R4-02 snapshot/merge 流程处理；不得静默清空数据。
- 离线：暂停连接和请求重试，保留本地会话与待同步数据；恢复网络后重新申请 ticket 和 cursor pull。

## 文件范围

预计修改：

- `Auralis-PC/src/api/request.ts`
- `Auralis-PC/src/api/useAuthApi.ts`
- `Auralis-PC/src/api/useSyncApi.ts`
- `Auralis-PC/src/api/tauri.ts`
- `Auralis-PC/src/router/index.ts`
- `Auralis-PC/src/store/useAuthStore.ts`
- `Auralis-PC/src/store/useSyncStore.ts`
- `Auralis-PC/src/App.vue`
- `Auralis-PC/vite.config.ts`
- `Auralis-PC/package.json`

预计新增：

- `Auralis-PC/src/config/runtime.ts`
- `Auralis-PC/src/api/realtime.ts`
- `Auralis-PC/src/types/api.ts`（只放非生成的错误/运行时辅助类型）
- `Auralis-PC/scripts/check-r4-01.mjs`

必须同步：

- `docs/modules/FrontendPC.md`
- `docs/design/Frontend.md`（仅记录鉴权失效、离线、同步和实时连接交互）
- `docs/contracts/API.md`
- `docs/contracts/Database.md`（仅在 cursor/本地同步字段边界实际变化时更新）
- `docs/current/Status.md`
- `docs/current/IssuesAndReview.md`
- `docs/planning/PreDeploymentReadinessTasks.md`
- `docs/release/Changelog.md`

不修改：Mobile/Tablet 代码、生成 `schema.ts`、后端 Controller/数据库迁移、`.claude/` 本机配置。

## 测试与验收

实现遵循 Red-Green-Refactor：

1. 先增加 R4-01 静态契约检查，确认当前旧路径/固定地址会失败。
2. 最小实现新 runtime、Auth、route guard、cursor 和 realtime service。
3. 运行静态检查确认旧路径消失、配置入口存在、ticket 连接使用新协议。
4. 运行 `npm.cmd run build`，确认 TypeScript/Vite 构建通过。
5. 运行 `scripts/check-openapi.ps1 -SkipExport`，确认生成契约未漂移。
6. 保留人工验收边界：浏览器登录/刷新/退出、真实 WebSocket、Tauri GUI、断网重连和后端 Compose 联调不能由静态检查或构建代替。

## 完成定义

R4-01 只有在以下条件全部满足时才标记完成：

- PC 路由守卫、直接 DTO Auth、环境基址和 refresh 语义均切换到新契约。
- PC 不再通过生产代码访问固定 `127.0.0.1`、`localhost` 或 `/ws/sync`。
- PC realtime 通过 ticket 连接 `/ws/events`，重连重新取 ticket，事件 cursor 去重并保留 reset 边界。
- R4-01 静态检查、PC build 和 OpenAPI drift 检查通过。
- 相关前端模块、契约、状态、风险、任务和 Changelog 文档已同步。
- 未把代码存在、构建通过、自动测试通过、真实联调或 GUI 验收合并成同一个状态。
