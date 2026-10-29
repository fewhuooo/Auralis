package com.auralis.app.ai.internal.provider;

import com.auralis.app.ai.AiCredential;
import com.auralis.app.ai.AiMessageRole;
import com.auralis.app.ai.AiProviderCallCancellation;
import com.auralis.app.ai.AiProviderChunk;
import com.auralis.app.ai.AiProviderRequest;
import com.auralis.app.ai.AiProviderToolCall;
import com.auralis.app.ai.AiProviderToolDefinition;
import com.auralis.app.ai.AiProviderType;
import com.auralis.app.ai.internal.security.ProviderEndpointPolicy;
import com.auralis.app.ai.internal.security.ProviderEndpointPolicyTestFactory;
import com.auralis.app.ai.internal.security.ProviderHttpClient;
import com.auralis.app.ai.internal.security.ResolvedProviderEndpoint;
import com.auralis.app.shared.error.DomainException;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class OpenAiCompatibleChatToolStreamTests {
    private static final String NORMAL_TOOL_STREAM = """
            data: {"id":"resp-1","choices":[{"delta":{"content":"hello "},"finish_reason":null}]}

            data: {"id":"resp-1","choices":[{"delta":{"tool_calls":[{"index":0,"id":"call-1","type":"function","function":{"name":"lookup","arguments":"{\\\"q\\\":"}}]},"finish_reason":null}]}

            data: {"id":"resp-1","choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\\\"x\\\"}"}}]},"finish_reason":null}]}

            data: {"id":"resp-1","choices":[{"delta":{},"finish_reason":"tool_calls"}]}

            data: {"id":"resp-1","choices":[],"usage":{"prompt_tokens":4,"completion_tokens":3}}

            data: [DONE]

            """;

    @Test
    void serializesCompleteRoleSafeToolHistoryAndAggregatesMixedStream() throws Exception {
        AtomicReference<JsonNode> requestBody = new AtomicReference<>();
        ProviderHttpTransportStub transport = new ProviderHttpTransportStub(NORMAL_TOOL_STREAM, requestBody);
        OpenAiCompatibleProvider provider = provider(transport);
        AiProviderRequest request = request();
        List<AiProviderChunk> chunks = new ArrayList<>();

        provider.streamInto(request, credential(), new TestCancellation(), chunks::add);

        assertThat(chunks.stream().map(AiProviderChunk::content).filter(s -> !s.isEmpty()).toList())
                .containsExactly("hello ");
        List<AiProviderChunk> toolDeltas = chunks.stream().filter(c -> c.toolCallDelta() != null).toList();
        assertThat(toolDeltas).hasSize(2);
        assertThat(toolDeltas).allSatisfy(chunk -> {
            assertThat(chunk.responseId()).isEqualTo("resp-1");
            assertThat(chunk.toolIndex()).isZero();
        });
        AiProviderChunk terminal = chunks.getLast();
        assertThat(terminal.terminal()).isTrue();
        assertThat(terminal.finishReason()).isEqualTo("tool_calls");
        assertThat(terminal.usage().inputTokens()).isEqualTo(4L);
        assertThat(requestBody.get().path("tools").get(0).path("function").path("parameters").isObject()).isTrue();

        AiProviderRequest withResult = new AiProviderRequest("m", List.of(
                new AiProviderRequest.Message(AiMessageRole.ASSISTANT, "", List.of(
                        new AiProviderToolCall("call-1", "lookup", "{\"q\":\"x\"}")), null, null),
                new AiProviderRequest.Message(AiMessageRole.TOOL, "result", List.of(), "call-1", "lookup")),
                List.of(new AiProviderToolDefinition("lookup", null,
                        "{\"type\":\"object\",\"properties\":{}}")), null, 32, false, false, 0);
        assertThat(withResult.messages().get(1).toolCallId()).isEqualTo("call-1");
        AtomicReference<JsonNode> resultRequestBody = new AtomicReference<>();
        ProviderHttpTransportStub resultTransport = new ProviderHttpTransportStub(NORMAL_TOOL_STREAM,
                resultRequestBody);
        provider(resultTransport).streamInto(withResult, credential(), new TestCancellation(), ignored -> { });
        JsonNode wire = resultRequestBody.get();
        assertThat(wire.path("messages").get(0).path("tool_calls").get(0)
                .path("function").path("arguments").asString()).isEqualTo("{\"q\":\"x\"}");
        assertThat(wire.path("messages").get(1).path("role").asString()).isEqualTo("tool");
        assertThat(wire.path("messages").get(1).path("tool_call_id").asString()).isEqualTo("call-1");
        assertThat(wire.path("messages").get(1).has("name")).isFalse();
    }

    @Test
    void eofWithoutDoneDoesNotEmitExecutableTerminal() {
        String body = "data: {\"id\":\"r\",\"choices\":[{\"delta\":{},\"finish_reason\":\"tool_calls\"}]}\n";
        OpenAiCompatibleProvider provider = provider(new ProviderHttpTransportStub(body, new AtomicReference<>()));
        List<AiProviderChunk> chunks = new ArrayList<>();

        assertThatThrownBy(() -> provider.streamInto(request(), credential(), new TestCancellation(), chunks::add))
                .isInstanceOf(DomainException.class);
        assertThat(chunks).noneMatch(AiProviderChunk::terminal);
    }

    private OpenAiCompatibleProvider provider(ProviderHttpTransportStub transport) {
        ProviderEndpointPolicy policy = ProviderEndpointPolicyTestFactory.fakeDns();
        ProviderHttpClient client = new ProviderHttpClient(new ObjectMapper(), transport, 128 * 1024, 100, 100);
        return new OpenAiCompatibleProvider(AiProviderType.OPENAI_COMPATIBLE, policy, client);
    }

    private AiProviderRequest request() {
        return new AiProviderRequest("m", List.of(
                new AiProviderRequest.Message(AiMessageRole.USER, "question")),
                List.of(new AiProviderToolDefinition("lookup", "Find info",
                        "{\"type\":\"object\",\"properties\":{\"q\":{\"type\":\"string\"}}}")),
                null, 32, false, false, 0);
    }

    private AiCredential credential() { return new AiCredential("https://vendor.example/v1", "synthetic"); }

    private static final class ProviderHttpTransportStub implements com.auralis.app.ai.internal.security.ProviderHttpTransport {
        private final byte[] response;
        private final AtomicReference<JsonNode> requestBody;
        private byte[] requestBytes;

        private ProviderHttpTransportStub(String response, AtomicReference<JsonNode> requestBody) {
            this.response = response.getBytes(StandardCharsets.UTF_8);
            this.requestBody = requestBody;
        }

        @Override
        public byte[] post(ResolvedProviderEndpoint endpoint, String path, String apiKey, byte[] requestBody)
                throws java.io.IOException {
            this.requestBytes = requestBody;
            this.requestBody.set(new ObjectMapper().readTree(requestBody));
            return response;
        }

        private byte[] requestBytes() { return requestBytes; }
    }

    private static final class TestCancellation implements AiProviderCallCancellation {
        private final AtomicBoolean cancelled = new AtomicBoolean();
        @Override public boolean isCancelled() { return cancelled.get(); }
        @Override public boolean cancel() { return cancelled.compareAndSet(false, true); }
        @Override public Registration onCancel(Runnable listener) {
            if (isCancelled()) listener.run();
            return () -> { };
        }
    }
}
