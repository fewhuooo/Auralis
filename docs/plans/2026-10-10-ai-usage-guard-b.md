# AI 完整持久配额与个人中心额度实施计划

> 执行 Agent 依 `AGENTS.md` 使用 Luna；前端由 Luna 管理 Antigravity；整个任务只用一个只读 reviewer。使用 writing-plans 与测试驱动流程，所有实现先记录行为 RED，再记录 GREEN；不提交或部署。

日期：2026-10-10

状态：B 与 PC/Mobile/Tablet 个人中心额度已实现，相关自动验证、任务独占 PostgreSQL 迁移及唯一只读审查通过，批准范围 BLOCKER=0、IMPORTANT=0。未提交或部署，GUI/真实 Provider 验收独立开放。

## 目标、依据与保护

落实 [已批准 Usage Guard 设计](../design/2026-09-14-ai-usage-guard-design.md) 的阶段 1/2：统一 Provider 入口、任务预算、跨实例并发、持久小时/每日额度、预留/结算/过期回收、后台延期、usage 采集和 MVC 资源隔离。用户追加个人中心额度展示，新增当前用户只读额度 API。阶段 3 的异步 Overview 作业不在本轮范围。

保留已通过共通修复的 citation 展示、Overview 单调时钟 deadline、4608/6144 输出上限、分批与响应 index 校验、锁后 Clock claim fencing、generation 原子切换与匿名基线。必要接入可以最小修改冻结调用边界，不能恢复旧实现。OPTIONAL 缺口不顺带修改。

基点 `9256e3bb919bb5b7a12d060a2151a5ff48aa141c`，分支 `codex/ai-optimization`。本轮开始时全部 36 条 dirty/untracked 文件原字节副本、SHA-256、patch 和 status 已保存于 `D:/Temp/auralis-ai-usage-guard-b-20261010/baseline/`、`baseline-hashes.json`、`baseline.patch`、`baseline-status.txt`。主树已有用户修改、共通修复和历史证据都保留；各执行 Agent 使用新的独立验证副本，不覆盖旧 `server-safety` 或旧证据，不读取真实密钥或运行真实 Provider。

## 已裁定的关键边界

1. `ai_usage_locks` 保存 GLOBAL/USER 短事务锁，以及 TASK 的持久 owner/execution/lease；`ai_usage_reservations` 保存每次 Provider 调用。任务准入、调用预留及派发标记先锁真实 users 行并重查 ACTIVE，再统一 GLOBAL → USER → TASK 顺序，取锁后新鲜 Clock；结算/续租不反向获取 users，数据库连接或事务不跨 Provider I/O。派发标记是数据库授权点，不能撤销已授权的远端请求。
2. TASK lease 覆盖整个 Chat（retrieval + completion）或 Overview（MAP/REDUCE），不是只覆盖单次网络调用。稳定逻辑 key 用于同时执行互斥；Chat/Overview 完成后新执行 ID 可以手动重新生成，窗口费用仍保留。Ingestion 使用 job ID + generation 的稳定执行 ID，延期继续计同一 job 预算。
3. Gateway 用独立有界调度器为活跃 TASK/CALL 续租；失去 owner/lease 或数据库续租失败后不得开启新调用或接受成功。进程异常后按 lease 回收并保守结算；迟到结算及重复回调幂等。合作式 deadline 和 lease 不能宣称能强制撤回服务商已收到的网络请求。
4. 发送前预算/配置校验失败释放预留；已派发后 timeout、断流或未知 usage 按保守规则结算。实际 usage 可空，不能用零冒充缺失。单位分别为 UTF-8 字节硬边界、估算 token、实际 token；账本不是金额账单。
5. 新错误码固定为 `AI_REQUEST_BUDGET_EXCEEDED`(413)、`AI_TASK_BUDGET_EXCEEDED`(422)、`AI_CONCURRENCY_LIMIT`(429)、`AI_HOURLY_QUOTA_EXCEEDED`(429)、`AI_DAILY_QUOTA_EXCEEDED`(429)、`AI_GLOBAL_QUOTA_EXCEEDED`(503)。拒绝提供安全 `retryAfterSeconds/resetAt`，需要等待的响应给 `Retry-After`；413/422 为 retry=0/reset=null，不给等待型头。SSE 继续 `message.error`，不增加自动补发。AI 模块本地 advice 避免 shared 反向引用 AI；账户停用继续使用现行 UNAUTHENTICATED。
6. 配额默认保持已批准开发策略：全局并发 4、用户并发 2；用户小时 100000、用户每日 200000、系统每日 2000000 token；通过配置覆盖。任务限制必须校准：Chat 输出 4096、retrieval + completion 最多 2 次；Overview 保留 4608/6144，默认最多 24 次，累计 token 默认 524288；ingestion 默认最多 512 次、累计 token 16777216，以现行 raw 5MiB/ParsedDocument 200万字符、overlap 和 UTF-8 最坏输入验证，不套用旧 16 次/100000 策略。
7. 小时/日额度可能低于整份文档所需用量。为防中途拒绝后重复 embedding 和永久卡住，已完成批次必须保留 owner/job/generation/revision/内容 hash/ordinal 绑定的持久检查点，重启或窗口重置后从未完成部分继续。优先复用当前 generation 的 inactive `source_chunks` 保存已验证向量；批次持久化沿现有 Source → job 锁序和锁后 lease，完整提交之前这些行不能检索或切 active，最终一次 fenced 原子切换。无法安全复用时，由执行 Agent 提交必要最小存储变更给主 Agent裁定；不得仅延期后从零重做。
8. 配额/繁忙延期不增加普通失败次数，不进入 Source/job FAILED；独立 `ingestion_jobs.next_attempt_at` 控制 claim。`attempt_count` 保持单调的 claim 身份，不得减回并造成 ABA；新增独立 `failure_count` 记录普通失败，升级时保留历史已失败次数的语义。预算输入硬拒绝可作为明确终态，不在后台无限延期。过期或旧 attempt 不得改新 attempt。
9. `test-connection` 的 completion 同样受保护；`GET /models` 明确作为零 token metadata 操作受有界并发保护，不能留下任意模型调用绕过 gateway。Provider SSRF、DNS 固定、BYOK 和安全 transport 逻辑保留。
10. 当前用户只读 `GET /api/ai/usage` 返回 hourly/daily 两窗口，各有 `limitTokens/chargedTokens/reservedTokens/remainingTokens/resetAt`。窗口 UTC 整点/自然日，个人中心以本地时间展示；只公开本人额度，不公开系统总量、其他用户或凭据。加载失败不显示为零额度，迟到响应受账号围栏保护。
11. 删除账号不能删除系统当日累计用量并退款全局额度，否则可通过注册/调用/删号循环绕过系统配额。USER/TASK 锁随用户级联清除，reservation 的 user_id 可空且 `ON DELETE SET NULL`；匿名账本保留已结算/未知派发的窗口消耗，不保存正文、凭据或原始 task key。已删除用户不得发起新调用，剩余匿名 lease 按保守过期语义回收，重复/迟到结算仍幂等；这项必要安全校正不修改原账户删除业务流程。

## 任务 1：持久账本、策略与 gateway（Luna ai_baseline）

允许：`Auralis-Server/src/main/java/com/auralis/app/ai/usage/**`、`shared/config/AuralisProperties.java`、`src/main/resources/application.yml`，新增 `db/migration/V30__ai_usage_guard.sql`，对应核心/配置/迁移测试。该 Agent 独占迁移文件；接入 Agent 提供 next_attempt_at/failure_count/必要索引变更合并。现有直接构造 Ai record 的两个测试仅同步新增参数，不改业务断言。

内部接口确定为 `AiTaskContext(UUID userId, AiFeature feature, String taskKey)`、`AiInvocationGateway.beginTask(context)` → `AiTaskScope`；scope 提供 `complete(stage,provider,request,credential,timeoutMillis)`、`stream(stage,provider,request,credential,sink)`、`embed(stage,provider,model,texts,credential)`、零 token metadata 操作、`usage()` 聚合安全用量和幂等 `close()`。每个操作返回 `AiInvocationResult<T>(value,usage)`。新增 `AiTokenUsage(Long inputTokens,Long outputTokens)` 用于 Provider 原始可空值，`AiProviderUsage` 表示估算/实际/charged 及完整性。新增 `AiUsageLimitException` 承载稳定 code 和安全重试时间。精确接口文件发布后由所有执行 Agent 共同遵守。

- [x] 以 H2、独立 Guard/Gateway、可控 Clock 及实际 PostgreSQL 锁竞争验证 GLOBAL/USER/TASK 限制、累计预算、窗口边界、重复结算与 owner/lease；必要竞态有真实 RED/GREEN。
- [x] 实现两表迁移、固定锁序、原子 reserve/成功 settle、幂等 release/expire、活跃续租与安全读本人额度。
- [x] 完成 Provider invocation wrapper；已发但缺失 usage 保守结算，异常/重复 close 不泄漏并发或重复扣量；结算完成与 heartbeat 交接回归通过。
- [x] 配置正值/关系验证，校准现行输入/输出策略；保留 Provider 数据安全边界。
- [x] 隔离 Server 最终 H2/config 31/31、真实 PG 锁序 4/4，完整命令/退出码/日志/源 hash 见 `dispatch-handoff.txt`。

## 任务 2：业务、usage、延期续做与 HTTP 接入（Luna usage_integration）

允许：现有 `ai/AiStreamingService.java`、`OverviewGenerationService.java`、`ConversationService.java`、`AiProviderDiscoveryService.java`、Provider port/response/chunk/result、`internal/provider/**` 的必要 usage 解析、ingestion worker/job/completion/entity/repository、retrieval SourceChunk service/repositories 的必要 inactive 检查点、`shared/error/**`、MVC async 配置、当前用户 usage Controller/DTO、对应业务/HTTP/架构/OpenAPI 测试。不得编辑 core Agent 的 usage/配置/迁移。必要额外文件必须以 correctness 证据报告，不扩大前端/鉴权/部署范围。

- [x] Gateway 覆盖 retrieval+stream、多阶段 Overview、ingestion、连接测试和 metadata；调用防绕过与 usage/配额回归通过。
- [x] 扩 Provider 原始可空 usage，并保留现有构造签名和 EmbeddingResult 的 1024 finite 校验；解析终止 usage chunk，截断/缺失不能当实际零。
- [x] Chat 成功和失败均将安全 usage 写入既有 messages.usage_json；公开消息正文/会话回放和 owner 规则不改变。
- [x] 真实 PG 受控跨窗口及持久检查点重载验证已完成批次不再次出站、partial generation 不可检索、完整原子切换；延期不增加普通 failure_count，attempt_count 单调增长。OS 进程杀死/重启未运行，不能由多轮领取测试推断。
- [x] 添加六码 Problem Details/SSE 安全字段与 Retry-After，`GET /api/ai/usage` 严格当前 owner；硬预算不无限延期。
- [x] 有界 MVC async executor 与安全拒绝处理通过；实际阻塞流式任务时同步 API 响应回归、架构 Provider 防绕过通过。
- [x] 隔离业务聚焦 147/147，最新核心/PG 检查点/续做 37/37，运行时 OpenAPI 9/9、两端 SDK 同 hash；完整 Modulith 既有失败单独登记。
- [x] Docker daemon 未可用，采用任务独占 native PostgreSQL 17.11 + pgvector 0.8.6，在 loopback 63316 新建临时库；V1→V30 clean、V29→V30 历史数据 upgrade、真实 driver/Guard 锁竞争通过。未连接业务 5432，最终已停止自有实例；真实多实例服务进程联调未运行。

## 任务 3：错误与个人中心额度（Luna 管理 Antigravity）

允许：PC `services/clientErrorPolicy.ts`、`services/overviewFailurePolicy.ts`、现有 Profile 页及必要 usage API/测试；Mobile `api/aiClient.ts`、实际 Chat 页面和现有 Profile 页及必要 usage API/测试；生成 schema 由后端生成步骤统一处理。前端执行 Agent 在 Antigravity plan 返回后登记实际 allowlist，Gemini 3.1 Pro (High) 实施，不改依赖或后端契约。

- [x] Antigravity plan 两次返回空输出后，按已授权的明确范围计划在隔离 worktree 实施；Luna 管理并保护 citation/Asset/d.ts/个人中心功能。
- [x] 实际失败先 RED 后最小补修，完成六码 HTTP/SSE 提示和安全重试时间；保留显式重试，不自动循环。
- [x] 现有三端个人中心显示小时/今日 token 额度、已用/在途预留/剩余及重置时间，沿现有主题/组件；加载/失败/账号切换处理有效，未读取不伪造零。
- [x] Luna 检查完整 diff、allowlist、生成/依赖/删除/跨模块并验证候选 hash；PC/Mobile 专测、既有协议回归、最终 schema 下 type-check、PC/H5 构建通过，输出 D 临时目录。
- [x] 真实 GUI/Tauri/手机设备与网络联调明确标记未运行，委派或构建不等同业务验收。

## 任务 4：配置文档、独立审查与最终验证（主 Agent）

- [x] 根据已实现配置更新 `.env.example`/Compose 透传，不读取或修改真实 `.env`，`docker compose --env-file .env.example config --quiet` 退出 0，不部署。
- [x] 同步 Backend、Infrastructure、PC/Mobile、Frontend、Architecture、API、Database、Deployment、Runbook、Status、Issues、Changelog、批准设计与本计划；新增计划登记 README。
- [x] 复用单一 Luna reviewer，只读审查 correctness、race、deadlock、transaction、data integrity、security；IMPORTANT 由原执行 Agent 先复现再最小修复，最终批准范围 BLOCKER=0、IMPORTANT=0。
- [x] 核对实际命令/退出码/关键输出、源 hash、完整变更范围与基线，清楚区分自动验证、现有范围外失败和真实环境未覆盖。

## 已取得的实施证据

- 2026-10-10：`docker compose --env-file .env.example config --quiet` 实际退出 0；独立任务进程设有 20 秒上限，正常结束。原始 stdout/stderr/exit 保存于 `D:/Temp/auralis-ai-usage-guard-b-20261010/config/compose-config.*`。示例变量、Compose 与 `application.yml` 的 Usage Guard 键和默认值一致；MVC async executor 暂用固定 core 4 / max 8 / queue 16，无新增 env。没有读取真实 `.env`、部署或触碰业务数据。
- 2026-10-11 最终回写后：`check-final-document-links.ps1` 验证 19 份文档的 300 个相对链接全部存在，exit 0；这只证明目标存在，不替代语义审查。`check-user-preservation.ps1` exit 0，11 项原有用户修改全部匹配原始 SHA-256：源码/生成声明与非 AI 文档按原字节，六份有任务回写的文档只在内存剔除明确 AI 段落和已记录的两行 timeout 校正，未回写源文件。证据为本轮 `final-document-links.json` / `final-user-preservation.json`。跟踪文档/示例配置 diff-check 与新增计划空白检查单独记录；全工作树前端格式问题属于 OPTIONAL，没有扩改。
- 2026-10-11：Luna 管理实际 Antigravity Gemini 3.1 Pro High 委派（任务 `5f232f1eb2ce`、修正 `a2e8b9a83d97`，第三次任务停止后没有应用其产物）。候选的 Mobile SFC 语法/未声明错误变量、PC 非额度错误返回结构与 Overview 原有文案问题，均根据实际失败作最小补修。最终 17 条允许路径按应用前主树 hash 守卫写入，13 个已有文件修改、4 个新增，Tablet workspace 与基线一致；没有删除、依赖、生成 SDK 或两个 PC 自动声明文件变化。完整差分、保护路径及源 hash 位于 `frontend/candidate-vs-main-full.diff`、`final-main-source-hashes.json`、`protected-paths-hash-review.json`。
- 2026-10-11：前端联合候选 PC/Mobile type-check、PC build、H5 build 退出 0；Mobile 协议 24/24、Tablet 三脚本及 Mobile 62 文件静态扫描退出 0。Mobile 额度 GET 原直接请求漏掉现行 401 refresh，真实消费者/production executor RED 为 6/8；最小接入 `mobileRequest` 后主树 `node --experimental-strip-types --test scripts/r4-ai-usage-guard-ui.test.mjs` 8/8（exit 0），包括一次 refresh/retry 与失败 session 回调。AI stream 5/5、Overview 错误文案筛选 3/3 通过。最终 API/schema 下两端 type-check exit 0，检查源 hash 与主树一致；聚焦 auth 路径补修后没有重跑构建。完整说明见 `frontend/auth-refresh-handoff.md`。
- 前端范围外失败如实保留：轻量副本 R4 首轮 680 项/16 失败含候选两组错误，补修后定向 GREEN；其余缺 Rust/配置/后端 fixture 仅属副本缺文件。主树未修改的 deadline 用例有 CRLF SFC 提取语法错误和 legacy invalid schedules 自动完成断言失败，应用 B 前后均存在，没有扩大修改范围。原始日志 `frontend/joint-*` / `frontend/main-*` 不代表全量 PC R4 通过；原 `check:r4-pc` Rust 固定地址扫描失败仍在共通计划登记。
- 最终核心 H2/config 31/31（Gateway 6、Ledger 14、Schema 3、Guard 2、Config 6）与真实 PG 锁序 4/4 均 exit 0。必要真实 RED→GREEN 包括窗口边界/未派发过期释放、成功接受 `isCurrent → settle` 竞态、完成调用与 heartbeat 交接、账户删除 FK 死锁及 reserve 后停用仍派发。当前准入/预留/派发标记 users-first，成功接受原子结算，正常完成 heartbeat 仅续 TASK。报告 `dispatch-handoff.txt`，核心 manifest SHA-256 `D6FBEEDE9409F2AC3D16080CA453B592D7D3B2765EA47B98F66AF47A697CC834`；旧 23/29/30 项版本证据只作过程记录。
- 业务专项 147/147（exit 0），最终 dispatch 版本同步后的核心/真实 PG 检查点/续做 37/37（exit 0），覆盖计数重叠，不能相加。真实 Worker/Gateway/Guard 先持久化 27 条 inactive，小时额度拒绝后 PENDING/failure=0/attempt=1；推进 Clock 后只发送剩余 7 条，完整 34 条才 active，attempt=2/failure=0。合法 5MiB/raw 与 200万字符 parsed 最坏样例由生产 chunker/batching 校准在 512 次/16777216 token 任务默认预算内，2/2 通过。报告 `integration/integration-handoff.md`；最新验证副本与主树 466 个 Server 源/资源文件逐字节相同，manifest SHA-256 `C48F53369516C9BE68CFD22321432A1BBD3564AB0D29CBAB9964B05268A172DC`。
- 原 checkpoint 只读事务取得写锁在真实 PG RED；改为沿 Source → job 的可写短事务后 GREEN。硬预算无限延期和 AI advice shared→AI 循环已作必要最小关闭；完整 Modulith 门禁仍有 HEAD 同样可复现的 knowledge ↔ review 循环，四个涉及类与 HEAD hash 相同。Provider 防绕过专项 1/1 通过，不能写为完整 ArchitectureTests 通过。
- 任务独占 PostgreSQL 17.11 + pgvector 0.8.6 使用私有 D 数据目录、loopback 63316。实际 Spring/Flyway V1→V30 clean、独立 V29→V30 历史升级 1/1（exit 0）通过：先建 V29 数据，attempt=3 的 PENDING/PARSING/READY/FAILED 升级后 failure=3/2/2/3，且新账本 JDBC 写读 charged=1200。原日志 `integration/v29-v30-upgrade-pg.log`；core 的空 schema V30 锁测试不充当升级证据。自有实例 pg_ctl stop exit 0，status exit 3/no server，端口 63316 无监听；见 `integration/pg-stop-verification.log`。未连接或修改业务 5432。
- 运行时 OpenAPI 导出/最终比对 9/9（exit 0），SDK 脚本 exit 0；artifact SHA-256 `228C3C1FE25CAE06F7476FD018902DA6938060AF6ADB3EEDEB1F4909726C42EF`，PC/Mobile schema 同为 `CDC86A9A4E0823AEA05A74F6ACE053EA414AE0BC5D007DAC9100C0D4EA41985B`。文档/配置回写及最终单一 reviewer 报告独立于 GUI/业务验收。
- 唯一 Luna reviewer 最终只读代码与文档审查通过，B 批准范围 BLOCKER=0、IMPORTANT=0；相邻共通 OPTIONAL 为多字节 UTF-8 累计/单 chunk 超限的独立 worker 回归缺口，已登记且没有扩改。报告 `D:/Temp/auralis-ai-usage-guard-b-20261010/reviewer-final.md`，SHA-256 `3EC857B378463CA8651FF9D09C1B01D09074ED2DC6AA21844BDAD0CC6608590A`；未重复执行已有测试。
- 执行环境残留：轻量验证副本第一次误带入 PC Rust target，约 7.65 GB。删除仅该任务副本 target 的操作在执行前被工具策略拒绝，原始反馈只有 `blocked by policy`，未重试；完整绝对路径与反馈见 `frontend/cleanup-refused.txt`。残留保留，不影响当前实现或验证；没有清理用户、历史 Agent 或证据目录。

## 尚未完成的验收

真实 Provider usage 差异、持续 slow-drip/真实客户端断连后的停止、反向代理、Tauri/手机 GUI、微信构建、操作系统进程杀死/重启与实际多实例服务联调未运行；合成 Provider、多轮 claim 和真实行锁测试不能代替这些验收。当前开发额度不是产品套餐或费用承诺。相关自动回归通过、临时迁移通过和业务验收分别记录，未提交或部署。

## 最终证据入口与执行命令

日期均为 2026-10-11；以下 Server 命令在相应独立 Maven 验证副本执行，完整环境变量/临时库连接与退出码记录在上述两个 handoff，未使用真实业务库或 Provider。

| 验证 | 实际命令或报告入口 | 结果与边界 |
| --- | --- | --- |
| 核心 H2/config | `.\mvnw.cmd -q '-Dtest=AiInvocationGatewayTests,AiUsageLedgerBehaviorTests,AiUsageSchemaTests,AiUsageGuardTests,AiConfigurationTests' test` | exit 0，31/31；`dispatch-final-h2.log` |
| 原生 PG users/账本锁序 | `.\mvnw.cmd -q '-Dtest=AiUsageGuardPostgresLockTests' test`，任务库 `usage_guard_core_it` | exit 0，4/4；`dispatch-final-postgres.log`，q 模式成功日志可为空，handoff 记录 Surefire 计数 |
| 业务及最新受影响组合 | `integration/integration-handoff.md` 两条完整 `-Dtest=...` 命令 | exit 0，147/147 和 37/37；`business-final-fresh.log` / `final-affected-suite.log`；版本/重叠范围见 handoff |
| V29→V30 upgrade | `.\mvnw.cmd -B -ntp '-DforkCount=0' '-Dtest=V29ToV30PostgresUpgradeEvidenceTests' '-Dauralis.usage.upgrade.url=jdbc:postgresql://127.0.0.1:63316/usage_guard_upgrade_it_20261011_0054' test` | exit 0，1/1；只在临时 harness/任务库执行 |
| OpenAPI/SDK | `.\mvnw.cmd -B -ntp '-Dtest=OpenApiArtifactTests' test`；`scripts/generate-openapi-sdk.ps1 -SkipExport` | exit 0，运行时比对 9/9，SDK 两端同 hash |
| 前端实际行为 | `node --experimental-strip-types --test scripts/r4-ai-usage-guard-ui.test.mjs`；Mobile `npm run test:r4-mobile` | exit 0，8/8 与 24/24；没有挂载 GUI |
| 最终生成类型 | PC/Mobile 验证副本各 `npm run type-check` | exit 0；`frontend/schema-final-*-typecheck.log`；前后源 hash 对齐 |
| 示例 Compose | `docker compose --env-file .env.example config --quiet` | exit 0；未部署/读取真实 `.env` |
