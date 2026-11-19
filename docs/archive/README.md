> [!WARNING]
> 本目录只保存历史材料，不是 Auralis 当前实现、状态、接口或任务的依据。开发者与 AI Agent 禁止依据归档恢复旧实现、判断当前完成度或创建当前任务。

# Auralis 历史文档归档

更新时间：2026-11-16

文档状态：历史归档入口

权威范围：仅说明归档分类、来源与使用限制

事实来源：`docs/archive/` 当前目录结构

## 现行入口

当前工程文档统一从[文档中心](../README.md)进入。任何归档内容与现行文档或代码冲突时，必须忽略归档判断。

## 归档分类

| 目录 | 内容 | 使用限制 |
| --- | --- | --- |
| [设计方案与实施方案](design-and-plans/README.md) | 原 `design/`（36 份）、`plans/`（92 份）按领域归类的专题设计与单次实施计划，以及[2026-11-15 已替代方案](design-and-plans/superseded-2026-11-15/README.md) | 只追溯当时设计决策、实施步骤与过程验证，不作为现行契约或待办；待实施要点已并入现行 `current/` 文档 |
| `snapshots/` | 历次文档整理与阶段快照：2026-07-10 重构前镜像（`2026-07-10-pre-reorganization/`）、[2026-07-10 文档架构设计](snapshots/2026-07-10-documentation-architecture.md)、[2026-07-10 重构记录](snapshots/2026-07-10-documentation-reorganization.md)、[2026-11-13 状态与模块整理](snapshots/maintenance-2026-11-13/README.md)、[2026-11-15 运维与计划整合](snapshots/maintenance-2026-11-15/README.md)、[阶段状态记录](snapshots/stages-2026-10-28/2026-10-28-status-stage-records.md)、[阶段问题记录](snapshots/stages-2026-10-28/2026-10-28-issues-stage-records.md)、[2026-08-16 综合审计](snapshots/audits/2026-08-16-overall-project-completion-audit.md) | 保留历史原文与 SHA-256 校验，仅供追溯当时证据与演进，不推断当前实现或关闭风险 |
| [Overview 实验归档](overview-experiments/README.md) | 按实验轮次整理的方案、输入输出、结果、用量与证据清单 | 用于历史方案对比；实验结果不代表当前实现或业务验收 |
| `legacy/` | StudyCore 阶段历史需求（`legacy-demand/`）、早期项目全景（`legacy-project/`）与[比赛展示材料](legacy/TraeCompetitionApplication.md) | 禁止作为 Auralis 当前目录、接口、技术栈或完成度依据 |

## Agent 禁止事项

- 禁止把归档中的“已完成”当成当前已验收。
- 禁止依据归档路径创建或恢复 StudyCore 命名的目录、包、路由或配置。
- 禁止从归档复制接口、字段或环境变量而不核对当前代码。
- 禁止把归档任务重新加入现行计划，除非用户明确提出并完成当前代码核验。

## 历史保真

归档文件顶部的警告属于归档元数据。带 `<!-- ORIGINAL WORKTREE CONTENT -->` 标记的快照文件及其后原始字节保持历史原貌，不进行事实修正。
