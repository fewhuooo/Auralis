# Overview 手动重试、收敛预算与错误码设计

更新时间：2026-09-14

文档状态：已批准设计，待实施

权威范围：PC 文件 Overview 失败后的触发语义、用户重试交互，以及 Server MAP/REDUCE 中间输出预算和错误码

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

### 阶段化输出预算

Overview Provider 调用分为两类：

- 中间调用：多块输入的 MAP，以及输出后仍需参加下一轮的 REDUCE group。
- 最终调用：单块 MAP，或当前 REDUCE 能将所有输入合并为唯一结果的调用。

所有调用都必须传非空 `maxTokens`。本轮固定中间调用为 `1024` tokens、最终调用为 `4096` tokens，作为 Overview service 内部常量，不新增环境变量；禁止依赖 Provider 默认值。后续若真实 Provider 证据表明需要按模型区分，再单独配置化。

Server 在解析 JSON 前检查原始响应上限，在结构校验后检查规范化序列化结果上限。中间输出超出预算时不得进入 `mapped` 或下一轮 `current`。

### 收敛不变量

中间结果另设 `4000` 字符的规范化 JSON 硬上限。最终是否接受一个中间结果，还必须使用当前 `mode`、当前实际 `instruction` 和现有 `messageLength` 逻辑验证“该结果复制两份后仍可组成合法 Reduce prompt”：

```text
serializedIntermediate.length <= 4000
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
