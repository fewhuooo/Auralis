# Overview 硬超时与取消实施计划

更新时间：2026-10-11

文档状态：现行；代码、相关自动验证与只读审查通过，真实环境待验收

权威范围：本轮 Overview 硬超时与取消的已授权范围、执行步骤、证据与交接

事实来源：当前 Overview/Provider/PC 实现、任务诊断与用户要求；证据目录 `D:/Temp/auralis-overview-cancel-20261011/`

> 执行方式：主 Agent 负责范围、契约、并发与最终验收；Luna 执行后端并管理 Antigravity 前端实现，最终只做一次只读 reviewer 审查。按仓库现行流程执行，不提交、部署或调用真实 Provider。

**Goal:** Overview 在总期限内主动结束本地 Provider I/O；PC 手动停止、页面离开及账户/资料失效能取消对应请求，保护共享生成与既有成功结果。

**Architecture:** 两个现行 Overview POST 路径保留 JSON 默认，增加 `Accept: text/event-stream` 可选响应。PC 使用心跳和最终结构化结果；服务端通过写失败感知断连，关联当前消费者的取消。共享生成有独立期限及兴趣计数，最后一个消费者退出或总期限到达时关闭当前调用独占的 socket，并让原有用量结算与任务释放完成。

**Tech Stack:** Java 21 / Spring MVC / HTTPS pinned socket、Vue / TypeScript、现有 SSE 与 Overview 校验和本地仓储。

## 授权与边界

- 用户已要求“先处理 Overview 的硬超时与取消”，并指定 Luna 管理 Antigravity；本计划落实该范围。
- 默认任务期限继续为 240000ms，PC 外层期限继续为 300000ms；不调整额度、预算、提示词、生成质量或缓存结构。
- JSON 路径获得硬期限，但在最终响应写入前无法保证及时感知客户端断连；PC 采用 SSE 路径。
- SSE 心跳间隔不超过一秒；`result` 的 data 为现行 `OverviewResponse`。`error` 的 data 为 `{code, detail, status, retryAfterSeconds?, resetAt?}`，沿用脱敏错误及额度等待信息。认证/参数校验等尚未开始响应的失败保留 HTTP ProblemDetails。
- 本地准入上限 24（包括排队与等待者），SSE 连接上限 8；实际生成 executor core/max/queue 为 4/8/16，只运行 owner 与独立 Subject 生成。deadline 与心跳各用单线程 scheduler，并即时移出取消的计时任务；心跳 750ms，writer 8 线程/8 队列，拒绝返回现行 `503 SERVICE_UNAVAILABLE`。期限从入口准入开始，涵盖预检、队列和传输；Source 共享生成保留原 owner 的入口绝对期限。终端超时不依赖 MVC 队列任务获得线程。
- 手动生成提供“停止”，切换学科/离开页面停止该页面发起的请求；后台自动生成保留。合并请求中一个消费者停止不影响其他消费者。
- 明确取消不写 FAILED，不删除已有成功缓存/同步意图；资料删除仍按现行删除围栏执行。资料修订变化、账户/runtime 停止取消相应旧请求；迟到结果仍有围栏。
- socket 关闭证明本地传输停止；不能证明远端 Provider 撤回已接收的计算。代理缓冲、真实 Tauri/GUI 和真实 Provider 单独验收。
- 不新增持久任务、取消 API、数据库迁移、依赖或跨实例取消路由；不修改 OPTIONAL 问题或已冻结的 B 账本规则。
- 入口绝对预算扣除预检/数据库等待；同步 JDBC 查询或数据库锁若阻塞，本轮无法强制中断，HTTP 响应或 SSE 建立可能晚于期限。预检返回后必须拒绝超期出站，PC 300 秒自身取消可退出等待。这里的硬取消针对 Provider 传输；不扩数据库事务取消、连接/锁超时或 JSON MVC 架构。

## 基线与诊断证据

- HEAD `9256e3bb919bb5b7a12d060a2151a5ff48aa141c`，分支 `codex/ai-optimization`。
- 工作树已有 B 和用户修改；任务开始将 116 个 dirty/untracked 文件按字节备份至 `D:/Temp/auralis-overview-cancel-20261011/baseline/`，并保存 status、binary diff 和 SHA 清单；不重置或覆盖。
- 后端诊断 `overview-cancel-diagnosis.md`：受控 Provider 阻塞 2500ms、任务期限 1500ms，实际 2658ms 才返回；预期 `<2000ms` 的测试退出 1（1 failure，0 errors）。这证明合作式检查不能中止阻塞调用。
- 前端诊断 `frontend/overview-cancellation-diagnosis.md`：已有 AbortSignal 和部分删除/替代围栏，但手动页面、runtime 停止和修订变化没有完整取消，服务端 JSON 无早期断连信号。

## Task 1：后端硬期限、共享取消与 SSE

允许路径：`OverviewTaskDeadline.java`、`OverviewGenerationService.java`、`AiController.java`、必要的 Overview 内部取消/SSE 类；`AiProviderPort.java`、`OpenAiCompatibleProvider.java`、`ProviderHttpTransport.java`、`ProviderHttpClient.java`、`PinnedSslSocketFactory.java`；`AiTaskScope.java`/`AiUsageGatewayService.java` 仅必要参数传递；相关测试和必要的有界 executor 配置。最终审查实际 DNS 阻塞 RED 后，追加 `ProviderEndpointPolicy.java` 与相关 policy 测试，仅给 Overview 增加可取消、有界解析等待；保留现行安全规则和其他调用路径。

- [x] 记录每个修改文件的原 SHA 和具体实现计划；发布最终 SSE 契约给前端执行者。
- [x] 先运行持续慢流/真实 socket 和断连 RED；保持 HTTPS/DNS pinning/重定向/隐私原规则。
- [x] 到绝对期限或最后兴趣取消时关闭本调用独占 socket，覆盖连接、TLS、写入及读取；保证注册与取消竞态、迟到取消及新调用隔离。
- [x] JSON 与 SSE 共用生成/用量生命周期；任务期限包含队列与所有 Provider 阶段。有界 writer/生成资源，拒绝沿用服务繁忙行为。
- [x] 验证发起者取消且仍有等待者、等待者取消、全部取消、共享期限、新旧请求替代；结算未知已派发用量一次，取消 heartbeat 并释放任务。
- [x] 实际本机 Servlet/TCP 断连检测通过后再声明本地断连已验证；不会仅以 MockMvc 或 Future.cancel 声称关闭 I/O。
- [x] 运行 affected Maven 回归，保存命令、退出码、计数、源码对应 SHA；按 hash 守卫只应用源文件，不应用 target。

基础验证命令（测试集按新增类名扩展，真实执行另记）：

```powershell
.\mvnw.cmd -B -ntp '-DforkCount=0' '-Dtest=AiOverviewServiceTests,AiOverviewControllerTests,AiProviderContractTests,AiProviderResilienceTests,AiProviderSecurityTests,AiInvocationGatewayTests' test
```

## Task 2：PC 取消消费者与交互

允许路径：`src/api/useOverviewApi.ts`、必要的专用 Overview SSE helper、`src/types/overview.ts`、`src/services/overviewGenerationService.ts`、`src/services/documentProcessing/runtime.ts`、必要的 `src/store/useSourceStore.ts` 修订钩子、`src/services/overviewFailurePolicy.ts` 的 SSE 错误/额度等待字段保留、`src/views/SubjectWorkspace/index.vue`、`SubjectOverviewSection.vue`/`OverviewSummaryView.vue`/`FileOutlineList.vue` 和相关测试。`FileOutlineList` 是现有文件行生成入口，只增加当前手动消费者的停止接口与按钮。全局认证 helper 仅有真实 correctness RED 后才作必要最小修改。

最终审查的真实 SQLite 取消写入 RED 后，追加 `src/services/overviewRepository.ts`，仅给上述两个生成保存路径加可选同步提交 guard，保留现行序列队列、scope/deletion 围栏、原子 cache/outbox 和自动缓存广播；不改 SQL adapter 或其他事务消费者。

- [x] Luna 使用 Antigravity MCP：先列现行文档、允许文件、验证命令并要求计划，再授权上述修改。记录真实调用/返回与完整差分审查。
- [x] 消费同路由 SSE，最终结果仍经现行 validator；EOF 不视为成功，取消关闭 reader，外层期限覆盖完整流。
- [x] 启动时捕获身份/会话；旧账户请求不能在新账户下 refresh/retry。分离消费者停止和资料删除，合并自动/手动兴趣互不误取消。
- [x] 实际行为回归：手动停止/离页、自动任务继续、最后消费者退出、runtime/account/修订失效、不写失败及不删除旧成功 cache/outbox、迟到结果围栏。
- [x] 保留现有版式与 B 个人中心额度；隔离类型/静态/构建，并检查生成 d.ts 和源 SHA。

```powershell
node --experimental-strip-types --test scripts/r4-overview-generation.test.mjs scripts/r4-document-processing-runtime.test.mjs scripts/r4-subject-overview-ui.test.mjs
npm.cmd run type-check
npm.cmd run check:r4-pc
npm.cmd run build
```

## Task 3：契约、文档与最终验收

- [x] 更新 API、OpenAPI、两端生成 schema，保留 JSON 响应和既有字段；运行运行时 artifact gate 和两端类型校验（Mobile 旧 Review 两处失败已记录，不计为两端均通过）。
- [x] 回写 Backend、FrontendPC、Frontend、Status、Issues、Changelog；资源或部署心跳约束涉及 Infrastructure/Deployment/Runbook 时同步。无数据结构变化则不改 Database。
- [x] 唯一 reviewer 只读检查 correctness/需求/race/资源释放/鉴权/数据完整性；必要修复交回原执行者。
- [x] 最终记录源 manifest、B/用户基线保护、通过/失败及未覆盖边界；批准范围 BLOCKER=0、IMPORTANT=0 且相关测试通过方可关闭。

## 进度与交接

2026-10-11：生产源文件与测试已按逐文件 hash 守卫回灌主树，相关自动验证通过；唯一只读 reviewer 已完成代码、补修和文档一致性审查，批准范围 BLOCKER=0、IMPORTANT=0、OPTIONAL=0。DNS、SQL 写入取消、SSE 503 与 writer 名额竞态均凭实际 RED/GREEN 最小补修。证据统一放在 `D:/Temp/auralis-overview-cancel-20261011/`；使用任务独占 H2 和受控本机 TLS/TCP，不使用业务库或真实 Provider。

- 真实 Antigravity 调用：Gemini 3.1 Pro (High)，task `fb8eef4c8fc4`，worktree `C:/Users/Gnasche/.agy-mcp/delegations/wt-cc59d1a6`。工具返回 exit 0，仅产出 API/helper/types 与测试，未完成 service/runtime/页面/Stop。联合候选真实 RED 为 61 项（53 pass、6 fail、2 cancelled），缺失 `stop/cancelAll` 是需求缺口；另两类来自 header 大小写及不可取消 reader 的夹具失真，Luna 按必要证据补齐实现和夹具。完整记录 `frontend/agy-partial-red-overview-full.log`；不把工具 exit 0 当作任务或业务验收。
- 后端持续慢流 RED 日志 `slow-drip-transport-red.log`：实际 1173ms 超过测试 `<400ms` 断言，1 failure、0 errors；新增 token 注册/清空竞态、MVC 饱和时期限终端事件、原 owner 入口期限保留均按必要证据补修。初期 3/3、4/4 等计数与最终聚焦套件重叠，不相加。
- 前端真实 RED 另见 `frontend/overview-red-corrected.log` 和 `overview-auth-terminal-red.log`；后者在 66 项中复现三处 refresh 等待取消/终端 reader 清理缺口，再恢复修复并取得最终绿色。中间运行的夹具问题包括 header 大小写、不可取消 reader、取消先于 Provider 启动、隔离目录缺少供静态测试读取的 Rust 源码，均在日志中保留，未伪装成产品问题或通过。

### 命令验证与来源

后端命令在 `server-copy` 执行；PC 类型、静态和构建在 `frontend/joint-main/Auralis-PC` 执行，应用后行为套件在主树复跑。完整执行参数及退出码见 `integration-handoff.md`、`frontend/overview-cancel-handoff.md`。

| 实际命令 | 退出码 / 关键输出 | 证据 |
| --- | --- | --- |
| `mvnw.cmd -o -Dauralis.test.tls.keystore=D:\Temp\auralis-overview-cancel-20261011\overview-test.p12 -Dtest=OverviewCancellationTests,OverviewSchedulerCancellationTests,AiOverviewServiceTests,OverviewSseSocketIntegrationTests,OverviewSseDeadlineSocketIntegrationTests,OverviewDeadlineSlowDripTests,ProviderSocketRegistryTests,AiInvocationGatewayTests#cancellationPropagationKeepsConservativeSettlementAndReleasesTaskLease,AiControllerTests,AiStreamingControllerTests,OpenApiArtifactTests test` | 0；84 项，0 failures/errors | `final-overview-focused-regression2.log` |
| `mvnw.cmd -o -Dauralis.test.tls.keystore=D:\Temp\auralis-overview-cancel-20261011\overview-test.p12 -Dtest=AiProviderContractTests,AiProviderResilienceTests,AiProviderSecurityTests,AiStreamingTests,ProviderHttpClientTests test` | 0；51 项，0 failures/errors | `provider-compatibility-regression.log` |
| `mvnw.cmd -o '-Dauralis.test.tls.keystore=D:/Temp/auralis-overview-cancel-20261011/overview-test.p12' '-Dtest=ProviderEndpointPolicyTests,AiProviderContractTests,AiProviderResilienceTests,AiProviderSecurityTests,AiStreamingTests,ProviderHttpClientTests,AiOverviewServiceTests,OverviewSseSocketIntegrationTests,OverviewSseDeadlineSocketIntegrationTests,OverviewDeadlineSlowDripTests,ProviderSocketRegistryTests,AiInvocationGatewayTests#cancellationPropagationKeepsConservativeSettlementAndReleasesTaskLease' test` | 0；124/124，含原 51 项及原 84 中 60 项，不相加 | `dns-overview-provider-regression-final3.log` |
| `mvnw.cmd -o '-Dtest=ProviderEndpointPolicyTests' test` | 0；11/11，与 124 重叠 | `dns-policy-final3.log` |
| `mvnw.cmd -o '-Dauralis.test.tls.keystore=D:/Temp/auralis-overview-cancel-20261011/overview-test.p12' '-Dtest=OverviewSseSocketIntegrationTests' test` | 0；最终 7/7，含写入屏障与 writer 拒绝清理；与初期测试重叠 | `sse-writer-permit-final-green5.log` |
| `mvnw.cmd -o '-Dauralis.test.tls.keystore=D:/Temp/auralis-overview-cancel-20261011/overview-test.p12' '-Dtest=OverviewSseDeadlineSocketIntegrationTests,OverviewSchedulerCancellationTests' test` | 0；最终 4/4，MVC 饱和时独立终态和计时器取消仍通过 | `sse-writer-deadline-scheduler-final.log` |
| `mvnw.cmd -o -Dauralis.openapi.export=true -Dtest=OpenApiArtifactTests test`；随后 `mvnw.cmd -o -Dtest=OpenApiArtifactTests test` | 各 0；各 11/11，与 84 项重叠 | `openapi-export-current-review.log`、`openapi-export-compare.log` |
| `npx.cmd --yes openapi-typescript@7.13.0 D:/Temp/auralis-overview-cancel-20261011/docs/contracts/openapi/auralis-openapi.json -o D:/Temp/auralis-overview-cancel-20261011/overview-generated-schema.ts` | 0；同步两端 SDK | `sdk-generator.log`、`contracts-backflow.json` |
| `node --experimental-strip-types --test scripts/r4-overview-generation.test.mjs` | 0；最终 72/72（初期 66 项包含在内） | `frontend/overview-generation-green.log`、`race-joint-generation.log` |
| `node --experimental-strip-types --test scripts/r4-overview-cache.test.mjs`；`node --experimental-strip-types --test scripts/r4-overview-sync.test.mjs` | 各 0；14/14、22/22 | `frontend/cache-green.log`、`sync-green.log` |
| `node --experimental-strip-types --test --test-timeout=10000 --test-force-exit scripts/r4-document-processing-runtime.test.mjs` | 0；20/20 | `frontend/main-runtime-final.log` |
| `node --experimental-strip-types --test --test-timeout=10000 --test-force-exit scripts/r4-subject-overview-ui.test.mjs` | 0；最终同步候选 16/16，Stop 保留 | `frontend/parallel-subject-ui.log`；初期 `main-subject-ui-final.log` |
| `node scripts/check-r4-pc.mjs` | 0；110 production files | `frontend/static-r4-pc-latest.log` |
| `node node_modules/vue-tsc/bin/vue-tsc.js -p tsconfig.app.json --noEmit --tsBuildInfoFile D:/Temp/auralis-overview-cancel-20261011/frontend/app-sse-final.tsbuildinfo`；同命令使用 `tsconfig.node.json` 与 `node-sse-final.tsbuildinfo` | 各 0 | `frontend/type-app-sse-final.log`、`type-node-sse-final.log` |
| `node node_modules/vue-tsc/bin/vue-tsc.js -b`；`node node_modules/vite/bin/vite.js build` | 各 0；Vite 15.16s，既有 chunk/dynamic-import/plugin 警告保留 | `frontend/pc-build-type-final.log`、`pc-build-vite-final.log` |
| `node node_modules/vue-tsc/bin/vue-tsc.js -p tsconfig.app.json --noEmit --tsBuildInfoFile D:/Temp/auralis-overview-cancel-20261011/frontend/app-parallel.tsbuildinfo`；`node node_modules/vite/bin/vite.js build` | 各 0；保留并行视图精简的最终候选，Vite 6.93s | `frontend/parallel-app-type.log`、`parallel-vite-build.log`，详细交接见写入竞态报告 |
| Mobile：`node node_modules/vue-tsc/bin/vue-tsc.js --noEmit -p tsconfig.json` | 2；旧 Review `EventRequest/EventResponse` 两个类型错误 | `frontend/type-mobile-final.log` |

隔离 PC 的 `npm run build` 因 Windows `.bin/vue-tsc` shim 缺失退出 1；随后直接执行脚本的两个已安装 JS 入口均退出 0，不将原命令写为通过。未运行 Mobile H5 构建，未恢复另一任务已删除的 Review 路由或类型。

### 工作树与契约保护

- 后端初期逐路径守卫应用 24 个任务源/测试，DNS 必要补修后为 26 个：`final-manifest.json`、`guarded-backflow.log`、`dns-guarded-backflow.log`。PC 最终应用 15 个任务源/测试（候选 manifest 16 行含已生成 schema）：`frontend/main-applied-hashes.json`、`candidate-source-hashes.json` 与 `diff-review/`；包、锁文件、生成声明、target/dist 均未回灌。
- 并行的 Review 旧路由移除及 Overview 自动缓存刷新发生在本任务基线之后。新增 `external-state-1158/` 与清单保存当时 134 个路径；应用时使用最新主树 SHA，而非以初始 116 个路径必须不变为依据。保留 citation、自动更新、B 个人额度及账本规则，不覆盖或还原并行任务。
- 最终保留并行总结预览精简和 HTTP JSON/SSE/406 回归。`final-integration-audit.json` 的 44 个源/测试/契约 SHA 对应全部匹配；96 个范围外 snapshot 路径未变，5 个后续变化属于并行 `ApiErrorCode`、`GlobalExceptionHandler`、该 handler 测试、Review Controller 测试和 Mobile 页面 API map，本任务未修改它们。当前文档 298 条本地链接无缺失，scope `git diff --check` 退出 0；审查后仅回写最终状态词和交接记录，再核对该审计。
- 运行时 artifact SHA256 为 `E0B02717BC3E920C31EC32A023D421738F19741EB6D7387E6A201FA011048AE1`，两端生成 SDK 为 `9625E1CE8CC707A91AB71DD433E420A5BA78AACB3DEB82C1E1B123C57B82DAFD`。与最新主树的结构差异只在两个 Overview POST，所有其他路径/components 保持；JSON DTO 和现行输入不变。
- Mobile 两处旧 Review 类型引用已被先前并行移除产生的 schema 淘汰，Overview 的 components 结构未改；该迁移按既定范围另处理。本轮未修改 Mobile 页面或 API wrapper、Database、迁移、依赖、密钥或生产配置。

### 验证边界

- 实际本机 TLS 覆盖 slow-drip 读取、阻塞握手及 32MiB 合成请求向不读 body 的对端写入；均验证 deadline 关闭传输并退出。connect 阶段只用受控 socket 注册替身验证，未用真实内核 TCP connect 停滞环境。
- 实际 Servlet/TCP 验证客户端断连传递取消并退出；另一个 TCP 用例在 MVC 8 个线程仍阻塞时收到唯一 `MODEL_TIMEOUT` 和 EOF，释放队列后确认 Overview 未启动。真实 H2 gateway 测试独立验证保守结算/lease 释放，不把不同测试拼成真实 Provider 全链路验收。
- JSON 等待响应时不保证及时探测断连；真实 Tauri/GUI、认证刷新服务器、生产代理 SSE flush、实时 Provider 和远端计算撤回均未验收。未提交、暂存、部署或替换运行容器。

### 单一审查补修（只读审查通过）

- SSE 已开始后两种生成拒绝都曾落入 status 500：service 的 `DomainException(SERVICE_UNAVAILABLE)` 与 Subject 的 `TaskRejectedException`。本机 TCP/SSE 心跳后拒绝 RED 2/2，再最小映射为脱敏 `SERVICE_UNAVAILABLE/503` 与 `retryAfterSeconds=1`；GREEN 2/2，主树该集成类 4/4。证据：`sse-overload-rejection-red4.log`、`sse-overload-rejection-green.log`、`sse-overload-main-class-green.log`。新增两项与原聚焦套件共享已有两项，不把 84+4 当不重叠总数。
- PC 写入期间取消：Subject 写后删除整条缓存与 FILE 写入缺少操作取消围栏，只能在提交前拒绝/回滚本操作，禁止删除已有成功缓存或补偿快照覆盖新 owner；已由原代理凭真实事务屏障 RED/GREEN 最小补修。
- 该 PC 问题已用生产 `OverviewRepository`、现行 local schema 和真实 `node:sqlite` 事务 adapter 复现：在缓存 INSERT 前等待，取消后放行，Subject 旧成功缓存变为缺失，File 被迟到结果覆盖；RED 2/2，退出 1，见 `frontend/overview-cancel-write-race.red.log`。批准只扩 `overviewRepository.ts` 和相关测试：可选同步操作有效性 guard 在排队、写入和事务提交前检查，失败回滚 cache/outbox；移除 Subject 取消后的整条删除。最终同步 guard 通过并进入 COMMIT 为线性化边界，之后 Stop 不回滚已经提交的成功成果。SQL 事务内不等待网络/异步 eligibility。
- 实际 SQLite 最小补修最终在主树与同 hash 联合候选通过 Overview 72/72（退出 0，`frontend/overview-generation-green.log`、`race-joint-generation.log`），包括 Subject/File 写入中取消、排队取消、代际替代和提交后 Stop 保留成功。旧缓存、原始完整 outbox 与广播断言均覆盖；cache 14/14、sync 22/22、runtime 20/20 及类型/Vite 通过。详见 `frontend/overview-cancel-write-race-handoff.md` 与对应 SHA manifest。repository 是必要新增允许路径，现行自动缓存更新事件保留。
- socket 建立前同步 DNS 解析可阻塞 Provider worker；`dns-cancellation-red.log` 实际复现取消 150ms 后工作未退出，退出 1。仅 Overview 使用固定 4 个 daemon resolver 线程、队列 8 的有界可取消等待，保留公共地址校验/DNS pinning；取消移出排队任务，晚解析不得派发 Provider。policy 11/11 与组合 124/124 已通过，相关三文件 guarded backflow 后主树等于测试副本。JDK 原生 DNS 可能不响应 interrupt，只允许占固定 resolver slot 至 OS 返回；不以 Future.cancel 声称 OS 解析已停止。
- 主树 DNS 回灌后的初次验证受旧 target 输出影响出现编译错误；限定 `mvn clean` 后生产 329 源文件编译通过，测试编译恰逢并行 406 测试先于处理方法的写入窗口，未执行测试。原日志 `dns-main-targeted-final.log`、`dns-main-clean-targeted.log` 保留；该并行实现随后已补齐并完成自己的回归，不能把中间失败写为当前未解决问题，也不把其实现算入本任务。
- writer 名额提前释放：`OverviewSseSocketIntegrationTests#queuedDeadlineWritersKeepAllEightSsePermitsOccupied` 的实际屏障 RED（`sse-writer-permit-red9.log`，退出 1）在 8 个终端写任务仍被 gate 持有、请求 worker 已退出时看到 8 个可用 SSE 名额，预期 0。此前 red6/7/8 未达到目标窗口/夹具问题，不作为产品 RED。最小修复以同一 ownership monitor 串行裁决 queued/active 写入登记与释放，在提交前预留、拒绝/完成平衡，以实际 worker 退出及全部写入结束为释放条件；请求池拒绝也沿此条件。最终该类 7/7、deadline/scheduler 4/4 通过；整类一度遇前一用例异步 writer 尾部污染，最终把隔离拒绝场景排在首位，保留全部失败输出及归因。
- 最终主树和被测副本 `OverviewSseAdapter.java` SHA 为 `68F43D569A8094A351A435A7BD7A4327E169D2A4270279B6C0FD081615EEB15D`，SSE 集成测试 SHA 为 `3A750C973725A43E8E59C74332B9AE3DA2082972F3806CA0ACC2EFD1DA6D30D3`；完整来源见 `final-manifest.json`。该 follow-up 未重复稳定的 124 项 Provider/DNS 组合，最终增量只覆盖新变更的 SSE/writer/期限路径。

### 用户追加的 406 诊断核验（只读；运行容器未更新）

- 核对了运行 backend 镜像、复制出的 `/app/app.jar` 和现场脱敏日志。2026-10-09 镜像内两个 Overview 方法直接返回 DTO，没有当前 Accept/SSE 分支；两条生成成功日志后 0–4ms 出现 MVC 响应写出阶段 `HttpMediaTypeNotAcceptableException`。结合当前 PC SSE 请求源码，强证据支持协议版本差异；现场日志未记录同次请求的 Accept 头，不视为已捕获 wire header。
- 当前工作树默认 JSON/opt-in SSE、DTO 无 Jackson 2 `JsonNode`、全局 handler 406 映射及 `CACHE_RETURN` 非持久阶段均已源码核实。PC 收到响应才保存本地结果及同步意图；响应丢失后的新手动请求可能再次调用 Provider/产生用量，未增加幂等回放、自动 fallback 或缓存表。
- 只读连接任务记录找到其 clean 定向测试和 OpenAPI 命令，均 completed/exit 0；15 项由现行源码 4+5+6 及该任务文档佐证，原 stdout 截断未留完整汇总行。OpenAPI 11/11 有独立保存日志/XML。详见 TEMP 的 `frontend/readonly406verification.md`、`.log` 与 `406-connected-thread-test-evidence.json`；该并行实现不归为本轮新增代码，也未重跑它的测试。
- 未发 HTTP/Provider 请求、重建或重启容器、读取环境秘密/业务库。发布时需先加载新版 backend 的 JSON/SSE 支持，再验收 PC；当前运行态 406 尚不能按源码验证标为已关闭。

### 最终验收与交接

- 唯一 Codex reviewer 的只读报告为 TEMP 中的 `final-review-20261011.md`，SHA256 `80409D59F2610554AB667E7F2D08C0FA74D41A0AFA61EB1E9CE0355E0F3C1AD6`；批准 Overview 范围 BLOCKER=0、IMPORTANT=0、OPTIONAL=0，不代表全仓问题或运行态业务验收清零。
- 实际 Antigravity 与 Luna 实施、Codex 只读审查、命令验证分别记录在上述交接。后端最终 manifest 为 26 个任务源/测试，PC 为 15 个任务源/测试，契约为 artifact 与两端生成 SDK；44 项最终字节对应核对通过，完整 diff/生成文件/依赖/删除和跨模块写入已检查。构建产物、依赖和生成声明没有回灌。
- 仓库验收范围已满足，相关自动检查及源码/文档门禁通过。Mobile 两处旧 Review 类型错误仍属其调用方迁移；全仓既有失败没有被写成通过。GUI、真实 Tauri/代理/Provider、真实内核 connect 停滞和远端计算撤回仍未验收，JDBC/数据库等待及 OS DNS 限制保持。
- 未提交、暂存、部署、重启运行容器或修改业务数据库；现场旧 backend 的 SSE 协议差异须按后端先更新的发布顺序另验。
