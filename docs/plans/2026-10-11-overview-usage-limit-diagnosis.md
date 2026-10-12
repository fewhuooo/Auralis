# 学科总览用量误拒绝诊断与最小修复

日期：2026-10-11（Asia/Hong_Kong）

状态：根因已确认；代码、相关自动验证与唯一只读审查通过，未部署本轮修复。

## 需求与范围

排查学科总览在 `PROVIDER_REQUEST` 后仅 26ms 失败的 `AiUsageLimitException`。核对全部拒绝规则、预留和结算生命周期、异常传递、调度器及历史未释放预留。保留现行用量安全限制和全部用量记录；先取得源码、运行镜像及可复现反例，再修改必要代码。

当前工作树的 B 用量与 Overview 超时/取消代码已有验证和审查，按 frozen 保护。本轮只以明确 correctness 反例解除相关行冻结，不重构账本、调度器、接口或数据库。不触碰其他任务的 PC、Mobile、Review 等未提交修改。Luna 执行代理分别承担源码/隔离测试和运行态只读检查；主 Agent 裁决、文档和最终验收，完成后由同一个 reviewer 只读审查。

## 已确认根因

`OverviewGenerationService` 保留中间输出 4608、最终输出 6144 token。学科直接生成和单批文件生成的最终输出使用 `AiStage.OVERVIEW_MAP`；MAP/REDUCE 表示生成操作，不等同于中间/最终输出。

`AiUsageGatewayService.Scope.boundedRequest` 却只允许 `OVERVIEW_REDUCE` 使用 6144，其他 Overview 阶段最多 4608。合法的最终 MAP 请求因此触发 `AI_REQUEST_BUDGET_EXCEEDED`（413），发生在 `guard.reserve`、`markDispatched` 和实际 Provider I/O 之前。这是内部阶段预算不一致导致的误拒绝。

2026-10-11 本机运行镜像已更新：image 创建于 UTC 05:07:44，container 启动于 UTC 07:14:47。本轮复制出来的部署 JAR SHA-256 为 `60561D77667E71EC2C63FF8A040E2EE8AF5C9C6D8FF9617912C9139F20845BE9`。部署字节码同时包含上述 6144 最终 MAP 调用与 4608 网关阈值，证实故障版本包含同一缺陷；没有沿用先前旧镜像的判断。

现场 UTC 07:16:49.493 START → .511 PROVIDER_REQUEST → .519 FINAL 失败，关联 request 以脱敏标签 `rid-B20004EB7F48` 保存。原日志没有真实用量拒绝码，不能把该日志标签当作 Provider 网络出站证据。新隔离反例实际复现 `AI_REQUEST_BUDGET_EXCEEDED`、Provider 调用 0 次、reservation 0 行。

## 账本与异常检查

UTC 07:23:35.894 和 07:24:49.332 的两次短 `BEGIN READ ONLY` 快照均退出 0，使用 5 秒 statement timeout；V30 已成功安装，reservation 全表 0 行，全局及目标用户小时/日用量均为 0。对应 Subject TASK 行仍保留任务标识，但 owner 已清空、lease 为 NULL；保留审计行和标识不代表仍占并发。本轮没有清空记录、执行回收写入或调用可能回收租约的额度查询 API。快照比失败晚 7–8 分钟，不能用于排除失败瞬间的一切并发，但确定性的预留前预算拒绝不依赖该瞬间账本状态。

`invoke` 显式原样抛出 `AiUsageLimitException`，默认 JSON 专用 advice 和 SSE 终端错误保留其业务码与状态。问题是失败日志的 `stableErrorCode` 只识别 `DomainException`，将用量异常的诊断码记成 `OVERVIEW_GENERATION_FAILED`；日志误分类不能推断 HTTP/SSE 也被包装。最小修复只允许现行安全白名单中的用量码进入日志，未知码仍回退，不输出原始异常文本、prompt 或堆栈。

### 全部拒绝规则与抛出位置

| 业务码 / HTTP | 规则与当前实现位置 | 与本次故障关系 |
| --- | --- | --- |
| `AI_REQUEST_BUDGET_EXCEEDED` / 413 | `AiUsageGatewayService`：输出 bounds 224；请求 UTF-8 字节 bounds 200；embedding null/字节 bounds 207/211；共用异常 factory 231。均在 reserve/派发前。 | 本次为旧输出 bounds：合法 FINAL MAP 6144 超过旧 4608。 |
| `AI_TASK_BUDGET_EXCEEDED` / 422 | `AiUsageGuard.reserve` 110：任务调用次数达到上限，或累计估算输入与预留输出超过任务剩余 token 预算。 | 非本次触发规则；仍保留。 |
| `AI_CONCURRENCY_LIMIT` / 429 | Guard 64/100/151/364：任务独占、全局/用户活跃调用数、所有权或派发授权失效；Gateway 189：scope 已关闭/失租；173：成功结算围栏不接受或执行期间失租。 | 非本次触发规则；后两处可在 Provider 工作后出现。 |
| `AI_HOURLY_QUOTA_EXCEEDED` / 429 | Guard 117，经 `limit` factory 472–475：下一调用预留超过用户当前 UTC 小时额度。 | 快照为 0 用量；此门禁未被本次调用到达。 |
| `AI_DAILY_QUOTA_EXCEEDED` / 429 | Guard 121，经同一 factory：下一调用预留超过用户当前 UTC 日额度。 | 同上。 |
| `AI_GLOBAL_QUOTA_EXCEEDED` / 503 | Guard 125，经同一 factory：下一调用预留超过系统当前 UTC 日额度。 | 同上。 |

413/422 的 retry 为 0、reset 为 null；小时/日限额按下一个 UTC 窗口给出 retry/reset，并发按有效租约或短等待给出 retry。`AiUsageLimitException` 构造器将负 retry 归零。完整 construction/factory/caller 列表见 `D:/Temp/auralis-ai-usage-failure-20261011/usage-integration/throw-site-map.md`。

### 用量生命周期结论

- beginTask/reserve/markDispatched 先锁活动用户，再按 GLOBAL → USER → TASK 锁序；账本是短事务，Provider I/O 处于 `NOT_SUPPORTED`，不持账本事务。
- reserve 检查租约/并发、任务、小时/用户日/系统日预算后才写 RESERVED。拒绝事务回滚，scope 的 try-with-resources close 仍取消 heartbeat 并释放自己拥有的 TASK owner/lease。本次在 reserve 前拒绝，因此没有需要取消的 reservation。
- reserve 成功后先 markDispatched 再 Provider I/O；成功且完整可信 usage 使用实际输入/输出结算，未知/不完整 usage 或已派发失败保守计账。未派发的失败/到期预留释放为零计费，不能把已派发失败归零。
- heartbeat 续 TASK 和当前 reservation；失租阻止新调用，成功结算原子裁决 owner/lease。close 幂等且仅释放本 scope 的有效 ownership。调用槽位以有效 RESERVED 租约计数，COMPLETED/FAILED/RELEASED/EXPIRED 历史行不永久占并发。
- 崩溃后的 reservation 在 beginTask/reserve/snapshotForUser/成功结算相关路径惰性到期回收：未派发零计费，已派发保守计费。本轮没有发现历史预留积压，没有修改以上逻辑或记录。

## 调度检查

`aiUsageHeartbeatExecutor`、`overviewDeadlineScheduler`、`overviewHeartbeatScheduler` 是显式传入对应调用的独立调度器。默认 Spring 调度路由面对多个 `ScheduledExecutorService` 且无 `taskScheduler` 命名 bean 时输出歧义警告；新的最小 Spring 7 隔离测试仍观察到 12 次 `@Scheduled` tick，因此警告本身不能证明调度停止。

用量过期回收没有独立 `@Scheduled` 作业，当前通过 beginTask/reserve/snapshotForUser 惰性回收。不能把默认调度器警告解释成用量清理任务失效。本轮不为消除警告修改调度配置。

## 批准的最小修改

1. 网关对两个现行 Overview 操作都允许既有最终上限 6144；生成服务的中间输出仍为 4608，最终仍为 6144。6145 必须继续在预留前拒绝；聊天上限及全部任务/小时/日/系统预算、并发、租约、保守结算保持不变。
2. Overview 安全失败日志识别既有六类 `AiUsageLimitException` 码，未知码仍为通用回退。
3. 回归覆盖真实生成服务 → gateway → 隔离 H2 → 受控 Provider 的 Subject 与单批 Source 最终调用、结算和释放；超上限无 Provider/预留；JSON/SSE 真实码；安全日志脱敏和未知码回退。无需新 enum、迁移、DTO、配置或依赖。

## 验证与交接

- 修复前反例：隔离副本运行 `mvnw.cmd -o '-Dtest=AiInvocationGatewayTests#diagnosticSubjectOverviewFinalOutputBudgetMustReachProvider' test`，退出 1，1 项断言失败；日志 `D:/Temp/auralis-ai-usage-failure-20261011/usage-integration/overview-budget-diagnostic-red.log`。失败类型为预算误拒绝，非 Provider 故障。
- 初始隔离副本 `D:/Temp/auralis-ai-usage-failure-20261011/usage-integration/server-copy`：`mvnw.cmd -o -Dtest=AiUsageLedgerBehaviorTests,AiInvocationGatewayTests,AiUsageExceptionHandlerTests,AiOverviewServiceTests,AiConfigurationTests test`，退出 0，85/85；覆盖既有预留、额度、结算、异常 advice 和配置。调度路由 scratch 1/1、实际 tick 12，证据为 `scheduler-router-diagnostic.log`；没有由此推断生产所有调度任务已验收。
- 主树 `Auralis-Server`：`mvnw.cmd -o -Dtest=AiInvocationGatewayTests,OverviewBudgetIntegrationTests,AiOverviewServiceTests#logsKnownUsageCodesAndHidesUnknownCodesAndExceptionDetails,AiUsageExceptionHandlerTests test`，退出 0，19/19，日志 `main-usage-budget-green.log`。覆盖 6144 正常通过、6145 和聊天超上限拒绝、六类 JSON 错误码与安全日志。
- 主树新增 TASK owner 释放断言后：`mvnw.cmd -o -Dtest=OverviewBudgetIntegrationTests test`，退出 0，2/2，日志 `main-overview-gateway-integration-final.log`。两条真实生成 service → gateway → H2 → 受控 Provider 路径分别验证单批 Source 和 direct Subject 最终 MAP 6144、COMPLETED 实际结算 12 token、TASK owner 释放；与上方 19 项重叠，不相加。
- 主树：`mvnw.cmd -o -Dtest=OverviewSseSocketIntegrationTests#subjectUsageLimitKeepsSafeCodeAndRetryMetadataInSseTerminalEvent test`，退出 0，1/1，日志 `main-sse-usage-limit-green.log`。本机 Tomcat/TCP 验证开始流后的 error 码/status/retry/reset。初次尝试的合成异常先于首个 heartbeat，实际返回正常 HTTP 429 ProblemDetails；只调整测试触发时序，未修改生产 SSE。失败日志保留，不能算产品缺陷。
- 主树最终唯一测试覆盖为 20 项，单独 2 项是追加断言后的重跑；与初始 85 和 scratch 结果不累加。测试版本对应 `final-manifest.json` 六个主树/已测副本同 hash 文件：两处生产文件及 gateway、生成服务日志、Overview/H2 集成和 SSE 四处测试。
- 证据目录：`D:/Temp/auralis-ai-usage-failure-20261011/`。原始基线记录 branch/HEAD 与 171 个既有变更路径 hash。业务数据库仅作短只读查询，测试使用独立临时副本/库和受控 Provider。
- 本轮修复尚未部署；真实 PC、代理、Provider 成功生成和 GUI 验收待新版 backend 部署后完成。现场拒绝码由部署逻辑、确定性路径及反例归因，原失败日志未直接记录该码或 HTTP/SSE 响应内容。

文档已回写 Backend、Infrastructure、Status、Issues、Runbook、Changelog，并登记 README；API/数据库结构、生成产物、依赖及配置未变化。本轮实际使用 Luna 执行与 Codex 只读审查，没有前端改动或 Antigravity 委派。工作树未提交、未部署。

### 最终只读审查与审计

- 唯一 reviewer 对照本任务完整 patch、task-before 和主树 six-file manifest，结论 BLOCKER=0、IMPORTANT=0、OPTIONAL=1；报告 `D:/Temp/auralis-ai-usage-failure-20261011/final-review.md`，SHA-256 `BCB51F6EF9473FB8B247E0D89BD5900F7EEC11C0511A358B350AB2DF3D33ECC1`。
- OPTIONAL 是 manifest 的 evidence 索引中两份诊断报告 SHA 在范围/位置文字纠正后未更新。六项源码/测试与已测副本 SHA 均一致，不影响代码或测试判定。按仓库 OPTIONAL 本轮不得修改，该索引项保留；报告当前值直接取实际文件：代码诊断 `3020D4ADD50DFD6870A947F09D8FB8B57172B1079DFB998C237C179FBB4F15DD`，throw-site map `D19EF490D45510B83D1429E4402166E54E4A031F0EB93B3123D454E64F45FA7B`，运行态诊断 `9BBDFEFDB30E02E04C197986AE1DE36AB0A69CC2A49EFA2E6235A60F27F4A63E`。
- Root 审计六项主树 source/test hash 与已测 manifest 一致、HEAD 保持 `9256e3bb919bb5b7a12d060a2151a5ff48aa141c`。初始基线 171 路径，本任务修改其中 12 项并新增集成测试与本诊断文档；其他并行 PC/文档修改仍在演进，仅记录保留，没有还原或覆盖。第一次审计 156 项保持原字节、3 项范围外发生变化；最终逐文件状态与最新计数以 `D:/Temp/auralis-ai-usage-failure-20261011/root-final-audit.json` 为准，不宣称范围外文件全部未变。
- 文档本地链接检查 253 项无缺失，范围内 `git diff --check` 退出 0；文档审查结论回写后再执行最终审计。上述检查不能替代真实 Provider、PC/代理/GUI 或部署后业务验收。
