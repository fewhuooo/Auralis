package com.auralis.app.ai;

import java.util.Objects;

/** A complete assistant tool call; argumentsJson is validated as a strict JSON object before execution. */
public record AiProviderToolCall(String id, String name, String argumentsJson) {
    public AiProviderToolCall {
        if (id == null || id.isBlank() || id.length() > 256) {
            throw new IllegalArgumentException("Tool call id must contain 1 to 256 characters");
        }
        if (name == null || name.isBlank() || name.length() > 128) {
            throw new IllegalArgumentException("Tool name must contain 1 to 128 characters");
        }
        Objects.requireNonNull(argumentsJson, "argumentsJson");
        argumentsJson = new String(argumentsJson);
    }
}
