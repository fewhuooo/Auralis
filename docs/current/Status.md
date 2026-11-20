# Auralis 当前状态

更新时间：2026-11-19

文档状态：现行状态快照

权威范围：当前实现摘要、最近验证边界、待验收事项与下一步

事实来源：当前源码、模块与契约文档，以及整理前现行记录中的带日期验证结果。

## 阅读口径

本页按模块维护结论，不逐次追加工作流水。下列验证均注明发生日期，自动检查、部署和业务验收仅按对应记录判断。源码、自动验证、运行环境和人工验收分别判断。

详细实现见[模块与契约入口](../README.md)，开放风险见[问题和审查](IssuesAndReview.md)。整理前的原始记录已完整保存到[历史快照](../archive/snapshots/maintenance-2026-11-13/Status.md)，仅供追溯当时命令和判断，不据此恢复旧实现或推断今天的运行状态。

## 模块状态

| 模块 | 当前实现摘要 | 验证与验收边界 |
| --- | --- | --- |
| PC | Vue/Tauri 客户端；本地资源与 outbox、同步、资料处理、复习、排期及协议 1 Chat 已有实现；2026-11-19～20 收口 `TASK` 冲突收敛与 AI 过程流修复：极简无框竖向步骤行（去除工具胶囊，完成 `#6E8552` 对勾/失败 `#9C500C`/运行 `#556B3D`）、严格按平滑字数预算交错披露思考与工具、平缓连续 `smoothStreamBuffer` 调速曲线与空池见底冷却复位、`useChatStore` HMR (`acceptHMRUpdate`) 与 `reconcileProcessMetadata` 断线过程态对账，以及 `ChatProcessArea`/`ChatContentRenderer`/`SubjectWorkspace`（`resolveStreamTextDrainAction` / `canFinishStreamSettling` / `restartSettleTimer(450)`）防瞬跳防重排协同升级 | 11-20 `type-check`、`check:r4-pc`（125 文件）、`test:r4-pc`（901/901）、`r4-chat-recovery-handoff.test.mjs`（13/13）与 `vite build` 全部退出码 0；Compose `auralis-backend` (`:8080`) / `auralis-db` (`:5432`) / `auralis-minio` (`:9000`) 均已构建并 `healthy`，`auralis-frontend` (`:80`) 与 `:5173` 在线（未登录首屏烟测通过）；Tauri、真实已登录 Provider 流式及双设备并发仍待实测验收 |
| Overview | Markdown v2：CLEAN → OUTLINE → SUMMARY；超容量自动分批；文件和学科直接入口支持三种模式，正式保存保留 CAS/来源修订校验 | 11-13 有定向回归、真实文件生成及学科桌面保存回读记录；持久后台作业按用户要求退役；复杂材料质量和完整桌面走查仍开放 |
| Chat | 原生工具与公开 parts；会话读取范围绑定、Catalog/定向检索、来源总览读取、UNKNOWN 显式恢复、12 轮/20 次工具上限；2026-11-19 新增 `ChatToolPresentation` 在 `tool.*`/SSE 与 `toolTrace` 输出中文工具名与安全摘要 `label` 并收敛思考提示词，全端统一交叉时间轴与排版规范 | 11-19 Server 定向 8 个测试类（`ChatAgentProtocolPublicationTests` 等）Maven 测试通过；11-20 `auralis-backend` 容器已重建并 `healthy`；真实登录态下 Provider 流式重放、取消/断流真实链路仍待验收 |
| Server 核心 | Identity、Subject、Source/Asset、Knowledge、Task、Review、Stats、Sync/Realtime 与 AI 服务已实现 | 11-16 最近全量 884/884、打包通过；随后 11-19 Chat 工具展示与提示词定向 8 个测试类通过；不等于部署或生产验收 |
| Mobile / Tablet | Uni-app 端共享鉴权、同步、资料、Stats 与协议 1 Chat；2026-11-17～20 完成禅意样式与双端学习全生命周期迁移、并发及过期任务锁定收口，并统一对齐全端 AI 体验：手机 `mobile/ai-search`、平板 `tablet/ai-search` 与 `WorkspaceAiPanel` 共用暖沙麻 `.zen-chat-user-bubble`（`#ECE5D8` / `#262522`）、极简无框竖向步骤行、`MobileChatProcessArea`（受控抽屉平滑排空 `resolveMobileProcessDrawerOpen` 与 `#9C500C` 失败态高对比度）、`MobileChatPartList`（`animateOnMount` + `resolveMobileTextDrainAction` 单包平顺排空防重排）、平缓连续 `smoothStreamBuffer`（含空池冷却）、`aiClient.ts` `#ifdef H5` `fetch` 真流式 SSE、移动端对话页渐隐遮罩/右置回底按钮/无框底栏/卡片表格排版、`SaveKnowledgeBlockModal`、规范化 `string`/`string[]` `activity_submission`、严格交错过程时间轴与思考脱敏、大小写兼容 `toolTrace` 增量恢复与容错轮询、50px `@wheel` + 程序化滚动护栏及标准列表悬挂缩进 | 11-20 最终落盘 `vue-tsc --noEmit`、`check:r4-mobile`（82 文件）、`test:r4-mobile`（111/111）、`test:tablet`、`build:h5` 与 `build:mp-weixin` 全部退出码 0；`:5174` 在线（未登录首屏烟测通过）；真实 Provider/后端 AI 全流程、新学习/复习联调及微信开发者工具/真机（手机与平板）验收仍待实测 |
| 基础设施 | Compose 使用 PostgreSQL/pgvector、MinIO、backend/frontend；平台生成与 Embedding 配置分组 | 11-12/13 有本机部署健康和部分真实生成记录；生产凭据、异常专项、监控、备份恢复及发布演练未由这些记录关闭 |

## Mobile / Tablet：设计范围确认

2026-11-16 已确认三端职责：PC 集中管理资料、知识结构和任务编排；手机随身执行；平板保留完整学习能力，结合阅读、AI、学习复习、触控和分屏。本地手写采用自动保存的自由画布，支持手动导出，不进入云同步。详见[产品需求](../project/ProductRequirements.md#跨端职责)和[交互目标](../project/FrontendDesign.md#mobile--tablet-已确认交互目标)。

本轮仅整理设计与源码差距，未修改业务代码或启用手写入口；任务日期、复习、资料、AI、知识编辑和专注差距见[模块说明](../modules/FrontendMobileTablet.md#已确认目标与实现差距)。未新增自动测试、构建或真机验收结论。

## PC：近期结果

- **认证死状态与旧命名收口（11-16）**。移除仅测试使用的 createAuthSessionState/AuthSessionState，现行认证仍由 useAuthStore 和请求保护函数负责。三项偏好键统一为 auralis 命名空间，实际键为 `auralis.settings.language/autoSync/autoOverview`，主题事件为 `auralis:theme-change`；旧键不读取、不迁移，新键默认简体中文与两个自动开关开启。当前完整缓存上传命名为 `LOCAL_CACHE_SEED`，正文容量诊断命名为 `MESSAGE_CONTENT_BYTES`；算法、阈值和当前上传/CAS 行为不变。PC 最终类型/静态、定向 90/90、全量 867/867 与 Web 构建通过；Server 三类定向含 compile/test-compile，40/40、0 失败/错误/跳过；唯一只读审查 B0/I0/O0。内部名称变更不涉及 OpenAPI，未重新生成 SDK、运行 Server 全量或 GUI 验收。证据 `D:/Temp/auralis-name-cleanup/`，本地提交 `b3442b6`、`44ccb73`；既有工作树与混合文档改动保留，未推送或部署。

- **剩余兼容与无用代码收口（11-16）**。在无需旧数据兼容的前提下，删除 Chat 死方法/错误码、purpose/sourceId 与 LEGACY scope、Overview v1 覆盖/回执/同步分支、默认学科标记、PC 旧库升级/无账号备份/旧 Job 复制、无消费者状态与模型占位字段，并统一 Review 指纹、MinIO 元数据和双端语义学科图标。Task startTime 仅作展示，SubjectHall 通过正式复习仓储读取并复核异步 scope。保留当前容量校验、资料 SHA 补算、schema2 本地缓存上传、版本 CAS 和用户隔离；不删除现有数据或回改服务端历史迁移。最终 PC 类型/静态、全量 866/866 和 Web 构建通过，Server 清洁编译、全量 884/884（0 失败/错误/跳过）和打包通过，OpenAPI 19/19 与双端 SDK 同步，Mobile 协议 28/28、类型检查仍为既有 4 项错误。唯一只读审查无未解决 BLOCKER/IMPORTANT。初次并行验证遇内存提交不足，限制进程内存并串行重试后通过；C 盘空间不足曾影响部分 Surefire 成功日志捕获。证据 `D:/Temp/auralis-cleanup-followup/`；未部署、重启现有服务或开展新的 GUI 验收。代码分步本地提交 `513c15c`、`c5ff623`、`183dcb1`；权威文档与原有文档整理混合，回写保留在工作树，未夹带提交。

- **冗余清理（11-16）**。PC Task 统一 title/description/durationMinutes，保留 startTime 的时间展示转换；移除未消费 API、组件、依赖、7 个 Tauri IPC、旧 Catalog 链和失效样式/检查。Server 移除旧执行账本、SOURCE_CONTENT 绑定和无消费者配置，统计统一生命周期有效结果；Overview 写入移除 inputDescriptor，响应移除 rawUnits 并收口来源枚举，OpenAPI 与双端类型已生成。容量指纹、当前调用账本、CAS 和来源修订围栏保留。PC 全量 869/869、Rust 79/79、静态检查通过；随后仅删除手写请求类型中的旧字段，最终类型检查、相关定向 192/192 和 Web 构建通过。Server 最终全量 885/885，0 失败/错误/跳过，打包通过；OpenAPI 19/19。Mobile 协议 28/28，类型检查有 4 处既有错误，使用本轮前 schema 的隔离副本复现一致。日志见 `D:/Temp/auralis-remove-unnecessary-20261116/`。未部署、未重启已有服务或桌面，未进行新的 GUI 验收。

- **全流程后续核查修复（11-16）**。知识块创建提交后核对登录世代，旧账号迟到结果不再发布到新账号界面；旧账号已提交数据保留。修正统计测试固定日期、搜索变量名断言和知识块测试上下文，并修正静态扫描对 Rust 测试模块回环地址的误报。PC 定向 69/69、全量 879/879、类型检查、静态检查（126 个文件）和 Web 构建通过；构建仍有既有体积及依赖警告。全量日志仅保存结果摘要，其他命令日志见 `D:/Temp/auralis-audit-fixes-20261116/`。未重启桌面或部署后端，新的账号切换竞态修复尚未人工复测。

- **新密码规则（11-16）**。注册、重置和改密统一为至少 8 位且含大写、小写及标点或符号，保留 72 UTF-8 字节上限；旧密码登录不加新复杂度限制。PC/Mobile 校验与 Server DTO、OpenAPI 和双端生成类型已同步。PC 密码定向 17/17、Mobile 协议 27/27、OpenAPI 20/20；Server 全量首轮 924 项有 14 失败、36 错误、5 跳过，受策略影响的测试夹具更新后相关三个 Controller 类 36/36。当时未再次运行全量；后续本轮清洁构建的 Server 全量 888/888 已通过，见下方自动化收口记录。后端镜像已在用户授权后更新到本地环境，readiness 为 UP，数据库版本 46 无需迁移；未修改已有用户密码或发送测试邮件。
- **全流程反馈修复（11-16）**。补齐 Element Plus 全局遮罩样式，修复个人中心及文件删除确认框落在视窗底部的问题；时间线 × 改为移回待办，专注任务改用具体日期；Chat 消息选区提供「添加到对话」和「保存为知识块」，失败回复隐藏残文。PC 类型检查及 Web 构建通过，整批回归 877/879，当次失败为复习统计固定日期与 SearchPalette 静态变量名断言，后续已修正并全量通过；相关定向 Timeline 21/21、登出 3/3、Chat 66/66；最后的 Chat 来源边界修正另经相关 30/30 验证，全量数字对应该局部修正前的一次运行。隔离浏览器验证确认遮罩从 static 改为 fixed；修复后的确认弹窗、Chat 选区两项操作、时间线移回待办与专注日期已由用户在 Tauri 复测通过；异常回复的自动验证不替代全部断流恢复验收。日志：`D:/Temp/auralis-full-flow-fixes-20261115/`。
- **本轮桌面手工试测（11-15～16，用户反馈）**。测试账号已走通文件导入与预览（含 DOCX、PPTX、扫描 PDF/OCR）、文件概览、资料问答与题卡作答、知识块编辑与搜索、时间线排期/换位/跨天/完成恢复、专注与复习。用户确认暂停自动同步后本地保存、模拟离线编辑后补传，以及重开桌面后的数据保留正常。后续复测确认退出及确认弹窗、文件删除、新密码登录与邮箱重置后登录均正常，原账号数据保留；新建空测试账号看不到原账号数据，切回后原数据仍在；重置本地离线数据后学科从云端恢复且无重复。用户在测试账号注销流程指引后反馈通过，未独立核验后台对象永久清理。结果仅覆盖这轮样本和单设备，不关闭双设备并发、异常恢复、长期运行和生产发布门禁。
- **文档密钥恢复（11-15）**。源码核对确认旧阶段筛选修复不适用于现行失败重试与缓存清理路径；[10-10 批准的完整恢复方案](../archive/design-and-plans/design/frontend/2026-09-04-pc-document-encryption-recovery-design.md)仍待实现，本轮未修改运行代码。
- **文件预览恢复（11-15）**。已修复本机副本校验失败阻断云端预览、PDF 解码失败时缺少重试入口。PC 类型检查、139 项定向回归、Windows 上的前端构建及隔离 Chromium 重试验证通过。全量回归 873/875，两项失败与基线相同。真实 Tauri 与对象存储联调待验收。
- **资料导入与处理（11-15）**。后台已删除资料的失效索引任务会结算并释放队列。双账号隔离验证覆盖待领取和重试耗尽的旧任务，两种情况下另一账号的文件均能完成索引。Server 定向 56 项及打包通过。PC 在原文件确认就绪后同步登记，用真实 Store 回归覆盖上传与登记并发、退避到期唤醒和同步结果反馈。PC 定向 142 项、类型检查和 Windows 构建通过。资料库按当前 Source 状态和当前版本的本机进度显示处理徽标，状态同步后原位刷新。相关定向回归 118 项通过。
- **登录注册（11-15）**。邮箱验证码注册、用户名或邮箱登录、邮箱找回密码和透明窗口顶栏已接入。QQ SMTP 注册邮件已到达真实收件箱，隔离邮箱走通注册和重置。个人中心改密后当前设备自动续期并更新设备列表，其他设备的旧凭证在后续请求时失效。
- **个人中心同步与概览（11-15）**。自动同步可暂停本机后台同步并保留待同步数据。自动生成概览可暂停新的文件大纲和总结生成。两项设置均提供手动操作入口。PC 类型检查和 Windows 前端构建通过，全量回归 865/867，2 项失败均已在基线复现。本轮用户已确认暂停同步、离线补传及重启保留；自动概览开关专项仍待走查。
- **个人中心提醒设置（11-15）**。移除任务提醒与专注结束提醒的设置入口。
- **外观与显示（11-15）**。紧凑布局、基础字号及界面语言已通过用户的 Tauri 试测。界面语言覆盖导航和主要页面。隔离 Chromium 的 16 项检查通过，覆盖即时生效、刷新恢复和保留草稿。功能分支的 PC 类型检查及 Windows 前端构建通过，回归 860/863，3 项失败均在基线复现。
- **个人中心（11-14）**。左栏「账号与安全凭证」集中个人资料、登录设备管理、退出登录、重置本地离线数据和注销账户。右栏「AI 设置」集中自动生成概览偏好、使用额度和模型服务配置。PC 应用和 Vite 配置类型检查通过，37 项定向回归通过。扩展套件 7/8，唯一侧栏断言失败在改动前的版本复现。本轮账号安全与本地重置场景的 Tauri 用户复测见上方手工试测记录。

- **首页搜索与任务反馈（11-13）**：退出/切换会话后的迟到读取不再更新面板；日程保存失败校准勾选；快速创建防重复提交，失败保留表单。三项行为回归、直接 `vue-tsc` 与 Vite Web 构建通过。真实双账号和本地写入故障交互待验收。`addBlock` 的迟到写入发布另列开放问题。
- **学科改名（11-13）**：忽略首尾空白与大小写查重并排除自身；保留原名可修改其他字段。类型检查及定向 10/10 通过，桌面交互待验收。
- **删除当前文件（11-13）**：本地提交后切换到剩余文件，空列表回总览，删除期间手动改选优先；后台清理不阻塞切换。文件/本地资产回归 109/109、Overview 回归 155/155、类型检查通过；OCR 中删除等真实场景待验收。
- **Overview 与资料处理 UI（11-10～12）**：重新生成反馈、停止入口、Markdown 排版、解析卡片溢出修复有定向与构建记录；浅/深色、窄窗和真实资料 GUI 待走查。
- **学科工作区知识块（11-13）**。学科工作区的知识块详情跟随本地投影，编辑可保留草稿并核对云端版本。两个创建入口防止重复提交，删除在版本检查和拒绝回执后收敛。PC 应用类型检查和 Vite 构建通过。知识块、仓储与同步共 86/86，六个相关套件 148/149，唯一失败已在基线复现。首次扩展套件 853/859，其中一条知识块契约断言已修正并通过复测，其余五条在基线复现。
- **时间线排期（11-14）**：五种拖放保留既有落点规则，预览和本地提交共用排期计算。周列跨天只移动源任务，回执在本地结算后立即刷新投影。换位按实际时刻核对源排期，计算后收到回执时会在本地事务复核排期基线并保留最新任务资料。真实 Tauri 仍需复测连续换位、未结算取消后重新排期、拒绝恢复和断网重启，跨设备冲突待验收。见 [PC 试测步骤](../modules/FrontendPC.md#时间线隔离试测)。
- **复习**：数据库调用修复已有定向证据，既有复习回执精度恢复及真实断网、重启和双设备场景仍按问题登记推进。
- **学科复习（11-13）**。复习失败恢复入口已接入当前轮次。旧知识块版本的请求会在本地写入前被拒绝，服务端复习历史以同一快照返回状态与结果。PC 应用类型检查通过，四个复习套件 109/110，唯一失败为既有统计用例的固定日期，使用夹具对应时钟复测通过。最终学科复习套件 55/55。服务端 H2 定向 19/19，覆盖并发核对期间返回一致历史。真实 Tauri、PostgreSQL 并发及双设备待验收。
- **资料管理文件选择（11-13）**。资料管理刷新时更新当前文件的信息，保留原学科或全局星图范围。文件从活动资料列表移除后，关闭预览并回到资料阅览区的空态。PC 应用类型检查和定向回归 48/48 通过。真实 Tauri 双设备同步待验收。
- **本地环境（11-13）**：依赖包存在但 `.bin` 缺失已通过 `npm.cmd rebuild --ignore-scripts` 恢复；Tauri CLI 2.11.1 与 Rust/MSVC/WebView2 检查通过。本次未据此宣称桌面启动或安装升级已验收。

相关源码与命令见 [PC 模块](../modules/FrontendPC.md)，UI 规则见[前端设计](../project/FrontendDesign.md)。

## Overview：当前链路与实测边界

当前 `OverviewGenerationService` 使用 `overview-markdown-v2`，委托 `OverviewMarkdownPipeline` 与 `OverviewBatchPipeline`。旧 INDEX/ROUTE/分节 WRITER、旧候选预览与 publication 生成链已退役；历史算法调优记录不作为现行工作清单。

- 输入与动态输出预算为启发式，准入与 Gateway 共用计量；所有批次仍受原任务额度、取消、期限和来源复核限制。
- 11-13 自动分批首轮定向 196 项、长行修正后相关 34 项通过；学科直接入口定向 58 项通过。这是分批证据，不合并表述为一次全量通过。
- 11-13 本机记录：单次输入上限为 32,768 token；文件 `1.pdf` 分批成功并派发 8 次，其余三份资料各 3 次。12:02:15 香港时间，桌面学科总览生成、保存版本 2，并回读大纲与总结一致。
- 隔离真实模型中，PPT 三阶段与 PDF 小窗口多批均完成；正式 PDF/PPT、手册/计划书也有保存回读及用量结算证据。它们覆盖指定样本，不证明任意长文质量。
- 11-13 PC 大纲编辑与总览同步修复完成。应用类型检查通过，首轮 Overview 相关测试 220/220，最终同步套件 38/38，覆盖修订切换、保存等待期间继续输入和第 501 个文件同步。真实桌面交互与服务同步待验收。
- 持久后台 Overview job 已按用户要求退役，保留现行直接生成、PC 自动文件概览、正式结果和调用账本；历史作业记录不删除。复杂文档的限定条件遗漏、议题密度和多批语义质量需继续验收。

证据目录：`D:/Temp/auralis-overview-cap32k-20261113/`、`D:/Temp/auralis-overview-multibatch-implementation-20261113/`。11-12 历史原始实验已在[实验索引](../archive/overview-experiments/README.md)保存。

现行契约见 [API](../contracts/API.md)、[后端模块](../modules/Backend.md)与[Markdown 替换方案](../archive/design-and-plans/plans/overview/2026-11-12-overview-markdown-replacement.md)。

## Chat 与后端

- Chat 当前使用原生 `tool_calls`，不再使用旧 marker/NDJSON parser。会话绑定读取范围；LEGACY 对话保留查看，继续提问需新建。PC 已接入绑定范围与 UNKNOWN 显式恢复；不能推定 Mobile/Tablet 同步完成。
- 11-13 Chat 修复。PC 在断流后核对原 run，UNKNOWN 恢复保留原轮次的重试身份和新输入。题卡按现行字段读取，旧会话仅供查看。Server 对入队拒绝结算未启动尝试。PC 类型检查和 95 项定向测试通过，Server 分两批通过 61 项。真实桌面、代理与 PostgreSQL 联调待验收。
- `read_source_overview` 只读授权范围内当前正式 SOURCE 总览，缺失/失效正常返回，延续页防版本混用。11-05 PostgreSQL 只读事务与行锁冲突已修源码并有 PG/H2 9/9；真实 Provider 重放和部署对应性须针对当前镜像确认，不沿用当日“未部署”为今天事实。
- 11-11 Chat 收尾、配对和额度边界已有修正：默认及硬上限 12 轮模型调用、20 次工具执行，最后允许轮收尾不再执行新工具。token、费用、独立调用帽和 deadline 仍分别生效。
- Source 恢复、解析接收 SHA 校验、下载元数据和来源已删除知识块编辑均有 11-11 模块记录；详细行为以[后端模块](../modules/Backend.md)为准。
- Suggestions 当前仍是确定性基线，`SuggestionService` 返回空 citations；不可当作真实 LLM/RAG 建议质量已完成。

公开事件、恢复和历史边界见 [Chat Runtime API](../contracts/chat-runtime-api.md)。

## 最近验证记录

**11-16 全流程后续自动化收口**：Server 清理 `target` 后，通过 `scripts/test-server.ps1` 在独立回环 PostgreSQL 与合成 TLS 证书环境执行完整套件，888 项全部通过，0 跳过，runner 退出码 0；`-DskipTests package` 通过。任务临时容器与证书目录已清理，业务数据库和运行中的服务未变更。OpenAPI 19 项及生成流程通过，作业路由已从产物与双端生成类型移除；其他端仅更新生成契约，未检查或修改业务。PC 全量 879/879、定向 69/69，最终契约更新后的构建亦通过。证据：`D:/Temp/auralis-audit-fixes-20261116/server-full-suite-final.log`、`server-final-exit.txt`、`server-package.log`、`pc-build-final-contract.log`。本轮审查要求保留历史作业私有载荷清理，已恢复并验证；无剩余审查阻断。未部署、未新增 GUI/真实 Provider 验收。

登录注册分支的 Server 定向验证含 PostgreSQL 6 项，通过 OpenAPI 与两份生成类型核对。改密回归后 Server 定向 50 项和打包通过。PC 定向 101 项、类型检查和 Windows 前端构建通过，Mobile 协议 27 项和 H5 构建通过。真实双设备及完整三端走查见[问题和审查](IssuesAndReview.md#pc-数据登录排期与复习)。

| 日期与范围 | 已记录结果 | 限制与证据位置 |
| --- | --- | --- |
| 11-13 PC 首页 | 扩展全量首次 843/848；受影响本地优先断言修正后该套件 6/6；类型检查与 Web 构建通过 | 四项基线失败未关闭；`D:/Temp/auralis-dashboard-fixes-20261113/` |
| 11-13 PC 学科改名 | 类型检查、定向 10/10、diff check 通过 | GUI 待验；`D:/Temp/auralis-subject-rename-20261113/` |
| 11-13 PC 文件删除 | 类型检查、109/109 与 155/155 两批回归通过 | GUI 待验；`D:/Temp/auralis-file-delete-selection-20261113/` |
| 11-13 Overview | 自动分批 196 项、长行修正相关 34 项、直接入口 58 项分别通过 | 没有本次完整后端全绿结论；见上节证据目录 |
| 11-12 平台 AI 配置 | 相关 199 项通过、package exit 0；全量 911 项/3 失败/0 错误/2 跳过 | 策略及旧迁移断言未关闭；`D:/Temp/auralis-platform-ai-20261112/report.md` |
| 10-12 Mobile 最近记录 | 协议 24/24、静态扫描、H5 build 通过；type-check exit 2 | 当时因复习生成类型缺失失败，见下方 11-16 修复记录 |
| 11-14 PC 时间线 | 类型检查、Vite 构建通过。分支全量初次 856/860，连续换位修复后定向 232/232、全量 858/862，四项失败均已在分支基线复现。随后日视图落点与文字拖动的定向回归分别 114/114、117/117 | 记录属于各次分支验证，真实 Tauri 完整拖放复测仍开放。证据见 `D:/Temp/auralis-timeline-refactor-20261114/` |
| 11-14 Server 时间线 | 定向 80/80，打包、OpenAPI 与生成类型检查通过。回环 H2 后端经认证 Sync push 覆盖占用拒绝、仅移动源任务及幂等重放 | 分支全量 889 项、2 失败、47 错误、5 跳过。环境与复测边界见[问题和审查](IssuesAndReview.md#pc-数据登录排期与复习)，真实 PostgreSQL 多设备排期仍待验收 |
| 11-13 文档整理 | 170 份非归档、非展示 docs Markdown 相对文件链接无失效，指向本轮六份文档的锚点检查通过，diff check 通过 | 六份整理前原文 SHA-256 保全，49 个原风险 ID 保留；未检查外网链接，未运行业务测试 |
| 11-16 文档与规则重整 | 现行文档收敛至 6 个分类目录共 21 份（含 `docs/README.md`），`archive/` 收拢为 4 个子目录；重构 `AGENTS.md`（新增分支隔离/分步原子提交、根因与影响闭包核查、最终落盘代码验证铁律）并与 `BeforeCoding.md` 严格去重分工 | 纯文档整理，未运行应用测试或构建；带 SHA-256 快照原文保持未改，原有业务代码修改保持未覆盖 |

各行属于不同源码时点和范围，不相加为统一验收。完整命令、退出码和中间失败保留在相应报告及[整理前记录](../archive/snapshots/maintenance-2026-11-13/Status.md)。

## 运行环境与发布

11-16 15:36（香港时间）经用户授权，已从当前工作树重新构建镜像并执行 `docker compose --env-file .env up -d --no-deps backend`。新后端镜像为 `sha256:6337a8a8ca4be3df24f5110a345086d9cdff3cc8b69ec2715982a136b5f68849`；容器 healthy，readiness HTTP 200 / UP。Flyway 校验 46 个迁移，业务库仍为 V46，无需迁移。数据库与文件存储容器未重建，桌面未重启。本次仅验证部署启动与健康，未重新执行真实 Provider/GUI 业务流程。构建日志见 `D:/Temp/auralis-audit-fixes-20261116/backend-image-build.log`。

11-18（本地实测启动）应用户要求在本机启动真实后端联调手机端：更新根目录 `.env`（追加 `:5174` CORS）并重建 `auralis-minio` / `auralis-minio-init`；基于 `Auralis-Server` 本机打包的 `auralis-server-0.1.0-SNAPSHOT.jar` 更新 `auralis-backend:latest` 镜像并重建 `auralis-backend`（容器 `healthy`，`readiness` HTTP 200 `{"status":"UP"}`，`OPTIONS /api/reviews/queue` 返回 `Access-Control-Allow-Origin: http://localhost:5174`，未鉴权 `GET /api/reviews/queue` 返回 `401`）；同步启动 `Auralis-Mobile` H5 开发服务（`http://localhost:5174/` HTTP 200）。真实页面交互与业务验收待用户实测。

改动环境、构建或重启前须核对实际配置与运行镜像；本次整理没有读取密钥、改数据或重启进程。部署、诊断和本地依赖恢复分别见[部署指南](../operations/Deployment.md)与[Runbook](../operations/Runbook.md)。

## 下一步与维护

1. 按问题登记推进剩余 correctness 与门禁项；知识块迟到发布已有源码修复，持久后台 Overview job 已退役。移动端 4 项类型错误已关闭，工作区复习已接入现行接口，真机验收继续跟踪。
2. 本轮 PC/Server 自动化已通过；后续按新增改动选择回归范围，保留与本轮验证的差异。
3. 在本轮单设备主流程与双账号切换已获用户确认的基础上，补齐真实 Tauri 资料异常、排期/复习冲突、Chat 取消恢复和双设备验收；Mobile/Tablet 分端验收。
4. 补齐真实 Provider/MinIO 异常、安全专项、安装升级、备份恢复与发布演练。
5. Chat 思考过程展示内容调优按用户要求继续保留为待办；本轮未采集具体样例或确认成因，见[问题登记](IssuesAndReview.md#chat检索与-ai-安全)。

更新时改写对应模块摘要及最近证据，不在标题前追加日期流水。已发生的过程进入 [Changelog](../operations/Changelog.md)或任务报告；风险仅在满足关闭条件后从[开放清单](IssuesAndReview.md)移出。

## 手机优先：后端首步（2026-11-16）

修复无 SHA 上传经服务端补算后的原请求幂等重放；UPLOADING/FAILED 重试保留原校验要求，READY 不重新签发 PUT。源码和两项行为回归已完成。现有 Task、Review、Focus、Source/Asset 和 ParsedDocument 接口作为后续手机接入基础，不新增手机/平板专属后端。

最终 `mvnw.cmd -B -ntp -DskipTests compile` 通过；`-Dtest=AssetShaBackfillTests,SourceAssetRelationServiceTests,ParsedDocumentCompleteTests,FocusSessionControllerTests,ReviewLifecycleServiceTests,StatsControllerTests,CoreDomainControllerTests test` 60/60，通过；`scripts/check-openapi.ps1` 运行时契约及双端 SDK 比对通过。唯一只读 reviewer：BLOCKER 0、IMPORTANT 0、OPTIONAL 0。证据：`D:/Temp/auralis-mobile-backend/`。

本轮无 DTO/数据库/客户端改动，未运行前端类型检查、全量 Server、真实 MinIO/Provider 或 GUI/真机验收，未部署或重启服务。用户级 weekly 仍按现行 UTC 七天；本地自然日趋势与对象存储事务边界见问题登记，未在本轮关闭。

## 手机优先：后端时区与资料事务（2026-11-16）

用户级 weekly 按显式 IANA 时区划分连续七个自然日，省略仍用 UTC。对象存储 HEAD、流式 SHA 校验、解析载荷读取与过期清理脱离数据库事务；短事务重新验证活动账号、资料修订及状态，解析接收、更新资料与索引入队原子提交。失败 Asset 保留供同键重传。无数据库迁移。

后端编译、68 项定向测试、OpenAPI 19 项与双端生成类型一致性检查通过；PC 类型检查及相关消费者 23 项通过，Mobile 协议 28 项通过，类型检查仍是生成前复现的 4 项既有错误。`scripts/test-server.ps1` 在任务专用 PostgreSQL 和 TLS 测试环境通过全量 902 项（0 失败、错误、跳过），`mvnw.cmd -B -ntp -DskipTests package` 通过；唯一只读审查无未解决问题。日志位于 `D:/Temp/auralis-backend-followup/`。

本轮未部署或重启应用，未修改手机/平板页面。真实移动端接入与慢网、设备交接验收分别进行。

## 手机和平板阅读接口（2026-11-16）

共享后端新增到期复习队列和学科资料分页。复习读取支持跨学科，学科资料分页支持只加载当前学科。用户级统计概览和周统计在同一个读取快照上汇总，另一设备提交专注记录时，当前响应的时长和次数使用一致的读视图。

后端定向 50 项通过，含 PostgreSQL 并发统计测试。OpenAPI 19 项和双端 SDK 一致性检查通过，后端打包通过。PC 类型检查和学科复习测试 54 项通过，Mobile 协议测试 28 项通过。Mobile 类型检查仍有 4 条已登记错误，与此前输出逐行一致。日志位于 `D:/Temp/auralis-mobile-read-apis/`。

手机的复习入口和平板资料目录仍待客户端接入与真机验收。运行环境尚未部署本次提交。

## 手机和平板学习统计（2026-11-16）

手机统计页、平板仪表盘共用五项核心指标。个人资料页集中账号与设置，平板复习页聚焦本轮进度。静态检查、指标映射回归 1 项、移动端协议 28 项、H5 和微信小程序构建通过。类型检查仍有 4 项已登记错误，与既有基线逐行一致。运行验证尚待真机验收。日志位于 `D:/Temp/auralis-statistics-simplification/`。

## 手机和平板类型修复（2026-11-16）

移动端类型检查通过，原 4 项错误归零。独立复习接入现行到期队列和生命周期，待确认命令可在同设备重新打开页面后重试。平板创建知识块后按预生成 ID 选中新条目。静态检查、移动端协议与复习回归 29 项、平板逻辑测试、H5 与微信小程序构建通过。日志位于 D:/Temp/auralis-mobile-type-fixes/。独立复习与知识块创建未做真机验收。

平板工作区的「复习」已使用同一套到期队列、翻面核对、反馈确认和本机重试。队列限于当前学科。类型检查、静态检查、移动端 31 项测试、平板逻辑测试及 H5/微信小程序构建通过。学科分页、切换后的迟到响应、跨入口恢复及学科计数已纳入回归。真机走查待进行，验证日志位于 D:/Temp/auralis-tablet-workspace-review/。

## Mobile / Tablet 禅意风格重构、排版与界面打磨及审查收口（2026-11-17）

在保持 `Auralis-Server` 与 `Auralis-PC` 零修改的前提下，在独立分支 `refactor/mobile-tablet-pc-style` 先后完成 6 步基础重构提交（`d4678dc`、`528417e`、`77292c1`、`a9f075c`、`c190308`、`853ec54`）与 3 步体验/排版/架构精修提交（`051a1bb`、`bc6f4f5`、`4214e19`）：
1. **统一视觉令牌、堆叠架构与共享原语**：对齐 `Auralis-PC` 浅色燕麦禅意配色与 DM Sans/Inter 字体回退栈，修复 H5 `<uni-button>` / `<uni-input>` 原生外观、`.uni-picker-container` 层级及 `exitingRoute` 切页防闪烁；新增 `AppPageLayout` `#overlay` 插槽彻底解决底部抽屉被浮动 `AppTabBar` 遮挡，新增 `composables/useEscapeKey.ts` 支持 H5 按 `Escape` 关闭浮层，抽取 `ZenWeekStrip.vue` 与 `ZenTaskRow.vue`，并使 `StudyMetrics` 兼顾平板「个人中心」双列视觉平衡。
2. **Markdown TeX 数学排版与安全加固**：在 `utils/markdown.ts` 内建 `<rich-text>` 兼容的无外网依赖 LaTeX 排版渲染器（分式、根号、上下标、`TEX_SYMBOL_MAP` 精确查找、防冲突哨兵占位符与 `plainMarkdownExcerpt` 纯文本摘录）及严格的链接内联解析 / `renderer.image` 安全协议过滤；补充 `scripts/r4-markdown-math.test.mjs` 行为回归。
3. **手机与平板主体页及三栏工作区精修**：清理跨页面冗长标语与提示标签，对齐 AI 配额剩余额度进度条与数字读数（`remainingTokens / limitTokens`），修复 `tablet/pomodoro` 与手机垂直居中性，收口 `WorkspaceCenterReader` 单行 `54px` 四标签头部与 `?id=` / `?subjectId=` 双参数入参、修复资料预览名称/扩展名识别与 `reloadAll()` 状态顺序、修复 `reviewSaveError && !activeCard` 持久化待保存复习死锁。
4. **最终代码验证边界**：上述最终落盘代码已通过 `vue-tsc --noEmit`、`check:r4-mobile`（76 文件）、`check-tablet-sidebar-transition.mjs`（120ms < 160ms）、`test:r4-mobile`（46/46）、`test:tablet`、`build:h5` 与 `build:mp-weixin` 全部 7 项自动化验证（日志 `D:/Temp/auralis-mobile-awwwards-20261117/final-verification-post-review.log`），并通过唯一只读代码审查与 3 轮基于本地模拟后端预览服务的 H5 Chromium 多视口（`390x844`、`375x667`、`1280x820`、`820x1180`、`680x800`）视觉与 DOM 检查；微信开发者工具、物理手机/平板真机触控、真实 MinIO 预签名域名、WSS/SSE 断流与弱网双端同步仍需真实后端联调验收。
