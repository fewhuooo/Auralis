# StudyCore Agent Instructions

本仓库的现行文档入口是 `docs/README.md`。

任何 Agent 在修改代码前必须先阅读：

1. `docs/AgentBeforeCoding.md`
2. `docs/StatusIndex.md`
3. `docs/CurrentIssuesAndReview.md`
4. 本次改动对应的模块文档

模块文档：

- PC 前端：`docs/FrontendPC.md`
- Mobile / Tablet：`docs/FrontendMobileTablet.md`
- 后端：`docs/Backend.md`
- 基础设施：`docs/InfrastructureAndData.md`
- API：`docs/APIManifest.md`
- 数据库：`docs/DatabaseDesign.md`

代码修改后必须同步更新相关文档：

- 接口变化更新 `docs/APIManifest.md`
- 数据结构变化更新 `docs/DatabaseDesign.md`
- 状态或风险变化更新 `docs/StatusIndex.md` 和 `docs/CurrentIssuesAndReview.md`
- 发布相关变化更新 `docs/Changelog.md`
