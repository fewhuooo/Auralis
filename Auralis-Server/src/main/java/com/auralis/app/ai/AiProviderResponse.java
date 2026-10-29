package com.auralis.app.ai;

import com.auralis.app.ai.usage.AiTokenUsage;

import java.util.Set;
import java.util.List;

public record AiProviderResponse(String content, Long inputTokens, Long outputTokens, String finishReason,
                                AiProviderModelIdentity modelIdentity, List<AiProviderToolCall> toolCalls) {

    private static final int MAX_FINISH_REASON_CHARS = 64;
    private static final Set<String> ALLOWED_FINISH_REASONS = Set.of(
            "stop", "length", "tool_calls", "content_filter", "insufficient_system_resource", "aborted");

    public AiProviderResponse {
        finishReason = normalizeFinishReason(finishReason);
        modelIdentity = modelIdentity == null ? AiProviderModelIdentity.missing() : modelIdentity;
        toolCalls = toolCalls == null ? List.of() : List.copyOf(toolCalls);
    }

    public AiProviderResponse(String content, Long inputTokens, Long outputTokens, String finishReason,
                              AiProviderModelIdentity modelIdentity) {
        this(content, inputTokens, outputTokens, finishReason, modelIdentity, List.of());
    }

    public AiProviderResponse(String content, Long inputTokens, Long outputTokens, String finishReason) {
        this(content, inputTokens, outputTokens, finishReason, AiProviderModelIdentity.missing());
    }

    public AiProviderResponse(String content, long inputTokens, long outputTokens) {
        this(content, inputTokens, outputTokens, null);
    }

    public AiProviderResponse(String content, long inputTokens, long outputTokens, String finishReason) {
        this(content, Long.valueOf(inputTokens), Long.valueOf(outputTokens), finishReason,
                AiProviderModelIdentity.missing());
    }

    public AiProviderResponse(String content, long inputTokens, long outputTokens, String finishReason,
                              AiProviderModelIdentity modelIdentity) {
        this(content, Long.valueOf(inputTokens), Long.valueOf(outputTokens), finishReason, modelIdentity);
    }

    public AiTokenUsage usage() {
        return inputTokens == null && outputTokens == null ? null : new AiTokenUsage(inputTokens, outputTokens);
    }

    private static String normalizeFinishReason(String value) {
        if (value == null) return null;
        if (value.length() > MAX_FINISH_REASON_CHARS || value.indexOf('\n') >= 0 || value.indexOf('\r') >= 0) {
            return "other";
        }
        return ALLOWED_FINISH_REASONS.contains(value) ? value : "other";
    }
}
