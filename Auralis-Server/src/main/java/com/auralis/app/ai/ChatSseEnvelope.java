package com.auralis.app.ai;

import java.util.Map;
import java.util.UUID;

public record ChatSseEnvelope(int protocolVersion, UUID conversationId, String requestId,
        UUID runId, UUID attemptId, UUID userMessageId, UUID replyMessageId,
        UUID iterationId, UUID blockId, long sequence, String event, Map<String, Object> payload) {
    public ChatSseEnvelope { payload = payload == null ? Map.of() : Map.copyOf(payload); }
}
