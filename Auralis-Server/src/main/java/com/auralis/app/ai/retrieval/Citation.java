package com.auralis.app.ai.retrieval;

import java.util.UUID;

public record Citation(
        UUID sourceId,
        UUID chunkId,
        int ordinal,
        String title,
        String excerpt,
        double similarity) {
}
