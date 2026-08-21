# PC 前端模块

更新时间：2026-08-21

文档状态：现行

权威范围：`Auralis-PC` 的当前依赖、路由、页面、Store、API 边界、Tauri 集成、构建方式与限制

事实来源：`Auralis-PC/package.json`、`src/`、`src-tauri/` 与 2026-08-20 当前代码

## 模块定位

`Auralis-PC` 是桌面与 Web 共用的 Vue 客户端，负责高信息密度的学科工作区、资产、任务时间线、知识关系和设置。浏览器开发与构建由 Vite 提供；桌面能力由 Tauri 2 提供。

截至 2026-08-20，PC 页面与基础视觉重构已基本收敛；R4 在原有 Store、AI SSE、运行时代理和 Tauri 权限边界之上，补齐了 BYOK 浏览器明文清理、离线写入幂等、SSE 401 单次刷新和离线 AI 会话恢复。PC Web 与 Tauri 应用本体构建已通过；MSI bundling、浏览器/Tauri GUI、真实 Provider 和前后端业务联调仍未验收。

前端实现可按[前端 AI 辅助开发约定](../agent/FrontendAIAssistedDevelopment.md)优先使用 AGY/Antigravity 中的 Gemini；生成代码必须经过当前模块边界、API/鉴权、视觉可访问性、构建和 GUI 验收审查。

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

`src/router/index.ts` 的 `beforeEach` 使用 `useAuthStore` 会话和 `resolveAuthRedirect` 处理公开/受保护路由。当前结论：

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
| `useSourceStore.ts` | Source 分页、资料目录、软删除和 Source mutation |
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
| `api/useStatsApi.ts` | 概览与周统计 |
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
只冻结类型和请求边界，现有页面/API 仍需按 R4 计划逐模块迁移，不能把类型检查通过写成前后端联调完成。

## 本地数据边界

| 文件 | 职责 |
| --- | --- |
| `services/localSchema.ts` | Tauri SQLite v2 schema、旧 key/value 表的可恢复改名和 snake_case 行转换 |
| `services/localRepository.ts` | 按 `userId + deviceId` 隔离的资源、tombstone、mutation、cursor 与 snapshot repository |
| `services/legacyLocalData.ts` | 旧 account-less localStorage 的 `legacy_unassigned` 备份和显式迁移选择记录 |
| `services/localDb.ts` | 尚未迁移 Store 的兼容 facade；新 Store 不得新增对旧方法、旧字段或全局业务 key 的依赖 |

R4-06 的 repository 已覆盖 Web fallback 和 SQLite adapter 的用户隔离、`version/baseVersion` 冲突、`deletedAt` tombstone 及 reset 保留 pending。R4-07 的 `useSyncApi` 只使用 `cursor/changes/nextCursor/hasMore/resetRequired`、`deviceId/mutations/results` 和 snapshot DTO；`useSyncStore` 的 realtime、启动恢复、网络恢复和主动同步共用 `pullChanges`。R4-08/09 已将 Subject、Source、KnowledgeBlock、Asset、Task、Review、Stats、Chat、Pomodoro 主路径切换到 `typed API → repository → view model`。核心资源 CREATE 先以稳定 `resourceId/clientMutationId` 写入 outbox，只有明确离线或传输失败才排队，5xx 不伪装成离线。Chat 的 `CONVERSATION` 和本地专用 `CHAT_MESSAGE` 行保存 `creationRequestId/clientRequestId`，上线后依会话与消息顺序恢复；`CHAT_MESSAGE` 不进入 Sync 推送。`localDb.ts` 与 `useBlockStore.ts` 仅保留兼容边界。

## 页面职责

- Dashboard：时间线、待办和快速创建；数据来自 `useTaskStore`、`useKnowledgeStore` 和 `useSubjectStore`，无静态演示数据兜底。
- SubjectHall：学科卡片、搜索、创建、删除和进入工作区；新用户注册后没有自动学科时展示真实空状态，历史遗留“未分类”学科也可正常删除。
- SubjectWorkspace：文件、知识、任务、总结、图谱与 AI 上下文；学科图标经 `src/utils/subjectIcon.ts` 统一解析，新建学科保存语义键并渲染 Lucide Icons 线条图标，创建弹层不提供主题色选择，默认、左下角和全局功能侧栏图标底色统一为 `#7D9372`，已有 Emoji 值原样显示，空值或未知语义键回退书本线条图标。右侧 AI 伴读以页面内 SVG/CSS 复刻手机端四芒星、星环、消息气泡、输入中状态和纯文本胶囊输入；当前正式路径使用 typed `streamAiMessage` 和 `/api/ai/messages/stream`，不提供附件或麦克风入口；每次进入或切换学科都会开启新的伴读会话，不回溯旧消息。
- SubjectWorkspace：文件点击后在中栏展示关联知识块汇总的 Markdown 总结；左侧学科大纲为当前静态交互原型，支持内联新增和限定范围拖拽，尚未接入持久化或接口。
- Asset：上传、处理状态和资料组织。
- Timeline：排期和任务时间管理，任务变化通过 `useTaskStore` 写入 API/repository mutation。
- Profile：账号、user/device/session 状态、会话撤销、外观和设置；统计通过 `useStatsStore`，知识导出通过 `useKnowledgeStore`。登录会话列表使用服务端每设备一条活动会话视图，当前会话不可在页面中撤销；撤销其它设备会阻止其续期，已签发的 access token 按有效期自然失效。个人空间提供确认后的“退出登录”入口：调用当前会话 logout、始终清理本地会话并跳转 `/login`，服务端失败会给出明确提示。正式入口内嵌 BYOK 卡片：读取服务端脱敏设置，只显示 `hasApiKey`/Base URL，API Key 仅在 `PUT /api/ai/settings` 请求体内提交并在成功后清空，不使用浏览器存储或普通请求 header。
- Pomodoro：宽屏专注计时、任务选择、开始/暂停/重置、休息阶段和今日专注数据；计时 UI 通过 `usePomodoroStore`，任务同步仍由 `useTaskStore` 负责。

详细交互与视觉只在 [前端设计](../design/Frontend.md) 维护。

## Tauri 边界

- JavaScript API、CLI 和 Rust crate 当前统一为 `2.11.1`。
- 使用 `@tauri-apps/plugin-sql` 提供 SQL 插件能力。
- 默认 capability 只启用 `core:default`、`log:default` 和 `sql:default`；当前未启用 shell/http/fs。Vite 开发代理只接受 `VITE_DEV_API_TARGET` 与 `VITE_DEV_WS_TARGET`，Tauri 运行时 API/WS base 必须显式配置。
- 目录从 StudyCore 重命名后，旧绝对路径可能残留在 Rust 构建缓存；仅在确认属于缓存时执行 `cargo clean`。
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
- API、同步、资产和 AI 需要真实 Server/基础设施联调。
- AI key 的持久化安全、网络中断后的会话恢复和 token 刷新均有自动测试，但仍需要浏览器连接真实 Server/SSE 的人工业务验收。
- 用户当前工作树包含页面、Store、样式和 Tauri 依赖改动；在提交前必须按范围复核。

## 修改后的强制回写

- 路由、页面、Store、API 或 Tauri 变化：更新本文件。
- 视觉或交互变化：更新 `docs/design/Frontend.md`。
- 接口变化：更新 `docs/contracts/API.md`。
- 状态或风险变化：更新 `docs/current/`。
- 可确认变化：更新 `docs/release/Changelog.md`。
