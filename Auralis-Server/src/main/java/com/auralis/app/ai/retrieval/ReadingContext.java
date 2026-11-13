package com.auralis.app.ai.retrieval;

import jakarta.validation.constraints.Size;
import jakarta.validation.constraints.NotNull;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.UUID;

/** Client-declared reading scope; the server remains the source of truth. */
public record ReadingContext(
        UUID currentSourceId,
        @NotNull UUID subjectId,
        @NotNull RetrievalMode retrievalMode,
        @Size(max = 100) List<UUID> sourceIds) {

    public ReadingContext {
        retrievalMode = retrievalMode == null ? RetrievalMode.AUTO : retrievalMode;
        sourceIds = sourceIds == null
                ? List.of()
                : Collections.unmodifiableList(new ArrayList<>(sourceIds));
    }

    public enum RetrievalMode {
        AUTO,
        SELECTED_SOURCES,
        SUBJECT
    }
}
