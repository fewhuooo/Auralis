# 学科复习与统计完整本地使用实施计划

> 执行方式：当前会话由主 Agent 协调，Luna 执行 Agent 负责后端与 Antigravity 前端实施/命令验证；完成后一个只读 reviewer。主工作树不提交或暂存。

**最终状态（2026-10-09）：** 代码与自动命令通过；唯一reviewer完成初审后因使用额度中止，主Agent接手最终代码审查、必要修复与工作树核对。真实GUI/Tauri/HTTP与双设备待验收，未部署。

**Goal:** 复习和统计从本机持久数据读取，离线完成学习、反馈、排期与统计，联网后同步。

**Architecture:** 复用当前生命周期和页面，在现行 localDb 增加账号/设备隔离的复习仓储及独立持久意图队列。PC本地执行现行排程算法并原子保存投影、历史和意图；核心资源同步完成后逐KB FIFO派发现有五类命令，合并实际权威回执，保留未ACK后继的本地投影并继续队列。学科统计聚合本地核心资源与复习历史，不依赖Stats HTTP。

**Tech Stack:** Vue/Pinia、现行 Tauri 单连接 SQLite/JS 串行事务、浏览器开发 fallback、Spring Boot/JPA、现行 OpenAPI 生成脚本。

## 授权与约束

- 用户 2026-10-09 明确选择“完整本地使用，联网后同步”。这更新此前计划中“正式操作需联网”的范围。
- 当前三段学习、认识/模糊/忘记、核对下一个/记错、末尾一次巩固、3天/1天/10分钟及7/14/30天掌握规则不变。
- 临时轮次仅本机切页恢复，仍不做刷新、重启、跨设备轮次恢复；正式状态/历史/排期/待同步意图必须持久化。
- 保留用户布局、两个 Pane 已统一的 scoped 配色与现有未提交修改。专注只在个人页。
- 不新增依赖，不重写鉴权或通用 core Sync，不扩五类核心 mutation；不操作生产库/数据卷、不部署。
- 修改 frozen 代码的依据是当前接口阻止离线操作、没有持久复习数据，以及新需求必须关闭的冲突/恢复正确性缺口。
- TEMP 基线为 `C:/Users/Gnasche/AppData/Local/Temp/auralis-review-stats-local-first-20261009/current-snapshot/`；1064 路径/1062 现存/2 既有删除，HEAD ed08697，branch codex/subject-review-stats，空索引保持。

## 已确认根因

`SubjectReviewPane.refresh` 无条件读取远端 states，失败撤销 loaded 后以 `statesLoaded || round` 隐藏主体。`SubjectStatsPane` 读取远端 stats，仅有进程内缓存。Review 状态、历史、日期和正式动作均未进入本地仓储；当前通用同步周期不处理 Review。只把 loaded 改成 true 或返回空列表会把未知旧进度误判为新学习。

## 本地数据与接口边界

### 仓储与排程

- 增加 `src/services/reviewRepository.ts`：沿现有 Focus/Overview 仓储模式，绑定 userId/serverDeviceId；SQL 原子事务和浏览器同作用域串行提交保存一个一致快照。正式数据与轮次分开。
- 持久数据包含每 KB 的已导入权威状态（null 与 version=0 区分）、投影、生命周期命令/有效结果、legacy 历史、初选前调度快照、已导入标记；outbox 保存稳定 clientCommandId/reviewId、真实 occurredAt、正文 SHA-256、动作及 FIFO 顺序、尚未固化/已固化请求、待处理/冲突/归档状态。
- `src/services/reviewLifecycleEngine.ts` 实现 Java 当前调度的本地等价逻辑，输入 before state、动作/时间/正文，输出新投影与有效结果；本地 revision 与服务器 version 分开。独立学习完成不冒充 GOOD。
- `src/services/localReviewService.ts` 为现有 Store 提供本地读取和正式提交，复用现有 round 分流。写入先校验当前活动 Subject/KB、正文 hash/本地修订及作用域，投影+历史+意图同次提交；持久化失败不推进 UI。
- 本地已创建且未同步的KB可学习。尚未导入旧云端状态时仍可建立本机进度，模型标记导入未完成，提示按用户最新UI处理；首次队列保留期望远端无状态的前提，远端已有状态不能自动重基。
- 本地正文实际变化立即失效掌握/稳定进度；元信息编辑保持。旧正文未决意图保留且阻止其覆盖新正文；删除/移出后排除当前队列与统计，历史仍可保留。

### 独立后台同步

- `src/services/reviewSyncService.ts`，以及必要的写入唤醒钩子。由 `useSyncStore` 在 core sync 完成后执行，不阻塞页面本地读取/提交。
- 先处理已存在的 prepared 请求：丢响应必须按相同 ID/完整请求重试；不得换时间、hash、KB version 或 baseVersion。
- 尚未派发的首条意图仅在核心 KB 没有未结算变更、当前服务器正文 hash 与捕获值一致时绑定真实 knowledgeBlockVersion。HTTP 前固化请求。
- 每 KB FIFO，后一条只使用前一条成功回执的真实 state.version；不得猜 JPA 版本。另一 KB 可独立收敛。
- 首次离线未导入旧云端进度时，只允许首条无 reviewId 的学习完成经完整 protocol2 空状态/空 lifecycle、effective、legacy 历史证明后初次准备；已存在 version0 仍拒绝。接受该首条之后，后继必须以同一 KB 的实际 ACK 前缀为完整权威历史继续，任何他端新操作或已接受历史字段变化都停止该 KB，不借新历史自动重基。
- 正文变更前保存独立完整云端锚点，乐观本地状态/命令不得混入。首条新正文、无 reviewId、从未固化或派发的学习意图，仅在核心变更已收敛、完整 lifecycle/legacy 历史无新增且云端 state 精确符合当前正文失效时，绑定 GET 的实际版本。连续离线正文修改保留原锚点；他端复习、存在性变化、证据不足均保留冲突。已固化请求不能修改。
- Core ACK 推进 KB version、纯元信息/父学科移动时，未固化请求按当前父/KB/hash 事务核对，仅在正文一致、完整 state/history/effective/legacy 不变、版本不回退时绑定真实 KB version。新父范围命令可继续，旧父轮次或已有旧 scope 意图仍拒绝/冲突，不因锚点元信息更新而重放。
- 实际 pull 由已收敛 core 本地资源枚举全部活动 KB，再逐 KB 读取现有生命周期/legacy history；PC 不额外调用远端学科 states 分页。完整历史响应才写入导入标记，失败不当作空状态；旧学科 states 接口保留给现行其他调用者。
- 首次 POST 及 prepared 未知结果恢复前，通过现有 lifecycle/history 验证 `protocolVersion===2`；旧后端缺该字段则保留待同步，不派发。已固化/结果未知的请求不重基；未固化的初次准备仅接受上方严格锚点证据。回执 occurredAt 必须与固化请求的规范时间一致，否则不 ACK/不覆盖本机数据。此门槛处理此前用户忘记重建后端的真实部署边界，不增加新端点。
- 权威状态安装不得回退版本或覆盖后续本地动作；按command/review ID合并去重，ACK仅移除同ID意图，较旧回执推进独立锚点并保留已包含后继的本地投影，其余意图继续FIFO。
- 账号/设备/session 代际票据在读取、派发、401 重试、仓储写回、状态发布及 finally 检查。旧 A 操作只能留在 A 仓储，不进入 B；A→B→A 也失效旧票据。
- 409 或正文资格变化停止该 KB，保存本机意图/历史并提示。提供显式“使用云端进度”处理：先读取权威状态及历史，已接受 ID 去重，未采用意图归档保留，再从权威状态继续；不得悄悄 LWW、覆盖或删除记录。

### Service 时间与存在性契约

五类现有请求增加可选字段：

```ts
type OfflineLifecycleFields = {
  occurredAt?: string // RFC3339 instant，真实操作时间
  expectedStateAbsent?: boolean // true 要求无状态；false 要求存在；省略保留在线语义
}
```

- omitted occurredAt 沿用服务端 Clock；显式时间规范到微秒，允许最长 5 分钟未来偏差，不设任意离线历史过期上限。
- 同 KB 锁内时间不得早于最新 accepted command、lastReviewedAt/lastPracticeAt；超未来 400、因果/存在性/版本冲突 409，不写状态/历史。
- `expectedStateAbsent=true` 与现有 version=0 严格区分；false 要求存在并匹配 baseVersion。
- 初选日期用于确认 GOOD/HARD 的日期锚点与有效复习统计归属；纠正和学习完成使用各自真实操作时间。
- 精确回放先于新时间/存在性检查，资源活动/当前版本/hash 资格继续保留。两个新字段均省略时 request_payload 指纹保持旧结构逐字一致；显式时间或存在性进入新指纹，换时间复用 ID 拒绝。
- 导入未确认初选需要初选前 baseline，不能从已经提前变化的 current state 推断。生命周期 effectiveReview/history 增加 `schedulingBaseline`，仅公开 dueAt/mastered/stableSuccessCount/nextReviewStage/lastPracticeAt/stability，从现有 before_state 投影，无新服务端表或迁移。
- legacy `ReviewEventView` 增加派生 `firstLearning:boolean`，直接由实体 before_state 是否为 SQL NULL 产生。本地首学/后续统计不能用 baseVersion=0 猜测；不暴露 raw JSON。
- lifecycle/history 顶层增加固定 `protocolVersion:2`，在副作用前声明支持上述离线时间/存在性协议；旧无字段后端不能被当作支持。请求指纹和旧回执不增加该字段。

### 学科统计

- `src/services/localSubjectStats.ts`，`useStatsStore` 仅学科路径改本地，个人页现行服务器统计不变。
- 输入当前学科本地 Subject/Source/KB/Task（含墓碑以保留适用历史）和已导入/本地有效 Review 数据，输出现行 SubjectStatsView。三态仍互斥且等于活动 KB 总数；到期为 reviewing 子集。
- 正式结果按 reviewId 去重，GOOD/HARD 未确认不计已完成，AGAIN 立即有效，纠正改同次结果不叠加；学习完成独立计数。
- IANA 本地自然日，复习按 selectedAt、学习按 completion occurredAt，任务按当前 DONE/completedAt；7/30 天补零，专注不加入。
- 模型保留本机历史完整度与同步待处理数量。最新用户UI移除复习历史覆盖横幅，统计覆盖/pending提示隐藏，复习同步/冲突提示保留。未导入其他设备记录时数据范围仍仅本机；网络失败不撤销本地可用状态。
- newLearningCount 仅依据已导入明确无状态或本地 CREATE 证据且无正式状态；同步资源尚未导入复习记录是未知，可本机学习，但不当作已确认的新学习数量。存在的 version0 和 needsLearning 状态都不是无状态。

## Task 1：后端补传协议（Luna 执行）

Files: `ReviewLifecycleDtos.java`、`ReviewLifecycleService.java`、必要的 CommandRepository 查询、`ReviewEventView.java`/`ReviewService.java` 的 firstLearning 派生、`ReviewLifecycleServiceTests.java`、必要 legacy/Stats/OpenAPI/schema 验证；`SubjectLockCoordinatorPostgresIntegrationTests.java` 仅必要 DTO 构造调用追加省略的可选字段；导出更新 `docs/contracts/openapi/auralis-openapi.json` 与 PC/Mobile generated/schema.ts。

- [x] 为显式旧日期、未来时间拒绝、倒退拒绝、null 与 version0、旧指纹回放、日期统计、imported pending baseline 先写回归并记录 RED。
- [x] 最小实现时间/存在性/公开 baseline，旧在线回放保持正确；新增 DTO 构造处明确省略字段。
- [x] 运行聚焦 Service/Stats/Review/OpenAPI 测试，记录命令/退出码/关键输出；导出真实排程对照 fixture 给 PC。
- [x] 运行现行 OpenAPI 导出与 SDK 一致性检查，无手改 generated 内容。

## Task 2：前端本地链路（Luna 管理 Antigravity）

允许文件：上述新 services、必要 wakeup；`localDb.ts`/`localSchema.ts`、`useReviewApi.ts`、`useReviewStore.ts`、`useStatsStore.ts`、`useSyncStore.ts`、两个 Subject Pane、现有 review/stats/sync/localrepo 专项及新增 offline 专项；`package.json` 仅将新专项纳入 `test:r4-pc`。不可修改样式布局、依赖、lockfile、鉴权边界、Service 或契约文档。

- [x] 用完整当前 PC/docs 镜像调用 Antigravity plan，再 delegate Gemini 3.1 Pro High；先计划再执行已获授权范围。初稿及第二轮未通过完整验证，后续由同一执行 Agent 按失败证据补修。
- [x] 测试先失败：冷离线页面无需 HTTP、首次学习原子持久、重启恢复正式数据与 outbox/轮次不恢复、失败提交不前进、离线连续反馈/纠正与统计、FIFO/冻结重试、账号交错、正文与多端冲突。
- [x] 本地 engine 用后端真实 fixture 验证当前调度，保留旧 round 行为的测试。
- [x] 审核 AGY 完整 diff、生成/删除/依赖/跨模块文件，按精确基线应用允许修改，保留期间外部修改。
- [x] 主树相关专项、type-check、学科两项静态、build通过；SQLite事务以真实SQLite adapter验证，浏览器fallback单独验证。执行Agent完成659门槛，之后外部UI变化及根最终必要修复由根运行对应当前门槛，最终R4 664/664。

## Task 3：文档、完整范围与一次审查

- [x] 同步API、Database、FrontendPC、Backend、Frontend设计、Architecture、ProductRequirements、Status/Issues、Changelog；旧在线范围标明被新要求更新，当前计划已登记README。
- [x] 单个只读reviewer完成后端初审及前端必要问题检查，因使用额度未完成最终全任务报告；主Agent接手最终审查，仅依据复现修必要项，不冒称独立reviewer最终通过。
- [x] 对照1064路径快照与后续主树采样核对范围；保留外部新增修改，HEAD/branch/index与两项既有删除保持，最终差分及哈希在TEMP root-final-audit。
- [x] 交接区分实际AGY、Codex代码审查、自动命令和未执行的真实GUI/Tauri/HTTP/双设备验收；不把上一轮63/63作为本轮证明。

## 进度与实际证据

- 2026-10-09：只读审计完成，旧实现专项 63/63 仅证明原在线实现；当前新需求尚未实施。
- 本轮基线 manifest SHA256：`bde8b497e86ed1e0ba4726614c299f414974f414e8ac66b3c08d01b350225dfe`。当前源码 frozen，之后按本计划实施。

### Task 1 实际命令与边界

cwd `D:/CodeBase/Active/Auralis/Auralis-Server`：

1. `./mvnw.cmd -B -ntp clean '-Dtest=ReviewLifecycleServiceTests' test`：RED exit1，15 项/5 failures/1 error；实现后同命令 GREEN exit0，15/15。这是中间代码，不代替最终证明。
2. `./mvnw.cmd -B -ntp clean '-Dtest=ReviewLifecycleServiceTests' '-Dauralis.review.fixture.export=true' '-Dauralis.review.fixture.path=C:/Users/Gnasche/AppData/Local/Temp/auralis-review-stats-local-first-20261009/backend/review-lifecycle-parity-fixtures.json' test`：exit0，16/16，真实 Service/MockMvc 导出 13 场景。
3. `./mvnw.cmd -B -ntp clean '-Dtest=ReviewLifecycleServiceTests,ReviewServiceTests,SubjectStatsTests,StatsServiceTests,OpenApiArtifactTests' '-Dauralis.openapi.export=true' test`：exit0，32/32，0 failure/error/skip，316 main/90 test sources 编译，真实 OpenAPI 导出。
4. `./mvnw.cmd -B -ntp clean '-Dtest=OpenApiArtifactTests' test`：exit0，9/9，运行时与 artifact 比对。
5. repo cwd `./scripts/generate-openapi-sdk.ps1 -SkipExport`：exit0，pinned openapi-typescript 7.13.0，PC/Mobile 同 hash `E0092F4B061796C76D7509C85A8B1F65E8CEA6361233938CA279CFF23E90A02A`。

TEMP `backend/report.md` / `verification.log` 为工具捕获关键输出的转录，明确不是原始 stdout 重定向。原增量 Maven JUnit discovery 的 JsonNode NoClassDefFoundError 由 clean 运行解决；首次 OpenAPI 断言错误把 `$ref` 当内联对象，修正为组件引用后最终通过。未修改产品源码来掩盖这些失败。当前 Service hash `6085F1916222CC4416F5D8A2A5C2E2C9EC409ED04B01A84E939687A926858942`；fixture hash `D0C2DCA9AA4E5EB81720EFD2C9341BDF5BACB546ED0F0A8C2CCCE378490F4726`。

Task 2 当前进度：Antigravity delegate `c71c3b827cdd`（Gemini 3.1 Pro High）生成初稿；无实际测试命令证明，Codex 执行 Agent 验证发现类型错误、Stats facade/SQL 不匹配、字段缺失、错误使用未安装 Vitest。未把初稿应用主树。正在同一隔离 worktree `wt-8bf03f0a` 通过 Antigravity bg `5f264d49a421` 继续实现、补 Node/真实 SQLite 验证，不恢复或覆盖原分支。该阶段仍未通过，不等于本地需求已交付。

第二轮 bg 虽报告 exit0，日志为 `print timeout after 10m0s with turn in progress`，不能视为完成。已有真实 TS 与测试运行失败证据，MCP优先使用已履行，主Agent授权同一个Luna执行Agent在同一隔离工作树直接完成必要补修与验证，不再等待第三轮大范围生成。AGY与Codex补修/命令/最终GUI验收分别登记。

Task 2 中间验证：执行 Agent 在独立旧源码基线运行冷离线 state 用例，exit1（旧 Store 请求 HTTP 并报 network unavailable）；隔离新实现同例 exit0、HTTP 调用为 0。真实 Java fixture 的 13 个排程场景已通过，曾检测出微秒精度差异后修复。这两项不代表完整本地链路已交付；统计、真实历史、独立同步与重启/冲突/持久化专项仍在补齐，完整类型与构建门槛待最终运行。

主树并行修改保护：只读快照核对发现五个 PC 路径在本轮开始后有外部修改：Review 专项、两个 Subject Pane、ReviewStore、SubjectWorkspace。包括卡片尺寸/布局/返回、提前复习/掌握抽查入口、强制结束临时轮次及移除卡片内历史按钮。执行 Agent 已收到实际差分，按当前实现增量合并并验证；SubjectWorkspace 只作为外部验证基线，不作为任务补丁。结束轮次不删除正式待同步数据。证据在 TEMP `backend/worktree-audit.md` 与相邻 patch/hash 文件。

Task 2 后续中间状态：本地 SubjectStats、legacy history 读取、独立补传与 Pane 本地更新入口已接通，首轮 type-check exit0；显式云端冲突选择、导入完整度/pending 状态及 SQLite/浏览器专项尚在补齐。该结果仍不能替代最终全链路门槛。

Task 2 后续专项 `node --experimental-strip-types --test --test-force-exit scripts/r4-review-local-first.test.mjs` exit0、10/10，`npm run type-check` exit0。新增覆盖包含 SQLite 原子回滚、损坏结构不覆盖、跨重启未确认初选、旧协议零 POST、旧回执不重基后续命令、5xx/本地 ACK 失败原样重试、账号 A→B→A/401/finally 代际、正文及父墓碑、IANA/legacy 首学/来源/纠正统计、显式云端选择保留归档。之后还补了 history KB version/hash 二次核验，尚须重跑；真实 SyncStore 自动唤醒、旧专项和外部差分合并后最终门槛仍未完成。根启动唯一只读 reviewer 先审已完成的 Task 1，前端最终完成后由同一 reviewer 继续完整任务审查。

随后加入真实 `useSyncStore` 调度/online 唤醒，同一专项 exit0、11/11，type-check exit0。旧 Review 专项期待 Store 远端分页（201项/重复 cursor/第二页失败）不符合最新本地读取；旧 promise 等待使组合挂起，Ctrl-C exit1。旧 Stats 16项有13项失败，期待 HTTP 结果且 Node harness 缺本地 storage/window。保留失败证据，迁移有价值断言到真实本地 Store/Sync 全 KB 历史导入，不删除或 skip 当前仍适用的保障；不再使用的远端 states 分页不当作当前运行链路或本轮测试证明。

实际 201 KB 导入测试发现每 KB 重扫学科导致 40.8秒；仅去掉外层重复资格加载，每 subject 一次，逐条原子资格与派发前 hash/scope 检查保留。`node --experimental-strip-types --test --test-force-exit --test-name-pattern='ReviewSync imports every local subject block' scripts/r4-review-local-first.test.mjs` exit0，201条场景 0.69秒，首/中/末、协议不支持的中间失败及历史不完整标记验证通过。该性能数值仅是此自动场景，不是 GUI/真实服务耗时承诺。

唯一 reviewer 后端初审本次差分 BLOCKER=0/IMPORTANT=0/OPTIONAL=0，不重复普通测试；已继续只读当前 PC 高风险实现，记录 source hash，最终外部合并与命令报告到达后再核对并裁决全任务。当前仍未整体完成。

后续隔离专项 exit0、26/26，包括 core 未收敛时 defer、同 KB 无 ACK 停止、真实首回执 version0、迟到结算不能覆盖新正文/复活归档、账号/学科围栏及统计；独立已掌握重开回归 exit0、2/2。它们是中间代码证据，尚未覆盖随后追加的正文云端锚点证明与最终外部 UI 合并；旧 Review/Stats 专项、完整静态/构建及主树验证仍须完成。

根 Agent 已接受只读 Service 设计分析的最小边界：当前完整 lifecycle/legacy 历史与精确 state 失效形态能证明正文更新来源，独立锚点必须来自编辑前权威导入。只允许首条从未 prepared/派发、无 reviewId 的新正文学习意图用 GET 真版本准备；已有/新增他端复习、presence 变化、证据不足或已固化请求均不重基。分析在 TEMP `backend/content-invalidation-baseline-analysis.md`，未运行新测试、未改后端。执行 Agent 正追加 RED/GREEN 和字段验证，此必要修复登记为第十四项 IMPORTANT。

用户外部界面又更新了毛玻璃正文遮罩、卡片尺寸、返回结束本轮与统计布局；最新捕获必须重新以当前主树字节为准。新增 `Auralis-PC/scratch/` 是外部路径，本轮不修改。原外部 Review 48/48、Stats16/16、R4 618/618 不替代本轮本地链路验收。

最新主树只读保护核对：1064原路径→1067当前路径，32差异=8后端+2生成SDK+15根文档+5外部PC+2新增scratch，无缺失或既有删除重现；HEAD/branch和空索引语义保持。五个外部PC最新完整字节/patch/hash与scratch副本在 TEMP `latest-main-preservation/`，已提供执行 Agent；这只是合并前采样，最终主树应用后仍需核对。独立重开专项的 TEMP 报告转录已修正，最终两case脚本 SHA `4351899F2359BFB4F79E208A5738C6ACA0EF3B3C7A0E64F791754B5524128E36`，未为修正文案重跑测试。

最终完整本地专项（仍为隔离树）：`node --experimental-strip-types --test --test-force-exit scripts/r4-review-local-first.test.mjs` exit0、36/36、无skip；包含13个真实Java排程场景、SQLite原子回滚、fallback结构校验、core ERROR/CONFLICT延后并恢复、固定载荷重试、真实首ACK0、元信息Core ACK版本2→9、正文失效/他端复习、历史数组重排与同ID字段改变、scope及迟到结算、真实commit-await强制结束成功/失败和SyncStore唤醒。旧在线fixture无云端锚点时安全prepare拒绝POST造成gate等待，已用权威导入迁移并加5秒有界等待；原失败/挂起保留在执行报告，不改生产守卫掩盖它们。

两个Pane最新UI经独立执行Agent精确合并，style块与当前用户快照逐字同hash；Stats提示破坏条件分支与force返回回归由根完整diff确认并要求必要修复。Stats专项exit0、11/11（含pending>0真实组件渲染保留主体）；types、学科workspace静态与build exit0。最终Review专项、主树应用和完整包门槛仍未完成。

额外静态命令 `npm run check:r4-pc` exit1：`node scripts/check-r4-pc.mjs` 唯一报 `src-tauri/src/local_asset_store.rs: fixed local address`。checker第18行全文件匹配loopback带端口，Rust第1421行起为cfg(test)，命中测试行1486/1525/1998/2087/2112。两文件与本轮原manifest完全相同且git干净：Rust SHA `4D089AAB696AEBF3E28A47253AD5F3EDEFD5438DD134DA6822FDDF64D8C422C2`，checker SHA `68FA598A44CF291BBFBABECF3729296E70FA3D580C7F7DDDB7C37DC70A6C2F31`。按范围外/OPTIONAL保留，不修改Rust/scanner，不声称该命令通过。

后续真实 Store 回归发现两个本地范围缺口：生命周期明确返回 null 时，缓存用旧值回填 pendingReviewId/nextReviewStage/lastReviewId/lastPracticeAt，导致 HARD 尾回忆卡在确认态；已最小改为仅 undefined 回退，相关 RED/GREEN 通过。已同步 KB 首次冷离线、尚无远端复习导入时，也被 statePresenceKnown 门槛拒绝；本机按实际存在性保存，未知云端仍不计确定新学习。首次空云端和已有 version0 两分支，以及重启持久数据，已定向通过；没有把未知当作远端不存在。

未知起点的首学→初选→确认实际三意图链又检测出初选派发丢失 reviewId，以及无锚点后继无法使用自身已接受前缀。只允许完整 protocol2 空远端接受首学后，完整历史恰等于该意图的实际 ACK 前缀时继续；他端插入事件仍停止后继。GOOD/HARD 两条动态链定向通过，五类 dispatch 字段核对和最后完整门槛仍待收尾。这些是隔离树中间证据，不表示主树已交付。

随后隔离本地专项 `node --experimental-strip-types --test --test-force-exit scripts/r4-review-local-first.test.mjs` exit0、42/42。新增真实 Store 的未知起点认识/模糊首学→初选→确认链，分别上传 `(baseVersion,expectedStateAbsent)=(0,true),(0,false),(1,false)`，初选和确认使用同一 reviewId；忘记→重学也按原 reviewId 接受三个实际 ACK0/1/2。首学 ACK 后插入他端命令时仅一条 POST，后继 conflict/pending 保留。初选 required reviewId 与学习/重开 optional reviewId 按 API 透传，确认/纠正仍用 route id。

本次整专项首跑为34 pass/7 fail：旧 LocalReviewService 模拟调用遗漏 ReviewAttemptRequest 必需 reviewId，严格 dispatch 拒绝初选，造成原 FIFO/网络恢复预期不符与三个有界晚回等待超时；迁移夹具为现行真实请求后42/42通过。原错误及账号 A→B→A 未到派发的失败保留在报告，不放宽生产锚点来消除它们。SQL raw事务有效JSON缺准备字段的拒绝及无部分写入也已纳入完整专项。原 Review 页面全脚本迁移、主树应用与最终包门槛仍未完成。

原页面回归收尾时又发现本地冲突恢复缺口：LocalReviewService 抛普通 `Error('409 RESOURCE_VERSION_CONFLICT')`，Store 仅认 ApiProblemError，实际本地版本变化因此只显示原样重试冻结旧base。根及唯一 reviewer 均确认必要修复：本地冲突明确分类，重新确认仅读取当前严格解析的完整本地 state/history；未知/不完整/正文或 scope 变化安全结束本卡，正式记录和 outbox 保留。Store 不借 HTTP 或旧本地 cache 自动采云端新base；ReviewSync 远端409仍通过显式采用云端处理。已授权同一主执行 Agent 最小修复并补真实本地交错 RED/GREEN；UI测试 Agent 保留独占测试文件，原四项重新确认回归不得用HTTP转接桩掩盖网络调用。

最终隔离专项44/44与type-check exit0。实际事务交错“开轮后KB移动”先复现未设置 conflictNeedsConfirmation（false!==true），最小统一标准409类型后通过；完整本地历史的重新确认零HTTP，不完整历史安全结束卡片保留正式记录。真实SyncStore延迟Review结果在A→B期间先复现写入B的reviewSyncError，await返回后立即核当前scope修复后通过。原Review专项48/48、Stats11/11、重开engine2/2均通过，原页面覆盖映射与strict no-HTTP RED/GREEN在TEMP `review-script-migration.md`。

执行Agent按根已审20路径列表精确应用主树：应用前20/20当前main SHA与捕获值匹配，逐路径备份后copy，应用后20/20与隔离输入SHA匹配。证据在TEMP `frontend-final/main-apply-20261009/`；没有复制构建生成声明、用户Workspace、已同hashSDK、Service或文档。HEAD/branch/index tree分别仍为ed08697/codex/subject-review-stats/2c554747。该采样时最终门槛尚未执行；之后实际完成情况以下方最终记录为准。

## 最终交接与证据（2026-10-09）

### 实际实施与最终审查

- 实际调用Antigravity两次（Gemini 3.1 Pro High），初稿及10分钟print-timeout均未作为业务完成。Luna执行Agent在同一隔离树按真实失败补修；根审核完整20路径输入和差分后，执行Agent守卫应用，初次主树659/659、类型/学科两项静态/构建exit0。此前证据保存于TEMP `frontend-final/final-report-20261009/`。
- 随后两个Pane和Review专项有新的外部修改：统计改三层7天看板、复习HARD组尾自动巩固及提示收敛。根保存原字节/差分并保留它们，相关四脚本105/105、类型exit0；该时点不把此前659门槛当作最新源码验证。
- 唯一readonly reviewer完成后端初审（B0/I0/O0）与前端十四项必要发现，后续本地409问题也经该reviewer确认；最终全任务报告因使用额度中止。执行代理同时触及额度，根接手最终检查，不再启动另一reviewer。最终报告明确为主Agent审查，未伪称独立reviewer最终通过。
- 根完成持久仓储/SQL事务、命令准备/派发/ACK、状态/统计、本地冲突与最新UI的最终检查，再补两项必要问题：① scoped resource miss回退未隔离旧缓存，RED实际读取遗留KB；② engine确认/学习/重开与现行Java规则不一致。修复都在原20路径内，没有改后端或扩公共架构。
- 本地GOOD确认新增8种边界：EARLY_RECALL、提前练习、提前1微秒、到期满30天最终验证、不足30天、少1微秒、提前最终验证、已掌握抽查。已有state学习统一10分钟、重开清旧核对ID。每个正式结果仍同reviewId，确认日期/lastPracticeAt使用selectedAt，resolution保留真实完成时间；纠正AGAIN按其自身occurredAt。
- 首次完整包662/664失败两项：原测试夹具默认EARLY_RECALL，却期望跨天增加稳定次数。只在这两个用例明确CROSS_DAY，保留其增加次数断言；EARLY_RECALL不增加另有新增覆盖。失败原日志留在TEMP `root-final-audit/schedule-confirm-fix/r4-fixture-failure.log`，没有放宽生产调度使测试通过。

### 最终实际命令

cwd `D:/CodeBase/Active/Auralis/Auralis-PC`：

| 命令 | 退出码/结果 | 证明范围 |
| --- | --- | --- |
| `node --experimental-strip-types --test --test-force-exit --test-name-pattern='browser review ignores unscoped legacy resources' scripts/r4-review-local-first.test.mjs` | RED1→GREEN0，1/1 | 当前账号缺资源/无绑定仓储不读取旧键，提交404且无record/outbox；旧键保留 |
| `node --experimental-strip-types --test --test-force-exit scripts/r4-review-reopen-engine.test.mjs` | 0，4/4；相关新增边界及重开/精度各有RED | 原重开保障与8类确认/已有state重学；不把原13个Java fixture的初选覆盖当作全部确认覆盖 |
| `npm.cmd run test:r4-pc` | 0，664/664，0 fail/cancel/skip | 最新外部UI与根必要修复后的主树整包；包含Review48、本地45、Stats11、engine4（共108专项） |
| `npm.cmd run type-check` | 0 | 当前源码类型检查 |
| `npm.cmd run check:subject-icons` | 0 | 学科图标现行约束 |
| `npm.cmd run check:subject-workspace` | 0 | 学科工作区现行结构约束 |
| `npm.cmd run build` | 0 | Web产物构建；有既有externalization/chunk/dynamic-import警告 |
| `git diff --check -- <20个本轮PC路径>` | 0 | 本轮tracked差分；新增/未tracked文件另做内容与空白核对 |

日志与源哈希在TEMP `root-final-audit/`：`final-r4-pc.log`、`final-type-check.log`、`final-static.log`、`final-build.log`、`final-task-source-hashes.json`。最终根审查与边界见相邻`final-review-report.md`。

后端冻结证据继续使用Task1实际clean聚焦32/32、独立OpenAPI9/9、SDK生成exit0。根未重复后端测试，未改已有迁移；PC/Mobile SDK同hash，服务端协议仍须重建运行后端才启用。

### 范围与工作树保护

- 原1064路径快照与当前1075路径对比：19:31采样56处差异，19:37最终采样55处=20本轮PC+8后端+2生成SDK+15现行文档+1先前外部Workspace+2scratch+7后续主树变化。后续7处为Task日期校验/测试、Dashboard/Timeline及Asset布局；根未修改其业务代码。构建生成的声明文件一度仅字节格式变化，规范换行后的文本始终与原快照相同，最终字节也回到原SHA；没有手工还原。
- 初次20路径输入/输出守卫与备份完整；最终12路径仍与659时源哈希相同，8路径为两个最新外部Pane及6个根必要修复路径。两个Pane逐字匹配最新用户副本；Review专项相对最新用户副本只改两个CROSS_DAY夹具。
- Workspace、两个scratch、Home/Settings既有删除及branch/HEAD/index保持；没有stage/commit/reset/依赖/lockfile或部署修改。最终完整清单、后续外部路径及SHA在TEMP `root-final-audit/final-preservation.json`/`final-path-hashes.json`。
- 整个仓库`git diff --check`仍有范围外用户空白，`check:r4-pc`仍有上方已归因的测试地址扫描误报；两者未写成通过，也未顺手修改。

### 验收边界

- 代码与上述自动门槛通过；主Agent最终审查未留当前需求范围的BLOCKER/IMPORTANT。独立reviewer最终全任务审查未完成，原因与接手方式如上。
- Node场景主要使用浏览器localStorage；SQLite事务用真实`node:sqlite` adapter。网络与多端交错用API adapter；后端聚焦证明为H2/MockMvc/OpenAPI，不等于运行容器HTTP链路。
- 真实Tauri数据库启动/升级、断网重启、GUI点击/布局、真实HTTP及双设备同步冲突仍需在运行环境验收。本轮未部署、未操作生产库或数据卷，不将临时round持久化。
