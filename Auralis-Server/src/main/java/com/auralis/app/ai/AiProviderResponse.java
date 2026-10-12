package com.auralis.app.ai;

import com.auralis.app.ai.usage.AiTokenUsage;

import java.util.Set;

public record AiProviderResponse(String content, Long inputTokens, Long outputTokens, String finishReason) {

    private static final int MAX_FINISH_REASON_CHARS = 64;
    private static final Set<String> ALLOWED_FINISH_REASONS = Set.of(
            "stop", "length", "tool_calls", "content_filter", "insufficient_system_resource", "aborted");

    public AiProviderResponse {
        finishReason = normalizeFinishReason(finishReason);
    }

    public AiProviderResponse(String content, long inputTokens, long outputTokens) {
        this(content, inputTokens, outputTokens, null);
    }

    public AiProviderResponse(String content, long inputTokens, long outputTokens, String finishReason) {
        this(content, Long.valueOf(inputTokens), Long.valueOf(outputTokens), finishReason);
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
