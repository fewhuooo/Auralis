package com.auralis.app.ai.usage;

public record AiInvocationResult<T>(T value, AiProviderUsage usage) {
}
