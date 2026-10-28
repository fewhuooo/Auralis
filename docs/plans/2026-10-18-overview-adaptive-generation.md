# 内容规模自适应总览实施计划

日期：2026-10-18（Asia/Hong_Kong）

状态：M1 核心后端源码、focused/full/package/Compose 自动门禁及唯一复审通过；未部署。M2 实现、PostgreSQL/SQLite 持久化、最终 OpenAPI/SDK、PC checks 与唯一复审完成；Backend full 首轮 723/1F/4E、PC R4 首轮 737/709/28 及 Mobile 两个既有类型错误继续单列，未宣称全量全绿。M3.1、M3.2、M3.3 各自源码、相关自动验证与唯一审查完成，均未部署；其历史 full 失败批次及定向复验结果分别见阶段计划。M3.4 源码、相关自动验证与唯一审查完成，未部署；run04 full 失败批次保留，后续受影响组定向复验闭合，未宣称 full suite 全绿。M4 Server 能力保留；M4 PC 新增交互按用户决定撤回，当前恢复原 Overview/SSE 流程并仅保留生成期间本机编辑保护，不作为待自动补齐项。回退后受影响检查与4个未过断言分批记录，不宣称全绿；未部署。M5 工程范围已闭环（各阶段证据见下文）；M6 真实 Provider/usage 校准、真实资料生成、内容质量和业务验收仍未完成。Overview trace 两次真实生成尝试均采集完整但结果失败，M6 尚未验收。最终 unused-compatibility cleanup 仍单独跟踪。详细范围见 [M3.3 计划](2026-10-19-overview-m33-background-jobs.md)、[M3.4 计划](2026-10-22-overview-m34-publication.md)及下方 M4 状态。

设计依据：[内容规模自适应总览设计](../design/2026-10-18-overview-adaptive-generation-design.md)。

2026-10-22 更新：M3.4 源码、相关自动验证与唯一审查已完成，未部署；run04 full 失败及受影响组定向复验边界见 [M3.4 计划](2026-10-22-overview-m34-publication.md)，不记作 full suite 全绿。M4 Server 能力保留；PC 新增交互已按用户决定撤回，恢复原入口/SSE 流程，仅保留生成期间编辑冲突保护。回退后检查与唯一 review 已完成但保留分批失败，不宣称全绿；此前隔离浏览器流程属于回退前历史。M5 cache/reuse、M6 真实 Provider/usage 校准、内容质量、部署及最终 unused-compatibility cleanup 仍 active。

## 目标与执行边界

交付原文清单→轻量索引→目录路由/容量规划→按小节聚拢原文生成→校验/恢复→程序装配/发布，并完成后台观察、原文定位、增量更新、统一计量和真实质量验收。

主 Agent 负责设计、计划、高风险边界和最终验收。普通实现、验证与唯一 reviewer 使用用户指定的 6-luna high。前端交付阶段按 AGENTS 的前端编排要求及用户届时有效的模型授权执行。

工作分支 `codex/overview-adaptive-generation` 从当前 HEAD 建立；保留当前全部未提交工作，不通过重置、重拉或覆盖制造干净环境。本轮证据基于编辑前逐文件快照，而非把所有 dirty diff 认作本轮产出。

全部测试、缓存、日志和隔离快照使用 `D:/Temp/auralis-overview-adaptive-20261018`。不研究 C 盘、不调用真实 Provider 或业务数据库、不部署、不修改凭据、不自动提交或推送。

## M1：可运行的后端核心生成链路

### 实施项

1. [x] 恢复现行实现、完整路线与交接；建立新分支，保护已有 dirty 工作树。
2. [x] 由主模型固化完整设计和分阶段计划，登记文档入口。
3. [x] 编辑前建立逐文件 baseline/manifest 和 D 盘进度记录。
4. [x] 引入默认 false 的 `overview-adaptive-generation-enabled` 配置与 Compose 透传；不修改其他部署拓扑。
5. [x] Source/Subject ALL、OUTLINE 接入原文→索引→路由→按节写作→装配的完整内部路径；SUMMARY 保持现行短摘要。
6. [x] 路由覆盖、未知 ID、单次真实 prompt、前置细分、结果容量和有限执行检查；adaptive inventory 合计 500 条 active raw row 上限（含空白），remaining+1 sentinel 在 identity/hash/provider 前拒绝超限，不静默截断输入或正文。
7. [x] 共用父 task、Gateway/Guard、凭据来源、期限与取消；独立 purpose/algorithm/input/profile 防止旧缓存误命中。
8. [x] Subject 读取选定当前 Source 原文，并将其输入身份纳入指纹与修订围栏；缺原文明确失败。
9. [x] 复用完整 JSON 校验、单次 repair、安全诊断与 checkpoint。保留成功单元；不把内部 checkpoint 暴露为正式部分结果。
10. [x] 增加有意义的合成回归，维护必要既有 fixture，避免镜像实现或重复验证。
11. [x] 全部编辑完成后统一验证一次；按失败归因修复，同一失败最多 3 次。
12. [x] 唯一 reviewer 只读检查本轮 baseline-relative 差量；仅修复 BLOCKER/IMPORTANT。
13. [x] 同步实际变化的 Backend、API 行为说明、Infrastructure、Status、Issues、Architecture、Changelog；记录源码/自动验证/运行验收的独立状态。

### 验证范围

- scoped diff/静态检查；新配置绑定和 Source/Subject 真正接线的定向测试。
- 核心 AI/运行配置变化完成后，一次隔离后端 full suite 与 package；使用任务专属 PostgreSQL，不能以 assumption skip 冒充数据库验收。
- Compose 只使用合成环境 render false/true，不能读取真实 `.env` 或展示密钥。
- 本轮无 public DTO、OpenAPI shape 或 DB migration 变化时，不重复 SDK/OpenAPI 生成或迁移门禁；实际扩展时再按变化验证。
- 不运行实际 Provider、GUI 或业务环境验收；配置默认 false，真实质量验收前不默认启用。

### M1 完成定义

开关启用时，两个现有服务入口能够运行新链路，详细正文由程序装配且不再进入最终全量重写；有效材料未分配、未知引用、超限或修订变化均明确失败。用量和恢复身份可追踪，配置默认行为保持，定向/full/package 与唯一 reviewer 有证据。没有已完成的后续阶段不得写成已实现。

## M2：稳定节点、内容版本与可信来源

2026-10-19 状态：Server/PC 源码与契约已完成；PG integration 4/4、TaskColor migration 6/6、PC M2 focused 27/27、OpenAPI 13/13、两端 SDK byte-identical、PC type-check/build、package 与唯一 reviewer B0/I0/O0。Backend full 首轮 723 tests/1F/4E/0S、PC R4 首轮 737/709/28；失败组定向闭合但两次 full 均未重跑成全绿。Mobile 保留两个既有 TS2339。未部署或完成真实 Provider/业务库/GUI 验收。证据：`D:/Temp/auralis-overview-m2-20261019/final-validation-report-attempt13.md`。

- 扩展章节/小节持久身份和内容版本，覆盖编辑、重排、重生成继承及旧节点被替代。
- 对齐学习计划的节点前置依赖，由一个身份契约提供能力，避免重复大纲模型；不在本阶段实现 Learning 业务。
- 从解析到结果保存 Source/revision/chunk/位置的可信 lineage；缺位置有明确粒度。
- 更新 API/DB/OpenAPI/SDK 和受影响 PC 数据边界；迁移编号执行时核对当前序列，不能把其他计划预留号当作空闲。
- 验收：身份与版本规则、来源修订、删除和账号隔离、原文位置可核对。

## M3：持久后台作业、结构化恢复与发布

### M3.1 有限层级目录规划（2026-10-19；源码、相关验证与唯一审查完成；未部署）

M3.1 的实施计划、验证与 review 证据见[有限层级目录规划计划](2026-10-19-overview-m3-hierarchical-planning.md)。小输入保持单次有界目录路径；不适配的聚合索引仅对 metadata 分层组织，恢复到原始 unit aliases 及其顺序后交给既有 writer 和 provenance。公共容量、500 raw row inventory、Guard、父任务、M2 metadata 和 checkpoint 边界不变。分层仍有明确层数、调用、节点和 prompt 限制；超限失败，不代表支持任意规模或语义无损。M3.2 后续为持久 writer plan/node 状态；worker、重连控制、未知调用对账及正式发布仍未交付。

2026-10-23 修复跟进：`ADAPTIVE_METADATA` 可能返回通用 schema 合法但冗余的顶层 summary；专属 null 规则与全局 ALL summary 规则冲突。仅该内部 purpose 在 Provider 结果和 checkpoint 读取时将 summary 规范化为 null，原有 metadata alias coverage/shape 校验继续执行。`ADAPTIVE_METADATA_ROUTE` 负责按 ALL/OUTLINE 生成公共 summary，writer/final summary 不进入该归一化。验证证据和范围见 Status 与本次 D 盘 handoff。

2026-10-24 已批准窄修复跟进：真实第 7 批主响应把合法 `summary` 置于已闭合根对象之外，形成 `<root>,"summary":<value>}`；这不是截断或预算问题。Validator 新增默认关闭且独立于 alias defer 的结构修复参数，仅 Service 的 `ADAPTIVE_INDEX` 主响应/JSON repair 开启。首次 `readTree` 失败后，严格解析无 summary 的首根和只含一个 summary 的 wrapper，消费到 EOF 并拒绝重复字段、额外根/值/尾部/括号；合并后重走全部现有校验和 summary 规范化。失败候选保持原解析失败语义。

`ADAPTIVE_INDEX` Provider JSON repair 改用专用 system instruction 与 userData requiredSchema/`expectedSummary:null`，不带 materials、公共 ALL 或原索引指令，保留不可信数据、不新增事实、授权 alias、locator 和现有数量/长度约束及一次上限。主索引 prompt/请求数据、通用算法版本、primary checkpoint key 和其它 purpose 不变；结构修复不新增 Provider 调用，trace 原响应与 validated output 分离。历史失败 trace 不直接采纳为 checkpoint，部署后旧失败批通常重新发主请求。

本轮只改两份后端实现、现有 `OverviewAdaptiveGenerationTests` 和指定现行文档，不改公开 API/DB。合成用例覆盖真实主形态、outline 保留、合法/非法 summary、后缀拒绝、字符串边界、alias/coverage、专用 repair、缓存键/重试复用和 trace 分离；实际统一命令与计数见当前状态。未部署、未调用真实 Provider，未进行真实资料或业务验收。

### M3.2 持久正文执行计划与节点状态（2026-10-19；源码、相关验证与唯一审查完成；未部署）

本阶段只接入现有同步 adaptive Source/Subject ALL/OUTLINE writer：V35 私有 plan/node/call journal 记录完整有序 writer descriptors、attempt/fence 和精确 usage reservation；专用 writer 校验后与 VERIFIED 状态原子保存主 checkpoint。恢复先复用身份/hash 匹配的已验证正文；只有精确节点调用状态可证明安全时才能重试，未知派发明确 hold。父 generation/task budget、已有 guard 及限制保持。无公开 job/control API、worker、UI、partial publish 或发布写入。

实施细项与验证口径见[M3.2 执行 journal 计划](2026-10-19-overview-m3-execution-journal.md)。唯一 reviewer BLOCKER=0 / IMPORTANT=0 / OPTIONAL=0；package 为 `-DskipTests` 成功，不等于 full suite 修复后全绿。M3.2 不提供后台 worker、公开 job/control API、UI 或发布。当时后续 M3.3 计划交付 worker、暂停/继续/取消/对账；现已完成 M3.3 源码、相关验证与唯一审查，正式发布仍留待 M3.4。

- **M3 前置交付（源自 M1 单次有界目录限制）**：为全局轻量索引 metadata 提供有限层级规划，并保留每项到原文单元、来源、修订和顺序的绑定。分层只组织 metadata，不合并或改写原文及已验证正文；限制层级、节点、单次 prompt 和总工作量，超限明确失败。
- 在现有 coordinator 基础上建立任务/计划/节点状态、租约接管、重连、暂停/继续、取消和有限恢复。
- 持久化父预算关联与发布 intent，处理在途未知调用和重复请求；不以重启清空消耗。
- 按完整单元保存和续写；禁止句号截取损坏 JSON 的发布方式。
- 候选、预览与正式版本分开；发布使用 owner/scope/revision/manifest/baseVersion/幂等围栏。
- 验收：重启、断线、重复提交、取消与发布竞争、旧响应隔离和失败保留旧版。
- **M3 验收**：多层路由覆盖全部输入单元且来源绑定和已完成正文不丢；仍超出分层边界时明确拒绝。

## M4：PC 消费界面已撤回；Server 能力保留

2026-10-22 当前决定：用户撤回 M4 新增的 PC job selector、candidate preview/publish/adopt、section reader 与 native job consumer 接线。PC 恢复原 Overview 入口、SSE 自动生成及原有同步/冲突流程；只保留 SSE 生成期间本机编辑保护和 browser fallback 跨 tab Web Lock。Server durable job、`candidateInput`、publication receipt、VERIFIED preview 与 section API 仍存在，当前 PC 不消费；M4 新 UI 不列为待自动补齐项。此前针对“来源选择器 >100 项默认全选”的 O1 随选择器撤回，不再适用。

回退后源码范围为21项（19项冻结回退范围及2项I1测试harness调整），1110 protected paths 未变；唯一 reviewer I1 delta 为 B0/I0。回退后检查分批记录：noEmit 0、cache/sync/deletion 55/55、generation 75/76；首轮 rollback R4 为169 passed / 3 failed，race/UI定向复验分别4/4、1/1。当时未过项共4：Stop aria-label 旧 fixture/source mismatch 1项；asset-flow owner-switch/auth-refresh 3项且无同测试旧 baseline，未做历史归因。各批次不合并称全绿。此前 backend full、M4隔离浏览器与 PC full R4结果均发生于撤回前，只留历史。无部署或回退后 GUI/Provider/业务库验收。M5 cache/reuse、M6真实 Provider/usage校准、内容质量、部署与最终unused-compatibility cleanup仍待后续整体目标，M4交互不恢复为待办。

### 2026-10-23 M4 回退后 PC 定向测试问题收尾（仅测试维护；未改生产代码）

此前 M4 回退记录的四个 PC 定向未过项（Stop aria-label fixture/source mismatch 1项及 asset-flow owner-switch/auth-refresh 3项）现由相应测试夹具/断言修正：Stop 断言遵循当前用户批准的 Overview UI；asset-flow 通过真实 Axios adapter 与 scope/token/device/payload 断言、完成事件和持久 job 状态核验。M4 已撤回的 selector、job controls、preview/publish/adopt 与 section reader 未恢复。执行者另修复 README、Status、FrontendPC 中指向已删除计划的三处链接，均改指现行 FrontendPC 时间轴小节。

验证分别记录：在 live 项目 `D:/CodeBase/Active/Auralis/Auralis-Server` 的 Maven focused 命令 `.\mvnw.cmd -B -ntp '-Dmaven.repo.local=D:\IDea\mvn_repo' '-Dtest=OverviewGenerationCoordinatorTests,OverviewAdaptiveGenerationTests' test` 为55/55（30+25）、exit 0；M5.4 四个冻结源/测试文件哈希保持。PC 两脚本 Node 首轮106项104 passed/2 failed、exit 1；affected-only 最终2/2、exit 0。失败是测试完成观察/fixture问题；没有重跑106项整批，不能记录为全套106/106。唯一只读 reviewer B0/I0/O0。

本次结论仅收尾上述 PC 定向测试问题，不关闭完整 PC R4、Mobile 既有错误、其他历史 full-suite 失败或此前范围审计；没有 GUI、真实服务、Provider、DB、Docker 或部署验收。M5 没有新增功能，仍待完成。
## M5：增量重算与跨任务复用（2026-10-23 engineering closeout）

M5.1–M5.6 stage histories below remain authoritative for their individual batches. Current engineering scope completes index/batch/planning/writer reuse; global routing dependency invalidation; current owner/source fencing; bounded standalone cache capacity; Source/Subject revocation; completed-job private payload expiry; and account-deletion cleanup. V38 does not change public API/SDK wire shape. M5 closure does not complete M6, deployment, real Provider, GUI, content quality, or final unused-compatibility cleanup.

| 验收项 | 结论与证据 |
| --- | --- |
| Index, batch, planning, and writer reuse | M5.1–M5.5 per-stage evidence retained separately; M5.5 Coordinator/Adaptive 56/56 plus Service acceptance 2/2. |
| Global routing/current owner/source invalidation | M5.5 global-routing cases, currentness acquisition checks, and affected resource lifecycle tests passed in their recorded batches. |
| Bounded standalone cache and safe pressure fallback | Defaults 256 MiB / 1000 generations; V38 singleton admission guard; at most 100 eviction candidates; durable-job generations excluded; pressure drops only reusable copies. |
| Source/Subject revoke and no resurrection | Deletion fences jobs/generations/intents; scrubs private raw-derived copies; receipt tombstones preserve idempotency identity/hash and reject replay with RESOURCE_VERSION_CONFLICT. |
| Completed-job private payload expiry | Bounded 14-day cleanup of request/manifest/candidate and no-longer-needed SUCCESS result/checkpoint/plan/node copies; preserve recovery and usage/journal metadata. |
| Account hard-delete copy-surface cleanup | Isolated PostgreSQL 17.11 integration 1/1; target owner Overview lineage removed while another owner, capacity guard, and charged usage evidence remain. |
| Budget/recovery/formal result safety | ACTIVE/FAILED/PAUSED/unknown recovery states and usage/reservation/journal lineage preserved; formal saved results excluded from capacity eviction/ordinary TTL. |

Unified validation is reported by actual batch: valid backend PostgreSQL 17.11 full 805 tests / 799 passed / 1 stale V37 expected-version fixture failure / 0 errors / 5 assumption-skipped; corrected affected method 1/1, the five separately rerun usage-guard PostgreSQL lock cases 5/5, and final -DskipTests package exit 0. The full batch was not rerun and must not be described as 805/805 green. Sole read-only reviewer B0/I0/O0 for the reviewed source/config/test manifest; the only post-review change corrected a test assertion to V38, with no production behavior change. Detailed commands, skips, earlier invalid-harness attempts, and evidence paths are in the D-drive final handoff.

## M6：真实校准、部署与业务验收

- 采集受控真实 Provider 的 actual/unknown usage，校准容量与成本估算；影子估算启用准入前独立验证。
- 基于实际瓶颈调整分片、有限任务契约与并发公平性，不做模型自动切换。
- 质量样本覆盖短/长、高密度、重复/矛盾、多来源、定义/条件/例外、数字/公式、解析缺口。
- 部署前准备可审查候选、配置、回退和迁移说明；部署按用户授权边界执行。
- 分别完成真实 Provider、原文定位、PC GUI、恢复/增量与内容质量验收。

### 最终统一兼容清理门禁（用户决定，2026-10-19）

未正式部署使用过的旧版本无需兼容，可按当前目标版本修改。路线收尾时统一盘点并移除未使用版本的兼容分支、废弃字段/DTO 与 fallback、旧 cache/checkpoint 格式读取，以及仅服务这些兼容路径的测试和文档，收敛为唯一现行契约。保留正常幂等、权限、来源修订、预算和有效数据安全规则；不将该门禁扩大为无关数据库删除或全仓重构。M3.1 不新增旧算法读取或回退。

## 状态与证据

本计划中的勾选只表示相应工程步骤已有证据，不把文档、编译、自动测试或 GUI 验收混为同一状态。本轮完整命令、退出码、输入清单、逐文件变更、review 差量及未覆盖范围保存在 D 盘任务目录。

### M3.3 专项实施与结案

后台 job 生命周期、wire、V36 schema、dispatch lineage/恢复要求见 [Overview M3.3 持久后台作业、控制与安全接管计划](2026-10-19-overview-m33-background-jobs.md)。M3.3 源码、相关自动验证与唯一审查已完成，未部署；M3.4 正式发布与分节预览现已完成源码、相关自动验证与唯一审查，未部署。M4–M6 与最终 unused-compatibility cleanup 仍待交付。

### M3.4 专项实施与结案

正式 publication intent、现行 result/receipt CAS 接入、显式 per-part raw input binding、VERIFIED preview、正式 outline metadata 与 version-fenced section body reads 的范围见 [Overview M3.4 计划](2026-10-22-overview-m34-publication.md)。源码、相关自动验证和唯一审查完成，未部署。实际 full run04 为 135 fresh XML / 729 tests / 2 failures / 258 errors / 0 skipped；该结果保留。随后受影响失败组已归因并定向复验闭合，但没有修复后 full-suite 全绿证据。M4 PC 新交互现已按用户决定撤回，M5 cache/reuse、M6 真实 Provider/usage 校准、内容质量、部署和最终 unused-compatibility cleanup 仍未完成。

raw coordinator/job budget_task_id 保持原始预算 UUID；AiUsageGuard 用 (userId, feature, rawBudgetTaskId) 稳定派生 ledger UUID，所有 invocation reservation 绑定实际 ledger task ID。预算、结算、父任务与同 raw budget 的安全重试保持既有语义。未知 usage 仍 fail-closed 并 hold，绝不将 unknown 自动视为无费用或可安全重发。
本轮 M1 证据：focused attempt4 为 7 suites / 175 tests / 0 failures / 0 errors / 0 skipped（Maven exit 0）；full attempt6 为 122 suites / 711 tests / 0 failures / 0 errors / 0 skipped（Maven/Docker exit 0，4:17）。Package `-DskipTests` 与 synthetic Compose false/true render 均 exit 0；JAR 93,205,090 bytes，SHA-256 `E9637F9615EC6B7EB445C36CE18E89F7ACC9948965067832A18DD12543E6305B`。Final manifest SHA-256 `CC21E28C7D7C9C5F72158B1F25321BA901D62174DFE085308B05EEAD4A22FE31`，12 owned + 2 context hashes 一致。唯一 reviewer correction delta B0/I0/O0。源码、自动验证、部署及真实 Provider/GUI/内容质量分别报告；未部署，未完成生产/业务 DB 或 GUI 验收。完整证据和未覆盖范围见 `D:/Temp/auralis-overview-adaptive-20261018/`。中间环境与 harness 重试保留在历史 attempt，不代表当前候选失败。

### 2026-10-22 M5.1：完全相同输入的跨任务轻量索引复用

- 新生成任务先读取自身 checkpoint；缺失时，仅 ADAPTIVE_INDEX 可查询同 owner、scope、完整 input fingerprint、profile、算法和 prompt step 的 SUCCESS generation。读取同时检查 result 到期和 checkpoint 14 天有效期，以及 payload SHA/schema；使用前继续执行现行 Source/owner 校验和索引 coverage/shape 校验。
- 复用现有 overview_generation_checkpoints，只读命中，不复制缓存、不延长原条目寿命、不新增表或迁移。目录和正文仍执行当前生成流程；命中不派发 Provider、不伪造 usage，记录 ADAPTIVE_INDEX_CACHE_RETURN。预算预检识别可复用索引。
- 本小节只覆盖完整输入未变化时的新任务复用；资料局部变化、节点级依赖失效、目录/正文跨任务缓存及完整删除生命周期仍属于后续 M5，不能据此标记 M5 完成。现有前端流程保持。
- 验证：D 盘隔离源码运行 OverviewGenerationCoordinatorTests 21/21、OverviewAdaptiveGenerationTests 26/26，共 47/47，Maven exit 0。覆盖跨 owner/输入/profile 隔离、过期、损坏拒绝及生成链路跳过索引而继续目录/正文。当前为 H2/合成 Gateway 证据，未运行 PostgreSQL、全量测试、打包、真实 Provider、GUI 或部署。本轮依用户要求由主模型直接实现并检查，未启用子代理。
- 证据：D:/Temp/auralis-overview-m51-20261022/targeted-tests.log 与 handoff.md。更早前端回退的四项失败未由本轮处理；此前范围审计按用户最新要求暂置，尚无完整审计结论。

执行偏好（2026-10-22 用户决定）：本次主模型直接推进，不启用子代理；如果本次因额度耗尽停止，下次恢复时重新启用 Luna 子代理负责实现与审查，按此前约定使用 gpt-6-luna high。保留每个小阶段末尾统一验证一次的节奏。


### 2026-10-23 M5.2：索引 batch 跨任务复用（源码、定向验证与唯一审查完成；未部署）

- 以 `index_batch_v1_SHA` 绑定 system prompt、`indexData` 和有序完整 `AdaptiveRawUnit` 记录；同 owner/scope/profile/algorithm 的 SUCCESS donor 仅供给相同 batch。donor checkpoint 与其 generation input fingerprint 必须一致，另检查 payload SHA/schema、14 天 checkpoint、result 到期、现行来源与 coverage/shape 围栏。原 M5.1 完全相同 task input 复用途径保留。
- 当前 generation checkpoint 优先；donor 命中只读、不复制、不延寿。只有真实调用 Provider 且 coverage/shape 通过后才保存当前 generation 的 batch checkpoint；变化 batch 不拼接复用，目录和正文继续生成。本阶段仅交付索引 batch 复用，不代表完整 M5，不扩展 API、schema、migration 或前端。
- gpt-6-luna high 完成实现及隔离 D 盘 Maven 定向验证：`OverviewGenerationCoordinatorTests,OverviewAdaptiveGenerationTests` 49/49（22+27），exit 0。fixture 旧注入序号8/9改为14/15，未放宽原断言。唯一只读 reviewer（gpt-6-luna high）B0/I0/O0。未运行 PostgreSQL/full/package/OpenAPI-SDK/Provider/GUI/Docker/部署。详见 D 盘 `handoff.md`、`adaptive-final-2.log` 与 `review.md`。

#### M5.2 deployment status (2026-10-23)

The M5.2 alias projection fix is deployed to the local backend. Docker reports healthy and `/actuator/health/readiness` returned HTTP 200; trace capture and adaptive generation flags remain enabled with the D-drive bind mount. No Overview or real Provider call was made during deployment; user generation and content-quality acceptance remain pending. Evidence: `D:/Temp/auralis-index-alias-fix-20261023/startup/handoff.md`.
#### 2026-10-23 M5.2 index batch alias prompt correction

- Regression follow-up: the provider-facing ADAPTIVE_INDEX projection exposes only the current batch's `unitAlias` and explicitly limits response `sourceIds` to those aliases. Raw `sourceAlias`, source UUID ownership, chunk/revision provenance, allowlist construction, and coverage checks remain internal and unchanged. Do not expand a source-level alias into all of its units or claim coverage on its behalf.
- Both current-generation checkpoint steps and cross-generation index batch keys include the system prompt and index data, so this prompt change invalidates results created under the old projection by fingerprint mismatch. No generic algorithm version change is needed. D-drive isolated `OverviewAdaptiveGenerationTests` passed 37/37 (Maven exit 0); request-capture and source-alias rejection evidence is recorded in `D:/Temp/auralis-index-alias-fix-20261023/final-handoff.md`.

执行偏好（2026-10-23 用户决定）：本次实现、定向验证与唯一只读审查由 gpt-6-luna high 子代理完成；此前 M5.1 的主模型直接执行偏好仅适用于当时阶段。


### 2026-10-23 M5.3：目录规划跨任务复用（源码、分批验证及唯一审查完成；未部署）

- 新 generation 可从同 owner/scope/profile/algorithm、完整 generation input 和完整 prompt-derived step 匹配的 SUCCESS donor 只读复用 `ADAPTIVE_ROUTE`、`ADAPTIVE_METADATA`、`ADAPTIVE_METADATA_ROUTE` 三类规划及必要层级 metadata。仍校验 checkpoint 14 天有效期、result expiry、payload SHA/schema、当前 owner/source 与 route coverage/shape。先读取当前 generation checkpoint；命中 donor 不复制或延长生命周期。
- donor 规划进入当前既有 writer 和持久 journal；writer 继续正常计量，规划命中不伪造 Provider usage。无跨任务正文复用，M5.2 index batch 复用保持冻结。本阶段不代表完整 M5；无 API/schema/migration/前端变更。
- 首轮隔离 Maven 批次 51 项：Adaptive 28/28；Coordinator 22 passed / 1 error（合计50 passed/1 error）。失败为测试 fixture lease ordering；先修复 active lease 与 profile/algorithm 顺序，再修复 ended lease 被后续检查复用的问题，并在过期/损坏断言前重新获取 lease。production logic 未因失败修改。受影响单例 1/1、exit 0；未重跑51项整批。唯一 reviewer B0/I0/O1，其中 O1 为现行文档同步项，已由本次回写处理；未进行回写后复审。执行者手册：`D:/Temp/auralis-overview-m53-20261023/final-handoff.md`。

执行偏好（2026-10-23 用户决定）：本阶段由 gpt-6-luna high 执行；唯一审查结论 B0/I0/O1，O1为文档同步项并在本次回写处理。

### 2026-10-23 M5.4：完全相同输入下正文跨任务复用（源码、分批定向验证与唯一审查完成；未部署）

- 复用限定同 owner、scope、完整 generation input、profile、algorithm 与 exact prompt-derived writer step。SUCCESS donor 必须经真实 reservation journal 关联到 ASSEMBLED plan 下 VERIFIED execution node，且 checkpoint/node hash 一致；并验证 plan fingerprint、descriptor integrity、checkpoint SHA/schema/size、14天 checkpoint 与 result expiry。无真实 dispatched reservation 的 cache-materialized node 不得作为 donor。
- 当前代 checkpoint 优先；`beginAttempt` 先处理 unknown dispatch / `RECOVERY_REQUIRED` hold，再进行执行期 donor 查询。命中后沿现有 response、current source/owner、shape/coverage 校验，通过既有 `verifyAndSaveCheckpoint` 事务保存本代恢复 checkpoint并验证本代 node；不改变原 donor/TTL，不新增 reservation/usage-call，记录 donor ID，不承诺持久 origin 字段。preflight 按同一 predicate 计 calls/tokens；预检后 donor 到期走原 miss/Guard，可能预算拒绝。
- 首轮隔离定向批次 55 项：52 passed / 3 errors（exit 1）；首轮 affected-only 4 项：3 passed / 1 failed（exit 1）。fixture 错误分别为两个 Mockito stub 重装问题及 coordinator active lease；unknown-dispatch 断言把多个只读 preflight lookup 计作执行 lookup。unknown-only 1/1（exit 0），最终 affected-only 4/4（exit 0）；未重跑55项整批，不能记作55/55全绿。唯一只读 reviewer B0/I0/O0。详见 D 盘 `final-handoff.md`、各日志与 `review.md`。
- 仅两份后端源码与两份测试变化；无 API/schema/migration/frontend 变化。未运行 PostgreSQL、backend full、package、OpenAPI/SDK、真实 Provider、GUI、Docker 或部署。M5 未完成；不同 input 正文复用、依赖失效/节点重算及完整缓存和删除生命周期仍待后续。既有范围审计与 PC 四项失败未处理。


### 2026-10-23 M5.5：严格 descriptor 相等的跨 input 正文节点复用

- 私有 `ExecutionNodeDescriptor` 增加 `globalRoutingFingerprint`，覆盖有序章节/小节职责、(alias/sourceAlias/sourceId) 分组路由结构、mode、instruction 与 system policy；排除其它分组 text/revision/chunk。完整 descriptor 保留目标组所有 unit references 与 exact prompt-derived writer step；跨 input donor 必须同 owner/scope/profile/algorithm/step，且 descriptor JSON 和 SHA 与当前完整 descriptor 完全相等。
- Donor generation、ASSEMBLED plan、VERIFIED node 与 checkpoint 的 input 身份一致，并满足 checkpoint/node hash、schema、14天、result expiry、current source、coverage/shape。仅当前 attempt 有真实 dispatched reservation journal 的 donor 可用，以防无 reservation 的 checkpoint materialization TTL 接力。current checkpoint 优先；beginAttempt/unknown dispatch hold 在 lookup 前；M5.4 完整 input donor 优先于 strict descriptor donor。命中沿原校验事务物化本代 node checkpoint，不新增 usage/reservation。
- 实现以提升 adaptive algorithm identity 隔离旧格式 cache/checkpoint；无 public API、DB column 或前端变化，无旧数据迁移/转换。global route、写作 goal 或指令变化应全局失配；组内内容/依赖变化可能局部 miss。此范围不保证任意局部修改均可命中。
- 验证按两批执行：Coordinator 26/26 + Adaptive 30/30，合计 56/56，exit 0（`targeted-tests.log`）；随后 Service acceptance 2/2，exit 0（`service-acceptance-tests.log`）。Service 用例覆盖 B revision/chunk/hash 变化但 global routing 不变时 A 复用、B 派发，以及相同 raw input 只改变 B goal 时 global fingerprint 改变、A/B 均派发。未将两批描述为合并 58-case 全绿。唯一只读 reviewer B0/I0/O0。
- 更广的依赖失效策略、正文任意跨任务复用与完整缓存生命周期目标尚未完成；范围审计和其它历史未验收项仍保持原状态。完整 M5 仍未完成。



### 2026-10-23 M5.6：generation payload 过期回收安全

执行范围：仅 OverviewGenerationCoordinator 与 OverviewGenerationCoordinatorTests；M5.5、Service 和 journal 保持冻结。cleanup 保留已有 REQUIRES_NEW 与调度入口。

- 每批最多锁定 100 个 generation，按 id 确定顺序并对父行使用 FOR UPDATE SKIP LOCKED；锁后重读状态。cleanup 与 takeover 的父行锁互斥。
- 仅非 ACTIVE generation 可清理；ACTIVE 不因 lease 超时而例外。只清 SUCCESS 且自身 result_expires_at 已过期的 result；只删 checkpoint.created_at 至少 14 天的 checkpoint。对象各按自身条件判断。
- 保留 generation、metadata、request mapping、budget、plan/node/call/reservation 和 unknown hold；不修改 usage reservation。读取端 14 天校验不变。后台批次不保证到期时立即清除。
- 统一 focused Maven 批次：Coordinator 29/30、Adaptive 32/32，共 61/62 passed、1 race fixture error，exit 1。失败 fixture 直接把 ACTIVE 状态设成缺少 schema 必需的 active_fingerprint；修正 fixture 并停止 test heartbeat scheduler 后，affected-only 双事务测试 1/1、exit 0；未重新运行完整 62 项。首次编译 accessor/overload 错误和首个 affected fixture 错误保留在执行者日志中。
- H2 PostgreSQL-mode 双事务测试覆盖 SKIP LOCKED 和 takeover 竞态；无真实 PostgreSQL integration、full suite、package、Docker、部署、production scheduler 或用户数据库执行证据。唯一 reviewer B0/I0/O0。
- 无 schema/API/config/frontend 变化，未触及 hard-delete/account-delete 或 M5.5 lookup。容量上限、权限撤销、来源/账号删除生命周期及完整 M5 仍待完成；既有范围审计与其它历史未解决项保持原状态。

### M5.5 文档标题与状态修正（2026-10-23）

M5.5 两批定向证据为 Coordinator 26/26 + Adaptive 30/30（56/56，exit 0），之后 Service acceptance 2/2（exit 0），不是合并的 58 项同批。唯一 reviewer B0/I0/O0。移除六份现行文档中遗留的 insertion draft / review pending 标题与待 review 句；保留上述分批边界、未部署事实及 M5 未完成状态。

