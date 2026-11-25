# Auralis 当前问题与审查登记

更新时间：2026-11-25

文档状态：现行风险登记

权威范围：未关闭问题、验收缺口、待核实风险及关闭条件

事实来源：当前源码核对、现行模块/契约、带日期验证及用户试测反馈；各条验证边界分别记录。

## 使用规则

本页将“已知代码问题”“待真实验收”“历史记录待核实”分开。待核实项不代表当前已复现，也不因归档而关闭。旧记录的日期环境、旧测试数量和“未部署”不直接当作今天状态。

[当前状态](Status.md)集中记录近期验证结果；完整过程原文保存在[整理前问题记录](../archive/snapshots/maintenance-2026-11-13/IssuesAndReview.md)，只用于追溯证据。下方保留原风险 ID 与归并去向，便于旧交接定位。

## 代码问题与自动检查状态

### P1-PC-Knowledge-Late-Publish：知识块迟到写入发布（源码修复）

- `addBlock` 在创建开始时捕获登录世代，本地提交完成后复核；账号已切换时不更新新账号的共享投影，也不以旧请求唤醒新账号同步。旧账号已提交的数据与 outbox 保留。
- 11-16 定向测试 69/69、PC 全量 879/879，通过真实 Store/本地仓储验证提交等待期间切换账号后的结果隔离。真实桌面竞态尚未人工复测；没有据此宣称所有跨设备边界通过。

### P1-Overview-Subject-Job-Input：学科后台作业输入为空（按用户要求退役）

- 11-16 用户确认移除未被 PC 使用的持久后台 Overview job，而非补全该功能。创建、查询、候选及控制 API、worker 和专属执行分支退役；现行直接生成、PC 自动文件概览与正式结果保存保留。
- 历史作业表与记录保留，调用账本和直接生成安全重试校验保留。验证结果见 Status；11-16 15:36 已更新本地后端，容器健康且 readiness 为 UP。

### P1-Mobile-Review-Type-Drift：4 项类型错误已修复

手机和平板独立复习页已使用现行生命周期。平板创建知识块时先生成 ID，保存成功后按该 ID 选中条目。移动端类型检查及自动回归通过。独立复习和平板工作区复习的真机走查仍开放。

### P1-Test-Baseline：本轮 PC / Server 自动化已通过

- **11-16 剩余清理最终结果**：PC 类型/静态、全量 866/866、构建通过；Server 清洁编译、全量 884/884 和打包通过；OpenAPI 19/19 与双端 SDK 已同步。Mobile 协议 28/28，类型检查仍只有上方登记的 4 项既有错误（图标模板清理后 workspace 行号移动到 1441/1442）。旧格式专属测试随退役能力删除，当前 schema 重开、Task 日期保留、SubjectHall 统计/账号切换和会话范围仍有行为回归。唯一审查无未解决 BLOCKER/IMPORTANT。初次原生内存分配失败后串行、限制进程内存验证通过；C 盘空间不足造成部分 Surefire 成功日志捕获失败，测试汇总与退出码均成功。日志 `D:/Temp/auralis-cleanup-followup/`。没有新增 GUI、真机或 Provider 验收。

- **11-16 冗余清理后的验证**：Server 最终全量 885/885、打包通过；PC 全量 869/869、Rust 79/79，通过后仅有一行请求类型删除，最终类型检查、相关 192/192 与 Web 构建通过。退役能力专属测试随实现移除，不能将测试总数变化视为现行业务覆盖率变化。最后只读补审发现的手写 Overview 请求类型残留已修复。未重新进行 GUI、真实 Provider 或部署验收。

- 11-16 PC 定向 69/69、全量 879/879，类型检查和 Web 构建通过；接口生成类型更新后再次构建通过。统计测试使用固定测试时钟，搜索测试不再依赖局部变量名，知识块测试上下文已对齐当前实现。生产地址静态检查通过 126 个文件，Rust 测试模块中的回环地址不再误报。
- Server 从 `mvnw clean` 后经 `scripts/test-server.ps1` 使用任务专用 PostgreSQL 与合成 TLS 证书执行：888 项，0 失败、0 错误、0 跳过，退出码 0；随后 `-DskipTests package` 通过。Chat 策略断言已对齐分阶段调用限制，PostgreSQL 两种参数和 TLS 文件均由隔离测试入口准备。
- 本轮中途发现的退役清理 SQL、历史私有载荷清理和两项旧接管预期均已修正并纳入最终全量；只读审查提出的历史载荷保留期/来源撤销问题已关闭。历史后台作业专属测试随功能退役移除，测试总数不可直接与先前 924 项相减当成覆盖率变化。
- 原 PC 877/879 及 Server 924 项中的失败属于修复前证据，不再列为本轮开放失败。最终日志、退出码和 Surefire 汇总见 `D:/Temp/auralis-audit-fixes-20261116/`；PC 全量只有执行结果摘要，其余检查保留日志。
- 本轮未运行 Mobile/Tablet 检查，未部署后端、重启桌面或进行新的真实 Provider/GUI 验收；其他端类型问题和下方现场验收项继续独立跟踪。

## 按领域保留的验收与待核实项

### PC 数据、登录、排期与复习

- **确认弹窗（11-16）**：个人中心退出/重置/注销及文件删除共用 Element Plus MessageBox；全局遗漏 `el-overlay.css` 导致遮罩为 static、弹窗落在视窗底部。已补全局样式并通过隔离浏览器前后对比及登出定向回归；用户随后在 Tauri 确认弹窗恢复可用，并完成文件删除、测试账号本地重置及注销流程反馈；该可见性问题关闭，注销后的后台永久清理未独立核验。
- **本轮桌面试测范围（11-15～16）**：用户确认本轮资料、知识、Chat、排期、专注、复习、离线补传和重启保留场景通过，详见 Status。后续确认了改密和邮件重置后登录、文件删除、双账号切换隔离及本地重置后云端恢复无重复，并反馈测试账号注销流程通过。该反馈不关闭多设备、并发、长期运行、异常回执、全部文件样本及后台永久清理风险。
- **历史审计待核实（P2）**：[2026-10-07 审计](../archive/design-and-plans/superseded-2026-11-15/2026-10-07-pc-service-function-audit.md) 的 O1（统计请求失败反馈）、O2（搜索失败与空结果区分）、O5（UTC 今日标记）、O8（同名学科并发）、O6/O7（时间线当前时刻/午夜与跨周守卫）是旧时点发现，不是本轮新复现；后续页面和排期已有修改，现行是否仍存在需分别核实。关闭条件为逐项对照当前实现及已有相关回归，记录已修复、仍存在或范围决策及证据，不直接沿用旧源码行号实施修复。
- **认证验收（11-15）**：桌面试测已确认 QQ 注册验证码到达真实收件箱，隔离 SMTP 走通注册与重置。11-16 本机 PC 注册、改密与真实邮箱重置后登录已有用户通过反馈；Mobile/Tablet 和其他部署环境仍待分别验收。改密的自动验证覆盖当前设备续期成功及其他设备旧凭证失效，真实双设备走查仍待进行。
- **同步与自动概览（P2）**。自动同步与自动生成概览已接通。本轮 Tauri 暂停同步后编辑、重新启用补传、离线编辑联网后同步和重启保留已有用户通过反馈；自动概览开关与文件处理触发关系仍待专项走查。见 [PC 同步与文件概览](../modules/FrontendPC.md#同步与文件概览)。界面语言已接通主要页面，资料预览、关系图谱以及部分学科工作区子视图和通知仍有未翻译文案。
- **会话与本地仓储（P1）**：本轮 Tauri 已有单设备离线保存、重启、双账号隔离切换及 reset 后云端恢复无重复的用户反馈；旧数据边界、长期连续编辑、墓碑/未结算 mutation、迟到写入及双设备冲突仍缺完整现场证据。登录守卫源码已恢复；验收目标是登录、刷新、退出、过期与失败导航，不再将“守卫直接 next”列为当前缺陷。
- **学科工作区知识块**。学科工作区已覆盖详情刷新、草稿保留、重复创建防护和知识块版本冲突。PC SQLite 回归覆盖删除前版本复核和拒绝回执后的本地收敛。本轮 Tauri 普通知识块创建、编辑与搜索已获用户确认；双设备同步及冲突恢复仍待验收。现有冲突恰逢全量快照重置时，若云端删除只随快照到达，客户端可能暂时无法在详情确认该删除，仍保留本机内容。
- **排期（P1）**：连续拖动与基线映射有修复/定向记录。11-14 桌面试测发现连续换位可能因同一时刻的不同写法（`.000Z` 与 `Z`）误报来源变化，前一笔回执在排期计算后更新版本时也会误报其他窗口改期。现按实际时刻比较，并在事务内复核排期计算字段，字段一致时采用当前版本。已有普通创建或更新的任务在与排期队列合并前同步核对队列与本地基线，定向测试覆盖拒绝时保留草稿和原命令、结算后可重试。
- **原生拖放与同步验收（P1）**：隔离 Chromium 已复现并验证日视图行间空隙接收放置事件及卡片主体落回原时段的提示。桌面另有未来空槽显示禁止放置的反馈，当时数据库任务均可排期且无未结算命令。重开后捕获到一次从空槽选中文字后拖向卡片、没有任务拖放数据的事件，日视图与周视图已禁用排期区域的文字选取。此前整页出现禁止符号仍待采集原生拖放事件。关闭需复测真实 Tauri 连续换位、未结算取消后重排、拒绝恢复与断网重启，以及 PostgreSQL 多设备排期。取消协调的关闭条件见 [PC 交接归档](../archive/design-and-plans/plans/learning/2026-11-03-pc-review-unschedule-handoff.md)。
- **排期分支 Server 全量（11-14）**：执行 889 项，其中 2 项既有断言失败、47 项报错、5 项跳过。报错涉及 PostgreSQL、MinIO 和 TLS 测试环境，以及一项定向复测通过的资料版本冲突。测试日志见 `D:/Temp/auralis-timeline-refactor-20261114/`。
- **复习（P1，待核实现场）**：数据库对象误传与重复读等待已有修复；审计时间精度导致的既有冻结回执恢复仍须按完整血缘处理，不能直接采用云端状态。实施与恢复约束（见[PC 交接归档](../archive/design-and-plans/plans/learning/2026-11-03-pc-review-unschedule-handoff.md)）：仅对 `createdAt/updatedAt` 接受数据库微秒精度等价比较，且仅对 `status=conflict && prepared=false` 的 FIFO 队首在核对完整 protocolVersion=2 血缘与原子 CAS 条件后恢复为 `pending`；`prepared=true` 或已派发命令不得自动解锁。关闭需真实数据规模的加载/同步耗时和回执恢复记录。
- **学科复习提交与历史一致性（11-13）**。活动轮次内已提供失败恢复入口。本地事务拒绝过期版本的请求，服务端使用同一快照读取复习历史。真实 Tauri 的卡片恢复与 PostgreSQL 双设备并发待验收。
- **近期 UI（P2）**：首页搜索/任务反馈、重名提示、删除当前文件、Overview 生成与停止、解析中心、主题/窄窗、弹窗焦点、任务计时及学科图标尚未形成统一 GUI 验收。关闭需指定场景的浏览器/Tauri 证据；样式自动断言不能代替视觉验收。
- **注册前校验与构建体积（P2，待核实）**：旧记录中的前端预校验缺口、大 chunk 警告保留待核实，先查现行表单与新构建输出，不能沿用旧 bundle 文件名和体积实施优化。

### PC 文件、OCR、资产与安装

- **资料导入与处理（11-15）**。后台索引队列在隔离 H2 双账号回归中可处理已删除学科遗留的任务。早先已收到拒绝回执的资料登记需要手动重新登记。前三项修复后的 PC 全量回归 871/873，统计固定日期与 SearchPalette 断言两项失败均已在基线复现。资料库状态已按当前版本核对，定向测试覆盖提交、索引、失败与就绪回包的徽标变化。本轮 Tauri 普通导入与预览已获用户确认；MinIO 异常与跨设备导入走查待进行。
- **处理链（P1）**：本轮 PDF、DOCX、PPTX 与扫描 PDF/OCR 导入及预览样本已获用户确认。DOC/PPT、OCR 页级进度/空页、断网续传、revision 替换、跨设备接手、OCR 中删除及异常 complete/indexing 的最终 UI 收敛仍需端到端验收。11-13 删除切换的定向通过没有关闭这些场景。
- **密钥和隐私（P1）**：11-15 源码核对确认，文档 runtime 仍以 `payloadCacheId`/`payloadReceipt` 阻止缺失密钥时的初始化，`e2ee.isEnabled()` 仍将 keyring 查询异常转为 `false`；[10-10 批准的恢复方案](../archive/design-and-plans/design/frontend/2026-09-04-pc-document-encryption-recovery-design.md)尚未实现。已批准的实施与关闭约束：仅当 OS keyring 明确确认原密钥条目不存在时才自动初始化新密钥（访问被拒或凭据库异常必须原样报错，禁止当作缺失或轮换密钥，须修正 `e2ee.isEnabled()` 吞异常行为）；安全废弃受影响任务的旧加密 cache、`payloadReceipt` 与续传进度（覆盖失败重试保留 receipt 及 `READY` 清理残留场景，禁止按终态阶段白名单放行），随后从本地/受管原始文件重新处理并上传，原文件不可得时提示用户重新选择文件；不得生成新 key 冒充旧缓存恢复。需验证 Windows Credential Manager 跨 Entry 持久化，并检查临时文件、日志、剪贴板/accessibility 不泄漏正文、凭据或签名 URL。
- **预览（P1/P2）**。异常缓存回退和 PDF 错误后的当前文件重试已有定向覆盖。普通多格式预览已有本轮 Tauri 用户反馈；异常缓存回退仍需结合对象存储验收，大文件、分页、缩放、旋转、快速切换、窄栏与内存占用保留专项。
- **资料管理预览与星图**。定向回归覆盖学科分组与汇总分组的文件选择，以及 Source 同步删除后关闭预览。真实 Tauri 双设备同步待验收。
- **上传与 MinIO（P1/P2）**：真实直传、签名 URL、CORS、大小/hash 不符、对象不存在、超时/重复 complete、生产 bucket policy 和凭据仍需专项证据。
- **本地导出与恢复（P1）**。Local Asset 尚无完整备份、导出和恢复入口。关闭条件是明确产品导出范围并验证相应数据与原文件的恢复流程。
- **安装（P2）**：历史 MSI/bundle 验证与 Error 1925/1603 仅是当时记录；安装/升级/卸载、安装后离线 OCR 和数据保留尚未关闭，需有安装权限的 Windows x64 现场。

### Overview

- **质量与容量（P1）**：估算与提示均为启发式。已有样本出现限定条件遗漏（手册教师团队成员例外）、术语泛化、主题条目偏密和背景残留；长文多批流程仍受任务额度与期限限制。关闭需当前正式版本的带原文核对样本，不能以模型正常结束代替内容正确。
- **大纲编辑与总览同步（待真实验收）**：定向回归覆盖按当前修订编辑、保存期间继续输入、第 501 个文件同步及旧快照下的新修订待写。关闭需 Tauri 编辑交互和真实服务同步证据。
- **真实取消与归因（P1）**：代理缓冲/断开、远端计算取消、启动/联网/手动重试等触发归因、PC—Server—Provider 关联仍需真实链路。安全诊断必须继续脱敏。
- **跨实例协调（P1，待核实）**：旧 `P1-PC-Overview-Server-Deduplication` 是旧生成链的单实例证据；Markdown v2 下的同键并发/多副本成本与发布行为须重新按现行代码核对。没有多副本验收，不把旧实现结论直接移植到新链。
- **历史生命周期与 trace（P1/P2，待核实）**：旧 generation/checkpoint 表的保留清理与新生成路径分开核对；不得删除账本或用户数据。11-13 本轮没有重新验收后台清理、容量压力、断连收尾、日志保留或用户删除对本地诊断导出的处理。

### Chat、检索与 AI 安全

- **Chat 思考过程展示内容与跨端对齐调优（2026-11-19，代码与自动化已收口，真实 Provider/GUI 复测开放）**：针对早先思考过程泄漏内部工具名（如 `list_sources`、`chunk`、`read_source_overview`）、规则自述及跨端差异问题，2026-11-19 已在 `ChatAgentOrchestrator.SYSTEM_PROMPT` 与前后端两侧收敛思考表达、补充 `ChatToolPresentation` 中文工具名与安全 `label`（保留底层 Provider ASCII 协议名），并在 PC / Mobile / Tablet（含 `WorkspaceAiPanel`）全端对齐交叉过程时间轴、左侧绿勾样式、`13px` `#8C887F` 思考脱敏与列表悬挂缩进排版；经本轮唯一只读 Reviewer 核查发现的 1 个 `BLOCKER`（`toolTrace` 小写状态兼容性）与 7 个 `IMPORTANT` 项已全部修复并通过回归与构建（5 项 `OPTIONAL` 如死导出 `formatAiToolStatus`、卸载通知、`ol` 属性选择器、视口 resize 重测、既有文件旧 `any` 保持延后不乱改）。真实大模型生成效果、多端触控/桌面 GUI 与断流恢复联调仍待实测关闭。
- **真实恢复（P1）**：会话范围绑定、UNKNOWN 显式恢复、retry/cancel、迟到事件和已提交活动保留需真实 Provider/GUI 验收；恢复不等于退款，也不证明远端计算已停止。
- **Chat 断流恢复与入队拒绝（待真实验收）**。PC 断流误完成、恢复丢失重试身份和迟到历史覆盖已加入定向回归。题卡现行字段及旧会话只读有自动验证。Server 的 503 回归覆盖未派发结算、拒绝重放和已提交答案的保留。真实 Tauri、网络代理和 PostgreSQL 联调仍待验收。
- **来源总览与部署对应性（P1）**：`read_source_overview` 事务边界已有 PG 回归，缺失/失效/分页亦有定向证据；当日“未部署”不能推断今天仍旧版本。需核对当前镜像并回放原故障，确认正式结果有效性与范围边界。
- **输出与检索质量（P1）**：目录不是全文阅读；定向 search 与有界 evidence 不证明中文语义召回、停止无关检索或抗提示注入。空回复、展示组件选择、中文表达、题卡语义及正文伪 `render_*` 调用仍需带标签真实样例；历史单例成因不明不得写成普遍缺陷。
- **网络、安全和额度（P1）**：真实 DNS/证书/代理、429/5xx、断流/背压、期限、密钥轮换及日志采集/轮转仍需专项。模型/工具次数、Token/费用和重试账本各自约束；不以提高本机额度关闭预算/并发问题。
- **诊断保留（P2）**：本机 raw assistant capture 仅显式开启时写入，不能代表 HTTP 原始 wire；复现后关闭并按授权清理，私有正文不得扩散到公开接口或日志。
- **Suggestions（P1）**：源码 `SuggestionService` 仍为确定性模板且 citations 为空；真实 LLM/RAG 建议、引用正确性和人工质量验收未完成。

### Mobile、Tablet 与发布基础设施

- **Mobile/Tablet 持久化、双端交互对齐与端到端 UX/服务端 BYOK 收口（2026-11-23～25，代码与自动化已收口，部分现场与真机待验）**：在完成 11-17～20 禅意重构、双端学习全生命周期迁移、全端 AI 协议 1 体验对齐与两轮持久化审查的基础上，11-25 完成面向真实用户联调的端到端 UX 与后端链路修复及逐页视觉对齐：后端修复 `test-connection` 0ms 超时异常、补齐 `SiliconFlowAiProvider` 与跨 BYOK 槽位按更新序解析、将 CORS 升级为 `.allowedOriginPatterns(...)`（`42/42` AI 定向测试通过）；前端修复排期重叠防丢与冲突提示、未同步任务 Focus Outbox 404 延后重试、WS `OVERVIEW_UPDATED` 实时刷新、英文 `ProblemDetails` 本地化、双倍复制提示、登录路由守卫与 `@confirm` 提交、弹窗裁切与零学科快建、AI 会话删改 409 版本刷新与防重复气泡、文档预览 `v-show` 保活、`StudyMetrics` 5 格骨架/缓存/同步刷新及冷启动闪烁抑制，并完成平板联调收口：`overviewApi.getSubjectStatuses` 预检消除总览 404 刷屏、`WorkspaceKnowledgeBlockModal` 1:1 对齐 PC（5 色标记与实时预览）、无文字圆形 `auralis-mark` AI 浮窗入口与精简对齐 PC 的 `WorkspaceAiPanel`、PC `SubjectWorkspace` 与平板统一的左对齐双行引导卡，以及 `WorkspaceReviewPane` 规划与轮次卡片 1:1 对齐 PC。最终 `Auralis-Mobile`（`vue-tsc --noEmit`、`check:r4-mobile` 85 文件、`test:r4-mobile` 129/129、`test:tablet`）与 `Auralis-PC`（`vue-tsc -b`、`check:r4-pc` 125 文件、`test:r4-pc` 901/901）全部通过；用户已在本地 H5 + Docker 后端完成一轮平板逐页试测。**仍未关闭的运行/现场项**：真实已登录态下跨更多样本的全端流式效果、Tauri/PC GUI 实测、微信开发者工具与真机触控/键盘、MinIO 跨域直传与多设备并发冲突走查仍开放；此前登记的 `OPTIONAL` 延后项保持延后。
- **环境旧项（P2，待核实）**：旧 Mobile localhost、页面未接 API、Sass/import 警告需对现行 runtime 和页面 API 映射复核；不直接把旧问题句子当当前事实，也不默认关闭。
- **服务端收敛（P1）**：Source/job 事务与 revision/lease 栅栏有自动证据；真实进程崩溃、stale worker、长 Provider 请求、提交后 WebSocket、遗漏事件重连和跨设备最终状态仍需场景验收。
- **定时清理（P1）**：SyncRetentionService 事务错误有修复回归；至少一次生产形态 scheduled run 日志无相应异常的证据仍待核实。
- **发布（P1/P2）**：生产迁移/恢复、PostgreSQL/MinIO 异常、监控告警、CI 覆盖及正式备份恢复演练未由本机健康检查关闭。旧“没有 CI”表述先按仓库实际重新核对；生产 secret 与部署行为不在文档整理中更改。

## 原风险 ID 归并索引

旧 ID 不因归并而丢失。表内“待核实”指需要针对现行代码/环境判断，仍保留在待办范围；“历史已关闭”只继承原文的明确关闭记录，不意味着所有外部验收完成。原文位置按同名 ID 在[整理前记录](../archive/snapshots/maintenance-2026-11-13/IssuesAndReview.md)检索。

| 原 ID | 本页归属与状态 |
| --- | --- |
| `P1-Asset-Verification` | PC 文件、OCR、资产与安装：MinIO 异常与生产配置开放 |
| `P1-Auth-Guard` | PC 数据、登录、排期与复习：验收开放；旧实现描述待核实 |
| `P1-Backend-Contract-Cutover` | PC 数据、登录、排期与复习：验收开放；旧实现描述待核实 |
| `P1-Backend-Docker-Gate` | Mobile、Tablet 与发布基础设施：运行/收敛/发布验收开放；旧环境原因待核实 |
| `P1-Device-Identifier-Contract-Cutover` | PC 数据、登录、排期与复习：验收开放；旧实现描述待核实 |
| `P1-Mobile-Platform-Validation` | Mobile、Tablet 与发布基础设施：接入/平台验收开放或待核实 |
| `P1-OpenAPI-Mobile-Schema-Lock` | 历史已明确关闭；后续契约/真实设备验收仍独立跟踪 |
| `P1-OpenAPI-PC-Schema-Stale` | 历史已明确关闭；后续契约/真实设备验收仍独立跟踪 |
| `P1-PC-AI-Reading-Flow` | PC 文件、OCR、资产与安装：现场验收开放 |
| `P1-PC-AI-Recovery-Validation` | Chat、检索与 AI 安全：真实 Provider/客户端验收开放 |
| `P1-PC-Document-Real-Processing-Validation` | PC 文件、OCR、资产与安装：现场验收开放 |
| `P1-PC-FilePreview-GUI-Validation` | PC 文件、OCR、资产与安装：现场验收开放 |
| `P1-PC-Local-Repository-Cutover` | PC 数据、登录、排期与复习：验收开放；旧实现描述待核实 |
| `P1-PC-OCR-GUI-Validation` | PC 文件、OCR、资产与安装：现场验收开放 |
| `P1-PC-OCR-Privacy-Observation` | PC 文件、OCR、资产与安装：现场验收开放 |
| `P1-PC-Overview-Server-Deduplication` | Overview：真实链路/跨实例等边界，开放或待核实现行对应 |
| `P1-PC-Overview-Tauri-Provider-Attribution` | Overview：真实链路/跨实例等边界，开放或待核实现行对应 |
| `P1-PC-Overview-Timeout-Mismatch` | Overview：真实链路/跨实例等边界，开放或待核实现行对应 |
| `P1-PC-Source-Convergence-External-Validation` | Mobile、Tablet 与发布基础设施：运行/收敛/发布验收开放；旧环境原因待核实 |
| `P1-PC-Task-Scheduling-Atomicity` | PC 数据、登录、排期与复习：验收开放；旧实现描述待核实 |
| `P1-PC-Task15-External-Validation` | Mobile、Tablet 与发布基础设施：运行/收敛/发布验收开放；旧环境原因待核实 |
| `P1-PC-Task16-External-Validation` | Mobile、Tablet 与发布基础设施：运行/收敛/发布验收开放；旧环境原因待核实 |
| `P1-Phase5-External-Infra` | Mobile、Tablet 与发布基础设施：运行/收敛/发布验收开放；旧环境原因待核实 |
| `P1-Phase5-Ingestion-Fencing` | Mobile、Tablet 与发布基础设施：运行/收敛/发布验收开放；旧环境原因待核实 |
| `P1-Phase5-Provider-Security` | Chat、检索与 AI 安全：真实 Provider/客户端验收开放 |
| `P1-Phase5-Suggestion-Quality` | Chat、检索与 AI 安全：Suggestions，开放 |
| `P1-Server-Scheduled-Retention-Transaction` | Mobile、Tablet 与发布基础设施：运行/收敛/发布验收开放；旧环境原因待核实 |
| `P1-Server-Task14-External-Validation` | Mobile、Tablet 与发布基础设施：运行/收敛/发布验收开放；旧环境原因待核实 |
| `P1-Subject-Color-Contract-Cutover` | PC 数据、登录、排期与复习：验收开放；旧实现描述待核实 |
| `P1-Sync-Cursor-Concurrency` | 历史已明确关闭；后续契约/真实设备验收仍独立跟踪 |
| `P1-Sync-Snapshot-Tombstone` | 历史已明确关闭；后续契约/真实设备验收仍独立跟踪 |
| `P1-Test-Coverage` | 本轮 PC/Server 自动化通过；其他端及各领域真实验收仍开放 |
| `P2-Infra-Readiness` | Mobile、Tablet 与发布基础设施：运行/收敛/发布验收开放；旧环境原因待核实 |
| `P2-Migration-Strategy` | Mobile、Tablet 与发布基础设施：运行/收敛/发布验收开放；旧环境原因待核实 |
| `P2-Mobile-BaseUrl` | Mobile、Tablet 与发布基础设施：接入/平台验收开放或待核实 |
| `P2-Mobile-Build-Warning` | Mobile、Tablet 与发布基础设施：接入/平台验收开放或待核实 |
| `P2-Mobile-Contract` | Mobile、Tablet 与发布基础设施：接入/平台验收开放或待核实 |
| `P2-PC-Asset-Upload-Validation` | PC 文件、OCR、资产与安装：现场验收开放 |
| `P2-PC-Auth-Validation-UX` | PC 数据、登录、排期与复习：验收开放；旧实现描述待核实 |
| `P2-PC-Bundle-Size` | PC 数据、登录、排期与复习：验收开放；旧实现描述待核实 |
| `P2-PC-Document-Processing-Validation` | PC 文件、OCR、资产与安装：现场验收开放 |
| `P2-PC-File-Viewer-Validation` | PC 文件、OCR、资产与安装：现场验收开放 |
| `P2-PC-Frontend-Refactor-Validation` | PC 数据、登录、排期与复习：验收开放；旧实现描述待核实 |
| `P2-PC-Modal-Consistency` | PC 数据、登录、排期与复习：验收开放；旧实现描述待核实 |
| `P2-PC-Subject-Icon-Validation` | PC 数据、登录、排期与复习：验收开放；旧实现描述待核实 |
| `P2-PC-Tauri-MSI-Bundle` | PC 文件、OCR、资产与安装：现场验收开放 |
| `P2-PC-Workspace-Prototype-Validation` | PC 数据、登录、排期与复习：验收开放；旧实现描述待核实 |
| `P2-Phase5-Stream-Granularity` | Chat、检索与 AI 安全：真实 Provider/客户端验收开放 |
| `P2-Tablet-Validation` | Mobile、Tablet 与发布基础设施：接入/平台验收开放或待核实 |

## 已替代记录与维护边界

源码已确认 Overview 使用 Markdown v2 与分批 Pipeline，旧 adaptive 类和 ChatStreamParser 已不在当前生产树。旧 INDEX/ROUTE/WRITER 修复、JSON 尾缀修复、marker/NDJSON parser 等记录只保留在历史快照，不继续列为现行算法待办；用户数据、保留期清理和外部验收仍按上方开放项跟踪。

本轮未重新批准任何历史删除、部署或凭据操作。已关闭的视觉/类型/事务修复从逐日流水移到历史记录，不借整理扩大修复范围。新增问题需给出源码或现场证据、影响、动作和关闭条件；关闭时记录实际验证并在当前清单明确更新，不用“构建成功”替代业务验收。

## 手机后端接入专项边界（2026-11-16）

- **已修复：上传补算哈希后的幂等重放**。`AssetService.verifyImmutableMetadata` 不再把缺省 SHA 与补算后的持久值冲突；显式 SHA 和其他元信息仍严格比较。`AssetShaBackfillTests` 覆盖同一 READY 返回及失败重试不降低校验，自动验证见 Status；真实手机上传/PC 接手待联调。
- **已修复：用户级本地自然日趋势**。`GET /api/stats/weekly` 支持可选 IANA `timeZone`，省略仍按 UTC。后端回归覆盖香港午夜、夏令时、非法参数及用户隔离；手机页面接入与真机验收另行进行。
- **已修复：资料接收与读取占用数据库事务**。Asset HEAD、流式 SHA 补算、解析接收及读取已移出事务；短事务复核账号、状态与修订。解析清理先作废过期上传，再在锁外删除载荷。自动测试覆盖锁外读取、迟到失败、注销、资料删除/修订变化和清理竞争。真实慢网及手机上传后由 PC 接手的业务验收仍待进行。
