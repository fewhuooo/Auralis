# Spring Boot 后端模块

### 2026-11-15 已删除资料的索引任务

入库 worker 仍按学科、资料、任务的顺序锁定。资料或所属学科已删除时，旧任务按失效处理，结算任务自身的状态并释放队列。资料状态及恢复流程继续由现行 Source 契约控制。

### 2026-11-15 账号邮箱验证

Server 提供邮箱验证码注册、用户名或验证邮箱登录和密码找回。验证码按用途隔离、限频并失效。已登录改密在用户行锁内更新凭据代次并撤销其他设备的刷新会话，操作设备可继续续期。邮箱重置撤销所有设备的刷新会话。这两种操作都会使此前签发的访问令牌在后续认证时失效。通过环境变量配置 SMTP 发件。

### 2026-11-14 时间线周列放置

REST 与 Sync 共同复用 Task 排期事务。周列跨天命令通过 `placementMode: "STRICT"` 指定半小时起点，只检查和写入源任务。原有的空槽顺延、卡片主体放置和换位继续各按原规则运行。普通插入将窗口外和零分钟任务排除出顺延集合，最后按完整区间校验碰撞。API 与两端生成类型已同步，PC 试测需要本分支后端。

### 2026-11-13 学科总览直接生成

学科总览的 JSON 和 SSE 直接入口支持 ALL、OUTLINE 和 SUMMARY。预检继续校验学科和来源归属，生成读取请求提供的资料 Markdown，经统一 Overview 流程按容量决定是否分批。

### 2026-11-13 Overview 超长输入自动分批

文件和学科的生成入口在派发前用现有估算器检查完整请求与最低输出预留。整篇适配时继续执行 CLEAN → OUTLINE → SUMMARY。CLEAN 整篇放不下时进入多批流程。清理后也会检查大纲和总结各自的请求容量，已完成的阶段可继续使用。

分批清理使用连续核心行与相邻上下文，仅应用排除区间与核心行的交集。局部大纲以清理正文行号关联原文，归并后回读对应窗口并提取关键结论和必要解释，最后统一成文。大纲和总结的中间材料仍超限时按容量分组归并，无法继续缩减时沿用 `OVERVIEW_PROMPT_BUDGET_EXCEEDED`。单个物理行超出清理容量时保留该行，后续分析可按 Unicode 边界切开。批次核心软上限为 32,000 个 UTF-16 单元，实际大小受模型窗口、请求限制和输出预留约束。多批总结按内容取舍，不指定成稿字数。

所有批次共用原任务的 Gateway、用量额度、截止时间和来源复核。公开结果仍为 Markdown v2，沿用现行保存流程。

### 2026-11-12 Overview 退役路径清理

移除旧 Writer 计划写入、节点检查点装配、无调用的中间载荷读写和内容预算规划，以及旧 preview/publication/candidateInput 接口链。新清理、大纲、总结的模型提示词与执行行为保持；正式结果继续按当前输入描述、来源修订、CAS 和回执保存。

后台作业仍有当前调用，保留候选获取、租约、用量安全检查及资源生命周期清理。旧执行数据相关的安全读取与保留期清理不属于兼容生成路径，历史表和迁移保留。下方历史 candidateInput、preview/publication 描述不再作为当前接口能力。

### 2026-11-11 知识块来源删除后的编辑

单独删除 Source 保留关联知识块及其来源 ID。`KnowledgeBlockService.update` 在所属学科和来源均未改变时允许保留已软删除的来源，标题、正文和颜色修改通过原 REST/Sync 写入入口保存。来源所有权与知识块活动、版本检查保持；新建、改绑和移科继续要求所选来源活动有效；知识块恢复保留原有学科、版本和墓碑校验。预读来源关联用于确定所需锁，知识块加锁后重新核对，避免并发改绑绕过校验。无接口字段、数据库结构或历史数据迁移变化。

### 2026-11-11 资料恢复、解析接收与下载元数据

`SourceService.restore` 为处理中的 FILE 查找当前 owner/revision 的 ACCEPTED ParsedDocument，复用 generation 并确保有索引任务；已有活跃任务不重复入队。无可复用结果时轮换 revision 并返回 AWAITING_CLIENT。READY 来源与既有非 FILE 路径保持。

复查补充：恢复将已领取的 PARSING/INDEXING job 撤销租约并置回 PENDING，保留当前 job、revision、generation、ParsedDocument 和失败计数；未领取和延后任务保留既有调度规则。worker 的 INDEXING 写入与 checkpoint/complete/fail 一样经过 claim 校验，按 Subject→Source→job 的现有锁序处理，旧执行不能覆盖恢复后的状态或新执行的 READY。

`ParsedDocumentService.complete` 在接受前核对 intent 中的源 Asset SHA 与服务端确定的实际 SHA，不匹配沿既有 PARSED_DOCUMENT_INVALID 路径拒绝，避免留下接受后不能读取的结果。既有 ACCEPTED 记录不迁移。

upload-intent DTO 在签发前要求源 SHA 非空且符合格式，OpenAPI 与双端类型同步。`AssetService.ensureSha256` 的事务对预期 DomainException 不标记回滚，使 complete 能提交 REJECTED 并返回原领域错误；未知异常仍沿现有回滚处理。此项修复不回填客户端缺失声明，也不修改历史 ACCEPTED 数据。

Asset download-url 响应增加原资产的 `originalName/mimeType`，客户端无需从 Source 标题猜测文件格式。授权范围与签名 URL 生命周期保持。接口和生成类型见 [API 契约](../contracts/API.md)，验证结果见 [当前状态](../current/Status.md)。

### 2026-11-11 Chat 错误事件断线后的终态收尾

Provider 失败后的未完成块统一在 finally 失效，逐个错误事件发送采用 best-effort；断线不阻断其他块变为 INVALID 或后续 finish。执行器及 scope 关闭仍在终态持久化之前，原有 owner fence、释放规则与持久化异常处理保持。真实入口和持久化服务回归覆盖双块断线、成功保存 FAILED 并释放槽位，以及仓储故障传播；仓储替身不证明 PostgreSQL 回滚。定向 38/38 通过，未部署或调用真实 Provider。

### 2026-11-13 Chat 流请求入队拒绝

Chat 的 MVC 执行器拒绝首次发送、点评或重试入队时，按会话、run、attempt 与 fence 结算尚未启动的尝试为 `FAILED / CHAT_ATTEMPT_NOT_DISPATCHED`，释放会话并返回现有 503。已提交的题卡答案仍可查看，点评可在原 run 重试。重放请求被拒绝时不会结算它查询的原尝试。

### 2026-11-11 Chat 迭代与工具额度

`ChatAgentProperties` 的默认及硬上限为 12 轮模型调用、20 次工具执行。`ChatAgentOrchestrator` 在最后允许轮派发前进入 `finishWithoutTools` 并添加收尾指令；工具 schema 保留以验证原生历史配对，但该轮所有新工具均不执行。模型应基于已有证据回答并说明缺口；若继续请求工具，记录未执行结果并给出限制说明后结束。自定义较小轮数也遵循同一规则。提前 STOP/READY 沿原流程结束，不额外调用总结。

工具按实际执行累计，仍支持同轮多个调用。token、费用、独立模型/embedding 调用帽、并发和期限继续独立限制；收尾不保证绕过先耗尽的其他预算。定向有效 163 项、package 通过，全量受限情况见当前状态。无 HTTP、SSE 或数据库结构变化。

### 2026-11-11 Chat 引用与重试历史归属

`ChatAgentOrchestrator` 将每轮问题及保存的引用原文合成一条模型 USER 消息，历史恢复使用相同规则并沿既有轮次裁剪。历史按 USER 顺序组织，通过 run 关联当前 attempt 的回复与工具证据；旧问题重试后的回答仍归原轮，重试原问题时不引入后来问题。旧 attempt 存储记录保留，HTTP DTO、SSE 和数据库结构不变。

定向四类测试最终有效 33 项通过：首批 32 通过，另一项测试夹具缺少工具声明，补齐后仅重跑该项通过。未部署或调用真实 Provider；验证明细见当前状态。

### 2026-11-12 Overview 总结保留核心解释

SUMMARY 根据原文讲清核心概念、机制、区别与权衡。输出从二级标题开始，每段围绕一个要点，较多并列项用简短列表。按清理后 Unicode 字符数给出篇幅参考，10000 字符及以下约 1200～1600 字符，超过约 3000～4000 字符。SUMMARY 最低输出预算使用独立的字符基准。

### 2026-11-12 Overview 通用输入预算

预算规划和 Gateway 准入共享 `unicode-category-v1`，对 Overview 的 system/user 文本按 Unicode 类别估算，代码围栏、高密度结构、长不透明串及未识别字符按 UTF-8 字节计量。请求计入每条消息开销与 CLEAN 的 JSON 响应格式开销。规则对平台与 BYOK 一致，适用于 Overview；Chat 和 Embedding 继续使用各自的计量路径。估算结果用于预留和准入，实际用量仍按现行账本规则结算。旧输入模式配置已退役。

### 2026-11-12 Overview 动态输出预算（源码与定向验证完成）

按阶段估算最低输出 token。CLEAN 为 256 加每 32 个编号行 64 token，OUTLINE 为 512 加每 2000 个清理后 Unicode 字符 256 token，两项都向上取整。SUMMARY 为 512 加 2 倍的有效目标字符数，有效目标取清理后字符数和该分支预算基准的较小值，基准在清理后不超过 10000 字符时为 1800，否则为 5000。目标预留在最低值上增加 50% 裕量，再受模型上限、可选输出上限、上下文余量约束。平台调用读取任务已结算与预留量，余额可收紧裕量，低于最低值时拒绝。BYOK 使用技术上限，最终准入和小时、每日窗口由 Guard 在预留事务内校验。Provider 的 `max_tokens` 与账本预留相同。阶段公式为启发式，输出截断继续返回原错误，输入估算和提示词保持。66 项定向通过，未部署或发起真实模型请求。证据见 `docs/archive/overview-experiments/20261112-output-budget/data/report.md`。

### 2026-11-12 Overview 清理、大纲与总结重写（源码与定向验证完成）

正式生成直接采用原文范围清理 → 重点大纲 → 结合清理原文写总结。原文按行编号，清理只接受五种排除用途和有序不交叠的闭区间；保留原文字符及位置映射。大纲和总结为 Markdown 两个独立分项，不再执行 INDEX、ROUTE 和分节 WRITER。

大纲以一个文档主题开头，使用二级标题归并正文主线，各议题用一至两个简短主题短语标明讨论范围。具体概念、类型、阶段和方法归入相关议题的条目。总结使用原文事实与限定条件，当前篇幅参考与 Markdown 组织要求见上方「Overview 总结保留核心解释」。

新接口为 schemaVersion=2 的 outlineMarkdown/summaryMarkdown，保留来源输入描述、预算结算、取消、deadline、账户/来源修订复核和正式保存的 CAS。范围校验不能识别所有模型语义误删，混合行及预告仍有实测缺口。超容量明确失败，本轮不新增尚未验证的分窗算法。旧正式数据保留但不转换为新契约。

FILE 的 OUTLINE 执行前两阶段，ALL 执行三阶段；SUMMARY 内部生成大纲但仅交付总结。原已支持的 TEXT/URL 与 Subject SUMMARY 入口保持。生成、保存、CAS、Chat 与 API/SSE 定向 139 项通过，TLS deadline 3 项通过；打包成功。非 PostgreSQL 全量 847 项中的范围内失败已修复复验，剩余两个无关断言失败、两个缺 Docker 的错误和两项跳过；未再次全量运行。未运行 PostgreSQL、真实客户端或正式入口的真实模型验收，未部署。完整命令证据见 `D:/Temp/auralis-overview-markdown-v2-implementation-20261112/report.md`，设计见[替换说明](../plans/2026-11-12-overview-markdown-replacement.md)。

### 2026-11-05 Chat 已保存 Source 总览只读工具（PostgreSQL事务边界修复）

Chat 以 `read_source_overview(sourceId,offset?,limit?,overviewVersion?)` 读取授权范围内已保存且当前有效的正式 SOURCE 总览。读取先通过当前 attempt 的 source scope/READY/revision 校验，再复用 `OverviewResultService` 的完整结果及各输入 descriptor 有效性判断；不读 SUBJECT 聚合、候选或进行中结果，也不触发生成。总览标题、大纲和三类总结信息被确定性渲染为 Markdown，按 Unicode code point 分页，返回完整 JSON；延续页必须带 `overviewVersion`，不匹配以正常 `STALE` 结果要求从第一页读取。缺失或当前无效以正常 `UNAVAILABLE` 返回，调用端可继续检索/读摘录；每页仍受原 `maxToolResultUtf8Bytes` 限制。

`list_sources` 对每个不超过 20 条的返回页批量读取正式 SOURCE 记录，并以同一当前有效性谓词生成模型可见 `hasOverview`。对于 `SOURCE_CONTENT` 来源，精确谓词会在该页最多 20 个结果上分别重建 raw input descriptor；此项有界但可能产生按来源数增长的 chunk inventory 查询。未引入向量总览索引、缓存或正式结果之外的数据源。旧 `read_outline` 不再注册；历史调用沿未知工具历史处理，不自动别名或转换。PC 的通用工具事件和名称展示路径已只读核对，本次无前端代码变化。没有 HTTP/API 路由或数据库 schema 变化。

PostgreSQL 运行态诊断发现 `readCurrentSource` 复用 `requireReadySource` 的 Source mutation owner-lock 边界；在只读事务中调用时，`SubjectLockCoordinator` 的 `SELECT ... FOR NO KEY UPDATE` 会被 PostgreSQL 拒绝。该入口使用普通 `@Transactional`，保留原有 Subject/Source 锁、revision 检查和正式结果有效性判断。`currentSourceOverviewIds` 的 `SOURCE_CONTENT` 谓词只使用当前 source 和 raw chunk inventory 的只读查询，仍为 `readOnly = true`；真实 PostgreSQL 测试覆盖这条 predicate 路径。

### 2026-11-04 Chat 真正空回复保护

正常 `STOP` 收尾时，Orchestrator 检查当前 attempt 的公开 parts：非空白正文或 `READY` 的非题卡展示组件都算有效内容；reasoning、空白正文及 `INVALID`/`GENERATING` block 不算。没有有效内容时，只追加一次受现有迭代上限约束的 continuation 指令，并沿原有投影、Provider、Gateway、取消、授权与 deadline 路径继续。若没有剩余迭代机会，或 continuation 再次空收尾，则发布短的可见说明并正常结束。有效纯展示组件可独立结束；READY 题卡仍在既有原子提交点立即结束，不生成答案泄漏或额外模型请求。

补答不创建 attempt/run，也不扩展 model/tool/token/deadline 限额。model/token/Provider/权限/版本/取消/owner 错误继续按现有失败或取消语义结束，不被包装成成功。无新增公开字段、API/SSE schema、数据库结构或前端动作。定向验证 22/22，主 Agent 唯一只读 reviewer：BLOCKER=0、IMPORTANT=0、OPTIONAL=0；命令与范围见 `D:/Temp/auralis-chat-agent-loop-evolution-20261104/step6.md`。

### 2026-11-04 Chat 目录文档定向搜索（源码、定向验证与review完成）

`search` 保持一次 query embedding 和当前 attempt 的授权快照；可选 `sourceIds` 只允许选择 READY/owner/subject/revision 范围中的非空、唯一、最多 100 个来源。显式空值、空数组、重复项、非法 UUID、未知参数或模型明确指定快照外 ID 返回可修复 `CHAT_TOOL_ARGUMENT_INVALID`；该请求不查询也不返回越界资料，修复仍在原快照内进行。若内部读取结果越界或实际 owner、READY、subject/revision 校验变化，继续按 `SOURCE_SCOPE_DENIED` 或对应版本/范围错误终止，不做交集、不扩大范围。SUBJECT 请求的客户端 `sourceIds` 仍禁止；native search 参数是单次调用缩窄。检索前后继续验证授权快照，`RetrievalService.retrieveWithinSources` 独立校验 owner、活动来源、READY、subject（有 subject 时）和最多 100 个唯一 ID，再复用现有跨来源候选合并。

此变化只闭合 Catalog sourceId 到合法 search chunkId 的能力，不调整 topK、embedding 额度或检索排序；未引入关键词/BM25/RRF/reranker。当前没有真实资料漏召回或排序对照证据，真实中文术语、自然语言及跨文档检索质量仍待标注样例验收。定向测试使用可控向量仅证明 source 隔离和真实 chunk ID 输出，不代表语义质量提升。

最终验证：`mvnw.cmd -B -ntp "-Dtest=AiRetrievalTests,ChatReadToolsCatalogTests,ChatAgentProtocolPublicationTests" test` exit 0，30/30；随后增强 Catalog→search 集成用例以实际读取 Catalog ID，重跑 `mvnw.cmd -B -ntp "-Dtest=ChatReadToolsCatalogTests" test` exit 0，8/8。目标差量 `git diff --check` exit 0。唯一只读 reviewer 复核 BLOCKER=0、IMPORTANT=0、OPTIONAL=0。未调用真实 Provider、未部署、未操作业务数据库。

### 2026-11-04 Chat 学科资料目录发现（源码、定向验证与 review 完成）

Chat 读取工具在 attempt 开始时冻结 owner、subject、READY 状态与 ingestion revision 范围，并保留轻量文档快照。`SUBJECT` 范围新增只读 `list_sources(offset, limit)` 工具，默认每页 20、最多 20，只返回真实 source ID、标题、revision、范围内总量、`hasMore` 和 `nextOffset`。目录是快照分页，不能扩展到快照之外的资料；使用前后复用来源范围与版本校验，批量校验不逐文档查询。首版不带摘要/outline、不读外部存储、不依赖 Overview。

系统提示要求 SUBJECT 下的资料分布/跨文档覆盖任务按需发现目录；目录分页只证明已检查的清单项，不代表正文已全部阅读。不得向用户输出 `hasMore`/`nextOffset` 等内部分页字段；模型应自然说明实际读取了哪些资料或片段及覆盖范围。Catalog 标题是不可信数据；`sourceId` 可用于 `read_source_overview`、与真实 `chunkId` 一起用于 `read_source_excerpt`，或作为 `search.sourceIds` 在当前授权范围内缩窄搜索。目录不注入受保护的 required context，仍由现有 mapped-request 容量检查约束。SUBJECT 请求的 `currentSourceId` 必须为空、`sourceIds` 必须为空数组，否则在读取范围建立时返回 `VALIDATION_FAILED`。当前 PC 默认 SUBJECT 的请求集成历史记录于对应 handoff；本轮 conversation scope 前端接入由用户完成。

`ChatReadToolsCatalogTests`、`ChatAgentProtocolPublicationTests`、`DisplayToolPayloadValidatorTests` 定向合计 22/22 通过，覆盖READY/subject/selected/current-source范围、SUBJECT非法ID拒绝、revision变化、分页、工具注册与真实Provider请求入口。唯一只读 reviewer 复核 BLOCKER=0、IMPORTANT=0、OPTIONAL=0，见 `D:/Temp/auralis-chat-agent-loop-evolution-20261104/step4-review.md`。未调用真实 Provider、未部署、未操作业务数据库。

### 2026-11-04 Chat 当前轮工具证据分层压缩（源码、定向验证与 review 完成）

`ChatEvidenceHistoryProjector` 在真实 mapped request capacity evaluator 上处理当前轮成功资料读取结果：先按 source/chunk/revision 与完整行内容去重并留下省略计数，再复用旧 history 折叠/删除规则，之后按确定顺序缩短较早结果摘录及已保存总览文本，必要时仅保留来源、revision、overviewVersion 与分页等识别 metadata。最新读取结果优先保留。仅处理 search/read excerpt/read source overview 成功结果；display/activity/error/control 与系统、当前问题、选择上下文、题卡提交和授权 scope 都在保护集内。压缩仅作用于 provider request 投影副本，私有 evidence 原账本不变，native tool-call/result 继续按 ID 成对保留。

投影按 iteration 顺序验证完整 native assistant tool call/result 配对和 reasoning 映射；call id 仅在该配对组内使用，不能跨 iteration 合并。无法无损定位配对时不压缩该组。最终仍不适配时复用相同 evaluator 返回的真实维度/actual/limit，日志仅记历史、受保护当前上下文、当前工具结果与参数等数值分层；随后使用既有 `AI_REQUEST_BUDGET_EXCEEDED` 在 reservation 与 Provider dispatch 前拒绝。正常工具额度耗尽时沿现有最后迭代收尾，不再执行新工具；收尾指令优先于修复旧工具错误，只有当前 attempt 尚有工具和迭代额度、且未发出收尾指令时才允许纠错。流程仍受原有调用、迭代、任务额度与 deadline ledger 约束。没有摘要模型、额外限额、API/SSE/数据库字段或跨资料 scope 扩展。

验证：`mvnw.cmd -B -ntp "-Dtest=ChatEvidenceHistoryProjectorTests,ChatAgentProtocolPublicationTests,ChatAgentOrchestratorPublicationTests,ChatDisplayToolArgumentRepairTests,AiInvocationGatewayTests" clean test` exit 0，48/48 tests，0 failures/errors/skips；生产与测试源码均经 clean compile。`git diff --check` 目标 tracked 文件 exit 0，step3新增的 untracked display-tool test 无尾随空格。唯一只读 reviewer 最终差量复核 BLOCKER=0、IMPORTANT=0、OPTIONAL=0；命令、归因和边界见 step3 report。

### 2026-11-04 Chat 请求容量拒绝诊断（源码完成，定向验证通过）

Gateway 对映射后的完整 `AiProviderRequest` 执行现行容量拒绝时，只在最终拒绝路径记录一条结构化 warning，包含拒绝维度、该维度实际值/上限、完整序列化请求 UTF-8 字节、按 `SYSTEM`/`USER`/`ASSISTANT`/`TOOL` role 汇总的正文 UTF-8 字节、reasoning content 与 tool-call 参数 UTF-8 字节、tool definition 数量与序列化 UTF-8 字节。role 正文字节可解释现行消息正文容量的来源，但不能加总推导完整序列化请求大小：工具参数、定义、字段名、JSON 结构与转义由独立统计/完整序列化值反映。Gateway 的 mapped request 不含可靠的历史/当前轮边界；`USER` role 也可能表示追加的选择或活动消息，因此不从 role 推断 current question 或 current-turn evidence。准确区分留待掌握上下文边界的 projector 阶段处理。

日志不记录 prompt、正文、工具参数值、凭据或模型响应。历史投影的试裁剪检查和通过容量检查的请求不计算这些附加分桶、不发警告。拒绝维度、限额、`AI_REQUEST_BUDGET_EXCEEDED`、预算/次数逻辑及 Provider 预留和派发边界保持不变；不增加公开字段、HTTP 行为或持久化结构。

`AiChatRequestCapacityTests` 与 `AiInvocationGatewayTests` 合计 28/28 通过，覆盖各类 UTF-8 分类、拒绝实际值/限额和实际 Gateway 拒绝日志脱敏；目标文件 `git diff --check` exit 0。唯一只读 reviewer BLOCKER=0、IMPORTANT=0、OPTIONAL=0；未调用真实 Provider、未部署、未执行 GUI 或业务验收。

### 2026-11-04 Chat 资料读取容错与回答收敛（源码完成，定向验证通过）

Chat read tools 仅将可识别的 `CHAT_TOOL_ARGUMENT_INVALID` 与 `read_source_excerpt` 的 `RESOURCE_NOT_FOUND` 转为安全 native tool result；错误后必须再次验证本 attempt 的 owner source scope 与 revision。模型参数明确引用快照外 ID 属于可修复参数错误；内部返回越界资料、实际权限/READY/revision变化、取消、预算、Provider 和系统错误仍按原失败路径处理。每个 attempt 最多接纳一次读取错误后的纠正；第二次错误要求模型停止工具调用并按已收到证据收尾，若模型仍请求工具，后端不执行并在复核 scope/owner 后给出明确资料不足说明。原 `tool.error` SSE 仍只标记单个工具失败，不结束 run；工具调用和结果按现有私有 evidence/history 路径配对。

检索为空或明显无关时，prompt 允许一次改写或线索定向查询；仍无支持时停止检索，严格依资料请求不补一般知识。历史投影把修正/收尾状态表述为前次 attempt 的结果，不限制新 attempt。没有新增 route、公开字段、SSE schema、数据库字段、全局配置或检索架构。本条未改变 PC/Mobile，未部署，真实 Provider 行为待验收。

验证：`mvnw.cmd -B -ntp "-Dtest=DisplayToolOrchestratorTests,ChatEvidenceHistoryProjectorTests,ChatAgentProtocolPublicationTests" test` exit 0，22 tests / 0 failures / 0 errors / 0 skipped；追加历史 `repairable=false` 收尾历史用例后，`mvnw.cmd -B -ntp "-Dtest=ChatEvidenceHistoryProjectorTests" test` exit 0，8/8；目标差量 `git diff --check` exit 0。首轮曾发现 projector 缺 import 与测试筛选断言问题，均在最终结果前修正。唯一只读 reviewer BLOCKER=0、IMPORTANT=0、OPTIONAL=0。全量 suite、package、真实 Provider、部署和 GUI 未运行。

### 2026-11-04 Auth 用户资料头像存在提示

`UserView` 新增必填布尔值 `hasAvatar`。统一构造器按当前用户在 `user_avatars` 中是否有行查询，因此注册/登录/刷新 `AuthResult`、GET `/api/auth/me` 和 PUT `/api/auth/me` 一致反映当前持久化状态。该提示不新增 schema 字段或 Flyway migration，也不递增用户 profile version。上传/删除头像仍为 HTTP 204，头像 GET 无头像仍为 404；客户端以该提示减少无头像 GET，并处理跨设备删除/竞态下仍可能出现的 404 fallback。

`AuthControllerTests` 16/16、`OpenApiArtifactTests` 17/17（含必填字段断言）通过，官方 OpenAPI artifact 已同步。专用 loopback trust-auth/tmpfs PostgreSQL + test-only TLS 全量执行 1063 tests / 3 failures / 0 errors / 2 skipped；仅有已知 `AiFeaturePolicyParityTests` stage 数、`TaskColorRemovalMigrationTests` V42 对实际 V43、`OverviewIdentityPostgresIntegrationTests` V41 对实际 V43 三项断言失败。`mvnw -B -ntp -DskipTests package` exit 0。唯一只读 reviewer 结果 B0/I0/O0。命令与日志见 `D:/Temp/auralis-avatar-presence-20261104/implementation.md`；全量不代表业务 GUI 或真实账号验收。

### 2026-11-04 学科总览批量状态（源码完成，未部署）

新增 `POST /api/overview-results/subjects/statuses`，在现有 OverviewResult 模块内提供最多 100 个输入 ID 的有界批量只读状态。结果记录按 owner/scope/IDs 批量读取，空记录跳过 manifest 构造；活动/归属通过 Subject 公开服务检查，当前结果沿用现有输入有效性判断。AVAILABLE/MISSING/UNAVAILABLE 状态、版本和时间语义见 API.md；无新数据库字段或迁移。PC 接入由用户实施，详见[交接](../plans/2026-11-04-overview-batch-status-handoff.md)，后端新增接口本身不会自动替换旧客户端请求。

批量入口使用 `Propagation.NOT_SUPPORTED`，避免失效来源的既有嵌套读取异常把整个批量查询标记为 rollback-only；各依赖保留自己的读取事务。活动学科通过 owner/active/IDs 投影批量获取，结果作为读取时提示，详情与写入仍做原有校验。Controller 与 OpenAPI 定向检查 23/23 通过，唯一只读审查 BLOCKER=0、IMPORTANT=0；全量检查及打包结果见当前状态。

### 2026-11-03 PC 验收后端修复（源码候选，定向验证通过，全量另记）

- `AiUsageGuard.reserve` 在现有数据库锁事务中合并限制同用户 SOURCE_OVERVIEW/SUBJECT_OVERVIEW 的有效 RESERVED 占用，最大 `max(1, perUserConcurrent-1)`；用户与全局总上限不变。默认用户上限 2 时总览最多占 1 槽；单槽配置仍可运行总览，但不保证 Chat 即时可用，全局繁忙仍可拒绝。
- Overview completion 仅在 reservation 尚未建立且并发准入不足时有界等候：每实例最多 4 个等待者、最多 120 秒，事务外等待；超限保留 AI_CONCURRENCY_LIMIT。每次尝试重核 scope，已绑定的生成重核 source/owner/deadline，派发前再核对并重新计算剩余响应时间。取消、额度不足、Provider 已派发失败均不作为容量等待重试；等待不创建 reservation、不扣 token、不增加 ledger 调用数。
- Review 生命周期在已 flush 的 state 上 refresh 数据库表示，再冻结新回执；不改旧命令回放或 occurredAt 指纹。无新接口字段、数据库迁移、运行配置或部署。
- PC 端复习旧锚点与误冲突恢复、取消排期队列由用户实施，见 [交接](../plans/2026-11-03-pc-review-unschedule-handoff.md)。后端修复不代表既有本机冲突已经恢复或真实 GUI 已验收。
- 合并定向 164/164，含 Overview 89/89、ReviewLifecycle 15/15、隔离 Testcontainers PostgreSQL 2/2（独立事务复习回执/历史及锁门闩下两路总览与 Chat 准入）；后续容量标记修正的受影响集合 53/53。唯一 Luna reviewer 的 IMPORTANT 已关闭，未发现未关闭 BLOCKER/IMPORTANT。编译及最终 package 通过；全量首轮 1062 项为 2F/48E/7S，环境受阻类补验 43 项为 42 passed/1F/0E，仍有策略/迁移断言失败，最终状态见 Status.md。所有命令证据位于 `D:/Temp/auralis-pc-three-fixes-20261103/luna-validation.md`，未调用真实 Provider、未部署。

### 2026-11-03 Chat admission PostgreSQL 并发测试

新增 opt-in `ChatRuntimeConcurrencyPostgresIntegrationTests`，在真实 PostgreSQL 17 事务中验证同会话 turn/turn 与 turn/READY activity_submission 竞争下 conversation 行锁、slot admission 和题卡 submission 原子性。独立 JDBC gate 等待两个 admission backend 经 `pg_blocking_pids` 证实处于 conversation `FOR ... UPDATE` 锁等待链后才释放；两场景定向 2/2 通过。测试直接调用 `ChatRuntimePersistenceService.admit`，AI Provider 关闭，不运行 Orchestrator；专用临时容器使用 tmpfs 和随机映射端口，细节见[当前状态](../current/Status.md)。

### 2026-11-03 Chat 提示、自然组件选择与单次修正反馈（源码候选，未部署）

`ChatAgentOrchestrator.SYSTEM_PROMPT` 按主题使用中文表述，默认中文教学回答，并偏好以简明中文呈现 Provider 原生可见 `reasoning_content`；代码、API 名称、工具名称、Schema 键与协议标识原样保留。保留资料相关性与授权边界、原生 `tool_calls`、正文/组件职责、图表数值来源及活动规则。用户明确要求结构化视觉内容时调用对应 `render_*`；同时表达“带我走一遍过程/追踪状态变化”“对比概念/怎么选/代价差异”“规划学习路径/先学什么/拆解主题”等自然意图时分别优先选 `render_steps`、`render_compare`、`render_roadmap`，并保留有序性、对等共同维度、阶段依赖条件；普通并列清单、短答澄清仍可使用普通 Markdown。需要调用 `render_steps`、`render_compare`、`render_roadmap` 或 `render_chart` 时，单次请求迭代中工具前最多写一句简短过渡，并立即发出原生 `tool_calls`；收到服务端 TOOL 结果并进入下一次模型调用后，继续完整 Markdown 背景说明与深入讲解，无需逐项复述组件内容。Activity READY 仍结束业务回合。用户要求考查、检验理解、练习、巩固或复述检查时，即使未点名卡片，也按选择题 `render_quiz` 或开放回答 `render_question` 创建活动。本轮更精确限定该过渡与后续正文措辞后，`ChatAgentProtocolPublicationTests` clean 重编译定向运行5/5通过；真实 Provider 遵循与部署未验证。

六个展示工具与三个资料工具的 description 使用中文并补足对应自然触发语；工具标识及 Schema 字段、枚举、约束不变。首次可修复的 display schema/语义拒绝触发后，同批更高 index TOOL result 现在包含固定重试 hint；历史 `ChatEvidenceHistoryProjector` 仅在 `not_executed/CHAT_TOOL_NOT_EXECUTED/PREVIOUS_DISPLAY_ARGUMENT_INVALID` 白名单状态下按服务端常量重建该 hint，不透传任意历史 hint、arguments 或 reference。当前和历史均保持原生 call/result 配对。一次修正预算与 finish、取消、source/fence、预算门禁不变；Activity READY 仍是 terminal barrier。没有改变公共 HTTP/SSE 字段、Schema、数据库或 Provider 行为。最终定向四类测试共 25/25、0 failures/errors/skips；命令与报告见[当前状态](../current/Status.md)。源码候选未部署，提示遵循和端到端客户端行为未验收。

### 2026-10-31 Chat 历史 tool exchange 与展示提示增量（源码候选，验证待执行）

历史私有 evidence 对每个 iteration 始终还原为原生 assistant tool_calls 和按 call id 配对的 ToolExecutionResult；reasoningContent 不再决定是否保留调用协议。仅显式持久化的 reasoning 通过独立映射回传。预算折叠缩减旧工具结果内容但保持调用/结果成组；若仍超限才按既有策略移除完整较旧 evidence。历史 assistant `MessageView.content`（含公开 Markdown 投影）不改写，因此可能与结构化工具上下文并存。SYSTEM prompt 与六个 display tool descriptions 将组件约束为简短、高密度结构骨架，教学解释留在 Markdown 正文；steps 仅用于有序程序/状态流/因果链，compare 用于至少两个对等主体的共同维度，roadmap 用于有依赖的阶段。明确请求的理解检查、练习或巩固通过相应 activity tool 生成，完成核心概念后可作为自然 checkpoint；局部澄清、未消化补讲和纯导航轮不机械追加。依赖指定资料且上下文不足时先取回相关资料，不基于尚未返回的检索结果声称组件依据。仍使用真实 provider tool_calls；未加 schema 字段校验、工具调度或生成轮次规则。本轮定向 `ChatAgentProtocolPublicationTests` 结果见状态文档；完整后端套件及真实模型遵循未验证。

### 2026-10-31 Chat 展示工具重写（源码候选，统一验证待执行）

Chat 结构化内容现由六个 provider function tools 生成：`render_steps`、`render_compare`、`render_roadmap`、`render_chart`、`render_quiz`、`render_question`。Data search/read 工具保持独立。展示工具只本地校验参数并生成 Markdown/public parts，不查询领域数据；增量 arguments collector 只发布完整且已校验的 meta/stem 与 item/options。完整参数再经严格 JSON、重复键拒绝、字段白名单和组件 schema 校验；final 与 preview 不一致时失败，已公开有效行保留在 INVALID block。普通 content 全部作为 Markdown text segment，marker 字符串不触发解析。

Visual 工具通过现有 owner fence 持久化公开 part 与私有工具证据后发布 `block.completed`，以极简 rendered tool result 接续模型循环。Activity 工具只接受第一张按 provider index 排序的有效题卡，题目及可选 private reference 经 source/fence 校验后与 READY 快照在同一事务落库，再发布 completed/ready 并短路本轮模型调用；其后已 preview 的 display block 持久化为 INVALID。Data/Visual 可在 Activity 前按工具序执行。provider 非正常终态、取消、参数错误、owner/source fence 失败均不发布 READY；run reader 退出后才释放执行 slot。展示工具计入既有每 attempt 20 次 tool-call 上限，不计作额外模型/embedding 请求。

完整正常 `tool_calls` 批次中，已注册 render tool 的严格 schema/语义 validator 首次拒绝可生成一次 attempt 级修正反馈。反馈只含固定错误码、安全字段路径和缺少的必填字段；JSON 语法、provider/preview/身份门禁、source/fence、取消和预算错误不触发修正。坏 block 保持 `INVALID`，该批更高 index calls 以固定 `not_executed` result 与原调用配对后跳过；其中的 Activity 不会 READY。原 assistant calls/result 一并进入当前和私有历史 evidence。再次出现参数拒绝走原失败路径；反馈轮使用现有 model/iteration/tool/token/deadline限制。无新增 API 或数据库字段。

本轮四类定向命令执行25 tests、0 failures/errors/skips：修正行为2/2、payload validator11/11、history projector7/7、`ChatAgentProtocolPublicationTests`5/5。该历史工具测试的 synthetic run 显式 stub execution owner 与未取消状态，避免250ms heartbeat取消执行。只读review B0/I0。真实 Provider、source/fence/cancel异常、部署和 GUI 未验收。

`ChatStreamParser` 与旧 `:::auralis-*` 正文协议已删除；旧历史记录保留原样，不自动转换或 fallback。字段/event schema、限制、示例及 PC handoff 以 [Chat Runtime API](../contracts/chat-runtime-api.md) 和[重写计划](../plans/2026-10-31-chat-display-tools.md)为准。诊断参数捕获 `auralis.ai.chat-agent.raw-content-capture-enabled` 默认 `false`，仅捕获展示工具 arguments，沿用每 attempt provider response byte cap。focused backend suite 126/126 通过，review B0/I0。受限全量排除 CPU 卡死的 `IngestionBudgetCalibrationTests` 后仍为 1036 tests/3F/2E/2S、exit 1，三项既有版本/策略断言失败与两项缺 TLS keystore 错误见当前状态记录；单独补参数的 `OverviewDeadlineSlowDripTests` 3/3 通过。`-DskipTests package` exit 0。真实模型、前端 GUI 与部署尚未验收。

### 2026-10-31 Chat 请求容量门槛一致（源码候选，未部署）

Chat 历史投影与 Gateway 预留前校验共用 `AiChatRequestCapacity`：对最终映射的完整 `AiProviderRequest` 检查序列化 UTF-8 字节、所有消息正文 UTF-8 字节和单条 tool result UTF-8 字节。投影会先按原策略折叠/删除较早历史；不可裁的当前/必需内容仍由 Gateway 返回既有 `AI_REQUEST_BUDGET_EXCEEDED`，且拒绝发生在 reservation 与 Provider dispatch 前。Gateway 的 `maxTokens` 输出上限校验仍在 `boundedRequest` 独立执行，不会通过删历史规避；Token 任务额度/调用数及非 Chat/Overview 容量策略不变。容量拒绝外部错误码和 0/unlimited 配置语义不变。`AiChatRequestCapacityTests`、`AiInvocationGatewayTests`、`ChatEvidenceHistoryProjectorTests`、`ChatAgentModelAdapterTests`、`ChatRawContentCaptureTests` 合计 39/39；`mvn -B -ntp -DskipTests package` BUILD SUCCESS。未改 token 额度或容量环境设置，未调用真实 Provider、未部署。

### 2026-10-30 Chat 可视化教学组件选择提示（源码候选，未部署）

`ChatAgentOrchestrator.SYSTEM_PROMPT` 在既有协议格式规则之外，增加组件选择指导：明确可视化请求优先；有意义的流程选 steps、同维度多方案比较选 compare、学习阶段有依赖时选 roadmap；chart 使用用户给定或已收到相关证据支持的数值，假设示例须明确标注，不把编造数值说成事实；quiz/question 仅在适合检验理解时放在回答末尾。复杂解释通常选一至两种最有用的结构；简短事实、澄清和闲聊不强插组件，正文与组件互补且避免重复。生成是模型判断，提示不保证每次输出组件。最终 focused 命令中 parser 20/20、projection 3/3、Orchestrator mapped-request 方法 1/1；`-DskipTests package` 成功。本轮未运行完整 `ChatAgentProtocolPublicationTests`。未改变 schema、工具权限、调用/检索预算或控制流；真实模型遵循情况未验证。

### 2026-10-30 Chat quiz 渐进发布与有限 JSON 容错（源码候选，未部署）

Quiz parser 在 `block.started` 即创建 block 外框；题干和选项按完整 NDJSON 行分别经 `block.item` 发布，完整 quiz 在 `:::` 正常闭合且 stem、至少两条唯一 key 的选项有效时即可 READY，无须 private reference。合法 reference 仍只存服务端私有列并供后续 LLM turn 使用；模型负责题目语义，Server 不判分。已解析出 `type=reference` 但其字段/语义无效时，保留完整公开 quiz 并记录安全枚举诊断；无法解析的 JSON 行仍使 block INVALID。

严格 JSON 行解析失败后仅尝试一次局部 Jackson `ALLOW_TRAILING_COMMA` 读取；返回节点仍经过同一结构 schema 和 allowlist。不会补引号、括号、字段或选项，不改原行，不作用于普通 Markdown；诊断仅记录 `JSON_REPAIRED` 等枚举和安全标识，不带原文。未改变 SSE envelope、API route 或 DB schema。

### 2026-10-31 Chat 组件多行 JSON 收集（源码候选，未部署）

`ChatStreamParser` 在组件内部按字符串/escape 与 `{}`/`[]` 嵌套状态收集一个 JSON object；chunk 与换行不会触发对未完成对象的解析。闭合对象在当前物理行剩余字符仅为空白时，立即走现有 strict parse、局部 trailing-comma retry、schema 和 allowlist 路径，公开完整 row 仍逐项 `block.item`。协议仍推荐一行一项；一行多个对象拒绝。原物理行 `maxLineChars` 与整 block `maxBlockChars` 都保留，单对象累计字符也受 `maxLineChars` 限制。字符串内的括号、markers 与转义引号不作为边界；JSON 字符串跨物理换行、marker 前未闭合对象和 EOF 截断都不 READY。已有有效公开 row 在后续错误时仍保留于 INVALID block。

不改变 SSE 事件 shape，PC 继续消费既有 `block.started` / `block.item` / `block.completed`。该修复对应多行 JSON 逐行解析这一种可复现局限；原始历史 Provider 输出无法恢复，因此不宣称已确认既有空卡的历史根因。`ChatStreamParserTests` 24/24、`ChatPublicProjectionTests` 3/3、指定 Orchestrator publication 方法 2/2（合计29/29），`mvn -B -ntp -DskipTests package` 成功。完整 `ChatAgentProtocolPublicationTests` 类未运行；无真实 Provider、部署、业务数据库或 GUI 验收。

定向验证：`ChatStreamParserTests` 20/20；`ChatPublicProjectionTests` 3/3；本次两个 Orchestrator publication 用例 2/2；合并命令共 25/25。`-DskipTests package` 成功。完整 `ChatAgentProtocolPublicationTests` 有一个未解决的既有失败：`successfulToolEvidenceIsPrivateAndRestoredIntoTheNextTurnProviderRequest` 断言 `privateToolEvidenceJson` 含工具证据，实际为 `[]`；本次未放宽或修改该断言。未运行全量测试；无真实 Provider、部署或 GUI 验收。

### 2026-10-30 Chat 检索收敛与 compare 语义（源码候选，未部署）

`ChatAgentOrchestrator` 的实际模型 SYSTEM prompt 要求先判断当前问题是否依赖用户资料；普通通识问题直接回答，除非用户要求基于来源。来源问题按片段是否支持具体问题判断相关性；只得到无关结果时停止同义词盲搜，如实说明已搜来源未找到支持内容；用户要求严格基于资料时不改用通识答案。可信相关线索仍可继续定向检索或读取。该指导没有增加固定 search 次数帽，不改变既有工具、task 与 iteration 限制；检索返回内容仍是不可信数据，不是指令。

Compare item 表示一个比较维度：`{title,entries:[{label,text},...]}`，至少两条 entry 且 label/text 非空；每个维度是一条 NDJSON 行，公开 part 和 Markdown 都按标题后纵向列出条目。Parser 严格校验并丢弃未知字段；旧 title/description-only compare 不兼容、不自动迁移。Steps item 保持原有 title/optional-description。没有 DB schema、API route、OpenAPI/SDK 或 migration 变化。完整 SSE/history handoff 见 [Chat Runtime API](../contracts/chat-runtime-api.md)。

Compare parser/projection 定向 20/20 通过，package 成功。`ChatAgentProtocolPublicationTests` 为 3/4；唯一失败在既有工具证据测试断言 `privateToolEvidenceJson` 实际为 `[]`，发生在该用例的后续 SYSTEM prompt capture 断言之前，因此本轮未取得 compare prompt request-capture 证据。该失败未在 compare 范围内修改；只读 reviewer 对 compare 源码差量 B0/I0/O0。真实模型、前端/GUI验收尚未做。

### Chat SSE 请求期限（2026-10-30，源码候选未部署）

`POST /api/ai/messages/stream` 与 run attempts retry 均在同步 admission 成功后、返回 `StreamingResponseBody` 前将当前 `WebAsyncRequest` timeout 设为 `0`，避免 Spring MVC 默认约30秒 async timer 截断长时间 Chat 思考/工具过程。该设置只作用于当前 Chat SSE turn/retry，不改变 Overview 或其它异步路由；admission 冲突仍在 SSE response 创建前返回。Chat 自身既有可配置 `attemptDeadlineSeconds`（当前300秒）、取消与执行/Provider reader cleanup 保持为生命周期边界。反向代理无持续输出时仍可能在约60秒默认 read timeout断开；部署后须分别验证长空窗、取消和客户端断流。

### Chat 通用失败诊断（2026-10-30，候选未部署）

`ChatAgentOrchestrator` 对既有 `FAILED` 收尾记录 `CHAT_RUN_FAILED` WARN，字段限于 run/attempt、iteration/iterationId、stage、safe error code、异常与 cause 类名、cause 链中首个 `com.auralis.app.*` stack frame 的 class/method/line。不会输出 throwable、异常消息、prompt/content/reasoning 或工具原文。现已在该入口为 `AiUsageLimitException` 加稳定码格式校验并保留 `AI_TASK_BUDGET_EXCEEDED` 等预算码；普通本地异常仍为 `CHAT_RUN_FAILED`，其它终态、usage/计费和 fencing 不变。Chat Agent provider reservation 分别由 `AURALIS_AI_CHAT_AGENT_MAX_MODEL_CALLS` 与 `AURALIS_AI_CHAT_AGENT_MAX_EMBEDDING_CALLS` 管理，0 表示不设次数帽，负数拒绝启动；两项 all-origin/platform stage 配额均使用独立设置，聚合 task 调用帽关闭，平台 token 预算继续生效。默认模型/embedding 次数不设帽；12 次 iteration（末轮收尾）仍限制每个 attempt 的模型循环轮数。retry 沿同一个 run ledger 继续计数。Run status 的 `accountingSummary` 提供跨 retry 的 `modelCalls` / `embeddingCalls`，以及按当前 attempt trace 去重后的 `currentAttemptToolCalls`；工具调用次数仍受独立 `AURALIS_AI_CHAT_AGENT_MAX_TOOL_CALLS` 限制，当前20且按 attempt 计。源码及自动验证候选未部署。

### 2026-10-30 Chat reasoning 流与按 operation thinking（源码候选，未部署）

- `AURALIS_AI_CHAT_THINKING_ENABLED=true` 仅由服务端 `CHAT_AGENT_TURN` 注入 Chat provider request；`AURALIS_AI_OVERVIEW_THINKING_ENABLED=false` 按可信 Overview feature 注入 Source/Subject Overview 的全部 completion stage。两项均为请求级不可变选项，不经客户端 DTO、共享全局状态或 ThreadLocal；旧 `AURALIS_AI_THINKING_ENABLED` 继续服务其它既有调用。thinking 字段只对 DeepSeek 和 host 精确为 `api.xiaomimimo.com` 的 OpenAI-compatible endpoint 发送。
- Provider 仅读取上游显式 string `delta.reasoning_content`，通过 `reasoning.delta {text}` 作为独立 SSE 事件发布；不送入 `text.delta`、Chat parser、Markdown/content parts。reasoning 与 `tool.started/completed/error` 在同一 SSE sequence 中均属于过程区，正文/可视化回答区仍接收 `text.delta`/block events。
- Thinking tool protocol 要求回传历史 assistant `reasoning_content`：当前 run 以 tool-call id 关联内存映射，跨 run 同 iteration reason 仅写入既有 `private_tool_evidence_json`，供 provider history request 配对回传；不进 public parts、message content、status/detail/toolTrace 或日志。无 reasoning 的旧/非 thinking 工具证据改为中性事实数据投影，不构造无配对 tool result。
- 历史折叠的每个候选容量检查使用与派发相同的 `AiProviderRequest`，包含候选 iteration 的 reasoning passback 和 tool definitions；超预算的旧 iteration 按完整 assistant/tool 组移除，不截断 reasoning 或保留孤立 tool result。
- Reasoning bytes 计入现有 provider 总响应字节上限；completion usage 缺失时沿用 bounded `maxTokens` 保守结算。此变更未新增 DB 列或 migration。测试与部署边界以当前状态/审查记录为准。

### 2026-10-30 Chat quiz parser 诊断日志（源码候选，未部署）

### 2026-10-30 Chat quiz parser 诊断日志（源码候选，未部署）

`ChatAgentOrchestrator` 在 `ChatStreamParser.BlockError` 时记录 WARN：run/attempt/block UUID、component、原 parser `ErrorCode` 与已解析有效行数。日志不带原始模型输出、题干、选项、私有答案/explanation 或工具参数；公开 SSE 继续使用通用 `CHAT_BLOCK_INVALID`。Parser/Orchestrator 合成分片测试确认 valid quiz 的 stem/options/reference schema 可正常形成 READY；此次不改变 parser、activity 状态、API 或数据库结构。运行态空卡的具体模型输出根因仍未确认，日志增强仅提供下次错误归因证据。定向 17/17 与 package 成功；未部署、未请求真实 Provider、未写业务库。

`ProviderHttpClient` 的 SSE 失败日志按 `http_status`、`provider_frame_json`、`provider_frame_protocol`、`consumer_callback`、`transport` 标记阶段；只记录稳定错误码、异常类和 cause 类，不记录 request/response body、异常消息、prompt、reasoning 或凭据。OpenAI-compatible stream 的内部诊断异常在 Provider 边界仍映射为既有 `MODEL_PROVIDER_ERROR`；真实上游错误正文保持不采集，因此这组日志用于区分 HTTP 状态、帧解析和本地回调，不保证得知 Provider 拒绝原因。自动化用合成 HTTP/SSE 验证脱敏与错误分类；源码未部署。

`ChatAgentModelAdapter` 按 index 累积工具名与 arguments；只有 SDK `PartialToolCall` 必需的非空 name/arguments 到齐后才发 partial callback。完整工具仍须通过既有 terminal/schema 校验后才形成 complete callback。langchain4j-core 1.22.0 合成首片 id-only、arguments 先到和并行 index 测试覆盖增量顺序；不改变 Provider、SSE/API、工具执行或 invalid-terminal 契约。

### 2026-10-29 Chat protocol 1 runtime（后端代码候选，定向验证通过）

### 2026-11-04 Chat UNKNOWN 显式终结（源码、定向验证与只读审查完成；未部署）

- 增加 `POST /api/ai/conversations/{conversationId}/runs/{runId}/attempts/{attemptId}/recover`，返回既有 `ChatRunStatusView`。服务端按 conversation→run→目标 attempt 的行锁顺序校验复合 owner、active run 与 current attempt；不自动派发，也不因 deadline 推断 Provider 已停止。
- 无已提交 READY/SUBMITTED activity 时 fence 并将目标 UNKNOWN 终结为 FAILED/`CHAT_UNKNOWN_ABANDONED`，保留公开正文、有效展示行和私有 evidence，仅将 GENERATING block 标为 INVALID；usage task、reservation 与 charged ledger 不清零、不退款。已有 READY/SUBMITTED activity 则修复为业务 COMPLETED，保留 activity/private reference。
- 已解决 target 的重复或迟到恢复请求只读返回当前 run 状态，不改较新的 attempt 或其他 run；恢复后的 conversation fence 阻止迟到 worker 发布。`CHAT_RECOVERY_NOT_ALLOWED` 映射为 HTTP 409。无数据库字段或 migration 变化。
- 定向 controller/persistence/error/OpenAPI 46/46，PostgreSQL 4/4，OpenAPI export/artifact 18/18；唯一只读 reviewer B0/I0/O0。最终完整 Maven 为 1090 tests / 3F / 0E / 2S，失败仅为已知 OverviewIdentity V33、TaskColor V42 期望版本断言和 AiFeaturePolicyParity stage 断言；`-DskipTests package` 成功。首轮的 Source 删除版本冲突未在隔离3/3或最终 full 复现，报告仅记录了 stale baseVersion/INDEXING 现场，不认定具体触发者。完整命令、日志和未覆盖边界见 `D:/Temp/auralis-chat-agent-loop-evolution-20261104/step7.md`。

### 2026-10-29 六项后端 IMPORTANT 修复（focused 验证完成）

- Retry 在同一事务内推进 conversation/run fence、切换当前 attempt，再由该 fence claim 与 settle；行为测试覆盖 retry → claim → finish。
- 实际模型 SYSTEM 指令包含冻结 Auralis markers、各 NDJSON schema、reference 必须为最后一行及活动结束规则；同一 Orchestrator 行为测试检查模型实际收到的 request。
- Snapshot 仅合并相邻 text parts；text→component→text 保持顺序。解析错误前已产生的有效组件行保留在 `INVALID` part，不带私有 reference 且不可提交。
- Recovery 使用固定 5 秒调度，查询仅覆盖 deadline 已到且可处理的 foreign 状态，按 deadline/id 排序并限制 100 条；fresh foreign RUNNING 不偷占，UNKNOWN 不释放 slot。
- V43 增加 `chat_attempts.private_tool_evidence_json` 私有列。只记录成功工具结果与 source revision，下一轮历史投影以真实 mapped request 大小（含 tool definitions）控制折叠；历史顺序为 user → tool call/result → assistant final，public status/detail/trace 不含该列。
- `mvn -B -ntp clean '-Dtest=ChatRuntimePersistenceServiceTests,ChatAgentProtocolPublicationTests,ChatRuntimeRecoveryServiceTests,ChatEvidenceHistoryProjectorTests,ChatAgentModelAdapterTests,ChatAgentProfileAdmissionTests' test`：21/21，0 failures/errors/skips，exit 0；`mvn -B -ntp -DskipTests package` exit 0。只读 review B0/I0/O0。首次全量仍 940 tests / 2 failures / 58 errors / 7 skipped、exit 1；未验证 PostgreSQL integration、生产迁移、真实 Provider、部署或 GUI/业务流程。证据 `D:/Temp/auralis-chat-six-fixes-20261029/`。

- `POST /api/ai/messages/stream` 已切为 protocol-1 turn/activity_submission body；新增 run retry/status/cancel 与 one-shot text-generation routes。`ChatAgentOrchestrator` 使用应用显式 loop 和受治理 `ChatAgentModelAdapter`；Provider 工具定义由服务端注册，只有完整合法 terminal tool call 才执行 read-only source tools。
- `ChatRuntimePersistenceService` 将 admit、USER、PENDING run/attempt 与会话 slot 放入短事务；模型在事务外运行。V42 新增 `chat_runs/chat_attempts/chat_activities`，Conversation/Message protocol 标记、attempt deadline、独立 reply IDs、公开 snapshot 和 fence。Activity READY 事务先写实际 ASSISTANT message 再写非空 message_id 外键；业务成功与 worker 清理/usage settlement 分离。
- Run identity 在首次 admission 固定 provider/model/规范化 endpoint 的 SHA-256 hash；request hash 只覆盖规范化 client body，不混入 requestId 或 profile。重放先查 requestId+body，再读取当前 provider settings。Retry 在建立 attempt/reservation 前比对原 provider profile，worker 在 Provider/tool 调用前再次核验；profile 变化返回 409 `CHAT_PROFILE_CHANGED`，同一 provider/model/endpoint 下凭据轮换允许，默认 provider 变化不改现有 run。
- Startup recovery 对未过持久 deadline 的 foreign owner 不干扰；过期 PENDING 安全终结并释放、不重派；过期 foreign RUNNING/CANCEL_REQUESTED 进入 UNKNOWN 并 fence，保持 slot。UNKNOWN 无自动 retry/unlock。同步 worker 实际退出后，本地 failed/cancelled/usage-incomplete run 按业务结果结算，Guard 仍按完整 reservation 保守计费。
- 进入 UNKNOWN 的恢复会用已分配 reply ID 写入 FAILED assistant message 和最后公开 snapshot；attempt/run 保留 UNKNOWN 且 Conversation slot 继续占用。`UNKNOWN` 表示实际 worker/provider reader 退出状态不可证明，不由 usage 缺失触发。
- 首次全量 Maven 为 940 tests / 2F / 58E / 7S，exit 1；主要受缺少 task-owned PostgreSQL URL 与 Docker 环境限制，另有已修的旧 fixture、迁移版本期望和 OpenAPI artifact 陈旧问题。目标 fixture 回归18/18、`scripts/export-openapi.ps1` 导出与比较15/15、fence/persistence/recovery/profile/controller/source affected集合18/18通过；最终 `-DskipTests package` exit 0。只读 review 最终 B0/I0/O0。全量未转为通过，PG integration、真实 Provider/部署/业务库验收仍未完成。证据目录 `D:/Temp/auralis-chat-p2-validation-20261029/`，review `D:/Temp/auralis-chat-p2-final-review-20261029/review.md`。详细字段与事件见 [Chat Runtime API](../contracts/chat-runtime-api.md)、[API 契约](../contracts/API.md)、[Database 契约](../contracts/Database.md) 与实施[计划](../plans/2026-10-29-chat-agent-visual-teaching.md)。

### 2026-10-28 Overview 模型响应自动重试（源码候选，未部署）

新增AURALIS_AI_OVERVIEW_MAX_RETRIES，默认3表示首次之外最多再试3次（最多4次尝试），0关闭，非负且没有额外固定小上限。.env.example、Spring与Compose已贯通，未改实际.env。覆盖adaptive INDEX/ROUTE/Writer单节与合批/EDIT在模型已返回且网关已结算后的空内容、JSON、字段、Schema、漏节及编辑校验错误；直接重发原stage输入，不重跑已完成检查点，不保存半批。adaptive JSON_REPAIR不另叠加模型调用；普通响应截断沿现有容量拆分。重试次数不进入内容/profile/checkpoint指纹。

网络/连接超时或未知派发不自动重发；预算/额度/限流、取消/中断、总期限、来源变化、租约失效与本地bug不重试。每次真实重发仍走独立invocation/reservation并受现有费用额度约束。阶段重试日志为ADAPTIVE_MODEL_RETRY，带purpose/retryIndex/maxRetries/safeCode，耗尽返回最后具体错误，用户仍可手动断点续跑。

定向146/146（含先前104，不重复计数）、受影响PG十类43/43及TLS3/3通过。唯一full964项0F/90E/2S，90E由PG/TLS参数设置及四个测试文件中的构造器调用导致，分别修正后affected闭合，未重跑full或声称一次全绿。唯一只读审查B0/I0；未部署、未调用真实模型或做GUI验收，未操作业务库/清缓存。证据D:/Temp/auralis-overview-auto-retry-20261028/。

### 2026-10-28 Overview 相邻小节合批写作（源码候选，未部署）

路由提示明确相关主题可合成教学小节，并保留主题唯一分配提醒。Writer可将同源、同章、按目录连续且共享精确原文范围的待写小节合为一次请求；共享原文去重，各节题目、主题与来源独立绑定，成稿按原目录回填。批次大小由完整请求和多节输出预留动态判断，没有固定节数帽。已验证单节保留并跳过，容量拆分parts不跨节合批；合批一个执行节点，完整响应验证成功才保存整批检查点，重试恢复整批，不保存半批。

单节现行操作保持；多节私有操作为write_adjacent_sections_v1，模型仅回sectionIndex与detailedContent，来源/主题由程序回填。未改PC、公开API、数据库结构、额度或执行fence。定向169项在修正构建产物/注解错误后通过；随后审查及新增恢复用例暴露的顶层operation识别和单节manifest误入问题已最小修正，最终受影响Adaptive83/83通过，同一只读reviewer差量关闭后B0/I0。不是一次全绿；未跑全量、部署或真实模型生成，实际输出质量/用量节省未验收。证据D:/Temp/auralis-coalesced-writer-20261028/。

### 2026-10-28 Overview 按来源路由与遗漏补回（源码候选）

针对8份无关资料的174主题路由只引用89个ID、在Writer前终止的问题，改为按最早BODY原文来源分域路由，源内沿原章顺序聚合；整源能放下则一次请求，超容量才按现有动态规则拆分。跨源主题只归一个域但保留所有原始引用。ROUTE解析接受非空合法子集，未知/重复ID仍拒收；程序将连续遗漏按原章、原序及完整Writer请求容量成组补入，最后校验完整唯一覆盖。无需额外模型修复，也不新增固定主题数或节数上限。背景/导航过滤、Writer证据及重试/费用语义保持。

集中定向首轮Adaptive77项5F/4E，旧跨源fixture与prompt断言更新后的首次受影响复验77项仍有1F，最终含补回原序回归的Adaptive78/78通过；DynamicBudget17/17、Recovery23/23通过。未运行全量测试、部署、业务库/缓存操作或真实模型生成。唯一只读审查的顺序问题已修正，同一reviewer差量关闭后最终B0/I0/O0，审查结论见D:/Temp/auralis-local-route-20261028/review.md；本轮命令与证据位于同目录。实际生成质量与耗时待部署后验收。

### 2026-10-27 独立执行重试（源码、分批验证及审查完成；未部署）

Source/Subject direct JSON/SSE使用独立acquireDirect策略：失败request重放不复活；普通新请求在FAILED/租约过期后建立新generation和budget，显式retryOfRequestId可接替原执行，并按父代唯一后继收敛并发。失败父及重试祖先的已验证检查点按既有精确身份复用，未返回/未校验输出不复用。旧调用和费用保留，Guard计费/额度规则不改；durable job仍走原acquire/claim/resume。定向162/162及最终donor差量复验、隔离PG、OpenAPI15/15、PC84/84/类型/构建及skipTests package通过，唯一review B0/I0/O0。唯一full950项1F/55E/2S，环境/资源与旧版本断言分批闭合，未重跑或声称full全绿。详见[实施计划](../plans/2026-10-27-overview-explicit-retry.md)。

### 2026-10-27 导读实质内容补充（源码候选，未部署）

仅补充ADAPTIVE_EDIT现有ALL导读提示：概览解释实际覆盖范围和章节联系，keyPoints按实际章节说明核心概念/关系及需要区分的问题，learningPath使用实际章节/小节标题组织顺序、承接和学习目标。成稿证据边界保留一处，不依据规划标签补教学事实；不用内部segment编号替代用户可读标题。未设字数/条数目标，未增加模型调用、发送全文或改变编辑补丁、schema、预算与界面。

当前PC总结预览直接渲染overview/keyPoints/learningPath并可滚动，静态核对未见截断逻辑；本轮没有修改前端。已有prompt-contract方法1/1通过、Maven exit0，唯一只读审查B0/I0/O0；真实导读篇幅及效果待部署后新生成验证，现有结果不自动改写。证据 `D:/Temp/auralis-guide-prompt-enrich-20261027/`。

### 2026-10-27 INDEX 缺失空 summary 规范化（源码修复，未部署）

索引角色解析的既有严格JSON入口，对合法根对象缺失的 `summary` 补为 `null`，与通用投影的缺省语义一致。主响应、现有格式修复响应及角色恢复读取共用该入口；显式null或非null值不改动，其余必填字段、未知/重复字段、来源角色与授权引用检查保持。没有修改提示词、预算、公开响应或增加模型调用。

隔离候选编译及 `OverviewAdaptiveGenerationTests` 76/76通过、Maven exit0；同步前核对主工作树基线未变，仅回写Validator与Adaptive测试两个文件，候选与工作树hash一致。唯一只读审查B0/I0/O0。未部署、清缓存、修改业务库或调用真实模型。证据 `D:/Temp/auralis-index-summary-normalize-20261027/`。

### 2026-10-27 Writer JSON 外围清理（源码修复，未部署）

Writer首次严格解码失败且Provider正常stop、未显式截断时，程序截取首个完整JSON对象，移除前后普通文本、围栏或尾随`<`等噪声，再走原严格字段/正文校验。移除原ASCII短标记尾缀白名单，不增加模型修复或重试。JSON字符串内文本保持原样，重复字段、错误schema、未闭合对象及第二JSON值仍拒收；首个`{`不是完整合法根对象时不猜测后续对象。INDEX/ROUTE/EDIT接受规则保持。

定向Adaptive74项73通过，唯一前轮提示词旧断言修正后单项1/1；审查发现连续第二根漏检，最小修正后Writer方法1/1通过，同一reviewer差量关闭，最终B0/I0/O0。目标文件diff check通过，未重跑全量或真实模型。证据 `D:/Temp/auralis-writer-json-clean-20261027/`。

### 2026-10-27 主题聚合与提示词精简（源码候选，未部署）

INDEX按核心议题聚合同一或相邻原文单元的相关子要点，保留独立实质主题与原文先后顺序；ROUTE在原章容器内将相关主题组织为连贯教学小节，概括标题、具体写作目标与全部主题引用共同保留内容范围，独立议题可单独成节。Writer以本批原文决定展开内容，父级规划仅定位。COMMON和阶段字段说明去除重复警告及自查清单，保留一次指令隔离、来源角色和必要JSON契约；ROUTE不再附加建议输出Token数，程序容量/预算、章归属和校验逻辑保持。没有新增节数配额、程序合并或并发。

隔离首轮合计91项为85通过/5失败/1错误（Adaptive74项为68通过/5失败/1错误，BoundaryEditor17/17），失败均为旧措辞断言及示例授权夹具；受影响6项复验5通过，残留旧schema措辞修正后单方法1/1通过。分批闭合，不称一次全绿。先前将合计91误记为Adaptive91，现已依据原始Surefire日志纠正。证据 `D:/Temp/auralis-cohesive-prompts-20261027/`。实际聚合率、耗时与内容质量尚未调用真实模型验证。

### 2026-10-27 EDIT 空补丁处理（源码修复，未部署）

EDIT 对身份及分段哈希合法、且没有标题或首尾编辑的补丁按无操作处理，保持原文并继续处理导读；仍登记该分段，重复条目、未知身份、过期哈希及非法编辑继续拒绝。提示词明确省略无需修改的分段，全局无需编辑时返回 `segment_patches:[]`、`terminology_map:[]`，guide 仍按 ALL/OUTLINE 模式生成。没有新增模型调用、恢复路径或公开字段。

隔离候选定向验证18/18通过（BoundaryEditor17、提示词断言1），未运行full、部署、清缓存或真实模型验收。证据 `D:/Temp/auralis-empty-edit-fix-20261027/`。

### 2026-10-27 原章顺序与柔性路由（源码候选，未部署）

新私有算法 `overview-adaptive-v11-source-chapter-order`。INDEX按原文先后提取主题，可在section提供 `sourceChapterStart:{unitAlias,title}`；普通NAV、目录、预告或模型分组标题不构成章起点，只有声明且能在所引原文定位的正文章头才参与绑定。无法使用的章元信息丢弃，原引用/角色/严格JSON校验保持。标题位置以规范化后文本包含检查，不向模型要求字符偏移。

程序按输入单元位置与INDEX主题输出顺序双键处理，同Source跨批顺延，跨Source重置；同单元A在声明前沿用旧章或进入前置导论，B才切换。可靠章即使只有一章仍固定；无锚点资料允许自由分章，再按最早BODY位置排章。目录仅做确定性名称对齐。ROUTE全局一轮以sourceChapters容器传主题，无归属主题为unanchoredTopics；超容量仍按原机制分桶。跨章混装由程序按绑定章拆回，不新增修复/重试，拆出标题和目标只描述对应主题，保留原章其它小节相对顺序。

Writer、NAV阅读过滤、轻量EDIT及公开响应保持。索引primary/现有JSON repair/checkpoint贯通新章信息，私有checkpoint为v3，新算法隔离旧中间格式，不做兼容回填。编译通过；首轮119项中6失败（Adaptive72、Recovery30、Budget17），修正夹具/断言后受影响方法分别通过；补充同unit双键实现及边界测试通过，不能合称一次全量全绿。Recovery30/30、Budget17/17、原跨JVM用例首轮通过。唯一只读审查B0/I0/O0，两项IMPORTANT最小修正后受影响4/4通过、同一reviewer差量关闭；真实识别质量、原书结构恢复仍依赖INDEX，本轮未部署或调用模型。[本轮计划](../plans/2026-10-27-overview-original-chapter-order.md)。

### 2026-10-26 动态容量运行态已部署

香港22:42按用户授权重建并recreate本机backend/frontend；backend运行镜像 `sha256:6256eee92138f0cf197733a4a871266b78315b8dbab5fa68a54b2f0e687044aa`，readiness HTTP200/UP，运行JAR六个关键class与已验候选一致。V40已应用，26项MAX均0、Overview calls0、task tokens524288、adaptive=true、estimator=calibrated-category、response timeout120000/task timeout0。用户settings/BYOK解析路径保持；未发起真实生成验收。

用户另授权全部6条FAILED缓存清理，主Agent备份后删除其私有子表与父行，22SUCCESS/22正式结果/675费用记录等12组hash保持。部署后无新增invocation/reservation/job。命令与运行证据见D:/Temp/auralis-overview-deploy-20261026/deploy-verification.md；下面候选条目记录部署前的实现与自动验证。

### 2026-10-26 Overview 动态容量与链路简化（当前候选，未部署）

当前算法为 `overview-adaptive-v10-dynamic-capacity-writer-body`。按完整实际请求分批 INDEX，容量允许时一次全局 ROUTE，仅真正超容量才分桶；相关主题共用学习小节，Writer 组内原文去重，完成后程序装配并调用轻量 EDIT/ALL 导读。多层 Metadata 调用已移除。Writer 私有响应只含 `schemaVersion`、`detailedContent`；来源、主题分配、范围和证明由本批程序对象绑定，不以模型抄写的声明证明语义覆盖。

`Ai.overviewLimits()` 集中接收 26 项 `AURALIS_AI_OVERVIEW_MAX_*`，完整清单见根 `.env.example`：默认 0 不另加固定容量帽，正数额外限幅。单次请求依完整提示词、模型 context/output 能力及输出预留判断；保存和总体规模不套单次模型窗口。输出需求按请求字节与结构开销线性估算，再取模型、可用 context 和正数 ENV 的交集；不按任务余额压缩正文需求。估算不是 tokenizer 精确计数。Overview calls 默认 0，Token/窗口/并发额度不变；Chat 等其它功能原有限制保持。

能力来自精确官方 profile 或服务器配置的 provider/endpoint/model，显式配置优先；未知能力在预留/派发前拒绝。配置 provider 使用合法名称字符串，公共配置不依赖 AI 业务枚举。INDEX/ROUTE 的 topic/unit aliases、Writer 内部 unit aliases 不套最终文档数量帽；严格结构与授权仍校验，最终按真实来源 UUID 去重后执行配置上限。V40 放宽存储长度约束，结果标题改为 TEXT，非空、身份、来源、事务围栏保留。

编译、分批定向检查、隔离 PostgreSQL 43/43、受影响检查 44/44、package、OpenAPI/两端生成类型比较及 PC 接收 80/80 通过。唯一 full 为 933 项、4F/54E/7S，随后按失败归因定向关闭，未重跑 full；七项条件性跳过保留。唯一只读审查 B0/I0/O0。准确命令与边界见[本轮计划](../plans/2026-10-26-overview-dynamic-capacity-and-simplification.md)。

### 2026-10-26 Overview 阅读区与EDIT输入收敛（分批定向验证，本轮未部署）

当前算法为overview-adaptive-v10-body-reading-boundary-view。NAVIGATION原文不再装配成阅读小节，轻量chapterTitle/title/summary保留为navigationContext供结构参考和ALL导读使用，不能当已教授事实。纯导航小节移除后跳过空章，按最终章节重新生成provenance路径；没有BODY写作组时以既有MUTATION_REJECTED明确返回无可生成正文，不建立空Writer计划、不进入EDIT。

OverviewBoundaryEditor完整Snapshot、散列、apply及缓存绑定保持；EDIT仅接收promptView：分段身份、标题、实际ATX小标题、去重后的首尾块及其kind/hash/text，不发送中间正文/逐块metadata。单段只发一项，两段各一项；CORE/PROTECTED边界只读，原编辑权限不扩大。术语映射仍在完整Snapshot按原作用域、保护和非级联规则应用，没有模型出现次数要求。Guide依据实际成稿可见证据，不将导航、INDEX摘要或writingGoal当成教学完成证明。

Writer单批/多批使用统一规则：plannedChapter/plannedSection/writingGoal仅定位，本批originalTextUnits决定范围与深度，不为父节目标补宏观引言总结或展开缺少本批证据的概念。INDEX提示尽量提取所有实质主题与重要区别；Java仍接受非空合法子集，不恢复覆盖补齐。OUTLINE继续完整章节无导读，SUMMARY独立短摘要；无新增模型阶段、摘要调用、固定压缩比例、full/compact回退或EDIT修复。

fresh candidate全源578/578 hash一致，编译通过；首轮124项为122通过/2测试断言或fixture失败，2项单独复验通过，不称一次全绿。BoundaryEditor15/15、隔离PG Recovery30/30、AiSchema3/3在首轮通过。package/full、真实模型、部署与质量验收未运行。唯一只读审查最终B0/I0/O0；命令和最终hash见D:/Temp/auralis-overview-reading-edit-20261026/。

### 2026-10-26 Overview 索引契约与提示词减量（分批定向验证完成，本轮未部署）

当前内部算法为 `overview-adaptive-v10-selected-index-local-writer-ranges`。总览尽量减少遗漏，不承诺替代原文；INDEX 接受当前授权单元的非空合法子集，未选单元保留在原资料中，不推断其必为背景。删除仅用于补齐原文单元的 INDEX_COVERAGE 模型分支；目录仍须处理已选主题。严格索引解析、summary=null、角色/引用配对和授权校验是主响应及既有 JSON 修复的共同成功条件，不再用通用投影解析代替索引用途解析。

INDEX、metadata、route 及其修复/分桶输入中的 instruction 为空；Writer/EDIT 保留受阶段结构和来源授权约束的顶层用户偏好，资料/原模型输出中的嵌入命令不作指令。Writer 提示词不再含 writerInputRanges；现有批次对象向 checkpoint 保存/加载传递来源范围，范围参与 step 身份并与既有 manifest 精确比对，不增加存储或兼容层。

干净编译通过。初轮定向108项为103通过/5断言失败；4个Adaptive方法复验通过，1个Recovery方法在统一writer+EDIT调用/预留计数后单独复验通过，未重跑整批并称全绿。审查差量的INDEX非null summary接受问题已最小修正，相关8方法复验8/8，同一reviewer最终B0/I0。Recovery使用隔离PostgreSQL；本轮未跑package或全量后端，未部署或调用真实模型。命令、差量与唯一审查见 `D:/Temp/auralis-overview-contract-trim-20261026/` 和[实施计划](../plans/2026-10-25-overview-boundary-edit-quality.md)。

### 2026-10-26 Overview 独立分段与边界编辑（源码、分批验证及唯一审查完成；未部署）

前一轮自适应算法 `overview-adaptive-v10-source-roles-boundary-edit` 引入内部 `sourceRoles`：每个主题的每个来源分别记录 BODY/NAVIGATION/BACKGROUND；同一原文单元可关联多个主题并有不同用途。当前已取消原文单元逐个覆盖要求，同一小节内引用唯一、已选主题主归属唯一仍保留。章节预告和目录不构成教学正文。用途随索引checkpoint与metadata归并保留；BODY提供Writer事实材料，NAVIGATION当前仅作路由和导读结构参考，背景默认排除出生成结果但原资料保留。

索引与Writer各自只接收本批内容。正文完成后，ALL/OUTLINE执行一次 `ADAPTIVE_EDIT`，只读完整分段、用途与不可变快照，输出受控标题/首尾补丁、字面术语映射及ALL导读。OUTLINE导读为null，SUMMARY语义保持。补丁经ID/hash、结构保护、作用域与冲突检查后统一应用；原Writer checkpoint不变，核心正文不经模型重吐。导航没有Writer账单；最终编号按逻辑节点统一。新purpose使用原Gateway/Guard、预算根与Source/revision围栏，先检查有效缓存再进行新调用准入。

新增显式选择的 `mimo-byte-category-candidate` 输入估算profile，仅匹配官方MiMo endpoint与 `mimo-v2.6-flash`；默认保持 `legacy-bytes`，未知身份及不支持形态保守回退。Java离线重放86个实际用量配对，24个留出调用中16个启用候选、无低估；限于当前样本，不是通用Token上界。规划与Gateway复用同一profile。

验证为分批证据：审查前Adaptive/Schema 79/79、Java trace 1/1；受限后端821项为0F/2E/2S，两个TLS参数缺失错误随后affected-only 3/3通过，未重跑并宣称整批全绿。唯一审查的两项IMPORTANT已最小修复：混合路由显式保留去重导航，首尾编辑使用完整纯组织性句式白名单；修复后Adaptive/BoundaryEditor/Schema 91/91、package通过，同一审查者差量关闭，最终B0/I0。Docker引擎不可用，17个PG/MinIO类未纳入受限批次。真实Provider、GUI与内容质量未验收。详细命令、限制和审查状态见[实施计划](../plans/2026-10-25-overview-boundary-edit-quality.md)及 `D:/Temp/auralis-overview-boundary-edit-20261025/gate/summary.md`、`review.md`。

### 2026-10-25 Adaptive GUIDE 按实际输入预算选择完整或紧凑上下文（源码候选）

自适应 GUIDE 不再受通用 `maxPromptChars` 字符门限限制；其它 Overview purpose 的字符门限保持原样。GUIDE 完整版与现有 excerptless 紧凑版本按完整 system/user 消息调用既有 `AiInputTokenEstimator` 与 `OverviewBudgetPlanner` 评估，沿用 FINAL 输出预留、模型上下文安全边际、模型上下文未知语义及平台任务余额（charged + reserved）。先查找并恢复有效 GUIDE checkpoint，再应用新调用的 token 预算筛选，因此缓存命中不要求为已完成请求重新预留 tokens。若完整请求不适配已知上下文或平台余额，则选用紧凑版本；平台余额不足仍返回既有 `AI_TASK_BUDGET_EXCEEDED`，已知上下文仍走现有 prompt-budget error。BYOK 继续不受平台任务 quota 限制。Gateway 的 reservation/settlement、输出预留 2048、调用/任务配额、prompt data、checkpoint identity 与其它 stage 未更改。

源码候选未部署；自动验证与人工/Provider 验收状态以当前状态文档为准。

### 2026-10-25 Overview prompt 嵌套 JSON 字段顺序（源码候选）

Adaptive INDEX context、writer probes、completed-guide body evidence 与 directory 的五个嵌套 JSON 对象使用显式插入顺序，避免 `Map.of` 在不同 JVM 中改变同一提示词的原始 JSON 字节。当前值、字段名、列表顺序、checkpointStep 哈希公式、模型/预算兼容围栏不变；未引入旧 key-order 兼容匹配。离线 trace 显示旧 INDEX key order 与本次选择一致；writer 选择匹配 de2 的 66 个有效请求 trace。新的跨 JVM prompt/checkpoint-step 用例通过：固定 source/revision/chunk/generation IDs、内容与时间，执行 INDEX、Writer、Guide 实际 prompt builder，并比较 user/system JSON hashes 与 checkpoint steps；显式断言 INDEX context 的对象与 null 情形，以及非空 sibling bounds。原有 Adaptive 66 项与新方法 1 项属于分批证据，不合并为单轮 67 项。API 和数据库结构不变；当前 generation cache replay、真实 Provider、业务 DB 写入、缓存清理和部署未验收。

### 2026-10-25 Overview adaptive writer trailing identifier（源码与定向验证完成；未部署）

首次 `ADAPTIVE_WRITE` 主响应只有在 `finishReason=stop` 且未命中现有截断检测时，才可尝试从首个完整 JSON 根对象后恢复一个 1–32 字符 ASCII identifier。专用严格 parser 拒绝根/嵌套重复键；恢复后完整私有 writer schema、source/topic coverage、正文容量、规范化和 provenance 流程不变。原 Provider 响应 trace 保持原文，只有 writer 校验成功后才记录安全字符计数事件。D 盘 fresh candidate clean 编译 379 production sources；Adaptive 66/66、Provider resilience 10/10，exit 0。Wire test 实际检查 `max_tokens=4608/4675/6144` 均序列化为 `response_format=json_object`。证据 `D:/Temp/auralis-writer-tail-fix-20261025/candidate-run2/`；未连接业务 DB、未调用真实 Provider、未部署或做 GUI 验收。

### 2026-10-25 adaptive writer checkpoint 边界空白恢复一致性（源码与定向验证完成；未部署）

Adaptive WRITE 与 composite writer 输出在保存 checkpoint/fragment manifest 前使用既有文档校验器的边界 trim 规则规范化；恢复时先校验存储 JSON 的精确序列化、payload hash、原始 fragment hash 与来源证明，再运行结构校验并将原始 payload 原样交给后续预览绑定。未放宽散列/来源校验，无 API/DB schema 变化。匹配当前源码 hash 的 D 盘候选完整 Adaptive 测试类为 64/65；新用例首次失败是模拟旧尾随空白时将摘要推过既有 4,000 字符上限。修正合成 fixture 并精确限制新增请求为 completed-guide 后，affected-only 用例 1/1 通过，覆盖旧边界空白恢复、payload/provenance hash、章节数、内部 code whitespace 与篡改拒绝。编译了 379 个 production 与 147 个 test source。未连接业务数据库、未调用真实 Provider、未部署或 GUI 验收。

### 2026-10-25 direct Overview 终态未知 writer 恢复（源码与定向 PostgreSQL 验证完成；未部署）

Direct Source/Subject JSON/SSE generation 可在后续用户请求时恢复一个精确关联的 adaptive writer node：原 reservation 必须为已结算 `FAILED`、已派发、actual input/output 均缺失，且 `charged_tokens` 至少覆盖完整 `estimated_input_tokens + reserved_output_tokens`；node 必须仍对应该 failed attempt，或已有后续 attempt 的有效 checkpoint。执行前由现有 generation/plan/node 锁与 fence 再次检查；恢复沿用父 generation 的 budget root，旧未知账本行和保守扣费保持不变，新调用创建独立 reservation 并继续通过 Gateway/Guard。

该例外只覆盖能通过 `overview_execution_calls` 精确映射的单个 writer node。第一次允许的 replay 若再次产生 unknown-dispatched usage，节点上出现第二个未知调用后继续 hold；已完成且账务完整的后续 attempt 可沿用现有最多 8 次节点 attempt 限制。RESERVED/EXPIRED、未结算、费用低于完整 reserve、身份或关联缺失/冲突、checkpoint 无效、任何非 writer 未知调用仍 fail-closed。Durable-job 恢复 gate 仍维持严格 unknown hold。本次无 schema、migration 或 API 变化。

在 D 盘候选中，`OverviewGenerationServiceRecoveryTests` 30/30、`OverviewExecutionJournalPostgresIntegrationTests` 8/8、`OverviewJobInvocationJournalTests` 2/2 同一 Maven 调用通过（40/40，exit 0）；覆盖 direct Service gate、13 个已验证节点加失败 writer、同一 budget root、保留旧 charge、新 checkpoint 后继续执行、第二 unknown 与负向账务/身份边界。测试仅使用 Provider 替身和隔离 PostgreSQL，未连接业务数据库；未部署、未调用真实 Provider 或进行 GUI 验收。

### 2026-10-25 Overview metadata convergence、Chat retrieval boundary 与 Provider probe（源码候选）

自适应 Overview metadata planner 的指令明确要求把相关条目合并到更少的 sections，一个 section 可绑定多个 plan alias；保持 alias 完整覆盖与应用侧不可变 topic/unit 绑定。每一层先检查 metadata route 是否已满足 prompt/output 预算，即使条目数未减少也可直接路由；route 仍不适配且新层 section 数不少于输入条目数时，立即回退到既有 bounded topic buckets。字符收敛和现有上限继续生效。

Chat 检索 excerpt 作为 escaped text 放入完整闭合的 untrusted wrapper，并附明确的 system 指令：excerpt 只作证据数据，内部 source/chunk UUID 不主动向用户输出。检索范围、citation 事件与 12,000 字符 prompt 上限不变；自动回归只验证 prompt 结构，不证明模型在真实攻击样本下的行为。Provider connection probe 请求 32 个 output tokens，仍沿现有 Gateway 和 Provider setup policy；此值改善短回复的兼容性，不能保证所有模型或代理都按 token 参数工作。

Selected-text preflight runs before retrieval and counts only the mandatory base and selection instructions, selected text, and current question. After retrieval, quoted assembly includes the retrieval warning and whole escaped excerpts only when the prompt can retain the complete selection boundary and current question; under a tight budget it omits retrieved excerpts instead of truncating required instructions or the question. The configured prompt-character ceiling remains enforced.

Focused backend validation for the selection-budget correction: `PromptAssemblerTests` 7/7 and `AiStreamingTests` 17/17 passed in one Maven run. The earlier Overview metadata and ProviderDiscovery evidence remains separate targeted validation. Source candidate is not deployed; no real Provider or business acceptance was performed.

### 2026-10-25 Overview 整任务期限可关闭（源码与自动验证完成；未部署）

`AURALIS_AI_OVERVIEW_TASK_TIMEOUT_MILLIS` 缺省仍为 240000ms，配置 `0` 同时关闭同步 JSON/SSE 直接请求和持久后台 job 的整任务 deadline/watchdog。直接 durable WAITER 使用 elapsed Duration 比较，避免无界毫秒值转纳秒溢出。后台新 claim 在 0 配置下以 `deadline_at=null` 表示无界，V39 允许 RUNNING 行为 null 但仍要求 worker/lease；已有正数 deadline 不被延长或清除。单次 Provider response 仍为配置窗口（默认 120000ms），取消、owner/fence/lease、Guard、计量和预算不变。负值配置仍不合法。

验证：后端定向 195 项、全量 881 项均为 0 failure/0 error；全量仅 1 个需要私有 trace 目录的 replay 测试跳过，`-DskipTests package` 成功。PostgreSQL/Testcontainers 使用临时测试数据库，未连接业务库、未调用真实 Provider、未重建或 recreate 容器。

### 2026-10-24 Overview 全链路提示词细化（主 Agent 直接实现；相关验证通过，未部署）

本轮针对 MiMo 实测 `2a307651-cafc-488c-8e14-df002e149ccd` 第三批索引的 `chapterTitle` 错键问题，重新核对所有现行 Overview 提示词。前两批已通过索引校验，第三批五个 chapter 都没有 `title`；输入中的 `priorIndexContext.chapterTitle/sectionTitle` 是可能的干扰线索，不将其断言为唯一成因。

| 阶段/用途 | 证据与授权编号 | 输出及主要约束 |
| --- | --- | --- |
| INDEX / INDEX_COVERAGE | 仅本批 `materials[].text/unitAlias`；前后文和 priorIndexContext 不授权新引用 | 标准 outline 结构；每个 unit 至少覆盖一次，同节 ID 不重复；显式索引次生概念、条件、例外和区别，纠偏诊断样本不代替完整材料集合 |
| METADATA | metadataItems 与 authorizedPlanAliases | 每个 plan alias 全局恰好一次；应用保留不可变 topic 绑定，不把 topicIds/unit IDs 当 plan 引用 |
| ROUTE / 分桶路由 | lightweightTopics 与 authorizedTopicIds | 每个 topic 全局恰好一个主要归属；保留原始探针，unitCount/rawChars 为容量线索，共用目录提示不扩充授权范围 |
| METADATA_ROUTE | lightweightIndex 与 authorizedPlanAliases | 每个 plan alias 恰好一次；生成目录和写作目标，不写正文 |
| WRITE | originalTextUnits 与 authorizedUnitAliases；assigned/expectedCoveredTopicIds | 私有 schemaVersion/detailedContent/sourceIds/coveredTopicIds；只写当前证据，补全相关条件和例外；分组避免重复开场/结尾；部分证据不得脑补其他批次 |
| GUIDE | 已完成目录与有界正文摘录；seed 仅导航提示 | outline=null；summary 内必须有 overview/keyPoints/learningPath，不重写正文或承诺未见内容 |
| Source MAP / Subject DIRECT / Subject MAP | 当前 chunks 或已验证 sources 的内容和源级 aliases | 按用户 ALL/OUTLINE/SUMMARY 输出短总览，跨源归类并保留条件与冲突，不把缺失输入段落解释为原资料未写 |
| REDUCE / SELF_PAIR / COMPACTION | 已压缩的 mapJson 与既有 aliases | 只归并等价/重叠主题；邻接不等于等价，不为压缩删除条件/例外/冲突；不适用于 adaptive 正文 |
| REDUCE_RECOVERY（含 COMPACTION） | 当前 mapJson 部分片段 | 中间阶段明确允许缺失部分 null；最终阶段按公开 mode 组装，不能混用中间阶段的部分输出要求 |
| JSON repair | 既有 malformedOverviewJson、目标 schema 与 allowedSourceAliases | 独立修复提示，不叠加主请求对缺失 materials/chunks 的要求；只修已有内容的字段/嵌套/语法，不从摘要推导不存在的索引 |

统一约定：精确字段名及大小写、chapter/section 都用 `title`、真实 JSON null、非空文本/数组与容量限制；共享结构示例使用占位 ID，并明确占位符不提供引用授权。每轮自检键/嵌套/类型、授权编号与覆盖，不引入新的自检 completion。`chapterTitle/sectionTitle` 仍可作为输入上下文，不能作为输出字段。私有 writer 请求已去掉无关 expectedSummary；其余内部 outline 请求的 expectedSummary 改为 JSON null。提示词与请求变更沿现有 systemText/userData 指纹隔离受影响 checkpoint，不清除缓存、资料或账本，不升级全局算法版本。

本轮不增加字段兼容映射、不放宽 validator 或自动 repair 白名单/次数、不改 Provider/env/预算/timeout、API/DB/前端。无外部 Provider 调用和部署。验证：D 盘隔离候选 clean-source 编译 379 个生产源码和 145 个测试源码；Adaptive 62/62、Recovery PostgreSQL 28/28，以及 AiOverview 78 项加最终 affected-only 两项复跑均通过，合计170项最终通过；不是一次全绿或全量后端结果。首次验证暴露提示词过长及旧措辞断言，收紧公开短总览重复说明后，第二批只剩两个长度边界夹具失配；修正固定字符数断言及收紧测试窗口后，两个受影响用例2/2通过。静态检查exit 0，主 Agent 最终审查B0/I0。未运行full/package：本次仅后端单模块提示词/定向契约变化；证据目录 `D:/Temp/auralis-overview-prompts-refined-20261024/`。此前阶段隔离版本已由用户部署为 `sha256:e074fa81335e9ba5e9b7a7419d27210d859ee24cb43ec15790dd026d52f74489`（香港时间 23:09:49 创建）；该镜像尚不含本次细化。

### 2026-10-24 Overview 自适应阶段提示词隔离（源码候选）

- 自适应索引/coverage、metadata、route 和 metadata-route 提示词只共用不可信输入与 JSON 规则，并明确要求根 `outline` 为数组、根 `summary=null`；各阶段既有指令继续定义各自的 alias 授权。写作后的 guide 单独要求 `outline=null`、summary 必需且 `learningPath` 位于 summary 内；writer 保留私有 `detailedContent` 响应契约。旧 MAP/REDUCE/SUMMARY 路径继续使用公共 mode schema。
- 自适应 JSON repair 按目标阶段 schema 及已授权 aliases 拼装，仅携带待修复输出；既有索引专用 repair 保持。提示词 system-text hash 已纳入自适应 checkpoint step，旧 prompt checkpoint 自然 miss；无需清缓存或整体升级算法版本。无 API/数据库契约变化。隔离候选 `OverviewAdaptiveGenerationTests` 59/59 通过；首轮同批 `AiOverviewServiceTests` 80/80、`OverviewGenerationServiceRecoveryTests` 28/28 通过。Recovery 测试启动了 Testcontainers 临时 PostgreSQL fixture，未连接业务库。未运行 full suite/package；本轮 prompt 候选未部署、未调用真实 Provider。

### 2026-10-24 Provider 思考开关（默认关闭；本机镜像已部署）

- `AURALIS_AI_THINKING_ENABLED` 默认 `false`，由 Provider bean 读取。所有普通/结构化 completion 与流式请求共用同一请求体控制：DeepSeek 显式发送 `thinking.type=enabled|disabled`；OpenAI-compatible 仅在 `AiCredential.baseUrl` 的 URI host 精确为 `api.xiaomimimo.com` 时发送该字段。
- 该专有控制当前只覆盖 DeepSeek 与官方 MiMo host。未知 OpenAI-compatible endpoint 不注入字段；任意自定义代理或模型自身推理不能由此开关保证关闭。Structured JSON、输出 token 上限、温度和 usage 行为不变。
- 本机 `.env` 为 `false`。本机 backend 镜像于 2026-10-24 22:46:29 更新，digest 为 `sha256:5f65ebbd89c097092109fde92067a6c4975deb808e5f6d904c9d4a92204d487c`；该镜像含 thinking 配置，不含本节前述的自适应阶段提示词候选。部署时 Provider class SHA-256 `6E9528319CD569502908FC9C266C826AD672A5DA2918627C3D467069DE4D76FB` 与 thinking 候选一致。本节不代表真实 Provider 验收。

### 2026-10-24 ADAPTIVE_INDEX 根外 summary 窄结构修复（源码与定向用例已补充；未部署）

- 首根局部严格 reader 必须自行创建并读取 parser，不能把 `STRICT_DUPLICATE_DETECTION` 只设置到 reader 后再传入普通 Mapper 创建的 parser；后者在 Jackson 3.1.4 不生效。已修复该首根重复字段误接受问题，新增根对象/嵌套 section 重复字段拒绝且不保存 checkpoint 的回归，隔离候选 Adaptive 58/58、exit 0；未部署、未调用真实 Provider。
- `OverviewDocumentValidator` 增加独立于 `deferAliasValidation`、默认关闭的显式结构修复参数；Service 只对 `ADAPTIVE_INDEX` 主响应及其 JSON repair 响应开启，其它 purpose 保持原行为。`overviewOutputRecoveryEnabled` 仍只控制既有 Provider JSON/coverage 等恢复，不推断或开关该结构能力，未新增全局配置。
- 仅首次正常 `readTree` 失败后，才以局部严格重复字段检测解析首个 object；首根不得已有 `summary`（包括 null）。首根结束后的后缀仅以严格 JSON wrapper 接受恰好一个 `summary` 字段、一个合法 JSON 值并消费到 EOF，局部启用 `FAIL_ON_TRAILING_TOKENS`；额外 `]`、重复字段、其它尾部和多根均拒绝，不使用正则截断或通用删逗号/括号。字符串中的括号、转义引号和嵌套 summary 不参与边界判断。
- 合并结果重新经过原 schema、summary shape、alias/coverage/mode/内部 shape 校验，合法冗余 summary 仍由既有规范化置空。任何候选失败保持原解析失败语义。主索引 prompt、请求数据、通用算法版本及 checkpoint key 不变；成功保存正常 primary checkpoint，不新增 Provider 调用，原 `PROVIDER_RESPONSE` 与 `VALIDATED_OUTPUT` 继续分别记录。历史失败 trace 不作为 checkpoint 采纳。
- `ADAPTIVE_INDEX` 的 Provider JSON repair 改用独立 system instruction，不再拼接公共 ALL 或原索引 materials 指令；保留不可信输入、禁止新增事实、授权 alias、locator=null、schema/数量长度限制及 summary=null。repair userData 使用专用 requiredSchema、`expectedSummary:null`，不含 materials；仍最多一次。其它 purpose repair 不变。
- `OverviewAdaptiveGenerationTests` 已加入合成成功/拒绝/边界、coverage、专用 prompt、缓存键与重试复用、trace 分离回归；统一编译/定向测试证据见当前状态。无公开 API、数据库、前端或算法版本变化；未部署、未调用真实 Provider，真实资料与业务质量未验收。

### 2026-10-24 Overview 阶段 3–7

自适应路由从不可变 topic catalog 建目录，writer 使用私有 detailedContent 契约并经 `OverviewBodyFormatter` 分段到公开 section；输出容量恢复使用持久 PLAN/RESULT 与 child checkpoint。ALL 导读在正文完成后进行一次同预算根的 ADAPTIVE_GUIDE completion。Preview NodeView 返回带独立 provenance 的全部 fragments。隔离候选中 Adaptive 48/48、Recovery 28/28、Preview PostgreSQL 10/10、Formatter 9/9 通过；末次两个受影响 Adaptive 方法 2/2、package、OpenAPI artifact 与 PC type-check 通过。Mobile type-check 有既有 `EventRequest/EventResponse` 引用缺失失败；受污染 full 855 tests（6 failures/29 errors/1 skipped）不作为通过证据，未在隔离候选重跑 full。未部署或调用真实 Provider。唯一只读 review 为 B0/I0/O0，发现的三项行为问题均已关闭。

更新时间：2026-10-24
文档状态：旧 Server 代码已归档；绿地重写阶段 5 AI/RAG 基线及 PC Tauri S1–S6 ParsedDocument schema/upload-intent/payload validator/complete 首胜/block indexing/cleanup 已实现；Chat 协议 1 使用持久化 run/attempt、V44 会话范围及冻结来源检索；R1 已完成 pgvector、请求并发保留、会话恢复键和受控流式验证；Subject 专属颜色已由 V19 移除并在本地 PostgreSQL 升级验证；Overview 阶段一、阶段二自适应索引候选已完成定向验证但未部署；ADAPTIVE_INDEX summary 规范化已部署且 readiness HTTP 200，批次别名提示修正 37/37、runtime review B0/I0，及 ADAPTIVE_METADATA summary 规范化 40/40、review B0/I0/O1 均已部署且 readiness HTTP 200。真实 Provider 与外部验收仍未完成
权威范围：Auralis-Server 当前实现、绿地目标模块边界、运行配置、验证命令和阶段状态。
事实来源：当前 Auralis-Server 源码、模块测试和本文所列隔离验证证据。

### 2026-10-24 Overview 阶段二轻量索引覆盖与一致性（源码与定向验证完成；未部署）

- `ADAPTIVE_INDEX_INSTRUCTION` 现要求索引主要与次生概念、定义、条件、例外、区别和冲突；按连贯学习目标组织，禁止一批一节、逐琐碎事实成节或为减少节数合并无关概念。`ADAPTIVE_ALGORITHM_VERSION` 升为 `overview-adaptive-v8-index-coverage-continuity`，隔离旧候选身份。
- 第二批起可携带前序索引最近 6 个 section 的只读元数据：chapter/section 标题分别最多 120 code points，summary 最多 240 code points，不含 unit/source alias 或 sourceIds。上下文仅在实际请求容量允许时加入，容量不足时从较旧条目开始省略；实际 `indexData` 同时用于 checkpoint、batch 复用和请求身份，不会把上下文视为授权材料。原始前后邻接上下文与 materials 规则保持不变。
- alias 漏绑、未知 alias、同节重复和空 section 的索引候选在 `overviewOutputRecoveryEnabled` 启用时可触发一次专用 `ADAPTIVE_INDEX_COVERAGE` 纠偏。该 purpose 只重放原批 materials、授权 alias 数量/缺失统计和有界缺失 alias 样本，要求返回完整替代索引；仍经 Gateway/Guard、调用与 Token 预算、deadline、checkpoint 和 trace。纠偏后必须重新通过现有 `requireCoverage`、内部 summary shape 和后续阶段校验；失败立即终止，不派发路由或 writer。主索引与 batch checkpoint 只保存纠偏后的完整结果。
- 为让未知 alias 进入 coverage 判定，`OverviewDocumentValidator` 新增仅内部索引候选使用的结构解析路径：只延后 alias 授权、重复与空引用判定，仍校验 schema、文本、chapter/section 数量和上限。该路径不可能返回未通过 `requireCoverage` 的结果，其他 purpose 和纠偏关闭路径继续严格校验。纠偏恢复动作使用符合 coordinator `[A-Z0-9_]{1,48}` 的稳定短标识，审计动作最多保留 64 条。
- 索引阶段不再用无法得知真实前序输出的占位上下文做一次性缓存预检；每批先按真实 `indexData` 查询自身/batch checkpoint，派发前仍由 `ensureAdaptiveCallCapacity` 与 Guard 检查实际调用和 Token 预算。`AI_TASK_BUDGET_EXCEEDED` 保持既有可恢复语义。
- 验证：`OverviewAdaptiveGenerationTests,OverviewGenerationCoordinatorTests,OverviewGenerationServiceRecoveryTests,AiOverviewServiceTests` 共 192/192，Maven exit 0；只读审查修复后 B0/I0/O1，OPTIONAL 为动作格式缺少直接回归断言。该缺口随后由 test-only 断言补齐：直接调用生产动作生成方法并验证固定前缀、47 字符和 `[A-Z0-9_]{1,48}`，`OverviewAdaptiveGenerationTests` 48/48、Maven exit 0；未在其他生产变更后再次复审。未运行全量、PostgreSQL/MinIO、真实 Provider、GUI 或部署。提示和合成测试只能证明结构、授权、纠偏接线与确定性容量行为，不能证明真实模型的知识完整度、粒度质量或术语稳定性；需真实资料验收。

### 2026-10-24 Overview 阶段一结构感知原文准备（源码与定向验证完成；未部署）

- `TextChunker` 在保留 ordinal、normalized-text UTF-16 range 与既有 overlap 契约的基础上，优先选择段落、句子与行边界，并保护容量内的 fenced code、Markdown 表格、多行公式和编号列表；超长结构回退到行或 Unicode code-point 安全边界，不切开 surrogate pair。仅自适应索引准备的二次拆分复用该结构边界逻辑，writer 分组拆分保持原实现。
- Adaptive inventory 仅在相邻 chunk 的 ordinal、generation、range 与真实前后文本均吻合时裁去 overlap，同步前移 `charStart`；整段仅为明确 `Page N [of M]` / `第 N 页` 类页码的 chunk 不分配 unit alias。不按长度、相似度或主题猜测删除正文。
- 索引批次在同 Source/revision 的批边界附带最多每侧 240 个 UTF-16 字符的只读前后文；上下文字段不含 unit alias，授权 materials、coverage 与 writer 输入仍只使用本批/已路由单元。算法版本升为 `overview-adaptive-v7-structure-aware-index-context`，隔离旧输入和 checkpoint；公开 API、数据库 schema 与后续规划/写作/装配规则未改。
- 这些确定性保护只能降低边界断裂风险，不能证明条件—结论、指代或跨批主题在真实模型中语义完整；一般页眉页脚、短段落与参考文献不按“噪声”自动删除。真实 Provider 与内容质量验收仍未完成。
- `AiIngestionTests,AiSourceChunkTests,SourceChunkProvenanceTests,OverviewAdaptiveGenerationTests,AiQualityFixtureContractTests` 共 61/61，Maven exit 0；唯一只读审查 B0/I0/O0。日志 `D:/Temp/auralis-overview-phase1-tests.log`。未运行全量、PostgreSQL/MinIO、真实 Provider、GUI 或部署。

### 2026-10-24 输入估算本机候选已部署

- Overview 输入估算、正文预算与恢复链路已随当前 backend 部署；本机 `calibrated-category` 有效，基础默认仍 `legacy-bytes`。镜像 `sha256:72f6a41df02f8497fe32d2d0c3cbb18580ed2671b1c233ec9b41a95f658cc49d`，healthy/readiness UP，唯一只读 review B0/I0/O0。
- 离线 gate PASS、相关 43 项和 package 通过；没有真实 writer 样本，Provider/正文质量仍待用户实测。完整原始 full stdout 的留存缺口与未重跑范围见 `D:/Temp/auralis-budget-step3-20261024/final-handoff.md`，不得声称 full suite 全绿。部署没有主动触发 Provider，缓存及账本保留。

### 2026-10-24 ADAPTIVE_WRITE 正文预算路径（源码与定向验证完成；未部署）

- 正文 writer 输出预留按完整序列化 writer 输入与结构负载估算，范围为 4608–6144 tokens；4608 是缺少真实 writer 样本时的保守工程下限，不代表内容质量已验证。长材料继续使用 6144 上限与既有拆分，不按剩余额度压缩原文或输出目标。
- 同一派生 cap 用于 packing/context fit、平台 writer preflight、Provider `maxTokens`、Gateway/Guard reservation、截断判断及 checkpoint/journal node 身份；descriptor 与 donor lookup 使用相同 writer step。预算拒绝继续沿原 generation/budgetTaskId、已结算 usage 和已验证 checkpoint 恢复。预算不足通过现有 `AI_TASK_BUDGET_EXCEEDED` 响应，不新增 PAUSED 状态、API 字段或数据库结构。
- writer budget forecast 记录同一 generation/budgetTaskId 下的 verified 与剩余 writer 数、单次 reserve 和 aggregate upper forecast。平台进度记录 task-scoped charged（实际与保守估算可能混合）、reserved 在途额度和配置剩余额度；BYOK 只输出实际计量和 forecast，不执行平台 token 额度拒绝。预算停止、恢复与完成日志可按同一预算根关联，不包含 prompt、正文或其他用户/全局额度。
- writer 进度与全 checkpoint 命中的预算快照、以及恢复时附加的预算根 trace 都是 best-effort 诊断：读取或记录失败只写安全诊断告警，不改变生成、缓存装配或 owner lease 生命周期。用于准入、Provider 派发前评估和 coordinator 结算/失败持久化的业务读取仍保持原有失败语义。
- Maven 定向及 PostgreSQL service-level recovery 验证结果、命令和边界见 [当前状态](../current/Status.md)。真实 Provider writer 样本、内容质量、部署和 GUI 未由源码或合成测试证明。

### 2026-10-24 Overview completion 输入估算接线（离线 holdout/full/package gate 待完成；未部署）

- `AiInputTokenEstimator` 统一解析 Profile。仅显式 `calibrated-category` 模式、DEEPSEEK、精确 requested model `deepseek-v4-flash` 和规范化官方 `https://api.deepseek.com` endpoint 可选择分类 profile；其他身份维持 UTF-8 bytes。分类 profile 仅用于 Overview 非流式 MAP/REDUCE completion，Chat、stream、embedding 不变。
- 分类 profile 对每条满足保守形态谓词的 message，将 Han 字符 run 按现有 category base estimate ×2 估算，其他字符保留 UTF-8 bytes；其它 message 原样按 bytes。全请求一次性加 `max(64, 4 × messageCount)` framing/margin，并 clamp 到 legacy `UTF-8 bytes + 4/message`。含异常 Unicode、unsupported script/shape、极长 Latin/digit run、未完整合法 JSON 的 JSON 形态或计算异常时，该 message 回到 bytes；resolver 身份未知则整个请求回 legacy bytes。Gateway 的原始请求 UTF-8 safety cap、Guard 原子 reservation 与 usage settlement 不变。
- Overview context fit、preflight、`fits` 和 Gateway reservation 使用同一配置与 provider/baseURL/requested-model resolver；记录 estimator profile/strategy 与安全计数，不记录 prompt/key/credential。Estimator identity 仅用于预算评估与诊断，不改变已验证 checkpoint/content profile fingerprint。输出 cap、prompt 原文与已完成缓存命中预算行为不变。
- `AURALIS_AI_OVERVIEW_INPUT_TOKEN_ESTIMATOR_MODE` 默认 `legacy-bytes`。纯离线 replay 对6个trace run的40次请求按 system/user hash 去重为34对；其中25个支持形态且完整 usage 的独立 prompt 对均未低估，INDEX覆盖15/24、METADATA 8/8、ROUTE 2/2；最低估算/actual coverage 322.86%，相对旧 bytes reservation 总量减少16.77%。该结果只覆盖当前本机 trace 形态，不构成通用 tokenizer 或模型行为校准；trace 运行结果均为 FAILED，writer 样本为0，不能推断写作正文场景。usage 缺失时仍以 reservation 保守结算。本轮 full suite 为836/837通过，唯一错误是 replay test stage 聚合的 null-safe 测试夹具问题；修正后相关定向批次43/43通过，package通过。review、部署和本机 Provider 验收状态见 [当前状态](../current/Status.md)。

### 2026-10-23 ADAPTIVE_INDEX summary 规范化运行态（已部署；readiness HTTP 200）

- 合法冗余 summary 的规范化修正已部署；当前后端 readiness 返回 HTTP 200。该运行态检查仅证明服务就绪，不代表真实 Provider、生成成功或内容质量验收。

- ADAPTIVE_INDEX 批次别名提示修正已部署：backend healthy、readiness HTTP 200，追踪/adaptive 配置与 D 盘采集 bind 已确认。未调用 Provider；真实生成及内容质量仍待用户验收。`D:/Temp/auralis-index-alias-fix-20261023/startup/handoff.md`。
### 2026-10-23 ADAPTIVE_METADATA summary 规范化（已部署）

- 内部 ADAPTIVE_METADATA 在 ALL 模式下将 summary 规范化为 null，适用于新响应和恢复的旧 checkpoint；普通 INDEX summary 保持原样。backend healthy/readiness HTTP 200，trace/adaptive flags 与采集 bind 已确认。未触发 Provider；真实资料生成及内容质量验收待用户完成。证据：`D:/Temp/auralis-metadata-summary-fix-20261023/startup/handoff.md`。
### 2026-10-23 Overview M5.4：正文 checkpoint 跨任务复用（源码、分批定向验证与唯一审查完成；未部署）

- `findReusableAdaptiveWriterCheckpoint` 限同 owner/scope、完整 input/profile/algorithm 与 exact prompt-derived writer step 的 SUCCESS donor；连接 checkpoint 至 VERIFIED execution node 和 ASSEMBLED plan，校验 checkpoint/node hash、plan fingerprint、descriptor hash/inclusion，并要求 node 当前 attempt 的 `overview_execution_calls` 关联到 `ai_usage_reservations.request_dispatched=true`。无真实 dispatched reservation 的 cache-materialized node 不能作为 donor。
- 当前 generation checkpoint 优先。writer `beginAttempt` 在执行期 donor lookup 前运行；unknown dispatch / `RECOVERY_REQUIRED` 保持 hold。命中后继续现有 response validator、current owner/source、shape/coverage 校验，并经既有 `verifyAndSaveCheckpoint` 事务物化本代恢复 checkpoint及 VERIFIED node。此操作不更新 donor checkpoint/TTL；命中不新增 reservation 或 usage-call，记录 donor ID，不依赖持久 origin 字段。
- preflight 使用同一 donor predicate；donor 在 preflight 后到期时按原 miss/Guard 处理，可能预算拒绝。现有 assembly/provenance/assembled-plan/writer/journal 路径继续运行；M5.2 batch 与 M5.3 planning 复用保留。
- 两份后端源码及两份测试变化；无 API/schema/migration/frontend 变化。首轮 55 项 52P/3E；affected 首轮 3P/1F；unknown-only 1/1、final affected-only 4/4 exit 0，未重跑55整批。唯一只读 reviewer B0/I0/O0。未运行 PostgreSQL/full/package/OpenAPI-SDK/Provider/GUI/Docker/部署。详见 `D:/Temp/auralis-overview-m54-20261023/final-handoff.md`。

### 2026-10-23 Overview M5.3：目录规划跨任务复用（源码、分批验证与唯一审查完成；未部署）

- 同 owner、scope、profile、algorithm、完整 generation input 与 exact prompt-derived step 匹配时，可只读复用 SUCCESS generation 的 `ADAPTIVE_ROUTE`、`ADAPTIVE_METADATA` 或 `ADAPTIVE_METADATA_ROUTE` checkpoint，包括必要层级 metadata。Donor 还须通过 result 到期、checkpoint 14 天窗口与 payload SHA/schema 校验；执行前保留现行 owner/current-source 与 route coverage/shape 校验。当前 generation checkpoint 优先；donor 不复制、不延寿。
- 命中规划 checkpoint 后继续原 writer 与持久 journal；不跨任务复用正文，M5.2 index-batch path 保持不变。Planning cache hit 不产生虚假 Provider usage，writer 的现有 Provider 调用照常执行。
- gpt-6-luna high 实现。首轮 Maven 批次 50 pass / 1 error（Adaptive 28/28，Coordinator 22/23）；fixture lease-order error 归因后，仅 affected test 复验 1/1、exit 0，未重跑整批。唯一只读 reviewer 结论 B0/I0/O1；O1仅为文档同步项，本次回写处理，未做文档更新后复审。四个源/测试文件之外未改本轮其他文件；无 API/schema/migration/frontend 变化。

### 2026-10-23 Overview M5.2：索引 batch 指纹与 checkpoint 复用（源码、定向验证与唯一审查完成；未部署）

- `index_batch_v1_SHA` 将 system prompt、`indexData` 与有序完整 `AdaptiveRawUnit` 记录绑定为 batch 身份。新生成任务先用自身 checkpoint；缺失时仅同 owner、scope、profile、algorithm 的 SUCCESS donor 可提供相同 batch。donor checkpoint 的 input fingerprint 必须与其 donor generation 相等；同时验证 payload SHA/schema、checkpoint 14 天有效期与 result 到期。原 M5.1 完全相同 task input 路径仍保留；使用前继续现行 Source/owner 与 index coverage/shape 校验。
- donor checkpoint 只读，不复制、不延长寿命。只有本任务实际发起 Provider 生成并通过 coverage/shape 校验后，才保存关联当前请求 input fingerprint 的 batch checkpoint；变化 batch 不与旧结果拼接。命中仍继续当前目录与正文流程。
- gpt-6-luna high 实现并验证；隔离 D 盘 Maven 定向批次 `-Dtest=OverviewGenerationCoordinatorTests,OverviewAdaptiveGenerationTests test` 为49/49（22+27），exit 0。唯一只读 reviewer（gpt-6-luna high）B0/I0/O0。初次 fixture 序号错误已归因并仅调整注入位置 8/9→14/15，原 dispatch 断言保留。无公开 API/schema/migration/前端变化；未做 full/PostgreSQL/package/Provider/GUI/部署验收。


### 2026-10-23 ADAPTIVE_INDEX 冗余 summary 规范化

- `ADAPTIVE_INDEX` Provider 响应若包含合法的冗余 `summary`，服务端在通用文档解析后将其规范化为 `null`，保留 outline 与 provenance；checkpoint 写入和恢复均使用规范化响应。原 Provider 响应仍由追踪记录，后续 index coverage、outline 形状及其它阶段校验保持现行规则。其它 purpose 不应用此规范化；无公开 API、数据结构或迁移变化。

### 2026-10-23 ADAPTIVE_INDEX 批次别名提示

- index 请求投影仅向 Provider 暴露本批 `unitAlias`、标题、ordinal 与文本，并明确 `sourceIds` 只能引用本批 unit alias；内部 `sourceAlias` 与真实 source UUID / chunk / revision provenance 保持原样，用于 owner/source 绑定、验证映射与最终 provenance。index batch 与 checkpoint fingerprint 已包含 system prompt 和请求数据，提示投影变化会自动隔离旧别名提示生成的缓存；validator、coverage 和 route/writer 围栏不放宽。无 API、数据库或前端变化。
- `OverviewAdaptiveGenerationTests` 定向验证 37/37，Maven exit 0；未运行全量测试、PostgreSQL/MinIO 集成、真实 Provider、GUI 或部署。证据：`D:/Temp/auralis-index-alias-fix-20261023/final-handoff.md`。

### 2026-10-23 Overview 全流程追踪采集器（实现、验证与唯一审查完成；未部署）

- 新增独立 `ai.diagnostics` 追踪端口、不可变事件、配置和文件采集器；同步 Source/Subject 与 adaptive 后台执行路径发安全事件，覆盖输入、索引/规划/写作、Provider 前后、校验修复、缓存命中和终态。Provider 输出指 `AiProviderPort` 返回的 content，不是 HTTP envelope、网络流或模型私有推理。追踪只观察既有请求、dispatch binding 与响应 usage，不改变 Gateway/Guard、预算、Provider 次数、业务状态或事务；缓存回放不记作 Provider 调用。
- `AURALIS_OVERVIEW_TRACE_ENABLED` 默认 false、`AURALIS_OVERVIEW_TRACE_CAPTURE_CONTENT` 默认 false，`AURALIS_OVERVIEW_TRACE_DIRECTORY` 默认 `/app/overview-traces`。关闭时不创建采集器、线程或目录；启用后仅元数据默认采集，正文由独立 opt-in 控制。文件落在 owner UUID/run UUID 目录，固定包含 NDJSON、JSON 汇总与 Markdown 报告。事件写盘采用有界单写者；采集错误只使记录不完整，不改变业务结果。
- 字段/事件/队列和存储上限、24 小时 root-preparation 清理触发、内容采集语义及本地文件删除边界见[基础设施模块](Infrastructure.md)和[实施计划](../plans/2026-10-23-overview-test-tracing.md)。无 API 或数据库 schema 变化。
- 验证：focused 87/87、全量 Maven 813/813（0 failures/errors/skips）、`-DskipTests package` exit 0；唯一只读 reviewer B0/I0/O0。未运行真实 Provider、部署、GUI 或业务内容验收。

### 2026-10-22 M5.1：完全相同输入的跨任务轻量索引复用

- 新生成任务先读取自身 checkpoint；缺失时，仅 ADAPTIVE_INDEX 可查询同 owner、scope、完整 input fingerprint、profile、算法和 prompt step 的 SUCCESS generation。读取同时检查 result 到期和 checkpoint 14 天有效期，以及 payload SHA/schema；使用前继续执行现行 Source/owner 校验和索引 coverage/shape 校验。
- 复用现有 overview_generation_checkpoints，只读命中，不复制缓存、不延长原条目寿命、不新增表或迁移。目录和正文仍执行当前生成流程；命中不派发 Provider、不伪造 usage，记录 ADAPTIVE_INDEX_CACHE_RETURN。预算预检识别可复用索引。
- 本小节只覆盖完整输入未变化时的新任务复用；资料局部变化、节点级依赖失效、目录/正文跨任务缓存及完整删除生命周期仍属于后续 M5，不能据此标记 M5 完成。现有前端流程保持。
- 验证：D 盘隔离源码运行 OverviewGenerationCoordinatorTests 21/21、OverviewAdaptiveGenerationTests 26/26，共 47/47，Maven exit 0。覆盖跨 owner/输入/profile 隔离、过期、损坏拒绝及生成链路跳过索引而继续目录/正文。当前为 H2/合成 Gateway 证据，未运行 PostgreSQL、全量测试、打包、真实 Provider、GUI 或部署。本轮依用户要求由主模型直接实现并检查，未启用子代理。
- 证据：D:/Temp/auralis-overview-m51-20261022/targeted-tests.log 与 handoff.md。更早前端回退的四项失败未由本轮处理；此前范围审计按用户最新要求暂置，尚无完整审计结论。
### 2026-10-22 Overview M4 PC candidate adoption（源码、相关验证与唯一审查完成；隔离浏览器后端接口流程完成；未部署）

此处仅记录当时的 Server 侧实现与验证。2026-11-12 已移除 candidateInput、publication、preview/section 旧接口，现行契约见本文件顶部及 API 文档。回退前隔离浏览器流程只证明当时的接线，不能作为当前 PC UI 验收。

- 现有 Source/Subject formal result PUT 接受可空 `candidateInput {jobId,jobVersion}`；独立 resolver 按 owner、scope、job version、current raw snapshot、profile/algorithm 与 assembled plan 重建服务端 descriptor。继续使用 active authorization、source revision、identity/provenance、partial summary、CAS、clientWriteId 与 exact receipt；不依赖旧 Subject FILE part versions，不自动发布或 rebase publication intent。
- M4 无 Server migration；PC local schema v13。backend full 774/771P/1F/2E，affected group 3/3；SQL NULL bind 42P18 fix 的 PG 回归 1/1，post-fix skipTests package Maven/Docker 0/0，新 JAR 93,458,173 bytes，SHA-256 `b3da690b3d9cae5c0d73f13e2f2c0fc44780274773b41533d9621b16ea0fe6ef`。唯一 final source-type-fence delta review B0/I0/O0 new，原 O1 保留。隔离浏览器通过合成 Provider 验证真实后端接口流程；未接用户业务数据库、真实 Provider 或部署。API artifacts 未因 SQL 修复重新生成；先前门禁证据保持独立。

### 2026-10-22 Overview M3.4 正式发布与已验证分节读取（源码、相关自动验证与唯一审查完成；未部署）

- 候选接线把 native Source/Subject job 的选定 raw source/chunk snapshot 显式绑定到正式 result 的 outline/summary part；保留现行 `OverviewResultService` owner/currentness/CAS/write receipt boundary，不伪造历史 Subject FILE part versions。
- 新增 publication intent 两阶段入口、scope-filter reconnect list、VERIFIED-only plan preview 与 formal outline/section reads；正式 outline 仅返回稳定身份、路径、标题及 chapter metadata，不返回 section 正文或 summary，正文按当前版本通过单节读取。completion candidate、result、exact receipt、intent 状态分离并由本地 DB transaction fence。V37、API artifacts、package 和相关 PostgreSQL/API 测试已完成隔离门禁；完整 full run04 有失败并保留，受影响组定向复验闭合。未部署或调用真实 Provider；自动验证不代表 GUI/内容验收。详见 [M3.4 计划](../plans/2026-10-22-overview-m34-publication.md)。

### 2026-10-22 Overview M3.3 持久后台作业（源码、相关自动验证与唯一审查完成；未部署）

- OverviewJobController/Service/Repository/Worker 为自适应 Source/Subject ALL、OUTLINE 提供持久 job API、owner-scoped 查询、数据库 claim/fence/lease、限界 executor 与 pause/resume/cancel/reconcile 控制。worker 复用现行默认关闭的 overview-adaptive-generation-enabled 开关；同步生成路由保留。
- 首次 claim 固定绝对 deadline；pause、resume 与 worker 接管沿原 job/generation/budget 继续，不重置期限或累计 usage。全部 Provider reservation（index、目录/metadata、writer、repair）由 generation invocation journal 精确关联，并在 dispatch 前通过 Guard transaction callback 校验 job/generation owner、fence、lease 和控制状态。
- raw budget_task_id 保持原始预算 UUID；invocation task_id 使用 AiUsageGuard 的稳定派生 ledger UUID UUID.nameUUIDFromBytes((userId + ":" + feature + ":" + rawBudgetTaskId).getBytes(UTF_8))。预算、结算与同预算安全重试语义不变。未知派发 usage、缺失或错配关联继续 hold；cancel 不承诺撤回远端调用。候选不自动发布到正式 OverviewResult/KB/Review。
- 相关自动验证、package、OpenAPI/SDK 对照与唯一 review 已完成，细节及失败批次限制见 [M3.3 计划结案](../plans/2026-10-19-overview-m33-background-jobs.md)。未部署，未使用真实 Provider/生产业务数据库，未完成 GUI/内容质量验收。正式发布与预览由 M3.4 完成；PC consumer 曾在后续接入，现已按用户决定撤回。

### 2026-10-19 Overview M3.2 writer execution journal（源码、相关验证与唯一审查完成；未部署）

- Adaptive Source/Subject ALL/OUTLINE 在 writer 分组和预算预检后，保存完整有序 plan 与每个 writer node 的来源/revision/chunk/generation/ordinal/content hash/range 描述。私有 JSON 不存原文正文、凭据或完整 prompt；不改变 Provider 四字段 canonical JSON。
- `OverviewExecutionJournal` 在短事务内按 user→generation→plan→node→call 锁序执行当前 owner/fence 校验。scope reservation callback 在 Gateway 派发前保存真实 reservation UUID；主 writer 与递归 JSON repair 共享当前 node/attempt binding。writer 的完整结构、section shape 和授权 unit 覆盖校验成功后，主 checkpoint 与 node VERIFIED 原子提交；generic parse/repair checkpoint 不提前固化该 writer step。
- Takeover 仅复用身份匹配且 hash 完整校验的 VERIFIED checkpoint；缺失 checkpoint 只在精确关联的历史 reservation 都已知安全后允许新 attempt。仍派发、派发后未知或关联不完整时显式 hold。新 profile/算法/输入保留旧 plan 与预算历史；不以另一个 profile 或 task 绕过 unknown。当前算法版本提升以隔离旧 checkpoint。
- 相关验证：全量 backend attempt 为 737 tests / 731 passed / 2 failed / 4 errors / 0 skipped；之后对应六个失败用例定向 6/6，通过 reviewer 修复后新增 PostgreSQL 方法单独 1/1。全量套件未在修复后重跑。`-DskipTests package` 成功，JAR 93,303,380 bytes，SHA-256 `D6EA3279DD60D47BF7B8F8068162A2A828A6B1801063FD1C864848D296A046C4`。唯一 reviewer BLOCKER=0 / IMPORTANT=0 / OPTIONAL=0。未部署，真实 Provider/生产数据库及 GUI 未验收。详见 [M3.2 计划](../plans/2026-10-19-overview-m3-execution-journal.md) 与 D 盘验证报告。

### 2026-10-19 Overview M3.1 分层目录规划（源码、相关验证与唯一审查完成；未部署）

- 小输入继续使用现行单次有界目录调用；聚合索引 prompt 不适配时，分层 metadata 分组整理及最终目录路由仅重组 metadata。每个计划 alias 仅在应用私有映射中绑定有序原始 unit aliases；最终目录展开、按 inventory 顺序规范化后沿用现有 writer 分组及 M2 provenance。
- 层级限制为最多 4 层、64 次 metadata 分组调用、累计 2000 个 metadata 输出项，raw inventory 仍最多 500 条；最终 60 章/500 节、每节 100 refs、payload、单元正文、Guard/父任务/总预算均沿用原限制。无进展、单条不适配或超限明确失败。metadata 不接收原文或已验证正文。
- 算法版本已提升以隔离旧 checkpoint，不承诺跨算法读取/回退。focused 初始两类 batch 为 47/46P/1F；唯一失败方法 attempt 4 单独 1/1 通过；未重跑整套47项。唯一 review B0/I0/O0。未调用真实 Provider、业务数据库或部署，未完成 GUI/语义质量验收。完整证据见 `D:/Temp/auralis-overview-m3-planning-20261019/final-validation-report.md` 与 `reviewer-final-report.md`。

### 2026-10-19 Overview M2 稳定身份与来源关联（实现、相关验证与复审完成；未部署）

- `OverviewResultCommand` 接收独立 `outlineIdentity`（schemaVersion 与完整节点 path/nodeId）；服务端仅接受当前结果已有 nodeId 或为 null 的新节点，分配 UUID 并重新计算 contentHash/contentVersion。标题改名保留身份，实质内容变化升版，纯排序不升版；旧结果 GET 为 null/false，不隐式初始化。SUMMARY 写入保留当前 metadata。
- `OverviewResponse` app-only `outlineProvenance` 在 Provider 四字段 canonical 校验后由应用附加，经过受信 alias 映射、缓存/replay 和结果保存。保存时从 owner/source/revision/active generation 的持久 chunk provenance 重建 canonical refs；缺少旧 chunk metadata 时不推断 block/page。
- V34 clean/upgrade/事务 PostgreSQL 回归通过：`OverviewIdentityPostgresIntegrationTests` 4/4，`TaskColorRemovalMigrationTests` 6/6。此前 full clean run 为 723 tests/1F/4E/0S；各失败类随后均定向通过，未重复完整套件。最终 OpenAPI 13/13、官方 artifact 与两端 SDK byte-identical、PC type-check、package 均通过（详情及 hash 见 `D:/Temp/auralis-overview-m2-20261019/final-validation-report-attempt13.md`）。Mobile 仍有既有两个 Event SDK 类型错误。真实 Provider、生产业务库、部署和 GUI 未验收。

### 2026-10-19 内容规模自适应总览 M1（源码、自动门禁与复审通过；未部署）

- 默认关闭的 `auralis.ai.overview-adaptive-generation-enabled` 开启后，Source/Subject 的 ALL、OUTLINE 使用当前所选 READY Source 原文，经过轻量索引、单次有界目录规划、按节原文写作与程序装配；SUMMARY 保留现行短摘要语义。公开 `OverviewResponse` shape 不变。
- 适配 inventory 通过 `SourceChunkRepository` 的 owner/source/active/ordinal 有界 List 查询读取所有选定来源，最多 500 条 active 原始 chunk row（空白 row 也计数）；读取剩余容量加一条 sentinel，命中即在完整 identity/hash 与 Provider dispatch 前明确拒绝。接受的输入不截断。适配 Source 不先读取 legacy 全量 List；preflight 在有界 inventory 后结束。来源修订围栏仍独立重读原文身份。
- 调用沿用 Gateway/Guard、父任务、凭据来源、期限、取消、完整 JSON 校验、一次 repair 与 checkpoint。平台预算预检通过真实 TaskLease/Guard owner fence 取得 task scoped occupancy snapshot，admission occupancy 与 Guard 一致；charged 和活动 reservation 分开，审计 `taskUsageForOwner` count 语义不变。snapshot 契约不可用时按契约/服务错误失败；BYOK 保留技术限制与计量，不扣平台财务上限。
- M1 初始目录规划仅为一次有界 aggregate-index 请求；该限制已由 M3.1 有界 metadata 层级规划取代。M3.1 不支持任意规模或语义无损保证；M3 后台 jobs、暂停/恢复和发布仍待交付。
- focused attempt4：7 suites / 175 tests / 0 failures / 0 errors / 0 skipped，Maven exit 0。Full attempt6：122 suites / 711 tests / 0 failures / 0 errors / 0 skipped，Maven/Docker exit 0（4:17）。这些是 M1 证据。M3.1 验证结果见本页开头的新阶段记录。
- Package `-DskipTests` Maven/Docker exit 0；JAR 93,205,090 bytes，SHA-256 `E9637F9615EC6B7EB445C36CE18E89F7ACC9948965067832A18DD12543E6305B`。Synthetic Compose false/true `config --format json` 均 exit 0，渲染值匹配开关；只渲染、未启动服务。Final input manifest SHA-256 `CC21E28C7D7C9C5F72158B1F25321BA901D62174DFE085308B05EEAD4A22FE31`，12 owned + 2 context paths 的 source/snapshot/workspace/live hash 一致。
- 唯一 reviewer 的最终 correction delta 为 BLOCKER=0 / IMPORTANT=0 / OPTIONAL=0；bounded-inventory 问题已关闭。之后仅增加测试 `Mockito.verify` 静态导入，focused/full 已覆盖该候选，逻辑和断言未变。中间环境、导入及 harness 重试仅保留在 D 盘历史证据中。
- 未部署；本轮未调用真实 Provider、生产/业务数据库，未完成 GUI 或内容语义质量验收。任务隔离 PostgreSQL 测试不代表生产/业务数据库验收。完整 M2–M6 仍未交付。

### 2026-10-16 unified AI operation policy and provenance

All existing Provider entry points still use `AiInvocationGateway`. A central immutable operation matrix validates operation kind, feature, stage, actual scope method, and trusted output role. `AiSettingsService.ResolvedSettings` carries the resolved source beside the credential snapshot; Chat/Overview completions, Chat/Ingestion embeddings, and Provider setup metadata/test pass it explicitly on each call. Missing/unknown source fails before reservation as `AI_POLICY_CONTRACT_VIOLATION`.

`AiUsageGuard` persists operation kind and source per reservation. Shared concurrency, leases, cancellation and settlement continue to cover all sources. Platform task/window quotas include confirmed platform calls and NULL-origin history; BYOK retains ledger audit without consuming platform task or window quotas. Learning Turn/Draft are registered synthetic operations with all-origin one-call stage rules and no learning business-layer dependency. Scope exposes its actual task ID, with an internal owner-scoped query restricted to an explicit operation-kind set.

Overview passes FINAL/INTERMEDIATE into the Gateway and uses platform-only task usage for platform preflight. BYOK does not inherit the 24-call/524288-token platform precheck; its model-context, request, output, deadline, cancellation and existing finite recovery protections remain active. The `/api/ai/usage` window fields remain platform quota figures and `allCalls` adds all-time source-separated actual/unknown/charged/reserved audit totals. Automated verification, PostgreSQL migration/competition checks and runtime acceptance are reported separately.

### 2026-10-16 离线 usage reader 分开报告实际 usage 与 shadow 覆盖（定向测试通过；未部署）

- `scripts/aggregate-ai-token-shadow.mjs` 的 JSON summary、分层 CSV 与 CLI 摘要现在分别输出唯一、无冲突、已派发 ledger 中 actual usage 完整/未知数，以及 missing shadow event、matched shadow usage unknown 和歧义 join 数。actual 完整要求 ledger 的 input 与 output 都非 NULL；NULL 不从日志补填，charged exposure、legacy `unknownUsageCount`、accuracy 样本资格、`INCOMPLETE` 和 exit 2 语义保持。
- 合成回归覆盖完整 actual 缺 shadow、完整 actual 匹配 unknown shadow、NULL actual 缺/unknown shadow、zero actual、未派发和冲突 duplicate。现有 27 项测试加 2 项新增用例共 29/29 通过。离线 46-ledger / 7-shadow 复算为 actual complete 46/46、actual unknown 0、missing shadow 39、matched unknown 0、ambiguous 0、accuracy sample 7；这些 39 项是比较覆盖缺口，不是实际用量未知。估算仍 uncalibrated，未减少 Provider 消耗；报告在 `D:/Temp/auralis-usage-research-20261016/research-report.md`。

### 2026-10-16 RAG 引用证据片段改为有界 query-aware 选择（历史验证记录）

- `RetrievalService` 将当前 query 传入 citation 构建；每段仍最多 400 个 Java 字符。遇到通用定义/含义问题或明确引用术语时，会在 chunk 前 65,536 字符内以有界扫描寻找焦点词，并优先选取邻近定义线索的连续原文窗口；没有匹配时保留原前缀行为。截取会避开拆分 UTF-16 surrogate pair。
- 当时的验证保留了 `PromptAssembler` 使用相同 `excerpt` 的行为。现行 `ChatReadTools.search` 将 source/chunk ID 和 `excerpt` 作为工具证据返回，检索范围见下方 AI/RAG 实现边界。
- RED 在修正合成 fixture 的目标偏移后为 17 项中 4 项失败；GREEN 的 `AiRetrievalTests` 与 `PromptAssemblerTests` 共 21/21 通过，包含选定来源隔离、后置单字定义命中及 prompt 接线。完整定向命令与限制见 `D:/Temp/auralis-rag-pass-definition-20261015/implementation-20261016/implementation-report.md`。真实 Provider 回答质量与 GUI 未验收。

### 2026-10-15 AI 影子观测与离线聚合（代码、定向、full/package 与复审完成）

- 内部 `AiProviderResponse`、stream chunk 和 embedding result 带有独立 Provider model identity metadata。Gateway 继续以安全 sanitizer 记录 request model，并把实际 response model 记录为 `observedModel` / `observedModelStatus`；`MISSING`、`INVALID`、`CONFLICT` 不会复制 request model。日志不包含 prompt、回复正文、凭据、endpoint URL 或原始异常。当前能力校准仍为 `char-category-v1-uncalibrated`，影子估算不参与 reservation、上下文或准入；Overview 24 / 524288 / 240 秒、Chat 2 calls 均保持。
- Compose 显式透传 `AURALIS_AI_SHADOW_TOKEN_ESTIMATE_ENABLED`，默认 true；false 只关闭观测日志，不切换 admission estimator。配置项和 internal model metadata 未改变公开 DTO、API 或 DB schema。
- 离线工具 `scripts/aggregate-ai-token-shadow.mjs` 不连接网络、Provider 或数据库，输入必须由操作者显式提供日志和 reservation JSON/CSV 投影；可选 `--reservations-format json|csv`、synthetic `--manifest`，并要求新输出目录 `--out-dir`。调用形态：`node scripts/aggregate-ai-token-shadow.mjs --logs <selected-log> --reservations <reservation-export> [--reservations-format json|csv] [--manifest <synthetic-manifest.json>] --out-dir <new-directory>`。输出 `summary.json`、`groups.csv`、`issues.json`；其状态始终标为 shadow-only / uncalibrated，actual NULL、conservative charged 和旧/候选估算分开保留。
- Reader 仅接受 bare marker、经验证的 `HH:mm:ss.SSS [thread] LEVEL logger -- AI_TOKEN_ESTIMATE_SHADOW` 前缀，以及 round4 实测的 ISO timestamp + INFO + numeric PID + 两个 bracket fields + `c.a.app.ai.usage.AiUsageGatewayService`（短名或全名）+ colon 前缀；不接受任意 logger。生产者和 reader 通过 reservation UUID 对齐，冲突身份隔离，原始行和值不写进输出。Incomplete join/输入输出 `INCOMPLETE` 并以 exit 2 返回，完整 synthetic CLI 示例 exit 0。
- 定向结果：provider/config/gateway/security 39/39（Config 8、Identity 5、Gateway 7、Security 19），synthetic Compose true/false render exit 0；offline CLI 27/27 exit 0，synthetic CLI 示例 `COMPLETE`，1 reservation、1 group、0 issue。D 盘统一快照 clean backend gate 116 suites / 674 tests / 0 failures / 0 errors / 0 skipped，Maven 与 launcher exit 0，Guard lock PostgreSQL 4/4；116 XML/TXT 已保留。同一快照 package exit 0，artifact SHA-256 `723919B7517A21B7A1C458F8708B3E6BFDE1E70DCF2D3478A45BA2894204A236`，508 项 manifest 与 canonical/live 零差异。最终 reviewer B0/I0/O3，三项 OPTIONAL 保持未改，详情见[当前状态](../current/Status.md)与[最终 review](D:/Temp/auralis-ai-observability-step2-20261015/review-report.md)（SHA-256 `519A055B986F8BD044556DE45DE486454DD59FB2F4D27C4BBB87A57D76D657EC`）。早期 C 盘空间阻塞与 runner 尝试历史见 [attempt 4 报告](D:/Temp/auralis-ai-observability-step2-20261015/final/attempt3-pg-auth-fix/attempt4-report.md)。实际部署和真实 Provider /业务验收未进行。

### 2026-10-15 四项历史门禁问题关闭与当前验证（round4 于 2026-10-14 通过）

- `KnowledgeBlockContentHash` 是唯一 UTF-8 SHA-256 helper，归属 `knowledge`；KnowledgeBlockService 与 ReviewLifecycleService 共用，当前静态依赖方向只有 `review → knowledge`。UTF-8 输入、SHA-256、小写 hex、null 前置校验及 trim 后持久化 hash 行为保留；Source event、事务边界、锁序和业务字段不变。
- Completion、Account deletion 与 embedding resume 修正是测试 fixture / assertion 更正，不改生产 retry、配额或时间 API。`AiOverviewServiceTests` 反射 fixture 明确选用 8 参数构造器；SlowDrip 的 synthetic TLS keystore 属测试运行输入。后端 clean test 115 suites / 666 tests 全通过；同快照 package BUILD SUCCESS。测试轮次、PostgreSQL 证据及 reviewer OPTIONAL 边界见 [当前状态](../current/Status.md) 与 [round4报告](D:/Temp/auralis-remaining-four-fix-20261014/final/round4/report.md)。
- 四项唯一 reviewer 结果 B0/I0/O1；O1 为最多 1µs response / `TIMESTAMPTZ` 精度差异，未改生产规范化。API DTO、数据库 schema / migration 未改变。真实 Provider、部署、GUI、模型列表或业务验收不由自动门禁证明。

### 2026-10-14 两项基线测试断言/namespace修正（历史定向验证；该时点未重跑完整后端门禁）

- `TaskColorRemovalMigrationTests` 在clean schema验证中断言当前Flyway latest V32；原V20升级与数据保留测试不变。Jackson guard允许Jackson 3保留的`com.fasterxml.jackson.annotation`，并以完整Java import识别拒绝其它`com.fasterxml.jackson.*` namespace；AI quality fixture改用`tools.jackson.databind`。
- 首轮定向命令覆盖migration/guard/fixture共11 tests、exit 0；reviewer提出whitespace import遗漏后只重跑Guard类2 tests、exit 0，最终只读复审B0/I0/O0。两次测试不合并计为13项。当前只改三个测试文件，没有生产代码、DTO、dependency、schema、API或configuration变更。
- 历史full clean仍为114 suites / 659 tests / 5 failures / 1 error / 4 skipped、exit 1；原4 skips已由单独Guard PG测试补跑4/4，未重跑完整full gate。此次定向修复只涵盖前两项，剩余4个失败/错误未改，完整门禁仍未通过。详细证据见 `D:/Temp/auralis-baseline-gate-fix-20261014/implementation-report.md` 与 `review-report.md`。

### 2026-10-14 AI 预算治理与 Overview 输出恢复（阶段0–3实现/定向记录；该时点 clean gate 未通过，后续 round4 已通过）

- `AiUsageGuard` 对拒绝安全区分用户/全局并发、任务调用次数/任务 token、用户小时/日、系统日七类；事件包含内部 task UUID、阶段、受控 Provider/model 标识及申请/已用/剩余/上限与适用 resetAt，不含用户原文、凭证、endpoint URL 或异常 message。拒绝仍使用既有公共 code/status/retry/reset，不生成 reservation；旧真实 UTF-8 估算、预算准入、锁序、事务、embedding 窗口豁免和 dispatch/settlement 行为保持。
- Gateway 增加 `char-category-v1-uncalibrated` 影子估算：按 Latin、CJK、数字、空白、标点/结构和其它 Unicode 字符类别计算候选，按 reservation UUID 输出旧估算、候选、完整 actual usage 或 unknown 及逐调用误差。completion/stream 候选沿用旧算法的每消息4-token framing；embedding 的 framing 为0。候选只供观测，不进入 reservation、上下文或任务预算；actual 不完整时保持 unknown，不新增 Provider 请求。
- `auralis.ai.shadow-token-estimate-enabled` 默认 `true`，可由 `AURALIS_AI_SHADOW_TOKEN_ESTIMATE_ENABLED=false` 关闭影子日志；不改变真实估算或准入。无生产样本，版本标为 uncalibrated，不据合成 usage 宣称校准完成或调整估算系数。
- 为阶段2恢复路径加入 `auralis.ai.overview-output-recovery-enabled` / `AURALIS_AI_OVERVIEW_OUTPUT_RECOVERY_ENABLED`，默认 `true`；开关仅控制新增 JSON/截断恢复，不关闭既有 semantic/no-progress 行为。配置绑定和false止损均已由定向测试覆盖。
- 阶段2现已接入 `OverviewGenerationService`：单个安全可拆分的 Source/Subject MAP 或 REDUCE 的 truncation 可仅拆分失败 batch 一次；JSON syntax 与 allowlist top-level shape errors 可执行一次 purpose-keyed repair。Child/merge truncation 不递归。保留既有 validator acceptance、动态分片、semantic/no-progress recovery、fencing/checkpoint、配置的 Overview 调用上限（默认24；同一值限制总任务及每个 MAP/REDUCE 阶段的平台调用）、524288 task tokens 和每次通过 Gateway reservation。关闭开关仅停用上述新增 truncation/JSON recovery。
- 最终 Recovery + Overview 定向为 101/101（`OverviewGenerationServiceRecoveryTests` 25、`AiOverviewServiceTests` 76），focused PostgreSQL replay 1/1；`OverviewBudgetIntegrationTests` 的 H2 Gateway/Guard 定向为7/7，其中包含新增 Subject MAP/REDUCE 故障回放。PostgreSQL Coordinator、Invocation Gateway、Usage Gateway、Guard 与 SQL reservation ledger 均真实；仅 `AiProviderRegistry` 使用合成响应。真实账本断言覆盖 7 次完整路径 reservation（相同 REDUCE child group 只共享已完成 checkpoint）及三 attempt 路径 13 次 reservation；同一 task/generation/budgetTaskId 与 durable checkpoint lineage 保持。早期 metadata-only audit 不是唯一 PG 证据；相关具体验证、限制见 `D:/Temp/auralis-ai-governance-20261013/review-fix/repeated-group-report.md`、`D:/Temp/auralis-ai-governance-20261013/review-fix/reduce-transition-report.md`。
- 有效模型诊断仅记录受控 Provider/model 与能力 resolver 的 known/unknown。`deepseek-chat` 上下文仍 unknown；普通 DeepSeek Chat thinking 标记 `provider-default-or-unknown`，只有结构化 Overview wire 请求记录 `thinking=disabled`，使用既有实现与测试。未实际核对 Provider 模型列表。
- Chat 阶段3新增固定故障回放测试，覆盖 RAG 两次调用顺序、embedding 失败、请求 replay、首 token 前/部分输出异常、缺 finish 标记、客户端断开与部分 usage；不改生产流式行为。阶段0/1 scratch 定向回归 62/62、Chat 回放 8/8。唯一 reviewer 最终 B0/I0/O0；最新 Service/Recovery source hashes 已与复审包匹配。profile-corrected clean backend test 为 659 项、5 failures、1 error、4 skipped，exit 1；六项在实际 HEAD 定向对照中重现。四个 skipped 是 `AiUsageGuardPostgresLockTests` 因未收到它读取的 `AURALIS_TEST_POSTGRES_URL` 环境变量而触发的 assumption；独立隔离PG补跑该类4/4通过，不改变full gate统计或失败状态。完整细节见 `D:/Temp/auralis-ai-governance-20261014/final/guard-lock-followup-report.md`。package -DskipTests exit 0，但不替代测试门禁。最终报告 `D:/Temp/auralis-ai-governance-20261014/final/report.md`。

### 2026-10-13 Overview recovery no-progress 修正（本地代码与隔离回归完成，未部署）

- 用户 retry 曾反复恢复到同一个 5,787-char 无缩减 REDUCE checkpoint，并以 `OVERVIEW_REDUCE_NO_PROGRESS` 结束。Service 现把 recovery compaction 与普通 REDUCE 分开作 checkpoint identity；full 与 partial 分别使用专属 purpose，prompt/partial-mode规则保持。fresh输出在写 checkpoint 前、缓存输出在恢复后都须严格短于输入，否则维持原错误码。
- Testcontainers PostgreSQL 回归植入旧 REDUCE purpose 的 poison checkpoint，验证它保留但新 recovery 不命中；普通 MAP/REDUCE checkpoint 继续复用，短合法压缩经现有 Gateway 成功，稳定预算 lineage 不变。相关隔离门禁 141/141 通过；210 项历史全门禁早于此修复。本地补丁尚未部署，Subject JSON 拒绝原因仍待安全诊断证据。

### 2026-10-13 Overview 动态预算与私有恢复（实现、自动门禁与指定 P4 通过）

- `OverviewContentStats` / `OverviewBudgetPlanner` 提供按内容与结构增长的输出软目标；UTF-8 byte estimate 是保守估算，不是 tokenizer。12000 字符实际 prompt、4608 intermediate / 6144 final `max_tokens`、可配置 Overview 调用上限（默认24，平台总任务与各 MAP/REDUCE 阶段使用同值）、524288 task token、240000ms 任务期限以及 Gateway 限额仍为硬边界。
- Subject 超限按实际选择的 outline/summary 语义字段分片、精确分包并有限 MAP/REDUCE；5200 字符是内容软目标，不再用 self-pair 假造消费者输入。实际完整 prompt 才做硬预算判断。错误码区分 prompt 超限、Provider 输出截断与恢复耗尽。
- V32 私有 generation/checkpoint/request mapping 已接入 Service：有效规范化 UUID 可重放同一请求；失败 generation 的预算 lineage 累计，恢复计数累计、恢复动作按安全集合去重。成功 response payload 满 14 天后清除，request mapping 与 generation/budget metadata 保留，过期 request ID 不可复用；失败 metadata 不因 payload 清理重置预算。私有状态不进入正式 Overview results / core Sync，生成成功仍由客户端通过独立 Overview results PUT 保存。
- 私有失败详情保存六种既有用量错误的原status/retry/reset，waiter恢复 `AiUsageLimitException`；接管/成功清除，fence/lease及FAILED/code/status约束有效。最终需求核对后fresh门禁20 suites / 210 tests全通过，335 main / 111 test编译，test/package exit 0。唯一首审B0/I1/O0，主代理按完整diff与实际回归关闭I1；同reviewer复审工具受限，剩余B0/I0/O0为主代理裁决。
- P4复用既有42 chunks，真实Source ALL / 单输入Subject ALL成功，分别9/1calls、69.595/6.414s，共60,035 charged tokens；预留/租约均释放，recovery=0。私有V32仅TEMP H2，输入只读业务PG，真实usage原账本；候选未保存到正式成果。八组主要正文主题已初步核对，后续章仅目录背景。单次样本不调整4608/6144硬上限或宣称通用最优预算；金额账单、真实恢复/取消、多文件、GUI、部署与业务V32分别验收。详见[动态预算与恢复计划](../plans/2026-10-12-overview-dynamic-budget-recovery.md)。

### 2026-10-13 Subject ALL 实际运行态 MAP2 JSON_PARSE 观察（只读）

- 2026-10-13 03:34:43 首次只读观察 backend 镜像 `sha256:f0c3e886175dadd709876988c7570a395793ae67a637545cbe5825a570317593` healthy，业务库 Flyway V32 `success=true`；其后用户更新镜像并进行 retry。各次运行镜像 class/source provenance 均未核验。
- 用户日志中 generation `18226745-50bc-4ce9-be30-97cf8c61f57c` 的 Subject ALL：MAP1 JSON/schema 成功并记录checkpoint，self-pair 12546 只是诊断超限。MAP2 响应 5076 chars、2511 output tokens、finishReason=stop，随后 JSON 相关 validator 失败、最终 `MODEL_PROVIDER_ERROR`。完整原文及 Jackson 精确错误原因不可取得；不推断 stop 保证JSON合法，也不因该失败改动冻结validator。
- 首次只读账本快照核对两次 DEEPSEEK MAP 调用均已结算 COMPLETED：实际输入/输出 4672/2619 与 4502/2511，charged 7291 与 7013，合计 9174/5130/14304；usage 完整、unknown-dispatched/活动reservation均0，TASK锁无owner/lease。失败generation无结果。当时重试接管同 generation/budget 并复用匹配checkpoint只是代码预期；其后用户已实际 retry，运行日志没有显式 checkpoint hit/restore phase。安全诊断建议与命令/证据见[实施计划](../plans/2026-10-12-overview-dynamic-budget-recovery.md)。

### 2026-10-13 Overview validator 安全诊断增量

- 当前工作树中实际 Provider 响应经现有 validator 时，可输出固定拒绝类别、异常类型和 Jackson 行/列/字符偏移；坐标针对 trim/fence 剥离后的 JSON。日志不含 exception message、响应正文、字段值、Jackson path 或 stack。2参数入口与原错误行为保持，checkpoint restore 不走新 sink；本次定向两个测试类 83/83 通过。日志实现当时未由 Codex 部署；其后用户更新镜像并 retry，但请求在 Provider 响应校验前以 no-progress 结束，没有验证诊断输出或运行镜像 class/source provenance，因此 JSON 拒绝原因仍未知。
- 2026-10-16 诊断增量：validator 在失败路径记录原始响应及实际 Jackson 输入的字符数和 SHA-256、plain/fenced/invalid 包裹类型、固定 parser 分类、Jackson offset 处字符类别，以及行列偏移。Overview 的 `OVERVIEW_VALIDATION_DIAGNOSTIC` 与同 task/generation 关联，记录输出阶段、purpose、`PRIMARY`/`JSON_REPAIR` 尝试、finishReason 与原有显式截断判定；不含正文、片段、原始异常消息或字符值。诊断异常不改变原错误或额外调用 Provider。定向两类测试 92/92 通过，Maven native/container exit 0；唯一 reviewer B0/I0。未部署，JSON 生成根因仍待下一次运行样本确认。

### 2026-10-12 聊天资料检索默认开启（历史验证记录）

- 该批次从 Chat 命令移除了 `retrievalEnabled`。当时的 `AiStreamingService` 默认检索已由协议 1 的 native data tools 取代，现行检索以 attempt 的 READY 来源快照为准。
- 该批次验证了当时的检索无命中继续生成、Embedding 错误及配额行为。
- `mvnw -B -ntp clean test -Dtest=AiStreamingTests,AiStreamingControllerTests,AiMessageCommandValidationTests,AiRetrievalTests,OpenApiArtifactTests` 退出码 0，47/47；`scripts/check-openapi.ps1` 退出码 0，包含运行时 artifact 12/12 和 PC/Mobile SDK 标准生成对比。真实 Provider 与客户端联调仍待验收，完整证据见[实施计划](../plans/2026-10-12-rag-always-on.md)。
- Backend 最终 clean 定向测试与 OpenAPI/SDK 一致性门禁已通过；真实 Provider 和客户端联调仍待完成。计划与验证状态见[实施计划](../plans/2026-10-12-rag-always-on.md)。

### 2026-10-12 学科总览分批输入（代码、定向验证、只读审查与本机部署通过）

- `OverviewGenerationService` 对能 fit 的 Subject 保留 direct；超限时按所选大纲 / 总结字段进行语义拆分、精确分包并使用同 task scope MAP/REDUCE。输入资料只分配一次，三个 mode、包内 Source alias 与最终 UUID 映射保持。5200 是内容软目标；实际 prompt 仍受 12000 字符硬限，intermediate/final `max_tokens` 为 4608/6144，Gateway 的调用、用量和取消约束保留。
- 最终 clean scratch 330 main / 107 test 编译、Surefire 73/73 与唯一只读 0 B / I / O 通过，两份主树 hash 与已测文件一致；最后 wrapper shell exit 未保留，不能推定 0。无新 route / DTO / 数据结构 / 配置；现行 Source 流程保留，详见 [证据与运行边界](../plans/2026-10-12-subject-overview-prompt-batching.md)。
- 香港 13:57:23 本机 backend `a5a50bb7…` healthy / readiness 200，运行 Service class 与 fresh scratch 精确匹配，Guard class 保持现行 embedding 排除；db / MinIO、Flyway V31 和额度配置保持。真实 Provider / GUI 生成待实测。

### 2026-10-12 embedding 不计窗口额度（代码、定向验证与本机部署通过）

- `AiUsageGuard` 按 ingestion / retrieval embedding stage 排除用户小时 / 日、系统日 token 窗口和本人 charged / reserved / remaining；历史 embedding 行也随统计口径排除，原调用审计不回改。
- 新 embedding 的窗口额度校验跳过，仍执行 ACTIVE 账户、锁序、有效租约 / 并发、任务资源预算与调用次数、请求输入 / 分批上限。生成调用的预留 / 完整实际或未知保守结算保持。
- 单人测试默认为 1000000 / 小时、2000000 / 日，系统日 2000000 和并发 4 / 2 保持；没有新 API 字段或数据库迁移。验证、部署和业务验收分别见 [策略计划](../plans/2026-10-12-embedding-quota-exemption-and-test-limits.md)。下方 PDF 记录是本次策略改变前的现场与修复证据。
- Guard / Gateway / Ledger / Worker / Job 隔离 53/53，最终两项精确源码回归 2/2 与其重叠；配置测试 6/6。未知 usage / actual / charged 原审计及锁序、并发、任务预算路径保留，阶段排除不绕过 gateway。
- 唯一只读审查 0 BLOCKER / IMPORTANT / OPTIONAL；本机 backend 已更新为 `31f7dec…`，readiness 200。部署 Guard 字节码确认窗口校验跳过与四条 stage 排除，输入源码 hash 在构建前后保持；实际 Provider 和 GUI 操作待验收。

### 2026-10-12 embedding 用量字段解析（最小修复与定向验证通过；后续已更新 backend，真实响应待验收）

- `SiliconFlowEmbeddingProvider` 除 `prompt_tokens` 外读取官方 `completion_tokens`，非负、可转 long 的整型 0 为有效值；缺失、字符串、负数、分数或越界仍未知，不从 `total_tokens` 推导。原向量配对、安全传输及 B 结算规则不变。
- 真实适配器受控 RED 证明旧实现将 `(7454,0)` 变为 `(7454,null)`；现场三笔已结算额度 94615 导致大 PDF 到整点的正常小时延期，checkpoint 保留且租约释放。历史 Provider 原始 usage 未捕获，本轮不回改记录，也不提高预算。
- 完整用量经 gateway/guard 用实际值结算，部分未知继续保守。相关自动验证、源码对应关系和运行态限制见 [本轮计划](../plans/2026-10-12-pdf-ingestion-quota-and-sync.md)；没有 API/数据库/配置变化。
- 定向五类 56/56 在隔离构建目录通过；验证前主树 470 个 src 文件及 pom 与副本逐项相同，验证后相关源码/test hash 匹配。已有初期聚焦回归与此计数重叠，不相加；本轮未部署或发起真实 Provider。
- 原部署在香港 11:00 自然恢复该 PDF，同 generation 32 个 inactive checkpoint chunks 续做为 42 个 active chunks，Source / job READY，只新增一笔 embedding，failure_count 仍为 0。此只读运行态证据验证原调度与续做；原部署仍将该笔 output 记为 NULL，解析补丁的实际响应结算待部署后验收。

### 2026-10-11 Overview 最终 MAP 用量误拒绝（代码、相关验证与只读审查通过；未部署本轮修复）

- 部署 JAR 与隔离反例确认：Subject direct 和单批 Source 的最终输出使用既有 6144 token、`OVERVIEW_MAP` 操作；gateway 将该操作误限为 4608，导致预留前 `AI_REQUEST_BUDGET_EXCEEDED`（413）。修复仅对齐既有最终上限；服务端中间输出 4608、最终 6144，以及全部额度、任务预算、并发和保守结算继续适用。
- 异常原样传递，默认 JSON 和 opt-in SSE 保留实际业务码；失败日志此前只识别 DomainException，因此把用量码误记为通用生成失败。本轮补安全白名单诊断，不输出原始异常文本。现场只读账本没有 reservation，目标 TASK owner/lease 已释放。完整证据和最终验证见 [诊断与修复](../plans/2026-10-11-overview-usage-limit-diagnosis.md)。
- 2026-10-11 UTC 07:14:47 已运行新 backend；这是本轮只读观察到的运行状态，本轮尚未部署预算修复，也未完成真实 Provider/GUI 验收。
- 主树定向 19/19、追加 TASK 释放断言后的集成 2/2（与 19 重叠）、本机 started-stream SSE 1/1 通过，唯一覆盖 20 项。初始隔离用量/配置/Overview 85/85 和 router 1/1 分别记录；不写为全量工程或真实业务验收通过。
- 唯一 reviewer 的代码范围 BLOCKER=0、IMPORTANT=0；一项 OPTIONAL 为两份诊断报告的 manifest evidence 索引 SHA 待更新，按规则保留。六项主树/已测代码 hash 一致，报告最新 hash 及审查、工作树保护证据见本轮计划。

### 2026-10-11 Overview 硬期限与消费者取消（代码、相关自动验证与只读审查通过；真实环境待验收）

- 两个现行 Overview 路径默认返回 JSON，并支持 opt-in SSE 心跳及结构化终端结果。`OverviewCancellation` 与单调期限将消费者退出、共享 owner 期限关联到当前调用独占 socket；连接、TLS、写入和读取可被本地关闭唤醒。Source 同键兴趣加入、退出和关闭必须原子裁决，旧 flight 不得取消或移除替代 flight。
- 总准入 24、SSE 8；生成 executor 4/8/16 只承载实际 owner/独立 Subject，等待者不占生成线程。期限从入口准入开始，涵盖预检和 MVC 排队；共享 Source 保留原 owner 的绝对期限，不因 owner 离开而重置。期限与心跳各用单线程 scheduler，取消的计时任务即时移出队列；writer 为 8 线程、8 队列。到期终端写入独立于 MVC 工作线程，终态 CAS 防止迟到结果或重复事件。写入名额覆盖排队和执行中的心跳/终端事件，只有实际生成 worker 退出、所有本请求写入清理后才释放 SSE/准入名额；提交拒绝同样平衡占用。用量 scope 在实际调用退出后按现行 B 规则结算并释放；不新增数据库或修改账本预算。
- 聚焦回归 84/84、Provider/HTTP 兼容回归 51/51 通过；OpenAPI 导出及比对各 11/11（与聚焦计数有重叠）。真实本机 Servlet/TCP 验证断连与工作退出；本机 TLS 验证持续慢流、阻塞握手和不读请求体的阻塞写入。连接阻塞只用受控 socket 替身验证，未模拟真实内核 TCP 连接停滞。完整命令、源码 hash、结算测试和 JSON/代理/真实 Provider/GUI 边界见 [实施计划](../plans/2026-10-11-overview-hard-timeout-cancellation.md)。下方 2026-10-10 合作式限制是本轮修复前的历史证据。
- 入口期限会扣除预检和数据库等待，但不能强制中止 JDBC 查询或账本锁等待；同步 preflight 阻塞时 HTTP/SSE 建立可能晚于期限，返回后仍必须拒绝超期 Provider HTTP 出站。账本已有派发标记仍按 B 保守计账，不能因网络取消改为零。本轮未扩改数据库超时、事务取消或 JSON MVC 响应模型，不宣称整个路由在任意数据库故障下都有墙钟保证。
- Overview 的 socket 建立前解析也进入有界、可取消等待：固定 4 个 daemon DNS 线程、队列 8，取消移出排队任务，饱和拒绝 `SERVICE_UNAVAILABLE`，解析超时为 `MODEL_TIMEOUT`；解析前后与 HTTP 出站前检查取消，晚结果不得发送请求。原公共地址校验、DNS pinning 及其他 Provider 路径保留。原生 JDK/OS lookup 可能不响应 interrupt，只能占固定 resolver slot 到实际返回，不能据 Future.cancel 宣称 OS 解析停止。
- DNS/Provider/Overview 最终组合 124/124、policy 11/11 通过，124 包含原兼容 51 项及原聚焦 84 中的 60 项，不相加。额外主树 fresh 编译曾遇并行 406 测试先于处理方法实现的窗口；生产 329 源文件编译通过，失败日志如实保留，不将未执行测试写为绿色。并行 406 修复随后补齐并单独验证；本任务未实现其错误处理或部署。

### 2026-10-11 复习旧接口和 FSRS Lite 调度器移除

- Controller 已移除 `/api/reviews/due`、`POST /api/reviews/events` 和旧 `/api/reviews/history`；状态读取保留 `/api/reviews/states`，生命周期命令与 `/api/reviews/lifecycle/history` 保留。
- 删除 `ReviewScheduler`、`FsrsLiteScheduler` 和旧事件读写 Service/DTO。`review_events` 表仍用于既有统计聚合，Review 状态的参数集外键标识仍保留；未改数据库结构。
- Mobile / Tablet 旧路由调用未迁移，本轮仅处理 PC 与共享后端接口；调用方风险见 [当前问题](../current/IssuesAndReview.md)。

### 2026-10-11 AI 持久用量防护与个人额度（代码、相关自动验证与只读审查通过；真实环境待验收）

- `ai.usage` 的 `AiInvocationGateway`/`AiTaskScope` 统一承载 Chat 检索与流式生成、Source/Subject Overview 全阶段、ingestion 分批、连接测试和零 token 模型元数据查询。`@NamedInterface("usage")` 导出用量接口及安全异常，业务入口不直接注入 Provider registry/port；原 SSRF、DNS、BYOK 和向量校验继续适用。
- `AiUsageGuard` 使用 V30 两表持久预留/结算；任务准入、调用预留与派发标记先锁真实 ACTIVE users 行，再按 GLOBAL → USER → TASK 获取账本锁，防止账户删除的外键/级联死锁及预留后停用仍授权派发。派发标记是数据库授权点，不能撤销已授权的远端请求。独立短事务读锁后时钟，Provider 调用不包在账本事务中。成功结算在同一锁事务裁决 owner/lease；独立 heartbeat 对正常已结算调用仅续 TASK，未知派发保守计账。Chat 安全 usage 写入既有 `messages.usage_json`；Provider 原始 usage 可以为空，不能解释为零。
- ingestion 的已验证批次写入当前 generation 的 inactive chunks，按 owner/job/revision/ParsedDocument/hash/ordinal/offset 绑定；额度或繁忙延期只改 `next_attempt_at`，单调 `attempt_count` 保持 claim 身份，独立 `failure_count` 控制普通重试。请求/任务硬预算拒绝走 fenced 终态，避免永久延期；检查点读取是可写短事务，保留 Source → job 写锁。完整 fenced 提交才切 active generation。
- `GET /api/ai/usage` 只返回当前认证用户的小时/每日 token 窗口。六类拒绝由 AI 模块的专用 advice 提供安全重试字段，避免 shared → AI 模块循环；413/422 不提供等待型 Retry-After。MVC async 使用固定 4/8/16 的线程/队列上限，队列拒绝为 `503 SERVICE_UNAVAILABLE`。账户停用沿现行 `UNAUTHENTICATED`，接口、迁移和配置分别见 [API](../contracts/API.md)、[Database](../contracts/Database.md)、[Infrastructure](Infrastructure.md)。
- 最终核心 H2/config 31/31、任务独占 PostgreSQL 锁序 4/4、业务专项 147/147、最新同步核心/检查点/续做组合 37/37、真实 V29→V30 历史失败次数保留升级 1/1 通过；计数之间有重叠，不相加。唯一只读审查 B 范围 BLOCKER=0、IMPORTANT=0，不宣称全量 Server 或业务验收通过。Modulith 全量门禁仍有 HEAD 可复现且未改动的 knowledge ↔ review 循环，新增 Provider 防绕过验证已通过。完整命令、版本及未覆盖范围见 [B 计划](../plans/2026-10-10-ai-usage-guard-b.md)。

### 2026-10-10 Overview 合作式时限与 ingestion 有界分批

- `OverviewTaskDeadline` 使用单调时钟，为 Source/Subject 请求共享默认 240 秒任务预算；`OverviewGenerationService` 在调用前后与最终成功路径拒绝迟到结果，每次 Provider response timeout 不超过剩余预算。同键等待者有自己的有界等待；owner 异常仍释放 in-flight。现行 4608/6144 token、schema/alias/locator 和 Source revision/deletion fencing 保留。
- `IngestionWorker` 按最多 32 条、累计文本 UTF-8 32768 字节分批，全部向量有效后才一次提交并切换 generation。`SiliconFlowEmbeddingProvider` 校验 index 并归位，拒绝重复/缺失/越界/非整数 index 与非数值向量；1024 finite 约束保留。
- `IngestionJobService.renewClaim` 在批前后短事务锁 job，按 claim 身份/attempt/状态与锁后新鲜 Clock 检查 lease；未过期才按原租期续租。失去 claim 即停止后续批次，不用旧 attempt 写失败；Provider I/O 不持事务。新增三项配置的键、默认与边界见 [API 契约](../contracts/API.md)，数据库字段/迁移未变。
- 首轮聚焦 89/89、兼容聊天/检索/chunk 31/31；锁等待跨 lease 的竞态先 RED，再以最终 Job/Worker 18/18 与配置 5/5 验证补修。测试为受控 Provider、H2/Mock/可控时钟；真实数据库竞争、Provider 网络和 GUI 未运行。合作式时限不能强制终止持续 slow-drip I/O，也未实现真实 HTTP 断连即时取消。证据见 [本轮实施](../plans/2026-10-10-ai-important-fixes.md)。

### 2026-10-10 AI 匿名质量基线（离线契约验证）

- `src/test/resources/ai-quality/baseline-v1.json` 提供八个匿名样例；`AiQualityFixtureContractTests` 使用真实 `TextChunker(1200,120)` 检查 chunk 数量、ordinal、offset、SHA-256 与 fixture 的 owner/显式 scope/证据引用一致性。
- `scripts/run-ai-quality.ps1` 实际执行该 Maven 测试，生成 `quality-report.json` 和独立人工评分模板。runner 仅支持离线契约检查；不读取 Provider 凭据，不运行真实检索、embedding 或模型评分。真实语义质量和人工评分标记 `NOT_RUN`，初始分数全部为 `null`。
- 独立 `server-quality` 验证 3/3、0 failures/errors/skipped，退出 0；该证据不能关闭模型事实质量风险。命令与报告路径见 [实施记录](../plans/2026-10-10-ai-important-fixes.md)。

### 2026-10-10 PC + Service 功能边界补充（静态代码核对）

- Auth 提供已登录改密和已验证邮箱找回；注销通过 `DELETE /api/auth/me` 异步受理并返回 HTTP 202，当前没有可供用户查询作业进度的路由。
- 当前没有通用用户偏好同步 API 或完整数据备份/导出 API；PC 偏好保存在端侧，JSON 导出由 PC 汇总有限资源。
- Suggestions 保持确定性模板基线，真实 LLM、RAG 引用与质量评估仍按 `P1-Phase5-Suggestion-Quality` 开放登记。

### 2026-11-13 复习历史读取

`GET /api/reviews/lifecycle/history` 在只读 `REPEATABLE_READ` 事务中读取知识块、状态、命令和有效结果。另一事务提交核对时，本次响应仍以同一数据库快照构成。

### 2026-11-11 复习原回执重放与元信息修订

- `ReviewLifecycleService` 在当前 owner KB 与正文 hash 校验后查找冻结回执。若没有原回执，继续用请求中的 KB 版本及状态版本校验新写入。标题等同学科、同正文更新保留当前核对、纠正和重学的因果目标，后继请求绑定当前 KB 版本。
- `KnowledgeBlockService` 在移科事务内发布领域事件。Review 保留日期、学习标记、稳定次数、掌握度和已生效历史，清除旧因果 ID 并使未确认初选失效。正文变化沿原失效流程处理。

### 2026-10-09 PC 离线复习补传协议（代码及相关自动验证通过；真实联调待验收）

- 最小扩展现有生命周期请求的 occurredAt/expectedStateAbsent；前者保留真实操作时间，后者区分无状态与 version0。owner、活动资源、版本、正文 hash、锁序及回执幂等继续校验，无新端点或数据库迁移。
- 历史/回执公开初选前 schedulingBaseline，legacy event 公开由 before_state SQL NULL 派生的 firstLearning，支撑本地确认和实际历史统计，不公开原始持久 JSON。history 顶层 protocolVersion=2 供端侧在副作用前检查后端版本。
- Luna 执行 Agent 完成 Service 与相关测试：最终 clean Lifecycle/Review/SubjectStats/StatsService/OpenAPI 32/32，独立 OpenAPI 比对 9/9；运行时产物及 PC/Mobile SDK 已同步并同 hash。真实 Java/MockMvc 导出 13 场景排程 fixture 给前端，不凭口述重建算法。
- 参数与拒绝语义见 [API](../contracts/API.md)，命令/退出码/关键输出与哈希记录在 TEMP `auralis-review-stats-local-first-20261009/backend/report.md` / `verification.log`，索引见 [计划](../plans/2026-10-09-review-stats-local-first.md)。未重跑全量 Server、PG 集成或真实多端/GUI。

### 2026-10-08 学习、复习纠正与掌握退出（代码、相关自动验证及只读审查通过）

- Review新增独立生命周期命令/历史，初选即调度、核对确认或同reviewId纠正，显式学习完成与重学。阶段日期按3/7/14/30天与10分钟/1天风险间隔保存，最终核对成功持久化mastered，自动due排除mastered及needsLearning。
- 同块写入沿Subject→KnowledgeBlock→ReviewState锁序；锁后重查KB仍属已锁Subject，移动交错拒绝且不写state/command。common版本/hash绑定当前正文，正文变化经共享领域事件在原事务内失效掌握/稳定进度，元信息修改保留。旧events精确回放保留，新legacy写入更新最近练习并失效旧因果链，不能凭旧reps毕业。
- V29新增不可变命令回执与同次有效结果投影，旧state默认稳定0/未掌握且保留原日期与历史。预置既有FSRS_LITE/1默认参数，关闭不同Subject首次学习的全局参数插入竞争；已有同版本行保留ID/JSON。学科统计新增互斥三态、有效复习与独立学习完成；新初选/确认/纠正审计不重复计量。新DTO三档与legacy五档显式区分。
- 初始相关H2/MockMvc/OpenAPI聚焦25/25、PG2/2与独立OpenAPI导出9/9通过，两端SDK一致。审查后Subject移动PG受控RED→GREEN 1/1；参数初始化PG空库竞争与V28→V29已有参数升级各1/1；最后当前迁移Lifecycle/legacy/schema H2 14/14。临时PG17没有触碰业务库；唯一只读reviewer最终BLOCKER=0、IMPORTANT=0、OPTIONAL=0。以上不代表GUI、真实HTTP或多端验收；完整命令、各版本证明范围和最终哈希见 [本轮实施](../plans/2026-10-08-review-learning-mastery-implementation.md)。

### 2026-10-08 学科复习状态与统计读取

- Review 增加 `GET /api/reviews/states`，以 owner / 活动 Subject / 活动 KB 过滤后按 knowledgeBlockId keyset 完整分页；到期及未来状态均可读取，游标绑定用户与学科。既有 due、评分、历史、调度与事件幂等保持现行规则。
- Stats 增加 `GET /api/stats/subjects/{subjectId}` 和 `SubjectStatsView`，在可重复读事务中组合独立 owner-scoped 聚合：活动资料、KB、任务与状态概况，近 7 / 30 个 IANA 本地自然日的评分/不同 KB/首次与后续学习/新增 KB/完成任务，以及四档正式反馈分布。独立聚合避免 fanout，学科不包含专注字段。
- 三类复习状态与活动 KB 总数在同一查询快照内计算；首次正式学习用 before_state 为 SQL NULL。任务日完成保留当前 DONE 的软删除历史，重新打开后的旧完成转换不推算；历史归属按 KB/Task 当前学科解释。
- 不新增迁移、依赖或 core Sync 字段；stats 仅通过允许的公开模块边界与 owner SQL 查询读取，不跨模块依赖内部实体。完整接口见 [API](../contracts/API.md)，自动门禁、单 reviewer 和真实环境边界见 [实施记录](../plans/2026-10-08-subject-review-stats-implementation.md)。

### 2026-10-07 文件恢复与保留清理并发修复

- `AssetRepository.findForUpdateByIdAndUserId` 使用 owner-scoped 悲观写锁。`SourceService.requireReadyAsset` 在 FILE 创建、替换 Asset 和恢复时共用此锁，沿用 Subject→Source（存在时）→Asset 的写入锁序。
- `AssetRetentionCleanupService` 每个 owner/Asset 在独立 `REQUIRES_NEW` 模板事务内锁 Asset、重查活动及仍在恢复期内的引用并提交 ORPHANED；提交成功后才删除对象。清理不反向锁 Subject/Source，调度入口不依赖同 Bean 自调用的事务代理。
- 恢复先提交时，清理重查后保留对象；清理先提交时，新 FILE 引用与恢复拒绝 ORPHANED。对象删除失败保留该状态，由下一轮幂等重试；批次内按 owner/Asset 去重。
- 新 PostgreSQL 17.11/Testcontainers 并发集成 5/5，实际观察清理的 Asset 锁等待恢复事务；相关 Service/Controller/Asset/retention 56/56。全量 clean test 为 392 项、1 failure、0 error/skip，唯一失败是既有 TaskColor 测试期待迁移 V21、实际 V28；此前 AccountDeletion 微秒舍入失败本次未复现。生产 MinIO/真实 HTTP 与 GUI 验收独立登记，完整证据见 [实施记录](../plans/2026-10-07-priority-function-fixes.md)。

### 2026-10-01 提问选中文本处理（历史验证记录）

- 该批次引入可选顶层 `selectionText`。现行协议 1 在 Chat 命令顶层接收引用，最长 4000 字符，作为本轮模型上下文。USER 消息正文独立保存。
- 引用处理与会话绑定分开，后续轮次可继承已绑定的资料范围并附带新的引用。
- 当时的预算验证覆盖 `PromptAssembler` 对当前问题、引用及历史裁剪的处理。
- Server clean focused 47/47、OpenAPI export 8/8、SDK 生成和一致性检查退出 0；未新增数据库/迁移/配置。真实 Provider 与 GUI 未验收，完整命令见 [实施记录](../plans/2026-10-01-chat-selected-text.md)。

### 2026-10-01 学习数据能力调整（整合验证中）

- 新增独立 `focus` 模块及 `POST /api/focus-sessions`，稳定 session ID 按用户幂等记录实际秒数和自然完成标记；Stats 暴露历史全时及每周每日专注秒数/完成轮次，不改变复习事件的 studySeconds。
- ai 模块新增完整 Overview results GET/PUT、整体及分项版本、Subject 来源 manifest 校验和独立精确回放 receipt；当前 owner/READY/revision/活动状态围栏覆盖读取、写入及重试。生成接口继续无状态，不自动保存中间结果。提交后发布 `OVERVIEW_UPDATED`，不扩展核心资源 Sync。
- KnowledgeBlock DTO/Entity/Service 删除 summary/tags，Suggestion 的正文输入读取 content；保留 Suggestions 服务端接口和 PC 暂藏策略。追加 V26 专注、V27 成果/回执、V28 摘要/标签删除迁移，账户物理清理包含新增三表。
- API、数据结构及执行证据见 [API](../contracts/API.md)、[Database](../contracts/Database.md)、[实施计划](../plans/2026-10-01-pc-learning-data-cleanup-and-sync.md)。本轮未部署运行服务或执行生产迁移。

2026-09-27 PC/Service 风险修复：Sync pull 对省略/零 cursor 也使用用户独立高水位和最早保留日志识别清理缺口；Subject Overview 在转换 outline 引用前先建立所有请求 Source 别名；Source Overview 同一进程内以 owner/source/revision/title/mode/instruction 合并进行中生成。TEXT/URL 解析输入变更轮换 Source ingestion revision，新旧修订使用不同 job；Source 与对应 job 在同一事务持久化，失败整体回滚；恢复处理中的 TEXT/URL Source 时按当前 revision 补建或复用 job。worker 的结果及失败写入按 revision、job/generation、attempt 与锁后新鲜时钟的有效 lease 栅栏化，成功的 Source/chunks/job 在短事务内提交。Server clean 聚焦 114/114、PostgreSQL pgvector 2/2 通过；跨服务实例 Overview 去重、真实 Provider/运行服务尚未验收。

### 2026-10-23 自适应 metadata 冗余 summary 归一化

`ADAPTIVE_METADATA` 的专用 prompt 要求顶层 `summary=null`，但通用 schema 仍允许 summary，ALL 模式公共规则也要求 summary，导致合法 schema 响应被后续内部 shape 检查拒绝。此内部 purpose 现在明确以 metadata 规则覆盖公共模式 summary 要求；通过通用 JSON/schema 校验后，Provider 响应与恢复 checkpoint 均在内存/规范化结果中清理顶层 summary，再继续执行原 alias coverage 与 shape 门禁。新写 checkpoint 保存规范化结果；旧 checkpoint 读取规范化后使用，不回写或改账本。此规则不扩展到 `ADAPTIVE_METADATA_ROUTE` 的 ALL summary、writer 或最终结果。

2026-09-26 AI 显式检索范围补充：聊天 `ReadingContext` 保留既有 `AUTO` 当前 Source 行为，并支持用户显式选择的 Source ID 集合或全学科范围。检索前验证活动 Subject 属于当前用户；显式 Source 必须属于当前用户及该 Subject 且为活动 READY 状态，结果不得扩展到未选 Source。定向 `AiRetrievalTests` clean 12/12、`ArchitectureTests` 1/1 通过；真实 PostgreSQL/pgvector、Provider 和 GUI 尚未验收。

2026-09-26 Source/RAG 修复：PostgreSQL pgvector 检索仍在 LIMIT 前过滤软删除 Source；H2/fallback 现先按 owner 批量解析活动 Source 再排序/TopK，删除 Source 的旧 chunk 不占有效引用名额。Source 列表、分页和含删除项列表的 Asset size 改为 owner-scoped 批量加载；Retrieval citation 复用一次批量 SourceView 查询，不再逐条 `sourceService.get()`。SourceView 排序、Asset 大小、citation 内容及 generation 语义不变。focused clean 8/8、PostgreSQL 17/pgvector 2/2；真实业务数据与负载性能未验收。

2026-09-26 注销运行验收：用户重建后提交的指定账号作业已于 `06:50:10.172777 UTC` 达到 `COMPLETED`，`last_error=NULL`，用户行和该用户归属的 21 张清理表记录均已清空，本作业对象键记录为 0。此证据确认数据库清理链路，MinIO 对象与当时 HTTP/GUI 响应未单独验收。

2026-11-11 Identity 会话与密码约束：活动会话列表按 access JWT 的设备标识标记当前设备。撤销指定设备或其他设备时持有与登录和刷新相同的用户行锁，目标旧 sid 可定位同设备轮换后的活动会话。注册与改密的新密码在 BCrypt 前校验 72 字节的 UTF-8 上限，超限返回 HTTP 400，既有哈希继续由当前密码编码器验证。

2026-09-26 注销运行态与完整链路验证：现运行 backend JAR 的 `IdentityService.requestAccountDeletion()` 字节码确认 `requested_at/not_before` 使用 UTC `OffsetDateTime` 绑定，V25 已安装。独立 Testcontainers PostgreSQL 17/pgvector 定向回归 4/4，涵盖有效确认密码受理后到期清理用户、Subject/Task/Asset 与对象键，以及错误密码保持用户 `ACTIVE` 且不建作业。本轮未改后端生产逻辑，真实账号和 MinIO 未验收。

2026-09-26 账户注销受理入口：`IdentityService.requestAccountDeletion()` 写入 V25 `account_deletion_jobs.requested_at/not_before` 时，JDBC 边界将 `Instant` 转为 UTC `OffsetDateTime`，使 pgJDBC 可绑定带时区时间列；领域时间、返回值、事务及作业流程不变。独立 PostgreSQL 17 异时区定向回归 2/2、主源码 clean compile 与 backend 镜像构建通过；当前运行容器尚未加载新镜像，真实账户注销仍待验证。

2026-09-25 账户注销清理 JDBC 时间参数修复：`AccountDeletionCleanupService` 的 PostgreSQL `JdbcTemplate` 查询和更新将 `Instant` 明确转换为 UTC `OffsetDateTime` 后绑定，匹配 V25 的 `TIMESTAMP WITH TIME ZONE` 列，覆盖作业领取、租约、对象删除时间、完成时间与完成后复扫。作业状态机、事务与删除顺序不变。独立 Testcontainers PostgreSQL 17/pgvector 上经 Flyway V1–V25 运行专门回归 1/1；当前运行中的 Compose 服务未重建，真实账户注销尚待验收。

2026-09-25 AI 聊天配置调整：用户 BYOK 只配置聊天模型和凭据；Embedding 固定使用服务端 SiliconFlow 配置。`OPENAI_COMPATIBLE` 可使用经公网 DNS/固定地址校验的 HTTPS host，并拒绝 NAT64、6to4、Teredo 转换前缀；命名 Provider 继续使用精确 host allowlist。连接测试使用已保存聊天模型的最小 `/chat/completions` 请求，`/models` 仅作可选发现。真实服务商、GUI 和本地地址兼容尚未验收。

2026-09-25 头像 multipart 接收上限：服务端在共享 Spring 配置中显式设置单文件上限 5 MiB、整个 multipart 请求上限 6 MiB；后者为表单封装留余量，使恰好 5 MiB 的头像仍能到达现有业务校验。此配置与 Asset/ParsedDocument 的预签名直传大小限制分离。

2026-09-24 PC 个人空间所需服务端能力：Identity 新增带 `baseVersion` 的昵称更新与改密、私有 PNG/JPEG 头像上传/读取/重置，以及 `DELETE /api/auth/me` 异步账户注销受理。头像经类型/尺寸校验后重编码 PNG 存入 V24 `user_avatars`；注销由 V25 作业与对象键表记录待清理 Asset/ParsedDocument，先停用用户并撤销 refresh sessions，上传意图签发与停用用户经用户锁串行化。等待预签名上传窗口后由带行锁和租约的 worker 清理对象，再按 owner 显式删除数据库依赖与用户；已完成作业继续有界复扫已知对象键以清理晚到 PUT，不改变原业务表 FK 语义。改密与登录/刷新签发也经用户锁串行化，防止撤销后并发生成新 refresh session。AI 新增当前用户已保存 BYOK 的模型列表与连接测试，两者通过既有出站安全策略请求兼容协议 `/models`，不读取 env 默认密钥。定向测试与 OpenAPI/SDK 校验记录见当前状态；真实 PostgreSQL/MinIO、真实 Provider 和 PC 前端调用尚未验收。

2026-09-24 紧邻排期交换：`schedule-swaps` 对原排期区间首尾严格相接的两项任务，交换顺序后从原共同窗口的起点紧凑安排，保持窗口终点不变；非紧邻仍交换开始时间。两个版本、固定任务、与其他任务的完整区间冲突仍在原事务和锁内校验，成功只改两项排期。

2026-09-24 Timeline 卡片主体严格放置：`POST /api/tasks/schedule-insertions` 可选 `targetTaskId` 标识主体落点。服务端在既有锁与事务内读取目标任务，将源任务安排在目标结束后的首个半小时槽；目标及其他任务不移动。若源任务完整区间与后续任务冲突或目标结束后无可用槽，整笔拒绝且不产生部分更新。不含该字段的普通空白槽位仍按原有插入顺延处理；顶部栏继续使用交换接口。

2026-09-20 Overview Reduce prompt routing 已完成：MAP 行为保持不变；所有文档 REDUCE 调用（非最终与最终）现在在既有 SYSTEM/schema、安全、mode、alias 和 locator 规则之后接收 Reduce 专用均衡压缩指令。该指令经 Java text-block 规范化后为 843 字符，面向需要实质归并的输出目标约 2500–3000 个序列化 JSON 字符；目标不是硬上限。`max_tokens=4608`（多批 MAP、非最终 REDUCE）与 `6144`（single-batch MAP、Subject direct、最终 REDUCE）不变；规范化 intermediate JSON `<=5200` 字符、self-pair `<=12000`、Reduce no-progress、JSON/schema/alias/mode/locator 校验、分组/批次和调用次数均不变，也不增加自动压缩重试。Task 1 focused Server 自动验证 55/55 与 test-compile 已通过；这些证据只证明 prompt 路由和既有不变量，不证明真实 DeepSeek 的压缩质量、内容覆盖、延迟、token 使用或成本，真实样本仍待验收。

2026-09-17 Overview token budget 调整为原预算的 150%：多批 MAP 与非最终 REDUCE 使用 `max_tokens=4608`，single-batch MAP、Subject direct 与最终 REDUCE 使用 `6144`；规范化 intermediate JSON 上限为 `5200` 字符，self-pair 上限仍为 `12000`。紧凑 intermediate prompt、schema/规范化和 no-progress 校验保留，不做自动压缩重试。普通聊天、流式和 embedding 不变。

历史诊断记录（2026-09-15，永久策略实施前）：Task 4C 仅增强 intermediate system instruction，保留独立主题/section、压缩措辞、只合并重复/等价节点，并以序列化 JSON `<=3600` 为目标。真实 42-chunk 请求的六个 MAP 全部通过，输出为 1447–3680 字符；此前超限的 MAP2 从 5105 降至 2027。REDUCE round 1 第一组 2446 字符通过，第二组 4678 字符仍单独触发 4000 字符上限，self-pair 为 10899/12000。Prompt 有效但不是硬保证。Final prompt、硬校验、batch、Provider 和普通聊天/流式未变；该段记录的是永久策略实施前的实验状态。

历史基线记录（2026-09-14）：Overview Provider 调用按当时阶段策略使用非空 `maxTokens`：中间调用 1024、最终调用 4096。多 batch Source MAP 与非最终 multi-group REDUCE 为 intermediate；single-batch Source MAP、Subject direct 与最终单 group REDUCE 为 final。Overview 的 `AiProviderRequest` 显式标记 `structuredJson=true`；OpenAI-compatible body 增加 `response_format={type:json_object}`，DeepSeek 额外增加 `thinking={type:disabled}`，普通聊天/流式继续使用兼容构造器并保持 false。该历史条目不代表当前永久预算；当前值以本文件顶部 2026-09-15 条目为准。其余 Provider 安全、错误码和自动验证证据保持记录。

2026-09-12 Build/OpenAPI Task 3 最终回归：Server fresh 聚焦命令实际 57/57、0 failures、0 errors、0 skipped，fresh test compilation 已通过。缺失的四参数 `ProviderHttpTransport.post(..., byte[])` 仅在 `AiProviderSecurityTests` 的测试 double 中补齐，生产 Provider transport 未改变。全量 `mvnw -B -ntp test` 实际执行 239 项，0 failures、3 errors，错误仅为 MinIO/PgVector/Testcontainers 无法连接 Docker；`check-openapi.ps1` 退出 0，OpenAPI artifact 测试 8/8。真实 Provider、PostgreSQL/MinIO、HTTP 端到端与业务验收仍待完成。

2026-09-11 Overview Source Provider-boundary fence：文件总览生成在每一次共享 Map/Reduce Provider 调用前后，以现有 owner-scoped `SourceService.requireActiveSource` 重新验证 Source 为活动 `READY` 且 `ingestionRevision` 精确匹配；删除仍保留 `RESOURCE_NOT_FOUND`，状态或修订变化返回稳定 `MUTATION_REJECTED`。Provider 已在调用中的请求可能先完成，但其响应会在 post-call fence 被拒绝，且不会启动后续 Map/Reduce 调用。Subject 总览不启用该 Source fence，公开 API、DTO、数据库与同步契约未改变。本轮聚焦 `AiOverviewServiceTests` 19/19 通过；Overview 失败日志使用 allowlist，仅记录规范化 UUID `requestId`、关联字段、阶段、稳定 `errorCode`（或 `OVERVIEW_GENERATION_FAILED` 回退）及 exception/cause 类型；非法或含敏感内容的请求 ID 会替换为服务端新 UUID，不记录原始 exception/cause 文本或 throwable stack。Task 4 Server 标准聚焦为 40/40；全量 `test` 实际执行 239 项，0 failures、3 errors，错误仅为 MinIO/PgVector/Testcontainers Docker 不可用。一次 fresh `clean test-compile` 仍被 `AiProviderSecurityTests.java:182` 的 `ProviderHttpTransport` 缺少 `post(..., byte[])` 阻断；OpenAPI artifact 测试 8/8，但 `check-openapi.ps1` 仍报告 PC generated schema stale。真实 Provider、PostgreSQL/MinIO、HTTP 端到端与业务验收仍待完成。




## 当前旧 Server 事实

替换前旧 Server 位于 `Auralis-Server`，现已移至仓库外备份；其基础包为 com.auralis.server，技术栈为 Spring Boot 3.2.5、Java 21、MyBatis Plus、PostgreSQL、Redis、JJWT、LangChain4j、Milvus、Apache Tika、MinIO、Caffeine 和 WebSocket。

当前旧包结构包含 common、config、controller、dto、entity、mapper、service 和 websocket。旧 Controller 包含 Auth、KnowledgeBlock、TaskBlock、BlockRelation、Sync、FileStorage、Asset、AI 和 Stats。旧配置仍存在程序化 DDL、Redis、Milvus、旧 LangChain4j 配置和开发默认值。

这些内容只用于替换前盘点；阶段 0 不从旧代码复制实现，也不承诺旧 API、Result、WebSocket 或数据库行为兼容。

## 绿地目标模块

新 Server 基础包固定为 com.auralis.app，使用模块化单体：

| 模块 | 责任 | 阶段状态 |
| --- | --- | --- |
| identity | User、Password、JWT、RefreshSession、Device、Auth HTTP | 阶段 1 已实现，待 PostgreSQL/人工验收 |
| subject | Subject 及历史默认标记兼容；不保存专属颜色 | 阶段 2A 已实现，V19 已移除历史颜色列；本地 PostgreSQL 已升级验证，待真实业务验收 |
| source | Source、Asset、MinIO、解析任务 | 阶段 2B 已实现上传端口、Source CRUD/重摄入，待真实 MinIO/解析验收 |
| knowledge | KnowledgeBlock | 阶段 2A 已实现，阶段 2B 已接入 Source 关联 |
| task | Task | 阶段 2A 已实现，待 PostgreSQL/人工验收 |
| relation | 通用跨对象关系 | 阶段 2B 已实现端点校验、去重、软删除级联，待 PostgreSQL/人工验收 |
| review | ReviewState、生命周期命令/有效结果；历史 `review_events` 仅保留统计读取 | 生命周期接口已实现；FSRS Lite 调度与旧写入/读取路由已移除 |
| sync | Device、mutation、change log、高水位 cursor、snapshot、墓碑 | 阶段 3 已实现，待双设备/过期 cursor/生产验收 |
| ai | 模型配置、BYOK、Provider、Chat run/attempt、RAG、Suggestions、阅读 scope、结构化总览 | Chat 协议 1、V44 会话绑定与 attempt 冻结来源检索已实现；Source/Subject overview 验证见对应阶段；待真实 Provider 与业务验收 |
| stats | 强类型统计读取模型 | 阶段 4 已实现，待 PostgreSQL/业务验收 |
| realtime | WebSocket ticket 和用户级事件 | 阶段 4 已实现，待浏览器/跨实例验收 |
| shared | 错误模型、时钟、ID、分页、最小公共设施 | 配置/错误/OpenAPI 基础 |

阶段 2B 延续 Spring Modulith 模块边界：identity 的 Entity、Repository 和 security 实现放在 internal 包，认证主体放在 `shared.security` named interface，Source/Relation 的持久化放在 internal 包，公开 DTO、Service 和 Controller 位于各业务模块根包；业务模块只能通过模块根公开 API、显式 DTO 或 `shared.domain` 领域事件协作。Relation 通过领域事件监听 Subject、Source、KnowledgeBlock、Task 删除，不反向依赖这些模块。

2026-09-11 的 Task 4 复核确认 `source` 通过 source-owned `ParsedDocumentIngestionPort`/`IngestionJobReference` 调用 `ai.ingestion` 的公开契约，生产 source 不再引用 ai 内部服务或实体，`ai → source` 单向依赖由架构隔离命令（含 `ArchitectureTests`）7 类合计 20/20 覆盖，其中 `ArchitectureTests` 1/1。H2 fixture 清理连续两次聚焦 24/24；OpenAPI artifact 聚焦 8/8。上述隔离证据不替代标准 Maven fresh testCompile 或真实 PostgreSQL/MinIO 验收。

## 阶段 1 实际 HTTP 表面

阶段 1 已实现 Auth Controller，目标可访问路径为：

- /actuator/health
- /actuator/health/liveness
- /actuator/health/readiness
- /v3/api-docs
- /swagger-ui/index.html
- POST /api/auth/register
- POST /api/auth/login
- POST /api/auth/refresh
- POST /api/auth/logout
- GET /api/auth/me
- GET /api/auth/sessions
- DELETE /api/auth/sessions/{sessionId}
- DELETE /api/auth/sessions/others

除 Auth 外，阶段 2A 已实现 Subject、KnowledgeBlock、Task，阶段 2B 已实现 Source、Asset、Relation，阶段 3 已实现 Sync，阶段 4 已实现 Review、Stats、Realtime，阶段 5 已实现 AI settings、Conversation、SSE message、Suggestions 和 ingestion/retrieval 后端基线；R1 已完成会话并发版本/消息序号、短事务请求保留、离线会话恢复键、核心列表 cursor 与 Sync 清理调度。新用户注册不自动创建“未分类”Subject，历史默认标记仅用于兼容读取且允许普通软删除。请求/响应、Problem Details 字段和版本/cursor 规则以 docs/contracts/API.md 为准；数据库目标以 docs/contracts/Database.md 为准；对象差异以 docs/contracts/ObjectModelMatrix.md 为准。

Identity 的登录设备列表以活动 refresh session 为边界：同一用户/设备重复登录会替换旧活动会话，`GET /api/auth/sessions` 仅返回每台设备一条当前或最近活动记录，轮换、撤销和过期记录不作为设备条目展示。

## 阶段 2A 实际 HTTP 表面

阶段 2A 新增：

- Subject：`POST/GET /api/subjects`、`GET/PUT/DELETE /api/subjects/{id}`、`POST /api/subjects/{id}/restore`。
- KnowledgeBlock：`POST/GET /api/knowledge-blocks`、`GET/PUT/DELETE /api/knowledge-blocks/{id}`、`POST /api/knowledge-blocks/{id}/restore`。
- Task：`POST/GET /api/tasks`、`GET/PUT/DELETE /api/tasks/{id}`、`POST /api/tasks/{id}/restore`、`POST /api/tasks/schedule-swaps`、`POST /api/tasks/schedule-insertions`；Task 颜色字段已由 V21 从 API、Entity 和历史同步 JSON 中移除，KnowledgeBlock 颜色仍保留。

创建、更新、删除和恢复统一执行 `baseVersion`、userId 隔离和软删除语义；Subject、KnowledgeBlock、Task 列表使用不透明 keyset cursor 和 `limit`（默认 100、最大 200），返回稳定 `nextCursor`/`hasMore`。Task 排期创建、更新、恢复和换位在事务中先悲观锁定所属 User 行，再按既有 Subject→Task 顺序加锁，以序列化同一用户跨学科的排期写入；通过 TaskService 进入的 REST 与 Sync 写入共用该锁。服务端按 `[scheduledAt, scheduledAt + durationMinutes)` 检查同用户所有未取消、未删除 Task，首尾相接允许，`durationMinutes=null` 按 30 分钟比较；update 排除自身，restore 检查恢复后的区间，swap 同时排除双方旧行并校验双方新区间互不重叠且不冲突于第三方。冲突返回 `VALIDATION_FAILED`，Sync 将该 mutation 记为 `REJECTED`，不会部分写入。Task 创建、恢复、排期/有效时长/截止时间变化及取消后重新进入活动排期时，若排期与截止均存在，必须满足 `scheduledAt + effectiveDurationMinutes <= dueAt`，恰好结束允许，无截止不限制。仅标题、备注或状态变化且有效时间值相同的历史越界排期仍可保存（包括自动 DONE），空时长与显式 30 等价；不批量改写旧数据。V23 移除历史排期顺序 CHECK，本轮由领域服务校验，不新增数据库约束或迁移。Task 换位仍以稳定 UUID 顺序获取两个悲观锁，在一个事务中校验版本及换位结果；任一失败均回滚，避免半交换。无法反序列化为 `Instant` 的请求字段由 Problem Details `400 VALIDATION_FAILED + fieldErrors` 返回，而非未处理 500。KnowledgeBlock 新建、改绑和移科时的 `sourceId` 校验同用户活动 Source；所属学科与来源均未改变的普通更新可保留已软删来源。Source 删除通过 shared 事件级联软删除 Relation，知识块保留。

`POST /api/tasks/schedule-insertions` 在不含 `targetTaskId` 时将 Task 插入普通时间槽并顺延发生区间冲突的后续 Task，保留未冲突的空档；含目标 ID 时按本文件最新主体规则严格放置。该请求携带被拖 Task 的 `baseVersion`、目标 `scheduledAt` 及当天 `windowStartAt`/`windowLastStartAt`（08:00 和 22:30 对应的 UTC instants）；服务端按窗口起点向上取整到半小时槽。完成 Task 固定、取消 Task 不占用时间，若需要移动完成 Task 或顺延超出窗口则整体拒绝；被拖任务及全部实际顺延任务均检查新结束时间不晚于各自截止时间；任一超限整组拒绝，校验先于所有任务保存，版本及时间保持原值。所有实际改时的 Task 各增加一次版本并发布普通 `UPDATE` 变更，HTTP 200 响应只返回实际变化的 Task；原子写入失败不保留任何部分变更。REST 路由保留；PC Timeline 使用 `SCHEDULE_INSERTION` inbound Sync 命令承载同一请求语义，离线与在线均经单条幂等 mutation 调用该事务。`SCHEDULE_SWAP` 同样承载双方 Task ID 和 baseVersion，通过现有原子换位事务执行。排期命令类型仅用于 inbound mutations，change log 仍记录每个 Task 的普通 `UPDATE`。

排期命令 payload 的源 Task ID 与源 `baseVersion` 必须分别等于外层 mutation 的 `resourceId` 和 `baseVersion`；换位命令还必须提供目标 Task ID 与 `targetBaseVersion`。缺少必填目标字段或源身份不一致时抛出 `VALIDATION_FAILED`，由 Sync 将该 mutation 的拒绝结果幂等保存，拒绝快照也按外层源 ID 读取。客户端以完整当前 Task 数组原子结算，可接收服务端返回的额外顺延 Task，并在整批检查未解决命令、版本回退和墓碑后合并。

Sync 批次逐条执行。领域写入遇到预期业务异常时结束并回滚原事务，再复用 CREATE 主键碰撞的独立回执事务，按原用户、设备、mutation ID 和指纹结算。版本冲突记录 `CONFLICT`，其他预期业务失败记录 `REJECTED`，同批继续。未预期的基础设施或内部错误继续传播。[同步契约](../contracts/API.md#阶段-3-离线同步已实现契约)

顺延链只移动起始时间位于目标日窗口内的 Task；前一日开始、区间延续到当天的 Task 不会被改期，若与插入结果冲突则整笔拒绝。

2026-09-18 Task 2A：Subject DELETE 仍使用原有公开 API 和软删除语义，但在同一事务内通过各业务模块的公开领域事件边界级联软删除当前用户、当前 Subject 下的活动 Source、KnowledgeBlock 和 Task。每个子资源递增 version/更新时间、发布普通 `DELETE` `ResourceChangedEvent`，并继续发布端点删除事件使相关 Relation 逐条生成墓碑；已删除子资源不重复写入，Subject restore 不恢复子资源。级联异常会回滚 Subject、子资源、Relation 和 change-log 写入；不改变 ParsedDocument 审计元数据、延迟 Asset/MinIO 保留清理或数据库 schema。

Task 2A 统一数据库锁协议：所有涉及 Subject-owned 资源的写事务先收集 owner Subject IDs，去重并按 UUID 升序通过 `SubjectLockCoordinator` 获取悲观行锁，再按稳定资源顺序锁定具体 Source/KnowledgeBlock/Task/Relation，最后重新读取并校验活动状态、归属、`subjectId` 和 Relation 端点。Task 排期写入还须在此前先通过 `IdentityService.lockUserForScheduling` 锁所属 User 行，锁序固定为 User→Subject→Task；Subject 删除等非排期路径仍从 Subject 锁开始，不得在持有 Task/Subject 锁后反向等待 User 锁。代码复核必须逐条回答：

- 涉及哪些 Subject，是否覆盖移动、换位、Relation 两端和级联端点？
- Subject 锁是否由 `SubjectLockCoordinator` 去重并按 UUID 升序先取得？
- 对 Task 排期 create/update/restore/swap/insertion，User 排期锁是否先于 Subject 锁取得并覆盖整个冲突查询与写入事务？插入重排是否按稳定 Task ID 顺序一次锁住目标与当天参与任务？
- Subject 与具体资源锁取得后，是否重新读取并重新验证活动状态、归属、版本和端点？
- 是否不存在持有 Source/KnowledgeBlock/Task/Relation 锁后再获取 Subject 锁的 Resource→Subject 反向路径？

首次解锁读取仅可用于发现 owner Subject lock set；它的实体和值不得直接用于 mutation。该协议覆盖 Subject delete、Task schedule swap、Source/Task move、Relation create/update/restore/delete、KnowledgeBlock source validation、resource create/restore 及 ParsedDocument Source fence，不改变 API、schema 或 MinIO retention。

阶段 2B 验证证据：2026-08-13 `Auralis-Server\\mvnw.cmd -B -ntp clean test` 退出码 0，阶段2B基线执行 42 个真实测试；包含 V1/V2/V3 schema、Source/Asset/Relation Repository/Service/Controller、KnowledgeBlock Source 关联、RELATED_TO 反向去重、端点删除级联、Auth/阶段 2A 回归和 Modulith 边界。阶段 3/4 审核修复后在全量 clean test 中验证 Sync、Review、Stats、Realtime、V6/V7 迁移和并发回归，最终合计 69 个测试。证据范围为 H2、JPA、MockMvc 和测试存储适配器，不包含 PostgreSQL、Docker、真实 MinIO、解析 worker、双设备、浏览器 WebSocket、三端联调或人工业务验收。

## 目标技术基线

- Java 21。
- Spring Boot 4.1。
- Spring Modulith 2.1。
- Maven Wrapper + Maven。
- Spring MVC、Bean Validation、Actuator、springdoc OpenAPI。
- Spring MVC converter 与所有 Auralis 自有生产/测试源码统一使用 Jackson 3 的 `tools.jackson` 命名空间；JSON object payload、流式 ParsedDocument 校验、WebSocket、Review 持久化和 Provider HTTP 均不混入 Jackson 2 类型。`JacksonNamespaceGuardTests` 允许 Jackson 3 保留的 `com.fasterxml.jackson.annotation`，并阻止其它 `com.fasterxml.jackson` 导入。
- 当前持久化使用 Spring Data JPA + Flyway V1–V15；R1-03 的 pgvector 写入/检索通过 JDBC repository 接入，H2 保留 JSON fallback。V15 追加 PC Tauri ParsedDocument 派生表、Source ingestion revision、FILE 状态约束和 ingestion job 关联字段；ParsedDocument 不进入同步表。S3 已实现 `/api/sources/{sourceId}/parsed-documents/upload-intents`，仅按 owner/revision 创建 `UPLOADING` 派生记录并向现有 `AssetStoragePort` 请求限定 MIME/checksum/size 的私有签名。
- 目标数据库使用 PostgreSQL 17 + pgvector；V9 创建 vector(1024)/HNSW，V10 提供 generation cutover，V11 回填历史 JSON embedding。
- 后续对象存储使用 MinIO。
- 新工程移除 MyBatis Plus、运行时 DDL、Redis、Milvus、etcd、旧 JJWT 配置、统一 Result 和 encryptedPayload。

## 配置与安全边界

阶段 1 绑定身份 token TTL 和 JWT secret 配置；local/test 缺少 secret 时生成进程内随机密钥，prod profile 缺少 `AURALIS_JWT_SECRET` 必须启动失败。提交文件不得包含真实密码、JWT secret、BYOK key、AI key 或 refresh token。

生产配置从环境变量读取数据库、MinIO、JWT、BYOK 加密、平台生成、平台 Embedding 和 CORS 值；生产 profile 对缺失的关键启动配置执行 fail-fast。所有业务 Repository 必须在查询中带当前 userId；日志过滤 Authorization、Cookie、refresh token、BYOK key、完整 prompt 和模型回复。

AI 运行时使用结构化事件名输出可观测性：`AI_STREAM_*` 记录用户消息保留、Provider 选择、成功/中断/失败与耗时，`AI_EMBEDDING_*`/`AI_RETRIEVAL_SUCCESS` 区分向量化和检索阶段，`AI_PROVIDER_HTTP_*` 记录上游 host/path、解析地址数量、请求/响应字节数、SSE 行数、状态和耗时，`AI_SETTINGS_RESOLVED` 标记 BYOK 或 `ENV_DEFAULT` 来源。除 Overview 失败事件外，其它既有失败事件额外记录原始异常类名、单行截断后的 message 及 root cause 类名/message；Authorization、API key、token、secret、password 和 URL query 会脱敏。OpenAI-compatible completion 在响应 envelope 缺少有效文本 content 时记录 `AI_PROVIDER_RESPONSE_INVALID`，仅包含 provider、清洗且最多 64 字符的 modelId、choiceCount、allowlisted finishReason、content/reasoning 类型和字符数、usage/token 数量，不包含 prompt、响应正文、endpoint URL 或 key。资产直传和 Source 登记分别输出 `ASSET_UPLOAD_INTENT_*`、`ASSET_UPLOAD_COMPLETE_*`、`ASSET_UPLOAD_READY`、`ASSET_UPLOAD_REJECTED` 和 `SOURCE_CREATED`，可区分凭证申请、浏览器直传后的 HEAD 校验和登记阶段。未预期 HTTP 异常固定输出 `UNEXPECTED_API_ERROR`，携带 trace ID、HTTP 方法、无 query 的路径、异常类型和堆栈，响应仍保持脱敏的 Problem Details。日志只输出 UUID、host、模型、数量、长度、状态和稳定错误码，不输出完整 prompt、模型回复、文件内容或响应体；Overview 失败事件的 allowlist 见下文。

## 阶段 2B 实际 HTTP 表面

- Asset：`POST /api/assets/upload-intents`、`POST /api/assets/{id}/complete`、`POST /api/assets/{id}/download-url`；upload intent 要求用户范围的 `clientImportId`，通过数据库唯一约束和事务竞态重载实现幂等创建；同 key immutable metadata 冲突稳定返回 409 `MUTATION_REJECTED`，不同用户相互隔离。AssetStoragePort 提供 test 适配器与配置启用的 MinIO 适配器。
- Source：`POST/GET /api/sources`、`GET/PUT/DELETE /api/sources/{id}`、`POST /api/sources/{id}/restore`、`POST /api/sources/{id}/reingest`。
- Relation：`POST/GET /api/relations`、`GET/PUT/DELETE /api/relations/{id}`、`POST /api/relations/{id}/restore`。
- Source 的 ingestion worker、Tika 解析和 source_chunks/pgvector 已在阶段 5 后端基线接入；Source/Relation 列表同样使用稳定 keyset cursor；真实 MinIO、完整 PostgreSQL 门禁和生产分页性能仍不在本阶段验收范围。

Source 删除是可恢复的软删除：`AssetRetentionCleanupService` 默认保留 30 天，按小时扫描过期 Source 并物理删除对应 MinIO 对象；Asset 与 Source 元数据不硬删除，Asset 改为 `ORPHANED` 以保留审计和 KnowledgeBlock 外键可追溯性。可通过 `AURALIS_UPLOAD_ASSET_RETENTION_DAYS`、`AURALIS_UPLOAD_ASSET_CLEANUP_DELAY_MILLIS` 和 `AURALIS_UPLOAD_ASSET_CLEANUP_INITIAL_DELAY_MILLIS` 调整保留期与调度频率。

## 阶段 3/4 实际 HTTP 表面

- Sync：`POST /api/sync/push`、`GET /api/sync/pull`、`GET /api/sync/snapshot`；SyncService 校验活动设备，SyncMutationProcessor 在独立事务内原子完成幂等占位、领域命令、change log 和最终结果，并提供高水位不回退的不透明 cursor；snapshot 包含必要墓碑。`SyncRetentionService` 按配置定时清理 30 天外日志/幂等记录，保留高水位并记录清理与 reset 指标；scheduled 入口自身建立事务，避免同 Bean 调用绕过 `purgeExpired()` 的事务代理。
- 五类 Sync 资源的领域创建在发布事件或排入 Source 摄入任务前执行 `persist` 和 `flush`。已加载的同 ID 实体或数据库主键碰撞使本条创建事务回滚，SyncService 在事务外捕获该冲突，复用幂等逻辑在新事务内记录 `REJECTED/MUTATION_REJECTED` 后继续批次。隔离 PostgreSQL 验证覆盖同账号和跨账号碰撞、版本与墓碑保留、Source 摄入任务和并发首个写入。
- Review：`GET /api/reviews/states`、`/api/reviews/lifecycle/*`；ReviewLifecycleService 独立保存学习完成、复习初选/核对/纠正与生命周期历史。
- Stats：`GET /api/stats/overview`、`GET /api/stats/weekly`；StatsQueryRepository 对所有聚合带 userId 条件，weekly 固定连续 7 天。JDBC repository 边界会把查询参数中的 `Instant` 统一转换为 `java.sql.Timestamp`，避免 PostgreSQL 驱动无法推断时间参数类型；SQL、HTTP response 和数据库 schema 不变。`StatsQueryRepositoryTests` 覆盖 `dueReviews`、`completedReviews`、`reviewed`、`studySeconds`、`completedTasks`、`createdKnowledge` 六个查询的全部时间参数，并断言 UUID 与参数顺序保留；`StatsServiceTests` 覆盖 overview/weekly 与完成时间统计。
- Realtime：`POST /api/realtime/ticket` 使用 Bearer access JWT 签发短期 ticket；`/ws/events` 仅由 `RealtimeWebSocketConfiguration` 的 WebSocket handler 承接，握手从 query `ticket` 或 `X-Realtime-Ticket` 消费 ticket，不设 MVC `GET` 回退路由。RealtimeService 对 ticket 做 hash-only 存储、一次性消费和设备归属校验，提交后事件监听器向用户级订阅者转发 Sync/Review 通知。

## 验证边界

阶段 2A/2B/3/4 已有：

- Maven Wrapper 完整构建和真实测试。
- Spring context test。
- Spring Modulith ApplicationModules.verify。
- Problem Details 和 traceId MockMvc 测试。
- 健康检查和 OpenAPI smoke test。
- Flyway V1、JPA entity/repository、密码/JWT/refresh rotation、Auth Controller 和用户隔离测试。
- Flyway V2、Subject/KnowledgeBlock/Task Entity/Repository/Service/Controller、版本/墓碑/恢复和跨用户 Subject 引用测试。
- Flyway V3、Source/Asset/Relation Entity/Repository/Service/Controller、Asset HEAD/stat 元数据校验、Source 类型/Asset 归属、Relation 端点存在性/去重/级联删除测试。
- 配置启用 MinIO 的 presigned PUT/GET 与 stat 适配器代码；真实对象存储调用仍未联调。
- V4/V6 change log/inbound mutation schema、Sync 原子 push/pull/snapshot、高水位 cursor、墓碑、cursor round-trip、幂等和版本冲突测试。
- V5/V7 Review schema、FSRS-lite 调度、完整状态快照/SKIP/复习事件幂等、Stats completed_at 用户隔离聚合、Realtime ticket hash/过期/一次性消费和提交后事件桥测试；`RealtimeWebSocketIntegrationTests` 以真实 HTTP upgrade 验证已签发 ticket 可在不携带 Bearer header 的 `/ws/events` 握手。
- 旧包、旧依赖和生成目录静态检查。

阶段 2A/2B/3/4 不证明：

- PostgreSQL/pgvector/MinIO 容器联调。
- PostgreSQL/pgvector、真实 MinIO 容器联调、Source 解析 worker、source_chunks、跨实例 broker、双设备断网恢复、浏览器 WebSocket 客户端、AI/RAG 或前端新契约可用。
- PC、Mobile、Tablet 与新契约联调。
- GUI、真机、外部服务或产品验收。

## 构建命令

阶段 0 新工程使用：

    cd Auralis-Server
    .\mvnw.cmd -B -ntp clean test

旧 Server 的历史 `mvn test` 结果不作为新 Server 证据；旧源码已移至仓库外备份，阶段 1 新实现只使用 `com.auralis.app`。

## R1-06 工具链和运行配置

- `mvnw.cmd` 对 Maven 本地仓库先区分普通目录与有效链接目标，普通 Windows Maven 仓库不再触发空 `Target` 数组异常。
- `application.yml` 全局设置 `spring.jpa.open-in-view=false`；现有服务在关闭 Open-in-View 后通过 context/MockMvc/全量测试。
- `application-prod.yml` 显式设置 `springdoc.api-docs.enabled=false` 和 `springdoc.swagger-ui.enabled=false`；local profile 的 `/v3/api-docs` smoke 保持启用。
- POM 固定测试 H2 2.2.224，并用 Mockito 5.23.0 Java agent 配置 Surefire；默认自动启用 PostgreSQL/MinIO Testcontainers。R1-06/G1 定向配置测试 6/6，系统 Maven 与 Wrapper `clean test` 均为 135 通过、0 失败/错误/跳过。
- 该命令证据不替代真实 Provider、干净机器网络下载或前端/GUI 验收。

## R2 真实依赖与对象存储门禁

- `AssetStoragePort` 的 MinIO 实现使用服务端离线 SigV4 signer 生成 presigned PUT/GET URL：内部 endpoint 只用于容器内 HEAD/stat/open/delete，public endpoint 只写入浏览器 URL，不会被后端 SDK 反向连接；声明 sha256 时把 `X-Amz-Meta-Sha256` 一并交给客户端。完成阶段继续由服务端 HEAD/stat 校验 size、MIME 和 hash，下载签名失败记录脱敏的 `ASSET_DOWNLOAD_URL_FAILED` 事件。
- 上传校验失败会先持久化 `FAILED`，再尝试幂等删除对象；删除失败仍保留可审计数据库状态，并由 `scripts/audit-minio-assets.ps1` 做数据库/对象对账。
- `PgVectorIntegrationTests` 改为 Testcontainers PostgreSQL/pgvector，另有升级输入测试覆盖既有 V8 `embedding_json` 经 V9/V11 的 vector/HNSW/回填；`AiProviderResilienceTests` 覆盖 429、5xx、错误 JSON 和错误流事件。
- R2 真实依赖测试默认随 `mvn -B -ntp clean test` 执行；`postgres-it`/`minio-it` profiles 仍作为兼容别名保留。Docker Engine 不可用时默认测试应失败，而不是跳过容器集成测试。

## 阶段 5 AI/RAG 后端实现边界

- `ai` 模块通过 `AiProviderPort`、`EmbeddingProviderPort` 与统一的 `ProviderHttpClient` 调用生成和向量端点。聊天流式端口为 `streamInto(request, credential, cancellation, sink)`，DeepSeek 复用 OpenAI 兼容的流式实现。Provider URL 执行公网 HTTPS 校验、DNS 公网地址过滤与固定地址连接（混合解析结果只连接公网地址，全部为私网时拒绝），重定向关闭，并受超时和响应体上限约束。命名的个人 Provider 继续使用 host allowlist。连接超时由 `AURALIS_AI_PROVIDER_CONNECT_TIMEOUT_MILLIS` 设置（默认 3000ms），普通非流式 completion、stream、embedding 的 response/read 超时由 `AURALIS_AI_REQUEST_TIMEOUT_MILLIS` 设置（默认 10000ms），Overview 非流式生成使用 `AURALIS_AI_OVERVIEW_RESPONSE_TIMEOUT_MILLIS`（默认 120000ms，配置边界 60000–120000ms）。`SocketTimeoutException` 映射为 `MODEL_TIMEOUT`/504，其它 IOException 映射为 `MODEL_UNAVAILABLE`/503。
- Chat 和 Overview 新请求以 `OPENAI_COMPATIBLE` 解析生成设置，优先使用当前用户该槽位的 BYOK，其次使用 `AURALIS_AI_GENERATION_*`。三种个人槽位均可保存、测试连接和查询模型。入库与检索从 `AURALIS_AI_EMBEDDING_*` 解析平台凭据，向 `/embeddings` 发送 `model`、`input`，沿用 1024 维有限数值校验。各平台端点的 Base URL、模型和 Key 缺省为空，缺项时相应的平台调用返回 `MODEL_UNAVAILABLE`。BYOK 使用 AES-GCM，日志、异常、DTO 与凭据 `toString()` 不回显 key。V45 将历史 `embedding_model` 列改为可空，现行凭据实体省略该列并保留既有值。
- Overview 依据实际凭据来源解析模型容量。平台凭据读取生成配置中的上下文窗口和最大输出 token。BYOK 凭据读取 `auralis.ai.overview-model-capacities` 中精确匹配 Provider、端点与模型的条目。容量缺失时在派发前返回 `MODEL_UNAVAILABLE`。实际 `max_tokens` 继续受阶段需求、上下文余量和 Overview 预算约束。
- ingestion 由 Source 提交后事件触发，`IngestionJobService` 做用户/Source 归属和活动任务去重，并通过数据库锁定的 claim-next 分配租约；条件化 `IngestionWorkerScheduler` 自动轮询，lease 过期可恢复，失败按最大次数回到 PENDING，耗尽后进入 FAILED。`IngestionWorker` 负责解析、固定大小重叠切块、1024 维 embedding 和 chunk 替换。
- `ChatReadTools.search` 通过 `RetrievalService.retrieveWithinSources` 查询每次 attempt 捕获的 READY 来源。模型可传入最多 100 个唯一来源 ID 缩窄查询。空快照返回空 evidence，非空查询由 Gateway 生成一次 query embedding。PostgreSQL 的 `PgVectorRetrievalRepository` 以绑定的来源 UUID 数组和 owner、活动 chunk、未删除且 READY 的 Source 条件执行一次向量 TopK。H2 对同范围内的活动 chunk 执行 JSON cosine 并合并排序。检索前后校验 owner、subject、READY 和 revision。`SourceChunkService` 使用 generation 写入新 chunks，事务成功后切换 active，失败保留旧 generation。
- `ConversationService` 负责 owner-scoped 创建、列表、详情和版本化软删除。`ChatRuntimePersistenceService` 在短事务内准入 turn、锁定会话并写入唯一 USER 消息及 run。Provider I/O 在事务外执行。回复由现行 attempt 路径持久化并关联 USER 消息，公开 SSE 按协议 1 投影。原直接追加消息、旧 Prompt 组装和旧阅读会话清理路径已移除，历史会话与消息按协议支持状态读取。
- Chat conversations 持久化 `LEGACY`/`UNBOUND`/`BOUND` 读取范围状态。首次成功 admission 在保存 USER/run 的同一事务内绑定策略和 ID；同会话后续 omitted context 继承绑定，冲突以 HTTP 409 `CHAT_SCOPE_CONFLICT` 拒绝且不保存 USER/run。绑定不含 selectionText 或 revision，每 attempt 重新捕获和校验当前 owner/subject/READY/revision。V44 将既有会话显式保留为 LEGACY；旧会话仅查看，用户需新建会话。详情和列表返回范围状态及已绑定范围。PC 已接入继承与切换交互，每轮引用由命令顶层 `selectionText` 传递。
- 2026-11-05 范围绑定批次的目标测试、OpenAPI export 及 artifact 19/19、`-DskipTests package` 均通过。正确配置 task-owned PostgreSQL 的 backend full 为 1096 tests / 3 failures / 0 errors / 2 skipped；失败是 AiFeaturePolicyParity stage=0、TaskColor 旧断言 V42 vs V44、OverviewIdentity fixture V41 vs V44。未更改这些无关断言。唯一只读 reviewer B0/I0/O0；未部署、未重启、未调用真实 Provider，未执行 GUI/客户端验收。证据与日志见 `D:/Temp/auralis-chat-screenshot-failure-20261105/implementation.md`。
- Suggestions 当前是类型化、可替换的确定性输出层，已完成 KnowledgeBlock owner check，但尚未接入真实 LLM 生成或 RetrievalService citation 组装。
- `POST /api/ai/source-overviews` 与 `POST /api/ai/subject-overviews` 是不创建持久作业的结构化生成边界，默认 JSON、可选 SSE。前者经 `SourceService` owner/active/READY 校验后只通过 active 定向查询读取 ai 模块中的 chunks，并按完整 `auralis.ai.max-prompt-chars` prompt 长度分批归纳、分层归并且每次调用前精确检查上限；后者 owner-check Subject，并验证每个输入 Source 归属该 Subject、无重复且按 mode 有可用 part。服务端为模型分配短 alias，固定 SYSTEM 与独立 USER 数据隔离，map/reduce 全程只保留 alias；输出仅接受一个 JSON object/JSON fenced block，经数量、长度、alias 和 mode nullability 校验，当前无可信页码/block alias 因而强制 `locator=null`，仅最终响应回映射真实 Source UUID。Provider 输出解析/结构错误统一为 `502 MODEL_PROVIDER_ERROR`，客户端输入仍为 `400 VALIDATION_FAILED`。它们重用 `AiSettingsService`、`AiProviderRegistry` 和 `AiProviderPort.complete`，不创建 Conversation/Message，不写 sync/change log，也不新增数据库 schema、表或 Flyway migration；PC 先保存本地派生结果，再通过独立 Overview results GET/PUT 持久化完整成功产物；生成接口本身仍保持无状态。Overview 请求可携带 `X-Overview-Request-Id`；服务端将其规范为 UUID（非法或含敏感内容时生成新 UUID），为每次 user/source/revision 生成 `generationId`，并按 MAP、REDUCE、JSON_PARSE、SCHEMA_VALIDATE、CACHE_RETURN 输出阶段；失败日志只记录规范化 `requestId`、关联字段、阶段、allowlisted `errorCode`（DomainException 或六类已知 AiUsageLimitException code；未知码为 `OVERVIEW_GENERATION_FAILED` 回退）及 exception/cause 类型，不记录原始 exception/cause 文本或 throwable stack。
- `CACHE_RETURN` 仅是 alias 映射/返回前的诊断阶段，不读取或持久化结果；`X-Overview-Request-Id` 也只做日志关联。Provider 成功但 HTTP 响应未到达 PC 时，客户端尚未执行独立 Overview results PUT，之后手动重新生成会创建新 request/generation ID、再次调用 Provider 并单独结算用量。当前 Controller 同时提供默认 JSON 和明确 opt-in 的 SSE；对不支持的 Accept，`HttpMediaTypeNotAcceptableException` 返回 HTTP 406 `NOT_ACCEPTABLE` Problem Details，不归类成 500。
- Task 14（2026-09-09）：Source ingestion 的 `PARSING`、`PENDING`、`INDEXING`、`READY` 和 `FAILED` 状态及安全失败诊断统一经 `SourceService` 实际持久化后发布既有 `SOURCE/UPDATE` 事件；重复相同状态/诊断不写版本或 change log。ParsedDocument complete 在保持外层事务和 Source 锁的前提下通过该入口转入 `INDEXING`；接受后的异常会将 document、Source、job 和 change-log 一并回滚，预校验失败仍持久化 `REJECTED`。
- S1 已通过 `V15__tauri_parsed_document_schema.sql` 冻结 `parsed_documents` 的 owner/source/revision、parser/normalization/OCR model、Asset/payload/plain-text SHA、私有 object key、status、generation 和生命周期字段；历史非 READY FILE 在迁移时进入 `AWAITING_CLIENT`，已有 READY FILE 与活动 chunks 保持不变。S2 已让 FILE create/Asset 替换/reingest 等待客户端解析并停止发布旧 ingestion event，TEXT/URL 保留服务端 event；S3 已实现 owner-scoped upload intent，S4 已实现有界 gzip/JSON/ordinal/hash validator 与 legacy Asset SHA 条件回填；S5 已在 Source 行锁内完成 complete 首胜、同 payload 幂等、冲突/过期错误和唯一 revision job 关联；S6 已让带 ParsedDocument 的 worker 消费重新验证后的 blocks、隔离旧 revision/generation、兼容 reingest 复用 accepted 结果，并由 cleanup scheduler 删除过期 payload 对象且保留元数据。

阶段 5/R1 自动验证：H2/JPA/MockMvc/Stub Provider/架构及受控网络测试覆盖 AI 基线；R1 定向套件验证 V14、会话重试、并发同请求仅一次保留和流式回放；overview focused MockMvc/service 测试覆盖请求界限、owner/READY/active 定向查询、mode/part、重复 Source、精确分层 prompt、alias-only map/reduce、SYSTEM/USER 注入隔离、locator、fenced JSON、Provider 502 与不可信 JSON/alias/node 输出；S1 `ParsedDocumentSchemaTests` H2 clean/upgrade 4/4、S3 `ParsedDocumentControllerTests` 3/3、S4 `ParsedDocumentValidatorTests` 4/4 与 `AssetShaBackfillTests` 2/2、S5 `ParsedDocumentCompleteTests` 3/3、S6 `AiIngestionWorkerTests` 5/5、`AiSourceChunkTests` 3/3、`ParsedDocumentCleanupTests` 2/2 通过，PgVector upgrade 断言已补充但本机 Docker 不可用。此前默认 `mvn -B -ntp clean test` 的 PostgreSQL 17/pgvector 与 MinIO 容器证据仍保留；AI 日志脱敏与生命周期定向测试 26/26 通过。真实 Provider、性能和前端联调仍未完成。
### 2026-09-15 Overview 最小 JSON 诊断（临时）

为复核真实 DeepSeek 最终 `JSON_PARSE` 失败，Provider 在最终已序列化的请求体发送前，仅对识别为 Overview 阶段的 structured JSON 请求记录 `AI_JSON_MODE`：`structuredJson=true`、`responseFormat=json_object`、`maxTokens` 与由预算推导的 `stage`。Overview FINAL 在既有 validator 前使用同一 Jackson `ObjectMapper.readTree` 直接检查原始 `message.content`，记录 `FINAL_JSON_CHECK` 的合法性、字符数、行列号和异常类型；该检查不做 fence stripping 或其它预处理，因此 fenced JSON 会记录为 `valid=false`，不代表后续既有 validator 一定拒绝。不记录请求体、prompt、响应正文、原始异常 message、URL 或凭据。诊断失败不会吞掉或改变既有 Provider 输出错误映射；普通聊天/流式不变。自动测试已覆盖 DeepSeek FINAL wire body 日志、multi-batch 最终调用边界、合法/非法/fenced FINAL 检查和日志脱敏；未部署，真实请求待用户重跑。



### 2026-10-23 Overview M5.5：完整 descriptor 相等的 writer node 复用

- 实现私有 `ExecutionNodeDescriptor.globalRoutingFingerprint`，由有序章节/小节职责、(alias/sourceAlias/sourceId) 分组路由、mode、instruction 与 system policy 构成，不含其它组 text/revision/chunk。当前完整 descriptor 仍要求 JSON 与 SHA 同时完全相等，并包含目标组完整 unit refs 和 exact prompt-derived writer step。
- Donor 约束：同 owner/scope/profile/algorithm/step、SUCCESS；generation、ASSEMBLED plan、VERIFIED node 与 checkpoint input 身份一致；hash/schema/14天/result expiry、source/coverage/shape 有效；且本代 node 必须由真实 dispatched reservation journal 证明资格，防止无 reservation 的 materialized node TTL 接力。M5.4 完整 input donor 仍先于 strict descriptor donor。
- 顺序保持 current checkpoint 优先，beginAttempt 和 unknown-dispatch/RECOVERY_REQUIRED hold 在 lookup 前；命中沿原验证与事务 materialize 本代 node checkpoint，不创建 usage/reservation。提升 adaptive algorithm identity 隔离旧 descriptor 缓存；不迁移旧数据。
- 验证记录：`targeted-tests.log` 的 Coordinator 26/26、Adaptive 30/30，合计 56/56，exit 0；新增 Service acceptance 两例 2/2，exit 0。后者证明 B revision/chunk/hash 改变而 global route 结构不变时 A 可命中而 B 派发；相同 raw input 仅改变 B goal 时，global fingerprint 变化使 A/B 都派发。属分批定向证据，不宣称完整 58-case 批次或完整 M5 验收。唯一只读 reviewer B0/I0/O0。



### 2026-10-23 OverviewGenerationCoordinator expired-payload cleanup

- cleanupExpiredPayloads 保留现有 REQUIRES_NEW 事务与调度入口；每批按确定性顺序锁定至多 100 个 terminal generation 父行，使用 ORDER BY id LIMIT ? FOR UPDATE SKIP LOCKED，随后重读锁定行。ACTIVE generation 即使 lease 超时也不会清理。
- 独立判断对象过期：只清 SUCCESS 且自身 result_expires_at 已过期的 result；只删除 checkpoint.created_at 至少 14 天的 checkpoint。保留 generation 及 metadata/request mapping/budget/plan/node/call/reservation/unknown-dispatch hold lineage；返回实际清除的 result/checkpoint 行数。
- focused Maven 统一批次中 Adaptive 32/32、Coordinator 29/30，合计 61/62 passed、1 race fixture error（exit 1）。补足 active_fingerprint 并停止测试 heartbeat scheduler 后，affected-only 两事务测试 1/1（exit 0）；未重跑完整 62 项。H2 测试覆盖锁定行跳过和 takeover 竞态，不证明 PostgreSQL 行为。
- 仅 Coordinator 与其 tests 两文件变化。无 schema/API/migration/config、Service、journal、cache lookup、hard-delete/account-delete 改动。sole reviewer B0/I0/O0；无 PostgreSQL、full suite、package、Docker 或部署验证。

### 2026-10-23 Overview M5 完整复用与 payload 生命周期

- Donor lookup 延续 M5.1–M5.5 的 owner/scope、完整 input/source currentness、profile/algorithm/prompt step、descriptor/hash/schema/expiry、coverage/shape 校验。M5.4 完整输入 donor 在 M5.5 strict descriptor donor 前；unknown dispatch / RECOVERY_REQUIRED hold 先于查找。命中不新增 usage/reservation，也不延长 donor TTL。
- Standalone reusable cache 默认上限为 256 MiB 和 1000 generations，由 AURALIS_AI_OVERVIEW_CACHE_MAX_BYTES、AURALIS_AI_OVERVIEW_CACHE_MAX_GENERATIONS 配置。V38 singleton DB guard 串行 admission，只统计 unpinned SUCCESS result/checkpoint 的 UTF-8 bytes 与 generation 数；每次最多淘汰 100 个旧候选。锁竞争、超大 payload 或无法 admission 时不保存可复用副本，成功响应及 usage/execution journal lineage 继续完成。任何 durable-job linked generation 均 pinned 并排除在共享 cache 池外。
- Source/Subject deletion listener fence 相关 jobs/generations/publication intent，并按 owner/resource/job/generation 锁序清理私有 raw-derived copies。Receipt 保留幂等 key/hash，将 response snapshot 换成 revoked tombstone；旧 replay 映射为 RESOURCE_VERSION_CONFLICT。已完成 job 的 private request/manifest/candidate 及最后一个仍保留 job 到期后不再需要的 SUCCESS result/checkpoint/plan/node copies，按 14 天、有界事务回收；保留实际 recovery state、usage/reservation/journal metadata 与正式 saved result 的独立生命周期。
- 账号硬删除通过现行清理路径清除 Overview 行；隔离 PostgreSQL integration 覆盖目标 owner 移除与另一 owner、capacity guard、charged usage evidence 保留。详细验证范围及 full-suite 限制见 D 盘结案 handoff；未部署、未运行真实 Provider 或 GUI。



### 2026-10-23 总览阶段校验与本机预算收尾

- 主 Agent 直接修复：索引、元数据、目录和正文的阶段覆盖/形状校验在通用调用保存检查点前执行，恢复读取执行相同校验；正文内部顶层冗余 summary 规范化为空，最终目录摘要保留。目录请求校验别名收窄到实际 unit aliases。
- 预算拒绝日志增加阶段、资源、required/remaining；Overview MAP/REDUCE 与总任务共用 overviewMaxCalls，本机 trace overlay 临时设为64，默认24、Token预算524288及历史账本不变。
- 主 Agent 定向验证 OverviewAdaptiveGenerationTests + AiOperationPolicyTests：44/44，0失败/错误/跳过。此前两轮分别发现目录别名集合过宽、异常包装改变既有错误消息，均修复。证据 D:/Temp/auralis-pipeline-fix-20261023/tests-final.log。未调用真实 Provider；完整业务验收待重试。
- 既有不合格检查点会被拒绝，不自动删除；本轮没有增加全新任务预算入口，也未重置用量。当前仅修复新结果写入前的校验边界及恢复校验。

### 2026-10-23 Overview 调用次数观测配置

- `overviewMaxCalls=0` 表示 SOURCE_OVERVIEW、SUBJECT_OVERVIEW 的平台总任务及 MAP/REDUCE stage 不设累计调用次数预算；正数仍按原值限制，默认24不变。本机 trace overlay 选用0，以便记录这份长资料的实际调用次数后再定限额。
- 0 不影响逐次用量记账、任务/窗口 Token 配额、上下文及输出预算、并发、deadline、目录深度和持久调用历史容量。恢复仍沿用同一 budgetTaskId，旧账本不清除。

### 2026-10-23 Overview 预算路径第一批修正

- 修复证据：两个实际 run 的索引原文相同，但 Map.of 材料字段顺序在进程重启后不同，使精确提示词 checkpoint 指纹变化。索引及正文材料改为 TreeMap 固定字段顺序；旧不同文本指纹不作兼容匹配，新请求稳定后可按原规则复用。
- Writer preflight 不再将全部最大预留的总和作为硬拒绝条件；总和以 aggregateUpperBound 记录，先检查最大单请求预留能否装入当前余额，逐次派发仍由 Guard 原子预留并按实际 usage 结算。余额不足仍会中途停止，已有 verified checkpoint 保留，不保证整篇一定完成。
- Adaptive 单次预算评估改读持久化 task charged + reserved，包含历史尝试，避免日志把本轮余额当累计余额。新增日志包含 uncachedWriters、aggregateUpperBound、largestRequestReserve、charged、reserved、remaining。
- 定向 OverviewAdaptiveGenerationTests、OverviewBudgetIntegrationTests 共50/50通过（exit0），证据 D:/Temp/auralis-budget-path-20261023/tests.log；未运行全量、真实Provider或GUI。输入估算校准、动态输出预算、明确的预算暂停/恢复状态与用户可读预计成本仍待实现，本条不表示完整优化路线交付。
- 2026-10-28：`ADAPTIVE_ROUTE_INSTRUCTION` 补充每个 topic ID 只归属一个 section（含合并或重组）；这是防止 topic000175 跨节重复的提示词源码候选，尚未部署，模型效果未验收。

### 2026-10-31 Chat assistant content capture for local diagnosis (source candidate, not deployed)

`ChatRawContentCapture` optionally records decoded provider `delta.content` strings before parser input. Each iteration is written to a separate UTF-8 `.txt` file, preserving delta order, whitespace, line endings, and fences; UTF-8 bytes are re-encoded from the decoded text and are not the original provider SSE/JSON wire bytes. Reasoning, prompts, tool deltas/results, headers, and credentials are excluded. Capture is off by default; `AURALIS_AI_CHAT_DIAGNOSTIC_RAW_CONTENT_ENABLED=true` enables it and `AURALIS_AI_CHAT_DIAGNOSTIC_RAW_CONTENT_DIR` defaults to `/tmp/auralis-chat-diagnostics`. Total captured content across iterations in one attempt is capped by `AURALIS_AI_PROVIDER_MAX_RESPONSE_BYTES` (default 1 MiB). Log metadata contains only run/attempt/iteration IDs, path, byte count, complete, and truncated. Local I/O failure does not affect Chat. Files persist until manually removed; disable capture after the intended reproduction. No API or database changes; source candidate has not been deployed or used for a new model request.
### 2026-11-01 Chat 展示工具正文伪调用约束（源码候选，未部署）

SYSTEM prompt 明确要求结构化视觉组件通过 provider 的真实 `tool_calls` 协议调用对应 `render_*` 工具，不在 assistant content 或代码块中打印“工具名 + 参数 JSON”来伪装调用，也不以原始工具参数 JSON 替代渲染后的组件。正文仍可作简短引介、解释或总结；用户询问工具协议或要求代码时，仍可直接给出示例。协议、工具 schema、执行控制流及普通 Markdown 规则不变。`ChatAgentProtocolPublicationTests` 对映射后的初始与后续 Provider 请求检查该规则；该类 5/5 通过（0 failures/errors/skips，exit 0）。源码候选未部署，未调用真实 Provider；报告 `D:/Temp/auralis-literal-render-steps-20261101/findings.md` 记录了先前一次正文出现 render_steps 与参数 JSON 的观测，不能据此确认所有出现的根因。
