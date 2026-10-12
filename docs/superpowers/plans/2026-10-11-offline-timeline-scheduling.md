# PC 时间轴离线排期实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 后端不可达时，PC Timeline 的插入顺延和已排期任务交换仍立即可靠地保存在本机，并在连接恢复后以服务端原子事务和稳定幂等键完成同步。

**Architecture:** PC 将一次插入/顺延或交换保存为一个 owner/device 隔离的排期命令，并在同一端侧事务中写入受影响 Task 的乐观投影。服务端通过普通 Sync push 接收 `SCHEDULE_INSERTION`、`SCHEDULE_SWAP` 两种命令，复用现有排期业务事务和 `inbound_mutations` 幂等记录；成功或拒绝结果都返回可原子合并的服务端 Task 投影。在线和离线统一经过此路径，REST 排期路由保持现状供其他在线客户端使用。

**Tech Stack:** Vue 3 / TypeScript Pinia，PC SQLite 与 browser LocalRepository，Sync push/pull，Spring Boot / JPA / Flyway，OpenAPI 生成 SDK，以及现有 Node 和 Maven 自动测试。

## Global Constraints

- 保留当前工作树和所有未提交修改；目标文件可能包含并行任务的改动，只对本需求必要区域做最小补丁。
- 仅修改 PC Timeline/Sync、本需求所需 Server 排期/Sync/迁移及其契约文档；不扩展到 Mobile / Tablet。
- 一个排期动作只有一条 Sync 命令；不得将顺延或交换拆成多个普通 Task mutation。
- 每条命令首次本地提交时生成并持久化唯一 `clientMutationId`；任何重试必须复用完全相同的 ID、类型和 payload。
- `change_log` 仍只记录标准 Task `UPDATE`；新增命令类型只用于 inbound Sync mutation。
- 保留现有时间窗、半小时槽、截止时间、完成任务固定、版本冲突和当日未解决写入围栏；不迁移既有 `dueAt`。
- 服务端领域校验失败可以作为幂等结果提交，但 SQL、序列化、锁和其他系统错误必须回滚整笔事务。
- 不将命令验证、自动化验证和 GUI/真实断网验收混为一谈；最终状态按仓库 Stop Rule 更新。

---

## 文件结构与责任

| 文件 | 本需求责任 |
|---|---|
| `Auralis-PC/src/services/localRepository.ts` | 原子写入 Task 投影与一条排期命令；原子终结命令和合并服务端排期结果；保护受影响 Task 不被 pull/snapshot 或并发本地编辑覆盖。 |
| `Auralis-PC/src/types/api.ts`、`Auralis-PC/src/types/sync.ts` | 表达两种排期 mutation 和本地终态。 |
| `Auralis-PC/src/api/useSyncApi.ts`、`Auralis-PC/src/services/syncCycle.ts`、`Auralis-PC/src/store/useSyncStore.ts` | 仅允许排期命令出现在 push；排除它们出现在 change log；原子处理排期响应并保留后台冲突可见性。 |
| `Auralis-PC/src/store/useTaskStore.ts`、`Auralis-PC/src/views/Timeline/index.vue` | 复用当前排期预检和投影，在本地提交单命令，触发 Sync 并区分已同步、已排队、服务端冲突。 |
| `Auralis-Server/src/main/java/com/auralis/app/sync/SyncMutationType.java`、`DomainWritePort.java`、`SyncMutationProcessor.java` | 定义、路由并幂等处理新 Sync 命令；在 inbound 决策和 Task 事务中保存完整排期结果。 |
| `Auralis-Server/src/main/java/com/auralis/app/task/TaskService.java`、`TaskDtos.java` | 复用现有插入/交换校验与原子写入；支持只读的冲突排期快照。 |
| `Auralis-Server/src/main/resources/db/migration/V31__allow_task_schedule_commands_in_sync.sql` | 扩展 inbound mutation_type 至 VARCHAR(32) 并允许两种命令；不改变 change_log 约束。 |
| PC 定向脚本和 Server Sync/Task/Schema/OpenAPI 测试 | 证明断网本地事务、原子服务端回放、重试幂等、冲突恢复和协议范围。 |
| `docs/contracts/API.md`、`docs/contracts/Database.md`、`docs/design/Frontend.md`、`docs/modules/FrontendPC.md`、`docs/modules/Backend.md` | 登记当前线上/离线排期与存储/接口契约。 |
| `docs/current/Status.md`、`docs/current/IssuesAndReview.md`、`docs/release/Changelog.md`、`docs/README.md` | 记录完成证据、残留验收边界、变更及本计划索引。 |

本功能横跨本地 outbox、Sync 和后端事务，三个部分共同保证“一个用户动作至多一次且不会部分排期”，所以保留为一份端到端计划，按接口顺序分解实施。

### Task 1: LocalRepository 排期批量事务

**Files:**
- Modify: `Auralis-PC/src/services/localRepository.ts`
- Modify: `Auralis-PC/scripts/r4-local-repository.test.mjs`
- Modify: `Auralis-PC/src/types/api.ts`

**Interfaces:**
- 新增 `LocalScheduleBatchCommitInput<T>`：`items` 为 `Array<Omit<LocalCommitInput<T>, 'mutation'>>`，`mutation` 为唯一 `LocalMutationInput`。
- 新增 `commitScheduleMutation<T>(input: LocalScheduleBatchCommitInput<T>): Promise<LocalEntity<T>[]>`。仅接受同一 owner 下的 TASK rows、唯一 mutation 类型为两个排期命令之一、每个现有版本匹配；在 SQL transaction 或一次 browser state 写入中保存所有乐观 rows 和唯一 pending mutation。
- 新增 `resolveScheduleMutation(input: { clientMutationId: string; status: 'applied' | 'rejected'; error?: string; items: readonly LocalSnapshotItem[] }): Promise<boolean>`。在同一本地事务中将对应命令置为终态并清理 inflight 字段，再原子合并服务端 Task 列表；任何其他未解决 mutation 或版本/墓碑围栏阻止合并时不得部分写入。`rejected` 为已被服务端处理、无需重放的终态，`error` 保存服务器决策码。
- 新增 `LocalMutationStatus` 值 `'rejected'`；`listUnresolved()` 和 `claimPending()` 不将其视为未解决/待推送。

- [x] **Step 1: 写 LocalRepository 回归测试**

在 `r4-local-repository.test.mjs` 的既有 SQL fake 与 browser storage 用例中增加测试：批量提交写入两个 Task 投影及唯一排期 mutation；事务失败后零行/零 mutation 可见；相同 API 在 browser fallback 只写一个状态快照；版本不符或同一排期成员有 unresolved mutation 时拒绝并保持原状态。增加结算成功、拒绝和版本陈旧场景，断言结算与合并要么全部提交要么全部回滚。

- [x] **Step 2: 运行新测试确认失败**

运行：`node --experimental-strip-types --test scripts/r4-local-repository.test.mjs`（工作目录 `Auralis-PC`）。
预期：新增导出/方法缺失的断言失败；现有用例结果用于确认测试基线。

- [x] **Step 3: 实现 SQL 与 browser 双路径原子 API**

在 `localRepository.ts` 添加上述两个输入/方法。SQL 分支经现有 `runSqlTransaction` 完成行版本及 mutation fence 检查、所有资源写入、唯一 mutation insert/终结、权威 batch 写入；browser 分支在 clone 的 `StoredBrowserState` 上执行同一验证和更新，最后只调用一次 `writeBrowserState`。禁止先调用现有 `commitMutation()` 多次，因为那会创建多个 mutation 并允许部分提交。结算沿用当前 `upsertSyncedBatch` 的低版本和墓碑保护，但增加本命令自身的原子终结例外；整批不可安全接收时返回 `false` 并要求上层启动权威 refresh。

- [x] **Step 4: 运行 Repository 测试确认通过**

运行：`node --experimental-strip-types --test scripts/r4-local-repository.test.mjs`（工作目录 `Auralis-PC`）。
预期：新增与原有测试通过。

### Task 2: 服务端 Sync 排期命令和事务

**Files:**
- Modify: `Auralis-Server/src/main/java/com/auralis/app/sync/SyncMutationType.java`
- Modify: `Auralis-Server/src/main/java/com/auralis/app/sync/DomainWritePort.java`
- Modify: `Auralis-Server/src/main/java/com/auralis/app/sync/SyncMutationProcessor.java`
- Modify: `Auralis-Server/src/main/java/com/auralis/app/task/TaskService.java`
- Modify: `Auralis-Server/src/main/java/com/auralis/app/task/TaskDtos.java`
- Create: `Auralis-Server/src/main/resources/db/migration/V31__allow_task_schedule_commands_in_sync.sql`
- Modify: `Auralis-Server/src/test/java/com/auralis/app/SyncServiceTests.java`
- Modify: `Auralis-Server/src/test/java/com/auralis/app/CoreDomainControllerTests.java`
- Modify: `Auralis-Server/src/test/java/com/auralis/app/SyncSchemaTests.java`
- Modify: `Auralis-Server/src/test/java/com/auralis/app/OpenApiArtifactTests.java`

**Interfaces:**
- `SyncMutationType` 新增 `SCHEDULE_INSERTION`、`SCHEDULE_SWAP`。二者只作为 inbound mutation type；`ChangeLogEntry` 及 SQL `change_log` 约束仍只允许 CREATE/UPDATE/DELETE/RESTORE。
- 插入命令外层为 `resourceType=TASK`、`resourceId=taskId`、`baseVersion=baseVersion`、`mutationType=SCHEDULE_INSERTION`；payload 使用现有字段 `{taskId, baseVersion, scheduledAt, windowStartAt, windowLastStartAt, targetTaskId}`。
- 交换命令外层 `resourceId=sourceTaskId`、`baseVersion=sourceBaseVersion`、`mutationType=SCHEDULE_SWAP`；payload 为 `{sourceTaskId, sourceBaseVersion, targetTaskId, targetBaseVersion}`。
- `DomainWritePort.applyTaskSchedule(...)` 将 payload 转成现有 `TaskDtos.ScheduleInsertionRequest` 或 `ScheduleSwapRequest`，调用现有 `TaskService` 事务方法，结果统一为 `List<TaskView>`。
- 排期冲突时服务端 `current` 为用户范围内当前相关 Task 列表：插入为请求当天窗口内全部活动排期 Task 加 source Task；交换为 source 与 target。拒绝/冲突结果只保存此列表，不改变现有响应字段。

- [x] **Step 1: 写 Server 失败测试**

在 Sync 服务测试中增加命令首次执行、相同 ID/hash 回放完整列表、相同 ID 不同 hash 拒绝、版本冲突返回完整当前 Task 列表且无部分移动，以及插入/交换成功仅产生 Task UPDATE change log 的用例。在 `SyncSchemaTests` 断言 V31 只扩展 inbound CHECK 并保留 change_log CHECK。

- [x] **Step 2: 运行 Server 定向测试确认失败**

运行：`.\Auralis-Server\mvnw.cmd -B -ntp "-Dtest=SyncServiceTests,CoreDomainControllerTests,SyncSchemaTests,OpenApiArtifactTests" test`（从仓库根目录）。
预期：新 Sync mutation 类型当前无法解析或新断言失败；保留现有失败的准确输出供后续归因。

- [x] **Step 3: 实现 Sync command、冲突快照与迁移**

实现上方精确命令外形。`SyncMutationProcessor` 对排期命令保存 service 返回的 Task 列表并使用本次捕获的最后一个 change cursor；若动作无任何 Task 改变则 cursor 为 null，仍保存 APPLIED 幂等结果。对 `RESOURCE_VERSION_CONFLICT` 和排期业务 REJECTED，在同一 `REQUIRES_NEW` transaction 中保存当前排期列表。为安全提交业务拒绝，先重构 `TaskService.insertSchedule` 为“完整计算所有新起点并验证 → 一次应用变更”，使任何 `DomainException` 都发生在修改实体前；仅排期事务对 `DomainException` 使用 `noRollbackFor`。DB/序列化/基础设施异常继续回滚。新增 V31 重建 `ck_inbound_mutations_mutation_type` 并只加入上述两值。

- [x] **Step 4: 运行 Server 定向测试确认通过**

运行：`.\Auralis-Server\mvnw.cmd -B -ntp "-Dtest=SyncServiceTests,CoreDomainControllerTests,SyncSchemaTests,OpenApiArtifactTests" test`（仓库根目录）。
预期：定向测试通过；迁移测试验证 V30→V31，不能把当前未提交 V30 覆盖或改写。

### Task 3: Sync push 结果原子结算与冲突恢复

**Files:**
- Modify: `Auralis-PC/src/api/useSyncApi.ts`
- Modify: `Auralis-PC/src/services/syncCycle.ts`
- Modify: `Auralis-PC/src/store/useSyncStore.ts`
- Modify: `Auralis-PC/scripts/r4-sync.test.mjs`
- Modify: `Auralis-PC/src/types/sync.ts`

**Interfaces:**
- push mutation 白名单包含 CRUD 与两种排期命令；pull change 的 mutation type 白名单继续限定 CRUD。
- `runSyncCycle` 识别 `TASK + SCHEDULE_INSERTION|SCHEDULE_SWAP` 响应，校验 `current` 是任务数组后调用 `repository.resolveScheduleMutation(...)`，不得把数组误当单 Task 写入 `settleMutation()`。
- `SyncCycleResult` 增加 `scheduleErrors: Array<{ clientMutationId: string; code: string }>`，仅包含本轮已结算的服务端 CONFLICT/REJECTED 命令；SyncStore 将其呈现为可读同步错误，成功后按当前规则清除。
- pending 排期命令在本地 payload 另存 `_localAffectedTaskIds`；`useSyncApi` 编码 push 时剔除该客户端字段，线上请求只包含公开排期 DTO。pull、reset snapshot 和普通本地 Task 写入均将这些 ID 视为被该命令围栏，避免旧服务器状态覆盖乐观批次或并发本地编辑拆开一次排期操作。

- [x] **Step 1: 写 Sync 回归测试**

在 `r4-sync.test.mjs` 增加成功响应携带 Task 数组时只调用一次批量结算、拒绝响应将乐观列表原子恢复并终结命令、HTTP 重放响应不重复结算、不合法 current 不写本地、push 接受新 mutation 但 pull 拒绝新类型、pending 命令覆盖任务成员的 pull/snapshot fence，以及后台冲突错误可见的用例。

- [x] **Step 2: 运行 Sync 测试确认失败**

运行：`node --experimental-strip-types --test scripts/r4-sync.test.mjs`（工作目录 `Auralis-PC`）。
预期：新增类型、结算方法或结果字段缺失断言失败。

- [x] **Step 3: 实现分离校验与批量处理**

拆分 `useSyncApi.ts` 的 push 与 pull mutation 集合；在 `syncCycle.ts` 为排期命令走专用原子结算，不改变普通资源 `settleMutation` 路径。将排期命令的 `payload._localAffectedTaskIds` 加入 pull/snapshot 保护集；在 LocalRepository 的普通 Task commit 边界拒绝修改属于未解决排期命令的成员。服务端拒绝时将 mutation 记为 `rejected` 终态，先合并服务端当前列表后再允许新排期；批量版本栅栏失败时请求新 snapshot/read 并保留更高版本或墓碑。

- [x] **Step 4: 运行 Sync 测试确认通过**

运行：`node --experimental-strip-types --test scripts/r4-sync.test.mjs`（工作目录 `Auralis-PC`）。
预期：新增与既有 Sync 测试通过。

### Task 4: Timeline 本地排期、离线反馈和重试

**Files:**
- Modify: `Auralis-PC/src/store/useTaskStore.ts`
- Modify: `Auralis-PC/src/views/Timeline/index.vue`
- Modify: `Auralis-PC/src/services/offlineWritePolicy.ts`（仅当现有网络错误判定无法覆盖 Sync push transport failure 时）
- Modify: `Auralis-PC/scripts/r4-task-store-schedule.test.mjs`

**Interfaces:**
- `insertTaskAtSlot` 的插入/顺延纯计算产出 `{models: TaskModel[], affectedTaskIds: string[]}`；严格卡片落点只移动源 Task，普通槽位保留现有顺延算法。
- `swapScheduledTasks` 本地计算原子互换/相邻紧凑结果并校验双方 deadline、窗口、完成状态。
- 二者经 `commitScheduleMutation(...)` 保存模型和唯一命令后调用 Sync `flushNow()`；识别 `isOfflineTransportFailure(error)` 时返回 `'queued'`，保留 pending 与投影；业务或协议错误仍抛出。
- Timeline 对 `'queued'` 展示“排期已保存在本机，等待连接后同步”；在线确认显示现有成功反馈，服务器冲突/拒绝展示真实错误并刷新 Repository 投影。

- [x] **Step 1: 写 Store 测试**

在 `r4-task-store-schedule.test.mjs` 追加断网普通槽插入并顺延、断网标题栏交换、本地存储后 flush transport failure 返回 queued 且只生成一条同 ID 命令、恢复连接重试复用 ID、API 非网络错误不伪装为 queued、当前 deadline/完成/窗口/日期规则无回归。测试插入与交换均断言受影响本地 rows 同步变为 pending。

- [x] **Step 2: 运行 Store 测试确认失败**

运行：`node --experimental-strip-types --test scripts/r4-task-store-schedule.test.mjs`（工作目录 `Auralis-PC`）。
预期：当前 Store 仍直连 schedule REST，新增离线用例失败。

- [x] **Step 3: 切换在线/离线共用的本地命令路径**

将当前预检逻辑提取为本地候选计算，不改变已有错误边界；插入和交换各产生一个 Sync mutation，并由 Task rows 与单 outbox mutation 原子保存。排期命令持久化之后才请求立即 Sync；只有明确 transport failure 返回 queued，其他错误抛出。保留 `withScheduleMutation` 串行队列和 `assertScheduleDaySynced`。在 Timeline 两种 drop handler 复用相同返回状态提示，并在后台拒绝时使用 SyncStore 的错误信号刷新视图。

- [x] **Step 4: 运行 Store 测试确认通过**

运行：`node --experimental-strip-types --test scripts/r4-task-store-schedule.test.mjs`（工作目录 `Auralis-PC`）。
预期：新增与当前已有排期/dueAt 用例通过。

### Task 5: 协议产物与现行文档

**Files:**
- Modify: `docs/contracts/API.md`
- Modify: `docs/contracts/Database.md`
- Modify: `docs/design/Frontend.md`
- Modify: `docs/modules/FrontendPC.md`
- Modify: `docs/modules/Backend.md`
- Modify: `docs/current/Status.md`
- Modify: `docs/current/IssuesAndReview.md`
- Modify: `docs/release/Changelog.md`
- Modify: `docs/README.md`
- Modify generated only after checking the complete existing diffs: `docs/contracts/openapi/auralis-openapi.json`, `Auralis-PC/src/api/generated/schema.ts`, `Auralis-Mobile/src/api/generated/schema.ts`

- [x] **Step 1: 更新 API/DB/模块文档**

准确说明 PC 在线和离线均经 Sync push；写明两个命令 payload、`current` Task 数组结果、幂等和冲突策略；说明 V31 只放宽 inbound CHECK、change_log 仍为 CRUD，以及本地一个命令关联多个乐观 Task 投影。在线 schedule REST 路由保留现状。Frontend/PC/Backend 中删除“PC 排期不创建 Sync mutation”的旧现行陈述，替换为新路径；无需重述或删除历史归档记录。

- [x] **Step 2: 生成并审阅 OpenAPI/SDK 差异**

运行：`.\scripts\export-openapi.ps1`，随后 `.\scripts\generate-openapi-sdk.ps1 -SkipExport` 与 `.\scripts\check-openapi.ps1`（仓库根目录）。在运行生成器前后检查三份已 dirty 产物的完整 diff；仅保留与新 Sync mutation enum 有关的增量，不能回退并行 AI 修改。若导出脚本会覆盖不相关差异，停止该脚本并用当前 artifact 的最小手工 schema 增量及 check 命令验证。

- [x] **Step 3: 更新状态与交接记录**

在 `Status.md` 与 `IssuesAndReview.md` 写明命令/退出码/关键覆盖及未完成真实断网、GUI、PostgreSQL 演练；将实现记录追加到 `Changelog.md`，在 `docs/README.md` 登记 spec 和本实施计划，不修改其中并行任务现有内容。

### Task 6: 端到端验证与只读审查

**Files:**
- Inspect all files above; do not edit existing unrelated changes.

- [x] **Step 1: 运行 PC 定向测试和静态门禁**

运行：`node --experimental-strip-types --test scripts/r4-task-store-schedule.test.mjs scripts/r4-local-repository.test.mjs scripts/r4-sync.test.mjs scripts/r4-pc-protocol.test.mjs`、`npm.cmd run type-check`、`npm.cmd run check:r4-pc`（工作目录 `Auralis-PC`）。
结果：定向套件 171/171、类型检查退出码 0；静态门禁退出码 1，命中未修改文件 `src-tauri/src/local_asset_store.rs` 中的 fixed local address 规则，未扩大范围修复。

- [x] **Step 2: 运行 Server 定向测试和契约检查**

运行：`.\Auralis-Server\mvnw.cmd -B -ntp "-Dtest=SyncServiceTests,CoreDomainControllerTests,SyncSchemaTests,OpenApiArtifactTests" test`、`.\scripts\check-openapi.ps1`（仓库根目录）。
结果：`-DforkCount=0 "-Dtest=SyncServiceTests,SyncSchemaTests,CoreDomainControllerTests" test` 退出码 0，33/33；生产源码 clean compile 退出码 0。`check-openapi.ps1` 退出码 1，JUnit discovery 解析 `OpenApiArtifactTests` 时抛出 `NoClassDefFoundError: JsonNode`，运行时 artifact 对比未完成。独立检查 artifact 和两端 SDK 的 push/response enum 为 6 项、change enum 为 CRUD 4 项。

- [x] **Step 3: 检查最终 diff 与工作树保护**

运行：`git diff --check`、`git status --short`、逐个目标文件审查 diff。确认没有覆盖开始时已有的 PC、AI、V30 migration、OpenAPI、Mobile 和现行文档修改，没有删除操作，且唯一新增 migration 是 V31。

- [x] **Step 4: 请求一个只读 reviewer 检查**

Reviewer 只检查 correctness、原子性、幂等重放、冲突/事务边界、需求和安全/数据风险，不改文件。首轮报告 BLOCKER=0、IMPORTANT=3：客户端 cohort 结果范围、服务端外层 source 元数据校验和未挂载页面通知；修复后三项均关闭。复审另发现多条拒绝被单项 Store 覆盖、snapshot pending fence 读取与替换的竞态，以及浏览器跨标签页 localStorage 读改写竞态；已分别增加逐 mutation 通知、SQL 事务/浏览器单次快照替换和同源 Web Locks 状态改写互斥。后续检查发现缺失 `targetBaseVersion` 可中止整批 Sync push、浏览器不支持 Web Locks 时仍会放任 localStorage 并发改写，及缺少 `targetTaskId` 时快照失败仍会把拒绝命令设为终态；对应加入目标字段校验、无锁拒绝写入和“快照完整后再终结、失败后同 ID 重试”恢复。新增回归已通过；PC 四套 173/173、类型检查 0、Server Sync/Schema/Controller 34/34。最终只读复审确认 BLOCKER=0、IMPORTANT=0，无需进一步代码修改。真实 Tauri GUI、断网恢复和跨设备 PostgreSQL 行为仍待验收。

---

## 计划自审

- 设计要求覆盖：插入/顺延、交换、离线持久化、稳定 mutation ID、服务端原子事务、幂等结果回放、冲突回滚、非传输错误区分、账户/设备隔离、DDL、API/DB/PC/Backend/状态/发布文档和人工验收边界；以上分别由 Task 1–6 覆盖。
- 类型接口一致：排期命令使用 Sync mutation enum，客户端成功/拒绝统一通过 `resolveScheduleMutation` 合并 Task 数组；普通 CRUD 的单资源 settlement 保持不变；push/pull 的 mutation 白名单分离。
- 已检查无 `TBD`、`TODO` 或未定义后续接口引用；因当前工作树有大量相关并行改动，计划明确要求先检查完整 diff 并保护已有内容。


## 2026-10-12 实施与验证记录

- LocalRepository、Sync cycle、Timeline Store/UI、Server Sync mutation 与 V31 migration 已实现；OpenAPI artifact 和 PC/Mobile 生成类型已按最小 enum 差异更新。在线 schedule REST 路由保留。
- OpenAPI 验证：独立 `OpenApiArtifactTests` 12/12；`scripts/check-openapi.ps1` 仍在 JUnit discovery 退出码 1，报 `NoClassDefFoundError: JsonNode`，完整运行时 artifact 对比未完成。
- PC：`node --experimental-strip-types --test scripts/r4-task-store-schedule.test.mjs scripts/r4-local-repository.test.mjs scripts/r4-sync.test.mjs scripts/r4-pc-protocol.test.mjs` 退出码 0，现为 173/173；新增缺少换位目标 ID 且快照失败可重试的回归，覆盖逐条拒绝通知、browser/SQLite snapshot race、共享 localStorage 跨 repository 交错与 Web Locks 缺失时失败关闭；`scripts/r4-local-repository.test.mjs` 单套 35/35；`npm.cmd run type-check` 退出码 0。`npm.cmd run check:r4-pc` 退出码 1，静态扫描命中未修改的 `src-tauri/src/local_asset_store.rs`。
- Server：`.\mvnw.cmd -B -ntp -DforkCount=0 "-Dtest=SyncServiceTests,SyncSchemaTests,CoreDomainControllerTests" clean test` 在修正测试账号前缀后通过，34/34；包含缺失 `targetBaseVersion` 的拒绝、当前数组与幂等回放回归。`scripts/check-openapi.ps1` 退出码 1，JUnit discovery 解析 `OpenApiArtifactTests` 抛出 `NoClassDefFoundError: JsonNode`，运行时 OpenAPI 对比未完成。
- OpenAPI 静态结构检查退出码 0：MutationRequest/MutationResponse 包含两种排期 mutation，ChangeResponse 仍仅含 CRUD；PC/Mobile SDK 两个 push 类型同步。复审发现的外层 source identity/baseVersion、额外 Server Task cohort、通知多项丢失、snapshot TOCTOU 与 browser 跨标签页状态改写竞态均已分别加入回归并修复；最终分级等待复审返回。
- `git diff --check` 对 Timeline 文件外的本需求代码、契约和记录文件退出码 0；Timeline 文件的既有 CSS 注释尾随空白仍被全局检查报告，未顺手清理。未覆盖用户或并行任务改动。真实 Tauri/断网重启恢复、PostgreSQL、跨设备及部署验收仍待完成。
