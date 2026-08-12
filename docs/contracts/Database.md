# Auralis 数据库与端侧数据契约

更新时间：2026-08-12

文档状态：阶段 1 Identity V1 与阶段 2A Subject/KnowledgeBlock/Task V2 已实现并通过 H2 clean-schema/JPA validate 验证；PostgreSQL/容器集成仍未验证

权威范围：新 Server PostgreSQL/pgvector 表、Entity 映射、同步字段、端侧离线副本和 Tablet 专有数据边界。

事实来源：docs/plans/backend-greenfield-rewrite-plan.md、docs/contracts/ObjectModelMatrix.md、替换前旧 Server 的 DDL/Entity/Mapper 与 PC/Mobile localDb。

## 数据源边界

| 数据源 | 新后端目标作用 | 阶段 0 状态 |
| --- | --- | --- |
| PostgreSQL 17 + pgvector | 用户、业务资源、同步日志、任务、事件、RAG chunk 和向量 | 设计已确定，未创建迁移 |
| MinIO | Asset 物理对象内容 | 设计已确定，阶段 2/5 接入 |
| PC/Mobile 本地数据库 | 用户按 userId 分区的离线副本 | 现有实现仍使用旧字段，后续逐端迁移 |
| Tablet 本地笔记存储 | NoteDocument、stroke、snapshot、viewport 等端侧专有内容 | 不进入阶段 0 Server |
| Redis、Milvus、etcd | 旧栈组件 | 不属于新后端目标拓扑 |

## 新数据库共同字段

Subject、Source、KnowledgeBlock、Task、Relation 等同步资源至少包含：

| 字段 | 类型 | 约束/语义 |
| --- | --- | --- |
| id | UUID | 主键；API 传字符串 |
| user_id | UUID | NOT NULL，引用 users(id)，所有权边界 |
| version | BIGINT | NOT NULL、非负，由 JPA @Version 管理 |
| created_at | TIMESTAMPTZ | NOT NULL，服务器创建时间 |
| updated_at | TIMESTAMPTZ | NOT NULL，服务器更新时间 |
| deleted_at | TIMESTAMPTZ | NULL；非 NULL 表示墓碑 |

数据库字段使用 snake_case；API DTO 使用 camelCase。空值使用 SQL NULL/JSON null，不使用特殊展示值。

## 新表设计

| 表 | 主要用途 | 关键约束/索引 |
| --- | --- | --- |
| users | 用户账号 | normalized_username 唯一，status 索引 |
| refresh_sessions | refresh token rotation 链和设备会话 | token_hash 唯一；user、expiry、revoked 索引 |
| devices | 离线设备和同步状态 | user_id + device_id 唯一 |
| subjects | 用户学科和默认未分类学科 | 活跃记录按用户名称唯一（服务校验）；默认学科受保护 |
| assets | MinIO 物理对象元数据 | user_id + object_key 唯一；status 索引 |
| sources | 用户可见逻辑来源 | user、subject、status、updated 索引 |
| knowledge_blocks | 知识正文 | user、subject、source、updated 索引 |
| tasks | 任务和排期 | user、status、scheduled、due 索引 |
| relations | 跨对象关系 | 节点类型 CHECK；定向/无向去重 |
| review_parameter_sets | FSRS 参数版本 | scheduler/version 唯一 |
| review_states | 每个知识块当前复习状态 | knowledge_block_id 唯一；user/due 索引 |
| review_events | 不可变复习历史 | user_id + client_event_id 唯一 |
| change_log | 用户增量同步日志 | BIGSERIAL cursor；user_id + cursor 索引 |
| inbound_mutations | push 幂等结果 | user_id + device_id + client_mutation_id 唯一 |
| domain_event_outbox | 数据库事件 | status/available_at 索引；幂等消费 |
| ingestion_jobs | 文档解析与索引任务 | status/available_at/lease 索引 |
| source_chunks | RAG 文本块和向量 | user/source/ordinal 唯一；vector(1024) 索引 |
| ai_credentials | 用户 BYOK 密文 | user_id + provider 唯一；只存密文 |
| conversations | AI 会话 | user/updated/deleted 索引 |
| messages | AI 消息 | conversation + sequence 唯一 |

## 阶段 1 Identity V1 已实现 schema

Flyway `V1__identity_schema.sql` 是当前身份表 schema 的唯一权威来源，面向干净数据库，不接管旧 schema，也不提供旧数据迁移。V1 包含：

| 表 | 已实现字段和约束 |
| --- | --- |
| `users` | `id UUID` 主键、`username`、唯一 `normalized_username`、`password_hash`、`display_name`、`avatar_url`、`status`（ACTIVE/DISABLED CHECK）、`version BIGINT`、`created_at/updated_at TIMESTAMPTZ` |
| `devices` | `id UUID` 主键、`user_id UUID` 引用 `users`、`device_id`、`name`、`platform`、`last_active_at`、`last_pull_cursor`、`revoked_at`、`version`、审计时间；`(user_id, device_id)` 唯一 |
| `refresh_sessions` | `id UUID` 主键、`user_id`/`device_id` 外键、`rotation_family_id`、唯一 `token_hash`、`created_at`、`expires_at`、`last_used_at`、`rotated_at`、`revoked_at`、自引用 `replaced_by_session_id` |

三张表均使用 `ON DELETE RESTRICT` 的归属外键；V1 为 owner、expiry、revocation、rotation family 和 token hash 建立查询索引。JPA Entity 使用 `Instant`、UUID、字符串枚举和 `@Version` 映射，Repository 查询包含当前 `userId` 的方法不省略归属条件。

## 阶段 2A 核心领域 V2 已实现 schema

Flyway `V2__core_domain_schema.sql` 在 V1 之后新增 `subjects`、`knowledge_blocks`、`tasks` 三张表，全部使用 UUID 主键、`user_id` 归属外键、`version`、审计时间和 `deleted_at` 墓碑；Subject、KnowledgeBlock、Task 的 JPA Entity 使用 `@Version`，业务 Repository 查询显式带 `userId` 和 `deleted_at IS NULL`。

- `subjects` 保存 `name`、`description`、`icon_key`、`color`、`sort_key`、`is_default`；注册事务内创建受保护的“未分类”默认 Subject。名称唯一、默认 Subject 保护和恢复占用冲突由 SubjectService 校验。
- `knowledge_blocks` 保存 `subject_id`、可空 `source_id`、`title`、`summary`、正文 `content`、JSON 文本 `tags` 和 `color_override`。阶段 2A 尚未创建 `sources` 表，因此 `source_id` 暂只作为可空预留字段，非空写入由服务拒绝；阶段 2B 接入 Source 时补齐归属外键和校验。
- `tasks` 保存 `subject_id`、`title`、`description`、`status`、`scheduled_at`、`due_at`、`duration_minutes`、`cognitive_load`、`sort_key`、`color_override`；数据库 CHECK 与服务同时约束状态、认知负荷、非负时长和排期顺序。
- KnowledgeBlock/Task 对 Subject 的引用在服务层按当前 `userId` 校验；跨用户或已删除 Subject 不可创建、更新或恢复子资源。三表外键均为 `ON DELETE RESTRICT`，普通业务删除只写 `deleted_at`。

## 核心模型字段决策

### Subject

保存 name、description、iconKey、color、sortKey 和共同字段。注册用户时同事务创建受保护的未分类学科；Source、KnowledgeBlock、Task 必须归属 Subject。

### Asset 与 Source

Asset 保存 objectKey、originalName、sizeBytes、mimeType、sha256、uploadStatus、completedAt。状态至少为 UPLOADING、READY、FAILED、ORPHANED。

Source 保存 type、subjectId、title、assetId、originUrl、rawText、outline、ingestionStatus、safeErrorCode、safeErrorDetail 和共同字段。状态至少为 PENDING、PARSING、INDEXING、READY、FAILED。

Asset 不作为 Relation 节点，也不进入普通离线 mutation；Source 才是同步和关系中的来源节点。

### KnowledgeBlock

保存 subjectId、sourceId、title、summary、content、tags、colorOverride 和共同字段。content 是正文权威；不保存相对 time 文案、mastery 百分比、difficulty 文案、relatedBlockIds 或拼接关系标记。

### Task

保存 subjectId、title、description、status、scheduledAt、dueAt、durationMinutes、cognitiveLoad、sortKey、colorOverride 和共同字段。status 固定为 TODO、IN_PROGRESS、DONE、CANCELLED。排期不自动改变状态；cognitiveLoad 使用 LOW、MEDIUM、HIGH 稳定代码。

### Relation

节点只允许 SUBJECT、SOURCE、KNOWLEDGE_BLOCK、TASK；类型只允许 CONTAINS、REFERENCES、DERIVED_FROM、DEPENDS_ON、RELATED_TO。创建/恢复必须验证两端存在、同用户且未删除；RELATED_TO 按规范化端点顺序去重，其他类型保持方向性。

### Review

ReviewState 保存 difficulty、stability、dueAt、lastReviewedAt、reps、lapses、schedulerVersion、parameterSetId 和共同字段。ReviewEvent 不可变，保存 clientEventId、评分、复习时间、算法版本、参数版本和前后快照。SKIP 只写事件，不改变 ReviewState。

## 同步不变量

- CREATE 使用 baseVersion = 0；UPDATE、DELETE、RESTORE 精确匹配当前 version。
- Server 覆盖 mutation 的 userId，客户端不能提交或覆盖用户归属。
- 每个用户只能读取自己的实体、cursor、墓碑、事件和向量。
- REST 直接写入与 Sync push 走相同领域命令和 change log 路径。
- tombstone、change_log 和 inbound mutation 结果至少保留 30 天。
- 端点删除同事务软删除相关 Relation；端点恢复不自动恢复旧 Relation。
- 游标早于保留窗口时返回 resetRequired=true；设备执行完整 snapshot。
- snapshotCursor 与数据视图必须在可重复读事务或等价一致性策略中确定。

## 端侧现状与迁移边界

替换前 PC/Mobile localDb 仍有 sync_version、is_deleted、sync_status、position、loadText、related_block_ids、source_file_id 等旧字段；Mobile 的类型和数据库字段并不完全一致。新 API 稳定后，端侧数据库必须按 userId 分区并逐步迁移为 version/createdAt/updatedAt/deletedAt/baseVersion 语义。

Tablet NoteDocument 的 pages、strokes、snapshot、viewport、background 和二进制资源仍属于端侧专有数据，不进入本阶段 Server 表。

## 旧 Server 事实

旧 Server 的程序化 DbMigrationConfig 与 V2__add_encrypted_payload.sql 混用，存在 task_block.position 的 DDL/Entity 漂移、BlockRelation 缺少直接 userId、统一 Result 和旧 sync_version/is_deleted 语义。旧表、DDL、encryptedPayload、Milvus 和 Redis 不作为新 schema 的输入。

## 迁移状态

阶段 1 已创建 `V1__identity_schema.sql`，阶段 2A 已新增 `V2__core_domain_schema.sql`；两者均在 H2 PostgreSQL mode 的空库中验证 Flyway version `1→2`、表结构、外键和 JPA `ddl-auto=validate`。迁移只针对干净新数据库，不接管旧 schema，也不提供旧数据迁移或回滚到旧 schema 的脚本。

阶段 2A 验证边界：`Auralis-Server\mvnw.cmd -B -ntp clean test` 通过 31 个自动测试，包含 V1/V2 schema、三类 Repository owner isolation、默认 Subject、版本/软删除/恢复、Subject/KnowledgeBlock/Task MockMvc、Auth 回归和架构测试；PostgreSQL 17/pgvector、Testcontainers、Docker、MinIO 和生产迁移演练仍未声称通过。
