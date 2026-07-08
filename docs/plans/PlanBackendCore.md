# 后端核心计划

更新时间：2026-07-02

## 目标

把 `StudyCore-Server` 从“能编译、接口已存在”推进到“关键安全和同步路径有测试保护”。本计划覆盖后端业务核心，不覆盖 AI 深度能力，AI 见 `PlanAIRag.md`。

## 当前事实

核心 Controller：

- `AuthController`
- `KnowledgeBlockController`
- `TaskBlockController`
- `SyncController`
- `AssetController`
- `FileStorageController`
- `AiController`
- `StatsController`
- `BlockRelationController`

已完成基线：

- BCrypt 密码存储和旧明文迁移。
- 普通接口拒绝 refresh token。
- 资产查询和绑定归属校验。
- AI Key 不再由前端请求头覆盖。
- MutationLog 删除路径已改软删除。

未闭环风险：

- 缺少真实测试源码。
- 直接 CRUD 删除与同步删除语义未完全统一。
- MinIO 对象真实性校验未补。
- WebSocket 生命周期鉴权未验收。
- `application-prod.yml` 仍需配置口径统一。

## 任务清单

| ID | 优先级 | 任务 | 状态 | 输入 | 产出 | 验收 |
| --- | --- | --- | --- | --- | --- | --- |
| BE-01 | P1 | Auth 测试补齐 | 计划中 | AuthController、UserService | 登录、注册、刷新测试 | 覆盖成功、失败、refresh 误用 |
| BE-02 | P1 | 密码迁移测试 | 计划中 | BCrypt 迁移逻辑 | 旧明文登录后升级为 BCrypt | 数据库密码字段变为 hash |
| BE-03 | P1 | Asset 归属测试 | 计划中 | AssetController、AssetService | 跨用户查询和绑定测试 | 不能访问他人 asset/objectName |
| BE-04 | P1 | Sync push/pull 测试 | 计划中 | SyncController、MutationLogService | cold start、incremental pull 测试 | 增量和冷启动结果一致 |
| BE-05 | P1 | 删除语义统一 | 进行中 | Block/Task Controller、MutationLog | CRUD 删除也走软删除或明确边界 | 删除后冷启动不恢复 |
| BE-06 | P1 | MinIO 对象校验 | 计划中 | FileStorage、AssetService、MinIO client | 校验对象存在、大小、content-type | 伪造 objectName 绑定失败 |
| BE-07 | P1 | WebSocket 鉴权 | 计划中 | WebSocket config、JWT 工具 | 握手鉴权和 token 过期策略 | 过期 token 连接被拒或断开 |
| BE-08 | P2 | 生产配置统一 | 进行中 | `application.yml`、`application-prod.yml` | LangChain4j 配置键统一 | prod 不再使用旧 `spring.ai.openai` |
| BE-09 | P2 | Stats 接口验收 | 已构建待验收 | StatsController | 概览、周统计数据合理 | 空数据和有数据都返回稳定结构 |
| BE-10 | P2 | Controller API 文档同步 | 已构建待验收 | 所有 Controller | `APIManifest.md` 更新 | Controller 路由无遗漏 |

## 建议执行顺序

1. `BE-01` 到 `BE-04`：先建立测试保护网。
2. `BE-05` 和 `BE-06`：处理同步和资产高风险问题。
3. `BE-07`：补长连接安全。
4. `BE-08` 到 `BE-10`：补配置、统计和文档同步。

## 推荐测试范围

- `AuthController` 集成测试。
- `AssetController` / `AssetService` 服务测试。
- `SyncController` / `MutationLogService` 集成测试。
- 删除语义回归测试。
- WebSocket 鉴权测试可先做服务层或握手拦截器测试。

## 完成定义

- `mvn test` 通过，且包含真实测试源码。
- Auth、Asset、Sync、Delete 至少有 P1 测试覆盖。
- 生产配置口径统一。
- `APIManifest.md`、`Backend.md`、`StatusIndex.md` 已同步。
