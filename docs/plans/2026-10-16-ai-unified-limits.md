# AI 统一限额与用量治理方案

日期：2026-10-16

状态：U1–U4 源码候选与自动门禁已完成；唯一 reviewer 最终结论 B0/I0/O0，报告 SHA-256 `D4CD78B7B5023B2B98A39A06377C8CD50C3FA3461038E6F3B48247C62352BEF8`。Candidate53 定向并发测试 7/7、focused 63/63、PostgreSQL 锁/跨功能竞争 5/5、V33 migration 1/1、OpenAPI artifact tests 12/12 均通过；完整 suite 121 suites / 690 tests / 0 failures / 0 errors / 0 skipped，package 自然退出码 0。最终 JAR 为 93,171,500 bytes，SHA-256 `CB0D89F5AFE392E316A7EB9AC919D2DCDF81AF0714DCE69CED8340725DBB1EC5`。未部署，真实 Provider、生产业务数据库、GUI/真机与业务验收仍待完成。

权威范围：全部外部 AI Provider 调用的统一计量与运行保护，以及平台提供模型的共享额度/调用预算。依托[现行 AI 用量设计](../design/2026-09-14-ai-usage-guard-design.md)，作为可独立实施的跨功能计划。

## 1. 目标

所有功能通过现有 `ai/usage` 的同一 Gateway、Guard 和账本调用模型。用户自带模型主要提供计量；平台提供模型执行账号/系统额度和调用预算。两类都保留服务运行、授权及协议正确性保护。

| 实际调用来源 | 产品规则 |
| --- | --- |
| 平台提供模型（服务端默认凭据） | 计量；检查平台小时/日额度、任务 token/调用预算，按负载预检。 |
| 用户自带模型（本人的 BYOK） | 计量；不扣平台额度，不套平台任务 token/调用数配额。保留超时、输入/响应资源边界、授权、服务容量和有限执行保护。 |

来源由服务端根据每次实际选用的凭据确定，不看模型名称或客户端标签。同一任务的自带 completion 和平台 embedding 分别归账；现有 embedding 配置仍为平台提供，继续沿用既有窗口豁免，本期不新增自带 embedding 配置。平台额度用尽不能阻止 BYOK 调用。当前不增加模型切换或自动降级。

本方案独立于学习 Agent：可先完成并应用于现有功能，学习功能随后消费其接口；统一层不依赖 learning 模块。身份初始化、进度、教学内容、知识块保存与正式 Review 由各业务计划负责。

首期 U1–U4 保留平台配额数值，新增可信来源分流、统一策略与用途计量；BYOK 豁免平台配额是本次明确的行为变化。Candidate53 的 U4 自动验证和 reviewer 已通过，来源分流仍是未部署候选行为。随后优先推进第 10 节 R1 的负载评估与动态任务契约；其他数值调整依据实际 usage 和业务质量单独验证。

## 2. 当前实现与缺口

2026-10-16 已完成生产源码的只读入口扫描，识别的 Chat、Source/Subject Overview、摄入和 Provider discovery 都经 `AiInvocationGateway.beginTask`，通过 scope 的 complete/stream/embed/metadata 完成预留、派发和结算。当前已有共享准入/账本；缺口是规则分布于 feature switch、请求封顶和业务 planner，尚无独立操作策略解析器。学习草稿仅允许 1 次调用，需要统一层识别用途并强制执行。

代码依据（路径相对 `Auralis-Server/src/main/java/com/auralis/app/`）：

- `ai/usage/AiTaskContext.java`：现有 user/feature/taskKey/budgetTaskId 身份。
- `ai/usage/AiUsageGatewayService.java:79–220,296–331`：建 scope、reserve/dispatch/settle 和请求封顶。
- `ai/usage/AiUsageGuard.java:52–200,470–547`：任务预算、共享窗口/并发、embedding 豁免。
- `ai/AiStreamingService.java:116,150,291`、`ai/OverviewGenerationService.java:602–620,1029–1033`、`ai/ingestion/IngestionWorker.java:112–113,197`、`ai/AiProviderDiscoveryService.java:47–63`：功能入口。
- `shared/config/AuralisProperties.java:104–123` 与 Server 的 `src/main/resources/application.yml`：当前默认配置。实际部署值仍以运行配置为准。

补充核对：`AiUsageGuard.reserve` 目前只有任务总次数检查；逐次 stage 已存在于 `V30__ai_usage_guard.sql` 的 reservations，但无 operation_kind。普通 Chat/Provider 的 scope task_id 由 beginTask 分配，当前 AiTaskScope 不返回它；taskKey 的 hash 只在锁表映射 current_task_id，不能据此承诺历史操作的直接账本关联。Overview Service/Planner 已区分 FINAL/INTERMEDIATE，Gateway 当前只收到 MAP/REDUCE，统一硬顶均为 6144。

来源现状：`AiSettingsService.resolve` 对 Chat/Overview 优先 BYOK，仅在没有非空已存 key 时使用服务端默认；远端调用失败后没有自动换 key。Chat 检索和 Ingestion 使用服务端 embedding；Provider discovery/test 要求已存 BYOK。当前 ResolvedSettings 与 ledger 均无可传递的来源字段，Guard 仍混计来源；日志来源字样不能代替可信的逐调用契约。以上依据为 `AiSettingsService.java:66–100,115–124,159–160`、`AiStreamingService.java:114–150,275–292`、`AiProviderDiscoveryService.java:45–80` 与 `ai/ingestion/IngestionWorker.java:190–200`。

负载方面：Overview 已按请求检查剩余预算、保守 token 估计与已知上下文边界，能在首个调用前确定初始 MAP 分组；后续 REDUCE 和恢复派发受实际响应/checkpoint 影响，尚无完整任务预算承诺。planContent 的 targetOutputTokens 当前仅用于日志，实际出站仍取阶段 4608/6144。摄入在解析得到 chunks 并加载 checkpoint 后，可按条数与字节限制枚举未完成 batch，得到成功执行时的剩余调用下限。主要任务预算、并发和窗口上限已有配置入口，不能把这些默认值都当作源码硬编码常量。

以上依据均在本仓库：`ai/usage/AiUsageGuard.java` 的 beginTask/reserve、`AiTaskScope.java`、`ai/OverviewGenerationService.java` 与 `OverviewBudgetPlanner.java`；DDL 位于 Server 的 `src/main/resources/db/migration/V30__ai_usage_guard.sql`。该结论是静态代码确认，不覆盖反射、仓库外调用、部署二进制或真实 Provider 行为；不代表本轮重新运行了应用测试或查询了生产账本。

## 3. 统一治理的层次

| 层 | 管理内容 | 权威与职责 |
| --- | --- | --- |
| 平台额度 | UTC 小时/日 token 窗口、全局日额度、平台任务 token/调用预算 | 原 Guard 和同一账本，只统计平台来源及明确标示的历史未知保守占用。 |
| 运行与操作协议 | 所有来源的并发、超时、输入资源、允许方法/角色、有限执行 | OperationPolicyResolver 解析；运行保护与平台额度分字段执行，不给 BYOK 套平台套餐上限。 |
| 模型/传输 | 已验证的模型容量、输出能力、响应 timeout、任务剩余 deadline | 沿用现有能力解析/传输；策略引用其边界，业务 planner 仍计算动态请求需求。 |
| 用量查询 | operation_kind、credential_source、actual、unknown、charged exposure、在途 reservation | 全来源用量与平台额度分别聚合；某次操作按可靠关联的 task_id 查询。 |

token、字符、字节、次数、并发数和毫秒保持不同字段/单位。reservation lease/heartbeat 管活跃性，不能替代 Provider timeout；上下文窗口和输出 token 上限不能用 prompt 字符数代替。未知模型容量继续保守处理。

## 4. 操作目录和初始策略

下表任务 token/总调用预算为平台来源的初始基线；现有环境变量覆盖仍有效。BYOK 保留实际请求和计量，不套这些平台配额。新的学习用途可预先在统一层注册并用合成测试验证，无须先实现学习业务。

| 操作 Kind | 现有 Feature | 平台任务预算 | Stage/接入规则 |
| --- | --- | --- | --- |
| CHAT_TURN | CHAT | 2 calls；32000 task tokens | RETRIEVAL_EMBEDDING + CHAT_COMPLETION。输出上限取现有 Chat 配置，默认 4096。 |
| SOURCE_OVERVIEW | SOURCE_OVERVIEW | 默认24 calls；524288 task tokens | MAP/REDUCE；配置的 Overview calls 同时限制总任务与各 stage 平台调用，沿原 generation/budgetTaskId 累计。 |
| SUBJECT_OVERVIEW | SUBJECT_OVERVIEW | 默认24 calls；524288 task tokens | 同上，保留原 Subject 输入和恢复规则。 |
| INGESTION_EMBEDDING | INGESTION | 512 calls；16777216 task tokens | INGESTION_EMBEDDING；job+generation、批次/claim/checkpoint 保持。 |
| PROVIDER_SETUP | PROVIDER_SETUP | 旧基线每 task 2 calls / 8192 tokens；当前入口仅 BYOK，分流后不执行此平台配额 | PROVIDER_METADATA / PROVIDER_TEST；列表/连通性测试各自独立 task，metadata 预留 0 仍审计，均保留运行保护。 |
| LEARNING_TURN（拟接入） | CHAT | 总次数 min(Chat 有效 maxCalls, 2)；token 边界继承 Chat | RETRIEVAL_EMBEDDING≤1、CHAT_COMPLETION≤1；资料关键词/邻接读取不调用模型。 |
| LEARNING_DRAFT（拟接入） | CHAT | 1 call；token/request 边界继承 Chat | 仅 CHAT_COMPLETION；embed 或第二次 complete 在统一层拒绝。 |

2026-10-23 实现核对：`AURALIS_AI_LIMITS_OVERVIEW_MAX_CALLS` 同时限制 Overview 平台总调用数与每个 MAP/REDUCE 阶段调用数，默认行为仍为24次；本机 trace overlay 的临时64次覆盖已通过 focused policy tests，尚未部署。任务 token cap 仍为524288，用量账本未重置。

2026-10-23 真实样本后续调整：64次配置下，同一任务账本已记29次，目录后写入预检还需54次，剩余35次，故在正文前被拒绝。按用户要求新增0哨兵值，表示暂不限制 Overview 平台任务及 MAP/REDUCE 累计调用次数；仅本机 trace overlay 设0，默认24仍保留。逐次计量、Token/窗口额度与结构性有限工作边界继续生效。收集成功及失败的真实账本与追踪数据后，按调用次数分布重新设定正数上限，不依据单一失败样本永久定额。

平台额度默认值：用户小时/日 1000000/2000000 tokens、系统日 2000000 tokens；BYOK 不扣减这些值。共有运行保护初始沿现有全局/用户并发 4/2、lease/heartbeat 300000/10000ms、prompt 12000 Java UTF-16 字符和 Overview 总 deadline 240000ms。服务容量拒绝显示繁忙，不显示 BYOK 平台额度用尽。Overview 业务请求组织暂保留中间 4608 / final 6144，合法 final MAP 可使用 6144；这些输出角色约束与技术/内容边界单列，不能把平台日额度当成模型技术上限。

次数分两层：平台费用控制的总/逐 stage 配额只统计平台调用；业务协议的有限执行约束统计所有来源。旧 Overview 的 24、Ingestion 的 512 不作为 BYOK 的同名平台配额；BYOK 沿实际批次、去重/checkpoint 和既有有限恢复完成任务。LEARNING_TURN 每 stage≤1、DRAFT completion≤1 是一期教学协议，对两类来源相同，不能切换凭据增加同操作轮数；尚未新增 repair。平台数值更小时继续收紧平台调用，不扩大预算；正常业务流程不因 BYOK 豁免自动增加模型调用。

`INGESTION_EMBEDDING`、`RETRIEVAL_EMBEDDING` 保留用户小时/日、系统日窗口豁免，平台来源仍受平台任务预算；所有来源保留并发、账号、字节和 reservation 管理。全部模型用途继续审计。Suggestions 当前为确定性服务，Provider 次数为 0；未来接模型先注册用途。本地 OCR 沿本机队列/资源限制，外部模型调用才接本方案。

共享并发按有效 RESERVED 调用预留计数，不按整个任务或累计 calls 计数。Ingestion 的 512 是任务累计调用上限，当前 worker 单 job 串行处理 batch；静态代码不能证明已发生前台饥饿。首期保留共享 4/2 准入。后续观察前台并发拒绝率、后台占槽时长与吞吐，再决定是否增加前台保留槽；届时按实际触发来源区分流量，不能把手动 Overview 一律归为后台，也不在本期直接限制后台占一半。

## 5. 结构与内部契约

业务声明操作、设置服务解析实际凭据来源 → Resolver 解析操作策略 → Guard 对所有来源做运行准入，仅平台来源做平台预算检查 → Gateway 核验并派发 → 原账本逐调用结算 → 分来源查询。

拟新增文件均位于 `Auralis-Server/src/main/java/com/auralis/app/ai/usage/`：

- `AiOperationKind.java`：上表用途枚举，不从任意 taskKey 文本猜测用途。
- `AiOperationPolicy.java`：有效 feature、平台调用/token 配额、`Map<AiStage, StageRule>`、字符/超时资源边界。StageRule 分开表示平台次数配额和可空的全来源业务执行次数限制，包含允许方法及输出角色，提供 `int maxPromptChars()` 等有单位访问器；禁止以平台配额兜底成为 BYOK 执行上限。
- `AiOperationPolicyResolver.java`：`resolve(AiOperationKind): AiOperationPolicy`，以完整的中央注册矩阵合并现有 AuralisProperties 配置，返回不可变快照；配置覆盖不能扩充允许 stage、伪造方法或改变 embedding 窗口分类。启动检查 Kind/Feature/Stage/角色覆盖与正值边界。
- `AiOutputRole.java`：GENERAL / INTERMEDIATE / FINAL，由受信任服务端声明。普通 Chat/Provider 使用 GENERAL；Overview 显式传递现有 OutputStage 对应角色。
- `AiCredentialSource.java`：PLATFORM / USER_SUPPLIED / LEGACY_UNKNOWN。AiSettingsService 的 ResolvedSettings 增加只读来源，随每次 complete/stream/embed/metadata 的实际配置传入 Gateway；metadata 同样明确 BYOK 来源。

AiTaskContext 增加第五字段，学习等新调用显式声明：

```java
public record AiTaskContext(UUID userId, AiFeature feature, String taskKey,
        UUID budgetTaskId, AiOperationKind operationKind) {}
```

现有三/四参数构造入口在中央按已知 Feature 映射默认 Kind，本期不移除构造器；来源则必须由每次实际调用配置显式提供。新用途的 Kind/feature/stage、实际 scope 方法和输出角色必须匹配：embedding stage 只走 embed，CHAT_COMPLETION 走 complete/stream，MAP/REDUCE 与 PROVIDER_TEST 走 complete，PROVIDER_METADATA 走 metadata；不能把 completion 标为 embedding 获得窗口豁免。调用方来自受信任服务端代码，客户端不能提交 policy、免计费标记、maxCalls 或 budgetTaskId 来放宽限制。

credential_source 不属于整个 AiTaskContext 的单值，因为任务可以混合来源。设置服务选出的凭据与来源组成同一不可变调用配置，reserve 与实际派发使用同一快照；新调用来源不明则按内部契约错误拒绝。客户端不得提交可改变计额度行为的 source；不能从 provider/model 名称、当前用户设置或 taskKey 推断过去来源，也不在派发失败后偷偷回落平台凭据。现有 key 缺失时的默认解析规则保留，解析结果如为平台即按平台检查。

同一 task 生命周期使用同一解析结果，首期不热更新策略。恢复继续沿各用途既有身份、账本累计和 Overview 父预算规则；不能为了获得新额度换 taskKey/budgetTaskId。学习同操作重放只读持久回执及已绑定 task_id，不再次 beginTask；明确新尝试才创建新操作。既有配置仍由 AuralisProperties 管理，本期不新增管理后台、第二个 limiter 或账本数据库。

业务保留内容组织、检索范围、分包、checkpoint、幂等与安全重试；统一层保留资源授权、请求核验和计量。desired maxTokens 满足共有技术边界，平台调用再检查平台预算；BYOK 不被平台费用输出顶额外收紧，实际请求默认保持。scope 的全来源 usage 审计与平台预算占用分别提供：Overview 等业务预检不能继续用全来源 charged/24 次计数拒绝 BYOK，也不能把 BYOK 消耗计成平台剩余额度。模型 context、字符/字节、角色及响应资源边界继续有效；已确认的平台合法输出做对等回归。

### 5.1 原子阶段计数与输出角色

次数在同一 reserve 事务、同一 TASK 行锁下核对，维持现有账号与 GLOBAL→USER→TASK 锁序。基础谓词为 `task_id=? AND (state='RESERVED' OR request_dispatched=true)`，stage 再加 `stage=?`；业务协议次数统计所有来源，平台任务配额再过滤 PLATFORM 及迁移期历史未知保守项。平台 task token 聚合同样过滤来源。已派发成功/失败/过期均计数，未派发并 RELEASED 不计数；不用进程计数代替，超限在创建本次 reservation 前拒绝。BYOK 不检查平台配额，仍保留真实 reservation/charged 审计，不把 charged 审计值直接当平台扣额。

Overview 将已有 OutputStage 的最终性作为 AiOutputRole 传到 Gateway，MAP/REDUCE 标签保持。统一层只核验角色，不读取 chunk 数、不依赖 Overview 内部类型；缺角色是内部契约错误。INTERMEDIATE=4608、FINAL=6144 作为当前业务输出/内容资源边界供 Planner/Gateway 共用，两类来源一致；中间请求 6144 返回 413，final MAP 6144 满足其他适用约束时放行。平台预算按来源另行核验，不把技术请求边界等同日额度。不静默改写 maxTokens，实际出站与预留输出一致；prompt、分包算法、调用顺序及恢复身份保持，只调整预算取数/是否适用平台预检。

### 5.2 用途账本与可靠操作关联

拟新增 `src/main/resources/db/migration/V33__ai_usage_operation_kind.sql`，给现有 reservations 增加可空 `operation_kind VARCHAR(32)` 与 `credential_source VARCHAR(32)`，无新账本表。历史用途 NULL 为 LEGACY_UNCLASSIFIED、来源 NULL 为 LEGACY_UNKNOWN，均不猜测回填；新 Gateway 写入必须含真实 Kind 和来源。同 task_id 的非空 Kind 不得变更，来源可逐调用不同。额度不按 Kind 分池，只按实际来源选择是否计入平台配额；服务并发仍统计全部来源。

迁移期历史未知来源在原小时/日窗口及旧根预算内按旧口径保守占用，单列 LEGACY_UNKNOWN，明确不等于已确认的平台实际用量；自然过窗后退出，不改写历史/返还配额。该占用只在平台准入时检查，不能阻止新 BYOK。旧二进制可能继续写 NULL：来源分流交付须完成所有派发实例切换，不能在旧实例仍会拒绝 BYOK 时宣称新规则生效。回退旧二进制会恢复旧的全来源配额限制，须在回退边界说明。

AiTaskScope 拟新增服务端只读 `UUID taskId()`，返回本次 Guard 实际分配的 task_id；不改其生成规则，不把它变成客户端可指定的预算根。学习 operation 保存可空 usageTaskId。beginTask 后、任何 embed/complete 前，由 ai 门面通过其定义的 task 绑定回调，让 learning 在短事务内按 owner、operation、sessionVersion CAS 持久化该 ID；必须确认提交成功后才能派发。绑定失败/提交结果未确认先读取持久结果，未确认则关闭 scope、不调用 Provider。进程在绑定前退出没有模型用量；绑定后退出可用该 ID查账，不通过重新 beginTask 推测结果。用途和实际 task_id 共同支持会话聚合；查询仅接受服务端核对归属的操作集合，不依赖锁表当前映射或客户端任意 taskKey。

本方案 U1–U3 候选已使用 V33（账本用途/来源）并同步 Database；V34（大纲身份）、V35（学习状态）仍是未来学习实施的候选编号，不代表已创建。若未来独立合并顺序改变，实施前按真实最新 Flyway 版本统一分配，禁止改写已应用的 migration。保留原 task_id 索引、无正文/凭据原则；账号删除后保留匿名来源与计量记录，平台/历史未知仍按相同分类参与系统预算，BYOK 不因匿名化变成平台消耗。学习操作关联随账号清理删除。

## 6. 预留、结算与失败语义

1. 保留当前账号/锁序、并发、reservation、派发授权和结算事务；Provider I/O 在事务外。共享服务容量包含两类来源；平台窗口同时计入平台已结算与在途占用，避免跨功能超售。
2. Guard 与额度查询共用来源+stage 分类：平台额度为 PLATFORM 的 charged + reserved，附迁移期单列的历史未知占用；平台 embedding 保留窗口豁免。全来源用量按平台/BYOK/未知分组，actual、保守 charged、reservation、shadow 分开；BYOK 未知 usage 不能写零，计量不等于平台扣额。
3. Provider usage 缺失保留 unknown，不能补 0；已派发失败/结果未知沿原规则保守结算。收到可用结果和业务验收成功是不同状态。
4. 同操作重放复用原结果/账本，不重复调用；明确新尝试继续计量并经统一准入。Overview 自动恢复保留原父预算、已完成子结果和恢复次数，不改变既有有限恢复行为。策略允许次数不代表业务应自动用满。
5. 保留现有错误 code/status 与安全 retry/reset 字段；额度等待、硬预算拒绝和 Provider 错误按现有类别处理。取消按真实派发状态结算，不承诺远端计算或费用撤回。
6. 影子估算继续只观测；没有校准证据不切换准入算法。API 窗口显示、单任务累计、长期研究样本分别保留口径，不用 actual 缺失或 shadow 覆盖缺口相互替代。

### 错误分类

| 拒绝类型 | code / HTTP | 客户端与账本行为 |
| --- | --- | --- |
| 未注册 Kind、Kind/Feature/Stage/方法/角色不匹配 | `AI_POLICY_CONTRACT_VIOLATION` / 500 | 内部调用契约错误，安全提示失败、不建议等待额度或自动重试；派发前拒绝，不创建本次 reservation。日志仅安全枚举和内部 ID。 |
| 单次 prompt、输出或请求预算超限 | 既有 AI_REQUEST_BUDGET_EXCEEDED / 413 | 保留现行请求边界语义；不派发。 |
| 总次数、stage 次数或任务累计 token 耗尽 | 既有 AI_TASK_BUDGET_EXCEEDED / 422 | stage 次数增加内部安全诊断 STAGE_CALLS；不提示窗口重置可恢复同一硬预算，不增加本次调用。 |
| 有效并发已满 | 既有 AI_CONCURRENCY_LIMIT / 429 | 保留现有安全 retry/reset 信息与业务退避。 |
| 用户小时/日窗口耗尽；系统日窗口耗尽 | 既有对应额度 code / 分别 429、503 | 保留当前映射与安全重试信息。 |

额度/token/调用配额拒绝只针对本次平台来源；BYOK 仍可因服务容量、上下文资源或业务协议执行上限拒绝，文案分别说明原因。平台用量窗口耗尽时，BYOK discovery/test 与 completion 仍能经运行准入；其本身不能出现平台额度不足错误。内部来源缺失/伪造属于 500 契约错误。

`AI_POLICY_CONTRACT_VIOLATION` 已接入 API/异常映射及 JSON/SSE 错误投影。上述拒绝均不新增 Provider 派发；先前已派发调用仍如实结算，不能称整个任务消耗为 0。stage 次数耗尽属于任务硬预算 422，与非法调用方法的 500 分开。

## 7. 独立实施步骤

勾选项反映本方案执行状态；已完成的源码、验证、审查与文档工作标记为完成，部署和真实业务验收保留待办。实施和唯一最终只读审查沿既定 6-luna 分工，主 Agent 负责范围/高风险裁定；不触碰无关 frozen 代码。

### U1：操作目录与策略解析

文件：新增第 5 节五个类型（StageRule 置于 Policy 内）；修改 `ai/usage/AiTaskContext.java`、`ai/AiSettingsService.java` 的来源解析结果；新增 `src/test/java/com/auralis/app/ai/usage/AiOperationPolicyTests.java`、`AiCredentialSourcePolicyTests.java`。

- [x] 列全现有用途的默认值、Feature/Stage/方法/输出角色及默认构造映射，新增学习两种 Kind；注册不依赖 learning 模块。
- [x] 实现不可变注册矩阵与 Resolver，校验覆盖完整性；区分平台总/stage 配额与全来源业务执行次数。平台数值保持，学习协议受 1/1 或 1 约束，非法组合明确拒绝。
- [x] 参数化默认和配置覆盖测试；prompt fixture 分别设为 6000/12000，断言读取有效值；校验输出/字符/次数/token 单位不混淆。
- [x] 设置解析分别覆盖 BYOK、无 key 的平台默认、固定服务端 embedding、BYOK-only metadata/test；来源随实际凭据快照传播，新来源未知拒绝。平台配额与共有运行边界分字段，BYOK 不取平台总次数/token 作为执行上限。

### U2：统一派发与旧功能接入

文件：修改 `ai/usage/AiUsageGuard.java`、`AiUsageGatewayService.java`、`AiTaskScope.java`；必要时调整 `AiStreamingService`、`OverviewGenerationService`、`OverviewBudgetPlanner`、`ai/ingestion/IngestionWorker`、`AiProviderDiscoveryService` 的策略/角色挂接；新增安全契约异常及现有 JSON/SSE 映射。新增 `AiFeaturePolicyParityTests.java`、`AiGatewayBoundaryTests.java`（同上 usage 测试目录）。

- [x] Guard/Gateway 同源读取有效策略，保留当前事务、锁序、租约、取消与 scope 执行路径；完整覆盖 complete/stream/embed/metadata，方法和 stage 不得伪装。
- [x] 模型配置、动态 Overview planner 与实际出站 maxTokens 对等；显式角色传递使 final MAP 6144 放行、中间 MAP 6144 拒绝为 413，中间 4608 合法。Chat 输出及 embedding 字节/批次边界不回归。
- [x] 合成入口覆盖所有当前用途；LEARNING_TURN 无 embedding 连续两次 completion 时第 2 次为 422，第二次 embedding 同样拒绝；DRAFT embed 为 500、第二次 complete 为 422。既有 CHAT 第 2 次合法调用仍通过。断言本次拒绝无新增 reservation/dispatch、先前费用保留，而非只比策略对象。
- [x] 在 TASK 锁内对总/stage 次数复用相同状态谓词；覆盖并发竞争、已派发 FAILED/EXPIRED 仍计数与未派发 RELEASED 不计数。
- [x] 继续使用原 budgetTaskId/generation/job identity；重放不改根预算、失败不免计量、metadata 不绕过 admission。
- [x] 每次 scope 调用携带可信来源；平台与 BYOK 共享运行准入/结算，只有平台走平台预算。混合 task 不把自带 completion 记成平台，平台 embedding 仍按原窗口豁免。设置变更不改变已预留调用的来源/实际凭据。
- [x] 对齐所有业务侧预检和剩余预算读数，尤其 Overview 的 assessRequest/局部 call counter 与 scope.usage：区分全来源审计、平台配额和全来源有限执行，BYOK 不被旧 24/524288 平台检查提前拒绝。测试 BYOK 超平台任务预算仍沿正常有界流程完成，平台相同负载正确受限。

### U3：共享计量与跨功能竞争

文件：修改 `ai/usage/AiUsageQueryService.java`、`AiUsageSnapshot` 及 Guard 的用途/来源入账与分类；新增 V33 字段 migration、`AiUsageOperationMigrationTests.java`、`AiUnifiedAdmissionPostgresTests.java`、`AiFundingAdmissionPostgresTests.java`（usage 测试目录），复用原账本。额度 API 沿原路由增加来源与全调用计量摘要契约，实施时同步 API/SDK 及已有消费端。

- [x] reserve 与查询共用来源+embedding 豁免定义，历史/在途一致；全部来源保留 actual、unknown、charged、reservation 审计语义。
- [x] 真实 PostgreSQL 并发测试：Chat 与 Overview 争用同一用户剩余额度，原子预留不得超售；不同用途共用用户/全局并发。参数化加入学习策略，证明新用途不会获得独立小时/日池。
- [x] 验证窗口已满时 embedding 豁免仍成立，同时其任务调用/token、并发和 owner 检查仍生效；unknown 不回填 0。
- [x] migration 保留旧 NULL 行、token 与状态；新 reservation 保存真实 Kind/来源，默认 Chat 与学习两种 Kind 可分组，同 task 改 Kind 被拒绝。旧来源未知单列、平台在途/结算共同计平台额度，BYOK 仅全量审计/容量统计；按用途分组不额外分配平台池。迁移版本断言随实际 HEAD 同步。
- [x] AiTaskScope.taskId 与 ledger.task_id 一致，owner+实际 task_id 查询准确，跨 owner 查询拒绝、重复聚合去重；学习的派发前持久绑定与失败测试由学习 Task 4 消费实现，不让统一层依赖学习状态。
- [x] 记录可用于后续公平性分析的调用种类、在途时长和拒绝原因；不增加流量池、优先级或自动调参。
- [x] 来源对照：平台窗口/任务预算耗尽时 BYOK 仍能调用和记账；相同平台调用被拒。BYOK 不占平台 token/call 配额，但共享容量满仍正确拒绝。两来源同 task 的实际 usage 分别归账；不能通过 source/model 客户端字段绕过平台检查。
- [x] migration 历史 origin=NULL 不回填；旧占用单列并自然过窗，新 BYOK 不中断。全来源 actual/unknown/reserved 与平台 remaining 分开展示；删除账号不返还平台系统占用、不把 BYOK 匿名行算成平台。

### U4：验证、文档和交付

- [x] U1–U3 编辑全部完成后统一运行相关检查。下列后端命令为参考；本次隔离 Linux/Docker 运行的精确命令、退出码、计数与输入哈希见 `D:\Temp\auralis-unified-usage-20261016\validation-report.md` 的 Candidate53 最终段。后端目录参考命令：

```powershell
./mvnw.cmd -B -ntp '-Dtest=AiOperationPolicyTests,AiCredentialSourcePolicyTests,AiFeaturePolicyParityTests,AiUsageOperationMigrationTests,AiGatewayBoundaryTests,AiInvocationGatewayTests,AiUsageLedgerBehaviorTests,AiUsageGuardDiagnosticTests,AiUsageGuardPostgresLockTests,OverviewBudgetIntegrationTests,ChatAiExecutionSafetyTests' test
./mvnw.cmd -B -ntp clean test
./mvnw.cmd -B -ntp '-DskipTests=true' package
```

- [x] 上述检查由隔离 Linux/Docker 执行器运行并记录实际命令、自然退出码、suite/test/skip 计数和 PostgreSQL 证据；完整结果及输入快照哈希见验证报告 Candidate53 最终段。
- [x] 一个独立只读 reviewer 检查 correctness、需求、事务/并发、身份/重放和用量安全；最终 BLOCKER=0 / IMPORTANT=0 / OPTIONAL=0，报告 SHA-256 `D4CD78B7B5023B2B98A39A06377C8CD50C3FA3461038E6F3B48247C62352BEF8`。
- [x] 按实际影响回写 Backend、现行 AI 用量设计、Status/Issues；用途/来源字段和来源统计 DTO、新错误已同步 Database/API/SDK，内部 taskId/输出角色已同步 Backend。现有 route 保持，额度与全调用用量分开解释；本期没有前端业务源码变更，也未扩充研究投影。
- [x] 为候选明确 V33 可空加列的数据库影响与兼容边界；旧二进制回退保留加列，不通过删列/清账本回退，不把 NULL 历史推断为新用途。Candidate53 的 migration 断言与真实 migration 测试均通过。
- [ ] 部署须提供具体候选、配置/数据库影响、全部派发实例切换与回退边界，并沿现有授权处理。真实 BYOK/平台来源和额度界面分别验收；代码/测试通过不能当作运行态/业务验收。本轮不实施前端，不调用 Antigravity。

## 8. 验收矩阵与完成定义

| 要求 | 证明方式 |
| --- | --- |
| 全部已识别 Provider 用途经统一入口 | 入口矩阵 + Gateway 边界测试，列明静态/运行覆盖边界。 |
| 平台共享额度、按用途预算 | 平台跨功能 PostgreSQL 竞争与 Kind/stage 测试；BYOK 不占平台额度。 |
| stage 上限与方法授权 | LEARNING_TURN 无 embed 两次 complete 的负例；伪装 embedding 拒绝；原子计数含失败/过期、释放口径一致。 |
| 有效配置供给与实际请求一致 | 默认/覆盖 fixture、实际出站 maxTokens、6000/12000 prompt 策略测试。 |
| Overview 输出角色精确且保持旧结果 | final MAP 6144 通过、中间 MAP 6144 为 413、中间 4608 通过；不增调用或改变恢复身份。 |
| 平台基线与业务流程正确 | Chat、两类 Overview、ingestion 的平台预算对等；BYOK 额度豁免为预期变化，metadata/test 不因平台额度耗尽拒绝；内容/恢复路径回归。 |
| 用途与操作可可靠复算 | migration 历史 NULL、新 Kind/来源、scope task_id 与 owner 关联；平台额度不按 Kind 分池，BYOK 单列审计，不依赖锁映射。 |
| 父预算/幂等/有限恢复 | 已有 Overview 预算和 replay 场景保留，原 task 累计不重置。 |
| embedding 豁免、unknown/actual 分离 | reserve/查询一致、历史/在途、失败/未知用量测试。 |
| 新功能能独立接入 | 无 learning 业务依赖的 LEARNING_TURN/DRAFT 合成 Gateway 测试。 |
| 错误语义可辨认 | 契约错误 500、请求 413、任务/阶段硬预算 422、并发/用户额度 429、系统额度 503，JSON/SSE 一致。 |
| 自带计量、平台管理 | 平台额度/任务配额耗尽而 BYOK 可用；同 task 混合来源、共有运行容量、source 不可伪造、历史未知/账号清理分类与分来源展示测试。 |

U1→U2→U3→U4 顺序已完成。Candidate53 的 focused 63/0/0/0、SubjectDeletion 7/7、真实 PostgreSQL 5/5（含 Chat↔Overview 共享额度竞争）、V33 migration 1/1、OpenAPI artifact tests 12/0/0/0、完整 suite 121 suites / 690 tests / 0 failures / 0 errors / 0 skipped，以及 package 均自然退出 0。唯一 reviewer 最终 B0/I0/O0；517 项冻结输入与运行卷一致，516 项 live workspace 与独立 TLS 核验一致；JAR 为 93,171,500 bytes，SHA-256 `CB0D89F5AFE392E316A7EB9AC919D2DCDF81AF0714DCE69CED8340725DBB1EC5`。早期受资源保护中断和 fixture 失败已作为历史保留在验证报告，不与最终计数混合；低空间观察不再是当前待办。Section 8 验收矩阵保持不变。源码及自动验证通过不代表部署或运行态来源分流；真实 Provider、生产业务数据库、GUI/真机与业务验收仍未完成。

## 9. 与学习 Agent 的接口

[学习实施计划](2026-10-16-learning-agent-implementation.md)保留学习业务的 7 个任务，模型接入前依赖本方案 U1–U3 实现通过 U4 的代码/自动验证门禁。节点身份和纯持久状态可独立推进；教学 prompt 组装、模型调用、草稿生成接入有效策略，不复制本方案实现任务。部署、真实 Provider 和 GUI 验收单独记录，不阻塞学习代码开发。

用途映射固定为 TEACH→LEARNING_TURN、DRAFT→LEARNING_DRAFT，feature 仍为 CHAT，reservation 同时持久化 Kind 与逐调用来源。平台调用共享平台额度，BYOK 只计量并保留共有运行/一期协议保护。学习 taskKey 和操作回执由学习提供，budgetTaskId 保持 null；按第 5.2 节绑定实际 taskId，owner+唯一 usageTaskId 聚合会话用量，再分平台/BYOK/未知展示，不建立学习专用额度池。

## 10. 后续演进：负载预算、有限容错与并发

本节为 U1–U4 后的规划，沿用用户当前 Provider/模型配置和已有能力检查。优先 R1（长文档/多资料事前评估），再按真实失败与占槽数据推进有限容错及并发调整。当前字符限制是内容/资源边界，与 token/context 预算作用不同；保守 UTF-8 估算尚未校准，本期继续保留有效字符和字节约束。

### R1：按真实负载形成任务契约

平台调用预算硬顶由可信配置给定；本次预算由服务端实际负载与计划推导。BYOK 的用量估算作为提示，不以平台预算阻断；两来源均保留技术容量、deadline 和有限执行保护。客户端 chunkCount/workloadUnits 不能授予额度，也不调用模型生成预算。Overview 沿业务 planner，Ingestion 沿条数/UTF-8 字节分批，统一层接收通用版本化描述。

先计算正常路径所需调用，再单独计算有限恢复余量。Overview 的 MAP 数以实际 pack 结果为准；REDUCE 依据现有 packDocuments 规则、响应大小边界逐层估算，区分乐观值与保守上界，单分片直接 final 不再多加 REDUCE。真实输出内容、截断和修复只能估范围，不能声称调用前已知完整实际费用。Ingestion 以同时满足条数和字节约束的真实 batch 数为单位，并排除 checkpoint 已完成项，不能只算 ceil(chunkCount/32)。

```text
plannedCalls = normalPathCalls + boundedRecoveryAllowance
forecastUpperTokens = 按当前保守估算口径累计尚未完成请求的输入与最大输出预留

若有限平台 calls 上限不足以容纳计划：派发前拒绝
forecastUpperTokens 只报告保守上界，不作为整篇任务的预占或硬拒绝条件
每次平台调用：按持久化 charged + reserved 核算余额，原子预留本次输入估算 + 本次输出上限
平台 effectiveTaskBudget 仍来自可信配置，不能由 forecast 放大
BYOK 仅展示估算；运行资源与业务协议边界另行核验
```

不得通过截断原文或按余额缩小正文输出目标强行装入平台预算。2026-10-23 起自适应 Overview 采用逐次预留：整篇保守上界超预算不等于实际必然超预算，允许顺序执行，但明确不承诺整篇可完成。单次所需预留或实际累计达到预算时停止，保留已验证 checkpoint，调整预算后仍沿原预算根恢复；不清账本、不自动循环重试、不把缓存当部分交付。BYOK 不因平台预算顶拒绝，仍核对技术资源。若提高平台硬顶应另验额度、deadline 和质量。预检不占整任务的窗口/并发，各次平台调用仍逐次原子准入，不能承诺预检后不会窗口竞争失败。

任务契约与 owner、预算根、输入 revision/manifest、当前配置/能力快照和策略版本绑定，在首个 Provider 前持久化；平台预算只累计平台调用，业务执行进度涵盖全部来源。R1 实施时为预算根增加版本化契约字段并同步 Database；本期 V33 仅存用途/来源，不提前携带该 DDL。恢复读同一契约，已用平台预算与剩余步骤共同核算，不能按“剩余输入”另建总预算。平台恢复消耗原余量；BYOK 也不能绕过业务有限恢复/去重。输入版本变化需显式新任务，旧账本保留。

实施顺序：先以影子方式记录可信 normal/recovery 计划及实际调用差异，再用代表性短/长文档、多资料、字节驱动批次和恢复回放验证，最后才启用更紧的任务预算。余量不是通用 1.2 系数：按具体恢复分支的次数上界和真实样本选择，不改变已有有限恢复算法。小任务的防循环仍须靠步骤去重、进度检查与 stage 上限，动态 task cap 只是最终止损。

R1 验收包括：平台计划 26 次/顶 24 时 0 Provider，BYOK 不因同一平台顶被拒；短文正常完成且异常循环提前停止；多资料逐层归并；摄入按字节拆批及恢复不重复；原预算根保持；平台预检后窗口竞争安全拒绝；估算偏差、usage、恢复与业务完成分报。预算 token 仍是保守预留，不冒充 actual 或金额。

### 2026-10-24 实际样本与输入估算校准边界

本小阶段实施顺序：先让 ADAPTIVE_WRITE 的同一输出预算贯穿预检、Provider 请求、Guard 预留、截断判断及 checkpoint 身份；再核对预算停止后的同任务恢复，最后统一做定向验证和一次只读审查。正文预算根据本节材料与结构分配，不能根据账户剩余金额或 tokens 缩减；较大材料继续使用既有上限与容量拆分。索引、元数据和目录阶段不套用正文预算策略。

验收要求：短/长正文请求分别取得对应输出上限；预检和实际派发预留口径相同；输出上限边界正确触发截断处理；预算不足后不重复完成的阶段、不生成新的预算根、不清空已结算 usage。正式输入估算替换及整篇真实资料质量验收需要另有样本证据，不能由本小阶段的合成测试代替。

离线读取真实 run `4259b5e4-a9fd-4499-858d-cd2bb1630abf` 的成对请求/响应，未发起新 Provider 调用。结果仅描述这一份资料、一个模型的 11 次调用，不外推到所有资料或 Provider。聚合证据为 `D:/Temp/auralis-budget-path-20261024/real-usage-summary.json`，逐调用数值为同目录 `real-usage-samples.json`；导出不包含提示词正文。

| 阶段 | 调用数 | 字节估算输入 | 实际输入 | 实际输出 | 单次最大输出 | 输入估算/实际 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| INDEX | 6 | 141661 | 32642 | 7401 | 1906 | 4.340 |
| METADATA | 4 | 54707 | 12948 | 7644 | 3721 | 4.225 |
| METADATA_ROUTE | 1 | 14438 | 3563 | 3432 | 3432 | 4.052 |

输入估算按现行 Gateway 的 UTF-8 bytes + 两条 message 的 8 framing tokens 重算；实际值来自 Provider response，最终计费仍以持久化 usage 账本为准。该样本支持将字节估算标明为保守预留上界，不支持把所有输入直接除以 4，也不支持全阶段统一压低输出上限。尚无此资料的 WRITER 成功样本；正文输出策略须保留内容覆盖、拆分和截断检测，不能用元数据输出代替正文容量证据。

字符分类 shadow 估算继续诊断使用。正式替换授权估算前，需要按实际模型、阶段、语言与资料家族建立独立验证集，检查低估尾部及 usage 缺失路径；模型身份未知或能力不确定时保留保守预留。当前状态不等于校准完成，也不新增自动在线调权或模型切换。

本小阶段结果：ADAPTIVE_WRITE 的 4608–6144 输出预算已贯穿 fit、preflight、Provider/Gateway/Guard、截断判断与 checkpoint/journal 身份；4608 是暂定工程下限，缺少真实正文输出样本。最终集中定向批次 111/111、exit 0，唯一 Luna 只读审查 BLOCKER=0 / IMPORTANT=0 / OPTIONAL=0。服务级 PostgreSQL 预算停止/恢复用例已添加，但 Docker 引擎不可达导致未执行；35 项 Coordinator 测试不能替代此项服务级验证。命令、首轮失败及修正过程见 `D:/Temp/auralis-budget-path-20261024/handoff.md`，审查见同目录 `review.md`。本轮未部署、未调用真实 Provider、未做 GUI 或正文质量验收；整个预算优化路线仍需后续实样校准。

### 第三步补齐：当前模型的分类估算与离线准入（2026-10-24）

实施范围限定当前 Overview completion 输入，不切换模型，不改变 Chat/stream/embedding 或已冻结的正文输出预算。已核查官方 tokenizer 与本地 JVM runtime：DeepSeek 旧请求别名的服务版本存在漂移，不能把旧 V4 tokenizer 文件标成当前服务的精确分词器。因此本轮采用原方案中的无匹配 tokenizer 分支；不额外引入 JNI/Python 服务。官方 Token Usage 说明和模型别名变更分别见 [DeepSeek Token Usage](https://api-docs.deepseek.com/quick_start/token_usage/) 与 [更新记录](https://api-docs.deepseek.com/updates/)。

使用共享输入估算策略，让 Overview 的完整提示词 fit/preflight 与 Gateway/Guard 预留采用同一算法。候选仅匹配当前官方 DeepSeek endpoint 与 `deepseek-v4-flash` 请求模型；它是当前请求配置的经验分类策略，不宣称底层服务 tokenizer 精确一致。安全收敛后的公式只对支持消息中的 Han 字符沿用原 shadow 的 1.0 权重并乘固定 2 倍工程余量；其余英文、数字、空白、JSON/Markdown/代码标点仍逐字节计数，不推广未验证的其他字符压缩比例。请求再加 max(64, 4×消息数) framing，并以旧字节估算为最高值；不能用这批样本拟合系数再报告验证成功。每条消息独立检查支持形态：普通 CJK 或包含足够 CJK 的结构化内容可用候选，不支持的消息沿用字节预留。未知 endpoint/model、异常输入、无法分类或计数失败回到 UTF-8 字节保守路径；原输入字节资源上限继续生效。具体谓词及策略 identity 写入源码、测试及日志。

默认继续 `legacy-bytes`。离线工具读取现有 trace 的精确消息和 Provider usage，按消息指纹去重，只输出计数、形态覆盖和误差，不导出提示词正文。完整样本作为本次候选规则的验证集，缺失或不完整 usage 单列且不补零；长度不符、采集截断或关联不明确的记录不得伪装成完整样本。准入门槛为至少 10 个去重后、完整 usage 且命中支持形态的提示词，至少覆盖 INDEX 与 ROUTE 各一个，支持样本低估次数为 0；不满足则 HOLD。通过后仅在本机追踪 overlay 显式启用 `calibrated-category` 供用户实测，记录所选估算策略和 fallback。无真实正文输入样本的边界必须保留；用户实测会继续对照实际 usage，不把这次经验校准称为跨模型/跨语种的完整保证。

输入计数方法本身不改变正文契约，已验证内容缓存不因此全量失效；packing 或精确提示词发生变化仍由现有 prompt/descriptor 校验控制。完整 Provider usage 仍按实际结算，usage 缺失则沿新策略的保守预留结算；旧账本不改写。完成全部代码后集中执行相关检查、已准备隔离环境下的 full/package 和一次只读审查，再仅部署本机 backend 以便实测。证据目录：`D:/Temp/auralis-budget-step3-20261024/`。

第三步本轮结果：统一估算已接入 Overview 的 fit/preflight 和 Gateway 预留，原文、输出预算和缓存身份保留。正式离线报告为 6 runs / 40 calls / 34 unique prompt pairs，其中 25 个支持且完整 usage 的独立输入零低估，INDEX 支持 15/24、ROUTE 2/2；旧输入预留 717340、新估算 597033、实际输入 166676，预留减少 16.77%，仍明显高估。没有 writer 实样，所有原 run 均失败，因此不证明正文输入校准或成功生成质量。报告 gate PASS、相关测试 43/43、package 成功、唯一 review B0/I0/O0；完整 full suite 曾含 replay harness error，修复后仅专项通过，且当次 full stdout 留存缺失，详见 `final-handoff.md`，不得写成全量全绿。

本机仅 backend 已部署镜像 `sha256:72f6a41df02f8497fe32d2d0c3cbb18580ed2671b1c233ec9b41a95f658cc49d`，有效模式为 `calibrated-category`，healthy/readiness UP；基础配置仍为 legacy。db、MinIO、frontend 容器身份不变，没有新 Provider 调用或用量重置。用户现在可从原界面用原长资料重试，不清缓存；本次实测将补正文阶段 usage 与内容质量。部署证据在本目录上文对应 D 盘任务目录的 `deployment/`。

### 第四步：预算停止、恢复与进度记录（2026-10-24 接续）

本步沿现有 Overview 生成入口及错误契约实施：平台预算不足以支持下一次派发时停止，返回 `AI_TASK_BUDGET_EXCEEDED`；相同输入、版本和配置身份的重试继续沿原 generation / budgetTaskId，复用仍有效的已验证 checkpoint。不得清空 charged、重置额度、自动循环重试或通过降低内容目标凑余额。需要提高平台限额时由可信运行配置调整，调整不授予新的预算根。来源或版本变化仍依现有身份规则处理。

实施范围为后端安全日志/现有 trace 和恢复验证，不新增前端流程、公开 DTO 或数据库状态。记录同一任务的 generation / budgetTaskId、已完成与待执行正文数量，以及 charged、reserved、remaining、下一次预留和整体保守上界。charged 沿现行账本定义：完整 Provider usage 使用实际值，usage 缺失时包含保守结算；不能统称“实耗”。reserved 为在途预留，整体 forecast 是预计上界，不能计入已消费或作为整篇预占。BYOK 继续计量并保留执行保护，平台余额不阻断 BYOK。

完成条件：一次预算停止后，无额外 Provider 派发；提高配置预算并重试时 generation/budgetTaskId 不变、已有 checkpoint 不重复生成、历史 charged 保留；记录足以区分已消费、在途与预计值。纯诊断读取异常应局部忽略，不得将已保存正文改判失败、遮蔽原始预算错误或让已取得租约脱离原收尾流程；原本准入/预检/结算所需读取仍严格失败，不借此绕过 Guard。使用隔离 PostgreSQL 和模拟 Provider 集中验证，并做一次只读审查。真实 Provider 的估算校准与正文内容质量仍以真实资料另验，不能由本步测试代替。执行证据目录：`D:/Temp/auralis-budget-step4-20261024/`。

第四步收尾：后端 stop/resume/complete 与 writer 进度记录已补齐，诊断读取异常局部 fail-open，实际预算授权、预检和持久结算仍严格。隔离 PostgreSQL 17.11 / V38 证明第二 writer 的 Guard 拒绝不新增 Provider 派发；提高测试配置后原 generation/budgetTaskId、历史 charged 和已验证正文保留，只生成剩余 writer。集中批次 137/138（exit 1）后修正新增 fixture，仅复跑目标 1/1（exit 0）；之后补充 RESUME 和 writer-progress 诊断读取失败场景，两项分别取得通过证据，未将历史整批或组合运行写成全绿。唯一 reviewer 的两项 IMPORTANT 已修复并由同一 reviewer 确认关闭，最终 B0/I0，原 O1 保留。证据见 `final-handoff.md`、`review-fix-handoff.md`、`review-final.md`（均在上述目录）。本阶段代码与相关自动验证已完成；未运行完整后端全量、未部署或调用真实 Provider，输入估算仍未完成全面校准，正文质量和 GUI 仍待真实资料验收。

### R2：Learning 的版本化容错策略

一期仍为 TEACH embed≤1 + complete≤1、DRAFT complete≤1，不额外 repair；这是一项调用/质量取舍，不是统一层无法表达扩展。若真实失败率证明值得增加修复，新增显式策略版本或用途，声明 nominal 与最多一次 repair，并同步学习设计、上下文和验收，不在旧操作上悄悄增加次数。

repair 由应用在前一调用已退出并得到可分类格式失败后激活，不能由模型自报；未知派发、并发/额度拒绝不自动重试。两来源都受同一操作的有限修复协议；平台修复另消耗原父预算与窗口，BYOK 只审计并受运行保护，均逐次准入/结算。主调用成功不能激活，修复仍失败即结束。多 query 或模型工具循环是独立协议扩展，不能借 repair 名义增加调用。

### R3：并发观测与调优

网络 I/O 仍占 Provider 并发、连接、线程/异步资源和在途额度；是否提高 4/2 或预留前台槽，应由调用耗时、拒绝率、Provider 限流和部署容量共同决定。先按用途观测，再单独验证公平准入或并发调参；不承诺提高并发自然降低单次延迟，也不自动把重任务分类成后台。

### 2026-10-23 Overview 预算路径第一批修正

- 修复证据：两个实际 run 的索引原文相同，但 Map.of 材料字段顺序在进程重启后不同，使精确提示词 checkpoint 指纹变化。索引及正文材料改为 TreeMap 固定字段顺序；旧不同文本指纹不作兼容匹配，新请求稳定后可按原规则复用。
- Writer preflight 不再将全部最大预留的总和作为硬拒绝条件；总和以 aggregateUpperBound 记录，先检查最大单请求预留能否装入当前余额，逐次派发仍由 Guard 原子预留并按实际 usage 结算。余额不足仍会中途停止，已有 verified checkpoint 保留，不保证整篇一定完成。
- Adaptive 单次预算评估改读持久化 task charged + reserved，包含历史尝试，避免日志把本轮余额当累计余额。新增日志包含 uncachedWriters、aggregateUpperBound、largestRequestReserve、charged、reserved、remaining。
- 定向 OverviewAdaptiveGenerationTests、OverviewBudgetIntegrationTests 共50/50通过（exit0），证据 D:/Temp/auralis-budget-path-20261023/tests.log；未运行全量、真实Provider或GUI。输入估算校准、动态输出预算、明确的预算暂停/恢复状态与用户可读预计成本仍待实现，本条不表示完整优化路线交付。
