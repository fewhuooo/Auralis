package com.auralis.app;

import com.auralis.app.ai.AiCredential;
import com.auralis.app.ai.AiProviderType;
import com.auralis.app.ai.EmbeddingProviderPort;
import com.auralis.app.ai.EmbeddingResult;
import com.auralis.app.ai.IngestionJobStatus;
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
        registry.add("auralis.ai.defaults.siliconflow.base-url", () -> "https://api.siliconflow.cn/v1");
        registry.add("auralis.ai.defaults.siliconflow.embedding-model", () -> "bge-m3");
        registry.add("auralis.ai.defaults.siliconflow.api-key", () -> "synthetic-test-key");
        registry.add("auralis.ai.limits.per-user-hourly-tokens", () -> "33000");
        registry.add("auralis.ai.limits.per-user-daily-tokens", () -> "100000");
        registry.add("auralis.ai.limits.global-daily-tokens", () -> "200000");
    }

    @Autowired private IdentityService identityService;
    @Autowired private SubjectService subjectService;
    @Autowired private SourceService sourceService;
    @Autowired private IngestionJobRepository jobRepository;
    @Autowired private SourceChunkRepository sourceChunkRepository;
    @Autowired private IngestionWorker worker;
    @Autowired private MutableClock clock;
    @Autowired private RecordingEmbeddingProvider embeddingProvider;

    @Test
    void quotaDeferralResumesFromDurableInactiveBatchesAndActivatesOnlyCompleteGeneration() {
        String suffix = UUID.randomUUID().toString();
        var owner = identityService.register("usage-resume-" + suffix + "@example.com",
                "correct horse battery staple", "usage-resume-" + suffix,
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

        IngestionJobEntity deferred = jobRepository.findById(queued.getId()).orElseThrow();
        assertThat(deferred.getStatus()).isEqualTo(IngestionJobStatus.PENDING);
        assertThat(deferred.getFailureCount()).isZero();
        assertThat(deferred.getAttemptCount()).isEqualTo(1);
        assertThat(deferred.getNextAttemptAt()).isEqualTo(WINDOW_START.plusSeconds(3600));
        assertThat(embeddingProvider.calls).hasSize(1);
        assertThat(embeddingProvider.calls.getFirst()).hasSize(27);
        var partial = sourceChunkRepository.findAllByUserIdAndSourceIdAndGenerationOrderByOrdinalAsc(
                owner.user().id(), source.id(), deferred.getGeneration());
        assertThat(partial).hasSize(27).allSatisfy(row -> assertThat(row.isActive()).isFalse());
        assertThat(sourceChunkRepository.findAllByUserIdAndSourceIdAndActiveTrueOrderByOrdinalAsc(
                owner.user().id(), source.id())).isEmpty();

        clock.set(WINDOW_START.plusSeconds(3600));
        worker.process(owner.user().id(), queued.getId());

        IngestionJobEntity completed = jobRepository.findById(queued.getId()).orElseThrow();
        assertThat(completed.getStatus()).isEqualTo(IngestionJobStatus.READY);
        assertThat(completed.getFailureCount()).isZero();
        assertThat(completed.getAttemptCount()).isEqualTo(2);
        assertThat(embeddingProvider.calls).hasSize(2);
        assertThat(embeddingProvider.calls.get(1)).hasSize(7);
        var complete = sourceChunkRepository.findAllByUserIdAndSourceIdAndGenerationOrderByOrdinalAsc(
                owner.user().id(), source.id(), completed.getGeneration());
        assertThat(complete).hasSize(34).allSatisfy(row -> assertThat(row.isActive()).isTrue());
        assertThat(sourceChunkRepository.findAllByUserIdAndSourceIdAndActiveTrueOrderByOrdinalAsc(
                owner.user().id(), source.id())).hasSize(34);
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

        @Override public AiProviderType type() { return AiProviderType.SILICONFLOW; }

        @Override
        public EmbeddingResult embed(List<String> texts, AiCredential credential) {
            calls.add(List.copyOf(texts));
            List<Double> vector = Collections.nCopies(1024, 0.125d);
            return new EmbeddingResult(Collections.nCopies(texts.size(), vector));
        }
    }
}
