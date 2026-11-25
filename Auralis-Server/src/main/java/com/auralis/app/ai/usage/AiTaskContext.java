package com.auralis.app.ai.usage;

import java.nio.charset.StandardCharsets;
import java.util.Objects;
import java.util.UUID;

public record AiTaskContext(UUID userId, AiFeature feature, String taskKey, UUID budgetTaskId,
                            AiOperationKind operationKind) {

    public AiTaskContext(UUID userId, AiFeature feature, String taskKey, UUID budgetTaskId) {
        this(userId, feature, taskKey, budgetTaskId, defaultKind(feature));
    }

    public AiTaskContext(UUID userId, AiFeature feature, String taskKey) {
        this(userId, feature, taskKey, null, defaultKind(feature));
    }

    public AiTaskContext {
        Objects.requireNonNull(userId, "userId");
        Objects.requireNonNull(feature, "feature");
        Objects.requireNonNull(operationKind, "operationKind");
        if (taskKey == null || taskKey.isBlank() || taskKey.length() > 512) {
            throw new IllegalArgumentException("taskKey must contain 1 to 512 characters");
        }
    }

    /** Maps a raw Overview budget identity to the stable task identity used by the usage ledger. */
    public static UUID overviewLedgerTaskId(UUID userId, AiFeature feature, UUID budgetTaskId) {
        Objects.requireNonNull(userId, "userId");
        Objects.requireNonNull(feature, "feature");
        Objects.requireNonNull(budgetTaskId, "budgetTaskId");
        if (feature != AiFeature.SOURCE_OVERVIEW && feature != AiFeature.SUBJECT_OVERVIEW) {
            throw new IllegalArgumentException("An Overview feature is required");
        }
        return UUID.nameUUIDFromBytes((userId + ":" + feature + ":" + budgetTaskId).getBytes(StandardCharsets.UTF_8));
    }

    /** Stable ledger identity shared by every retry attempt of one Chat Agent logical run. */
    public static UUID chatAgentLedgerTaskId(UUID userId, UUID runId) {
        Objects.requireNonNull(userId, "userId");
        Objects.requireNonNull(runId, "runId");
        return UUID.nameUUIDFromBytes(("auralis:chat-agent:" + userId + ":" + runId)
                .getBytes(StandardCharsets.UTF_8));
    }

    private static AiOperationKind defaultKind(AiFeature feature) {
        if (feature == null) return null;
        return switch (feature) {
            case CHAT -> AiOperationKind.CHAT_AGENT_TURN;
            case SOURCE_OVERVIEW -> AiOperationKind.SOURCE_OVERVIEW;
            case SUBJECT_OVERVIEW -> AiOperationKind.SUBJECT_OVERVIEW;
            case INGESTION -> AiOperationKind.INGESTION_EMBEDDING;
            case PROVIDER_SETUP -> AiOperationKind.PROVIDER_SETUP;
        };
    }
}
