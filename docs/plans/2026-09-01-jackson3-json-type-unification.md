# Jackson 3 JSON 类型统一实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use `test-driven-development` task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 消除 Spring 7 JSON converter 与后端 Jackson 2 类型混用，使 Sync payload 能通过 HTTP 边界并保持所有 JSON 读写使用 Jackson 3。

**Architecture:** Spring Boot 4/Spring 7 的 MVC converter 使用 `tools.jackson`。所有 Auralis Server 生产和测试源码中的 `com.fasterxml.jackson.core`、`com.fasterxml.jackson.databind` 类型统一迁移到同名的 `tools.jackson.core`、`tools.jackson.databind`，不改变 API JSON 形状、Sync mutation 语义或持久化 payload 字节格式。以 HTTP `/api/sync/push` JSON object payload 的回归测试作为入口门禁，并以源码扫描防止 Jackson 2 导入回归。

**Tech Stack:** Java 21、Spring Boot 4.1、Spring Framework 7、Jackson 3.1.4、JUnit 5、MockMvc。

## 全局约束

- 禁止把 `com.fasterxml.jackson.*` JSON 类型传入 Spring MVC Controller、WebSocket handler 或 Spring 注入的 `ObjectMapper`。
- 保持 `/api/sync/*`、AI、Review、Realtime、ParsedDocument 的现有请求/响应契约不变。
- 日志和测试不得写入 token、密钥、完整 prompt 或文件内容。
- 只迁移 Auralis 自有源码；第三方库内部兼容类型由其依赖边界管理。

---

### Task 1：固定 Sync HTTP JSON 边界

**Files:**

- Create: `Auralis-Server/src/test/java/com/auralis/app/SyncControllerJsonCompatibilityTests.java`
- Modify: `Auralis-Server/src/main/java/com/auralis/app/sync/SyncDtos.java`
- Modify: `Auralis-Server/src/main/java/com/auralis/app/sync/SyncMutation.java`
- Modify: `Auralis-Server/src/main/java/com/auralis/app/sync/DomainWritePort.java`
- Modify: `Auralis-Server/src/main/java/com/auralis/app/sync/SyncMutationProcessor.java`
- Modify: `Auralis-Server/src/main/java/com/auralis/app/sync/ChangeLogService.java`
- Modify: `Auralis-Server/src/main/java/com/auralis/app/sync/SyncController.java`
- Test: `Auralis-Server/src/test/java/com/auralis/app/SyncControllerJsonCompatibilityTests.java`

**Consumes:** JSON request body fields `serverDeviceId` and `mutations[].payload` from PC Sync API.

**Produces:** `SyncDtos.MutationRequest.payload()` 与 `SyncMutation.payload()` 均为 `tools.jackson.databind.JsonNode`，MVC converter 可反序列化 JSON object payload 并返回 `APPLIED`。

- [ ] **Step 1: Write the failing HTTP regression**

```java
mockMvc.perform(post("/api/sync/push")
        .header(HttpHeaders.AUTHORIZATION, "Bearer " + auth.tokens().accessToken())
        .contentType(MediaType.APPLICATION_JSON)
        .content("""
          {"serverDeviceId":"%s","mutations":[{
            "clientMutationId":"sync-json-1","resourceType":"SUBJECT",
            "resourceId":"%s","mutationType":"CREATE","baseVersion":0,
            "payload":{"name":"Sync JSON","sortKey":"001"}
          }]}
          """.formatted(auth.serverDeviceId(), subjectId)))
    .andExpect(status().isOk())
    .andExpect(jsonPath("$.results[0].decision").value("APPLIED"));
```

- [ ] **Step 2: Run the test and observe its pre-migration failure**

Run: `cd Auralis-Server; .\mvnw.cmd -B -ntp -Dtest=SyncControllerJsonCompatibilityTests test`

Expected: HTTP 500 caused by Jackson 3 converter attempting to deserialize a Jackson 2 `JsonNode`.

- [ ] **Step 3: Replace Sync-layer imports with Jackson 3**

```java
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.NullNode;
```

Use the same package substitution in every Task 1 file; `SyncDtos.ChangeResponse.from` must accept `tools.jackson.databind.ObjectMapper`.

- [ ] **Step 4: Run the focused Sync test**

Run: `cd Auralis-Server; .\mvnw.cmd -B -ntp -Dtest=SyncControllerJsonCompatibilityTests,SyncServiceTests test`

Expected: both classes pass and the HTTP payload returns `APPLIED`.

### Task 2：迁移其余生产 JSON 边界

**Files:**

- Modify: `Auralis-Server/src/main/java/com/auralis/app/ai/AiController.java`
- Modify: `Auralis-Server/src/main/java/com/auralis/app/ai/internal/security/ProviderHttpClient.java`
- Modify: `Auralis-Server/src/main/java/com/auralis/app/ai/internal/provider/OpenAiCompatibleProvider.java`
- Modify: `Auralis-Server/src/main/java/com/auralis/app/ai/internal/provider/SiliconFlowEmbeddingProvider.java`
- Modify: `Auralis-Server/src/main/java/com/auralis/app/ai/retrieval/EmbeddingVectorCodec.java`
- Modify: `Auralis-Server/src/main/java/com/auralis/app/knowledge/KnowledgeBlockService.java`
- Modify: `Auralis-Server/src/main/java/com/auralis/app/realtime/RealtimeWebSocketConfiguration.java`
- Modify: `Auralis-Server/src/main/java/com/auralis/app/realtime/RealtimeWebSocketHandler.java`
- Modify: `Auralis-Server/src/main/java/com/auralis/app/review/ReviewConfiguration.java`
- Modify: `Auralis-Server/src/main/java/com/auralis/app/review/ReviewService.java`
- Modify: `Auralis-Server/src/main/java/com/auralis/app/source/ParsedDocumentValidator.java`

**Consumes:** Spring-injected JSON mapper, provider HTTP response bodies, WebSocket payloads, Review JSON persistence and ParsedDocument payload stream.

**Produces:** 全部生产 JSON 边界仅引用 `tools.jackson.core` 或 `tools.jackson.databind`；`JsonMapper`、`JsonParser`、`JsonToken`、`TypeReference` 和 `DeserializationFeature` 同步迁移到 `tools.jackson` 命名空间。

- [ ] **Step 1: Add the production-source guard**

```java
assertThat(Files.walk(Path.of("src/main/java"))
        .filter(path -> path.toString().endsWith(".java"))
        .map(Files::readString)
        .toList())
    .noneMatch(source -> source.contains("import com.fasterxml.jackson."));
```

- [ ] **Step 2: Run the guard and observe Jackson 2 imports**

Run: `cd Auralis-Server; .\mvnw.cmd -B -ntp -Dtest=JacksonNamespaceGuardTests test`

Expected: failure listing remaining production Jackson 2 imports.

- [ ] **Step 3: Perform the namespace migration**

```java
import tools.jackson.core.JsonParser;
import tools.jackson.core.JacksonException;
import tools.jackson.core.JsonToken;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;
```

Jackson 3 的流式校验使用 `ObjectMapper.createParser(...)`、`JsonToken.PROPERTY_NAME` 和 `JsonParser.currentName()`；对有界输入流的包装异常应解包为既有的业务校验错误。

- [ ] **Step 4: Run production JSON tests**

Run: `cd Auralis-Server; .\mvnw.cmd -B -ntp -Dtest=ParsedDocumentValidatorTests,ProviderHttpClientTests,AiProviderResilienceTests,AiProviderSecurityTests,AiStreamingControllerTests test`

Expected: all selected classes pass with no production `com.fasterxml.jackson` import.

### Task 3：迁移测试夹具并验证发布边界

**Files:**

- Modify: every file reported by `rg -l "import com\\.fasterxml\\.jackson" Auralis-Server/src/test/java`
- Modify: `docs/modules/Backend.md`
- Modify: `docs/current/Status.md`
- Modify: `docs/current/IssuesAndReview.md`
- Modify: `docs/release/Changelog.md`
- Test: `Auralis-Server/src/test/java/com/auralis/app/JacksonNamespaceGuardTests.java`

**Consumes:** Task 1 and Task 2 production mapper types.

**Produces:** 测试不再构造 Jackson 2 node 或 mapper；源码守卫同时覆盖 `src/main/java` 和 `src/test/java`；当前风险登记保留真实 Tauri/Server 验收边界。

- [ ] **Step 1: Extend the guard to tests**

```java
assertThat(List.of("src/main/java", "src/test/java")).allSatisfy(root ->
    assertThat(Files.walk(Path.of(root))
            .filter(path -> path.toString().endsWith(".java"))
            .map(Files::readString)
            .toList())
        .noneMatch(source -> source.contains("import com.fasterxml.jackson.")));
```

- [ ] **Step 2: Run the guard and observe test-fixture failures**

Run: `cd Auralis-Server; .\mvnw.cmd -B -ntp -Dtest=JacksonNamespaceGuardTests test`

Expected: failure until all test imports use `tools.jackson`.

- [ ] **Step 3: Migrate test imports and update documentation**

```java
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
```

State that Spring MVC and all Auralis-owned JSON boundaries use Jackson 3; retain the real Tauri + Server/MinIO end-to-end check as an open validation item.

- [ ] **Step 4: Run complete verification**

Run: `cd Auralis-Server; .\mvnw.cmd -B -ntp clean test`

Expected: Maven exits 0; then rebuild backend and re-run a desktop Source sync to confirm the HTTP Sync request no longer returns 500.
