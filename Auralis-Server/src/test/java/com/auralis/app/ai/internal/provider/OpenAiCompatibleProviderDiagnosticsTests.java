package com.auralis.app.ai.internal.provider;

import com.auralis.app.ai.AiCredential;
import com.auralis.app.ai.AiMessageRole;
import com.auralis.app.ai.AiProviderCallCancellation;
import com.auralis.app.ai.AiProviderRequest;
import com.auralis.app.ai.AiProviderType;
import com.auralis.app.ai.internal.security.ProviderEndpointPolicy;
import com.auralis.app.ai.internal.security.ProviderEndpointPolicyTestFactory;
import com.auralis.app.ai.internal.security.ProviderHttpClient;
import com.auralis.app.ai.internal.security.ProviderHttpException;
import com.auralis.app.ai.internal.security.ProviderHttpTransport;
import com.auralis.app.ai.internal.security.ResolvedProviderEndpoint;
import com.auralis.app.shared.error.DomainException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import tools.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.function.Consumer;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@ExtendWith(OutputCaptureExtension.class)
class OpenAiCompatibleProviderDiagnosticsTests {

    @Test
    void logsConsumerDomainCodeWithoutLeakingFrameOrCallbackMessage(CapturedOutput output) {
        String frameSentinel = "private-frame-sentinel";
        String callbackSentinel = "private-callback-message-sentinel";
        OpenAiCompatibleProvider provider = provider(stream(frame(frameSentinel)));

        assertThatThrownBy(() -> provider.streamInto(request(), credential(), cancellation(), ignored -> {
            throw new DomainException("CHAT_CONTEXT_UNAVAILABLE", callbackSentinel);
        }))
                .isInstanceOf(DomainException.class)
                .extracting(exception -> ((DomainException) exception).code())
                .isEqualTo("MODEL_PROVIDER_ERROR");

        assertThat(output.getOut())
                .contains("phase=consumer_callback")
                .contains("errorCode=CHAT_CONTEXT_UNAVAILABLE")
                .contains("causeType=DomainException")
                .doesNotContain(frameSentinel, callbackSentinel, "api-key-sentinel", "request-prompt-sentinel");
    }

    @Test
    void logsMalformedProviderFrameAsSafeJsonDiagnostic(CapturedOutput output) {
        String bodySentinel = "private-malformed-body-sentinel";
        OpenAiCompatibleProvider provider = provider(stream("data: {\"choices\":[invalid," + bodySentinel + "]}\n"));

        assertThatThrownBy(() -> provider.streamInto(request(), credential(), cancellation(), ignored -> { }))
                .isInstanceOf(DomainException.class)
                .extracting(exception -> ((DomainException) exception).code())
                .isEqualTo("MODEL_PROVIDER_ERROR");

        assertThat(output.getOut())
                .contains("phase=provider_frame_json")
                .contains("errorCode=MODEL_PROVIDER_ERROR")
                .contains("causeType=")
                .doesNotContain(bodySentinel, "api-key-sentinel", "request-prompt-sentinel");
    }

    @Test
    void distinguishesUpstreamHttpStatusFromLocalConsumerFailure(CapturedOutput output) {
        ProviderHttpTransport transport = new ProviderHttpTransport() {
            @Override
            public byte[] post(ResolvedProviderEndpoint endpoint, String path, String apiKey, byte[] requestBody) {
                throw new AssertionError("The stream transport should be used");
            }

            @Override
            public void postStream(ResolvedProviderEndpoint endpoint, String path, String apiKey,
                    byte[] requestBody, Consumer<String> lineConsumer, long connectTimeoutMillis,
                    long responseTimeoutMillis) throws IOException {
                throw new ProviderHttpException(400);
            }
        };
        OpenAiCompatibleProvider provider = provider(transport);

        assertThatThrownBy(() -> provider.streamInto(request(), credential(), cancellation(), ignored -> { }))
                .isInstanceOf(DomainException.class)
                .extracting(exception -> ((DomainException) exception).code())
                .isEqualTo("MODEL_PROVIDER_ERROR");

        assertThat(output.getOut())
                .contains("phase=http_status")
                .contains("status=400")
                .doesNotContain("phase=consumer_callback", "api-key-sentinel", "request-prompt-sentinel");
    }

    private OpenAiCompatibleProvider provider(String response) {
        return provider(stream(response));
    }

    private OpenAiCompatibleProvider provider(ProviderHttpTransport transport) {
        ProviderEndpointPolicy policy = ProviderEndpointPolicyTestFactory.fakeDns();
        ProviderHttpClient client = new ProviderHttpClient(new ObjectMapper(), transport, 128 * 1024, 100, 100);
        return new OpenAiCompatibleProvider(AiProviderType.OPENAI_COMPATIBLE, policy, client);
    }

    private ProviderHttpTransport stream(String response) {
        byte[] bytes = response.getBytes(StandardCharsets.UTF_8);
        return (endpoint, path, apiKey, requestBody) -> bytes;
    }

    private String frame(String content) {
        return "data: {\"choices\":[{\"delta\":{\"content\":\"" + content
                + "\"},\"finish_reason\":null}]}\ndata: [DONE]\n";
    }

    private AiProviderRequest request() {
        return new AiProviderRequest("m", List.of(
                new AiProviderRequest.Message(AiMessageRole.USER, "request-prompt-sentinel")),
                List.of(), null, 32, false, false, 0);
    }

    private AiCredential credential() {
        return new AiCredential("https://vendor.example/v1", "api-key-sentinel");
    }

    private AiProviderCallCancellation cancellation() {
        return new AiProviderCallCancellation() {
            @Override public boolean isCancelled() { return false; }
            @Override public boolean cancel() { return false; }
            @Override public Registration onCancel(Runnable listener) { return () -> { }; }
        };
    }
}
