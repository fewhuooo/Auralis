package com.auralis.app.ai;

import tools.jackson.core.JacksonException;
import tools.jackson.core.StreamReadFeature;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.ObjectMapper;

import java.util.ArrayDeque;
import java.util.HashSet;
import java.util.Set;

/** Strict validation for the application-owned provider tool protocol. */
public final class AiProviderRequestValidator {
    private static final ObjectMapper STRICT_JSON = new ObjectMapper();

    private AiProviderRequestValidator() { }

    public static void validate(Iterable<AiProviderRequest.Message> messages,
                                Iterable<AiProviderToolDefinition> tools) {
        Set<String> definitions = new HashSet<>();
        for (AiProviderToolDefinition tool : tools) {
            if (!definitions.add(tool.name())) invalid();
            requireObject(tool.schemaJson());
        }
        ArrayDeque<String> pending = new ArrayDeque<>();
        Set<String> seenCalls = new HashSet<>();
        for (AiProviderRequest.Message message : messages) {
            if (message.role() == AiMessageRole.ASSISTANT) {
                for (AiProviderToolCall call : message.toolCalls()) {
                    if (definitions.isEmpty() || !definitions.contains(call.name())) invalid();
                    if (!seenCalls.add(call.id())) invalid();
                    requireObject(call.argumentsJson());
                    pending.addLast(call.id());
                }
            } else if (message.role() == AiMessageRole.TOOL) {
                if (pending.isEmpty() || !pending.removeFirst().equals(message.toolCallId())) invalid();
            }
        }
        if (!pending.isEmpty()) invalid();
    }

    public static JsonNode requireObject(String json) {
        if (json == null) invalid();
        try {
            JsonNode node = STRICT_JSON.reader().with(StreamReadFeature.STRICT_DUPLICATE_DETECTION)
                    .with(DeserializationFeature.FAIL_ON_TRAILING_TOKENS).readTree(json);
            if (node == null || !node.isObject()) invalid();
            return node;
        } catch (JacksonException exception) {
            throw new IllegalArgumentException("Provider tool JSON must be a strict object", exception);
        } catch (RuntimeException exception) {
            throw exception;
        } catch (Exception exception) {
            throw new IllegalArgumentException("Provider tool JSON must be a strict object", exception);
        }
    }

    private static void invalid() {
        throw new IllegalArgumentException("Provider tool request is invalid");
    }
}
