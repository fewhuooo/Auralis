# AI 用量预算、并发保护与 Provider 资源隔离设计

更新时间：2026-09-14

文档状态：阶段 1/2 与个人中心额度已实现并通过相关自动验证；阶段 3 与真实环境验收独立

权威范围：Auralis Server 所有外部 AI Provider 调用的统一入口、单次与任务预算、并发限制、小时/每日配额、用量结算、后台任务退避，以及与 HTTP/数据库资源隔离相关的设计决策

### 2026-10-12 embedding 额度排除与测试默认值

用户明确要求 embedding 不计额度，并放宽单人额度测试。当前策略按 `INGESTION_EMBEDDING` / `RETRIEVAL_EMBEDDING` 排除用户小时 / 日和系统日 token 窗口及本人额度展示，覆盖历史已结算和在途记录；原 reservation、actual / charged 审计、未知 usage 语义均保留。新 embedding 不因窗口已满或已超额被额度拒绝，账户 / 并发 / task 资源预算 / 调用次数 / UTF-8 字节限制仍可拒绝。聊天、Overview 和生成连接测试继续计量，不按 Provider 或模型名称一并豁免。

单人默认值更新为 1000000 / 小时、2000000 / 日（均 10 倍），系统 2000000 / 日及并发 4 / 2 保持。下文旧阶段背景和初始任务预算为设计历史，现行 stage 统计与验证、运行态边界以 [本轮策略计划](../plans/2026-10-12-embedding-quota-exemption-and-test-limits.md) 为准。

### 2026-10-10 实施准备校正

当前源码已使用 Overview 中间/最终输出上限 `4608/6144`，PC 请求窗口为 `300000ms`；`IngestionWorker.process` 已没有包住 Provider I/O 的方法级事务。下文背景及初始表中的 `1024/4096`、PC `60 秒` 和外层事务描述是设计时基线，不能作为恢复当前实现的依据。完整持久配额范围仍为已批准设计，实施前必须按当前 MAP/REDUCE 与合法 ingestion 字节上限重新校核任务预算/调用次数；本轮共通修复和范围状态见 [2026-10-10 实施记录](../plans/2026-10-10-ai-important-fixes.md)。

### 2026-10-10 B 范围确认与个人中心额度追加

用户明确选择实施 B，并要求额度显示在现有个人中心。本轮落实阶段 1/2，并增加当前账号 `GET /api/ai/usage` 与 PC/Mobile/Tablet 个人中心显示；不扩展阶段 3 的异步 Overview。实施边界、校准后的初始任务预算、完整任务 lease、活跃续租、ingestion 额度中断后持久续做与单调 claim/独立 failure 次数见 [本轮 B 计划](../plans/2026-10-10-ai-usage-guard-b.md)。以下初始策略表中旧任务数值以该计划的当前值为准；小时/日开发额度仍使用原批准默认值，可配置覆盖。

个人中心展示本人小时/今日的 limit、已结算 charged、在途 reserved、remaining 与 resetAt；以 token 为单位，重置时间按当地时区展示。缺失 Provider usage 时 charged 为保守估算；不显示金额或他人/全局额度。加载/失败状态明确，不以零模拟未读取，账号切换及迟到返回须隔离。

2026-10-11 实现校正：准入、预留与派发标记在账本锁前锁定真实 ACTIVE users 行；标记作为派发授权点，Provider I/O 在事务外。成功接受与 owner/lease 校验原子结算；heartbeat 对已完成调用只续 TASK。请求/任务硬预算拒绝终态失败，配额等待才延期；AI 模块 advice 处理额度异常，沿现行 UNAUTHENTICATED 处理停用账号。最终代码/迁移/审查及未覆盖范围见 B 计划，下文保留原设计时背景。

## 背景

文件 Overview 已为中间与最终生成分别设置 `1024` 和 `4096` 输出 token 上限，但该限制只约束单次模型输出。一个文件 Overview 可能执行多次 MAP 和多轮 REDUCE，聊天还未设置显式输出上限，Source ingestion 会把一个文档的全部 chunks 一次提交给 embedding Provider。现有代码没有统一的任务累计预算、用户配额或 Provider 并发闸门。

现有 `ConversationService.ClientRequestReservation` 只负责以 `clientRequestId` 保留聊天 USER 消息并防止相同客户端请求重复调用 Provider，不代表 token 用量预留。数据库 `messages.usage_json` 已存在，但当前聊天链路没有写入实际或估算用量。非流式 completion 能读取 Provider 返回的 `prompt_tokens` 与 `completion_tokens`；流式聊天和 embedding 尚未形成统一 usage 结果。

资源层面，Overview 同步端点会在请求生命周期内等待一次或多次最长 120 秒的 Provider 调用；PC `aiRequest` 当前总超时为 60 秒。聊天使用 Spring MVC `StreamingResponseBody`，但应用尚未显式配置有界异步执行器。`IngestionWorker.process(userId, jobId)` 还存在外层 `@Transactional` 路径，可能在 embedding 网络等待期间持有数据库事务。

因此本设计同时解决两类问题：

1. 控制 AI 请求的单次、任务、用户和系统成本上界。
2. 限制 Provider 阻塞占用的应用线程和数据库资源，避免 AI 故障扩大为普通 API、同步或预览链路不可用。

## 当前调用面

当前生产代码实际存在四类外部 AI 调用：

| 功能 | 调用方 | Provider 类型 | 当前限制 |
| --- | --- | --- | --- |
| 聊天生成 | `AiStreamingService` | Chat completion stream | prompt 字符上限；输出无显式 `maxTokens` |
| 聊天 RAG 查询 | `AiStreamingService.retrieve` | Embedding | 单条用户内容；无统一 token/并发配额 |
| 文件与学科 Overview | `OverviewGenerationService` | Chat completion | 单次 prompt 字符上限；中间/最终输出上限；无任务累计预算 |
| Source ingestion | `IngestionWorker` | Embedding | ingestion 字节上限；全部 chunks 一次请求；无任务累计预算 |

`SuggestionService` 当前是确定性后端基线，没有调用外部模型，不纳入 Provider 并发和 token 结算。未来一旦改为模型生成，必须先接入本设计的统一入口。

## 目标

1. 所有外部 AI 调用必须经过一个可审计、可测试的统一 gateway。
2. 每次请求在发往 Provider 前完成输入、输出、请求体和 deadline 检查。
3. 一个业务任务包含多次 Provider 调用时，累计消耗不得超过任务预算和最大调用次数。
4. 限制系统、用户和功能维度的同时在途 Provider 调用；交互请求不在应用线程中无限排队。
5. 持久化小时与每日 token 配额，使重启和多实例不能绕过限制。
6. 成功、失败、超时、断流和进程异常都具有保守、幂等的用量结算语义。
7. Provider 网络等待不得长期持有数据库事务。
8. AI Provider 阻塞时，普通 Source、Asset、Sync 和预览相关 API 仍保有可用执行资源。
9. 保持 BYOK、Provider endpoint allowlist、DNS 固定和敏感日志边界不变。

## 非目标

- 本设计不建立套餐、支付、账单或用户购买配额能力。
- 首版不提供面向用户的完整用量统计页面。
- 不以精确价格计算替代 Provider 账单；Auralis 记录 token 和请求状态，不维护模型价格表。
- 不用自动重试绕过配额、并发或任务预算拒绝。
- 不将 Redis、外部队列或新的独立微服务引入当前单体架构。
- Usage Guard 不能单独证明既有预览 `Failed to fetch` 已修复；该故障仍需受控阻塞复现和端到端证据。
- 持久化异步 Overview generation 是推荐的后续阶段，不作为首版 Usage Guard 的必要条件。

## 方案比较

### 方案 A：各业务 Service 独立限制

聊天、Overview 和 ingestion 分别维护计数器、token 估算与错误码。改动表面较小，但策略容易漂移，新功能也可能绕过限制，无法可靠实现用户小时/每日总配额。该方案不采用。

### 方案 B：在 `ProviderHttpClient` 统一限制

HTTP client 能看到序列化请求字节，但不知道当前 user、业务 feature、task key、MAP/REDUCE 阶段或预期最大输出。把业务身份下沉到安全 transport 还会混淆 SSRF/TLS 与用量策略职责。该方案只适合继续承担请求/响应字节硬上限，不作为 Usage Guard 主入口。

### 方案 C：统一 `AiInvocationGateway` 与持久 reservation

业务调用方提供明确的调用上下文，gateway 在进入现有 Provider registry 前完成用量预留、并发判断、调用和结算。PostgreSQL reservation 保证跨重启、跨实例的一致性；架构测试禁止业务层绕过 gateway。

本设计采用方案 C。首版先完成统一入口、调用/任务预算、并发保护、usage 采集和资源隔离；持久小时/每日配额与同一套 reservation 模型一起落地，避免先建立一套仅 JVM 有效、随后再替换的数据语义。

## 总体架构

```text
AiStreamingService / OverviewGenerationService / IngestionWorker
                              |
                              v
                    AiInvocationGateway
                              |
             +----------------+----------------+
             |                                 |
             v                                 v
       AiUsageGuard                     Provider Registry
  policy/reserve/settle              chat / embedding adapter
             |                                 |
             +---------- actual usage --------+
             |
             v
       PostgreSQL usage ledger
```

### 统一调用上下文

每个 Provider 调用必须携带：

```java
AiCallContext(
    UUID userId,
    AiFeature feature,
    String taskKey,
    AiStage stage,
    AiProviderType provider,
    String model
)
```

首版 `AiFeature` 固定为：

- `CHAT`
- `SOURCE_OVERVIEW`
- `SUBJECT_OVERVIEW`
- `INGESTION`

首版 `AiStage` 固定为：

- `CHAT_COMPLETION`
- `RETRIEVAL_EMBEDDING`
- `OVERVIEW_MAP`
- `OVERVIEW_REDUCE`
- `INGESTION_EMBEDDING`

`taskKey` 不包含原始正文或 prompt：

- Chat：USER message ID。
- Source Overview：稳定的 `userId + sourceId + ingestionRevision + mode + instructionHash` 摘要键；日志只记录服务端 generation ID 或摘要后的键。
- Subject Overview：`userId + subjectId + mode + inputFingerprint + instructionHash` 摘要键。
- Ingestion：ingestion job ID 与 generation。

### Gateway 边界

`AiInvocationGateway` 对业务层暴露 completion、stream 和 embedding 三种操作。业务 Service 不再直接取得 `AiProviderPort` 或 `EmbeddingProviderPort`。

现有 Provider adapter、endpoint policy、固定 DNS 地址、TLS 和 `ProviderHttpClient` 保持独立。增加架构测试，限定只有 gateway 所在包和 provider adapter 包可以直接引用 Provider registry/port。

## 预算模型

### 单次请求预算

调用前检查以下硬边界：

- 序列化后的请求 UTF-8 字节数；
- 估算输入 token；
- 非空且不超过策略上限的 `maxTokens`；
- embedding 单批文本数量、单条字节数和批次 token；
- 当前任务剩余 deadline。

字符数不能作为跨语言 token 的硬等价。首版采用双重保护：UTF-8 请求字节是不可绕过的硬上限，token estimator 用于预留和配额。Estimator 必须对中文、英文、组合字符和 Emoji 做保守估算，并为消息角色/结构增加固定 overhead。Provider 返回实际 usage 时以实际值结算；无法获得 usage 时保留估算费用。

输入超过单次硬限制时，在调用 Provider 前返回 `AI_REQUEST_BUDGET_EXCEEDED`。该错误不应被自动重试。

### 任务累计预算

一次业务任务可包含一个或多个 Provider 调用。每次调用预留：

```text
reservedTokens = estimatedInputTokens + maxOutputTokens
```

调用完成后，若得到可信 Provider usage，则按实际 input/output 结算并释放未消费预留；没有 usage 时按保守估算结算。下一次调用前重新检查同一 `taskKey` 的累计 `charged + activeReserved`。

除 token 外，每个任务必须有 `maxProviderCalls`，防止异常循环通过大量小请求绕过 token 保护。Overview 的 MAP 和 REDUCE 共用一个 task budget；聊天的 retrieval embedding 与 completion 共用一个 Chat task；ingestion 的多个 embedding batch 共用一个 job task。

### 小时与每日配额

预留事务同时检查：

- 当前用户小时配额；
- 当前用户每日配额；
- 系统全局每日配额；
- 可选的 feature 小时/每日覆盖值。

时间窗口使用服务端 `Clock` 和 UTC 整点/自然日边界，返回值提供明确的下一次可用时间。配置和响应可显示 reset time，但日志、指标 tag 和 API 响应不得包含 Provider key 或用户正文。

## 并发与调度语义

### 并发维度

每个调用在 Provider I/O 前检查：

- 全局在途调用数；
- 当前用户全部 AI 在途调用数；
- 当前用户当前 feature 在途调用数；
- 同一 task key 是否已有互斥执行。

交互式 Chat/Overview 不在 Servlet 或 MVC async executor 中等待空位。没有并发配额时立即返回 `AI_CONCURRENCY_LIMIT`，并附带有界 `Retry-After`。

Source Overview 的稳定 task key 同时关闭现有同一 user/source/revision/mode 的 Server 端并发生成窗口。首版无 Server 结果缓存，第二个相同请求只得到“处理中”拒绝，不回放另一个客户端才能持有的 PC 本地结果。

### 后台 ingestion

Ingestion 遇到 `AI_CONCURRENCY_LIMIT`、小时/每日配额耗尽时不得进入 `FAILED`，也不得增加正常 Provider 失败 attempt。任务应回到可延期状态，并记录安全错误码和下一次允许领取时间。

现有 `lease_until` 只表达已 claim worker 的租约，不能同时承担延期调度语义。持久化实现应为 ingestion job 增加独立 `next_attempt_at`，claim query 只选择该字段为空或已到期的 `PENDING` job。

## 持久化设计

### `ai_usage_locks`

用于提供短事务内的确定性锁顺序：

| 字段 | 语义 |
| --- | --- |
| `scope_type` | `GLOBAL` 或 `USER` |
| `scope_key` | 全局固定键或 user UUID 字符串 |
| `created_at` | 审计时间 |

迁移预置唯一 `GLOBAL` 行。预留事务先锁 GLOBAL，再确保并锁定 USER 行，所有调用遵守相同顺序，避免死锁。当前全局 Provider 并发较低，单个短事务全局锁可以接受；若未来吞吐显著提高，再通过 bucket 行拆分，不在首版预优化。

### `ai_usage_reservations`

| 字段 | 语义 |
| --- | --- |
| `id` | 调用 reservation UUID |
| `user_id` | 所属用户，外键级联删除 |
| `feature` / `stage` | 功能与调用阶段 |
| `task_key_hash` | 不含正文的稳定 SHA-256 |
| `provider` / `model` | 调用归因 |
| `state` | `RESERVED`、`COMPLETED`、`FAILED`、`RELEASED`、`EXPIRED` |
| `estimated_input_tokens` | 调用前估算输入 |
| `reserved_output_tokens` | 调用前输出预留 |
| `actual_input_tokens` / `actual_output_tokens` | Provider 返回时记录，可空 |
| `charged_tokens` | 配额最终计费 token |
| `request_dispatched` | 是否已进入实际出站发送边界 |
| `error_code` | 稳定安全错误码，可空 |
| `lease_until` | 进程异常后的并发许可回收边界 |
| `created_at` / `settled_at` | 窗口统计和审计时间 |

索引至少覆盖：

- 全局/用户 active lease 查询；
- user + created_at 小时/每日统计；
- task key 累计统计和 active 互斥；
- 过期 reservation 清理。

### 原子预留

同一短事务执行：

1. 锁 GLOBAL 和 USER scope。
2. 忽略或原子标记已过期的 `RESERVED` 行。
3. 汇总 active concurrency、任务、小时和每日用量。
4. 检查本次预留后的所有上限。
5. 插入 `RESERVED` 行并提交。

事务提交后才允许调用 Provider，Provider 网络调用期间不持有 scope lock 或数据库连接。

### 结算

- 发送前失败：`RELEASED`，`charged_tokens=0`。
- Provider 成功并有 usage：`COMPLETED`，按实际 usage 结算。
- Provider 成功但 usage 缺失：`COMPLETED`，按保守估算结算。
- 请求已发送后 timeout、断流或未知失败：`FAILED`，按估算 input 加已知/估算 output 保守结算。
- 进程崩溃：lease 到期后转 `EXPIRED`；因为不能证明 Provider 未计费，按 reservation 保守结算。

结算更新必须以 reservation ID 为幂等键。重复完成、错误回调或 cleanup 不得重复累加费用。

## Provider usage 采集

### 非流式 completion

现有 `AiProviderResponse` 已承载 input/output token。Gateway 在 Overview 每次 completion 后立即结算，并把用量加入同一 task budget。

### 流式 completion

OpenAI-compatible 请求在 Provider 能力允许时发送 `stream_options.include_usage=true`，解析终止前 usage chunk。Provider 不支持该字段、连接中断或未返回终止 usage 时，流式输出字符/字节只用于改善估算，最终仍按保守规则结算。

Port 应返回独立的 `AiProviderUsage`，或让终止 chunk 携带可空 usage；不能只依赖当前 `void streamInto(...)`。聊天 assistant 持久化时将安全 usage JSON 写入既有 `messages.usage_json`，内容只包含估算/实际 token、provider、model 和是否完整，不保存 prompt。

### Embedding

`EmbeddingResult` 增加可空/明确未知的 input token usage。`SiliconFlowEmbeddingProvider` 解析响应的 usage；缺失时由 gateway 使用输入估算。

Ingestion 按顺序把 chunks 组成有界 batch，每批分别预留和结算，最终向量数量及 ordinal 必须与输入完全一致。任何 batch 失败都不得切换 active generation。

## 初始策略

以下是开发阶段的初始保护值，不是产品套餐承诺：

| Feature / stage | 单用户并发 | 单次估算输入 | 输出上限 | 任务预算 | 最大调用次数 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Chat completion | 2 | 24,000 | 4,096 | Chat 合计 32,000 | 2（含 retrieval） |
| Retrieval embedding | 2 | 8,000 | 不适用 | Chat 合计 32,000 | 同上 |
| Source Overview | 1 | 16,000 | 中间 1,024；最终 4,096 | 50,000 | 12 |
| Subject Overview | 1 | 24,000 | 4,096 | 32,000 | 1 |
| Ingestion embedding | 1 | 每批 16,000 | 不适用 | 每 job 100,000 | 16 |

全局默认建议：

```yaml
global-concurrent: 4
per-user-concurrent: 2
per-user-hourly-tokens: 1000000
per-user-daily-tokens: 2000000
global-daily-tokens: 2000000
reservation-lease-millis: 300000
```

所有值通过 `auralis.ai.limits` 绑定并允许环境变量覆盖。生产 profile 在 `auralis.ai.enabled=true` 时必须验证限制已启用且为正值。调整配置不改变公开 API schema。

## 错误与客户端语义

新增稳定错误码：

| 错误码 | HTTP | 语义 | 自动重试 |
| --- | ---: | --- | --- |
| `AI_REQUEST_BUDGET_EXCEEDED` | 413 | 单次请求体或输入超过功能上限 | 否 |
| `AI_TASK_BUDGET_EXCEEDED` | 422 | 当前业务任务已无足够预算或调用次数 | 否 |
| `AI_CONCURRENCY_LIMIT` | 429 | 系统、用户、功能或 task 正在占用并发 | 仅显式用户操作或后台延期 |
| `AI_HOURLY_QUOTA_EXCEEDED` | 429 | 用户小时配额耗尽 | 到 reset time 后 |
| `AI_DAILY_QUOTA_EXCEEDED` | 429 | 用户每日配额耗尽 | 到 reset time 后 |
| `AI_GLOBAL_QUOTA_EXCEEDED` | 503 | 系统每日安全预算耗尽 | 运维调整或窗口重置后 |

Problem Details 对 429 返回 `Retry-After`，并在安全结构字段中提供 `retryAfterSeconds` 或 `resetAt`。不得把内部配额总量、其他用户用量或全局成本暴露给普通用户。

Chat 已经进入 SSE 后发生的限额错误继续使用 `message.error` 事件，并持久化关联 assistant failure。Overview 使用普通 Problem Details。PC 自动 Overview 遇到繁忙或配额错误不得自动循环补发；保留一次明确失败并由用户手动重试。

## 资源隔离

### MVC 异步执行器

通过 `WebMvcConfigurer.configureAsyncSupport` 为 `StreamingResponseBody` 配置有界 `ThreadPoolTaskExecutor`、明确队列容量和 async timeout。拒绝策略必须转换为稳定 AI 繁忙响应或 SSE error，不能无限创建线程。

Usage Guard 的全局并发必须低于或等于 AI 可用 executor 并发，使 Provider 阻塞不能吞尽异步写线程。普通同步 API 不复用 AI 专用 executor。

### 数据库事务

Ingestion 改为：

```text
短事务 claim job
  -> commit
读取/解析并调用 embedding Provider
  -> 无数据库事务
短事务写 chunks、切换 generation、更新 Source/job
```

`IngestionWorker.process(userId, jobId)` 不再以方法级事务包住 `processClaimed`。最终写入同时结合现有开放的 lease fencing 风险，确保过期 worker 不能提交 stale generation。

### Overview 总 deadline

单次 Provider response timeout 不是完整 Overview deadline。Gateway task 必须记录总 deadline，每轮调用使用：

```text
effectiveTimeout = min(stageProviderTimeout, taskRemainingTime)
```

首版仍使用同步 Overview API，因此总 deadline 必须与 PC、反向代理和 Server async timeout 对齐。更可靠的终态是后续持久化 generation job。

## 可观测性

新增结构化事件：

- `AI_USAGE_RESERVE_ALLOWED`
- `AI_USAGE_RESERVE_REJECTED`
- `AI_USAGE_SETTLED`
- `AI_USAGE_RESERVATION_EXPIRED`
- `AI_TASK_BUDGET_REJECTED`

日志允许记录 user UUID、feature、stage、provider、model、reservation/generation ID、估算/实际/charged token、状态和耗时；禁止记录 prompt、正文、模型回复、API key、Authorization 或完整 Provider URL query。

Micrometer 指标只使用低基数 tag：feature、stage、provider、result、errorCode。禁止把 userId、taskKey、sourceId 或 conversationId 作为 metric tag。

建议指标：

- active Provider calls gauge；
- reservation allowed/rejected counter；
- charged token counter；
- Provider duration timer；
- usage estimation fallback counter；
- expired reservation counter；
- ingestion deferred counter。

## 实施分段

### 阶段 1：统一入口与即时安全上界

- 建立 feature/stage/context/policy/gateway。
- 所有四类外部调用切换到 gateway。
- Chat 设置显式输出上限。
- Overview 增加任务 token 和调用次数预算。
- Ingestion embedding 分批。
- 配置有界 MVC async executor。
- 移除 Provider I/O 周围的长事务。
- 增加错误码、配置和结构化日志。

阶段 1 完成时，即使持久 ledger 尚未启用，也不得留下业务层可直接绕过 gateway 的调用路径。但对外启用必须与阶段 2 的持久配额一起发布，避免把进程内计数误写成跨重启硬配额。

### 阶段 2：持久 reservation 与周期配额

- 增加 Flyway migration、usage lock/reservation entity 和 repository。
- 实现原子预留、结算、过期回收和后台延期。
- 收集非流式、流式和 embedding usage。
- 写入 Chat `usage_json`。
- 完成 PostgreSQL 并发、进程异常和多实例测试。

### 阶段 3：Overview 持久异步作业

- `POST` 创建或复用 generation，返回 `202 + generationId`。
- 查询状态/结果，支持稳定幂等和客户端重连。
- 服务端持有 owner/source/revision/mode/input fingerprint fence。
- PC 不再依赖单个 60 秒 HTTP 请求取得最终结果。

阶段 3 是关闭 Overview timeout mismatch 和“客户端断开但 Server 继续计费”体验问题的推荐后续任务，不与阶段 1/2 混成一个不可审查的大提交。

## 预计代码改动

### 新增 Server 类型

- `ai/usage/AiFeature.java`
- `ai/usage/AiStage.java`
- `ai/usage/AiCallContext.java`
- `ai/usage/AiProviderUsage.java`
- `ai/usage/AiTokenEstimator.java`
- `ai/usage/AiLimitPolicy.java`
- `ai/usage/AiUsageGuard.java`
- `ai/usage/AiUsageReservation.java`
- `ai/usage/AiInvocationGateway.java`
- `ai/usage/internal/AiUsageLockEntity.java`
- `ai/usage/internal/AiUsageReservationEntity.java`
- 对应 repository、transaction service 和 reservation cleanup scheduler

### 修改 Server 代码

- `AiStreamingService`：使用 gateway，Chat task budget，usage 持久化和限额 SSE 错误。
- `OverviewGenerationService`：使用 gateway，稳定 task key，总 deadline、累计预算和最大调用次数。
- `IngestionWorker` / `IngestionJobService` / `IngestionJobEntity`：短事务、batch、延期和 fencing。
- `AiProviderPort` / `AiProviderChunk`：返回或承载流式 usage。
- `EmbeddingResult` / `SiliconFlowEmbeddingProvider`：承载并解析 embedding usage。
- `ConversationService` / `MessageEntity`：保存安全 `usage_json`。
- `AuralisProperties`：增加 `ai.limits` 配置结构和校验。
- `WebConfiguration` 或新的 AI async configuration：有界 MVC executor。
- `ApiErrorCode` / `GlobalExceptionHandler`：新增错误码、HTTP 状态和 `Retry-After`。
- `application.yml`、profile 配置、`.env.example`、`docker-compose.yml`：环境变量与默认值。
- 下一号 Flyway migration：usage 表及 `ingestion_jobs.next_attempt_at`。

### 修改客户端

- PC Overview failure policy：显示繁忙、单次预算、任务预算和周期配额文案；不增加自动补发。
- PC/Mobile Chat：识别新增 SSE error code，保留失败消息和显式重试入口。
- OpenAPI artifact 与 PC/Mobile 生成 schema：若 Problem Details shape 或异步 Overview API 改变则同步生成。

## 测试策略

### 单元与服务测试

1. Estimator 覆盖英文、中文、Emoji、组合字符、空输入和消息 overhead。
2. 单次 request bytes、input、output 与 embedding batch 边界分别有等于上限、超过上限测试。
3. MAP/REDUCE 在任务预算或调用次数耗尽前拒绝下一次 Provider 调用。
4. Chat retrieval 与 completion 计入同一 task。
5. 成功、发送前失败、发送后 timeout、断流、usage 缺失和重复 settlement 的计费语义。
6. 全局、用户、feature 与同 task 并发竞争，不允许超发。
7. permit/reservation 在所有异常和客户端断线分支释放并终结。
8. Ingestion batch 向量数量、顺序、generation 原子切换和失败保护。
9. `AI_CONCURRENCY_LIMIT`/quota 只延期 ingestion，不增加普通失败 attempt。
10. Provider mock 执行时断言当前线程没有活动数据库事务。

### 数据库与并发测试

1. H2 clean/upgrade 和 PostgreSQL clean/upgrade migration。
2. 多线程同时 reserve 后 active 数和 token 总量不超过上限。
3. GLOBAL -> USER 固定锁顺序无死锁。
4. reservation lease 过期后释放并发且只结算一次。
5. 小时/每日窗口边界使用可注入 Clock 验证。
6. 同 task key 竞争只有一个 active reservation。
7. 多实例语义使用两个独立 Spring context 或数据库连接验证。

### HTTP 与资源隔离测试

1. 普通 REST 限额错误返回 Problem Details、正确状态和 `Retry-After`。
2. SSE 限额、Provider timeout 和断流返回稳定 `message.error`。
3. 受控 Provider 阻塞占满允许的 AI 并发时，额外 AI 请求立即被拒绝。
4. 同时请求 Source、Asset、Sync 和预览依赖 API，验证仍在约定延迟内返回。
5. MVC async executor 队列耗尽时不无限创建线程，错误可诊断。
6. OpenAPI artifact、Server runtime、PC/Mobile schema gate 保持一致。

自动测试不能替代真实 DeepSeek/OpenAI-compatible/SiliconFlow、反向代理、Tauri WebView 和 Provider 账单核对。发布前必须在真实网络中覆盖成功、429、慢响应、timeout、断流、客户端取消和 usage 缺失。

## 验收条件

1. 生产代码中的 Provider registry/port 直接调用只存在于 gateway/provider 内部允许路径。
2. Chat、Source Overview、Subject Overview、retrieval embedding 和 ingestion embedding 都能被统一配置限制。
3. 重复点击或异常循环不能使一个任务超过任务预算和最大调用次数。
4. 小时/每日配额在 Server 重启和第二实例下仍成立。
5. Provider 阻塞数量不超过配置；额外交互请求快速得到稳定错误。
6. Provider I/O 期间不存在业务数据库事务。
7. 已发送但状态未知的调用不会被错误地按零成本释放。
8. AI 阻塞压测期间普通 API 保持可用，未复现由线程或连接池饥饿导致的全局 `Failed to fetch`。
9. 用量日志、数据库记录和指标均不包含 prompt、文件正文、模型回复或密钥。
10. 自动测试、OpenAPI gate 和文档回写均通过；真实 Provider/Tauri 验收单独记录，不与代码通过混写。

## 文档回写矩阵

实施时必须同步：

- `docs/modules/Backend.md`
- `docs/modules/Infrastructure.md`
- `docs/contracts/API.md`
- `docs/contracts/Database.md`
- `docs/operations/Deployment.md`
- `docs/operations/Runbook.md`
- `docs/project/Architecture.md`
- `docs/current/Status.md`
- `docs/current/IssuesAndReview.md`
- `docs/release/Changelog.md`

若实施阶段新增公开 usage 查询、异步 Overview 或客户端页面，再同步对应产品需求、PC/Mobile 模块、页面 API 映射和前端设计文档。

## 剩余风险

- Provider tokenizer 和 usage 字段并非完全统一，精确账单仍以 Provider 为准；缺失 usage 时只能保守估算。
- 全局 usage lock 适合当前低并发安全闸门，未来高吞吐可能需要分片 bucket，但不得在缺少性能证据时提前复杂化。
- `StreamingResponseBody` 的客户端断开只能在写失败时被观察，Provider 调用可能在下一次写之前继续执行；真实取消语义仍需专项验证。
- 首版同步 Overview 即使有总 deadline，仍不能让断开的客户端查询已生成结果；只有持久异步 generation 能关闭该体验缺口。
- Usage Guard 能防止 AI 占满共享资源，但不能替代对具体 `Failed to fetch` URL、Server 到达日志、Tomcat/MVC executor 和数据库连接池的现场归因。
