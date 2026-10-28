package com.auralis.app.ai;

import com.auralis.app.ai.OverviewDtos.OverviewChapter;
import com.auralis.app.ai.OverviewDtos.OverviewResponse;
import com.auralis.app.ai.OverviewDtos.OverviewSection;
import com.auralis.app.ai.OverviewIdentityDtos.OutlineIdentityInput;
import com.auralis.app.ai.OverviewIdentityDtos.OutlineIdentityNodeInput;
import com.auralis.app.ai.OverviewIdentityDtos.OutlineProvenanceInput;
import com.auralis.app.ai.OverviewIdentityDtos.OutlineProvenanceSectionInput;
import com.auralis.app.ai.OverviewIdentityDtos.OutlineProvenanceSourceRefInput;
import com.auralis.app.ai.OverviewIdentityDtos.ProvenanceLocationView;
import com.auralis.app.ai.OverviewIdentityDtos.ProvenancePrecision;
import com.auralis.app.ai.ingestion.TextChunk;
import com.auralis.app.ai.internal.persistence.SourceChunkEntity;
import com.auralis.app.ai.internal.persistence.SourceChunkRepository;
import com.auralis.app.shared.error.DomainException;
import com.auralis.app.shared.config.AuralisProperties;
import com.auralis.app.source.ParsedDocumentValidator;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.ObjectMapper;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class OverviewIdentityServiceTests {

    private final OverviewIdentityService service = new OverviewIdentityService(
            mock(SourceChunkRepository.class), new ObjectMapper());

    @Test
    void assignsServerIdsAndPreservesVersionsAcrossReorderAndRenames() {
        UUID sourceId = UUID.randomUUID();
        UUID revision = UUID.randomUUID();
        Map<UUID, UUID> sources = Map.of(sourceId, revision);
        OverviewResponse original = result(sourceId, "Alpha", "Beta");

        var first = service.bind(UUID.randomUUID(), original, identity(original, null), null, sources, null).outlineIdentity();
        assertThat(first.nodes()).hasSize(3);
        assertThat(first.nodes()).allSatisfy(node -> assertThat(node.contentVersion()).isEqualTo(1));
        assertThat(first.nodes().get(1).sourceRefs()).singleElement()
                .satisfies(ref -> assertThat(ref.precision()).isEqualTo(ProvenancePrecision.SOURCE));

        OverviewResponse reordered = result(sourceId, "Beta", "Alpha");
        var reorderedIdentity = service.bind(UUID.randomUUID(), reordered, identityForReorder(first), null,
                sources, json(first)).outlineIdentity();
        assertThat(reorderedIdentity.nodes().get(0).nodeId()).isEqualTo(first.nodes().get(0).nodeId());
        assertThat(reorderedIdentity.nodes().get(0).contentVersion()).isEqualTo(1);
        assertThat(reorderedIdentity.nodes().get(1).nodeId()).isEqualTo(first.nodes().get(2).nodeId());
        assertThat(reorderedIdentity.nodes().get(1).contentVersion()).isEqualTo(1);
        assertThat(reorderedIdentity.nodes().get(2).nodeId()).isEqualTo(first.nodes().get(1).nodeId());
        assertThat(reorderedIdentity.nodes().get(2).contentVersion()).isEqualTo(1);

        OverviewResponse renamed = result(sourceId, "Beta renamed", "Alpha");
        var renamedIdentity = service.bind(UUID.randomUUID(), renamed, identityForReorder(first), null,
                sources, json(first)).outlineIdentity();
        assertThat(renamedIdentity.nodes().get(0).nodeId()).isEqualTo(first.nodes().get(0).nodeId());
        assertThat(renamedIdentity.nodes().get(0).contentVersion()).isEqualTo(2);
        assertThat(renamedIdentity.nodes().get(1).contentVersion()).isEqualTo(2);
        assertThat(renamedIdentity.nodes().get(2).contentVersion()).isEqualTo(1);
    }

    @Test
    void rejectsAnUnknownClientSuppliedNodeId() {
        UUID sourceId = UUID.randomUUID();
        UUID revision = UUID.randomUUID();
        OverviewResponse result = result(sourceId, "Alpha");
        OutlineIdentityInput unknown = new OutlineIdentityInput(1, List.of(
                new OutlineIdentityNodeInput(List.of(0), UUID.randomUUID()),
                new OutlineIdentityNodeInput(List.of(0, 0), null)));

        assertThatThrownBy(() -> service.bind(UUID.randomUUID(), result, unknown, null,
                Map.of(sourceId, revision), null))
                .isInstanceOf(DomainException.class)
                .extracting(error -> ((DomainException) error).code())
                .isEqualTo("VALIDATION_FAILED");
    }

    @Test
    void appliesConfiguredIdentityDimensionsAndSerializedSize() {
        UUID sourceId = UUID.randomUUID();
        UUID revision = UUID.randomUUID();
        OverviewResponse result = result(sourceId, "Alpha", "Beta");
        OverviewIdentityService sectionLimited = new OverviewIdentityService(mock(SourceChunkRepository.class),
                new ObjectMapper(), overviewLimits(1, 0));

        assertThatThrownBy(() -> sectionLimited.bind(UUID.randomUUID(), result, identity(result, null), null,
                Map.of(sourceId, revision), null))
                .isInstanceOf(DomainException.class)
                .extracting(error -> ((DomainException) error).code())
                .isEqualTo("VALIDATION_FAILED");

        OverviewIdentityService sizeLimited = new OverviewIdentityService(mock(SourceChunkRepository.class),
                new ObjectMapper(), overviewLimits(0, 2));
        assertThatThrownBy(() -> sizeLimited.bind(UUID.randomUUID(), result(sourceId, "Alpha"),
                identity(result(sourceId, "Alpha"), null), null, Map.of(sourceId, revision), null))
                .isInstanceOf(DomainException.class)
                .extracting(error -> ((DomainException) error).code())
                .isEqualTo("VALIDATION_FAILED");
    }

    @Test
    void clipsExactSourceRangesToPersistedParsedDocumentBlocks() {
        UUID userId = UUID.randomUUID();
        UUID sourceId = UUID.randomUUID();
        UUID revision = UUID.randomUUID();
        UUID parsedDocumentId = UUID.randomUUID();
        UUID generation = UUID.randomUUID();
        UUID chunkId = UUID.randomUUID();
        List<SourceChunkProvenance> mapped = SourceChunkProvenance.mapBlocksToChunks(List.of(
                        new ParsedDocumentValidator.ValidatedBlock(0, "page", "hello", 1L, null, null),
                        new ParsedDocumentValidator.ValidatedBlock(1, "page", "world", 2L, null, null)),
                List.of(new TextChunk(0, "hello\nworld", 0, 11)), revision, parsedDocumentId, "pdfjs");
        String provenanceJson = SourceChunkProvenance.encode(mapped).getFirst();
        SourceChunkEntity chunk = new SourceChunkEntity(chunkId, userId, sourceId, 0, "hello\nworld",
                "a".repeat(64), 0, 11, "[]", generation, true, provenanceJson);
        SourceChunkRepository chunks = mock(SourceChunkRepository.class);
        when(chunks.findById(chunkId)).thenReturn(Optional.of(chunk));
        OverviewIdentityService identityService = new OverviewIdentityService(chunks, new ObjectMapper());
        OverviewResponse result = result(sourceId, "Section");
        OutlineProvenanceInput provenance = new OutlineProvenanceInput(1, List.of(
                new OutlineProvenanceSectionInput(List.of(0, 0), List.of(
                        new OutlineProvenanceSourceRefInput(sourceId, revision, chunkId, generation, 2, 8)))));

        var bound = identityService.bind(userId, result, identity(result, null), provenance,
                Map.of(sourceId, revision), null).outlineIdentity();

        var ref = bound.nodes().get(1).sourceRefs().getFirst();
        assertThat(ref.precision()).isEqualTo(ProvenancePrecision.BLOCK);
        assertThat(ref.contentHash()).isEqualTo("a".repeat(64));
        assertThat(ref.parsedDocumentId()).isEqualTo(parsedDocumentId);
        assertThat(ref.parserId()).isEqualTo("pdfjs");
        assertThat(ref.locations()).containsExactly(
                new ProvenanceLocationView(0, 1L, null, null, 2, 5, 2, 5),
                new ProvenanceLocationView(1, 2L, null, null, 6, 8, 0, 2));
    }

    private OverviewResponse result(UUID sourceId, String... titles) {
        List<OverviewSection> sections = java.util.Arrays.stream(titles)
                .map(title -> new OverviewSection(title, "summary " + title, List.of(sourceId.toString()), null))
                .toList();
        return new OverviewResponse(1, "Overview", List.of(new OverviewChapter("Chapter", sections)), null);
    }

    private OutlineIdentityInput identity(OverviewResponse result, UUID[] ids) {
        var nodes = new java.util.ArrayList<OutlineIdentityNodeInput>();
        nodes.add(new OutlineIdentityNodeInput(List.of(0), ids == null ? null : ids[0]));
        for (int index = 0; index < result.outline().getFirst().sections().size(); index++) {
            nodes.add(new OutlineIdentityNodeInput(List.of(0, index), ids == null ? null : ids[index + 1]));
        }
        return new OutlineIdentityInput(1, nodes);
    }

    private OutlineIdentityInput identityForReorder(
            com.auralis.app.ai.OverviewIdentityDtos.OutlineIdentityView first) {
        return new OutlineIdentityInput(1, List.of(
                new OutlineIdentityNodeInput(List.of(0), first.nodes().get(0).nodeId()),
                new OutlineIdentityNodeInput(List.of(0, 0), first.nodes().get(2).nodeId()),
                new OutlineIdentityNodeInput(List.of(0, 1), first.nodes().get(1).nodeId())));
    }

    private String json(Object value) {
        try {
            return new ObjectMapper().writeValueAsString(value);
        } catch (Exception exception) {
            throw new AssertionError(exception);
        }
    }

    private AuralisProperties.OverviewLimits overviewLimits(int maxSections, long maxIdentityChars) {
        return new AuralisProperties.OverviewLimits(0, 0, 0, 0, 0,
                0, 0, 0, 0, 0,
                maxSections, 0, 0, 0, 0,
                0, 0, 0, 0, 0,
                0, 0, 0, 0, maxIdentityChars, 0);
    }
}
