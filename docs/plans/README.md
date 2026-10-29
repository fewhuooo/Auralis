# Auralis 实施方案索引

更新时间：2026-10-29

文档状态：现行分类索引

权威范围：`plans/` 下已批准实施方案的按领域导航；具体状态和证据以各计划正文为准

事实来源：`docs/README.md`、`docs/plans/` 目录与各文档标题

本页只负责导航；文件保留在原目录，具体状态和验证证据以各计划正文为准。

## 总体计划

- [后端绿地重写完整实施计划](backend-greenfield-rewrite-plan.md)

## 按领域索引

### Overview

- [Overview 独立执行重试实施计划（2026-10-27）](2026-10-27-overview-explicit-retry.md)

- [Overview 原章顺序与柔性路由实施计划（2026-10-27）](2026-10-27-overview-original-chapter-order.md)

- [Overview 动态容量与链路简化实施计划（2026-10-26）](2026-10-26-overview-dynamic-capacity-and-simplification.md)

- [Overview 独立分段与边界编辑实施计划（2026-10-25）](2026-10-25-overview-boundary-edit-quality.md)
- [Overview 阶段 3–7 修复实施计划](2026-10-24-overview-routing-writing-completion.md)
- [Overview 全流程测试追踪实施计划（2026-10-23；采集工具、定向/全量后端验证、Compose 合成配置与唯一审查完成；人工实测待进行）](2026-10-23-overview-test-tracing.md)
- [Overview M3.4 正式发布与分节预览计划（2026-10-22）](2026-10-22-overview-m34-publication.md)
- [Overview M3.3 持久后台作业、控制与安全接管计划（2026-10-22；源码、相关自动验证与唯一审查完成；未部署）](2026-10-19-overview-m33-background-jobs.md)
- [Overview M3.1 有限层级目录规划计划（2026-10-19；源码、相关验证与唯一审查完成；未部署）](2026-10-19-overview-m3-hierarchical-planning.md)
- [Overview M3.2 持久正文执行计划与节点状态（2026-10-19；源码、相关验证与唯一审查完成；未部署）](2026-10-19-overview-m3-execution-journal.md)
- [Overview M2 稳定大纲身份与可信原文关联计划（2026-10-19；实现、相关验证与复审完成，未部署）](2026-10-19-overview-m2-identity-provenance.md)
- [内容规模自适应总览实施计划（2026-10-18）](2026-10-18-overview-adaptive-generation.md)
- [学科总览合法输入分批（2026-10-12，代码、定向回归、审查及本机更新完成；业务待实测）](2026-10-12-subject-overview-prompt-batching.md)
- [Overview 动态预算与超限恢复（2026-10-13；代码/自动门禁/指定P4完成，业务库V32运行态只读观察）](2026-10-12-overview-dynamic-budget-recovery.md)
- [学科总览用量误拒绝诊断与最小修复（2026-10-11，代码、相关验证和审查通过；未部署）](2026-10-11-overview-usage-limit-diagnosis.md)
- [Overview 硬超时与取消实施计划（2026-10-11，代码/相关验证/审查通过，真实环境待验收）](2026-10-11-overview-hard-timeout-cancellation.md)
- [Overview Reduce Prompt 均衡压缩实施计划（2026-09-20）](2026-09-20-overview-reduce-prompt-compression.md)
- [Overview 手动重试、收敛预算与错误码实施计划（2026-09-14）](2026-09-14-overview-retry-and-convergence.md)
- [Overview Source 删除屏障实施计划（2026-09-11）](2026-09-11-overview-source-deletion-fence.md)
- [PC 文件 Overview 触发链诊断实施计划（2026-09-10）](2026-09-10-pc-overview-trigger-diagnostics.md)
- [PC 学科总览 AI 实施计划（2026-09-09）](2026-09-09-pc-subject-overview-ai.md)

### AI 与模型治理

- [Chat Agent 与流式可视化教学重写计划（2026-10-29；codex/chat-agent-rewrite，P0 接线与契约冻结后实施）](2026-10-29-chat-agent-visual-teaching.md)
- [学习 Agent 原实施计划（2026-10-16；Chat 执行入口已由 2026-10-29 计划接替）](2026-10-16-learning-agent-implementation.md)
- [AI 统一限额与用量治理独立方案（2026-10-16；待实施）](2026-10-16-ai-unified-limits.md)
- [AI 执行预算治理近期阶段 0–3 计划（2026-10-13；模型/预算诊断、token 影子估算、Overview 有界恢复与 Chat 流式故障回放）](2026-10-13-ai-execution-budget-governance.md)
- [RAG 默认开启实施计划与证据（2026-10-12；跨端代码、定向测试与构建完成，业务待实测）](2026-10-12-rag-always-on.md)
- [大 PDF 摄入额度与同步等待诊断、最小修复（2026-10-12，代码与定向验证通过；新补丁未部署）](2026-10-12-pdf-ingestion-quota-and-sync.md)
- [Embedding 额度排除与单人测试额度（2026-10-12，代码、相关验证与本机部署通过；业务待实测）](2026-10-12-embedding-quota-exemption-and-test-limits.md)
- [AI 完整持久配额与个人中心额度实施计划（2026-10-10，代码、相关自动验证及只读审查通过）](2026-10-10-ai-usage-guard-b.md)
- [AI IMPORTANT 修复实施计划与证据（2026-10-10，相关自动验证及只读审查通过；真实环境待验收）](2026-10-10-ai-important-fixes.md)
- [提问选中文本传递与后端处理（2026-10-01）](2026-10-01-chat-selected-text.md)
- [AI env 默认 Provider 与 BYOK 覆盖实施计划（2026-08-21）](2026-08-21-ai-env-provider-fallback.md)

### PC 与多端前端

- [PC 时间轴放置与交换修复实施计划（2026-10-07）](2026-10-07-timeline-placement-and-swap-fixes.md)
- [PC 时间轴日期与拖放修复实施计划（2026-10-06）](2026-10-06-timeline-date-and-drag-fixes.md)
- [PC 学习数据清理、专注统计与 Overview 同步实施计划（2026-10-01）](2026-10-01-pc-learning-data-cleanup-and-sync.md)
- [Issue 3/4 前端修复实施计划（2026-09-21）](2026-09-21-issues-3-4-frontend-fixes.md)
- [PC OCR 运行时页级进度恢复实施计划（2026-09-18）](2026-09-18-pc-ocr-runtime-progress.md)
- [PC Local Asset Store 全栈实施计划（2026-09-16）](2026-09-16-pc-local-asset-store.md)
- [PC PDF 混合页面处理阶段修复实施计划（2026-09-09）](2026-09-09-pc-pdf-mixed-page-phase-fix.md)
- [PC OCR 诊断与空白页容错实施计划（2026-09-08）](2026-09-08-pc-ocr-diagnostics-and-empty-page.md)
- [PC 文档处理稳定性实施计划（2026-09-06）](2026-09-06-pc-document-processing-stability.md)
- [PC 文件上传后处理与统计接口恢复实施计划（2026-09-05）](2026-09-05-upload-processing-recovery.md)
- [PC 本地数据库重置与孤儿 Source 终止实施计划（2026-09-05）](2026-09-05-pc-local-database-reset-and-orphan-source-cleanup.md)
- [PC 单一文件预览实施计划（2026-09-04）](2026-09-04-single-file-preview.md)
- [PC Subject 全局主题色清理实施计划（2026-09-04）](2026-09-04-pc-subject-theme-color-cleanup.md)
- [PC 本地优先同步核心实施计划（2026-09-04）](2026-09-04-pc-local-first-sync-core.md)
- [PC 文档处理密钥恢复边界实施计划（2026-09-04）](2026-09-04-pc-document-encryption-recovery.md)
- [PC SQLite 并发写入修复实施计划（2026-09-03）](2026-09-03-pc-sqlite-concurrency-remediation.md)
- [PC 已完成排期任务固定实施计划（2026-09-03）](2026-09-03-pc-completed-scheduled-task-lock.md)
- [资产库本地优先加载实施计划（2026-09-03）](2026-09-03-asset-local-first-loading.md)
- [PC PDF Runtime 一致性与文档处理可观测性实施计划（2026-09-01）](2026-09-01-pc-pdf-runtime-and-processing-observability.md)
- [PC 时间轴过去时段保护实施计划（2026-08-31）](2026-08-31-pc-timeline-past-slot-guard.md)
- [PC Tauri AI 辅助阅读全流程实施计划（2026-08-24）](2026-08-24-pc-tauri-ai-assisted-reading.md)
- [PC 学科文件查看器预览实施计划（2026-08-22）](2026-08-22-subject-file-viewer-preview.md)
- [PC 首页时间轴与任务逻辑实施计划（2026-08-22）](2026-08-22-pc-dashboard-task-logic.md)
- [R4 Mobile / Tablet 客户端迁移实施计划（2026-08-20）](2026-08-20-r4-mobile-tablet-migration.md)
- [R4 PC 全量客户端迁移实施计划（2026-08-17）](2026-08-17-r4-pc-full-migration.md)
- [PC 学习页 AI 伴读移动端视觉复刻实施计划（2026-07-14）](2026-07-14-pc-workspace-ai-mobile-visual.md)
- [PC 学科线条图标实施计划（2026-07-14）](2026-07-14-pc-subject-outline-icon.md)
- [PC 学科工作区重建实施计划（2026-07-13）](2026-07-13-pc-subject-workspace-reconstruction.md)

### 后端与数据平台

- [后端绿地重写阶段 0 实施计划](backend-greenfield-phase-0-plan.md)
- [Source 永久删除与单 PC 会话实施计划（2026-09-21）](2026-09-21-source-permanent-delete-and-single-pc.md)
- [Build 与 OpenAPI 客户端门禁修复实施计划（2026-09-12）](2026-09-12-build-and-openapi-client-gates-remediation.md)
- [Server 全量测试前三类失败修复实施计划（2026-09-11）](2026-09-11-server-full-test-gates-remediation.md)
- [Jackson 3 JSON 类型统一实施计划（2026-09-01）](2026-09-01-jackson3-json-type-unification.md)
- [默认容器测试实施计划（2026-08-17）](2026-08-17-default-container-tests.md)
- [R1-06 后端工具链和运行配置实施计划（2026-08-17）](2026-08-17-backend-r1-06-toolchain-config.md)
- [R1-05 并发与分页实施计划（2026-08-17）](2026-08-17-backend-r1-05-concurrency-pagination.md)
- [R1-01 Provider 安全实施计划（2026-08-16）](2026-08-16-r1-01-provider-security.md)
- [后端阶段五 AI 与 RAG 实施计划（2026-08-16）](2026-08-16-backend-phase-5-ai-rag.md)
- [后端阶段 3/4 同步、复习、统计与实时实施计划](2026-08-13-backend-phase-3-4-sync-review-realtime.md)
- [后端阶段 2B Source、Asset、Relation 实施计划](2026-08-12-backend-phase-2b-source-asset-relation.md)
- [后端阶段 2A 核心领域实施计划](2026-08-12-backend-phase-2-core-domain.md)
- [后端阶段 1 身份实施计划](2026-08-12-backend-phase-1-identity.md)

### 学习、任务与产品能力

- [PC 任务截止日期与排期一致性修复（2026-10-10，代码与自动验证通过；真实环境待验收）](2026-10-09-task-deadline-date-consistency.md)
- [学科复习与统计完整本地使用（2026-10-09，代码与自动验证通过；真实环境待验收）](2026-10-09-review-stats-local-first.md)
- [学科复习与统计实施计划（2026-10-08）](2026-10-08-subject-review-stats-implementation.md)
- [学科复习、学习与掌握退出实施记录（2026-10-08，相关自动验证及只读审查通过）](2026-10-08-review-learning-mastery-implementation.md)
- [学科复习、学习与掌握退出整体设计（2026-10-08，代码与相关自动验证通过；真实环境待验收）](2026-10-08-review-learning-mastery-design.md)
- [学科内复习与统计页面方案（2026-10-07 建立，2026-10-08 实施；真实环境待验收）](2026-10-07-subject-review-redesign.md)
- [PC / Service 三项优先问题修复（2026-10-07）](2026-10-07-priority-function-fixes.md)
- [PC 未排期任务截止后自动完成（2026-10-06）](2026-10-06-unscheduled-task-deadline.md)
- [任务完整排期截止时间校验（2026-10-06）](2026-10-06-task-schedule-deadline-guard.md)
- [Task 颜色能力全栈移除实施计划（2026-09-07）](2026-09-07-remove-task-color.md)
- [Task 认知负荷全栈移除实施计划（2026-09-07）](2026-09-07-remove-task-cognitive-load.md)
- [Subject 专属颜色移除前端实施计划（2026-09-03）](2026-09-03-remove-subject-color-frontend.md)
- [Subject 专属颜色移除后端实施计划（2026-09-03）](2026-09-03-remove-subject-color-backend.md)

## 相关入口

- [文档中心](../README.md)
- [计划目录](../planning/README.md)
- [当前状态](../current/Status.md)
- [问题和审查](../current/IssuesAndReview.md)
- [设计文档索引](../design/README.md)
