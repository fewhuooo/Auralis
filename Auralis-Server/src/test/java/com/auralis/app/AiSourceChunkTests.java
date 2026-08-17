package com.auralis.app;

import com.auralis.app.ai.ingestion.TextChunk;
import com.auralis.app.ai.internal.persistence.PgVectorSourceChunkRepository;
import com.auralis.app.ai.internal.persistence.SourceChunkEntity;
import com.auralis.app.ai.internal.persistence.SourceChunkRepository;
import com.auralis.app.ai.retrieval.SourceChunkService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AiSourceChunkTests {

    @Mock
    private SourceChunkRepository chunkRepository;

    @Mock
    private PgVectorSourceChunkRepository pgVectorRepository;

    @InjectMocks
    private SourceChunkService chunkService;

    @Test
    void h2ReplacementWritesNewGenerationInactiveThenActivatesIt() {
        UUID userId = UUID.randomUUID();
        UUID sourceId = UUID.randomUUID();
        UUID generation = UUID.randomUUID();
        List<TextChunk> chunks = List.of(new TextChunk(0, "new content", 0, 11));
        List<List<Double>> vectors = List.of(vector());
        when(pgVectorRepository.isAvailable()).thenReturn(false);
        when(chunkRepository.saveAll(anyList())).thenAnswer(invocation -> invocation.getArgument(0));

        chunkService.replace(userId, sourceId, generation, chunks, vectors);

        ArgumentCaptor<List<SourceChunkEntity>> captor = ArgumentCaptor.forClass(List.class);
        verify(chunkRepository).saveAll(captor.capture());
        SourceChunkEntity inserted = captor.getValue().get(0);
        assertThat(inserted.getGeneration()).isEqualTo(generation);
        assertThat(inserted.isActive()).isFalse();
        verify(chunkRepository).deactivateActive(userId, sourceId);
        verify(chunkRepository).activateGeneration(userId, sourceId, generation);
    }

    @Test
    void postgresReplacementDelegatesVectorWriteAndAtomicCutoverToJdbcStore() {
        UUID userId = UUID.randomUUID();
        UUID sourceId = UUID.randomUUID();
        UUID generation = UUID.randomUUID();
        List<TextChunk> chunks = List.of(new TextChunk(0, "new content", 0, 11));
        List<List<Double>> vectors = List.of(vector());
        when(pgVectorRepository.isAvailable()).thenReturn(true);

        chunkService.replace(userId, sourceId, generation, chunks, vectors);

        verify(pgVectorRepository).replace(eq(userId), eq(sourceId), eq(generation), eq(chunks), eq(vectors));
        verifyNoInteractions(chunkRepository);
    }

    private static List<Double> vector() {
        return java.util.stream.Stream.generate(() -> 0.0).limit(1024).toList();
    }
}
