package com.auralis.app;

import com.auralis.app.support.AuthTestAccounts;
import com.auralis.app.ai.AiCredential;
import com.auralis.app.ai.AiProviderType;
import com.auralis.app.ai.EmbeddingProviderPort;
import com.auralis.app.ai.EmbeddingResult;
import com.auralis.app.ai.IngestionJobStatus;
import com.auralis.app.ai.AiSettingsService;
import com.auralis.app.ai.usage.AiFeature;
import com.auralis.app.ai.usage.AiCredentialSource;
import com.auralis.app.ai.usage.AiInvocationGateway;
import com.auralis.app.ai.usage.AiOutputRole;
import com.auralis.app.ai.usage.AiStage;
import com.auralis.app.ai.usage.AiTaskContext;
import com.auralis.app.ai.usage.AiTaskScope;
import com.auralis.app.ai.usage.AiTokenUsage;
import com.auralis.app.ai.usage.AiUsageGuard;
import com.auralis.app.ai.ingestion.IngestionClaim;
import com.auralis.app.ai.ingestion.IngestionCompletionService;
import com.auralis.app.ai.ingestion.IngestionJobService;
import com.auralis.app.ai.ingestion.TextChunk;
import com.auralis.app.ai.ingestion.TextChunker;
import com.auralis.app.ai.internal.persistence.IngestionJobEntity;
import com.auralis.app.ai.internal.persistence.IngestionJobRepository;
import com.auralis.app.ai.internal.persistence.SourceChunkRepository;
import com.auralis.app.ai.internal.provider.EmbeddingProviderRegistry;
import com.auralis.app.ai.ingestion.IngestionWorker;
import com.auralis.app.identity.DeviceCommand;
import com.auralis.app.identity.DevicePlatform;
import com.auralis.app.identity.IdentityService;
import com.auralis.app.source.SourceCommand;
import com.auralis.app.source.SourceService;
import com.auralis.app.source.SourceType;
import com.auralis.app.subject.SubjectCommand;
import com.auralis.app.subject.SubjectService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.Collections;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(classes = {AuralisApplication.class, AiIngestionResumePostgresTests.TestBeans.class})
@ActiveProfiles("postgres-it")
class AiIngestionResumePostgresTests {

    private static final Instant WINDOW_START = Instant.parse("2026-10-11T00:00:00Z");

    @DynamicPropertySource
    static void taskOwnedPostgres(DynamicPropertyRegistry registry) {
        String url = System.getProperty("auralis.usage.postgres.url");
        if (url == null || !url.startsWith("jdbc:postgresql:")) {
            throw new IllegalStateException("A task-owned PostgreSQL URL is required for this integration test");
        }
        registry.add("spring.datasource.url", () -> url);
        registry.add("spring.datasource.username", () -> "postgres");
        registry.add("spring.datasource.password", () -> "");
        registry.add("auralis.identity.jwt-secret", () -> "0123456789abcdef0123456789abcdef");
        registry.add("auralis.ai.encryption-key", () -> "0123456789abcdef0123456789abcdef");
        registry.add("auralis.ai.ingestion-worker-enabled", () -> "false");
        registry.add("auralis.ai.embedding.base-url", () -> "https://api.siliconflow.cn/v1");
        registry.add("auralis.ai.embedding.model", () -> "bge-m3");
        registry.add("auralis.ai.embedding.api-key", () -> "synthetic-test-key");
        registry.add("auralis.ai.limits.per-user-hourly-tokens", () -> "33000");
        registry.add("auralis.ai.limits.per-user-daily-tokens", () -> "100000");
        registry.add("auralis.ai.limits.global-daily-tokens", () -> "200000");
        registry.add("auralis.ai.limits.per-user-concurrent", () -> "1");
    }

    @Autowired private IdentityService identityService;
    @Autowired private SubjectService subjectService;
    @Autowired private SourceService sourceService;
    @Autowired private IngestionJobRepository jobRepository;
    @Autowired private SourceChunkRepository sourceChunkRepository;
    @Autowired private IngestionWorker worker;
    @Autowired private IngestionJobService jobService;
    @Autowired private IngestionCompletionService completionService;
    @Autowired private AiSettingsService settingsService;
    @Autowired private AiInvocationGateway invocationGateway;
    @Autowired private AiUsageGuard usageGuard;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private MutableClock clock;
    @Autowired private RecordingEmbeddingProvider embeddingProvider;

    @Test
    void embeddingWindowQuotaExemptionCompletesAllBatchesOnFirstAttempt() {
        embeddingProvider.calls.clear();
        String suffix = UUID.randomUUID().toString();
        var owner = AuthTestAccounts.register(identityService, "usage-resume-" + suffix + "@example.com",
                "correct horse battery staple",
                new DeviceCommand("usage-resume-device-" + suffix, "Test", DevicePlatform.WEB));
        var subject = subjectService.create(owner.user().id(),
                new SubjectCommand("Usage resume", null, null, "001"));
        String text = "x".repeat(36_000);
        var source = sourceService.create(owner.user().id(), new SourceCommand(
                subject.id(), SourceType.TEXT, "resume", null, null, text, null));
        IngestionJobEntity queued = jobRepository
                .findFirstByUserIdAndSourceIdOrderByCreatedAtDesc(owner.user().id(), source.id()).orElseThrow();

        clock.set(WINDOW_START);
        worker.process(owner.user().id(), queued.getId());

        IngestionJobEntity completed = jobRepository.findById(queued.getId()).orElseThrow();
        assertThat(completed.getStatus()).isEqualTo(IngestionJobStatus.READY);
        assertThat(completed.getFailureCount()).isZero();
        assertThat(completed.getAttemptCount()).isEqualTo(1);
        assertThat(embeddingProvider.calls).hasSize(2);
        assertThat(embeddingProvider.calls.getFirst()).hasSize(27);
        assertThat(embeddingProvider.calls.get(1)).hasSize(7);
        var complete = sourceChunkRepository.findAllByUserIdAndSourceIdAndGenerationOrderByOrdinalAsc(
                owner.user().id(), source.id(), completed.getGeneration());
        assertThat(complete).hasSize(34).allSatisfy(row -> assertThat(row.isActive()).isTrue());
        assertThat(sourceChunkRepository.findAllByUserIdAndSourceIdAndActiveTrueOrderByOrdinalAsc(
                owner.user().id(), source.id())).hasSize(34);
        assertThat(ingestionReservationCount(owner.user().id())).isEqualTo(2);
        assertThat(jdbc.queryForObject("select count(*) from ai_usage_reservations where user_id=? "
                + "and feature='INGESTION' and stage='INGESTION_EMBEDDING' and state='COMPLETED' "
                + "and request_dispatched=true and actual_input_tokens is null and actual_output_tokens is null",
                Integer.class, owner.user().id())).isEqualTo(2);
    }

    @Test
    void nonExemptConcurrencyDeferralReusesCheckpointAndActivatesOnlyCompleteGeneration() {
        embeddingProvider.calls.clear();
        String suffix = UUID.randomUUID().toString();
        var owner = AuthTestAccounts.register(identityService, "usage-resume-" + suffix + "@example.com",
                "correct horse battery staple",
                new DeviceCommand("usage-resume-device-" + suffix, "Test", DevicePlatform.WEB));
        var subject = subjectService.create(owner.user().id(),
                new SubjectCommand("Usage resume", null, null, "001"));
        String text = "x".repeat(36_000);
        var source = sourceService.create(owner.user().id(), new SourceCommand(
                subject.id(), SourceType.TEXT, "resume", null, null, text, null));
        IngestionJobEntity queued = jobRepository
                .findFirstByUserIdAndSourceIdOrderByCreatedAtDesc(owner.user().id(), source.id()).orElseThrow();

        clock.set(WINDOW_START);
        // Seed the persisted prefix from an earlier interrupted attempt; the worker retry below must hit a real
        // non-exempt concurrency denial while processing only the missing suffix.
        IngestionJobEntity claimedJob = jobService.claimById(owner.user().id(), queued.getId(), WINDOW_START,
                WINDOW_START.plusSeconds(300), 5).orElseThrow();
        IngestionClaim claim = IngestionClaim.from(claimedJob);
        List<TextChunk> chunks = new TextChunker(1200, 120).chunk(text);
        assertThat(chunks).hasSize(34);
        List<TextChunk> firstBatch = chunks.subList(0, 27);
        var settings = settingsService.resolveServerManagedEmbedding();
        try (AiTaskScope scope = invocationGateway.beginTask(new AiTaskContext(owner.user().id(), AiFeature.INGESTION,
                claim.jobId() + ":" + claim.generation()))) {
            var embeddings = scope.embed(AiStage.INGESTION_EMBEDDING, settings.provider(),
                    settings.credential().model(), firstBatch.stream().map(TextChunk::content).toList(),
                    settings.credential(), settings.source()).value();
            assertThat(embeddings.vectors()).hasSize(27);
            assertThat(completionService.stageCheckpoint(claim, claimedJob.getIngestionRevision(), firstBatch,
                    embeddings.vectors())).isTrue();
        }
        assertThat(completionService.defer(claim, claimedJob.getIngestionRevision(),
                WINDOW_START.plusSeconds(300), "TEST_PRIOR_BATCH_CHECKPOINT")).isTrue();
        var savedGeneration = jobRepository.findById(queued.getId()).orElseThrow().getGeneration();
        var partial = sourceChunkRepository.findAllByUserIdAndSourceIdAndGenerationOrderByOrdinalAsc(
                owner.user().id(), source.id(), savedGeneration);
        assertThat(partial).hasSize(27).allSatisfy(row -> assertThat(row.isActive()).isFalse());
        assertThat(sourceChunkRepository.findAllByUserIdAndSourceIdAndActiveTrueOrderByOrdinalAsc(
                owner.user().id(), source.id())).isEmpty();
        assertThat(ingestionReservationCount(owner.user().id())).isEqualTo(1);

        clock.set(WINDOW_START.plusSeconds(300));
        AiUsageGuard.TaskLease blockerTask = usageGuard.beginTask(
                new AiTaskContext(owner.user().id(), AiFeature.CHAT, "synthetic-chat-blocker-" + suffix, java.util.UUID.randomUUID()));
        AiUsageGuard.CallReservation blockerCall = usageGuard.reserve(blockerTask, AiStage.CHAT_COMPLETION,
                AiProviderType.DEEPSEEK, "synthetic-chat-model", AiCredentialSource.PLATFORM,
                AiOutputRole.GENERAL, 1, 0);
        usageGuard.markDispatched(blockerTask, blockerCall);

        worker.process(owner.user().id(), queued.getId());

        IngestionJobEntity deferred = jobRepository.findById(queued.getId()).orElseThrow();
        assertThat(deferred.getStatus()).isEqualTo(IngestionJobStatus.PENDING);
        assertThat(deferred.getFailureCount()).isZero();
        assertThat(deferred.getAttemptCount()).isEqualTo(2);
        assertThat(deferred.getErrorCode()).isEqualTo("AI_CONCURRENCY_LIMIT");
        assertThat(embeddingProvider.calls).hasSize(1);
        assertThat(ingestionReservationCount(owner.user().id())).isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from ai_usage_reservations where user_id=? "
                + "and feature='INGESTION' and stage='INGESTION_EMBEDDING' and state='RESERVED'",
                Integer.class, owner.user().id())).isZero();
        assertThat(sourceChunkRepository.findAllByUserIdAndSourceIdAndGenerationOrderByOrdinalAsc(
                owner.user().id(), source.id(), deferred.getGeneration())).hasSize(27)
                .allSatisfy(row -> assertThat(row.isActive()).isFalse());

        usageGuard.settle(blockerTask, blockerCall, new AiTokenUsage(1L, 0L), true, null);
        usageGuard.closeTask(blockerTask);
        clock.set(deferred.getNextAttemptAt());
        worker.process(owner.user().id(), queued.getId());

        IngestionJobEntity completed = jobRepository.findById(queued.getId()).orElseThrow();
        assertThat(completed.getStatus()).isEqualTo(IngestionJobStatus.READY);
        assertThat(completed.getGeneration()).isEqualTo(savedGeneration);
        assertThat(completed.getFailureCount()).isZero();
        assertThat(completed.getAttemptCount()).isEqualTo(3);
        assertThat(embeddingProvider.calls).hasSize(2);
        assertThat(embeddingProvider.calls.get(0)).hasSize(27);
        assertThat(embeddingProvider.calls.get(1)).hasSize(7);
        var complete = sourceChunkRepository.findAllByUserIdAndSourceIdAndGenerationOrderByOrdinalAsc(
                owner.user().id(), source.id(), completed.getGeneration());
        assertThat(complete).hasSize(34).allSatisfy(row -> assertThat(row.isActive()).isTrue());
        assertThat(sourceChunkRepository.findAllByUserIdAndSourceIdAndActiveTrueOrderByOrdinalAsc(
                owner.user().id(), source.id())).hasSize(34);
        assertThat(ingestionReservationCount(owner.user().id())).isEqualTo(2);
        assertThat(jdbc.queryForObject("select count(*) from ai_usage_reservations where user_id=? "
                + "and feature='INGESTION' and stage='INGESTION_EMBEDDING' and state='COMPLETED' "
                + "and request_dispatched=true", Integer.class, owner.user().id())).isEqualTo(2);
    }

    private int ingestionReservationCount(UUID userId) {
        return jdbc.queryForObject("select count(*) from ai_usage_reservations where user_id=? "
                + "and feature='INGESTION' and stage='INGESTION_EMBEDDING'", Integer.class, userId);
    }

    @TestConfiguration
    static class TestBeans {
        @Bean
        @Primary
        MutableClock ingestionResumeClock() {
            return new MutableClock(WINDOW_START);
        }

        @Bean
        RecordingEmbeddingProvider syntheticEmbeddingProvider() {
            return new RecordingEmbeddingProvider();
        }

        @Bean
        @Primary
        EmbeddingProviderRegistry syntheticEmbeddingRegistry(RecordingEmbeddingProvider provider) {
            return new EmbeddingProviderRegistry(List.of(provider));
        }
    }

    static final class MutableClock extends Clock {
        private final AtomicReference<Instant> current;

        MutableClock(Instant initial) { current = new AtomicReference<>(initial); }
        void set(Instant instant) { current.set(instant); }
        @Override public ZoneId getZone() { return ZoneOffset.UTC; }
        @Override public Clock withZone(ZoneId zone) { return this; }
        @Override public Instant instant() { return current.get(); }
    }

    static final class RecordingEmbeddingProvider implements EmbeddingProviderPort {
        private final List<List<String>> calls = new CopyOnWriteArrayList<>();

        @Override public AiProviderType type() { return AiProviderType.OPENAI_COMPATIBLE; }

        @Override
        public EmbeddingResult embed(List<String> texts, AiCredential credential) {
            calls.add(List.copyOf(texts));
            List<Double> vector = Collections.nCopies(1024, 0.125d);
            return new EmbeddingResult(Collections.nCopies(texts.size(), vector));
        }
    }
}
