> [!WARNING]
> 本文为已被替代的历史方案或迁移矩阵，仅供追溯，不作为当前实现、契约或任务依据。现行入口及原文校验说明见 [README](README.md)。

<!-- ORIGINAL WORKTREE CONTENT -->
# Auralis 对象差异矩阵

更新时间：2026-08-13

文档状态：阶段 0 目标模型已固化；阶段 2A 已实现 Subject、KnowledgeBlock、Task，阶段 2B 已实现 Source、Asset、Relation，阶段 3/4 已实现 Sync、Review、Stats、Realtime；端侧迁移与真实基础设施仍未验收

权威范围：PC、Mobile、Tablet 页面/Store、本地数据库、旧 Server 与绿地后端模型之间的对象差异和迁移决策。

## 使用说明

旧 Server 栏只记录替换前代码事实；新 Server 栏记录已批准的绿地目标契约。目标模型在阶段 0 固化；阶段 3/4 的对应 API、Entity 和迁移已经存在，但不代表真实基础设施或端侧迁移已经验收。

字段命名遵循：API camelCase、数据库 snake_case、时间 RFC 3339 UTC、数据库 TIMESTAMPTZ、ID UUID 字符串、版本由服务器维护。

## 差异矩阵

| 对象 | PC 页面/Store | Mobile/Tablet 页面/Store | 端侧本地库 | 旧 Server 事实 | 新 Server 模型 | 迁移决策 | 阶段 0 证据状态 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Subject | Auralis-PC/src/store/useSubjectStore.ts、Auralis-PC/src/components/subject/SubjectCreateModal.vue 使用名称和图标 | Auralis-Mobile/src/store/useSubjectStore.ts 使用学科选择和端侧分类 | Auralis-PC/src/services/localDb.ts、Auralis-Mobile/src/services/localDb.ts 保存本地学科关联 | 旧 Server 以知识块/任务的 subject 文本为主，没有完整 Subject CRUD 契约 | Subject 是用户拥有的同步资源；注册时同事务创建受保护的“未分类”学科；Source、KnowledgeBlock、Task 必须归属 Subject | 由展示文本迁移为 subjectId；默认学科不可删除，可重命名展示字段 | 阶段 2A 已实现 V2 Entity/Repository/Service/Controller、默认 Subject、版本/墓碑/恢复；端侧迁移未开始 |
| Source / Asset | Auralis-PC/src/api/useAssetApi.ts、Auralis-PC/src/services/localDb.ts 使用文件名、objectName、MIME、文件大小和来源展示 | Auralis-Mobile/src/services/localDb.ts 保存 source_files；Auralis-Mobile/src/store/useBlockStore.ts 使用 sourceFileId | 本地库混合本地路径、文件名、对象名、MIME 和展示类型 | 旧 Asset 和 FileStorage 接口混用客户端元数据；只校验用户前缀，不完整校验 MinIO 对象 | Asset 表示 MinIO 物理对象；Source 表示用户可见逻辑来源。Asset 不进入普通 mutation 和 Relation；Source 才进入同步和关系 | 拆分 objectKey、originalName、sizeBytes、mimeType、sha256 与 Source 标题/类型/状态；上传通过 AssetStoragePort 抽象预签名和 HEAD/stat | 阶段 2B 已实现 V3 Entity/Repository/Service/Controller、Source 关联与 H2 测试存储校验；真实 MinIO/端侧迁移未验收 |
| KnowledgeBlock | Auralis-PC/src/store/useBlockStore.ts 与 Auralis-PC/src/services/localDb.ts 同时存在 preview/content、time、source、tags、difficulty、mastery、reviewAt、relatedBlockIds | Auralis-Mobile/src/store/useBlockStore.ts 的 TypeScript 类型遗漏部分同步/删除字段；本地库保留扩展字段 | content 在本地表存在，但 PC 读取/写入路径存在只保存 preview 的风险；同步字段使用 sync_version/is_deleted | 旧实体使用 subject、title、preview、time、source、color、user_id、sync_version、is_deleted；没有完整正文和强类型新模型 | KnowledgeBlock 保存 title、摘要、完整 content、tags、可选颜色覆盖、Subject、可选 Source 和通用审计/墓碑字段；content 是正文权威 | 删除 time 文本、relatedBlockIds、掌握度和展示文案；复习状态进入 Review；关系进入 Relation | 阶段 2A 已实现 V2 Entity/Repository/Service/Controller；阶段 2B 已补 Source 外键、归属校验和关联测试；端侧迁移未开始 |
| Task | PC Task Store 使用规范状态、排期、时长和排序键 | Mobile Task Store 保留端侧展示状态、排期、时长和同步版本 | PC 规范本地投影按 userId 分区，旧 task_blocks 仅作迁移备份并清洗颜色键 | Mobile 原生/H5 本地表保留展示所需别名，同步边界转换为规范 Task 并清洗颜色键 | Task 保存 title、description、status、scheduledAt、dueAt、durationMinutes、sortKey、Subject 和审计/墓碑字段 | 状态统一为 TODO、IN_PROGRESS、DONE、CANCELLED；position 只映射 sortKey，不兼作星期编码；Task 外观使用语义 CSS 令牌，KnowledgeBlock 颜色保留 | 2026-09-08 已从服务端、OpenAPI、同步 JSON 与目标客户端删除 Task 颜色字段；V20/V21 及端侧迁移清理历史字段 |
| Relation | PC 既有关系实体、relatedBlockIds 和工作区临时编排数据 | Mobile 通过 relatedBlockIds、任务描述标记和本地临时边表达关系 | 本地库没有统一 Relation 表 | 旧 BlockRelation 只连接 block id，缺少直接 userId，隔离依赖间接校验 | Relation 节点只允许 SUBJECT、SOURCE、KNOWLEDGE_BLOCK、TASK；类型固定为 CONTAINS、REFERENCES、DERIVED_FROM、DEPENDS_ON、RELATED_TO | 统一为独立同步资源；验证两端存在、同用户、未删除；RELATED_TO 规范化端点去重；端点删除软删关系，恢复不自动恢复 | 阶段 2B 已实现 V3 Entity/Repository/Service/Controller、跨模块端点校验、反向去重、级联软删除和 H2/MockMvc 测试；端侧迁移未开始 |
| Sync / Device | PC Store 尚未接入新同步 SDK | Mobile 仍保留旧 sync_version/is_deleted 字段；Tablet 暂不接入 | 旧端侧 mutation 队列和 cursor 语义待迁移 | 旧 Server 使用旧 sync_version、旧 WebSocket 和 Result 包装 | Device 绑定 userId；change_log 以用户域 cursor 保存资源变更；inbound_mutations 以设备和 clientMutationId 幂等；snapshot/pull 传输显式 DTO | 新客户端只提交资源 mutation，不提交 userId；Asset 不入普通 mutation；过期 cursor 走 reset/snapshot | 阶段 3 已实现 V4、push/pull/snapshot、幂等/冲突和 H2/MockMvc 测试；双设备、真实 cursor 保留窗口和端侧迁移未验收 |
| Review | PC 复习展示仍使用端侧模型 | Mobile 复习 Store 与新 ReviewEvent 尚未接线 | 本地复习状态与历史待迁移 | 旧 Server 复习接口与展示状态混合，未提供新参数版本契约 | ReviewState 是用户/KnowledgeBlock 一对一调度状态；ReviewEvent 是不可变历史；参数集按 scheduler/version 固定 | 评分使用稳定枚举；SKIP 只写事件；掌握度等展示字段由读取 DTO 派生，不写入核心对象 | 阶段 4 已实现 V5、FSRS-lite、事件幂等/版本冲突和 H2/MockMvc 测试；端侧迁移与业务验收未开始 |
| Stats / Realtime | PC 统计和通知仍依赖端侧现有 Store | Mobile/Tablet 尚未消费新统计和事件提示 | 本地统计缓存待重新定义 | 旧 Stats/WebSocket 行为不作为新契约 | Stats 为 userId-scoped 强类型读取模型；Realtime ticket 只授权事件订阅，业务数据仍通过 REST | 统计不得扫描其他用户；ticket hash-only、短期、一次性、设备绑定；事件只发资源类型/ID/cursor 等提示 | 阶段 4 已实现 V5、overview/weekly、ticket 和进程内用户级事件桥测试；浏览器 WebSocket/跨实例 broker/三端联调未验收 |
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

已完成：现有路径盘点、字段差异记录、目标对象和迁移决策；阶段 0 新 Server 骨架与契约验证已通过，阶段 1/2A/2B/3/4 的后端对象和 H2/JPA/MockMvc 自动证据已落盘。

未完成：AI/RAG 对象、前端 SDK/端侧数据库迁移、真实 PostgreSQL/MinIO/容器联调、双设备/跨实例实时验证和业务验收。
