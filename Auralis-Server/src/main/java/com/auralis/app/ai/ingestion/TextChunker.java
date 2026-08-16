package com.auralis.app.ai.ingestion;

import java.util.ArrayList;
import java.util.List;

public class TextChunker {

    private final int maxChars;
    private final int overlapChars;

    public TextChunker(int maxChars, int overlapChars) {
        if (maxChars <= 0 || overlapChars < 0 || overlapChars >= maxChars) {
            throw new IllegalArgumentException("overlapChars must be non-negative and smaller than maxChars");
        }
        this.maxChars = maxChars;
        this.overlapChars = overlapChars;
    }

    public List<TextChunk> chunk(String text) {
        if (text == null || text.isBlank()) {
            throw new IllegalArgumentException("Text must not be blank");
        }
        String normalized = text.trim();
        List<TextChunk> chunks = new ArrayList<>();
        int start = 0;
        int ordinal = 0;
        while (start < normalized.length()) {
            int end = Math.min(normalized.length(), start + maxChars);
            chunks.add(new TextChunk(ordinal++, normalized.substring(start, end), start, end));
            if (end == normalized.length()) {
                break;
            }
            start = end - overlapChars;
        }
        return List.copyOf(chunks);
    }
}
