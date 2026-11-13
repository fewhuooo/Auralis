# Auralis 运维与应急 Runbook

### 2026-11-12 Overview 现行排障边界

当前生成采用清理、大纲和总结。旧 Writer 计划、节点预览与候选发布接口已退役，不应通过恢复旧配置、补写 ASSEMBLED 计划或转换历史内容排障。正式结果使用当前 Markdown 与输入描述契约保存，旧行版本冲突仍需用户明确选择替换。历史数据保留，本次未执行清库；下方旧阶段排障记录仅适用于相应历史版本。

Overview 通用输入估算可通过 `AI_INPUT_TOKEN_ESTIMATE` 的 `profile=unicode-category-v1` 核对输入估算。旧输入估算模式已从 Compose 移除。

Overview 先尝试整篇，单请求超容量时改为分批。若返回 `OVERVIEW_PROMPT_BUDGET_EXCEEDED`，检查当前阶段的请求容量和最低输出预留。若返回 `AI_TASK_BUDGET_EXCEEDED`，核对整次任务的累计用量及剩余预留。

### 2026-10-28 Overview 自动重试配置（源码候选，未部署）

AURALIS_AI_OVERVIEW_MAX_RETRIES=3，含义为首发失败后最多额外重试3次；0关闭，负数启动校验拒绝。Spring属性auralis.ai.overview-max-retries与Compose透传同步；实际.env未修改，重建后端后方生效，无新数据库迁移或前端要求。仅重试已返回且结算的模型内容校验失败，网络未知派发、预算/额度和取消等直接停止；次数不影响既有检查点身份，每次重发仍计费。重试日志phase=ADAPTIVE_MODEL_RETRY；阶段INVALID/校验失败日志后可能继续重试，最终结果以RUN_FINISHED/最终任务状态确认。配置与定向/affected检查已完成，完整验证边界见D:/Temp/auralis-overview-auto-retry-20261028/final-report.md；未部署或调用真实模型。

### 2026-10-27 已执行单条Overview失败缓存清理

用户授权清除阻塞新请求的失败缓存，并明确本次不备份、删除旧备份。目标为Subject generation `7685daa5-a125-4ff5-a175-b21bd4116edb`，状态FAILED/无owner或lease/unknown和active dispatch均0，62关联reservation均COMPLETED，无job/publication；三次请求均复用该代。精确单UUID SERIALIZABLE事务锁父行，按预期行数删除恢复子表及父行，COMMIT exit0。删除177checkpoint、3映射、1计划、126节点、58执行调用关联、62invocation及1失败代。

22正式结果、25回执、该Subject7份资料、771账本记录、其它24代完整行hash前后保持；费用297243不归零。本次没有新建备份。旧7个DB/缓存备份删除命令被自动策略拒绝，文件仍保留，精确七文件清单在 `D:/Temp/auralis-failed-cache-clean-20261027/blocked-backup-deletion-7-files.csv`。未重启或部署、未替用户触发新任务。当前SQL只适用于本次精确ID与盘点，不作通用清理命令。

### 2026-10-26 已执行Overview失败缓存清理

本次用户明确选择全部6条FAILED。操作前backend未运行，确认0活动generation/job/reservation、目标派发均已结算；先做V39全库dump及528行定向备份，再锁精确六UUID、核对关联与预期PK/hash，事务删除6代/257检查点/19请求映射/134私有invocation/36执行调用关联/75节点/1计划。COMMIT及部署后的12组保留hash核对通过；22SUCCESS、22正式结果、675费用、25写入回执和原资料保持，unknown-dispatch SUCCESS也未触碰。

本次SQL只适用于此次备份与当时六条ID，不是通用清缓存命令，不能直接对下一次失败复用。费用不因清缓存归零，原账本与历史charged保留。部署已应用V40，下一次清理须重新核实现场版本/状态及范围。D:/Temp/auralis-overview-deploy-20261026/内有备份、SQL、cleanup.log与deploy-verification.md；真实生成和GUI未验收。

### 2026-10-26 Overview 容量诊断（候选未部署）

先确认请求的 provider、精确 endpoint/model 和服务器 capacity profile；未知能力会在派发前以 MODEL_UNAVAILABLE 拒绝。再区分单次输入/输出容量、人工正数上限与任务/窗口额度。`AURALIS_AI_OVERVIEW_MAX_* = 0` 不额外限幅，正值收紧对应容量；`AURALIS_AI_LIMITS_OVERVIEW_MAX_CALLS=0` 仅关闭次数帽，不清除或关闭 Token 配额。只检查需要的配置键，不输出含密钥的完整 Compose 配置。

输出 reserve 是随实际请求体积变化的预留估算，不能当作 Provider 实际用量；余额不足仍报额度错误，不通过压缩正文凑余额。中间 topic/unit alias 数与最终不同来源数是不同口径。容量配置不需要清理账本、checkpoint 或缓存。测试命令、失败归因、七项条件性跳过和隔离 PG/TLS 参数见 `D:/Temp/auralis-overview-dynamic-capacity-20261026/final-handoff.md`；真实模型成本、内容质量和 GUI 尚未验收。

### 2026-10-24 Overview 全流程耗时测量

本机可将 `.env` 中 `AURALIS_AI_OVERVIEW_TASK_TIMEOUT_MILLIS` 设为 `0`，关闭服务端 JSON/SSE 直接请求的整任务期限；每个 Provider response 仍受 120000ms 配置窗口、取消、Guard、计量和预算约束。后台持久 jobs 仍是 240000ms durable deadline。源码需先构建新 backend 镜像并由用户决定是否 recreate；仅改 `.env` 不会影响既有运行容器。测量结束后将该项恢复为所需正值并重建 backend。

更新时间：2026-10-24
文档状态：现行，部分流程待生产演练
权威范围：运行期诊断、恢复、备份与升级条件
事实来源：当前 Compose 服务、Server 配置、客户端请求/同步实现与已知风险

### 2026-10-24 AI Provider 思考开关

设置 `AURALIS_AI_THINKING_ENABLED=false`、用新源码 build backend 镜像并 recreate backend 后，DeepSeek 与官方 MiMo (`api.xiaomimimo.com`) 的普通、结构化和流式 chat 请求会显式请求关闭 thinking。单独 recreate 旧镜像不会加载新代码。检查 Compose 生效值时只输出该单一变量；不得打印完整渲染配置，因为其中含凭据。其它 OpenAI-compatible endpoint 不发送专有字段，因此不能用该开关证明未知代理或任意模型内部推理已关闭。本机当前配置为 `false`，运行容器未由本轮更新。

### 2026-10-24 Overview 输入估算实测

本机 backend 已显式启用 `calibrated-category`；基础配置仍默认 `legacy-bytes`。使用现有 UI 选择原长资料生成总览，不清缓存、不清账本、不需重建前端。完成或明确失败后，按新 run / generation / budgetTaskId 对照 `AI_INPUT_TOKEN_ESTIMATE`、`ADAPTIVE_BUDGET_FORECAST`、`ADAPTIVE_WRITER_PROGRESS`、`BUDGET_ROOT_STOP/RESUME/COMPLETE` 与 D:/Temp/auralis-overview-traces 下的报告。`profile/strategy/categoryMessages/byteMessages` 说明使用分类还是回退；输入预留下降不是 Provider 实际 Token 消耗下降。

离线验证覆盖 INDEX、METADATA 和 ROUTE，没有真实 writer 样本；本轮实测重点补正文输入估算与 Provider actual usage、未重复完成步骤、内容完整性。历史 charged 继续累计，旧消耗不会因换估算归零；合法预算耗尽仍返回原错误。若需关闭候选，只把本机 overlay 的该模式改回 `legacy-bytes` 后 recreate backend，不改模型、不删检查点或账本。

### 2026-10-23 Overview 次数预算观测

本机追踪 overlay 将 `AURALIS_AI_LIMITS_OVERVIEW_MAX_CALLS=0`，表示暂时不因 Overview 累计调用次数拒绝，但仍逐次记录 Provider usage，且继续受任务/窗口 Token、deadline、并发及结构性容量限制。复盘时按同一 `budgetTaskId` 对照账本累计 calls/charged tokens 与追踪文件的本轮 Provider 响应；追踪不包含旧轮次用量，不能拿单次 run 计数替代账本。调回正数时只改 overlay 配置并重新创建 backend，不清空账本。

### 2026-10-12 学科总览 preflight 后快速 VALIDATION_FAILED

若日志在 `REQUEST_VALIDATE_SUCCESS` 后数毫秒失败且没有 `PROVIDER_REQUEST`，外层 `phase=FINAL` 不代表模型已生成；需区分完整 JSON 转义 prompt 校验与 quota 错误。合法文件总览合并也可能超过 12000 字符，本次当前三份缓存按空 instruction 重建为 16631，单份均能装下。原始请求体未记录，缓存重建仅作为候选证据。

本机香港 13:57:23 已更新 Subject 内部分批 / 有界归纳修复（`a5a50bb7…` healthy / readiness 200），部署类与已测版本精确匹配，原额度与 embedding 排除保留。PC 仍可能展示通用生成失败；实测应按关联 requestId / generationId 核对 MAP / REDUCE、实际错误码和独立结果保存响应。大请求也继续受原调用次数、资源预算、deadline 与输出 schema 限制。无需清空旧用量或缓存，详见 [本轮记录](../plans/2026-10-12-subject-overview-prompt-batching.md)。

### 2026-10-12 embedding 额度排除策略

当前统计按 `INGESTION_EMBEDDING` / `RETRIEVAL_EMBEDDING` 排除用户小时 / 日和系统日额度，个人中心也排除历史 embedding charged / reserved。原行仍保留调用审计，不能将原始 ledger charged 总和当作新窗口消耗；生成调用缺 usage 仍保守。embedding 可以因并发、任务资源预算 / 调用次数、输入字节上限或 Provider 故障失败，但新策略下不应仅因 token 窗口满额延期。

单人测试默认为 1000000 / 小时、2000000 / 日，系统日仍 2000000，多用户共享生成总量。排查先核对实际容器额度变量与包含新聚合的 JAR，再比较个人中心；三份配置已同步，新代码需重建 backend。不得删除旧账本来让显示归零，详见 [策略计划](../plans/2026-10-12-embedding-quota-exemption-and-test-limits.md)。下方历史 PDF 小时延期是策略调整前的诊断。

本机香港 12:57:12 已按新策略更新 backend（`31f7dec…` healthy / readiness 200）；运行 Guard 的两个 embedding stage 豁免与四条窗口聚合排除已确认，个人小时 / 日为 1000000 / 2000000。当前策略不需重试或清账来排除历史 embedding；个人中心应重新读取额度。实际 Provider 操作和同步表现仍由真实测试确认。

2026-09-24 紧邻任务交换运行记录：本机 backend 已单独重建并重启，镜像 `sha256:bf8e7bb72f0c…`，health/readiness HTTP 200、Flyway 23；db/minio 未动。若顶部交换仍按旧的“直接互换开始时间”表现，先核对运行容器镜像及 PC 是否加载新前端，再检查 `POST /api/tasks/schedule-swaps` 的响应时间；不要重置数据库。

2026-09-24 运行记录：Timeline 主体放置修复已通过单独重建/重启 `backend` 部署到本机 Compose；health/readiness UP，Flyway V23 `success=true`，db/minio 容器保持原样。若 PC 仍呈现旧主体行为，先核对请求是否包含 `targetTaskId`、运行镜像是否为 `sha256:80d303401599…`，再查看返回的 `VALIDATION_FAILED`/`RESOURCE_VERSION_CONFLICT`；不应通过重置数据库处理拖放冲突。

## 排期插入接口返回 unexpected error

如果 backend 日志显示 `POST /api/tasks/schedule-insertions` 的 `HttpRequestMethodNotSupportedException`，先核对运行镜像是否早于包含 `TaskController.insertSchedule` 的当前版本。该接口在当前代码和 OpenAPI artifact 中使用 POST；旧镜像不含映射时客户端只看到通用 500。已验证恢复流程为单独重建并重启 backend，确认容器 healthy 和 readiness HTTP 200。若需启动数据库依赖，只启动现有 db/minio 容器，不重建或清除数据卷。默认 prod profile 关闭 `/v3/api-docs`，HTTP 404 是预期配置。





## AI Provider 超时诊断

Chat 运行以 `CHAT_RUN_FAILED` 结束且没有 `AI_PROVIDER_HTTP_FAILED` 时，检查同一时间的 `CHAT_RUN_FAILED` WARN。该事件带 run/attempt、iteration、`stage`、`safeErrorCode`、exception/cause 类型和 `frameClass/frameMethod/frameLine`，可以定位 Orchestrator 中的本地失败点；它不包含 throwable message、模型内容、reasoning 或工具调用原文。旧运行曾由 `AiUsageLimitException` 被误映射为 `CHAT_RUN_FAILED`；旧日志中的 `AI_BUDGET_REJECT dimension=TASK_CALLS used=N limit=N` 表示当时同一 Chat run 在各 retry attempt 间累计的 combined all-origin provider/embedding 调用上限已耗尽。当前源码改为独立 `AURALIS_AI_CHAT_AGENT_MAX_MODEL_CALLS` 和 `AURALIS_AI_CHAT_AGENT_MAX_EMBEDDING_CALLS` stage 帽（默认0表示不限制），并提供跨 retry 的 `accountingSummary.modelCalls` 与 `embeddingCalls`。配置新源码后，`STAGE_CALLS` 拒绝表示相应单类上限已用尽；budget rejection 前没有新 reservation。保留既有账本并以新 Chat run 继续，不在同一 run 上反复 retry。`accountingSummary.currentAttemptToolCalls` 只按当前 attempt 的 toolTrace 中 distinct call ID 计数；工具上限 `AURALIS_AI_CHAT_AGENT_MAX_TOOL_CALLS` 独立配置（当前默认及上限20、attempt 范围）。Iteration 默认及上限12，最后一轮禁止新工具并根据已有证据收尾；若仍请求工具则给出限制说明后结束。Token/并发/窗口额度、独立调用帽和期限仍可能在收尾前终止运行。源码变更需重建 backend 才在新请求生效。

`MODEL_TIMEOUT`（HTTP 504）表示 Provider socket response/read 超时；`MODEL_UNAVAILABLE`（HTTP 503）保留给其它不可用/IOException。检查 backend 的 `AI_PROVIDER_HTTP_FAILED` 中 `phase`、`errorType`、安全 `errorCode` / `causeType`、host/path 和 `elapsedMs`，不记录 key 或 prompt。`phase=http_status` 的 `status` 表示真实 HTTP 非 2xx；`provider_frame_json` / `provider_frame_protocol` 表示上游 SSE 帧解析或协议错误；`consumer_callback` 表示本地消费链抛错；`transport` 表示传输阶段异常。日志不采集响应正文，不能从中还原 Provider 的私有错误消息。默认连接超时为 3000ms，普通聊天/流式/embedding response-read 为 10000ms，Overview map/reduce 非流式窗口为 120000ms（允许 60000–120000ms）；仅在确认上游生成耗时确实较长时调整 `AURALIS_AI_OVERVIEW_RESPONSE_TIMEOUT_MILLIS`，不要把普通请求窗口改成 Overview 窗口。

Chat 若出现 `phase=consumer_callback` 且 `causeType=IllegalArgumentException`，它表示上游 HTTP 已通过状态校验并进入本地流回调。曾知问题是工具名/arguments 分片未齐时过早构造 langchain4j `PartialToolCall`；当前源码已等待 SDK 所需字段非空后才发 partial callback。检查部署镜像是否含该修复后再安排用户触发新的 Chat 请求；不要用旧 request 重放。

## 2026-09-09 Task 16 运行观察

backend 重建后 health/readiness 正常且 ingestion worker flag 为 `true`。首次 scheduled Sync retention 执行报 `InvalidDataAccessApiUsageException` / `TransactionRequiredException`，根因为 `SyncRetentionService.purgeExpired` 调用 `deleteByCreatedAtBefore` 时无实际事务；应由后端修复并重新部署后复核。该观察不授权手工清理或数据库写入。当前 READY Source 的历史 `change_log` 仅有 CREATE/DELETE，无 SOURCE UPDATE；需认证用户执行一次新的 reingest/upload，再核对 Source、job、change-log、PC sync 与 GUI。

## 使用原则

1. 先识别影响范围，再修改状态。
2. 先保留日志、配置和数据证据，再重启或恢复。
3. 生产环境禁止尝试开发默认密码或把 secret 打到终端记录。
4. 数据操作必须先备份，递归删除必须验证绝对路径。
5. 无法证明安全时停止写入并升级处理，不做猜测性修复。

## 快速状态检查

```powershell
docker compose ps
docker compose logs backend
docker compose logs db
docker compose logs minio
docker compose logs minio-init
```

应用侧同时记录：时间、用户（脱敏）、端、页面、请求路径、HTTP/code、WebSocket 状态和最近同步 cursor。

## Server 启动失败

### 触发

Server 退出、`8080` 不监听或健康检查失败。

### 检查

- Java 21 与 Maven。
- Windows Maven Wrapper 的本地仓库路径；普通目录不应触发 `Cannot index into a null array`。
- 激活 profile。
- PostgreSQL、MinIO 地址和凭据。
- 端口冲突。
- 数据库建表/ALTER 错误。
- LangChain4j 配置解析。

```powershell
cd Auralis-Server
.\mvnw.cmd -B -ntp spring-boot:run
docker compose logs backend
```

### 恢复与成功判据

修正目标环境配置或依赖服务；Server 稳定监听 `8080`，Auth 可响应，受保护 API 无 token 时被拒绝。

### 升级条件

迁移失败、数据损坏、生产 secret 不明或需修改 schema 时，停止自动重启并升级给后端/DB 负责人。

## PostgreSQL 异常

### 检查

```powershell
docker compose ps db
docker compose logs db
```

检查磁盘、volume 权限、连接数、数据库名、用户和迁移日志。

### 恢复

- 连接错误先修复网络/凭据，不重建 volume。
- 迁移错误先备份并确认失败 SQL。
- 数据损坏按最近演练过的备份恢复。

成功判据：Server 能查询用户、块和任务，数据量与恢复点一致。

## MinIO 上传失败

### 检查顺序

1. `9000` API 与 bucket 是否可用。
2. Server endpoint、access key、secret key、bucket。
3. 预签名 URL 是否过期。
4. objectName 用户前缀。
5. 文件大小、content-type 和网络错误。

```powershell
docker compose ps minio
docker compose logs minio
docker compose logs backend
```

成功判据：重新获取的预签名 URL 可上传，bind 后查询资产属于当前用户，且对象实际存在。Docker 后端日志应能看到 `ASSET_UPLOAD_INTENT_CREATED`、`ASSET_UPLOAD_COMPLETE_REQUESTED`、`ASSET_UPLOAD_READY` 和 `SOURCE_CREATED`；若只看到 intent 而没有 complete，优先检查浏览器到 `AURALIS_MINIO_PUBLIC_ENDPOINT` 的 PUT/CORS；若有 complete 但没有 ready，检查 MinIO 对象 HEAD 和 size/MIME/hash 校验。

### 数据库与对象孤儿核对

上传完成失败或人工恢复后，先只读核对，不直接删除对象：

```powershell
$env:AURALIS_DB_PASSWORD = '<从 secret 管理器读取>'
$env:AURALIS_MINIO_ROOT_USER = '<从 secret 管理器读取>'
$env:AURALIS_MINIO_ROOT_PASSWORD = '<从 secret 管理器读取>'
.\scripts\audit-minio-assets.ps1
```

脚本比较 `assets.object_key` 与 MinIO bucket 中的对象，分别报告数据库无对象和对象无数据库记录；删除前必须人工确认保留期、状态和备份。

## AI 接口失败

### 触发

chat/ingest 超时、401、模型不存在、无效 JSON 或空结果。

### 检查

- 激活 profile 和配置键。
- Chat 或 Overview 失败时，检查 `GET /api/ai/settings` 中 `OPENAI_COMPATIBLE` 的 `hasApiKey`。Chat 可通过 `AI_SETTINGS_RESOLVED` 核对凭据来源。使用平台端点时，检查 backend 中 `AURALIS_AI_GENERATION_BASE_URL`、`AURALIS_AI_GENERATION_MODEL` 和 `AURALIS_AI_GENERATION_API_KEY` 是否完整且彼此匹配。
- Overview 返回 `503 MODEL_UNAVAILABLE` 且没有上游派发时，核对实际凭据来源。平台生成检查运行中 backend 的 `AURALIS_AI_GENERATION_CONTEXT_TOKENS` 和 `AURALIS_AI_GENERATION_MAX_OUTPUT_TOKENS`。BYOK 检查服务端 `overview-model-capacities` 是否存在精确匹配当前 Provider、端点及模型的条目。
- 检索或入库向量化失败时，检查 `AURALIS_AI_EMBEDDING_BASE_URL`、`AURALIS_AI_EMBEDDING_MODEL` 和 `AURALIS_AI_EMBEDDING_API_KEY` 是否完整且彼此匹配。确认 `/embeddings` 返回每条 1024 个有限数值。排查时只核对 Key 是否存在。
- 网络和提供商状态。
- 失败日志中的 `errorCode` 只是稳定业务码；同时查看同一事件的 `exceptionType`、`exceptionMessage`、`rootCauseType` 和 `rootCauseMessage`。message 已做敏感字段脱敏和 300 字符截断，不能据此推断完整上游响应。
- 请求是否超过文件/上下文限制。
- `application-prod.yml` 是否仍使用错误的 `spring.ai.openai` 口径。

恢复后分别验证普通 chat、SSE、文本摄入和文件摄入。不得用一次 chat 成功推断全部 AI 路径可用。

## AI 配额拒绝与 ingestion 等待（已实现；真实环境验收独立）

先记录稳定错误码及安全 `retryAfterSeconds/resetAt`，再读取本人 `GET /api/ai/usage`；六种拒绝及状态见 [API 契约](../contracts/API.md)。小时/每日额度耗尽应等待窗口重置，并发繁忙应等现有调用完成。任务累计预算或单次输入预算耗尽不能靠自动循环重试解决。

后台 ingestion 因额度或繁忙延期时，检查 job 的 `next_attempt_at`、有效 claim 与 checkpoint generation；延期应保留已完成 inactive chunks，不增加普通 `failure_count` 或把当前 Source 写为 FAILED。旧 worker 不得覆盖新 attempt。窗口恢复后验证从未完成批次继续，并仅在完整成功时一次切换 active generation。

若 embedding HTTP 连续成功后没有后续调用，先检查是否 job 已为未来 `next_attempt_at` 的 PENDING，而不是仅根据最后一条 HTTP 日志判断阻塞。2026-10-12 大 PDF 现场为小时额度延期，三笔 charged 合计 94615、没有 RESERVED、租约为空；两次快照无数据库 blocker。当前 PC 仅显示泛化排队，job 的重试时间不在 Source DTO 中。

该现场在香港 11:00 原部署自然续做成功，只新增一笔 embedding，同 generation 从 32 个 inactive chunks 变为 42 个 active chunks，job / Source READY。记录初始延期与后续恢复的时间，区分原调度恢复、补丁部署及 GUI 验收；本轮未人为重跑。

同时核对 reservation 的 estimated、actual input/output 和 charged。旧 SiliconFlow 适配器丢弃 `completion_tokens`，包含合法 0 的完整响应也变成部分未知，按保守估算扣内部额度；本轮补读取该字段。真实缺失用量仍保守，不清空旧账本或把免费模型全部归零。免费与金额不决定本应用 token 配额。源码、命令和真实验收边界见 [PDF 诊断与修复](../plans/2026-10-12-pdf-ingestion-quota-and-sync.md)。

## Overview 超时与取消（2026-10-11 已实现，未部署）

若 `PROVIDER_REQUEST` 后立即出现 `AiUsageLimitException`，先核对安全业务码和阶段预算。该日志位于 gateway 预留之前，不证明 HTTP 已出站。2026-10-11 已定位最终 MAP 6144 被旧网关 4608 阈值误拒绝；修复版本须保留两个 Overview 操作的 6144 最终上限、生成服务的 4608 中间输出及全部配额保护。默认 JSON 看 ProblemDetails，SSE 看终端 error 的 code/status，不用 HTTP 200 判断成功。诊断与回归见 [本轮证据](../plans/2026-10-11-overview-usage-limit-diagnosis.md)。

账本只读排查使用短 `BEGIN READ ONLY` 和聚合/LIMIT，分别查看 RESERVED、有效 lease、request_dispatched 和 charged_tokens。TASK 标识仍在但 owner/lease 已清空不代表并发占用。过期预留在 beginTask/reserve/snapshotForUser 惰性回收；最后一个入口可能写回收状态，不应当作严格只读诊断 API。已派发未知用量保守计账是安全规则，不能作为泄漏直接归零。默认 scheduler 的歧义警告也不能单独证明回收失效。

PC 请求使用同路由 SSE：注释心跳仅维持连接，最终 `result` 才是结构化成果；已开始响应后，错误在 `error` 事件中携带业务 `code/status`，此时 HTTP 200 不代表生成成功。缺少最终事件的断流须按状态不确定处理。JSON 消费者仍按 HTTP ProblemDetails 判断失败，等待时不能保证及时感知断连。

Chat `/messages/stream` 与 retry 的 MVC async request timeout 由 controller 对该 request 单独关闭；Chat `attemptDeadlineSeconds`（当前配置300秒）仍负责任务上限。若流在约30秒被截断，先查同一请求是否有 `AsyncRequestTimeoutException`；若新版本中持续空窗约60秒后断流，则再核对反向代理 `proxy_read_timeout`，不要据此推断模型输出长度。部署修复后需验证长时间无 chunk 的 SSE、用户取消及浏览器关闭分别能正常终止本地 worker/reader 和结算。

入口预算扣除 preflight 和数据库等待时间，但 socket 关闭不打断 JDBC/数据库锁等待。同步 preflight 若卡住，SSE 尚未建立，HTTP 响应可能晚于期限；区分此类数据库等待与已经进入 Provider 传输的慢流。原生 DNS 也可能忽略线程中断，只能由有界解析等待隔离，不能将 Future.cancel 当作 OS lookup 已结束。

验收取消时同时查看连接关闭、生成工作退出、在途预留完成结算和任务释放；用户已派发但 usage 未知的调用沿 B 保守计账，取消不能被当作零费用。共享生成中的一个消费者离开后，其余需求可以继续；只有最后消费者退出或总期限到达才终止当前传输。远端 Provider 已收到的计算能否撤回不由本地 socket 关闭证明，完整证据见 [实施计划](../plans/2026-10-11-overview-hard-timeout-cancellation.md)。

`AI_REQUEST_BUDGET_EXCEEDED` 或 `AI_TASK_BUDGET_EXCEEDED` 属于不可恢复的本次输入/任务预算拒绝，会按有效 claim 终态失败，不能期待每秒延期恢复预算。调整策略或输入后通过现行重新摄入流程创建新的 job/generation，不改旧账本来伪造剩余额度。账户停用的晚到 AI 请求沿用 `UNAUTHENTICATED`；排查时不要把它当作额度耗尽。

进程异常的租约由账本按保守规则回收。不要手工删 reservation、把已派发请求改为零消耗或清空匿名记录来恢复额度；这些操作会破坏跨实例预算与系统累计用量。数据库故障时先恢复数据库，不通过绕过 gateway 恢复 Provider 调用。实际完成与自动验证范围见 [B 实施计划](../plans/2026-10-10-ai-usage-guard-b.md)。

`503 SERVICE_UNAVAILABLE` 加 `Retry-After: 1` 表示应用异步入队被有界线程池拒绝；先确认服务负载与已运行任务，不把它诊断为 Provider 凭据错误。客户端显式稍后再试，避免自动补发放大负载。

## HTTP 401 / 403

### 检查

- Authorization 是否为 `Bearer <access-token>`。
- 是否错误使用 refresh token。
- token 是否过期、签名 secret 是否一致。
- 刷新请求 body 是否包含 refreshToken。
- PC 页面是否因守卫关闭而在未登录时仍可见。

### 恢复

先尝试一次合法 refresh；失败则清理本地 token 并返回当前端登录页。禁止通过关闭 Server 鉴权解决。

## PC 登录守卫异常

当前守卫代码临时直接 `next()`。若出现未登录可访问页面，这是已知客户端问题，不应误判 Server 鉴权失效。

恢复守卫时检查：

- `/login` 公开。
- `requiresAuth` 未登录重定向。
- 已登录访问 `/login` 的目标行为。
- 刷新后 Store 恢复。
- 退出后不能返回受保护页面。

## 同步不一致

### 收集证据

- 用户、设备/客户端 id。
- 实体 id、类型和操作。
- 本地 `sync_status`、`sync_version`。
- last cursor。
- push/pull 响应。
- WebSocket 连接和 token。

### 诊断顺序

1. 确认同一用户和正确 token。
2. 检查待 push mutation。
3. 检查 Server mutation_log 是否有当前用户记录。
4. 检查 pull afterId 是否前进。
5. 检查 delete 是否在客户端和 Server 采用同一语义。
6. 检查重复或乱序应用。

禁止直接 hard delete Server 数据作为同步修复。若涉及多个端，先暂停写入并导出诊断信息。

## WebSocket 异常

### 检查

- URL 是否为 `/ws/sync?token=...`。
- 反向代理是否允许 Upgrade。
- HTTPS 页面是否使用 WSS。
- PING 是否携带有效 token。
- Server 是否因 60 秒审计关闭连接。

成功判据：合法 token 握手成功、PING 得到 PONG、无效/过期 token 被关闭、退出后连接断开。

## Mobile 构建或运行异常

```powershell
cd Auralis-Mobile
npm.cmd run build:h5
npm.cmd run build:mp-weixin
node scripts\check-tablet-sidebar-transition.mjs
```

- 命令行失败先记录首个错误和 Node/npm 版本。
- 微信运行问题进入开发者工具检查合法域名、权限和条件编译产物。
- 真机 API 失败优先检查 `127.0.0.1` / `localhost`。
- Tablet 手写入口缺失可能是 feature flag 预期行为。

## 备份

必须协调备份：

- PostgreSQL 业务数据。
- MinIO 用户资产。
- 部署配置与 secret 的安全备份。
- 必要的客户端端侧笔记导出。

每次备份记录：时间、环境、提交、数据版本、工具、校验值、加密、保存位置、保留期和恢复负责人。

## 恢复

1. 明确恢复点和允许的数据丢失窗口。
2. 停止应用写入。
3. 保存故障现场。
4. 按依赖顺序恢复 PostgreSQL、MinIO 和配置。
5. 启动 Server，再启动客户端入口。
6. 执行 Auth、数据、同步、资产和 AI 冒烟。
7. 对比数据量、cursor 和关键对象。
8. 记录实际 RPO/RTO。

当前仓库没有正式备份脚本和恢复演练记录，因此生产恢复仍是未关闭风险。

## 数据目录清理门禁

清理 `data/` 前必须：

- 输出并人工确认解析后的绝对路径。
- 确认路径位于仓库 `data/` 内。
- 确认备份可读取。
- 停止相关容器。
- 使用同一 PowerShell 会话和 `-LiteralPath`，禁止把路径传给另一 shell 拼接删除。

## 事件记录模板

```text
事件时间：
环境/版本：
发现方式：
影响用户与功能：
首个错误：
已保存证据：
处置步骤：
恢复时间：
数据影响：
根因：
后续任务与关闭条件：
```

## 升级原则

- 涉及凭据泄露、跨用户访问、数据丢失或不可逆迁移：立即 P0 升级。
- 涉及主流程不可用但数据安全：P1 升级。
- 单平台体验退化且有替代路径：P2 记录并排期。
- 无证据时不得把问题标为已恢复。

### Temporary Chat assistant content capture for local diagnosis

This local diagnostic is disabled by default. Set `AURALIS_AI_CHAT_DIAGNOSTIC_RAW_CONTENT_ENABLED=true` in the local `.env` to enable it for the backend container; the default output directory inside the container is `/tmp/auralis-chat-diagnostics` and can be changed with `AURALIS_AI_CHAT_DIAGNOSTIC_RAW_CONTENT_DIR`. It writes decoded assistant `delta.content` text as UTF-8 files, one per iteration, up to `AURALIS_AI_PROVIDER_MAX_RESPONSE_BYTES` per attempt (default 1 MiB). It does not capture prompts, reasoning, tools, headers, or credentials, and logs only IDs/path/size/completeness/truncation metadata. The files persist until manually removed. Turn the flag back off after the intended diagnosis; a running container needs a rebuild/recreate to use source/config changes. This does not automatically send a model request or deploy anything.
