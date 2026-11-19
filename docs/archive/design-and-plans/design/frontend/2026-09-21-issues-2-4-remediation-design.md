# Issues 2–4 修复设计：Source 生命周期、连接状态与 Overview 反馈

日期：2026-09-21  
文档状态：已批准设计，尚未实施  
适用范围：Auralis Server、Auralis-PC；本设计按“单一 PC 设备作为用户当前本地副本”的产品假设收敛。

## 1. 设计结论

本设计关闭三个登记问题的边界如下：

| 问题 | 最终处理 |
| --- | --- |
| Issue 2 | Source 删除是永久物理删除。Server 不提供 Source Restore，也不保留长期 Source tombstone；Server 的 Source 是否存在是唯一权威。PC 通过统一 `removeLocalSource` 清理本地派生数据，并通过启动后的非阻塞 Source manifest reconciliation 修复本地孤儿。 |
| Issue 3 | 在现有 Sync Store、Realtime controller 和 Chat Store 上增加最小统一状态投影，不新建连接状态系统。状态优先级为错误/服务不可达、离线、重连中、同步中、已同步；问答错误在聊天区域持续可见。 |
| Issue 4 | 手动 Overview regenerate 返回结构化结果并显示明确反馈；自动触发静默处理。失败只写失败状态，不清空已有成功 Overview。 |
| 会话约束 | 单账号只允许一个活动 PC 设备，采用 last-login-wins。新 PC 登录会立即使旧 PC 的 access/refresh/Realtime/后台同步资格失效，但保留旧 PC 未同步本地数据原样；旧 PC 重新登录时反向替换当前 PC。 |

“永久物理删除”指用户无法恢复、Source 正文和所有 Source 派生数据从 Server 与 PC 受管存储中删除。Sync change-log 中允许保留一次性 DELETE 事件用于当前 PC 收敛，但它不是可恢复的 Source tombstone，也不进入长期 Source manifest。

## 2. 2026-09-21 实现依据与约束

本节保留 2026-09-21 制定设计时的实现依据；当前实现与契约以[后端模块](../../modules/Backend.md)和[API 契约](../../contracts/API.md)为准。

- Server `SourceService.delete()` 当前写 `deletedAt`，并发布 Source DELETE 事件；Source 仍有 restore 路由：[SourceService.java](../../../Auralis-Server/src/main/java/com/auralis/app/source/SourceService.java)、[SourceController.java](../../../Auralis-Server/src/main/java/com/auralis/app/source/SourceController.java)。
- `source_chunks`、`ingestion_jobs`、`parsed_documents` 已有指向 Source 的数据库级联；`knowledge_blocks.source_id` 是 `ON DELETE RESTRICT`；Relation 使用多态端点，不存在 Source 外键：[V3__source_asset_relation_schema.sql](../../../Auralis-Server/src/main/resources/db/migration/V3__source_asset_relation_schema.sql)、[V8__ai_rag_schema.sql](../../../Auralis-Server/src/main/resources/db/migration/V8__ai_rag_schema.sql)、[V15__tauri_parsed_document_schema.sql](../../../Auralis-Server/src/main/resources/db/migration/V15__tauri_parsed_document_schema.sql)。
- PC Source 删除已有本地任务、Overview、draft 和 Asset fence：[useSourceStore.ts](../../../Auralis-PC/src/store/useSourceStore.ts)、[sourceJobScheduler.ts](../../../Auralis-PC/src/services/documentProcessing/sourceJobScheduler.ts)、[overviewGenerationService.ts](../../../Auralis-PC/src/services/overviewGenerationService.ts)。
- PC Local Asset 的物理文件与 Source draft 分离，只有最后引用消失后才允许删除：[localAssetRepository.ts](../../../Auralis-PC/src/services/localAssetRepository.ts)、[localAssetService.ts](../../../Auralis-PC/src/services/localAssetService.ts)。
- Retrieval 的 PostgreSQL 路径在 TopK 前过滤已删除 Source；JSON fallback 仍在 citation 阶段才过滤：[PgVectorRetrievalRepository.java](../../../Auralis-Server/src/main/java/com/auralis/app/ai/retrieval/PgVectorRetrievalRepository.java)、[RetrievalService.java](../../../Auralis-Server/src/main/java/com/auralis/app/ai/retrieval/RetrievalService.java)。
- 当前 Message 只保存正文、状态、模型和错误字段；Citation 通过 SSE 发送，不作为历史消息的 Source 快照持久化：[MessageEntity.java](../../../Auralis-Server/src/main/java/com/auralis/app/ai/internal/persistence/MessageEntity.java)、[MessageView.java](../../../Auralis-Server/src/main/java/com/auralis/app/ai/MessageView.java)、当时路径 `Auralis-Server/src/main/java/com/auralis/app/ai/AiStreamingService.java`（该文件已移除）。
- 当前 Identity 允许同一账号保留多个设备/会话；登录只撤销同一设备旧 session（[IdentityService.java#L185-L216](../../../Auralis-Server/src/main/java/com/auralis/app/identity/IdentityService.java#L185-L216)），JWT 只校验签名和 `sid/serverDeviceId`（[JwtAuthenticationFilter.java#L18-L34](../../../Auralis-Server/src/main/java/com/auralis/app/identity/internal/security/JwtAuthenticationFilter.java#L18-L34)），不会在每个请求检查活动会话；Realtime ticket 只绑定 user/device（[RealtimeService.java#L34-L59](../../../Auralis-Server/src/main/java/com/auralis/app/realtime/RealtimeService.java#L34-L59)），已建立 WebSocket 只按 user 订阅（[RealtimeWebSocketHandler.java#L21-L26](../../../Auralis-Server/src/main/java/com/auralis/app/realtime/RealtimeWebSocketHandler.java#L21-L26)）。
- 当前 PC 只有 `anonymous/authenticated/reauthentication-required` 三种会话状态（[authSessionState.ts#L1-L45](../../../Auralis-PC/src/auth/authSessionState.ts#L1-L45)）；401 会统一尝试 refresh，refresh 失败就清空会话并跳转登录（[request.ts#L111-L139](../../../Auralis-PC/src/api/request.ts#L111-L139)）。同步 Store 在 `isAuthenticated` 时启动后台队列（[useSyncStore.ts#L210-L235](../../../Auralis-PC/src/store/useSyncStore.ts#L210-L235)），Realtime controller 在 ticket 失败时继续重连（[realtimeController.ts#L147-L256](../../../Auralis-PC/src/services/realtimeController.ts#L147-L256)）。

## 3. 范围与非目标

### 3.1 本次设计范围

- Server Source hard delete、派生数据清理、worker commit fencing、Asset 最后引用清理。
- PC 本地 Source、ParsedDocument cache、Overview cache、document job、Source draft、Managed Asset 的统一删除入口。
- Source manifest reconciliation 和离线/断网错误边界。
- 单账号单活动 PC lease、last-login-wins、替换错误和旧 PC 本地暂停。
- fallback Retrieval 的 TopK 前有效性过滤。
- Sync/Realtime/Chat 的最小状态投影。
- Overview 手动/自动触发结果与用户反馈。
- API、数据库、模块文档和测试回写边界。

### 3.2 非目标

- 多设备同时在线编辑和跨设备实时删除语义；当前阶段只保证单一 PC 本地副本与 Server 收敛。
- 手机、平板和 Web 多端登录策略；本方案只约束 PC 活动 lease，不改变其他平台的产品策略。
- 垃圾箱、Source Restore、Chunk Restore、Source 重新激活。
- 长期 Source tombstone、删除后 Source 查询、删除后 Source citation 跳转。
- Chunk 级历史证据回溯、PDF 页跳转、原文高亮。
- 重写现有 Local Asset Store、Sync Store、Realtime controller 或 Overview cache schema。
- 改动 Issue 3/4 以外的视觉或交互设计。

## 4. Issue 2：永久删除生命周期

### 4.1 权威原则

1. Source 在 Server 数据库中存在，才是可读、可同步、可参与 RAG 的 Source。
2. Server Source 不存在时，PC 本地副本最终必须删除；本地缺行本身不能证明 Server 已删除。
3. DELETE 成功后不提供 Restore。旧版本 RESTORE mutation 必须被拒绝，待 PC 契约切换完成后移除 Source restore 路由。
4. Source 删除不删除用户原始路径上的文件。PC 只能删除 Auralis 管理的 Local Asset 副本、派生 cache 和任务状态。
5. 删除完成后，任何旧任务都不能重新写入 Source、Chunk、ParsedDocument、Overview 或本地任务。

### 4.2 Server 删除事务

Server 新增一个 owner-scoped 的 `hardDeleteSource` 领域操作，按以下顺序执行：

```text
校验 userId/sourceId/baseVersion
    ↓
锁定 Source 行
    ↓
锁定 Asset 行（存在时）
    ↓
阻止新 ingestion/parsed-document/overview commit
    ↓
处理 KnowledgeBlock、Relation、Reading Conversation
    ↓
发布一次性 Source DELETE change-log 事件
    ↓
物理删除 Source
    ↓
数据库 CASCADE 删除 chunks/jobs/parsed_documents 元数据
    ↓
事务提交
    ↓
after-commit 清理对象存储和未引用 Asset
```

事务内禁止调用 MinIO/S3 删除。对象存储删除失败不得回滚已提交的数据库删除；失败项进入已有清理调度边界并可重试。

DELETE 的同步事件只服务当前 PC 的 push/pull 收敛。Server 不建立 `source_deletion_tombstones` 表，不把已删除 Source 放入长期 snapshot。Source manifest 成功返回后，缺失 Source 即视为权威删除。

### 4.3 关联对象的明确处理

#### KnowledgeBlock：保留内容，解除 Source 关联

KnowledgeBlock 是独立用户内容，不属于 Source 派生数据；当前外键 `ON DELETE RESTRICT` 也表明不能直接删除 Source。删除事务中：

1. 锁定并更新引用该 Source 的活动 KnowledgeBlock；
2. 将 `source_id` 置为 `NULL`；
3. 保留标题、正文、复习状态和用户编辑内容；
4. 按现有同步事件记录一次 UPDATE。

这样既不会被 FK 阻止，也不会因删除文件而丢失用户独立知识内容。

#### Relation：删除无效边

Relation 是可由 Source 指向的独立图边，但 Source 删除后该边不能再表达有效关系。删除事务中物理删除涉及该 Source 的 Relation，并发布一次性 Relation DELETE change-log 事件；PC 在同一轮 Source manifest reconciliation 中移除本地边。

Relation 的普通独立 CRUD/Restore 契约不在本设计内重写；只有 Source hard delete 触发的边采用不可恢复删除。

#### Reading Conversation：按当前实现视为临时会话并删除

`READING_SESSION` 当前已有 Source 外键、离开时 best-effort 删除和 24 小时清理机制。它不是普通历史会话，因此 Source hard delete 时随 Source 一起删除其 Reading Conversation 与 messages。普通 `GENERAL` Conversation 不绑定 Source，不受 Source 删除影响。

#### 聊天历史：普通会话保留，新增来源标题快照

普通会话和消息不依赖 Source FK，Source 删除不删除普通聊天正文。当前 Message 尚未保存 Citation 来源，因此在本设计的后续阶段为 Assistant Message 增加去重后的 `sourceTitles` 快照：

```json
{
  "sourceTitles": ["高等数学.pdf", "线性代数.pdf"]
}
```

历史 UI 只显示快照，不查询 Source、不要求 Chunk 存在、不提供跳转。旧消息没有快照时保持现有正文显示，不伪造来源。

### 4.4 Asset 最后引用与对象存储清理

Server Asset 可被多个 Source 引用，不能随单个 Source 直接删除。删除 Source 后：

1. 在删除事务中锁定 Asset 行，确认当前活动 Source 引用数；
2. Source 删除提交后重新确认引用数为零；
3. 只有最后一个引用消失时，after-commit cleanup 才删除对象存储对象；
4. 对象删除成功后保留 Asset 元数据并更新为现有 `ORPHANED` 状态；不在 Source 删除事务中物理删除 Asset 行；
5. 对象删除失败保留可重试 cleanup 记录，不恢复 Source。

Source create/update/rebind 与 delete 对同一 Asset 使用相同锁顺序，避免“删除判断无引用、并发绑定后仍删除对象”的竞态。

PC 端沿用现有引用计数和生命周期锁：

```text
local Source/draft DELETE
    ↓
removeLocalSource
    ↓
移除该 Source 的 job/cache/overview/draft
    ↓
仅当最后一个本地 Source 引用消失时将 Asset 置 DELETING
    ↓
取消 Asset sync job
    ↓
删除 Auralis 管理的物理文件
    ↓
删除 local_asset_files 元数据
```

用户原始文件路径从不进入该删除调用。

### 4.5 统一 `removeLocalSource`

PC 不再由多个 Store 分别删除 Source 附属数据。新增一个边界明确的本地协调入口 `removeLocalSource(sourceId, reason)`，只允许在以下两种已确认条件下调用：Server DELETE 已成功，或成功取得的 Source manifest 明确不包含该 Source。DELETE 请求发出后、Server 结果尚未确认前，只暂停该 Source 的新任务并保留本地文件和投影；网络失败、超时或版本冲突都不得提前执行不可逆本地清理。Source Store 和 Source manifest reconciliation 共用该入口，操作必须幂等：

1. 以 `userId + serverDeviceId + sourceId` 校验作用域；
2. 从 Source 可见投影和活动文件投影移除；
3. 阻断 Source scheduler、abort Overview 请求；
4. 删除 `document_processing_jobs`、本地 ParsedDocument cache 和 Overview cache；
5. 删除或终结 Source draft；
6. 清理本地 Source mutation；
7. 通过现有 Local Asset lifecycle lock 执行最后引用判断和物理文件删除；
8. 发布一次本地 projection change，避免各 Store 自行重复 hydration。

本地删除失败时不重新创建 Source；保留 `DELETING`/cleanup 状态供启动恢复，向 UI 返回安全错误摘要。

### 4.6 Source manifest reconciliation

启动、登录和重新建立网络连接后，PC 在后台执行非阻塞 reconciliation：

```text
启动 UI
    ↓
立即使用本地投影渲染
    ↓
后台获取当前用户 Source manifest（活动 Source ID + revision）
    ↓
与本地 Source 投影比较
    ↓
Server manifest 缺失的 Source → removeLocalSource
    ↓
存在但 revision 不同的 Source → 交给现有 revision fence/reingest
```

约束：

- manifest 请求失败、离线或鉴权未完成时不删除本地 Source；
- 有未完成 `CREATE` mutation 的本地 Source 不因暂时缺少 manifest 被删除；
- 已确认 Server 不存在的 Source 不被 pull/snapshot 回包重新创建；
- reconciliation 不阻塞 App 启动、Source Store hydration 或文件预览；
- 删除过程通过 projection event 通知相关 Store，不调用普通领域列表 API 刷新覆盖本地 pending mutation。

Server 增加 owner-scoped `GET /api/sources/manifest`，一次返回当前用户活动 Source 的 `id` 与 `revision` 数组；它不返回已删除 Source，也不复用分页边界。manifest 成功后缺失项才可触发本地删除收敛。

### 4.7 全部 worker 的 commit fencing

所有可能写回 Source 派生数据的 worker 都必须在最终提交边界执行统一 fence：

```text
Source 存在
AND Source.userId == job.userId
AND Source.ingestionRevision == job.ingestionRevision（适用时）
AND Source 未被删除
AND job 未被取消/过期
```

具体边界：

| Worker/流程 | commit fence |
| --- | --- |
| Server ingestion | 在 `source_chunks` generation 写入、active 切换、Source READY 的同一事务内锁定 Source 并复核。 |
| ParsedDocument complete/indexing | 已有 owner/revision 首胜校验继续保留；Source 删除后 complete 返回 stale/not found，不能创建 indexing job。 |
| Server Overview | 生成前、Provider 返回后和写缓存前复核 Source existence/revision；Source 不存在时丢弃结果。 |
| PC DocumentJobRunner/SourceJobScheduler | 保留 `discardedSources`、job existence、revision 和 local Asset fence；删除后任何晚到结果只返回 `SOURCE_DELETED`。 |
| PC OverviewGenerationService | 保留 `blockedSourceIds`、AbortController、current Source/revision 和 READY job 检查；晚到成功/失败均不写缓存。 |
| Local Asset sync worker | 每次创建远端 Asset、PUT、complete、bind Source 前检查 Asset 不是 `DELETING`，且 Source 仍是活动引用。 |

### 4.8 Retrieval 防御

即使正常删除已经清除 Chunk，fallback 仍必须在排序和 TopK 前确认 Source 存在：

```text
候选 Chunk
→ owner + Source existence/active 过滤
→ similarity ranking
→ LIMIT/TOPK
→ Citation
```

不能依赖 citation 阶段过滤已删除 Source。

### 4.9 单账号单活动 PC 会话：last-login-wins

#### 4.9.1 不变量与替换事务

当前产品按一个账号一个活动 PC 设备收敛，不支持两个 PC 同时拥有写入、Realtime 或后台同步资格：

1. 当前 PC 客户端（`WINDOWS`/`MACOS` platform）执行 `register` 和 `login` 时，都调用同一个 `acquireActivePcLease` 事务；事务先锁定 User，再撤销该账号之前的活动 PC refresh session/device lease，创建当前 PC 的 Device 和 RefreshSession，最后写入新的活动 lease。非 PC 平台不占用这条 PC lease。
2. 新登录提交成功后，旧 PC 的 access token、refresh token、Realtime ticket、已建立 WebSocket 和后台同步资格全部失效；旧 PC 的本地数据库、Asset 文件、ParsedDocument、Overview、outbox 和未同步 mutation 不删除、不迁移、不覆盖。
3. 旧 PC 再次登录会重新取得 lease，并以同样流程替换当前 PC；因此“最后一次登录”而不是设备创建时间决定活动 PC。
4. 并发登录必须由 User 行锁或等价的账号 lease 行锁串行化；只有赢得最后一次提交的 lease 才能产生有效 token。撤销旧 lease 与创建新 lease 必须在同一数据库事务内完成。

现有 `devices` 和 `refresh_sessions` 保留审计记录，但不再作为“是否为当前 PC”的单独判断。新增一行/账号的 `account_pc_leases`（`user_id` 主键、`device_id`、`session_id`、`generation`、`updated_at`，外键指向 User/Device/RefreshSession）作为活动资格权威。`generation` 单调递增，JWT 增加 `pcLeaseGeneration` claim；迁移时为已有账号从最近活动 session 回填一行，无法回填的账号在下一次登录时创建。

#### 4.9.2 API 与 Server fencing

新增公开错误码 `DEVICE_SESSION_REPLACED`，使用 `401 application/problem+json`，并带 `WWW-Authenticate: Bearer error="invalid_token"`。它与 `UNAUTHENTICATED` 的边界固定如下：

| 情况 | Server 返回 | PC 处理 |
| --- | --- | --- |
| 旧 PC 的 access token 被新登录替换 | `401 DEVICE_SESSION_REPLACED` | 进入“此账号已在另一台 PC 登录”暂停态；停止 REST 重试、Realtime、sync 和 scheduler，但保留本地数据与 outbox |
| 旧 PC 使用 refresh token | `401 DEVICE_SESSION_REPLACED` | 不把它转成普通登录失效，不清理本地副本；用户可在当前 PC 重新登录以夺回 lease |
| 密码错误、账号禁用、refresh token 不存在/过期且不属于替换 | `401 UNAUTHENTICATED` | 清空认证 session，进入现有 `reauthentication-required`；按既有规则保留本地受管数据 |
| 没有收到 Server 响应、浏览器离线或网络超时 | 不产生 API 错误码 | 保持现有认证信息，进入普通 offline/重试路径，不得误判为 replaced |

JWT authentication converter 之后增加活动 lease 检查：`userId + serverDeviceId + sid + pcLeaseGeneration` 必须与 `account_pc_leases` 当前行一致。检查失败时优先查询账号是否仍存在；lease 指向其他 device/session/generation 时返回 `DEVICE_SESSION_REPLACED`，账号不存在或被禁用才返回 `UNAUTHENTICATED`。这项检查是每个受保护请求的服务端 fence，不能依赖 access token 自然过期。

Refresh 继续锁定 token 行，但必须在旋转前比较活动 lease；旧 lease 的 token 返回 `DEVICE_SESSION_REPLACED`，不得再次旋转，也不得把新 lease 的 refresh session 撤销。当前 lease 的 refresh 仍使用现有 rotation family 规则。`/api/auth/sessions` 兼容保留时只返回当前活动 session；撤销旧 session 的 UI 和“多设备列表”在文档收口阶段移除，避免继续暗示多 PC 并行。

#### 4.9.3 Realtime 与后台同步 fencing

- `POST /api/realtime/ticket` 在签发前检查活动 lease，并把 `session_id` 与 `pc_lease_generation` 新增到 `realtime_tickets`；consume 和 WebSocket handshake 再次检查 lease。旧 ticket 返回 `DEVICE_SESSION_REPLACED`，而不是通用 `UNAUTHENTICATED`。
- 已建立的旧 WebSocket 不能只依赖 ticket TTL。lease 替换时发布带 `deviceId/sessionId` 的内部 replacement 信号，连接注册表按这两个字段关闭旧连接，CloseStatus 使用专用 4003，并让 PC 进入 replaced 暂停态。Realtime publisher 不能再只按 user 广播后端控制事件。
- PC `RealtimeController` 识别 ticket 401/4003 的 `DEVICE_SESSION_REPLACED` 后停止 reconnect，不把它当普通 `reconnecting`；只有用户在该 PC 重新登录并取得新 lease 后才重新 start。
- Server sync pull/push、mutation ingest、Asset upload/complete 入口复用活动 lease 检查；被替换的请求返回同一错误码，不能接受旧 PC 的 pending mutation。
- PC `useSyncStore` 增加 `device-session-replaced` 暂停原因。暂停只停止 scheduler、Asset sync queue、document/Overview 后台 worker 和 Realtime；不调用 `removeLocalSource`，不清理本地数据，不把 outbox 标成已提交。重新登录成功后按新 lease 恢复，先按现有 outbox 顺序重试，再执行普通 pull。

#### 4.9.4 PC 状态与恢复

现有 `AuthSessionStatus` 增加 `device-session-replaced`，并保存 `replacementReason`。该状态与 `reauthentication-required` 的可见提示和行为必须不同：

| PC 状态 | 触发 | 允许的动作 | 本地数据 |
| --- | --- | --- | --- |
| `authenticated` | 当前 lease 有效 | 正常 REST、Realtime、sync | 正常读写 |
| `offline`（现有网络投影） | 无响应/离线 | 本地读写，网络恢复后重试 | 原样保留 |
| `device-session-replaced` | 明确收到替换错误或 4003 | 本地读写；暂停需要 Server 资格的任务；允许重新登录 | 原样保留，outbox/mutation 不迁移 |
| `reauthentication-required` | 账号/凭据/refresh 真正失效 | 重新登录 | 按现有策略保留本地受管数据 |

进入 replaced 状态时必须停止 401 refresh loop、后台 pull/push、Realtime reconnect 和 worker commit；网络 offline 不得触发该状态。重新登录的成功响应覆盖当前 PC 的 token/session/device/lease generation，清除 replaced 状态并恢复队列；如果另一台 PC 在此期间登录，当前 PC 再次收到 `DEVICE_SESSION_REPLACED`，重复同一暂停流程。

#### 4.9.5 相关测试

- Server：PC A 登录后 PC B 登录；A 的旧 access token 立即收到 `DEVICE_SESSION_REPLACED`，A 的 refresh 和 realtime ticket 同码失败，B 的访问成功；A 的 WebSocket 收到 4003 并停止重连。
- Server：A/B 并发登录只留下一个活动 lease，旧 lease 的 session/device 不能通过任何受保护 API、sync、Asset 或 Realtime 入口。
- Server：A 重新登录后 B 被替换；同一 PC 重复登录也只保留最新 generation，旧 token 不能继续使用。
- PC：收到 replaced 后不删除 Source、Asset、ParsedDocument、Overview、聊天历史或 outbox；后台 scheduler/Asset queue/Realtime 均停止；重新登录后 pending mutation 原样恢复并按顺序发送。
- PC：普通 offline/超时不改变认证状态；账号禁用或真正失效 refresh 仍进入 `reauthentication-required`，不显示设备替换提示。

## 5. Issue 3：统一连接/同步状态投影

### 5.1 状态来源

复用现有能力，不新建第二套网络状态系统：

- `useSyncStore.lastError`、当前 sync run 和 online 状态；
- `realtimeController` 的 connected/reconnecting/disconnected 状态；
- `useChatStore.lastError`；
- Source/Asset/document job 的现有错误字段。

### 5.2 展示优先级

统一只读 computed projection：

```text
SYNC_ERROR / SERVICE_UNAVAILABLE
    > OFFLINE
    > REALTIME_RECONNECTING
    > SYNCING
    > SYNCED
```

投影至少包含：

```ts
{
  level: 'error' | 'offline' | 'reconnecting' | 'syncing' | 'ready',
  code?: string,
  message: string,
  retryable: boolean,
}
```

规则：

- 同步错误或明确服务不可达时显示错误，不显示绿色“已同步”；
- 浏览器/系统离线时显示离线；
- WebSocket 正在重连但 HTTP 可用时显示重连中；
- 有 pending/inflight mutation 或主动 pull/push 时显示同步中；
- 仅在最近一次同步成功且没有更高优先级错误时显示已同步；
- 网络恢复不自动抹除错误，至少完成一次成功 sync 后才回到已同步；
- Chat Store 的 `lastError` 在当前聊天区域显示安全错误和重试入口，不改变普通消息正文。

左下角 Sidebar 只消费该 projection；不在 Sidebar 内直接读取 Realtime 或 Chat Store 的底层状态。

## 6. Issue 4：Overview 手动/自动反馈

### 6.1 结构化结果

`regenerateFileOverview()` 和 `regenerateSubjectOverview()` 返回：

```ts
type OverviewRegenerationResult =
  | { status: 'STARTED' }
  | { status: 'SKIPPED'; code: OverviewSkipCode }
  | { status: 'FAILED'; code: OverviewFailureCode; detail?: string }
```

`code` 使用现有安全分类，不向 UI 暴露 Provider URL、凭据、原始异常或响应正文。

常见 Skip code：

```text
SOURCE_NOT_FOUND
SOURCE_NOT_READY
SOURCE_NOT_ELIGIBLE
REVISION_MISMATCH
NO_USABLE_INPUT
```

常见 Failure code：

```text
MODEL_UNAVAILABLE
MODEL_TIMEOUT
MODEL_PROVIDER_ERROR
OVERVIEW_PROVIDER_OUTPUT_TOO_LARGE
OVERVIEW_SCHEMA_INVALID
```

### 6.2 手动触发

手动点击“重新生成”时：

1. 调用返回结构化结果；
2. `STARTED` 显示处理中；
3. `SKIPPED` 显示具体可行动提示，例如“文件尚未处理完成”或“文件版本已变化”；
4. `FAILED` 显示安全错误和重试入口；
5. `FAILED` 或 `SKIPPED` 都不得删除已有成功 Overview；
6. 成功保存后刷新当前 cache projection。

### 6.3 自动触发

Source READY、启动恢复、同步变化和 JOB_CHANGED 等自动触发：

- 仍执行同样的 eligibility、revision 和 blocked-source fence；
- `SKIPPED` 和 `FAILED` 只写日志/cache failure 状态，不弹通知；
- Source 删除或 revision 变化时静默丢弃晚到结果；
- 不因自动失败循环重试，沿用现有人工重试边界。

## 7. 错误处理与恢复

| 场景 | Server | PC |
| --- | --- | --- |
| 删除请求找不到 Source | 视为幂等成功；不写新派生数据 | 调用 `removeLocalSource`，清理本地孤儿 |
| 删除版本冲突 | 返回当前版本错误；单 PC 下由客户端刷新后重新提交删除 | 保留本地 Source、文件与派生数据，解除临时任务暂停并显示安全错误；只有后续 DELETE 成功或成功 manifest 明确缺失时才调用 `removeLocalSource` |
| 删除期间 worker 完成 | commit fence 拒绝写入，任务进入 stale/discarded | 任务返回 `SOURCE_DELETED`，清理 cache |
| Asset 对象删除失败 | DB 删除保持提交，cleanup 可重试并记录安全错误 | Local Asset 保持 `DELETING`，启动时重试，不恢复 Source |
| Source manifest 请求失败 | 不改变 Server 数据 | 不删除本地 Source，记录连接错误，下一次在线周期重试 |
| Source 不在成功 manifest | Server existence truth；执行删除收敛 | 非阻塞调用 `removeLocalSource` |
| 新 PC 登录替换旧 PC | 原子撤销旧 lease/session/device，旧请求返回 `DEVICE_SESSION_REPLACED` | 停止旧 PC 的 refresh、Realtime、sync 和 worker；本地数据、outbox、未同步 mutation 原样保留 |
| 旧 PC 再登录 | 原子取得新 lease；原活动 PC 随即收到 `DEVICE_SESSION_REPLACED` | 新 PC 正常工作；被替换 PC 进入同一暂停态，不清理本地数据 |
| 网络离线/超时 | 无业务错误码 | 保持普通 offline 投影，不进入 replaced 或 reauthentication-required |
| 账号失效/凭据失效 | 返回 `UNAUTHENTICATED` | 清空认证 session，进入现有 reauthentication-required；不显示设备替换提示 |
| Overview 手动 no-op | 返回 `SKIPPED` code | 显示明确提示并保留旧 Overview |
| Overview 自动失败 | 记录安全失败状态 | 静默，不覆盖旧成功内容 |

## 8. 分阶段迁移

### 阶段 1：Issue 2 安全边界和小修复

- 增加 `account_pc_leases` 迁移与 last-login-wins 获取 lease；为 JWT、refresh、sync、Asset 和 Realtime 增加活动 lease fence。
- 增加 `DEVICE_SESSION_REPLACED` API 错误和 PC `device-session-replaced` 暂停态；替换时保留本地数据库、文件、outbox 和 worker 输入，不清理、不迁移。
- 实现 Server ingestion、ParsedDocument、Overview 和 Local Asset 的 commit fence。
- 修复 fallback Retrieval 的 TopK 前 Source 过滤。
- 抽取 PC `removeLocalSource`，让现有 Source 删除、启动清理和 manifest reconciliation 共用。
- 保留现有 `deletedAt`/RESTORE 代码作为迁移兼容边界，但禁止新产品入口提供恢复。

### 阶段 2：Server hard delete 与 PC existence reconciliation

- 新增 Source hard-delete 事务和 Asset/对象 after-commit cleanup。
- KnowledgeBlock 解关联、Relation 物理删除、Reading Conversation Cascade 删除。
- 让 Source DELETE change-log 只服务当前 PC 收敛；不新增长期 Source tombstone。
- 增加活动 Source manifest reconciliation；成功 manifest 缺失即执行 `removeLocalSource`。
- Source DELETE 旧 mutation 处理为幂等；旧 RESTORE mutation 返回不支持错误。

### 阶段 3：聊天来源快照与 API 收口

- Assistant Message 增加 `sourceTitles` 快照；更新 API DTO、OpenAPI、PC Chat Store 和历史消息展示。
- 普通 Conversation 保持与 Source 解耦；Reading Conversation 继续随 Source 删除。
- 移除 Source restore route、Source RESTORE mutation 和 Source `deletedAt` 依赖。

### 阶段 4：清理旧实现与文档收口

- 清理仅用于 Source 软删除 retention 的 Server 定时逻辑。
- 删除不再需要的 Source restore tests、retention tests 和 UI 分支。
- 完成契约、状态、模块和发布文档回写，并执行完整自动验证和单 PC 真实验收。

## 9. 验收测试

### Server 数据完整性

- 删除 Source 后 Source、active/inactive chunks、ingestion jobs、ParsedDocument 元数据均不存在。
- Source 删除后 KnowledgeBlock 仍存在且 `source_id` 为 `NULL`。
- Source 相关 Relation 不存在，并产生一次性 DELETE 同步事件。
- Reading Conversation 与其 messages 按当前 FK cascade 删除。
- 普通 Conversation、普通 messages 不受影响。
- 同一个 Asset 被两个 Source 引用时，删除一个 Source 不删除对象；删除最后一个引用后对象才进入 after-commit cleanup。
- 对象存储删除失败不会恢复 Source，下一轮 cleanup 可以重试。

### Worker 与竞态

- ingestion 在 Source 删除前开始、删除后完成，不插入新 Chunk。
- 旧 revision 在 Source reingest 或删除后不能提交 ParsedDocument、Chunk、READY 或 Overview。
- 删除与 Asset bind/upload/complete 并发不会产生 orphan Source 或误删 Asset。
- PC 删除与 scheduler、Overview、Asset sync 并发不会重建任务或文件。

### PC manifest 与本地删除

- 启动先渲染本地投影，不等待 manifest。
- manifest 请求失败不删除本地 Source。
- 成功 manifest 缺少 Source 时调用一次幂等 `removeLocalSource`。
- 有 pending CREATE 的本地 Source 不被 manifest 清理。
- removeLocalSource 完成后 Source、draft、document job、Overview、Local Asset 物理文件均按最后引用规则清理。

### Retrieval、状态和 Overview

- fallback 中高相似度残留 Chunk 不会挤占有效 Source 的 TopK。
- Sidebar 按错误、离线、重连、同步、已同步优先级展示。
- 断线问答错误在聊天区域可见，恢复后不会被错误的绿色状态覆盖。
- 手动 Overview no-op/失败有明确 code 和提示；旧 Overview 保留。
- 自动 Overview no-op/失败不弹通知、不循环重试、不覆盖旧成功结果。

## 10. 文档、API、数据库回写矩阵

| 变化 | 必须回写 |
| --- | --- |
| Source DELETE 从软删除变为永久物理删除 | `docs/contracts/API.md`、`docs/contracts/Database.md`、`docs/modules/Backend.md`、`docs/modules/FrontendPC.md` |
| Source manifest 和 RESTORE 收口 | `docs/contracts/API.md`、`docs/contracts/Database.md`、`docs/modules/FrontendPC.md` |
| 单账号单活动 PC、last-login-wins、`DEVICE_SESSION_REPLACED`、Realtime/refresh fencing | `docs/contracts/API.md`、`docs/contracts/Database.md`、`docs/modules/Backend.md`、`docs/modules/FrontendPC.md` |
| KnowledgeBlock 解关联、Relation 删除、Reading Conversation cascade | `docs/contracts/Database.md`、`docs/modules/Backend.md` |
| Local `removeLocalSource`、启动 reconciliation、Asset 清理 | `docs/modules/FrontendPC.md`、`docs/design/Frontend.md`（若交互变化） |
| Message `sourceTitles` | `docs/contracts/API.md`、`docs/contracts/Database.md`、`docs/modules/Backend.md`、`docs/modules/FrontendPC.md` |
| 迁移、错误码和验收风险 | `docs/current/Status.md`、`docs/current/IssuesAndReview.md` |
| 已发生的实现变化 | `docs/release/Changelog.md` |
| 新增本设计 | `docs/README.md` |

本设计本身只登记到 `docs/README.md`，不把尚未实施的设计写入当前状态或契约事实。
