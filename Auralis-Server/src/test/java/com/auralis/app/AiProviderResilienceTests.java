package com.auralis.app;

import tools.jackson.databind.ObjectMapper;
import com.auralis.app.ai.AiMessageRole;
import com.auralis.app.ai.AiProviderRequest;
import com.auralis.app.ai.AiProviderType;
import com.auralis.app.ai.AiCredential;
import com.auralis.app.ai.internal.provider.OpenAiCompatibleProvider;
import com.auralis.app.ai.internal.security.ProviderEndpointPolicy;
import com.auralis.app.ai.internal.security.ProviderHttpClient;
import com.auralis.app.ai.internal.security.ProviderHttpException;
import com.auralis.app.ai.internal.security.ProviderHttpTransport;
import com.auralis.app.ai.internal.security.ResolvedProviderEndpoint;
import com.auralis.app.shared.error.DomainException;
import org.junit.jupiter.api.Test;

import java.net.InetAddress;
import java.net.URI;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class AiProviderResilienceTests {

    private static final ResolvedProviderEndpoint ENDPOINT = new ResolvedProviderEndpoint(
            "provider.test", 443, List.of(InetAddress.getLoopbackAddress()), "/v1");
    private static final AiProviderRequest REQUEST = new AiProviderRequest(
            "chat-model", List.of(new AiProviderRequest.Message(AiMessageRole.USER, "hello")), null, null);
    private static final AiCredential CREDENTIAL = new AiCredential("https://provider.test/v1", "key");

    @Test
    void mapsRateLimitServerAndClientProviderFailures() {
        assertCodeForStatus(429, "RATE_LIMITED");
        assertCodeForStatus(500, "MODEL_UNAVAILABLE");
        assertCodeForStatus(400, "MODEL_PROVIDER_ERROR");
    }

    @Test
    void mapsMalformedJsonAndMalformedStreamEventsToProviderError() {
        OpenAiCompatibleProvider malformedJson = provider((endpoint, path, key, body) ->
                "{\"choices\":[]}".getBytes(java.nio.charset.StandardCharsets.UTF_8));
        assertThatThrownBy(() -> malformedJson.complete(REQUEST, CREDENTIAL))
                .isInstanceOf(DomainException.class)
                .extracting(error -> ((DomainException) error).code())
                .isEqualTo("MODEL_PROVIDER_ERROR");

        OpenAiCompatibleProvider malformedStream = provider(new ProviderHttpTransport() {
            @Override
            public byte[] post(ResolvedProviderEndpoint endpoint, String path, String key, byte[] body) {
                return new byte[0];
            }

            @Override
            public void postStream(
                    ResolvedProviderEndpoint endpoint,
                    String path,
                    String key,
                    byte[] body,
                    java.util.function.Consumer<String> lineConsumer) {
                lineConsumer.accept("data: {not-json}");
            }
        });
        assertThatThrownBy(() -> malformedStream.streamInto(REQUEST, CREDENTIAL, chunk -> { }))
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
}
