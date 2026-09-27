package com.auralis.app.ai;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record AiSettingsCommand(
        @NotNull AiProviderType provider,
        @Size(max = 2048) String baseUrl,
        @Size(max = 240) String chatModel,
        @Size(max = 1000) String apiKey) {
}
