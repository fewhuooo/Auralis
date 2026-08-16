package com.auralis.app.ai;

import java.util.UUID;

public record CitationView(
        UUID sourceId,
        UUID chunkId,
        int ordinal,
        String title,
        String excerpt,
        double similarity) {
}
