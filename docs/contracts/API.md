# Auralis API 契约

更新时间：2026-09-24

文档状态：阶段 1 Auth、阶段 2A Subject/KnowledgeBlock/Task、阶段 2B Source/Asset/Relation、阶段 3 Sync、阶段 4 Review/Stats/Realtime 与阶段 5 AI/RAG 后端基线已构建；R3 已固定运行时 OpenAPI 产物并生成 PC/Mobile 类型 SDK；真实 PostgreSQL/MinIO/外部模型、前端联调和人工验收仍未完成

权威范围：新后端 REST、SSE、WebSocket 的目标路径、鉴权、请求/响应规则和阶段状态。

事实来源：docs/plans/backend-greenfield-rewrite-plan.md、阶段 0 对象差异矩阵、替换前旧 Server 代码盘点。

## 契约状态说明

本文件同时保留替换前旧 Server 的代码事实，和绿地重写后的目标契约。旧代码事实不代表新 Server 兼容旧请求；目标契约的 planned-after-phase-0 路由必须在对应阶段实现并测试后，才能升级为可用。

当前已实现并可访问的实际路径：

| Method | Path | 当前行为 |
| --- | --- | --- |
| GET | /actuator/health | Spring Boot 健康汇总 |
| GET | /actuator/health/liveness | 进程存活探针 |
| GET | /actuator/health/readiness | 阶段 0 就绪探针 |
| GET | /v3/api-docs | OpenAPI 文档，骨架完成后可访问 |
| GET | /swagger-ui/index.html | OpenAPI UI，骨架完成后可访问 |
| POST | /api/auth/register | 注册用户、设备和 refresh session，不自动创建 Subject，HTTP 201，并返回 Location |
| POST | /api/auth/login | 校验凭据并签发 token pair，HTTP 200 |
| POST | /api/auth/refresh | rotation refresh session 并签发新 token pair，HTTP 200 |
| POST | /api/auth/logout | 撤销当前 access token 对应的 refresh session，HTTP 204 |
| GET | /api/auth/me | 返回当前用户公开资料，需 Bearer access token |
| PUT | /api/auth/me | 按 baseVersion 更新当前用户昵称，返回 UserView |
| PUT | /api/auth/password | 校验原密码并修改密码，撤销该用户 refresh sessions，HTTP 204 |
| POST | /api/auth/me/avatar | 上传当前用户 PNG/JPEG 头像并规范化保存，HTTP 204 |
| GET | /api/auth/me/avatar | 读取当前用户私有 PNG 头像；无头像返回 404 |
| DELETE | /api/auth/me/avatar | 重置当前用户头像，HTTP 204 |
| DELETE | /api/auth/me | 校验密码并受理可恢复账户注销，HTTP 202 |
| GET | /api/auth/sessions | 返回当前用户每台设备的活动会话元数据，需 Bearer access token |
| DELETE | /api/auth/sessions/{sessionId} | owner-scoped 撤销会话，HTTP 204 |
| DELETE | /api/auth/sessions/others | 撤销当前会话以外的会话，HTTP 204 |

阶段 2A 已开放 Subject、KnowledgeBlock、Task；阶段 2B 已开放 Source、Asset、Relation；阶段 3 已开放 Sync push/pull/snapshot；阶段 4 已开放 Review、Stats 和 Realtime ticket。R1-05 已为五类核心资源列表接入稳定 keyset cursor；真实 PostgreSQL/MinIO、双设备和三端联调未验证。

阶段 0 HTTP 验证：`/actuator/health/liveness` 和 `/actuator/health/readiness` 真实启动返回 HTTP 200、`status=UP`；`/v3/api-docs` 返回 HTTP 200 且 `info.title=Auralis API`；`/swagger-ui/index.html` 返回 HTTP 200。MockMvc 同时验证未知路由的 `404`、`RESOURCE_NOT_FOUND`、`application/problem+json` 和 `X-Trace-Id` 回写。

## 新后端基础规则

- REST 业务路径保留 /api 总前缀，不增加 /v1，也不承诺旧子路径兼容。
- API 字段使用 camelCase；ID 使用 UUID 字符串；时间使用 RFC 3339 UTC。
- 成功响应直接返回显式 DTO，不使用统一 Result 包装。
- 创建成功返回 HTTP 201 和 Location；成功删除返回 HTTP 204。
- 更新、删除和恢复请求必须提供 baseVersion；创建使用 baseVersion = 0。
- 版本冲突返回 HTTP 409、错误码 RESOURCE_VERSION_CONFLICT 和服务器当前 DTO；服务器不执行 last-write-wins。
- 列表统一使用不透明 cursor；响应包含 items、nextCursor、hasMore。
- 默认不返回已删除记录；同步接口和显式 includeDeleted 才能读取必要墓碑。
- userId 只能从 SecurityContext 推导，不能进入资源创建/更新请求，也不能信任客户端提交。
- Entity、JPA lazy proxy 和内部持久化类型不得直接序列化为 API。

## OpenAPI 产物与兼容策略

- 当前冻结产物为 `docs/contracts/openapi/auralis-openapi.json`，由测试 profile 的真实 Spring MVC `/v3/api-docs` 运行时文档导出；`OpenApiArtifactTests` 比较运行时 JSON，`scripts/check-openapi.ps1` 还会用固定的 `openapi-typescript@7.13.0` 重新生成两端 schema 并拒绝漂移。
- API 版本继续使用现有 `/api` 前缀，不新增 `/v1`；当前最低客户端基线是本产物对应的 R3 生成 SDK。向后兼容的字段只允许以可选字段或新增路由方式加入；删除字段、改变类型、改变状态码/错误码或改变语义必须先更新契约并安排客户端迁移。
- 当前没有为旧客户端保留兼容窗口：旧 `/ws/sync`、旧 `Result<T>` DTO、旧字段和旧接口不属于新 Server 契约；R4 客户端迁移完成后应删除旧调用路径，R5 前不得把旧协议重新接回主路径。
- cursor 过期或服务端返回 `resetRequired=true` 时，客户端必须停止增量 pull，清理本地同步游标并执行完整 snapshot；版本冲突必须保留本地未提交 mutation、展示服务器当前 DTO 并由用户或上层冲突策略决定重试，不使用 last-write-wins。
- 当前服务端尚未启用最低版本强制门禁；未来若返回 HTTP 426 / `CLIENT_UPGRADE_REQUIRED`，客户端必须停止写入、保留本地待同步数据并引导升级，不得静默降级到旧 DTO。
- 空值使用 JSON null，不用空字符串、0 或展示文案替代。

## Problem Details

所有错误使用 RFC Problem Details，并增加 code、traceId、fieldErrors：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| type | URI | 稳定问题类型 |
| title | string | 安全标题 |
| status | integer | HTTP 状态码 |
| detail | string | 安全业务说明，不包含异常、SQL、路径或 secret |
| instance | string | 当前请求路径 |
| code | string | 稳定错误码 |
| traceId | string | 诊断关联值 |
| fieldErrors | array | 参数字段错误 |

错误码至少包含 VALIDATION_FAILED、UNAUTHENTICATED、FORBIDDEN、RESOURCE_NOT_FOUND、RESOURCE_DELETED、RESOURCE_VERSION_CONFLICT、MUTATION_REJECTED、SOURCE_NOT_READY、UPLOAD_VALIDATION_FAILED、INGESTION_FAILED、MODEL_PROVIDER_ERROR、OVERVIEW_PROVIDER_OUTPUT_TOO_LARGE、OVERVIEW_REDUCE_NO_PROGRESS、MODEL_UNAVAILABLE、MODEL_TIMEOUT 和 RATE_LIMITED。

## 目标路由总览

以下路由是已批准目标契约；Auth、Subject、Knowledge、Task、Source、Asset、Relation、Review、Stats、Sync、Realtime 已分别在阶段 1/2A/2B/3/4 构建，AI 已完成阶段 5 后端基线：

| 模块 | 目标路径 | 状态 |
| --- | --- | --- |
| Auth | /api/auth/register、/login、/refresh、/logout、/me、/sessions | implemented-phase-1 |
| Subject | /api/subjects、/api/subjects/{id}、/api/subjects/{id}/restore | implemented-phase-2a |
| Asset | /api/assets/upload-intents、/api/assets/{id}/complete、/api/assets/{id}/download-url | implemented-phase-2b |
| Source | /api/sources、/api/sources/{id}、/api/sources/{id}/restore、/api/sources/{id}/reingest | implemented-phase-2b |
| Knowledge | /api/knowledge-blocks、/api/knowledge-blocks/{id}、/api/knowledge-blocks/{id}/restore | implemented-phase-2a |
| Task | /api/tasks、/api/tasks/{id}、/api/tasks/{id}/restore、/api/tasks/schedule-swaps、/api/tasks/schedule-insertions | implemented-phase-2a |
| Relation | /api/relations、/api/relations/{id}、/api/relations/{id}/restore | implemented-phase-2b |
| Review | /api/reviews/due、/api/reviews/events、/api/reviews/history | implemented-phase-4 |
| Stats | /api/stats/overview、/api/stats/weekly | implemented-phase-4 |
| Sync | /api/sync/push、/api/sync/pull、/api/sync/snapshot | implemented-phase-3 |
| AI | /api/ai/settings、/api/ai/conversations、/api/ai/messages/stream、建议类接口、/api/ai/source-overviews、/api/ai/subject-overviews | implemented-phase-5-baseline |
| Realtime | /api/realtime/ticket；WebSocket 地址 /ws/events | implemented-phase-4 |

## 阶段 1 Auth 已实现契约

### 请求与成功响应

- `POST /api/auth/register` 请求字段为 `username`、`password`、`displayName`、`clientDeviceKey`、`deviceName`、`platform`；成功返回 HTTP 201、`Location: /api/auth/sessions/{sessionId}` 和 AuthResult。
- `POST /api/auth/login` 请求字段为 `username`、`password`、`clientDeviceKey`、`deviceName`、`platform`；成功返回 HTTP 200 和 AuthResult。
- `POST /api/auth/refresh` 请求字段为 `refreshToken`；成功返回 HTTP 200 和新的 AuthResult。旧 refresh token 立即失效。
- AuthResult 使用直接 DTO，不使用 `Result<T>` 包装：`user { id, username, displayName }`、`tokens { accessToken, refreshToken, accessTokenExpiresInSeconds, refreshTokenExpiresInSeconds }`、`sessionId`、`serverDeviceId`。
- `GET /api/auth/me` 返回 `UserView { id, username, displayName, version }`。`PUT /api/auth/me` 接受 `{baseVersion,displayName}`，服务端修剪昵称并限制为 1–120 字符，版本不一致返回 `409 RESOURCE_VERSION_CONFLICT`；头像单独读取，不进入 UserView。
- `PUT /api/auth/password` 接受 `{baseVersion,currentPassword,newPassword}`，新密码为 12–200 字符且不得与原密码相同。服务端校验原密码和用户版本，更新密码哈希并撤销该用户全部 refresh sessions；已签发的 access JWT 仍遵循原 15 分钟有效期边界。原密码错误返回身份凭据错误，不返回敏感字段。
- `POST /api/auth/me/avatar` 使用 `multipart/form-data` 的 `file` 字段，只接受实际 PNG/JPEG、原文件最大 5 MiB、边长不超过 4096 像素且总像素不超过 1600 万；Spring multipart 单文件接收上限为 5 MiB，完整请求上限为 6 MiB，以容纳表单封装开销。服务端解码并统一重编码为 PNG，私有存储于当前用户头像表。`GET /api/auth/me/avatar` 只返回当前用户头像且设置 no-store/nosniff；客户端须接受 `image/png`，并可同时接受 `application/problem+json` 用于错误响应，不能仅发送 `Accept: application/json`。`DELETE /api/auth/me/avatar` 删除当前用户头像。头像不复用资料 Asset 上传协议。
- `DELETE /api/auth/me` 接受 `{password}` 并返回 HTTP 202 `{id,status,requestedAt}`，表示注销清理已受理而非永久删除已完成。服务端在事务中停用用户、撤销 refresh sessions、持久化 Asset 与 ParsedDocument 对象键；上传意图签发与停用用户通过用户锁串行化。后台任务等待既有上传签名有效期及缓冲后，按键幂等清理对象并在用户归属锁下重扫，最后按 owner 显式删除关联数据和用户，保留不含用户外键的完成记录。已完成作业继续分批复扫已记录对象键，处理预签名 PUT 晚到造成的对象重现；对象清理失败保留作业并重试。没有公开的跨账户作业状态查询路由。
- `GET /api/auth/sessions` 返回 `{ items, nextCursor, hasMore }`；每个 item 包含 `id`、`serverDeviceId`、`deviceName`、`platform`、`createdAt`、`lastUsedAt`、`expiresAt`、`revokedAt`、`current`。列表只展示未轮换、未撤销、未过期的活动会话，并按 `serverDeviceId` 归并为一条；同一用户在同一设备再次登录会先撤销该设备的旧活动 refresh session，再签发新的会话。阶段 1 当前不提供 cursor，因此 `nextCursor=null`、`hasMore=false`。
- 登出和会话撤销成功返回 HTTP 204；会话查询和撤销始终从 SecurityContext 的 userId 推导归属，不接受客户端 userId。撤销会阻止 refresh token 续期；已签发的 access JWT 仍在其 15 分钟有效期内自然过期，不承诺瞬时断开。

### 鉴权和安全错误

- 注册、登录、刷新为公开路径；登出、当前用户和会话路径使用 `Authorization: Bearer <accessToken>`。
- access JWT 有效期配置默认 900 秒；refresh session 默认 2,592,000 秒（30 天）。JWT 只含 `sub`、`sid`、`serverDeviceId`、`typ=access`、`iat`、`exp`；refresh token 只保存 SHA-256 hash。
- 未登录、无效、过期、撤销或重放 refresh token 返回 HTTP 401、错误码 `UNAUTHENTICATED` 和安全 detail，不返回 token 内容。refresh token 不能作为 access token 使用。
- 重复使用已轮换的 refresh token 会撤销整个 rotation family；跨用户撤销不存在的 owner-scoped session 返回 HTTP 404、`RESOURCE_NOT_FOUND`，不泄漏归属。
- 参数校验返回 HTTP 400、`VALIDATION_FAILED` 和 `fieldErrors`；重复用户名返回 HTTP 409、`MUTATION_REJECTED`。安全过滤器错误也返回 `application/problem+json` 和 `X-Trace-Id`。

## 阶段 2A Subject、KnowledgeBlock、Task 已实现契约

- 三类资源均使用 `POST` 创建、`GET` 列表/详情、`PUT` 更新、`DELETE` 软删除和 `POST /{id}/restore` 恢复；创建返回 `201 + Location`，删除返回 `204`。
- 创建请求必须携带 `baseVersion=0`；更新、删除和恢复请求携带精确的 `baseVersion`。成功更新、删除、恢复均使服务器 `version` 增加 1。注册后的 Subject 列表允许为空；历史遗留的 `defaultSubject=true` 记录也按普通 Subject 软删除，不再设置不可删除特权。
- Subject DELETE 的请求/响应形状不变。成功删除 Subject 会在同一服务端事务内为同一用户且 `subjectId` 匹配的活动 Source、KnowledgeBlock、Task 生成普通 `DELETE` 同步墓碑，并为受影响 Relation 生成普通 `DELETE` 墓碑；每个资源只生成一次，已删除子资源保持幂等，Subject restore 不自动恢复子资源。级联失败会回滚整次删除；客户端仍通过既有 Sync change-log/snapshot 协议收敛。
- Subject-owned 写入在服务端使用统一数据库锁协议：先由内部 `SubjectLockCoordinator` 对所有涉及 Subject 去重并按 UUID 升序获取悲观行锁，再锁具体业务资源并重新读取、校验活动状态、归属、`subjectId` 和 Relation 端点。该并发实现不改变任何公开 API 请求/响应、版本或同步字段。
- `GET /api/subjects`、`GET /api/knowledge-blocks`、`GET /api/tasks` 返回 `{items,nextCursor,hasMore}`，接受不透明 `cursor` 和可选 `limit`（默认 100，范围 1–200），默认过滤已删除记录。Subject 按 `sortKey ASC, updatedAt DESC, id ASC` 稳定分页，其余三类按 `updatedAt DESC, id ASC` 稳定分页。
- Subject 请求字段为 `name`、`description`、`iconKey`、`sortKey`；响应另含 `defaultSubject`、`version`、`createdAt`、`updatedAt`、`deletedAt`。Subject 不提供专属颜色字段，客户端使用全局语义设计色。
- KnowledgeBlock 请求字段为 `subjectId`、可空 `sourceId`、`title`、`summary`、`content`、`tags`、`colorOverride`；阶段 2B 起非空 `sourceId` 必须指向同一用户下活动的 Source。响应不序列化 Entity。
- Task 请求字段为 `subjectId`、`title`、`description`、`status`、`scheduledAt`、`dueAt`、`durationMinutes`、`sortKey`；status 仅接受 `TODO`、`IN_PROGRESS`、`DONE`、`CANCELLED`。更新任务时 `scheduledAt: null` 或 `dueAt: null` 分别明确清除排期或截止时间；PC 客户端把仍未完成/取消且 `scheduledAt` 已过的排期任务更新为 `DONE` 并保留排期，把无 `scheduledAt` 且 `dueAt` 已过的任务更新为 `dueAt: null`，以进入未排期。V21 删除 `tasks.color_override` 并清理 TASK 历史 JSON 颜色键，KnowledgeBlock 的 `colorOverride` 保留。
- 所有 Task 排期写入均阻止同一用户未删除且非 `CANCELLED` Task 的排期区间重叠，区间按半开形式 `[scheduledAt, scheduledAt + durationMinutes)` 计算，首尾相接允许；`durationMinutes` 为 `null` 时按 30 分钟计算。REST 冲突返回 `400 VALIDATION_FAILED`；Sync push 冲突将该 mutation 记为 `REJECTED` 并返回 `VALIDATION_FAILED`，其他 mutation 仍按各自结果处理。服务端在事务内以同一用户行锁串行化排期写入，覆盖跨 Subject 并发。
- Task 的 `dueAt` 是截止日期提醒和排序信息，保存或排期时不要求 `scheduledAt <= dueAt`；截止时间已过的任务仍可排在之后，Server 不改写用户提供的 `dueAt`。
- `POST /api/tasks/schedule-swaps` 用于两个已排期 Task 的原子时段交换。请求为 `{sourceTaskId,sourceBaseVersion,targetTaskId,targetBaseVersion}`，四项均必填；服务端按稳定顺序加锁并在一次事务内校验两个版本和换位后的区间；若两任务原区间首尾紧邻，则交换先后顺序并将两任务紧凑排在原共同时间窗口内，窗口起止不变；非紧邻任务仍互换原开始时间。服务端确认双方新区间不互相重叠且不与同用户其他未取消任务冲突，成功返回 `{source,target}` 两个更新后的 Task。`dueAt` 不限制换位后的排期；`DONE` 和 `CANCELLED` 任务不可交换。任一版本、区间校验或持久化失败均回滚整个交换，不产生半交换状态。`scheduledAt`/`dueAt` 均为 RFC 3339 UTC/带时区 instant；无法反序列化的字段返回 `400 VALIDATION_FAILED` 与 `fieldErrors`。
- `POST /api/tasks/schedule-insertions` 支持普通空白槽位的插入顺延与任务主体的严格放置，只有顶部交互栏落点使用 `schedule-swaps`。请求为 `{taskId,baseVersion,scheduledAt,windowStartAt,windowLastStartAt,targetTaskId?}`，前五项必填；`targetTaskId` 是可选 UUID，三个时间字段为 RFC 3339 带时区 instant；窗口必须正好覆盖 PC Timeline 当天 08:00 至 22:30 的起始槽，客户端提交这两个本地时间对应的 instants。服务端以 `windowStartAt` 为半小时网格起点将目标向上取整；按目标顺序检查 Task 完整时长，仅当下一任务的原起始时间早于前项结束时间才将其顺延到前项结束后的第一个半小时槽，原有空档会保留。不含 `targetTaskId` 的普通空白槽位请求维持原有插入顺延。含 `targetTaskId` 的卡片主体请求以锁定后的目标任务结束时间计算首个半小时槽，仅移动被拖任务，目标及其他任务不变；若被拖任务完整区间与任何其他排期冲突或目标后无可用起始槽，则整笔返回 `400 VALIDATION_FAILED`；目标已变化导致结束槽不符返回 `409 RESOURCE_VERSION_CONFLICT`，目标不存在返回资源未找到。`DONE` 任务固定，`CANCELLED` 不占用区间；如果需移动 DONE 或任何顺延起点超过 `windowLastStartAt`，则返回 `400 VALIDATION_FAILED` 并回滚整组。`dueAt` 不限制新排期或顺延起点。服务端按 User→Subject(UUID 升序)→相关 Task(UUID 升序) 获取悲观锁并在同一事务中提交。成功返回 HTTP 200 `{tasks:[TaskResponse...]}`，列表只含 `scheduledAt` 实际改变的 Task，按新排期时间和 UUID 排序；每项版本增加 1，并发布普通 `UPDATE` change-log/realtime 事件，客户端后续通过既有 Sync read pull 收敛。版本冲突为 `409 RESOURCE_VERSION_CONFLICT`。本操作是在线 REST 动作，不扩展 Sync inbound mutation 类型。
- 插入顺延仅移动起始时间处于请求当天窗口内的 Task。前一日开始但区间跨入当天的 Task 保持不动；若它与插入后的排期冲突，整个请求返回 `400 VALIDATION_FAILED`，不改写任何 Task。
- 所有资源的用户归属均从 Bearer access token 推导；跨用户 ID 统一按未找到处理。版本冲突返回 `409 RESOURCE_VERSION_CONFLICT`，删除后的普通详情/列表不返回墓碑。

## 阶段 2B Source、Asset、Relation 已构建契约

- `POST /api/assets/upload-intents` 请求字段为 `baseVersion=0`、必填 UUID `clientImportId`、`originalName`、`sizeBytes`、`mimeType`、可选 `sha256`；成功返回 `201 + Location` 和 `{assetId,uploadUrl,headers,expiresAt,uploadStatus}`。同一用户重放同一 `clientImportId` 且 immutable metadata（文件名、大小、MIME、sha256）一致时返回同一 Asset 及当前 `uploadStatus`；`UPLOADING` 会重新签发 URL，`READY`/`ORPHANED` 不会签发可覆盖对象的 URL。metadata 冲突返回 `409 MUTATION_REJECTED`。该 key 按用户隔离，不同用户可以复用。服务端生成用户前缀 object key，不接受客户端提交 object key；配置 MinIO 时 headers 包含 Content-Type/Content-Length，声明 sha256 时额外包含 `X-Amz-Meta-Sha256`。
- `POST /api/assets/{id}/complete` 不接受客户端对象元数据；服务端对绑定 object key 执行 HEAD/stat，校验真实大小、MIME 和已声明 sha256，成功返回 `AssetResponse` 并将状态置为 `READY`。校验失败返回 `400 UPLOAD_VALIDATION_FAILED` 并记录 `FAILED`。
- `POST /api/assets/{id}/download-url` 只对当前用户拥有且 `READY` 的 Asset 返回 `{url,expiresAt}`；Asset 不作为 Relation 节点，也不进入普通同步资源列表。
- Source 创建/更新字段为 `baseVersion`、`subjectId`、`type`、`title`、可选 `assetId`、`originUrl`、`rawText`、`outline`；type 仅为 `FILE`、`TEXT`、`URL`。FILE 必须引用同一用户的 READY Asset，TEXT 必须有 rawText，URL 必须是 HTTP/HTTPS URL。Source 成功响应对 FILE 资料额外返回可选 `assetSizeBytes`（Asset 原始字节数），以及服务端生成、客户端只读的 `ingestionRevision`；TEXT/URL 或无法关联 Asset 时 `assetSizeBytes` 为 JSON `null`。
- FILE Source 创建进入 `AWAITING_CLIENT`，Asset 替换或 FILE reingest 轮换 revision 并保持该状态，不发布服务端 ingestion event；TEXT/URL 创建、更新和 reingest 清理安全错误并进入 `PENDING`，继续发布 `SourceIngestionRequestedEvent`。FILE 仅标题等不影响解析的更新保留当前状态。Source 其余成功操作沿用直接 DTO、版本冲突、软删除、恢复和列表 envelope 规则。
- Relation 创建/更新字段为 `baseVersion`、`sourceType`、`sourceId`、`targetType`、`targetId`、`type`、可选 `label`；节点仅允许 `SUBJECT`、`SOURCE`、`KNOWLEDGE_BLOCK`、`TASK`，关系类型仅允许 `CONTAINS`、`REFERENCES`、`DERIVED_FROM`、`DEPENDS_ON`、`RELATED_TO`。
- Relation 创建、更新、恢复都会验证两端属于当前用户且未删除，禁止自关联；`RELATED_TO` 对端点排序后去重，其他类型保持方向性。端点软删除会级联软删除相关 Relation，端点恢复不自动恢复关系。
- `GET /api/sources` 和 `GET /api/relations` 同样返回 `{items,nextCursor,hasMore}`，接受不透明 `cursor` 与 `limit`（1–200），按 `updatedAt DESC, id ASC` 稳定分页。
- 阶段 2B 的 H2/MockMvc 自动测试覆盖以上路由、错误、版本、用户隔离和级联语义；真实 MinIO 签名 URL、HEAD/stat、PostgreSQL 和人工验收仍未执行。

## 阶段 3 离线同步已实现契约

- `POST /api/sync/push` 接受 `serverDeviceId` 和 `mutations[]`；每条 mutation 包含 `clientMutationId`、`resourceType`、`resourceId`、`mutationType`、`baseVersion` 和可选 `payload`。首批资源为 `SUBJECT`、`SOURCE`、`KNOWLEDGE_BLOCK`、`TASK`、`RELATION`，操作为 `CREATE`、`UPDATE`、`DELETE`、`RESTORE`。
- Push 返回 `results` 和 `serverCursor`。结果 decision 为 `APPLIED`、`CONFLICT` 或 `REJECTED`，包含资源、mutation、change cursor、当前 DTO/快照、稳定 code 和 `recordedAt`。同一用户/设备/`clientMutationId` 重放时返回首次结果；同键不同内容只拒绝该条 mutation，并返回 `MUTATION_REJECTED`，不会中止同批其他 mutation。
- `GET /api/sync/pull?cursor=<opaque>&limit=<1..200>` 返回 `changes`、`nextCursor`、`hasMore`、`resetRequired`；省略 cursor 从 0 开始。cursor 为 Base64URL 不透明值，资源变更由 REST 直接写入和 push 共同记录。
- `GET /api/sync/snapshot` 返回 `snapshotCursor` 以及当前用户 subjects、sources、knowledgeBlocks、tasks、relations 的完整视图，包含 `deletedAt` 非空的墓碑记录；快照 cursor 与这些列表在同一可重复读事务中确定。快照与同步数据不暴露 JPA Entity，Asset 不进入普通 mutation。
- 同步设备必须属于当前用户且未撤销；所有资源、change log 和幂等记录均执行 userId 隔离。默认保留窗口为 30 天，`SyncRetentionService` 按 `auralis.sync.retention-cleanup-delay-millis` 定时清理，并通过 Micrometer 记录清理行数、失败数和 `resetRequired` 次数；高水位 cursor 不随清理回退。省略 cursor 或 cursor=0 时，若该用户无历史变更或从 1 起的日志仍完整，可正常 pull；若早期日志已部分或全部清理，则返回 `resetRequired=true`。所有过期 cursor 均要求客户端执行完整 snapshot。PostgreSQL、双设备断网重连和生产调度验收仍未执行。

## 阶段 4 Review、Stats、Realtime 已实现契约

- `GET /api/reviews/due?at=<RFC3339>&limit=<1..200>` 返回当前用户活动知识块的到期 ReviewState；`POST /api/reviews/events` 接受 `clientEventId`、`knowledgeBlockId`、`rating`、`reviewedAt`、`durationSeconds`、`baseVersion`，rating 为 `AGAIN`、`HARD`、`GOOD`、`EASY`、`SKIP`。SKIP 只写不可变事件，不更新状态；重复 clientEventId 返回首次结果。
- `GET /api/reviews/history?knowledgeBlockId=...` 返回当前用户的不可变复习历史。默认 `FSRS_LITE` 参数集为版本 1，调度结果由状态、评分、时间和参数版本确定。
- `GET /api/stats/overview?at=<RFC3339>` 返回活动知识块、活动任务、到期复习、已完成复习和活动来源的强类型统计；`GET /api/stats/weekly?from=<date>&to=<date>` 只接受连续 7 天，并按 UTC 日期返回复习、学习秒数、完成任务和新增知识块计数。
- `POST /api/realtime/ticket` 不接受请求体，服务端从 Bearer access JWT 的 `serverDeviceId` 解析并校验当前设备，返回一次性短期 `{ticket,expiresAt,websocketUrl}`；`/ws/events` 仅接受 WebSocket upgrade，不提供 HTTP `GET` 订阅回退。握手通过 query `ticket` 或 `X-Realtime-Ticket` 认证，不能把 Bearer access token 放入 WebSocket URL；领域写入提交后才发布 `SYNC_CHANGED`/`REVIEW_UPDATED` 事件，同用户的进程内订阅者接收通知。ticket 只持久化 hash，不能跨用户、重用或过期使用。
- 阶段 4 自动测试证明 H2/JPA/MockMvc、参数调度、幂等、用户隔离和进程内事件桥；浏览器 WebSocket、跨实例 broker、真实设备和前端消费仍未执行。

## 目标认证规则

除公开注册、登录和刷新路径外，业务请求使用 Authorization: Bearer access-token。

- access JWT 有效期 15 分钟，只包含最小 subject、session/device、签发和过期信息。
- refresh session 有效期 30 天；每次刷新执行 rotation。
- refresh token 只保存不可逆 hash，不能作为普通 access token 使用。
- refresh token 重放会撤销对应 rotation 链。
- 登录失败对未知用户和错误密码返回相同外部错误。
- 所有业务 Repository 必须在查询条件中包含当前 userId。

## 旧 Server 代码事实（仅供替换前盘点）

旧代码仍使用 /api/auth、/api/blocks、/api/tasks、/api/relations、/api/sync、/api/fs、/api/assets 和 /api/ai；普通 REST 使用 Result<T>，分页和错误码没有新目标契约的稳定定义，WebSocket 使用 /ws/sync。

这些旧路径、Result 包装、状态码、请求体、响应体和行为不被新后端承诺兼容。旧前端迁移必须等待新 OpenAPI 稳定后单独进行。

## 阶段 0/1/2A/2B/3/4 契约边界

已完成：目标路由表、通用响应规则、Problem Details 字段、阶段 1 Auth、阶段 2A 三类核心资源、阶段 2B Source/Asset/Relation 请求/响应、阶段 3 Sync、阶段 4 Review/Stats/Realtime、R1-05 核心列表 cursor/会话并发版本规则和旧契约不兼容结论。

未完成：真实 Provider/外部模型联调、MinIO 异常路径、双设备/过期 cursor 生产验收、浏览器 WebSocket、前后端联调和人工业务验收。R1/R2 已由默认 `clean test` 实际执行 PostgreSQL clean/upgrade、pgvector 与 MinIO Testcontainers；这不代表完整 Compose 或全模块生产验收。

## 阶段 5 AI/RAG 后端基线契约（2026-08-16）

- `GET /api/ai/settings` 返回当前用户各 Provider 的配置摘要；`PUT /api/ai/settings` 接受 `provider`、`baseUrl`、`chatModel` 和可选 `apiKey`，不接受用户 Embedding 模型配置。返回值只暴露 `hasApiKey`，不返回明文或密文。Provider 配置按用户隔离，首次创建必须提供 key，更新时可保留原 key。客户端只能在本请求 body 中提交 key，禁止持久化明文或在普通请求中附加 BYOK header。普通聊天运行时解析顺序为当前用户有效 BYOK 优先，其次是服务端 env 默认 Provider（`DEEPSEEK_API_KEY`、`OPENAI_API_KEY`、`SILICONFLOW_API_KEY`）；env key 不写入 `ai_credentials` 或 API 响应。检索及入库的 Embedding 使用服务端 SiliconFlow 配置，与用户聊天 Provider 分离。
- `GET /api/ai/settings/{provider}/models` 返回 `{provider,models}`，可选地读取已保存 BYOK Provider 的 `GET /models`，按 `data[].id` 最多提取 200 个模型；不支持该端点的服务仍可手动填写 `chatModel`。`POST /api/ai/settings/{provider}/test-connection` 使用已保存的聊天模型发起最小 `POST /chat/completions` 请求，返回 `{provider,reachable,chatModel}`，不依赖 `/models`。两者均不读取 env 默认凭据，也不接收临时明文密钥。未保存配置返回 `503 MODEL_UNAVAILABLE`；无效/不安全地址返回 `400 VALIDATION_FAILED`；上游认证拒绝或响应格式无效返回 `502 MODEL_PROVIDER_ERROR`；超时返回 `504 MODEL_TIMEOUT`，429 返回 `RATE_LIMITED`，上游 5xx 返回 `503 MODEL_UNAVAILABLE`。`OPENAI_COMPATIBLE` 是通用协议类型，服务商名称不单独持久化。
- `POST /api/ai/conversations` 创建会话；请求可选 `clientRequestId`，同一用户重放同一非空值必须返回同一会话，供离线会话恢复使用。`GET /api/ai/conversations` 列出当前用户未删除会话；`GET /api/ai/conversations/{conversationId}` 返回消息和会话 `version`；`DELETE /api/ai/conversations/{conversationId}?baseVersion=<n>` 必须携带当前 `baseVersion` 并执行 owner-scoped 软删除，版本冲突返回 `409 RESOURCE_VERSION_CONFLICT`。
- `POST /api/ai/messages/stream` 使用 `text/event-stream`，请求包含 `conversationId`、`content`、可选 `provider`、`retrievalEnabled`、`topK` 和可选 `clientRequestId`。省略 `provider` 时使用 `auralis.ai.default-provider`；`topK` 必须为正整数且不超过 `auralis.ai.max-retrieved-chunks`（当前 DTO 上限为 32）；同一用户的 `clientRequestId` 重试会回放已持久化结果，不重复创建 USER 消息或调用 Provider。相同会话并发请求会在短事务中先唯一保留 USER 消息，Provider I/O 不持有数据库事务；assistant 仅关联其对应的 USER 消息。事件为 `message.started`、零个或多个 `citation`、零个或多个 `message.delta`、`message.completed`、`message.error`；citation 包含 `sourceId`、`chunkId`、ordinal、标题、excerpt 和 similarity，USER 消息先持久化，ASSISTANT 成功、失败或断流状态随后持久化。
- `POST /api/ai/suggestions` 接受 `type`（`SUMMARY`、`QUESTIONS`、`NEXT_STEPS`、`REVIEW_PROMPT`）、`knowledgeBlockId` 和 `limit`（1–20），仅允许访问当前用户 KnowledgeBlock；当前输出为可替换的确定性后端基线，引用列表可能为空。
- `POST /api/ai/source-overviews` 接受 `{sourceId,mode,instruction?}`；`POST /api/ai/subject-overviews` 接受 `{subjectId,mode,instruction?,sources}`。客户端可通过 `X-Overview-Request-Id` 传递本次尝试的关联 ID；服务端日志为每次生成记录 `generationId`，并按 user/source/revision 和 MAP、REDUCE、JSON_PARSE、SCHEMA_VALIDATE、CACHE_RETURN 阶段关联。两者都从 Bearer access token 推导 user，拒绝 `userId`、Provider 凭据及非当前 owner 的 Source/Subject。`mode` 只能为 `ALL`、`OUTLINE`、`SUMMARY`；响应固定为 `{schemaVersion:1,title,outline,summary}`，其中 `OUTLINE` 的 `summary` 为 `null`，`SUMMARY` 的 `outline` 为 `null`，`ALL` 两项均非 null；可空响应字段仍是契约的一部分而非缺省字段。
- `instruction` 最长 2,000 字符，Subject `sources` 必须为 1–100 项且不能重复 Source；响应 title 最长 300 字符、最多 60 个 chapter/500 个 section/100 个 key point，所有 prose 字段最长 4,000 字符。Source overview 只读取 owner-scoped `READY` Source 的 active chunks；Subject overview 按请求 mode 要求每个输入拥有相应非空 outline/summary，逐项验证 Source 属于请求 Subject 和当前 user，并将服务端 Source UUID 映射为短别名后才交给模型。
- 模型只接收固定 SYSTEM schema/安全规则与独立的 USER 数据字段（instruction、title、chunks/map JSON、显式 alias）；USER 资料内命令不能改变 SYSTEM 规则。回复仅接受单个 JSON object 或单个 `json` fenced block；服务端拒绝包围 prose、malformed JSON、未知/重复 Source alias、过量节点及任何 locator（当前 chunks 没有可信页码/block alias，输出 `locator` 必须为 `null`），并只在最终响应映射为实际 Source UUID。多 batch Source MAP 与非最终 multi-group REDUCE 是 intermediate，使用 `max_tokens=4608`；single-batch Source MAP、Subject direct 与最终单 group REDUCE 是 final，使用 `max_tokens=6144`。Intermediate 规范化 JSON 必须 `<=5200` 字符且 self-pair prompt fit（`<=12000`），Reduce 每轮结果数量必须严格下降；不自动压缩重试。所有 Overview 调用继续使用内部 structured JSON 标记要求 OpenAI-compatible `json_object` response format；DeepSeek completion 同时关闭 thinking，且不会把 `reasoning_content` 回退为最终 JSON。普通聊天/流式请求不启用该标记，公开请求/响应 DTO 不变。两个端点同步且无状态：不创建 Conversation/Message、同步资源、数据库表或迁移；结果由 PC 的 owner/device-scoped 派生缓存保存。客户端输入验证、instruction 或输入 prompt 不合法返回 400 `VALIDATION_FAILED`；Provider 输出 parse/schema/alias/locator 等其它无效错误返回 502 `MODEL_PROVIDER_ERROR`；中间输出预算超限返回 502 `OVERVIEW_PROVIDER_OUTPUT_TOO_LARGE`；Reduce 无进展返回 502 `OVERVIEW_REDUCE_NO_PROGRESS`；Provider 不可用返回 `MODEL_UNAVAILABLE`。公开 API route、DTO、OpenAPI schema 未因该内部预算策略变化。
- TEXT/URL Source 创建、更新和 reingest 与对应 ingestion job 在同一事务持久化，job 入队失败则 Source 与 change log 一起回滚；恢复处于 `PENDING/PARSING/INDEXING` 的 TEXT/URL Source 时，按当前 revision 原子补建或复用活跃 job，`READY/FAILED` 不自动重跑；FILE 继续等待 ParsedDocument complete。TEXT 正文或 URL 地址等解析输入变化轮换只读 `ingestionRevision`，不同修订分别建 job，同修订活跃 job 可复用。启用 `auralis.ai.ingestion-worker-enabled` 后，定时 worker 通过数据库锁定的 claim-next 自动执行；提交前核对 Source revision、job/generation、attempt 和在取得行锁后仍有效的 lease，旧 worker 不得覆盖新修订的 Source/chunks。租约过期任务可恢复，失败按 `auralis.ai.ingestion-max-attempts` 重试后进入 `FAILED` 终态。worker 执行 `PARSING → INDEXING → READY/FAILED`，文本/文本型文件/URL 解析后切块，生成 1024 维 embedding 并按 userId/sourceId 保存。PostgreSQL 使用 pgvector SQL/HNSW 执行用户隔离的 cosine 检索；H2 保留 JSON embedding 的确定性 cosine fallback。
- SSE 使用 Spring MVC `StreamingResponseBody`，Controller 通过回调把 Provider 增量直接写入响应，不先构造完整事件列表；OpenAI-compatible 适配器解析上游 SSE 的 `data:` 增量、`[DONE]`、超时、429/5xx 和 malformed event。当前自动证据为 Stub/受控 HTTP，不代表真实 Provider 网络、证书、配额或前端联调已通过。文件解析当前只覆盖文本型 MIME，不声称 PDF/DOCX 全格式支持。
- Provider `baseUrl` 只允许 HTTPS、无 userinfo/query/fragment、无危险端口（默认或显式 443）。`DEEPSEEK` 与 `SILICONFLOW` 的 host 必须精确匹配 `AURALIS_AI_ALLOWED_PROVIDER_HOSTS`；`OPENAI_COMPATIBLE` 允许用户指定公网 HTTPS host。保存和实际请求前执行地址安全校验，实际连接固定到已检查的公网 DNS 地址，Provider 重定向关闭；本地、内网及 NAT64、6to4、Teredo IPv6 转换前缀不在通用 Provider 范围内。
- Provider 请求使用独立的 `AURALIS_AI_PROVIDER_CONNECT_TIMEOUT_MILLIS` 连接超时与 `AURALIS_AI_REQUEST_TIMEOUT_MILLIS` 普通聊天/流式/embedding response-read 窗口；Overview map/reduce 非流式 completion 使用可配置的 `AURALIS_AI_OVERVIEW_RESPONSE_TIMEOUT_MILLIS`（默认 120000ms，允许范围 60000–120000ms）。连接超时只用于固定地址 TLS socket，普通请求 response/read 默认 10000ms。`SocketTimeoutException` 返回稳定 `MODEL_TIMEOUT`（HTTP 504），其它 IOException 仍为 `MODEL_UNAVAILABLE`（HTTP 503），429/5xx/400 的既有映射不变；来源 URL 保留 HTTP/HTTPS，但每个手动重定向都会重新校验并重新固定 DNS 地址。BYOK key 只以 AES-GCM 密文存储，设置响应、异常和 `toString()` 不输出 key。
- 阶段 5 的自动证据包括 H2/JPA/MockMvc、Stub Provider、Flyway V1–V14、架构测试、出站安全专项，以及默认 `clean test` 的真实 PostgreSQL 17/pgvector 与 MinIO Testcontainers。R1-03 已验证 HNSW、vector(1024) 写入、用户隔离、generation 原子切换、失败回滚和 Source 删除过滤；R1-04/R1-05 增加了会话恢复键、同一请求并发保留、精确 assistant 关联及流式回放测试。真实 Provider 网络/证书/限流、浏览器前端联调和人工业务验收仍未完成。

## PC Tauri AI 辅助阅读契约（2026-08-23，2026-08-26 已实现代码门禁，真实联调与验收待完成）

本节登记 S1–S6、K1、C4 和 C5 已落地的接口行为、生成 SDK 与端侧上传边界；真实客户端业务联调和人工业务验收仍未完成。完整决策见 [PC Tauri AI 辅助阅读全流程设计](../design/2026-08-23-pc-tauri-ai-assisted-reading-design.md)。

- FILE Source 完成原 Asset 上传并创建后进入 `AWAITING_CLIENT`；客户端提交解析结果后经过 `VALIDATING → INDEXING → READY/FAILED`。SourceResponse 已新增服务端生成、客户端只读的 `ingestionRevision`。TEXT/URL Source 保持现有服务端解析状态机。
- S2 已落地 FILE/TEXT/URL 分流：FILE create 不发布 `SourceIngestionRequestedEvent`；Asset 替换或 FILE reingest 轮换 revision 并回到 `AWAITING_CLIENT`，仅标题等不影响解析的 FILE 更新保留当前状态；TEXT/URL create/update/reingest 继续进入 `PENDING` 并发布现有 server ingestion event。请求 DTO 不接受 `ingestionRevision`，客户端不能覆盖该字段。
- 任意端可继续上传和预览 FILE Source；只有 PC Tauri 提交 ParsedDocument。Mobile/Tablet 上传的 FILE 在 PC 处理前保持 `AWAITING_CLIENT`，本期不由移动端伪装为 AI READY。
- PC Tauri 在原 Asset upload-intent 前流式计算并提交 SHA-256。历史 Asset 的 `sha256` 为空时，服务端在首次接受 ParsedDocument 前流式读取原对象并原子回填；不能直接信任客户端声明。
- `POST /api/sources/{sourceId}/parsed-documents/upload-intents` 接受 `ingestionRevision`、`schemaVersion`、`parserId`、`parserVersion`、`normalizationVersion`、可选 `ocrModelVersion`、`sourceAssetSha256`、`payloadSha256` 和 `sizeBytes`，返回 `parsedDocumentId`、服务端确认的 `ingestionRevision`、私有预签名上传 URL、限定 headers 与过期时间。
- S3 已实现上述 upload-intent：仅允许当前用户拥有的 FILE Source 和匹配的只读 revision，schemaVersion 当前固定为 `1`，payload/size 在签名请求前校验；服务端创建 `UPLOADING` ParsedDocument，object key 固定为 `users/{userId}/sources/{sourceId}/revisions/{ingestionRevision}/parsed-documents/{parsedDocumentId}`，不接受客户端 `userId` 或 `objectKey`，Source 仍保持 `AWAITING_CLIENT`。MockMvc 定向测试 `ParsedDocumentControllerTests` 3/3 通过。
- S4 已加入服务端有界流式 payload validator：限制 gzip 压缩/解压字节、解压比例、UTF-8 JSON schema、parser/block 字段、连续 ordinal、规范化正文 characterCount/plainTextSha256 和 upload-intent payloadSha256；历史 Asset 的空 SHA 只通过服务端原对象流计算并条件回填，客户端声明不作为可信来源。`ParsedDocumentValidatorTests` 4/4、`AssetShaBackfillTests` 2/2 通过。
- S5 已实现 `POST /api/sources/{sourceId}/parsed-documents/{parsedDocumentId}/complete`：不信任客户端对象元数据，服务端锁定 owner-scoped Source，执行 HEAD/stat、Asset/payload 哈希、revision、压缩与 schema 上限校验；同一 ParsedDocument 或相同 revision + payload hash 重放幂等，同 revision 不同 payload 返回 `409 PARSED_DOCUMENT_CONFLICT`，旧 revision 返回 `409 INGESTION_REVISION_STALE`，成功只创建一个带 ParsedDocument/revision 的 PENDING indexing job 并将 FILE Source 切为 `INDEXING`。`ParsedDocumentCompleteTests` 3/3 通过，覆盖相同 payload、冲突、旧 revision 和并发首胜。
- S6 已让 indexing worker 对带 `parsedDocumentId` 的 FILE job 读取并重新验证已接受 payload 的 blocks，禁止回退原始文件 parser；job 的 revision/generation 与当前 Source/ParsedDocument 不一致时只失败旧 job，不污染当前 Source。FILE 兼容 reingest 复用当前 accepted ParsedDocument/revision 并重新排队 job；Asset 变更会将旧 revision 的 accepted 派生记录标记 `SUPERSEDED`，定时清理任务删除过期 `UPLOADING/REJECTED/SUPERSEDED` 对象并保留审计行。
- K1 已冻结两条 ParsedDocument route、`201/200/409` 响应、`PARSED_DOCUMENT_CONFLICT`/`INGESTION_REVISION_STALE` 描述、可选 `ocrModelVersion`、Source 只读 `ingestionRevision` 与 `AWAITING_CLIENT/VALIDATING` 状态；运行时 artifact、PC/Mobile 生成 schema 和 `useSourceApi` typed wrapper 已同步。`OpenApiArtifactTests` 4/4、`scripts/check-openapi.ps1` 和 PC type-check 通过。
- C4 已将 PC Tauri 的加密 cache receipt 接入 upload coordinator：Rust 只解密流式 PUT 到服务端签名 URL，URL/headers 只保留在内存；PUT 过期可重新申请 intent，网络错误进入 `PAUSED_NETWORK`，随后调用幂等 complete。SQLite 任务 `ingestion_revision` 使用服务端 UUID 文本，旧数字 v3 行迁移到可恢复 legacy 表；正文不穿过 Vue/HTTP coordinator。C5 的 FILE Source scheduler 只在 `AWAITING_CLIENT + ingestionRevision` 下创建本地 job，重启/跨设备通过 owner-scoped Asset download adapter 恢复，签名 URL 不落库。
- C5 将本地 job 的完整 `DocumentCacheReceipt` 元数据（cache id、大小、hash、chunk/envelope 信息）持久化为任务元数据，正文仍只在加密 Tauri cache；`PACKAGING/UPLOADING/PAUSED_NETWORK` 可恢复上传而不重复 OCR/package。Asset SHA mismatch、旧 revision 和非 FILE Source 在客户端边界拒绝或跳过。2026-08-26 起 `DocumentProcessingRuntime` 在 Tauri 登录后负责组装并绑定这些组件，sync/online 事件触发 Source 重载与 pending job 恢复；带 receipt 的网络暂停会回到 `UPLOADING` 边界。
- FILE Source 创建、Asset 替换和缺少兼容 ParsedDocument 的 reingest 不发布现有服务端解析事件；只有 complete 接受成功后创建 indexing job。`POST /api/sources/{id}/reingest` 在存在最新兼容 ParsedDocument 时复用该派生对象；原 Asset/schema 变化或显式重新解析时轮换 `ingestionRevision` 并回到 `AWAITING_CLIENT`。
- `POST /api/ai/messages/stream` 目标请求在现有字段上新增可选 `readingContext`，字段为可选 `currentSourceId`、必填 `subjectId`、必填 `retrievalMode`、可选且最多 100 项的 UUID `sourceIds` 和可选 `selectionText`。`AUTO` 要求 `currentSourceId`，保留当前文件检索及现有确定性跨文件规则；`SELECTED_SOURCES` 要求 1–100 个不重复的 `sourceIds`，只检索这些 Source；`SUBJECT` 不接受 Source ID，用户显式选择后检索该 Subject 下所有活动且 READY 的 Source。两种显式范围均先验证 Subject owner 与活动状态；所选 Source 必须归属该 Subject、归属当前用户且处于 READY，不能扩展到显式范围以外。当前文件继续沿用 `AUTO`；不引用资料时省略 `readingContext` 并设置 `retrievalEnabled=false`。无效集合或 Subject 返回 `VALIDATION_FAILED`，不存在或不属于当前用户的 Source 返回 `RESOURCE_NOT_FOUND`，未就绪 Source 返回 `SOURCE_NOT_READY`。
- `readingContext` 省略时保留现有普通聊天契约；PC 工作区不得把文件名拼接进 `content` 代替结构化上下文。`selectionText` 只作为有长度限制的用户 prompt 上下文，不参与检索命中、citation 或证据归属。
- `POST /api/ai/conversations` 目标新增可选 `purpose` 与 `sourceId`；省略 purpose 时为 `GENERAL`，阅读工作区使用 `purpose=READING_SESSION` 并绑定当前 Source。该会话不进入普通历史列表，切换/离开时客户端 best-effort 删除，服务端清理超过 24 小时无活动的遗留阅读会话。
- AI 会话在当前打开期间组装已完成历史消息；失败、取消或未完成 Assistant 消息不进入后续 Prompt。SSE citation 仍以实际检索结果为权威，PC 只呈现去重来源文件名。
