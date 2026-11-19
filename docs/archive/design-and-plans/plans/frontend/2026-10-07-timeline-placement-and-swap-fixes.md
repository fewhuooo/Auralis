# PC 时间轴放置与交换修复实施计划

> 执行方式：使用 subagent-driven-development；按仓库 AGENTS.md，由同一 Luna 执行 Agent 管理 Antigravity，最后仅一个只读 reviewer。用户已在三项审计清单后授权“修复”，不重复请求批准，不提交工作树。

**Goal:** 关闭迟到排期响应覆盖、按天漏扫末槽和紧邻交换脱离可见网格三项 IMPORTANT。

**Architecture:** 在线插入与交换继续沿用现有 REST 和 Sync read。既有 `upsertSyncedBatch` 在原 SQL 事务或 browser 一次状态提交内保护较新版本及墓碑，合并其他有效成员；Store 只从当前 Repository 重建投影。择槽与交换在既有 Task Store 局部修复，不改服务端算法。

**Tech Stack:** Vue / Pinia、TypeScript、LocalRepository 的 SQLite adapter / localStorage fallback、Node test runner、Antigravity MCP。

## 授权、当前证据与冻结边界

- 用户授权来源：2026-10-07 放置/交换审计后回复“修复”。已确认的最小方向为本地写回保护、末槽补齐和交换越界前置拒绝。
- 当前 HEAD：`ed08697c195aefe593e456c5f58802f8f5b39a85`；工作树已有大量未提交修改，必须保留。
- 修复前专项 PC 90/90、Repository 22/22、Service/Controller 15/15 与 Service 边界 4/4 均通过。TEMP 实际 Store/Repository/API 桩和 runSyncCycle 已复现三项缺陷；通过旧测试不能关闭新缺口。
- 审计报告：`C:\Users\Gnasche\AppData\Local\Temp\auralis-placement-swap-audit-20261007.md`；原复现与日志在同名目录。
- 只改四份授权实现/测试：`Auralis-PC/src/services/localRepository.ts`、`Auralis-PC/src/store/useTaskStore.ts`、`Auralis-PC/scripts/r4-local-repository.test.mjs`、`Auralis-PC/scripts/r4-task-store-schedule.test.mjs`。
- 此前通过审查的日期捕获、完整日期来源、已有排期按天移动、重挂载日期和全部 DONE/CANCELLED 保护保留。跨周同星期 swap、当前时刻标记两项 OPTIONAL 不修改。
- 不改 Server/Mobile、依赖、生成文件、API/数据库字段、迁移、鉴权和部署；不删除、提交、改 index/HEAD、还原或丢弃用户内容。确有 correctness 必要才扩大文件范围，并先交主 Agent裁决。
- 前端候选源代码由 Antigravity Gemini 3.1 Pro High 生成；Luna 负责有证据的必要源码补修、完整真实回归、当前文件快照、物化隔离树、相对快照新差分、门禁和失败归因。现行文档由主 Agent回写。

## Task 1：原子接受远端排期响应并保护当前投影

**Files:** LocalRepository、Task Store 与两份既有脚本。

**Interfaces:** 保留 `upsertSyncedBatch<T>(items: readonly LocalSnapshotItem<T>[]): Promise<boolean>`。false 继续只表示整批存在未解决本地 mutation，零写；true 表示所有可接受成员在同一提交边界合并完成，过期成员可跳过。该批量入口目前只由 Task Store 的在线排期响应调用，不承载显式 restore。

接受规则（提交段必须读取当前行；不能依赖 API 前的预读）：

```ts
const staleVersion = current !== undefined && incoming.version < current.version
const wouldClearTombstone = current !== undefined
  && current.deletedAt !== null && incoming.deletedAt === null
const accept = !staleVersion && !wouldClearTombstone
```

- 先保留整批 pending/inflight/conflict/error mutation 围栏，再在同一 SQL 写事务或同步 browser 状态提交中逐项判断。
- active→同版本 active 幂等接受；active→同版本墓碑允许；当前墓碑→active 一律拒绝，包含本地 Subject cascade 不递增子版本、响应版本更大的情况。墓碑→墓碑也不能降低版本。
- 某个过期成员不能阻止同批其他有效项落库；SQL 任一实际写失败仍回滚全部可接受项，browser 只序列化写一次。
- Store 在合并成功、mutation 围栏拒绝和缓存异常三条路径均重读 Repository；删除原来直接以 response 替换内存的路径，保留同步请求、错误反馈和保存/刷新结果语义。
- 不新增全量快照 API。资源 pull 应用完成后才推进 cursor；未越过响应事件时后续 read 能重放，已经越过时本地较新行/墓碑应保留。实际回归须证明两类路径，不以注释推断验收。

- [x] 主 Agent裁决逐项原子 merge、墓碑优先级、Store 仅重读当前缓存的方案。
- [x] 执行 Agent保存当前文件快照与 hash manifest，核对授权四文件与快照一致。
- [x] Antigravity 先给出计划，Luna 有证据地补齐实际回归；在当前实现上运行并记录 RED。
- [x] 最小实现 SQL/browser 接受保护和 Store 投影修复。
- [x] 实际验证插入与交换共享写回：v9 更新/删除先 pull、v8 响应后到，row/version/deletedAt/cursor/outbox/投影不回退或复活。
- [x] 验证缓存失败前已 pull 更新/墓碑，以及未越过事件后的 read 恢复；不能直接安装响应模型。
- [x] 验证 same/lower-version 本地墓碑、同版本 active 幂等、混合过期/有效成员、未解决 mutation 整组零写、SQL 故障回滚和 browser 一次提交。

## Task 2：按天排期覆盖末槽

**Files:** Task Store、排期脚本。

按天循环使用既有窗口常量：

```ts
for (let minutes = TIMELINE_START_MINUTES;
  minutes <= TIMELINE_END_MINUTES;
  minutes += TIMELINE_SLOT_MINUTES) {
  // 沿用现有完整时长冲突、过去时间及截止校验。
}
```

约束的是起始时间，任务结束晚于 22:30 本身不违规；仍必须完整结束于自身截止之前。

- [x] 真实 Store 回归：只有 22:30 空闲时按天成功，与直接放到末槽一致。
- [x] 末槽完整截止不足、区间冲突时拒绝且 row/version/outbox/投影不变。
- [x] 最小修改循环上界并记录 GREEN，保留已排期按天移动和完成态保护。

## Task 3：交换后的新起点必须仍可见

**Files:** Task Store、排期脚本。

- 保留当前 compact 计算、非紧邻互换原起点、期限与同步围栏；Service 按共同窗口交换的算法不变。
- 校验实际新起点在本地日期 08:00–22:30 闭区间，不能只按向下取整后的槽位判断；不新增半小时对齐限制。
- 紧邻 compact 用原共同窗口较早起点的本地日期计算当天上下界，避免跨午夜后钟点重新落入可见范围而误放行。非紧邻只校验各新起点所属日的时刻范围，保留既有 weekday 同日守卫，不修 OPTIONAL 跨周比较。
- 任一新起点越界在发 API 前抛明确错误；两项时间、版本、outbox 和投影均不变。

- [x] RED/GREEN：21:30/30 分钟与 22:00/90 分钟，两种拖动方向均拒绝，API 未调用。
- [x] 检查 22:45 不因映射为 22:30 放行；时长契约允许时覆盖 compact 跨午夜后钟点可见组合。
- [x] 正常可见交换继续成功，包括恰好 22:30、新区间允许结束更晚及既有截止/冲突拒绝对照。

## 验证与交接

执行目录：`D:\CodeBase\Active\Auralis\Auralis-PC`。

```powershell
node --experimental-strip-types --test scripts/r4-task-store-schedule.test.mjs scripts/r4-task-view-rules.test.mjs scripts/r4-dashboard-timeline.test.mjs scripts/r4-local-repository.test.mjs
npm run type-check
npm run check:subject-icons
npm run check:subject-workspace
npm run test:r4-pc
npm run build
```

- [x] 记录 test-only RED、实现后 GREEN 和最终门禁的日期/cwd/完整命令/退出码/关键输出/日志。
- [x] 核对授权文件相对本轮快照的完整 diff、所有新增删除、依赖/生成文件/跨模块变化；不得应用包含既有用户内容的 HEAD 宽差分。
- [x] 完成实现后由主 Agent派唯一只读 reviewer；只看 correctness、需求、回归、race/data integrity 和必要测试缺口，不改文件或再派 reviewer。
- [x] 唯一 reviewer 本轮无 IMPORTANT/BLOCKER，无需审查补修；主 Agent发现的范围偏差已交同一执行 Agent最小修正并由该 reviewer 确认，不重复已充分证明的普通门禁。
- [x] 主 Agent核对最终证据，回写 FrontendPC、Frontend、Status、IssuesAndReview、Changelog、README/本计划；若仅本地接受规则变化，同步 Database 的规则事实，API 字段不变。
- [x] 安全清理 Antigravity 隔离树：先核对绝对路径、工作树归属及 node_modules 类型；若为 junction 只移除链接本身。本次隔离树 node_modules 实际为独立普通目录，主树依赖也为普通目录；核对主树依赖仍在，再 collect cleanup。

业务验收边界：自动回归使用真实 Pinia/Repository 与 API 桩/内存 SQLite；真实 GUI、Tauri 插件、HTTP 网络时序、双设备和真实服务数据库分别待验收。当前代码、自动验证与唯一只读审查通过，三项 IMPORTANT 已在这些层面关闭；真实环境仍按上述边界验收，不把自动测试写成业务验收完成。

## 本轮执行记录

- Antigravity 任务 `d0e00e77fe10`，模型 Gemini 3.1 Pro High，隔离分支 `agy/timeline-placement-swap-fixes-20261007`，工作树 `C:\Users\Gnasche\.agy-mcp\delegations\wt-8639ae1e`，base 为上述精确 HEAD。
- 本次文件快照 `C:\Users\Gnasche\AppData\Local\Temp\auralis-placement-fixes-baseline-20261007\manifest.json`；当前工作树 overlay 在 `C:\Users\Gnasche\AppData\Local\Temp\auralis-placement-fixes-overlay-20261007\manifest.json`。执行 Agent核对授权四文件及 overlay hash 对齐，主树/index/HEAD 保持。新计划已加入只读任务上下文。
- 启动要求：先输出计划，物化当前脏树快照，生成 test-only RED，再实施及验证授权四文件；最终仅提取相对本次快照的新差分。当前等待 RED/实现结果，尚无本轮修复通过声明。
- 生成阶段执行 Agent发现隔离树排期脚本从 69,597 B 缩为 25,195 B，相对本轮基线删除 877 行真实 Pinia/Repository 用例，仅剩主要静态断言。主 Agent拒绝该差分，执行 Agent已安全停止 `d0e00e77fe10` 并将现场保存到 `C:\Users\Gnasche\AppData\Local\Temp\auralis-placement-fixes-agy-interrupted-20261007`。隔离树排期脚本恢复 69,597 B 完整本轮基线，候选源码另存 TEMP 后暂恢复基线，保留 Repository 测试增量，继续精确追加真实用例并验证 test-only RED。这些删除未应用到主树，主树四文件 hash 仍与基线一致。后续实际补修和新任务记录由最终报告补齐。
- 同一隔离树 BG 续作 `8d7dc36d8fe2`（Gemini 3.1 Pro High）输出过计划并保留完整脚本，但运行 10:08 后以 `print timeout after 10m0s with turn in progress` 结束。工具状态 completed/exitCode 0 不能作为实现或命令验证通过；没有可核验 RED/GREEN 结果。已生成两源码候选与两测试增量，Luna 按主 Agent授权接管必要回归修正与实际验证。必要性证据包括第一次截断及第二次缺真实延迟 gate、插入竞态、恢复/游标/零写断言、被截止校验提前遮蔽的窗口夹具；保留全部旧用例，不再扩展文件范围。
- 首次主树 test-only RED 于 2026-10-07 14:29:14–15 +08 执行上述四脚本，退出 1，117 tests / 112 pass / 5 fail / 0 skip。主 Agent读取 `C:\Users\Gnasche\AppData\Local\Temp\auralis-placement-fixes-execution-20261007\test-only-red-meta.txt` 与 stdout：browser/SQL 旧版本覆盖、Store v9→v8 投影及按天漏末槽实际失败；交换用例实际返回截止错误，尚不能证明窗口守卫缺口，需调整夹具。此轮只应用测试增量，源码保持基线；后续须补完整真实交错并重新记录 RED/GREEN，不能以此部分覆盖关闭三项。
- 最终完整 test-only RED v2 于 14:44:28 +08 执行四脚本，退出 1，125 tests / 115 pass / 10 fail / 0 skip；加入真实 API gate 与 `runSyncCycle` 更新/DELETE 交错、交换共享写回、已推进/尚未推进 cursor 的缓存错误恢复。末槽截止超限和冲突对照通过，交换夹具不再受截止校验遮蔽。日志为同执行目录的 `final-test-only-red-v2-*`。
- Luna 必要补修保留响应 `model.version`（包括 0），删除错误回退到本地版本的候选写法及旧“cursor 一定未推进”注释；v0 用例通过实际 API/Repository 路径验证低版本不覆盖及同版本活动响应可接受。第一次 GREEN 命令退出 1，归因为旧静态响应投影断言和两个旧 API mock 缺少契约版本；保留旧用例主体，更新这些必要夹具/断言后，14:53:17–18 +08 四脚本为 126/126、退出 0，见 `focused-green-retry1-*`。同日 PC 541/541、类型和两项静态检查退出 0。此阶段结果不是最终修复验收。
- 会话中断后的原 build session 67557 没有可核验结束元数据，且不再运行；仅重跑未完成的 build。16:39:51–16:40:34 +08 `npm run build` 退出 0，47/47 renderer assets copied，见 `build-final-*`；其余已通过门禁未因此重复。
- 主 Agent核对完整相对本轮快照 diff，发现非紧邻交换错误地用原任务日期限制新起点，改变了冻结保留的跨周同星期 OPTIONAL 行为。授权 Luna 最小改为非紧邻按各新起点所属日期检查时刻，紧邻继续使用原共同窗口日期；真实 Store 跨周同星期非紧邻对照先 RED、后 GREEN，原 weekday 守卫保留。相关源码变化后执行新的专项/类型/全 PC/构建，两项无关静态门禁沿用上述实际通过证据；最新结果、完整差分和唯一 reviewer 结论待最终交接补齐。
- 执行 Agent最终包在 `C:\Users\Gnasche\AppData\Local\Temp\auralis-placement-fixes-execution-20261007`：`auralis-timeline-placement-swap-execution-report-20261007.md`、`auralis-timeline-placement-swap-final-20261007.diff`、`final-scope-manifest.json`。主 Agent已核对完整新差分和实际日志。最终四脚本 127/127、PC 全量 542/542（16:45:56–58 +08），类型检查（16:44:20–26）与最终源码构建（16:44:20–16:45:00）退出 0，两项学科静态检查沿用 14:53:45 的退出 0 证据。后续仅加强测试断言，所以源码构建结果仍对应末版源码；测试结果对应末版脚本。实际日志分别为 `focused-final-v3-*`、`test-r4-pc-final-v3-*`、`type-check-after-scope-fix-*`、`build-after-scope-fix-*`、`check-subject-icons-*`、`check-subject-workspace-*`，全部 cwd 为 `D:\CodeBase\Active\Auralis\Auralis-PC`，无 skip。构建有依赖 externalization、大 chunk、dynamic import 和 plugin timing 提示，退出码为 0。
- 最终 v0 RED 加强为业务快照断言：真实 API 一次调用，返回请求落点；错误候选写法实际导致 `current is not defined`，未把 v0 交到 Repository。末版直接保留 v0，当前 v9 行/投影不回退且没有刷新错误，同版本活动响应可接受。临时 source RED 前后 hash 相同，见 `store-v0-red-final-*`；先前仅看最终行而未看写回/错误的弱用例不能作为关闭证据。
- 主 Agent最终范围保护核对 `root-protection-check.json`：151 个非授权实现/文档的既有修改或新增文件 hash 与本次 overlay 一致，原两个删除路径未复现，HEAD 保持上述值，暂存为空。新差分只含授权四文件，现行文档由主 Agent局部回写；没有应用包含用户旧改动的 HEAD 宽差分。
- 唯一只读 reviewer `/root/placement_swap_reviewer`（Luna，极高思考）按上述快照 manifest 检查完整四文件差分、当前源码、回归和最终日志。正式结论为本轮 BLOCKER=0、IMPORTANT=0、OPTIONAL=0，原跨周同星期交换及当前时刻标记两项 OPTIONAL 保留；未修改文件/index/HEAD、未派其他 reviewer、未重复跑测试。确认点：Repository `335–413` 的事务内围栏/版本/墓碑及 browser 一次提交；Store `581–613` 的精确版本和只读缓存投影；`763–784` 的末槽择槽；`803–859` 的实际起点与日期边界。没有剩余需动态复现的本轮风险。
- 清理前保存隔离树四个候选及 hash 清单到 `agy-final-candidate-snapshot`，AGY status/tail 和 scratch 扫描结果也保留。核对两个任务 PID 不活动、目标归属与 containment 后，实际调用 `delegate_antigravity collect(cleanup=true)`；写回原始响应曾发生 Windows os error 206，随后独立只读核实清理已经执行。16:55:57–16:56:13 +08 检查路径、工作树注册、委派注册和自有分支均不存在，主树 node_modules 仍为普通目录，四文件 hash、HEAD/index 与末版清单一致。主 Agent已核对 `agy-collect-cleanup-receipt.json`、`cleanup-postflight.txt` 和报告清理记录；没有删除主树依赖。
- 覆盖口径：已推进 cursor 的缓存异常动态用例使用更新事件；DELETE 的异常投影路径和同版本墓碑→活动拒绝由共同代码守卫及已有更新/DELETE、较高活动版本墓碑对照确认，未额外新增这两种独立动态组合。真实 SQL Repository 已动态执行，Tauri plugin 和真实多连接并发未验收。

## 最终交接状态

- **代码**：三个授权 IMPORTANT 在上述四个既有文件局部关闭，末版通过自动验证和只读审查，保持 frozen；此前日期/完成态/截止/自动完成保护和两项 OPTIONAL 保留。
- **命令验证**：四脚本 127/127、PC 542/542、类型/两项静态/构建退出 0；命令、日期、cwd、日志见执行记录和 TEMP 报告。三项缺陷有真实 RED/GREEN，不以 AGY completed/exitCode 0 替代门禁。
- **文档**：README 登记本计划，FrontendPC、Frontend、Database 的本地规则事实、Status、IssuesAndReview、Changelog 已同步；没有 API 字段或数据库 schema 变化。
- **业务验收**：真实 GUI 拖放、Tauri SQLite、HTTP 时序与双设备尚未验收。自动回归使用真实 Store/Repository 和桩 API/内存 SQLite，不推断真实服务验收。
- **工作树**：用户旧修改与删除保留，HEAD/index 未变，无提交/部署；AGY 工作树、自有分支和注册已安全清理，主树依赖保留，证据快照与收据在上述 TEMP 目录。
