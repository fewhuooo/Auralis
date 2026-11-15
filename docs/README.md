# Auralis 文档中心

更新时间：2026-11-15

文档状态：现行

权威范围：现行文档的唯一入口、任务导航与维护边界

事实来源：当前仓库结构、AGENTS.md 与各分类索引

## 从这里开始

| 你要了解什么 | 入口 |
| --- | --- |
| 项目定位与目录 | [项目总览](project/Overview.md) · [仓库首页](../README.md) |
| 当前进度与验证结果 | [当前状态](current/Status.md) |
| 已知问题与关闭条件 | [问题和审查](current/IssuesAndReview.md) |
| 修改前的规则 | [AGENTS.md](../AGENTS.md) · [编码前协议](agent/BeforeCoding.md) · [编码与 Git 规范](agent/CodingAndGitStandards.md) |
| 配置、部署与恢复 | [部署指南](operations/Deployment.md) · [排障手册](operations/Runbook.md) |
| 使用客户端 | [用户手册](user/UserManual.md) |

开始修改前按编码前协议阅读状态、问题和对应模块，检查工作树并保护已有修改。源码存在、自动测试通过、运行健康和业务验收分别判断，当前完成度以 current 的证据与限制为准。

## 开发与契约

| 领域 | 实现与设计 | 契约 |
| --- | --- | --- |
| PC / Tauri | [PC 模块](modules/FrontendPC.md) · [PC 开发入口](../Auralis-PC/README.md) · [前端设计](design/Frontend.md) | [API](contracts/API.md) · [数据库](contracts/Database.md) |
| Mobile / Tablet | [移动端模块](modules/FrontendMobileTablet.md) · [前端设计](design/Frontend.md) | [页面 API 映射](contracts/MobilePagesAPIMap.md) |
| Server | [后端模块](modules/Backend.md) | [API](contracts/API.md) · [Chat Runtime](contracts/chat-runtime-api.md) · [数据库](contracts/Database.md) |
| 基础设施 | [基础设施模块](modules/Infrastructure.md) · [部署指南](operations/Deployment.md) | 当前 Compose、环境示例与应用配置 |

[冻结 OpenAPI](contracts/openapi/auralis-openapi.json)用于契约检查和生成类型；生成成功不代表全部调用端已完成接入。

## 产品、设计与计划

| 用途 | 入口 |
| --- | --- |
| 产品范围与系统边界 | [产品需求](project/ProductRequirements.md) · [系统架构](project/Architecture.md) |
| 设计规范与决策记录 | [设计分类索引](design/README.md) |
| 开放任务与领域路线 | [计划入口](planning/README.md) · [任务总览](planning/Overview.md) |
| 候选版本验收 | [部署测试前门禁](planning/PreDeploymentReadinessTasks.md) |
| 详细方案与接手记录 | [实施方案索引](plans/README.md) |

计划说明目标和验收方式，不替代当前实现。接续时先核对 current、模块及源码；已替代方案只用于追溯，不据其恢复旧接口或重新创建已完成任务。

## 操作与交付

- [部署指南](operations/Deployment.md)：配置、构建、发布门禁和回滚。
- [排障手册](operations/Runbook.md)：故障诊断、备份及恢复。
- [测试账号与数据准备](operations/TestAccountDataResetAndSeed.md)：授权的本地测试流程。
- [变更记录](release/Changelog.md)：已发生的变化。

## 文档职责与维护

| 目录 | 维护内容 |
| --- | --- |
| agent / project | 开发规则 / 产品范围、目录与架构 |
| current | 当前状态、开放问题和验收边界 |
| modules / contracts | 实现结构与行为 / 接口、数据和跨端契约 |
| design | 设计规范与决策记录 |
| planning / plans | 领域待办 / 详细实施方案 |
| operations | 可重复执行的部署、诊断与恢复步骤 |
| release / user | 已发生变化 / 用户操作说明 |
| archive / showcase | 历史追溯 / 展示材料，均非当前工程事实来源 |

每类事实在所属文档维护，其他位置使用摘要和链接。新增现行文档进入分类目录并从本页或分类索引可达；接口、数据、实现和状态变化按[编码前协议](agent/BeforeCoding.md)回写。模块或操作手册按主题更新，逐次工作流水进入任务报告。

指令优先级以用户当前要求、AGENTS.md、编码前协议和对应权威文档为序；完整规则见协议。文档结构与状态词典见[文档架构](design/DocumentationArchitecture.md)。

## 历史与展示

- [历史归档](archive/README.md)：原文快照、已替代方案与历史证据。
- [Overview 实验索引](archive/overview-experiments/README.md)：指定样本与轮次的原始结果。
- [已替代方案与旧检查记录](archive/superseded-2026-11-15/README.md)：原方案、迁移矩阵和旧审计，开放项仍在问题清单跟踪。
- [展示材料](showcase/TraeCompetitionApplication.md)。

归档不等于问题关闭，未关闭事项继续在 current 跟踪。历史正文和证据保真，不作为本轮部署、测试或人工验收结果。
