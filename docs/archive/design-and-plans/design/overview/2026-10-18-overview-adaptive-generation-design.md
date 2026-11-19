# 内容规模自适应总览设计

2026-10-27 主题聚合提示词候选：INDEX以核心议题组织相关子要点，ROUTE在原章容器内将相关主题组成连贯教学小节，Writer依据本批原文展开。公共指令与字段说明保留简洁的材料边界及输出契约，程序承担身份/结构/容量校验；ROUTE省略建议输出Token后缀，不改变实际预算，不增加节数配额、程序合并、并发或模型修复调用。定向验证分批闭合，尚未部署或验证真实聚合效果。证据 `D:/Temp/auralis-cohesive-prompts-20261027/`。

2026-10-27 原章顺序候选：算法 `overview-adaptive-v11-source-chapter-order`，在现有INDEX顺带提取显式正文章头；程序按来源内(unit顺序,topic输出顺序)跨批继承，前置BODY保留导论，章内仍允许自由组织。ROUTE按固定章容器输入，跨章小节程序分拆归位，无可靠章结构才自由分章后按最早BODY位置排章；不以只有一章或主题密度低就否定原章。模型无需回传offset/hash，不增模型轮次，章识别依赖语义提取与轻量文本定位。本轮编译与分批相关验证完成、唯一只读审查B0/I0/O0（两项IMPORTANT修正后4/4并差量关闭），本轮未部署；较早运行镜像描述为当时快照，最新日志已确认容器镜像更新但算法版本未核实。现行目标与边界见[原章顺序计划](../../plans/overview/2026-10-27-overview-original-chapter-order.md)，下方日期条目保留历史。

2026-10-26 当前候选以[动态容量计划](../../plans/overview/2026-10-26-overview-dynamic-capacity-and-simplification.md)为准：算法 `overview-adaptive-v10-dynamic-capacity-writer-body`，INDEX → 容量允许时一次全局 ROUTE（真正超窗才 bucket）→ 多主题原文去重 Writer → 程序装配 → 轻量 EDIT/ALL 导读。Metadata 不再独立调用；Writer 只返回 schemaVersion/detailedContent，程序绑定授权来源与分配，不将声明当语义覆盖证明。26 项 Overview MAX ENV 默认 0，正数额外限幅；单次模型物理能力与总体财务额度分开执行，存储规模不受单次 context 限制。V40 与 PC 接收同步；分批自动检查完成，唯一只读审查 B0/I0/O0，未部署或验收真实质量。以下里程碑保留各阶段记录。

日期：2026-10-18（Asia/Hong_Kong）

状态：M5 工程闭环；M6 尚未验收。两次真实 Overview trace 均完整但生成失败，详见计划与当前状态。M1–M3.4 的阶段事实与验证边界保留在各自计划/Status。M3.4 正式发布、显式 raw input binding、verified preview 与 section reads 的源码、相关自动验证及唯一审查完成，未部署；full run04 失败批次保留，受影响组定向复验闭合，不称 full suite 全绿。Overview 追踪工具已完成实现、全量/定向验证与审查，提供 M6 人工实测的本地采集能力；真实资料、Provider、GUI 和内容质量验收仍待完成。PC UI 与 M4–M6 仍未整体完成。以[当前状态](../../current/Status.md)、[M3.3 计划](../../plans/overview/2026-10-19-overview-m33-background-jobs.md)、[M3.4 计划](../../plans/overview/2026-10-22-overview-m34-publication.md)和[追踪计划](../../plans/overview/2026-10-23-overview-test-tracing.md)为准。

权威范围：文件总览与多资料学科总览的内容组织、生成、恢复、来源、增量复用和用户交付目标。执行状态以[实施计划](../../plans/overview/2026-10-18-overview-adaptive-generation.md)及 `current/` 为准。

## 1. 目标与完成边界

有效资料增加时，生成单元与详细正文容量随之增长，不要求不同体量的资料最终收敛到相同正文长度。每次 Provider 请求与整个作业均须有限；达到容量边界时报告原因并保留兼容恢复材料，不能静默截断输入或删除正文换取成功。

完整目标包括：可信原文清单、轻量索引、全局大纲与路由、前置容量规划、按小节聚拢原文生成、程序组装、分层质量检查、结构化恢复、后台任务、分段预览、可信原文定位、稳定节点、增量更新、统一计量和真实验收。

现有 SUMMARY 是简短摘要产品契约。详细内容主要承载于 ALL/OUTLINE 的章节与小节；不将 SUMMARY 的有限概要误写为详细原文的无损替代。生成完整度需要可信质量样本验收，合法 JSON、引用 ID 或锚点齐全不证明语义完整。

沿用用户现有模型配置；学习 Agent 通过稳定节点与版本消费本设计产物，不在本计划实现教学业务。

## 2. 主链路与组件职责

2026-10-26现行工程调整：索引与Writer独立分批，主题来源分别标记BODY/NAVIGATION/BACKGROUND；导航仅作路由结构与导读参考，不将原始导航文本插入阅读区，背景默认排除出生成总览，原资料保留。没有BODY小节的空章移除，没有BODY写作组时明确失败且不进入EDIT。正文完成后一次ADAPTIVE_EDIT读取实际标题/小标题与首尾块的轻量视图及导航结构参考，只输出标题/首尾边界补丁、受控字面术语映射和ALL导读；程序在完整不可变快照上校验并应用。中间核心教学正文不作为模型输入或被模型重吐，原Writer记录保留。OUTLINE导读为null，SUMMARY原语义保持。该流程的实现、分批验证和真实质量边界以[边界编辑实施计划](../../plans/overview/2026-10-25-overview-boundary-edit-quality.md)为准。

| 组件 | 输入 | 职责与输出 |
| --- | --- | --- |
| 原文清单 | 已选 Source、owner、READY、修订和解析结果 | 有序有效文本单元、应用分配身份、来源绑定、可信位置及解析缺口 |
| 轻量索引 | 有界原文单元与已有结构 | 主题、概念、短描述及逐主题来源用途；索引不替代原文 |
| 目录路由 | 索引及已选资料范围 | 正文主归属、导航关联、背景处理去向与容量；保留条件和版本差异 |
| 小节写作 | 路由原文、术语约定、节点目标 | 一份可独立解析、校验和恢复的详细内容单元 |
| 校验与恢复 | 计划、输入和生成单元 | 结构与引用检查、缺口信号、有限修复/拆分，独立记录用途和成本 |
| 边界编辑 | 实际标题/小标题、去重首尾块、边界身份及hash、导航结构参考 | 一次输出受控补丁和ALL导读；对完整本地快照校验应用，核心正文保持 |
| 装配与发布 | 已验证单元、编辑结果及计划版本 | 统一显示编号、来源绑定与格式，按版本围栏形成完整候选 |

目录按完整路由请求的实际容量决定是否使用已有分桶，不进行 Metadata 多层模型归并。详细正文不在最后一步完整重写；底层原文绑定和已完成正文保留。

同主题原文聚拢后写作，减少重复背景与术语漂移。多主题片段可细分或按明确目的引用；条件、例外、不同观点与冲突不是应直接删除的重复。跨章概念主要归属在计划中明确。

## 3. 输入、身份和容量

1. 输入限定为当前用户、当前学科及显式选定的活动 READY Source。调用前后与发布前复核修订及删除屏障，不能混合新旧版本。
2. 片段身份由应用分配，文本顺序与来源绑定参与输入指纹。模型不能指定授权范围或伪造源位置。
3. 大片段按段落/安全文本边界切分，保留内容和顺序；不能切开 Unicode surrogate pair。切分只是调度，不是语义删减。
4. 容量计算包含完整系统指令、schema、正文、引用和输出预留；按精确官方 profile 或服务器完整身份配置的模型 context/output 判断，未知能力在派发前明确要求配置。输出预留按请求字节与结构开销线性估算，不是 tokenizer 精确计数，不按余额压缩正文。
5. 单个路由超出写作容量时，在动笔前细分生成单元；总节点、结果体积、调用次数与时限另设有限边界。资料更多时增加单元，不以固定全局字数反复压缩正文。
6. 解析失败、图片/公式未识别或没有可靠位置必须显式标记。源级来源可作为定位降级，不能编造页码或声称这些缺口已被完整处理。

## 4. 检查与恢复协议

2026-10-26取舍：总览以减少遗漏、帮助返回原文为目标，不承诺原文无损替代。INDEX允许当前授权单元的非空合法子集，不为逐单元点名完整而额外调用模型；删除专用INDEX_COVERAGE分支。未选中的原文保留，不推断其语义必为BACKGROUND；已选主题仍须完成目录路由。主响应和既有JSON修复都必须经过严格索引结构（含summary=null）、逐小节用途配对及授权校验，不能由通用投影解析绕过。Writer的内部来源范围不发给模型，直接由批次对象参与既有checkpoint身份、manifest保存和恢复比对；没有新增存储/兼容层。EDIT与其快照、Advisory、预算和路由架构本轮未改。

每次生成执行结构、节点、引用授权、路由覆盖和容量检查。原文清单能够检查单元是否分配/处理；锚点、数字与公式匹配只提供可检查信号，不等同于事实支持或遗漏证明。

语义质量通过可信样本、离线评估和必要的有界异常复核验证。线上语义复核需要显式用途、预算和失败路径，不能作为免费调用。

恢复分开处理 JSON 结构错误、容量不足、明确截断、材料变化和内容缺口。次数、拆分深度、最小粒度、总时间与预算有界，不使用无限递归。成功单元保留，失败只影响对应单元及其依赖。

结构化续写以独立完整单元为恢复边界，应用保存已完成单元和剩余子目标。损坏 JSON 不能按最后一个句号截取后发布；缺少完整单元的截断结果只作为失败材料，不能冒充已验证正文。模型完成声明需应用核对，不能自行宣布输入全部覆盖。

2026-10-24 窄修复补充：`ADAPTIVE_INDEX` 可在首次正常 JSON 读取失败后，确定性合并一个已闭合且无 `summary` 的首个 object 与严格后缀 `,"summary":<合法 JSON 值>}`。该能力由独立参数显式开启且默认关闭，只用于该 purpose 的主响应和 JSON repair 响应，不从 alias 延后校验或 Provider recovery 开关推断。首根和后缀使用局部严格重复字段检测，后缀 wrapper 消费到 EOF；任何额外字段、值、根或括号均拒绝。合并只是恢复原有四字段文档边界，随后仍执行全部 schema、summary shape、alias、coverage、mode 和内部 shape 校验，合法冗余 summary 才规范化为 null；不新增 Provider 调用，primary checkpoint 与原始/已验证 trace 语义不变。

该 purpose 的模型 JSON repair 使用自适应公共安全规则与独立索引修复契约，不继承Legacy公共ALL summary要求或主索引materials任务；repair输入仍明确为不可信数据，禁止新增事实，以allowedUnitAliases限定授权，locator=null，并要求summary=null与现有结构限制。修复不附带原始materials，不把语法修复扩成原文重建。历史失败trace只作诊断，不能提升为合法checkpoint。当前算法标识为overview-adaptive-v10-dynamic-capacity-writer-body，不混用旧中间计划，不清理已有成功或正式结果。

## 5. 后台任务、预览与发布的完整目标

M3.2 已交付同步 adaptive writer 的私有持久 plan/node/call 状态、精确 reservation lineage 和校验后原子 checkpoint。它不是完整后台作业：没有 worker loop、公开 job/progress/control API、暂停恢复 UI、预览或发布路径。相关验证与唯一审查完成，但 full suite 未在定向修复后重跑；未部署、未完成真实 Provider/GUI/内容验收。未知派发仍 hold；M3.3 已交付 worker、接管控制和安全对账边界；M3.4 已交付正式发布与分节预览源码及相关验证/审查。PC UI 留待后续阶段。证据见[执行 journal 计划](../../plans/overview/2026-10-19-overview-m3-execution-journal.md)及[M3.4 计划](../../plans/overview/2026-10-22-overview-m34-publication.md)。

后台作业具有持久身份、输入/计划版本、阶段、节点状态、预算关联、租约与围栏。支持启动、状态读取、重连、暂停/继续、取消和有限重试。

阶段覆盖等待、索引、规划、生成、检查、装配、发布和完成，以及暂停、失败、取消、被替代。发布中的意图需持久化。节点区分未开始、执行中、已验证、失败和过期。

页面断线中断观察，服务端任务按其状态继续；明确取消后不启动后续调用，已发出请求可能产生用量。重启接管必须核对在途调用、账本和租约，不因重启清空消耗，也不盲目重发未知状态调用。

预览仅显示独立校验通过的候选单元，附计划版本和未完成标记。预览、完整候选和正式结果具有不同状态。长结果支持按小节读取和按需渲染。

完整候选发布时检查 owner、scope、资料修订/manifest、计划与基础结果版本。失败保留旧正式结果，重复提交不重复创建版本，迟到响应不得覆盖较新成果。用户手工编辑与生成候选出现冲突时保留双方，不静默覆盖。

## 6. 节点、位置与增量复用

章节/小节采用应用分配的持久身份和内容版本；纯重排或标题编辑保持身份，内容改变推进版本。重新规划只有明确继承与依赖关系时延续身份，不能按标题相同继承学习进度。

原文位置来自解析链路的可信映射，按资料格式提供页、幻灯片、块或文本范围。PC viewer 能定位时导航并高亮，否则明确资料级粒度。此能力需要新增 provenance 契约，不能把当前生成时强制为 null 的 locator 当成已实现。

索引、目录计划和正文单元分别缓存并记录依赖。跨任务复用身份包含 owner/授权范围、Source 与修订、有序有效输入、生成指令、Provider/模型配置、算法/schema 版本及相关全局约定。现有 generation 私有 checkpoint 不是跨任务缓存的同义词。

新增、修改或删除资料后更新相关索引和路由，复用仍兼容的节点。全局术语或目录职责变化可扩大失效范围。缓存受容量、过期、权限撤销及删除生命周期管理；硬删除与账号删除清理关联摘录和缓存。

## 7. 统一计量与运行保护

全部模型调用沿现有 Gateway/Guard/账本，所有小节共用父 task、实际凭据来源与截止时间。索引、规划、写作、修复、续写和复核均计量。

平台提供模型执行统一额度与任务预算；用户自提供模型以计量为主，不占平台财务配额，但保留授权、服务容量、上下文、传输和有限执行保护。不能通过另起小节 task 或修改凭据标签获得额外预算。

任务开始粗估，形成目录后细估，修复或拆分前重查剩余额度。完整路线将结合实际负载形成动态任务契约；未获验证的估算不改变准入算法或擅自放宽数值。

记录分阶段实际/估算/未知用量、缓存复用、重试已消耗、阶段时间和容量拆分。日志只记录安全关联字段、计数、长度与指纹，不记录正文、完整 prompt、凭据、endpoint 或原始 Provider 错误。

## 8. M1 本轮接入决策

- 在既有同步 Source/Subject 入口接入可运行的内部新链路；保持公开 `OverviewResponse`、schemaVersion=1、sourceIds 和当前 mode 契约。
- 配置 `auralis.ai.overview-adaptive-generation-enabled`，环境变量 `AURALIS_AI_OVERVIEW_ADAPTIVE_GENERATION_ENABLED`，初始默认 false。启用时 ALL/OUTLINE 进入新链路；SUMMARY 继续现有短摘要语义。真实模型与 GUI 质量验收后另行决定默认启用。
- Source 使用活动原文，Subject 使用已选当前 Source 的原文；客户端提交的旧 summary 不作为全文。缺少可用原文时明确失败，不静默回退旧压缩路径。
- 索引/路由/写作使用独立内部 purpose 与算法指纹；Provider 调用沿现有 `OVERVIEW_MAP/OVERVIEW_REDUCE` 和合法输出角色。本轮不扩中央配额或 stage 枚举。
- 复用现有完整 JSON 校验、一次 JSON repair、安全诊断和 generation checkpoint；旧算法 checkpoint 与新算法严格隔离。
- 组装由 OverviewLimits 正数配置约束章节、正文、导读、来源、provenance 与 payload 等容量，0 不增设固定帽；最终形状、非空、来源和身份仍校验。不能静默 slice、截正文或吞字段，PC 不重复固定 volume 帽。
- 计划确定后，在正文派发前校验已知正常路径的调用下限与平台剩余预算；BYOK 不套平台财务调用/token 上限。计划估算不等同于精确账单或语义保证。
- 本轮没有新增 public job/progress/partial/locator API、数据库迁移、稳定公开节点或跨任务永久缓存。它们是本设计的后续交付，不是从完整目标中删去。
- adaptive inventory 分页读取完整活动原文，分页大小是读取粒度，不是总体 500 条上限；原文单元和 topic 数不套最终小节数量帽。完整路由请求放得下时一次处理，放不下才已有分桶；不截断接受的原文，不声称任意规模或语义无损。

### M5 缓存容量与生命周期补充（2026-10-23）

Reusable capacity applies only to standalone, unpinned SUCCESS result/checkpoint payloads: defaults are 256 MiB and 1000 generations, serialized by the V38 database guard, with at most 100 eviction candidates per attempt. Durable jobs own their private payload lifetime and remain outside the shared reusable cache pool. Capacity pressure may discard cache materialization while preserving the successful response and usage/journal lineage. Resource revocation fences jobs/generations/intents and scrubs private raw-derived copies; receipt identity/hash remain as revoked idempotency tombstones. Completed-job copies use bounded 14-day cleanup, while formal saved results follow explicit resource/account lifecycle. This bounds the targeted reusable cache, not total database storage. M5 automatic validation and the non-deployment/Provider/GUI acceptance boundaries are recorded in the M5 implementation plan.
## 9. 实施与验收

M3 前置交付：增加有限层级的轻量索引 metadata 规划，使扩大后的索引可分层组织。每个目录项必须保留到底层原文单元、Source/revision 与顺序的绑定；分层仅组织 metadata，不合并或改写原文和已验证正文。层级、节点数、单次请求和总工作量均设上限，超限明确失败。M3 验收检查多层路由完整覆盖、原文来源绑定与已完成正文保留，以及容量拒绝路径。

M3.1 已按此边界实现并完成相关验证与唯一审查，未部署且不构成业务验收。验证口径为初始两类 47 tests / 46 passed / 1 failed，唯一失败方法随后 attempt 4 单独 1/1 通过；没有第二次完整 47-test 全绿运行。review 为 BLOCKER=0 / IMPORTANT=0 / OPTIONAL=0。用户决定未正式部署版本无需保留兼容分支；算法版本仅作为缓存正确性围栏。最终路线还需统一清理未使用的版本兼容代码，详见实施计划与当前问题登记。

## M3.3 持久后台作业、控制与安全接管

当前工作树候选新增 owner-scoped job 与 generation invocation journal，覆盖后台 Source/Subject ALL、OUTLINE 的入队、跨实例 claim/fence/lease、进度、pause/resume/cancel/reconcile 及完整 private candidate。首次 claim 固定当前 Overview 绝对 deadline；恢复沿原 generation 与父 budget task，检查完整 profile/source identity 与所有精确 reservation。dispatch 前 callback 在 usage Guard 的 user/usage locks 和 owner check 后、写入 dispatched 前做当前事务 DB 身份、lease、fence 与控制校验；reservation 未派发的检查失败沿既有安全结算释放。未知派发或 lineage 缺失/错配继续 hold，不依赖 task aggregate。

M3.3 private candidate 不写正式 OverviewResult/KB/Review，不提供分节预览或 PC UI。真实 Provider 远端调用不能由 cancel 确认撤回。raw generation/job budget UUID 保持不变；invocation ledger UUID 使用 Guard 的稳定映射，unknown dispatched usage 或 lineage 缺失仍 hold。源码、相关自动验证与唯一审查已完成，完整门禁边界见 [M3.3 计划](../../plans/overview/2026-10-19-overview-m33-background-jobs.md)；full suite 未在修复后重跑。未部署、未验收真实 Provider、业务数据库、GUI 或内容质量。



依次交付核心链路、稳定节点与位置、后台任务与发布、PC 用户交付、增量复用，以及真实 usage/性能与业务验收。权限、计量、删除屏障和有限执行从首轮接入，贯穿所有阶段。

自动验证采用合成 Provider，覆盖真实服务接线、跨来源原文聚拢、无最终正文全量重写、路由/引用错误、容量与 Unicode、预算/取消和兼容恢复。样本质量另覆盖多资料重复与冲突、定义/条件/例外、数字/公式、信息密度差异和解析缺口。

源码、自动检查、部署、真实 Provider 与 GUI/内容质量分别报告。完整功能完成需要以上工程交付和真实验收均闭环；M1 通过不代表完整路线完成。
