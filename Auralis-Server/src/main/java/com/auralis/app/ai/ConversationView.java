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
        Short chatProtocolVersion,
        boolean chatSupported,
        ActiveChatRunView activeRun,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) ChatConversationScopeState chatScopeState,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED, types = {"object", "null"}) ChatConversationScope chatScope) {

    public ConversationView {
        messages = messages == null ? List.of() : List.copyOf(messages);
    }
}
