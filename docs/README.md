# Auralis 文档中心

更新时间：2026-11-16

文档状态：现行

权威范围：现行文档的唯一入口、目录职责、状态词典与维护边界

事实来源：当前仓库结构、`AGENTS.md` 与各分类权威文档

## 从这里开始

| 你要了解什么 | 入口 |
| --- | --- |
| 项目定位与目录 | [项目总览](project/Overview.md) · [仓库首页](../README.md) |
| 当前进度与验证结果 | [当前状态](current/Status.md) |
| 已知问题与关闭条件 | [问题和审查](current/IssuesAndReview.md) |
| 工作优先级与发布前门禁 | [路线规划与门禁](current/RoadmapAndGates.md) |
| 修改前的规则与提交规范 | [AGENTS.md](../AGENTS.md)（硬性红线与纪律）· [编码前协议](agent/BeforeCoding.md)（矩阵、检查清单与交接模板） |
| 配置、部署与恢复 | [部署指南](operations/Deployment.md) · [排障手册](operations/Runbook.md) |
| 使用客户端 | [用户手册](project/UserManual.md) |

开始修改前按编码前协议阅读状态、问题和对应模块，检查工作树并保护已有修改。源码存在、自动测试通过、运行健康和业务验收分别判断，当前完成度以 `current/` 的证据与限制为准。

## 开发与契约

| 领域 | 实现与设计 | 契约 |
| --- | --- | --- |
| PC / Tauri | [PC 模块](modules/FrontendPC.md) · [PC 开发入口](../Auralis-PC/README.md) · [前端设计](project/FrontendDesign.md) | [API](contracts/API.md) · [数据库](contracts/Database.md) |
| Mobile / Tablet | [移动端模块](modules/FrontendMobileTablet.md)（含页面 API 映射）· [前端设计](project/FrontendDesign.md) | [API](contracts/API.md) · [数据库](contracts/Database.md) |
| Server | [后端模块](modules/Backend.md) | [API](contracts/API.md) · [Chat Runtime](contracts/chat-runtime-api.md) · [数据库](contracts/Database.md) |
| 基础设施 | [基础设施模块](modules/Infrastructure.md) · [部署指南](operations/Deployment.md) | 当前 Compose、环境示例与应用配置 |

[冻结 OpenAPI](contracts/openapi/auralis-openapi.json)用于契约检查和生成类型；生成成功不代表全部调用端已完成接入。

## 产品、操作与交付

| 类别 | 入口 |
| --- | --- |
| 产品与架构 | [产品需求](project/ProductRequirements.md) · [系统架构](project/Architecture.md) · [前端设计](project/FrontendDesign.md) · [用户手册](project/UserManual.md) |
| 部署、排障与测试数据 | [部署指南](operations/Deployment.md) · [排障手册](operations/Runbook.md) · [测试账号与数据准备](operations/TestAccountDataResetAndSeed.md) |
| 变更历史 | [变更记录](operations/Changelog.md) |

## 目录职责与状态词典

| 目录 | 维护内容 | 现行文档 |
| --- | --- | --- |
| `agent/` | 必读/验证/回写矩阵、Git 提交清单与证据/交接模板（硬性红线见根目录 `AGENTS.md`） | [BeforeCoding.md](agent/BeforeCoding.md) |
| `project/` | 项目定位、产品需求、系统架构、前端设计与用户手册 | [Overview](project/Overview.md) · [ProductRequirements](project/ProductRequirements.md) · [Architecture](project/Architecture.md) · [FrontendDesign](project/FrontendDesign.md) · [UserManual](project/UserManual.md) |
| `current/` | 当前状态、开放问题、工作优先级、领域收口清单与 R0–R6 门禁 | [Status](current/Status.md) · [IssuesAndReview](current/IssuesAndReview.md) · [RoadmapAndGates](current/RoadmapAndGates.md) |
| `modules/` | 各端与后端模块的实现结构、页面/API 边界、命令与限制 | [FrontendPC](modules/FrontendPC.md) · [FrontendMobileTablet](modules/FrontendMobileTablet.md) · [Backend](modules/Backend.md) · [Infrastructure](modules/Infrastructure.md) |
| `contracts/` | HTTP/SSE/Sync/Realtime 接口、Chat Runtime 与双端数据契约 | [API](contracts/API.md) · [chat-runtime-api](contracts/chat-runtime-api.md) · [Database](contracts/Database.md) |
| `operations/` | 可重复执行的部署、诊断、恢复、种子准备与已发生变更记录 | [Deployment](operations/Deployment.md) · [Runbook](operations/Runbook.md) · [TestAccountDataResetAndSeed](operations/TestAccountDataResetAndSeed.md) · [Changelog](operations/Changelog.md) |
| `archive/` | 历史设计方案、整理快照、实验数据、早期需求与展示材料（非现行事实依据） | [归档总入口](archive/README.md) |

| 状态词 | 判定标准 |
| --- | --- |
| 已验收 | 有构建、测试、联调或人工验收证据，且满足该条目的完成定义 |
| 已构建待验收 | 代码或页面存在，但缺少足够测试、联调或人工验收证据 |
| 进行中 | 部分实现存在，主流程、测试或文档尚未闭环 |
| 计划中 | 仅有需求、设计或任务，尚未开始实现 |
| 已隐藏保留 | 实现仍在仓库，但入口由 feature flag 或路由配置关闭 |
| 阻塞 | 依赖外部配置、资源、设备、权限或产品决策，当前无法继续验证 |

每类事实在所属权威文档维护，其他位置使用摘要和链接。除本页外，所有现行文档必须位于上述 6 个分类目录并可从本页直接到达；接口、数据、实现与状态变化按[编码前协议](agent/BeforeCoding.md)回写。

## 历史归档

- [历史归档总入口](archive/README.md)：归档分类、使用限制与历史保真说明。
- [设计与实施方案归档](archive/design-and-plans/README.md)：原 `design/`、`plans/` 专题设计与单次实施计划，以及[2026-11-15 已替代方案](archive/design-and-plans/superseded-2026-11-15/README.md)。
- 历史快照：`archive/snapshots/`（含 2026-07-10 重构前镜像与架构文档、[2026-11-13 状态整理](archive/snapshots/maintenance-2026-11-13/README.md)、[2026-11-15 运维与计划整合](archive/snapshots/maintenance-2026-11-15/README.md)、阶段记录与早期审计）。
- [Overview 实验归档](archive/overview-experiments/README.md)：指定样本与轮次的原始实验结果。
- 早期遗留与展示：`archive/legacy/`（含 StudyCore 历史需求、早期全景与[比赛展示材料](archive/legacy/TraeCompetitionApplication.md)）。

归档不等于问题关闭，未关闭事项与待实施方案约束继续在 `current/` 跟踪。历史正文和证据保真，不作为本轮部署、测试或人工验收结果。
