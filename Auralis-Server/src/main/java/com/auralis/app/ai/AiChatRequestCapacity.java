package com.auralis.app.ai;

import tools.jackson.core.JacksonException;
import tools.jackson.databind.ObjectMapper;

import java.nio.charset.StandardCharsets;
import java.util.Objects;

/** Pure byte-capacity check shared by Chat history projection and the invocation Gateway. */
public final class AiChatRequestCapacity {
    private AiChatRequestCapacity() { }

    public static Check inspect(AiProviderRequest request, ObjectMapper mapper,
                                long serializedRequestByteLimit, long toolResultByteLimit,
                                long messageContentByteLimit) {
        Objects.requireNonNull(request);
        Objects.requireNonNull(mapper);
        try {
            long messageBytes = 0;
            for (AiProviderRequest.Message message : request.messages()) {
                if (message.content() != null) {
                    long contentBytes = message.content().getBytes(StandardCharsets.UTF_8).length;
                    messageBytes = Math.addExact(messageBytes, contentBytes);
                    if (message.role() == AiMessageRole.TOOL && contentBytes > toolResultByteLimit) {
                        return new Check(Dimension.TOOL_RESULT_BYTES, contentBytes, toolResultByteLimit, -1);
                    }
                }
            }

            long serializedBytes = mapper.writeValueAsBytes(request).length;
            if (serializedBytes > serializedRequestByteLimit) {
                return new Check(Dimension.SERIALIZED_REQUEST_BYTES, serializedBytes,
                        serializedRequestByteLimit, messageBytes);
            }
            if (messageBytes > messageContentByteLimit) {
                return new Check(Dimension.MESSAGE_CONTENT_BYTES, messageBytes,
                        messageContentByteLimit, serializedBytes);
            }
            return new Check(Dimension.FITS, serializedBytes, serializedRequestByteLimit, messageBytes);
        } catch (ArithmeticException | JacksonException invalidRequest) {
            return new Check(Dimension.INVALID_REQUEST, -1, -1, -1);
        }
    }

    public static Diagnostic diagnose(AiProviderRequest request, ObjectMapper mapper) {
        Objects.requireNonNull(request);
        Objects.requireNonNull(mapper);
        long messageContentBytes = 0;
        long systemContentBytes = 0;
        long userContentBytes = 0;
        long assistantContentBytes = 0;
        long toolResultContentBytes = 0;
        long reasoningContentBytes = 0;
        long toolCallArgumentBytes = 0;
        for (AiProviderRequest.Message message : request.messages()) {
            long contentBytes = utf8Bytes(message.content());
            messageContentBytes += contentBytes;
            switch (message.role()) {
                case SYSTEM -> systemContentBytes += contentBytes;
                case USER -> userContentBytes += contentBytes;
                case ASSISTANT -> assistantContentBytes += contentBytes;
                case TOOL -> toolResultContentBytes += contentBytes;
            }
            reasoningContentBytes += utf8Bytes(message.reasoningContent());
            for (AiProviderToolCall toolCall : message.toolCalls()) {
                toolCallArgumentBytes += utf8Bytes(toolCall.argumentsJson());
            }
        }

        long serializedRequestBytes = serializedBytes(request, mapper);
        long toolDefinitionsBytes = serializedBytes(request.tools(), mapper);
        return new Diagnostic(serializedRequestBytes, messageContentBytes, systemContentBytes,
                userContentBytes, assistantContentBytes, toolResultContentBytes,
                reasoningContentBytes, toolCallArgumentBytes, request.tools().size(), toolDefinitionsBytes);
    }

    private static long utf8Bytes(String value) {
        return value == null ? 0 : value.getBytes(StandardCharsets.UTF_8).length;
    }

    private static long serializedBytes(Object value, ObjectMapper mapper) {
        try {
            return mapper.writeValueAsBytes(value).length;
        } catch (JacksonException invalidRequest) {
            return -1;
        }
    }

    public enum Dimension {
        FITS,
        SERIALIZED_REQUEST_BYTES,
        MESSAGE_CONTENT_BYTES,
        TOOL_RESULT_BYTES,
        INVALID_REQUEST
    }

    /** `comparedBytes` and `limitBytes` describe the rejecting dimension; secondaryBytes is diagnostic only. */
    public record Check(Dimension dimension, long comparedBytes, long limitBytes, long secondaryBytes) {
        public boolean fits() {
            return dimension == Dimension.FITS;
        }
    }

    /** Diagnostic byte groups describe different request views and are not additive. */
    public record Diagnostic(long serializedRequestBytes, long messageContentBytes,
                             long systemContentBytes, long userContentBytes,
                             long assistantContentBytes, long toolResultContentBytes,
                             long reasoningContentBytes, long toolCallArgumentBytes, int toolDefinitionCount,
                             long toolDefinitionsBytes) { }
}
