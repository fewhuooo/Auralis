# Auralis API 契约

更新时间：2026-08-12

文档状态：阶段 1 Auth 与阶段 2A Subject/KnowledgeBlock/Task 已实现并通过 H2 自动测试与 MockMvc；Source/Asset/Relation 及其余业务接口仍为 planned

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
| POST | /api/auth/register | 注册用户、设备、refresh session 和受保护的默认 Subject，HTTP 201，并返回 Location |
| POST | /api/auth/login | 校验凭据并签发 token pair，HTTP 200 |
| POST | /api/auth/refresh | rotation refresh session 并签发新 token pair，HTTP 200 |
| POST | /api/auth/logout | 撤销当前 access token 对应的 refresh session，HTTP 204 |
| GET | /api/auth/me | 返回当前用户公开资料，需 Bearer access token |
| GET | /api/auth/sessions | 返回当前用户会话元数据，需 Bearer access token |
| DELETE | /api/auth/sessions/{sessionId} | owner-scoped 撤销会话，HTTP 204 |
| DELETE | /api/auth/sessions/others | 撤销当前会话以外的会话，HTTP 204 |

阶段 2A 已开放 Subject、KnowledgeBlock、Task 的认证业务 Controller；Source、Asset、Relation 和其余业务路径仍不创建临时实现。

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

错误码至少包含 VALIDATION_FAILED、UNAUTHENTICATED、FORBIDDEN、RESOURCE_NOT_FOUND、RESOURCE_DELETED、RESOURCE_VERSION_CONFLICT、MUTATION_REJECTED、UPLOAD_VALIDATION_FAILED、INGESTION_FAILED、MODEL_UNAVAILABLE 和 RATE_LIMITED。

## 目标路由总览

以下路由是已批准目标契约；Auth 已在阶段 1 实现，其余仍为 planned-after-phase-0：

| 模块 | 目标路径 | 状态 |
| --- | --- | --- |
| Auth | /api/auth/register、/login、/refresh、/logout、/me、/sessions | implemented-phase-1 |
| Subject | /api/subjects、/api/subjects/{id}、/api/subjects/{id}/restore | implemented-phase-2a |
| Asset | /api/assets/upload-intents、/api/assets/{id}/complete、/api/assets/{id}/download-url | planned |
| Source | /api/sources、/api/sources/{id}、/api/sources/{id}/restore、/api/sources/{id}/reingest | planned |
| Knowledge | /api/knowledge-blocks、/api/knowledge-blocks/{id}、/api/knowledge-blocks/{id}/restore | implemented-phase-2a |
| Task | /api/tasks、/api/tasks/{id}、/api/tasks/{id}/restore | implemented-phase-2a |
| Relation | /api/relations、/api/relations/{id}、/api/relations/{id}/restore | planned |
| Review | /api/reviews/due、/api/reviews/events、/api/reviews/history | planned |
| Stats | /api/stats/overview、/api/stats/weekly | planned |
| Sync | /api/sync/push、/api/sync/pull、/api/sync/snapshot | planned |
| AI | /api/ai/settings、/api/ai/conversations、/api/ai/messages/stream、建议类接口 | planned |
| Realtime | /api/realtime/ticket；WebSocket 地址 /ws/events | planned |

## 阶段 1 Auth 已实现契约

### 请求与成功响应

- `POST /api/auth/register` 请求字段为 `username`、`password`、`displayName`、`deviceId`、`deviceName`、`platform`；成功返回 HTTP 201、`Location: /api/auth/sessions/{sessionId}` 和 AuthResult。
- `POST /api/auth/login` 请求字段为 `username`、`password`、`deviceId`、`deviceName`、`platform`；成功返回 HTTP 200 和 AuthResult。
- `POST /api/auth/refresh` 请求字段为 `refreshToken`；成功返回 HTTP 200 和新的 AuthResult。旧 refresh token 立即失效。
- AuthResult 使用直接 DTO，不使用 `Result<T>` 包装：`user { id, username, displayName }`、`tokens { accessToken, refreshToken, accessTokenExpiresInSeconds, refreshTokenExpiresInSeconds }`、`sessionId`、`deviceId`。
- `GET /api/auth/me` 返回 `UserView { id, username, displayName }`。
- `GET /api/auth/sessions` 返回 `{ items, nextCursor, hasMore }`；每个 item 包含 `id`、`deviceId`、`deviceName`、`platform`、`createdAt`、`lastUsedAt`、`expiresAt`、`revokedAt`、`current`。阶段 1 当前不提供 cursor，因此 `nextCursor=null`、`hasMore=false`。
- 登出和会话撤销成功返回 HTTP 204；会话查询和撤销始终从 SecurityContext 的 userId 推导归属，不接受客户端 userId。

### 鉴权和安全错误

- 注册、登录、刷新为公开路径；登出、当前用户和会话路径使用 `Authorization: Bearer <accessToken>`。
- access JWT 有效期配置默认 900 秒；refresh session 默认 2,592,000 秒（30 天）。JWT 只含 `sub`、`sid`、`did`、`typ=access`、`iat`、`exp`；refresh token 只保存 SHA-256 hash。
- 未登录、无效、过期、撤销或重放 refresh token 返回 HTTP 401、错误码 `UNAUTHENTICATED` 和安全 detail，不返回 token 内容。refresh token 不能作为 access token 使用。
- 重复使用已轮换的 refresh token 会撤销整个 rotation family；跨用户撤销不存在的 owner-scoped session 返回 HTTP 404、`RESOURCE_NOT_FOUND`，不泄漏归属。
- 参数校验返回 HTTP 400、`VALIDATION_FAILED` 和 `fieldErrors`；重复用户名返回 HTTP 409、`MUTATION_REJECTED`。安全过滤器错误也返回 `application/problem+json` 和 `X-Trace-Id`。

## 阶段 2A Subject、KnowledgeBlock、Task 已实现契约

- 三类资源均使用 `POST` 创建、`GET` 列表/详情、`PUT` 更新、`DELETE` 软删除和 `POST /{id}/restore` 恢复；创建返回 `201 + Location`，删除返回 `204`。
- 创建请求必须携带 `baseVersion=0`；更新、删除和恢复请求携带精确的 `baseVersion`。成功更新、删除、恢复均使服务器 `version` 增加 1；默认 Subject 不允许删除。
- `GET /api/subjects`、`GET /api/knowledge-blocks`、`GET /api/tasks` 返回 `{items,nextCursor,hasMore}`，阶段 2A 尚未接入 cursor，因此 `nextCursor=null`、`hasMore=false`，默认过滤已删除记录。
- Subject 请求字段为 `name`、`description`、`iconKey`、`color`、`sortKey`；响应另含 `defaultSubject`、`version`、`createdAt`、`updatedAt`、`deletedAt`。
- KnowledgeBlock 请求字段为 `subjectId`、可空 `sourceId`、`title`、`summary`、`content`、`tags`、`colorOverride`；阶段 2A 尚未实现 Source，因此非空 `sourceId` 会返回 `MUTATION_REJECTED`。响应不序列化 Entity。
- Task 请求字段为 `subjectId`、`title`、`description`、`status`、`scheduledAt`、`dueAt`、`durationMinutes`、`cognitiveLoad`、`sortKey`、`colorOverride`；status 仅接受 `TODO`、`IN_PROGRESS`、`DONE`、`CANCELLED`，cognitiveLoad 仅接受 `LOW`、`MEDIUM`、`HIGH`。
- 所有资源的用户归属均从 Bearer access token 推导；跨用户 ID 统一按未找到处理。版本冲突返回 `409 RESOURCE_VERSION_CONFLICT`，删除后的普通详情/列表不返回墓碑。

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

## 阶段 0/1/2A 契约边界

已完成：目标路由表、通用响应规则、Problem Details 字段、阶段 1 Auth 与阶段 2A 三类核心资源请求/响应、分页/版本规则和旧契约不兼容结论。

未完成：Source/Asset/Relation 及后续业务 Controller、完整 cursor、固定 OpenAPI artifact/SDK 生成、PostgreSQL/容器集成、前后端联调和人工业务验收。
