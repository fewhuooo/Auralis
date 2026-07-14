# Auralis 文档中心

更新时间：2026-07-10

文档状态：现行

权威范围：现行文档的唯一入口、阅读路径、权威边界、状态词典与维护规则

事实来源：仓库目录、`AGENTS.md` 与 `docs/design/DocumentationArchitecture.md`

## 定位

本目录服务于 Auralis 的开发者和编码 Agent。文档的首要目标是让维护者快速回答四个问题：

1. 当前代码实际有什么？
2. 哪份文档负责维护这类事实？
3. 修改前必须读什么，修改后必须回写什么？
4. 哪些内容已经验证，哪些仍需人工、GUI、真机或外部服务验收？

`docs/README.md` 是唯一现行入口。`docs/archive/` 只保存历史，`docs/showcase/` 只保存展示材料，两者都不是工程事实来源。

## 30 秒开始

修改任何内容前：

1. 阅读 [Agent 编码前协议](agent/BeforeCoding.md)。
2. 阅读 [当前状态](current/Status.md) 与 [问题和审查](current/IssuesAndReview.md)。
3. 按任务选择模块、契约或运维文档。
4. 检查 Git 工作树，保护用户已有修改。
5. 完成后按回写矩阵更新文档，并记录实际验证证据。

## 按任务选择文档

| 任务 | 必读 | 变化后必须回写 |
| --- | --- | --- |
| PC 页面、路由、Store、Tauri | [PC 模块](modules/FrontendPC.md)、[前端设计](design/Frontend.md) | 两份文档；状态/风险变化时更新 `current/`；发布变化更新 Changelog |
| Mobile / Tablet 页面、路由、端侧数据 | [Mobile / Tablet 模块](modules/FrontendMobileTablet.md)、[前端设计](design/Frontend.md)、[页面 API 映射](contracts/MobilePagesAPIMap.md) | 所有受影响文档及状态、风险、Changelog |
| 后端 Controller、Service、鉴权 | [后端模块](modules/Backend.md)、[API 契约](contracts/API.md) | 两份文档及状态、风险、Changelog |
| Entity、DDL、同步字段、本地表 | [数据库契约](contracts/Database.md)、[后端模块](modules/Backend.md) | 两份文档；接口变化时同步 API |
| Docker、环境变量、部署、运维 | [基础设施模块](modules/Infrastructure.md)、[部署指南](operations/Deployment.md)、[Runbook](operations/Runbook.md) | 所有受影响文档及状态、风险、Changelog |
| 产品范围或验收条件 | [产品需求](project/ProductRequirements.md)、[系统架构](project/Architecture.md) | 产品、架构、计划、状态 |
| 仅文档整理 | 本入口及受影响的权威文档 | 索引、元数据、链接；发布影响进入 Changelog |
| 版本或发布 | [当前状态](current/Status.md)、[发布计划](planning/InfraRelease.md) | [Changelog](release/Changelog.md) 与实际验证证据 |

## 文档权威边界

| 分类 | 唯一职责 | 禁止混入 |
| --- | --- | --- |
| `agent/` | Agent 开始前、修改中、完成后的强制行为 | 产品宣传、页面细节 |
| `project/` | 产品范围、项目总览、系统架构 | 当前任务进度、接口明细 |
| `current/` | 当前状态和未关闭风险 | 页面设计长文、未来愿景 |
| `modules/` | 当前代码结构、边界、命令和限制 | 产品需求、完整接口字段表 |
| `contracts/` | API、数据、页面调用契约 | 宣传文案、未批准设想 |
| `design/` | 已批准的设计体系、交互和架构决策 | 构建通过或验收状态 |
| `operations/` | 部署、排障、备份、恢复 | 不存在的命令或自动化 |
| `planning/` | 尚未完成的任务、依赖、验收与完成定义 | 已完成历史 |
| `release/` | 已发生且可确认的变化 | 未来计划 |
| `user/` | 面向最终用户的操作说明 | 内部实现细节 |
| `showcase/` | 比赛和展示材料 | 当前工程事实 |
| `archive/` | 历史追溯 | 当前实现、状态和任务依据 |

## 状态词典

| 状态 | 必须满足的判定条件 |
| --- | --- |
| 已验收 | 有构建、测试、联调或人工验收证据，并满足该项完成定义 |
| 已构建待验收 | 代码或页面存在，但缺少足够测试、联调或人工证据 |
| 进行中 | 部分实现存在，主流程、测试或文档尚未闭环 |
| 计划中 | 只有需求、设计或任务，尚未开始实现 |
| 已隐藏保留 | 实现仍存在，但入口被 feature flag 或路由配置关闭 |
| 阻塞 | 依赖外部配置、资源、设备、权限或产品决策，当前无法继续验证 |

## 事实与验证口径

- **代码确认**：给出文件、类、函数、路由或配置路径，只证明实现存在。
- **命令验证**：给出执行日期、完整命令、退出结果，只证明该命令在当时环境中的结果。
- **人工验收**：说明设备、GUI、外部服务和操作流程，不能由构建命令代替。
- **历史证据**：只能进入 Changelog 或归档，不能伪装为本轮验证。

禁止用“已完成”同时表达以上多种证据。若无法验证，必须写明未验证原因。

## 目录索引

### Agent 与规范

- [编码前协议](agent/BeforeCoding.md)
- [编码与 Git 规范](agent/CodingAndGitStandards.md)

### 项目与设计

- [项目总览](project/Overview.md)
- [产品需求](project/ProductRequirements.md)
- [系统架构](project/Architecture.md)
- [文档架构设计](design/DocumentationArchitecture.md)
- [前端设计](design/Frontend.md)
- [PC 学科线条图标设计（2026-07-14）](superpowers/specs/2026-07-14-pc-subject-outline-icon-design.md)
- [PC 学科线条图标实施计划（2026-07-14）](superpowers/plans/2026-07-14-pc-subject-outline-icon.md)
- [PC 学科工作区重建设计（2026-07-13）](superpowers/specs/2026-07-13-pc-subject-workspace-reconstruction-design.md)
- [PC 学科工作区重建实施计划（2026-07-13）](superpowers/plans/2026-07-13-pc-subject-workspace-reconstruction.md)
- [PC 学科工作区大纲三栏布局规格（2026-07-13）](superpowers/specs/2026-07-13-pc-subject-outline-three-column-design.md)

### 当前实现与契约

- [当前状态](current/Status.md)
- [问题和审查](current/IssuesAndReview.md)
- [PC 模块](modules/FrontendPC.md)
- [Mobile / Tablet 模块](modules/FrontendMobileTablet.md)
- [后端模块](modules/Backend.md)
- [基础设施模块](modules/Infrastructure.md)
- [API 契约](contracts/API.md)
- [数据库契约](contracts/Database.md)
- [Mobile 页面 API 映射](contracts/MobilePagesAPIMap.md)

### 运维、计划与交付

- [部署指南](operations/Deployment.md)
- [运维手册](operations/Runbook.md)
- [计划入口](planning/README.md)
- [任务总览](planning/Overview.md)
- [变更记录](release/Changelog.md)
- [用户手册](user/UserManual.md)

### 非工程事实

- [展示材料](showcase/TraeCompetitionApplication.md)
- [历史归档](archive/README.md)

## 维护与冲突处理

指令和事实冲突时按以下顺序处理：

1. 用户在当前任务中的最新明确要求。
2. 根目录 `AGENTS.md`。
3. `docs/agent/BeforeCoding.md`。
4. 本次任务对应的权威模块与契约文档。
5. `docs/planning/` 中的计划。
6. 展示材料和历史归档。

代码与现行文档冲突时，必须核实实现并在任务范围内同步修正文档；禁止静默选择一方。新文档必须进入已有分类目录，确需新增分类时先更新本入口和文档架构设计。

## 归档说明

[2026-07-10 重构前快照](archive/snapshots/2026-07-10-pre-reorganization/SNAPSHOT.md) 保存了旧文档体系和当时工作树中的未提交文档修改。归档顶部的警告是强制约束；任何 Agent 都不得从归档恢复旧实现或判断当前状态。
