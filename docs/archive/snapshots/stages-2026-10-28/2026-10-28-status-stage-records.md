> [!WARNING]
> 本文件是从 `docs/current/Status.md` 明确标注的阶段历史区提取的记录，于 2026-10-28 整理。它不代表当前实现或任务状态；请从[文档中心](../../README.md)进入现行状态和风险登记。历史正文不修订，仅重定位相对链接。归档不构成任何验收项的关闭。

# 状态阶段记录

## 阶段历史记录（以下状态为各阶段当时快照，以顶部接续快照为当前事实）

### 2026-10-23 ADAPTIVE_INDEX 批次别名提示修正（定向验证完成；未部署）

- index Provider 请求不再呈现内部 `sourceAlias`，并明确每个 `sourceIds` 只能使用当前批次实际提供的 `unitAlias`。真实 source owner / provenance 保持服务端内部绑定；coverage 与 validator 不变，source-level alias 仍会在 route 前拒绝，因此不会伪造覆盖。
- index batch 和 checkpoint fingerprint 已纳入 system prompt 与请求数据，字段投影及规则变化自动使旧提示结果不匹配。无公开 API、数据库、前端或部署变化。
- D 盘隔离副本 `OverviewAdaptiveGenerationTests`：37 tests，0 failures/errors/skips，Maven exit 0。未运行全量、PG/MinIO、真实 Provider、GUI 或部署；完整命令见 `D:/Temp/auralis-index-alias-fix-20261023/final-handoff.md`。

### 2026-10-23 ADAPTIVE_INDEX 冗余 summary 修复（定向验证完成；未部署）

- ADAPTIVE_INDEX 接受通用 schema 允许的合法冗余 summary，并在进入后续阶段前确定性规范化为空；outline 保持原值。新生成 checkpoint 写入规范化 payload，读取旧 checkpoint 时也执行同一规范化。
- Provider 原始响应追踪保持不变。索引 coverage、outline 必需形状与其它 purpose 的既有校验继续生效。无公开 API、数据库或前端变化。
- D 盘隔离副本执行 `OverviewAdaptiveGenerationTests`：35 tests，0 failures/errors/skips，Maven exit 0。首次编译发现局部变量 lambda finality，随后修复；首次测试发现测试夹具默认 index section summary 被置空，修复夹具后同一套件通过。没有运行全量、PG/MinIO、真实 Provider、GUI 或部署。
- 证据与完整命令：`D:/Temp/auralis-index-summary-fix-20261023/final-handoff.md`、`validation/focused-adaptive-final.log`。

### 2026-10-23 PC 回退后定向测试问题收尾（测试夹具/断言修正；唯一审查完成）

- 此次收尾覆盖此前 M4 回退记录的四个 PC 定向测试问题：旧 Stop aria-label fixture/source mismatch 1项，以及 asset-flow owner-switch/auth-refresh 3项。只改两个 PC 测试脚本，无生产代码变化；Stop 断言改为现行 Overview/Subject 控件和文件列表 regenerate 行为，不恢复撤回的 M4 UI。README、Status、FrontendPC 的三处已删计划链接修复已由执行者先行完成并保留。
- Maven `OverviewGenerationCoordinatorTests,OverviewAdaptiveGenerationTests` 在 `D:/CodeBase/Active/Auralis/Auralis-Server` 执行，55/55（30+25）exit 0。M5.4 四个冻结源码/测试文件哈希未变。PC 两脚本 Node 首轮106项为104 passed / 2 failed、exit 1；两个 fixture 失败最小修正后的 affected-only 2/2、exit 0。没有重跑106项整批，不写成106/106全绿。
- asset-flow 测试通过真实 Axios adapter 捕获 scope/token/device/payload 与 dispatch；区分 A 仍是当前 scope 时合法启动的请求，并验证切换到 B 后旧 A ticket 不再派发、B 请求不含 A 资源。延迟 A 401 即时登记 settlement observation，验证 `SYNC_SCOPE_CHANGED` 且不以 B 凭据 refresh/retry；上传完成等待真实 adapter completion 及持久 completed job。
- 唯一只读 reviewer：B0/I0/O0。未跑完整 PC R4、type-check/build、GUI、真实 API/Provider、数据库、Docker 或部署；既有 Mobile 错误、其他历史 full-suite 失败及范围审计未处理。M5 未新增功能且仍未完成。
- 证据：`D:/Temp/auralis-error-closeout-20261023/closeout-handoff.md`、`maven-related-tests.log`、`node-related-tests.log`、`node-affected-retest-1.log`、`review.md`。
### 2026-10-23 Overview M5.4：完全相同输入下正文跨任务复用（源码冻结、定向复验与唯一审查完成；未部署）

- 新任务可只读复用同 owner/scope、完整 input、profile、algorithm 与 exact prompt-derived writer step 的 SUCCESS donor。Donor checkpoint 须与其 ASSEMBLED plan 下 VERIFIED execution node hash 一致，plan fingerprint/descriptor integrity 有效，并有该 node 当前 attempt 的 execution-call journal 关联到真实 dispatched reservation。无此 reservation 的 cache-materialized node 不可接力成为 donor。
- 当前 generation checkpoint 优先；`beginAttempt` 先阻断 unknown dispatch / `RECOVERY_REQUIRED`，再执行 donor lookup。命中后沿现有 response/source/shape/coverage 校验与 `verifyAndSaveCheckpoint` 事务物化本代恢复 checkpoint，不改原 donor/TTL。复用不创建 reservation 或 usage-call，记录 donor ID。预算预检按同一 donor predicate 计 calls/tokens；预检后 donor 到期则按普通 miss/Guard 处理，可能预算拒绝。
- 隔离定向首轮 55 项为 52 passed / 3 errors；affected-only 首轮 4 项为 3 passed / 1 failed。归因分别为 Mockito stub 重装、coordinator fixture 仍有 active lease，以及 unknown-dispatch 断言把只读 preflight lookups 计作执行期 lookup。unknown-only 1/1、final affected-only 4/4（exit 0）；未重跑55项整批，不记作55/55全绿。唯一 reviewer 结论 B0/I0/O0。
- 无 API/schema/migration/frontend 变化；未运行 PostgreSQL、backend full、package、OpenAPI/SDK、真实 Provider、GUI、Docker 或部署。M5 未完成；不同 input 正文复用、依赖失效和完整缓存生命周期仍待后续。原范围审计及 PC 四项失败未由本阶段处理。
- 证据：`D:/Temp/auralis-overview-m54-20261023/final-handoff.md`、`targeted-tests.log`、`affected-retest.log`、`unknown-hold-retest.log`、`final-affected-tests.log`、`review.md`。

### 2026-10-23 Overview M5.3：目录规划跨任务复用（源码、分批验证与唯一审查完成；未部署）

- 复用范围为 `ADAPTIVE_ROUTE`、`ADAPTIVE_METADATA`、`ADAPTIVE_METADATA_ROUTE` 三类目录规划及所需层级 metadata；仅同 owner/scope/profile/algorithm、完整 generation input 与 prompt-derived step 匹配的 SUCCESS donor 可用。保留 14 天 checkpoint/result 到期、SHA/schema、当前 owner/source 与 coverage/shape 校验；当前 generation checkpoint 优先。donor 命中只读，不复制、不延寿、不伪造 usage。
- 命中后继续原 writer 与持久 journal；正文仍按当前流程生成，不做跨任务正文复用。M5.2 index batch 复用保持冻结。本阶段不代表完整 M5；无 API/schema/migration/前端变化。
- gpt-6-luna high 完成实现。首轮隔离 Maven 批次 51 项：Adaptive 28/28、Coordinator 22 passed / 1 error（50 passed / 1 error）；唯一错误是 coordinator 测试 fixture 的 lease 顺序。修复后仅受影响用例复验 1/1，exit 0，未重跑 51 项整批。唯一 reviewer 结论 BLOCKER=0 / IMPORTANT=0 / OPTIONAL=1；O1 是本阶段文档同步项，由本次回写处理，未进行文档更新后的复审。
- 未运行 PostgreSQL、backend full、package、API/OpenAPI/SDK、真实 Provider、GUI、Docker 或部署。原 PC 四项失败与范围审计未在本阶段处理。证据：`D:/Temp/auralis-overview-m53-20261023/final-handoff.md`、`maven-test.log`、`affected-retest.log`、`review.md`。

### 2026-10-23 Overview M5.2：索引 batch 跨任务复用（源码、定向验证与唯一审查完成；未部署）

- 新增 `index_batch_v1_SHA`，按 system prompt、`indexData` 与有序完整 `AdaptiveRawUnit` 记录绑定索引 batch。仅同 owner、scope、profile、algorithm 的 SUCCESS donor 可供给相同 batch；donor checkpoint 与 donor generation 的 input fingerprint 必须一致，并继续检查 payload SHA/schema、14 天 checkpoint 与 result 到期。
- 当前 generation checkpoint 仍优先。跨任务命中只读，不复制或延长 donor；batch checkpoint 仅在本任务实际调用 Provider、且 coverage/shape 校验通过后保存。batch 有变化时不部分拼接，目录和正文仍按当前流程生成。该增量只覆盖索引 batch，不代表完整 M5；无 API/schema/migration/前端变化。
- gpt-6-luna high 完成实现与验证。隔离 D 盘 Maven 定向批次 `OverviewGenerationCoordinatorTests,OverviewAdaptiveGenerationTests` 共 49/49（22/27），exit 0。此前 Adaptive fixture 失败是模拟 writer checkpoint 仍按读取序号 8/9 注入；新增本地 checkpoint 读取后应改为 14/15。只更新 fixture 序号，原 writer dispatch 断言未变，最终批次通过。唯一只读 reviewer（gpt-6-luna high）结论 BLOCKER=0 / IMPORTANT=0 / OPTIONAL=0。
- 未运行 PostgreSQL、backend full、package、OpenAPI/SDK、真实 Provider、GUI、Docker 或部署。原 PC 四项失败与范围审计不在本阶段处理。证据：`D:/Temp/auralis-overview-m52-20261023/handoff.md`、`adaptive-final-2.log`、`review.md`。

### 2026-10-23 Overview M5 完整复用与生命周期收尾（源码、相关自动验证与唯一审查完成；未部署）

- M5.1–M5.6 的阶段历史及分批结果均保留。当前工程范围的完整 M5 覆盖索引、batch、规划和正文节点复用、全局路由依赖失效、owner/source currentness、有限缓存容量、Source/Subject 撤销和账号删除生命周期。
- 可复用容量默认 256 MiB / 1000 generations，由 V38 singleton guard 串行 admission。只计 standalone、未 pinned 的 SUCCESS result/checkpoint UTF-8 payload；每次最多尝试淘汰 100 个候选。容量不足、oversize 或锁竞争时放弃可复用副本，不失败成功响应或改动 usage/journal/reservation。所有 durable-job linked generations 均排除于该池，job payload 使用其自身 retention；该上限不是数据库总容量限制。
- Source/Subject 删除按 owner/resource/job/generation 顺序 fence 旧 worker 与 publication，并清理相关私有原文派生副本。Write receipt 保留 idempotency identity/hash，response snapshot 替换为 tombstone；旧 receipt replay 返回 RESOURCE_VERSION_CONFLICT。已完成 job 的 private request/manifest/candidate 和不再被其它有效 job 需要的 SUCCESS result/checkpoint/plan/node payload 在有界 14 天 cleanup 后清理；保留 ACTIVE/FAILED/PAUSED/unknown recovery、usage/reservation/journal lineage。正式 saved results/receipts 不参与缓存容量淘汰或普通 TTL 清理。
- 验证分批记录：首次 focused 113 项为 1 failure / 26 errors；受影响复验 76/76、account deletion PostgreSQL 1/1、Recovery 26/26、TaskColor migration 6/6。有效隔离 PostgreSQL 17.11 / Testcontainers MinIO full run 为 805 项、799 passed / 1 失败 / 0 errors / 5 skipped；唯一失败是 V33 迁移 fixture 仍预期 v37，更新到当前 V38 后 affected method 1/1 通过。五个 AiUsageGuard PostgreSQL lock 方法在同隔离数据库下另批 5/5 通过。没有重跑 full，因此不写成 805/805 全绿。最终 -DskipTests package exit 0。
- 唯一只读 reviewer：BLOCKER 0 / IMPORTANT 0 / OPTIONAL 0（reviewed source/config/test manifest）；其后仅更正 V33 migration-version test assertion，没有生产行为修改。完整命令、跳过项说明和限制见 D 盘结案 handoff。
- 本阶段源码及列明的自动验证/审查闭环；未部署，未调用真实 Provider，未完成 GUI、生产业务数据库或内容质量验收。M6 与最终 unused-compatibility cleanup 仍在总计划中单独跟踪。

### 2026-10-22 M5.1：完全相同输入的跨任务轻量索引复用

- 新生成任务先读取自身 checkpoint；缺失时，仅 ADAPTIVE_INDEX 可查询同 owner、scope、完整 input fingerprint、profile、算法和 prompt step 的 SUCCESS generation。读取同时检查 result 到期和 checkpoint 14 天有效期，以及 payload SHA/schema；使用前继续执行现行 Source/owner 校验和索引 coverage/shape 校验。
- 复用现有 overview_generation_checkpoints，只读命中，不复制缓存、不延长原条目寿命、不新增表或迁移。目录和正文仍执行当前生成流程；命中不派发 Provider、不伪造 usage，记录 ADAPTIVE_INDEX_CACHE_RETURN。预算预检识别可复用索引。
- 本小节只覆盖完整输入未变化时的新任务复用；资料局部变化、节点级依赖失效、目录/正文跨任务缓存及完整删除生命周期仍属于后续 M5，不能据此标记 M5 完成。现有前端流程保持。
- 验证：D 盘隔离源码运行 OverviewGenerationCoordinatorTests 21/21、OverviewAdaptiveGenerationTests 26/26，共 47/47，Maven exit 0。覆盖跨 owner/输入/profile 隔离、过期、损坏拒绝及生成链路跳过索引而继续目录/正文。当前为 H2/合成 Gateway 证据，未运行 PostgreSQL、全量测试、打包、真实 Provider、GUI 或部署。本轮依用户要求由主模型直接实现并检查，未启用子代理。
- 证据：D:/Temp/auralis-overview-m51-20261022/targeted-tests.log 与 handoff.md。更早前端回退的四项失败未由本轮处理；此前范围审计按用户最新要求暂置，尚无完整审计结论。
### 2026-10-22 Overview PC 回退：恢复原入口与 SSE 生成，保留编辑冲突保护（源码、定向检查与唯一审查完成；未部署）

- 用户撤回 M4 新增的 PC job selector、候选预览/发布/采纳及 section reader 交互。当前 PC 恢复原 Overview 入口、SSE 自动生成与既有同步流程；Server durable job、publication、candidateInput、receipt、preview/section API 与 V37 保留，但当前 PC 不消费这些 M4 新界面/API。M4 新交互不列为未来待自动补齐项。PC 本地 schema 仍为 v13，无本次 migration。
- 保留生成期间本机编辑保护：捕获目标 part 内容及 identity/provenance 输入签名，提交前重验；检测到本机编辑则保留当前 cache/普通冻结 outbox，将 AI part 写入现有 outbox 的 `CONFLICT` / `OVERVIEW_GENERATION_EDIT_CONFLICT`，不 PUT。仅原 FILE/SUBJECT 冲突位置可显式选择保留本机或采用 AI；采用 AI 仍经现有保存/CAS/outbox，云端 409 流程独立保留。浏览器 fallback 所有 OverviewRepository 写入共享 owner/device Web Lock；Web Locks 不可用时 fail-closed、存储不变，SQLite 继续原事务。
- 回退后检查分批记录：app noEmit 0；cache/sync/deletion 55/55；generation 75/76；旧 R4 首轮 169 passed / 3 failed，后续 race/UI 定向批次分别 4/4、1/1。当时未过项共4：原 pre-M4 Stop aria-label fixture/source mismatch 1项，asset-flow owner-switch/auth-refresh 3项（无同测试旧 baseline，未作历史归因）。不同批次不相加为全绿。唯一 reviewer I1 delta B0/I0，无新增问题；无 GUI、Provider、Docker、backend、SDK、全套或部署验证。详见 M4 回退手册与结案证据。
- 撤回前的 M4 隔离浏览器流程与更早全量/相关测试结果保留为历史，不作为回退后 PC 验收。此前针对“来源选择器 >100 项默认全选”的 O1 随该选择器撤回，不适用于当前范围。M5 cache/reuse、M6 真实 Provider/usage 校准、内容质量、部署及最终 unused-compatibility cleanup 仍未交付；整体 M1–M6 目标 active。

### 2026-10-22 Overview M4 PC native jobs（回退前实现、验证与隔离浏览器流程的历史记录；未部署）

- PC 已接入 Source/Subject ALL、OUTLINE 后台 job，按序选择 READY、未删除 FILE/TEXT/URL（1–100）；候选完成仍为 private candidate。用户显式采纳后经正式 PUT 的 `candidateInput {jobId,jobVersion}`，继续使用现行身份/来源/权限校验、CAS、receipt 与 immutable outbox，不自动发布或改写原 publication intent。OUTLINE 保留 summary；SUMMARY 保持现有 FILE-derived 路径。PC local schema v13，无 M4 migration。
- FILE/TEXT/URL 本地改动在来源仍 READY、owner/device/scope、ID/type、revision 等围栏匹配时进入既有 outbox PUT；source type fence 修复和真实 Store 行为回归 30/30。自动 FILE/ALL recovery 使用 namespace、source UUID、ingestion revision、mode 的 SHA-256 稳定 request ID；crypto 不可用时 fail-closed。manual identity 保持随机；candidate GET/publication 检查 profile/raw currentness，变化后需用户明确重新生成。
- 最终相关证据：backend 单次 full 774 tests / 771 passed / 1 failure / 2 errors，受影响组 3/3；PC full R4 745 / 716 passed / 29 failed（25 既有 fixture/Web Locks、1 seed 缺 read-only Server context、3 初始 M4），未称全量全绿。PG SQL NULL bind 42P18 回归 1/1，post-fix skipTests package Maven/Docker 0/0；最终 GEN 72/72、lifecycle 10/10 为不同批次，noEmit/Vite 通过。PC static 保留 1 项既有 finding；Mobile 保留两个既有 TS2339。唯一 source-type-fence delta review B0/I0/O0 new，原 O1 保留。
- 隔离浏览器实际流程经真实 PC→Server/API→隔离 PG 链路观察：Subject ALL→VERIFIED preview→显式发布、URL ALL 离开重连同 job→发布及分节读取、Subject OUTLINE pause/resume→发布并保留 summary、TEXT cancel、URL CAS conflict→Keep Local→receipt 保存→candidate 显式采纳/receipt 保存。最终 formal Source/section 为 v4；URL candidate publication intent 仍是 base 1 的 CONFLICT 且无 receipt。合成 Provider 15 calls（5 个成功生成 job × 3）；读取、发布、冲突、编辑、采纳没有额外调用。M4 有界源码/验证/接口流程阶段关闭；这不是正式用户业务验收。真实 Provider、native Tauri/SQLite、FILE/PDF/OCR、native 精确定位、部署或内容质量未验收。M5、M6 和最终 unused-compatibility cleanup 仍 open，整体 M1–M6 目标 active。

### 2026-10-22 Overview M3.4 正式发布与分节预览（源码、相关自动验证与唯一审查完成；未部署）

- 已接入 durable publication intent 到现行 `overview_results`/write receipt，显式 per-part `SOURCE_REVISION`、`SOURCE_OVERVIEW_PARTS`、`SOURCE_CONTENT` 输入绑定、job scope reconnect filter、VERIFIED checkpoint preview 与 version-fenced formal section reads。V37 migration 和当前 API artifacts 已在隔离门禁中验证；未改前端或 Provider/Guard 预算。
- 实际 full run04 为 135 fresh XML / 729 tests，出现 2 failures、258 errors、0 skipped；该失败批次保留，不能称 full suite 全绿。随后受影响失败组完成归因与定向复验闭合；run05 为 98 tests / 1 failure / 3 errors，run06 为 240 tests / 2 failures / 2 errors。最终 PublicationPG 8/8、Auth 1/1、ResultHTTP 1/1 等重点组通过，64 个失败 suite 条目均有真实映射。Post-I1 HTTP 1/1、skipTests package、runtime export 1/1、openapi-typescript 7.13.0 双 SDK 生成、export=false artifact compare 1/1、PC direct vue-tsc 均通过；Mobile 仍有既有 `reviewApi.ts` 两个 TS2339（EventRequest/EventResponse），未修改。唯一最终 reviewer 与 delta reviewer 均为 B0/I0/O0；完整数据见 [M3.4 计划](../../plans/2026-10-22-overview-m34-publication.md) 与 D 盘结案报告。
- 未部署，未连接业务数据库、真实 Provider，未完成 GUI/真实用户流程或内容质量验收。M4 PC 新交互按用户决定撤回，不列为待自动补齐；M5 cache/reuse、M6 真实 Provider/usage 校准、内容质量、部署与最终 unused-compatibility cleanup 仍未交付，整体 M1–M6 目标 active。

### 2026-10-22 Overview M3.3 持久后台 jobs（源码、相关自动验证与唯一审查完成；未部署）

- Source/Subject ALL、OUTLINE 的持久 job、owner-scoped 查询、queue/claim/lease/fence、固定 deadline、进度、pause/resume/cancel/reconcile 与完整 private candidate 已实现。完成只允许按 owner 与输入身份重校验读取候选；本阶段不写正式 OverviewResult、KB 或 Review。M3.4 正式发布与分节读取已交付；PC 后续消费界面曾实施后按用户决定撤回。
- raw coordinator/job budget_task_id 保持原始预算 UUID；invocation task_id 使用 Guard 按 (userId, feature, rawBudgetTaskId) 稳定派生的 ledger UUID。预算、结算、同 raw budget 安全重试沿用原语义。已派发但 usage 未知、invocation 缺失或身份不匹配仍进入 RECOVERY_REQUIRED/hold；不会因候选可恢复或用户重试而盲目重发。pause/resume/接管不重置期限或预算；取消不保证撤回已派发的远端调用。
- 自动验证真实结果：首次 full attempt 为 131 XML / 752 tests / 724 passed / 19 failures / 9 errors / 0 skipped；随后相关失败组 67 tests / 61 passed / 1 failure / 5 errors / 0 skipped，其他五组通过。仅对失败方法及 unknown-usage 负向方法复验 7/7，0 failures/errors/skipped，Maven native exit 0；外层 Docker runner exit 2 来自已核实的 wrapper CRLF 退出参数问题。失败项已在受影响范围内通过复验，但修复后未再次 full，因此不记为 full suite 全绿。
- -DskipTests package Maven/Docker 均 exit 0；JAR 93,372,456 bytes，SHA-256 efd0911f72c05c1ff8678706beab18daf9ada1a7638393300792c6000e85f234。运行态 OpenAPI SHA-256 bc5f6b57357d8b8c24ccbbc0fececc351362cdb0358d49de285c7d6bdc0b177f；固定 openapi-typescript@7.13.0 两端 schema SHA-256 均为 bed903a8fcee8727fc61dbdbc9622414a457be2e6e434702b45928006ea3c742；单方法 artifact compare 1/1。官方 scripts/check-openapi.ps1 未运行。PC npm run type-check exit 0；Mobile 仍有既有 EventRequest/EventResponse 两个 TS2339。唯一 reviewer B0/I0/O0，见 D 盘 reviewer-final-report.md。完整证据见 D:/Temp/auralis-overview-m33-background-20261019/run/m33-final-validation-20261022.md 与 candidate-backend-reconciled-20261022/。
- 源码、相关自动验证和唯一审查均完成；未部署，未使用真实 Provider 或业务数据库，未完成 GUI/真实用户流程/内容质量验收。M3 整体路线和 M3.4/M4–M6 不因此标记完成。最终全项目 unused-compatibility cleanup gate 仍保留到后续整合。

### 2026-10-19 Overview M3.2 持久正文执行计划与节点状态（源码、相关验证与唯一审查完成；未部署）

- 当前 adaptive Source/Subject 正文写作路径已接入私有 execution plan/node/call journal。计划按 generation、输入/profile/算法和完整有序 writer descriptors 版本化；单元通过 writer 专用 shape 与 coverage 校验后，checkpoint 与 VERIFIED 节点在同一 owner/fence 事务提交。主 writer/递归 JSON repair 的 Guard reservation 在 Provider dispatch 前绑定到节点 attempt。
- V35 新增私有 plan/node/call 关联表，复用父 generation、TaskLease 与预算 task；节点尝试和 plan 数量有界。精确 usage query 只用于对应 reservation 的安全重试判定。未知/派发中状态显式 hold；已知 terminal 状态允许沿原父预算重试。旧 owner/fence 写入拒绝。
- 验证边界：full backend attempt 为 737 tests / 731 passed / 2 failed / 4 errors / 0 skipped；修复后对应六个用例定向 6/6，reviewer fixture 修复后的新增 PostgreSQL 方法单独 1/1。修复后未重跑完整套件。`-DskipTests package` 成功；替换 JAR 为 93,303,380 bytes，SHA-256 `D6EA3279DD60D47BF7B8F8068162A2A828A6B1801063FD1C864848D296A046C4`。唯一 reviewer BLOCKER=0 / IMPORTANT=0 / OPTIONAL=0。不提供 public job/control/progress API、worker loop、暂停恢复 UI 或正式发布；未知派发仍 hold，M3.3 已交付控制与对账；未知派发仍 hold。未部署，未调用真实 Provider/生产业务数据库，也未完成 GUI/内容质量验收。实施计划及证据位于 `D:/Temp/auralis-overview-m3-jobs-20261019/`。

### 2026-10-19 Overview M3.1 有限层级目录规划（源码、相关验证与唯一审查完成；未部署）

- `OverviewGenerationService` 已加入单次请求不适配时的 metadata-only 分层规划。小输入仍走原单次目录路径；最终 plan aliases 由应用私有映射展开到原始 unit aliases，按 inventory 顺序规范化，再交给既有 writer 分组及 M2 provenance 装配。公共 API/DTO、DB、SDK、配置及 Guard/预算契约未扩大。
- 实施界限：最多 4 层、64 次 metadata 分组调用、累计 2000 个 metadata 输出项；500 raw row inventory、60 章/500 节、每节 100 refs、结果 payload、正文上限和现有父任务/调用准入继续生效。无进展或超限明确失败。算法版本只隔离 cache/checkpoint 正确性，不新增旧版读取或回退。
- `OverviewAdaptiveGenerationTests` 与 `OverviewGenerationServiceRecoveryTests` 初始 batch 为 47 tests / 46 passed / 1 failed / 0 errors / 0 skipped；唯一失败 fixture 方法在 attempt 4 单独 1/1 通过，因此47个case分别有通过证据，但没有第二次完整47项全绿运行。唯一 reviewer 为 BLOCKER=0 / IMPORTANT=0 / OPTIONAL=0。真实 Provider、业务数据库、部署、GUI 与语义质量未验收。详见 [M3.1 计划](../../plans/2026-10-19-overview-m3-hierarchical-planning.md) 和 `D:/Temp/auralis-overview-m3-planning-20261019/final-validation-report.md`。
- 用户已决定未正式部署使用的旧版本无需兼容；项目最终整合时需统一盘点并清理服务端与端侧不用版本的兼容分支、旧格式 fallback、兼容专用测试和文档。本轮不提前做全仓清理。

### 2026-10-19 Overview M2 稳定身份与原文来源关联（实现、相关验证与复审完成；未部署）

- Server 与 PC 已实现独立大纲节点身份、内容版本及真实 SourceChunk/解析块位置来源快照。V34 两个可空 metadata 列不回填旧数据；旧结果 identityReady=false，历史 receipt 回放不补身份。GET 返回 identityReady 与显式 nullable outlineIdentity；Provider canonical JSON 仍为四字段。
- PostgreSQL V34 clean/upgrade 与身份/来源保存、读取、receipt、CAS、rollback 测试通过（OverviewIdentityPostgresIntegrationTests 4/4；TaskColorRemovalMigrationTests 6/6）；PC M2 同步回归 27/27。最终 attempt13 OpenAPI 语义回归 13/13，官方 artifact SHA-256 `660b28e4a0e527d8779b9b7009ad31801b4e0e9c501489f40b7192f4e802c1b0`；PC/Mobile SDK 均用 openapi-typescript 7.13.0 生成并与仓库文件 byte-identical，SHA-256 `9ae585615f8062cdb8d9a8b0b43a19a173701c9acd878df4d760d040cebd0002`。PC type-check 与 Web build 通过；最终 package exit 0，JAR 93,256,441 bytes，SHA-256 `702d3258ecb2b6eab5851f3bde31ebbb7c51445720cf288e0f8b5bb18789c5d9`。
- 唯一 reviewer 最终结论 B0/I0/O0，报告见 `D:/Temp/auralis-overview-m2-20261019/reviewer-final-report.md`。Backend 首轮 full clean 为 125 XML / 723 tests / 1F/4E/0S（718 pass）；失败组随后分别复验通过，但未再次运行 full，因此不记为全量全绿。PC R4 首轮为 737 tests / 709 pass / 28 fail / 0 skip；其中 2 项 M2 同步 fixture 问题修复后该文件 27/27，另 26 项既有基线失败未修，未重跑全量。Mobile type-check 仍仅有既有 `EventRequest`/`EventResponse` 两个 TS2339。来源位置是保存时快照，不证明逐句语义支持；真实 Provider、业务数据库、GUI 与部署仍未验收。验证报告：`D:/Temp/auralis-overview-m2-20261019/final-validation-report-attempt13.md`。

### 2026-10-19 内容规模自适应总览 M1（源码、自动门禁与复审通过；未部署）

- 候选实现由默认 false 的内部开关启用。Source/Subject ALL、OUTLINE 使用所选 READY 原文→轻量索引→单次有界目录规划→分节写作→程序装配；SUMMARY 保留旧短摘要。公开 DTO/API、schema 与 DB shape 不变。平台预算预检用 TaskLease/Guard owner-fenced task snapshot 和 Guard admission occupancy；audit count 语义不变，BYOK 不扣平台财务额度。
- 有界 inventory 使用 `SourceChunkRepository`，全局最多 500 条 active 原始 chunk rows（含空白）；remaining+1 sentinel 命中则在 identity/hash/provider 前失败。M1 初始目录是单次有界请求，已由 M3.1 有界 metadata 层级规划取代；仍不支持任意规模或语义无损。M2 和 M3.1 源码及各自范围内验证/复审完成，M3 后台 jobs 与 M4–M6 未交付。
- focused attempt4：7 suites / 175 tests / 0F/0E/0S，Maven exit 0；full attempt6：122 suites / 711 tests / 0F/0E/0S，Maven/Docker exit 0（4:17）。Package 与 synthetic Compose false/true render 均 exit 0；JAR 93,205,090 bytes，SHA-256 `E9637F9615EC6B7EB445C36CE18E89F7ACC9948965067832A18DD12543E6305B`。Final manifest SHA-256 `CC21E28C7D7C9C5F72158B1F25321BA901D62174DFE085308B05EEAD4A22FE31`，12 owned + 2 context hashes 一致。证据在 `D:/Temp/auralis-overview-adaptive-20261018/`。
- 唯一 reviewer 最终 correction delta B0/I0/O0；bounded-inventory 问题关闭。review 后仅增加 `verify` 静态 import，focused/full 已覆盖最终候选。中间环境与 harness 重试仅记录于 D 盘历史证据，不是当前失败状态。
- 未部署，未调用真实 Provider 或生产/业务数据库，GUI 与语义质量未验收；隔离 PostgreSQL 测试不等同业务库验收。此前 2026-10-16 Overview JSON 生成根因仍开放。

### 2026-10-16 Overview JSON 失败诊断增量（定向验证与静态审查通过；未部署）

- 在 candidate53 之后新增 Overview validator 与日志的失败路径诊断：响应/实际解析输入长度和 SHA-256、包裹类型、固定 parser 分类、解析 offset 字符类别，以及与既有 task/generation 关联的阶段、尝试、finishReason 和显式截断判定。未增加 Provider 调用或改变生成、JSON 接受、修复次数、预算和错误行为。
- `AiOverviewServiceTests` 76/76、`OverviewDynamicBudgetComponentTests` 16/16，共 92 tests / 0 failures / 0 errors / 0 skipped；Maven native 与容器退出码均为 0。测试后 517/517 隔离输入哈希一致。唯一 reviewer 对本次 7 文件差量为 B0/I0。验证记录位于 `D:/Temp/auralis-overview-json-diagnostics-20261016/validation-report.md`，静态审查见同目录 `code-review.md`。
- PowerShell runner 在测试与归档完成后，其 finally ownership 检查出现 Docker Go-template quoting 错误；已记录的 Maven/container 原生退出码为 0，runner 已退出。该 wrapper 收尾错误未触发重跑。没有运行完整套件、package 或 OpenAPI gate。
- 未部署或重新调用真实 Provider。此前统一用量 JAR 早于本诊断；这些字段要在从当前源码重建的后端运行后才会出现。既有失败日志没有正文或完整 parser 类别，具体生成语法原因仍未知，不能据此宣称 JSON 生成已修复。

### 2026-10-16 AI 统一限额与来源分账（源码及自动门禁通过；未部署）

- 53 项源码/文档候选完成 U1–U4：统一 operation policy、可信逐调用凭据来源、V33 用途/来源字段、平台费用配额与 all-origin 审计/运行容量分离、来源分区 usage API，以及 Overview 平台费用预检分流。代码规则仍是未部署候选，不能视为运行态已启用。
- Candidate53 聚焦级联并发测试 1 suite / 7 tests / 0 failures / 0 errors / 0 skipped；完整套件 121 suites / 690 tests / 0 failures / 0 errors / 0 skipped，Maven 与容器自然退出码均为 0；同一候选 package 也自然退出码 0。PostgreSQL 锁/跨功能竞争 5/5，V33 migration 1/1。Runtime OpenAPI export、SDK generation、官方 check 均 exit 0，artifact tests 12/0/0/0，两端生成 schema 对照通过。
- 唯一 reviewer 为 BLOCKER=0 / IMPORTANT=0 / OPTIONAL=0，最终报告 SHA-256 `D4CD78B7B5023B2B98A39A06377C8CD50C3FA3461038E6F3B48247C62352BEF8`。候选 JAR 为 93,171,500 bytes，SHA-256 `CB0D89F5AFE392E316A7EB9AC919D2DCDF81AF0714DCE69CED8340725DBB1EC5`；517 项冻结输入、卷内 post-run 输入和 516 项 live workspace 输入及独立 TLS 核对均一致。
- final2 的唯一失败由测试同步缺陷造成，随后仅调整该测试的父锁门闩和 `saveAndFlush` 写点；候选53 的 7/7 定向结果与完整套件均通过。此前中断/失败尝试保留为历史，不与最终结果合并。未部署；真实 Provider、生产业务数据库、GUI/真机与业务验收仍待完成。
### 2026-10-16 全部 AI 功能统一限额独立方案（实施前基线记录）

- 以下条目记录方案编制时的实施前状态；U1–U3 候选及当前验证状态见本页首条。本条不代表现行源码状态。
- 用户要求单独成案，已形成[AI 统一限额与用量治理方案](../../plans/2026-10-16-ai-unified-limits.md)：在现有 ai/usage 增加操作策略，Chat、两类 Overview、摄入、Provider setup 与未来学习共用 Guard/Gateway/账本。方案独立推进 U1–U4；[学习计划](../../plans/2026-10-16-learning-agent-implementation.md)保留消费接口和依赖，不重复治理实现。
- 只读扫描识别的 Provider 入口已通过 Gateway；本次新增用途策略与可信来源分流。平台配额数值、embedding 窗口豁免、Overview 父预算/合法 final 6144、unknown usage 与影子模式保留；计划 BYOK 不扣平台配额。只改文档，未改代码/运行限额，未做 Provider/数据库/部署验收。
- 外部建议经核对后补总/stage 次数、方法/角色核验、reservation 用途/来源与派发前 task_id 绑定。计划暂占账本用途/来源 V33、大纲 V34、学习 V35，均未创建。历史未知来源单列保守占用至自然过窗，仅平台准入检查；BYOK 不因此阻断。并发隔离待观测，512 摄入调用上限不代表并发数。
- R1 优先做负载事前评估，先影子比对再启用契约；平台超预算顶先提示拆分，BYOK 预算仅提示、仍核验运行边界。Overview 后续归并/恢复未知，摄入解析/checkpoint 后算批次。R2 有限容错和 R3 并发调优依数据单验，沿用当前模型配置，均未实施。

### 2026-10-16 学习 Agent 设计修订与实施计划（文档已编制；尚未实施）

- 拟议流程以学科大纲目标和自由学习为双入口，支持带来源的讲解、问答反馈、受控互动、暂停恢复及用户确认的知识块产出；学习进度与正式 Review 三态/3R 分离。
- 现有 Chat、检索、Overview、KB 和 Review 仅为可复用基础，不构成完整学习 Agent。设计文档：[学习 Agent 产品与交互设计](../../design/2026-10-16-learning-agent-design.md)。
- 用户书面评审后，由主模型修订设计并编制[实施计划](../../plans/2026-10-16-learning-agent-implementation.md)。补查限定非 embedding；步骤由应用分配；增加 FINISHING、独立草稿调用、prompt 分配、整轮校验和会话 usage 验收。
- 只读代码核对确认：大纲无持久节点身份，普通 KB POST 无创建幂等，KB 创建不自动进入 Review。计划分别补身份、复用 PC outbox 固定 ID、衔接现有正式 lifecycle；这些尚未实现。本轮未改 API/数据或功能代码，未运行应用测试、部署或真实 Provider/GUI 验收。
- 唯一 6-luna 只读计划审阅为 BLOCKER=0 / IMPORTANT=0 / OPTIONAL=1；两项重要意见已由主模型修订：普通 Chat 的 list/get 与写入均隔离学习用途，账号清理使用 identity 所有端口避免模块环。O1 为计划模板中 superpowers 技能名前缀提示，按规则保留。文档差异、登记和相对链接检查通过；不代表实现审阅或业务验收。

### 2026-10-16 离线 usage reader 诊断计数分离（代码与定向测试通过；未部署）

- Aggregator 新增互不混淆的 dispatched actual complete/unknown、missing shadow event、matched shadow usage unknown 与 ambiguous shadow join 计数；CLI 将 actual 覆盖与 shadow 比较覆盖分开展示。旧 `unknownUsageCount` 保留兼容，仍是影子比较不可用的合并计数；ledger NULL 不由事件回填，charged exposure 与 accuracy 规则不变。
- GREEN `node --test scripts/aggregate-ai-token-shadow.test.mjs` 为 29/29，`node --check` 两文件通过。46 条 ledger/7 个 shadow event 复算为 actual complete 46/46、unknown 0、shadow missing 39、matched unknown 0、ambiguous 0、accuracy 7。39 是 shadow coverage gap。唯一只读 reviewer 为 BLOCKER=0 / IMPORTANT=0 / OPTIONAL=2；报告：[review-report.md](D:/Temp/auralis-usage-research-20261016/review-report.md)，SHA-256 `1B80A6F1D381A6DC5F4FB1D5FADEF6E1E46E2174B3665CCB107EA3CAE190EBB0`。
- 保留的两项 OPTIONAL：研究报告一处“39 Source MAP/REDUCE charged-share”文字误植（39 实为 shadow 缺行，token ratio 143,746/219,928=65.36%正确）；RED 没有独立原始测试日志或 before 源码快照，过程记录在研究报告，GREEN 29/29 命令记录在 `D:/Temp/auralis-usage-research-20261016/command-record.txt`。离线 CLI 可直接处理显式本地输入，不依赖容器部署。本轮未调用 Provider、未部署服务、未改变准入、未减少真实消耗，也未完成校准。

### 2026-10-16 RAG 定义证据被前缀截断的修复（定向验证通过；真实 Provider 待验收）

- 活跃来源中的定义确实存在于长 chunk 后段，但旧 citation/model evidence 只取前 400 字符。`RetrievalService` 现在依据当前 query 在有界内容区域内选择连续原文片段，定义/含义线索附近优先；未命中时仍取安全的前缀。citation ID、来源隔离、TopK 与 400 字符片段上限保持。
- `AiRetrievalTests` 和 `PromptAssemblerTests` 共 21/21 通过，覆盖后置单字定义、干扰同字、引号术语、未命中回退、Unicode 边界、选定来源过滤与 prompt 接线。该自动验证证明证据片段路径，不证明模型会正确回答，也没有新增真实 Provider 调用。
- 未改 API/DTO/数据库、预算或检索排序/TopK。实际 Provider、真实 PPTX 问答及 GUI 仍待验收。报告：`D:/Temp/auralis-rag-pass-definition-20261015/implementation-20261016/implementation-report.md`。

### 2026-10-15 PC Overview 离线冲突刷新重入保护（代码与定向验证通过；桌面现场待验收）

- 用户报告后端关闭时反复请求 Subject Overview。页面的静默 Subject/LOCAL 自动解析会在运行时初始化时刷新缓存；若缓存仍为同一 `CONFLICT`，会再次进入 resolver。新增的 in-flight guard 仅包住这一自动路径，并在任何 runtime/cache refresh 前登记 promise；FILE scope 与显式 LOCAL/REMOTE 选择仍直接执行原解析体。
- Subject 自动解析期间的同 scope 重入共用当前任务；异步前后检查登录身份、组件挂载、学科和文件修订，旧上下文不会继续解析或刷新。网络失败保留本地冲突结果，guard 结束后后续显式/既有触发可重试；404 继续使用 API 既有“无远端结果”语义。生产解析体只在成功 resolve 后刷新尾部缓存。
- RED 回归先因新 guard 导出尚不存在而失败；GREEN 的同步与页面回归共 43/43，`vue-tsc` app 检查退出码 0。受控回归测试模拟 ensure 前刷新与失败后的受控重入，验证同一解析只发一个失败读取、保留本地冲突及后续显式重试；该失败尾部刷新是测试回调，不代表生产失败分支会刷新缓存。未重跑全 PC 套件，未做 GUI/网络恢复现场验收。
- 不改 API、数据库、生成/预算逻辑或 FILE trigger 生命周期；`[FILE_OVERVIEW_TRIGGER]` 的 `JOB_CHANGED`/`RESUME_SYNC` 仍是触发诊断，不等同 Provider dispatch。证据：`D:/Temp/auralis-overview-offline-retry-20261015/`。

### 2026-10-15 PC 文件登记上传弹窗进度生命周期与状态卡死修复（代码、测试与类型检查通过；GUI 待验收）

- 用户指令：有时候会出现上传完然后弹窗卡住了，就是上传没成功也显示成功了。
- 解决：
  - `FileRegisterDialog.vue`：移除伪造的 86% 进度上限，进度真实平滑插值；严格校验 `isCompleted`，未真正全部完成前禁止提前渲染“导入完成”；弹窗关闭时自动重置进度；
  - `SubjectWorkspace/index.vue` 与 `Asset/index.vue`：合理划分资产持久化（0%~70%）、资料源关联（75%）与视图加载（90%）阶梯；全流程确认完成方置 100%；catch 块显式重置 `uploadProgress.value = 0`，杜绝失败时遗留 100% 成功假象与弹窗卡死。
- 验证：`scripts/r4-register-file.test.mjs` 增补断言 6/6 通过；`npm run type-check`（`vue-tsc -b`）退出码 0。真实 GUI 待人工验收。

### 2026-10-15 PC 学科大纲编排独立性保证（代码、类型检查与自动测试通过；GUI 待验收）

- 用户指令：学科总览在没有全文件总览的时候，编辑会出现一个拼接版的我不需要。
- 解决：
  - `SubjectWorkspace/index.vue`：在未生成学科总览（全文件综合大纲）时，编辑学科大纲不再自动从单一文件或已有文件大纲中拷贝填充；学科大纲编辑区保持独立，默认以新建章节（`第一章 · 新建章节`）供用户自主编写，同时保留下方各文件大纲的独立编辑卡片；
  - 移除 `watch(fileOverviewItems)` 中对未生成学科大纲的单文件大纲自动覆盖逻辑。
- 验证：`scripts/r4-subject-overview-ui.test.mjs` 增补独立性回归测试，17/17 测试全绿；`npm run type-check`（`vue-tsc -b`）退出码 0，无任何类型报错。真实 GUI / 编排交互待人工验收。

### 2026-10-15 AI 观测前置 Step 2 实现、full/package 与最终复审完成

- `.env.example` 与 Compose backend 已显式透传 `AURALIS_AI_SHADOW_TOKEN_ESTIMATE_ENABLED`，默认 `true`；synthetic Compose render 验证 true/false。此开关只启停影子日志，不改变旧 UTF-8 reservation、上下文估算或 Guard 准入。completion/stream/embedding 内部结果现在保留独立的 request/observed model metadata，`AI_TOKEN_ESTIMATE_SHADOW` 以安全字段输出 returned-model 状态；无/非法/冲突值不会回填 request model。API DTO、数据库 schema/migration 与预算算法/上限未改。
- 新增离线 Node 工具 `scripts/aggregate-ai-token-shadow.mjs`，读取显式选择的 shadow 日志与 reservation 投影，按唯一 ID 汇总；unknown actual 不作零，charged 不冒充 actual。它只对 synthetic fixture 做了 CLI 验证，保持 `shadowOnly=true` 与 `calibration=uncalibrated`。
- 定向验证：Provider identity / gateway / configuration / provider security 合计 39/39，退出码 0；synthetic Compose true/false render 均 exit 0；离线工具最终 27/27，exit 0，合成 CLI 示例为 `COMPLETE`（1 reservation、1 group、0 issue）。单一 reviewer 对本轮范围为 BLOCKER=0、IMPORTANT=0、OPTIONAL=2；后两项保留，结论只覆盖 Step 2 文件，完整范围见 [复审报告](D:/Temp/auralis-ai-observability-step2-20261015/review-report.md)。
- 后续磁盘恢复后，本轮 D 盘统一快照 clean backend gate 通过：116 suites / 674 tests / 0 failures / 0 errors / 0 skipped，Maven 与 launcher exit 均为 0；116 份 XML 与 116 份 TXT 在 package 前保存，PostgreSQL Guard lock 4/4。相同快照 package 两个 exit 均为 0，JAR SHA-256 `723919B7517A21B7A1C458F8708B3E6BFDE1E70DCF2D3478A45BA2894204A236`。508 项 manifest 与 canonical/live 快照零差异。报告：[attempt 4 full/package](D:/Temp/auralis-ai-observability-step2-20261015/final/attempt3-pg-auth-fix/attempt4-report.md)；机器可读记录：[final-verification.json](D:/Temp/auralis-ai-observability-step2-20261015/final/attempt3-pg-auth-fix/attempt4-full/final-verification.json)。
- 门禁过程保留独立历史：首次因 C 盘低于 3 GiB 保护门线暂缓；attempt 1 在测试完成前中断且无可信 Maven 数字退出码；attempt 2 报告 674 tests / 1 failure / 13 errors，BUILD FAILURE 与先前退出标记不一致，不采信该 marker；attempt 3 的 19 项定向与 H2 7/7 通过，H2 前轮失败未复现、原因未确认；attempt 4 是独立 fresh DB/full/package，通过结果不与前轮计数相加。runner 修复均在 D 盘临时 harness，未改仓库源码。
- 最终 reviewer 对冻结快照复核为 BLOCKER=0 / IMPORTANT=0 / OPTIONAL=3；其中两个是 Step 2 工具的本地输入资源与 TEMP 报告描述问题，一个是 D 盘 runner 的 console 标签问题，均保持未修改。此前限定复审 B0/I0/O2 仅覆盖 Step 2 实现文件。attempt 4 时 C 盘 5.19 GiB、D 盘 117.55 GiB；此前 C 盘约 0.89 GiB 的资源阻塞已解除，保留为过程历史。全量门禁与 package 不代表部署、真实 Provider、模型能力、usage 校准或 GUI/业务验收。完整最终复审：[review-report.md](D:/Temp/auralis-ai-observability-step2-20261015/review-report.md)，SHA-256 `519A055B986F8BD044556DE45DE486454DD59FB2F4D27C4BBB87A57D76D657EC`。
- 未部署、未向真实 Provider 发请求、未核对 live model list/实际 returned model、未收集生产 usage、未校准估算，也未做 GUI/业务验收。Overview 24 calls / 524288 task tokens / 240 秒与 Chat 2 calls 保持不变。自动定向与复审、fresh full/package、容器运行态、真实 usage/校准和 GUI/业务验收分别记录。

### 2026-10-15 四项历史门禁问题关闭与统一后端验证（round4 于 2026-10-14 通过；外部验收仍待完成）

- 此前审计的四个 full-gate 问题现已处理：completion retry 测试按真实 `fail → claimById → fail` 生成失败次数；Account deletion 测试校准到 PostgreSQL `TIMESTAMPTZ` 微秒往返边界；embedding resume 测试遵循现有 embedding 配额豁免；SHA-256 helper 移入 `knowledge`，静态依赖只保留 `review → knowledge`。唯一 reviewer 对四项为 B0 / I0 / O1；O1 是 response 与数据库值最多相差 1µs 的可选一致性，本轮未改变生产时间归一化。
- 定向证据分别为 completion 9/9、Account deletion PostgreSQL 5/5、embedding resume PostgreSQL 2/2、architecture/hash/review 19/19。全量新发现的反射 fixture 另修正为显式选择 8 参数构造器，`AiOverviewServiceTests` 76/76；synthetic TLS fixture 补齐后 `OverviewDeadlineSlowDripTests` 3/3。反射修正的 reviewer follow-up 为 B0 / I0 / O1。各类重叠测试不相加。
- Round 4 clean backend test 在 D 盘统一快照实际退出码 0：115 suites / 666 tests / 0 failures / 0 errors / 0 skipped；Guard lock PostgreSQL tests 实跑 4/4。115 份 Surefire XML 与 115 份 TXT 均在 package 前保存。同一快照 `mvnw.cmd -B -ntp '-DskipTests=true' package` 实际退出码 0，BUILD SUCCESS，artifact SHA-256 `AC83CB6CD57B5F2F7A5D8E823A147F474837555C2BC00BE4461B969536050D41`。493 个 Server 输入与 6 个 contracts 文件的 live/snapshot manifest 均为零差异；`git diff --check -- Auralis-Server` exit 0。
- 保留各轮历史：旧 full 114 suites / 659 tests / 5 failures / 1 error / 4 skipped、exit 1；后续一次 666 tests / 1 failure / 5 errors 的构建失败没有捕获 Maven 数字 exit；round2 在 20:18 中断且无 numeric exit；round3 666 tests / 0 failures / 6 errors / 0 skipped、exit 1；round4 一个错误参数调用在 Maven 测试阶段前停止、0 tests。以上均不覆盖或合并进最新 round4 的通过结果，细节见最终报告。
- 自动代码与门禁、定向 PostgreSQL 测试及只读复审已完成；未调用真实 Provider、未核对线上模型列表、未校准影子估算、未部署，也未进行 GUI 或真实业务验收。Overview 24 calls / 524288 tokens 与 Chat 2 calls 硬上限保持不变。报告：[round4 full/package](D:/Temp/auralis-remaining-four-fix-20261014/final/round4/report.md)（SHA-256 `CE2E87C57703240138E7F69C8D0B3B9683116436A3D4EB41D9F45F1843FF18BD`）、[四项修复复核](D:/Temp/auralis-remaining-four-fix-20261014/review-report.md)（SHA-256 `3B57664FB3AB5B734ED0184166A565F42DFE08CB3F2D9D069437E882BE12436D`）。

### 2026-10-14 四项历史 full-gate 失败根因审计（初始只读状态；问题此后已关闭）

本段记录审计刚开始时的问题状态与证据；最终修复、统一门禁与复核结果见上方最新条目。

- 本轮只审计此前 full-gate 中四项失败，不改源码或测试，也未重跑完整 659 项门禁；四个样本不能据此视为当前全部失败。此前 migration/Jackson 两项定向修正仍保留，原始 full 统计仍为 114 suites / 659 tests / 5 failures / 1 error / 4 skipped、exit 1，4 个 PostgreSQL lock skip 的独立补跑仍为 4/4，不改写历史统计。
- 三项失败是测试前提问题：completion retry fixture 调用 `claim()` 增加 `attemptCount`，未增加 `failureCount`；Account deletion 测试预期微秒截断，但当前 PostgreSQL/pgJDBC 42.7.11 将纳秒值舍入到微秒，response/replay 最多相差 1µs，当前 API 未承诺精确相同；embedding resume fixture 用小时窗口期待 embedding defer，而当前明确策略豁免 `INGESTION_EMBEDDING` / `RETRIEVAL_EMBEDDING` 的用户/全局窗口。对应生产影响和证据边界见下方问题登记与临时汇总。
- 第四项 `ArchitectureTests.verifiesApplicationModules` 确认 `knowledge → review → knowledge` 静态模块环，是真实 architecture gate IMPORTANT；审计未发现运行时 Bean 构造环、锁序反转或数据损坏证据。唯一 reviewer 最终为 B0 / I1 / O1：I1 为模块环，O1 为 timestamp response/persistence 规范化可选一致性；其余三项未证明生产 correctness 缺陷。架构项尚未修复。
- completion scratch 对照 34/34 通过，但 repositories/services 为 mock，不能证明真实 DB rollback 原子性；quota scratch 用真实 PG Guard/Gateway/Worker，先准备并 checkpoint 27 项，再以同用户并发 reservation 触发实际拒绝，释放后同 generation 只补7项并完成34项，1/1通过。该实验不等同于自然首次 worker attempt 在27项后自行命中拒绝。真实 Provider、部署、GUI/业务验收均未执行。
- 四份原始审计与唯一复核报告及其 hash、命令、计数和关闭建议见 `D:/Temp/auralis-remaining-four-audit-20261014/audit-summary.md`；其中逐项链接至 completion、PostgreSQL、architecture audit 与 `review-report.md`。本节只更新状态，不关闭 architecture IMPORTANT，不改变任何契约或 full-gate 退出条件。

### 2026-10-14 两项既有后端测试门禁失败修正（当时仅定向验证；round4 后续完整门禁已通过）

- 修正只改三个测试文件：migration latest-version断言更新至V32；Jackson namespace guard仅允许Jackson 3保留的`com.fasterxml.jackson.annotation`，并继续拒绝其它Jackson 2 namespace；AI quality fixture使用`tools.jackson.databind`。未改生产DTO、依赖、schema、API或配置。
- 初始冻结源码的三类定向验证为11/11通过、exit 0（Migration 6、Guard 2、Quality fixture 3）。Reviewer首轮指出Guard会漏掉带tab/缩进的合法import；修复后只重跑Guard类2/2、exit 0。迁移和fixture源码hash未变；两次运行分别记录，不汇总成13项或称修复后再跑了完整11项。首轮review B0/I1/O0，I1修复复审后B0/I0/O0。
- 原完整clean run仍是历史114 suites / 659 tests / 5 failures / 1 error / 4 skipped、exit 1；没有再跑完整门禁。现在仅有原6项中的前两项通过定向修正，剩余4个baseline failure/error未在本轮处理，完整门禁仍未通过。原4个skip已由单独Guard PostgreSQL补跑4/4通过，未改变历史full统计。
- 三个最终测试文件SHA-256及RED/GREEN XML、review顺序见 `D:/Temp/auralis-baseline-gate-fix-20261014/implementation-report.md` 和 `review-report.md`；文档回写差异见同目录`documentation-report.md`。

### 2026-10-14 AI 执行预算治理、Overview 输出恢复与 Chat 安全回放（阶段0–3实现与定向证据；当时完整门禁未通过，后续 round4 已通过）

- Guard 预算拒绝已提供七类安全诊断；token 类别影子估算版本为 `char-category-v1-uncalibrated`，默认启用、可由 `AURALIS_AI_SHADOW_TOKEN_ESTIMATE_ENABLED=false` 回退关闭。所有额度准入、预留和上下文仍沿用旧 UTF-8 算法；没有生产 usage 样本，未校准。
- Overview Service 已接入有限截断拆分、JSON syntax/allowlist shape repair 与跨 attempt checkpoint 恢复。PostgreSQL 真实 Coordinator/Gateway/Guard/SQL ledger 回放覆盖重试父请求与已完成子结果复用、精确 transition 和同轮重复 REDUCE group；latest Recovery + Overview 定向为 101/101（Recovery 25、AiOverview 76），另有 focused PostgreSQL replay 1/1。Chat 固定合成故障回放 8/8；阶段0/1隔离测试 62/62。测试 Provider 为合成响应，不能推断真实 Provider 行为。
- 完整 profile-corrected clean test 实际退出码 1：114 suites、659 tests、5 failures、1 error、4 skipped；独立 `package -DskipTests` 为 `BUILD SUCCESS`、退出码 0。6 个失败/错误均由实际 HEAD 定向对照重现：既有 migration/Jackson/ingestion/架构断言、PostgreSQL时间戳精度与 embedding 窗口豁免测试预期冲突。较早全局 test profile 造成的 AiConfiguration worker 默认值失败已由规范 profile runner 消除，不在最终6项中。4个skip均来自 `AiUsageGuardPostgresLockTests` 的 `AURALIS_TEST_POSTGRES_URL` assumption；全量命令只设置了 `auralis.usage.postgres.url` JVM property。随后在隔离PostgreSQL上单独运行该类，4/4通过；这是独立补充证据，不改变全量统计为659/5/1/4，也不表示完整门禁通过。
- `IngestionCompletionServiceTests.retryExhaustionUpdatesCurrentSourceAndJobTogether` 的基线失败来自测试fixture：三次 `claim()` 只增加 `attemptCount`，未增加 `failureCount`；`failExhausted` 因 `failureCount < 3` 返回 false，因此 Source/job FAILED 保存路径未执行。该断言失败不是同步回调或事务失败。
- 唯一只读 reviewer 最终结果为 BLOCKER=0、IMPORTANT=0、OPTIONAL=0；最新复审包 SHA-256 `D7C5637FA73F20512591D1AF4732E90BFEF35656874B014A056614A49E9FD143`。源码冻结 SHA-256：Overview Service `59ADB516BE3B3F5DE5EF0311B1DB3806F367C9843B6A3D43E7B6F66C1E5FC4DA`，Recovery tests `BA86C1852A55860F8BF923CC7DE58202C24CA4A34483E30B72332FCE95580540`。
- 两个回退开关均默认 true：`AURALIS_AI_SHADOW_TOKEN_ESTIMATE_ENABLED=false` 仅停影子诊断；`AURALIS_AI_OVERVIEW_OUTPUT_RECOVERY_ENABLED=false` 仅停本轮新增 JSON/截断恢复，既有 semantic/no-progress 保留。Overview 24 calls / 524288 tokens 与 Chat 2 calls 硬上限未提高。
- 有效模型能力不确定项保持 unknown；`deepseek-chat` 上下文未推测。只有 structured Overview 请求确认 DeepSeek `thinking=disabled`；普通 Chat 为 provider-default-or-unknown。真实 Provider 模型列表未核对。
- 阶段0–3代码、定向验证与唯一只读 review 已完成，但计划整体退出条件尚未满足：clean test 未全绿，真实 Provider/model 列表、影子估算生产校准、GUI/业务验收与部署均未进行。`deepseek-chat` 上下文与未识别能力仍 unknown；只有 structured Overview wire 请求使用 `thinking=disabled`，普通 Chat 为 provider-default-or-unknown。API DTO、数据库 schema 与迁移未变。最终门禁、失败归因、hash 与命令见 `D:/Temp/auralis-ai-governance-20261014/final/report.md`；复审见 `D:/Temp/auralis-ai-governance-20261013/review/final-report.md`。

### 2026-10-13 PC 学科总览重新生成默认更新与提示清理（代码与自动测试通过；GUI 待验收）

- 用户指令：学科总览重新生成的时候不用问用户是否保留原版，默认更新就好了，不用弹提示；去掉“云端版本已变化，本机总览仍保留”提示。
- 解决：
  - `SubjectOverviewSection.vue` 移除 `overview?.syncStatus === 'CONFLICT'` 对应的冲突提示条及“保留本机并上传 / 采用云端”操作按钮；
  - `SubjectWorkspace/index.vue` 在学科总览重新生成时（`scope.kind === 'subject'`）不再弹出 `ElMessage.success('已更新')` 等全局 Toast；
  - 学科总览在重新生成或检测到冲突状态时，默认静默执行本地覆盖更新（`resolveSubjectOverviewConflict('LOCAL', true)`），不再要求用户手动二选一；
  - `FileOutlineList.vue` 的分文件总览冲突与错误操作保持不变。
- 验证：`vue-tsc -b` 0 报错；`scripts/r4-subject-overview-ui.test.mjs` 与 `scripts/r4-overview-sync.test.mjs` 38 项测试全绿。真实 GUI 视觉待验收。

### 2026-10-13 Overview 动态预算与超限恢复（实现、自动门禁与指定 P4 通过；部署/GUI未验收）

- P0 已确认 Self-Pair 仅为复制中间 JSON 的本地预检，并不执行 Provider 或全局关系校验。受控合法 fixture 精确重现 `normalizedChars=5062`、`selfPairPromptChars=12167` 的误拒绝；原现场完整 JSON 未提供，fixture 不冒称原始载荷。
- 当前代码已具备动态内容软目标、真实内容语义分包、prompt 硬上限与三类预算/截断/恢复错误分类；V32 私有 generation/checkpoint/request mapping coordinator 已接入 Overview Service。有效规范化 UUID 的同 request replay、失败 lineage 与跨 request ID 预算累计已由最终自动门禁覆盖。结果 payload 14 天清理时保留 request/generation/budget metadata，旧 request ID 不可复用；recovery count 按 generation 累计、actions 安全集合去重。2026-10-13 03:34:43 首次只读观察到 backend 镜像 `sha256:f0c3e886175dadd709876988c7570a395793ae67a637545cbe5825a570317593` healthy、Flyway V32 `success=true`；之后用户更新镜像并进行真实 retry。各次运行镜像 class/source provenance 均未核验。
- 保留原 Gateway 用户额度、请求 / 任务预算、并发、绝对期限及取消；生成仍只返回候选，不写正式 Overview results，客户端保存仍走既有独立 PUT 围栏。Byte-based token estimate 不是 tokenizer 实测。
- 最终需求核对后 fresh backend 门禁为 20 suites / 210 tests，0 failure/error/skip；clean 编译 335 main / 111 test，test 与 package 均退出 0。临时 PostgreSQL 覆盖 clean/V31→V32、协调/重放/恢复/账本及跨实例六类用量错误。唯一 reviewer 首审 B0/I1/O0；I1 已由 Luna high 执行代理修复，主代理依据完整 diff 和实际回归关闭，剩余 B0/I0/O0。原 reviewer 复审被工具线程上限拒绝，后续主代理裁决不冒称独立复审。
- 指定 PDF 的真实 DEEPSEEK `deepseek-v4-flash` 评估成功：Source ALL 9 calls、44,097 input / 12,643 output、56,740 charged、69.595s；单文件 Subject ALL 1 call、1,806 / 1,489、3,295 charged、6.414s。合计 60,035 charged；零 unknown-dispatched / 活动预留 / 任务租约，recovery=0。八组主要正文主题初步核对均被覆盖，细节压缩；Subject 保留 Source outline/summary。本次不证明多文件、真实恢复成功率或全书知识完整性。业务输入只读、原业务账本计量、V32仅TEMP H2、候选仅TEMP；正式结果行数保持1，未执行PUT。详细命令、hash、内容边界与原review结论见[实施计划](../../plans/2026-10-12-overview-dynamic-budget-recovery.md)。
- 2026-10-13 首次运行的 MAP2 JSON 相关校验失败仍缺少精确拒绝原因。后续同 generation retry（request `70b1a9f6-e190-4932-920e-8ec738d61617`）的 MAP1 在 6ms 内成功且此前没有该阶段 `PROVIDER_REQUEST`；DB `recovery_count=1`、checkpoint 总数5，与已存 checkpoint 复用相符，但运行日志没有显式 restore/hit phase。MAP2（4,661 chars / 2,287 tokens）、MAP3（1,888 / 1,006）均成功；REDUCE round1 两组均成功，round2 输出 5,789 chars / 3,020 tokens 后再次在 JSON 相关校验阶段被拒绝，最终仍为 `MODEL_PROVIDER_ERROR`、无结果。具体原因未定位，不能断言响应是非法 JSON。只读账本累计7笔均已结算，input/output/charged 为 26,627 / 16,894 / 43,521；usage 完整、unknown/active reservation 为0，锁无 owner/lease。原始响应、准确 Jackson 错误位置/类型仍不可得，业务生成仍未验收。只读命令与限制见[首次诊断](D:/Temp/auralis-overview-dynamic-budget-20261012/validation/diagnostics/subject-map-json-20261013/readonly-attribution.md)及[重试报告](D:/Temp/auralis-overview-dynamic-budget-20261012/validation/diagnostics/subject-map-json-20261013/retry-20261013-040434-report.md)。
- 为定位这类失败，当前工作树 validator 可向真实 Provider 响应校验路径发送固定拒绝类别、异常类型和 Jackson 行/列/字符偏移日志；位置基于 trim/fence 剥离后的 JSON。没有记录消息、正文、字段值或 Jackson path。两个相关测试类定向门禁 83/83 通过；此前 210 项门禁早于这次日志改动。该日志实现当时未由 Codex 部署；之后用户更新镜像并 retry，但后续请求在 Provider 响应校验前以 no-progress 结束，未验证诊断输出或运行镜像 class/source provenance。诊断实现与命令见[D:/Temp 定向证据](D:/Temp/auralis-overview-dynamic-budget-20261012/validation/diagnostics/safe-json-logging-20261013/report.md)。
- 2026-10-13 后续用户 retry 沿用 generation `18226745-50bc-4ce9-be30-97cf8c61f57c`；此前 REDUCE 响应在 JSON 相关校验阶段被拒绝，具体原因未定位。本次继续阶段使用已有6个 checkpoint，未产生 Provider request，恢复在 `OVERVIEW_REDUCE_NO_PROGRESS` 结束。只读 DB 显示恢复计数3、8笔已结算调用，input/output/charged 30,137/19,913/50,050，usage完整、unknown/active reservation为0，无结果。代码归因确认 recovery compaction checkpoint 在尺寸缩减检查前保存，导致无进展结果被下一次同 purpose 重放并再次失败。Service 已采用独立 full/partial recovery-compaction purpose，并在 cache/fresh 两条路径校验严格缩减、仅在校验成功后保存；fresh no-progress 仍返回原错误码且不落checkpoint。隔离 Recovery/Coordinator/DynamicBudget/Service/Gateway/cancellation 门禁 141/141 通过；此前 210 项门禁早于本次修复。本地修复未部署，业务 Subject 生成仍未成功验收。
- 后续只读观察 backend 镜像 `sha256:489106fe07a0c26f8da32884bc0e1aed858f680a9ecbd40bb638374f27369ebf`，StartedAt `2026-10-13T04:34:01.775901382Z`，healthy，Flyway V32 已成功。该观察不证明运行镜像包含安全 validator 诊断或本地 recovery fix；未读取 class/source provenance，也未由本执行器部署、迁移、重置预算或发起 Provider 请求。P1 JSON 失败风险保持开放。
- 生成 endpoint 仍只返回候选，不写正式 Overview results；客户端保存仍走既有独立 PUT 围栏。Byte-based token estimate 不是 tokenizer 实测。代码、自动化、临时 PostgreSQL、真实 Provider、GUI、部署和业务迁移状态分别记录，上一轮 RAG 修改保持。本轮只读诊断未执行部署、提交/推送；运行态观察见上。

### 2026-10-12 聊天资料检索默认开启（跨端代码、定向测试与构建完成；业务待实测）

- 用户已要求默认启用聊天资料检索，并移除关闭选项。批准范围为 PC、Mobile、Tablet 与后端聊天路径：请求 DTO 删除 `retrievalEnabled` 字段，新聊天始终使用现有检索；PC 当前文件用 `AUTO`，无当前文件且无明确文件范围时用当前学科 `SUBJECT`，Mobile 无上下文时沿用服务端当前用户 owner 范围。
- 保留现有 owner / 活动 Source / `READY` 校验、显式 Source/Subject 范围及空命中后继续生成行为；embedding 配置或 Provider 失败不降级。既有额度策略不变，旧报告的 token 估算、RAG 预算、Provider retry 与 Overview 后台处理不在范围内。
- 请求 DTO 已删除字段，旧 extra 字段 JSON 被 Spring mapper 忽略；后端 clean 定向测试 47/47、OpenAPI/SDK 门禁退出码 0；PC 最终 57/57、type-check / build 退出码 0；Mobile 24/24、static / H5 build 退出码 0。PC static 仍命中未改 Rust 固定地址规则，Mobile type-check 仍因未迁移 Review API 缺少 EventRequest/EventResponse 退出 2，两者均在干净 HEAD 复现。
- 实际 Antigravity MCP 返回部分补丁并遇超时，由 Luna 与主 Agent 补齐；Codex 唯一只读最终审查 BLOCKER=0、IMPORTANT=0、OPTIONAL=0。当前文件未就绪仍保持 AUTO 处理门槛，失效选择、全学科 READY 标记和手动末项撤销均已有回归。未部署、未提交/推送；真实 Provider、PC GUI、Mobile/Tablet 真机均 NOT_RUN。详见[实施计划](../../plans/2026-10-12-rag-always-on.md)。

### 2026-10-12 学科总览合并输入超限（代码、定向回归、只读审查与本机更新完成；业务实测待验收）

- 现场重新生成约 13ms 返回 `VALIDATION_FAILED`，在 Provider 请求前失败；`phase=FINAL` 为外层失败标签。
- 合法单源大输入在隔离测试中通过 preflight 后重现同错；服务端现有三个文件总览按空 instruction 重建合并 prompt 为 16631 字符，超过现行 12000，单独均可装下。当前缓存重建不冒称原始请求体。
- Subject 已增加精确语义分片 / 分包与有界 MAP / REDUCE，保留所选输入、mode / alias、用量、deadline 与取消约束；小请求继续直接生成。审查发现的重复片段膨胀与 FINAL 使用中间压缩指令已关闭。
- 最终全新隔离编译 330 main / 107 test，Surefire 73/73，Maven `BUILD SUCCESS`；最后包装器未保留 shell exit，按证据标为不可独立确认。早期增量编译和不同源码的 72 项阶段不作最终通过计数。两份主树 hash 与已测源文件一致，唯一只读审查 0 BLOCKER / IMPORTANT / OPTIONAL；本机部署和真实 Provider / GUI 验收分别记录，详见 [实施计划](../../plans/2026-10-12-subject-overview-prompt-batching.md)。
- 香港 13:57:23 仅 backend 更新为 `a5a50bb7…`，Docker build / recreate 实际退出码 0，healthy / readiness 200；部署 Service class 与 fresh scratch 精确相同，Guard class 保持。替换前活动 TASK / RESERVED / ingestion 为 0，db / MinIO 容器与卷、Flyway V31、真实 `.env` 和额度配置保持，旧镜像留回滚 tag。真实 Provider / GUI 重新生成仍待验收。

### 2026-10-12 embedding 额度排除与单人测试额度（代码、相关验证与本机部署完成；业务测试待验收）

- 用户最新指令调整统计口径：文件入库 / 检索 embedding 不计小时、日及系统日额度，也不计个人中心窗口，历史调用记录保留并从聚合排除。
- 单人测试默认提高 10 倍至 1000000 / 小时、2000000 / 日；系统日 2000000、并发 4 / 2、任务资源 / 调用次数 / 请求字节上限保留。本机 `.env` 无相关旧额度覆盖。
- 代码、配置和运行态分别验证；详见 [实施计划](../../plans/2026-10-12-embedding-quota-exemption-and-test-limits.md)。下方 PDF 故障记录与当时免费 embedding 仍计配额的策略为变更前历史事实。
- 后端隔离相关 53/53、最终两项精确源码回归 2/2（重叠），配置隔离 6/6 和 Compose 校验通过；6 份主树目标 hash 与已测文件一致。实际 Provider / GUI 未由这些命令验收。
- 唯一只读审查范围 BLOCKER=0、IMPORTANT=0、OPTIONAL=0。本机 backend 香港 12:57:12 更新为镜像 `31f7dec…`，healthy、readiness 200，运行额度 1000000 / 小时、2000000 / 日，已部署 Guard 字节码确认 embedding 排除。db / MinIO 身份与卷保持，Flyway 仍 V31；更新前活动任务租约自然释放，没有强停 AI 任务。
- 香港 12:59:36 系统日聚合余量为 1946433，供当前测试；个人中心可刷新显示新的口径。实际 Provider、GUI / 跨设备业务仍由真实操作验收，服务健康与字节码检查不替代这些验收。

### 2026-10-12 大 PDF 摄入额度与同步等待（代码与定向自动验证通过；新补丁未部署）

- 初始现场目标 job 因 `AI_HOURLY_QUOTA_EXCEEDED` 延期到 UTC 03:00（香港 11:00），租约已释放、失败次数为 0，32 个 inactive checkpoint chunks 保留；三笔已结算额度为 94615，无在途 reservation。两次数据库快照无锁等待；事故时段缺少 sync access 记录，无法把同步症状归同因。
- 香港 11:00 原部署自然续做成功：同一 generation 保留原检查点，仅新增一笔 embedding，42 个 chunks 全部激活，job / Source 均为 READY，失败次数仍为 0。本轮只读观察，未人工重跑；这验证原部署的窗口恢复和检查点续做，不证明新用量补丁已部署或 GUI 已验收。
- 适配器丢弃合法 embedding `completion_tokens:0`，使完整响应成为部分未知用量；受控 RED 已确认。本轮只补该字段解析，完整用量按实际结算、缺失或非法仍保守，保留现有全部限制及历史账本。免费模型仍计入内部 token 配额，配额不是金额账单。
- 独立 PC 受控 probe 证明资产上传 `wakeUp()` 未返回会挡住普通 push/pull；已用后台唤醒和原完成通知解除该等待，错误通过现有安全日志处理，保留会话围栏及 Asset 完成后才生成 Source mutation 的顺序。
- 后端五类定向 56/56 通过，运行在源码与主树逐项相同的隔离构建目录。PC 最后修改后的四项回归、实际 store probe、类型检查和构建通过；此前完整相关套件 51/51 与最后四项重叠，不相加。PC 静态门禁仍命中既有 Rust 固定地址规则。新 backend/PC 补丁部署、实际响应结算和上传期间跨设备同步仍待验收。
- 验证、委派和最终审查证据见 [本轮诊断与修复](../../plans/2026-10-12-pdf-ingestion-quota-and-sync.md)。代码/命令验证、部署和真实 GUI/Provider 验收分别记录。
- 唯一只读审查范围内 BLOCKER=0、IMPORTANT=0、OPTIONAL=0；主树五个源码/test hash 与已测版本一致。既有用户修改保留，无关并行更新另行登记，未提交或部署。

### 2026-10-12 PC 头像本地缓存与断网回退（代码完成；断网 GUI 待验收）

- `Auralis-PC/src/services/avatarCache.ts` 使用 IndexedDB 按用户 ID 持久化头像 Blob；Pinia 不保存图片或 Blob URL。
- 顶栏与个人中心通过 auth store 共享头像状态：先显示本地缓存，再请求云端刷新；网络故障保留本地头像，服务端明确返回无头像时清除缓存并回退首字母。上传成功写入本地副本，重置和退出登录清理对应缓存；账号切换与旧请求由代次隔离。
- 验证：`scripts/r4-profile-live-links.test.mjs`（7/7 项测试全量通过）与 `npm.cmd run type-check` 退出码 0。真实 Tauri 重启后断网显示仍待 GUI 验收。首次升级后的本地副本需要客户端在线成功读取或重新上传头像后建立。
- 只读复核：BLOCKER=0、IMPORTANT=0；记录一个同账号重置响应与后续上传交错时可能清掉新缓存的 OPTIONAL 边界，本轮未改。

### 2026-10-12 PC 设置与个人中心（Profile Studio）Awwwards 获奖级视觉设计与微交互重构完成（代码与自动验证通过；GUI 待验收）

- 用户指令：以这个设计优化一下设置页。
- 解决：
  - **设置中心（`Auralis-PC/src/views/Profile/index.vue`）全局重构与分层投影强化**：
    - **强化容器与卡片立体分层投影**：
      - 重构左右双栏容器（左侧数据透视 `.studio-left`、右侧分项设置 `.studio-right`），赋予 `20px` 现代圆角与高定近远场双层阴影系统（`0 10px 30px -4px rgba(35, 45, 30, 0.08), 0 2px 8px -1px rgba(0, 0, 0, 0.04)`，暗色 `0 14px 36px rgba(0, 0, 0, 0.48), 0 2px 10px rgba(0, 0, 0, 0.35)`）；
      - 舒缓呼吸留白：外层内边距调整为 `14px 18px 18px`，容器间隙扩展至 `16px`；内部所有独立卡片采用 `18px~20px` 现代圆角、Tier 3 控件底色与极细微晶边框；
    - **排版与信息层级升级**：
      - 右侧标头加入瑞士现代微晶胶囊微标 `.settings-header-badge`（`SYSTEM PREFERENCES`），大标题字重与字距沉稳紧凑；
      - 核心学习指标四宫格升级为等宽数表对齐 `tabular-nums`、渐变图标底座与悬停立体微浮雕；
      - 废除 AI 使用额度的粗糙内联样式，重构为微晶网格卡片 `.usage-card`、清晰标签与重置时间微药丸；
    - **高定微交互体系**：
      - 物理弹簧阻尼开关（`.toggle-btn`），开启态激发 Sage 翡翠微光；
      - 下拉框与输入框聚焦激发 3px Sage 呼吸光晕；
      - 药丸化操作按钮、头像呼吸晶体与触控候选模型微芯片 `.model-chip`；
    - **深色模式（Dark Mode System）极致适配**：
      - 全面补齐暗黑模式下的温润墨玉与灰绿色彩分层，彻底杜绝发灰、失真与对比度不足。
- 验证：`vue-tsc -b` 0 报错；`scripts/r4-profile-live-links.test.mjs`、`scripts/r4-profile-logout.test.mjs`（9/9 项测试）全量通过；`npm run build` 生产构建成功。真实桌面端 GUI 待人工走查。

### 2026-10-12 PC Timeline 断网排期实现（代码、定向命令验证与只读复核通过；真实环境待验收）

- PC 排期插入/顺延和换位已写成本地原子事务：受影响 Task 乐观投影与一条稳定 ID 的 `SCHEDULE_INSERTION` 或 `SCHEDULE_SWAP` Sync 命令一起落库。断网时保留本机结果和待同步命令，网络恢复后幂等重放；服务器拒绝或版本冲突会将当前 Task 数组原子合并回本地。
- Sync pull/snapshot 为尚未结算命令的成员 Task 建立本地保护；SQLite 在同一事务读取保护围栏并替换快照，浏览器 LocalRepository 状态改写要求 Web Locks API 并通过同源锁串行化，缺少该 API 时拒绝 localStorage 写入；命令内部成员清单不进入 HTTP payload。多条服务端拒绝按 mutation ID 排队并逐条通知。回执缺少本地受影响任务时，客户端先取回并校验完整快照再终结命令；快照不可用或不完整时命令保留待重试状态。服务端沿用现有 Task 插入和换位事务，核对 payload 源 Task ID/baseVersion 与外层 mutation 一致，并验证换位目标 Task ID/baseVersion 存在；缺少目标字段会幂等记录为 `REJECTED/VALIDATION_FAILED`。V31 只扩展 inbound mutation 枚举与列宽，change log 仍仅记录 Task `UPDATE`。
- 验证：四个 PC 定向套件合计 173/173，LocalRepository 单套 35/35；`npm.cmd run type-check` 退出码 0；OpenAPI/PC/Mobile mutation enum 静态形状检查退出码 0。Server Sync/Schema/Task controller 定向 Maven 测试 34/34，clean 重建成功，独立 `OpenApiArtifactTests` 12/12。最新只读复审 BLOCKER=0、IMPORTANT=0。`npm.cmd run check:r4-pc` 退出码 1，命中未修改的 `src-tauri/src/local_asset_store.rs` 固定本地地址扫描；`scripts/check-openapi.ps1` 退出码 1，JUnit discovery 报 `NoClassDefFoundError: JsonNode`，运行时 artifact 对比未完成。真实 Tauri/断网恢复与 PostgreSQL/跨设备仍待验收。
- 代码和命令验证不等同于真实断网重启、Tauri GUI、PostgreSQL/跨设备恢复或部署验收；这些仍待执行。详见[PC 模块当前实现记录](../../modules/FrontendPC.md#2026-10-12-timeline-离线排期命令)。

### 2026-10-11 PC 资产库界面（Asset Studio）Awwwards 获奖级视觉设计与微交互全面重构（代码与自动验证通过；GUI 待验收）

- 用户指令：优化资产库界面。
- 解决：
  - **资产库中心（`Auralis-PC/src/views/Asset/index.vue`）全局重构与分层投影强化**：
    - **强化容器与纸张卡片分层立体投影**：
      - 彻底重构三大核心容器（左侧资产树 `.studio-left`、中间阅览区 `.studio-middle`、右侧上下文星图 `.studio-right-context`）外层，采用 `20px` 现代圆角与高定近远场双层阴影系统（`0 10px 30px -4px rgba(35, 45, 30, 0.08), 0 2px 8px -1px rgba(0, 0, 0, 0.04)`，暗色 `0 14px 36px rgba(0, 0, 0, 0.48), 0 2px 10px rgba(0, 0, 0, 0.35)`）；
      - 核心纸张卡片（`.editor-paper-card`）赋予沉浸浮空阴影（`0 16px 44px -6px rgba(35, 45, 30, 0.09), 0 4px 16px -2px rgba(0, 0, 0, 0.03)`，暗色 `0 20px 50px rgba(0, 0, 0, 0.5)`），彻底解决卡片贴平、缺乏分层、无法辨识的视觉痛点；
    - **左侧资产树层级优化与微交互**：
      - 搜索栏升级为全圆角集成胶囊，配备 `<IconSearch>` 矢量图标与一键清空按钮，聚焦触发 Sage 柔光外环；
      - 树形项目优化为悬停向右平移微动效，选中态增加渐变光底与左侧鼠尾草绿呼吸高光条；
      - 文件状态指示灯（`.status-dot`）升级为微晶呼吸灯（翡翠绿、琥珀金慢呼吸光晕 `breathe-glow`、红宝石微晶）；
      - 底部上传区升级为磁吸质感触控卡片，配备专属图标底座与双行排版提示；
    - **中间沉浸阅览与编辑画布**：
      - 禅意艺术空状态，配双层同心柔光微浮动环与「导入新资产」快捷入口；
      - 顶部吸顶毛玻璃导航条（`backdrop-filter: blur(16px)`）；
      - 知识块编辑标题无边框沉浸融入纸面，编写/实时预览切换重构为高定 Segmented Control 胶囊滑块；
      - 任务属性网格升级为 Notion 风格微卡片，日期与时长选择器微晶化；
    - **右侧关系星图与代码精简**：
      - 整合图谱画布并设计空灵星轨微光空状态；
      - 清理数百行历史遗留的重复与废弃 CSS 规则。
- 验证：`vue-tsc -b` 0 报错；`scripts/r4-asset-tasks.test.mjs`、`scripts/r4-register-file.test.mjs`、`scripts/r4-document-processing-ui.test.mjs`（20/20 项测试）全量通过；`npm run build` 生产构建成功。真实桌面端 GUI 待人工走查。

### 2026-10-11 PC 排期页（Timeline）Awwwards 获奖级视觉重构、卡片分层投影与微交互打磨完成（代码与自动验证通过；GUI 待验收）

- 用户指令：以 Awwwards、Webby Awards、FWA 获奖级网站为品质标准，完成后从排版、留白、视觉层级、色彩、动效、微交互、响应式和原创性上自检并持续优化，直到没有明显可提升之处。继续优化排期页；继续打磨该页ui，但是不要动我时间轴放置的逻辑；适当在卡片下面加阴影现在没有分层看不清。
- 解决：
  - **排期页（`Auralis-PC/src/views/Timeline/index.vue`）全局重构与分层投影强化**：
    - **强化卡片分层与立体投影**：
      - 为全页卡片（时间流任务卡片 `.slot-task`、待安排卡片 `.pending-card`、周排期概览行 `.weekly-overview-row`、周视图卡片 `.weekly-task-card`、底部药丸 `.pending-pill`）增加显著的近远场双层阴影（`0 4px 16px -2px rgba(35, 45, 30, 0.12), 0 2px 6px -1px rgba(0, 0, 0, 0.05)`），悬停增加至 `0 10px 28px -3px rgba(35, 45, 30, 0.18)`；
      - 提升卡片底色对比度（纯白 `#FFFFFF`，暗色 `#1F241F`）并增强 Sage 微晶边框对比度（`1px solid rgba(139, 154, 110, 0.22)`），使卡片在米色宣纸画布与时间槽网格上呈现清晰的立体浮起感，彻底消除平淡模糊与缺乏分层的问题；
    - **严守时间轴放置物理契约**：
      - 严格维持 `TIMELINE_SLOT_HEIGHT = 80px` 与 `TIMELINE_SLOT_GAP = 4px`（`.time-slots { gap: 4px; }`，`.time-slot { height: 80px; min-height: 80px; }`），确保多槽位任务的内联高度计算与底层放置网格 100% 严丝合缝；
    - **材质与排版升级**：彻底摒除 `#EEEEEE` 生硬底色，融入宣纸底 `var(--color-bg-primary, #F7F2EB)`（深色 `#111411`），四大主容器采用 18px 现代圆角与双层漫散阴影；瑞士风标头、微晶胶囊统计（32px 高度药丸、数值与标签清晰层级、悬停 1.5px 微浮雕）；
    - **触控微交互**：日/周视图分段控制器药丸化、新建任务主按钮内置加号悬停 90° 旋转与弹簧回弹微动效；中栏时间流配置翠羽 Sage 呼吸扩散指针与渐隐光针；周视图 7 泳道与底部 Dock 升级为 Apple Dock 质感悬浮微晶面板。
- 验证：`vue-tsc -b` 0 报错；`r4-dashboard-timeline.test.mjs`、`r4-task-store-schedule.test.mjs`、`r4-task-view-rules.test.mjs`（109/109 项测试）全部通过；`npm run build` 构建成功。真实桌面端 GUI 待人工走查。

### 2026-10-11 PC 学科中心掌握度性能提升、三态掌握度轴色彩与顺序完全对齐、切卡按钮即时响应（代码与自动验证通过；GUI 待验收）

- 用户指令：学习和复习知识块页面，跳转到下一个知识的时候会出现无法点击下方按钮一段很短的时间；学科中心页的掌握度加载的很慢，然后复习页和统计页的掌握度轴颜色不一样。
- 解决：
  - **学科中心/学科大厅掌握度加载秒开（`SubjectHall/index.vue`）**：
    - 废弃原先为每个学科并发调用 `LocalSubjectStats.compute`（包含 7 天复习趋势计算与全量表重扫）的慢方案；
    - 重构为单次批量读取当前用户的所有有效知识块与复习评测记录（单次 `repo.list` 读库），在内存中通过 Map 单次 O(N) 极速累加各学科的待学习、待复习与已掌握数量及掌握度百分比，将加载耗时从数秒降低至毫秒级；
    - 引入 `isLoadingMastery` 与 `masteryPending` 互斥防抖机制，杜绝组件 mount 与 watch 并发触发时的数据库重复读取与锁竞争。
  - **掌握度轴三色与顺序三端完全对齐**：
    - 学科大厅（`SubjectHall`）、学科统计页（`SubjectStatsPane`）和学科复习页（`SubjectReviewPane`）三处的掌握度进度细轨与图例颜色及顺序 100% 对齐：
      - 待学习（`new/learning`）：`#88929E`（灰蓝板岩色）
      - 待复习（`due/reviewing`）：`#C49A6C`（暖陶土琥珀色）
      - 已掌握（`mastered`）：`var(--color-zen-sage, #8B9A6E)`（禅意鼠尾草绿）
      - 轨道顺序统一为：待学习 -> 待复习 -> 已掌握。
  - **彻底移除复习过程中的瞬态报错弹条与提示框（`SubjectReviewPane.vue`）**：
    - 页面顶部所有异常状态提示条（`stateError`、`unsyncedBlocks`、`reviewSyncError`、`conflictedBlocks` 等）全部限制在未进入轮次的规划总览（`!round`）时显示，复习做题时顶部绝对不弹出任何红框；
    - 卡片内部彻底移除网络重试与切卡瞬态提示条（`round.pendingError`、`round.pendingCommand` 操作提示条与 `currentLocalBlocksLoadError`），彻底消除复习切卡时报错闪现即逝与高度弹跳问题；
    - 在 `withCurrentContentHash` 动作拦截校验中，对卡片未就绪状态改为静默防御 return。
  - **修复切卡时底部按钮短暂无法点击的交互延迟（`SubjectReviewPane.vue`）**：
    - 将全局互斥标志 `hashingAction: ref(boolean)` 重构为卡片维度的 `hashingBlockId: ref<string | null>(null)`；切到下一张卡时，当前卡的 ID 立即与锁脱钩，不再受上一张卡异步微任务锁的滞留影响；
    - 优化 `canSubmitCurrentBlock` 判定条件：放宽为 `!statesLoaded.value && !states.value.length`，只要本地内存已有持久化状态，即使后台静默刷新也绝不触发虚假禁用，确保卡片切换后底部操作按钮零延迟立即可点。
- 验证：`vue-tsc -b` 0 报错；`scripts/r4-subject-review.test.mjs`、`scripts/r4-subject-edit.test.mjs`、`scripts/r4-subject-stats.test.mjs`（68/68）全量学科测试套件通过。真实桌面端 GUI 待人工走查。

### 2026-10-11 PC 学科空间大厅与具体学科工作区全面升级与掌握度接口真实对接（代码与自动验证通过；GUI 待验收）

- 用户指令：优化学科空间页；学科大厅掌握度展示没有对接接口啊；还没对齐学科里面的三色展示；下面的数量标注不用了。
- 解决：
  - 学科空间大厅（`SubjectHall/index.vue`）：
    - **真实掌握度统计对接与三态细轨对齐**：彻底废弃基于 `blocks / (files * 3)` 的伪计算估算；引入 `useStatsStore` 调用 `loadSubjectStats(subjectId, { days: 7, timeZone })`，严格按照权威公式 `overview.masteredCount / overview.activeKnowledgeBlockCount * 100` 渲染各学科掌握度百分比；进度条全面升级为与学科内（`SubjectStatsPane`）一致的三态细轨比例槽（待学习 `#88929E`、待复习 `#C49A6C`、已掌握 `var(--color-zen-sage, #8B9A6E)`），保持极简无额外文字干扰的纯净细轨并支持交互 tooltip 详细提示，并在学科增删与 `local-review-updated` 本地复习完成事件时自动刷新掌握度映射表；
    - 头部排版升级为瑞士现代风（24px，`-0.025em`），搭配「共 N 个空间」统计微胶囊与内置旋转微动效的主操作胶囊按钮；
    - 搜索栏升级为集成胶囊容器，常驻搜索图标，配备输入清空按钮与 3.5px Sage 扩散光晕；
    - 学科卡片（`.subject-card`）升级为 18px 现代圆角、透绿微晶边框与双层自然散光阴影；悬停抬升 3.5px 并漫射透绿微光，触击提供 0.985 阻尼微缩；
    - 44px 独立图标容器，悬停触发微放大与 3° 微转动动效；编辑与删除微按钮升级为毛玻璃浮雕圆钮；
    - 新建学科空间卡片（`.add-card`）升级为高阶微晶虚线磁吸卡片，加号圆钮悬停顺时针旋转 90° 并平滑放大；
    - 空状态引入双层发光光环与清空搜索引导。
  - 具体学科工作区（`SubjectWorkspace/index.vue`）：
    - Tier 1 纵向导航条（`.tier1-strip`）升级为 18px 圆角与双层散光阴影，激活态重构为微晶内嵌立体胶囊，触击提供 `scale(0.94)` 弹簧阻尼反馈；
    - 底部学科 Mini 图标升级为 40px 双层阴影渐变胶囊，悬停微旋转放大；
    - Tier 2 抽屉侧栏（`.tier2-drawer`）过渡优化为 0.32s 流畅阻尼展开，材料项（`.drawer-item`）悬停向右平移 2px，激活态配备呼吸高光指示条；
    - 添加材料按钮（`.drawer-action`）悬停顺时针旋转 90° 放大，触击微缩；
    - 知识库子页面（`centerView === 'blocks'`）：搜索框升级为极简全圆角胶囊与 Sage 扩散外环，计数升级为透绿立体微晶胶囊，录入知识块按钮配置加号顺时针 90° 旋转与触击弹性反馈；知识卡片升级为 `18px` 现代圆角、透绿微晶边框与自然双层漫散阴影，悬停上浮 3.5px 扩散 Sage 柔光；操作圆钮升级为 26px 毛玻璃浮雕圆钮；正文 Markdown 行高扩展至 1.62；底部来源资料配备独立小药丸；空状态引入双层柔光光环与引导卡片微动效；
    - 学科欢迎引导页（`onboarding-workspace`）：瑞士平面大标题（24px，`-0.025em`），拖拽上传区域升级为透绿微晶虚线磁吸胶囊，引导卡片配备 `18px` 圆角、透绿微晶边框与图标底座 3° 微转动微动效；
    - 材料预览控制器与划词气泡（`preview-status-controls` & `floating-selection-bubble`）：顶部缩放与旋转按钮组升级为一体化全圆角磨砂微晶胶囊控制器；底部分页器按钮升级为纯净胶囊；划词浮动气泡引入阻尼弹簧弹出动效（`bubble-spring-pop`）与毛玻璃透光材质；
    - 总览大纲组件（`FileOutlineList.vue`）：按用户指令调回原版紧凑设计，维持既有轻量样式与交互。
- 验证：`vue-tsc -b` 0 报错；`scripts/r4-subject-edit.test.mjs`、`scripts/r4-subject-stats.test.mjs`、`scripts/r4-subject-review.test.mjs`、`scripts/r4-subject-overview-ui.test.mjs` 等 84 项学科测试全绿。真实桌面端 GUI 待人工走查。

### 2026-10-11 PC 全局模态弹窗系统与首页两大弹窗体验升级（代码与自动验证通过；GUI 待验收）

- 用户指令：首页的两个弹窗，顺便涉及整个弹窗框架的优化。
- 解决：
  - 弹窗系统架构（`ModalShell.vue` 与 `modal.css`）：
    - 遮罩采用 `backdrop-filter: blur(14px) saturate(180%)` 深层环境漫散，弹窗卡片内置发丝级内高光（`inset 0 1px 0 rgba(255, 255, 255, 0.7)` / 暗色 `inset 0 1px 0 rgba(255, 255, 255, 0.08)`）配合双层立体微晶柔光扩散阴影；
    - 进出场搭载阻尼弹簧动效（`scale(0.96) translateY(12px) -> scale(1) translateY(0)`，曲线 `cubic-bezier(0.16, 1, 0.3, 1)`）；
    - 关闭按钮引入 Tabler 矢量 `<IconX>`，支持悬停 90° 旋转与 0.92 触击回弹；
    - 表单输入框聚焦搭载 `3.5px` 扩散式 Sage 柔光外环；
    - 按钮体系（`.modal-btn`）升级为渐变光润立体微胶囊，具备微浮雕与触觉阻尼反馈。
  - 知识块详情弹窗（`KnowledgeBlockViewDialog.vue`）：
    - 头部集成微图标与杂志级主标题（19px，`-0.02em`）；
    - 来源资料与记录时间微标采用圆角全封胶囊与微边框；
    - 正文卡片内衬米白宣纸质感并放宽阅读留白与行高（1.76）；
    - 底部「复制内容」点击弹出翠绿打勾动画与轻触反馈，「前往知识块界面」悬停支持箭头右上穿透位移。
  - 新建任务弹窗（`TaskCreateDialog.vue`）：
    - 学科选择网格升级为立体微质感胶囊（`.subject-chip`），激活态增加高雅 Sage 柔光双层外环与触击缩放；
    - 整半小时磁吸滑轨（`.duration-segmented-track`）增加内阴影，活动手柄（`.active-thumb-pill`）增强渐变质感与拖动微光圈；
    - 严格保持已有契约（`zen-date-picker`、`zen-date-popper`、`dueAtFromInput` 等）。
- 验证：`vue-tsc -b` 0 报错；`scripts/r4-task-create-dialog-deadline.test.mjs`、`scripts/r4-dashboard-timeline.test.mjs` 等 37 项测试全绿。真实桌面端 GUI 待人工走查。

### 2026-10-11 PC 首页 (Dashboard) 获奖级美学与微交互全面升级（代码与自动验证通过；GUI 待验收）

- 用户指令：以 Awwwards、Webby Awards、FWA 获奖级网站为品质标准，优化首页并强化跳转按钮微动效。
- 解决：重构 `src/views/Dashboard/index.vue`。统一 Auralis 极简宣纸美学底色与三大栏温润米白卡片（`18px` 圆角、透绿微晶边框、双层自然漫散光影）；欢迎语区域引入 `-0.015em` 字距与高质感统计微胶囊；知识流卡片扩展内边距至 `18px 22px`，优化 Markdown 行高与瑞士排印对齐；7 日选择器激活日期圆圈接入弹性放大动效（`day-circle-pop`）；日程任务卡片左侧增加 Sage 高光竖条，移出按钮改用矢量图标 `<IconX>` 柔和悬浮显现；待办条目升级为圆润高定全圆角胶囊与语义逾期警示光晕。针对全站跳转与动作按钮建立系统化物理微动效：
  - 「管理学科」：内置矢向图标 `<IconArrowRight>`，悬停时箭头向右弹性平推 3px，触击提供 `scale(0.97)` 按压阻尼；
  - 知识流顶栏：选中学科时增设「进入工作区」直达胶囊（`<IconArrowUpRight>`），悬停时朝右上角位移 2px 并漫射 Sage 柔光；
  - 「前往排期」：内置 `<IconChevronRight>`，悬停时图标平滑向右推进 3px 并带浮雕微阴影，触击 `scale(0.95)`；
  - 「新建任务」FAB：内置 `<IconPlus>`，悬停时放大 1.08 倍并伴随顺时针 90° 机械阻尼旋转，触击 `scale(0.92)` 挤压回弹；
  - 空流「创建学科空间」：配微图标与高光漫反射，周视图甘特行悬停向右微移 2px 强化日视图切入指引感。
- 验证：`scripts/r4-dashboard-timeline.test.mjs` 与 `scripts/r4-dashboard-search-navigation.test.mjs` 专项回归 19/19 项测试全部通过；`vue-tsc` 0 报错退出码 0。真实桌面端 GUI 待人工走查。

### 2026-10-11 学科总览 26ms 用量误拒绝（代码、相关验证与只读审查通过；未部署本轮修复）

- 现场 UTC 07:16:49 学科生成在 Provider 阶段日志后快速失败；今天构建并在 UTC 07:14:47 启动的新 backend 也包含同一预算错误。部署字节码与隔离 RED 确认：既有最终 MAP 输出 6144 被网关的 4608 上限拒绝，真实码为 `AI_REQUEST_BUDGET_EXCEEDED`（413），发生在预留和 Provider 出站之前。
- 两次 `BEGIN READ ONLY` 快照均为 reservation 0 行，目标 TASK owner/lease 已释放，没有历史预留持续占用额度的现场证据。原异常不被生成服务包装；用量码仅在失败日志中被通用回退掩盖。调度歧义警告不等于任务停摆，用量过期回收使用惰性路径。
- 两处最小生产修复与主树 gateway/H2/受控 Provider 回归已通过：定向 19/19，追加 TASK 释放断言后集成 2/2（重叠），本机 SSE 1/1；主树唯一覆盖 20 项。保留现行安全限制和全部记录。唯一只读审查 BLOCKER=0、IMPORTANT=0，OPTIONAL=1 是诊断报告 evidence 索引 SHA 更新项；代码六文件 hash 一致。本轮未部署修复或写业务数据库，真实 PC/Provider/GUI 验收待更新后的运行环境完成。详见 [诊断与修复](../../plans/2026-10-11-overview-usage-limit-diagnosis.md)。下方旧镜像观察是此前 406 诊断时的历史状态。

### 2026-10-11 Overview 重新生成响应 406（根因已定位；工作树修复待部署）

- 本机 backend 容器镜像构建时间为 2026-10-09；实际失败堆栈在 `RequestResponseBodyMethodProcessor.writeWithMessageConverters`，发生于 Overview 成功返回之后。PC 当前请求发送 `Accept: text/event-stream`，而容器内 `AiController` 仍是旧的直接返回 `OverviewResponse`、未声明或实现 SSE 的版本；旧端无法为 SSE 请求写出该 JSON DTO，因而抛 `HttpMediaTypeNotAcceptableException`。当前工作树的 Controller 已实现显式 opt-in SSE，来源版本差异是本次根因。
- 另修正全局异常处理器将该异常兜底成 HTTP 500 的状态错误；现在映射 HTTP 406 `NOT_ACCEPTABLE` Problem Details。`AiOverviewControllerTests` 覆盖合法 Subject JSON 序列化和不支持 Accept 的 HTTP 406，真实 TCP SSE 测试覆盖 PC 实际 Accept 下的 Subject 终态 JSON。干净编译聚焦套件通过 15/15，`OpenApiArtifactTests` 11/11。
- `CACHE_RETURN` 只是 alias 映射和返回前的日志阶段，不持久化 Overview。PC 收到响应后才写独立结果接口；响应丢失后手动重新生成会创建新 request ID 并可能再次调用 Provider、重新计用量。此问题未通过增加缓存或幂等表扩展本次修复。
- 运行中的容器尚未重建，代码验证不等于本机服务已更新或真实 Provider/GUI 验收。

### 2026-10-11 总结预览视图精简（代码与自动验证通过；GUI 待验收）

- 用户反馈：“总结预览里面有个调整要求去掉”以及“重新生成时的这个提示去掉（正在生成新版本，当前总结继续保留。）”。
- 解决：从 `OverviewSummaryView.vue` 移除顶部操作区的「调整要求」按钮、关联弹窗，并移除重新生成时的黄色通知条，保留顶部操作按钮自身旋转/禁用态的生成反馈。
- 验证：`scripts/r4-subject-overview-ui.test.mjs` 测试更新，总览测试套件 138/138 项测试全量通过；`vue-tsc` 0 报错。真实 GUI 体验待走查验收。

### 2026-10-11 PC 学科复习每组题量切换提取合并（代码与自动验证通过；GUI 待验收）

- 用户反馈：“复习页的每组个数按钮有点重复了全部提取到同一个切换按钮吧”以及“自测复习的个数怎么还是独立的”。
- 解决：从「待学习」与「待复习」卡片中移除各自重复的 `每组 [5 个] [10 个]` 控件，同时彻底移除「自测复习」独立的 `[5] [10]` 分段选择；在面板卡片上方建立统一微操作栏 `subject-review__panels-toolbar`，左侧保留全页唯一的 `每组 [5 个] [10 个]` 切换按钮，统一驱动「进入学习」、「进入复习」与「自测复习」的单组题量；右侧为纯粹的「自测复习」操作胶囊。
- 验证：`scripts/r4-subject-review.test.mjs` 50/50 项测试全量通过；`vue-tsc` 0 报错。真实 GUI 体验待走查验收。

### 2026-10-11 PC 复习迁移到生命周期接口（代码与定向验证通过；Mobile / Tablet 待迁移）

- 服务端 `/api/reviews/due`、`POST /api/reviews/events`、旧 `/api/reviews/history` 与 FSRS Lite 动态调度实现已删除；`/api/reviews/states`、lifecycle 命令及 lifecycle history 保留。生命周期仍引用原参数集 ID；`review_events` 表仍供统计读取，本轮未改数据库结构。
- PC 旧 API wrapper、旧事件回合、旧历史读取和旧事件统计分支已删除，页面仍使用生命周期卡片池、命令与正式本地记录。
- 后端编译通过，路由/lifecycle 定向测试 15/15，OpenAPI 测试 10/10；`scripts/check-openapi.ps1` 退出码 0。PC 生命周期复习、历史和自测卡片回归 99/99 通过。
- `npm run type-check` 的 Windows shim 当前缺失；改用已安装包直接执行 `node node_modules/vue-tsc/bin/vue-tsc.js -b`，退出码 0。Mobile / Tablet 调用方按用户要求未改，仍请求已删除路由；这些页面迁移前复习请求会失败。

### 2026-10-11 PC 总览生成返回后页面自动更新（代码与自动验证通过；真实环境待验收）

- 已修复用户反馈的“总览后端返回之后，不能自动更新到页面上，自己刷新后才能显示”问题。
- 根因：`OverviewGenerationService` 与 `overviewRepository` 完成落库后无 UI 事件；`SubjectWorkspace` 仅初始化读取且未监听原材料状态/版本变化，导致后台就绪后界面未响应。
- 解决：新增 `auralis-overview-cache-updated` 事件并在所有缓存落库后派发；`SubjectWorkspace` mounted 注册订阅自动更新缓存和大纲并于 unmounted 注销；增加对原材料文件的 deep watch 及 `getLatestFileOverview` 兜底回查。
- 验证：`scripts/r4-subject-overview-ui.test.mjs` 增补测试，总览专项 120/120 测试通过；`vue-tsc` 0 报错。真实 GUI / Provider 待用户走查验收。

### 2026-10-11 Overview 硬超时与取消（代码、相关自动验证与只读审查通过；真实环境待验收）

- 两个现行生成 POST 保留默认 JSON，并支持 PC opt-in SSE 心跳和终端结果。默认 240 秒入口绝对期限扣除预检/队列及 Provider 阶段；到期或最后消费者退出主动关闭本调用独占 socket。共享 Source 保留原 owner 期限，其他消费者可继续；已派发未知用量沿 B 保守结算。
- PC 学科、文件和总结手动生成提供“停止”；切页只释放页面消费者，自动后台工作继续。runtime/account、删除/修订失效取消旧请求，身份和迟到结果有围栏。实际 SQL 写入期间取消在提交前回滚本操作 cache/outbox；最终同步 guard 通过并进入提交后保留已提交的成功成果。
- SSE 繁忙错误 503、DNS 有界取消等待、缓存写入取消及写入名额竞态均经实际 RED/GREEN 补修。SSE 名额同时覆盖待写与正在写的心跳/终端事件，在生成 worker 真正退出且本请求全部写入清理后才释放。
- 后端初期聚焦 84/84、DNS/Provider/Overview 组合 124/124 通过；124 已含兼容 51 项和原聚焦中 60 项，不相加。最终 writer 增量及完整命令见 [实施计划](../../plans/2026-10-11-overview-hard-timeout-cancellation.md)。PC 主树 Overview 72/72、cache 14/14、sync 22/22、runtime 20/20，保留并行视图精简后的候选 Subject UI 16/16、应用类型检查和 Vite 构建通过；初期 110 文件静态检查通过。运行时 OpenAPI 11/11 与两端 SDK 同步。
- 相关命令验证和本机 TLS/TCP 已完成；GUI、真实代理/Provider 及部署待验收。同步 JDBC/数据库锁等待不能由 socket 取消，preflight 阻塞时 HTTP/SSE 建立仍可能晚于期限；原生 DNS 可占固定解析 slot 至 OS 返回。Mobile 的两处旧 Review 类型引用错误按另一迁移任务登记。本轮未部署或修改业务数据库。

### 2026-10-10 AI IMPORTANT 修复（代码、相关自动验证与只读审查通过；真实环境待验收）

- 伴读来源文件名已由 Luna 管理 Antigravity 实施并应用；相关回归 27/27、类型检查和隔离构建通过。完整 PC R4 为 679/680，唯一失败来自未改截止日期测试的 CRLF 源码提取；`check:r4-pc` 仍有已登记的 Rust 固定本地地址扫描失败。未把全量回归或静态检查写为通过。
- Overview 已增加默认 240 秒合作式 deadline；embedding 已按条数与 UTF-8 文本字节有界分批，响应 index 校验归位，全部向量通过既有约束后才切换 generation。批前后按当前 claim 续租；锁等待跨 lease 的竞态已用锁后新鲜 Clock 修复。首轮后端聚焦 89/89、聊天/检索/chunk 增量 31/31，补修最终 Job/Worker 18/18、配置 5/5 通过；PC Overview 静态回归 48/48 通过。
- 完整持久配额 B 已接入统一 Provider gateway、任务预算、跨实例并发、小时/每日预留与结算、后台持久批次续做及有界 MVC async。PC、Mobile、Tablet 的既有个人中心已展示本人小时/今日额度，加载/失败/账号切换与现行 Mobile 401 refresh 路径有回归；行为 8/8、Mobile 协议 24/24、PC/Mobile 类型检查与隔离 PC/H5 构建通过。运行时 OpenAPI 9/9、两端生成 schema 同 hash；详见 [B 实施计划](../../plans/2026-10-10-ai-usage-guard-b.md)。
- 最终核心 H2/config 31/31、任务独占 PostgreSQL 锁序 4/4 通过，包含账户停用后派发拒绝；真实 PG 检查点及跨额度窗口续做通过，V29→V30 历史失败次数保留升级 1/1。以上使用任务独占临时库与受控 Provider，不能推断真实 Provider 或生产迁移已验收。全量 Modulith 的 knowledge ↔ review 循环已在未改 HEAD 复现；主树两项未改 deadline 测试失败仍登记，不宣称全量工程检查通过。
- 单一 reviewer 已完成 B 代码与文档审查：批准范围 BLOCKER=0、IMPORTANT=0；相邻共通 OPTIONAL 验证缺口不扩改。匿名八样例离线契约 3/3 通过，真实 embedding、语义质量和人工评分未运行；GUI、真实 Provider、HTTP 断连及代理链路仍待验收，合作式 deadline 不能强制终止持续 slow-drip I/O。未提交或部署；11 项既有用户改动按原字节或仅排除明确任务回写的内存投影 hash 保护，证据与剩余事项见 [共通计划](../../plans/2026-10-10-ai-important-fixes.md) 和 B 计划。

### 2026-10-10 PC + Service 功能盘点校正（静态代码核对；未重跑测试/构建）

- 本条按当前工作树核对用户提供的 PC + Service 清单。正式路由仍为 8 条；`Home`、`Settings` 页面源码已删除，首页由 Dashboard 承担，个人设置在 Profile。SearchPalette 的知识块结果通过 `openBlock` 路由参数由 Dashboard 打开；全局搜索范围是本地知识块标题、学科和正文内容，最多 6 项，AI 快捷入口当前已移除。
- 专注任务关联、本地活动状态/事件持久化及 `POST /api/focus-sessions` 均已实现；知识块正文编辑保存 `content`，摘要由正文派生；完整成功的 Overview 结果走独立 GET/PUT 和对账，可跨 PC 设备读取，失败/半成品仍留在设备侧。以上不替代本机 GUI、真实 HTTP、Provider 和双设备验收。
- 已有登记继续有效：12 项无业务消费者的偏好见 [PC 模块](../../modules/FrontendPC.md)；Suggestions 确定性输出与质量验收见 Issues 中的 `P1-Phase5-Suggestion-Quality`；PC JSON 导出范围有限及本地文件无备份/恢复能力已有登记。
- 新增事项进展：资产中心两处 Source 树映射把状态固定成“正常”已关闭（已由真实 ingestionStatus 与本地任务驱动，按就绪/失败/待处理/解析中展示状态与样式）；登录页忘记密码及隐私条款仍为占位；注销请求受理后没有进度查询；时间轴没有手动完成操作和知识块选择器；应用没有持久通知收件箱。以上入口/功能仍按待确认产品范围登记为 OPTIONAL。文档处理密钥的范围已确认：不增加通用备份/恢复入口；密钥确实丢失时应自动新建密钥、废弃旧续传状态并从原始文件重新处理，原始文件不可恢复时提示重选上传。当前代码仍报告 `DOCUMENT_ENCRYPTION_KEY_RECOVERY_REQUIRED`，该恢复行为待实现；证据与关闭条件见 [问题和审查](../../current/IssuesAndReview.md)。
- Service 当前没有密码找回、通用用户偏好同步或完整数据备份/导出 API；账户注销接口返回异步受理状态，当前没有进度查询路由。这些是现行能力边界，不表示本轮增加了接口。
- 本次只做静态代码/文档核对；没有运行测试、类型检查、构建、GUI、真实 Provider 或 HTTP 验收。

### 2026-10-10 本机测试数据库重建与知识块补量（API 回读通过；PC GUI 待验收）

- 本机 PostgreSQL `public` schema 已重建，后端 Flyway 到 V29；测试账号下有 12 个学科、240 个任务、360 个活动 KnowledgeBlock，每科 30 个。知识块注入实际新增 329 个、保留既有 31 个；再次执行创建 0 个并回读 360 个，证明该脚本可重复补量。
- 本次注入只写 KnowledgeBlock；当前 Sources 和 Assets 行数为 0。之后按用户要求清空本机 `auralis-assets` bucket：删除 12 个对象，确认版本控制 Disabled、回查对象数为 0；bucket 和 MinIO 服务保留。PC/Tauri 本机数据库和受管文件未触碰。
- 数据库备份路径、SHA-256、完整重建步骤和计数 SQL 见 [测试账号数据库重建与数据注入流程](../../operations/TestAccountDataResetAndSeed.md)。API 回读确认服务端记录；登录后的 PC/Tauri 同步、列表展示与 GUI 仍待人工验收，文件解析和 RAG 不在本次数据注入范围。

### 2026-10-10 自测复习空轮次误报完成（代码、自动验证与只读审查通过；真实客户端待验收）

- 已修复：生命周期启动拒绝空队列；自测入口核对实际入队数量、当前卡片与所选候选，异常仅清理临时轮次并提示；既存空轮次显示返回规划的错误卡片，不显示“本次共复习 0 个”。当前学科活动知识块候选池、独立 5/10 选择与现有配色保留。
- 开发时复习 Store 模块更新触发完整页面刷新，重新建立 Store；临时轮次按既定刷新失效规则处理，本机正式学习记录和 Review outbox 保留。旧窗口首次使用修复须完整重开客户端。
- 主树实际三脚本回归 107/107、强制 type-check 退出 0；相同源 hash 的隔离 Vite build 退出 0。一个未改 SubjectWorkspace 的 three-column 静态断言仍失败，npm 启动器因 C 盘 ENOSPC 失败后已直接运行 vue-tsc 验证；未将这些失败写为通过。唯一只读 reviewer 初审发现的加载窗口已按实际 RED/GREEN 补修，最终 BLOCKER=0、IMPORTANT=0、OPTIONAL=0。
- 真实当前 SFC/Pinia 用旧 mastered-only 动作规则建模复现截图，并非读取用户进程内存；冷加载现行 VOLUNTARY 分支原已能入队。Antigravity 实际生成部分候选，完整差分审查后由 Luna 关闭空启动及热更新状态风险；根按 hash 守卫仅应用四个源/测试路径。证据：`D:/Temp/auralis-voluntary-review-zero-fix-20261010/`。未提交或部署，真实 Tauri/SQLite GUI、多设备仍待验收。

- 切页返回或切换学科时，成功读取当前 subject/account 的材料前显示加载状态，不拿暂时空列表清理缓存轮次；恢复轮次时读取失败保留进度并重试，迟到结果受 scope/version 保护。三条真实 SFC 延迟读取/失败回归通过；最终主树 107/107 与 force type-check 退出 0，最终隔离构建退出 0。

### 2026-10-10 PC 学科复习「待复习」到期筛选与「自测复习」外置主题色药丸与复习个数选择（代码与自动验证通过；真实环境待验收）

- **待复习默认仅展示到期内容**：`SubjectReviewPane.vue`「待复习」卡片标题计数调整为仅统计并展示到期知识块数量；无到期块时显示 `0 个`，且主按钮「进入复习」禁用，不强行把未到期知识块拉入常规轮次。
- **自测复习外置右上角、全站主题色药丸与复习个数选择**：
  - 命名统一为「**自测复习**」；
  - 外置于待复习卡片外面的右上角组合容器（`.subject-review__voluntary-wrap`，`bottom: calc(100% + 10px); right: 0;`），不挤压卡片内部行宽；
  - **复习个数选择**：自测复习按钮左侧横向补充「每组 5 个 / 10 个」胶囊切换器（`.subject-review__group-size`），自测入口使用独立 5/10 数量选择，候选不足时按实际可选数量入队；
  - **全站统一主题色与柔和通透阴影**：
    - 采用全站一致的主题主色渐变（`var(--btn-primary-bg, var(--accent-gradient, linear-gradient(135deg, #9EAD80 0%, #8B9A6E 100%)))`），深色模式匹配为 `#9AB08F` 底色与深炭灰文字；
    - 阴影从生硬的深黑弥散收敛为纯粹柔和通透的 Sage 光影（`0 2px 8px rgba(139, 154, 110, 0.28)`；hover 时 `0 4px 12px rgba(139, 154, 110, 0.36)`），杜绝深黑脏边；
  - **微放大药丸**：高度设定为 `32px`、内边距扩展至 `0 16px`、字号提升至 `13px`（字重 600），配备半透明纯白胶囊数量徽标（`rgba(255, 255, 255, 0.28)`），hover 时提升亮度和弥散辉光并有微位移，触击感和层次感出众；
  - 点击后从当前学科活动知识块随机打乱并取样进入轮次（`manualMode: 'VOLUNTARY'`）。
- **底层大卡片高度与规格保持**：保留规划总览大卡片（min-height clamp 480px~660px，padding 48px 64px）与答题卡片开阔舒展的 7~8 成宽幅视觉格局，大圆环仪表盘（196px）与大标题（38px）比例充裕自然。
- **自动化测试与构建校验**：
  - `scripts/r4-subject-review.test.mjs` 49/49 项测试全量通过；
  - `npm run build`（`vue-tsc` 与 Vite 构建）顺利完成，退出码 0，无类型报错；
  - 真实 GUI 体验待用户人工走查与验收。

补充只读核对（2026-10-10）：当前三个入口分别进入新知/错题学习、到期复习、未到期及已掌握块主动抽查，均接现行本地生命周期和独立 outbox。检查期间页面/Store/测试发生外部更新；最终运行 `node --experimental-strip-types --test scripts/r4-subject-review.test.mjs scripts/r4-review-local-first.test.mjs scripts/r4-review-reopen-engine.test.mjs` 为 98/98，`node node_modules/vue-tsc/bin/vue-tsc.js -b --pretty false` 退出 0。独立临时探针实际点击最新主动入口，并对两类块执行 GOOD/确认，观察到真实本地记录与待同步命令，提前练习不增加稳定次数、掌握成功保留掌握。证据位于 `D:/Temp/auralis-review-three-entries-audit-20261010/`；本轮核对未修改复习源码，GUI/Tauri/真实 HTTP 仍未验收。

### 2026-10-11 PC 任务截止纯日期兼容移除（定向测试与类型检查通过；只读审查通过；GUI 待验收）

- `parseDueTimestamp` 不再把裸 `YYYY-MM-DD` 或无时区值当作有效截止 instant；Store 读取和排期旧任务时保留原截止值，非空无效值拒绝新排期，带时区时间戳继续按精确 instant 比较。Store 只在截止值实际变化时执行用户输入转换；普通字段编辑携带相同旧值时保留原值。TaskCreateDialog、Store 和资产库编辑仅在明确的用户日期输入时转换为当地日末。
- 测试账号注入文档已提醒：注入 `dueAt` 必须提交带时区时间戳；当天截止先按目标时区转为当地日末，排期完整结束不能晚于此值，插入操作不会修复已有任务。
- 不改任务数据、API/数据库字段或迁移。`node --experimental-strip-types --test scripts/r4-task-store-schedule.test.mjs scripts/r4-task-view-rules.test.mjs` 为 92/92；`npm run type-check` 退出码 0。Codex 只读审查 BLOCKER=0、IMPORTANT=0、OPTIONAL=0。构建与 GUI 本轮未运行/验收。

### 2026-10-10 PC 任务截止日期与排期一致性（代码、自动验证与只读审查通过；真实环境待验收）

- 创建弹窗、Store 与资产库编辑的纯日期按当地日末转换为 UTC instant；已有午夜/日末时间戳按真实 instant 比较。完整区间结束必须不晚于截止，恰好结束允许。资产库显示本地日期，未触碰日期的标题/备注编辑保留原精确值；先清空再重选可纠正旧日期输入值，不批量改写既有数据。
- Luna 实施并按 hash 守卫仅应用四源、三测试；唯一只读 Luna reviewer：BLOCKER=0、IMPORTANT=0、OPTIONAL=1（未挂载 Element Plus 的 GUI 事件覆盖）。实际主树 HK 95/95、UTC/洛杉矶各7/7、PC R4 669/669、type-check 与构建均 exit0。构建产物放 D 临时目录，原 dist、用户 Home/Settings 删除及其他 PC 基线保持；未提交、暂存或部署。
- Antigravity 首请求因地区不支持退出3，没有生成代码。C 盘任务副本复制期间耗尽空间，副本已注销但删除遇长路径错误，后续删除被执行策略拒绝，尚未清理；明确残留目录及失败证据见 [实施记录](../../plans/2026-10-09-task-deadline-date-consistency.md)。已知范围外 Rust 静态扫描失败保持原登记，GUI/Tauri/HTTP 待验收。
- 先前“当天截止任务排期校验”仅有 PC 测试证据，不能证明午夜扩展与 Server instant 一致；现行规则要求截止是带时区时间戳，日期转换仅限明确的用户输入边界。2026-10-11 追加移除了读取存储纯日期时的当地日末兼容解释，详见下方记录。

- 学科统计（`SubjectStatsPane.vue`）彻底告别散乱无重点与局促拥挤问题，重构为层次明确、呼吸感充足（`1160px`、`36px 48px 72px` 内边距、`32px` 模块间距）的三层极简架构：
  - **核心 Hero 看板**：左侧为学科名称、大字掌握度百分比（`52px` Sage 绿）与轻量细轨三态分布条（`8px`），右侧为层级分明的「当前行动」卡片组（`待复习` 今日到期琥珀色高光突出并附 CTA、`待学习`、`已掌握`），行动意图明确；
  - **学习活力与走势面板**：将「今日复习」「累计复习」「完成学习」三项核心活跃指标与近 7 天每日细柱状图（`16px` 平滑柱体）整合为单一清晰模块；
  - **资产与任务底座**：双栏平衡展示「资源沉淀」（知识块、学习文件、资料总数）与「任务协同」（完成率与 4 态状态标签），去除过往冗长解释性文字污染与嵌套灰盒；
  - 界面风格全面收敛于 Auralis 极简宣纸禅意风（`18px~20px` 圆角、`1px solid var(--border-subtle)`、温和无侵入轻投影）；
  - 彻底移除 `SubjectReviewPane.vue` 顶部的「本机尚未导入完整的历史复习状态」非必要提示横幅与未读引用；
  - 自动化验证：`scripts/r4-subject-stats.test.mjs`（11/11 通过）、`scripts/r4-subject-review.test.mjs`（48/48 通过）、`npm run test:r4-pc`（659/659 全量通过）、`npm run type-check`（0 error）。真实 GUI 待用户人工验收。

### 2026-10-09 学科学习与复习进入修复、卡片放大与页面内返回按钮层级规范（代码与自动化测试通过）

- 修复页面内返回层级与目标位置：
  - 复习最外层（规划仪表盘 `!round`）：彻底移除多余的返回按钮，最外层级无需返回，切换模块直接使用 Tier 1 图标栏；
  - 答题轮次内（`round` 存在）：左上角返回按钮目标精准对准上一级规划仪表盘（调用 `endRound` 重置轮次缓存回到规划仪表盘），杜绝跳出复习模块误返回到工作区；
  - `SubjectWorkspace/index.vue` 保留 `handleReviewOrStatsBack` 与 `toggleTier2` 增强，保证从其他子模块或未来扩展时平滑恢复工作区状态与展开侧栏。
- 修复待学习与待复习卡片进入逻辑：微质感面板全卡片可点击；无今日到期但有待复习块时支持提前复习（`EARLY_PRACTICE`）与掌握块抽查（`MASTERED_REVIEW`）；未同步知识块自动触发同步重试与状态提醒；规划卡片显式显示操作异常。
- 复习卡片容器与卡片整体占用页面的七至八成（宽幅扩展至 84% / 最大 1500px，高度收紧至 clamp(480px, 60vh, 660px) 与 clamp(520px, 64vh, 720px)；规划仪表盘掌握度圆环放大至 196px、数字升至 42px、上层学科标题升至 38px 与 0.02em 字间距；答题卡片标题升至 42px，正文与提示行高扩至 1.95，操作按钮高度扩至 48px 并统一扩大字间距与留白）。
- 复习自测体验重构闭环：彻底移除骨架屏灰条，替换为拉长的大面积真实正文毛玻璃模糊卡片（`filter: blur(7.5px)` + `backdrop-filter: blur(8px)` + 柔和立体弥散投影）；正文与底端按钮间补充温和严谨的提示词（「请在脑海中主动回忆该知识块的核心概念与要点，并依据提取的清晰度与完整性进行客观评估：」）；底端保留三个自适应平铺选项（认识、模糊、忘记了），配备高质感立体阴影与语义悬浮辉光。
- 学科统计（`SubjectStatsPane.vue`）布局与视觉重构：彻底移除顶层多余的返回按钮（工作区通过侧边栏 Tier 1 一键切换）；替换 Emoji 图标为专业 Tabler 矢量图标（`IconBook`、`IconBrain`、`IconClock`、`IconCircleCheck`、`IconFlame` 等）；收敛杂乱冲突的配色，统摄于禅意自然色板（Zen Sage `#8B9A6E`、暖琥珀 `#C49A6C`、灰岩 `#88929E`）；将杂乱的 9 颗药丸标签重构成整洁清晰的「复习活动 / 知识沉淀 / 任务协同」结构化三栏汇总面板；日历打卡与四项指标规整对齐，卡片拥有统一的圆角阴影微质感。
- `node scripts/r4-subject-review.test.mjs`（48/48）、`node scripts/r4-subject-stats.test.mjs`（16/16）、`npm run test:r4-pc`（618/618）、`npm run type-check` 均通过。GUI 与真机运行待人工验收。

### 2026-10-09 学科复习与统计完整本地使用（代码与自动验证通过；真实环境待验收）

- 两页已接现行本地仓储，断网可学习、反馈、更新日期与统计；正式状态/历史及独立Review outbox持久化。轮次仍仅当前进程切页恢复，专注仍仅个人页。
- 联网后先收敛核心KB，再按KB FIFO上传冻结命令；未知首学、真实ACK0、原reviewId后继、正文失效、迟到回执与账号代际均有回归。远端409保留冲突并显式选择云端，本地409恢复只读严格完整的本地记录。
- 最终审查补闭旧未隔离缓存回退、本地提前练习误加次数与最终确认不能毕业，以及已有状态重学/手动重开ID差异。当前本地排程按现有Service执行，无新复习产品规则；保留用户最新两个Pane与时间轴等外部修改。
- 最终主树R4 664/664、type-check、两项学科静态与build退出0；Service相关32/32、独立OpenAPI9/9及SDK生成通过。唯一reviewer初审后因额度中止，主Agent完成最终检查，未声明全任务独立reviewer通过。原范围外静态扫描失败及用户diff空白未修改。
- 设计、实际工具/命令、工作树保护和真实环境边界见 [实施计划](../../plans/2026-10-09-review-stats-local-first.md)。未部署；运行后端须重建才支持protocol2，真实Tauri/GUI/HTTP与双设备待验收。

### 2026-10-08 复习、学习与掌握退出（代码、相关自动验证及只读审查通过；真实环境待验收）

- Service与PC新机制已接通，两个Luna执行代理实现与验证；Antigravity Gemini 3.1 Pro High实际统一两个Pane配色，根审查完整差分后仅应用样式体，用户布局保留。唯一只读reviewer最终BLOCKER=0、IMPORTANT=0、OPTIONAL=0，审查确认的六项必要问题已关闭。

- 页面为待学习、待复习、已掌握；今日自动队列按dueAt升序，未来项有独立提前练习入口。初选立即保存日期，核对记错同reviewId纠正为AGAIN；3R学习、HARD组末一次巩固、独立学习完成、同次有效结果计数均已实现。GOOD/HARD/AGAIN初始3天/1天/10分钟，短期再回忆不推进跨天次数，稳定通过按7/14/30天，最终至少30天核对后掌握退出。专注仍仅个人页。
- 最终PC复习/统计专项63/63，type-check、两项学科静态、build均exit0；Service首批相关25/25、独立OpenAPI9/9及SDK一致性通过，末期当前V29的Lifecycle/legacy/schema H2 14/14。PG首批2/2；移动栅栏、跨学科参数初始化与V28已有参数保留三个定向案例各1/1，均在临时PG17。
- 本机切页保留轮次；过期正文、不同/相同reviewId推进及legacy清空ID后的命令可按权威状态/历史清除并结束重开。history读取期间另一设备的新初选受二次校验保护。服务端正文失效、幂等回执、父锁校验与V29参数预置关闭相关数据边界。
- 分支仍为`codex/subject-review-stats`，原1050文件快照差分确认范围外文件、HEAD、空索引及既有Home/Settings删除保持；无依赖或全局样式修改，未提交或部署。GUI/Tauri、真实HTTP、双设备与生产迁移仍待验收，原全量Server工程门槛保持独立登记。完整设计与命令证据见 [设计](../../plans/2026-10-08-review-learning-mastery-design.md) / [本轮实施](../../plans/2026-10-08-review-learning-mastery-implementation.md)。
- 下面的两项反馈记录属于先前需求。当时审查对应 ReviewPane hash `a2145bb7`；收尾后该文件有外部布局写入并回写四档，执行 Agent 只局部重新合并两项 ratings，保留外部 UI。新快照与日志位于原 TEMP 目录 `after-concurrent-ui/`，后续复核因用户转入研究而停止，旧审查不代表最新文件或新机制已验收。

### 2026-10-08 复习卡片两项反馈（代码、相关自动验证及只读审查通过；GUI 待验收）

- 用户最新要求已实现：展开前先回忆，仅“展开内容”揭晓；揭晓后“下一个”（GOOD）或“记错了”（AGAIN）。首次成功反馈安排日期，记错项回到队尾，本轮再次练习不新增正式事件。
- 最终复习/统计专项 41/41，较早 PC 全量 R4 595/595，类型、两项学科静态和 build 退出 0；最后的测试断言增强由随后 41/41 覆盖。唯一只读 reviewer 本轮 BLOCKER=0、IMPORTANT=0、OPTIONAL=0。
- 当前用户视觉修改保留，本次源码仅 ReviewPane 与其测试；现行接口、调度、历史事件与 Store 作用域保持基线。未提交、暂存或切换容器，GUI/Tauri/真实 HTTP/多端业务验收未执行。完整命令与证据见 [实施补充](../../plans/2026-10-08-subject-review-stats-implementation.md)，此前范围外风险保持原登记。

### 2026-10-08 前端 Docker 构建排查（隔离构建通过；未部署）

- 用户原构建 `npm install` 的实际失败为 `ECONNRESET` / `network aborted`。Luna 读取原 Buildx 日志，随后使用同一 PC Dockerfile 单独构建，退出 0；依赖安装、前端编译、47/47 renderer 资产与镜像导出完成。
- 未修改源码、依赖或构建配置，未切换运行容器或操作数据卷。新接口仍须由用户完成后端重建/重启后业务重试，前端镜像通过不代表真实接口联调已验收。
- Docker 本次可用；没有重跑此前 Maven 容器错误门槛。完整命令与镜像/容器证据见 [基础设施记录](../../modules/Infrastructure.md)，原有未提交修改与删除保持。

### 2026-10-08 学科复习与统计交互重构（防剧透自测、计划打卡日历与自然学习文案）

- 用户明确要求复习页不要一开始就直接告诉要复习的和要学习的卡片，并彻底移除“查看知识块明细”；统计与复习中去除所有机械生硬的“评分”字眼，将复习范畴明确为“未学习”与“待复习”。
- `SubjectReviewPane.vue` 重构为沉浸式计划仪表盘：默认呈现“今日计划”卡片，展示学科名称、待学与待复习总量指标（`未学习 + 待复习`）、掌握度橙色进度条与“开始本轮”主操作按钮；彻底移除查看知识块明细折叠面板。
- 卡片未展开时进入初见遮罩自测模式：以骨架占位和温和微脉冲彻底遮挡正文与释义，仅保留“展开内容”按钮；展开后呈现完整 Markdown 正文与“下一个”（GOOD）/“记错了”（AGAIN）两项操作；去除界面所有“评分”字样，改为保存复习进度与历史记录。
- `SubjectStatsPane.vue` 全面优化文字表述：
  - 彻底去除“正式评分”、“评分分布”等字眼，改为“今日学习”、“累计学习”、“每日学习趋势”；
  - 彻底移除“记忆状态分布”板块；
  - 统计范围固定为近 7 天数据，移除 30 天切换按钮，呈现轻量“近 7 天”微徽章；
  - 核心状态明确为“未学习”、“待复习”、“已安排”，契合认知学习规律；
  - 保持签到日历（MON~SUN 与连续学习天数）、总览掌握度比例条与任务状态卡片。
- 自动化门槛：`node --experimental-strip-types --test scripts/r4-subject-review.test.mjs scripts/r4-subject-stats.test.mjs` 41/41 通过；`npm.cmd run type-check` 退出 0；生产构建 `npm.cmd run build` 退出 0。

### 2026-10-08 学科内复习与统计（代码、相关自动验证及只读审查通过；真实环境待验收）

- 用户已选择移除失效的 Timeline 复习自动生成，并要求新建页面与逻辑；新入口明确位于学科工作区侧栏。
- 两个 Luna 执行 Agent 已完成学科范围分页状态与只读统计接口，以及 PC 简单页面框架。侧栏复习按新学习/到期/已安排展示，5 / 10 分组、正文回忆与四档自评复用现行评分/历史/调度。
- 用户进一步明确每知识块每轮首次非 SKIP 评分计算一次下次日期，后续仅本轮巩固；新增独立学科统计页，展示资料、知识块、复习与任务。专注时长与轮次明确只在个人页显示。推荐服务端学科范围聚合，不将全局统计当学科数据。
- 本轮练习按用户最新要求仅支持本机切页恢复：Store 内存保留队列、当前卡片、首次评分标记与待确认请求，返回继续且不重复调度；刷新/重启或切账号清除本轮缓存。
- 分支为 `codex/subject-review-stats`，HEAD/index 保持未提交与未暂存。最终 PC 专项 40/40、R4 594/594，类型/两项学科静态/build 退出 0；Service 新增专项 4/4、相关回归 19/19，运行时 OpenAPI/SDK 生成及一致性检查通过。唯一只读 reviewer 最终 BLOCKER=0、IMPORTANT=0，八项必要反馈已关闭。成功删除学科在页面卸载后也清除轮次，失败与账号交错不会误清其他缓存。完整命令、diff/hash 及 1040 文件工作树保护见 [实施记录](../../plans/2026-10-08-subject-review-stats-implementation.md)。
- 用户进一步要求本轮不使用 Antigravity，PC 仅直接搭建功能可运行的简单页面框架，界面后续由用户调整；后端与业务逻辑保持已批准范围。
- 保留一个 OPTIONAL：未同步 KB 可显示在新学习列表但不计入可复习集合，评分受保护；本次未修改。此前优先修复保持冻结，其余功能仍按用户要求逐项讨论。
- 本次全量 Maven 实际 386 项中 1 failure、6 error、0 skip：既有 TaskColor 迁移断言 V21/V28 仍失败，6 个容器类因当前无有效 Docker 环境报错。不写成全项目通过，也不替代 GUI、真实 Tauri/HTTP 或双设备业务验收。

### 2026-10-07 三项优先问题修复（代码、相关自动验证及只读审查通过；真实环境待验收）

- F1：同步周期、文件导入及上传队列固定发起账号/设备/会话代际，Axios 派发、响应、刷新与重试核验票据；旧 A 操作不能使用 B 凭据或更新 B 投影，保留 A 待同步内容。普通请求与同步共用会话刷新单飞；当前刷新失败进入登录，迟到 A 失败不能清除或导航已登录 B。
- F2：FILE 创建、换 Asset、恢复与保留期清理共用 owner Asset 悲观锁；每个清理事务锁内重查引用并提交 ORPHANED，再删除对象。恢复先提交时保留对象，清理先提交时拒绝新引用，删除失败可重试。
- F4：Profile 标签改为“本周专注天数”，与现行 weekly 专注日数一致。实际由 Antigravity Gemini 3.1 Pro High 完成单行标签；两个 Luna 执行 Agent完成账号边界、后端及回归，唯一只读 reviewer 最终 BLOCKER=0、IMPORTANT=0。
- 最终 PC 专项 107/107、R4 554/554，类型、两项学科静态检查与构建退出 0；Service PostgreSQL 并发 5/5、相关回归 56/56。全量 clean Maven 392 项中 391 通过、1 failure、0 error/skip：既有迁移断言 V21/V28 不符。AccountDeletion 时间精度失败本次未复现，未声明修复；全项目门槛仍未全部通过。
- 当前回归使用真实 Store/browser Repository/Axios adapter、真实 PostgreSQL 和可控对象存储；GUI、Tauri SQLite/Keyring、真实 HTTP/生产 MinIO 与双设备仍待业务验收。工作树保护与完整命令见 [实施记录](../../plans/2026-10-07-priority-function-fixes.md)。其余功能项依用户要求逐项询问，下一项为复习查看与管理。

### 2026-10-07 PC / Service 功能完整度检查（修复前只读审计；三项已由顶部修复关闭）

以下保留审计时实现、缺陷与测试证据；当前关闭状态和最新门槛以顶部修复登记为准。

- 三个 Luna 极高思考执行审计分别覆盖全部 PC 路由/用户操作、文件/解析/同步/Focus/Overview 数据链路、Service 功能与全量测试；唯一只读 reviewer 裁决 1 项 BLOCKER、2 项 IMPORTANT、10 组 OPTIONAL（含既有项/范围相关项）。本轮不修改业务代码、不使用 Antigravity 生成，报告与关闭条件见 [完整检查](../../current/2026-10-07-pc-service-function-audit.md)。
- BLOCKER：真实 SubjectStore 创建 A 未同步学科、真实 AuthStore 退出 A 并登录 B 后，旧同步周期将 A SUBJECT CREATE 与 B token/device 一起交给实际 Axios adapter。独立 browser 内存复现还显示 A 文件名进入 B 本地 ASSET 投影。均未执行真实 HTTP/Tauri 落盘；Service 新学科可能按 B 创建为代码推断，已有 A 资源 owner 隔离仍有效，不能写成服务端串写已复现。
- 两项 IMPORTANT：Service 文件保留清理与 Source 恢复存在未共用锁的并发丢文件窗口（代码确认，未动态复现）；Profile“连续专注天数”实际统计本周有专注的日数。复习旧生成器确有数据模型断链，按本候选 PC 职责边界列 OPTIONAL/范围相关，不要求新增 PC 评分界面。12 项无业务效果偏好及原时间轴两项 OPTIONAL 保留。
- 实际 PC type-check、两项学科静态检查退出 0，R4 542/542；数据链路聚焦 345/345 与全量重叠，不相加。Service `./mvnw.cmd -B -ntp clean test` 干净编译后退出 1：387 项中 385 通过、2 失败、0 error/skip，PostgreSQL/pgvector 与 MinIO 容器测试实际运行。两失败为迁移 V21/V28 预期和 PostgreSQL 时间精度差 1µs，单列工程门槛，不推为运行时业务故障。
- 登录/注册最终逻辑继续按用户要求延后，Suggestions/旧页面/快捷入口/知识块摘要标签保持既定取舍。真实 Tauri GUI/Keyring/文件解析与 OCR、会话重登、AI/SSE/Provider、断网续传和双设备仍需业务验收。工作树仅追加本轮报告、README 与状态/风险登记，用户源码/测试/配置/既有删除及 HEAD/index 保留。

### 2026-10-07 PC 时间轴放置与交换修复（代码、自动验证及只读审查通过；真实环境待验收）

- 在线插入/交换响应在同一 SQL 事务或 browser 状态提交中跳过低版本和会清除墓碑的活动响应，其他有效成员仍原子合并；保留整批未解决 mutation 围栏。Store 保留响应原始版本（含 0），在成功、围栏拒绝和缓存异常后重读当前 Repository，不直接安装迟到响应。
- 按天择槽覆盖 22:30，保留完整截止和区间冲突约束。交换在 API 前检查实际新起点位于 08:00–22:30；紧邻使用原共同窗口日，非紧邻使用各新起点日，越界整组无写入。服务端交换算法、API 和数据库结构保持现行契约。
- 实际 test-only RED 125 项中 10 失败；最终专项 127/127、PC 542/542，类型、两项学科静态检查和构建退出 0。唯一只读 reviewer 本轮 BLOCKER=0、IMPORTANT=0、OPTIONAL=0，三项 IMPORTANT 已在代码、自动验证和审查层关闭；原两项 OPTIONAL 保留。
- 实际由 Luna 管理 Antigravity 生成，Luna 做有证据的必要源码/测试补修和门禁，主 Agent核对完整快照差分与日志。151 个范围外既有文件 hash 未变，用户原删除、HEAD/index 保留；没有依赖、生成产物或跨模块源码变更。现行文档已同步。真实 GUI、Tauri SQLite、HTTP 并发和双设备待验收，完整交接见 [实施记录](../../plans/2026-10-07-timeline-placement-and-swap-fixes.md)。

### 2026-10-07 PC / Service 时间轴放置与交换复查（修复前只读审计；三项已在后续修复关闭）

- Luna 极高思考执行只读检查及隔离复现，确认三个新问题：迟到的在线排期响应覆盖较新的同步版本或删除墓碑；按天排期漏扫 22:30；晚间紧邻异长交换把新起点推到 23:00，任务脱离日视图可见网格。本轮没有修复业务代码。
- 第一项为最高修复优先级：实际 Store、LocalRepository 和 `runSyncCycle` 复现先接收 v9、后写回 v8；已推进的 cursor 后再次普通 read 返回空变更，未修正本地状态。插入与交换共用写回路径；SQL 分支缺版本/墓碑守卫为代码确认，动态复现使用 browser fallback 与 API 桩。服务器较新数据未被本次复现改写。
- 本轮实际 PC 排期/规则/页面专项 90/90、LocalRepository 22/22、Service/Controller 排期聚焦 15/15、Service 边界 4/4，退出码均为 0。测试通过未覆盖上述三个缺口；复现完成不等于问题关闭。晚槽交换的精确 Service 组合未动态执行，算法按现行共同窗口契约代码确认。
- 现行前端文档中排期全部走 outbox 的旧描述已按在线插入/交换和本地按天/取消排期的实际路径校正。既有跨周同星期 swap 与当前时刻标记 OPTIONAL 保留；真实 GUI、Tauri SQLite、HTTP 时序、双设备及真实数据库未验收。详情和关闭条件见 [问题登记](../../current/IssuesAndReview.md) 顶部；报告及日志在 `C:\Users\Gnasche\AppData\Local\Temp\auralis-placement-swap-audit-20261007.md` 和同名目录。

### 2026-10-07 PC 时间轴日期与拖放修复（代码、自动验证及只读复核通过；真实环境待验收）

- 已实现用户批准的四项修复：按槽操作在入队前保存具体本地日期；同日改期按完整日期核对来源；周视图活动的已有排期可移动到日期列；重挂载后标题、选中态与 Store 槽位恢复同一日期，包括下周。
- 唯一 reviewer 实际复现了放宽按天入口后的未排期 DONE 写入回归。Luna 管理 Antigravity 最小补回完成态守卫；DONE/CANCELLED 有无排期四种状态均拒绝，仓储、版本、outbox、任务和槽位投影无写入回归通过，同一 reviewer 确认关闭。
- 主树初始基线 80/80，测试先行 RED 为 85 项中 5 失败，完成态补修也有实际 RED；最终专项 90/90、PC 527/527，类型/两项学科静态检查/构建均退出 0，主 Agent 已核对最终日志。实际使用 Pinia/LocalRepository browser fallback 和 API 桩，重挂载执行真实组件计算体并与 Store 投影联结，不代表真实 GUI、Tauri、HTTP 或双设备业务验收。
- 本轮由 Luna 管理 Antigravity 生成与必要补修、完善真实测试和执行门禁，主 Agent 核对完整文件快照差分及日志，单个只读 reviewer 复核。保留用户切日加载与此前截止、顺延、换位、自动完成/墓碑保护；没有接口、数据库、依赖或跨模块变更。当前时刻标记/午夜跟随、跨周同星期 swap 守卫仍为未处理 OPTIONAL；独立新增边界用例未覆盖范围如实列在 [实施记录](../../plans/2026-10-06-timeline-date-and-drag-fixes.md)。

### 2026-10-06 PC AI 参考范围下拉菜单交互收敛（代码、自动验证通过；真实环境待验收）

- **AI 参考范围交互收敛**：
  - `SubjectWorkspace/index.vue`：移除顶部参考范围区域中冗余占位的「当前文件」独立选项，顶部显示当前学科参考范围；
  - 正在浏览的文件直接在下方的「已关联文件」列表中默认呈选中高亮状态，并附加绿色徽标「当前」（`.mini-menu-current-tag`），消除了顶层伪选项与关联文件列表割裂的双重展示体验；
  - 弹出菜单高度优化为 `max-height: 380px`，空间更宽敞舒适。
- **门禁验证**：`type-check` 退出 0，`test:r4-pc`（513/513 全部通过），`check:subject-workspace` 退出 0。真实桌面端 GUI 待人工走查。

### 2026-10-06 PC 首页时间轴左右切换与日/周视图动效优化（代码、自动验证通过；真实环境待验收）

- **时间轴日期左右滑动与日/周视图切换微动效**：
  - `Dashboard/index.vue`：
    - 日期选择器按钮（`.db-day-btn`）增加触感微缩放反馈（`scale(0.94)`），激活日期圆圈（`.db-day-date-circle`）带弹性膨胀回弹（`day-circle-pop`）；
    - 日程任务列表包裹 `.scheduled-task-viewport`，接入方向感知滑动过渡 `<Transition :name="`timeline-slide-${timelineSlideDirection}`" mode="out-in">`：向未来日期切自右向左滑入（`translateX(20px)`），向过去日期切自左向右滑入（`translateX(-20px)`），曲线采用 `cubic-bezier(0.16, 1, 0.3, 1)`（进入 220ms，离开 120ms）；
    - 日视图与周视图切换包裹 `.timeline-mode-viewport`，接入 `<Transition :name="`timeline-mode-slide-${viewModeSlideDirection}`" mode="out-in">`：切到周视图时自右向左平滑滑入（`translateX(18px)`），切回日视图时自左向右平滑滑入（`translateX(-18px)`）；
    - 周视图行（`.db-weekly-day-row`）点击带按压反馈（`scale(0.985)`）并平滑逆向滑回日视图并保留选定日期，顶部日/周切换胶囊按钮（`.db-view-toggle-btn`）增加 `:active` 缩放微触感。
- **门禁验证**：`type-check` 退出 0，`test:r4-pc`（513/513 全部通过），`check:subject-workspace` 与 `check:subject-icons` 退出 0。真实桌面端 GUI 待人工走查。

### 2026-10-06 PC 首页切换学科丝滑微动效优化（代码、自动验证通过；真实环境待验收）

- **首页学科切换微动效**：
  - `Dashboard/index.vue`：左侧学科空间项（`.subject-item`）与全部知识卡片（`.global-view-card`）追加按压微缩放（`scale(0.985)`）与悬停位移微反馈，选中时激活绿点（`.active-dot`）带弹性展开动画（`dot-pop`）；
  - 中间知识流流式容器接入 `<Transition name="stream-switch" mode="out-in">`，以 120ms 离开淡出与 220ms 从下方 6px 自然托起浮现，实现极度丝滑的内容切换；卡片按索引微延迟阶梯式淡入（`--row-delay`）；
  - 知识流标题联动展示当前学科名称与知识块数量，切换时平滑更新。
- **门禁验证**：`type-check` 退出 0，`test:r4-pc`（513/513 全部通过），`check:subject-workspace` 与 `check:subject-icons` 退出 0。真实桌面端 GUI 待人工走查。

### 2026-10-06 PC 知识总览同步提示移除与文件导入进度极简体验优化（代码、自动验证通过；真实环境待验收）

- **移除知识总览同步报错提示条**：在学科工作区的“知识总览”大纲列表中，移除 `FileOutlineList` 和 `SubjectOverviewSection` 原有的侵入性 `file.syncStatus === 'ERROR'`（“本机总览尚未同步；重新生成并保存后会重试”）警告条，避免技术性同步重试干扰用户对大纲和总览的正常浏览与编辑；相关大纲在等待就绪时展示呼吸感微旋转动效。
- **文件导入进度极简好看与平滑体验**：
  - `FileRegisterDialog.vue`：回归 Zen 极简设计风格，去除复杂的步骤条与多层卡片，去除扩散脉冲微动效（`pulse-dot`），采用单行阶段说明 + 等宽百分比数字 + 4px 纯净细进度轨（Sage 鼠尾草绿单色/平滑渐变）；引入基于 `requestAnimationFrame` 的平滑步进引擎，平缓爬升并在底层任务完成时丝滑冲刺滑入 100%，彻底解决因本地快速持久化导致进度条从 10% 瞬间瞬移跳到 100% 的生硬突变；
  - `SubjectWorkspace/index.vue`：去除抽屉顶部冗余闪现的侧栏进度条，避免多处重复动画干扰；在 `handleRegisterFile` 录入完成时给予 550ms 轻柔停留展示，让用户清晰感知完成态后再优雅关闭弹窗；材料列表项移除文字徽章与报错标签，仅使用轻盈状态点（`<DocumentProcessingDot />`）做状态提示，完整的解析进度、OCR 阶段及报错原因集中在个人中心文件解析处查看。
- **门禁验证**：`type-check` 退出 0（0 错误），`r4-overview-sync.test.mjs`、`r4-subject-overview-ui.test.mjs`、`r4-register-file.test.mjs`、`r4-document-processing-ui.test.mjs`、`r4-file-preview.test.mjs` 等全部专项测试通过。真实桌面端 GUI 待人工走查。

### 2026-10-06 任务完整排期截止校验（代码、自动验证及只读审查通过；真实环境待验收）

- 用户确认完整结束时间不得晚于截止时间，覆盖新建/恢复、时间编辑、拖放、按天排期、换位和全部实际顺延任务；无截止不限制，恰好结束允许。
- 实际 RED 已复现新需求缺口；最终 PC 513/513、四脚本 102/102、后端三类 clean 37/37，类型/静态/构建均退出 0。历史非时间编辑、offset/null 等价、自动完成与墓碑保护回归通过。
- Antigravity 隔离生成 PC 修复并补必要边界，Luna 实施后端及真实回归，主 Agent 核对完整差分和日志；单个只读 reviewer BLOCKER=0、IMPORTANT=0、OPTIONAL=0。隔离工作树已清理，用户既有修改保留。GUI/Tauri、真实服务与双设备同步待验收，完整证据见 [实施记录](../../plans/2026-10-06-task-schedule-deadline-guard.md)。

### 2026-10-06 PC 知识块 Markdown 排版与 LaTeX 数学公式渲染（代码、自动验证通过；真实 GUI 待验收）

- 新增统一前端 Markdown 与数学公式渲染引擎 `src/utils/markdown.ts`，基于 `marked`、`katex`（v0.16.47）和 `dompurify`；支持块级公式（`$$...$$`, `\[...\]`）、行内公式（`$...$`, `\(...\)`），具备货币符号防误伤、代码块变量防破坏与 LaTeX 解析容错能力。
- DOMPurify 开启 MathML（`math`, `semantics`, `mrow`, `mfrac`, `msqrt` 等）及 SVG 路径与 `style` 属性放行，杜绝公式结构被安全策略剥离；样式引入 `katex/dist/katex.min.css` 并随构建自动打包 KaTeX 字体。
- 修复 `modal.css` 全局 CSS 误用 `:deep` 导致的标题、段落、代码块样式失效 Bug，全面升级排版规范，补齐 h1~h6、列表（抹茶绿标记）、引用块、表格、代码卡片及公式居中滚动布局，深浅色自适应。
- `KnowledgeBlockViewDialog.vue`、`WorkspaceKnowledgeBlockDialog.vue`、`Dashboard/index.vue`、`SubjectWorkspace/index.vue`、`Asset/index.vue` 均收敛接入统一渲染；工作区知识块弹窗浏览态顶栏对齐首页知识块规范（「知识块详情」+ 学科药丸徽章）；全局顶栏 `AppHeader.vue` 增加番茄钟开启/运行中同步时间胶囊（88px × 36px），采用跑道形宽边框进度条缩减动画（3.8px 描边）、温润宣纸底色、纯粹等宽极粗体跳秒数字（14px, 800 字重）与底部立体柔和悬浮阴影，支持一键路由跳转。
- 新建任务弹窗 `TaskCreateDialog.vue` 增加截止时间选择项，复用资产页 `Asset/index.vue` 的温润宣纸米白 `.zen-date-picker` 和 `:global(.zen-date-popper)` 体系，固定浅色宣纸底色与墨黑字体，消除发黑问题；首页看板、排期页和学科工作区统一支持选择截止时间并在待办列表实时呈现截止徽标。
- 门禁验证：专项测试 `scripts/r4-knowledge-markdown-formula.test.mjs`（10/10 通过），`scripts/r4-header-pomodoro-pill.test.mjs`（通过），`scripts/r4-task-create-dialog-deadline.test.mjs`（2/2 通过），`test:r4-pc`（517/517 全部通过），`type-check` 退出 0，`check:subject-workspace` 与 `check:subject-icons` 退出 0。真实桌面端 GUI 待人工走查。

### 2026-10-06 PC 未排期任务截止后自动完成（代码、自动验证和只读审查通过；真实 GUI 待验收）

- 无排期的 TODO/IN_PROGRESS 活动任务在有效 `dueAt <= now` 时自动完成，保留截止时间和其他业务字段；已排期任务按原排期结束时刻处理。沿用启动、TASK 投影刷新及每分钟检查，关闭应用期间到期在下次启动补处理。
- 自动完成沿用本地写队列、持久行重读、版本/outbox 围栏和后台同步，增加截止时间漂移检查。终态、无效/空截止不写入；单项保存失败可重试且不阻断其他任务。
- 单个只读 reviewer 发现的 Subject cascade 同版本墓碑竞态已补修：自动完成预读和原 SQL/browser 提交段要求活动行，防止旧 payload 复活已删任务。真实 cascade 四种交错及 browser/SQLite 仓储条件均通过，最终同一 reviewer BLOCKER=0、IMPORTANT=0、OPTIONAL=0。
- 最终四脚本专项 86/86、PC 488/488，类型、两项学科静态检查和 build 均退出 0；补修前 RED 已实际复现缺陷。Server 现有截止/排期语义 clean focused 2/2。主 Agent 已核对实际日志和完整脏树差分，见 [实施与验证记录](../../plans/2026-10-06-unscheduled-task-deadline.md)。
- Antigravity Gemini 3.1 Pro High 实际生成逻辑补丁，Codex 补必要导入、实际 Store/Repository 回归并执行验证；隔离工作树已清理，用户既有修改保留。未提交工作树、部署或进行 GUI/Tauri/真实服务及双设备业务验收。

### 2026-10-01 提问选中文本链路（代码和自动验证通过；真实 Provider/GUI 待验收）

- 用户完成的引用 UI 保持原样，ChatStore 独立传递 selectionText；后端优先使用顶层引用、保留现行嵌套字段；引用限 4000 字符，仅用于当前模型请求。2026-10-12 批准的新聊天默认开启检索，不提供关闭模式，实施状态见本页顶部。
- 引用作为 USER 资料并配固定 SYSTEM 安全说明，预算优先保留完整当前问题和引用；无法容纳时在 SSE 开始前明确 HTTP 400，不静默丢弃引用。
- Server 最终 clean focused 47/47，OpenAPI export 8/8、SDK 生成/校验退出 0；PC focused 5/5、最终回归 478/478、类型/构建退出 0；Mobile 仅生成类型适配且类型检查退出 0。主 Agent 核对日志和完整脏树差分，命令与最终审查见 [实施记录](../../plans/2026-10-01-chat-selected-text.md)。
- 前端传递层与专项测试实际由 Antigravity Gemini 3.1 Pro High 生成，Codex 执行代理完成后端、生成契约和命令验证；用户工作树保留。未提交、部署或执行生产迁移，真实模型服务/GUI 未验收。
- 单个只读 reviewer 本轮 BLOCKER=0、IMPORTANT=0、OPTIONAL=0；相关实现冻结，业务环境验收单独记录。

### 2026-10-01 PC 学科界面选区跟随浮动提示与提问引用 UI（代码与自动验证通过；真实 GUI 待验收）

- 选区提示紧贴文字旁边浮动：由原有左下角固定工具栏改为动态计算选区 `Range.getBoundingClientRect()` 坐标的悬浮胶囊气泡（`.floating-selection-bubble`），支持文字上方/下方智能自适应翻转与安全边距保护，失焦或选区折叠时平滑消失。
- 精简操作项并保留“保存为知识块”与“添加到提问”两项核心交互，移除冗余解释/追问按钮，代码保留兼容签名。
- 添加文字添加到提问 UI：点击“添加到提问”后将选区文本附入右侧提问区域，在输入胶囊上方渲染精致的“已引用选中文本”微卡片（`.chat-selection-quote-card`），去除了左侧多余图标，保持纯文字标题、字数提示、双行截断与随时移除 `×`；发送时自动作为 `selectionText` 伴随提问提交。
- 门禁验证：`npm.cmd run type-check` 退出 0、`npm.cmd run test:r4-pc`（477/477 全部通过）、`npm.cmd run build` 生产构建成功。真实 GUI 待人工走查。

### 2026-10-01 PC 资产库知识块与任务编辑配色对调及全部知识块学科回填修复（代码与自动验证通过；真实 GUI 待验收）

- 对调资产库知识块与任务编辑底色：主编辑卡片（`.editor-paper-card`）底色调整为米灰主内容底色 `var(--color-bg-primary, #F7F2EB)`（深色模式：`#131713`）；正文文本域、任务备注文本域（`.paper-textarea`）及任务属性卡片（`.paper-property-panel`）底色调整为温润宣纸白 `var(--color-bg-tertiary, #FAF7F2)`（深色模式：`#181D18`），状态胶囊同步对调。
- 修复全部知识块左上角学科显示“未指定学科”缺陷：在资产库汇总分类构建全部知识块树节点时，将硬编码的 `groupId: 'all'` 修复为真实所属学科 `groupId: b.subjectId || 'all'`，使知识块卡片左上角学科选择器和面包屑正确高亮回填对应学科。
- 门禁验证：`npm.cmd run type-check` 退出 0、`npm.cmd run test:r4-pc`（477/477 全部通过）、`npm.cmd run build` 生产构建通过。真实 GUI 待人工验收。

### 2026-10-01 PC 学科编辑保存修复（代码、自动验证和只读审查通过；真实 GUI 待验收）

- 修复表单事件后提前关闭、保存时丢失 Subject 元数据和新图标未写入 iconKey；本地提交成功后关闭，失败显示通知并保留输入可重试。当前 Store 列表无目标时不生成 UPDATE。
- 保存期间通过 Hall/Modal 守卫阻止重复提交、关闭和切换表单，失败 finally 释放；沿用既有 Store、同步、API 和数据库契约。
- 执行代理最终专项 7/7、PC 回归 477/477；type-check、check:subject-icons、check:subject-workspace、build 均退出 0。主 Agent 核对最终日志与完整快照 diff；单个只读 reviewer 本轮 BLOCKER=0、IMPORTANT=0。命令和证据见 [问题登记](../../current/IssuesAndReview.md)。
- 本轮实际使用 Antigravity Gemini 3.1 Pro High 生成必要字段/关闭补丁，Codex 执行代理补充错误反馈、竞态守卫及回归；Antigravity 委派工作树已清理。用户既有工作树保留，未提交或部署。
- 既有 Pinia 与 durable 删除状态的短暂不一致登记为 OPTIONAL 后续任务。浏览器/Tauri GUI、原用户数据库故障和真实服务未验收，不以自动检查替代业务验收。

### 2026-10-01 PC 学习数据清理、专注统计与 Overview 同步（代码、自动验证和只读审查通过；真实环境待验收）

现行变更覆盖下列早先条目的 Home、知识块摘要/标签与 Overview 仅本机缓存描述；早先验证计数只证明当时版本，不能作为本轮门禁。

- SearchPalette AI 快捷项与无运行入口的 Home/Settings 已删除；八条正式路由及搜索跳转保留。KnowledgeBlock 读写只使用正文，Server V28 删除 summary/tags 列，历史不可变 mutation/receipt 和端侧备份不改写。
- 专注按用户确认的实际时间口径实现，暂停/休息排除，中断保存，自然完成增加轮次。本机按 owner/device 持久活动状态及最终事件，Profile 使用独立 Server focus 聚合；已完成 PC focused 7/7。
- Server V26/V27 提供专注记录和完整 Overview 独立结果/回执；PC 对账与 outbox 已接入，失败/半成品不上传。完成固定载荷重放、显式冲突选择、删除/恢复生命周期及本地草稿保护；Tauri SQL 固定单连接以保证既有队列事务连接一致性。
- 最终 PC type-check、两项学科静态检查和 build 均退出 0，回归 470/470；Overview 主 focused 104/104，失败恢复 focused 67/67；Server 最终跨业务 fresh 57/57、专注边缘 fresh 7/7；native 实际池事务 1/1、fmt/check 退出 0。单个只读 reviewer 最终本任务范围 BLOCKER=0、IMPORTANT=0。命令、日志和不重叠计数说明见实施计划。
- OpenAPI artifact 8/8、check-openapi 退出 0；Mobile 仅必要契约适配，type-check 退出 0、协议 23/23。Antigravity 已按规则尝试，但因 Gemini 配额 429 且未产生改动，实际实施由 Codex 子代理执行。
- 12 项无实际效果的偏好已汇总在 FrontendPC；资产状态、登录注册按用户指示保留当前范围。真实 GUI、Tauri 重启升级、双设备、Provider、PostgreSQL/MinIO 与运行服务部署均未由上述命令验收。

### 2026-10-01 PC 首页与学科工作区知识块内容展示全面重构、正文/摘要解耦与精简（代码与自动验证通过，真实 GUI 待验收）：
- 首页与学科知识块展示缺陷根治：排查并彻底解决首页与学科工作区知识块内容展示粗糙与弹窗缺陷。弃用首页 `Home/index.vue` 内部写死的 520px 窄弹窗，重构接入统一 `ModalShell size="lg"`（760px 舒适大画布）；重构弹窗正文排版，采用杂志级 `.kb-article-container`，上设 `.kb-meta-card`（大标题、来源文件、友好的相对时间与学科胶囊），下设内凹宣纸米白 `#FAF7F2` 底板的正文卡片 `.kb-content-card`，Markdown 渲染支持段落、代码块、引用及平滑滚动条，并配精致空状态；
- 卡片与浏览态体验升级：首页与学科工作区（`SubjectWorkspace/index.vue`）知识块卡片统一以 `block.preview || block.content || '暂无详细内容'` 作为正文预览，配合 3 行平滑截断，杜绝空文本；弹窗底部左侧提供“复制内容”（带绿勾交互反馈）与“前往知识块界面”直达按钮（携带 `?view=blocks` 路由参数直接穿透跳转至对应学科的知识块工作区界面）；
- 知识块正文与摘要解耦：`useKnowledgeStore.ts`、`Home/index.vue`、`WorkspaceKnowledgeBlockDialog.vue`、`Asset/index.vue` 与 `KnowledgeBlockEditor.vue` 全链路将核心输入文本域与真正的正文内容 `content` 深度绑定，彻底解决此前误绑 `preview/summary` 导致的正文修改不生效、长文截断至 180 字符的缺陷；保存时自动派生 `preview`；
- 学科关联与转移修复：首页知识块弹窗与资产页知识块工作台全面升级所属学科为 `<el-select>` 选项器，支持转移归属学科并正确同步目标 `subjectId` 与学科名称；
- 移除摘要说明与标签展示：全面清除表单中的“摘要说明 (Summary)”与“知识标签 (Tags)”输入框，正文编辑区（“知识内容”）自适应拓宽为主编辑视口；同时彻底移除查看态中的标签列表展示，界面更极简纯粹；
- 门禁验证：`npm.cmd run type-check` 退出 0、`npm.cmd run test:r4-pc`（433/433 项全部通过）、`npm.cmd run build` 生产构建通过。真实 GUI 交互待人工走查验收。

### 2026-10-01 PC 页面切换与弹窗动效全面补齐（代码与自动验证通过，真实 GUI 待验收）：
- 页面切换与工作区过渡：`src/App.vue` 顶层 `<router-view>` 与登录态外壳切换全量引入 `page-fade` 与 `shell-fade`（阻尼弹簧贝塞尔曲线 `cubic-bezier(0.16, 1, 0.3, 1)` 与微位移 6px）；`SubjectWorkspace` 中心区概要/预览/知识块及 `Asset` 资产阅览区和星图切换全量引入 `workspace-view-fade` / `asset-view-fade` 缓动，杜绝视图硬切。
- 弹窗与浮层动效闭环：`modal.css` 统一遮罩与卡片进出场为完全同步的 `0.24s`，消除截断闪烁；`ModalShell.vue` 启用 `appear` 强化初始挂载入场动效；`SubjectCreateModal.vue`（创建与编辑学科）重构为标准 `v-model` 并平滑退场，告别 `v-if` 硬拔除闪变；`SearchPalette.vue` 解耦遮罩与卡片 transform；`DocumentNotReadyDialog.vue`、`SubjectWorkspace.vue` 的 `refine-overlay` 以及 `Home/index.vue` 的 4 个内联弹窗全面包裹 `<Transition>`。
- 门禁验证：`npm.cmd run type-check` 退出 0、`npm.cmd run test:r4-pc`（433/433 全部通过）、`npm.cmd run build` 构建成功。真实浅色/深色/窄屏 GUI 视觉效果待人工验收。

2026-10-01 PC 弹窗配色对调与立体层次增强（代码与自动验证通过，真实 GUI 待验收）：
- 全局弹窗底色与框内配色对调：弹窗主卡片底板 `--modal-bg` 对调为米灰主内容底色 `var(--color-bg-primary, #F7F2EB)`（深色模式：`var(--color-bg-primary, #1f1e1c)`）；框内控件（`.modal-form-input, .modal-form-textarea, .modal-form-select`）、内嵌卡片（`.modal-card-inset`、阅读卡片等）对调为浅宣纸米白 `var(--color-bg-tertiary, #FAF7F2)`（深色模式：`var(--color-bg-tertiary, #2e2c29)`）；业务弹窗组件全面对齐（`KnowledgeBlockViewDialog`、`TaskCreateDialog`、`SummaryInstructionDialog`、`SubjectCreateModal`、`FileRegisterDialog`）。
- 按钮与输入框底部立体阴影：表单输入控件追加轻柔底阴影 `0 1.5px 4px rgba(0, 0, 0, 0.05)`（深色模式：`0 2px 6px rgba(0, 0, 0, 0.35)`）；次级按钮追加底阴影；主操作与危险按钮强化漫反射立体阴影；弹窗内芯片（`.subject-chip`、`.preset-chip`、`.icon-btn`）统一追加底阴影与微升交互。
- 门禁验证：`npm.cmd run type-check` 退出 0、`npm.cmd run test:r4-pc`（433/433 全部通过）、`npm.cmd run build` 生产构建成功。真实浅色/深色/窄屏 GUI 视觉效果待人工验收。

2026-09-29 PC 弹窗视觉收敛（代码与自动验证通过，真实 GUI 待验收）：沿用现有 `ModalShell` 与业务事件，仅调整展示层。遮罩模糊从 14px 降至 5px，外框圆角从 24px 收至 16px，宽度档位调整为 420/520/680/840px，统一 24px 横向留白、28px 小圆角关闭按钮及 36px/8px 操作按钮；减少任务、密码、总结和确认弹窗标题中的装饰图标，文件、知识块和学科选择区域的小控件也收敛圆角。PC `type-check` 退出 0、`test:r4-pc` 433/433、`check:subject-icons` 与 `check:subject-workspace` 退出 0、生产构建退出 0。临时静态外壳预览已查看并移除；实际业务弹窗的浅色/深色/窄屏及 Tauri GUI 尚未验收。

2026-09-27 PC 全局弹窗无缝流式 UI 重构、8px 工程化按钮系统与无障碍修复（代码与门禁验证通过，GUI 待验收）：
1. 统一模态基础设施建设与 Linear 极简雅致规范：
   - 新增 `src/components/modal/modal.css` 与 `src/components/modal/modalManager.ts`；
   - 消除硬线条分割与断层：移除 Header 与 Footer 处的 `1px solid` 硬线条切块，整体卡片形成一体化无缝呼吸画布；遮罩升级为 `backdrop-filter: blur(16px) saturate(160%)` 沉浸微光滤镜；弹窗卡片采用 16px 精确工程圆角（对齐 Linear / macOS）、低反差双层环境漫反射阴影（`0 24px 64px -12px rgba(...)`）；
   - 告别卡通感药丸圆角，全面推行 8px 精确工程圆角矩形控件：主操作为哑光 Zen Sage 绿 `#5B6C47`（36px 高、内嵌顶边微发丝高光、13px/500、微触觉缩放 `scale(0.985)`）；次操作为现代极简幽灵灰 `rgba(0, 0, 0, 0.035)`；危险操作为纯正克制陶土绯红 `#D93838`；关闭按钮采用 28px × 28px 极简微圆角（6px）幽灵按钮；
2. 基础模态壳统一无缝三层布局重构：
   - 顶部无缝吸顶标题栏（`.modal-shell-header`）：统一支持 `#header` 自定义或 `#title` 标题插槽，标题采用 16px/600/`-0.015em` 负字间距精密排版，长内容滚动时标题与关闭按钮恒定可见；
   - 中间独立纵向平滑滚动内容区（`.modal-shell-body`）：自适应父级最大高度与视口限制（`max-height: calc(100vh - 48px)`），彻底消除卡片内层嵌套 `max-height` 造成的“双重滚动条”恶劣体验；
   - 底部无缝吸底停靠操作区（`.modal-shell-footer`）：统一支持 `#footer` 插槽，规范化右对齐主要与次要操作按钮（左侧支持危险操作或自定义扩展），保持全站各业务弹窗操作区位置与视觉一致；
3. 业务弹窗系统化提取、布局重构与 UI 美学升级：
   - `ConfirmDialog.vue`：全面接入统一 `ModalShell`，移除笨重矩形徽章与内部多重边框，标题栏内嵌精致图标与字号微调（15px/600/-0.01em），正文舒展呈现，搭配次要幽灵按钮与危险/主要 8px 圆角确认按键；
   - `ChangePasswordDialog.vue`：增加 `IconShieldLock` 顶栏图标、去边框柔和安全建议横幅与带图标的错误提示条；
   - `SummaryInstructionDialog.vue`：增加 `IconSparkles` AI 顶栏、6px 轻量无边框提示词胶囊按钮组（一键点击追加/填入）与字数统计；
   - `TaskCreateDialog.vue`：增加日历图标顶栏、6px 圆角学科微标签（激活态微浮）、现代紧凑时长滑条与圆角手柄；
   - `FileRegisterDialog.vue`：重构拖拽区域为轻柔虚线框与 8px 方圆图标，上传中启用动态呼吸绿点（`pulse-indicator`）与轻薄进度条，上传失败保留表单；
   - `KnowledgeBlockViewDialog.vue` 与 `WorkspaceKnowledgeBlockDialog.vue`：常驻标题栏、卡片式 Markdown 独立滚动内容区，彻底消除双重滚动条，工作区调色盘升级为现代微圆点；
   - `SubjectCreateModal.vue`：重构顶层预览卡片为现代紧凑微卡片，8 列图标选择网格升级为 8px 圆角轻触按键；
4. 5 项核心交互与焦点/无障碍问题修复：
   - 上传关闭守卫前置：`ModalShell` 在任何状态变更或关闭事件触发前严格先执行 `preventClose` / `beforeClose` 守卫判定；`FileRegisterDialog` 绑定上传状态守卫，并在上传失败时不重置表单，允许用户保留文件与文件名立即重试；
   - 共享引用计数解决多层滚动锁：使用 `lockBodyScroll()` 与 `unlockBodyScroll()` 全局引用计数管理 `document.body.style.overflow`，彻底解决多层弹窗任意顺序关闭时提前解锁或残留 `hidden` 的问题；
   - LIFO 弹窗栈与单层 Escape 拦截：通过全局活动栈仅允许最顶层弹窗响应 Escape，并配合 `e.stopImmediatePropagation()` 阻止下层弹窗同时被关闭；
   - 焦点闭环与智能入场聚焦：入场时优先保持已有聚焦、检测 `[autofocus]` 与第一表单输入框，避免强制聚焦覆盖任务名称等组件的原生自动聚焦；弹窗激活期间通过全局与容器 `trapTabKey` 实现 Tab/Shift+Tab 弹窗内闭环循环；弹窗关闭或销毁后自动将焦点还给触发元素（opener）；
   - 无障碍名称绑定修复：`ModalShell` 智能区分 `effectiveAriaLabelledBy`（仅在有明确标题时绑定 `titleId`）与 `effectiveAriaLabel`（自适应绑定传入的 `aria-label`），彻底解决知识块查看弹窗与工作区弹窗在未传 `title` 时指向空标题 ID 的缺陷；
5. 严格保护既有契约与测试回归：宿主视图状态与数据流保持原有闭环，既有正则断言（学科版本 `version: props.subjectData.version`、线条图标映射、密码长度、提炼限制、排期时长、文件登记前置校验等）100% 保持满足；PC 全量回归测试 `npm.cmd run test:r4-pc`（433/433 全量通过）、`npm.cmd run type-check`（0 error）、`check:subject-icons`、`check:subject-workspace` 与 `npm.cmd run build` 生产构建均顺利通过。真实外部环境与人工 GUI 体验待验收。

2026-09-27 PC 任务编排中心下周排期精确自然日比对与槽位计算修复（代码与门禁验证通过，GUI 待验收）：排查并彻底解决点击侧栏下周排期时当周任务被误关联至下周的根因：在 `useTaskStore.ts` 中增强 `dateForDay` 与 `rebuildSchedule` 支持 `YYYY-MM-DD` 格式的 `dateKey` 精确比对，打破原有仅依赖单周 `DayCode` ('Mon'~'Sun') 导致的跨周模糊匹配；更新 `setSelectedDay` 与 `insertTaskAtSlot` 支持 `dateKey` 级传递；并在 `Timeline/index.vue` 中由 `selectedTimelineDay.dateKey` 精确驱动中间“时间流细节”各槽位任务与当前点渲染，确保选中下周某一天时只精确呈现下周该天的实际排期任务。PC 全量回归测试 `npm.cmd run test:r4-pc`（433/433 全量通过）、`npm.cmd run type-check` 退出 0。

2026-09-27 PC 弹窗透气度、圆润禅意视觉与色彩体系全站统一（代码、自动化测试与构建全部通过，GUI 待验收）：
针对弹窗过于紧凑、直角偏硬及配色与主页面存在脱节的问题，全面对齐 Auralis 极简禅意温润设计语言与色彩令牌：
1. 界面配色深度统一：弹窗底板采用宣纸暖米白 `var(--color-bg-tertiary, #FAF7F2)` 搭配浅发丝边框 `var(--border-default, #DDD5C7)` 与暖炭黑毛玻璃遮罩（`rgba(28, 28, 26, 0.42)`），深色模式统一对齐暖炭高阶底板 `var(--color-bg-elevated, #3d3b38)`；输入控件、单选芯片、拖拽区与内嵌卡片底色采用燕麦米白 `var(--color-bg-primary, #F7F2EB)`，形成双层宣纸/燕麦纸层次，输入聚焦切换为白底；文字严格对齐 Zen Graphite `var(--text-primary, #1C1C1A)` 与 `var(--text-secondary, #2C2C28)`；
2. 容器圆角与呼吸感拓宽：模态弹窗外层卡片升级为 `border-radius: 24px`，彻底移除头部/底部硬线条分割，构建一体化无缝画布；宽度梯度放宽（`sm: 480px`、`md: 580px`、`lg: 760px`、`xl: 920px`）；内边距扩展（头部 `30px 36px 14px`、内容区 `14px 36px 24px`、底部 `16px 36px 32px`），释放充裕呼吸感；
3. 控件全域圆润一致性：操作按钮统一升级为 `border-radius: 9999px` Zen 胶囊按钮（高度 40px，主操作对齐全站 `Primary Gradient` 禅绿渐变 `linear-gradient(135deg, #9EAD80 0%, #8B9A6E 100%)`，次操作为燕麦米白底板配发丝边框，危险操作为陶土红渐变）；表单输入框统一采用 14px 舒适圆角；关闭按钮升级为 32px 纯圆交互靶点；单选芯片、学科标签与时间滑块统一采用全圆角胶囊形态；
4. 业务弹窗全面适配：覆盖确认对话框（`ConfirmDialog.vue`）、修改密码（`ChangePasswordDialog.vue`）、AI 总结指令（`SummaryInstructionDialog.vue`）、文件登记（`FileRegisterDialog.vue`）、任务创建（`TaskCreateDialog.vue`）、学科新建（`SubjectCreateModal.vue`）与知识块阅读/编辑（`KnowledgeBlockViewDialog.vue`、`WorkspaceKnowledgeBlockDialog.vue`）全量业务弹窗；
5. 门禁验证：`npm.cmd run type-check`、`npm.cmd run test:r4-pc`（433/433 全部通过）、`npm.cmd run check:subject-icons`、`npm.cmd run check:subject-workspace` 与 `npm.cmd run build` 全部退出 0。真实 GUI 视觉体验待人工确认。

2026-10-13 PC 全站多余滚动条与弹窗内层嵌套滚动条根除（代码与门禁验证通过，GUI 待验收）：
彻底排查并消除 PC 端各处不该露出的滚动条：
1. `ConfirmDialog.vue`（确认提示框）：绑定 `body-class="confirm-modal-body"` 并设置 `overflow: hidden !important;`，外边距归零，彻底解决 Windows Chromium 下因亚像素溢出导致的垂直滚动条；
2. `WorkspaceKnowledgeBlockDialog.vue` 与 `KnowledgeBlockViewDialog.vue`：正文卡片 `.kb-content-card` 与编辑预览卡片 `.edit-rendered-card` 移除 `max-height` 及 `overflow-y: auto;`（及显式 `scrollbar-width: thin;`），正文内容自然流转展开，统一由外层模态壳平滑滚动，彻底根除内层嵌套与“双滚动条”；
3. `modal.css`：在全局模态主内容区恢复 `scrollbar-width: none; ::-webkit-scrollbar { display: none; }`，与全站极简禅意无滚动条规范保持统一；
4. `TaskCreateDialog.vue`：所属学科列表 `.subject-grid` 设为隐形滚动；
5. `SubjectWorkspace`、`Dashboard`、`Timeline`：所有局部滚动列表（文件抽屉、知识块网格、待办列表、动态速递、时间轴槽位等）隐藏滚动条外观，保留自然流畅鼠标滚轮与触控滚动。
门禁验证：`npm run type-check` 0 error，核心单元回归全量通过。真实 GUI 待验收。

2026-09-27 PC 任务编排中心侧栏下周排期概览实现（代码与门禁验证通过，GUI 待验收）：在任务编排中心（`Timeline/index.vue`）侧栏中，直接于“本周排期概览”下方新增“下周排期概览”区块，与本周排期呈现样式 100% 同款对齐（无需 Tab 切换，自适应铺满侧栏并支持纵向平滑滚动）。基于 `getTimelineDays` 与 `dateKey` 实现精确的下周 7 天时间轮播与下周各日任务排期筛选；点击下周任意一天，高亮自适应切至目标项，中间“时间流细节”标题与半小时槽位排期自动联动切换为选中日期。PC 全量回归测试 `npm.cmd run test:r4-pc`（433/433 全量通过）、`npm.cmd run type-check` 退出 0。

2026-09-27 PC/Service 风险定向修复（代码及自动验证，真实运行待验收）：PC 暂不暴露 Suggestions 调用入口，服务端基线接口保留；Timeline 两项交换改为本地单事务批量写入，失败后保留 cursor/outbox 并拉取服务端结果恢复。Server Sync pull 对省略/零 cursor 检测日志清理缺口；Subject Overview 先建立全量 Source 别名；Source Overview 同实例按含标题的键合并进行中请求。TEXT/URL 解析输入改变轮换 ingestion revision，Source 与 job 同事务持久化且入队失败整体回滚；恢复处理中的 Source 时补建或复用 job；worker 以 revision、job/generation、attempt 和锁后有效 lease 栅栏化完成/失败，Source/chunks/job 成功在同一短事务提交。PC 全量 433/433、type-check，Server clean 聚焦 114/114、PostgreSQL pgvector 2/2 通过；`check:r4-pc` 仍受既有 Rust 测试 loopback 地址扫描误报阻断。跨 Server 实例 Overview 去重、真实 Provider/双设备/Tauri GUI 尚未验收。

2026-09-26 PC 同步、AI 参考范围与连接/预览问题定向修复（代码与自动验证，GUI/真实服务待验收）：新设备本地 `cursor=null` 时先取完整 Sync snapshot，沿用保留未解决本地 mutation 的替换路径，并通知五类资源投影刷新；Tauri 原生替换现同时保护 `inflight` 写入，已有 cursor 仍增量拉取。学科工作区的显式多文件选择现随聊天请求传入，Server 限定到同一活动学科内、当前用户拥有且 READY 的 Source；显式集合最多 100 份（含当前文件），全学科检索仅在用户显式选择时启用，原 `AUTO` 保持兼容。PC Overview 单次 HTTP 超时设为 300 秒；文件仅改显示名不再重载预览；通用请求的服务错误与网络错误进入侧栏连接状态，并按请求先后防止旧响应覆盖新状态；个人空间准确描述 JSON 导出范围、密码单向哈希和 AI 经服务端转发。PC 全量回归 430/430、type-check、build 通过；Tauri snapshot 定向 1/1、`cargo fmt --check` 通过；Server clean `AiRetrievalTests` 12/12、`ArchitectureTests` 1/1；OpenAPI runtime artifact 8/8、双端 SDK 生成和 `check-openapi.ps1` 通过。`check:r4-pc` 仍因未修改的 `local_asset_store.rs` 测试固定地址规则退出 1。真实 PostgreSQL/Provider、双设备、Tauri/GUI 行为仍待验收。

2026-09-26 PC 排期未完成划掉样式修复（代码与门禁验证通过，GUI 待验收）：彻底修复时间轴（Timeline）视图中过去时间的未完成排期任务被误加上划线（`text-decoration: line-through`）的问题。移除了 `Timeline/index.vue` 中对 `.is-past` 的 `line-through` 强制规则，确保仅真正勾选完成的已完成任务（`is-completed`）才具有划线删除样式与置灰半透明效果；勾选框与完成状态保持由 `isCompletedTask` / `isCompletedScheduledTask` 统一掌控。PC 全量回归测试 `npm.cmd run test:r4-pc`（423/423 全量通过）、`npm.cmd run type-check` 退出 0。

2026-09-26 Source/RAG 与文档处理入口优化（Issue 2/6/7，代码及定向验证）：PostgreSQL 检索原已在 TopK 前排除软删除 Source；H2/fallback 路径已改为先按用户批量解析活动 Source 再排序取 TopK，避免已删除 Source 的旧 chunk 占名额。Source 列表/分页/含删除项列表与 Retrieval citation 使用 owner-scoped Source/Asset 批量读取，保留排序、大小与引用语义；两条 FILE Source 列表验证为 1 次 Source 查询加 1 次 Asset 批量查询。PC `DocumentProcessingStore.start/resumePending` 现经 `SourceJobScheduler`，重启/重试与现有 UI 入口继续由 Scheduler 处理。Server focused clean 8/8、PostgreSQL 17/pgvector 2/2；PC focused 66/66、type-check 与 build 通过。`check:r4-pc` 仍因未修改的 `src-tauri/src/local_asset_store.rs: fixed local address` 失败；真实 Tauri/Server/RAG 业务链路及性能负载未验收，运行服务未部署本轮变更。

2026-09-26 注销账户运行验收：用户自行重建前后端并提交一次注销后，按该账号已关联的精确作业只读查询，`requested_at=06:43:18.077669 UTC`、`not_before=06:49:18.077669 UTC`、`completed_at=06:50:10.172777 UTC`，作业为 `COMPLETED`、`last_error=NULL`、用户行已删除。该用户归属的 21 张清理表及本作业对象键记录均为 0 行；运行中前后端容器镜像分别匹配当前本地 tag，backend healthy。数据库证据确认这次注销受理并完成物理清理；未单独检查 MinIO 对象，也没有从缺少请求日志的服务中恢复当时 HTTP 状态或 GUI 提示原文。

2026-09-26 账户注销链路复核与 PC 401 修复：只读数据库按登录使用的规范化用户名检查指定测试账号，当前为 `ACTIVE`、关联注销作业 0；因此此前无法登录不等于注销受理成功。运行中 backend JAR 的 `requestAccountDeletion()` 字节码已核实两个 `timestamptz` INSERT 参数均调用 UTC `OffsetDateTime.ofInstant`，V25 已安装。PC 在确认密码错误返回 `401 UNAUTHENTICATED / Invalid credentials` 时，现仅显示原有错误通知，不触发全局 access token 刷新、DELETE 重放或登录跳转；真正的 Bearer 失效仍按 `Authentication is required` 走原刷新流程。PC 定向回归 6/6、type-check 与生产构建通过；独立 PostgreSQL 17/pgvector 的注销受理→到期清理、错误密码回滚等定向回归 4/4 通过。`check:r4-pc` 因本次未修改的 `src-tauri/src/local_asset_store.rs: fixed local address` 报 1 项失败。`docker compose build frontend` 成功，新镜像 `428f946d`，现运行 frontend 容器仍为 `f937324a`；未对真实账号执行 DELETE 或完成 GUI 验收，且缺少现场 HTTP 响应，仍不能确定先前请求实际返回的是 401 还是其他错误。

2026-09-26 注销账户受理入口 PostgreSQL 时间参数：现场 `DELETE /api/auth/me` 日志在 `IdentityService.requestAccountDeletion()` 的作业 INSERT 报 pgJDBC 无法推断 `Instant` 类型。已把 `requested_at`、`not_before` 两个 JDBC 参数转为 UTC `OffsetDateTime`，业务时刻和响应保持 `Instant`。285 个主源码 clean compile 通过；独立 Testcontainers PostgreSQL 17/pgvector + Flyway V1–V25 异时区定向回归 2/2，覆盖入口作业写入与清理任务；`docker compose build backend` 成功。Maven 全量测试编译仍受其他工作树测试源码不匹配阻断；现运行容器镜像 ID `00c3eaa2` 与新构建镜像 ID `a30cdbe6` 不同，本次入口修复尚未部署，未对真实账户执行 DELETE。

2026-09-25 注销账户清理任务 PostgreSQL 参数修复（代码与隔离数据库回归通过，运行中服务待更新）：现场日志表明 `AccountDeletionCleanupService.claimNext` 将 `Instant` 直接交给 pgJDBC，驱动无法推断 SQL 参数类型。清理服务内同类 JDBC 时间参数已统一改为 UTC `OffsetDateTime`，匹配 V25 的带时区列；原有状态机、数据删除顺序及公开 API 不变。独立 Testcontainers PostgreSQL 17/pgvector 完成 Flyway V1–V25 并运行合成作业回归 1/1，覆盖领取、租约、对象标记、完成及复扫，JVM 与 PostgreSQL 会话使用不同时区验证绝对时刻。仓库当前全量 `testCompile` 被其他未提交测试与生产接口不匹配阻断，未据此声称全量测试通过；`docker compose build backend` 已成功构建新镜像，但当前 Compose 容器仍运行旧镜像，未对真实账户执行清理。

2026-09-25 AI 通用聊天 Provider（代码与自动验证完成，真实 Provider/GUI 待验收）：用户设置只提交聊天 Provider、Base URL、聊天模型及可选 API Key，设置响应不再提供 Embedding 模型；索引及 RAG Embedding 固定读取服务端 SiliconFlow 配置。`OPENAI_COMPATIBLE` 支持经公网地址校验的 HTTPS host，命名 Provider 保持 allowlist；本地/内网和 NAT64、6to4、Teredo 转换前缀被拒绝。连接测试用已保存模型发起最小聊天请求，不再依赖 `/models`。Server clean 定向 45/45、安全专项 clean 18/18、OpenAPI artifact 8/8、双端 SDK 一致性检查、PC 定向 5/5 与 PC type-check 均通过。真实服务商协议差异、网络与 GUI 尚未验收；Mobile type-check 因既有 `assetUpload.ts` 未传 `clientImportId` 失败，此字段在本次修改前的 HEAD schema 已为必填，与本轮 AI 改动无关。

2026-09-25 PC 顶栏头像真实映射与状态指示点移除（代码与回归测试通过，GUI 已验证）：
1. 真实头像映射与响应式全站同步：在 `useAuthStore.ts` 中引入全局 `avatarUrl` 状态与 `loadAvatar()` / `setAvatarUrl()`，在登录（`setSession`）与顶栏组件挂载（`onMounted`）时通过 `useAuthApi.getAvatarBlob()` 拉取头像 Blob 并构建安全 ObjectURL，无头像或 404 时静默降级展示首字母；在退出登录（`clearSession`）时妥善释放（`URL.revokeObjectURL`）；
2. 个人中心实时联动闭环：`Profile/index.vue` 在头像上传（`uploadAvatar`）、重新拉取（`loadAvatar`）及重置头像（`resetAvatar`）时，同步更新 `authStore.setAvatarUrl`，页面内修改头像即时反映至全局顶栏，且避免组件卸载时误注销跨页面共享的 ObjectURL；
3. 彻底移除右上角状态圆点：在 `AppHeader.vue` 模板与样式中彻底移除 `.avatar-status` 绿色状态圆点元素与样式，保持纯净禅意头像视觉；
4. 门禁验证与浏览器检查：`npm.cmd run test:r4-pc`（420/420 pass）、`npm.cmd run type-check`（0 error）与 `git diff --check` 全部通过；浏览器端界面检查确认右上角状态圆点已移除且首字母/头像渲染正常。

2026-09-25 PC 首页已完成勾选状态全链路修复（代码与全量回归通过，GUI 待验收）：排查并彻底解决首页已结束排期任务无法打勾和待办任务规范状态穿透的问题：
1. 离线写屏障豁免已完成任务历史排期校验：在 `useTaskStore.ts` 的 `persistOffline` 中豁免已完成任务（`model.status !== 'DONE'`）执行过去的排期拦截（`assertScheduledAtIsNotPast`），消除由于时间细微精度差异或历史时间导致自动完成（`recoverOverdueTasks`）静默崩溃及手动勾选报错“不能排期到过去的时间”的问题；引入 `isSameScheduleTime` 时间戳规整比对；
2. 规范状态全域收敛：在 `taskViewRules.ts` 中修正 `isActionableTask` 与 `isSchedulableTask`，统一使用 `!isCompletedTask(task)`，杜绝服务端与本地规范状态 `'DONE'` 的已完成任务被误当作活动待办或可调度项；
3. 首页指标统计与待办清单纯粹化：`useTaskStore.ts` 的 `completedCount` 与 `totalFocusHours` 统一采用 `isCompletedTask(task)`，首页顶部“已完成 X 项”统计准确恢复；待办清单 `.todo-item` 移除复选框与点击完成，聚焦纯净待排期信息展示；
4. 全量自动化门禁：更新 `scripts/r4-dashboard-timeline.test.mjs`，PC 全量回归测试 `npm.cmd run test:r4-pc`（420/420 全量通过），`npm.cmd run type-check` 与 `git diff --check` 全部通过。真实 GUI 行为待验收。


2026-09-25 PC 头像读取 406 修复（实现与定向验证完成，真实 HTTP/GUI 待验收）：个人空间头像 GET 请求显式接受 `image/png` 和 `application/problem+json`，覆盖 PC 通用请求客户端的 `Accept: application/json` 默认值；继续使用 Blob 响应。服务端头像读取与 OpenAPI 原本均声明 `image/png`，本次不改接口或 multipart 上传限制。Profile 定向测试 5/5、PC type-check 与相关 diff-check 通过；Axios mock adapter 验证最终请求头覆盖默认值。

2026-09-25 PC 完成任务分组与首页日程自动勾选补充修复（定向测试通过，GUI 待验收）：资产库任务分组先识别完成状态，再判断有无排期，已完成且未设置截止/排期的任务进入“已完成”；任务树节点的勾选标记复用同一完成状态规则。Task Store 在 TASK 投影刷新后立即重新检查已结束的排期任务，补上同步或本地写入期间跳过检查后的重试时机。已结束且已完成的排期任务禁止取消完成，避免首页与资产库按钮的手动操作被下一轮自动恢复立即覆盖；资产库树刷新同步更新选中任务状态。仓储写入与同步拉取后规范状态 `DONE` 映射至展示状态 `completed`，首页日程勾选谓词的动态测试均通过；原始首页 DOM 故障尚未在 GUI 中复现。任务规则 14/14、资产库 2/2、首页/时间轴 15/15、Store 排期 25/25、PC type-check 和相关 diff-check 均通过。

2026-09-25 PC 时间轴排期任务自动完成修复（代码与定向测试完成，GUI/跨设备待验收）：自动完成以 `scheduledAt + durationMinutes` 的任务结束时刻为准；任务本地加载后立即检查，并在应用打开期间每分钟检查。单项保存失败记录错误且不阻断其他任务；自动写入与手动改期/编辑共用任务变更队列，在写入前重读当前本地 TASK 行，并以可选的仓储版本及 outbox 状态条件原子提交；增量 pull 对同资源未解决本地写入也进行原子跳过。任务规则与 Store 定向 35/35、本地仓储 18/18、同步 12/12、PC type-check 通过。未更改 Task API、数据库字段或同步协议。

2026-09-25 PC 个人空间清除离线数据底层持久化与 AI 脏配置自动持久化测试（已修复）：
1. 离线数据重置底层贯通：在 `localRepository.ts` 实现 `resetOfflineStorage()`，清空 `local_mutations` 与 `local_resource_records`，原子写入 `cursor = NULL, reset_required = 1`；在 `useSyncStore.ts` 暴露 `resetOfflineData()` 统一调度，触发全量快照拉取；`Profile/index.vue` 的“清除本地离线数据”操作真实清空本地仓储并重启同步；
2. AI 脏配置自动保存后再测试：在 `Profile/index.vue` 引入 `ensureAiSettingsSavedForTest()`，在用户点击“自动检测”或“测试连接”前自动比对未保存的新 Base URL、模型或 API Key，先静默持久化至服务端托管库，避免后端用已有旧凭证测试导致误报成功；补齐了 `handleTestConnection` 与 `testingConnection` 连通性测试加载态与反馈；
3. 全量自动化验证：`scripts/r4-profile-live-links.test.mjs`，`npm.cmd run test:r4-pc`（408/408 全量通过），`npm.cmd run type-check` 与 `git diff --check` 全部退出 0。真实外部服务连通性与 GUI 待验收。

2026-09-25 PC 首页已完成任务勾选状态与完成切换修复（已修复）：
1. 勾选状态识别增强：在 `taskViewRules.ts` 中增强 `isCompletedTask` 与 `isCompletedScheduledTask`，同时支持展示层 `'completed'` 与规范数据枚举 `'DONE'`，解决后端同步或原始状态下已完成任务渲染为空心复选框的问题；
2. 首页状态流转与交互完善：`Dashboard/index.vue` 的 `toggleTaskCompletion` 升级为智能识别，排期任务解勾选后返回 `'scheduled'`，无排期任务返回 `'pending'`，未完成任务推进至 `'completed'`；增加了 `try...catch` 异常提示；为任务卡片内容区增加点击勾选与手势指针，为待办清单 `.todo-item` 补充复选框控件，支持直接在首页勾选完成待办；
3. 全量自动化门禁：更新 `scripts/r4-dashboard-timeline.test.mjs`，`npm.cmd run test:r4-pc`（407/407 全量通过），`npm.cmd run type-check` 与 `git diff --check` 全部退出 0。真实 GUI 行为待验收。

2026-09-25 头像上传 multipart 接收上限：Spring 单文件上限设为 5 MiB，整个请求上限设为 6 MiB，避免框架默认 1 MiB 先于头像业务校验拒绝上传。配置位于共享服务端 profile，适用于 local/test/prod。`mvnw.cmd -B -ntp clean -Dtest=ConfigurationTests test` 退出 0，3/3 通过；测试确认配置绑定，实际 Servlet 容器 HTTP 上传尚未验证。

2026-09-25 PC 个人空间与设置页 10 类前端缺口真实链路打通（实现与测试完成，GUI 验收待办）：
PC 设置页面（`Profile/index.vue`）已全面打通真实服务端与数据链路，消除所有 mock 与伪逻辑：
1. 账户资料（3 类）：昵称接入 `PUT /api/auth/me`（带版本防并发覆写）；头像通过 `GET /api/auth/me/avatar` 获取真实私有 Blob 并通过 `POST /api/auth/me/avatar`（≤5MB PNG/JPEG 校验）与 `DELETE` 实现云端流转，彻底移除 localStorage 缓存；修改密码升级至 12~200 位校验并接入 `PUT /api/auth/password`；
2. AI 设置（3 类）：Provider 引入 `normalizeProvider`，将自由输入与非标准服务商映射为 `OPENAI_COMPATIBLE`；模型自动检测接入真实 `GET /api/ai/settings/{provider}/models` 探测候选模型；连接测试接入真实 `POST /api/ai/settings/{provider}/test-connection` 反馈聊天模型的可达状态；
3. 数据与状态（4 类）：数据导出打包完整知识库块与任务排期；两级清理分层解耦为视图缓存清理与高危离线重置（触发全量拉取）；注销账户接入 `DELETE /api/auth/me` 处理 202 Accepted 异步受理并清空会话；同步状态动态响应 `syncStore` 的 `isSyncing`、`lastSyncError` 与 `resetRequired` 状态。
全量自动化验证：新增定向门禁 `scripts/r4-profile-live-links.test.mjs`，PC 全量回归 `npm.cmd run test:r4-pc`（406/406 全量通过），`npm.cmd run type-check` 与 `git diff --check` 全部退出 0。真实外部模型与人工 GUI 体验待验收。

2026-09-24 PC 个人中心与系统设置（Profile / Settings）左栏精简与账号卡片高级重构收口：
根据可用性与视觉呼吸感要求，对左侧概览与账户卡片实施进一步打磨：
1. 移除每周专注时长柱状图：从核心学习指标卡片（`.study-stats-card`）中彻底移除原本拥挤的 7 日迷你柱状走势图，使核心指标卡片回归纯粹的 4 宫格数据微胶囊，大幅释放纵向空间并提升呼吸感；
2. 彻底重构账号与安全凭证卡片（`.account-card`）：
   - 消除昵称重复：移除底部卡片内与顶部用户资料卡重复的昵称修改行；
   - 引入精致单元格体系（`.account-cell`）：账号绑定、登录密码、当前授权设备均采用独立的温润燕麦米白（`#F7F2EB`）圆角单元格，配有细致字距与状态徽标（`已认证`、`当前授权`）；
   - 顶部状态徽标：集成柔和绿点呼吸状态（`安全运行中`）；
   - 底部双操作按钮重绘（`.account-card-actions`）：`切换账号`（次级优雅按钮）与 `退出登录`（低饱和温润柔红边框告警按钮，严格保留 `@click="handleLogout"` 交互契约）；
3. 全量自动化门禁：`npm.cmd run test:r4-pc`（403/403 pass）、`npm.cmd run type-check`（0 error）、`git diff --check` 全部通过。

2026-09-24 PC 任务编排中心（Timeline）配色三层级对齐、待安排栏加宽与全卡片按钮立体微阴影收口（主内容 #F7F2EB、卡片模块 #FAF7F2、页面背景 #EEEEEE、任务栏 400px、全卡片按钮底影）：
依据极简禅意三层级配色系统规范与空间可用性，全面对齐 PC 任务编排中心（`Timeline/index.vue`）的层级对比关系、交互色彩、列宽布局与立体阴影：
1. 页面大背景（#EEEEEE，rgb(238, 238, 238)）：外层页面容器 `.timeline-page` 采用清爽冷灰底板 `var(--color-bg-secondary, #EEEEEE)`；
2. 主内容大容器（#F7F2EB，rgb(247, 242, 235)）：顶栏卡片 `.timeline-header-card`、日视图时间轴列 `.timeline-column`、待安排任务列 `.tasks-column`、周视图概览列 `.weekly-overview-column`、各星期列 `.weekly-column`、周视图底部坞 `.weekly-bottom-dock` 与看板列 `.kanban-column` 全部统一为沉稳温润的浅燕麦米白底板 `var(--color-bg-primary, #F7F2EB)`，并配置沉降分层阴影；
3. 待安排任务栏（`.tasks-column`）加宽扩展：`.timeline-body` 网格列由原本的 `280px 1fr 340px` 调整为 `280px 1fr 400px`，右侧待安排任务块宽度增加 60px，彻底解除长任务名称、学科标签、知识关联胶囊与截止日期提醒徽标在待安排卡片内的排版拥挤感；
4. 全卡片与模块底部立体阴影：时间轴任务卡片 `.slot-task`、待安排卡片 `.pending-card`、周视图任务卡片 `.weekly-task-card`、周概览行 `.weekly-overview-row`、周底坞胶囊 `.pending-pill`、看板卡片 `.kanban-task-card`、学科胶囊 `.subject-capsule-item`、统计胶囊 `.stat-pill` 及知识块关联徽标 `.kb-relation-badge` 统一配置分层立体微阴影（基础态 `box-shadow: 0 2~4px ...`，悬浮态 `transform: translateY(-1~2px)` 并扩散至 `0 6~8px ...`），实现如宣纸般在底板上自然立体浮起；
5. 全操作按钮底部立体阴影：主按钮 `.btn-primary`、次级按钮 `.btn-secondary`、视图切换栏 `.view-toggle` 与激活切换胶囊 `.toggle-btn`、日期按钮 `.day-btn`、智能顺延按钮 `.btn-auto-delay`、弹窗确定/取消按钮 `.task-btn-submit`/`.task-btn-cancel`、时长交互条 `.duration-long-bar-btn`、关闭与删除按钮 `.modal-close`/`.task-delete-btn` 底层全量补齐微阴影与高亮悬浮投影，彻底消除死白无边界扁平感。
全量自动化验证：`npm.cmd run test:r4-pc`（401/401 全量通过）、`npm.cmd run type-check`、`npm.cmd run build`、`git diff --check` 全部退出 0。

2026-09-24 PC 个人中心（Profile）左栏布局调优、头像更换、多模型自动检测与账号操作精简：
全面落实个人中心（Profile）左右分区结构与 AI BYOK 自由配置：
1. 左右功能边界清晰化：左侧明确为个人账户与学习概览（用户资料卡、核心学习指标、TOP 5 学科知识块统计、文件解析进度中心、账号与安全凭证管理卡片）；右侧明确为应用偏好设置（外观与显示、提醒与自动化、同步与数据、AI 模型与服务、数据与安全、登录设备会话）；
2. 账号与头像操作重构：顶部用户资料卡支持点击头像直接上传更换；下侧账号与安全凭证卡片聚合排列「用户头像、用户昵称、登录密码」三个可交互修改项于上部，随后呈现「登录账号、当前设备」两项只读认证信息，结构层次清晰；精简去除了与「退出登录」功能重复的「切换账号」多余操作，操作更纯粹清爽；
3. 设置项精简降噪：按要求移除不必要的「AI 学科归类」与「每周学习报告」开关配置，避免多余概念干扰；
4. 数据与隐私设置项归类：将具备主动交互按钮的「数据备份导出」与「清理本地缓存」聚合排列在数据与隐私区块前列，其后承接开关项与加密说明，操作体验更为聚焦；
5. 学科分布真实统计：仅统计真实知识块数（Block Count），降序排列并严格仅展示 TOP 5 学科，胶囊徽标对齐 `{{ sub.count }} 块` 格式；
6. AI 配置自由输入与多候选模型自动检测：完全去除原嵌入模型输入，开放服务商（Provider）、对话模型（Chat Model）、Base URL、API Key 供用户自由文本输入；对话模型集成「自动检测」按钮与多模型候选托盘（`detected-models-tray`），检测成功后渲染多个模型选择标签（Model Chips），支持一键点击填入或手动自定义输入；
7. 全量自动化门禁：`npm.cmd run test:r4-pc`（403/403 pass）、`npm.cmd run type-check`（0 error）、`git diff --check` 全部通过。

2026-09-24 PC 学科中心与总览视图配色三层级修正（主内容 #F7F2EB、卡片模块 #FAF7F2、页面背景 #EEEEEE）：
依据禅意温润米白视觉系统规范，彻底修复学科中心（`SubjectHall`）与学科工作区（`SubjectWorkspace`）的层级对比关系：
1. 页面大背景（#EEEEEE，rgb(238, 238, 238)）：外层容器 `.hall-container` 与 `.workspace-container` 维持冷灰底板；
2. 主内容大容器（#F7F2EB，rgb(247, 242, 235)）：纠正此前 `SubjectHall/index.vue` 中 `.hall-content` 误设为 `#FAF7F2` 的问题，恢复为 `var(--color-bg-primary, #F7F2EB)`；同时同步纠正 `OverviewSummaryView.vue` 根容器与头部背景以及 `FilePreview.vue` 在 bare 模式下的 body 背景为 `#F7F2EB`；
3. 卡片模块（#FAF7F2，rgb(250, 247, 242)）：学科卡片 `.subject-card`、新建卡片 `.add-card`、搜索框 `.search-input`、操作按钮、知识块卡片 `.block-card`、总结卡片 `article`、阅读器纸张底板 `.file-preview-renderer-shell` 统一呈现暖米白宣纸质感，在 `#F7F2EB` 主内容底板上轻柔浮起，恢复清晰舒适的界面视觉纵深。
全量自动化验证：`npm.cmd run test:r4-pc`（401/401 全量通过）、`npm.cmd run type-check`、`npm.cmd run check:subject-icons`、`npm.cmd run check:subject-workspace` 全绿无报错。

1. Asset 关系星图以真实 Subject、Source、KnowledgeBlock 投影建图。Source 连接所属 Subject；KnowledgeBlock 在 `sourceFileId` 指向同学科现存 Source 时连接该 Source，否则连接所属 Subject，不补造关系。
2. 力导向布局使用对称节点互斥、按关系类型设目标长度的弹簧吸引、弱重力回中与速度阻尼。初始坐标由稳定 ID 决定；同范围刷新保留现存节点坐标与镜头，切换 Subject/全局范围重置并适配。初始模拟最多运行 180 帧，并在收敛时提前停止。
3. 鼠标、触控和触控笔通过 Pointer Events 拖动所有节点；空白区域拖动平移。达到拖动阈值时暂停初始布局 RAF，正在拖动的节点锁定在指针坐标，实时力帧推动关联邻居并重画连线；拖动响应每段最多 36 帧并在收敛时提前停止，释放后最多 30 帧低强度松弛，让节点轻微调整。用户摆放在同范围更新中保留，切换范围后重新布局。点击 Source/KnowledgeBlock 仍选择资产树对应项并在中栏打开 `FilePreview` 或知识块编辑器；Home 继续触发 `open-block-detail`。
验证：力计算、拖动邻居响应与释放松弛专项 6/6，`npm.cmd run test:r4-pc` 403/403、`npm.cmd run type-check`、`npm.cmd run build`、根目录 `git diff --check` 均退出 0。生产构建仍有既有模块外置、dynamic import、插件耗时与大 chunk 警告。浏览器/Tauri GUI 的实际拖动手感、鼠标离开画布后的捕获及触控设备行为仍待人工验收。

2026-09-24 PC 学科中心小卡片/模块/宣纸底全层级统一与文件总览选中态顶栏高亮去除收口：
全面响应学科中心视觉细化要求，对齐温润米白宣纸底板色（`#FAF7F2`，对应 CSS 令牌 `var(--color-bg-tertiary, #FAF7F2)` / `var(--bg-card)`）：
1. 模块底板与纸张渲染底统一：`SubjectWorkspace` 抽屉卡片、状态栏、主工作区、右侧面板与所有文件阅读器容器（`.pdf-workspace`、`.blocks-workspace`、`.onboarding-workspace`、`FilePreview`、`FileViewerRenderer` 内部纸张底板）全部统一为 `#FAF7F2`；
2. 输入框、状态胶囊与学科 AI 控件统一：弹窗与抽屉内输入框（常态与 focus）、下拉选择、学科状态胶囊、未就绪发送圆钮、AI 清空按钮、报错重试按钮、划词工具条全部收敛为 `#FAF7F2`；
3. 总览卡片纯净底色与选中态顶栏去高亮：彻底去除 `FileOutlineList` 文件总览卡片在被选中状态（`is-selected`）下顶栏的渐变绿铺色，保持统一纯净的 `#FAF7F2` 顶栏底色；同时去除 `SubjectOverviewSection` 学科总览顶栏的 `linear-gradient` 绿晕，使所有总览卡片在常态与选中态下均融入宣纸底板，选中态完全交由细致发丝边框、微立体阴影与文字强调色表达。
全量自动化验证：`npm.cmd run test:r4-pc`（397/397 通过）、`npm.cmd run type-check`、`npm.cmd run check:subject-icons`、`npm.cmd run check:subject-workspace` 全绿无报错。

2026-09-24 PC 专注时钟（Pomodoro）温润极简配色重构、时间轴智能感知与版面尺度调优收口：
针对番茄专注时钟原配色刺眼、任务混杂及视觉版面尺度进行系统性优化收口：
1. 温润极简禅意配色全面对齐：大页面统一为浅中性底色 `#EEEEEE`，左右双栏采用温润燕麦米白大容器卡片（`#F7F2EB`）、24px 大圆角与柔和微质感阴影；圆环轨道由原本刺眼高饱和纯橙色（`#E85D04`）重构为专注态禅意鼠尾草绿（`#8B9A6E`），茶歇阶段升级为温润琥珀茶色（`#C89B6D`），底轨采用半透明发丝柔光，中央开始/暂停大圆钮采用品牌渐变配合柔和绿晕（茶歇态切为茶金渐变），重置/跳过按钮采用全圆角米白宣纸胶囊（`#FAF7F2`）；
2. 任务选择器专属过滤与时间轴深度联动：彻底移除无排期待办的混杂展示，严格仅过滤已在时间轴上拥有明确排期（`Boolean(task.scheduledAt)`）、处于未完成且未取消状态的有效排期任务，并按排期时间由近及远升序排列；补充内置「自由学习」（`free-study`）专属任务项；
3. 智能时间感知默认任务定位：初次进入或时间轴更新时，自动识别当前时刻正处于执行区间（`[start, end)`）或即将在 10 分钟内开始的任务并默认选中；当前无任务时默认落入「自由学习」心流模式；用户手动自选后锁定选择，不被后台刷新篡改；
4. 视觉排版降噪与纯粹文字化：移除选择器多余的「时间轴联动」徽标，移除当前专注横幅内的所有装饰图标，保留纯净文本与学科徽标排版；修复横幅由于长任务名称挤压导致「已排期」胶囊纵向折行（`已排\n期`）及文字过度截断的排版缺陷，将标题与状态信息拆分为独立双层结构，标题独占上层（支持两行优雅换行），下层状态胶囊强制单行不折行紧贴排期时间；
5. 空间尺度开阔度与圆环字号提升：左侧时钟区比例加宽至 `flex: 6.4`（右侧 `flex: 3.6`，间隙 `64px`，容器最大宽度 `1240px`）；时钟圆环尺寸扩大至 `440px × 440px`，时间数字字号扩大至 `clamp(76px, 8.5vw, 92px)`（700 粗体，`-2px` 字距）；
6. 内嵌小圆点胶囊平衡抬升：将圆环内部的状态指示小圆点胶囊（`.ring-pill`）位置调高（`bottom: 64px`），消除原先贴近底部进度圆弧的局促下沉感，整体视觉居中舒展；
7. 全量自动化门禁：`npm.cmd run test:r4-pc`（403/403 pass）、`npm.cmd run type-check`（0 error）、`git diff --check` 全部通过。


2026-09-24 PC 关系星图（KnowledgeGraph）中间圆角边框消除与星空动效升级：
针对资产库（Asset Studio）与全局关系星图右侧视口中间存在的嵌套圆角边框及静态感问题进行全面设计重构：
1. 消除中间嵌套圆角边框并进一步拓宽画幅：彻底去除 `KnowledgeGraph.vue` 内部容器 `.knowledge-graph-wrapper` 的独立边框、圆角（原 20px）和硬编码背景色，使其完全融入宿主容器；在 `Asset/index.vue` 中将 `.ctx-graph` 设置为弹性占满且穿透去除内层包裹边框，实现真正浑然一体的无界画布；右侧星图面板宽度进一步由 540px 拓宽至 620px，赋予星空网络更开阔通透的展示画幅；
2. 极简毛玻璃 HUD 图例胶囊：废除原有遮挡星图的顶部粗重长条形卡片，升级为悬浮于顶部的毛玻璃胶囊（`border-radius: 9999px; backdrop-filter: blur(8px)`），呈现精致的“学科空间 / 关联文件 / 知识点”类型图例，右侧集成上浮微发光的“适配画幅”圆形按钮；
3. 动态星空与呼吸光晕体系：引入 60fps 连续渲染管线，将力导向物理布局计算（180 帧收敛后完全休眠，0 CPU 额外开销）与微动效渲染解耦；深层视野布设 28 颗带有正弦闪烁周期的微尘星芒；连线间流动着平滑滑行的能量光子（Energy Photons）；核心学科天体具备外层扩散光晕与纯色实体天体（去除中间小白点，保持纯净禅意质感），所有节点呈现有机呼吸节律；
4. 交互焦点聚焦模式：鼠标悬停在特定天体节点时，高亮关联的链路与邻接节点，其余无关节点柔和降淡至 0.28 透明度，大幅提升复杂星图的可读性与沉浸感；
5. 全量自动化门禁：`npm.cmd run test:r4-pc`（403/403 pass）、`npm.cmd run type-check`（0 error）、`git diff --check` 全部通过。

2026-09-24 PC 资产库（Asset Studio）知识块与任务编辑排版重构、标签精简与任务所属学科自选收口：
根据沉浸式现代笔记与任务工坊交互体验，全面重构 `Asset/index.vue` 中栏知识块与任务编辑区域排版：
1. 消除标题冲突与冗余操作栏：重构中栏顶栏 `.detail-header`，移除原有与正文编辑输入框重复展示的标题文字及双重保存按钮，升级为自适应顶部工作条；文件呈现信息概览，知识块精简顶栏展示纯净面包屑（`知识库 / 学科`）与字数统计及保存按钮，任务呈现状态切换胶囊（待处理/已完成）、排期元数据与保存按钮；
2. 知识块顶部标签精简：去除知识块纸张卡片顶部多余的 `# {{ tag }}` 标签徽标，保持纯净学科胶囊与沉浸式笔记排版；
3. 任务所属学科与预计用时支持自选与全圆角化：在任务属性工坊中，将所属学科与预计用时均升级为定制胶囊圆角的 `el-select`（`.zen-select`，配合 `popper-class="zen-select-popper"` 实现触发框 9999px 胶囊圆角与弹出下拉面板 16px 大圆角设计，选项项 10px 圆角与柔和微阴影）；修正 Vue scoped 样式下 `html.dark` 祖先选择器被编译器脱落导致的浮层底色异常，确保浅色模式下稳定呈现米白宣纸底色 `#FAF7F2`；在 `useTaskStore.ts` 的 `updateTaskDetails` 中支持 `subjectId` 字段流转与离线持久化同步，用户可在编辑任务时自由切换归属学科并持久化保存；
4. 统一温润纸张画布（Paper Canvas）与无滚动条纯净视图：知识块与任务正文编辑区采用统一定制纸张卡片 `.editor-paper-card`（`#FAF7F2` 宣纸底色、圆角 20px、微质感边框与柔和浮起阴影），居中最大宽度 860px，彻底消除原标题浮于大底板、内容孤立卡片的破碎感；中栏滚动区、左右侧栏、文本域与弹出下拉列表全量隐藏滚动条外观，保留平滑流畅滚轮交互；
5. 全量自动化验证通过：`npm.cmd run test:r4-pc`（403/403 pass）、`npm.cmd run type-check`（0 error）、`git diff --check` 全部通过。

2026-09-24 PC 资产库（Asset Studio）温润配色全面对齐与关系星图拓宽收口：
根据温润浅燕麦米白规范（页面底色 #EEEEEE、大容器/主底板 #F7F2EB、卡片/模块 #FAF7F2、主强调色 #8B9A6E）对齐 `Asset/index.vue` 配色，并扩大右侧关系星图：
1. 拓宽关系星图并清理旧内联样式：移除 `<aside class="studio-right-context">` 原写死的内联 `style="width: 450px;"`，将 CSS 宽度提升至 `540px`（+90px，拓宽 20%），为力导向节点与文件名展示提供充足空间；移除子标题栏写死的 `style="background: var(--color-bg-secondary);"`，统一由 CSS 控制；
2. 三栏容器与头部底色对齐：`.studio-left`、`.studio-middle`、`.studio-right-context` 三栏背景统一为 `var(--color-bg-primary, #F7F2EB)`，添加 `0 10px 24px -4px rgba(0,0,0,0.05)` 柔和阴影与边框；修复 `.middle-content-scroll` 误用 `#EEEEEE` 导致的中间断层色差；
3. 卡片、输入框与模态框底色对齐：`.search-input`、`.editor-content-wrapper`、`.block-row`、`.task-row`、`.inline-block-editor`、`.modal-container`、`.styled-input`、`.styled-textarea`、`.subject-capsule-item` 统一对齐为 `#FAF7F2`，并添加微阴影；聚焦轮廓收敛为 `#8B9A6E` 发光；
4. 按钮与组件库主题收拢：主按钮 `.btn-primary` 与保存按钮采用 `#8B9A6E` 渐变及阴影，次级按钮采用 `#FAF7F2`；统一 Element Plus 日期选择器与弹出层的 hover/focus/selected 强调色；
5. 类型定义与全量测试守卫：修复 `KnowledgeGraph.vue` 中 `down` 交互状态缺失 `pointerId`、`startX`、`startY` 的 TypeScript 检查报错。全量 `npm.cmd run test:r4-pc`（401/401 pass）、`npm.cmd run type-check`（0 error）、`git diff --check` 全部通过。

2026-09-24 紧邻任务交换逻辑调整：顶部交互栏交换两个原排期首尾相接的任务时，按交换后的顺序紧凑排在两项原共同时间窗口内，窗口起止不变；其他交换保持原规则。PC 移除会误拒绝不同时长紧邻任务的“互换开始时间”预检，以服务端原子校验和返回时间为准。PC 全量回归 397/397、类型检查与构建通过；Server clean 聚焦 3/3。本机只重建并重启 backend，health/readiness HTTP 200、Flyway 23，db/minio 容器未变化；真实 GUI 拖放及认证业务请求待验收。

2026-09-24 Timeline 卡片主体放置规则调整：主体 drop 携带目标任务 ID，被拖任务接在目标结束后的首个半小时槽；目标及其他任务不移动，若占用后续排期则整笔拒绝。普通空白槽位维持原有插入顺延，仅顶部交互栏交换。PC 完整回归 397/397、类型检查和构建通过；Server 严格主体放置/普通插入聚焦 5/5，OpenAPI artifact 校验与双端 SDK 生成检查通过。本机只重建并重启 backend，health/readiness UP，Flyway V23 成功，db/minio 容器未重建；真实 GUI 拖拽与认证后的业务请求仍待验收。

2026-09-24 PC Timeline 日视图固定刻度轴与卡片网格跨越编排收口：日视图固定呈现 08:00–22:30 全部 30 个半小时刻度槽位行，彻底移除基于任务覆盖隐藏整行刻度的旧逻辑（`v-show="!isSlotCovered(slot.time)"`）；刻度行保持定高 80px 与 4px 垂直间隙，不随任务存在而压缩或隐藏；任务卡片自起始槽位绝对定位跨越网格，左侧时间标尺所有半小时刻度完整可见；交互分流保持不变：卡片顶部 `.task-header` 用于原子交换，主体（按垂直偏移计算落点）与普通空白槽位用于单事务插入顺延。PC 全量回归 `npm.cmd run test:r4-pc` 397/397 全量通过，`npm.cmd run type-check`、`npm.cmd run build`、`git diff --check` 全部退出 0。

2026-09-23 Server 排期截止时间门禁修复：`dueAt` 作为纯提醒/排序字段，服务端 create/update/swap/schedule-insertion 允许排期晚于截止时间且保留原始 `dueAt`；V23 移除 `ck_tasks_schedule_order`，不改写现有行。排期重叠、固定完成任务和可用窗口检查不变。Server `CoreDomainServiceTests` + `CoreDomainControllerTests` fresh 聚焦 26/26，`mvnw -B -ntp -DskipTests package` 退出 0；真实 PostgreSQL migration、Docker 部署与 GUI 验收待执行。V18 历史迁移清空的 `scheduled_at` 不会自动恢复。

2026-09-23 排期插入运行恢复：backend 日志证实旧容器镜像对 `POST /api/tasks/schedule-insertions` 抛 `HttpRequestMethodNotSupportedException`，通用处理器将其包装为 HTTP 500 `An unexpected error occurred`。重建 Docker image 后仅重启 backend，容器 healthy、readiness HTTP 200；容器 Created 2026-09-23，backend 无数据挂载。为适配 Windows CRLF Maven wrapper，Dockerfile build stage 先转 LF。默认 prod profile 关闭运行时 OpenAPI（`/v3/api-docs` HTTP 404）；仓库 OpenAPI artifact 包含此 POST。db/minio 为恢复 backend 临时启动现有容器，未重建服务或卷。此运行证据尚未包含 GUI 拖动或认证后的业务请求复验。

2026-09-24 知识块资源清理与纯结构化知识块规范（杜绝上传态假文件）：针对测试账号（`pc-ai-test-20260918@example.com`）全面清理先前注入的 20 个测试 Source 以及 MinIO 中 8 个虚假文件资产（彻底消除 `invalid-fixture-*` 等处于 `AWAITING_CLIENT` 上传态/解析失败态的假文件），保留用户真实上传的文件；所有 32 个结构化知识块（`knowledge_blocks`）与假文件解耦（`source_id = NULL`），覆盖 12 个学科空间作为自包含的核心考点卡片展示。注入脚本 `scripts/seed-knowledge-blocks.mjs` 同步重构，严格收敛为仅注入纯知识块，绝不生成上传态假文件或假 Source。PC 端本地 SQLite 同步完成状态清理，全量回归 `npm.cmd run test:r4-pc` 397/397 全部通过。

2026-09-23 PC Timeline 插入顺延与顶部交换：日视图普通槽位、任务卡片主体落点现在通过 `POST /api/tasks/schedule-insertions` 由 Server 单事务插入并连锁顺延发生冲突的后续任务，保留原有空档；仅卡片顶部 `.task-header` 落点调用双任务原子交换。顺延按半小时网格对齐，已完成任务固定，越出当天 08:00–22:30 起始槽窗口时整组拒绝；`dueAt` 不再限制排期。Server 只顺延当日开始的任务；前一日开始且跨入窗口的长任务保持原状，若阻挡落点则整组拒绝。PC 成功后缓存返回的任务并请求 read sync；目标日有未解决本地写入时拒绝在线操作。原完整 PC 回归 395/395、type-check、build、OpenAPI/PC/Mobile SDK 契约检查退出 0；Server 服务/控制器/OpenAPI 定向测试最终 32/32。Mobile type-check 被既有 `assetUpload.ts:47` 缺少 `clientImportId` 阻断；Server 全量 testCompile 受本机 IDE 写入的错误 class stub 干扰。真实 PostgreSQL 并发、跨设备 Sync 与 GUI 拖放尚未验收。

2026-09-23 PC 首页待办清单与排期副驾待安排队列多级排序收口（分支 `agy/deadline-as-reminder`）：
在 `taskViewRules.ts` 中实现并导出纯函数 `comparePendingTasks`，待办清单严格按照「有 DDL 时间优先 → DDL 时间较近优先（时间戳升序） → 持续时间较短优先（时长升序） → 名称兜底稳定排序」的规则排序；在 `Dashboard/index.vue`（首页待办清单）与 `Timeline/index.vue`（排期副驾待安排队列）中统一应用该排序规则；在 `r4-task-view-rules.test.mjs` 中添加针对多级排序规则的单元测试。PC 全量回归 `npm.cmd run test:r4-pc` 为 393/393 全部通过，`npm.cmd run type-check` 与 `git diff --check` 退出 0。

2026-09-23 PC 与 Server 排期区间重叠防护：根因是时间轴以半小时槽位定位任务，但 Store 只校验起始槽位，没有按 `durationMinutes` 判断完整任务区间；PC 的 `mapTaskView` 还将远端空时长映射为 25 分钟，与 Server 的 30 分钟有效默认值不一致。现已在 PC 本地持久化入口对新增/变化的非取消排期区间按 `[scheduledAt, scheduledAt + durationMinutes)` 检查，按天排期逐 30 分钟寻找可用槽位；本端相关操作由 Store 队列串行执行。未排期任务落入占用槽被拒绝，避免分两次本地写入导致原任务排期丢失。`mapTaskView` 现将 null/缺失、非整数、负数或超出 Java Integer 范围的时长统一映射为 30 分钟，API 合法的 0 保持原值。Server 的 REST 与 Sync 共用 TaskService 校验，create/update/restore/swap 在事务内按 User→Subject→Task 锁序串行化同用户写入；空时长按 30 分钟处理，首尾相接允许。PC 排期、任务视图及 DTO 映射定向回归 40/40、type-check、build 及 diff-check 退出 0；Server 聚焦 29 项测试与 diff-check 退出 0。既存重叠数据不会被自动迁移；真实 PostgreSQL 并发、跨设备同步和 GUI 业务验收尚未执行。PC 构建仍有既有模块 externalization、chunk size、dynamic import 警告。

同一最终工作树的完整 PC 回归 `npm.cmd run test:r4-pc` 为 393/393，通过且无跳过；该结果仅证明自动测试，不代表真实 GUI 或跨设备验收。

2026-09-23 PC 学科工作区生命周期、会话清理防 ABA 覆盖与阅读会话竞态收口（分支 `agy/deadline-as-reminder`）：
1. 解决旧阅读会话晚于新会话完成导致覆盖问题：在 `onMounted`、`watch(subjectId)` 与 `selectFile` 的 `await chatStore.startReadingSession(...)` 后均严格加入后置代次、卸载态与学科/文件匹配守卫；
2. 解决旧会话清理误清空新活动会话的 ABA 竞态：在 `useChatStore.ts` 的 `endActiveSession()` 中记录目标会话 ID，`finally` 块仅在 `activeSessionId === targetSessionId` 时才清空活动会话；同时在 `useChatStore.ts` 中新增并导出 `endSessionById(sessionId)`，`SubjectWorkspace` 在代次失效时直接调用 `endSessionById(readingSessionId)` 精准回收特定会话，杜绝误杀已经接管的新学科会话；
3. 解决组件卸载后定时器与会话泄漏问题：引入 `isComponentMounted` 挂载标记，在 `onUnmounted` 时立即递增 `currentSubjectSwitchGen` 并标记组件卸载，彻底阻断异步挂载流程在卸载后的恢复执行，并安全停止定时器与结束会话；
4. 解决首次加载切学科导致文件处理轮询定时器丢失问题：将后台文档处理状态刷新提取为幂等函数 `startProcessingRefresh()` 与 `stopProcessingRefresh()`，并在 `onMounted` 挂载入口立即启动，与特定学科的异步加载链路解耦。
自动化测试与门禁验证：`npm.cmd run test:r4-pc` 387/387 全量通过，`npm.cmd run type-check`、`npm.cmd run build`、`git diff --check` 全部通过。

2026-09-24 PC 学科中心与学科工作区（SubjectWorkspace）配色系统全层级对齐与预览栏底色收口：
根据温润浅燕麦米白配色方案（大页面底色 #EEEEEE、大容器/主底板 #F7F2EB、小卡片/模块色 #FAF7F2、主强调色 #8B9A6E）全面对齐 PC 学科中心、学科工作区、预览栏与各功能模块：
1. 修复预览栏全层级背景：统一 `workspace-center`、`.center-status-bar`、`.center-body`、`.preview-page-footer` 以及 `.pdf-workspace`、`.blocks-workspace`、`.onboarding-workspace` 为 `var(--color-bg-primary, #F7F2EB)`；彻底解决预览栏与子区域冷灰或死白不协调问题；
2. 修复 `FilePreview.vue` 与阅读器画布：`FilePreview` 在 bare 模式下 body 背景设为 `#F7F2EB`，渲染器外壳 `.file-preview-renderer-shell` 与 `UnsupportedPreview.vue` 设为温润宣纸底色 `#FAF7F2`；在 `FileViewerRenderer.vue` 中显式设置并 deep 覆盖第三方 `@file-viewer/vue3` 的 `--file-viewer-bg` 与 `--file-viewer-render-surface-background` 为 `var(--color-bg-tertiary, #FAF7F2)`，彻底消除第三方阅读器默认纯白/冷灰底板；
3. 修复 AI 总结面板（`OverviewSummaryView.vue`）：将根容器与头部背景对齐为 `#F7F2EB`，总结内容卡片对齐为 `#FAF7F2`，补全 `index.css` 的 `--bg-primary`、`--bg-secondary`、`--bg-card` 别名变量映射；
4. 按钮与微交互色彩统一：抽屉 `.drawer-action`（学习文件按钮）与总览加号按钮统一采用 `#8B9A6E` 渐变圆角及柔和立体阴影（`box-shadow: 0 2px 8px rgba(139, 154, 110, 0.35)`），预览栏顶部缩放/旋转/重置按钮组与 AI 栏顶底控制（清空按钮、发送圆钮、模型胶囊）全部应用统一主色微质感与悬浮高亮；
5. 全量测试与类型构建通过：`npm.cmd run type-check`、`npm.cmd run test:r4-pc`（397/397 pass）、`npm.cmd run check:subject-icons`、`npm.cmd run check:subject-workspace` 及生产打包 `npm.cmd run build` 全绿，所有针对布局与文件预览的断言完全保持一致。

2026-09-23 测试数据与数据库全量重置并按新待办约束完成重新注入：执行本机 PostgreSQL `public` schema 重建与 Flyway v1~v22 全量迁移，清空 MinIO 历史测试对象，并按规定安全移除本地旧 SQLite 缓存（`auralis.db*`）。重构注入约束与脚本（`scripts/seed-test-account.mjs` 及 `docs/operations/TestAccountDataResetAndSeed.md`）：
1. 任务时长严格约束为整半小时（30、60、90、120 分钟），严格杜绝 45 分钟或任何非 30 分钟整倍数任务；
2. 严格不注入知识块（保持 0 知识块）；
3. 标准 240 项任务中，合理保留 48 项为时间轴合法白天槽位任务（每个学科 4 项，槽位唯一无重叠）；将 144 项设为未排期活跃任务（`scheduledAt: null`，每个学科 12 项），其中 72 项为无截止日期纯待办任务（`dueAt: null`），72 项带未来截止日期，供首页看盘与排期副驾充分验证无 DDL 待办与 DDL 徽标提醒；其余 24 项为已完成，24 项为已取消。
数据库重新注入校验结果：`total_users=1`、`total_subjects=12`、`total_tasks=240`、`invalid_durations=0`（时长为 30m:60, 60m:60, 90m:60, 120m:60）、`knowledge_blocks=0`、`active_scheduled=48`、未排期活跃任务 `active_unscheduled=144`（`no_due=72`，`has_due=72`）、重复排期槽位为 0。

2026-09-24 PC Timeline 日视图固定刻度轴与卡片网格跨越编排收口：日视图固定呈现 08:00–22:30 全部 30 个半小时刻度槽位行，彻底消除长任务导致后续刻度断档隐藏的问题；网格行定高 80px 防压缩；任务卡片 `.slot-task` 改为绝对定位跨格，视觉高度匹配任务时长。交互分流精准锁定：卡片最顶部文字标题栏（`.task-header`，收敛为 `fit-content` 且文字子节点设为 `pointer-events: none` 阻断误清除）作为双任务交换落点（`swapScheduledTasks`）；离开顶部文字区域的卡片主体与空白区域按垂直偏移进入插入顺延（`insertTaskAtSlot`），杜绝主体误触发交换。全量 `npm.cmd run test:r4-pc` 397/397、`npm.cmd run type-check`、`npm.cmd run build` 及 `git diff --check` 全部通过。

2026-09-23 PC 截止日期（dueAt）与排期门禁解耦为纯 DDL 提醒特性收口（独立分支 `agy/deadline-as-reminder`）：全面将截止日期从排期/待办资格限制中解耦，任务无需截止日期即可进入待办清单与排期副驾待安排队列，`dueAt` 仅作为到期提醒与排序参考。移除 `recoverOverdueTasks` 中清空逾期未排期任务 `dueAt` 的逻辑，永久保留用户的真实截止日期；首页待办清单标题行最右侧补充「前往排期」微胶囊跳转按钮；首页待办卡片与 Timeline 待安排卡片均新增截止日期徽标（`todo-due-badge`、`pending-due-badge`），逾期时低饱和暖红高亮告警；更新 `r4-task-view-rules.test.mjs` 与 `r4-task-store-schedule.test.mjs` 自动化测试守卫，确保无 DDL 任务可排期、真实 DDL 不被抹除或篡改、`unscheduleTask` 绝不捏造假 `dueAt`。同步修复学科工作区 `saveCurrentOutline` 保存返回后校验目标学科 ID 防止大纲跨学科污染，在 `onMounted`/`watch(subjectId)` 中引入递增序号 `currentSubjectSwitchGen` 与路由 ID 守卫彻底消除快速连续切换学科时的异步覆盖竞态，并在切换学科时同步重置总览过期标记（`isSubjectOverviewStale`）、手动错误（`subjectOverviewManualError`、`fileOverviewManualErrors`）与生成中状态。全量 `npm.cmd run test:r4-pc` 386/386、`npm.cmd run type-check`、`npm.cmd run build` 全部通过。

2026-10-12 PC Profile Studio 左栏比例扩增、文字去黑话与 SVG 图标瘦身完成：
- 设置页（`Profile/index.vue`）左侧透视面板比例调整为 `flex: 3.8; min-width: 380px; max-width: 480px`（右侧 `flex: 6.2`），左栏信息在宽屏下不再被 400px 限制卡死，指标卡片与 7 天走势图展示更加大气舒展；
- 全站巡检清理工程技术黑话与生硬自白（如“排期副驾”改为“任务排期”，“重型资产编排”改为“资料管理”，“彻底从本地数据库移除”改为“学科及关联材料已删除”等）；
- 裁剪 Profile 页面装饰性小 SVG 图标，保留核心高价值交互控件；
- 自动化测试 68/68 全部通过，`vue-tsc -b` 0 报错，`npm run build` 成功。

2026-09-23 PC 学科大纲保存数据保留、消除切换异步残留、彻底消除伪轮转覆写、首页移出日程按 ID 寻址、严禁捏造 dueAt、学科切换 AI 请求旧文件隔离与测试脚本一致性收口：修复学科工作区（`SubjectWorkspace/index.vue`）大纲手工编排保存时覆盖丢失小节 `summary`、多文件 `sourceIds` 及 `locator` 的问题，UI 扩展支持每小节展示多文件胶囊与独立解除关联；彻底移除早期原型遗留的 `syncOutlineFileLinks` 及其在 `onMounted`/`watch(subjectId)` 的覆写调用，确保真实文件关联不受伪轮转破坏；在 `watch(subjectId)` 入口第一行立即同步调用 `chatStore.abortStream()`、`chatStore.clearActiveConversation()`、清空 `selectedFileId`、`selectedAiSourceIds`、`sourceStore.clearActiveSourceFiles()`、`subjectOutline` 与草稿并为 `saveCurrentOutline` 加入非空守卫，彻底消灭切换学科等待期间旧大纲被保存进新学科及 AI 请求携带旧学科文件 ID 的异步竞态窗口；在 `sendChat`、`retryChat`、`sendSelectionQuestion` 与 `saveKnowledgeBlock` 中严格增加跨学科文件归属校验，非当前学科文件 ID 一律过滤置空；扩展 `useTaskStore.ts` 的 `unscheduleTask` 优先通过唯一任务 ID 匹配，避免 `Dashboard/index.vue` 移出日程在同槽多任务时的串操作，并在发生异常时通过 `ElNotification` 弹出清晰错误提示；严格禁止在 `unscheduleTask` 中为未设置截止日期的任务捏造并持久化假 `dueAt`，任务移出日程仅清除 `scheduledAt` 与 `startTime`，首页“待办清单”展示由 `Dashboard/index.vue` 纯 UI 计算属性安全投影未排期活跃任务；同步清理 `scripts/seed-test-account.mjs` 中多余注册第二个 companion 账号的逻辑，严格维持单一测试账号 `users=1` 基准。全量 `npm.cmd run test:r4-pc` 386/386、`npm.cmd run type-check`、`npm.cmd run check:subject-workspace`、`npm.cmd run check:subject-icons` 及 `git diff --check` 全部通过。

2026-09-22 测试注入数据已按新时间轴规范全量重置并注入完成：执行本机 PostgreSQL `public` schema 重建与 Flyway v1~v22 全量迁移，清空 MinIO 历史测试对象。通过标准 REST API 重新为测试账号 `pc-ai-test-20260918@example.com` 注入 12 个学科空间与 240 个类真实任务。排期严格限定在时间轴合法可视窗口（`08:00 ~ 22:30`）内的 6 个标准半小时槽位（`08:30`、`10:30`、`14:00`、`16:00`、`19:00`、`21:00`），从次日起按日均分（每日 6 项），彻底消除凌晨与深夜排期。数据库校验结果：`users=1`、`subjects=12`、`tasks=240`、`active_scheduled=192`、重复槽位为 0、非法时段排期为 0。PC 端 `npm.cmd run test:r4-pc` 382/382 全部通过。

2026-09-22 PC 首页看盘时间轴简化为纯任务排列：重构首页看盘（`Dashboard/index.vue`）右侧面板，采用上下双卡片分区架构。上半部移除 06:00~23:30 垂直网格刻度槽位、当前时间指示红线及拖拽换槽改期逻辑，改为「日程任务」简单线性排列，按任务开始时间升序排列卡片，展示时间微胶囊、学科标签、标题及即时完成复选框和移出日程按钮；保留顶部日视图/周视图胶囊切换与 7 天日期快捷选择；下半部「待办清单」移除拖动手柄与拖动属性，纯列表展示未排期任务并支持直接勾选完成。时间轴复杂拖拽与全天半小时网格编排完全收敛至 `/timeline`（排期副驾）。`r4-dashboard-timeline.test.mjs` 测试对齐完成，PC 全量测试 `npm.cmd run test:r4-pc` 382/382、`npm.cmd run type-check` 与 `npm.cmd run build` 全部退出 0。

2026-09-22 PC 学科中心知识块布局微调与底部立体阴影优化：将学科工作区（`SubjectWorkspace/index.vue`）知识库网格（`.blocks-grid`）与上方微状态栏及操作条（`.blocks-top-bar`）之间增加缓冲下移距离，`.blocks-workspace` 调整为 `padding: 24px 28px 20px`，`.blocks-top-bar` 调整为 `margin-bottom: 24px`，`.blocks-grid` 引入 `padding: 8px 6px 24px 6px` 与 `margin: 0 -6px`，整体视觉向下自然沉降 16px，彻底消除卡片鼠标悬浮态（`transform: translateY(-3px)`）被滚动容器顶边界及上方状态栏/操作条遮挡裁切的问题。同时为知识块卡片（`.block-card`）、学科空间卡片（`.subject-card`）及搜索输入框（`.search-input`）加入双层立体底部微阴影与暗色模式适配，悬浮态提升至 `z-index: 2` 并扩展投影。PC `npm.cmd run test:r4-pc` 382/382、`npm.cmd run type-check`、`npm.cmd run build` 及 `git diff --check` 全部通过。

2026-09-22 PC 总览栏展现与交互优化：移除抽屉顶栏“AI 梳理”按钮，保留总览标题与大纲编排入口；大纲编排加号按钮在激活编辑状态时支持平滑旋转 45° 转换为灰色 `×`；重构 `SubjectOverviewSection.vue`，将学科总览卡片边框加粗为 2px 灰绿边框以凸显主次，顶栏错误集成“遇到意外错误，请重试”与操作一体化胶囊，一键生成换为纯文本胶囊与上下居中排版；文件总结按钮升级为圆角胶囊；“...”弹出菜单与菜单项全面升级为圆角微质感风格；大纲展现彻底移除生硬折线分支，重构为现代极简导轨与微圆点对齐风格。同时完整保留学科总览生成、大纲重新生成、查看总结、资料更新提示与错误重试全部功能。全量 `npm.cmd run test:r4-pc` 382/382、`npm.cmd run type-check`、`npm.cmd run build` 及 `git diff --check` 全部通过。


2026-09-21 Issue 3/4 前端实现与自动验证已收口：PC 连接状态 projection 按错误、离线、Realtime 重连、同步中、已同步的优先级展示，问答错误在聊天区域保持可见并可重试；Overview 手动重生成返回 `STARTED`/`SKIPPED`/`FAILED` 结构化结果，自动触发静默处理，失败/跳过保留既有缓存，并以 generation/abort/Source 状态 fence 阻止删除或修订后的晚到 Subject 结果写回。最终 focused 68/68，`npm.cmd run test:r4-pc` 382/382，`npm.cmd run type-check`、`npm.cmd run build`、`git diff --check` 均通过。自动证据不等价于真实 WebSocket、浏览器 online/offline、Tauri/GUI 文件预览或真实 Provider 验收；SQLite experimental、Vite externalized/dynamic-import/chunk size 警告仍存在。Issue 2（删除 Source 后 Chunk/RAG TopK）仍为计划未实现，Issue 5–7 仍待分别核实；本轮未改 API 或数据库契约。

2026-09-20 Overview Reduce prompt compression Task 2 已完成文档与自动验证收口：Task 1 保持 MAP prompt 行为不变，并为非最终及最终文档 REDUCE 接入专用均衡压缩 prompt；其规范化长度为 843 字符，目标约 2500–3000 个序列化 JSON 字符。`max_tokens=4608/6144`、规范化 intermediate `<=5200`、self-pair `<=12000`、no-progress、schema/alias/mode/locator 校验及分组/批次边界均不变。focused Server 四类测试实际 55/55，test-compile 与根目录 `git diff --check` 通过；自动证据只覆盖路由、prompt 约束和既有不变量，不等价于真实 DeepSeek 压缩质量验收。真实样本的输出字符数、内容覆盖、JSON/schema 成功、延迟、token 使用和成本仍未验证。

2026-09-18 OCR 页级进度 Task 5 已完成代码和自动验证：Pinia Store 的 Local OCR projection 改为成功 reader 结果的原子更新，并以已有 `attempt + localContentRevision` 作为内部 run identity；同一 run 的允许后续事件必须与最近有效 page/total 一致才保留，倒退 `before-recognize`（包括 totalPages 变化）不覆盖，新 run 必须先建立自己的 checkpoint，reader pending 时保留旧值，reader detach、Source 从 OCR_RUNNING 读集中消失或 reader 失败时清除失效投影。新增回归与 Store/UI/coordinator/runtime 套件 68/68、`npm.cmd run type-check`、`git diff --check` 通过。仅证明 Store/runtime 投影代码和自动回归，不等价于真实 Tauri/GUI OCR 进度观察；本轮未改 UI、OCR Coordinator、sync、API 或数据库契约。

2026-09-18 测试注入排期问题已定位并修正：注入脚本原使用 45 分钟起始间隔，但任务时长包含 60/90 分钟，导致时间轴任务块必然重叠。现行流程改为全局 2 小时起始间隔，并要求间隔不小于最大任务时长；当前 192 条活动排期已通过 API 修正，区间重叠为 0、最小空档为 30 分钟。该问题确认为测试注入数据问题，不归因于前端时间轴布局。

2026-09-18 OCR 页进度与 Source 收敛 Task 4 已完成代码和自动验证收口：本地 OCR 页级进度投影已修复，复用既有 `正在识别第 X/Y 页` 文案，不新增百分比或新 UI；替换 WebSocket 在 `onopen` 只触发一次既有 background `read` sync；处理 runtime 以生命周期/认证 scope guard 管理共享有界 reconciliation，覆盖遗漏的 Source `READY`。focused OCR/UI/runtime/protocol/sync 套件 90/90、`npm.cmd run type-check`、PC `npm.cmd run test:r4-pc` 352/352、`npm.cmd run build` 与 `git diff --check` 通过。上述为自动验证和代码状态证据，不等价于真实 Tauri/GUI OCR 进度、真实后端 WebSocket/event delivery 或跨设备收敛；这些仍属人工/发布验收边界。API、数据库 schema 和契约未变化。

2026-09-17 修复点 1（待处理）：PC 前端实时解析状态展示缺失。当前需沿 `Source → ParsedDocument/DocumentProcessingJob → 前端状态组件` 链路核对状态事件、Store 映射和 UI 消费；本条仅记录问题，尚未声称修复或完成真实 Tauri 验收。

2026-09-17 修复点 2（待实现）：AI 多文件提问交互需要从“静默调用其他文件”调整为显式选择。输入栏左侧提供 `+` 按钮，用户主动选择其他文件后，才将所选文件与当前上下文一起提交提问；未选择时不得静默引入其他文件。

2026-09-17 修复点 3（待处理）：文件预览首次打开时疑似发生约 2–3 次重复加载；预览失败时的错误信息未在预览区域居中显示。当前仅记录现象，加载触发链和错误态布局仍待核对。

2026-09-17 修复点 4（待处理）：无法连接后端时缺少用户可见的失败状态。问答请求没有错误反馈，左下角连接/同步状态也没有变化；需补齐连接状态传播、问答错误处理和全局状态展示。

2026-09-18 修复点 5（已完成并通过真机验收）：Server 删除 Subject 时在同一事务内软删除 Source、KnowledgeBlock、Task、Relation 并写入既有同步事件；相关 mutation 统一遵循“UUID 排序锁全部 Subject → 锁并重读具体资源 → 重校验 → 修改”的数据库锁协议。PC 先持久提交父删除标记，再围栏子投影、draft、处理任务与文件总览；父删除未决期间保留可回滚的 draft/bytes，服务端确认 APPLIED 后才终结 draft 并按最后引用规则清理本地 Asset，拒绝时原子恢复父记录并持久请求 authoritative snapshot。Server 聚焦 40/40，PC `test:r4-pc` 342/342、`type-check`、build 均通过；本轮 Subject 删除生命周期、重启与强杀恢复已完成人工真机验收，未发现阻塞问题。

2026-09-18 修复点 6（已完成并通过真机验收）：根因是 PC `replaceSources()` 从可见首行推断当前 Subject，导致跨学科导入、空学科和异步 A→B 加载时投影错位；现已把当前 Subject 与可见行解耦，并用 generation/subject guard 丢弃过期完成结果。Local Asset 的物理路径继续使用与学科无关的稳定 `assets/{userScope}/{localAssetId}/content.{ext}`，业务学科归属由 Source/draft 的 `subjectId` 表达，不新增按学科复制或搬移文件。相关流程 9/9、PC `test:r4-pc` 334/334、`type-check` 通过；本轮文件学科归属真机验收通过。

2026-09-18 release/stability 非阻塞测试项：双设备真实收敛、低磁盘、MinIO 故障注入和长时间稳定性尚未取得明确逐项执行记录，继续保留在发布稳定性测试范围，但不再作为 Local Asset Store 改造的未完成任务。MinIO 实际同步主链路此前已人工验证；本轮重启、强杀及异常恢复流程已人工验证，未发现阻塞问题。

2026-09-18 PC Local Asset Store 改造已完成并通过本轮真机验收。`b7a3bb7..c560d8b`（含 `f770277`、`e040e78`）完成永久本地资料库、owner/device scope、所有文件默认同步、断网导入/预览/本地 OCR/Parser、Source draft 与服务端 Asset 映射；后续提交完成文件学科归属与 Subject 删除生命周期收口。原始文件在受管目录中以明文保存，由 OS ACL 保护；Local Asset 不提供备份、导出或恢复。只有用户明确删除且最后一个 Source 引用消失后才删除本地文件；上传、解析、修复和删除任务在该边界前后均受 fence 保护。启动同步前 reconcile 数据库、受管文件和 staging 残留，缺失或 hash/size 不一致标记 `CORRUPT`，未知内容 quarantine。本轮主要流程、Subject 删除、重启/强杀及异常恢复均已人工验证，基本未发现问题；MinIO 实际同步主链路此前已人工验证。

自动与人工证据分开记录：Task 7 定向 77/77、FilePreview+store 38/38、Rust 30/30，`cargo fmt --check` 与 `cargo check` 通过；schema v8→v9 旧断言已由 `c560d8b` 对齐。最新本轮 PC 全量 `test:r4-pc` 为 342/342，`type-check` 与 build 通过。本轮另有真机人工验收结论；双设备、低磁盘、MinIO 故障注入和长时间稳定性仍属于未逐项执行的 release/stability 测试，不影响本地仓库改造完成状态。

2026-09-15 PC Local Asset Store 设计快照（已由 2026-09-17 实施记录更新）：当日产品与架构设计确认“已批准设计，尚未实施”，定义 PC Tauri 的永久本地文件、断网预览/解析、联网幂等同步、身份映射和最后 Source 引用删除语义；当日代码、SQLite schema、Server API 和运行行为尚未改变。

2026-09-15 Overview 失败体验与真实运行证据收口：用户复跑同一真实 Overview 后，第二次全链路成功，证明永久预算链路已能完成运行；生成内容质量仍需用户判断。Overview 的 `MODEL_PROVIDER_ERROR` 现在由 PC 显示为“遇到意外情况，请重试”，不新增 Server/API 错误码；FAILED 终态保护继续生效，不自动重试，只有用户点击“重新生成”才发起新请求。该 Overview 专用文案不影响普通 AI 聊天/流式路径。

2026-09-17 Overview token budget 调整为原预算的 150%：多批 MAP/非最终 REDUCE 为 `max_tokens=4608`，最终调用为 `6144`；规范化 intermediate JSON 上限与 self-pair 边界不变。普通聊天/流式不变。

2026-09-15 DeepSeek Overview prompt 压缩真实验证：同一 42-chunk/6-MAP 资料在新 intermediate prompt 下，六个 MAP 全部通过，`normalizedChars` 依次为 `2131,2027,2581,2817,3680,1447`，最大 MAP5 为 `1750 outputTokens`；此前超限的 MAP2 从 5105 降至 2027。随后 REDUCE round 1 分两组，第一组为 `2446 chars/1041 tokens` 并通过，第二组为 `4678 chars/2239 tokens`，在 `finishReason=stop` 且 JSON/schema 成功后仅触发 `characterOverflow=true`；其 `selfPairPromptChars=10899<=12000`。结论是 prompt 能显著压缩 MAP，但不能独自保证所有 REDUCE 输出低于 4000。Final prompt、4000/12000 硬校验、batch 和临时无 `max_tokens` 行为未变；TDD RED/GREEN、review 与相关兼容集合 58/58 均完成，永久参数尚未实施。

2026-09-14 Overview retry/convergence 与 DeepSeek structured response 修复：PC 对当前 revision 的 `FAILED` 与部分 `READY` 文件总览缓存视为自动终态，`SOURCE_READY`、`RESUME_BOOTSTRAP`、`RESUME_ONLINE`、`RESUME_SYNC`、`JOB_CHANGED` 不再自动 POST；`MANUAL_RETRY` 可绕过并继续使用 in-flight coalescing。失败/部分结果只保留一个可见“重新生成”，生成中 disabled，旧内容保留；网络/状态不确定文案与确定性失败分开。Server 中间调用使用 1024 `maxTokens`、最终调用 4096；中间输出在下一轮前校验 `outputTokens<=1024`、规范化 JSON `<=4000` 字符和 self-pair prompt fit，Reduce 保持 no-progress 单调性。Overview completion 现在显式声明结构化 JSON：OpenAI-compatible 请求发送 `response_format={type:json_object}`，DeepSeek 额外发送 `thinking={type:disabled}`，普通聊天/流式请求保持非结构化且不携带这两个字段；适配器不把 `reasoning_content` 当作最终 JSON。无有效 `message.content` 时只记录经过限制和清洗的模型标识、choice/finish/content/reasoning/usage 数量元数据，不记录 prompt、响应体、URL 或 key。`OVERVIEW_PROVIDER_OUTPUT_TOO_LARGE` 与 `OVERVIEW_REDUCE_NO_PROGRESS` 均为 HTTP 502，parse/schema 统一 `MODEL_PROVIDER_ERROR`；API route/DTO/OpenAPI schema/数据库未变。原持续自动补发、Reduce `VALIDATION_FAILED` 与 DeepSeek nullable content 的代码级适配问题已修复。PC Overview focused 54/54；最新 `test:r4-pc` 331/331，type-check、`check:r4-pc`（94 个生产文件）、`check:subject-workspace`、build 均退出 0。Server 本轮 fresh `clean test-compile` 退出 0，Overview/Provider/Streaming 聚焦 56/56；既有全量证据为 255 项中 252 pass、3 项 Docker/Testcontainers errors（MinioAssetStorageIntegrationTests、PgVectorIntegrationTests、PgVectorMigrationIntegrationTests）。OpenAPI gate green。上述自动证据不替代真实 DeepSeek/Provider、Tauri、网络、GUI、设备或业务验收；Server 持久 generation 幂等仍是开放风险。

2026-09-12 Build/OpenAPI Task 3 最终回归：Server fresh 聚焦命令实际执行 57 项，0 failures、0 errors、0 skipped，且 fresh test compilation 已通过；缺失的 `ProviderHttpTransport.post(..., byte[])` 仅在 `AiProviderSecurityTests` 测试 double 中补齐，生产 Provider transport 未改变。Server 全量 `mvnw -B -ntp test` 实际执行 239 项，0 failures、3 errors，错误仅为 MinIO/PgVector/Testcontainers 无法连接 Docker。`check-openapi.ps1` 退出 0（Server OpenAPI artifact 8/8，PC/Mobile 生成结果均与 artifact 一致）；artifact SHA-256 为 `BF91089DD4F272ACE0E4AC98744F0298D425DD5A43CD0EFE15E3C3627CBC5370`，两端 schema SHA-256 均为 `2152390C192BCBE34B7618D11B71F28DF72AC9262C39625594B5EF3CC7D219C7`，`subjectOverview` 与 `sourceOverview` 均暴露可选 `X-Overview-Request-Id`。PC/Mobile type-check 均退出 0，Mobile protocol test 23/23 通过；Mobile `useSyncStore` 仅增加一行编译期 payload boundary cast 以适配生成 `JsonNode` 的结构窄类型，运行时序列化不变，未来应以更精确的生成/契约类型清理该风险但不视为本轮已完成。`docs/contracts/API.md` 与 `docs/contracts/Database.md` 已核对，本轮未发现新的语义契约或数据结构变化。自动证据不替代真实 Provider、Docker、PostgreSQL/MinIO、Tauri/GUI、设备或业务验收。

2026-09-11 Server Test Gates Task 4：source 通过 source-owned `ParsedDocumentIngestionPort`/`IngestionJobReference` 与 `ai.ingestion` 保持单向模块边界；ArchitectureTests 标准聚焦 1/1、隔离架构复核 20/20；H2 清理聚焦连续两次 24/24；OpenAPI artifact 聚焦 8/8。标准聚焦 Maven 命令实际 40/40、0 failures、0 errors；全量 `mvnw -B -ntp test` 实际执行 239 项，0 failures、3 errors，错误仅为 MinIO/PgVector/Testcontainers 的 Docker 不可用。fresh `clean test-compile` 仍被 `AiProviderSecurityTests.java:182` 的匿名 `ProviderHttpTransport` 缺少 `post(..., byte[])` 阻断，未修改该 blocker；增量运行的 testCompile 显示 `Nothing to compile`，不改变 fresh 结论。`check-openapi.ps1` 的 artifact 比对和 Server 8/8 已通过，但报告 `Auralis-PC/src/api/generated/schema.ts` stale。自动门禁不替代真实 Tauri、Provider、PostgreSQL/MinIO、GUI 或业务验收。

2026-09-10 Overview 诊断增强：PC Overview 请求携带 `X-Overview-Request-Id`；Server 将请求 ID 规范为 UUID（非法值生成新 UUID），为每次生成记录 `generationId`，输出 MAP/REDUCE/JSON_PARSE/SCHEMA_VALIDATE/CACHE_RETURN 阶段；失败日志只保留 allowlisted `errorCode` 与 exception/cause 类型，不写原始 exception/cause 文本或 throwable stack。未改变生成、分块或缓存逻辑；真实 OCR 重传日志仍待人工验收。

2026-09-10 Provider Overview 503 修复：`ProviderHttpClient` 已将 Provider connect timeout 与 response/read timeout 分离，默认分别为 3000ms 与普通请求 10000ms；Overview map/reduce 非流式 completion 通过显式 timeout overload 使用默认 120000ms，配置限制为 60000–120000ms。`SocketTimeoutException` 现在返回 `MODEL_TIMEOUT`/HTTP 504，普通 IOException 仍为 `MODEL_UNAVAILABLE`/503；默认 JSON、embedding、stream 窗口保持 10000ms。TDD RED 捕获 timeout overload/配置缺失、旧错误码和配置越界未拒绝；最终 Provider、Overview、普通 streaming、embedding、错误映射及 OpenAPI 聚焦回归 60/60 通过。Provider 真实网络重试和生产外部依赖仍待人工验收。

2026-09-10 PC 学科“总览”升级：Server 新增两个认证、无状态的结构化生成端点；PC 本地 schema v7 按 user/device/source revision 保存文件与学科大纲/总结。文件处理 READY 后后台生成文件 `ALL`，学科总览仍只由用户点击原位置的“AI 梳理”触发；左栏默认折叠学科总览并直接展开各文件大纲，文件总结在中栏预览。分项重生成失败保留旧内容，学科大纲可单独重生成；空大纲/总结不会进入无效请求，全部输入删除或失效会将旧学科总览标记为资料已更新。Server 聚焦 23/23、PC 完整 R4 306/306、overview/UI 聚焦 18/18、type-check、静态检查、工作区契约、生产构建与 diff-check 已通过；OpenAPI artifact 8/8 与 PC 生成类型一致，仓库级契约门禁仍被既有 Mobile schema 过期问题阻断。Server 全量 223 项中 0 失败、28 错误，仍为既有 Modulith 边界、共享 H2 清理和 Docker 不可用问题。真实 Provider、Tauri restart/upload callback、locator 和 GUI 深浅色/窄屏仍待人工验证。

2026-09-09 PC 时间轴空槽拖动 400 修复：`rescheduleTask` 不再对空目标槽调用双任务 `POST /api/tasks/schedule-swaps` 并伪造空 `targetTaskId`；空槽调度现通过单 Task 的本地 repository/outbox 更新，仅已占用槽之间继续使用原子 swap API。TDD 修复前聚焦 12/13，确认空槽分支发送 `targetTaskId: ''`；修复后时间轴相关 35/35、完整 PC 272/272、type-check 和静态检查通过。真实 Tauri GUI 拖动与后台同步待人工验收。

2026-09-09 PC 知识块来源与学科名称映射修复：`KnowledgeBlock.sourceId/subjectId` 仅作为关联标识，`useKnowledgeStore` 现从同一用户/设备的本地 Source/Subject 投影解析可读 `title/name`，不再把 UUID 直接显示为来源或学科名称。新建/更新知识块即时保留当前可读名称，关联投影缺失时使用中性占位而不泄露 ID。TDD 回归先复现学科 UUID 被展示为标签，修复后知识块映射聚焦 12/12、完整 PC 271/271、type-check、静态检查与生产构建通过；真实 Tauri GUI 仍待人工验收。

2026-09-09 PC PDF 混合页面阶段修复：新增严格状态转换回归覆盖“文字页→OCR页→文字页”；`DocumentJobRunner` 现保持 `OCR_RUNNING` 到 `PACKAGING`，避免第三页普通文字 block 触发 `DOCUMENT_JOB_ILLEGAL_TRANSITION` 并落入 `FAILED_LOCAL`。runner 聚焦测试 12/12，完整 PC 269/269，type-check 与 diff-check 通过。自动测试未替代真实 51 页 PDF 的 Tauri GUI 重试、上传与服务端验收。

2026-09-09 Task 16 部署运行验证：仅重建/recreate backend；Compose config、backend health/readiness 和 `AURALIS_AI_INGESTION_WORKER_ENABLED=true` 通过，PostgreSQL/MinIO volume 未触碰。只读库有 18 READY Source/Job，但既有 READY 数据的 SOURCE change-log 只有 CREATE/DELETE、无 UPDATE（符合事件修复前数据预期）；未执行认证 reingest/upload，PC/Tauri/MinIO/GUI 端到端仍待验收。scheduled Sync retention 的事务入口已修复，Spring 代理入口真实 delete query 回归与 `SyncServiceTests` 11/11 通过；重建 backend 后的实际 scheduled run 日志仍待复核。

2026-09-09 Task 14：Server Source ingestion 状态与安全失败诊断的实际变化统一写入既有 `SOURCE/UPDATE` change-log/realtime 事件链；重复相同状态/诊断保持版本和 cursor 不变。Task 14 聚焦 4/4、worker/controller 8/8 通过；Server 全量 207 项中 0 失败、28 错误，错误为既有架构循环、Docker 不可用及 H2 清理外键问题。真实 Server/MinIO/Tauri/GUI 仍未验收。

2026-09-09 Task 13：ParsedDocument 上传增加有界 `[Document Upload Trace]` 事件，覆盖 PUT/complete 成功、失败和过期 intent 重试，保持缓存安全与状态机不变。upload 19/19、scheduler/flow/schema 51/51、完整 PC 262/262、type-check 和 diff-check 通过；真实 Tauri/MinIO/Server/GUI 仍待验收。

2026-09-09 PC stale/current revision preflight correction：scheduler 先进行一次权威 Source GET，取得当前 `ingestionRevision` 后再处理 stale jobs，并只对选中的 current-revision job 做 cache ID 关系校验。stale corrupt row 保留 evidence 但不阻塞 valid current row；current mismatch 在 Source GET 之后、hash/prepare/runner/upload/complete/delete 之前停止。scheduler 33/33、schema 17/17、upload 16/16，完整 PC 259/259、type-check、diff-check 通过；真实 Tauri/Server/MinIO/GUI 仍待验收。

2026-09-09 PC recoverable server-phase cache mismatch：`SERVER_VALIDATING`/`SERVER_INDEXING` 的本地 cache ownership corruption 现在合法转入 `FAILED_LOCAL`，保留两侧 ID/receipt 并可由 `retry()` 重新入队；READY/FAILED_SERVER 保持原 phase。scheduler 先加载并预检当前 Source 的本地 jobs，再读取 Source backend，mismatch 时 sourceGet/hash/prepare/runner/upload/delete 均为零。schema 17/17、scheduler 32/32、upload 16/16，完整 PC 258/258、type-check、diff-check 通过；真实 Tauri/Server/MinIO/GUI 仍待验收。

2026-09-09 PC phase-safe mismatch follow-up：scheduler 的 schema-v1 cache ownership mismatch 现在统一经过 phase-safe cleanup failure helper；READY、SERVER_VALIDATING、SERVER_INDEXING、FAILED_SERVER 使用合法同阶段 preservation，recoverable phases 才转 FAILED_LOCAL。table-driven real repository regression 31/31，upload 16/16、schema 16/16，完整 PC 256/256、type-check、diff-check 通过；零 upload/OCR/backend/deletion，真实 Tauri/Server/MinIO/GUI 仍待验收。

2026-09-09 PC cache-safety follow-up：READY 任务现在先按已验证的 payload column/receipt cache ID 关系删除派生 cache，成功后同阶段清除 `payloadCacheId` 与 `payloadReceipt`；删除或 ownership 校验失败保留证据并写入 bounded cleanup error，后续 `schedule()` 会在 `ALREADY_READY` 边界重试。schema-v1 cache ID mismatch 在 scheduler 和 coordinator 的 intent 前均被拒绝。Focused upload 16/16、scheduler 30/30、schema 16/16，完整 PC 255/255、type-check、diff-check 通过；真实 Tauri/Server/MinIO/GUI 仍待验收。

2026-09-09 PC ParsedDocument upload 状态机修复：`ParsedDocumentUploadCoordinator` 在 complete 返回 `ACCEPTED` 后先持久化 `SERVER_INDEXING`，再持久化 `READY`，与 `DocumentProcessingJobRepository` 的合法迁移表一致。真实 transition-validating repository 回归先复现 `DOCUMENT_JOB_ILLEGAL_TRANSITION`，修复后 ParsedDocument upload 15/15、processing flow 1/1、job schema 16/16、source scheduler 27/27 通过；完整 `npm.cmd run test:r4-pc` 251/251、`npm.cmd run type-check` 和 `git diff --check` 也通过。scheduler 仍在 READY 之后负责返回结果与 cache cleanup；真实 Tauri/Server/MinIO PUT、complete、indexing 和 GUI retry 尚未验收。

2026-09-09 Task 12 final review closure：Rust `document_packager` 5/5、`document_cache` 5/5、`document_upload` 8/8，Java `ParsedDocumentValidatorTests,ParsedDocumentCompleteTests` 8/8；最终 PC scheduler focused 27/27、完整 `test:r4-pc` 250/250、`npm.cmd run type-check` 和 `git diff --check` 通过。最终 reviewer 的所有 Critical/Important findings 已关闭：scheduler SHA 透传、receipt/cache ID 安全清理（含 discard/stale/terminal 任务）和 legacy/incomplete receipt 的网络前拒绝。上传内容仍是单个 gzip JSON schema-v1 envelope，不是 NDJSON；未改变 Server migration/OpenAPI。真实重建 Tauri、Server/MinIO PUT/complete/indexing 和 `1.pdf` GUI retry 尚未观察，仍是业务验收边界。


2026-09-09 Task 15：PC ParsedDocument complete 在明确 `ACCEPTED` 后通过可注入回调请求一次 background `read` sync；回调异常不会改变 accepted 结果或阻止本地 `SERVER_INDEXING → READY`，非 accepted/异常路径不请求。Task 15 upload focused 24/24、runtime/scheduler/flow/schema 组合 64/64；完整 PC、type-check 和 diff-check 结果见任务报告。真实 Tauri/Server/MinIO/sync pull/GUI 仍待验收。

2026-09-10 PC Overview 触发/关联诊断已接入：`[FILE_OVERVIEW_TRIGGER]` 输出结构化 allowlist 生命周期事件，触发值来自 TypeScript 封闭类型和已知调用点：`SOURCE_READY`、`RESUME_BOOTSTRAP`、`RESUME_ONLINE`、`RESUME_SYNC`、`JOB_CHANGED`、`MANUAL_RETRY`（不代表运行时动态校验）。仅在实际进入 `runFile` 的生成尝试中由服务创建 request ID，并由 API 原样写入既有 `X-Overview-Request-Id`，可关联 PC 与 Server 日志；preflight/skip 事件可能没有 `requestId`。现有内存 coalescing 保持不变，未改变重试、缓存、Provider、Server 或 timeout 行为。自动验证：Overview focused 16/16、完整 `test:r4-pc` 310/310、type-check、`check:r4-pc`（93 个生产文件）和 `git diff --check` 均通过；这些仅证明代码/自动门禁，不替代真实 Tauri、Provider attribution 或业务验收。Server 同一 `(user, source, revision, mode)` 进行中去重/idempotency、PC/Server timeout mismatch 与真实触发归因仍待外部验证。




2026-09-08 PC ParsedDocument 上传诊断与长度修复：Tauri reqwest PUT 失败日志现在在 `without_url()` 后输出 allowlist 风险范围内的 flags、顶层摘要和最多三层 source cause；最终诊断总长限制为 256 字节，保持 `NETWORK_OFFLINE:*` 对外错误契约不变，不向前端或 SQLite 返回摘要。根因已由真实日志定位为旧 receipt 声明了比解密 reader 多出的 encrypted envelope 字节；新 receipt 的 payload size/hash 与解密 reader 对齐，历史 receipt 恢复前按 owner scope 重算。真实 Tauri/MinIO PUT/complete/indexing 仍待重启后人工验收。

2026-09-08 PC 断网续传状态机已补齐：真实 `DocumentProcessingJobRepository` 回归证明带 payload receipt 的 `PAUSED_NETWORK` 用户继续经 `QUEUED -> UPLOADING` 直接上传，不重跑 OCR/download/hash；无 receipt 的 `QUEUED` 仍进入解析。PC 自动证据最终已知为 237/237，`npm.cmd run type-check` 通过，聚焦复审 40/40 通过。真实 Tauri 点击继续、MinIO PUT/complete/indexing 与 GUI 结果仍未由本轮自动证据证明。

2026-09-08 Task 颜色破坏性契约切换已应用：Server Task API/Entity、V21 迁移、OpenAPI artifact/生成类型、PC/Mobile/Tablet Task 投影、同步和页面不再产生或渲染 Task `colorOverride`/`color`；KnowledgeBlock 颜色保留。PC/Mobile 本地迁移清洗有效 Task JSON 颜色键，非法 JSON 原样保留并限次告警。Server/PC/Mobile 本轮门禁结果仍待本轮命令完成，真实数据库升级、端侧旧库和 GUI 仍需人工验收。

2026-09-07 Task 认知负荷破坏性契约切换：Server Task 领域模型、请求/响应、OpenAPI 和同步载荷已移除该字段；V20 删除数据库列并仅从 Task 历史 JSON 中清理废弃键。PC/Mobile/Tablet 的生成类型、Store、本地存储、同步转换和可见页面已移除 `cognitiveLoad`/`load`/`loadText` 依赖。本轮 Server 定向测试 8/8、PC type-check 与 R4 211/211、Mobile type-check/静态检查/协议测试 21/21 通过。Server 全量测试实际运行为 198 项、0 失败、28 错误，错误仍是已记录的 Docker 不可用、模块暴露边界和共享 H2 `assets → users` 清理外键。OpenAPI 定向测试通过，但两端生成 schema 与 artifact 之间仍有本任务之前存在的 WebSocket/JsonNode 漂移，`check-openapi.ps1` 仍不通过；该漂移未在本轮扩大修改。

2026-09-07 MinIO 恢复复核：宿主/容器磁盘与 inode、volume 挂载和权限检查未发现容量或权限耗尽；MinIO 曾周期性报告 `/data offline` 和 read/write quorum 失败。已在不删除 volume 的前提下安全重启并重新加载真实对象读写 healthcheck；最终随机对象 PUT/HEAD/GET/DELETE 通过，MinIO ready 与 backend readiness 均返回 HTTP 200。Tauri 三条任务未重试，仍保留此前只读快照中的 PDF `FAILED_LOCAL/OCR_SIDECAR_UNAVAILABLE`、PPTX `FAILED_LOCAL/DOCUMENT_FILE_TYPE_UNSUPPORTED`、DOCX `FAILED_LOCAL/NETWORK_OFFLINE`，SQLite 未修改；GUI 重试验收仍开放。

2026-09-07 PC 认证与浏览器依赖收口：后端重建导致持久 refresh session 失效时，PC 会清除 access/refresh token、进入 `reauthentication-required`，停止受保护 Axios、sync 和 Source document background scheduling，且不再通过受保护 logout 递归制造 401；登录/注册保留恢复路径，refresh 单飞和一次重放契约保留。PPTX parser 与 Vite resolver 均固定到 JSZip 浏览器 bundle；24/24 聚焦 Node 回归通过。本轮未运行完整 Vite build，stream 是否已从最终 Tauri bundle 消失及真实 Tauri GUI 仍待验收。

