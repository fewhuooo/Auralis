# Auralis 数据库与端侧数据契约

更新时间：2026-09-08

文档状态：阶段 1 Identity V1、阶段 2A Subject/KnowledgeBlock/Task V2、阶段 2B Source/Asset/Relation V3、阶段 3 Sync V4/V6 与阶段 4 Review/Stats/Realtime V5、Task V7、阶段 5 AI/RAG V8–V14 已实现；R1 AI 并发保留与离线会话恢复键已通过测试，默认容器门禁已完成，真实 Provider 和前端验收仍未完成

权威范围：新 Server PostgreSQL/pgvector 表、Entity 映射、同步字段、端侧离线副本和 Tablet 专有数据边界。

事实来源：docs/plans/backend-greenfield-rewrite-plan.md、docs/contracts/ObjectModelMatrix.md、替换前旧 Server 的 DDL/Entity/Mapper 与 PC/Mobile localDb。

## 数据源边界

| 数据源 | 新后端目标作用 | 阶段 0 状态 |
| --- | --- | --- |
| PostgreSQL 17 + pgvector | 用户、业务资源、同步日志、任务、事件、RAG chunk 和向量 | V1–V14 已创建；默认容器集成已验证 |
| MinIO | Asset 物理对象内容 | 设计已确定，阶段 2/5 接入 |
| PC/Mobile 本地数据库 | 用户按 userId 分区的离线副本 | PC 使用 v2 repository/schema；Mobile 按 userId/serverDeviceId 使用独立 H5/SQLite namespace |
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
| devices | 离线设备和同步状态 | user_id + device_id（语义为 clientDeviceKey）唯一 |
| subjects | 用户学科；兼容历史默认标记 | 活跃记录按用户名称唯一（服务校验）；`is_default` 仅保留历史兼容语义，不阻止软删除 |
| assets | MinIO 物理对象元数据 | user_id + object_key 唯一；status 索引 |
| sources | 用户可见逻辑来源 | user、subject、status、updated 索引 |
| knowledge_blocks | 知识正文 | user、subject、source、updated 索引 |
| tasks | 任务和排期 | user、status、scheduled、due 索引；`completed_at` 记录进入 DONE 的时间 |
| relations | 跨对象关系 | 节点类型 CHECK；定向/无向去重 |
| review_parameter_sets | FSRS 参数版本 | scheduler/version 唯一 |
| review_states | 每个知识块当前复习状态 | knowledge_block_id 唯一；user/due 索引 |
| review_events | 不可变复习历史 | user_id + client_event_id 唯一 |
| change_log | 用户增量同步日志 | 用户域内递增 BIGINT cursor；user_id + cursor 索引 |
| inbound_mutations | push 幂等结果 | user_id + device_id（语义为 serverDeviceId）+ client_mutation_id 唯一 |
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
| `devices` | `id UUID` 主键、`user_id UUID` 引用 `users`、`device_id`（clientDeviceKey）、`name`、`platform`、`last_active_at`、`last_pull_cursor`、`revoked_at`、`version`、审计时间；`(user_id, device_id)` 唯一 |
| `refresh_sessions` | `id UUID` 主键、`user_id`/`device_id`（serverDeviceId）外键、`rotation_family_id`、唯一 `token_hash`、`created_at`、`expires_at`、`last_used_at`、`rotated_at`、`revoked_at`、自引用 `replaced_by_session_id` |

三张表均使用 `ON DELETE RESTRICT` 的归属外键；V1 为 owner、expiry、revocation、rotation family 和 token hash 建立查询索引。JPA Entity 使用 `Instant`、UUID、字符串枚举和 `@Version` 映射，Repository 查询包含当前 `userId` 的方法不省略归属条件。

## 阶段 2A 核心领域 V2 已实现 schema

Flyway `V2__core_domain_schema.sql` 在 V1 之后新增 `subjects`、`knowledge_blocks`、`tasks` 三张表，全部使用 UUID 主键、`user_id` 归属外键、`version`、审计时间和 `deleted_at` 墓碑；Subject、KnowledgeBlock、Task 的 JPA Entity 使用 `@Version`，业务 Repository 查询显式带 `userId` 和 `deleted_at IS NULL`。

- `subjects` 保存 `name`、`description`、`icon_key`、`sort_key`、`is_default`；新用户注册不自动创建 Subject，列表可以为空。历史遗留的“未分类”记录仍保留 `is_default=true` 以兼容读取，但可按普通 Subject 软删除。名称唯一和恢复占用冲突由 SubjectService 校验。Flyway `V19__remove_subject_color.sql` 删除历史遗留的 `color` 列，仅丢弃该列值，不影响 Subject 行或其他资源。
- `knowledge_blocks` 保存 `subject_id`、可空 `source_id`、`title`、`summary`、正文 `content`、JSON 文本 `tags` 和 `color_override`。阶段 2B 已创建 `sources` 表、补齐 `source_id` 外键和服务层归属/活动状态校验。
- `tasks` 保存 `subject_id`、`title`、`description`、`status`、`scheduled_at`、`due_at`、`duration_minutes`、`sort_key`；数据库 CHECK 与服务同时约束状态、非负时长和排期顺序。`V18__restore_task_schedule_order.sql` 会先把历史 `due_at < scheduled_at` 行的 `scheduled_at` 清空，再恢复该 CHECK；`V20__remove_task_cognitive_load` 删除已废弃的认知负荷列及 Task 同步 JSON 字段，V21 删除 Task 颜色列及历史颜色键。客户端按当前时间将 `due_at` 或 `scheduled_at` 已过且未完成/取消的任务回归未排期，不能以放宽字段顺序约束替代。
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

保存 name、description、iconKey、sortKey 和共同字段。Subject 不保存专属颜色；新用户注册不自动创建学科，历史遗留的未分类学科可以软删除；Source、KnowledgeBlock、Task 必须归属 Subject。

### Asset 与 Source

Asset 保存 objectKey、originalName、sizeBytes、mimeType、sha256、uploadStatus、completedAt。状态至少为 UPLOADING、READY、FAILED、ORPHANED。

Source 保存 type、subjectId、title、assetId、originUrl、rawText、outline、ingestionStatus、safeErrorCode、safeErrorDetail 和共同字段。状态至少为 PENDING、PARSING、INDEXING、READY、FAILED。

Asset 不作为 Relation 节点，也不进入普通离线 mutation；Source 才是同步和关系中的来源节点。

### KnowledgeBlock

保存 subjectId、sourceId、title、summary、content、tags、colorOverride 和共同字段。content 是正文权威；不保存相对 time 文案、mastery 百分比、difficulty 文案、relatedBlockIds 或拼接关系标记。

### Task

保存 subjectId、title、description、status、scheduledAt、dueAt、durationMinutes、sortKey、completedAt 和共同字段。status 固定为 TODO、IN_PROGRESS、DONE、CANCELLED；completedAt 表示最近一次进入 DONE 的服务器时间。排期不自动改变状态。V21 删除 Task `colorOverride` 并清理相关 JSON。

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

替换前 PC/Mobile localDb 仍有 sync_version、is_deleted、sync_status、position、related_block_ids、source_file_id 等旧字段；Mobile 的类型和数据库字段并不完全一致。新 API 稳定后，端侧数据库必须按 userId 分区并逐步迁移为 version/createdAt/updatedAt/deletedAt/baseVersion 语义。

### PC R4-06 本地副本边界（2026-08-20）

`Auralis-PC/src/services/localSchema.ts` 与 `localRepository.ts` 定义了新的端侧 v2 边界：

- Tauri SQLite 使用 `sync_metadata(user_id, device_id, cursor, reset_required, schema_version)`、`local_resource_records(user_id, resource_type, resource_id, version, deleted_at, sync_status, payload)` 和 `local_mutations(client_mutation_id, user_id, resource_type, resource_id, mutation_type, base_version, payload, status, created_at, error)`；其中本地 `device_id` 列语义为 `serverDeviceId`，资源主键、mutation 主键 `(user_id, client_mutation_id)` 和查询均包含当前用户域。
- 浏览器 fallback 使用 `auralis:v2:<userId>:<serverDeviceId>:state` namespace，业务记录、tombstone、mutation 和 cursor 不再写入新的全局未命名业务 key。
- repository 对外返回 camelCase `LocalEntity`/`LocalMutation` DTO；snake_case 只存在于 SQLite adapter。`baseVersion` 不匹配返回 `LocalConflictError`，删除保留 `deletedAt` tombstone，snapshot reset 会保留当前用户所有 pending mutation 及其本地 payload。
- 旧 account-less localStorage 数据仅复制到 `auralis:legacy_unassigned:v1` 备份空间；Tauri 旧 SQLite 资源行复制到 `legacy_unassigned_records`，均保留原值。首次登录必须由用户明确选择“导入当前账号”或“保留未归属备份”，不得静默归属或删除。

该边界已用临时内存 SQLite 与独立 localStorage namespace 覆盖用户隔离、旧 SQLite 行备份、tombstone、版本冲突、snapshot pending 保留和 legacy backup；真实 Tauri plugin、跨版本旧数据库升级和 GUI 迁移选择仍未验收。

### PC R4-07 文档处理任务（本地 schema v5，2026-08-24）

PC 本地 SQLite schema 从 v2/v3/v4 升级到 v5，新增专用 `document_processing_jobs` 表并将 `ingestion_revision` 对齐为服务端 UUID 文本；旧 v3 数字 revision 会先复制到 `legacy_document_processing_jobs_v3*` 再迁移，不删除原行，v4 任务追加 `payload_receipt_json` 列。该表不进入 `local_resource_records`、`local_mutations` 或同步 change log。每个任务按 `(user_id, device_id, source_id, ingestion_revision)` 唯一，其中 `device_id` 语义为 `serverDeviceId`，查询始终带当前用户和设备边界。

### PC ParsedDocument schema-v1 本地派生缓存（2026-09-08）

PC 加密 cache/header 与 `payload_receipt_json` 现在记录本地派生格式 `parsed-document-v1`、Source Asset SHA-256、parser id/version、normalization version 和可选 OCR model version；这些是 cache/receipt 恢复元数据，不是 Server 数据库 schema 字段。解密后上传的 gzip 内容是一个 schema-v1 JSON envelope（不是 NDJSON），只含 Server 接受的文档元数据、顺序 blocks、Unicode code-point `characterCount` 和 `plainTextSha256`。`payloadBytes/payloadSha256` 指解密 gzip payload，`encryptedBytes` 指本地加密 envelope。

缺少或不完整 v1 元数据的历史派生 cache 在创建 upload intent 前失效：只删除对应 owner-scoped 派生 cache，原子清理 receipt 并回到 `QUEUED`，再按现行 Asset 校验、解析和打包流程重建一次；兼容 receipt 直接续传，不重复 OCR/download/hash/package。没有新增 Server migration 或 OpenAPI shape；真实 Tauri 重启、Server/MinIO PUT/complete/indexing 和 `1.pdf` GUI retry 仍是待完成的业务验收步骤。

### PC 本地优先同步（本地 schema v6，2026-09-04）

- `local_mutations` 新增 `in_flight_at`、`remote_payload`、`remote_version`；状态为 `pending`、`inflight`、`applied`、`conflict` 或 `error`。`remote_*` 只保存服务端的冲突/拒绝诊断，不替换尚未解决的本地资源投影。
- Subject、Source、KnowledgeBlock、Task、Relation 的普通 CREATE/UPDATE/DELETE 必须在同一 SQLite 事务（浏览器 fallback 为同一序列化状态提交）内同时写入 `local_resource_records` 和 immutable outbox mutation。调用方只有在该本地提交成功后才更新内存 UI；失败须抛回调用方。
- 同步器只领取 `pending` mutation 为 `inflight`，push 结果只结算同一 `client_mutation_id`。同资源仍有 `pending`、`inflight`、`conflict` 或 `error` mutation 时，push 回包、cursor pull 与 snapshot 均不得覆盖本地投影。
- cursor pull 对一个资源在同一 page 的多条记录仅应用最后一条；服务端 tombstone 仅在该资源没有未解决本地 mutation 时写入。普通资源列表 API 不参与 PC Store 的缓存刷新。

### PC AI 总览派生缓存（本地 schema v7，2026-09-10）

- PC 本地 SQLite 新增 `ai_overview_cache`，主键为 `(user_id, device_id, scope_type, scope_id, revision_key)`；`device_id` 仍表示 `serverDeviceId`。该表只保存 AI 生成的大纲、总结、生成时间、输入指纹和安全失败摘要，不进入 `local_resource_records`、`local_mutations`、Sync 或 Server 数据库。
- `scope_type=FILE` 时 `revision_key` 是非空 Source `ingestionRevision`；`scope_type=SUBJECT` 时固定为 `subject-v1`。数据库 CHECK 与 repository 共同约束该关系，避免把旧文件 revision 误读为当前学科结果。
- `OUTLINE` 与 `SUMMARY` 分项成功时只替换对应 JSON 和时间；失败只更新 `status/error_code/error_detail`，已有成功内容继续保留。浏览器 fallback 使用 `auralis:v1:overviews:<userId>:<serverDeviceId>`，并对缓存记录和嵌套 JSON 做结构校验，损坏数据统一报告 `OVERVIEW_CACHE_CORRUPT`。
- 学科总览的 `input_fingerprint` 由参与文件的 Source ID、ingestion revision、大纲和总结规范化排序后计算 SHA-256，用于识别本地资料变化；它不是同步版本或 Server 权威字段。

内存 SQLite 与浏览器 fallback 已覆盖 owner/device/revision 隔离、分项替换、失败保留、并发保存/删除、损坏 JSON 和 fingerprint 稳定性。真实 Tauri SQLite v6→v7 重启升级与双账号 GUI 仍待人工验收。

| 字段 | 语义 |
| --- | --- |
| `job_id` | 客户端任务稳定 ID，主键 |
| `user_id` / `device_id`（serverDeviceId） | 本地副本隔离边界 |
| `source_id` / `ingestion_revision` | Source 版本去重键，revision 为非空服务端 UUID 文本 |
| `phase` | `QUEUED`、`DOWNLOADING_SOURCE`、`EXTRACTING`、`OCR_RUNNING`、`PACKAGING`、`UPLOADING`、`SERVER_VALIDATING`、`SERVER_INDEXING`、`READY`、`FAILED_LOCAL`、`FAILED_SERVER`、`PAUSED_NETWORK` |
| `attempt` | 自动/人工重试次数，非负 |
| `checkpoint_page` / `checkpoint_ordinal` / `checkpoint_json` | 解析与打包断点；状态和断点由同一 UPDATE 原子写入 |
| `payload_cache_id` / `payload_receipt_json` | 加密 payload cache 标识及可恢复上传所需的非敏感 receipt 元数据；不含正文、签名 URL 或 headers |
| `error_code` / `error_detail` | 安全失败摘要 |

`payload_receipt_json` 中的 `payloadBytes` 与 `payloadSha256` 以 `open_decrypted_reader` 实际输出的 gzip payload 为准；`encryptedBytes` 仅表示本地加密 envelope 文件大小，不可用于服务端 upload intent 的 `sizeBytes` 或 PUT `Content-Length`。历史 receipt 若 `payloadBytes == encryptedBytes`，PC 恢复上传前通过 owner/device/source/job/revision 作用域的 native cache reader 重新计算 payload size/hash，不改变 schema 版本，也不重新执行 OCR 或打包。

浏览器 fallback 使用 `auralis:v5:document-jobs:<user>:<serverDeviceId>` 独立 namespace，并从 v4/v3 namespace 复制任务；任务不复用业务资源 JSON。v5 migration、数字 revision 迁移、receipt round-trip、状态机和 SQLite/浏览器 repository 已有定向自动测试，真实 Tauri SQLite 升级仍需 R2 验收。

### Mobile R4 本地副本边界（2026-08-20）

- `localDataScope.ts` 将当前 `userId:serverDeviceId` 映射为稳定 scope；H5 表键为 `auralis:local:<scope>:<table>`，原生 SQLite 使用 `_doc/auralis_<scope>.db`，Pomodoro 今日计数使用同一 scope 前缀，切换账号不会打开另一账号的活动副本。
- 本地 mutation 使用独立 `clientMutationId`，push 映射到冻结的 `resourceType/mutationType/baseVersion/payload`；cursor 元数据带 userId/serverDeviceId，冲突或拒绝结果保留 pending mutation。`resetRequired` 先取得完整 snapshot，再为同一用户/设备切换到新的 reset generation scope 并重建，旧一代不在中途删除。
- 用户已明确授权删除旧库；`legacyDataPurge.ts` 在认证会话建立后一次性移除旧 H5 `h5_db_*` 业务键，或删除旧 `_doc/auralis.db` 内的业务表，并写入完成标记。新隔离库和 Tablet feature-flag 本地笔记边界不因该清理扩大到云同步。
- 自动证据覆盖 scope 隔离、协议映射、静态旧协议扫描与双构建；真实原生 SQLite 升级、双账号/双设备、冲突选择和 snapshot reset 仍需设备联调。

Tablet NoteDocument 的 pages、strokes、snapshot、viewport、background 和二进制资源仍属于端侧专有数据，不进入本阶段 Server 表。

## 旧 Server 事实

旧 Server 的程序化 DbMigrationConfig 与 V2__add_encrypted_payload.sql 混用，存在 task_block.position 的 DDL/Entity 漂移、BlockRelation 缺少直接 userId、统一 Result 和旧 sync_version/is_deleted 语义。旧表、DDL、encryptedPayload、Milvus 和 Redis 不作为新 schema 的输入。

## 迁移状态

阶段 1 已创建 `V1__identity_schema.sql`，阶段 2A 已新增 `V2__core_domain_schema.sql`，阶段 2B 已新增 `V3__source_asset_relation_schema.sql`，阶段 3/4 已新增 `V4__sync_schema.sql`、`V5__review_stats_realtime_schema.sql`、`V6__sync_atomicity_and_cursor_high_water.sql` 和 `V7__task_completion_timestamp.sql`；阶段 5/R1 已新增 `V8`–`V14`，PC Tauri ParsedDocument S1 已新增 `V15`。迁移在 H2 PostgreSQL mode 和 PostgreSQL 17/pgvector 容器的空库中验证 Flyway version `1→...→14` 的既有基线；V15 的 H2 clean/upgrade 验证已通过，PostgreSQL upgrade 仍受本机 Docker 不可用阻断。迁移只针对干净新数据库，不接管旧 schema，也不提供旧数据迁移或回滚到旧 schema 的脚本。

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

## PC Tauri ParsedDocument 目标数据契约（2026-08-23，2026-08-24 复核修订，V15/S1–S6 已实现，联调与验收待完成）

本节登记 V15 迁移及 S1–S6、C4/C5 已落地的数据行为；真实 PostgreSQL 升级复核和人工业务验收仍待完成。完整设计见 [PC Tauri AI 辅助阅读全流程设计](../design/2026-08-23-pc-tauri-ai-assisted-reading-design.md)。

- `sources` 新增服务端生成的 `ingestion_revision UUID`。FILE Source 创建、Asset 替换或需要重新端侧解析时轮换 revision；普通重新分块/Embedding 复用当前 revision 和最新兼容 ParsedDocument。Source DTO/同步快照只读暴露该值，客户端 mutation 不能覆盖。
- 新增非同步派生表 `parsed_documents`，保存 `id`、`user_id`、`source_id`、`ingestion_revision`、当前 Asset SHA-256、schema/parser/normalization/OCR model 版本、私有 object key、payload SHA-256、size、status、ingestion generation、`object_deleted_at`、创建和接收时间。状态至少为 `UPLOADING`、`VALIDATING`、`ACCEPTED`、`REJECTED`、`SUPERSEDED`；该表不进入 change log、snapshot 或普通客户端 mutation。
- complete 在 owner-scoped Source 行锁内执行“首个有效结果胜出”。同 revision + payload hash 重放幂等，不同 payload 不能覆盖已接受结果；Source 删除、Asset 替换或 revision 轮换使迟到结果失效。迁移和服务测试必须证明并发 complete 只创建一个 indexing job。
- `ingestion_jobs` 新增可空 `parsed_document_id` 与 `ingestion_revision`。FILE Source 只有在 ParsedDocument 校验通过后进入该 generation 的 INDEXING；新 generation 完整写入并切换 active 前，旧 READY chunks 保持有效。`ingestion_jobs.status` 继续只使用现有 `PENDING/PARSING/INDEXING/READY/FAILED`。
- `sources.ingestion_status` 目标扩展 `AWAITING_CLIENT` 与 `VALIDATING`；两者均适配现有 `VARCHAR(16)`，但必须替换数据库 CHECK 和 Java enum。现有 `PENDING/PARSING/INDEXING/READY/FAILED` 继续服务 TEXT/URL 和兼容路径。既有 READY FILE 且有活动 chunks 的记录保持 READY；未 READY FILE 分配 revision 后迁移为 `AWAITING_CLIENT`。
- `assets.sha256` 为兼容既有上传仍可为空，但 ParsedDocument 接受后必须非空且经过原对象流式校验；并发回填使用锁或条件更新，不能 last-write-wins。
- Task 14（2026-09-09）：Source ingestion 状态及安全失败诊断的实际变化由既有 `ResourceChangedEvent(SOURCE, UPDATE)` 链路写入 change log；相同三元组重复调用不增加 Source version 或同步记录。该变化不新增字段、迁移或 schema。
- ParsedDocument complete 接受阶段与 Source `INDEXING`、ingestion job enqueue 和同步事件保持单事务原子性；接受后异常不会留下部分成功状态，只有校验尚未接受时的失败才持久化 `REJECTED`。
- 最新成功 ParsedDocument 作为重新分块和重新 Embedding 的派生权威保留；成功代切换后异步删除旧对象，并按下述保留期清理旧元数据。Source 删除或 Asset 替换必须使迟到 generation 失效。
- 同 revision 重放产生的多余对象、`REJECTED` 和超时 `UPLOADING` 对象必须由清理任务删除；新 revision READY 后旧对象删除并写 `object_deleted_at`，`SUPERSEDED` 元数据至少保留 30 天后再清理。
- `conversations` 目标新增 `purpose`（`GENERAL`/`READING_SESSION`）和可空 `source_id`；省略 purpose 时为 `GENERAL`，普通列表排除阅读会话，超过 24 小时无活动的阅读会话可由清理任务软删除，普通会话不受影响。
- V16 已落地 `conversations.purpose/source_id`、约束、Source 外键和 owner/source/cleanup 索引；`ConversationService` 校验阅读会话必须绑定当前 Source，普通会话不接受 sourceId，普通列表排除 `READING_SESSION`。`ReadingConversationCleanupService` 对超过 24 小时未活动的阅读会话执行软删除。
- PC 本地新增按 `userId:serverDeviceId` 隔离的 `document_processing_jobs` 元数据，并保存 `ingestion_revision`。SQLite 只保存任务 phase、页级检查点、哈希、parser/model 版本、重试和安全错误；正文使用现有 OS keyring 主密钥派生的分块 AES-256-GCM envelope 临时保存，AAD 绑定 user/serverDevice/source/job/revision/schema。服务端确认接收、退出登录、Source 删除或 Asset 替换后清理；不新增第二套独立 DPAPI 密钥。

S1 已通过追加式 `V15__tauri_parsed_document_schema.sql` 落地上述数据库边界：`sources.ingestion_revision` 为服务端只读 UUID（历史行以 Source id 稳定回填，默认零 UUID 仅用于兼容尚未切换的旧写入路径）；`parsed_documents` 保存 schema/parser/normalization/OCR model、Asset/payload/plain-text SHA、对象 key、状态、generation 和生命周期时间；`ingestion_jobs` 增加可空 `parsed_document_id` 与 `ingestion_revision`。`parsed_documents` 没有 change log、snapshot 或 inbound mutation 外键。S2 已让 SourceEntity/SourceView 只读承载该 revision，并按 FILE/TEXT/URL 分流状态和事件；S3 已实现 owner-scoped upload-intent 与 `UPLOADING` 元数据落库，私有 object key 不由客户端提供；S4 已加入服务端有界流式 payload 校验和 legacy Asset 空 SHA 的条件回填；S5 已在 Source 行锁内实现 complete 首胜、同 payload 幂等、冲突/过期拒绝和唯一 revision indexing job 关联；S6 已完成 accepted ParsedDocument block reader、generation/revision 旧任务隔离、兼容 reingest 复用、旧 revision `SUPERSEDED` 标记和过期 payload 对象清理，保留 ParsedDocument 审计行。H2 clean/upgrade schema 4/4、Source/Ai ingestion 定向回归 11/11、`ParsedDocumentControllerTests` 3/3、`ParsedDocumentValidatorTests` 4/4、`AssetShaBackfillTests` 2/2、`ParsedDocumentCompleteTests` 3/3、S6 定向 21/21 通过，覆盖 READY FILE 与活动 chunk 保留、旧非 READY FILE 迁移为 `AWAITING_CLIENT`、owner/stale revision/hash/schema/size 校验、gzip bomb/UTF-8/ordinal/hash、并发 SHA 回填、complete 首胜、worker block 索引/revision fencing、generation 失败保护、兼容 reingest 和 cleanup；PostgreSQL upgrade 测试已补充但本机无 Docker，尚未取得容器执行证据。
