package com.auralis.app.ai;

import com.auralis.app.ai.usage.AiTokenUsage;

public record AiProviderChunk(String content, boolean complete, AiTokenUsage usage,
                              AiProviderModelIdentity modelIdentity) {
    public AiProviderChunk {
        modelIdentity = modelIdentity == null ? AiProviderModelIdentity.missing() : modelIdentity;
    }

    public AiProviderChunk(String content, boolean complete, AiTokenUsage usage) {
        this(content, complete, usage, AiProviderModelIdentity.missing());
    }

    public AiProviderChunk(String content, boolean complete) {
        this(content, complete, null, AiProviderModelIdentity.missing());
    }
}
