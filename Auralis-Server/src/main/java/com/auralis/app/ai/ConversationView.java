package com.auralis.app.ai;

import java.time.Instant;
import java.util.List;
import java.util.UUID;
import io.swagger.v3.oas.annotations.media.Schema;

public record ConversationView(
        UUID id,
        String title,
        List<MessageView> messages,
        Instant createdAt,
        Instant updatedAt,
        Instant deletedAt,
        long version,
        ConversationPurpose purpose,
        UUID sourceId,
        Short chatProtocolVersion,
        boolean chatSupported,
        ActiveChatRunView activeRun,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) ChatConversationScopeState chatScopeState,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED, types = {"object", "null"}) ChatConversationScope chatScope) {

    public ConversationView(
            UUID id,
            String title,
            List<MessageView> messages,
            Instant createdAt,
            Instant updatedAt,
            Instant deletedAt) {
        this(id, title, messages, createdAt, updatedAt, deletedAt, 0L, ConversationPurpose.GENERAL, null, null, false, null,
                ChatConversationScopeState.LEGACY, null);
    }

    public ConversationView(
            UUID id,
            String title,
            List<MessageView> messages,
            Instant createdAt,
            Instant updatedAt,
            Instant deletedAt,
            long version) {
        this(id, title, messages, createdAt, updatedAt, deletedAt, version, ConversationPurpose.GENERAL, null, null, false, null,
                ChatConversationScopeState.LEGACY, null);
    }

    public ConversationView(UUID id, String title, List<MessageView> messages, Instant createdAt,
            Instant updatedAt, Instant deletedAt, long version, ConversationPurpose purpose, UUID sourceId) {
        this(id, title, messages, createdAt, updatedAt, deletedAt, version, purpose, sourceId, null, false, null,
                ChatConversationScopeState.LEGACY, null);
    }

    public ConversationView {
        messages = messages == null ? List.of() : List.copyOf(messages);
    }
}
