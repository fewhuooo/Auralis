# Auralis 当前问题与审查登记

更新时间：2026-11-15

文档状态：现行风险登记

权威范围：未关闭问题、验收缺口、待核实风险及关闭条件

事实来源：当前源码核对、现行模块/契约和整理前风险记录；本轮未重新运行测试或服务。

## 使用规则

本页将“已知代码问题”“待真实验收”“历史记录待核实”分开。待核实项不代表当前已复现，也不因归档而关闭。旧记录的日期环境、旧测试数量和“未部署”不直接当作今天状态。

[当前状态](Status.md)集中记录近期验证结果；完整过程原文保存在[整理前问题记录](../archive/maintenance-2026-11-13/IssuesAndReview.md)，只用于追溯证据。下方保留原风险 ID 与归并去向，便于旧交接定位。

## 已知代码与自动检查问题

### P1-PC-Knowledge-Late-Publish：知识块迟到写入发布

- 证据：`Auralis-PC/src/store/useKnowledgeStore.ts` 的 `addBlock` 在 `await repo.commitMutation()` 后直接更新 `recentBlocks`，没有复核登录世代。本轮只读核对仍存在；读取侧的世代保护不覆盖该写入。
- 影响：等待旧账号本地提交时切换账号，旧知识块可能发布到新会话共享投影。
- 动作与关闭条件：在发布边界核对会话；验证旧账号数据仍保存在旧仓库、迟到结果不进入新会话。不得以丢弃已经提交的数据解决。

### P1-Overview-Subject-Job-Input：学科后台作业输入为空

- 证据：`OverviewGenerationService.generateForJob` 用 `new SubjectOverviewSourceInput(id, null, null, null)` 构造学科资料；同服务输入校验拒绝大纲和总结都为空的来源。
- 影响：学科直接入口已修并有成功记录，但持久后台作业仍可能在生成前失败；两条入口不能合并验收。
- 动作与关闭条件：按现行 Markdown 输入契约补齐后台作业资料读取，验证 SUBJECT job 的准入、执行、取消与保存；不恢复已退役 Writer/preview/publication。

### P1-Mobile-Review-Type-Drift：4 项类型错误已修复

手机和平板独立复习页已使用现行生命周期。平板创建知识块时先生成 ID，保存成功后按该 ID 选中条目。移动端类型检查及自动回归通过。独立复习和平板工作区复习的真机走查仍开放。

### P1-Test-Baseline：全量门禁尚未统一全绿

- PC 11-13 扩展全量首次 843/848；一条受影响本地优先断言修复后对应套件 6/6，其余四项基线失败涉及侧栏连接投影、个人空间导出文案、复习统计固定日期与搜索变量名断言。`check:r4-pc` 仍命中 Rust 测试回环地址。
- Server 11-12 相关 199 项及 package 通过；全量 911 项/3 失败/0 错误/2 跳过，失败为 `OverviewIdentityPostgresIntegrationTests`、`TaskColorRemovalMigrationTests` 迁移版本预期及 `AiFeaturePolicyParityTests` 调用上限断言；私有 trace replay 缺数据跳过。
- Server 11-15 登录注册与改密分支全量复跑 921 项，1 项既有 AI 策略断言失败，35 项受测试 PostgreSQL 或 TLS 环境影响，5 项跳过。定向验证 50 项通过。见 `D:/Temp/auralis-auth-password-change-full.log`。
- 关闭条件：在明确源码版本、依赖与测试数据下定位并修复或记录接受范围，产生实际完整门禁结果。不能合并不同批次定向通过为全量通过，也不以旧 Docker 不可用记录推断今天环境。
- 证据：`D:/Temp/auralis-dashboard-fixes-20261113/`、`D:/Temp/auralis-platform-ai-20261112/report.md`。

## 按领域保留的验收与待核实项

### PC 数据、登录、排期与复习

- **历史审计待核实（P2）**：[2026-10-07 审计](../archive/superseded-2026-11-15/2026-10-07-pc-service-function-audit.md) 的 O1（统计请求失败反馈）、O2（搜索失败与空结果区分）、O5（UTC 今日标记）、O8（同名学科并发）、O6/O7（时间线当前时刻/午夜与跨周守卫）是旧时点发现，不是本轮新复现；后续页面和排期已有修改，现行是否仍存在需分别核实。关闭条件为逐项对照当前实现及已有相关回归，记录已修复、仍存在或范围决策及证据，不直接沿用旧源码行号实施修复。
- **认证验收（11-15）**：桌面试测已确认 QQ 注册验证码到达真实收件箱，隔离 SMTP 走通注册与重置。实际部署的 SMTP、原生窗口操作和三端注册、登录、续期与重置流程待验收。改密的自动验证覆盖当前设备续期成功及其他设备旧凭证失效，真实双设备走查仍待进行。
- **同步与自动概览（P2）**。自动同步与自动生成概览已接通。真实 Tauri 的关闭后离线编辑、重新启用补传及文件处理后触发概览待走查。见 [PC 同步与文件概览](../modules/FrontendPC.md#同步与文件概览)。界面语言已接通主要页面，资料预览、关系图谱以及部分学科工作区子视图和通知仍有未翻译文案。
- **会话与本地仓储（P1）**：真实 Tauri SQLite、用户/设备隔离、旧数据边界、连续离线编辑、reset、墓碑/未结算 mutation、跨账号切换和双设备冲突仍缺完整现场证据。登录守卫源码已恢复；验收目标是登录、刷新、退出、过期与失败导航，不再将“守卫直接 next”列为当前缺陷。
- **学科工作区知识块**。学科工作区已覆盖详情刷新、草稿保留、重复创建防护和知识块版本冲突。PC SQLite 回归覆盖删除前版本复核和拒绝回执后的本地收敛。双设备同步和真实 Tauri 交互待验收。现有冲突恰逢全量快照重置时，若云端删除只随快照到达，客户端可能暂时无法在详情确认该删除，仍保留本机内容。
- **排期（P1）**：连续拖动与基线映射有修复/定向记录。11-14 桌面试测发现连续换位可能因同一时刻的不同写法（`.000Z` 与 `Z`）误报来源变化，前一笔回执在排期计算后更新版本时也会误报其他窗口改期。现按实际时刻比较，并在事务内复核排期计算字段，字段一致时采用当前版本。已有普通创建或更新的任务在与排期队列合并前同步核对队列与本地基线，定向测试覆盖拒绝时保留草稿和原命令、结算后可重试。
- **原生拖放与同步验收（P1）**：隔离 Chromium 已复现并验证日视图行间空隙接收放置事件及卡片主体落回原时段的提示。桌面另有未来空槽显示禁止放置的反馈，当时数据库任务均可排期且无未结算命令。重开后捕获到一次从空槽选中文字后拖向卡片、没有任务拖放数据的事件，日视图与周视图已禁用排期区域的文字选取。此前整页出现禁止符号仍待采集原生拖放事件。关闭需复测真实 Tauri 连续换位、未结算取消后重排、拒绝恢复与断网重启，以及 PostgreSQL 多设备排期。取消协调的关闭条件见 [PC 交接](../plans/2026-11-03-pc-review-unschedule-handoff.md)。
- **排期分支 Server 全量（11-14）**：执行 889 项，其中 2 项既有断言失败、47 项报错、5 项跳过。报错涉及 PostgreSQL、MinIO 和 TLS 测试环境，以及一项定向复测通过的资料版本冲突。测试日志见 `D:/Temp/auralis-timeline-refactor-20261114/`。
- **复习（P1，待核实现场）**：数据库对象误传与重复读等待已有修复；审计时间精度导致的既有冻结回执恢复仍须按完整血缘处理，不能直接采用云端状态。关闭需真实数据规模的加载/同步耗时和回执恢复记录。
- **学科复习提交与历史一致性（11-13）**。活动轮次内已提供失败恢复入口。本地事务拒绝过期版本的请求，服务端使用同一快照读取复习历史。真实 Tauri 的卡片恢复与 PostgreSQL 双设备并发待验收。
- **近期 UI（P2）**：首页搜索/任务反馈、重名提示、删除当前文件、Overview 生成与停止、解析中心、主题/窄窗、弹窗焦点、任务计时及学科图标尚未形成统一 GUI 验收。关闭需指定场景的浏览器/Tauri 证据；样式自动断言不能代替视觉验收。
- **注册前校验与构建体积（P2，待核实）**：旧记录中的前端预校验缺口、大 chunk 警告保留待核实，先查现行表单与新构建输出，不能沿用旧 bundle 文件名和体积实施优化。

### PC 文件、OCR、资产与安装

- **资料导入与处理（11-15）**。后台索引队列在隔离 H2 双账号回归中可处理已删除学科遗留的任务。早先已收到拒绝回执的资料登记需要手动重新登记。前三项修复后的 PC 全量回归 871/873，统计固定日期与 SearchPalette 断言两项失败均已在基线复现。资料库状态已按当前版本核对，定向测试覆盖提交、索引、失败与就绪回包的徽标变化。真实 Tauri、MinIO 与跨设备导入走查待进行。
- **处理链（P1）**：真实 DOC/DOCX/PPT/PPTX/PDF、OCR 页级进度/空页、断网续传、revision 替换、跨设备接手、OCR 中删除、complete/indexing 与最终 UI 收敛需要端到端验收。11-13 删除切换的定向通过没有关闭这些场景。
- **密钥和隐私（P1）**：11-15 源码核对确认，文档 runtime 仍以 cache id/receipt 阻止缺失密钥时的初始化，`e2ee.isEnabled()` 仍将 keyring 查询异常转为 `false`；[10-10 批准的恢复方案](../design/2026-09-04-pc-document-encryption-recovery-design.md)尚未实现。失败任务重试会复用旧 receipt，`READY` 清理失败也会保留 receipt，旧阶段白名单不能作为修复。关闭需验证明确缺失与访问错误的区分、旧缓存和续传状态安全失效化、原文件重新处理，以及 Windows Credential Manager 跨 Entry 持久化；不得生成新 key 冒充旧缓存恢复。检查临时文件、日志、剪贴板/accessibility 不泄漏正文、凭据或签名 URL。
- **预览（P1/P2）**。异常缓存回退和 PDF 错误后的当前文件重试已有定向覆盖。真实 Tauri 仍需结合对象存储验收，并复查多格式、大文件、分页、缩放、旋转、快速切换、窄栏表现及资源内存占用。
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

- **真实恢复（P1）**：会话范围绑定、LEGACY 只读、UNKNOWN 显式恢复、retry/cancel、迟到事件和已提交活动保留需真实 Provider/GUI 验收；恢复不等于退款，也不证明远端计算已停止。
- **Chat 断流恢复与入队拒绝（待真实验收）**。PC 断流误完成、恢复丢失重试身份和迟到历史覆盖已加入定向回归。题卡现行字段及旧会话只读有自动验证。Server 的 503 回归覆盖未派发结算、拒绝重放和已提交答案的保留。真实 Tauri、网络代理和 PostgreSQL 联调仍待验收。
- **来源总览与部署对应性（P1）**：`read_source_overview` 事务边界已有 PG 回归，缺失/失效/分页亦有定向证据；当日“未部署”不能推断今天仍旧版本。需核对当前镜像并回放原故障，确认正式结果有效性与范围边界。
- **输出与检索质量（P1）**：目录不是全文阅读；定向 search 与有界 evidence 不证明中文语义召回、停止无关检索或抗提示注入。空回复、展示组件选择、中文表达、题卡语义及正文伪 `render_*` 调用仍需带标签真实样例；历史单例成因不明不得写成普遍缺陷。
- **网络、安全和额度（P1）**：真实 DNS/证书/代理、429/5xx、断流/背压、期限、密钥轮换及日志采集/轮转仍需专项。模型/工具次数、Token/费用和重试账本各自约束；不以提高本机额度关闭预算/并发问题。
- **诊断保留（P2）**：本机 raw assistant capture 仅显式开启时写入，不能代表 HTTP 原始 wire；复现后关闭并按授权清理，私有正文不得扩散到公开接口或日志。
- **Suggestions（P1）**：源码 `SuggestionService` 仍为确定性模板且 citations 为空；真实 LLM/RAG 建议、引用正确性和人工质量验收未完成。

### Mobile、Tablet 与发布基础设施

- **Mobile/Tablet（P1/P2）**：H5/微信构建历史通过不证明 AppID、合法域名、WSS/PUT/SSE、前后台切换、弱网、双设备 reset、真机/横屏/触控/手写可用。Chat 范围/UNKNOWN、独立复习、平板工作区复习和本机重试待逐端走查；local-only 能力必须如实标明。
- **环境旧项（P2，待核实）**：旧 Mobile localhost、页面未接 API、Sass/import 警告需对现行 runtime 和页面 API 映射复核；不直接把旧问题句子当当前事实，也不默认关闭。
- **服务端收敛（P1）**：Source/job 事务与 revision/lease 栅栏有自动证据；真实进程崩溃、stale worker、长 Provider 请求、提交后 WebSocket、遗漏事件重连和跨设备最终状态仍需场景验收。
- **定时清理（P1）**：SyncRetentionService 事务错误有修复回归；至少一次生产形态 scheduled run 日志无相应异常的证据仍待核实。
- **发布（P1/P2）**：生产迁移/恢复、PostgreSQL/MinIO 异常、监控告警、CI 覆盖及正式备份恢复演练未由本机健康检查关闭。旧“没有 CI”表述先按仓库实际重新核对；生产 secret 与部署行为不在文档整理中更改。

## 原风险 ID 归并索引

旧 ID 不因归并而丢失。表内“待核实”指需要针对现行代码/环境判断，仍保留在待办范围；“历史已关闭”只继承原文的明确关闭记录，不意味着所有外部验收完成。原文位置按同名 ID 在[整理前记录](../archive/maintenance-2026-11-13/IssuesAndReview.md)检索。

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
| `P1-Test-Coverage` | 全量门禁及各领域真实验收，开放 |
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
