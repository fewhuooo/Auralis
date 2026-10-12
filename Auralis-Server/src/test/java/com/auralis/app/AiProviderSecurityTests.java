package com.auralis.app;

import com.auralis.app.ai.AiProviderType;
import com.auralis.app.ai.AiProviderChunk;
import com.auralis.app.ai.AiCredential;
import com.auralis.app.ai.AiMessageRole;
import com.auralis.app.ai.AiProviderRequest;
import com.auralis.app.ai.usage.AiTokenUsage;
import com.auralis.app.ai.internal.provider.OpenAiCompatibleProvider;
import com.auralis.app.ai.internal.provider.SiliconFlowEmbeddingProvider;
import com.auralis.app.ai.internal.security.ProviderEndpointPolicy;
import com.auralis.app.ai.internal.security.ProviderHttpClient;
import com.auralis.app.ai.internal.security.ProviderHttpTransport;
import com.auralis.app.ai.internal.security.ResolvedProviderEndpoint;
import com.auralis.app.shared.error.DomainException;
import tools.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.net.SocketTimeoutException;
import java.io.IOException;
import java.net.URI;
import java.util.List;
import java.util.ArrayList;
import java.util.concurrent.atomic.AtomicLong;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class AiProviderSecurityTests {

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
        assertThatThrownBy(() -> policy.validate(
                AiProviderType.OPENAI_COMPATIBLE, "https://user:pass@provider.test"))
                .isInstanceOf(DomainException.class);
    }

    @Test
    void rejectsPrivateAddressesWhenResolvingProviderEndpoint() {
        ProviderEndpointPolicy policy = new ProviderEndpointPolicy(List.of("127.0.0.1"));

        assertThatThrownBy(() -> policy.resolve(
                AiProviderType.OPENAI_COMPATIBLE,
                URI.create("https://127.0.0.1")))
                .isInstanceOf(DomainException.class);
    }

    @Test
    void credentialStringDoesNotExposeApiKey() {
        assertThat(new AiCredential("https://provider.test", "sk-secret-value", "model")
                .toString())
                .doesNotContain("sk-secret-value")
                .contains("<redacted>");
    }

    @Test
    void rejectsPrivateIpv6ProviderAddress() {
        ProviderEndpointPolicy policy = new ProviderEndpointPolicy(List.of("fc00::1"));

        assertThatThrownBy(() -> policy.validate(
                AiProviderType.OPENAI_COMPATIBLE, "https://[fc00::1]"))
                .isInstanceOf(DomainException.class);
    }

    @Test
    void mapsProviderTimeoutToSafeErrorWithoutLeakingKey() throws Exception {
        ProviderEndpointPolicy policy = mock(ProviderEndpointPolicy.class);
        ResolvedProviderEndpoint endpoint = new ResolvedProviderEndpoint(
                "provider.test", 443, List.of(), "/v1");
        when(policy.resolve(AiProviderType.OPENAI_COMPATIBLE, URI.create("https://provider.test/v1")))
                .thenReturn(endpoint);
        ProviderHttpTransport transport = (resolved, path, apiKey, body) -> {
            throw new SocketTimeoutException("socket timeout");
        };
        OpenAiCompatibleProvider provider = new OpenAiCompatibleProvider(
                policy, new ProviderHttpClient(new ObjectMapper(), transport, 1024));

        assertThatThrownBy(() -> provider.complete(
                new AiProviderRequest(
                        "model",
                        List.of(new AiProviderRequest.Message(AiMessageRole.USER, "hello")),
                        null,
                        null),
                new AiCredential("https://provider.test/v1", "sk-secret-value")))
                .isInstanceOf(DomainException.class)
                .hasMessageNotContaining("sk-secret-value")
                .extracting(exception -> ((DomainException) exception).code())
                .isEqualTo("MODEL_TIMEOUT");
        verify(policy).resolve(AiProviderType.OPENAI_COMPATIBLE, URI.create("https://provider.test/v1"));
    }

    @Test
    void preservesProviderFailureCauseForAiFailureDiagnostics() {
        ProviderEndpointPolicy policy = mock(ProviderEndpointPolicy.class);
        ResolvedProviderEndpoint endpoint = new ResolvedProviderEndpoint(
                "provider.test", 443, List.of(), "/v1");
        when(policy.resolve(AiProviderType.OPENAI_COMPATIBLE, URI.create("https://provider.test/v1")))
                .thenReturn(endpoint);
        SocketTimeoutException timeout = new SocketTimeoutException("socket timeout");
        ProviderHttpTransport transport = (resolved, path, apiKey, body) -> {
            throw timeout;
        };
        OpenAiCompatibleProvider provider = new OpenAiCompatibleProvider(
                policy, new ProviderHttpClient(new ObjectMapper(), transport, 1024));

        assertThatThrownBy(() -> provider.complete(
                new AiProviderRequest(
                        "model",
                        List.of(new AiProviderRequest.Message(AiMessageRole.USER, "hello")),
                        null,
                        null),
                new AiCredential("https://provider.test/v1", "sk-secret-value")))
                .isInstanceOf(DomainException.class)
                .hasMessage("AI provider response timed out")
                .hasCause(timeout);
    }

    @Test
    void mapsStreamingProviderTimeoutToModelTimeout() {
        ProviderEndpointPolicy policy = mock(ProviderEndpointPolicy.class);
        ResolvedProviderEndpoint endpoint = new ResolvedProviderEndpoint(
                "provider.test", 443, List.of(), "/v1");
        when(policy.resolve(AiProviderType.OPENAI_COMPATIBLE, URI.create("https://provider.test/v1")))
                .thenReturn(endpoint);
        ProviderHttpTransport transport = new ProviderHttpTransport() {
            @Override
            public byte[] post(ResolvedProviderEndpoint resolved, String path, String apiKey, byte[] body) {
                throw new AssertionError("streaming must not use buffered JSON transport");
            }

            @Override
            public void postStream(ResolvedProviderEndpoint resolved, String path, String apiKey, byte[] body,
                                   java.util.function.Consumer<String> lineConsumer) throws java.io.IOException {
                throw new SocketTimeoutException("stream timeout");
            }
        };
        OpenAiCompatibleProvider provider = new OpenAiCompatibleProvider(
                policy, new ProviderHttpClient(new ObjectMapper(), transport, 1024));

        assertThatThrownBy(() -> provider.streamInto(
                new AiProviderRequest(
                        "model",
                        List.of(new AiProviderRequest.Message(AiMessageRole.USER, "hello")),
                        null,
                        null),
                new AiCredential("https://provider.test/v1", "sk-secret-value"),
                chunk -> { }))
                .isInstanceOf(DomainException.class)
                .extracting(exception -> ((DomainException) exception).code())
                .isEqualTo("MODEL_TIMEOUT");
    }

    @Test
    void passesCompatibilityDefaultTimeoutsToSiliconFlowEmbeddingTransport() {
        ProviderEndpointPolicy policy = mock(ProviderEndpointPolicy.class);
        ResolvedProviderEndpoint endpoint = new ResolvedProviderEndpoint(
                "embedding.test", 443, List.of(), "/v1");
        when(policy.resolve(AiProviderType.SILICONFLOW, URI.create("https://embedding.test/v1")))
                .thenReturn(endpoint);
        AtomicLong connectTimeout = new AtomicLong();
        AtomicLong responseTimeout = new AtomicLong();
        ProviderHttpTransport transport = new ProviderHttpTransport() {
            @Override
            public byte[] post(ResolvedProviderEndpoint resolved, String path, String apiKey, byte[] body) {
                throw new AssertionError("timeout-aware overload must be used");
            }

            @Override
            public byte[] post(ResolvedProviderEndpoint resolved, String path, String apiKey, byte[] body,
                               long connectTimeoutMillis, long responseTimeoutMillis) {
                connectTimeout.set(connectTimeoutMillis);
                responseTimeout.set(responseTimeoutMillis);
                String vector = String.join(",", java.util.Collections.nCopies(1024, "0.1"));
                return ("{\"data\":[{\"index\":0,\"embedding\":[" + vector + "]}]}")
                        .getBytes(java.nio.charset.StandardCharsets.UTF_8);
            }
        };
        SiliconFlowEmbeddingProvider provider = new SiliconFlowEmbeddingProvider(
                policy, new ProviderHttpClient(new ObjectMapper(), transport, 100_000));

        provider.embed(List.of("hello"), new AiCredential("https://embedding.test/v1", "sk-secret-value", "embed"));

        assertThat(connectTimeout).hasValue(3_000L);
        assertThat(responseTimeout).hasValue(10_000L);
    }

    @Test
    void restoresEmbeddingVectorsToRequestOrderUsingProviderIndices() {
        String first = String.join(",", java.util.Collections.nCopies(1024, "0.1"));
        String second = String.join(",", java.util.Collections.nCopies(1024, "0.2"));
        SiliconFlowEmbeddingProvider provider = embeddingProviderResponse(
                "{\"data\":[{\"index\":1,\"embedding\":[" + second + "]},"
                        + "{\"index\":0,\"embedding\":[" + first + "]}]}");

        var result = provider.embed(List.of("first", "second"),
                new AiCredential("https://embedding.test/v1", "sk-secret-value", "embed"));

        assertThat(result.vectors()).hasSize(2);
        assertThat(result.vectors().get(0).getFirst()).isEqualTo(0.1);
        assertThat(result.vectors().get(1).getFirst()).isEqualTo(0.2);
    }

    @Test
    void parsesSiliconFlowEmbeddingCompletionTokensIncludingZero() {
        String vector = String.join(",", java.util.Collections.nCopies(1024, "0.1"));
        SiliconFlowEmbeddingProvider provider = embeddingProviderResponse(
                "{\"data\":[{\"index\":0,\"embedding\":[" + vector + "]}],"
                        + "\"usage\":{\"prompt_tokens\":7454,\"completion_tokens\":0,\"total_tokens\":7454}}");

        var result = provider.embed(List.of("controlled"),
                new AiCredential("https://embedding.test/v1", "sk-secret-value", "embed"));

        assertThat(result.usage()).isEqualTo(new AiTokenUsage(7454L, 0L));
    }

    @Test
    void leavesMissingOrInvalidEmbeddingCompletionTokensUnknown() {
        String vector = String.join(",", java.util.Collections.nCopies(1024, "0.1"));
        List<String> responseBodies = List.of(
                "{\"data\":[{\"index\":0,\"embedding\":[" + vector + "]}]}",
                "{\"data\":[{\"index\":0,\"embedding\":[" + vector + "]}],"
                        + "\"usage\":{\"prompt_tokens\":7454}}",
                "{\"data\":[{\"index\":0,\"embedding\":[" + vector + "]}],"
                        + "\"usage\":{\"prompt_tokens\":7454,\"completion_tokens\":\"0\"}}",
                "{\"data\":[{\"index\":0,\"embedding\":[" + vector + "]}],"
                        + "\"usage\":{\"prompt_tokens\":7454,\"completion_tokens\":-1}}",
                "{\"data\":[{\"index\":0,\"embedding\":[" + vector + "]}],"
                        + "\"usage\":{\"prompt_tokens\":7454,\"completion_tokens\":0.5}}");

        for (int index = 0; index < responseBodies.size(); index++) {
            var result = embeddingProviderResponse(responseBodies.get(index)).embed(List.of("controlled"),
                    new AiCredential("https://embedding.test/v1", "sk-secret-value", "embed"));
            if (index == 0) {
                assertThat(result.usage()).isNull();
            } else {
                assertThat(result.usage()).isEqualTo(new AiTokenUsage(7454L, null));
            }
        }
    }

    @Test
    void rejectsInvalidEmbeddingIndices() {
        String vector = String.join(",", java.util.Collections.nCopies(1024, "0.1"));
        List<String> invalidBodies = List.of(
                "{\"data\":[{\"index\":0,\"embedding\":[" + vector + "]},{\"index\":0,\"embedding\":[" + vector + "]}]}",
                "{\"data\":[{\"index\":0,\"embedding\":[" + vector + "]},{\"embedding\":[" + vector + "]}]}",
                "{\"data\":[{\"index\":-1,\"embedding\":[" + vector + "]},{\"index\":1,\"embedding\":[" + vector + "]}]}",
                "{\"data\":[{\"index\":0,\"embedding\":[" + vector + "]},{\"index\":2,\"embedding\":[" + vector + "]}]}",
                "{\"data\":[{\"index\":0,\"embedding\":[" + vector + "]},{\"index\":\"1\",\"embedding\":[" + vector + "]}]}"
        );

        for (String body : invalidBodies) {
            assertThatThrownBy(() -> embeddingProviderResponse(body).embed(List.of("one", "two"),
                    new AiCredential("https://embedding.test/v1", "sk-secret-value", "embed")))
                    .isInstanceOf(DomainException.class)
                    .extracting(error -> ((DomainException) error).code())
                    .isEqualTo("MODEL_PROVIDER_ERROR");
        }
    }

    @Test
    void rejectsNonNumericEmbeddingValuesInsteadOfCoercingThemToZero() {
        String vector = String.join(",", java.util.Collections.nCopies(1023, "0.1")) + ",\"not-a-number\"";
        SiliconFlowEmbeddingProvider provider = embeddingProviderResponse(
                "{\"data\":[{\"index\":0,\"embedding\":[" + vector + "]}]}");

        assertThatThrownBy(() -> provider.embed(List.of("one"),
                new AiCredential("https://embedding.test/v1", "sk-secret-value", "embed")))
                .isInstanceOf(DomainException.class)
                .extracting(error -> ((DomainException) error).code())
                .isEqualTo("MODEL_PROVIDER_ERROR");
    }

    private SiliconFlowEmbeddingProvider embeddingProviderResponse(String responseBody) {
        ProviderEndpointPolicy policy = mock(ProviderEndpointPolicy.class);
        ResolvedProviderEndpoint endpoint = new ResolvedProviderEndpoint(
                "embedding.test", 443, List.of(), "/v1");
        when(policy.resolve(AiProviderType.SILICONFLOW, URI.create("https://embedding.test/v1")))
                .thenReturn(endpoint);
        ProviderHttpTransport transport = (resolved, path, apiKey, body) ->
                responseBody.getBytes(java.nio.charset.StandardCharsets.UTF_8);
        return new SiliconFlowEmbeddingProvider(
                policy, new ProviderHttpClient(new ObjectMapper(), transport, 100_000));
    }

    @Test
    void mapsSiliconFlowEmbeddingSocketTimeoutToModelTimeoutWithCause() {
        ProviderEndpointPolicy policy = mock(ProviderEndpointPolicy.class);
        ResolvedProviderEndpoint endpoint = new ResolvedProviderEndpoint(
                "embedding.test", 443, List.of(), "/v1");
        when(policy.resolve(AiProviderType.SILICONFLOW, URI.create("https://embedding.test/v1")))
                .thenReturn(endpoint);
        SocketTimeoutException timeout = new SocketTimeoutException("embedding timeout");
        ProviderHttpTransport transport = (resolved, path, apiKey, body) -> { throw timeout; };
        SiliconFlowEmbeddingProvider provider = new SiliconFlowEmbeddingProvider(
                policy, new ProviderHttpClient(new ObjectMapper(), transport, 1024));

        assertThatThrownBy(() -> provider.embed(List.of("hello"),
                new AiCredential("https://embedding.test/v1", "sk-secret-value", "embed")))
                .isInstanceOf(DomainException.class)
                .hasMessage("Embedding provider response timed out")
                .hasCause(timeout)
                .extracting(error -> ((DomainException) error).code())
                .isEqualTo("MODEL_TIMEOUT");
    }

    @Test
    void mapsSiliconFlowEmbeddingGenericIoFailureToModelUnavailableWithCause() {
        ProviderEndpointPolicy policy = mock(ProviderEndpointPolicy.class);
        ResolvedProviderEndpoint endpoint = new ResolvedProviderEndpoint(
                "embedding.test", 443, List.of(), "/v1");
        when(policy.resolve(AiProviderType.SILICONFLOW, URI.create("https://embedding.test/v1")))
                .thenReturn(endpoint);
        IOException failure = new IOException("embedding transport failed");
        ProviderHttpTransport transport = (resolved, path, apiKey, body) -> { throw failure; };
        SiliconFlowEmbeddingProvider provider = new SiliconFlowEmbeddingProvider(
                policy, new ProviderHttpClient(new ObjectMapper(), transport, 1024));

        assertThatThrownBy(() -> provider.embed(List.of("hello"),
                new AiCredential("https://embedding.test/v1", "sk-secret-value", "embed")))
                .isInstanceOf(DomainException.class)
                .hasMessage("Embedding provider is unavailable")
                .hasCause(failure)
                .extracting(error -> ((DomainException) error).code())
                .isEqualTo("MODEL_UNAVAILABLE");
    }

    @Test
    void parsesIncrementalOpenAiCompatibleSseWithoutBuildingCompleteResponse() {
        ProviderEndpointPolicy policy = mock(ProviderEndpointPolicy.class);
        ResolvedProviderEndpoint endpoint = new ResolvedProviderEndpoint(
                "provider.test", 443, List.of(), "/v1");
        when(policy.resolve(AiProviderType.OPENAI_COMPATIBLE, URI.create("https://provider.test/v1")))
                .thenReturn(endpoint);
        ProviderHttpTransport transport = new ProviderHttpTransport() {
            @Override
            public byte[] post(ResolvedProviderEndpoint resolved, String path, String apiKey, byte[] body) {
                throw new AssertionError("streaming must not use buffered JSON transport");
            }

            @Override
            public void postStream(ResolvedProviderEndpoint resolved, String path, String apiKey, byte[] body,
                                   java.util.function.Consumer<String> lineConsumer) {
                lineConsumer.accept("data: {\"choices\":[{\"delta\":{\"content\":\"hel\"}}]}");
                lineConsumer.accept("data: {\"choices\":[{\"delta\":{\"content\":\"lo\"}}]}");
                lineConsumer.accept("data: [DONE]");
            }
        };
        OpenAiCompatibleProvider provider = new OpenAiCompatibleProvider(
                policy, new ProviderHttpClient(new ObjectMapper(), transport, 1024));
        List<AiProviderChunk> chunks = new ArrayList<>();

        provider.streamInto(
                new AiProviderRequest(
                        "model",
                        List.of(new AiProviderRequest.Message(AiMessageRole.USER, "hello")),
                        null,
                        null),
                new AiCredential("https://provider.test/v1", "sk-secret-value"),
                chunks::add);

        assertThat(chunks).extracting(AiProviderChunk::content)
                .containsExactly("hel", "lo", "");
        assertThat(chunks.get(2).complete()).isTrue();
        assertThat(chunks.get(2).usage()).isNull();
    }

    @Test
    void parsesOpenAiStreamingUsageBeforeDoneAndRequestsTheUsageChunk() {
        ProviderEndpointPolicy policy = mock(ProviderEndpointPolicy.class);
        ResolvedProviderEndpoint endpoint = new ResolvedProviderEndpoint(
                "provider.test", 443, List.of(), "/v1");
        when(policy.resolve(AiProviderType.OPENAI_COMPATIBLE, URI.create("https://provider.test/v1")))
                .thenReturn(endpoint);
        AtomicLong requestHasUsageOption = new AtomicLong();
        ProviderHttpTransport transport = new ProviderHttpTransport() {
            @Override
            public byte[] post(ResolvedProviderEndpoint resolved, String path, String apiKey, byte[] body) {
                throw new AssertionError("streaming must not use buffered JSON transport");
            }

            @Override
            public void postStream(ResolvedProviderEndpoint resolved, String path, String apiKey, byte[] body,
                                  java.util.function.Consumer<String> lineConsumer) {
                String request = new String(body, java.nio.charset.StandardCharsets.UTF_8);
                if (request.contains("\"stream_options\":{\"include_usage\":true}")) {
                    requestHasUsageOption.set(1);
                }
                lineConsumer.accept("data: {\"choices\":[{\"delta\":{\"content\":\"answer\"}}]}");
                lineConsumer.accept("data: {\"choices\":[],\"usage\":{\"prompt_tokens\":17,\"completion_tokens\":3,\"total_tokens\":20}}");
                lineConsumer.accept("data: [DONE]");
            }
        };
        OpenAiCompatibleProvider provider = new OpenAiCompatibleProvider(
                policy, new ProviderHttpClient(new ObjectMapper(), transport, 1024));
        List<AiProviderChunk> chunks = new ArrayList<>();

        provider.streamInto(new AiProviderRequest(
                        "model", List.of(new AiProviderRequest.Message(AiMessageRole.USER, "hello")), null, null),
                new AiCredential("https://provider.test/v1", "sk-secret-value"), chunks::add);

        assertThat(requestHasUsageOption).hasValue(1);
        assertThat(chunks).extracting(AiProviderChunk::complete).containsExactly(false, false, true);
        assertThat(chunks.get(1).usage()).isEqualTo(new AiTokenUsage(17L, 3L));
        assertThat(chunks.get(2).usage()).isNull();
    }

    @Test
    void missingCompletionUsageRemainsUnknownInsteadOfBecomingZero() {
        ProviderEndpointPolicy policy = mock(ProviderEndpointPolicy.class);
        ResolvedProviderEndpoint endpoint = new ResolvedProviderEndpoint(
                "provider.test", 443, List.of(), "/v1");
        when(policy.resolve(AiProviderType.OPENAI_COMPATIBLE, URI.create("https://provider.test/v1")))
                .thenReturn(endpoint);
        ProviderHttpTransport transport = (resolved, path, apiKey, body) ->
                "{\"choices\":[{\"message\":{\"content\":\"answer\"},\"finish_reason\":\"stop\"}]}"
                        .getBytes(java.nio.charset.StandardCharsets.UTF_8);
        OpenAiCompatibleProvider provider = new OpenAiCompatibleProvider(
                policy, new ProviderHttpClient(new ObjectMapper(), transport, 1024));

        var response = provider.complete(new AiProviderRequest(
                        "model", List.of(new AiProviderRequest.Message(AiMessageRole.USER, "hello")), null, null),
                new AiCredential("https://provider.test/v1", "sk-secret-value"));

        assertThat(response.inputTokens()).isNull();
        assertThat(response.outputTokens()).isNull();
        assertThat(response.usage()).isNull();
    }
}
