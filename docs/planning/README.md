# Auralis 计划目录

更新时间：2026-11-15

文档状态：现行计划入口

权威范围：计划的阅读顺序、职责边界与维护规则

事实来源：当前状态、问题登记、模块说明及本目录计划

## 从哪里开始

1. 先读[当前状态](../current/Status.md)与[问题和审查](../current/IssuesAndReview.md)，确定已有实现、最近证据和仍开放的问题。
2. 用[任务总览](Overview.md)选择工作范围；需要准备候选发布时，再用[部署测试前门禁](PreDeploymentReadinessTasks.md)核对证据。
3. 按领域查看下表；具体实施设计从[实施方案索引](../plans/README.md)进入。

历史 R0–R6 是可复用的验收分类，不要求从旧迁移任务重新执行。领域计划中的早期“当前事实”须先与当前模块核对；旧日期和未勾选任务都不能单独证明今天仍未实现。

## 文档分工

| 位置 | 维护内容 |
| --- | --- |
| `current/Status.md` | 当前实现摘要及带日期的验证边界 |
| `current/IssuesAndReview.md` | 开放风险、证据和关闭条件 |
| `planning/` | 任务依赖、验收门禁与后续路线 |
| `plans/` | 对应时期的详细实施方案和执行证据 |
| `release/Changelog.md` | 已发生且可确认的变化 |

## 按领域选择

| 领域 | 计划 | 当前事实入口 |
| --- | --- | --- |
| 后端与数据 | [后端核心](BackendCore.md) | [后端模块](../modules/Backend.md)、[API](../contracts/API.md)、[数据库](../contracts/Database.md) |
| PC | [PC 前端](FrontendPC.md) | [PC 模块](../modules/FrontendPC.md) |
| Mobile / Tablet | [Mobile / Tablet](FrontendMobileTablet.md) | [模块](../modules/FrontendMobileTablet.md)、[页面 API 映射](../contracts/MobilePagesAPIMap.md) |
| AI | [AI / RAG](AIRag.md) | [后端模块](../modules/Backend.md)、[Chat 协议](../contracts/chat-runtime-api.md) |
| 发布 | [基础设施与发布](InfraRelease.md) | [基础设施](../modules/Infrastructure.md)、[部署](../operations/Deployment.md)、[Runbook](../operations/Runbook.md) |
| 后续能力 | [Tablet 手写](TabletHandwritingNotes.md) | [Mobile / Tablet 模块](../modules/FrontendMobileTablet.md) |
| 文档 | [文档验收](DocsAcceptance.md) | [文档中心](../README.md) |

## 任务与完成记录

每项任务写明目标、当前证据、依赖、动作、验证、阻塞和完成定义。区分“未开始”“进行中”“阻塞”“实现待验收”与“已完成”；代码、构建、自动测试、真实联调和人工验收分别记录。

更新任务时核对当前实现，不恢复旧接口、旧字段或旧栈。完成项保留证据位置并移出近期待办；风险只有满足关闭条件才能关闭。完整过程放任务报告或 Changelog，计划入口不重复维护部署镜像与测试流水。

整理前原文见[历史快照](../archive/maintenance-2026-11-15/planning/README.md)，仅用于追溯。
