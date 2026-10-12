# Auralis 运维与应急 Runbook

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

更新时间：2026-10-11

文档状态：现行，部分流程待生产演练

权威范围：运行期诊断、恢复、备份与升级条件

事实来源：当前 Compose 服务、Server 配置、客户端请求/同步实现与已知风险

## AI Provider 超时诊断

`MODEL_TIMEOUT`（HTTP 504）表示 Provider socket response/read 超时；`MODEL_UNAVAILABLE`（HTTP 503）保留给其它不可用/IOException。检查 backend 的 `AI_PROVIDER_HTTP_FAILED` 中 `errorType=SocketTimeoutException`、host/path 和 elapsedMs，不记录 key 或 prompt。默认连接超时为 3000ms，普通聊天/流式/embedding response-read 为 10000ms，Overview map/reduce 非流式窗口为 120000ms（允许 60000–120000ms）；仅在确认上游生成耗时确实较长时调整 `AURALIS_AI_OVERVIEW_RESPONSE_TIMEOUT_MILLIS`，不要把普通请求窗口改成 Overview 窗口。

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
- 默认 Provider 的 `DEEPSEEK_API_KEY`/`OPENAI_API_KEY`/`SILICONFLOW_API_KEY` 是否已注入后端进程；用户 BYOK 是否在 `GET /api/ai/settings` 显示 `hasApiKey=true`。
- API key、base URL、model 与 `AURALIS_AI_DEFAULT_PROVIDER` 是否匹配。
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
