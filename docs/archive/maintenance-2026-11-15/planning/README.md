> [!WARNING]
> 本文保存 2026-11-15 整理前的工作树原文，仅供历史追溯，不作为当前实现、状态、接口或任务的依据。现行文档从 docs/README.md 进入。

<!-- ORIGINAL WORKTREE CONTENT -->
# Auralis 计划目录

更新时间：2026-10-28

文档状态：现行计划入口

权威范围：未来任务的阅读顺序、状态、依赖、验收证据和更新规则

事实来源：当前状态、风险登记与各领域计划

## 计划与状态的区别

- `current/Status.md`：当前已经存在什么、证据是什么。
- `current/IssuesAndReview.md`：未关闭风险与关闭条件。
- `planning/`：未来要做什么、依赖什么、如何验证。
- `release/Changelog.md`：已经发生且可确认的变化。

禁止把计划任务写成已验收，也禁止把完成历史继续作为待办。

## 阅读顺序

1. [部署测试前主任务清单](PreDeploymentReadinessTasks.md)
2. [任务总览](Overview.md)
3. [后端核心](BackendCore.md)
4. [PC](FrontendPC.md) 或 [Mobile / Tablet](FrontendMobileTablet.md)
5. [AI / RAG](AIRag.md)
6. [基础设施与发布](InfraRelease.md)
7. [Tablet 手写](TabletHandwritingNotes.md)
8. [文档验收](DocsAcceptance.md)

2026-07-10 的文档重构执行计划已移入[维护历史](../archive/maintenance/2026-07-10-documentation-reorganization.md)，不再列为现行待办。

## 任务字段

| 字段 | 含义 |
| --- | --- |
| 目标 | 该计划解决的可验收问题 |
| 当前事实 | 已确认代码/配置，不是猜测 |
| 前置条件 | 不满足时不能安全开始的依赖 |
| 任务 | 可独立检查的动作 |
| 验证 | 必须实际执行或人工记录的证据 |
| 阻塞 | 外部配置、设备、决策或依赖 |
| 完成定义 | 可以从计划移到 Changelog 的条件 |

## 计划状态

| 状态 | 定义 |
| --- | --- |
| 未开始 | 尚未产生实现或验证工作 |
| 进行中 | 有实现/验证进行，但完成定义未满足 |
| 阻塞 | 等待外部条件或明确决策 |
| 已完成待验收 | 实现存在，仍缺必要证据 |
| 已完成 | 完成定义和证据满足，已移入 Changelog |

## 更新规则

- 修改计划前先检查当前状态和风险，避免重复任务。
- 每项任务必须引用权威模块/契约路径。
- 用户新要求优先于旧计划；变更后更新受影响计划和状态。
- 计划完成后删除或标记完成，并把确认变化写入 Changelog。
- 计划不替代测试、构建和人工验收记录。
