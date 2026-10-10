# 任务完整排期截止时间校验

日期：2026-10-06

状态：代码、自动验证与单个只读 reviewer 审查通过；真实业务环境待验收。

## 目标和范围

用户确认：整个任务必须在截止时间前结束。具有排期与截止时间的任务，新的时间安排满足 `scheduledAt + effectiveDurationMinutes <= dueAt`；恰好在截止时刻结束允许。没有截止时间时不施加此限制。

本轮完整脏树基线：`e3f02f905ac602ab7ecdf03fa316c2528204b74c`。基线包含用户知识块 Markdown/LaTeX 修改和此前自动完成、活动行墓碑保护等已验证代码。原有工作树、索引和 HEAD 保持原样，禁止覆盖无关修改。

## 当前依据和边界

- 任务开始时 API、Backend 与 Database 文档明确允许排期超过截止时间；用户最新要求覆盖该产品规则。保留 `dueAt`、现有默认时长、半开区间冲突规则、版本、锁和同步机制。
- 有效时长沿用现有契约，服务端 `durationMinutes=null` 按 30 分钟。比较实际时间点，不使用带时区字符串的字典序。
- 创建、恢复、修改排期/有效时长/截止时间，以及插入顺延和原子换位必须验证完整区间。顺延与换位中任一新安排不合法时整组失败，不改数据、版本或本地 outbox。
- 历史已持久化的不合法排期不批量改写。只改标题、备注或状态且有效时间字段没有变化时保持可保存，尤其不能阻断已验证的自动 DONE；`null` 与显式 30 分钟视作同一有效时长。恢复和重新安排仍必须满足新规则。
- PC 拖放、按天排期和编辑在提交前反馈错误；后端共享领域逻辑覆盖 REST 和 Sync。沿用 `VALIDATION_FAILED`，不新增接口、数据列或数据库迁移。
- 未排期任务到期自动完成、已排期任务按结束时刻完成、Subject cascade 墓碑保护属于冻结行为，本轮必须验证其回归。

## 执行安排

- [x] Luna xhigh 执行代理只读定位所有入口，返回必要文件和实际专项命令证据。
- [x] 后端执行代理先建立实际 RED，再实施最小共享校验与事务回归。
- [x] Antigravity Gemini 3.1 Pro High 在隔离工作树先给出计划，再修改明确授权的 PC 规则、Store 和相关测试。
- [x] 主 Agent 检查完整委派 diff、生成文件、依赖、删除和跨模块写入；核对实际 RED/GREEN。
- [x] 执行代理运行相关专项、PC 全量回归、类型、既有静态检查和构建，记录命令、退出码和日志。
- [x] 单个只读 reviewer 检查需求、行为回归、事务和数据完整性；必要问题由原执行方补修后同一 reviewer 复查。
- [x] 回写产品、前端设计、PC、Backend、API、Database、状态、问题及 Changelog，并登记 README。

## 验收条件

完整区间越界被拒绝，恰好结束与无截止均允许；编辑和各排期入口覆盖；顺延链与换位拒绝保持整组原数据；REST 与 Sync 共用规则；历史非时间编辑与自动完成不回归。BLOCKER=0、IMPORTANT=0，相关自动验证通过才可声明实现完成。

GUI/Tauri、真实运行服务、双设备同步和实际拖放提示属于单独业务验收边界，不以代码、构建、脚本或委派完成代替。无需提交或部署。

## 基线验证与委派

执行代理在当前主树实际运行：

| 目录 / 命令 | 退出码与结果 | 日志（位于 `C:\Users\Gnasche\AppData\Local\Temp`） |
| --- | --- | --- |
| PC：`node --experimental-strip-types --test scripts/r4-task-store-schedule.test.mjs scripts/r4-task-view-rules.test.mjs scripts/r4-dashboard-timeline.test.mjs` | 0，64/64；仅证明既有行为通过 | `auralis-deadline-constraint-pc-focused-20261006.log` |
| Server：`mvnw.cmd -B -ntp clean "-Dtest=CoreDomainServiceTests#taskScheduleInsertionAllowsDeadlineToPassAndPreservesDueAt+taskUpdateAndSwapAllowSchedulesAfterDueAt" test` | 0，2/2，BUILD SUCCESS；明确证明旧逻辑允许越界 | `auralis-deadline-constraint-server-focused-20261006.log` |

上述结果不是新规则验收，未覆盖 GUI 或真实同步。

Antigravity 实际委派：`fd6e62042a59`，Gemini 3.1 Pro High，以完整脏树快照隔离；先给出计划，授权只改 PC Task Store、taskViewRules 与两份既有专项测试。后端执行代理只允许修改 TaskService 和对应领域/Controller/Sync 测试；主 Agent 回写文档。未授权依赖、生成文件、数据库迁移或其他前端页面变化。

## 实施中的必要纠正

- 主 Agent 已检查 Antigravity 首版完整 4 文件 diff，未应用主树：发现 `Number(null)` 将默认时长错误算成 0、相邻不等长交换预检未采用服务端紧凑换位、顺延未向上取整到半小时且遗漏原先开始的交叠任务；新时限检查还沿用终态豁免，可能先写本地再被后端拒绝。四项为明确 correctness 缺陷，授权原隔离工作树补修（Antigravity `28eb375f9521`），不扩大模块范围。
- 首版新增测试未实际覆盖创建、后续顺延和不等长紧邻换位，主 Agent 要求补真实 Store/Repository/API 调用及失败无写入断言；不以委派自报通过替代主树验证。
- 后端真实 RED：clean 同范围运行 8 项，7 failures、0 errors，退出 1。创建/更新/恢复/顺延/换位均未抛预期错误，REST 超限创建返回 201，Sync 返回 APPLIED；历史非时间更新兼容用例通过。日志：`auralis-deadline-server-red-clean-20261006.log`。
- 非 clean 的首轮 RED 因 `JsonNode` 类加载失败，首次 GREEN 因旧 Repository 编译产物无法识别而在上下文启动失败，均不是业务 RED/GREEN。原执行代理继续以 normal clean 对相同范围重跑，不修改依赖或配置，最终证据以实际断言为准。

## 后端实际验证

- 补充取消态创建/时间编辑 RED：`mvnw.cmd -B -ntp clean "-Dtest=CoreDomainServiceTests#cancelledScheduledTasksValidateOnCreateAndTimeChangesButAllowStatusOnlyCancellation" test`，退出 1，1 项预期失败；移除截止校验的取消态豁免，保留原重叠规则的取消态豁免。日志：`auralis-deadline-cancelled-red-clean-20261006.log`。
- 最终命令（目录 `Auralis-Server`）：`mvnw.cmd -B -ntp clean "-Dtest=CoreDomainServiceTests,CoreDomainControllerTests,SyncControllerJsonCompatibilityTests" test`，退出 0，37/37，failures/errors/skipped 均 0，BUILD SUCCESS。日志：`C:\Users\Gnasche\AppData\Local\Temp\auralis-deadline-server-focused-clean-green-20261006.log`，主 Agent 已读取结果并核对全部后端差分。
- TaskService 在原锁和事务内共用截止校验，覆盖创建、时间更新、恢复、双方换位和全部实际顺延候选；更新比较有效时长，避免 null 与 30 的归一化阻断历史 DONE。恢复失败保留墓碑，REST/Sync 失败不改任务时间或版本。
- Service 25 项、Controller 9 项与 Sync 3 项覆盖新规则及现有领域回归，含 offset instant、恰好结束、无截止、时长/截止编辑、旧非时间编辑、恢复和事务回滚。仅一处相邻换位测试将原越界截止夹具调整为合法截止以保留原窗口断言。
- 只改 TaskService 及三份授权测试，执行代理 `git diff --check` 无输出。未新增接口/数据列/迁移/依赖/生成文件；未运行全量 Maven 或真实服务业务验收。

## PC 主树 RED 与必要覆盖补齐

- 原隔离工作树的补修由 Antigravity `28eb375f9521` 完成。主 Agent 已阅读全部四文件差分：完整默认时长、终态时间编辑、紧邻换位与网格顺延的必要修正均在既有 Store/规则内，无依赖、生成、删除或跨模块变化；原 node_modules junction 不存在，补丁已单独保存。
- 主树先只应用两份测试，源码保持本轮基线。执行代理实际运行原三脚本命令：退出 1，68 项中 63 pass / 5 fail；三项实际 Store 操作缺少预期拒绝，另两项为新规则辅助未导出与新源码条件尚未存在。日志：`C:\Users\Gnasche\AppData\Local\Temp\auralis-deadline-pc-red-main-tree-20261006.log`。
- Antigravity 新测试仍未真正调用 addTask 创建，offset 用例只是相同字符串，失败后仓储/outbox/投影断言不完整。基于明确覆盖缺口，授权原 Luna 执行代理仅补两份既有 PC 测试的实际调用与数据断言，不改源码或冻结测试；补齐后再应用已审查的实现补丁，记录主树 GREEN 与门禁。

## PC 最终自动验证

必要覆盖补齐后的主树 RED（三脚本原命令）退出 1，79 项中 66 pass / 13 fail；超限创建实际写入了 row/outbox/投影，终态编辑与重新激活未拒绝，双方换位及顺延/body 源超限实际发了 API，新规则辅助尚未导出。旧非时间编辑、offset 等价、null 与 30 等价及自动 DONE 用例已通过。日志：`auralis-deadline-pc-red-supplemented-20261006-ready.log`。测试 API monkeypatch 全部以 finally 恢复，避免 RED 污染后续用例。

主 Agent `git apply --check` 后只应用授权源补丁，执行代理实际三脚本 GREEN 79/79，退出 0（`auralis-deadline-pc-green-20261006.log`）。最后补按天搜索实际用例：08:00–08:30 被占时，60 分钟且截止 09:30 的任务选择 08:30；30 分钟且截止 08:15 的任务找不到合法槽时保持仓储、outbox 与投影不变。以下是最后测试文件的门禁结果，主 Agent 已读取日志核对，不重复执行普通门禁。

日期：2026-10-06。目录：`D:\CodeBase\Active\Auralis\Auralis-PC`。日志位于 `C:\Users\Gnasche\AppData\Local\Temp`。

| 实际命令 | 退出码 / 结果 | 日志 |
| --- | --- | --- |
| `node --experimental-strip-types --test scripts/r4-task-store-schedule.test.mjs scripts/r4-task-view-rules.test.mjs scripts/r4-dashboard-timeline.test.mjs scripts/r4-local-repository.test.mjs` | 0，102/102，fail/cancelled/skipped/todo 均 0 | `auralis-deadline-pc-four-script-final-20261006.log` |
| `npm run type-check` | 0，vue-tsc 无诊断 | `auralis-deadline-pc-type-check-final-20261006.log` |
| `npm run check:subject-icons` | 0，contract passed | `auralis-deadline-pc-subject-icons-final-20261006.log` |
| `npm run check:subject-workspace` | 0，contract passed | `auralis-deadline-pc-subject-workspace-final-20261006.log` |
| `npm run test:r4-pc` | 0，513/513，fail/cancelled/skipped/todo 均 0 | `auralis-deadline-pc-test-r4-pc-final-20261006.log` |
| `npm run build` | 0，6.27s，47/47 renderer assets | `auralis-deadline-pc-build-20261006.log` |

专项已包含在全 PC 脚本中，计数不能叠加。覆盖真实 Store/Repository 提交与拒绝、双方候选、半小时顺延、body 放置及冻结的 SQLite/browser 墓碑保护。构建仍有 chunk 体积、dynamic import 与 plugin timing 提示，不修改无关配置。GUI/Tauri、真实运行服务与双设备同步未验收。

Antigravity 原隔离工作树与分支已清理，清理前确认 node_modules junction 不存在、没有 untracked scratch 文件，源/测试 patch 已单独保存。公开字段、依赖与迁移保持原契约。

## 最终审查与交接

- 唯一只读 reviewer：Luna xhigh，结论为本任务 BLOCKER=0、IMPORTANT=0、OPTIONAL=0。对照完整脏树基线读取授权源码/测试及相关调用，确认有效区间、非时间更新兼容、组内完整校验和事务回滚；自动 DONE/墓碑围栏、User→Subject→Task 锁与 Sync receipt/outbox 沿用原路径。reviewer 未修改文件、未启动其他 reviewer，也未重复执行已通过门禁。
- 本轮代码范围为 PC Task Store、taskViewRules 及两份专项，Server TaskService 及三份领域/REST/Sync 测试；文档回写 ProductRequirements、Frontend 设计、FrontendPC、Backend、API、Database、Status、IssuesAndReview、Changelog 与 README，新记录已登记。
- 主 Agent 检查整体脏树差分时使用临时 Git index 对全部当前文件与完整快照比较，实际索引/HEAD 不变；未覆盖用户既有 Markdown/LaTeX、自动完成、Focus/Overview 等修改。原未跟踪文件与删除状态按基线保留；无本轮依赖、生成文件变更、删除操作或授权范围外写入。
- Antigravity 实际生成及补修 PC 源码；Codex 执行代理完成后端及必要真实测试并运行命令，主 Agent 审查 diff/日志，单个 reviewer 做只读检查。三者与 GUI/真机/外部服务验收分别记录。
- 剩余业务验收：GUI/Tauri、真实运行服务、双设备同步及实际拖放提示。本轮未提交、部署或执行生产迁移；自动测试及构建不证明上述环境已验收。
