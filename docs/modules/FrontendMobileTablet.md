# Mobile / Tablet 前端模块

更新时间：2026-11-27

文档状态：现行模块说明

权威范围：Vue 3 + Vite + Tauri 2 双目标 Android 工程架构、路由拆分、平台适配层、原生桥接、SQLite/缓存存储、手写保留开关、构建与限制

事实来源：`Auralis-Mobile/package.json`、`vite.config.ts`、`src/router/`、`src/platform/`、`src/api/`、`src/store/`、`src/services/`、`src-tauri/` 与页面实现

本文维护现行移动端模块架构与边界；历史 Uni-app 版本整理前记录见[整理前记录](../archive/snapshots/maintenance-2026-11-13/FrontendMobileTablet.md)，迁移实施归档方案见[移动端 Tauri 2 迁移方案](../archive/design-and-plans/plans/frontend/2026-11-26-mobile-tauri-migration.md)。新增实现同步更新对应章节，开放风险与真机验收缺口统一登记在 `current/`。

## 模块定位

`Auralis-Mobile` 已完成从 Uni-app 到 **Vue 3 + Vite + Tauri 2** 的重构，同一源码树通过编译期目标开关 `VITE_APP_TARGET=phone|tablet` 与 Tauri 配置覆盖构建为两个独立 Android 应用：

- **Auralis**（`com.auralis.mobile`，`portrait` 竖屏）：仅打包 `src/router/phone.ts` 手机端 7 个路由，不含 `@file-viewer` 文档阅读器资源。
- **Auralis HD**（`com.auralis.hd`，`sensorLandscape` 横屏）：仅打包 `src/router/tablet.ts` 平板端 8 个路由，按需集成 `@file-viewer/core` 及 PDF/DOCX/PPTX 渲染器与原生文本阅读工作区。

范围决策与数据迁移边界：

- 仅支持 **Android**（`minSdk 24`）；微信小程序、Mobile H5 网页版、iOS / iPadOS 均不纳入发布范围，移动端 Rust 仅注册官方插件，不抽取也不复制 PC 端 Rust 业务逻辑。
- **不迁移旧本地数据**：Uni-app 原生版从未正式发布，新 App 首次登录后通过云端 `/api/sync/snapshot` 自动同步恢复用户数据；原 Uni-app 分支最终代码与快照已完整归档至仓库外 `D:\CodeBase\Archive\Auralis-Mobile-uniapp-20261127\` 与 Git 标签 `archive/mobile-uniapp-20261127`。

## 已确认目标与收口状态

2026-11-16 已确认三端职责与设计目标，2026-11-26～27 完成 Tauri 2 Android 原生迁移、MuMu 15 模拟器实机视觉与触控反馈调优（`Auralis` 全宽适配、平板紧凑令牌、触摸按压缩放动画、原生 `1.0` 视口防 WebView 模糊）。物理手机与平板真机全流程验收仍开放。

| 领域 | 现行实现与已落地收口 | 剩余边界 / 待真机验收 |
| --- | --- | --- |
| 载体与导航 | 双独立 Android 包通过 `vue-router`（`createWebHashHistory`）+ `vite.config.ts` 别名 `@/router/activeRoutes` 物理裁剪路由（移除旧 `pages/launch` 启动页）；`src/platform/touchFeedback.ts` 为移动端 WebView 提供全局委托指针按压反馈（CSS `scale` 关键帧、110ms 最短保持、>10px 滚动取消、FlashCard/遮罩/输入排除）与分段滑块动画；`MainActivity.kt` 统一处理 Edge-to-Edge 系统栏 `WindowInsets`、软键盘 `ime()` 内边距、Android 系统返回键派发与前后台生命周期同步 | 物理手机与横屏平板多机型手势、软键盘弹出高度与系统导航栏适配 |
| 排期与任务 | `dateKey.ts` 与 `taskSyncMapper.ts` 保留完整本地日期与非整点时间语义，`unschedule` 清空 `scheduledAt` 为 `null`；对齐 PC 端过期任务自动完成（`recoverOverdueTasks`）及已结束排期完成锁定（`isScheduledCompletionLocked`）；待办持久化先行 + 账号切换清表 + `localDb` 写前作用域围栏、`local_mutations` 同实体离线变更合并及 `CONFLICT`/`REJECTED`/`RESOURCE_DELETED` 收敛 | 真实后端双设备并发排期冲突实测 |
| 专注与统计 | `useFocusStore.ts` + `focusController.ts` 基于墙钟 `phaseEndEpochMs` 持久化跨页/锁屏倒计时，仅自然完成写入 `focus_outbox` 并调用 `POST /api/focus-sessions`（终态 4xx 不阻塞队列头）；登录与切回前台先 Sync 再 flush outbox；`statsApi.ts` 显式传本地 IANA `timeZone` | 真实 Android 后台保活、熄屏跨日计时与省电策略实测 |
| 复习与知识 | 手机「学习 / 复习」两页直达与平板工作区「学科复习」（`WorkspaceReviewPane`）均由 `useMobileLifecycleReview` + `reviewApi` 驱动现行学习/巩固/复习/自测全生命周期、离线待确认命令重试、防剧透遮罩及 `409 RESOURCE_VERSION_CONFLICT` 恢复；`blockSyncMapper.ts` 修复推送 `APPLIED` 后 `sync_version` 落盘 | 物理机连续滑卡触控与多设备并发冲突走查 |
| 资料、Overview 与 AI | 原生 `<input type="file">` + XHR 直传 MinIO + `sourceApi.ts` + `overviewApi.ts`（`getSubjectStatuses` 预检）；平板三栏工作区含 `WorkspaceSourceRail`、`WorkspaceCenterReader`、`WorkspaceDocumentViewer`（`@file-viewer/core` + IndexedDB `localDocumentCache`）、`WorkspaceKnowledgeBlockModal`（5 色标记与实时预览）、`WorkspaceReviewPane`、`WorkspaceStatsPane` 与可拖拽 `WorkspaceAiPanel` 浮窗；全端 AI 对话通过 `fetch` `ReadableStream` 真流式消费协议 1 SSE、`DOMPurify` + `KaTeX` 渲染，并对齐交叉过程时间轴与带登录世代/作用域围栏恢复 | 真实 MinIO 签名上传/下载域名、大文档触摸缩放与弱网 SSE 断流恢复真机实测 |
| 手写 | `tabletHandwritingNotesEnabled` 继续默认关闭，工作区与侧栏不暴露笔记/批注入口；底层 `tablet_notes` 与画布代码保留 | 自由画布导出、多端战略与触控压感单独排期 |

## 当前技术栈

与 `Auralis-PC` 对齐的现代前端与 Tauri 2 工具链（依赖版本来自 `Auralis-Mobile/package.json`）：

- **前端框架与路由**：`vue ^3.5.32`、`vue-router ^4.6.4`、`pinia ^3.0.4`
- **构建与类型检查**：`vite ^8.0.10`、`@vitejs/plugin-vue ^6.0.6`、`typescript ~6.0.2`、`vue-tsc ^3.2.7`
- **原生宿主与插件**：`@tauri-apps/cli ^2.12.6`、`@tauri-apps/api ^2.12.5`、`@tauri-apps/plugin-sql ^2.4.0`、`@tauri-apps/plugin-clipboard-manager ^2.2.0`、`@tauri-apps/plugin-haptics ^2.2.0`、`@tauri-apps/plugin-opener ^2.2.0`
- **文档、渲染与数学公式**：`@file-viewer/core ^2.3.0`（`pdf` `^2.3.0`、`word` `^2.3.1`、`presentation` `^2.3.0`、`vite-plugin 2.3.2`）、`katex ^0.16.47`、`marked ^18.0.5`、`dompurify ^3.4.6`、`jspdf ^4.2.1`、`jszip ^3.10.1`、`perfect-freehand ^1.2.3`
- **单元测试 SQL 运行时**：Node 24 内置 `node:sqlite`

## 目录边界

```text
Auralis-Mobile/
├── index.html                        # 原生 HTML 入口；vite.config.ts 注入 data-app-target 与 1.0 viewport
├── vite.config.ts                    # 双目标裁剪、activeRoutes 别名、平板 file-viewer 资源插件
├── package.json / tsconfig*.json     # 编译与测试入口（已排除 src/**/__tests__/** 免扰 Vue 应用类型检查）
├── src/
│   ├── main.ts / App.vue             # 启动恢复会话、全局触控反馈绑定、返回键与前后台生命周期监听
│   ├── router/                       # target.ts、phone.ts、tablet.ts、index.ts
│   ├── platform/                     # 统一原生与 WebView 适配层（替代所有 uni.*/plus.* 调用）
│   ├── api/                          # REST、AI SSE、Sync、Realtime、Asset、Stats 与 generated/ 契约
│   ├── store/                        # Pinia（Auth、Block、Task、Subject、Sync、Focus、Device、Layout）
│   ├── services/                     # tauri-plugin-sql 本地库、IndexedDB 缓存、同步/专注/笔记状态机
│   ├── composables/                  # useAuthForm、useDueReview、useMobileLifecycleReview、useEscapeKey
│   ├── components/                   # 共享禅意原语（StudyMetrics、ZenTaskRow、ZenWeekStrip 等）及 tablet/ 组件
│   ├── pages/{mobile,tablet}/        # 按端隔离的页面目录
│   ├── styles/                       # 设计令牌（含 html[data-app-target='tablet'] 紧凑令牌）
│   └── utils/                        # 日期、Markdown/TeX、AI 过程流、同步映射、SHA-256 等纯函数
├── src-tauri/                        # Tauri 2 插件宿主与 Android Gradle 工程
│   ├── Cargo.toml / src/lib.rs       # 仅注册 sql、opener、clipboard-manager、haptics 四插件
│   ├── tauri*.conf.json              # 基础 + phone + tablet + tablet.desktop 配置覆盖
│   ├── capabilities/                 # Tauri 2 权限声明
│   └── gen/android/app/              # build.gradle.kts（AURALIS_APP_TARGET 切换）、MainActivity.kt、network_security_config.xml
└── scripts/                          # 静态检查（check-r4-mobile.mjs）、12 项业务回归、平板测试、Vite/Android 构建脚本
```

## 平台适配层与 Android 原生集成

- **`src/platform/` 职责映射**：
  - `navigation.ts`：`vue-router` 包装（`navigateTo`、`redirectTo`、`reLaunch`、`navigateBack`、`getCurrentRoutePath`）。
  - `storage.ts` & `network.ts`：`localStorage` 键值存储与 `navigator.onLine` + `online/offline` 监听。
  - `http.ts` & `websocket.ts`：标准 `fetch` 请求与原生 `WebSocket` 客户端。
  - `clipboard.ts`、`haptics.ts`、`opener.ts`：Tauri 插件为主，并在桌面非 Tauri 环境下提供安全降级。
  - `lifecycle.ts` & `backButton.ts`：监听 `visibilitychange` 与 Android `auralis-app-pause`/`auralis-app-resume`、`auralis-android-back` 自定义事件（优先关闭打开的弹窗/抽屉或按当前路由返回）。
  - `feedback.ts`、`feedbackState.ts`、`PlatformFeedbackHost.vue`：自绘禅意 Toast、Confirm 与 Loading 宿主，位于 `#app` 全局挂载点。
  - `touchFeedback.ts`：全局被动指针监听与 `.zen-touch-pressed`/`.zen-touch-releasing` CSS `scale` 动画反馈，替代过去 Uni-app `<uni-button>` 的默认按压滞留效果。
- **Android 原生层（`MainActivity.kt` & `build.gradle.kts`）**：
  - 通过 `enableEdgeToEdge()`、`WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.ime()` 为内容视图设置系统栏与软键盘安全内边距，避免顶部状态栏与底部输入遮挡。
  - 启用 `useWideViewPort = true` 与 `textZoom = 100`，**两端均保持原生 `initial-scale=1.0` 视口**（Android WebView Chromium 110 在小于 `1.0` 的分数级 `initial-scale` 下会触发合成层双线性重采样模糊，故平板紧凑感完全由 `html[data-app-target='tablet']` 令牌与共享组件根类名 `.is-tablet-target` 驱动，不用 CSS `:global()` 前缀）。
  - `build.gradle.kts` 根据环境变量 `AURALIS_APP_TARGET=phone|tablet` 切换 `applicationId`（`com.auralis.mobile` / `com.auralis.hd`）、`appName`（`Auralis` / `Auralis HD`）与 `screenOrientation`（`portrait` / `sensorLandscape`）。
  - 明文 HTTP 安全边界由 `network_security_config.xml` 约束：`base-config` 默认禁止明文，仅在本地调试期对开发测试 IP/本地地址显式放行。

## 页面路由与数据边界

### 手机页面（`src/router/phone.ts`，共 7 项）

| 页面 | 路径 | 远程 API / 本地数据边界 |
| --- | --- | --- |
| 首页（今日） | `/pages/mobile/home/index` | Task/Subject/Block Store → Sync + `+` 面板（任务 / 知识块 / 纯文件上传→`uploadSubjectFile` + `POST /api/sources`）；7 日真实日期条、当日日程与待办 DDL；待办原地完成保留直到退出/切账号/重排 |
| 学习 | `/pages/mobile/learn/index` | 横向学科胶囊、记忆规划卡、`useBlockStore` 本地知识块搜索/全文抽屉与编辑/删除、新建学科弹窗 |
| 复习 | `/pages/mobile/review/index` | 全屏二级抽卡，复用 `useMobileLifecycleReview` + `reviewApi`（待学习/巩固/复习/自测，防剧透遮罩、`409` 恢复与本地待确认持久化） |
| 专注 | `/pages/mobile/pomodoro/index` | `useFocusStore`（墙钟持久化 + `focus_outbox`）→ `POST /api/focus-sessions`、任务选择器弹窗；进行中锁定 |
| 我的 | `/pages/mobile/profile/index` | 昵称/改密/注销、内联设备会话、`StudyMetrics`（`variant="pc"`）、学科分布、手动同步与 `autoSync`、本地重置、BYOK 与额度配额 |
| AI | `/pages/mobile/ai-search/index` | 协议 1 AI 对话、学科上下文锚定、`ReadableStream` 流式消费、过程时间轴与结构化块/题卡、`activeRun` 恢复 |
| 登录 | `/pages/mobile/login/index` | 登录、邮箱验证码注册与密码找回；共享新密码规则预校验 |

### 平板页面（`src/router/tablet.ts`，共 8 项）

| 页面 | 路径 | 当前数据与 UI 边界 |
| --- | --- | --- |
| 仪表盘 | `/pages/tablet/dashboard/index` | `useTaskStore` + `useSubjectStore` + `StudyMetrics`；左栏周历、日程与待办，右栏「学科空间」列表与学习统计面板 |
| 学科大厅 | `/pages/tablet/subject-hall/index` | 3 列禅意卡片、大小写去重与提交锁 |
| 工作区 | `/pages/tablet/workspace/index` | 左侧一级窄条导轨 + 可折叠 `WorkspaceSourceRail`（置顶学科总览 + 资料分页上传）+ 主区 `WorkspaceCenterReader`（`@file-viewer/core` 原地阅读、IndexedDB 原文缓存、`WorkspaceOverviewPane`、知识库编辑弹窗、`WorkspaceReviewPane`、`WorkspaceStatsPane`）+ 右下角悬浮 `WorkspaceAiPanel` |
| 手写 | `/pages/tablet/handwriting/index` | 保留底层模型与页面，`VITE_TABLET_HANDWRITING_NOTES_ENABLED` 默认关闭入口 |
| 专注 | `/pages/tablet/pomodoro/index` | 共享 `useFocusStore` / `focusController`，通过 `TimerCore` 渲染 |
| 个人中心 | `/pages/tablet/profile/index` | 双栏布局（账号与安全凭证 / AI 与同步设置）；共享 `useAiUsage` 与 `StudyMetrics` |
| AI | `/pages/tablet/ai-search/index` | 双栏会话历史 + 协议 1 流式回答、过程时间轴与题卡 |
| 登录 | `/pages/tablet/login/index` | 双栏品牌/表单卡片，支持滑块分段切换 |

## 设备、契约与存储

- **设备标识与实时契约**：登录与注册请求统一使用 `clientDeviceKey`，服务端返回及 Sync push、本地库 scope、Realtime 关联统一使用 `serverDeviceId`；Realtime 先请求 `POST /api/realtime/ticket`（空请求体 + Bearer access token），再连接 `/ws/events`。
- **端侧 SQLite 与缓存**：业务表使用 `tauri-plugin-sql` 持久化到 `sqlite:auralis_<scope>.db`（按 `userId/serverDeviceId/resetSeq` 隔离），覆盖 `subjects`、`knowledge_blocks`、`task_blocks`、`local_mutations`、`sync_metadata`、`source_files`、`ai_overview_cache`、`review_states_cache`、`subject_stats_cache`、`tablet_notes`；切账号或重置时显式 `close()` 旧连接池并核对登录世代。Tablet 文档二进制缓存继续使用作用域隔离 IndexedDB（`auralis_doc_cache_v1`，LRU 50MB/单文件、160MB/20 文件上限）。
- **OpenAPI 同源生成**：从 `docs/contracts/openapi/auralis-openapi.json` 生成 `src/api/generated/schema.ts`（`openapi-typescript@7.13.0`），同步与核对入口为根目录 `scripts/generate-openapi-sdk.ps1` 与 `scripts/check-openapi.ps1`。

## 构建、测试与发布命令

```powershell
cd Auralis-Mobile
npm ci
npm run type-check
npm run check:r4-mobile
npm run test:r4-mobile
npm run test:tablet
node scripts/check-tablet-sidebar-transition.mjs
npm run build:phone
npm run build:tablet
```

桌面快捷调试窗口与 Android 双包构建（详情与签名配置见[部署指南](../operations/Deployment.md)）：

```powershell
cd Auralis-Mobile
npm run tauri:dev:phone
npm run tauri:dev:tablet
npm run android:build:phone
npm run android:build:tablet
```

正式或测试环境双目标打包统一使用仓库根目录脚本 `scripts/build-mobile-release.ps1`（自动写入并在完成后恢复 `.env.local`）。

## 当前限制

- **真机与外部链路待验收**：已在 MuMu 15（Android 15 / WebView Chromium 110）完成手机/平板 Debug 包启动、视觉比例、清晰度与基础触控验证，但物理 Android 手机与横屏平板的完整业务走查（MinIO 预签名直传、PDF/DOCX/PPTX 多指缩放滚动、SSE 断流与弱网重连、跨设备并发冲突及后台省电计时）仍待实地完成。
- **生产签名前置**：正式发布必须配置 Release 签名密钥并替换 `VITE_API_BASE_URL` / `VITE_WS_BASE_URL` 为 HTTPS/WSS 域名（发布前需按对应环境清理 `network_security_config.xml` 测试主机白名单）；未签名的 `*-release-unsigned.apk` 与 `-DebugBuild` 测试包仅限本机验证。
- **共享组件平板样式约定**：Phone 与 Tablet 共用组件（如 `StudyMetrics.vue`、`ZenTaskRow.vue`、`ZenWeekStrip.vue`）禁止在 `<style scoped>` 中使用 `:global(html[data-app-target='tablet']) .xxx`，须通过根类名 `.is-tablet-target` 限定作用域，或将通用规则放在全局样式 `src/styles/index.css` 的 `:where(html[data-app-target='tablet'])` 下。

## 修改后的强制回写

- 页面、路由、平台层、Store、服务、原生配置或 feature flag：更新本文件。
- 交互与视觉：更新 [前端设计](../project/FrontendDesign.md)。
- API / 数据变化：更新对应契约（[API](../contracts/API.md)、[数据库契约](../contracts/Database.md)）。
- 状态、风险、构建部署与发布记录：更新 `current/` 与 [部署指南](../operations/Deployment.md)、[变更记录](../operations/Changelog.md)。
