> [!WARNING]
> 本文件是从 `docs/current/IssuesAndReview.md` 明确标注的阶段历史区提取的记录，于 2026-10-28 整理。它不代表当前实现或任务状态；请从[文档中心](../../README.md)进入现行状态和风险登记。历史正文不修订，仅重定位相对链接。归档不构成任何验收项的关闭。

# 问题与审查阶段记录

## 阶段历史记录（以下状态为各阶段当时快照，以顶部接续快照为当前事实）

### 2026-10-23 PC 回退后定向测试问题收尾（问题关闭于测试层；唯一审查完成）

- 此前 M4 回退记录的四个 PC 定向问题均由对应 fixture/断言更新处理：旧 Stop aria-label 不属于现行 UI，改断言当前控件与 regenerate；asset-flow 测试改用真实 Axios adapter 观察 scope、token、device、payload 和 dispatch，不再把合法的 A-active 早期派发误判为跨账号泄漏；B 登录后旧 A ticket 不派发，B 不携带 A 资源；A 的 delayed 401 以 `SYNC_SCOPE_CHANGED` 结束且无 B credential refresh/retry。上传完成以 completion 事件及持久 job 状态确认，不依赖固定 sleep。
- 验证分批报告：Maven focused 55/55（30+25）、exit 0；Node 首轮106项104 passed/2 failed、exit 1；affected-only 2/2、exit 0，未重跑106整批。两个 Node 失败是 fixture completion observation/变量问题，不是 production regressions。唯一 reviewer B0/I0/O0；未要求额外测试或代码改动。
- 本关闭仅针对上述 PC 定向测试清单；不代表完整 PC R4、type-check/build、真实 GUI/API/Provider 或部署通过。Mobile 既有错误、其他历史 full-suite 失败与范围审计保持未处理；M5 仍待后续。
- 执行者报告：`D:/Temp/auralis-error-closeout-20261023/closeout-handoff.md`；review：`review.md`。
### 2026-10-23 Overview M5.4：正文跨任务复用（分批验证与唯一审查完成）

- Donor 限同 owner/scope、完整 input/profile/algorithm 与 exact prompt-derived writer step；仅 SUCCESS donor 中关联 ASSEMBLED plan、VERIFIED node、匹配 checkpoint hash 且有当前 attempt 真实 dispatched reservation journal 的 checkpoint 可用。cache-materialized 且无 reservation 的 node 不能继续成为 donor。当前 checkpoint 优先；unknown dispatch / `RECOVERY_REQUIRED` 在执行 lookup 前 hold。
- 首轮定向批次 55 项：52 passed / 3 errors（exit 1），fixture 原因为两个 Mockito stub 重装问题和 coordinator fixture 沿用 active generation lease。首轮 affected-only 4 项 3 passed / 1 failed（exit 1）；unknown-dispatch 断言把多个只读 preflight lookup 误计作执行期 lookup。unknown-only 1/1 与最终 affected-only 4/4（exit 0）；未重跑55项整批。唯一 reviewer B0/I0/O0；未做重复测试。
- 未覆盖/未验收：PostgreSQL、backend full、package、API/OpenAPI/SDK、真实 Provider、GUI、Docker、部署。M5 尚未完成；不同 input 正文复用、依赖失效与完整生命周期仍待办。此前范围审计与 PC 四项失败未处理。
- 证据：`D:/Temp/auralis-overview-m54-20261023/final-handoff.md`、各分批测试日志及 `review.md`。

### 2026-10-23 Overview M5.3：目录规划跨任务复用（分批验证与唯一审查完成；本阶段文档同步已处理）

- 三类允许复用的 planning purpose 为 `ADAPTIVE_ROUTE`、`ADAPTIVE_METADATA`、`ADAPTIVE_METADATA_ROUTE`。donor 限同 owner/scope/profile/algorithm、完整 input 与 prompt-derived step 匹配且 SUCCESS；仍验证 checkpoint 14 天窗口、result 到期、payload SHA/schema、当前 owner/source 与 route coverage/shape。当前 checkpoint 优先，donor 命中只读、不复制、不延寿、不伪造 usage。原 writer 与持久 journal 继续执行；不做跨任务正文复用，M5.2 index batch 路径保持冻结。
- 首轮 51 项（Adaptive 28 passed；Coordinator 22 passed / 1 error）。唯一 error 是 coordinator fixture 改变 profile/algorithm 时未结束 synthetic lease；后续 fixture 修正中也修复了结束后继续使用旧 lease 的顺序错误，并在过期/损坏断言前重新获取 lease。production logic 未为此修改。仅受影响方法复验 1/1、exit 0；没有重跑 51 项整批，不记作全批次全绿。
- 唯一只读 reviewer 结论 BLOCKER=0 / IMPORTANT=0 / OPTIONAL=1；O1 指向 Status、Issues、Backend 尚缺本阶段记录，本次六文档同步已处理；未进行文档更新后的复审。无 PostgreSQL/full/package/API/Provider/GUI/Docker/deploy验收；原 PC 四项失败和范围审计未处理。证据：D 盘 M5.3 `final-handoff.md`、`maven-test.log`、`affected-retest.log`、`review.md`。

### 2026-10-23 Overview M5.2：索引 batch 跨任务复用（定向验证与唯一审查完成；本阶段问题关闭）

- 复用围栏：batch key 覆盖 system prompt、indexData、有序完整 raw unit；donor 限同 owner/scope/profile/algorithm SUCCESS generation；donor checkpoint input fingerprint 必须等于 donor generation input fingerprint，并检查 SHA/schema、14 天 checkpoint、result 到期及现行 Source/owner、coverage/shape。命中只读且不延长寿命；仅真实 Provider 新生成并通过 coverage/shape 后保存 checkpoint。
- gpt-6-luna high 的最终定向批次 49/49（Coordinator 22/22、Adaptive 27/27），Maven exit 0。此前单测失败由 fixture 使用旧 writer checkpoint 读取序号 8/9 引起；新增 local checkpoint reads 后注入序号应为 14/15。仅调整 fixture，原 dispatch 断言不变，随后整批通过。唯一只读 reviewer（gpt-6-luna high）结论 BLOCKER=0 / IMPORTANT=0 / OPTIONAL=0。
- 不覆盖节点级/正文复用或完整 M5；未运行 PostgreSQL、backend full、package、OpenAPI/SDK、真实 Provider、GUI、Docker 或部署。原 PC 四项失败及范围审计仍保持此前记录，未由本阶段处理。证据：`D:/Temp/auralis-overview-m52-20261023/handoff.md`、`adaptive-final-2.log`、`review.md`。


### 2026-10-23 ADAPTIVE_INDEX 批次别名提示错误（定向验证完成；未部署）

- 第五批 index 将内部 `sourceAlias` 与本批 `unitAlias` 同时提供给 Provider，捕获 trace 显示模型用 `source-1` 回答；运行时 validator 的 allowlist 只包含 `unit000029–unit000035`，因而正确拒绝该 source-level alias。请求现只投影本批 unit alias，并明确 sourceIds 的批内 alias 约束；内部真实 source provenance 与 validator、coverage、owner fence 保持不变，不能通过把 source alias 扩展成多个 unit 覆盖来规避。
- index batch/checkpoint keys 对 system prompt 和 index data 做 fingerprint，此提示变化自然令旧提示缓存 miss，不需要调整通用算法版本或公开契约。`OverviewAdaptiveGenerationTests` 37/37 通过；回归验证覆盖实际请求投影、生成继续到 route/writer、最终真实 sourceId provenance，以及 source-level alias 仍被 route 前拒绝。未运行全量、PG/MinIO、真实 Provider、GUI 或部署。
- 证据：重现 trace 与根因见 `D:/Temp/auralis-index-summary-fix-20261023/retest-diagnosis/diagnosis.md`；本次差量和 focused 验证见 `D:/Temp/auralis-index-alias-fix-20261023/final-handoff.md`。

### 2026-10-23 ADAPTIVE_INDEX 冗余 summary 被误判为 Provider 错误（已修复）

- 实测 trace 的合法 index 同时包含 `outline` 与通用 Overview schema 允许的 `summary`，但 adaptive pipeline 又要求内部 index 的 `summary` 为 null，导致返回 `MODEL_PROVIDER_ERROR`。服务现将仅 ADAPTIVE_INDEX 响应和恢复 checkpoint 的 summary 规范化为 null；保留 outline、coverage/shape 校验，原始 Provider trace 不改写。其它生成阶段不放宽。
- 回归验证：有效 index + summary 成功继续到 route 与 writer；coverage 不完整时仍拒绝且不派发后续阶段。定向套件最终 35/35，exit 0。编译和首轮 fixture 失败已归因并修正，未扩大验证范围。
- 无 API/schema/migration/front-end 变化。未运行 PostgreSQL/MinIO、全量测试、真实 Provider、GUI 或部署。证据：`D:/Temp/auralis-index-summary-fix-20261023/final-handoff.md`。

### 2026-10-22 M5.1：完全相同输入的跨任务轻量索引复用

- 新生成任务先读取自身 checkpoint；缺失时，仅 ADAPTIVE_INDEX 可查询同 owner、scope、完整 input fingerprint、profile、算法和 prompt step 的 SUCCESS generation。读取同时检查 result 到期和 checkpoint 14 天有效期，以及 payload SHA/schema；使用前继续执行现行 Source/owner 校验和索引 coverage/shape 校验。
- 复用现有 overview_generation_checkpoints，只读命中，不复制缓存、不延长原条目寿命、不新增表或迁移。目录和正文仍执行当前生成流程；命中不派发 Provider、不伪造 usage，记录 ADAPTIVE_INDEX_CACHE_RETURN。预算预检识别可复用索引。
- 本小节只覆盖完整输入未变化时的新任务复用；资料局部变化、节点级依赖失效、目录/正文跨任务缓存及完整删除生命周期仍属于后续 M5，不能据此标记 M5 完成。现有前端流程保持。
- 验证：D 盘隔离源码运行 OverviewGenerationCoordinatorTests 21/21、OverviewAdaptiveGenerationTests 26/26，共 47/47，Maven exit 0。覆盖跨 owner/输入/profile 隔离、过期、损坏拒绝及生成链路跳过索引而继续目录/正文。当前为 H2/合成 Gateway 证据，未运行 PostgreSQL、全量测试、打包、真实 Provider、GUI 或部署。本轮依用户要求由主模型直接实现并检查，未启用子代理。
- 证据：D:/Temp/auralis-overview-m51-20261022/targeted-tests.log 与 handoff.md。更早前端回退的四项失败未由本轮处理；此前范围审计按用户最新要求暂置，尚无完整审计结论。
### 2026-10-22 Overview PC 回退与在途编辑保护（源码、定向检查与唯一审查完成；未部署）

- M4 新增的 PC job selector、candidate preview/publish/adopt 与 section reader 已按用户决定撤回；当前恢复原 Overview/SSE 生成流程，不作为未来必做的 UI 任务。Server candidateInput、job/publication/receipt、preview/section API 与 V37 继续保留，但无当前 PC consumer。此前针对来源选择器的 O1 随该 UI 撤回，不适用于最终范围。
- 仅保留生成期间本机编辑保护和 browser fallback 跨 tab Web Lock。检测到本机编辑时保留本地内容及冻结 mutation，将 AI 结果置于 `OVERVIEW_GENERATION_EDIT_CONFLICT` 且不 PUT；无 Web Locks 时拒绝 browser storage 写入。SQLite 仍走原事务；云端 CAS 409 独立保留。最终 I1 reviewer delta B0/I0，无新增问题。
- 检查按批次报告：noEmit 0、cache/sync/deletion 55/55、generation 75/76；先前 rollback R4 首轮 169/3F，race 与 UI 定向回归 4/4、1/1。当时未过项共4：旧 Stop aria-label fixture/source mismatch 1项，asset-flow owner-switch/auth-refresh 3项（缺同测试旧 baseline，未归为历史失败）。未做回退后 GUI、Provider、Docker、full-suite、backend/SDK 或部署验证。此前 M4 GUI 与完整流程只是回退前历史。

### 2026-10-22 Overview M4 PC native jobs（回退前实现、验证与隔离浏览器流程的历史记录；未部署）

- 最终 source-type-fence delta review 为 B0/I0/O0 new，既有 O1（超过 100 个可选来源时默认全选的低风险 UX）保留。FILE/TEXT/URL 仅在现有 READY、非删除、owner/device/scope、source identity/type/revision 围栏均匹配时可由 local outbox PUT；相关 Store/sync 回归 30/30。自动 FILE/ALL request identity 为 namespace + source UUID + ingestion revision + mode 的 SHA-256；digest 不可用则 fail-closed，不 POST、不回退随机。候选 currentness 在 GET/publication 校验，变化后由用户明确重生成。
- 验证按批次保留：backend full 774/771P/1F/2E，affected 3/3；PC full R4 745/716P/29F（25 既有 fixture/Web Locks、1 seed context、3 初始 M4），未宣称 full 全绿。SQL 42P18 修复后 PG 1/1、package Maven/Docker 0/0；GEN 72/72、lifecycle 10/10 分批完成。Mobile 两个既有 TS2339 和 PC static 一个既有 finding 保留。
- 隔离浏览器通过合成 Provider 完成真实后端接口流程验证，覆盖 candidate preview/publish、section GET、job reconnect/pause/resume/cancel、SUMMARY partial 保留、URL CAS conflict、Keep Local 与 candidate adoption；最终 formal SOURCE/section v4 与 receipt 已读回。未验收真实 Provider、native Tauri/SQLite、FILE/PDF/OCR、真实定位、部署和内容质量。M4 本阶段关闭；M5/M6 与最终兼容清理仍 open，整体路线 active。

### 2026-10-22 Overview M3.4（源码、相关自动验证与唯一审查完成；未部署）

- M3.4 正式发布、raw-source per-part currentness、VERIFIED preview、正式分节读取与 scope-filter cursor 已完成源码及相关自动验证；唯一 reviewer 和 I1 delta reviewer 最终均 B0/I0/O0。full run04 135 fresh XML / 729 tests / 2F/258E/0S 的历史失败保留；受影响组之后定向复验闭合，不称 full suite 全绿。最终重点组 PublicationPG 8/8、Auth 1/1、ResultHTTP 1/1、Post-I1 HTTP 1/1 通过；其余完整门禁与制品 hash 见 M3.4 计划及 D 报告。
- 无部署、业务数据库、真实 Provider 或 GUI/用户流程/内容质量验收。M4 PC 新交互已撤回，不列为待补功能；M5 cache/reuse、M6 真实 Provider/usage 校准、内容质量、部署与最终 unused-compatibility cleanup 仍 active。详见 [M3.4](../../plans/2026-10-22-overview-m34-publication.md)。

### 2026-10-22 Overview M3.3 job/control（本阶段问题已关闭；未部署）

- 本阶段的 job 生命周期、V36、claim/lease/fence、pause/resume/cancel、精确 reservation lineage/recovery、OpenAPI/SDK 对照与相关失败组已有自动验证；唯一 reviewer 最终为 BLOCKER=0 / IMPORTANT=0 / OPTIONAL=0。该结论限于 M3.3 源码、相关验证与审查，不代表修复后再次全量通过。
- 首次 full 为 752 tests / 724 passed / 19 failures / 9 errors；之后 67 个相关用例中 61 通过，五组通过；最后只对七个失败/负向方法复验并全部通过，未再跑 full。unknown dispatched usage 或精确 lineage 缺失/错配仍 fail-closed 并 hold，不能通过测试 fixture 的可信终态模拟推断生产未知费用可以自动解决。
- 关闭本阶段实现问题不代表部署或业务验收：没有调用真实 Provider、生产业务数据库或完成 GUI/真实用户流程与内容质量验收。正式 OverviewResult 发布与分节预览由 M3.4 完成；PC 消费界面曾在后续实现，现按用户决定撤回，不列为待补功能。项目最终 unused-compatibility cleanup gate 保留至整合，不在本阶段扩大。验证与审查证据见 D:/Temp/auralis-overview-m33-background-20261019/。

### 2026-10-19 Overview M3.2 持久 writer plan/node journal（相关门禁与唯一审查完成；未部署）

- M3.2 已实现 adaptive 正文写入持久化有序 plan、节点 attempt、精确 usage reservation 关联与已验证 checkpoint；新 profile/算法不可绕过旧 generation 的未知派发调用，预算 task 沿用父 generation。唯一 reviewer 的 RESERVED 未派发重试 finding 已修复并复审关闭。
- 验证记录：full backend attempt 737/731P/2F/4E/0S；对应六个失败用例修复后定向 6/6；reviewer PG class 首次 3/4（仅新夹具顺序错误），随后新增方法单独 1/1。全量套件未在修复后重跑。package 成功（tests skipped），唯一 reviewer BLOCKER=0 / IMPORTANT=0 / OPTIONAL=0。未部署，真实 Provider、生产业务库与 GUI 未验收。
- 未知/已派发但无终态的调用仍明确进入 recovery hold；M3.3 已交付控制与对账，但不会自动解决未知调用。M3.2 当时尚无 worker、公开 job API、UI 或正式发布。计划、baseline-relative 差量、验证和 review 证据位于 `D:/Temp/auralis-overview-m3-jobs-20261019/`。项目最终整合仍需统一盘点并移除未使用版本兼容分支、DTO/字段 fallback 与旧格式读取；不在本阶段提前全仓清理。

### 2026-10-19 Overview M3.1 分层目录规划（相关验证与唯一审查完成；未部署）

- 聚合索引超出单次实际 prompt 时，已实现 metadata-only 分层整理，并保留每项到原始 unit aliases、Source/revision/order 和已验证正文的既有绑定。小输入直接单次规划；分层限制为 4 层、64 次分组调用、2000 个累计输出项，仍受 500 raw row、公共响应和父任务预算等原门禁约束。
- 初始两类 batch 为 47 tests / 46 passed / 1 failed；唯一失败方法随后 attempt 4 单独 1/1 通过。attempt 2、3均为新增 fixture/断言问题，最终在三次后由主模型裁决修正；没有第二次完整47项全绿。唯一 reviewer BLOCKER=0 / IMPORTANT=0 / OPTIONAL=0。当前不能据此声称任意规模、语义无损、部署完成或真实 Provider/GUI 验收通过。实现、验证与 review 报告位于 `D:/Temp/auralis-overview-m3-planning-20261019/`。
- 用户已确认未正式部署版本无需保留兼容；待项目最终整合时执行一次统一兼容清理门禁，盘点并移除服务端与端侧不用版本的兼容代码、旧格式 fallback、兼容专用测试和文档，同时保留有效数据、幂等、权限、修订及预算安全规则。本阶段不提前做全仓清理。

### 2026-10-19 Overview M2 实现、验证与复审结论

- 稳定节点身份、V34 metadata、chunk 级解析来源快照与 PC 写入接线已实现。PG integration 4/4、V34/V33 migration 与 rollback 覆盖通过；PC focused M2 27/27。早期 durable alias、历史 receipt、PG namespace、时间精度问题均已按失败类定向修复。
- 最终 attempt13 OpenAPI 测试 13/13，官方 artifact SHA-256 `660b28e4a0e527d8779b9b7009ad31801b4e0e9c501489f40b7192f4e802c1b0`；PC/Mobile SDK 7.13.0 byte-identical，SHA-256 `9ae585615f8062cdb8d9a8b0b43a19a173701c9acd878df4d760d040cebd0002`。PC type-check/build 与 repackage 通过；Mobile type-check 仍有既有 `EventRequest`/`EventResponse` 两个 TS2339。全量 backend 723/1F/4E/0S 后失败类分别定向通过，未重跑 full。PC R4 首轮 737/709 pass/28 fail，2 项 M2 修复后的 sync 文件 27/27，另 26 项基线失败未修。
- 唯一 reviewer 最终结论 BLOCKER=0 / IMPORTANT=0 / OPTIONAL=0，报告见 `D:/Temp/auralis-overview-m2-20261019/reviewer-final-report.md`。四个 nullable reference 已在真实 OpenAPI 与 SDK 中表达为可空联合。Overview JSON 生成与复杂资料语义质量风险保持开放；来源 provenance 只记录输入关联位置，不证明内容逐句正确。未部署，真实 Provider、业务数据库和 GUI 验收未完成。

### 2026-10-19 内容规模自适应总览 M1 当前边界与开放风险

- M1 源码、自动门禁与唯一复审完成：focused 7 suites/175 tests、full 122 suites/711 tests，均 0 failures/errors/skips；review correction delta B0/I0/O0。M1 的单次有界目录请求是当时的实现边界，现已由 M3.1 有界 metadata 层级规划取代；active raw rows 仍最多 500（含空白），超限在完整 identity/hash/provider 前拒绝。
- M3.1 已完成有限层级 metadata 规划、相关验证和唯一复审；分层边界以外仍明确失败，不支持任意规模或语义无损。M3 持久后台 jobs、暂停/恢复及发布尚未交付。
- M1 不包含 durable job/partial-progress API、稳定节点/locator、跨任务增量复用、部署或真实 Provider/GUI/语义质量验收。结构校验、引用 ID、锚点或 checkpoint 不证明语义完整。既有 2026-10-16 Overview JSON 生成根因仍开放；复杂来源质量样本留待后续验收。
- 验证与审查证据：`D:/Temp/auralis-overview-adaptive-20261018/`。中间环境、导入与 harness 重试仅作为历史记录，不代表最终候选门禁失败。

### 2026-10-16 Overview JSON 失败诊断增量（定向验证/审查通过；生成根因仍开放）

- validator 已新增仅失败路径的安全诊断字段，覆盖原响应/实际解析输入长度及指纹、包裹形式、有限 parser 分类、offset 字符类别及 task/generation 尝试上下文。`AiOverviewServiceTests` 与 `OverviewDynamicBudgetComponentTests` 共 92/92 通过；唯一 reviewer 对本次差量 B0/I0。代码未部署。
- 既有日志仅记录 Jackson 错误类型与位置，无法回溯具体语法错误。新诊断只支持下一次实际运行归因，不会修复 Provider 生成。之前的统一用量 JAR 不含本次诊断字段；需从当前源码重建后端并在新失败样本上确认根因。完整验证和审查记录见 `D:/Temp/auralis-overview-json-diagnostics-20261016/validation-report.md` 与 `code-review.md`。

### 2026-10-16 AI 统一限额（代码审查与自动门禁通过；运行态验收开放）

- U1–U4 的 53 项候选包含统一 operation policy、可信逐调用来源、V33 账本字段、平台额度与 all-origin 审计分离、来源化 usage API、Overview 预检分流及 Chat↔Overview 真实 PostgreSQL 共享额度竞争。候选未部署，来源分流没有运行态证据。
- Candidate53 聚焦并发测试 7/7；完整 suite 121/690/0F/0E/0S，package 均自然退出 0。PostgreSQL 锁与跨功能竞争 5/5、migration 1/1；runtime OpenAPI/SDK/check 各 exit 0，artifact tests 12/0/0/0。
- 唯一 reviewer 最终结论 B0/I0/O0，报告 SHA-256 `D4CD78B7B5023B2B98A39A06377C8CD50C3FA3461038E6F3B48247C62352BEF8`。最终 JAR SHA-256 `CB0D89F5AFE392E316A7EB9AC919D2DCDF81AF0714DCE69CED8340725DBB1EC5`；517 项冻结输入及运行后卷哈希一致，516 项 live workspace 与独立 TLS 核对一致。
- final2 曾报告级联删除并发测试失败；根因是测试在父事务取得行锁前启动子调用，并 stub 了未实际触发的 `save`。仅修复测试门闩与实际 `saveAndFlush` hook，保留锁等待、`RESOURCE_NOT_FOUND` 和无活动子资源断言；candidate53 聚焦 7/7 与完整 suite 均通过。此前资源中断和失败尝试留在验证报告作历史记录，不构成当前阻塞。
- P2-AI-Unified-Operation-Policy 的源码、契约、自动验证与审查条件已满足。仍待部署授权及真实 Provider、生产业务数据库、GUI/真机与业务流程验收；R1 动态负载预算仍按计划作为后续研究风险。
### 2026-10-16 跨功能 AI 操作策略（计划依赖开放）

- **P2-AI-Unified-Operation-Policy**：U1–U4 源码、定向/完整自动验证、PostgreSQL 并发、API/schema 生成检查和唯一静态 reviewer 均已完成；当前无未解决 BLOCKER/IMPORTANT。最终完整 suite 为 121/690/0F/0E/0S，package exit 0。早期中断/失败尝试保留在验证报告中，当前不再有 C 盘专项观察待办。部署、真实 Provider、生产业务数据库、GUI/真机及业务验收另行处理。
- 源码候选保留原 4608/6144 输出边界、共享运行容量、embedding 窗口豁免、历史 NULL 来源保守计平台和 Overview 根预算/去重/有限恢复。实际 taskId 查询与来源使用已接入候选。回滚旧二进制将恢复旧混计限制；迁移加列不回填历史，不通过删列/清账本回退。来源分流没有部署或运行态证据。
- R1 风险仍开放：现有预检是单请求级，Overview 总调用受输入和响应/恢复影响。本期只把平台费用预检按来源分流，保留 BYOK 的内容/context 检查、有限恢复、去重、deadline 和取消，不将费用 cap 替换成 BYOK 通用执行 cap。后续预算动态化与公平性分析按真实运行证据另案推进。

### 2026-10-16 学习 Agent 设计评审与前置依赖（计划已编制；实现风险开放）

当前没有贯穿学习目标、带学对话、互动练习和大纲进度的完整 Agent 流程。[设计](../../design/2026-10-16-learning-agent-design.md)已按用户书面意见修订，并由主模型形成[实施计划](../../plans/2026-10-16-learning-agent-implementation.md)。设计的非 embedding 补查、确定性触发、步骤/状态、草稿预算、上下文裁剪和安全策略不代表已经实现。

- **P1-Learning-Agent-Prerequisites**：现行大纲仅整体版本、PC 节点 ID 未持久化；普通 KB POST 重试会新建，需沿 PC Core Sync 固定资源/mutation ID；KB create 不创建 Review state。证据为 OverviewDtos/ResultEntity、useKnowledgeStore、SyncMutationProcessor、KnowledgeBlockService/ReviewService 的只读核对。处理：按计划 Task 1/2/6 实施身份、持久完成状态与同步桥接。关闭条件：真实 PostgreSQL/本地事务的幂等与恢复测试通过，完整学习闭环和正式 Review 衔接分别验收。当前开放，未修改这些源码。
- 本轮唯一只读计划审阅 B0/I0/O1：普通 Chat list/get 隔离与 identity 清理端口两项 IMPORTANT 已补入计划；O1 为 superpowers 技能名前缀，保留。该结论仅针对文档及其边界一致性，不关闭上述实现风险。文档检查通过，真实模型、迁移、运行态和 GUI 未验收。

### 2026-10-16 离线 usage reader 的 shadow 缺行计数歧义（最小修正完成；只读审查 B0/I0/O2）

| 范围 | 当前证据 | 状态 |
| --- | --- | --- |
| Summary counter | 旧 `unknownUsageCount` 合并 missing shadow、歧义 event/ledger ID 与 matched event usage unknown，曾被误读为 ledger actual usage unknown；最小修正新增 actual complete/unknown 与独立 shadow coverage 计数。Identity-mismatch 等其它 join issues 仍单独列出。 | 合成测试 29/29；46 ledger/7 events 得 actual 46/46、shadow missing 39；保留 legacy counter 兼容。 |
| 计量和准入边界 | actual 只按无冲突唯一 dispatched ledger 的两个 nullable token 字段判定；不从 event 补值。 charged、误差算法、accuracy membership、INCOMPLETE/exit 2、API/DB与准入未改。 | 只读 reviewer：BLOCKER=0 / IMPORTANT=0 / OPTIONAL=2。报告：[review-report.md](D:/Temp/auralis-usage-research-20261016/review-report.md)，SHA-256 `1B80A6F1D381A6DC5F4FB1D5FADEF6E1E46E2174B3665CCB107EA3CAE190EBB0`。离线 CLI 可独立运行，不依赖容器部署；本轮未部署服务，也未减少真实 Provider 消耗或完成校准。 |
| 保留的 OPTIONAL | 外部研究报告有一处 “39 Source MAP/REDUCE charged-share”文字误植；39 是 shadow 缺行数，token ratio 143,746/219,928=65.36%正确，本轮不修改该报告。RED 只有研究报告的过程记录，没有独立原始测试日志或 before 源码快照；GREEN 命令/退出码/29/29 记录在 `D:/Temp/auralis-usage-research-20261016/command-record.txt`。 | 两项均按 reviewer 结论保留；没有补造 RED 日志或重跑测试。 |

### 2026-10-16 RAG 后置定义未进入模型证据（代码与定向回归已修复；真实回答待验收）

| 范围 | 当前证据 | 状态 |
| --- | --- | --- |
| 长 chunk 的 citation/model 证据 | citation 与 PromptAssembler 共用 `RetrievalService` 的前 400 字符摘录；定义在 chunk 后段时不会进入这条证据。 | 已实施 query-aware 有界摘录：识别通用定义/含义问题焦点词，优先选择邻近证据线索的连续原文窗口；未匹配回退前缀，仍限制 400 Java 字符。 |
| 来源和资源边界 | 过滤、排序及实际 Provider prompt 没有为历史 turn 持久保存完整 trace，故不能倒推出模型当时是否实际看到目标 chunk。 | 保持 owner/active/revision/scope 过滤、filter-before-TopK、TopK=8、12000 prompt 上限与 Chat 两次调用预算。21/21 定向自动测试通过；真实 Provider 回答质量和 GUI 尚未验收。 |

### 2026-10-15 PC Overview 离线冲突刷新重入（本轮最小修复已验证）

| 范围 | 当前证据 | 状态 |
| --- | --- | --- |
| 重入入口 | 静默 Subject/LOCAL 自动解析在运行时刷新缓存时，仍为 `CONFLICT` 的缓存会再次进入 resolver；FILE 和显式选择不属于该递归入口。 | 仅 Subject/LOCAL/silent 自动路径按 user/device/scope/revision 做 in-flight 合并并在 runtime 初始化前登记；FILE 与其他 choice 保持原调用方式。生产尾部刷新只发生在成功 resolve 后。 |
| 离线与冲突数据 | API 对 404 保持既有 `null` 语义，连接错误仍由同步服务抛出；本地冲突内容应继续可见。 | 受控回归验证初始化与模拟尾部重入只触发一次离线读取、保留本地冲突及后续显式重试；失败尾部刷新只存在于测试回调模型，不代表生产失败分支行为。未改 404、鉴权或冲突解决策略。 |
| 上下文隔离 | 旧 resolver 可能在登录、学科、文件修订或组件生命周期变化后完成。 | resolver 进入和每个异步操作边界检查身份、挂载状态、学科及文件 revision；同步回归/UI 检查 43/43，`vue-tsc` exit 0。FILE 并发 choice 不由新 guard 串行化，也未声称其无竞态。真实断网恢复和桌面 GUI 尚未验收。 |

### 2026-10-15 PC 文件登记上传弹窗进度生命周期与状态卡死修复（已通过自动化测试与类型检查，GUI 待验收）

| 范围 | 当前证据 | 状态 |
| --- | --- | --- |
| 弹窗进度真实性与防假完成 | `FileRegisterDialog.vue` 引入 `isCompleted` 双重校验，移除虚假 86% 进度上限，仅在底层完全成功时显示“导入完成”。 | 代码已实施。 |
| 阶梯进度与失败状态清理 | `SubjectWorkspace/index.vue` 与 `Asset/index.vue` 划分生命周期各阶段真实进度；catch 块显式重置 `uploadProgress.value = 0`，杜绝弹窗卡在 100%。 | 代码已实施。 |
| 自动化回归与类型守卫 | `scripts/r4-register-file.test.mjs` 增补断言，全量 6/6 通过；`vue-tsc -b` 0 报错。 | 自动化通过；真实桌面 GUI 待验收。 |

### 2026-10-15 PC 学科大纲编排独立性保证（已通过自动化测试与类型检查，GUI 待验收）

| 范围 | 当前证据 | 状态 |
| --- | --- | --- |
| 学科大纲编排初始状态独立性 | `SubjectWorkspace/index.vue` 在学科总览未生成时，不再从单文件大纲自动拷贝填充到学科大纲；保持独立新建章节（`第一章 · 新建章节`）。 | 代码已实施。 |
| 自动同步覆盖守卫 | 移除 `watch(fileOverviewItems)` 中单文件大纲覆盖学科大纲的触发逻辑。 | 代码已实施。 |
| 自动化回归与类型 | `scripts/r4-subject-overview-ui.test.mjs` 增补独立性断言，17/17 通过；`vue-tsc -b` 0 报错。 | 自动化通过；真实桌面 GUI 待验收。 |

### 2026-10-15 AI 观测前置 Step 2（定向、full/package 与最终复审通过）

| 范围 | 当前证据 | 状态 |
| --- | --- | --- |
| Shadow flag / Compose | `.env.example` 和 Compose 显式透传；synthetic config render 的 true/false 均 exit 0。运行容器实际取值未核对。 | 代码与定向验证完成；部署未验收。 |
| Returned model identity | 内部 Provider 响应 metadata 与 Gateway 安全字段区分 request / observed model；缺失、非法、冲突不回填。identity/config/gateway/security 定向共 39/39。 | 代码与定向验证完成；未发真实 Provider 请求，实际模型身份仍 UNKNOWN。 |
| Offline usage reader | Node CLI 按 reservation UUID 对齐；NULL actual 保留 unknown，charged 与 actual 分开，重复/冲突/缺行进入安全 issues/quarantine。最终 synthetic 测试 27/27，CLI fixture 结果 COMPLETE。 | 工具与合成验证完成；没有生产样本，未校准。 |
| Fresh full backend gate / package | D 盘统一快照 116 suites / 674 tests / 0 failures / 0 errors / 0 skipped，Maven 与 launcher exit 均为 0；116 XML + 116 TXT 已保留，Guard lock PostgreSQL 4/4。同快照 package exit 0，JAR SHA-256 `723919B7517A21B7A1C458F8708B3E6BFDE1E70DCF2D3478A45BA2894204A236`；508 项 manifest 无差异。 | 自动门禁、package 与唯一 reviewer 复核已通过（B0/I0/O3）；三项 OPTIONAL 保留。首次因 C 盘空间未运行及后续 runner 中断/失败轮次见 [attempt 4 报告](D:/Temp/auralis-ai-observability-step2-20261015/final/attempt3-pg-auth-fix/attempt4-report.md)，不覆盖为失败源码证据。 |

此前限定 reviewer 对 Step 2 实现文件为 BLOCKER=0 / IMPORTANT=0 / OPTIONAL=2；唯一最终 reviewer 对 Step 2 与 attempt 4 gate 为 BLOCKER=0 / IMPORTANT=0 / OPTIONAL=3。三项均未修改：所选本地日志在大小拒绝前完整读取；TEMP 离线报告的输入前缀文字未同步后附兼容说明；临时 runner console 把 launcher exit 显示为 Maven actual exit（结构化 gate 仍单独核对两者且 attempt 4 数值一致）。没有生产 API、schema、migration、预算算法或限制变化。部署、真实 Provider、model capability、生产 usage/校准及 GUI/业务验收仍待完成。证据：[backend/Compose](D:/Temp/auralis-ai-observability-step2-20261015/backend-compose-model-observation-report.md)、[offline CLI](D:/Temp/auralis-ai-observability-step2-20261015/offline/report.md)、[attempt 4 full/package](D:/Temp/auralis-ai-observability-step2-20261015/final/attempt3-pg-auth-fix/attempt4-report.md)、[最终 review](D:/Temp/auralis-ai-observability-step2-20261015/review-report.md)（SHA-256 `519A055B986F8BD044556DE45DE486454DD59FB2F4D27C4BBB87A57D76D657EC`）。

### 2026-10-15 四项历史 full-gate 问题与最终关闭状态（round4 于 2026-10-14 通过；仅留 O1 optional）

| 项目 | 处理与证据 | 状态 |
| --- | --- | --- |
| Completion retry fixture | 用 owned claim 的两次真实 `fail()` 中间经 `claimById()` 重新领取；下限路径为 `attemptCount=2/failureCount=2`，保持 PENDING，未终结 Source。三次过期 lease 的耗尽路径仍由现有用例验证。修正后 `IngestionCompletionServiceTests` 9/9，完整 backend 115 suites / 666 tests 通过。 | 已关闭；未改生产 retry / counter 策略。 |
| Account deletion `requestedAt` 往返 | 固定应用 Clock，测试按 PostgreSQL / pgJDBC `TIMESTAMPTZ` 微秒精度验证 round-trip 和 360 秒 grace；实际 PostgreSQL 定向 5/5。 | 已关闭；reviewer 保留最多 1µs response/storage 差异为 OPTIONAL，未改 API 或生产时间归一化。 |
| Embedding resume quota 断言 | fixture 改为验证当前 `INGESTION_EMBEDDING` / `RETRIEVAL_EMBEDDING` 窗口豁免及 checkpoint resume 行为；真实 PostgreSQL 定向 2/2。 | 已关闭；未调整额度政策。 |
| Knowledge / review 静态模块环 | 唯一 UTF-8 SHA-256 helper 移至 `knowledge`，知识块和 review 共用该实现，仅保留 `review → knowledge` 依赖；hash / review / architecture 定向 19/19。 | 已关闭；唯一 reviewer 对四项整体 B0/I0/O1。 |

Round 3 full 还暴露两类测试运行问题：四个 `AiOverviewServiceTests` 反射 fixture 错选 20 参数 canonical constructor，四处改为显式 8 参数构造器后 76/76；两项 SlowDrip errors 由 runner 未复制 synthetic TLS keystore 引起，补齐后 3/3。它们均未要求生产行为修改。最终 round4 在 `Auralis-Server` 统一快照 115 suites / 666 tests / 0 failures / 0 errors / 0 skipped、Maven exit 0；独立 package exit 0。round2 中断、round3 errors、round4 前置参数解析失败均保留在各自 evidence 目录，不与最终计数混合。

最终 reviewer 对四项修复及相关 fixture follow-up 为 B0/I0/O1。O1 只涉及最多 1µs response/persistence 精度差，当前契约未要求完全相等，保持未改。最终命令、manifest、XML/TXT 和逐轮归因见 [round4 报告](D:/Temp/auralis-remaining-four-fix-20261014/final/round4/report.md) 与 [review 报告](D:/Temp/auralis-remaining-four-fix-20261014/review-report.md)。真实 Provider、模型清单、部署、GUI 和业务验收未进行。

### 2026-10-14 四项 full-gate 失败审计原始记录（唯一 reviewer B0/I1/O1；后续已关闭）

本次只复核四个已知历史失败样本，没有重跑 full gate，不能据此断言当前仅余四项。此前 full clean 的 114 suites / 659 tests / 5 failures / 1 error / 4 skipped、exit 1 保持为历史结果；migration/Jackson 两项既有定向修正及 PostgreSQL lock tests 独立 4/4 事实不变。

| 项目 | 根因与生产影响 | 建议的最小处理 | 本轮证据与状态 |
| --- | --- | --- | --- |
| `IngestionCompletionServiceTests.retryExhaustionUpdatesCurrentSourceAndJobTogether` | Fixture 把 `claim()` 次数当失败次数；只增加 `attemptCount`，`failureCount` 仍为0，故 `failExhausted`正确返回 false。普通失败与过期 lease 会增加 failure count；quota defer 不增加。当前 Source 与 job terminalization 共享 `@Transactional` 调用链，但真实数据库回滚原子性未验证。 | 经单独授权后修 fixture，使用真实过期 lease/failure 生命周期累计至阈值，断言 `attemptCount` 与 `failureCount`，保留低于阈值及配额边界测试；不改生产计数或 retry policy。 | canonical RED 1 test/1 failure；scratch fixture GREEN 后合并 `IngestionCompletionServiceTests,AiIngestionJobTests,AiIngestionWorkerTests` 34/34、exit 0（mock repositories/services，非DB rollback证明）。生产缺陷未证实；测试门禁仍需修正。[报告](D:/Temp/auralis-remaining-four-audit-20261014/completion/audit-report.md) |
| Account deletion `requestedAt` PostgreSQL round-trip | Test 的 fixed `Clock`未被显式 `@SpringBootTest(classes=AuralisApplication.class)`加载，并期望 truncate；当前 pgJDBC 42.7.11 与 PostgreSQL `TIMESTAMPTZ` 微秒精度按边界舍入。固定 request/replay 保持360秒 grace；response 与 replay最多相差1µs，API 没有 exact equality 契约。 | 如需关闭测试红项，显式装载固定时钟并按实际微秒精度断言；只有将来契约要求 response/replay精确一致时，才考虑 persistence前规范化。 | 原 PG测试 1 failure；`.432415400`通过，`.432415500/.501/.600`与跨秒边界失败；固定 request/replay 1/1通过。Review判为测试前提问题，差异为 OPTIONAL 一致性强化。[报告](D:/Temp/auralis-remaining-four-audit-20261014/postgres/audit-report.md) |
| `AiIngestionResumePostgresTests` embedding hourly quota assertion | `INGESTION_EMBEDDING`明确豁免 user-hour/day 与 global-day窗口；原 fixture期待小时预算触发 defer，但真实 worker在一次 attempt 内完成34项并激活全部 chunks。Task预算、call cap、并发和 reservation ledger仍有效。 | 更新过期 fixture以验证窗口豁免；defer/resume覆盖使用真实非豁免限制，例如 user concurrency。保留 failureCount=0、checkpoint和同 generation行为，不放宽预算。 | 原 PG fixture 1 failure（预期PENDING、实际READY；两笔 embedding reservations 32,400/7,560，34 active）。真实 PG Guard/Gateway/Worker concurrency控制 1/1通过：先由测试准备并checkpoint 27项，实际拒绝不产生新 reservation，之后仅补7项并完成34项；不是自然首次attempt的27→拒绝路径。[报告](D:/Temp/auralis-remaining-four-audit-20261014/postgres/audit-report.md) |
| `ArchitectureTests.verifiesApplicationModules` | 真实静态模块环 `knowledge → review → knowledge`，唯一反向边为 `KnowledgeBlockService.update` 调用 review 的纯静态 `ReviewContentHash`。Reviewer确认这是 architecture gate IMPORTANT；未证明 Spring Bean 构造环、死锁或数据损坏。 | 将唯一 SHA-256 helper 归属 knowledge 模块，保持 UTF-8、SHA-256、小写hex算法和既有事件/字段/锁序，不复制算法或豁免模块规则；补固定 Unicode hash vector。 | `mvnw.cmd -B -ntp clean test -Dtest=ArchitectureTests#verifiesApplicationModules` exit 1，1 test/1 error；只做静态模块图测试，未启动应用或执行改动后回归。IMPORTANT仍开放，尚未修改。[报告](D:/Temp/auralis-remaining-four-audit-20261014/architecture/audit-report.md) |

审计报告的 hash、逐阶段命令/XML、实际完整 quota ledger、review边界与未覆盖内容汇总于 `D:/Temp/auralis-remaining-four-audit-20261014/audit-summary.md`。本轮未改 production/test，也没有关闭 architecture gate；模型/Provider、部署及GUI业务验收另行记录。

分项证据：[completion](D:/Temp/auralis-remaining-four-audit-20261014/completion/audit-report.md)、[PostgreSQL timestamp 与 quota](D:/Temp/auralis-remaining-four-audit-20261014/postgres/audit-report.md)、[architecture](D:/Temp/auralis-remaining-four-audit-20261014/architecture/audit-report.md)、[唯一 reviewer](D:/Temp/auralis-remaining-four-audit-20261014/review-report.md)。

### 2026-10-14 既有migration/Jackson测试失败修正（历史定向关闭记录；full gate当时尚未重跑）

- `TaskColorRemovalMigrationTests` 的latest migration断言从旧V21更新为当前V32，保留fresh-schema检查、V20升级数据保留及malformed input覆盖。`AiQualityFixtureContractTests` 将Jackson databind imports迁至Jackson 3 `tools.jackson.databind`，断言保持。`JacksonNamespaceGuardTests` 允许Jackson 3仍保留的准确`com.fasterxml.jackson.annotation`包，其它Jackson 2 namespace继续禁止。仅测试文件变更，无生产DTO、依赖、schema、API或配置变化。
- 初始三类定向GREEN为11 tests（migration 6、guard 2、fixture 3），exit 0。Reviewer首轮发现guard对合法whitespace import格式的遗漏（IMPORTANT I1）；加入tab/缩进、static和换行格式回归后单独重跑Guard 2/2、exit 0，reviewer接受关闭，最终B0/I0/O0。初始11项与I1后2项是两次不同验证，不相加；migration/fixture hashes在I1修复后未变。
- 原full clean gate历史数据仍为659/5 failures/1 error/4 skipped、exit 1；本轮没有重跑full。此次仅关闭migration版本和Jackson guard/fixture相关两项；剩余4个baseline failures/errors仍未处理，整体退出条件未满足。旧4 skips另已通过`AiUsageGuardPostgresLockTests`隔离PG 4/4补跑，但不改变历史统计。

### 2026-10-14 AI 执行预算治理（阶段0–3实现与定向验证历史记录；当时完整门禁未通过，后续 round4 已通过）

- 安全拒绝诊断已覆盖 `USER_CONCURRENCY`、`GLOBAL_CONCURRENCY`、`TASK_CALLS`、`TASK_TOKENS`、`USER_HOURLY`、`USER_DAILY`、`GLOBAL_DAILY`，仅暴露固定字段和事务内现有数值；原拒绝 code/status/retry/reset、无 reservation 拒绝、锁序、事务及 embedding 豁免保持。影子估算不参与 reserve/context/准入。
- 当前影子估算为 `char-category-v1-uncalibrated`；62项诊断/预算回归与8项 Chat 合成故障回放通过。没有生产 usage 样本，因此校准状态仍未完成；不能由合成样本宣称已校准或替换既有估算。
- `AURALIS_AI_OVERVIEW_OUTPUT_RECOVERY_ENABLED` 默认 true；false 只关闭本轮 truncation split / JSON repair，semantic/no-progress 保留。latest Recovery + Overview 定向为 101/101，focused PostgreSQL replay 1/1；真实 PostgreSQL Coordinator/Gateway/Guard/SQL reservation ledger 覆盖同 generation/task 重试、成功子结果复用、精确 transition 与同轮重复 group，Provider registry 使用合成响应。唯一 reviewer 最终 BLOCKER=0/IMPORTANT=0/OPTIONAL=0，先前 I1 framing、I2 Subject/REDUCE 实证和 I3 checkpoint replay/transition 问题均有针对性修复与验证。
- profile-corrected 完整 clean test 为 114 suites / 659 tests / 5 failures / 1 error / 4 skipped，实际退出码 1；独立 `package -DskipTests` 为 BUILD SUCCESS、退出码 0。实际 HEAD 对照复现了全部6个失败/错误：migration 版本断言21/32、两处 Jackson2 namespace、ingestion completion 断言、PostgreSQL timestamp +1µs、embedding window exemption 与 ingestion resume 测试预期冲突、knowledge↔review 模块依赖环。`IngestionCompletionServiceTests.retryExhaustionUpdatesCurrentSourceAndJobTogether` 中三次 `claim()` 只增加 `attemptCount`、`failureCount` 仍为0；`failExhausted` 遇 `failureCount < 3` 返回false，Source/job FAILED保存分支未运行，故不是同步回调或事务失败。首次运行多出的 AiConfiguration worker 默认值失败由全局 test profile 污染归因；无 global profile 的修正验证4/4，final config相关7 tests passed。
- 全量4个 skip 均在 `AiUsageGuardPostgresLockTests`：`@BeforeEach` 只读取进程环境变量 `AURALIS_TEST_POSTGRES_URL` 并据此作 assumption，而 full runner只给 `auralis.usage.postgres.url` JVM property，前置条件不满足。补充定向命令 `mvnw.cmd -B -ntp clean test -Dtest=AiUsageGuardPostgresLockTests` 在隔离PG上 exit 0，4 tests / 0 failures / 0 errors / 0 skipped；覆盖用户禁用/账号删除与 reservation、dispatch、task admission锁序。独立补跑不将完整clean统计改成659/0/0/0或663项，也不改变完整clean gate未通过的结论。完整clean gate仍未通过，不能因失败可在基线复现或定向skip补跑通过就标记为通过。
- 模型配置观测不等同于真实模型列表盘点：`deepseek-chat` 上下文及未列入可信精确白名单的能力保持 unknown。DeepSeek thinking disabled 只适用于 structured Overview 的已验证 wire body；普通 Chat 不作该声明。
- 影子 estimator `char-category-v1-uncalibrated` 默认只观察，回退 `AURALIS_AI_SHADOW_TOKEN_ESTIMATE_ENABLED=false` 不改变旧 UTF-8 reservation/context/guard。没有生产 usage 样本，合成 usage 对照不是校准结果。硬限额仍为 Overview 24 calls / 524288 tokens 与 Chat 2 calls；模型能力未知不推测，DeepSeek `thinking=disabled` 仅限 structured Overview wire 请求。API DTO、数据库 schema、迁移均未改变；未调用真实 Provider、部署或做 GUI/业务验收。
- 复审包 SHA-256 `D7C5637FA73F20512591D1AF4732E90BFEF35656874B014A056614A49E9FD143`；完整门禁与 HEAD 归因见 `D:/Temp/auralis-ai-governance-20261014/final/report.md`。计划整体退出条件（完整 clean test 通过、模型列表人工核对等）仍未满足；不得把 reviewer 通过或 package 成功写作整体验收通过。

### 2026-10-13-PC-Subject-Overview-Regeneration-Conflict-Prompt（已完成；自动测试通过，GUI待验收）

- 用户反馈：“学科总览重新生成的时候不用问用户是否保留原版，默认更新就好了，不用弹提示”并截图指定移除“云端版本已变化，本机总览仍保留。 [保留本机并上传] [采用云端]”。
- 影响范围与改动：
  - `Auralis-PC/src/components/subject/SubjectOverviewSection.vue`：移除冲突提示条与二选一操作按钮；
  - `Auralis-PC/src/views/SubjectWorkspace/index.vue`：学科总览手动重新生成结果不再触发 `ElMessage.success('已更新')` 等全局 Toast；存在冲突时自动静默采用本地版本同步（`resolveSubjectOverviewConflict('LOCAL', true)`）；
  - 保留 `FileOutlineList.vue` 的分文件总览既有冲突与重试行为不变。
- 门禁：`vue-tsc -b` 通过；`scripts/r4-subject-overview-ui.test.mjs` 与 `scripts/r4-overview-sync.test.mjs` 共 38 项测试通过。

### P1-AI-Overview-SelfPair-False-Rejection（代码与自动验证关闭；指定 P4 完成，部署/GUI待验收）

- 已实现：合法中间 JSON 的 5200 字符软目标与实际消费者完整 prompt 检查分离；真实组合执行语义分包/有界恢复，并细分 prompt hard-budget、截断和恢复耗尽错误。原有 12000 字符 prompt、4608/6144 输出、Gateway 用量/调用数、取消及 task deadline 仍有效。V32 coordinator 已接入 Service。
- 自动集成证据：最终需求核对后 fresh backend 门禁 20 suites / 210 tests，0 failure/error/skip，test/package exit 0；包含 clean/V31→V32 PostgreSQL、request replay、claim/fence/takeover、预算 lineage、checkpoint/hash/expiry、六类跨实例用量错误、Gateway、HTTP/SSE映射与deadline/cancel。数据库测试仅Testcontainers。P4 TEMP composition/reader 4/4、只读precheck通过；真实两条生成链结果见计划。
- 现行 request mapping 只保证规范化有效 UUID 的 replay；缺失/空白/非法 ID 由服务端生成新 UUID。14 天只清理成功 response payload；request mapping/generation/budget metadata 保留，旧 ID 不可复用。失败 lineage 保留并由新有效 request ID 继续累计；recovery_count generation 累计、recovery actions 安全集合去重。
- 唯一 reviewer 首审 B0/I1/O0。I1 已最小修复：私有 V32 保存安全 `error_status` / `error_retry_after_seconds` / `error_reset_at`，fenced提交，接管/成功清除；Service恢复原 `AiUsageLimitException`，公开DTO不变。旧实现六种跨实例用量错误RED，新实现GREEN；HTTP/SSE映射另有类型组合证据。原reviewer复审因工具线程上限不可调度，执行代理也遇用量限制；主代理检查完整修复diff和208项证据后关闭I1，剩余B0/I0/O0，不冒称第二次独立review。
- 指定P4已实际完成：Source ALL / 单输入Subject ALL分别9/1 calls、69.595/6.414s，60,035总charged，活动预留/租约0，未触发额外恢复。主要正文主题初步覆盖；金额账单、普遍成功率、真实恢复/取消、多文件Subject、PC GUI、正式保存仍未验收，不能由本次成功替代。2026-10-13 03:34:43 首次只读观察 backend 镜像 `sha256:f0c3e886175dadd709876988c7570a395793ae67a637545cbe5825a570317593` healthy 且 Flyway V32 `success=true`；其后用户更新镜像并 retry。各次运行镜像 class/source provenance 未核验。
- 当前实现、命令、审查限制与真实评估证据见[实施计划](../../plans/2026-10-12-overview-dynamic-budget-recovery.md)。

### P1-AI-Subject-Overview-Map-Json-Validation（运行态业务生成中断；原因待定位）

- 影响：用户这次 Subject ALL 生成以 `MODEL_PROVIDER_ERROR` 中断，generation FAILED 且无结果；故障具体拒绝原因待定位。本次只读证据未证明 frozen parser/validator 存在 correctness 问题，不登记为已确认代码缺陷。
- 用户日志 request `5c927548-22b0-4bac-bba9-4cb4f0c3b544` / generation `18226745-50bc-4ce9-be30-97cf8c61f57c`：MAP1 解析/schema 成功并记录一个 checkpoint；MAP2 `responseChars=5076`、`outputTokens=2511`、`finishReason=stop`，进入 JSON 相关 validator 后以 `MODEL_PROVIDER_ERROR` 失败。`stop` 不证明内容是合法 JSON；日志无 provider 原文、准确 Jackson exception type 或行列位置，现有证据不足以证明 frozen validator 有 correctness 问题，故本轮不改 parser 或 validator。
- 主代理只读确认该 generation 为 FAILED、无结果；reservation 通过 `AiUsageGuard.stableOverviewTaskId(userId, SUBJECT_OVERVIEW, budgetTaskId)` 映射后查得两笔 DEEPSEEK `OVERVIEW_MAP` 调用均为 `COMPLETED`、已派发，实际 input/output 分别为 4,672/2,619 与 4,502/2,511，charged 分别为 7,291 与 7,013，合计 14,304；usage 完整、unknown dispatch/活动 reservation 均为 0。TASK 锁 current_task_id 留存，但 owner/lease 为空。
- 已按相同 generation 实际进行一次 retry；MAP1 的快速成功和无出站请求的阶段序列支持 checkpoint 复用，但没有显式 hit/restore phase。后续只定位安全可证的 validator 拒绝原因（异常类别、行列/偏移或拒绝分类），不读取/记录响应正文，不自动修复 JSON，也不建议无界重复 Provider 请求。
- 2026-10-13 后续 retry 已实际进入同 generation：MAP1 约6ms内成功且之前无该阶段 Provider request，DB `recovery_count=1`、checkpoint count=5；这一运行序列支持 checkpoint 复用，但没有显式 hit/restore phase。MAP2/MAP3 与 REDUCE round1 成功，round2 再次在 JSON_PARSE 失败；generation 仍 FAILED、无结果。累计7笔调用均已结算，input/output/charged 26,627/16,894/43,521，unknown/active reservation及锁租约均为0。安全日志没有准确 Jackson 原因或响应正文，不能关闭本项，也不据此确认 validator 缺陷。
- 当前工作树已增加仅用于真实 Provider 响应 validation 路径的安全拒绝诊断：固定 reason、exception type 与 Jackson 位置（trim/fence 剥离后的 JSON 坐标），不记录消息/正文/字段值/path。此次定向回归 83/83、exit 0；旧 210 项全门禁早于该增量。该日志实现当时未由 Codex 部署；其后用户更新镜像并 retry，但后续请求在 Provider 响应 validation 前以 no-progress 结束，未验证诊断输出或运行镜像 class/source provenance。JSON 拒绝原因仍待定位，风险保持开放。
- 后续同 generation retry 在 `OVERVIEW_REDUCE_NO_PROGRESS` 失败。代码归因与用户运行序列表明 recovery compaction 在严格缩减比较前保存 checkpoint；同 purpose 重试会先恢复该合法但无缩减的输出，再本地失败。Service 的最小本地修复增加独立 full/partial compaction purpose，fresh 与 checkpoint restore 都要求输出严格短于输入，失败输出不会保存且错误码保留。真实 PostgreSQL Service 回归在同generation中插入旧 `REDUCE` step key 的 poison checkpoint：修复前重试命中旧 checkpoint 并再次 NO_PROGRESS；修复后保留该旧行而绕过它，普通 MAP/REDUCE 检查点复用，仅由 Gateway 增加受控压缩与最终调用后成功，generation/budget lineage 不变。相关 Recovery/Coordinator/DynamicBudget/Service/Gateway/cancellation 隔离门禁 141/141 通过；旧 210 项门禁早于修复。修复未部署。此项仍不能关闭 Subject JSON 失败风险：原 JSON 拒绝原因尚未定位，尚无同类用户请求的最终候选验收。
- 后续只读读取到 backend 镜像 `sha256:489106fe07a0c26f8da32884bc0e1aed858f680a9ecbd40bb638374f27369ebf` healthy、Flyway V32 成功；用户随后使用该运行态进行 retry。未验证镜像是否包含安全 validator 诊断或本地 recovery no-progress 修复；本执行器未部署/迁移。
- 首次归因执行器以 Postgres READ ONLY 事务查询，未调用 Provider、执行迁移/部署或重跑测试；随后本地 recovery 修复另有141项隔离门禁。命令、退出码与脱敏结果：[Subject MAP2 只读证据](D:/Temp/auralis-overview-dynamic-budget-20261012/validation/diagnostics/subject-map-json-20261013/readonly-attribution.md)；本轮修复证据：[recovery no-progress 报告](D:/Temp/auralis-overview-dynamic-budget-20261012/validation/diagnostics/recovery-no-progress-20261013/recovery-no-progress-report.md)。
- 关闭条件：在不记录 Provider 正文或密钥的安全诊断下确定 validator 拒绝类别/位置；随后取得同类 Subject ALL 的合法最终候选，并有实际 checkpoint 恢复续做的证据。不得仅凭 `finishReason=stop`、无 Provider request 的时序或代码路径预期关闭。

### 2026-10-12 聊天资料检索默认开启：代码与命令验证

- 后端新聊天常开检索，PC / Mobile / Tablet 移除关闭入口与请求开关，范围与 owner/replay 安全约束保持；当前文件未就绪继续等待处理，不因默认开启绕过门槛。额度未调整。
- reviewer 指出的同学科 READY 计数/高亮、已删除/跨学科选择残留和手动撤销末项时 PENDING 当前文件回退均用 RED 复现后最小修复；仍存在的未就绪选择保留。最终 PC 57/57、type-check / build，后端 47/47、OpenAPI/SDK 门禁，Mobile 24/24、static / H5 build 均退出码 0。唯一只读最终复核 BLOCKER=0、IMPORTANT=0、OPTIONAL=0。
- 既有门禁保留失败：PC static 退出 1，仅未改 Rust 固定本地地址规则；Mobile type-check 退出 2，仅 `reviewApi.ts` 缺少 `EventRequest` / `EventResponse`。同 HEAD 干净 archive 分别复现，非 RAG 修改引入，未扩改 Review 或 Rust。
- 真实 Provider、GUI/真机及部署均未验收；关闭运行态边界需要在新客户端与后端中确认范围标签、引用、无命中回答、检索失败和额度反馈。代码与审查不能替代该证据，见[实施计划](../../plans/2026-10-12-rag-always-on.md)。

### P1-AI-Subject-Overview-Aggregate-Prompt（IMPORTANT；代码、定向回归、审查与本机部署关闭，业务待实测）

- 证据：Subject 直接组合所有合法 outline / summary，在出站前以完整序列化 prompt 的 12000 字符上限拒绝；单源合法大输入与现场日志相同，preflight 成功后 `VALIDATION_FAILED` / cause null / Provider 0 次。当前服务端三源缓存按空 instruction 重建为 16631 字符，原始请求体未保留。
- 影响：各文件总览可用仍不能生成学科总览；PC 现行错误分类与 UI 将详情改为通用失败提示，用户不能识别 prompt 校验原因。
- 处理：仅 Subject 内部无损拆片 / 精确分包、同 scope 的有界归纳与既有 REDUCE；不放宽 prompt / 用量限制、不修改数据库或扩改前端。本次为明确 correctness 例外，已有 Source 流程保持。
- 关闭条件：合法单源 / 多源 / 三 mode / 转义及别名 / 取消预算相关回归、唯一只读审查、已测源码对应与文档回写通过；本机部署和真实 Provider / GUI 重试独立记录。[计划与证据](../../plans/2026-10-12-subject-overview-prompt-batching.md)。
- 最终语义片段按所选字段分配一次，规划时扣绝对期限；Subject 中间 MAP 沿原 compact 指令，最终单包不使用中间目标。新增有界 RED 及阶段 RED 对应修复后，全新编译 Surefire 73/73、源码 / class 证据通过，唯一 reviewer 0 B / I / O。最后 shell exit 丢失明确登记，不冒称 0；过时增量结果排除。运行与真实模型结果仍独立验收。
- 本机香港 13:57:23 仅 backend 更新为 `a5a50bb7…`，healthy / readiness 200、部署 Service 与已测 class 精确匹配；旧镜像保留。db / MinIO 与卷、Flyway V31、额度 / embedding Guard 保持。真实 Provider / GUI 重试是剩余业务验收，不能由部署健康代替。

### 2026-10-12 embedding 排除额度与单人测试策略（代码、配置与运行策略核对关闭；业务测试待验收）

- 需求：所有 ingestion / retrieval embedding 从用户和系统 token 窗口及本人展示中排除，历史 ledger 保留；单人小时 / 日默认提高到 1000000 / 2000000。
- 边界：按 stage 判定，普通聊天 / Overview / 连接生成仍计量；embedding 保留并发、有效账户 / 任务租约、资源预算、调用次数和字节上限。窗口已满或已超额不应仅因此拒绝新 embedding。
- 关闭条件：历史 settled / reserved 排除、普通生成拒绝、embedding 满额准入及并发 / cancel / expiry 回归；配置有效值、唯一只读审查和本机新 backend 运行态证据分别记录。实际 GUI / Provider 测试另验收，详见 [策略计划](../../plans/2026-10-12-embedding-quota-exemption-and-test-limits.md)。
- 自动证据：相关后端 53/53，最终新增 2/2 与其重叠；配置 6/6、Compose quiet 和 allowlist 有效值通过，历史账本不改。更新前等有效 TASK lease 自然释放，并确认 RESERVED / 活动 ingestion 为 0 后只替换 backend。
- 代码与配置审查层关闭：唯一只读 reviewer BLOCKER=0、IMPORTANT=0、OPTIONAL=0。本机镜像 `31f7dec…` healthy / readiness 200、有效额度与 Guard 字节码排除均确认，db / MinIO 与 Flyway V31 保持。系统日消耗 53567 / 2000000 的只读快照有余量；真实 Provider / GUI 操作结果仍独立验收。

### IMPORTANT：embedding 完整用量被当作未知、上传阻塞核心同步（2026-10-12，最小修复与定向验证通过；新补丁运行态待验收）

- 额度证据：目标大 PDF 三批 input actual 合计 22316，但适配器无条件丢弃 output，触发保守 charged 94615；小时上限 100000、余量 5385，下一批预留拒绝后正常延期到香港 11:00，未占有活跃 lease，也没有 RESERVED。历史 response 原始 usage 未捕获，不能由 NULL 反推 Provider 缺字段；合法 output 0 被丢弃已用真实适配器受控 RED 证明。
- 最小处理：只解析官方 `completion_tokens`，合法 0 保留，未知/非法继续保守；不改限额、Guard、检查点、账本记录或免费模型策略。完整实际用量下才减少本次结算，修复不回改旧记录。
- 同步证据：真实 PC store 的受控 probe 中，未返回的 asset queue wake 阻止普通 push/pull，释放后才继续；修复仅使上传 wake 后台执行，错误被消费且旧会话不影响新会话。资产完成后 draft 才进入 outbox、原通知触发后续同步。
- 现场限制：目标原始 Asset 早于额度延期约四分钟 READY；两次现场数据库无 blocker，缺少 sync HTTP 证据。因此独立客户端缺陷与这次同步症状的历史因果分开记录。PC 对 quota 延期仍显示泛化排队，未增加公开 retry timestamp 或页面设计。
- 原部署真实恢复：香港 11:00 自然重试，attempt=2、failure=0、无残留 lease/error；同 generation 从 32 个 inactive chunks 续做为 42 个 active chunks，job / Source READY，只新增一次 embedding。没有人为重跑。此证据关闭本次“调度未推进”的疑问，不代表尚未部署的解析与同步补丁已获得真实验收。
- 自动验证：后端五类 56/56 在与主树源码相同的隔离副本通过；PC 最终四项回归与 actual-store probe、type-check/build 通过。51/51 完整相关套件先于最后安全日志与测试断言强化，随后四项覆盖改动重跑；静态门禁失败仍为本轮未改的 Rust 固定地址规则。
- 代码与审查层关闭：相关回归通过，唯一 reviewer BLOCKER=0、IMPORTANT=0、OPTIONAL=0；五个主树源码/test hash 与已测版本匹配。运行态关闭条件仍为新补丁部署后实际完整 usage 结算、桌面上传期间其他实体及跨设备同步验收。详见 [本轮计划](../../plans/2026-10-12-pdf-ingestion-quota-and-sync.md)。

### IMPORTANT：PC 头像云端不可用时无法显示（实现已更新；运行态待验收）

- 证据：旧 `useAuthStore.loadAvatar()` 与个人中心 `loadAvatar()` 都直接请求服务端头像；读取失败会清空全局 `avatarUrl`。头像仅保存在运行时 Blob URL，重启后没有本地副本。
- 影响：断网或服务端暂时不可用时，PC 顶栏与个人中心不能显示已上传头像。
- 处理：IndexedDB 按 `user.id` 缓存 Blob；加载时优先呈现缓存并后台请求云端刷新。网络错误保留缓存，明确 404 才清除；上传、重置、退出登录和账号切换均处理对应缓存与对象 URL 生命周期。
- 代码验证：`scripts/r4-profile-live-links.test.mjs`（7/7 项测试通过）与 `npm run type-check` 退出码 0。关闭条件：在 Tauri 桌面端在线建立缓存，重启后断网确认顶栏和个人中心均显示头像，并确认重置后回到首字母。
- 只读复核：BLOCKER=0、IMPORTANT=0。OPTIONAL：同一账号重置请求的迟到响应若晚于后续头像上传，可能清掉后上传头像的本地缓存；本轮不修改 OPTIONAL 项。不同账号的缓存删除按用户 ID 隔离。

### 2026-10-12 PC 设置与个人中心（Profile Studio）视觉重构交接状态

- 设置中心（`src/views/Profile/index.vue`）完成 Awwwards 获奖级视觉设计、立体投影与微交互全面重构；
- 建筑级双栏立体投影（左右面板 `20px` 圆角，近远场双层漫散阴影；内部卡片网格 `18px~20px` 圆角、Tier 3 控件底色与微晶边框）；
- 标头瑞士现代微标 `SYSTEM PREFERENCES`、核心指标等宽数表、AI 使用额度微晶卡片、物理阻尼弹簧开关、聚焦扩散呼吸光晕与全覆盖深色模式系统；
- 验证：`scripts/r4-profile-live-links.test.mjs`、`scripts/r4-profile-logout.test.mjs`（9/9 项测试）全量通过；`npm run type-check` 0 报错；`npm run build` 成功。真实 Tauri 桌面端 GUI 待人工走查。

### 2026-10-12 PC Timeline 离线排期交接状态（代码审查关闭；真实环境待验收）

- 代码覆盖本地原子事务、稳定命令 ID、离线插入/顺延/换位、Sync 幂等回放、pull/snapshot 成员保护及拒绝恢复。浏览器 `localStorage` 下所有 LocalRepository 状态改写要求 Web Locks API 并共用同源互斥锁；缺少 API 时写入拒绝且返回 `LOCAL_STORAGE_LOCK_UNAVAILABLE`。新增共享存储跨 repository 的排期/snapshot 和排期/cursor 交错回归。
- PC 四个定向套件 173/173，`npm.cmd run type-check` 退出码 0；LocalRepository 套件单独 35/35。Server `SyncServiceTests` 21/21、`SyncSchemaTests` 4/4、`CoreDomainControllerTests` 9/9；合并定向 Maven 测试 34/34，clean 重建成功。新增回归验证缺少换位目标 ID 且快照失败时命令可重试，成功获取完整快照后恢复服务端任务投影。
- OpenAPI artifact 和 PC/Mobile SDK 的 mutation enum 静态结构检查通过。PC `check:r4-pc` 退出码 1，仅命中未修改的 `src-tauri/src/local_asset_store.rs` 固定本地地址规则。
- 独立 `OpenApiArtifactTests` 12/12；`scripts/check-openapi.ps1` 仍在 JUnit discovery 退出码 1（`NoClassDefFoundError: JsonNode`），所以运行时 artifact 对比未完成。
- 最新只读复审发现的“缺少目标 ID 时先终结命令、随后快照失败会留下乐观任务排期”已按快照先行校验、失败回放原命令修复；最终复核 BLOCKER=0、IMPORTANT=0。真实 Tauri/断网重启和恢复、PostgreSQL/跨设备行为及部署验收仍未完成；命令验证不代表 GUI 或业务验收。

### P1-AI-Overview-Final-Map-Budget-Mismatch（IMPORTANT，代码、相关验证和只读审查层关闭；部署验收待完成）

- 证据：部署 JAR 与隔离失败反例中，Subject direct / 单批 Source 最终 MAP 请求 6144 被 `AiUsageGatewayService.boundedRequest` 的 4608 阈值拒绝；真实码 `AI_REQUEST_BUDGET_EXCEEDED`（413），Provider 0 次、reservation 0 行。现场 26ms 日志和两次只读账本快照吻合。
- 影响：合法的学科总览及单批文件总览无法生成。异常本体沿 JSON/SSE 保留真实码，但 `OverviewGenerationService.stableErrorCode` 把用量码记为通用生成失败，影响定位。
- 处理：仅对齐既有最终输出上限并补安全日志白名单，不更改任务/用户/系统预算、并发、租约、数据库记录或调度配置。
- 关闭条件：真实服务→gateway→隔离账本回归通过、6145 超限仍拒绝且不出站、结算和 TASK 释放及 JSON/SSE/日志真实码得到验证，并完成唯一只读审查。代码关闭与部署/真实 Provider/GUI 验收分别记录，完整证据见 [诊断与修复](../../plans/2026-10-11-overview-usage-limit-diagnosis.md)。当前运行 backend 已是今天的新镜像，本轮修复尚未部署；下方 406 条目的旧镜像是此前观察。
- 自动证据：主树定向 19/19、本机 SSE 1/1；集成 2/2 是追加释放断言后的重跑，计数不相加。初始隔离 85/85、router 1/1 的范围与主树验证分开。唯一只读审查 BLOCKER=0、IMPORTANT=0，六项主树 source/test 与已测 manifest 一致；OPTIONAL=1 为两份诊断报告的 evidence 索引 SHA 待更新，按规则未修改，不影响代码测试证据。报告当前 hash 与 final-review 均登记在本轮计划。

### P1-PC-Overview-406-Client-Server-Protocol-Skew（根因已定位；本机容器更新待执行）

- 证据：当前 PC `postOverviewSse` 明确发送 `Accept: text/event-stream`。正在运行的 backend 镜像构建于 2026-10-09；容器字节码对应旧 `AiController`，Overview 方法直接返回 `OverviewResponse` 且未提供 SSE。现场日志显示 Provider/Overview 已成功，随后 `RequestResponseBodyMethodProcessor.writeWithMessageConverters` 因 `HttpMediaTypeNotAcceptableException` 失败，符合旧 Controller 尝试按 SSE Accept 写 JSON DTO 的协商失败。
- 影响：运行中的旧服务在结果写出阶段返回 406，旧 `GlobalExceptionHandler` 又通过通用异常分支误报为 500。已在工作树为 Overview 提供的 JSON/SSE Controller 加回归测试，并让 406 返回 `NOT_ACCEPTABLE` Problem Details；Docker 容器仍是旧镜像，因此本机运行态尚未关闭。
- `CACHE_RETURN` 不持久化结果；PC 收到响应后才执行 Overview results PUT。当前 request ID 仅关联日志，PC 手动重新生成会新建 request ID，响应丢失后可能再次调用 Provider 和计用量。防止跨失败重放需要独立幂等/结果回放设计，不包含在本次内容协商修复中。
- 关闭条件：重建/重启 backend 后，从 PC 对 JSON 与 `text/event-stream` 两条成功路径取得运行态 HTTP 证据，并确认不再出现写出阶段 406。真实 Provider 与桌面操作另行验收。

### 2026-10-11 Mobile / Tablet 复习接口调用待迁移（本轮范围外）

- 共享服务端已移除 `/api/reviews/due`、`POST /api/reviews/events` 和旧 `/api/reviews/history`。Mobile / Tablet 的复习页面与 API wrapper 仍调用旧路由，复习请求当前会失败。
- 本轮按用户限定只迁移 PC，不修改 Mobile / Tablet。恢复这些页面前，需将相应客户端迁移到 lifecycle 命令、states 与 lifecycle history；无需恢复旧路由或读取旧历史。

### 2026-10-11 PC 总览生成返回后页面未自动更新（已关闭）

- 现象与影响：用户反馈“总览后端返回之后，不能自动更新到页面上，自己刷新后才能显示”。后台生成完成落库后，UI 无感知，一直停留在初始占位或未刷新状态。
- 解决：建立总览缓存更新事件机制（`OVERVIEW_CACHE_UPDATED_EVENT`），在仓储层落库后向 UI 广播；`SubjectWorkspace` 监听并在匹配当前学科或关联原材料时自动刷新缓存、大纲并解除 loading；补充原材料状态 deep watch 和 `getLatestFileOverview` 容错。
- 关闭证据：`scripts/r4-subject-overview-ui.test.mjs` 增补测试通过，总览相关单元测试 120/120 全部通过；`vue-tsc` 0 报错。代码层已关闭，GUI 待验收。

### 2026-10-11 Overview 硬超时与取消（IMPORTANT，代码、相关自动验证与只读审查层关闭）

- 初始 RED：1500ms 期限下受控阻塞 Provider 实际 2658ms 才返回；真实 TLS 持续慢流同样超过期限。旧 JSON 等待期间无早期写入信号，PC AbortSignal 不能证明服务端停止。
- 已实施：入口单调绝对期限、当前独占 socket 主动关闭、同路由 SSE、原 owner 期限与共享兴趣、PC 停止和生命周期围栏；B 结算规则保留。单一审查提出的 SSE 503、真实 SQLite 写入取消、阻塞 DNS 和 queued/active writer 提前释放名额均有 RED/GREEN，最小修复及证据见 [实施计划](../../plans/2026-10-11-overview-hard-timeout-cancellation.md)。
- 相关自动验证通过：组合后端 124/124（与初期 84/51 重叠）、PC Overview 72/72、cache 14/14、sync 22/22、runtime 20/20 和 UI 16/16；源码 manifest、运行时 OpenAPI/SDK、类型和构建对应关系另有核对。唯一只读审查批准范围 BLOCKER=0、IMPORTANT=0。
- 运行态验收继续开放：未部署，需在支持 SSE 的新版 backend 上验证真实 PC、代理刷新/断连及 Provider。JSON 无写出前断连保证；JDBC/数据库锁不能强制中止，原生 DNS 仅有界隔离；本地关闭不证明远端计算撤回。Mobile 旧 Review 类型错误和跨实例幂等不在本轮范围。

### 2026-10-10 AI IMPORTANT 修复与验收边界（代码、相关自动验证与只读审查通过；真实环境待验收）

| 问题 | 证据与影响 | 处理与关闭条件 |
| --- | --- | --- |
| IMPORTANT：伴读来源缺少文件名（代码与相关自动验证层关闭） | 原 `SubjectWorkspace` 消息映射丢弃 citation；用户无法从回答辨别实际检索来源。 | 历史/流式纯文本文件名已实现，相关 27/27、type/build 及单一只读代码审查通过；GUI 单独验收。 |
| IMPORTANT：调用预算和并发保护缺失（代码、相关自动验证与只读审查层关闭） | 原 chat 未显式限定输出、usage 未统一结算；缺少任务累计额度和 Provider 闸门。 | B 已实现统一 gateway、持久预留/结算与全局/用户/任务预算；本人额度显示在三端个人中心。核心 H2/config 31/31、真实 PG 锁序 4/4、检查点/续做及 V29→V30 升级通过；真实 Provider、GUI 与生产发布独立待验收，见 [B 计划](../../plans/2026-10-10-ai-usage-guard-b.md)。 |
| IMPORTANT：Overview 缺少总任务时限（Provider 传输与相关自动验证层关闭） | 原合作式检查无法中止持续慢流、阻塞 TLS/写入及客户端断连后的调用。 | 2026-10-11 增加入口绝对期限、独占 socket 关闭、SSE 与有界 DNS 等待；相关本机 TLS/TCP 和普通 Provider 兼容回归通过，见本轮计划。JDBC/数据库锁、原生 DNS、GUI、真实代理/Provider 与运行态发布边界仍独立登记。 |
| IMPORTANT：embedding 全文单次请求与响应配对（代码与相关自动验证层关闭） | 原 worker 一次发送全部 chunks；adapter 忽略响应 index，乱序可能把向量配给错误文本。 | 已按 32 条/32768 UTF-8 文本字节分批并归位/拒绝非法 index；各批 count 校验、全部向量验证及原子提交保留。受控顺序、失败不提交和 lease 回归通过；只读审查通过。字节累计测试使用 ASCII，多字节边界仅有源码检查，属于 OPTIONAL 验证缺口。 |
| 质量基线与真实语义验收 | 八个匿名 fixture、实际 chunk/hash/scope 合同检查和评分模板已加入；离线 3/3 不评价模型回答。 | 基线设施已构建并通过离线检查；真实 Recall@K/MRR、支持性/覆盖性、注入与范围隔离及人工评分仍开放。 |

- PC 全量新增证据：679/680，未改 `r4-task-create-dialog-deadline.test.mjs` 使用 LF 分隔符提取 CRLF SFC，拼入 `</script>` 导致 SyntaxError；该失败未隐藏且未扩大修复范围。已有 `local_asset_store.rs` 固定地址静态扫描失败继续保留。
- 后端首轮聚焦 89/89、兼容增量 31/31；同一 reviewer 确认锁等待跨 lease 的续活竞态，原执行 Agent 先 RED 再最小修复，最终 Job/Worker 18/18 与配置 5/5 通过。锁后已过期 claim 不续租，新 attempt 不受旧 attempt 失败影响；真实 PostgreSQL 锁竞争未运行。PC Overview 静态回归 48/48 通过。
- B 增量审查发现的原子成功结算、结算与 heartbeat 交接、users 外键锁序、停用后派发、AI advice 模块循环、只读检查点写锁、硬预算永久延期与 Mobile 额度 401 路径均按必要最小修改及相关 RED/GREEN 关闭；唯一 reviewer 最终批准范围 BLOCKER=0、IMPORTANT=0，报告见 B 计划。真实 PG 跨额度窗口续做验证已完成，但未执行操作系统进程杀死/重启验收。
- 范围外既有失败：Modulith knowledge ↔ review 循环在未改 HEAD 可复现，涉及类 hash 与 HEAD 一致；主树 deadline 测试的 CRLF 提取和 legacy invalid schedules 断言在应用 B 前后均失败。没有修改冻结的非 AI 模块或将全量门禁写为通过。
- 完整证据、命令和本轮范围见 [共通实施](../../plans/2026-10-10-ai-important-fixes.md) 与 [B 实施](../../plans/2026-10-10-ai-usage-guard-b.md)。跨实例用量/TASK 互斥已由持久账本保护；持久 Overview 作业和跨实例幂等仍未纳入；本机慢流/断连已有验证，真实代理/Provider、GUI 和运行态发布仍是独立验收边界。

### 2026-10-10 PC + Service 功能盘点校正（静态代码核对；未重跑验证）

按当前工作树核对 PC + Service 功能清单。SearchPalette 结果跳转、专注会话关联与持久化、知识块正文保存、完整成功 Overview 跨 PC 设备读取已有实现；12 项无业务消费者的偏好及 Suggestions 确定性输出已有登记，详见 [当前状态](../../current/Status.md) 和 [PC 模块](../../modules/FrontendPC.md)。本节只增加尚未登记的缺口或产品范围待确认项。

#### IMPORTANT：资产中心 Source 状态固定显示“正常”（已关闭）

- 证据：`Auralis-PC/src/views/Asset/index.vue` 原本在全局文件树和学科文件树分别写入 `status: 'success'` 与 `statusText: '正常'`，未按 Source 的实际 ingestion 状态映射。
- 影响：解析中或失败的文件在资产中心仍可能显示正常，用户无法从该页判断处理状态。
- 处理动作：资产树构建逻辑中引入 `getFileStatus(file)`，结合 `useDocumentProcessingStore` 本地任务和 `file.ingestionStatus` 真实状态映射（READY 为已就绪，FAILED 为解析失败，AWAITING_CLIENT 为待本机处理，PARSING / INDEXING / VALIDATING / PENDING 为处理中），补充 `.status-dot.failed`、`.status-badge.failed` 以及 amber 色处理中样式，并在树节点状态点增加 tooltip title 悬浮说明。
- 关闭条件与证据：两类文件树均由当前 Source 实际状态及本地文档处理任务驱动；`npm run build`（`vue-tsc` 与 Vite 构建）顺利通过（退出码 0），自动化测试通过。当前代码层已关闭。

#### OPTIONAL：登录恢复与隐私条款入口待定范围

- 证据：`Auralis-PC/src/views/Login/index.vue` 的“忘记密码”和“隐私与条款”仅显示即将上线/发布提示；现有 Auth API 只有已登录改密能力，没有密码找回流程，也没有隐私条款页面或目标链接。
- 影响：用户无法通过登录页恢复遗忘的密码，也无法从该入口阅读隐私与条款内容。
- 处理动作：产品确认是否纳入当前候选范围，再按确认范围实现恢复流程和可访问的条款内容/链接。
- 关闭条件：批准的入口均可完成预期流程，或产品明确记录不纳入当前候选并移除误导性占位提示。

#### OPTIONAL：账户注销处理进度不可查询

- 证据：`DELETE /api/auth/me` 返回 HTTP 202 和初始作业状态；后台异步清理后没有公开状态查询路由。PC Profile 受理后退出登录，无法展示该作业后续进度。
- 影响：用户不能确认后台清理是否完成或失败；服务端当前仍会自行重试清理。
- 处理动作：确认产品是否需要注销进度可见性；若需要，设计用户隔离的查询与状态展示，不暴露其他账户信息。
- 关闭条件：进度查询和 PC 展示通过 owner 隔离及异步状态验证，或产品明确保持异步受理后即退出的现状。

#### 待实现：文档处理密钥丢失后自动重新处理

- 证据：该主密钥用于 PC 本地文档处理加密 cache/package，不保护知识块、任务、账户或原始文件。`DocumentProcessingRuntime.ensureEncryptionReady()` 当前发现任务保存了 cache id/receipt 且 keyring 中没有密钥时，仍抛出 `DOCUMENT_ENCRYPTION_KEY_RECOVERY_REQUIRED`。正式路由没有通用密钥备份/导出/恢复 UI。
- 已确认的产品决策：不增加通用密钥备份/恢复入口。OS keyring 明确确认密钥缺失时，自动创建新密钥，废弃受影响任务的旧加密 cache、receipt 和续传进度，不尝试用新密钥读取旧密文；从仍可取得的原始文件重新处理并上传。原始文件无法恢复时提示用户重新选择文件上传。keyring 访问拒绝或其他错误应保留真实错误，不触发密钥轮换。
- 当前状态：仅本轮文档登记了该决策，当前代码仍会报告恢复必需；实现与 Windows Tauri/真实 Server 验收待完成。详细边界见[密钥恢复设计](../../design/2026-09-04-pc-document-encryption-recovery-design.md)。
- 关闭条件：自动测试证明旧密文不会被新密钥解密/续传、失效检查点不会重入旧恢复路径、可用原始输入时能够重新处理上传、原始输入不可用时给出重新选择提示，并证明非缺失类 keyring 错误不会轮换密钥；再完成真实 Tauri/Server 验收。

#### OPTIONAL：时间轴手动完成与知识块选择器待确认

- 证据：`Auralis-PC/src/views/Timeline/index.vue` 展示已完成状态并可从任务描述解析知识块关联，但时间轴没有手动完成操作，也没有独立知识块关联选择器。
- 影响：用户需在其他入口完成任务，任务与知识块的关联不能从时间轴直接建立或调整。
- 处理动作：确认这两项是否属于时间轴职责；如纳入范围，再补交互、持久化和对应验证。
- 关闭条件：按批准范围完成对应操作与回归，或在产品范围中明确由其他页面承担/不提供。

#### OPTIONAL：没有持久通知收件箱

- 证据：PC 当前使用临时操作通知；未发现持久通知列表、已读状态或收件箱页面/Store。
- 影响：操作提示消失后没有统一的历史通知入口；当前偏好中的任务/专注提醒也没有业务消费者，后者另见 FrontendPC 的 12 项清单。
- 处理动作：确认是否需要持久通知中心及通知类型、保留期限和已读语义。
- 关闭条件：按批准范围实现通知写入、列表和已读行为并验证，或明确保持临时提示模式。

本次盘点只读代码与文档，没有运行测试、构建、GUI 或真实服务验收。

### 2026-10-10 本机 DB 重建后的 MinIO 对象清理（已关闭）

- 本机测试数据库 `public` schema 重建后，用户明确要求一并清空 MinIO。目标 `.env` 配置为 `auralis-assets`，版本控制 Disabled；删除前列出 12 个对象，删除后重新列举为 0。只保留 bucket 和服务，未改其他 bucket 或 PC/Tauri 本机受管文件。
- 影响已关闭：当前 Assets/Sources 表为空，目标 bucket 也为空；知识块和任务计数不受影响。命令证据与后续重建步骤见 [测试账号数据库重建与数据注入流程](../../operations/TestAccountDataResetAndSeed.md)。

### 2026-10-10 自测复习点击后显示完成 0 个（IMPORTANT，代码、自动验证与只读审查层关闭；客户端待验收）

- 可复现路径：最新自测页面传 VOLUNTARY，缓存的旧动作仍按 mastered-only 过滤；未来已学候选得到空队列，Store 原允许发布空轮次，模板无条件显示完成。旧动作通过测试包装器建模，未提取真实运行窗口闭包，未查询真实 SQLite 内容。
- 最小关闭措施：Store 拒绝空启动；Pane 核对所选数量与实际卡片并清理异常临时轮次，既存空轮次显示错误；开发更新 Store 后完整刷新，避免新组件继续调用旧内存动作。正式记录/outbox 的持久保存和调度未改。
- 主树回归 107/107、force type-check 退出 0，隔离构建退出 0；默认 5/7、10/12、10/3 的实际 SFC 点击、旧空动作、正常非零完成和刷新后正式记录/outbox 均覆盖。同一只读 reviewer 复核最终 BLOCKER=0、IMPORTANT=0、OPTIONAL=0；真实 Tauri 点击及多设备独立待验收。
- 范围外门槛：`check-subject-workspace-three-column.mjs` 仍在未改 SubjectWorkspace 的 `centerView === 'summary' && selectedFile` 断言退出 1；未顺手修改。npm 类型检查启动器发生 ENOSPC，直接 vue-tsc 成功。完整命令、原始 RED/GREEN 和差分见 `D:/Temp/auralis-voluntary-review-zero-fix-20261010/evidence/implementation-report.md`。

- 初审 IMPORTANT 已关闭：有效轮次恢复时以成功加载的 subject/account scope 为材料可用标记，加载中及失败重试不误报空轮次；换学科的暂时空 IDs 不清缓存轮次。三条挂起/失败读取测试 RED→GREEN，轮次 ID、queue、phase 和卡片均保留。最终增量与审查分别见 TEMP 的 `evidence/followup-report.md`、`reviewer-report.md`。

### 2026-10-11 PC 截止纯日期旧值兼容移除（定向测试、类型检查与只读审查通过；GUI 待验收）

- 现行持久化契约是带时区的真实 `dueAt` instant。日期解析不再把裸纯日期或无时区值兼容成当地日末；非空无效截止值拒绝新排期，明确的用户日期输入仍在写入边界转换为当地日末。Store 读取和按天排期保留旧值，非时间字段编辑传回相同旧值时也不会自动修正。
- 测试账号数据注入文档提醒注入端提供精确带时区截止值，并说明插入排期只校验既有截止，不会修正旧任务。没有修改任务数据或数据库/API 契约字段。
- 定向回归 92/92，`npm run type-check` 退出码 0；Codex 只读复核 BLOCKER=0、IMPORTANT=0、OPTIONAL=0。构建与 GUI 尚未执行。在取得实际任务 `dueAt` 之前，不把原用户任务的问题归因于注入数据。

### 2026-10-10 PC 任务截止自然日与 instant 不一致（IMPORTANT，代码与自动验证层关闭）

- 前端把带时区午夜/UTC日末扩为本地日末，导致部分排期前置允许、Server 按既存截止拒绝；创建与编辑纯日期拼 UTC 日末又产生时区偏差。真实 Store/Repository/API adapter 复现及源码证据见 [计划](../../plans/2026-10-09-task-deadline-date-consistency.md)。
- 已关闭：纯日期按当地日末保存、已有精确截止保持、编辑非日期字段不改截止；显式日期编辑与清空受临时标记保护。实际 Store/Repository/outbox 和拒绝无副作用回归、HK95/95、UTC/LA各7/7、主树669/669、类型与构建通过；唯一只读 reviewer BLOCKER=0、IMPORTANT=0。OPTIONAL：SFC helper 测试注入转换 stub，GUI 事件未挂载验证，未扩大测试架构。
- 真实 GUI/Tauri/HTTP 仍待验收。执行环境遗留：本轮 C 盘副本占满空间，已注销但目录仍在，清理被长路径错误及后续执行策略拒绝阻止；不是已关闭事项，路径与原始错误见上述计划。既有 Rust 固定本地地址静态扫描失败不属于本次改动。

### 2026-10-09 学科统计布局无重点与界面杂乱修复（IMPORTANT，代码与自动化测试通过）

- 问题归因：
  - 学科统计页（`SubjectStatsPane.vue`）先前平铺了 12 个等权卡片与多行散乱指标，静态学科资产（文件、知识块）与动态复习产出（今日复习、累计复习）混杂在同一行卡片中；
  - 界面装饰性嵌套过多（重度色框、粗阴影、多层辅助说明文本），缺乏核心聚焦视觉层级，整体观感臃肿不符合 Auralis 极简禅意风格。
- 修复措施：
  - 重构为三层极简仪表板：① 核心 Hero 看板（大字掌握率 + 极简细轨三态进度 + 去噪行动卡片），重点突出今日到期复习；② 学习活力与近 7 天走势（整合关键活跃指标与极简细柱状图）；③ 底座双栏（工整收敛学科资产与任务协同）；
  - 去除深层嵌套与冗余说明文本，样式回归 Auralis 宣纸禅意米白风（轻量单层背景、细微边框、呼吸感间距与平滑微悬浮）；
  - 模板消减深层纯静态节点嵌套，消除自定义渲染器上的 `createStaticVNode` 兼容隐患。
- 验证证据：`scripts/r4-subject-stats.test.mjs`（11/11 通过）、`scripts/r4-subject-review.test.mjs`（48/48 通过）、`npm run test:r4-pc`（659/659 通过）、`npm run type-check`（0 error）。真实 GUI 待用户人工验收。

### 2026-10-09 学科复习返回按钮层级与跳转位置规范（IMPORTANT，代码与自动化测试通过）

- 问题归因：
  - 复习最外层（规划总览仪表盘 `!round`）原本放置了多余的返回按钮，与 Tier 1 一级导航栏职责重叠；
  - 答题轮次内（`round` 存在）左上角返回按钮在先前修复中被过度绑定为直接退出复习视图并返回工作区材料预览，导致用户在答题中点击返回时误跳出复习模块，返回目标位置错误。
- 修复措施：
  - 彻底移除 `SubjectReviewPane.vue` 最外层 header 内的返回按钮，最外层级不设返回按钮，切换视图直接通过一级导航；
  - 将轮次内左上角返回按钮明确绑定为 `endRound`（目标为返回上一级规划仪表盘），退出当前答题轮次并停留在复习规划页；
  - `SubjectWorkspace/index.vue` 维护完善的 `lastWorkspaceState` 与 `toggleTier2` 逻辑，确保从其他模块切换时的稳健性。
- 验证证据：`scripts/r4-subject-review.test.mjs`（48/48 通过）、`npm run test:r4-pc`（618/618 通过）、`npm run type-check`（0 error）。

### 2026-10-09 学科复习/统计离线缺口（代码与自动验证层已关闭；真实环境待验收）

- 原复习主体被远端states成功标记限制，统计无持久本地读取，正式生命周期直接REST。现已改为本地读写及独立补传，正式状态/历史/待同步意图跨重启保留，临时轮次仅切页恢复。
- 本轮关闭条件：本地读写及正式数据/队列恢复、真实操作时间补传、精确幂等和 FIFO、多端冲突保留、账号代际围栏、本地统计与当前排程等价，通过相关自动验证及一次只读审查。GUI/Tauri 断网重启与双设备仍单独验收。
- 现有 baseVersion=0 同时代表无状态和既存 version0，首次离线学习同步必须显式区分；导入未确认 GOOD/HARD 必须携带初选前 baseline，不从 tentative state 推断。必要协议补充在 [计划](../../plans/2026-10-09-review-stats-local-first.md)，尚未声明关闭。

本轮二十三项必要修复已在代码与自动验证层关闭：唯一reviewer确认十四项IMPORTANT，根与执行Agent补充七项，根最终审查再补两项。最终主树R4 664/664（0 failure/skip）、类型/学科两项静态/构建通过；Service相关32/32、独立OpenAPI9/9、SDK一致。唯一reviewer初审后因使用额度中止，主Agent接手最终审查与必要修复，不能把后端初审写成全任务独立审查通过。当前任务范围未留未处理BLOCKER/IMPORTANT；真实Tauri/HTTP/双设备另行验收。证据与限制见 [本地实施计划](../../plans/2026-10-09-review-stats-local-first.md)。

| 已关闭问题 | 最小修复与回归范围 |
| --- | --- |
| 浏览器当前账号资源缺失后回退旧无账号键，可读取他人遗留KB/Subject | 仅现行owner-scoped LocalRepository；旧键忽略且不删除。真实scoped miss RED读取旧KB，GREEN资源为null、提交404且无record/intent，无绑定仓储不枚举旧数据 |
| 本地确认无条件增加稳定次数、最终验证不毕业，已有状态重学与重开ID不符Service | 对齐现行Service的初选前baseline/selectedAt、提前与EARLY_RECALL不推进、最终到期且满30天毕业；时间比较保留微秒，包含提前1微秒的边界。已有state重学10分钟/清旧pending，手动重开按请求ID清空。新增8种确认边界及持久重开回归，RED/GREEN；两个原跨天用例明确CROSS_DAY夹具 |
| 本地事务普通409错误未被Store识别，反复重试冻结旧base；重新确认分支仍取HTTP历史 | 明确识别本地版本冲突；恢复只读严格完整的本地state/history，未知或正文/scope变化安全结束卡片并保留正式记录/outbox；远端409仍单独显式采用云端，真实本地交错与零HTTP回归通过 |
| ReviewSync 派发初选时丢失本机冻结 reviewId，服务端另建 ID 导致后续确认冲突 | 五类请求按现行 API 保留正式字段；认识/模糊各自真实 Store 三命令离线链按原 ID 与实际 ACK 版本补传，他端新操作拒绝后继且不自动重基 |
| 已同步核心 KB 首次离线尚无复习导入记录，正式学习保存仍被 statePresenceKnown 门槛拒绝 | 按实际本地存在性持久保存，云端 UNKNOWN 不计确定新学习；完整 protocol2 GET 确认无state及空历史才初次准备，present0/旧云进度冲突保留，冷离线与重启/空云/已有云两分支通过 |
| updateCachedState 用 ??旧值恢复生命周期明确null，HARD确认后的尾回忆误入核对态 | 四个可空字段仅undefined时回退，null正确清除；真实HARD→确认→FUZZY_RECALL/核对、掌握阶段与学习ID清空回归 |
| LocalReviewService.pendingRows 的 SQL raw-tx 路径以 safeJson/默认准备凭据绕过仓储严格校验 | 复用同一严格行解析；真实 SQLite 有效 JSON 缺必要字段时拒绝正式提交，record/history/outbox 不变且无嵌套队列锁 |
| Stats 本地状态提示插入 v-if/else-if 链，待同步条数非零时隐藏统计主体 | 保持 loading/error/stats 三分支相邻，提示在 stats 主体内；实际渲染覆盖 pending>0 与错误/无数据状态 |
| 用户已实现的强制返回/结束被合并回 pendingCommand 拒绝，无法回规划页 | 强制结束仅清内存轮次，保留已保存正式记录/outbox；覆盖失败待重试与正在本地提交交错，账号围栏保持 |
| Core ACK 推进 KB version 或正文使云端状态失效，本地请求仍用旧版/猜 +1，产生错误冲突 | 未 prepared 请求依据独立云端锚点及完整历史核对后绑定 GET 实际版本；正文仅首条无 reviewId 学习且 state 精确失效可准备，元信息更新需 state/history 保持；他端复习、存在性变化或证据不足保留冲突，prepared 不改 |
| 已导入无状态的 KB 编辑/移动后被保存成合成存在态，首学期望存在错误 | record.state 原为 null 时保持 null，仅更新 hash/version/归属；UI临时投影不物化，首学仍 absent/ACK0/3天 |
| Review ACK 硬猜 base+1，真实服务首回执 version0 被拒 | 使用真实 server version 推进后继，保持本地 revision 分离；MockMvc已证明首次0，补首ACK0/present0/重试收敛 |
| 同 KB 首命令没有有效 ACK，队列仍继续后继 POST | 首个未确认/失败/冲突停止该 KB，原样重试后用真实前驱 ACK 版本推进；其他 KB 独立继续 |
| 离线 LEARNING_REOPENED 保留掌握/阶段，后续完成错误排三天 | 对齐 Service：非掌握、stable0、EARLY_RECALL，完成后10分钟；覆盖已掌握重开序列 |
| 只移动学科且正文不变也被当正文失效重置掌握 | 更新归属与 KB 版本，保留掌握/稳定/日期；旧 scope 意图安全处理，不遗留无法确认的孤儿初选 |
| 本地命令未原子核对发起轮次的学科，KB 移动后旧轮次仍可提交 | expectedSubjectId 在正式提交事务内等于 KB 当前父学科，覆盖移动交错 |
| core KB push ERROR/CONFLICT 后 cycle 正常返回，Review 未等核心变更收敛就上传 | 准备及派发逐 KB 检查全部未结 core mutation；未收敛仅 defer，core 收敛后同 ID 继续 |
| Store 仍把 version0 推断为无状态，已有 version0 首次命令被拒 | 从持久 state/显式本地存在性生成 expectedStateAbsent，覆盖 present0 与 absent 两例 |
| 旧正文 POST 飞行中失效后，迟到 ACK 可覆盖新投影并删已归档意图；迟到 409 可复活归档状态 | 所有结算分支同事务复核当前 intent 状态及父/KB/hash/version/归属；不恢复旧掌握、不删除归档审计或回退已结算状态 |
| 已删除 KB 记录替代缺失活动 KB，历史完整度误报 COMPLETE | 每个活动 KB 按 ID 校验导入标记，缺失/部分记录仍 INCOMPLETE |
| 任意 legacy 事件被当已学习，或未知云端状态被统计为确定新学习 | newLearningCount 仅计已导入明确无状态或有本地 CREATE 证据且无正式状态的 KB；未知可进入本地待学习但历史仍 INCOMPLETE，present0 与 needsLearning 已有状态不算新学习 |
| daily 完成任务漏算软删除 DONE/completedAt 历史 | 含墓碑任务仅参与适用每日历史聚合，当前任务概况仍只活动行 |
| daily 新建知识块漏算创建后软删除历史 | 含墓碑 KB 参与 createdAt 趋势，当前知识概况与三态仍只活动行 |

本轮另外发现一个既有工程检查失败（范围外，未修改）：`npm run check:r4-pc` exit1，唯一输出是 `src-tauri/src/local_asset_store.rs: fixed local address`。checker 第18行扫描所有源文本中的 `127.0.0.1/localhost:<port>`；该 Rust 从第1421行开始为 `#[cfg(test)]`，命中第1486/1525/1998/2087/2112行的本地 listener/上传 URL 测试 fixture。Rust 与 checker 均干净并与本轮原快照完全同 hash（分别 `4D089AAB…D8C422C2` / `68FA598A…6C2F31`）。这不作为本轮业务失败，也不把静态命令记成通过；按 OPTIONAL/范围外规则不修改 scanner 或 Rust。正式证据登记在本轮实施计划与执行报告。

### 2026-10-08 复习、学习与掌握退出（本轮必要问题已关闭；真实环境待验收）

- 新生命周期、3R、同次纠正、掌握退出与互斥三态已接通。最终PC专项63/63、type-check/两项静态/build exit0；Service相关25/25、最后当前V29 H2 14/14及各定向PG门槛通过。唯一只读reviewer最终BLOCKER=0、IMPORTANT=0、OPTIONAL=0；以下六项IMPORTANT在本轮代码、相关自动验证与只读审查层关闭。

| 问题 | 最小修复及证据 |
| --- | --- |
| 到期队列沿资源ID排序 | Store与Pane按dueAt升序；真实队列RED→GREEN |
| 未来待复习缺少手动入口 | 独立提前练习选择队列，活动/同步/内容/阶段资格复核；实际Pane/API与StoreRED→GREEN |
| KB移动后可能只锁旧Subject | 复用expectedSubjectId重载锁后重查；PG RED旧实现写state，GREEN拒绝且state/command均0，1/1 |
| 不同Subject首次学习竞争全局参数唯一键 | V29预置既有默认参数；PG双事务查空23505 RED→GREEN 1/1，V28自定义参数升级保留1/1，H2当前迁移14/14 |
| 跨设备reviewId或正文资格变化使pending永久残留 | 权威重读后清过期请求/卡片，可结束重开；不同ID、同ID确认/重学、version/hash变化真实Pinia/API交错覆盖 |
| legacy清空review IDs及history读取间的新初选 | history区分已使用与未提交R1；历史响应后重新检查版本/内容/当前ID，不覆盖R2；三种真实Store/API交错1/1，包含于最终63/63 |

- Antigravity配色经完整差分及样式/业务哈希验证后仅应用两个scoped样式体，用户布局保留，无新依赖/删除/跨模块写入。新机制旧回执与旧历史保留独立语义，不凭旧reps推断毕业。
- GUI/Tauri、真实HTTP、多设备联机及生产迁移尚未验收；真实PG正文修改与复习同时写入没有专用动态案例，已由内容行为测试、PC资格用例和事务代码审查覆盖。未重跑全量Server、未关闭下方原工程门槛。完整命令、各版本证明范围、原失败与唯一reviewer报告见 [本轮实施](../../plans/2026-10-08-review-learning-mastery-implementation.md)。

### 2026-10-08 复习卡片反馈简化（本次需求已在代码、自动验证与只读审查层关闭）

- 用户要求两项反馈。当前“展开内容”只揭晓，评分入口为“下一个”（GOOD）与“记错了”（AGAIN）；记错队尾与每轮首次调度继续通过现行 Store 处理。
- 本轮唯一 reviewer BLOCKER=0、IMPORTANT=0、OPTIONAL=0；实际组件点击与 Pinia/API 桩证明两按钮载荷及重复巩固无新增事件，最终专项 41/41。较早 R4 595/595 和类型/静态/build 通过，最后测试增强由随后专项覆盖；原合法历史值与 pending 事件不改写。
- 当前卡片样式与 StatsPane 日历按本轮快照保留。GUI/Tauri/真实 HTTP/PG 与多端仍未验收；未重跑或关闭原 Service 全量工程门槛，也未处理此前未同步 KB 的 OPTIONAL。证据、时间与工作树保护见 [实施补充](../../plans/2026-10-08-subject-review-stats-implementation.md)。

### 2026-10-08 前端 Docker 安装失败（原失败保留；本次隔离重试通过）

- IMPORTANT / 构建受阻：原 Buildx ID `37i8gaymoqh4tmohdcvjdqkuy` 在 npm 下载时 `ECONNRESET` 退出 1；同一 Dockerfile 单独重试后安装、编译及镜像导出退出 0，没有源码修复。具体网络/代理中哪一层重置连接尚未定位，重试成功不证明以后网络不会中断。实际命令、时间及证据见 [基础设施记录](../../modules/Infrastructure.md)。
- OPTIONAL / 既有工具链观察：Node 20.20.2 对要求 Node >=22 的 `@mapbox/jsonlint-lines-primitives@2.0.3` 输出 EBADENGINE，但本次镜像构建通过；package.json 声明 katex，现有 lockfile 根依赖映射未列出它（包条目已存在）。两项均未证明是本次失败原因，当前任务按规则不修改。
- 此轮只有真实镜像构建验证，没有运行容器部署、后台新接口、GUI 或多端验收；用户业务代码及已有工作树修改冻结，普通门槛未重复运行。

### 2026-10-08 F3 学科内复习与统计（代码、相关自动验证及只读审查层关闭；真实环境待验收）

- 用户要求退役失效生成器并重建学科侧栏中的复习页面，原“PC 页面交付范围尚未确定”的前提已被新需求更新。
- 实施前 due 的用户级前 200 条与 history 均不能完整重建学科当前状态。现已按 [批准方案](../../plans/2026-10-07-subject-review-redesign.md) 增加学科范围完整分页 states、统计接口及 PC 自评页面；新 KB 通过活动知识块与完整状态集合差集分类，失败不伪装成新学习。
- 每知识块每轮首次非 SKIP 评分调度一次，后续巩固仅在内存进行；统计按学科及 IANA 本地日聚合正式学习，现行全局 weekly 保持原语义。首次失败保留原事件幂等重试，冲突重读后明确确认；两种成功路径均失效统计。
- 用户进一步明确学科统计只展示资料、知识块、复习与任务；专注时长与轮次只留在个人页。统计不能从仅当前 DONE 的任务状态还原已经重新打开任务的旧完成次数，近期完成指标明确为当前仍完成且 completed_at 在范围内。本次新增只读统计代码，无新增迁移。
- 本机切页恢复已实现并用真实 Store/deferred 回归验证，队列、展开、首次标记及 pending 随学科缓存；刷新/重启和会话变化清除。页面卸载后成功删除学科也会清轮次并失效迟到评分/状态/历史写回，删除失败与 A→B 交错有专项证据。
- 最终 PC 专项 40/40、R4 594/594、类型/两项静态/build 通过，Service 新专项 4/4、相关回归 19/19、生成 OpenAPI/两端 SDK 与一致性检查通过。唯一只读 reviewer 最终 BLOCKER=0、IMPORTANT=0，八项必要反馈闭环。全量 Maven 386 项仍有既有迁移断言 1 failure 与本次 Docker 不可用的 6 error，未称全项目通过。GUI/Tauri/真实 HTTP/PostgreSQL 并发/多端未验收；完整证据见 [实施记录](../../plans/2026-10-08-subject-review-stats-implementation.md)。
- 本轮 reviewer 保留 OPTIONAL：未同步 KB 可显示在新学习列表，但计数与可评分集合不包含它们，存在显示数量的细节差异；评分本身受保护，当前任务不修改。未确认评分禁止结束本轮，经审查属于保留原事件幂等确认的必要边界，不列为缺陷。

### 2026-10-07 三项优先问题修复（F1 / F2 / F4 已在代码、相关自动验证及只读审查层关闭）

| ID / 等级 / 状态 | 处理 | 关闭证据与限制 |
| --- | --- | --- |
| F1 / BLOCKER / 已关闭 | 同步、导入及真实上传队列捕获 owner/device/session 代际；失效票据在网络派发、刷新/重试、写回和共享状态边界拒绝。A 文件与未结算 outbox 留在 A，可后续重试，B 可独立正常操作 | 真实 Pinia/Repository/Axios adapter 回归覆盖等待切换、同账号重登、A→B→A、迟到 push/pull/snapshot/401、导入和实际队列。reviewer 发现的刷新失败未导航、上传意图派发前泄漏均先 RED 后 GREEN；补正常 A rotation/complete、B 导入与清 A 后 B 登录的微任务交错。最终 PC 专项 107/107、R4 554/554，唯一 reviewer 无 BLOCKER/IMPORTANT；真实 HTTP、Tauri 和双设备未验收 |
| F2 / IMPORTANT / 已关闭 | READY FILE 引用与清理共用 owner Asset 行锁；清理逐 Asset 独立事务重查引用，提交 ORPHANED 后才删对象，失败后可幂等重试 | 真实 PostgreSQL 17.11 并发集成 5/5，实际 SQL 锁等待；restore 先提交保留、cleanup 先提交拒绝 restore/create/update、共享引用和删除失败重试均验证。相关 56/56，原 SourceAssetRelationServiceTests 15/15。存储使用可控适配器，生产 MinIO 未验收 |
| F4 / IMPORTANT / 已关闭 | “连续专注”标签纠正为“本周专注天数”，数值仍统计 weekly 中 focusSeconds>0 的日数 | 实际 Antigravity 单行差分，计数/布局沿用；源代码一致性审查、focus 相关回归和最终 PC 类型/构建通过。GUI 未验收 |
| G1 / 工程门槛 / 未关闭 | 最终 Service clean test 392 项，391 通过、1 failure、0 error/skip；TaskColorRemovalMigrationTests:62 仍期待 V21，实际 V28 | 该既有失败未修改、隐藏或跳过。此前 AccountDeletion 微秒舍入失败本次 4/4 未复现，保持历史登记，未宣称修复。需另行授权处理工程门槛并运行相应用例 |

最终 PC 类型、两项学科静态检查与构建均退出 0；唯一修复 reviewer 最终 BLOCKER=0、IMPORTANT=0。实际完整命令、精确时间、日志、baseline 差分/hash 和 AGY 收据见 [实施记录](../../plans/2026-10-07-priority-function-fixes.md)；修复 review 文件为 `C:/Users/Gnasche/AppData/Local/Temp/auralis-priority-function-reviewer-20261007.md`。

其余 10 组功能缺口及 12 项偏好按用户要求逐项确认，当前未修改。审查另确认 same-scope pull 失败可能使 PROCESSING mutation 留在 inflight：完整 baseline 已有同样路径，属于既有范围外行为，留待后续讨论，不计为本轮新增回归或关闭证据。

### 2026-10-07 PC / Service 功能完整度检查（修复前只读审计；三项已由顶部修复关闭）

下列内容保留审计时证据和关闭条件；当前 F1/F2/F4 状态与最新测试结果以上方登记为准。

三个 Luna 极高思考执行审计及唯一只读 reviewer 已完成。完整页面/服务矩阵、10 组 OPTIONAL、12 项无效偏好、源码位置、命令证据与验收边界见 [检查报告](../../current/2026-10-07-pc-service-function-audit.md)。审计阶段没有修复源码或测试；下列为修复前状态。

| ID / 等级 | 当前证据与影响 | 最小处理方向 / 关闭条件 |
| --- | --- | --- |
| F1 / BLOCKER | `useSyncStore.ts:239–253` 固定 A Repository 后等待 wakeUp，却读当前 B device；`request.ts:51–59` 取 B token。真实 SubjectStore 创建、AuthStore logout/login 的 TEMP harness 退出 0，adapter 观察 A SUBJECT CREATE+B身份；`useAssetStore.ts:52–109` 的独立进程内复现把 A 文件名投影进 B Repository。真实 HTTP/Service 写入/Tauri 落盘未执行，Service自包含学科按B创建是代码推断，已有A记录归属检查正确 | 在已经证明的同步与导入异步边界固定并核验 owner/device/session 代际，切换后旧操作不得以新身份发送或写新投影，保留 A 待同步数据。关闭须可控等待+真实退出/登录过程对照、A重试/B正常操作；另补 Tauri/HTTP/双设备证据 |
| F2 / IMPORTANT | `AssetRetentionCleanupService.java:59–101` 检查引用后直接删 blob/标 ORPHANED，`SourceService.java:240–257,434–439` 恢复时锁 Source/Subject 并仅查 Asset READY，没有共用临界区。代码确认 cleanup检查→restore成功→cleanup删除的窗口，未动态复现；活动 FILE Source 可能失去对象 | 清理与恢复共享锁/状态协议并在临界区重查引用；确定性交错证明 restore 赢则保留对象，cleanup 赢则拒绝恢复，不能留下活动来源引用丢失对象 |
| F4 / IMPORTANT | `Profile/index.vue:21,1099–1106` 将 weekly 中 focusSeconds>0 的天数显示为“连续专注”，没有连续日期判断；代码确认 | 最小可改为准确的“本周专注天数”，若批准真实 streak 则计算连续日；隔日/无专注/单日/相邻多日验证标签和值一致 |
| G1 / 工程门槛未通过 | Service fresh clean test 387 项有 2 失败：`TaskColorRemovalMigrationTests:62` 仍期待 V21、实际 V28；`AccountDeletionCleanupPostgresIntegrationTests:95` 数据库舍入比测试截断多 1µs。退出 1，不能宣称全量通过；没有由此证明注销/迁移业务故障 | 修正与现行迁移/时间精度一致的测试预期，保留原业务断言；运行原失败用例及必要门槛，不删/跳测试 |

OPTIONAL 共 10 组：PC 复习旧生成器断链（F3，范围相关）、Profile统计失败反馈、搜索失败反馈、搜索旧query静态竞态、部分任务/知识块/学科删除失败反馈、Profile UTC今日高亮、原时间轴current/midnight、原跨周同星期交换、Service并发同名学科候选、12项偏好无消费者。静态交错与未做GUI的项不写成已动态复现；F3不要求恢复KB.reviewAt或新增PC评分UI；OPTIONAL本轮不修改。

实际本轮 PC R4 542/542、类型/两项静态退出 0；数据链路 345/345 与全量重叠。Service clean test 385/387、2 fail、0 error/skip，容器集成实际执行。完整实际命令/meta/stdout 在报告所列 TEMP 目录；唯一 reviewer 文件为 `C:\Users\Gnasche\AppData\Local\Temp\auralis-function-audit-reviewer-20261007.md`。早期9月排期失败条目以顶部10月修复记录及当前证据为准，不重开冻结实现。真实 GUI、Tauri/Keyring、文件OCR/续传、会话/AI/SSE、Provider与双设备验收仍开放。

### 2026-10-07 PC 时间轴放置与交换修复（3 项 IMPORTANT 已关闭；代码、自动验证及只读审查）

| 等级 / 状态 | 问题 | 处理与关闭证据 |
| --- | --- | --- |
| IMPORTANT / 已关闭 | 迟到在线响应覆盖较新版本或删除墓碑，cursor 已推进后无法靠再次普通 read 修正 | `upsertSyncedBatch` 在提交段保护当前版本/墓碑，保留 mutation 整批围栏并原子合并有效成员；Store 在全部写回结果下仅重读 Repository。真实 Pinia/Repository/API gate 与 `runSyncCycle` 更新/DELETE 交错覆盖插入、交换、cursor/row/version/outbox/投影和缓存失败恢复；SQL/browser 边界、同版本与 v0 对照通过 |
| IMPORTANT / 已关闭 | 按天排期未扫描合法末槽 22:30 | 使用既有窗口常量扫描至 22:30；唯一空槽成功，结束恰好截止允许，晚一分钟或完整区间冲突时 row/version/outbox/投影不变 |
| IMPORTANT / 已关闭 | 紧邻异长交换将新起点推到可见网格外 | API 前按实际新起点检查 08:00–22:30；紧邻保留原共同窗口日，非紧邻按各新起点日。两种晚槽方向、22:45 和跨午夜 compact 均零 API/零写，正常 22:30 成功；原跨周同星期 OPTIONAL 行为对照保留 |

最终专项 127/127、PC 542/542，无 skip，类型/两项学科静态检查/构建退出 0；唯一只读 reviewer 本轮 BLOCKER=0、IMPORTANT=0、OPTIONAL=0。主 Agent已读取末版差分和实际日志，没有重复执行普通门禁。执行报告、命令/退出码及日志在 `C:\Users\Gnasche\AppData\Local\Temp\auralis-placement-fixes-execution-20261007`，其中 `focused-final-v3-*`、`test-r4-pc-final-v3-*`、`type-check-after-scope-fix-*`、`build-after-scope-fix-*` 为最终证据；两项无关静态检查沿用 `check-subject-icons-*`、`check-subject-workspace-*` 的 14:53 实际退出 0。详见 [实施记录](../../plans/2026-10-07-timeline-placement-and-swap-fixes.md)。真实 GUI/Tauri、HTTP 网络时序和双设备仍待验收；既有跨周同星期交换及当前时刻标记两项 OPTIONAL 不在本轮修改范围。

### 2026-10-07 PC / Service 时间轴放置与交换复查（修复前只读审计；三项已在后续修复关闭）

以下保留审计时证据、影响和关闭条件；当前处理结果以顶部修复登记为准。

| 等级 / 状态 | 问题与证据 | 影响、最小处理方向与关闭条件 |
| --- | --- | --- |
| IMPORTANT / 审计时未关闭（最高修复优先级） | `useTaskStore.ts:592-625` 的远端响应写回和 `localRepository.ts:335-393` 的 `upsertSyncedBatch` 仅检查未解决本地 mutation，没有保护较高远端版本/墓碑。实际 Store + Repository + `runSyncCycle` 先应用 v9 更新并推进 cursor，迟到 v8 排期响应将 row/投影回退至旧时间和内容；再次 read 的 `changed=[]`，仍为 v8。另一实际交错先应用 v9 DELETE，迟到 v8 清除 `deletedAt` 并重新显示任务。插入与交换共用写回函数，动态时序复现为插入；SQL 守卫缺口及交换共享路径为代码确认 | 本地可持续显示旧内容或已删除任务，直至后续权威变更/快照等恢复；服务器 v9 未被复现改写。原子 batch 防止部分提交，但不能防止旧响应覆盖新数据。最小方向是在提交段保护当前版本/删除标记，投影不能安装已过期响应，并保证必要恢复读取可收敛。关闭须有更新和 DELETE 两类实际交错回归，断言 row/version/deletedAt/cursor/outbox/内存均正确；覆盖共享交换路径和 SQL/browser 两个提交分支 |
| IMPORTANT / 审计时未关闭 | `useTaskStore.ts:775-796` 的 `scheduleTaskToDay` 扫描只到 22:00，日网格和插入请求窗口均到 22:30。相同占用条件下，实际 Store 直接放置 22:30 成功，按天排期却报“当天没有符合任务时长和截止期限的可用排期时段”；失败后的 row/版本/outbox/投影保持不变 | 日期列拖放漏掉最后一个合法起始槽。最小方向是对齐择槽上界与可见网格，保留完整时长、截止及冲突校验。关闭须补仅 22:30 可用的成功回归和截止/冲突拒绝对照；不得把任务结束晚于 22:30 本身改为违规 |
| IMPORTANT / 审计时未关闭 | `useTaskStore.ts:828-860` 紧邻交换预检与日网格 `386-419` 不一致。实际 Store + Repository/API 桩：21:30 的 30 分钟任务与 22:00 的 90 分钟任务交换后，短任务变为 23:00，row/投影为 v8、outbox 为空，但没有可见槽；长任务变为 21:30。UI 标题 drop 入口代码确认，本轮未运行 GUI | 任务仍在数据中，却从日网格消失且无法在该网格继续操作。Service 按原共同窗口紧凑交换符合现行 API 契约，本问题定位为 PC 可见落点缺口。最小方向是交换前验证双方新起点仍可展示/操作；暂不指定 UI 或 API 重设计。关闭须覆盖该晚槽异长组合及反向拖动、正常交换和失败无写入对照；Service 的精确晚槽组合本轮仅算法代码确认 |

已检查的既有路径：空白槽插入顺延、主体严格放到目标结束后、标题交换和待办取消排期的事件归属；服务端版本/锁/事务、完整截止、null 时长按 30、首尾相接、DONE 固定、CANCELLED 不占区间。现有聚焦测试均通过，本轮未发现新的 BLOCKER；审计时三项 IMPORTANT 尚未修复，已由顶部后续修复登记关闭。此前跨周同星期 swap 和当前时刻标记 OPTIONAL 保持原登记，不计入三个新问题。

2026-10-07 实际命令验证：

| 范围 / 执行目录 | 实际命令或选择器 | 退出码 / 结果 | 日志 |
| --- | --- | --- | --- |
| PC，`D:\CodeBase\Active\Auralis\Auralis-PC` | `node --experimental-strip-types --test scripts/r4-task-store-schedule.test.mjs scripts/r4-task-view-rules.test.mjs scripts/r4-dashboard-timeline.test.mjs` | 0，90/90，无 skip | `pc-baseline.meta.log`、`pc-baseline.stdout-stderr.log` |
| LocalRepository，同上 | `node --experimental-strip-types --test scripts/r4-local-repository.test.mjs` | 0，22/22，无 skip | `localrepo-focused.meta.log`、`localrepo-focused.stdout.log` |
| Service/Controller，`D:\CodeBase\Active\Auralis\Auralis-Server` | `mvnw.cmd -Dtest=... test`，CoreDomainServiceTests 的 11 个排期方法及 CoreDomainControllerTests 的 4 个排期方法；完整实际选择器见报告及 meta | 0，15/15，BUILD SUCCESS，无 failures/errors/skips | `service-focused.meta.log`、`service-focused.stdout.log` |
| Service 边界，同上 | `mvnw.cmd -Dtest=... test`，CoreDomainServiceTests 的半开区间、空时长、完整截止和取消状态四个方法；完整实际选择器见报告及 meta | 0，4/4，BUILD SUCCESS，无 failures/errors/skips | `service-boundary.meta.log`、`service-boundary.stdout.log` |

完整报告：`C:\Users\Gnasche\AppData\Local\Temp\auralis-placement-swap-audit-20261007.md`。全部日志与独立内存 harness 位于同名 TEMP 目录；复现 JSON 为 `version-drift-recovery.stdout.log`、`tombstone-race.stdout.log`、`last-slot-store.stdout.log`、`adjacent-swap-window.stdout.log`，报告记录完整命令、日期、工作目录和退出码。主 Agent 核对了上述日志及高风险提交边界，没有重复执行已完成门禁。本次未改业务代码、测试、配置、依赖、生成文件、index 或 HEAD；仅登记风险并校正文档事实。未执行全量 Maven/PC 构建、GUI、真实 Tauri SQLite、HTTP 并发、双设备或真实数据库验收。动态复现用 browser fallback/API 桩，不等同于真实服务验收。

### 2026-10-07 PC 时间轴日期与拖放修复（确定问题已修复；专项及只读复核通过）

| 等级 / 状态 | 问题与证据 | 处理与验证 |
| --- | --- | --- |
| IMPORTANT / 已关闭（代码与自动验证） | 同日已有排期被星期与完整日期比较误拒，报告源排期已变化 | `rescheduleTask` 比较入队前捕获的具体本地日期；实际 Store/API 桩/Repository 同日改期成功。另一周同星期拒绝由完整日期比较代码确认，未新增独立动态案例 |
| IMPORTANT / 已关闭（代码与自动验证） | 等待写队列期间切日，原落点漂移到新日期 | 按槽两个入口入队前保存日期；实际 gate-enter 队列 RED/GREEN 验证 schedule 请求、窗口、持久行及旧日/新日投影。排队 reschedule 和 B 日 DONE 槽未新增独立案例 |
| IMPORTANT / 已关闭（代码与自动验证） | 周视图已有排期跨天拖放被未排期专用守卫拒绝 | 日期列传完整 dateKey，按天入口接受活动已有排期；实际 Store/Repository/outbox 验证目标日期和槽位。既有冲突/完整截止择槽与无写入专项保留；已排期跨日的冲突/截止组合未新增独立案例 |
| IMPORTANT / 已关闭（代码与自动验证） | 重挂载标题、选中日与保留的任务槽位错位 | 本地日期从 Store 完整 selectedDay 初始化；执行真实 SFC 计算体和选中表达式，与真实 Store 下周槽位一致。GUI/真实路由挂载待验收 |
| IMPORTANT / 已关闭（补修及只读复核） | reviewer 实际复现按天入口放宽后未排期 DONE 新增排期及 UPDATE outbox | AGY 保留已排期完成守卫并补全部完成态拒绝；DONE/CANCELLED 有无排期四种实际用例均拒绝，仓储/版本/outbox/任务和槽位快照不变。补修 RED 明确复现，最终专项 90/90，同一 reviewer 确认关闭 |
| OPTIONAL / 未关闭（边界缺口） | `useTaskStore.ts` 的 `swapScheduledTasks` 只比较两项的星期缩写。真实 Store 对 2099-10-06 与 2099-10-13、无截止任务调用 swap API 1 次并交换两项 Repository 日期；服务端现行交换接口也未提供前端“同一天”的补充校验 | 前端守卫不能区分不同周的同星期。当前 UI 不能直接跨周拖放，Store 复现不等同于直接 GUI 复现，模拟响应也不证明真实 HTTP 已成功。后续考虑以具体日期校验前端的同日约束，补不同周同星期与同日成功的回归；本轮不修改，也不据此改变服务端现行契约 |
| OPTIONAL / 未关闭 | `useTaskStore.ts` 的 `updateCurrentSlot` 用 `selectedDay === getTodayDayCode()` 判断今天。真实 Store 从星期选中切为今天完整日期后，原 `slot.isCurrent=true` 变为 false；午夜跟随逻辑也比较星期，后者仅代码确认、未运行定时器 | 选中今天后当前时刻标记消失，属于较低优先级显示问题。统一今天判断的日期语义并补星期/完整日期及午夜对照；本轮未修改 |

最终专项 90/90、PC 527/527，类型/两项学科静态检查/构建均退出 0；唯一 reviewer 最终 BLOCKER=0、IMPORTANT=0。原两项 OPTIONAL 和独立组合用例覆盖限制保留，真实 GUI/Tauri、HTTP 与双设备待验收。下面为 2026-10-06 修复前排查证据；2026-10-07 RED/GREEN、门禁、审查和工作树保护详见 [实施记录](../../plans/2026-10-06-timeline-date-and-drag-fixes.md)。执行目录：`D:\CodeBase\Active\Auralis\Auralis-PC`。

| 实际命令 | 退出码 / 结果 | 证据路径 |
| --- | --- | --- |
| `node --experimental-strip-types --test scripts/r4-task-store-schedule.test.mjs scripts/r4-task-view-rules.test.mjs scripts/r4-dashboard-timeline.test.mjs` | 0，80/80；既有专项基线 | `C:\Users\Gnasche\AppData\Local\Temp\auralis-timeline-date-audit-focused-20261006.log` |
| `node --experimental-strip-types --test --test-name-pattern='DATE-AUDIT' C:\Users\Gnasche\AppData\Local\Temp\auralis-timeline-date-audit-20261006\harness.mjs` | 0，10/10；当前缺陷复现与正常对照 | `C:\Users\Gnasche\AppData\Local\Temp\auralis-timeline-date-audit-harness-final-20261006.log` |

修复前 TEMP harness 提取真实 Pinia/LocalRepository 测试设施并模拟 API 响应，当时没有修改仓库测试或源码。初次 TEMP 适配因无法解析 pinia 失败，跨周 swap 首轮夹具因截止守卫拒绝失败，均由同一执行代理归因后重跑，不作为最终业务证据。10/10 表示成功证明修复前缺陷和正常对照，不能作为修复验收。后续用户授权四项修复，实际新增回归与门禁独立记录；原两项 OPTIONAL 保留。未执行 Maven、真实服务、GUI/Tauri 或双设备业务验收，原生 SQLite 排期执行和跨周 swap 直接 GUI 触发未覆盖。用户既有工作树保留。

### 2026-10-06 PC 新建任务弹窗截止时间选择与 Zen 日期选择器样式修复（确定问题已关闭；自动验证通过，真实 GUI 待验收）

| 等级 / 状态 | 问题与证据 | 处理与验证 |
| --- | --- | --- |
| IMPORTANT / 已关闭 | 首页（看板）、排期页及学科工作区在新建任务时无法指定截止时间，用户无法在创建时一步到位建立截止目标；初版接入日期选择器后在某些主题下背景发黑，破坏温润宣纸米白整体视觉 | 在 `TaskCreateDialog.vue` 中接入可选截止时间选择器，复用资产页 `Asset/index.vue` 的温润宣纸米白 `.zen-date-picker` 与 `:global(.zen-date-popper)` 规范；固定温润米白底（`#FAF7F2`）、深墨黑文字（`#1C1C1A`）与抹茶绿边框/高亮图标，彻底根除深黑底色问题；在提交时将日期转换为 ISO 格式 `dueAt`，首页、排期页和学科工作区统一接收并写入 `taskStore.addTask`，在待办清单中实时呈现截止徽标 |

专项测试 `scripts/r4-task-create-dialog-deadline.test.mjs` 通过，`test:r4-pc`（517/517 全部通过），`npm run type-check` 退出 0。真实桌面端 GUI 交互待人工走查。

### 2026-10-06 PC 顶栏开启番茄钟同步时间展示胶囊（确定问题已关闭；自动验证通过，真实 GUI 待验收）

| 等级 / 状态 | 问题与证据 | 处理与验证 |
| --- | --- | --- |
| IMPORTANT / 已关闭 | 用户在番茄钟（`/pomodoro`）开启计时后切换至其他页面（如首页、知识库、时间轴、个人中心）时，全站顶部无法直观感知当前番茄钟专注/茶歇状态与剩余时间，需要反复切回专注页面查看 | 在 `AppHeader.vue` 紧靠颜色模式切换按钮左侧接入大气立体的响应式番茄钟时间胶囊（`.header-pomodoro-pill`，88px × 36px，与右侧按钮等高）：当番茄钟运行中或暂停未重置时平滑浮现；完全对齐主界面 `PomodoroRing.vue` 3.8px 宽边框进度条缩减动画（`3.8px` 粗体边框沿跑道顺时针随倒计时逐渐缩减，底轨半透明）、主界面同款温润宣纸米白底（`#FAF7F2`，深色 `#212621`）、去除非时间文字仅保留居中等宽超粗体跳秒数字（`14px, font-weight: 800, tabular-nums`），并在胶囊底部加入柔和双层立体悬浮阴影（`box-shadow`），悬停展示状态 Tooltip，点击快捷路由直达 `/pomodoro`，未激活或重置后自动淡出隐藏 |

专项测试 `scripts/r4-header-pomodoro-pill.test.mjs` 通过，`test:r4-pc`（515/515 全部通过），`npm run type-check` 退出 0。真实桌面端 GUI 交互待人工走查。

### 2026-10-06 PC 学科知识块弹窗顶栏对齐首页知识块（确定问题已关闭；自动验证通过，真实 GUI 待验收）

| 等级 / 状态 | 问题与证据 | 处理与验证 |
| --- | --- | --- |
| IMPORTANT / 已关闭 | 学科工作区打开知识块详情时（`WorkspaceKnowledgeBlockDialog.vue`），ModalShell 弹窗顶部标题栏直接渲染了具体的知识块标题，导致与正文首张元信息卡片大标题重复两次展现，且与首页知识块弹窗规范不统一 | 在 `WorkspaceKnowledgeBlockDialog.vue` 浏览模式（`currentMode === 'view'`）下，顶栏对齐首页知识块弹窗（`KnowledgeBlockViewDialog.vue`）的结构与样式，展示「知识块详情」主标题（`kb-dialog-main-title`）与当前学科胶囊药丸徽章（`kb-dialog-subject-pill`），右上角保留关闭按钮；在录入/编辑模式下继续保持对应的功能标题 |

专项测试 `test:r4-pc`（514/514 全部通过），`npm run type-check` 退出 0，`check:subject-workspace` 退出 0。真实桌面端 GUI 交互待人工走查。

### 2026-10-06 PC AI 参考范围下拉菜单交互收敛（确定问题已关闭；自动验证通过，真实 GUI 待验收）

| 等级 / 状态 | 问题与证据 | 处理与验证 |
| --- | --- | --- |
| IMPORTANT / 已关闭 | 学科工作区 AI 参考范围弹出菜单在顶部展示冗余的「当前文件」独立选项，与下方「已关联文件」列表割裂并导致菜单空间狭窄和重复认知负担 | `SubjectWorkspace/index.vue` 移除顶层独立占位的「当前文件」选项；当前学科范围位于顶部，当前文件在下方「已关联文件」列表呈激活状态并附「当前」徽标；菜单最大高度为 380px。当前检索默认开启与范围行为见[实施计划](../../plans/2026-10-12-rag-always-on.md) |

专项测试 `test:r4-pc`（513/513 全部通过），`npm run type-check` 退出 0，`check:subject-workspace` 退出 0。真实桌面端 GUI 交互待人工走查。

### 2026-10-06 PC 首页时间轴左右切换与日/周视图动效优化（确定问题已关闭；自动验证通过，真实 GUI 待验收）

| 等级 / 状态 | 问题与证据 | 处理与验证 |
| --- | --- | --- |
| IMPORTANT / 已关闭 | 首页（Dashboard）点击切换不同星期日程及切换日视图与周视图时，视图内容硬切无动效，缺乏平滑过渡与方向感知 | `Dashboard/index.vue` 接入方向感知的左右平滑滑动 `<Transition :name="`timeline-slide-${timelineSlideDirection}`" mode="out-in">` 与 `<Transition :name="`timeline-mode-slide-${viewModeSlideDirection}`" mode="out-in">`：向右/未来日期与周视图自右向左滑入（`translateX(20px / 18px)`），向左/过去日期与日视图自左向右滑入（`translateX(-20px / -18px)`）；顶部日/周切换胶囊按钮与日期按钮增加微缩放反馈，周视图日期行支持按压反馈并平滑逆向滑回日视图并保留选定日期 |

专项测试 `test:r4-pc`（513/513 全部通过），`npm run type-check` 退出 0，`check:subject-workspace` 与 `check:subject-icons` 退出 0。真实桌面端 GUI 交互待人工走查。

### 2026-10-06 PC 首页切换学科微动效优化（确定问题已关闭；自动验证通过，真实 GUI 待验收）

| 等级 / 状态 | 问题与证据 | 处理与验证 |
| --- | --- | --- |
| IMPORTANT / 已关闭 | 首页（Dashboard）点击切换左侧学科时，中间知识流内容瞬时切换无任何动效，缺乏平滑连续感；左侧学科项点击缺乏微交互反馈 | `Dashboard/index.vue` 接入 `<Transition name="stream-switch" mode="out-in">`，以 120ms 离开淡出与 220ms 从下方 6px 处自然托起浮现实现平滑切换；卡片支持微延迟级联淡入；左侧选项增加按压微缩放与激活绿点弹性展开动效；标题联动展示学科名与知识块统计 |

专项测试 `test:r4-pc`（513/513 全部通过），`npm run type-check` 退出 0，`check:subject-workspace` 与 `check:subject-icons` 退出 0。真实桌面端 GUI 交互待人工走查。

### 2026-10-06 PC 知识总览同步提示移除与文件导入进度体验优化（确定问题已关闭；自动验证通过，真实 GUI 待验收）

| 等级 / 状态 | 问题与证据 | 处理与验证 |
| --- | --- | --- |
| IMPORTANT / 已关闭 | 知识总览卡片（文件大纲与学科总览）上由于后台技术性重试常态化展示黄色/红色“本机总览尚未同步；重新生成并保存后会重试”提示条，严重打扰用户正常阅读大纲 | 从 `FileOutlineList.vue` 和 `SubjectOverviewSection.vue` 中移除该终端提示条，更新 `r4-overview-sync.test.mjs` 测试；待解析状态增加呼吸感微旋转动效 |
| IMPORTANT / 已关闭 | 文件导入进度条在本地极快读写时由 10% 瞬间瞬移跳到 100%，且动效设计冗余繁复（含多层卡片、脉冲光晕与抽屉重复闪现，材料列表堆叠额外文字徽标） | `FileRegisterDialog.vue` 回归 Zen 极简设计（纯净 4px 细轨 + 单行阶段提示 + 等宽百分比数字），采用 `requestAnimationFrame` 缓动推进彻底消除瞬跳突变；移除抽屉顶部冗余进度条，录入完成提供 550ms 轻柔停留展示后关闭弹窗；材料列表项移除文字徽章与报错标签，仅使用轻量状态点做提示，详细解析信息与报错原因保留在个人中心文件解析处查看 |

专项测试 `r4-overview-sync.test.mjs`、`r4-subject-overview-ui.test.mjs`、`r4-register-file.test.mjs`、`r4-document-processing-ui.test.mjs`、`r4-file-preview.test.mjs` 全部通过；`npm run type-check` 退出 0。真实桌面端 GUI 交互待人工走查。

### 2026-10-06 任务完整排期截止校验（确定问题已关闭；自动验证和只读审查通过）

| 等级 / 状态 | 问题与证据 | 处理与关闭条件 |
| --- | --- | --- |
| IMPORTANT / 已关闭 | PC 本地排期仅检查过去时间和重叠；Server TaskService 及旧测试明确允许创建/更新/换位/顺延排在截止之后，与用户确认的完整结束上限不符 | PC 在提交/API 前检查全部新安排，后端 REST/Sync 共享完整区间校验；实际 RED/GREEN，最终 PC 513/513、四脚本 102/102、后端 clean 37/37，事务拒绝及自动完成/墓碑保护回归通过 |
| IMPORTANT / 已关闭 | Antigravity 首版把 null 时长算为 0，紧邻换位与顺延预检计算不符服务端，时间编辑沿用终态豁免；新增测试缺真实创建、offset 和失败后数据断言 | 原隔离工作树补必要实现，执行代理补实际 Store/Repository/API 快照回归，主树 RED 明确复现；完整 diff 和最终门禁均已核对 |

最终单个只读 reviewer 本任务 BLOCKER=0、IMPORTANT=0、OPTIONAL=0，没有修改文件或重跑已完成门禁。历史越界任务非时间编辑、null/30、offset 同 instant 和自动 DONE 保持可保存；恢复与新时间安排受完整上限约束，不批量改数据。没有接口字段、数据库结构、依赖、生成文件或迁移变化，用户既有修改保留。GUI/Tauri、真实服务、双设备同步及实际拖放反馈未业务验收，完整基线、命令、日志和范围见 [实施记录](../../plans/2026-10-06-task-schedule-deadline-guard.md)。

### 2026-10-06 知识块 Markdown 排版与 LaTeX 数学公式渲染（确定问题已关闭；自动验证通过，真实 GUI 待验收）

| 等级 / 状态 | 问题与证据 | 处理与验证 |
| --- | --- | --- |
| IMPORTANT / 已关闭 | `modal.css` 全局 CSS 错误使用 `:deep(h1)`, `:deep(p)`, `:deep(pre)`，浏览器解析原生忽略导致标题、段落、代码块样式完全失效 | 修正为标准全局 CSS 选择器 `.modal-markdown-body h1/p/pre`，补充 h1~h6、列表、引用块、表格、代码及数学公式居中滚动排版 |
| IMPORTANT / 已关闭 | 知识块 LaTeX 数学公式（`$...$`, `$$...$$`, `\(...\)`, `\[...\]`）无法解析渲染，公式字符和反斜杠被破坏或转义为纯文本 | 封装 `src/utils/markdown.ts`，基于 `marked` + `katex` + `dompurify` 实现统一渲染引擎，支持行内/块级公式、货币保护、代码块保护与容错降级 |
| IMPORTANT / 已关闭 | DOMPurify 默认过滤可能清洗掉 KaTeX 输出的 MathML 结构与 SVG 路径导致公式缺漏变形 | 配置 `USE_PROFILES: { mathMl: true, svg: true, html: true }` 并添加白名单标签与属性，保留完整公式呈现 |
| IMPORTANT / 已关闭 | 知识块编辑时缺乏实时渲染预览，用户录入 LaTeX 公式无法直观确认效果 | 在工作区弹窗、划词快速录入弹窗及资产页编辑区新增「编写 / 实时效果（或实时预览）」胶囊切换，支持即时预览 |

专项测试 `scripts/r4-knowledge-markdown-formula.test.mjs` 9/9 通过，覆盖基础排版、行内公式、块级公式、货币保护、代码保护、LaTeX 错误容错、空值安全与纯文本预览提取；`npm run test:r4-pc` 回归通过（497/497 全部通过）；`npm run type-check`、`npm run check:subject-workspace`、`npm run check:subject-icons` 与 `npm run build` 均退出 0。真实 Tauri/桌面端 GUI 交互待人工走查。

### 2026-10-06 未排期任务截止后自动完成（确定问题已关闭；自动验证和只读审查通过，真实 GUI 待验收）

| 等级 / 状态 | 问题与证据 | 处理与验证 |
| --- | --- | --- |
| IMPORTANT / 已关闭 | `useTaskStore.recoverOverdueTasks` 只筛选已排期任务，超期未排期任务不会写回完成；真实 Store/Repository RED 读回 TODO/IN_PROGRESS | 用户确认改为自动 DONE，候选和提交前复判复用完整到期规则，保留 dueAt；最终四脚本 86/86、全 PC 488/488 |
| IMPORTANT / 已关闭 | 委派补丁引用 `isOverdueTask` 但遗漏导入，且返回测试主要检查源码文本 | 主 Agent 依据完整 patch 和当前 import 最小补齐引用，执行代理添加 4 项实际 Pinia/Repository 回归；类型、静态及 build 均退出 0 |
| IMPORTANT / 已关闭 | 同版本 Subject cascade 墓碑不改 TASK payload，自动完成预读及提交仅核对版本会清除 row.deletedAt、重新生成 UPDATE | 真实 cascade RED 四种交错均复现复活；添加自动完成专用 SQL/browser 原子活动行条件后专项 86/86、全 PC 488/488，同一 reviewer 确认关闭 |

首轮 RED 59 项中 6 项失败均为既有产品逻辑差异，harness 实际初始化并运行；追加墓碑条件后的 RED 86 项中 6 项失败明确复现复活和未拒绝墓碑。最终自动测试覆盖延期/改期/取消/删除后的重读保护、未结束排期不被截止提前完成、单项提交失败隔离及重试不重复写入；真实 SQLite/browser 验证原子活动行条件。代码范围仅 Task Store、规则辅助、LocalRepository 及三份专项；API 与 Database 仅更新行为说明，不增加公开接口、持久化字段或迁移。完整脏树基线、命令、退出码、日志及委派信息见 [实施记录](../../plans/2026-10-06-unscheduled-task-deadline.md)。

最终同一只读 reviewer 本任务 BLOCKER=0、IMPORTANT=0、OPTIONAL=0；类型、两项学科静态检查和 build 均退出 0。主 Agent 核对实际日志与本轮 16 文件差分，无依赖、生成文件、删除或跨模块写入，用户既有改动保留。

未 clean 的 Server 两项检查最初因旧构建产物类加载失败，正常 clean 重编译后 2/2；后端源码、配置和依赖未修改。真实分钟定时器、GUI/Tauri、运行服务和双设备同步未人工验收，脚本测试不替代这些验收。

### 2026-10-01 提问选中文本处理（代码与自动验证通过；真实 Provider/GUI 待验收）

| 等级 / 状态 | 问题与证据 | 处理 |
| --- | --- | --- |
| IMPORTANT / 已关闭 | UI 将引用交给 ChatStore，但请求体曾丢失 selectionText；真实 Store/fetch 回归 RED 实测 undefined | selectionText 通过独立顶层字段传递，不修改用户消息正文；应用 Antigravity 单行补丁后 focused 5/5、最终 PC 478/478 |
| IMPORTANT / 已关闭 | PromptAssembler 先填历史再填引用，可能静默丢弃/截断本次引用；selected 文本原来使用 SYSTEM 角色 | 本次问题和引用优先预留预算，引用为 USER 资料，固定安全说明；RED 4 项中 2 项失败，最终 Server 47/47 |
| IMPORTANT / 已关闭 | 仅在异步 SSE 线程检查预算，HTTP 已返回 200 才出现校验错误 | Controller 在响应开始前同步调用 Service 同一校验；真实 MockMvc 验证 HTTP 400 和明确预算 detail，最终 Server 47/47 |

授权范围、完整脏树基线、契约和最终证据见 [实施记录](../../plans/2026-10-01-chat-selected-text.md)。前端 UI 保持用户现状，后端请求字段沿用现行提问接口扩展；OpenAPI/SDK 校验退出 0，真实 Provider 与 GUI 尚未验收。

最终单个只读 reviewer 本轮 BLOCKER=0、IMPORTANT=0、OPTIONAL=0；命令和证据已回写，不把捕获型 Provider 测试写成真实模型服务验收。

### 2026-10-01 学科编辑保存排查（本轮确定问题已关闭；真实 GUI 待验收）

| 等级 / 状态 | 问题与证据 | 处理 |
| --- | --- | --- |
| IMPORTANT / 已关闭 | `SubjectCreateModal.handleSave` 发出事件后提前关闭，父级异步提交失败时表单消失；Hall 仅 console 记录错误 | 等本地提交成功后关闭，失败通知并保留输入重试；专项 7/7 |
| IMPORTANT / 已关闭 | Hall 将只含表单字段的对象直接交给要求完整 Subject 的 Store，丢失 sortKey/createdAt；既有 iconKey 会优先于新选 icon | 合并当前完整模型并明确写入 iconKey，保留表单原版本；真实本地 mutation/投影回归通过 |
| IMPORTANT / 已关闭 | 延后关闭后，保存期间重复点击产生多笔 UPDATE；旧完成还能关闭重新打开的弹窗 | 首个 await 前保存守卫与既有 ModalShell 关闭守卫，finally 释放；专项 RED 已复现，最终回归通过 |
| OPTIONAL / 独立待办 | 既有 `useSyncStore` 先持久化远端墓碑、再异步 hydrate；Pinia 暂留 Subject 时 `useSubjectStore.updateSubject` 无 durable 存在/未删校验，`commitMutation` 可写活动 UPDATE | 后续在 Store/Repository 原子写入边界校验存在、墓碑及版本。本轮仅拦截当前 Store 列表已无目标的保存；不修改既有同步事务边界 |

首轮专项 5 项中 4 项失败，最小字段/关闭/错误反馈补丁后 5/5；追加保存竞态后 7 项中 2 项失败，最终 7/7。测试运行实际 SFC 回调和真实 Pinia/LocalRepository，延迟/拒绝真实提交边界，覆盖失败输入保留、一次 mutation、元数据、图标、缺失目标和创建跳转；不是浏览器挂载验收。

最终验证日期 2026-10-01，工作目录 `Auralis-PC`，执行代理返回以下退出码；主 Agent 读取日志核对、未重复普通门禁。日志根目录为 `C:\Users\Gnasche\AppData\Local\Temp`：

| 命令 | 退出码 / 结果 | 日志或证据 |
| --- | --- | --- |
| `node --experimental-strip-types --test scripts/r4-subject-edit.test.mjs` | 0，7/7 | 执行代理实际输出；同 7 例完整输出另包含于下列全套日志 |
| `npm.cmd run type-check` | 0 | `auralis-subject-edit-final-type-check.log` |
| `npm.cmd run test:r4-pc` | 0，477/477，fail/cancelled/skipped/todo 均 0 | `auralis-subject-edit-final-test-r4-pc.log` |
| `npm.cmd run check:subject-icons` | 0，contract passed | `auralis-subject-edit-final-check-subject-icons.log` |
| `npm.cmd run check:subject-workspace` | 0，contract passed | `auralis-subject-edit-final-check-subject-workspace.log` |
| `npm.cmd run build` | 0，6.25s，renderer assets 47/47 | `auralis-subject-edit-final-build.log` |

单个只读 reviewer 最终 BLOCKER=0、IMPORTANT=0；OPTIONAL 仅上表既有同步删除风险。本轮完整脏树基线 `70b0af33457d80721671ee1370f06628c1ca3bff`，代码只改两 Vue、package 测试入口及新增专项脚本，无依赖/删除/跨模块写入。Antigravity 实际生成补丁，Codex 审查筛选必要改动、执行代理完善并验证；原 watcher 与用户未提交改动保留。构建仍有既有 externalization、`:deep`、chunk 和 dynamic import/plugin timing 提示。真实浏览器/Tauri 操作、原用户数据库故障与远端服务未验收。

### 2026-10-01 学习数据调整跟踪（本轮确定问题已关闭；真实环境待验收）

本节覆盖早先 Home、summary/preview 派生和 Overview 只存本机的当前实现描述。最终 PC 类型/静态/构建退出 0、回归 470/470；单个只读 reviewer 本任务范围 BLOCKER=0、IMPORTANT=0。下表保留原问题级别与关闭依据，早先门禁计数只作历史证据。

| 等级 / 状态 | 问题或边界 | 处理与验证 |
| --- | --- | --- |
| IMPORTANT / 已关闭 | 专注事件离线后与任务完成/删除发生先后变化 | 历史事件只校验 task owner；任务完成/软删除后补传与跨用户拒绝覆盖于 Server 边缘 fresh 7/7，reviewer 确认 |
| IMPORTANT / 已关闭 | Overview 半成品上传、丢失候选或超时重复覆盖 | 完整成功提交、缓存/intent 原子保存、稳定 ID/body 重放与 revision/manifest/baseVersion 围栏；Overview 主 focused 104/104、PC 470/470 与 reviewer 确认 |
| IMPORTANT / 已关闭 | Source 移动学科后删除原学科误删成果 | Subject 只清理 SUBJECT scope，当前子 Source 由各自 DELETE 事件清理；移动后保留成果/最终 Source 删除回归包含于 Server 最终 fresh 57/57 |
| IMPORTANT / 已关闭 | 跨页搜索详情通知先于 Dashboard 挂载而丢失 | 一次性 openBlock query 在 Dashboard 挂载/参数变化时消费，保持 `/` 跳转；导航 focused 与 PC 470/470 通过 |
| 疑点 / 已排除 | 旧 KnowledgeBlock immutable Sync 请求含弃用扩展字段 | 真实旧 payload push/replay 均 APPLIED、同 cursor、正文保留；未复现 mapper 严格解析疑点，未添加注解或改写请求/receipt；Server 最终 57/57 |
| IMPORTANT / 已关闭 | 混有 READY TEXT/URL 的学科成果 manifest 与 PC 文件输入不一致 | 当前 manifest 仅活动 READY FILE；混合类型回归包含于 Server 57/57，API/Database 已登记 |
| IMPORTANT / 已关闭 | Overview 网络等待期间本地资料修订/成员变化 | 动态 owner-scoped 当前态检查与写队列 generation token 复核；await 中修订/删除/成员变化覆盖于 Overview 主 focused 104/104，reviewer 确认 |
| IMPORTANT / 已关闭 | Tauri SQL 插件池不保证多调用事务使用同一连接 | 任何 SQL 前固定 max/min 1、关闭正常 idle/lifetime 回收，保留既有队列/native snapshot；Rust 实际池 commit/rollback 1/1、fmt/check 与 PC 类型/构建退出 0，reviewer 确认 |
| IMPORTANT / 已关闭 | 首轮 PC 类型检查暴露旧 facade 与 Task 展示类型不一致 | 最小适配 legacy 本地字段、Task 备注类型和 unused import；正式知识块字段未恢复，备份保留；最终 type-check/build 退出 0 |
| IMPORTANT / 已关闭 | 远端写入成功但本机 ACK 失败被标终端 ERROR | ACK 故障后同 ID/完整 JSON 重放，终端服务错误单独 ERROR，新明确候选可替代；FILE/SUBJECT 回归包含于 Overview focused 104/104，reviewer 确认 |
| IMPORTANT / 已关闭 | 删除清理与迟到 Overview 安装存在提交窗口 | owner/device/scope ticket 首 await 前建立，install/complete 写边界复核 generation，恢复不接纳旧响应；Overview 104/104 与失败恢复 67/67、reviewer 确认 |
| IMPORTANT / 已关闭 | 已有冲突时普通新候选绕过显式冲突选择 | 新生成/保存仍为 CONFLICT，显式 LOCAL 才用最新 baseline 和新 ID 上传；FILE/SUBJECT 回归包含于 104/104，reviewer 确认 |
| IMPORTANT / 已关闭 | Subject 父墓碑已提交后清理失败错误解除删除围栏 | durable parent 墓碑后 cascade/Overview cleanup 故障保持围栏，迟到保存拒绝；subject-deletion-cascade 10/10、reviewer 确认 |
| IMPORTANT / 已关闭 | Source 删除未提交前隐藏投影并删除未同步成果 | commit 成功后才移除投影/discard；失败保留 cache/outbox 固化 body、已提交清理由 reconcile 重试；store-local-asset-flow 24/24、file-preview 33/33 |
| IMPORTANT / 已关闭 | 拒绝 Subject 删除后的 snapshot 修复窗口误终结本地草稿 | 生命周期锁内复核 resetRequired、当前 Source/Subject/未决 DELETE，破坏性边界再读；保留原空服务器 sources fixture，local-only 恢复回归通过，store-local-asset-flow 24/24 |
| OPTIONAL | 12 项偏好没有接通实际业务效果 | 用户仅要求汇总，保留设置；详见 FrontendPC，不在本轮增加业务实现 |
| 待验收 | Tauri 重启迁移、真实服务、双 PC 成果收敛 | 需要 GUI/设备/Provider 业务证据；本轮自动检查不能代替 |

完整命令、日志及各轮重叠说明见 [实施与验证记录](../../plans/2026-10-01-pc-learning-data-cleanup-and-sync.md)。Mobile/Tablet 本轮仅必要 SDK/知识块契约适配，不宣称已接入专注或 Overview 成果展示；真实环境验收与代码/自动检查状态分开记录。

### 2026-10-01 PC 知识块正文/摘要解耦、学科关联保存修复与内容展示重构（已修复）

- **问题与根因分析**：
  1. **问题 1（正文修改失效与摘要截断）**：此前首页弹窗、工作区弹窗及资产页内联编辑中均使用 `preview` 作为输入绑定，而 `preview` 在底层映射的是 `summary`；保存时正文 `content` 未改变，且选中文本创建的知识块摘要会被截断至 180 字符，导致保存后详情正文仍是旧内容、长文显示不全；
  2. **问题 2（首页分类修改未生效）**：此前首页知识块编辑表单为自由文本 `editForm.subject`，保存时仅向后端提交原 `subjectId`，修改文字不会触发学科转移，刷新后恢复原学科；
  3. **问题 3（内容展示未做好与弹窗割裂）**：首页此前使用独立写死的内联 520px 窄弹窗，与系统级 `ModalShell` 脱节，正文缺乏卡片封装、无跳转学科按钮；工作区弹窗（`WorkspaceKnowledgeBlockDialog.vue`）浏览模式内容展示也只是平铺文本；列表卡片仅取可能为空或截断的 `preview`，未做 fallback 与 3 行优雅截断。
- **修复方案与实施**：
  1. **全链路正文与摘要解耦**：
     - `useKnowledgeStore.ts`：`addBlock` 与 `updateBlock` 显式解耦 `content` 与 `summary`，若未指定摘要则自动提取正文前 180 字符作为 `summary/preview`；`updateBlock` 引入 `useSubjectStore`，当 `block.subjectId` 变更时自动刷新映射新学科名称；
     - `Home/index.vue`、`WorkspaceKnowledgeBlockDialog.vue`、`Asset/index.vue`、`KnowledgeBlockEditor.vue` 全量将文本编辑区绑定至真正的正文内容 `content`，彻底消除旧正文残留与截断问题；
  2. **学科转移与真实绑定**：
     - `Home/index.vue` 编辑表单将原自由文本升级为 `<el-select v-model="editForm.subjectId">` 下拉选择器；保存时提交目标 `subjectId`；
     - `Asset/index.vue` 纸张卡片顶部将只读文本升级为所属学科下拉选择器 `<el-select v-model="selected.groupId">`，支持在资产页内联转移学科，保存后自动重载资产树；
  3. **去掉摘要说明与去掉标签**：
     - 全面移除表单中的“摘要说明 (Summary)”与“知识标签 (Tags)”输入框，正文编辑区（“知识内容”）自适应拓宽为主编辑视口，保存时自动派生 `preview`；
     - 彻底清除查看态中的标签列表展示（首页阅读弹窗、工作区阅读弹窗、资产库顶部标签胶囊），实现沉浸、纯粹的笔记阅读体验；
  4. **首页与学科工作区内容展示全面升级（杂志级排版）**：
     - **弹窗全面升级**：首页知识块弹窗重构为系统级 `ModalShell size="lg"`（760px 舒适大画布），与工作区弹窗（`WorkspaceKnowledgeBlockDialog.vue`）统一采用双层卡片排版——上设 `.kb-meta-card` 展示大标题、来源文件图标、友好相对时间与学科胶囊，下设 `.kb-content-card`（`#FAF7F2` 温润宣纸底板，微边框与底阴影），支持代码高亮与完整 Markdown 样式，为空呈现插图空状态；
     - **操作闭环**：底部新增带绿色勾反馈的“复制内容”按钮，首页弹窗新增“前往知识块界面”直达按钮（一键跳至对应学科工作区并切换至知识库 Tab）；
     - **卡片展示强化**：首页与工作区知识块卡片预览均采用 `block.preview || block.content || '暂无详细内容'`，配合 `-webkit-line-clamp: 3` 与人性化时间，彻底消除截断与空白。
- **门禁与测试**：`npm.cmd run type-check` 退出 0、`npm.cmd run test:r4-pc`（433/433 项全部通过）、`npm.cmd run build` 生产构建通过。真实 GUI 视觉效果待人工验收。

### 2026-10-01 PC 所有弹窗配色对调与按钮/输入框底阴影优化（已修复）

- **现象与需求**：
  1. 用户反馈：“所有弹窗的配色换一下现在框内配色和背景配色对调一下”；
  2. 用户进一步要求：“然后按钮和输入框底下都加个阴影”。
- **分析与设计**：
  1. 原设计中，弹窗大底板为 `--color-bg-tertiary (#FAF7F2)` 浅宣纸米白，框内输入控件（input / textarea / select）与嵌套卡片（`.modal-card-inset` 等）为 `--color-bg-primary (#F7F2EB)` 燕麦米灰；
  2. 按照要求对调后：弹窗主卡片容器背景 `--modal-bg` 设为 `var(--color-bg-primary, #F7F2EB)`（深色模式：`var(--color-bg-primary, #1f1e1c)`）；框内控件与内嵌卡片 `--modal-inset-bg` 设为 `var(--color-bg-tertiary, #FAF7F2)`（深色模式：`var(--color-bg-tertiary, #2e2c29)`），呈现更为干净、透亮的框内聚焦质感；
  3. 立体阴影：表单输入控件（input、textarea、select）底部追加轻柔立体微阴影 `0 1.5px 4px rgba(0, 0, 0, 0.05), 0 0.5px 1.5px rgba(0, 0, 0, 0.03)`（深色模式：`0 2px 6px rgba(0, 0, 0, 0.35)`），聚焦态保持微光光晕与底阴影叠合；
  4. 按钮系统：次级按钮（`.modal-btn-secondary`）追加 `0 1.5px 4px rgba(0, 0, 0, 0.06)` 底阴影（hover 强化至 `0 3px 8px`）；主按钮与危险按钮强化深层立体漫反射阴影；弹窗内学科与提示词芯片（`.subject-chip`、`.preset-chip`、`.icon-btn`）统一追加底阴影与悬浮微升微交互。
- **改动范围**：
  - `src/components/modal/modal.css`：Token 与全局输入控件、按钮样式更新；
  - `src/components/knowledge/KnowledgeBlockViewDialog.vue`：`.kb-meta-card` 与 `.kb-content-card` 统一使用 `--modal-inset-bg`；
  - `src/components/task/TaskCreateDialog.vue`：滑轨 `.duration-segmented-track` 与 `.subject-chip` 对调底色并追加阴影；
  - `src/components/subject/SummaryInstructionDialog.vue`：`.preset-chip` 对调底色并追加阴影；
  - `src/components/subject/SubjectCreateModal.vue`：`.preview-row` 与 `.icon-btn` 对调底色并追加阴影；
  - `src/components/asset/FileRegisterDialog.vue`：`.drop-zone`、`.upload-progress` 与 `.subject-chip` 对调底色并追加阴影；
  - `src/components/knowledge/WorkspaceKnowledgeBlockDialog.vue`：颜色选择微圆点外圈高亮同步新的 `--modal-bg`。
- **门禁与测试**：`npm.cmd run type-check` 退出 0，`npm.cmd run test:r4-pc`（433/433 项全部通过），`npm.cmd run build` 生产构建成功。真实 GUI 视觉效果待人工验收。

### 2026-10-01 PC 首页知识块展示弹窗排版与交互体验重构（已修复）

- **现象与根因**：用户反馈“首页知识块展示的弹窗没做好”。
  1. 结构与 `ModalShell` 严重脱节：原 `KnowledgeBlockViewDialog.vue` 将来源、学科、20px 大标题、记于时间等整个信息头全部塞入 `#title` 插槽，导致 Header 高度被撑大到上百像素，右上角关闭按钮在半空中与内容严重脱节，且大标题易与关闭按钮发生水平挤压；
  2. 时间展示机械生硬：时间直接使用原始 UTC ISO 字符串（`记于 2026-09-25T...`），未做相对时间人性化转换；
  3. 标签与来源信息缺失：未呈现知识块已关联的标签（`tags`），正文区域缺乏微内嵌卡片质感，为空时缺乏空状态说明；
  4. 交互单薄：无法一键跳转至该知识块所属的学科空间。
- **修复**：
  1. 结构规范化：对齐 `ModalShell`，`#header-icon` 展示精致的 28px 圆角渐变笔记图标，`#title` 展示紧凑单行主标题与学科胶囊微标签，右侧关闭按钮严丝合缝居中对齐；
  2. 杂志级正文卡片排版：正文移至 Body 内部独立的 `.kb-article-container`，上设元信息卡片呈现大标题、来源文件图标、友好的相对时间（如“10分钟前”，hover 显示完整本地时间），去除冗余标签展示保持版面纯粹；下设宣纸底色的独立滚动 Markdown 正文卡片，配精致空状态；
  3. 操作闭环与直接定位知识块：底部左侧支持“复制内容”（成功带绿色对勾状态），新增“前往知识块界面”直达按钮（若有 `subjectId`，携带 `?view=blocks` 路由参数，一键直接跳转至对应学科的知识块工作区界面，`SubjectWorkspace` 自动切换 `centerView = 'blocks'` 并收起侧栏）；右侧配置“完成阅读”主操作按钮；
- **门禁验证**：`npm.cmd run type-check` 退出 0，`npm.cmd run test:r4-pc`（433/433 项全部通过）。

### 2026-10-01 PC 文件解析失败（Embedding provider unavailable 等）增加重试按钮与就地重试流（已修复）

- **现象与根因**：
  1. 服务端在文件解析的向量化（Embedding）阶段若遇上游网络中断或模型服务不可用，会将 `Source` 的 `ingestionStatus` 设为 `FAILED`，并将错误信息（如 `Embedding provider is unavailable`）写入 `safeErrorDetail`；
  2. 个人中心解析进度面板（`DocumentProcessingCenter.vue`）中此前仅为 `AWAITING_CLIENT` 提供了“开始本机处理”按钮，当状态为 `FAILED` 时右侧操作栏为空，没有提供重试入口；
  3. 学科工作区（`SubjectWorkspace/index.vue`）中，当前选中文件解析失败时，主预览区缺乏错误警示横幅与就地重试操作。
- **修复**：
  1. `useSourceStore.ts`：实现并导出 `retrySourceProcessing(sourceId: string)`，从本地 repository 或内存读取当前 `baseVersion`，调用后端 `POST /api/sources/{id}/reingest` 重新发起服务侧向量化或客户端解析，通过 `upsertFromSync` 同步持久化状态并更新响应式列表；若需要客户端二次处理则自动调度 `documentScheduler.schedule`；
  2. `DocumentProcessingCenter.vue`：为 `serverProcessingSources` 中 `source.ingestionStatus === 'FAILED'` 的项增加“重试”按钮，并引入 `retryingSourceIds` 状态管理重试中禁用与视觉反馈；
  3. `SubjectWorkspace/index.vue`：在选中的文件处于 `FAILED` 状态时，于主预览区顶部呈现高雅警示横幅 `.file-processing-alert-banner`，直观展示失败原因及“重试解析”按钮；
  4. 测试与验证：更新 `scripts/r4-document-processing-ui.test.mjs`，`npm.cmd run type-check` 0 错误，`npm.cmd run test:r4-pc`（433/433 项全部通过）。

### 2026-10-01 PC 弹窗审阅问题闭环修复

- **审查反馈与处理**：
  1. **文件上传弹窗过早关闭与格式限制**：`src/views/Asset/index.vue` 不再在启动上传时立即关窗，向 `FileRegisterDialog` 透传 `is-uploading`、`upload-progress`、`upload-stage` 与 `accepted-extensions`，成功后延时平滑关闭，失败保留弹窗与表单供用户重试；`FileRegisterDialog` 默认扩展名统一为 `SUPPORTED_UPLOAD_EXTENSIONS`（PDF/Office），避免允许不支持的类型导致上传失败。
  2. **弹窗无障碍名称补齐**：`TaskCreateDialog`、`ChangePasswordDialog`、`SummaryInstructionDialog` 显式向 `ModalShell` 传入 `title` 与 `aria-label`；`ModalShell.vue` 增强 `effectiveAriaLabel` 与 `effectiveAriaLabelledBy` 解析，在提供自定义标题插槽时也能正确获取 accessible name。
  3. **知识块编辑弹窗键盘与焦点管理**：`src/components/knowledge/KnowledgeBlockEditor.vue` 接入统一 `ModalShell`，补齐打开时首项聚焦、Tab 循环、Escape 关闭与关闭后焦点恢复。
  4. **任务弹窗时长规则与文档同步**：`TaskCreateDialog` 专注时长严格对齐系统整半小时规则（30m~4h 7 档位），采用一体化磁吸分段滑轨；同步修正 `docs/modules/FrontendPC.md` 中的记录。
- **验证结论**：`npm.cmd run type-check` 退出码 0，`npm.cmd run test:r4-pc`（433/433 项全部通过）。真实 GUI 视觉走查仍需人工验收。

### 2026-09-29 PC 弹窗视觉收敛

- **用户反馈与改动**：用户认为当前弹窗观感较差。现行样式的 14px 遮罩模糊、24px 外框圆角、36px 横向留白和多个装饰性标题图标使弹窗与 PC 工作台的信息密度不一致；本轮在现有组件边界内收敛至 5px 模糊、16px 外框圆角、420/520/680/840px 宽度档位和 24px 横向留白，简化标题及小控件造型，未修改 Store/API、表单字段或提交/关闭事件。
- **验证与剩余风险**：`npm.cmd run type-check`、`npm.cmd run test:r4-pc`（433/433）、`npm.cmd run check:subject-icons`、`npm.cmd run check:subject-workspace`、`npm.cmd run build` 均退出 0；临时静态外壳预览已查看。真实业务数据下的浏览器/Tauri 弹窗、深色模式、窄屏、长表单与关闭/焦点行为仍待 GUI 走查，不能据自动门禁宣称业务验收完成。

### 2026-09-27 PC 全局弹窗无缝流式 UI 重构、8px 工程化按钮系统与组件化提取（Modal & Dialog Refactoring）

- **背景与目标**：此前 PC 端各个视图分散内联自制弹窗（`Dashboard`、`Timeline`、`Profile`、`Asset`、`SubjectWorkspace`），样式代码重复、尺寸不一、硬线条切块生硬、按钮缺乏工程质感、缺乏全局设计美学规范与焦点无障碍管理。目标是在不破坏业务逻辑、不改变响应式状态归属、不破坏既有测试断言的前提下，彻底重构弹窗 UI 美学（参考 Linear、Vercel 及 macOS 设计语言：一体化无缝呼吸画布、彻底消除硬横线分割、16px 精确工程圆角、低反差双层环境漫反射阴影、8px 精准圆角矩形按钮体系与精密负字间距标题排版），建立统一的 `ModalShell` 基础组件并提取 6 个独立业务弹窗。
- **实施架构与视觉重构清单**：
  1. 基础规范与设计系统：`src/components/modal/modal.css`（Token、5 档尺寸规范 `sm`/`md`/`lg`/`xl`/`auto`、8px 精准圆角 `.modal-btn`、8px 圆角表单控件与 5px 轻薄定制滚动条）与 `src/components/modal/ModalShell.vue`（Teleport、无缝吸顶标题栏、独立平滑滚动内容区、无缝吸底停靠操作栏、毛玻璃滤镜与微缩放动效）；
  2. 提取业务弹窗并深度美化：
     - `src/components/profile/ChangePasswordDialog.vue`（增加盾牌图标顶栏、无边框柔和安全建议横幅与带图标错误提示条）
     - `src/components/subject/SummaryInstructionDialog.vue`（增加 AI 星光顶栏、6px 轻量无边框提示词胶囊按钮组与字数统计）
     - `src/components/task/TaskCreateDialog.vue`（增加日历顶栏、6px 圆角学科微标签、紧凑现代专注时长滑条与圆角手柄）
     - `src/components/asset/FileRegisterDialog.vue`（轻柔虚线拖拽区域、8px 方圆图标、上传状态动态呼吸绿点与轻薄进度条）
     - `src/components/knowledge/KnowledgeBlockViewDialog.vue`（常驻标题栏、无框流式 Markdown 独立滚动区，彻底消除双重滚动条与框中框，优雅复制/确定按钮）
     - `src/components/knowledge/WorkspaceKnowledgeBlockDialog.vue`（消除浏览态双重滚动条与硬线条分割，将调色盘重构为现代微圆点）
  3. 统一外壳改造：
     - `src/components/subject/SubjectCreateModal.vue`（学科空间创建/编辑）全面接入统一 `ModalShell`（`size="md"`），顶层卡片升级为现代紧凑微卡片，8 列图标选择网格升级为 8px 圆角轻触按键，保留 `version: props.subjectData.version` 契约断言；
     - `src/components/ConfirmDialog.vue`（通用确认对话框）全面接入统一 `ModalShell`（`size="sm"`），移除笨重徽章，标题栏内嵌精致图标与字号微调（15px/600/-0.01em），正文舒展呈现，搭配次要幽灵按钮与危险/主要 8px 圆角确认按键；
- **契约保护与兼容**：
  - `Timeline/index.vue`：保持 `/duration:\s*newTaskForm\.value\.duration\s*\|\|\s*60/` 契约断言；
  - `SubjectWorkspace/index.vue`：保持 `!registerForm.subjectId || !droppedFile || isUploading`、`createFileSource(targetSubjectId, registerForm.value.name.trim(), ...)`、`SUPPORTED_UPLOAD_EXTENSIONS.join(',')` 与 `validateUploadFile` 契约断言；
  - `Profile/index.vue` 与 `OverviewSummaryView.vue`：保持密码长度校验与 2000 字限制断言；
- **门禁与测试**：PC 全量回归 `npm.cmd run test:r4-pc`（433/433 全量通过），`npm.cmd run type-check`（0 error）、`check:subject-icons`、`check:subject-workspace` 与 `npm.cmd run build` 生产构建均顺利通过。

### 2026-09-27 PC 任务编排中心下周排期精确自然日比对与槽位计算修复

- **现象与根因**：用户反馈“下周的还显示当周的”。排查定位到 `useTaskStore.ts` 中 `rebuildSchedule` 与 `dateForDay` 此前仅依赖 `DayCode` ('Mon'~'Sun') 匹配当周星期几，且 `rebuildSchedule` 限定只拉取 `getTasksForTimeline` 当周区间的任务，导致点击侧栏下周的某一天（如下周一 `2026-10-05`）时，`taskStore` 将下周一的选中态降级归为当周一 `Mon` 匹配，从而把当周一的任务错塞进了下周一的时间槽中。
- **修复与打通**：
  1. `useTaskStore.ts`：扩展 `dateForDay` 原生解析 `YYYY-MM-DD` 格式 `dateKey`，直接构造指定年月日的精确 `Date` 对象与 ISO 字符串；扩展 `rebuildSchedule` 支持 `targetDateKey`，并在 `setSelectedDay` 中接受 `dateKey` 参数，彻底打通跨周精准比对；
  2. `Timeline/index.vue`：`selectDay` 传递 `(dayCode, dateKey)` 给 `taskStore.setSelectedDay`，并由选中的 `selectedTimelineDay.dateKey` 准确派生槽位任务与选中效果，确保点选下周任意一天时只渲染下周该天的实际排期任务。
- **门禁验证**：PC 全量回归测试 `npm.cmd run test:r4-pc`（433/433 全量通过），`npm.cmd run type-check` 类型检查通过。

### 2026-09-27 PC 任务编排中心下周排期概览实现

- **需求与实现**：响应在任务编排中心（`Timeline/index.vue`）侧栏中无需 Tab 切换、直接展示“下周排期概览”的要求。在侧栏原本的“本周排期概览”下方新增“下周排期概览”区块，与本周视觉卡片 100% 同款对齐。
- **关联数据流**：在 script 中新增 `nextWeekTimelineDays`（`taskStore.currentNow` + 7 天的 7 天时间段）与 `allTimelineDays`；引入 `getScheduledTasksForDateKey` 精确比对具体自然日的已排期任务；支持点击下周任意一天，`selectedTimelineDay` 自动联动更新中间栏“时间流细节”标题及当天半小时槽位细节。
- **门禁验证**：PC 全量回归 `npm.cmd run test:r4-pc`（433/433 全量通过），`npm.cmd run type-check` 退出 0。

### 2026-09-27 PC/Service 风险修复与剩余边界

- **Suggestions 暂藏**：PC 无可见界面入口，未使用的 `aiClient` 调用封装已移除；Server 确定性基线接口和既有 API 契约仍保留。真实 LLM、citation 与质量验收未完成，开放条件不变。
- **Timeline 本地半交换**：两条服务端交换响应现用一个 SQLite 事务写入，第二条注入失败可回滚首条；cursor/outbox 不变，随后增量同步恢复两项排期。浏览器 fallback 一次提交；服务端成功而本地失败时一次更新两项内存投影并请求读同步。PC 全量 433/433、type-check 通过；真实 GUI/双设备待验收。
- **Sync cursor=0 保留期缺口**：按 owner 高水位与最早保留 cursor 检测省略/零 cursor 的部分或全部日志清理；新空用户和完整历史不误 reset。Sync 聚焦 15/15 通过，真实 PostgreSQL 长期清理与双设备待验收。
- **Overview 输入及并发**：Subject 输入先建立全部 alias，允许前项引用请求中后项；Source 同键进行中调用在单个服务实例内按含标题的键复用 Provider 结果。Overview 聚焦 46/46 通过；跨实例并发仍可重复生成，真实 Provider/代理时延与 PC 300 秒总超时仍待验收。
- **Source ingestion 更新竞态**：TEXT/URL 解析输入变化轮换 revision；不同修订独立 job。Source 与 job 同事务持久化，入队失败时 Source 与 change log 一起回滚；恢复仍在处理中的 Source 时按当前 revision 补建或复用 job。完成/失败均按当前 revision、job/generation、attempt 和锁后有效 lease 栅栏化；成功的 Source READY、chunks、job READY 同事务提交。相关 clean 聚焦测试纳入 114/114，PostgreSQL pgvector 2/2 通过；真实运行和长耗时 Provider 尚未验收。
- **本轮门禁**：PC 433/433/type-check、Server clean 114/114 与 PostgreSQL 2/2；`check:r4-pc` 因未改 Rust 测试固定地址扫描退出 1。不能据此宣称业务验收完成。

### 2026-09-26 PC 功能缺口定向修复与开放验收

- **首次同步漏数风险（代码修复）**：PC 在 `cursor=null` 时改为先请求完整 snapshot，避免新设备因服务端超过日志保留期的变更被清理而只获得近期增量。snapshot 保留未解决本地写入并刷新 Subject、Source、KnowledgeBlock、Task、Relation 投影；Tauri SQLite 快照也保护 `inflight` mutation。Sync 定向 13/13、Rust 定向 1/1、类型检查通过。真实双设备、长期离线和服务端保留期场景未联调。
- **AI 显式参考范围（代码修复）**：当前文件默认 `AUTO`；显式多文件只检索当前文件与用户所选的同学科 READY Source，最多 100 份；全学科模式必须由用户显式选择。Server 验证 Subject owner/active、Source owner/归属/READY；PC 定向 3/3、Server clean 检索 12/12 与模块边界 1/1、PC 类型检查通过。clean 重编译后 OpenAPI runtime artifact 8/8，重新导出 artifact、生成双端 SDK，`check-openapi.ps1` 退出 0。真实 Provider/向量检索与 GUI 未验收。
- **Overview 与状态/预览（代码修复）**：PC Overview 请求单次超时 300 秒，仍可能在更多轮 Provider 调用时超时；纯显示名变化不重载预览，内容身份变化仍重载；通用 HTTP 5xx/网络/超时进入全局服务状态，响应按请求序号裁决且取消不改状态。对应 PC 定向 47/47、32/32、8/8 通过。真实 Server、Tauri GUI 与网络竞态仍待验收。
- **个人空间说明（文案修正）**：JSON 导出明确只含知识块与任务；AI 请求经 Server 转发，登录密码说明为单向哈希保存。原始文件备份/恢复能力未新增。
- **本轮整体门禁**：PC 全量回归 430/430、type-check 与生产构建通过；`check:r4-pc` 仍因未修改的 `local_asset_store.rs` 测试固定地址规则退出 1，不能称全门禁通过。

### 2026-09-26 PC 未完成排期任务提前划掉（Line-through）问题修复

- **现象与根因**：用户反馈“排期还没完成就被划掉了，但是勾选状态是正确到任务完成才勾选”。排查发现 `Timeline/index.vue` 中对 `.is-past`（排期时间落入过去时刻的任务）在 CSS 1524–1530 行设置了无条件删除线 `.is-past .task-name, .is-past .task-detail ... { text-decoration: line-through; }`。导致时间过期的排期任务即便【尚未完成】（勾选框未勾选、`isCompletedScheduledTask` 为 false），其文字内容也被强制渲染了划下划线（划掉）样式，导致界面文字渲染与勾选状态脱节。
- **修复**：移除 `Timeline/index.vue` 中 `.is-past` 导致的强制删除线样式。划线删除样式与浅色半透明灰度收敛由 `.is-completed` 统一控制（即仅当 `isCompletedTask` / `isCompletedScheduledTask` 为 true 任务真实完成时才应用 `line-through` 样式与勾选标记）。
- **验证与门禁**：PC 全量回归测试 `npm.cmd run test:r4-pc`（423/423 全量通过），`npm.cmd run type-check` 类型检查通过。

### 2026-09-26 Issue 2/6/7 定向修复与待验收边界

- Issue 2：PostgreSQL 查询原已在 TopK 前过滤软删除 Source；H2/fallback 曾先取 TopK 再过滤引用，删除 Source 的高分旧 chunk 可挤占有效名额。现先批量读取当前用户活动 Source，再排序取 TopK；定向 RED 复现空 citation，GREEN 8/8，PostgreSQL 17/pgvector 2/2 覆盖删除竞争和恢复后新 generation 可检索。
- Issue 6：`DocumentProcessingStore.start/resumePending` 原可直入 Runner；现通过 SourceJobScheduler。当前 UI 手动开始、retry 与 runtime 恢复原已走 Scheduler；PC 相关运行时回归 66/66、type-check 与 build 通过。只读审查将 Store `resumePending` 仍沿用旧 Runner 的本地阶段筛选列为 OPTIONAL：正式 runtime 恢复直接把全部 Source ID 交给 Scheduler，本轮未扩大该 Store 方法语义。
- Issue 7：Source 列表/分页及 Retrieval citation 的逐条查询改为 owner-scoped 批量读取；测试验证两条 FILE Source 为 1 次 Source 查询加 1 次 Asset 批量查询，引用候选 Source 一次批量查询，保持顺序和内容。`check:r4-pc` 仍被未改 Rust 文件的固定地址规则阻断。真实运行、GUI、负载性能和多数据量查询计划尚未验收；本轮未改 API/schema。

### 2026-09-26 注销作业到期后运行复核

- 用户重建前后端并重试后，指定账号的精确关联作业从 `PENDING` 在 `not_before=06:49:18.077669 UTC` 后转为 `COMPLETED`，完成时间 `06:50:10.172777 UTC`；用户行已删除，`last_error` 为空。针对该用户归属的 21 张清理表和本作业对象键记录只读统计均为 0。前后端运行镜像与各自本地 tag 一致。
- 验收边界：数据库确认本次账户物理清理完成；尚未单独检查 MinIO，也没有可恢复的 DELETE HTTP 响应或 GUI 提示原文。早前旧镜像与 PC 401 误判问题的历史记录保留作为修复背景，不代表当前作业仍未完成。

### 2026-09-26 注销确认密码 401 被 PC 误判为会话失效

- 现场数据库：指定测试账号规范化用户名唯一匹配，状态 `ACTIVE`、关联作业数 0；未受理注销。运行中 backend 字节码已包含 UTC `OffsetDateTime` JDBC 参数修复，V25 已安装。现场没有可恢复的 DELETE HTTP 状态或错误内容，不能断言用户遇到的具体错误。
- 代码问题：后端确认密码错误返回 `401 UNAUTHENTICATED / Invalid credentials`，PC 原共享拦截器把所有受保护请求的 401 当成令牌过期，刷新并重放 DELETE，随后可能跳转登录，造成“账号无法登录、似乎已注销”的误判。
- 处理与验证：PC 仅对该 DELETE 的确认密码错误跳过刷新、重放和跳转；Bearer 失效仍按原流程处理。PC 定向测试 6/6、type-check、生产构建与 frontend Docker 镜像构建通过；独立 PostgreSQL 注销完整生命周期与错误密码回归 4/4 通过。`check:r4-pc` 因未修改的 `src-tauri/src/local_asset_store.rs: fixed local address` 报 1 项失败。当前 frontend 容器仍用旧镜像、GUI 未验收，真实账号未触发注销。该判别依赖服务端现行 Problem Details `detail`，若错误文案改变须同步调整或改用专用机器码。

### 2026-09-26 账户注销受理入口 PostgreSQL 时间参数错误

- 现场证据：当前运行容器与上次构建的镜像 ID 一致；`DELETE /api/auth/me` 在 `IdentityService.requestAccountDeletion()` 插入 `account_deletion_jobs` 时直接绑定 `Instant`，pgJDBC 无法推断 SQL 类型，受理失败。
- 处理：仅将 `requested_at` 与 `not_before` 的 JDBC 参数转为 UTC `OffsetDateTime`，不改作业状态机、API 和表结构；已增加隔离 PostgreSQL 异时区回归。
- 验证：285 个主源码 clean compile 通过；独立 Testcontainers PostgreSQL 17/pgvector + Flyway V1–V25 异时区定向回归 2/2；新 backend 镜像已构建。其他未提交测试源码与当前接口不匹配导致 Maven 全量测试编译失败。运行容器仍用旧镜像；真实账户注销未验收。

### 2026-09-25 账户注销清理定时任务 PostgreSQL 参数错误

- 现场证据：`AccountDeletionCleanupService.claimNext` 的 `JdbcTemplate` 绑定 `java.time.Instant`，pgJDBC 抛出“Can't infer the SQL type”，导致定时任务在领取作业前失败，已受理的注销无法完成后台清理。
- 处理：同一服务中所有 JDBC 时间参数改用 UTC `OffsetDateTime`；隔离 PostgreSQL 17/pgvector + Flyway V1–V25 的合成作业回归 1/1 覆盖领取至完成后复扫，并使用异时区 JVM/数据库会话校验绝对时刻。新后端镜像已构建，当前运行中 Compose 容器尚未更新，真实用户数据未触碰。
- 验证限制：仓库全量 `testCompile` 受其他未提交测试与现行生产接口不匹配阻断；需待该测试基线恢复后重跑全量门禁，并在受控环境验收真实对象存储、延迟和最终删除。

### 2026-09-25 通用 AI 聊天 Provider 验证边界

- 设置 API 不接收用户 Embedding 模型；Embedding 使用服务端 SiliconFlow 凭据与模型。聊天配置保存、普通聊天及连接测试不依赖该凭据；启用 RAG 或索引仍需要服务端可用的 Embedding 配置。
- `OPENAI_COMPATIBLE` 可连接用户指定的公网 HTTPS 地址，保留 DNS 公网筛选、固定地址连接、443 端口限制和关闭重定向；本地/内网服务不在当前支持范围。审查发现的 NAT64 绕过风险已通过拒绝 NAT64、6to4、Teredo 转换前缀并补安全测试关闭；尚未以真实第三方服务商和生产 DNS/代理环境验收其兼容性与出站策略。
- 最新 Server clean 定向 45/45、安全专项 clean 18/18、OpenAPI artifact 8/8、SDK gate、PC 定向 5/5 与类型检查通过。Mobile 类型检查中的 `clientImportId` 缺失为既有上传链路问题，本次未修改该链路。

### 2026-09-25 PC 首页已完成勾选状态全链路修复（代码修复，GUI 待验收）

- **现象与根因**：
  1. 历史排期校验误拦截已完成写入：`persistOffline` 中的 `assertScheduleMutationAllowed` 在排期检查中直接对任务调用 `assertScheduledAtIsNotPast`，未豁免已完成任务（`model.status === 'DONE'`）。导致无论是在应用加载/定时轮询中自动完成已过期的排期任务（`recoverOverdueTasks`），还是用户在首页手动点击勾选已结束的排期任务，均抛出 `不能排期到过去的时间` 异常，造成自动完成静默失败、手动点击报错回弹；
  2. 规范状态 `DONE` 穿透漏判：`taskViewRules.ts` 中的 `isActionableTask` 和 `isSchedulableTask` 仅判断了 `status !== 'completed'`，遗漏了规范枚举 `'DONE'`，导致服务端拉取或本地存储的已完成任务被错误判定为活动逾期任务或待排期任务；
  3. 首页指标统计脱节：`useTaskStore.ts` 中的 `completedCount` 与 `totalFocusHours` 仅按 `task.status === 'completed'` 统计，遗漏 `'DONE'`，导致首页顶部“已完成 X 项”未正确统计；
  4. 待办清单定位纯粹化：待办清单 `.todo-item` 聚焦未排期待办呈现，移除复选框与点击完成控件，避免无排期待办直接在首页被误勾选，保留前往排期副驾规划流。
- **修复**：
  1. `useTaskStore.ts`：在 `persistOffline` 中豁免已完成任务 `model.status !== 'DONE'` 校验过去的排期；引入 `isSameScheduleTime` 时间戳比对；指标统计统一使用 `isCompletedTask(task)`；
  2. `taskViewRules.ts`：`isActionableTask` 与 `isSchedulableTask` 统一使用 `!isCompletedTask(task)`，全量收敛规范与展示层已完成状态；
  3. `Dashboard/index.vue`：`.todo-item` 移除复选框与点击完成，保持纯净信息胶囊；今日日程卡片保留勾选与完成切换；
  4. 测试与验证：更新 `scripts/r4-dashboard-timeline.test.mjs`，PC 全量回归测试（420/420 全量通过），`vue-tsc` 类型检查通过，`git diff --check` 通过。浏览器界面核验完成。

### 2026-09-25 PC 顶栏头像真实映射与右上角在线状态点移除（已修复）

- **现象与根因**：
  1. 顶栏头像未对接服务端真实头像：`AppHeader.vue` 此前仅展示静态首字母占位符，未对接 `GET /api/auth/me/avatar` 服务端私有头像 Blob，无法在用户上传头像后全局同步显示；
  2. 右上角状态绿点视觉干扰：顶栏头像右下角渲染了绿色在线状态点（`.avatar-status`），存在视觉干扰且与极简温润禅意设计规范不契合；
  3. 头像状态全站响应式同步缺失：个人中心 `Profile/index.vue` 修改或重置头像后，顶栏头像未能单向响应式联动更新。
- **修复**：
  1. `useAuthStore.ts`：增加响应式 `avatarUrl`、`loadAvatar()` 与 `setAvatarUrl()`，在登录（`setSession`）时自动拉取头像 Blob 并生成内存安全的 ObjectURL，在登出（`clearSession`）时妥善调用 `URL.revokeObjectURL` 释放；
  2. `AppHeader.vue`：对接 `authStore.avatarUrl`（有头像时呈现真实图片、无头像时优雅降级首字母），彻底移除 `.avatar-status` 模板节点与对应 CSS 样式；
  3. `Profile/index.vue`：在 `loadAvatar`、`uploadAvatar` 与 `resetAvatar` 时同步调用 `authStore.setAvatarUrl`，且在组件卸载时避免误销毁全站共享的头像 ObjectURL；
  4. 自动化与视觉验证：`npm.cmd run test:r4-pc`（420/420 全量通过），`npm.cmd run type-check`（0 error）与 `git diff --check` 全部通过；浏览器实时截屏核验右上角头像渲染正常且状态绿点已完全移除。

### 2026-09-25 PC 头像 GET 返回 406（代码修复，真实 HTTP 待验收）

- **证据与根因**：现场日志显示 `GET /api/auth/me/avatar` 在 Spring MVC handler 选择阶段抛出 `HttpMediaTypeNotAcceptableException`；服务端 `AuthController.avatar` 声明 `produces=image/png`，而 PC 通用 Axios 客户端默认发送 `Accept: application/json`。`getAvatarBlob` 原先只设 `responseType: blob`，未覆盖该请求头。
- **处理与边界**：头像 GET 单独接受 PNG 和 Problem Details，保留无头像时的 404 错误响应协商。Profile 定向测试 5/5、PC type-check 与相关 diff-check 通过；Axios mock adapter 验证最终请求头。服务端和 OpenAPI 已是 PNG，无需改动；真实 HTTP、个人空间 GUI 尚待验收。引用分析中的账户注销清理错误不在本次范围。

### 2026-09-25 完成任务未进入已完成目录、首页日程结束后未勾选（补充修复，GUI 待验收）

- **根因与处理**：资产库原先优先判断任务没有截止时间或排期，导致已完成的此类任务被放入“未排期”；现改为完成状态优先，并统一任务树节点完成标记。首页日程已完成状态的本地提交与远端拉取映射在动态测试中均得到正确勾选；另发现任务投影刷新只重载列表，未立即重试自动完成检查，现于重载后触发恢复，保留现有冲突保护。审查发现已结束排期任务可手动取消完成、随后被恢复逻辑重新完成的往返状态；现禁止此类取消操作并在控件说明原因。
- **验证边界**：任务规则 14/14、资产库 2/2、Store 排期 25/25、首页/时间轴 15/15、PC type-check 与相关 diff-check 退出 0。原始首页 DOM 症状和真实同步时序仍需 GUI 验收；不能仅凭状态映射测试断言所有用户现场已恢复。

### 2026-09-25 时间轴任务结束后仍未自动完成（代码修复，GUI 验收开放）

- **现象与根因**：用户反馈排期任务结束后仍未自动完成。原判定只看排期开始时刻，未计入持续时长；本地任务加载后没有立即恢复，仅依赖一分钟轮询；一项任务写回失败会中断整轮检查。并发审查还发现自动恢复若绕过任务变更队列，可能与手动编辑/改期用旧快照交错。
- **处理**：按 `scheduledAt + durationMinutes` 判定结束；加载后立即恢复、运行中按分钟复查；单项失败记录并继续其他任务；恢复写入与手动任务操作串行，并在提交前重新核对当前本地行、待处理 mutation 与版本。自动完成提交在本地仓储写边界原子拒绝旧版本和已被领取的同资源 mutation；增量 pull 也在落库时重新检查同资源未解决 mutation，避免用远端响应覆盖新建的本地写入。Task API 与数据库 schema 无变化。
- **验证边界**：任务规则与 Store 定向 35/35、本地仓储 18/18、同步 12/12、PC type-check 退出 0；真实 GUI、后台计时器节流和跨设备同步仍待验收。
- **最终只读复查**：自动完成提交与增量 pull 的资源/outbox 检查位于各自原子写边界，先前指出的同任务 claim 和 pull 快照过期竞态已收口；Reviewer 未发现本轮新增 BLOCKER 或 IMPORTANT。

### 2026-09-25 PC 个人空间清除离线数据底层持久化与 AI 脏配置自动持久化测试（已修复）

- **现象与根因**：
  1. 清除本地离线数据未生效：此前在设置页（`Profile/index.vue`）点击“清除本地离线数据”时，仅修改了内存中的 `syncStore.resetRequired = true` 并清除了少量 localStorage 键，并未清空 SQLite/IndexedDB 底层的 `local_mutations` 和 `local_resource_records` 表，且没有将 `reset_required = 1` 写入 `sync_metadata` 持久化表。`syncCycle` 在同步时无法持久感知该重置标志，按钮所承诺的“清除离线数据并从云端全量拉取”不会真实发生；
  2. AI 模型检测与连接测试可能测旧配置：在 AI 设置中，用户修改了 Base URL、切换了 Model 或填入了新的 API Key，但在尚未点击“保存 AI 配置”时，直接点击“自动检测”或“测试连接”，此前直接调用服务端的 `GET /api/ai/settings/{provider}/models` 或 `POST /api/ai/settings/{provider}/test-connection`。由于后端接口强制要求从服务端数据库读取该用户的已有托管凭证，导致测试的仍是服务端已保存的旧配置或旧 Base URL，甚至在用户填入错误的新密钥时仍可能对旧配置显示测试成功，引发误导；同时脚本中遗漏了 `testingConnection` 与 `handleTestConnection` 的完整关联。
- **修复**：
  1. 离线存储重置全链路闭环：
     - `localRepository.ts`：新增 `resetOfflineStorage()`，在一个事务中清空 `local_mutations` 和 `local_resource_records`，并在 `sync_metadata` 中原子设置 `cursor = NULL, reset_required = 1`（同时重置 `browserState` 内存与键值存储），使 `syncCycle` 可以在下次周期中真正触发快照拉取；
     - `useSyncStore.ts`：导出 `resetOfflineData()` 统一 action，调用 `repository.resetOfflineStorage()`、发布资源投影变更通知、触发立即同步 `flushNow()`；
     - `Profile/index.vue`：`handleResetOfflineData()` 调用 `syncStore.resetOfflineData()`，捕获异常并反馈用户。
  2. AI 脏配置自动持久化校验：
     - `Profile/index.vue`：实现 `ensureAiSettingsSavedForTest()` 机制，在用户点击“自动检测”或“测试连接”时，深度比对当前表单与已保存配置（新密钥、Base URL 变更、模型变更）；
     - 检测到配置变动时，先自动静默调用 `handleSaveAiSettings()` 将最新配置持久化至服务端托管库，再发起服务端连通性测试或可用模型拉取；若未曾配置密钥且未填入新密钥，则提前拦截并明确提醒用户填入 API Key；
     - 补齐 `handleTestConnection` 与 `testingConnection` 响应式加载状态与测试反馈，防止并发重复点击。
- **验证与门禁**：在 `scripts/r4-profile-live-links.test.mjs` 中补充断言，`npm.cmd run test:r4-pc`（408/408 全量通过），`npm.cmd run type-check` 与 `git diff --check` 全部通过。真实网络环境与 GUI 行为待验收。


### 2026-09-25 PC 首页已完成任务勾选状态与完成切换修复（已修复）

- **现象与根因**：首页看盘（`Dashboard/index.vue`）中，已完成任务未正常渲染为勾选状态，且点击复选框无法顺畅切换状态：
  1. 状态判断未兼容规范状态：`taskViewRules.ts` 中的 `isCompletedTask` 与 `isCompletedScheduledTask` 仅判断了展示层状态 `'completed'`，对从后端同步或本地数据层透传的规范枚举 `'DONE'` 判断为未完成，导致已完成任务呈现为空心复选框；
  2. 首页切换状态流转与容错：`Dashboard/index.vue` 中的 `toggleTaskCompletion` 仅以固定字面量切换 `'pending'`，未根据任务是否有排期智能流转为 `'scheduled'` 或 `'pending'`；未对异步更新错误提供捕获与通知提示；
  3. 待办清单（Todo List）缺少勾选控件：待办清单任务此前无复选框，用户无法直接在首页待办中勾选完成未排期任务；
  4. 交互热区优化：日程任务卡片文字区域补充点击勾选切换与手势指针，提升交互易用性。
- **修复**：
  1. `taskViewRules.ts`：在 `isCompletedTask` 与 `isCompletedScheduledTask` 中兼容规范完成状态 `(task.status as any) === 'DONE'` 与展示状态 `'completed'`，确保所有来源的已完成任务均能正确被判定并勾选；
  2. `Dashboard/index.vue`：
     - 引入 `isCompletedTask` 与 `TaskPresentationStatus` 类型；
     - 升级 `toggleTaskCompletion`：智能识别当前完成状态，已完成的排期任务解勾选后返回 `'scheduled'`，无排期任务返回 `'pending'`，未完成任务则推进至 `'completed'`；增加 `try...catch` 异常捕获与 `ElNotification` 友好提示；
     - 为待办清单 `.todo-item` 增加复选框绑定 `:checked="isCompletedTask(task)"` 与 `@change="toggleTaskCompletion(task)"`；
     - 为 `.scheduled-task-content` 增加快速勾选点击与手势指针。
- **验证与门禁**：更新 `scripts/r4-dashboard-timeline.test.mjs`，PC 全量回归测试 `npm.cmd run test:r4-pc`（407/407 全量通过），`npm.cmd run type-check` 与 `git diff --check` 全部通过。真实 GUI 行为仍待验收。

### 2026-09-25 头像上传被 Spring 默认 multipart 1 MiB 上限拦截

- **原因与处理**：头像业务接口允许原文件最大 5 MiB，但共享 Spring 配置未显式设置 multipart 上限，默认 1 MiB 会在请求进入 Controller 前拒绝较大的文件。已在共享配置中设置单文件 5 MiB、整个请求 6 MiB，保留表单封装开销；业务侧图片格式、像素和重编码校验继续生效。
- **验证与边界**：`mvnw.cmd -B -ntp clean -Dtest=ConfigurationTests test` 退出 0，3/3 通过，确认配置绑定。MockMvc 头像测试使用模拟 multipart，不证明嵌入式 Servlet 容器实际放行 5 MiB；真实 HTTP 上传仍需联调确认。

### 2026-09-25 PC 个人空间与设置页 10 类前端真实链路打通与闭环（已修复）

- **现象与背景**：此前 PC 设置页面（`Profile/index.vue`）存在 10 类前端缺口（涉及 12 个可见控件与状态项），导致部分交互为纯内存修改、本地 localStorage 临时模拟或延时 mock：
  1. 账户资料（3 类）：昵称保存仅修改内存；头像首次读取/上传/重置仅操作本地存储；改密码仅做 350ms 假延时提示成功，且密码校验长度仅限制 6 位（后端契约要求 12~200 位）；
  2. AI 设置（3 类）：Provider 自由输入未对齐服务端 `AiProviderType` 枚举；模型自动检测使用本地硬编码数组；连接测试延时 600ms 后直接提示成功；
  3. 数据与状态（4 类）：数据导出仅包含知识块，遗漏任务排期；“清理本地缓存”与敏感区“清除本地离线数据”共用同一个仅清理少量 localStorage 的实现；注销账户仅弹提示未调后端；同步状态为静态固定文案。
- **修复与真实链路打通**：
  1. 账户资料全量接入真实后端：
     - 昵称：`saveNickname()` 接入 `PUT /api/auth/me`（携带 `baseVersion` 与 `displayName`），处理 409 版本冲突与 store 状态更新；
     - 头像：接入 `GET /api/auth/me/avatar` 获取真实 Blob 并转为安全可释放的 Blob URL 展示，上传接入 `POST /api/auth/me/avatar`（带类型与 ≤5MB 校验），重置接入 `DELETE /api/auth/me/avatar`，彻底清理本地 localStorage 模拟；
     - 改密：升级为 12~200 位安全校验，接入 `PUT /api/auth/password`（携带 `baseVersion`、`currentPassword`、`newPassword`），正确处理原密码错误并关闭弹窗；
  2. AI 设置真实规范化与探测测试：
     - Provider 归一化：通过 `normalizeProvider` 将非枚举输入自动映射为 `OPENAI_COMPATIBLE`，识别 DeepSeek 与 SiliconFlow；
     - 模型自动检测：接入 `GET /api/ai/settings/{provider}/models`，依据用户已保存的云端密钥探测真实可用候选模型并渲染托盘；
     - 连通性测试：接入 `POST /api/ai/settings/{provider}/test-connection`，依据服务端聊天请求返回 `{ reachable, chatModel }` 反馈；
  3. 数据与状态真实闭环：
     - 完整数据导出：`handleExportData()` 整合拉取 `knowledgeStore.recentBlocks` 与 `taskStore.allTasks`，结构化输出包含元数据、知识库块与排期任务的完整 JSON；
     - 两级清理分层解耦：“清理本地缓存”仅清理视图与临时会话日志；敏感区“清除本地离线数据”绑定独立高危处理器 `handleResetOfflineData()`，高危确认后重置离线存储并标记 `syncStore.resetRequired = true` 触发全量同步；
     - 注销账户：接入 `DELETE /api/auth/me`（提交密码），处理 HTTP 202 Accepted 响应，清空本地会话并跳转登录页；
     - 响应式同步状态：`sync_status` 动态关联 `syncStatusText`（响应 `isSyncing`、`lastSyncError`、`resetRequired`）及异常样式。
- **验证与门禁**：新增定向测试 `scripts/r4-profile-live-links.test.mjs`，PC 全量回归测试 `npm.cmd run test:r4-pc`（406/406 全量通过），`npm.cmd run type-check` 与 `git diff --check` 全部退出 0。真实外部服务与 GUI 行为仍待验收。

### 2026-09-24 PC 个人中心与系统设置（Profile / Settings）纵向挤压塌陷修复与满屏布局重构（已修复）

- **现象与根因**：设置页面（`Profile/index.vue`）中，右侧面板 `.studio-right` 声明了 `height: 100%; display: flex; flex-direction: column;`。在没有声明 `flex-shrink: 0` 的情况下，Flex 容器会将所有设置分组卡片（`.settings-group`、`.danger-zone`、`.logout-group` 等）纵向强行挤压缩放以试图塞进 100% 视口高度中，配合卡片自带的 `overflow: hidden`，导致设置组被挤压压扁成细缝，内部表单与按钮被大面积截断。
- **修复**：
  1. 将 `.studio-right` 布局从 `display: flex; flex-direction: column` 调整为块级自适应纵向流动 `display: block;`，同时为子元素配置 `flex-shrink: 0;`；
  2. 为设置组 `.settings-group`、`.danger-zone`、`.logout-group`、会话行 `.session-row` 与操作行 `.settings-row`、`.danger-row` 配置 `min-height: 52px` 坚实保底约束，确保每一行均有舒适呼吸空间，视口超高时由外层容器触发丝滑垂直滚动；
  3. 左侧数据透视面板 `.studio-left` 同步添加 `.studio-left > * { flex-shrink: 0; }`，杜绝任何视口高度收缩下的组件挤压；
  4. 保持纯文字排版（右侧无多余图标胶囊）与 100% 满屏网格自适应架构。
- **验证与边界**：PC 全量回归 `npm.cmd run test:r4-pc`（403/403 全量通过）、`npm.cmd run type-check`、`git diff --check` 全部退出 0。真实 GUI 视觉体验仍待人工验收。

### 2026-09-24 PC 资产库（Asset Studio）知识块与任务编辑排版重构、标签精简与任务所属学科自选（已修复）

- **现象与根因**：资产库（`Asset/index.vue`）中栏编辑区存在排版体验与交互限制缺陷：
  1. 顶栏与输入框标题重复：顶栏展示 `<h1 class="detail-name">{{ selected.name }}</h1>`，而下方正文直接出现 `<input v-model="selected.name" />`，用户输入时上下两处同时闪烁变化；知识块甚至同时存在两个“保存修改”按钮；
  2. 知识块顶部标签杂乱：正文卡片顶部渲染多余的 `# {{ tag }}` 徽标，影响整体极简禅意阅读体验；
  3. 任务学科不可变更：任务属性中所属学科仅为静态文本展示，无法在编辑任务时更换所属学科；
  4. 画布碎片化：标题输入框浮于 `#F7F2EB` 大底板上，而正文文本域却包裹在小卡片中，形成视觉割裂；
  5. 任务属性排列扁平：截止日期与时长简单堆叠，缺乏清晰的小节划分，与任务备注混在一起。
- **修复**：按现代沉浸式笔记与工坊标准重构：
  1. 顶栏去重自适应：文件呈现只读信息，知识块呈现纯净路径（`知识库 / 学科`）、字符统计与单侧保存主按钮，任务呈现状态切换胶囊（待处理/已完成）、截止日期与保存按钮；
  2. 移除知识块顶部标签：彻底移除纸张卡片顶部多余的 `# {{ tag }}` 徽标，保留温和学科胶囊；
  3. 任务所属学科与预计用时自选与圆角禅意下拉栏：在任务属性工坊中，将所属学科与预计用时均升级为定制禅意圆角下拉选择器（`<el-select class="zen-select" popper-class="zen-select-popper">`），触发栏具备 `border-radius: 9999px` 胶囊圆角与 `#FAF7F2` 底色，浮层具备 `border-radius: 16px` 与选项 `10px` 圆角；排查并解决 Vue scoped CSS 编译剥离 `html.dark` 导致暗色底色泄漏的问题，彻底恢复温润宣纸色 `#FAF7F2`；在 `useTaskStore.ts` 的 `updateTaskDetails` 中支持 `subjectId` 字段流转与离线持久化同步，用户可在编辑任务时自由切换归属学科并持久化保存；
  4. 统一温润纸张画布（`.editor-paper-card`）：知识块与任务统一置于 `#FAF7F2` 宣纸卡片中（居中 860px），配备 20px 圆角与立体微阴影；
  5. 任务属性工坊（Property Panel）：Notion/Linear 风格属性网格，集成截止日期选择器、预计用时下拉选择与所属学科展示，并通过导轨与小节标签清晰隔开下方“任务备注与详细说明”编辑框；
  6. 沉浸式滚动条全量隐藏：全面清理中栏滚动容器（`.middle-content-scroll`）、左右侧栏容器、笔记/任务备注文本域以及下拉面板（`.zen-select-popper` 的虚拟滚动轨道 `.el-scrollbar__bar`）的滚动条视觉露出，保留自然流畅鼠标滚轮与触控滚动，彻底消除突兀滑条。
- **验证与边界**：PC 全量回归 `npm.cmd run test:r4-pc`（403/403 全量通过）、`npm.cmd run type-check`、`git diff --check` 全部退出 0。真实 GUI 视觉体验仍待人工验收。

### 2026-09-24 PC 资产库（Asset Studio）温润配色全面对齐与关系星图拓宽（已修复）

- **现象与根因**：资产库页面（`Asset/index.vue`）中，右侧关系星图容器写死了内联 `style="width: 450px;"`，在宽屏下视觉偏窄，力导向图谱节点与小部件排布空间局促；子标题栏写死 `style="background: var(--color-bg-secondary);"` 破坏层级；同时页面残留老旧高饱和强调绿 `#7D9372`、卡片底板纯白 `#FFFFFF`，以及中间列 `.middle-content-scroll` 误用 `#EEEEEE` 导致中间容器出现底色断层。
- **修复**：严格对齐温润极简禅意配色方案与舒适度布局规范：
  1. 页面大底色维持 `#EEEEEE`（`--color-bg-secondary`）；
  2. 三栏容器底板（`.studio-left`、`.studio-middle`、`.studio-right-context`）统一为 `#F7F2EB`（`--color-bg-primary`），修复 `.middle-content-scroll` 的断层色差；
  3. 拓宽关系星图：清理写死的内联样式，将 `.studio-right-context` 宽度由 `450px` 拓宽至 `540px`（+90px，拓宽 20%），为节点和交互提供充裕画幅；
  4. 卡片、输入框与模态框底色统一为温润米白宣纸色 `#FAF7F2`（`--color-bg-tertiary`），并添加微阴影；聚焦轮廓统一步伐为 `#8B9A6E` 发光；
  5. 主按钮与保存按钮应用 `#8B9A6E` 渐变立体投影，次级按钮使用 `#FAF7F2`；
  6. 修复 `KnowledgeGraph.vue` 中 `down` 交互状态缺失 `pointerId`、`startX`、`startY` 导致的类型报错。
- **验证与边界**：PC 全量回归 `npm.cmd run test:r4-pc`（401/401 全量通过）、`npm.cmd run type-check`、`git diff --check` 全部退出 0。真实 GUI 视觉体验仍待人工验收。

### 2026-09-24 PC 任务编排中心（Timeline）主内容与卡片背景层级混淆、待安排栏偏窄及控件缺乏阴影（已修复）

- **现象与根因**：任务编排中心（`Timeline/index.vue`）中，日视图时间轴卡片 `.slot-task` 此前使用了 `var(--color-bg-primary)`（#F7F2EB），而其承载的列容器 `.timeline-column` 同样为 `#F7F2EB`，造成任务卡片与背景底板同色、毫无视觉层次深度；周视图概览行 `.weekly-overview-row` 与周任务卡片使用微弱的 `rgba(255, 255, 255, 0.02)`，在浅色模式下接近透空；同时部分组件（如新建弹窗、输入框、时长滑块）还残留硬编码的 `#7D9372` 与纯白背景。此外，日视图三栏布局中右侧「待安排任务块」（`.tasks-column`）固定宽度为 340px，扣除内边距与拖拽手柄后，卡片内部可用宽度偏窄，长任务名与学科标签、知识关联胶囊和截止日期徽标排版较为拥挤。另外，页面各级次级按钮（`.btn-secondary`、`.day-btn`、`.btn-auto-delay`、`.task-btn-cancel`、`.view-toggle`）以及各卡片（`.stat-pill`、`.weekly-column`、`.subject-capsule-item`）缺少柔和立体阴影，导致在低饱和温润底板上略显生硬或扁平。
- **修复**：严格执行极简禅意三层级配色系统、空间舒适度与分层立体投影调优：
  1. 页面底色：`.timeline-page` 维持 `#EEEEEE`（`--color-bg-secondary`）；
  2. 主内容底板：顶栏 `.timeline-header-card`、日视图列 `.timeline-column`、待安排队列 `.tasks-column`、周视图列与坞、看板列统一使用 `#F7F2EB`（`--color-bg-primary`）；
  3. 待安排任务栏扩展：`.timeline-body` 列宽定义由 `280px 1fr 340px` 调整为 `280px 1fr 400px`，右侧待安排块宽度扩增 60px，为任务卡片提供从容舒展的信息承载空间；
  4. 全卡片与模块底部立体阴影：`.slot-task`、`.weekly-task-card`、`.pending-card`、`.kanban-task-card`、`.weekly-column`、`.stat-pill`、`.subject-capsule-item`、`.weekly-overview-row` 等全量配置双层立体微阴影（如 `box-shadow: 0 4px 14px -2px rgba(0, 0, 0, 0.05), 0 2px 6px -1px rgba(0, 0, 0, 0.03)`），并在 hover 时伴随轻微 `translateY(-1~2px)` 放大扩散高质感外溢投影；
  5. 全按钮底部立体阴影：主按钮 `.btn-primary`、次级按钮 `.btn-secondary`、日期切换按钮 `.day-btn`、视图切换外壳 `.view-toggle`、弹窗取消与保存按钮、时长条及关闭/删除小圆钮均补齐微阴影与高亮悬浮投影。
- **验证与边界**：PC 全量回归 `npm.cmd run test:r4-pc`（401/401 全量通过）、`npm.cmd run type-check`、`npm.cmd run build` 及 `git diff --check` 全部通过。真实 GUI 视觉体验仍待人工验收。

### 2026-09-24 PC 学科中心页与总览主内容与卡片背景层级混淆（已修复）

- **现象与根因**：此前在对齐卡片宣纸底色（#FAF7F2）时，将 `SubjectHall/index.vue` 的主内容大容器（`.hall-content`）及 `OverviewSummaryView.vue` 根容器也一并设为了 `#FAF7F2`。由于卡片模块（`.subject-card`、`.add-card`、`article`）同样使用 `#FAF7F2`，导致大容器底色与内部卡片颜色一致，失去了层次对比，使得卡片无法在燕麦米白底板上轻柔浮起。
- **修复**：严格对齐三层级配色系统：页面大背景使用 `#EEEEEE`（`.hall-container`、`.workspace-container`），主内容大容器使用 `#F7F2EB`（`.hall-content`、`.overview-summary-view`、`FilePreview` body），卡片模块与纸张底板使用 `#FAF7F2`（`.subject-card`、`.add-card`、`.search-input`、`article`、`.file-preview-renderer-shell`）。
- **验证与边界**：PC 全量回归 `npm.cmd run test:r4-pc` 401/401 全量通过，`npm.cmd run type-check`、`npm.cmd run check:subject-icons`、`npm.cmd run check:subject-workspace` 及生产打包均退出 0。真实 GUI 视觉体验仍待人工验收。

### 2026-09-24 PC Asset 关系星图与节点预览（代码更新，GUI 验收开放）

- **处理**：关系星图使用对称互斥力、关系弹簧、弱重力和速度阻尼；确定性初始坐标保证相同输入可复现，初始模拟最多 180 帧。同范围刷新保留现存节点位置和镜头，切换全局/学科范围重新适配。鼠标/触控/触控笔均可用 Pointer Events 拖动任意节点或平移画布；手势超过阈值后暂停初始布局，正在拖动节点锁在指针位置，关联邻居实时受弹簧力推动，每段响应最多 36 帧并在收敛时提前停止，释放后仅运行最多 30 帧低强度松弛，避免大幅回弹；用户摆放在同范围更新中保留。点击 Source/KnowledgeBlock 选择资产树对应项并显示中栏预览/编辑器，Home 的 `open-block-detail` 继续有效。
- **自动验证**：力计算、拖动邻居响应与释放松弛专项 6/6，PC 全量回归 403/403，类型检查、生产构建及 `git diff --check` 均退出 0。构建有模块外置、dynamic import、插件耗时和大 chunk 警告；实际浏览器/Tauri GUI 行为仍待验收。
- **P2-PC-Asset-Graph-GUI-Validation（开放）**：自动检查不证明浏览器/Tauri 中图谱分布、预览加载或鼠标交互效果。关闭条件：在 Asset 页面验证全局与学科图谱、缩放和平移、节点拖动，以及文件预览和知识块编辑跳转。

### 2026-09-24 不同时长的紧邻任务无法在原共同窗口内交换（代码修复）

- **根因**：PC 在请求前按“互换开始时间”预检，时长不同的紧邻任务会被判为重叠；Server 原交换也只互换开始时间，未表达两项任务在原共同窗口内交换先后顺序。
- **处理**：Server 对原区间首尾紧邻的两项任务紧凑换序，并在原事务内核对完整区间；PC 直接采用服务端返回的两项时间。非紧邻交换沿用原规则。
- **验证边界**：PC 全量回归 397/397、类型检查和构建通过；Server clean 聚焦 3/3。本机 backend 单独重建重启后 health/readiness HTTP 200、Flyway 23；db/minio 容器未变化。GUI 拖放与认证业务请求尚未验收。

### 2026-09-24 Timeline 主体落点错误移动目标和后续任务（代码修复）

- **根因**：主体 drop 按鼠标纵向偏移提交目标任务内部时间，服务端普通插入逻辑把目标及后续冲突任务向后顺延，表现为先交换再顺延。
- **处理**：主体落点显式传目标任务 ID；服务端只把被拖任务放到目标结束后的首个半小时槽，完整区间冲突则拒绝且不改任何排期。普通空白槽位和顶部交换各保留独立语义。
- **验证边界**：PC 完整回归 397/397、类型检查和构建通过；Server 聚焦 5/5、OpenAPI artifact 与双端 SDK 生成检查通过。本机 backend 单独重建重启后 healthy、readiness UP，Flyway V23 成功，db/minio 容器未重建。真实 GUI 拖拽和认证后的业务请求仍待验收。

### 2026-09-24 Timeline 日视图长任务导致后续时间刻度被隐藏或断档（已关闭）

- **现象与根因**：此前为适应长任务卡片在 flex 布局中撑高高度，在 `.time-slot` 上配置了 `v-show="!isSlotCovered(slot.time)"`，导致长任务后续时段的整行时间槽被 `display: none` 隐藏，左侧时间标尺的刻度（如 09:00、09:30）断档消失。
- **修复**：移除 `.time-slot` 的行级隐藏，固定完整呈现 08:00–22:30 所有 30 个半小时刻度槽位；刻度行固定为 80px 高度（防压缩）；任务卡片改为绝对定位层并依据时长跨越网格（`height = slots * 80 + (slots - 1) * 4 - 6`px）；卡片顶部继续处理交换，主体与普通槽位继续处理插入顺延；完善长任务覆盖区间的完成任务守卫。
- **验证与边界**：PC 全量回归 397/397、`npm.cmd run type-check`、`npm.cmd run build` 及 `git diff --check` 全部通过。自动验证不代替真实浏览器拖拽交互的人工视觉验收。

### 2026-09-23 Server 将截止时间错误地作为排期门禁（已修复）

- **根因**：PC 与当前状态文档定义 `dueAt` 为纯提醒/排序字段，但 `TaskService.validateSchedule()` 与数据库 `ck_tasks_schedule_order` 仍拒绝 `scheduledAt > dueAt`，导致 REST 拖放和 Sync 更新返回 `VALIDATION_FAILED`。
- **修复**：服务端 create/update/swap/schedule-insertion 不再比较截止时间与排期；新增 V23 迁移移除该 CHECK，不改写现有 Task。区间冲突、完成任务固定和插入窗口限制保持有效，截止时间原值保留。
- **验证边界**：`CoreDomainServiceTests` + `CoreDomainControllerTests` fresh H2 聚焦 26/26，覆盖截止时间已过时的更新、交换和插入，并保留交换重叠/插入越窗的原子拒绝测试；`mvnw -B -ntp -DskipTests package` 退出 0。真实 PostgreSQL migration 与 Docker 部署尚未执行；V18 早先清空的 scheduledAt 不会由 V23 恢复。

### 2026-09-23 排期插入接口运行镜像过旧（已恢复）

- **现象与证据**：Timeline 调用 `POST /api/tasks/schedule-insertions` 时 backend 多次记录 `HttpRequestMethodNotSupportedException`；通用异常处理器返回 `INTERNAL_ERROR` 与 `An unexpected error occurred`。运行容器使用 2026-09-20 创建的旧镜像；当前 `TaskController` 已声明该 POST 路由。
- **处理**：重建并只重启 backend。首次构建暴露 Windows 工作树的 `mvnw` CRLF shebang 无法被 Linux `/bin/sh` 执行；Dockerfile 加入 LF 规范化步骤后构建成功。
- **关闭证据与限制**：backend 新容器和镜像 ID 均为 `sha256:cbf0b32b…`，Created 2026-09-23，health `healthy`，readiness HTTP 200。OpenAPI artifact 已含 POST；运行 `/v3/api-docs` 返回 404，因 Compose 默认 prod profile 明确关闭 springdoc。GUI 拖动和认证请求尚未复验。

### 2026-09-23 Timeline 插入长任务后仍会与后续任务重叠（代码路径已收口）

- **现象与根因**：此前排期按完整时长检测冲突后直接拒绝；任务卡片顶部和主体仍共用槽位 drop，无法表达“顶部交换、其他位置插入顺延”。
- **修复**：日视图顶部交互栏单独处理原子交换，任务主体和普通槽位调用服务端单事务插入。服务端将落点任务及连续冲突的后续任务向后对齐至半小时槽，保留不冲突的空档；任一版本、固定任务或窗口校验失败时整组回滚。截止时间仅用于提醒与排序，不阻止晚于 `dueAt` 的排期。前一日开始的跨日任务不进入顺延链，发生区间冲突时拒绝，避免覆盖未同步的历史日任务。
- **验证与边界**：PC 完整回归 395/395、type-check、build 及 OpenAPI/双端生成类型检查脚本通过；Server 服务/控制器/OpenAPI 定向测试最终 32/32。Mobile type-check 仍有本轮未改的 `assetUpload.ts:47` 缺 `clientImportId` 错误；Server 全量 testCompile 被本机 IDE 生成的错误 class stub 阻断。真实 PostgreSQL、跨设备和 GUI 验收未做；已有重叠数据不自动改动。

### 2026-09-23 PC 与 Server 排期任务区间可重叠（已关闭）

- **根因**：Timeline 以半小时起始槽渲染任务，但排期写入路径未用任务时长计算结束时间。相同起始槽检查无法阻止长任务覆盖后续任务；按天排期仅排除重复开始小时；修改已排期任务时长或新建时直接带 `scheduledAt` 也能绕过槽位检测。
- **修复**：在 `taskViewRules.ts` 统一按半开区间 `[scheduledAt, scheduledAt + durationMinutes)` 比较；在本地创建/更新边界校验新建、排期、改期、时长变化及取消后重新激活；本端排期相关操作由 Store 队列串行并在本地 repository 初始化后复核；按天排期寻找可用 30 分钟槽。未排期任务落入占用槽直接拒绝，避免两次提交造成旧排期被移除；两个已排期任务仍由服务端原子换位，且调用前验证双方换位后的区间互不冲突并与其它排期均不重叠。
- **服务端收口**：TaskService 对 REST 与 Sync 共用的 create/update/restore/swap 加入同用户区间校验；事务内先锁 User，再按 Subject→Task 既有顺序加锁，阻止跨学科并发写入同时通过冲突检查。空时长按 30 分钟，首尾相接允许；换位同时检查双方新区间及第三方任务。
- **限制**：不会自动修复已有重叠排期；修复会拒绝与其冲突的新安排，必须人工调整到无冲突时间。真实 PostgreSQL 并发、跨设备同步及 GUI 行为尚未验收。
- **关闭证据**：PC 排期、任务视图与 DTO 映射定向回归 40/40（含远端 null/无效时长到区间判断的联动验证）、完整 PC 回归 392/392、`npm.cmd run type-check`、`npm.cmd run build` 与 `git diff --check` 均退出 0；Server fresh 聚焦测试 29/29（含 REST、Sync、并发）与 diff-check 退出 0。未执行 GUI/业务验收；已有重叠排期未自动修复。

### 2026-09-23 学科大纲保存、大纲草稿生命周期、首页移出日程按 ID 操作与测试脚本一致性收口

- **1. 手工保存学科大纲丢失小节数据与文件关联被覆盖（已关闭）**：
  - 现象：`initSubjectOutlineFromExisting` 只加载每小节的第一个 `sourceId`，忽略 `summary` 和 `locator`；保存时 `saveCurrentOutline` 硬编码设置 `summary: null` 且仅取单文件 `sourceIds`；更严重的是，原先遗留的原型函数 `syncOutlineFileLinks()` 在 `onMounted` 与 `watch(subjectId)` 中按章节顺序无条件重设每节的文件 ID，导致保存时写入的关联全被轮转覆盖。
  - 修复：扩充 `OutlineSection` 类型包含 `summary`、`sourceIds` 及 `locator`；载入时深拷贝完整 `sourceIds` 数组、保留已有 `summary` 与 `locator`；保存时优先保留小节现有 `summary`、`sourceIds`（非空优先）与 `locator`；支持 UI 为每个关联文件展示文件胶囊并支持分别解除关联；**彻底移除 `syncOutlineFileLinks()` 及其在挂载和学科切换时的调用**，禁止任何顺序伪轮转重设文件 ID。
- **2. 切换学科沿用上一个学科的大纲草稿与异步竞态（已关闭）**：
  - 现象：`watch(subjectId)` 切换学科时清空了 `subjectOverviewRecord` 与 `fileOverviewRecords`，但未清空 `subjectOutline` 及相关章节/小节草稿，导致目标学科若无大纲时继承旧学科草稿；且原先等待结束聊天会话（`await startFreshChatSession()`）发生在前，异步等待期间保存按钮仍可点击，而 `saveCurrentOutline` 读取的已是新 `subjectId`，存在把旧草稿写入新学科的竞态窗口。
  - 修复：在 `watch(subjectId)` 进入时**第一行立即同步清空** `subjectOutline.value = []`、`fileOutlineDrafts.value = {}`、草稿字段及总览记录，彻底消除异步等待期间的数据残留；在 `saveCurrentOutline` 中增加 `if (!subjectOutline.value.length) return` 及 `isSavingOutline` 防重复保存守卫；在目标学科缓存刷新后，若编排器处于开启态，按新学科数据安全初始化。
- **3. 首页“移出日程”可能操作同时间槽另一任务及失败无用户提示（已关闭）**：
  - 现象：`Dashboard/index.vue` 移出日程只传递 `slotTime` 给 Store，`unscheduleTask` 从 `timeSlots` 获取该时间槽的首项任务；若同槽有多项任务，可能移错任务，或者首项若已完成则抛出异常导致点击的任务无法移出；且非“已完成任务固定”的异常仅写入控制台，无可见错误提示。
  - 修复：`useTaskStore.ts` 的 `unscheduleTask(idOrSlotTime)` 升级为优先通过 `findTask(idOrSlotTime)` 按任务 ID 查找目标任务，未命中时回退按槽位查找；`Dashboard/index.vue` 的 `handleRemoveSchedule` 直接传递 `task.id`，并在发生异常时通过 `ElNotification` 区分弹出“已完成的排期任务已固定”警告或具体失败原因错误提示；`Timeline/index.vue` 拖动至待办时优先传递 `draggedItem.value.taskId`。
- **4. 测试数据注入脚本 companion 账号一致性问题（已关闭）**：
  - 现象：`scripts/seed-test-account.mjs:40` 额外注册第二个 companion 账号，导致数据库预期从 `users=1` 变成 `users=2`。
  - 修复：删除 `seed-test-account.mjs` 中注册第二个账号的冗余逻辑，保持全流程仅注册并注入单一测试账号 `pc-ai-test-20260918@example.com`，与 `docs/current/Status.md:3` 及 `TestAccountDataResetAndSeed.md` 预期一致。
- **5. 切换学科期间 AI 请求短暂携带旧文件 ID（已关闭）**：
  - 现象：切换学科时，路由变化使得 `subjectId` 立即切为新学科，而 `selectedFileId` 原先直到异步数据全部加载完成后才更新；在此等待窗口内若触发发送消息，AI 请求会携带新学科 ID 与旧学科文件 ID；重试发送（`retryChat`）也可能残留旧文件 ID。
  - 修复：在 `watch(subjectId)` 进入的第一行同步调用 `chatStore.abortStream()`、`chatStore.clearActiveConversation()`、`selectedFileId.value = null`、`selectedAiSourceIds.value = []` 及 `sourceStore.clearActiveSourceFiles()`，阻断旧会话与旧状态；并在 `sendChat`、`retryChat`、`sendSelectionQuestion` 和 `saveKnowledgeBlock` 中对关联文件做强制归属校验：文件 ID 必须属于 `activeSourceFiles` 且属于当前 `subjectId`，否则过滤置空，彻底杜绝跨学科文件 ID 渗透。
- **6. 移出日程时不当捏造并持久化 fake dueAt（已关闭）**：
  - 现象：`useTaskStore.ts` 的 `unscheduleTask` 在移除 `scheduledAt` 时，曾试图通过 `fallbackDueAt` 把任务原有排期时间或未来 24 小时作为 `dueAt` 写入任务模型，导致未设置截止日期的任务在移出日程或槽位换位被替换时被悄悄创建并持久化了虚假截止日期。
  - 修复：完全移除 `unscheduleTask` 中捏造 `dueAt` 的逻辑，严格只清除 `scheduledAt` 与 `startTime`，保持任务原有的 `dueAt`（无论是 null 还是已有日期）完全不变；首页看盘的待办展示由 `Dashboard/index.vue` 内部纯 UI 计算属性 `filteredPendingTasks` 进行合集投影（包含 `pendingTasks` 与无排期的活跃任务 `unscheduledActive`），不污染 Store 和后端数据；新增 `r4-task-store-schedule.test.mjs` 测试守卫断言禁止在 `unscheduleTask` 中注入捏造 deadline。
- **7. 截止日期（dueAt）门禁解耦与 DDL 视觉提醒改造（已完成）**：
  - 需求与根因：此前业务规则 `isSchedulableTask` 将 `Number.isFinite(dueTimestamp)` 作为任务进入待办与排期队列的强制硬性前置条件，导致用户未设截止日期的任务无法排期，且在 `recoverOverdueTasks` 中未排期任务一旦逾期便会强制被置为 `dueAt: null` 抹除用户真实设定的截止日期。
  - 改造与修复：
    1. 在 `taskViewRules.ts` 中解耦 `isSchedulableTask`，只要状态非 completed/cancelled 且未被排期（`!task.scheduledAt`）即视为可排期待办，无需强制持有 `dueAt`；
    2. 在 `useTaskStore.ts` 中移除 `recoverOverdueTasks` 清除未排期逾期任务 `dueAt` 的操作，永久保留真实 DDL；
    3. 在 `Dashboard/index.vue` 待办清单标题行最右侧增加「前往排期」微胶囊按钮（带 `<IconChevronRight>`），待办项卡片增加 `todo-due-badge`，支持格式化显示截止日期并在逾期时显示低饱和暖红醒目标记；
    4. 在 `Timeline/index.vue` 待安排任务卡片中增加 `pending-due-badge`，同步提供 DDL 显示与逾期高亮；
    5. 更新 `r4-task-view-rules.test.mjs` 与 `r4-task-store-schedule.test.mjs` 单元测试，守卫断言无 DDL 任务可排期、真实 DDL 不抹除、排期操作不造假。
- **8. 切换学科时大纲保存竞态、旧流程覆盖与未重置总览错误过期状态（已关闭）**：
  - 现象：
    1. A 学科保存大纲期间切到 B，保存完成后仍会把 A 的 record 写入当前页面，触发大纲监听器将 A 的大纲载入 B 的草稿；
    2. 连续快速切换学科时，旧的异步加载流程在多个 await 恢复后没有校验当前路由 ID，导致旧学科被重新激活、旧文件被选中或以旧学科启动阅读会话；
    3. A 学科生成失败或总览过期后切到 B，页面未重置相关错误与标记，继续显示 A 的错误提示或过期标记。
  - 修复：
    1. `saveCurrentOutline` 保存成功与失败捕获后严格校验 `if (subjectId.value !== targetSubjectId) return`，阻止跨学科写回与弹窗；
    2. `onMounted` 与 `watch(subjectId)` 引入递增 `currentSubjectSwitchGen` 与 `subjectId.value !== newId` 守卫，在每个 `await`（会话结束、文件加载、总览初始化、知识块加载等）返回后立即检查，失效则直接退出；并在 watcher 第一时间切换 `subjectStore.setActiveSubject(newId)`；
    3. 在 `watch(subjectId)` 同步清空入口中补齐重置 `isSubjectOverviewStale.value = false`、`subjectOverviewManualError.value = null`、`fileOverviewManualErrors.value = {}`、`subjectOverviewGenerating.value = false` 与 `generatingFileIds.value = new Set()`，彻底清除上一个学科的残留错误与过期标记；
    4. `r4-subject-overview-ui.test.mjs` 新增针对 `targetSubjectId` 守卫、`switchGen` 检查以及错误与过期状态同步重置的自动化断言。
  - OPTIONAL 说明：
    - 旧学科图标键：用户确认后续统一清理历史旧契约数据，无需在前端做历史别名回退扩展。
- **10. 切换学科旧阅读会话清理误清空新活动会话 ABA 竞态（已关闭）**：
  - 现象：`SubjectWorkspace/index.vue` 在旧请求失效后调用 `endActiveSession()`；该方法等待删除完成后，在 `useChatStore.ts` 的 `finally` 块中无条件清空当前活跃会话 ID。若新会话在此期间成为活动会话，也会被一同清空置 null。
  - 修复：
    1. 在 `useChatStore.ts` 的 `endActiveSession()` 中记录 `targetSessionId = session.id`，并在 `finally` 块中增加守卫：仅当 `activeSessionId.value === targetSessionId` 时才清空 `activeSessionId` 与会话数据；若已有新会话接管，绝不误杀；
    2. 在 `useChatStore.ts` 中新增并导出 `endSessionById(sessionId: string)`，若被清理的会话非当前活动会话，仅安全在后台删除并释放该会话，完全不触碰当前的活跃会话状态；
    3. 在 `SubjectWorkspace/index.vue` 的 `selectFile`、`onMounted` 与 `watch(subjectId)` 中，获取 `const readingSessionId = await startReadingSession(...)` 后，若代次或路由失效，精确调用 `endSessionById(readingSessionId)` 清理刚刚创建的具体会话，杜绝全局会话串扰；
    4. 在 `r4-subject-overview-ui.test.mjs` 与 `r4-reading-session.test.mjs` 中补充针对 ABA 会话清理守卫与精准会话 ID 终结的自动化测试断言。
- 自动证据：`npm.cmd run test:r4-pc` 387/387 全量通过；`npm.cmd run type-check`、`npm.cmd run build`、`npm.cmd run check:subject-workspace`、`npm.cmd run check:subject-icons` 及 `git diff --check` 全部退出 0。

### 2026-09-21 Server + PC 功能问题登记（附件 2–7，待核实）

来源：`Auralis_Server_PC_Function_Issues_2-7.md`。以下内容是用户报告及建议，不代表当前代码已确认存在，也不代表已完成根因定位或业务验收；各项应分别实施、验证和关闭，不合并为一次大重构。

#### P1

- **2. 删除 Source 后的 Chunk 仍可能占用 RAG TopK**：需核对 Source 软删除与 `source_chunks` active/generation 语义，以及 Retrieval 先取 TopK、后过滤 Source 的链路。关闭条件：删除后对应 chunk 不再参与 TopK；restore 后通过 reingest 生成的新 generation 可检索；删除其他 Source 不减少有效 Source 的 TopK/citation 名额。
- **3. PC 左下角同步/连接状态不能反映真实错误**：需核对 `useSyncStore`、Realtime 状态、问答错误和 `AppSidebar.vue` 的统一状态投影。至少覆盖已同步、同步中、离线、服务不可达、Realtime 重连中、同步错误，以及恢复连接并完成一次 Sync 后恢复已同步。
- **4. Overview 手动重新生成存在静默 no-op**：需核对 `OverviewGenerationService.regenerateFileOverview()` 的所有提前返回及调用方反馈。关闭条件：成功、Source 未 READY、网络错误、runtime/revision 不满足和 eligibility 失败均有明确结果/UI反馈；失败不无条件清空已有 Overview。

#### P2

- **5. `FilePreview` 可能重复触发加载**：需记录首次打开时每次 load 的触发原因，核对 watcher 与 projection hydration。候选 identity 为 user/device、asset、content revision 或 sha256；显示名称变化不应触发内容重新读取，asset/content revision 变化仍须正确重载，旧请求不得覆盖当前文件。
- **6. `DocumentProcessingStore` 仍暴露 Runner 直接入口**：需核对 `start(jobId)`、`resumePending()`、`retry` 及 UI 调用关系。目标是 UI 统一经 `SourceJobScheduler`，由其重新解析 Source/Asset/SHA256 并准备 metadata；重启 pending job 和 retry 也不得绕过该边界。
- **7. `SourceService` / Retrieval 存在 N+1 查询**：需核对 Source list/view 的逐条 Asset 查询及 Retrieval citation 中重复 `sourceService.get()`。优先采用 owner-scoped 批量查询和 `Map<UUID, Asset>` 组装；关闭条件包括查询数不随 Source 数量线性增长，且 SourceView 与 Retrieval/citation 语义不变。

登记时状态：仅完成问题登记，尚未修改代码、API、数据库或前端行为；后续实施状态与验证证据以紧随其后的同日更新为准。

### 2026-09-21 Issue 3/4 前端实现与自动验证收口

- **Issue 3（PC 同步/连接状态）**：已实现统一状态 projection，按错误、离线、Realtime 重连、同步中、已同步的优先级展示；同步/服务/问答错误保持可见，问答区域保留错误和重试入口。
- **Issue 4（Overview 手动重生成）**：已实现 `STARTED`/`SKIPPED`/`FAILED` 结构化结果及手动反馈；自动触发静默处理预期失败，不递归重试；失败或跳过保留已有 Overview 缓存，手动重试仍是绕过终态策略的入口。
- 自动证据：最终 focused 68/68；`npm.cmd run test:r4-pc` 382/382；`npm.cmd run type-check`、`npm.cmd run build`、`git diff --check` 均通过。日志仍有既有 SQLite experimental、Vite externalized/dynamic-import/chunk size 警告。
- 限制：上述仅证明代码和自动门禁；真实 WebSocket delivery、浏览器 online/offline 事件、Tauri/GUI 文件预览、真实 AI Provider 输出尚未验收。Issue 2 仍为计划未实现；Issue 5–7 仍按原登记待核实。本轮未修改 API 或数据库契约。

### 2026-09-20 Overview Reduce prompt compression：代码/自动验证完成，真实质量验收开放

- Task 1 已将 MAP 与 REDUCE 的内部 prompt 路由分离：MAP 行为未改变；非最终及最终 REDUCE 使用专用均衡压缩指令，规范化长度 843 字符，目标约 2500–3000 个序列化 JSON 字符。预算 `max_tokens=4608/6144`、intermediate `<=5200`、self-pair `<=12000`、no-progress、schema/alias/mode/locator 校验、分组/批次和 Subject/Source 隔离边界均未改变；API、数据库、Provider 安全和普通聊天/流式契约未改变。
- 自动证据：`.\mvnw.cmd -B -ntp '-Dtest=AiOverviewServiceTests,AiOverviewControllerTests,AiProviderContractTests,AiProviderResilienceTests' test` 退出 0，55/55（2+42+1+10），无 failures/errors/skipped；`.\mvnw.cmd -B -ntp -DskipTests test-compile` 退出 0；根目录 `git diff --check` 退出 0。测试日志中的 SpringDoc/JVM 警告及 Provider resilience failure/invalid-response 日志属于现有测试场景或运行提示，不构成失败。
- P1 外部验收仍开放：尚未完成真实 DeepSeek 样本的 Reduce 输出字符数、内容覆盖、JSON/schema 成功、延迟、token 使用和成本核对。自动测试只证明 prompt routing、文本约束和既有硬边界，不得写成真实 Provider 或业务质量已验收。

### 2026-09-18 测试注入排期间隔不足：时间轴任务块重叠（已定位）

- 根因：注入流程使用 45 分钟起始间隔，但任务时长包含 60/90 分钟；即使 `scheduled_at` 各不相同，任务块仍会在时间轴上相互覆盖。
- 修复：注入流程改为 2 小时起始间隔，并明确要求相邻排期的间隔不小于最大 `durationMinutes`。
- 当前状态：根因已定位并修正流程；当前 192 条活动排期已通过 API 重新写入，区间重叠为 0，最小空档为 30 分钟。
- 关闭条件：已满足测试注入数据层面的关闭条件；后续若真实文件或用户手工拖拽仍出现重叠，应另开前端时间轴布局问题，不再归因于本次测试注入。

### 2026-09-22 测试注入排期超出时间轴有效窗口：任务落在时间轴没有的区间（已定位并修正）

- 现象与影响：部分测试注入的任务虽然带有 `scheduledAt`，但在时间轴日视图或周视图中无法匹配到任何可见时间槽，导致排期任务在界面上不可见或无法操作。
- 根因分析：此前测试注入脚本采用全局简单累加（`$scheduleSlotIndex * 2`），未按日做时间窗口约束。当累加超过当天白天时段后，任务被分配到了凌晨（如 01:00、03:00、05:00）或深夜（23:00 之后），而系统前端时间轴的合法有效槽位固定为每日 `08:00 ~ 22:30`（半小时刻度）。落入该窗口之外的时间在时间轴上属于“时间轴没有的位置”。
- 修复方案：
  1. 更新测试数据注入规范与流程（`docs/operations/TestAccountDataResetAndSeed.md`），明确定义每日有效槽位（如 `08:30`、`10:30`、`14:00`、`16:00`、`19:00`、`21:00`）；
  2. 任务排期按日严格循环约束在有效窗口内（每天最多 6 项），超出容量自动滚动至下一天白天，严禁排入 08:00 之前或 22:30 之后的无效时间；
  3. 任务开始时间严格对齐到时间轴半小时槽位。
- 关闭条件：测试注入脚本已增加白天时段与槽位合法性约束，所有注入排期均可落在时间轴的有效可视槽位中；关闭该测试数据注入问题。

### 2026-09-18 release/stability 非阻塞测试项

以下场景尚未取得明确逐项执行记录，继续作为发布与长期稳定性测试项保留，但不再作为 Local Asset Store 改造的未完成任务：

- 双设备真实收敛
- 低磁盘空间
- MinIO 故障注入
- 长时间稳定性测试

MinIO 实际同步主链路此前已人工验证；本轮真机验收覆盖本地文件仓库主要流程、文件学科归属、Subject 删除生命周期、重启/强杀及异常恢复，基本未发现问题。上述未逐项执行的 release/stability 测试不得写成已验证。

### 2026-09-17 修复点 1：PC 前端实时解析状态展示缺失，待沿数据链路定位

- 现象：前端不再显示文件实时解析/处理状态。
- 排查边界：`Source`、`ParsedDocument`/`DocumentProcessingJob`、本地 processing Store/事件订阅、状态组件和 Tauri 实际回调；先确认状态是未产生、未映射、未订阅，还是仅 UI 未消费。
- 当前结论：仅登记为待处理问题，尚未修改代码，也未进行真实 Tauri GUI 验收；不得将现有自动构建通过写成该问题已修复。

### 2026-09-17 修复点 2：AI 多文件提问必须改为用户显式选择

- 现状问题：AI 功能会静默调用其他文件，用户无法明确控制本次提问使用哪些资料。
- 目标交互：在输入栏左侧增加 `+` 按钮；用户点击后选择一个或多个其他文件，再将所选文件与当前文件/当前上下文一起提问。
- 约束：未主动选择时不得静默引入其他文件；选择状态应在输入栏中可见、可移除，并在发送请求时传递明确的 Source ID 列表。
- 2026-09-17 登记时仅为待实现需求；2026-09-26 已完成 UI、Store、API 请求及 Server 检索范围的代码修复与定向验证，真实 GUI/Provider 验收仍开放，见本文件顶部最新记录。

### 2026-09-17 修复点 3：预览重复加载与错误态位置异常

- 现象一：文件预览刚开始时疑似触发约 2–3 次加载，需要确认是组件挂载、文件 URL/Blob 更新、`watch` 或重试逻辑重复触发。
- 现象二：预览失败后的错误信息没有位于预览栏中间，影响错误态的可见性和布局一致性。
- 排查范围：`FilePreview`、SubjectWorkspace 的预览状态/事件链、文件输入解析和相关 `watch`/生命周期；需分别记录每次加载触发原因与错误态容器尺寸/定位规则。
- 当前结论：仅登记现象，尚未修改加载逻辑或错误提示布局，也未进行真实 GUI 验收。

### 2026-09-17 修复点 4：后端连接失败缺少状态反馈

- 现象一：后端不可连接时，问答请求没有向用户显示失败或离线提示。
- 现象二：左下角连接/同步状态没有随后端连接失败发生变化，用户无法判断当前是否在线或请求是否可用。
- 排查范围：API/HTTP 错误归一化、问答发送与流式错误回调、连接/同步 Store 状态传播、左下角状态组件及网络恢复后的状态重置。
- 目标：连接失败应形成明确的全局状态；问答失败应在对话区域显示可理解的错误并结束 loading/streaming 状态；恢复连接后状态应可自动恢复。
- 当前结论：仅登记现象和目标，尚未修改代码，也未进行断网/恢复网络的真实 GUI 验收。

### 2026-09-18 修复点 5：删除学科级联与统一数据库锁协议已完成代码收口

- 现象：直接删除学科后，相关文件、知识块、任务、解析/总览数据或本地受管文件可能继续存在。
- Server 实现：Subject 删除在同一事务内软删除所属 Source、KnowledgeBlock、Task、Relation 并写既有 DELETE change-log；创建、恢复、移动、Task swap 与 Relation mutation 统一经薄层 `SubjectLockCoordinator`，按 UUID 排序锁 Subject，再锁并重读资源、重校验归属和 active 状态。禁止 Resource → Subject 的反向锁序。
- PC 实现：父 `SUBJECT/DELETE` 是崩溃恢复标记；本地级联围栏子投影、未决 outbox、处理任务和 Overview。未决/推送中保留 draft 与 bytes；APPLIED 后才终结 draft 并按最后 Source 引用清理 Asset。拒绝时父恢复、mutation resolution 与 `reset_required=1` 同事务持久化，snapshot 失败后可在下一轮重试。
- 并发边界：draft release 与 Subject 围栏共用 owner/device lifecycle lock，并在锁内重读父 Subject 与未决 `SUBJECT/DELETE`，关闭“父标记已提交、子围栏未获取锁”时创建 `SOURCE/CREATE` 的窗口。
- 自动证据：Server 聚焦组合 40/40、PostgreSQL 锁集成 1/1、`clean test-compile` 通过；全量 287/288，唯一失败是既有 `TaskColorRemovalMigrationTests` 仍预期 Flyway 21 而仓库已应用 22。PC cascade 8/8、Store 12/12、`test:r4-pc` 342/342、`type-check`、build 通过；两轮 reviewer 最终均 Approved。
- 人工验收：本轮真机完成 Subject 删除生命周期、重启/强杀和异常恢复验证，未发现阻塞问题；MinIO 实际同步主链路此前已人工验证。
- 当前结论：该修复点已完成并通过当前范围真机验收。双设备、低磁盘、MinIO 故障注入和长期稳定性作为 release/stability 非阻塞测试项单独保留。

### 2026-09-18 修复点 6：PC 学科文件投影错位已完成并通过真机验收

- 根因：`useSourceStore.replaceSources()` 通过第一条可见 Source 推断当前 Subject，跨学科导入、空学科和异步加载竞态会让文件投影进入错误工作区。
- 修复：Store 独立维护当前 Subject；跨学科导入不再切换当前投影；空学科立即清空；A→B 异步加载以 generation/subject guard 丢弃 A 的迟到结果，迟到调用方返回空数组。
- 存储边界：Local Asset 物理原件仍按稳定 Asset 身份保存到 `assets/{userScope}/{localAssetId}/content.{ext}`。学科归属由 Source/Source draft 的 `subjectId` 表达；不按学科复制文件，也不因学科改名或移动而改写物理路径。
- 自动证据：聚焦 Local Asset/Source 流程 9/9、`test:r4-pc` 334/334、`type-check` 通过，reviewer Approved。
- 人工验收：本轮文件学科归属真机验收通过；重启和异常恢复后的归属未发现阻塞问题。
- 当前结论：该修复点已完成并通过当前范围真机验收。双设备、低磁盘、MinIO 故障注入和长期稳定性继续作为 release/stability 非阻塞测试项保留。

### 2026-09-18 PC Local Asset Store：改造与本轮真机验收完成

- 代码证据：`b7a3bb7..c560d8b`（重点 `f770277`、`e040e78`）已完成永久本地资料库；原始文件在 OS ACL 保护的受管目录中保持明文，所有文件默认同步，断网可导入/预览/本地解析，Asset、Source draft、任务和读取边界按 owner/device 隔离。Local Asset 没有备份、导出、恢复或副本管理能力。
- 删除与恢复边界：只有用户明确删除 Source 且最后一个 Source 引用消失后才物理删除；上传、解析、修复和删除任务在 Source tombstone/reference fence 后才允许收口。启动时 reconcile 本地数据库、文件和 staging，异常文件 quarantine，缺失或校验不符内容标记 `CORRUPT`。
- 自动证据：Task 7 定向 77/77、FilePreview+store 38/38、Rust 30/30，`cargo fmt --check`/`cargo check` 通过；schema v8→v9 断言已由 `c560d8b` 修正。最新本轮 `test:r4-pc` 为 342/342，`type-check` 与 build 通过。
- 人工验收：本轮真机覆盖本地文件仓库主要流程、文件学科归属、Subject 删除生命周期、重启/强杀及异常恢复，基本未发现问题；MinIO 实际同步主链路此前已人工验证。
- 当前结论：Local Asset Store 改造已完成，不再保留当前重构未完成项。双设备、低磁盘、MinIO 故障注入和长期稳定性未明确逐项执行，保留为 release/stability 非阻塞测试项，不写成已验证。

### 2026-09-15 PC Local Asset Store 已批准设计，实施与验收开放（历史快照）

- 优先级：P1。
- 证据（2026-09-15 当日快照，已由 2026-09-17 实施记录更新）：设计已确认本地持久文件、断网导入、最终云端同步、身份映射、统一消费方和最后引用删除语义；当时 `useAssetStore` 仍只有进程内 `Map<string, File>`，PC SQLite schema v7 没有原始文件表。
- 影响：应用重启、跨设备、断网和多消费方场景仍无法获得正式持久的本地原文件语义；不得把已批准设计写成代码能力。
- 处理：按四阶段实施 Local Asset Store、幂等 Asset 同步、Preview/OCR/Parser 统一读取以及删除传播和安全收口，并同步 PC、Server、API、Database、Architecture 与发布文档。
- 关闭条件：schema/API migration、PC/Rust/Server 自动门禁通过，并取得真实 Windows Tauri、MinIO、断网重启、双账号和双设备删除传播证据；自动测试、外部联调、GUI 与业务验收分别记录。

### 2026-09-15 Overview 非 JSON 失败体验已收口，真实第二次全链路成功

- 用户复跑同一真实 Overview 后第二次全链路成功；该运行证据证明当前永久预算链路可完成，但不替代用户对生成内容质量的判断。
- Overview 的 `MODEL_PROVIDER_ERROR` 继续使用现有 HTTP 502/API code，由 PC failure policy 显示“遇到意外情况，请重试”；不新增公开错误码，也不影响普通 AI 聊天/流式错误处理。
- FAILED 记录仍是自动触发终态；刷新、启动、联网、同步和 `JOB_CHANGED` 不会自动补发，手动“重新生成”才绕过终态并继续使用 in-flight coalescing。自动测试、部署状态与真实业务验收仍分别记录，不能合并表述。

### 2026-09-15 Overview 永久预算策略已部署，最终 JSON 解析仍阻塞

- Server 已按阶段发送明确预算：多批 MAP/非最终 REDUCE 为 `max_tokens=4608`，最终调用为 `6144`（原预算的 150%）；规范化 intermediate JSON 上限为 `5200`，self-pair 上限仍为 `12000`。紧凑 prompt、schema、Source fence 与 Reduce no-progress 保留，不做自动压缩重试，不恢复 output token 后置拒绝。
- TDD 已覆盖 5200 接受、5201 拒绝、self-pair 12000/12001、stage request maxTokens、非最终 REDUCE 与 Provider wire body；普通 chat/stream 兼容边界保持。backend 已重建且 healthy。真实 42-chunk 手动请求通过全部 6 个 MAP 和第一轮 2 个 REDUCE；最终 REDUCE 返回 2xx、自然 `stop`、`2992 outputTokens` 和 `6556 responseChars` 后在 `JSON_PARSE` 失败。该结果证明中间预算与收敛边界有效，但完整 DeepSeek 链路和业务内容覆盖尚未验收；下一步需为最终 JSON 非法增加安全的解析失败分类证据，再决定 prompt/schema 或有界修复策略。

### 2026-09-15 DeepSeek MAP JSON 截断假设：真实自然输出已取得，下一收敛边界已定位

- 现场证据：DeepSeek `/chat/completions` 返回 2xx 和非空 `content`，Server 记录 `responseChars=2553` 后在首个 MAP 的 `JSON_PARSE` 失败；旧请求携带 `max_tokens=1024`，但适配器未保留 `finish_reason`，因此尚不能把截断写成最终结论。
- 临时诊断行为：所有 Overview completion 不发送 `max_tokens`，不再以 `outputTokens>1024` 预先拒绝 intermediate；普通聊天/流式不变。日志新增 allowlisted `finishReason`、实际 output token 和响应字符数，未知/超长/换行停止原因统一为 `other`，不记录正文。
- 保留边界：Provider 响应体上限、Overview 120 秒 timeout、JSON/schema、规范化 intermediate 4000 字符、self-pair、Source revision fence、Reduce no-progress 均继续生效。Provider 默认输出上限可能增加单次 token、延迟和费用，因此该行为只能作为获取一轮真实数据的临时实验。
- 自动证据：fresh `clean test-compile` 退出 0；Overview/Controller/Provider contract/Provider resilience/Streaming 聚焦 58/58；`git diff --check` 通过。真实 DeepSeek 新构建已运行：MAP 1–5 分别为 `991/2500`、`1367/2688`、`1731/3669`、`1613/3460`、`2071/4091`（tokens/chars），全部 `stop` 且 JSON/schema 成功；MAP 5 随后以 `OVERVIEW_PROVIDER_OUTPUT_TOO_LARGE` 结束，MAP 6/REDUCE 未执行。
- 当前判断：覆盖率保留的 intermediate prompt 已把同一资料的 MAP 输出压到 1447–3680 字符，六个 MAP 全部通过，但 REDUCE round 1 第二组仍自然生成 4678 字符并单独触发 4000 字符边界；其 self-pair 为 10899/12000。Prompt 控制有效但不是硬保证。永久关闭条件是保留该 prompt，同时选择可覆盖已观测 2612 tokens 的明确 token ceiling，并调整 4000 字符边界或增加有界压缩重试；之后完成同一真实生成到最终成功及内容覆盖人工检查。

### 2026-09-14 Overview retry/convergence：代码修复与自动验证完成，外部验收仍开放

- 已关闭本轮代码问题：当前 revision 的 FILE Overview `FAILED`/部分 `READY` 对自动恢复触发均为终态，只有 `MANUAL_RETRY` 可绕过并继续受 in-flight coalescing 保护；失败或部分结果保留旧内容，界面只有一个可见“重新生成”且生成中 disabled；网络/状态不确定文案与确定性失败分开。原持续自动补发问题已由 PC 自动回归覆盖。
- 已关闭本轮 Server 收敛问题：中间 MAP/非最终 REDUCE 使用 1024 tokens，最终调用使用 4096；中间结果在下一轮前校验 `outputTokens<=1024`、规范化 JSON `<=4000` 字符和 self-pair prompt fit，Reduce no-progress 保持严格单调；`OVERVIEW_PROVIDER_OUTPUT_TOO_LARGE` 与 `OVERVIEW_REDUCE_NO_PROGRESS` 映射 HTTP 502，parse/schema 统一 `MODEL_PROVIDER_ERROR`，不再以 `VALIDATION_FAILED` 表示 Provider 输出问题。
- 已关闭本轮 DeepSeek 代码级适配问题：Overview 请求携带内部 `structuredJson=true`，OpenAI-compatible body 使用 JSON object response format，DeepSeek 同时显式关闭 thinking；普通聊天/流式保持 `structuredJson=false`。适配器继续要求有效 `message.content`，不回退到 `reasoning_content`；无有效 content 的诊断只输出 allowlisted envelope 元数据，模型标识清洗并限制为 64 字符，不输出 prompt、响应体、URL 或凭据。
- 自动证据：PC Overview focused 54/54、最新 `test:r4-pc` 331/331、type-check、`check:r4-pc`（94 个生产文件）、`check:subject-workspace`、build 均退出 0；Server 本轮 fresh `clean test-compile` 退出 0，Overview/Controller/Provider/Streaming 聚焦 56/56；OpenAPI gate green。Server 既有全量证据为 255 项中 252 pass、3 项 Docker/Testcontainers errors，错误为 `MinioAssetStorageIntegrationTests`、`PgVectorIntegrationTests`、`PgVectorMigrationIntegrationTests`；本轮未重跑全量，不得写成全量全绿。
- 仍开放：Server 未实现持久 generation 幂等/状态查询；真实 DeepSeek 是否按该组合稳定返回可解析 content、真实 Provider/Tauri/网络/GUI/设备和业务验收均未执行。自动证据不证明这些边界。

### 2026-09-12 Build/OpenAPI Task 3：fresh 编译与 schema gate 已关闭，全量受 Docker 限制

- 已验证：Server fresh 聚焦命令实际 57/57、0 failures、0 errors、0 skipped，缺失的四参数 `ProviderHttpTransport.post(..., byte[])` 仅在测试 double 中补齐；生产 Provider transport 未改变。全量 `mvnw -B -ntp test` 实际 239 项，0 failures、3 errors，错误精确为 `MinioAssetStorageIntegrationTests`、`PgVectorIntegrationTests`、`PgVectorMigrationIntegrationTests` 的 Docker/Testcontainers 环境不可用。
- 已验证：`check-openapi.ps1` 退出 0（artifact comparison、Server OpenAPI 8/8、PC/Mobile 生成 schema 均通过）；PC/Mobile type-check 退出 0，Mobile protocol test 23/23。两端 schema 字节相同且 `subjectOverview`/`sourceOverview` header 均含可选 `X-Overview-Request-Id`。
- Mobile 为适配生成 `JsonNode` 的结构窄类型，仅增加一行编译期 `SyncMutation['payload']` boundary cast，运行时 JSON 序列化不变；未来应清理生成契约类型风险，当前不声称已关闭。API/Database 契约文件仅核对，未发现本轮新的语义变化且未编辑。
- P1 外部验收仍开放：真实 Provider、Docker 后的 PostgreSQL/pgvector/MinIO、Tauri/GUI/设备、微信/H5/Tablet 和业务验收。上述自动证据不能写成真实依赖或产品验收通过。

### 2026-09-11 Server Test Gates Task 4：聚焦通过，全量受限

- 已验证：`source` 通过 source-owned `ParsedDocumentIngestionPort`/`IngestionJobReference` 使用 `ai.ingestion` 公开契约，架构隔离命令（含 `ArchitectureTests`）7 类合计 20/20，其中 `ArchitectureTests` 1/1；Task 2 的 H2 清理连续两次隔离 24/24；Task 3 的 Server OpenAPI artifact 测试 8/8。
- 本轮当前增量编译产物下标准聚焦命令实际 40/40、0 failures、0 errors。标准全量 `mvnw -B -ntp test` 实际执行 239 项，0 failures、3 errors，三项均为 MinIO/PgVector/Testcontainers 无法连接 Docker；不得写成全量通过。fresh `clean test-compile` 仍在 `AiProviderSecurityTests.java:182` 因匿名 `ProviderHttpTransport` 未实现当前 `post(..., byte[])` 抽象方法而失败，未修改该并行 blocker。
- `check-openapi.ps1` 的 runtime artifact comparison 与 Server 8/8 已通过，但 `Auralis-PC/src/api/generated/schema.ts` stale，未运行 SDK 生成。标准生命周期、隔离测试、契约脚本与外部依赖结果必须继续分开记录。
- P1 处理：补齐并行测试的当前 `ProviderHttpTransport` 实现后，重新运行 fresh Maven 聚焦/全量门禁；关闭 Docker 后复跑三项 Testcontainers；在授权窗口更新 PC generated schema 并复跑 `check-openapi.ps1`。真实 Provider、PostgreSQL/MinIO、Tauri/GUI 和业务验收仍未完成。

### 2026-09-11 Overview Source deletion fence：自动门禁通过，外部边界开放

- 已验证：PC 文件总览要求活动 FILE Source 的精确 `ingestionRevision` 与本地文档任务 `READY`；删除在 tombstone/投影移除后同步阻断 Source、abort 匹配请求、清理文件总览缓存，晚到响应不保存或标记失败，且先于同步/后台文档清理。Server 在每个共享 Map/Reduce Provider 调用前后复核活动 `READY`/精确 revision；进行中的调用可能完成，但结果被拒绝且后续调用不开始。Subject 总览及 API/数据库/同步契约不变。
- 本轮证据：PC `npm.cmd run test:r4-pc` 322/322、`npm.cmd run type-check` 退出 0、`npm.cmd run check:r4-pc` 退出 0（93 个生产文件）；Server `AiOverviewServiceTests` 19/19、退出 0，Overview 失败日志仅记录规范化 UUID `requestId`、allowlisted 关联字段、阶段、稳定 `errorCode`（或 `OVERVIEW_GENERATION_FAILED` 回退）及 exception/cause 类型；非法或含敏感内容的请求 ID 会替换为服务端新 UUID，不含原始 exception/cause 文本或 throwable stack；Task 4 Server 全量 `test` 退出 1，239 项中 0 failures、3 Docker/Testcontainers errors、0 skipped。artifact comparison、Server OpenAPI 8/8 已通过；fresh testCompile 的 `AiProviderSecurityTests.java:182` blocker 与 PC schema stale 仍开放，不得写成全量或契约总门禁通过。根目录 `git diff --check` 退出 0。
- P1 外部验收：Provider 调用中的服务端取消不可由 fence 强制中断；需在真实 Provider/HTTP 环境验证删除或 revision 变化时的断连与不再继续生成。P2 外部验收：真实 Tauri 删除/重传顺序、Axios disconnect、PostgreSQL/MinIO、GUI 和业务结果仍未执行。关闭条件是取得对应现场/端到端证据并复核上述全量门禁既有错误。

### 2026-09-10 Provider Overview response timeout

- 根因：ProviderHttpClient 将 `AURALIS_AI_REQUEST_TIMEOUT_MILLIS=10000` 同时用于连接、读取和请求；DeepSeek completion 在约 10.2 秒触发 `SocketTimeoutException`，OpenAi-compatible provider 又把它按普通 IOException 映射为 `MODEL_UNAVAILABLE`/503。
- 修复与自动证据：Provider connect/read 分离（默认 3000/10000ms），Overview map/reduce 使用默认 120000ms（配置限制 60000–120000ms）；`SocketTimeoutException` 映射为 `MODEL_TIMEOUT`/504，普通 IOException、429/5xx/400 和普通聊天/流式路径保持既有行为。TDD RED 捕获缺少 timeout overload/配置、旧错误码及配置越界未拒绝；最终 Provider、Overview、普通 streaming、embedding、错误映射及 OpenAPI 聚焦回归 60/60 通过。真实 DeepSeek、SiliconFlow、生产反向代理仍未验收。
- P1 外部验收：在受控环境验证 Overview 生成超过 10 秒但小于 120 秒时不再 503，确认普通 chat/stream/embedding 仍按 10 秒 response 窗口运行，并检查日志无 key/prompt 泄露。

### 2026-09-10 PC 学科总览：自动证据已接入，真实边界开放

- 文件/学科总览结果只保存在 owner/device 隔离的本地 schema v7；Server 两个端点无新增表、Conversation、Message 或 Sync 资源。客户端在入缓存前校验 schema/mode/嵌套结构，分项生成失败只更新安全诊断并保留旧内容。
- 页面沿用原 `AI 梳理` 按钮位置与三栏宽度；学科总览默认折叠且用户主动生成，文件大纲直接展开，文件总结复用中栏。前端展示组件样式由 Antigravity 在隔离工作树产出方案后由 Codex 审查并以受限补丁集成。
- 自动证据：Server 聚焦 23/23、PC 完整 R4 306/306、overview/UI 聚焦 18/18、type-check、`check:r4-pc`、SubjectWorkspace 契约、生产构建和 diff-check 通过。Luna 终审发现的“零可用输入未标 stale”“空大纲进入 subject 请求”和“缺少学科 OUTLINE 独立入口”均已用回归关闭。OpenAPI artifact 8/8 且 PC schema 已更新；仓库级 `check-openapi` 仍因既有 `P1-OpenAPI-Mobile-Schema-Lock`（Mobile schema 过期/文件占用）退出 1，不能写成契约总门禁通过。Server 全量 223 项中 0 失败、28 错误，仍由既有 Modulith 边界、共享 H2 外键清理及 Docker 不可用导致，不视为本功能回归通过。
- P2 人工验收：真实 Tauri v6→v7 重启升级、上传完成到自动生成、真实 Provider、Source revision 更新、文件/学科重新生成、locator 回退、双账号隔离及深浅色/窄屏 GUI 尚未执行。关闭条件是取得上述实际运行证据；自动测试和构建不替代业务验收。

### 2026-09-09 PC 时间轴空槽拖动 400 修复

- 根因：`useTaskStore.rescheduleTask` 的空槽分支仍调用只适用于两个已排期任务的 `schedule-swaps`，请求体中传入 `targetTaskId: ''`。Server `ScheduleSwapRequest.targetTaskId` 要求 UUID，因此在业务服务之前返回 `400 VALIDATION_FAILED / Request validation failed`。
- 修复：空槽分支改用 `updateTaskModel(fromModel)` 执行单 Task 本地投影与 outbox 原子写入；目标槽有任务时仍提交四个合法字段的原子 swap。TDD RED 12/13，GREEN 相关 35/35；完整 PC 272/272、type-check 和静态检查通过。P2 人工验收：真实 Tauri GUI 中分别拖到空槽和占用槽，确认本地即时反馈、后台同步和冲突提示。

### 2026-09-09 PC 知识块来源名称修复

- 根因不在文件解析编码：`mapKnowledgeBlockView` 把 `sourceId` 直接写入用于展示的 `source`，因此 UI 将 UUID/资源 ID 当成文件名。现由 Knowledge Store 从本地 Source 投影解析真实 `title`，关联丢失时使用中性文案，不再显示 ID。
- TDD 证据：修复前聚焦用例 9/10，实际值为 `source-1`、期望中文文件名；修复后聚焦 11/11、完整 PC 270/270、type-check 和 `check:r4-pc` 通过。P2 人工验收边界：需在真实 Tauri GUI 中打开含中英文/括号文件名的已有知识块，确认列表、弹窗、图谱的来源名一致刷新。

### 2026-09-09 PC 知识块学科名称映射补充

- 根因同属展示投影边界：`mapKnowledgeBlockView` 将 `subjectId` 直接写入可见 `subject`，导致知识块标签、搜索和弹窗显示资源 UUID。现由 Knowledge Store 从同一用户/设备的 Subject 投影解析 `Subject.name`；缺失关联时显示“未分类学科”，`subjectId` 仍只保留作筛选/写回标识。
- TDD 证据：新增回归修复前实际值为 UUID、期望 `编译原理`；修复后映射聚焦 12/12、完整 PC 271/271、type-check、静态检查、生产构建和 diff-check 通过。P2 人工验收边界：真实 Tauri GUI 中的知识块标签、搜索和弹窗需确认学科名实时刷新。

### 2026-09-09 PC PDF 混合页面状态修复

- 已修复同一 PDF 出现文字页→OCR页→文字页时的本地阶段回退：进入 `OCR_RUNNING` 后，普通文字 block 仍保存 `OCR_RUNNING`，直至 `PACKAGING`；未放宽非法转换、未改变 PDF 分类或 API/schema。
- TDD 证据：修复前严格转换回归因 `DOCUMENT_JOB_ILLEGAL_TRANSITION` 最终为 `FAILED_LOCAL`；修复后 runner 聚焦 12/12。真实 51 页 PDF、Tauri GUI、MinIO/Server 上传和业务结果仍未验收。

2026-09-09 Task 13：自动回归覆盖 trace 顺序、稳定错误码、过期 intent 双 PUT 和隐私 allowlist；日志只在开发控制台可见且不持久化。真实 Tauri、MinIO PUT、Server complete/indexing 和 GUI retry 的最终事件序列仍待观察。

### 2026-09-09 PC stale/current revision preflight correction

- 修正 fix3 过强的“Source GET 前拒绝”口径：Source 当前 revision 只能由一次权威 GET 决定；scheduler 先 GET、再 stale supersede、最后只校验 current revision。stale corrupt job 的 receipt/ID evidence 保留，不会阻塞另一个 valid current job。
- current mismatch 仍在任何 hash/prepare/runner/OCR/upload intent/PUT/complete/cache deletion 前返回；测试更新为恰好一次 Source GET。scheduler 33/33、schema 17/17、upload 16/16、完整 PC 259/259、type-check、diff-check 通过。

### 2026-09-09 PC recoverable server-phase mismatch closure

- 本地 cache corruption 在 `SERVER_VALIDATING`/`SERVER_INDEXING` 不再因非法迁移而抛错，现进入可 retry 的 `FAILED_LOCAL`；READY 与 FAILED_SERVER 仍保持原 phase 并保留 bounded mismatch evidence。`retry()` 重新入队规则已由真实 repository/scheduler 覆盖。
- scheduler 在一次权威 `sourceApi.get` 后只预检选中的 current-revision local job；mismatch 不触发 hash、prepare、runner/OCR、upload/complete 或 delete。schema 17/17、scheduler 32/32、upload 16/16、完整 PC 258/258、type-check、diff-check 通过。真实 Tauri/Server/MinIO/GUI 仍未验收。

### 2026-09-09 PC phase-safe cache mismatch closure

- 修复 scheduler 对 schema-v1 cache mismatch 无条件请求 `FAILED_LOCAL` 的非法迁移：现在统一复用 phase-safe preservation helper。READY、SERVER_VALIDATING、SERVER_INDEXING、FAILED_SERVER 不伪造 Server rejection，合法同阶段保留两侧 cache ID/receipt 与 bounded ownership error；recoverable phases 才进入 FAILED_LOCAL。
- Real repository table regression 覆盖四类 phase，证明 mismatch 返回稳定结果且不发生 upload/OCR/backend/deletion；scheduler 31/31、upload 16/16、schema 16/16、完整 PC 256/256、type-check、diff-check 通过。真实 Tauri/Server/MinIO/GUI 仍未验收。

### 2026-09-09 PC cache-safety review fixes

- 两项 Important findings 已按 TDD 修复：READY 派生 cache cleanup 采用 delete-before-clear，失败保留 cache ID/receipt 和稳定 bounded 错误；后续 READY schedule 会重试清理且不重新上传、解析或请求后端。schema-v1 receipt 与 job column 的 cache ID mismatch 在 scheduler/coordinator 网络边界前拒绝，保留两侧证据。
- 证据：upload 16/16、scheduler 30/30、schema 16/16、完整 `npm.cmd run test:r4-pc` 255/255、`npm.cmd run type-check` 与 `git diff --check` 通过。真实 Tauri/Server/MinIO/GUI 仍未验收。

### 2026-09-09 PC ParsedDocument 状态迁移修复，真实边界仍开放

- 根因已由真实 `DocumentProcessingJobRepository` 回归复现：complete 成功后 coordinator 直接请求 `SERVER_VALIDATING -> READY`，被现行迁移表拒绝为 `DOCUMENT_JOB_ILLEGAL_TRANSITION`。修复为先写入 `SERVER_INDEXING` 再写入 `READY`，未放宽迁移表。
- 本轮 focused 证据：ParsedDocument upload 15/15、processing flow 1/1、job schema 16/16、source scheduler 27/27；完整 `npm.cmd run test:r4-pc` 251/251、`npm.cmd run type-check` 与 `git diff --check` 通过。scheduler 的 READY 返回与 cache cleanup 责任未改变。
- 仍未关闭的 P2 业务验收风险：真实 Tauri/Server/MinIO PUT、complete/indexing 和 GUI retry 未由本轮自动测试证明；关闭条件是取得完整外部服务与 GUI 过程证据。

### 2026-09-08 Task 12：schema-v1 自动验证完成，真实验收仍开放

- Rust packager/cache/upload、Java validator/complete、PC focused/full R4 与 type-check 均取得本轮通过证据；最终 scheduler focused 27/27、完整 PC R4 250/250，`git diff --check` 通过。安全扫描未发现生产上传 JSON 包含 owner/job/device/user 字段、signed URL、Authorization 或 OCR 正文；测试中的敏感字符串仅为脱敏/拒绝断言样本。
- 本轮只证明代码、跨语言 fixture 和自动回归；尚未重建/重启真实 Tauri 并用 `1.pdf` 观察旧 receipt 一次性重解析、MinIO PUT、complete、indexing 和 Source `READY`。该 P2 业务验收风险保持开放，关闭条件是取得完整 GUI/Server/MinIO 过程证据。

### 2026-09-09 Final reviewer closure

- Final review fix 1–3 已关闭全部 Critical/Important findings：scheduler 将 immutable Asset SHA 原样传入 runner；legacy、receipt-only、matching、mismatched 及删除失败的 cache ID 清理均按安全顺序处理，覆盖 discard、stale 和 terminal jobs；coordinator 对缺失、不完整或非法 schema-v1 receipt 在 intent/PUT/complete 前统一拒绝。
- Final evidence：scheduler 27/27、完整 PC R4 250/250、type-check 和 diff-check 通过。Minor reviewer findings未在本轮处理；真实重建 Tauri、Server/MinIO 与 GUI retry 仍未验收。





2026-09-08 ParsedDocument PUT 长度根因已定位并修复：真实 source chain 显示 `user body write aborted -> early end, expected ... more bytes`，对应旧 receipt 将加密 envelope 总字节写入 `payloadBytes`，而 Rust 解密 reader 只发送 gzip payload。新 receipt、intent `sizeBytes`、Rust sized body/Content-Length 与发送后 bytes/hash 校验统一使用解密 payload；历史 receipt 在恢复边界按 owner scope 重算。关闭条件仍是重启真实 Tauri 后点击继续，完成 MinIO PUT/complete/indexing 验收。

2026-09-08 Task 颜色切换风险：V21 与 PC/Mobile 本地迁移只清洗可解析 Task JSON；非法 payload 按要求保留原文并限次告警，需真实旧库升级复核。KnowledgeBlock `colorOverride` 不在清理范围。若本轮类型或回归门禁被主树既有错误阻断，不得写成整体验收通过。

2026-09-07 MinIO 运行态复核：原先 `mc ready` 会在 MinIO 内部 `/data` 周期性 offline 时仍返回 healthy；Compose 已改为随机临时对象 PUT/HEAD/GET/DELETE 探针。安全重启后最终独立对象测试通过，但此前周期性掉盘现象的宿主/Docker Desktop 根因尚未被证明关闭；需持续观察日志并完成真实 Tauri PDF/PPTX/DOCX 重试。

2026-09-08 PC 断网续传状态机已由真实 repository 回归和 focused 复审覆盖：带 payload receipt 的 `PAUSED_NETWORK` 继续经 `QUEUED -> UPLOADING`，无 receipt 的 queued 任务仍解析；`NETWORK_OFFLINE` 保持稳定错误码并只保留 allowlist reason。风险仍开放：需在真实 Tauri 中再次点击继续，确认实际 MinIO PUT/complete/indexing 和 GUI 状态，不得以自动测试替代外部服务验收。

### P1-PC-Authentication-Rehydration

后端重建会使 PC 持久 access/refresh token 对应的 refresh session 失效，已造成 `/api/realtime/ticket` 与 Asset `download-url` 同时 401。当前代码在 refresh 失败时原子清除会话并进入 `reauthentication-required`，禁止受保护请求、sync 和 Source document scheduler 继续启动；登录/注册/refresh/health 保留恢复入口，单飞 refresh 与一次重放保留。24/24 聚焦 Node 回归通过。真实 Tauri 重启、重新登录、后台请求停止和登录后恢复仍需 GUI/服务联调证据，故风险保持开放。

### P1-PC-Browser-Node-Stream-Entry

PPTX parser 已使用 JSZip 浏览器 bundle，Vite 对 File Viewer 及其它根 `jszip` import 增加精确 alias，避免跟随 Node `stream.Readable` 分支且未引入空 polyfill。源级回归通过；本轮未运行新鲜 Vite build，最终产物扫描和真实 Tauri 预览仍是关闭条件。

