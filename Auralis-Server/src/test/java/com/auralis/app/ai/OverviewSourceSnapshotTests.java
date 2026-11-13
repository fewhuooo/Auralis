package com.auralis.app.ai;

import com.auralis.app.ai.ingestion.TextChunk;
import com.auralis.app.ai.ingestion.TextChunker;
import com.auralis.app.ai.internal.persistence.SourceChunkEntity;
import com.auralis.app.source.ParsedDocumentValidator;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class OverviewSourceSnapshotTests {

    @Test
    void buildsUtf16SnapshotAndProjectsOverlappingChunksOnce() {
        UUID sourceId = UUID.randomUUID();
        UUID revision = UUID.randomUUID();
        UUID generation = UUID.randomUUID();
        String source = "A😀BCDE";
        var snapshot = OverviewSourceSnapshot.from(sourceId, revision, generation, List.of(
                chunk(sourceId, revision, generation, 0, source.substring(0, 5), 0, 5,
                        List.of(location(0, 5, "paragraph", null, null))),
                chunk(sourceId, revision, generation, 1, source.substring(3), 3, source.length(),
                        List.of(location(3, source.length(), "paragraph", null, null)))));

        assertThat(snapshot.text()).isEqualTo(source);
        assertThat(snapshot.text().length()).isEqualTo(7);
        assertThat(snapshot.readRange(1, 3)).isEqualTo("😀");
        assertThatThrownBy(() -> snapshot.readRange(1, 2))
                .hasMessageContaining("splits a Unicode character");
        assertThat(snapshot.project(1, 7)).containsExactly(
                new OverviewSourceSnapshot.SourceRangeRef(sourceId, revision,
                        snapshot.chunks().getFirst().chunkId(), generation, 1, 5),
                new OverviewSourceSnapshot.SourceRangeRef(sourceId, revision,
                        snapshot.chunks().get(1).chunkId(), generation, 5, 7));
    }

    @Test
    void projectsSourceOnceWhenIngestionCreatesFullyOverlappingChunks() {
        UUID sourceId = UUID.randomUUID();
        UUID revision = UUID.randomUUID();
        UUID generation = UUID.randomUUID();
        String text = "a".repeat(558) + "\n\n" + "b".repeat(89) + "\n" + "c".repeat(1150);
        var ingested = new TextChunker(1200, 120).chunk(text);
        var chunks = ingested.stream().map(item -> chunk(sourceId, revision, generation, item.ordinal(),
                item.content(), item.charStart(), item.charEnd(), List.of())).toList();
        assertThat(ingested.get(1)).isEqualTo(new TextChunk(1, text.substring(530, 560), 530, 560));

        var snapshot = OverviewSourceSnapshot.from(sourceId, revision, generation, chunks);
        assertThat(snapshot.text()).isEqualTo(text);
        assertThat(snapshot.chunks().get(1)).isEqualTo(new OverviewSourceSnapshot.ChunkRange(
                chunks.get(1).getId(), generation, 1, 530, 560, 650, 650));
        assertThat(snapshot.project(530, 660)).containsExactly(
                new OverviewSourceSnapshot.SourceRangeRef(sourceId, revision, chunks.getFirst().getId(),
                        generation, 530, 650),
                new OverviewSourceSnapshot.SourceRangeRef(sourceId, revision, snapshot.chunks().stream()
                        .filter(range -> range.ownedStart() == 650 && range.ownedEnd() > 650)
                        .findFirst().orElseThrow().chunkId(), generation, 650, 660));

        var inconsistent = new ArrayList<>(chunks);
        inconsistent.set(1, chunk(sourceId, revision, generation, 1,
                "X" + text.substring(531, 560), 530, 560, List.of()));
        assertThatThrownBy(() -> OverviewSourceSnapshot.from(sourceId, revision, generation, inconsistent))
                .hasMessageContaining("Overview source snapshot is stale");
    }

    @Test
    void followsExistingLfJoinedTrimmedUtf16Coordinates() {
        UUID sourceId = UUID.randomUUID();
        UUID revision = UUID.randomUUID();
        UUID generation = UUID.randomUUID();
        UUID parsedDocumentId = UUID.randomUUID();
        var blocks = List.of(
                new ParsedDocumentValidator.ValidatedBlock(0, "paragraph", "  A😀"),
                new ParsedDocumentValidator.ValidatedBlock(1, "paragraph", "BC  "));
        List<TextChunk> textChunks = List.of(new TextChunk(0, "A😀\nBC", 0, 6));
        List<SourceChunkProvenance> provenance = SourceChunkProvenance.mapBlocksToChunks(
                blocks, textChunks, revision, parsedDocumentId, "parser-v1");
        var snapshot = OverviewSourceSnapshot.from(sourceId, revision, generation, List.of(new SourceChunkEntity(
                UUID.randomUUID(), UUID.randomUUID(), sourceId, 0, textChunks.getFirst().content(), "hash",
                textChunks.getFirst().charStart(), textChunks.getFirst().charEnd(), "[]", generation, true,
                SourceChunkProvenance.encode(provenance).getFirst())));

        assertThat(snapshot.text()).isEqualTo("A😀\nBC");
        assertThat(snapshot.readRange(1, 3)).isEqualTo("😀");
        assertThat(snapshot.project(1, 3)).singleElement().satisfies(ref -> {
            assertThat(ref.charStart()).isEqualTo(1);
            assertThat(ref.charEnd()).isEqualTo(3);
        });
    }

    @Test
    void rejectsOverlapThatDoesNotMatchAndMismatchedGenerationOrRevision() {
        UUID sourceId = UUID.randomUUID();
        UUID revision = UUID.randomUUID();
        UUID generation = UUID.randomUUID();
        assertThatThrownBy(() -> OverviewSourceSnapshot.from(sourceId, revision, generation, List.of(
                chunk(sourceId, revision, generation, 0, "ABCD", 0, 4, List.of(location(0, 4, "paragraph", null, null))),
                chunk(sourceId, revision, generation, 1, "XDEF", 2, 6, List.of(location(2, 6, "paragraph", null, null))))))
                .hasMessageContaining("Overview source snapshot is stale");
        assertThatThrownBy(() -> OverviewSourceSnapshot.from(sourceId, revision, generation, List.of(
                chunk(sourceId, revision, UUID.randomUUID(), 0, "AB", 0, 2, List.of(location(0, 2, "paragraph", null, null))))))
                .hasMessageContaining("Overview source snapshot is stale");
        assertThatThrownBy(() -> OverviewSourceSnapshot.from(sourceId, UUID.randomUUID(), generation, List.of(
                chunk(sourceId, revision, generation, 0, "AB", 0, 2, List.of(location(0, 2, "paragraph", null, null))))))
                .hasMessageContaining("Overview source snapshot is stale");
    }

    private static SourceChunkEntity chunk(UUID sourceId, UUID revision, UUID generation, int ordinal,
                                           String content, int start, int end,
                                           List<SourceChunkProvenance.Location> locations) {
        String provenance = SourceChunkProvenance.encode(List.of(new SourceChunkProvenance(
                SourceChunkProvenance.SCHEMA_VERSION, revision, UUID.fromString("00000000-0000-0000-0000-000000000001"),
                "parser-v1", locations))).getFirst();
        return new SourceChunkEntity(UUID.randomUUID(), UUID.randomUUID(), sourceId, ordinal, content,
                "hash", start, end, "[]", generation, true, provenance);
    }

    private static SourceChunkProvenance.Location location(int start, int end, String kind,
                                                            Long pageNumber, Long anchorIndex) {
        return new SourceChunkProvenance.Location(start, kind, pageNumber, anchorIndex, null,
                start, end, 0, end - start);
    }
}
