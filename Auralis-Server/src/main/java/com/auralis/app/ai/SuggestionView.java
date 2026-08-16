package com.auralis.app.ai;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record SuggestionView(
        UUID id,
        SuggestionType type,
        String title,
        String body,
        List<CitationView> citations,
        Instant generatedAt) {

    public SuggestionView {
        citations = citations == null ? List.of() : List.copyOf(citations);
    }
}
