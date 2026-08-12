# Auralis 对象差异矩阵

更新时间：2026-08-12

文档状态：阶段 0 目标模型已固化；阶段 2A 已实现 Subject、KnowledgeBlock、Task，Source/Asset/Relation 仍未开始

权威范围：PC、Mobile、Tablet 页面/Store、本地数据库、旧 Server 与绿地后端模型之间的对象差异和迁移决策。

## 使用说明

旧 Server 栏只记录替换前代码事实；新 Server 栏记录已批准的绿地目标契约。目标模型在阶段 0 固化，但不代表对应业务 API、Entity 或迁移已经存在。

字段命名遵循：API camelCase、数据库 snake_case、时间 RFC 3339 UTC、数据库 TIMESTAMPTZ、ID UUID 字符串、版本由服务器维护。

## 差异矩阵

| 对象 | PC 页面/Store | Mobile/Tablet 页面/Store | 端侧本地库 | 旧 Server 事实 | 新 Server 模型 | 迁移决策 | 阶段 0 证据状态 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Subject | Auralis-PC/src/store/useSubjectStore.ts、Auralis-PC/src/components/subject/SubjectCreateModal.vue 使用名称、图标和展示色 | Auralis-Mobile/src/store/useSubjectStore.ts 使用学科选择和端侧分类 | Auralis-PC/src/services/localDb.ts、Auralis-Mobile/src/services/localDb.ts 保存本地学科关联 | 旧 Server 以知识块/任务的 subject 文本为主，没有完整 Subject CRUD 契约 | Subject 是用户拥有的同步资源；注册时同事务创建受保护的“未分类”学科；Source、KnowledgeBlock、Task 必须归属 Subject | 由展示文本迁移为 subjectId；默认学科不可删除，可重命名展示字段 | 阶段 2A 已实现 V2 Entity/Repository/Service/Controller、默认 Subject、版本/墓碑/恢复；端侧迁移未开始 |
| Source / Asset | Auralis-PC/src/api/useAssetApi.ts、Auralis-PC/src/services/localDb.ts 使用文件名、objectName、MIME、文件大小和来源展示 | Auralis-Mobile/src/services/localDb.ts 保存 source_files；Auralis-Mobile/src/store/useBlockStore.ts 使用 sourceFileId | 本地库混合本地路径、文件名、对象名、MIME 和展示类型 | 旧 Asset 和 FileStorage 接口混用客户端元数据；只校验用户前缀，不完整校验 MinIO 对象 | Asset 表示 MinIO 物理对象；Source 表示用户可见逻辑来源。Asset 不进入普通 mutation 和 Relation；Source 才进入同步和关系 | 拆分 objectKey、originalName、sizeBytes、mimeType、sha256 与 Source 标题/类型/状态 | 拆分和状态枚举已固化；真实对象校验属于后续阶段 |
| KnowledgeBlock | Auralis-PC/src/store/useBlockStore.ts 与 Auralis-PC/src/services/localDb.ts 同时存在 preview/content、time、source、tags、difficulty、mastery、reviewAt、relatedBlockIds | Auralis-Mobile/src/store/useBlockStore.ts 的 TypeScript 类型遗漏部分同步/删除字段；本地库保留扩展字段 | content 在本地表存在，但 PC 读取/写入路径存在只保存 preview 的风险；同步字段使用 sync_version/is_deleted | 旧实体使用 subject、title、preview、time、source、color、user_id、sync_version、is_deleted；没有完整正文和强类型新模型 | KnowledgeBlock 保存 title、摘要、完整 content、tags、可选颜色覆盖、Subject、可选 Source 和通用审计/墓碑字段；content 是正文权威 | 删除 time 文本、relatedBlockIds、掌握度和展示文案；复习状态进入 Review；关系进入 Relation | 阶段 2A 已实现 V2 Entity/Repository/Service/Controller 和 content/tags DTO；Source 关联暂可空并待阶段 2B；端侧迁移未开始 |
| Task | Auralis-PC/src/store/useTaskStore.ts 使用 position、startTime、duration、load/loadText 和混合状态 | Auralis-Mobile/src/store/useTaskStore.ts 使用 pending/scheduled/completed、loadText、position、sync_version、is_deleted | Auralis-PC/src/services/localDb.ts 的 task_blocks 保存 position、subject_id 和旧状态 | 旧 TaskBlock 有 name、subject、desc、duration、load、loadText、status、startTime、position 漂移；Entity 与 DDL 不完全一致 | Task 保存 title、description、status、scheduledAt、dueAt、durationMinutes、cognitiveLoad、sortKey、Subject 和审计/墓碑字段 | 状态统一为 TODO、IN_PROGRESS、DONE、CANCELLED；loadText 变为派生值；position 只映射 sortKey，不兼作星期编码 | 阶段 2A 已实现 V2 Entity/Repository/Service/Controller、状态/排期/版本/墓碑语义；端侧迁移未开始 |
| Relation | PC 既有关系实体、relatedBlockIds 和工作区临时编排数据 | Mobile 通过 relatedBlockIds、任务描述标记和本地临时边表达关系 | 本地库没有统一 Relation 表 | 旧 BlockRelation 只连接 block id，缺少直接 userId，隔离依赖间接校验 | Relation 节点只允许 SUBJECT、SOURCE、KNOWLEDGE_BLOCK、TASK；类型固定为 CONTAINS、REFERENCES、DERIVED_FROM、DEPENDS_ON、RELATED_TO | 统一为独立同步资源；验证两端存在、同用户、未删除；RELATED_TO 规范化端点去重；端点删除软删关系，恢复不自动恢复 | 四种旧表达和跨用户风险已登记；实现与测试属于后续阶段 |
| User / Auth | Auralis-PC/src/api/useAuthApi.ts、Auralis-PC/src/store/useAuthStore.ts 使用旧登录/刷新响应 | Auralis-Mobile/src/store/useAuthStore.ts 使用 access/refresh 存储和旧 API 形状 | 本地认证/同步元数据与业务库按端侧实现，后续必须按 userId 分区 | 旧 Server 使用 BCrypt、AuthInterceptor、JJWT 和统一 Result；refresh/session 语义未形成完整测试契约 | User、Device、RefreshSession 为独立领域对象；access JWT 15 分钟，refresh session 30 天并 rotation；refresh token 只存 hash | 不兼容旧 Result 和旧 token 行为；用户归属只从 SecurityContext 推导；跨用户访问在 Repository 层拒绝 | 目标安全规则已批准；认证链路属于阶段 1 |
| Tablet NoteDocument | PC 不拥有 Tablet 笔记模型 | Auralis-Mobile/src/services/tabletNoteModel.ts 包含 pages、strokes、snapshot、viewport、background 和多存储路径 | tablet_notes 仅在 Mobile 端保存 | 旧 Server 没有对应云同步契约 | Tablet NoteDocument 暂不进入普通 JSON mutation、Server API 或阶段 0 数据库 | 后续独立设计 stroke 增量、页面快照、二进制资源、冲突合并、压缩和容量门禁 | 阶段 0 明确排除；不把端侧 NoteDocument 写入新后端模型 |

## 统一迁移决策

1. 所有同步资源包含 id、version、createdAt、updatedAt、deletedAt；创建使用 baseVersion 0，更新/删除/恢复必须精确匹配 baseVersion。
2. API 不返回 JPA Entity，不返回内部枚举以外的展示文案，不使用空字符串代替 null。
3. 所有 Repository 查询必须带当前 userId；Relation、Sync、Stats、RAG 和后台任务执行同一租户隔离。
4. 本地业务库后续接入新 API 时必须按 userId 分区；账户切换不得读取上一账号的本地数据。
5. 端侧 display-only 字段，包括相对时间、掌握度、负荷文案、颜色回退和关系汇总，不进入业务正文或核心实体。
6. 旧 Server 和旧前端不承诺兼容；OpenAPI 稳定后再独立生成客户端类型和逐端迁移。

## 阶段 0 证据边界

已完成：现有路径盘点、字段差异记录、目标对象和迁移决策；阶段 0 新 Server 骨架与契约验证已通过。

未完成：新 Server Entity、Repository、Flyway 迁移、业务 API、前端 SDK 迁移、真实数据库/MinIO 联调和业务验收。
