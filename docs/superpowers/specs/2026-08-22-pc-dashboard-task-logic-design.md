# PC 首页时间轴与任务逻辑设计

日期：2026-08-22

状态：已获用户确认，待实现

## 目标

修复 PC 首页时间轴右侧内容被裁切的问题，并统一首页 Dashboard、任务编排 Timeline 与资产库的任务展示和状态语义。

## 已确认的产品规则

- 首页时间轴保留已完成的已排期任务，不因完成状态从时间轴移除。
- 首页时间轴只展示当前日期起 7 天以内的排期数据；超出窗口的任务仍保留在任务数据和资产库中。
- 资产库“全部任务”按“未分布”“未完成”“已完成”三个并列层级展示；同时没有截止时间和排期的任务优先归入“未分布”，不再混入完成状态组。其余任务按是否完成分组，每组内部按截止时间升序排列；没有截止时间的任务排在该组末尾。
- 排期本身不改变任务状态。完成操作只把任务状态更新为 `DONE`，并保留 `scheduledAt`；只有明确的“移出排期”操作才清除 `scheduledAt`。
- Dashboard 与 Timeline 使用同一套任务过滤、排序、时间窗口和状态视觉规则。

## 根因证据

- `Auralis-PC/src/views/Dashboard/index.vue` 将三栏宽度写成 `25% + 50% + 剩余宽度`，但容器还包含 padding、gap 和两个分隔条；容器同时使用 `overflow: hidden`，导致右侧时间轴超出可用宽度后被裁切。
- Dashboard 与 Timeline 各自复制任务筛选和排期判断。两处仅筛选 `pending` 的待安排任务，导致 `learning`/`to_review` 任务不稳定地消失。
- `useTaskStore.updateTaskStatus` 在状态不是 `scheduled` 时清除 `scheduledAt`，与 API/数据库契约“排期不自动改变状态”冲突。
- Dashboard/Timeline 的拖拽保存未统一等待异步 Store 操作，也没有一致的失败反馈和界面恢复策略。

## 设计

### 1. 共享任务视图规则

新增纯函数任务视图规则模块，输入 `Task[]` 和当前时间，输出：

- `isCompletedTask(task)`：仅 `status === 'completed'` 视为已完成。
- `isSchedulableTask(task)`：仅未完成且未取消任务进入待安排列表。
- `getTaskDueTimestamp(task)`：优先 `dueAt`，无截止时间时返回无穷大，用于稳定排序。
- `getTasksForAssetGroups(tasks)`：返回“未分布/未完成/已完成”三组；同时没有 `dueAt` 和 `scheduledAt` 的任务进入“未分布”，其余任务按完成状态分组；各组按截止时间、`scheduledAt`、`createdAt`、`id` 依次稳定排序，无截止时间的“未分布”任务按 `updatedAt`、`createdAt`、`id` 稳定排序。
- `getTasksForTimeline(tasks, now)`：保留有 `scheduledAt` 且位于 `[startOfToday, startOfToday + 7 days)` 的任务，包含已完成任务；按排期时间排序。

取消任务不进入待安排列表，但仍可在资产库任务总览中按未完成组查看；它不会伪装成可排期任务。

### 2. 状态与排期写入

- `updateTaskStatus` 只修改 API 的 `status` 字段，保留当前 `scheduledAt`、`dueAt` 和其他排期字段。
- `scheduleTask`/`scheduleTaskToDay` 只设置排期并保持现有状态（新任务默认 `TODO`）。
- `unscheduleTask` 显式清除 `scheduledAt`，但不把 `DONE` 重新变成未完成。
- Dashboard 和 Timeline 的拖拽事件都 `await` Store 写入；失败时重新加载本地任务快照、清除拖拽态并显示可读错误通知。

### 3. 首页时间轴布局

- 将 Dashboard 三栏改为以可用内容宽度为基准的可收缩布局，分隔条和 gap 不再额外挤出百分比宽度。
- 右侧面板设置 `min-width: 0; min-height: 0`，时间轴滚动区设置 `flex: 1; min-height: 0; overflow-y: auto`。
- 保留用户拖拽调整栏宽的能力，但动态宽度始终受最小宽度和总可用宽度约束。
- 日视图显示当前选中日的时间槽；周视图显示当前 7 天窗口内的排期任务；已完成任务使用降低对比度和完成标记，仍可点击查看。

### 4. 资产库任务分组

- “全部任务”节点下显示三个并列分组：`未分布`、`未完成`、`已完成`。
- 同时没有截止时间和排期的任务只进入`未分布`；其余分组内部按截止时间升序，缺少截止时间的任务排在末尾。
- 学科任务目录沿用真实 Task Store 数据，不注入静态演示任务；学科目录可按同一完成/截止时间规则展示。

## 错误和空状态

- 加载任务失败时沿用 Task Store 的离线缓存；没有缓存时显示可重试的空状态，不注入示例任务。
- 拖拽、完成、移出排期失败时保留服务端/本地原值，显示错误通知，并允许再次操作。
- 当前 7 天没有排期时显示“本周暂无排期”，不显示虚构任务。

## 测试与验收

- 增加纯函数任务视图规则测试：未分布优先分组、完成分组、截止时间排序、无截止时间置底、7 天窗口边界、已完成排期保留。
- 增加 Store 状态更新测试或静态契约，确认完成不清除 `scheduledAt`，显式移出排期才清除。
- 增加 Dashboard 布局/时间轴静态契约，确认可用宽度约束、滚动容器和 7 天过滤存在。
- 更新资产库回归测试，确认完成分组和截止时间排序来自 Task Store，且无旧演示任务。
- 运行 PC 回归测试、type-check、PC 静态检查、学科契约检查和 Web build；浏览器中的首页尺寸、拖拽、完成和资产排序仍单独人工验收。

## 非目标

- 不修改后端 Task API、数据库结构或状态枚举。
- 不把超出 7 天的排期删除或自动改期。
- 不恢复旧 Dashboard、旧路由或历史演示数据。
