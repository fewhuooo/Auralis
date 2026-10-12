package com.auralis.app.ai;

import com.auralis.app.ai.usage.AiTokenUsage;

public record AiProviderChunk(String content, boolean complete, AiTokenUsage usage) {
    public AiProviderChunk(String content, boolean complete) {
        this(content, complete, null);
    }
}
