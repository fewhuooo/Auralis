# 后端核心计划

更新时间：2026-07-10

文档状态：现行计划

权威范围：鉴权、用户隔离、数据一致性、同步和 WebSocket 的后端收口

事实来源：`modules/Backend.md`、`contracts/API.md`、`contracts/Database.md`、当前风险登记

## 目标

让账号、数据、删除、同步、资产和 WebSocket 具备可重复验证的安全主流程。

## 当前事实

- 9 个 Controller、JWT Interceptor、BCrypt、Sync pull/push、Asset 用户前缀和 WebSocket 审计代码均存在。
- `src/test` 当前没有测试源码。
- 删除语义、对象真实校验、position 漂移和 relation 隔离未关闭。

## 前置条件

- PostgreSQL、Redis、MinIO、Milvus 本地环境可启动。
- 测试 profile 不使用生产 secret。
- 先定义测试数据清理与用户隔离策略。

## 有序任务

1. 为 Auth 写注册、登录、旧密码迁移、refresh、token 类型和过期测试。
2. 为块、任务、资产、关系写跨用户拒绝测试。
3. 定义并实现 CRUD/mutation/cold-start 的统一删除状态机。
4. 为 Sync 写 create/update/delete、重复、cursor、冷启动和增量测试。
5. 对 Asset bind 增加对象存在、大小、MIME 和归属校验。
6. 统一 `task_block.position` 的 DDL、Entity、Mapper、DTO、API 和客户端语义。
7. 明确 BlockRelation 租户隔离策略并测试。
8. 为 WebSocket 握手、PING、过期审计和断连写测试。
9. 统一生产 AI 配置键并做 production-like 配置加载验证。

## 验证

```powershell
cd Auralis-Server
mvn test
```

测试必须包含真实断言，而不是只有 Spring Context 启动。跨用户测试必须使用至少两个独立用户。

## 阻塞

- 测试基础设施、外部 AI mock 策略和生产 secret 管理尚未建立。
- 删除语义需要产品确认用户可见行为和恢复策略。

## 完成定义

- P1 Auth、删除、Asset、配置风险关闭。
- P2 `position`、关系隔离风险关闭或明确延期。
- Server 测试中有覆盖关键路径的测试源码并通过。
- API、数据库、状态和 Changelog 同步更新。
