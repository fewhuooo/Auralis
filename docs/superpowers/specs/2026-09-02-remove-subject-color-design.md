# Remove Subject Color Design

日期：2026-09-02

## 目标

彻底移除 Subject 专属颜色能力，避免 Subject 颜色继续进入 API、数据库、本地缓存、同步协议或前端主题样式。

## 边界

### 移除

- 服务端 Subject command/view/DTO、实体字段、映射和 API schema 中的 `color`。
- PostgreSQL `subjects.color` 列，通过新增 Flyway migration 删除。
- PC 与 Mobile Subject 类型、创建/更新 payload、本地持久化和同步映射中的 Subject `color`。
- 所有依赖 `subject.color` 的卡片主题、知识图谱 subjectColor 及任务创建时的 Subject 颜色传递。

### 保留

- KnowledgeBlock 与 Task 的 `colorOverride` 及其数据库列、API 字段和界面能力。
- 图表自身的颜色序列、状态颜色和全局 Sage/语义设计色。
- Subject 的名称、描述、iconKey、sortKey、版本、删除和同步行为。

## 实施拆分

- Antigravity：仅修改 `Auralis-PC`、`Auralis-Mobile` 的前端实现、客户端生成 schema 和前端测试；不得改动后端或数据库迁移。
- 主工作树：修改 `Auralis-Server`、数据库 migration、OpenAPI/API/Database 契约和后端测试；保留现有未提交改动。

## 数据影响

`V19__remove_subject_color.sql` 只执行 `ALTER TABLE subjects DROP COLUMN color`。已有 Subject 行及其其他字段保留；该列中的颜色值不可恢复。KnowledgeBlock/Task 的 `color_override` 不受影响。

## 验收标准

1. 服务端 Subject 创建、更新、列表、同步响应不再包含 `color`，并能在 V18 数据库上成功执行 V19。
2. PC/Mobile 编译与现有 Subject/同步测试通过，且不再读写 Subject `color`。
3. `rg` 定向审查不再发现 Subject 专属颜色引用；通用 `colorOverride`、图表颜色和全局主题色仍存在。
4. 现有脏工作树中与本任务无关的变更不被覆盖、还原或删除。
