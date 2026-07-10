# Auralis 任务总览

更新时间：2026-07-02

## 当前判断

项目已经完成基础架构搭建、主要前后端骨架和文档整理，但当前真正决定推进效率的，不是继续扩需求，而是把前端重构、后端测试、安全边界和发布准备收口。

## 当前阶段重排

| 领域 | 当前状态 | 核心结论 |
| --- | --- | --- |
| PC 前端 | 进行中 | 路由和页面存在，但仍处于重构期，登录守卫未恢复 |
| Mobile / Tablet | 进行中 | H5 可构建，平板页面仍在重构和迁移 |
| 后端核心 | 已构建待验收 | 主要 Controller 已存在，安全修复已做，但缺少真实测试 |
| AI / RAG | 已构建待验收 | `/api/ai/*` 可用，质量、配置和检索链路仍需验收 |
| Infra / Release | 进行中 | Docker Compose 可跑，本地链路有基础，但生产发布未闭环 |
| 文档 / 验收 | 进行中 | 文档体系已成型，需要跟着代码持续收口 |

## 总优先级

1. 收口前端重构。
2. 补后端测试。
3. 统一删除和同步语义。
4. 补 MinIO 对象校验。
5. 验收 WebSocket 生命周期。
6. 清理生产配置并建立 CI/CD。
7. 做人工验收和交付文档收口。

## 里程碑拆分

| 里程碑 | 范围 | 退出条件 |
| --- | --- | --- |
| M1 主流程收口 | PC、Mobile / Tablet、Backend P1 任务 | 前端无主要死链，登录/学科/资产/同步主链路可跑 |
| M2 安全和一致性 | Auth、Asset、Sync、Delete、WebSocket | P1 安全问题有测试或人工验收依据 |
| M3 发布准备 | Infra、Docs、CI/CD、Runbook | 有最小 CI/CD，部署演练和发布检查清单完成 |
| M4 AI 增强 | RAG、Re-ranker、Agent | 主链路稳定后再进入，不阻塞 M1-M3 |

## 本轮建议领取任务

| 顺序 | 任务 | 来源 |
| --- | --- | --- |
| 1 | 恢复 PC 登录守卫 | `PlanFrontendPC.md#PC-01` |
| 2 | 平板页面注册收口 | `PlanFrontendMobileTablet.md#MT-01` |
| 3 | Auth 测试补齐 | `PlanBackendCore.md#BE-01` |
| 4 | Asset 归属测试 | `PlanBackendCore.md#BE-03` |
| 5 | Sync push/pull 测试 | `PlanBackendCore.md#BE-04` |
| 6 | 生产配置统一 | `PlanBackendCore.md#BE-08`、`PlanInfraRelease.md#IR-03` |

## 推荐推进顺序

### 第一批：先把主流程拉直

- `PlanFrontendPC.md`
- `PlanFrontendMobileTablet.md`
- `PlanBackendCore.md`

目标：

- 前端入口、路由、导航、Store、API 调用一致。
- 后端关键接口有测试保护。
- 登录、同步、资产、AI 主流程能走通。

### 第二批：把发布风险降下来

- `PlanInfraRelease.md`
- `PlanDocsAcceptance.md`

目标：

- 配置、默认密码、CI/CD、部署演练、Runbook 到位。
- 构建通过与人工验收的口径分清楚。

### 第三批：再推进增强能力

- `PlanAIRag.md`

目标：

- 在主链路稳定后，再推进 Parent-Child RAG、Re-ranker、知识图谱深度能力。

## 关键依赖

| 任务 | 依赖 |
| --- | --- |
| 恢复 PC 登录守卫 | Auth Store、登录流程、受保护路由口径稳定 |
| 平板页面收口 | 页面迁移范围明确，旧 `asset` / `timeline` 能力去向明确 |
| 补后端测试 | 当前 Controller、Service 语义先稳定 |
| WebSocket 生命周期验收 | Auth、Sync、前端重连策略明确 |
| CI/CD 建立 | 构建命令和文档路径稳定 |

## 风险门禁

以下任一项未解决时，不建议进入正式发布：

- PC 登录守卫仍临时关闭。
- 后端仍没有 Auth / Asset / Sync 真实测试。
- 删除语义仍可能导致数据复活。
- MinIO 绑定仍可伪造 objectName。
- WebSocket token 过期策略仍未明确。
- Docker Compose 默认密码仍被当作生产配置。

## 暂不作为当前里程碑完成条件

- 完整生产级 RAG 评估。
- 完整 E2EE。
- 小程序、App、Harmony 全平台上线。
- 企业级多租户权限模型。
