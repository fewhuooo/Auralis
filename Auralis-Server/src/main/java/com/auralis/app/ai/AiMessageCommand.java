package com.auralis.app.ai;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;

import java.util.UUID;

public record AiMessageCommand(
        UUID conversationId,
        @NotBlank @Size(max = 12000) String content,
        AiProviderType provider,
        boolean retrievalEnabled,
        @Min(1) @Max(32) Integer topK,
        @Size(max = 128) String clientRequestId) {
}
