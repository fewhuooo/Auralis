package com.auralis.app.ai;

import java.util.Objects;

/** Immutable OpenAI-compatible tool declaration; schemaJson is parsed strictly at the transport boundary. */
public record AiProviderToolDefinition(String name, String description, String schemaJson) {
    public AiProviderToolDefinition {
        if (name == null || name.isBlank() || name.length() > 128) {
            throw new IllegalArgumentException("Tool name must contain 1 to 128 characters");
        }
        Objects.requireNonNull(schemaJson, "schemaJson");
        schemaJson = new String(schemaJson);
    }
}
