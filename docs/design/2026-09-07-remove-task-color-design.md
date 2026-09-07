# Task 颜色能力全栈移除设计

更新时间：2026-09-07

文档状态：已批准设计，待实施

权威范围：Task 颜色字段从服务端数据库、API、同步、PC、Mobile、Tablet、端侧本地数据与所有任务界面的破坏性移除

## 背景与决策

Subject 专属颜色已在 V19 移除，但 Task 仍保留独立 `colorOverride`。PC 将该字段映射为展示层 `color`，Mobile/Tablet 也在 Task Store、本地 `task_blocks` 和同步转换中保留 `color`。因此，旧任务的自定义颜色仍会进入 Timeline、Dashboard、待办列表和任务编辑界面。

本次决策是全栈删除 Task 颜色能力，而不是只覆盖时间轴样式。实施后 Task 不再存储、传输、同步、缓存、选择或显示个性颜色；任务界面使用全局 Sage 与现有语义设计令牌。

本设计仅就 Task 颜色取代《Task 认知负荷全栈移除设计》中“保留 Task `colorOverride`”的旧范围边界；其余已批准内容不变。

## 范围

- 删除 Server Task command、view、DTO、entity、service 和 repository 映射中的 `colorOverride`。
- 从 Task REST 请求/响应、Sync push/pull/snapshot payload、运行时 OpenAPI、冻结 artifact 与 PC/Mobile 生成 SDK 删除 `colorOverride`。
- 新增 V21 追加式 Flyway 迁移，删除 `tasks.color_override`，并清理 Task 历史同步 JSON 中的 `colorOverride` 及旧展示键 `color`。
- 删除 PC Task 规范模型、展示模型、Store、映射、本地投影、待同步 mutation、创建/编辑入口和任务页面中的任务颜色。
- 删除 Mobile/Tablet Task 类型、Store、同步映射、原生 SQLite/H5 存储、创建入口和所有任务界面中的任务颜色。
- 清理历史 PC/Mobile 本地 Task 记录和待同步 payload 中的 `colorOverride`/Task `color`，保留任务及其余字段。
- 更新自动测试、权威契约、模块文档、状态、风险和发布记录。

## 明确保留

- KnowledgeBlock 的 `colorOverride`、数据库列、API 字段、本地映射和页面能力。
- 图表色板、文档/文件类型颜色、AI 消息样式和非 Task 资源的颜色字段。
- 全局 Sage 主题、选中态、当前时间、完成/错误/警告等语义颜色。颜色不得成为唯一状态信号。
- Task 的标题、描述、状态、时长、排期、截止时间、排序、Subject 归属、完成时间、版本和墓碑语义。
- Timeline 的拖放、任务换位、过去时段保护、已完成排期固定和到期转换逻辑。

## Server 与数据库

Task 的创建、更新和视图不再声明 `colorOverride`，也不保留空 getter、默认颜色、兼容参数或隐式回显。Task 同步快照和 change log 由同一 Task view 边界产生，因此新数据不得再含颜色键。

V21 必须是追加迁移，不编辑 V2 或已发布版本。迁移顺序为：

1. 仅选择 `resource_type = 'TASK'` 的 `change_log.payload` 和非空 `inbound_mutations.current_payload`。
2. 对有效 JSON object 删除 `colorOverride` 与旧展示键 `color`；非 Task 同名键保留。
3. 保留记录 ID、resource ID、mutation decision、version、cursor、业务字段与记录数。遇到非法 Task JSON 时迁移必须显式失败，禁止静默丢整条历史。
4. 删除 `tasks.color_override`。

继续采用 Java Flyway migration，避免 PostgreSQL/H2 JSON 函数差异。测试同时覆盖 clean schema 和 V20 升级到 V21。

## PC 客户端与本地数据

PC 的 `TaskModel`、Task DTO-like 类型、展示 Task 和写入参数删除 `colorOverride` 与 Task `color`。`mapTaskView`、`toTaskModel`、`toPresentationTask`、API payload 和本地 repository 不再创建默认颜色或传透旧值。

Timeline、Dashboard、Home、Asset、SubjectWorkspace、TaskSelectSheet 及其它任务界面不再读取 `task.color`。任务卡片、标签、左边框、待办色条、时长文字和完成控件使用 CSS class 与现有全局设计令牌，不用行内伪装的固定任务颜色字段。

PC 规范本地表的 TASK `payload`、pending mutation `payload`、`remote_payload` 在 schema 升级时只剔除 `colorOverride` 和 Task `color`。浏览器 fallback 使用同一纯函数。旧 `task_blocks` 若作可恢复备份保留，不得再被当作现行业务模型读写。

## Mobile/Tablet 客户端与本地数据

Mobile Task 类型、Store 入参、Sync 转换与远端应用分支删除 `color`、`colorOverride`。所有创建任务入口不再提交固定 `#7D9372` 作为数据字段；Sage 只存在于样式层。

原生 SQLite 通过“创建无 `color` 列的临时表、复制明确列、替换旧表”的事务化迁移重建 `task_blocks`；迁移必须保留任务行、同步状态、版本、位置和 Subject 归属。H5 scoped storage 在启动迁移时重写 Task 对象，删除 `color`/`colorOverride`。两种存储的 TASK local mutation payload 同样只删颜色键。

Mobile Timeline、Tablet Dashboard、TaskSelectSheet、Home 及其它任务卡片统一使用样式层主题/语义色。KnowledgeBlock 的颜色映射不受影响，不能因同名 `colorOverride` 而机械删除。

## 切换与数据损失边界

这是破坏性契约切换，不提供旧客户端颜色兼容窗口。Server、冻结 OpenAPI、PC 和 Mobile/Tablet 必须同批升级。旧客户端发送的 Task `colorOverride` 不属于现行契约，不能依赖服务端保存或回显。

旧 Task 自定义颜色值在 Server 和端侧迁移后不可恢复。迁移保留任务本身、关联、排期、版本、墓碑和待同步操作；禁止以清空整表、删除整个 mutation 或重置 cursor 的方式实施。

## 契约变化对照

| 边界 | 切换前 | 切换后 | 不受影响 |
| --- | --- | --- | --- |
| Task Create/Update | 可选 `colorOverride` | 无颜色字段 | `subjectId`、时长、排期、截止时间、排序 |
| Task View/List | 响应可含 `colorOverride` | 响应不存在该字段 | 版本、时间戳、墓碑 |
| Sync TASK payload | 可含 `colorOverride` 或端侧旧 `color` | 新 payload 不产生，历史 payload 由迁移剔除 | 非 TASK payload 中同名键 |
| Server DB | `tasks.color_override VARCHAR(32)` | V21 后无该列 | `knowledge_blocks.color_override` |
| PC Task 投影 | `TaskModel.colorOverride` + `Task.color` | 两者均删除 | KnowledgeBlock 展示 `color` |
| Mobile Task 投影 | `Task.color` | 删除 | Block/Chart 颜色 |
| UI | 任务数据决定卡片色 | CSS 主题/语义令牌 | 状态色与可访问性信号 |

Task 请求中出现未声明的 `colorOverride` 时，行为遵循当前 Jackson/Spring 对未知字段的全局策略；本次不为旧颜色字段新增特殊兼容或拒绝分支。OpenAPI 是客户端唯一契约依据。

## 预期修改清单

### Server、迁移与契约

| 文件/区域 | 精确操作 |
| --- | --- |
| `Auralis-Server/src/main/java/com/auralis/app/task/TaskCommand.java` | 从 command record 删除 `colorOverride` |
| `TaskDtos.java` | 删除 create/update 请求、response 字段与转换参数 |
| `TaskView.java` | 删除 Task view 颜色字段 |
| `TaskService.java` | 更新 Entity 构造/更新调用，不传颜色 |
| `task/internal/persistence/TaskEntity.java` | 删除 JPA 列、字段、参数、getter 和更新赋值 |
| `db/migration/V21__remove_task_color.java` | 先清理 TASK JSON，后删除 `tasks.color_override` |
| `docs/contracts/openapi/auralis-openapi.json` | 仅删除 TaskCreateRequest/TaskUpdateRequest/TaskView 的颜色属性 |
| PC/Mobile `src/api/generated/schema.ts` | 从冻结 artifact 机械生成；拒绝无关 WebSocket/JsonNode 漂移 |
| `docs/contracts/API.md` / `Database.md` / `ObjectModelMatrix.md` | 更新现行 Task 字段、V21 和端侧边界 |

Server 测试中所有 `new TaskEntity(...)`、Task request JSON、Task response 断言和 repository fixture 都需按新参数顺序更新；禁止为了快速编译而传 `null` 占位。

### PC

| 文件/区域 | 精确操作 |
| --- | --- |
| `src/services/domainMappers.ts` | 只从 TaskModel/TaskDtoLike/mapTaskView 删除 `colorOverride`；保留 KnowledgeBlock 的同名字段 |
| `src/store/useTaskStore.ts` | 删除 Task 领域/展示/写入类型中的 `colorOverride`/`color`，并移除默认 `#7D9372` 数据值 |
| `src/services/localSchema.ts` / `localRepository.ts` | 清理规范 TASK JSON 中的两个颜色键，保留 KnowledgeBlock payload |
| `src/services/localDb.ts` | 旧 Task facade 不再读写 `task_blocks.color`；其它资源颜色不变 |
| `src/views/Timeline/index.vue` | 移除周概览点、日/周卡片边框、标签、待办色条、时长文字对 `task.color` 的依赖 |
| `src/views/Dashboard/index.vue` | 移除日/周时间轴、待办色条及创建 payload 的任务颜色 |
| `src/views/Home/index.vue` | 移除时间轴卡片、标签、待办色条和创建 payload 颜色 |
| `src/components/schedule/ScheduleWeekView.vue` | 移除任务左边框的数据颜色绑定 |
| Asset/SubjectWorkspace/其它 `addTask` 调用 | 逐个检查并删除 Task `color`，不动 Block 创建颜色 |
| `scripts/r4-store-mapping.test.mjs` / `r4-dashboard-timeline.test.mjs` 及新定向测试 | 断言 Task 模型/页面不存在颜色，KnowledgeBlock 仍保留颜色 |

PC 页面中的 `SUBJECT_THEME_COLOR` 若只用于视觉样式可保留；若被写入 Task payload 必须删除。知识块创建使用的 `color` 是不同模型，必须保留。

### Mobile/Tablet

| 文件/区域 | 精确操作 |
| --- | --- |
| `src/store/useTaskStore.ts` | 删除 Task interface 的 `color` 及 add/update 传透 |
| `src/store/useSyncStore.ts` | TASK 分支不再映射 `payload.color ↔ colorOverride`；KnowledgeBlock 分支保留 |
| `src/services/localDb.ts` | 新表定义、读取、更新、插入、远端应用均移除 Task `color`；实施原生/H5 迁移 |
| `src/pages/mobile/home/index.vue` | 快速创建任务不再写入固定颜色 |
| `src/pages/mobile/timeline/index.vue` | 删除待排期/已排期卡片的 `task.color` 边框绑定 |
| `src/pages/tablet/dashboard/index.vue` | 删除任务边框、完成勾选框与快速创建的数据颜色 |
| `src/components/TaskSelectSheet.vue` | 删除任务颜色条的数据绑定，改用主题 class |
| Mobile 脚本与新本地迁移测试 | 阻止 Task 颜色重新进入 schema、Store、Sync 或页面 |

## V21 迁移算法与失败语义

V21 在 Flyway 单个迁移事务中执行。伪代码如下：

```text
for each change_log row where resource_type = 'TASK':
  parse payload as JSON object, otherwise fail migration with row id
  remove colorOverride and color
  update only when at least one key existed

for each inbound_mutations row where resource_type = 'TASK' and current_payload is not null:
  parse current_payload as JSON object, otherwise fail migration with row id
  remove colorOverride and color
  update only when at least one key existed

drop tasks.color_override if it exists
```

更新 JSON 时使用原记录 UUID 作精确条件，不用 `resource_id` 作唯一键。空 payload 按现有 V20 语义不改写；非空但非法/非 object JSON 使迁移失败并包含记录 ID，便于修复数据后重试。删列前完成 JSON 清理，保证新服务不会再向旧字段回流。

## 端侧迁移不变量

PC 和 Mobile 本地迁移都必须通过“迁移前总数 = 迁移后总数”与关键字段逐条断言。最少保留：

- Task ID、user/device scope、subjectId、title/name、description/desc、status、duration、scheduledAt/startTime、dueAt、sortKey/position、version/sync_version、sync_status、is_deleted。
- local mutation ID/client mutation ID、resource type、resource ID、mutation type/action、base version、重试/冲突状态、created time 与非颜色 payload 字段。
- 其它用户、其它资源、非 TASK mutation 与 KnowledgeBlock 颜色。

浏览器 fallback 与原生 SQLite 必须对同一 fixture 产生等价结果。遇到无法解析的本地 mutation payload 时不删除整条 mutation；保留原记录并记录有边界的警告，避免启动迁移造成额外数据损失。

## UI 统一规则

- 任务卡片的普通边框/强调线：使用已有 Sage accent 或 border token，不从 Task 数据计算。
- Subject 标签：使用中性 surface + text token，不用 Subject 或 Task 颜色。
- 完成任务：保留 check icon、文字/透明度或删除线；完成色是语义样式，不写入 Task。
- 过去任务：保留现有 `is-past` 形状/文字信号，不用颜色作唯一区分。
- 当前时间线、拖放目标、错误通知和选中状态保留现有语义色。
- 页面不得用 `:style="...task.color..."` 或拼接透明度的方式恢复动态颜色。

## Antigravity 分阶段交付点

Antigravity 的详细执行计划必须按以下顺序实施，每阶段先测试后代码，并在阶段结束提供 diff/命令证据：

1. 建立隔离 worktree 基线，记录 base commit、当前残留与工作树保护约束。
2. 先补 Server/OpenAPI/V21 失败测试，证明旧字段、列与 JSON 键尚存在。
3. 实施 Server Task 契约与 V21，运行迁移和 OpenAPI 定向测试。
4. 从 artifact 生成 PC/Mobile schema，对生成 diff 做白名单审查，不携带已知 WebSocket/JsonNode 漂移。
5. 先补 PC Store/本地迁移/页面失败测试，再移除 PC Task 颜色数据流与 UI 绑定。
6. 先补 Mobile Store/同步/原生/H5/页面失败测试，再实施 Mobile/Tablet 迁移和 UI 替换。
7. 运行全局残留扫描，对每个保留的 `colorOverride`/`color` 给出资源类型归因，修复 Task 漏网点。
8. 更新文档矩阵，运行定向与完整门禁，区分新回归、已有失败和未执行人工验收。
9. 交付按文件分类的补丁、测试结果、未解决风险和“禁止整包合并”提醒，等待主工作树人工回收。

## 验证设计

- Server clean schema 和 V20 → V21 upgrade 后均不存在 `tasks.color_override`。
- V21 测试证明 TASK `change_log.payload`/`inbound_mutations.current_payload` 只删除 `colorOverride`/`color`，保留其余字段、cursor、version、decision 和记录数；非 Task 同名键保留。
- Task Controller、Service、Repository、Sync 和 OpenAPI 测试均证明 Task 不再接受或输出 `colorOverride`。
- PC/Mobile 本地迁移测试保证任务和 pending mutation 保留，颜色键/列消失。
- 页面静态测试禁止 Timeline、Dashboard、Home、Asset、SubjectWorkspace 和 Mobile/Tablet 任务组件读取 `task.color`或 `slot.task.color`。
- 定向扫描必须按 Task 语义分类 `colorOverride`、`task.color`、Task 表 `color`；KnowledgeBlock 与语义样式中的颜色不得误删。
- 运行 Server 定向/完整测试、OpenAPI 漂移门禁、PC type-check/R4、Mobile type-check/静态/协议测试和 `git diff --check`。现有无关失败与本轮回归分开报告。
- 自动测试不替代真实 PostgreSQL 升级、PC/Tauri GUI、Mobile H5、微信开发者工具和 Tablet 真机验收。

计划中必须列出以下可直接执行的证据命令：

```powershell
cd Auralis-Server
.\mvnw.cmd "-Dtest=TaskColorRemovalMigrationTests,OpenApiArtifactTests,CoreDomainControllerTests,CoreDomainRepositoryTests" test
.\mvnw.cmd test

cd ..\Auralis-PC
npm.cmd run type-check
npm.cmd run test:r4-pc
npm.cmd run check:r4-pc

cd ..\Auralis-Mobile
npm.cmd run type-check
npm.cmd run check:r4-mobile
npm.cmd run test:r4-mobile

cd ..
.\scripts\check-openapi.ps1
git diff --check
```


## Antigravity 执行与工作树保护

Antigravity 必须在隔离 worktree 中基于明确 HEAD 执行，并获得分阶段、按文件列举的详细计划。不允许它修改主工作树、整包覆盖本地文件、全量 merge 分支或处理与 Task 颜色无关的已有变更。

回收时必须：

1. 首先审查 Antigravity diff 是否有换行、生成文件、WebSocket/JsonNode 或其它无关漂移。
2. 以当前主工作树为准，按文件/补丁手工合入；发生冲突时保留用户修改并重新实现目标语义。
3. 独立执行残留扫描、测试和文档矩阵；不以 Antigravity 的“完成”报告代替验证。

## 完成条件

1. 当前数据库、Task API、Sync payload、冻结 OpenAPI、生成 SDK、PC 与 Mobile/Tablet 生产代码均不再存在 Task 颜色字段或隐式默认颜色数据。
2. 所有任务界面不再依赖任务/学科动态颜色，只使用全局主题和语义样式；KnowledgeBlock 颜色能力保持不变。
3. 升级保留任务、同步历史、pending mutation 和其它字段，只有 Task 颜色值被不可逆删除。
4. 所需代码、测试、契约和文档已更新；任何失败均有归因和未关闭风险记录。
5. 真实数据库与 GUI/真机未验收时明确保留边界，不得写成业务验收通过。
