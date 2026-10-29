package com.auralis.app.ai;

/** One streamed tool-call fragment, keyed by provider response ID and choice-local index. */
public record AiProviderToolCallDelta(String id, String name, String argumentsFragment) { }
