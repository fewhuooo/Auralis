package com.auralis.app.ai.ingestion;

public record TextChunk(int ordinal, String content, int charStart, int charEnd) {
}
