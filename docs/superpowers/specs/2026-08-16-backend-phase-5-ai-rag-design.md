# 后端阶段五 AI 与 RAG 设计

日期：2026-08-16

状态：已获用户确认，等待实施计划执行

## 目标

在现有 `com.auralis.app` 模块化单体后端中实现阶段五 AI/RAG 能力：用户级 BYOK 配置、DeepSeek/OpenAI-compatible 对话、SiliconFlow BGE-M3 向量化、Source ingestion、pgvector 检索、Conversation/Message 持久化、citation、SSE 流式回答和强类型建议接口。

实现必须延续阶段 1-4 的 userId 隔离、Problem Details、直接 DTO、软删除、Flyway、JPA、Spring Modulith 和测试先行边界；不得恢复旧 Server 的 LangChain4j、Milvus、Redis、统一 `Result<T>` 或旧 `/api/ai` 实现。

## 范围与非范围

本阶段包括：

- 新 `ai` 模块的公开端口、Service、Controller、DTO 和 internal 持久化/供应商适配器。
- 用户级聊天模型、embedding 模型、base URL 和 BYOK key 配置。
- TEXT、FILE、URL Source 的解析、分块、embedding、索引和失败重试入口。
- 用户级检索、citation 生成和对话历史保存。
- SSE 流式输出、断流后的消息状态保存和可重试错误。
- 结构化建议接口。
- V8 核心数据库迁移，以及仅在 PostgreSQL 中启用的 pgvector 迁移/索引适配。
- Mock provider、Stub storage 和 H2/JPA/MockMvc 自动验证。

本阶段不包括：

- PC、Mobile、Tablet 的新 API SDK 迁移和界面联调。
- 真实收费模型调用作为自动测试依赖。
- Milvus、Redis 或旧 Server 的恢复。
- 完整的 PDF/OCR/Office 高级布局解析；FILE 首版只保证可抽取的纯文本路径，复杂格式错误必须可观测地进入 FAILED。
- 多租户共享知识库、跨用户检索或未经授权的 URL 抓取。

## 设计取舍

采用内部端口加 Spring `RestClient` 供应商适配器，不在领域层直接依赖 LangChain4j 或供应商 SDK。

- `AiProviderPort` 负责聊天请求、流式 token、完成/错误状态映射。
- `EmbeddingProviderPort` 负责批量文本向量化和固定 1024 维校验。
- DeepSeek 使用独立适配器；OpenAI-compatible 适配器支持可配置 base URL、chat model 和 embedding model。
- SiliconFlow BGE-M3 通过 OpenAI-compatible embedding 协议适配；provider key、HTTP 地址和模型由用户配置或部署配置提供。
- 真实 HTTP 适配器不进入领域对象和 API DTO；测试使用 `StubAiProvider`、`StubEmbeddingProvider` 和可控 HTTP 响应。

这样可以在不改变 Conversation、Retrieval 或 SSE 契约的情况下更换模型供应商，也避免自动测试依赖网络和真实额度。

## 模块与数据流

```text
AiController
  ├─ AiSettingsService ── AiCredentialRepository
  ├─ ConversationService ── Conversation/MessageRepository
  ├─ AiStreamingService
  │    ├─ RetrievalService ── SourceChunkRepository
  │    └─ AiProviderPort
  ├─ SuggestionService
  └─ IngestionService
       ├─ SourceService / AssetStoragePort
       ├─ SourceParser
       ├─ TextChunker
       └─ EmbeddingProviderPort
```

所有 Service 的公开方法以当前 SecurityContext 推导的 `userId` 为第一归属条件。AI 模块只通过 Source 的公开 DTO/端口读取 Source，不直接访问其他模块的 Entity 或 Repository；文件内容通过 `AssetStoragePort` 获取。

## 数据库设计

### V8 核心表

新增 Flyway V8：

- `ai_credentials`：`id`、`user_id`、`provider`、`base_url`、`chat_model`、`embedding_model`、`api_key_ciphertext`、`key_version`、`created_at`、`updated_at`；`(user_id, provider)` 唯一。
- `ingestion_jobs`：`id`、`user_id`、`source_id`、`status`、`attempt_count`、`lease_until`、`error_code`、`error_detail`、`started_at`、`completed_at`、审计时间；Source 和用户归属外键、状态 CHECK、处理查询索引。
- `source_chunks`：`id`、`user_id`、`source_id`、`ordinal`、`content`、`content_hash`、`char_start`、`char_end`、`embedding_json`、审计时间；`(user_id, source_id, ordinal)` 唯一。
- `conversations`：`id`、`user_id`、可空 `title`、`deleted_at`、审计时间；用户和更新时间索引。
- `messages`：`id`、`conversation_id`、`user_id`、`sequence`、`role`、`content`、`status`、`model`、`error_code`、`usage_json`、审计时间；`(conversation_id, sequence)` 唯一。

`source_chunks.embedding_json` 是 H2/通用 schema 的可验证表示，JPA 不直接映射供应商向量类型。

### PostgreSQL 向量适配

新增数据库适配迁移在 PostgreSQL 中检查并启用 `vector` 扩展，为 `source_chunks` 添加 `vector(1024)` 列和向量索引；在 H2 中安全跳过扩展和索引创建，使用同一 RetrievalPort 的确定性测试适配器。PostgreSQL 查询通过 internal JDBC repository 使用 userId、相似度排序和 top-k 限制，不能把向量列或 SQL 细节泄漏到 API。

## BYOK 安全

- API key 使用 AES-GCM 加密保存，密钥来自生产环境变量；记录 `key_version` 便于轮换。
- GET settings 只返回 provider、模型、base URL、`hasApiKey` 和更新时间，不返回明文或密文。
- 创建/更新设置时禁止把 key 写入日志、异常 detail、SSE、数据库普通 JSON 或响应体。
- provider base URL 只允许 HTTPS，local/test 可使用受控 HTTP stub；不接受任意 file、javascript 或非 HTTP scheme。
- provider 超时、限流、5xx、响应格式错误分别映射为 `MODEL_UNAVAILABLE`、`RATE_LIMITED` 或安全的 `MODEL_PROVIDER_ERROR`。

## Source ingestion 与 RAG

Source 创建或 reingest 后产生一个用户归属的 ingestion job，并按以下状态推进：

```text
PENDING → PARSING → INDEXING → READY
                       └──────→ FAILED
```

- TEXT：读取 `rawText`。
- FILE：只读取当前用户拥有且 READY 的 Asset，通过 `AssetStoragePort` 获取文本流。
- URL：只允许 HTTP/HTTPS；禁止 localhost、loopback、link-local、私网、保留地址和跨协议重定向；限制连接/读取超时、最大响应大小和内容类型。
- 解析器输出规范化纯文本；空文本、超限、无法解码和不支持格式进入安全错误状态。
- chunker 使用固定最大字符窗口和固定重叠字符数，ordinal 从 0 开始，content hash 用于幂等。
- embedding 结果必须恰好为 1024 维；不匹配则任务 FAILED，不写入可检索 chunk。
- 同一 Source 的旧 chunk 在新索引成功前不作为新版本混用；失败保留错误记录，重试使用新的 job attempt。

检索流程：

```text
用户问题 → query embedding → PostgreSQL user-scoped top-k
         → 去重/截断 → Citation → prompt context → provider stream
```

Citation 至少包含 `sourceId`、`chunkId`、`ordinal`、`title`、`excerpt` 和相似度；所有 citation 必须来自当前用户可见 Source，不能凭模型文本生成不存在的资源 ID。

## API 契约

### AI Settings

- `GET /api/ai/settings`：返回当前用户已配置 provider 的非敏感元数据。
- `PUT /api/ai/settings`：接收 `provider`、`baseUrl`、`chatModel`、`embeddingModel`、可选 `apiKey`；重复提交相同 provider 为幂等更新。

### Conversation

- `POST /api/ai/conversations`：创建当前用户会话。
- `GET /api/ai/conversations`：返回当前用户未删除会话列表。
- `GET /api/ai/conversations/{id}`：返回会话和消息摘要。
- `DELETE /api/ai/conversations/{id}`：软删除当前用户会话。

### Streaming message

- `POST /api/ai/messages/stream` 使用 `text/event-stream`。
- 请求包含可选 `conversationId`、`content`、`provider`、`retrievalEnabled`、`topK`。
- 服务端保存 user message，然后按顺序发送 `message.started`、零个或多个 `message.delta`、`citation`、`message.completed`；失败发送 `message.error` 并保存安全错误状态。
- 每个 SSE event 包含可重连的 event id；重连不能重复写入 user message，也不能重复扣除 provider 调用。

### Suggestions

- `POST /api/ai/suggestions` 接收强类型 context（知识块或学科）、建议类型和数量限制。
- 返回 `SuggestionView` 列表，每项包含稳定类型、标题、正文、可选 citation 和生成时间。
- 不返回原始 provider JSON，不使用无约束 `Map`。

所有 AI API 遵循现有 DTO、Problem Details、UTC RFC3339、Bearer access token 和跨用户按未找到处理规则。

## 错误与幂等

- 未配置模型或 embedding provider：`503 MODEL_UNAVAILABLE`。
- Source ingestion 失败：Source 保持 FAILED，返回 `INGESTION_FAILED` 和安全 detail；重试通过 reingest/job service，不暴露堆栈。
- Conversation 不属于当前用户：`404 RESOURCE_NOT_FOUND`。
- 相同 client request id 重放：返回首次持久化结果，不重复创建消息或重复写入 chunk。
- SSE 传输失败不回滚已提交的 user message；assistant message 只在完整结束时标记 COMPLETED，断流标记 INTERRUPTED/FAILED 并可重新生成。
- provider 的 prompt、完整回复、API key、Authorization 和内部 URL 不能写入日志。

## 测试与验收

先写失败测试，再实现最小行为；每个生产行为必须有一个能在实现前失败的测试。

测试覆盖：

- V8 schema、外键、唯一约束、状态 CHECK、owner isolation 和迁移版本。
- BYOK 加密、key 不回显、provider 配置幂等和无效 URL。
- TEXT/FILE/URL ingestion、chunk 边界、1024 维校验、失败重试和 Source 状态。
- URL SSRF 防护、响应大小/超时/重定向限制。
- user-scoped retrieval、top-k、citation 完整性和跨用户不可见。
- Conversation/message 顺序、重复请求、软删除和 owner isolation。
- SSE event 顺序、完成、provider error、断流保存和重连语义。
- Stub provider 的 DeepSeek/OpenAI-compatible/SiliconFlow 契约适配。
- Suggestions 强类型响应、错误映射和引用来源。
- Spring Modulith 边界、MockMvc、完整 `clean test` 和 `git diff --check`。

自动测试只证明 H2/JPA/MockMvc/Stub provider 以及实际执行的 PostgreSQL 适配范围；真实 DeepSeek、SiliconFlow、MinIO、Docker、前端和人工 AI 质量验收必须单独登记。

## 完成定义

阶段五代码完成必须同时具备：

1. V8 迁移、AI 模块和 API 实现存在。
2. 所有新行为有先失败后通过的回归测试。
3. `clean test`、架构测试和差异检查通过。
4. API、Database、Backend、Infrastructure、Status、IssuesAndReview、Changelog 已回写。
5. 明确区分代码、构建、自动测试、真实供应商和人工验收状态。

阶段五不会因为 H2/Stub 测试通过而声称真实模型、真实 pgvector、真实 MinIO 或三端联调完成。
