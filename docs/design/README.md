# Auralis 设计文档索引

更新时间：2026-10-29

文档状态：现行分类索引

权威范围：`design/` 下现行设计依据和按领域组织的设计记录导航

事实来源：`docs/README.md`、`docs/design/` 目录与各文档标题

本页只负责导航；文件保留在原目录，具体状态和验证证据以各文档正文为准。

## 现行权威文档

- [文档架构设计](DocumentationArchitecture.md)
- [前端设计](Frontend.md)

## 按领域索引

### Overview

- [内容规模自适应总览设计（2026-10-18）](2026-10-18-overview-adaptive-generation-design.md)
- [Overview Reduce Prompt 均衡压缩设计（2026-09-20）](2026-09-20-overview-reduce-prompt-compression-design.md)
- [Overview 手动重试、收敛预算与错误码设计（2026-09-14）](2026-09-14-overview-retry-and-convergence-design.md)
- [PC 文件 Overview 触发链诊断设计（2026-09-10）](2026-09-10-pc-overview-trigger-diagnostics-design.md)
- [Overview Source 删除屏障设计（2026-09-10）](2026-09-10-overview-source-deletion-fence-design.md)
- [PC 学科总览与文件 AI 总结设计（2026-09-09）](2026-09-09-pc-subject-overview-ai-design.md)

### AI 与模型治理

- [Chat Agent 与流式可视化教学现行方案（2026-10-29；需求已确认，实施计划）](../plans/2026-10-29-chat-agent-visual-teaching.md)
- [学习 Agent 原产品与交互设计（2026-10-16；Chat 范围已由 2026-10-29 方案接替）](2026-10-16-learning-agent-design.md)
- [AI 用量预算、并发保护与 Provider 资源隔离设计（2026-09-14）](2026-09-14-ai-usage-guard-design.md)
- [AI env 默认 Provider 与 BYOK 覆盖设计（2026-08-21）](2026-08-21-ai-env-provider-fallback-design.md)

### PC 与多端前端

- [Issues 2–4 修复设计：Source 生命周期、连接状态与 Overview 反馈（2026-09-21）](2026-09-21-issues-2-4-remediation-design.md)
- [PC OCR 运行时页级进度恢复设计（2026-09-18）](2026-09-18-pc-ocr-runtime-progress-design.md)
- [PC Local Asset Store 本地优先文件资料库设计（2026-09-15）](2026-09-15-pc-local-asset-store-design.md)
- [PC PDF 混合页面处理阶段修复设计（2026-09-09）](2026-09-09-pc-pdf-mixed-page-phase-design.md)
- [PC OCR 诊断与空白页容错设计（2026-09-08）](2026-09-08-pc-ocr-diagnostics-and-empty-page-design.md)
- [PC 文件上传后处理与统计接口恢复设计（2026-09-05）](2026-09-05-upload-processing-recovery-design.md)
- [PC 本地数据库重置与孤儿 Source 终止设计（2026-09-05）](2026-09-05-pc-local-database-reset-and-orphan-source-design.md)
- [PC 单一文件预览设计（2026-09-04）](2026-09-04-single-file-preview-design.md)
- [PC 文档处理密钥恢复边界设计（2026-09-04）](2026-09-04-pc-document-encryption-recovery-design.md)
- [资产库本地优先加载设计（2026-09-03）](2026-09-03-asset-local-first-loading-design.md)
- [PC PDF Runtime 一致性与文档处理可观测性设计（2026-09-01）](2026-09-01-pc-pdf-runtime-and-processing-observability-design.md)
- [PC 时间轴过去时段保护设计（2026-08-31）](2026-08-31-pc-timeline-past-slot-guard-design.md)
- [PC Tauri AI 辅助阅读全流程设计（2026-08-23，2026-08-24 技术复核修订）](2026-08-23-pc-tauri-ai-assisted-reading-design.md)
- [PC 学科文件上传与预览设计（2026-08-22）](2026-08-22-subject-file-upload-preview-design.md)
- [PC 首页时间轴与任务逻辑设计（2026-08-22）](2026-08-22-pc-dashboard-task-logic-design.md)
- [PC 学习页 AI 伴读移动端视觉复刻设计（2026-07-14）](2026-07-14-pc-workspace-ai-mobile-visual-design.md)
- [PC 学科线条图标设计（2026-07-14）](2026-07-14-pc-subject-outline-icon-design.md)
- [PC 学科工作区重建设计（2026-07-13）](2026-07-13-pc-subject-workspace-reconstruction-design.md)
- [PC 学科工作区大纲三栏布局规格（2026-07-13）](2026-07-13-pc-subject-outline-three-column-design.md)

### 后端与数据平台

- [Server 全量测试前三类失败修复设计（2026-09-11）](2026-09-11-server-full-test-gates-remediation-design.md)
- [Build 与 OpenAPI 客户端门禁修复设计（2026-09-11）](2026-09-11-build-and-openapi-client-gates-remediation-design.md)
- [R4 PC 全量客户端迁移与 Tauri 重写设计（2026-08-17）](2026-08-17-r4-01-pc-auth-realtime-design.md)
- [R1-06 后端工具链和运行配置设计（2026-08-17）](2026-08-17-backend-r1-06-toolchain-config-design.md)
- [R1-01 Provider 安全设计](2026-08-16-r1-01-provider-security-design.md)
- [后端阶段五 AI 与 RAG 设计（2026-08-16）](2026-08-16-backend-phase-5-ai-rag-design.md)

### 学习、任务与产品能力

- [Task 颜色能力全栈移除设计（2026-09-07）](2026-09-07-remove-task-color-design.md)
- [Task 认知负荷全栈移除设计（2026-09-07）](2026-09-07-remove-task-cognitive-load-design.md)
- [Subject 专属颜色移除设计（2026-09-02）](2026-09-02-remove-subject-color-design.md)

## 相关入口

- [文档中心](../README.md)
- [当前状态](../current/Status.md)
- [实施方案索引](../plans/README.md)
