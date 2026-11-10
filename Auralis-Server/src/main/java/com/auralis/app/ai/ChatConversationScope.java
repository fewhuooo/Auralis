package com.auralis.app.ai;

import com.auralis.app.ai.retrieval.ReadingContext;

import java.util.List;
import java.util.UUID;
import io.swagger.v3.oas.annotations.media.Schema;

public record ChatConversationScope(
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED, types = {"string", "null"}) UUID currentSourceId,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED, types = {"string", "null"}) UUID subjectId,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) ReadingContext.RetrievalMode retrievalMode,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) List<UUID> sourceIds) {

    public ChatConversationScope {
        retrievalMode = retrievalMode == null ? ReadingContext.RetrievalMode.AUTO : retrievalMode;
        sourceIds = sourceIds == null ? List.of() : sourceIds.stream().sorted().toList();
    }

    public static ChatConversationScope from(ReadingContext context) {
        return context == null ? null : new ChatConversationScope(
                context.currentSourceId(), context.subjectId(), context.retrievalMode(), context.sourceIds());
    }

    public ReadingContext toReadingContext() {
        return new ReadingContext(currentSourceId, subjectId, retrievalMode, sourceIds, null);
    }
}
