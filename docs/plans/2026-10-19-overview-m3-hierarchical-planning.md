# Overview M3.1：有限层级目录规划实施计划

日期：2026-10-19
作者：主模型；执行、验证及最终单一审查：gpt-6-luna high。
状态：源码、相关验证与唯一审查完成；未部署。M3 后台 jobs、暂停/恢复、预览与发布仍未交付。
范围：M3 的前置小阶段，不包含持久后台 job、暂停恢复、预览发布、PC UI 或跨任务缓存。
依据：docs/plans/2026-10-18-overview-adaptive-generation.md 的 M3 前置交付与正式设计。

## 实施与验证结果（2026-10-19）

OverviewGenerationService 已加入受限 metadata 分层目录、metadata 专用 purpose/schema、算法版本围栏、同 Guard/Gateway 的调用预检、checkpoint 路径及 plan alias 到原始 unit alias 的私有有序展开。小输入仍走单次目录请求；只有其完整请求不适配时进入层级规划。现有 writer 和 M2 provenance 装配接收规范化后的原始 unit 顺序。

2026-10-23 修复跟进：通用 system prompt 对 ALL 要求 summary，而独立 `ADAPTIVE_METADATA` 层要求 summary=null，导致合法的冗余 summary 触发内部 shape 拒绝。该 purpose 的 system 指令现明确内部 null 规则优先；已通过 schema 校验的 Provider response 与恢复 checkpoint 都规范化顶层 summary，保留全覆盖、无未知/重复 alias 和 shape 验证。旧 checkpoint 只在读取结果中规范化且不改写持久账本。`ADAPTIVE_METADATA_ROUTE` 的 ALL summary、writer 和最终结果 summary 保留原语义。聚焦回归与命令证据见本次 D 盘 handoff。

OverviewAdaptiveGenerationTests 覆盖多 Source 两层规划/原文与来源顺序、无进展、Guard call headroom、checkpoint 重用和展开后超过 100 refs 时的 writer 容量拆组。首次两类 focused batch 是 47 tests / 46 passed / 1 failed；唯一失败用例随后 attempt 4 单独通过，所以全部 47 个相关 case 分别有通过证据，但没有第二次完整 47-test 全绿运行。唯一 reviewer 结论 BLOCKER=0 / IMPORTANT=0 / OPTIONAL=0。真实 Provider、业务数据库、部署或 GUI 未执行。

验证报告：`D:/Temp/auralis-overview-m3-planning-20261019/final-validation-report.md`。唯一审查报告：`D:/Temp/auralis-overview-m3-planning-20261019/reviewer-final-report.md`。

用户已明确未正式部署的旧版本无需兼容，最终统一清理未使用的版本兼容代码；详见本文末尾，不在 M3.1 扩大全仓清理。

## 当前证据与修改必要性

当前 generateAdaptiveOverview 已对原文分批索引，但把所有轻量索引拼成一个 indexDocument 后仅允许一次目录请求（OverviewGenerationService 1001–1064）。索引总 prompt 不适配时即失败。此处是 M3 明确要求消除的单次聚合限制；其他 M1/M2 代码保持冻结。

## 实现决策

1. 能放入单次目录请求的输入保留直接路径和调用规模；ALL/OUTLINE 生效，SUMMARY 与默认关闭开关保持。
2. 超出目录请求时，仅将轻量索引 metadata 按完整实际 prompt/model context 容量分组。模型整理组内主题/职责与引用，不接收或改写原文，不重写已验证正文。
3. 每个组内输出条目由应用分配确定性 plan alias，并在私有不可伪造映射中绑定其有序原始 unit aliases。后续层只引用当前层授权 alias；每组及每层必须检查全覆盖、未知/重复引用和内部 shape。模型不能指定 source、revision、位置、ID 或授权。
4. 最终目录从规划 alias 经应用映射展开到原始 units，去除同节重复并按初始 inventory 顺序规范化，核对全量覆盖后进入现有 writer 容量分组和原文生成。跨小节复用仍允许。不得对模型伪造 source UUID；metadata-only alias 映射必须与正式 source UUID/provenance 映射隔离。内部展开引用数可超过单次 Provider 的100 refs边界，由既有 writer 分组；最终公共输出继续受原有限制。
5. 最多4层 metadata 中间整理，最多64次 metadata 分组调用、累计最多2000个整理输出条目；原始轻量索引条目最多500。每层后待规划的真实序列化负载必须严格缩小，否则明确失败。单条 metadata 也放不下、层数/总节点/工作量超限均以既有安全错误失败，不静默截取条目、标题、原文或正文。公共60章/500节、raw inventory 500、结果1Mi字符、每prose4000 codepoints不放宽。内部索引拼接不受最终60章约束，但仍受上述500条目和有限 metadata 容量；单个Provider回复仍正常校验。
6. 引入 metadata 专用 purpose/schema/system规则与 expectedSummary=null，避免模型输出正文或混用公开ALL模式；走原有 invoke/Gateway/Guard、平台财务准入、BYOK技术保护、同父任务/期限/取消和完整JSON修复。各层对已知未缓存分组调用先检查可用调用预算；不新增stage/quota或绕过账本。
7. 更新adaptive算法版本隔离旧M1/M2目录检查点。purpose+stage+实际prompt参与checkpoint，已校验中间metadata可以复用；writer仍只接收原始unit/source/revision/order及M2 provenance。此次不承诺跨算法复用已完成正文、跨任务永久cache或跨进程后台作业。
8. 日志只记层数、条目/组数量、长度、覆盖和阶段，不记原文、完整prompt、endpoint或凭据。

## 文件边界

优先局部修改 OverviewGenerationService.java、OverviewAdaptivePipeline.java 与 OverviewAdaptiveGenerationTests.java；需要分离纯metadata辅助类时允许同ai包一份小型类，禁止重构其他冻结模块。不改公共DTO/API/schema/DB/SDK/前端/依赖/配置。同步现有设计与实施计划、Backend、Status、Issues、Changelog及README登记本计划；API只修正文档中单次目录现状描述，契约shape不变。Database无改动无需回写。

编辑任何文件前将该文件当前dirty字节快照/哈希保存到 D任务目录；所有diff归因于这些基线，不能把HEAD差量认作本轮修改。

## 小阶段验收

- 直接路径调用规模/ALL和OUTLINE语义保持；SUMMARY和开关兼容。
- 多批且至少两层metadata（含多Source）成功，路由覆盖所有原始units；writer收到原文、顺序与真实provenance，无原文/正文全局重写。
- 掉引用、未知/重复引用、无进展、单条放不下、深度/工作量边界明确失败且不继续writer。
- 父任务/平台拒绝、BYOK有限执行、deadline/取消和checkpoint恢复保持；至少一个层级中间checkpoint复用证据，不通过新增task绕过限额。
- 无 public contract/schema/config/依赖变化；M2身份/provenance相关回归纳入必要测试范围。

## 一次集中验证与唯一review

所有代码、对应测试和文档初稿完成后：静态diff/范围检查 → 对应AI Overview/预算/恢复/身份测试（一次集中选择）→ package（如实际风险需要）。不自动重复全量Server、PC/Mobile/OpenAPI/SDK或业务验收；内部单模块无接口/依赖变化，按BeforeCoding的单模块规则选择相关测试。失败完整归因后只重跑必要失败组，同一失败最多3次。结束后仅一个gpt-6-luna reviewer只读检查B/I；OPTIONAL不修改。修复必要B/I并定向验证后关闭。最终仅状态文档回写不重跑代码检查。

所有日志、缓存、runner与测试材料使用 D:/Temp/auralis-overview-m3-planning-20261019；允许任务独占的D-backed Docker环境。不得研究C盘，不调用真实Provider/业务库，不部署/迁移业务容器，不读取密钥或改凭据，不commit/push。

## 用户追加决定：最终兼容清理（2026-10-19）

用户明确：未正式部署使用过的旧版本无需兼容，可直接按当前目标版本修改；最终统一移除不用版本的兼容。后续禁止为此新增旧算法回退/双读/字段fallback。小输入单次规划属于当前容量优化，不是旧版本兼容；算法版本和输入围栏仍为防错误缓存复用而保留。

总实施计划必须登记最终清理门禁：盘点并移除未使用版本的兼容分支、废弃字段/DTO与fallback、旧cache/checkpoint格式读取及仅服务兼容的测试和文档，收敛为唯一现行契约。此为路线最终清理任务，本轮不扩大到全仓重构或数据库删除；保留正常幂等、权限、修订、预算和有效数据安全规则。Status/Issues同步尚待清理事实。
