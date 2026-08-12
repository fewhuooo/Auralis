# Auralis API 契约

更新时间：2026-08-12

文档状态：阶段 0 已固化新目标契约；健康/文档基础已实现，业务接口尚未在新 Server 实现

权威范围：新后端 REST、SSE、WebSocket 的目标路径、鉴权、请求/响应规则和阶段状态。

事实来源：docs/plans/backend-greenfield-rewrite-plan.md、阶段 0 对象差异矩阵、替换前旧 Server 代码盘点。

## 契约状态说明

本文件同时保留替换前旧 Server 的代码事实，和绿地重写后的目标契约。旧代码事实不代表新 Server 兼容旧请求；目标契约的 planned-after-phase-0 路由必须在对应阶段实现并测试后，才能升级为可用。

阶段 0 可访问的实际路径只有：

| Method | Path | 阶段 0 行为 |
| --- | --- | --- |
| GET | /actuator/health | Spring Boot 健康汇总 |
| GET | /actuator/health/liveness | 进程存活探针 |
| GET | /actuator/health/readiness | 阶段 0 就绪探针 |
| GET | /v3/api-docs | OpenAPI 文档，骨架完成后可访问 |
| GET | /swagger-ui/index.html | OpenAPI UI，骨架完成后可访问 |

阶段 0 不实现业务 Controller，不创建临时业务路径。

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

以下路由是已批准目标契约，状态为 planned-after-phase-0：

| 模块 | 目标路径 |
| --- | --- |
| Auth | /api/auth/register、/login、/refresh、/logout、/me、/sessions |
| Subject | /api/subjects、/api/subjects/{id}、/api/subjects/{id}/restore |
| Asset | /api/assets/upload-intents、/api/assets/{id}/complete、/api/assets/{id}/download-url |
| Source | /api/sources、/api/sources/{id}、/api/sources/{id}/restore、/api/sources/{id}/reingest |
| Knowledge | /api/knowledge-blocks、/api/knowledge-blocks/{id}、/api/knowledge-blocks/{id}/restore |
| Task | /api/tasks、/api/tasks/{id}、/api/tasks/{id}/restore |
| Relation | /api/relations、/api/relations/{id}、/api/relations/{id}/restore |
| Review | /api/reviews/due、/api/reviews/events、/api/reviews/history |
| Stats | /api/stats/overview、/api/stats/weekly |
| Sync | /api/sync/push、/api/sync/pull、/api/sync/snapshot |
| AI | /api/ai/settings、/api/ai/conversations、/api/ai/messages/stream、建议类接口 |
| Realtime | /api/realtime/ticket；WebSocket 地址 /ws/events |

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

## 阶段 0 契约边界

已完成：目标路由表、通用响应规则、Problem Details 字段、认证规则、分页/版本规则和旧契约不兼容结论。

未完成：业务 Controller、OpenAPI 业务 schema、Flyway 数据库、业务安全/隔离/同步测试、SDK 生成、前后端联调和业务验收。
