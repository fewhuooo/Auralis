package com.auralis.app.ai;

import java.time.Instant;
import java.util.UUID;
import java.util.List;
import java.util.Map;

public record MessageView(
        UUID id,
        long messageSequence,
        AiMessageRole role,
        AiMessageStatus status,
        String content,
        String model,
        String errorCode,
        Instant createdAt,
        List<Map<String, Object>> parts,
        Short chatProtocolVersion) {
    public MessageView(UUID id, long messageSequence, AiMessageRole role, AiMessageStatus status,
            String content, String model, String errorCode, Instant createdAt) {
        this(id, messageSequence, role, status, content, model, errorCode, createdAt, List.of(), null);
    }
    public MessageView {
        parts = parts == null ? List.of() : List.copyOf(parts);
    }
}
