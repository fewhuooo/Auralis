package com.auralis.app.ai;

import com.auralis.app.AuralisApplication;
import com.auralis.app.identity.DeviceCommand;
import com.auralis.app.identity.DevicePlatform;
import com.auralis.app.identity.IdentityService;
import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.MigrationVersion;
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
import tools.jackson.databind.ObjectMapper;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.Statement;
import java.time.Instant;
import java.util.UUID;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest(classes = AuralisApplication.class)
@ActiveProfiles("postgres-it")
@EnabledIfSystemProperty(named = "auralis.postgres.it", matches = "true")
class OverviewJobPostgresIntegrationTests {
    private static final String POSTGRES_URL = requirePostgresUrl();
    private static final String APP_SCHEMA = "overview_job_it_" + UUID.randomUUID().toString().replace("-", "");
    private static final DriverManagerDataSource ADMIN = new DriverManagerDataSource(POSTGRES_URL, "postgres", "");

    @Autowired private JdbcTemplate jdbc;
    @Autowired private IdentityService identityService;
    @Autowired private OverviewJobRepository jobs;
    @Autowired private ObjectMapper objectMapper;

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
    }

    @AfterAll
    static void dropApplicationSchema() {
        new JdbcTemplate(ADMIN).execute("drop schema if exists " + APP_SCHEMA + " cascade");
    }

    @AfterEach
    void clearJobsCreatedInTheSharedTestSchema() {
        jdbc.update("delete from overview_generation_jobs");
    }

    @Test
    void cleanSchemaInstallsV36JobAndExactInvocationTables() {
        assertThat(jdbc.queryForObject("select count(*) from " + APP_SCHEMA
                + ".flyway_schema_history where version='36' and success", Integer.class)).isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from " + APP_SCHEMA
                + ".flyway_schema_history where version='40' and success", Integer.class)).isEqualTo(1);
        assertThat(columnExists("overview_generation_jobs", "deadline_at")).isTrue();
        assertThat(columnExists("overview_generation_jobs", "worker_fence")).isTrue();
        assertThat(columnExists("overview_generation_invocations", "reservation_id")).isTrue();
        assertThat(columnExists("overview_generation_invocations", "job_fence")).isTrue();
        OverviewJobDtos.JobView queued = new OverviewJobDtos.JobView(UUID.randomUUID(), OverviewJobDtos.Status.QUEUED,
                1, OverviewJobDtos.Scope.SOURCE, UUID.randomUUID(), null, null, OverviewJobDtos.Mode.ALL,
                OverviewJobDtos.Stage.QUEUED, 0, null, null, null, Instant.now(), Instant.now(), null);
        var json = objectMapper.valueToTree(queued);
        assertThat(json.has("deadlineAt")).isTrue();
        assertThat(json.get("deadlineAt").isNull()).isTrue();
        assertThat(json.has("totalNodes")).isTrue();
        assertThat(json.get("totalNodes").isNull()).isTrue();
    }

    @Test
    void v37PublicationSchemaInstallsAndScopeCursorCannotCrossItsFilterDomain() {
        assertThat(jdbc.queryForObject("select count(*) from " + APP_SCHEMA
                + ".flyway_schema_history where version='37' and success", Integer.class)).isEqualTo(1);
        assertThat(columnExists("overview_results", "outline_input_origin")).isTrue();
        assertThat(columnExists("overview_results", "summary_input_snapshot_json")).isTrue();
        assertThat(tableExists("overview_publication_intents")).isTrue();

        Fixture fixture = fixture();
        UUID subjectId = UUID.randomUUID();
        jdbc.update("insert into subjects (id,user_id,name,sort_key) values (?,?,?,?)",
                subjectId, fixture.userId(), "scope-list-" + UUID.randomUUID(), "scope-list");
        jdbc.update("insert into sources (id,user_id,type,subject_id,title,raw_text,ingestion_status) values (?,?,?,?,?,?,?)",
                fixture.sourceId(), fixture.userId(), "TEXT", subjectId, "Scope list source", "body", "READY");
        OverviewJobDtos.StartRequest firstRequest = sourceRequest(fixture.sourceId(), UUID.randomUUID());
        OverviewJobRepository.JobRow first = jobs.enqueue(fixture.userId(), firstRequest, sourceSnapshot("e", fixture.sourceId()));
        jdbc.update("update overview_generation_jobs set status='COMPLETED',stage='COMPLETE' where id=?", first.id());
        jobs.enqueue(fixture.userId(), sourceRequest(fixture.sourceId(), UUID.randomUUID()), sourceSnapshot("f", fixture.sourceId()));
        OverviewJobDtos.JobList page = jobs.list(fixture.userId(), 1, null, OverviewJobDtos.Scope.SOURCE,
                fixture.sourceId(), row -> new OverviewJobDtos.JobView(row.id(), row.status(), row.version(),
                        OverviewJobDtos.Scope.valueOf(row.scopeType()), fixture.sourceId(), null, null,
                        OverviewJobDtos.Mode.valueOf(row.mode()), row.stage(), row.verifiedNodes(), row.totalNodes(),
                        row.deadlineAt(), row.safeErrorCode(), row.createdAt(), row.updatedAt(), row.completedAt()));
        assertThat(page.jobs()).hasSize(1);
        assertThat(page.nextCursor()).isNotBlank();
        assertThatThrownBy(() -> jobs.list(fixture.userId(), 1, page.nextCursor(), OverviewJobDtos.Scope.SOURCE,
                UUID.randomUUID(), row -> null)).isInstanceOf(com.auralis.app.shared.error.DomainException.class);
    }

    private boolean tableExists(String table) {
        return jdbc.queryForObject("select count(*) from information_schema.tables where table_schema=? and table_name=?",
                Integer.class, APP_SCHEMA, table) == 1;
    }

    @Test
    void v35UpgradePreservesExistingOverviewAndChunkRowsWithNullJobMetadata() {
        String schema = "overview_job_upgrade_" + UUID.randomUUID().toString().replace("-", "");
        JdbcTemplate admin = new JdbcTemplate(ADMIN);
        admin.execute("create schema " + schema);
        try {
            String vectorSchema = vectorExtensionSchema();
            String scopedUrl = POSTGRES_URL + "?currentSchema=" + schema
                    + (vectorSchema == null ? "" : "," + vectorSchema);
            DriverManagerDataSource dataSource = new DriverManagerDataSource(scopedUrl, "postgres", "");
            Flyway.configure().dataSource(dataSource).schemas(schema).defaultSchema(schema)
                    .locations("classpath:db/migration").target(MigrationVersion.fromVersion("35")).load().migrate();
            JdbcTemplate upgradeJdbc = new JdbcTemplate(dataSource);
            UUID userId = UUID.randomUUID();
            UUID subjectId = UUID.randomUUID();
            UUID sourceId = UUID.randomUUID();
            UUID resultId = UUID.randomUUID();
            UUID chunkId = UUID.randomUUID();
            UUID generationId = UUID.randomUUID();
            upgradeJdbc.update("insert into users (id,username,normalized_username,password_hash,status) values (?,?,?,?,?)",
                    userId, "m33-upgrade", "m33-upgrade", "test-hash", "ACTIVE");
            upgradeJdbc.update("insert into subjects (id,user_id,name,sort_key) values (?,?,?,?)",
                    subjectId, userId, "Legacy subject", "001");
            upgradeJdbc.update("insert into sources (id,user_id,type,subject_id,title,raw_text,ingestion_status) values (?,?,?,?,?,?,?)",
                    sourceId, userId, "TEXT", subjectId, "Legacy source", "Source body", "READY");
            UUID revision = upgradeJdbc.queryForObject("select ingestion_revision from sources where id=?", UUID.class, sourceId);
            upgradeJdbc.update("insert into overview_results (id,user_id,scope_type,scope_id,subject_id,source_id,"
                            + "ingestion_revision,title,schema_version,outline,summary,updated_at) values (?,?,?,?,?,?,?,?,?,?,?,now())",
                    resultId, userId, "SOURCE", sourceId, subjectId, sourceId, revision, "Legacy overview", 1, "{}", "{}");
            upgradeJdbc.update("insert into source_chunks (id,user_id,source_id,ordinal,content,content_hash,char_start,char_end,"
                            + "embedding_json,generation,active) values (?,?,?,?,?,?,?,?,?,?,?)",
                    chunkId, userId, sourceId, 0, "Legacy chunk", "a".repeat(64), 0, 12, "[]", generationId, true);

            Flyway.configure().dataSource(dataSource).schemas(schema).defaultSchema(schema)
                    .locations("classpath:db/migration").load().migrate();

            assertThat(upgradeJdbc.queryForObject("select count(*) from " + schema
                    + ".flyway_schema_history where version='36' and success", Integer.class)).isEqualTo(1);
            assertThat(upgradeJdbc.queryForObject("select count(*) from " + schema
                    + ".flyway_schema_history where version='37' and success", Integer.class)).isEqualTo(1);
            assertThat(upgradeJdbc.queryForObject("select count(*) from overview_results where id=?", Integer.class, resultId)).isEqualTo(1);
            assertThat(upgradeJdbc.queryForObject("select outline_identity_json from overview_results where id=?", String.class, resultId)).isNull();
            assertThat(upgradeJdbc.queryForObject("select outline_input_origin from overview_results where id=?", String.class, resultId))
                    .isEqualTo("SOURCE_REVISION");
            assertThat(upgradeJdbc.queryForObject("select summary_input_snapshot_json from overview_results where id=?", String.class, resultId)).isNull();
            assertThat(upgradeJdbc.queryForObject("select count(*) from source_chunks where id=?", Integer.class, chunkId)).isEqualTo(1);
            assertThat(upgradeJdbc.queryForObject("select provenance_json from source_chunks where id=?", String.class, chunkId)).isNull();
        } finally {
            admin.execute("drop schema if exists " + schema + " cascade");
        }
    }

    @Test
    void idempotentEnqueueAndActiveScopeConflictAreSerializedPerOwner() {
        Fixture fixture = fixture();
        UUID clientRequestId = UUID.randomUUID();
        OverviewJobDtos.StartRequest request = sourceRequest(fixture.sourceId(), clientRequestId);
        OverviewJobRepository.Snapshot snapshot = snapshot("a");

        OverviewJobRepository.JobRow first = jobs.enqueue(fixture.userId(), request, snapshot);
        OverviewJobRepository.JobRow replay = jobs.enqueue(fixture.userId(), request, snapshot);
        assertThat(replay.id()).isEqualTo(first.id());

        OverviewJobDtos.StartRequest anotherClientId = sourceRequest(fixture.sourceId(), UUID.randomUUID());
        assertThat(jobs.enqueue(fixture.userId(), anotherClientId, snapshot).id()).isEqualTo(first.id());

        OverviewJobRepository.Snapshot changed = snapshot("b");
        assertThatThrownBy(() -> jobs.enqueue(fixture.userId(), request, changed))
                .isInstanceOf(com.auralis.app.shared.error.DomainException.class)
                .hasMessageContaining("another Overview job request");
    }

    @Test
    void progressAcceptsUnknownTotalThenEnforcesKnownTotalBounds() {
        Fixture fixture = fixture();
        OverviewJobRepository.JobRow queued = jobs.enqueue(fixture.userId(),
                sourceRequest(fixture.sourceId(), UUID.randomUUID()), snapshot("g"));
        OverviewJobRepository.JobRow running = jobs.claimNext(UUID.randomUUID(), 60_000, 240_000);

        assertThat(jobs.updateProgress(running.lease(), OverviewJobDtos.Stage.INDEXING, 0, null)).isTrue();
        OverviewJobRepository.JobRow unknownTotal = jobs.get(fixture.userId(), queued.id());
        assertThat(unknownTotal.stage()).isEqualTo(OverviewJobDtos.Stage.INDEXING);
        assertThat(unknownTotal.verifiedNodes()).isZero();
        assertThat(unknownTotal.totalNodes()).isNull();

        assertThat(jobs.updateProgress(running.lease(), OverviewJobDtos.Stage.WRITING, 1, 2)).isTrue();
        OverviewJobRepository.JobRow knownTotal = jobs.get(fixture.userId(), queued.id());
        assertThat(knownTotal.verifiedNodes()).isEqualTo(1);
        assertThat(knownTotal.totalNodes()).isEqualTo(2);
        assertThat(jobs.updateProgress(running.lease(), OverviewJobDtos.Stage.WRITING, 1, 1)).isFalse();
    }

    @Test
    void unboundedJobKeepsNullDeadlineThroughClaimHeartbeatBindProgressAndFinish() {
        Fixture fixture = fixture();
        OverviewJobRepository.JobRow queued = jobs.enqueue(fixture.userId(),
                sourceRequest(fixture.sourceId(), UUID.randomUUID()), snapshot("h"));

        OverviewJobRepository.JobRow running = jobs.claimNext(UUID.randomUUID(), 60_000, 0);

        assertThat(running.id()).isEqualTo(queued.id());
        assertThat(running.deadlineAt()).isNull();
        assertThat(running.workerOwnerId()).isNotNull();
        assertThat(running.leaseUntil()).isNotNull();
        assertThat(jobs.heartbeat(running.lease(), 60_000)).isTrue();
        assertThat(jobs.expireOneOverdue()).isFalse();

        UUID generationId = UUID.randomUUID();
        UUID taskId = UUID.randomUUID();
        jdbc.update("insert into overview_generations (id,user_id,scope_type,scope_id,source_revision,"
                        + "input_fingerprint,payload_fingerprint,active_fingerprint,profile_fingerprint,algorithm_version,"
                        + "budget_task_id,status,owner_id,fence,lease_until) values (?,?,?,?,?,?,?,?,?,?,?,'ACTIVE',?,1,"
                        + "now()+interval '1 minute')",
                generationId, fixture.userId(), "SOURCE", fixture.sourceId(), UUID.randomUUID(),
                "a".repeat(64), "b".repeat(64), "c".repeat(64), "d".repeat(64),
                "overview-adaptive-v5-background-jobs", taskId, UUID.randomUUID());
        jobs.bindGeneration(running.lease(), generationId, taskId);
        assertThat(jobs.updateProgress(running.lease(), OverviewJobDtos.Stage.WRITING, 1, 2)).isTrue();

        jobs.finish(running.lease(), "{}");

        OverviewJobRepository.JobRow completed = jobs.get(fixture.userId(), queued.id());
        assertThat(completed.status()).isEqualTo(OverviewJobDtos.Status.COMPLETED);
        assertThat(completed.deadlineAt()).isNull();
        assertThat(completed.candidateJson()).isEqualTo("{}");
    }

    @Test
    void pauseResumeAndLeaseTakeoverKeepTheOriginalDeadlineAndFenceOutOldOwner() {
        Fixture fixture = fixture();
        OverviewJobRepository.JobRow queued = jobs.enqueue(fixture.userId(),
                sourceRequest(fixture.sourceId(), UUID.randomUUID()), snapshot("c"));
        UUID firstWorker = UUID.randomUUID();
        OverviewJobRepository.JobRow running = jobs.claimNext(firstWorker, 60_000, 240_000);
        assertThat(running.id()).isEqualTo(queued.id());
        Instant originalDeadline = running.deadlineAt();
        assertThat(jobs.claimNext(UUID.randomUUID(), 60_000, 240_000)).isNull();

        OverviewJobRepository.JobRow pausing = jobs.control(fixture.userId(), queued.id(), running.version(),
                OverviewJobRepository.Control.PAUSE);
        assertThat(pausing.status()).isEqualTo(OverviewJobDtos.Status.PAUSING);
        jobs.pauseAtBoundary(running.lease());
        OverviewJobRepository.JobRow paused = jobs.get(fixture.userId(), queued.id());
        assertThat(paused.status()).isEqualTo(OverviewJobDtos.Status.PAUSED);

        OverviewJobRepository.JobRow resumed = jobs.control(fixture.userId(), queued.id(), paused.version(),
                OverviewJobRepository.Control.RESUME);
        assertThat(resumed.status()).isEqualTo(OverviewJobDtos.Status.QUEUED);
        OverviewJobRepository.JobRow secondOwner = jobs.claimNext(UUID.randomUUID(), 60_000, 240_000);
        assertThat(secondOwner.deadlineAt()).isEqualTo(originalDeadline);
        assertThat(secondOwner.workerFence()).isEqualTo(running.workerFence() + 1);
        assertThat(jobs.updateProgress(running.lease(), OverviewJobDtos.Stage.WRITING, 1, 2)).isFalse();

        jdbc.update("update overview_generation_jobs set lease_until=now()-interval '1 second' where id=?", queued.id());
        OverviewJobRepository.JobRow thirdOwner = jobs.claimNext(UUID.randomUUID(), 60_000, 240_000);
        assertThat(thirdOwner.deadlineAt()).isEqualTo(originalDeadline);
        assertThat(thirdOwner.workerFence()).isEqualTo(secondOwner.workerFence() + 1);
        assertThatThrownBy(() -> jobs.bindGeneration(secondOwner.lease(), UUID.randomUUID(), UUID.randomUUID()))
                .isInstanceOf(com.auralis.app.shared.error.DomainException.class);
    }

    @Test
    void cancellationRevokesTheWorkerFenceAndDoesNotRequeueTheJob() {
        Fixture fixture = fixture();
        OverviewJobRepository.JobRow queued = jobs.enqueue(fixture.userId(),
                sourceRequest(fixture.sourceId(), UUID.randomUUID()), snapshot("d"));
        OverviewJobRepository.JobRow running = jobs.claimNext(UUID.randomUUID(), 60_000, 240_000);
        OverviewJobRepository.JobRow cancelling = jobs.control(fixture.userId(), queued.id(), running.version(),
                OverviewJobRepository.Control.CANCEL);
        assertThat(cancelling.status()).isEqualTo(OverviewJobDtos.Status.CANCELLING);
        assertThat(cancelling.workerFence()).isGreaterThan(running.workerFence());
        assertThat(jobs.updateProgress(running.lease(), OverviewJobDtos.Stage.WRITING, 1, 2)).isFalse();

        assertThat(jobs.claimNext(UUID.randomUUID(), 60_000, 240_000)).isNull();
        assertThat(jobs.get(fixture.userId(), queued.id()).status()).isEqualTo(OverviewJobDtos.Status.CANCELLED);
    }

    private boolean columnExists(String table, String column) {
        return jdbc.queryForObject("select count(*) from information_schema.columns where table_schema=? "
                + "and table_name=? and column_name=?", Integer.class, APP_SCHEMA, table, column) == 1;
    }

    private static String vectorExtensionSchema() {
        List<String> schemas = new JdbcTemplate(ADMIN).query("select n.nspname from pg_extension e "
                        + "join pg_namespace n on n.oid=e.extnamespace where e.extname='vector'",
                (rows, row) -> rows.getString(1));
        return schemas.isEmpty() ? null : schemas.getFirst();
    }

    private Fixture fixture() {
        String suffix = UUID.randomUUID().toString().replace("-", "");
        var registered = identityService.register("job-" + suffix, "correct horse battery staple", "Overview job test",
                new DeviceCommand("overview-job-" + suffix, "Test", DevicePlatform.WEB));
        return new Fixture(registered.user().id(), UUID.randomUUID());
    }

    private OverviewJobDtos.StartRequest sourceRequest(UUID sourceId, UUID clientRequestId) {
        return new OverviewJobDtos.StartRequest(clientRequestId, OverviewJobDtos.Scope.SOURCE,
                sourceId, null, null, OverviewJobDtos.Mode.ALL, null);
    }

    private OverviewJobRepository.Snapshot snapshot(String suffix) {
        return new OverviewJobRepository.Snapshot(UUID.randomUUID(), suffix.repeat(64), "{}", "[]",
                (suffix + "1").repeat(32), (suffix + "2").repeat(32), "overview-adaptive-v5-background-jobs");
    }

    private OverviewJobRepository.Snapshot sourceSnapshot(String suffix, UUID sourceId) {
        return new OverviewJobRepository.Snapshot(sourceId, suffix.repeat(64), "{}", "[]",
                (suffix + "1").repeat(32), (suffix + "2").repeat(32), "overview-adaptive-v5-background-jobs");
    }

    private static String requirePostgresUrl() {
        String url = System.getProperty("auralis.usage.postgres.url");
        if (url == null || !url.matches("jdbc:postgresql://127\\.0\\.0\\.1:\\d+/[A-Za-z0-9_]+")) {
            throw new IllegalStateException("A task-owned loopback PostgreSQL URL is required");
        }
        return url;
    }

    private record Fixture(UUID userId, UUID sourceId) { }
}
