# 大 PDF 摄入额度与同步等待诊断、最小修复

日期：2026-10-12（Asia/Hong_Kong）

后续策略：用户已明确要求 embedding 不计额度、放宽单人测试额度，实施见 [额度排除与测试额度](2026-10-12-embedding-quota-exemption-and-test-limits.md)。下文“免费模型仍计 token”的边界仅记录该后续指令前的策略；原现场数据与已验证的 Provider / PC 修复保留。

后续运行态：香港 12:57:12 已在本机更新当前 backend 源码，新策略的运行限额 / Guard 字节码已确认；此前 embedding 用量字段解析也保留在该版本。下方“未部署”为本轮原始交接时点，实际 Provider 响应和 PC 上传期间同步的 GUI 验收仍独立，本次未重新部署 PC。

状态：最小修复、定向自动验证与唯一只读审查通过；新补丁未部署。原部署下目标 PDF 自然恢复已现场确认，补丁的真实响应结算与桌面验收独立记录。

目标：解释大 PDF 三批 embedding 后暂停，修复完整 embedding 用量被丢弃和文件上传阻塞核心同步两处 correctness 问题，保留现有 AI 安全限制。

架构：沿用 Usage Guard B 的预留、结算及 ingestion 检查点续做。适配器读取官方现有用量字段，不改变账本结算规则；PC 的资产队列沿用原有完成通知，核心同步不等待已启动上传完成。没有新 API、表、环境变量或依赖。

## 现行证据与边界

- 用户报告的原始 PDF 为 29,629,815 字节，UTC 02:17:56 上传 READY / Source 创建；02:21:40–42 三批 SiliconFlow `BAAI/bge-m3` embedding HTTP 成功。
- UTC 02:31 / 02:33 两次只读数据库快照确认目标 job 为 `PENDING`，`attempt_count=1`、`failure_count=0`、租约为空，错误为 `AI_HOURLY_QUOTA_EXCEEDED`，`next_attempt_at=2026-10-12T03:00:00Z`（香港 11:00）。这条运行时任务已正常延期，没有停留在 Provider 调用中。
- 三笔 reservation 均为已派发、`COMPLETED`，input actual 为 7454、7606、7256，output actual 均为 NULL；estimated / charged 为 31487、30753、32375，合计 94615。运行时用户小时限制为 100000，剩余 5385，没有 `RESERVED` 行，下一批约 32KB 文本的预留无法准入。日/全局限制分别为 200000 / 2000000。
- 初始 32 个 inactive checkpoint chunks 已持久化。原部署在 UTC 03:00:00.780985 开始自然重试，03:00:01.397777 完成；03:00:28 只读快照确认 `attempt_count=2`、`failure_count=0`、job / Source 为 READY，lease / next attempt / error 清空。同一 generation 变为 42 个 active chunks（ordinal 0–41），只新增一笔 embedding reservation（input actual 7212、output NULL、estimated / charged 29145）。没有人工重试。该结果验证原调度窗口恢复、检查点复用和完整激活，不证明新解析补丁已部署、内容质量或 GUI 已验收。完整 SQL / 输出见 `runtime/natural-window-resume.sql`、`runtime/natural-window-resume.out.txt`、`runtime/natural-window-resume.md`。
- `SiliconFlowEmbeddingProvider` 仅解析 `prompt_tokens`，无条件给 `AiTokenUsage` 的 output 传 NULL。官方 [Embeddings API](https://api-docs.siliconflow.cn/docs/api/embeddings-post) 提供 `completion_tokens`，合法值包含 0。受控 transport 返回 `{prompt_tokens:7454,completion_tokens:0,total_tokens:7454}` 时，真实适配器返回 `(7454,null)`；隔离 RED 1 项预期失败。
- 本轮没有捕获历史 Provider 原始 response usage，数据库 NULL 不能证明 Provider 原响应省略 output。已证明适配器必然丢弃该字段；修复后只在实际响应完整时按实际值结算，真实缺失仍保守。
- 当前容器 JAR SHA-256 为 `A768FEF3D40209A3B873C8F5610630D175BED171DCB57BB110B2D6F0B5574365`。只提取目标 Provider class 后，`javap -sysinfo -c -p` 退出码 0，确认部署方法读取 prompt 并将 output 参数传 NULL，没有 `completion_tokens` 读取路径；class SHA-256 为 `26E63AD68305436E6DD3C96F711795C2D82F3939C2BB75B5463C2EE032C09AB7`。证据为 `runtime/provider-bytecode-diagnosis.md` 与 `runtime/deployed-provider-bytecode.txt`。
- 两次现场 `pg_stat_activity` 均无长事务、锁等待或 blocker。日志无 sync access 证据，不能证明这次同步症状与后台 quota job 同因。
- 独立受控 PC probe 证明实际 `useSyncStore.triggerSync()` 等待 `assetQueue.wakeUp()` 返回才进入普通 push/pull；一个未返回的上传可阻塞同周期核心同步。目标 PDF 的原 Asset 早于 quota defer 约四分钟 READY，因此该缺陷与本次现场因果分别记录。
- 本地文件 draft 在上传完成前只有投影、没有 Source CREATE outbox；`releaseDraftsForAsset` 在 Asset 完成后才创建 mutation，`onWakeup` 仅在有已释放 draft 时通知后续同步。后台唤醒不提前同步未 READY 的 Asset 引用。
- PC 当前将 quota 延期的 Source PENDING 显示为泛化排队，没有 job retry timestamp。此可见性限制本轮登记，未增加公开状态字段或页面设计。
- 免费 embedding 仍计入 Auralis 内部 token 配额；charged 表示应用预算消耗，不代表 Provider 金额账单。本轮不设置免费模型豁免。

## 全局约束

- 保留小时/日/全局、任务、单次请求与并发限制，以及派发未知时的保守结算；不清历史用量或修改业务数据。
- 保留现有 generation/revision/claim 围栏、checkpoint 和 active generation 原子提交。
- 不默认缺失 output 为 0，不从 total 推导缺失字段；合法整型 0 保留，缺失或非法字段继续为未知。
- PC 保留账户、设备、会话代际隔离；旧队列迟到异常不能污染新会话。
- PC 仍等待队列初始化与本机资产核对。本轮只移除上传 `wakeUp()` 完成对核心 cycle 的等待。
- 大量既有未提交修改已建立独立 hash 基线；禁止覆盖、还原或整理无关文件。OPTIONAL 不修改。
- 普通诊断、实现、测试由 Luna high 子代理负责；前端优先尝试 Antigravity MCP，本轮工具无产出后由 Luna 完成最小补丁，主 Agent 裁决边界并回写文档，最终只做一次只读 reviewer。

## 任务 1：embedding 用量

允许修改：

- `Auralis-Server/src/main/java/com/auralis/app/ai/internal/provider/SiliconFlowEmbeddingProvider.java`
- `Auralis-Server/src/test/java/com/auralis/app/AiProviderSecurityTests.java`
- `Auralis-Server/src/test/java/com/auralis/app/ai/usage/AiInvocationGatewayTests.java`

- [x] 只读现场确认额度延期，读取实际 ledger 数值，受控适配器 RED。
- [x] 保留合法非负整型 `completion_tokens`，未知字段仍用 NULL；保持现有 Provider/vector 安全验证。
- [x] 回归完整 usage `(7454,0)` 结算 7454、缺失/部分/非法 usage 保守，证明请求预算保护仍适用。
- [x] 执行定向 Maven Provider/Gateway/Guard/Worker 测试，保存实际命令、退出码、surefire 与当前文件 hash。

隔离 RED 命令：`./Auralis-Server/mvnw.cmd -B -ntp -f D:/Temp/auralis-pdf-ingestion-20261012/backend/red-scratch/pom.xml -Dtest=SiliconFlowEmbeddingUsageRedTest test`，退出码 1，Tests 1 / Failures 1 / Errors 0，失败为 expected output 0 / actual NULL。

最终后端命令：`./Auralis-Server/mvnw.cmd -B -ntp -f D:/Temp/auralis-pdf-ingestion-20261012/backend/red-scratch/pom.xml '-Dtest=AiProviderSecurityTests,AiInvocationGatewayTests,AiUsageGuardTests,AiIngestionWorkerTests,AiIngestionJobTests' test`，退出码 0，56/56（ProviderSecurity 19、Gateway 10、Guard 2、Worker 13、Job 12），无 failure/error/skipped。运行在隔离构建目录；验证前 470 个 `src` 文件和 pom 与当前主树逐项相同，验证后相关 hash 匹配。此前聚焦 GREEN 3+3 与 56 有重叠，不相加，不表述为主树 target 或全量工程测试。

证据：`backend/main-tree-validation-manifest.json`、`backend/main-tree-validation-postcheck.json`、`backend/main-tree-validation-result.txt`、`backend/test-evidence/main-tree-final/`、`backend/task-delta.patch`。

## 任务 2：PC 上传与核心同步

允许修改：`Auralis-PC/src/store/useSyncStore.ts`、`Auralis-PC/scripts/r4-sync.test.mjs`。

- [x] 受控真实 store probe 证明 pending wake 阻塞 push/pull；核对 draft 不提前入 outbox 的依赖。
- [x] 优先尝试 Antigravity Gemini 3.1 Pro High：plan-only `d62424207956` 无计划或增量；`8498fb29689c` eligibility EOF；`645ba9c69c4d` 486 秒无日志/增量后停止；备用 bg CLI `9941927e7083` 165 秒无日志/增量后停止。隔离现场保留且 hash 未变，没有生成或应用 Antigravity 代码，转由 Luna 执行授权的最小补丁。
- [x] Luna 以有 catch 的后台 wake 替换当前等待，保留队列初始化及原完成通知，采用现有 classify/log 安全错误处理。
- [x] 回归上传未返回时普通 push/pull 完成、后来 Source release 触发后续同步、异常被消费、会话切换后迟到队列结果隔离。
- [x] Luna 检查两文件 task delta，执行相关测试、类型、静态与构建；生成/依赖/删除/跨模块写入和 hash 的记录由最终审查核对。

原始诊断命令：`node --experimental-strip-types scripts/r4-sync.test.mjs scripts/r4-local-asset-sync-queue.test.mjs`（Auralis-PC），退出码 0，47/47；此为修改前回归，不当作修复后的验证。

修复后完整相关命令：`node --experimental-strip-types --test scripts/r4-sync.test.mjs scripts/r4-local-asset-sync-queue.test.mjs`，51/51。最后安全日志与测试断言强化后命令：`node --experimental-strip-types --test --test-name-pattern="core push and pull|Source released|asset queue rejection" scripts/r4-sync.test.mjs`，退出码 0，4/4；四项与 51 有重叠，不相加，不声称最后版本重跑全套。实际 store probe：`node --experimental-strip-types D:/Temp/auralis-pdf-ingestion-20261012/pc/pc-sync-asset-queue-red.mjs`，退出码 0，`syncPushStartedBeforeUploadRelease=true` / `NOT_BLOCKED`。`npm.cmd run type-check`、`npm.cmd run build` 均退出码 0；`npm.cmd run check:r4-pc` 退出码 1，仅既有 `src-tauri/src/local_asset_store.rs: fixed local address`。详见 `pc/fix-verification.md`、`pc/fix-command-log.md` 与 `pc/root-tested-hashes.json`；完整两文件增量见 `pc/task-delta.patch`，无新增依赖、文件删除或跨模块写入，Rust 文件与 HEAD 相同的证据见 `pc/static-rust-baseline-evidence.txt`。

## 交付与验收

- [x] 唯一只读 reviewer 检查 correctness、用量安全、会话 race、同步数据完整性；BLOCKER=0、IMPORTANT=0、OPTIONAL=0，报告 `final-review.md`。reviewer 未修改文件或重复测试。
- [x] 回写 Backend、FrontendPC、Status、IssuesAndReview、Runbook、Changelog；本文件登记 README。API 与数据库契约不变。
- [x] 最终核对 task delta/hash、文档链接及 diff 格式，区分本轮实现与既有并行修改。5 个源码/test hash 与已测证据相同，276 个本地 Markdown 链接无缺失，HEAD 未变，证据 `root-final-audit.json`。精确 task-before→当前增量无新增空白问题；整个涉事 dirty-path `git diff --check` 退出 2 仅为两份文档的既有 EOF 空行，保留原输出和 before 证明，没有清理既有格式。Gateway test 的两条 LF→CRLF warning 单独记录。
- [x] 原部署自然窗口恢复与检查点续做的只读现场验证：香港 11:00 目标 job / Source READY，同 generation 42 个 chunks 激活，仅新增一次 embedding。
- [ ] 后续新补丁真实验收：更新 backend/PC 后，验证完整 embedding usage 的实际结算、上传过程中另一条 Task/Subject 的同步。真实 GUI、跨设备及新补丁部署不由受控测试或原部署自然恢复替代。

临时证据根目录：`D:/Temp/auralis-pdf-ingestion-20261012/`；现场 SQL/日志及边界见 `runtime/runtime-diagnosis.md`，源代码诊断和 RED 见 `backend/backend-diagnosis.md`，PC probe 见 `pc/report.md`。本轮所有业务 DB 查询均只读，未调用 Provider、重试、usage 懒回收接口或重启部署。
