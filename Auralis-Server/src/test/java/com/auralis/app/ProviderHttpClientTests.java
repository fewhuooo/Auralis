package com.auralis.app;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
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
}
