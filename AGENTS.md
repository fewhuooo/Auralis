# Auralis Agent Instructions

本文件就是仓库根目录的 Agent 指令入口，文件名为 `AGENTS.md`；当前没有另行维护的 `agent.md`。

本仓库的唯一现行文档入口是 `docs/README.md`。

## 修改前必须阅读

任何开发者或编码 Agent 在修改代码、配置或文档前，必须按顺序阅读：

1. `docs/agent/BeforeCoding.md`
2. `docs/current/Status.md`
3. `docs/current/IssuesAndReview.md`
4. 本次任务对应的模块文档：
   - PC：`docs/modules/FrontendPC.md`
   - Mobile / Tablet：`docs/modules/FrontendMobileTablet.md`
   - 后端：`docs/modules/Backend.md`
   - 基础设施：`docs/modules/Infrastructure.md`
5. 涉及接口时：`docs/contracts/API.md`
6. 涉及数据结构或同步字段时：`docs/contracts/Database.md`

## 强制规则

- 必须先检查当前实现，禁止依据历史归档恢复旧页面、旧路由、旧接口、旧配置或 StudyCore 命名。
- 必须保护现有工作树，禁止覆盖、还原或丢弃用户未提交修改。
- 禁止把代码存在、构建通过、自动测试通过和业务验收通过写成同一状态。
- 禁止把 `docs/archive/` 或 `docs/showcase/` 作为当前工程事实或任务依据。
- 接口变化必须同步 `docs/contracts/API.md`。
- 数据结构变化必须同步 `docs/contracts/Database.md`。
- 页面、路由、Store 或模块边界变化必须同步对应模块文档；交互或视觉变化同步 `docs/design/Frontend.md`。
- 状态或风险变化必须同步 `docs/current/Status.md` 和 `docs/current/IssuesAndReview.md`。
- 发布相关变化必须同步 `docs/release/Changelog.md`。
- 新增现行文档必须登记到 `docs/README.md`，且不得直接放在 `docs/` 根目录。

完整流程、证据格式、回写矩阵与交接模板以 `docs/agent/BeforeCoding.md` 为准。
