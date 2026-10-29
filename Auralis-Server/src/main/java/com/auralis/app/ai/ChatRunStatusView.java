package com.auralis.app.ai;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import java.util.List;

public record ChatRunStatusView(int protocolVersion, UUID conversationId, UUID runId, String requestId,
        UUID userMessageId, UUID currentAttemptId, UUID currentReplyMessageId, String status,
        long fenceVersion, boolean executionActive, Map<String, Long> accountingSummary,
        List<Map<String, Object>> publicSnapshot, List<Map<String, Object>> toolTrace,
        Instant createdAt, Instant updatedAt, List<Attempt> attempts) {
    public ChatRunStatusView {
        accountingSummary = accountingSummary == null ? Map.of() : Map.copyOf(accountingSummary);
        attempts = attempts == null ? List.of() : List.copyOf(attempts);
        publicSnapshot = publicSnapshot == null ? List.of() : List.copyOf(publicSnapshot);
        toolTrace = toolTrace == null ? List.of() : List.copyOf(toolTrace);
    }
    public record Attempt(UUID attemptId, int attemptNo, String requestId, String status,
            UUID replyMessageId, Instant createdAt, Instant startedAt, Instant endedAt, String safeErrorCode) {}
}
