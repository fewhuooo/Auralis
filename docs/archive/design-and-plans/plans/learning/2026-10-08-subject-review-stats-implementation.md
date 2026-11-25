# 学科复习与统计实施计划

> 执行方式：采用 subagent-driven-development，由 PC / Service 两个 Luna 执行 Agent 分工；仓库单 reviewer 规则优先于技能的多层审查默认值。用户已授权创建新分支后执行，不再重复请求实施确认。

**Goal:** 在学科工作区交付知识块分组复习和独立统计页，首次评分调度、后续本轮巩固及本机切页恢复形成闭环。

**Architecture:** Service 增加 owner-scoped 的学科状态分页与统计读取，沿用既有评分、历史和 FSRS_LITE。PC 在既有 Review Store 中保存每个学科的运行中轮次，在 SubjectWorkspace 的中心区显示两个新组件；统计不分配专注。

**Tech Stack:** Vue / Pinia / typed OpenAPI SDK / Node tests；Spring Boot / JPA / JDBC / H2 与现有 PostgreSQL 测试设施。

**Status:** 本记录保留初始交付与两项反馈当时的证据。用户现已授权新机制，后续执行见 [复习、学习与掌握退出实施记录](2026-10-08-review-learning-mastery-implementation.md)；下方旧测试/审查不证明新机制。真实环境边界单列。未提交、暂存或部署。

## 后续机制研究与证据边界

- 用户要求整理整体计划，当前完整设计见 [复习、学习与掌握退出](2026-10-08-review-learning-mastery-design.md)。新页面采用待学习/待复习/已掌握三类，初始间隔建议 GOOD 3天/HARD 1天/AGAIN 10分钟，后续7/14/30天并最终毕业；10分钟再回忆不推进跨天进度。同次有效结果统计及首次/重新学习完成、未核对初选边界见新草案；新设计未编码，不能由下方旧测试或审查推定通过。
- 用户最新要求复习先认识/模糊/忘记了，再衔接完整信息核对、末尾巩固或学习；已确认模糊末尾隐藏正文回忆一次，失败转学习。三段式学习与独立命令方案现已授权实施，进度与验证见上述新实施记录。
- 用户随后明确初选立即计算日期，展开后记错按 AGAIN 再次计算并纠正前一次结果；该要求覆盖原只计算一次与延后核对提交的方案。当前讨论同次复习纠正语义，不将下方已执行的单次提交 Store 规则当作新机制实现。
- 下方两项反馈记录是前次已执行事实。第一次冻结和 reviewer 对应 `a2145bb7` 源码；随后外部 UI 写入移除了明细抽屉/列表、加入状态计数，并回写四档 ratings。没有回退这些外部改动，仅把 ratings 合并为两项。
- 并发后当前快照为原 TEMP 目录 `after-concurrent-ui/manifest.json`（1049 文件，2026-10-08T02:19:57 UTC）。该阶段实际 RED 为 39/41、GREEN 41/41，后续门槛的已收集事实以其 `evidence/` 原始日志/meta 为准；唯一 reviewer 尚未对该合并出具新结论，用户转入研究后不再继续实施/审查。原报告不能推定最新文件或新机制已通过业务验收。
- 只读交接确认该阶段 R4 595/595，类型、两项学科静态及 build 退出 0、47/47 renderer 资产；当前没有执行 Agent 启动的 Node/npm/Vite 构建进程。但源文件在 02:20:53 UTC 记录 hash 后又有六处外部文案/label 修改，最新报告 hash 为 `6ee0e7fa640691bb5ec8ee6045b17a55fcbc61b98d9de5c6646375684a1d45d6`，不能将该批门槛宣称为验证了最后文案。当前 ratings 仍为 GOOD/下一个、AGAIN/记错了；全部外部修改保留。

## 2026-10-08 补充：复习卡片两项反馈

用户最新要求：展开正文后只提供“下一个”与“记错了”。本节覆盖下方原实施清单的卡片评分入口，其他范围保持已批准实现；当前用户修改的计划卡片、骨架遮罩、正文排版和统计日历保留。

- [x] 单一“展开内容”操作只揭晓，不提交评分；“下一个”调用现有 GOOD，“记错了”调用现有 AGAIN。
- [x] 记错回到本轮队尾，首次成功反馈调度一次，后续本轮巩固不提交额外事件；保留同事件重试、冲突再确认与切页恢复。
- [x] 只改 `SubjectReviewPane.vue` 与现有 `r4-subject-review.test.mjs`；Store、API、Service、StatsPane、依赖和历史评分协议保持基线。历史 HARD / EASY / SKIP 仍正确显示和重试。
- [x] 真实 Vue 挂载与点击、Pinia/API 桩专项先 RED：28 项中 26 pass / 2 fail（缺少目标按钮）；实现后 GREEN 28/28。新增点击回归覆盖揭晓零评分、两按钮载荷、记错队尾与重复练习无请求。
- [x] 最新相关门槛退出码全部为 0：复习/统计联合专项 41/41，完整 PC R4 595/595，类型、两项学科静态检查与 build 通过，47/47 renderer 资产复制。
- [x] 唯一 reviewer 只读核查本轮两文件增量及需求一致性，BLOCKER=0、IMPORTANT=0、OPTIONAL=0；根代理完成当前基线完整差分核对，范围外修改与缺失为 0，旧删除、HEAD 与空暂存区保留。

本轮基线为 `C:/Users/Gnasche/AppData/Local/Temp/auralis-review-two-actions-20261008/manifest.json`（1049 文件，2026-10-08T02:09:24 UTC）；`files/` 保存当前用户视觉修改与既有 dirty 工作树。没有提交、暂存、分支切换或容器切换。所有命令在 `D:/CodeBase/Active/Auralis/Auralis-PC` 执行，完整 cwd、UTC 时间、退出码与原始输出分别保存在该目录 `evidence/<name>.meta.json` / `<name>.stdout.log`：

| 名称 | 实际命令 | 结果 |
| --- | --- | --- |
| red-focused / green-focused | `node --experimental-strip-types --test scripts/r4-subject-review.test.mjs` | RED exit 1，GREEN exit 0，28/28 |
| focused-review-stats-final | `node --experimental-strip-types --test scripts/r4-subject-review.test.mjs scripts/r4-subject-stats.test.mjs` | exit 0，41/41；覆盖最终两项按钮断言 |
| test-r4-pc | `npm.cmd run test:r4-pc` | exit 0，595/595 |
| type-check | `npm.cmd run type-check` | exit 0 |
| check-subject-icons | `npm.cmd run check:subject-icons` | exit 0 |
| check-subject-workspace | `npm.cmd run check:subject-workspace` | exit 0 |
| build | `npm.cmd run build` | exit 0，47/47 renderer 资产 |

上述测试彼此包含，不相加为独立用例总量；使用真实组件/Store 与可控 API 桩，不替代 GUI/Tauri/真实 HTTP/多端业务验收。构建保留既有大 chunk、useSyncStore 混合导入与 file-viewer plugin timing 非阻断警告；未重跑或关闭原 Service 全量门槛失败。

唯一 reviewer 报告为本轮 TEMP 目录 `reviewer-report.md`。R4 全量运行在 02:11:25–02:11:27 UTC，最终测试文件随后增强两项按钮集合断言，最终专项于 02:13:31–02:13:32 UTC 运行并覆盖该增强；不将较早全量写成最后测试内容的全量复跑。ReviewPane 源码在绿色门槛期间保持一致，最终 SHA-256 为 `a2145bb7e4c9126a4faa3992392252f9ef3b1307ffa35d6cc2880321a6fd045b`；最终测试为 `8f600b2cae9e9e694dae05a182277bd705b4a3eda98dd5a6f6e1ddafde50f683`。

最终可读增量采用根代理保存的 UTF-8 `baseline-relative.diff`，全范围与工作树保护为 `final-scope-audit.json`。执行代理较早的 `evidence/final-delta.patch` 中文编码损坏，保留该原始 artifact，但不作为可读最终差分；实际源码和最终根代理差分 UTF-8 正确。

## 授权、基线与边界

- 已批准设计：[学科内复习与统计页面方案](2026-10-07-subject-review-redesign.md)，包含用户最新的仅本机切页恢复要求。
- 执行分支：`codex/subject-review-stats`，起点 HEAD `ed08697c195aefe593e456c5f58802f8f5b39a85`。原工作树的全部未提交修改随分支保留，不提交、暂存、重置、部署或操作业务数据。
- 完整快照：`C:/Users/Gnasche/AppData/Local/Temp/auralis-subject-review-stats-implementation-20261008/files/`；manifest 保存 1040 个当前文件 hash 和两个既有删除。差分必须相对此快照，不应用覆盖原 dirty 修改的 HEAD 宽差分。
- PC / Service 为功能范围；Mobile 只允许生成 SDK 的必要差分。Auth/request、Sync、Asset 清理、排期与截止、个人专注等已验证实现冻结，新增调用复用现行作用域票据，不为本任务重构。
- 无新依赖、数据库迁移、离线 Review outbox 或 durable 本轮练习。仅当前应用进程的 Store 内存恢复；刷新、重启、切账号或会话变化清除本轮。
- 用户最新明确本轮不使用 Antigravity，PC 由 Codex 执行 Agent 直接实现可运行的简单页面框架与业务接线；界面细节交用户后续调整，不进行视觉重设计。
- GUI、真实 Tauri/HTTP、跨设备业务验收单列。全量 Maven 已知 TaskColorRemovalMigrationTests 的 V21/V28 断言失败不属于本任务，不隐藏、跳过或顺手修复。

## 分工及文件范围

Service Agent 可以修改：

- `Auralis-Server/src/main/java/com/auralis/app/review/ReviewController.java`、`ReviewService.java`、`internal/persistence/ReviewStateRepository.java`，必要的 review 查询 DTO。
- `Auralis-Server/src/main/java/com/auralis/app/stats/StatsController.java`、`StatsService.java`、`internal/StatsQueryRepository.java`，或 stats/internal 下仅学科聚合的查询类及独立强类型响应记录。
- `Auralis-Server/src/test/java/com/auralis/app/` 下相关 Review/Stats 新增专项及必要 OpenAPI 测试。
- `docs/contracts/openapi/auralis-openapi.json` 和通过 `scripts/generate-openapi-sdk.ps1` 生成的 PC/Mobile `src/api/generated/schema.ts`，不得手改生成类型。

PC Agent 可以修改：

- `Auralis-PC/src/api/useReviewApi.ts`、`useStatsApi.ts`，`src/store/useReviewStore.ts`、`useStatsStore.ts`；若轮次状态需要纯函数，可在 `src/services/subjectReviewSession.ts` 只承载这项新增行为。
- `Auralis-PC/src/components/subject/SubjectReviewPane.vue`、`SubjectStatsPane.vue`，`src/views/SubjectWorkspace/index.vue` 的入口/视图接入及 `src/views/Timeline/index.vue` 的旧生成器删除。
- `Auralis-PC/scripts/r4-subject-review.test.mjs`、`r4-subject-stats.test.mjs`、必要既有协议/静态回归和 `package.json` 的测试登记；不改依赖。
- `Auralis-PC/components.d.ts` 仅接受 build 自动生成的 SubjectReviewPane / SubjectStatsPane 两项注册；这是最终差分检查发现并按新组件要求接受的必要生成差分。
- `Auralis-PC/src/store/useSubjectStore.ts` 仅允许成功提交删除墓碑后调用新增 Review 清理钩子。最终 reviewer 证明复习页已卸载时删除学科会遗漏轮次失效；补修固定发起会话，删除失败及迟到旧账号响应不得清除其他缓存，不改原删除流程。
- PC 页面、Store、API 和必要作用域保护均由 Luna 直接处理；禁止调用 Antigravity，不修改鉴权核心或契约产物。

主 Agent 拥有实施/设计、README、Status、Issues、FrontendPC、Backend、Frontend、API、Database、ProductRequirements、Architecture、Changelog 文档回写及高风险裁决。Agent 不同时修改这些文档。

## Task 1：学科状态与统计 Service

**Interfaces:**

```text
GET /api/reviews/states?subjectId=<UUID>&cursor=<opaque>&limit=<1..200>
  -> 现行 CursorPage 包装，items 为完整 ReviewStateView（到期及未来）
GET /api/stats/subjects/{subjectId}?days=<7|30>&timeZone=<IANA>
  -> SubjectStatsView：subjectId、generatedAt、timeZone、from、to、overview、daily、ratingCounts
POST /api/reviews/events 与 GET /api/reviews/history 保持现行语义
```

Service 已固定并向 PC 通知如下字段，资料总数由 FILE/TEXT/URL 三项相加，不额外返回重复总量；不得返回学科 focus 字段。

```ts
interface SubjectStatsView {
  subjectId: string; generatedAt: string; timeZone: string; from: string; to: string
  overview: {
    fileSourceCount: number; textSourceCount: number; urlSourceCount: number
    activeKnowledgeBlockCount: number; activeTaskCount: number
    todoTaskCount: number; inProgressTaskCount: number; doneTaskCount: number; cancelledTaskCount: number
    newLearningCount: number; dueReviewCount: number; scheduledReviewCount: number
  }
  daily: Array<{
    date: string; nonSkipReviewEventCount: number; distinctReviewedKnowledgeBlockCount: number
    firstLearningKnowledgeBlockCount: number; subsequentReviewKnowledgeBlockCount: number
    createdKnowledgeBlockCount: number; completedTaskCount: number
  }>
  ratingCounts: {againCount: number; hardCount: number; goodCount: number; easyCount: number}
}
```

上述为业务字段约定；端侧实际类型以运行时 OpenAPI 生成 SDK 为准，不手写覆盖生成契约。

- [x] 先添加相关 API/查询专项，用当前实现在不支持新路由时明确失败，保留实际 RED 命令、退出码和日志。
- [x] states 在分页前过滤 user、subject、活动 KB/Subject，使用稳定 keyset 及范围约束游标；同账号其他学科、不同账号、删除行和大于 200 条的总集合都不能导致遗漏或泄漏。
- [x] stats 验证活动 Subject/owner、days、IANA 时区；以当前本地日为最后一天，生成 7/30 个 `[dayStart, nextDayStart)` 区间并补零。复习三类与活动 KB 总数在同一查询快照一致。
- [x] 各类聚合独立按 owner/当前学科查询，避免联接乘法；非 SKIP 正式评分 count 与 distinct KB 分开，用 before_state 区分首次与已有状态评分，不能用 baseVersion=0 区分。
- [x] 任务状态总量排除墓碑；当日完成沿用当前 DONE/completed_at 并保留已完成软删除历史的既有统计口径，重新打开后不伪造旧完成次数。
- [x] 运行新专项及既有 Review、Stats、Architecture、OpenAPI 相关回归；失败由同一执行 Agent 定位和最小修复。
- [x] 通过现行生成流程刷新 OpenAPI/SDK，检查仅新增端点/DTO 的必要差分，通知 PC 精确字段名及类型可用。

**Commands:** 在 `Auralis-Server` 执行 `./mvnw.cmd -B -ntp -Dtest=SubjectReviewQueryTests,SubjectStatsTests,ReviewServiceTests,StatsServiceTests,StatsQueryRepositoryTests,ArchitectureTests,OpenApiArtifactTests test`；如新测试类名不同需在执行记录替换为真实类名。SDK 从根目录运行 `scripts/generate-openapi-sdk.ps1`，验证使用现行 `scripts/check-openapi.ps1` 所需环境。

## Task 2：PC Store 与本轮恢复

**State contract:**

```ts
type ReviewRating = 'AGAIN' | 'HARD' | 'GOOD' | 'EASY' | 'SKIP'
// 每个轮次至少固定 scopeTicket / subjectId / roundId / groupSize；
// queue/currentId/revealed；firstAcceptedByBlock；completed/skipped；
// pendingEvent = 同一 clientEventId + reviewedAt + durationSeconds + rating + baseVersion。
// 非正式巩固不调用 POST /events。
```

- [x] 用真实 Pinia 与可控 deferred 网络写专项，证明首次评分一次、后续队尾练习不请求、SKIP 语义、原样幂等重试与切页恢复。
- [x] 沿用 typed API，新增学科 states 和 stats 的包装；只使用 Service 定稿后的生成类型，不伪造接口返回或手改 SDK。
- [x] states 完整分页成功后才分类；失败保留明确错误，不把未知状态当新学习。首次无状态评分 baseVersion=0，已有状态使用真实 version。
- [x] 首次评分成功时记录该卡本轮已正式评分；弱反馈入队尾，后续弱反馈继续练习，正反馈完成。后续 SKIP 仅本轮移出；正式首轮 SKIP 调现行 events 且不修改计划。
- [x] 按 owner/device/session 与 subjectId 保存内存轮次；组件卸载不删除轮次或待确认请求。返回恢复队列、当前卡、展开态和首次标记；结束本轮和会话失效清除。
- [x] 各异步操作固定作用域/轮次和请求序号；响应只能结算仍有效的对应缓存，不写其他账号/学科或结束新查询 loading。冲突重读并重新确认，超时原样重试。
- [x] 知识块移出/删除、学科删除使相应卡片/轮次失效；服务端状态刷新不能消除本轮已评分标记。评分成功触发同学科 stats 刷新，pending 数据不盲目叠加。
- [x] Service/类型尚未完成时只做前端计划和不依赖契约的专项设施，避免并发手写临时接口。

## Task 3：PC 复习/统计 UI 与旧生成器退役

- [x] Luna 按最新授权直接实现基础页面框架，复用现行布局与控件；不使用 Antigravity、不增加装饰性动效或开展视觉重构。
- [x] SubjectWorkspace 保留原材料、总览、知识库、AI；侧栏新增复习/统计，中间区组件接收当前 subjectId，并支持 query view=review/stats；不增加全局路由。
- [x] 复习页提供三个状态列表、5/10 分组、回忆/展开、四档反馈、跳过、结束、继续本轮、历史、组结果、加载/真实空态/失败重试。正文复用现行 Markdown/math；底部操作区不遮挡长正文。
- [x] 统计页展示概况、三类状态、7/30 天趋势、评分分布及任务状态，点击复习状态进入对应列表。用现行字体/令牌、Tabler 图标与 CSS/SVG 图表，不新增库或装饰性数字，不出现专注指标。
- [x] Timeline 仅移除 checkSpacedRepetition 挂载调用及函数；保留已有普通任务和 `[KB_ID]` 跳转，禁止恢复 reviewAt 字段。
- [x] 检查完整相对快照差分、所有新增文件、删除、依赖、生成类型及跨模块写入。必要 correctness 补修先记录证据，禁止偏好重构。
- [x] 运行 PC 专项、完整 R4、类型、两项学科静态检查和构建，记录实际命令与退出码；范围外的旧失败独立报告。

**Commands:** 在 `Auralis-PC` 执行 `node --experimental-strip-types --test scripts/r4-subject-review.test.mjs scripts/r4-subject-stats.test.mjs`、`npm.cmd run type-check`、`npm.cmd run check:subject-icons`、`npm.cmd run check:subject-workspace`、`npm.cmd run test:r4-pc`、`npm.cmd run build`。

## Task 4：最终验收与回写

- [x] 主 Agent 检查完整增量差分及契约、当前需求和已冻结边界；普通命令以执行 Agent 已有新鲜日志验收，不重复同样测试。
- [x] 只启动一个只读 reviewer，关注 requirement、correctness、race、transaction、data integrity、security；不得修改或派其他 reviewer。发现真实 BLOCKER/IMPORTANT 交同一执行 Agent 补修，直到关闭。
- [x] 同步上述权威文档，明确代码/命令/审查与 GUI/真实服务证据边界；实施记录保存命令、RED/GREEN、diff/hash 和未覆盖范围，并注明用户要求本轮未使用 Antigravity。
- [x] 与 1040 文件快照核对范围外 hash、用户已有删除、HEAD/index 和新分支，确认没有覆盖既有修改。
- [x] 最终仅在需求满足、相关自动门槛和 reviewer 无 BLOCKER/IMPORTANT 时声明本次实现闭环；既有全量迁移失败、GUI/真实 Tauri/HTTP/多端边界仍如实保留。

## 执行记录

- 分支与完整快照保留，代码实现和最终相关门槛已完成。PC 第一轮 37/37（`focused-final4`）、R4 591/591（`test-r4-pc-final3`）仅为阶段记录；第八项删除补修后最终专项 40/40、R4 594/594，详见后面的冻结证据。
- PC RED：`node --experimental-strip-types --test scripts/r4-subject-review.test.mjs scripts/r4-subject-stats.test.mjs`，退出 1，缺少新 API/Store/页面能力。日志与完整命令位于快照目录的 `pc/red-focused.stdout.log` / `red-focused.meta.log`。
- Service RED：在 `Auralis-Server` 执行 `.\mvnw.cmd -B -ntp -Dtest=SubjectReviewQueryTests,SubjectStatsTests test`，退出 1，4 项中 3 failure、0 error；修正测试夹具后仍因新路由返回 404 而失败。证据为 `service/red-focused-validated-fixtures.log` / `.meta.txt`。此前夹具错误尝试保留，不充当有效 RED。
- Service GREEN：上述新增两类最终 4/4（`green-focused-reopened-task-boundary`）；指定 Review / Stats / Architecture / OpenAPI 回归 19/19（`focused-regression`），退出 0。`scripts/generate-openapi-sdk.ps1` / `scripts/check-openapi.ps1` 退出 0，精确命令与 stdout 在 `service/` 对应 meta/log 中。
- 全量 Service：`.\mvnw.cmd -B -ntp test`（未 clean），386 项、1 failure、6 error、0 skip，退出 1（`full-service-test`）；既有 TaskColor V21/V28 断言与本次 Docker 不可用的 6 个容器类错误未修改/跳过。新增专项和相关回归均通过，不能因此声明全项目门槛通过。
- 主 Agent 核对生成 artifact 全部结构：仅新增两个端点与五个 schema，没有修改/删除旧路径、旧 schema 或其他 metadata；证据 `generated-delta-audit.json`。SDK 由现行脚本生成并检查，不手改。
- PostgreSQL 首页 null UUID 疑点经当前依赖精确 sources 排除：Spring Data JPA 4.1.0 包装 TypedParameterValue，Hibernate 7.4.1.Final UUID binder 指定 uuid，PGJDBC 42.7.11 传类型 OID。无代码改动，完整命令与源码证据为 `service/null-uuid-binding-evidence.md`；Docker Engine 与本地 PG 不可用，未声明真实 PostgreSQL 验收。
- PC 第一轮完整门槛曾通过 30/30、R4 584/584、类型/静态/build，但其后必要边界补修使该结果不作为最终冻结证据；本地读取共享投影竞态有 RED→GREEN（直接按捕获 owner/device 读 Repository）。最终集中反馈已补修并完成新鲜门槛。

### 唯一 reviewer 的集中反馈（均已补修并只读复核关闭）

- [x] 重新确认冲突后的正式评分成功也须失效学科统计。
- [x] 停留统计页期间 Sync 完成须按当前范围重读。
- [x] states 刷新中/失败须撤销完整性，不能将旧缺项当新学习；评分响应不能把未完成集合再标成完整，保留有效轮次与 pending。
- [x] 换卡后关闭/切换单卡 history，不把 A 的事件显示在 B 下。
- [x] 单卡 history 补基本耗时显示。
- [x] 组结果补首次反馈分布、下次安排与仍需巩固项，使用简单文本/列表。
- [x] 活动轮次可选择下一组 5 / 10 大小，当前组队列/展开/pending/首次标记保持；当前组数量和恢复后的所选大小显示真实缓存值。
- [x] 复习页卸载后删除学科也须清除其轮次及请求写回资格；删除失败保留原轮次，账号交错及晚评分响应不得写回其他缓存。该真实 requirement 缺口允许上述最小删除钩子补修。

### 最终冻结证据（2026-10-08）

以下路径相对完整快照证据目录；它们保存实际命令、cwd、UTC 起止时间、退出码和原始 stdout。专项与全量集合重叠，不能相加为额外测试数量。

| 工作目录 / 命令 | 实际结果 | 证据 |
| --- | --- | --- |
| PC：`node --experimental-strip-types --test scripts/r4-subject-review.test.mjs scripts/r4-subject-stats.test.mjs` | 40/40，退出 0 | `pc/subject-delete-verified-focused.stdout.log` / `.meta.log` |
| PC：`npm.cmd run test:r4-pc` | 594/594，退出 0 | `pc/subject-delete-verified-test-r4-pc.stdout.log` / `.meta.log` |
| PC：`npm.cmd run type-check` | 退出 0 | `pc/subject-delete-verified-type-check.stdout.log` / `.meta.log` |
| PC：`npm.cmd run check:subject-icons` | 静态契约通过，退出 0 | `pc/subject-delete-verified-check-subject-icons.stdout.log` / `.meta.log` |
| PC：`npm.cmd run check:subject-workspace` | 静态契约通过，退出 0 | `pc/subject-delete-verified-check-subject-workspace.stdout.log` / `.meta.log` |
| PC：`npm.cmd run build` | 构建完成、47/47 renderer 资产复制，退出 0 | `pc/subject-delete-verified-build.stdout.log` / `.meta.log` |
| Service：Task 1 中的七类定向 Maven 命令 | 19/19，退出 0 | `service/focused-regression.log` / `.meta.txt` |
| Service：`.\mvnw.cmd -B -ntp -Dtest=SubjectReviewQueryTests,SubjectStatsTests test` | 最终重开/边界夹具 4/4，退出 0 | `service/green-focused-reopened-task-boundary.log` / `.meta.txt` |
| 根目录：`.\scripts\generate-openapi-sdk.ps1` / `.\scripts\check-openapi.ps1` | 均退出 0 | `service/openapi-sdk-generation` / `check-openapi` 对应 log/meta |

- 最终 PC 门槛在 `2026-10-08T00:18:45Z` 至 `00:19:36Z` 执行。较早 `subject-delete-final-*` 曾执行但 stdout 未保存，随后为完整证据重新执行并正确采集；仅使用 `subject-delete-verified-*` 作冻结依据。构建保留 chunk/dynamic-import/plugin 时间非阻断警告。
- 删除缺口真实 RED 为 `subject-delete-red2`（3 项、1 fail、退出 1），GREEN 为 `subject-delete-green2`（3/3、退出 0）；涵盖 Pane 卸载、迟到 states/history/score、失败墓碑和 A→B 交错。原名含 green 的首个失败尝试 exit 1，不作为成功证据。
- 执行交接为 `pc/pc-final-report.md`；PC 14 路径完整增量 `pc/pc-incremental.diff` SHA-256 `B97DFED042F62319177825B5A544B26CE99661E1D5C7D3E6C2A2E4CC3A7440F0`，hash 清单为 `pc/pc-file-hashes.json`。Service 冻结清单为 `service/service-final-manifest.json`。
- 唯一 reviewer 最终报告 `reviewer-report.md`：BLOCKER=0、IMPORTANT=0，必要反馈均关闭，OPTIONAL=1 保留。主 Agent 不重跑普通门槛，核对原始输出与源文件 hash；文档最终回写后只再做范围/工作树校验。
- 最终范围核对为 `baseline-check.json` / `final-scope-audit.json`：38 个任务变动路径，1011 个原基线文件 hash 未变；无范围外文件、无缺失文件，两个原有删除保留，PC/Service 冻结 hash 匹配。依赖/锁文件/迁移未改，`components.d.ts` 仅两项新组件注册，HEAD 未变、index 空；完整增量保存 `baseline-relative.diff`。

### 保留项与实际验收边界

- reviewer 确认一个 OPTIONAL：未同步知识块可能显示在新学习列表，但计数与可复习集合排除它们，当前提示也说明未同步内容不参与；它们不能正式评分。属于列表显示与数量的细节差异，本任务按规则不修改。
- 未确认评分存在时禁止结束本轮，先用保留的原事件进行幂等确认；reviewer 判断这是维护不确定结果的必要边界，不列为缺陷。后续本轮巩固不产生服务端事件，不能据此声称有跨设备轮次恢复。
- PC 自动证据来自真实 Store、可控 deferred 请求及 browser Repository，前端类型/构建通过不证明 Tauri SQLite/Keyring 或 GUI 操作已验收。
- Service 新接口与聚合由 MockMvc/H2 专项、模块边界与 OpenAPI 门槛验证；本次没有有效 Docker Engine 或本地 PostgreSQL，未完成真实 PG 可重复读并发写入、生产 HTTP 或多端联调。
- 人工验收仍需走学科侧栏、正文/公式展开、四档首次评分与巩固、切页恢复、失败/冲突确认、删除学科和统计 7/30 天切换；界面仅交付用户要求的基础框架，视觉细节由用户后续调整。
