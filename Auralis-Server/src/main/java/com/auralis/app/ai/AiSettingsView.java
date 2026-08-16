package com.auralis.app.ai;

import java.time.Instant;
import java.util.UUID;

public record AiSettingsView(
        UUID id,
        AiProviderType provider,
        String baseUrl,
        String chatModel,
        String embeddingModel,
        boolean hasApiKey,
        Instant updatedAt) {
}
