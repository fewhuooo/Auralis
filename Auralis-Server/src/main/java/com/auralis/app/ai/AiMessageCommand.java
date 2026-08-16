package com.auralis.app.ai;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.util.UUID;

public record AiMessageCommand(
        UUID conversationId,
        @NotBlank @Size(max = 12000) String content,
        AiProviderType provider,
        boolean retrievalEnabled,
        @Size(max = 32) Integer topK,
        @Size(max = 128) String clientRequestId) {
}
