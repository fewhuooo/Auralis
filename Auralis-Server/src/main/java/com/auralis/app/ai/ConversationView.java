package com.auralis.app.ai;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record ConversationView(
        UUID id,
        String title,
        List<MessageView> messages,
        Instant createdAt,
        Instant updatedAt,
        Instant deletedAt,
        long version,
        ConversationPurpose purpose,
        UUID sourceId) {

    public ConversationView(
            UUID id,
            String title,
            List<MessageView> messages,
            Instant createdAt,
            Instant updatedAt,
            Instant deletedAt) {
        this(id, title, messages, createdAt, updatedAt, deletedAt, 0L, ConversationPurpose.GENERAL, null);
    }

    public ConversationView(
            UUID id,
            String title,
            List<MessageView> messages,
            Instant createdAt,
            Instant updatedAt,
            Instant deletedAt,
            long version) {
        this(id, title, messages, createdAt, updatedAt, deletedAt, version, ConversationPurpose.GENERAL, null);
    }

    public ConversationView {
        messages = messages == null ? List.of() : List.copyOf(messages);
    }
}
