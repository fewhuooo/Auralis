# AI IMPORTANT 修复实施计划与证据

> 执行方式：依 `AGENTS.md` 委派 Luna 执行 Agent；前端由 Luna 管理 Antigravity，最终仅一个只读 reviewer。

日期：2026-10-10

状态：四项共通修复已实现并通过相关自动验证及单一只读审查；完整持久配额 B 与个人中心额度也已实现并通过相关自动验证，最终审查状态见 [B 实施计划](2026-10-10-ai-usage-guard-b.md)；真实环境验收独立开放。

## 目标与边界

修复伴读回答未显示真实来源文件名、Overview 缺少任务总时限、ingestion embedding 单次请求无分批边界，并建立匿名质量基线。沿用现有 SSE、MAP/REDUCE、owner/revision fencing 和 generation 原子切换，不改变公开 DTO 或数据库结构。

- Overview 合作式总窗口默认 240 秒；PC 保留现有 300 秒窗口。各阶段 Provider response timeout 不超过当前阶段 120 秒上限和任务剩余时间；持续 slow-drip I/O 不能由该检查强制中断。
- embedding 每批默认最多 32 条、32,768 UTF-8 字节；先验证全部向量，任一批失败保留原活动 generation。
- PC 仅从实际 citation 去重提取文件名，在历史和流式回答下以 Vue 文本插值显示；空或无效标题隐藏。
- 质量数据覆盖八类匿名样例；离线 fixture 契约验证和真实 Provider 语义评分分别输出，人工评分初始为未运行。
- 用户已确认完整持久配额 B；沿 [已批准 Usage Guard 设计](../../design/ai/2026-09-14-ai-usage-guard-design.md) 阶段 1/2 和个人中心额度追加要求，在 [新计划](2026-10-10-ai-usage-guard-b.md) 执行。
- 本轮不提交或部署，不调用真实 Provider，不处理用户资料或密钥。业务验收需要独立的 Tauri/Provider/代理环境证据。

## 工作树保护与隔离

分支 `codex/ai-optimization`，基点 `9256e3bb919bb5b7a12d060a2151a5ff48aa141c`。开始时 11 个 tracked dirty 路径已保存于 `D:/Temp/auralis-ai-important-20261010/baseline-user.patch`，内容 hash 见同目录 `baseline-user-hashes.json`。Asset、文档密钥恢复工作及生成声明文件的既有修改保留。

Antigravity 续用 `C:/Users/Gnasche/.agy-mcp/delegations/wt-d17d2696` 的现有候选，前端仅允许下面三个路径。后端质量与安全验证分别使用 `server-quality` 和 `server-safety` 副本，避免原 checkout 的旧 `target` 和相互覆盖。

## 执行项

### 1. 回答来源文件名

路径：`Auralis-PC/src/views/SubjectWorkspace/index.vue`、`src/utils/aiCitationFileNames.ts`、`scripts/r4-ai-citation-filenames.test.mjs`。

- [x] Luna 核对 Antigravity 原候选、先计划后实施；实际模型 Gemini 3.1 Pro (High)。
- [x] 回归验证去空/去重、无效缓存、历史和流式渲染及 HTML 文件名安全；原 HEAD 的隔离 SFC 对最终测试呈现 RED，最终候选 GREEN。
- [x] 审查完整 diff、依赖、生成文件、删除和 allowlist；守卫应用候选。
- [x] 运行新回归与相关既有脚本、PC R4、type-check、静态检查、隔离构建，并保存真实失败。

定向命令：在 `Auralis-PC` 执行 `node --experimental-strip-types --test scripts/r4-ai-citation-filenames.test.mjs scripts/r4-ai-stream.test.mjs scripts/r4-reading-session.test.mjs scripts/r4-reading-selection.test.mjs scripts/r4-knowledge-markdown-formula.test.mjs`。

实际验证在复用主树依赖的独立候选副本进行，三条最终源 hash 与主树一致；新测试 8/8、上述定向 27/27。`npm run check:subject-workspace`、`node node_modules/vue-tsc/bin/vue-tsc.js -b --pretty false` 与 `node node_modules/vite/bin/vite.js build --outDir D:/Temp/auralis-ai-important-20261010/pc/candidate-dist` 均退出 0。`npm run test:r4-pc` 最终退出 1、679/680：未改截止日期测试的 LF-only 提取在 CRLF SFC 上失败。`npm run check:r4-pc` 退出 1，保留既有 Rust 固定本地地址扫描失败。完整命令、失败定位和日志见 `pc/evidence-index.txt`。Antigravity 完成生产候选，Luna 仅补强文本插值测试并补齐隔离 RED 证据；未将这一对照写为可核实的首次实施顺序。

最终 PC 三路径 SHA-256：SFC `5C4458123306DF97C0B6966DF680A038B18E7817AC270FE46EE2028E55A1CF55`；helper `D2489BEFD574BF8F4BFB87C030DC4C5C6A0E6AD92D62A31DD17920031A766D43`；test `6013163751AA83A35D69F54E747FC7976FCC303A8A1F4C938B3F6DF44AEB0C9A`。两个 generated d.ts 与开始时 hash 相同。

### 2. Overview 总时限与 embedding 分批

路径：`Auralis-Server/src/main/java/com/auralis/app/ai/OverviewGenerationService.java`、新增 `ai/OverviewTaskDeadline.java`、`ai/ingestion/IngestionWorker.java`、`ai/ingestion/IngestionJobService.java`、`ai/internal/persistence/IngestionJobEntity.java`、`shared/config/AuralisProperties.java`、`src/main/resources/application.yml`；对应 AI 配置、Overview、Worker、Job、Provider 测试。额外允许 `ai/internal/provider/SiliconFlowEmbeddingProvider.java` 及其测试：原 adapter 忽略响应 `index`，乱序响应会把向量配给错误 chunk；按索引归位并拒绝重复/非法索引是同一分批任务的数据完整性修复，公开 `EmbeddingResult` 不变。协议依据为 [SiliconFlow 官方 OpenAPI](https://github.com/siliconflow/siliconcloud/blob/main/openapi.yaml)。`MinioAssetStorageIntegrationTests` 仅补入 AI record 新配置参数，避免全量 testCompile 构造签名失配；没有改变其业务断言或运行真实 MinIO。

- [x] 以可控时钟与 Provider 验证总窗口耗尽、剩余 timeout、最终阶段迟到及同键重试释放。
- [x] 保留 stage token/prompt、schema/alias/locator、Source 删除与 revision 屏障；只增加 deadline 检查。
- [x] 以受控 embedding 验证 count、ASCII UTF-8 字节累计分批、顺序、无效响应与失败不提交，保留既有 generation 原子提交约束；源码确认使用 `getBytes(StandardCharsets.UTF_8).length`。多字节边界与单 chunk 超限拒绝没有独立 worker 回归，记录为 OPTIONAL 验证缺口，本轮不扩大修改。
- [x] 批间以短事务验证当前 claim 并续租；已过期或被接管的 attempt 不得续活、继续调用或影响新 attempt。必要范围扩展为 `IngestionJobService`、`IngestionJobEntity` 与持久化回归：合法 5 MiB ASCII 文档约 180 批，平均每批超过约 1.67 秒即可跨越现有 300 秒 lease；保持单个初始租约会使合法大文档反复失败。续租不增加 schema，Provider I/O 不占有数据库事务。
- [x] RED/GREEN 后执行相关 AI 聚焦套件；验证源 hash 与应用源一致。

聚焦命令：在隔离 Server 执行 `.\mvnw.cmd -B -ntp '-Dtest=AiStreamingTests,AiOverviewServiceTests,AiRetrievalTests,AiIngestionWorkerTests' test`。

实际最终证据在 `server-safety`：

| 命令 / 日志 | 退出与范围 |
| --- | --- |
| `.\mvnw.cmd -B -ntp '-Dtest=AiConfigurationTests,AiOverviewServiceTests,AiIngestionWorkerTests,AiIngestionJobTests,AiProviderSecurityTests,AiQualityFixtureContractTests' test`；`server-safety-final-focused.log` | 0；89/89。首轮 checkpoint 88，补接管测试后实际最终日志为 89。 |
| `.\mvnw.cmd -B -ntp '-Dtest=AiStreamingTests,AiRetrievalTests,AiSourceChunkTests' test`；`server-safety-incremental-rag.log` | 0；31/31（16/12/3），兼容聊天、检索与 generation。 |
| `.\mvnw.cmd -B -ntp '-Dtest=AiIngestionJobTests#renewalDoesNotUseWorkerTimeCapturedBeforeWaitingForTheJobLock' test`；`server-safety-lease-race-red.log` | 1；1 failure，旧实现锁等待跨 lease 后仍续活。 |
| `.\mvnw.cmd -B -ntp '-Dtest=AiIngestionJobTests,AiIngestionWorkerTests' test`；`server-safety-lease-race-green.log` | 0；最终 18/18（9/9），补修锁后读取 Clock 并按原 TTL 重算新 lease。 |
| `.\mvnw.cmd -B -ntp '-Dtest=AiConfigurationTests' test`；`server-safety-lease-race-config.log` | 0；5/5，只证明配置默认/约束与加载，不单独证明新增 bean wiring。 |
| PC `node --experimental-strip-types --test scripts/r4-overview-generation.test.mjs`；`pc/candidate-overview-generation-final.log` | 0；48/48，两份 Server 静态 fixture 已刷新至最终主树 hash。 |

初始行为 RED 见 `red-overview-lease.log`：76 tests、7 failures、0 errors，覆盖未分批、向量乱序/无效索引、超期接受与过期提交。中间严格 Mock stub/matcher 错误由同执行 Agent 归因修正并保留失败日志。所有日志根为 `D:/Temp/auralis-ai-important-20261010/`；最终变更源与副本 hash 一致。续租最终 Service hash `79966F9A392552FD37DE4C098602BB3134AC67B1EA6D7AE6BCF6811572C0F743`，Job test hash `E5F9830F83CE1FE22C3C54869D2840DBC34194A85C7CF584C086D408576EAD08`。

### 3. 匿名质量基线

新增路径：`Auralis-Server/src/test/resources/ai-quality/baseline-v1.json`、`src/test/java/com/auralis/app/AiQualityFixtureContractTests.java`、`scripts/run-ai-quality.ps1`。

- [x] Fixture 缺失先 RED；实际 TextChunker、正文 hash、定位范围和 owner/scope 契约再 GREEN。
- [x] runner 实际执行离线校验，输出独立的未评分模板；真实语义评分为 `NOT_RUN`。
- [x] 运行质量专用 Maven 测试与 runner；验证产物和主树新增路径一致。

实际 GREEN 命令：在 `D:/Temp/auralis-ai-important-20261010/server-quality` 执行 `scripts/run-ai-quality.ps1 -OutputDirectory D:/Temp/auralis-ai-important-20261010/quality/run-final`，内部执行 `.\mvnw.cmd -B -ntp '-Dtest=AiQualityFixtureContractTests' test`。退出 0，3/3、0 failures/errors/skipped；报告 `quality-report.json` 和 `manual-review-template.json` 位于输出目录。语义质量、真实 embedding 和人工评分未运行；runner 只支持离线契约检查。模板含 8 cases、16 reviewer slots，全部分数为 `null`。主树三个路径 SHA-256 与验证源一致，证据由质量执行 Agent 返回，主 Agent 已核对报告与日志。

### 4. 审查与交接

- [x] 回写 Backend、FrontendPC、Frontend、API、Database、Status、IssuesAndReview、Changelog；Usage Guard 补现行基线校正，范围保持待确认。
- [x] 单一 reviewer 只读检查 correctness、requirement、race、transaction、data integrity 和 security。
- [x] 比对既有用户 diff，确认无覆盖；记录每项自动证据、剩余 IMPORTANT 和真实环境未覆盖范围。

最终工作树保护：`git diff --check` 退出 0。原补丁的 `git apply --reverse --check` 退出 1：Backend/Status/Issues 顶部新增本轮段落改变了首 hunk 上下文；该检查没有修改文件。改用 `D:/Temp/auralis-ai-important-20261010/check-user-preservation.ps1` 在内存中仅排除本轮新增段落及 timeout 两行事实校正，再计算 SHA-256；九项原实质 dirty 路径全部与开始时 hash 一致，两个生成声明文件原字节 hash 也一致，退出 0。结果见 `final-user-preservation.json`。原 Asset 和密钥恢复设计/计划未写入。未暂存、提交、删除或引入依赖变化。

最终验证源核对：主树全部 20 条实现/测试/fixture 路径的 SHA-256 与各自已验证的隔离副本一致，退出 0；明细见 `D:/Temp/auralis-ai-important-20261010/final-verified-source-hashes.json`。最终目录清单只有计划登记的七条新增文件，无额外依赖、生成文件或删除。已通过的相关测试没有无依据重复执行。

## 已执行的基线验证

- 后端原 checkout 的聚焦命令失败，涉及旧 `target` classpath；未清理或隐藏该失败。隔离 `server-baseline` 上同一四类测试为 **79/79，退出 0**（Streaming 16、Overview 46、Retrieval 12、Ingestion 5）。日志 `D:/Temp/auralis-ai-important-20261010/baseline-focused-tests-isolated.log`。
- PC 四个既有定向脚本 **19/19，退出 0**；证据 `D:/Temp/auralis-ai-important-20261010/pc/`。此项仅为修改前基线。
- 质量 fixture 缺失 RED：3 项 assertion failures、0 errors；证据 `D:/Temp/auralis-ai-important-20261010/quality/fixture-red.log`。

## 验收边界

同步 Overview 的真实 HTTP 断连是否能即时停止 Provider 工作、代理 timeout、真实模型质量和费用、GUI 来源显示仍须现场验证。持久配额与跨实例任务互斥已由 B 实现并取得独立自动证据；多实例服务进程联调及异步 Overview 作业仍单独记录，离线样例通过不能关闭模型事实质量风险。

同一个 Luna reviewer 先审 PC/质量，再审后端；初审确认锁等待跨 lease 的 IMPORTANT，已由原执行 Agent 以 RED/GREEN 补修，复审关闭。最终代码与文档审查：四项共通范围 BLOCKER=0、IMPORTANT=0；OPTIONAL 为多字节 UTF-8/单 chunk 超限的独立 worker 回归缺口，未改代码。整体调用防护已在独立 B 计划实现并通过相关自动验证，B 最终审查状态以该计划为准；外部验收仍开放，不把代码审查写为真实业务验收。
