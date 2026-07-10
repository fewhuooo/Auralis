> [!WARNING]
> 本文档为历史归档，仅用于追溯需求、设计与项目演进。它不是 Auralis 当前实现、状态、接口或任务的依据。开发者与 AI Agent 禁止依据本文恢复旧实现、判断当前完成度或创建当前任务；请从 `docs/README.md` 进入现行文档体系。

# 开发计划入口

更新时间：2026-07-08

当前开发计划已经从单一总表拆分到 `docs/plans/`，按领域分别维护，便于逐项推进和逐项验收。

当前 Tablet 手写笔记专项代码已保留在分支中，但入口默认通过 `VITE_TABLET_HANDWRITING_NOTES_ENABLED` 关闭；待前后端主流程完成后再回到 `PlanTabletHandwritingNotes.md` 继续验收和完善。

## 计划入口

- `docs/plans/PlanOverview.md`
- `docs/plans/PlanFrontendPC.md`
- `docs/plans/PlanFrontendMobileTablet.md`
- `docs/plans/PlanTabletHandwritingNotes.md`
- `docs/plans/PlanBackendCore.md`
- `docs/plans/PlanAIRag.md`
- `docs/plans/PlanInfraRelease.md`
- `docs/plans/PlanDocsAcceptance.md`

## 使用方式

1. 先看 `PlanOverview.md`。
2. 再看本次改动对应领域计划。
3. 结合 `StatusIndex.md` 和 `CurrentIssuesAndReview.md` 判断优先级。
4. 改动完成后同步回写状态和计划。
