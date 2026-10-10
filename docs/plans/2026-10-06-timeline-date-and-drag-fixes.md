# PC 时间轴日期与拖放修复实施计划

> **For agentic workers:** 使用 subagent-driven-development 在当前会话执行。遵循根 AGENTS.md 的单个 reviewer、最小修改与 Antigravity 前端委派规则；各步骤用复选框记录实际进度。

**Goal:** 关闭用户已批准的四项问题：排队错日、同日改期误拒、周视图跨天改期失败、重挂载日期错位。

**Architecture:** 沿用 Task Store 的串行写队列、现有排期/API/Repository 路径。按槽操作入队前解析并保存具体本地日期，执行时按该日期重读任务并校验；按天操作处理未排期和已有排期任务；Timeline 从共享选中状态恢复显示日期。

**Tech Stack:** Vue 3、Pinia、TypeScript、Node test runner、现行 PC LocalRepository。

## 授权、范围与设计决策

用户已在修复清单后明确授权“处理1到4”，对应以下已展示的修复方向，无待定产品问题：

1. 排期等待期间切换日期不会改变已经发起的落点。入队前把星期/日期解析为本地 YYYY-MM-DD，不能用 UTC 字符串截断生成本地日期；请求 scheduledAt 和窗口必须对应原落点。
2. 已有有效排期任务在同一具体日期改时间可以成功。来源校验比较具体日期，不同周的同星期不得冒充同日；错误不来自创建字段，新建弹窗仍创建未排期任务。
3. 周视图已有排期任务可拖到另一天，沿用按天入口从 08:00 起寻找第一个同时满足过去时间、完整时长冲突和截止约束的槽位。只移动被拖任务；找不到合法位置时仓储/outbox/投影保持不变。完成与取消任务拒绝拖放。
4. 离开再返回 Timeline 时，标题、日期栏选中态与任务槽位恢复同一个具体日期，包括下周。星期值调用保持现有兼容入口，无新路由或持久字段。

曾考虑在等待时禁用日期栏，但它不能单独修复 Store 调用的漂移；本次采用保存操作落点。曾考虑把共享状态整体改造成新日期模型，但会扩大 Dashboard/其他页面边界；本次保留现有 selectedDay 接口并在必要入口解析具体日期。

## Global Constraints

- 允许 Antigravity 修改且仅修改：`Auralis-PC/src/store/useTaskStore.ts`、`Auralis-PC/src/views/Timeline/index.vue`、`Auralis-PC/scripts/r4-task-store-schedule.test.mjs`、`Auralis-PC/scripts/r4-dashboard-timeline.test.mjs`。
- 用户已有所有未提交修改必须保留。尤其当前 Timeline 的 `selectDay` 已包含 `await taskStore.loadLocalTasks()`，本轮不回退这段用户新增行为。
- 冻结的完整排期截止校验必须保留：结束不得晚于 dueAt、恰好结束允许、无截止不限制、null 时长按 30 分钟。
- 保留 body 严格落点、普通插入顺延、原子换位、过去时间禁止、完成固定、自动 DONE、活动行/墓碑围栏、Repository/outbox 与同步契约。
- 仅关闭四项 IMPORTANT；当前时间标记/午夜跟随与跨周 swap 的 OPTIONAL 不在本轮修改范围。
- 不改 Server/Mobile、API/数据库字段、依赖、配置、生成文件、删除文件、样式或其他页面。无需生产操作或提交用户主树。
- 具体日期校验必须以操作入队前的目标日期为准，不能读取等待期间变化的当前视图日期或另一日的 slot.task 决定原落点是否可用。
- 文档由主 Agent 更新：本计划、README、FrontendPC、Frontend 设计、Status、IssuesAndReview、Changelog。
- 自动测试、类型检查和构建分别记录；GUI/Tauri、真实服务与双设备同步为独立验收边界。

## Task 1：修复四项问题并建立真实回归

**Files:** 两份授权源码与两份既有专项脚本；不新增测试 runner 或运行时公共层。

**Interfaces:** 保持 `scheduleTask(taskId, slotTime, targetTaskId?)`、`rescheduleTask(taskId, slotTime, targetTaskId?)`、`scheduleTaskToDay(taskId, day)` 与 `setSelectedDay(day, dateKey?)` 的现有外部调用兼容。

### Step 1：确认当前实现与基线

- [x] 读取 AGENTS/BeforeCoding/Status/Issues/PC/Frontend/API/Database，保护当前脏树。
- [x] 执行代理运行当前基线：三脚本 80/80，退出 0，日志 `C:\Users\Gnasche\AppData\Local\Temp\auralis-date-fixes-baseline-20261006.log`。
- [x] 完整 Git 快照命令被自动审批以 `blocked by policy` 拒绝，未执行。改用只读文件快照：1035 个文件和 2 个已删除路径，实际 index、HEAD 和分支不变；清单位于 `C:\Users\Gnasche\AppData\Local\Temp\auralis-date-fixes-baseline-manifest-20261006.json`。
- [x] Antigravity 在其隔离工作树镜像文件清单，保留原有删除状态；最终差分与文件快照比较，不把用户已有脏树当成本轮修改。实际委派 `bf7e52c35c46`，Gemini 3.1 Pro High，工作树 `C:\Users\Gnasche\.agy-mcp\delegations\wt-01446abe`；文件快照 `C:\Users\Gnasche\AppData\Local\Temp\auralis-date-fixes-baseline-7b35fa51554d4be096117927d81a6591`。

### Step 2：先给计划、再建立 RED

- [x] 向 Antigravity Gemini 3.1 Pro High 提供当前脏树和现行文档，限定四文件实施；最后完成态补修实际先返回 plan-only 计划，再限定一份源码实施。首轮挂起及测试补齐过程见下方阶段记录。
- [x] 复用已有实际 Pinia/LocalRepository harness 写回归，在主树先应用测试证明新断言失败，再应用源码。网络 API 使用测试桩，仓储/队列/投影使用实际实现。隔离首轮挂起不计有效 RED。

必须覆盖的可执行断言：

```js
// 1：另一任务 commit 被可控 Promise 阻塞，A 日发起排期后切 B 日。
const pendingSchedule = fixture.taskStore.scheduleTask(task.id, '09:00')
fixture.taskStore.setSelectedDay('Wed', '2099-10-07')
releaseCommit()
await pendingSchedule
assert.equal(localDateKey(new Date(requests[0].scheduledAt)), '2099-10-06')
assert.equal(localDateKey(new Date(requests[0].windowStartAt)), '2099-10-06')
assert.equal((await fixture.repository.read('TASK', task.id)).value.scheduledAt, requests[0].scheduledAt)

// 2：有效同日排期，选中的值为完整日期，真实改到 09:30。
fixture.taskStore.setSelectedDay('Tue', '2099-10-06')
await fixture.taskStore.rescheduleTask(task.id, '09:30')
assert.equal(requests.length, 1)
assert.equal(localDateKey(new Date(requests[0].scheduledAt)), '2099-10-06')

// 3：已有排期移动到完整目标日，仍调用实际 Store/Repository。
await fixture.taskStore.scheduleTaskToDay(task.id, '2099-10-07')
assert.equal(localDateKey(new Date((await fixture.repository.read('TASK', task.id)).value.scheduledAt)), '2099-10-07')
```

以上片段的 fixture、API finally 恢复和 A 日设置沿用既有 harness 完整补齐。初始计划还列出排队 reschedule、B 日已完成槽不影响 A 日落点、不同周同星期误来源拒绝，以及按天冲突/截止/终态/未排期对照；最终逐项记录实际覆盖，不能把尚未单独运行的案例写为通过。

重挂载测试必须执行当前组件的实际日期计算或编译提取其计算体，不能复制一份“正确算法”后只测复制品。目标是完整 dateKey 恢复、标题/选中态/实际 Store 槽位一致，并保留用户 selectDay 的本地加载调用；实际新增执行覆盖下周恢复，当周和星期旧调用入口没有新增独立重挂载案例。

### Step 3：最小实现

- [x] 在按槽方法外、进入 `withScheduleMutation` 之前保存目标日期。可沿用现有 `localDateKey` 和 `dateForDay`，例如：

```ts
const targetDateKey = localDateKey(dateForDay(selectedDay.value, '00:00').toISOString())!
return withScheduleMutation(async () => {
  // 重新读取当前任务；校验原目标日的数据，再沿用既有提交路径。
  return await insertTaskAtSlot(taskId, slotTime, targetDateKey, targetTaskId)
})
```

- [x] `rescheduleTask` 比较 `localDateKey(task.scheduledAt)` 与捕获的目标日期，保留取消/完成固定/过去时间/同步围栏。
- [x] `scheduleTaskToDay` 在本方法范围内接受未排期与合法已有排期任务，不扩大 `isSchedulableTask` 的全局待办语义。候选位置沿用原 08:00 起半小时搜索、完整冲突/截止条件与 `updateTaskModel` 提交；周视图传入实际 `day.dateKey`。reviewer 发现的未排期 DONE 已补守卫和实际无写入回归。
- [x] Timeline 从 Store 的 dateKey 派生或初始化组件日期状态，修复重挂载回退；不修改其它页面或今天标记逻辑。

### Step 4：主树验证与验收

- [x] 主 Agent 读取完整隔离差分，检查四文件边界、生成、依赖、删除和跨模块写入；先应用测试补丁并由原执行代理验证主树 RED。应用与验证实际由 Luna 管理代理执行，主 Agent 在 GREEN 后读取完整四文件差分。
- [x] 源码补丁通过 `git apply --check` 后应用，原执行代理执行 GREEN 与门禁；失败由同一代理归因，必要补修仍按前端委派规则。最终完整补丁逆向检查及四文件 diff-check 均退出 0。
- [x] 只启动一个只读 reviewer，以完整任务差分、计划和实际验证日志检查四项需求、行为回归及并发/数据风险，不重复已完成门禁。初审的 DONE 回归补修后由同一 reviewer 复核，最终 BLOCKER=0、IMPORTANT=0。
- [x] 主 Agent 回写权威文档、记录冻结范围与剩余 OPTIONAL，检查本轮差分保留用户基线。

## 验证命令

执行目录：`D:\CodeBase\Active\Auralis\Auralis-PC`。

```powershell
node --experimental-strip-types --test scripts/r4-task-store-schedule.test.mjs scripts/r4-task-view-rules.test.mjs scripts/r4-dashboard-timeline.test.mjs
npm run type-check
npm run check:subject-icons
npm run check:subject-workspace
npm run test:r4-pc
npm run build
```

日志保存 TEMP，记录日期、工作目录、实际命令、退出码、数量和关键输出。专项已被全 PC 回归包含，数量不叠加。若既有静态断言与必要源码改动冲突，只更新被证明不再正确的断言，不跳过/删除业务测试。

## 当前进度与证据

授权：用户“处理1到4”，随后要求 Luna 管理 Antigravity。四项已代码修复，完成态守卫回归经同一 reviewer 复核关闭；最终专项 90/90、PC 527/527、类型/静态/构建退出 0。主 Agent 已核对完整四文件差分和最终日志，唯一 reviewer 最终记录及文档收尾见下方。GUI/Tauri/真实服务/双设备未验收。

用户随后指定“用luna子代理去管理antigravity”。本轮 Antigravity 进度、差分、必要补修、主树 RED/GREEN 与门禁由既有 Luna 执行代理负责；主 Agent 处理范围/高风险裁决、最终审核、唯一只读 reviewer 与文档回写，不重复普通检查。执行报告：`C:\Users\Gnasche\AppData\Local\Temp\auralis-date-fixes-execution-report-20261006.md`；最终任务差分：`C:\Users\Gnasche\AppData\Local\Temp\auralis-date-fixes-review-20261006.diff`。

2026-10-07 阶段记录：Luna 发现隔离首轮新增测试 gate 进入与释放缺少明确同步，执行挂起，以及重挂载回归仅检查初始化文本的覆盖缺口。原委派 `bf7e52c35c46` 已 SIGINT 停止并 collect 保留工作树（未应用主树），挂起不计业务 RED，也不将其作为已证明的业务队列死锁。Luna 在确认旧执行停止后启动同一树补修 `20a7e77e7898`，Gemini 3.1 Pro High；补修要求等待 gate-enter 后释放，以及执行真实组件计算体并与 Store 交叉核对。日志名称保留任务开始日，命令记录实际执行日。

补修 `20a7e77e7898` 退出 0，但 Luna 检查发现测试仍有 gate 同步/独立案例/Store 联结缺口，以及隔离树的计划改写和两个 scratch 脚本。主 Agent 基于明确 correctness 和覆盖证据授权 Luna 仅直接补两份既有测试，源码仍来自 Antigravity，停止继续启动第三个补修任务。隔离计划已精确恢复快照，两个 AGY scratch 已精确删除；首次合并 PowerShell 恢复/删除命令被策略拒绝，最终恢复与精确文件补丁成功，主树未受影响。主树实际 RED/GREEN 和门禁仍待执行。

2026-10-07 主树验证进度：执行代理已完成测试补丁先行的实际 RED（85 项，80 通过、5 失败，退出 1，无超时），失败分别对应排队错日、同日改期、已排期跨天、重挂载日期和周列 dateKey。AGY 源码补丁随后应用；两份既有测试中 5 个直接受实现变化影响的静态断言同步调整后，focused GREEN 为 85/85、退出 0、无跳过或取消。主 Agent 已读取 `auralis-date-fixes-green-focused-20261007-v2.meta.txt`、stdout 和 stderr，确认实际执行时间 2026-10-07 00:32:41 +08:00、目录为主树 PC、60 秒限制且未超时。最终 PC 门禁、完整差分和唯一 reviewer 仍在进行，四项暂不登记关闭。

2026-10-07 唯一 reviewer 阶段：主 Agent 已核对最终四文件差分（216 新增、22 删除）与实际 RED/GREEN、五项门禁日志；PC 522/522、类型/静态/构建退出 0。Luna 只读 reviewer 实际 Pinia/LocalRepository TEMP 复现确认 `scheduleTaskToDay` 放宽入口后允许未排期 DONE 新增排期与 outbox，这是本次真实 IMPORTANT 回归。原 Luna 管理代理已获授权先建立无写入 RED，再管理 Antigravity 最小完成态守卫补修，保留同一 reviewer 复核。

覆盖裁决：reviewer 对排队 reschedule、B 日 DONE 槽、不同周同星期误来源、已有排期跨日的冲突/截止组合和旁观者不变缺少独立新增动态案例，依据共同实现路径与已有专项证据列为 OPTIONAL 覆盖限制。遵循仓库 OPTIONAL 当前任务不修改的规则，不扩展额外测试；仅补本次已证实完成态回归的必要用例。完整冲突与截止的未排期择槽/无写入、过去时间和有效时长仍有既有专项证明；这些证据不等价于未运行的新组合案例。

完成态补修 RED：2026-10-07 00:46:36–37 +08:00，主树 PC 执行 `node --experimental-strip-types --test --test-name-pattern="scheduleTaskToDay rejects DONE and CANCELLED" scripts/r4-task-store-schedule.test.mjs`，退出 1。四个终态子例中仅未排期 DONE 失败，实际 row 从 synced 变 pending、增加 scheduledAt 和 UPDATE outbox，版本仍为 7；全量仓储/outbox/任务与槽位快照发生变化。DONE 已排期、CANCELLED 有/无排期均正确拒绝。证据 `C:\Users\Gnasche\AppData\Local\Temp\auralis-date-fixes-done-guard-red-20261007-v2.stdout.log`、同基名 stderr 与 `.meta.txt` 已由主 Agent读取。reviewer 初审记录 `C:\Users\Gnasche\AppData\Local\Temp\auralis-date-fixes-reviewer-20261007.md`（BLOCKER=0、IMPORTANT=1），同一 reviewer 等待补修后复核。

## 最终命令验证（2026-10-07）

完成态补修实际 Antigravity ID 为 `332943cfb2c8`，Gemini 3.1 Pro High，先 plan-only 再在同一树生成一份源码补丁，退出 0。保留原已排期完成守卫，再用现有 `isCompletedTask` 拒绝任意完成态；没有为合并冗余守卫重构。Luna 直接完善必要真实测试，主 Agent 没有重跑执行代理的普通门禁。

执行目录：`D:\CodeBase\Active\Auralis\Auralis-PC`。以下最终日志分别保存 stdout、stderr 和 meta；统一前缀为 `C:\Users\Gnasche\AppData\Local\Temp\auralis-date-fixes-done-guard-`。

| 实际命令 | 退出码 / 结果 | 日志基名（另含 `.stdout.log`、`.stderr.log`、`.meta.txt`） |
| --- | --- | --- |
| `node --experimental-strip-types --test scripts/r4-task-store-schedule.test.mjs scripts/r4-task-view-rules.test.mjs scripts/r4-dashboard-timeline.test.mjs` | 0，90/90，无取消/跳过；00:53:49–50 +08 | `green-20261007` |
| `npm run type-check` | 0；00:54:36–47 +08 | `gate-type-check-20261007` |
| `npm run check:subject-icons` | 0；00:54:36–37 +08 | `gate-check-subject-icons-20261007` |
| `npm run check:subject-workspace` | 0；00:54:36–37 +08 | `gate-check-subject-workspace-20261007` |
| `npm run test:r4-pc` | 0，527/527，无取消/跳过；00:54:36–39 +08 | `gate-test-r4-pc-20261007` |
| `npm run build` | 0；00:54:36–00:56:01 +08，Vite built in 12.52s | `gate-build-20261007` |

主 Agent 已读取上述 meta 和关键输出；构建仍有 browser externalization、chunk 大小、动态/静态混用导入及 file-viewer 插件耗时警告，未失败，不在本轮清理。初次门禁 launcher 构造失败发生于 npm 调用前，由执行代理归因并修正后执行上述实际命令。最终四文件补丁相对文件快照 248 新增、22 删除，主树/AGY 四目标哈希一致，`git apply --reverse --check` 与目标 `git diff --check` 均退出 0。

最终实现只改两份授权源码和两份既有脚本，没有新增依赖、生成文件、API/数据库字段、Server/Mobile 变化或新删除。文档由主 Agent 同步 README/本计划、FrontendPC、Frontend、Status、IssuesAndReview、Changelog。用户已有 Home/Settings 删除和其它未提交内容保留；没有提交、合并、部署或生产操作。

GUI/Tauri/真实 HTTP、分钟定时器和双设备同步未验收；Store 使用 browser localStorage fallback，组件验证为真实计算体提取与 Store 联结。未独立动态执行的组合案例见覆盖裁决，原当前时刻/午夜及跨周 swap 两项 OPTIONAL 保留。

## 最终审查、冻结与交接

唯一 Luna reviewer 最终 BLOCKER=0、IMPORTANT=0、无新增已证实 OPTIONAL 行为问题；已批准四项实现通过审查。初审未排期 DONE 的复现、必要补修及同一 reviewer 的关闭证据保留在 `C:\Users\Gnasche\AppData\Local\Temp\auralis-date-fixes-reviewer-20261007.md`，主 Agent 已读取最终结论。此前两项 OPTIONAL 和独立组合测试覆盖限制继续登记，不等价于新发现的行为错误。

执行报告、最终四文件差分及 source/test 分离补丁、只读 baseline 快照和全部日志保留 TEMP。Luna 已安全清理 Antigravity 隔离树：先只删除指向主树 node_modules 的 Junction 本身，确认主树目标仍存在，再 `collect(cleanup=true)`；worktree 已不存在，没有把 collect 的旧 HEAD 宽差分应用到主树。实际记录见执行报告的安全清理章节。

本轮通过专项、PC 回归及唯一审查的四文件实现视为 frozen。后续只在出现明确 correctness 证据或用户新需求时修改；当前完成范围为四项代码修复、自动验证、只读审查和文档同步，真实业务环境验收继续单独记录。
