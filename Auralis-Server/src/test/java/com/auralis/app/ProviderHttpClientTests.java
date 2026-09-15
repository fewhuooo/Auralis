package com.auralis.app;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import com.auralis.app.ai.internal.security.ProviderHttpClient;
import com.auralis.app.ai.internal.security.ProviderHttpTransport;
import com.auralis.app.ai.internal.security.ProviderResponseTooLargeException;
import com.auralis.app.ai.internal.security.ResolvedProviderEndpoint;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;

import java.net.InetAddress;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.Consumer;
import com.auralis.app.shared.config.AuralisProperties;
import org.mockito.Mockito;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@ExtendWith(OutputCaptureExtension.class)
class ProviderHttpClientTests {

    @Test
    void postsJsonThroughResolvedEndpointAndPreservesBasePath() throws Exception {
        ResolvedProviderEndpoint endpoint = new ResolvedProviderEndpoint(
                "provider.test", 443,
                List.of(InetAddress.getByName("93.184.216.34")), "/v1");
        ProviderHttpTransport transport = (resolved, path, apiKey, requestBody) -> {
            assertThat(resolved).isSameAs(endpoint);
            assertThat(path).isEqualTo("/chat/completions");
            assertThat(apiKey).isEqualTo("secret");
            assertThat(new String(requestBody, StandardCharsets.UTF_8)).contains("hello");
            return "{\"ok\":true}".getBytes(StandardCharsets.UTF_8);
        };

        JsonNode response = new ProviderHttpClient(new ObjectMapper(), transport, 1024)
                .postJson(endpoint, "/chat/completions", "secret", Map.of("prompt", "hello"), JsonNode.class);

        assertThat(response.path("ok").asBoolean()).isTrue();
    }

    @Test
    void rejectsResponsesAboveConfiguredLimit() {
        ProviderHttpTransport transport = (endpoint, path, apiKey, requestBody) ->
                "0123456789".getBytes(StandardCharsets.UTF_8);
        ResolvedProviderEndpoint endpoint = new ResolvedProviderEndpoint(
                "provider.test", 443, List.of(), "/");

        assertThatThrownBy(() -> new ProviderHttpClient(new ObjectMapper(), transport, 4)
                .postJson(endpoint, "/embeddings", "secret", Map.of(), JsonNode.class))
                .isInstanceOf(ProviderResponseTooLargeException.class);
    }

    @Test
    void logsProviderHttpLifecycleWithoutApiKey(CapturedOutput output) throws Exception {
        ProviderHttpTransport transport = (endpoint, path, apiKey, requestBody) ->
                "{\"ok\":true}".getBytes(StandardCharsets.UTF_8);
        ResolvedProviderEndpoint endpoint = new ResolvedProviderEndpoint(
                "provider.test", 443, List.of(InetAddress.getByName("93.184.216.34")), "/v1");

        new ProviderHttpClient(new ObjectMapper(), transport, 1024)
                .postJson(endpoint, "/embeddings", "provider-secret-key", Map.of("input", List.of("hello")), JsonNode.class);

        assertThat(output.getOut())
                .contains("AI_PROVIDER_HTTP_START")
                .contains("AI_PROVIDER_HTTP_SUCCESS")
                .contains("host=provider.test")
                .contains("path=/embeddings")
                .doesNotContain("provider-secret-key")
                .doesNotContain("hello");
    }

    @Test
    void routesConfiguredConnectAndResponseTimeoutsToJsonAndStreamTransport() throws Exception {
        ResolvedProviderEndpoint endpoint = new ResolvedProviderEndpoint(
                "provider.test", 443, List.of(InetAddress.getByName("93.184.216.34")), "/v1");
        AtomicLong jsonConnect = new AtomicLong();
        AtomicLong jsonResponse = new AtomicLong();
        AtomicLong streamConnect = new AtomicLong();
        AtomicLong streamResponse = new AtomicLong();
        ProviderHttpTransport transport = new ProviderHttpTransport() {
            @Override
            public byte[] post(ResolvedProviderEndpoint resolved, String path, String apiKey, byte[] body,
                               long connectTimeoutMillis, long responseTimeoutMillis) {
                jsonConnect.set(connectTimeoutMillis);
                jsonResponse.set(responseTimeoutMillis);
                return "{\"ok\":true}".getBytes(StandardCharsets.UTF_8);
            }

            @Override
            public void postStream(ResolvedProviderEndpoint resolved, String path, String apiKey, byte[] body,
                                   Consumer<String> lineConsumer, long connectTimeoutMillis,
                                   long responseTimeoutMillis) {
                streamConnect.set(connectTimeoutMillis);
                streamResponse.set(responseTimeoutMillis);
                lineConsumer.accept("data: [DONE]");
            }

            @Override
            public byte[] post(ResolvedProviderEndpoint resolved, String path, String apiKey, byte[] body) {
                throw new AssertionError("timeout-aware transport overload was not used");
            }
        };

        ProviderHttpClient client = new ProviderHttpClient(new ObjectMapper(), transport, 1024, 3_000, 10_000);
        client.postJson(endpoint, "/chat/completions", "secret", Map.of(), JsonNode.class, 120_000);
        client.postStream(endpoint, "/chat/completions", "secret", Map.of(), line -> { });

        assertThat(jsonConnect).hasValue(3_000);
        assertThat(jsonResponse).hasValue(120_000);
        assertThat(streamConnect).hasValue(3_000);
        assertThat(streamResponse).hasValue(10_000);
    }

    @Test
    void bindsConfiguredTimeoutsInsteadOfOverwritingThemWithCompatibilityDefaults() throws Exception {
        AuralisProperties properties = Mockito.mock(AuralisProperties.class);
        AuralisProperties.Ai ai = Mockito.mock(AuralisProperties.Ai.class);
        Mockito.when(properties.ai()).thenReturn(ai);
        Mockito.when(ai.providerConnectTimeoutMillis()).thenReturn(1_234L);
        Mockito.when(ai.requestTimeoutMillis()).thenReturn(56_789L);
        Mockito.when(ai.providerMaxResponseBytes()).thenReturn(1024L);

        ProviderHttpClient client = new ProviderHttpClient(new ObjectMapper(), properties);

        var connectField = ProviderHttpClient.class.getDeclaredField("connectTimeoutMillis");
        var responseField = ProviderHttpClient.class.getDeclaredField("responseTimeoutMillis");
        connectField.setAccessible(true);
        responseField.setAccessible(true);
        assertThat(connectField.getLong(client)).isEqualTo(1_234L);
        assertThat(responseField.getLong(client)).isEqualTo(56_789L);
    }
}
