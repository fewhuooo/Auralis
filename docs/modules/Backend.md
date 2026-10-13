# Spring Boot 后端模块

### 2026-10-13 Overview recovery no-progress 修正（本地代码与隔离回归完成，未部署）

- 用户 retry 曾反复恢复到同一个 5,787-char 无缩减 REDUCE checkpoint，并以 `OVERVIEW_REDUCE_NO_PROGRESS` 结束。Service 现把 recovery compaction 与普通 REDUCE 分开作 checkpoint identity；full 与 partial 分别使用专属 purpose，prompt/partial-mode规则保持。fresh输出在写 checkpoint 前、缓存输出在恢复后都须严格短于输入，否则维持原错误码。
- Testcontainers PostgreSQL 回归植入旧 REDUCE purpose 的 poison checkpoint，验证它保留但新 recovery 不命中；普通 MAP/REDUCE checkpoint 继续复用，短合法压缩经现有 Gateway 成功，稳定预算 lineage 不变。相关隔离门禁 141/141 通过；210 项历史全门禁早于此修复。本地补丁尚未部署，Subject JSON 拒绝原因仍待安全诊断证据。

### 2026-10-13 Overview 动态预算与私有恢复（实现、自动门禁与指定 P4 通过）

- `OverviewContentStats` / `OverviewBudgetPlanner` 提供按内容与结构增长的输出软目标；UTF-8 byte estimate 是保守估算，不是 tokenizer。12000 字符实际 prompt、4608 intermediate / 6144 final `max_tokens`、24 次调用、524288 task token、240000ms 任务期限以及 Gateway 限额仍为硬边界。
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

### 2026-10-12 聊天资料检索默认开启（后端实现与定向验证通过；真实 Provider 待验收）

- 新聊天始终进入现有 `AiStreamingService` 检索路径，请求 DTO 不再包含 `retrievalEnabled` 字段。无 `ReadingContext` 时 PostgreSQL 查询按 owner、active chunks、embedding 非空及 Source 未软删除筛选；fallback 按 owner 与活动 Source 筛选，不额外要求 `READY`。提供 `ReadingContext` 时保留现有 scope：`AUTO` 当前文件沿用 `READY` 规则，显式 `SELECTED_SOURCES` / `SUBJECT` 沿用 owner、活动状态和 `READY` 校验。Spring mapper 会忽略额外未知 JSON 字段，因此历史 JSON 中的 `retrievalEnabled:false` 不会关闭检索；不保留兼容分支。
- 检索无命中时可继续生成并返回空 citations；embedding 配置缺失或 Provider 失败继续返回现有明确错误，不降级为无检索回答。普通配额与预算行为不变。
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

- Auth 提供已登录用户改密，不提供忘记密码/密码找回流程；注销通过 `DELETE /api/auth/me` 异步受理并返回 HTTP 202，当前没有可供用户查询作业进度的路由。
- 当前没有通用用户偏好同步 API 或完整数据备份/导出 API；PC 偏好保存在端侧，JSON 导出由 PC 汇总有限资源。
- Suggestions 保持确定性模板基线，真实 LLM、RAG 引用与质量评估仍按 `P1-Phase5-Suggestion-Quality` 开放登记。

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

### 2026-10-01 提问选中文本处理（代码与自动验证通过；真实 Provider 待验收）

- AiMessageCommand 增加可选顶层 selectionText（最大 4000 字符），非 null 时优先；空白取消引用，否则保留现行 readingContext 引用路径。AiStreamingService 将有效引用送入模型请求，不修改普通 USER 消息持久化内容或 citation。
- 引用作为当前请求的 USER 资料处理；聊天始终执行检索，既有资料范围、owner、READY 与请求回放规则保留。
- PromptAssembler 完整保留本次问题与引用，优先淘汰旧完整历史对。引用使用 USER 角色、固定 SYSTEM 说明将其视为资料；无法容纳必需内容时抛 VALIDATION_FAILED。AiController 在 SSE 开始前调用同一预算预检，返回 HTTP 400。
- Server clean focused 47/47、OpenAPI export 8/8、SDK 生成和一致性检查退出 0；未新增数据库/迁移/配置。真实 Provider 与 GUI 未验收，完整命令见 [实施记录](../plans/2026-10-01-chat-selected-text.md)。

### 2026-10-01 学习数据能力调整（整合验证中）

- 新增独立 `focus` 模块及 `POST /api/focus-sessions`，稳定 session ID 按用户幂等记录实际秒数和自然完成标记；Stats 暴露历史全时及每周每日专注秒数/完成轮次，不改变复习事件的 studySeconds。
- ai 模块新增完整 Overview results GET/PUT、整体及分项版本、Subject 来源 manifest 校验和独立精确回放 receipt；当前 owner/READY/revision/活动状态围栏覆盖读取、写入及重试。生成接口继续无状态，不自动保存中间结果。提交后发布 `OVERVIEW_UPDATED`，不扩展核心资源 Sync。
- KnowledgeBlock DTO/Entity/Service 删除 summary/tags，Suggestion 的正文输入读取 content；保留 Suggestions 服务端接口和 PC 暂藏策略。追加 V26 专注、V27 成果/回执、V28 摘要/标签删除迁移，账户物理清理包含新增三表。
- API、数据结构及执行证据见 [API](../contracts/API.md)、[Database](../contracts/Database.md)、[实施计划](../plans/2026-10-01-pc-learning-data-cleanup-and-sync.md)。本轮未部署运行服务或执行生产迁移。

2026-09-27 PC/Service 风险修复：Sync pull 对省略/零 cursor 也使用用户独立高水位和最早保留日志识别清理缺口；Subject Overview 在转换 outline 引用前先建立所有请求 Source 别名；Source Overview 同一进程内以 owner/source/revision/title/mode/instruction 合并进行中生成。TEXT/URL 解析输入变更轮换 Source ingestion revision，新旧修订使用不同 job；Source 与对应 job 在同一事务持久化，失败整体回滚；恢复处理中的 TEXT/URL Source 时按当前 revision 补建或复用 job。worker 的结果及失败写入按 revision、job/generation、attempt 与锁后新鲜时钟的有效 lease 栅栏化，成功的 Source/chunks/job 在短事务内提交。Server clean 聚焦 114/114、PostgreSQL pgvector 2/2 通过；跨服务实例 Overview 去重、真实 Provider/运行服务尚未验收。

2026-09-26 AI 显式检索范围补充：聊天 `ReadingContext` 保留既有 `AUTO` 当前 Source 行为，并支持用户显式选择的 Source ID 集合或全学科范围。检索前验证活动 Subject 属于当前用户；显式 Source 必须属于当前用户及该 Subject 且为活动 READY 状态，结果不得扩展到未选 Source。定向 `AiRetrievalTests` clean 12/12、`ArchitectureTests` 1/1 通过；真实 PostgreSQL/pgvector、Provider 和 GUI 尚未验收。

2026-09-26 Source/RAG 修复：PostgreSQL pgvector 检索仍在 LIMIT 前过滤软删除 Source；H2/fallback 现先按 owner 批量解析活动 Source 再排序/TopK，删除 Source 的旧 chunk 不占有效引用名额。Source 列表、分页和含删除项列表的 Asset size 改为 owner-scoped 批量加载；Retrieval citation 复用一次批量 SourceView 查询，不再逐条 `sourceService.get()`。SourceView 排序、Asset 大小、citation 内容及 generation 语义不变。focused clean 8/8、PostgreSQL 17/pgvector 2/2；真实业务数据与负载性能未验收。

2026-09-26 注销运行验收：用户重建后提交的指定账号作业已于 `06:50:10.172777 UTC` 达到 `COMPLETED`，`last_error=NULL`，用户行和该用户归属的 21 张清理表记录均已清空，本作业对象键记录为 0。此证据确认数据库清理链路，MinIO 对象与当时 HTTP/GUI 响应未单独验收。

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

更新时间：2026-10-11

文档状态：旧 Server 代码已归档；绿地重写阶段 5 AI/RAG 基线及 PC Tauri S1–S6 ParsedDocument schema/upload-intent/payload validator/complete 首胜/block indexing/cleanup 已实现；V16 阅读会话 scope、完成历史 Prompt、readingContext 当前 Source 检索和同学科确定性升级已实现；R1 已完成 pgvector、请求并发保留、会话恢复键和受控流式验证；Subject 专属颜色已由 V19 移除并在本地 PostgreSQL 升级验证，整体仍待真实 Provider 与外部验收

权威范围：Auralis-Server 当前实现、绿地目标模块边界、运行配置、验证命令和阶段状态。

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
| ai | 模型配置、BYOK、Provider、Conversation、RAG、Suggestions、阅读 scope、无状态结构化总览 | 阶段 5 后端基线及 V16 阅读会话/Prompt/当前 Source 检索/同学科升级已实现；Source/Subject overview 定向测试通过；待真实 Provider 与业务验收 |
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

创建、更新、删除和恢复统一执行 `baseVersion`、userId 隔离和软删除语义；Subject、KnowledgeBlock、Task 列表使用不透明 keyset cursor 和 `limit`（默认 100、最大 200），返回稳定 `nextCursor`/`hasMore`。Task 排期创建、更新、恢复和换位在事务中先悲观锁定所属 User 行，再按既有 Subject→Task 顺序加锁，以序列化同一用户跨学科的排期写入；通过 TaskService 进入的 REST 与 Sync 写入共用该锁。服务端按 `[scheduledAt, scheduledAt + durationMinutes)` 检查同用户所有未取消、未删除 Task，首尾相接允许，`durationMinutes=null` 按 30 分钟比较；update 排除自身，restore 检查恢复后的区间，swap 同时排除双方旧行并校验双方新区间互不重叠且不冲突于第三方。冲突返回 `VALIDATION_FAILED`，Sync 将该 mutation 记为 `REJECTED`，不会部分写入。Task 创建、恢复、排期/有效时长/截止时间变化及取消后重新进入活动排期时，若排期与截止均存在，必须满足 `scheduledAt + effectiveDurationMinutes <= dueAt`，恰好结束允许，无截止不限制。仅标题、备注或状态变化且有效时间值相同的历史越界排期仍可保存（包括自动 DONE），空时长与显式 30 等价；不批量改写旧数据。V23 移除历史排期顺序 CHECK，本轮由领域服务校验，不新增数据库约束或迁移。Task 换位仍以稳定 UUID 顺序获取两个悲观锁，在一个事务中校验版本及换位结果；任一失败均回滚，避免半交换。无法反序列化为 `Instant` 的请求字段由 Problem Details `400 VALIDATION_FAILED + fieldErrors` 返回，而非未处理 500。KnowledgeBlock 的 `sourceId` 现在校验同用户活动 Source；Source 删除通过 shared 事件级联软删除 Relation。

`POST /api/tasks/schedule-insertions` 在不含 `targetTaskId` 时将 Task 插入普通时间槽并顺延发生区间冲突的后续 Task，保留未冲突的空档；含目标 ID 时按本文件最新主体规则严格放置。该请求携带被拖 Task 的 `baseVersion`、目标 `scheduledAt` 及当天 `windowStartAt`/`windowLastStartAt`（08:00 和 22:30 对应的 UTC instants）；服务端按窗口起点向上取整到半小时槽。完成 Task 固定、取消 Task 不占用时间，若需要移动完成 Task 或顺延超出窗口则整体拒绝；被拖任务及全部实际顺延任务均检查新结束时间不晚于各自截止时间；任一超限整组拒绝，校验先于所有任务保存，版本及时间保持原值。所有实际改时的 Task 各增加一次版本并发布普通 `UPDATE` 变更，HTTP 200 响应只返回实际变化的 Task；原子写入失败不保留任何部分变更。REST 路由保留；PC Timeline 使用 `SCHEDULE_INSERTION` inbound Sync 命令承载同一请求语义，离线与在线均经单条幂等 mutation 调用该事务。`SCHEDULE_SWAP` 同样承载双方 Task ID 和 baseVersion，通过现有原子换位事务执行。排期命令类型仅用于 inbound mutations，change log 仍记录每个 Task 的普通 `UPDATE`。

排期命令 payload 的源 Task ID 与源 `baseVersion` 必须分别等于外层 mutation 的 `resourceId` 和 `baseVersion`；换位命令还必须提供目标 Task ID 与 `targetBaseVersion`。缺少必填目标字段或源身份不一致时抛出 `VALIDATION_FAILED`，由 Sync 将该 mutation 的拒绝结果幂等保存，拒绝快照也按外层源 ID 读取。客户端以完整当前 Task 数组原子结算，可接收服务端返回的额外顺延 Task，并在整批检查未解决命令、版本回退和墓碑后合并。

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
- Spring MVC converter 与所有 Auralis 自有生产/测试源码统一使用 Jackson 3 的 `tools.jackson` 命名空间；JSON object payload、流式 ParsedDocument 校验、WebSocket、Review 持久化和 Provider HTTP 均不混入 Jackson 2 类型。`JacksonNamespaceGuardTests` 会阻止重新导入 `com.fasterxml.jackson.*`。
- 当前持久化使用 Spring Data JPA + Flyway V1–V15；R1-03 的 pgvector 写入/检索通过 JDBC repository 接入，H2 保留 JSON fallback。V15 追加 PC Tauri ParsedDocument 派生表、Source ingestion revision、FILE 状态约束和 ingestion job 关联字段；ParsedDocument 不进入同步表。S3 已实现 `/api/sources/{sourceId}/parsed-documents/upload-intents`，仅按 owner/revision 创建 `UPLOADING` 派生记录并向现有 `AssetStoragePort` 请求限定 MIME/checksum/size 的私有签名。
- 目标数据库使用 PostgreSQL 17 + pgvector；V9 创建 vector(1024)/HNSW，V10 提供 generation cutover，V11 回填历史 JSON embedding。
- 后续对象存储使用 MinIO。
- 新工程移除 MyBatis Plus、运行时 DDL、Redis、Milvus、etcd、旧 JJWT 配置、统一 Result 和 encryptedPayload。

## 配置与安全边界

阶段 1 绑定身份 token TTL 和 JWT secret 配置；local/test 缺少 secret 时生成进程内随机密钥，prod profile 缺少 `AURALIS_JWT_SECRET` 必须启动失败。提交文件不得包含真实密码、JWT secret、BYOK key、AI key 或 refresh token。

后续生产配置必须从环境变量读取数据库、MinIO、JWT、BYOK、DeepSeek、SiliconFlow 和 CORS 值；生产 profile 对缺失的关键配置执行 fail-fast。所有业务 Repository 必须在查询中带当前 userId；日志过滤 Authorization、Cookie、refresh token、BYOK key、完整 prompt 和模型回复。

AI 运行时使用结构化事件名输出可观测性：`AI_STREAM_*` 记录用户消息保留、Provider 选择、成功/中断/失败与耗时，`AI_EMBEDDING_*`/`AI_RETRIEVAL_SUCCESS` 区分向量化和检索阶段，`AI_PROVIDER_HTTP_*` 记录上游 host/path、解析地址数量、请求/响应字节数、SSE 行数、状态和耗时，`AI_SETTINGS_RESOLVED` 标记 BYOK 或 `ENV_DEFAULT` 来源。除 Overview 失败事件外，其它既有失败事件额外记录原始异常类名、单行截断后的 message 及 root cause 类名/message；Authorization、API key、token、secret、password 和 URL query 会脱敏。OpenAI-compatible completion 在响应 envelope 缺少有效文本 content 时记录 `AI_PROVIDER_RESPONSE_INVALID`，仅包含 provider、清洗且最多 64 字符的 modelId、choiceCount、allowlisted finishReason、content/reasoning 类型和字符数、usage/token 数量，不包含 prompt、响应正文、endpoint URL 或 key。资产直传和 Source 登记分别输出 `ASSET_UPLOAD_INTENT_*`、`ASSET_UPLOAD_COMPLETE_*`、`ASSET_UPLOAD_READY`、`ASSET_UPLOAD_REJECTED` 和 `SOURCE_CREATED`，可区分凭证申请、浏览器直传后的 HEAD 校验和登记阶段。未预期 HTTP 异常固定输出 `UNEXPECTED_API_ERROR`，携带 trace ID、HTTP 方法、无 query 的路径、异常类型和堆栈，响应仍保持脱敏的 Problem Details。日志只输出 UUID、host、模型、数量、长度、状态和稳定错误码，不输出完整 prompt、模型回复、文件内容或响应体；Overview 失败事件的 allowlist 见下文。

## 阶段 2B 实际 HTTP 表面

- Asset：`POST /api/assets/upload-intents`、`POST /api/assets/{id}/complete`、`POST /api/assets/{id}/download-url`；upload intent 要求用户范围的 `clientImportId`，通过数据库唯一约束和事务竞态重载实现幂等创建；同 key immutable metadata 冲突稳定返回 409 `MUTATION_REJECTED`，不同用户相互隔离。AssetStoragePort 提供 test 适配器与配置启用的 MinIO 适配器。
- Source：`POST/GET /api/sources`、`GET/PUT/DELETE /api/sources/{id}`、`POST /api/sources/{id}/restore`、`POST /api/sources/{id}/reingest`。
- Relation：`POST/GET /api/relations`、`GET/PUT/DELETE /api/relations/{id}`、`POST /api/relations/{id}/restore`。
- Source 的 ingestion worker、Tika 解析和 source_chunks/pgvector 已在阶段 5 后端基线接入；Source/Relation 列表同样使用稳定 keyset cursor；真实 MinIO、完整 PostgreSQL 门禁和生产分页性能仍不在本阶段验收范围。

Source 删除是可恢复的软删除：`AssetRetentionCleanupService` 默认保留 30 天，按小时扫描过期 Source 并物理删除对应 MinIO 对象；Asset 与 Source 元数据不硬删除，Asset 改为 `ORPHANED` 以保留审计和 KnowledgeBlock 外键可追溯性。可通过 `AURALIS_UPLOAD_ASSET_RETENTION_DAYS`、`AURALIS_UPLOAD_ASSET_CLEANUP_DELAY_MILLIS` 和 `AURALIS_UPLOAD_ASSET_CLEANUP_INITIAL_DELAY_MILLIS` 调整保留期与调度频率。

## 阶段 3/4 实际 HTTP 表面

- Sync：`POST /api/sync/push`、`GET /api/sync/pull`、`GET /api/sync/snapshot`；SyncService 校验活动设备，SyncMutationProcessor 在独立事务内原子完成幂等占位、领域命令、change log 和最终结果，并提供高水位不回退的不透明 cursor；snapshot 包含必要墓碑。`SyncRetentionService` 按配置定时清理 30 天外日志/幂等记录，保留高水位并记录清理与 reset 指标；scheduled 入口自身建立事务，避免同 Bean 调用绕过 `purgeExpired()` 的事务代理。
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

- `ai` 模块通过 `AiProviderPort`、`EmbeddingProviderPort` 与统一的 `ProviderHttpClient` 适配 OpenAI-compatible/DeepSeek 聊天和 SiliconFlow embedding；Provider URL 使用 HTTPS 精确 allowlist、DNS 公网地址过滤与固定地址连接（混合解析结果只连接公网地址，全部为私网时拒绝），重定向关闭，并受超时/响应体上限约束。Provider client 将连接超时（`AURALIS_AI_PROVIDER_CONNECT_TIMEOUT_MILLIS`，默认 3000ms）与 response/read 超时分离；普通非流式 completion、stream、embedding 使用 `AURALIS_AI_REQUEST_TIMEOUT_MILLIS`（默认 10000ms），Overview 通过 `AiProviderPort` 的显式 timeout overload 使用 `AURALIS_AI_OVERVIEW_RESPONSE_TIMEOUT_MILLIS`（默认 120000ms，配置边界 60000–120000ms）。固定地址 TLS Socket 只使用连接超时。`SocketTimeoutException` 映射为 `MODEL_TIMEOUT`，由 API 返回 HTTP 504；其它 IOException 仍映射 `MODEL_UNAVAILABLE`/503。运行时凭据解析遵循“当前用户有效 BYOK → 服务端 env 默认 Provider”顺序；默认聊天 Provider 由 `AURALIS_AI_DEFAULT_PROVIDER` 决定，默认凭据使用 `DEEPSEEK_API_KEY`、`OPENAI_API_KEY`、`SILICONFLOW_API_KEY` 及对应模型/Base URL 配置。BYOK 使用 AES-GCM，日志、异常、DTO 与凭据 `toString()` 不回显 key。
- ingestion 由 Source 提交后事件触发，`IngestionJobService` 做用户/Source 归属和活动任务去重，并通过数据库锁定的 claim-next 分配租约；条件化 `IngestionWorkerScheduler` 自动轮询，lease 过期可恢复，失败按最大次数回到 PENDING，耗尽后进入 FAILED。`IngestionWorker` 负责解析、固定大小重叠切块、1024 维 embedding 和 chunk 替换。
- `RetrievalService` 只查询当前 userId 的活动 generation chunks。PostgreSQL 通过 `PgVectorRetrievalRepository` 执行带 user/source/active/deleted 过滤的 pgvector cosine SQL，由 HNSW 索引支持 top-k；非 PostgreSQL 环境使用活动 chunk 的 JSON cosine fallback。`SourceChunkService` 使用 generation 写入新 chunks，事务成功后切换 active，失败保留旧 generation。
- Conversation/Message 服务提供 owner-scoped CRUD、软删除、`@Version` 会话版本、写锁保护的消息序号、会话和 USER 消息的 `clientRequestId` 幂等回放及安全错误/断流状态持久化。流式请求先在短事务中锁定会话并保留唯一 USER 消息，Provider I/O 不持有数据库事务；assistant 以 `reply_to_message_id` 精确关联该 USER 消息。SSE 使用 Spring MVC，不引入 WebFlux；Controller 通过 sink 直接转发 Provider 增量，OpenAI-compatible 上游 SSE 解析为 `message.delta`，检索命中转为可回链 `citation` 事件。
- Suggestions 当前是类型化、可替换的确定性输出层，已完成 KnowledgeBlock owner check，但尚未接入真实 LLM 生成或 RetrievalService citation 组装。
- `POST /api/ai/source-overviews` 与 `POST /api/ai/subject-overviews` 是不创建持久作业的结构化生成边界，默认 JSON、可选 SSE。前者经 `SourceService` owner/active/READY 校验后只通过 active 定向查询读取 ai 模块中的 chunks，并按完整 `auralis.ai.max-prompt-chars` prompt 长度分批归纳、分层归并且每次调用前精确检查上限；后者 owner-check Subject，并验证每个输入 Source 归属该 Subject、无重复且按 mode 有可用 part。服务端为模型分配短 alias，固定 SYSTEM 与独立 USER 数据隔离，map/reduce 全程只保留 alias；输出仅接受一个 JSON object/JSON fenced block，经数量、长度、alias 和 mode nullability 校验，当前无可信页码/block alias 因而强制 `locator=null`，仅最终响应回映射真实 Source UUID。Provider 输出解析/结构错误统一为 `502 MODEL_PROVIDER_ERROR`，客户端输入仍为 `400 VALIDATION_FAILED`。它们重用 `AiSettingsService`、`AiProviderRegistry` 和 `AiProviderPort.complete`，不创建 Conversation/Message，不写 sync/change log，也不新增数据库 schema、表或 Flyway migration；PC 先保存本地派生结果，再通过独立 Overview results GET/PUT 持久化完整成功产物；生成接口本身仍保持无状态。Overview 请求可携带 `X-Overview-Request-Id`；服务端将其规范为 UUID（非法或含敏感内容时生成新 UUID），为每次 user/source/revision 生成 `generationId`，并按 MAP、REDUCE、JSON_PARSE、SCHEMA_VALIDATE、CACHE_RETURN 输出阶段；失败日志只记录规范化 `requestId`、关联字段、阶段、allowlisted `errorCode`（DomainException 或六类已知 AiUsageLimitException code；未知码为 `OVERVIEW_GENERATION_FAILED` 回退）及 exception/cause 类型，不记录原始 exception/cause 文本或 throwable stack。
- `CACHE_RETURN` 仅是 alias 映射/返回前的诊断阶段，不读取或持久化结果；`X-Overview-Request-Id` 也只做日志关联。Provider 成功但 HTTP 响应未到达 PC 时，客户端尚未执行独立 Overview results PUT，之后手动重新生成会创建新 request/generation ID、再次调用 Provider 并单独结算用量。当前 Controller 同时提供默认 JSON 和明确 opt-in 的 SSE；对不支持的 Accept，`HttpMediaTypeNotAcceptableException` 返回 HTTP 406 `NOT_ACCEPTABLE` Problem Details，不归类成 500。
- Task 14（2026-09-09）：Source ingestion 的 `PARSING`、`PENDING`、`INDEXING`、`READY` 和 `FAILED` 状态及安全失败诊断统一经 `SourceService` 实际持久化后发布既有 `SOURCE/UPDATE` 事件；重复相同状态/诊断不写版本或 change log。ParsedDocument complete 在保持外层事务和 Source 锁的前提下通过该入口转入 `INDEXING`；接受后的异常会将 document、Source、job 和 change-log 一并回滚，预校验失败仍持久化 `REJECTED`。
- S1 已通过 `V15__tauri_parsed_document_schema.sql` 冻结 `parsed_documents` 的 owner/source/revision、parser/normalization/OCR model、Asset/payload/plain-text SHA、私有 object key、status、generation 和生命周期字段；历史非 READY FILE 在迁移时进入 `AWAITING_CLIENT`，已有 READY FILE 与活动 chunks 保持不变。S2 已让 FILE create/Asset 替换/reingest 等待客户端解析并停止发布旧 ingestion event，TEXT/URL 保留服务端 event；S3 已实现 owner-scoped upload intent，S4 已实现有界 gzip/JSON/ordinal/hash validator 与 legacy Asset SHA 条件回填；S5 已在 Source 行锁内完成 complete 首胜、同 payload 幂等、冲突/过期错误和唯一 revision job 关联；S6 已让带 ParsedDocument 的 worker 消费重新验证后的 blocks、隔离旧 revision/generation、兼容 reingest 复用 accepted 结果，并由 cleanup scheduler 删除过期 payload 对象且保留元数据。

阶段 5/R1 自动验证：H2/JPA/MockMvc/Stub Provider/架构及受控网络测试覆盖 AI 基线；R1 定向套件验证 V14、会话重试、并发同请求仅一次保留和流式回放；overview focused MockMvc/service 测试覆盖请求界限、owner/READY/active 定向查询、mode/part、重复 Source、精确分层 prompt、alias-only map/reduce、SYSTEM/USER 注入隔离、locator、fenced JSON、Provider 502 与不可信 JSON/alias/node 输出；S1 `ParsedDocumentSchemaTests` H2 clean/upgrade 4/4、S3 `ParsedDocumentControllerTests` 3/3、S4 `ParsedDocumentValidatorTests` 4/4 与 `AssetShaBackfillTests` 2/2、S5 `ParsedDocumentCompleteTests` 3/3、S6 `AiIngestionWorkerTests` 5/5、`AiSourceChunkTests` 3/3、`ParsedDocumentCleanupTests` 2/2 通过，PgVector upgrade 断言已补充但本机 Docker 不可用。此前默认 `mvn -B -ntp clean test` 的 PostgreSQL 17/pgvector 与 MinIO 容器证据仍保留；AI 日志脱敏与生命周期定向测试 26/26 通过。真实 Provider、性能和前端联调仍未完成。
### 2026-09-15 Overview 最小 JSON 诊断（临时）

为复核真实 DeepSeek 最终 `JSON_PARSE` 失败，Provider 在最终已序列化的请求体发送前，仅对识别为 Overview 阶段的 structured JSON 请求记录 `AI_JSON_MODE`：`structuredJson=true`、`responseFormat=json_object`、`maxTokens` 与由预算推导的 `stage`。Overview FINAL 在既有 validator 前使用同一 Jackson `ObjectMapper.readTree` 直接检查原始 `message.content`，记录 `FINAL_JSON_CHECK` 的合法性、字符数、行列号和异常类型；该检查不做 fence stripping 或其它预处理，因此 fenced JSON 会记录为 `valid=false`，不代表后续既有 validator 一定拒绝。不记录请求体、prompt、响应正文、原始异常 message、URL 或凭据。诊断失败不会吞掉或改变既有 Provider 输出错误映射；普通聊天/流式不变。自动测试已覆盖 DeepSeek FINAL wire body 日志、multi-batch 最终调用边界、合法/非法/fenced FINAL 检查和日志脱敏；未部署，真实请求待用户重跑。
