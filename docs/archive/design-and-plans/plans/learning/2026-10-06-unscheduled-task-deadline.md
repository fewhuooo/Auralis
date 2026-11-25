# PC 未排期任务截止后自动完成

日期：2026-10-06

状态：代码、最终自动验证与同一只读 reviewer 复查通过；真实 GUI/Tauri 与服务同步待验收。

## 目标和范围

用户确认：没有排期的待办或进行中任务，截止时间到达后自动标记已完成。保留原 `dueAt`，沿用现有 Task 本地优先写入与同步流程。

完整脏树基线：`8a1cf2f99d54e1aa4d69d02686f620f7aa86ea9b`。隔离委派以前述快照为起点；主工作树的既有修改保留。

## 当前实现证据

- Luna 只读排查确认 `useTaskStore.recoverOverdueTasks` 仅以 `isScheduledTaskPast` 筛选，未排期任务不会进入完成写回；现有 `isUnscheduledTaskPastDue` 仅参与逾期展示。
- 现有 Store 专项断言超期未排期任务仍保留为提醒。用户本轮明确确认自动完成，构成修改既有已验证行为的需求依据；保留原截止时间的行为继续保留。
- 初始 PC 三脚本专项 55/55 通过，证明原逻辑状态，不能证明本轮要求。Server 没有 Task 到期定时器，收到 DONE 更新时沿用服务端完成时间。
- Antigravity 隔离任务：`fd83b3c7c9ef`，Gemini 3.1 Pro High；授权范围为 Task Store、既有规则辅助及三脚本专项，文档由主 Agent 回写。

## 规则

1. 活动任务没有 `scheduledAt`、具有有效 `dueAt`，且 `dueAt <= now` 时自动进入 `DONE`。
2. `DONE`、`CANCELLED`、已删除、截止时间为空或无效的任务不产生自动完成写入。
3. 已排期任务继续依据 `scheduledAt + durationMinutes` 的结束时刻完成；其截止时间不提前结束排期。
4. 自动完成保留原截止时间、排期及其他任务属性。服务器沿用现有 `completedAt` 规则。
5. 自动检查复用启动/本地加载、TASK 投影刷新与运行中分钟级检查。应用关闭时不执行客户端检查，重新启动后补处理。
6. 提交前按现有变更队列重读持久 TASK 行并复核资格，避免覆盖最新改期、截止时间修改、取消或删除。单项失败保留原数据，后续检查可重试，其他任务继续处理。

## 执行安排

- [x] Luna 执行代理只读定位当前规则、触发时机、后端边界及相关测试，返回命令、退出码和日志。
- [x] Antigravity Gemini 3.1 Pro High 先给出计划，再实现授权的 PC Store/既有规则辅助函数及相关脚本回归；禁止改 UI、依赖、后端和契约。
- [x] 检查委派完整 diff；先应用专项测试记录 RED，再应用必要实现得到 GREEN，或核对委派实际 RED/GREEN 证据。
- [x] 同一执行代理验证任务规则、Store 持久化/同步队列、截止边界、状态排除、提交前最新状态及失败重试；运行 PC 类型检查、现有静态检查、全量 PC 脚本回归和构建。
- [x] 单个只读 reviewer 审查需求、回归、竞态与数据完整性，不修改文件、不启动其他 reviewer。
- [x] 回写 PC 模块、交互规则、产品验收条件、API/Database 的字段语义、状态、问题和 Changelog；不新增接口或迁移。

## 验收与证据

自动验证以实际命令、退出码、测试计数和日志记录。GUI/Tauri、真实服务与双设备同步单独列为人工验收边界，不以编译或脚本通过替代。尚未实施的步骤不登记为已完成。

### 后端现有规则检查

执行目录：`Auralis-Server`。Maven Wrapper 参数：`-B -ntp clean "-Dtest=CoreDomainServiceTests#taskScheduleInsertionAllowsDeadlineToPassAndPreservesDueAt+taskUpdateAndSwapAllowSchedulesAfterDueAt" test`。

执行代理退出码 0，2/2，Failures/Errors/Skipped 均 0；主 Agent 已读取日志核对 `BUILD SUCCESS`。日志：`C:\Users\Gnasche\AppData\Local\Temp\auralis-task-deadline-clean-focused-20261006.log`。

首次未 clean 的同两项测试因测试类扫描缺少 `JwtEncoder` 而未进入断言；缓存依赖含该类，clean 后重新编译 305 个 main 和 86 个 test 源文件即通过，归因为旧/不一致构建产物。未修改后端源码、配置或依赖。这两项证明 Server 仍允许排期晚于截止时间并保留 `dueAt`，不证明 PC 自动完成或真实服务同步已验收。

### 前端委派检查

Antigravity 完整产物为 4 个授权文件，10 行新增、7 行删除，没有依赖、生成文件、删除操作或跨模块写入。规则辅助将截止判断改为 `<= now`；Store 候选和持久化前复判复用 `isOverdueTask`，并新增持久行与内存的截止时间一致性检查，保留既有写队列及版本围栏。

委派测试仍主要检查源码文本，只有额外规则边界断言，缺少任务实际持久化和竞态回归。该明确缺口由原 Luna 执行代理补充真实 Store/Repository 测试；主树先只应用测试，实际 RED/GREEN 与最终门禁以执行代理日志为准，不以委派自报退出码替代。

主 Agent 应用源码前发现委派调用 `isOverdueTask` 但漏改 import，会出现未定义引用；以当前源码和完整 patch 为证据，仅将不再使用的 `isScheduledTaskPast` 导入替换为 `isOverdueTask`，随后实际运行验证。已检查 node_modules junction 不存在，Antigravity 隔离工作树和分支已安全清理。

### 实际 PC 专项 RED / GREEN

执行目录：`Auralis-PC`。命令：`node --experimental-strip-types --test scripts/r4-task-store-schedule.test.mjs scripts/r4-task-view-rules.test.mjs scripts/r4-dashboard-timeline.test.mjs`。

- RED：源码保持本轮基线，59 项中 53 pass / 6 fail，退出 1；实际 Store/Repository 用例进入持久读取和 outbox 断言，读回 TODO/IN_PROGRESS 而非 DONE，未排期候选无提交前重读，不是初始化或 import 失败。日志：`C:\Users\Gnasche\AppData\Local\Temp\auralis-deadline-store-red-20261006.log`。
- GREEN：应用必要源码后退出 0，59/59，fail/cancelled/skipped/todo 均 0。日志：`C:\Users\Gnasche\AppData\Local\Temp\auralis-deadline-store-green-20261006.log`；主 Agent 已读取日志核对。
- 新增 4 项实际 Pinia + LocalRepository 回归，覆盖 TODO/IN_PROGRESS 持久 DONE、截止及业务字段保留、canonical UPDATE/outbox 和后台同步请求；空/未来/非法截止、DONE/CANCELLED、未结束排期不写入；持久重读后的延期/改期/取消/删除保护；单项提交失败隔离、下次检查重试及已完成不重复提交。准确截止边界由现有规则专项验证，分钟/投影入口沿用既有源码约束验证，未实际等待真实定时器一分钟。

### 首轮 PC 门禁（墓碑补修前）

日期：2026-10-06。执行目录：`D:\CodeBase\Active\Auralis\Auralis-PC`。下列命令由同一执行代理运行并报告退出码，主 Agent 读取完整日志的结果部分核对，没有重复执行普通门禁。日志根目录为 `C:\Users\Gnasche\AppData\Local\Temp`。

| 命令 | 退出码 / 结果 | 日志 |
| --- | --- | --- |
| 三脚本专项（上节完整命令） | 0，59/59，fail/cancelled/skipped/todo 均 0 | `auralis-deadline-store-green-20261006.log` |
| `npm.cmd run type-check` | 0，vue-tsc 无诊断 | `auralis-deadline-pc-type-check-20261006.log` |
| `npm.cmd run check:subject-icons` | 0，contract passed | `auralis-deadline-pc-subject-icons-20261006.log` |
| `npm.cmd run check:subject-workspace` | 0，contract passed | `auralis-deadline-pc-subject-workspace-20261006.log` |
| `npm.cmd run test:r4-pc` | 0，482/482，fail/cancelled/skipped/todo 均 0 | `auralis-deadline-pc-test-r4-pc-20261006.log` |
| `npm.cmd run build` | 0，8.10s，47/47 renderer assets | `auralis-deadline-pc-build-20261006.log` |

专项已包含在 PC 全量中，计数不能叠加。构建仍有既有 chunk 体积、dynamic import 和 file-viewer 插件耗时提示，本轮不修改相关配置或依赖。真实 GUI/Tauri、运行服务、双设备同步及真实分钟定时器单独验收。

### 审查后的必要补修（IMPORTANT）

唯一 reviewer 发现 `tombstoneSubjectChildren` 只更新 TASK 行的 deletedAt，不增加版本、不改 payload。恢复扫描可能在投影刷新前读到同版本墓碑，旧 payload 仍为活动 Task；现有 version/schedule/due 围栏不能拒绝，自动 DONE 写回的 deletedAt:null 会清除墓碑。主 Agent 已读取 cascade 和 SQL/browser 提交流程确认，这是明确数据完整性问题，构成修改既有 frozen 仓储路径的依据。

最小修复范围扩展至既有 `src/services/localRepository.ts`：可选的 `requireActiveResource` 条件仅由自动完成设置，在 SQL 事务内部与 browser 无 await 的同步提交段同时校验当前行存在且未删除；失败沿用 LocalConflictError 和 Store 重载。Store 预读也拒绝 row.deletedAt。不改变其他调用、数据库 schema、公开 API 或同步 payload。

原执行代理先添加同版本真实 Subject cascade 的预读/读后提交两种时机回归记录 RED；Antigravity 生成最小仓储条件与 Store 参数传递，并在现有仓储测试中验证 SQL/browser 分支。之后同一执行代理运行实际 GREEN 和必要的最终门禁，同一 reviewer 复查，不新增 reviewer。

补修隔离快照：`90647970c277092e636cef99f8afb727e1f6df4a`；Antigravity 任务：`0181980b1020`，Gemini 3.1 Pro High，授权仅 LocalRepository、Task Store 与既有 LocalRepository 测试。主树由原执行代理补 Task Store 竞态测试，不互相覆盖。

实际竞态 RED 命令与前述三脚本专项相同，退出 1，64 项中 59 pass / 5 fail（4 个场景子项及其父级汇总）。真实 `tombstoneSubjectChildren` 的 during-read/before-commit × scheduled/unscheduled 四项均复现墓碑消失、status:DONE、pending UPDATE 和 hydrate 后重新可见，未发生 harness/import 失败。日志：`C:\Users\Gnasche\AppData\Local\Temp\auralis-deadline-cascade-race-red-20261006.log`；主 Agent 已核对差分与关键输出。

既有 `r4-local-repository.test.mjs` 以 node:sqlite 的 TemporarySqlite 和真实 LocalRepository/Schema 验证 SQL 路径，并覆盖 browser 后端；补修在此验证原子活动行条件，不以模拟 SQL 文本断言替代事务检查。

第二次 Antigravity 完整 diff 为 3 个授权文件，63 行新增、6 行删除，无依赖、生成文件、删除操作或跨模块写入。主 Agent 检查完整原子提交路径，只去掉新增测试的一行行尾空格；先应用仓储测试在主树记录 RED，再应用必要源码。验证 junction 不存在，隔离工作树和分支已安全清理。

四脚本命令：`node --experimental-strip-types --test scripts/r4-local-repository.test.mjs scripts/r4-task-store-schedule.test.mjs scripts/r4-task-view-rules.test.mjs scripts/r4-dashboard-timeline.test.mjs`。

- RED：退出 1，86 项中 80 pass / 6 fail；仓储条件提交报 Missing expected rejection (LocalConflictError)，四种 Store 交错及父级仍复活。日志：`C:\Users\Gnasche\AppData\Local\Temp\auralis-deadline-active-guard-red-20261006.log`。
- GREEN：退出 0，86/86；真实 browser/SQLite 仓储条件和四种 Store 交错均通过。日志：`C:\Users\Gnasche\AppData\Local\Temp\auralis-deadline-active-guard-final-green-20261006.log`。

新仓储测试同时验证活动行可提交、未设置可选条件时保持既有调用行为。补修沿用原事务和队列，不增加锁层或修改部署；主 Agent 对相关六个代码文件 diff-check 退出 0。

### 补修后最终门禁（作为本轮最终自动验证）

日期：2026-10-06。执行目录仍为 `Auralis-PC`。同一执行代理执行，主 Agent 读取日志结果核对；以下结果覆盖前述首轮 482 和委派工作树验证计数。

| 命令 | 退出码 / 结果 | Temp 日志 |
| --- | --- | --- |
| 四脚本专项（上节完整命令） | 0，86/86，fail/cancelled/skipped/todo 均 0 | `auralis-deadline-active-guard-final-green-20261006.log` |
| `npm.cmd run type-check` | 0，vue-tsc 无诊断 | `auralis-deadline-active-guard-final-type-check-20261006.log` |
| `npm.cmd run check:subject-icons` | 0，contract passed | `auralis-deadline-active-guard-final-subject-icons-20261006.log` |
| `npm.cmd run check:subject-workspace` | 0，contract passed | `auralis-deadline-active-guard-final-subject-workspace-20261006.log` |
| `npm.cmd run test:r4-pc` | 0，488/488，fail/cancelled/skipped/todo 均 0 | `auralis-deadline-active-guard-final-test-r4-pc-20261006.log` |
| `npm.cmd run build` | 0，6.32s，47/47 renderer assets | `auralis-deadline-active-guard-final-build-20261006.log` |

86 项包含在 488 项中，不相加。构建提示与首轮相同，未作为业务阻断或进行无关配置调整。Server 代码未变且现有规则 2/2 已验证，补修不重复后端命令。

### 最终审查与交接

同一只读 reviewer 最终 BLOCKER=0、IMPORTANT=0、OPTIONAL=0，确认原同版本墓碑和 read→commit 窗口已由原子条件关闭；不重复自动测试，未启动第二个 reviewer。

主 Agent 使用临时 Git index 比较完整脏树基线，差分仅 16 个本轮文件（3 个 PC 源码、3 个专项、10 个现行文档），无依赖、生成文件、删除或跨模块代码写入；差分检查退出 0。完整证据保存到 `C:\Users\Gnasche\AppData\Local\Temp\auralis-deadline-final-full.diff`，保留原工作树与索引，不提交当前工作树。

代码逻辑与自动验证已满足本轮需求，真实 GUI/Tauri、分钟定时器观察、运行服务和双设备同步仍为独立人工验收边界；未部署、未操作用户运行数据库或生产迁移。
