# Auralis 运维与应急 Runbook

更新时间：2026-11-15

文档状态：现行排障指南，生产恢复演练仍按 current 跟踪

权威范围：故障取证、诊断、恢复判据、备份与升级条件

事实来源：当前请求/同步/AI 实现、Compose、应用配置与开放风险

## 使用原则

本文按故障场景维护。配置、构建和发布步骤见[部署指南](Deployment.md)，当前风险见[问题登记](../current/IssuesAndReview.md)。历次现场、旧算法排障和镜像信息完整保存在[整理前记录](../archive/maintenance-2026-11-15/Runbook.md)，不能据此重复历史数据库清理或恢复退役配置。

1. 先确认影响范围、版本和首个错误，保存脱敏证据后再改变状态。
2. 不打印 secret、token、验证码、签名 URL、完整 prompt 或用户正文。
3. 数据写入、删除、凭据修改、部署或重启须在授权范围内；无法证明安全时停止写入。
4. 代码存在、测试通过、服务健康和业务恢复分别记录；未观察到的恢复不得标为成功。

## 快速取证

在仓库根目录：

```powershell
docker compose ps
docker compose logs --tail 200 backend
docker compose logs --tail 100 db
docker compose logs --tail 100 minio
docker compose logs --tail 100 minio-init
```

日志可能包含用户相关信息，应在受控环境查看并脱敏后共享。记录香港时间、环境/镜像/提交、受影响端、脱敏用户/设备、请求路径、HTTP 与业务 code、request/run/attempt ID、最近同步 cursor。没有运行容器时先查对应本地进程，不因旧记录称 Docker 不可用而判断当前环境。

## Server 启动失败

检查 Java 21、Maven Wrapper、目标 profile、端口、PostgreSQL/MinIO 地址、必填环境变量和迁移日志。只确认凭据是否配置，不输出值。`config --quiet` 通过不能代替服务连通。

- 网络/凭据错误先修正目标配置，不重建数据库卷。
- Flyway 失败、数据损坏、生产 secret 不明或需改 schema：保存首个错误并升级，不循环重启或改历史迁移记录。
- 成功判据：应用稳定启动，liveness/readiness 正常，公开身份入口响应且受保护 API 拒绝无 token 请求。

启动与更新命令统一见部署指南，避免诊断时意外启动第二个服务。

## 验证码邮件

接口 503 时检查 SMTP 主机、发件地址和队列；204 后未收到时检查收件地址、垃圾邮件与投递记录。确认发件账号有代发权限和 STARTTLS 配置。使用隔离邮箱验证注册及找回密码，不记录验证码或 SMTP 凭据。

配置入口见[验证码邮件配置](Deployment.md#2026-11-15-验证码邮件配置)。成功判据包含实际收到邮件及完成对应流程，不能仅看接口返回值。

## PostgreSQL 异常

检查磁盘、卷权限、连接数、数据库名和迁移日志；连接失败不等于数据丢失。数据库锁等待与 Provider 超时分开排查。

只读诊断使用短事务与有界查询，避免为统计而长时间持锁。迁移失败先备份并确认 SQL；损坏按已演练恢复方案处理。恢复后核对数据量、关键对象和业务读写，不只检查端口。

## MinIO 上传与资料处理

依次核对：API/bucket 健康、内部与公开 endpoint、客户端 PUT/CORS、签名有效期、当前用户对象归属、大小/MIME/hash 与 complete 响应。URL 和 headers 不进入公开日志。

观察 `ASSET_UPLOAD_INTENT_CREATED`、`ASSET_UPLOAD_COMPLETE_REQUESTED`、`ASSET_UPLOAD_READY` 与 `SOURCE_CREATED`：只有 intent 时先查客户端 PUT；complete 后未 READY 时检查对象 HEAD 与校验结果。Source 标题不是原文件类型依据。

FILE 处理还应核对 Source revision、当前 job/lease、客户端解析与上传 receipt、已接受 ParsedDocument 和索引阶段。区分上传完成、服务端接受、索引 READY 与 GUI 收敛；旧 revision/旧 worker 不得覆盖新状态。网络暂停按当前界面显式继续，不能删除 receipt 强制重跑 OCR。

当前 `ParsedDocumentService` 与 `IngestionWorker` 未提供解析包上传意图、complete 和索引任务的专用生命周期事件。排查时关联 `sourceId`、`parsedDocumentId`、`ingestionRevision` 与 `jobId`，结合索引 generation、任务尝试次数及有效 lease、complete 响应和持久化状态核对；`ASSET_UPLOAD_*` 不能证明解析包已被接受或索引完成，也不能仅凭缺少解析包事件判断请求未执行。

共享诊断只保留必要标识、阶段、计数、耗时与稳定错误码/异常类型。正文、OCR 文本、文件名、hash、object key、签名 URL/headers、token、密钥，以及可能含这些信息的异常 message/stack trace，须在共享前移除。

### 数据库与对象孤儿核对

先按脚本要求安全注入数据库/MinIO凭据，从仓库根运行：

```powershell
.\scripts\audit-minio-assets.ps1
```

该脚本对账 `assets.object_key` 与 bucket 对象。报告缺失或孤儿不自动授权删除；先核对保留期、状态、引用、备份和用户范围。恢复后重新确认上传、complete、下载及所属用户。

## AI 连接、模型与生成失败

- 根据当前实际 Provider 选择检查配置：账号 BYOK 查询本人 settings 的 `hasApiKey`，平台生成检查 `AURALIS_AI_GENERATION_*`，向量化检查 `AURALIS_AI_EMBEDDING_*`。
- `MODEL_UNAVAILABLE` 且未派发：平台 Overview 核对两项模型容量；BYOK 核对 Provider/endpoint/model 精确匹配条目。配置说明见[部署指南](Deployment.md#平台生成与-embedding)。
- 向量响应必须包含 1024 个有限数值；模型可连接不证明历史向量空间匹配。
- 区分 HTTP 非 2xx、SSE frame JSON/协议错误、`consumer_callback` 与 `transport`。稳定业务码、阶段、异常类型、耗时与脱敏 host/path用于定位；截断错误消息不能还原完整上游内容。
- 不把已进入本地 callback 的失败诊断成凭据失败；不根据 `PROVIDER_REQUEST` 一条日志断定请求已经派发，它可能仍在预留前。
- 恢复后分别验证普通 Chat、SSE、文本/文件摄入与 Overview，不以单一路径成功代替全部能力。

## Overview 容量、超时与取消

当前为 CLEAN → OUTLINE → SUMMARY 与自动分批。`OVERVIEW_PROMPT_BUDGET_EXCEEDED` 核对阶段请求/最低输出预算；`AI_TASK_BUDGET_EXCEEDED` 核对整次任务累计用量。安全估算日志如 `AI_INPUT_TOKEN_ESTIMATE` 仅是估算依据，不代表供应商实际 token。

正数 `AURALIS_AI_OVERVIEW_MAX_INPUT_TOKENS` 限制单请求估算输入，0 仅关闭该额外上限。分批仍受模型容量、原任务预算和期限限制；不通过恢复旧 adaptive、Writer/checkpoint、自动 JSON 修复或旧 publication 路径排障。

SSE 心跳仅维持连接，最终 `result` 是成果；响应开始后的业务失败在 `error` 携带 code/status，HTTP 200 不表示成功。缺少最终事件按状态不确定处理，不能自动创建重复模型请求。

排查期限时区分 Provider 连接/响应窗口、Overview 整任务期限、Chat attempt deadline、PC 外层期限与代理空闲超时。长空窗被截断先查同请求的 MVC/代理日志。入口预算可能已耗在 preflight 或数据库锁等待；关闭 socket 不强制打断 JDBC，原生 DNS 也不因 Future.cancel 就确定结束。

取消验收必须同时观察连接关闭、工作退出、预留结算与任务释放。已派发且 usage 未知的调用保守计账，取消不是零费用证明；远端计算能否撤回不能由本地 socket 关闭证明。直接入口成功也不证明后台学科作业输入路径可用，开放项见问题登记。

## 配额、UNKNOWN 与 ingestion 等待

记录稳定 code、`retryAfterSeconds/resetAt` 后查询本人额度。小时/日耗尽等待重置，并发繁忙等待现有任务；任务或单次预算拒绝不能靠自动循环重试解决。

`INGESTION_EMBEDDING` 与 `RETRIEVAL_EMBEDDING` 不计入用户小时/日及系统日 Token 窗口，但仍保留账本并受任务预算、适用调用次数、并发和 Provider 限制。不能用未排除这些阶段的原始账本总和判断窗口耗尽，也不要把普通 Embedding 失败归因于窗口额度后盲目等待或提高额度。

账本排查分别看 RESERVED、有效 lease、request_dispatched 和 charged_tokens。TASK 标识存在而 owner/lease 为空不代表仍占并发。部分额度读取入口会惰性回收过期记录，并非严格只读；严格取证使用经批准的短只读数据库查询。

不得手工删除 reservation、把已派发请求改零、清空账本或绕过 Gateway。进程失败按租约/保守计量恢复，数据库故障先修数据库。Chat UNKNOWN 走现行显式恢复入口；恢复不等于退款，也不证明远端停止。`503 SERVICE_UNAVAILABLE` 加 `Retry-After: 1` 可能是有界异步队列拒绝，应核对负载并显式稍后重试。

ingestion 延期时检查 `next_attempt_at`、有效 claim、generation 与已完成 inactive chunks；不能仅凭最后一条 Embedding HTTP 日志判断卡死。先按实际错误码区分可恢复的额度/并发延期与普通失败重试，条件恢复后应从未完成批次续做，完整成功后切换 active generation；不要将历史版本的窗口延期现场套用到当前 Embedding。并核对 Source 是否仍活动，旧 worker 不应覆盖新 attempt。必要时使用现行重新摄入入口，不改旧账本伪造剩余额度。

## HTTP 401 / 403 与登录导航

检查 Bearer access token、有效会话、过期时间与 refresh 请求；refresh token 不能当 access token。合法续期最多按客户端既有规则重放；明确失效后清理会话返回登录，暂时网络故障保留可恢复状态。禁止关闭 Server 鉴权来修复客户端。

PC 路由使用 `resolveAuthRedirect`：未登录受保护页跳 `/login`，完整会话访问登录页回 `/`。核对刷新恢复、退出和账号切换的迟到回包，不将路由显示当作服务端鉴权证据。

## 同步不一致与排期失败

收集脱敏 user/device、实体/操作、mutation ID、baseVersion、本地 sync 状态、cursor 与 push/pull 响应。确认同一用户后依次核对待发送 outbox、服务端回执、cursor 推进、墓碑语义和乱序应用。不要打印 token 或 ticket。

排期失败区分领域冲突、版本拒绝、事务异常与同步回执。插入/换位是整组原子操作；先查首个服务端 cause 和当前投影，不能直接改任务时间绕过冲突。复习回执也须核对完整因果血缘，不能仅用云端状态覆盖未结算本地命令。

跨端数据异常先控制写入并保存诊断；禁止直接 hard delete 服务端数据或清空本地 outbox 作为通用修复。成功判据是当前账号的命令结算、墓碑与最终投影一致，且没有跨账号发布。

## WebSocket 异常

1. 使用 access token 调用 `POST /api/realtime/ticket`，确认设备会话有效。
2. 按响应 `websocketUrl` 连接 `/ws/events?ticket=...`；每次新握手取新 ticket。也支持 `X-Realtime-Ticket`，不得把 access token 放进 URL。
3. 检查各层代理路由和 Upgrade、HTTPS/WSS、ticket 过期或重复消费。
4. 观察提交后的 `SYNC_CHANGED` / `REVIEW_UPDATED` 通知及随后 REST 数据刷新。

成功判据为新 ticket 建连、无效/过期/重复 ticket 拒绝、变更通知与退出断开。通道仅发通知，当前不处理应用层 PING/PONG。

## PC 本地命令缺失

在 `Auralis-PC` 检查：

```powershell
Test-Path node_modules/@tauri-apps/cli/package.json
Test-Path node_modules/.bin/tauri.cmd
npm.cmd config get bin-links
```

包存在、入口缺失且 `bin-links=true` 时：

```powershell
npm.cmd rebuild --ignore-scripts
npm.cmd run tauri -- --version
```

依赖未安装时按锁文件 `npm.cmd ci`；不删除锁文件或装全局 Tauri 绕过本地依赖。再用 `npm.cmd run tauri -- info` 检查工具链，CLI 可用不代表 GUI 启动或安装升级通过。

## Mobile 构建或运行异常

按 [Mobile 模块](../modules/FrontendMobileTablet.md)选择 H5/微信构建与定向检查，保存首个错误和 Node/npm 版本。构建通过不代替类型门禁或真机验证；微信检查合法域名、权限及页面条件编译，真机检查 API 可达地址与弱网，Tablet 手写入口同时核对 feature flag。

## 本机诊断导出

默认关闭正文采集。Overview 显式使用 trace overlay 才开启 capture，宿主目录由 `AURALIS_OVERVIEW_TRACE_HOST_DIR` 指定，默认 `D:/Temp/auralis-overview-traces`；overlay 还把调用次数帽设为 0。启用、关闭或改变配置均按授权部署步骤进入运行环境，不能静默重启。

Chat 通过 `AURALIS_AI_CHAT_DIAGNOSTIC_RAW_CONTENT_ENABLED` 显式开启，目录变量为 `AURALIS_AI_CHAT_DIAGNOSTIC_RAW_CONTENT_DIR`，默认容器 `/tmp/auralis-chat-diagnostics`。它按 iteration 写解码后的 assistant content，每 attempt 受 `AURALIS_AI_PROVIDER_MAX_RESPONSE_BYTES` 限制；不是原始 HTTP wire，也不采集 prompt、reasoning、tools、headers 或凭据。

检查导出完整性/截断标记，原始正文只保留于受控位置；不会因 Source/账号删除自动清理。复现完成关闭采集，确认路径与保留要求后按授权清理。关闭配置不等于已删除导出，也不自动触发模型请求。

## 备份

协调保存 PostgreSQL、MinIO 用户对象、部署配置与解密密钥，以及必要的客户端本地数据。个人中心 JSON 仅覆盖其明确导出范围，不含原文件，不能替代数据库或 Local Asset 完整备份。

记录时间、环境、提交、数据版本、工具、校验值、加密、位置、保留期和恢复负责人。生产备份与恢复演练仍需按问题清单取得证据，不能用备份文件存在证明可恢复。

## 恢复

1. 明确恢复点与允许丢失窗口，经授权控制应用写入。
2. 保存故障现场，核验备份和解密材料可读。
3. 按一致恢复点处理 PostgreSQL、MinIO 与配置；不盲目反向迁移 SQL。
4. 启动 Server 后再恢复客户端入口，执行身份、权限、数据、同步、资产和 AI 冒烟。
5. 对比数据量、cursor、关键对象与用户隔离，记录实际 RPO/RTO 和未恢复项。

恢复涉及用户数据，不以文档中的命令示例作为删除/覆盖授权。

## 数据目录清理门禁

清理根 `data/`、命名卷、客户端数据或诊断目录前，确认实际用途、备份和授权，解析绝对路径并核对操作范围；不得把 Git 忽略目录一律视作垃圾。确认没有相关进程使用后，使用同一 PowerShell 会话和 `-LiteralPath`，禁止把计算路径交给另一 shell 拼接删除。递归操作前确认无路径越界；不得用删除依赖或数据代替环境诊断。

## 事件记录与升级

每次记录事件时间、环境/版本、发现方式、影响、首个错误、证据位置、实际命令与结果、恢复时间、数据影响、根因、下一步及关闭条件。只记录必要脱敏信息。

凭据泄露、跨用户访问、数据丢失或不可逆迁移立即按 P0 升级；主流程不可用但数据安全按 P1；有替代路径的单平台体验问题按 P2。无法确认恢复时保留开放状态。
