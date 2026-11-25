# Overview 手动重试、收敛预算与错误码设计

更新时间：2026-09-14

文档状态：已批准设计；Server 永久预算策略已部署，真实链路在最终 JSON 解析处失败

权威范围：PC 文件 Overview 失败后的触发语义、用户重试交互，以及 Server MAP/REDUCE 中间输出预算和错误码

## 2026-09-15 Server 永久预算策略

Overview completion 按调用阶段使用明确且有界的 Provider 预算：多批 MAP 与非最终
REDUCE 使用 `max_tokens=3072`，single-batch MAP、Subject direct 和最终 REDUCE 使用
`max_tokens=4096`。Intermediate 规范化 JSON 上限为 `5200` Java 字符，self-pair prompt
上限仍为 `12000`。现有覆盖率保留的紧凑 intermediate prompt 继续生效；不做自动压缩重试，
也不恢复额外的 `outputTokens` 后置拒绝。普通聊天、流式请求、embedding 和公开 API/DTO
不变。该策略已通过自动测试并部署。真实 42-chunk 验收已通过全部 MAP 与第一轮 REDUCE，
最终 REDUCE 在 DeepSeek 2xx、自然 `stop`、`2992 outputTokens` 后产生 `6556 responseChars`，
随后无法解析为 JSON；因此不宣称完整链路或业务验收已完成。

## 2026-09-15 最小 JSON 诊断补充

为区分最终请求是否真正携带 JSON mode，以及响应在 validator 前是否已经是合法 JSON，增加临时只读诊断：Provider 从最终序列化 request body 读取 `response_format.type`，对 Overview 预算请求记录 `AI_JSON_MODE` 的 `structuredJson`、`responseFormat`、`maxTokens` 和阶段；Overview FINAL 使用同一 `ObjectMapper.readTree` 直接检查原始 `message.content`，记录 `FINAL_JSON_CHECK` 的 valid、字符数、行列号和异常类型，不做 fence stripping 或其它预处理，因此 fenced JSON 会 valid=false。诊断不打印 body、prompt、正文、原始异常 message、URL 或凭据，不吞掉后续校验异常，不改变普通聊天/流式或既有错误映射。自动测试通过；未部署，真实验证待重跑。

## 背景与根因

文件 Overview 当前由 PC 在 `SOURCE_READY`、启动恢复、网络恢复、同步完成和文档任务变化时扫描触发。PC 只用内存 `inFlight` 合并同一进程内的并发请求；请求失败后 `inFlight` 被清除，而本地 `FAILED` 记录仍被视为“不完整 Overview”。后续恢复事件因此会对同一 `sourceId + revision + mode` 再次发送请求。

Server 当前按输入 prompt 预算分组，却没有给 MAP 和非最终 REDUCE 输出设置 `maxTokens` 或总序列化长度上限。单个中间结果可能大于下一轮输入预算，或每个结果只能单独成组，使 `groupCount >= inputCount`，最终以笼统的 `VALIDATION_FAILED` 中止。

本设计修复 PC 的自动补发放大器和 Server 的中间结果不收敛根因。本轮不引入持久化 generation 作业、运行中互斥或状态查询接口。

## 目标

1. 文件 Overview 一旦持久化为 `FAILED`，任何自动恢复触发都不得再次调用生成 API。
2. 失败后由用户通过清晰可见的“重新生成”操作发起下一次请求。
3. 多块 MAP 和非最终 REDUCE 输出受到明确 token 与序列化字符预算限制。
4. 每个合法中间结果满足至少两个结果能进入同一 Reduce group 的不变量。
5. Provider 输出过大和 Reduce 无法前进使用稳定、可诊断的错误码，不再伪装成客户端输入校验错误。
6. 保留旧大纲或总结；一次分项重新生成失败不得清除已成功内容。

## 非目标

- 不新增 Server generation 表、轮询接口、后台任务队列或跨实例锁。
- 不实现自动重试、指数退避、最大自动尝试次数或新的 PC SQLite schema。
- 不保证客户端连接断开后能够取回 Server 已经计算完成但尚未返回的无状态结果。
- 不修改 Subject Overview 的“仅用户触发”语义。
- 不重构完整 Overview DTO 为新的紧凑中间 schema。

## PC 设计

### 自动触发边界

`generateReadyFileOverview` 在检查 Source 为 `READY`、revision 匹配后读取当前文件 Overview 缓存：

- 没有当前 revision 的记录：允许首次自动生成 `ALL`。
- 当前记录为完整 `READY`：跳过。
- 当前记录为 `FAILED`：记录 allowlist `SKIPPED_FAILED_REQUIRES_MANUAL_RETRY` 诊断并跳过。
- 当前记录为部分 `READY`：自动路径不补齐，避免恢复扫描覆盖用户分项操作；由用户明确选择重新生成缺失部分或全部。
- Source 已删除、非 `READY` 或 revision 已变化：沿用现有 fence，跳过或丢弃过期结果。

`SOURCE_READY`、`RESUME_BOOTSTRAP`、`RESUME_ONLINE`、`RESUME_SYNC` 和 `JOB_CHANGED` 全部经过同一判断。只有 `MANUAL_RETRY` 进入显式重试方法并允许覆盖 `FAILED`/部分结果限制。现有内存 `inFlight` 继续合并同一进程内的重复点击。

### 失败与交互

本地数据库继续只持久化 `READY` 和 `FAILED`，不增加 `UNKNOWN` 状态或迁移。失败保存稳定 `errorCode` 和有界安全说明，同时保留原有成功的 outline/summary。

文件大纲和文件总结的失败区域直接显示“重新生成”按钮，不要求用户先打开更多菜单。错误文案分两类：

- `MODEL_TIMEOUT`、`MODEL_UNAVAILABLE`、客户端 timeout 或网络失败：提示“无法确认生成状态，服务器可能仍在处理，请稍后再重新生成”。
- `OVERVIEW_PROVIDER_OUTPUT_TOO_LARGE`、`OVERVIEW_REDUCE_NO_PROGRESS` 及其他确定性响应：提示生成失败，并允许用户手动重新生成。

两类失败都不会自动补发。手动重试沿用 `OUTLINE`、`SUMMARY`、`ALL` 的现有模式映射和 request ID 诊断。

## Server 设计

### 2026-09-15 无 `max_tokens` 诊断实验

真实 DeepSeek 运行已经跨过空 `content` 问题，但首个 MAP 在 `responseChars=2553` 后进入
`JSON_PARSE` 失败。该请求使用 `max_tokens=1024`；DeepSeek 官方说明 `finish_reason=length`
时 JSON 可能被中途截断。由于原适配器丢弃 `finish_reason`，现有日志无法直接证实截断。

为测量自然输出规模，Overview 的 MAP、REDUCE 和 direct completion 暂时统一不发送
`max_tokens`，同时移除 intermediate `outputTokens>1024` 的前置拒绝。这个实验不改变普通聊天、
流式请求或 embedding。`JSON_PARSE_START` 仅记录 allowlisted `finishReason`、`outputTokens` 和
`responseChars`，不记录模型正文。`AiProviderResponse` 在构造边界把未知、超长或含换行的停止
原因归一为 `other`。

本实验不是无界读取：Provider HTTP response-size、120 秒 Overview response timeout、JSON/schema
校验、规范化 intermediate JSON `<=4000` 字符、self-pair prompt fit、Source revision fence 和
Reduce no-progress guard 全部保留。取得真实一轮各阶段规模后，应据此恢复明确的 Provider 输出
预算或设计一次有界截断重试。

真实一轮结果：42 chunks 被分为 6 个 MAP batch；前 5 个 MAP 的自然输出依次为
`991/2500`、`1367/2688`、`1731/3669`、`1613/3460`、`2071/4091`
（`outputTokens/responseChars`），全部 `finishReason=stop` 且 JSON/schema 校验成功。第 5 个 MAP
随后触发 `OVERVIEW_PROVIDER_OUTPUT_TOO_LARGE`，因此 MAP 6 与 REDUCE 未执行。该证据证明 1024
不是本资料的可靠通用 MAP 上限；但首个新 MAP 自然停止于 991 tokens，所以不能仅凭这一轮把旧的
首 MAP parse failure 唯一归因为 1024 截断。下一步需区分第 5 个 MAP 是规范化 JSON 字符超限、
self-pair 不适配，还是两者同时发生。

为完成该区分，中间结果在 JSON/schema 校验成功后新增 allowlisted
`INTERMEDIATE_BUDGET_CHECK`：记录 `normalizedChars/normalizedLimit`、
`selfPairPromptChars/promptLimit` 以及对应的两个 overflow 布尔值。指标与实际拒绝判定共用同一次
规范化和 prompt 长度计算，且不记录模型正文、prompt、URL 或凭据；超限行为与错误码不变。

第二轮真实结果已完成区分：MAP1 的 `normalizedChars/selfPairPromptChars` 为 `2417/6074`；MAP2
为 `5105/11450`，对应 `characterOverflow=true`、`selfPairOverflow=false`。MAP2 是自然
`finishReason=stop`，且 JSON/schema 均成功，因此本轮终止原因就是规范化 JSON 超过 4000 字符，
不是 Provider 截断、JSON parse failure 或 12000 字符 self-pair 上限。

永久策略决策前先验证 prompt 压缩：只增强 `INTERMEDIATE` system instruction，把 MAP/非最终
REDUCE 定义为“保留独立主题覆盖、压缩描述”的有损中间态。不得为满足长度删除独立主题；只合并
重复或同义节点，并缩短 title、`section.summary`、`summary.overview`、`keyPoints` 和
`learningPath` 的单项表达。目标 JSON 为 `<=3600` 字符，为 4000 字符硬边界留余量；不新增
chapter/section 数量上限。`FINAL` prompt、4000/12000 校验、分批算法和临时无 `max_tokens`
实验均保持不变。自动测试必须证明规则仅出现在 intermediate prompt，随后用真实 42-chunk
生成判断 prompt 控制是否足够，再决定永久 token/字符策略。

真实验证结果：六个 MAP 的规范化 JSON 均落在 1447–3680 字符，说明 prompt 对 MAP 压缩有效；
但 REDUCE round 1 的第二组仍自然停止于 4678 字符，且 self-pair 为 10899/12000。Prompt 因此
保留为内容控制手段，但不能作为 4000 字符硬保证；永久方案仍需明确 token ceiling，并调整字符
边界或增加有界压缩处理。

### DeepSeek 结构化响应适配补充

现场日志在 `AI_PROVIDER_HTTP_SUCCESS` 后直接进入最终 `MODEL_PROVIDER_ERROR`，中间没有
`JSON_PARSE_START`。`ProviderHttpClient` 已经把响应体解析为顶层 JSON，因此故障发生在
`OpenAiCompatibleProvider.parseResponse` 提取 `choices[0].message.content` 的边界，早于
Overview JSON/schema 校验。原日志没有保存 Provider 正文，不能进一步断言是 `content=null`、
空字符串还是非文本类型；修复不得把这一未证实的 subtype 写成既定事实。

Overview 是机器消费的结构化请求。它通过内部 `AiProviderRequest.structuredJson=true` 明确声明
该语义，普通聊天和流式请求保持 `false`。OpenAI-compatible 请求在该标记下发送
`response_format={"type":"json_object"}`；DeepSeek 额外发送
`thinking={"type":"disabled"}`，避免默认 thinking 把有限输出预算消耗在独立的
`reasoning_content` 上。Overview 的系统指令已经明确要求 JSON，继续作为 JSON mode 的内容约束。

`reasoning_content` 不是最终答案，禁止在 `content` 缺失时把它回退为 Overview 文档。Provider
adapter 对无效 envelope 仅记录 allowlist 元数据：Provider、模型、choices 数量、message/content
字段状态、`finish_reason`、usage token 数，以及 reasoning/content 的字符计数；禁止记录响应正文、
推理内容、用户资料、请求正文、URL 或凭据。无有效 `content` 仍返回稳定
`MODEL_PROVIDER_ERROR`，由这些安全元数据区分 Provider 截断和响应形状异常。

### 阶段化输出预算

Overview Provider 调用分为两类：

- 中间调用：多块输入的 MAP，以及输出后仍需参加下一轮的 REDUCE group。
- 最终调用：单块 MAP，或当前 REDUCE 能将所有输入合并为唯一结果的调用。

所有调用都必须传非空 `maxTokens`。永久策略固定中间调用为 `3072` tokens、最终调用为 `4096` tokens，作为 Overview service 内部常量，不新增环境变量；禁止依赖 Provider 默认值。

Server 在解析 JSON 前检查原始响应上限，在结构校验后检查规范化序列化结果上限。中间输出超出预算时不得进入 `mapped` 或下一轮 `current`。

### 收敛不变量

中间结果另设 `5200` 字符的规范化 JSON 硬上限。最终是否接受一个中间结果，还必须使用当前 `mode`、当前实际 `instruction` 和现有 `messageLength` 逻辑验证“该结果复制两份后仍可组成合法 Reduce prompt”：

```text
serializedIntermediate.length <= 5200
&&
messageLength(mode, instruction, [intermediate, intermediate])
<= maximumPromptChars
```

所有已接受中间结果都受相同的规范化 JSON 长度上限约束，并通过当前请求的自配对检查；测试还必须覆盖两个不同的边界结果能共同成组。因此，`packDocuments` 至少能将两个合法中间结果放入同一组。对于 `N > 1`，非最终 Reduce 必须满足：

```text
1 <= groupCount < inputCount
```

现有 no-progress guard 保留为最后一道防线，不通过增加轮数掩盖不收敛。

### 错误码与 HTTP 语义

- `OVERVIEW_PROVIDER_OUTPUT_TOO_LARGE`：Provider 返回的 MAP 或 REDUCE 文档超过本阶段输出预算，HTTP 502。
- `OVERVIEW_REDUCE_NO_PROGRESS`：Reduce 分组未能使结果数量严格下降，HTTP 502。
- `VALIDATION_FAILED`：仅用于客户端请求、instruction 或输入 prompt 不合法，HTTP 400。
- `MODEL_PROVIDER_ERROR`：Provider JSON/schema/alias/locator 等其他无效输出，HTTP 502。
- `MODEL_TIMEOUT`：Provider 超时，HTTP 504。
- `MODEL_UNAVAILABLE`：Provider 网络不可用，HTTP 503。

阶段日志保留 `MAP`、`REDUCE`、`JSON_PARSE`、`SCHEMA_VALIDATE`，但同一失败的阶段日志和最终日志必须使用一致的对外错误码。日志不得记录 Provider 原始正文、用户正文或未 allowlist 的异常消息。

## 数据流

```text
首次 READY / 无缓存
  -> PC POST ALL
  -> Server MAP（中间预算）
  -> 0..n 轮 REDUCE（非最终轮使用中间预算）
  -> 最终调用（最终预算）
  -> PC 保存 READY

任一失败
  -> PC 保存 FAILED，保留旧内容
  -> 自动恢复触发全部跳过
  -> UI 显示明确错误和“重新生成”
  -> 用户点击后才创建新 requestId 并 POST
```

## 测试策略

### PC TDD

1. 先证明已有 `FAILED` 记录在五种自动 trigger 下仍会调用 API，再修改为调用次数 0。
2. 证明无缓存首次生成仍调用一次，完整 `READY`、部分 `READY`、删除、非 READY 和 revision 变化均正确跳过。
3. 证明 `MANUAL_RETRY` 能重试 `FAILED`，并继续受 `inFlight` 合并保护。
4. 证明分项失败保留旧 outline/summary。
5. 证明文件大纲和总结失败区域直接显示重试按钮，并区分“状态无法确认”和确定性失败文案。

### Server TDD

1. 证明中间 MAP、非最终 REDUCE 和最终调用都携带对应的非空 `maxTokens`。
2. 证明超预算中间输出返回 `OVERVIEW_PROVIDER_OUTPUT_TOO_LARGE`，且不会进入下一轮。
3. 证明 no-progress guard 返回 `OVERVIEW_REDUCE_NO_PROGRESS`。
4. 证明边界大小的两个中间结果可进入同一 group，多轮 Reduce 每轮严格减少数量并最终产生一个结果。
5. 证明两个新错误码映射为 HTTP 502；原有 400/503/504 语义不回归。
6. 证明 Provider 请求体实际包含 `max_tokens`，日志错误码一致且保持脱敏。
7. 证明所有 Overview 调用都设置 `structuredJson=true`，而普通聊天默认保持 `false`。
8. 证明 DeepSeek 的结构化请求体包含 JSON mode 和 `thinking.disabled`，普通请求不包含两者。
9. 证明仅有 `reasoning_content`、`content=null` 的 2xx 响应不会被当作最终答案，且诊断日志只含
   envelope 元数据，不泄露 reasoning、正文或凭据。

### 验证门禁

- PC Overview/UI 聚焦测试、完整 R4 测试、type-check、静态检查和生产构建。
- Server Overview/Controller/Provider/错误映射聚焦测试、fresh test compilation、可运行的全量测试。
- OpenAPI artifact、PC/Mobile 生成 schema 和仓库契约门禁。
- `git diff --check` 与只读 diff 审查。

自动测试只证明代码行为。真实 Provider、Tauri GUI、客户端超时、断网重连和长文档生成必须单列人工验收。

## 文档回写

实施完成后同步：

- `docs/modules/FrontendPC.md`
- `docs/design/Frontend.md`
- `docs/modules/Backend.md`
- `docs/contracts/API.md`
- `docs/current/Status.md`
- `docs/current/IssuesAndReview.md`
- `docs/release/Changelog.md`

本轮不改变数据库结构，因此不修改 `docs/contracts/Database.md`。

## 风险与后续项

Server 端点仍是同步、无状态接口。若 PC 在响应到达前断开，本轮只能阻止自动静默补发，不能查询原生成结果，也不能阻止用户过早手动重试形成并发请求。关闭该剩余风险需要后续独立实现按 `userId + sourceId + revision + mode` 持久化的 generation 作业、状态查询和幂等语义。
