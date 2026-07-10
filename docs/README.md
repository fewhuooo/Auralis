# Auralis v3 文档中心

更新时间：2026-07-07
版本：v3.1

本目录是 Auralis 当前推荐维护的中文文档入口。后续需求、开发、审查、部署、交付都优先以本目录为准。

重要约定：

- 原始 PRD 和任务总表已归档到 `docs/archive/legacy-demand/`，不再作为现行维护入口。
- 旧 `page_api_manifest.md`、`ReadNeed.md`、`obsidian_notion_analysis.md` 当前工作区里已不存在；如后续需要，可从 Git 历史恢复到归档目录。
- 前端页面目前仍在重构中，PC 和 Mobile 的页面状态不能直接等同于最终验收通过。
- Agent 每次写代码前必须先读 [AgentBeforeCoding.md](AgentBeforeCoding.md)。

## 文档索引

| 分类 | 文档 | 用途 |
| --- | --- | --- |
| Agent 入口 | [AgentBeforeCoding.md](AgentBeforeCoding.md) | 给编码 Agent 的写代码前必读上下文、检查清单 |
| 项目基础 | [ProjectReadme.md](ProjectReadme.md) | 项目简介、技术栈、环境依赖、启动方式 |
| 项目基础 | [CodingAndGitStandards.md](CodingAndGitStandards.md) | 编码规范、Git 规范、提交要求 |
| 需求设计 | [ProductRequirementsDocument.md](ProductRequirementsDocument.md) | 产品需求、模块范围、验收标准 |
| 需求设计 | [ArchitectureDesign.md](ArchitectureDesign.md) | 系统架构、技术选型、核心数据流 |
| 需求设计 | [frontend/design.md](frontend/design.md) | 前端页面功能设计总览 |
| 模块说明 | [FrontendPC.md](FrontendPC.md) | PC 前端模块说明 |
| 模块说明 | [FrontendMobileTablet.md](FrontendMobileTablet.md) | 移动端和平板端模块说明 |
| 模块说明 | [Backend.md](Backend.md) | Spring Boot 后端模块说明 |
| 模块说明 | [InfrastructureAndData.md](InfrastructureAndData.md) | 基础设施与数据层说明 |
| 开发契约 | [APIManifest.md](APIManifest.md) | API 接口文档 |
| 开发契约 | [MobilePagesAPIMap.md](MobilePagesAPIMap.md) | Mobile 页面接口映射与本地数据流 |
| 开发契约 | [DatabaseDesign.md](DatabaseDesign.md) | 数据库设计与数据字典 |
| 部署运维 | [DeploymentGuide.md](DeploymentGuide.md) | 部署指南 |
| 部署运维 | [Runbook.md](Runbook.md) | 运维与应急手册 |
| 迭代交付 | [DevelopmentPlan.md](DevelopmentPlan.md) | 阶段计划与验收口径 |
| 迭代交付 | [StatusIndex.md](StatusIndex.md) | 当前项目状态索引 |
| 迭代交付 | [CurrentIssuesAndReview.md](CurrentIssuesAndReview.md) | 当前问题清单与轻量代码审查 |
| 迭代交付 | [Changelog.md](Changelog.md) | 更新日志 |
| 迭代交付 | [UserManualOutline.md](UserManualOutline.md) | 用户手册提纲 |
| 任务计划 | [plans/README.md](plans/README.md) | 按领域拆分的任务计划目录 |

## 文档命名规范

命名格式：

```text
PascalCaseName.md
```

规则：

- 使用完整英文语义名，采用 PascalCase。
- 避免编号前缀。
- 避免不必要缩写，保留通用缩写如 `API`、`PC`。
- 正文标题继续使用中文。

## 历史归档

已归档：

- `docs/archive/legacy-demand/StudyCore_Detailed_PRD.md`
- `docs/archive/legacy-demand/task.md`

已从工作区移除，必要时从 Git 历史恢复：

- `page_api_manifest.md`
- `ReadNeed.md`
- `obsidian_notion_analysis.md`

## 状态口径

- `已验收`：已有构建、测试、联调或人工验收依据。
- `已构建待验收`：代码或页面已存在，但缺少测试、联调或人工验收。
- `进行中`：部分实现已存在，尚未闭环。
- `计划中`：有设计或需求，尚未开始实现。
- `阻塞`：依赖外部配置、资源或产品决策。

## 推荐阅读顺序

开发前：

1. [AgentBeforeCoding.md](AgentBeforeCoding.md)
2. [StatusIndex.md](StatusIndex.md)
3. [CurrentIssuesAndReview.md](CurrentIssuesAndReview.md)
4. 对应模块文档：PC、Mobile、Backend、Infra。
5. 涉及接口或数据库时阅读 [APIManifest.md](APIManifest.md) 和 [DatabaseDesign.md](DatabaseDesign.md)。

交付前：

1. 更新 [DevelopmentPlan.md](DevelopmentPlan.md)。
2. 更新 [StatusIndex.md](StatusIndex.md)。
3. 更新 [Changelog.md](Changelog.md)。
4. 若涉及用户流程，更新 [UserManualOutline.md](UserManualOutline.md)。
