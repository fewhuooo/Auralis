> [!WARNING]
> 本文是 2026-11-13 整理前的工作树原文，仅供历史追溯，不作为当前实现、状态、接口或任务的依据。现行入口与原文校验说明见 [README](README.md)。

<!-- ORIGINAL WORKTREE CONTENT -->
# Mobile / Tablet 前端模块

更新时间：2026-09-12
文档状态：现行
权威范围：`Auralis-Mobile` 的当前依赖、页面、条件编译、Store、API、端侧服务、手写开关、构建方式与限制
事实来源：`Auralis-Mobile/package.json`、`src/pages.json`、`src/`、`scripts/` 与 2026-08-20 当前代码

### 2026-10-12 聊天资料检索默认开启（代码、协议测试与 H5 构建通过；类型检查受既有问题阻断）

- Mobile 与 Tablet 共享协议 1 聊天客户端。命令的 `readingContext` 引用 OpenAPI 生成的 `ReadingContext` 类型，`selectionText` 属于命令顶层。AI Search 省略 `readingContext` 创建 owner-wide 绑定，服务端每次 attempt 捕获当前用户 READY 来源，模型的默认搜索仅查该快照。Tablet Profile 已移除本地 `ragEnabled` 关闭控件。
- `test:r4-mobile` 24/24、`check:r4-mobile` 与 `build:h5` 退出码 0。`type-check` 退出码 2，仅为未迁移的 `src/api/reviewApi.ts` 引用已移除的 `EventRequest` / `EventResponse`；干净 HEAD 同样复现，不属于本轮引入，未修改该模块。
- 本轮额度、BYOK、模型设置、会话与 SSE 协议保持。真实 Provider、GUI/真机及微信构建未运行，证据见[计划](../plans/2026-10-12-rag-always-on.md)。

### 2026-10-11 手机与平板个人中心 AI 额度（代码、相关自动验证与只读审查通过；真机待验收）

- `mobile/profile` 与 `tablet/profile` 共用 `useAiUsage`，从认证 `GET /api/ai/usage` 展示小时/今日总额、已结算、在途预留、剩余及当地重置时间。账号切换、离开页面及新请求使旧响应失效；首次加载和失败不伪造零额度。
- `api/protocol.ts` 与 AI SSE 解析保留六种额度/预算码的安全重试元数据，手机/平板 AI Search 的提示共用 `aiUsageGuardHelper`。保留手动重试、会话协议与已有正文，不增加自动补发。
- 额度 GET 使用现行 `mobileRequest`，access token 过期时沿用一次 refresh/retry，失败调用原 session 失效处理。实际消费者与生产 request executor 回归先 RED 后 GREEN；额度重试策略仍由用户显式触发。
- 实际 Antigravity 候选经 Luna 按失败证据补修并守卫应用。行为 8/8、Mobile 协议 24/24、Tablet 三脚本和静态扫描通过；H5 build 与最终同 hash SDK 下两端 type-check 退出 0，唯一只读审查通过。微信构建、真实设备/Provider/GUI 本轮未验收，完整证据见 [B 计划](../plans/2026-10-10-ai-usage-guard-b.md)。没有新增路由、依赖、端侧表或额度持久缓存。

2026-10-09 共享生成 SDK 随离线复习补传契约更新：生命周期可选 occurredAt/expectedStateAbsent、history protocolVersion、初选 schedulingBaseline 与 legacy firstLearning。PC/Mobile schema 由同一运行时 OpenAPI 生成且 hash 一致，Mobile 本轮没有新增运行时调用、离线 Review 队列或页面，不把共享类型更新视为手机已实现本地新机制。

2026-10-01 必要知识块契约适配：`useSyncStore` 不再向 Server 发送已删除的 summary/tags；本地完整 preview 继续映射为 content，接收端仅将 content 映射回 preview，避免旧 summary 截断正文。端侧 preview/tag 存储与现有页面保留，未新增专注历史 API 或 Overview results 展示。生成 SDK 随共享 OpenAPI 更新；因此暴露的现行上传契约 `clientImportId` 必填调用缺口已在 `assetUpload.ts` 最小补齐，每次操作使用一个 UUID，并可由调用方传入稳定 ID 重试，未新增页面或持久状态。Mobile type-check 退出 0，协议检查 23/23；真实设备未验收。

2026-09-24 API 类型同步：从当前 OpenAPI artifact 重新生成 PC/Mobile `schema.ts`，`ScheduleInsertionRequest` 新增可选 `targetTaskId`。Mobile 运行时未调用该主体放置模式，现有请求仍使用无目标 ID 的普通插入语义。

2026-09-23 OpenAPI Task schedule insertion types 同步：`api/generated/schema.ts` 增加 `/api/tasks/schedule-insertions` 请求与响应 DTO；Mobile/Tablet 未接入该端点，运行时行为不变。

2026-09-12 Build/OpenAPI Task 3 最终回归：Mobile `npm.cmd run type-check` 退出 0，`node scripts/r4-mobile-protocol.test.mjs` 实际 23/23 通过；`check-openapi.ps1` 退出 0，生成 `schema.ts` 与 PC 及 OpenAPI artifact 一致，`subjectOverview`/`sourceOverview` 的 header 暴露可选 `X-Overview-Request-Id`。`useSyncStore` 的一行 `payload as SyncMutation['payload']` 只解决生成 `JsonNode` 结构窄类型的编译期边界，运行时序列化未改变；未来 contract-cleanup 风险仍开放，不代表已完成真实 API/设备验收。真实 Server、Provider、微信/H5、Tablet、GUI、设备和业务验收仍待完成。





## 模块定位

`Auralis-Mobile` 是 Uni-app 工程，同时承载手机与平板体验。两端共享基础状态、API 和服务，但页面路径、导航布局和交互密度独立。微信小程序只发布手机体验。

截至 2026-08-21，Mobile/Tablet 共享的鉴权、请求、Sync/Realtime、AI、Asset、Review 和 Stats 边界已迁移到冻结 OpenAPI；Tablet Dashboard/Review/Stats 也已移除随机统计和本地复习结果伪写，改用服务端 Stats/Review。H5 与微信命令行构建通过；微信开发者工具、浏览器及真机主流程尚未人工验收。

2026-09-07 起 Task 契约不再包含认知负荷。Mobile/Tablet 的生成 API 类型、Task Store、同步映射、本地存储、新建任务入口和页面展示不再读写 `cognitiveLoad`、`load` 或 `loadText`。

## 当前技术栈

- Uni-app `3.0.0-4080420251103001`
- Vue `^3.4.21`
- Pinia `2.1.7`
- Vite `5.2.8`
- TypeScript `5.3.3`
- `perfect-freehand`、`jspdf`、`marked`

## 目录边界

```text
Auralis-Mobile/src/
├── api/          # 请求、AI、同步、设备、E2EE
├── components/   # 手机和平板共享/专用组件
├── config/       # feature flags
├── pages/        # launch、mobile、tablet
├── services/     # 本地数据库、笔记、手写引擎
├── store/        # Pinia
├── styles/       # 设计令牌和全局样式
└── utils/        # 通用工具
```

## 页面注册与平台边界

### 启动与手机页面

| 页面 | 路径 |
| --- | --- |
| 启动分流 | `pages/launch/index` |
| 首页 | `pages/mobile/home/index` |
| 专注 | `pages/mobile/pomodoro/index` |
| AI | `pages/mobile/ai-search/index` |
| 统计 | `pages/mobile/stats/index` |
| 设置 | `pages/mobile/settings/index` |
| 登录 | `pages/mobile/login/index` |
| 时间线 | `pages/mobile/timeline/index` |
| 复习 | `pages/mobile/review/index` |
| 资产 | `pages/mobile/asset/index` |
| 个人资料 | `pages/mobile/profile/index` |
| 手写 | `pages/mobile/handwriting/index` |

### 平板页面

| 页面 | 路径 |
| --- | --- |
| 仪表盘 | `pages/tablet/dashboard/index` |
| 学科大厅 | `pages/tablet/subject-hall/index` |
| 工作区 | `pages/tablet/workspace/index` |
| 手写 | `pages/tablet/handwriting/index` |
| 专注 | `pages/tablet/pomodoro/index` |
| 复习 | `pages/tablet/review/index` |
| 个人资料 | `pages/tablet/profile/index` |
| AI | `pages/tablet/ai-search/index` |
| 登录 | `pages/tablet/login/index` |

`pages.json` 使用 `#ifndef MP-WEIXIN` 包裹 Tablet 页面，因此微信产物只包含 launch 与 mobile 页面。微信下 launch 固定进入手机首页。

## 设备分流

- `pages/launch/index` 负责首次选择手机或平板入口。
- 进入某一端后，应用不根据窗口变化自动在两套路由间 reLaunch。
- 401 刷新失败返回当前端登录页。
- 物理分包当前未作为完成条件，微信依赖条件编译控制页面集合。

## Store 清单

| Store | 职责 |
| --- | --- |
| `useAuthStore.ts` | 用户、token 与会话 |
| `useBlockStore.ts` | 知识块与本地数据 |
| `useTaskStore.ts` | 任务、排期、状态 |
| `useSubjectStore.ts` | 学科与当前上下文 |
| `useSyncStore.ts` | mutation、cursor 与同步 |
| `useDeviceStore.ts` | 设备与端类型 |
| `useLayoutStore.ts` | 当前端导航和布局状态 |
| `useSettingsStore.ts` | 偏好和主题 |
| `persist.ts` | Store 持久化辅助 |

## API 与服务

### API

- `api/request.ts`、`requestCore.ts`：环境基址、Bearer、Problem Details 和共享单次 refresh。
- `api/aiClient.ts`、`aiApi.ts`、`sse.ts`：服务端 BYOK 摘要、Conversation 和 `/api/ai/messages/stream`。
- `api/sync.ts`、`useSyncApi.ts`、`realtimeApi.ts`：不透明 cursor、snapshot reset 和 `/ws/events` 一次性 ticket。
- `api/assetApi.ts`、`reviewApi.ts`、`statsApi.ts`、`aiApi.ts`：预签名上传、复习事件、强类型统计和 Conversation 列表/详情/删除。
- `api/device.ts`：设备相关能力。
- `api/e2ee.ts`：加密辅助。
- `api/generated/schema.ts`：从冻结 OpenAPI 产物生成的 DTO、路径、参数和响应类型（禁止手改）。
- `api/generated/client.ts`：约束路径、HTTP 方法、path/query/body 与成功响应的轻量请求适配器。

生成 SDK 的源文件是 `docs/contracts/openapi/auralis-openapi.json`，生成器固定为
`openapi-typescript@7.13.0`。从仓库根目录执行
`scripts/generate-openapi-sdk.ps1` 可同步 PC 和 Mobile；执行
`scripts/check-openapi.ps1` 可校验运行时 OpenAPI 与两端生成文件。当前生成 SDK
冻结类型已进入 Mobile/Tablet 主路径；`check:r4-mobile` 禁止旧 Result、旧 `/ws/sync`、固定本机地址、数值旧游标、旧 AI 路由、Mobile Home/Profile 演示数据、手写伪 OCR、Workspace 固定摘要，以及 Tablet Dashboard/Review 的随机统计或绕过 Stats/Review API。Tablet 仍有真实服务与真机验收缺口，不能把类型检查或构建通过写成前后端联调完成。

### 端侧服务

| 服务 | 职责 |
| --- | --- |
| `localDb.ts` | 端侧 SQLite 表与访问入口；原生/H5 迁移清洗 TASK 颜色键，保留 KnowledgeBlock 颜色和无效 JSON 原文 |
| `localDataScope.ts` | 按 userId/serverDeviceId 选择独立 H5/SQLite namespace |
| `legacyDataPurge.ts` | 用户授权后一次性删除旧全局 `h5_db_*`/`auralis.db` 业务表 |
| `assetUpload.ts` | upload-intent、预签名 PUT、complete |
| `notebookStorage.ts` | 笔记存储兼容层 |
| `tabletNoteModel.ts` | `NoteDocument` 模型与序列化 |
| `tabletNoteRepository.ts` | 平台仓库入口 |
| `tabletNoteRepositoryCore.ts` | 可测试的核心仓库逻辑 |
| `handwritingEngine.ts` | 笔迹、工具与画布交互 |

## Tablet 手写 feature flag

`src/config/features.ts` 读取 `VITE_TABLET_HANDWRITING_NOTES_ENABLED`。当前发布策略是保留实现但默认关闭入口：

- workspace 不显示“+ 笔记”和批注工具条。
- 侧栏不显示随手记入口。
- 数据表、模型、仓库和页面代码继续保留。

禁止依据历史文档直接恢复入口。重新启用必须先完成数据备份策略、真机触控和长时间书写验收。

## Tablet 布局实现要点

- `TabletLayout.vue` 提供左侧导航、AI 入口和 modal 插槽。
- 侧栏指示器动画当前目标为 `120ms`，路由切换延迟为 `160ms`，脚本检查至少两帧余量。
- workspace 默认文件面板，总结栏通过 CSS 折叠联动。
- AI 浮窗通过 modal 插槽脱离 transform 堆叠上下文。
- `HeatmapChart.vue` 支持 `weeks` 配置；Tablet Dashboard 当前传入 `weeks=5`，使用 7 列 × 5 行的正方形日历网格，并在 Hero Banner 使用统一的 `Primary Gradient`。统计格只渲染服务端 weekly 返回的实际日期，不再生成随机补位数据。
- Tablet Review 从服务端 due 队列组卡，先成功提交不可变 ReviewEvent 再推进卡片；右滑只取消当前手势，不伪装撤销已提交事件。

设计目标和页面布局见 [前端设计](../design/Frontend.md)。

## 移动端测试契约变更（2026-08-29）

本轮设备标识是破坏性字段重命名：不保留旧 `deviceId` 字段，也不执行兼容测试。Mobile/Tablet 的登录与注册请求必须使用 `clientDeviceKey`；服务端返回、Sync push、本地数据 scope 和 Realtime 关联必须使用 `serverDeviceId`。Realtime ticket 不带请求体，测试请求必须携带有效 Bearer access token，让服务端从 JWT 解析设备身份。

## 构建与检查命令

```powershell
cd Auralis-Mobile
npm install
npm.cmd run build:h5
npm.cmd run build:mp-weixin
npm run type-check
npm run check:r4-mobile
npm run test:r4-mobile
npm run test:tablet
node scripts\check-tablet-sidebar-transition.mjs
```

仓库还包含：

- `scripts/tablet-feature-flags.test.ts`
- `scripts/tablet-note-model.test.ts`
- `scripts/tablet-note-repository-core.test.ts`

三个 Tablet TypeScript 逻辑脚本已接入 `npm run test:tablet`。

## 当前限制

- H5/微信命令行构建不能替代微信开发者工具和真机。
- 2026-08-20：H5 与微信构建通过；H5 仍有 Sync Store 动态/静态 import 和 Sass legacy API 非阻断警告。
- App、Harmony 和其他小程序平台虽然有脚本，不表示已验收。
- Mobile 当前将 TypeScript 固定为 5.3.3 以匹配 `vue-tsc@1.8.27`；`npm run type-check` 已通过。后续升级 Node、TypeScript 或 `vue-tsc` 时必须重新执行并记录结果。
- Tablet 复杂交互需要真实触控屏。
- 图片上传已实现客户端 intent/PUT/complete，但请求/upload/download 合法域名、MinIO、AI、双设备 reset 和弱网恢复仍需真实环境联调。

## 修改后的强制回写

- 页面、Store、服务、条件编译或 feature flag：更新本文件。
- 交互与视觉：更新 `docs/design/Frontend.md`。
- 页面调用：更新 `docs/contracts/MobilePagesAPIMap.md`。
- API/数据变化：更新对应契约。
- 状态、风险和发布：更新 `current/` 与 Changelog。
