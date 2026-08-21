# Auralis 数据库与端侧数据契约

更新时间：2026-08-17

文档状态：阶段 1 Identity V1、阶段 2A Subject/KnowledgeBlock/Task V2、阶段 2B Source/Asset/Relation V3、阶段 3 Sync V4/V6 与阶段 4 Review/Stats/Realtime V5、Task V7、阶段 5 AI/RAG V8–V14 已实现；R1 AI 并发保留与离线会话恢复键已通过测试，默认容器门禁已完成，真实 Provider 和前端验收仍未完成

权威范围：新 Server PostgreSQL/pgvector 表、Entity 映射、同步字段、端侧离线副本和 Tablet 专有数据边界。

事实来源：docs/plans/backend-greenfield-rewrite-plan.md、docs/contracts/ObjectModelMatrix.md、替换前旧 Server 的 DDL/Entity/Mapper 与 PC/Mobile localDb。

## 数据源边界

| 数据源 | 新后端目标作用 | 阶段 0 状态 |
| --- | --- | --- |
| PostgreSQL 17 + pgvector | 用户、业务资源、同步日志、任务、事件、RAG chunk 和向量 | V1–V14 已创建；默认容器集成已验证 |
| MinIO | Asset 物理对象内容 | 设计已确定，阶段 2/5 接入 |
| PC/Mobile 本地数据库 | 用户按 userId 分区的离线副本 | PC 使用 v2 repository/schema；Mobile 按 userId/deviceId 使用独立 H5/SQLite namespace |
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
| tasks | 任务和排期 | user、status、scheduled、due 索引；`completed_at` 记录进入 DONE 的时间 |
| relations | 跨对象关系 | 节点类型 CHECK；定向/无向去重 |
| review_parameter_sets | FSRS 参数版本 | scheduler/version 唯一 |
| review_states | 每个知识块当前复习状态 | knowledge_block_id 唯一；user/due 索引 |
| review_events | 不可变复习历史 | user_id + client_event_id 唯一 |
| change_log | 用户增量同步日志 | 用户域内递增 BIGINT cursor；user_id + cursor 索引 |
| inbound_mutations | push 幂等结果 | user_id + device_id + client_mutation_id 唯一 |
| domain_event_outbox | 数据库事件 | status/available_at 索引；幂等消费 |
| ingestion_jobs | 文档解析与索引任务 | status/available_at/lease 索引 |
| source_chunks | RAG 文本块和向量 | user/source/generation/ordinal 唯一；active generation 查询索引；PostgreSQL vector(1024) HNSW 索引 |
| ai_credentials | 用户 BYOK 密文 | user_id + provider 唯一；只存密文 |
| conversations | AI 会话 | user/updated/deleted 索引；version 乐观版本、next_message_sequence 并发序号计数器及 user + client request id 恢复键 |
| messages | AI 消息 | conversation + sequence 唯一；user + client request id 幂等键；assistant 的 reply_to_message_id 精确关联 USER 消息 |

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
- `knowledge_blocks` 保存 `subject_id`、可空 `source_id`、`title`、`summary`、正文 `content`、JSON 文本 `tags` 和 `color_override`。阶段 2B 已创建 `sources` 表、补齐 `source_id` 外键和服务层归属/活动状态校验。
- `tasks` 保存 `subject_id`、`title`、`description`、`status`、`scheduled_at`、`due_at`、`duration_minutes`、`cognitive_load`、`sort_key`、`color_override`；数据库 CHECK 与服务同时约束状态、认知负荷、非负时长和排期顺序。
- KnowledgeBlock/Task 对 Subject 的引用在服务层按当前 `userId` 校验；跨用户或已删除 Subject 不可创建、更新或恢复子资源。三表外键均为 `ON DELETE RESTRICT`，普通业务删除只写 `deleted_at`。

## 阶段 2B Source、Asset、Relation V3 已实现 schema

Flyway `V3__source_asset_relation_schema.sql` 在 V2 之后新增 `assets`、`sources`、`relations`，并给 `knowledge_blocks.source_id` 补充指向 `sources(id)` 的可空 `ON DELETE RESTRICT` 外键。V3 不修改已执行的 V1/V2。

- `assets` 保存 `id`、`user_id`、`object_key`、`original_name`、`size_bytes`、`mime_type`、可空 `sha256`、`upload_status`、可空 `completed_at` 和审计时间；`(user_id, object_key)` 唯一，size 必须为正，状态为 `UPLOADING`、`READY`、`FAILED`、`ORPHANED`。Asset 不含 `version/deleted_at`，不属于普通同步资源。
- `sources` 保存共同同步字段、`type`、`subject_id`、`title`、可空 `asset_id`/`origin_url`/`raw_text`/`outline`、`ingestion_status`、安全错误码和安全错误说明；type 为 `FILE`、`TEXT`、`URL`，状态为 `PENDING`、`PARSING`、`INDEXING`、`READY`、`FAILED`。数据库外键表达用户、Subject、Asset 归属表约束，跨用户/活动状态由服务层校验。
- `relations` 保存共同同步字段、`source_type/source_id`、`target_type/target_id`、`type` 和可空 `label`；数据库 CHECK 限定四种节点和五种关系类型、端点非空、禁止同类型同 ID 自关联。Relation 的跨表端点存在性、用户隔离和 `RELATED_TO` 规范化去重由 RelationService 保证。
- 删除端点通过 shared `ResourceDeletedEvent` 由 Relation 模块批量软删除相关活动关系并递增关系版本；恢复端点不自动恢复关系。

V3 的 Entity 使用显式 DTO 边界；AssetStoragePort 抽象预签名 PUT、HEAD/stat 和预签名 GET。test profile 使用可控测试适配器，MinIO 适配器只在 `auralis.upload.storage-provider=minio` 时启用。

## 阶段 3 Sync V4 已实现 schema

Flyway `V4__sync_schema.sql` 新增 `change_log` 和 `inbound_mutations`。`change_log` 以 `(user_id, cursor)` 唯一约束维护用户域内的同步顺序，保存资源类型/ID、操作、版本、墓碑时间、稳定 JSON payload 和创建时间；`inbound_mutations` 以 `(user_id, device_id, client_mutation_id)` 唯一约束保存请求 hash、决策、change cursor、当前资源快照、错误码和审计时间。两张表均有保留清理索引，首批同步资源受 CHECK 约束限制为 Subject、Source、KnowledgeBlock、Task、Relation。

Sync push 在每条 mutation 的独立事务内先预留幂等键，再完成领域写入、change log 和最终决策，保证领域写入与幂等结果原子提交；同键 hash 不同的 mutation 只返回该条 REJECTED。`V6__sync_atomicity_and_cursor_high_water.sql` 增加 PROCESSING 决策和用户域 cursor 高水位表，cursor 分配使用行锁并在 change log 清理后保持单调。REST 领域服务和 push 通过 shared `ResourceChangedEvent` 进入同一个 change log 记录器；PostgreSQL 并发压力仍未验收。

## 阶段 4 Review、Stats、Realtime V5 已实现 schema

Flyway `V5__review_stats_realtime_schema.sql` 新增：

- `review_parameter_sets`：scheduler/version 唯一，保存不可原地覆盖的参数 JSON。
- `review_states`：用户与 KnowledgeBlock 一对一，保存 difficulty、stability、due/lastReviewed、reps、lapses、参数集和版本；用户/知识块/参数集外键与非负 CHECK 已建立。
- `review_events`：不可变复习历史，保存 clientEventId、评分、复习时间、耗时、baseVersion、调度器/版本、参数集和完整前后 ReviewState JSON 快照；`(user_id, client_event_id)` 唯一，幂等重放使用事件中的 afterState。
- `realtime_tickets`：只存 ticket hash、用户/设备、过期时间、消费时间和创建时间；hash 唯一，用户和设备外键级联清理。

V5 同时将 change log、inbound mutation 的 owner 外键改为级联删除，以免账户清理被审计/幂等记录阻塞；业务软删除仍由领域服务负责。Review/Stats 查询与 Realtime ticket 消费均按 userId 过滤。

## 阶段 3/4 审核修复迁移

- `V6__sync_atomicity_and_cursor_high_water.sql` 放宽 inbound mutation 决策约束以容纳事务内 `PROCESSING` 占位，并新增 `sync_cursor_high_water(user_id, cursor)`；高水位不随 change log 保留清理删除。
- `V7__task_completion_timestamp.sql` 为 `tasks` 新增可空 `completed_at`；任务进入 DONE 时写入，离开 DONE 时清空，保持 DONE 状态的后续编辑不改写该时间。weekly completed task 统计按该字段过滤，而不是按 `updated_at`。

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

保存 subjectId、title、description、status、scheduledAt、dueAt、durationMinutes、cognitiveLoad、sortKey、colorOverride、completedAt 和共同字段。status 固定为 TODO、IN_PROGRESS、DONE、CANCELLED；completedAt 表示最近一次进入 DONE 的服务器时间。排期不自动改变状态；cognitiveLoad 使用 LOW、MEDIUM、HIGH 稳定代码。

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

### PC R4-06 本地副本边界（2026-08-20）

`Auralis-PC/src/services/localSchema.ts` 与 `localRepository.ts` 定义了新的端侧 v2 边界：

- Tauri SQLite 使用 `sync_metadata(user_id, device_id, cursor, reset_required, schema_version)`、`local_resource_records(user_id, resource_type, resource_id, version, deleted_at, sync_status, payload)` 和 `local_mutations(client_mutation_id, user_id, resource_type, resource_id, mutation_type, base_version, payload, status, created_at, error)`；资源主键、mutation 主键 `(user_id, client_mutation_id)` 和查询均包含当前用户域。
- 浏览器 fallback 使用 `auralis:v2:<userId>:<deviceId>:state` namespace，业务记录、tombstone、mutation 和 cursor 不再写入新的全局未命名业务 key。`localDb.ts` 中的旧全局 key/字段仅作为尚未迁移 Store 的兼容 facade，Task 7/8 完成后应移除。
- repository 对外返回 camelCase `LocalEntity`/`LocalMutation` DTO；snake_case 只存在于 SQLite adapter。`baseVersion` 不匹配返回 `LocalConflictError`，删除保留 `deletedAt` tombstone，snapshot reset 会保留当前用户所有 pending mutation 及其本地 payload。
- 旧 account-less localStorage 数据仅复制到 `auralis:legacy_unassigned:v1` 备份空间；Tauri 旧 SQLite 资源行复制到 `legacy_unassigned_records`，均保留原值。首次登录必须由用户明确选择“导入当前账号”或“保留未归属备份”，不得静默归属或删除。

该边界已用临时内存 SQLite 与独立 localStorage namespace 覆盖用户隔离、旧 SQLite 行备份、tombstone、版本冲突、snapshot pending 保留和 legacy backup；真实 Tauri plugin、跨版本旧数据库升级和 GUI 迁移选择仍未验收。

### Mobile R4 本地副本边界（2026-08-20）

- `localDataScope.ts` 将当前 `userId:deviceId` 映射为稳定 scope；H5 表键为 `auralis:local:<scope>:<table>`，原生 SQLite 使用 `_doc/auralis_<scope>.db`，Pomodoro 今日计数使用同一 scope 前缀，切换账号不会打开另一账号的活动副本。
- 本地 mutation 使用独立 `clientMutationId`，push 映射到冻结的 `resourceType/mutationType/baseVersion/payload`；cursor 元数据带 userId/deviceId，冲突或拒绝结果保留 pending mutation。`resetRequired` 先取得完整 snapshot，再为同一用户/设备切换到新的 reset generation scope 并重建，旧一代不在中途删除。
- 用户已明确授权删除旧库；`legacyDataPurge.ts` 在认证会话建立后一次性移除旧 H5 `h5_db_*` 业务键，或删除旧 `_doc/auralis.db` 内的业务表，并写入完成标记。新隔离库和 Tablet feature-flag 本地笔记边界不因该清理扩大到云同步。
- 自动证据覆盖 scope 隔离、协议映射、静态旧协议扫描与双构建；真实原生 SQLite 升级、双账号/双设备、冲突选择和 snapshot reset 仍需设备联调。

Tablet NoteDocument 的 pages、strokes、snapshot、viewport、background 和二进制资源仍属于端侧专有数据，不进入本阶段 Server 表。

## 旧 Server 事实

旧 Server 的程序化 DbMigrationConfig 与 V2__add_encrypted_payload.sql 混用，存在 task_block.position 的 DDL/Entity 漂移、BlockRelation 缺少直接 userId、统一 Result 和旧 sync_version/is_deleted 语义。旧表、DDL、encryptedPayload、Milvus 和 Redis 不作为新 schema 的输入。

## 迁移状态

阶段 1 已创建 `V1__identity_schema.sql`，阶段 2A 已新增 `V2__core_domain_schema.sql`，阶段 2B 已新增 `V3__source_asset_relation_schema.sql`，阶段 3/4 已新增 `V4__sync_schema.sql`、`V5__review_stats_realtime_schema.sql`、`V6__sync_atomicity_and_cursor_high_water.sql` 和 `V7__task_completion_timestamp.sql`；阶段 5/R1 已新增 `V8`–`V14`。迁移在 H2 PostgreSQL mode 和 PostgreSQL 17/pgvector 容器的空库中验证 Flyway version `1→...→14`、表结构、外键和 JPA `ddl-auto=validate`。迁移只针对干净新数据库，不接管旧 schema，也不提供旧数据迁移或回滚到旧 schema 的脚本。

阶段 3/4 审核后验证边界：`Auralis-Server\mvnw.cmd -B -ntp clean test` 通过 69 个自动测试；PostgreSQL 17/pgvector、Testcontainers、Docker、真实 MinIO、双设备和生产迁移演练仍未声称通过。R3 的 OpenAPI/SDK 只冻结 HTTP DTO、字段和游标/版本冲突策略，不改变数据库 schema 或端侧旧表迁移边界。

## 阶段 5 AI/RAG schema（V8–V14，2026-08-20）

- `V8__ai_rag_schema.sql` 新增 `ai_credentials`、`ingestion_jobs`、`source_chunks`、`conversations`、`messages`。所有表均保存 `user_id` 或可通过会话/Source 追溯用户，并建立用户/资源外键和查询索引。
- `ai_credentials` 按 `(user_id, provider)` 唯一；API key 只保存 AES-GCM 生成的 `api_key_ciphertext` 和 `key_version`，数据库不保存明文 key。Provider 当前约束为 `DEEPSEEK`、`OPENAI_COMPATIBLE`、`SILICONFLOW`。
- `ingestion_jobs` 保存 Source ingestion 状态、attempt、lease、错误安全摘要及开始/完成时间；当前状态约束为 `PENDING`、`PARSING`、`INDEXING`、`READY`、`FAILED`。worker 通过 `PESSIMISTIC_WRITE` claim-next 选择最早任务，`PARSING/INDEXING` 的过期 lease 可恢复；达到最大 attempt 后进入 `FAILED`，当前不新增 schema 列。
- `source_chunks` 保存 ordinal、正文、SHA-256、字符偏移、兼容性 `embedding_json`、`generation` 和 `active`；唯一键为 `(user_id, source_id, generation, ordinal)`。embedding 业务校验固定为 1024 个有限浮点数。
- `conversations` 支持用户隔离和软删除；`messages` 保存 `message_sequence`、`role`、`status`、正文、模型和安全错误元数据，按 `(conversation_id, message_sequence)` 唯一；USER 消息可保存 `client_request_id`，按 `(user_id, client_request_id)` 唯一用于安全重试。
- `V9__postgres_vector_support.java` 仅在 PostgreSQL 增加 `vector` 扩展、`source_chunks.embedding vector(1024)` 和 HNSW cosine 索引；H2 使用 V8 的 JSON 兼容列，便于自动测试。
- `V10__source_chunk_generation_cutover.sql` 增加 `ingestion_jobs.generation`、`source_chunks.generation/active`、新 generation 唯一约束和活动 chunk 查询索引。新 generation 写入完成后才切换 active，失败由事务回滚并保留旧 generation。
- `V11__backfill_postgres_vectors.java` 仅在 PostgreSQL 将历史 `embedding_json` 回填到 vector 列，避免升级后旧 chunk 因 vector 为空而无法检索。
- `V12__ai_message_client_request_id.sql` 为 `messages` 增加可空 `client_request_id VARCHAR(128)`，并建立 `(user_id, client_request_id)` 唯一约束和查询索引；只有 USER 请求消息写入该键，重试通过用户隔离的键回放既有 assistant 结果。
- `V13__conversation_concurrency_control.sql` 为 `conversations` 增加 `version` 和 `next_message_sequence`，并从既有 messages 回填序号计数器；ConversationEntity 使用 `@Version`，消息追加在会话行写锁下递增计数器，避免并发 `max + 1` 竞争窗口。
- `V14__ai_request_reservation.sql` 为 `conversations` 增加可空 `client_request_id` 及 `(user_id, client_request_id)` 唯一约束；为 `messages` 增加可空 `reply_to_message_id` 自关联和查询索引。前者支持离线会话创建重试，后者保证重复 AI 请求仅回放该 USER 消息的 assistant 结果。
- PostgreSQL 写入通过 JDBC 将 1024 维 embedding 同时写入 JSON 兼容列和 vector 列；检索通过带 `user_id`、`active`、未删除 Source 过滤的 pgvector cosine SQL，并由 HNSW 索引支持排序。H2 继续使用活动 generation 的 JSON cosine fallback。

阶段 5/R1 schema 验证：H2 PostgreSQL mode 与默认 Testcontainers PostgreSQL 17/pgvector 验证 Flyway V1→V14、JPA `ddl-auto=validate`；R2 clean/upgrade 两类输入验证 V8 历史 `embedding_json` 在 V9/V11 后得到 `vector`、HNSW 索引和回填结果。R1-04/本轮并发测试验证消息幂等键、失败/断流状态、同请求仅一次 USER 保留、会话恢复键和精确 assistant 关联。
