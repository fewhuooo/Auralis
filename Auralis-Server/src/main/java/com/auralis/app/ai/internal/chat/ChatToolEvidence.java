package com.auralis.app.ai.internal.chat;

import java.util.List;
import java.util.Objects;

/** Private, attempt-scoped evidence needed to rebuild a future model context. */
public record ChatToolEvidence(
        String iterationId,
        int iterationOrder,
        int callOrder,
        String toolCallId,
        String toolName,
        String argumentsJson,
        String resultJson,
        String status,
        List<SourceRevision> sourceRevisions,
        String reasoningContent) {

    public ChatToolEvidence(String iterationId, int iterationOrder, int callOrder, String toolCallId,
                            String toolName, String argumentsJson, String resultJson, String status,
                            List<SourceRevision> sourceRevisions) {
        this(iterationId, iterationOrder, callOrder, toolCallId, toolName, argumentsJson, resultJson,
                status, sourceRevisions, null);
    }

    public ChatToolEvidence {
        if (iterationId == null || iterationId.isBlank() || iterationOrder < 0 || callOrder < 0
                || toolCallId == null || toolCallId.isBlank() || toolName == null || toolName.isBlank()
                || argumentsJson == null || resultJson == null
                || !Objects.equals(status, "COMPLETED") && !Objects.equals(status, "ERROR")) {
            throw new IllegalArgumentException("Invalid private Chat tool evidence");
        }
        sourceRevisions = sourceRevisions == null ? List.of() : List.copyOf(sourceRevisions);
    }

    public record SourceRevision(String sourceId, String revision) {
        public SourceRevision {
            if (sourceId == null || sourceId.isBlank() || revision == null || revision.isBlank()) {
                throw new IllegalArgumentException("Invalid Chat evidence source revision");
            }
        }
    }
}
