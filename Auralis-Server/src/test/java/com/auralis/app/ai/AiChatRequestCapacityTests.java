package com.auralis.app.ai;

import org.junit.jupiter.api.Test;
import tools.jackson.databind.ObjectMapper;

import java.nio.charset.StandardCharsets;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class AiChatRequestCapacityTests {
    private final ObjectMapper mapper = new ObjectMapper();

    @Test
    void countsUtf8BytesAndSerializesReasoningToolsArgumentsAndResults() throws Exception {
        AiProviderRequest request = new AiProviderRequest("model", List.of(
                new AiProviderRequest.Message(AiMessageRole.SYSTEM, "规则"),
                new AiProviderRequest.Message(AiMessageRole.USER, "旧问题"),
                new AiProviderRequest.Message(AiMessageRole.USER, "你".repeat(10)),
                new AiProviderRequest.Message(AiMessageRole.ASSISTANT, "检索中",
                        List.of(new AiProviderToolCall("call-1", "search", "{\"query\":\"café\"}")),
                        null, null, "思考🙂"),
                new AiProviderRequest.Message(AiMessageRole.TOOL, "é".repeat(4), List.of(),
                        "call-1", "search")),
                List.of(new AiProviderToolDefinition("search", "资料搜索", "{\"type\":\"object\"}")),
                0.0, 256, false, false, 0, true);
        long messageBytes = "规则".getBytes(StandardCharsets.UTF_8).length
                + "旧问题".getBytes(StandardCharsets.UTF_8).length
                + "你".repeat(10).getBytes(StandardCharsets.UTF_8).length
                + "检索中".getBytes(StandardCharsets.UTF_8).length
                + "é".repeat(4).getBytes(StandardCharsets.UTF_8).length;
        long serializedBytes = mapper.writeValueAsBytes(request).length;

        AiChatRequestCapacity.Check fits = AiChatRequestCapacity.inspect(request, mapper,
                serializedBytes, 8, messageBytes);
        AiChatRequestCapacity.Check serializedTooLarge = AiChatRequestCapacity.inspect(request, mapper,
                serializedBytes - 1, 8, messageBytes);
        AiChatRequestCapacity.Check messageTooLarge = AiChatRequestCapacity.inspect(request, mapper,
                serializedBytes, 8, messageBytes - 1);
        AiChatRequestCapacity.Check toolTooLarge = AiChatRequestCapacity.inspect(request, mapper,
                serializedBytes, 7, messageBytes);

        assertThat(fits.fits()).isTrue();
        assertThat(fits.comparedBytes()).isEqualTo(serializedBytes);
        assertThat(fits.secondaryBytes()).isEqualTo(messageBytes);
        assertThat(serializedTooLarge.dimension()).isEqualTo(AiChatRequestCapacity.Dimension.SERIALIZED_REQUEST_BYTES);
        assertThat(serializedTooLarge.comparedBytes()).isEqualTo(serializedBytes);
        assertThat(serializedTooLarge.limitBytes()).isEqualTo(serializedBytes - 1);
        assertThat(messageTooLarge.dimension()).isEqualTo(AiChatRequestCapacity.Dimension.LEGACY_MESSAGE_BYTES);
        assertThat(messageTooLarge.comparedBytes()).isEqualTo(messageBytes);
        assertThat(toolTooLarge.dimension()).isEqualTo(AiChatRequestCapacity.Dimension.TOOL_RESULT_BYTES);
        assertThat(toolTooLarge.comparedBytes()).isEqualTo("é".repeat(4).getBytes(StandardCharsets.UTF_8).length);
        assertThat(serializedBytes).isGreaterThan(messageBytes);

        AiChatRequestCapacity.Diagnostic diagnostic = AiChatRequestCapacity.diagnose(request, mapper);
        assertThat(diagnostic.serializedRequestBytes()).isEqualTo(serializedBytes);
        assertThat(diagnostic.messageContentBytes()).isEqualTo(messageBytes);
        assertThat(diagnostic.systemContentBytes()).isEqualTo("规则".getBytes(StandardCharsets.UTF_8).length);
        assertThat(diagnostic.userContentBytes()).isEqualTo("旧问题".getBytes(StandardCharsets.UTF_8).length
                + "你".repeat(10).getBytes(StandardCharsets.UTF_8).length);
        assertThat(diagnostic.assistantContentBytes()).isEqualTo("检索中".getBytes(StandardCharsets.UTF_8).length);
        assertThat(diagnostic.toolResultContentBytes()).isEqualTo("é".repeat(4).getBytes(StandardCharsets.UTF_8).length);
        assertThat(diagnostic.reasoningContentBytes()).isEqualTo("思考🙂".getBytes(StandardCharsets.UTF_8).length);
        assertThat(diagnostic.toolCallArgumentBytes()).isEqualTo("{\"query\":\"café\"}"
                .getBytes(StandardCharsets.UTF_8).length);
        assertThat(diagnostic.toolDefinitionCount()).isEqualTo(1);
        assertThat(diagnostic.toolDefinitionsBytes()).isEqualTo(mapper.writeValueAsBytes(request.tools()).length);
    }
}
