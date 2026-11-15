# 后端核心计划

更新时间：2026-11-15

文档状态：现行计划

权威范围：鉴权、用户隔离、数据一致性、同步和 WebSocket 的后端收口

事实来源：`modules/Backend.md`、`contracts/API.md`、`contracts/Database.md`、当前风险登记

## 目标

让账号、数据、删除、同步、资产和 WebSocket 具备可重复验证的安全主流程。

## 当前事实

- 身份、资源、Sync、Review、实时 ticket 与通知已有实现，后端已有测试源码；目录、事务与数据边界见[后端模块](../modules/Backend.md)。
- 最近门禁、未关闭风险与真实环境验收见[当前状态](../current/Status.md)和[问题登记](../current/IssuesAndReview.md)，不将早期测试通过推断为当前全量通过。

## 前置条件

- 按[基础设施模块](../modules/Infrastructure.md)准备 PostgreSQL/pgvector、MinIO 与所需受控 Provider 环境。
- 测试 profile 不使用生产 secret。
- 先定义测试数据清理与用户隔离策略。

## 有序任务

1. 核对现有邮箱注册、登录、找回密码、refresh、改密、会话撤销和过期测试，补足当前明确缺口与真实双设备验收。
2. 验证知识块、任务、资产和 Relation 的跨用户拒绝及账号切换隔离。
3. 按现行 API/数据库契约验收资源删除、恢复、墓碑、mutation 和冷启动收敛。
4. 验证 Sync create/update/delete、重复回执、cursor、冷启动/增量、并发及保留清理。
5. 对现有 Asset intent/complete 校验完成真实对象存在、大小、MIME、hash、归属及异常恢复验收。
6. 按现行 Task 排期命令验证时间、版本、冲突和事务原子性；不恢复退役 `task_block.position`。
7. 按现行 Relation 多态端点和 owner 边界验收删除事件与隔离。
8. 验证一次性 ticket、`/ws/events` 通知、重连/退出和提交后通知；不恢复旧 `/ws/sync` 或 PING 协议。
9. 对现行平台生成/Embedding 分组及 BYOK 配置进行 production-like 加载与安全验证。

## 验证

```powershell
cd Auralis-Server
.\mvnw.cmd -B -ntp test
```

测试必须包含真实断言，而不是只有 Spring Context 启动。跨用户测试必须使用至少两个独立用户。

## 阻塞

- 真实外部依赖、凭据管理与目标环境条件按本次候选确认；现有 Testcontainers/受控 Provider 测试不能代替生产演练。
- 删除与恢复按当前契约执行，变更用户可见语义时再取得产品确认。

## 完成定义

- P1 Auth、删除、Asset、配置风险关闭。
- 当前排期、Relation 隔离与数据恢复风险关闭或有明确接受记录。
- Server 测试中有覆盖关键路径的测试源码并通过。
- API、数据库、状态和 Changelog 同步更新。

整理前记录见[历史快照](../archive/maintenance-2026-11-15/planning/BackendCore.md)，仅供追溯。
