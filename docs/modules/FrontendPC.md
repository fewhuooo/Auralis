# PC 前端模块

### 2026-09-21 Issue 3/4 final review fixes

- `useSyncStore` 保留上一次安全同步错误，只有完整的 push/pull/asset cycle 成功后才清除；同步、聊天和 AI SSE 错误统一经过有限 code/用户文案映射，原始诊断只进入有界受控日志，并保留离线分类。
- Overview 的所有 eligibility/not-ready/no-input 分支均返回 `SKIPPED`，不把 skip 写成 `FAILED`；Subject 生成在 Provider 返回后以当前参与 Source 的 fingerprint、generation 和 abort fence 复核，删除/修订/新一代响应不会写入缓存。
- `classifyClientError` 对已经安全化的 `SafeClientError` 保持原有 `code`、用户文案和 `retryable`，避免跨 Store/Controller 边界二次降级；Subject discard 会 abort 使用该 Source 的进行中生成，Provider 返回后再逐个复核 Source existence、FILE/READY、revision 与 eligibility。
- 已补真正运行时回归：同步错误持续到成功 cycle、SSE 安全错误、聊天 retry 保持 `clientRequestId`、Subject `NO_USABLE_INPUT` 及 revision late-result。手动完成的 `STARTED` 反馈显示“已更新”，旧内容提示仅在确有旧内容时出现。
- 最终 focused 回归为 68/68，PC 完整 R4 门禁为 382/382；`npm.cmd run type-check`、`npm.cmd run build`、根目录 `git diff --check` 均通过。真实 WebSocket、Tauri/GUI、Provider 和业务验收仍需单独记录。

### 2026-09-21 Issue 3/4 前端反馈收口（自动证据完成，人工验收开放）

- Issue 3 的 PC 连接状态现在由统一 projection 按错误、离线、Realtime 重连、同步中、已同步的优先级计算；同步错误、服务不可用和问答错误保持为可见错误，不会因浏览器恢复 online 事件直接伪装为已同步。问答失败保留在聊天区域并提供重试入口。
- Issue 4 的手动文件/学科 Overview 重生成返回结构化 `STARTED`、`SKIPPED` 或 `FAILED` 结果；调用方对 Source 未就绪、版本/eligibility 不满足和 Provider/网络失败给出明确反馈。自动触发继续静默记录有界结果，不弹出通知、不递归重试；失败或跳过均保留已有缓存内容，只有手动重试可绕过当前 revision 的终态策略。
- 自动验证：Issue 3/4 focused 命令 `node --experimental-strip-types --test scripts/r4-issues-3-4-frontend.test.mjs scripts/r4-overview-generation.test.mjs scripts/r4-overview-cache.test.mjs scripts/r4-subject-overview-ui.test.mjs scripts/r4-sync.test.mjs scripts/r4-reliability.test.mjs` 为 88/88；`npm.cmd run test:r4-pc` 为 369/369；`npm.cmd run type-check`、`npm.cmd run build` 和根目录 `git diff --check` 均退出 0。
- 构建/测试输出仍包含既有 SQLite experimental、Vite externalized/dynamic-import 和 chunk size 警告；它们未被改写为失败，也不等同于真实验收。真实 WebSocket delivery、浏览器 online/offline 事件、Tauri/GUI 文件预览及真实 AI Provider 输出尚未验收；本轮无 API 或数据库契约变化。

2026-09-17 PC Local Asset Store Task 8 收尾：`b7a3bb7..c560d8b` 已将 PC Tauri 文件导入接入永久本地资料库。原始文件在受管目录中保持明文，由受管路径与 OS ACL 保护；本地 Asset 与 Source draft 以 `userId + serverDeviceId` 隔离，所有文件默认进入同步队列。断网时可完成导入、预览、OCR/Parser 本地解析，联网后以稳定 `clientImportId` 幂等同步对象存储；Preview、OCR、Parser 共享同一 Local Asset descriptor，`localContentRevision` 与服务端 `ingestionRevision` 分离。Local Asset 不提供备份、导出、恢复或副本管理能力。仅用户明确删除 Source 且最后一个 Source 引用消失后才进入受控删除；上传、解析、修复和 Source 删除均有任务 fence。启动同步前执行 owner/device-scoped reconcile：缺失或 hash/size 不一致标记 `CORRUPT`，未知或残留 staging 文件移入 quarantine，不静默删除。

自动证据：`f770277`/`e040e78` 后 Task 7 定向 77/77、FilePreview+store 38/38、Rust Local Asset 30/30；`cargo fmt --check`、`cargo check` 通过。`npm.cmd run test:r4-pc` 当前 333/334，仅剩用户 dirty `task-view` 的 completed scheduled task 断言失败；`npm.cmd run type-check` 仍仅有用户 dirty UI/Store 的 7 项错误。上述代码和自动门禁不等于真实 Tauri GUI、断网重启、真实文件系统或外部对象存储验收通过。

2026-09-15 Overview 失败体验收口：真实第二次 Overview 全链路已成功，证明当前永久预算链路可运行；生成内容质量仍需用户判断。对于 Overview 的 `MODEL_PROVIDER_ERROR`，PC 现在显示“遇到意外情况，请重试”，不新增 Server/API 错误码；既有 FAILED 终态保护保持不变，刷新、启动、联网、同步和 `JOB_CHANGED` 不会自动重试，只有用户点击“重新生成”才发起新请求。该文案映射仅位于 Overview 专用 failure policy，不影响普通 AI 聊天/流式错误。

2026-09-14 Overview retry/convergence：当前 revision 的 FILE Overview 缓存一旦为 `FAILED` 或部分 `READY`，对 `SOURCE_READY`、`RESUME_BOOTSTRAP`、`RESUME_ONLINE`、`RESUME_SYNC`、`JOB_CHANGED` 的自动触发均视为终态，不再自动 POST；只有 `MANUAL_RETRY` 可绕过该限制，并继续使用现有 in-flight coalescing。失败或部分结果区域各自只显示一个可见“重新生成”操作，生成中 disabled；旧大纲/总结保留。`MODEL_TIMEOUT`、`MODEL_UNAVAILABLE`、客户端 timeout/网络失败使用“无法确认生成状态”文案，与确定性失败区分。PC focused 早期证据为 54/54，最新 `npm.cmd run test:r4-pc` 为 331/331；type-check、`check:r4-pc`（94 个生产文件）、`check:subject-workspace` 与 build 均退出 0。上述自动证据不代表 Server 持久幂等、真实 Provider、Tauri、网络、GUI 或业务验收完成。

2026-09-12 Build/OpenAPI Task 3 最终回归：PC `npm.cmd run type-check` 退出 0；`check-openapi.ps1` 退出 0，生成的 `schema.ts` 与固定 OpenAPI artifact 一致，`subjectOverview`/`sourceOverview` 的 header 暴露可选 `X-Overview-Request-Id`。schema 由生成器产出，未手工维护；本轮未改变 API/数据库语义。真实 Server/Provider、Tauri、GUI、设备和业务验收仍待完成。

2026-09-11 Overview Source 删除 fence：文件总览生成在本地先要求当前用户/设备的活动 FILE Source 投影存在与请求完全一致的 `ingestionRevision`，且独立的本地文档任务阶段恰为 `READY`，因此自动恢复与手动重生成在任何 Server 预检前都会跳过不合格输入。Source 删除在本地 tombstone 与可见投影移除后同步阻断该 Source、abort 匹配的文件请求并移除文件总览缓存；晚到的成功或失败响应均不保存、不标记失败。Store-owned 删除顺序把该 fence 放在 `scheduleSync()` 与后台文档清理之前。Server 端的删除/修订保护见 Backend 模块；Subject 总览行为与既有 API/数据库契约未改变。本轮自动证据：PC `test:r4-pc` 322/322、type-check 退出 0、`check:r4-pc` 退出 0（93 个生产文件）；真实 Tauri 删除/重传、Axios 断开传播、Provider、GUI 与业务验收仍待完成。

更新时间：2026-09-12

文档状态：现行

权威范围：`Auralis-PC` 的当前依赖、路由、页面、Store、API 边界、Tauri 集成、构建方式与限制

事实来源：`Auralis-PC/package.json`、`src/`、`src-tauri/` 与 2026-08-24 当前代码

2026-09-09 时间轴拖动边界修复：排期任务拖到空槽时，`useTaskStore` 只通过当前用户/设备的本地 repository/outbox 更新单 Task，不调用需要两个 UUID 的 `schedule-swaps`；拖到已占用槽时仍调用服务端原子 swap。不改变 Task API 契约或数据库结构。

2026-09-09 知识块来源与学科名称映射修复：KnowledgeBlock API/本地投影仍仅保存 `sourceId`/`subjectId`；`useKnowledgeStore` 在读取知识块时同时读取当前用户/设备的 Source 与 Subject 投影，将关联 ID 映射为 `Source.title`/`Subject.name` 供 UI 显示。新建/更新路径保留当前可读名称，关联投影变化会重建知识块显示投影；缺失关联时显示中性占位。该修复不改变 API、数据库或 ParsedDocument 契约。

2026-09-09 PDF 混合页面阶段修复：`DocumentJobRunner` 在同一 PDF 已进入 `OCR_RUNNING` 后，后续普通文字 block 继续以 `OCR_RUNNING` 保存 checkpoint，直到 `PACKAGING`，不放宽 `OCR_RUNNING → EXTRACTING`，也不改变 PDF 分类、API 或 schema。runner 回归 12/12、完整 PC 回归 269/269、type-check 和 diff-check 通过；真实 51 页 PDF/Tauri GUI 仍待验收。

2026-09-08：ParsedDocument Tauri PUT 的失败日志增加安全、长度受限的 reqwest 诊断摘要，并最多保留三层 `Error::source()` cause。摘要先移除 URL，再脱敏预签名 query、Authorization、header value、路径和控制字符；`flags + summary + causes` 总体有界且仅写入 stderr，不改变返回给前端的 `NETWORK_OFFLINE:*` 分类或 SQLite 错误契约。ParsedDocument cache receipt 的 `payloadBytes/payloadSha256` 现在严格对应解密 reader 实际上传的 gzip payload；旧 receipt 若误将 `payloadBytes` 等同于 `encryptedBytes`，恢复上传前会在 owner-scoped native boundary 重新计算 payload size/hash。真实 Tauri/MinIO 复验仍需人工验收。

2026-09-09 schema-v1 final review closure：PC 本地加密 cache/receipt 保存 `parsed-document-v1`、Source Asset SHA 和 parser/normalization/OCR 元数据；gzip 上传内容为单个 Server-compatible schema-v1 JSON envelope，不是 NDJSON，owner/job/device/user 字段只用于本地 cache scope，不进入上传 JSON。兼容 receipt 直接续传，旧/不完整 receipt 在 intent 前只清理派生 cache 并重建一次。最终 scheduler focused 27/27、完整 R4 250/250、type-check 和 diff-check 通过；所有 Critical/Important reviewer findings 已关闭。真实重建 Tauri、Server/MinIO 和 `1.pdf` GUI retry 尚未观察。

## 模块定位

`Auralis-PC` 是桌面与 Web 共用的 Vue 客户端，负责高信息密度的学科工作区、资产、任务时间线、知识关系和设置。浏览器开发与构建由 Vite 提供；桌面能力由 Tauri 2 提供。

截至 2026-08-20，PC 页面与基础视觉重构已基本收敛；R4 在原有 Store、AI SSE、运行时代理和 Tauri 权限边界之上，补齐了 BYOK 浏览器明文清理、离线写入幂等、SSE 401 单次刷新和离线 AI 会话恢复。PC Web 与 Tauri 应用本体构建已通过；MSI bundling、浏览器/Tauri GUI、真实 Provider 和前后端业务联调仍未验收。

PC 全局排版以 `src/styles/index.css` 为唯一入口：普通 UI 文本继承 `--font-family-base`，代码/图表等专用内容使用 `--font-family-mono`；根字号为 `16px`，字号优先使用 `caption`、`body-sm`、`label`、`body`、`body-lg`、`title-sm`、`title`、`title-lg` 与 `display` 语义令牌。页面组件不得新增未纳入令牌的独立字体族；保留旧基础字号变量仅用于兼容已有样式。

2026-09-07 认证边界收口：refresh session 无效时清除本地会话并进入明确的 `reauthentication-required` 状态；受保护 Axios、同步和本地资料调度停止启动，登录/注册/refresh/health 保留恢复入口，refresh 仍由单飞协调器执行且每个请求最多重放一次。PPTX/Office 的 JSZip 根入口通过 Vite alias 固定到自包含浏览器 bundle，不使用 stream polyfill。自动回归已通过，真实 Tauri GUI 与新鲜 Vite bundle 仍待验收。

## 当前技术栈

| 依赖 | 当前声明 |
| --- | --- |
| Vue | `^3.5.32` |
| Vite | `^8.0.10` |
| TypeScript | `~6.0.2` |
| Pinia | `^3.0.4` |
| Vue Router | `^4.6.4` |
| Element Plus | `^2.13.7` |
| Tauri API / CLI | `2.11.1` |
| Rust `tauri` | `2.11.1`，见 `src-tauri/Cargo.toml` |

这是依赖清单事实，不表示所有依赖组合已完成桌面打包验收。

## 目录边界

```text
Auralis-PC/
├── src/
│   ├── api/          # HTTP、AI、同步、资产、鉴权、统计、Tauri 封装
│   ├── components/   # 共享组件和学科组件
│   ├── router/       # 正式路由与守卫
│   ├── store/        # Pinia 状态
│   ├── styles/       # 全局设计令牌和样式
│   └── views/        # 页面
├── src-tauri/        # Rust、权限和桌面配置
├── package.json
└── vite.config.*
```

## 正式路由

| 路由 | 名称 | 页面 | 鉴权意图 |
| --- | --- | --- | --- |
| `/login` | Login | `src/views/Login/index.vue` | 公开 |
| `/` | Dashboard | `src/views/Dashboard/index.vue` | `requiresAuth` |
| `/subjects` | SubjectHall | `src/views/SubjectHall/index.vue` | `requiresAuth` |
| `/subject/:id` | SubjectWorkspace | `src/views/SubjectWorkspace/index.vue` | `requiresAuth` |
| `/asset` | Asset | `src/views/Asset/index.vue` | `requiresAuth` |
| `/timeline` | Timeline | `src/views/Timeline/index.vue` | `requiresAuth` |
| `/profile` | Profile | `src/views/Profile/index.vue` | `requiresAuth` |
| `/pomodoro` | Pomodoro | `src/views/Pomodoro/index.vue` | `requiresAuth` |

`src/views/Home` 和 `src/views/Settings` 等目录不等于正式页面；未注册路由不得作为用户入口。

## 登录守卫现状

`src/router/index.ts` 的 `beforeEach` 使用 `useAuthStore` 完整会话和 `resolveAuthRedirect` 处理公开/受保护路由。`App.vue` 仅在受保护路由且存在完整 user+access token 会话时挂载侧栏、头部和认证壳；`/login` 使用独立公共布局，`AppSidebar` 的学科加载也有认证判断与异常兜底，避免过期/残留会话的 401 刷新异常造成白屏。当前结论：

- 未登录访问受保护页面会重定向到 `/login`，已有会话访问 `/login` 会回到 `/`。
- Server 受保护 API 仍必须验证 access token。
- `r4-pc-protocol.test.mjs` 已覆盖守卫决策；浏览器/Tauri 中的登录、刷新持久化、退出和过期仍需人工验收。

该问题属于 P1，不能因页面能够打开而写成鉴权已验收。

## Store 清单

| Store | 主要职责 |
| --- | --- |
| `useAuthStore.ts` | token、用户与会话 |
| `useBlockStore.ts` | 旧知识块兼容 facade；正式页面使用 `useKnowledgeStore` |
| `useTaskStore.ts` | Task typed API、user/device repository、排期、状态和 mutation |
| `useSubjectStore.ts` | 学科列表和当前学科 |
| `useSourceStore.ts` | Source 分页、资料目录、关联 Asset 元数据、软删除和 Source mutation；`activeSourceFiles` 按当前工作区焦点 `subjectId` 投影，空学科也会在后续本地 hydration 中保持为空 |
| `useKnowledgeStore.ts` | KnowledgeBlock 列表、关联 Source、离线缓存和 mutation |
| `useAssetStore.ts` | Asset upload-intent、对象存储上传、complete、下载 URL 和失败 pending 状态 |
| `useSyncStore.ts` | cursor、resetRequired、pull/push 状态、错误和统一同步入口 |
| `useReviewStore.ts` | Review queue/history/event 的 typed DTO 状态 |
| `useStatsStore.ts` | Stats overview/weekly query 和展示模型 |
| `useChatStore.ts` | 本地稳定会话/消息 ID、会话创建与消息请求幂等键、citation/SSE 状态及 online 顺序恢复；不把旧本地 chat 表当云端事实 |
| `usePomodoroStore.ts` | 用户/设备隔离的番茄钟 UI 与每日完成计数 |
| `useSettingsStore.ts` | 主题和偏好 |

修改 Store 字段前必须搜索页面、组件、持久化、同步和 API 使用方，禁止新增同职责 Store。

## API 边界

| 文件 | 职责 |
| --- | --- |
| `api/request.ts` | base URL、Authorization、401 单飞刷新；不读取或发送浏览器 BYOK key/header |
| `api/aiClient.ts` | AI 设置、会话、带单次 401 刷新且复用同一请求 ID 的 SSE 消息流与建议接口 |
| `api/useAuthApi.ts` | 登录、注册、刷新、会话列表与撤销 |
| `api/useAssetApi.ts` | upload-intent、对象存储直传、complete 与 download-url |
| `api/useSourceApi.ts` | Source typed CRUD/reingest，以及 ParsedDocument upload-intent/complete |
| `api/useStatsApi.ts` | 概览与周统计 |

Source FILE 响应携带可选 `assetSizeBytes`；`domainMappers.mapSourceView` 使用该字段填充资料大小，缺失时才回退为 `0`。文件登记的本地优先副本也保留上传完成时的 `asset.sizeBytes`，避免 Source 同步完成前短暂显示 `0.0 MB`。文件预览仍通过 Asset download-url 获取短期签名地址。

2026-09-04 起，Subject、Source、KnowledgeBlock、Task 的常规创建、更新和删除均走 `commitMutation()`：资源投影与 immutable outbox 在同一端侧提交中持久化成功后，才更新 Pinia/UI 并调用 `requestBackgroundSync('write')`。Store 列表只 hydration 本地投影，随后请求 cursor 同步，绝不自行调用领域列表 API 或在 loading 中等待网络。同步器以 `pending → inflight → applied/conflict/error` 结算指定 mutation；同资源有未解决本地写入时，push 回包、pull 和 snapshot 不覆盖其投影。FILE 的 Asset 二进制直传/complete、认证、ReviewEvent、AI/SSE、文件下载仍需要网络；用户点击“立即同步”以及启动 FILE 解析前确认 Source 已同步是仅有的 `flushNow()` 显式等待边界。
| `api/useSyncApi.ts` | push/pull 同步 |
| `api/e2ee.ts` | 端到端加密辅助 |
| `api/tauri.ts` | Tauri 环境和本地能力封装 |
| `api/generated/schema.ts` | 从冻结 OpenAPI 产物生成的 DTO、路径、参数和响应类型（禁止手改） |
| `api/generated/client.ts` | 约束路径、HTTP 方法、path/query/body 与成功响应的轻量请求适配器 |

所有端点契约以 [API 文档](../contracts/API.md) 为准；页面不得自行硬编码新的 Server 地址或 token 逻辑。

生成 SDK 的源文件是 `docs/contracts/openapi/auralis-openapi.json`，生成器固定为
`openapi-typescript@7.13.0`。从仓库根目录执行
`scripts/generate-openapi-sdk.ps1` 可同步 PC 和 Mobile；执行
`scripts/check-openapi.ps1` 可校验运行时 OpenAPI 与两端生成文件。当前生成 SDK
已冻结 Source `ingestionRevision/ingestionStatus` 与 ParsedDocument upload-intent/complete 类型和请求边界；PC 上传协调器与页面业务联调仍需按本计划继续，不能把类型检查通过写成前后端联调完成。

## 本地数据边界

| 文件 | 职责 |
| --- | --- |
| `services/localSchema.ts` | Tauri SQLite v9 schema、旧 key/value 表的可恢复改名、mutation inflight/远端诊断列与 snake_case 行转换；迁移时清洗 TASK 负载颜色键并保留无效 JSON 原文 |
| `services/localRepository.ts` | Tauri `local_resource_records`/`local_mutations` 按用户隔离（浏览器 fallback namespace 另含 device）；Subject 删除后由 `tombstoneSubjectChildren()` 幂等隐藏所属 Source/KnowledgeBlock/Task/Relation 投影并清除子资源 outbox，不生成子 DELETE mutation |
| `services/subjectDeletionCoordinator.ts` | Subject durable DELETE marker 之后的本地级联协调器；以 user/device Local Asset lifecycle lock 串行 draft queue release，启动/hydration 重放子投影、Subject/File Overview、文档任务，并在 APPLIED 后终结 Source draft 与最后引用 Local Asset；pending/rejected 保留可恢复 draft/bytes，按 user/device 作用域访问 drafts/assets/overviews/jobs，并保留其他 Subject 的资源和共享 Asset |
| `services/localDatabaseRuntime.ts` | 单个应用生命周期内的 SQLite 初始化 Promise 与按用户/设备范围缓存的 repository |
| `services/localSqlQueue.ts` | 进程内 SQL 命令串行化 adapter，避免 SQL 插件 pool 中的并发写入竞争 |
| `services/legacyLocalData.ts` | 旧 account-less localStorage 的 `legacy_unassigned` 备份和显式迁移选择记录 |
| `services/localDb.ts` | SQLite 单次初始化、WAL/busy timeout 配置与尚未迁移 Store 的兼容 facade；新 Store 不得新增对旧方法、旧字段或全局业务 key 的依赖 |

时间轴中的已完成排期任务保留其原 `scheduledAt` 槽位，并处于固定状态：Store 拒绝移动、替换和取消排期，Timeline/Dashboard 不提供相应拖放或取消入口；将任务恢复为未完成后才可再次调整。本地加载仅接受 API 领域状态 `TODO`、`IN_PROGRESS`、`DONE`、`CANCELLED`；弃用的展示态缓存（例如 `completed`）不再转换或兼容，而是忽略并由后续在线刷新按现行契约重建。

R4 repository 已覆盖 Web fallback 和 SQLite adapter 的用户隔离、`version/baseVersion` 冲突、`deletedAt` tombstone、v6 outbox 状态与 reset 保留未解决写入。Tauri 路径在应用生命周期只加载、建表和迁移一次，所有 SQL 插件命令经单一队列串行执行；同步 snapshot 通过 Rust `replace_local_resource_snapshot` 在同一 SQLite 连接的显式事务中完成，并启用 WAL 与 5 秒 `busy_timeout`。同步 Store 以共享 cursor cycle 和 500ms 合并调度处理启动、实时、联网、读写请求；push/pull 完成后只发布本地投影变化，领域 Store 重新 hydration 本地库。`DocumentProcessingRuntime` 仅在启动 FILE 处理前 `flushNow()`，确认本地 SOURCE 已为 `synced`。`localDb.ts` 与 `useBlockStore.ts` 仅保留兼容边界。

## C4/C5 文档处理与上传边界

C1/C2/C3 的本地解析任务、加密 cache 与可恢复 runner 已接入 C4 `ParsedDocumentUploadCoordinator`；Rust 通过 `document_upload_put` 对 cache 做解密流式 PUT，PC 只传 phase/receipt，不接触正文或持久化签名 URL。C5 `SourceJobScheduler` 已接入 FILE Source：Source Store 只对服务端 `AWAITING_CLIENT + ingestionRevision` 调度，优先复用当前上传会话的 File，没有本地输入时通过 AssetStore 的 owner-scoped download adapter 获取临时输入；每次处理核对 Asset SHA，旧 revision 的 job 被 supersede，TEXT/URL 不进入该队列。恢复批次隔离每个 Source 的失败，单个读取/调度异常只返回该项 `FAILED_LOCAL`，不会阻断后续 `AWAITING_CLIENT` 文件。Profile 的手动开始入口会先触发同步，并确认本地 `SOURCE` 为 `synced` 后才调用 scheduler；仍在同步、冲突或失败时显示相应提示，避免把服务端不存在的 Source 交给解析器。删除 FILE Source 时 Store 先完成 Source tombstone 与 DELETE outbox，再同步移除当前 `sources/activeSourceFiles` 投影；同步 push/pull 与 scheduler 对运行中 parser、当前用户/设备任务行、内存输入和加密 cache 的清理均转为不阻塞界面的 best-effort 操作。删除竞争只会使调度返回 `SOURCE_DELETED`，不会重建任务。Subject Store 随后重算其本地 Source 投影，因此学科文件计数与 Profile 进度中心同步消失。Tauri `default` capability 显式授予 `sql:allow-execute`，使用户/设备隔离的 SQLite job repository 可以创建与更新可恢复任务，而非退回浏览器 localStorage。PDF 本地适配器与 File Viewer PDF renderer 统一从根级精确 `pdfjs-dist@5.4.624` 解析，lockfile 不保留 renderer 的嵌套 PDF.js 副本，避免同一 Tauri WebView 的 worker API 混用；OCR 结束在 `finally` 释放其 PDF.js document，预览签名 URL 下载以最新请求标记提交，过期请求不能覆盖当前选中文件。scheduler 在本地 job 创建和调度结束后只刷新 `useDocumentProcessingStore`，Source 投影继续由既有同步事件刷新，避免 `loadSources -> schedule -> onJobChanged` 递归。Office bridge 先收集锚点再读取 chunks；纯图片 Office 若 renderer 没有可靠页数会明确返回 `DOCUMENT_FILE_TYPE_UNSUPPORTED`。OCR warmup 通过 sidecar 协议实际初始化模型，Rust 仅在诊断日志记录有界 stderr/进程状态，公开错误码保持不变。前端 runtime 仍提前检查加密状态，但 Rust `document_package_begin` 是新 cache 的最终安全边界：仅在 OS keyring 明确返回 `NoEntry` 时创建 `auralis/master_key`，其他 credential-manager 错误会原样报告为 keyring 访问失败；已有 cache 的读取、上传与清理只读取既有密钥，绝不以新密钥覆盖历史密文。

2026-09-07 复核补充：PPTX `runtime.ts` 在 parser 创建阶段直接读取 OOXML 的 `presentation.xml`/relationships，使用真实 slide 数量和文本块，不再依赖 File Viewer 的空 `pageCount`，legacy OLE `.ppt` 不作为 `.pptx` 兼容输入。Tauri invoke wrapper 保留 Rust 返回的字符串及结构化 message/error/code 诊断。Rust sidecar 在应用 cache 下维护专属 PyInstaller TEMP/TMP 目录，启动前只清理确认已停止的受管 sidecar 遗留直属 `_MEI*`；parsed-document PUT 的 `NETWORK_OFFLINE:*` 诊断会被归一化并进入可恢复 `PAUSED_NETWORK`，已完成加密 package 的续传不重新读取原始 Asset。用户从 `PAUSED_NETWORK` 继续时，带 receipt 的任务经 `QUEUED -> UPLOADING` 直接进入上传，不重跑 OCR、download 或 hash；无 receipt 的 queued 任务仍进入解析路径。

2026-09-05 起，`SourceJobScheduler` 只在 `sourceApi.get(sourceId)` 边界识别结构化 `ApiProblemError` 的 HTTP 404 或 `problem.code === 'RESOURCE_NOT_FOUND'`；命中后复用 `discard(sourceId)` 清理当前用户/`serverDeviceId` 范围内的文档任务、准备中的输入和加密 cache，并稳定返回 `{ status: 'SKIPPED', reason: 'SOURCE_NOT_FOUND' }`。其它 Source lookup 异常（包括 503/`INTERNAL_ERROR`）原样拒绝并保留任务；parser、hash、upload 等后续边界的异常不使用该分类。该规则由 `r4-source-processing-schedule.test.mjs` 与相邻文档处理套件覆盖。开发 Tauri SQLite 已在停止运行进程后从当前应用配置目录精确重置；重启后完整表集已建立，远端投影已重新同步。恢复出的文档任务当前暴露 master key 缺失，密钥初始化/恢复和重新上传的 GUI/Server 联调仍需单独验收。

2026-09-06 补充：PDF 本地适配器通过 Vite `?url` 绑定同版本 `pdf.worker.min.mjs` 到 `GlobalWorkerOptions.workerSrc`，不依赖 CDN；Source Store 的自动入口要求 `AWAITING_CLIENT` Source 同时拥有非空 `assetId` 与 `ingestionRevision`，避免本地 CREATE 尚未 push 时触发服务端 404 孤儿清理。该行为由 `sourceSchedulingPolicy.ts` 和 PDF/Source focused 回归覆盖；认证、MinIO 和 API/数据库契约未变化。

2026-09-05 上传与解析入口恢复：`src-tauri/Cargo.toml` 的 keyring 3 显式启用 `windows-native`，保留 `auralis/master_key`；`filePreview.ts` 的 upload accept list 仅为 PDF、DOC、DOCX、PPT、PPTX，图片/文本能力仍可预览但拒绝 upload intent，`canPreviewFile()` 与上传能力解耦，SubjectWorkspace 弹层显示支持格式；Profile `DocumentProcessingCenter` 将 `AWAITING_CLIENT` 详情写成等待桌面端开始处理，服务端 `VALIDATING/PARSING/INDEXING` 分别显示真实阶段，状态映射集中在 `documentProcessingStatus.ts` 并由纯函数直接测试；`DocumentProcessingDot` 复用共享 Source detail 映射，未知/undefined phase 不虚构服务端处理中状态，`READY` 显示“处理完成”。新增 Windows-only Rust keyring 跨新 Entry 写入/读取/清理测试；本机 `cargo test` 的真实 Credential Manager 写入因 `NoStorageAccess(Error(1312))` 失败，不能视为持久化已验收。Stats focused 测试覆盖六个 `Instant` 查询参数及 UUID/order 保留。PC focused file-preview 27/27、processing UI 1/1、runtime static 9/9、Stats 3/3 通过；真实 Tauri Credential Manager、File Viewer/上传、Server complete/indexing 与 GUI 状态仍需验收。

本地 schema v5 的任务行持久化完整 `DocumentCacheReceipt` 元数据，以便应用重启后从 `PACKAGING/UPLOADING/PAUSED_NETWORK` 续传，不重复 OCR 或 package；签名 URL、headers、原始文件路径不进入 SQLite/localStorage。`services/documentProcessing/runtime.ts` 已由 App 在 Tauri 登录后组装并启动：复用全局隐藏 `BackgroundParserHost`，连接 PDF.js/Office bridge、Tauri OCR、Rust package/cache、ParsedDocument upload coordinator、用户/设备 job repository 和 Source scheduler；启动时先 flush 一次本地同步队列，随后加载 Source；sync/online 事件会重新加载 Source 并恢复 pending jobs，登出时解绑。服务端 complete 接受后删除加密 cache，下载 adapter 的临时输入由 scheduler 清理；实际 Tauri 私有目录、MinIO/Server 联调和 GUI 任务中心仍待人工验收。

## 页面职责

- Dashboard：时间线、待办和快速创建；数据来自 `useTaskStore`、`useKnowledgeStore` 和 `useSubjectStore`，无静态演示数据兜底。待办条目在窄宽下优先保留任务名称，过长的学科徽标允许收缩并以省略号显示。Dashboard、Timeline 与 Home 的原生拖拽 payload 固定传递 `taskId`，已排期任务额外传递 `sourceSlotTime`；原槽放置为 no-op，拖放只等待本地投影/outbox 写入，云端 push/pull 在后台执行；Task 卡片外观统一由 Sage/design 语义 CSS 令牌派生，不依赖 Task 数据颜色；双任务换位的持久化原子组仍由 P1 排期风险跟踪。
- SubjectHall：学科卡片、搜索、创建、编辑、删除和进入工作区；编辑表单保留服务端 `version` 并以 `baseVersion` 提交，确保名称、描述和图标修改可以保存；Subject 没有持久化颜色字段，Dashboard、Timeline 与 Home 统一使用 `#7D9372` 全局主题色；新用户注册后没有自动学科时展示真实空状态，历史遗留“未分类”学科也可正常删除。
- SubjectWorkspace：文件、知识、任务、图谱与 AI 上下文；学科图标经 `src/utils/subjectIcon.ts` 统一解析，新建学科保存语义键并渲染 Lucide Icons 线条图标，创建弹层不提供主题色选择，默认、左下角和全局功能侧栏图标底色统一为 `#7D9372`，已有 Emoji 值原样显示，空值或未知语义键回退书本线条图标。右侧 AI 伴读以页面内 SVG/CSS 复刻手机端四芒星、星环、消息气泡、输入中状态和纯文本胶囊输入；当前正式路径使用 typed `streamAiMessage` 和 `/api/ai/messages/stream`，不提供附件或麦克风入口；每次进入或切换学科都会开启新的伴读会话，不回溯旧消息。登记文件必须先选择文件、名称和归档学科，上传期间显示当前阶段/百分比并防重复提交；直传或 Source 创建失败会在弹层保留可重试状态并显示通知，成功后立即保存到本地并更新当前学科文件列表，后续同步不阻塞操作。文件选择器与拖拽入口共用 `src/utils/filePreview.ts` 的能力注册表，Excel/未知格式和超过 50 MB 的文件在创建 upload intent 前拦截；文件栏只显示真实 Source 文件，文件行删除操作默认悬停显示、键盘 focus-visible 保持可见，确认后通过 Subject Store 执行 Source 软删除并重算文件计数；本地仍有 `SOURCE/CREATE` outbox 时排队有序删除，知识块作为独立的总结/知识表面；删除取消、未登录、版本冲突、资源不存在和服务端异常均给出明确提示；选中文件后由 `FilePreview` 直接承载签名 URL、下载、加载/失败状态，当前优先使用自托管 File Viewer 渲染 DOC/DOCX、PPT/PPTX、PDF、图片及文本；较早的下载响应不得覆盖新选文件。学科页保持一个统一预览面板：现有文件名顶栏承载缩放与旋转，页码/总页数和前后页在预览底部独立占位；搜索、打印、下载、HTML 导出和主题切换不进入预览工具栏。
- PC 阅读辅助当前已接入 `READING_SESSION` 生命周期、`readingContext` 当前 Source 检索与同学科确定性升级；未 READY 文件的 AI 操作只提示前往 `/profile` 查看解析进度。文件行通过 `DocumentProcessingDot` 显示所有非 READY 状态（失败保留红色静态点）；Profile 的 `DocumentProcessingCenter` 同时展示本地任务阶段和本地任务已经完成、但服务端仍为 `VALIDATING/PARSING/INDEXING` 的 Source 阶段，后者会低频刷新 Source 至 `READY`。未挂载 Tauri runner 时该中心明确说明“仅可在 Auralis 桌面端运行”，不把不可用误显示为暂无任务。Tauri runtime 的前置检查会在无可恢复加密 cache 时初始化原生 `auralis/master_key`；若 job 仍有 cache 或 receipt 而密钥缺失，则停止并报告恢复需要。无论前端生命周期是否已完成，Rust `document_package_begin` 都会在新建 package 时再次确保密钥存在；读取既有 cache 不会生成新密钥。预览原生选中文本最多 4000 字，可执行解释/追问或打开 `KnowledgeBlockEditor`，知识块只有确认后才写入当前 subject/source。
- 左侧原“学科大纲”入口已改为“总览”，现有 header 中 `AI 梳理` 按钮和圆形“+”顺序、位置以及三栏宽度保持不变。“学科总览”默认折叠且只在用户点击后生成；下面按文件直接展开本地大纲，每个文件的“总结”入口把中栏从文件预览切换为本地总结。文件完成 READY 处理后后台请求一次 `ALL` 文件总览，结果按 user/device/source revision 写入本地 schema v7；失败保留旧大纲/总结。学科总览只组合当前学科已有本地文件结果，不上传新的原文，不进入 Sync。File Viewer 仅代表代码与构建已接入，DOC/DOCX 真实样本、浏览器/Tauri GUI 布局和资源加载仍需人工验收；预览顶部/底部栏使用轻微投影和实体按钮，缩放与旋转各自放入同款简单圆角控制组，缩放显示为 `− / 倍率 / ＋`，旋转显示为左旋线条图标、角度、右旋线条图标，文档上下安全留白收窄为约 12–16px。宿主不再叠加会遮挡正文的“正在渲染文档”遮罩，首次宽度适配只持续到用户第一次交互；`FilePreview` 与 renderer 仅在组件 ref 尚未建立时暂存动作，基础 Vue 组件通过 `withFullViewerOptions` 接入 full preset，缩放调用 `zoomIn`/`zoomOut`/`resetZoom`，PDF/图片旋转走 `applyViewState`，图片 renderer 自带旋转栏隐藏，不支持视图旋转的 Office renderer 才使用外层回退。学习文件列表行不显示装饰性文件类型图案，直接从文件名开始布局。若真实文件兼容性不达标，保持 `FilePreview` 合约不变并替换为服务端转 PDF 渲染器。
- File Viewer 交互补充：不以 `load-complete` 作为执行硬门禁；同时避开 `@file-viewer/vue3-full@2.3.2` 包装组件在 Vue 父级 ref 上丢失公开方法的问题，改由 `@file-viewer/vue3@2.3.0` 基础组件承载相同 full 配置。Chrome 合成图片已验证缩放尺寸和 90° 旋转发生实际变化；真实样本、浏览器/Tauri GUI 布局和资源加载仍需人工验收。
- Asset：上传、处理状态和资料组织；首屏并行读取 Subject、Source、KnowledgeBlock 与 Task 的本地 Store 投影，任一项读取失败仍构建其余本地树并关闭 loading。各 Store 随后独立刷新云端结果、通过其 repository cache 写回本地；资产页监听四类投影并重建树，不重新显示 loading。资产树的“全部任务”和各学科任务目录均来自 `useTaskStore` 的当前用户任务，不注入静态演示任务。任务按 `未排期`、`未完成`、`已完成` 三个并列分组，截止时间存在时按截止时间排序；任务完成切换回写 Task API/repository。任务编辑器不再提供认知负荷按钮，改为 30 分钟步进的预计用时，并可保存标题、备注、截止日期和时长。`/asset?focus=unassigned-tasks` 会展开并聚焦“未排期”。真实 Source 文件以 `FilePreview` 为唯一预览实现，TreeNode 透传 Source 的 `id`、`assetId`、`name` 和 `fileType`；旧 `PdfViewer`、首页 PDF 伴读入口和 Asset 的 `filePath`/Markdown 预览分支均不保留。
- Dashboard/Timeline：排期和任务时间管理，排期队列展示有 `dueAt`、无 `scheduledAt` 且未完成/未取消的任务。Task Store 以认证态的 `serverDeviceId` 访问用户隔离的本地 repository；首次加载先渲染本地任务，云端列表刷新在后台写回 Store，失败时保留当前投影。两页切换日期只调用 `setSelectedDay` 在内存中重建槽位，不重读 repository 或清空当前任务。拖放先携带任务 ID 与已排期任务的源槽位写入本地 repository/outbox，再刷新内存槽位；后台 push/pull 失败不会回退已保存的本地排期，本地写入失败会以页面通知反馈。启动 fetch 和运行中分钟级检查会执行到期转换：有 `scheduledAt` 的任务在该时间过去后更新为完成并保留排期；无 `scheduledAt` 的任务在 `dueAt` 过去后显式提交 `dueAt: null`，进入未排期。转换失败保留原数据并记录错误，页面不显示逾期提醒。拖放、按天排期和换位的目标 `scheduledAt` 早于当前时刻时，Store 在 API 或离线 mutation 前拒绝操作，保留原位置并通过既有页面错误反馈显示。首页和独立时间轴统一展示当前/所选日期所在的完整自然周（周日至周六），避免只保存 `dayCode` 时跨周解析到下一周。首页日期格在日数字上方显示 `Sun` 至 `Sat` 英文星期缩写，选中日期使用固定约 `36px × 36px` 圆形绿色背景，顶栏以“时间轴 · X月”显示月份。日视图以半小时槽位承接排期开始时间，已完成或已过去的排期仍保留，其中已过去任务以删除线标记；已排期任务拖动到新槽位时以目标槽位覆盖旧 `scheduledAt`。时间轴“导入任务”进入资产库未排期分组，任务变化通过 `useTaskStore` 写入本地 repository/outbox 并在后台同步。
- Profile：账号、user/device/session 状态、会话撤销、外观和设置；统计通过 `useStatsStore`，知识导出通过 `useKnowledgeStore`。登录会话列表使用服务端每设备一条活动会话视图，当前会话不可在页面中撤销；撤销其它设备会阻止其续期，已签发的 access token 按有效期自然失效。个人空间提供确认后的“退出登录”入口：调用当前会话 logout、始终清理本地会话并跳转 `/login`，服务端失败会给出明确提示。正式入口内嵌 BYOK 卡片：读取服务端脱敏设置，只显示 `hasApiKey`/Base URL，API Key 仅在 `PUT /api/ai/settings` 请求体内提交并在成功后清空，不使用浏览器存储或普通请求 header。
- Pomodoro：宽屏专注计时、任务选择、开始/暂停/重置、休息阶段和今日专注数据；计时 UI 通过 `usePomodoroStore`，任务同步仍由 `useTaskStore` 负责。

详细交互与视觉只在 [前端设计](../design/Frontend.md) 维护。

## OCR 页级行为与诊断边界

- 2026-09-18 Task 4 收口：本地 OCR 页级检查点已投影到既有文档处理 Store，Source 行复用原有详情位置显示 `正在识别第 X/Y 页`；不新增百分比、进度组件或其它 UI。重连替换 socket 在 `onopen` 只请求一次既有 background `read` sync；处理 runtime 对处于 processing 的 Source 采用按生命周期与认证 scope 守卫的共享有界 reconciliation，以覆盖遗漏的 `READY`。focused 自动测试、`type-check`、PC 全量回归、Web build 和 diff-check 已通过；真实 Tauri/GUI OCR 进度、真实后端 WebSocket/event delivery 与跨设备收敛仍属人工/发布验收边界。
- 2026-09-18 Task 5 收口：Store 在 Local OCR reader 尚未完成时保留最近有效页级投影；同一 `attempt + localContentRevision` 的 `OCR_RUNNING` Source 进入 `after-recognize`、`after-normalize`、`page-result` 或 `empty-page` 检查点时，且 page/total 与最近有效值一致，继续显示旧页值。相同 run 的倒退 `before-recognize`（包括 totalPages 变化）不覆盖，新 run 必须先有自己的 `before-recognize`；成功读取会原子替换 projection，reader detach、Source 不再出现在 OCR_RUNNING 列表或 reader 失败仍清理失效值。runtime reader 仅补传已有 local record identity；未改变 UI、OCR Coordinator、sync 或 API/数据库契约。Store/UI/coordinator/runtime focused 68/68、`type-check` 与 `git diff --check` 通过；真实 Tauri/GUI OCR 进度仍需人工观察。
- `DocumentParser`/runner 按真实页码逐页推进；OCR 前持久化 `OCR_RUNNING` 检查点，空页只产生页级诊断并继续请求后续页，非空结果按页码和 block ordinal 保持顺序。
- 当所有页归一化后均为空时，runner 以 `OCR_DOCUMENT_EMPTY` 进入 `FAILED_LOCAL`；UI 显示页码、总页数和“未识别到文字”，不伪造成功 block 或页数。
- Profile 处理中心展示 bounded diagnostics，并提供复制入口。复制文本只允许页码、总页数、图片字节数、行数、耗时、结果和安全错误码/说明；不包含 OCR 正文、完整图片路径、`Authorization`、签名 URL 或未知原始字段。复制 API 不可用或失败时仍保留可见诊断。
- Rust sidecar page summary、stderr tail 和 invoke 错误保持有界；OCR 正文仅流经本机 parser/package 加密边界，不写入日志。上述内容有 Node/Rust focused 自动测试，但真实 Tauri `1.pdf`、剪贴板/accessibility 和现场日志仍未验收。
- 断网暂停后的继续操作保持上传边界：存在持久化 payload receipt 时按 `PAUSED_NETWORK -> QUEUED -> UPLOADING` 直接续传，不重新执行 OCR、下载或源文件 hash；没有 receipt 的 `QUEUED` 任务仍执行解析。`NETWORK_OFFLINE` 继续作为稳定错误码，传输原因仅保留 allowlist token。

## Tauri 边界

- JavaScript API、CLI 和 Rust crate 当前统一为 `2.11.1`。
- Local Asset Store 的 native 边界从 Tauri `app_data_dir()` 派生 `assets/` 和 `asset-staging/`；SQLite plugin 仍按其当前实现从 `app_config_dir()` 解析 `auralis.db`，两者不混用。`local_asset_store` 只接受 user/device/local-asset 逻辑身份与受校验的扩展名，不接受调用方目标路径，并沿用 Server 的 52,428,800 字节单文件上限。导入和远端物化均采用 `.part` 写入、flush/fsync、校验 size/SHA-256 后原子 rename；resolve/delete/reconcile 会执行路径 containment、文件类型和 owner scope 校验，并以有界错误码返回缺失、篡改、冲突和 staging 异常。当前未开放宽泛 Tauri asset protocol/CSP；实际 Tauri `app_data_dir()`、SQLite plugin 连接和 GUI 文件 URL 仍需人工验收。
- 原始文件选择器到 Local Asset Store 的最小 native 桥接命令为 `import_local_asset_bytes`。因 Rust 命令参数名为 `command`，Tauri JSON IPC 调用形状为 `{ command: { userScope, deviceId, localAssetId, safeExtension, expectedSize, expectedSha256, content } }`；`content` 对应 Rust `Vec<u8>`，调用方必须传 JSON 数字数组（每项 `0..255`，通常为 `Array.from(new Uint8Array(bytes))`），不能直接把 `Uint8Array` 当作 JSON 数组传入。返回 `LocalAssetDescriptor` 的 `localAssetId`、`safeExtension`、`sizeBytes`、`sha256`、`absolutePath` 均为 camelCase。该命令与文件路径导入共用同一锁、大小/hash 校验、`.part` fsync 和原子发布流程，重复相同内容幂等，已存在不同内容返回 `LOCAL_ASSET_CONFLICT`；自动测试已覆盖超限、hash mismatch 清理、幂等、冲突和成功发布。
- 使用 `@tauri-apps/plugin-sql` 提供 SQL 插件能力。
- 默认 capability 启用 `core:default`、`log:default`、`sql:default` 与持久化 repository 所需的 `sql:allow-execute`；当前未启用 shell/http/fs。Vite 开发代理只接受 `VITE_DEV_API_TARGET` 与 `VITE_DEV_WS_TARGET`，Tauri 运行时 API/WS base 必须显式配置。Vite 显式注入 `vue/compiler-sfc`，并忽略 `public/file-viewer/**` 生成资源的开发监听，避免 File Viewer 首次复制触发 `@vitejs/plugin-vue` 空 compiler HMR 竞态。SQLite 初始化同时识别 Tauri v2 的 `__TAURI_INTERNALS__` 和旧 `__TAURI__` 全局。Debug Tauri 的日志插件只写 stdout，避免已有日志文件阻止窗口启动。
- AI 辅助阅读的 OCR 仅随 PC Tauri 打包：`src-tauri` 通过 bounded commands 管理 target-triple `auralis-ocr` externalBin，固定 RapidOCR/ONNX 模型与 manifest 从 `../ocr-sidecar` 作为 resources 进入安装包；前端不接受可执行文件、模型路径或任意 shell/fs/http 参数。
- G1 protocol、G2 sidecar engine、G3 Rust supervisor 和 G4 MSI bundle 已有自动测试/产物证据；最终 MSI 通过 verifier，五组离线 OCR baseline 已记录。临时 all-users 安装因宿主 Error 1925 未完成，安装后 GUI/OCR 仍属于 R2 验收，不写成已通过。
- G5 已提供固定尺寸、不可 `display:none` 的 `BackgroundParserHost` 与 `FileViewerParserBridge`，复用 File Viewer 的文本块/锚点 API，并在空结构时提供 bitmap fallback/`OFFICE_TEXT_UNAVAILABLE`。DOC/DOCX/PPT/PPTX fixture matrix 3/3 通过，其中旧式 PPT 由 Apache POI 生成真实 OLE 文件；实际 File Viewer/Tauri 运行时的四种文件提取、回退和稳定失败结论仍需验收。G6 `DocumentParser` 已按页分类 text-layer/扫描 PDF，串行调用 OCR，支持 Office direct/fallback，归一化文本并以 sink 背压输出 bounded block；core 7/7 与真实 PDF 2/2 通过。
- 目录从 StudyCore 重命名后，旧绝对路径可能残留在 Rust 构建缓存；仅在确认属于缓存时执行 `cargo clean`。
- 2026-09-05 已停止当前仓库的 Tauri 开发进程并精确删除应用配置目录中的 `auralis.db`、`auralis.db-wal`、`auralis.db-shm`；重启后数据库和完整表集已重新建立。远端同步恢复的 3 个文档任务均因 master key 缺失进入 `FAILED_LOCAL`，该密钥边界仍待修复或人工恢复验证。
- `npm.cmd run tauri -- build --no-bundle` 已验证 Rust/桌面应用本体生成；完整 MSI bundling 曾因宿主 `拒绝访问 (os error 5)` 阻断。Web/Tauri 本体构建通过不能证明桌面权限、窗口、插件、安装包和系统集成可用。

## 开发与验证命令

```powershell
cd Auralis-PC
npm install
npm run dev
npm.cmd run build
npm.cmd run check:subject-icons
npm.cmd run check:subject-workspace
npm run tauri dev
npm.cmd run check:r4-pc
npm.cmd run test:r4-pc
npm.cmd run type-check
npm.cmd run tauri -- build --no-bundle
```

| 命令 | 证明范围 | 不证明 |
| --- | --- | --- |
| `npm run dev` | Vite 开发服务可启动 | 生产构建、桌面能力 |
| `npm.cmd run build` | 类型构建与 Web bundle | Tauri GUI、业务流程 |
| `npm.cmd run check:subject-icons` | 学科语义图标、旧 Emoji 分支与页面接入静态契约 | 浏览器/Tauri 的实际图标显示、键盘和视觉效果 |
| `npm.cmd run check:subject-workspace` | 学科工作区关键 UI 结构契约 | 浏览器拖拽、AI 流式请求与视觉效果 |
| `npm run tauri dev` | 当前机器桌面开发启动 | 安装包和其他系统 |
| `npm.cmd run check:r4-pc` | 生产源码未命中旧 DTO、旧同步字段、旧地址和旧 AI 路径 | 真实 API、GUI、安装包 |
| `npm.cmd run test:r4-pc` | PC 协议、本地 repository、Store mapping、SSE reducer、BYOK 禁止浏览器明文、离线幂等与运行时配置测试 | 浏览器、Tauri GUI、真实后端 |
| `npm.cmd run tauri -- build --no-bundle` | Rust/桌面应用本体和前端 bundle 可生成 | MSI、安装/升级/卸载和 GUI 验收 |

## 当前限制

- 登录守卫逻辑已恢复并有路由决策测试；浏览器/Tauri 登录、刷新、退出和过期仍待人工验收。
- 当前已有 R4 协议、本地 repository、Store mapping、SSE reducer 和运行时配置自动测试，但没有替代真实服务的浏览器 E2E。
- `tsconfig.app.json` 的 TypeScript 6 `baseUrl` 弃用错误（TS5101）已通过移除配置项解决，`AppHeader.vue` 的未使用 `ElMessage` 导入也已清理；2026-08-12 `npm.cmd run build` 通过，但 Vite 提示部分 chunk 超过 500 kB。
- Tauri GUI 和 MSI 打包需本地人工验收；当前 MSI bundling 被宿主权限错误阻断。
- API、同步、资产、AI 和 C4 上传链路需要真实 Server/基础设施联调。
- AI key 的持久化安全、网络中断后的会话恢复和 token 刷新均有自动测试，但仍需要浏览器连接真实 Server/SSE 的人工业务验收。
- 用户当前工作树包含页面、Store、样式和 Tauri 依赖改动；在提交前必须按范围复核。

## 修改后的强制回写

- 路由、页面、Store、API 或 Tauri 变化：更新本文件。
- 视觉或交互变化：更新 `docs/design/Frontend.md`。
- 接口变化：更新 `docs/contracts/API.md`。
- 状态或风险变化：更新 `docs/current/`。
- 可确认变化：更新 `docs/release/Changelog.md`。

## 2026-09-09 Task 15

`ParsedDocumentUploadCoordinator` 在明确收到 `ACCEPTED` complete 且记录 `COMPLETE_ACCEPTED` 后，通过可选 `onCompleteAccepted` 回调请求一次 `useSyncStore().requestBackgroundSync('read')`。回调失败只记录固定诊断，不改变 accepted 返回值或阻止 `SERVER_INDEXING → READY`；rejected、缺失/非法状态、complete 异常均不触发。真实 Tauri、Server/MinIO、sync pull 与 GUI 仍待人工验收。
# PC 当前实现补充（2026-09-09）

ParsedDocument upload coordinator 在服务端 complete 返回 `ACCEPTED` 后，按本地 `DocumentProcessingJobRepository` 合法迁移依次写入 `SERVER_INDEXING` 和 `READY`；scheduler 仍在 READY 之后执行结果返回与派生 cache 清理。真实 transition-validating repository 回归覆盖该边界，真实 Tauri/Server/MinIO/GUI 仍需人工验收。

2026-09-09：scheduler 先读取一次权威 Source backend，再对选中的 current revision 预检本地 cache column/receipt 关系；`SERVER_VALIDATING`/`SERVER_INDEXING` 的本地 mismatch 可安全进入 `FAILED_LOCAL` 并 retry，READY/FAILED_SERVER 保留原 phase。预检失败不执行 hash、runner、upload 或 cache deletion。

2026-09-09 Task 13：ParsedDocument 上传边界增加非持久化 `[Document Upload Trace]` allowlist 事件，覆盖每次 PUT 的开始/校验成功或失败，以及 Server complete 接受或失败；日志不包含 URL、headers、receipt/cache/path、OCR 正文、响应体或异常对象。自动测试 19/19；真实 Tauri/MinIO/Server/GUI 仍待验收。

2026-09-10 PC Overview 触发诊断：文件总览生成现在输出带固定前缀 `[FILE_OVERVIEW_TRIGGER]` 的结构化、allowlist 生命周期日志，触发值来自 TypeScript 封闭类型和已知调用点：`SOURCE_READY`、`RESUME_BOOTSTRAP`、`RESUME_ONLINE`、`RESUME_SYNC`、`JOB_CHANGED`、`MANUAL_RETRY`（不代表运行时动态校验）。仅在实际进入 `runFile` 的生成尝试中由服务创建 request ID，并由 `useOverviewApi` 原样复用到既有 `X-Overview-Request-Id`；preflight/skip 事件可能没有 `requestId`。现有内存 in-flight coalescing 保持不变。本次仅增加诊断与关联，不改变重试、缓存、Provider、Server 或 timeout 行为。Overview 自动化验证通过；真实 Tauri、Provider attribution 与业务验收仍待执行，且 Server 同一 `(user, source, revision, mode)` 的进行中去重/idempotency 与 PC/Server timeout mismatch 仍是开放风险。
