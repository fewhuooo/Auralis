package com.auralis.app.ai;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;

class AiProviderRequestValidatorTests {
    private static final AiProviderToolDefinition TOOL = new AiProviderToolDefinition(
            "lookup", "Find authorized material", "{\"type\":\"object\",\"properties\":{}}");

    @Test
    void requiresUniqueCallsAndExactToolResultPairing() {
        var call = new AiProviderToolCall("call-1", "lookup", "{\"q\":\"x\"}");
        assertDoesNotThrow(() -> new AiProviderRequest("model", List.of(
                new AiProviderRequest.Message(AiMessageRole.USER, "question"),
                new AiProviderRequest.Message(AiMessageRole.ASSISTANT, "", List.of(call), null, null),
                new AiProviderRequest.Message(AiMessageRole.TOOL, "result", List.of(), "call-1", "lookup")),
                List.of(TOOL), null, 128, false, false, 0));

        assertThrows(IllegalArgumentException.class, () -> new AiProviderRequest("model", List.of(
                new AiProviderRequest.Message(AiMessageRole.ASSISTANT, "", List.of(call, call), null, null)),
                List.of(TOOL), null, 128, false, false, 0));
        assertThrows(IllegalArgumentException.class, () -> new AiProviderRequest("model", List.of(
                new AiProviderRequest.Message(AiMessageRole.ASSISTANT, "", List.of(call), null, null)),
                List.of(TOOL), null, 128, false, false, 0));
    }

    @Test
    void requiresObjectArgumentsAndRejectsDuplicateKeys() {
        assertThrows(IllegalArgumentException.class, () -> new AiProviderRequest("model", List.of(
                new AiProviderRequest.Message(AiMessageRole.ASSISTANT, "", List.of(
                        new AiProviderToolCall("call-1", "lookup", "[]")), null, null)),
                List.of(TOOL), null, 128, false, false, 0));
        assertThrows(IllegalArgumentException.class, () -> new AiProviderRequest("model", List.of(
                new AiProviderRequest.Message(AiMessageRole.ASSISTANT, "", List.of(
                        new AiProviderToolCall("call-1", "lookup", "{\"q\":1,\"q\":2}")), null, null)),
                List.of(TOOL), null, 128, false, false, 0));
        assertThrows(IllegalArgumentException.class, () -> new AiProviderRequest("model", List.of(
                new AiProviderRequest.Message(AiMessageRole.USER, "question")),
                List.of(new AiProviderToolDefinition("lookup", null, "[]")), null, 128, false, false, 0));
    }

    @Test
    void keepsToolFieldsRoleSafe() {
        assertThrows(IllegalArgumentException.class,
                () -> new AiProviderRequest.Message(AiMessageRole.USER, "x", List.of(), "id", null));
        assertThrows(IllegalArgumentException.class,
                () -> new AiProviderRequest.Message(AiMessageRole.TOOL, "result", List.of(), null, "lookup"));
    }
}
