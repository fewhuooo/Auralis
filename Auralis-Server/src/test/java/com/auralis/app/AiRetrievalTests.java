package com.auralis.app;

import com.auralis.app.ai.retrieval.Citation;
import com.auralis.app.ai.retrieval.EmbeddingVectorCodec;
import com.auralis.app.ai.retrieval.PgVectorRetrievalRepository;
import com.auralis.app.ai.retrieval.RetrievalService;
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

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.eq;
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
        when(sourceService.get(userId, sourceId)).thenReturn(new SourceView(
                sourceId, UUID.randomUUID(), SourceType.TEXT, "My source", null, null, null, null,
                SourceIngestionStatus.READY, null, null, 1, Instant.now(), Instant.now(), null));

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
        when(sourceService.get(userId, sourceId)).thenReturn(new SourceView(
                sourceId, UUID.randomUUID(), SourceType.TEXT, "Database source", null, null, null, null,
                SourceIngestionStatus.READY, null, null, 1, Instant.now(), Instant.now(), null));

        List<Citation> citations = retrievalService.retrieve(userId, vector, 3);

        assertThat(citations).singleElement().satisfies(citation -> {
            assertThat(citation.chunkId()).isEqualTo(chunkId);
            assertThat(citation.similarity()).isEqualTo(0.98);
        });
        verify(chunkRepository, never()).findAllByUserIdAndActiveTrue(userId);
    }

    @Test
    void rejectsInvalidDimensionsAndTopK() {
        assertThatThrownBy(() -> retrievalService.retrieve(UUID.randomUUID(), List.of(1.0), 3))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> retrievalService.retrieve(UUID.randomUUID(), vector(1.0, 0.0), 0))
                .isInstanceOf(IllegalArgumentException.class);
    }

    private static List<Double> vector(double first, double second) {
        List<Double> vector = new ArrayList<>(java.util.Collections.nCopies(1024, 0.0));
        vector.set(0, first);
        vector.set(1, second);
        return vector;
    }
}
