package com.auralis.app;

import com.auralis.app.ai.AiProviderType;
import com.auralis.app.ai.AiProviderChunk;
import com.auralis.app.ai.AiCredential;
import com.auralis.app.ai.AiMessageRole;
import com.auralis.app.ai.AiProviderRequest;
import com.auralis.app.ai.internal.provider.OpenAiCompatibleProvider;
import com.auralis.app.ai.internal.security.ProviderEndpointPolicy;
import com.auralis.app.ai.internal.security.ProviderHttpClient;
import com.auralis.app.ai.internal.security.ProviderHttpTransport;
import com.auralis.app.ai.internal.security.ResolvedProviderEndpoint;
import com.auralis.app.shared.error.DomainException;
import tools.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.net.SocketTimeoutException;
import java.net.URI;
import java.util.List;
import java.util.ArrayList;

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
                .isEqualTo("MODEL_UNAVAILABLE");
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
                .hasMessage("AI provider is unavailable")
                .hasCause(timeout);
    }

    @Test
    void mapsStreamingProviderTimeoutToModelUnavailable() {
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
    }
}
