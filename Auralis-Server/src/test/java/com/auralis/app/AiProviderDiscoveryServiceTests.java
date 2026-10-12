package com.auralis.app;

import com.auralis.app.ai.AiCredential;
import com.auralis.app.ai.AiProviderDiscoveryService;
import com.auralis.app.ai.AiProviderType;
import com.auralis.app.ai.AiSettingsService;
import com.auralis.app.ai.AiProviderRequest;
import com.auralis.app.ai.AiProviderResponse;
import com.auralis.app.ai.AiProviderChunk;
import com.auralis.app.ai.EmbeddingResult;
import com.auralis.app.ai.usage.AiInvocationGateway;
import com.auralis.app.ai.usage.AiInvocationResult;
import com.auralis.app.ai.usage.AiTaskScope;
import com.auralis.app.ai.internal.security.ProviderEndpointPolicy;
import com.auralis.app.ai.internal.security.ProviderHttpClient;
import com.auralis.app.ai.internal.security.ProviderHttpException;
import com.auralis.app.ai.internal.security.ProviderHttpTransport;
import com.auralis.app.ai.internal.security.ResolvedProviderEndpoint;
import com.auralis.app.shared.error.DomainException;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.ObjectMapper;

import java.net.InetAddress;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.UUID;
import java.util.function.Supplier;
import java.util.function.Consumer;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class AiProviderDiscoveryServiceTests {

    private static final String API_KEY = "saved-secret-key";
    private static final UUID USER_ID = UUID.randomUUID();
    private static final AiProviderType PROVIDER = AiProviderType.OPENAI_COMPATIBLE;
    private static final ResolvedProviderEndpoint ENDPOINT = new ResolvedProviderEndpoint(
            "provider.test", 443, List.of(InetAddress.getLoopbackAddress()), "/v1");

    @Test
    void listsModelsAndTestsSelectedChatModelWithoutRequiringModelsEndpointForTest() throws Exception {
        AiSettingsService settings = mock(AiSettingsService.class);
        ProviderEndpointPolicy endpointPolicy = mock(ProviderEndpointPolicy.class);
        when(settings.requireSavedByok(USER_ID, PROVIDER)).thenReturn(new AiSettingsService.ResolvedSettings(
                PROVIDER, "configured-model", new AiCredential("https://provider.test/v1", API_KEY)));
        when(endpointPolicy.resolve(PROVIDER, URI.create("https://provider.test/v1"))).thenReturn(ENDPOINT);
        ProviderHttpTransport transport = new ProviderHttpTransport() {
            @Override
            public byte[] post(ResolvedProviderEndpoint endpoint, String path, String apiKey, byte[] requestBody) {
                assertThat(endpoint).isSameAs(ENDPOINT);
                assertThat(path).isEqualTo("/chat/completions");
                assertThat(apiKey).isEqualTo(API_KEY);
                String body = new String(requestBody, StandardCharsets.UTF_8);
                assertThat(body).contains("\"model\":\"configured-model\"")
                        .contains("\"max_tokens\":1")
                        .doesNotContain(API_KEY);
                return "{\"choices\":[{\"message\":{\"content\":\"\"}}]}"
                        .getBytes(StandardCharsets.UTF_8);
            }

            @Override
            public byte[] get(ResolvedProviderEndpoint endpoint, String path, String apiKey,
                    long connectTimeoutMillis, long responseTimeoutMillis) {
                assertThat(endpoint).isSameAs(ENDPOINT);
                assertThat(path).isEqualTo("/models");
                assertThat(apiKey).isEqualTo(API_KEY);
                return "{\"data\":[{\"id\":\"model-a\"},{\"id\":\"vendor/model-b\"},"
                        .concat("{\"id\":\"model-a\"},{\"id\":\" \"},{\"id\":12}]}")
                        .getBytes(StandardCharsets.UTF_8);
            }
        };

        AiProviderDiscoveryService service = new AiProviderDiscoveryService(settings, endpointPolicy,
                new ProviderHttpClient(new ObjectMapper(), transport, 4096), gateway(request -> {
                    assertThat(request.model()).isEqualTo("configured-model");
                    assertThat(request.maxTokens()).isEqualTo(1);
                    return new AiProviderResponse("OK", null, null, null);
                }));

        var models = service.listModels(USER_ID, PROVIDER);
        var tested = service.testConnection(USER_ID, PROVIDER);

        assertThat(models.provider()).isEqualTo(PROVIDER);
        assertThat(models.models()).containsExactly("model-a", "vendor/model-b");
        assertThat(tested.reachable()).isTrue();
        assertThat(tested.chatModel()).isEqualTo("configured-model");
        assertThat(models.toString()).doesNotContain(API_KEY);
        verify(settings, org.mockito.Mockito.never()).resolveServerManagedEmbedding();
        verify(settings, org.mockito.Mockito.times(2)).requireSavedByok(USER_ID, PROVIDER);
    }

    @Test
    void mapsAuthenticationAndCompatibilityFailuresWithoutEchoingCredential() {
        AiSettingsService settings = mock(AiSettingsService.class);
        ProviderEndpointPolicy endpointPolicy = mock(ProviderEndpointPolicy.class);
        when(settings.requireSavedByok(USER_ID, PROVIDER)).thenReturn(new AiSettingsService.ResolvedSettings(
                PROVIDER, "configured-model", new AiCredential("https://provider.test/v1", API_KEY)));
        when(endpointPolicy.resolve(PROVIDER, URI.create("https://provider.test/v1"))).thenReturn(ENDPOINT);
        ProviderHttpTransport transport = new ProviderHttpTransport() {
            @Override
            public byte[] post(ResolvedProviderEndpoint endpoint, String path, String apiKey, byte[] body)
                    throws ProviderHttpException {
                throw new ProviderHttpException(401);
            }
        };
        AiProviderDiscoveryService service = new AiProviderDiscoveryService(settings, endpointPolicy,
                new ProviderHttpClient(new ObjectMapper(), transport, 4096), gateway(request -> {
                    throw new DomainException("MODEL_PROVIDER_ERROR",
                            "AI provider rejected the selected chat model or request");
                }));

        assertThatThrownBy(() -> service.testConnection(USER_ID, PROVIDER))
                .isInstanceOf(DomainException.class)
                .hasMessage("AI provider rejected the selected chat model or request")
                .hasMessageNotContaining(API_KEY)
                .extracting(error -> ((DomainException) error).code())
                .isEqualTo("MODEL_PROVIDER_ERROR");
    }

    private AiInvocationGateway gateway(java.util.function.Function<AiProviderRequest, AiProviderResponse> complete) {
        return context -> new AiTaskScope() {
            @Override public <T> AiInvocationResult<T> metadata(
                    com.auralis.app.ai.usage.AiStage stage, AiProviderType provider, String model, Supplier<T> operation) {
                return new AiInvocationResult<>(operation.get(), null);
            }
            @Override public AiInvocationResult<AiProviderResponse> complete(
                    com.auralis.app.ai.usage.AiStage stage, AiProviderType provider, AiProviderRequest request,
                    AiCredential credential, long timeout) {
                return new AiInvocationResult<>(complete.apply(request), null);
            }
            @Override public AiInvocationResult<Void> stream(
                    com.auralis.app.ai.usage.AiStage stage, AiProviderType provider, AiProviderRequest request,
                    AiCredential credential, Consumer<AiProviderChunk> sink) {
                throw new UnsupportedOperationException();
            }
            @Override public AiInvocationResult<EmbeddingResult> embed(
                    com.auralis.app.ai.usage.AiStage stage, AiProviderType provider, String model, List<String> texts,
                    AiCredential credential) { throw new UnsupportedOperationException(); }
            @Override public com.auralis.app.ai.usage.AiProviderUsage usage() { return null; }
            @Override public void close() { }
        };
    }
}
