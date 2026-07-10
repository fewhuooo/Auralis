> [!WARNING]
> 本文档为历史归档，仅用于追溯需求、设计与项目演进。它不是 Auralis 当前实现、状态、接口或任务的依据。开发者与 AI Agent 禁止依据本文恢复旧实现、判断当前完成度或创建当前任务；请从 `docs/README.md` 进入现行文档体系。

# API 接口文档

更新时间：2026-07-02

## 文档来源与维护规则

当前接口清单以 `Auralis-Server/src/main/java/com/auralis/server/controller` 下的 Controller 为准。旧 `page_api_manifest.md` 已从工作区移除，本文档不依赖该历史文件。

维护规则：

- 新增、删除或修改 Controller 接口后，必须同步更新本文档。
- 前端新增 API 调用前，先确认本文档和 Controller 是否一致。
- 当前状态为 `已构建待验收` 的接口，表示代码存在但还缺少测试或人工联调证据。

## 全局约定

开发环境基础地址：

```text
http://localhost:8080
```

除 `/api/auth/**` 外，所有 `/api/**` 接口都需要：

```http
Authorization: Bearer <access-token>
```

refresh token 仅用于：

```text
POST /api/auth/refresh
```

## 全局响应结构

后端统一使用 `Result<T>` 包装响应。建议文档口径：

```json
{
  "code": 200,
  "message": "success",
  "data": {}
}
```

## 全局错误码建议

| code | 含义 |
| --- | --- |
| 200 | 成功 |
| 400 | 请求参数错误 |
| 401 | 未登录或 token 无效 |
| 403 | 已登录但无权限 |
| 404 | 资源不存在 |
| 409 | 数据冲突 |
| 500 | 服务端错误 |

## Auth API

| Method | URL | Body | 响应 | 状态 |
| --- | --- | --- | --- | --- |
| POST | `/api/auth/register` | `username`, `password` | `Result<Boolean>` | 已构建待验收 |
| POST | `/api/auth/login` | `username`, `password` | `accessToken`, `refreshToken` | 已构建待验收 |
| POST | `/api/auth/refresh` | `refreshToken` | `accessToken`, `refreshToken` | 已构建待验收 |

## KnowledgeBlock API

| Method | URL | 参数 | 响应 | 状态 |
| --- | --- | --- | --- | --- |
| POST | `/api/blocks` | `KnowledgeBlock` body | `Result<KnowledgeBlock>` | 已构建待验收 |
| GET | `/api/blocks` | `subject?`, `page`, `size` | `Result<Page<KnowledgeBlock>>` | 已构建待验收 |
| PUT | `/api/blocks/{id}` | `KnowledgeBlock` body | `Result<KnowledgeBlock>` | 已构建待验收 |
| DELETE | `/api/blocks/{id}` | path `id` | `Result<Boolean>` | 进行中 |

备注：直接 DELETE 当前仍需和同步软删除语义统一。

## TaskBlock API

| Method | URL | 参数 | 响应 | 状态 |
| --- | --- | --- | --- | --- |
| POST | `/api/tasks` | `TaskBlock` body | `Result<TaskBlock>` | 已构建待验收 |
| GET | `/api/tasks` | `subject?`, `status?`, `page`, `size` | `Result<Page<TaskBlock>>` | 已构建待验收 |
| PUT | `/api/tasks/{id}` | `TaskBlock` body | `Result<TaskBlock>` | 已构建待验收 |
| DELETE | `/api/tasks/{id}` | path `id` | `Result<Boolean>` | 进行中 |

备注：直接 DELETE 当前仍需和同步软删除语义统一。

## BlockRelation API

| Method | URL | 参数 | 响应 | 状态 |
| --- | --- | --- | --- | --- |
| POST | `/api/relations` | `BlockRelation` body | `Result<BlockRelation>` | 已构建待验收 |
| GET | `/api/relations` | `sourceId?`, `targetId?` | `Result<List<BlockRelation>>` | 已构建待验收 |
| DELETE | `/api/relations/{id}` | path `id` | `Result<Boolean>` | 已构建待验收 |

备注：当前 Controller 已存在，但注释中说明前端暂未正式对接，关联关系仍主要由本地数据库维护。

## Sync API

| Method | URL | 参数 | 响应 | 状态 |
| --- | --- | --- | --- | --- |
| POST | `/api/sync/push` | `List<MutationLog>` body | `Result<List<Long>>` | 已构建待验收 |
| GET | `/api/sync/pull` | `afterId` | `Result<SyncPullResponse>` | 已构建待验收 |

行为说明：

- `afterId=0` 触发冷启动。
- 冷启动返回当前用户未删除的知识块和任务块。
- 增量拉取返回当前用户 cursor 之后的 mutation。
- MutationLog 删除路径目前使用软删除。

## Asset / FileStorage API

| Method | URL | 参数 | 响应 | 状态 |
| --- | --- | --- | --- | --- |
| GET | `/api/fs/presigned-url` | `fileName`, `contentType?` | `presignedUrl`, `objectName`, `bucket`, `maxFileSizeMb`, `expiresInMinutes` | 已构建待验收 |
| POST | `/api/assets/bind` | `objectName`, `fileName`, `fileSize`, `contentType`, `subject` | `Result<Asset>` | 已构建待验收 |
| GET | `/api/assets/{id}` | path `id` | `Result<Asset>` | 已构建待验收 |

安全说明：

- `objectName` 由后端按当前用户前缀生成。
- 绑定资产时会校验 `objectName` 是否属于当前用户。
- 查询资产时会校验资产归属。

待补：

- 校验 MinIO 对象是否真实存在。
- 校验实际大小和 content-type。

## AI API

| Method | URL | 参数 | 响应 | 状态 |
| --- | --- | --- | --- | --- |
| POST | `/api/ai/chat` | `message`, `systemPrompt?`, `requireJson?`, `subjectId?`, `sourceFileName?` | `Result<String>` | 已构建待验收 |
| GET | `/api/ai/chat` | `message`, `subjectId?`, `sourceFileName?` | SSE | 已构建待验收 |
| POST | `/api/ai/ingest` | `content`, `source?`, `subject?` | `llmExtraction`, `ingestedBlockIds`, `totalChunks` | 已构建待验收 |
| POST | `/api/ai/ingest/file` | multipart `file`, `subject?` | `fileName`, `ingestedBlockIds`, `totalChunks` | 已构建待验收 |
| POST | `/api/ai/extract-tasks` | `text` | `Result<String>` | 已构建待验收 |
| POST | `/api/ai/convert-handwriting` | `text` | `Result<String>` | 已构建待验收 |
| POST | `/api/ai/schedule-suggest` | `text` | `Result<String>` | 已构建待验收 |

## Stats API

| Method | URL | 参数 | 响应 | 状态 |
| --- | --- | --- | --- | --- |
| GET | `/api/stats/overview` | 无 | `Result<Map<String,Object>>` | 已构建待验收 |
| GET | `/api/stats/weekly` | 无 | `Result<Map<String,Object>>` | 已构建待验收 |

## WebSocket

路径：

```text
/ws/sync
```

用途：

- 多端同步事件推送。
- 文档解析完成或失败通知。

待验收：

- 握手鉴权。
- 心跳续期。
- access token 过期后的断连策略。
