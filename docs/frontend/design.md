# 前端页面设计总览

更新时间：2026-07-03

本文档统一总结 StudyCore PC、Mobile、Tablet 三类前端页面的功能设计、页面入口、数据依赖和验收口径。页面状态以当前代码和 `docs/FrontendPC.md`、`docs/FrontendMobileTablet.md` 为基线；本文不描述后端接口细节，接口契约以 `docs/APIManifest.md` 为准。

## 1. 前端整体定位

| 端 | 代码目录 | 核心场景 | 页面设计重点 |
| --- | --- | --- | --- |
| PC | `StudyCore-PC` | 桌面学习工作台、重型资产编排、学科工作区、任务排期 | 信息密度高、三栏/多栏工作流、支持拖拽、文件预览、知识图谱和长时间管理 |
| Mobile | `StudyCore-Mobile/src/pages` | 手机端轻量捕获、AI 问答、复习、专注、查看统计 | 单手操作、快速入口、弱网/离线恢复、移动端输入和拍照能力 |
| Tablet | `StudyCore-Mobile/src/pages/tablet` | 平板端大屏学习、学科工作区、手写、阅读、专注和复习 | 左侧导航、多面板并行、触控友好、适配横屏学习 |

## 2. 页面地图

### 2.1 PC 页面地图

当前 PC 路由来自 `StudyCore-PC/src/router/index.ts`。

| 页面 | 路由 | 文件 | 导航入口 | 状态 |
| --- | --- | --- | --- | --- |
| Login | `/login` | `src/views/Login/index.vue` | 直接路由 | 已构建待验收 |
| Dashboard | `/` | `src/views/Dashboard/index.vue` | 左侧主导航 | 已构建待验收 |
| SubjectHall | `/subjects` | `src/views/SubjectHall/index.vue` | 左侧主导航、Dashboard 管理入口 | 已构建待验收 |
| SubjectWorkspace | `/subject/:id` | `src/views/SubjectWorkspace/index.vue` | 左侧学科列表、学科大厅 | 已构建待验收 |
| Asset | `/asset` | `src/views/Asset/index.vue` | 左侧主导航、Timeline 导入入口 | 已构建待验收 |
| Timeline | `/timeline` | `src/views/Timeline/index.vue` | 左侧主导航 | 已构建待验收 |
| Profile | `/profile` | `src/views/Profile/index.vue` | 直接路由 | 已构建待验收 |
| Home | 未注册 | `src/views/Home/index.vue` | 无 | 目录存在，非当前正式入口 |
| Settings | 未注册 | `src/views/Settings/index.vue` | 无 | 目录存在，非当前正式入口 |

### 2.2 Mobile 页面地图

当前 Mobile 页面来自 `StudyCore-Mobile/src/pages.json`。

| 页面 | 路径 | 文件 | 核心入口 | 状态 |
| --- | --- | --- | --- | --- |
| home | `pages/home/index` | `src/pages/home/index.vue` | 手机首页 | 已构建待验收 |
| login | `pages/login/index` | `src/pages/login/index.vue` | 登录入口 | 已构建待验收 |
| ai-search | `pages/ai-search/index` | `src/pages/ai-search/index.vue` | AI 导航入口 | 已构建待验收 |
| asset | `pages/asset/index` | `src/pages/asset/index.vue` | 资料入口 | 已构建待验收 |
| handwriting | `pages/handwriting/index` | `src/pages/handwriting/index.vue` | 手写入口 | 已构建待验收 |
| pomodoro | `pages/pomodoro/index` | `src/pages/pomodoro/index.vue` | 专注入口 | 已构建待验收 |
| profile | `pages/profile/index` | `src/pages/profile/index.vue` | 个人中心入口 | 已构建待验收 |
| review | `pages/review/index` | `src/pages/review/index.vue` | 复习入口 | 已构建待验收 |
| settings | `pages/settings/index` | `src/pages/settings/index.vue` | 设置入口 | 已构建待验收 |
| stats | `pages/stats/index` | `src/pages/stats/index.vue` | 数据入口 | 已构建待验收 |
| timeline | `pages/timeline/index` | `src/pages/timeline/index.vue` | 知识流/时间线入口 | 已构建待验收 |

### 2.3 Tablet 页面地图

当前 Tablet 已注册页面来自 `StudyCore-Mobile/src/pages.json`，侧边导航来自 `src/components/tablet/TabletLayout.vue`。

| 页面 | 路径 | 文件 | 导航入口 | 状态 |
| --- | --- | --- | --- | --- |
| dashboard | `pages/tablet/dashboard/index` | `src/pages/tablet/dashboard/index.vue` | Tablet 侧边导航 | 已构建待验收 |
| subject-hall | `pages/tablet/subject-hall/index` | `src/pages/tablet/subject-hall/index.vue` | Tablet 侧边导航、Dashboard 管理入口 | 已构建待验收 |
| workspace | `pages/tablet/workspace/index` | `src/pages/tablet/workspace/index.vue` | 学科大厅、知识块详情入口 | 已构建待验收 |
| handwriting | `pages/tablet/handwriting/index` | `src/pages/tablet/handwriting/index.vue` | Tablet 侧边导航 | 已构建待验收 |
| pomodoro | `pages/tablet/pomodoro/index` | `src/pages/tablet/pomodoro/index.vue` | Tablet 侧边导航 | 已构建待验收 |
| review | `pages/tablet/review/index` | `src/pages/tablet/review/index.vue` | Tablet 侧边导航 | 已构建待验收 |
| profile | `pages/tablet/profile/index` | `src/pages/tablet/profile/index.vue` | Tablet 侧边导航 | 已构建待验收 |
| stats | 未注册 | `src/pages/tablet/stats/index.vue` | 无 | 目录存在，待确认正式入口 |

## 3. PC 页面功能设计

### 3.1 Login

| 项 | 设计说明 |
| --- | --- |
| 页面目标 | 提供账号登录、注册和进入桌面工作台的前置身份入口。 |
| 主要功能 | 用户名密码输入、登录提交、注册提交、登录成功后进入 Dashboard。 |
| 数据依赖 | `useAuthStore`，Auth API：`/api/auth/login`、`/api/auth/register`、`/api/auth/refresh`。 |
| 交互状态 | 输入校验、提交中、登录失败、注册失败、成功跳转。 |
| 验收要点 | 未登录访问受保护页面时应回到登录页；已登录访问登录页应回到 Dashboard；错误提示需要可理解。 |

### 3.2 Dashboard

| 项 | 设计说明 |
| --- | --- |
| 页面目标 | 作为 PC 首页，汇总近期学习状态、知识块、任务排期和学科入口。 |
| 主要功能 | 今日概览、近期知识块列表、任务摘要、学科快捷入口、跳转到学科大厅或具体学科工作区。 |
| 数据依赖 | `useBlockStore`、`useTaskStore`、`useSubjectStore`、`useAuthStore`。 |
| 交互状态 | 首屏加载、空知识块、空任务、学科切换、卡片点击跳转。 |
| 验收要点 | 数据刷新后统计一致；知识块与任务点击后去向明确；空状态能引导创建或导入。 |

### 3.3 SubjectHall

| 项 | 设计说明 |
| --- | --- |
| 页面目标 | 管理所有学科空间，是进入学科工作区的主入口。 |
| 主要功能 | 学科列表、学科卡片、创建/编辑学科、查看学科知识块数和文件数、进入 `SubjectWorkspace`。 |
| 数据依赖 | `useSubjectStore`、`useBlockStore`，本地数据库中的学科和资料文件。 |
| 交互状态 | 创建学科、编辑学科、无学科空态、进入学科详情。 |
| 验收要点 | 新建学科后侧边栏同步出现；学科元数据统计正确；删除或编辑操作不影响其他学科数据。 |

### 3.4 SubjectWorkspace

| 项 | 设计说明 |
| --- | --- |
| 页面目标 | 承载单个学科的资料、知识块、阅读和 AI 伴读，是 PC 端核心学习工作区。 |
| 主要功能 | 学科资料管理、文件/目录查看、知识块浏览与编辑、AI 问答、从资料沉淀知识。 |
| 数据依赖 | `useSubjectStore`、`useBlockStore`、`useChatStore`、AI API、Asset/FileStorage API。 |
| 交互状态 | 选择文件、选择知识块、创建知识块、AI 输入/流式响应、资料为空。 |
| 验收要点 | 路由参数 `:id` 能正确加载学科；切换学科时文件和知识块隔离；AI 上下文应与当前学科一致。 |

### 3.5 Asset

| 项 | 设计说明 |
| --- | --- |
| 页面目标 | 提供 PC 端重型资料导入、资产编排、知识块整理和关系图查看。 |
| 主要功能 | 文件拖拽/选择上传、按学科分组资产树、上传进度、资产详情、知识块列表、新增/编辑/删除知识块、任务列表、文件列表、Markdown 预览、关系星图。 |
| 数据依赖 | `useSubjectStore`、`useBlockStore`、`localDb`、`uploadAsset`、`getAssetStatus`、`ingestFile`、WebSocket 同步事件。 |
| 交互状态 | 上传中、解析中、解析完成、解析失败、资产未选中、知识块为空、图谱为空。 |
| 验收要点 | 上传成功后资产树刷新；解析完成后知识块能归入正确学科；知识块编辑和删除能同步到本地 Store；图谱加载不阻塞页面主流程。 |

### 3.6 Timeline

| 项 | 设计说明 |
| --- | --- |
| 页面目标 | 管理任务块排期、待安排任务和按天/周查看学习计划。 |
| 主要功能 | 日视图、周视图、任务统计、拖拽排期、任务取消排期、创建任务、删除任务、关联知识块查看、间隔复习任务生成。 |
| 数据依赖 | `useTaskStore`、`useSubjectStore`、`useBlockStore`、`marked` + `DOMPurify` 渲染知识块内容。 |
| 交互状态 | 待安排任务为空、时间槽为空、拖拽 hover、当前时间指示、任务创建弹窗、知识块详情弹窗。 |
| 验收要点 | 拖拽排期后任务时间更新；周视图和日视图数据一致；删除任务后待办和时间槽同步刷新；知识块关联标记可打开详情。 |

### 3.7 Profile

| 项 | 设计说明 |
| --- | --- |
| 页面目标 | 展示个人学习统计、同步状态、设置入口和账号相关能力。 |
| 主要功能 | 个人信息、统计概览、同步入口、设置项、退出登录。 |
| 数据依赖 | `useAuthStore`、`useSyncStore`、`useStatsApi`、`useSettingsStore`。 |
| 交互状态 | 统计加载中、同步中、同步失败、退出确认。 |
| 验收要点 | 同步状态和侧边栏状态一致；退出登录后清理 token 并回到登录页；统计数据缺失时有空态。 |

## 4. Mobile 页面功能设计

### 4.1 home

| 项 | 设计说明 |
| --- | --- |
| 页面目标 | 手机端首页，聚合今日学习、快捷入口和轻量状态。 |
| 主要功能 | 今日任务概览、近期知识、专注/AI/资料/复习快捷入口。 |
| 数据依赖 | `useTaskStore`、`useBlockStore`、`useLayoutStore`。 |
| 交互状态 | 首页数据加载、空任务、空知识块、抽屉菜单打开。 |
| 验收要点 | 快捷入口能到达对应页面；首页统计和任务页保持一致。 |

### 4.2 login

| 项 | 设计说明 |
| --- | --- |
| 页面目标 | 手机端登录注册入口。 |
| 主要功能 | 登录、注册、保存 token、登录后进入首页。 |
| 数据依赖 | `useAuthStore`、Auth API。 |
| 交互状态 | 输入校验、提交中、失败提示、成功跳转。 |
| 验收要点 | token 持久化后冷启动仍可识别登录态；退出后不能继续访问需要登录的数据。 |

### 4.3 ai-search

| 项 | 设计说明 |
| --- | --- |
| 页面目标 | 手机端 AI 问答和知识提取入口。 |
| 主要功能 | 模型菜单、聊天消息流、新建对话、复制回答、将回答保存为知识块、拍照/相册/知识块导入入口、语音入口提示。 |
| 数据依赖 | `chatWithAI`、`useBlockStore`、`useAuthStore`、`useLayoutStore`。 |
| 交互状态 | 欢迎态、输入聚焦、键盘高度变化、AI typing、发送中、回答为空、保存成功。 |
| 验收要点 | 消息顺序正确；AI 失败时不丢用户输入；保存为知识块后能在时间线或知识流看到。 |

### 4.4 asset

| 项 | 设计说明 |
| --- | --- |
| 页面目标 | 手机端资料选择、拍照扫描和轻量资产编排。 |
| 主要功能 | 选择文件、拍照、上传进度、编排历史、手写/OCR 文本转换为知识块。 |
| 数据依赖 | `useBlockStore`、`convertHandwritingToMarkdown`、移动端文件/图片选择 API。 |
| 交互状态 | 上传中、解析中、完成、失败回退、历史为空。 |
| 验收要点 | 文件和图片选择在目标平台可用；转换失败时有本地回退；新增知识块能进入知识流。 |

### 4.5 handwriting

| 项 | 设计说明 |
| --- | --- |
| 页面目标 | 手机端手写笔记和笔迹转知识入口。 |
| 主要功能 | 手写画布、笔迹保存、撤销/清空、转换为 Markdown 或知识块。 |
| 数据依赖 | 手写服务、`perfect-freehand`、`useBlockStore`、AI 转换接口。 |
| 交互状态 | 绘制中、保存中、转换中、空画布、转换失败。 |
| 验收要点 | 触摸轨迹流畅；清空和撤销行为可预期；转换结果能编辑或保存。 |

### 4.6 pomodoro

| 项 | 设计说明 |
| --- | --- |
| 页面目标 | 手机端专注计时。 |
| 主要功能 | 开始/暂停/重置计时、专注时长展示、任务关联、完成反馈。 |
| 数据依赖 | `useTaskStore`、本地计时状态。 |
| 交互状态 | 未开始、进行中、暂停、完成、后台恢复。 |
| 验收要点 | 计时切换不丢状态；完成后任务统计更新；页面退出再进入时状态符合预期。 |

### 4.7 profile

| 项 | 设计说明 |
| --- | --- |
| 页面目标 | 手机端个人空间。 |
| 主要功能 | 用户信息、学习数据、设置入口、同步状态、退出登录。 |
| 数据依赖 | `useAuthStore`、`useSyncStore`、`useSettingsStore`。 |
| 交互状态 | 信息加载、同步中、退出确认。 |
| 验收要点 | 用户名和登录态一致；退出后回到登录页；同步状态和设置页一致。 |

### 4.8 review

| 项 | 设计说明 |
| --- | --- |
| 页面目标 | 手机端复习入口，支持按知识块进行轻量复习。 |
| 主要功能 | 待复习列表、复习卡片、掌握度反馈、生成下一次复习计划。 |
| 数据依赖 | `useBlockStore`、`useTaskStore`。 |
| 交互状态 | 无待复习、复习中、完成反馈。 |
| 验收要点 | 到期知识块能进入复习列表；反馈后下次复习时间或任务状态更新。 |

### 4.9 settings

| 项 | 设计说明 |
| --- | --- |
| 页面目标 | 手机端应用设置。 |
| 主要功能 | 搜索设置项、账号设置、同步/隐私/通知/外观/数据导出、API Key 配置入口、开源许可和隐私政策弹窗、退出登录。 |
| 数据依赖 | `useSettingsStore`、`useAuthStore`、本地持久化配置。 |
| 交互状态 | 搜索无结果、开关切换、弹窗确认、退出确认。 |
| 验收要点 | 设置项持久化；退出登录清理登录态；数据导出和隐私弹窗文案完整。 |

### 4.10 stats

| 项 | 设计说明 |
| --- | --- |
| 页面目标 | 手机端学习数据洞察。 |
| 主要功能 | 本周专注图、累计专注、知识块数量、连续学习天数、完成任务、学科分布、活跃热力图。 |
| 数据依赖 | 统计数据、本地任务和知识块，图表组件 `HeatmapChart`、`SubjectPieChart`。 |
| 交互状态 | 图表加载、无数据、统计刷新。 |
| 验收要点 | 图表在小屏不溢出；统计口径与 PC/Profile 一致。 |

### 4.11 timeline

| 项 | 设计说明 |
| --- | --- |
| 页面目标 | 手机端知识流和任务状态查看。 |
| 主要功能 | 搜索、待同步任务、近期知识块、任务完成、任务延后、平板兼容布局片段。 |
| 数据依赖 | `useTaskStore`、`useBlockStore`、`useLayoutStore`、`vibrate`。 |
| 交互状态 | 搜索聚焦、无任务、无知识块、完成反馈、延后反馈。 |
| 验收要点 | 搜索结果和列表过滤一致；完成/延后操作更新 Store；移动和平板样式不互相影响。 |

## 5. Tablet 页面功能设计

### 5.1 TabletLayout

| 项 | 设计说明 |
| --- | --- |
| 页面目标 | 为平板页面提供统一侧边导航和主内容容器。 |
| 主要功能 | SC 标识、Dashboard/学科/专注/复习/笔记/设置导航、高亮当前路由、主内容插槽、弹窗插槽。 |
| 数据依赖 | 当前页面栈 `getCurrentPages()`。 |
| 交互状态 | 当前页面高亮、点击导航、重复点击忽略。 |
| 验收要点 | 所有已注册平板页面可互相跳转；高亮状态与当前路由一致；主内容高度占满屏幕。 |

### 5.2 dashboard

| 项 | 设计说明 |
| --- | --- |
| 页面目标 | 平板端总览页，同时展示学科、知识流、今日排期和待办。 |
| 主要功能 | 左侧学科筛选、知识流列表、知识块详情弹窗、今日时间线、待办清单、新建任务、左右面板折叠。 |
| 数据依赖 | `useBlockStore`、`useSubjectStore`、`useTaskStore`、`useAuthStore`。 |
| 交互状态 | 学科筛选、面板折叠、知识块弹窗、创建任务弹窗、空知识块、空待办。 |
| 验收要点 | 学科筛选后知识流正确变化；新建任务进入待办或排期；折叠面板不遮挡主内容。 |

### 5.3 subject-hall

| 项 | 设计说明 |
| --- | --- |
| 页面目标 | 平板端学科管理与进入工作区入口。 |
| 主要功能 | 学科卡片、学科创建/编辑、学科统计、进入 workspace。 |
| 数据依赖 | `useSubjectStore`、`useBlockStore`。 |
| 交互状态 | 创建学科、编辑学科、无学科、进入学科。 |
| 验收要点 | 学科数据和 Dashboard 左侧筛选一致；进入 workspace 时带上正确学科 ID。 |

### 5.4 workspace

| 项 | 设计说明 |
| --- | --- |
| 页面目标 | 平板端核心学科工作区，承载资料、目录、知识块和 AI 助手。 |
| 主要功能 | 左侧抽屉切换文件/大纲/知识库、添加/删除文件、知识块列表、知识块详情、新建知识块、编辑入口、删除知识块、AI 助手、预设提问、流式回答。 |
| 数据依赖 | `useBlockStore`、`useSubjectStore`、`useAuthStore`、`chatWithAI`。 |
| 交互状态 | 抽屉展开/收起、切换面板、未选知识块、创建知识块、AI 面板打开/关闭、AI streaming。 |
| 验收要点 | `options.id` 能设置当前学科；文件、目录、知识块均按学科隔离；AI 提问时带当前学科上下文；删除知识块后列表和详情同步清空。 |

### 5.5 handwriting

| 项 | 设计说明 |
| --- | --- |
| 页面目标 | 平板端手写和笔记工作区，适合横屏触控。 |
| 主要功能 | 手写画布、笔刷操作、笔记管理、保存、转换为知识块。 |
| 数据依赖 | 手写服务、`perfect-freehand`、`useBlockStore`、AI 转换接口。 |
| 交互状态 | 绘制、撤销、清空、保存中、转换中。 |
| 验收要点 | 横屏触控轨迹稳定；工具栏不遮挡书写区域；保存结果能进入知识库。 |

### 5.6 pomodoro

| 项 | 设计说明 |
| --- | --- |
| 页面目标 | 平板端专注计时和任务专注面板。 |
| 主要功能 | 专注计时、暂停/继续、任务选择、完成统计，核心计时组件为 `TimerCore.vue`。 |
| 数据依赖 | `useTaskStore`、本地计时状态。 |
| 交互状态 | 未开始、进行中、暂停、完成、任务切换。 |
| 验收要点 | `TimerCore` 状态和页面统计一致；完成后任务和统计更新；平板尺寸下按钮可触控。 |

### 5.7 review

| 项 | 设计说明 |
| --- | --- |
| 页面目标 | 平板端复习面板，支持更大屏的知识卡片复习。 |
| 主要功能 | 待复习知识块、复习详情、掌握度反馈、复习完成反馈。 |
| 数据依赖 | `useBlockStore`、`useTaskStore`。 |
| 交互状态 | 无待复习、复习中、反馈后切换下一条。 |
| 验收要点 | 待复习列表和 PC/手机复习口径一致；反馈能更新掌握状态或下次复习计划。 |

### 5.8 profile

| 项 | 设计说明 |
| --- | --- |
| 页面目标 | 平板端个人中心和设置入口。 |
| 主要功能 | 用户信息、学习统计、设置项、同步状态、退出登录。 |
| 数据依赖 | `useAuthStore`、`useSyncStore`、`useSettingsStore`。 |
| 交互状态 | 加载、同步中、设置切换、退出确认。 |
| 验收要点 | 用户状态与 Mobile profile/settings 一致；退出登录跳转正确；设置项布局适配横屏。 |

### 5.9 stats

| 项 | 设计说明 |
| --- | --- |
| 页面目标 | 平板端统计页候选入口，用于大屏数据洞察。 |
| 主要功能 | 学习统计、专注数据、知识块数据、学科分布和活跃度。 |
| 数据依赖 | 统计数据、任务和知识块 Store。 |
| 交互状态 | 图表加载、无数据。 |
| 验收要点 | 若注册为正式页面，需要补充 `pages.json` 和 `TabletLayout` 导航入口；若并入 dashboard/profile，需要避免重复页面入口。 |

## 6. 跨页面流程

### 6.1 登录与会话

1. 用户从 Login 登录或注册。
2. `useAuthStore` 保存 access token、refresh token 和用户信息。
3. PC、Mobile、Tablet 页面读取登录态后加载业务数据。
4. 退出登录时清理 token、本地用户状态，并回到登录页。

验收口径：刷新、冷启动、退出后再进入页面时，登录态表现一致。

### 6.2 学科到工作区

1. 用户在 Dashboard 或 SubjectHall 选择学科。
2. PC 跳转 `/subject/:id`，Tablet 跳转 `pages/tablet/workspace/index?id=<subjectId>`。
3. 工作区加载当前学科、资料文件、知识块和 AI 上下文。
4. 用户在工作区创建知识块或管理资料。

验收口径：跨端学科 ID、学科名称、知识块和资料数量一致。

### 6.3 资产导入到知识块

1. 用户在 PC Asset 或 Mobile asset 选择文件、拖拽文件或拍照。
2. 前端展示上传或解析进度。
3. 解析完成后生成资料记录和知识块。
4. 知识块进入 Asset、Timeline、Dashboard、Workspace 和 Review 的数据来源。

验收口径：导入完成后所有相关页面可刷新到新增知识块，失败时有明确反馈。

### 6.4 任务排期与专注

1. 用户在 Timeline、Dashboard 或 Tablet dashboard 创建任务。
2. 任务进入待办或时间槽。
3. 用户通过拖拽、完成、延后或专注计时更新任务状态。
4. 统计页和个人页展示累计专注和任务完成情况。

验收口径：任务状态在 PC、Mobile、Tablet 视图一致，完成和延后不会生成重复任务。

### 6.5 复习闭环

1. 知识块根据复习时间或掌握度进入 Review。
2. 用户完成复习并反馈掌握情况。
3. 前端更新知识块复习状态或创建后续复习任务。
4. Timeline、Stats 和 Dashboard 体现复习结果。

验收口径：复习后不应继续出现在当日待复习列表，下一次复习时间可追踪。

### 6.6 同步闭环

1. 前端通过 Store 和本地数据库记录知识块、任务、资料等变化。
2. `useSyncStore` 调用 Sync API 推送和拉取 mutation。
3. WebSocket 接收同步事件或文档解析事件。
4. 页面按事件刷新局部数据。

验收口径：离线变更、重新登录、冷启动和多端切换后数据不丢失、不串用户。

## 7. 页面通用设计约束

- 页面必须覆盖 loading、empty、error、unauthorized 或未登录状态。
- 页面新增接口调用前必须核对 `docs/APIManifest.md` 和后端 Controller。
- 涉及用户数据的页面必须通过 `userId` 或登录态隔离数据。
- PC 端优先保证键盘、鼠标、拖拽和宽屏信息密度。
- Mobile 端优先保证单手操作、键盘遮挡处理和弱网反馈。
- Tablet 端优先保证横屏触控、多面板布局和导航可达性。
- Store 字段变化后必须同步更新对应页面说明和验收口径。

## 8. 页面级验收清单

| 类别 | 检查项 |
| --- | --- |
| 路由与导航 | 所有正式页面可从导航或明确入口到达；未注册页面不应出现在正式导航中。 |
| 数据加载 | 首次进入、刷新、切换学科、退出再进入均能加载正确数据。 |
| 空状态 | 无学科、无资料、无知识块、无任务、无复习内容时有明确引导。 |
| 错误状态 | 登录失败、接口失败、上传失败、AI 失败、同步失败时有可理解提示。 |
| 数据一致性 | Dashboard、Timeline、Review、Stats、Profile 对同一任务和知识块的统计口径一致。 |
| 跨端一致性 | PC、Mobile、Tablet 对学科、知识块、任务、同步状态的基础含义一致。 |
| 权限隔离 | 未登录不可访问需要登录的数据；退出后本地状态和 token 清理正确。 |
| 平台适配 | Mobile 需验收 H5、小程序/App 目标平台；Tablet 需验收横屏和触控尺寸。 |

