package com.auralis.app;

import tools.jackson.databind.ObjectMapper;
import com.auralis.app.ai.AiMessageRole;
import com.auralis.app.ai.AiProviderRequest;
import com.auralis.app.ai.AiProviderType;
import com.auralis.app.ai.AiCredential;
import com.auralis.app.ai.internal.provider.OpenAiCompatibleProvider;
import com.auralis.app.ai.internal.provider.DeepSeekAiProvider;
import com.auralis.app.ai.internal.security.ProviderEndpointPolicy;
import com.auralis.app.ai.internal.security.ProviderHttpClient;
import com.auralis.app.ai.internal.security.ProviderHttpException;
import com.auralis.app.ai.internal.security.ProviderHttpTransport;
import com.auralis.app.ai.internal.security.ResolvedProviderEndpoint;
import com.auralis.app.shared.error.DomainException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;

import java.net.InetAddress;
import java.io.IOException;
import java.net.URI;
import java.util.List;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

@ExtendWith(OutputCaptureExtension.class)
class AiProviderResilienceTests {

    private static final ResolvedProviderEndpoint ENDPOINT = new ResolvedProviderEndpoint(
            "provider.test", 443, List.of(InetAddress.getLoopbackAddress()), "/v1");
    private static final AiProviderRequest REQUEST = new AiProviderRequest(
            "chat-model", List.of(new AiProviderRequest.Message(AiMessageRole.USER, "hello")), null, null);
    private static final AiCredential CREDENTIAL = new AiCredential("https://provider.test/v1", "key");
    private static final AiCredential DEEPSEEK_CREDENTIAL = new AiCredential("https://api.example.test/v1", "key");

    @Test
    void mapsRateLimitServerAndClientProviderFailures() {
        assertCodeForStatus(429, "RATE_LIMITED");
        assertCodeForStatus(500, "MODEL_UNAVAILABLE");
        assertCodeForStatus(400, "MODEL_PROVIDER_ERROR");
    }

    @Test
    void mapsGenericCompletionIoFailureToModelUnavailableAndPreservesCauseSafely() {
        IOException failure = new IOException("transport failed for sk-secret-value");
        OpenAiCompatibleProvider provider = provider((endpoint, path, key, body) -> {
            throw failure;
        });

        assertThatThrownBy(() -> provider.complete(REQUEST, new AiCredential(
                "https://provider.test/v1", "sk-secret-value")))
                .isInstanceOf(DomainException.class)
                .hasMessage("AI provider is unavailable")
                .hasCause(failure)
                .hasMessageNotContaining("sk-secret-value")
                .extracting(error -> ((DomainException) error).code())
                .isEqualTo("MODEL_UNAVAILABLE");
    }

    @Test
    void serializesExplicitMaxTokensIntoOpenAiCompatibleJsonBody() throws Exception {
        AtomicReference<byte[]> capturedBody = new AtomicReference<>();
        OpenAiCompatibleProvider provider = provider((endpoint, path, key, body) -> {
            capturedBody.set(body);
            return "{\"choices\":[{\"message\":{\"content\":\"ok\"}}]}"
                    .getBytes(java.nio.charset.StandardCharsets.UTF_8);
        });
        AiProviderRequest request = new AiProviderRequest(
                "chat-model", List.of(new AiProviderRequest.Message(AiMessageRole.USER, "hello")), null, 1_024);

        provider.complete(request, CREDENTIAL);

        assertThat(capturedBody.get()).isNotNull();
        assertThat(new ObjectMapper().readTree(capturedBody.get()).path("max_tokens").asInt())
                .isEqualTo(1_024);
        var ordinaryBody = new ObjectMapper().readTree(capturedBody.get());
        assertThat(ordinaryBody.has("response_format")).isFalse();
        assertThat(ordinaryBody.has("thinking")).isFalse();

        provider.complete(new AiProviderRequest(
                "gpt-4o-mini", List.of(new AiProviderRequest.Message(AiMessageRole.USER, "return json")),
                0.1, 1_024, true), CREDENTIAL);

        var body = new ObjectMapper().readTree(capturedBody.get());
        assertThat(body.path("response_format").path("type").asText()).isEqualTo("json_object");
        assertThat(body.has("thinking")).isFalse();
    }

    @Test
    void ordinaryMaxTokens4096OmitsStructuredWireFieldsAndJsonModeLog(CapturedOutput output) throws Exception {
        AtomicReference<byte[]> capturedBody = new AtomicReference<>();
        OpenAiCompatibleProvider provider = provider((endpoint, path, key, body) -> {
            capturedBody.set(body);
            return "{\"choices\":[{\"message\":{\"content\":\"ok\"}}]}"
                    .getBytes(java.nio.charset.StandardCharsets.UTF_8);
        });

        provider.complete(new AiProviderRequest(
                "chat-model", List.of(new AiProviderRequest.Message(AiMessageRole.USER, "ordinary")),
                0.1, 4_096), CREDENTIAL);

        var body = new ObjectMapper().readTree(capturedBody.get());
        assertThat(body.path("max_tokens").asInt()).isEqualTo(4_096);
        assertThat(body.has("response_format")).isFalse();
        assertThat(body.has("thinking")).isFalse();
        assertThat(output.getOut()).doesNotContain("AI_JSON_MODE");
    }

    @Test
    void serializesPermanentOverviewStageBudgetsIntoProviderBody() throws Exception {
        AtomicReference<byte[]> capturedBody = new AtomicReference<>();
        OpenAiCompatibleProvider provider = provider((endpoint, path, key, body) -> {
            capturedBody.set(body);
            return "{\"choices\":[{\"message\":{\"content\":\"ok\"}}]}"
                    .getBytes(java.nio.charset.StandardCharsets.UTF_8);
        });
        for (int maxTokens : List.of(4_608, 4_675, 6_144)) {
            provider.complete(new AiProviderRequest(
                    "chat-model", List.of(new AiProviderRequest.Message(AiMessageRole.USER, "return json")),
                    0.1, maxTokens, true), CREDENTIAL);
            var body = new ObjectMapper().readTree(capturedBody.get());
            assertThat(body.path("max_tokens").asInt()).isEqualTo(maxTokens);
            assertThat(body.path("response_format").path("type").asText()).isEqualTo("json_object");
            assertThat(body.has("thinking")).isFalse();
        }
    }

    @Test
    void logsStructuredJsonModeFromSerializedFinalDeepSeekBody(CapturedOutput output) {
        AtomicReference<byte[]> capturedBody = new AtomicReference<>();
        DeepSeekAiProvider provider = deepSeekProvider((endpoint, path, key, body) ->
                captureAndReturn(capturedBody, body, "{\"choices\":[{\"message\":{\"content\":\"ok\"}}]}")
                        .getBytes(java.nio.charset.StandardCharsets.UTF_8));

        provider.complete(new AiProviderRequest(
                "deepseek-v4-flash", List.of(new AiProviderRequest.Message(AiMessageRole.USER, "final-prompt-marker")),
                0.1, 6_144, true), DEEPSEEK_CREDENTIAL);

        var body = new ObjectMapper().readTree(capturedBody.get());
        assertThat(body.path("max_tokens").asInt()).isEqualTo(6_144);
        assertThat(body.path("response_format").path("type").asText()).isEqualTo("json_object");
        assertThat(output.getOut())
                .contains("AI_JSON_MODE", "structuredJson=true", "responseFormat=json_object",
                        "maxTokens=6144", "stage=FINAL")
                .doesNotContain("final-prompt-marker", "provider-key-marker", "https://api.example.test/v1");
    }

    private static String captureAndReturn(AtomicReference<byte[]> capturedBody, byte[] body, String response) {
        capturedBody.set(body);
        return response;
    }

    @Test
    void serializesThinkingControlsForAllDeepSeekRequests() throws Exception {
        AtomicReference<byte[]> capturedBody = new AtomicReference<>();
        DeepSeekAiProvider provider = deepSeekProvider((endpoint, path, key, body) -> {
            capturedBody.set(body);
            return "{\"choices\":[{\"message\":{\"content\":\"ok\"}}]}"
                    .getBytes(java.nio.charset.StandardCharsets.UTF_8);
        });
        AiProviderRequest structured = new AiProviderRequest(
                "deepseek-v4-flash", List.of(new AiProviderRequest.Message(AiMessageRole.USER, "return json")),
                0.1, null, true);
        provider.complete(structured, DEEPSEEK_CREDENTIAL);

        var structuredBody = new ObjectMapper().readTree(capturedBody.get());
        assertThat(structuredBody.has("max_tokens")).isFalse();
        assertThat(structuredBody.path("response_format").path("type").asText()).isEqualTo("json_object");
        assertThat(structuredBody.path("thinking").path("type").asText()).isEqualTo("disabled");

        provider.complete(new AiProviderRequest(
                "deepseek-v4-flash", structured.messages(), 0.1, null), DEEPSEEK_CREDENTIAL);
        var ordinaryBody = new ObjectMapper().readTree(capturedBody.get());
        assertThat(ordinaryBody.has("response_format")).isFalse();
        assertThat(ordinaryBody.path("thinking").path("type").asText()).isEqualTo("disabled");
    }

    @Test
    void carriesAllowlistedFinishReasonThroughSuccessfulProviderResponse() {
        OpenAiCompatibleProvider provider = deepSeekProvider((endpoint, path, key, body) ->
                ("{\"choices\":[{\"finish_reason\":\"length\",\"message\":{\"content\":\"ok\"}}]}"
                        .getBytes(java.nio.charset.StandardCharsets.UTF_8)));

        assertThat(provider.complete(new AiProviderRequest(
                "deepseek-v4-flash", List.of(new AiProviderRequest.Message(AiMessageRole.USER, "return json")),
                0.1, null, true), DEEPSEEK_CREDENTIAL).finishReason()).isEqualTo("length");
    }

    @Test
    void logsOnlySafeResponseEnvelopeMetadataWhenStructuredContentIsMissing(CapturedOutput output) {
        DeepSeekAiProvider provider = deepSeekProvider((endpoint, path, key, body) ->
                ("{\"choices\":[{\"finish_reason\":\"length\",\"message\":{"
                        + "\"content\":null,\"reasoning_content\":\"sensitive-reasoning-marker\"}}],"
                        + "\"usage\":{\"prompt_tokens\":100,\"completion_tokens\":1024}}")
                        .getBytes(java.nio.charset.StandardCharsets.UTF_8));
        AiProviderRequest request = new AiProviderRequest(
                "deepseek-v4-flash\nmodel-tail-marker", List.of(new AiProviderRequest.Message(AiMessageRole.USER, "request-content-marker")),
                0.1, 1_024, true);

        assertThatThrownBy(() -> provider.complete(request,
                new AiCredential("https://api.example.test/v1", "provider-key-marker")))
                .isInstanceOf(DomainException.class)
                .extracting(error -> ((DomainException) error).code())
                .isEqualTo("MODEL_PROVIDER_ERROR");

        assertThat(output.getOut())
                .contains("AI_PROVIDER_RESPONSE_INVALID", "provider=DEEPSEEK", "finishReason=length",
                        "hasReasoningContent=true", "choiceCount=1", "promptTokens=100", "completionTokens=1024",
                        "modelId=deepseek-v4-flash_model-tail-marker", "reasoningChars=26", "contentChars=0")
                .doesNotContain("sensitive-reasoning-marker", "request-content-marker",
                        "https://api.example.test/v1", "provider-key-marker");
    }

    @Test
    void mapsMalformedCompletionResponseToProviderError() {
        OpenAiCompatibleProvider malformedJson = provider((endpoint, path, key, body) ->
                "{\"choices\":[]}".getBytes(java.nio.charset.StandardCharsets.UTF_8));
        assertThatThrownBy(() -> malformedJson.complete(REQUEST, CREDENTIAL))
                .isInstanceOf(DomainException.class)
                .extracting(error -> ((DomainException) error).code())
                .isEqualTo("MODEL_PROVIDER_ERROR");
    }

    private void assertCodeForStatus(int status, String code) {
        OpenAiCompatibleProvider provider = provider((endpoint, path, key, body) -> {
            throw new ProviderHttpException(status);
        });
        assertThatThrownBy(() -> provider.complete(REQUEST, CREDENTIAL))
                .isInstanceOf(DomainException.class)
                .extracting(error -> ((DomainException) error).code())
                .isEqualTo(code);
    }

    private OpenAiCompatibleProvider provider(ProviderHttpTransport transport) {
        ProviderEndpointPolicy policy = mock(ProviderEndpointPolicy.class);
        when(policy.resolve(AiProviderType.OPENAI_COMPATIBLE, URI.create(CREDENTIAL.baseUrl())))
                .thenReturn(ENDPOINT);
        return new OpenAiCompatibleProvider(
                policy,
                new ProviderHttpClient(new ObjectMapper(), transport, 1024));
    }

    private DeepSeekAiProvider deepSeekProvider(ProviderHttpTransport transport) {
        ProviderEndpointPolicy policy = mock(ProviderEndpointPolicy.class);
        when(policy.resolve(AiProviderType.DEEPSEEK, URI.create("https://api.example.test/v1")))
                .thenReturn(new ResolvedProviderEndpoint("api.example.test", 443,
                        List.of(InetAddress.getLoopbackAddress()), "/v1"));
        return new DeepSeekAiProvider(policy, new ProviderHttpClient(new ObjectMapper(), transport, 16_384));
    }
}
