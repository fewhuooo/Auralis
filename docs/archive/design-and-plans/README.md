> [!WARNING]
> 本目录保存项目历史上的单次专题设计文档、详细实施方案（`design/`、`plans/`）与已替代方案（`superseded-2026-11-15/`），仅供历史设计追溯与当时实施证据查阅，不作为 Auralis 当前实现、接口契约、数据模型或待办任务的依据。现行文档统一从[文档中心](../../README.md)进入；现行未关闭项与待实施约束见[当前状态](../../current/Status.md)与[问题和审查](../../current/IssuesAndReview.md)。

# Auralis 历史设计与实施方案归档索引

更新时间：2026-11-27

文档状态：历史归档索引

权威范围：原 `docs/design/<domain>/`、`docs/plans/` 与 `docs/archive/superseded-2026-11-15/` 的集中导航

事实来源：归档自 2026-11-16 文档收敛前的 `docs/design/` 与 `docs/plans/` 目录

## 归档说明

本目录下的文件保留对应时期的设计决策、实施步骤和当次验证记录。部分方案已被后续实现替代；仍待实施的约束与验收边界已收敛至[问题和审查](../../current/IssuesAndReview.md)与[路线与门禁](../../current/RoadmapAndGates.md)。本目录按领域子目录存放：`overview/`（总览）、`ai/`（Chat 与模型治理）、`frontend/`（PC 与多端）、`backend/`（后端与数据）、`learning/`（复习、任务与产品能力）。

- 通用前端交互与视觉设计已迁至现行文档：[前端设计](../../project/FrontendDesign.md)
- 文档体系演变设计已归档至：[2026-07-10 文档架构设计](../snapshots/2026-07-10-documentation-architecture.md)
- 已替代方案专题归档：[2026-11-15 已替代文档归档](superseded-2026-11-15/README.md)

## Overview

### 设计记录

- [内容规模自适应总览设计（2026-10-18）](design/overview/2026-10-18-overview-adaptive-generation-design.md)
- [Overview Reduce Prompt 均衡压缩设计（2026-09-20）](design/overview/2026-09-20-overview-reduce-prompt-compression-design.md)
- [Overview 手动重试、收敛预算与错误码设计（2026-09-14）](design/overview/2026-09-14-overview-retry-and-convergence-design.md)
- [PC 文件 Overview 触发链诊断设计（2026-09-10）](design/overview/2026-09-10-pc-overview-trigger-diagnostics-design.md)
- [Overview Source 删除屏障设计（2026-09-10）](design/overview/2026-09-10-overview-source-deletion-fence-design.md)
- [PC 学科总览与文件 AI 总结设计（2026-09-09）](design/overview/2026-09-09-pc-subject-overview-ai-design.md)

### 实施方案

- [Overview 清理、大纲与 Markdown 总结替换（2026-11-12）](plans/overview/2026-11-12-overview-markdown-replacement.md)
- [学科总览批量状态查询与 PC 接入（2026-11-04）](plans/overview/2026-11-04-overview-batch-status-handoff.md)
- [Overview 独立执行重试实施计划（2026-10-27）](plans/overview/2026-10-27-overview-explicit-retry.md)
- [Overview 原章顺序与柔性路由实施计划（2026-10-27）](plans/overview/2026-10-27-overview-original-chapter-order.md)
- [Overview 动态容量与链路简化实施计划（2026-10-26）](plans/overview/2026-10-26-overview-dynamic-capacity-and-simplification.md)
- [Overview 独立分段与边界编辑实施计划（2026-10-25）](plans/overview/2026-10-25-overview-boundary-edit-quality.md)
- [Overview 阶段 3–7 修复实施计划](plans/overview/2026-10-24-overview-routing-writing-completion.md)
- [Overview 全流程测试追踪实施计划（2026-10-23）](plans/overview/2026-10-23-overview-test-tracing.md)
- [Overview M3.4 正式发布与分节预览计划（2026-10-22）](plans/overview/2026-10-22-overview-m34-publication.md)
- [Overview M3.3 持久后台作业、控制与安全接管计划（2026-10-22）](plans/overview/2026-10-19-overview-m33-background-jobs.md)
- [Overview M3.1 有限层级目录规划计划（2026-10-19）](plans/overview/2026-10-19-overview-m3-hierarchical-planning.md)
- [Overview M3.2 持久正文执行计划与节点状态（2026-10-19）](plans/overview/2026-10-19-overview-m3-execution-journal.md)
- [Overview M2 稳定大纲身份与可信原文关联计划（2026-10-19）](plans/overview/2026-10-19-overview-m2-identity-provenance.md)
- [内容规模自适应总览实施计划（2026-10-18）](plans/overview/2026-10-18-overview-adaptive-generation.md)
- [Overview 动态预算与超限恢复（2026-10-13）](plans/overview/2026-10-12-overview-dynamic-budget-recovery.md)
- [学科总览合法输入分批（2026-10-12）](plans/overview/2026-10-12-subject-overview-prompt-batching.md)
- [学科总览用量误拒绝诊断与最小修复（2026-10-11）](plans/overview/2026-10-11-overview-usage-limit-diagnosis.md)
- [Overview 硬超时与取消实施计划（2026-10-11）](plans/overview/2026-10-11-overview-hard-timeout-cancellation.md)
- [Overview Reduce Prompt 均衡压缩实施计划（2026-09-20）](plans/overview/2026-09-20-overview-reduce-prompt-compression.md)
- [Overview 手动重试、收敛预算与错误码实施计划（2026-09-14）](plans/overview/2026-09-14-overview-retry-and-convergence.md)
- [Overview Source 删除屏障实施计划（2026-09-11）](plans/overview/2026-09-11-overview-source-deletion-fence.md)
- [PC 文件 Overview 触发链诊断实施计划（2026-09-10）](plans/overview/2026-09-10-pc-overview-trigger-diagnostics.md)
- [PC 学科总览 AI 实施计划（2026-09-09）](plans/overview/2026-09-09-pc-subject-overview-ai.md)

## AI 与模型治理

### 设计记录

- [学习 Agent 原产品与交互记录（2026-10-16；Chat 范围已由 Display Tool 方案接替）](design/ai/2026-10-16-learning-agent-design.md)
- [AI 用量预算、并发保护与 Provider 资源隔离设计（2026-09-14）](design/ai/2026-09-14-ai-usage-guard-design.md)
- [AI env 默认 Provider 与 BYOK 覆盖设计（2026-08-21）](design/ai/2026-08-21-ai-env-provider-fallback-design.md)

### 实施方案

- [Chat Agent Loop 容错、收敛与上下文治理（2026-11-04）](plans/ai/2026-11-04-chat-agent-loop-evolution.md)
- [Chat Agent Display Tool 重写实施计划（2026-10-31）](plans/ai/2026-10-31-chat-display-tools.md)
- [Chat Display Tool 前端接手说明（2026-10-31）](plans/ai/2026-10-29-chat-frontend-handoff.md)
- [学习 Agent 原实施记录（2026-10-16；Chat 执行入口已由 Display Tool 计划接替）](plans/ai/2026-10-16-learning-agent-implementation.md)
- [AI 统一限额与用量治理独立方案（2026-10-16）](plans/ai/2026-10-16-ai-unified-limits.md)
- [AI 执行预算治理近期阶段 0–3 计划（2026-10-13）](plans/ai/2026-10-13-ai-execution-budget-governance.md)
- [RAG 默认开启实施计划与证据（2026-10-12）](plans/ai/2026-10-12-rag-always-on.md)
- [大 PDF 摄入额度与同步等待诊断、最小修复（2026-10-12）](plans/ai/2026-10-12-pdf-ingestion-quota-and-sync.md)
- [Embedding 额度排除与单人测试额度（2026-10-12）](plans/ai/2026-10-12-embedding-quota-exemption-and-test-limits.md)
- [AI 完整持久配额与个人中心额度实施计划（2026-10-10）](plans/ai/2026-10-10-ai-usage-guard-b.md)
- [AI IMPORTANT 修复实施计划与证据（2026-10-10）](plans/ai/2026-10-10-ai-important-fixes.md)
- [提问选中文本传递与后端处理（2026-10-01）](plans/ai/2026-10-01-chat-selected-text.md)
- [AI env 默认 Provider 与 BYOK 覆盖实施计划（2026-08-21）](plans/ai/2026-08-21-ai-env-provider-fallback.md)

## PC 与多端前端

### 设计记录

- [Issues 2–4 修复设计：Source 生命周期、连接状态与 Overview 反馈（2026-09-21）](design/frontend/2026-09-21-issues-2-4-remediation-design.md)
- [PC OCR 运行时页级进度恢复设计（2026-09-18）](design/frontend/2026-09-18-pc-ocr-runtime-progress-design.md)
- [PC Local Asset Store 本地优先文件资料库设计（2026-09-15）](design/frontend/2026-09-15-pc-local-asset-store-design.md)
- [PC PDF 混合页面处理阶段修复设计（2026-09-09）](design/frontend/2026-09-09-pc-pdf-mixed-page-phase-design.md)
- [PC OCR 诊断与空白页容错设计（2026-09-08）](design/frontend/2026-09-08-pc-ocr-diagnostics-and-empty-page-design.md)
- [PC 文件上传后处理与统计接口恢复设计（2026-09-05）](design/frontend/2026-09-05-upload-processing-recovery-design.md)
- [PC 本地数据库重置与孤儿 Source 终止设计（2026-09-05）](design/frontend/2026-09-05-pc-local-database-reset-and-orphan-source-design.md)
- [PC 单一文件预览设计（2026-09-04）](design/frontend/2026-09-04-single-file-preview-design.md)
- [PC 文档处理密钥恢复边界设计（2026-09-04；已批准待实施要点已并入 IssuesAndReview）](design/frontend/2026-09-04-pc-document-encryption-recovery-design.md)
- [资产库本地优先加载设计（2026-09-03）](design/frontend/2026-09-03-asset-local-first-loading-design.md)
- [PC PDF Runtime 一致性与文档处理可观测性设计（2026-09-01）](design/frontend/2026-09-01-pc-pdf-runtime-and-processing-observability-design.md)
- [PC 时间轴过去时段保护设计（2026-08-31）](design/frontend/2026-08-31-pc-timeline-past-slot-guard-design.md)
- [PC Tauri AI 辅助阅读全流程设计（2026-08-23，2026-08-24 技术复核修订）](design/frontend/2026-08-23-pc-tauri-ai-assisted-reading-design.md)
- [PC 学科文件上传与预览设计（2026-08-22）](design/frontend/2026-08-22-subject-file-upload-preview-design.md)
- [PC 首页时间轴与任务逻辑设计（2026-08-22）](design/frontend/2026-08-22-pc-dashboard-task-logic-design.md)
- [PC 学习页 AI 伴读移动端视觉复刻设计（2026-07-14）](design/frontend/2026-07-14-pc-workspace-ai-mobile-visual-design.md)
- [PC 学科线条图标设计（2026-07-14）](design/frontend/2026-07-14-pc-subject-outline-icon-design.md)
- [PC 学科工作区重建设计（2026-07-13）](design/frontend/2026-07-13-pc-subject-workspace-reconstruction-design.md)
- [PC 学科工作区大纲三栏布局规格（2026-07-13）](design/frontend/2026-07-13-pc-subject-outline-three-column-design.md)

### 实施方案

- [移动端 Uni-app 迁移至 Vue 3 + Vite + Tauri 2 实施方案（2026-11-26 建立，2026-11-27 完成归档）](plans/frontend/2026-11-26-mobile-tauri-migration.md)
- [PC 时间轴放置与交换修复实施计划（2026-10-07）](plans/frontend/2026-10-07-timeline-placement-and-swap-fixes.md)
- [PC 时间轴日期与拖放修复实施计划（2026-10-06）](plans/frontend/2026-10-06-timeline-date-and-drag-fixes.md)
- [PC 学习数据清理、专注统计与 Overview 同步实施计划（2026-10-01）](plans/frontend/2026-10-01-pc-learning-data-cleanup-and-sync.md)
- [Issue 3/4 前端修复实施计划（2026-09-21）](plans/frontend/2026-09-21-issues-3-4-frontend-fixes.md)
- [PC OCR 运行时页级进度恢复实施计划（2026-09-18）](plans/frontend/2026-09-18-pc-ocr-runtime-progress.md)
- [PC Local Asset Store 全栈实施计划（2026-09-16）](plans/frontend/2026-09-16-pc-local-asset-store.md)
- [PC PDF 混合页面处理阶段修复实施计划（2026-09-09）](plans/frontend/2026-09-09-pc-pdf-mixed-page-phase-fix.md)
- [PC OCR 诊断与空白页容错实施计划（2026-09-08）](plans/frontend/2026-09-08-pc-ocr-diagnostics-and-empty-page.md)
- [PC 文档处理稳定性实施计划（2026-09-06）](plans/frontend/2026-09-06-pc-document-processing-stability.md)
- [PC 文件上传后处理与统计接口恢复实施计划（2026-09-05）](plans/frontend/2026-09-05-upload-processing-recovery.md)
- [PC 本地数据库重置与孤儿 Source 终止实施计划（2026-09-05）](plans/frontend/2026-09-05-pc-local-database-reset-and-orphan-source-cleanup.md)
- [PC 单一文件预览实施计划（2026-09-04）](plans/frontend/2026-09-04-single-file-preview.md)
- [PC Subject 全局主题色清理实施计划（2026-09-04）](plans/frontend/2026-09-04-pc-subject-theme-color-cleanup.md)
- [PC 本地优先同步核心实施计划（2026-09-04）](plans/frontend/2026-09-04-pc-local-first-sync-core.md)
- [PC 文档处理密钥恢复边界实施计划（2026-09-04）](plans/frontend/2026-09-04-pc-document-encryption-recovery.md)
- [PC SQLite 并发写入修复实施计划（2026-09-03）](plans/frontend/2026-09-03-pc-sqlite-concurrency-remediation.md)
- [PC 已完成排期任务固定实施计划（2026-09-03）](plans/frontend/2026-09-03-pc-completed-scheduled-task-lock.md)
- [资产库本地优先加载实施计划（2026-09-03）](plans/frontend/2026-09-03-asset-local-first-loading.md)
- [PC PDF Runtime 一致性与文档处理可观测性实施计划（2026-09-01）](plans/frontend/2026-09-01-pc-pdf-runtime-and-processing-observability.md)
- [PC 时间轴过去时段保护实施计划（2026-08-31）](plans/frontend/2026-08-31-pc-timeline-past-slot-guard.md)
- [PC Tauri AI 辅助阅读全流程实施计划（2026-08-24）](plans/frontend/2026-08-24-pc-tauri-ai-assisted-reading.md)
- [PC 学科文件查看器预览实施计划（2026-08-22）](plans/frontend/2026-08-22-subject-file-viewer-preview.md)
- [PC 首页时间轴与任务逻辑实施计划（2026-08-22）](plans/frontend/2026-08-22-pc-dashboard-task-logic.md)
- [R4 Mobile / Tablet 客户端迁移实施计划（2026-08-20）](plans/frontend/2026-08-20-r4-mobile-tablet-migration.md)
- [R4 PC 全量客户端迁移实施计划（2026-08-17）](plans/frontend/2026-08-17-r4-pc-full-migration.md)
- [PC 学习页 AI 伴读移动端视觉复刻实施计划（2026-07-14）](plans/frontend/2026-07-14-pc-workspace-ai-mobile-visual.md)
- [PC 学科线条图标实施计划（2026-07-14）](plans/frontend/2026-07-14-pc-subject-outline-icon.md)
- [PC 学科工作区重建实施计划（2026-07-13）](plans/frontend/2026-07-13-pc-subject-workspace-reconstruction.md)

## 后端与数据平台

### 设计记录

- [Server 全量测试前三类失败修复设计（2026-09-11）](design/backend/2026-09-11-server-full-test-gates-remediation-design.md)
- [Build 与 OpenAPI 客户端门禁修复设计（2026-09-11）](design/backend/2026-09-11-build-and-openapi-client-gates-remediation-design.md)
- [R4 PC 全量客户端迁移与 Tauri 重写设计（2026-08-17）](design/backend/2026-08-17-r4-01-pc-auth-realtime-design.md)
- [R1-06 后端工具链和运行配置设计（2026-08-17）](design/backend/2026-08-17-backend-r1-06-toolchain-config-design.md)
- [R1-01 Provider 安全设计](design/backend/2026-08-16-r1-01-provider-security-design.md)
- [后端阶段五 AI 与 RAG 设计（2026-08-16）](design/backend/2026-08-16-backend-phase-5-ai-rag-design.md)

### 实施方案

- [后端绿地重写完整实施计划](plans/backend-greenfield-rewrite-plan.md)
- [后端绿地重写阶段 0 实施计划](plans/backend/backend-greenfield-phase-0-plan.md)
- [Source 永久删除与单 PC 会话实施计划（2026-09-21）](plans/backend/2026-09-21-source-permanent-delete-and-single-pc.md)
- [Build 与 OpenAPI 客户端门禁修复实施计划（2026-09-12）](plans/backend/2026-09-12-build-and-openapi-client-gates-remediation.md)
- [Server 全量测试前三类失败修复实施计划（2026-09-11）](plans/backend/2026-09-11-server-full-test-gates-remediation.md)
- [Jackson 3 JSON 类型统一实施计划（2026-09-01）](plans/backend/2026-09-01-jackson3-json-type-unification.md)
- [默认容器测试实施计划（2026-08-17）](plans/backend/2026-08-17-default-container-tests.md)
- [R1-06 后端工具链和运行配置实施计划（2026-08-17）](plans/backend/2026-08-17-backend-r1-06-toolchain-config.md)
- [R1-05 并发与分页实施计划（2026-08-17）](plans/backend/2026-08-17-backend-r1-05-concurrency-pagination.md)
- [R1-01 Provider 安全实施计划（2026-08-16）](plans/backend/2026-08-16-r1-01-provider-security.md)
- [后端阶段五 AI 与 RAG 实施计划（2026-08-16）](plans/backend/2026-08-16-backend-phase-5-ai-rag.md)
- [后端阶段 3/4 同步、复习、统计与实时实施计划](plans/backend/2026-08-13-backend-phase-3-4-sync-review-realtime.md)
- [后端阶段 2B Source、Asset、Relation 实施计划](plans/backend/2026-08-12-backend-phase-2b-source-asset-relation.md)
- [后端阶段 2A 核心领域实施计划](plans/backend/2026-08-12-backend-phase-2-core-domain.md)
- [后端阶段 1 身份实施计划](plans/backend/2026-08-12-backend-phase-1-identity.md)

## 学习、任务与产品能力

### 设计记录

- [Task 颜色能力全栈移除设计（2026-09-07）](design/learning/2026-09-07-remove-task-color-design.md)
- [Task 认知负荷全栈移除设计（2026-09-07）](design/learning/2026-09-07-remove-task-cognitive-load-design.md)
- [Subject 专属颜色移除设计（2026-09-02）](design/learning/2026-09-02-remove-subject-color-design.md)

### 实施方案

- [PC 复习同步与取消排期修复交接（2026-11-03）](plans/learning/2026-11-03-pc-review-unschedule-handoff.md)
- [PC 任务截止日期与排期一致性修复（2026-10-10）](plans/learning/2026-10-09-task-deadline-date-consistency.md)
- [学科复习与统计完整本地使用（2026-10-09）](plans/learning/2026-10-09-review-stats-local-first.md)
- [学科复习与统计实施计划（2026-10-08）](plans/learning/2026-10-08-subject-review-stats-implementation.md)
- [学科复习、学习与掌握退出实施记录（2026-10-08）](plans/learning/2026-10-08-review-learning-mastery-implementation.md)
- [学科复习、学习与掌握退出整体设计（2026-10-08）](plans/learning/2026-10-08-review-learning-mastery-design.md)
- [学科内复习与统计页面方案（2026-10-07 建立，2026-10-08 实施）](plans/learning/2026-10-07-subject-review-redesign.md)
- [PC / Service 三项优先问题修复（2026-10-07）](plans/learning/2026-10-07-priority-function-fixes.md)
- [PC 未排期任务截止后自动完成（2026-10-06）](plans/learning/2026-10-06-unscheduled-task-deadline.md)
- [任务完整排期截止时间校验（2026-10-06）](plans/learning/2026-10-06-task-schedule-deadline-guard.md)
- [Task 颜色能力全栈移除实施计划（2026-09-07）](plans/learning/2026-09-07-remove-task-color.md)
- [Task 认知负荷全栈移除实施计划（2026-09-07）](plans/learning/2026-09-07-remove-task-cognitive-load.md)
- [Subject 专属颜色移除前端实施计划（2026-09-03）](plans/learning/2026-09-03-remove-subject-color-frontend.md)
- [Subject 专属颜色移除后端实施计划（2026-09-03）](plans/learning/2026-09-03-remove-subject-color-backend.md)
