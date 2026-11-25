# Task Cognitive Load 全栈移除设计

更新时间：2026-09-07

文档状态：已批准设计，待实施

权威范围：Task 认知负荷字段从服务端数据库、API、同步、本地副本、PC、Mobile、Tablet 与界面的破坏性移除

## 背景与目标

当前 Task 将 `cognitiveLoad` 作为 `LOW`、`MEDIUM`、`HIGH` 稳定字段保存到服务端数据库并通过 REST、同步和生成 SDK 下发。PC 与 Mobile 又保留 `load`、`loadText` 等展示兼容字段，时间线及若干任务创建入口仍生成或显示负荷信息。

本次目标是全栈删除 Task 认知负荷能力。完成后，任务只保留标题、说明、状态、预计时长、排期、截止时间、排序和可选颜色覆盖等现行属性；任何页面均不再选择、生成、显示或建议使用认知负荷。

## 范围

- 删除服务端 `CognitiveLoad` 枚举，以及 Task command、view、DTO、entity、service、repository 映射和测试中的对应参数。
- 从 Task REST 请求/响应、Sync push/pull/snapshot payload、运行时 OpenAPI 及 PC/Mobile 生成 SDK 中删除 `cognitiveLoad`。
- 新增追加式 Flyway 迁移，删除 `tasks.cognitive_load` 列及其检查约束；迁移同时清理 Task 历史同步 payload 中的 `cognitiveLoad` 键。
- 删除 PC 的 `CognitiveLoad`、`TaskLoad`、`load`、`loadText`、转换/默认值和所有任务创建或展示依赖。
- 删除 Mobile/Tablet 的 `load`、`loadText`、同步转换、本地数据库列/读写、表单、标签、样式和负荷建议文案。
- 清理 PC/Mobile 本地资源副本与待同步 mutation 中的废弃负荷键，同时保留任务及其他字段。
- 更新自动测试、权威文档、状态、风险和发布记录。

## 不在范围内

- 不删除任务的 `durationMinutes`、预计用时选择、排期、截止时间、状态或排序。
- 不修改 KnowledgeBlock 难度、复习算法 difficulty、统计图颜色或 Task/KnowledgeBlock 的 `colorOverride`。
- 不借本次变更重构时间轴拖放、双任务换位、逾期转换或文档处理功能。

## 服务端与数据库设计

服务端 Task 领域对象不再声明认知负荷。创建和更新请求无需默认值，响应和同步视图也不再输出该字段。删除字段后不得保留空枚举、占位 getter、常量默认值或只为旧客户端服务的转换分支。

数据库使用下一项追加式 Flyway 版本迁移，不编辑已经发布的 `V2__core_domain_schema.sql`。迁移应先移除 `ck_tasks_cognitive_load`，再删除 `tasks.cognitive_load`。已有列值永久丢弃，不提供回滚恢复。

`change_log.payload` 与 `inbound_mutations.current_payload` 是 TEXT JSON，可能保留历史 Task 字段。迁移必须仅针对 `resource_type = 'TASK'` 的有效 JSON 对象删除 `cognitiveLoad`，不删除整条同步历史、不改变 cursor、版本、幂等 decision 或其他资源。若跨 PostgreSQL/H2 的 SQL JSON 能力不足，应使用版本化 Java migration 做有界解析和重写，并以 clean/upgrade 测试覆盖。

## 客户端与本地数据设计

PC 的规范 Task 模型和展示模型都删除认知负荷字段。旧 `load/loadText` 不再映射为领域值；任务创建入口只提交仍存在的字段。Timeline、Dashboard、Home、SubjectWorkspace 及测试 fixture 中的脑图标、负荷标签和相关 CSS 一并移除。

PC 本地 `local_resource_records`、`local_mutations.payload` 和 `remote_payload` 中的 Task JSON 在本地 schema 升级时删除 `cognitiveLoad`、`load`、`loadText`，保留 mutation ID、状态、baseVersion 和其余 payload。浏览器 fallback 使用相同的纯转换规则，确保离线待提交任务不因字段删除而整体丢失。

Mobile/Tablet 的 Task 类型、表单和同步映射删除 `load/loadText/cognitiveLoad`。原生 SQLite 的旧 `task_blocks` 表通过可验证的迁移重建为不含负荷列的表；H5 scoped storage 在读取升级时重写任务对象和 TASK mutation payload。不得通过固定“中负荷”继续写入废弃字段。

## 切换与兼容策略

这是破坏性契约切换，不提供旧客户端兼容窗口。服务端、冻结 OpenAPI 和目标客户端必须作为同一发布批次升级。旧客户端发送的 `cognitiveLoad` 不属于现行契约，不能依赖保存或回显。

升级保留任务本身和非负荷字段，但已有认知负荷值不可恢复。历史本地副本和待同步 mutation 只剥离废弃键；不得清空整个任务表、整个 mutation 队列或用户其他数据。同步 cursor 不因该字段删除重置。

## 验证设计

- 服务端 clean schema 与从当前最高版本升级后均不存在 `tasks.cognitive_load` 和对应约束。
- Task Controller、Service、Repository、Sync push/pull/snapshot 和 OpenAPI 测试均证明请求/响应与 payload 不含 `cognitiveLoad`。
- 历史 TASK `change_log`、`inbound_mutations.current_payload` 升级后只移除目标键，其他字段、版本、cursor 与记录数保持不变。
- PC/Mobile 生成 SDK 与生产源码定向扫描不再出现 `cognitiveLoad`、`loadText`、Task `load` 或认知负荷文案；非任务同名技术用语需人工分类，避免误删。
- PC 与 Mobile 本地升级测试证明任务、pending mutation 和其他字段保留，废弃键消失。
- 运行后端定向/完整测试、OpenAPI 漂移检查、PC/Mobile 类型检查与聚焦页面/Store 测试；构建通过不替代桌面 GUI、浏览器、微信和真机验收。

## 风险与控制

- **工作树冲突：** 当前仓库存在大量用户未提交修改。Antigravity 在隔离 worktree 基于当前 HEAD 实施，收集后必须逐文件审查并适配到当前工作树，禁止覆盖同文件中的用户修改。
- **同步残留：** 只删实体列会让旧 change log 继续下发字段，因此数据库升级测试必须包含历史同步 JSON。
- **离线数据损失：** 禁止通过清空本地表解决 schema 差异；迁移只剥离目标键并断言其他字段不变。
- **误删同名概念：** `load` 也可表示加载动作或系统负载。自动扫描结果必须按 Task 认知负荷语义分类，不能机械删除所有 `load` 文本。
- **原生迁移差异：** Mobile SQLite、H5 storage、PC Tauri SQLite 与浏览器 fallback 必须分别有证据；单一 TypeScript 测试不能替代真实端升级验收。

## 完成条件

1. 当前数据库、运行时 API、同步 payload、冻结 OpenAPI、生成 SDK 和两端生产代码均无 Task 认知负荷字段。
2. 现有任务与离线待同步操作在升级时保留，只有认知负荷值被删除。
3. 必要自动测试和静态门禁通过；失败项必须明确区分本次回归与既有问题。
4. API、Database、Frontend、PC、Mobile/Tablet、Backend、Status、IssuesAndReview 和 Changelog 已同步。
5. GUI、微信开发者工具和真机未执行时明确列为人工验收，不得写成业务验收通过。
