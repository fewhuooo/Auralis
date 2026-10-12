# Auralis 数据库与端侧数据契约

更新时间：2026-10-10

文档状态：阶段 1 Identity V1、阶段 2A Subject/KnowledgeBlock/Task V2、阶段 2B Source/Asset/Relation V3、阶段 3 Sync V4/V6 与阶段 4 Review/Stats/Realtime V5、Task V7、阶段 5 AI/RAG V8–V14 已实现；R1 AI 并发保留与离线会话恢复键已通过测试，默认容器门禁已完成，真实 Provider 和前端验收仍未完成

权威范围：新 Server PostgreSQL/pgvector 表、Entity 映射、同步字段、端侧离线副本和 Tablet 专有数据边界。

事实来源：docs/plans/backend-greenfield-rewrite-plan.md、docs/contracts/ObjectModelMatrix.md、替换前旧 Server 的 DDL/Entity/Mapper 与 PC/Mobile localDb。

## 数据源边界

### 2026-10-09 Review 本地正式数据与待同步意图（代码与自动验证通过；真实Tauri待验收）

- 用户选择完整本地使用。PC 主树本地 schema v12 新增 `local_review_records` 与 `local_review_intents`；本地正式快照、历史、导入完整度与稳定 ID 的 FIFO outbox 分开存储。最终主树R4 664/664与类型/构建通过，SQLite原子回滚及严格解析通过真实SQLite adapter验证；实际Tauri数据库启动/断网重启仍待验收。
- 正式投影、历史和新意图原子提交；本地 revision 与服务器 version 分离。HTTP 首次派发前固化 payload，ACK仅处理同ID；较旧回执仅推进独立权威锚点，不回退已包含后续本地动作的更高版本投影，其余意图继续FIFO。冲突意图保留，显式选择云端进度后归档未采用意图再继续，不删除本机审计记录。
- 临时轮次仍仅进程内切页恢复，不持久化到 SQLite/浏览器/服务端。core Sync 白名单不扩展；Rust snapshot 只替换 local_resource_records，不删除独立 Review 表。
- 服务端沿用 V29 表/时间列/request_payload/response_payload 与 before_state；可选离线时间与存在性进入请求指纹，但两者均省略时保持旧指纹。公开 schedulingBaseline/legacy firstLearning 为已存字段的派生，无服务端新增列或迁移。详细 [计划](../plans/2026-10-09-review-stats-local-first.md)与 [API](API.md)。

| PC v12 表 | 主键与数据 |
| --- | --- |
| `local_review_records` | `(user_id,device_id,knowledge_block_id)`；Subject、local revision、服务器 KB version、content hash、可空 state 的 JSON、命令/有效结果/legacy/导入标记 JSON、presence marker、更新时间 |
| `local_review_intents` | `(user_id,device_id,client_command_id)`；KB、action、真实 occurredAt、payload JSON、`pending/inflight/applied/conflict/error/archived`、独立 FIFO 创建时间、`prepared`、`preparation_json` |

- browser fallback 用 `auralis:v2:<编码 userId>:<编码 serverDeviceId>:review-store` 单个快照键，记录与意图同次提交；SQLite 使用当前 localDb 的串行事务。结构损坏报错，不以空快照覆写旧数据。Review资源仅从当前账号现行仓储读取；`auralis_subjects`/`auralis_knowledge_blocks`等无账号隔离旧键被忽略，不转换、不删除，联网后由现行Core Sync重建资源。
- 本地记录的 `state=null` 表示本机没有正式状态；远端是否无状态还须由完整导入标记与独立锚点确认，不能用本地 null 推断。存在且 `version=0` 仍是存在状态。缺少已导入记录表示远端未知；临时 UI 未学习投影不能保存为状态实体或被用来猜测存在性。远端未知时可以按实际本地存在性完成学习，保留导入不完整提示与首次意图的 absent 前提；旧云端已有状态时保存冲突，不覆盖本机审计。
- `history_json.canonicalAnchor` 独立保存 `knowledgeBlockVersion/subjectId/contentHash/state/commands/effectiveReviews/legacyEvents/legacyHistoryComplete`；明确 null 是没有已验证云端锚点。本地乐观状态/历史不更新该锚点，权威完整导入和自身实际 ACK 才可推进。
- `preparation_json` 保存 `anchorFingerprint/anchorSubjectId/anchorContentHash/anchorCommandIds/anchorLegacyFingerprint/predecessorClientCommandIds/knownLocalCreate/allowContentInvalidation/sequence`。未固化请求可以在严格证据下绑定真实服务器 KB/state version；`prepared=true` 后载荷不可修改，结果未知只按原请求重试。
- 正文后的安全准备仅限首条无 reviewId 学习意图，必须有编辑前完整锚点及严格失效证明；存在性不重基。元信息/Core ACK 的 KB version 更新也须以正文一致及权威 state/命令历史未变的证据核对。不能把本地 revision 或 `canonicalVersion+1` 当作 JPA version。未知首学仅完整protocol2空历史确认后准备，后继只沿自身实际ACK前缀；prepared载荷不重写。锚点、SQLite raw事务严格解析、ACK0、迟到回执/账号交错均有自动回归，证据见本轮计划。

### 2026-10-07 会话与 Asset 清理的写入约束

- PC 核心同步和导入在发起时固定 owner/device/session 与代际；会话失效不改变 A 的 Repository 归属，不删除其待同步内容，不将旧操作提交到 B 的投影或网络身份。内部票据不进入 HTTP DTO、SQLite 或服务器表；未结算 inflight 可用原幂等 ID 重试。
- Source 创建 FILE、替换 Asset 或恢复 FILE 时，对 READY Asset 使用 owner-scoped 悲观写锁；保留期清理使用相同 Asset 锁，在独立事务中重查 active/recent 引用并持久化 ORPHANED，再执行不可回滚的对象删除。
- ORPHANED 的事务提交是禁止新 FILE 引用的边界；删除失败保持 ORPHANED，可由后续清理幂等重试。Asset/Source 审计行保留。本轮不新增列、索引、迁移或同步字段，验证与剩余工程门槛见 [实施记录](../plans/2026-10-07-priority-function-fixes.md)。

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
| review_lifecycle_commands | 学习、初选、确认、纠正与重学不可变命令回执 | user_id + client_command_id 唯一；用户/知识块归属外键级联物理清理 |
| review_lifecycle_reviews | 同次复习初选基准与最终有效结果 | review_id 主键；用户/知识块与selected_at历史索引 |
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

## PC 个人空间服务端数据扩展（V24/V25，2026-09-24）

- V24 新增 `user_avatars(user_id,content_type,image_bytes,updated_at)`：`user_id` 是主键且外键指向 `users(id)`，头像只存服务端校验并重编码后的 PNG，数据库限制非空且不超过 5 MiB。旧 `users.avatar_url` 保留既有字段，本次头像读写不再使用它。头像不进入普通业务资源同步或 Asset 表。
- V25 新增 `account_deletion_jobs(id,user_id,status,requested_at,not_before,next_object_scan_at,object_scan_after_key,lease_until,completed_at,last_error)` 与 `account_deletion_objects(job_id,object_key,deleted_at)`。作业保留待清理对象键、可重试状态、租约和已完成作业的分批复扫游标；`account_deletion_jobs.user_id` 不设置用户外键，使用户最终删除后仍可保留对象键记录。对象键由服务端从当前用户的 Asset、ParsedDocument 元数据收集，不能由客户端指定。
- 注销请求先将用户状态设为 `DISABLED` 并撤销 refresh sessions；上传意图签发与停用用户通过用户行锁串行化。在现有预签名上传有效期及缓冲后，后台 worker 清理对象，最终在事务中按 `user_id` 显式删除依赖行与用户。已完成作业仍按有界批次周期性复扫已记录对象键，以清除预签名 PUT 晚到造成的对象重现。V25 不修改原有 Subject、Source、Asset 等表的外键删除语义。对象存储与 PostgreSQL/MinIO 真实联动仍需验收。

## 专注与完整 Overview 持久化（V26–V28，2026-10-01）

本轮代码已经追加以下迁移，聚焦自动验证与整合门禁记录以当前状态和实施计划为准；未在运行服务执行迁移。

| 表或迁移 | 现行字段与约束 |
| --- | --- |
| V26 `focus_sessions` | `id/user_id/client_session_id/task_id?/started_at/ended_at/duration_seconds/completed/created_at`；用户与 client_session_id 唯一；结束不早于开始；秒数 0–86400；用户外键级联删除，task_id 为历史关联标识，不因任务删除丢失专注统计 |
| V27 `overview_results` | 按用户、SOURCE/SUBJECT、scope_id 唯一；保存 Source/Subject 归属、ingestion_revision、whole version、outline/summary part version、完整 JSON、每部分 manifest/fingerprint/生成时间和 updated_at；两部分均非空；SOURCE 要求当前 revision，SUBJECT 无 source_id/revision |
| V27 `overview_write_receipts` | 用户与 client_write_id 唯一；保存 scope/base_version/payload_hash/response_snapshot/created_at；独立保存每次请求的精确回放结果，直到账户删除，不改写历史请求 |
| V28 | 仅删除 knowledge_blocks.summary/tags 两列；不会删除知识块或正文，也不改写历史 inbound_mutations/change_log JSON |

专注秒数与自然完成轮次由独立历史事件聚合；原 review_events 和 studySeconds 保持复习语义。专注请求先锁用户保证并发幂等，时间规范到数据库微秒精度后比较。

Overview 是独立派生成果，不进入五类资源的 core Sync snapshot/change_log/inbound_mutations。写入在用户与当前输入的锁和事务内校验 owner、活动状态、READY、revision、baseVersion；Subject 校验当前活动 READY FILE 来源集合及已持久化文件 part versions，TEXT/URL 不进入该 manifest。生成过程和失败不落远端结果。Subject 删除只直接清理其 SUBJECT scope 成果，当前子 Source 的成果由各 Source DELETE 事件清理，避免移动后的资料被旧学科误删。普通删除使成果失效，迟到请求与旧回执不能复活已删除或旧 revision 的成果；账户物理清理包含新增三表。详细 HTTP 和 manifest hash 规则见 [API](API.md)。

## 阶段 2A 核心领域 V2 已实现 schema

Flyway `V2__core_domain_schema.sql` 在 V1 之后新增 `subjects`、`knowledge_blocks`、`tasks` 三张表，全部使用 UUID 主键、`user_id` 归属外键、`version`、审计时间和 `deleted_at` 墓碑；Subject、KnowledgeBlock、Task 的 JPA Entity 使用 `@Version`，业务 Repository 查询显式带 `userId` 和 `deleted_at IS NULL`。

- `subjects` 保存 `name`、`description`、`icon_key`、`sort_key`、`is_default`；新用户注册不自动创建 Subject，列表可以为空。历史遗留的“未分类”记录仍保留 `is_default=true` 以兼容读取，但可按普通 Subject 软删除。名称唯一和恢复占用冲突由 SubjectService 校验。Flyway `V19__remove_subject_color.sql` 删除历史遗留的 `color` 列，仅丢弃该列值，不影响 Subject 行或其他资源。
- `knowledge_blocks` 保存 `subject_id`、可空 `source_id`、`title`、正文 `content` 和 `color_override`。V28 删除用户明确弃用的 `summary/tags` 列；原正文和其他字段保留。阶段 2B 已创建 `sources` 表、补齐 `source_id` 外键和服务层归属/活动状态校验。
  - `tasks` 保存 `subject_id`、`title`、`description`、`status`、`scheduled_at`、`due_at`、`duration_minutes`、`sort_key`；数据库 CHECK 与服务约束状态和非负时长，`due_at` 是提醒/排序信息，不与 `scheduled_at` 建立先后约束。历史迁移 `V18__restore_task_schedule_order.sql` 曾清空 `due_at < scheduled_at` 行的 `scheduled_at` 并添加 `ck_tasks_schedule_order`；新迁移 `V23__allow_scheduled_tasks_after_due_at.sql` 移除此 CHECK，不修改现有行。该历史清空不会由 V23 自动恢复。`V20__remove_task_cognitive_load` 删除已废弃的认知负荷列及 Task 同步 JSON 字段，V21 删除 Task 颜色列及历史颜色键。
- KnowledgeBlock/Task 对 Subject 的引用在服务层按当前 `userId` 校验；跨用户或已删除 Subject 不可创建、更新或恢复子资源。三表外键均为 `ON DELETE RESTRICT`，普通业务删除只写 `deleted_at`。
- Subject 软删除由 Server 事务内的领域事件级联处理同一用户、同一 `subject_id` 下的活动 Source、KnowledgeBlock 和 Task：子行通过实体更新递增 `version`、更新审计时间并写入 `deleted_at`，不执行 SQL 硬删除或新增表/字段；每个子行的 DELETE change-log tombstone 与受影响 Relation tombstone 同事务提交。Subject restore 不恢复这些子行，已删除子行不会重复产生 tombstone。

## 阶段 2B Source、Asset、Relation V3 已实现 schema

Flyway `V3__source_asset_relation_schema.sql` 在 V2 之后新增 `assets`、`sources`、`relations`，并给 `knowledge_blocks.source_id` 补充指向 `sources(id)` 的可空 `ON DELETE RESTRICT` 外键。V3 不修改已执行的 V1/V2。

- `assets` 保存 `id`、`user_id`、可空 `client_import_id`、`object_key`、`original_name`、`size_bytes`、`mime_type`、可空 `sha256`、`upload_status`、可空 `completed_at` 和审计时间；历史行允许 `client_import_id = NULL`，新导入由请求层强制提供 UUID，`(user_id, client_import_id)` 与 `(user_id, object_key)` 均唯一（数据库 NULL 语义允许历史行并存）。Asset 幂等比较使用文件名、大小、MIME 和 sha256；size 必须为正，状态为 `UPLOADING`、`READY`、`FAILED`、`ORPHANED`。Asset 不含 `version/deleted_at`，不属于普通同步资源。V22 仅追加 nullable `client_import_id` 与 owner-scoped 唯一约束，不回填历史 Asset。
- `sources` 保存共同同步字段、`type`、`subject_id`、`title`、可空 `asset_id`/`origin_url`/`raw_text`/`outline`、`ingestion_status`、安全错误码和安全错误说明；type 为 `FILE`、`TEXT`、`URL`，状态为 `PENDING`、`PARSING`、`INDEXING`、`READY`、`FAILED`。数据库外键表达用户、Subject、Asset 归属表约束，跨用户/活动状态由服务层校验。
- `relations` 保存共同同步字段、`source_type/source_id`、`target_type/target_id`、`type` 和可空 `label`；数据库 CHECK 限定四种节点和五种关系类型、端点非空、禁止同类型同 ID 自关联。Relation 的跨表端点存在性、用户隔离和 `RELATED_TO` 规范化去重由 RelationService 保证。
- 删除端点通过 shared `ResourceDeletedEvent` 由 Relation 模块批量软删除相关活动关系并递增关系版本；恢复端点不自动恢复关系。

V3 的 Entity 使用显式 DTO 边界；AssetStoragePort 抽象预签名 PUT、HEAD/stat 和预签名 GET。test profile 使用可控测试适配器，MinIO 适配器只在 `auralis.upload.storage-provider=minio` 时启用。

## 阶段 3 Sync V4 已实现 schema

Flyway `V4__sync_schema.sql` 新增 `change_log` 和 `inbound_mutations`。`change_log` 以 `(user_id, cursor)` 唯一约束维护用户域内的同步顺序，保存资源类型/ID、操作、版本、墓碑时间、稳定 JSON payload 和创建时间；`inbound_mutations` 以 `(user_id, device_id, client_mutation_id)` 唯一约束保存请求 hash、决策、change cursor、当前资源快照、错误码和审计时间。两张表均有保留清理索引，首批同步资源受 CHECK 约束限制为 Subject、Source、KnowledgeBlock、Task、Relation。

Sync push 在每条 mutation 的独立事务内先预留幂等键，再完成领域写入、change log 和最终决策，保证领域写入与幂等结果原子提交；同键 hash 不同的 mutation 只返回该条 REJECTED。`V6__sync_atomicity_and_cursor_high_water.sql` 增加 PROCESSING 决策和用户域 cursor 高水位表，cursor 分配使用行锁并在 change log 清理后保持单调。REST 领域服务和 push 通过 shared `ResourceChangedEvent` 进入同一个 change log 记录器；PostgreSQL 并发压力仍未验收。

### 2026-10-12 V31 PC Timeline 排期 Sync 命令

`V31__allow_task_schedule_commands_in_sync.sql` 将 `inbound_mutations.mutation_type` 扩至 `VARCHAR(32)`，并允许 `SCHEDULE_INSERTION`、`SCHEDULE_SWAP`。这两个值只属于 inbound command；`change_log` 的 mutation CHECK 仍仅允许 CRUD，排期命令执行后的 Task 变更照常以 `UPDATE` 记录。PC 本地 repository 在一个数据库事务中写入单条排期 outbox 命令与所有受影响 Task 的乐观投影；未结算命令会为其成员建立本地同步围栏，内部成员 ID 不发送到服务端。浏览器状态改写要求 Web Locks API 并通过同源锁串行化；缺少该 API 时拒绝 localStorage 写入，错误码为 `LOCAL_STORAGE_LOCK_UNAVAILABLE`，避免并发覆盖整份状态。服务端在同一 `REQUIRES_NEW` 幂等事务中调用现有 Task 排期领域服务，并将结果 Task 数组和 mutation 回执一起保存。

## 阶段 4 Review、Stats、Realtime V5 已实现 schema

Flyway `V5__review_stats_realtime_schema.sql` 新增：

- `review_parameter_sets`：scheduler/version 唯一，保存不可原地覆盖的参数 JSON。
- `review_states`：用户与 KnowledgeBlock 一对一，保存 difficulty、stability、due/lastReviewed、reps、lapses、参数集和版本；用户/知识块/参数集外键与非负 CHECK 已建立。
- `review_events`：不可变复习历史，保存 clientEventId、评分、复习时间、耗时、baseVersion、调度器/版本、参数集和完整前后 ReviewState JSON 快照；`(user_id, client_event_id)` 唯一，幂等重放使用事件中的 afterState。
- `realtime_tickets`：只存 ticket hash、用户/设备、过期时间、消费时间和创建时间；hash 唯一，用户和设备外键级联清理。

V5 同时将 change log、inbound mutation 的 owner 外键改为级联删除，以免账户清理被审计/幂等记录阻塞；业务软删除仍由领域服务负责。Review/Stats 查询与 Realtime ticket 消费均按 userId 过滤。

## 阶段 3/4 审核修复迁移

### V29 学习、复习纠正与掌握退出（2026-10-08，代码、相关自动验证及临时PG迁移通过）

`V29__review_lifecycle_protocol.sql` 扩展既有Review状态并新增独立命令与有效结果表，不增加核心Sync资源或端侧持久队列。

- `review_states` 增加 `needs_learning BOOLEAN NOT NULL DEFAULT FALSE`、`mastered BOOLEAN NOT NULL DEFAULT FALSE`、`stable_success_count INTEGER NOT NULL DEFAULT 0`、可空 `next_review_stage VARCHAR(32)`、`last_practice_at TIMESTAMPTZ`、`last_review_id UUID`、`pending_review_id UUID`、`content_hash VARCHAR(64)`。稳定次数CHECK 0–3；阶段仅EARLY_RECALL/CROSS_DAY/FINAL_VERIFICATION；needs_learning与mastered互斥；mastered要求stable_success_count=3。新增user/learning/mastery/due联合索引。
- `review_lifecycle_commands` 保存 `id,user_id,knowledge_block_id,client_command_id,action,occurred_at,knowledge_block_version,base_version,review_id,rating,duration_seconds,content_hash,request_payload,response_payload,created_at`。请求及冻结回执为TEXT；`(user_id,client_command_id)`唯一。action限定LEARNING_COMPLETED/REVIEW_SELECTED/REVIEW_CONFIRMED/REVIEW_CORRECTED/LEARNING_REOPENED；rating可空或AGAIN/HARD/GOOD；版本及耗时非负；按user/KB/occurred_at/id索引读取审计。
- `review_lifecycle_reviews` 保存 `review_id,user_id,knowledge_block_id,selected_rating,effective_rating,selected_at,resolved_at,resolution,duration_seconds,knowledge_block_version,content_hash,before_state,created_at`。review_id主键；before_state为初选前状态TEXT，用于同次纠正的原始调度基准。有效结果可空，确认/纠正更新同一行；resolution限定AGAIN_SELECTED/CONFIRMED/CORRECTED_AGAIN/SUPERSEDED。反馈仅三档，版本/耗时非负；按user/KB/selected_at/review_id索引。
- 两新增表user和KB外键均ON DELETE CASCADE；活动资源读取与写入仍按owner和软删除过滤，软删除保留历史。旧review_events不可变快照与精确回放不改写。
- 旧state迁移仅增加默认未掌握/稳定0/无需学习标记，原日期、历史及version保留；不从reps推断通过次数。nullable内容hash在新流程绑定，不把旧记录认作已经通过3R。mastered仍保留有限due_at，查询按显式mastered排除，避免用极远日期表达毕业。
- V29在业务流量前用 `INSERT ... SELECT ... WHERE NOT EXISTS(scheduler,version)` 预置默认FSRS_LITE/1参数，沿用既有默认ID/JSON；已有同scheduler/version行保持ID和内容。避免不同Subject/用户首次学习各自查空并竞争全局参数唯一键。临时PG空库双Subject首学与V28自定义参数升级保留分别1/1，当前V29的H2迁移及Lifecycle/legacy回归14/14通过。
- 生命周期写入沿Subject→owner KB→ReviewState锁序，串行化首次缺状态创建、正文变化与同块命令。读出Subject到加锁间KB已移动时，复用expectedSubjectId重载在锁后重读归属，不匹配拒绝RESOURCE_VERSION_CONFLICT且不写state/command；该helper也保护legacy写入。每个生命周期命令核对当前KnowledgeBlock.version及exact UTF-8正文SHA-256，JPA状态version不绕过；正文变化通过共享领域事件在原事务内失效资格，元信息修改保留。
- 学科状态统计使用pendingLearning/reviewing/mastered分区；新有效结果与旧非SKIP事件组合，学习完成从命令独立计数。日期归属与响应字段见 [API](API.md)，命令/生成契约/PG证明范围见 [本轮实施](../plans/2026-10-08-review-learning-mastery-implementation.md)。

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

保存 subjectId、sourceId、title、content、colorOverride 和共同字段。content 是正文权威；卡片短文本从正文临时截取，不再持久化 summary、preview 或 tags。原有不可变同步 mutation 的请求和回执不改写；服务端忽略请求中的旧扩展字段。端侧旧库备份保留，不执行历史正文删除。不保存相对 time 文案、mastery 百分比、difficulty 文案、relatedBlockIds 或拼接关系标记。

### Task

保存 subjectId、title、description、status、scheduledAt、dueAt、durationMinutes、sortKey、completedAt 和共同字段。status 固定为 TODO、IN_PROGRESS、DONE、CANCELLED；completedAt 表示最近一次进入 DONE 的服务器时间，包括 PC 自动完成经同步提交的更新，不能用截止时间替代。排期写入本身不自动改变状态；`dueAt` 用于截止提醒、排序和新排期的完整结束上限：创建、恢复、时间字段有效值变化或取消后重新进入活动排期时要求 `scheduledAt + effectiveDurationMinutes <= dueAt`（空时长按 30 分钟，无截止不限制，恰好结束允许）。领域服务共享校验覆盖 REST/Sync、换位和顺延，不增加列、CHECK 或迁移，保留用户截止时间。历史越界排期不批量改写，非时间编辑及自动 DONE 仍允许，空时长与显式 30 等价。PC 活动未排期任务按有效 `dueAt <= now` 提交 DONE；已排期任务按排期结束时刻提交 DONE，两者均保留原 `dueAt`，沿用现有字段和版本规则，无新增列或迁移。V21 删除 Task `colorOverride` 并清理相关 JSON；V23 移除历史排期顺序 CHECK。

PC 自动完成在本地原子提交中要求 TASK 行存在且无 `deletedAt`，包含 Subject cascade 不增加子任务版本的墓碑情形；删除标记以本地资源行元数据为准，不能只检查 payload。条件仅作为端侧仓储写入前置校验，不新增持久化字段或同步载荷。

Task 截止值表示约束（2026-10-11）：`dueAt/due_at` 与 TASK mutation 保存带时区的真实 instant；PC 纯日期输入仅在明确的用户输入边界转换为当地日末对应的 UTC 值，不持久化纯日期字符串。读取与排期校验不把无时区纯日期兼容解释为日末；非空无效或无时区 `dueAt` 会阻止新排期。已有带时区午夜/日末按真实 instant，不推断全天语义。资产库以真实时间戳转换出的本地日期显示；未改日期的非时间编辑保留原精确截止值。本次不改数据结构、同步字段或迁移，不批量改写既有数据；旧日期输入造成的错误值可由用户先清空截止日期、再重选并正常保存纠正。

### Relation

节点只允许 SUBJECT、SOURCE、KNOWLEDGE_BLOCK、TASK；类型只允许 CONTAINS、REFERENCES、DERIVED_FROM、DEPENDS_ON、RELATED_TO。创建/恢复必须验证两端存在、同用户且未删除；RELATED_TO 按规范化端点顺序去重，其他类型保持方向性。

### Review

ReviewState 保存 difficulty、stability、dueAt、lastReviewedAt、reps、lapses、schedulerVersion、parameterSetId 和共同字段。ReviewEvent 不可变，保存 clientEventId、评分、复习时间、算法版本、参数版本和前后快照。SKIP 只写事件，不改变 ReviewState。

#### 2026-10-08 学科读取与 PC 本轮状态约束

- 本次学科 states / stats 仅新增读取规则，复用 `review_states`、`review_events`、Subject、Source、KnowledgeBlock 与 Task；不增加表、列、索引、迁移或同步字段。
- 状态分页在 limit 前过滤 owner、当前学科与活动 Subject/KB，以 knowledge_block_id 作稳定 keyset，游标绑定 userId / subjectId。统计在可重复读事务内组合独立聚合，活动 KB 与无状态/到期/未来三类计数使用同一查询快照。
- 正式学习判定使用不可变事件 `before_state IS NULL`；首次状态 version 本身为 0，不能用 base_version=0 判断后续评分是否首次。SKIP 仍按现行 events 保存跳过事件，但不计入正式学习次数、首次/后续学习和反馈分布。
- 日统计按请求 IANA 时区的自然日半开区间聚合并补零；事件随 KB 当前学科归属。KB 墓碑不进入当前状态概况，历史评分与新增 KB 趋势仍保留已软删除行；物理删除后的行无法恢复。任务完成趋势依据当前 DONE/completed_at 并保留已完成软删除历史，重新打开清空的旧 completed_at 不可推算。
- PC 每学科轮次仅保存在当前进程的 Review Store 内存，固定账号/设备/会话与 roundId；包含队列、展开态、首次正式接受标记和待确认不可变事件。切页可继续，刷新/重启、明确结束、成功删除学科或会话变化清除；不写 SQLite、localStorage、Review outbox 或服务端表。存在未确认事件时先幂等确认再结束，删除成功后失效该学科的在途请求写回资格。
- 接口与实际验证边界见 [API](API.md) 和 [实施计划](../plans/2026-10-08-subject-review-stats-implementation.md)，专注持久化与个人聚合保持现行规则。

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
- PC 时间轴自动完成在提交本地 TASK mutation 时额外传入可选 `expectedLocalVersion` 与非 pending mutation 拒绝条件：SQLite 在同一写事务内核对当前资源版本与同资源的 inflight/error/conflict，再提交或合并 pending；浏览器 fallback 在同步 read/modify/write 内进行同样检查。缺行、版本已变化或存在不能合并的未解决 mutation 时拒绝，避免旧自动写入覆盖同步投影或产生重复 outbox。增量 pull 使用 `upsertFromSync` 在同一写边界重新核对同资源未解决 mutation，跳过期间新产生本地写入的资源。其他普通 mutation 调用保持原有提交语义；未新增表或同步字段。
- 2026-10-07 在线排期响应使用既有 `upsertSyncedBatch`：先核对整批 pending/inflight/conflict/error mutation 围栏，有未解决写入返回 false 且零写；否则在同一 SQL 事务或 browser 同步状态提交段读取当前行，逐项跳过较低版本及会清除当前墓碑的活动响应，包括同版本或更高版本的活动响应。此入口不执行显式恢复；同版本 active→active 和 active→墓碑仍可接受，墓碑更新不能降低版本。其他有效成员在同一提交边界合并，SQL 写失败整体回滚，browser 只写一次状态；true 表示可接受成员合并完成，不表示每个输入成员均覆盖当前行。Store 保留响应原始版本（包括 0），仅从当前 Repository 重建投影；cursor 已推进的较新行/墓碑不能依赖再次 read 修复旧响应覆盖。没有 schema、表、同步字段或迁移变更，验证与限制见 [实施记录](../plans/2026-10-07-timeline-placement-and-swap-fixes.md)。
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

### PC 专注与 Overview 同步扩展（本地 schema v10/v11，2026-10-01）

以现有 v9 为起点追加表；保留 ai_overview_cache、核心资源副本、旧备份及原 mutation。重复初始化使用既有幂等建表流程，不根据过时文档回退 schema。

Tauri 初始化在 SQL 插件加载固定 `sqlite:auralis.db` 后、执行 PRAGMA/schema/业务查询前，调用 `initialize_local_database_pool` 固定单连接池（max/min 1，无正常 idle/lifetime 回收）。与现有 JS 串行队列共同保证跨插件调用的 BEGIN/COMMIT 连接一致性；native snapshot 仍使用其独立真实事务。没有新增依赖或修改数据库路径。

- v10 `pomodoro_timer_state` 以 `(user_id,device_id)` 为主键保存 state_json/updated_at，包括阶段、时长、累计运行时间、当前开始时间及稳定 clientSessionId/taskId。暂停不累计，重载按时间戳恢复，路由切换不拥有或销毁计时器。
- v10 `pomodoro_focus_sessions` 以 `(user_id,device_id,client_session_id)` 为主键保存最终时段、实际秒数、自然完成标记和 pending/synced。阶段状态与最终事件同事务保存；ACK 后保留 synced 本机历史，供本地日期的今日卡统计。Profile 只用服务器历史总量，不盲目加 pending，避免响应丢失导致重复显示。
- v11 `overview_sync_states` 以 owner/device/scope/revision 为主键保存服务器整体与分项版本、分项 manifest/fingerprint；客户端 FILE 对应服务端 SOURCE。
- v11 `overview_sync_outbox` 以 owner/device/client_write_id 为主键，保存 intent_json、可空 request_json、状态及安全错误。状态为 PREPARED/PENDING/INFLIGHT/CONFLICT/ERROR/STALE。完整成功 cache 与 intent 同事务落地；普通新候选初始为 PREPARED，已有未解决冲突时新候选仍为 CONFLICT。取得 baseline 后 HTTP body 只固化一次，超时或本地 ACK 失败原样重放；终端服务错误为 ERROR，新明确候选可替代旧 ERROR。候选冲突不能被后台 GET 或普通重新生成/保存绕过，须显式选择本机上传或采用远端。
- 历史完整 READY cache 可作为 LEGACY_SEED；远端已有成果时采用远端，不能用旧 seed 覆盖它。新生成和手动编辑与旧 seed 区分。失败/半成品不 seed，Source revision/删除或 Subject 当前输入变化使迟到候选失效。
- 端侧 FILE/SUBJECT 删除在首个异步操作前建立 owner/device/scope 删除生命周期围栏；远端请求捕获开始时 generation token，install/complete 在串行写边界内复核。删除失败只能释放自身 ticket，不能释放更新的删除；删除开始至完成期间旧活动投影不能重新激活。成功删除后仅显式恢复或当前活动、未删除且无未解决 DELETE 的恢复投影可以重新激活；旧 generation 响应仍拒绝，不影响其他 owner/scope。该围栏为进程内生命周期状态，不新增持久化表或扩展 core Sync 数据结构。
- Source DELETE 提交成功后才移除内存投影、discard Overview cache/outbox 和清理 parser；预提交失败保留可恢复的本地资料和未同步候选。Subject 父墓碑已持久化后，即使子级/Overview 清理失败也保持删除围栏，由既有 reconcile 重试；不得因清理异常把已删除 scope 改回活动。
- 拒绝 Subject DELETE 后的权威 snapshot 修复期间（resetRequired），不得依据旧 Source tombstone 终结可恢复 DRAFT 或删除其本地资产；清理边界须复核当前投影。本地尚未上传的 DRAFT 在恢复活动 Subject 后由既有 coordinator 重建，即使服务器 sources 为空也应保留，不能伪造远端 Source。

SQLite 自动测试与浏览器 fallback 验证不能证明真实 Tauri 重启迁移；具体命令和边界见实施计划。

### PC AI 总览派生缓存（本地 schema v7，2026-09-10）

- PC 本地 SQLite 新增 `ai_overview_cache`，主键为 `(user_id, device_id, scope_type, scope_id, revision_key)`；`device_id` 仍表示 `serverDeviceId`。该表保存 AI 生成的大纲、总结、生成时间、输入指纹和安全失败摘要，不进入 `local_resource_records`、`local_mutations` 或核心 Sync。2026-10-01 起，完整成功成果通过独立 Overview 接口与 Server 结果表对账；失败摘要仍只在本机。
- `scope_type=FILE` 时 `revision_key` 是非空 Source `ingestionRevision`；`scope_type=SUBJECT` 时固定为 `subject-v1`。数据库 CHECK 与 repository 共同约束该关系，避免把旧文件 revision 误读为当前学科结果。
- `OUTLINE` 与 `SUMMARY` 分项成功时只替换对应 JSON 和时间；失败只更新 `status/error_code/error_detail`，已有成功内容继续保留。浏览器 fallback 使用 `auralis:v1:overviews:<userId>:<serverDeviceId>`，并对缓存记录和嵌套 JSON 做结构校验，损坏数据统一报告 `OVERVIEW_CACHE_CORRUPT`。
- 学科总览的 `input_fingerprint` 由参与文件的 Source ID、ingestion revision、大纲和总结规范化排序后计算 SHA-256，用于识别本地资料变化；它是本地生成输入判定；远端 Subject manifest fingerprint 另按 API 契约计算，不与本地内容 hash 互换。

内存 SQLite 与浏览器 fallback 已覆盖 owner/device/revision 隔离、分项替换、失败保留、并发保存/删除、损坏 JSON 和 fingerprint 稳定性。真实 Tauri SQLite v6→v7 重启升级与双账号 GUI 仍待人工验收。

### PC Local Asset Store（本地 schema v8，2026-09-16）

- `local_asset_files` 以 `(user_id, device_id, local_asset_id)` 为主键，保存可空 `server_asset_id`、受管 `relative_path`、原文件名、MIME、字节数、SHA-256、`STAGING | READY_LOCAL | SYNCING | SYNCED | SYNC_FAILED | CORRUPT | DELETING` 状态和本地审计时间。绝对路径只由 native resolve 临时返回，不进入 SQLite。
- `local_asset_sync_jobs` 保存 owner/device/local Asset 作用域的持久同步阶段、attempt、`next_retry_at`、可空 `server_asset_id` 与安全错误摘要；partial unique index 保证每个 Asset 只有一个未 `SYNCED` 任务。阶段为 `PENDING | CREATING_REMOTE_ASSET | UPLOADING | COMPLETING_REMOTE_ASSET | BINDING_SOURCE | SYNCED | FAILED`。
- `local_source_drafts` 以 `(user_id, device_id, local_source_id)` 为主键，保存 `local_asset_id`、Subject、标题、`local_content_revision`、可空服务端 Source/revision 映射及草稿状态。它只承载 Asset READY 前的离线 Source 门禁，不替代 `local_resource_records` 和 `local_mutations`。
- `localAssetId` 是本地稳定 UUID，并直接作为 Server upload intent 的 `clientImportId`；`localContentRevision` 与服务端只读 `ingestionRevision` 不互换。
- v8 初始化继续使用 `CREATE ... IF NOT EXISTS` 和单一版本记录，保留 v2-v7 所有表。自动测试覆盖 clean init、v7→v8 数据保留、重复初始化、owner/device 隔离、状态 CHECK、单活任务、Repository 状态机和浏览器 fallback；真实 Tauri 重启升级仍需人工验收。

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
- 2026-09-25：用户 AI 设置 API 不再接收或返回 `embedding_model`；该历史可空列保留，无数据库迁移。入库和检索的 Embedding 解析服务端 SiliconFlow 配置，不读取用户聊天 Provider 的该列。
- `ingestion_jobs` 保存 Source ingestion 状态、attempt、lease、错误安全摘要及开始/完成时间；当前状态约束为 `PENDING`、`PARSING`、`INDEXING`、`READY`、`FAILED`。worker 通过 `PESSIMISTIC_WRITE` claim-next 选择最早任务，`PARSING/INDEXING` 的过期 lease 可恢复；达到最大 attempt 后进入 `FAILED`，当前不新增 schema 列。
- 2026-10-10：embedding 分批前/后可在短事务中续租原 claim；锁后核对 job/user/source/generation/revision/ParsedDocument 身份、attempt、活动状态与新鲜 Clock 下尚未过期的 lease。新期限按锁后时间加原租期计算，不能续活过期或已被新 attempt 接管的任务。失去 claim 的旧 worker 不写新 attempt 的失败/完成状态；全部批次有效后才进入既有 fenced generation 原子提交。复用现有字段、索引与约束，没有新增 schema/migration。
- `source_chunks` 保存 ordinal、正文、SHA-256、字符偏移、兼容性 `embedding_json`、`generation` 和 `active`；唯一键为 `(user_id, source_id, generation, ordinal)`。embedding 业务校验固定为 1024 个有限浮点数。
- `conversations` 支持用户隔离和软删除；`messages` 保存 `message_sequence`、`role`、`status`、正文、模型和安全错误元数据，按 `(conversation_id, message_sequence)` 唯一；USER 消息可保存 `client_request_id`，按 `(user_id, client_request_id)` 唯一用于安全重试。
- 2026-10-01：提问请求顶层 selectionText 与现行 readingContext.selectionText 仅参与本次 Provider prompt，不追加到 messages 正文或创建引用列、locator/citation 记录；本轮没有数据库迁移。现有 client_request_id 回放仍返回已持久化结果。
- `V9__postgres_vector_support.java` 仅在 PostgreSQL 增加 `vector` 扩展、`source_chunks.embedding vector(1024)` 和 HNSW cosine 索引；H2 使用 V8 的 JSON 兼容列，便于自动测试。
- `V10__source_chunk_generation_cutover.sql` 增加 `ingestion_jobs.generation`、`source_chunks.generation/active`、新 generation 唯一约束和活动 chunk 查询索引。新 generation 写入完成后才切换 active，失败由事务回滚并保留旧 generation。
- `V11__backfill_postgres_vectors.java` 仅在 PostgreSQL 将历史 `embedding_json` 回填到 vector 列，避免升级后旧 chunk 因 vector 为空而无法检索。
- `V12__ai_message_client_request_id.sql` 为 `messages` 增加可空 `client_request_id VARCHAR(128)`，并建立 `(user_id, client_request_id)` 唯一约束和查询索引；只有 USER 请求消息写入该键，重试通过用户隔离的键回放既有 assistant 结果。
- `V13__conversation_concurrency_control.sql` 为 `conversations` 增加 `version` 和 `next_message_sequence`，并从既有 messages 回填序号计数器；ConversationEntity 使用 `@Version`，消息追加在会话行写锁下递增计数器，避免并发 `max + 1` 竞争窗口。
- `V14__ai_request_reservation.sql` 为 `conversations` 增加可空 `client_request_id` 及 `(user_id, client_request_id)` 唯一约束；为 `messages` 增加可空 `reply_to_message_id` 自关联和查询索引。前者支持离线会话创建重试，后者保证重复 AI 请求仅回放该 USER 消息的 assistant 结果。
- PostgreSQL 写入通过 JDBC 将 1024 维 embedding 同时写入 JSON 兼容列和 vector 列；检索通过带 `user_id`、`active`、未删除 Source 过滤的 pgvector cosine SQL，并由 HNSW 索引支持排序。H2 继续使用活动 generation 的 JSON cosine fallback。

阶段 5/R1 schema 验证：H2 PostgreSQL mode 与默认 Testcontainers PostgreSQL 17/pgvector 验证 Flyway V1→V14、JPA `ddl-auto=validate`；R2 clean/upgrade 两类输入验证 V8 历史 `embedding_json` 在 V9/V11 后得到 `vector`、HNSW 索引和回填结果。R1-04/本轮并发测试验证消息幂等键、失败/断流状态、同请求仅一次 USER 保留、会话恢复键和精确 assistant 关联。

## V30 AI Usage Guard B（2026-10-11，代码、相关自动验证与只读审查通过；未部署）

- `V30__ai_usage_guard.sql` 新增非同步派生账本 `ai_usage_locks` 和 `ai_usage_reservations`；不进入 Sync snapshot、change log 或客户端 mutation。Provider I/O 不持有这些表的事务锁；准入/预留/派发标记先锁真实 ACTIVE users 行再按 GLOBAL → USER → TASK 获取账本锁，续租/结算不反向取 users 锁。真实 PostgreSQL 删除/停用并发先复现死锁再验证最小锁序修复，停用后派发拒绝为现行 UNAUTHENTICATED。派发标记是数据库授权点，不能保证授权后的远端请求被撤销。
- `ai_usage_locks.scope_key` 为主键，scope_type 只接受 GLOBAL/USER/TASK；GLOBAL 单例没有 user_id，USER/TASK 保存归属、feature、task_key_hash、current_task_id、owner_id 和 lease_until。原始 task key 不落库，任务锁贯穿一整个业务任务的多次 Provider 调用。
- `ai_usage_reservations` 每次调用一行，包含不透明 task_id、feature/stage/provider/model、estimated_input_tokens、reserved_output_tokens、可空 actual_input_tokens/actual_output_tokens、charged_tokens、request_dispatched、owner_id、lease_until、created_at/settled_at 和安全 error_code。state 只接受 RESERVED/COMPLETED/FAILED/RELEASED/EXPIRED，各 token 非负；actual 的 NULL 表示缺失，不能写零冒充缺失。
- USER/TASK 锁的用户外键 `ON DELETE CASCADE`；reservation.user_id 可空，用户外键 `ON DELETE SET NULL`。删除账号解除归属，保留匿名已结算或未知派发的计额度调用参与系统每日预算，防止删号返还系统额度；账本不保存正文或凭据。已删除用户不能发起新的用户任务，匿名过期预留依保守结算规则回收。
- reservation 索引覆盖 `(state,lease_until)`、`(user_id,created_at)`、系统窗口及 `(task_id,created_at)`；UTC 小时/日窗口以调用预留的 created_at 归属，计额度调用的已结算消耗与在途预留共同参与拒绝判定。本人额度 DTO 只读该用户聚合，不公开匿名/系统/其他用户数值。
- 2026-10-12 统计策略：`INGESTION_EMBEDDING` / `RETRIEVAL_EMBEDDING` 的新旧 reservation 不参与上述用户 / 系统 token 窗口或本人 charged / reserved / remaining。表内 estimated / actual / charged 仍保留为每次调用审计，NULL 不改零，无回填、删除、DDL 或新 migration；task 资源预算 / 调用次数及有效 RESERVED 并发统计仍包含 embedding。详见 [策略计划](../plans/2026-10-12-embedding-quota-exemption-and-test-limits.md)。
- `ingestion_jobs` 新增可空 `next_attempt_at`、非负 `failure_count` 和 `(status,next_attempt_at,created_at)` 到期领取索引。attempt_count 继续作为单调 claim 身份；配额延期不增加 failure_count。升级将 PENDING/FAILED 的历史 attempt_count 计为失败次数，PARSING/INDEXING/READY 计为 `GREATEST(attempt_count-1,0)`，避免重置既有普通重试预算。
- 已完成 embedding 批次复用本 job + generation 的 inactive `source_chunks`；读取/写入受 user/source/revision/ParsedDocument、ordinal/offset/内容 hash 与有效 claim 绑定，partial generation 不可检索。最终完整提交仍在既有 fenced 事务中一次切换 active，旧成功 generation 在此之前保留。

本节取代旧阶段记录中“当前不新增 schema 列”的现行含义。H2 迁移及历史失败次数回填 3/3、真实 PostgreSQL V1→V30 clean、V29→V30 upgrade 1/1、真实 driver/账户锁序 4/4 及检查点/窗口续做通过。升级测试先在 V29 插入 attempt_count=3 的 PENDING/PARSING/READY/FAILED，随后仅应用 V30，验证 failure_count=3/2/2/3 和新账本读写。均为任务独占临时数据库，不是业务库或生产升级验收；最终命令与审查证据见 [B 实施计划](../plans/2026-10-10-ai-usage-guard-b.md)。

## PC Tauri ParsedDocument 目标数据契约（2026-08-23，2026-08-24 复核修订，V15/S1–S6 已实现，联调与验收待完成）

本节登记 V15 迁移及 S1–S6、C4/C5 已落地的数据行为；真实 PostgreSQL 升级复核和人工业务验收仍待完成。完整设计见 [PC Tauri AI 辅助阅读全流程设计](../design/2026-08-23-pc-tauri-ai-assisted-reading-design.md)。

- `sources` 新增服务端生成的 `ingestion_revision UUID`。FILE Source 创建、Asset 替换或需要重新端侧解析时轮换 revision；TEXT 的正文或 URL 的来源地址等解析输入变更也轮换 revision。相同输入的普通重新分块/Embedding 复用当前 revision；FILE 继续复用最新兼容 ParsedDocument。Source DTO/同步快照只读暴露该值，客户端 mutation 不能覆盖。
- 新增非同步派生表 `parsed_documents`，保存 `id`、`user_id`、`source_id`、`ingestion_revision`、当前 Asset SHA-256、schema/parser/normalization/OCR model 版本、私有 object key、payload SHA-256、size、status、ingestion generation、`object_deleted_at`、创建和接收时间。状态至少为 `UPLOADING`、`VALIDATING`、`ACCEPTED`、`REJECTED`、`SUPERSEDED`；该表不进入 change log、snapshot 或普通客户端 mutation。
- complete 在 owner-scoped Source 行锁内执行“首个有效结果胜出”。同 revision + payload hash 重放幂等，不同 payload 不能覆盖已接受结果；Source 删除、Asset 替换或 revision 轮换使迟到结果失效。迁移和服务测试必须证明并发 complete 只创建一个 indexing job。
- `ingestion_jobs` 新增可空 `parsed_document_id` 与 `ingestion_revision`。TEXT/URL Source 与 job 同事务持久化；恢复处理中 Source 时按当前 revision 补建或复用活跃 job；FILE Source 只有在 ParsedDocument 校验通过后进入该 generation 的 INDEXING。新 generation 完整写入并切换 active 前，旧 READY chunks 保持有效。同一 revision 的活跃 job 可复用，不同 revision 或终态重跑创建新 job ID/generation；worker 提交时以 job ID、revision、attempt 和锁后有效 lease 拒绝迟到结果。`ingestion_jobs.status` 继续只使用现有 `PENDING/PARSING/INDEXING/READY/FAILED`，本轮无迁移。
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
