package com.auralis.app.ai.internal.chat;

/** Lossless per-delta tool identity and argument progress for the active Chat stream. */
record ToolCallProgress(String responseId, int index, String callId,
                       String cumulativeName, String argumentsDelta) { }
