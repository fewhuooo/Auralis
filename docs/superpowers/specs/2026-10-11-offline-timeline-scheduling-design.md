# PC 时间轴断网排期设计

日期：2026-10-11

状态：用户已批准设计，待规格审阅

## 目标

后端暂时不可达时，PC Timeline 仍可放置任务、顺延当天任务和交换已排期任务。操作先可靠保存在本机，连接恢复后按服务端现有校验和事务语义同步；不得把一个多任务排期操作拆成若干可能部分成功的 Task 更新。

## 当前行为与问题

- 按槽插入、顺延和标题交换直接请求 `/api/tasks/schedule-insertions` 或 `/api/tasks/schedule-swaps`。传输失败时 Timeline 将异常作为网络错误显示，本地没有排期变更。
- 服务端 `TaskService.insertSchedule` 与 `swapSchedules` 在单个事务内校验并变更多个 Task。Sync outbox 当前只表达单资源 `CREATE/UPDATE/DELETE/RESTORE`，服务端逐条处理；将排期拆为普通更新会失去原子性，并可能触发区间冲突或留下部分操作。
- `inbound_mutations` 已按用户、设备和 `clientMutationId` 记录请求哈希及结果，可以作为排期命令幂等回放的基础；当前 mutation type 数据库约束只允许普通 CRUD 类型。

## 方案与取舍

1. 保持排期在线操作，仅改进断网提示。改动小，但不满足离线放置要求。
2. 把每个被移动任务写成普通 Task 更新并交由 Sync 推送。它复用现有 outbox，但服务器逐条提交，换位可能短暂或永久冲突，顺延也可能只完成一部分。
3. 将插入/顺延和交换建模为单条 Sync 排期命令（选定）。命令沿用稳定 mutation ID、版本栅栏与服务端现有排期事务；本地在一个事务里保存命令和受影响任务的乐观投影。这样断网期间能继续使用现有 Timeline 操作，且服务端恢复时可以安全重放。

## 设计

### 命令模型

Sync 新增 `SCHEDULE_INSERTION` 与 `SCHEDULE_SWAP` 两种 Task 命令。插入 payload 包含源 Task 版本、目标时刻、当天窗口和可选卡片目标；交换 payload 包含源/目标 Task ID 与双方版本。PC 的在线和离线排期统一通过 `/api/sync/push` 提交，不再先向普通排期 REST 路由发送一个没有幂等键的请求。

命令 `clientMutationId` 在本地首次提交时生成并持久化。网络超时或连接中断后，Sync 使用完全相同的 ID、mutation type 和 payload 重试。服务端 `inbound_mutations` 对相同 ID/哈希返回已记录的完整结果；相同 ID 携带不同哈希仍拒绝。执行排期和保存幂等结果处于同一服务端事务。

数据库只放宽 `inbound_mutations.mutation_type` 检查约束以包含这两种命令；`change_log` 仍只写普通 Task `UPDATE`。排期造成的所有 Task 更新继续由既有 ChangeLog/Sync read 收敛。

### 本地保存和投影

PC 在现有 `LocalRepository` 的 SQL 与浏览器存储实现中增加批量排期提交：校验受影响的本地版本及当天 unresolved mutations，在一个本地事务中写入全部乐观 Task 投影及一条排期命令 outbox mutation。成功操作不生成逐 Task 普通 `UPDATE` mutation。受影响任务保持 pending 状态，直到服务端回放结果被原子合并。

插入命令复用现有半小时网格、截止、固定已完成任务、窗口和顺延规则计算本地预期投影。交换命令复用现有非紧邻互换和相邻紧凑规则。服务端仍为权威执行者；发生版本冲突时不自动改写原命令版本或静默重试不同用户意图。

### 同步、结果与错误

- 本地命令先持久化，再由普通 Sync push 回放；设备重启和响应丢失后仍使用同一命令记录。
- 传输层失败保留 pending 命令和乐观投影，Timeline 给出本机已保存、等待同步的反馈。非传输业务错误继续呈现明确错误，不伪装成离线成功。
- `APPLIED` 响应携带服务端实际变更的 Task 列表，PC 先结算命令，再通过 Repository 原子合并这批 Task；之后既有 pull 流程继续收敛其他变更。
- `CONFLICT`/`REJECTED` 响应携带源/目标当天的当前服务端 Task 投影。PC 记录终态错误、以 Repository 原子替换乐观投影并刷新 Timeline，避免旧命令在每次 Sync 中重放。用户从刷新后的排期重新操作。
- 未认证/用户或设备范围变化继续由现有 Sync scope ticket 拦截；不能将旧会话命令发到另一账号或设备。

### 保持的业务约束

排期仍执行当前本地预检与服务端版本校验、8:00–22:30 起始槽窗口、时长区间不重叠、截止限制、禁止修改已完成任务，以及当天其他本地 pending/conflict/error 变更的围栏。在线成功路径也改为同一 Sync 命令，消除“首次请求成功但响应丢失、随后以另一命令重复执行”的歧义。

本需求不迁移或重写已有 Task 的 `dueAt`；不改 `scheduledAt`/`dueAt` 精确 instant 格式；不扩大到 Mobile / Tablet。

## 验证范围

- PC Store：断网插入并顺延、断网换位、本地投影与单 outbox 命令的原子性、重启恢复、连接恢复回放、同命令重试不重复移动任务、服务端冲突后回滚本地乐观结果、非传输错误仍失败、已有截止约束与日期解析行为。
- Sync/Repository：浏览器存储与 SQL repository 的批量提交/结算、mutation 顺序、重复响应、账号/设备切换隔离。
- Server：两个新 Sync 命令路由到现有事务操作；同一 mutation ID/哈希返回相同完整结果；ID 哈希不匹配拒绝；插入/交换验证失败时不留下部分变更；ChangeLog 仅记录 Task UPDATE。
- 契约：数据库迁移、运行时 OpenAPI、PC SDK schema 与 `docs/contracts/API.md`、`docs/contracts/Database.md` 一致。

## 验收

后端不可达时，在 Timeline 执行插入/顺延和换位均立即落本地并有 pending-sync 状态；恢复连接后每条命令只产生一次服务端原子结果。并发版本冲突时显示刷新后的真实排期，不保留错误的乐观状态。相关测试及类型/静态检查通过；GUI、真实断网和跨设备 PostgreSQL 行为作为单独人工验收记录，不由命令验证替代。
