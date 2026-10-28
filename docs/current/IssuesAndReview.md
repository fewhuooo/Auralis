# Auralis 当前问题与审查登记

### 2026-10-28 历史记录与现行风险分层

明确的阶段历史区和旧综合审计已移入归档，现行风险登记及验收边界保持；原阶段历史中的未验收项不因迁移而关闭。空壳规范文件只有标题，已移除入口，工作树原文留在仓库外备份；代码保护规则仍以 `AGENTS.md` 与 `docs/agent/BeforeCoding.md` 为准。

### 2026-10-28 文档维护入口整理

旧文档重构计划曾以未执行任务形式留在 `planning/`，文档验收清单仍引用旧任务 8/9。本轮已将执行计划原文归档、修正现行导航并将验收清单改为按修改范围维护；PC 源码旁的 31 个未跟踪编译输出及临时路径文件已备份移出。该整理不关闭任何 GUI、真实 Provider 或业务数据一致性验收项，证据与备份见 `D:/Temp/auralis-project-cleanup-20261028/`。

附加检查 `npm.cmd --prefix Auralis-PC run check:r4-pc` 退出 1：现有扫描器会扫描 Rust 测试模块，并将 `src-tauri/src/local_asset_store.rs` 的 `#[cfg(test)] mod tests` 内回环地址（如 `127.0.0.1:0`）命中为 fixed local address。该文件与开工 hash 相同，本轮未修改或重试该检查；文档链接、PC type-check 与备份/工作树保真检查均退出 0。

### 2026-10-28 Overview 按来源路由与遗漏补回（源码候选）

针对8份无关资料的174主题路由只引用89个ID、在Writer前终止的问题，改为按最早BODY原文来源分域路由，源内沿原章顺序聚合；整源能放下则一次请求，超容量才按现有动态规则拆分。跨源主题只归一个域但保留所有原始引用。ROUTE解析接受非空合法子集，未知/重复ID仍拒收；程序将连续遗漏按原章、原序及完整Writer请求容量成组补入，最后校验完整唯一覆盖。无需额外模型修复，也不新增固定主题数或节数上限。背景/导航过滤、Writer证据及重试/费用语义保持。

集中定向首轮Adaptive77项5F/4E，旧跨源fixture与prompt断言更新后的首次受影响复验77项仍有1F，最终含补回原序回归的Adaptive78/78通过；DynamicBudget17/17、Recovery23/23通过。未运行全量测试、部署、业务库/缓存操作或真实模型生成。唯一只读审查的顺序问题已修正，同一reviewer差量关闭后最终B0/I0/O0，审查结论见D:/Temp/auralis-local-route-20261028/review.md；本轮命令与证据位于同目录。实际生成质量与耗时待部署后验收。

### 2026-10-27 香港23:05 重试候选已部署

按用户授权，以现有基础Compose及overview-trace overlay构建并recreate backend/frontend，均exit0。启动时Flyway验证41个迁移，数据库已为V41，本次无需重复执行迁移。backend healthy、readiness HTTP200，frontend HTTP200；db/MinIO容器ID及挂载前后相同。backend镜像abe74be55083…，frontend2321333dfca5…。未清缓存、未调用真实模型，重试业务效果待用户使用验收。日志：D:/Temp/auralis-overview-retry-deploy-20261027/。

### 2026-10-27 服务重启后 direct 重试被旧generation阻塞

源码已将direct尝试身份与内容复用身份分离，避免新request仍接管旧FAILED/过期代并重复被父allSafe拒绝。显式retry按父单后继原子切换，旧fence和费用保留；FAILED祖先的已验证节点可复用，未知输出不复用。普通无旧ref或未解析ref按当前授权输入生成，job所属代不被direct替换。唯一只读review B0/I0/O0，测试/SDK/构建分批闭合；未部署、未真实重试。

验证边界：full只运行一次950项1F/55E/2S，认证first-match与快照缺公开fixture导致的setup错误不视为产品通过；补齐环境后10个PG类48个实际case、2个资源方法及TaskColor方法组成51项，50通过/1旧latest断言失败，再Identity单项1/1通过。两份迁移测试只把latest40改41。2个历史trace replay未opt-in；隔离schema teardown调度日志没有case失败。PC初始精确基线遗漏，历史已验候选与manifest5/5匹配的差量及当前逻辑已审，不伪称全树基线审计；legacy MAP/REDUCE未新增失败跨代复用，PC请求引用不跨刷新持久化。详证据D:/Temp/auralis-overview-retry-impl-20261027/validation/final-validation-report.md与review.md。

### 2026-10-27 可见导读偏简与内部编号

用户确认后台完整正文未在当前PC大纲展示后，本轮只针对可见总结偏简补充导读提示。总结预览代码没有截断概述/要点/路径；原EDIT指令仅说明证据来源与模式，现补充实际覆盖范围、章间联系、按章实质要点及使用真实标题的学习路径。保留视图内成稿依据，不堆新的防御提示，也不扩大输入或调用阶段。既有prompt-contract方法1/1通过，唯一只读审查B0/I0/O0；没有重生成当前结果，实际改善待部署后的新生成验收。证据 `D:/Temp/auralis-guide-prompt-enrich-20261027/`。

### 2026-10-27 INDEX 缺失 summary 导致双重校验口径不一致

香港13:20:52的失败追踪中，第二批INDEX缺根summary字段，32节来源角色与引用均匹配；通用投影可接受缺省null，但角色解析严格根字段检查拒绝，造成先校验成功后source-role metadata不可用。现于角色解析共用入口严格读树后补齐缺失summary=null，不修改显式值，不改其它字段或增加模型格式修复调用。回归覆盖主响应和既有修复响应省略字段时继续生成、章信息与来源保存，以及缺其它字段/未知字段/非法角色仍拒收。隔离编译及Adaptive76/76通过，唯一只读审查B0/I0/O0；本轮仅Validator与Adaptive测试差量，不涉及公开契约/DB schema/提示词。未部署或真实重试，证据 `D:/Temp/auralis-index-summary-normalize-20261027/`。

### 2026-10-27 Writer 尾随噪声与失败恢复缓存阻塞

Writer原恢复仅接受ASCII短标记，完整JSON后多出的`<`不在范围。现改为确定性截取完整首根对象并清理外围噪声，再执行原严格decode；JSON内部不修改，不猜测损坏首根中的其它对象，不新增模型调用。首轮74项73通过，前轮遗留提示词断言单项1/1；review发现第二JSON根紧贴后续文本时漏检，修正后Writer单方法1/1。首根前缀包含`{`而不构成合法JSON仍拒收，作为明确边界不增加候选搜索。未部署，真实响应验收待完成。

数据库确认原请求与两次后续请求复用同一FAILED generation，最终error为AI_TASK_BUDGET_EXCEEDED，早先第58Writer的尾随`<`失败与后续预算失败分开记录。目标无lease/unknown/inflight，62笔reservation均已结算；用户要求清缓存且不要备份，主Agent审查精确单UUID SQL后COMMIT，保留业务数据和账本完整行hash。7个旧备份文件删除被工具策略拒绝，工具仅返回blocked by policy，未绕过或删除。代码证据 `D:/Temp/auralis-writer-json-clean-20261027/`，操作证据 `D:/Temp/auralis-failed-cache-clean-20261027/`。

### 2026-10-27 多PPT路由粒度与Writer尾随字符

真实7PPT请求的只读证据显示：82原文单元经两批INDEX得到127主题，ROUTE收到126主题并返回126小节，对应126个Writer；不能把索引主题数直接当最终教学小节数。现已精简INDEX/ROUTE/Writer与公共字段提示，突出核心议题内聚和多主题同节；取消ROUTE建议输出Token后缀，保留程序预算、来源/章序/结构校验。未设节数或比例配额，实际聚合效果待真实验收。首轮定向与旧断言/示例fixture的affected闭合见Backend；唯一只读审查及同reviewer测试差量闭合B0/I0/O0，最后仅删除一处新增负向文案断言未重跑，生产代码未变。证据 `D:/Temp/auralis-cohesive-prompts-20261027/`。

该请求于香港11:40:26在57/126 Writer验证完成后失败：下一次Writer正常stop且完整JSON根结束后多一个`<`，导致严格解析失败。此独立响应容错问题本轮仅诊断，未扩大解析接受范围、清缓存或重试模型。证据 `D:/Temp/auralis-seven-ppt-log-check-20261027/failure-20261027-114133/failure-analysis.md`。

### 2026-10-27 EDIT 合法空补丁导致整轮失败

最新真实日志与追踪显示14/14 Writer完成，EDIT响应正常stop但返回14条只有segmentId/segmentHash的空补丁；schema允许该形状，apply却抛empty segment patch，外层归为MODEL_PROVIDER_ERROR。源码现将身份/hash合法的空补丁作为no-op登记，继续Guide及其余校验；提示词明确省略无编辑条目。保留重复ID、stale hash、未知字段及实际编辑保护，不新增重试或模型修复。定向18/18通过；首次Maven参数引用错误在编译前退出，纠正参数后通过。唯一只读审查B0/I0/O0，第四文件提示词测试断言由同一reviewer差量关闭。未部署或真实重试；运行态是否解决仍待部署后的用户验收。证据 `D:/Temp/auralis-empty-edit-fix-20261027/`。

### 2026-10-27 原章归属跨批丢失与路由移章

- 新候选关闭原流程只能稳定装配、不能固定原章顺序的问题：INDEX实际章头元信息与自由分组标题分开；原文可定位才使用。程序按来源/单元/主题输出顺序顺延，原章固定、章内自由；目录和预告不是正文章头依据，跨章混装按绑定章拆回，不新增致命章冲突或模型修复链。
- 验证发现只比较unit位置会把同unit中声明前的主题提前移章，现已补topic输出顺序并通过实际case：A在导论，B才入新章，ROUTE容器也对应。首轮119项6失败与后续夹具/断言修正分批记账；Recovery30、Budget17与跨JVM首轮通过，未将分方法闭合说成整轮全绿。测试编辑发生一次范围误匹配，使用候选恢复后按方法编辑；完整三段hash链未保存，主Agent以任务baseline差量/方法清单确认没有原测试方法丢失，证据在D目录main-recovery-audit。唯一只读审查发现并关闭两项IMPORTANT：ROUTE主动许可混组的矛盾指令、主片段标题/目标被覆盖。最小修正后4/4通过，同一reviewer确认最终B0/I0/O0。
- 尚未验收：章识别依赖INDEX和标题定位，不能保证完整区分实际章头/目录/预告；同unit先后依赖模型遵守输出顺序。公开形状与现有身份/费用校验保持，本轮未部署、未操作业务库、未调用真实Provider或GUI。执行记录见D:/Temp/auralis-overview-chapter-order-20261026/implementation-validation-report.md。

### 2026-10-26 动态容量本机部署与失败缓存清理闭合

用户追加授权部署，并在范围选择中明确清理全部6条FAILED。主Agent在Docker引擎启动、db/MinIO健康后，先备份V39全库与528行目标缓存，再审查执行精确六UUID事务；状态、费用结算、无jobs/publication、预期行/hash及保留数据校验通过后COMMIT。删除失败私有缓存与父行，费用675行、SUCCESS22、正式结果22、原资料及其它缓存保持。唯一unknown-dispatch SUCCESS也保留，未重分类或退费。

backend/frontend build及up exit0，V40迁移成功；HTTP/关键class身份与运行配置核对通过，无新增模型派发。仅更新应用容器，db/MinIO恢复启动而身份与卷保持。没有源码改动、重复测试或另起审查。真实Provider、GUI与内容质量仍待用户实测；这不是全量测试全绿声明。备份、执行SQL、COMMIT和12组hash证据见D:/Temp/auralis-overview-deploy-20261026/。

### 2026-10-26 Overview 动态容量、阶段数量口径与模块依赖

- 已修代码：请求/输出/存储的低固定帽改为 26 项 ENV（默认 0、正数额外限幅）；删除多层 Metadata 和 Writer 回声字段成功条件。完整请求的线性输出需求估算替代增长过慢的估算，预留仍受模型/实际 context/正数 ENV 约束；不因余额缩减内容需求。private INDEX/ROUTE/Writer 的 topic/unit aliases 不套最终来源/小节容量，授权和严格结构校验保留，最终按真实来源 UUID 校验。公共配置不再引用 AI 业务枚举，关闭新模块依赖环。
- 验证闭合：初轮编译/定向暴露实现与夹具问题，保留原日志。唯一 full 为 933 项、4F/54E/7S；缺隔离 PG/TLS 参数、profile fixture、calls=0 断言及模块环分别处理后，隔离 PG 43/43、affected 44/44 通过，未重跑 full。OpenAPI/SDK 15/15、package、Compose config、PC type-check/接收 80/80 通过。已删除依赖废弃固定调用序列的三项用例，以当前契约验证，不增加兼容层。唯一只读 reviewer B0/I0/O0。
- 未验收边界：七项 full skip 为两个未提供 trace 目录的离线 replay、五个未配置专属 URL 的 UsageGuard PG lock 测试；没有补启这些条件。当前估算不保证任意材料不低估；动态容量不能证明知识无遗漏或实际成本下降。业务库/运行容器、真实 Provider/GUI 和内容质量均未验收。命令、哈希与分批结果见 `D:/Temp/auralis-overview-dynamic-capacity-20261026/final-handoff.md`。

### 2026-10-26 导航阅读噪音、EDIT全稿输入与Writer职责

- 已关闭代码问题：NAV原文直接插入阅读小节；EDIT直接序列化完整正文；Writer父级writingGoal可驱动重复宏观铺垫。现在NAV仅作轻量结构参考，移除纯导航小节并跳过空章，provenance路径按最终输出重排；无BODY写作组明确拒绝，不调用EDIT。Writer统一由本批原文决定内容范围，父级目标仅定位；INDEX提示追求实质主题完整，不恢复强制原文单元全覆盖。
- EDIT模型视图与完整Snapshot解耦：首尾块去重并保留原kind/身份，实际小标题过滤代码围栏中的伪标题，中间正文不发送；完整快照用于缓存和apply，术语映射仍对完整正文按原保护/作用域/非级联规则执行，无出现次数对账。Guide不得把导航或计划描述当实际教学事实，没有新增摘要/修复阶段。
- 验证：fresh compile通过，124项初轮122通过/2测试文案或fixture失败，修正后仅这2项复验2/2；其余BoundaryEditor15、隔离PG Recovery30、AiSchema3首轮全通过。唯一reviewer相对任务preimage只读审查B0/I0/O0，未重复检查。准确命令/hash/差量见D:/Temp/auralis-overview-reading-edit-20261026/gate/handoff.md，审查见同目录上级review.md。
- 尚待实际验收：新修复未部署，真实材料中的遗漏、跨批中间重复、导读准确性及输入Token下降尚无Provider/GUI证据；轻量视图不能保证任意规模均适配模型。未跑package/full、未调用真实模型、业务库或缓存清理；原工作树改动与原资料保留。

### 2026-10-26 Overview严格索引假成功与提示词减量

- 现场：42个输入单元，第5批是正常正文、不是尾批；前4批无修复调用。第5响应重复根title、缺summary、多根sections，严格用途解析失败后被通用投影解析接受，最终缺角色元数据而失败。旧JSON修复字段名不是这次现场调用的直接原因。
- 修复：INDEX严格结构、summary=null、角色/授权校验贯穿主响应和既有修复；移除原文覆盖补齐模型分支，允许非空合法子集。用户明确总览只减少遗漏、不能替代原文；未选单元保留原资料，不推断必为背景。结构阶段instruction隔离；Writer范围信息移出prompt，保留现有manifest与程序侧精确来源绑定。没有新增修复状态机、存储或兼容层。
- 验证：初轮108项103通过/5断言失败；旧文案/恢复writer+EDIT计数及严格修复场景调整后，4个Adaptive、1个Recovery方法分别复验通过。唯一审查指出INDEX非null summary被清null接受的问题；最小修正后受影响8/8。编译通过，Recovery使用隔离PostgreSQL。未将分批结果描述为一次全量通过；未跑package/full。
- 同一reviewer只读确认差量关闭，最终BLOCKER 0/IMPORTANT 0。本轮未部署、未调用真实模型、未写业务库或清缓存；真实生成通过率、总览遗漏程度和内容质量仍待用户从原界面验收。唯一审查及差量关闭见D:/Temp/auralis-overview-contract-trim-20261026/review.md，精确命令及hash见同目录gate。已有工程文档与工作树改动保留。

### 2026-10-26 Overview 内容组织与边界编辑（工程候选分批验证；语义质量仍待验收）

- 已实现用途分层、逐主题来源绑定、正文主归属、章节预告不作教学依据、纯导航去重直接装配、背景默认过滤、独立Writer及最终patch/guide调用。补丁仅操作获准标题/首尾和作用域内字面术语；快照/hash、保护块、原子应用与缓存恢复保持检查。新算法隔离不匹配的中间契约，既有成功结果和正式记录未清理。
- 分批验证：Adaptive/Schema 79/79；Java MiMo trace 1/1（86配对，24留出/16支持，0低估）；受限后端821项0F/2E/2S，TLS fixture参数错误后3/3通过；package exit0。编译与测试中发现的实现/夹具问题已按失败归因修正，不能将多批结果合并为一次全量通过。
- 唯一Luna审查发现并关闭两项IMPORTANT：混合BODY/NAVIGATION路由此前只保留导航来源而未显示导航内容；首尾前缀启发式可能开放带事实的段落。现分别使用全局原范围去重导航装配、全锚定纯组织句式白名单；修复后受影响91/91及package通过，同一reviewer只检查差量确认B0/I0。未重跑受限821项，也未启动第二位reviewer。
- 未关闭边界：Docker Linux引擎管道缺失，17个PG/MinIO类未验证；真实Provider、完整业务GUI及新总览内容质量未验收。候选估算未默认启用，样本无低估不代表任意模型/文本安全上界。
- 证据：`D:/Temp/auralis-overview-boundary-edit-20261025/gate/summary.md`、`estimator/final-handoff.md`；范围和后续关闭条件见[实施计划](../plans/2026-10-25-overview-boundary-edit-quality.md)。

### 2026-10-25 Overview 生成 provenance 接收问题（源码修复，人工验收待完成）

成功生成的 SSE 使用 raw `OutlineProvenanceInput`，PC 误按 canonical `OutlineProvenanceView` 校验，导致 terminal result 被拒绝并阻断本地保存/正式 PUT。PC 现分开生成和 formal result 类型：raw validator 接受 Java UUID 字符串形状（含 nil UUID），formal view 的 per-section ref 上限与后端统一为 500。最终 PC type-check 退出 0、Overview generation 定向测试 79/79；新增覆盖 nil UUID、无效 UUID、101-ref 接受及 501-ref 拒绝。此前真实成功 payload 的 read-only raw/canonical 分离检查见 `D:/Temp/auralis-overview-contract-alignment-20261025/actual-payload-check.md`。唯一 Luna 只读审查最终 BLOCKER 0 / IMPORTANT 0，两项发现已关闭；报告 D:/Temp/auralis-overview-contract-alignment-20261025/review.md。用户 Tauri 显示及服务器正式结果写入仍待人工验收。未触发 Provider、HTTP 重放、缓存回放、数据库写入、清理或部署。

### 2026-10-25 Overview 提示词嵌套对象确定性序列化（源码与聚焦自动验证完成；未部署）

- 五个提示词嵌套对象现在使用显式插入顺序，字段和值、序列化器配置及 checkpoint 哈希算法均未改变。离线 trace 支持 INDEX 首批的旧 key order 可恢复；Writer 的 66 个有效请求在所选 probe order 下与 trace 一致。没有对当前数据库 checkpoint keys 做实际读取或 cache replay。
- 现有 `OverviewAdaptiveGenerationTests` 66 项在首轮执行中通过；独立 method-only 跨 JVM probe 后续 1/1 通过。固定 source/revision/chunk/generation 身份、内容与时间戳，执行真实 INDEX、Writer、Guide prompt builders；过滤非 probe 日志后，对所有阶段比较原始 user/system JSON hash 与 checkpoint step。测试也明确覆盖最后批次 `nextBatchContext=null` 及 writer sibling bounds 非空。
- 中间测试 harness 故障均已修复；没有把分批结果合并成一次 67/67。最终方法运行 Maven exit 0，日志与候选 hash 清单见 `D:/Temp/auralis-cache-order-fix-20261025/main-cross-jvm-final.log`、`main-final-candidate-hashes.csv`。当前数据库 cache replay、真实 Provider、业务数据库写入、缓存清理、部署与 GUI 验收未执行。

### 2026-10-25 Overview ADAPTIVE_WRITE 尾随标识符恢复（定向验证与唯一只读审查通过）

- 唯一 Luna 只读审查：BLOCKER 0 / IMPORTANT 0，报告 D:/Temp/auralis-writer-tail-fix-20261025/review.md；未重复运行测试。
- 首次 `ADAPTIVE_WRITE` primary 响应只在 `finishReason=stop` 且未命中现有截断检测时，允许完整 writer JSON 根对象之后存在一个 1–32 字符 ASCII identifier。严格本地 parser 拒绝根/嵌套重复键；恢复后仍校验完整私有 schema、source/topic coverage、正文容量和 provenance。原始 Provider 响应记录保留，恢复事件只记录安全字符计数并在所有校验通过后发出。
- D 盘隔离候选 clean 编译 379 个 production sources；`OverviewAdaptiveGenerationTests` 66/66 与 `AiProviderResilienceTests` 10/10 通过，Maven exit 0。后者检查实际序列化 JSON body 在 4608/4675/6144 `max_tokens` 下均含 `response_format=json_object`。日志、报告及 hash 清单：`D:/Temp/auralis-writer-tail-fix-20261025/candidate-run2/`。
- 无额外 Provider 调用、业务数据库、缓存、部署或真实 Provider 验收；主 Agent只读 review 待完成。

### 2026-10-25 adaptive writer checkpoint trim/hash mismatch（源码与定向验证完成）

- Runtime trace showed a valid two-section writer response whose first section ended in boundary blank lines. The persisted fragment manifest hashed those raw bytes, while checkpoint restoration returned the validator-trimmed section and rejected its provenance hash. Source canonicalizes new writer sections before persisting hashes and, on restore, verifies raw bytes and structure while returning the exact persisted representation. The matching-source Adaptive suite produced 64/65; its only failure was the initial synthetic old payload exceeding the existing 4,000-character section limit after adding trailing newlines. After adjusting the fixture and allowing only the expected `adaptive_completed_guide` request, the affected method passed 1/1 and verifies old raw payload restore, hash/provenance checks, exact parent/private checkpoint equality, internal code whitespace, tamper rejection, no writer replay, and guide continuation. The earlier 94/94 run used stale candidate sources and is not evidence. No deployment or real Provider acceptance.

- 2026-10-25 香港12:53，按用户明确要求备份后清理当前 Source 失败任务 b2915c48-e400-4f24-8b0d-44517c3ad03f 的恢复缓存：事务删除1个FAILED generation、63 checkpoints、4 request mappings、31 private invocations及1个执行计划/92节点/14调用关联。无在途reservation、关联job或publication；31条用量账本、charged142333、Source与正式结果行哈希保持。证据 D:/Temp/auralis-overview-cache-reset-20261025-125325/。后续重试从头生成；此次清理不修复重启后writer请求/计划指纹不匹配的疑点，不声称Map.of顺序为已证实根因。未改代码/配置/前端、未部署或调用Provider。

更新时间：2026-10-25
文档状态：现行风险登记
权威范围：尚未关闭的工程风险、证据、影响、处理动作和关闭条件
事实来源：当前代码、配置、模块/契约文档与本轮验证结果

### 2026-10-25 direct Overview writer terminal-unknown resume policy

- Direct Source/Subject JSON/SSE may retry one exact writer node on a later user request after its reservation is terminal `FAILED`, dispatched, actual usage is missing, and the ledger retains at least the full estimated-input plus reserved-output charge. The node/call/reservation identity is checked under existing generation and node fences; the original charged row and budget root remain unchanged. A new provider attempt still passes through the normal Guard and gets a new reservation.
- A second unknown-dispatched reservation on that node remains held. A later valid replacement checkpoint lets the generation proceed while retaining the single older unknown reservation. RESERVED/EXPIRED, incomplete or undercharged rows, identity/association mismatches, invalid checkpoint state, and non-writer unknown calls remain held. Durable-job recovery still uses its strict gate.
- D-candidate targeted PostgreSQL validation: Service recovery 30/30, execution journal 8/8, invocation journal 2/2; 40/40 total, Maven exit 0. Includes the 13 VERIFIED plus one failed-writer scenario, same-root replay, preserved old charge, later checkpoint continuation, and negative boundaries. No business database, live Provider, deployment, or GUI acceptance was used. Evidence: `D:/Temp/auralis-resume-unknown-20261025/`.
- Remaining risk: the failed remote call's actual provider-side usage is still unknown; the explicit retry may duplicate remote work or cost. The conservative reserve remains charged and the existing task call/token limits still apply. No automatic retry loop was added.

### 2026-10-25 Overview metadata convergence / Chat retrieval boundary / connection probe

- Overview metadata 1:1 layering with reduced serialized chars could consume up to the configured layers/calls without reducing the section count. Source candidate now checks route fit first, then immediately uses existing bounded topic buckets if a non-fitting layer does not reduce count. The original focused batch had one stale assertion requiring a direct route; after a test-only correction allowing the intended bucket fallback, the affected large fixture passed 1/1. Other focused classes passed 24/24; cumulative targeted evidence is 88/88 across rounds, not one all-green run.
- Chat retrieval prompt injection resistance is improved through explicit instructions and escaped, closed excerpt wrappers. Prompt tests cover delimiter-closing text structurally; they do not establish real-model behavior. Real Provider and user-facing behavior remain unverified.
- Provider setup probe now requests 32 output tokens instead of 1. The Gateway and setup policy remain the existing path; provider/model compliance with this request is not guaranteed.
- Luna read-only review found and scoped one IMPORTANT selection-budget issue: the pre-retrieval selection check counted a retrieval-only system warning even when no citations existed. Source candidate now excludes that conditional instruction from preflight and reserves retrieval warning/context only when the complete selection boundary and current question fit. Tight-budget prompt and streaming regressions passed: `PromptAssemblerTests` 7/7 and `AiStreamingTests` 17/17, Maven exit 0; final `git diff --check` passed. Real-model prompt behavior remains outside automated evidence.

## 当前接续快照（2026-10-25）
- 2026-10-25 香港11:48，按用户再次明确授权，确认重启前generation `6fc0f27d-1d3a-4aba-a408-b035b98b5e07` 已在旧租约11:45:58到期后转FAILED并因未知派发触发恢复保护；备份后锁定事务清除1个FAILED generation、36 checkpoints、3 request mappings及30 private invocations。30条ledger（包括1条lease已过期但尚未结算的RESERVED记录）、charged132004、Source及正式结果哈希均保持；只将state=RESERVED且lease仍有效视为在途，未删除/修改账本。证据 `D:/Temp/auralis-overview-cache-reset-20261025-114809/`。从实际运行镜像提取Service.class并用javap确认元数据归并上限4层/64次；当前91→91的低效归并提前退出逻辑尚未修正，清缓存不解决该性能问题。未改代码/配置/前端，未部署或触发Provider。
- 2026-10-25 后续运行态已确认：用户构建的 backend 镜像 `sha256:cf9bc6a9d34722811c0d2ee324546a80fa92ee4826ef00368a6a216a5502263a` 于香港11:14启动并成功应用V39，容器健康。后续任务在约302秒时发生SocketException/客户端Broken pipe；当前PC通过tauri dev启动，PC本地.env.local未设置时限项会回到300秒（根Compose.env不自动传入Vite）。该失败任务留下1次未知派发，11:30两次重试均在派发前报OVERVIEW_RECOVERY_EXHAUSTED，未增加Provider调用。沿用户已授权缓存清理范围，备份并事务删除对应FAILED generation `dddb2dd5-a9b1-47cf-8d39-a9e3c4fd3ac6`、21 checkpoints、3 request mappings、15 private invocations；15条ledger及charged102216、Source与正式结果哈希保持。证据 `D:/Temp/auralis-overview-cache-reset-20261025-113145/`。未修改前端/.env/后端代码、未部署或触发Provider；客户端实际0配置与完整长流程仍待用户重试验收。
- 2026-10-25 本机运行态确认：backend 容器创建于香港时间11:08:54，但仍使用旧镜像 `sha256:5bfca368887e96fe0d3cc64150e616ed6f8b007761049d3faaa194922c293f01`；环境 task timeout=0，旧镜像校验要求>=1000，因而启动失败并持续重启。尚未构建/部署最新0值支持代码。用户授权清理对应失败 generation `946a1d3c-fa12-4849-af72-5ae988f9afac` 的恢复状态：先备份，再在加锁事务内删除1个FAILED generation、23 checkpoints、4 request mappings和17 private invocations；无关联job/publication或在途reservation。17条用量账本、charged 112047、Source及正式结果行哈希均保持。证据 `D:/Temp/auralis-overview-cache-reset-20261025-1111/`。本次未部署、未修改.env/前端、未调用Provider；后续需用户构建新版backend镜像后重试。
- Overview 0 值总期限的源码和自动验证已关闭 direct、durable WAITER、PC 与后台 job 的固定总期限问题，但尚未部署，不能视为运行配置已生效。已有正数 durable deadline 不会 retroactively 清除；0 配置只影响之后的新 claim。单次 Provider response 仍受默认 120000ms 无读取进展窗口约束。运行态关闭条件：应用 V39 并 recreate backend/frontend，确认两项环境值为 0，再以受控长任务验证 direct SSE 和 durable job 超过旧期限仍能完成；未调用真实 Provider。

- 当前实测失败定位：阶段隔离版已部署，run `2a307651-cafc-488c-8e14-df002e149ccd` 前两批索引合法，第三批五个章节均输出 chapterTitle 而非 title，23:12:58 香港时间返回 MODEL_PROVIDER_ERROR；不是超时、截断或摘要混入。缺 title 不属于现行 repair 白名单，本轮不扩大它。全链路提示词细化已补精确字段/结构示例、上下文和输出隔离、分阶段授权与自检；相关170项最终通过（含受影响两项复跑），主 Agent 审查B0/I0，未部署。首轮提示词过长导致小窗口提前拒绝，已收紧公开短总览重复表述；第二批剩余两项测试的旧长度边界夹具已修正并2/2通过。提示词只能减少错结构风险，不能保证真实模型遵循或证明知识完整性；硬校验继续拒绝不合规输出。证据 `D:/Temp/auralis-overview-prompts-refined-20261024/`。

- MiMo Overview trace 暴露的自适应提示词混合风险已在源码候选中收窄：各自适应 purpose 不再继承公共 ALL/OUTLINE/SUMMARY 行为要求，repair 也按目标阶段结构与 alias 白名单拼装；非自适应旧路径不变。Adaptive 59/59、AiOverview 80/80、Recovery 28/28 通过；首轮两个新增测试夹具/断言问题已修正并仅重跑 Adaptive 类。Recovery 测试运行了 Testcontainers 临时 PostgreSQL fixture，未连接业务库。真实 Provider 仍须在部署后重新调用验收；本修正不承诺模型必然返回正确结构。本机 22:46:29 部署的 thinking 镜像 `sha256:5f65ebbd89c097092109fde92067a6c4975deb808e5f6d904c9d4a92204d487c` 不包含本轮提示词改动。

- Provider thinking 控制的覆盖范围有限：本机新增开关只向 DeepSeek 与精确 `api.xiaomimimo.com` endpoint 发送专有字段。未知 OpenAI-compatible host 和自定义代理没有该字段保证；不应声称任意模型内部推理关闭。本轮候选未部署，运行态及真实 Provider 行为待验收。

- 主 Agent 针对根外 summary 修复发现的首根重复字段检测 IMPORTANT 已关闭。原代码以普通 Mapper 创建 parser，再给 reader 开启 `STRICT_DUPLICATE_DETECTION`，Jackson 3.1.4 不会把此设置施加到外部 parser；局部严格 reader 现同时创建和读取首根 parser。根对象重复 outline 与嵌套 section 重复字段的服务回归确认失败不写 checkpoint；D 盘隔离 Adaptive 58/58、exit 0，未重跑未变更范围。此结论只关闭该代码问题，不代表部署或真实模型验收；命令、哈希与日志见 `D:/Temp/auralis-index-json-strict-parser-fix-20261024/`。

- ADAPTIVE_INDEX 第 7 批真实失败形态为可独立解析且无 summary 的闭合根对象，后接严格 `,"summary":<合法值>}`；`finishReason=stop`，不属于截断/预算，模型 repair 额外插入 `]` 仍失败。源码已加入仅该 purpose 主响应/JSON repair 显式启用的窄结构修复，及不继承公共 ALL/materials 的专用 repair 契约；严格首根/wrapper、重复字段与 EOF 检查后仍执行所有既有校验。主 prompt、请求数据、算法与缓存键不变，不新增结构修复 Provider 调用。独立 reviewer 首轮发现重复四参数签名 BLOCKER，旧增量编译/测试结果不作为当前源码证据；最小重命名后 `clean compile` 强制编译 379 个源码文件、exit 0，三类定向测试最终 165/165、exit 0，follow-up review 为 BLOCKER=0 / IMPORTANT=0 / OPTIONAL=0。较早的首根 trailing-token 边界与双 checkpoint 夹具断言失败也已归因修正。未运行全量/PostgreSQL，未部署、未调用真实 Provider。历史失败 trace 不是合法 checkpoint，部署后通常重新发主请求；真实资料/业务验收与运行态关闭仍待完成。

- Overview 阶段 3–7 实现与 affected-only 验证完成，唯一只读 review 为 B0/I0/O0，发现的三项行为问题均已修复并复核关闭。隔离候选 Adaptive 48/48、Recovery 28/28、Preview PostgreSQL 10/10、Formatter 9/9、末次两个 Adaptive 方法 2/2、package、OpenAPI artifact、PC type-check 通过；不宣称 backend full 通过。Mobile type-check 的剩余既有错误是 `reviewApi.ts` 引用 OpenAPI contract 与 `OpenApiArtifactTests` 均明确缺失的 `EventRequest/EventResponse`，本任务不触碰端侧服务或凭空补造 schema。原 working tree 的 full 失败为 855 tests、6 failures、29 errors、1 skipped；其中运行时 `java.lang.Error: Unresolved compilation problem: Unreachable code` 来自旧 IDE 生成产物，不是 javac 编译错误；后续隔离候选进行了干净源码编译并关闭相关根因。详见 [阶段 3–7 计划](../plans/2026-10-24-overview-routing-writing-completion.md) 与 D 盘证据 `D:/Temp/auralis-overview-stages3-7-20261024/`。

- Overview 阶段二已加入轻量索引覆盖、粒度与跨批术语/层级候选修复，定向 192/192、Maven exit 0，修复复审 B0/I0/O1；O1 动作格式断言缺口已由 test-only 测试补齐（48/48），未部署。未知/重复/空引用/漏绑 alias 只在 recovery 开关下进入每批最多一次的专用纠偏；结构解析延后 alias 判定仅限该内部候选，纠偏结果和主路径仍强制 `requireCoverage`，未放宽授权。跨批上下文限于最近 6 个 section 的标题/summary 元数据且不含 alias，实际容量不足时省略；预算仍逐批在派发前检查。该关闭范围仅限确定性接线与结构测试；提示不能保证真实模型的次生知识完整、粒度合适或术语稳定，纠偏也可能因预算/容量/连续失败而终止。真实 Provider 与资料质量验收仍开放。

- Overview 阶段一已加入结构感知边界、可验证 overlap 裁剪、窄页码过滤和批边界只读上下文候选修复，相关定向测试 61/61、Maven exit 0，唯一只读审查 B0/I0/O0，未部署。关闭范围仅限确定性切块/offset/重复输入与上下文联接；真实模型仍可能误解条件—结论、悬空指代或跨批主题，不能用结构测试宣称语义完整。一般页眉页脚、目录、短段落和参考文献仍保留，避免以降噪为名误删正文；后续需真实资料检查边界质量。

- 第三步本机候选已部署：唯一 review B0/I0/O0，相关 43 项和 replay gate 通过，backend `72f6a41d…` healthy/readiness UP，模式 `calibrated-category`。仍缺真实 writer 输入和资料质量验收，用户实测后按实际 usage 检查支持形态及回退；不把 16.77% 样本预留下降当作实际模型消耗下降。全量 stdout 留存缺口已在 `D:/Temp/auralis-budget-step3-20261024/final-handoff.md` 明确，未称 full 全绿；部署未重建数据库/前端或清缓存/账本。

- 预算路径前一小阶段的唯一 Luna 只读审查为 B0/I0/O0，证据 `D:/Temp/auralis-budget-path-20261024/review.md`；第四步 delta 的首次 sole review 为 B0/I2/O1，详见 `D:/Temp/auralis-budget-step4-20261024/review.md`。两项 IMPORTANT 的纯诊断预算读取现在局部 fail-open；stop/resume 与 writer-progress 故障注入均有通过证据，且业务准入、Provider 派发前预算评估和持久化账本读取仍维持原语义。测试证据及边界见当前状态和 `D:/Temp/auralis-budget-step4-20261024/review-fix-handoff.md`；同一 reviewer 修复复审已完成，BLOCKER=0 / IMPORTANT=0，原 OPTIONAL 1 保留；证据 D:/Temp/auralis-budget-step4-20261024/review-final.md。OPTIONAL charge-basis 标签意见未纳入本轮修复。本轮未部署或触发真实 Provider，正文质量与 estimator 校准仍开放。

- Overview 预算路径已实现正文 writer 4608–6144 动态输出预留与同预算身份传递；4608 仍为无正文 Provider 样本时的暂定工程下限。预算不足沿现有 `AI_TASK_BUDGET_EXCEEDED` 返回并在同 generation/budgetTaskId 下恢复，保留 verified checkpoint 与 charged ledger；不增加 PAUSED、API 或 schema。预算停止、恢复、完成及 writer 进度日志可按 budgetTaskId 关联，charged 表示实际/保守估算混合 ledger 值，reserved 是 task 在途预留，remaining 是配置 token 余额。第三步统一输入 estimator 已接通 Overview fit/preflight 与 Gateway；默认 `legacy-bytes`，分类 estimate 仅对精确 profile 且显式启用生效。离线 trace gate 对6个run/40次请求去重34对，其中25个支持且usage完整的unique pair零低估，INDEX覆盖15/24、ROUTE 2/2，最低coverage 322.86%，总reservation减少16.77%；该 gate 仅适用于当前 trace 形态，run outcomes均为FAILED且writer样本为0。full suite 836/837通过，唯一错误是测试 replay harness 的缺usage聚合，修复后相关定向批次43/43、package通过。sole review B0/I0/O0 已完成，本机候选已部署；Provider 实测待用户进行；不得将此结果描述为通用 tokenizer 校准。报告与命令日志见 `D:/Temp/auralis-budget-step3-20261024/`。此前第四步边界证据见 `D:/Temp/auralis-budget-step4-20261024/`；本机候选已部署，未触发真实 Provider/GUI。

- 真实样本在写入预检被调用次数预算拒绝：需要54次、仅余35次；因此当前仍无正文或成功验收证据。本机 backend 已采用 Overview 次数预算0（不限制）并 healthy/readiness 200，默认配置仍24。定向54/54和 package 通过；full 829项 1F/46E/5S，主要由任务专用 PG 测试环境缺失导致，另有 TLS SlowDrip fixture 错误及既有 STAGE_CALLS/TASK_CALLS 断言不符，不能称完整门禁通过。继续观察任务/窗口 Token 额度、deadline、结构性容量与真实内容质量。关闭条件：真实生成结束，按账本/trace 记录实际总调用与 Token，再回设合理正数预算。

- 前一轮后端更新后 readiness UP / Docker healthy；当时 Overview maxCalls=64、追踪开启。镜像 sha256:387a22242bbd1c05240d08940c17fbdf071cf23f66a7643b1d751914437cb7a5。只重建 backend，未触发模型。

- ADAPTIVE_INDEX summary 规范化已部署，backend readiness HTTP 200；此项只证明服务就绪，不证明真实生成验收。
- 批次别名修正已部署；backend healthy、readiness HTTP 200，focused 37/37 且 runtime review B0/I0。未触发 Provider，真实业务验收仍待完成。
- ADAPTIVE_METADATA summary 规范化已部署；backend healthy、readiness HTTP 200，focused 40/40，sole review B0/I0/O1。O1 只涉及历史记录文字，保留原条目；未触发 Provider，真实业务验收待用户完成。
- Overview 的 MAP/REDUCE 阶段平台调用上限现随配置的总调用上限变化（默认24次），任务 token 上限仍为524288。本机 trace overlay 的64次覆盖值已准备，定向测试记录在 `D:/Temp/auralis-overview-budget-relax-20261023/`；backend 部署及运行态确认待完成。既有失败 run 和用量账本行未改变。
- 两次真实 Overview 尝试的 trace 均完整但结果失败；没有成功生成或内容质量证据。M6 未验收，M5 工程闭环已完成。
- 其余风险按各条目原有证据和关闭条件继续跟踪；历史阶段的“未部署”记录维持其发生时点。

## 阶段历史记录（以下状态为各阶段当时快照，以顶部接续快照为当前事实）

较早阶段记录已移至[历史证据](../archive/stages/2026-10-28-issues-stage-records.md)。本页保留当前接续快照、范围基线、风险或验收边界；历史中的命令结果与“未部署”只代表发生时点。

历史记录中尚未取得关闭证据的验收项不因归档而关闭，仍须按[当前问题登记](IssuesAndReview.md)及各模块的验收条件逐项核对；不从归档恢复旧任务或实现。

## 使用规则

- 只登记未关闭问题；已确认完成的变化进入 Changelog。
- 每项必须可追溯到代码、配置、命令或人工观察。
- 关闭问题必须写出新证据，禁止仅因代码存在而关闭。
- 优先级：P0 为安全/数据不可逆，P1 为主流程或发布阻断，P2 为重要体验或维护风险。

## 首个候选版本范围基线（R0-01）

- **目标端**：Windows x64 PC Tauri、Mobile H5、微信小程序、Tablet 主工作区；PC Web 仅保留内部开发用途，不进入发布目标。
- **主流程**：注册登录、资料上传、学习工作区、同步、复习、统计、AI 对话。
- **范围外**：Tablet 手写笔记云同步、微信之外的其它小程序平台、旧 Server 数据自动迁移、跨实例事件 Broker、AI 自动执行领域写操作。
- **责任角色**：产品/业务验收、后端/基础设施、PC/Tauri、Mobile/Tablet、QA/发布。
- **证据口径**：范围冻结不等于功能验收；代码、自动测试、真实依赖联调和 GUI/真机证据继续分别登记，既有 P1/P2 风险不因本基线关闭。

主流程的逐项验收结果以[产品需求](../project/ProductRequirements.md)为准；本节只登记范围和证据边界，不替代风险项的关闭条件。

## P1 风险

### P1-PC-Document-Real-Processing-Validation

本轮已补齐代码和自动回归：OCR sidecar 使用应用 cache 专属 PyInstaller 临时目录并保留 bounded stderr 诊断；PPTX OOXML 49 页 fixture 直接读取 slide relationships；Tauri invoke 保留 Rust 字符串错误；DOCX parsed-document PUT 的网络失败带稳定分类，服务器校验/索引阶段可恢复到 `PAUSED_NETWORK`，已有 payload receipt 可直接续传。仍未关闭的风险是实际 Tauri GUI 中的 OCR/PPTX/DOCX 全链路和真实 MinIO/Server 联调：Docker Desktop 当前报告 unable to start，不能以本地测试替代外部依赖证据。关闭条件为在 fresh Tauri 进程中完成三类样本处理、断网后续传，并取得 Server/MinIO healthy 与 complete/indexing 证据。

### P1-PC-FilePreview-GUI-Validation

PC 真实 Source 文件预览已收敛为 `FilePreview`：旧 `PdfViewer`、Home PDF 伴读入口和 Asset 的 `filePath`/不可达 Markdown 预览分支已删除，资产库以 Source `id`、`assetId`、`name`、`fileType` 驱动同一组件。`r4-file-preview` 24/24 通过；自动测试仍无法证明 Tauri/浏览器在大文件、多格式与连续快速切换时的资源加载、排版与内存表现，需人工 GUI 验收。

### P1-Subject-Color-Contract-Cutover

2026-09-03 Subject 专属颜色完成破坏性契约切换：服务端 API/Entity、V19 schema 与 PC/Mobile 前端已移除 `color`，现有该列值不可恢复；本地 Docker PostgreSQL 已升级到 V19，Subject 行和 KnowledgeBlock/Task 的 `color_override` 均已核验保留。KnowledgeBlock/Task 的 `colorOverride` 不在本次范围内。2026-09-04 PC 已清除 Dashboard、Timeline 与 Home 的 `Subject.color` 页面残留，统一使用 `#7D9372`；`r4-store-mapping` 10/10 与 type-check 通过。剩余风险是三端真实 GUI/业务联调尚未完成人工验收。

### P1-Device-Identifier-Contract-Cutover

2026-08-29 已完成一次破坏性设备标识契约切换：Auth 注册/登录使用 `clientDeviceKey`，AuthResult/Session/Sync 使用 `serverDeviceId`，Realtime ticket 不再接受设备字段而从 JWT 解析；旧 `deviceId` 字段和兼容测试均不保留。PC/Mobile 自动协议测试与 type-check 已通过，但真实 Server、双设备、Realtime/WebSocket、Mobile/Tablet 真机及既有本地会话重登仍需验收；关闭条件是新 OpenAPI 产物、三端请求和真实设备流程全部只使用新字段并取得脱敏联调证据。

| ID | 问题 | 证据 | 影响 | 处理动作 | 关闭条件 | 领域 |
| --- | --- | --- | --- | --- | --- | --- |
| P1-Backend-Contract-Cutover | 新后端保留 `/api` 前缀但不兼容旧 DTO；PC、Mobile 与 Tablet 目标代码路径已迁移，三端真实联调仍未完成 | 2026-08-20 PC/Mobile/Tablet 静态门禁、协议测试、类型检查和 Web/H5/微信构建通过；Tablet Dashboard/Review 已接 Stats/Review API。2026-09-01 服务端真实 HTTP WebSocket upgrade 已验证 ticket 握手，但浏览器和目标端消费尚未验收 | 自动检查无法证明真实 Server、MinIO、Provider、浏览器/目标端 WebSocket 和多设备行为 | 按 R5 逐端完成真实服务与设备联调 | PC、Mobile、Tablet 目标流程全部使用新生成契约且联调证据齐全 | Frontend/Backend |
| P1-Mobile-Platform-Validation | Mobile 新契约与双构建已完成，但微信平台配置、真实上传/SSE/WebSocket、双设备 reset 和真机未验收 | `check:r4-mobile` 62 文件、协议 20/20、type-check、H5/微信 build 通过；无 AppID/合法域名/开发者工具/真机证据 | 命令行产物可能在域名、证书、对象存储 PUT、前后台或弱网条件下失败 | 配置请求/WSS/upload/download 域名，在 H5、微信工具和真机覆盖登录、上传、同步、复习、统计和 AI | 真实 Server/MinIO/Provider 与目标设备流程通过并保留脱敏证据 | Mobile/WeChat |
| P1-PC-Local-Repository-Cutover | PC 普通同步资源已收口为本地 v6 projection/outbox，但 `localDb.ts` 与 `useBlockStore.ts` 仍保留兼容 facade，且真实 Tauri 迁移/GUI 尚未验收 | 2026-09-04：Subject/Source/KnowledgeBlock/Task 均先 `commitMutation()` 原子保存本地资源+outbox，之后才更新 Pinia；后台 cursor cycle 合并启动、实时、读写请求，远端只结算对应 mutation 或更新无未解决写入的资源。cursor page 仅写每资源最后 change，墓碑不会删除 pending 本地编辑。`r4-local-repository`、`r4-sync`、`r4-register-file` 合计 28/28 通过；`npm run type-check` 仅报 Timeline 的 3 个 `Subject.color` 与未使用 `Sparkles`，完整 PC 门禁未通过 | 首次登录旧数据迁移、Tauri SQLite 升级、reset/离线恢复、连续离线编辑、双设备冲突及跨账号切换仍缺真实桌面证据；当前类型检查和完整 PC 回归不能作为整体绿灯 | 保持 facade 只读兼容范围，补 Tauri/Web GUI、真实服务、弱网连续编辑、三次连续编辑旧回包保护与双设备冲突验收；修复 Timeline 类型残留后复跑完整 PC 门禁 | 正式 PC 业务路径不再读写旧全局 key；Tauri/Web/GUI 证据齐全；真实后端联调确认 user/device 隔离、合并 mutation 回放、cursor 保护和冲突状态可见 | PC/Data |
| P1-PC-AI-Recovery-Validation | 离线 Chat 已持久化稳定会话/消息请求 ID，并在网络恢复后自动顺序重发；但尚未以浏览器连接真实 Server/Provider 验收 | `useChatStore.ts`、`authenticatedSse.ts`、`r4-reliability.test.mjs`；2026-08-20 `test:r4-pc` 58/58、type-check/build 通过 | 浏览器断线、token 刷新与真实 SSE 代理交叠时仍可能暴露时序或 UI 回归 | 在真实 API 上覆盖离线新建会话、断流重试、401 刷新、恢复顺序和重复点击 | 浏览器/Tauri 中真实 Server/SSE 的恢复、无重复消息和失败态证据齐全 | PC/AI |
| P1-PC-AI-Reading-Flow | PC Tauri AI 辅助阅读 G1–G4、G5/G6、C1–C5、S1–S6、A1–A4、K1/K2、U1–U3 的代码与自动门禁已完成；真实联调和 GUI 仍未完成 | `DocumentProcessingRuntime`、阅读会话/PromptAssembler/ScopeEscalationPolicy、状态点/Profile 解析中心、选中文本编辑器；启动前同步修复、MinIO IPv4 public endpoint 和 debug log stdout 修复已补齐；`test:r4-pc` 需以本轮完整命令结果为准；`docs/test` 含 DOC/DOCX/PPTX、真实 OLE PPT、text-layer/扫描型 PDF | 临时 all-users MSI 安装因宿主 Error 1925 未完成，安装后 sidecar/OCR、升级卸载和 GUI 仍缺真实证据；实际 File Viewer/Tauri extract/fallback/failure、扫描 PDF 真实渲染/OCR、Tauri SQLite/cache/upload/restart、跨设备接手、MinIO/Server 业务联调、阅读会话/current Source→Subject 升级/选中文本仍待验收 | 在具备安装权限的 Windows x64 宿主补齐真实 Server/MinIO/Provider、文件样本、断网重启/跨设备和阅读 GUI 验收；自动门禁只作为代码证据，不替代人工验收 | Windows x64 MSI 安装后离线 OCR、四类 Office 固定样本、revision 并发、加密缓存上传、当前 Source→Subject 检索升级、选中文本知识块和 GUI/业务证据全部通过 | PC/AI/Backend |
| P1-Backend-Docker-Gate | [当前复核受限] Docker、PostgreSQL/pgvector、MinIO 和 Compose/Testcontainers 基础门禁 | 历史 2026-08-20 Docker Desktop Linux engine 下默认 `clean test` 137/0/0 证据仍有效；2026-09-11 Task 4 全量 239 项出现 3 个 Docker/Testcontainers errors，当前 Engine named pipe 不可用；既有 Compose config/build/up/health 证据仍有效 | 本机当前不能重现真实 PostgreSQL/pgvector/MinIO 全量门禁；异常专项和真实 Provider 仍由独立风险跟踪 | 恢复 Docker 后复跑全量及三项容器集成测试；继续完成 R2-03/R2-04 异常专项和 R2-05 真实 Provider smoke | Compose 服务健康、默认容器测试零错误、PostgreSQL/MinIO 主链路集成证据齐全 | Backend/Infra |
| P1-Auth-Guard | PC 登录守卫逻辑已恢复，公共登录页已与认证壳隔离，但浏览器/Tauri 的登录、刷新、退出和过期仍未人工验收 | `Auralis-PC/src/router/index.ts`、`src/auth/authGuard.ts`、`src/App.vue`、`src/components/layout/AppSidebar.vue`；`r4-pc-protocol.test.mjs` 与 runtime 回归已覆盖公开/受保护/登录页决策及白屏回归 | 会话持久化、过期和退出后的实际导航行为仍可能与纯函数决策不一致 | 在浏览器和 Tauri GUI 走查登录、刷新、退出、过期和返回地址，并确认无 token/refresh token 时不出现空白页 | 自动测试与目标 GUI 的登录/刷新/退出/过期证据齐全 | PC/Auth |
| P1-Test-Coverage | 新后端已覆盖主要模块自动测试；多设备和浏览器客户端仍缺业务回归保护，当前宿主无法完成全量 Testcontainers 门禁 | 2026-09-12 Task 3 fresh 聚焦 57/57、0 failures/errors/skipped；全量 239 项、0 failures、3 Docker/Testcontainers errors，错误仅为 Docker 不可用 | 主链路通过不等于 PostgreSQL 全量并发行为、双设备断网恢复和真实 WebSocket 可用；当前环境无法完成容器证据 | 恢复 Docker 后复跑全量及三项容器集成测试；继续增加 PostgreSQL/MinIO 异常与并发、双设备和浏览器 WebSocket 回归 | CI 或本地门禁执行到真实基础设施与目标客户端断言并保留报告 | Backend |
| P1-Asset-Verification | Asset 上传完成的服务端对象实体验证已构建，异常分支仍未闭环 | R2 已补充 sha256 metadata header、失败对象清理、MinIO integration test 和 `scripts/audit-minio-assets.ps1`；2026-08-23 新增离线 GET signer 回归 3/3，Docker 临时账号真实 upload PUT 200、READY、download GET 200/26 bytes | 对象不存在、大小/hash 不符、超时和重复完成仍可能在部署差异下产生未覆盖行为；真实生产凭据与 bucket policy 仍未验收 | 补充真实 MinIO 异常路径、完成回调和生产凭据验证 | 真实 MinIO 主链路与异常路径、凭据、bucket policy 和部署配置测试通过 | Asset/Infrastructure |
| P1-PC-Task-Scheduling-Atomicity | PC Timeline 排期代码侧已改为本地原子投影加单条 Sync 命令，离线插入/顺延/换位可以排队 | 2026-10-12：PC 定向套件 173/173、type-check 通过；Server Sync/Schema/Task controller clean 定向测试 34/34；最终只读复审 BLOCKER=0、IMPORTANT=0。2026-10-27：本地原子提交后立即释放 Store 写队列并请求后台同步；自身卡片 drop 清理拖拽状态；两个定向 PC 套件 92/92、type-check 通过 | Tauri/Web 实际断网重启、真实服务拒绝恢复、PostgreSQL 并发和跨设备行为仍未验收；命令行测试不能替代真实客户端行为 | 在 Tauri 上覆盖插入顺延、换位、断网重启、网络恢复及版本冲突 | PC/Backend 代码实现、契约与相关定向验证通过，并有真实桌面端断网恢复与服务端排期证据 | PC/Backend
| P1-OpenAPI-PC-Schema-Stale | **已关闭（2026-09-12）**：OpenAPI artifact 与 Server runtime 及 PC `schema.ts` 一致 | Task 3 `check-openapi.ps1` 退出 0；PC/Mobile generated schema SHA-256 均为 `2152390C192BCBE34B7618D11B71F28DF72AC9262C39625594B5EF3CC7D219C7`，包含 `subjectOverview`/`sourceOverview` 可选 `X-Overview-Request-Id` header | 无；真实 Provider/客户端联调仍由独立风险跟踪 | 保持生成器驱动并在 API 变化后重跑 artifact/schema gate | `check-openapi.ps1` 持续退出 0 | Contract/PC |

### 2026-09-07 Task 认知负荷切换复核

- Task 字段删除的 Server 定向测试 8/8、PC type-check 与 R4 211/211、Mobile type-check/静态检查/协议测试 21/21 通过；V20 clean/upgrade 覆盖数据库列、约束、Task 同步 JSON 以及非 Task 载荷保留。
- Server 全量测试仍受 Docker/Testcontainers 三项错误限制，不视为全量通过。历史 `P1-OpenAPI-Mobile-Schema-Lock` 的文件占用/漂移阻断已由 Task 3 生成器运行关闭；当前 `check-openapi.ps1` 退出 0，PC/Mobile schema 与 artifact 一致。真实 API/设备联调仍开放。
- 未执行真实 PostgreSQL 升级和 PC/Mobile/Tablet GUI/真机验收；在这些证据补齐前，只能记为代码与自动验证完成。

### 2026-09-04 PC 排期固定补充

- 已完成且已排期的 Task 现已在 Store、Timeline 与 Dashboard 固定，防止拖放替换、移动或取消排期；该行为的两项 Node 回归通过。历史本地 `completed` 展示态记录已按弃用策略移除兼容：加载时忽略、在线刷新后以现行领域 DTO 重建；映射与 Store 定向回归通过。Subject `color` 类型错误已通过全局主题色清理关闭；最新完整 PC 回归为 173/181，剩余 8 项失败继续由本 P1 风险跟踪，真实 Tauri 拖放仍待验收。

### 2026-09-05 PC 孤儿 Source 清理边界补充

- `SourceJobScheduler` 只在 `sourceApi.get(sourceId)` 边界捕获结构化 `ApiProblemError` 的 404 或 `RESOURCE_NOT_FOUND`；复用 `discard(sourceId)` 清理 owner-scoped 文档任务/cache，并返回稳定的 `SKIPPED/SOURCE_NOT_FOUND`。503/`INTERNAL_ERROR` 回归仍拒绝且保留任务；parser、hash、upload 后续异常不误判为 Source 不存在。
- `r4-source-processing-schedule.test.mjs` focused 14/14、相邻文档处理套件 35/35、`check:r4-pc`（87 个生产文件）和 `git diff --check` 通过；`npm run type-check` 退出 1，7 项既有错误位于 `useTaskStore.ts`（3 项）和 `Timeline/index.vue`（4 项），未归因于 scheduler。开发环境在确认并停止仓库 Tauri `app.exe` 及其进程树后，已精确删除 `%APPDATA%\com.auralis.app` 下的数据库、WAL 与 SHM 文件，目录内无其它删除目标。重启后完整表集已重建；远端同步恢复 48 条资源投影和 3 个文档任务，任务当前均因缺少 master key 进入 `FAILED_LOCAL`。本地代际残留已排除，但密钥初始化/恢复与重新上传仍需 Tauri GUI/Server 联调；P2-PC-Document-Processing-Validation 继续开放。

### 2026-09-05 PC 上传、统计与处理状态恢复补充

- `keyring = { version = "3", features = ["windows-native"] }` 已启用，服务/用户标识仍为 `auralis/master_key`；Cargo feature 静态回归、`cargo check` 与 `cargo tree --manifest-path src-tauri/Cargo.toml -e features -i keyring` 均确认 Windows-native feature，未增加明文或环境变量回退。Windows-only Rust 测试已用唯一 service/user 创建新 Entry，写入后用另一个 Entry 读取并在 Drop 中精确清理；本机运行时写入因 Credential Manager `NoStorageAccess(Error(1312))` 失败，因此该测试尚未取得真实持久化证据。
- StatsQueryRepository 在 JDBC repository 边界把 `Instant` 转为 `Timestamp`，测试覆盖六个查询的所有时间参数并断言 UUID/参数顺序保留；`StatsQueryRepositoryTests` 1/1、`StatsServiceTests` 2/2 通过；SQL、API 和 database schema 未变化。
- PC upload accept list 已收敛到 PDF、DOC、DOCX、PPT、PPTX；图片/文本仍由 File Viewer 预览但 upload intent 前被拒绝，`canPreviewFile()` 的真实预览判定不再依赖 upload allowlist，错误消息列出可上传格式，五种解析器支持格式均由 `validateUploadFile` 直接覆盖。`AWAITING_CLIENT` 现在显示等待桌面端开始处理，`VALIDATING/PARSING/INDEXING` 显示明确服务端阶段，映射已抽成纯工具函数并由实际函数断言覆盖；`DocumentProcessingDot` 不再保留 Source 内联映射，未知/undefined phase 使用中性同步提示，`READY` 返回“处理完成”；file-preview 27/27、processing UI 1/1、runtime static 9/9 通过。
- 未关闭边界：Windows Credential Manager 跨 Entry 持久化、真实 PostgreSQL 统计请求、MinIO/Server complete/indexing、真实文件解析和 Tauri GUI 上传/状态走查仍需人工联调；这些自动测试证据不关闭 `P2-PC-Document-Processing-Validation` 或 `P2-PC-File-Viewer-Validation`。最终 `test:r4-pc` 为 202 项中 196 通过、6 项失败，失败仍为既有 Timeline 拖放/本地投影/可见负荷和 `Subject.color` 静态契约；`type-check` 仍有既有 7 项错误，不能写成整体通过。

### 2026-09-06 PC PDF worker 与 Source 调度竞态修复

- 根因已确认并修复：`PdfTextAdapter` 原先动态加载 `pdfjs-dist/legacy/build/pdf.mjs` 却未设置 `GlobalWorkerOptions.workerSrc`；现由 Vite `?url` 绑定同版本 `pdf.worker.min.mjs`，不依赖 CDN。`useSourceStore` 原先在本地 CREATE 尚未获得服务端 `ingestionRevision` 时就自动调度，导致 `sourceApi.get()` 404 后命中永久 `SOURCE_NOT_FOUND` 清理；现自动入口要求 `AWAITING_CLIENT`、非空 Asset ID 和非空 revision，待 sync push/pull 投影包含 revision 后才调度。
- TDD focused 测试覆盖 PDF runtime、Source 注册和相邻文档处理链共 70/70；`npm.cmd exec vite build` 通过并产出 `pdf.worker.min-*.mjs`。`npm.cmd run type-check` 仍为工作树既有 7 项错误（`useTaskStore.ts` 3 项、`Timeline/index.vue` 4 项），未归因于本修复。认证与 MinIO 未改动；真实扫描 PDF OCR、Office 处理、Server complete/indexing 和 Tauri GUI 仍保持开放验收边界。

## P2 风险

| ID | 问题 | 证据 | 影响 | 处理动作 | 关闭条件 | 领域 |
| --- | --- | --- | --- | --- | --- | --- |
| P2-Mobile-BaseUrl | Mobile Auth/WS 使用 localhost/127.0.0.1 | Mobile Store/API | 真机无法访问开发服务 | 使用平台环境配置 | 模拟器、真机、生产地址均验证 | Mobile |
| P2-Mobile-Contract | Mobile 多数页面依赖端侧数据，未接完整 Server API | 页面 API 映射 | 多端功能完成度易被误判 | 标注 local-only，逐步定义契约 | 主流程页面来源与同步一致 | Mobile |
| P2-Tablet-Validation | Tablet 多栏和手写缺真机验证 | 页面、feature flag、脚本 | 触控和长时间使用风险 | 设备走查与专项记录 | 指定设备清单全通过 | Tablet |
| P2-PC-Subject-Icon-Validation | PC 新建学科线条图标与已有 Emoji 的实际显示未做 GUI 验收 | `src/utils/subjectIcon.ts`、`AppSidebar.vue`；2026-07-14 `check:subject-icons` 与生产构建通过 | 线条图标的尺寸、对齐、统一 Sage Green 底色或选择态可能异常，已有 Emoji 可能在个别入口未保持原样 | 在浏览器或 Tauri 中检查既有学科及新建学科，覆盖全局功能侧栏 | 新建线条图标与统一底色、既有 Emoji、空值/未知语义键三类均显示正确且可操作 | PC |
| P2-PC-Workspace-Prototype-Validation | 学科大纲编排仍为静态交互原型；文件预览/删除、知识块总结与 PC AI 伴读尚未完成 GUI 验收 | `SubjectWorkspace/index.vue`、`FilePreview.vue`、`useSourceStore.ts`；2026-09-04 文件删除在 Source tombstone/DELETE outbox 成功后立即移除本地文件投影，parser/job/cache 清理改为后台 best-effort，`r4-file-preview` 20/20 通过；File Viewer 直接预览新增旧签名下载响应抑制 | 刷新后大纲编排丢失；浏览器中的删除确认、删除 OCR 中文件后的列表/计数/Profile 同步、File Viewer 文档兼容性、三栏尺寸、AI 星环/三点动效、窄栏换行和深色主题仍可能有问题 | 在浏览器/Tauri 验收文件选择、删除静态及 OCR 中资料后列表/计数/当前文件/Profile 同步、知识块总结、章节排序、小节边界与 AI 右栏 | 指定交互范围获确认或持久化完成，且 GUI 验收记录通过 | PC |
| P2-PC-Frontend-Refactor-Validation | PC 近期页面重构（Pomodoro、Timeline、Asset、Dashboard 与全局导航）尚未完成跨页面 GUI 验收 | 最近 PC 提交与 `Auralis-PC/src/views/`、`src/components/`；2026-08-12 构建与两个静态契约检查通过，但未做 GUI | 宽屏布局、任务计时、弹窗、删除操作和导航图标可能存在只在浏览器/Tauri 中暴露的回归 | 按正式路由逐页走查主要任务和失败/空状态 | PC Web 构建通过，且 Dashboard、Subject、Asset、Timeline、Pomodoro、Profile 主流程 GUI 记录通过 | PC |
| P2-PC-Modal-Consistency | PC 自定义弹窗仍有多套视觉实现：`modal-container`、Dashboard `block-modal`/详情弹窗和 `ConfirmDialog` 的遮罩、容器、标题栏、圆角、阴影与操作区不一致 | `Auralis-PC/src/views/Home/index.vue`、`Asset/index.vue`、`SubjectWorkspace/index.vue`、`Dashboard/index.vue`、`src/components/ConfirmDialog.vue`；2026-09-27 `ModalShell` 基础组件、`modalManager.ts` 全局管理器与 `modal.css` 令牌已建立，六大业务弹窗已提取，`ConfirmDialog` 与 `SubjectCreateModal` 已接入；弹窗布局全面升级为 24px 大圆角无缝画布、透气规格（sm: 480px, md: 580px, lg: 760px, xl: 920px）、舒展内边距及 9999px 全圆角 Zen 胶囊按钮；弹窗配色与全站色彩体系深度对齐（宣纸暖米白底板、发丝边框、暖炭遮罩、燕麦米白输入控件及 `Primary Gradient` 禅绿渐变按钮）；滚动锁计数、顶层 Escape 拦截、入场/焦点闭环以及 `aria-label`/`aria-labelledby` 绑定已修复；`test:r4-pc` 433/433、type-check、`check:subject-icons`、`check:subject-workspace` 与生产构建均通过，保留浏览器/Tauri 人工 GUI 走查 | 跨页面打开弹窗时视觉语言不连续，深色模式、窄屏和关闭按钮行为的 GUI 观感可能不一致 | 采用“全局弹窗令牌 + 兼容现有类名”方案，统一遮罩、容器、标题/内容/操作区与 Sage 主按钮，同时保留业务逻辑 | Dashboard、Subject、Asset、Workspace、ConfirmDialog 等弹窗在浏览器/Tauri 的浅色、深色、窄屏走查通过，且无关闭/焦点回归 | PC |
| P2-PC-Bundle-Size | PC 生产构建存在大 chunk 警告 | 2026-08-12 `npm.cmd run build`：`Asset-B7Y2PPYt.js` 约 595 kB，Vite 提示部分 chunk 超过 500 kB | 首屏加载和缓存粒度可能受影响 | 评估 Asset、Element Plus 等依赖的拆包与懒加载策略 | 关键入口 chunk 达到团队阈值，或形成明确的警告接受记录 | PC/Performance |
| P2-PC-File-Viewer-Validation | PC 学科页已接入自托管 File Viewer；真实 DOC/DOCX 排版、跨浏览器资源加载、分页能力和窄栏 GUI 尚未验收 | `src/components/FilePreview.vue`、`src/components/preview/FileViewerRenderer.vue`、`src/views/SubjectWorkspace/index.vue`、`@file-viewer/vite-plugin`；2026-09-01 OCR 完成会释放 PDF.js document，预览采用最新选择请求门禁，阻止旧下载响应回写 renderer；固定版本约束仍为 `pdfjs-dist@5.4.624` | Office 文档可能出现字体、布局、Worker/资源路径或性能差异；不同 renderer 的视图状态可能不提供真实页数；快速切换/删除扫描 PDF 时仍需真实 Tauri 证明不再反复加载；File Viewer preset-all 还增加多个大 chunk | 使用真实 DOC/DOCX/PPT/PDF/图片/文本样本在浏览器与 Tauri 走查；特别覆盖扫描 PDF OCR 与预览并行、快速切换和删除；确认文件名顶栏两组圆角控制、底部页码导航、资源加载和窄栏布局 | 指定样本加载、分页/缩放/旋转、下载、失败重试、快速切换、删除及窄栏布局均有 GUI 证据，或 PDF fallback 已通过 | PC/Preview |
| P2-PC-Tauri-MSI-Bundle | MSI 已生成并通过 bundle/WiX/baseline 门禁，但本机 all-users 安装权限不足 | 2026-08-24：MSI 220,286,976 bytes；verifier 通过 MSI、target-triple sidecar、模型哈希、manifest、notices、SBOM 与 generated WiX references；五组 fixture 离线 baseline 通过；临时安装返回 Error 1925/1603 | 安装、升级、卸载、安装后 sidecar/OCR 和数据保留仍无法在当前宿主验收 | 在有安装权限的 Windows x64 环境完成 install/upgrade/uninstall、断网 OCR 和 GUI evidence | MSI/安装包安装成功且 Windows GUI 完成登录、主流程、离线 OCR 和数据保留验收 | PC/Release |
| P2-PC-Document-Processing-Validation | C5 FILE Source 调度、Tauri runtime 组装、跨设备恢复和上传已具备代码/自动测试，但真实 Tauri 私有临时目录、MinIO/Server 联调与任务中心 GUI 尚未验收 | `SourceJobScheduler`、`DocumentProcessingRuntime`、`DocumentJobRunner`、`useSourceStore`、`useAssetStore`、全局 `BackgroundParserHost`；2026-09-01 已补充“单个恢复失败不阻塞后续 AWAITING_CLIENT Source”、Profile 本机重试、手动重试前的 Source 同步确认、删除 Source 时取消运行 parser、删除同用户/设备 job、cache 和 parser input；Rust `document_package_begin` 还会在新建 cache 时确保 keyring 中存在原生 master key，且只把 `NoEntry` 视作可初始化的缺失状态。`/api/sync/push` 的 JSON payload 已迁移到 Jackson 3 `tools.jackson`，并有真实 HTTP object payload 与全源码 import 守卫回归；OpenAPI artifact 已重新导出；定向 52/52、PC 回归 165/165、type-check 通过 | 实际下载 URL 生命周期、删除同时上传时的远端收尾、原文件临时目录清理、Asset SHA 回填/异常、应用重启和跨设备接手仍可能暴露运行时差异；系统凭据库被清除时，有加密 cache 的历史任务必须走密钥恢复，不能靠生成新密钥恢复；credential manager 拒绝访问必须报告实际 keyring 错误；Office/PDF renderer 在 Tauri 的资源和性能尚未证明 | 在 Windows Tauri +真实 Server/MinIO 验证 FILE create、OCR 中删除、移动端创建后 PC 接手、断网暂停/恢复、revision 替换和 READY 跳过 OCR；同时覆盖首次启动自动建 key、keyring 拒绝访问，以及清除/恢复系统凭据后的历史任务提示，并检查个人中心状态 | 私有临时文件无残留、删除后本地任务/cache/UI 都不复现、签名 URL 不落库、重启续传不重复 OCR、服务端 complete/indexing 和个人中心状态均有 GUI/日志证据；首次新建 package 与密钥恢复提示均经 Tauri GUI 验证 | PC/Tauri/Integration |
| P2-PC-Auth-Validation-UX | 注册页仍只做非空校验；PC 已统一读取后端 RFC Problem Details 的 `fieldErrors[]`，不再依赖旧 `errors` 对象 | 2026-08-20 Docker 后端联调确认注册请求返回 HTTP 400；2026-08-29 `r4-login-validation` 4/4、PC 全量回归 154/154、type-check/build 通过，登录页已将字段错误映射到 username/displayName/password，并在通用提示中优先展示具体校验信息 | 注册时密码长度等约束仍要等待服务端响应，未影响后端鉴权边界或数据一致性 | 在注册前同步 username/password/displayName 约束 | 注册和登录的客户端预校验与服务器 `fieldErrors[]` 均能在对应表单字段展示；保留服务端校验为最终边界 | PC/Auth |
| P2-Migration-Strategy | Flyway V1 已针对干净 H2 schema 验证，但 PostgreSQL 升级/回滚门禁尚未执行 | `V1__identity_schema.sql`、IdentitySchemaTests、2026-08-12 clean test；未运行 PostgreSQL/Testcontainers | 生产升级/回滚和 PostgreSQL 方言行为仍不可预测 | 在容器集成阶段执行 PostgreSQL clean/migrate/validate、备份恢复和迁移演练 | 干净 PostgreSQL 升级、回滚和备份恢复均有证据 | Data/Infra |
| P2-Infra-Readiness | 无 CI、监控、告警、正式备份演练 | 仓库现状 | 发布与恢复门禁不足 | 建流水线、指标、备份恢复 | 发布演练和告警测试 | Infra |
| P2-Mobile-Build-Warning | Mobile H5/微信构建有动态/静态 import 与 Sass legacy API 警告 | 2026-08-12 `build:h5` 与 `build:mp-weixin` 输出 | 未来打包与 Sass 升级可能出现行为或兼容性问题 | 明确 `useSyncStore` 的加载策略，升级/替换 Sass legacy API | 构建无对应警告，或有记录的接受决定 | Mobile |

| P1-Phase5-External-Infra | 阶段 5 的 PostgreSQL/pgvector、MinIO 主链路、默认容器门禁和 SiliconFlow embedding 单次 smoke 已通过；真实聊天服务与异常路径仍未验收 | 2026-08-21 `mvn -B -ntp test` 148/0/0：PostgreSQL 17.11 + pgvector V1→V14 clean/upgrade 与 MinIO 主链路均实际运行；真实 Java Provider 链路调用 SiliconFlow `BAAI/bge-m3` 返回 1 条 embedding。2026-10-12 新聊天检索默认开启：后端 clean 定向测试 47/47，`scripts/check-openapi.ps1` 退出码 0，包含 OpenAPI artifact 12/12 与 PC/Mobile SDK 标准生成对比 | 真实聊天响应、限流/断流网络、对象异常和完整部署拓扑仍可能与基线不同；客户端代码与定向验证已完成，真实 Provider / GUI 验收未运行 | 增加 chat smoke、MinIO 异常路径和生产 Compose 验证；针对 [RAG 默认开启计划](../plans/2026-10-12-rag-always-on.md) 完成跨端范围行为验证及真实 Provider 验收 | migration、JPA validate、embedding 检索、对象链路、异常路径和真实 Provider 在真实依赖上通过；新聊天检索路径、错误反馈和客户端范围有对应自动及真实环境证据 |
| P1-Phase5-Ingestion-Fencing | 2026-09-27 已加入同事务 Source/job 入队、恢复处理中 Source 补 job、revision/job/generation/attempt/锁后 lease 栅栏及同事务完成 | Server clean 聚焦 114/114、PostgreSQL pgvector 2/2，覆盖入队失败回滚、恢复与迟到结果拒绝；未做真实进程崩溃/长耗时 Provider | 代码级提交/入队及恢复缺口已关闭；真实运行稳定性仍待验收 | 受控环境演练进程重启、重复执行和真实 Provider 超时 | 真实部署验证已提交或恢复的处理中 Source 必有匹配 job，stale worker 无法提交旧结果 |
| P1-Phase5-Provider-Security | BYOK/URL 已具备 HTTPS allowlist、IPv4/IPv6 SSRF、DNS 公网地址过滤与固定连接、重定向关闭/复核、超时和响应体上限；除 Overview 失败事件外，既有 AI 失败日志保留脱敏后的异常类名/message/root cause，Overview 现改为 allowlisted errorCode、关联字段、阶段和 exception/cause 类型；真实网络、限流、审计和密钥轮换仍未验收 | `ProviderEndpointPolicy`、`ProviderHttpClient`、`PinnedSslSocketFactory`、`UrlSourceFetcher`、`AiStreamingService`；2026-08-23 原始异常日志/Authorization 脱敏回归与 `AiStreamingTests` 12/12 通过，真实 SiliconFlow embedding smoke 通过；Task 2 Overview 日志/requestId 安全回归 19/19 | 真实 DNS/证书/代理环境仍可能暴露网络策略或 provider 异常映射问题；截断日志不替代完整上游诊断 | 补受控 DNS rebinding、redirect、超时、429/5xx、日志采集/轮转、审计和密钥轮换专项 | 安全专项测试和生产 secret/网络策略、日志采集记录通过 |
| P1-Phase5-Suggestion-Quality | Suggestions 是确定性基线，未接入真实 LLM、RAG citation 或质量评估 | `SuggestionService` owner check 与 controller 测试通过，返回 citations 当前为空 | 产品可能误认为已具备 AI 总结/提问质量 | 接入受控模型与 RetrievalService，增加 schema、引用正确性、提示注入和人工质量验收 | 质量指标、引用回链和人工样例验收记录完成 |
| P2-Phase5-Stream-Granularity | SSE 回调链和 OpenAI-compatible 上游增量解析已构建，但真实 Provider 网络/证书/背压和前端消费仍未验收 | `AiStreamingService`、`AiController`、`OpenAiCompatibleProvider`、`AiProviderSecurityTests`；2026-08-17 受控 SSE/超时/断流/错误测试通过 | 真实网络断线、代理缓冲、Provider 特有 SSE 变体或客户端背压仍可能影响 UI 流式体验 | 在 R2 受控真实 Provider 环境验证首包、增量、取消、断流、429/5xx、超时和前端消费 | 真实 Provider 的增量、断线、取消、超时、错误事件和前端消费契约通过 |

## 审查结论

- 2026-09-27：PC 全局弹窗重构与配色规范统一已落地：基础壳组件 `ModalShell.vue` 布局重写为统一的吸顶常驻标题栏、自适应纵向独立滚动卡片内容区和吸底停靠操作栏，无缝一体化设计彻底取消硬性 1px 分割线；统一接入全局管理器 `modalManager.ts`（支持引用计数多层滚动穿透锁、LIFO 顶层 Escape 捕获、自动入场聚焦与焦点闭环陷阱）与 `modal.css` 令牌系统。配色全面对齐 Auralis 三层禅意纸感色彩系统（底板严格对齐 Paper Tertiary 宣纸暖米白 `#FAF7F2`，输入区与内嵌区常态对齐 Oat Primary 燕麦米白 `#F7F2EB` 并在聚焦时转纯白，暖炭黑磨砂遮罩 `rgba(28, 28, 26, 0.42)`，发丝微边框 `#DDD5C7`，暗色模式严格继承 Charcoal Elevated `#3d3b38` 消除原先暗绿底偏差，主操作按钮对齐全站唯一规范 Primary 绿阶渐变 `linear-gradient(135deg, #9EAD80 0%, #8B9A6E 100%)`）；已将 `KnowledgeBlockViewDialog`、`WorkspaceKnowledgeBlockDialog`、`TaskCreateDialog`、`FileRegisterDialog`、`SubjectCreateModal`、`ConfirmDialog`、`ChangePasswordDialog`、`SummaryInstructionDialog` 全部对齐到统一结构、圆角与色彩系统；自动化套件 433/433、TypeScript 类型检查、学科图标契约检查、工作区契约检查以及生产打包均全绿通过。P2-PC-Modal-Consistency 风险已通过代码与自动化验证闭环，保留浏览器/Tauri 人工 GUI 走查。

- 2026-09-06：PC 文档调度递归、上传阶段本地失败转换和 Office 文本提取时序已通过 focused Node 42/42；OCR 使用受控 1×1 PNG 走现有 sidecar 协议完成模型预热，Rust 有界诊断通过 OCR 单元测试 7/7，Python sidecar 回归 11/11，`cargo check --lib` 通过。真实 Tauri 中图片 PDF、混合/文字 PDF、DOCX、PPTX 首次处理耗时与最终服务端 READY 尚未重新验收，因此 P2-PC-File-Viewer-Validation 与 P2-PC-Document-Processing-Validation 保持开放；纯图片 Office 在 renderer 无可靠页数时当前明确不支持 OCR fallback。

- 2026-09-01：PC 已将 File Viewer 与离线 PDF/OCR adapter 统一到 `pdfjs-dist@5.4.624`，lockfile 已去除 renderer 的嵌套副本；扫描样本的同版本加载、无 text layer 识别和位图绘制通过。FILE 处理从本地 OCR block、加密包、upload-intent、PUT、complete 到本地 `READY` 的组合自动测试已通过；恢复批次会隔离单项异常，Profile 可对没有本地 job 的 `AWAITING_CLIENT` 文件手动开始本机处理。手动入口会先确认 Source 已同步到服务端，未确认时显示同步状态，避免将未创建的 Source 调度为原始 404；运行时会刷新 Source，状态点继续展示服务器 `VALIDATING/PARSING/INDEXING`，直至真正可提问的 Source `READY`。未挂载 Tauri runner 会显示明确限制。本机 `docker compose ps` 因 Docker 配置和 `docker_engine` 命名管道拒绝访问而无法启动真实 Server/MinIO 验证。P2-PC-File-Viewer-Validation 与 P2-PC-Document-Processing-Validation 继续开放，关闭仍需要 Windows Tauri + OCR sidecar + 真实 Server/MinIO 的扫描 PDF 预览、解析状态、索引和可提问 GUI 证据。

- 2026-08-12：后端阶段 0 已完成仓库外备份、精确路径替换、Boot 4.1 / Modulith 骨架、12 个模块边界、Problem Details、健康检查、OpenAPI 和基础测试。
- 2026-08-12：后端阶段 1 Identity 已实现 Flyway V1、User/Device/RefreshSession、密码/JWT、refresh rotation/replay 撤销、Auth 路由和 owner-scoped session 操作；19 个自动测试和 H2 test profile HTTP smoke 通过。PostgreSQL、Docker 和人工业务验收仍开放为风险。
- 2026-08-13：后端阶段 2B 已实现 Flyway V3、Source/Asset/Relation、KnowledgeBlock Source 关联、对象存储端口、核心 MockMvc 和 42 个全量自动测试；PostgreSQL、Docker、真实 MinIO、ingestion worker 和人工业务验收仍开放为风险。
- 2026-08-14：针对审核发现的同步原子性、游标高水位、墓碑快照、实时提交后事件、Review 历史回放和任务完成时间统计完成修复；新增 V6/V7 迁移，`clean test` 通过 27 个测试类、69 个 H2/JPA/MockMvc 自动测试，并增加并发 cursor 与并发 mutation 重放回归。原 P1-Sync-Cursor-Concurrency 与 P1-Sync-Snapshot-Tombstone 已关闭；PostgreSQL、双设备、浏览器 WebSocket 和前端联调仍由 P1-Test-Coverage/基础设施风险覆盖。
- 新后端继续使用 `/api` 只代表保留总前缀，不代表旧客户端兼容。R3 已完成 OpenAPI artifact/SDK 冻结，但在 R4 页面迁移和真实服务联调完成前，仍禁止声明前后端已可直接联调。
- 旧 Server 的 AuthInterceptor、WebSocket 握手/心跳审计、资产用户前缀校验只属于替换前盘点，已移至仓库外备份；新实现不得将其视为已迁移能力。
- PC、Mobile/Tablet 近期视觉与布局改动属于用户工作树成果，文档已在归档快照保留；最终构建结果须与当前代码一起记录。
- 不应依据 StudyCore 归档恢复旧目录、旧路由或旧任务。
- 2026-07-10：PC Web、Mobile H5、微信小程序、Tablet 侧栏检查和旧 Server Maven 生命周期均通过；该旧 Server 结果已被阶段 0 替换，新后端另有独立测试证据。
- 2026-07-14：PC 新建学科改为语义线条图标，已有 Emoji 不迁移；`npm.cmd run check:subject-icons` 与 `npm.cmd run build` 通过，仍需 P2-PC-Subject-Icon-Validation 所列 GUI 验收。
- 2026-07-14：PC 学科工作区右侧 AI 伴读已复刻手机端四芒星、星环、气泡、三点输入中状态和纯文本胶囊输入；`npm.cmd run check:subject-workspace` 与 `npm.cmd run build` 通过，仍需 P2-PC-Workspace-Prototype-Validation 所列 GUI 验收。
- 2026-08-11：PC 已加入 Pomodoro 页面并继续收敛 Dashboard、Timeline、Asset、全局导航和工作区交互；Mobile/Tablet 已更新平板热力图自适应布局与品牌渐变，代码变化已记录在 Changelog，仍需当前构建与 GUI/真机验收。
- 2026-08-12：PC 学科图标、工作区静态契约检查和生产构建均通过；移除弃用 `baseUrl`、删除未使用 `ElMessage` 导入后，Vite 仍提示大 chunk。Mobile H5、微信小程序构建与 Tablet 侧栏检查通过，保留既有非阻断警告，未进行 GUI/真机验收。
- 2026-08-17：阶段 5 R1-03 完成 V10/V11、PostgreSQL pgvector/HNSW 检索、generation 原子切换和历史 vector 回填；定向测试 11/11、真实 PostgreSQL 17.11 + pgvector 集成 2/2 通过。P1-Backend-Docker-Gate 已完成 Compose/db/MinIO/backend/frontend 健康门禁；P1-Phase5-External-Infra 和 P1-Phase5-Ingestion-Fencing 仍保持开放，未声称真实 Provider、lease fencing、性能或前端业务验收通过。
- 2026-08-17：R1-05 完成 V13 Conversation 版本/消息序号并发控制、五类核心列表 keyset cursor、Sync 定时保留清理/指标/reset；定向套件 16/16、全量 `mvn -B -ntp clean test` 126 通过且 1 个 opt-in PostgreSQL 测试跳过。该证据仍不等价于全量 PostgreSQL 并发、生产调度、双设备断网、前端联调或人工业务验收。
- 2026-08-17：R3 固定 `/v3/api-docs` 运行时导出 artifact，新增 OpenAPI runtime/artifact 对比测试、固定 `openapi-typescript@7.13.0` 的 PC/Mobile schema 与轻量 typed client、PowerShell 生成/校验脚本和 CI drift workflow；R3 本地门禁通过，PC/Mobile 类型与构建检查通过；G3 契约迁移前置门禁通过。R2-05 真实 Provider smoke、R4 前端页面迁移和真实业务联调仍保持开放。
- 2026-08-17：G1 已通过；默认 Surefire 启用 PostgreSQL/MinIO Testcontainers，系统 Maven 与 Wrapper `clean test` 均为 135/0/0。G1 的 Docker/零跳过门禁已关闭；真实 Provider、lease fencing、性能、前端业务联调和人工验收仍保持开放。
- 2026-08-20：针对审查发现，PC 已清除普通请求 BYOK header/浏览器明文读取，离线写入只在明确传输失败时排队并复用身份；服务端 V14 将 AI USER 请求保留在短事务内，assistant 精确关联其 USER 消息。专项 12/12、PC 58/58、OpenAPI 比对和含 MinIO/pgvector 的 `clean test` 137/137 通过。真实 Provider 与浏览器断线/刷新业务验收以 P1-PC-AI-Recovery-Validation 保持开放。
- 2026-08-20：已修复同一 `deviceId` 的重复登录会在 Profile 显示多个可撤销条目的问题：新登录撤销同设备旧 refresh session，列表只展示每台设备一条活动会话；AuthControllerTests 7/7 和 Docker Testcontainers 全量 Maven 138/138 通过。撤销 refresh session 不使已签发 access JWT 瞬时失效，远端 access token 最多可持续至 15 分钟到期；若产品要求即时踢下线，需要单独设计每请求会话状态校验或 token denylist，当前保持为开放安全/产品决策。
- 2026-08-20：正式 `/profile` 的 BYOK 卡片已读取脱敏设置、按 Provider 展示 `hasApiKey`、以请求体更新配置并在成功后清空 API Key 输入；`test:r4-pc` 58/58、type-check 和 Web build 通过。真实浏览器对服务端读取、保存、失败提示与不同 Provider 的人工联调仍未完成，继续由 P1-PC-AI-Recovery-Validation 覆盖。
- 2026-08-20：R4 Task 5 完成 PC typed API 边界、Asset upload-intent/complete/download-url、AI conversation/message SSE 和分块安全解析；PC 定向协议测试 29/29、type-check 与 Web build 通过。全局 `check:r4-pc` 仍报告后续 Task 6–8 的旧 Store/页面命中，真实后端/MinIO/Provider/GUI/业务联调风险保持开放。
- 2026-08-20：R4 Task 6 完成 PC v2 localSchema/localRepository/legacy backup 边界；临时 SQLite/localStorage 定向测试 6/6，合并 `test:r4-pc` 为 35/35，type-check 通过。旧 Store 尚未切换，P1-PC-Local-Repository-Cutover 保持开放；真实 Tauri 数据库升级、首次登录迁移选择、GUI 和前后端联调未声称通过。
- 2026-08-20：R4 Task 7 完成 cursor Sync API/Store 迁移；定向 Sync 测试 4/4，合并 `test:r4-pc` 为 39/39，type-check 通过；静态检查仅剩 Task 8/10 的 Subject/页面/AI 旧实现命中。真实后端、多设备断网、浏览器 WebSocket、Tauri、GUI 和前后端联调未声称通过。
- 2026-08-20：R4 Task 8 完成 Subject/KnowledgeBlock/Source/Asset Store 与 SubjectHall/SubjectWorkspace/Asset/Home 主路径迁移；mapping 测试纳入 `test:r4-pc` 后为 44/44，`check:r4-pc` 扫描 52 个生产文件通过，type-check/build/diff check 通过。真实后端、MinIO/Provider、Tauri、GUI、双设备和前后端业务联调仍未声称通过。
- 2026-08-20：R4 Task 9–11 完成 PC Task/Review/Stats/Chat/Pomodoro Store、剩余正式页面、AI SSE controller、环境驱动 Vite 代理和 Tauri 最小权限边界；`check:r4-pc` 57 个生产文件、`test:r4-pc` 53/53、type-check、Web build 和 Tauri `--no-bundle` 通过。MSI bundling 因宿主 `os error 5` 阻断，P1-PC-Local-Repository-Cutover、P2-PC-Tauri-MSI-Bundle、真实服务/GUI/双设备/前后端联调仍开放。
- 2026-08-20：Mobile R4-04/R4-05 完成 Pinia/Vue 对齐、统一 Tablet 测试、环境驱动 runtime、Auth/Sync/Realtime/Asset/Review/Stats/AI 新契约和用户/设备独立本地库；用户明确授权后旧全局库在认证时一次性清除。静态检查 62 文件、协议 20/20、Tablet 测试、type-check、H5/微信构建通过；微信配置、真实外部依赖、双设备和真机风险由 P1-Mobile-Platform-Validation 保持开放。
- 2026-08-21：R4-07 的 Tablet Dashboard/Review/Stats 已接入 `statsApi` 与 `reviewApi`，移除随机统计、虚构学科兜底和本地 mastery 伪写；复习事件服务端保存成功后才推进，右滑不撤销不可变事件。静态门禁红灯覆盖上述边界，随后 `check:r4-mobile`、20/20 协议测试、Tablet 测试、type-check、H5/微信构建通过；真实服务和横屏真机仍开放。
- 2026-08-21：共享 TaskSelectSheet 的 mock tasks 和 Mobile Pomodoro 固定完成数已移除；静态门禁覆盖任务空态与 Store 计数边界，验证命令保持通过。
- 2026-08-21：Mobile Settings 固定加入天数已移除；当前 User DTO 没有注册时间字段，因此页面显示中性账户元信息，避免把演示值写成业务事实。
- 2026-08-21：Tablet AI 历史会话已切换到 Conversation 列表/删除 API，移除硬编码历史和图片识别伪结果；真实 Provider、断流和上传链路仍由现有外部依赖风险覆盖。
- 2026-08-21：Mobile Pomodoro 今日计数改用 `auralis:local:<scope>:pomodoro_counts`，与 userId/deviceId 本地库保持同一 namespace，避免账号切换读取全局计数；协议回归测试增至 20/20。
- 2026-08-21：Mobile Home 空任务不再注入演示日程，Profile 统计改为真实 Task/Block Store，账号元信息不再显示固定加入天数；静态门禁覆盖 `demo-*`、固定统计和中性空态边界。
- 2026-08-21：Mobile 手写页移除 Mock 覆盖和伪 OCR 成功弹窗；当前保留本地画布并明确提示识别服务未接通，不生成虚构知识块。协议回归测试增至 20/20，真实手写识别服务仍未进入当前候选版本。
- 2026-08-21：Tablet Workspace 总结移除定时器和固定摘要，改用 `chatWithAI` 的真实 SSE 增量并在失败时保持空态；协议回归测试增至 20/20，真实 Provider/断流仍由外部依赖风险覆盖。
- 2026-08-21：修复 AI 默认凭据解析边界：服务端 env Provider 作为无 BYOK 时的 fallback，用户 BYOK 按 Provider 优先覆盖；未指定聊天 Provider 时使用 `AURALIS_AI_DEFAULT_PROVIDER`。定向配置、设置和流式测试 10/10 通过，真实 Provider smoke 与 PC 浏览器联调仍未验收。
- 2026-08-21：Tablet 新对话改为首条消息前显式创建 Conversation，并将服务端 ID 传给 SSE；避免“新对话”继续写入用户级缓存会话。
- 2026-08-21：修复 PC 注册后的默认 Subject 行为：新用户不再自动创建“未分类”，历史默认标记可普通软删除；核心领域与资源归属回归 7/7 通过，浏览器空状态和删除操作仍待人工验收。
- 2026-08-21：修复 PC 学科工作区 AI 回溯：每次进入或切换学科创建新的伴读会话并清空当前消息，不恢复旧会话；PC 回归测试 59/59、type-check 和 SubjectWorkspace 静态契约通过，浏览器真实 SSE 仍待人工验收。
- 2026-08-21：补齐 PC 个人空间登出入口：确认、服务端 logout、本地清理和 `/login` 跳转已接入；PC 回归测试 62/62、type-check、Web build 通过，浏览器实际点击和服务端失败态仍待人工验收。
- 2026-08-21：修复 PC 学科大厅编辑无法保存：编辑表单补回 Subject `version`，更新请求继续遵守 `baseVersion` 并发契约；PC 回归测试 63/63、静态检查、图标契约、type-check 和 Web build 通过，浏览器实际编辑/刷新仍待人工验收。
- 2026-08-22：修复 PC 资产库“全部任务”仍显示固定演示任务且看不到真实任务：改用 `useTaskStore.fetchTasks()`，同时填充全部任务和学科任务目录；PC 回归测试 64/64、静态检查、图标/工作区契约、type-check 和 Web build 通过，浏览器资产库展示与状态切换仍待人工验收。
- 2026-08-22：PC Dashboard/Timeline/Asset 任务视图规则已统一：排期队列只显示有截止时间且未排期的未完成任务，时间轴为今天起 7 日窗口且保留已完成排期，资产库按未分布/未完成/已完成分组，导入入口聚焦未分布。`test:r4-pc` 73/73、type-check、静态检查、图标/工作区契约和 Web build 通过；P2-PC-Frontend-Refactor-Validation 继续开放，待浏览器/Tauri 实际走查宽屏不裁切、拖拽排期、完成/移出排期和导入跳转。
- 2026-08-22：资产库任务编辑已移除负荷按钮并改为 30 分钟步进的预计用时，Task Store 更新接口覆盖标题、备注、截止日期及时长；`test:r4-pc` 73/73、type-check 与 Web build 通过。P2-PC-Frontend-Refactor-Validation 仍开放，待浏览器实际编辑、刷新后持久化与错误态验收。
- 2026-08-22：修复时间轴周视图与日视图不一致：日视图增加半小时排期槽位匹配，已过去排期保留并以删除线展示；`test:r4-pc` 74/74、type-check、静态检查和 Web build 通过。P2-PC-Frontend-Refactor-Validation 仍开放，待浏览器跨日、半点排期和拖拽走查。
- 2026-08-22：PC Dashboard/Timeline 时间轴改为共享的当日居中 7 日窗口（前后三天），所有可见列显示真实日期；日期边界与任务筛选回归使 `test:r4-pc` 达到 75/75，type-check 通过。P2-PC-Frontend-Refactor-Validation 仍开放，待浏览器跨月/跨周日期、半点排期和拖拽走查。
- 2026-08-22：修复 PC 时间轴拖拽失效和任务块错位：补齐原生拖拽数据、等待 drop 排期写回、按半小时槽位/间距计算任务高度，并将首页日期格改为只显示日期、顶栏显示完整星期/月日；`test:r4-pc` 77/77、type-check、静态检查和 Web build 通过。P2-PC-Frontend-Refactor-Validation 仍开放，待浏览器实际拖拽交换、跨槽位任务高度和窄栏视觉走查。
- 2026-08-22：根据日期边界反馈，Dashboard/Timeline 从当日居中滚动窗口恢复为从当天开始的连续 7 日单周窗口；首页日期选择器改为纯日数字、选中圆形背景，标题改为“时间轴 · X月”。P2-PC-Frontend-Refactor-Validation 仍开放，待浏览器验证跨周排期不消失、拖拽写回和窄栏视觉。
- 2026-08-22：按最新需求将 Dashboard/Timeline 日期窗口改为当前/所选日期所在的自然周（周日至周六），首页日期数字上方显示 `Sun` 至 `Sat` 英文星期缩写，选中徽标保持约 36px 圆形绿色背景。P2-PC-Frontend-Refactor-Validation 仍开放，待浏览器验证周日/周六边界、跨周拖拽和窄栏视觉。
- 2026-08-22：PC 全局排版已收敛到 16px 根字号、语义字号令牌和统一字体栈；普通 UI/控件使用 `--font-family-base`，代码/图表等宽内容使用 `--font-family-mono`，已移除 Pomodoro、Dashboard、KnowledgeGraph 的局部字体族。`test:r4-pc` typography contract 纳入回归；P2-PC-Frontend-Refactor-Validation 仍开放，待浏览器窄栏、深色主题和字体加载后的实际视觉验收。
- 2026-08-22：修复 PC Dashboard 已排期任务拖拽后仍停留在旧时间的问题：显式目标 `startTime` 现在覆盖旧 `scheduledAt`，未提供时仍保留原排期；新建/复习任务和 Store 缺省时长统一为 30 分钟倍数。`test:r4-pc` 81/81、type-check、静态检查和 Web build 通过。Docker 测试账号 17 个任务的时长与排期已统一到半小时粒度，P2-PC-Frontend-Refactor-Validation 仍开放，待浏览器实际拖拽和刷新后持久化走查。
- 2026-08-22：修复 PC 学科工作区文件登记前端静默失败、Docker MinIO 预签名 URL 使用容器 hostname 以及直传 CORS 缺失。`test:r4-pc` 82/82、type-check、静态检查、后端 clean test 149/149、MinIO public endpoint 集成测试 2/2 和 Compose config 通过；push 后 Docker 重建、frontend/backend 健康、HTTP readiness 和 `localhost:5173` CORS 预检均通过。新增 P2-PC-Asset-Upload-Validation 风险，关闭条件为真实浏览器上传、Source 列表刷新和失败重试均通过。
- 2026-08-22：为 Docker backend 增加资产直传与 Source 登记阶段日志，能从 `docker logs` 区分 intent、complete/HEAD、READY、校验拒绝和 Source 创建；日志已脱敏。P2-PC-Asset-Upload-Validation 仍开放，需结合这些阶段日志完成真实浏览器上传/登记/失败重试走查。
- 2026-08-22：补齐本地 `http://127.0.0.1` 访问时 MinIO CORS 白名单缺失，upload-intent 201 后浏览器 PUT network error 的配置问题；重启 MinIO/backend 后预检 204 通过。P2-PC-Asset-Upload-Validation 仍开放，待浏览器刷新后完成真实上传登记。
- 2026-08-23：PC 学科文件工作区将总结从原文件预览容器拆为独立 `· 总结.md` 虚拟文件项，点击原文件不再同时渲染总结；总结项支持独立 Markdown 阅读和下载，关联知识块仍写入原始 Source。`test:r4-pc` 93/93、type-check 和 Web build 通过；P2-PC-Frontend-Refactor-Validation 仍开放，待浏览器走查文件切换、Markdown 下载和深色/窄栏布局。
- 2026-08-23：修复 PC Dashboard 窄宽待办条目中长学科名称挤掉任务名称的问题；`.todo-subject` 现在允许收缩、限制最大宽度并省略显示，任务名称保留主 flex 空间。`test:r4-pc` 94/94、type-check、静态检查通过；P2-PC-Frontend-Refactor-Validation 仍开放，待浏览器缩放/窄栏和长中英文名称人工走查。
- 2026-08-23：修复 PC 学科文件登记的本地优先 Source 未保留上传字节数，避免同步完成前显示 `0.0 MB`；上传大小仅用于本地展示，不进入 Source 创建请求。`test:r4-pc` 94/94、type-check 和 Web build 通过；P2-PC-Asset-Upload-Validation 仍需浏览器刷新、既有文件与新文件 GUI 验收。
- 2026-08-23：PC 学科文件栏改为只显示真实 Source 文件，移除独立 `· 总结.md` 虚拟项；知识块入口承载总结，文件预览由 `FilePreview` 直接渲染，文件行新增确认后的 Source 软删除。后端新增 30 天默认保留的 MinIO 清理调度，清理后保留 Asset/Source 审计行并标记 `ORPHANED`。`test:r4-pc` 95/95、后端全量 155/155、Compose config、Docker 重建、backend healthy、frontend HTTP 200 和 readiness `UP` 均通过；P2-PC-Workspace-Prototype-Validation、P2-PC-File-Viewer-Validation 和 P2-PC-Asset-Upload-Validation 仍以浏览器人工验收为关闭条件。
- 2026-08-23：PC File Viewer 预览工具栏收敛为底部页码/缩放/旋转三组控件，隐藏通用搜索、下载、打印、HTML、主题和 PDF 导航侧栏；`test:r4-pc` 99/99、type-check、`check:r4-pc` 与 Web build 通过。P2-PC-File-Viewer-Validation 仍开放，需用真实 DOC/DOCX/PDF 样本确认底部定位、分页、缩放、旋转、资源加载和窄栏布局。
- 2026-08-23：PC File Viewer 改为统一预览面板：学科页文件名顶栏承载缩放/旋转，bare 预览主体底部同级显示页码/总页数和前后页，去除 renderer 内层边框/圆角；补充 renderer 就绪前后的控制队列、上下栏投影、实体按钮状态和 24–32px 文档安全留白；`test:r4-pc` 101/101、type-check、`check:r4-pc` 与 Web build 通过。P2-PC-File-Viewer-Validation 仍开放，需用真实 DOC/DOCX/PDF 样本确认底部定位、分页能力、缩放、旋转、资源加载和窄栏布局。
- 2026-08-23：PC File Viewer 控件继续收敛：去除顶栏外层容器，缩放显示实际倍率，旋转提供线条左旋/右旋图标和角度；顶栏按钮不再以 `previewControlsReady` 禁用，renderer 负责队列执行，DOC/DOCX 旋转由外层视图状态驱动，文档上下留白改为 12–16px。`test:r4-pc` 101/101、type-check、`check:r4-pc` 与 Web build 通过。P2-PC-File-Viewer-Validation 仍开放，需用真实 DOC/DOCX/PDF 样本确认按钮点击后的页面缩放、左右旋转可视区域、分页、资源加载和窄栏布局。
- 2026-08-23：根据真实 PDF 截图反馈，移除宿主“正在渲染文档”遮罩，缩放改为 File Viewer 视图状态 API 并将首次宽度 fit 限定到用户首次交互，缩放与旋转分别使用同款圆角控制组；定向预览回归 16/16，完整 `test:r4-pc` 101/101、type-check、静态检查和生产构建均通过。P2-PC-File-Viewer-Validation 仍开放，需确认真实 PDF/DOCX 点击缩放后的页面尺寸和加载完成后的可视区域。
- 2026-08-23：针对 PDF/图片缩放、旋转无响应反馈，移除 FilePreview 与 renderer 中依赖 `load-complete` 的两级 ready 硬门禁；动作只在组件 ref 尚未建立时暂存，缩放和 PDF/图片旋转继续通过 File Viewer `applyViewState`，图片内部旋转工具栏隐藏，Office renderer 保留外层旋转回退。定向预览回归 16/16、`test:r4-pc` 101/101、type-check、静态检查和 Web build 通过。P2-PC-File-Viewer-Validation 仍开放，需确认真实 PDF/图片点击缩放与左右旋转后的页面状态。
- 2026-08-23：继续以 Chrome 调试 PC File Viewer，确认前一轮 ready 门禁调整不是最终根因；点击会抛出 `viewer.getZoomState is not a function`，原因是 `@file-viewer/vue3-full@2.3.2` 包装组件的空 `Proxy` expose 未形成 Vue 父级可调用方法。renderer 已切换为 `@file-viewer/vue3@2.3.0` 基础组件并使用 `withFullViewerOptions`，缩放调用公开的 `zoomIn`/`zoomOut`/`resetZoom`，旋转调用 `applyViewState`。Chrome 合成图片实测宽度 800px→896px、角度 0°→90°；定向回归 16/16、完整 PC 回归 101/101、type-check、静态检查、Web build、Docker 无缓存重建、容器镜像一致性与 HTTP 200 均通过。P2-PC-File-Viewer-Validation 仍开放，仅保留真实业务 DOC/DOCX/PPT/PDF/图片/文本和 Tauri GUI 验收。
- 2026-08-23：按截图移除 PC 学科文件列表行左侧的文件类型图案，保留文件名、大小、选中态和删除操作；新增静态回归断言，定向预览回归 17/17、完整 `test:r4-pc` 102/102。P2-PC-File-Viewer-Validation 仍开放，需人工确认窄栏、长文件名和真实样本布局。

## 推荐关闭顺序

R1-06、G1、G2 与 G3 契约迁移前置门禁已完成代码、配置和自动测试闭环；仍需完成 R2 剩余真实 Provider/异常专项和 R4 前端契约迁移验收。

2026-08-17：R2 代码/配置基线已完成，Compose config/build/up/health、真实 PostgreSQL 17.11 + pgvector 2/2、真实 MinIO 1/1 和 Provider stub 2/2 已通过；MinIO 异常路径、真实 Provider smoke 仍需要明确模型、key 和网络窗口。

1. 完成阶段 1–5 的 PostgreSQL/Testcontainers/Docker/MinIO/Provider 外部门禁，验证 Sync、Source ingestion 和 pgvector 检索在真实依赖上成立。
2. 补齐 ingestion generation/崩溃恢复、BYOK/SSRF/限流专项和真实 SSE 取消/断线契约。
3. 完成真实 Suggestions/RAG citations 的质量与提示注入验收、双设备断网恢复和真实 WebSocket。
4. 完成前端新契约联调，生成客户端后进行 PC/Mobile/Tablet 主流程和人工业务验收。
5. 完成 Docker/基础设施集成、CI、备份、监控和发布演练。

## 更新方式

新增风险时必须提供 ID、优先级、证据、影响、动作和关闭条件。关闭后移除该表并在 Changelog 记录可确认变化；历史讨论不留在本文件。

## 2026-09-09 Task 14 Server 同步证据边界

- **P1-Server-Task14-External-Validation**：Source ingestion 状态/安全诊断同步链路已由 H2 集成测试覆盖，Server 全量回归仍受既有架构循环、Docker 不可用和 H2 清理外键错误影响；真实 PostgreSQL、MinIO、realtime broker 和端到端客户端观察未完成。处理：在可用 Docker/真实运行环境执行对应验收并记录事件顺序。关闭条件：真实依赖与端到端事件证据完成。

## 2026-09-09 Task 16 部署运行验证

- **P1-Server-Scheduled-Retention-Transaction**：scheduled `SyncRetentionService` 入口已增加实际事务边界；回归测试先复现 `deleteByCreatedAtBefore` 的 `TransactionRequiredException`，修复后 Spring 代理入口真实删除通过，`SyncServiceTests` 11/11 通过。剩余处理：观察至少一次实际 scheduled run 日志无 ERROR。关闭条件：生产形态日志无该异常；自动事务/删除证据已满足，真实运行证据仍待补齐。
- **P1-PC-Task16-External-Validation**：只读 PostgreSQL 显示现有 READY Source/Job，但历史 change-log 无 SOURCE UPDATE；这些记录早于事件修复。处理：认证用户执行一次新的 FILE reingest/upload，再核对 ordered READY events、PC read sync、local projection 与 GUI。关闭条件：取得真实 Tauri/Server/MinIO/PC GUI 端到端证据。

## 2026-09-09 Task 15 PC 验收边界

- **P1-PC-Task15-External-Validation**：complete accepted 后的单次 background `read` sync 请求已由 focused 自动测试覆盖，回调失败隔离且本地状态仍可到 READY；真实 Tauri sync scheduler、Server/MinIO、realtime 合并与 GUI 状态尚未观察。处理：在真实运行环境完成一次 FILE Source 上传并核对 read pull 与最终 UI。关闭条件：取得端到端现场证据。

## 2026-09-08 Task 5 OCR 验收边界

- **P1-PC-OCR-GUI-Validation**：代码已实现逐页进度、跨空页继续、全空文档 `OCR_DOCUMENT_EMPTY` 和安全诊断复制，focused 自动测试覆盖；但 `1.pdf` 尚未在真实 Tauri GUI 中运行，无法证明 File Viewer、任务中心、重试/失败反馈和真实 OCR 质量。处理：使用真实 Tauri 打开 `1.pdf`，观察页级进度、全空失败和后续页继续。关闭条件：GUI 证据与结果记录完成。
- **P1-PC-OCR-Privacy-Observation**：诊断 formatter、持久化边界和 Rust bounded log 有自动测试，未完成真实剪贴板/accessibility 及日志观察。处理：在 Windows Tauri 会话复制诊断并检查剪贴板、应用日志和 sidecar stderr。关闭条件：确认无 OCR 正文、完整图片路径、`Authorization` 或签名 URL 泄漏，并记录现场证据。

## 2026-09-18 OCR 页进度与 Source 收敛 Task 4

- **P1-PC-OCR-GUI-Validation（仍开放）**：本地-only OCR 页进度投影已由 focused 自动测试验证，Source 行复用既有 `正在识别第 X/Y 页` 文案；未新增百分比或新 UI。真实 Tauri/GUI OCR 进度、真实日志和剪贴板/accessibility 观察仍未完成。处理：在 Windows Tauri 中运行真实 `1.pdf` 并记录页级进度与诊断边界；关闭条件仍为现场 GUI/日志证据。
- **P1-PC-Source-Convergence-External-Validation（仍开放）**：自动测试已证明替换 socket `onopen` 只触发一次既有 background `read` sync，且处理 runtime 的生命周期/scope-guarded 共享有界 reconciliation 可收敛遗漏的 `READY`；focused 90/90、PC 全量 352/352、type-check 与 build 通过。测试使用模拟 socket/local projection，未证明真实后端 WebSocket/event delivery、cursor persistence、Tauri 运行时或跨设备收敛。处理：在真实 Server/Tauri 双设备环境观察断线重连、遗漏事件恢复和最终 Source 状态；关闭条件为端到端事件与跨设备现场证据。

## 2026-09-18 OCR 页进度 Task 5

- **P1-PC-OCR-GUI-Validation（仍开放）**：Store 现在以 `attempt + localContentRevision` 区分 OCR run，仅在允许后续事件的 page/total 与最近有效值一致时保留 projection；同 run 倒退 `before-recognize`（含 totalPages 变化）不覆盖，reader pending、detach、Source 消失和失败清理边界均有回归，Store/UI/coordinator/runtime 68/68、type-check 和 diff-check 通过。自动证据仍未覆盖真实 Tauri/GUI 的 OCR 进度、日志、剪贴板/accessibility 或真实 OCR 质量。处理与关闭条件仍为在 Windows Tauri 运行真实 `1.pdf` 并记录现场证据。

## 2026-09-24 PC 关系星图（KnowledgeGraph）中间圆角边框消除与星空动效升级 Review

- **审查范围**：`Auralis-PC/src/components/subject/KnowledgeGraph.vue`、`Auralis-PC/src/views/Asset/index.vue`。
- **改动性质**：UI 视觉与动效体验优化（消除嵌套卡片圆角边框、HUD 图例胶囊化、60fps 动态星空粒子/能量流光/呼吸光晕/悬浮高亮）。
- **正确性与性能审查**：
  1. **物理与动效解耦**：冻结模块 `knowledgeGraphPhysics.ts` 的力导向物理运算未受任何篡改，原有 180 帧收敛上限逻辑完全保留，收敛后物理步进休眠（0 CPU 额外计算）。
  2. **渲染能耗优化**：Canvas 持续微动效仅基于简单的三角函数与粒子计算，挂载 `document.visibilitychange` 监听，在标签页切出/最小化时立即暂停 `requestAnimationFrame`，避免无谓耗电。
  3. **层级与事件穿透**：毛玻璃 HUD 图例胶囊与适配按钮位于右上角，不遮挡主体星图拖拽与缩放交互；节点文字标签升级为胶囊样式且保留原有拖拽阈值判断，防误触。
- **问题分类**：
  - BLOCKER: 0
  - IMPORTANT: 0
  - OPTIONAL: 0
- **自动化验证结论**：`npm.cmd run test:r4-pc`（403/403 全部通过，包含 `r4-knowledge-graph-force.test.mjs`）、`npm.cmd run type-check`（0 error）、`git diff --check`（无空格/换行告警）。

## 2026-09-24 PC 专注时钟（Pomodoro）温润配色全面对齐、时间轴专属排期联动与自由学习模式 Review

- **审查范围**：`Auralis-PC/src/views/Pomodoro/index.vue`、`Auralis-PC/src/components/pomodoro/TimerCore.vue`、`Auralis-PC/src/components/pomodoro/PomodoroRing.vue`。
- **改动性质**：UI 配色温润对齐（燕麦米白容器、禅意鼠尾草绿/茶歇琥珀圆环、胶囊控制组）与任务过滤体验优化（严格仅展示时间轴排期任务、默认提供「自由学习」心流模式）。
- **正确性与性能审查**：
  1. **数据一致性**：任务列表严格从 `useTaskStore.allTasks` 提取具有 `scheduledAt` 且未完成、未取消的排期任务，并按时间先后有序展示，不篡改 Store 原始任务状态与同步链路。
  2. **自由学习兜底**：使用常量 `FREE_STUDY_TASK` 保证在无时间轴任务时用户仍可顺畅开启专注时钟，不抛出空指针或选择器错误。
  3. **视觉设计遵从性**：圆环与按钮严格遵从温润极简规范（去除原有高饱和橙绿），字体继承全局 `--font-family-base`，不存在硬编码禁用字体。
- **问题分类**：
  - BLOCKER: 0
  - IMPORTANT: 0
  - OPTIONAL: 0
- **自动化验证结论**：`npm.cmd run test:r4-pc`（403/403 全部通过，包含 `r4-dashboard-timeline.test.mjs`）、`npm.cmd run type-check`（0 error）、`git diff --check`（无空格/换行告警）。

### P1-PC-Overview-Server-Deduplication（2026-09-10）

- 优先级：P1。
- 证据：PC 通过 `[FILE_OVERVIEW_TRIGGER]` 记录结构化 allowlist 生命周期；服务为进入 `runFile` 的生成尝试创建 request ID，并由 API 复用到 `X-Overview-Request-Id`。2026-09-27 Server 已在单实例内按 `(user, source, revision, mode, instruction)` 合并进行中请求，Overview 聚焦 45/45 通过。
- 影响：跨 Server 副本的相同请求仍可能同时生成，造成重复 Provider 工作或结果竞态。
- 处理动作：设计跨实例持久协调/幂等策略，并补多副本及真实 Provider 并发生成回归。
- 关闭条件：跨实例同键并发只产生一个有效进行中生成/稳定幂等结果，并取得真实 Server/Provider 证据。

### P1-PC-Overview-Timeout-Mismatch（2026-10-11 本地传输验证通过；真实环境待验收）

- PC 外层为 300000ms，Server 默认为 240000ms 入口绝对预算，超期关闭本调用 socket。本机真实 TLS 持续慢流、握手/写入阻塞与 Servlet/TCP 断连已验证；连接阻塞仅有受控 socket 替身，非真实内核 connect 停滞。
- 相关普通 Provider/HTTP 兼容回归通过。同步 JDBC/账本锁等待无法强制中止；preflight 若阻塞，HTTP/SSE 建立可晚于期限。原生 DNS 可能占固定 resolver slot 至 OS 返回，但取消后不得迟到 HTTP 出站。
- 剩余影响：运行旧 backend 尚不支持 PC SSE；真实反向代理可能缓冲或先断开，远端计算撤回也未证明。未部署与真实环境边界不能写为业务验收通过。
- 关闭条件：更新 backend 后，在真实 PC、代理和 Provider 链路取得成功/超时/主动停止的一致运行态证据，保持普通 AI 路径；完整命令和限制见 [实施计划](../plans/2026-10-11-overview-hard-timeout-cancellation.md)。

### P1-PC-Overview-Tauri-Provider-Attribution（2026-09-10）

- 优先级：P1。
- 证据：自动测试验证 TypeScript 封闭类型/已知调用点触发值、request ID header 传递和 coalescing；真实 Tauri 日志、Provider 运行和 Server 关联尚未观察，preflight/skip 事件可能没有 `requestId`。
- 影响：无法确认真实桌面启动、联网恢复、任务变化和手动重试是否按预期归因，也无法确认 Provider 日志能否端到端关联而不泄露敏感信息。
- 处理动作：在 fresh Tauri 运行中覆盖 bootstrap/online/sync/job-change/READY/manual retry，采集脱敏 PC、Server 和 Provider 事件并核对 request ID。
- 关闭条件：真实 Tauri 各触发路径均有正确归因，Provider/Server 日志可关联且无敏感字段，并完成业务验收记录。
### 2026-09-15 最小 JSON 诊断待真实重跑

- 已增加两处临时、非改变行为的证据：Provider 发送前从已序列化 body 记录 `AI_JSON_MODE`（只含 structured JSON、`json_object`、maxTokens/stage）；Overview FINAL 在既有 validator 前对原始 `message.content` 直接执行 `readTree`，记录 `FINAL_JSON_CHECK`（valid、字符数、Jackson 行列和异常类型），不做 fence stripping，因此 fenced JSON 会 valid=false。不记录 body、prompt、正文、原始 exception message、URL 或凭据，普通聊天/流式不变。
- 自动聚焦测试已通过；尚未部署或重跑真实 DeepSeek。若重跑仍失败，应结合 `FINAL_JSON_CHECK valid` 与 `JSON_PARSE`/schema 阶段判断是 JSON 文本非法还是 schema 校验失败；在此之前不引入修复性重试或放宽 validator。

### 2026-10-13 PC 全站多余滚动条与弹窗内层嵌套滚动条根除（已修复）

- **现象与根因**：
  1. `ConfirmDialog.vue`：确认弹窗正文仅一行确认提示，但因外层 `.modal-shell-body` 开启了 `overflow-y: auto` 且子元素 `<p>` 存在外边距，在 Windows Chromium 下因亚像素行高计算触发微量溢出，露出不该有的垂直滚动条；
  2. `WorkspaceKnowledgeBlockDialog.vue` 与 `KnowledgeBlockViewDialog.vue`：浏览态的正文卡片 `.kb-content-card` 错误写死了 `max-height: 480px/500px; overflow-y: auto;`（甚至配置了 `scrollbar-width: thin`），编辑预览卡片 `.edit-rendered-card` 也设置了 `max-height: 380px; overflow-y: auto;`，导致弹窗内部产生框中框、内层嵌套截断和“双重滚动条”；
  3. `modal.css`：在全局模态基类中错误声明了 `.modal-shell-body::-webkit-scrollbar { width: 5px; }`，打破了 Auralis 极简禅意体系中“除文件阅读器外全局隐藏滚动条”的设计规范；
  4. `TaskCreateDialog.vue`：所属学科列表 `.subject-grid` 显式设置了 5px 自定义滚动条；
  5. `SubjectWorkspace/index.vue`、`Dashboard/index.vue`、`Timeline/index.vue`：部分局部滚动区域（如学科文件抽屉 `.drawer-list`、知识块网格 `.blocks-grid`、首页待办列表 `.todo-list`、流式速递 `.stream-body`、时间轴刻度槽 `.time-slots` 等）显式设置了 `scrollbar-width: thin` 与滚动条样式。
- **修复**：
  1. `ConfirmDialog.vue`：为模态壳绑定 `body-class="confirm-modal-body"` 并设置 `overflow: hidden !important;`，正文外边距归零，彻底消灭确认弹窗的任何滚动条；
  2. `WorkspaceKnowledgeBlockDialog.vue` & `KnowledgeBlockViewDialog.vue`：彻底移除 `.kb-content-card` 与 `.edit-rendered-card` 的 `max-height` 及 `overflow-y: auto` / `scrollbar-width: thin`，正文内容自然撑开，统一由外层模态壳平滑滚动，杜绝双滚动条；
  3. `modal.css`：恢复模态主内容区 `scrollbar-width: none; ::-webkit-scrollbar { display: none; }`，杜绝未溢出弹窗产生灰色滑条；
  4. `TaskCreateDialog.vue`：`.subject-grid` 设为 `scrollbar-width: none; ::-webkit-scrollbar { display: none; }`；
  5. `SubjectWorkspace`、`Dashboard`、`Timeline`：所有局部滚动列表统一遵循全局极简禅意无滚动条规范，隐藏滚动条视觉露出，保留自然滚轮与触控滚动。
- **验证**：PC 类型检查 `npm run type-check` 0 error，核心单元回归（Markdown 公式渲染、任务创建等）全部通过。真实 GUI 视觉体验待人工验收。





### 2026-10-23 M5.5：严格正文节点 descriptor 复用

- 跨 input donor 要求同 owner/scope/profile/algorithm/prompt step，且 donor 完整 descriptor JSON/hash 与当前完全一致；descriptor 覆盖目标组全部 unit refs 和 exact prompt step。global fingerprint 绑定有序章节/小节职责、分组来源与 mode/instruction/system policy，但排除其它组正文/revision/chunk。
- 保留 donor generation/ASSEMBLED plan/VERIFIED node/checkpoint 的 input 身份一致、checkpoint SHA/schema、14天及 result expiry、owner/source、coverage/shape 和 M5.4 当前 attempt 真实 dispatched reservation 围栏；无真实 dispatch 的物化 node 不得接力成为 donor。
- 顺序为 current-generation checkpoint → beginAttempt/未知调用 hold → 完整 input 的 M5.4 donor → strict 完整 descriptor donor → 原 writer miss。命中物化本代恢复 checkpoint，不新增 usage/reservation。新 private descriptor 由新的 algorithm identity 隔离旧格式，无数据迁移/转换。
- 定向验证分批通过：Coordinator 26/26 与 Adaptive 30/30（合计 56/56，exit 0）；后增 Service 验收 2/2（exit 0）。Service 用例验证 B 内容修订而全局路由不变时只 B 派发，以及只改变 B goal 时完整 input 相同但 global fingerprint 变化导致 A、B 都派发。它不是额外完整回归批次。唯一只读 reviewer B0/I0/O0；未审查的其它历史范围与完整 M5 仍开放。



### 2026-10-23 M5.6：cleanup 与 takeover 的父行锁互斥（实现、定向验证与唯一审查完成）

- 旧风险是 cleanup 清除 ACTIVE 但 lease 已超时的 checkpoint。实现现只锁定非 ACTIVE generation 父行，确定性有界批次最多 100 个，使用 FOR UPDATE SKIP LOCKED 并锁后重读状态。
- result 与 checkpoint 分别按自身过期条件清理；ACTIVE generation、较新的 checkpoint、未到期 result 与 request/budget/execution journal lineage 保留。cleanup 不改 usage reservation，也不删 generation。
- 首次测试编译因 accessor/overload 错误退出 1；修正后统一 62 项批次为 61 通过/1 fixture error（exit 1）。fixture 修正后的 affected-only 1/1（exit 0）；未重跑 62 项整批。相关中间失败保存在执行者日志/交接中。
- H2 双事务测试覆盖 cleanup 持锁时 takeover 状态转换及 SKIP LOCKED；没有 PostgreSQL 集成证据。sole reviewer B0/I0/O0。容量上限、权限撤销、来源/账号删除完整生命周期、旧范围审计和完整 M5 仍开放。

### 2026-10-23 Overview M5 完整缓存与删除生命周期结案

- 有界容量：V38 guard 串行限制 standalone、未 pinned 的 SUCCESS result/checkpoint payload，默认 256 MiB / 1000 generations；每轮最多处理 100 个 eviction candidates。容量压力只可丢弃可复用副本，不得失败成功生成、释放/重复 reservation 或破坏 unknown-dispatch 与 journal/usage lineage。durable-job linked generations 排除于共享 cache pool。有效 full、focused 与 affected-only 结果按批见 D 盘结案 handoff。
- Source/Subject revocation：删除事务对相关 jobs/generations/publication intent 建立 fence，清理私有 raw-derived copies；receipt 保留幂等身份与 hash，response snapshot tombstone 后旧 replay 返回 RESOURCE_VERSION_CONFLICT。完整 PostgreSQL/Testcontainers 和受影响测试结果见 D 盘结案 handoff。
- Account hard-delete：隔离 PostgreSQL 17.11 integration 1/1 通过；目标 owner 的 Overview lineage 被清除，另一 owner 数据、容量 guard 及已结算 usage evidence 保留。
- Retention：completed-job request/manifest/candidate 与不再被其它仍保留 job 需要的 SUCCESS result/checkpoint/plan/node payload，按 14 天、有界批次清理；共享 generation 保留至最后一个需它的 job 过期。ACTIVE/FAILED/PAUSED/unknown recovery state 与 usage/reservation/journal metadata 保留。Standalone result/checkpoint expiry 仍按对象自身期限分批物理清理，不保证到期即刻清除。
- 最终 backend full 保留 805 项 / 799 passed / 1 stale migration-version fixture failure / 0 errors / 5 assumption-skipped；受影响 fixture 单测 1/1、另批运行的五项原 skipped lock tests 5/5、最终 package exit 0。full 未重跑，不声称 full suite 全绿。唯一只读 reviewer B0/I0/O0；审核后只有 V33 fixture expected version 37→38 的测试断言更正。
- 此结案关闭本轮 M5 缓存/复用与删除生命周期项。其它历史 PC/Mobile/full-suite、未运行真实 Provider/GUI/部署、restore/recreate revision rotation 或旧范围审计风险，仅按各自既有条件跟踪；不由 M5 条目代为关闭。
### 2026-10-23 Overview 追踪导出门禁问题关闭（剩余为人工验收）

- 唯一只读审查 B0/I0/O0。配置 path 初始化异常 fail-open、UTF-8 clipping 重复 helper compile blocker 均已由最小修改关闭；focused 87/87、full backend 813/813、package exit 0，Compose 合成配置 exit 0。详细证据见[追踪计划](../plans/2026-10-23-overview-test-tracing.md)。
- 剩余边界不是自动门禁问题：尚需用户按计划用一份真实资料从现有界面实测，确认采集完整性和内容可读性；未做真实 Provider、部署或 GUI 验收。关闭追踪后需人工清理本地导出，数据库删除不覆盖这些文件。

### 2026-10-23 ADAPTIVE_METADATA summary 规则冲突（已修复并通过 focused 验证）

- 通用 system prompt 对 ALL 要求 summary 非 null，ADAPTIVE_METADATA 专用规则要求 summary=null；即使专用用户数据携带 `expectedSummary=null`，也无法覆盖“用户数据只是参考”的 system 约束。导致模型返回合法 Overview schema 后，metadata shape 检查拒绝该输出；已保存的旧 checkpoint 也可能在恢复时重复失败。
- 修复限定 `ADAPTIVE_METADATA`：system 明确内部规则优先；Provider 输出及 checkpoint 恢复都先按原通用 schema 校验，再清理顶层 summary。既有 alias coverage/shape 门禁保留，metadata-route ALL、writer 与最终 summary 不受影响。focused 回归 OverviewAdaptiveGenerationTests 40/40（0 failure/error/skip，exit 0）通过；唯一只读 review 由主 Agent 后续执行。未部署、未调用真实 Provider。


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
- 本批后端已部署：sha256:84c96a9c04c9e879a5f294b73cbedb156581931b1f0b5cd278992a66dcea8a8d，Docker healthy、readiness HTTP 200。仅backend更新，未触发真实Provider。
# 2026-10-25 Adaptive GUIDE 动态输入容量（源码候选）

- GUIDE 完整与紧凑候选现按 serialized request 的既有 token 估算、输出 reserve、已知模型上下文和当前平台任务余额筛选；完整/紧凑有效 checkpoint 在新调用 quota 筛选前读取，因此缓存 replay 不额外扣本次请求 reserve。只放开 `ADAPTIVE_GUIDE` 的通用字符门限，其他 Overview stages 保持配置门限。
- 无 API、DB、配额、输出 reserve 或 BYOK 策略变化。D 盘隔离候选中三个 GUIDE focused cases 通过：>12k BYOK 请求实际到达 mock scope 且保留 2048 输出上限；当完整候选预留超过 PLATFORM 余额而紧凑候选正好装入余额时选择紧凑输入；不足以预留新调用时读取有效指南 checkpoint 且不派发 Provider。Maven exit 0，日志 `D:/Temp/auralis-guide-dynamic-capacity-20261025/candidate/guide-focused-final.log`，源码/test hash `candidate-source-hashes.csv`。唯一只读 review BLOCKER 0 / IMPORTANT 0（主代理报告）。未部署、未连业务数据库、未调用真实 Provider；GUI 与真实 GUIDE 业务验收未执行。mock Gateway 测试不证明持久 Guard/账本 reservation 的集成行为。

- 2026-10-28：topic000175 曾出现跨节重复；`ADAPTIVE_ROUTE_INSTRUCTION` 已增加每个 topic ID 单一 section 归属提醒（含合并/重组），源码候选尚未部署，模型效果未验收。
