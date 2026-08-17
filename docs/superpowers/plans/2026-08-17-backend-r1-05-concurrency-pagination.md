# R1-05 并发、版本和分页实施计划

## 目标

完成 `PreDeploymentReadinessTasks.md` 中 R1-05：会话删除版本校验、消息并发序号、核心列表不透明 cursor、Sync 保留清理调度/指标/reset，以及对应自动化测试。

## 设计

1. **Conversation / Message**
   - 新增 `conversations.version` 和 `conversations.next_message_sequence`，初始值均为 `0`。
   - `ConversationEntity.version` 使用 JPA `@Version`；会话响应暴露 `version`。
   - 删除会话前比较 `baseVersion`，冲突返回 `RESOURCE_VERSION_CONFLICT` 及当前 DTO。
   - 追加消息时对活动会话行使用悲观写锁，递增 `next_message_sequence` 分配序号，不再查询 `max(message_sequence)`。

2. **核心列表**
   - Subject、KnowledgeBlock、Task、Source、Relation 统一采用 keyset 分页。
   - Subject cursor 包含 `sortKey + updatedAt + id`；其他资源 cursor 包含 `updatedAt + id`。
   - cursor 使用带资源类型的 Base64URL 不透明编码；非法或跨资源 cursor 返回校验错误。
   - `limit` 默认 100、最大 200；查询 `limit + 1` 计算 `hasMore`，只在存在下一页时返回 `nextCursor`。

3. **Sync 保留清理**
   - 保留 30 天策略，增加可配置的定时清理入口。
   - 通过 Micrometer 记录清理总量、清理失败和过期 cursor reset 次数。
   - 保留高水位 cursor；清理造成客户端 cursor 无法连续恢复时返回 `resetRequired=true`。

4. **验证**
   - 先补失败测试：会话版本冲突、并发消息序号唯一、五类列表分页边界/稳定性/用户隔离、清理后的 cursor reset 与高水位延续。
   - 运行相关测试、`git diff --check`，最后运行后端全量 Maven 测试。

## 执行结果

2026-08-17：R1-05 定向套件 16/16 通过；`mvn -B -ntp clean test` 126 通过、0 失败/错误、1 个 opt-in PostgreSQL 测试跳过；ArchitectureTests 通过。真实 PostgreSQL 全量并发、生产定时调度、前端联调和人工验收仍不在本轮证据范围。

## 文档回写

实现后同步：

- `docs/contracts/API.md`
- `docs/contracts/Database.md`
- `docs/modules/Backend.md`
- `docs/current/Status.md`
- `docs/current/IssuesAndReview.md`
- `docs/planning/PreDeploymentReadinessTasks.md`
- `docs/release/Changelog.md`
