# R1-01 BYOK 与出站网络安全 Implementation Plan

**Goal:** 为 Provider 和 URL 资料摄取建立 HTTPS、白名单、DNS 固定解析、重定向、超时、响应大小和密钥脱敏门禁。

**Architecture:** `ProviderEndpointPolicy` 负责 Provider URI、白名单和 DNS 地址集合；`ProviderHttpClient` 使用 JDK HttpClient 的固定地址解析器、禁用重定向和受限响应读取；聊天/embedding 适配器只保留协议解析。`UrlSecurityPolicy` 与 `UrlSourceFetcher` 复用公共地址解析逻辑但保留资料 URL 的 HTTP/HTTPS 能力和独立跳转限制。

**Tech Stack:** Java 21、Spring Boot 4.1、JDK `java.net.http.HttpClient`、Spring `@ConfigurationProperties`、JUnit 5、AssertJ、Mockito。

## Global Constraints

- Provider `baseUrl` 必须使用 HTTPS。
- Provider host 必须命中 `auralis.ai.allowed-provider-hosts` 白名单；自定义 Provider 只有在显式加入白名单后才可使用。
- Provider DNS 在请求前解析并校验全部地址；实际 HTTP 客户端使用同一组已校验地址。
- Provider 禁止自动重定向；资料 URL 每次手动重定向都重新校验并受最大跳转数限制。
- Provider 请求使用 `request-timeout-millis` 和 `provider-max-response-bytes`；资料 URL 继续使用现有 URL 摄取限制。
- API key 只写入 AES-GCM 密文；异常、日志和 `AiCredential.toString()` 不得包含 key。
- 本任务不证明真实 DNS rebinding、生产网络策略或真实 Provider smoke。

---

### Task 1: Provider endpoint policy and configuration

**Files:**
- Create: `Auralis-Server/src/main/java/com/auralis/app/ai/internal/security/ProviderEndpointPolicy.java`
- Create: `Auralis-Server/src/main/java/com/auralis/app/ai/internal/security/ResolvedProviderEndpoint.java`
- Modify: `Auralis-Server/src/main/java/com/auralis/app/shared/config/AuralisProperties.java`
- Modify: `Auralis-Server/src/main/resources/application.yml`
- Modify: `Auralis-Server/src/main/resources/application-local.yml`
- Modify: `Auralis-Server/src/main/resources/application-test.yml`
- Modify: `Auralis-Server/src/main/java/com/auralis/app/ai/AiSettingsService.java`
- Test: `Auralis-Server/src/test/java/com/auralis/app/AiProviderSecurityTests.java`
- Test: `Auralis-Server/src/test/java/com/auralis/app/AiSettingsServiceTests.java`

**Interfaces:**
- `ProviderEndpointPolicy.validate(AiProviderType provider, String rawBaseUrl): URI`
- `ProviderEndpointPolicy.resolve(AiProviderType provider, URI endpoint): ResolvedProviderEndpoint`
- `ResolvedProviderEndpoint.host(): String`, `port(): int`, `addresses(): List<InetAddress>`

- [ ] **Step 1: Write the failing tests**

```java
@Test
void rejectsNonHttpsPrivateAndNonAllowlistedProviderUrls() {
    ProviderEndpointPolicy policy = new ProviderEndpointPolicy(List.of("api.deepseek.com"));

    assertThatThrownBy(() -> policy.validate(AiProviderType.DEEPSEEK, "http://api.deepseek.com"))
            .isInstanceOf(DomainException.class);
    assertThatThrownBy(() -> policy.validate(AiProviderType.DEEPSEEK, "https://127.0.0.1"))
            .isInstanceOf(DomainException.class);
    assertThatThrownBy(() -> policy.validate(AiProviderType.DEEPSEEK, "https://evil.example"))
            .isInstanceOf(DomainException.class);
}

@Test
void acceptsOnlyDefaultOrExplicitlyAllowedHttpsPort() {
    ProviderEndpointPolicy policy = new ProviderEndpointPolicy(List.of("provider.test"));

    assertThat(policy.validate(AiProviderType.OPENAI_COMPATIBLE, "https://provider.test").getPort())
            .isEqualTo(-1);
    assertThatThrownBy(() -> policy.validate(AiProviderType.OPENAI_COMPATIBLE, "https://provider.test:8443"))
            .isInstanceOf(DomainException.class);
}
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `mvn -B -ntp -Dtest=AiProviderSecurityTests,AiSettingsServiceTests test`

Expected: FAIL because the policy type, allowlist configuration, provider max response configuration and service integration do not yet exist.

- [ ] **Step 3: Implement the minimal policy and configuration**

Add `allowedProviderHosts` and `providerMaxResponseBytes` to `AuralisProperties.Ai`; bind `AURALIS_AI_ALLOWED_PROVIDER_HOSTS` and `AURALIS_AI_PROVIDER_MAX_RESPONSE_BYTES`. Implement URI validation for HTTPS, no userinfo, no query/fragment, allowlisted normalized host, and implicit/443 port only; implement `resolve` to perform all-address public DNS checks and return a `ResolvedProviderEndpoint` carrying the checked addresses. Inject the policy into `AiSettingsService.upsert` for URI/allowlist validation and map rejected endpoints to `VALIDATION_FAILED` without storing the key.

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run: `mvn -B -ntp -Dtest=AiProviderSecurityTests,AiSettingsServiceTests test`

Expected: PASS with no failed or errored tests; existing DeepSeek settings test uses the explicit `api.deepseek.com` allowlist.

- [ ] **Step 5: Commit**

```powershell
git add Auralis-Server/src/main/java/com/auralis/app/ai/internal/security/ProviderEndpointPolicy.java Auralis-Server/src/main/java/com/auralis/app/ai/internal/security/ResolvedProviderEndpoint.java Auralis-Server/src/main/java/com/auralis/app/shared/config/AuralisProperties.java Auralis-Server/src/main/resources/application.yml Auralis-Server/src/main/resources/application-local.yml Auralis-Server/src/main/resources/application-test.yml Auralis-Server/src/main/java/com/auralis/app/ai/AiSettingsService.java Auralis-Server/src/test/java/com/auralis/app/AiProviderSecurityTests.java Auralis-Server/src/test/java/com/auralis/app/AiSettingsServiceTests.java
git commit -m "feat(ai): enforce provider endpoint policy"
```

### Task 2: Secure bounded Provider HTTP client and adapter migration

**Files:**
- Create: `Auralis-Server/src/main/java/com/auralis/app/ai/internal/provider/ProviderHttpClient.java`
- Modify: `Auralis-Server/src/main/java/com/auralis/app/ai/internal/provider/OpenAiCompatibleProvider.java`
- Modify: `Auralis-Server/src/main/java/com/auralis/app/ai/internal/provider/SiliconFlowEmbeddingProvider.java`
- Modify: `Auralis-Server/src/main/java/com/auralis/app/ai/AiCredential.java`
- Test: `Auralis-Server/src/test/java/com/auralis/app/AiProviderSecurityTests.java`
- Test: `Auralis-Server/src/test/java/com/auralis/app/AiProviderContractTests.java`

**Interfaces:**
- `ProviderHttpClient.postJson(ResolvedProviderEndpoint endpoint, String path, String apiKey, Object body, Class<JsonNode> responseType): JsonNode`
- `ProviderHttpClient` must use `HttpClient.Redirect.NEVER`, `request-timeout-millis`, a fixed resolver backed by `ResolvedProviderEndpoint.addresses()`, and bounded response reading.

- [ ] **Step 1: Write the failing tests**

```java
@Test
void credentialStringRepresentationRedactsApiKey() {
    String secret = "sk-provider-secret";

    assertThat(new AiCredential("https://api.deepseek.com", secret, "deepseek-chat").toString())
            .doesNotContain(secret)
            .contains("REDACTED");
}

@Test
void providerClientRejectsResponseLargerThanConfiguredLimit() {
    // Use the package-level test transport seam to return a body larger than the configured limit.
    assertThatThrownBy(() -> client.postJson(endpoint, "/chat/completions", "sk-secret", request, JsonNode.class))
            .hasMessage("AI provider response exceeded the configured limit");
}
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `mvn -B -ntp -Dtest=AiProviderSecurityTests,AiProviderContractTests test`

Expected: FAIL because `AiCredential` exposes the record default `toString()` and no bounded client exists.

- [ ] **Step 3: Implement the minimal bounded client**

Serialize the body with the existing Jackson `ObjectMapper`; create an `HttpRequest` with only the Authorization header, JSON content type, no redirects and a request timeout. Read `HttpResponse.BodyHandlers.ofInputStream()` through an 8 KiB buffer, fail once `providerMaxResponseBytes` is exceeded, parse JSON only after the bound is satisfied, and map status 429/408/5xx/network failures to existing safe `DomainException` codes. Override `AiCredential.toString()` to redact `apiKey`. Migrate both chat and embedding adapters to this client so no provider constructs an unconfigured `RestClient`.

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run: `mvn -B -ntp -Dtest=AiProviderSecurityTests,AiProviderContractTests,AiStreamingTests,AiRetrievalTests test`

Expected: PASS with no API key in exception messages or string representations.

- [ ] **Step 5: Commit**

```powershell
git add Auralis-Server/src/main/java/com/auralis/app/ai/internal/provider/ProviderHttpClient.java Auralis-Server/src/main/java/com/auralis/app/ai/internal/provider/OpenAiCompatibleProvider.java Auralis-Server/src/main/java/com/auralis/app/ai/internal/provider/SiliconFlowEmbeddingProvider.java Auralis-Server/src/main/java/com/auralis/app/ai/AiCredential.java Auralis-Server/src/test/java/com/auralis/app/AiProviderSecurityTests.java Auralis-Server/src/test/java/com/auralis/app/AiProviderContractTests.java
git commit -m "feat(ai): bound provider requests and redact credentials"
```

### Task 3: Pin DNS and redirect policy for URL ingestion

**Files:**
- Create: `Auralis-Server/src/main/java/com/auralis/app/ai/ingestion/CheckedAddressResolver.java`
- Modify: `Auralis-Server/src/main/java/com/auralis/app/ai/ingestion/UrlSecurityPolicy.java`
- Modify: `Auralis-Server/src/main/java/com/auralis/app/ai/ingestion/UrlSourceFetcher.java`
- Test: `Auralis-Server/src/test/java/com/auralis/app/AiIngestionTests.java`

**Interfaces:**
- `UrlSecurityPolicy.resolvePublicAddresses(URI uri): List<InetAddress>`
- `CheckedAddressResolver.forHost(String host, List<InetAddress> addresses): CheckedAddressResolver`
- `CheckedAddressResolver.resolveHost(String host): List<InetAddress>` (testable fixed-address lookup used by the JDK resolver adapter)

- [ ] **Step 1: Write the failing tests**

```java
@Test
void rejectsEveryResolvedPrivateAddressBeforeFetching() {
    UrlSecurityPolicy policy = new UrlSecurityPolicy();

    assertThatThrownBy(() -> policy.validateResolvedAddresses(List.of(
            InetAddress.getByName("93.184.216.34"), InetAddress.getByName("127.0.0.1"))))
            .isInstanceOf(IllegalArgumentException.class);
}

@Test
void fixedResolverReturnsOnlyTheCheckedAddressSetForItsHost() throws Exception {
    List<InetAddress> checked = List.of(InetAddress.getByName("93.184.216.34"));
    CheckedAddressResolver resolver = CheckedAddressResolver.forHost("public.example", checked);

    assertThat(resolver.resolveHost("public.example")).containsExactlyElementsOf(checked);
    assertThatThrownBy(() -> resolver.resolveHost("other.example"))
            .isInstanceOf(IllegalArgumentException.class);
}
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `mvn -B -ntp -Dtest=AiIngestionTests test`

Expected: FAIL because the policy does not expose all-address validation and the fixed resolver does not yet exist.

- [ ] **Step 3: Implement fixed resolution without changing the product scheme rule**

Expose all-address validation from `UrlSecurityPolicy`, create a Java 21 `InetAddressResolver` adapter backed by `CheckedAddressResolver.resolveHost`, and use a no-redirect JDK HttpClient in `UrlSourceFetcher`. Keep manual redirect handling, call `securityPolicy.validate` and resolve all addresses for every `Location`, preserve HTTP/HTTPS public URL support, and retain `ingestionMaxBytes`/empty-body checks.

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run: `mvn -B -ntp -Dtest=AiIngestionTests test`

Expected: PASS with redirect, private address and response-size regression coverage.

- [ ] **Step 5: Commit**

```powershell
git add Auralis-Server/src/main/java/com/auralis/app/ai/ingestion/CheckedAddressResolver.java Auralis-Server/src/main/java/com/auralis/app/ai/ingestion/UrlSecurityPolicy.java Auralis-Server/src/main/java/com/auralis/app/ai/ingestion/UrlSourceFetcher.java Auralis-Server/src/test/java/com/auralis/app/AiIngestionTests.java
git commit -m "feat(ai): pin safe URL ingestion targets"
```

### Task 4: Documentation, full verification and R1-01 evidence

**Files:**
- Modify: `docs/contracts/API.md`
- Modify: `docs/modules/Backend.md`
- Modify: `docs/current/Status.md`
- Modify: `docs/current/IssuesAndReview.md`
- Modify: `docs/planning/PreDeploymentReadinessTasks.md`
- Modify: `docs/README.md`

- [ ] **Step 1: Update current documentation**

Record the provider allowlist/HTTPS policy, environment variables, bounded request behavior, and the remaining limits: real DNS rebinding, production egress policy and real Provider smoke remain unverified. Do not close `P1-Phase5-Provider-Security` until the real security matrix is executed.

- [ ] **Step 2: Run the focused and full tests**

Run:

```powershell
cd Auralis-Server
mvn -B -ntp -Dtest=AiProviderSecurityTests,AiSettingsServiceTests,AiProviderContractTests,AiStreamingTests,AiRetrievalTests,AiIngestionTests test
mvn -B -ntp clean test
```

Expected: both commands exit 0, with failures/errors/skips equal to 0; warnings must be reported separately and not called a clean security gate.

- [ ] **Step 3: Run repository checks**

Run: `git diff --check` and verify that only intended R1-01 files are modified; `.claude/` remains untracked and untouched.

- [ ] **Step 4: Commit documentation and evidence**

```powershell
git add docs/contracts/API.md docs/modules/Backend.md docs/current/Status.md docs/current/IssuesAndReview.md docs/planning/PreDeploymentReadinessTasks.md docs/README.md
git commit -m "docs: record R1-01 provider security boundary"
```
