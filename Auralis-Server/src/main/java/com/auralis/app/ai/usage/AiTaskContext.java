package com.auralis.app.ai.usage;

import java.util.Objects;
import java.util.UUID;

public record AiTaskContext(UUID userId, AiFeature feature, String taskKey) {

    public AiTaskContext {
        Objects.requireNonNull(userId, "userId");
        Objects.requireNonNull(feature, "feature");
        if (taskKey == null || taskKey.isBlank() || taskKey.length() > 512) {
            throw new IllegalArgumentException("taskKey must contain 1 to 512 characters");
        }
    }
}
