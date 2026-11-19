> [!WARNING]
> 本目录保存已被替代的方案与历史迁移矩阵，仅供追溯，不作为当前实现、契约、配置或任务依据。

# 2026-11-15 已替代文档归档

更新时间：2026-11-15

文档状态：历史归档

权威范围：被替代文档的来源、现行入口与原文保全信息

事实来源：迁移前工作树原文，包含当时尚未提交的修改

## 文档与现行入口

| 历史文档 | 原始位置 | 现行入口 |
| --- | --- | --- |
| [Chat 可视化教学旧计划](2026-10-29-chat-agent-visual-teaching.md) | `docs/plans/2026-10-29-chat-agent-visual-teaching.md` | [Display Tool 方案](../plans/ai/2026-10-31-chat-display-tools.md)、[Chat 契约](../../../contracts/chat-runtime-api.md) |
| [Overview 动态窗口设计](2026-11-10-overview-dynamic-window-refactor.md) | `docs/plans/2026-11-10-overview-dynamic-window-refactor.md` | [Markdown 替换方案](../plans/overview/2026-11-12-overview-markdown-replacement.md)、[后端模块](../../../modules/Backend.md) |
| [Overview 动态窗口分批实施](2026-11-10-overview-dynamic-window-implementation.md) | `docs/plans/2026-11-10-overview-dynamic-window-implementation.md` | [Markdown 替换方案](../plans/overview/2026-11-12-overview-markdown-replacement.md)、[API](../../../contracts/API.md) |
| [阶段对象迁移矩阵](ObjectModelMatrix.md) | `docs/contracts/ObjectModelMatrix.md` | [API](../../../contracts/API.md)、[数据库契约](../../../contracts/Database.md)、[Mobile / Tablet 模块](../../../modules/FrontendMobileTablet.md) |
| [PC / Service 功能审计](2026-10-07-pc-service-function-audit.md) | `docs/current/2026-10-07-pc-service-function-audit.md` | [当前状态](../../../current/Status.md)、[未关闭问题](../../../current/IssuesAndReview.md) |

三份方案在迁移前已明确声明被后续方案替代。对象矩阵保留绿地迁移时期的旧模型、目标模型和阶段判断，其字段与迁移状态不再作为当前契约。当前验收与未关闭风险见 [Status](../../../current/Status.md) 和 [IssuesAndReview](../../../current/IssuesAndReview.md)；归档不代表自动关闭验收项。

10-07 功能审计保留当时修复与未处理项。尚未明确接续结论的 O1、O2、O5、O8、O6/O7 已在现行问题清单保留为历史待核实项，不能按旧报告直接认定当前仍有缺陷。

## 原文校验

每份副本在 `<!-- ORIGINAL WORKTREE CONTENT -->` 标记后的原始字节保持不变；下表 SHA-256 不包含新增警告和标记行。原文相对链接按上表原始位置解释；历史正文中的路径、命令和状态未现代化改写。

| 文件 | 原文 SHA-256 |
| --- | --- |
| `2026-10-29-chat-agent-visual-teaching.md` | `D25126178812026C109946E129892BCD8034E41F088F7514D53699708E7B3C38` |
| `2026-11-10-overview-dynamic-window-refactor.md` | `AE74CC5EDC2EA3D678B8E34763C825EB172F67DFB138559FD110B02D07D52CD6` |
| `2026-11-10-overview-dynamic-window-implementation.md` | `995D1C290DB270678E6B5CE0D82171052C09DDFFECAE5E3F95C7E41AE4CAB30F` |
| `ObjectModelMatrix.md` | `4EC157434EA637E2509EC7BEC9DA55B8EB0DC138A1134731800B1D3AA054187F` |
| `2026-10-07-pc-service-function-audit.md` | `55B37E4DD3B1E43748A4488876F58AF766D6A40A44771533B41C3479BFA9AFF4` |
