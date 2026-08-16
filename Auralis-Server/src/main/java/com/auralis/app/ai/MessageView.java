package com.auralis.app.ai;

import java.time.Instant;
import java.util.UUID;

public record MessageView(
        UUID id,
        long messageSequence,
        AiMessageRole role,
        AiMessageStatus status,
        String content,
        String model,
        String errorCode,
        Instant createdAt) {
}
