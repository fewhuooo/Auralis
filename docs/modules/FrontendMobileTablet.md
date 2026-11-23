# Mobile / Tablet 前端模块

更新时间：2026-11-19

文档状态：现行模块说明

权威范围：手机/平板页面、条件编译、Store、API、页面数据边界、端侧服务、手写开关、构建方式与限制

事实来源：`Auralis-Mobile/package.json`、`src/pages.json`、`src/api/`、`src/store/`、`src/services/` 与页面实现

本文维护模块边界；逐轮验证与变更原文保存在[整理前记录](../archive/snapshots/maintenance-2026-11-13/FrontendMobileTablet.md)，仅供追溯。新增实现更新对应章节，当前风险进入 current，不在顶部追加日期流水。

## 模块定位

`Auralis-Mobile` 是 Uni-app 工程，同时承载手机与平板体验。两端共享基础状态、API 和服务，但页面路径、导航布局和交互密度独立。微信小程序只发布手机体验。

共享的鉴权、请求、Sync/Realtime、AI、Asset 和 Stats 使用生成契约。手机、平板的独立复习页和平板学科工作区共用现行到期队列和复习生命周期。当前验收与测试状态见[当前状态](../current/Status.md)和[问题登记](../current/IssuesAndReview.md)。

学科图标统一使用语义图标键，缺省显示 book；平板工作区与学科大厅不再提供旧 Emoji 字符串渲染分支。

Task 契约不包含认知负荷。Mobile/Tablet 的生成 API 类型、Task Store、同步映射、本地存储、新建任务入口和页面展示不再读写 `cognitiveLoad`、`load` 或 `loadText`。

## 已确认目标与收口状态

2026-11-16 已确认三端职责与设计目标（2026-11-17 完成代码层首轮重构与静态/单测/双端打包闭环，真机与实端联调待验收）。范围内 PC 集中管理资料与任务编排，手机负责随身执行，平板作为完整学习工作台。

| 领域 | 现行实现与已落地收口（2026-11-17） | 剩余边界 / 待真机验收 |
| --- | --- | --- |
| 视觉与导航 | 双端统一对齐 `Auralis-PC` 浅色燕麦禅意令牌（`#EEEEEE`/`#F7F2EB`/`#FAF7F2`/`#8B9A6E`），移除暗黑覆盖；Mobile 底部悬浮胶囊收缩为「今日 / 学习 / 专注 / 我的」+ 右侧独立 `AI` 入口（`AppTabBar.vue` 边距对齐 `20px`/`16px` 卡片栅格并衬贴 `92px` 透明到 `#EFEBE2` 非阻塞渐变遮罩）；退役 6 个孤岛页（`mobile/settings`、`mobile/timeline`、`mobile/handwriting`、`mobile/asset`、`mobile/stats`、`tablet/review`）；新增 `utils/pagePreload.ts` 路由空闲预热与切换前预加载、卸载/complete 离场锁安全复位及 `#F7F2EB` 根画布防切页白闪 | 微信开发者工具、H5 浏览器与平板真机视觉走查 |
| 排期与任务 | 新增 `dateKey.ts` 与 `taskSyncMapper.ts` 保留完整本地日期与非整点时间语义，`unschedule` 清空 `scheduledAt` 为 null；对齐 PC 端过期任务自动完成（`recoverOverdueTasks`，含拉取重读、在途同步让步与拒收指纹防循环）及已结束排期完成锁定（`isScheduledCompletionLocked`，手机首页与平板仪表盘 30s 刷新与锁态轻提示）；待办持久化先行 + 账号切换同步清表 + `localDb` 写前作用域围栏；H5 `local_mutations` 自增 ID/历史补全、同实体离线变更合并与在途变更围栏重基、`CONFLICT`/`REJECTED`/`RESOURCE_DELETED` 本地收敛及拉取/快照挂起实体保护 | 真实后端双设备并发冲突实测 |
| 专注与统计 | 新增 `useFocusStore.ts` + `focusController.ts` 基于墙钟 `phaseEndEpochMs` 持久化跨页/锁屏倒计时，仅自然完成写入 `focus_outbox` 并调用 `POST /api/focus-sessions`（终态 4xx 不阻塞队列头）；登录启动先 Sync 再 flush outbox；`statsApi.ts` 传本地 IANA `timeZone` | 微信后台挂起 / 锁屏跨日真机走查 |
| 复习与知识 | Mobile「学习」拆分为两页直达式：`pages/mobile/learn/index` 为底部 Tab 主页（单行顶栏 + 横向学科胶囊〔唯一激活态 `activeSubjectId`、切换与挂载自动左对齐滚动、`mask-image` 左右边缘透明渐隐及右侧卡片栅格对齐的网格展开按钮，点击呼出顶部下拉双列选科弹窗〕+ 「学科记忆规划卡」〔3 段分布进度条、左卡浅橄榄绿整卡可点大号「待学习」、右卡浅暖米动态合入「待复习 / 自由自测」、底栏无外框 `5 个 / 10 个` 分组切换、仅依赖 `syncStore.lastSyncedAt` 刷新与 404 容错〕+ 舒展间距的分科知识块列表/搜索 + Markdown/TeX 阅读抽屉及复制/新建/编辑/删除；已移除「新建学科」入口与知识块「自主整理」冗余来源标注，`mobile/home` 与 `tablet/subject-hall` 保持不变）；`pages/mobile/review/index` 为二级无底栏全屏生命周期复习页（通过 `useMobileLifecycleReview` + `reviewApi` 完整承载 PC 端 `LEARNING_READ/RECALL/CHECK`、`REVIEW_RECALL/CHECK`（`GOOD`/`HARD`/`AGAIN`/「记错了」/`mastered` 重学）、`FUZZY_RECALL/CHECK`（本地「想起来了」与纠偏 `REVIEW_CORRECTED`/重复 `LEARNING_REOPENED`）、`GROUP_COMPLETE`/`ROUND_COMPLETE`、`pendingReviewId` 历史恢复、防剧透遮罩、冻结命令持久化与 `409 RESOURCE_VERSION_CONFLICT` 恢复，并在 `useSyncStore` 重置本地作用域时同步清理 `auralis:review:lifecycle:pending:<userId>:<serverDeviceId>`）；Tablet Workspace「学科复习」（`WorkspaceReviewPane`）亦已接入同源 `useMobileLifecycleReview` 规划与全生命周期抽卡；Workspace 与 Mobile 均支持真实创建/编辑/删除知识块，`blockSyncMapper.ts` 修复推送 `APPLIED` 后 `sync_version` 落盘 | 真实登录态下新 Mobile 与 Tablet 工作区「学习 → 复习 → 自测」完整联调、微信开发者工具与真机双端交互及版本冲突界面走查 |
| 资料、Overview 与 AI | 新增 `filePicker.ts`（纯文件选择，无相机）+ `sourceApi.ts` + `overviewApi.ts` + `statsApi.subject`；Tablet Workspace 按 PC `SubjectWorkspace` 改造为双栏布局（左侧 72px 一级导轨 `返回/资料/总览/知识库/复习/统计` + 可折叠二级抽屉 `WorkspaceSourceRail`，右侧主工作区 `WorkspaceCenterReader` 含内嵌 PDF 预览/全屏总结与大纲/知识库卡片网格/学科记忆规划复习 `WorkspaceReviewPane`/学科统计 `WorkspaceStatsPane`），并将 `WorkspaceAiPanel` 改造为右下角非阻塞可拖拽/放大浮窗（默认收起，懒挂载保活，按 `ChatConversationScope` 4 字段匹配并强制 `SUBJECT` 模式省略 `currentSourceId`/`sourceIds`；非 `READY` 资料跳过 `getSource` 避免 409）；2026-11-19～20 拉齐 `pages/mobile/ai-search`、`pages/tablet/ai-search` 与 `WorkspaceAiPanel` 为完整协议 1 对齐实现：共用暖沙麻用户气泡 `.zen-chat-user-bubble`（`#ECE5D8` / `#262522`）、`MobileChatProcessArea.vue`（极简无框竖向步骤行与严格按字符预算交错披露时间轴、中文工具 `label`、完成态左侧 `#6E8552` 对勾去“已完成”、失败态 `#9C500C` 满足 WCAG AA、`13px` `#8C887F` 思考排版与脱敏，以及受控抽屉 `resolveMobileProcessDrawerOpen` 平滑排空不瞬塌、点击即关）、`MobileChatPartList.vue`（6 类结构化/题卡部件、规范 `activity_submission` 原始 `string` / `string[]` 提交、单包新回复 `animateOnMount` + `resolveMobileTextDrainAction` 平顺排空与防重排）、`SaveKnowledgeBlockModal.vue`（存为知识块）、`#ifdef H5` `fetch` `ReadableStream` 逐帧真流式传输（保留 `uni.request` 供微信小程序与非 DOM 回退）、停止生成、`activeRun` 恢复与容错轮询/UNKNOWN 恢复、50px 智能滚动（`@wheel` + 程序化滚动护栏）、移动端底部渐隐遮罩/右置回底胶囊/无框轻操作按钮及卡片化 `<table>` 排版；Chat 请求带登录世代/作用域围栏并在失败时保留草稿 | 真实 MinIO 上传/下载域名、SSE 断流/恢复、弱网、微信开发者工具与真机（手机/平板触控）视觉与交互验收 |
| 手写 | `tabletHandwritingNotesEnabled` 继续默认关闭，workspace 不暴露笔记按钮与标尺底纹；既有底层模型保留 | 自由画布多端联动与真机触控压感单独排期 |

## 共享业务接入边界

- Mobile/Tablet 共用协议 1 Chat 客户端。`ReadingContext` 来自生成类型，`selectionText` 位于命令顶层；首轮省略范围建立 owner-wide 绑定，默认检索只使用该 attempt 的 owner/READY 来源快照。Tablet Profile 不再提供本地关闭 RAG 的控件。
- 两端 Profile 共用 `useAiUsage`，展示认证额度接口的已结算、预留、剩余及当地重置时间。切换账号/离页/新请求使旧响应失效，加载和失败不伪造零额度；预算错误只提示显式重试，不自动补发。
- KnowledgeBlock 同步使用 `content`，本地完整 `preview` 与之映射，不向 Server 发送旧 `summary/tags`。端侧标签存储仍保留，未据此新增专注历史或 Overview 展示。
- Asset upload-intent 使用 `clientImportId`，每次操作生成 ID，调用方可提供稳定 ID 重试；未新增持久队列。
- 共享 SDK 提供任务 schedule insertion、复习生命周期与 Overview 类型。实际页面调用以[下方页面 API 与数据边界](#手机页面-api-与数据边界)为准。

## 当前技术栈

- Uni-app `3.0.0-4080420251103001`
- Vue `^3.4.21`
- Pinia `2.1.7`
- Vite `5.2.8`
- TypeScript `5.3.3`
- `perfect-freehand`、`jspdf`、`marked`、`@file-viewer/core`（H5 按需 `pdf` / `word` / `presentation` 渲染器）

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
| 首页（今日） | `pages/mobile/home/index` |
| 学习（学科与知识块） | `pages/mobile/learn/index` |
| 复习（二级抽卡） | `pages/mobile/review/index` |
| 专注 | `pages/mobile/pomodoro/index` |
| 个人资料（我的） | `pages/mobile/profile/index` |
| AI | `pages/mobile/ai-search/index` |
| 登录 | `pages/mobile/login/index` |

（已按 2026-11-16 规划移除 `mobile/settings`、`mobile/timeline`、`mobile/handwriting`、`mobile/asset`、`mobile/stats` 五个孤岛/重复页。）

### 平板页面

| 页面 | 路径 |
| --- | --- |
| 仪表盘 | `pages/tablet/dashboard/index` |
| 学科大厅 | `pages/tablet/subject-hall/index` |
| 工作区 | `pages/tablet/workspace/index` |
| 手写（默认 flag 关闭） | `pages/tablet/handwriting/index` |
| 专注 | `pages/tablet/pomodoro/index` |
| 个人资料 | `pages/tablet/profile/index` |
| AI | `pages/tablet/ai-search/index` |
| 登录 | `pages/tablet/login/index` |

（已移除独立 `tablet/review`，统一并入工作区「学科复习」面板；`pages.json` 继续以 `#ifndef MP-WEIXIN` 包裹 Tablet 页面。）

### 手机页面 API 与数据边界

| 页面 | 远程 API / 数据入口 | 当前边界 |
| --- | --- | --- |
| Login | Auth 登录/邮箱验证码/注册/找回密码/刷新、`/api/auth/me` | 用户名与已验证邮箱均可登录；表单执行共享新密码规则预校验 |
| Home（今日） | Task/Subject/Block Store → Sync + `+` 面板（任务 / 知识块 / 纯文件上传→`uploadSubjectFile` + `POST /api/sources`） | 7 日真实日期条、完整当日日程与待办 DDL；待办在当前会话内勾选完成后暂时原地变灰保留（`homePendingTasks`，不计入剩余待办计数与专注选择器，支持再次点击取消恢复），离线待同步任务不可删改伪造统计 |
| Review（学习） | 到期队列、`states`、`reviewApi`（块详情 / `history` / `attempt` / `confirm` / `correct` / `learning-completions` / `learning-reopen`） | 仅针对单学科（默认选中首个/当前学科，不设“全部学科”）；由 `composables/useMobileLifecycleReview.ts` 驱动与 PC 同源的「学习 · 巩固 · 复习 · 自测」全流程状态机：按 `5 个 / 10 个` 分组顺序进入「待学习（初学阅读→遮罩回忆→核对入队列）」「待复习（遮罩回忆→`GOOD`/`HARD` 转巩固/`AGAIN`/「记错了」/重学）」与「巩固（`FUZZY` 本地通过或二次重学）」；支持 `GROUP_COMPLETE` / `ROUND_COMPLETE` 里程碑、无待办时抽取 `5/10` 个已学块进入「自测复习」、路由参数就绪门禁与冷启动本地块水合，以及账号切换/并发 `409` 冲突自动恢复 |
| Pomodoro（专注） | `useFocusStore`（墙钟持久化 + `focus_outbox`）→ `POST /api/focus-sessions`、Task Store | 对齐 PC 固定 25 分钟计时核心与原样式「当前专注」单卡（顶部日期胶囊、中间计时区在余下视口空间内自适应居中、底部单卡紧贴导航栏与左右边距并支持点击整卡弹出 `TaskSelectSheet` 切换任务及完成后标记完成；无时长预设、顶部重复选择条与今日看板）；`TaskSelectSheet` 沿用 PC 暖米白配色（`#F7F2EB` / `#FAF7F2`）；自动优先匹配进行中或 10 分钟内排期任务，否则自由学习；进行中锁定，跳过与重置不计数 |
| Profile（我的） | Auth（昵称更新 `PATCH /api/auth/me`、改密、`DELETE /api/auth/me` 注销） / Sync Store（`syncController.ts` + `syncPreferences.ts`）、Device Sessions、Local Subjects/Blocks、`GET/PUT /api/ai/settings` & `POST /api/ai/settings/test` & `GET /api/ai/usage`、`StudyMetrics`（`variant="pc"`） | 对齐 PC 个人页结构与燕麦玻璃态风格，仅保留移动端所需设置：资料卡（头像、显示名称与用户名，无专注天数/设备徽标及右侧编辑按钮）、5 项核心学习指标、学科知识分布（Top 5）、同步与数据（手动同步、`auralis.settings.autoSync`、本地离线重置）、AI 模型与额度（`AI 服务商`输入框与 `normalizeAiProvider` 归一，无预设分段切换与右侧模型胶囊）、账号与安全凭证（内联设备会话、显示名称/密码修改、密码确认注销）及退出登录；省略 PC 桌面解析中心/自动概览/未接线外观字号开关与二进制头像上传 |
| AI Search | `POST /api/ai/conversations`、`GET/DELETE /api/ai/conversations`、`/api/ai/messages/stream`、`POST /api/ai/conversations/{conversationId}/runs/{runId}/cancel`、`GET .../runs/{runId}`、`POST .../attempts/{attemptId}/recover`、`useSubjectStore`、`useBlockStore` | 统一挂载 `MobileChatProcessArea`、`MobileChatPartList` 与 `SaveKnowledgeBlockModal`：Claude 极简无框正文 + DeepSeek/PC 交叉过程时间轴（实时消费 `reasoning.delta` 与带中文 `name`/`label` 的 `tool.*`，去除末尾“已完成”并在左侧渲染浅绿对勾，屏蔽内部工具名/规则泄漏），支持 6 类流式结构化块与题卡（`activity_submission` 规范发送原始 `string` 或 `string[]`，已完成的题卡回复禁止误重生成上一轮用户问题）、加载会话对 `activeRun` 执行恢复与最多 3 次瞬态容错轮询（`mergeProcessTimelineTools` 增量刷新）及 `UNKNOWN` 恢复结果回写、50px `@wheel`/触摸双端智能滚动锁定与程序化滚动隔离、纯色 `#F7F2EB` 底板、`AppHeader` 对称 `40×40px` 按钮、具体数量锚点引导、纯白双层输入面板、下沉范围胶囊（绑定后锁定）及右侧历史抽屉；不支持图片上传，预受理失败保留草稿 |

### Tablet 页面组数据边界

Tablet 页面由 `#ifndef MP-WEIXIN` 排除在微信产物外。

| 页面组 | 当前数据边界 | 剩余缺口 |
| --- | --- | --- |
| Dashboard | `useTaskStore` + `useSubjectStore` + `StudyMetrics`（`statsApi` 传本地 `timeZone`）；左栏为无底框且无周切换箭头的 7 日日期条、当日日程（可 `×` 移回待办）与待办清单（无行内「排期」按钮）；移除“继续上次学习”卡片，右上方为「学科空间」展示列表（无刷新按钮）点击进入对应工作区 `?id=` | 真机触控滚动与弱网态待验 |
| Subject Hall | Subject Store → Sync；3 列禅意卡片、大小写去重校验与提交锁 | 多设备新增/改名并发验证 |
| Workspace | 双栏工作区（PC `SubjectWorkspace` 同源结构）：72px 一级窄条导轨（`返回 / 资料 / 总览 / 知识库 / 复习 / 统计`）+ 可折叠二级抽屉 `WorkspaceSourceRail`（`sourceApi` 分页、上传删除、`overviewApi` 学科/文件结构大纲与总结入口，非 `READY` 资料跳过 `getSource` 避免 409）+ 右侧主工作区 `WorkspaceCenterReader`（H5 端通过 `WorkspaceDocumentViewer` 引入 `@file-viewer/core` 与仅 `pdf` / `word` / `presentation` 三个按需渲染器在暖燕麦画布原地渲染 PDF/DOC/DOCX/PPT/PPTX 等文档并去除浏览器原生黑壳，配合顶栏缩放/旋转微控制组与底部居中半透明浮动页码胶囊，图片沿用内嵌预览、全屏总结与结构大纲切换、知识库卡片网格与详情弹窗、`WorkspaceReviewPane` 学科记忆规划与全生命周期抽卡、`WorkspaceStatsPane` 通过 `statsApi.subject` 展示学科掌握度与近 7/30 天趋势）；`WorkspaceAiPanel` 改为右下角非阻塞可拖拽/可放大浮窗（默认收起，懒挂载保活，严格 `ReadingContext` + 4 字段 `chatScope` 历史隔离与协议一完整能力） | 真实 MinIO 预览域名与 CORS、DOCX/PDF/PPTX 实机触控滚动与缩放、真端 AI 交互及 SSE 断流恢复待验 |
| Pomodoro | 与手机共享 `useFocusStore` / `focusController`，通过 `TimerCore` 渲染 | 锁屏与息屏恢复真机走查 |
| Profile / AI Search | 2 栏禅意个人中心（改昵称/改密/会话/同步/额度/BYOK，移除 7 个伪开关）；`tablet/ai-search` 双栏 AI 会话历史同步对齐协议一（`MobileChatProcessArea`、`MobileChatPartList`、`SaveKnowledgeBlockModal`、停止/取消、`activeRun` 恢复与轮询及 `@wheel` 50px 智能滚动） | 真实 Provider 流式稳定性、交互卡实操与长会话切换待验 |
| Handwriting | `tablet_notes`、`NoteDocument`、repository、`handwritingEngine` | feature flag 默认关闭；独立保留待后续验收 |

### 启动、会话存储与同步生命周期

- `VITE_API_BASE_URL` 与 `VITE_WS_BASE_URL` 是必填运行时配置；微信只接受 HTTPS/WSS。生产代码不提供 localhost fallback。
- `requestCore.ts` 发送 Bearer token、接收直接 DTO/RFC Problem Details，并对并发 401 共享一次 refresh；refresh 请求本身禁止递归刷新。
- Auth 会话保存在 `auralis:auth:v2`，客户端注册标识保存在 `auralis:device:id:v2` 并作为 `clientDeviceKey` 发送；服务端返回的 canonical ID 为 `serverDeviceId`，注册成功直接建立会话并进入对应端首页。
- H5 表键、Pomodoro 今日计数和原生 SQLite 文件按 `userId/serverDeviceId` 使用独立 scope；reset 切换到新的 generation scope 后重建。用户已授权一次性删除旧全局 `h5_db_*`/`_doc/auralis.db` 业务表。
- Sync 使用 `/api/sync/push`、`/api/sync/pull?cursor=<opaque>`、`/api/sync/snapshot`；Realtime 先请求 `/api/realtime/ticket`，再连接 `/ws/events`，URL 和心跳不携带 access token。
- `App.vue` 在已认证会话恢复后初始化当前 scope 数据库，先执行 snapshot/增量 Sync（确保本地任务先落库），再将 `focusController` 待传记录冲刷至 `/api/focus-sessions`，最后连接 Realtime；登录后启动，退出或隐藏时断开，重新显示时同步并重连。网络恢复和 Realtime 的 `SYNC_CHANGED`/`REVIEW_UPDATED` 触发幂等同步。

## 设备分流

- `pages/launch/index` 负责首次选择手机或平板入口。
- 进入某一端后，应用不根据窗口变化自动在两套路由间 reLaunch。
- 手机和平板共用登录、注册和找回密码表单。注册需用户名、邮箱、验证码和密码。注册/重置的新密码至少 8 个 UTF-16 代码单元，包含 Unicode 大写、小写字母及标点或符号，最多 72 个 UTF-8 字节；登录不应用新复杂度校验。登录可使用用户名或已验证邮箱，找回密码需验证邮箱。个人资料直接显示用户名。
- 登录、注册和邮箱验证接口独立反馈输入错误。受保护请求明确续期失效时返回当前端登录页，暂时性网络或服务故障保留本机会话。
- 物理分包当前未作为完成条件，微信依赖条件编译控制页面集合。

## Store 清单

| Store | 职责 |
| --- | --- |
| `useAuthStore.ts` | 用户、token 与会话 |
| `useBlockStore.ts` | 知识块与本地数据 |
| `useTaskStore.ts` | 任务、排期、状态 |
| `useSubjectStore.ts` | 学科与当前上下文 |
| `useSyncStore.ts` | mutation、cursor 与同步 |
| `useFocusStore.ts` | 专注计时墙钟状态、本地日计数与受 `auralis.settings.autoSync` 约束的后台 outbox 冲刷 |
| `useDeviceStore.ts` | 设备与端类型 |
| `useLayoutStore.ts` | 当前端导航和布局状态 |
| `useSettingsStore.ts` | 偏好和主题 |
| `persist.ts` | Store 持久化辅助 |

## API 与服务

### API

- `api/request.ts`、`requestCore.ts`：环境基址、Bearer、Problem Details 和共享单次 refresh。
- `api/aiClient.ts`、`aiApi.ts`、`sse.ts`：服务端 BYOK 摘要、Conversation、`/api/ai/messages/stream`、`getRunStatus`/`recoverRunAttempt`、`decodeStreamChunk`（兼容 `Uint8Array`/`ArrayBuffer`/字符串流式 UTF-8 解码）、H5 `#ifdef H5` `fetch` `ReadableStream` 真流式 SSE（共享 `createChatStreamSession`/`buildAiStreamError` 与 401 单次刷新及 `AbortController`）与 `uni.request` 微信小程序回退；`mobileAiChat.ts` 提供 `isConversationProtocolSupported` 拦截旧协议会话写入。
- `api/sync.ts`、`useSyncApi.ts`、`realtimeApi.ts`：不透明 cursor、snapshot reset、`/ws/events` 一次性 ticket，`uni.connectSocket` 传入 `complete` 回调以返回 `SocketTask`，并以 `connectSeq` + `activeConnectFlight` 围栏隔离建连/断开与登录世代切换。
- `api/assetApi.ts`、`sourceApi.ts`、`overviewApi.ts`、`focusApi.ts`、`reviewApi.ts`、`statsApi.ts`：预签名上传与下载链接、学科资料分页与删除、正式结构大纲/精炼总结读取、幂等专注记录上传、到期复习与强类型本地时区统计（含 `/api/stats/subjects/{subjectId}` 单学科统计）。
- `api/device.ts`：设备相关能力。
- `api/e2ee.ts`：加密辅助。
- `api/generated/schema.ts`：从冻结 OpenAPI 产物生成的 DTO、路径、参数和响应类型（禁止手改）。
- `api/generated/client.ts`：约束路径、HTTP 方法、path/query/body 与成功响应的轻量请求适配器。

生成 SDK 的源文件是 `docs/contracts/openapi/auralis-openapi.json`，生成器固定为
`openapi-typescript@7.13.0`。从仓库根目录执行
`scripts/generate-openapi-sdk.ps1` 可同步 PC 和 Mobile；执行
`scripts/check-openapi.ps1` 可校验运行时 OpenAPI 与两端生成文件。当前生成 SDK
冻结类型已进入 Mobile/Tablet 主路径；`check:r4-mobile` 禁止旧 Result、旧 `/ws/sync`、固定本机地址、数值旧游标、旧 AI 路由、Mobile Home/Profile 演示数据、手写伪 OCR、Workspace 固定摘要，以及 共享统计组件与 Tablet Review 的随机值或绕过 Stats/Review API。Tablet 仍有真实服务与真机验收缺口，不能把类型检查或构建通过写成前后端联调完成。

### 端侧服务

| 服务 | 职责 |
| --- | --- |
| `localDb.ts` | 端侧 SQLite 表与访问入口；原生/H5 迁移清洗 TASK 颜色键、保留 KnowledgeBlock 颜色与无效 JSON 原文；H5 `parseSqlValues` 保持 SQL 字符串字面量类型并修复缓存数字字段 |
| `localDataScope.ts` | 按 userId/serverDeviceId 选择独立 H5/SQLite namespace |
| `legacyDataPurge.ts` | 用户授权后一次性删除旧全局 `h5_db_*`/`auralis.db` 业务表 |
| `assetUpload.ts` | upload-intent、预签名 PUT、complete |
| `focusController.ts` | 纯 TS 专注墙钟状态机、作用域隔离 outbox 与终态 4xx 跳过冲刷 |
| `utils/dateKey.ts` | 本地自然日键、`HH:mm` 格式化及本地 IANA 时区识别 |
| `utils/taskSyncMapper.ts` | Task 同步指令、取消状态（`cancelled`）与本地排期语义映射（支持 `unschedule` 与码点序 `compareTaskPosition`） |
| `utils/blockSyncMapper.ts` | KnowledgeBlock 服务端版本（`sync_version`）与时间戳保真映射 |
| `utils/workspaceChatScope.ts` | Workspace `ReadingContext` 构建与 4 字段 `chatScope` 匹配 |
| `composables/useEscapeKey.ts` | H5 端弹窗与抽屉 `Escape` 键关闭钩子（卸载自动解绑） |
| `syncController.ts` / `syncPreferences.ts`（`services/`） | 纯 TS 同步/离线重置状态机（同步互斥锁、登录世代与账户切换取消）及 `auralis.settings.autoSync` 持久化读写 |
| `utils/filePicker.ts`、`markdown.ts`、`mobileAiChat.ts`、`mobileChatParts.ts`、`smoothStreamBuffer.ts`、`mobileLearning.ts`、`sha256.ts`、`sourceFormat.ts`、`profileHelpers.ts` | 跨平台纯文件选择/上传、安全的 `<rich-text>` Markdown 与 TeX 数学公式转译（含列表 `1.55em` `outside` 悬挂缩进、`11px` 列表项间距、非思考态卡片化滚动 `<table>`、 `mutedReasoning` 思考区低对比风格、链接/图片协议过滤、代码隔离与 `plainMarkdownExcerpt`）、`mobileAiChat.ts`（AI 范围绑定、空态数量锚点、`processTimeline` 交叉步骤归约、`buildVisibleMobileTimelineGroups` 按平滑已披露字符预算推进、受控抽屉持有/关闭裁决 `resolveMobileProcessDrawerOpen`、`resolveMobileTextDrainAction` 与新消息 `animateOnMount`、`sanitizeMobileReasoningText`、大小写兼容 `normalizeMobileToolTraceStatus`、`restoreConversationMessages`/`applyRunStatusSnapshot` 活动轮恢复与 `evaluateSmartScroll` 程序化滚动隔离）、`mobileChatParts.ts`（6 类块投影与规范 `string \| string[]` `activity_submission` 校验）、平缓连续 `computeSmoothStreamTargetSpeed` 与空池冷却复位及带 `destroy()` 重入防线的 `smoothStreamBuffer.ts`、手机端学习生命周期辅助计算、与 Java `StandardCharsets.UTF_8` 严格对齐的 `sha256Utf8Hex`、资料状态与个人页纯函数计算 |
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

- `AppPageLayout.vue` 新增 `#overlay` 插槽并位于 `AppTabBar.vue` 之后，确保手机端全部 `zen-sheet-mask` 与 `TaskSelectSheet` 稳居浮动底部栏（`z-index: 800`）之上；`ZenWeekStrip.vue` 与 `ZenTaskRow.vue` 抽取手机首页与平板仪表盘共用的周历条及左时间轨任务行。
- `TabletLayout.vue` 提供左侧导航、AI 入口和 modal 插槽。
- 侧栏指示器动画当前目标为 `120ms`，路由切换延迟为 `160ms`，脚本检查至少两帧余量。
- 工作区对齐 PC 端采用双栏工作台与右下角 AI 伴读浮窗：左侧 72px 一级窄条导轨（`返回 / 资料 / 总览 / 知识库 / 复习 / 统计`）+ 可折叠二级抽屉 `WorkspaceSourceRail.vue`（资料分页上传删除 + 折叠式学科/文件结构大纲与总结列表），右侧主工作区 `WorkspaceCenterReader.vue`（H5 端通过 `WorkspaceDocumentViewer.vue` 动态加载 `@file-viewer/core` 与仅 `pdf` / `word` / `presentation` 三个按需渲染器原地渲染 PDF/DOCX/DOC/PPT/PPTX 文档，移除浏览器 PDF `iframe` 黑壳与 `.docx` 兜底卡；`vite.config.ts` 按 `UNI_PLATFORM === 'h5'` 隔离启用 `inject: false` 按需分包与 `copyAssets: { baseDir: 'file-viewer', publicDir: 'public' }`，确保微信小程序构建不携带任何 H5 文档资产；顶栏展示紧凑缩放/旋转控制与外链/复制图标按钮，预览区底部居中悬浮毛玻璃页码胶囊 `‹ 1 / N ›` 避让右下角 AI 浮窗按钮；图片继续内嵌预览；同时包含全屏总结与结构大纲切换、可搜索知识库卡片网格与详情弹窗、`WorkspaceReviewPane.vue` 学科复习与全生命周期抽卡、`WorkspaceStatsPane.vue` 学科掌握度与趋势统计，兼容 `?id=` 与 `?subjectId=` 参数）；`WorkspaceAiPanel.vue` 以非阻塞可拖拽/可放大浮窗挂载于 `#modal` 插槽（默认收起，懒挂载保活，按作用域隔离历史与伴读，接入 `MobileChatProcessArea`、`MobileChatPartList`、停止生成与 50px `@wheel` 智能滚动），`SaveKnowledgeBlockModal` 与知识块创建/编辑、删除确认窗均直接挂载在 `#modal` 插槽以脱离浮窗 transform 堆叠上下文。
- 手机「我的」、平板「个人中心」与平板「仪表盘」共用 `StudyMetrics.vue`，展示知识块、本周完成任务、累计专注、完成番茄与本周新增知识块；`statsApi.getWeekly` 显式携带本地 IANA 时区。手机「我的」页支持 `StudyMetrics` `variant="pc"`、`学科知识分布` Top 5、`同步与数据`（`auralis.settings.autoSync` 开关 + 同步互斥锁 + `resetOfflineData`）、`AI 设置`（沿用 PC `AI 服务商` 输入框 + `normalizeAiProvider` + `DEFAULT_AI_BASE_URLS` 补全 DeepSeek/SiliconFlow 默认地址，未配置时输入框留空并展示 DeepSeek 灰色示例、仅在服务端已保存配置时自动回填，并展示百分比/重置时间/4 格 Token 明细的 AI 配额卡片），以及`账号与安全凭证`（账号资料、内联设备会话、改密、密码确认 `DELETE /api/auth/me` 注销）；`requestCore.ts` 对改密/注销的密码错误 401（`isPasswordConfirmationFailure`）与 `/api/auth/logout` 401 免除 token 刷新与登出跳转，待后续在微信开发者工具、H5 浏览器与真实后端完成 GUI 验收。
- 手机「学习」采用两页直达式：底部 Tab `pages/mobile/learn/index` 通过横向学科胶囊切换单学科，展示复习入口卡（按 `summarizeSubjectReview` 显示「开始复习」或「自测复习」）、支持按标题/来源/摘要搜索的本地知识块列表（基于 `useBlockStore` 本地优先持久化，在线且加载成功后显示复习阶段微标）、`<MarkdownText>` 全文阅读抽屉（含兼容非 HTTPS 局域网环境的 `copyTextWithFallback` 安全复制、编辑与删除确认）以及新建学科弹窗（同名校验）；点击复习入口跳转至隐藏 `AppTabBar` 的全屏二级页 `pages/mobile/review/index?subjectId=...`（直入自测带 `&mode=self-test`），采用三层叠放可滑动闪卡（`← 下一张` / `→ 上一张` 在未完成卡片间循环切换且不结束本轮；`↓ 不熟` 调用 `AGAIN` 后进入 `needsLearning`「待巩固」状态并保留在队列中；`↑ 掌握 / 完成巩固` 视状态提交 `GOOD` 确认或 `learning-completions`，全部卡片完成后才结束本轮，底部仅展示手势提示；支持 5/10 张「自测复习」、继续自测、返回待复习与返回学习页）；平板工作区「学科复习」通过 `WorkspaceReviewPane.vue` 复用 `useMobileLifecycleReview`（支持 `5 / 10` 个分组、待学习 / 待巩固 / 待复习 / 自测复习与遮罩回忆），未确认的请求按用户和设备保存在本机并支持按原命令 ID 重试与跳过缺少正文哈希的旧卡片。

设计目标和页面布局见 [前端设计](../project/FrontendDesign.md)。

## 设备与测试契约

设备标识使用现行字段，不保留旧 `deviceId` 字段。Mobile/Tablet 的登录与注册请求必须使用 `clientDeviceKey`；服务端返回、Sync push、本地数据 scope 和 Realtime 关联必须使用 `serverDeviceId`。Realtime ticket 不带请求体，测试请求必须携带有效 Bearer access token，让服务端从 JWT 解析设备身份。

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

仓库根目录本地纯前端动态数据预览（基于外部 JSON `scripts/fixtures/mobile-preview-data.json` 与 `Auralis-Mobile/.env.local`）：

```powershell
node --test scripts/mobile-preview-server.test.mjs
node scripts/mobile-preview-server.mjs
```

仓库还包含：

- `scripts/tablet-feature-flags.test.ts`
- `scripts/tablet-note-model.test.ts`
- `scripts/tablet-note-repository-core.test.ts`

三个 Tablet TypeScript 逻辑脚本已接入 `npm run test:tablet`。

## 当前限制

- 2026-11-18 完成真实后端联调前置阻塞修复（H5 流式 `Uint8Array` SSE 解码、401 刷新重试失败透传、错误响应分块解析、`uni.connectSocket` `complete` 回调与 `connectSeq` 断开围栏、`useFocusStore` 遵守 `autoSync`、本地重置清理待确认复习键、改密主动续期及历史会话/AI 断流恢复）、H5 `localDb` 修复及首屏路由预加载；2026-11-19～20 完成两页式「学习」方案 A 重构及全生命周期迁移、Mobile 同步与过期任务自动完成收敛、跨端 AI 协议 1 交互与视觉排版统一对齐，以及平板仪表盘简化（无底框无箭头周历、去掉待办行内排期按钮、去掉“今天”冗余胶囊、学科空间展示）与平板工作区 PC 双栏化+AI 浮窗化改造；2026-11-23 在 `feat/tablet-file-viewer` 分支为平板工作区 H5 端接入 PC 同源 `@file-viewer/core`（仅保留 `pdf` / `word` / `presentation` 三个按需渲染器，替代原生 `<iframe :src>` 黑壳与 `.docx` 兜底卡）与底部浮动页码胶囊，最终落盘代码通过 `vue-tsc --noEmit`、`check:r4-mobile`（扫描 85 个生产文件）、`test:r4-mobile`（113/113）、`test:tablet`、`build:h5` 与 `build:mp-weixin`；新「学习 → 复习」两页真实联调、平板新工作区与 H5 原地文档阅读（PDF/DOCX/PPTX 触控缩放与连续换文件）/AI 浮窗真机交互、全端真实 Provider 流式与题卡联调及微信开发者工具真机验证仍待实机验收。
- App、Harmony 和其他小程序平台虽然有脚本，不表示已验收。
- Mobile 将 TypeScript 固定为 5.3.3 以匹配 vue-tsc 1.8.27。
- Tablet 复杂交互需要真实触控屏。
- 文件上传/下载预览与真实 MinIO 域名、SSE 断流、弱网恢复、双设备 reset 并发仍需真实后端环境联调走查。

## 修改后的强制回写

- 页面、Store、服务、页面 API 映射、条件编译或 feature flag：更新本文件。
- 交互与视觉：更新 `docs/project/FrontendDesign.md`。
- API/数据变化：更新对应契约（`docs/contracts/API.md`、`docs/contracts/Database.md`）。
- 状态、风险和发布：更新 `current/` 与 `operations/Changelog.md`。
