package com.auralis.app;

import com.auralis.app.ai.AiSettingsService;
import com.auralis.app.ai.AiCredential;
import com.auralis.app.ai.AiProviderType;
import com.auralis.app.ai.EmbeddingProviderPort;
import com.auralis.app.ai.EmbeddingResult;
import com.auralis.app.ai.IngestionJobStatus;
import com.auralis.app.ai.ingestion.IngestionJobService;
import com.auralis.app.ai.ingestion.IngestionCompletionService;
import com.auralis.app.ai.ingestion.IngestionClaim;
import com.auralis.app.ai.ingestion.IngestionWorker;
import com.auralis.app.ai.ingestion.SourceParser;
import com.auralis.app.ai.internal.persistence.IngestionJobEntity;
import com.auralis.app.ai.internal.provider.EmbeddingProviderRegistry;
import com.auralis.app.shared.config.AuralisProperties;
import com.auralis.app.source.SourceIngestionStatus;
import com.auralis.app.source.ParsedDocumentReadView;
import com.auralis.app.source.ParsedDocumentService;
import com.auralis.app.source.ParsedDocumentValidator;
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
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.never;

@ExtendWith(MockitoExtension.class)
class AiIngestionWorkerTests {

    @Mock
    private IngestionJobService jobService;
    @Mock
    private IngestionCompletionService completionService;
    @Mock
    private SourceService sourceService;
    @Mock
    private SourceParser parser;
    @Mock
    private AiSettingsService settingsService;
    @Mock
    private EmbeddingProviderRegistry embeddingProviderRegistry;
    @Mock
    private ParsedDocumentService parsedDocumentService;
    @Mock
    private AuralisProperties properties;
    @Mock
    private AuralisProperties.Ai aiProperties;

    private final Clock clock = Clock.fixed(Instant.parse("2026-08-16T12:00:00Z"), ZoneOffset.UTC);
    private IngestionWorker worker;
    private UUID userId;
    private UUID sourceId;
    private UUID generation;
    private UUID revision;

    @BeforeEach
    void setUp() {
        userId = UUID.randomUUID();
        sourceId = UUID.randomUUID();
        generation = UUID.randomUUID();
        revision = UUID.randomUUID();
        when(properties.ai()).thenReturn(aiProperties);
        when(aiProperties.ingestionLeaseMillis()).thenReturn(300_000L);
        when(aiProperties.ingestionMaxAttempts()).thenReturn(3);
        worker = new IngestionWorker(
                jobService, completionService, sourceService, List.of(parser), settingsService,
                embeddingProviderRegistry, parsedDocumentService, clock, properties);
    }

    @Test
    void transientFailureReturnsSourceAndJobToPendingForRetry() {
        IngestionJobEntity job = claimedJob(1);
        SourceView source = source();
        when(jobService.claimNext(any(), any(), eq(3))).thenReturn(Optional.of(job));
        when(sourceService.requireActiveSource(userId, sourceId)).thenReturn(source);
        when(sourceService.markParsingIfRevision(userId, sourceId, revision)).thenReturn(Optional.of(source));
        when(parser.supports(SourceType.TEXT)).thenReturn(true);
        when(parser.parse(userId, source)).thenThrow(new IllegalStateException("temporary parser failure"));

        assertThat(worker.processNext()).isTrue();

        verify(completionService).fail(
                eq(IngestionClaim.from(job)), eq(revision), eq(clock.instant()), eq(3),
                eq("INGESTION_FAILED"), any());
    }

    @Test
    void finalFailureMarksSourceAndJobFailed() {
        IngestionJobEntity job = claimedJob(3);
        SourceView source = source();
        when(jobService.claimNext(any(), any(), eq(3))).thenReturn(Optional.of(job));
        when(sourceService.requireActiveSource(userId, sourceId)).thenReturn(source);
        when(sourceService.markParsingIfRevision(userId, sourceId, revision)).thenReturn(Optional.of(source));
        when(parser.supports(SourceType.TEXT)).thenReturn(true);
        when(parser.parse(userId, source)).thenThrow(new IllegalStateException("permanent parser failure"));

        assertThat(worker.processNext()).isTrue();

        verify(completionService).fail(
                eq(IngestionClaim.from(job)), eq(revision), eq(clock.instant()), eq(3),
                eq("INGESTION_FAILED"), any());
    }

    @Test
    void successfulIngestionCommitsTheClaimedGeneration() {
        IngestionJobEntity job = claimedJob(1);
        SourceView source = source();
        EmbeddingProviderPort embeddingProvider = org.mockito.Mockito.mock(EmbeddingProviderPort.class);
        when(jobService.claimNext(any(), any(), eq(3))).thenReturn(Optional.of(job));
        when(sourceService.requireActiveSource(userId, sourceId)).thenReturn(source);
        when(sourceService.markParsingIfRevision(userId, sourceId, revision)).thenReturn(Optional.of(source));
        when(parser.supports(SourceType.TEXT)).thenReturn(true);
        when(parser.parse(userId, source)).thenReturn("source text");
        when(settingsService.resolveServerManagedEmbedding())
                .thenReturn(new AiSettingsService.ResolvedSettings(
                        AiProviderType.SILICONFLOW, "embedding-model",
                        new AiCredential("https://api.siliconflow.cn", "test-key", "embedding-model")));
        when(embeddingProviderRegistry.require(AiProviderType.SILICONFLOW)).thenReturn(embeddingProvider);
        when(embeddingProvider.embed(anyList(), any())).thenReturn(new EmbeddingResult(List.of(vector())));
        when(sourceService.markIndexingIfRevision(userId, sourceId, revision)).thenReturn(true);
        when(completionService.complete(any(), eq(revision), anyList(), anyList(), eq(clock.instant())))
                .thenReturn(true);

        assertThat(worker.processNext()).isTrue();

        verify(completionService).complete(
                eq(IngestionClaim.from(job)), eq(revision), anyList(), anyList(), eq(clock.instant()));
        verify(sourceService, never()).markReady(any(), any());
    }

    @Test
    void acceptedParsedDocumentJobBypassesOriginalFileParser() {
        UUID parsedDocumentId = UUID.randomUUID();
        UUID parsedRevision = revision;
        IngestionJobEntity job = new IngestionJobEntity(
                UUID.randomUUID(), userId, sourceId, IngestionJobStatus.PENDING, generation, parsedRevision);
        job.attachParsedDocument(parsedDocumentId, parsedRevision);
        job.claim(clock.instant(), clock.instant().plusSeconds(300));
        SourceView source = new SourceView(
                sourceId, UUID.randomUUID(), SourceType.FILE, "scan.pdf", UUID.randomUUID(), null, null, null,
                SourceIngestionStatus.INDEXING, parsedRevision, null, null, 0, clock.instant(), clock.instant(), null, null);
        when(jobService.claimNext(any(), any(), eq(3))).thenReturn(Optional.of(job));
        when(sourceService.requireActiveSource(userId, sourceId)).thenReturn(source);
        when(parsedDocumentService.readAccepted(userId, sourceId, parsedDocumentId))
                .thenReturn(new ParsedDocumentReadView(
                        parsedDocumentId, sourceId, revision, generation,
                        List.of(new ParsedDocumentValidator.ValidatedBlock(0, "page", "OCR text"))));
        configureEmbeddingProvider();
        when(sourceService.markIndexingIfRevision(userId, sourceId, parsedRevision)).thenReturn(true);
        when(completionService.complete(any(), eq(parsedRevision), anyList(), anyList(), eq(clock.instant())))
                .thenReturn(true);

        assertThat(worker.processNext()).isTrue();

        verify(parsedDocumentService).readAccepted(userId, sourceId, parsedDocumentId);
        verifyNoInteractions(parser);
        verify(completionService).complete(
                eq(IngestionClaim.from(job)), eq(parsedRevision), anyList(), anyList(), eq(clock.instant()));
    }

    @Test
    void staleParsedDocumentJobFailsWithoutChangingCurrentSourceState() {
        UUID parsedDocumentId = UUID.randomUUID();
        UUID jobRevision = UUID.randomUUID();
        UUID currentRevision = UUID.randomUUID();
        IngestionJobEntity job = new IngestionJobEntity(
                UUID.randomUUID(), userId, sourceId, IngestionJobStatus.PENDING, generation);
        job.attachParsedDocument(parsedDocumentId, jobRevision);
        job.claim(clock.instant(), clock.instant().plusSeconds(300));
        SourceView source = new SourceView(
                sourceId, UUID.randomUUID(), SourceType.FILE, "scan.pdf", UUID.randomUUID(), null, null, null,
                SourceIngestionStatus.AWAITING_CLIENT, currentRevision, null, null, 0,
                clock.instant(), clock.instant(), null, null);
        when(jobService.claimNext(any(), any(), eq(3))).thenReturn(Optional.of(job));
        when(sourceService.requireActiveSource(userId, sourceId)).thenReturn(source);

        assertThat(worker.processNext()).isTrue();

        verify(sourceService).requireActiveSource(userId, sourceId);
        verify(completionService).fail(
                eq(IngestionClaim.from(job)), eq(jobRevision), eq(clock.instant()), eq(3),
                eq("INGESTION_REVISION_STALE"), any());
        verifyNoInteractions(parsedDocumentService, parser);
    }

    private void configureEmbeddingProvider() {
        EmbeddingProviderPort embeddingProvider = org.mockito.Mockito.mock(EmbeddingProviderPort.class);
        when(settingsService.resolveServerManagedEmbedding())
                .thenReturn(new AiSettingsService.ResolvedSettings(
                        AiProviderType.SILICONFLOW, "embedding-model",
                        new AiCredential("https://api.siliconflow.cn", "test-key", "embedding-model")));
        when(embeddingProviderRegistry.require(AiProviderType.SILICONFLOW)).thenReturn(embeddingProvider);
        when(embeddingProvider.embed(anyList(), any())).thenReturn(new EmbeddingResult(List.of(vector())));
    }

    private IngestionJobEntity claimedJob(int attempts) {
        IngestionJobEntity job = new IngestionJobEntity(
                UUID.randomUUID(), userId, sourceId, IngestionJobStatus.PENDING, generation, revision);
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
                SourceIngestionStatus.PARSING, revision, null, null, 0, now, now, null, null);
    }

    private static List<Double> vector() {
        return java.util.stream.Stream.generate(() -> 0.0).limit(1024).toList();
    }
}
