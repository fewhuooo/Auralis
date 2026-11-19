> [!WARNING]
> 本文保存 2026-11-15 整理前的工作树原文，仅供历史追溯，不作为当前实现、状态、接口或任务的依据。现行文档从 docs/README.md 进入。

<!-- ORIGINAL WORKTREE CONTENT -->
# Auralis 任务总览

更新时间：2026-07-10

文档状态：现行计划

权威范围：跨领域优先级、依赖关系、里程碑与当前建议顺序

事实来源：`current/Status.md`、`current/IssuesAndReview.md` 与领域计划

## 当前判断

项目的主风险集中在“安全与数据闭环”，不是 UI 页面数量。发布门禁必须优先覆盖鉴权、用户隔离、删除、同步、资产对象校验、配置和恢复能力。

## 优先级

| 优先级 | 目标 | 依赖 | 验收证据 |
| --- | --- | --- | --- |
| P0 | 防止数据泄露、不可逆损失和生产 secret 泄露 | Auth、Data、Infra | 跨用户测试、备份/secret 审查 |
| P1 | 打通可靠主流程 | Auth、Sync、Asset、WebSocket | 自动测试 + 多端联调 |
| P2 | 完成发布和体验门禁 | PC、Mobile、Tablet、Infra | 构建、GUI、真机、监控/发布演练 |
| P3 | 增强能力 | AI、手写、更多平台 | 核心门禁完成后专项验收 |

## 里程碑

### M1：账号与数据安全

- 恢复并验证 PC 登录守卫。
- Auth、用户隔离和 refresh token 自动测试。
- 完成 `position` 和 BlockRelation 隔离处理。

### M2：同步与资产闭环

- 统一直接删除与 mutation 删除。
- 覆盖冷启动、增量、冲突、断网与重试。
- 验证 MinIO 对象、大小、MIME 和 user prefix。
- 验证 WebSocket 生命周期。

### M3：三端主流程验收

- PC Web 主流程。
- Mobile H5、微信开发者工具与真机。
- Tablet 横屏、触控、工作区和设置。

### M4：发布准备

- 生产 LangChain4j 配置统一。
- 密钥、默认密码、CORS、bucket 权限加固。
- CI、日志、指标、告警、备份恢复演练。

### M5：增强能力

- Tablet 手写重新开启、备份与真机验收。
- AI/RAG 质量、来源、失败恢复。
- 其他平台支持。

## 推荐推进顺序

```text
BackendCore
→ FrontendPC（守卫）
→ Sync / Asset / WebSocket
→ FrontendMobileTablet 主流程
→ InfraRelease
→ AIRag 与 TabletHandwritingNotes
```

## 不属于当前完成定义

- 仅页面视觉更新。
- 仅命令行构建。
- 未验证的 Tauri、微信、真机或外部服务。
- 归档中曾经标为完成的 StudyCore 工作。
