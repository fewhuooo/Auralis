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
import com.auralis.app.ai.ingestion.TextChunk;
import com.auralis.app.ai.ingestion.TextChunker;
import com.auralis.app.ai.ingestion.SourceParser;
import com.auralis.app.ai.internal.persistence.IngestionJobEntity;
import com.auralis.app.ai.internal.provider.EmbeddingProviderRegistry;
import com.auralis.app.ai.usage.AiInvocationGateway;
import com.auralis.app.ai.usage.AiInvocationResult;
import com.auralis.app.ai.usage.AiTaskScope;
import com.auralis.app.ai.usage.AiUsageLimitException;
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
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Clock;
import java.time.ZoneId;
import java.time.Instant;
import java.time.ZoneOffset;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.lenient;
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
    private AiInvocationGateway invocationGateway;
    @Mock
    private AiTaskScope taskScope;
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
        lenient().when(aiProperties.ingestionLeaseMillis()).thenReturn(300_000L);
        lenient().when(aiProperties.ingestionMaxAttempts()).thenReturn(3);
        lenient().when(aiProperties.ingestionEmbeddingBatchMaxItems()).thenReturn(32);
        lenient().when(aiProperties.ingestionEmbeddingBatchMaxUtf8Bytes()).thenReturn(32_768L);
        lenient().when(jobService.renewClaim(any(), any(), any())).thenReturn(true);
        lenient().when(invocationGateway.beginTask(any())).thenReturn(taskScope);
        lenient().when(taskScope.embed(any(), any(), any(), anyList(), any())).thenAnswer(invocation -> {
            AiProviderType providerType = invocation.getArgument(1);
            List<String> texts = invocation.getArgument(3);
            AiCredential credential = invocation.getArgument(4);
            return new AiInvocationResult<>(embeddingProviderRegistry.require(providerType)
                    .embed(texts, credential), null);
        });
        lenient().when(completionService.loadCheckpoint(any(), any(), anyList())).thenReturn(java.util.Map.of());
        lenient().when(completionService.stageCheckpoint(any(), any(), anyList(), anyList())).thenReturn(true);
        worker = new IngestionWorker(
                jobService, completionService, sourceService, List.of(parser), settingsService,
                invocationGateway, parsedDocumentService, clock, properties);
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
    void quotaDenialDefersWithoutRecordingOrdinaryFailure() {
        IngestionJobEntity job = claimedJob(1);
        Instant resetAt = clock.instant().plusSeconds(3600);
        when(jobService.claimNext(any(), any(), eq(3))).thenReturn(Optional.of(job));
        when(invocationGateway.beginTask(any())).thenThrow(new AiUsageLimitException(
                "AI_HOURLY_QUOTA_EXCEEDED", 429, 3600, resetAt));

        assertThat(worker.processNext()).isTrue();

        verify(completionService).defer(eq(IngestionClaim.from(job)), eq(revision), eq(resetAt),
                eq("AI_HOURLY_QUOTA_EXCEEDED"));
        verify(completionService, never()).fail(any(), any(), any(), anyInt(), any(), any());
    }

    @ParameterizedTest
    @CsvSource({"AI_REQUEST_BUDGET_EXCEEDED,413", "AI_TASK_BUDGET_EXCEEDED,422"})
    void deterministicBudgetDenialTerminalizesInsteadOfDeferring(String code, int status) {
        IngestionJobEntity job = claimedJob(1);
        when(jobService.claimNext(any(), any(), eq(3))).thenReturn(Optional.of(job));
        when(invocationGateway.beginTask(any())).thenThrow(new AiUsageLimitException(code, status, 0, null));

        assertThat(worker.processNext()).isTrue();

        verify(completionService).fail(eq(IngestionClaim.from(job)), eq(revision), eq(clock.instant()),
                eq(1), eq(code), any());
        verify(completionService, never()).defer(any(), any(), any(), any());
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
    void completedCheckpointBatchIsReusedWithoutAnotherEmbeddingDispatch() {
        String text = "source text";
        IngestionJobEntity job = claimedJob(2);
        SourceView source = source();
        List<TextChunk> chunks = new TextChunker(1200, 120).chunk(text);
        List<Double> checkpointVector = vector();
        when(jobService.claimNext(any(), any(), eq(3))).thenReturn(Optional.of(job));
        when(sourceService.requireActiveSource(userId, sourceId)).thenReturn(source);
        when(sourceService.markParsingIfRevision(userId, sourceId, revision)).thenReturn(Optional.of(source));
        when(sourceService.markIndexingIfRevision(userId, sourceId, revision)).thenReturn(true);
        when(parser.supports(SourceType.TEXT)).thenReturn(true);
        when(parser.parse(userId, source)).thenReturn(text);
        when(completionService.loadCheckpoint(eq(IngestionClaim.from(job)), eq(revision), eq(chunks)))
                .thenReturn(java.util.Map.of(0, checkpointVector));
        when(completionService.complete(any(), eq(revision), anyList(), anyList(), eq(clock.instant())))
                .thenReturn(true);

        assertThat(worker.processNext()).isTrue();

        verify(taskScope, never()).embed(any(), any(), any(), anyList(), any());
        verify(completionService, never()).stageCheckpoint(any(), any(), anyList(), anyList());
        verify(completionService).complete(eq(IngestionClaim.from(job)), eq(revision), eq(chunks),
                eq(List.of(checkpointVector)), eq(clock.instant()));
    }

    @Test
    void embedsInBoundedBatchesAndPreservesChunkSequenceBeforeCommitting() {
        String text = "x".repeat(36_000);
        IngestionJobEntity job = claimedJob(1);
        SourceView source = source();
        EmbeddingProviderPort embeddingProvider = org.mockito.Mockito.mock(EmbeddingProviderPort.class);
        List<List<String>> submittedBatches = new ArrayList<>();
        when(jobService.claimNext(any(), any(), eq(3))).thenReturn(Optional.of(job));
        when(sourceService.requireActiveSource(userId, sourceId)).thenReturn(source);
        when(sourceService.markParsingIfRevision(userId, sourceId, revision)).thenReturn(Optional.of(source));
        when(parser.supports(SourceType.TEXT)).thenReturn(true);
        when(parser.parse(userId, source)).thenReturn(text);
        when(settingsService.resolveServerManagedEmbedding())
                .thenReturn(new AiSettingsService.ResolvedSettings(
                        AiProviderType.SILICONFLOW, "embedding-model",
                        new AiCredential("https://api.siliconflow.cn", "test-key", "embedding-model")));
        when(embeddingProviderRegistry.require(AiProviderType.SILICONFLOW)).thenReturn(embeddingProvider);
        when(sourceService.markIndexingIfRevision(userId, sourceId, revision)).thenReturn(true);
        doAnswer(invocation -> {
            List<String> batch = List.copyOf(invocation.getArgument(0));
            submittedBatches.add(batch);
            return new EmbeddingResult(java.util.Collections.nCopies(batch.size(), vector()));
        }).when(embeddingProvider).embed(anyList(), any());

        assertThat(worker.processNext()).isTrue();

        List<String> expectedChunks = new TextChunker(1200, 120).chunk(text).stream()
                .map(TextChunk::content).toList();
        assertThat(submittedBatches).hasSizeGreaterThan(1);
        assertThat(submittedBatches).allSatisfy(batch -> {
            assertThat(batch).hasSizeLessThanOrEqualTo(32);
            assertThat(batch.stream().mapToInt(value -> value.getBytes(StandardCharsets.UTF_8).length).sum())
                    .isLessThanOrEqualTo(32_768);
        });
        assertThat(submittedBatches.stream().flatMap(List::stream).toList()).containsExactlyElementsOf(expectedChunks);
        org.mockito.ArgumentCaptor<List<List<Double>>> vectors = org.mockito.ArgumentCaptor.forClass(List.class);
        verify(completionService).complete(
                eq(IngestionClaim.from(job)), eq(revision), anyList(), vectors.capture(), eq(clock.instant()));
        assertThat(vectors.getValue()).hasSize(expectedChunks.size());
    }

    @Test
    void renewsClaimAcrossMultipleBatchesThatOutlastTheOriginalLease() {
        AtomicReference<Instant> now = new AtomicReference<>(clock.instant());
        Clock mutableClock = new Clock() {
            @Override public ZoneId getZone() { return ZoneOffset.UTC; }
            @Override public Clock withZone(ZoneId zone) { return this; }
            @Override public Instant instant() { return now.get(); }
        };
        worker = new IngestionWorker(jobService, completionService, sourceService, List.of(parser), settingsService,
                invocationGateway, parsedDocumentService, mutableClock, properties);
        when(aiProperties.ingestionLeaseMillis()).thenReturn(100L);
        when(jobService.renewClaim(any(), any(), any())).thenReturn(true);
        IngestionJobEntity job = new IngestionJobEntity(
                UUID.randomUUID(), userId, sourceId, IngestionJobStatus.PENDING, generation, revision);
        job.claim(now.get(), now.get().plusMillis(100));
        SourceView source = source();
        EmbeddingProviderPort embeddingProvider = org.mockito.Mockito.mock(EmbeddingProviderPort.class);
        when(jobService.claimNext(any(), any(), eq(3))).thenReturn(Optional.of(job));
        when(sourceService.requireActiveSource(userId, sourceId)).thenReturn(source);
        when(sourceService.markParsingIfRevision(userId, sourceId, revision)).thenReturn(Optional.of(source));
        when(parser.supports(SourceType.TEXT)).thenReturn(true);
        when(parser.parse(userId, source)).thenReturn("x".repeat(36_000));
        when(settingsService.resolveServerManagedEmbedding())
                .thenReturn(new AiSettingsService.ResolvedSettings(
                        AiProviderType.SILICONFLOW, "embedding-model",
                        new AiCredential("https://api.siliconflow.cn", "test-key", "embedding-model")));
        when(embeddingProviderRegistry.require(AiProviderType.SILICONFLOW)).thenReturn(embeddingProvider);
        when(sourceService.markIndexingIfRevision(userId, sourceId, revision)).thenReturn(true);
        doAnswer(invocation -> {
            List<String> batch = invocation.getArgument(0);
            now.set(now.get().plusMillis(101));
            return new EmbeddingResult(java.util.Collections.nCopies(batch.size(), vector()));
        }).when(embeddingProvider).embed(anyList(), any());

        assertThat(worker.processNext()).isTrue();

        assertThat(now.get()).isAfter(clock.instant().plusMillis(100));
        org.mockito.ArgumentCaptor<IngestionClaim> claimCaptor =
                org.mockito.ArgumentCaptor.forClass(IngestionClaim.class);
        org.mockito.ArgumentCaptor<Instant> renewedAt = org.mockito.ArgumentCaptor.forClass(Instant.class);
        verify(jobService, org.mockito.Mockito.atLeast(4))
                .renewClaim(claimCaptor.capture(), renewedAt.capture(), any());
        assertThat(claimCaptor.getAllValues()).allMatch(claim -> claim.equals(IngestionClaim.from(job)));
        verify(completionService).complete(eq(IngestionClaim.from(job)), eq(revision), anyList(), anyList(), eq(now.get()));
    }

    @Test
    void doesNotCommitGenerationWhenEmbeddingProviderReturnsWrongVectorCount() {
        IngestionJobEntity job = claimedJob(1);
        SourceView source = source();
        EmbeddingProviderPort embeddingProvider = org.mockito.Mockito.mock(EmbeddingProviderPort.class);
        when(jobService.claimNext(any(), any(), eq(3))).thenReturn(Optional.of(job));
        when(sourceService.requireActiveSource(userId, sourceId)).thenReturn(source);
        when(sourceService.markParsingIfRevision(userId, sourceId, revision)).thenReturn(Optional.of(source));
        when(parser.supports(SourceType.TEXT)).thenReturn(true);
        when(parser.parse(userId, source)).thenReturn("one chunk");
        when(settingsService.resolveServerManagedEmbedding())
                .thenReturn(new AiSettingsService.ResolvedSettings(
                        AiProviderType.SILICONFLOW, "embedding-model",
                        new AiCredential("https://api.siliconflow.cn", "test-key", "embedding-model")));
        when(embeddingProviderRegistry.require(AiProviderType.SILICONFLOW)).thenReturn(embeddingProvider);
        when(sourceService.markIndexingIfRevision(userId, sourceId, revision)).thenReturn(true);
        when(embeddingProvider.embed(anyList(), any())).thenReturn(new EmbeddingResult(List.of()));

        assertThat(worker.processNext()).isTrue();

        verify(completionService, never()).complete(any(), any(), anyList(), anyList(), any());
        verify(completionService).fail(eq(IngestionClaim.from(job)), eq(revision), eq(clock.instant()), eq(3),
                eq("MODEL_PROVIDER_ERROR"), any());
    }

    @Test
    void stopsEmbeddingWhenTheClaimLeaseExpiresBetweenBatches() {
        AtomicReference<Instant> now = new AtomicReference<>(clock.instant());
        Clock mutableClock = new Clock() {
            @Override public ZoneId getZone() { return ZoneOffset.UTC; }
            @Override public Clock withZone(ZoneId zone) { return this; }
            @Override public Instant instant() { return now.get(); }
        };
        worker = new IngestionWorker(jobService, completionService, sourceService, List.of(parser), settingsService,
                invocationGateway, parsedDocumentService, mutableClock, properties);
        when(aiProperties.ingestionLeaseMillis()).thenReturn(100L);
        when(jobService.renewClaim(any(), any(), any())).thenReturn(true, false);
        String text = "x".repeat(36_000);
        IngestionJobEntity job = new IngestionJobEntity(
                UUID.randomUUID(), userId, sourceId, IngestionJobStatus.PENDING, generation, revision);
        job.claim(now.get(), now.get().plusMillis(100));
        SourceView source = source();
        EmbeddingProviderPort embeddingProvider = org.mockito.Mockito.mock(EmbeddingProviderPort.class);
        when(jobService.claimNext(any(), any(), eq(3))).thenReturn(Optional.of(job));
        when(sourceService.requireActiveSource(userId, sourceId)).thenReturn(source);
        when(sourceService.markParsingIfRevision(userId, sourceId, revision)).thenReturn(Optional.of(source));
        when(parser.supports(SourceType.TEXT)).thenReturn(true);
        when(parser.parse(userId, source)).thenReturn(text);
        when(settingsService.resolveServerManagedEmbedding())
                .thenReturn(new AiSettingsService.ResolvedSettings(
                        AiProviderType.SILICONFLOW, "embedding-model",
                        new AiCredential("https://api.siliconflow.cn", "test-key", "embedding-model")));
        when(embeddingProviderRegistry.require(AiProviderType.SILICONFLOW)).thenReturn(embeddingProvider);
        when(sourceService.markIndexingIfRevision(userId, sourceId, revision)).thenReturn(true);
        doAnswer(invocation -> {
            List<String> batch = invocation.getArgument(0);
            now.set(now.get().plusMillis(101));
            return new EmbeddingResult(java.util.Collections.nCopies(batch.size(), vector()));
        }).when(embeddingProvider).embed(anyList(), any());

        assertThat(worker.processNext()).isTrue();

        verify(embeddingProvider, org.mockito.Mockito.times(1)).embed(anyList(), any());
        verify(completionService, never()).complete(any(), any(), anyList(), anyList(), any());
        verify(completionService, never()).fail(any(), any(), any(), anyInt(), any(), any());
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
