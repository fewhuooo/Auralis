# AI env 默认 Provider 与 BYOK 覆盖实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task with verification checkpoints.

**Goal:** 让 Auralis Server 在无用户 BYOK 时使用 env 默认 Provider 凭据，在存在 BYOK 时按 Provider 覆盖 env，并让未指定 Provider 的 AI 请求使用配置默认值。

**Architecture:** 在 `AuralisProperties.Ai` 中绑定按 Provider 的服务端默认凭据；`AiSettingsService` 统一执行“用户密钥优先、env fallback”。`AiStreamingService` 使用 `defaultProvider`，embedding 继续独立使用 SiliconFlow 解析。密钥只停留在服务端运行时对象中。

**Tech Stack:** Java 21, Spring Boot 4.1, JPA/Flyway, H2/PostgreSQL tests, Docker Compose, TypeScript/Vue PC client.

## Global Constraints

- 不新增数据库表或字段；`ai_credentials` 仍只保存用户 BYOK 密文。
- 不把 env API Key 写入 API 响应、日志、数据库或前端代码。
- 未指定聊天 Provider 时必须使用 `auralis.ai.default-provider`，禁止硬编码 `DEEPSEEK`。
- Provider 解析顺序固定为：当前用户有效 BYOK → 服务端 env 默认配置 → `MODEL_UNAVAILABLE`。
- 真实外部 Provider 联调不由自动测试代替。

---

### Task 1: 绑定服务端默认 Provider 凭据

**Files:**
- Modify: `Auralis-Server/src/main/java/com/auralis/app/shared/config/AuralisProperties.java`
- Modify: `Auralis-Server/src/main/resources/application.yml`
- Modify: `Auralis-Server/src/main/resources/application-local.yml`
- Modify: `docker-compose.yml`
- Modify: `.env.example`
- Test: `Auralis-Server/src/test/java/com/auralis/app/shared/config/AuralisPropertiesTests.java` (create if absent)

**Interfaces:**
- Produces `AuralisProperties.Ai.defaults()` containing `DEEPSEEK`, `OPENAI_COMPATIBLE`, and `SILICONFLOW` runtime defaults.
- Each default entry contains `baseUrl`, `chatModel`, `embeddingModel`, and `apiKey`.

- [ ] **Step 1: Write failing configuration binding tests**

  Add a Spring context test that sets `AURALIS_AI_DEFAULT_PROVIDER=DEEPSEEK`, `AURALIS_AI_DEEPSEEK_API_KEY=env-chat`, and `AURALIS_AI_SILICONFLOW_API_KEY=env-embedding`, then asserts both entries are bound and values are not blank.

- [ ] **Step 2: Run the focused test and verify it fails**

  Run `Auralis-Server\mvnw.cmd -B -ntp -Dtest=AuralisPropertiesTests test`.
  Expected: FAIL because the properties record has no default-provider credential map.

- [ ] **Step 3: Add provider-default configuration fields and env mappings**

  Add nested immutable records under `AuralisProperties.Ai` and bind:

  ```yaml
  defaults:
    deepseek:
      base-url: ${AURALIS_AI_DEEPSEEK_BASE_URL:https://api.deepseek.com}
      chat-model: ${AURALIS_AI_DEEPSEEK_CHAT_MODEL:deepseek-chat}
      embedding-model: ${AURALIS_AI_DEEPSEEK_EMBEDDING_MODEL:bge-m3}
      api-key: ${DEEPSEEK_API_KEY:}
    openai-compatible:
      base-url: ${AURALIS_AI_OPENAI_BASE_URL:https://api.openai.com/v1}
      chat-model: ${AURALIS_AI_OPENAI_CHAT_MODEL:gpt-4o-mini}
      embedding-model: ${AURALIS_AI_OPENAI_EMBEDDING_MODEL:text-embedding-3-small}
      api-key: ${OPENAI_API_KEY:}
    siliconflow:
      base-url: ${AURALIS_AI_SILICONFLOW_BASE_URL:https://api.siliconflow.cn/v1}
      chat-model: ${AURALIS_AI_SILICONFLOW_CHAT_MODEL:deepseek-ai/DeepSeek-V3}
      embedding-model: ${AURALIS_AI_SILICONFLOW_EMBEDDING_MODEL:BAAI/bge-m3}
      api-key: ${SILICONFLOW_API_KEY:}
  ```

  Pass `DEEPSEEK_API_KEY`, `OPENAI_API_KEY`, and `SILICONFLOW_API_KEY` through Compose without logging them.

- [ ] **Step 4: Run the focused test and verify it passes**

  Run `Auralis-Server\mvnw.cmd -B -ntp -Dtest=AuralisPropertiesTests test`.
  Expected: PASS.

- [ ] **Step 5: Commit the configuration boundary**

  Run `git add Auralis-Server/src/main/java/com/auralis/app/shared/config/AuralisProperties.java Auralis-Server/src/main/resources/application.yml Auralis-Server/src/main/resources/application-local.yml docker-compose.yml .env.example Auralis-Server/src/test/java/com/auralis/app/shared/config/AuralisPropertiesTests.java` and commit with `feat: bind env ai provider defaults`.

### Task 2: Implement user BYOK over env fallback and default Provider selection

**Files:**
- Modify: `Auralis-Server/src/main/java/com/auralis/app/ai/AiSettingsService.java`
- Modify: `Auralis-Server/src/main/java/com/auralis/app/ai/AiStreamingService.java`
- Test: existing AI settings/stream tests under `Auralis-Server/src/test/java/com/auralis/app/ai/`

**Interfaces:**
- `AiSettingsService.resolve(UUID userId, AiProviderType provider)` returns a user-resolved credential or env default credential without changing `AiSettingsView`.
- `AiStreamingService` obtains the default provider from `properties.ai().defaultProvider()` when the command omits `provider`.

- [ ] **Step 1: Add failing tests for env fallback and BYOK precedence**

  Cover four cases: no row + env key resolves; user row with key wins; no row + blank env key throws `MODEL_UNAVAILABLE`; embedding resolution uses SiliconFlow env defaults.

- [ ] **Step 2: Run focused AI tests and verify the new cases fail**

  Run `Auralis-Server\mvnw.cmd -B -ntp -Dtest=*Ai* test`.
  Expected: the new fallback assertions fail against the current database-only resolver.

- [ ] **Step 3: Implement resolver fallback without persisting env credentials**

  Add a provider-to-default lookup in `AiSettingsService`. If the repository row has a nonblank encrypted key, return the decrypted BYOK settings. Otherwise, return the matching runtime default only when its API key is nonblank; otherwise throw the existing `MODEL_UNAVAILABLE` error. Never call `credentialRepository.save` for env defaults.

- [ ] **Step 4: Use configured default Provider in stream requests**

  Replace the hardcoded fallback with `AiProviderType.valueOf(properties.ai().defaultProvider())`, retaining validation for invalid configuration. Keep explicit `command.provider()` unchanged.

- [ ] **Step 5: Run the focused AI tests and verify they pass**

  Run `Auralis-Server\mvnw.cmd -B -ntp -Dtest=*Ai* test`.
  Expected: PASS with no API key output in logs.

- [ ] **Step 6: Commit the fallback behavior**

  Run `git add Auralis-Server/src/main/java/com/auralis/app/ai/AiSettingsService.java Auralis-Server/src/main/java/com/auralis/app/ai/AiStreamingService.java Auralis-Server/src/test/java/com/auralis/app/ai` and commit with `fix: use env ai defaults before byok`.

### Task 3: Align contracts, PC regression coverage, and verification

**Files:**
- Modify: `docs/contracts/API.md`
- Modify: `docs/modules/Backend.md`
- Modify: `docs/current/Status.md`
- Modify: `docs/current/IssuesAndReview.md`
- Modify: `docs/release/Changelog.md`
- Modify: `Auralis-PC/scripts/r4-pc-protocol.test.mjs`

**Interfaces:**
- Documentation states env defaults and per-user BYOK override semantics.
- PC protocol tests continue to assert the stream request remains valid when the server supplies the default Provider.

- [ ] **Step 1: Add a PC regression assertion for omitted Provider**

  Keep the request body assertion for `streamAiMessage` and document that the server resolves the default Provider when `provider` is omitted.

- [ ] **Step 2: Update API/backend/status/release documentation**

  Record env variable names, fallback order, no-secret exposure, and the remaining requirement for real external Provider smoke testing.

- [ ] **Step 3: Run the full verification set**

  Run:

  ```powershell
  Auralis-Server\mvnw.cmd -B -ntp test
  Set-Location Auralis-PC; npm.cmd run test:r4-pc; npm.cmd run type-check; npm.cmd run build
  ```

  Expected: all commands exit 0; external Provider connectivity remains a manual acceptance boundary.

- [ ] **Step 4: Commit docs and verification evidence**

  Run `git add docs/contracts/API.md docs/modules/Backend.md docs/current/Status.md docs/current/IssuesAndReview.md docs/release/Changelog.md Auralis-PC/scripts/r4-pc-protocol.test.mjs` and commit with `docs: document env ai provider fallback`.
