# Auralis API 契约

更新时间：2026-07-10

文档状态：现行，代码确认，待自动化与联调验收

权威范围：Server REST/WebSocket 路径、鉴权、请求、响应、调用现状与已知契约风险

事实来源：`Auralis-Server/.../controller`、`common/Result.java`、WebSocket 代码与客户端 API 调用

## 基础地址

本地开发：

```text
http://localhost:8080
```

PC Web 可通过 Vite 代理使用相对 `/api`。Mobile Auth Store 当前硬编码 `http://127.0.0.1:8080/api`；真机上的 `127.0.0.1` 指向设备自身，联调时必须改为可访问地址或采用环境配置。

## 鉴权

除 `/api/auth/**` 外，`/api/**` 请求必须携带：

```http
Authorization: Bearer <access-token>
```

- refresh token 只允许用于 `POST /api/auth/refresh`。
- `AuthInterceptor` 拒绝把 refresh token 当作普通 API token。
- WebSocket 使用 `?token=<access-token>` 握手，后续 PING 可携带更新 token。
- 客户端传入的 userId 不构成授权依据。

## 统一响应

普通 REST 使用 `Result<T>`：

```json
{
  "code": 200,
  "message": "Success",
  "data": {}
}
```

`Result.error(code, message)` 支持业务错误，但当前仓库没有完整稳定的全局错误码契约。调用方不得只依赖 HTTP status，也不得假设所有异常都有固定 code。

## Auth

| Method | Path | 请求 | `data` | 鉴权 | 代码来源 |
| --- | --- | --- | --- | --- | --- |
| POST | `/api/auth/login` | `{username,password}` | `{accessToken,refreshToken}` | 公开 | `AuthController.login` |
| POST | `/api/auth/register` | `{username,password}` | `Boolean` | 公开 | `AuthController.register` |
| POST | `/api/auth/refresh` | `{refreshToken}` | `{accessToken,refreshToken}` | refresh body | `AuthController.refresh` |

行为：登录校验 BCrypt；旧明文密码可在成功登录后迁移。刷新端点验证有效期和 token 类型。

待测：重复用户名、空字段、错误密码、过期 token、access token 误传刷新端点、refresh token 误传普通端点。

## KnowledgeBlock

基础路径：`/api/blocks`

| Method | Path | 参数 | 响应 | 说明 |
| --- | --- | --- | --- | --- |
| POST | `/api/blocks` | `KnowledgeBlock` body | `KnowledgeBlock` | userId 由当前用户边界决定 |
| GET | `/api/blocks` | `subject?`, `page=1`, `size=10` | `Page<KnowledgeBlock>` | 分页查询当前用户 |
| PUT | `/api/blocks/{id}` | path id + body | `KnowledgeBlock` | path id 为目标 id |
| DELETE | `/api/blocks/{id}` | path id | `Boolean` | 与同步软删除语义仍需统一验证 |

字段以 [数据库契约](Database.md) 为准。

## TaskBlock

基础路径：`/api/tasks`

| Method | Path | 参数 | 响应 | 说明 |
| --- | --- | --- | --- | --- |
| POST | `/api/tasks` | `TaskBlock` body | `TaskBlock` | 当前用户任务 |
| GET | `/api/tasks` | `subject?`, `status?`, `page=1`, `size=10` | `Page<TaskBlock>` | 分页过滤 |
| PUT | `/api/tasks/{id}` | path id + body | `TaskBlock` | 更新目标任务 |
| DELETE | `/api/tasks/{id}` | path id | `Boolean` | 删除语义待统一 |

风险：数据库 DDL 有 `position`，Server Entity 没有该字段，直接 API 无法稳定表达同一排序值。

## BlockRelation

基础路径：`/api/relations`

| Method | Path | 参数 | 响应 |
| --- | --- | --- | --- |
| POST | `/api/relations` | `BlockRelation` body | `BlockRelation` |
| GET | `/api/relations` | `sourceId?`, `targetId?` | `List<BlockRelation>` |
| DELETE | `/api/relations/{id}` | path id | `Boolean` |

客户端当前没有完整正式对接清单。关系端点存在不等于图谱数据链路已验收。

## Sync

基础路径：`/api/sync`

### Pull

```http
GET /api/sync/pull?afterId=0
```

响应：`SyncPullResponse`。

- `afterId=0`：当前用户冷启动，返回未删除知识块和任务块。
- `afterId>0`：返回该 cursor 后当前用户 mutation。
- 客户端必须保存并单调推进服务端 cursor，不能用客户端时间替代。

### Push

```http
POST /api/sync/push
Content-Type: application/json

[
  {
    "clientId": "device-id",
    "entityType": "block",
    "entityId": "entity-id",
    "action": "create",
    "payload": {}
  }
]
```

响应：`List<Long>`，表示处理后的 mutation id。

`entityType` 当前语义包括 `block`、`task`；`action` 包括 `create`、`update`、`delete`。服务端必须覆盖 userId，不能采用客户端提交的用户归属。

待测：重复 mutation、非法类型、乱序、跨用户、冷启动、增量、软删除、断网重试。

## FileStorage 与 Asset

### 预签名 URL

```http
GET /api/fs/presigned-url?fileName=<name>&contentType=<mime>
```

`contentType` 默认 `application/octet-stream`。响应 data 包含：

- `presignedUrl`
- `objectName`
- `bucket`
- `maxFileSizeMb`
- `expiresInMinutes`

`objectName` 由后端按当前用户生成前缀，并清理文件名。

### 绑定资产

```http
POST /api/assets/bind
```

```json
{
  "objectName": "user-prefix/object",
  "fileName": "source.pdf",
  "fileSize": 12345,
  "contentType": "application/pdf",
  "subject": "数学"
}
```

响应 `Asset`。当前代码校验 objectName 用户前缀；仍需校验 MinIO 对象存在、真实大小和 MIME。

### 查询资产

```http
GET /api/assets/{id}
```

只允许查询当前用户资产。

## AI / RAG

基础路径：`/api/ai`

| Method | Path | 请求 | 响应 |
| --- | --- | --- | --- |
| POST | `/chat` | `systemPrompt?`, `message`, `requireJson`, `subjectId?`, `sourceFileName?` | `Result<String>` |
| GET | `/chat` | query `message`, `subjectId?`, `sourceFileName?` | `text/event-stream` |
| POST | `/ingest` | `content`, `source?`, `subject?` | `llmExtraction`, `ingestedBlockIds`, `totalChunks` |
| POST | `/ingest/file` | multipart `file`, `subject=文档导入` | 文件名、块 ids、chunk 数 |
| POST | `/extract-tasks` | `{text}` | `Result<String>` |
| POST | `/convert-handwriting` | `{text}` | `Result<String>` |
| POST | `/schedule-suggest` | `{text}` | `Result<String>` |

约束：

- 客户端不能传入服务端 AI key 或 base URL。
- `requireJson=true` 只能表达模型输出期望，不保证永远得到有效 JSON。
- SSE 调用方必须处理断流、取消、超时和部分输出。
- 文件摄入必须遵守服务端上传上限和不可信文件处理规则。

## Stats

| Method | Path | 响应 |
| --- | --- | --- |
| GET | `/api/stats/overview` | `Map<String,Object>` |
| GET | `/api/stats/weekly` | `Map<String,Object>` |

当前 Map 未形成强类型公开 schema。前端不得把未声明键作为长期稳定契约；后续应引入 DTO 和测试。

## WebSocket

连接：

```text
ws://localhost:8080/ws/sync?token=<access-token>
```

代码确认的生命周期：

1. 握手拦截器验证 query token 并保存 token/username。
2. JSON 消息 `type=PING` 时读取可选 token。
3. token 有效则更新 session 并返回 `PONG` 与时间戳。
4. token 无效或过期则关闭连接。
5. 后台每 60 秒审计活动连接 token。

用途：同步事件、文档解析完成/失败通知。消息业务 schema 尚未完整固化为本文档契约，必须通过联调或测试补齐。

## 客户端调用覆盖

PC 当前调用 Auth、Sync、FileStorage、Asset、Stats、AI 和 WebSocket。Mobile 当前调用 Auth、Sync、AI 和 WebSocket；部分页面仍使用本地数据或间接 Store。

## 修改规则

- Controller 路径、方法、参数、响应或鉴权变化必须同步本文件。
- Entity/DDL 变化同步 `Database.md`。
- Mobile 页面调用变化同步 `MobilePagesAPIMap.md`。
- 未自动测试的端点保持“代码确认，待验收”，禁止升级状态。
