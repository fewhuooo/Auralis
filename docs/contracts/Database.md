# Auralis 数据库与端侧数据契约

### V46 邮箱验证与密码重置

`users.email` 保存已验证、归一化的唯一邮箱。新注册必须验证邮箱。迁移保持原用户 ID 和现有数据。密码重置递增 `credential_generation` 并撤销该用户的刷新会话，发出早于重置的访问令牌会在认证时被拒绝。

`auth_email_codes` 以用途和邮箱摘要分隔验证记录，保存验证码摘要、期限、尝试次数和发送窗口。注册与重置的代码不互通，核对和账号变更处于同一事务。验证码明文只用于待发邮件。

### 2026-11-12 Overview 退役代码清理（无数据迁移）

本轮删除旧预览、Writer 计划写入与候选发布专属代码，不删除历史表、列、记录或文件，不改历史迁移。PC 当前缓存查询不再读取旧 JSON 列；旧内容拒读与正式结果真实版本 CAS 继续保留。旧执行记录仍受现行保留期清理与资源生命周期规则管理；代码清理不等于清库。

### 2026-11-12 Overview Markdown 内容存储

沿用 overview_results 的原有文本存储列、schema_version、各分项版本和输入描述。新内容契约为 schemaVersion=2，存储 Markdown 字符串；不创建章/节身份，不将全输入伪装逐节 provenance。保留 CAS、write receipt、来源修订和输入指纹复核。

旧 v1 行和用户文件保留，不自动转换、不作为 v2 内容读取；替换仍使用旧行真实版本和完整 ALL 写入。既有旧私有 checkpoint 不进入新生成链。本轮后端没有新增 DDL 或迁移，不删除业务数据。PostgreSQL 专项验证尚未运行。

PC SQLite schema 14 增加 `outline_markdown/summary_markdown`，调整缓存表版本约束以接收 v2 并保留旧行及原 JSON 列，不把旧 JSON 自动转成 Markdown。账号、设备、scope 和 revision 仍共同限定本地缓存和待写记录；v1 内容不投递新协议。Browser 缓存同样只消费 v2 内容。


### 2026-11-11 知识块保留来源与未核对复习（无迁移）

删除 Source 不删除关联 KnowledgeBlock，已有 `source_id` 保留。仅更新知识块标题、正文或颜色且学科/来源均未变时，不因原来源软删除拒绝写入；新建或变更关联仍校验有效来源。沿用现有 owner、版本、锁序与变更日志，没有新增字段或数据迁移。

复习初选与核对状态继续由既有生命周期记录持久化。临时轮次结束或进程重开不等于核对完成；有效未核对初选可以重新进入核对阶段，不重新提交初选。计划入口把这些记录与普通到期卡片去重合并，已有排程和确认/纠正计算保持。

### 2026-11-11 资料处理状态一致性（无 schema 迁移）

PC 草稿解析的自动重试使用仓储允许的状态转换；网络暂停记录持久保留，只有用户明确继续才重新排队。已存在 payload receipt 的任务继续上传，不重复解析。Source 与本地处理任务的完成状态分别保留：本地 READY 表示上传阶段完成，服务端 Source 的 INDEXING/FAILED 仍须展示。

FILE 恢复时按当前 owner/revision 的 ACCEPTED ParsedDocument 确保索引任务存在；无可用解析结果则轮换 revision 返回 AWAITING_CLIENT。complete 在接受前拒绝 intent 与当前 Asset SHA 不一致的记录。没有新增表、字段或迁移，历史记录与用户文件保留；旧 ACCEPTED 数据不做批量修正。

复查补充：恢复时已领取的 PARSING/INDEXING 任务撤销 lease 后回到 PENDING，保留 job ID、revision、generation、accepted document、失败计数和已有 READY chunks。旧 claim 的 INDEXING/checkpoint/终态写入均受同一 ownership 校验，重新领取由现有 attempt 递增区分。预期的原 Asset 读取领域错误不把 complete 所在事务标成 rollback-only，REJECTED 记录可以提交；未知异常仍回滚。无新增字段或数据迁移。

### 2026-11-11 Overview 详细生成身份与跨窗状态

直接 Source 详细生成与私有后台任务的算法标识为 `overview-dynamic-window-v9`。直接详细输入指纹包含来源修订、有序 chunk 身份、generation、文本及 provenance，独立 SUMMARY 沿用自身身份。INDEX 已闭合段、打开段和提要前沿在本次执行内累积。旧私有载荷按现有期限保留，新生成只使用 v9 身份，旧详细任务在当前快照版本校验处终止。现有任务、账本和已发布快照保留，公开来源描述符按内容指纹和来源修订校验。此变更无需数据库迁移。[分批实施文档](../plans/2026-11-10-overview-dynamic-window-implementation.md)

### 2026-10-31 PC 排期命令本地串行队列（无 schema 迁移）

排期 outbox 沿用现有 JSON payload，新增私有 `_localExpectedTasks` 保存本命令预期成员投影、`_localScheduleSent` 持久化首次领取标记，继续以 `_localAffectedTaskIds` 建立成员围栏；这些元数据均不进入 Sync wire payload。提交时的排期基线 fingerprint 仅作为本次仓储事务的瞬时前置条件，不持久化为新字段。命令顺序以持久化 createdAt/ID 确定，同毫秒追加保持实际提交先后。

每轮仅派发最早未结算排期；inflight 队首可按原 ID/载荷重试。成功回执在同一写边界保留后继乐观位置并更新权威版本，只调整从未发送后继的版本字段。拒绝、预测偏差或需保护墓碑/普通本地写入时，完整恢复数据就绪后再结算队首和终止未发送后继；受保护记录不被覆盖。浏览器和 SQLite 均原子校验排期计算基线，防止同版本的跨窗口本地修改被陈旧计算覆盖。现有用户数据保留，无旧格式转换、表列新增或业务数据迁移；未结算命令继续走现行 Sync 路径。

取消排期收到匹配任务的 `REJECTED / RESOURCE_NOT_FOUND` 空回执时，恢复集合由快照提供，其中含该任务的软删除记录。完整集合就绪后结算队首、撤回后继排期并推进快照游标。

2026-11-14 补充：周列跨天排期复用 `SCHEDULE_INSERTION` 的 JSON payload，使用 `placementMode: "STRICT"` 表示只放置源任务。后继排期未派发时，成功回执保留其本地排期投影，并以服务端回执更新版本和非排期字段。后继取消排期的 `TASK/UPDATE` 载荷同时采用这些最新字段。已派发命令仍以原 ID 和载荷重试。队列、Task 表和同步历史无需迁移。

换位提交时如果带版本的基线变化，仓储在同一写入事务内复核排期计算所用字段。字段一致时保留最新 Task 资料，只应用两个新排期，并用当前版本生成尚未入队的命令。排期计算字段实际变化时拒绝旧计算。

### 2026-10-28 Writer 多小节私有执行载荷（无数据库迁移）

多节操作write_adjacent_sections_v1的执行descriptor绑定有序members及其目录位置、主题、原文范围和prompt身份；singleton不序列化空members。每个合批对应一个现有execution node，模型回传request-local sectionIndex/detailedContent；程序按成员自己的授权原文范围绑定各节，全部校验成功后通过现有journal原子保存完整batch checkpoint，再拆回公开outline。合批恢复保持成员组合，已验证singleton保持独立，parts沿现行单节路径；不新增表列、旁路映射或公开响应字段。费用、未知派发与lease/fence规则保持。定向及同一只读审查B0/I0；未部署、未操作业务库或验证真实模型。证据D:/Temp/auralis-coalesced-writer-20261028/。

### V41 Overview 重试父关联与请求意图（源码候选，未应用业务库）

`overview_generations.retry_of_generation_id UUID NULL`自引用原代，外键`ON DELETE SET NULL`，CHECK禁止引用自身；可空列唯一索引`uq_overview_generations_retry_successor`使用默认NULL DISTINCT语义，允许普通NULL父代并存、保证非NULL父代只有一个直接后继。`overview_generation_requests.retry_of_request_id UUID NULL`保存客户端重试意图供request幂等校验，无外键，也不进入内容指纹。现有表内扩展，无新任务表；新代独立budgetTaskId，父代失去执行权时fence递增，旧记录、检查点及usage ledger保留。

可从指定retry祖先读取已验证INDEX/ROUTE/Writer检查点，不要求祖先整轮SUCCESS；仍校验owner/scope、来源revision、输入、prompt/profile/algorithm/schema、payload及Writer验证证明。PC最近派发ID只在内存维护，本地schema仍v13；不改Core Sync/change log/正式结果结构。H2/隔离PG迁移、重试并发/祖先复用定向通过；full中的隔离认证及旧latest=40断言失败已affected闭合，未重跑full。任务PG容器已移除，业务数据库未迁移。详见[实施计划](../plans/2026-10-27-overview-explicit-retry.md)。

### 2026-10-27 私有索引章起点元信息（无migration，未部署）

私有INDEX checkpoint v3在既有sectionRoles旁保留可选sourceChapterStart（unitAlias/title），随既有payload完整性与来源校验恢复；primary、JSON修复结果和checkpoint读取使用同一元信息语义。主题输出顺序从私有索引顺序重建，同一unit中只对章声明及之后的主题生效。算法 `overview-adaptive-v11-source-chapter-order` 隔离旧中间计划/索引，不回填或兼容旧checkpoint。

无新表/列或业务库迁移；正式结果、原资料、费用、既有成功记录和当前V40保持。本轮Recovery30/30首轮在隔离Testcontainers通过，新章元信息及复用的集成验证见D:/Temp/auralis-overview-chapter-order-20261026/implementation-validation-report.md；未操作运行态数据库或清缓存。

### 2026-10-26 V40已应用本机数据库

用户追加部署授权后，本机PostgreSQL由V39迁移至V40成功。此前已做完整pg_dump及定向缓存备份。按用户范围选择清理6条FAILED私有生成及子缓存；原SUCCESS22、正式结果22、receipts25、费用reservations675和Sources22（20 active）全部保持，12组计数/hash与部署前一致。原unknown-dispatch SUCCESS及其费用保持，不进行对账重分类或退款。

执行与备份证据见D:/Temp/auralis-overview-deploy-20261026/。本次改变的是V40存储约束及明确授权的失败缓存，不修改正式内容或来源数据；下面“未应用业务库”条目为迁移验证阶段历史。

### V40 Overview 可配置容量（隔离验证完成，未应用业务库）

`V40__configurable_overview_payload_caps.sql` 放宽 generation result/checkpoint、execution plan/node descriptor、job request/manifest/candidate 和正式结果 input snapshot 的旧 SQL 最大长度约束，保留 JSON 最小非空长度及原有身份、状态、来源和事务约束。`overview_results.title` 由 VARCHAR(300) 扩为 TEXT；应用层按 `OverviewLimits` 正数配置限幅，0 不增设固定帽。迁移不删除旧结果或用量数据。

当前算法 `overview-adaptive-v10-dynamic-capacity-writer-body` 隔离不同中间契约。Writer 不再保存模型回声作为覆盖证明，仍由授权输入绑定范围、manifest/hash/proof；现有正式来源和 provenance 结构保持。九个 direct PG 类在任务专用 PostgreSQL 17/V40 下 43/43 通过；H2 检查实际迁移后的标题列可容纳超过 300 字符。未对业务库执行 migration，未清理 SUCCESS、正式记录或账本。见[本轮计划](../plans/2026-10-26-overview-dynamic-capacity-and-simplification.md)。

### 2026-10-26 EDIT轻量模型视图与完整程序快照（无migration）

EDIT的完整Snapshot保留在本轮Java内存，包含完整正文并用于baseDocumentHash、segment身份和apply校验；仅promptView被序列化给模型。模型视图保留完整快照绑定的hash、真实标题/小标题与首尾块，省去中间正文及其中间逐块metadata；单段首尾不重复。checkpoint仍保存通过验证的patch JSON，恢复仍针对完整Snapshot校验和应用，未新增快照表、存储映射或兼容层。

新算法overview-adaptive-v10-body-reading-boundary-view隔离旧中间计划。NAV阅读小节和空章移除后，公开provenance路径依最终BODY章节顺序重排；相关来源仍按原有source/revision绑定。原资料、成功结果、正式记录与账本不清理。本轮隔离Recovery30/30通过；未执行migration、业务库操作或部署。

### 2026-10-26 Writer 来源范围留在程序侧（无migration，本轮未部署）

Writer提示词移除writerInputRanges后，现有批次原文对象仍向保存/加载传递完整Source/revision/chunk/generation/hash/字符范围；这些范围参与checkpoint step身份，恢复时与原有manifest精确比对。文本相同不替代来源位置身份，不新建表、旁路映射或旧格式兼容层。新算法标识 `overview-adaptive-v10-selected-index-local-writer-ranges` 隔离不匹配的旧generation/plan；原SUCCESS、用量账本和正式结果不清理。

索引checkpoint可保存合法的已选单元子集；它不再声明逐原文单元覆盖。既有manifest/proof结构和公开provenance保持。本轮在隔离PostgreSQL验证相关Recovery方法，没有读写业务数据库；未执行migration、部署或真实模型调用。分批结果见 `D:/Temp/auralis-overview-contract-trim-20261026/gate/final-evidence-summary.md` 及 `review-summary-null-delta.md`。

### 2026-10-26 Overview 用途索引与边界补丁checkpoint（复用现有表，无migration）

自适应v10在现有私有checkpoint保存索引响应及逐索引小节的来源用途绑定；同一原文单元可以在不同主题中拥有不同用途，不以全局unit标签替代。metadata组织保留原topic、unit及来源绑定，背景排除记录与教学完成状态分开。

最终ADAPTIVE_EDIT的checkpoint绑定完整分段快照、用途投影、编辑schema与模型/指令身份；恢复时重新验证补丁ID、hash、结构和作用域，再应用到原快照副本。Writer已验证正文、proof和checkpoint保持原样，补丁不会写回原Writer记录。算法/请求指纹隔离不匹配的旧中间契约，不增加旧格式回退；原SUCCESS、用量账本和正式结果生命周期保持。

本轮没有数据库schema或端侧存储结构变更，没有执行migration或业务库写入。Docker引擎不可用，PG/MinIO集成验证受限；不能以非Docker单测代替持久事务/恢复验收。见[实施计划](../plans/2026-10-25-overview-boundary-edit-quality.md)。

### V39 无界 Overview job deadline（源码与自动迁移验证完成；未部署）

V39 仅重建 `ck_overview_jobs_lease`：RUNNING 仍要求 `worker_owner_id` 和 `lease_until` 非空，但允许 `deadline_at=null` 表示无整任务期限。配置为 0 后的新 claim 保持 null，已有正数期限不回填、不延长；所有权、lease/fence、进度、dispatch 与完成校验继续生效，超时扫描忽略 null。无公开字段或端侧同步结构变化，未对业务数据库执行迁移。

### 2026-10-24 Overview writer recovery checkpoints（复用现有结构，无 migration）

Overview v9 writer 在现有 `overview_generation_checkpoints` 保存带独立 kind/version 的不可变 PLAN、RESULT 与 payload 记录；PLAN 绑定 parent prompt、确定性 child path 与原文 ranges/hash，RESULT 绑定 parent payload hash、每个 fragment 的 body hash、topic 声明及精确 source ranges。所有记录仍受 generation/input/profile/algorithm fingerprint 与现有 payload 限制。无 schema 或 migration 变化；未知 discriminator 不兼容复用。

更新时间：2026-10-24
文档状态：阶段 1 Identity V1、阶段 2A Subject/KnowledgeBlock/Task V2、阶段 2B Source/Asset/Relation V3、阶段 3 Sync V4/V6 与阶段 4 Review/Stats/Realtime V5、Task V7、阶段 5 AI/RAG V8–V14 已实现；R1 AI 并发保留与离线会话恢复键已通过测试，默认容器门禁已完成，真实 Provider 和前端验收仍未完成
权威范围：新 Server PostgreSQL/pgvector 表、Entity 映射、同步字段、端侧离线副本和 Tablet 专有数据边界。
事实来源：docs/plans/backend-greenfield-rewrite-plan.md、docs/contracts/ObjectModelMatrix.md、替换前旧 Server 的 DDL/Entity/Mapper 与 PC/Mobile localDb。

### 2026-10-23 M5.4 正文 checkpoint 复用（无 schema/API/migration 变化；源码与唯一审查完成）

- 复用沿用现有 checkpoint、V35 execution journal 与 execution plan/node：donor 须为 SUCCESS generation，其 ASSEMBLED plan 下 VERIFIED node 的 hash 与 checkpoint 一致，并由 node 当前 attempt 的 execution-call 关联到 `request_dispatched=true` 的真实 reservation。无 reservation 的 cache-materialized node 不得接力成为 donor。物化本代恢复 checkpoint不更新 donor checkpoint/TTL。
- 源码差异未新增 schema、API 或 migration。未运行 PostgreSQL 或生产业务数据库验证；不据此声明数据库运行态验收。唯一 reviewer 结论 B0/I0/O0。
- 证据：`D:/Temp/auralis-overview-m54-20261023/source-delta.patch`、`source-final-manifest.json`、`final-handoff.md`、`review.md`。

### 2026-10-23 M5.3 目录规划 checkpoint 复用（无数据库结构变化；唯一审查完成）

M5.3 沿用现有 `overview_generation_checkpoints`，支持 `ADAPTIVE_ROUTE`、`ADAPTIVE_METADATA` 和 `ADAPTIVE_METADATA_ROUTE` 规划 purpose 的跨 generation donor 读取；以同 owner/scope/profile/algorithm、完整 input、prompt-derived step、SUCCESS、checkpoint 14 天和 result 到期及 payload SHA/schema 限制命中。当前 generation checkpoint 优先；donor 只读、不复制、不延寿。此次源码范围没有 API、数据库 schema、migration 或端侧同步字段变化；本轮没有 PostgreSQL 或业务数据库验收证据。gpt-6-luna high 的首轮定向批次为50 pass/1 error；受影响方法后续1/1通过，未重跑整批。唯一 reviewer B0/I0/O1；O1为文档同步项，已由本次回写处理，文档回写后未复审。

### 2026-10-23 M5.2 索引 batch checkpoint 复用（无 schema 变化；源码与相关验证/审查完成）

M5.2 沿用现有 `overview_generation_checkpoints`，以 `index_batch_v1_SHA` 识别由 system prompt、`indexData` 与有序完整 `AdaptiveRawUnit` 记录决定的索引 batch；无新表、字段或 migration。跨任务读取受 owner/scope/profile/algorithm、SUCCESS donor、donor checkpoint 与其 generation input fingerprint 一致、payload SHA/schema、14 天 checkpoint 与 result 到期围栏约束。命中只读且不延寿；只有真实 Provider 新生成并通过 coverage/shape 后才写当前 generation checkpoint。gpt-6-luna high 实现与定向验证49/49；唯一只读 reviewer（gpt-6-luna high）B0/I0/O0。该批次不构成 PostgreSQL 或业务数据库验收。


### 2026-10-22 M5.1：完全相同输入的跨任务轻量索引复用

- 新生成任务先读取自身 checkpoint；缺失时，仅 ADAPTIVE_INDEX 可查询同 owner、scope、完整 input fingerprint、profile、算法和 prompt step 的 SUCCESS generation。读取同时检查 result 到期和 checkpoint 14 天有效期，以及 payload SHA/schema；使用前继续执行现行 Source/owner 校验和索引 coverage/shape 校验。
- 复用现有 overview_generation_checkpoints，只读命中，不复制缓存、不延长原条目寿命、不新增表或迁移。目录和正文仍执行当前生成流程；命中不派发 Provider、不伪造 usage，记录 ADAPTIVE_INDEX_CACHE_RETURN。预算预检识别可复用索引。
- 本小节只覆盖完整输入未变化时的新任务复用；资料局部变化、节点级依赖失效、目录/正文跨任务缓存及完整删除生命周期仍属于后续 M5，不能据此标记 M5 完成。现有前端流程保持。
- 验证：D 盘隔离源码运行 OverviewGenerationCoordinatorTests 21/21、OverviewAdaptiveGenerationTests 26/26，共 47/47，Maven exit 0。覆盖跨 owner/输入/profile 隔离、过期、损坏拒绝及生成链路跳过索引而继续目录/正文。当前为 H2/合成 Gateway 证据，未运行 PostgreSQL、全量测试、打包、真实 Provider、GUI 或部署。本轮依用户要求由主模型直接实现并检查，未启用子代理。
- 证据：D:/Temp/auralis-overview-m51-20261022/targeted-tests.log 与 handoff.md。更早前端回退的四项失败未由本轮处理；此前范围审计按用户最新要求暂置，尚无完整审计结论。
### Overview M4 Server 候选采纳持久化说明（2026-10-22；无新迁移）

Server formal result、write receipt 与 V37 publication intent schema 继续沿用 M3.4 契约；formal PUT 可通过 `jobId/jobVersion` 解析候选输入。PC M4 候选采纳 consumer 已撤回，当前不把候选采纳写入本地 `overview_sync_outbox`。Local SQLite 仍为 schema v13；本次无新 migration，也未执行用户业务数据库迁移。隔离浏览器读回的 formal Source/section v4 与 receipt 属于回退前历史。


### V37 Overview publication 与 per-part input snapshot（源码与隔离 PostgreSQL 门禁验证完成；未部署）

候选 V37 给 `overview_generation_jobs` 增加 enqueue 时观察的 formal logical version 与 physical result ID/version；为 `overview_results` 的 outline/summary 分别保存显式 input origin 与 bounded snapshot JSON，并按旧 scope 已知契约回填既有 non-null part；新增 `overview_publication_intents`，保存 owner/client/job/plan 唯一意图、stable write ID、expected job version、hash/profile/input/algorithm identity、baseline、状态、尝试次数/重试时间、安全错误及结果版本引用。Raw snapshot 不含正文、prompt 或 Provider 凭据，约束最多 262144 字符。

Intent PENDING 持久化与最终 formal result + exact `overview_write_receipts` + PUBLISHED 更新分为两段短事务；最终提交按 user→Subject→Source→job/generation/plan→intent→result→receipt 序列化，删除通过 user/job/generation/plan 级联清理。V37 migration 与 publication PostgreSQL integration matrix 已在任务专用隔离 schema 验证；未修改用户业务数据库、未部署。完整验证边界见 [M3.4 计划](../plans/2026-10-22-overview-m34-publication.md)。



### V36 Overview 后台 jobs 与精确调用关联（迁移源码与相关 PostgreSQL 验证完成；未部署）

V36 新增私有表 overview_generation_jobs 与 overview_generation_invocations，不属于五类 Core Sync、change log 或客户端 mutation。job 表以 (user_id,client_request_id)、(user_id,generation_request_id) 唯一；保存请求 hash/JSON、有序 source manifest、input/profile/algorithm fingerprint、generation 与 budget task 关联、status/stage/node progress/version、worker owner/fence/lease、绝对 deadline、pause/cancel intent、安全错误码和可选完整 candidate JSON。source manifest 仅保存最多 500 个 raw unit 的 UUID、hash 与位置等元数据，不含原文；source_manifest_json 长度上限为 262144 字符，不截断内容。job profile metadata fingerprint 由内部 AiSettingsService.jobProfileMetadata(UUID userId, AiProviderType provider) 产生，包含 provider、chatModel、normalizedEndpoint、credential source 与 opaque fingerprint；enqueue 用该 fingerprint 固定稳定配置身份，BYOK 对存储密文做 hash，默认配置对已加载 API key 做 hash，不持久化原密文或 key。worker claim 时调用 AiSettingsService.resolveJobSettings(UUID userId, AiProviderType provider, String expectedFingerprint)，在一次只读事务中从同一 BYOK entity 或 default 配置对象计算并校验 metadata fingerprint，再解密同一 entity 密文或构造 default credential，返回配对的 JobResolvedSettings(metadata, settings) 并将该 settings pin 给后台生成；避免独立读取 metadata 与 credential 之间配置切换导致凭据错配。此 job fingerprint 与 resolve 后才计算的现有运行时 generation profileFingerprint 分开；原同步 resolve 行为不变，credential 解析事务不跨 Provider I/O。用户外键级联删除，generation 删除时 job 的 generation_id 置 NULL；请求快照、manifest、candidate 有长度约束。claim、scope 与 generation 查询分别有 (status,created_at,id)、(user_id,scope_type,scope_id,status,updated_at) 与 generation_id 索引。

invocation 表逐次保存 job/generation/task/user、真实 reservation UUID、purpose/stage、generation owner/fence 和可空 job fence；generation/job 的 budget_task_id 保持原始预算 UUID，而 invocation task_id 保存 usage ledger UUID UUID.nameUUIDFromBytes((userId + ":" + feature + ":" + budgetTaskId).getBytes(UTF_8))，与 AiUsageGuard 的 Overview task 映射一致，不改变预算或结算身份；reservation UUID 唯一，generation/job/user 删除时关联行级联清理。每个 generation 最多 500 条关联，并有 (generation_id,created_at,id) 与 (job_id,created_at,id) 有序查询索引。恢复以精确关联查询 ai_usage_reservations 判定安全性；关联表不改写或清除 usage ledger。DDL 的全部约束、索引和字段见 V36__overview_background_jobs.sql。相关 PostgreSQL job/invocation 用例通过定向批次；首次 full 有失败项，受影响组修复后未重跑 full。migration/package 已经由 -DskipTests package 构建，但没有对运行中的业务数据库执行迁移。### V33 AI usage operation and credential source

V33 adds nullable `operation_kind VARCHAR(32)` and `credential_source VARCHAR(32)` to `ai_usage_reservations`, plus an owner/source/time index. Existing rows stay NULL and are classified at read time as `LEGACY_UNCLASSIFIED` / `LEGACY_UNKNOWN`; migration does not infer or backfill either value. New reservations persist the server operation kind and the actual per-invocation credential source. The same task may contain different sources, while non-null operation kind cannot change within one actual `task_id`. This remains a private derived ledger and stores no credential or prompt content.

Platform quota aggregation includes `PLATFORM` and historical NULL source rows conservatively. `USER_SUPPLIED` rows remain in all-origin audit and shared concurrency counts but do not consume platform window or task quota. Historical unknown occupancy naturally expires from time windows; account deletion keeps the source classification and charged exposure for system-wide accounting.


### V34 Overview identity and source-chunk provenance（PG 门禁通过；M2 API closure 完成）

V34 adds nullable `overview_results.outline_identity_json` and `source_chunks.provenance_json`. The first stores server-owned outline node IDs and content versions/hashes; the second stores parsed-document identity and original block position ranges for each generated chunk. Both are additive and existing rows remain NULL; reads do not backfill identity or rebind historical chunk references. Overview result metadata, CAS version, and write receipt continue to commit in the existing transaction. Task-owned PostgreSQL 17.11 clean V34, V33 row preservation, save/read/receipt/CAS and rollback tests passed (OverviewIdentityPostgresIntegrationTests 4/4); the migration regression class passed 6/6. These isolated tests are not production/business-database acceptance.

## 数据源边界

### V35 Overview execution plan/node journal（迁移与相关 PostgreSQL 验证完成；未部署）

These tables store no original body, provider credentials, or full prompt. They do not change overview result, public API, OpenAPI, or SDK shape. The isolated V33-to-V35 PostgreSQL migration and M3.2 recovery tests passed; the replacement package succeeded with tests skipped. The full backend suite was not rerun after focused fixes. No production/business database was migrated.

### 2026-10-09 Review 本地正式数据与待同步意图（代码与自动验证通过；真实Tauri待验收）

- 用户选择完整本地使用。PC 主树本地 schema v12 新增 `local_review_records` 与 `local_review_intents`；本地正式快照、历史、导入完整度与稳定 ID 的 FIFO outbox 分开存储。最终主树R4 664/664与类型/构建通过，SQLite原子回滚及严格解析通过真实SQLite adapter验证；实际Tauri数据库启动/断网重启仍待验收。
- 正式投影、历史和新意图原子提交；本地 revision 与服务器 version 分离。HTTP 首次派发前固化 payload，ACK仅处理同ID；较旧回执仅推进独立权威锚点，不回退已包含后续本地动作的更高版本投影，其余意图继续FIFO。冲突意图保留，显式选择云端进度后归档未采用意图再继续，不删除本机审计记录。
- 临时轮次仍仅进程内切页恢复，不持久化到 SQLite/浏览器/服务端。core Sync 白名单不扩展；Rust snapshot 只替换 local_resource_records，不删除独立 Review 表。
- 服务端沿用 V29 表/时间列/request_payload/response_payload 与 before_state；可选离线时间与存在性进入请求指纹，但两者均省略时保持旧指纹。公开 schedulingBaseline/legacy firstLearning 为已存字段的派生，无服务端新增列或迁移。详细 [计划](../plans/2026-10-09-review-stats-local-first.md)与 [API](API.md)。

| PC v12 表 | 主键与数据 |
| --- | --- |
| `local_review_records` | `(user_id,device_id,knowledge_block_id)`；Subject、local revision、服务器 KB version、content hash、可空 state 的 JSON、命令/有效结果/legacy/导入标记 JSON、presence marker、更新时间 |
| `local_review_intents` | `(user_id,device_id,client_command_id)`；KB、action、真实 occurredAt、payload JSON、`pending/inflight/applied/conflict/error/archived`、独立 FIFO 创建时间、`prepared`、`preparation_json` |

- browser fallback 用 `auralis:v2:<编码 userId>:<编码 serverDeviceId>:review-store` 单个快照键，记录与意图同次提交；SQLite 使用当前 localDb 的串行事务。结构损坏报错，不以空快照覆写旧数据。Review资源仅从当前账号现行仓储读取；`auralis_subjects`/`auralis_knowledge_blocks`等无账号隔离旧键被忽略，不转换、不删除，联网后由现行Core Sync重建资源。
- 本地记录的 `state=null` 表示本机没有正式状态；远端是否无状态还须由完整导入标记与独立锚点确认，不能用本地 null 推断。存在且 `version=0` 仍是存在状态。缺少已导入记录表示远端未知；临时 UI 未学习投影不能保存为状态实体或被用来猜测存在性。远端未知时可以按实际本地存在性完成学习，保留导入不完整提示与首次意图的 absent 前提；旧云端已有状态时保存冲突，不覆盖本机审计。
- `history_json.canonicalAnchor` 独立保存 `knowledgeBlockVersion/subjectId/contentHash/state/commands/effectiveReviews/legacyEvents/legacyHistoryComplete`；明确 null 是没有已验证云端锚点。本地乐观状态/历史不更新该锚点，权威完整导入和自身实际 ACK 才可推进。
- `preparation_json` 保存 `anchorFingerprint/anchorSubjectId/anchorContentHash/anchorCommandIds/anchorLegacyFingerprint/predecessorClientCommandIds/knownLocalCreate/allowContentInvalidation/sequence`。未固化请求可以在严格证据下绑定真实服务器 KB/state version；`prepared=true` 后载荷不可修改，结果未知只按原请求重试。
- 正文后的安全准备仅限首条无 reviewId 学习意图，必须有编辑前完整锚点及严格失效证明；存在性不重基。元信息/Core ACK 的 KB version 更新也须以正文一致及权威 state/命令历史未变的证据核对。不能把本地 revision 或 `canonicalVersion+1` 当作 JPA version。未知首学仅完整protocol2空历史确认后准备，后继只沿自身实际ACK前缀；prepared载荷不重写。锚点、SQLite raw事务严格解析、ACK0、迟到回执/账号交错均有自动回归，证据见本轮计划。
- 同学科、同正文的元信息修改使本地展示使用当前 KB 修订。未固化意图核对权威锚点与完整历史，状态只对齐独立的 KB 修订字段。旧版冻结回执仍保存服务端原修订与审计，只有其与当前完整历史符合上述规则时才结算，差异进入显式冲突。确认和纠正的 ACK 审计分别保存初选评分与 `AGAIN`。移科清除本地旧因果指针并使未确认选择失效，保存原审计和待显式解决的旧意图。

### 2026-10-07 会话与 Asset 清理的写入约束

- PC 核心同步和导入在发起时固定 owner/device/session 与代际；会话失效不改变 A 的 Repository 归属，不删除其待同步内容，不将旧操作提交到 B 的投影或网络身份。内部票据不进入 HTTP DTO、SQLite 或服务器表；未结算 inflight 可用原幂等 ID 重试。
- Source 创建 FILE、替换 Asset 或恢复 FILE 时，对 READY Asset 使用 owner-scoped 悲观写锁；保留期清理使用相同 Asset 锁，在独立事务中重查 active/recent 引用并持久化 ORPHANED，再执行不可回滚的对象删除。
- ORPHANED 的事务提交是禁止新 FILE 引用的边界；删除失败保持 ORPHANED，可由后续清理幂等重试。Asset/Source 审计行保留。本轮不新增列、索引、迁移或同步字段，验证与剩余工程门槛见 [实施记录](../plans/2026-10-07-priority-function-fixes.md)。

| 数据源 | 新后端目标作用 | 阶段 0 状态 |
| --- | --- | --- |
| PostgreSQL 17 + pgvector | 用户、业务资源、同步日志、任务、事件、RAG chunk 和向量 | V1–V14 已创建；默认容器集成已验证 |
| MinIO | Asset 物理对象内容 | 设计已确定，阶段 2/5 接入 |
| PC/Mobile 本地数据库 | 用户按 userId 分区的离线副本 | PC 使用 v2 repository/schema；Mobile 按 userId/serverDeviceId 使用独立 H5/SQLite namespace |
| Tablet 本地笔记存储 | NoteDocument、stroke、snapshot、viewport 等端侧专有内容 | 不进入阶段 0 Server |
| Redis、Milvus、etcd | 旧栈组件 | 不属于新后端目标拓扑 |

## 新数据库共同字段

Subject、Source、KnowledgeBlock、Task、Relation 等同步资源至少包含：

| 字段 | 类型 | 约束/语义 |
| --- | --- | --- |
| id | UUID | 主键；API 传字符串 |
| user_id | UUID | NOT NULL，引用 users(id)，所有权边界 |
| version | BIGINT | NOT NULL、非负，由 JPA @Version 管理 |
| created_at | TIMESTAMPTZ | NOT NULL，服务器创建时间 |
| updated_at | TIMESTAMPTZ | NOT NULL，服务器更新时间 |
| deleted_at | TIMESTAMPTZ | NULL；非 NULL 表示墓碑 |

数据库字段使用 snake_case；API DTO 使用 camelCase。空值使用 SQL NULL/JSON null，不使用特殊展示值。

## 新表设计

| 表 | 主要用途 | 关键约束/索引 |
| --- | --- | --- |
| users | 用户账号 | normalized_username 唯一，status 索引 |
| refresh_sessions | refresh token rotation 链和设备会话 | token_hash 唯一；user、expiry、revoked 索引 |
| devices | 离线设备和同步状态 | user_id + device_id（语义为 clientDeviceKey）唯一 |
| subjects | 用户学科；兼容历史默认标记 | 活跃记录按用户名称唯一（服务校验）；`is_default` 仅保留历史兼容语义，不阻止软删除 |
| assets | MinIO 物理对象元数据 | user_id + object_key 唯一；status 索引 |
| sources | 用户可见逻辑来源 | user、subject、status、updated 索引 |
| knowledge_blocks | 知识正文 | user、subject、source、updated 索引 |
| tasks | 任务和排期 | user、status、scheduled、due 索引；`completed_at` 记录进入 DONE 的时间 |
| relations | 跨对象关系 | 节点类型 CHECK；定向/无向去重 |
| review_parameter_sets | FSRS 参数版本 | scheduler/version 唯一 |
| review_states | 每个知识块当前复习状态 | knowledge_block_id 唯一；user/due 索引 |
| review_events | 不可变复习历史 | user_id + client_event_id 唯一 |
| review_lifecycle_commands | 学习、初选、确认、纠正与重学不可变命令回执 | user_id + client_command_id 唯一；用户/知识块归属外键级联物理清理 |
| review_lifecycle_reviews | 同次复习初选基准与最终有效结果 | review_id 主键；用户/知识块与selected_at历史索引 |
| change_log | 用户增量同步日志 | 用户域内递增 BIGINT cursor；user_id + cursor 索引 |
| inbound_mutations | push 幂等结果 | user_id + device_id（语义为 serverDeviceId）+ client_mutation_id 唯一 |
| domain_event_outbox | 数据库事件 | status/available_at 索引；幂等消费 |
| ingestion_jobs | 文档解析与索引任务 | status/available_at/lease 索引 |
| source_chunks | RAG 文本块和向量 | user/source/generation/ordinal 唯一；active generation 查询索引；PostgreSQL vector(1024) HNSW 索引 |
| ai_credentials | 用户 BYOK 密文 | user_id + provider 唯一；只存密文 |
| conversations | AI 会话 | user/updated/deleted 索引；version 乐观版本、next_message_sequence 并发序号计数器、user + client request id 恢复键及 Chat scope state |
| messages | AI 消息 | conversation + sequence 唯一；user + client request id 幂等键；assistant 的 reply_to_message_id 精确关联 USER 消息 |

## 阶段 1 Identity V1 已实现 schema

Flyway `V1__identity_schema.sql` 是当前身份表 schema 的唯一权威来源，面向干净数据库，不接管旧 schema，也不提供旧数据迁移。V1 包含：

| 表 | 已实现字段和约束 |
| --- | --- |
| `users` | `id UUID` 主键、`username`、唯一 `normalized_username`、`password_hash`、`display_name`、`avatar_url`、`status`（ACTIVE/DISABLED CHECK）、`version BIGINT`、`created_at/updated_at TIMESTAMPTZ` |
| `devices` | `id UUID` 主键、`user_id UUID` 引用 `users`、`device_id`（clientDeviceKey）、`name`、`platform`、`last_active_at`、`last_pull_cursor`、`revoked_at`、`version`、审计时间；`(user_id, device_id)` 唯一 |
| `refresh_sessions` | `id UUID` 主键、`user_id`/`device_id`（serverDeviceId）外键、`rotation_family_id`、唯一 `token_hash`、`created_at`、`expires_at`、`last_used_at`、`rotated_at`、`revoked_at`、自引用 `replaced_by_session_id` |

三张表均使用 `ON DELETE RESTRICT` 的归属外键；V1 为 owner、expiry、revocation、rotation family 和 token hash 建立查询索引。JPA Entity 使用 `Instant`、UUID、字符串枚举和 `@Version` 映射，Repository 查询包含当前 `userId` 的方法不省略归属条件。

设备级会话撤销、登录和刷新先锁同一 `users` 行。按会话 ID 撤销时，服务端从用户拥有的 `refresh_sessions` 行解析 `device_id`，再按 `user_id` 和 `device_id` 设置该设备活动行的 `revoked_at`。轮换历史用于定位设备，无需 schema 迁移。既有密码哈希继续按原编码验证。

## PC 个人空间服务端数据扩展（V24/V25，2026-09-24）

- V24 新增 `user_avatars(user_id,content_type,image_bytes,updated_at)`：`user_id` 是主键且外键指向 `users(id)`，头像只存服务端校验并重编码后的 PNG，数据库限制非空且不超过 5 MiB。旧 `users.avatar_url` 保留既有字段，本次头像读写不再使用它。头像不进入普通业务资源同步或 Asset 表。
- V25 新增 `account_deletion_jobs(id,user_id,status,requested_at,not_before,next_object_scan_at,object_scan_after_key,lease_until,completed_at,last_error)` 与 `account_deletion_objects(job_id,object_key,deleted_at)`。作业保留待清理对象键、可重试状态、租约和已完成作业的分批复扫游标；`account_deletion_jobs.user_id` 不设置用户外键，使用户最终删除后仍可保留对象键记录。对象键由服务端从当前用户的 Asset、ParsedDocument 元数据收集，不能由客户端指定。
- 注销请求先将用户状态设为 `DISABLED` 并撤销 refresh sessions；上传意图签发与停用用户通过用户行锁串行化。在现有预签名上传有效期及缓冲后，后台 worker 清理对象，最终在事务中按 `user_id` 显式删除依赖行与用户。已完成作业仍按有界批次周期性复扫已记录对象键，以清除预签名 PUT 晚到造成的对象重现。V25 不修改原有 Subject、Source、Asset 等表的外键删除语义。对象存储与 PostgreSQL/MinIO 真实联动仍需验收。

## 专注与完整 Overview 持久化（V26–V28，2026-10-01）

本轮代码已经追加以下迁移，聚焦自动验证与整合门禁记录以当前状态和实施计划为准；未在运行服务执行迁移。

| 表或迁移 | 现行字段与约束 |
| --- | --- |
| V26 `focus_sessions` | `id/user_id/client_session_id/task_id?/started_at/ended_at/duration_seconds/completed/created_at`；用户与 client_session_id 唯一；结束不早于开始；秒数 0–86400；用户外键级联删除，task_id 为历史关联标识，不因任务删除丢失专注统计 |
| V27 `overview_results` | 按用户、SOURCE/SUBJECT、scope_id 唯一；保存 Source/Subject 归属、ingestion_revision、whole version、outline/summary part version、完整 JSON、每部分 manifest/fingerprint/生成时间和 updated_at；两部分均非空；SOURCE 要求当前 revision，SUBJECT 无 source_id/revision |
| V27 `overview_write_receipts` | 用户与 client_write_id 唯一；保存 scope/base_version/payload_hash/response_snapshot/created_at；独立保存每次请求的精确回放结果，直到账户删除，不改写历史请求 |
| V28 | 仅删除 knowledge_blocks.summary/tags 两列；不会删除知识块或正文，也不改写历史 inbound_mutations/change_log JSON |

专注秒数与自然完成轮次由独立历史事件聚合；原 review_events 和 studySeconds 保持复习语义。专注请求先锁用户保证并发幂等，时间规范到数据库微秒精度后比较。

Overview 是独立派生成果，不进入五类资源的 core Sync snapshot/change_log/inbound_mutations。写入在用户与当前输入的锁和事务内校验 owner、活动状态、READY、revision、baseVersion；Subject 校验当前活动 READY FILE 来源集合及已持久化文件 part versions，TEXT/URL 不进入该 manifest。生成过程和失败不落远端结果。Subject 删除只直接清理其 SUBJECT scope 成果，当前子 Source 的成果由各 Source DELETE 事件清理，避免移动后的资料被旧学科误删。普通删除使成果失效，迟到请求与旧回执不能复活已删除或旧 revision 的成果；账户物理清理包含新增三表。详细 HTTP 和 manifest hash 规则见 [API](API.md)。

## Overview 私有生成协调（V32，2026-10-13；Service 集成、自动门禁通过，运行态已观察应用）

Flyway V32 新增私有生成状态并已接入 Overview Service，clean 与 V31→V32 PostgreSQL 自动集成门禁通过。2026-10-13 主代理只读观察到当前 backend healthy、Flyway V32 `success=true`；本执行器未执行部署或迁移，也未验证运行镜像内 class/source provenance、构建替换退出码或备份。该结构不属于五类资源同步，也不替代 V27 `overview_results` / `overview_write_receipts`。

| 表 | 用途及主要约束 |
| --- | --- |
| `overview_generations` | owner、scope/revision、input/profile/algorithm fingerprint、状态、fence/lease、累计 charged/unknown-dispatched/reservation 预算 lineage、累计 recovery count / 去重后的安全 recovery actions 和可选成功结果；安全 action 为大写字母/数字/下划线短标识，当前包括既有 `REDUCE_RECOVERY`、`REDUCE_SPLIT` 与新增 `PROVIDER_TRUNCATION_SPLIT`、`PROVIDER_JSON_REPAIR`，generation 内按集合去重；结果大小受限，状态受 CHECK 约束。`error_status` / `error_retry_after_seconds` / `error_reset_at` 仅保存六种既有用量错误的安全状态与重试信息，可空 reset 时间不写零值替代；详情只允许合法 FAILED/code/status 组合，失败提交受 fence/lease 保护，接管或成功清除。成功 response payload 按 14 天期限清除；generation 与 budget metadata 保留，失败 lineage 不因重试或 payload 清理而重置。 |
| `overview_generation_requests` | owner-scoped `request_id` 到 generation/input 的映射；`(user_id,request_id)` 唯一。只对规范化有效 UUID 提供客户端 replay；输入冲突拒绝。mapping 与 generation/budget metadata 保留，成功 payload 清理后旧 ID 仍不能再次绑定。缺失/空白/非法 ID 会被生成新的服务端 UUID，因此不构成客户端 idempotency key。 |
| `overview_generation_checkpoints` | 按 generation、step、输入 fingerprint、schema version 记录已校验中间 payload/hash；唯一约束防止相同步骤身份重复写入，payload 有大小上限。checkpoint 按独立到期策略清理，不代表 request mapping 或 generation metadata 的保留期限。 |

Direct Source/Subject adaptive generation 允许恢复唯一精确绑定的 terminal FAILED writer attempt，但只在 request 已 dispatched、actual usage 缺失、reservation 已结算且 `charged_tokens >= estimated_input_tokens + reserved_output_tokens > 0` 时。旧 reservation 不更新、不释放，budget root 和已验证 checkpoints 保留；新 attempt 建立自己的 execution-call/invocation/reservation lineage。generation/node attempt、精确 reservation 关联与有效 checkpoint 在现有 fence 下再次校验。一个 node 出现第二个 unknown-dispatched reservation、账务不足、EXPIRED/RESERVED、非 writer 或缺失/冲突关联仍 hold。该策略复用现有列、约束和 journal，无 schema/API/migration 变化；durable-job 恢复仍沿用严格 unknown hold。

协调器以短事务执行 claim/fence/lease 仲裁，Provider I/O 不在事务中；Service 调用仍通过现有 Gateway 与用户用量账本。失败 payload 可按策略清理，但 generation budget lineage 不得因此重置；账户删除级联清理私有行。生成 endpoint 不写正式 Overview results，保存仍由客户端调用独立 PUT。

## 阶段 2A 核心领域 V2 已实现 schema

Flyway `V2__core_domain_schema.sql` 在 V1 之后新增 `subjects`、`knowledge_blocks`、`tasks` 三张表，全部使用 UUID 主键、`user_id` 归属外键、`version`、审计时间和 `deleted_at` 墓碑；Subject、KnowledgeBlock、Task 的 JPA Entity 使用 `@Version`，业务 Repository 查询显式带 `userId` 和 `deleted_at IS NULL`。

- `subjects` 保存 `name`、`description`、`icon_key`、`sort_key`、`is_default`；新用户注册不自动创建 Subject，列表可以为空。历史遗留的“未分类”记录仍保留 `is_default=true` 以兼容读取，但可按普通 Subject 软删除。名称唯一和恢复占用冲突由 SubjectService 校验。Flyway `V19__remove_subject_color.sql` 删除历史遗留的 `color` 列，仅丢弃该列值，不影响 Subject 行或其他资源。
- `knowledge_blocks` 保存 `subject_id`、可空 `source_id`、`title`、正文 `content` 和 `color_override`。V28 删除用户明确弃用的 `summary/tags` 列；原正文和其他字段保留。阶段 2B 已创建 `sources` 表、补齐 `source_id` 外键和服务层归属/活动状态校验。
  - `tasks` 保存 `subject_id`、`title`、`description`、`status`、`scheduled_at`、`due_at`、`duration_minutes`、`sort_key`；数据库 CHECK 与服务约束状态和非负时长，`due_at` 是提醒/排序信息，不与 `scheduled_at` 建立先后约束。历史迁移 `V18__restore_task_schedule_order.sql` 曾清空 `due_at < scheduled_at` 行的 `scheduled_at` 并添加 `ck_tasks_schedule_order`；新迁移 `V23__allow_scheduled_tasks_after_due_at.sql` 移除此 CHECK，不修改现有行。该历史清空不会由 V23 自动恢复。`V20__remove_task_cognitive_load` 删除已废弃的认知负荷列及 Task 同步 JSON 字段，V21 删除 Task 颜色列及历史颜色键。
- KnowledgeBlock/Task 对 Subject 的引用在服务层按当前 `userId` 校验；跨用户或已删除 Subject 不可创建、更新或恢复子资源。三表外键均为 `ON DELETE RESTRICT`，普通业务删除只写 `deleted_at`。
- Subject 软删除由 Server 事务内的领域事件级联处理同一用户、同一 `subject_id` 下的活动 Source、KnowledgeBlock 和 Task：子行通过实体更新递增 `version`、更新审计时间并写入 `deleted_at`，不执行 SQL 硬删除或新增表/字段；每个子行的 DELETE change-log tombstone 与受影响 Relation tombstone 同事务提交。Subject restore 不恢复这些子行，已删除子行不会重复产生 tombstone。

## 阶段 2B Source、Asset、Relation V3 已实现 schema

Flyway `V3__source_asset_relation_schema.sql` 在 V2 之后新增 `assets`、`sources`、`relations`，并给 `knowledge_blocks.source_id` 补充指向 `sources(id)` 的可空 `ON DELETE RESTRICT` 外键。V3 不修改已执行的 V1/V2。

- `assets` 保存 `id`、`user_id`、可空 `client_import_id`、`object_key`、`original_name`、`size_bytes`、`mime_type`、可空 `sha256`、`upload_status`、可空 `completed_at` 和审计时间；历史行允许 `client_import_id = NULL`，新导入由请求层强制提供 UUID，`(user_id, client_import_id)` 与 `(user_id, object_key)` 均唯一（数据库 NULL 语义允许历史行并存）。Asset 幂等比较使用文件名、大小、MIME 和 sha256；size 必须为正，状态为 `UPLOADING`、`READY`、`FAILED`、`ORPHANED`。Asset 不含 `version/deleted_at`，不属于普通同步资源。V22 仅追加 nullable `client_import_id` 与 owner-scoped 唯一约束，不回填历史 Asset。
- `sources` 保存共同同步字段、`type`、`subject_id`、`title`、可空 `asset_id`/`origin_url`/`raw_text`/`outline`、`ingestion_status`、安全错误码和安全错误说明；type 为 `FILE`、`TEXT`、`URL`，状态为 `PENDING`、`PARSING`、`INDEXING`、`READY`、`FAILED`。数据库外键表达用户、Subject、Asset 归属表约束，跨用户/活动状态由服务层校验。
- `relations` 保存共同同步字段、`source_type/source_id`、`target_type/target_id`、`type` 和可空 `label`；数据库 CHECK 限定四种节点和五种关系类型、端点非空、禁止同类型同 ID 自关联。Relation 的跨表端点存在性、用户隔离和 `RELATED_TO` 规范化去重由 RelationService 保证。
- 删除端点通过 shared `ResourceDeletedEvent` 由 Relation 模块批量软删除相关活动关系并递增关系版本；恢复端点不自动恢复关系。

V3 的 Entity 使用显式 DTO 边界；AssetStoragePort 抽象预签名 PUT、HEAD/stat 和预签名 GET。test profile 使用可控测试适配器，MinIO 适配器只在 `auralis.upload.storage-provider=minio` 时启用。

## 阶段 3 Sync V4 已实现 schema

Flyway `V4__sync_schema.sql` 新增 `change_log` 和 `inbound_mutations`。`change_log` 以 `(user_id, cursor)` 唯一约束维护用户域内的同步顺序，保存资源类型/ID、操作、版本、墓碑时间、稳定 JSON payload 和创建时间；`inbound_mutations` 以 `(user_id, device_id, client_mutation_id)` 唯一约束保存请求 hash、决策、change cursor、当前资源快照、错误码和审计时间。两张表均有保留清理索引，首批同步资源受 CHECK 约束限制为 Subject、Source、KnowledgeBlock、Task、Relation。

Sync push 在每条 mutation 的独立事务内先预留幂等键，再完成领域写入、change log 和最终决策，保证领域写入与幂等结果原子提交；同键 hash 不同的 mutation 只返回该条 REJECTED。`V6__sync_atomicity_and_cursor_high_water.sql` 增加 PROCESSING 决策和用户域 cursor 高水位表，cursor 分配使用行锁并在 change log 清理后保持单调。REST 领域服务和 push 通过 shared `ResourceChangedEvent` 进入同一个 change log 记录器；PostgreSQL 并发压力仍未验收。

五类资源的 `CREATE` 受各表现有 UUID 主键约束，其他用户的记录和已软删除的记录同样占用该主键。主键碰撞时创建事务回滚，再按原幂等键在独立事务记录拒绝结果。已提交的同键回执优先于补写。此修复复用 V2/V3 主键和 V4/V6 回执字段，无需迁移。

领域写入的预期拒绝沿用该事务边界。原事务回滚资源、change log 和幂等占位，独立事务重新按原请求指纹占位并冻结回执。排期拒绝的当前任务组从新事务读取；普通版本冲突保存领域异常携带的当前资源。已有同键回执仍优先。

### 2026-10-12 V31 PC Timeline 排期 Sync 命令

`V31__allow_task_schedule_commands_in_sync.sql` 将 `inbound_mutations.mutation_type` 扩至 `VARCHAR(32)`，并允许 `SCHEDULE_INSERTION`、`SCHEDULE_SWAP`。这两个值只属于 inbound command；`change_log` 的 mutation CHECK 仍仅允许 CRUD，排期命令执行后的 Task 变更照常以 `UPDATE` 记录。PC 本地 repository 在一个数据库事务中写入单条排期 outbox 命令与所有受影响 Task 的乐观投影；未结算命令会为其成员建立本地同步围栏，内部成员 ID 不发送到服务端。浏览器状态改写要求 Web Locks API 并通过同源锁串行化；缺少该 API 时拒绝 localStorage 写入，错误码为 `LOCAL_STORAGE_LOCK_UNAVAILABLE`，避免并发覆盖整份状态。服务端在同一 `REQUIRES_NEW` 幂等事务中调用现有 Task 排期领域服务，并将结果 Task 数组和 mutation 回执一起保存。

## 阶段 4 Review、Stats、Realtime V5 已实现 schema

Flyway `V5__review_stats_realtime_schema.sql` 新增：

- `review_parameter_sets`：scheduler/version 唯一，保存不可原地覆盖的参数 JSON。
- `review_states`：用户与 KnowledgeBlock 一对一，保存 difficulty、stability、due/lastReviewed、reps、lapses、参数集和版本；用户/知识块/参数集外键与非负 CHECK 已建立。
- `review_events`：不可变复习历史，保存 clientEventId、评分、复习时间、耗时、baseVersion、调度器/版本、参数集和完整前后 ReviewState JSON 快照；`(user_id, client_event_id)` 唯一，幂等重放使用事件中的 afterState。
- `realtime_tickets`：只存 ticket hash、用户/设备、过期时间、消费时间和创建时间；hash 唯一，用户和设备外键级联清理。

V5 同时将 change log、inbound mutation 的 owner 外键改为级联删除，以免账户清理被审计/幂等记录阻塞；业务软删除仍由领域服务负责。Review/Stats 查询与 Realtime ticket 消费均按 userId 过滤。

## 阶段 3/4 审核修复迁移

### V29 学习、复习纠正与掌握退出（2026-10-08，代码、相关自动验证及临时PG迁移通过）

`V29__review_lifecycle_protocol.sql` 扩展既有Review状态并新增独立命令与有效结果表，不增加核心Sync资源或端侧持久队列。

2026-11-03 源码候选：生命周期命令在 `review_states` flush 后 refresh 持久实体，再序列化新 `review_lifecycle_commands.response_payload`，避免内存审计时间纳秒值与 PostgreSQL 微秒值不一致。既有冻结 response、request fingerprint 与表结构不改写；无迁移。PC 原有 canonicalAnchor 与误冲突操作仍保留，按[交接方案](../plans/2026-11-03-pc-review-unschedule-handoff.md)由 PC 实施定向恢复。

- `review_states` 增加 `needs_learning BOOLEAN NOT NULL DEFAULT FALSE`、`mastered BOOLEAN NOT NULL DEFAULT FALSE`、`stable_success_count INTEGER NOT NULL DEFAULT 0`、可空 `next_review_stage VARCHAR(32)`、`last_practice_at TIMESTAMPTZ`、`last_review_id UUID`、`pending_review_id UUID`、`content_hash VARCHAR(64)`。稳定次数CHECK 0–3；阶段仅EARLY_RECALL/CROSS_DAY/FINAL_VERIFICATION；needs_learning与mastered互斥；mastered要求stable_success_count=3。新增user/learning/mastery/due联合索引。
- `review_lifecycle_commands` 保存 `id,user_id,knowledge_block_id,client_command_id,action,occurred_at,knowledge_block_version,base_version,review_id,rating,duration_seconds,content_hash,request_payload,response_payload,created_at`。请求及冻结回执为TEXT；`(user_id,client_command_id)`唯一。action限定LEARNING_COMPLETED/REVIEW_SELECTED/REVIEW_CONFIRMED/REVIEW_CORRECTED/LEARNING_REOPENED；rating可空或AGAIN/HARD/GOOD；版本及耗时非负；按user/KB/occurred_at/id索引读取审计。
- `review_lifecycle_reviews` 保存 `review_id,user_id,knowledge_block_id,selected_rating,effective_rating,selected_at,resolved_at,resolution,duration_seconds,knowledge_block_version,content_hash,before_state,created_at`。review_id主键；before_state为初选前状态TEXT，用于同次纠正的原始调度基准。有效结果可空，确认/纠正更新同一行；resolution限定AGAIN_SELECTED/CONFIRMED/CORRECTED_AGAIN/SUPERSEDED。反馈仅三档，版本/耗时非负；按user/KB/selected_at/review_id索引。
- 两新增表user和KB外键均ON DELETE CASCADE；活动资源读取与写入仍按owner和软删除过滤，软删除保留历史。旧review_events不可变快照与精确回放不改写。
- 旧state迁移仅增加默认未掌握/稳定0/无需学习标记，原日期、历史及version保留；不从reps推断通过次数。nullable内容hash在新流程绑定，不把旧记录认作已经通过3R。mastered仍保留有限due_at，查询按显式mastered排除，避免用极远日期表达毕业。
- V29在业务流量前用 `INSERT ... SELECT ... WHERE NOT EXISTS(scheduler,version)` 预置默认FSRS_LITE/1参数，沿用既有默认ID/JSON；已有同scheduler/version行保持ID和内容。避免不同Subject/用户首次学习各自查空并竞争全局参数唯一键。临时PG空库双Subject首学与V28自定义参数升级保留分别1/1，当前V29的H2迁移及Lifecycle/legacy回归14/14通过。
- 生命周期写入沿 Subject→owner KB→ReviewState 锁序，串行化首次缺状态创建、正文变化、移科与同块命令。加锁后复核当前归属。正文 hash 校验后可以按原指纹返回已保存的回执，新命令核对当前 KB 及状态版本。正文变化通过领域事件在原事务失效复习资格。仅移科时，保留既有调度、学习标记、掌握度和有效历史，清除旧因果 ID 并将未确认初选标为 `SUPERSEDED`。该规则沿用 V29 表和已存请求、回执格式。
- 学科状态统计使用pendingLearning/reviewing/mastered分区；新有效结果与旧非SKIP事件组合，学习完成从命令独立计数。日期归属与响应字段见 [API](API.md)，命令/生成契约/PG证明范围见 [本轮实施](../plans/2026-10-08-review-learning-mastery-implementation.md)。

- `V6__sync_atomicity_and_cursor_high_water.sql` 放宽 inbound mutation 决策约束以容纳事务内 `PROCESSING` 占位，并新增 `sync_cursor_high_water(user_id, cursor)`；高水位不随 change log 保留清理删除。
- `V7__task_completion_timestamp.sql` 为 `tasks` 新增可空 `completed_at`；任务进入 DONE 时写入，离开 DONE 时清空，保持 DONE 状态的后续编辑不改写该时间。weekly completed task 统计按该字段过滤，而不是按 `updated_at`。

## 核心模型字段决策

### Subject

保存 name、description、iconKey、sortKey 和共同字段。Subject 不保存专属颜色；新用户注册不自动创建学科，历史遗留的未分类学科可以软删除；Source、KnowledgeBlock、Task 必须归属 Subject。

### Asset 与 Source

Asset 保存 objectKey、originalName、sizeBytes、mimeType、sha256、uploadStatus、completedAt。状态至少为 UPLOADING、READY、FAILED、ORPHANED。

Source 保存 type、subjectId、title、assetId、originUrl、rawText、outline、ingestionStatus、safeErrorCode、safeErrorDetail 和共同字段。状态至少为 PENDING、PARSING、INDEXING、READY、FAILED。

Asset 不作为 Relation 节点，也不进入普通离线 mutation；Source 才是同步和关系中的来源节点。

### KnowledgeBlock

保存 subjectId、sourceId、title、content、colorOverride 和共同字段。content 是正文权威；卡片短文本从正文临时截取，不再持久化 summary、preview 或 tags。原有不可变同步 mutation 的请求和回执不改写；服务端忽略请求中的旧扩展字段。端侧旧库备份保留，不执行历史正文删除。不保存相对 time 文案、mastery 百分比、difficulty 文案、relatedBlockIds 或拼接关系标记。

### Task

保存 subjectId、title、description、status、scheduledAt、dueAt、durationMinutes、sortKey、completedAt 和共同字段。status 固定为 TODO、IN_PROGRESS、DONE、CANCELLED；completedAt 表示最近一次进入 DONE 的服务器时间，包括 PC 自动完成经同步提交的更新，不能用截止时间替代。排期写入本身不自动改变状态；`dueAt` 用于截止提醒、排序和新排期的完整结束上限：创建、恢复、时间字段有效值变化或取消后重新进入活动排期时要求 `scheduledAt + effectiveDurationMinutes <= dueAt`（空时长按 30 分钟，无截止不限制，恰好结束允许）。领域服务共享校验覆盖 REST/Sync、换位和顺延，不增加列、CHECK 或迁移，保留用户截止时间。历史越界排期不批量改写，非时间编辑及自动 DONE 仍允许，空时长与显式 30 等价。PC 活动未排期任务按有效 `dueAt <= now` 提交 DONE；已排期任务按排期结束时刻提交 DONE，两者均保留原 `dueAt`，沿用现有字段和版本规则，无新增列或迁移。V21 删除 Task `colorOverride` 并清理相关 JSON；V23 移除历史排期顺序 CHECK。

PC 自动完成在本地原子提交中要求 TASK 行存在且无 `deletedAt`，包含 Subject cascade 不增加子任务版本的墓碑情形；删除标记以本地资源行元数据为准，不能只检查 payload。条件仅作为端侧仓储写入前置校验，不新增持久化字段或同步载荷。

Task 截止值表示约束（2026-10-11）：`dueAt/due_at` 与 TASK mutation 保存带时区的真实 instant；PC 纯日期输入仅在明确的用户输入边界转换为当地日末对应的 UTC 值，不持久化纯日期字符串。读取与排期校验不把无时区纯日期兼容解释为日末；非空无效或无时区 `dueAt` 会阻止新排期。已有带时区午夜/日末按真实 instant，不推断全天语义。资产库以真实时间戳转换出的本地日期显示；未改日期的非时间编辑保留原精确截止值。本次不改数据结构、同步字段或迁移，不批量改写既有数据；旧日期输入造成的错误值可由用户先清空截止日期、再重选并正常保存纠正。

### Relation

节点只允许 SUBJECT、SOURCE、KNOWLEDGE_BLOCK、TASK；类型只允许 CONTAINS、REFERENCES、DERIVED_FROM、DEPENDS_ON、RELATED_TO。创建/恢复必须验证两端存在、同用户且未删除；RELATED_TO 按规范化端点顺序去重，其他类型保持方向性。

### Review

ReviewState 保存 difficulty、stability、dueAt、lastReviewedAt、reps、lapses、schedulerVersion、parameterSetId 和共同字段。ReviewEvent 不可变，保存 clientEventId、评分、复习时间、算法版本、参数版本和前后快照。SKIP 只写事件，不改变 ReviewState。

#### 2026-10-08 学科读取与 PC 本轮状态约束

- 本次学科 states / stats 仅新增读取规则，复用 `review_states`、`review_events`、Subject、Source、KnowledgeBlock 与 Task；不增加表、列、索引、迁移或同步字段。
- 状态分页在 limit 前过滤 owner、当前学科与活动 Subject/KB，以 knowledge_block_id 作稳定 keyset，游标绑定 userId / subjectId。统计在可重复读事务内组合独立聚合，活动 KB 与无状态/到期/未来三类计数使用同一查询快照。
- 正式学习判定使用不可变事件 `before_state IS NULL`；首次状态 version 本身为 0，不能用 base_version=0 判断后续评分是否首次。SKIP 仍按现行 events 保存跳过事件，但不计入正式学习次数、首次/后续学习和反馈分布。
- 日统计按请求 IANA 时区的自然日半开区间聚合并补零；事件随 KB 当前学科归属。KB 墓碑不进入当前状态概况，历史评分与新增 KB 趋势仍保留已软删除行；物理删除后的行无法恢复。任务完成趋势依据当前 DONE/completed_at 并保留已完成软删除历史，重新打开清空的旧 completed_at 不可推算。
- PC 每学科轮次仅保存在当前进程的 Review Store 内存，固定账号/设备/会话与 roundId；包含队列、展开态、首次正式接受标记和待确认不可变事件。切页可继续，刷新/重启、明确结束、成功删除学科或会话变化清除；不写 SQLite、localStorage、Review outbox 或服务端表。存在未确认事件时先幂等确认再结束，删除成功后失效该学科的在途请求写回资格。
- 接口与实际验证边界见 [API](API.md) 和 [实施计划](../plans/2026-10-08-subject-review-stats-implementation.md)，专注持久化与个人聚合保持现行规则。

## 同步不变量

- CREATE 使用 baseVersion = 0；UPDATE、DELETE、RESTORE 精确匹配当前 version。
- Server 覆盖 mutation 的 userId，客户端不能提交或覆盖用户归属。
- 每个用户只能读取自己的实体、cursor、墓碑、事件和向量。
- REST 直接写入与 Sync push 走相同领域命令和 change log 路径。
- tombstone、change_log 和 inbound mutation 结果至少保留 30 天。
- 端点删除同事务软删除相关 Relation；端点恢复不自动恢复旧 Relation。
- 游标早于保留窗口时返回 resetRequired=true；设备执行完整 snapshot。
- snapshotCursor 与数据视图必须在可重复读事务或等价一致性策略中确定。

## 端侧现状与迁移边界

替换前 PC/Mobile localDb 仍有 sync_version、is_deleted、sync_status、position、related_block_ids、source_file_id 等旧字段；Mobile 的类型和数据库字段并不完全一致。新 API 稳定后，端侧数据库必须按 userId 分区并逐步迁移为 version/createdAt/updatedAt/deletedAt/baseVersion 语义。

### PC R4-06 本地副本边界（2026-08-20）

`Auralis-PC/src/services/localSchema.ts` 与 `localRepository.ts` 定义了新的端侧 v2 边界：

- Tauri SQLite 使用 `sync_metadata(user_id, device_id, cursor, reset_required, schema_version)`、`local_resource_records(user_id, resource_type, resource_id, version, deleted_at, sync_status, payload)` 和 `local_mutations(client_mutation_id, user_id, resource_type, resource_id, mutation_type, base_version, payload, status, created_at, error)`；其中本地 `device_id` 列语义为 `serverDeviceId`，资源主键、mutation 主键 `(user_id, client_mutation_id)` 和查询均包含当前用户域。
- 浏览器 fallback 使用 `auralis:v2:<userId>:<serverDeviceId>:state` namespace，业务记录、tombstone、mutation 和 cursor 不再写入新的全局未命名业务 key。
- repository 对外返回 camelCase `LocalEntity`/`LocalMutation` DTO；snake_case 只存在于 SQLite adapter。`baseVersion` 不匹配返回 `LocalConflictError`，删除保留 `deletedAt` tombstone，snapshot reset 会保留当前用户所有 pending mutation 及其本地 payload。
- PC 时间轴自动完成在提交本地 TASK mutation 时额外传入可选 `expectedLocalVersion` 与非 pending mutation 拒绝条件：SQLite 在同一写事务内核对当前资源版本与同资源的 inflight/error/conflict，再提交或合并 pending；浏览器 fallback 在同步 read/modify/write 内进行同样检查。缺行、版本已变化或存在不能合并的未解决 mutation 时拒绝，避免旧自动写入覆盖同步投影或产生重复 outbox。增量 pull 使用 `upsertFromSync` 在同一写边界重新核对同资源未解决 mutation，跳过期间新产生本地写入的资源。其他普通 mutation 调用保持原有提交语义；未新增表或同步字段。
- 2026-10-07 在线排期响应使用既有 `upsertSyncedBatch`：先核对整批 pending/inflight/conflict/error mutation 围栏，有未解决写入返回 false 且零写；否则在同一 SQL 事务或 browser 同步状态提交段读取当前行，逐项跳过较低版本及会清除当前墓碑的活动响应，包括同版本或更高版本的活动响应。此入口不执行显式恢复；同版本 active→active 和 active→墓碑仍可接受，墓碑更新不能降低版本。其他有效成员在同一提交边界合并，SQL 写失败整体回滚，browser 只写一次状态；true 表示可接受成员合并完成，不表示每个输入成员均覆盖当前行。Store 保留响应原始版本（包括 0），仅从当前 Repository 重建投影；cursor 已推进的较新行/墓碑不能依赖再次 read 修复旧响应覆盖。没有 schema、表、同步字段或迁移变更，验证与限制见 [实施记录](../plans/2026-10-07-timeline-placement-and-swap-fixes.md)。
- 旧 account-less localStorage 数据仅复制到 `auralis:legacy_unassigned:v1` 备份空间；Tauri 旧 SQLite 资源行复制到 `legacy_unassigned_records`，均保留原值。PC 仓储自动备份这些未归属数据，当前账号的业务投影不读取这些备份。2026-11-11 PC 初始化只执行现行 v13 建表及版本化迁移，保留已经存在的旧业务表、列和值。Profile 缓存清理及离线重置保留历史全局业务键和未归属备份。

该边界已用临时内存 SQLite 与独立 localStorage namespace 覆盖用户隔离、旧 SQLite 行备份、tombstone、版本冲突、snapshot pending 保留和 legacy backup；真实 Tauri plugin、跨版本旧数据库升级和 GUI 迁移选择仍未验收。

### PC R4-07 文档处理任务（本地 schema v5，2026-08-24）

PC 本地 SQLite schema 从 v2/v3/v4 升级到 v5，新增专用 `document_processing_jobs` 表并将 `ingestion_revision` 对齐为服务端 UUID 文本；旧 v3 数字 revision 会先复制到 `legacy_document_processing_jobs_v3*` 再迁移，不删除原行，v4 任务追加 `payload_receipt_json` 列。该表不进入 `local_resource_records`、`local_mutations` 或同步 change log。每个任务按 `(user_id, device_id, source_id, ingestion_revision)` 唯一，其中 `device_id` 语义为 `serverDeviceId`，查询始终带当前用户和设备边界。

### PC ParsedDocument schema-v1 本地派生缓存（2026-09-08）

PC 加密 cache/header 与 `payload_receipt_json` 现在记录本地派生格式 `parsed-document-v1`、Source Asset SHA-256、parser id/version、normalization version 和可选 OCR model version；这些是 cache/receipt 恢复元数据，不是 Server 数据库 schema 字段。解密后上传的 gzip 内容是一个 schema-v1 JSON envelope（不是 NDJSON），只含 Server 接受的文档元数据、顺序 blocks、Unicode code-point `characterCount` 和 `plainTextSha256`。`payloadBytes/payloadSha256` 指解密 gzip payload，`encryptedBytes` 指本地加密 envelope。

缺少或不完整 v1 元数据的历史派生 cache 在创建 upload intent 前失效：只删除对应 owner-scoped 派生 cache，原子清理 receipt 并回到 `QUEUED`，再按现行 Asset 校验、解析和打包流程重建一次；兼容 receipt 直接续传，不重复 OCR/download/hash/package。没有新增 Server migration 或 OpenAPI shape；真实 Tauri 重启、Server/MinIO PUT/complete/indexing 和 `1.pdf` GUI retry 仍是待完成的业务验收步骤。

### PC 本地优先同步（本地 schema v6，2026-09-04）

- `local_mutations` 新增 `in_flight_at`、`remote_payload`、`remote_version`；状态为 `pending`、`inflight`、`applied`、`rejected`、`conflict` 或 `error`。未解决的知识块更新保留本机投影，`remote_*` 记录最新已知的云端版本及墓碑。明确采用云端或用新 ID 重试后，原请求以 `rejected` 归档，保留其请求 ID、基准版本和载荷。知识块删除收到明确拒绝时，在无其他未结算写入的情况下以服务端当前记录恢复投影，或在确认记录不存在时保留墓碑。
- Subject、Source、KnowledgeBlock、Task、Relation 的普通 CREATE/UPDATE/DELETE 必须在同一 SQLite 事务（浏览器 fallback 为同一序列化状态提交）内同时写入 `local_resource_records` 和 immutable outbox mutation。调用方只有在该本地提交成功后才更新内存 UI；失败须抛回调用方。
- 普通写入以资源为单位领取队首。首次领取把状态保存为 `inflight`，同时移除 `payload` 内仅供本机使用的 `_localCrudPredecessor`。该字段的存在证明 `pending` 命令从未领取，其值为空或为直接前驱 ID。进程中断、失去响应或结算失败后，`inflight` 原样重放。已领取项不再合并。既有无标记的 `pending` 或 `inflight` 保留已存 ID、基版本和业务载荷；旧实现若已改写服务端记过的请求，重放按现有指纹规则保留拒绝。字段复用现有 JSON，历史队列不批量改写。
- push 只首次结算已领取且资源、操作与 ID 都匹配的回执。SQLite 事务或浏览器同一次状态提交同时保存回执、核对较新投影和未解决写入。成功回执推进明确引用该前驱且仍未领取、基版本匹配的后继，保留乐观内容。编辑晚于回执取得写边界时，仅在当前已同步投影的内容和版本完全匹配本机同资源的成功回执、且该回执的原基版本等于编辑捕获的版本时承接该版本。仍有 `pending`、`inflight`、`conflict` 或 `error` 时，push、pull 与 snapshot 保留本地编辑内容。
- cursor pull 对一个资源在同一 page 的多条记录仅应用最后一条；服务端 tombstone 仅在该资源没有未解决本地 mutation 时写入。普通资源列表 API 不参与 PC Store 的缓存刷新。

### PC 专注与 Overview 同步扩展（本地 schema v10/v11，2026-10-01）

以现有 v9 为起点追加表；保留 ai_overview_cache、核心资源副本、旧备份及原 mutation。重复初始化使用既有幂等建表流程，不根据过时文档回退 schema。

Tauri 初始化在 SQL 插件加载固定 `sqlite:auralis.db` 后、执行 PRAGMA/schema/业务查询前，调用 `initialize_local_database_pool` 固定单连接池（max/min 1，无正常 idle/lifetime 回收）。与现有 JS 串行队列共同保证跨插件调用的 BEGIN/COMMIT 连接一致性；native snapshot 仍使用其独立真实事务。没有新增依赖或修改数据库路径。

桌面启动要求加载、连接池、PRAGMA 和 schema 检查全部成功。任一步失败均向启动页报告，失败结果允许手动重试；原生资产整理仅使用初始化成功后的 SQLite 索引。PC Web 的 localStorage 存储用于浏览器环境。

- v10 `pomodoro_timer_state` 以 `(user_id,device_id)` 为主键保存 state_json/updated_at，包括阶段、时长、累计运行时间、当前开始时间及稳定 clientSessionId/taskId。暂停不累计，重载按时间戳恢复，路由切换不拥有或销毁计时器。
- v10 `pomodoro_focus_sessions` 以 `(user_id,device_id,client_session_id)` 为主键保存最终时段、实际秒数、自然完成标记和 pending/synced。阶段状态与最终事件同事务保存；ACK 后保留 synced 本机历史，供本地日期的今日卡统计。Profile 只用服务器历史总量，不盲目加 pending，避免响应丢失导致重复显示。
- v11 `overview_sync_states` 以 owner/device/scope/revision 为主键保存服务器整体与分项版本、分项 manifest/fingerprint；客户端 FILE 对应服务端 SOURCE。
- v11 `overview_sync_outbox` 以 owner/device/client_write_id 为主键，保存 intent_json、可空 request_json、状态及安全错误。状态为 PREPARED/PENDING/INFLIGHT/CONFLICT/ERROR/STALE。完整成功 cache 与 intent 同事务落地；普通新候选初始为 PREPARED，已有未解决冲突时新候选仍为 CONFLICT。取得 baseline 后 HTTP body 只固化一次，超时或本地 ACK 失败原样重放；终端服务错误为 ERROR，新明确候选可替代旧 ERROR。候选冲突不能被后台 GET 或普通重新生成/保存绕过，须显式选择本机上传或采用远端。
- 历史完整 READY cache 可作为 LEGACY_SEED；远端已有成果时采用远端，不能用旧 seed 覆盖它。新生成和手动编辑与旧 seed 区分。失败/半成品不 seed，Source revision/删除或 Subject 当前输入变化使迟到候选失效。
- 端侧 FILE/SUBJECT 删除在首个异步操作前建立 owner/device/scope 删除生命周期围栏；远端请求捕获开始时 generation token，install/complete 在串行写边界内复核。删除失败只能释放自身 ticket，不能释放更新的删除；删除开始至完成期间旧活动投影不能重新激活。成功删除后仅显式恢复或当前活动、未删除且无未解决 DELETE 的恢复投影可以重新激活；旧 generation 响应仍拒绝，不影响其他 owner/scope。该围栏为进程内生命周期状态，不新增持久化表或扩展 core Sync 数据结构。
- Source DELETE 提交成功后才移除内存投影、discard Overview cache/outbox 和清理 parser；预提交失败保留可恢复的本地资料和未同步候选。Subject 父墓碑已持久化后，即使子级/Overview 清理失败也保持删除围栏，由既有 reconcile 重试；不得因清理异常把已删除 scope 改回活动。
- 拒绝 Subject DELETE 后的权威 snapshot 修复期间（resetRequired），不得依据旧 Source tombstone 终结可恢复 DRAFT 或删除其本地资产；清理边界须复核当前投影。本地尚未上传的 DRAFT 在恢复活动 Subject 后由既有 coordinator 重建，即使服务器 sources 为空也应保留，不能伪造远端 Source。

SQLite 自动测试与浏览器 fallback 验证不能证明真实 Tauri 重启迁移；具体命令和边界见实施计划。

2026-10-19 Overview M2：PC 本地 schema v13 为 `ai_overview_cache` 增加可空 `outline_identity_json`、`outline_identity_input_json`、`outline_provenance_json`、`outline_provenance_input_json` 与默认 0 的 `identity_ready`。这是端侧派生缓存/outbox metadata，不进入五类核心 Sync 资源或 mutation schema；旧 cache 不会被伪造身份初始化。M2 SQLite/序列化 focused evidence 已完成；实际 Tauri 在用数据库升级仍待现场验收。

### PC AI 总览派生缓存（本地 schema v7，2026-09-10）

- PC 本地 SQLite 新增 `ai_overview_cache`，主键为 `(user_id, device_id, scope_type, scope_id, revision_key)`；`device_id` 仍表示 `serverDeviceId`。该表保存 AI 生成的大纲、总结、生成时间、输入指纹和安全失败摘要，不进入 `local_resource_records`、`local_mutations` 或核心 Sync。2026-10-01 起，完整成功成果通过独立 Overview 接口与 Server 结果表对账；失败摘要仍只在本机。
- `scope_type=FILE` 时 `revision_key` 是非空 Source `ingestionRevision`；`scope_type=SUBJECT` 时固定为 `subject-v1`。数据库 CHECK 与 repository 共同约束该关系，避免把旧文件 revision 误读为当前学科结果。
- `OUTLINE` 与 `SUMMARY` 分项成功时只替换对应 JSON 和时间；失败只更新 `status/error_code/error_detail`，已有成功内容继续保留。浏览器 fallback 使用 `auralis:v1:overviews:<userId>:<serverDeviceId>`，并对缓存记录和嵌套 JSON 做结构校验，损坏数据统一报告 `OVERVIEW_CACHE_CORRUPT`。
- 学科总览的 `input_fingerprint` 由参与文件的 Source ID、ingestion revision、大纲和总结规范化排序后计算 SHA-256，用于识别本地资料变化；它是本地生成输入判定；远端 Subject manifest fingerprint 另按 API 契约计算，不与本地内容 hash 互换。

内存 SQLite 与浏览器 fallback 已覆盖 owner/device/revision 隔离、分项替换、失败保留、并发保存/删除、损坏 JSON 和 fingerprint 稳定性。真实 Tauri SQLite v6→v7 重启升级与双账号 GUI 仍待人工验收。

### PC Local Asset Store（本地 schema v8，2026-09-16）

- `local_asset_files` 以 `(user_id, device_id, local_asset_id)` 为主键，保存可空 `server_asset_id`、受管 `relative_path`、原文件名、MIME、字节数、SHA-256、`STAGING | READY_LOCAL | SYNCING | SYNCED | SYNC_FAILED | CORRUPT | DELETING` 状态和本地审计时间。绝对路径只由 native resolve 临时返回，不进入 SQLite。
- `local_asset_sync_jobs` 保存 owner/device/local Asset 作用域的持久同步阶段、attempt、`next_retry_at`、可空 `server_asset_id` 与安全错误摘要；partial unique index 保证每个 Asset 只有一个未 `SYNCED` 任务。阶段为 `PENDING | CREATING_REMOTE_ASSET | UPLOADING | COMPLETING_REMOTE_ASSET | BINDING_SOURCE | SYNCED | FAILED`。
- `local_source_drafts` 以 `(user_id, device_id, local_source_id)` 为主键，保存 `local_asset_id`、Subject、标题、`local_content_revision`、可空服务端 Source/revision 映射及草稿状态。它只承载 Asset READY 前的离线 Source 门禁，不替代 `local_resource_records` 和 `local_mutations`。
- `localAssetId` 是本地稳定 UUID，并直接作为 Server upload intent 的 `clientImportId`；`localContentRevision` 与服务端只读 `ingestionRevision` 不互换。
- v8 初始化继续使用 `CREATE ... IF NOT EXISTS` 和单一版本记录，保留 v2-v7 所有表。自动测试覆盖 clean init、v7→v8 数据保留、重复初始化、owner/device 隔离、状态 CHECK、单活任务、Repository 状态机和浏览器 fallback；真实 Tauri 重启升级仍需人工验收。

| 字段 | 语义 |
| --- | --- |
| `job_id` | 客户端任务稳定 ID，主键 |
| `user_id` / `device_id`（serverDeviceId） | 本地副本隔离边界 |
| `source_id` / `ingestion_revision` | Source 版本去重键，revision 为非空服务端 UUID 文本 |
| `phase` | `QUEUED`、`DOWNLOADING_SOURCE`、`EXTRACTING`、`OCR_RUNNING`、`PACKAGING`、`UPLOADING`、`SERVER_VALIDATING`、`SERVER_INDEXING`、`READY`、`FAILED_LOCAL`、`FAILED_SERVER`、`PAUSED_NETWORK` |
| `attempt` | 自动/人工重试次数，非负 |
| `checkpoint_page` / `checkpoint_ordinal` / `checkpoint_json` | 解析与打包断点；状态和断点由同一 UPDATE 原子写入 |
| `payload_cache_id` / `payload_receipt_json` | 加密 payload cache 标识及可恢复上传所需的非敏感 receipt 元数据；不含正文、签名 URL 或 headers |
| `error_code` / `error_detail` | 安全失败摘要 |

`payload_receipt_json` 中的 `payloadBytes` 与 `payloadSha256` 以 `open_decrypted_reader` 实际输出的 gzip payload 为准；`encryptedBytes` 仅表示本地加密 envelope 文件大小，不可用于服务端 upload intent 的 `sizeBytes` 或 PUT `Content-Length`。历史 receipt 若 `payloadBytes == encryptedBytes`，PC 恢复上传前通过 owner/device/source/job/revision 作用域的 native cache reader 重新计算 payload size/hash，不改变 schema 版本，也不重新执行 OCR 或打包。

浏览器 fallback 使用 `auralis:v5:document-jobs:<user>:<serverDeviceId>` 独立 namespace，并从 v4/v3 namespace 复制任务；任务不复用业务资源 JSON。v5 migration、数字 revision 迁移、receipt round-trip、状态机和 SQLite/浏览器 repository 已有定向自动测试，真实 Tauri SQLite 升级仍需 R2 验收。

### Mobile R4 本地副本边界（2026-08-20）

- `localDataScope.ts` 将当前 `userId:serverDeviceId` 映射为稳定 scope；H5 表键为 `auralis:local:<scope>:<table>`，原生 SQLite 使用 `_doc/auralis_<scope>.db`，Pomodoro 今日计数使用同一 scope 前缀，切换账号不会打开另一账号的活动副本。
- 本地 mutation 使用独立 `clientMutationId`，push 映射到冻结的 `resourceType/mutationType/baseVersion/payload`；cursor 元数据带 userId/serverDeviceId，冲突或拒绝结果保留 pending mutation。`resetRequired` 先取得完整 snapshot，再为同一用户/设备切换到新的 reset generation scope 并重建，旧一代不在中途删除。
- 用户已明确授权删除旧库；`legacyDataPurge.ts` 在认证会话建立后一次性移除旧 H5 `h5_db_*` 业务键，或删除旧 `_doc/auralis.db` 内的业务表，并写入完成标记。新隔离库和 Tablet feature-flag 本地笔记边界不因该清理扩大到云同步。
- 自动证据覆盖 scope 隔离、协议映射、静态旧协议扫描与双构建；真实原生 SQLite 升级、双账号/双设备、冲突选择和 snapshot reset 仍需设备联调。

Tablet NoteDocument 的 pages、strokes、snapshot、viewport、background 和二进制资源仍属于端侧专有数据，不进入本阶段 Server 表。

## 旧 Server 事实

旧 Server 的程序化 DbMigrationConfig 与 V2__add_encrypted_payload.sql 混用，存在 task_block.position 的 DDL/Entity 漂移、BlockRelation 缺少直接 userId、统一 Result 和旧 sync_version/is_deleted 语义。旧表、DDL、encryptedPayload、Milvus 和 Redis 不作为新 schema 的输入。

## 迁移状态

阶段 1 已创建 `V1__identity_schema.sql`，阶段 2A 已新增 `V2__core_domain_schema.sql`，阶段 2B 已新增 `V3__source_asset_relation_schema.sql`，阶段 3/4 已新增 `V4__sync_schema.sql`、`V5__review_stats_realtime_schema.sql`、`V6__sync_atomicity_and_cursor_high_water.sql` 和 `V7__task_completion_timestamp.sql`；阶段 5/R1 已新增 `V8`–`V14`，PC Tauri ParsedDocument S1 已新增 `V15`。迁移在 H2 PostgreSQL mode 和 PostgreSQL 17/pgvector 容器的空库中验证 Flyway version `1→...→14` 的既有基线；V15 的 H2 clean/upgrade 验证已通过，PostgreSQL upgrade 仍受本机 Docker 不可用阻断。迁移只针对干净新数据库，不接管旧 schema，也不提供旧数据迁移或回滚到旧 schema 的脚本。

阶段 3/4 审核后验证边界：`Auralis-Server\mvnw.cmd -B -ntp clean test` 通过 69 个自动测试；PostgreSQL 17/pgvector、Testcontainers、Docker、真实 MinIO、双设备和生产迁移演练仍未声称通过。R3 的 OpenAPI/SDK 只冻结 HTTP DTO、字段和游标/版本冲突策略，不改变数据库 schema 或端侧旧表迁移边界。

## 阶段 5 AI/RAG schema（V8–V14，2026-08-20）

- `V8__ai_rag_schema.sql` 新增 `ai_credentials`、`ingestion_jobs`、`source_chunks`、`conversations`、`messages`。所有表均保存 `user_id` 或可通过会话/Source 追溯用户，并建立用户/资源外键和查询索引。
- `ai_credentials` 按 `(user_id, provider)` 唯一；API key 只保存 AES-GCM 生成的 `api_key_ciphertext` 和 `key_version`，数据库不保存明文 key。Provider 当前约束为 `DEEPSEEK`、`OPENAI_COMPATIBLE`、`SILICONFLOW`。
- 用户 AI 设置自 2026-09-25 起只管理聊天 Provider。`V45__allow_null_credential_embedding_model.sql` 移除 `ai_credentials.embedding_model` 的 `NOT NULL` 约束，保留历史列和原值。现行 ORM 省略该列，更新保留已有值，新建凭据时该列为 NULL。入库和检索使用服务端独立的 Embedding 配置。
- `ingestion_jobs` 保存 Source ingestion 状态、attempt、lease、错误安全摘要及开始/完成时间；当前状态约束为 `PENDING`、`PARSING`、`INDEXING`、`READY`、`FAILED`。worker 通过 `PESSIMISTIC_WRITE` claim-next 选择最早任务，`PARSING/INDEXING` 的过期 lease 可恢复；达到最大 attempt 后进入 `FAILED`，当前不新增 schema 列。
- 2026-10-10：embedding 分批前/后可在短事务中续租原 claim；锁后核对 job/user/source/generation/revision/ParsedDocument 身份、attempt、活动状态与新鲜 Clock 下尚未过期的 lease。新期限按锁后时间加原租期计算，不能续活过期或已被新 attempt 接管的任务。失去 claim 的旧 worker 不写新 attempt 的失败/完成状态；全部批次有效后才进入既有 fenced generation 原子提交。复用现有字段、索引与约束，没有新增 schema/migration。
- `source_chunks` 保存 ordinal、正文、SHA-256、字符偏移、兼容性 `embedding_json`、`generation` 和 `active`；唯一键为 `(user_id, source_id, generation, ordinal)`。embedding 业务校验固定为 1024 个有限浮点数。
- `conversations` 支持用户隔离和软删除；`messages` 保存 `message_sequence`、`role`、`status`、正文、模型和安全错误元数据，按 `(conversation_id, message_sequence)` 唯一；USER 消息可保存 `client_request_id`，按 `(user_id, client_request_id)` 唯一用于安全重试。
- Chat 引用保存在 `chat_runs.request_context_json` 的顶层 `selectionText`，存储上独立于 USER 消息正文和引用证据；组装当前及历史模型上下文时，与所属轮次的问题合为一条 USER 消息。历史轮按 `user_message_id` 关联 run，回答和工具证据分别取该 run 的 `current_reply_message_id` 与 `current_attempt_id`；旧 attempt 记录保留。现行范围对象 `readingContext` 只保存资料范围。本次调整不改变表结构或迁移历史数据。
- `V9__postgres_vector_support.java` 仅在 PostgreSQL 增加 `vector` 扩展、`source_chunks.embedding vector(1024)` 和 HNSW cosine 索引；H2 使用 V8 的 JSON 兼容列，便于自动测试。
- `V10__source_chunk_generation_cutover.sql` 增加 `ingestion_jobs.generation`、`source_chunks.generation/active`、新 generation 唯一约束和活动 chunk 查询索引。新 generation 写入完成后才切换 active，失败由事务回滚并保留旧 generation。
- `V11__backfill_postgres_vectors.java` 仅在 PostgreSQL 将历史 `embedding_json` 回填到 vector 列，避免升级后旧 chunk 因 vector 为空而无法检索。
- `V12__ai_message_client_request_id.sql` 为 `messages` 增加可空 `client_request_id VARCHAR(128)`，并建立 `(user_id, client_request_id)` 唯一约束和查询索引；只有 USER 请求消息写入该键，重试通过用户隔离的键回放既有 assistant 结果。
- `V13__conversation_concurrency_control.sql` 为 `conversations` 增加 `version` 和 `next_message_sequence`，并从既有 messages 回填序号计数器；ConversationEntity 使用 `@Version`，消息追加在会话行写锁下递增计数器，避免并发 `max + 1` 竞争窗口。
- `V14__ai_request_reservation.sql` 为 `conversations` 增加可空 `client_request_id` 及 `(user_id, client_request_id)` 唯一约束；为 `messages` 增加可空 `reply_to_message_id` 自关联和查询索引。前者支持离线会话创建重试，后者保证重复 AI 请求仅回放该 USER 消息的 assistant 结果。
- PostgreSQL 写入通过 JDBC 将 1024 维 embedding 同时写入 JSON 兼容列和 vector 列；检索通过带 `user_id`、`active`、未删除 Source 过滤的 pgvector cosine SQL，并由 HNSW 索引支持排序。H2 继续使用活动 generation 的 JSON cosine fallback。

阶段 5/R1 schema 验证：H2 PostgreSQL mode 与默认 Testcontainers PostgreSQL 17/pgvector 验证 Flyway V1→V14、JPA `ddl-auto=validate`；R2 clean/upgrade 两类输入验证 V8 历史 `embedding_json` 在 V9/V11 后得到 `vector`、HNSW 索引和回填结果。R1-04/本轮并发测试验证消息幂等键、失败/断流状态、同请求仅一次 USER 保留、会话恢复键和精确 assistant 关联。

## V30 AI Usage Guard B（2026-10-11，代码、相关自动验证与只读审查通过；未部署）

- `V30__ai_usage_guard.sql` 新增非同步派生账本 `ai_usage_locks` 和 `ai_usage_reservations`；不进入 Sync snapshot、change log 或客户端 mutation。Provider I/O 不持有这些表的事务锁；准入/预留/派发标记先锁真实 ACTIVE users 行再按 GLOBAL → USER → TASK 获取账本锁，续租/结算不反向取 users 锁。真实 PostgreSQL 删除/停用并发先复现死锁再验证最小锁序修复，停用后派发拒绝为现行 UNAUTHENTICATED。派发标记是数据库授权点，不能保证授权后的远端请求被撤销。
- `ai_usage_locks.scope_key` 为主键，scope_type 只接受 GLOBAL/USER/TASK；GLOBAL 单例没有 user_id，USER/TASK 保存归属、feature、task_key_hash、current_task_id、owner_id 和 lease_until。原始 task key 不落库，任务锁贯穿一整个业务任务的多次 Provider 调用。
- `ai_usage_reservations` 每次调用一行，包含不透明 task_id、feature/stage/provider/model、estimated_input_tokens、reserved_output_tokens、可空 actual_input_tokens/actual_output_tokens、charged_tokens、request_dispatched、owner_id、lease_until、created_at/settled_at 和安全 error_code。state 只接受 RESERVED/COMPLETED/FAILED/RELEASED/EXPIRED，各 token 非负；actual 的 NULL 表示缺失，不能写零冒充缺失。
- USER/TASK 锁的用户外键 `ON DELETE CASCADE`；reservation.user_id 可空，用户外键 `ON DELETE SET NULL`。删除账号解除归属，保留匿名已结算或未知派发的计额度调用参与系统每日预算，防止删号返还系统额度；账本不保存正文或凭据。已删除用户不能发起新的用户任务，匿名过期预留依保守结算规则回收。
- reservation 索引覆盖 `(state,lease_until)`、`(user_id,created_at)`、系统窗口及 `(task_id,created_at)`；UTC 小时/日窗口以调用预留的 created_at 归属，计额度调用的已结算消耗与在途预留共同参与拒绝判定。本人额度 DTO 只读该用户聚合，不公开匿名/系统/其他用户数值。
- 2026-10-12 统计策略：`INGESTION_EMBEDDING` / `RETRIEVAL_EMBEDDING` 的新旧 reservation 不参与上述用户 / 系统 token 窗口或本人 charged / reserved / remaining。表内 estimated / actual / charged 仍保留为每次调用审计，NULL 不改零，无回填、删除、DDL 或新 migration；task 资源预算 / 调用次数及有效 RESERVED 并发统计仍包含 embedding。详见 [策略计划](../plans/2026-10-12-embedding-quota-exemption-and-test-limits.md)。
- `ingestion_jobs` 新增可空 `next_attempt_at`、非负 `failure_count` 和 `(status,next_attempt_at,created_at)` 到期领取索引。attempt_count 继续作为单调 claim 身份；配额延期不增加 failure_count。升级将 PENDING/FAILED 的历史 attempt_count 计为失败次数，PARSING/INDEXING/READY 计为 `GREATEST(attempt_count-1,0)`，避免重置既有普通重试预算。
- 已完成 embedding 批次复用本 job + generation 的 inactive `source_chunks`；读取/写入受 user/source/revision/ParsedDocument、ordinal/offset/内容 hash 与有效 claim 绑定，partial generation 不可检索。最终完整提交仍在既有 fenced 事务中一次切换 active，旧成功 generation 在此之前保留。

本节取代旧阶段记录中“当前不新增 schema 列”的现行含义。H2 迁移及历史失败次数回填 3/3、真实 PostgreSQL V1→V30 clean、V29→V30 upgrade 1/1、真实 driver/账户锁序 4/4 及检查点/窗口续做通过。升级测试先在 V29 插入 attempt_count=3 的 PENDING/PARSING/READY/FAILED，随后仅应用 V30，验证 failure_count=3/2/2/3 和新账本读写。均为任务独占临时数据库，不是业务库或生产升级验收；最终命令与审查证据见 [B 实施计划](../plans/2026-10-10-ai-usage-guard-b.md)。

## PC Tauri ParsedDocument 目标数据契约（2026-08-23，2026-08-24 复核修订，V15/S1–S6 已实现，联调与验收待完成）

本节登记 V15 迁移及 S1–S6、C4/C5 已落地的数据行为；真实 PostgreSQL 升级复核和人工业务验收仍待完成。完整设计见 [PC Tauri AI 辅助阅读全流程设计](../design/2026-08-23-pc-tauri-ai-assisted-reading-design.md)。

- `sources` 新增服务端生成的 `ingestion_revision UUID`。FILE Source 创建、Asset 替换或需要重新端侧解析时轮换 revision；TEXT 的正文或 URL 的来源地址等解析输入变更也轮换 revision。相同输入的普通重新分块/Embedding 复用当前 revision；FILE 继续复用最新兼容 ParsedDocument。Source DTO/同步快照只读暴露该值，客户端 mutation 不能覆盖。
- 新增非同步派生表 `parsed_documents`，保存 `id`、`user_id`、`source_id`、`ingestion_revision`、当前 Asset SHA-256、schema/parser/normalization/OCR model 版本、私有 object key、payload SHA-256、size、status、ingestion generation、`object_deleted_at`、创建和接收时间。状态至少为 `UPLOADING`、`VALIDATING`、`ACCEPTED`、`REJECTED`、`SUPERSEDED`；该表不进入 change log、snapshot 或普通客户端 mutation。
- complete 在 owner-scoped Source 行锁内执行“首个有效结果胜出”。同 revision + payload hash 重放幂等，不同 payload 不能覆盖已接受结果；Source 删除、Asset 替换或 revision 轮换使迟到结果失效。迁移和服务测试必须证明并发 complete 只创建一个 indexing job。
- `ingestion_jobs` 新增可空 `parsed_document_id` 与 `ingestion_revision`。TEXT/URL Source 与 job 同事务持久化；恢复处理中 Source 时按当前 revision 补建或复用活跃 job；FILE Source 只有在 ParsedDocument 校验通过后进入该 generation 的 INDEXING。新 generation 完整写入并切换 active 前，旧 READY chunks 保持有效。同一 revision 的活跃 job 可复用，不同 revision 或终态重跑创建新 job ID/generation；worker 提交时以 job ID、revision、attempt 和锁后有效 lease 拒绝迟到结果。`ingestion_jobs.status` 继续只使用现有 `PENDING/PARSING/INDEXING/READY/FAILED`，本轮无迁移。
- `sources.ingestion_status` 目标扩展 `AWAITING_CLIENT` 与 `VALIDATING`；两者均适配现有 `VARCHAR(16)`，但必须替换数据库 CHECK 和 Java enum。现有 `PENDING/PARSING/INDEXING/READY/FAILED` 继续服务 TEXT/URL 和兼容路径。既有 READY FILE 且有活动 chunks 的记录保持 READY；未 READY FILE 分配 revision 后迁移为 `AWAITING_CLIENT`。
- `assets.sha256` 为兼容既有上传仍可为空，但 ParsedDocument 接受后必须非空且经过原对象流式校验；并发回填使用锁或条件更新，不能 last-write-wins。
- Task 14（2026-09-09）：Source ingestion 状态及安全失败诊断的实际变化由既有 `ResourceChangedEvent(SOURCE, UPDATE)` 链路写入 change log；相同三元组重复调用不增加 Source version 或同步记录。该变化不新增字段、迁移或 schema。
- ParsedDocument complete 接受阶段与 Source `INDEXING`、ingestion job enqueue 和同步事件保持单事务原子性；接受后异常不会留下部分成功状态，只有校验尚未接受时的失败才持久化 `REJECTED`。
- 最新成功 ParsedDocument 作为重新分块和重新 Embedding 的派生权威保留；成功代切换后异步删除旧对象，并按下述保留期清理旧元数据。Source 删除或 Asset 替换必须使迟到 generation 失效。
- 同 revision 重放产生的多余对象、`REJECTED` 和超时 `UPLOADING` 对象必须由清理任务删除；新 revision READY 后旧对象删除并写 `object_deleted_at`，`SUPERSEDED` 元数据至少保留 30 天后再清理。
- V16 增加 `conversations.purpose`、可空 `source_id`、Source 外键和相关索引。协议 1 新会话为 `GENERAL` 且 `source_id` 为空，资料范围以 V44 会话绑定为准。历史 `READING_SESSION` 行及字段保留，普通列表排除这些会话。按已知 ID 查询详情时，服务端校验 owner、会话活动状态及会话和消息的 Chat 协议版本。旧的 24 小时阅读会话清理服务已移除。
- PC 本地新增按 `userId:serverDeviceId` 隔离的 `document_processing_jobs` 元数据，并保存 `ingestion_revision`。SQLite 只保存任务 phase、页级检查点、哈希、parser/model 版本、重试和安全错误；正文使用现有 OS keyring 主密钥派生的分块 AES-256-GCM envelope 临时保存，AAD 绑定 user/serverDevice/source/job/revision/schema。服务端确认接收、退出登录、Source 删除或 Asset 替换后清理；不新增第二套独立 DPAPI 密钥。

S1 已通过追加式 `V15__tauri_parsed_document_schema.sql` 落地上述数据库边界：`sources.ingestion_revision` 为服务端只读 UUID（历史行以 Source id 稳定回填，默认零 UUID 仅用于兼容尚未切换的旧写入路径）；`parsed_documents` 保存 schema/parser/normalization/OCR model、Asset/payload/plain-text SHA、对象 key、状态、generation 和生命周期时间；`ingestion_jobs` 增加可空 `parsed_document_id` 与 `ingestion_revision`。`parsed_documents` 没有 change log、snapshot 或 inbound mutation 外键。S2 已让 SourceEntity/SourceView 只读承载该 revision，并按 FILE/TEXT/URL 分流状态和事件；S3 已实现 owner-scoped upload-intent 与 `UPLOADING` 元数据落库，私有 object key 不由客户端提供；S4 已加入服务端有界流式 payload 校验和 legacy Asset 空 SHA 的条件回填；S5 已在 Source 行锁内实现 complete 首胜、同 payload 幂等、冲突/过期拒绝和唯一 revision indexing job 关联；S6 已完成 accepted ParsedDocument block reader、generation/revision 旧任务隔离、兼容 reingest 复用、旧 revision `SUPERSEDED` 标记和过期 payload 对象清理，保留 ParsedDocument 审计行。H2 clean/upgrade schema 4/4、Source/Ai ingestion 定向回归 11/11、`ParsedDocumentControllerTests` 3/3、`ParsedDocumentValidatorTests` 4/4、`AssetShaBackfillTests` 2/2、`ParsedDocumentCompleteTests` 3/3、S6 定向 21/21 通过，覆盖 READY FILE 与活动 chunk 保留、旧非 READY FILE 迁移为 `AWAITING_CLIENT`、owner/stale revision/hash/schema/size 校验、gzip bomb/UTF-8/ordinal/hash、并发 SHA 回填、complete 首胜、worker block 索引/revision fencing、generation 失败保护、兼容 reingest 和 cleanup；PostgreSQL upgrade 测试已补充但本机无 Docker，尚未取得容器执行证据。



### 2026-10-23 M5.5 private execution descriptor cache identity

- 实现为私有 execution descriptor JSON 增加 `globalRoutingFingerprint`，并提升 adaptive algorithm identity，使新算法不复用无法证明兼容的旧格式 checkpoint。无需新增数据库列或 migration；不转换或回填既有数据，既有 generation plan/node/checkpoint 容器承载私有数据。
- donor 资格仍要求当前 attempt 有真实 dispatched reservation journal，并保持 generation/plan/node/checkpoint input 身份、checkpoint hash/schema/期限及来源/coverage/shape 校验。
- 定向 Maven 验证为 Coordinator+Adaptive 56/56、exit 0；后续 Service acceptance 2/2、exit 0。未做数据库实例、migration 或生产环境验收；唯一只读 reviewer B0/I0/O0。



### 2026-10-23 Overview generation result/checkpoint cleanup

- 实现只回收既有 payload，不增删改 schema/migration/API/config。只清非 ACTIVE generation 的 SUCCESS result（自身 result_expires_at 已过期），以及 checkpoint.created_at 至少 14 天的 checkpoint。
- 每批以确定性、至多 100 个 generation 父行锁定并使用 FOR UPDATE SKIP LOCKED 与 takeover 协调。保留 metadata/request mapping/budget/plan/node/call/reservation/unknown hold 与 generation lineage；不修改 usage reservation。
- H2 PostgreSQL mode 双事务测试验证锁竞争边界；没有真实 PostgreSQL 集成证据。14 天 checkpoint 读取有效期未变；物理清理按批次运行，不保证到期即刻清除。sole reviewer B0/I0/O0。

### 2026-10-23 Overview M5 reusable cache 与 private payload retention

- V38 新增单行 overview_cache_capacity_guard（id=1）用于串行化 cache admission。应用配置默认 256 MiB / 1000 generations：AURALIS_AI_OVERVIEW_CACHE_MAX_BYTES、AURALIS_AI_OVERVIEW_CACHE_MAX_GENERATIONS。只统计 standalone、未由 durable job pin 的 SUCCESS generation result 与 checkpoint payload UTF-8 bytes/rows；每次最多处理 100 个 eviction candidates。此规则不构成整个数据库容量上限。
- Durable-job generation、job request/manifest/candidate、execution journal 与 V37 publication/source snapshots 不计入该 reusable-cache cap。已完成 job 的 request/manifest/candidate 及不再被其它仍保留 job 需要的 SUCCESS result/checkpoint/plan/node payload 在 14 天后通过有界 cleanup 清除；job/generation/plan/node/call/reservation、usage 与真实 recovery metadata 保留。TTL cleanup 分批调度，不保证期限到达时立即物理删除。
- Source/Subject revoke 按应用事务 fence jobs/generations/intents 并清除相应 raw-derived private copies。overview_write_receipts 保留 ID、client idempotency key 与 payload hash，响应 snapshot 替换为 revoked tombstone。正式 overview_results/receipt 不参加容量淘汰或普通 TTL；显式资源删除及 account hard-delete 沿现有清理和 FK cascade 路径处理。
- 隔离 PostgreSQL 17.11 account-deletion integration 1/1 通过：目标账号 Overview lineage 清除，同时另一 owner 数据、capacity guard 与 charged usage evidence 保留。M5 validation 的批次边界见 D 盘结案 handoff。

### 2026-10-29 Chat protocol 1 持久化差量（V42 源码候选，统一验证待执行）

- `conversations` 新增 `chat_protocol_version SMALLINT NULL`（仅 1）、`active_chat_run_id UUID NULL`（不设 FK，避免与 runs 建循环生命周期约束）、`chat_fence BIGINT NOT NULL DEFAULT 0 CHECK >= 0`。新 Chat conversation 写 version 1、`purpose=GENERAL`、`source_id=NULL`；owner+subject 的本地会话选择不持久为授权依据。旧行不回填。Chat list 可标记旧行不支持，detail 不读取旧消息正文或 fallback。
- `messages` 新增 `chat_protocol_version SMALLINT NULL`（仅 1）。新稳定 USER 和每个 attempt 的 ASSISTANT reply 写 1；`content` 是服务端公开有序 parts 的 Markdown 投影。结构 parts 与安全 tool trace 在 attempt 快照列，不写入同步/change-log。
- `chat_runs` 保存 `id,user_id,conversation_id,request_id,request_hash,request_context_json,action,user_message_id,current_attempt_id,current_reply_message_id,budget_task_id,status,fence_version,created_at,updated_at,completed_at`。request context 保存规范化 `action`、仅含 scope 的 `readingContext`、顶层 `selectionText` 及锁存的 `executionProfile={provider,chatModel,endpointHash}`；`endpointHash` 是规范化 endpoint 的 SHA-256，禁止保存明文凭据或 endpoint。`request_hash` 按现行 DTO 的规范化客户端 body 字段计算，排除独立 `requestId`、profile 和凭据。相同 requestId/body 的重放在解析当前 Provider 设置前命中。升级前含非空 `readingContext` 的旧原始 POST 可能因哈希差异返回 `CHAT_REQUEST_CONFLICT`。既有 request context、USER/回复和运行记录保留，状态查询和符合绑定条件的按 run 重试使用原记录。稳定 USER message 是唯一用户正文。`budget_task_id` 存 Guard 派生 ledger identity，逻辑稳定 run UUID 保存在 `id`。唯一键 `(user_id,request_id)`、`(user_message_id)`、`(id,user_id)`；FK 到 user/conversation/user message 均 `ON DELETE CASCADE`；索引 `(conversation_id,status,updated_at)`。
- `chat_attempts` 保存 `id,run_id,user_id,request_id,request_hash,attempt_no,status,worker_instance_id,fence_version,allocated_reply_message_id,reply_message_id,public_parts_json,tool_trace_json,last_sequence,cancel_requested_at,safe_error_code,private_tool_evidence_json,started_at,heartbeat_at,deadline_at,ended_at,created_at,updated_at`。`private_tool_evidence_json` 是仅供后续模型上下文使用的私有工具证据 JSON，默认 `[]`；不得映射到 status/detail/trace 或公共 DTO。`deadline_at` 在每个 attempt 接纳时冻结。唯一键 `(user_id,request_id)`、`(run_id,attempt_no)`、`allocated_reply_message_id`、`reply_message_id`、`(id,run_id,user_id)`；run/user 与已存在的 reply `messages` 具有 cascade FK。预分配 reply UUID 不建 FK；插入真实 ASSISTANT message 后才设置带 FK 的 `reply_message_id`。状态含 `PENDING/RUNNING/CANCEL_REQUESTED/COMPLETED/FAILED/CANCELLED/UNKNOWN`；索引 `(run_id,attempt_no)`、`(status,heartbeat_at)`。
- `chat_activities` 保存 `id,run_id,user_id,attempt_id,message_id,block_id,question_version,question_type,state,public_payload_json,private_reference_json,submission_id,answer_hash,answer_json,submission_user_message_id,reply_run_id,created_at,submitted_at`。公开题目与私有 reference 分列；仅公共 DTO mapper读 public payload。FK 覆盖 run/user、attempt/run/user、真实 reply `message_id`、提交 USER message 和关联 reply run；全部账号/会话/父记录 cascade。唯一键 `(attempt_id,block_id)`、`submission_id`、`reply_run_id`；索引 `(run_id,created_at)`。submission shape 与 question type/state 有 CHECK。
- 三表不进入 Sync snapshot、change log、client mutation 或通用 TTL。Conversation 用户删除仍软删；显式账号 hard-delete 现有 `DELETE messages` 会 cascade 删除相连 runs/attempts/activities，再删除 conversations，无需额外 SQL。Source 删除不级联 Chat 历史。V42 没有转换、回填或删除历史消息。
- 迁移源码在 `Auralis-Server/src/main/resources/db/migration/V42__chat_agent_runtime.sql`。retry 使用 run 中锁存的 provider/model/endpoint hash；配置变化时以 `CHAT_PROFILE_CHANGED` 拒绝新 attempt，credential rotation 不改变 profile identity。UNKNOWN 恢复为预分配的 assistant reply 写入 FAILED 消息及最后公开 snapshot，但保留 UNKNOWN run/attempt 状态和 Conversation slot。当前文档记录源码候选；H2/PostgreSQL migration、FK cascade、并发锁序和账号删除测试待统一后端验证。生产业务库未操作。

### 2026-11-05 Chat conversation reading scope（V44）

`V44__chat_conversation_reading_scope.sql` adds `conversations.chat_scope_state` (`LEGACY`, `UNBOUND`, `BOUND`, default `LEGACY`) and nullable `chat_scope_json`. Existing conversations remain `LEGACY` without inferred scope. New Chat conversations start `UNBOUND`; the first admitted user turn changes the row to `BOUND` in the same transaction as USER/run persistence. A JSON scope stores retrieval mode, subject/current source IDs, and normalized selected source IDs; owner-wide binding uses `BOUND` with JSON `NULL`. It excludes selection text and ingestion revision so each attempt can capture and validate current owner, subject, READY state, and source revisions. LEGACY history remains readable; new turn/retry admission returns `CHAT_SCOPE_CONFLICT` and requires a new conversation. No history is deleted or auto-converted.

### 2026-10-31 Chat 展示工具私有证据与 READY 快照（无新增 migration）

现有 `chat_attempts.private_tool_evidence_json` 保存 display tool 的实际 arguments、紧凑 tool result 与配对 reasoning（若有），用于下一模型轮次/历史折叠时重建合法 assistant tool-call/result 上下文。Activity READY 的公开 parts、tool trace、私有 evidence、message 与 activity 仍在现有事务中原子持久化；可选 reference 只写既有 `chat_activities.private_reference_json`。Display arguments 计入既有请求/证据容量限制；公开 parts 存规范化 component facts，不暴露 reference。没有新增表、列、migration、进度存储或旧历史转换；旧消息保持原样。

### 2026-10-29 Chat 私有工具证据（V43 migration 历史）

`V43__chat_private_tool_evidence.sql` 仅在 `chat_attempts` 增加 `private_tool_evidence_json TEXT NOT NULL DEFAULT '[]'`。内容包含工具调用/结果、当时 source revision，以及模型显式返回且与该 iteration 工具调用配对的可选 `reasoningContent`，用于后续模型上下文的协议恢复；reasoning 不进入公开消息、snapshot、status/detail、toolTrace、Sync 或客户端 DTO。当前 display tools 复用此列保存实际 arguments、紧凑结果与 reasoning；历史 evidence 没有 reasoning 时，投影为中性事实数据，不构造孤立 tool result 或伪造 reasoning。Chat display rewrite 没有新增数据库结构。V43 migration 尚未在业务 PostgreSQL 验证或部署。

### 2026-10-31 Chat display-tool public parts（无数据库迁移）

Steps、compare、roadmap、chart、quiz、question 的规范化公开 rows 在 `chat_attempts.public_parts_json` 保存，Markdown message content 是相同有序 parts 的确定性投影。Compare item 为 `{title,entries:[{label,text},...]}`。旧 marker-era 历史 parts/message 保留原样，不自动迁移；新渲染协议不提供旧格式转换。没有新增列、表、同步字段或 migration。

验证记录：focused backend suite 126/126，review B0/I0；受限全量排除 `IngestionBudgetCalibrationTests` 后 1036 tests/3F/2E/2S，exit 1，且 `-DskipTests package` exit 0。具体差异及 TLS fixture 限制见[当前状态](../current/Status.md)。未在业务数据库验证或操作。
