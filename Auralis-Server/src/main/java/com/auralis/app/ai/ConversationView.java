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
        Instant deletedAt) {

    public ConversationView {
        messages = messages == null ? List.of() : List.copyOf(messages);
    }
}
