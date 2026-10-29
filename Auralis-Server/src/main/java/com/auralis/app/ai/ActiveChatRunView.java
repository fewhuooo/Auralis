package com.auralis.app.ai;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** Public recovery snapshot for the conversation's currently reserved run. */
public record ActiveChatRunView(UUID runId, UUID userMessageId, UUID currentAttemptId,
        UUID currentReplyMessageId, String status, boolean executionActive,
        List<Map<String, Object>> publicSnapshot, List<Map<String, Object>> toolTrace,
        Instant updatedAt) {
    public ActiveChatRunView {
        publicSnapshot = publicSnapshot == null ? List.of() : List.copyOf(publicSnapshot);
        toolTrace = toolTrace == null ? List.of() : List.copyOf(toolTrace);
    }
}
