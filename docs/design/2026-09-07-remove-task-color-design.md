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

## 验证设计

- Server clean schema 和 V20 → V21 upgrade 后均不存在 `tasks.color_override`。
- V21 测试证明 TASK `change_log.payload`/`inbound_mutations.current_payload` 只删除 `colorOverride`/`color`，保留其余字段、cursor、version、decision 和记录数；非 Task 同名键保留。
- Task Controller、Service、Repository、Sync 和 OpenAPI 测试均证明 Task 不再接受或输出 `colorOverride`。
- PC/Mobile 本地迁移测试保证任务和 pending mutation 保留，颜色键/列消失。
- 页面静态测试禁止 Timeline、Dashboard、Home、Asset、SubjectWorkspace 和 Mobile/Tablet 任务组件读取 `task.color`或 `slot.task.color`。
- 定向扫描必须按 Task 语义分类 `colorOverride`、`task.color`、Task 表 `color`；KnowledgeBlock 与语义样式中的颜色不得误删。
- 运行 Server 定向/完整测试、OpenAPI 漂移门禁、PC type-check/R4、Mobile type-check/静态/协议测试和 `git diff --check`。现有无关失败与本轮回归分开报告。
- 自动测试不替代真实 PostgreSQL 升级、PC/Tauri GUI、Mobile H5、微信开发者工具和 Tablet 真机验收。

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
