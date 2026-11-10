package com.auralis.app.ai.usage;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Positive;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

@Validated
@ConfigurationProperties(prefix = "auralis.ai.chat-agent")
public record ChatAgentProperties(
        @Min(0) int maxModelCalls,
        @Min(0) int maxEmbeddingCalls,
        @Min(1) @Max(8) int maxIterations,
        @Min(1) @Max(12) int maxToolCalls,
        @Positive long maxToolResultUtf8Bytes,
        @Positive long maxSerializedRequestUtf8Bytes,
        @Min(1) @Max(300) long attemptDeadlineSeconds) {

    public ChatAgentProperties {
        if (maxModelCalls < 0 || maxEmbeddingCalls < 0
                || maxIterations < 1 || maxIterations > 8
                || maxToolCalls < 1 || maxToolCalls > 12
                || maxToolResultUtf8Bytes < 1 || maxSerializedRequestUtf8Bytes < 1
                || attemptDeadlineSeconds < 1 || attemptDeadlineSeconds > 300) {
            throw new IllegalArgumentException("Chat Agent limits are outside the supported bounds");
        }
    }

    public static ChatAgentProperties defaults() {
        return new ChatAgentProperties(0, 0, 8, 12, 65_536, 524_288, 300);
    }
}
