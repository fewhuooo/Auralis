package com.auralis.app.ai;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.UUID;

public record ConversationCommand(
        @Size(max = 240) String title,
        @NotNull Long baseVersion,
        @Size(max = 128) String clientRequestId,
        ConversationPurpose purpose,
        UUID sourceId) {

    public ConversationCommand(String title, Long baseVersion) {
        this(title, baseVersion, null, ConversationPurpose.GENERAL, null);
    }

    public ConversationCommand(String title, Long baseVersion, String clientRequestId) {
        this(title, baseVersion, clientRequestId, ConversationPurpose.GENERAL, null);
    }

    public ConversationCommand(
            String title,
            Long baseVersion,
            String clientRequestId,
            ConversationPurpose purpose,
            UUID sourceId) {
        this.title = title;
        this.baseVersion = baseVersion;
        this.clientRequestId = clientRequestId;
        this.purpose = purpose == null ? ConversationPurpose.GENERAL : purpose;
        this.sourceId = sourceId;
    }
}
