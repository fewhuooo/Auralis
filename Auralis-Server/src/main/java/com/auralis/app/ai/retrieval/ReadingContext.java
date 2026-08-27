package com.auralis.app.ai.retrieval;

import jakarta.validation.constraints.Size;
import jakarta.validation.constraints.NotNull;

import java.util.UUID;

/** Client-declared reading scope; the server remains the source of truth. */
public record ReadingContext(
        @NotNull UUID currentSourceId,
        @NotNull UUID subjectId,
        @NotNull RetrievalMode retrievalMode,
        @Size(max = 4000) String selectionText) {

    public ReadingContext {
        retrievalMode = retrievalMode == null ? RetrievalMode.AUTO : retrievalMode;
        if (selectionText != null) selectionText = selectionText.trim();
    }

    public enum RetrievalMode {
        AUTO
    }
}
