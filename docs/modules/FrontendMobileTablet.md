# Mobile / Tablet 前端模块

更新时间：2026-09-07

文档状态：现行

权威范围：`Auralis-Mobile` 的当前依赖、页面、条件编译、Store、API、端侧服务、手写开关、构建方式与限制

事实来源：`Auralis-Mobile/package.json`、`src/pages.json`、`src/`、`scripts/` 与 2026-08-20 当前代码

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
