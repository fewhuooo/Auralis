# AI 执行预算治理近期阶段 0–3 计划

日期：2026-10-13  
状态：阶段 0–3 的 2026-10-14 round4 clean backend gate/package 已通过；真实运行流程 Step 2 观测前置已实现、定向验证，后续 fresh full/package 也通过（116 suites / 674 tests，零 failure/error/skip；artifact SHA-256 `723919B7517A21B7A1C458F8708B3E6BFDE1E70DCF2D3478A45BA2894204A236`，508 项 manifest 零差异）；Step 2 最终 reviewer 为 B0/I0/O3，三个 OPTIONAL 均保留未改。真实 Provider 模型核对、运行链路、生产 usage、校准和 GUI/业务验收均未完成，计划整体退出条件未满足
依据：用户提供的《Auralis AI 全流程执行与预算治理优化方案（2026-10-13 最终整合稿）》及当前工作树代码  
仓库基线：`dd8d46a chore: snapshot current Auralis workspace`

当前最终门禁状态与逐轮历史见文末“2026-10-14 四项历史门禁问题关闭与 round4 最终验证”。后文出现的“full gate 未通过”均是该轮当时状态，不覆盖 round4 的最终 clean run。

## 目标与范围

近期只执行最终整合稿规定的阶段 0–3：模型配置与预算拒绝诊断、token 估算影子模式、Overview 截断/JSON 有界恢复、Chat 阶段计次与流式安全故障回放。每阶段先用当前服务端实现和合成/公开输入验证，Provider 真实模型列表核对另列人工验收。

本计划不授权变更公开 API/DTO、数据库结构或 Flyway migration，也不授权部署、真实收费 Provider 调用、额度重置或实际业务数据写入。实施不得读取或输出密钥；运行配置仅核对脱敏后的 Provider、模型名、thinking 与预算值。Overview 任务 24 calls / 524288 tokens 和 Chat 2 calls 都是保留的硬上限；影子估算不得参与准入、reservation 或任务预算累计。不能因当前统计或合成测试而自行提高上述值。

后续完整 Planner、动态批准预算、额度等待后台任务、跨任务缓存、并行 MAP 与成本账本不属于近期阶段，不在本计划内实施。范围若需扩大，由主 Agent 依据新的数据证据单独安排。

## 基线和当前实现

- 调查开始时 `git status --short` 与 `git diff --stat` 均为空；HEAD 为 `dd8d46a`。当前没有找到与此项匹配的 progress/task report。此结论是当前检查结果，不作为未来执行时跳过状态核对的理由。
- 默认模型配置位于 `Auralis-Server/src/main/resources/application.yml`：默认 Provider `DEEPSEEK`、聊天模型 `deepseek-chat`；环境变量可覆盖 Provider、Base URL 和模型。配置也保留 OpenAI-compatible、SiliconFlow 的默认模型。实际容器配置不由仓库默认值证明。
- `OverviewModelBudget.resolve` (`ai/OverviewModelBudget.java`) 仅对官方 OpenAI `gpt-4o-mini` 和官方 DeepSeek `deepseek-v4-flash` 赋予已知上下文/最大输出能力；自定义或其它模型能力保持未知。`application.yml` 默认 `deepseek-chat` 与这一白名单差异需要人工核对当前 Provider 的模型列表。未经验证不得把 `deepseek-chat` 的能力等同于 `deepseek-v4-flash`，也不得因未知能力放大预算。
- DeepSeek 结构化 Overview JSON 请求在 `ai/internal/provider/OpenAiCompatibleProvider.java` 中设置 `response_format=json_object` 和 `thinking=disabled`。实施前应通过受控 HTTP stub 测实际 wire body，并核对当前运行源码；若已具备，不重复添加实现。
- `OverviewBudgetPlanner.assessRequest` 当前把 prompt UTF-8 byte 数直接作为输入 token 上界，再加 message framing；这构成明显保守的上下文估算。`AiUsageGatewayService` 的实际 Guard 输入预留也是 UTF-8 bytes 加消息开销（embedding 按 UTF-8 bytes），这是现有真实准入行为，阶段 1 只能并行记录候选估算和实际完整 Provider usage。
- `AiUsageGuard.reserve` 先检查用户/全局并发，再把任务调用数不足与任务 token 不足合并为 `AI_TASK_BUDGET_EXCEEDED`；窗口额度错误分别使用 `AI_HOURLY_QUOTA_EXCEEDED`、`AI_DAILY_QUOTA_EXCEEDED`、`AI_GLOBAL_QUOTA_EXCEEDED`。准入拒绝在 reservation 创建前发生，因此当前账本没有相应拒绝行。`OverviewGenerationService` 已输出 `OVERVIEW_BUDGET_ASSESSMENT`；其基于 Service 调用序号的估算不得替代 Guard 的最终原子授权。
- Overview 当前有 `OVERVIEW_PROVIDER_OUTPUT_TRUNCATED`、`MODEL_PROVIDER_ERROR`、`OVERVIEW_RECOVERY_EXHAUSTED`、`OVERVIEW_REDUCE_NO_PROGRESS` 区分；响应 `finish_reason=length` 会在 validator 前识别。REDUCE 单点恢复最多两轮；分包/恢复结果有严格缩减校验，只有校验后才存 checkpoint。V32 已有 request/generation mapping、checkpoint、fence、预算 lineage 和 recovery count。
- Chat 请求在 `AiStreamingService.stream` 中先做一次 `RETRIEVAL_EMBEDDING`，再做一次 `CHAT_COMPLETION`；正常 RAG 两次调用已经恰好使用 Chat 上限 2。SSE 通过 `AiController` 流式写出，完成文本先追加至本地 buffer 再发 `message.delta`。Provider/预算异常会落持久化失败 assistant 状态和 usage 摘要；已发送部分不能安全自动重试。当前 `AiUsageGatewayService.TaskScope` 只持有一个 `activeCall`，本计划不引入并行调用。
- 现有测试起点包括 `AiUsageGuardTests`、`ai/usage/AiUsageLedgerBehaviorTests`、`ai/usage/AiInvocationGatewayTests`、`ai/OverviewDynamicBudgetComponentTests`、`AiOverviewServiceTests`、`ai/OverviewGenerationServiceRecoveryTests`、`AiStreamingTests` 与 `AiStreamingControllerTests`，以及 provider resilience/contract 的受控 HTTP 测试。已存在测试不因本计划复述而视为本轮新验证。
- 工作树的动态 Overview 预算恢复、JSON 安全诊断和 REDUCE no-progress checkpoint 修复是近期已验收/审查或有明确用户验收记录的实现。它们视为 frozen：不得重构、改变接收规则、调整错误语义或覆盖 checkpoint/fencing 修复。只有阶段 2 的最小恢复行为由合成证据证明存在 correctness 缺陷时，才可提出具体局部修复并先由主 Agent裁定；阶段 2 原则上只补缺少的有界恢复路径与测试。

## 执行约束与协作

- 每项代码实现和唯一最终只读审查使用 `gpt-6-luna` 子代理；主 Agent 负责拆分/风险裁定/最终验收，本计划现状调查由 `baseline_plan` 子代理完成。计划阶段不启动额外 reviewer。完成阶段 0–3 后只启动一个统一 reviewer，检查 correctness、要求满足、回归、测试缺口及安全/数据风险。
- 子代理只修改分配文件，先提供计划再实施；不得覆盖其他执行者文件。Chat safety 执行者独占新建 `Auralis-Server/src/test/java/com/auralis/app/ai/ChatAiExecutionSafetyTests.java`；阶段 3 执行者 D 只运行并检查该文件，不写入该文件。
- 阶段 0/1 可独立执行；阶段 2/3 在阶段 0/1 后并行或顺序执行，前提是文件所有权分离且完成代码以后的单一 reviewer 统一审查。每阶段先做针对性测试，结束后从干净、源码一致的隔离目录运行完整后端门禁。
- 使用公开或合成 fixture。不得将真实用户文件、prompt、模型回复、BYOK key、Authorization、URL query 或密钥写入日志/测试输出。日志只保留 allowlist 的阶段、Provider/model 标识、稳定拒绝类别、非负用量数字、错误类型与必要位置；避免原始异常 message、prompt 内容和模型输出。
- 不调用真实 Provider，不使用账本重置脚本，不部署，不执行 migration。模型列表人工核对不属于自动门禁。

## 阶段 0：模型配置与预算拒绝诊断

**目标：** 可以区分一次准入拒绝来自并发、调用数、任务 token、用户小时/日或系统日上限；不改变任何拒绝行为或公开错误码。

**允许文件归属：**

- 执行者 A：`Auralis-Server/src/main/java/com/auralis/app/ai/usage/AiUsageGuard.java`
- 执行者 A：新增隔离的 Guard diagnostic 单测文件；若仓库既有测试注入点更合适，可仅修改 `AiUsageLedgerBehaviorTests.java`，不得同时重复覆盖同一场景。
- 不得修改 `Auralis-Server/src/main/resources/application.yml` 中的 calls/tokens 默认、`AiUsageLimitException` 公开映射、API DTO、数据库 schema 或 reservation 事务顺序。

**实施步骤：**

1. 将内部诊断在拒绝分支就地分类，至少明确 `CONCURRENCY`、`TASK_CALLS`、`TASK_TOKENS`、`USER_HOURLY`、`USER_DAILY`、`GLOBAL_DAILY`。保留外部现有 code/status/Retry-After/resetAt。
2. 使用结构化、可脱敏的拒绝事件记录 feature、stage、Provider/model、hash-only task identity 或现有稳定 request/generation identity、已用/申请/上限/剩余数值及窗口重置时间。拒绝在 reservation 插入前发生，不能伪造账本行或把拒绝算成 Provider 消费。
3. 配置盘点只读查看 Provider、Base URL host、模型 ID、thinking 模式和 limiter 值。人工核对 Provider 官方 `/models` 当前可用项及其模型 ID；未知模型保持未知能力。用 stub 检查结构化 Overview 请求确实在 wire body 设置 `thinking=disabled`，不调用真实服务。

**验收：**

- 对调用数与任务 token 分别构造合成拒绝，日志类别不同，公开错误仍是 `AI_TASK_BUDGET_EXCEEDED`；对并发/小时/日/系统日拒绝各有一项分类断言。
- 拒绝前后 reservation 计数、charged/reserved 和 task 次数没有额外变化；并发 fencing/锁序既有测试不回归。
- 日志脱敏测试证明不含 prompt marker、API key、Authorization 或 URL query。
- 手工 Provider 模型列表核对逐一列出 Provider、请求 model ID、模型列表结果/日期、能力依据及未知项。此项未验收前未知模型仍走保守逻辑。

## 阶段 1：输入 token 估算器影子模式

**目标：** 评估字符类别感知的候选估算器相对实际完整 usage 的偏差；原估算器保持实际 reservation、准入和 hourly/daily 统计的输入。

**允许文件归属：**

- 执行者 B：`Auralis-Server/src/main/java/com/auralis/app/ai/usage/AiUsageGatewayService.java`
- 执行者 B：新增纯 Java 候选 estimator 及其合成单测。不要修改阶段 0 的 Guard 文件或 Chat 独占测试文件。

**实施步骤：**

1. 在不把文本写日志的前提下，对同一序列化请求计算现行估算和候选估算。候选估算可按脚本/中英文/数字/标点/空白及 UTF-8 类型分组，但不得声称精确 tokenizer。
2. 将估算、feature/stage/provider/model、输入长度/字符类别数量与 estimate mode 作为非敏感元数据传到调用结算点。仅实际 usage 完整时计算新旧估算相对误差；缺失或失败时标记不可比较，不用保守 charged 充当 Provider actual。
3. 影子输出只记录聚合可观测值：旧/新估算、actual input、误差或低估标记、usage 完整性；去标识的单次 request correlation 不含原文。记录可用于按模型、阶段、文本类型评估尾部低估，不持久化原文或新增数据库结构。

**验收：**

- 合成公开文本集覆盖中英文、代码/JSON、数字、标点、空白、混合、短/长输入；每类断言候选估算可复现、非负、无溢出。
- 完整实际 usage 产生比较数据；usage 缺失、provider 断流和异常不会误记为 0 actual，也不会将候选估算传给 Guard。
- RED/测试探针证明旧估算值仍作为 reservation estimatedInputTokens，候选值只用于日志/诊断。
- 影子指标报告误差中位数、高分位、低估率和样本量；未达通过阈值前保持只观察，不启用新估算。

## 阶段 2：Overview 截断和 JSON 有界恢复

**目标：** 用固定合成 Provider 回放覆盖真实观察过的输出截断与 JSON/Schema 失败，验证有限恢复、成本计入原任务预算及明确止损。

**允许文件归属：**

- 执行者 C：`Auralis-Server/src/main/java/com/auralis/app/ai/OverviewGenerationService.java`
- 执行者 C：新增隔离恢复测试文件；如需修改已有用例，仅限 `AiOverviewServiceTests.java` 或 `ai/OverviewGenerationServiceRecoveryTests.java`，明确避免相同文件由多人并行编辑。
- 生产修改只允许在 Service 的错误分类/恢复调度处局部完成。`OverviewDocumentValidator`、`OverviewGenerationCoordinator`、`AiUsageGuard`、DTO、schema 和数据库不属于本阶段所有权。

**实施步骤：**

1. `overview-output-recovery-enabled`（环境变量 `AURALIS_AI_OVERVIEW_OUTPUT_RECOVERY_ENABLED`，默认开启）只控制本阶段新增的截断拆分和 JSON 修复，不关闭既有语义恢复、动态拆分、no-progress 或 fence 行为。输出达到 Provider stage max 或收到 `finishReason=length` 才分类为截断；任何 child 或后续 merge 再截断即止损，不递归继续恢复。
2. Source MAP 保留原始 chunk 集合，以连续且互斥的两部分重试；多批 MAP 只重做发生截断的 batch，先前成功的 batch 结果留在当前 generation。单个文本按 Unicode code point 切成两段。Subject MAP 保留 `ModelSubjectInput`，优先使用已有 `subjectInputFragments` 并分成两组；已分组时也只拆分失败 batch。Reduce 优先把输入文档列表分组；单文档才复用已有 `splitOverviewForReduce` 的语义片段。无法产生两个有效且可消费的部分时保持原截断错误，不伪造成功。
3. Provider JSON 语法（Jackson read failure/未闭合 JSON object）和精确 allowlist 的顶层 schema 形状错误允许最多一次同 task scope 修复；repair prompt 附选定 mode、允许的 alias 集合与 schema。修复使用同 stage 输出 cap、做 maxPrompt 预检并使用独立 checkpoint purpose/key。未知/重复 alias、locator、mode、source coverage、权限、source 内容校验、Provider 429/5xx、SSRF、预算、cancel 与 deadline 错误都不进入 JSON 修复。Validator 本身不改，错误原文和 Provider 正文不写日志。
4. 一次 attempt 共用已有 `RecoveryTracker` 记录截断拆分和 JSON 修复；截断拆分与 JSON 修复各最多一次，分别登记为安全 action，次数由 Coordinator 累计写入 generation。Coordinator 的累计 `recovery_count` 是跨 attempt 的审计累计值，不是可供 Service 查询的跨 HTTP 动作配额；同 generation 重试仍沿用同一 `budgetTaskId`，Guard 24 calls / 524288 tokens 硬限不重置，所有新增 Provider 调用单独 reserve/settle。一次 FINAL MAP 失败单批拆为两个 INTERMEDIATE 子批并完成最终 merge 时，完整路径为失败调用+两个子调用+merge，通常共 4 calls；一个已成功的前置 MAP batch 会使总计为 5 calls。Guard 逐调用实际准入，不以“净增 1 call”描述。恢复安全日志记录 allowlist reason、attempt、Gateway 累计 actual/charged usage 与结果类别，不包含原始异常 message。
5. 只有通过 validator、mode/source alias 校验及必要严格缩减后才落 checkpoint；失败 Provider 内容不 checkpoint，不提交正式 Overview result。失败 attempt 的有效输入粒度 checkpoint 仍由当前 generation fencing/checkpoint 流程决定。

**验收：**

- 合成输入证明 Source、Subject 与 Reduce 可安全分区的截断路径、child/merge 再截断止损、syntax/schema allowlist、unknown alias/locator/mode/coverage 负例，以及开关关闭时旧稳定错误与单次 Provider call。
- H2 Gateway/Guard 集成证明多批局部恢复各调用独立 reserve/settle、caps、实际用量与 task lock 释放；额外真实 Guard cap 回放证明 repair 被拒时公开 `AI_TASK_BUDGET_EXCEEDED` 不被改写。PostgreSQL `OverviewGenerationServiceRecoveryTests` 仍由最终 backend gate覆盖现有 generation lineage/replay 行为；本阶段没有将 PostgreSQL新恢复账本测试标记为通过。不得宣称跨 HTTP recovery action cap。
- 当前人工 Provider 模型列表核对尚未由仓库配置证明。只有获得适用 Provider 官方模型清单并核验当前请求 model ID / capability 后才标记完成；否则记录为待验收、保持 UNKNOWN 保守路径。
- 已验证局部 Source MAP 保留成功前批、只重做被截断批并完成两子批与最终 merge；H2 ledger 记录 5 次独立调用，cap 顺序为 4608/4608/4608/4608/6144，合成 Provider output 合计 5008 tokens。另有 Subject MAP 两来源截断回放：子调用分别保留各自 alias，最终结果恰覆盖两个选中 source；4 次独立调用均在同一 task 下完成，cap 为 6144/4608/4608/6144，合成 output/charged 分别为 6444/6844。REDUCE 回放使用两个带同一 source alias、内容不同的 MAP partial；截断后两个 child 请求各带一个 partial，最终合并结果保留两 partial 内容和 source UUID；6 次独立调用同一 task 下完成，cap 为 4608/4608/6144/4608/4608/6144，合成 output/charged 分别为 6644/7244。上述数字由测试 fixture 每笔 usage 相加推导，不代表实际 Provider 费率或未知 usage 的结算语义。
- 初审 IMPORTANT I1 已由修复验证关闭：completion/stream shadow 候选在内容类别估算上附加与旧估算相同的每消息 4-token framing；单、多消息测试覆盖 null role、null/空 content 和多消息。旧 estimate 仍等于账本 reservation 估算；embedding framing 保持 0，候选仍标记 uncalibrated 且不参与授权或 reservation。初审 IMPORTANT I2 已补齐 Subject 和 REDUCE 的上述 H2/Gateway/Guard 实际派发回放；本段记录的是当时状态，最终 reviewer 结果见文末。
- deadline/cancel 与现有 checkpoint replay/no-progress regression、validator 收件规则、V32 generation lineage、request replay、strict shrink/fence 没有非任务范围差异；不因测试通过而声称真实模型输出质量或线上恢复成功率。
- validator 收件规则、V32 generation lineage、request replay、strict shrink/fence 没有非任务范围差异；不因测试通过而声称真实模型输出质量或线上恢复成功率。

## 阶段 3：Chat 阶段计次与流式安全故障回放

**目标：** 以可控 fake retrieval/provider/sink 验证 Chat 的 RAG 两次正常调用、拒绝、断流与部分输出失败，既不拼接重复回答，也不把未知 Provider 消费记成零。本阶段只做测试/验证，不新增自动重试，也不调整 Chat 调用上限。

**文件归属：**

- 执行者 D：不修改生产文件；只使用新建的隔离 Chat safety 测试文件验证，不拥有 Guard、Gateway、Provider 或数据库 schema。
- `AiStreamingService.java`、`AiStreamingTests.java` 与 `AiStreamingControllerTests.java` 为现有 frozen 基线，未由合成回放证明明确 correctness 缺陷时不得改。
- Chat safety 执行者独占新建 `Auralis-Server/src/test/java/com/auralis/app/ai/ChatAiExecutionSafetyTests.java` 的写入；执行者 D 负责测试场景回放与证据，不改写该文件。本阶段不新增 production behavior。

**实施步骤：**

1. 分别验证 embedding/retrieval 和 CHAT_COMPLETION 阶段调用身份、call counter、reservation 和 settlement；正常路径仍正好 2 次。输出前失败发生在第几阶段应可诊断。
2. 故障回放至少覆盖：生成前拒绝；首个答案 delta 前 Provider 错误；已发送首个/部分 delta 后断流或 error；正常完成；缺失 input/output usage；客户端断连。
3. 验证当前实现不会在失败后自动重试；只要已有部分 delta，终止当前流、保存对应失败状态和 usage，并发终端错误，不把新的 generation 接到原答案后。不把 citation 或 `message.started` 误当作 answer delta。
4. task call cap 始终为 2。阶段 3 不增加 retry，不调整上限；是否以后设计无内容输出前的恢复，留给另有证据与计划的决策。

**验收：**

- 完整事件序列验证正常 RAG 两次调用、不重复 USER 消息、同一 `clientRequestId` 幂等 replay、error terminal 单次且不伪造 `message.completed`。
- 在首个答案 delta 前后分别注入错误；两者均无自动 retry/内容拼接，assistant 失败记录与已发客户端文本一致。
- Provider 已派发但断流/usage 缺失时，reservation 被保守结算且 actual 字段保持 NULL；Provider 未派发的失败不虚构消费。
- 验证调用上限、用户/系统 quota、并发、cancel、DB message status 与 Gateway 唯一 active call 行为；不引入并行 MAP/Chat 调用。

## 验证命令

仓库说明默认后端门禁启用 PostgreSQL 17/pgvector 与 MinIO Testcontainers；Docker 不可用时不得把跳过或未运行表述为通过。

```powershell
cd Auralis-Server
..\Auralis-Server\mvnw.cmd -B -ntp -Dtest=AiUsageGuardDiagnosticTests,AiUsageLedgerBehaviorTests,AiInvocationGatewayTests test
..\Auralis-Server\mvnw.cmd -B -ntp -Dtest=AiTokenEstimatorTests,AiUsageGatewayShadowEstimateTests test
..\Auralis-Server\mvnw.cmd -B -ntp -Dtest=OverviewGenerationServiceRecoveryTests,OverviewDynamicBudgetComponentTests,AiOverviewServiceTests test
..\Auralis-Server\mvnw.cmd -B -ntp -Dtest=ChatAiExecutionSafetyTests,AiStreamingTests,AiStreamingControllerTests test
..\Auralis-Server\mvnw.cmd -B -ntp clean test
```

上述类名中阶段 0/1 新测试类可以按实际分配命名调整，并同步命令；命令必须在正确工作目录验证。针对性命令不替代最终 clean test。若 test default 包含容器门禁而本机 Docker 环境不可用，应记录实际失败和未覆盖面。

## 风险和关闭条件

| 优先级 | 风险 | 处理与关闭证据 |
|---|---|---|
| P1 | 默认 `deepseek-chat` 与 Overview 能力白名单 `deepseek-v4-flash` 不一致，实际运行配置也可能被环境覆盖 | 不猜测上下文窗口。人工核对当前模型列表并记录证据；不能确认时保留 UNKNOWN/conservative 路径。 |
| P1 | 预算拒绝没有 reservation 账本行，且任务调用数/token 共用公开错误码 | 在拒绝前写安全内部分类事件；并发测试证明分类不改变错误与账本事务结果。 |
| P1 | 当前 byte-based estimate 对中英文和结构化内容误差分布不同 | 影子统计按类型分层并报告低估尾部；只有独立审批后才允许考虑切换真实准入。 |
| P1 | Overview 恢复重试可能重复消耗或污染 checkpoint | 所有恢复用同父任务 Guard；固定上限、错误收敛、通过校验再 checkpoint；回归 V32 request/generation replay 和 no-progress。 |
| P1 | Chat 部分答案重试会产生重复/拼接内容，断流 usage 可能未知 | 首个内容 delta 是禁止自动重试边界；账本 unknown dispatch 保持保守结算，持久失败状态对齐 SSE。 |
| P2 | 官方模型列表可能无法给出价格、快照或所有 capability | 单独记录未知项；阶段 0 只核对可见模型 ID 与可验证能力，不建立猜测的价格/快照登记。 |

退出条件：阶段 0–3验收均有公开/合成自动证据，完整后端 clean 门禁通过，唯一 reviewer 得出 BLOCKER=0/IMPORTANT=0，相关文档按实际变化回写，模型列表人工核对结果单独标注；如 Provider 人工验收尚未完成，明确保持待验收。不得由代码或自动测试结果声称业务验收完成。

## 文档回写边界

计划创建时只登记了本计划与 `docs/README.md`；早期 review-fix 阶段只更新本计划。2026-10-15 在四项问题与 round4 gate 完成后，按主 Agent 授权同步了 `Status.md`、`IssuesAndReview.md`、`Backend.md`、`Infrastructure.md` 和 `Changelog.md`。阶段实施没有公开 API/DTO 或数据库结构变化，`API.md` 与 `Database.md` 契约不改。

## 本轮执行与 review-fix 状态（2026-10-13）

- 阶段 2 修改后的定向命令在隔离副本 `D:/Temp/auralis-ai-governance-20261013/review-fix/Auralis-Server` 执行：

  ```powershell
  .\mvnw.cmd clean '-Dtest=AiTokenEstimatorTests,AiUsageGatewayShadowEstimateTests,AiConfigurationTests,AiOverviewServiceTests,OverviewGenerationServiceRecoveryTests,OverviewBudgetIntegrationTests' test
  ```

  退出码为 0，119 tests run、0 failures/errors、0 skipped。报告见该目录 `target/surefire-reports/`；其中 Overview recovery suite 使用真实 PostgreSQL 17 Testcontainers，H2 Overview budget suite 验证真实 Guard/Gateway 账本。**该段记录的是当时状态**；后续全量门禁和唯一 reviewer 结果见文末最终冻结状态，定向通过本身不等于完整门禁通过。
- 修改后 completion estimator、Gateway、Overview budget integration test 的源码 hash 在 freeze report 中逐项记录；执行前 scratch 副本对对应源码 hash 与仓库一致。最终 clean 门禁可能需要再次同步最新冻结源码。
- `24 calls / 524288 tokens` Overview 与 `2 calls` Chat 预算及输出上限/验证器规则保持原值。Provider 实际模型清单与 capability 的人工核对尚未完成；维持 UNKNOWN / conservative 路径。未调用真实 Provider，自动测试不构成业务验收。

### 最终复审 I3 定向修复（2026-10-13）

- Reviewer 确认跨阶段失败后，同 request/generation 重试可能重复派发已截断的 JSON/Source/Subject/REDUCE 父请求，即使已通过验证的 repair/child checkpoint 已持久化。I3 最小修复在 `OverviewGenerationService` 保存已验证 JSON repair 结果到原 MAP/REDUCE checkpoint，并在 Source、Subject、REDUCE 重试时按原有 child StepKey 恢复已验证子结果；REDUCE 当前调用内仅标记本轮刚恢复的输出，确保下一轮进入已有父/merge 调用。Coordinator、validator、schema、migration、fencing、预算和原 no-progress 规则/阈值均未改。
- 追加固定 PostgreSQL 17 回放覆盖 JSON repair、Source MAP、Subject MAP 和 REDUCE：失败后同 request/generation 重试不重复父请求与已成功 child，只派发未完成 child 和需要的 merge；保留原 generation、budgetTaskId、checkpoint lineage 与 coverage。REDUCE 回放发现的重复恢复循环已在不变更既有 progress 规则下有界修复；原始截断 child 止损用例仍在 `AiOverviewServiceTests.stopsAfterAChildMapIsAlsoTruncated` 覆盖。
- 最新隔离定向命令：`.\mvnw.cmd '-Dtest=OverviewGenerationServiceRecoveryTests,AiOverviewServiceTests,OverviewBudgetIntegrationTests,AiUsageGatewayShadowEstimateTests,AiTokenEstimatorTests,AiConfigurationTests' test`，退出码 0；六个 Surefire XML 合计 123 项、0 failure/error/skipped。23 项 Recovery 用例实际使用 PostgreSQL 17 Coordinator、Gateway、Guard 与 reservation ledger；Provider registry 使用合成响应。H2 Overview budget fixture 使用真实 Gateway/Guard，覆盖单次调用账本，不提供 Coordinator 持久 retry。详细逐项命令、证据路径与 SHA-256 见 `D:/Temp/auralis-ai-governance-20261013/review-fix/checkpoint-report.md`。
- Surefire 测试退出码及 XML 均成功，但当时最终捕获输出时 dumpstream 报告 C: 临时盘无空间；原因是已停止的 REDUCE 无界循环日志 spool 约 22.8GB。该时点单文件清理操作被执行策略拒绝，之后运行环境恢复并完成了新的profile-corrected全门禁；本段I3源码冻结、I1未关闭也是当时状态，后续review与门禁结果见文末。Provider 模型清单人工核对仍待处理。

### 最终复审 I1 REDUCE transition marker 修复（2026-10-14）

- 同一 reviewer 后续确认唯一剩余 IMPORTANT：跨 request 的多级 REDUCE 截断中，previously-resumed response 内容指纹会跳过当前 parent 自己的 child checkpoint preflight，导致第三次重试再次派发已截断的 parent。最小修复把 `reduce` 的 invocation-local marker 改为精确 transition key：parent 输入摘要、parent stage/purpose 与确定性 child checkpoint StepKey 集合；从 child checkpoint 恢复或当前截断生成 child 后只记录该 transition，后续只抑制当前 invocation 内完全相同的 transition。新 request 的 marker 为空，不会遮住下游 C/D checkpoint。未改 Coordinator、schema、validator、no-progress 算法/阈值、RecoveryTracker、Budget、Guard、API 或配置。
- 新增三 attempt PostgreSQL 17 回放：第一次 parent 截断并保存 A/B 后 merge 失败；第二次恢复 A/B，A/B merge 再截断并保存 C/D 后 merge 失败；第三次恢复已有 MAP/A/B/C/D checkpoints，只派发未完成的最终 merge。固定 provider 序列在原实现下于最终 merge payload 断言失败（重派旧 A/B parent），修复后通过。真实 Coordinator/Gateway/Guard 与 SQL reservation ledger 验证 13 次 reservation、同一 task/generation/budgetTaskId、9 个 durable checkpoints、单调用 output cap ≤ 6144、task 预留总额 ≤ 524288 且结束时无 RESERVED 行；测试 Provider 是合成响应。Recovery 测试原有 loop/no-progress case 仍通过。
- 该阶段最新隔离定向命令合计124 tests，0 failure/error/skipped；命令、Surefire XML、RED/GREEN日志和source hashes见 `D:/Temp/auralis-ai-governance-20261013/review-fix/reduce-transition-report.md`。当时源码冻结等待review、完整clean gate尚未运行；这不是最终状态，后续I1关闭和门禁结果见文末。Provider模型列表人工核对仍待处理，未调用真实Provider。

### 最终复审 I1 同轮重复 REDUCE group 修复（2026-10-14）

- Reviewer 后续候选由真实 PostgreSQL 回放确认：四个不同 MAP 输入返回相同有效结果后形成两个同 round 的相同 REDUCE parent。首个 parent 截断并保存 child checkpoint 后，旧 marker 在第二个同轮 sibling 消费了 transition 并跳过 checkpoint preflight，导致重复派发父请求。RED 断言直接查询 `ai_usage_reservations`：预期完整路径 7 次 Provider 调用/预留，实际 8；Coordinator、Gateway、Guard 和账本均为真实 PG，只有 Provider registry 使用合成响应。
- 最小修复仅在 Overview Service：重复的确定性 child StepKey 在 checkpoint preflight 中去重并共享；恢复 marker 仅在下一 REDUCE round 对精确相同 transition 生效，不再抑制同 round sibling。未改 validator、Coordinator、fencing、预算、RecoveryTracker、no-progress 算法/阈值或 API/schema。
- GREEN focused PostgreSQL replay 1/1；Recovery + AiOverviewService related targets 101/101（Recovery 25、AiOverviewService 76），包含 no-progress 和既有三 attempt replay；均 0 failure/error/skipped。D 盘隔离命令、ledger/assertion 证据和限制见 `D:/Temp/auralis-ai-governance-20261013/review-fix/repeated-group-report.md`。
- 当前冻结 hash：Service `59ADB516BE3B3F5DE5EF0311B1DB3806F367C9843B6A3D43E7B6F66C1E5FC4DA`；RecoveryTests `BA86C1852A55860F8BF923CC7DE58202C24CA4A34483E30B72332FCE95580540`。最终 reviewer 复审与完整后端 clean gate 结果现见文末；Provider 模型清单人工核对与生产/业务验收保持未完成。未调用真实 Provider，未提交 commit。

## Round4 前冻结与历史全量门禁（2026-10-14；后续 round4 结果见文末）

- 唯一只读 reviewer 的最终结果为 BLOCKER=0 / IMPORTANT=0 / OPTIONAL=0。复审包 `D:/Temp/auralis-ai-governance-20261014/final/review-package-repeated-group-freeze.md` SHA-256 `D7C5637FA73F20512591D1AF4732E90BFEF35656874B014A056614A49E9FD143`；最终报告 `D:/Temp/auralis-ai-governance-20261013/review/final-report.md`。Reviewer确认 I1 completion framing、I2 Subject/REDUCE实证与 I3 checkpoint replay、transition及同轮重复 group 修复均有对应证据。Overview Service hash `59ADB516BE3B3F5DE5EF0311B1DB3806F367C9843B6A3D43E7B6F66C1E5FC4DA`，RecoveryTests hash `BA86C1852A55860F8BF923CC7DE58202C24CA4A34483E30B72332FCE95580540`。
- latest Recovery + Overview 定向门禁为101/101（Recovery 25、AiOverview 76）；focused PostgreSQL replay 1/1；`OverviewBudgetIntegrationTests` 的H2 Gateway/Guard定向为7/7，其中包含新增Subject MAP/REDUCE故障回放。PG Coordinator、Invocation/Usage Gateway、Guard与SQL reservation ledger为真实实现，仅 Provider registry 是合成。账本测试验证7次路径不重复同轮已完成 child、三 attempt转场13笔reservation维持同task/generation/budgetTaskId。较早124项运行属于前一冻结源，不与latest 101相加。
- Profile-corrected完整 clean test 命令为 `mvnw.cmd -B -ntp clean test -Dauralis.postgres.it=true -Dauralis.usage.postgres.url=jdbc:postgresql://127.0.0.1:44722/auralis_test`，在D盘隔离快照和 synthetic local config 执行；114 suites、659 tests、5 failures、1 error、4 skipped，实际Maven exit 1。独立 HEAD 对照复现全部6项；全量门禁因此未通过，虽未发现任务导致的新失败，也不得将此结果描述为测试全绿。AiConfiguration profile小验证4/4通过、最终config相关7 tests passed。完整命令、测试逐项断言、HEAD归因与输出路径见 `D:/Temp/auralis-ai-governance-20261014/final/report.md`。
- `mvnw.cmd -B -ntp -DskipTests package` 独立 `BUILD SUCCESS`、exit 0；`git diff --check` 与 cached diff check exit 0。source manifest 684 entries，快照/实时源码差异0；以上哈希对应代码冻结快照，不是本次文档修改后的全树哈希。
- 全量中的4个 skipped 属 `AiUsageGuardPostgresLockTests`，其 `@BeforeEach`读取环境变量 `AURALIS_TEST_POSTGRES_URL`，而完整命令只设置 `auralis.usage.postgres.url` JVM property。后续通过进程环境变量显式提供 loopback URL，在隔离PostgreSQL上单独执行 `mvnw.cmd -B -ntp clean test -Dtest=AiUsageGuardPostgresLockTests`，exit 0、4/4通过，验证禁用用户/账号删除与reservation、dispatch及task admission锁序；本补跑不修改原 full run 的659/5/1/4统计、不构成无skip full rerun。`D:/Temp/auralis-ai-governance-20261014/final/guard-lock-followup-report.md` 记录运行、容器/schema清理和当前 Surefire XML 覆盖限制。
- HEAD `IngestionCompletionServiceTests.retryExhaustionUpdatesCurrentSourceAndJobTogether`失败归因是fixture三次 `claim()` 只递增 `attemptCount`，不递增 `failureCount`；`failExhausted`在`failureCount < 3`时返回false，Source/job FAILED持久化路径没有执行。不是同步回调或事务失败。
- 计划退出条件仍未满足，因为完整 clean test 必须通过，Provider当前模型列表人工核对也未完成；不得因6项基线/harness归因调整或删除退出条件。阶段0–3代码、定向验证与复审已完成；完整 Planner、动态批准预算、额度等待任务、跨任务缓存、并行 MAP 等仍在本计划范围外。Overview 24 calls/524288 tokens 与 Chat 2 calls 保持，shadow estimator 仍 `char-category-v1-uncalibrated`，不参与 reserve/context/guard；两项回退环境变量及真实 Provider/model能力、部署、GUI、业务验收限制见权威模块文档。工作树未提交、未切分支、未部署或改写用户配置。

## 两项既有 full-gate 测试失败定向修正（2026-10-14）

- `TaskColorRemovalMigrationTests` 的fresh latest schema断言从V21更新至当前V32，V20升级及数据保留测试保持。`AiQualityFixtureContractTests` 的Jackson databind类型转至`tools.jackson.databind`，fixture断言不变。`JacksonNamespaceGuardTests` 仅允许Jackson 3保留的准确`com.fasterxml.jackson.annotation`包，所有其它Jackson 2 namespace仍受禁止；完整import parser覆盖indent/tab、static和跨行格式。生产DTO、依赖、schema、API、配置与数据库契约未改，仅三个测试文件变化。
- 初始三类final targeted command为11/11、exit 0（migration 6、guard 2、fixture 3）。Reviewer首轮I1发现guard whitespace bypass；执行者先增加RED whitespace回归再修复，I1后只单独重跑Guard 2/2、exit 0。Reviewer最终B0/I0/O0。两段计数分开记录，不相加；I1后migration/fixture hashes保持不变。详细输出与xml见`D:/Temp/auralis-baseline-gate-fix-20261014/implementation-report.md`及`review-report.md`。
- 历史full clean仍为114 suites、659 tests、5 failures、1 error、4 skipped、exit 1。本轮未重跑full；只关闭原failure中的migration版本和Jackson guard/fixture项，剩余4个baseline failure/error未处理，计划整体退出条件仍未满足。此前4个skip由独立 `AiUsageGuardPostgresLockTests` PG补跑4/4通过，不改变full统计；旧4skip的环境变量原因与当时full统计保留在本计划最终门禁记录中。

## 2026-10-14 四项历史 gate 失败根因审计补记

- 对此前四个已知失败样本完成只读根因审计与唯一 reviewer 复核；本次没有源码/测试修改，也未重跑659项 full gate，不能将四项样本描述为当前仅剩问题。既有 full 统计659/5 failures/1 error/4 skipped、旧 migration/Jackson 两项定向修正及4个 PostgreSQL lock tests独立4/4补跑均保留其历史含义。
- 三项属于测试前提问题：completion fixture 的 `claim()` 不增加 `failureCount`；Account deletion测试的固定clock未加载且预期truncate，与 PostgreSQL/pgJDBC 当前微秒舍入不符；embedding resume测试错误期待已豁免 embedding stage 被 user-hour窗口拒绝。PostgreSQL request/replay保留精确360秒 grace，最多1µs response/persistence差异不违反当前 API 契约。唯一 reviewer将 timestamp 一致性强化评为OPTIONAL。
- `ArchitectureTests.verifiesApplicationModules`复现真实 `knowledge → review → knowledge` 静态模块依赖环，1 test/1 error、exit 1；不是已证明的 Bean 构造循环或运行死锁。最小建议为将唯一 UTF-8/SHA-256 helper移至knowledge所有权并保留hash byte语义、不新增模块豁免。该 IMPORTANT 未修，计划完整门禁退出条件仍未满足。
- 唯一 reviewer 对四项汇总为 B0/I1/O1。completion 34/34隔离组合为 mock repo/service unit，对真实 transaction rollback没有证明；quota真实 PostgreSQL concurrency回放1/1，通过实际 Guard/Gateway/Worker拒绝及checkpoint续做，但首个27项checkpoint由测试控制准备。审计报告、review报告 hash、命令和精确限制见 `D:/Temp/auralis-remaining-four-audit-20261014/audit-summary.md`。

## 2026-10-15 四项历史门禁问题关闭与 round4 最终验证（clean gate 于 2026-10-14 运行）

- 四项历史 failure/architecture 问题的最小处理已完成：completion fixture 以有效 claim 的两次失败和中间的 `claimById` re-claim 区分 attempt/failure count；Account deletion 测试注入固定 Clock 并按 PostgreSQL 微秒 round-trip 验证；embedding resume 测试核对现行 embedding-window 豁免和恢复；唯一 SHA-256 helper 移至 knowledge，使静态模块依赖只保留 `review → knowledge`。没有改变 retry / quota 生产策略、时间 API 或事务/锁序。
- 定向证据按独立运行报告：`IngestionCompletionServiceTests` 9/9；Account deletion PostgreSQL 5/5；embedding resume PostgreSQL 2/2；architecture/hash/review 19/19。round3 发现的反射 fixture 用显式 8 参数构造器修复，`AiOverviewServiceTests` 76/76；SlowDrip 由 runner 提供 synthetic TLS keystore 后 3/3。唯一 reviewer 对四项及反射 fixture follow-up 为 B0/I0/O1；O1 是 response 和 `TIMESTAMPTZ` 最多 1µs 的可选一致性，不改生产规范化。
- 最终 clean command 在 D 盘统一快照执行：

  ```powershell
  mvnw.cmd -B -ntp clean test '-Dauralis.postgres.it=true' '-Dauralis.usage.postgres.url=jdbc:postgresql://127.0.0.1:44725/auralis_remaining_round4gate_2026101423' '-Dspring.config.additional-location=file:///D:/Temp/auralis-remaining-four-fix-20261014/final/round4/uniform-current/synthetic-local-config/'
  ```

  Maven 实际 exit 0，115 suites / 666 tests / 0 failures / 0 errors / 0 skipped；Guard lock PG tests 为 4/4。Surefire 115 份 XML 与 115 份 TXT 在 package 前留存。fresh task-owned PostgreSQL 17.11 数据库初始只有 `plpgsql`，无应用表和 vector；Account deletion suite 在其测试 `public` schema 安装 vector。loopback 使用了测试读取的 `AURALIS_TEST_POSTGRES_URL`，profile 未全局设置；synthetic TLS keystore preflight hash 与来源匹配。
- 同一快照独立 package 命令 `mvnw.cmd -B -ntp '-DskipTests=true' package` 实际 exit 0、BUILD SUCCESS；artifact SHA-256 `AC83CB6CD57B5F2F7A5D8E823A147F474837555C2BC00BE4461B969536050D41`。493 个 Server 输入与 6 个当前 contracts 文件的 live/snapshot manifests 均为零差异；`git diff --check -- Auralis-Server` exit 0。完整 round4 命令、XML/TXT、manifest、容器清理与所有轮次归因见 `D:/Temp/auralis-remaining-four-fix-20261014/final/round4/report.md`（SHA-256 `CE2E87C57703240138E7F69C8D0B3B9683116436A3D4EB41D9F45F1843FF18BD`）。
- 保留旧门禁时序与含义：历史 659/5 failures/1 error/4 skipped 不改写；后续 666/1 failure/5 errors 的 numeric Maven exit 未捕获；round2 中断没有 numeric exit；round3 666/0/6/0 exit 1；round4 初次错误参数调用停在测试阶段前、0 tests；最终 round4 才是当前通过的 full clean run。各阶段不拼接或累加。
- 阶段0–3实现、合成/公开输入自动验证、既有 AI 只读 review 与 round4 full/package 已完成；本条不代表真实 Provider、模型列表、production shadow 校准、部署、GUI 或业务验收。`deepseek-chat` 能力保持 UNKNOWN；shadow estimator 仍是 `char-category-v1-uncalibrated`，不参与准入或预算。Overview 24 calls / 524288 tokens 与 Chat 2 calls 硬上限未变。模型列表人工核对和业务验收仍待完成，故不把整个方案写为已完成。
- 公共 API/DTO、数据库 schema 与 migration 未改变；后续 Planner、动态批准预算、后台额度等待、跨任务缓存和并行 MAP 仍超出本计划范围。

## 后续真实运行验收与校准流程（2026-10-15，待执行）

**目标：** 在来源、镜像、配置和活动任务都可追溯的前提下，先于本机 Compose 候选版本、专用测试账号和公开合成资料完成小批量真实链路验收；再用完整 Provider usage 评估 shadow estimator；最后依据证据分别决定是否设计准入切换及后续阶段。本节是待执行流程，不表示真实 Provider、部署、GUI 或业务验收已发生。

**固定边界：** Overview 每 generation 仍最多 24 calls、524288 task tokens、240 秒；Chat 仍最多 2 calls。保持相同 Gateway/Guard、父 budget lineage、数据库 fencing、每次派发 reserve/settle 和未知已派发调用的保守结算。不清账、不改硬限、不并发发起多个真实任务、不用真实用户正文、不以一次请求成功代替其它路径验收。所有样本均由专用测试账号创建，使用公开合成文本；不把正文、响应、Authorization、API key、环境变量值或原始异常写入证据。

### 当前运行前提与工具缺口

- 后端实际入口为 `POST /api/sources`、`POST /api/sources/{id}/reingest`、`POST /api/ai/source-overviews`、`POST /api/ai/subject-overviews` 和 `POST /api/ai/messages/stream`；PC/Tauri 应走现有页面/API，不手写未经契约确认的请求 DTO。`GET /api/ai/settings`、`GET /api/ai/settings/{provider}/models` 和 `GET /api/ai/usage` 已存在；纯模型列表/元数据 HTTP 请求单独登记，不混入生成/embedding 调用计数。所有实际生成/embedding 派发按唯一 reservation id 计数；生成请求若无 reservation 是观测/预算缺陷，应停止。账单/费用不明时仍记 UNKNOWN。
- `application.yml`、根 `.env.example` 与 Compose backend environment 均显式配置 `AURALIS_AI_SHADOW_TOKEN_ESTIMATE_ENABLED`，默认 true；synthetic Compose true/false render 均 exit 0。该 flag 只开关 `AI_TOKEN_ESTIMATE_SHADOW` 日志，不切换实际 reservation 估算；未确认当前运行容器值。`overview-output-recovery-enabled` 是另一项恢复开关。
- `AiUsageGatewayService` 在每次调用结算后输出 `AI_TOKEN_ESTIMATE_SHADOW`，字段含 reservation/call id、feature/stage/provider、request 与 observed model/status、textType、estimatorVersion、usage 完整性、old/shadow estimate、actual input/output、字符类别、message framing 与误差；不含正文、凭据、endpoint URL 或原始异常。`scripts/aggregate-ai-token-shadow.mjs` 已提供离线 allowlist parser、reservation join 与聚合输出；它不连接 DB/Provider/网络，保持 shadow-only/uncalibrated。实际日志聚合需等待后续受控运行样本。
- V30 `ai_usage_reservations` 保留每次调用的 feature/stage/provider/model、estimated/reserved、nullable actual、charged、`request_dispatched` 和结算状态；`GET /api/ai/usage` 是聚合 snapshot，不是逐调用校准数据。将 shadow 事件按 call id 与该 reservation 对齐。actual 为 NULL 时写 `UNKNOWN`，charged 只用于保守费用/额度暴露，不得代替 actual。Provider 实际价格未核验时费用字段为未知，不猜单价。
- `OpenAiCompatibleProvider` 的请求 model 会放入 wire body；内部 completion/stream/embedding结果会携带独立的 observed-model metadata，由 Gateway 以安全字段记录。缺失、非法或冲突状态不以 request model 回填。真实 Provider 尚未调用，returned model 与能力现状仍未观测；当前只有 DeepSeek structured JSON Overview 请求显式发送 `thinking=disabled`，没有统一 thinking 配置。
- 2026-10-14 round4 clean gate/package 是观测改动前的历史基线，不证明本轮新增代码。Step 2 backend/Compose targeted 39/39、synthetic true/false render exit 0、offline tool 27/27；此前限定 reviewer 对实现文件为 B0/I0/O2。后续 D 盘冻结快照 fresh full 为 116 suites / 674 tests / 0 failures / 0 errors / 0 skipped，Maven 与 launcher exit 0，Guard lock PostgreSQL 4/4；116 XML/TXT 已在 package 前保留。同快照 package 两个 exit 均为 0，artifact SHA-256 `723919B7517A21B7A1C458F8708B3E6BFDE1E70DCF2D3478A45BA2894204A236`；508 项 manifest SHA-256 `0D2191E5F5AD7450089B83024B14A99FDF9D749C78296E57DF01EF3D7AAA6DE6`，对 canonical/live 均零差异。机器记录见 [final-verification.json](D:/Temp/auralis-ai-observability-step2-20261015/final/attempt3-pg-auth-fix/attempt4-full/final-verification.json)，完整报告见 [attempt 4](D:/Temp/auralis-ai-observability-step2-20261015/final/attempt3-pg-auth-fix/attempt4-report.md)。
- 门禁过程按轮次保留：首次因 C 盘约 0.89 GiB 低于 3 GiB 保护门线而暂缓，后 C 盘恢复；attempt 1 在测试完成前中断，无可信 Maven 数字退出码；attempt 2 显示 674 tests / 1 failure / 13 errors 且 BUILD FAILURE 与先前退出标记不一致，该 marker 不采信；attempt 3 的定向 19 项和 H2 7/7 通过，先前 H2 失败未复现且原因未确认；attempt 4 为独立 fresh DB/full/package，通过计数不与前轮相加。runner/harness 改动仅在 D 盘临时证据树，未改仓库实现。此前磁盘阻塞是已解除的过程历史，不是当前门禁状态。
- **C/D 部署或真实请求前置项：** Compose shadow flag 透传、returned-model 安全 metadata 与 synthetic 验证、offline allowlist reader 与 malformed/duplicate/missing/unknown fixture 验证均已完成；fresh full/package 与最终 reviewer 复核 B0/I0/O3 已完成，三个 OPTIONAL 不在本轮修改。2026-10-14 round4 的旧 493/666 manifest/gate 不覆盖本轮改动。当前未部署或产生真实 Provider 数据；真实日志只在 D 受控样本收集后由 reader 汇总，E/F 校准保持待执行。
- B 仍把真实 response model id 标为 `UNOBSERVED_BEFORE_FIRST_CALL`，直到 D 首个受控生成/embedding请求返回。现有内部 metadata 和安全 Gateway 事件已接线；只有首个批准的真实请求后才能核对 request/observed model，不额外发送探针。

| 阶段 | 唯一执行者 | 只读/修改边界 | 通过后产物 |
| --- | --- | --- | --- |
| A–F 运行前和实测 | 一名 `gpt-6-luna` 执行者；主 Agent 指定运行窗口和预算；不拆成多个并行 Provider 操作者 | 仅经批准的本机 Compose backend、专用测试账号、公开合成资料；任何工具/配置代码改动先列最小文件清单和单独 reviewer | source/image/config provenance、逐任务证据、可复算 usage 数据和分层报告 |
| G 准入评估 | 同一执行者；主 Agent 裁决是否提出准入代码工作 | 当前 shadow-only 代码继续冻结；未批准新的 feature flag/Guard 设计前不得切换 | 通过/不通过的准入建议和旧路径回退演练 |
| H 后续瓶颈 | 主 Agent 排期；同一 `gpt-6-luna` 实施；单一只读 reviewer | 每次只实现一个阶段，依赖当前 Gateway/Guard/fencing | 分开的设计、自动证据、真实运行与业务验收 |

### A. 锁定源码、候选镜像和回退点

- [ ] 从当前 `git rev-parse HEAD`、`git status --short`、`git diff --name-only`、Server 与当前合同文件 manifest 计算候选源码清单和 SHA-256。把并行未提交改动列为阻塞，不从旧 archive、旧运行镜像或记忆中的版本拼装候选。
- [ ] 先核对当前本机 Compose 容器的 `Config.Image`、运行 image ID/digest、创建时间、健康/ready、后端版本标识和 Flyway `flyway_schema_history`；保存一份不可变的已运行镜像 ID/旧标签和对应配置指纹。命令示例：

  ```powershell
  git rev-parse HEAD
  git status --short
  git diff --name-only
  docker compose --env-file .env config --quiet
  docker compose ps
  docker inspect --format '{{.Config.Image}} {{.Image}}' auralis-backend
  ```

  命令中的 `.env` 只由 Compose 读取；禁止 `Get-Content .env`、`docker inspect .Config.Env`、`docker compose config`（无 `--quiet`）或把 secret 展开到日志。若服务容器名不是 `auralis-backend`，先以 `docker compose ps` 返回的 backend 容器名替换。
- [ ] 通过不输出敏感值的部署端配置视图记录非 secret 配置：profile、启用 Provider、base URL host、chat/embedding model ID、time-out、worker flag、shadow flag、各 task/window limit。保存配置来源（环境变量名、Spring 默认或用户级设置）、脱敏后的值及采集时间；密钥只记录“配置存在/缺失”，不读、不打印、不复制。
- [ ] 对比源码、编译产物和候选镜像 provenance；候选必须来自唯一冻结的 manifest，记录原镜像与候选镜像 SHA，另外保留可直接按已验证方式恢复的旧镜像标签/ID。不能证明 image→source 对应关系时停止。
- **通过：** 当前镜像、候选源码、配置来源、数据库 schema 版本、旧镜像回退点可以逐项追溯，且候选仅包含已 review 的范围。
- **停止/回退：** manifest 不一致、密钥以外的有效配置不明、回退 image 不存在或当前服务状态不明时不发 Provider 请求。回退只恢复 backend 镜像和原配置；不回滚数据库、不清计数、不手工释放 reservation。

### B. 核对有效 Provider 和模型身份

- [ ] 由配置负责人在安全环境核对默认 Provider `AURALIS_AI_DEFAULT_PROVIDER`、具体 Provider base URL 的 host、所用 chat/embedding model ID、AI enabled、ingestion worker、每个 feature 的 task limits 和 HTTP/time-out。与 `application.yml`、Compose 显式传入项、实际运行容器安全配置面板逐一比对；`application.yml` 默认值不能证明运行值。禁止输出 API key、密文或完整含凭据 URL。
- [ ] 认证后读取现有 `GET /api/ai/settings`（只核对 provider/model/`hasApiKey` 等安全字段）和目标 `GET /api/ai/settings/{provider}/models`；纯模型列表/元数据 HTTP 请求需单独登记，不混入生成/embedding 调用计数；所有实际生成/embedding 派发都应有 reservation，并按唯一 reservation id 计数。若发现生成请求没有 reservation，视为观测/预算缺陷并停止。与 Provider 官方模型清单或控制台核对**请求 model ID、响应 model ID（若可获得）、模型发布日期/快照/能力说明和核对时间**。列出模型不证明上下文窗口、最大输出、JSON/thinking 能力或当前账户可用性；未获得有证据的字段保持 `UNKNOWN`，沿当前保守配置运行。
- [ ] 有界检查真实 structured Overview 请求是否对应预期 wire 参数：只允许当前代码支持的结构化 JSON 语义；DeepSeek 的 `thinking=disabled` 只适用于上述 structured Overview。不得从一次模型列表响应推导通用 reasoning 参数，不向非 structured Chat 请求臆加 thinking 配置。
- [ ] B 阶段先记真实 `observedModel` 为 `UNOBSERVED_BEFORE_FIRST_CALL`；内部安全 metadata 与 Gateway allowlist 观测已由定向测试验证。只在 D 首个受控 Provider 请求后核对 returned model 与请求配置；不额外发生成探针或记录原始 response body。
- **通过：** 每个候选 Provider 的 host、request model、模型清单依据/日期和可验证能力有记录；未知 capability 明确为 UNKNOWN，`OverviewModelBudget.resolve` 的白名单未被扩展。
- **停止：** key 未配置、host 与允许列表不符、请求 model 不可用、response model 不一致、清单/能力不明且会影响安全预算，或 test-connection/模型列表失败。不得靠切换到未经核实的模型或提高限额继续。

### C. 本机 Compose 候选部署与数据库前置门

- [ ] 默认先做本机 Compose 候选部署，不直接推广生产。候选使用专用测试账号和现存本机 db/MinIO；不清除容器、数据卷、任务、usage 或旧 Source。仅在 A/B 与 C/D 前置观测工具完成后继续。
- [ ] 在任何 `up --force-recreate` 或其它会停止/替换 backend 的命令之前，以现有数据库只读连接确认：有效 `TASK` lease 为 0，`ai_usage_reservations` 有效 `RESERVED` 且未过期行数为 0，`ingestion_jobs` 的 `PENDING/PARSING/INDEXING` 活跃或待领取作业数为 0；有任意活动/未知项则等待，不杀 worker、不强制重启。保存只读 SQL 输出和采样时间，查询只包含状态、计数、迁移版本，不读取用户正文或凭据。可用表为 `ai_usage_locks(scope_type,current_task_id,lease_until)`、`ai_usage_reservations(state,request_dispatched,lease_until)`、`ingestion_jobs(status,next_attempt_at,lease_until)`、`flyway_schema_history`。惰性回收账本的应用 snapshot 不是严格只读查询，预检优先用只读 SQL。
- [ ] **先做 schema 迁移门，再允许切换 backend：** 用只读方式比较当前数据库成功应用的 Flyway 版本/历史与候选镜像会应用的 migration 列表。当前仓库最高 migration 为 V32，不代表本机当前版本；历史部署曾使用 V31，必须重新核实。若没有 pending migration，记录该事实后继续。若有任何 pending migration，backend 不得 `up` 或启动：先做可读取的独立备份和恢复演练、独立 PostgreSQL upgrade 测试、migration review，并由主 Agent单独批准升级；未完成则停在当前旧 backend。候选镜像回退不回滚已应用 schema。
- [ ] 允许先 build image，但 build 不替代 schema gate：

  ```powershell
  docker compose --env-file .env config --quiet
  docker compose --env-file .env build --progress plain backend
  ```

  build 后记录 candidate image SHA 并与 A 的 source manifest 对齐。通过上一项 schema gate 后，**紧邻 backend 替换前**重新查询活动 TASK/RESERVED/ingestion 为 0，再执行：

  ```powershell
  docker compose --env-file .env up -d --no-deps --force-recreate backend
  docker compose ps backend
  curl.exe --fail --silent http://localhost:8080/actuator/health/readiness
  ```

  backend 启动后确认唯一 backend image ID、health/readiness、有效非 secret 配置和实际 schema 版本。后台日志只允许使用前置 allowlisted reader 输出；reader 可用前不运行或展示原始 `docker compose logs`。
- **通过：** 只更新 backend，db/MinIO 容器 ID 和卷身份不变，readiness healthy，实际 schema 版本与批准版本相符，活动任务为 0，历史数据未重建。
- **停止/回退：** 迁移状态不明、待迁移未独立批准、health/readiness、image provenance、配置或账本出现差异即停止 Provider 请求。保留安全的只读摘要，按预先记录的旧 backend image/config 回退并复核 readiness。禁止盲目回滚 migration、清除业务数据或手工改账本。

### D. 单任务真实生成链路与 GUI 验收

- [ ] 为第一批建立独立测试账号、空 Subject 和专用合成 TEXT Source。样本文本由执行者现场生成，短且无真实个人信息、引用或上传附件；记录 SHA-256、字符数和 UTF-8 字节数，不将正文写入日志或报告。输入契约以 PC UI/API 当前生成的 DTO 为准，不编造请求字段。
- [ ] 串行验证：创建 TEXT Source → worker ingestion 完成并确认 Source/job READY 和 active generation → 单 Source Overview → 单 Source Subject Overview → 加第二个短合成 Source 后做 multi-source Subject Overview → Chat 对该专用知识做一轮 RAG。每一项都等待上一项 ledger settlement、核对成功结果/数据库状态后才发下一项，不并行启动；Chat RAG 仍只允许现有 retrieval embedding + completion 两次请求。
- [ ] 分别核对两种 SSE 协议，不混用终止事件：Overview (`/api/ai/source-overviews`、`/api/ai/subject-overviews`) 成功终止事件为 `result`、失败为 `error`；PC `overviewSse.ts` 对 `result` 做 schema 校验，对 `error` 转为 terminal failure。Chat (`/api/ai/messages/stream`) 成功终止事件为 `message.completed`，失败为 `message.error`；`message.started`、`message.delta`、`citation` 都不是终止事件。Chat 客户端断连/取消可能来不及收到终止事件，需在连接外通过已保存的 `INTERRUPTED`/`FAILED` 状态与 ledger 对账；任何路径缺 terminal event 都标记为结果不确定，不把 HTTP 200、心跳或 partial delta 当成功。
- [ ] Overview retry 使用唯一 `X-Overview-Request-Id`。回放同一 request 前先读 generation/checkpoint/ledger，确认是同一输入和同一测试账号；断线后不得生成新 request ID 盲目重发。以 reservation id 和 request/generation/task lineage 核验同请求 replay 没有重复已完成 Provider 阶段。
- [ ] 错误/恢复回放只使用独立 fake Provider、stub 或隔离测试环境注入断流/截断/429/5xx；真实 Provider 不进行批量故障注入，不连续制造 429/5xx。真实请求只观察自然错误并止损。
- **通过：** 每条链路的 request id、状态转移、结算、最终 UI 结果和 sync/save 结果一一对应；取消释放本地任务/租约，已派发未知 usage 保留保守 charge；重放不重复发已 checkpoint 的 Provider 调用。
- **停止：** 任何无权限、跨用户、Source/generation 不匹配、partial result 被显示为成功、SSE 丢 terminal、取消后 lease 未释放、未知 usage 被记 0、同步保存冲突或任务重复 dispatch 时停止后续批次；导出最小脱敏证据，按支持路径修复并重审后再继续。

### E. 影子样本收集和账本对齐

- [ ] 离线只读工具按 reservation/call id join，输入严格 allowlist，输出 `summary.json`、`groups.csv`、`issues.json`；冲突/缺行输出安全 reason，不含原始正文/凭据。Reader 原有27项加2项新增回归共29/29；synthetic CLI COMPLETE（1 reservation、1 group、0 issue）。2026-10-16 自然样本汇总已复算46 ledger与7 shadow events：actual complete 46/46、actual unknown 0、shadow event missing 39、accuracy sample 7。39只表示shadow比较覆盖缺口；`unknownUsageCount`仍保留为兼容计数，合并既有 missing-event、ambiguous-event/ledger-ID 与 matched-incomplete-shadow 分支，不能解读为ledger actual unknown。该自然样本仍不足以校准；分层训练/held-out与准入门槛未完成。
- [ ] 分离三类数据：`actual_input_tokens`/`actual_output_tokens` 是 Provider 返回的真实 usage 且可为 NULL；`charged_tokens` 是 Guard 的预算结算值，可能基于保守估算；old/shadow estimate 是输入估算器输出。不得把后两者写入 `actual`，不得将未完整 usage 的 estimate 误报为误差为 0。Provider 账单金额另列且只从可信账单导出核对；没有账单明细时显示 UNKNOWN，不推算费率。
- [ ] 分别汇总 `COMPLETED/FAILED/EXPIRED/RELEASED`、是否派发、ledger actual complete/unknown、shadow missing/matched-unknown/ambiguous、embedding 与 completion、request model 与可见 response model。actual completeness只按有效唯一 dispatched ledger 的 input/output nullable 字段判断；ledger缺失不从shadow事件回填。actual unknown保留在dispatched actual分母，排除出估算 accuracy 分母并列数；未派发失败不得计作 Provider 样本。失败/重试各是一条调用事件，不按业务 generation 去重调用费用。
- **通过：** 汇总可从脱敏事件和账本独立复算；actual NULL 仍 NULL；sample count、unknown 数和 charged 曝光相互独立可审计，raw logs/DB/export 均不含原始 prompt、回复或凭据。
- **停止：** 日志字段不全、shadow flag 实际未生效、账本关联缺失或响应模型身份不明却必须据此分层时，标为不可比较；先补观测工具/安全字段，不能从旧预算聚合或 `GET /api/ai/usage` 推造逐调用样本。

### F. 分层校准与 held-out 验证

- [ ] 按 exact provider + request model + stage + `textType` 分层，并再按 UTF-8 长度（≤1 KiB、1–4 KiB、>4 KiB）、脚本/内容类型分层。覆盖中英文、代码/JSON、普通 prose 和 embedding 输入；不得把某个模型或 stage 的结果外推到未测模型、不同 endpoint、thinking mode 或其它输入类型。
- [ ] 先以 document family/source lineage/session 为组做 70/30 train/held-out 切分；同一个原始文档的切片、改写、重试、相同 conversation/session 必须留在同一侧，防止泄漏。训练集只用来拟合/选择候选参数；holdout 只用于最后一次独立报告，不反复调参后仍称 held-out。
- [ ] 仅对拟申请准入的精确 provider/model/stage/textType 分层，建议目标为至少 100 条 complete train 样本、100 条 complete holdout 样本，且每侧不少于 30 个独立 document family/session；长度、脚本/内容类别作为报告子组，按阶段逐步累积，不要求为覆盖所有交叉组合一次性发请求。样本不足、usage unknown 比例过高或输入长度/语言覆盖不够时，继续保持 UNKNOWN/uncalibrated；只从已批准的小批量/自然调用累积，绝不为达样本数盲目扩量。
- [ ] 报告每层 n、distinct family/session 数、unknown 和 excluded 数、old/shadow signed error、underestimate rate、P50/P95 error、>5% 与 >10% 低估比例、按 input-length 与 script 的分布；逐层比较旧估算与候选。建议试行门槛（**提议验收值，不是已经测得的结果或数学保证**）：每层 held-out 候选低估比例 ≤5%，没有 >10% 的单次低估，且整体/关键长文本层不劣于旧估算；任何样本、报告或真实 Provider usage 不足时不得升级。
- [ ] 对低估样本做受控复核：确认 provider/model identity、message framing、API usage 字段完整、request replay 是否重复、字符类别统计和文本长度。不要读取/导出正文；必要时仅在受控本机查看合成样本。报告指标要带分母和时间窗；零个已见低估只表示本次样本未见，不能证明未来风险为零。
- **通过：** 训练和 held-out 分离可复现，所有关键 strata 达到提议最低样本量/门槛且没有把未知项当零；主 Agent 逐层接受证据后才进入准入设计。
- **停止：** 任一模型/阶段未覆盖、holdout 泄漏、candidate 明显低估长文本、usage 完整度不足或 429/timeout/unknown 暴露超出预设时，保持 shadow-only 并停止扩批。

### G. 单独批准准入切换与回退

- [ ] 只有 E/F 全部通过，主 Agent 明确批准实现后，才做新的最小实现计划与代码审查：为已校准的 exact provider/model/stage 配置引入显式 **admission-estimator** 选择；shadow flag 继续只管理观测。新配置缺失、model 不匹配、usage/模型 capability UNKNOWN 或校准版本不匹配时，fallback 到现行 UTF-8-byte conservative estimate，不因候选值减小原配置 hard limits。
- [ ] 验收合成输入、实际 Provider usage fixture、Guard atomic reservation、task cumulative budget、parent retry/generation replay、拒绝码、reserved-vs-actual/charged 报表；fallback 应在一个新任务生效，已运行 task 不重置 budget/账本。对比旧 estimate 与候选 estimate 的 reservation，仅按经批准的候选估算输入做精确 admission；输出上限、context cap、response timeout 和 24/524288/2 仍不动。
- [ ] 在本机先跑并发安全和一项小 canary，通过后再给低比例运行窗口；观察期按任务结算，任何高低估、调用上限、quota、未知 usage 或 latency 回归立即关 admission feature flag 并回退旧 estimator。shadow flag 关闭只停止 shadow 事件，**不能**还原 admission 估算。
- **通过：** 有单独 reviewer（BLOCKER=0、IMPORTANT=0）、针对性与完整自动门禁、旧镜像/配置回退流程和新旧 estimator 并行差异证据。未完成这些，不得说 shadow 数据已用于 Guard。

### H. 按实测瓶颈决定独立后续阶段

| 观察到的瓶颈 | 可提议的独立阶段 | 必需先决条件与 stop |
| --- | --- | --- |
| 请求计划能减少输入/输出但未进入 Gateway/Guard，或长文本大量超 conservative admission | 完整 Planner 与动态批准 budget | 先把模型 profile 和 Planner 结果安全传到 Service、Gateway reserve、Provider `max_tokens` 和 task budget；测试 unknown fallback 与硬上限。当前 planner 仍 advisory，不可只改 prompt/.env。 |
| 非豁免阶段因窗口额度等待，或并发资源造成任务延期 | quota wait/background scheduling | 按 Guard 实际原因区分 quota wait 与并发排队；`INGESTION_EMBEDDING`/`RETRIEVAL_EMBEDDING` 保持窗口额度豁免，不把并发拒绝当窗口 quota。使用现有 `next_attempt_at`/fenced worker 测算积压、恢复时效与用户反馈；等待不算 ordinary failure；先保留 task-level calls/tokens 和锁。 |
| 同一安全请求反复支付、重放未命中有效 checkpoints | 安全缓存/跨任务 cache | 明确 owner、source revision、model/profile、schema/instruction hash、权限、TTL 和失效语义；测跨用户隔离和费用/账本归属，不能共用未经校验的历史结果。 |
| latency 而非 token/call 限额是主要瓶颈，且输入可安全分批 | 有界并行 MAP | 当前 `AiUsageGatewayService.TaskScope` 仅支持一个 `activeCall`。必须先设计并证明 Guard lease、同父 budget、并发与取消/fencing 后才能考虑并行；不能靠线程池或配置开并行。 |

一次只进入一个阶段；先由主 Agent确认具体数据是否支持，再写独立执行计划与测试验收。没有数字证据或瓶颈属于未知时不推进。

### 首批运行建议与总额度口径

- **首批范围（提议）：** 本机 Compose 候选、一个专用测试账号、一个 ≤1 KiB 的公开合成 TEXT Source；按序完成一次 ingestion、单 Source Overview、单 Source Subject Overview 后暂停。每个 task 完成并结算后立即查 ledger 和健康状态，确认没有活动 lease/RESERVED，再由主 Agent决定是否继续。第二批才添加第二个短 Source，验证 multi-source Subject 与一轮 Chat。一个时刻最多一个真实 Provider task。取消/重复请求/恢复的故障注入只用 stub，不消耗真实 Provider 额度。
- **人工批次暂停线（提议）：** 首批一个合成 Source 的流程最多 6 次已派发 Provider 调用，按唯一 reservation id 计数，包含 ingestion/retrieval embedding、completion 和恢复调用、10,000 个合并的**已知实际 tokens**、15 分钟 wall time；以账户 remaining quota 更低者为准。第二批需另行审核并使用独立暂停线，不自动续跑。到任一暂停线即不发下一 task，先汇总并确认。每条实际 usage 缺失时该调用仍按 Guard 的 conservative `charged_tokens` 计入额度风险/批次 pause exposure，但标 `UNKNOWN`，绝不算 actual tokens。提供商货币费用只有账单证据可确定时才计数。
- **这条批次线不是实时系统硬限。** shadow event 在结算后产生，当前没有全流程 campaign stop 工具。单个在途 task 的额外上界仍是现有 hard cap：Ingestion 最多 512 calls / 16,777,216 task tokens；Overview 24 / 524,288 / 240 秒；Chat 2 calls（当前 task tokens 32,000）。人手在结算后观察不能保证一个 task 在 6 次/10,000 tokens 时即时停止。若运营方不能接受“一项在途 task 可达到相应现有硬上限”的最坏边界，必须先增加一个经测试、默认关闭、每次 dispatch 前执行的更低 canary task/campaign cap，或降低外部账户可消费余额；不满足即不得发起真实收费请求。不得把暂停线宣传成代码可强制的全批次总上限。
- **首批通过后：** 保存逐任务 ledger snapshot、image/config/schema provenance、sanitized GUI 记录与 shadow reader 输出；仅在首批实际 dispatch、known/unknown、charged exposure 和结果均可复算后，再由主 Agent批准下一批。样本量不够不会触发自动扩量。

### 交付和验收记录

- 每轮记录：时间/环境、源码与 image hash、配置字段来源（脱敏）、DB/Flyway 版本、活动 TASK/RESERVED/ingestion 预检数、测试账号批次 id、合成资料 hash/bytes/chars、Provider request/response model identity 可见性、task/recovery lineage、SSE terminal/save/sync/GUI 状态、reservation 数、actual NULL 比例、charged exposure、report hash、执行者与 reviewer 结论。
- 报告分开写：源码/配置存在，自动测试与 package，候选部署/健康，Provider 真实 dispatch/usage，PC/Tauri GUI/sync/cancel，用户业务验收；缺一项不能借另一项代替。Provider 不可用、账户余额/remaining quota 不明、当前任务活动状态不明或用户级批准额度未到位时，报告“等待”及原因，不猜测、不发请求。
- 该执行阶段只追加/更新本计划和相应证据报告；若未来实现新工具、配置或 admission behavior，依 `BeforeCoding.md` 再做修改前上下文恢复、冻结范围评估、定向与 full gate、单一 reviewer 及对应文档回写。不得用本节授权改动当前 source/test/config 或执行真实 Provider/部署。







