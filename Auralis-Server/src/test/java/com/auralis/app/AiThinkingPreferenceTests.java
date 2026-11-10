package com.auralis.app;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import com.auralis.app.ai.AiCredential;
import com.auralis.app.ai.AiMessageRole;
import com.auralis.app.ai.AiProviderChunk;
import com.auralis.app.ai.AiProviderRequest;
import com.auralis.app.ai.AiProviderType;
import com.auralis.app.ai.internal.provider.DeepSeekAiProvider;
import com.auralis.app.ai.internal.provider.OpenAiCompatibleProvider;
import com.auralis.app.ai.internal.security.ProviderEndpointPolicy;
import com.auralis.app.ai.internal.security.ProviderHttpClient;
import com.auralis.app.ai.internal.security.ProviderHttpTransport;
import com.auralis.app.ai.internal.security.ResolvedProviderEndpoint;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

import java.net.InetAddress;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicReference;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class AiThinkingPreferenceTests {

    private static final ResolvedProviderEndpoint ENDPOINT = new ResolvedProviderEndpoint(
            "provider.test", 443, List.of(InetAddress.getLoopbackAddress()), "/v1");
    private static final AiCredential MIMO = new AiCredential("https://api.xiaomimimo.com/v1", "key");
    private static final AiCredential DEEPSEEK = new AiCredential("https://api.deepseek.com/v1", "key");

    @Test
    void mimoDefaultsToDisabledAndCanBeEnabledForCompleteAndStream() {
        assertThinking(AiProviderType.OPENAI_COMPATIBLE, MIMO, null, false, false, false);
        assertThinking(AiProviderType.OPENAI_COMPATIBLE, MIMO, null, false, false, true);
        assertThinking(AiProviderType.OPENAI_COMPATIBLE, MIMO, "true", true, false, false);
        assertThinking(AiProviderType.OPENAI_COMPATIBLE, MIMO, "true", true, false, true);
    }

    @Test
    void deepSeekControlsThinkingForOrdinaryAndStructuredCompleteAndStream() {
        for (boolean structured : List.of(false, true)) {
            assertThinking(AiProviderType.DEEPSEEK, DEEPSEEK, null, false, structured, false);
            assertThinking(AiProviderType.DEEPSEEK, DEEPSEEK, null, false, structured, true);
            assertThinking(AiProviderType.DEEPSEEK, DEEPSEEK, "true", true, structured, false);
            assertThinking(AiProviderType.DEEPSEEK, DEEPSEEK, "true", true, structured, true);
        }
    }

    @Test
    void unknownAndLookalikeHostsDoNotReceiveMiMoThinkingField() {
        for (String baseUrl : List.of(
                "https://api.provider.test/v1",
                "https://api.xiaomimimo.com.attacker.test/v1",
                "https://xiaomimimo.com/v1")) {
            var credential = new AiCredential(baseUrl, "key");
            assertThinking(AiProviderType.OPENAI_COMPATIBLE, credential, "true", true, false, false);
            assertThinking(AiProviderType.OPENAI_COMPATIBLE, credential, "true", true, false, true);
        }
    }

    @Test
    void concurrentRequestPoliciesOverrideLegacyGlobalSettingIndependently() throws Exception {
        var policy = mock(ProviderEndpointPolicy.class);
        when(policy.resolve(eq(AiProviderType.OPENAI_COMPATIBLE), any(URI.class))).thenReturn(ENDPOINT);
        var wireBodies = new ConcurrentHashMap<String, JsonNode>();
        ProviderHttpTransport transport = new ProviderHttpTransport() {
            @Override public byte[] post(ResolvedProviderEndpoint endpoint, String path, String key, byte[] body) {
                JsonNode parsed = parse(body);
                wireBodies.put(parsed.path("model").asString(), parsed);
                return bytes("{\"choices\":[{\"message\":{\"content\":\"ok\"}}]}");
            }
            @Override public void postStream(ResolvedProviderEndpoint endpoint, String path, String key,
                    byte[] body, java.util.function.Consumer<String> sink) {
                throw new UnsupportedOperationException();
            }
        };
        var provider = new OpenAiCompatibleProvider(policy, new ProviderHttpClient(new ObjectMapper(), transport, 16_384));
        var executor = Executors.newFixedThreadPool(2);
        try {
            var chat = executor.submit(() -> provider.complete(request("chat", true), MIMO));
            var overview = executor.submit(() -> provider.complete(request("overview", false), MIMO));
            chat.get(5, TimeUnit.SECONDS);
            overview.get(5, TimeUnit.SECONDS);
        } finally {
            executor.shutdownNow();
        }

        assertThat(wireBodies.get("chat").path("thinking").path("type").asText()).isEqualTo("enabled");
        assertThat(wireBodies.get("overview").path("thinking").path("type").asText()).isEqualTo("disabled");
    }

    private AiProviderRequest request(String model, boolean thinkingEnabled) {
        return new AiProviderRequest(model, List.of(new AiProviderRequest.Message(AiMessageRole.USER, "hello")),
                List.of(), null, 128, false, false, 0, thinkingEnabled);
    }

    private void assertThinking(
            AiProviderType providerType,
            AiCredential credential,
            String configuredValue,
            boolean expectedEnabled,
            boolean structured,
            boolean streamOnly) {
        AtomicReference<JsonNode> captured = new AtomicReference<>();
        ProviderHttpTransport transport = new ProviderHttpTransport() {
            @Override
            public byte[] post(ResolvedProviderEndpoint endpoint, String path, String key, byte[] body) {
                captured.set(parse(body));
                return bytes("{\"choices\":[{\"message\":{\"content\":\"ok\"}}]}");
            }

            @Override
            public void postStream(ResolvedProviderEndpoint endpoint, String path, String key, byte[] body,
                                   java.util.function.Consumer<String> lineConsumer) {
                captured.set(parse(body));
                lineConsumer.accept("data: {\"choices\":[{\"delta\":{\"content\":\"ok\"}}]}");
                lineConsumer.accept("data: [DONE]");
            }
        };
        ProviderEndpointPolicy policy = mock(ProviderEndpointPolicy.class);
        when(policy.resolve(eq(providerType), any(URI.class))).thenReturn(ENDPOINT);
        var providerRunner = new ApplicationContextRunner()
                .withBean(ProviderEndpointPolicy.class, () -> policy)
                .withBean(ProviderHttpClient.class,
                        () -> new ProviderHttpClient(new ObjectMapper(), transport, 16_384));
        if (configuredValue != null) {
            providerRunner = providerRunner.withPropertyValues(
                    "auralis.ai.thinking-enabled=" + configuredValue);
        }
        if (providerType == AiProviderType.DEEPSEEK) {
            providerRunner = providerRunner.withBean(DeepSeekAiProvider.class,
                    () -> new DeepSeekAiProvider(policy,
                            new ProviderHttpClient(new ObjectMapper(), transport, 16_384)));
        } else {
            providerRunner = providerRunner.withBean(OpenAiCompatibleProvider.class,
                    () -> new OpenAiCompatibleProvider(policy,
                            new ProviderHttpClient(new ObjectMapper(), transport, 16_384)));
        }

        providerRunner.run(context -> {
            var provider = providerType == AiProviderType.DEEPSEEK
                    ? context.getBean(DeepSeekAiProvider.class)
                    : context.getBean(OpenAiCompatibleProvider.class);
            var request = new AiProviderRequest("test-model",
                    List.of(new AiProviderRequest.Message(AiMessageRole.USER, "hello")), 0.1, 128, structured);
            if (streamOnly) {
                provider.streamInto(request, credential, new ArrayList<AiProviderChunk>()::add);
            } else {
                provider.complete(request, credential);
            }

            JsonNode wireBody = captured.get();
            if (providerType == AiProviderType.DEEPSEEK
                    || "api.xiaomimimo.com".equalsIgnoreCase(URI.create(credential.baseUrl()).getHost())) {
                assertThat(wireBody.path("thinking").path("type").asText())
                        .isEqualTo(expectedEnabled ? "enabled" : "disabled");
            } else {
                assertThat(wireBody.has("thinking")).isFalse();
            }
            if (structured) {
                assertThat(wireBody.path("response_format").path("type").asText()).isEqualTo("json_object");
            } else {
                assertThat(wireBody.has("response_format")).isFalse();
            }
        });
    }

    private static JsonNode parse(byte[] bytes) {
        try {
            return new ObjectMapper().readTree(bytes);
        } catch (Exception exception) {
            throw new IllegalStateException(exception);
        }
    }

    private static byte[] bytes(String value) {
        return value.getBytes(StandardCharsets.UTF_8);
    }
}
