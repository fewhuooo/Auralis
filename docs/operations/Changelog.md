# Auralis 变更记录

### 2026-11-25 Mobile / Tablet `APP-PLUS` 分端打包与原生能力适配

- **手机 / 平板原生端分包隔离**：在 `Auralis-Mobile` 中拆分 `app-phone`（`Auralis`，仅含 `launch` + `pages/mobile/*`、竖屏、无阅读器资产）与 `app-tablet`（`Auralis HD`，仅含 `launch` + `pages/tablet/*`、四向旋转），启用 `SQLite` 原生模块并精简 Android 权限；强化 `resolveDeviceType`（优先识别 `deviceType === 'pad'`）及 `launch` / `useAuthStore.currentLoginRoute()` 分端路由守卫。
- **原生选文件直传与增量流式**：新增 `NativeFileUploadBridge` + `nativeUploadView.renderjs.js`（配合 `plus.io`/`plus.net.XMLHttpRequest` 本地路径回退）打通 `APP-PLUS` 选文件与 MinIO 直传 PUT；新增 `plusStreamTransport.ts` 通过 `plus.net.XMLHttpRequest` `readyState === 3` 增量读取实现原生端 AI 流式对话。
- **平板原生内嵌阅读器与分端发布脚本**：抽离 `documentViewerEngine.ts` 供 H5 与原生平板共用，仅在 `app-tablet` 构建时预打包 `auralis-viewer-runtime.iife.js` 与 `vendor/` 资源至输出 `static/file-viewer/`（`app-phone` 与 `mp-weixin` 零增量），新增 `WorkspaceDocumentViewerApp.vue` + 按作用域串行化淘汰的 `nativeDocumentCache.ts`，并新增 `scripts/build-mobile-release.ps1` 覆盖 `.env.local` 校验分端产物；通过自动化测试（`142/142`）、全目标打包（`mp-weixin` `704.14 KB`）与只读审查收口（真机验证边界见 [当前状态](../current/Status.md)）。

### 2026-11-25 平板端本地持久化、端到端 UX 与 PC 工作区对齐收口

- **平板本地持久化与端到端链路修复**：完成平板工作区 `@file-viewer/core` 原地文档预览与 H5 IndexedDB 二进制缓存（`localDocumentCache`），`source_files`、`ai_overview_cache`、`review_states_cache` 与 `subject_stats_cache` 均按作用域先读后刷并支持跨账号切换清理与离线创建/编辑保真；修复后端 AI `test-connection` 0ms 超时、SiliconFlow Provider 与跨 BYOK 槽位按更新序解析、CORS 通配符匹配，以及前端排期防覆盖、Focus Outbox 404 延后重试、WebSocket `OVERVIEW_UPDATED` 实时刷新、错误提示中文化、登录路由守卫、AI 409 版本刷新与冷启动防闪烁。
- **平板工作区逐页联调与 PC 1:1 对齐**：
  - 学科总览通过 `/api/overview-results/subjects/statuses` 批量预检后再按需拉取，消除未生成总览时的 404 刷屏；
  - 新增 `WorkspaceKnowledgeBlockModal`，与 PC 端 1:1 对齐 5 色标记与 `编写 | 实时预览` Markdown/LaTeX 编辑体验；
  - 工作区右下角 AI 入口简化为无文字圆形 Auralis 标识按钮，浮窗顶栏与会话风格精简对齐 PC，并将**平板端与 PC 端工作区 AI 空态欢迎区**统一为左对齐标题、当前参考范围副标题与 3 张双行引导卡（同步更新 PC 三语提示文案）；
  - 平板学科复习面板（`WorkspaceReviewPane`）在规划总览与轮次复习卡片、掌握分布配色、白底微卡片胶囊按钮及毛玻璃防剧透画布上 1:1 对齐 PC `SubjectReviewPane`。
- **验证与联调边界**：`Auralis-Mobile`（`vue-tsc --noEmit`、`check:r4-mobile` 85 文件、`test:r4-mobile` 129/129、`test:tablet`）与 `Auralis-PC`（`vue-tsc -b`、`check:r4-pc` 125 文件、`test:r4-pc` 901/901）全部通过；用户在本地 H5 + Docker 后端完成平板主流程逐页试测，详细边界见 [当前状态](../current/Status.md)。

### 2026-11-16 文档目录精简、归档整理与 Agent 规则重整

- 重整根目录 `AGENTS.md` 与 `docs/agent/BeforeCoding.md` 并实现零重复分工：`AGENTS.md` 按工程生命周期重排为 7 节硬性红线（强化 Git 分支隔离与可回退分步原子提交、根因先行与完整影响闭包核查、跨异步世代与锁序底线、最终落盘代码重跑验证铁律及禁用源码静态匹配冒充行为测试）；`BeforeCoding.md` 收敛为纯结构化必读/验证/回写矩阵、Git 提交 6 项检查表与标准交接模板。
- 将现行文档收敛为 `agent/`、`project/`、`current/`、`modules/`、`contracts/`、`operations/` 六个分类目录共 21 份 Markdown（含 `docs/README.md`），消除单文件碎片目录：
  - 将 `docs/design/Frontend.md`、`docs/user/UserManual.md` 迁入 `docs/project/`（`FrontendDesign.md`、`UserManual.md`）；将 `docs/release/Changelog.md` 迁入 `docs/operations/Changelog.md`。
  - 将 `CodingAndGitStandards.md` 并入 `docs/agent/BeforeCoding.md`；将 `MobilePagesAPIMap.md` 并入 `docs/modules/FrontendMobileTablet.md`。
  - 将原 `docs/planning/` 10 份碎片文件合并为 `docs/current/RoadmapAndGates.md`；将原待实施文档密钥恢复边界与复习高精度恢复约束补入 `docs/current/IssuesAndReview.md`。
- 将 128 份带日期历史设计与实施方案、已替代方案、历次文档快照与比赛展示材料整理入 `docs/archive/` 四个分类目录（`design-and-plans/`、`snapshots/`、`overview-experiments/`、`legacy/`），保留原有带 SHA-256 校验快照原文逐字节不变，并同步 `AGENTS.md`、`README.md`、`Auralis-PC/README.md`、`Auralis-PC/src/types/localAsset.ts`、`.gitattributes` 与全部现行交叉链接。

### 2026-11-16 全流程后续代码与自动化修复

知识块创建在本地提交后核对登录世代，切换账号后的迟到结果不再进入当前界面，原账号已保存的数据保留。修正 PC 统计时钟、搜索断言及知识块测试上下文，生产地址扫描正确区分 Rust 测试模块。

按用户要求退役未被 PC 使用的持久后台 Overview 作业，移除创建、候选、控制接口及 worker，现行直接生成、PC 自动文件概览、正式结果与调用账本保留。历史数据库表和记录不删除，OpenAPI 及生成类型同步更新。

后端 AI 策略测试对齐 Chat 分阶段调用限制；提供独立测试数据库与 TLS 证书的测试入口。实际验证结果和未覆盖范围见 [当前状态](../current/Status.md)。后续于 11-16 15:36 经用户授权更新本地后端，容器健康、readiness UP，V46 无新增迁移，数据服务和桌面未重启。Chat 思考过程调优继续保留待办。

### 2026-11-16 全流程试测反馈

修复个人中心和文件删除确认弹窗不可见的问题。时间线任务卡片的 × 改为移回待办，专注任务时间显示具体日期。首页日期条移除重复的「日」字。Chat 消息选文提供「添加到对话」和「保存为知识块」，分别添加引用或预填知识块；对话选文只关联当前学科，失败回复只显示错误和重试。

注册、重置和改密的新密码改为至少 8 位，须含大写、小写及标点或符号；保持原有字节上限和旧密码登录能力。PC、Mobile/Tablet 校验、Server、OpenAPI 与生成类型同步更新。界面保留易读的复杂度提示和超长时缩短提示，不展示「最多 72 字节」。本地 backend 已更新并通过健康检查。

用户完成本轮资料、知识、问答题卡、排期、专注复习、离线补传与重启保留流程，并复测确认弹窗、Chat 选区两项操作、移回待办、具体日期、改密/邮件重置、文件删除、双账号隔离和本地重置恢复无重复；测试账号注销按用户反馈记录通过，后台永久清理未独立核验。完整范围、自动化基线失败和部署边界见[当前状态](../current/Status.md#pc近期结果)。Chat 思考过程展示内容调优按用户要求继续保留为[待办](../current/IssuesAndReview.md#chat检索与-ai-安全)。

### 2026-11-15 PC 文件预览恢复

本机副本校验失败时可从云端打开已上传的资料。PDF 预览失败后可直接重试当前文件。

### 2026-11-15 资料导入与处理

关闭已删除学科或资料遗留的索引任务，避免阻塞处理队列。PC 等原件上传完成后再同步资料登记，并按退避时间重新尝试原文件上传。资料库按当前版本展示索引状态，服务端确认后才显示「已就绪」。

### 2026-11-15 登录注册

注册增加邮箱验证，登录支持用户名或邮箱，忘记密码可用邮箱重置。个人中心显示用户名，移除昵称编辑。个人中心改密成功后当前设备继续登录，其他设备需用新密码登录。PC 登录页支持原生窗口操作，续期短暂失败时保留会话。

### 2026-11-15 PC 同步与文件概览

个人中心支持暂停后台同步和自动生成文件概览，提供手动同步与生成入口。移除「仅 Wi-Fi 同步」开关。

### 2026-11-15 PC 外观与显示

紧凑布局和基础字号即时调整桌面界面。主要页面可即时切换简体中文、英语和日语。三项选择均在本机保存。

个人中心移除「提醒」分组。

### 2026-11-14 PC 个人中心

左栏「账号与安全凭证」集中个人资料、登录设备管理、退出登录、重置本地离线数据和注销账户。右栏「AI 设置」顶部为自动生成概览偏好，其下分为模型与服务、使用额度两区，分区内容向内缩进，刷新按钮位于额度标题旁。模型配置依次为服务商、Base URL、API Key 和对话模型，移除服务商快捷预设。移除「数据与隐私」分组和未接通的自动标签、自动总结偏好。

简化个人中心的个人资料、账号、外观、提醒、同步、文件解析和 AI 设置文案。为设置分组标题和设置项标签添加 Tabler 线框图标。「立即同步」放在「同步状态」行。账号区按资料、设备和数据与账户重置分组，以图标、缩进、留白和细线区分层级。

### 2026-11-14 PC 时间线排期

保留现有拖放规则，统一时间线预览、本地排期与同步。周视图跨天只移动所拖任务，服务端拒绝后恢复最新排期。取消拖动会清除高亮，创建任务增加保存状态，任务到时自动完成会保留精确排期。

日视图和周视图的排期区域禁用文字选取，避免拖动时误带起页面文字。

### 2026-11-13 PC 首页搜索与任务反馈

退出或切换账号会清空全局搜索。日程勾选保存失败时恢复实际状态。快速创建会阻止重复提交，失败时保留表单并提示重试。

### 2026-11-13 PC 资料管理文件选择

资料管理在后台刷新后保留当前文件的星图范围。当前文件同步删除后关闭预览。

### 2026-11-13 学科复习提交与历史一致性（源码修复）

学科复习提交失败后可在轮次内重试或重新确认。知识块版本变化后须从规划重新进入，过期请求不会写入本地进度。服务端的复习历史现在以同一快照返回状态和结果。

### 2026-11-13 学科总览直接生成修复（本机后端已部署）

修复学科总览直接生成及重新生成大纲在预检中被拒绝的问题。

### 2026-11-13 Overview 超长输入自动分批（本机后端已部署）

新增按模型请求容量选择整篇或多批生成。多批路径分窗清理、归并大纲，按议题回读原文后统一生成总结。沿用现行结果契约与用量控制。

### 2026-11-13 PC 学科编辑重名提示

学科改名若与本机其他活动学科重名，保存前提示更换名称并保留表单。

### 2026-11-13 PC 文件删除后立即切换

学科工作区删除当前文件并保存到本机后，立即打开剩余文件或回到总览。解析和缓存清理在后台继续。

### 2026-11-13 PC 大纲编辑与总览同步

按文件当前解析修订编辑大纲。保存期间继续输入的内容可随后保存。文件总览同步分批覆盖全部有效文件。

### 2026-11-13 PC 对话恢复与服务端繁忙处理

学科工作区在对话中断后核对原请求，恢复后仍可重试原回复。旧会话的题卡仅供查看。Server 拒绝流任务入队时释放已占用的会话，已提交的答案仍保留。

### 2026-11-13 PC 知识块编辑与同步

知识块详情随同步更新，编辑草稿遇到新版本可对照后继续。创建防重复提交，更新显示同步状态，删除按版本及云端回执收敛。

### 2026-11-12 Overview 大纲按主线归并（本机后端已部署）

大纲用二级标题归并主要议题，条目以短语标明讨论范围。

### 2026-11-12 Overview 总结详略与结构（本机后端已部署）

更新总结提示词，保留核心解释、机制和适用条件，用二级标题、短段和必要列表组织内容，按清理后正文长度给出篇幅参考。

### 2026-11-12 Overview 通用输入与动态输出预算（本机后端已部署）

Overview 规划和 Gateway 统一估算完整请求输入，CLEAN、OUTLINE、SUMMARY 按各自规模计算输出上限。旧输入估算模式已退役。新版后端已通过健康检查，生产业务流程待验收。

### 2026-11-12 Overview 大纲与总结提示词（本机后端已部署）

更新大纲的主题导航格式和总结的原文范围约束。总结按清理后正文长度给出两个篇幅软目标。后端健康检查通过，正式成稿待重新生成验收。

### 2026-11-12 Overview 平台生成模型容量（未发布）

平台 Overview 直接使用生成端点配置声明的上下文窗口和最大输出 token。部署时随模型填写两项容量，详见[部署指南](Deployment.md)。

### 2026-11-12 平台 AI 端点配置（本机后端已部署）

平台生成与向量化改用两组独立的 OpenAI 兼容端点配置。升级时按新变量填入当前端点、模型和 Key，详见[部署指南](Deployment.md)。用户已保存的个人配置及其管理 API 保留。本机 backend 已重建，健康检查与新环境变量注入核对通过。真实生成、向量化和检索待验收。

### 2026-11-12 本机测试部署

Overview Markdown 替换及旧残留清理已随当前工作树部署到本机 backend/frontend，HTTP 健康检查通过；无新增备份重置测试库并注入两个 12/240/360 账号。前端构建排除旧 target-* 编译目录，界面保持。PC 数据由用户手动清空，桌面启动与旧备份删除受工具策略限制，尚未完成桌面业务验收。

### 2026-11-12 Overview 退役路径清理（源码候选，未发布）

删除旧 Writer 计划/检查点、预览和候选发布链及专属配置，移除无调用 candidateInput 与发布基准；PC 严格读取现行 Markdown 响应和缓存列。当前三阶段生成、正式保存和作业生命周期保持，历史数据和迁移保留。后端 250 项、OpenAPI 20 项、PC 165 项相关测试及两端构建通过，审查无剩余阻断；未部署，PG 与 GUI 未验收。

### 2026-11-12 Overview Markdown 替换（源码候选，未发布）

生成链已替换为范围清理、重点大纲和总结，公开结果采用 schemaVersion=2 的双 Markdown 字段。PC 接入独立渲染与 Markdown 大纲编辑，更新缓存、待写与冲突处理；不提供旧结构自动转换。后端和 PC 均已构建、定向验证通过，全量受限项见当前状态；未部署。


### 2026-11-11 桌面数据库失败时阻止启动（源码候选，未部署）

- SQLite 初始化失败时显示错误与重试，成功前不能进入应用或执行同步及文件整理，避免使用空备用索引误隔离正常文件。
- 重试复用原数据库，Web 存储行为保持。无数据删除、历史迁移或 Overview 改动。验证与未验收范围见 [当前状态](../current/Status.md)。

### 2026-11-11 AI 服务配置隔离修复（源码候选，未部署）

- 切换服务商恢复目标已保存配置并清空 Key 输入；测试连接与检测模型不再自动保存配置，未保存时明确提示。
- 丢弃已失效配置对应的模型检测结果，防止旧服务商模型进入新表单。
- 定向验证与限制见 [当前状态](../current/Status.md)。沿用现行 API，未修改 Overview 或业务配置。

### 2026-11-11 专注补传与计时显示修复（源码候选，未部署）

- 专注记录接入现有后台及手动同步恢复路径，单条业务拒绝不再阻挡其他有效记录，未传完时准确提示。
- 修复普通局域网 HTTP 无法开始专注，以及切页或暂停后当前任务显示与实际记录关联不一致。
- 定向验证与限制见 [当前状态](../current/Status.md)。本轮未修改 Overview、加入旧数据兼容或操作业务数据。

### 2026-11-11 任务编辑与排期修复（源码候选，未部署）

- 修复远端任务已删除时取消排期卡住同步，以及取消未同步时无法从周视图重新排期。
- 修复后台刷新清除未保存任务输入；任务详情增加确认式删除，支持未排期和已完成任务。
- 定向验证及限制见 [当前状态](../current/Status.md)。本轮无数据迁移或旧格式兼容，未修改 Overview 或操作业务数据。

### 2026-11-11 知识块编辑与复习继续（源码候选，未部署）

- 删除来源后保留的知识块，在所属学科和来源均未改变时可以继续保存标题、正文与颜色；新建和变更关联仍校验有效来源。
- 未核对的复习初选可从计划入口继续，结束本轮或重开后恢复核对阶段，不重复初选；前端样式保持。验证与验收范围见 [当前状态](../current/Status.md)。

### 2026-11-11 复习补传与恢复修复（源码候选，未部署）

- 修复离线纠正后重学补传的假冲突，以及仅修改知识块标题导致的同步阻断或初选无法确认；保留真实远端冲突处理。
- 修复恢复复习时到期未确认卡片重复入队，移科后旧初选失效且新科首次学习可正常进行。
- 定向回归已通过，验证限制见 [当前状态](../current/Status.md)。未加入旧数据兼容、执行数据删除或修改 Overview。

### 2026-11-11 资料处理复查补修（源码候选，未部署）

- 修复选择器与拖放混用时重新选择同一文件未更新，以及已登记资料自动解析重试丢失输入的问题；前端样式和断网手动继续策略保持。
- 解析上传申请的源 SHA 明确为必填，申请阶段校验与双端生成类型一致。修复原资产读取失败时拒绝状态被事务回滚，以及删除恢复后旧执行回调覆盖当前状态的问题。
- 历史数据保留，无 schema 迁移。自动验证与端到端验收范围见 [当前状态](../current/Status.md)。

### 2026-11-11 核心同步六项修复（源码候选，未部署）

- 修复普通队列重启滞留、结果未知后改写原请求、旧回执覆盖本地新编辑，以及单设备连续编辑产生的版本冲突。使用现有本地事务、服务端幂等与 Store 调度，保留现行远端冲突语义。
- 修复预期业务拒绝使整批同步失败的问题，并修正 Sync OpenAPI/SDK 的 JSON payload 类型。历史记录和既有 CREATE 防覆盖行为保留。
- 本轮同步相关回归、PC 类型检查、PC build 和 Server package 通过，唯一只读审查 BLOCKER 0 / IMPORTANT 0；全量范围外失败、PC 定向统计失败及 Mobile 类型检查限制见 [当前状态](../current/Status.md)。本任务未编辑 Overview，未部署或操作业务数据。

### 2026-11-11 资料导入与处理修复（源码候选，未部署）

- 修复换选文件后的默认名称、资料库拖放预填，以及自定义标题影响预览和解析格式的问题。下载接口提供原资产文件名和 MIME。
- 网络中断后等待用户点击继续，修复草稿解析重试与恢复的状态转换；处理中心保留上传完成后的服务端索引及失败状态。页面样式保持。
- 修复 FILE 删除后恢复缺少索引任务，以及解析上传声明的资产摘要与实际资产不一致仍被接受的问题。历史数据保留，无 schema 迁移。验证与验收范围见 [当前状态](../current/Status.md)。

### 2026-11-11 Chat 工具探索额度与收尾（源码候选，未部署）

- 默认及上限调整为每 attempt 12 轮模型调用、20 次工具执行，最后一轮预留回答并由服务端禁止新工具执行。提前完成或 READY 活动不额外调用模型。
- 应用、Compose 与环境示例默认值同步；token、费用和总期限限制保留。定向有效 163 项及 package 通过；全量失败与环境边界见 [当前状态](../current/Status.md)。

### 2026-11-11 账号与会话模块修复（源码候选，未部署）

- 改密确认错误不再触发自动登出；Chat SSE 按发起登录世代隔离，并在当前会话刷新失效后导航登录。轮换保存当前服务端 sessionId，保持本地登录票据稳定。
- 设备下线覆盖该设备轮换后的续期会话；新密码在编码前校验 72 字节上限。历史密码哈希、会话记录及本地业务数据保留，注销文案按实际行为说明。
- PC 定向 211/211、后端定向 45/45 与隔离 PostgreSQL 3/3、双端 SDK 一致性和两端构建通过。全量既有失败与快照环境补验边界见 [当前状态](../current/Status.md)。本任务未修改 Overview，未部署或操作业务库。

### 2026-11-11 Overview INDEX 统一分段（源码候选，未部署）

- 单来源文件详细生成的 INDEX 使用统一的段首摘录和画像。64K 起读，普通续窗重读待定末段，硬上限续窗按提要前沿累计画像。私有算法身份更新为 `overview-dynamic-window-v9`，已发布正式结果沿用公开契约。[分批实施文档](../archive/design-and-plans/superseded-2026-11-15/2026-11-10-overview-dynamic-window-implementation.md)

### 2026-11-11 Overview 正文路由与总导读（源码候选，未部署）

- ROUTE 将每个完整段分配到正文章节或附带理由的排除清单。ALL 按实际正文覆盖和排除段原文生成独立总导读，OUTLINE 交付正文。私有算法身份更新为 `overview-dynamic-window-v4`，公开结果按现行契约读取。[分批实施文档](../archive/design-and-plans/superseded-2026-11-15/2026-11-10-overview-dynamic-window-implementation.md)
- 正文路由先依据资料的实质内容判定归属，再组织章节。单成员正文直接返回 Markdown 字段，多成员按实际成员 ID 交付，提示区分资料截断、独立例题与界面示例。私有算法身份更新为 `overview-dynamic-window-v6`。

### 2026-11-11 Overview 详细生成 INDEX 输入简化（源码候选，未部署）

- 单来源文件详细生成的 INDEX 读取连续原文，后端按段首摘录的首个顺序命中确定范围，失配段并入前段。私有算法身份更新为 `overview-dynamic-window-v2`，正式结果沿用公开契约。[分批实施文档](../archive/design-and-plans/superseded-2026-11-15/2026-11-10-overview-dynamic-window-implementation.md)

### 2026-11-11 账号请求隔离与 Sync CREATE 防覆盖（源码候选，未部署）

- PC 受保护 Axios 请求及刷新/重放绑定登录世代，账号变化后拒绝旧请求和迟到结果；Profile 旧登出不干扰新会话。
- 五类资源 CREATE 改为只插入，数据库主键碰撞回滚后按现行幂等规则记录拒绝回执，继续同步批次。历史记录保留，无数据迁移。
- PC 定向 95/95、Server 定向合计 129/129 通过，两端构建通过，唯一只读审查最终 BLOCKER 0 / IMPORTANT 0。全量仍有已记录的范围外失败，见 [当前状态](../current/Status.md)。本轮未修改 Overview，未部署或操作业务数据库。

### 2026-11-11 Chat、Provider 与 PC 旧契约清理（源码候选）

- Chat 搜索限定在 attempt 捕获的 READY 来源，引用统一通过命令顶层 `selectionText` 传递。历史会话、消息与 run 保留。升级前的原始请求重放可能收到 `CHAT_REQUEST_CONFLICT`。见 [Chat Runtime API](../contracts/chat-runtime-api.md)。
- Provider 流式调用使用可取消的端口。V45 将历史 `ai_credentials.embedding_model` 列改为可空，保留原值。PC 删去旧 Asset 适配、知识块 Store 和 SQLite 旧运行路径，历史表及浏览器键保留。
- 后端定向 70/70 与 109/109、OpenAPI 导出 19/19 和双端 SDK 生成、PC 类型检查及 Mobile 协议 24/24 通过。PC 定向分两批通过 158/158 和 67/67。Server package、PC Web build 和正式 OpenAPI/双端 SDK 一致性检查通过。Server 全量在并行 Overview 及既有断言处失败，PC 全量 3 项失败在基线复现。业务库未应用 V45，未部署。见 [当前状态](../current/Status.md)。

### 2026-10-29 Chat P1 内容渲染基础（候选实现，未接入页面）

- 新增 Chat 内容公开投影类型与服务、正文/结构块 renderer 和题卡 activity card，支持有序公开字段、稳定草稿与提交形状校验；不执行答案判分。
- PC `npm.cmd run type-check` exit 0，`node scripts/r4-chat-content.test.mjs` 6/6 通过。证据 `D:/Temp/auralis-chat-p1-components-20261029/`。
- 唯一 reviewer 对组件与纯逻辑基础未发现 BLOCKER/IMPORTANT。尚未连接 Workspace、Store、stream API 或 reducer；没有页面挂载或 GUI 验收。无生产 API、数据库或依赖变化；Chat 主链未接通。

### 2026-10-29 提交前修复测试构造器与核验工作树

恢复测试的限额helper补传 currentAi.overviewMaxRetries()，修复新增配置参数导致的测试源码编译失败，并保留原重试设置。最终 -DskipTests package 成功；PC type-check、相关51项测试通过。后端原改动哈希与既有146/43/3定向证据一致。Recovery运行受Docker缺失限制，PC静态扫描有未改动Rust测试地址的既有误报；未声称全量通过、部署或业务验收。唯一只读审查B0/I0/O0，详细证据D:/Temp/auralis-precommit-20261029/。

### 2026-10-28 桌面资料处理入口反馈与手动重验（源码修复，队列READY已只读确认）

处理中心“开始本机处理”增加“正在同步资料…”/“正在启动本机处理…”两阶段反馈与重复点击保护。调度器SKIPPED/WAITING/FAILED结果不再静默丢弃，已知原因映射为安全中文；未知异常不回显原始详情。manualSourceResume无状态helper保留flush与synced检查，固定用户/设备/session/仓库及scheduler，在等待后重核上下文；界面迟到结果也按操作代次和scope隔离。

手动操作可重验曾404的临时NOT_FOUND缓存，普通自动调度仍节流；显式删除、并发删除及迟到处理fence保持。该资料本地/后端元数据齐备但无job的现场已只读确认；本次是否实际命中过404缓存尚未证实，不能将该候选路径当作唯一根因。无需重传资料或数据库迁移；未改变后端生成/额度。

type-check exit0、相关scheduler/UI测试最终51/51通过；首轮旧静态断言/泛型推断问题及唯一审查发现已修正，同一reviewer差量关闭后B0/I0。未操作GUI、手动触发真实解析或部署。后续23:39:56香港时间的只读本地快照确认该job与source均READY、无错误，证据post-fix-state.txt；这仅确认队列运行结果，未验收GUI或解析内容质量，也不能证明本次历史404候选根因。基线、逐轮验证与审查见D:/Temp/auralis-desktop-queue-feedback-20261028/；只读现场见D:/Temp/auralis-pre-generation-stall-20261028/。

### 2026-10-28 Overview 模型响应自动重试（源码候选，未部署）

新增AURALIS_AI_OVERVIEW_MAX_RETRIES，默认3表示首次之外最多再试3次（最多4次尝试），0关闭，非负且没有额外固定小上限。.env.example、Spring与Compose已贯通，未改实际.env。覆盖adaptive INDEX/ROUTE/Writer单节与合批/EDIT在模型已返回且网关已结算后的空内容、JSON、字段、Schema、漏节及编辑校验错误；直接重发原stage输入，不重跑已完成检查点，不保存半批。adaptive JSON_REPAIR不另叠加模型调用；普通响应截断沿现有容量拆分。重试次数不进入内容/profile/checkpoint指纹。

网络/连接超时或未知派发不自动重发；预算/额度/限流、取消/中断、总期限、来源变化、租约失效与本地bug不重试。每次真实重发仍走独立invocation/reservation并受现有费用额度约束。阶段重试日志为ADAPTIVE_MODEL_RETRY，带purpose/retryIndex/maxRetries/safeCode，耗尽返回最后具体错误，用户仍可手动断点续跑。

定向146/146（含先前104，不重复计数）、受影响PG十类43/43及TLS3/3通过。唯一full964项0F/90E/2S，90E由PG/TLS参数设置及四个测试文件中的构造器调用导致，分别修正后affected闭合，未重跑full或声称一次全绿。唯一只读审查B0/I0；未部署、未调用真实模型或做GUI验收，未操作业务库/清缓存。证据D:/Temp/auralis-overview-auto-retry-20261028/。

### 2026-10-28 Overview 相邻小节合批写作（源码候选，未部署）

路由提示明确相关主题可合成教学小节，并保留主题唯一分配提醒。Writer可将同源、同章、按目录连续且共享精确原文范围的待写小节合为一次请求；共享原文去重，各节题目、主题与来源独立绑定，成稿按原目录回填。批次大小由完整请求和多节输出预留动态判断，没有固定节数帽。已验证单节保留并跳过，容量拆分parts不跨节合批；合批一个执行节点，完整响应验证成功才保存整批检查点，重试恢复整批，不保存半批。

单节现行操作保持；多节私有操作为write_adjacent_sections_v1，模型仅回sectionIndex与detailedContent，来源/主题由程序回填。未改PC、公开API、数据库结构、额度或执行fence。定向169项在修正构建产物/注解错误后通过；随后审查及新增恢复用例暴露的顶层operation识别和单节manifest误入问题已最小修正，最终受影响Adaptive83/83通过，同一只读reviewer差量关闭后B0/I0。不是一次全绿；未跑全量、部署或真实模型生成，实际输出质量/用量节省未验收。证据D:/Temp/auralis-coalesced-writer-20261028/。

### 2026-10-28 Overview 按来源路由与遗漏补回（源码候选）

针对8份无关资料的174主题路由只引用89个ID、在Writer前终止的问题，改为按最早BODY原文来源分域路由，源内沿原章顺序聚合；整源能放下则一次请求，超容量才按现有动态规则拆分。跨源主题只归一个域但保留所有原始引用。ROUTE解析接受非空合法子集，未知/重复ID仍拒收；程序将连续遗漏按原章、原序及完整Writer请求容量成组补入，最后校验完整唯一覆盖。无需额外模型修复，也不新增固定主题数或节数上限。背景/导航过滤、Writer证据及重试/费用语义保持。

集中定向首轮Adaptive77项5F/4E，旧跨源fixture与prompt断言更新后的首次受影响复验77项仍有1F，最终含补回原序回归的Adaptive78/78通过；DynamicBudget17/17、Recovery23/23通过。未运行全量测试、部署、业务库/缓存操作或真实模型生成。唯一只读审查的顺序问题已修正，同一reviewer差量关闭后最终B0/I0/O0，审查结论见D:/Temp/auralis-local-route-20261028/review.md；本轮命令与证据位于同目录。实际生成质量与耗时待部署后验收。

### 2026-10-27 香港23:05 重试候选已部署

按用户授权，以现有基础Compose及overview-trace overlay构建并recreate backend/frontend，均exit0。启动时Flyway验证41个迁移，数据库已为V41，本次无需重复执行迁移。backend healthy、readiness HTTP200，frontend HTTP200；db/MinIO容器ID及挂载前后相同。backend镜像abe74be55083…，frontend2321333dfca5…。未清缓存、未调用真实模型，重试业务效果待用户使用验收。日志：D:/Temp/auralis-overview-retry-deploy-20261027/。

### 2026-10-27 Overview 独立执行重试（未发布候选）

- Source/Subject direct重新生成支持retryOfRequestId，新尝试独立generation/budget，旧执行以fence结束；相同请求幂等、同父并发单后继，已验证祖先进度复用，旧调用及费用保持。V41新增父关联与请求意图，PC沿用原入口且不加端侧schema；durable jobs保持原恢复合同。
- OpenAPI/两端SDK、定向/隔离PG、PC类型84项测试与构建、backend package完成；唯一review B0/I0/O0。full950项首轮1F/55E/2S经环境修正和affected复验闭合，未重跑full。未部署或迁移业务库，真实重启重试/Provider/GUI待验收。见[计划](../archive/design-and-plans/plans/overview/2026-10-27-overview-explicit-retry.md)。

### 2026-10-26 Overview动态容量本机部署

- 按用户授权部署backend6256eee9…及frontend28f9ff68…，V40成功应用；readiness/前端与bundle HTTP200，运行六个关键class与已验证候选一致。26项MAX与Overview calls均0，原Token财务额度保持。
- 按用户选择备份后清理全部6条FAILED生成缓存，保留22SUCCESS、22正式结果、675账本及原资料，12组hash一致。db/MinIO原容器和卷身份保持，旧应用镜像与D盘备份留存。未调用真实模型、未做GUI/内容质量验收。证据D:/Temp/auralis-overview-deploy-20261026/。

### 2026-10-26 Overview 动态容量与链路简化（未发布候选）

- 新增 26 项 Overview 专属容量 ENV，默认 0 按模型/完整请求动态处理，正数额外限幅；调用次数默认 0，财务额度保持。移除多层 Metadata 和 Writer 回声字段，程序绑定来源；中间 aliases 与最终来源数量分开校验。未知能力需精确服务器 profile，配置边界不引用 AI 业务枚举。
- 新增 V40 放宽 Overview 存储长度并将结果标题改 TEXT；PC 接收与 OpenAPI/两端生成契约同步。隔离 PG 43/43、affected 44/44、OpenAPI 15/15、package、Compose config、PC 类型/接收 80/80 通过；唯一 full 933 项失败后按归因定向闭合，不称 full 全绿。唯一只读审查 B0/I0/O0；未部署或调用真实 Provider，业务库未迁移，GUI/质量未验收。见[实施计划](../archive/design-and-plans/plans/overview/2026-10-26-overview-dynamic-capacity-and-simplification.md)。

### 2026-10-25 Overview provenance generation/save contract alignment（源码候选）

- PC 生成 SSE 现在按 raw provenance input 验证，并通过现有本地输入字段进入正式结果保存/同步；formal result API 仍严格要求 canonical provenance view，per-section refs 上限为后端定义的 500，Java UUID 形状接受 nil UUID。没有变更页面交互、API wire shape、数据库结构或 Provider 流程。`vue-tsc -b` 通过，Overview generation 定向测试 79/79，通过用例涵盖 nil/invalid UUID 与 101/501-ref 边界。真实 owner-scoped 成功 payload 的只读 replay 通过（23 章/87 节/111 refs；raw 接受、canonical 拒绝）。Tauri 显示和正式结果写入仍待用户在 HMR/重启后重试。

### 2026-10-25 Adaptive Overview prompt serialization order（源码候选）

- 将五个可能进入 prompt JSON 的嵌套 `Map.of` 对象改为显式顺序，保持字段和值不变。INDEX 旧 trace 顺序可由本次选择恢复；writer 顺序与 de2 的 66 个有效请求 trace 一致。未改变公开 API、数据库结构或 checkpoint hash 算法，也未增加模糊缓存匹配。
- 自动验证分批完成：首轮 Adaptive 类已有的 66 个用例通过；随后新跨 JVM probe method-only 1/1 通过。Probe 使用固定输入执行实际 INDEX、Writer、Guide builders，并跨两个独立 JVM 对比 JSON hashes 与 checkpoint steps；空的末批 context、非空 writer sibling bounds 均受断言检查。分批证据不合并为一次 67/67。中间 harness 故障已修复。未执行当前数据库 cache replay、真实 Provider 或部署。

### 2026-10-25 Adaptive writer trailing identifier recovery（源码与定向验证完成；未部署）

- `ADAPTIVE_WRITE` 首次正常 stop 响应可在严格识别完整 writer JSON 对象后剥离一个单独 ASCII identifier；显式截断、重复字段、额外 JSON/标点、非法 schema/aliases 与非 writer 阶段仍失败。既有 writer 校验链不变，不增加 Provider 调用或公开 API/数据库结构。fresh D 盘候选 clean 编译 379 production sources，Adaptive 66/66 与 Provider resilience 10/10 通过；`response_format=json_object` 对 4608/4675/6144 token 预算的序列化边界均有实际 body 断言。未部署或调用真实 Provider；证据 `D:/Temp/auralis-writer-tail-fix-20261025/candidate-run2/`。

### 2026-10-25 Adaptive writer checkpoint boundary normalization (source verified; not deployed)

- Normalize adaptive writer/composite section boundaries before first persistence so manifest hashes match the exact saved bodies. Restore verifies raw payload identity and fragment hashes, validates structure, and preserves the stored representation for preview checkpoint binding. Internal Markdown whitespace and provenance checks remain intact; no API or database schema change. The matching-source Adaptive suite ran 64/65; its sole failure was a synthetic old checkpoint over the existing section size limit. After correcting the fixture and allowing only the expected completed-guide request, the affected method passed 1/1. Not deployed; no real Provider or GUI acceptance.

### 2026-10-25 Overview metadata convergence、Chat retrieval isolation 与 Provider probe（源码候选）

- Metadata planning prompt 现示范一个 section 绑定多个授权 plan alias，并要求将相关条目归并为更少的 sections、保留主题区别和不可变应用绑定。路由先于 count convergence 检查；当 route 不适配且 metadata section 数未下降时立即使用既有 bounded topic buckets。
- Chat retrieval excerpts 现在经过 delimiter 字符转义并放入完整闭合的 untrusted wrapper；system 规则说明 excerpts 仅为证据数据，source/chunk UUID 是内部 metadata，除非用户要求不得披露。Provider setup connection probe 的请求输出上限为 32 tokens。未修改公开 API/DTO、检索范围、用户/历史预算或 Guard policy。
- 自动回归只证明提示词包装、适配结构和请求参数，不证明真实模型服从安全提示。首轮 focused batch 为 87/88，唯一失败是既有 large fixture 对 direct route 的过窄断言；test-only 修正允许对应 bucket fallback 后，该 affected method 1/1 通过。其余类 PromptAssembler 5/5、AiStreaming 17/17、ProviderDiscovery 2/2 已通过；累计定向覆盖 88/88，分轮完成而非一次全绿。未部署、未调用真实 Provider，未完成用户业务验收。
- 后续只读审查发现 selection preflight 误计了仅在有 retrieval excerpts 时需要的 system 指令。Preflight 现仅计必需的 selection 边界和当前问题；拿到 citations 后，若不能完整保留这些必需内容则省略 retrieval prompt context。`PromptAssemblerTests` 7/7、`AiStreamingTests` 17/17 通过，Maven exit 0；无真实 Provider/业务验收。

### 2026-10-24 Overview 直接请求整任务期限开关（实现候选；未部署）

- `AURALIS_AI_OVERVIEW_TASK_TIMEOUT_MILLIS=0` 可关闭同步 JSON/SSE 的整体任务 deadline 与 SSE 容器 timeout；缺省仍为 240000ms，负值拒绝。取消保持有效，每次 Provider response 仍受原正数配置窗口、Guard、计量与预算约束。
- 后台持久 jobs 的 durable deadline 继续为有限的 240000ms；无数据库/API/schema 变化。本机 `.env` 已设 0，未构建镜像、未部署或调用真实 Provider。

### 2026-10-24 Overview 全链路提示词细化（相关验证通过，未部署）

- 主 Agent 直接整理索引/coverage、元数据、topic/plan 路由、分组细讲、完成后导读、现行短总览 MAP/REDUCE 及各自修复提示词。明确 chapter/section 的 title 键、summary 内的 learningPath、真实 null、编号授权及覆盖规则，增加合法 JSON 结构示例与返回前自检。
- 独立修复提示不再要求缺失的主请求材料；中间恢复与最终恢复各有明确完整度契约。未放宽解析器或增加自动调用，无 API/DB/前端、预算或配置变化。相关170项最终通过，包含修正长度边界夹具后的2项 affected-only 复跑；主 Agent 审查B0/I0。未跑full/package，未部署或进行真实 Provider 验收。

### 2026-10-24 Overview 自适应阶段提示词隔离（源码候选）

- 自适应生成提示词按阶段响应结构与 alias 授权范围隔离。outline 阶段要求根 `summary=null`；完成后的 guide 要求 `summary` 且 `learningPath` 位于其中。writer 私有结构与非自适应 mode 提示词保持不变。
- 自适应 JSON repair 依目标阶段 schema 与已授权 aliases 拼装，不继承公共 ALL mode 或主请求材料指令；索引专用 repair 保留。提示词派生的 checkpoint identity 自然隔离变更请求。Adaptive 59/59、AiOverview 80/80、Recovery 28/28 通过；Recovery 测试启动 Testcontainers 临时 PostgreSQL fixture，未连接业务库。无 API/DB 变化、未清缓存；本轮候选未部署、未调用真实 Provider。

### 2026-10-24 AI Provider 思考开关（实现候选；未部署）

- 新增默认关闭的 `AURALIS_AI_THINKING_ENABLED`，Compose 与示例配置同步。本机 `.env` 已仅更新该开关为 `false`。
- DeepSeek 的所有 completion/stream 请求、以及精确官方 MiMo endpoint 的 OpenAI-compatible 请求按开关显式控制 thinking。未知 OpenAI-compatible host 不带该专有字段；不保证任意自定义模型或代理的内部推理关闭。未部署、未调用真实 Provider。
- 独立 D 盘候选 full backend 通过：144 suites / 868 tests，0 failure / 0 error / 1 个未设置私有 replay 目录的 assumption skip；随后 `-DskipTests package` 也通过。完整命令、日志和源码 hash 见 `D:/Temp/auralis-thinking-env-20261024/`。

### 2026-10-24 本机后端部署（thinking 配置）

- 22:46:29 创建的本机 backend 镜像 digest 为 `sha256:5f65ebbd89c097092109fde92067a6c4975deb808e5f6d904c9d4a92204d487c`，运行 `THINKING_ENABLED=false`。镜像内 Provider class SHA-256 与 thinking 配置候选相同。该部署不含本轮自适应阶段提示词源码候选，也不构成真实 Provider 验收。

## 2026-10-24 ADAPTIVE_INDEX strict first-root parser correction (not deployed)

- The local strict reader now creates and reads its own first-root parser, so duplicate outline and nested fields are rejected instead of silently overwritten during displaced-summary recovery. Shared Mapper settings, prompts, checkpoint identity and public contracts are unchanged. A fresh D-drive candidate compiled 379 production and 144 test sources; Adaptive tests passed 58/58 (exit 0), including duplicate-field rejection without checkpoint writes. No full suite, PostgreSQL, package, deployment or real Provider call was performed in this correction.

## 2026-10-24 Overview routing and writing completion (source complete; no deployment)

- Added v9 topic-catalog routing, private writer body formatting/recovery, post-writing guide generation, and multi-fragment verified preview contract. In the isolated D-drive candidate, Adaptive 48/48, Recovery 28/28, Preview PostgreSQL 10/10, Formatter 9/9, final affected Adaptive methods 2/2, OpenAPI artifact export, package, and PC type-check passed. Mobile type-check reports the existing `EventRequest/EventResponse` references absent from the current API contract. The original full batch failed (855 tests, 6 failures, 29 errors, 1 skipped) with contaminated compiler output among its errors; it was not rerun on the isolated candidate. The sole read-only review concluded B0/I0/O0 and confirmed all three behavior findings closed. No deployment or real-provider acceptance is claimed.

更新时间：2026-10-24
文档状态：现行历史记录
权威范围：已发生且可确认的产品、代码、文档和验证变化
事实来源：Git 提交、本轮实际验证记录与重构前快照

### Overview completion 输入估算统一接线（2026-10-24；本机候选已部署）

- 唯一只读 review B0/I0/O0；离线 gate、相关43项与package通过后，仅更新本机 backend。镜像 `sha256:72f6a41df02f8497fe32d2d0c3cbb18580ed2671b1c233ec9b41a95f658cc49d`，healthy/readiness UP，trace overlay 模式 `calibrated-category`；基础默认仍 legacy。部署未主动调用 Provider，db/MinIO/frontend 容器身份未变，正文实测待用户进行。全量 stdout 留存缺口详见 `D:/Temp/auralis-budget-step3-20261024/final-handoff.md`，下述 full 数字不得引用当前被覆盖的日志作原始证据。

- 新增纯 Java `AiInputTokenEstimator`，统一 Overview context fit/preflight 与 MAP/REDUCE Gateway reservation 的 provider/endpoint/requested-model profile。默认 `legacy-bytes`；显式 `calibrated-category` 仅对精确 DEEPSEEK、官方 endpoint 与 `deepseek-v4-flash` 生效。支持 message 的 Han 字符类别估算乘2，非 Han 内容按 UTF-8 bytes，整体加一次 `max(64,4 × messageCount)` framing/margin 并 clamp 到 legacy；未知身份或不支持形态 fail closed 到 bytes。输出 cap、原文、checkpoint profile 和 API/schema 保持不变。
- 40个请求按 system/user hash 去重34对；目标 run 11/11 distinct、request character metadata 均匹配。25个支持形态且 usage 完整的 unique prompt pair 零低估；INDEX覆盖15/24、METADATA 8/8、ROUTE 2/2，writer样本0。estimated input 597033，相对旧 bytes 717340 减少16.77%，actual input 166676；最低估算/actual coverage 322.86%，underestimate 0，gate PASS 仅限当前 trace 形态，不代表 tokenizer 精确或通用校准。所有 trace run outcome 为 FAILED。
- Maven full：837 tests，836 passed，0 failures，1 error（唯一错误为 replay test stage aggregation 对缺 usage 样本的 null-handling）；该 test-only 问题修正后相关 estimator/replay/config/Guard/planner 批次43/43 passed（exit 0），并通过 replay gate 断言。`-DskipTests package` exit 0。逐请求无用户内容的 JSON replay 报告：`D:/Temp/auralis-budget-step3-20261024/token-estimator-replay-report.json`；测试与 package 日志在同目录。review B0/I0/O0 与本机部署已完成；真实 Provider 验收待用户实测，本轮未主动调用新 Provider。

### Overview ADAPTIVE_WRITE 正文预算路径（2026-10-24；源码及定向验证完成；未部署）

- 正文 writer 输出上限按序列化正文/结构负载确定，限定在 4608–6144；同一值用于 context fit、平台预检、Provider/Gateway/Guard、截断判断以及 generation/journal writer checkpoint 身份。长正文沿既有 6144 上限与内容拆分；不按剩余预算削减原文或质量目标。
- 预算拒绝继续使用同一个 generation/budgetTaskId 和 charged ledger，保留已验证 checkpoint；现有同步 JSON/SSE 错误语义不变。未新增状态、API、schema 或 migration。
- 预算日志按 generation/budgetTaskId 关联 stop/resume/complete，记录 verified/remaining writer 进度、单次 reserve、aggregate upper forecast，以及 task charged（实际与估算可能混合）、reserved 在途和配置余额。BYOK 记录实际 usage 与估算，不套用平台 token 额度拒绝。API 文档补充同 budget root 的 recoverable 语义，没有新增响应字段、PAUSED 状态或 schema。
- 集中批次 138 tests / 137 passed / 1 failed / 0 errors / 0 skipped（exit 1）；唯一失败是新增 PostgreSQL 恢复用例的 fixture 断言，未将整批记为全绿。修正后只重跑 affected-only PostgreSQL 用例，1/1 passed（exit 0）。测试在隔离 Testcontainers PostgreSQL 17.11 上运行；模拟已结算 ledger 饱和后，Guard 拒绝第二 writer 且 Provider 派发数不变；同步提高测试中的 service 与 Guard 配置后，charged 保留、同 generation/budgetTaskId 恢复，且只派发未完成 writer。测试修改配置模拟重载；实际运行环境需统一更新配置并重启。命令、逐次日志和 exit 文件见 `D:/Temp/auralis-budget-step4-20261024/`。本轮未部署或调用真实 Provider，缺少真实 writer 样本，不能据此确认正文质量或预算估算已校准。
- sole review 随后发现纯诊断 usage 读取可能影响 writer 成功处理或 RESUME lease 生命周期；已按最小范围对 writer-progress、全 checkpoint 命中预算快照、恢复 trace 读取/记录采取 fail-open。Guard 准入及 coordinator STOP/COMPLETE 所需读取维持既有失败语义。PostgreSQL stop/resume 注入场景在2项 affected-only 批次中通过；writer-progress 故障注入在夹具 SQL 状态名修正后 affected-only 1/1、exit 0，验证 generation SUCCESS 与 request-id replay 无 Provider 重发。该2项批次首轮结果 1 passed / 1 fixture assertion error（exit 1），未重复已通过测试；完整验证记录见 `D:/Temp/auralis-budget-step4-20261024/review-fix-handoff.md`。同一 reviewer 修复复审已完成，BLOCKER=0 / IMPORTANT=0，原 OPTIONAL 1 保留；证据 D:/Temp/auralis-budget-step4-20261024/review-final.md。

### Overview 本机调用次数观测（2026-10-23）

- 配置 `AURALIS_AI_LIMITS_OVERVIEW_MAX_CALLS=0` 时，Overview 平台任务与 MAP/REDUCE stage 不设累计次数预算；默认24保持，其他 AI 功能和 Token/窗口额度保持。trace overlay 使用0，以采集真实长资料生成用量并在后续重新定限额。本机 backend 已更新、healthy/readiness HTTP 200；定向54/54、package成功，full测试仍有环境与历史断言失败，真实生成尚未验收。

### Overview ADAPTIVE_METADATA summary 规范化（2026-10-23；已部署，真实业务验收待进行）

- 内部 ADAPTIVE_METADATA 的 summary=null 规则优先于 ALL 模式，仅规范化该 purpose 的响应和旧 checkpoint；普通 ADAPTIVE_INDEX summary 及最终目录摘要逻辑不变。定向验证 40/40，review B0/I0/O1。
- 仅 backend 重建并启用既有 trace overlay；backend healthy、readiness HTTP 200，未执行真实生成或 Provider 调用。部署证据：`D:/Temp/auralis-metadata-summary-fix-20261023/startup/handoff.md`。
### Overview M5.2 ADAPTIVE_INDEX 批次别名提示修正（2026-10-23；已部署，真实业务验收待进行）

- Provider-facing index batch 仅接收当前批次 `unitAlias`，并约束返回 `sourceIds` 使用这些别名；内部 source owner/provenance 和 coverage validator 保持原样。定向测试 37/37、runtime review B0/I0。
- 仅 backend 重建并启用既有 Overview trace overlay；backend healthy 且 readiness HTTP 200，未执行真实生成或 Provider 调用。部署证据：`D:/Temp/auralis-index-alias-fix-20261023/startup/handoff.md`。
### Overview M5.4 正文跨任务复用（2026-10-23；源码、affected-only 定向复验与唯一审查完成；未部署）

- 完全相同 owner/scope/input/profile/algorithm/prompt-derived writer step 的 SUCCESS donor，仅当其 checkpoint 与 ASSEMBLED plan 下 VERIFIED node hash 一致，且当前 attempt journal 关联真实 dispatched reservation 时可复用。命中经现有校验与事务物化本代恢复 checkpoint，不更新原 donor/TTL，不新增 reservation/usage-call；无 reservation 的 cache-materialized node 不可接力。unknown dispatch / `RECOVERY_REQUIRED` 优先 hold，预算预检计入同一 donor，过期竞态由原 Guard 处理。
- 首轮定向批次 55 项为 52 passed / 3 errors；affected 首轮 4 项为 3 passed / 1 failed。归因包含 Mockito stub 重装、active lease fixture 与 unknown-dispatch 断言将 preflight reads 计作执行 lookup。随后 unknown-only 1/1、final affected-only 4/4（exit 0）；未重跑55项整批。唯一 reviewer B0/I0/O0。
- 无 API/schema/migration/frontend 变化；未运行 PostgreSQL、full/package/OpenAPI-SDK、真实 Provider、GUI、Docker 或部署。M5 与不同 input 正文复用、依赖失效及完整生命周期仍待完成。

### Overview M5.3 目录规划跨任务复用（2026-10-23；源码、分批验证与唯一审查完成；未部署）

- `ADAPTIVE_ROUTE`、`ADAPTIVE_METADATA`、`ADAPTIVE_METADATA_ROUTE` 可在同 owner/scope/profile/algorithm、完整 generation input 和 prompt-derived step 匹配的 SUCCESS donor 间只读复用。保留 current-checkpoint 优先、14 天 checkpoint/result 到期、SHA/schema、当前 owner/source 与 coverage/shape 检查；命中不复制、不延寿、不伪造 usage。原 writer 与持久 journal 继续执行；正文不跨任务复用，M5.2 batch 逻辑保持冻结。
- gpt-6-luna high 实现。首轮 51 项为 Adaptive 28/28、Coordinator 22 passed / 1 error；错误来自 lease 顺序测试 fixture。只复验受影响方法 1/1、exit 0，未重跑整批。唯一 reviewer B0/I0/O1；O1为文档同步项，由本次回写处理，未作回写后复审。
- 无 API/schema/migration/frontend 变化；未运行 PostgreSQL、backend full、package、真实 Provider、GUI、Docker 或部署。

### Overview M5.2 索引 batch 跨任务复用（2026-10-23；源码、定向验证与唯一审查完成；未部署）

- `index_batch_v1_SHA` 绑定 system prompt、indexData 与有序完整 AdaptiveRawUnit 记录；同 owner/scope/profile/algorithm 的 SUCCESS donor 可供给相同 batch，并继续验证 donor checkpoint 与其 generation input fingerprint 一致、SHA/schema、过期、来源与 coverage/shape。命中不派发 Provider、不复制 donor checkpoint、不延长寿命；目录和正文仍运行当前流程。
- gpt-6-luna high 实现/定向 Maven 验证49/49（Coordinator 22、Adaptive 27，exit 0）及唯一只读审查 B0/I0/O0。先前失败是 fixture 仍按读取序号8/9注入 writer checkpoint；新增读取后序号为14/15。只改 fixture，原断言保留，最终批次通过。
- 未运行 PostgreSQL、full suite、package、OpenAPI/SDK、真实 Provider、GUI、Docker 或部署；无 API/schema/migration/前端变化。


### 2026-10-23 Overview 全流程测试追踪导出

- 增加默认关闭、有界的 Overview 本地追踪采集器，显式开启后按 owner/run 导出结构化事件、汇总和 Markdown 报告；完整内容另设 opt-in。增加 backend-only Compose overlay，默认 Compose 拓扑不变。没有 API/schema/migration 或前端变化。
- focused 87/87、backend full 813/813、package、合成 Compose 配置与唯一只读 review 均通过；未部署、未调用真实 Provider、未完成 GUI 或业务内容验收。参见[实施计划](../archive/design-and-plans/plans/overview/2026-10-23-overview-test-tracing.md)。

### 2026-10-22 M5.1：完全相同输入的跨任务轻量索引复用

- 新生成任务先读取自身 checkpoint；缺失时，仅 ADAPTIVE_INDEX 可查询同 owner、scope、完整 input fingerprint、profile、算法和 prompt step 的 SUCCESS generation。读取同时检查 result 到期和 checkpoint 14 天有效期，以及 payload SHA/schema；使用前继续执行现行 Source/owner 校验和索引 coverage/shape 校验。
- 复用现有 overview_generation_checkpoints，只读命中，不复制缓存、不延长原条目寿命、不新增表或迁移。目录和正文仍执行当前生成流程；命中不派发 Provider、不伪造 usage，记录 ADAPTIVE_INDEX_CACHE_RETURN。预算预检识别可复用索引。
- 本小节只覆盖完整输入未变化时的新任务复用；资料局部变化、节点级依赖失效、目录/正文跨任务缓存及完整删除生命周期仍属于后续 M5，不能据此标记 M5 完成。现有前端流程保持。
- 验证：D 盘隔离源码运行 OverviewGenerationCoordinatorTests 21/21、OverviewAdaptiveGenerationTests 26/26，共 47/47，Maven exit 0。覆盖跨 owner/输入/profile 隔离、过期、损坏拒绝及生成链路跳过索引而继续目录/正文。当前为 H2/合成 Gateway 证据，未运行 PostgreSQL、全量测试、打包、真实 Provider、GUI 或部署。本轮依用户要求由主模型直接实现并检查，未启用子代理。
- 证据：D:/Temp/auralis-overview-m51-20261022/targeted-tests.log 与 handoff.md。更早前端回退的四项失败未由本轮处理；此前范围审计按用户最新要求暂置，尚无完整审计结论。
### Overview PC M4 新交互撤回与生成期间编辑保护（2026-10-22；源码、定向验证与唯一审查完成；未部署）

- 按用户决定撤回 PC job selector、candidate preview/publish/adopt、section reader 与新 job consumer 接线，恢复原 Overview 入口、SSE 自动生成和原同步/冲突流程。Server durable jobs、candidateInput formal PUT、publication/receipt、VERIFIED preview 与 section API 保留，PC 当前不消费，不列为后续必补 UI。
- 保留在途本机编辑冲突保护：本地 part/signature 在生成提交前复核；本机编辑时保留本地内容与冻结 mutation，AI 结果进既有 outbox 的 `OVERVIEW_GENERATION_EDIT_CONFLICT` 且不 PUT，显式选择仍走原 CAS/outbox。Browser fallback 写入共享 owner/device Web Lock；缺 Web Locks 时 fail-closed，SQLite事务路径不变。
- 回退源码最终控制21项，1110 protected paths 未变；唯一 reviewer I1 delta B0/I0。回退后检查分批：noEmit 0、cache/sync/deletion 55/55、generation 75/76；旧 rollback R4 首轮169/3F，之后race/UI定向4/4与1/1。4个未通过项：Stop aria-label旧fixture/source不匹配1项，asset-flow owner-switch/auth-refresh 3项（无旧baseline，未作历史归因）。批次不合并全绿。无回退后GUI、Provider、Docker、backend/SDK、full suite、部署或数据库操作。

### Overview M4 PC native job consumer（2026-10-22；回退前实现、验证与隔离浏览器流程的历史记录；未部署）

- PC 接入持久 Source/Subject ALL、OUTLINE jobs、VERIFIED 候选预览与显式 `candidateInput` 正式采纳；复用 formal CAS/receipt/outbox，保留 summary partial update 与原 mutation intent。FILE/TEXT/URL 在 source/scope/revision fences 通过时由既有 outbox PUT。自动 FILE/ALL recovery 使用确定性 SHA-256 request identity，digest 不可用时 fail-closed；PC SQLite 保持 v13，无迁移。
- Backend full 774/771P/1F/2E、affected 3/3；SQL 42P18 PG 修复用例 1/1、post-fix skipTests package Maven/Docker 0/0。PC full R4 745/716P/29F 的失败与归因保留；GEN 72/72、lifecycle 10/10 分批完成，Store/sync 30/30，noEmit/Vite 通过。唯一 source-type-fence delta review B0/I0/O0 new，原 O1 保留。隔离接口流程用合成 Provider；正式 Source/section v4 与 receipt 已读回。未部署；M5/M6 和最终兼容清理继续开放。

### Overview M3.4 正式发布与已验证分节预览（2026-10-22；源码、相关自动验证与唯一审查完成；未部署）

- 候选实现 durable publication intent → formal `overview_results` + exact write receipt transaction，per-part 原文输入 descriptor/currentness、bounded verified preview、formal outline/section reads 与配对 scope reconnect query。新增 V37 migration 候选；未改 PC/Mobile/generated OpenAPI/SDK。
- 另以允许 null 的 canonical list 修复 snapshot hash 中 SOURCE/SUBJECT shape 引发的 `List.of(null)` NPE，并补真实 snapshot 路径回归。PostgreSQL/backend/API artifact/package 与唯一 reviewer 相关门禁完成；首次 full run04 失败历史保留，相关失败组定向复验闭合，不声称 full suite 全绿。未部署、无真实 Provider/业务 DB/GUI 验收。剩余 M4–M6 与最终 unused-compatibility cleanup 仍 active。详情：[M3.4 计划](../archive/design-and-plans/plans/overview/2026-10-22-overview-m34-publication.md)。

### Overview M3.3 后台 job/control API（2026-10-22；源码、相关自动验证与唯一审查完成；未部署）

- 实现 /api/ai/overview-jobs、私有 V36 job/invocation schema、DB claim/worker 控制、稳定 deadline、pause/resume/cancel/reconcile 与精确 reservation lineage。raw budget UUID 保持原预算身份；invocation 记录 Guard 稳定派生的真实 ledger task UUID；未知派发 usage 继续 fail-closed/hold。完整候选需按 owner 与输入身份重校验后读取，不自动写正式 OverviewResult/KB/Review。M3.4 正式发布与分节预览、PC UI 留待后续阶段。
- 首次 full 752 tests / 724 passed / 19 failures / 9 errors；随后受影响的 67 个测试 61 passed / 1 failure / 5 errors，五组通过；最后 7 个失败/负向方法 7/7 通过，Maven native exit 0，外层 Docker runner exit 2 是 wrapper CRLF 退出参数问题。修复后没有第二次 full 全绿运行。-DskipTests package Maven/Docker exit 0，JAR SHA-256 efd0911f72c05c1ff8678706beab18daf9ada1a7638393300792c6000e85f234。运行态 OpenAPI/固定 7.13.0 双 SDK 与单方法 artifact compare 完成；PC type-check 通过，Mobile 两个既有 TS2339 保留。官方 OpenAPI 整脚本未运行。
- 唯一 reviewer 最终 BLOCKER=0 / IMPORTANT=0 / OPTIONAL=0。源码、相关自动验证和审查完成；未部署，未使用真实 Provider/生产业务数据库，未完成 GUI、真实用户流程或内容质量验收。完整验证见 D:/Temp/auralis-overview-m33-background-20261019/run/m33-final-validation-20261022.md，review D:/Temp/auralis-overview-m33-background-20261019/reviewer-final-report.md，candidate evidence reconciled 目录保留 44 条 manifest 及原 before/gap。

### Overview M3.2 私有执行 journal（2026-10-19；源码、相关验证与唯一审查完成；未部署）

- Adaptive Source/Subject 正文写作新增私有版本化 plan/node/call journal，并将节点级精确 reservation 关联、owner/fence 接管与校验后原子 checkpoint 纳入实现。未新增公开 API 或 Provider/SDK shape。
- 新增 V35 私有数据库迁移，不改变公开 API、Provider schema 或 SDK。后台 worker、public job/control API、暂停/继续 UI 和正式发布仍在后续阶段。
- 相关 backend/PostgreSQL 用例与 replacement package 完成；唯一 reviewer BLOCKER=0 / IMPORTANT=0 / OPTIONAL=0。full backend 737/731P/2F/4E 首轮结果保留，修复后只重跑对应六项及新增 PG 方法 1/1；没有修复后的 full-suite 全绿证据。未部署、未调用真实 Provider/生产业务数据库或 GUI。当时 M3.3 worker/control 尚未交付；现见上方 2026-10-22 M3.3 结案条目。M3.4 正式发布与分节预览仍待后续。

### Overview M3.1 分层目录规划（2026-10-19；源码、相关验证与唯一审查完成；未部署）

- 源码在单次目录请求不适配时对轻量索引 metadata 作有限层级整理；plan alias 通过私有有序映射展开回原始 units，沿用原 writer 分组和 M2 来源快照。保留原文、已验证正文及全部现行容量/Guard/预算限制。
- 相关验证和唯一 review 已完成。初始两类 batch 47/46P/1F，唯一失败方法后来单独 1/1 通过；没有第二次完整47项全绿。BLOCKER=0 / IMPORTANT=0 / OPTIONAL=0。不代表部署或真实 Provider、业务数据库、GUI、语义质量验收。

### Overview M2 稳定身份与原文关联（2026-10-19；实现、相关验证与复审完成；未部署）

- Server/PC 实现加入 server-owned outline node identity/content version 与 chunk-level source provenance。V34 仅追加两个可空 metadata 列，旧结果不回填；Provider 四字段 schema 不变。PG migration/transaction 回归通过（4/4），最终 OpenAPI 13/13，四个 nullable reference 的官方 schema/双 SDK 类型通过验证；package exit 0。
- Backend full clean 首轮记录 723 tests/1F/4E/0S（718 pass）；失败测试类后续定向通过，但未重复完整套件。PC full R4 首轮为 737/709 pass/28 fail，2 项 M2 问题修复后 sync 文件 27/27，另 26 项非 M2 基线失败保留。Mobile 仍有既有两个 Event SDK 类型错误。唯一 reviewer B0/I0/O0；未部署，真实 Provider、业务数据库、GUI 与语义质量验收未完成。

### 内容规模自适应总览 M1 核心链路（2026-10-19；源码、自动门禁与复审通过；未部署）

- 新增默认关闭的内部开关；Source/Subject ALL、OUTLINE 候选路径读取选定 READY 原文，构建轻量索引，经单次有界目录规划后按节写作并在应用内装配；SUMMARY 沿用现行短摘要。`SourceChunkRepository` 有界读取合计最多 500 条 active raw rows（含空白），以 remaining+1 sentinel 在 identity/hash/provider 前拒绝超限。公开 DTO/API、DB schema、OpenAPI/SDK shape 不变。
- 平台预算预检读取真实 TaskLease/Guard owner-fenced task snapshot，采用与 Guard admission 一致的 occupancy 规则；charged/reserved 与 audit count 分离，BYOK 不扣平台财务上限。
- focused attempt4 为 7 suites/175 tests、full attempt6 为 122 suites/711 tests，均 0F/0E/0S；Maven/Docker exit 0。唯一 reviewer correction delta B0/I0/O0。Package JAR 93,205,090 bytes / SHA-256 `E9637F9615EC6B7EB445C36CE18E89F7ACC9948965067832A18DD12543E6305B`；synthetic Compose false/true render 均 exit 0 且值匹配。证据及 baseline-relative review 包：`D:/Temp/auralis-overview-adaptive-20261018/`。未部署；真实 Provider、生产/业务数据库、GUI 和内容质量未验收。M3.1 已完成分层 metadata 规划及范围内验证/复审，M3其余后台 job 与M4–M6仍未交付。

### AI 用量来源与平台额度分离（2026-10-16；U1–U3 候选，统一验证待完成）

- 每次 Provider reservation 保存用途和实际凭据来源。平台来源及历史未知来源参与平台任务/窗口限额；BYOK 保留真实 actual/unknown/charged/reserved 审计和共有运行保护，但不扣平台额度。`/api/ai/usage` 保留平台窗口字段并新增来源分区 all-call 摘要。
- 新 operation policy 校验阶段、scope 方法与 Overview 输出角色；Overview BYOK 预检不再使用平台 24-call/524288-token 配额门槛。新增 V33 可空字段，不回填历史来源。统一测试、只读 review、迁移运行态与真实 Provider/GUI 验收待单独报告。

### 离线 usage reader 分离 actual usage 与 shadow coverage（2026-10-16；定向测试通过，未部署）

- JSON、分层 CSV 与 CLI 单独报告 ledger actual usage complete/unknown、missing shadow、matched shadow usage unknown 和歧义 join；`unknownUsageCount` 保留旧兼容语义。NULL actual 不回填，charged、错误统计、accuracy membership、INCOMPLETE 与 exit 2 不变。
- 离线 46-ledger / 7-event 复算：actual complete 46/46、actual unknown 0、shadow missing 39、accuracy 7。此修正确认报告覆盖缺口，不代表实际成本下降或估算已校准。

### RAG 长 chunk 证据片段选择（2026-10-16；定向验证通过，未部署）

- 对定义/含义类问题，citation 与模型共享的原文片段现可在有界 chunk 范围内按 query 选择相关连续窗口；未匹配时沿用前缀。单片段上限保持 400 字符，检索过滤、TopK、Prompt/Gateway 预算和 API/数据库契约不变。
- `AiRetrievalTests` 与 `PromptAssemblerTests` 定向 21/21 通过。真实 Provider、用户问答和 GUI 待验收。

### PC 学科总览离线冲突刷新重入保护（2026-10-15；定向测试和类型检查通过，GUI 待验收）

- SubjectWorkspace 仅对静默 Subject/LOCAL 自动解析，在初始化/刷新本地 Overview cache 前按用户、设备、Subject 与 revision 合并同一 in-flight 解析；FILE scope 和显式 LOCAL/REMOTE choice 继续走原解析调用。网络失败保留本地成果，guard 释放后既有后续触发可重试；404、鉴权与冲突语义未改。生产尾部 cache refresh 只在成功 resolve 后执行；测试中的失败尾部刷新是受控重入回调。
- 同步与页面回归 43/43，Vue TypeScript 检查退出码 0。没有修改 API、数据库、后端、FILE Overview 生成或预算流程。真实断网恢复与 Tauri/桌面 GUI 尚未验收。

### PC 文件登记上传弹窗进度生命周期与状态卡死修复（2026-10-15；已通过自动化测试与类型检查，GUI 待验收）

- 修复文件上传时因提前虚假上报 100% 导致的“未成功已显示导入完成”以及失败时弹窗卡死停留在 100% 的问题。进度条改为真实按资产导入、资料源关联及刷新阶段平滑递进，全流程确认成功后方标记完成；发生异常时显式重置进度为 0 并反馈错误。
- 自动化测试与类型检查已通过（`r4-register-file.test.mjs` 6/6，`vue-tsc -b` 0 报错）。

### PC 学科大纲编排独立性保证（2026-10-15；已通过自动化测试与类型检查，GUI 待验收）

- 在未生成涵盖全文件的学科总览时，编排/编辑学科大纲不再自动拷贝填充单文件或部分文件大纲，避免出现非预期的拼接内容；学科大纲编辑区默认以独立的「第一章 · 新建章节」供用户自主编写，同时保留下方各文件大纲的独立编辑卡片。
- 自动化测试与类型检查已通过（`r4-subject-overview-ui.test.mjs` 17/17，`vue-tsc -b` 0 报错）。

### AI 观测前置 Step 2：Compose shadow 开关、returned model metadata 与离线聚合工具（2026-10-15；full/package 与复审完成，未部署）

- Compose 与 `.env.example` 显式透传影子估算开关；内部 Provider metadata 与 Gateway 安全事件区分请求模型和实际返回模型。新增标准库 Node 离线工具聚合受控日志与 reservation 投影；未改公开 API、数据库、估算准入或硬预算。
- Provider/config/Gateway/security 定向 39/39、offline CLI 27/27，synthetic Compose true/false render 均 exit 0。D 盘冻结快照 full 为 116 suites / 674 tests / 0 failure/error/skip，Maven 与 launcher exit 0；package exit 0，artifact SHA-256 `723919B7517A21B7A1C458F8708B3E6BFDE1E70DCF2D3478A45BA2894204A236`，508 项 manifest 零差异。最终 reviewer B0/I0/O3，三项 OPTIONAL 保持未改。C 盘先前低于 3 GiB 门线及 runner 中断/失败尝试保留在[当前状态](../current/Status.md)与[attempt 4 报告](D:/Temp/auralis-ai-observability-step2-20261015/final/attempt3-pg-auth-fix/attempt4-report.md)；复审证据见[最终 review](D:/Temp/auralis-ai-observability-step2-20261015/review-report.md)。未部署、未调用真实 Provider、未采集生产 usage 或校准、未进行 GUI/业务验收。Overview 24 calls / 524288 tokens / 240 秒、Chat 2 calls 保持。

### 四项历史门禁问题修正与统一后端验证（2026-10-15 回写；round4 于 2026-10-14 通过，未部署）

- 将唯一 UTF-8 SHA-256 helper 移至 `knowledge`，Knowledge 与 Review 共用；模块依赖只保留 `review → knowledge`，哈希结果与业务事件/事务行为保持。
- 修正 completion failure-count、Account deletion timestamp round-trip 和 embedding resume 测试前提；另修正 Overview 测试构造器选择，并在隔离 runner 补齐 synthetic TLS keystore。没有改变 retry / 配额生产策略、API、DTO、数据库 schema 或 migration。
- 后端 clean test 115 suites / 666 tests、0 failure/error/skip；独立 package exit 0。四项复核为 B0/I0/O1；Provider、GUI、部署及业务验收仍单独待验证。详细证据见 [round4报告](D:/Temp/auralis-remaining-four-fix-20261014/final/round4/report.md)。

### 两项既有后端测试门禁失败修正（2026-10-14；历史仅测试文件定向验证，后续 round4 full 已通过）

- 测试迁移断言随现行schema更新到V32；Jackson namespace guard识别任意空白格式且只允许Jackson 3保留的annotation namespace；AI quality fixture改用Jackson 3 databind类型。
- 三类初始定向验证11/11、exit 0；reviewer提出I1后只重跑Guard 2/2、exit 0并接受关闭，最终review B0/I0/O0。两次验证分别报告，不相加。
- 原完整clean test仍是659 tests / 5 failures / 1 error / 4 skipped、exit 1，未重跑；仅本次对应的前两项定向关闭，其余4个baseline failure/error仍待处理。原4 skip另有隔离PG 4/4补跑证据，不改变full统计。无生产DTO、API、依赖、schema、配置变化，未部署。

### AI 执行预算治理、Overview 有界恢复与 Chat 安全回放（2026-10-14；阶段0–3实现与定向验证记录，当时全量门禁未通过；后续 round4 已通过，未部署）

- Guard 增加七类预算拒绝安全诊断；Gateway 增加按字符类别的 shadow estimator，版本标记 `char-category-v1-uncalibrated`。新增开关 `auralis.ai.shadow-token-estimate-enabled` / `AURALIS_AI_SHADOW_TOKEN_ESTIMATE_ENABLED`，默认 true，false 仅关闭影子日志。旧估算及真实预算、预留和上下文行为保持。
- 有效 Provider/model 与 capability known/unknown 增加安全可观测；`deepseek-chat` 上下文仍 unknown，DeepSeek thinking disabled 仅用于 structured Overview wire 请求。新增合成 Chat 流程故障回放测试，不修改 Chat 生产实现。
- 新增 `AURALIS_AI_OVERVIEW_OUTPUT_RECOVERY_ENABLED` / `auralis.ai.overview-output-recovery-enabled` 默认 true 配置，作为 Overview 新增 truncation split / JSON repair 的回退开关；false 保留既有 semantic/no-progress。latest Recovery + Overview 定向101/101及PG replay 1/1覆盖checkpoint复用、精确transition和重复REDUCE group的真实Gateway/Guard/SQL账本；Provider registry为合成响应。
- 阶段0/1隔离定向62/62、Chat合成回放8/8。唯一只读review最终B0/I0/O0。profile-corrected full clean test 114 suites / 659 tests / 5 failures / 1 error / 4 skipped，实际exit 1；六项均由实际HEAD定向对照重现。独立 `package -DskipTests` BUILD SUCCESS、exit 0。整体门禁未通过，不能写成全量验收通过。
- API DTO、数据库 schema 与 migration 未变；新增的有界恢复请求仍通过既有 Gateway/Guard 逐次计量，任务硬预算上限未提高。未部署、未迁移、未调用真实 Provider。模型清单核对、生产影子校准、GUI和业务验收仍待完成。完整命令和归因见 `D:/Temp/auralis-ai-governance-20261014/final/report.md`。

### Overview recovery checkpoint no-progress 修正（2026-10-13；尚未部署）

- Recovery compaction 使用独立 full/partial purpose，避免重用历史普通 REDUCE 的同输入检查点。只有严格缩短输入的 fresh/cached 压缩结果可继续；fresh 无进展输出不保存，仍返回 `OVERVIEW_REDUCE_NO_PROGRESS`。
- 隔离 Service/Recovery、Coordinator、DynamicBudget、Gateway 与取消测试 141/141 通过；包含临时 PostgreSQL legacy-poison checkpoint 回归及 budget lineage 保持。此验证不代表部署或真实业务恢复验收；Subject JSON_PARSE 风险仍开放。

### Overview JSON 拒绝原因的安全诊断（2026-10-13）

- 当前工作树 provider 响应验证失败时记录固定拒绝类别、异常类型及 JSON 位置，不记录原始响应、异常消息、字段值或 Jackson path；原错误码和验证规则不变。本次隔离定向测试 83/83 通过。日志实现该轮未由 Codex 部署；之后用户更新镜像并 retry，但后续请求在 Provider 响应校验前以 no-progress 结束，运行镜像 class/source provenance 未核验，真实 JSON 拒绝原因仍待证据。

### Overview 动态预算、错误分类与私有恢复（2026-10-13；实现与指定 P4 记录，后续运行观察见下）

- 合法中间内容的 5200 字符目标改为软目标；Subject 按语义字段拆片与精确分包。实际序列化 prompt 的 12000 字符上限、4608/6144 输出上限和既有 Gateway 限额继续生效。UTF-8 byte estimate 只作保守估算。
- API Error enum 新增 `OVERVIEW_PROMPT_BUDGET_EXCEEDED`、`OVERVIEW_PROVIDER_OUTPUT_TRUNCATED`、`OVERVIEW_RECOVERY_EXHAUSTED`。V32 已接入 Overview Service；有效规范化 UUID 可持久 replay，失败预算 lineage 与 recovery count 按 generation 累计，actions 按安全集合去重。成功 response payload 14 天后清理，request/generation/budget metadata 保留，过期 request ID 不可复用；2026-10-13 主代理只读观察到业务库 Flyway V32 `success=true`，本执行器未执行迁移或验证运行 class/source provenance。
- 生成endpoint只返回候选，正式结果仍经独立PUT保存。持久waiter现保留六种用量错误的status/retry/reset；最终需求核对后fresh门禁210/210，test/package exit 0。唯一首审B0/I1/O0，I1经执行代理修复及主代理裁决关闭；同reviewer复审工具受限，不冒称独立复审。
- 指定真实Source ALL / 单输入Subject ALL均成功，9/1calls、69.595/6.414s，共60,035 charged tokens，零活动预留/租约，未触发额外恢复；主要正文主题初步覆盖。真实usage进入原账本，私有V32与候选仅TEMP，未执行正式PUT、业务迁移、提交/推送或部署；GUI、多文件与真实恢复/取消待分别验收。详见[实施计划](../archive/design-and-plans/plans/overview/2026-10-12-overview-dynamic-budget-recovery.md)。

### Subject ALL MAP2 JSON_PARSE 只读运行观察（2026-10-13）

- 2026-10-13 03:34:43 首次只读观察到 backend 镜像 `sha256:f0c3e886175dadd709876988c7570a395793ae67a637545cbe5825a570317593` healthy，业务库 Flyway V32 `success=true`；之后用户更新镜像并 retry。各次运行镜像 class/source provenance 未核验。
- 用户实际 Subject ALL generation `18226745-50bc-4ce9-be30-97cf8c61f57c` 的 MAP1 JSON/schema 成功并有一个 checkpoint；MAP2 response 5076 chars、2511 output tokens、finishReason=stop 后在 JSON 相关 validator 失败，generation FAILED / 无结果。两笔账本 reservation 均已结算 COMPLETED，charged 总计14304；unknown dispatch / 活动 reservation / TASK owner/lease为0。没有原始响应或可恢复的准确 Jackson 错误位置，未据此修改 validator；当时尚无 retry 证据，后续用户已实际 retry，结果与限制见实施计划。详细限制与只读证据见[实施计划](../archive/design-and-plans/plans/overview/2026-10-12-overview-dynamic-budget-recovery.md)。

### 聊天资料检索默认开启（2026-10-12；跨端代码与定向验证完成，业务待实测）

- 新聊天始终使用现有检索流程，请求 DTO 不再包含 `retrievalEnabled` 字段；历史 JSON 中的该额外字段按当前 Spring mapper 行为忽略，不会关闭检索。无命中可继续生成并返回空 citations；embedding 配置缺失或 Provider 失败继续使用现有错误路径。现有检索 scope 与过滤规则、AI 限额保持不变。
- `mvnw -B -ntp clean test -Dtest=AiStreamingTests,AiStreamingControllerTests,AiMessageCommandValidationTests,AiRetrievalTests,OpenApiArtifactTests` 退出码 0，47/47；`scripts/check-openapi.ps1` 退出码 0，包含 OpenAPI artifact 12/12 与 PC/Mobile SDK 标准生成对比（12/12 已计入前述 47/47）。
- PC 已移除关闭模式及个人中心语义搜索开关，保留当前文件 AUTO / 显式文件 / 当前学科范围；打开未就绪文件仍等待处理，全学科 READY 计数与失效选择保持一致。Mobile 请求字段与 Tablet 关闭控件已删除，历史正文/引用和本地数据保持。
- 最终 PC 57/57、type-check / build，Mobile 24/24、static / H5 build 退出码 0。PC static 的既有 Rust 固定地址规则和 Mobile type-check 的既有 Review API 两个 TS2339 均在干净 HEAD 复现，未扩改。
- Antigravity MCP 提供部分前端候选，Luna 与主 Agent 按失败证据补齐，Codex 唯一只读审查最终 BLOCKER / IMPORTANT / OPTIONAL 均 0；真实 Provider、GUI/真机未运行，本轮未提交、推送或部署。额度未调整，完整证据见[实施计划](../archive/design-and-plans/plans/ai/2026-10-12-rag-always-on.md)。

### 学科总览合法输入分批（2026-10-12；代码、定向验证、只读审查与本机更新完成）

- 修复各文件总览合法但合并超出 12000 prompt 上限时立即 `VALIDATION_FAILED`：大 Subject 资料完整分片 / 精确分包后归纳合并，小请求保留 direct。
- 分片分配独立资料并检查规划期限；仅中间 Subject MAP 附加 compact 指令。原模式 / alias / UUID 映射、用量与并发、Source 流程、数据库及接口字段保持。
- 全新隔离编译 Surefire 73/73、主树与已测源码精确一致，唯一只读审查 0 B / I / O；wrapper 未保留 shell exit 明确登记，早期增量和 72 项阶段不计最终总数。部署与真实 Provider / GUI 分别验收，详见 [实施记录](../archive/design-and-plans/plans/overview/2026-10-12-subject-overview-prompt-batching.md)。
- 香港 13:57:23 仅 backend 更新为 `a5a50bb7…`，构建 / 替换退出码 0、healthy / readiness 200，部署 Service class 对应已测版本；db / MinIO、Flyway V31 与现行额度策略保持。真实生成待用户实测验收。

### Embedding 额度排除与单人测试默认值（2026-10-12；代码、相关验证及本机部署完成）

- 文件摄入与检索 embedding 不计用户小时 / 每日及系统每日 token 配额，个人中心 charged / reserved / remaining 同时排除历史 embedding；原 reservation 与 actual / charged 审计保留，无回填或清账。
- 单人小时 / 日默认提高 10 倍为 1000000 / 2000000，三份配置同步；系统日 2000000、全局 / 用户并发 4 / 2 及任务 / 请求资源保护保持。无新 API 字段、环境变量或数据库迁移。
- 代码、配置验证与本机部署状态及业务验收独立记录，详见 [策略计划](../archive/design-and-plans/plans/ai/2026-10-12-embedding-quota-exemption-and-test-limits.md)。
- 相关后端隔离 53/53、最终受影响两项 2/2（重叠）、配置 6/6 及 Compose 校验通过；不表述为主树全量或真实 GUI / Provider 通过。
- 唯一只读审查 0 BLOCKER / IMPORTANT / OPTIONAL。本机 backend 香港 12:57:12 更新为 `31f7dec…`，健康 / 有效额度 / Guard 字节码排除确认，db / MinIO 和 Flyway V31 保持；旧镜像留回滚 tag，未删除历史用量。GUI / Provider 业务由用户实测验收。

### 大 PDF embedding 用量解析与 PC 上传同步（2026-10-12；代码与定向验证通过，新补丁未部署）

- SiliconFlow embedding 适配器保留合法 `completion_tokens`，含 0；完整 usage 按实际值结算，缺失或非法字段仍保守。保留全部 AI 额度与并发限制、历史账本及现有检查点流程。
- PC 初始化资产队列后后台唤醒上传，普通 push/pull 不再等待上传结束；安全日志、会话隔离及 Asset 完成后才释放 Source mutation 的顺序保留。
- 后端五类定向 56/56 在源码与主树相同的隔离构建通过；PC 最终四项回归、actual-store probe、类型检查和构建通过，早期完整相关套件 51/51 不与四项累加。PC 静态门禁仍因既有 Rust 固定地址扫描失败。Antigravity 委派无实现产出，最终由 Luna 执行最小修改。
- 原部署在香港 11:00 自然恢复该 PDF，42 个 chunks 激活、Source READY，此为原调度和检查点续做的只读现场验证。新解析补丁实际结算、桌面上传期间其他实体/跨设备同步待部署后验收，详见 [诊断与修复](../archive/design-and-plans/plans/ai/2026-10-12-pdf-ingestion-quota-and-sync.md)。

### PC 头像本地缓存与断网回退（2026-10-12；代码实现，GUI 待验收）

- 头像 Blob 按用户 ID 缓存于 IndexedDB；顶栏和个人中心先展示本地副本，再尝试云端刷新。网络故障时保留头像，云端明确无头像、用户重置或退出登录时清理对应缓存。
- 上传成功后将已接受的图片写入本地缓存并立即显示；账号切换与迟到请求不会覆盖当前账号头像。
- `npm.cmd run type-check` 退出码 0；本轮未运行测试。真实桌面端重启后断网显示待人工验收。

### PC Timeline 离线排期（2026-10-12；代码与定向命令验证通过，真实环境待验收）

- Timeline 插入、顺延与换位改为本地原子事务，任务投影和一条稳定 ID 的 Sync 命令一起保存。离线时继续保留操作，恢复网络后幂等推送；服务器拒绝或版本冲突时以当前 Task 数组恢复本机排期并通知用户。回执缺少本地受影响任务时，先验证完整快照再结束命令；快照失败会将命令释放回待同步队列。
- Sync push 增加 `SCHEDULE_INSERTION`、`SCHEDULE_SWAP` 入站命令，复用 TaskService 现有校验和事务，并校验 payload 源 Task ID/baseVersion 与外层 mutation 一致。换位目标 Task ID/version 缺失时记为幂等的 `REJECTED/VALIDATION_FAILED`。V31 扩大 inbound mutation 列并放宽 CHECK，change log 仍记录普通 Task `UPDATE`；OpenAPI 与 PC/Mobile 生成类型已同步。pending fence 与 SQLite 快照替换在同一事务内完成；多条排期拒绝均逐条通知。
- 浏览器 LocalRepository 的状态改写要求 Web Locks API 并通过同源锁串行化；缺少该 API 时拒绝 localStorage 写入，以保护整份状态。共享 localStorage 跨 repository 交错回归已覆盖锁下竞争和无锁失败。四个 PC 定向套件现为 173/173（含缺失换位目标 ID 且快照暂时失败的恢复重试）、LocalRepository 单套 35/35、`npm.cmd run type-check` 退出码 0；Server Sync/Schema/Task controller 定向 Maven 测试 34/34，独立 `OpenApiArtifactTests` 12/12；只读复审 BLOCKER=0、IMPORTANT=0。`check:r4-pc` 命中未修改 Rust 文件中的固定本地地址规则；`check-openapi.ps1` 的运行时 artifact 检查在 JUnit discovery 失败，报 `NoClassDefFoundError: JsonNode`。本轮未部署；真实 Tauri/断网恢复验收待完成。

### PC 任务截止纯日期旧值兼容移除（2026-10-11；定向测试、类型检查与只读审查通过）

- 截止解析只接受带时区的真实 instant，不再把已存裸 `YYYY-MM-DD` 当作当地日末；非空无效截止值拒绝新排期。Store 读取保留旧截止值，未改截止的资产字段编辑保留原值；TaskCreateDialog、Store 和资产库的明确用户日期输入仍按当地日末转换。
- 测试账号注入文档新增精确 `dueAt` 提醒：当天截止按目标时区转成当地日末再提交，排期结束不得晚于该 instant，插入 API 不负责修正已有任务。
- 未更改任务数据、API/数据库字段或迁移；定向 Store/截止规则测试 92/92、类型检查退出码 0，Codex 只读审查 BLOCKER=0、IMPORTANT=0、OPTIONAL=0。构建与 GUI 本轮未执行。

### 学科总览最终 MAP 用量误拒绝（2026-10-11；代码与相关验证通过，未部署本轮修复）

- 对齐 Overview MAP/REDUCE 与既有最终输出 6144 token 上限，修复合法学科直接生成及单批文件生成在预留前被 4608 阈值拒绝的 `AI_REQUEST_BUDGET_EXCEEDED`（413）。6145 仍拒绝，中间输出 4608、聊天及全部额度/并发/任务预算继续适用；没有修改数据库记录、迁移、配置或接口。
- Overview 失败日志保留六类已知安全用量码，未知码仍通用回退；JSON/SSE 原有真实错误码传递保留。主树定向 19/19、本机 SSE 1/1，追加 TASK 释放断言后集成 2/2（重叠）通过；运行账本两次只读快照没有历史预留占用。
- 唯一只读审查 BLOCKER=0、IMPORTANT=0；OPTIONAL=1 是诊断报告 evidence 索引 SHA 更新项，六项源码/测试与已测 hash 一致。完整命令、抛出位置、生命周期和运行镜像证据见 [诊断与修复](../archive/design-and-plans/plans/overview/2026-10-11-overview-usage-limit-diagnosis.md)。本轮未提交或部署，真实 PC/代理/Provider/GUI 验收待新修复进入运行 backend 后完成。

### Overview 重新生成 406 协商失败诊断（2026-10-11；代码与回归测试更新，本机容器仍待重建）

- 现场异常来自旧 backend 镜像（2026-10-09 构建）与当前 PC Overview SSE 请求协议不一致：旧 `AiController` 直接返回 JSON DTO，无法满足 `Accept: text/event-stream`；Provider 与生成阶段已成功，失败发生于 MVC 响应写出。DeepSeek、JSON 解析和 Schema 校验逻辑未改。
- 当前工作树的 Overview Controller 已有 JSON 默认响应及 opt-in SSE；新增 JSON Controller、PC 实际 Accept 下的 SSE 终态、以及不可接受格式 406 回归。全局异常处理器不再把 `HttpMediaTypeNotAcceptableException` 兜底成 500，返回 HTTP 406 `NOT_ACCEPTABLE`。后端聚焦回归 15/15、运行时 OpenAPI 11/11 通过。
- `CACHE_RETURN` 仅为日志阶段，不持久化结果。客户端只有收到响应后才保存；同一失败后的手动重新生成会形成新请求并可能重复 Provider 调用/用量。新增持久幂等回放不属于本次最小响应修复。
- 运行中的 Docker backend 尚未更新；命令验证不能替代更新后的本机 HTTP、真实 Provider 或 PC GUI 验收。

### Overview 硬期限与取消（2026-10-11；代码、相关自动验证与只读审查通过；真实环境待验收）

- 同一 Source/Subject Overview POST 增加可选 SSE 心跳与终端事件，保留默认 JSON。入口绝对期限扣除预检和排队，主动关闭当前 Provider socket；共享 Source 保留原 owner 期限和其他消费者需求，未知已派发用量按 B 保守结算。
- PC 学科、文件和总结生成提供“停止”；切页释放页面消费者，后台任务继续，runtime/account/修订与删除取消旧工作。真实 SQL 保存增加可选同步 guard，提交前取消回滚本操作 cache/outbox，进入提交后保留成功成果；已有自动缓存广播和并行视图精简保留。
- 单一审查补修 SSE 503 映射、DNS 有界取消和写入名额竞态；固定 DNS 4 线程/8 队列，writer 8/8，SSE 名额保留到实际 worker 和全部写入退出。后端组合 124/124 与 PC Overview 72、cache 14、sync 22、runtime 20、UI 16 项相关回归通过，计数与初期套件重叠；最新增量、类型/构建和源码 hash 见 [实施计划](../archive/design-and-plans/plans/overview/2026-10-11-overview-hard-timeout-cancellation.md)。运行时 OpenAPI 与两端 SDK 已同步。
- 本机 TLS/TCP 已自动验证；同步 JDBC/数据库锁不能强制取消、原生 DNS 可能仍占固定 slot。Mobile 旧 Review 两处类型错误另行迁移，GUI、真实代理/Provider 和运行态部署待验收。本轮无数据库结构、依赖或生产配置变化，未部署。

### 复习旧接口与 FSRS Lite 调度器移除（2026-10-11；PC 迁移与定向验证通过）

- 删除服务端 `/api/reviews/due`、`POST /api/reviews/events`、`GET /api/reviews/history` 及 FSRS Lite 动态间隔调度代码；保留 `/api/reviews/states` 和生命周期复习接口。数据库结构未变，`review_events` 仍供现有统计查询读取。
- PC 移除旧接口 wrapper、旧事件回合与旧历史读取，仅同步生命周期命令和历史；本地复习统计不再合并旧事件。
- 后端编译、路由/lifecycle 定向测试 15/15、OpenAPI 10/10、OpenAPI/SDK 检查、PC 复习定向回归 132/132 与 `node node_modules/vue-tsc/bin/vue-tsc.js -b` 类型检查通过。
- 按本轮范围未迁移 Mobile / Tablet；它们仍使用已删除的旧路由，迁移完成前复习请求不可用。未部署。

### AI 持久配额与个人中心额度（2026-10-11；代码、相关自动验证与只读审查通过，未部署）

- Chat、Overview、embedding、连接测试与模型元数据查询统一进入 Provider gateway，新增 V30 持久预留/结算、跨实例全局/用户并发、小时/每日额度及任务累计预算；缺失 usage 保守计账。users-first 准入/预留/派发授权与原子成功结算关闭账户停用、级联锁序及 owner/lease 竞态，网络调用保持事务外。
- ingestion 完成批次持久保留为 inactive 检查点；配额等待只延后领取，普通 failure 与单调 claim attempt 分开，跨窗口只继续剩余批次，完整后原子激活。硬预算超限成为明确终态；有界 MVC async 与安全错误提示保留显式重试。
- PC、Mobile、Tablet 现有个人中心显示本人小时/今日额度、已用、在途预留、剩余及当地重置时间；加载/失败/账号切换隔离，Mobile 额度请求沿既有 401 refresh 路径。运行时 OpenAPI 与两端 SDK 同步。
- Luna 管理实际 Antigravity 前端候选并按真实失败补修；核心 31/31 + PG 锁序 4/4、业务 147/147、最终受影响组合 37/37、真实 V29→V30 升级 1/1、OpenAPI 9/9、前端行为 8/8 与协议 24/24、两端类型和隔离 PC/H5 构建通过，计数有重叠。全量 Modulith 和 PC deadline 的既有失败单独登记；真实 Provider、GUI/设备与发布未验收，未提交或部署。完整证据见 [B 实施计划](../archive/design-and-plans/plans/ai/2026-10-10-ai-usage-guard-b.md)。

### AI 伴读来源、Overview 时限、embedding 分批与匿名质量基线（2026-10-10；代码与相关自动验证通过）

- 历史与流式回答显示实际 citation 的去重文件名，以普通文本渲染；正文 Markdown/公式和参考范围交互保留。
- Overview 增加默认 240 秒合作式任务 deadline、剩余 response timeout 与迟到结果拒绝；embedding 按 32 条/32768 UTF-8 文本字节分批，校验并归位响应 index，全部向量验证后才切换 generation。批前后短事务续租，锁后读取 Clock 拒绝已过期或被接管 claim；没有新增表、迁移或公开 DTO。
- 新增八个匿名质量样例、实际 chunk/hash/scope 契约测试和离线 runner；评分模板全部未评分，真实模型质量未验收。
- Luna 管理 Antigravity 生成来源展示并补强回归；PC 相关 27/27、type/build 与 Overview 静态 48/48 通过，完整 R4 679/680 与既有 Rust 静态失败分开记录。后端首轮聚焦 89/89、兼容增量 31/31，锁竞态补修最终 Job/Worker 18/18、配置 5/5 通过；质量离线 3/3 通过。单一 reviewer 已通过共通代码与文档审查；完整持久配额已按 [B 实施计划](../archive/design-and-plans/plans/ai/2026-10-10-ai-usage-guard-b.md) 实现，尚未部署。合作式 deadline 的持续 I/O 中断、真实 Provider/网络和 GUI 独立待验收；任务临时 PG 后续证据单独记录在 B 计划。证据见 [共通实施](../archive/design-and-plans/plans/ai/2026-10-10-ai-important-fixes.md)。

### 自测复习空启动保护（2026-10-10；代码与自动验证通过，客户端待验收）

- 自测启动校验实际 5/10 数量和卡片；Store 拒绝空队列，缓存空轮次显示错误，避免直接显示“完成 0 个”。保留当前活动候选池、独立数量选择与配色。
- 开发时更新复习 Store 完整刷新页面，重新加载动作和本机正式状态；正式学习记录/outbox 保留，临时轮次按既定刷新失效处理。
- 主树相关回归 107/107、force type-check 与隔离 Vite build 通过；未改 SubjectWorkspace 静态断言失败单独登记。实际 Antigravity 委派、Luna 必要补修、根差分/命令验证与 GUI 边界见 `D:/Temp/auralis-voluntary-review-zero-fix-20261010/`。未部署。

- 补齐切页恢复、换学科及本地读取失败重试的加载保护；主树最终 107/107，类型及隔离构建通过，同一只读 reviewer 最终 BLOCKER/IMPORTANT/OPTIONAL 为 0。真实桌面验收仍独立待完成。

### PC 任务截止日期与排期一致性（2026-10-10；代码与自动验证通过）

- 日期选择按本地当日日末保存 UTC 截止值；带时区午夜/日末不再被重新解释。完整任务结束时间仍必须不晚于截止，前端与 Server 采用相同 instant 判定。
- 资产库显示本地截止日期，未改日期的标题/备注编辑保留精确截止；先清空再重选日期可纠正旧值，不批量改写任务。
- 实际主树 PC 669/669、HK专项95/95、UTC/LA各7/7、type-check/build通过；唯一只读审查无 BLOCKER/IMPORTANT。Antigravity地区失败后由Luna实施，仅应用七个授权文件并保留用户已有改动。未部署，GUI/Tauri/HTTP独立待验收；已知静态扫描失败及C副本清理遗留见 [记录](../archive/design-and-plans/plans/learning/2026-10-09-task-deadline-date-consistency.md)。

### 学科复习与统计完整本地使用（2026-10-09；代码与自动验证通过，真实环境待验收）

- 五类现有生命周期命令新增可选真实 occurredAt 和 expectedStateAbsent，历史声明 protocolVersion=2。事件时间用于排期/统计，时间倒退/超未来、状态存在性、当前资源版本及正文仍校验；省略新字段的请求指纹保持原结构，已有回执不改写。
- effectiveReview/history 返回初选前 schedulingBaseline，legacy event 返回真实 firstLearning，支撑本地确认和历史聚合；无新服务端端点、表或迁移。运行时 OpenAPI 与 PC/Mobile 生成类型同步。
- PC两页从现行本地仓储读取，离线完成学习/反馈/排期/统计；schema v12原子保存正式数据与独立FIFO outbox，联网且核心KB收敛后补传，正式数据跨重启、临时轮次仅切页恢复。保留当前用户布局，专注仍仅个人页。
- Service最终相关32/32、独立OpenAPI9/9、SDK生成通过；PC最终R4 664/664、类型/两项学科静态/build退出0。Antigravity两轮生成部分产物，第二轮10分钟print-timeout；Luna按真实失败补修并守卫应用20路径，主Agent接手最终审查，补闭无账号旧缓存回退与本地提前/最终确认排程不一致。
- 唯一reviewer完成初审后因使用额度中止，最终检查由主Agent完成；未把初审写成全任务独立审查通过。既有`check:r4-pc`固定本地地址误报及范围外用户diff空白保留，具体证据见本轮计划。
- 未部署；现有运行服务须重建后才支持新离线协议。PC派发前将检查history版本，旧服务保留待同步记录。命令证据与范围见 [本地实施](../archive/design-and-plans/plans/learning/2026-10-09-review-stats-local-first.md)，真实Tauri/HTTP/多端验收独立。

### 学科复习、三段学习与掌握退出（2026-10-08，代码、相关自动验证及只读审查通过）

- PC接认识/模糊/忘记初选、正文核对下一个/记错、阅读→隐藏回忆→核对、模糊组尾一次巩固。新三态为待学习/待复习/已掌握，掌握率使用实际已掌握数量；学习完成与有效复习独立统计，专注仅个人页。
- Service新增生命周期命令/审计、原样幂等回执与同次结果纠正；首次3天、模糊1天、忘记/重学10分钟，后续7/14/30天及最终核对掌握退出。正文hash/版本、父行锁序与内容失效保护保留当前账号/资源边界，旧端五值事件和旧历史不改写。
- V29新增Review状态列、命令与有效结果表，旧进度不推断毕业；预置FSRS_LITE/1关闭跨Subject首学参数竞争，已有同版本ID/JSON保留。锁后Subject归属重查拒绝移动交错。临时PG空库迁移/竞争及V28升级保留验证通过；主业务数据库/运行容器未部署，使用新端点需按现行部署流程重建后端并应用V29。
- 今日队列按dueAt排序、未来项有独立提前练习入口；跨设备新/同reviewId、正文变化及legacy清空ID后的过期命令可结束重开，history等待期间新初选不会被覆盖。最终PC专项63/63、type/两项静态/build退出0；Service相关25/25、最后H2 14/14、初始PG2/2和三条新增PG定向各1/1，OpenAPI9/9及两端SDK一致。
- Antigravity实际完成两个Pane配色，完整差分审查后仅合并scoped样式体，保留当前用户布局和后续业务补修。唯一只读reviewer BLOCKER=0、IMPORTANT=0、OPTIONAL=0。GUI/Tauri/真实HTTP与双设备另行验收，未提交/暂存/部署；完整命令、证明范围和工作树保护见 [本轮实施](../archive/design-and-plans/plans/learning/2026-10-08-review-learning-mastery-implementation.md)。

### PC 复习卡片两项反馈（2026-10-08）

- 先按标题回忆，再展开正文核对；反馈提供“下一个”（GOOD）与“记错了”（AGAIN）。首次评分成功后推进，记错重新排到队尾，同轮后续巩固不重复调度或增加正式复习量。
- 沿用现行接口、调度与重试；历史事件仍按原评分显示。保留当前计划卡片与统计日历，本轮源码改动为 ReviewPane 和对应测试。
- 最终专项 41/41、较早 R4 595/595，类型/两项静态/build 退出 0；最后测试断言增强由随后专项覆盖。唯一只读 reviewer 本轮 BLOCKER=0、IMPORTANT=0、OPTIONAL=0。未提交、暂存或部署，GUI/Tauri/真实 HTTP/多端待验收；完整证据见 [实施补充](../archive/design-and-plans/plans/learning/2026-10-08-subject-review-stats-implementation.md)。

### 学科复习与统计基础页面（2026-10-08）

- 新分支 `codex/subject-review-stats`：学科侧栏新增复习、统计，复用现行路由，原普通任务与知识块跳转保留；移除 Timeline 失效的旧复习任务生成器。
- 复习支持完整学科状态分页、新学习/到期/已安排、5 / 10 分组、标题回忆/正文展开、四档评分、跳过、历史耗时与组结果。每轮首次非 SKIP 评分安排日期，后续巩固只改内存；切页恢复队列与 pending，刷新/重启/会话变化清除。
- 正式评分固定原事件重试，冲突先重读再确认；学科成功删除在页面卸载后也清理缓存，失败保留，旧账号及迟到请求受作用域保护。统计包括资料、KB、任务和近 7 / 30 个本地自然日的正式复习表现，专注仍只在个人页。
- 本轮按用户要求未调用 Antigravity，由 Luna 执行 Agent 直接搭简单前端框架及 Service；界面细节由用户后续调整。无新依赖、迁移或核心同步字段，两端 SDK 仅由现行生成流程更新。
- 最终 PC 专项 40/40、R4 594/594、类型/两项静态/build 通过；Service 新专项 4/4、相关 19/19、OpenAPI/SDK 门槛通过。唯一只读 reviewer BLOCKER=0、IMPORTANT=0；一个未同步 KB 列表/计数细节 OPTIONAL 保留。
- 全量 Maven 386 项仍有既有 V21/V28 断言 1 failure、无 Docker 的容器测试 6 error；GUI/Tauri、真实 HTTP/PostgreSQL 并发与多端待验收。原工作树修改与删除保持，未提交、暂存或部署；完整命令和证据见 [实施记录](../archive/design-and-plans/plans/learning/2026-10-08-subject-review-stats-implementation.md)。

### PC / Service 三项优先问题修复（2026-10-07）

- 核心同步、文件导入和上传队列固定发起 owner/device/session 代际，账号切换后旧操作不能使用新凭据或更新新投影，保留原账号待同步内容。普通请求与同步共用刷新单飞；当前刷新失败进入登录，迟到失败不影响新会话。
- FILE 引用与保留期清理共用 owner Asset 悲观锁；清理在独立事务中重查引用并提交 ORPHANED 后才删对象，恢复先提交保留对象，清理先提交拒绝引用，删除失败支持后续重试。
- Profile 专注徽标改为“本周专注天数”，对应现有每周计数。标签实际由 Antigravity Gemini 3.1 Pro High 生成，账号边界和后端由 Luna 实现；唯一只读 reviewer 最终 BLOCKER/IMPORTANT 为 0。
- 最终 PC 专项 107/107、R4 554/554、类型/两项静态/构建通过；Service 真实 PostgreSQL 并发 5/5、相关 56/56，全量 clean test 392 项保留既有迁移断言 1 failure。GUI/Tauri、真实 HTTP/生产 MinIO 与双设备待验收；其余功能依用户要求逐项讨论，未提交或部署。完整命令、日志和工作树保护见 [实施记录](../archive/design-and-plans/plans/learning/2026-10-07-priority-function-fixes.md)。

### PC 时间轴放置与交换修复（2026-10-07）

- 迟到插入/交换响应不再覆盖已同步的较新版本或复活墓碑；在线响应在原提交边界合并，页面从当前 Repository 重建，缓存失败继续普通同步恢复。
- 按天排期补齐 22:30 合法末槽，仍检查完整时长、截止和冲突；结束晚于 22:30 本身允许。
- 交换前校验实际新起点仍处于 08:00–22:30，晚间异长和跨午夜越界整组拒绝，正常边界交换继续可用。
- Luna 管理 Antigravity 生成并完成有证据的必要补修/回归；最终专项 127/127、PC 542/542，类型/两项静态/构建通过，唯一只读 reviewer 本轮 BLOCKER/IMPORTANT 为 0。用户工作树与原 OPTIONAL 登记保留，真实 GUI/Tauri、HTTP 与双设备待验收，未提交或部署；见 [实施记录](../archive/design-and-plans/plans/frontend/2026-10-07-timeline-placement-and-swap-fixes.md)。

### PC 时间轴日期与跨天拖放修复（2026-10-07）

- 按槽排期和同日改期在入队前保存具体本地日期，等待期间切日不会改变请求落点与当天窗口；完整日期下的同日改期不再误报源排期变化。
- 周视图日期列传入完整日期，活动的已有排期任务可跨天移动，沿用首个合法半小时槽、完整截止和冲突校验；已完成与已取消任务拒绝重新排期，拒绝后仓储、同步队列与页面投影保持不变。
- 返回时间轴时恢复 Store 的具体选中日期，标题、选中行与任务槽位一致，包括下周。保留现有切日加载及已测试的截止、顺延、换位和自动完成保护。
- 本轮由 Luna 管理 Antigravity 生成与必要守卫补修，Luna 完善实际 Store/Repository 回归；专项最终 90/90、PC 527/527，类型/两项学科静态检查/构建均退出 0。真实 GUI/Tauri、服务与双设备待验收，未提交或部署；完整证据见 [实施记录](../archive/design-and-plans/plans/frontend/2026-10-06-timeline-date-and-drag-fixes.md)。

### 任务完整排期截止校验（2026-10-06）

- 有截止时间的任务新排期必须完整结束于截止时刻或之前，空时长按 30 分钟，恰好结束允许；覆盖 PC 创建、编辑、按天排期、拖放、原子换位及插入顺延，并由 Server REST/Sync 共用领域校验。
- 任一新安排越界时保留整组原任务时间、版本、本地仓储和同步队列；按天排期选择同时满足冲突和截止的槽位。历史非时间编辑、offset/null 等价和自动 DONE 保持可用。
- 最终实际 Store/Repository/SQLite 专项 102/102、PC 513/513、后端三类 clean 37/37，类型/两项学科静态/构建退出 0，单个只读 reviewer BLOCKER/IMPORTANT/OPTIONAL 均 0。Antigravity 生成与必要补修、Codex 补真实回归并验证，用户工作树保留。GUI/Tauri、真实服务及双设备同步待验收，未提交或部署。

### PC 未排期任务截止后自动完成（2026-10-06）

- 未排期的待办/进行中任务到达有效截止时间后自动标记已完成，保留截止时间和原任务属性；排期任务仍在原排期结束时完成。
- 沿用启动、同步投影刷新与每分钟检查，提交前核对最新截止时间和版本，保存失败可重试；关闭应用期间到期由下次启动补处理。
- 自动完成在原 SQL/browser 提交段原子拒绝已删本地行，修复 Subject cascade 同版本墓碑可被旧任务数据复活的竞态。
- 最终实际 Store/Repository/SQLite 专项 86/86、PC 488/488、类型/两项学科静态/构建退出 0，Server 现有规则 2/2，同一 reviewer BLOCKER/IMPORTANT/OPTIONAL 均 0。Antigravity 生成、Codex 必要补齐与验证，真实 GUI/Tauri 和同步服务待验收；未提交或部署。

### 提问选中文本后端处理（2026-10-01）

- 提问接口新增独立可选 selectionText，最多 4000 字符；用户现有 UI 的引用通过 ChatStore 单行传递，在 NONE 模式也可使用且不触发资料检索。
- 引用作为 USER 资料进入模型请求，固定 SYSTEM 安全说明及预算预留保证当前问题与引用不被历史挤掉；超预算在 SSE 开始前 HTTP 400。沿用原会话持久化与请求回放，不新增数据库或迁移。
- Server clean focused 47/47、PC 478/478、PC 类型/构建和 Mobile 生成类型检查通过，OpenAPI/SDK 一致性通过；真实 Provider/GUI 待验收。前端传递实际由 Antigravity 生成、后端与验证由 Codex 执行，用户 UI 未改，未提交或部署。

### PC 学科编辑保存修复（2026-10-01）

- 修复学科保存提前关闭、完整模型元数据丢失与图标键未更新；失败显示错误并保留表单可重试，当前列表目标缺失时拦截提交。
- 保存期间阻止重复提交、关闭和切换表单，成功才关闭，创建成功继续进入工作区。
- 专项 7/7、PC 477/477，类型/两项学科静态/构建退出 0；单个 reviewer 本轮 BLOCKER/IMPORTANT 为 0。Antigravity 生成必要补丁、Codex 完善与验证；真实浏览器/Tauri 和服务待验收，既有同步删除风险已另登记，未提交或部署。

### PC 学习数据清理、专注统计与 Overview 同步（2026-10-01，代码、自动验证和只读审查通过）

- 删除 AI 搜索快捷项、未使用的 Home/Settings，保留正式搜索跳转和 Profile 设置。
- 知识块正文成为唯一内容字段，删除摘要/标签功能；Overview 的大纲与总结保留。
- 专注按实际时间累计，暂停/休息排除，中断保存，自然结束增加完成轮次；新增持久事件与幂等上传，个人空间读取服务器历史专注聚合。
- 新增完整 Overview 结果独立持久化与跨 PC 设备对账，支持版本冲突和超时原样重试，并校验资料修订与学科来源版本。追加 Server V26–V28 与 PC 本地 v10–v11；本轮未部署或执行生产迁移。
- 补齐 Overview 本地 ACK 失败重放、未解决冲突的新候选提示、删除/恢复生命周期围栏；修复 Source 移动后删除原学科误删成果，以及页面 out-in 过渡期间搜索详情意图丢失。Tauri SQL 初始化固定单连接，确保既有队列的跨调用事务连接一致性。
- 12 项未接通实际业务效果的偏好已汇总在 FrontendPC，仍保留。登录注册和资产页状态按用户指示留待后续。
- 修复 Subject 已提交删除后的清理失败解封，以及拒绝删除后的快照恢复窗口误清理本地草稿；Source 提交失败保留投影、缓存和上传候选。最终 PC 470/470、类型/静态/构建通过，失败恢复 focused 67/67，Server 最终 focused 57/57，native 池事务 1/1；单个 reviewer 本任务 BLOCKER/IMPORTANT 均 0。真实 GUI、Tauri 升级与双设备/外部服务待验收。

### PC 弹窗视觉收敛（2026-09-29）

- 统一收紧 PC 弹窗遮罩、外框尺寸与留白，减少标题装饰并调整表单、标签及按钮圆角；保留现有业务事件与数据流。PC 类型检查、433 项回归、两项学科专项检查及生产构建通过；真实浏览器/Tauri GUI 待验收。

### PC/Service 数据一致性与暂藏 Suggestions（2026-09-27）

- PC 移除未使用的 Suggestions API 入口；Timeline 双任务交换在本地原子写入并在写入失败后触发同步恢复。Server 修复 Sync 初始游标日志缺口、Subject Overview 后序资料引用、同实例 Overview 并发重复生成，以及 Source 更新期间旧摄取任务覆盖新修订的竞态；TEXT/URL Source 与 job 同事务持久化，恢复处理中的 Source 时补建或复用 job。PC 433/433、Server clean 聚焦 114/114、PostgreSQL pgvector 2/2 通过；真实 GUI/Provider/双设备待验收，跨实例 Overview 去重仍留风险。

### PC 同步与 AI 参考范围等功能修复（2026-09-26）

- 新 PC 设备首次同步改为完整快照并刷新本地投影；Tauri 快照保护未结算写入；AI 多文件选择和显式全学科范围接入服务端受限检索。Overview 单次请求超时延长，预览改名不重载，连接状态反映通用服务错误；个人空间说明对齐实际导出、密码与 AI 请求路径。PC 全量 430/430、类型检查、构建、Rust 与 Server 定向测试及 OpenAPI/双端 SDK 门禁通过；真实双设备/Provider/GUI 仍待验收。

### Source/RAG 与文档处理入口优化（2026-09-26）

- 修复 fallback 检索中已删除 Source 的旧 chunk 挤占 TopK；Source 与 Asset 在列表和引用构建中改为用户隔离的批量读取。PC 文档处理 Store 的开始和恢复入口统一经过 SourceJobScheduler。Server 定向 8/8、PostgreSQL/pgvector 2/2，PC 定向 66/66、类型检查与构建通过；运行服务及 GUI 尚未验收。

### 注销账户运行结果核对（2026-09-26）

- 用户重建前后端并重试注销后，关联作业在等待期结束后完成：`COMPLETED`、用户行删除、21 张归属清理表与作业对象键记录均无残留、`last_error=NULL`。数据库链路已核实；MinIO 与 GUI 提示未单独核查。

### 注销确认密码错误的 PC 会话处理（2026-09-26）

- PC 对 `DELETE /api/auth/me` 返回的确认密码错误保留当前会话并显示失败通知，不再把该 401 当成 access token 过期而刷新、重放或跳转；真正的 Bearer 失效仍按原流程处理。PC 定向回归 6/6、类型检查、生产构建和 Docker 镜像构建通过；独立 PostgreSQL 注销受理到完成及错误密码回归 4/4。前端容器尚未更新，真实 GUI/账号未验收。

### 注销账户受理入口 PostgreSQL 时间绑定（2026-09-26）

- 修复 `DELETE /api/auth/me` 写入注销作业时把 `Instant` 直接传给 pgJDBC 导致受理失败；`requested_at` 与 `not_before` 改为 UTC `OffsetDateTime` 绑定。独立 PostgreSQL 异时区定向回归 2/2、backend 镜像构建通过；运行容器尚未更新，真实账户注销仍待验收。

### 注销账户清理任务 PostgreSQL 时间绑定（2026-09-25）

- 修复后台清理服务把 `Instant` 直接传给 pgJDBC 导致作业领取失败的问题；同类时间参数统一转为 UTC `OffsetDateTime`，对应数据库带时区列。隔离 PostgreSQL 17/pgvector 异时区回归 1/1 通过；当前运行服务与真实账户未作清理验收。

### 通用 AI 聊天 Provider 配置（2026-09-25）

- 用户只配置聊天模型与 BYOK；Embedding 改由服务端 SiliconFlow 设置统一提供。通用 OpenAI 兼容 Provider 接受经安全校验的公网 HTTPS 地址，连接测试直接验证所填聊天模型，不依赖模型列表端点。
- PC 设置页和 OpenAPI/双端生成类型已同步；安全策略拒绝 NAT64、6to4、Teredo 转换前缀。Server clean 定向 45/45、安全专项 clean 18/18、OpenAPI artifact 8/8、SDK gate、PC 定向 5/5 与 PC type-check 通过；真实 Provider 和 GUI 待验收。

### PC 个人空间头像读取 406 修复（2026-09-25）

- 头像 GET 请求单独接受 PNG 和 Problem Details，避免通用 JSON `Accept` 与服务端 PNG 响应不匹配。Blob 读取及无头像 404 处理保留；定向测试 5/5、PC type-check 通过，真实 HTTP 与 GUI 待验收。

### PC 完成任务分组与首页日程恢复检查（2026-09-25）

- 资产库已完成任务优先归入“已完成”，包括没有截止时间和排期的任务；任务树完成标记统一使用完成状态规则。TASK 投影刷新后即时重试已结束排期任务的自动完成检查。已结束且已完成的排期任务禁止取消完成，避免自动恢复再次勾选造成状态往返。任务规则 14/14、资产库 2/2、首页/时间轴 15/15、Store 排期 25/25、PC type-check 通过；首页 GUI 与真实同步时序待验收。

### PC 时间轴任务结束后自动完成（2026-09-25）

- 排期任务在 `scheduledAt + durationMinutes` 到达后自动完成并保留原排期；首次加载立即检查，随后每分钟复查。单项写入失败不影响其他任务，自动完成与手动改期/编辑按同一任务变更队列串行，并由本地仓储版本及 outbox 条件拒绝过期写入；增量同步拉取不会覆盖期间新建的本地 mutation。定向测试 35/35 + 18/18 + 12/12、PC type-check 通过；GUI 与跨设备同步待验收。

### 头像上传 multipart 上限（2026-09-25）

- Spring multipart 单文件上限提高至 5 MiB，完整请求上限设为 6 MiB，为头像表单封装留余量；头像业务校验仍限制原文件最多 5 MiB。ConfigurationTests clean 定向 3/3 通过，真实 HTTP 上传尚未验证。

### PC 个人空间后端能力（2026-09-24）

- 新增当前用户昵称更新、密码修改、头像上传/读取/重置、异步账户注销受理接口；V24 保存规范化私有头像，V25 保存注销作业和对象键并支持清理重试及已完成作业周期复扫。登录/刷新、上传意图签发与相关账户变更按用户锁串行化。
- 新增基于当前用户已保存 BYOK 的兼容协议模型列表与连接测试接口，使用既有出站地址安全策略，不读取环境默认密钥。
- Identity/Source/Asset/ParsedDocument/Architecture clean 定向测试 36/36，先前 Identity+AI 联合 clean 29/29，OpenAPI artifact 8/8 与双端生成 schema 一致性检查通过。PC 页面尚未接入；真实 PostgreSQL/MinIO、外部 Provider 和 GUI 仍待验收。

### PC Asset 力导向关系星图与中栏预览联动（2026-09-24）

- 星图使用真实 Subject、Source、KnowledgeBlock 关系，采用对称互斥、弹簧吸引、弱重力与阻尼；节点以稳定 ID 初始化，同范围刷新保留节点位置和镜头，切换图谱范围后重新适配，初始模拟有收敛条件与 180 帧上限。
- 鼠标、触控与触控笔可拖动画布或任意节点；拖动时锁定目标节点并实时推动关联邻居，释放后最多进行 30 帧低强度松弛。点击 Source/KnowledgeBlock 节点在 Asset 中栏打开对应文件预览或知识块编辑器，同时保留 Home `open-block-detail` 事件。力/交互专项 6/6、PC 全量回归 403/403、type-check、build 与 `git diff --check` 通过；浏览器/Tauri 真实手势仍待验收。

### 紧邻任务保留原窗口的交换（2026-09-24）

- 顶部交互栏交换两个首尾紧邻任务时，按新顺序占用两项原共同时间窗口；即使时长不同，也不再由 PC 的旧预检直接阻断。后端在事务中校验完整区间，PC 应用返回的两项实际时间。
- PC 全量回归 397/397、类型检查和构建通过；Server clean 聚焦 3/3。本机仅重建并重启 backend，health/readiness HTTP 200、Flyway 23；GUI 拖放验收待核对。

### Timeline 任务主体严格放置（2026-09-24）

- 拖到任务卡片主体时，被拖任务接在目标结束后的首个半小时槽；若与后续排期冲突则拒绝，目标和其他任务保持原位。普通空白槽位保留插入顺延，顶部栏保留双任务交换。
- 插入请求增加可选 `targetTaskId` 供服务端锁定目标并原子校验。
- PC 全量回归 397/397、类型检查与构建通过；Server 聚焦 5/5、OpenAPI artifact 测试 8/8、双端 SDK 一致性检查通过。本机仅重建并重启 backend，health/readiness UP，Flyway V23 成功；GUI 拖放与认证业务请求尚未验收。

### dueAt 纯提醒与 Server 排期校验一致（2026-09-23）

- Server 创建、更新、交换和插入排期允许 `scheduledAt` 晚于 `dueAt`，并保留用户设置的截止时间；任务区间冲突、固定完成任务和插入窗口限制不变。
- 新增 Flyway V23 移除 `ck_tasks_schedule_order`，不修改已有任务。V18 迁移此前清空的历史排期时间不会自动恢复。
- 新增服务与 Controller 回归覆盖 overdue 更新、交换、插入和原子冲突拒绝；fresh H2 定向测试 26/26，Server package 构建通过。真实 PostgreSQL migration、Docker 部署和 GUI 行为仍待验证。

### 排期插入接口运行恢复（2026-09-23）

- 运行日志确认旧 backend 镜像对 `POST /api/tasks/schedule-insertions` 返回 `HttpRequestMethodNotSupportedException`，经通用异常处理显示为 `An unexpected error occurred`。重建并仅重启 backend 后，容器 healthy、readiness HTTP 200。
- 修正 Server Dockerfile：复制 Windows 工作树中的 Maven wrapper 后先统一为 LF，避免 Linux build stage 将 `#!/bin/sh` 解析失败。
- 当前 Compose 默认 prod profile，按配置关闭 `/v3/api-docs`（运行时 HTTP 404）；签入 OpenAPI artifact 已包含该 POST。数据库和 MinIO 只启动既有容器，未重建服务或数据卷；backend 无数据挂载。

### Timeline 插入顺延与顶部交换（2026-09-23）

- 普通时间槽和任务卡片主体现在插入任务，并原子顺延发生碰撞的后续任务；保留原有空档。仅任务卡片顶部交互栏执行双任务交换。
- 顺延按半小时槽对齐，固定任务、跨日已有任务或超出当天窗口导致冲突时整体拒绝，原排期保持不变。成功后 PC 更新本地缓存并通过 Sync read 收敛。
- 新增 `/api/tasks/schedule-insertions`、OpenAPI 产物及 PC/Mobile 生成类型；无 Mobile 运行时行为修改。
- PC 完整回归 395/395、type-check、build、OpenAPI 契约检查通过；Server 服务/控制器/OpenAPI 定向测试最终 32/32。Mobile type-check 与 Server 全量 testCompile 仍有本轮未改的环境/源码阻断，真实 GUI、跨设备及 PostgreSQL 并发尚未验收。

### PC 与 Server 排期区间冲突防护（2026-09-23）

- 排期创建、移动、按天安排、已排期任务时长修改和双任务换位均校验完整任务区间，阻止未取消任务出现时间重叠；首尾相接允许。
- 按天排期改为寻找无冲突的半小时起始槽，无法找到可用时间时保留任务原状并提示原因。
- Store 对本端排期相关操作串行校验；待排期任务拖到占用槽时明确拒绝，避免原任务排期被分次提交意外清除。已排期任务的同槽交换继续使用服务端原子 API。
- 对既有重叠排期不做自动迁移；尝试安排到冲突区间时明确拒绝。
- Server 的 REST 与 Sync 写入在 create/update/restore/swap 时按同用户完整区间拒绝重叠；事务内按 User→Subject→Task 锁序串行化，空时长按 30 分钟处理。
- PC 排期、任务视图与 DTO 映射定向回归 40/40、完整 PC 回归 392/392，`npm.cmd run type-check`、`npm.cmd run build`、`git diff --check` 均退出 0；Server 聚焦测试 29/29 与 diff-check 退出 0。真实 PostgreSQL 并发、跨设备同步及 GUI 交互尚未验收。PC `mapTaskView` 将远端 null/缺失及无效时长对齐为 30 分钟有效默认值，避免本地与 Server 对区间结束时间计算不一致。

### PC 学科大纲保存数据保留、大纲草稿隔离、首页移出日程按 ID 寻址、学科切换文件隔离与测试数据脚本一致性（2026-09-23）

- **学科大纲保存数据保留与多文件关联**：
  - 修复 `SubjectWorkspace/index.vue` 在手工编排大纲保存时小节 `summary` 被设为 `null` 以及只保留单文件关联的问题；
  - 彻底移除早期原型遗留的 `syncOutlineFileLinks` 逻辑，杜绝在挂载与学科切换时按章节顺序重设小节文件 ID 的错误覆写行为；
  - 载入时保留每小节全部 `sourceIds`、`summary` 与 `locator`；保存时优先保留既有属性，不破坏未编辑细节；
  - 编排器支持对小节展示关联的全部文件胶囊，并支持独立解除特定文件关联；
- **学科切换大纲草稿生命周期隔离与异步防竞态**：
  - 在 `watch(subjectId)` 入口第一行立即同步清空 `subjectOutline` 及相关章节/小节草稿，绝不在等待结束旧聊天会话等异步期间残留旧草稿，彻底杜绝切换学科异步等待期间将旧学科大纲写进新学科的漏洞；并在 `saveCurrentOutline` 加入空大纲与防重守卫；
- **学科切换 AI 请求旧文件隔离与跨学科校验**：
  - 在 `watch(subjectId)` 入口第一行同步触发 `chatStore.abortStream()`、`chatStore.clearActiveConversation()`、清空 `selectedFileId`、`selectedAiSourceIds`，并调用 `sourceStore.clearActiveSourceFiles()`，阻断旧会话流式与状态残留；
  - 在 `sendChat`、`retryChat`、`sendSelectionQuestion` 以及 `saveKnowledgeBlock` 请求组装时增加严密的归属双重校验：关联的 `sourceId` 必须能在当前 `activeSourceFiles` 中找到且 `subjectId` 与当前学科一致，否则严格过滤置空，彻底杜绝切换等待期将旧文件 ID 携带进新学科请求的竞态问题；
- **首页移出日程按唯一任务 ID 寻址与失败用户通知**：
  - `Dashboard/index.vue` 移出日程由传递槽位时间升级为直接传递 `task.id`；
  - `useTaskStore.ts` 的 `unscheduleTask` 优先按任务 ID 查找目标任务，彻底消除同时间槽多任务时的串操作以及首项已完成时无法移出的限制；
  - 移出日程发生异常时，通过 `ElNotification` 向用户展示具体错误或已完成固定提示，不再静默仅写控制台；
- **测试数据注入脚本 companion 账号清理**：
  - 移除 `scripts/seed-test-account.mjs` 中注册冗余 companion 账号的代码，保持与 `docs/current/Status.md:3` 数据库校验 `users=1` 基准严格一致；
- **验证**：PC 全量 `npm.cmd run test:r4-pc`（386/386）、`npm.cmd run type-check`、`npm.cmd run check:subject-workspace`、`npm.cmd run check:subject-icons` 及 `git diff --check` 全部通过。

### 测试数据注入规范与时间轴有效窗口对齐（2026-09-22）

- 定位并修复测试数据重置注入流程中排期任务溢出时间轴可视窗口的问题（`docs/operations/TestAccountDataResetAndSeed.md` 与 `docs/current/IssuesAndReview.md`）；
- 彻底移除全局简单加 2 小时累加导致的凌晨（01:00/03:00/05:00）或深夜排期；
- 明确引入每日合法槽位集合（`08:30`、`10:30`、`14:00`、`16:00`、`19:00`、`21:00`），将注入排期严格限制在前端时间轴支持的有效可视范围（`08:00 ~ 22:30`）内，每天容量上限为 6 项并按日自动向后递增，禁止将排期注入到时间轴没有的无效区间。

### PC 首页看盘时间轴简化为纯任务排列（2026-09-22）

- 重构首页看盘（`Dashboard/index.vue`）右侧面板，采用上下双卡片分区架构；
- 上半部日程展示彻底移除 06:00~23:30 垂直网格刻度槽位、当前时间指示红线及拖拽换槽改期逻辑，改为「日程任务」简单线性排列；
- 按任务开始时间先后升序排列，每个任务项显示时间微胶囊（如 `09:30 · 60m`）、学科标签、标题及即时完成复选框和移出日程按钮；
- 保留原有日视图/周视图切换按钮、7 天日期快捷选择与新建任务功能；
- 下半部「待办清单」移除拖动手柄与拖动属性，纯列表展示未排期任务并支持直接勾选完成；
- 时间轴复杂拖拽、跨槽换位与全天半小时网格编排完全收敛至 `/timeline`（排期副驾）；
- 自动验证：对齐 `scripts/r4-dashboard-timeline.test.mjs` 测试断言，PC `npm.cmd run test:r4-pc` 382/382、`npm.cmd run type-check` 与 `npm.cmd run build` 全部退出 0。

### PC 学科中心知识块布局优化与底部立体阴影（2026-09-22）

- 学科工作区（`SubjectWorkspace/index.vue`）知识库网格（`.blocks-grid`）与上方顶栏增加缓冲下移距离，`.blocks-workspace` 调整为 `padding: 24px 28px 20px`，`.blocks-top-bar` 调整为 `margin-bottom: 24px`；
- `.blocks-grid` 引入 `padding: 8px 6px 24px 6px` 与 `margin: 0 -6px`，整体视觉向下自然沉降 16px，彻底消除卡片鼠标悬浮态（`transform: translateY(-3px)`）被滚动容器顶边界及上方微状态栏遮挡裁切的问题；
- 为知识块卡片（`.block-card`）加入分层立体底部微阴影（常态 `box-shadow: 0 8px 20px -4px rgba(0, 0, 0, 0.06), 0 3px 6px -1px rgba(0, 0, 0, 0.04)`，悬浮态 `0 14px 28px -4px rgba(0, 0, 0, 0.09), 0 6px 12px -2px rgba(125, 147, 114, 0.15)` 并提升至 `z-index: 2`，深色模式自适应适配）；
- 为学科空间（`SubjectHall/index.vue`）搜索输入框（`.search-input`）与学科卡片（`.subject-card`）同步应用分层立体底部微阴影与暗色模式适配；
- 自动化验证：PC `npm.cmd run test:r4-pc` 382/382、`npm.cmd run type-check`、`npm.cmd run build` 及 `git diff --check` 全部通过。

### PC 总览栏展现与交互优化（2026-09-22）

- 移除抽屉顶栏“AI 梳理”按钮，保留总览标题与大纲编排入口；
- 大纲编排加号按钮在激活编辑状态时支持平滑旋转 45° 转换为灰色 `×`，退出编辑平滑还原；
- 学科总览外边框加粗为 2px 灰绿品牌色，与普通文件卡片形成分明层级；
- 顶栏错误重试与说明采用一体化胶囊绑定，一键生成改为上下居中极简排版与纯文本胶囊按钮；
- 文件总览卡片的“总结”按钮升级为轻量圆角胶囊按钮；
- “...”弹出菜单外壳及菜单项全面升级为圆角微质感风格；
- 重构大纲章节与小节层级排版，彻底移除生硬老旧的折线分支，升级为现代极简导轨与小节微圆点对齐风格，保留悬停高光微弹反馈与定位图钉交互；
- 完整保留学科总览生成、大纲重新生成、查看总结、资料更新提示与错误重试全部功能与数据流契约；
- 自动验证：更新 `scripts/r4-subject-overview-ui.test.mjs` 测试契约断言，PC `npm.cmd run test:r4-pc` 382/382、`npm.cmd run type-check`、`npm.cmd run build` 及 `git diff --check` 全部通过。



- 已安全化的 `SafeClientError` 在二次分类时保留 `code`、安全文案和 `retryable`；Chat Store retry 直接复用原 PENDING 消息和 `clientRequestId`，不追加重复 USER 消息。
- Subject Overview 保存前逐 Source 复核 existence、类型、READY、revision、blocked/eligibility；Source discard 会 abort 受影响的 subject generation，删除、状态变化和 revision 变化的晚到响应均不写入 cache。
- 新增真实 Store/Service runtime 与 Subject 保存竞态回归；最终 focused 68/68、完整 `test:r4-pc` 382/382，`type-check`、`build` 和 `diff-check` 均通过。真实 Provider、Tauri/GUI、浏览器网络与业务验收仍待执行。

### PC Issue 3/4 连接状态与 Overview 反馈收口（2026-09-21）

- PC 连接状态统一按错误、离线、Realtime 重连、同步中、已同步的优先级投影；问答失败在聊天区域保持可见并可重试。Overview 手动重生成返回 `STARTED`/`SKIPPED`/`FAILED` 结构化结果，自动触发静默处理预期失败并保留已有缓存，只有手动重试绕过终态策略。
- 自动证据：Issue 3/4 focused 88/88，完整 `npm.cmd run test:r4-pc` 369/369，`npm.cmd run type-check`、`npm.cmd run build`、`git diff --check` 通过。既有 SQLite experimental、Vite externalized/dynamic-import/chunk size 警告仍存在。
- 真实 WebSocket、浏览器 online/offline、Tauri/GUI 文件预览和 AI Provider 输出仍待人工验收；本轮无 API 或数据库契约变化。

### Overview Reduce prompt 均衡压缩（2026-09-20）

- MAP 行为保持不变；非最终及最终文档 REDUCE 现在使用专用均衡压缩 prompt，规范化长度为 843 字符，面向需要实质归并的输出目标约 2500–3000 个序列化 JSON 字符。该目标不替代既有校验。
- `max_tokens=4608/6144`、规范化 intermediate `<=5200`、self-pair `<=12000`、Reduce no-progress、schema/alias/mode/locator 校验和分组/批次边界均保持不变；没有新增自动压缩重试、API、数据库或普通聊天/流式行为变化。
- Server focused 自动测试 55/55、test-compile 与 `git diff --check` 通过。真实 DeepSeek 的压缩质量、内容覆盖、延迟、token 使用、成本及业务验收仍待真实样本验证。

### PC OCR 页进度投影抗闪烁 Task 5（2026-09-18）

- Store 的 Local OCR projection 改为 reader 成功完成后的原子替换；reader pending 时保留最近有效页值。同一 `attempt + localContentRevision` 的 `OCR_RUNNING` Source 只有在 `after-recognize`、`after-normalize`、`page-result`、`empty-page` 的 page/total 与最近有效值一致时复用该值；同 run 倒退 checkpoint 不覆盖，新 run 必须先建立自己的 `before-recognize`，Source 消失、reader detach 或 reader 失败清理失效值。
- runtime reader 仅补传已有 local record identity；新增回归覆盖跨 attempt/revision、totalPages 不一致、同 run 含 totalPages 变化的倒退 checkpoint、后续事件匹配、new-run page 1 reset、pending、detach、Source missing 和 reader failure。Store/UI/coordinator/runtime focused 68/68、`npm.cmd run type-check`、`git diff --check` 通过。未修改 UI、OCR Coordinator、sync、API 或数据库契约；真实 Tauri/GUI OCR 进度仍待人工验收。

### PC OCR 页进度与 Source 收敛 Task 4 收口（2026-09-18）

- 本地 OCR 页级检查点现在投影到既有文档处理 Store，Source 行复用原有 `正在识别第 X/Y 页` 显示；不新增百分比、进度组件或其它 UI。
- 替换 WebSocket 在 `onopen` 只请求一次既有 background `read` sync；处理 runtime 对 processing Source 使用生命周期/认证 scope 守卫的共享有界 reconciliation，覆盖遗漏 `READY` 的恢复路径。
- 自动证据：OCR/UI/runtime/protocol/sync focused 90/90、`npm.cmd run type-check`、PC `npm.cmd run test:r4-pc` 352/352、`npm.cmd run build` 和 `git diff --check` 通过。测试修正仅扩大 Overview 源码合同测试的 callsite 截取窗口，以适配 Task 3 新增 guard，不改变生产行为。
- 真实 Tauri/GUI OCR 进度、真实后端 WebSocket/event delivery、跨设备收敛和业务验收仍未声称完成，继续作为人工/发布验证边界；本轮无 API 或数据库 schema 变化。

### Subject 归属与删除生命周期收口（2026-09-18）

- PC 修复 Subject 文件投影：当前 Subject 不再从首条可见 Source 推断；跨学科导入、空学科和异步加载均按明确 `subjectId` 隔离。Local Asset 仍采用稳定 Asset 路径，未改为按学科复制物理原件。
- Server Subject 删除在一个事务中级联软删除 Source、KnowledgeBlock、Task、Relation，并以 `SubjectLockCoordinator` 收口 Subject-first、UUID 稳定排序、资源锁后重读重校验的数据库锁协议；API、schema 和 MinIO 协议未改变。
- PC Subject 删除以父 mutation 为持久恢复标记，围栏子投影、draft、处理任务和 Overview；未决阶段保留可回滚的 draft/bytes，APPLIED 后才按最后引用清理 Asset，拒绝恢复会持久请求 authoritative snapshot。draft release 在生命周期锁内检查父 Subject 删除状态，阻止删除窗口内产生 `SOURCE/CREATE`。
- 自动验证：PC Subject cascade 8/8、Store 12/12、全套 342/342、type-check 与 build 通过；Server 聚焦组合 40/40、PostgreSQL 锁集成 1/1、`clean test-compile` 通过。真实 Tauri/SQLite 强杀恢复、真实 PostgreSQL/MinIO、多设备和 GUI/业务验收仍开放。

### PC Local Asset Store Task 8 收尾（2026-09-17）

- `b7a3bb7..c560d8b` 完成 PC Tauri 永久本地资料库：原始文件在 OS ACL 保护的受管目录中保持明文，所有文件默认同步；断网可导入、预览和本地 OCR/Parser，联网后以稳定 `clientImportId` 幂等同步对象存储。Asset/Source draft 与任务边界按 owner/device 隔离，Preview、OCR、Parser 共享 Local Asset；不提供 Local Asset 备份、导出、恢复或副本管理。
- 仅用户明确删除 Source 且最后一个 Source 引用消失后才删除本地文件；上传、解析、修复和删除任务带 fence。启动 reconcile 会校验数据库、文件和 staging，缺失/校验不符标记 `CORRUPT`，未知残留 quarantine。
- 自动证据：Task 7 定向 77/77、FilePreview+store 38/38、Rust 30/30，`cargo fmt --check`/`cargo check` 通过；schema v8→v9 旧断言已由 `c560d8b` 修正；最新 `test:r4-pc` 333/334，仅剩用户 dirty `task-view` 断言失败，`type-check` 仍有用户 dirty UI/Store 的 7 项错误。真实 Tauri GUI、断网/重启、真实对象存储和业务验收仍待执行。

### Overview 非 JSON 失败体验收口（2026-09-15）

- 真实第二次 Overview 全链路已成功，证明永久预算链路可运行；生成内容质量仍需用户判断。
- PC Overview 对现有 `MODEL_PROVIDER_ERROR` 显示“遇到意外情况，请重试”，不新增 Server/API 错误码；FAILED 终态继续禁止自动重试，只有手动“重新生成”会发起新请求。
- 文案仅调整 Overview 专用 failure policy，普通 AI 聊天与流式行为不变。

### Overview 最小 JSON 诊断（2026-09-15）

- 为定位真实 DeepSeek FINAL `JSON_PARSE` 失败，Provider 发送前从最终序列化 request body 记录 allowlisted `AI_JSON_MODE`（`structuredJson`、`responseFormat=json_object`、`maxTokens`、stage）；Overview FINAL 在既有 validator 前用同一 Jackson `ObjectMapper.readTree` 记录 `FINAL_JSON_CHECK` 的 valid、字符数、行列号和异常类型。
- 诊断不记录 request body、prompt、响应正文、原始异常 message、URL 或凭据；`FINAL_JSON_CHECK` 对原始 `message.content` 直接 `readTree`，不做 fence stripping，因此 fenced JSON 会记录 `valid=false`，但不改变后续 validator 行为。普通聊天/流式行为不变。聚焦测试通过；尚未部署，真实请求和业务验收待重跑。

### Overview 永久阶段预算（2026-09-15）

- Overview 多批 MAP/非最终 REDUCE 使用 `max_tokens=3072`，最终 completion 使用 `4096`；规范化 intermediate JSON 上限为 `5200` 字符，self-pair 仍为 `12000`。
- 保留覆盖率优先的紧凑 prompt 与现有错误边界，不自动压缩重试；普通聊天、流式和 embedding 不变。Overview 38/38、兼容集合 63/63 通过，backend 已重建且 healthy。
- 部署后真实 42-chunk 请求通过全部 6 个 MAP 和第一轮 2 个 REDUCE；最终 REDUCE 收到 DeepSeek 2xx、自然 `stop`、`2992 outputTokens`、`6556 responseChars` 后在 JSON 解析失败。中间预算已实通，但完整链路和业务验收未通过。

### DeepSeek Overview 无 max_tokens 诊断实验（2026-09-15）

- 现场请求已返回非空 `content`，但首个 MAP 在 `responseChars=2553` 后 JSON 解析失败；为验证 1024 token 截断假设，Overview completion 暂时不发送 `max_tokens`，并移除 intermediate 1024 output token 前置拒绝。普通聊天/流式不变。
- `AiProviderResponse` 现在携带 allowlisted `finishReason`；未知、超长或含换行值归一为 `other`。`JSON_PARSE_START` 记录实际字符数、output tokens 和停止原因，不输出模型正文。
- 新增安全的 `INTERMEDIATE_BUDGET_CHECK`，以同一次实际判定记录规范化 JSON 字符数、self-pair prompt 字符数、各自上限与 overflow 布尔值；不输出正文或 prompt，错误行为不变。相关兼容集合 58/58 通过，待第二轮真实生成采样。
- 第二轮 42-chunk 真实生成在 MAP2 得到 `2612 outputTokens`、`5105 normalizedChars`、`11450 selfPairPromptChars` 和自然 `finishReason=stop`；仅 4000 字符边界超限，12000 self-pair 边界未超限。MAP3–6/REDUCE 未执行，永久策略未在本轮实施。
- Task 4C 用真实 42-chunk 生成验证覆盖率保留的压缩 prompt：六个 MAP 均通过且为 1447–3680 字符，此前 5105 字符的 MAP2 降至 2027；REDUCE round 1 第一组 2446 字符通过，第二组仍以 4678 字符触发 4000 字符边界，但 self-pair 10899/12000 未超限。Prompt 有效但不能代替硬边界；永久参数未实施。
- 4000 字符 intermediate 上限、self-pair、schema、Source fence、Reduce no-progress、HTTP response-size 和 120 秒 timeout 仍保留。本轮 fresh test compilation 与相关 58/58 通过。真实 42-chunk 请求已观测 MAP 1–5 为 991–2071 output tokens、2500–4091 response chars，全部 `stop` 且 JSON/schema 成功；第 5 个 MAP 随后命中 intermediate convergence guard，MAP 6/REDUCE 未运行。当前行为仍是临时测量手段而非永久成本策略。

### Overview 手动重试与生成收敛修复（2026-09-14）

- PC 当前 revision 的 FILE Overview `FAILED` 与部分 `READY` 记录现在是自动触发终态；`SOURCE_READY`、启动/联网/同步恢复和 `JOB_CHANGED` 不再自动 POST，只有 `MANUAL_RETRY` 可发起新请求并继续使用 in-flight coalescing。失败或部分结果保留旧大纲/总结，失败区域只显示一个可见“重新生成”，生成中 disabled；状态不确定与确定性失败使用不同文案。
- Server 为 Overview Provider 调用明确区分 intermediate/final：多 batch Source MAP 与非最终 multi-group REDUCE 使用 1024 `maxTokens`，single-batch Source MAP、Subject direct 与最终单 group REDUCE 使用 4096；中间输出校验 token、规范化 JSON 4000 字符和 self-pair prompt fit，Reduce no-progress 严格要求结果数量下降。
- Overview completion 新增内部 structured JSON 契约：OpenAI-compatible 请求发送 `response_format={type:json_object}`，DeepSeek 额外发送 `thinking={type:disabled}`；普通聊天/流式请求保持原有 body。响应适配器不回退 `reasoning_content`，无有效 content 时新增只含清洗/限长模型标识及 envelope 数量元数据的安全诊断，不记录 prompt、正文、URL 或凭据。
- 新增稳定错误语义：`OVERVIEW_PROVIDER_OUTPUT_TOO_LARGE` 与 `OVERVIEW_REDUCE_NO_PROGRESS` 返回 HTTP 502，parse/schema 等其它 Provider 输出错误统一为 `MODEL_PROVIDER_ERROR`/502；API route、DTO、OpenAPI schema 和数据库未变。原持续自动补发与 Reduce `VALIDATION_FAILED` 问题已完成代码修复及自动验证。
- 自动证据：PC Overview focused 54/54，最新 `test:r4-pc` 331/331、type-check、94 文件静态检查、workspace check 与 build 通过；Server 本轮 fresh `clean test-compile` 通过，Overview/Controller/Provider/Streaming 聚焦 56/56，OpenAPI gate green。Server 既有全量证据为 255 项中 252 pass、3 项 Docker/Testcontainers errors；真实 DeepSeek/Provider、Tauri、网络、GUI、设备和业务验收仍待完成，Server 持久 generation 幂等仍是开放风险。

### Build/OpenAPI Task 3：最终回归与门禁同步（2026-09-12）

- Server fresh 聚焦命令实际 57/57、0 failures、0 errors、0 skipped；测试 double 补齐 `ProviderHttpTransport.post(..., byte[])` 后 fresh test compilation 通过，生产 Provider transport 未改变。
- Server 全量 `mvnw -B -ntp test` 实际 239 项，0 failures、3 errors；错误仅为 MinIO/PgVector/Testcontainers 无法连接 Docker。`check-openapi.ps1` 退出 0，Server OpenAPI artifact 8/8，PC/Mobile generated schema 与 artifact 一致；`subjectOverview`/`sourceOverview` 均暴露可选 `X-Overview-Request-Id`。
- PC/Mobile type-check 退出 0，Mobile protocol test 23/23。Mobile 的一行 payload boundary cast 只为适配生成 `JsonNode` 的结构窄类型，运行时序列化不变；未来 contract-cleanup 风险仍开放。API/Database 语义未新增变化；真实 Provider、Docker、PostgreSQL/MinIO、Tauri/GUI、设备和业务验收仍待完成。

### Server Test Gates Task 4：全量回归与契约门禁记录（2026-09-11）

- `source` 现在通过 source-owned `ParsedDocumentIngestionPort`/`IngestionJobReference` 调用 `ai.ingestion`，消除 source 对 ai 内部服务/实体的依赖并保持 `ai → source` 单向边界；H2 fixture 清理顺序已固定为逆外键顺序。
- Server 当前增量编译产物下标准聚焦 Maven 40/40；架构隔离命令（含 `ArchitectureTests`）7 类合计 20/20，其中 `ArchitectureTests` 1/1；H2 隔离连续两次 24/24、OpenAPI artifact 8/8。标准全量 `test` 实际执行 239 项，0 failures、3 errors，错误仅来自 Docker 不可用的 MinIO/PgVector/Testcontainers；fresh `clean test-compile` 仍受 `AiProviderSecurityTests.java:182` blocker 阻断。
- `check-openapi.ps1` 的 artifact 比对通过，但 PC generated schema stale；未在本轮运行 SDK 生成。上述自动证据不替代真实 PostgreSQL/MinIO、Provider、Tauri/GUI 或业务验收；无语义 API 或数据库契约变化，仅同步 OpenAPI artifact。

### Overview Source 删除 fence 与回归门禁（2026-09-11）

- PC 文件总览生成现在要求活动 FILE Source 的精确 `ingestionRevision` 与本地文档任务 `READY`；Source 删除在 tombstone/投影移除后同步阻断、abort 匹配请求并清理文件总览缓存，晚到响应不写入或标记失败，且 fence 先于同步与后台文档清理。
- Server 在每个共享 Map/Reduce Provider 调用前后复核活动 `READY`/精确 revision；进行中的 Provider 调用可完成但其结果被拒绝，不再启动后续调用。Subject 总览及 API、数据库、同步契约未改变。
- 本轮门禁：PC R4 322/322、type-check 通过、静态检查扫描 93 个生产文件并通过；Server `AiOverviewServiceTests` 19/19 通过；Overview 失败日志使用 allowlist，`requestId` 规范为 UUID（非法或含敏感内容时替换为服务端新 UUID），不记录原始 exception/cause 文本或 throwable stack；Server 全量 239 项实际为 0 failures、3 Docker/Testcontainers errors，fresh testCompile 仍有独立 `AiProviderSecurityTests` blocker，OpenAPI/PC schema 仍需处理。真实 Tauri、Axios、Provider、PostgreSQL/MinIO、GUI 和业务验收不由自动回归替代。

### Provider Overview 超时与错误映射修复（2026-09-10）

- ProviderHttpClient 分离连接超时与 response/read 超时：连接默认 3000ms，普通非流式 completion、流式请求和 embedding 默认保持 10000ms；Overview map/reduce 非流式 completion 新增独立可配置的 120000ms 窗口。
- `SocketTimeoutException` 现在稳定映射为 `MODEL_TIMEOUT`/HTTP 504，并保留 cause；其它 IOException 继续为 `MODEL_UNAVAILABLE`/503，429/5xx/400 映射及普通聊天/流式行为保持不变。同步更新 Server 配置、Compose、环境样例与 API/部署文档。
- TDD RED 先复现 timeout overload/配置缺失、旧 `MODEL_UNAVAILABLE` 及配置越界未拒绝；最终 Provider、Overview、普通 streaming、embedding、错误映射及 OpenAPI 聚焦回归 60/60 通过。真实 Provider 网络、生产代理和业务端到端仍待人工验收。

### PC 学科总览与本地 AI 大纲/总结（2026-09-10）

- 将工作区原“大纲”入口升级为“总览”，保持现有 `AI 梳理` 按钮位置和三栏宽度。顶部学科总览默认折叠且按用户请求生成；下方直接展开全部文件大纲，每个文件可在中间预览区查看总结并分项重新生成。
- 文件解析 READY 后自动请求结构化大纲与总结；Server 生成保持无状态，PC 结果按 user/device/source revision 存入本地 schema v7，不进入 Server 数据库或 Sync。失败保留旧内容，损坏缓存和异常 Provider 响应在持久化边界拒绝。
- 当前自动证据包括 Server 聚焦 23/23、PC 完整 R4 306/306、overview/UI 聚焦 18/18、type-check、静态检查、工作区契约、生产构建和 diff-check。终审补齐了零可用输入的 stale 判断、空内容过滤和学科大纲独立重生成。OpenAPI artifact 8/8 且 PC 生成类型一致；仓库级契约门禁仍被既有 Mobile schema 过期/文件占用问题阻断。Server 全量仍有 28 个既有环境/共享测试错误，真实 Provider/Tauri/GUI 尚未验收。

### PC 时间轴空槽拖动 400 修复（2026-09-09）

- 修复排期任务拖到空槽时仍调用 `POST /api/tasks/schedule-swaps` 并发送空 `targetTaskId` 导致 400 的问题。空槽现按单 Task 写入本地 repository/outbox，只有两个占用槽之间才使用原子 swap API。
- TDD 回归修复前实际命中 `targetTaskId: ''`；修复后时间轴相关 35/35、完整 PC 272/272、type-check 与静态检查通过。真实 Tauri GUI 拖动与后台同步仍待人工验收。

### PC 知识块来源名称修复（2026-09-09）

- 修正 KnowledgeBlock UI 投影把 `sourceId` 直接显示为来源名的问题；现从同一本地 Source 投影取得 `title`，并在 Source 变化时刷新。缺失关联投影时显示“来源资料”，不再泄露 UUID。
- TDD 回归使用 `编译原理课件chap01(陈火旺)-v9.ppt` 复现并锁定中英文/括号文件名；聚焦 11/11、完整 PC 270/270、type-check 与静态检查通过。真实 Tauri GUI 仍需人工走查。

### PC 知识块学科名称映射修复（2026-09-09）

- 修正 KnowledgeBlock UI 投影把 `subjectId` 直接显示为学科名称的问题；现从同一本地 Subject 投影取得 `name`，缺失关联时使用“未分类学科”，并继续保留 `subjectId` 作为关联标识。
- 新增 TDD 回归覆盖 UUID 不得成为可见学科标签；映射聚焦 12/12、完整 PC 271/271、type-check、静态检查、生产构建与 diff-check 通过。真实 Tauri GUI 仍需人工验收。

### PC PDF 混合页面阶段修复（2026-09-09）

- `DocumentJobRunner` 在 OCR 已启动后保持 `OCR_RUNNING` 处理后续普通文字 block，直到进入 `PACKAGING`，消除文字→OCR→文字 PDF 的非法阶段回退；未改变 PDF 分类、API、schema 或 PPT 行为。
- 修复前回归实际触发 `DOCUMENT_JOB_ILLEGAL_TRANSITION` 并最终 `FAILED_LOCAL`；修复后 runner 12/12。真实 51 页 PDF/Tauri GUI 仍待验收。

### Server Sync retention 定时事务修复（2026-09-09）

- `SyncRetentionService.scheduledPurgeExpired()` 现在从 Spring 调度代理入口即建立事务，真实 JPA delete query 不再因同 Bean 自调用绕过 `purgeExpired()` 的事务代理而抛出 `TransactionRequiredException`。
- 新增 Spring 代理入口回归测试；测试先复现异常，修复后聚焦用例 1/1、`SyncServiceTests` 11/11 通过。未修改 API、数据库 schema 或 retention 语义；重建 backend 后的实际 scheduled run 仍待运行日志复核。

### PC ParsedDocument upload trace（2026-09-09）

- 新增有界 `[Document Upload Trace]` 开发日志，记录 PUT/complete 边界与稳定失败阶段，保持现有重试、缓存安全和状态机不变；真实 Tauri/MinIO/Server/GUI 仍待验收。

### PC ParsedDocument stale/current revision preflight correction（2026-09-09）

- scheduler 先执行一次权威 Source GET 取得当前 revision，再处理 stale jobs，并只在 current revision 选定后校验 cache ownership；stale corrupt row 不再阻塞 valid current row。
- current mismatch 仍阻止后续 hash、runner、上传网络和 cache deletion。scheduler 33/33、完整 PC R4 259/259、type-check、diff-check 通过；真实 Tauri/Server/MinIO/GUI 仍待验收。

### PC ParsedDocument recoverable server-phase mismatch（2026-09-09）

- `SERVER_VALIDATING`/`SERVER_INDEXING` 的本地 cache ownership mismatch 现在合法进入 `FAILED_LOCAL` 并支持 retry；READY/FAILED_SERVER 保留原 phase。scheduler 在一次权威 Source read 后对选中的 current revision 完成本地关系预检，异常时不执行后续网络、OCR 或 cache deletion。
- schema 17/17、scheduler 32/32、完整 PC R4 258/258、type-check、diff-check 通过；真实 Tauri/Server/MinIO/GUI 仍待验收。

### PC ParsedDocument phase-safe cache mismatch closure（2026-09-09）

- scheduler schema-v1 cache ownership mismatch 统一走 phase-safe cleanup failure preservation；READY、SERVER_VALIDATING、SERVER_INDEXING、FAILED_SERVER 不再非法迁移到 FAILED_LOCAL，recoverable phases 仍按既有规则失败。两侧 cache ID/receipt 保留，且不会删除 mismatch cache 或触发网络/OCR。
- Real repository table regression 31/31，完整 PC R4 256/256、type-check、diff-check 通过；真实 Tauri/Server/MinIO/GUI 仍待验收。

### PC ParsedDocument cache-safety follow-up（2026-09-09）

- READY 派生 cache 现在删除成功后才清除本地 receipt/ID；删除失败保留证据并允许后续 READY scheduling 重试，不重新执行 upload/parser/backend 请求。
- schema-v1 cache ID ownership mismatch 在 scheduler 和 coordinator 的网络边界前统一拒绝。Focused upload 16/16、scheduler 30/30、schema 16/16，完整 PC R4 255/255、type-check、diff-check 通过；真实 Tauri/Server/MinIO/GUI 仍待验收。

### PC ParsedDocument upload 状态迁移修复（2026-09-09）

- complete 返回 `ACCEPTED` 后，PC coordinator 现在按现行本地状态机依次持久化 `SERVER_INDEXING`、`READY`，不再直接跨越中间阶段；未修改迁移表或 scheduler 的 READY 后 cache cleanup 责任。
- TDD 回归先用真实 `DocumentProcessingJobRepository` 复现 `DOCUMENT_JOB_ILLEGAL_TRANSITION`，修复后 ParsedDocument upload 15/15、processing flow 1/1、job schema 16/16、source scheduler 27/27、完整 `npm.cmd run test:r4-pc` 251/251、`npm.cmd run type-check` 与 `git diff --check` 通过。真实 Tauri/Server/MinIO 与 GUI 仍待验收。



### PC ParsedDocument schema-v1 打包与兼容恢复（2026-09-08）

- Rust packager 现在生成单个 gzip JSON schema-v1 envelope，Java validator/complete 与共享 fixture 对齐；不提供 NDJSON fallback。
- 本地加密 cache/receipt 保存 `parsed-document-v1`、Source Asset SHA 和 parser metadata；兼容 receipt 直接续传，旧或不完整 receipt 在 upload intent 前只清理派生 cache 并重建一次。未新增 Server migration 或 OpenAPI shape。
- 自动验证：Rust packager 5/5、cache 5/5、upload 8/8，Java 定向 8/8，最终 scheduler 27/27、完整 PC R4 250/250、type-check 和 `git diff --check` 通过。Final reviewer 的所有 Critical/Important findings 已关闭；真实 Tauri/Server/MinIO 与 `1.pdf` GUI retry 仍待人工验收。

### PC ParsedDocument PUT 安全诊断增强（2026-09-08）

- Tauri 上传失败日志在 `reqwest::Error::without_url()` 后增加 request/builder/redirect/status/decode 等 flags，并最多保留三层 source cause；对 URL、预签名 query、Authorization、header value、路径和控制字符执行脱敏，最终诊断总长限制为 256 字节。
- 保持现有 `NETWORK_OFFLINE:*` 错误码、前端诊断和 SQLite 持久化契约不变；真实 Tauri/MinIO 上传根因仍待人工复现。

### PC ParsedDocument cache payload 长度修复（2026-09-08）

- 修复加密 cache receipt 把 envelope 总大小误记为 `payloadBytes/payloadSha256` 的问题；receipt、服务端 upload intent、Rust `Body::sized`/`Content-Length` 和发送后校验现在都对应解密 reader 实际 gzip payload。
- 历史 receipt 若 `payloadBytes === encryptedBytes`，恢复上传前通过 owner-scoped native cache reader 重新计算 payload size/hash，不要求重新 OCR 或重新打包。

### PC OCR 诊断文档同步（2026-09-08）

- 记录 OCR 页级 continuation、全空文档 `OCR_DOCUMENT_EMPTY`、有界可复制诊断及本机隐私边界；focused 自动测试与 Rust 检查结果按本轮报告登记。
- 未宣称 `1.pdf` 真实 Tauri GUI、剪贴板/accessibility、sidecar 日志或 OCR 质量验收通过；这些仍需人工验证。

### PC 断网上传恢复状态机（2026-09-08）

- 带持久化 payload receipt 的 `PAUSED_NETWORK` 任务继续时经 `QUEUED -> UPLOADING` 直接续传，不重跑 OCR、download 或 hash；`NETWORK_OFFLINE` 保持稳定错误码，详情仅保留 allowlist reason。真实 Tauri/MinIO PUT 与 GUI 成功仍待验收。

### PC/Server/Mobile 全端认知负荷移除复核（2026-09-07）

- 后端移除 `TaskEntity` 及其相关 DTOs 和视图中的 `cognitiveLoad` 字段，完成 V20 Flyway 数据库迁移：丢弃旧负荷值，保留 Task 同步 JSON 中的其余字段、cursor 和版本。
- PC/Mobile 前端移除所有的 `load` 和 `loadText` 参数，并更新了 `Timeline`、`SubjectWorkspace` 及双端本地存储的 JSON 同步解析逻辑，不再回传并清理旧废弃数据。
- 本轮自动证据：Server OpenAPI/V20 定向 8/8；PC type-check 及 R4 211/211；Mobile type-check、R4 静态检查及协议测试 21/21。Server 全量 198 项仍有 28 个已知环境/共享数据错误，OpenAPI 整体门禁仍受既有 WebSocket/JsonNode 漂移阻断；真实 PostgreSQL 和 GUI/真机验收尚未执行。
- 确认全仓无残留，并保护了 PC 端独立增加的文件上传验证以及其它近期的 2026-09-07 修复成果。

### PC 失效会话与浏览器 JSZip 入口收口（2026-09-07）

- refresh session 因后端重建失效时，PC 清除本地 access/refresh token 并进入 `reauthentication-required`；受保护 Axios、sync 和 Source document background scheduling 停止，避免 realtime ticket 与 Asset download-url 的 401 无限扩散，也不再调用受保护 logout 进行递归清理。
- 登录、注册、refresh 和 health 保留恢复路径；现有 refresh 单飞与单次请求重放行为保留。
- PPTX parser 使用自包含 JSZip 浏览器 bundle，Vite 对包根入口增加精确 alias，不使用空 stream polyfill。
- 本轮聚焦 Node 回归 24/24 通过；完整 Vite build、真实 Tauri bundle 产物扫描和 GUI 验收仍未完成。

### MinIO 真实读写健康检查与非破坏性恢复（2026-09-07）

- 保留 `auralis_auralis-minio-data` volume，诊断宿主/容器容量、inode、挂载和权限后，仅安全重启并安全重建 MinIO 容器以加载配置；未删除 volume、数据库或对象。
- Compose MinIO healthcheck 现在用随机 `.healthcheck/` 对象执行 PUT、HEAD、GET、DELETE，并清理测试对象；回归断言 `scripts/minio-healthcheck.test.mjs` 通过。
- 复核证据：最终独立 PUT/HEAD/GET/DELETE 通过，MinIO ready 和 backend readiness HTTP 200；Tauri 三任务未执行 GUI 重试，仍待人工验收。

### PC OCR sidecar 临时目录与文档处理恢复复核（2026-09-07）

- OCR sidecar 启动前创建应用 cache 专属临时目录，将 TEMP/TMP 指向该目录；只有受管 sidecar 已停止时才清理该目录直属 `_MEI*` 文件夹，不触碰系统 TEMP 其它目录。
- 保留最多 20 行、每行最多 1024 字符的 stderr tail，并将 PyInstaller extraction failure 保留为稳定的 `OCR_SIDECAR_UNAVAILABLE:pyinstaller-extraction-failed` 诊断后缀。
- PPTX 使用 OOXML presentation relationships 读取实际 slide 顺序/页数/文本；49 页真实 fixture 和 legacy OLE `.ppt` 拒绝回归通过。Tauri invoke 归一化补充结构化错误对象，Rust PUT 补充 client 网络诊断。
- `SERVER_VALIDATING/SERVER_INDEXING` 的网络失败现在可进入 `PAUSED_NETWORK`；带持久化加密 receipt 的暂停上传恢复时不重新下载或哈希原始 Asset。Docker Desktop unable to start，真实 Server/MinIO/Tauri GUI 验收仍待外部依赖恢复。

### PC 文档调度、Office 提取与 OCR 可诊断性（2026-09-06）

- 切断 job 变化通知重新加载 Source 所形成的递归调度；任务通知现在只刷新处理 Store。
- 允许 `UPLOADING -> FAILED_LOCAL`，并将 stale `PACKAGING` 归类为本地失败，保留真实错误而不是二次抛出 `DOCUMENT_JOB_ILLEGAL_TRANSITION`。
- Office bridge 先收集锚点再读取文本 chunks；无可靠页数的纯图片 Office 文件返回 `DOCUMENT_FILE_TYPE_UNSUPPORTED`，不再使用误导性的 `OFFICE_PAGE_COUNT_UNAVAILABLE` 或锚点数量伪造页数。
- OCR warmup 使用受控 1×1 PNG 走现有 sidecar 协议并实际初始化模型；Rust 侧捕获最多 20 行、每行最多 1024 字符的 stderr，记录启动/读写/退出诊断，同时保持面向 UI 的安全错误码不变。
- focused Node 42/42、Python sidecar 11/11、Rust OCR 7/7 与 `cargo check --lib` 通过；真实 Tauri/Server/MinIO GUI 联调仍待验收。

### PC PDF 解析与 Source 调度竞态修复（2026-09-06）

- `PdfTextAdapter` 通过 Vite `?url` 将同版本 `pdf.worker.min.mjs` 绑定到 `pdfjs.GlobalWorkerOptions.workerSrc`，PDF.js 不再依赖 CDN 或缺省 worker 配置。
- `useSourceStore` 的自动文档调度现在要求 `AWAITING_CLIENT` Source 已有非空 `assetId` 与 `ingestionRevision`；本地 Source CREATE 尚未同步时不再提前请求服务端并触发 404 孤儿清理，待同步投影带 revision 后再创建本地 job。
- 新增 Source 调度策略回归；PDF runtime、Source 注册及相邻文档处理 focused 测试 70/70 通过，Vite production build 通过。PC type-check 仍受既有 `useTaskStore`/Timeline 共 7 项错误阻断；认证、MinIO、API 与数据库契约未修改，真实 Tauri/Server/MinIO GUI 联调仍待验收。

### PC 上传与处理恢复（2026-09-05）

- Tauri keyring 3 显式启用 `windows-native`，继续使用 `auralis/master_key`，不增加明文或环境变量回退；新增 Windows-only 跨新 Entry 写入/读取/精确清理测试，但本机 `cargo test` 因 Credential Manager `NoStorageAccess(Error(1312))` 未通过，真实持久化仍未验收。
- StatsQueryRepository 在 JDBC 参数边界统一将 `Instant` 转为 `Timestamp`，保持 SQL、API 和 schema 不变；测试覆盖六个统计查询的全部时间参数、UUID 和顺序，`StatsQueryRepositoryTests` 与 `StatsServiceTests` 共 3/3 通过。
- 上传入口仅接受 PDF、DOC、DOCX、PPT、PPTX；图片/文本保留预览能力但在 upload intent 前拒绝，`canPreviewFile()` 与 upload allowlist 解耦，SubjectWorkspace 给出支持格式提示。
- DocumentProcessingCenter 区分本机等待 `AWAITING_CLIENT` 与服务端 `VALIDATING/PARSING/INDEXING`，`DocumentProcessingDot` 复用共享 Source 状态映射，未知/undefined phase 使用中性同步提示并将 `READY` 显示为“处理完成”，保留本地任务 retry/cancel/start 行为；本轮 file-preview 27/27、processing UI 1/1、runtime static 9/9 通过。真实 Tauri/Server/GUI 验收仍开放。

### PC 孤儿 Source 调度清理（2026-09-05）

- `SourceJobScheduler` 仅在 `sourceApi.get(sourceId)` 边界识别结构化 `ApiProblemError` 的 HTTP 404 或 `problem.code === 'RESOURCE_NOT_FOUND'`；命中后复用 owner-scoped `discard(sourceId)` 清理文档任务和加密 cache，并返回稳定的 `{ status: 'SKIPPED', reason: 'SOURCE_NOT_FOUND' }`。非 404 异常继续原样拒绝并保留任务，后续 parser/upload 异常不使用该分类。
- TDD focused scheduler suite 14/14、相邻文档处理套件 35/35、`check:r4-pc`（87 个生产文件）和 `git diff --check` 通过；`npm run type-check` 退出 1，7 项既有错误位于 `useTaskStore.ts`（3 项）和 `Timeline/index.vue`（4 项），未归因于 scheduler。开发环境在停止当前仓库 Tauri 进程树后，已精确删除应用配置目录中的 `auralis.db`、`auralis.db-wal`、`auralis.db-shm`；未删除同目录其它内容。重启后数据库与完整表集重新建立，远端投影恢复；文档任务随后暴露 master key 缺失并进入 `FAILED_LOCAL`，密钥恢复与重新上传另行验收。

### PC 本地优先同步核心（2026-09-04）

- 本地 schema 升至 v6；普通 Subject、Source、KnowledgeBlock、Task 写入原子保存资源投影和 immutable outbox，UI 在本地成功后立即确认，后台以合并调度执行 push 后 cursor pull。
- Store 列表仅从本地投影 hydration；远端响应仅结算对应 mutation，并在资源没有未解决本地 mutation 时更新投影。同一 cursor page 对每资源只应用最后一条 change，远端 tombstone 不覆盖本地未解决编辑。
- `r4-local-repository`、`r4-sync`、`r4-register-file` 定向 Node 套件 28/28 通过。完整 PC 门禁、类型检查、production build、Tauri GUI、弱网双设备与冲突可见性仍未验收。

### PC 学科文件删除即时投影（2026-09-04）

- `useSourceStore` 在 Source tombstone 和 DELETE outbox 持久化完成后，立即移除文件列表投影；同步与 parser/job/cache 清理继续后台执行，删除不再等待耗时的调度器收尾。
- `r4-file-preview` 删除顺序回归 20/20 通过；真实 Tauri 的 OCR 运行中删除、缓存清理及服务端同步仍待人工联调。

### PC 文件预览快速选择合并（2026-09-04）

- `FilePreview` 在启动二进制下载前合并 80ms 内的选择，并以 `AbortController` 中止被替代的 fetch，避免多份大文件同时转为 Blob 并进入 File Viewer。
- `r4-file-preview` 19/19 通过；真实 Tauri 大 PDF 首次解析仍待 GUI 验收。

### PC 单一文件预览（2026-09-04）

- 删除旧 `PdfViewer`、首页 PDF 伴读入口及其专项回归；资产库真实 Source 文件改用 `FilePreview`，保留既有签名下载、失败重试与 File Viewer 渲染路径。
- 资产树传递 Source `id`、`assetId`、`name`、`fileType`；删除 Asset 的 `filePath` 和不可达 Markdown 预览分支。`r4-file-preview` 24/24 通过；真实 Tauri/浏览器 GUI 验收仍待完成。

### PC Subject 全局主题色清理（2026-09-04）

- Dashboard、Timeline 与 Home 不再读取已删除的 `Subject.color`；学科相关视觉和新建知识块/任务默认统一为 `#7D9372`，Task 与 KnowledgeBlock 的 `colorOverride` 保持不变。
- Home 新建学科调用恢复为现行的 `addSubject(name, description, icon)` 签名。
- `r4-store-mapping` 10/10、`npm run type-check` 和目标差异检查通过；真实 GUI 仍待验收。

### PC 已完成排期任务固定（2026-09-04）

- 已完成且仍有 `scheduledAt` 的任务继续显示在原时间轴槽位；Store 拒绝其移动、替换和取消排期，Timeline/Dashboard 同时移除拖放与取消排期入口。
- 历史本地展示态任务记录不再兼容；`completed` 等弃用格式在本地加载时忽略，在线刷新以现行领域 DTO 重建。
- 新增固定任务的 Store 与页面回归。完整 PC 回归最新结果为 173/181，现有 8 项时间轴/本地优先契约失败仍待其他工作收敛；Tauri GUI 拖放未验收。

### PC SQLite 并发写入修复（2026-09-03）

- Tauri SQLite 改为应用生命周期单次加载、建表和迁移；按用户/服务端设备范围复用 repository，所有 SQL 插件命令走单一串行队列，并在初始连接设置 WAL 与 5 秒 `busy_timeout`。
- 同步 snapshot reset 改由 Rust `replace_local_resource_snapshot` 在同一连接事务内执行：未解决 mutation 的资源行保持不变，任何非法 snapshot 项都会回滚本批。
- `r4-local-repository` 11/11 与 Rust lib 13/13 已通过；真实 Tauri GUI、数据库升级和多写入压力验收仍待执行。当前 PC 全量回归与类型检查受其他未收敛工作树改动阻断，未将其记作本项通过。

### PC 时间轴本地任务投影修复（2026-09-03）

- Task Store 改用认证态 `serverDeviceId` 访问本地 repository，修复设备标识契约迁移后本地读取失败并清空时间轴任务的问题。
- 列表加载现在先返回本地任务投影、后台刷新云端；本地读取或云端刷新失败均保留已有任务。Timeline 与 Dashboard 切换日期只重建内存槽位，不再重新读取本地库。
- 旧本地排期字符串会统一为 UTC ISO instant，确保可参与自然周过滤、半小时槽位渲染与更新请求。展示回归和静态检查通过；完整排期回归、类型检查、构建和 Tauri GUI 验收仍见当前问题登记。
- 拖放更新不再等待远端 `PUT`：任务先写入当前用户/`serverDeviceId` 范围内的本地 repository 与 outbox，再更新 Timeline/Dashboard 内存槽位；后台 push/pull 失败不回退本地结果，本地写入失败通过页面通知反馈。原生 payload 现同时携带 `taskId` 与已排期任务的 `sourceSlotTime`，原槽放置为 no-op。双任务换位持久化原子组仍未完成，保留在 P1 风险。

### Subject 专属颜色移除（2026-09-03）

- 服务端 Subject API/Entity 不再暴露 `color`，新增 Flyway V19 删除 `subjects.color`；已有 Subject 行与 KnowledgeBlock/Task 的 `color_override` 保留。
- PC/Mobile 前端清理 Subject 颜色状态、同步和主题化残留，统一使用全局语义色；两端构建/回归与本地 Docker PostgreSQL V19 升级均已验证，真实三端 GUI/业务联调仍待人工验收。

### PC 扫描 PDF Runtime 统一与文档处理状态修复（2026-09-01）

- 根 `pdfjs-dist` 精确固定为 `5.4.624`，与 `@file-viewer/renderer-pdf@2.3.0` 一致；npm lockfile 已收敛为同一根级副本，PDF 本地适配器不再传递无效 `disableWorker`。
- FILE scheduler 在创建和结束时刷新 Pinia 处理状态及 Source；文件行和 Profile 同时反映本地解析与服务端 `VALIDATING/PARSING/INDEXING`，直至 Source `READY` 才开放提问；未挂载 Tauri runner 时 Profile 明确提示桌面端限制，不再显示为“暂无文件解析任务”。
- 恢复批次现在隔离单个 Source 失败，避免历史失败文件阻塞后续 `AWAITING_CLIENT` 文件；Profile 对无本地 job 的等待文件提供“开始本机处理”并显示触发失败。手动入口先同步并确认本地 Source 为 `synced`，否则显示可理解的同步状态，只调度已由服务端确认的资料。
- `useSourceStore` 接入 Pinia HMR 更新，开发页新增处理 action 时会更新既有 Store 实例，不再出现方法不存在。
- Tauri SQL capability 显式允许持久化任务写入；后端对未预期 API 异常输出带 trace ID、路径和异常类型的诊断日志，客户端仍只收到脱敏的错误响应。
- 文档 runtime 保留前置检查，Rust `document_package_begin` 同时成为新建加密 package/cache 的最终密钥边界：只有 keyring 明确返回 `NoEntry` 时才创建原生 `auralis/master_key`，其他 credential-manager 错误会以 keyring 访问失败报告；已有 cache/receipt 仍只读取既有密钥，密钥丢失时停止并提示恢复，不会新建密钥覆盖旧密文。
- 服务端自有 JSON 类型统一到 Jackson 3 `tools.jackson`；`/api/sync/push` 的 object payload 已通过 MockMvc 回归，ParsedDocument 的有界解压异常语义保持有效，并以源码守卫防止重新引入 Jackson 2。OpenAPI artifact 已与运行时文档同步。
- `/ws/events` 移除会抢占 WebSocket upgrade 的 MVC `GET` 回退；实时认证只通过一次性 ticket 在 WebSocket handshake 中消费，不再因缺失 MVC principal 产生 500。真实 Java WebSocket client 已验证已签发 ticket 在不携带 Bearer header 时可成功 upgrade。
- 删除 FILE Source 现在会停止运行中的本地 parser，按当前用户/设备清理全部文档任务、关联加密 cache 和内存输入，并刷新 Profile；学科页经 Subject Store 重算文件计数。调度竞争只会安全跳过已删除 Source，不会重建任务。
- OCR 完成释放其 PDF.js document；预览签名 URL 下载加入最新选择门禁，旧响应不会覆盖当前 File Viewer 输入，降低扫描 PDF 在切换或 OCR 结束时反复重载的风险。
- 新增 PDF runtime、状态通知、删除清理与扫描型 FILE 组合链路回归；文档删除/预览定向 52/52、Rust 12/12、PC 全量 165/165、type-check、静态检查（80 个生产文件）、production build，以及 Realtime service/controller/HTTP upgrade 5/5 均已通过。扫描样本用 PDF.js `5.4.624` 实测加载 50 页、首屏无文本层且位图绘制成功；真实 Tauri/Server/MinIO GUI 联调仍待验收。

### 文档设计稿与实施计划目录归类整理（2026-09-01）

- 设计稿统一归入 `docs/design/`，已批准的详细实施计划统一归入 `docs/plans/`；文档入口与交叉链接已同步更新。
- 清理计划文档中的外部工作流指令，保留项目设计、实施步骤和验证内容。

### PC/Mobile 设备标识契约切换（2026-08-29）

- 客户端生成并持久化的设备注册标识统一为 `clientDeviceKey`；服务端设备主键、AuthResult/Session、Sync、本地隔离 scope 和 JWT claim 统一为 `serverDeviceId`。
- `POST /api/realtime/ticket` 改为无请求体，服务端从 Bearer JWT 解析并校验 `serverDeviceId`；旧 `deviceId` 字段不保留，也未增加兼容测试。OpenAPI artifact 与 PC/Mobile 生成 schema 已更新。
- PC `test:r4-pc` 150/150、Mobile `test:r4-mobile` 21/21、两端 type-check 通过；真实 Server、Realtime/WebSocket、移动端真机和 Tauri GUI 联调仍待验收。

### PC 时间轴过去时段保护（2026-08-31）

- 目标 `scheduledAt` 严格早于当前时刻时，PC Store 拒绝拖放排期、按天排期与已排期任务换位，保留原任务数据并使用既有错误反馈；换位校验两个任务的目标时段后才调用原子换位接口。
- 新增可注入时钟的纯判定与三条入口回归，确保被拒绝的操作不会调用 Task API、离线 mutation 或排期换位接口。
- PC 定向测试 28/28、`test:r4-pc` 154/154、`type-check`、`check:r4-pc`（80 个生产文件）和生产 build 通过；真实 Tauri GUI 拖放和服务端联调仍待人工验收。

### PC 任务到期自动转换（2026-08-31）

- Store 在启动 fetch 和每分钟检查中，把已过 `scheduledAt` 且未完成/未取消的任务更新为 `DONE`，同时保留排期；无排期且已过 `dueAt` 的任务显式提交 `dueAt: null`，进入未排期分组。
- Task 更新请求支持显式 `dueAt: null`；全局页面不再维护任务到期提醒。
- PC 任务/视图定向回归 26/26、`test:r4-pc` 152/152、`type-check`、`check:r4-pc`（80 个生产文件）和生产 build 通过；真实 Tauri GUI、服务版本和冲突/断网路径仍待人工验收。

### PC/Backend 任务排期原子性与逾期回归（2026-08-27）

- PC 在 API 边界统一将 `scheduledAt` 归一化为 UTC ISO instant；后端把时间反序列化失败转换为字段级 `400 VALIDATION_FAILED`，避免展示字符串 `Thu 08:30` 被当作 `Instant` 提交时返回未处理 500。
- 新增 `POST /api/tasks/schedule-swaps`：服务端以稳定顺序悲观锁定两项任务，在单事务内交换排期并校验版本/截止时间，任一失败均回滚。Dashboard、Timeline、Home 的拖拽 payload 改为任务 ID 与原槽位，原槽 no-op，拖回待办按任务 ID 取消排期。
- 登录后会将逾期可行动任务自动回归未排期并从任务视图隐藏，App 以一次可关闭提示列出受影响任务。`CoreDomainControllerTests` 5/5、PC `test:r4-pc` 142/142、type-check、生产 build 和 `git diff --check` 通过。真实 Tauri 原生拖放、冲突/断网和逾期提示仍待人工验收；Mobile generated schema 因外部文件锁尚未同步，详见当前问题登记。

### PC 任务未排期与排期视图显示修复（2026-08-28）

- 资产库任务分组的用户可见文案统一为“未排期”，保留原有 focus query 兼容。
- 逾期任务由 Store 自动取消排期后重新进入待排期队列；时间轴不再额外隐藏仍带排期的逾期任务，取消排期失败时保留原排期以暴露失败状态，完成/取消规则不变。
- 排期页移除高中低负荷的可见标签，内部负荷字段和分析逻辑保留；逾期清单提示按认证会话去重，同一会话内子页面刷新不再重复弹出，登出后新会话可重新提示。PC `test:r4-pc` 145/145、type-check、静态检查通过；真实 Tauri GUI 仍需人工验收。

### PC Vite 开发 HMR 竞态修复（2026-08-27）

- `@vitejs/plugin-vue` 显式使用 `vue/compiler-sfc`，避免 File Viewer 开发期资源复制触发早期 HMR 时读取空 compiler 并报 `invalidateTypeCache`。
- Vite watcher 忽略 `public/file-viewer/**` 生成资源，保留资源复制/静态服务但不触发业务热更新。
- `test:r4-pc` 138/138、type-check、静态检查、Tauri `--no-bundle` 通过；真实 Tauri dev 热更新仍需人工重启确认。

### PC Tauri debug 前端启动修复（2026-08-26）

- 修复 `tauri-plugin-log` 默认文件日志目标在已有日志文件/目录状态下返回 Windows `os error 183`、导致 debug/Tauri dev 在窗口创建前退出的问题。
- debug 日志改为 stdout 目标；新增静态回归断言，`cargo run` 已能正常越过原崩溃点。真实 Tauri GUI 仍需人工验收。

### PC Tauri 白屏运行时修复（2026-08-26）

- 独立 WebView2 证据确认资源加载成功，白屏由公共登录路由仍挂载 `AppSidebar` 并在无 refresh token 时抛出未处理 401 刷新异常触发。
- `/login` 现使用独立公共布局；认证壳、实时运行时和侧栏仅在完整 user+token 会话下启用，侧栏学科请求增加异常兜底；路由与登录页统一完整会话判定。
- `test:r4-pc` 137/137、type-check、Tauri `--no-bundle` 通过；真实 Tauri GUI 重启后的登录/过期验收仍待执行。

### PC Tauri 上传/解析联调修复（2026-08-26）

- `DocumentProcessingRuntime` 在加载 Source 和恢复本地解析任务前先执行一次完整 `triggerSync`，让应用重启后遗留的 SOURCE outbox 能先到达服务端并创建解析任务。
- 保留既有 localStorage fallback，避免尚未迁移的待同步 outbox 因切换到空 SQLite 而暂时不可见；SQLite capability 迁移另行处理。
- Docker 本地 `AURALIS_MINIO_PUBLIC_ENDPOINT` 默认改为 `http://127.0.0.1:9000`，避免 Windows `localhost` 解析到不可达 IPv6 `::1` 时预览/直传出现 `Failed to fetch`。
- 新增 runtime 与 Tauri capability 回归断言；真实 Tauri 上传、任务中心和扫描 PDF 预览仍需人工复测。

### PC Tauri AI 辅助阅读 A1–A4、K2、U1–U3 自动门禁（2026-08-26）

- 服务端新增 V16 阅读会话 scope/清理、已完成历史 Prompt 组装、`readingContext` 当前 Source 检索和同学科确定性升级；OpenAPI artifact 与 PC/Mobile 生成 schema 已同步。
- PC 学科工作区创建并清理临时 `READING_SESSION`，未 READY 文件提示前往 Profile；文件列表仅显示解析状态点，Profile 提供阶段/进度/失败重试/取消；预览原生选中文本可解释、追问或确认保存为知识块。
- 文件状态点仅在任务进入 `READY` 后消失；本地/服务端失败保留红色静态点并引导到个人中心重试。
- 服务端 AI/OpenAPI 定向 31/31、PC `test:r4-pc` 135/135、type-check、Web build 和 Tauri `--no-bundle` 通过。真实 Server/MinIO/Provider、扫描 PDF/Office/Tauri GUI、断网重启、MSI 和业务质量仍待人工验收；按用户授权跳过独立 commit。

### PC Tauri AI 辅助阅读 G1–G4 技术门禁（2026-08-24）

- G1 冻结 OCR stdin/stdout 协议、错误码、路径/大小边界和五组离线 fixture；G2 固定 RapidOCR/PP-OCRv6-small、模型哈希、依赖锁和 PyInstaller sidecar；G3 接入 Tauri Rust supervisor、串行队列、超时和重启预算，相关定向测试通过。
- G4 已声明 target-triple `externalBin`、`../ocr-sidecar` resources、第三方 notices 与 CycloneDX SBOM；最终 MSI 生成 220,286,976 bytes，verifier 通过 generated WiX 对 sidecar、三个模型、manifest、notices 和 SBOM 的引用，五组 fixture 离线 baseline 已固化到 `budgets.json`。
- 复核发现 WiX 实际 externalBin 文件名为 `Bin_auralis_ocr.exe`，先补失败测试再修正 supervisor resolver；5 个 Rust OCR supervisor 测试通过。临时 all-users 安装返回 Error 1925/1603，安装后 GUI/OCR 留给 R2；用户已授权继续 G5。
- G5 已接入固定尺寸、不可 `display:none` 的 `BackgroundParserHost` 和 `FileViewerParserBridge`，复用 File Viewer 文本块/锚点 API，并提供 bitmap fallback/`OFFICE_TEXT_UNAVAILABLE`；type-check 与静态契约 2/2 通过，DOC/DOCX/PPT/PPTX 真样本矩阵仍待补齐。
- G5 实现后的现有 PC 回归 `test:r4-pc` 通过 102/102；用户已将 DOC、DOCX、PPTX 和 text-layer/扫描型 PDF 放入 `docs/test`，并由 Apache POI 生成真实 OLE 旧式 PPT fixture；Office fixture matrix 3/3 通过，实际 File Viewer/Tauri 运行时结论仍待验收。
- G6 新增 bounded `DocumentParser`、PDF text-layer/扫描分类、逐页 OCR、Office direct/fallback、Unicode 归一化和 sink 背压；core parser 7/7、真实 PDF 分类 2/2、Office matrix 3/3、PC 回归 102/102 和 type-check 通过。
- C1 新增本地 schema v3 `document_processing_jobs`，固定用户/设备/source revision 唯一键、合法 phase 状态机、原子 checkpoint 及浏览器 v3 namespace；定向 schema/repository 测试 3/3 通过。
- C2 新增 4 MiB 分块 gzip/AES-GCM ParsedDocument cache、AAD scope、plain/payload 双 hash、nonce/tamper/atomic replace 校验、内部解密 reader 与 package commands；Rust 全量测试 10/10、JS contract 2/2、type-check 通过。
- C3 新增单设备串行可恢复 `DocumentJobRunner`、app close/sidecar/network 错误策略、最多三次自动重试、人工 retry/cancel 和 Pinia store；runner 测试 5/5、type-check 通过。

### PC Tauri AI 辅助阅读 K1 OpenAPI/SDK 契约冻结（2026-08-24）

- 为 Source/Asset/ParsedDocument DTO 固定独立 OpenAPI schema 名称，避免同名 `Response`、`CreateRequest` 和 `UploadIntent` 在生成文档中互相覆盖；ParsedDocument 两条 route 明确 `201/200/409` 响应及 `PARSED_DOCUMENT_CONFLICT`、`INGESTION_REVISION_STALE`。
- Source schema 暴露 `AWAITING_CLIENT`/`VALIDATING`，`ingestionRevision` 为客户端只读；ParsedDocument upload intent 的 `ocrModelVersion` 保持可选；PC `useSourceApi` 已接入 typed upload-intent/complete wrapper，Mobile 仅同步生成类型。
- `OpenApiArtifactTests` 4/4、`scripts/check-openapi.ps1` 和 PC `npm run type-check` 通过；未创建独立 commit，按用户授权纳入后续统一提交。

### PC Tauri AI 辅助阅读 C4 加密 ParsedDocument 上传闭环（2026-08-24）

- 新增 Rust `document_upload_put`：从本地 AES-GCM cache 内部解密 reader 流式 PUT 到签名 URL，按实际 bytes/SHA-256 校验，网络、过期 intent 和非 2xx 状态映射为稳定错误码；签名 URL、headers 和正文不进入 Vue 或本地任务表。
- 新增 PC `ParsedDocumentUploadCoordinator`：以任务 phase/receipt 驱动 upload-intent → PUT → complete；过期 URL 重新申请而不重复 OCR/package，网络暂停可恢复，complete 在 coordinator 生命周期内去重并处理 `INGESTION_REVISION_STALE`。
- 本地文档任务 schema 升级为 v4，`ingestion_revision` 对齐服务端 UUID；旧数字 v3 任务复制到 legacy 表后转为文本。Rust 12/12、C4 JS 6/6、PC 回归 108/108、PC type-check 通过；按用户授权跳过独立 commit。

### PC Tauri AI 辅助阅读 C5 FILE Source 调度与可恢复续传（2026-08-24）

- 新增 `SourceJobScheduler` 与 Source Store 调度接线：FILE Source 在 `AWAITING_CLIENT + ingestionRevision` 时创建本地 job，优先使用当前上传会话 File，移动端创建/重启恢复通过 owner-scoped Asset download adapter 获取临时输入；TEXT/URL 保持服务端 ingestion。
- 本地 job schema 升级 v5，持久化 `DocumentCacheReceipt` 非敏感元数据；runner 对 `PACKAGING`/上传阶段不重复 OCR/package，scheduler 核对 Asset SHA、supersede 旧 revision、完成后清理 cache 和临时输入，签名 URL 不进入本地存储。
- C5 定向 21/21、完整 PC 回归 128/128、type-check、R4 静态检查通过；真实 Tauri 私有临时目录、MinIO/Server 联调、跨设备恢复和 GUI/安装验收仍待完成；按用户授权跳过独立 commit。

### PC Tauri AI 辅助阅读 C5 runtime 接线（2026-08-26）

- 新增 `DocumentProcessingRuntime` 与全局 `BackgroundParserHost` registry；Tauri 登录后自动组装 SQLite job repository、PDF.js/Office parser、Tauri OCR、Rust package/cache、ParsedDocument upload coordinator 和 Source scheduler，sync/online 后恢复 pending jobs，登出时解绑。
- 暂停网络且已有 durable cache receipt 的任务可从 `UPLOADING` 边界恢复；SQLite 初始化兼容 Tauri v2 `__TAURI_INTERNALS__`。新增 runtime 静态契约和暂停恢复覆盖，`test:r4-pc` 131/131、type-check、Web build、`check:r4-pc`（79 文件）通过；真实 Tauri/MinIO/Server/GUI 联调转入人工验收；按用户授权跳过独立 commit。

### PC Tauri AI 辅助阅读 S1 V15 数据结构（2026-08-24）

- 追加式 Flyway V15 新增 `sources.ingestion_revision`、`parsed_documents` 派生表和 `ingestion_jobs.parsed_document_id/ingestion_revision`；ParsedDocument 保留 parser/normalization/OCR model、Asset/payload/plain-text SHA、私有 object key、状态、generation 与对象生命周期字段，不进入同步表或普通 mutation。
- Source 状态约束加入 `AWAITING_CLIENT`、`VALIDATING`；历史非 READY FILE 迁移为 `AWAITING_CLIENT` 并获得稳定 UUID revision，既有 READY FILE 与活动 chunks 保持 READY。
- `ParsedDocumentSchemaTests` H2 clean/upgrade 4/4 通过；PostgreSQL upgrade 断言已加入 `PgVectorMigrationIntegrationTests`，本机 Docker 不可用因此保持未验收。

### PC Tauri AI 辅助阅读 S2 Source ingestion 分流（2026-08-24）

- `SourceEntity`/`SourceView`/Source DTO 已承载服务端只读 `ingestionRevision`，新增 `AWAITING_CLIENT` 与 `VALIDATING` 枚举状态；客户端请求模型不接受 revision 写入。
- FILE create、Asset 替换和 FILE reingest 进入 `AWAITING_CLIENT`、轮换 revision 且不发布旧 `SourceIngestionRequestedEvent`；TEXT/URL 继续使用 `PENDING` 和现有 server ingestion event。FILE 仅标题等不影响解析的更新保留当前状态。
- Source/Ai ingestion 定向测试 11/11 通过，覆盖 FILE 无事件、TEXT/URL 事件、revision 不可覆盖和 FILE 资产替换/reingest。

### PC Tauri AI 辅助阅读 S3 ParsedDocument upload intent（2026-08-24）

- 新增 `ParsedDocumentStatus`、JPA `ParsedDocumentEntity/Repository` 以及 owner-scoped `POST /api/sources/{sourceId}/parsed-documents/upload-intents`；schemaVersion 当前固定为 1，服务端生成私有 `users/{user}/sources/{source}/revisions/{revision}/parsed-documents/{id}` object key，并将元数据以 `UPLOADING` 状态保存。
- upload intent 只接受匹配的 FILE Source/revision、payload SHA-256 和正数且受配置上限约束的 gzip payload 大小；不接受客户端 userId/objectKey，签名 headers/expiry 由现有 AssetStoragePort 返回，Source 保持 `AWAITING_CLIENT`。
- `ParsedDocumentControllerTests` 3/3 通过；S3 未包含 complete、payload 流式验证或首胜 indexing 语义，后续由 S4/S5 实现。

### PC Tauri AI 辅助阅读 S4 payload validator 与 Asset SHA 回填（2026-08-24）

- 新增有界流式 `ParsedDocumentValidator`：服务端按 upload-intent 的 gzip 大小核对压缩 bytes，限制解压字节/比例/block 数/单 block 与总字符数，拒绝未知字段、非法 UTF-8、非连续 ordinal、错误 schema、规范化正文 characterCount/plainTextSha256 和 payloadSha256。
- `AssetService.ensureSha256` 只从服务端原始对象流计算历史空 SHA，并用条件更新保证并发回填不会 last-write-wins；客户端声明不作为可信哈希。
- `ParsedDocumentValidatorTests` 4/4、`AssetShaBackfillTests` 2/2 通过；S4 未包含 complete 首胜和 indexing，后续由 S5/S6 实现。

### PC Tauri AI 辅助阅读 S5 complete 首胜与 indexing job（2026-08-24）

- 新增 `POST /api/sources/{sourceId}/parsed-documents/{parsedDocumentId}/complete`。服务端在 owner-scoped Source 行锁内校验对象 HEAD、Asset SHA、payload SHA、revision 和有界 payload schema；首个有效 ParsedDocument 进入 `ACCEPTED`，Source 进入 `INDEXING`，并创建带 `parsedDocumentId`/`ingestionRevision` 的唯一 PENDING indexing job。
- 同一 ParsedDocument 重放和同 revision + 同 payload SHA 的重复上传幂等；不同 payload 返回 `PARSED_DOCUMENT_CONFLICT`，旧 revision 返回 `INGESTION_REVISION_STALE`；并发 complete 只允许一个胜出。
- `ParsedDocumentCompleteTests` 3/3 通过，覆盖相同文档重放、相同 payload 重放、冲突、revision 过期和并发首胜；S6 的实际 ParsedDocument block 索引、generation 切换与对象清理仍待实现。

### PC Tauri AI 辅助阅读 S6 ParsedDocument indexing 与对象清理（2026-08-24）

- FILE indexing job 现在读取并重新验证 accepted ParsedDocument 的 blocks，使用其 generation 写入新 chunks；原始 FILE parser 不再作为该路径的回退，revision/generation 过期 job 只失败自身。
- FILE 兼容 reingest 复用 accepted ParsedDocument 与 revision；Asset 变更会标记旧 revision 的 accepted 派生记录为 `SUPERSEDED`。新增 cleanup scheduler 删除过期 `UPLOADING`/`REJECTED`/`SUPERSEDED` payload 对象并保留 ParsedDocument 审计行。
- `AiIngestionWorkerTests` 5/5、`AiSourceChunkTests` 3/3、`ParsedDocumentCleanupTests` 2/2 与 S5 回归通过；PostgreSQL upgrade 和实际 Tauri/Provider 联调仍待环境验收。

### PC File Viewer Vue ref 运行时 API 修复（2026-08-23）

- Chrome 真实运行复现点击缩放时的 `viewer.getZoomState is not a function`，确认 `@file-viewer/vue3-full@2.3.2` 包装组件通过空 `Proxy` expose，TypeScript 声明中的方法没有出现在 Vue 父级 ref 上；前一轮 ready 门禁调整不是最终根因。
- renderer 改用 `@file-viewer/vue3@2.3.0` 基础组件并通过 `withFullViewerOptions` 保留 full preset；缩放直接调用 `zoomIn`/`zoomOut`/`resetZoom`，旋转继续使用 `applyViewState`，Office renderer 保留外层旋转回退。
- Chrome 合成图片组件实测宽度由 800px 增至 896px、旋转角由 0° 变为 90°；定向预览回归 16/16、完整 `test:r4-pc` 101/101、type-check、静态检查和 Web build 通过。Docker 已无缓存重建，frontend 容器镜像 ID 与新镜像一致并返回 HTTP 200；真实业务文件和 Tauri GUI 仍待人工复验。

### PC 学科文件列表移除文件类型图案（2026-08-23）

- 移除学习文件行左侧的文件类型 Emoji 图案，文件名、大小、选中态和删除操作保持不变；新增静态回归断言，定向预览回归 17/17、完整 `test:r4-pc` 102/102。

### PC File Viewer 缩放/旋转无响应修复（2026-08-23）

- 移除 `FilePreview` 与 `FileViewerRenderer` 中依赖 `load-complete` 的两级 ready 硬门禁；动作只在组件 ref 尚未建立时暂存，避免正文已显示但生命周期事件未及时到达时点击被永久排队。
- 保留 File Viewer `applyViewState` 的缩放与 PDF/图片旋转路径，以及 Office 外层旋转回退；定向预览回归 16/16、type-check 和完整 PC 回归通过，真实 GUI 点击仍需复验。

### PC File Viewer PDF/图片缩放旋转与就绪队列修复（2026-08-23）

- 恢复 `FilePreview` 与 `FileViewerRenderer` 两级 ready 门禁，加载期间点击的缩放、重置、旋转和翻页操作会排队到 renderer 完成后执行。
- 缩放与 PDF/图片旋转统一通过 File Viewer `applyViewState` 执行；读取缩放状态增加未就绪保护，图片 renderer 自带旋转工具栏隐藏，Office renderer 在不提供旋转视图状态时回退外层旋转。
- 定向预览回归 16/16、完整 `test:r4-pc` 101/101、type-check、静态检查、Web build 和 Docker 重建已通过，frontend/backend HTTP 200；真实 PDF/图片 GUI 点击仍需人工确认。

### PC File Viewer 缩放与渲染遮罩修复（2026-08-23）

- 移除宿主 `FilePreview` 覆盖正文的“正在渲染文档”遮罩，避免首屏已可见时正文持续发白；加载语义保留在 `aria-busy` 和 File Viewer 内部状态。
- 缩放改用 File Viewer 通用视图状态 API 写入目标倍率，并将首次宽度适配设为用户交互后停止，避免 PDF 首屏 fit 将缩放操作重置；缩放与旋转分别放入同款简单圆角控制组。
- 定向预览回归 16/16、完整 `test:r4-pc` 101/101、type-check、静态检查和 Web build 已通过；真实 PDF/DOCX GUI 点击仍需人工验收。

### PC File Viewer 控件交互与留白修复（2026-08-23）

- 顶栏移除预览控件外层容器，缩放改为 `− / 实际倍率 / ＋`，旋转改为线条左旋图标、角度、线条右旋图标，并保留实体按钮的 hover/focus 层次。
- 预览上下文档留白收窄为 12–16px；按钮不再因 renderer 尚未完成而被直接禁用，点击操作通过 FilePreview/renderer 两级队列在就绪后执行，倍率通过 File Viewer `zoom-change` 回传，DOC/DOCX 左右旋转由 renderer 外层状态驱动。
- `test:r4-pc` 101/101、`type-check`、`check:r4-pc`（60 个生产文件）和 Web build 通过；真实 DOC/DOCX/PDF 样本的浏览器/Tauri GUI 仍待人工验收。

### PC 学科文件预览统一面板与拆分工具栏（2026-08-23）

- File Viewer 不再显示通用搜索、下载、打印、HTML、主题和内部重复工具栏；学科页现有文件名顶栏承载缩放/旋转，页码/总页数和前后页在预览主体底部以同级布局显示，renderer 内层边框/圆角移除。
- 保留 `FilePreview` 的签名 URL、下载、加载/失败和生命周期事件；新增宿主接线与 API 视图状态回归。补充 renderer 就绪前后的控制队列，顶部/底部栏增加轻微投影和实体按钮，中间文档上下保留 24–32px 安全留白。`test:r4-pc` 101/101、type-check、`check:r4-pc`（60 个生产文件）和 Web build 通过；真实 DOC/DOCX/PDF 样本的浏览器/Tauri GUI、分页能力与窄栏布局仍待人工验收。

### PC 文件预览工具栏简化（2026-08-23）

- File Viewer 隐藏通用搜索、下载、打印、HTML 导出、主题和重复缩放控件；PDF renderer 关闭导航侧栏，仅保留页码、缩放和旋转，并将控件栏移到预览底部。
- 新增工具栏配置静态回归；`test:r4-pc` 99/99、type-check、`check:r4-pc`（60 个生产文件）和 Web build 通过。真实 DOC/DOCX/PDF 样本的浏览器/Tauri GUI 仍待人工验收。

### PC 学科文件删除与同步竞态修复（2026-08-23）

- SubjectWorkspace 文件行的删除按钮恢复为悬停显示，键盘 focus-visible 仍可发现；行点击与删除按钮继续隔离。
- 本地 Source CREATE 尚未推送时，删除写入有序 DELETE outbox，不再提前直接请求远端 Source；已同步文件仍调用现有 Source DELETE 软删除。404、未登录、版本冲突和后端异常转换为明确反馈。
- 实时同步信号改为完整 push→pull；同步周期期间加入新 mutation 会在当前周期结束后自动再跑一轮。`test:r4-pc` 98/98；type-check、静态检查、Web build、Docker 重建和浏览器人工点击验收待执行。

### PC 学科文件改为知识块总结与软删除清理（2026-08-23）

- Antigravity Gemini 3.1 Pro 参与收敛 SubjectWorkspace：文件栏只显示真实 Source 文件，不再生成独立 `· 总结.md`；知识块入口承载总结，选中文件后直接显示无嵌套标题容器的 `FilePreview`。
- 文件行新增确认后的软删除入口，调用现有 Source DELETE；后端 `AssetRetentionCleanupService` 默认 30 天后按小时删除 MinIO 对象并将 Asset 标记为 `ORPHANED`，保留 Source/Asset 数据库审计行。
- 新增前端 flat-file/direct-preview/delete 回归与后端 MinIO retention 回归；`test:r4-pc` 95/95、type-check、静态检查、Web build、后端 `mvn -B -ntp test` 155/155 和 Compose config 通过。Docker 重建后 backend healthy、frontend HTTP 200、readiness `UP`；浏览器人工验收仍待执行。

### PC 学科文件大小即时显示（2026-08-23）

- 文件上传完成后的 `asset.sizeBytes` 现在会保留在本地优先 Source 副本，避免同步完成前学科文件列表显示 `0.0 MB`；该字段不会进入后端 Source 创建 mutation。
- 新增登记链路回归；`test:r4-pc` 94/94、type-check 和 Web build 通过。既有文件刷新及新文件浏览器 GUI 验收仍待执行。

### AI 失败日志保留原始异常诊断（2026-08-23）

- `AI_STREAM_FAILED`、`AI_PROVIDER_SELECTION_FAILED`、`AI_STREAM_VALIDATION_FAILED` 以及 embedding 失败事件现在输出异常类名、脱敏/截断后的 message 和 root cause，避免只剩统一 `VALIDATION_FAILED` 业务码。
- 新增 Authorization 脱敏回归；前端 Problem Details 仍保持安全统一错误码和 detail，不回显异常、密钥或上游响应体。
- `AiStreamingTests` 12/12 通过；Docker 运行态将在推送后重建并确认新字段出现。

### Docker MinIO 下载链路与资料大小修复（2026-08-23）

- MinIO 下载 URL 改为服务端离线 SigV4 签名，避免后端容器错误连接浏览器 public endpoint 的 `localhost:9000`，并增加脱敏失败阶段日志。
- Source FILE 响应返回可选 `assetSizeBytes`，PC 资料映射器使用真实 Asset 字节数，上传后不再固定显示 `0.0MB`。
- `MinioAssetStorageIntegrationTests` 3/3、`SourceAssetRelationServiceTests` 5/5、PC mapper tests 8/8 通过；Docker 临时账号真实 PUT/complete/download GET 链路通过。浏览器 GUI 仍待人工验收。

### PC 学科总结拆分为独立 Markdown 文件（2026-08-23）

- SubjectWorkspace 文件列表为每个真实资料增加 `· 总结.md` 独立虚拟项；原文件预览不再嵌套总结，点击总结项进入独立 Markdown 文档视图并可下载 `.md`。
- 总结由当前关联知识块实时生成，新增知识块仍归属原 Source；本阶段不新增后端 Source/Asset 持久化。`test:r4-pc` 93/93、type-check 和 Web build 通过，浏览器/Tauri GUI 仍待人工验收。

### PC Dashboard 窄宽待办名称显示修复（2026-08-23）

- 待办条目为学科徽标设置可收缩的最大宽度和省略号，避免长学科名称占满整行；任务名称在页面缩小时仍保留可见空间。
- 新增回归断言覆盖该 flex 布局边界，`test:r4-pc` 94/94、type-check 和静态检查通过；窄栏/浏览器缩放仍需人工验收。

### PC 学科统一文件预览（2026-08-22）

- 学科页新增统一 `FilePreview`：先通过服务端签名 URL 获取带正确扩展名的 `File`，再由自托管 File Viewer 渲染 PDF、DOC/DOCX、PPT/PPTX、图片和文本，并统一提供加载、失败、重试和下载状态。
- 上传选择器与拖拽入口共用文件能力注册表；Excel、未知格式及超过 50 MB 文件在创建 upload intent 前拦截，避免无效对象进入资产链路。
- `test:r4-pc` 92/92、`check:r4-pc`、SubjectWorkspace 契约、type-check 和 Web build 通过；Vite 已复制 47/47 File Viewer renderer assets。真实 Office 样本、浏览器/Tauri GUI 和窄栏布局仍待人工验收，必要时可在不改工作区契约的前提下切换 PDF renderer。

### PC 学科文件登记与 Docker MinIO 直传修复（2026-08-22）

- 文件登记确认现在校验文件、名称和归档学科，上传中防重复提交；直传或 Source 创建失败会显示通知并保留弹层重试，成功后刷新当前学科资料列表。
- MinIO 新增容器内 `AURALIS_MINIO_ENDPOINT` 与浏览器 `AURALIS_MINIO_PUBLIC_ENDPOINT` 分离配置，并使用 `AURALIS_CORS_ALLOWED_ORIGINS` 配置 API CORS，避免向浏览器返回无法解析的 `minio:9000`。
- `test:r4-pc` 82/82、PC type-check/static check、后端 clean test 149/149、MinIO public endpoint 集成测试 2/2 和 Compose config 已通过；Docker 重建后 frontend/backend 健康、readiness 和 MinIO CORS 预检通过，浏览器业务验收仍待执行。
- Backend 新增 `ASSET_UPLOAD_*` 与 `SOURCE_CREATED` 安全结构化日志，Docker 中可按阶段定位浏览器直传或 Source 登记失败；不记录文件内容、Token 或密钥。

### Docker 本地 loopback CORS 修复（2026-08-22）

- 本地 PC Web 通过 `http://127.0.0.1` 访问时，MinIO CORS 白名单现在与 `localhost` 一样允许直传；upload-intent 成功后不再因浏览器预检缺失而显示 network error。

### PC 全局字体与字号令牌统一（2026-08-22）

- PC 根字号统一为 `16px`，新增 caption/body-sm/label/body/body-lg/title-sm/title/title-lg/display 语义字号令牌，并保留旧基础字号变量别名。
- 普通 UI、表单控件和番茄钟统一使用 `--font-family-base`；代码、知识图谱等宽场景统一使用 `--font-family-mono`，移除局部字体族覆盖。
- 新增 typography contract 回归；浏览器窄栏、深色主题和真实字体加载后的视觉验收仍待执行。

### PC 时间轴使用自然周并显示英文星期缩写（2026-08-22）

- Dashboard 与 Timeline 改为展示当前/所选日期所在的完整自然周（周日至周六），并按真实日期计算 `isToday`。
- 首页日期选择器在数字上方显示 `Sun` 至 `Sat` 英文星期缩写，日期徽标保持约 `36px × 36px` 圆形绿色选中态，7 项均匀分布。
- 自然周边界、星期标签和时间轴契约已补充回归；浏览器周日/周六拖拽和视觉验收仍待执行。

### PC 时间轴恢复单周窗口与日期选择器视觉调整（2026-08-22）

- 根据跨周边界反馈，Dashboard 与 Timeline 从当日居中、前后三天的滚动窗口恢复为从当天开始连续 7 个日历日，避免 `dayCode` 排期被解析到下一周后任务消失。
- 首页日期选择器只显示日数字；未选中态去除边框，选中态使用固定约 `36px × 36px` 的圆形绿色背景，标题改为“时间轴 · X月”。
- 单周日期回归、首页视觉契约、type-check 和 Web build 已纳入本轮验证；浏览器拖拽与实际服务状态仍待人工验收。

### PC 首页与时间轴改为当日居中日期窗口（2026-08-22）

- Dashboard 与 Timeline 共用以当日为中心、前后三天的 7 日滚动窗口，所有日期列/选择器显示真实日期，当日固定在中间。
- 任务筛选仍保留已完成/已过去排期，取消任务不显示；日期边界回归后 `test:r4-pc` 75/75、type-check 通过，浏览器跨月/跨周和拖拽走查仍待人工验收。

### PC 时间轴拖拽与首页日期视觉修复（2026-08-22）

- 修复独立时间轴原生拖拽 payload 缺失、drop 未等待写回，以及 30 分钟槽位沿用整小时任务高度导致的任务块错位；首页覆盖判断改为分钟精度。
- 首页日期格改为只显示紧凑日期，顶栏显示选中日期的完整星期/月日信息；`test:r4-pc` 77/77、type-check、静态检查和 Web build 通过，浏览器拖拽交换仍待人工验收。

### PC 资产库任务改用真实 Task Store（2026-08-22）

- 移除资产库“全部任务”中的固定 Vue/Tauri 演示任务，改为通过 `useTaskStore.fetchTasks()` 加载当前用户任务。
- 资产树同时填充全部任务和各学科任务目录，任务完成切换回写 Task Store；PC 回归测试 64/64、静态检查、图标/工作区契约、type-check 和 Web build 通过。
- 浏览器资产库任务展示、状态切换和真实服务失败态仍需人工验收。

### PC 学科大厅编辑保存修复（2026-08-21）

- 修复编辑已有学科时表单丢失 `version`、导致更新请求缺少 `baseVersion` 而无法保存的问题。
- 新增 SubjectCreateModal 版本契约回归；PC 回归测试 63/63、静态检查、图标契约、type-check 和 Web build 通过。
- 浏览器实际修改、刷新后持久化和并发冲突提示仍需人工验收。

### PC 个人空间登出入口（2026-08-21）

- 个人空间新增“退出登录”按钮，确认后调用当前会话 logout，清理本地会话并跳转 `/login`。
- 服务端 logout 异常会给出提示，认证刷新失败触发的自动登出也不会产生未处理 rejection；PC 回归测试 62/62、type-check 和 Web build 通过。
- 浏览器实际点击、网络失败态仍需人工验收。

### PC 学科 AI 不回溯历史（2026-08-21）

- 学科工作区每次进入或切换学科都会清空当前消息并创建新的 AI 伴读会话，不再恢复全局旧会话记录。
- PC 回归测试 59/59、type-check 和 SubjectWorkspace 静态契约通过；真实浏览器 SSE 仍需人工验收。

### PC 注册默认学科修复（2026-08-21）

- 注册不再自动创建“未分类” Subject，新用户的 Subject 列表可以保持真实空状态。
- 历史 `defaultSubject=true` 记录不再被删除规则特殊保护，PC SubjectHall 可通过普通删除接口软删除；核心领域与资源归属回归 7/7 通过。
- 浏览器空状态、确认弹窗和真实服务删除仍需人工验收。

### AI 后端运行日志补强（2026-08-21）

- 为 AI 请求增加 `AI_STREAM_*`、`AI_SETTINGS_RESOLVED`、`AI_EMBEDDING_*`、`AI_RETRIEVAL_SUCCESS` 和 `AI_PROVIDER_HTTP_*` 事件，覆盖请求保留、Provider/模型与 env/BYOK 来源、Embedding/检索、Chat SSE、上游状态、字节/行数、耗时和失败阶段。
- 日志仅输出安全诊断元数据，不输出 API Key、Authorization、完整 prompt、模型回复或上游响应体；新增默认 Provider 选择失败、Embedding 失败和 HTTP 生命周期脱敏回归测试。
- AI 日志/Provider 定向测试 26/26 通过；真实 Provider、生产日志采集/轮转和前端业务验收仍需人工/部署环境验证。

### Java 21 Provider 固定地址 TLS 连接修复（2026-08-21）

- 修复 `HttpsURLConnection` 在 Java 21 先调用 `SSLSocketFactory.createSocket()`、再调用 `Socket.connect()` 时，固定地址 TLS 工厂提前抛错并令 embedding/chat 在发出请求前失败的问题。
- 无参 Socket 路径在 `connect` 时仍只连接安全策略已确认的公网 IP 和配置端口，保留 DNS 固定地址与 SSRF 防护；新增本地连接生命周期回归测试。
- 真实 Java `ProviderHttpClient` 链路调用 SiliconFlow `BAAI/bge-m3` 返回 1 条 embedding；全量后端测试 148/148 通过，Compose backend 重建后健康。PC 浏览器业务验收仍由人工完成。

### Provider DNS 与 SiliconFlow 模型配置修复（2026-08-21）

- Provider DNS 解析返回混合地址时，后端仅固定连接公网地址；解析结果全部为私网/合成地址时仍拒绝，避免误判可用的 embedding endpoint。
- Compose 显式透传 `AURALIS_AI_SILICONFLOW_BASE_URL`、`AURALIS_AI_SILICONFLOW_CHAT_MODEL` 和 `AURALIS_AI_SILICONFLOW_EMBEDDING_MODEL`，默认 embedding 模型为 `BAAI/bge-m3`。
- 新增混合 DNS 与全私网解析回归测试。

### AI env 默认 Provider 与 BYOK 覆盖（2026-08-21）

- 后端新增服务端 env Provider 默认配置：未指定聊天 Provider 时使用 `AURALIS_AI_DEFAULT_PROVIDER`，按 Provider 从 `DEEPSEEK_API_KEY`、`OPENAI_API_KEY` 或 `SILICONFLOW_API_KEY` 解析默认凭据。
- 用户 BYOK 仍优先于 env 默认，API Key 仅在服务端运行时使用；不写入 `ai_credentials`，也不返回前端。
- 新增配置绑定、env fallback、默认 Provider 流式回归测试；真实 Provider 网络与 PC 浏览器联调仍未验收。



## Unreleased

### PC Dashboard 时间轴拖拽与测试数据粒度修复（2026-08-22）

- 修复已排期任务拖动到新槽位后仍使用旧 `scheduledAt` 的问题；显式目标 `startTime` 现在覆盖旧时间，未提供时保留原排期。`test:r4-pc` 81/81、type-check、静态检查和 Web build 通过。
- 仅校正 Docker 测试账号的 17 个任务：预计用时与已有排期统一到 30 分钟粒度，未修改其他用户数据；浏览器/Tauri 实际拖拽验收仍待完成。
- 将 Store 缺省时长、时间轴创建任务兜底和间隔复习自动任务统一为 30 分钟粒度，避免后续新建任务再次产生 25/45 分钟数据。

### PC 时间轴任务显示修复（2026-08-22）

- 日视图改用半小时排期槽位匹配 `scheduledAt`，修复周视图可见但对应日时间轴因非整点开始时间而消失的问题。
- 已过去的排期任务不再从时间轴移除，日/周视图任务名称显示删除线；`test:r4-pc` 74/74、type-check 和静态检查通过，浏览器实际走查仍待验收。

### PC 资产库任务编辑时长（2026-08-22）

- 资产库任务编辑器移除低/中/高负荷按钮，改为 30 分钟步进的预计用时选择，并支持保存标题、备注、截止日期和 `durationMinutes`。
- `test:r4-pc` 73/73、type-check 与 Web build 通过；浏览器实际编辑、刷新后持久化仍待人工验收。

### R4：PC 任务时间轴与资产分组逻辑（2026-08-22）

- 排期队列仅展示有截止时间、尚未排期且未完成/未取消的任务；时间轴限制为今天起 7 个日历日，并保留已完成但仍有排期的任务。
- 资产库“全部任务”和学科任务目录按未分布、未完成、已完成并列分组，组内按截止时间排序；时间轴“导入任务”跳转并聚焦 `/asset?focus=unassigned-tasks`。
- 修复 Dashboard 三栏网格与内部滚动，统一拖拽/状态语义；`test:r4-pc` 73/73、type-check、静态检查、学科契约和 Web build 通过。浏览器/Tauri GUI 及真实服务联调仍待验收。

### R4：Mobile / 微信新契约与隔离本地库（2026-08-20）

- Mobile 的 Auth、直接 DTO/Problem Details、共享 refresh、Sync opaque cursor/snapshot、Realtime ticket、AI SSE、Review、Stats 和 Asset upload-intent/PUT/complete 已切换到冻结 OpenAPI；生产代码不再使用固定本机地址、旧 `/ws/sync`、旧数值游标或旧 AI 路由。
- H5 与原生端按 userId/deviceId 新建独立本地 namespace；用户明确授权后，旧全局 `h5_db_*` 与 `_doc/auralis.db` 业务表在认证会话建立时一次性清除。同步冲突保留 pending mutation，手写笔记继续受 feature flag 控制且不进入云同步。
- Pinia 固定为 2.1.7 并与 Vue 3.4.21 对齐；三个 Tablet 逻辑脚本进入 `test:tablet`。`check:r4-mobile` 扫描 62 个生产文件、协议测试 20/20、Tablet 测试、type-check、H5 build 和微信 build 通过；真实 Server/MinIO/Provider、微信合法域名、开发者工具、双设备和真机未验收。
- Tablet Dashboard 改用服务端 overview/weekly 统计并移除随机热力图和虚构学科兜底；Tablet Review 改用 due/event 契约，只有不可变事件保存成功才推进卡片，右滑仅取消手势。静态门禁新增对应回归断言，H5 与微信构建重新通过。
- Tablet 独立 Stats 页面同步改用 overview/weekly 统计，移除静态连续学习值、随机周数据和 180 天伪热力图；页面映射、状态和 R4-07 执行记录已同步更新。
- 共享任务选择器不再注入 mock tasks；Mobile Pomodoro 完成专注时改为调用 Task Store 今日计数，空任务和完成反馈均来自真实端侧状态。
- Mobile Settings 移除固定“已加入 12 天”演示值；User DTO 未提供注册时间时显示中性跨端同步说明。
- Mobile Home 移除空任务时注入的 `demo-*` 日程，Profile 统计改用真实 Task/Block Store，并在无注册时间字段时显示中性账户元信息。
- Mobile 手写页移除 Mock 笔迹覆盖和伪 OCR/知识抽取成功流程；当前保留本地画布并提示识别服务未接通。
- Tablet Workspace 总结移除固定演示文案和延时伪造，改用 `chatWithAI` 真实 SSE 流；AI 失败时保持空态并提示错误。
- Tablet AI 历史会话改用 Conversation GET/DELETE，消息从服务端 DTO 恢复，删除携带版本；移除硬编码历史和图片识别伪结果，图片入口在上传链路未接通前明确提示。
- Mobile Pomodoro 今日计数改用 userId/deviceId 本地 namespace key，不再读取跨账号共享的全局 `pomodoro_counts`；新增协议回归断言，`test:r4-mobile` 通过 20/20。
- Tablet 新对话在首条消息前显式创建服务端 Conversation，并将真实 ID 传入 SSE，避免复用用户级缓存会话。

### R1/R4：AI 可靠性与离线恢复（2026-08-20）

- Identity 登录设备列表改为每用户/设备一条活动 refresh session：重复登录同一设备会撤销旧会话，Profile 不再展示同设备的旧会话为可撤销设备；撤销提示明确 access token 会按有效期自然失效。
- PC 不再把 BYOK key/base URL 保存为浏览器明文或附加到普通请求 header；正式个人中心内嵌的 BYOK 卡片仅通过 `PUT /api/ai/settings` 请求体提交 key，展示服务端脱敏状态并在成功后清空输入框。
- 核心资源的离线 CREATE 改为本地优先且保留同一 `resourceId/clientMutationId`；仅明确离线或传输失败进入 outbox，5xx/冲突不再伪装为离线成功。SSE 在 401 时共享一次刷新并以原请求 ID 重试。
- Chat 会话与待发送 USER 消息持久化稳定创建/请求 ID，在网络恢复后按会话和消息顺序恢复。服务端 V14 为会话恢复键和 assistant→USER 精确关联建模，流式 Provider I/O 移出数据库事务，并发重复请求只保留一次 USER 消息。
- `test:r4-pc` 58/58、PC type-check、OpenAPI artifact/两端生成比对、服务端专项 12/12 和含 MinIO/PostgreSQL/pgvector Testcontainers 的 `mvn -B -ntp clean test` 137/137 通过；真实 Provider 与浏览器业务联调仍未验收。

### R4：PC Task/Review/Stats/Chat、运行时与联调前门禁（2026-08-20）

- `useTaskStore`、`useReviewStore`、`useStatsStore`、`useChatStore`、`usePomodoroStore` 已切换到当前 typed DTO、用户/设备隔离 repository 和页面模型；Dashboard、Timeline、Profile、Home、SearchPalette、SubjectWorkspace、Pomodoro 不再以旧 `localDb` 或静态演示数据作为云端事实。
- Profile 增加当前 user/device/session 展示和其它会话撤销；AI `AiStreamController` 统一处理 SSE 增量、citation 去重、取消、中断和失败；Vite 开发代理改为环境驱动，Tauri 默认 capability 保持最小权限。
- R4 PC 静态检查扫描 57 个生产文件通过，`test:r4-pc` 53/53、type-check、Web build 通过；Tauri `--no-bundle` 生成 `src-tauri/target/release/app.exe`。完整 MSI bundling 返回宿主权限错误 `拒绝访问 (os error 5)`，因此安装包、GUI、真实服务和前后端业务联调仍未完成。

### R4：PC Subject/KnowledgeBlock/Source/Asset 主流程迁移（2026-08-20）

- 新增固定 DTO mapping、分页 cursor 和 optimistic mutation 测试；`useSubjectStore`、`useSourceStore`、`useKnowledgeStore`、`useAssetStore` 通过 typed API 和 user/device-scoped local repository 处理版本、软删除、离线 pending 与冲突边界。
- SubjectWorkspace、Asset、Home 的文件路径登记改为真实 Asset upload-intent → 对象存储 PUT → complete → Source create；目录更新使用 Source API，上传失败保留明确 pending/failed 状态，不伪造云端成功。
- 正式页面路径移除旧资料 snake_case、旧 `/api/ai/chat` 和兼容 Asset 调用；AI 伴读改用当前消息 SSE。R4 PC 静态检查、mapping/protocol/local repository/sync 测试、type-check、Web build 已通过；真实服务、GUI、Tauri、双设备和前后端业务联调仍未完成。

### 前端 AI 辅助开发约定（2026-08-17）

- 新增 `docs/agent/FrontendAIAssistedDevelopment.md`：前端实现默认优先使用 AGY/Antigravity 中当时可用的 Gemini，但要求对生成代码进行范围、契约、安全、视觉、响应式、可访问性和验证证据审查。
- 在文档入口、PC 模块和 Mobile/Tablet 模块中登记该约定；该偏好不改变后端、API、数据库、鉴权、密钥和人工验收规则。
- 已联网核对 Antigravity 官方关于模型选择、Review-driven development、代码 diff、walkthrough、浏览器检查和 workspace rules 的资料；当前 Codex 工作区没有直接调用 AGY/Gemini 的模型入口，因此不把本轮文档变更声称为 Gemini 生成。
- 补充 Codex 沙箱与宿主机 AGY 的边界：本机 `cmd.exe /c agy --version` 实测为 `1.1.13`，调用时需使用沙箱外的一次一审命令审批；文档给出 `where agy`、`agy models`、计划模式和前端任务调用示例，并明确禁止 `--dangerously-skip-permissions`。

### R3：OpenAPI 与客户端类型冻结（2026-08-17）

- 从 Spring MVC `/v3/api-docs` 导出并固定 `docs/contracts/openapi/auralis-openapi.json`；新增运行时 artifact 对比测试、可重复导出/生成/校验脚本和 GitHub Actions 契约漂移门禁。
- 使用固定 `openapi-typescript@7.13.0` 从同一 artifact 生成 PC/Mobile `schema.ts`，并增加由生成路径、方法、请求体、path/query 参数和成功响应类型约束的轻量请求客户端；两端均通过同一生成器重新生成比对。
- 在 API、Database、PC 与 Mobile/Tablet 文档中冻结 `/api` 版本边界、旧 `/ws/sync`/旧 DTO 退出策略、cursor 过期、版本冲突和未来强制升级行为；当前只完成契约/类型冻结，未宣称前后端联调或业务验收完成。
- 后端默认全量 `mvn -B -ntp clean test`（系统 Maven 与 Wrapper）均为 135 通过、0 失败/错误/跳过，PostgreSQL/MinIO 容器测试已自动执行；PC `npm run build`、Mobile `npm run type-check` 与 H5 `npm run build:h5` 均通过。Mobile TypeScript 已固定为 5.3.3 以匹配 `vue-tsc@1.8.27`；G3 契约迁移前置门禁通过，但前端页面仍未完成新契约迁移与联调。
- G3 已确认 G1/G2 阶段门禁、OpenAPI artifact、两端生成类型和契约 diff 均通过；该门禁只允许进入 R4 大规模客户端迁移，不代表真实 Provider smoke 或前后端业务验收完成。

### R2：真实依赖测试基线（2026-08-17）

- Compose 已切换为固定版本的 PostgreSQL 17/pgvector、MinIO、bucket 初始化和新 Server 健康检查，移除 Redis/Milvus/etcd 主依赖；`.env.example` 补齐数据库、JWT、AI 加密、CORS、MinIO、Provider 和超时变量，并将本地 AI 加密示例固定为 32 字节。
- 新增 Java 21 多阶段、非 root 后端 Dockerfile 与 `.dockerignore`；新增 Testcontainers 2.0.5 PostgreSQL clean/upgrade 测试、MinIO presigned PUT/HEAD/GET/delete 测试和 Provider 错误矩阵测试。
- MinIO 资产 intent 在声明 sha256 时传递签名 metadata；完成校验失败尝试清理对象，并新增数据库/对象孤儿核对脚本。
- `docker compose --env-file .env.example config --quiet`、backend/frontend 镜像构建、Compose db/MinIO/backend/frontend 启动与健康检查均通过；PostgreSQL 17.11 + pgvector verify 135/0/0（另 1 个非 PostgreSQL opt-in 测试跳过）、MinIO 真实链路 1/1、Provider stub 2/2 通过。真实 Provider chat/embedding smoke 和 MinIO 异常路径仍需显式模型、密钥与网络条件。

### R1-06：后端工具链和运行配置（2026-08-17）

- 修复 Windows Maven Wrapper 对普通 Maven 仓库目录的空 `Target` 索引异常；`.\mvnw.cmd -v` 和 `.\mvnw.cmd -B -ntp clean test` 均可运行。
- 全局关闭 `spring.jpa.open-in-view`；prod profile 显式关闭 springdoc API docs 和 Swagger UI，local OpenAPI smoke 保持可用。
- H2 固定到 2.2.224，Surefire 配置 Mockito 5.23.0 Java agent，并在默认生命周期自动启用 PostgreSQL/MinIO Testcontainers；定向配置测试 6/6、系统 Maven 与 Wrapper 全量各 135 通过、0 失败/错误/跳过。
- G1 已通过；该证据仍不包含真实 Provider、生产 secret 或 GUI/真机验收。

### R1-05：并发、版本和分页（2026-08-17）

- 新增 Flyway V13，为 Conversation 增加 `version` 与 `next_message_sequence`；删除严格校验 `baseVersion`，消息追加通过会话行写锁和计数器分配序号，移除 `max + 1` 竞争窗口。
- Subject、KnowledgeBlock、Task、Source、Relation 列表接入带资源类型校验的不透明 keyset cursor，支持 `limit=1..200`，返回稳定 `nextCursor` 与 `hasMore`。
- Sync 保留清理增加可配置定时任务，并记录清理行数、失败数和过期 cursor reset 指标；清理不回退用户 cursor 高水位。
- 新增 R1-05 并发、版本、分页边界、清理恢复、指标和 Modulith 架构测试；定向套件 16/16、全量后端 `mvn -B -ntp clean test` 126 通过、0 失败/错误、1 个 opt-in PostgreSQL 测试跳过。真实 PostgreSQL 全量并发、生产调度、前端联调和人工验收仍未完成。

### R1-03：pgvector 检索和原子切换（2026-08-17）

- 新增 Flyway V10/V11：source chunk generation/active cutover、活动 chunk 查询索引，以及 PostgreSQL 历史 JSON embedding 回填。
- PostgreSQL 写入同时保存 `embedding_json` 和 `vector(1024)`；检索使用带用户、活动 generation、Source 删除过滤的 pgvector cosine SQL 和 HNSW，H2 保留 JSON fallback。
- chunk 重建先写入新 generation，事务成功后切换 active；数据库失败时旧 generation 保持可检索；Source 删除和用户隔离均进入检索过滤。
- 2026-08-17：R1-03 定向测试 11/11 通过；PostgreSQL 17.11 + pgvector 隔离容器集成测试 1/1 通过。该证据不包含完整 Compose、MinIO、真实 Provider、lease fencing、性能、前端联调或人工验收。

### R1-04：AI 请求与真实流式（2026-08-17）

- 新增 `V12__ai_message_client_request_id.sql`，为 AI USER 消息提供用户隔离的 `clientRequestId` 唯一键；重复请求回放已有 assistant 结果，不重复调用 Provider。
- `retrievalEnabled`、动态 topK 校验和 SiliconFlow embedding → pgvector/JSON retrieval 已进入消息执行链；citation 事件携带 Source/chunk 可追踪字段。
- Controller 改为 callback 式 SSE，Provider 增量直接写入 `StreamingResponseBody`；OpenAI-compatible 适配器解析上游 `data:`/`[DONE]`，并统一映射超时、限流、断流、错误和 assistant FAILED/INTERRUPTED 状态。
- 2026-08-17：R1-04 定向 AI 流式/Provider/Controller 测试 16/16 通过，全量后端测试 121 通过且 1 个 opt-in PostgreSQL 测试跳过。证据使用 Stub/受控 HTTP，不包含真实 Provider 网络/证书/配额、前端联调或人工验收。

### 后端绿地重写阶段 5：AI/RAG 后端基线（2026-08-16）

- 新增 Flyway V8/V9：AI credential、ingestion job、source chunks、Conversation/Message，以及 PostgreSQL pgvector/HNSW 条件迁移；H2 使用 JSON embedding 列完成可测试基线。
- 新增 BYOK AES-GCM 加密、用户/Provider 配置、OpenAI-compatible/DeepSeek 聊天适配器和 SiliconFlow 1024 维 embedding 适配器；API/DTO 不回显 key。
- Source 提交后触发 ingestion job，支持文本/文本型文件/URL 解析、固定重叠切块、embedding 持久化、用户隔离 cosine retrieval 和安全失败状态。
- 新增 owner-scoped Conversation/Message、`/api/ai/messages/stream` MVC SSE 生命周期事件和类型化 Suggestions 基线。
- 修复默认 local profile 缺少 AI 加密 key 导致应用上下文无法启动的问题；生产仍要求 `AURALIS_AI_ENCRYPTION_KEY`。
- 2026-08-16 `mvn -B -ntp clean test` 通过：92 个测试全部通过，包含 Spring context、Flyway V1–V9、JPA validate、MockMvc、AI/RAG 单测和架构测试。未包含 PostgreSQL/pgvector、MinIO、真实 Provider、性能/安全专项、前端联调和人工验收。

### 阶段 3/4 审核修复（2026-08-14）

- Sync push 改为每条 mutation 独立事务内的幂等占位、领域写入、change log 与最终决策原子提交；同一 `clientMutationId` 的 hash 冲突按单条 `REJECTED` 返回，不中止同批其他 mutation。
- 新增 V6 cursor 高水位表，游标分配使用锁定的用户行，change log 保留清理后不回退；snapshot 在 REPEATABLE_READ 事务内读取包含删除墓碑的全量资源视图，pull payload 改为 JSON 节点。
- 新增提交后实时事件桥，覆盖 REST/Sync 资源变更和 Review 更新；Review 幂等重放使用事件保存的完整 afterState；任务新增 V7 `completed_at`，weekly 完成任务按进入 DONE 时间统计。
- 新增审核回归测试后，`Auralis-Server\mvnw.cmd -B -ntp clean test` 退出码 0：27 个测试类、69 个测试用例全部通过，失败/错误/跳过均为 0，包含并发 cursor 与并发 mutation 重放。证据仍限于 H2/JPA/MockMvc/架构测试，不包含 PostgreSQL、Docker、真实 MinIO、双设备、浏览器 WebSocket、跨实例 broker、前端联调或人工验收。

### 后端绿地重写阶段 3/4：Sync、Review、Stats、Realtime（2026-08-13）

- 新增 Flyway `V4__sync_schema.sql`，创建用户域 `change_log`、设备 mutation 幂等表 `inbound_mutations`、保留清理索引和资源/操作约束；REST 直接写入与 Sync push 通过 shared `ResourceChangedEvent` 进入统一 change log。
- 实现 `/api/sync/push`、`/api/sync/pull`、`/api/sync/snapshot`，支持活动设备校验、不透明 cursor、幂等重放、请求 hash 冲突、版本冲突、REJECTED 结果和 30 天清理入口；当前 snapshot 返回活动资源，墓碑通过 pull change log 获取。
- 新增 Flyway `V5__review_stats_realtime_schema.sql`，创建版本化 Review 参数集、ReviewState、不可变 ReviewEvent 和一次性 Realtime ticket 表；实现 FSRS-lite due/event/history、SKIP 语义、overview/weekly 用户隔离统计及 hash-only ticket/进程内用户事件桥。
- 2026-08-13 `Auralis-Server\mvnw.cmd -B -ntp clean test` 退出码 0：27 个测试类、61 个测试用例全部通过，失败/错误/跳过均为 0；`git diff --check` 通过。证据限于 H2/JPA/MockMvc/架构测试，不包含 PostgreSQL、Docker、真实 MinIO、双设备、浏览器 WebSocket、跨实例 broker、前端联调或人工验收。
- 未关闭风险：Sync 游标并发/清理后的高水位连续性，以及 snapshot 包含墓碑的完整冷启动契约，已登记到 `docs/current/IssuesAndReview.md`。

### 后端绿地重写阶段 2B：Source、Asset、Relation（2026-08-13）

- 新增 Flyway `V3__source_asset_relation_schema.sql`，创建 `assets`、`sources`、`relations`，并为 `knowledge_blocks.source_id` 增加 Source 外键、索引和删除约束。
- 实现 Source FILE/TEXT/URL CRUD、版本/墓碑/恢复、reingest `PENDING` 边界，以及 KnowledgeBlock 的活动 Source/用户归属校验。
- 实现 Asset 上传 intent、对象完成时 HEAD/stat 元数据校验、READY 下载 URL、失败状态持久化和用户前缀；对象存储通过 `AssetStoragePort` 抽象，test profile 使用可控适配器，配置开启后使用 MinIO presigned PUT/GET。
- 实现 Relation 端点类型/用户/活动状态校验、`RELATED_TO` 无向去重、版本/墓碑/恢复，以及通过 shared `ResourceDeletedEvent` 的端点删除级联。
- 2026-08-13 `Auralis-Server\\mvnw.cmd -B -ntp clean test` 通过，42 个自动测试全部通过；PostgreSQL、Docker、真实 MinIO、ingestion worker、前端联调和人工验收仍未完成。

### 后端绿地重写阶段 2A：核心领域（2026-08-12）

- 新增 Flyway `V2__core_domain_schema.sql`，创建 `subjects`、`knowledge_blocks`、`tasks`，统一使用 UUID、用户归属、JPA `@Version`、审计时间和软删除墓碑；KnowledgeBlock 的 `source_id` 暂作为阶段 2B Source 接入前的可空字段。
- 实现 Subject、KnowledgeBlock、Task 的 Entity、Repository、显式 DTO、领域服务和 REST Controller，覆盖创建、查询、更新、软删除、恢复、用户隔离和精确 `baseVersion` 冲突。
- 注册用户同事务创建受保护的“未分类”默认 Subject；默认 Subject 不可删除，KnowledgeBlock/Task 不可引用其他用户或已删除 Subject。
- 将认证主体移入 shared security named interface，解除 identity 与业务模块的 Modulith 循环依赖；更新阶段1测试清理夹具以遵守新表 `ON DELETE RESTRICT`。
- 2026-08-12 `Auralis-Server\\mvnw.cmd -B -ntp clean test` 通过，31 个自动测试全部通过；PostgreSQL/pgvector、Docker、MinIO、Source/Asset/Relation 和三端联调仍未执行。

### 后端绿地重写阶段 1：Identity 与认证（2026-08-12）

- 在新 `com.auralis.app` 后端加入 Spring Data JPA、Spring Security、OAuth2 Resource Server、Flyway、PostgreSQL runtime 和 H2 test scope；创建面向干净数据库的 `V1__identity_schema.sql`，包含 `users`、`devices`、`refresh_sessions` 及归属/rotation 索引。
- 实现 User、Device、RefreshSession Entity 和 owner-scoped Repository 查询；refresh token 只保存 SHA-256 hash，access JWT 默认 15 分钟，refresh session 默认 30 天。
- 实现注册、登录、refresh rotation、重放撤销整个 rotation family、登出、当前用户、会话列表和会话撤销；公开错误统一为 Problem Details，凭据失败使用 `UNAUTHENTICATED`，跨用户会话访问不泄漏归属。
- 新增 Auth MockMvc 测试，覆盖用户隔离、密码/JWT、过期/撤销/重放、refresh token 误用、字段校验和安全错误；2026-08-12 `Auralis-Server\\mvnw.cmd -B -ntp clean test` 通过，19 个测试全部通过。
- 使用 H2 test-scope classpath 运行 test profile HTTP smoke：health liveness 和 OpenAPI 返回 200，register 返回 201，login 返回 200 且 token pair 存在。PostgreSQL/pgvector、Docker、MinIO、Testcontainers 和人工三端验收未执行。

### 后端绿地重写阶段 0（2026-08-12）

- 在 `Auralis-backups\\20260812-205737` 创建仓库外可恢复备份：完整归档 152 个文件、210984 bytes，SHA-256 为 `C59AD2AB39F05B114D7B13FAA948C8A8ED29CB0CA1F26DDBCF04794B431C4BEC`；空 Server 工作树补丁为 0 bytes，归档展开复核通过。
- 将旧 `Auralis-Server` 精确移动到备份目录的 `Auralis-Server-source`，在原路径创建新 Server；PC、Mobile、docs 其他范围和 Compose 未因替换命令被递归移动。
- 新 Server 固定为 Java 21、Spring Boot 4.1.0、Spring Modulith 2.1.0、`com.auralis.app`；移除旧 `com.auralis.server`、MyBatis/Redis/Milvus/etcd/JJWT/LangChain4j/MinIO 等依赖和旧统一 `Result`。
- 建立 12 个 Modulith 模块边界、配置绑定、Trace ID、RFC Problem Details、Actuator 健康检查和 `Auralis API` OpenAPI 基础；阶段 0 不开放 Auth、业务对象、同步、AI/RAG、WebSocket 或数据库路由。
- 验证证据：`Auralis-Server\\mvnw.cmd -B -ntp clean test` 退出码 0，5 个测试通过并生成 4 份 Surefire 报告；真实启动 smoke 的 readiness/liveness 为 HTTP 200 + `UP`，OpenAPI 与 Swagger UI 为 HTTP 200。Docker、数据库、MinIO、前端联调、GUI、真机和业务验收未执行。

### 前端重构进度与现行文档同步（2026-08-12）

- 更新 `docs/README.md`、`AGENTS.md`、当前状态、风险登记、PC/Mobile/Tablet 模块和前端设计文档，使正式路由、近期视觉改动、构建证据与人工验收边界保持一致。
- 明确 PC 当前为 8 条正式路由，并登记 Pomodoro、工作区、导航、弹窗和 Mobile/Tablet 热力图等近期代码变化。
- 记录本轮验证：PC 两个静态契约检查通过，TS5101 已通过配置调整解除，但生产构建继续受 TS6133 阻塞；Mobile H5、微信小程序构建和 Tablet 侧栏检查通过，仍需 GUI/真机验收。

### PC TypeScript 6 构建配置修正（2026-08-12）

- 从 `Auralis-PC/tsconfig.app.json` 移除已弃用的 `baseUrl`，保留 `@/*` 的 `paths` 映射；PC 两个静态契约检查继续通过。
- 修正后生产构建已越过 TS5101，但进一步暴露 `Auralis-PC/src/components/layout/AppHeader.vue` 的未使用 `ElMessage` 导入（TS6133），因此仍未形成完整 PC bundle 验证。
- 随后删除未使用的 `ElMessage` 导入，2026-08-12 `npm.cmd run build` 通过（3477 modules）；Vite 仍提示部分 chunk 超过 500 kB，待后续评估拆包。

### 平板与手机端热力图可配置化与自适应布局（2026-08-11）

- 改造了 `HeatmapChart.vue` 组件，使其支持动态传入 `weeks` 属性配置显示的周数（默认 16 周），并根据周数动态调整标题文本（5周及以内显示“近一个月”）。
- **优化热力图视觉**：强制所有热力格子为严格的正方形（`aspect-ratio: 1/1`）。为了解决短期数据（如近一个月，5周）导致中间窄条且两侧留白过多的问题，引入了自适应布局：当 `weeks <= 5` 时，自动从纵向 GitHub 风格切换为更舒展的 7列 x 5行“标准日历”横排布局，在保持禅意留白的同时，使网格能更均匀地分布在宽屏卡片中。
- 在平板端首页 (`Auralis-Mobile/src/pages/tablet/dashboard/index.vue`) 的热力图组件中显式传入 `:weeks="5"`，确保大屏下只展示一个月的数据并触发日历布局。
- 修复了平板端首页横幅（Hero Banner）卡片的渐变背景色，将其从旧的硬编码绿色（包含不合规的 `#687f5d`）统一为前端设计文档 (`Frontend.md`) 中规定的 `Primary Gradient` 品牌线性渐变（`linear-gradient(135deg, #A3B19B 0%, #7D9372 100%)`）。

### 文档体系

- 建立以 `docs/README.md` 为唯一入口的分类文档体系。
- 新增 Agent 强制协议、权威边界、状态词典、回写矩阵和交接模板。
- 完整归档 2026-07-10 重构前 35 份旧文档，并保留当时未提交的文档修改。
- 新增项目、设计、模块、契约、运维、当前状态和计划文档。
- 旧现行路径已切换，现行链接、根目录、元数据和旧路径扫描通过。

### 本轮验证

- PC：2026-07-10 `npm.cmd run build` 通过（`vue-tsc -b && vite build`）。
- Mobile：2026-07-10 `npm.cmd run build:h5` 和 `npm.cmd run build:mp-weixin` 通过。
- Tablet：2026-07-10 `node scripts\check-tablet-sidebar-transition.mjs` 通过，120ms 指示器在 160ms 路由重载前落位。
- Server：2026-07-10 `mvn test` 通过；Maven 日志显示没有测试源码，不能当作业务测试覆盖。
- Mobile H5 构建保留动态/静态 import 和 Sass legacy API 非阻断警告。

### PC 学科图标兼容（2026-07-13）

- 新增 `src/utils/subjectIcon.ts`：学科图标统一兼容 Emoji 与历史名称（如 `book`、`code`），空值或未知名称回退为书本图标；大厅、工作区、首页和时间线使用同一解析逻辑。
- `node scripts\check-subject-icon-rendering.mjs` 与 `npm.cmd run build` 已通过；浏览器/Tauri 显示仍待人工验收。

### PC 新建学科线条图标（2026-07-14）

- 引入了更精致、具有现代细腻设计感的第三方图标库 `lucide-vue-next`。创建学科弹层改用 16 个 Lucide 线条图标（如 BookOpen, Sigma, Sparkles 等），完全符合“极简禅意”设计目标，同时保留原有语义键以向后兼容；大厅、首页和工作区用同一解析器渲染。
- 已有 Emoji 学科不迁移，编辑时未重选图标会原样保存；原生任务学科下拉保留旧 Emoji 前缀但不输出新的语义键。
- 应用入口加载 `element-plus/theme-chalk/el-icon.css`，确保图标容器及 SVG 按指定尺寸渲染。
- 移除创建学科的主题色选择；新建学科默认色及工作区左下角学科图标底色统一为 Sage Green `#7D9372`，图标使用白色。
- 全局功能侧栏学科入口复用同一图标解析器，直接渲染语义线条 SVG；保留既有 Emoji 分支，底色统一为 Sage Green `#7D9372`。
- 2026-08-10：修复 PC 首页 (Dashboard) 左侧栏及任务创建弹窗因未正确调用 `subjectIcon` 解析器而直接输出语义键文本 (如 `math`, `laptop`) 的渲染 Bug，并将 Dashboard 加入静态脚本契约 (`check-subject-icons`) 校验范围。当前该检查及 `npm.cmd run build` 已重新验证通过。
- 2026-08-10：重构 PC 首页 (Dashboard) 左侧栏“全部”选项的展现样式，将其从普通列表项提升为独立的全局视图卡片 (Global View Card)，以清晰区分全局知识流与专属学科空间。
- 2026-08-10：统一 PC 任务编排中心 (Timeline) 的日/周视图切换按钮样式，对齐首页 (Dashboard) 的全圆角胶囊无 Emoji 设计，保持极简禅意视觉语言的一致性。
- 2026-08-10：全局替换了 16 个默认学科语义线条图标 (`src/utils/subjectIcon.ts`)，使用更加柔和、抽象的图形 (如 `Feather`, `Orbit`, `Telescope`, `Infinity`) 替代了此前较为硬核的组件；同时，将全局左侧栏 (`AppSidebar.vue`) 的核心导航图标也由 Element Plus 默认图标替换为了一致的 Lucide 线条图标，并特意采用 `LayoutDashboard` (首页看盘) 和 `Compass` (学科大厅) 以避免视觉上的重复感，全面提升了界面的“极简禅意”美感。
- 2026-08-10：在排期页 (`Timeline/index.vue`) 完整复刻了首页 (`Dashboard/index.vue`) 的现代卡片化新建任务弹窗，包括网格化胶囊学科选择器与可拖拽交互的长条形专注时长配置条，统一了全局核心交互体验与视觉范式。

### PC 学科工作区原型（2026-07-13）

- 文件选择改为中栏 Markdown 总结；文件项移除右侧操作按钮。
- 大纲改为“AI 梳理”与圆形“+”顶栏，支持左栏内联新增、章节排序与限定在章节内的小节排序；当前不持久化。
- 2026-07-14：右侧 AI 伴读完整复刻手机端的渐变四芒星、脉冲星环、消息气泡、三点输入中状态和纯文本胶囊输入；保留现有 `streamFetch`、模型菜单与学科/文件上下文，不提供附件或麦克风入口，清空和发送均有可读标签。
- 2026-07-26：优化知识块阅读弹窗和手动录入界面的排版与样式。阅读界面采用统一的 Markdown 渲染样式 (`.summary-markdown`)，优化了标题字号和时间标签的微标展现；编辑界面的输入框应用了标准 `.styled-textarea`，支持 Focus 光晕和高度自适应。
- 2026-07-26：重构大厅（Home）页面的“手动录入知识块”、“创建学习任务”、“登记本地材料”弹窗，将其样式统一为全局标准的 `.modal-container`，实现与其他核心业务弹窗的视觉及动效一致性。
- 2026-07-26：重构工作区（Workspace）的“手动录入知识块”和“创建学习任务”弹窗，将其样式统一为全局标准的 `.modal-container`。
- 2026-07-26：优化排期布局页（Timeline）顶栏，去掉多余的“认知负荷”数据展示，并将待排期、已完成和专注时长这三个核心指标收纳为紧凑的药丸标签（Pill Tags）放置在标题与操作按钮之间，大幅提升了屏幕空间利用率与信息层级。
- 2026-08-11：在 PC 端完成专注时钟（Pomodoro）功能移植。移除了移动端的 `rpx` 与 `<view>` 标签限制并重写了样式；针对 PC 宽屏引入了大圆角胶囊状的任务选择器；移除了全局顶栏多余的占位图标；在大纲编排模式中新增了章节与小节的删除功能，进一步完善核心流程。

### 已确认的近期工作树变化（待随当前功能分支验证）

- PC 前端继续向 Zen Minimalist 体系对齐，使用禅白、鼠尾草绿和发丝边框。
- PC 首页移除知识流上方统计/热力图卡片及副标题。
- PC 依赖中 Tauri JavaScript API、CLI 与 Rust Tauri 统一为 `2.11.1`。
- Mobile / Tablet 的近期布局、图表、设置与 workspace 改动已在日期快照保留。

这些条目来自当前工作树和历史记录；只有任务 9 中命令实际通过后，才会追加本轮验证结果。

## 2026-07-10

### 已确认

- `d752b62`：项目目录名称从 StudyCore 更新为 Auralis。

## 2026-07-09

### 已确认

- `78c46de`：完成 Tablet workspace 重构、统一头部高度并修复侧栏收起 CSS。

## 2026-07-08

### 已确认

- `2babfbe`：默认隐藏 Tablet 手写笔记入口。
- `e2a09a9`：新增 Tablet 手写笔记本地存储。
- `4db4347`：新增 Tablet 手写专项计划。
- `dcdd5db`：整合 v3 Tablet 工作流。

## 2026-06-10

### 已确认

- `7384215`：重设计复习、统计、设置和个人资料页面为极简线性风格。

## [Unreleased]

- Task 16 runtime verification (2026-09-09): backend-only Docker rebuild/recreate passed Compose config, health/readiness, and ingestion worker flag checks; PostgreSQL/MinIO volumes were preserved. Read-only inspection found existing READY data without historical SOURCE UPDATE events (expected for pre-fix rows). The scheduled Sync retention `TransactionRequiredException` is fixed in code with focused H2 regression evidence; rebuilt-backend scheduled logs and end-to-end authenticated reingest/upload plus PC GUI retry remain pending.

- Server Task 14: Source ingestion state and safe failure diagnostic changes now emit existing `SOURCE/UPDATE` sync events exactly once per actual persisted change; identical repeated calls are no-ops, and ParsedDocument complete routes locked `INDEXING` through the same transactional service path.
- Removed Task `colorOverride`/legacy `color` from Server, V21 schema, OpenAPI, PC, and Mobile/Tablet projections; Task visuals now use semantic CSS tokens while KnowledgeBlock colors remain unchanged.
- PC Task 15: after an explicit ParsedDocument `ACCEPTED` complete, request one coalesced background `read` sync; callback failures are best-effort and cannot alter accepted upload or local readiness transitions.
- PC Overview trigger diagnostics (2026-09-10): added allowlisted `[FILE_OVERVIEW_TRIGGER]` lifecycle events with trigger values supplied by the TypeScript closed type and known call sites (`SOURCE_READY`, `RESUME_BOOTSTRAP`, `RESUME_ONLINE`, `RESUME_SYNC`, `JOB_CHANGED`, `MANUAL_RETRY`), without claiming runtime validation. A service-owned request ID is created only for a generation attempt that reaches `runFile` and reused in `X-Overview-Request-Id`; preflight/skip events may omit it. Existing in-memory coalescing and generation behavior are unchanged; no retry, cache, Provider, Server, or timeout behavior changed. Automated PC checks passed (focused 16/16, full 310/310, type-check and static check), while real Tauri/provider attribution and business acceptance remain pending; Server same-key in-progress idempotency and the PC/Server timeout mismatch remain open.

## 维护规则

- 只记录已发生并可追溯到提交、命令或人工记录的变化。
- 未来任务进入 `planning/`，未关闭风险进入 `current/IssuesAndReview.md`。
- 历史命令结果必须标明日期，不能写成当前验证。
- 重大发布应记录版本、环境、构建结果、迁移、回滚点和人工验收设备。
### 2026-09-21

- Issue 3/4 final review：同步错误在完整成功前持续可见，Sync/Chat/AI SSE 改用安全错误 code 与可行动文案；Overview skip 不再污染 FAILED 状态，Subject late provider response 增加 generation/abort/fingerprint fence。
- 新增 PC 运行时回归覆盖同步错误清除边界、安全错误映射、SSE、聊天 retry 请求 ID、Subject 无输入与 revision late-result；`test:r4-pc` 374/374，type-check 通过。
# 2026-10-16



### Overview M5.5 严格 descriptor 正文复用（2026-10-23）

- 增加私有 global routing fingerprint 与新的 adaptive algorithm identity；只接受完整 writer descriptor JSON/SHA 完全相同的跨 input donor，并沿用 M5.4 same-input 优先及 reservation、checkpoint、来源、coverage 等围栏。无 public API、DB column 或前端改动，无旧数据迁移。
- 定向验证分批通过：Coordinator 26/26 + Adaptive 30/30（56/56，exit 0）；后续 Service acceptance 2/2（exit 0），覆盖组内正文修订与全局 goal 变化两种关键路由情形。未执行合并后的 58-case 全批；唯一只读 reviewer B0/I0/O0。此变更不代表完整 M5 完成。



### Overview generation cleanup 与 takeover 安全互斥（2026-10-23；未部署）

- Coordinator cleanup 限于非 ACTIVE generation 的过期 SUCCESS result 和至少 14 天的 checkpoint，以确定性、至多 100 个父行的 FOR UPDATE SKIP LOCKED 批次避开并发 takeover。保留 request/budget/execution lineage 和 usage reservation；无 schema/API/config/frontend 变化。
- 验证分批：Coordinator+Adaptive 统一 62 项批次为 61 passed / 1 race fixture error（exit 1）；affected-only 修复复验 1/1（exit 0）。不是 62/62 全绿。H2 双事务场景通过，PostgreSQL integration 未运行。唯一 reviewer B0/I0/O0。

### Overview M5 完整复用与生命周期收尾（2026-10-23；未部署）

- 完成索引、batch、规划及 writer node 的跨任务复用，并增加 V38 singleton cache admission guard；standalone SUCCESS result/checkpoint cache 默认容量为 256 MiB / 1000 generations。Source/Subject revocation 会 fence 旧任务并清除私有 raw-derived copies；completed-job private payload 按 14 天有界 cleanup，账号删除覆盖 Overview 数据清理并保留已结算 usage evidence。无 public API/SDK wire-shape 变化；新增 V38 migration 与 cache 容量配置。
- 自动验证按独立批次记录：有效 PostgreSQL 17.11 backend full 805 tests / 799 passed / 1 V33 migration fixture failure / 0 errors / 5 skipped；更新 fixture 到 V38 后 affected method 1/1 通过，五项原 skipped usage-guard lock tests 另批 5/5 通过。没有重跑 full，不称 805/805 全绿。最终 -DskipTests package exit 0；唯一 reviewer B0/I0/O0。未部署或完成真实 Provider/GUI/内容质量验收。



### 2026-10-23 总览阶段校验与本机预算收尾

- 主 Agent 直接修复：索引、元数据、目录和正文的阶段覆盖/形状校验在通用调用保存检查点前执行，恢复读取执行相同校验；正文内部顶层冗余 summary 规范化为空，最终目录摘要保留。目录请求校验别名收窄到实际 unit aliases。
- 预算拒绝日志增加阶段、资源、required/remaining；Overview MAP/REDUCE 与总任务共用 overviewMaxCalls，本机 trace overlay 临时设为64，默认24、Token预算524288及历史账本不变。
- 主 Agent 定向验证 OverviewAdaptiveGenerationTests + AiOperationPolicyTests：44/44，0失败/错误/跳过。此前两轮分别发现目录别名集合过宽、异常包装改变既有错误消息，均修复。证据 D:/Temp/auralis-pipeline-fix-20261023/tests-final.log。未调用真实 Provider；完整业务验收待重试。
- 既有不合格检查点会被拒绝，不自动删除；本轮没有增加全新任务预算入口，也未重置用量。当前仅修复新结果写入前的校验边界及恢复校验。

### 2026-10-23 Overview 预算路径第一批修正

- 修复证据：两个实际 run 的索引原文相同，但 Map.of 材料字段顺序在进程重启后不同，使精确提示词 checkpoint 指纹变化。索引及正文材料改为 TreeMap 固定字段顺序；旧不同文本指纹不作兼容匹配，新请求稳定后可按原规则复用。
- Writer preflight 不再将全部最大预留的总和作为硬拒绝条件；总和以 aggregateUpperBound 记录，先检查最大单请求预留能否装入当前余额，逐次派发仍由 Guard 原子预留并按实际 usage 结算。余额不足仍会中途停止，已有 verified checkpoint 保留，不保证整篇一定完成。
- Adaptive 单次预算评估改读持久化 task charged + reserved，包含历史尝试，避免日志把本轮余额当累计余额。新增日志包含 uncachedWriters、aggregateUpperBound、largestRequestReserve、charged、reserved、remaining。
- 定向 OverviewAdaptiveGenerationTests、OverviewBudgetIntegrationTests 共50/50通过（exit0），证据 D:/Temp/auralis-budget-path-20261023/tests.log；未运行全量、真实Provider或GUI。输入估算校准、动态输出预算、明确的预算暂停/恢复状态与用户可读预计成本仍待实现，本条不表示完整优化路线交付。
# 2026-10-25 源码候选

- Adaptive GUIDE 的完整与紧凑提示词按现有输入 token 估算、输出预留、已知模型上下文和平台任务余额选择。有效 checkpoint 在新调用预算筛选前复用；仅 GUIDE 越过通用 prompt 字符门限。其它 stage、Gateway 计量、固定调用/任务配额、输出预留和 BYOK 策略不变。GUIDE focused cases 3/3 通过；唯一只读 review BLOCKER 0 / IMPORTANT 0。未部署、未调用真实 Provider。
