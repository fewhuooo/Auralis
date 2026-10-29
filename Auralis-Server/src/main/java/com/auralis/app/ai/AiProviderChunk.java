package com.auralis.app.ai;

import com.auralis.app.ai.usage.AiTokenUsage;

public record AiProviderChunk(String content, boolean complete, AiTokenUsage usage,
                              AiProviderModelIdentity modelIdentity, String responseId, Integer toolIndex,
                              AiProviderToolCallDelta toolCallDelta, String finishReason, boolean terminal) {
    public AiProviderChunk {
        modelIdentity = modelIdentity == null ? AiProviderModelIdentity.missing() : modelIdentity;
    }

    public AiProviderChunk(String content, boolean complete, AiTokenUsage usage) {
        this(content, complete, usage, AiProviderModelIdentity.missing(), null, null, null, null, complete);
    }

    public AiProviderChunk(String content, boolean complete) {
        this(content, complete, null, AiProviderModelIdentity.missing(), null, null, null, null, complete);
    }

    public AiProviderChunk(String content, boolean complete, AiTokenUsage usage,
                           AiProviderModelIdentity modelIdentity) {
        this(content, complete, usage, modelIdentity, null, null, null, null, complete);
    }
}
