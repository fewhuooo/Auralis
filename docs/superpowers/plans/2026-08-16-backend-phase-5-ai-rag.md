# Backend Phase 5 AI and RAG Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task with verification checkpoints. Steps use checkbox syntax for tracking. Do not commit changes in this workspace unless the user explicitly requests it.

**Goal:** 在现有 com.auralis.app 模块化单体后端中完成用户级 BYOK、模型适配、Source ingestion、pgvector 检索、Conversation、citation、SSE 和强类型建议接口，并建立可重复的 H2/JPA/MockMvc/Stub provider 自动证据。

**Architecture:** AI 模块只依赖公开的 Source/Asset 端口和共享领域事件，不访问其他模块的 Entity 或 internal Repository。聊天、embedding、解析和检索分别通过 AiProviderPort、EmbeddingProviderPort、SourceParser 和 RetrievalPort 解耦；真实供应商使用 Spring RestClient 适配器，测试使用 Stub provider。V8 提供可移植核心表，V9 Java Flyway migration 仅在 PostgreSQL 中启用 vector(1024) 与向量索引，在 H2 中安全跳过。

**Tech Stack:** Java 21, Spring Boot 4.1, Spring MVC, Spring Data JPA, Flyway, PostgreSQL 17 + pgvector, H2 PostgreSQL mode, Spring Security JWT, Spring Modulith, Spring RestClient, MockMvc, JUnit 5, AssertJ。

## Global Constraints

- 继续使用 com.auralis.app；禁止恢复旧 Server、旧 LangChain4j、Milvus、Redis、统一 Result<T> 或旧 /api/ai 实现。
- 所有 AI、ingestion、chunk、conversation、message 和 citation 查询必须带当前 userId；客户端不能提交或覆盖 userId。
- API 使用直接 DTO、camelCase、UUID、RFC3339 UTC 和现有 Problem Details；Entity、密文、provider 原始 JSON 不直接序列化。
- BYOK key 只保存 AES-GCM 密文，生产密钥来自环境变量；任何日志、异常、SSE 和响应不得出现 key、Authorization、完整 prompt 或完整 provider 原始回复。
- TEXT、FILE、URL ingestion 都必须经过 Source 归属校验；URL 仅允许 HTTP/HTTPS，并拒绝 loopback、私网、link-local、保留地址、跨协议重定向和超限响应。
- embedding 维度固定为 1024；维度错误、解析失败、超时、限流和 provider 错误进入可查询的安全失败状态。
- SSE 只发送结构化事件；user message 先持久化，assistant message 只有完整结束才标记 COMPLETED，断流标记 INTERRUPTED 或 FAILED。
- H2/Stub 测试不能写成真实 PostgreSQL、pgvector、MinIO、DeepSeek、SiliconFlow 或前端联调已经通过。
- 保留当前工作树所有阶段 1-4 未提交修改；不执行 reset、checkout、clean broad delete 或提交。

---

### Task 1: Lock V8/V9 schema, AI configuration, and module contracts

**Files:**

- Create: Auralis-Server/src/main/resources/db/migration/V8__ai_rag_schema.sql
- Create: Auralis-Server/src/main/java/db/migration/V9__postgres_vector_support.java
- Create: Auralis-Server/src/main/java/com/auralis/app/ai/AiProviderType.java
- Create: Auralis-Server/src/main/java/com/auralis/app/ai/AiMessageRole.java
- Create: Auralis-Server/src/main/java/com/auralis/app/ai/AiMessageStatus.java
- Create: Auralis-Server/src/main/java/com/auralis/app/ai/IngestionJobStatus.java
- Modify: Auralis-Server/src/main/java/com/auralis/app/shared/config/AuralisProperties.java
- Modify: Auralis-Server/src/main/resources/application.yml
- Modify: Auralis-Server/src/main/java/com/auralis/app/shared/error/ApiErrorCode.java
- Create: Auralis-Server/src/test/java/com/auralis/app/AiSchemaTests.java
- Create: Auralis-Server/src/test/java/com/auralis/app/AiConfigurationTests.java

**Interfaces:**

- AiProviderType: DEEPSEEK, OPENAI_COMPATIBLE, SILICONFLOW。
- AiMessageRole: USER, ASSISTANT, SYSTEM。
- AiMessageStatus: COMPLETED, INTERRUPTED, FAILED。
- IngestionJobStatus: PENDING, PARSING, INDEXING, READY, FAILED。
- AuralisProperties.Ai: enabled, encryptionKey, defaultProvider, requestTimeoutMillis, maxPromptChars, maxRetrievedChunks, ingestionMaxBytes, urlConnectTimeoutMillis, urlReadTimeoutMillis, urlMaxRedirects。

V8 must create ai_credentials, ingestion_jobs, source_chunks, conversations and messages. Each table must have user ownership, audit timestamps and explicit constraints. ai_credentials uses (user_id, provider) unique and encrypted key fields; ingestion_jobs uses source/user foreign keys, status CHECK, attempt/lease/error fields; source_chunks uses (user_id, source_id, ordinal) unique and embedding_json TEXT; conversations use user soft-delete; messages use (conversation_id, sequence) unique and role/status CHECK.

V9 implements Flyway BaseJavaMigration: PostgreSQL ensures the vector extension, adds source_chunks.embedding vector(1024) if absent, and creates a user-scoped vector similarity index; H2 returns without executing PostgreSQL DDL. It must be idempotent and H2-safe.

- [ ] Step 1: Write failing AiSchemaTests and AiConfigurationTests for migrations 8/9, five tables, foreign keys, unique keys, status checks, absence of plain api_key, H2-safe V9 and required configuration validation.
- [ ] Step 2: Run .\mvnw.cmd -B -ntp -Dtest=AiSchemaTests,AiConfigurationTests test and verify red failures are caused by missing implementation.
- [ ] Step 3: Add the minimum V8/V9 migrations, enums, properties and application defaults. Keep local/test provider calls disabled and production encryption configuration fail-fast.
- [ ] Step 4: Run the focused tests again and verify Flyway reaches V9.
- [ ] Step 5: Run git diff --check for this task.

### Task 2: Implement encrypted BYOK settings and provider ports

**Files:**

- Create: Auralis-Server/src/main/java/com/auralis/app/ai/AiSettingsCommand.java
- Create: Auralis-Server/src/main/java/com/auralis/app/ai/AiSettingsView.java
- Create: Auralis-Server/src/main/java/com/auralis/app/ai/AiProviderPort.java
- Create: Auralis-Server/src/main/java/com/auralis/app/ai/EmbeddingProviderPort.java
- Create: Auralis-Server/src/main/java/com/auralis/app/ai/AiProviderRequest.java
- Create: Auralis-Server/src/main/java/com/auralis/app/ai/AiProviderResponse.java
- Create: Auralis-Server/src/main/java/com/auralis/app/ai/EmbeddingResult.java
- Create: Auralis-Server/src/main/java/com/auralis/app/ai/AiSettingsService.java
- Create: Auralis-Server/src/main/java/com/auralis/app/ai/AiController.java
- Create: Auralis-Server/src/main/java/com/auralis/app/ai/internal/security/AiKeyCipher.java
- Create: Auralis-Server/src/main/java/com/auralis/app/ai/internal/security/AiCredentialEntity.java
- Create: Auralis-Server/src/main/java/com/auralis/app/ai/internal/security/AiCredentialRepository.java
- Create: Auralis-Server/src/main/java/com/auralis/app/ai/internal/provider/DeepSeekAiProvider.java
- Create: Auralis-Server/src/main/java/com/auralis/app/ai/internal/provider/OpenAiCompatibleProvider.java
- Create: Auralis-Server/src/main/java/com/auralis/app/ai/internal/provider/SiliconFlowEmbeddingProvider.java
- Create: Auralis-Server/src/test/java/com/auralis/app/AiSettingsServiceTests.java
- Create: Auralis-Server/src/test/java/com/auralis/app/AiControllerTests.java
- Create: Auralis-Server/src/test/java/com/auralis/app/AiProviderContractTests.java

**Interfaces:**

~~~java
public interface AiProviderPort {
    AiProviderType type();
    AiProviderResponse complete(AiProviderRequest request, AiCredential credential);
    Flux<AiProviderChunk> stream(AiProviderRequest request, AiCredential credential);
}

public interface EmbeddingProviderPort {
    AiProviderType type();
    EmbeddingResult embed(List<String> texts, AiCredential credential);
}
~~~

AiSettingsService exposes get(UUID userId) and upsert(UUID userId, AiSettingsCommand command). AiSettingsView contains provider/model/base URL/hasApiKey/updatedAt only. Commands validate HTTPS outside test, provider-specific model requirements, key length and field limits.

- [ ] Step 1: Write failing tests for owner isolation, insert, same-provider idempotent update, key rotation, ciphertext not equal plaintext, GET redaction, invalid URL and missing production key.
- [ ] Step 2: Run the focused settings tests and verify the expected red failures.
- [ ] Step 3: Implement AiKeyCipher with AES-GCM, random 12-byte nonce, authenticated versioned ciphertext and configured 256-bit key.
- [ ] Step 4: Implement entity/repository/service and GET/PUT /api/ai/settings. Every repository method includes userId and key updates never log request objects.
- [ ] Step 5: Implement RestClient adapters for DeepSeek, OpenAI-compatible chat and SiliconFlow embeddings. Map timeout/429/5xx/malformed JSON to stable DomainException codes.
- [ ] Step 6: Add deterministic provider contract tests for authorization, model/base URL selection, RATE_LIMITED and MODEL_PROVIDER_ERROR.
- [ ] Step 7: Run focused settings/provider tests and the existing full suite.

### Task 3: Add Source ingestion event, readable Asset port, and job lifecycle

**Files:**

- Create: Auralis-Server/src/main/java/com/auralis/app/shared/domain/SourceIngestionRequestedEvent.java
- Create: Auralis-Server/src/main/java/com/auralis/app/ai/IngestionJobView.java
- Create: Auralis-Server/src/main/java/com/auralis/app/ai/IngestionService.java
- Create: Auralis-Server/src/main/java/com/auralis/app/ai/IngestionWorker.java
- Create: Auralis-Server/src/main/java/com/auralis/app/ai/internal/ingestion/IngestionJobEntity.java
- Create: Auralis-Server/src/main/java/com/auralis/app/ai/internal/ingestion/IngestionJobRepository.java
- Create: Auralis-Server/src/main/java/com/auralis/app/ai/internal/ingestion/SourceParser.java
- Create: Auralis-Server/src/main/java/com/auralis/app/ai/internal/ingestion/TextSourceParser.java
- Create: Auralis-Server/src/main/java/com/auralis/app/ai/internal/ingestion/AssetSourceParser.java
- Create: Auralis-Server/src/main/java/com/auralis/app/ai/internal/ingestion/SafeUrlSourceParser.java
- Create: Auralis-Server/src/main/java/com/auralis/app/ai/internal/ingestion/TextChunker.java
- Modify: Auralis-Server/src/main/java/com/auralis/app/source/AssetStoragePort.java
- Modify: Auralis-Server/src/main/java/com/auralis/app/source/internal/storage/InMemoryAssetStorage.java
- Modify: Auralis-Server/src/main/java/com/auralis/app/source/internal/storage/MinioAssetStorage.java
- Modify: Auralis-Server/src/main/java/com/auralis/app/source/internal/storage/UnavailableAssetStorage.java
- Modify: Auralis-Server/src/main/java/com/auralis/app/source/SourceService.java
- Modify: Auralis-Server/src/main/java/com/auralis/app/source/internal/persistence/SourceEntity.java
- Modify: Auralis-Server/src/test/java/com/auralis/app/SourceAssetRelationServiceTests.java
- Create: Auralis-Server/src/test/java/com/auralis/app/AiIngestionTests.java

**Interfaces:**

~~~java
public interface AssetStoragePort {
    InputStream openObject(String objectKey);
    // existing createUploadIntent, headObject and createDownloadUrl remain unchanged
}

public interface SourceParser {
    boolean supports(SourceType type);
    ParsedSource parse(UUID userId, SourceView source);
}

public record ParsedSource(String text, String mediaType) {}
~~~

SourceService publishes SourceIngestionRequestedEvent after successful CREATE, UPDATE and reingest commits. An AI after-commit listener creates an idempotent job for the current user/source. The worker claims one PENDING job with a lease, marks Source PARSING, parses/chunks, marks INDEXING before embedding, then marks READY or FAILED through public SourceService methods. AI never touches SourceEntity directly.

- [ ] Step 1: Write failing tests for TEXT parsing, FILE asset reading, URL acceptance, localhost/private-IP rejection, redirect rejection, maximum response size, empty text failure, chunk overlap/ordinal, job idempotency, lease recovery and Source transitions.
- [ ] Step 2: Run .\mvnw.cmd -B -ntp -Dtest=AiIngestionTests,SourceAssetRelationServiceTests test and verify red failures.
- [ ] Step 3: Extend AssetStoragePort with openObject and update all implementations. In-memory storage returns a bounded byte stream; MinIO uses getObject with read limits; unavailable storage maps to a safe failure.
- [ ] Step 4: Add the shared event, Source status methods and after-commit enqueue. Failed domain mutations must not create jobs.
- [ ] Step 5: Implement TEXT, FILE and URL parsers. Validate every redirect target, reject non-public addresses, enforce connect/read/redirect/byte limits and close streams.
- [ ] Step 6: Implement deterministic chunking using fixed maxChars and overlapChars; reject overlap >= maxChars.
- [ ] Step 7: Implement claim/lease/retry and a worker entry point. Scheduled execution is disabled in tests; processNext() remains directly callable.
- [ ] Step 8: Run focused ingestion/source tests and the full existing suite.

### Task 4: Implement embedding persistence and user-scoped retrieval

**Files:**

- Create: Auralis-Server/src/main/java/com/auralis/app/ai/CitationView.java
- Create: Auralis-Server/src/main/java/com/auralis/app/ai/RetrievalResult.java
- Create: Auralis-Server/src/main/java/com/auralis/app/ai/RetrievalPort.java
- Create: Auralis-Server/src/main/java/com/auralis/app/ai/internal/persistence/SourceChunkEntity.java
- Create: Auralis-Server/src/main/java/com/auralis/app/ai/internal/persistence/SourceChunkRepository.java
- Create: Auralis-Server/src/main/java/com/auralis/app/ai/internal/persistence/PgVectorRetrievalRepository.java
- Create: Auralis-Server/src/main/java/com/auralis/app/ai/RetrievalService.java
- Modify: Auralis-Server/src/main/java/com/auralis/app/ai/IngestionService.java
- Create: Auralis-Server/src/test/java/com/auralis/app/AiRetrievalTests.java

**Interfaces:**

~~~java
public interface RetrievalPort {
    List<RetrievalResult> search(UUID userId, String query, int limit);
}

public record CitationView(
        UUID sourceId, UUID chunkId, int ordinal,
        String title, String excerpt, double score) {}
~~~

Ingestion persists content hash and serialized embedding only after exactly 1024 finite values. PostgreSQL retrieval binds user_id in the same SQL as similarity ordering and top-k; H2 computes deterministic cosine similarity from embedding_json with the same result contract.

- [ ] Step 1: Write failing tests for 1024-dimension rejection, chunk persistence, same-user top-k ordering, cross-user exclusion, empty query rejection, citation fields and source/chunk deduplication.
- [ ] Step 2: Run .\mvnw.cmd -B -ntp -Dtest=AiRetrievalTests test and verify red failures.
- [ ] Step 3: Implement SourceChunkEntity and owner-scoped repository methods; no chunk lookup may omit userId.
- [ ] Step 4: Implement H2 deterministic retrieval and PostgreSQL JDBC vector retrieval with bounded excerpts.
- [ ] Step 5: Connect ingestion to embedding batches and atomic chunk replacement; failed batches must not expose partial new chunks as READY.
- [ ] Step 6: Run focused retrieval tests and schema tests.

### Task 5: Implement Conversation and Message persistence/API

**Files:**

- Create: Auralis-Server/src/main/java/com/auralis/app/ai/ConversationCommand.java
- Create: Auralis-Server/src/main/java/com/auralis/app/ai/ConversationView.java
- Create: Auralis-Server/src/main/java/com/auralis/app/ai/MessageView.java
- Create: Auralis-Server/src/main/java/com/auralis/app/ai/ConversationService.java
- Create: Auralis-Server/src/main/java/com/auralis/app/ai/internal/persistence/ConversationEntity.java
- Create: Auralis-Server/src/main/java/com/auralis/app/ai/internal/persistence/ConversationRepository.java
- Create: Auralis-Server/src/main/java/com/auralis/app/ai/internal/persistence/MessageEntity.java
- Create: Auralis-Server/src/main/java/com/auralis/app/ai/internal/persistence/MessageRepository.java
- Modify: Auralis-Server/src/main/java/com/auralis/app/ai/AiController.java
- Create: Auralis-Server/src/test/java/com/auralis/app/AiConversationServiceTests.java
- Create: Auralis-Server/src/test/java/com/auralis/app/AiConversationControllerTests.java

**Interfaces:**

~~~java
public interface ConversationService {
    ConversationView create(UUID userId, ConversationCommand command);
    List<ConversationView> list(UUID userId);
    ConversationView get(UUID userId, UUID conversationId);
    void delete(UUID userId, UUID conversationId, long baseVersion);
}
~~~

Message sequence allocation is transactionally serialized per conversation. User messages are persisted before provider invocation; assistant messages carry COMPLETED, INTERRUPTED or FAILED with safe model/error metadata. Soft-deleted conversations and messages do not appear in normal queries.

- [ ] Step 1: Write failing tests for create/list/get/delete, owner isolation, soft delete, message order, sequence uniqueness, blank content and not-found behavior.
- [ ] Step 2: Run focused conversation tests and verify red failures.
- [ ] Step 3: Implement entities/repositories with userId predicates and conversation sequence allocation; return explicit views only.
- [ ] Step 4: Implement POST/GET/DELETE /api/ai/conversations and GET /api/ai/conversations/{id}, reusing baseVersion and Problem Details.
- [ ] Step 5: Run focused conversation tests and architecture tests.

### Task 6: Implement RAG chat streaming and SSE contract

**Files:**

- Create: Auralis-Server/src/main/java/com/auralis/app/ai/AiMessageCommand.java
- Create: Auralis-Server/src/main/java/com/auralis/app/ai/AiStreamEvent.java
- Create: Auralis-Server/src/main/java/com/auralis/app/ai/AiStreamingService.java
- Create: Auralis-Server/src/main/java/com/auralis/app/ai/internal/provider/StubAiProvider.java
- Modify: Auralis-Server/src/main/java/com/auralis/app/ai/AiController.java
- Create: Auralis-Server/src/test/java/com/auralis/app/AiStreamingTests.java
- Create: Auralis-Server/src/test/java/com/auralis/app/AiStreamingControllerTests.java

**Interfaces:**

~~~java
public record AiMessageCommand(
        UUID conversationId, String content, AiProviderType provider,
        boolean retrievalEnabled, Integer topK) {}

public record AiStreamEvent(String event, String id, Object data) {}
~~~

POST /api/ai/messages/stream returns text/event-stream. The flow is: validate settings, create/reuse conversation, save USER, optionally retrieve/citations, call provider, save ASSISTANT, and emit ordered events. A client request id prevents retries after transport failure from creating a second USER message.

- [ ] Step 1: Write failing tests for event order, delta aggregation, citation event, completed persistence, unavailable provider, rate limit, malformed response, blank content, unauthorized access, duplicate request id and interrupted stream.
- [ ] Step 2: Run .\mvnw.cmd -B -ntp -Dtest=AiStreamingTests,AiStreamingControllerTests test and verify red failures.
- [ ] Step 3: Implement Stub provider and streaming service with a maximum response length; persist final content only on completion and mark interrupted/failed on exceptions.
- [ ] Step 4: Serialize explicit SSE event names and IDs: message.started, message.delta, citation, message.completed, message.error. Never serialize provider response objects directly.
- [ ] Step 5: Add MockMvc text/event-stream assertions and a test appender check that secrets/prompts are absent.
- [ ] Step 6: Run focused streaming tests and full backend tests.

### Task 7: Implement typed Suggestions

**Files:**

- Create: Auralis-Server/src/main/java/com/auralis/app/ai/SuggestionType.java
- Create: Auralis-Server/src/main/java/com/auralis/app/ai/SuggestionCommand.java
- Create: Auralis-Server/src/main/java/com/auralis/app/ai/SuggestionView.java
- Create: Auralis-Server/src/main/java/com/auralis/app/ai/SuggestionService.java
- Modify: Auralis-Server/src/main/java/com/auralis/app/ai/AiController.java
- Create: Auralis-Server/src/test/java/com/auralis/app/AiSuggestionTests.java
- Create: Auralis-Server/src/test/java/com/auralis/app/AiSuggestionControllerTests.java

**Interfaces:**

~~~java
public enum SuggestionType { SUMMARY, QUESTIONS, NEXT_STEPS, REVIEW_PROMPT }

public record SuggestionCommand(
        SuggestionType type, UUID knowledgeBlockId, int limit) {}

public record SuggestionView(
        UUID id, SuggestionType type, String title, String body,
        List<CitationView> citations, Instant generatedAt) {}
~~~

POST /api/ai/suggestions validates the current user owns the KnowledgeBlock, uses RetrievalService when context is available, returns a bounded list of typed views, and maps model failures to the same stable errors as chat.

- [ ] Step 1: Write failing tests for all suggestion types, limit bounds, owner isolation, deterministic Stub output, citation ownership and provider failure.
- [ ] Step 2: Run focused suggestion tests and verify red failures.
- [ ] Step 3: Implement the typed service and endpoint without untyped maps or raw provider JSON.
- [ ] Step 4: Run suggestion, architecture and complete AI test sets.

### Task 8: Update contracts, operational docs, and execute the final verification gate

**Files:**

- Modify: docs/contracts/API.md
- Modify: docs/contracts/Database.md
- Modify: docs/modules/Backend.md
- Modify: docs/modules/Infrastructure.md
- Modify: docs/current/Status.md
- Modify: docs/current/IssuesAndReview.md
- Modify: docs/release/Changelog.md
- Modify: docs/plans/backend-greenfield-rewrite-plan.md
- Modify: docs/README.md

Documentation must record AI route status, exact settings/conversation/SSE/suggestion semantics, V8/V9 tables and vector strategy, encrypted credential fields, ingestion states, new environment variables, actual test counts, and separate external-provider/PostgreSQL/pgvector/MinIO/Docker/frontend/manual acceptance boundaries.

- [ ] Step 1: Update status and contract documents only after fresh code/test evidence exists.
- [ ] Step 2: Run the targeted AI suite:

~~~powershell
.\mvnw.cmd -B -ntp -Dtest=AiSchemaTests,AiConfigurationTests,AiSettingsServiceTests,AiControllerTests,AiProviderContractTests,AiIngestionTests,AiRetrievalTests,AiConversationServiceTests,AiConversationControllerTests,AiStreamingTests,AiStreamingControllerTests,AiSuggestionTests,AiSuggestionControllerTests test
~~~

Expected: all listed AI tests pass with zero failures/errors.

- [ ] Step 3: Run the complete backend suite:

~~~powershell
.\mvnw.cmd -B -ntp clean test
~~~

Expected: compile succeeds, Flyway V1→V9 validates, architecture tests pass and all tests pass with zero failures/errors/skips.

- [ ] Step 4: Run git diff --check and git status --short. Verify only intended phase-five files/docs are added on top of the pre-existing phase 1-4 worktree.
- [ ] Step 5: Record remaining external validation boundaries. Do not mark real DeepSeek, SiliconFlow, PostgreSQL vector index, MinIO, Docker, browser SSE, frontend or manual AI-quality acceptance as passed unless executed.

## Execution checkpoints

After Task 1, the application must start and Flyway must reach V9 in H2. After Task 3, TEXT ingestion must reach READY through a direct deterministic worker call. After Task 4, a user-scoped chunk search must return a citation. After Task 6, a Stub provider must produce ordered SSE and a persisted assistant message. After Task 7, all AI endpoints must have MockMvc coverage. Task 8 is the final documentation and verification gate.
