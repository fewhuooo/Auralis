package com.auralis.app.ai;

import com.auralis.app.ai.ingestion.TextChunk;
import com.auralis.app.source.ParsedDocumentValidator;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class SourceChunkProvenanceTests {

    @Test
    void mapsTrimmedLfJoinedTextToEveryIntersectingBlockAndPreservesOverlap() {
        var blocks = List.of(
                new ParsedDocumentValidator.ValidatedBlock(0, "page", "  ab", 1L, null, null),
                new ParsedDocumentValidator.ValidatedBlock(1, "paragraph", "cd  ", null, 7L, 12L));
        var chunks = List.of(
                new TextChunk(0, "ab\nc", 0, 4),
                new TextChunk(1, "cd", 3, 5));

        List<SourceChunkProvenance> mapped = SourceChunkProvenance.mapBlocksToChunks(
                blocks, chunks, UUID.randomUUID(), UUID.randomUUID(), "parser-v1");

        assertThat(mapped).hasSize(2);
        assertThat(mapped.get(0).locations()).containsExactly(
                new SourceChunkProvenance.Location(0, "page", 1L, null, null, 0, 2, 2, 4),
                new SourceChunkProvenance.Location(1, "paragraph", null, 7L, 12L, 3, 4, 0, 1));
        assertThat(mapped.get(1).locations()).containsExactly(
                new SourceChunkProvenance.Location(1, "paragraph", null, 7L, 12L, 3, 5, 0, 2));
        assertThat(SourceChunkProvenance.encode(mapped)).hasSize(2);
    }
}
