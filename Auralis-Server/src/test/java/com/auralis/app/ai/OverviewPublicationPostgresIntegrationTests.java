package com.auralis.app.ai;

import com.auralis.app.AuralisApplication;
import com.auralis.app.ai.OverviewDtos.OverviewChapter;
import com.auralis.app.ai.OverviewDtos.OverviewResponse;
import com.auralis.app.ai.OverviewDtos.OverviewSection;
import com.auralis.app.ai.OverviewDtos.OverviewSummary;
import com.auralis.app.ai.OverviewIdentityDtos.OutlineIdentityInput;
import com.auralis.app.ai.OverviewIdentityDtos.OutlineIdentityNodeInput;
import com.auralis.app.ai.OverviewIdentityDtos.OutlineProvenanceInput;
import com.auralis.app.ai.OverviewIdentityDtos.OutlineProvenanceSectionInput;
import com.auralis.app.ai.OverviewIdentityDtos.OutlineProvenanceSourceRefInput;
import com.auralis.app.ai.internal.persistence.SourceChunkEntity;
import com.auralis.app.ai.internal.persistence.SourceChunkRepository;
import com.auralis.app.identity.AccountDeletionCleanupService;
import com.auralis.app.identity.DeviceCommand;
import com.auralis.app.identity.DevicePlatform;
import com.auralis.app.identity.IdentityService;
import com.auralis.app.shared.error.DomainException;
import com.auralis.app.subject.SubjectCommand;
import com.auralis.app.subject.SubjectService;
import com.auralis.app.source.SourceType;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.PlatformTransactionManager;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.ObjectMapper;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.Statement;
import java.time.Clock;
import java.time.Instant;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@SpringBootTest(classes = AuralisApplication.class)
@ActiveProfiles("postgres-it")
@EnabledIfSystemProperty(named = "auralis.postgres.it", matches = "true")
class OverviewPublicationPostgresIntegrationTests {
    private static final String POSTGRES_URL = requirePostgresUrl();
    private static final String APP_SCHEMA = "overview_publication_it_" + UUID.randomUUID().toString().replace("-", "");
    private static final DriverManagerDataSource ADMIN = new DriverManagerDataSource(POSTGRES_URL, "postgres", "");
    private static final String PROFILE_FINGERPRINT = "a".repeat(64);

    @Autowired private JdbcTemplate jdbc;
    @Autowired private IdentityService identityService;
    @Autowired private SubjectService subjectService;
    @Autowired private OverviewJobService jobService;
    @Autowired private OverviewJobRepository jobs;
    @Autowired private OverviewGenerationService generationService;
    @Autowired private OverviewGenerationCoordinator coordinator;
    @Autowired private OverviewExecutionJournal journal;
    @Autowired private OverviewPublicationService publicationService;
    @Autowired private OverviewPublicationRepository publicationRepository;
    @Autowired private OverviewResultService resultService;
    @Autowired private OverviewPreviewService previewService;
    @Autowired private SourceChunkRepository chunks;
    @Autowired private AccountDeletionCleanupService accountCleanup;
    @Autowired private PlatformTransactionManager transactionManager;
    @Autowired private ObjectMapper mapper;
    @Autowired private Clock clock;
    @MockitoBean private AiSettingsService settingsService;

    @DynamicPropertySource
    static void taskOwnedPostgres(DynamicPropertyRegistry registry) throws Exception {
        String vectorSchema = null;
        try (Connection connection = DriverManager.getConnection(POSTGRES_URL, "postgres", "");
             Statement statement = connection.createStatement()) {
            statement.execute("create schema " + APP_SCHEMA);
            try (ResultSet rows = statement.executeQuery("select n.nspname from pg_extension e "
                    + "join pg_namespace n on n.oid=e.extnamespace where e.extname='vector'")) {
                if (rows.next()) vectorSchema = rows.getString(1);
            }
        }
        String searchPath = APP_SCHEMA + (vectorSchema == null ? "" : "," + vectorSchema);
        registry.add("spring.datasource.url", () -> POSTGRES_URL + "?currentSchema=" + searchPath);
        registry.add("spring.datasource.username", () -> "postgres");
        registry.add("spring.datasource.password", () -> "");
        registry.add("spring.flyway.schemas", () -> APP_SCHEMA);
        registry.add("spring.flyway.default-schema", () -> APP_SCHEMA);
        registry.add("auralis.identity.jwt-secret", () -> "0123456789abcdef0123456789abcdef");
        registry.add("auralis.ai.encryption-key", () -> "0123456789abcdef0123456789abcdef");
        registry.add("auralis.ai.ingestion-worker-enabled", () -> "false");
        registry.add("auralis.ai.overview-adaptive-generation-enabled", () -> "true");
        registry.add("auralis.ai.overview-jobs-poll-ms", () -> "3600000");
        registry.add("auralis.ai.overview-publication-poll-ms", () -> "3600000");
    }

    @AfterAll
    static void dropApplicationSchema() {
        new JdbcTemplate(ADMIN).execute("drop schema if exists " + APP_SCHEMA + " cascade");
    }

    @AfterEach
    void removeJobsSoTheNextCaseClaimsOnlyItsOwnJob() {
        jdbc.update("delete from overview_generation_jobs");
    }

    @Test
    void verifiedPreviewAndNativeSubjectPublicationUseSelectedTextUrlInputsAndCanonicalChunkProvenance() {
        Fixture fixture = completedSubject(OverviewMode.ALL);
        OverviewPreviewDtos.Page page = previewService.page(fixture.userId(), fixture.jobId(), 20, null);
        assertThat(page.planId()).isEqualTo(fixture.planId());
        assertThat(page.incomplete()).isFalse();
        assertThat(page.nodes()).hasSize(1);
        assertThatThrownBy(() -> previewService.node(UUID.randomUUID(), fixture.jobId(), fixture.nodeId(), fixture.planId()))
                .isInstanceOf(DomainException.class);
        assertThatThrownBy(() -> previewService.node(fixture.userId(), fixture.jobId(), fixture.nodeId(), UUID.randomUUID()))
                .isInstanceOf(DomainException.class);

        OverviewPreviewDtos.NodeView node = previewService.node(fixture.userId(), fixture.jobId(), fixture.nodeId(), fixture.planId());
        assertThat(node.fragments()).hasSize(1);
        assertThat(node.fragments().getFirst().section().sourceIds()).containsExactlyInAnyOrderElementsOf(
                fixture.sourceIds().stream().map(UUID::toString).toList());
        assertThat(node.fragments().getFirst().provenance()).extracting(ref -> ref.sourceId()).containsExactlyInAnyOrderElementsOf(fixture.sourceIds());
        assertThat(node.fragments().getFirst().provenance()).extracting(ref -> ref.chunkId()).containsExactlyInAnyOrderElementsOf(fixture.chunkIds());
        assertThat(node.fragments().getFirst().provenance()).allSatisfy(ref -> assertThat(ref.ingestionRevision()).isNotNull());

        String verifiedPayload = jdbc.queryForObject("select payload_json from overview_generation_checkpoints "
                        + "where generation_id=? and step_key=?", String.class,
                fixture.job().generationId(), "native-writer-node");
        jdbc.update("update overview_generation_checkpoints set payload_json=? where generation_id=? and step_key=?",
                verifiedPayload + " ", fixture.job().generationId(), "native-writer-node");
        assertThatThrownBy(() -> previewService.node(fixture.userId(), fixture.jobId(), fixture.nodeId(), fixture.planId()))
                .isInstanceOf(DomainException.class);

        OverviewPublicationDtos.PublicationView published = publish(fixture, UUID.randomUUID());
        assertThat(published.state()).isEqualTo(OverviewPublicationDtos.State.PUBLISHED);
        OverviewResultView saved = resultService.getSubject(fixture.userId(), fixture.subjectId());
        assertThat(saved.scopeType()).isEqualTo("SUBJECT");
        assertThat(saved.outlineInputDescriptor().origin()).isEqualTo(OverviewInputDescriptor.Origin.SOURCE_CONTENT);
        assertThat(saved.summaryInputDescriptor().origin()).isEqualTo(OverviewInputDescriptor.Origin.SOURCE_CONTENT);
        assertThat(saved.outlineSourceManifest()).isEmpty();
        assertThat(saved.outlineProvenance().sections().getFirst().sourceRefs())
                .extracting(ref -> ref.chunkId()).containsExactlyInAnyOrderElementsOf(fixture.chunkIds());
        assertThat(saved.outlineProvenance().sections().getFirst().sourceRefs())
                .extracting(ref -> ref.sourceId()).containsExactlyInAnyOrderElementsOf(fixture.sourceIds());
        OverviewOutlineView outline = resultService.getSubjectOutline(fixture.userId(), fixture.subjectId());
        OverviewOutlineView.OutlineNode sectionNode = outline.nodes().stream().filter(sectionCandidate -> !sectionCandidate.chapter()).findFirst().orElseThrow();
        OverviewSectionView section = resultService.getSubjectSection(fixture.userId(), fixture.subjectId(),
                sectionNode.sectionId(), saved.version());
        assertThat(section.section().summary()).isEqualTo("Native body");
        assertThatThrownBy(() -> resultService.getSubjectSection(fixture.userId(), fixture.subjectId(),
                sectionNode.sectionId(), saved.version() - 1)).isInstanceOf(DomainException.class);
        assertThatThrownBy(() -> resultService.getSubjectSection(fixture.userId(), fixture.subjectId(),
                UUID.randomUUID(), saved.version())).isInstanceOf(DomainException.class);
        verify(settingsService, never()).resolveJobSettings(any(), any(), any());
    }

    @Test
    void formalSubjectPutAdoptsDifferentCurrentCandidateInputAndOutlinePreservesSummaryBinding() {
        Owner owner = owner();
        UUID subjectId = createSubject(owner.userId(), "Candidate adoption subject");
        SourceFixture firstText = source(owner.userId(), subjectId, SourceType.TEXT,
                "First selected source", "first source evidence");
        SourceFixture secondUrl = source(owner.userId(), subjectId, SourceType.URL,
                "Second selected source", "second source evidence");

        Fixture first = complete(owner.userId(), subjectId, List.of(firstText), OverviewJobDtos.Scope.SUBJECT, OverviewMode.ALL);
        assertThat(publish(first, UUID.randomUUID()).state()).isEqualTo(OverviewPublicationDtos.State.PUBLISHED);
        OverviewResultView before = resultService.getSubject(owner.userId(), subjectId);
        Instant preservedSummaryAt = before.summaryGeneratedAt();
        OverviewInputDescriptor preservedSummaryInput = before.summaryInputDescriptor();

        Fixture second = complete(owner.userId(), subjectId, List.of(secondUrl), OverviewJobDtos.Scope.SUBJECT, OverviewMode.OUTLINE);
        OverviewResponse editedOutline = new OverviewResponse(second.candidate().schemaVersion(), "Adopted edited outline",
                second.candidate().outline(), null, second.candidate().outlineProvenance());
        UUID clientWriteId = UUID.randomUUID();
        OverviewResultCommand adoption = new OverviewResultCommand(before.version(), clientWriteId, OverviewMode.OUTLINE,
                null, null, null, Instant.now().minusSeconds(60), null, editedOutline,
                new OutlineIdentityInput(1, List.of(
                        new OutlineIdentityNodeInput(List.of(0), null),
                        new OutlineIdentityNodeInput(List.of(0, 0), null))),
                null, null, new OverviewResultCommand.CandidateInput(second.jobId(), second.job().version()));

        OverviewResultView saved = resultService.putSubject(owner.userId(), subjectId, adoption);
        assertThat(saved.version()).isEqualTo(before.version() + 1);
        assertThat(saved.outlineVersion()).isEqualTo(before.outlineVersion() + 1);
        assertThat(saved.summaryVersion()).isEqualTo(before.summaryVersion());
        assertThat(saved.outline().getFirst().title()).isEqualTo(second.candidate().outline().getFirst().title());
        assertThat(saved.summary()).isEqualTo(before.summary());
        assertThat(saved.outlineGeneratedAt()).isEqualTo(adoption.outlineGeneratedAt());
        assertThat(saved.summaryGeneratedAt()).isEqualTo(preservedSummaryAt);
        assertThat(saved.outlineInputDescriptor().origin()).isEqualTo(OverviewInputDescriptor.Origin.SOURCE_CONTENT);
        assertThat(saved.outlineInputDescriptor().sourceIds()).containsExactly(secondUrl.sourceId());
        assertThat(saved.summaryInputDescriptor()).isEqualTo(preservedSummaryInput);
        assertThat(saved.outlineProvenance().sections().getFirst().sourceRefs())
                .extracting(ref -> ref.sourceId()).containsExactly(secondUrl.sourceId());

        OverviewResultView replay = resultService.putSubject(owner.userId(), subjectId, adoption);
        assertThat(replay.version()).isEqualTo(saved.version());
        OverviewResponse firstCandidateOutline = new OverviewResponse(first.candidate().schemaVersion(),
                first.candidate().title(), first.candidate().outline(), null, first.candidate().outlineProvenance());
        OverviewResultCommand changedReference = new OverviewResultCommand(before.version(), clientWriteId, OverviewMode.OUTLINE,
                null, null, null, adoption.outlineGeneratedAt(), null, firstCandidateOutline,
                null, null, null, new OverviewResultCommand.CandidateInput(first.jobId(), first.job().version()));
        assertThatThrownBy(() -> resultService.putSubject(owner.userId(), subjectId, changedReference))
                .isInstanceOf(DomainException.class);
        assertThat(jdbc.queryForObject("select count(*) from overview_write_receipts where user_id=? and client_write_id=?",
                Integer.class, owner.userId(), clientWriteId)).isEqualTo(1);
        assertThat(resultService.getSubject(owner.userId(), subjectId).version()).isEqualTo(saved.version());
    }

    @Test
    void formalSourcePutCanSeedFromCompletedCurrentCandidateWithoutAStoredFileOverview() {
        Fixture fixture = completedSource(OverviewMode.ALL, false);
        SourceFixture source = fixture.sourceFixtures().getFirst();
        OverviewResponse edited = new OverviewResponse(fixture.candidate().schemaVersion(), "Edited source candidate",
                fixture.candidate().outline(), fixture.candidate().summary(), fixture.candidate().outlineProvenance());
        UUID clientWriteId = UUID.randomUUID();
        OverviewResultCommand adoption = new OverviewResultCommand(0L, clientWriteId, OverviewMode.ALL,
                source.revision(), null, null, Instant.now().minusSeconds(120),
                Instant.now().minusSeconds(60), edited,
                new OutlineIdentityInput(1, List.of(
                        new OutlineIdentityNodeInput(List.of(0), null),
                        new OutlineIdentityNodeInput(List.of(0, 0), null))),
                null, null,
                new OverviewResultCommand.CandidateInput(fixture.jobId(), fixture.job().version()));

        OverviewResultView saved = resultService.putSource(fixture.userId(), source.sourceId(), adoption);
        assertThat(saved.version()).isEqualTo(1);
        assertThat(saved.title()).isEqualTo("Edited source candidate");
        assertThat(saved.outlineInputDescriptor().origin()).isEqualTo(OverviewInputDescriptor.Origin.SOURCE_CONTENT);
        assertThat(saved.summaryInputDescriptor().origin()).isEqualTo(OverviewInputDescriptor.Origin.SOURCE_CONTENT);
        assertThat(saved.outlineInputDescriptor().sourceIds()).containsExactly(source.sourceId());
        assertThat(resultService.getSource(fixture.userId(), source.sourceId(), source.revision()).version()).isEqualTo(1);
        assertThat(resultService.putSource(fixture.userId(), source.sourceId(), adoption).version()).isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from overview_write_receipts where user_id=? and client_write_id=?",
                Integer.class, fixture.userId(), clientWriteId)).isEqualTo(1);
    }

    @Test
    void publisherRecoversDurablePendingIntentAfterProcessLossAndConcurrentReplayDoesNotDoubleWrite() throws Exception {
        Fixture fixture = completedSubject(OverviewMode.ALL);
        UUID clientPublishId = UUID.randomUUID();
        OverviewJobRepository.JobRow job = jobs.get(fixture.userId(), fixture.jobId());
        OverviewResponse candidate = mapper.readValue(job.candidateJson(), OverviewResponse.class);
        String candidateHash = sha256(mapper.writeValueAsString(candidate));
        String requestHash = sha256(mapper.writeValueAsString(List.of(job.id(), fixture.planId(), clientPublishId,
                job.version(), job.publicationBaseVersion(), candidateHash)));
        OverviewPublicationRepository.Intent pending = publicationRepository.prepare(fixture.userId(), job,
                fixture.planId(), clientPublishId, job.version(), job.publicationBaseVersion(), requestHash,
                candidateHash, fixture.sourceIds());
        assertThat(pending.state()).isEqualTo(OverviewPublicationDtos.State.PENDING);

        OverviewPublicationService restartedPublisher = new OverviewPublicationService(publicationRepository, jobs,
                jobService, generationService, resultService, jdbc, mapper,
                clock, transactionManager);

        ExecutorService pool = Executors.newFixedThreadPool(2);
        CountDownLatch start = new CountDownLatch(1);
        try {
            Future<OverviewPublicationDtos.PublicationView> first = pool.submit(() -> {
                start.await();
                restartedPublisher.recoverPendingPublications();
                return restartedPublisher.get(fixture.userId(), fixture.jobId());
            });
            Future<OverviewPublicationDtos.PublicationView> second = pool.submit(() -> {
                start.await();
                return publicationService.publish(fixture.userId(), fixture.jobId(),
                        new OverviewPublicationDtos.PublishRequest(clientPublishId, job.version(), job.publicationBaseVersion()));
            });
            start.countDown();
            OverviewPublicationDtos.PublicationView a = first.get();
            OverviewPublicationDtos.PublicationView b = second.get();
            assertThat(a.state()).isEqualTo(OverviewPublicationDtos.State.PUBLISHED);
            assertThat(b.state()).isEqualTo(OverviewPublicationDtos.State.PUBLISHED);
            assertThat(a.resultId()).isEqualTo(b.resultId());
            assertThat(a.resultVersion()).isEqualTo(b.resultVersion());
        OverviewPublicationRepository.Intent publishedIntent = publicationRepository.get(fixture.userId(), fixture.jobId());
        assertThat(publishedIntent.clientPublishId()).isEqualTo(clientPublishId);
        OverviewPublicationDtos.PublicationView retry = restartedPublisher.publish(fixture.userId(), fixture.jobId(),
                new OverviewPublicationDtos.PublishRequest(clientPublishId, job.version(), job.publicationBaseVersion()));
        assertThat(retry.resultId()).isEqualTo(a.resultId());
        assertThat(retry.resultVersion()).isEqualTo(a.resultVersion());
        assertThatThrownBy(() -> restartedPublisher.publish(fixture.userId(), fixture.jobId(),
                new OverviewPublicationDtos.PublishRequest(UUID.randomUUID(), job.version(), job.publicationBaseVersion())))
                .isInstanceOf(DomainException.class);
        OverviewResponse changedCandidate = new OverviewResponse(fixture.candidate().schemaVersion(),
                "Changed private candidate", fixture.candidate().outline(), fixture.candidate().summary(),
                fixture.candidate().outlineProvenance());
        jdbc.update("update overview_generation_jobs set candidate_json=? where id=?",
                mapper.writeValueAsString(changedCandidate), fixture.jobId());
        assertThatThrownBy(() -> restartedPublisher.publish(fixture.userId(), fixture.jobId(),
                new OverviewPublicationDtos.PublishRequest(clientPublishId, job.version(), job.publicationBaseVersion())))
                .isInstanceOf(DomainException.class);
        } finally {
            pool.shutdownNow();
        }
        assertThat(jdbc.queryForObject("select count(*) from overview_results where user_id=? and scope_type='SUBJECT' and scope_id=?",
                Integer.class, fixture.userId(), fixture.subjectId())).isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from overview_write_receipts where user_id=? and client_write_id=?",
                Integer.class, fixture.userId(), publicationRepository.get(fixture.userId(), fixture.jobId()).clientWriteId())).isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from overview_publication_intents where job_id=? and status='PUBLISHED'",
                Integer.class, fixture.jobId())).isEqualTo(1);
        assertThat(resultService.getSubject(fixture.userId(), fixture.subjectId()).version()).isEqualTo(1);
    }

    @Test
    void manualFormalEditAfterEnqueueMakesPublicationConflictAndKeepsCandidateAndManualReceipt() {
        Fixture fixture = completedSource(OverviewMode.ALL, true);
        OverviewJobRepository.JobRow job = jobs.get(fixture.userId(), fixture.jobId());
        UUID manualWrite = UUID.randomUUID();
        OverviewResponse manualSummary = new OverviewResponse(1, "Manual current", null,
                new OverviewSummary("Manual summary wins", List.of("manual"), List.of("manual next")));
        resultService.putSource(fixture.userId(), fixture.sourceIds().getFirst(), new OverviewResultCommand(
                1L, manualWrite, OverviewMode.SUMMARY, fixture.revisions().getFirst(), null, null, null,
                Instant.now(), manualSummary));

        OverviewPublicationDtos.PublicationView conflict = publish(fixture, UUID.randomUUID());
        assertThat(conflict.state()).isEqualTo(OverviewPublicationDtos.State.CONFLICT);
        OverviewResultView current = resultService.getSource(fixture.userId(), fixture.sourceIds().getFirst(), null);
        assertThat(current.version()).isEqualTo(2);
        assertThat(current.summary().overview()).isEqualTo("Manual summary wins");
        assertThat(jobs.get(fixture.userId(), fixture.jobId()).candidateJson()).isNotBlank();
        assertThat(jdbc.queryForObject("select count(*) from overview_write_receipts where user_id=? and client_write_id=?",
                Integer.class, fixture.userId(), manualWrite)).isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from overview_publication_intents where job_id=? and status='CONFLICT'",
                Integer.class, fixture.jobId())).isEqualTo(1);
    }

    @Test
    void receiptFailureRollsBackFormalResultAndPublishedStateThenSameIntentRetriesSafely() throws Exception {
        Fixture fixture = completedSubject(OverviewMode.ALL);
        String function = APP_SCHEMA + ".reject_overview_receipt_" + UUID.randomUUID().toString().replace("-", "");
        String trigger = "reject_overview_receipt_" + UUID.randomUUID().toString().replace("-", "");
        jdbc.execute("create function " + function + "() returns trigger language plpgsql as $$ begin "
                + "raise exception 'synthetic receipt write failure'; end $$");
        jdbc.execute("create trigger " + trigger + " before insert on overview_write_receipts for each row execute function " + function + "()");
        try {
            OverviewPublicationDtos.PublicationView failed = publish(fixture, UUID.randomUUID());
            assertThat(failed.state()).isEqualTo(OverviewPublicationDtos.State.PENDING);
            assertThat(jdbc.queryForObject("select count(*) from overview_results where user_id=? and scope_type='SUBJECT' and scope_id=?",
                    Integer.class, fixture.userId(), fixture.subjectId())).isZero();
            assertThat(jdbc.queryForObject("select count(*) from overview_write_receipts where user_id=?",
                    Integer.class, fixture.userId())).isZero();
            assertThat(jdbc.queryForObject("select count(*) from overview_publication_intents where job_id=? and status='PENDING' and attempt_count=1",
                    Integer.class, fixture.jobId())).isEqualTo(1);
        } finally {
            jdbc.execute("drop trigger if exists " + trigger + " on overview_write_receipts");
            jdbc.execute("drop function if exists " + function + "()");
        }
        jdbc.update("update overview_publication_intents set retry_at=now()-interval '1 second' where job_id=? and status='PENDING'",
                fixture.jobId());
        OverviewPublicationDtos.PublicationView retry = publish(fixture, publicationClientId(fixture));
        assertThat(retry.state()).isEqualTo(OverviewPublicationDtos.State.PUBLISHED);
        assertThat(jdbc.queryForObject("select count(*) from overview_results where user_id=? and scope_type='SUBJECT' and scope_id=?",
                Integer.class, fixture.userId(), fixture.subjectId())).isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from overview_write_receipts where user_id=?",
                Integer.class, fixture.userId())).isEqualTo(1);
    }

    @Test
    void outlinePublicationPreservesSummaryAndCannotSeedAnAbsentResult() {
        Fixture existing = completedSource(OverviewMode.OUTLINE, true);
        OverviewResultView before = resultService.getSource(existing.userId(), existing.sourceIds().getFirst(), null);
        OverviewPublicationDtos.PublicationView outline = publish(existing, UUID.randomUUID());
        assertThat(outline.state()).isEqualTo(OverviewPublicationDtos.State.PUBLISHED);
        OverviewResultView after = resultService.getSource(existing.userId(), existing.sourceIds().getFirst(), null);
        assertThat(after.version()).isEqualTo(before.version() + 1);
        assertThat(after.outlineVersion()).isEqualTo(before.outlineVersion() + 1);
        assertThat(after.summaryVersion()).isEqualTo(before.summaryVersion());
        assertThat(after.summary()).isEqualTo(before.summary());
        assertThat(after.summaryGeneratedAt()).isEqualTo(before.summaryGeneratedAt());
        assertThat(after.summaryInputDescriptor()).isEqualTo(before.summaryInputDescriptor());

        Fixture absent = completedSource(OverviewMode.OUTLINE, false);
        assertThat(absent.job().publicationBaseVersion()).isZero();
        assertThatThrownBy(() -> publish(absent, UUID.randomUUID())).isInstanceOf(DomainException.class)
                .hasMessageContaining("requires a current complete formal result");
        assertThat(publicationRepository.get(absent.userId(), absent.jobId())).isNull();
    }

    @Test
    void sourceRevisionMoveAndSoftDeleteAfterStartRejectPublicationAndPreview() {
        Fixture revisionChanged = completedSubject(OverviewMode.ALL);
        jdbc.update("update sources set ingestion_revision=? where id=?", UUID.randomUUID(), revisionChanged.sourceIds().getFirst());
        assertStalePublicationAndPreview(revisionChanged);

        Fixture moved = completedSubject(OverviewMode.ALL);
        UUID otherSubject = createSubject(moved.userId(), "Moved target");
        jdbc.update("update sources set subject_id=? where id=?", otherSubject, moved.sourceIds().getFirst());
        assertStalePublicationAndPreview(moved);

        Fixture deleted = completedSubject(OverviewMode.ALL);
        jdbc.update("update sources set deleted_at=now() where id=?", deleted.sourceIds().getFirst());
        assertStalePublicationAndPreview(deleted);
    }

    @Test
    void cancelWinnerRevokesOldJobFenceAndPreventsPublication() {
        Fixture queued = queuedSource();
        OverviewJobRepository.JobRow claimed = jobs.claimNext(UUID.randomUUID(), 60_000, 240_000);
        assertThat(claimed.id()).isEqualTo(queued.jobId());
        OverviewJobRepository.JobRow cancelling = jobs.control(queued.userId(), queued.jobId(), claimed.version(),
                OverviewJobRepository.Control.CANCEL);
        assertThat(cancelling.status()).isEqualTo(OverviewJobDtos.Status.CANCELLING);
        assertThat(cancelling.workerFence()).isGreaterThan(claimed.workerFence());
        assertThatThrownBy(() -> jobs.finish(claimed.lease(), "{}" )).isInstanceOf(DomainException.class);
        assertThat(jobs.claimNext(UUID.randomUUID(), 60_000, 240_000)).isNull();
        assertThat(jobs.get(queued.userId(), queued.jobId()).status()).isEqualTo(OverviewJobDtos.Status.CANCELLED);
        assertThatThrownBy(() -> publicationService.publish(queued.userId(), queued.jobId(),
                new OverviewPublicationDtos.PublishRequest(UUID.randomUUID(), cancelling.version(), 0)))
                .isInstanceOf(DomainException.class);
        assertThat(publicationRepository.get(queued.userId(), queued.jobId())).isNull();
    }

    @Test
    void physicalAccountDeletionCascadesPendingPublicationIntent() throws Exception {
        Fixture fixture = completedSubject(OverviewMode.ALL);
        createPendingIntent(fixture, UUID.randomUUID());
        assertThat(jdbc.queryForObject("select count(*) from overview_publication_intents where job_id=?",
                Integer.class, fixture.jobId())).isEqualTo(1);
        var deletion = identityService.requestAccountDeletion(fixture.userId(), "correct horse battery staple");
        jdbc.update("update account_deletion_jobs set not_before=now()-interval '1 second' where id=?", deletion.id());

        accountCleanup.processPending();

        assertThat(jdbc.queryForObject("select count(*) from users where id=?", Integer.class, fixture.userId())).isZero();
        assertThat(jdbc.queryForObject("select count(*) from overview_publication_intents where user_id=?", Integer.class,
                fixture.userId())).isZero();
    }

    private void assertStalePublicationAndPreview(Fixture fixture) {
        assertThatThrownBy(() -> publish(fixture, UUID.randomUUID())).isInstanceOf(DomainException.class);
        assertThatThrownBy(() -> previewService.page(fixture.userId(), fixture.jobId(), 20, null))
                .isInstanceOf(DomainException.class);
        assertThat(publicationRepository.get(fixture.userId(), fixture.jobId())).isNull();
    }

    private OverviewPublicationDtos.PublicationView publish(Fixture fixture, UUID clientPublishId) {
        OverviewJobRepository.JobRow job = jobs.get(fixture.userId(), fixture.jobId());
        return publicationService.publish(fixture.userId(), fixture.jobId(), new OverviewPublicationDtos.PublishRequest(
                clientPublishId, job.version(), job.publicationBaseVersion()));
    }

    private UUID publicationClientId(Fixture fixture) {
        return publicationRepository.get(fixture.userId(), fixture.jobId()).clientPublishId();
    }

    private OverviewPublicationRepository.Intent createPendingIntent(Fixture fixture, UUID clientPublishId) throws Exception {
        OverviewJobRepository.JobRow job = jobs.get(fixture.userId(), fixture.jobId());
        OverviewResponse candidate = mapper.readValue(job.candidateJson(), OverviewResponse.class);
        String candidateHash = sha256(mapper.writeValueAsString(candidate));
        String requestHash = sha256(mapper.writeValueAsString(List.of(job.id(), fixture.planId(), clientPublishId,
                job.version(), job.publicationBaseVersion(), candidateHash)));
        return publicationRepository.prepare(fixture.userId(), job, fixture.planId(), clientPublishId, job.version(),
                job.publicationBaseVersion(), requestHash, candidateHash, fixture.sourceIds());
    }

    private Fixture completedSubject(OverviewMode mode) {
        Owner owner = owner();
        UUID subjectId = createSubject(owner.userId(), "Native selected source subject");
        SourceFixture text = source(owner.userId(), subjectId, SourceType.TEXT, "Selected text source", "text evidence");
        SourceFixture url = source(owner.userId(), subjectId, SourceType.URL, "Selected URL source", "url evidence");
        source(owner.userId(), subjectId, SourceType.FILE, "Unselected file source", "not part of this job");
        return complete(owner.userId(), subjectId, List.of(text, url), OverviewJobDtos.Scope.SUBJECT, mode);
    }

    private Fixture completedSource(OverviewMode mode, boolean seedFormal) {
        Owner owner = owner();
        UUID subjectId = createSubject(owner.userId(), "Native source subject");
        SourceFixture source = source(owner.userId(), subjectId, SourceType.TEXT, "Selected source", "source evidence");
        if (seedFormal) seedSourceResult(owner.userId(), source);
        return complete(owner.userId(), subjectId, List.of(source), OverviewJobDtos.Scope.SOURCE, mode);
    }

    private Fixture queuedSource() {
        Owner owner = owner();
        UUID subjectId = createSubject(owner.userId(), "Queued source subject");
        SourceFixture source = source(owner.userId(), subjectId, SourceType.TEXT, "Queued source", "queued evidence");
        stubSyntheticProfile(owner.userId());
        OverviewJobDtos.StartRequest request = new OverviewJobDtos.StartRequest(UUID.randomUUID(),
                OverviewJobDtos.Scope.SOURCE, source.sourceId(), null, null, OverviewJobDtos.Mode.ALL, null);
        OverviewJobDtos.JobView started = jobService.start(owner.userId(), request);
        return new Fixture(owner.userId(), subjectId, List.of(source.sourceId()), List.of(source.chunkId()),
                List.of(source.revision()), started.jobId(), null, null, null, null, null, null);
    }

    private Fixture complete(UUID userId, UUID subjectId, List<SourceFixture> sources,
                             OverviewJobDtos.Scope scope, OverviewMode mode) {
        stubSyntheticProfile(userId);
        List<UUID> sourceIds = sources.stream().map(SourceFixture::sourceId).toList();
        OverviewJobDtos.StartRequest request = scope == OverviewJobDtos.Scope.SOURCE
                ? new OverviewJobDtos.StartRequest(UUID.randomUUID(), scope, sourceIds.getFirst(), null, null,
                    mode == OverviewMode.ALL ? OverviewJobDtos.Mode.ALL : OverviewJobDtos.Mode.OUTLINE, null)
                : new OverviewJobDtos.StartRequest(UUID.randomUUID(), scope, null, subjectId, sourceIds,
                    mode == OverviewMode.ALL ? OverviewJobDtos.Mode.ALL : OverviewJobDtos.Mode.OUTLINE, null);
        OverviewJobDtos.JobView started = jobService.start(userId, request);
        OverviewJobRepository.JobRow queued = jobs.get(userId, started.jobId());
        OverviewJobRepository.JobRow claimed = jobs.claimNext(UUID.randomUUID(), 60_000, 240_000);
        assertThat(claimed.id()).isEqualTo(started.jobId());
        OverviewGenerationCoordinator.Request generationRequest = new OverviewGenerationCoordinator.Request(userId,
                queued.generationRequestId(), queued.scopeType(), queued.scopeId(),
                scope == OverviewJobDtos.Scope.SOURCE ? sources.getFirst().revision() : null, queued.inputFingerprint(),
                "c".repeat(64), queued.profileFingerprint(), queued.algorithmVersion());
        OverviewGenerationCoordinator.Acquisition acquisition = coordinator.acquire(generationRequest);
        assertThat(acquisition.state()).isEqualTo(OverviewGenerationCoordinator.AcquisitionState.OWNER);
        jobs.bindGeneration(claimed.lease(), acquisition.generationId(), acquisition.budgetTaskId());

        List<OverviewInputDescriptor.OverviewPartInputUnit> units = readUnits(queued.sourceManifestJson());
        String checkpointStep = "native-writer-node";
        String descriptorJson = mapper.writeValueAsString(new PreviewNodeDescriptor(0, checkpointStep,
                sha256(checkpointStep), 0, "Native chapter", "Native section", "Verified summary",
                units.stream().map(unit -> new PreviewUnitRef(unit.alias(), unit.sourceId(), unit.sourceRevision(),
                        unit.chunkId(), unit.generation(), unit.ordinal(), unit.contentHash(), unit.charStart(),
                        unit.charEnd())).toList()));
        String planJson = mapper.writeValueAsString(Map.of("nodes", List.of(Map.of("checkpointStep", checkpointStep))));
        OverviewExecutionJournal.OpenResult plan = journal.openPlan(acquisition.lease(), sha256(planJson), mode.name(),
                planJson, List.of(new OverviewExecutionJournal.NodeSpec(descriptorJson, sha256(descriptorJson), checkpointStep)));
        OverviewExecutionJournal.Attempt attempt = journal.beginAttempt(acquisition.lease(), plan.nodes().getFirst());
        List<String> aliases = units.stream().map(OverviewInputDescriptor.OverviewPartInputUnit::alias).toList();
        OverviewResponse verified = response(OverviewMode.OUTLINE, sources, aliases, false);
        String verifiedJson = mapper.writeValueAsString(verified);
        journal.verifyAndSaveCheckpoint(acquisition.lease(), attempt, checkpointStep, verifiedJson);
        String payloadStep = "step_" + sha256("OVERVIEW_ADAPTIVE_WRITER_PAYLOAD_V1|" + checkpointStep);
        coordinator.saveCheckpoint(acquisition.lease(), payloadStep, queued.inputFingerprint(),
                queued.profileFingerprint(), queued.algorithmVersion(), 1, verifiedJson);
        List<Map<String, Object>> proofUnits = units.stream().map(unit -> Map.<String, Object>of(
                "alias", unit.alias(), "sourceId", unit.sourceId(), "sourceRevision", unit.sourceRevision(),
                "chunkId", unit.chunkId(), "generation", unit.generation(), "ordinal", unit.ordinal(),
                "originContentHash", unit.contentHash(), "charStart", unit.charStart(), "charEnd", unit.charEnd(),
                "textSha256", sha256(unit.contentHash()))).toList();
        String resultStep = "step_" + sha256("OVERVIEW_ADAPTIVE_WRITER_RESULT_V1|" + checkpointStep);
        Map<String, Object> fragment = Map.of("path", "root", "fragmentOrdinal", 0,
                "sectionTitle", "Native section", "bodySha256", sha256("Native body"),
                "coveredTopicIds", List.of("topic000001"), "units", proofUnits);
        Map<String, Object> result = Map.of("kind", "OVERVIEW_ADAPTIVE_WRITER_RESULT", "version", 1,
                "parentStep", checkpointStep, "parentPromptSha256", sha256(checkpointStep),
                "parentPayloadSha256", sha256(verifiedJson), "parentPayloadStep", payloadStep,
                "assignedTopicIds", List.of("topic000001"), "coveredTopicIds", List.of("topic000001"),
                "children", List.of(), "fragments", List.of(fragment));
        coordinator.saveCheckpoint(acquisition.lease(), resultStep, queued.inputFingerprint(),
                queued.profileFingerprint(), queued.algorithmVersion(), 1, mapper.writeValueAsString(result));
        journal.markAssembled(acquisition.lease(), plan.planId());

        OverviewResponse candidate = response(mode, sources, sourceIds.stream().map(UUID::toString).toList(), true);
        jobs.finish(claimed.lease(), mapper.writeValueAsString(candidate));
        OverviewJobRepository.JobRow completed = jobs.get(userId, started.jobId());
        return new Fixture(userId, subjectId, sourceIds, sources.stream().map(SourceFixture::chunkId).toList(),
                sources.stream().map(SourceFixture::revision).toList(), started.jobId(), completed, plan.planId(),
                plan.nodes().getFirst().id(), candidate, acquisition.lease(), sources);
    }

    private OverviewResponse response(OverviewMode mode, List<SourceFixture> sources, List<String> sourceIds,
                                     boolean provenance) {
        OverviewSection section = new OverviewSection("Native section", "Native body", sourceIds, null);
        OverviewSummary summary = mode == OverviewMode.OUTLINE ? null
                : new OverviewSummary("Native summary", List.of("native point"), List.of("native next"));
        OutlineProvenanceInput proof = null;
        if (provenance) {
            proof = new OutlineProvenanceInput(1, List.of(new OutlineProvenanceSectionInput(List.of(0, 0),
                    sources.stream().map(source -> new OutlineProvenanceSourceRefInput(source.sourceId(), source.revision(),
                            source.chunkId(), source.generation(), 0, source.content().length())).toList())));
        }
        return new OverviewResponse(1, "Native publication", List.of(new OverviewChapter("Native chapter", List.of(section))),
                summary, proof);
    }

    private void seedSourceResult(UUID userId, SourceFixture source) {
        OverviewResponse result = response(OverviewMode.ALL, List.of(source), List.of(source.sourceId().toString()), false);
        OutlineIdentityInput identity = new OutlineIdentityInput(1, List.of(
                new OutlineIdentityNodeInput(List.of(0), null), new OutlineIdentityNodeInput(List.of(0, 0), null)));
        resultService.putSource(userId, source.sourceId(), new OverviewResultCommand(0L, UUID.randomUUID(), OverviewMode.ALL,
                source.revision(), null, null, Instant.now(), Instant.now(), result, identity, null));
    }

    private List<OverviewInputDescriptor.OverviewPartInputUnit> readUnits(String json) {
        try { return mapper.readValue(json, new TypeReference<>() { }); }
        catch (Exception failure) { throw new IllegalStateException("Could not read the captured raw manifest", failure); }
    }

    private Owner owner() {
        String suffix = UUID.randomUUID().toString().replace("-", "");
        var registered = identityService.register("m34-pub-" + suffix, "correct horse battery staple", "M34 publication test",
                new DeviceCommand("m34-publication-" + suffix, "Test", DevicePlatform.WEB));
        stubSyntheticProfile(registered.user().id());
        return new Owner(registered.user().id());
    }

    private UUID createSubject(UUID userId, String name) {
        return subjectService.create(userId, new SubjectCommand(name + " " + UUID.randomUUID(), null, null,
                UUID.randomUUID().toString())).id();
    }

    private SourceFixture source(UUID userId, UUID subjectId, SourceType type, String title, String content) {
        UUID sourceId = UUID.randomUUID();
        UUID revision = UUID.randomUUID();
        jdbc.update("insert into sources (id,user_id,type,subject_id,title,raw_text,ingestion_status,ingestion_revision) "
                        + "values (?,?,?,?,?,?,?,?)", sourceId, userId, type.name(), subjectId, title, content, "READY", revision);
        UUID chunkId = UUID.randomUUID();
        UUID generation = UUID.randomUUID();
        chunks.saveAndFlush(new SourceChunkEntity(chunkId, userId, sourceId, 0, content, sha256(content), 0,
                content.length(), "[]", generation, true));
        return new SourceFixture(sourceId, revision, chunkId, generation, content);
    }

    private void stubSyntheticProfile(UUID userId) {
        when(settingsService.jobProfileMetadata(eq(userId), any())).thenReturn(new AiSettingsService.JobProfileMetadata(
                AiProviderType.OPENAI_COMPATIBLE, "synthetic-model", "https://provider.invalid/v1",
                com.auralis.app.ai.usage.AiCredentialSource.USER_SUPPLIED, PROFILE_FINGERPRINT));
    }

    private static String sha256(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception unavailable) {
            throw new IllegalStateException(unavailable);
        }
    }

    private static String requirePostgresUrl() {
        String url = System.getProperty("auralis.usage.postgres.url");
        if (url == null || !url.matches("jdbc:postgresql://127\\.0\\.0\\.1:\\d+/[A-Za-z0-9_]+")) {
            throw new IllegalStateException("A task-owned loopback PostgreSQL URL is required");
        }
        return url;
    }

    private record Owner(UUID userId) { }
    private record SourceFixture(UUID sourceId, UUID revision, UUID chunkId, UUID generation, String content) { }
    private record Fixture(UUID userId, UUID subjectId, List<UUID> sourceIds, List<UUID> chunkIds,
                          List<UUID> revisions, UUID jobId, OverviewJobRepository.JobRow job,
                          UUID planId, UUID nodeId, OverviewResponse candidate,
                          OverviewGenerationCoordinator.GenerationLease generationLease,
                          List<SourceFixture> sourceFixtures) { }
    private record PreviewNodeDescriptor(int ordinal, String checkpointStep, String promptSha256, int chapterIndex,
                                         String chapterTitle, String sectionTitle, String sectionSummary,
                                         List<PreviewUnitRef> units) { }
    private record PreviewUnitRef(String alias, UUID sourceId, UUID sourceRevision, UUID chunkId, UUID generation,
                                  int ordinal, String contentHash, int charStart, int charEnd) { }
}
