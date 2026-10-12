package com.auralis.app;

import com.auralis.app.ai.IngestionJobStatus;
import com.auralis.app.ai.ingestion.IngestionClaim;
import com.auralis.app.ai.ingestion.IngestionCompletionService;
import com.auralis.app.ai.ingestion.IngestionJobService;
import com.auralis.app.ai.ingestion.TextChunk;
import com.auralis.app.ai.internal.persistence.IngestionJobEntity;
import com.auralis.app.ai.internal.persistence.IngestionJobRepository;
import com.auralis.app.ai.internal.persistence.SourceChunkRepository;
import com.auralis.app.identity.IdentityService;
import com.auralis.app.identity.DeviceCommand;
import com.auralis.app.identity.DevicePlatform;
import com.auralis.app.source.SourceCommand;
import com.auralis.app.source.SourceService;
import com.auralis.app.source.SourceType;
import com.auralis.app.subject.SubjectCommand;
import com.auralis.app.subject.SubjectService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(classes = AuralisApplication.class)
@ActiveProfiles("postgres-it")
class AiIngestionCheckpointPostgresTests {

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
    }

    @Autowired private IdentityService identityService;
    @Autowired private SubjectService subjectService;
    @Autowired private SourceService sourceService;
    @Autowired private IngestionJobService jobService;
    @Autowired private IngestionCompletionService completionService;
    @Autowired private IngestionJobRepository jobRepository;
    @Autowired private SourceChunkRepository sourceChunkRepository;

    @Test
    void postgresCanLoadAnInactiveCheckpointUnderSourceThenJobFences() {
        String suffix = UUID.randomUUID().toString();
        var owner = identityService.register("usage-pg-" + suffix + "@example.com",
                "correct horse battery staple", "usage-pg-" + suffix,
                new DeviceCommand("usage-pg-device-" + suffix, "Test", DevicePlatform.WEB));
        var subject = subjectService.create(owner.user().id(),
                new SubjectCommand("Usage checkpoint", null, null, "001"));
        String text = "postgres checkpoint recovery";
        var source = sourceService.create(owner.user().id(), new SourceCommand(
                subject.id(), SourceType.TEXT, "checkpoint", null, null, text, null));

        Instant now = Instant.now();
        IngestionJobEntity queued = jobRepository
                .findFirstByUserIdAndSourceIdOrderByCreatedAtDesc(owner.user().id(), source.id()).orElseThrow();
        IngestionJobEntity claimed = jobService.claimById(
                owner.user().id(), queued.getId(), now, now.plusSeconds(300), 3).orElseThrow();
        assertThat(claimed.getStatus()).isIn(IngestionJobStatus.PARSING, IngestionJobStatus.INDEXING);
        IngestionClaim claim = IngestionClaim.from(claimed);
        TextChunk chunk = new TextChunk(0, text, 0, text.length());
        List<Double> vector = java.util.Collections.nCopies(1024, 0.125d);

        assertThat(completionService.stageCheckpoint(claim, source.ingestionRevision(),
                List.of(chunk), List.of(vector))).isTrue();
        var checkpoints = completionService.loadCheckpoint(claim, source.ingestionRevision(), List.of(chunk));

        assertThat(checkpoints).containsEntry(0, vector);
        assertThat(sourceChunkRepository.findAllByUserIdAndSourceIdAndGenerationOrderByOrdinalAsc(
                owner.user().id(), source.id(), claimed.getGeneration()))
                .singleElement().satisfies(row -> assertThat(row.isActive()).isFalse());
    }
}
