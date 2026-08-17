package com.auralis.app;

import com.auralis.app.ai.AiSettingsService;
import com.auralis.app.ai.AiCredential;
import com.auralis.app.ai.AiProviderType;
import com.auralis.app.ai.EmbeddingProviderPort;
import com.auralis.app.ai.EmbeddingResult;
import com.auralis.app.ai.IngestionJobStatus;
import com.auralis.app.ai.ingestion.IngestionJobService;
import com.auralis.app.ai.ingestion.IngestionWorker;
import com.auralis.app.ai.ingestion.SourceParser;
import com.auralis.app.ai.internal.persistence.IngestionJobEntity;
import com.auralis.app.ai.internal.persistence.IngestionJobRepository;
import com.auralis.app.ai.internal.provider.EmbeddingProviderRegistry;
import com.auralis.app.ai.retrieval.SourceChunkService;
import com.auralis.app.shared.config.AuralisProperties;
import com.auralis.app.source.SourceIngestionStatus;
import com.auralis.app.source.SourceService;
import com.auralis.app.source.SourceType;
import com.auralis.app.source.SourceView;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AiIngestionWorkerTests {

    @Mock
    private IngestionJobRepository jobRepository;
    @Mock
    private IngestionJobService jobService;
    @Mock
    private SourceService sourceService;
    @Mock
    private SourceParser parser;
    @Mock
    private AiSettingsService settingsService;
    @Mock
    private EmbeddingProviderRegistry embeddingProviderRegistry;
    @Mock
    private SourceChunkService chunkService;
    @Mock
    private AuralisProperties properties;
    @Mock
    private AuralisProperties.Ai aiProperties;

    private final Clock clock = Clock.fixed(Instant.parse("2026-08-16T12:00:00Z"), ZoneOffset.UTC);
    private IngestionWorker worker;
    private UUID userId;
    private UUID sourceId;
    private UUID generation;

    @BeforeEach
    void setUp() {
        userId = UUID.randomUUID();
        sourceId = UUID.randomUUID();
        generation = UUID.randomUUID();
        when(properties.ai()).thenReturn(aiProperties);
        when(aiProperties.ingestionLeaseMillis()).thenReturn(300_000L);
        when(aiProperties.ingestionMaxAttempts()).thenReturn(3);
        worker = new IngestionWorker(
                jobRepository, jobService, sourceService, List.of(parser), settingsService,
                embeddingProviderRegistry, chunkService, clock, properties);
    }

    @Test
    void transientFailureReturnsSourceAndJobToPendingForRetry() {
        IngestionJobEntity job = claimedJob(1);
        SourceView source = source();
        when(jobService.claimNext(any(), any(), eq(3))).thenReturn(Optional.of(job));
        when(sourceService.markParsing(userId, sourceId)).thenReturn(source);
        when(parser.supports(SourceType.TEXT)).thenReturn(true);
        when(parser.parse(userId, source)).thenThrow(new IllegalStateException("temporary parser failure"));

        assertThat(worker.processNext()).isTrue();

        verify(sourceService).markPending(userId, sourceId);
        assertThat(job.getStatus()).isEqualTo(IngestionJobStatus.PENDING);
        verify(jobRepository).saveAndFlush(job);
    }

    @Test
    void finalFailureMarksSourceAndJobFailed() {
        IngestionJobEntity job = claimedJob(3);
        SourceView source = source();
        when(jobService.claimNext(any(), any(), eq(3))).thenReturn(Optional.of(job));
        when(sourceService.markParsing(userId, sourceId)).thenReturn(source);
        when(parser.supports(SourceType.TEXT)).thenReturn(true);
        when(parser.parse(userId, source)).thenThrow(new IllegalStateException("permanent parser failure"));

        assertThat(worker.processNext()).isTrue();

        verify(sourceService).markFailed(eq(userId), eq(sourceId), eq("INGESTION_FAILED"), any());
        assertThat(job.getStatus()).isEqualTo(IngestionJobStatus.FAILED);
        verify(jobRepository).saveAndFlush(job);
    }

    @Test
    void successfulIngestionCommitsTheClaimedGeneration() {
        IngestionJobEntity job = claimedJob(1);
        SourceView source = source();
        EmbeddingProviderPort embeddingProvider = org.mockito.Mockito.mock(EmbeddingProviderPort.class);
        when(jobService.claimNext(any(), any(), eq(3))).thenReturn(Optional.of(job));
        when(sourceService.markParsing(userId, sourceId)).thenReturn(source);
        when(parser.supports(SourceType.TEXT)).thenReturn(true);
        when(parser.parse(userId, source)).thenReturn("source text");
        when(settingsService.resolve(userId, AiProviderType.SILICONFLOW))
                .thenReturn(new AiSettingsService.ResolvedSettings(
                        AiProviderType.SILICONFLOW, "embedding-model",
                        new AiCredential("https://api.siliconflow.cn", "test-key", "embedding-model")));
        when(embeddingProviderRegistry.require(AiProviderType.SILICONFLOW)).thenReturn(embeddingProvider);
        when(embeddingProvider.embed(anyList(), any())).thenReturn(new EmbeddingResult(List.of(vector())));
        when(sourceService.markIndexing(userId, sourceId)).thenReturn(source);
        when(sourceService.markReady(userId, sourceId)).thenReturn(source);

        assertThat(worker.processNext()).isTrue();

        verify(chunkService).replace(eq(userId), eq(sourceId), eq(generation), anyList(), anyList());
        assertThat(job.getStatus()).isEqualTo(IngestionJobStatus.READY);
    }

    private IngestionJobEntity claimedJob(int attempts) {
        IngestionJobEntity job = new IngestionJobEntity(
                UUID.randomUUID(), userId, sourceId, IngestionJobStatus.PENDING, generation);
        Instant now = clock.instant();
        for (int attempt = 0; attempt < attempts; attempt++) {
            job.claim(now, now.plusSeconds(300));
        }
        return job;
    }

    private SourceView source() {
        Instant now = clock.instant();
        return new SourceView(
                sourceId, UUID.randomUUID(), SourceType.TEXT, "Notes", null, null, "text", null,
                SourceIngestionStatus.PARSING, null, null, 0, now, now, null);
    }

    private static List<Double> vector() {
        return java.util.stream.Stream.generate(() -> 0.0).limit(1024).toList();
    }
}
