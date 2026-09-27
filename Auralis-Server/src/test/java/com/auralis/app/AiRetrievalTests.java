package com.auralis.app;

import com.auralis.app.ai.retrieval.Citation;
import com.auralis.app.ai.retrieval.EmbeddingVectorCodec;
import com.auralis.app.ai.retrieval.PgVectorRetrievalRepository;
import com.auralis.app.ai.retrieval.RetrievalService;
import com.auralis.app.ai.retrieval.ReadingContext;
import com.auralis.app.ai.internal.persistence.SourceChunkEntity;
import com.auralis.app.ai.internal.persistence.SourceChunkRepository;
import com.auralis.app.source.SourceIngestionStatus;
import com.auralis.app.source.SourceType;
import com.auralis.app.source.SourceView;
import com.auralis.app.source.SourceService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import com.auralis.app.subject.SubjectService;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AiRetrievalTests {

    @Mock
    private SourceChunkRepository chunkRepository;

    @Mock
    private SourceService sourceService;

    @Mock
    private PgVectorRetrievalRepository pgVectorRepository;

    @Mock
    private SubjectService subjectService;

    @InjectMocks
    private RetrievalService retrievalService;

    @Test
    void retrievalIsUserScopedAndReturnsTopKSourceCitations() {
        UUID userId = UUID.randomUUID();
        UUID sourceId = UUID.randomUUID();
        UUID chunkId = UUID.randomUUID();
        List<Double> vector = vector(1.0, 0.0);
        SourceChunkEntity chunk = new SourceChunkEntity(
                chunkId, userId, sourceId, 0, "matching excerpt", "hash", 0, 16,
                new EmbeddingVectorCodec().encode(vector), UUID.randomUUID(), true);
        when(pgVectorRepository.search(userId, vector, 3)).thenReturn(Optional.empty());
        when(chunkRepository.findAllByUserIdAndActiveTrue(userId)).thenReturn(List.of(chunk));
        when(sourceService.findActiveViewsByIds(userId, Set.of(sourceId))).thenReturn(List.of(new SourceView(
                sourceId, UUID.randomUUID(), SourceType.TEXT, "My source", null, null, null, null,
                SourceIngestionStatus.READY, null, null, 1, Instant.now(), Instant.now(), null)));

        List<Citation> citations = retrievalService.retrieve(userId, vector, 3);

        assertThat(citations).hasSize(1);
        assertThat(citations.get(0).sourceId()).isEqualTo(sourceId);
        assertThat(citations.get(0).title()).isEqualTo("My source");
        assertThat(citations.get(0).excerpt()).isEqualTo("matching excerpt");
        assertThat(citations.get(0).similarity()).isEqualTo(1.0);
        verify(chunkRepository).findAllByUserIdAndActiveTrue(eq(userId));
    }

    @Test
    void postgresRetrievalUsesDatabaseSimilarityAndSkipsJavaScan() {
        UUID userId = UUID.randomUUID();
        UUID sourceId = UUID.randomUUID();
        UUID chunkId = UUID.randomUUID();
        List<Double> vector = vector(1.0, 0.0);
        when(pgVectorRepository.search(userId, vector, 3)).thenReturn(Optional.of(List.of(
                new PgVectorRetrievalRepository.PgVectorChunk(
                        chunkId, sourceId, 0, "database excerpt", 0, 16, 0.98))));
        when(sourceService.findActiveViewsByIds(userId, Set.of(sourceId))).thenReturn(List.of(new SourceView(
                sourceId, UUID.randomUUID(), SourceType.TEXT, "Database source", null, null, null, null,
                SourceIngestionStatus.READY, null, null, 1, Instant.now(), Instant.now(), null)));

        List<Citation> citations = retrievalService.retrieve(userId, vector, 3);

        assertThat(citations).singleElement().satisfies(citation -> {
            assertThat(citation.chunkId()).isEqualTo(chunkId);
            assertThat(citation.similarity()).isEqualTo(0.98);
        });
        verify(chunkRepository, never()).findAllByUserIdAndActiveTrue(userId);
    }

    @Test
    void deletedSourceChunksDoNotConsumeFallbackTopK() {
        UUID userId = UUID.randomUUID();
        UUID deletedSourceId = UUID.randomUUID();
        UUID activeSourceId = UUID.randomUUID();
        List<Double> query = vector(1.0, 0.0);
        SourceChunkEntity deletedTopHit = new SourceChunkEntity(
                UUID.randomUUID(), userId, deletedSourceId, 0, "deleted hit", "deleted-hash", 0, 11,
                new EmbeddingVectorCodec().encode(vector(1.0, 0.0)), UUID.randomUUID(), true);
        SourceChunkEntity activeLowerHit = new SourceChunkEntity(
                UUID.randomUUID(), userId, activeSourceId, 0, "active hit", "active-hash", 0, 10,
                new EmbeddingVectorCodec().encode(vector(0.8, 0.6)), UUID.randomUUID(), true);
        when(pgVectorRepository.search(userId, query, 1)).thenReturn(Optional.empty());
        when(chunkRepository.findAllByUserIdAndActiveTrue(userId))
                .thenReturn(List.of(deletedTopHit, activeLowerHit));
        when(sourceService.findActiveViewsByIds(eq(userId), org.mockito.ArgumentMatchers.anySet()))
                .thenReturn(List.of(new SourceView(
                activeSourceId, UUID.randomUUID(), SourceType.TEXT, "Active source", null, null, null, null,
                SourceIngestionStatus.READY, null, null, 1, Instant.now(), Instant.now(), null)));

        List<Citation> citations = retrievalService.retrieve(userId, query, 1);

        assertThat(citations).singleElement().satisfies(citation -> {
            assertThat(citation.sourceId()).isEqualTo(activeSourceId);
            assertThat(citation.excerpt()).isEqualTo("active hit");
        });
        verify(sourceService).findActiveViewsByIds(eq(userId), org.mockito.ArgumentMatchers.anySet());
        verify(sourceService, never()).get(userId, deletedSourceId);
        verify(sourceService, never()).get(userId, activeSourceId);
    }

    @Test
    void rejectsInvalidDimensionsAndTopK() {
        assertThatThrownBy(() -> retrievalService.retrieve(UUID.randomUUID(), List.of(1.0), 3))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> retrievalService.retrieve(UUID.randomUUID(), vector(1.0, 0.0), 0))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void readingContextValidatesReadySourceAndFiltersOnlyCurrentSource() {
        UUID userId = UUID.randomUUID();
        UUID sourceId = UUID.randomUUID();
        UUID otherSourceId = UUID.randomUUID();
        UUID subjectId = UUID.randomUUID();
        List<Double> vector = vector(1.0, 0.0);
        SourceChunkEntity current = new SourceChunkEntity(
                UUID.randomUUID(), userId, sourceId, 0, "current", "hash-1", 0, 7,
                new EmbeddingVectorCodec().encode(vector), UUID.randomUUID(), true);
        SourceChunkEntity other = new SourceChunkEntity(
                UUID.randomUUID(), userId, otherSourceId, 0, "other", "hash-2", 0, 5,
                new EmbeddingVectorCodec().encode(vector), UUID.randomUUID(), true);
        when(pgVectorRepository.search(userId, sourceId, vector, 3)).thenReturn(Optional.empty());
        when(chunkRepository.findAllByUserIdAndActiveTrue(userId)).thenReturn(List.of(current, other));
        when(sourceService.get(userId, sourceId)).thenReturn(new SourceView(
                sourceId, subjectId, SourceType.FILE, "Current", null, null, null, null,
                SourceIngestionStatus.READY, null, null, 1, Instant.now(), Instant.now(), null));
        when(sourceService.findActiveViewsByIds(eq(userId), org.mockito.ArgumentMatchers.anySet())).thenReturn(List.of(
                new SourceView(sourceId, subjectId, SourceType.FILE, "Current", null, null, null, null,
                        SourceIngestionStatus.READY, null, null, 1, Instant.now(), Instant.now(), null),
                new SourceView(otherSourceId, subjectId, SourceType.FILE, "Other", null, null, null, null,
                        SourceIngestionStatus.READY, null, null, 1, Instant.now(), Instant.now(), null)));

        List<Citation> citations = retrievalService.retrieve(userId, vector, 3,
                new ReadingContext(sourceId, subjectId, ReadingContext.RetrievalMode.AUTO, null));

        assertThat(citations).singleElement().satisfies(citation -> {
            assertThat(citation.sourceId()).isEqualTo(sourceId);
            assertThat(citation.excerpt()).isEqualTo("current");
        });
        verify(pgVectorRepository).search(userId, sourceId, vector, 3);
    }

    @Test
    void readingContextRejectsSubjectMismatchAndNonReadySource() {
        UUID userId = UUID.randomUUID();
        UUID sourceId = UUID.randomUUID();
        when(sourceService.get(userId, sourceId)).thenReturn(new SourceView(
                sourceId, UUID.randomUUID(), SourceType.FILE, "Current", null, null, null, null,
                SourceIngestionStatus.PENDING, null, null, 1, Instant.now(), Instant.now(), null));

        assertThatThrownBy(() -> retrievalService.retrieve(userId, vector(1.0, 0.0), 3,
                new ReadingContext(sourceId, UUID.randomUUID(), ReadingContext.RetrievalMode.AUTO, null)))
                .isInstanceOf(com.auralis.app.shared.error.DomainException.class);
        verify(pgVectorRepository, never()).search(eq(userId), eq(sourceId), eq(vector(1.0, 0.0)), eq(3));
    }

    @Test
    void explicitSourceSelectionRetrievesOnlySelectedSourcesWithoutAutomaticExpansion() {
        UUID userId = UUID.randomUUID();
        UUID subjectId = UUID.randomUUID();
        UUID firstId = UUID.randomUUID();
        UUID secondId = UUID.randomUUID();
        UUID unselectedId = UUID.randomUUID();
        List<Double> query = vector(1.0, 0.0);
        SourceView first = source(firstId, subjectId, "First", SourceIngestionStatus.READY);
        SourceView second = source(secondId, subjectId, "Second", SourceIngestionStatus.READY);
        SourceView unselected = source(unselectedId, subjectId, "Unselected", SourceIngestionStatus.READY);
        when(pgVectorRepository.search(userId, firstId, query, 3)).thenReturn(Optional.empty());
        when(pgVectorRepository.search(userId, secondId, query, 3)).thenReturn(Optional.empty());
        when(chunkRepository.findAllByUserIdAndActiveTrue(userId)).thenReturn(List.of(
                chunk(userId, firstId, "first hit", query),
                chunk(userId, secondId, "second hit", query),
                chunk(userId, unselectedId, "unselected hit", query)));
        Map<UUID, SourceView> activeSources = Map.of(
                firstId, first, secondId, second, unselectedId, unselected);
        when(sourceService.findActiveViewsByIds(eq(userId), anyCollection())).thenAnswer(invocation -> {
            Collection<UUID> requested = invocation.getArgument(1);
            return requested.stream().map(activeSources::get).filter(java.util.Objects::nonNull).toList();
        });

        List<Citation> citations = retrievalService.retrieve(userId, query, 3,
                new ReadingContext(null, subjectId, ReadingContext.RetrievalMode.SELECTED_SOURCES,
                        List.of(firstId, secondId), null),
                "比较其他文件中的结论");

        assertThat(citations).extracting(Citation::sourceId).containsExactlyInAnyOrder(firstId, secondId);
        verify(sourceService, never()).list(userId);
        verify(pgVectorRepository, never()).search(userId, unselectedId, query, 3);
    }

    @Test
    void subjectSelectionRetrievesOnlyOwnerSubjectReadySources() {
        UUID userId = UUID.randomUUID();
        UUID subjectId = UUID.randomUUID();
        UUID otherSubjectId = UUID.randomUUID();
        UUID readyOneId = UUID.randomUUID();
        UUID readyTwoId = UUID.randomUUID();
        UUID pendingId = UUID.randomUUID();
        UUID otherSubjectSourceId = UUID.randomUUID();
        List<Double> query = vector(1.0, 0.0);
        SourceView readyOne = source(readyOneId, subjectId, "Ready one", SourceIngestionStatus.READY);
        SourceView readyTwo = source(readyTwoId, subjectId, "Ready two", SourceIngestionStatus.READY);
        SourceView pending = source(pendingId, subjectId, "Pending", SourceIngestionStatus.PENDING);
        SourceView otherSubject = source(otherSubjectSourceId, otherSubjectId, "Other subject", SourceIngestionStatus.READY);
        List<SourceView> listed = List.of(readyOne, readyTwo, pending, otherSubject);
        Map<UUID, SourceView> activeSources = new LinkedHashMap<>();
        listed.forEach(source -> activeSources.put(source.id(), source));
        when(subjectService.get(userId, subjectId)).thenReturn(null);
        when(sourceService.list(userId)).thenReturn(listed);
        when(pgVectorRepository.search(userId, readyOneId, query, 4)).thenReturn(Optional.empty());
        when(pgVectorRepository.search(userId, readyTwoId, query, 4)).thenReturn(Optional.empty());
        when(chunkRepository.findAllByUserIdAndActiveTrue(userId)).thenReturn(List.of(
                chunk(userId, readyOneId, "one", query),
                chunk(userId, readyTwoId, "two", query),
                chunk(userId, pendingId, "pending", query),
                chunk(userId, otherSubjectSourceId, "other subject", query)));
        when(sourceService.findActiveViewsByIds(eq(userId), anyCollection())).thenAnswer(invocation -> {
            Collection<UUID> requested = invocation.getArgument(1);
            return requested.stream().map(activeSources::get).filter(java.util.Objects::nonNull).toList();
        });

        List<Citation> citations = retrievalService.retrieve(userId, query, 4,
                new ReadingContext(null, subjectId, ReadingContext.RetrievalMode.SUBJECT, null, null));

        assertThat(citations).extracting(Citation::sourceId).containsExactlyInAnyOrder(readyOneId, readyTwoId);
        verify(subjectService).get(userId, subjectId);
        verify(pgVectorRepository, never()).search(userId, pendingId, query, 4);
        verify(pgVectorRepository, never()).search(userId, otherSubjectSourceId, query, 4);
    }

    @Test
    void selectedSourceScopeRejectsCrossSubjectSourcesBeforeSearching() {
        UUID userId = UUID.randomUUID();
        UUID subjectId = UUID.randomUUID();
        UUID foreignSubjectId = UUID.randomUUID();
        UUID sourceId = UUID.randomUUID();
        List<Double> query = vector(1.0, 0.0);
        when(sourceService.findActiveViewsByIds(userId, List.of(sourceId)))
                .thenReturn(List.of(source(sourceId, foreignSubjectId, "Foreign", SourceIngestionStatus.READY)));

        assertThatThrownBy(() -> retrievalService.retrieve(userId, query, 3,
                new ReadingContext(null, subjectId, ReadingContext.RetrievalMode.SELECTED_SOURCES,
                        List.of(sourceId), null)))
                .isInstanceOf(com.auralis.app.shared.error.DomainException.class)
                .hasMessageContaining("reading subject");
        verify(pgVectorRepository, never()).search(userId, sourceId, query, 3);
    }

    @Test
    void selectedSourceScopeRejectsSourcesThatAreMissingOrNotReady() {
        UUID userId = UUID.randomUUID();
        UUID subjectId = UUID.randomUUID();
        UUID missingId = UUID.randomUUID();
        UUID pendingId = UUID.randomUUID();
        List<Double> query = vector(1.0, 0.0);
        when(sourceService.findActiveViewsByIds(userId, List.of(missingId))).thenReturn(List.of());
        when(sourceService.findActiveViewsByIds(userId, List.of(pendingId)))
                .thenReturn(List.of(source(pendingId, subjectId, "Pending", SourceIngestionStatus.PENDING)));

        assertThatThrownBy(() -> retrievalService.retrieve(userId, query, 3,
                new ReadingContext(null, subjectId, ReadingContext.RetrievalMode.SELECTED_SOURCES,
                        List.of(missingId), null)))
                .isInstanceOf(com.auralis.app.shared.error.DomainException.class)
                .hasMessageContaining("selected source was not found");
        assertThatThrownBy(() -> retrievalService.retrieve(userId, query, 3,
                new ReadingContext(null, subjectId, ReadingContext.RetrievalMode.SELECTED_SOURCES,
                        List.of(pendingId), null)))
                .isInstanceOf(com.auralis.app.shared.error.DomainException.class)
                .hasMessageContaining("not ready");
        verify(pgVectorRepository, never()).search(eq(userId), eq(pendingId), eq(query), eq(3));
    }

    @Test
    void subjectScopeOwnerChecksSubjectBeforeListingSources() {
        UUID userId = UUID.randomUUID();
        UUID subjectId = UUID.randomUUID();
        when(subjectService.get(userId, subjectId)).thenThrow(
                new com.auralis.app.shared.error.DomainException("RESOURCE_NOT_FOUND", "Subject was not found"));

        assertThatThrownBy(() -> retrievalService.retrieve(userId, vector(1.0, 0.0), 3,
                new ReadingContext(null, subjectId, ReadingContext.RetrievalMode.SUBJECT, null, null)))
                .isInstanceOf(com.auralis.app.shared.error.DomainException.class)
                .hasMessageContaining("Subject was not found");
        verify(sourceService, never()).list(userId);
    }

    @Test
    void selectedSourceScopeOwnerChecksSubjectBeforeLoadingSelectedSources() {
        UUID userId = UUID.randomUUID();
        UUID subjectId = UUID.randomUUID();
        when(subjectService.get(userId, subjectId)).thenThrow(
                new com.auralis.app.shared.error.DomainException("RESOURCE_NOT_FOUND", "Subject was not found"));

        assertThatThrownBy(() -> retrievalService.retrieve(userId, vector(1.0, 0.0), 3,
                new ReadingContext(null, subjectId, ReadingContext.RetrievalMode.SELECTED_SOURCES,
                        List.of(UUID.randomUUID()), null)))
                .isInstanceOf(com.auralis.app.shared.error.DomainException.class)
                .hasMessageContaining("Subject was not found");
        verify(sourceService, never()).findActiveViewsByIds(eq(userId), anyCollection());
    }

    private static SourceView source(UUID id, UUID subjectId, String title, SourceIngestionStatus status) {
        return new SourceView(id, subjectId, SourceType.FILE, title, null, null, null, null,
                status, null, null, 1, Instant.now(), Instant.now(), null);
    }

    private static SourceChunkEntity chunk(UUID userId, UUID sourceId, String content, List<Double> vector) {
        return new SourceChunkEntity(
                UUID.randomUUID(), userId, sourceId, 0, content, "hash-" + content, 0, content.length(),
                new EmbeddingVectorCodec().encode(vector), UUID.randomUUID(), true);
    }

    private static List<Double> vector(double first, double second) {
        List<Double> vector = new ArrayList<>(java.util.Collections.nCopies(1024, 0.0));
        vector.set(0, first);
        vector.set(1, second);
        return vector;
    }
}
