package com.auralis.app.ai;

import com.auralis.app.support.AuthTestAccounts;
import com.auralis.app.AuralisApplication;
import com.auralis.app.ai.usage.AiProviderUsage;
import com.auralis.app.identity.DeviceCommand;
import com.auralis.app.identity.DevicePlatform;
import com.auralis.app.identity.IdentityService;
import com.auralis.app.shared.domain.ResourceDeletedEvent;
import com.auralis.app.shared.domain.ResourceType;
import com.auralis.app.source.SourceType;
import com.auralis.app.subject.SubjectCommand;
import com.auralis.app.subject.SubjectService;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.Statement;
import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest(classes = AuralisApplication.class)
@ActiveProfiles("postgres-it")
@EnabledIfSystemProperty(named = "auralis.postgres.it", matches = "true")
class OverviewCacheLifecyclePostgresIntegrationTests {
    private static final String APP_SCHEMA = "overview_cache_lifecycle_it_" + UUID.randomUUID().toString().replace("-", "");
    private static volatile boolean schemaInitialized;
    private static final String HASH_A = "a".repeat(64);
    private static final String HASH_B = "b".repeat(64);
    private static final String HASH_C = "c".repeat(64);
    private static final String HASH_D = "d".repeat(64);

    @DynamicPropertySource
    static void taskOwnedPostgres(DynamicPropertyRegistry registry) throws Exception {
        String postgresUrl = requirePostgresUrl();
        String vectorSchema = null;
        try (Connection connection = DriverManager.getConnection(postgresUrl, "postgres", "");
             Statement statement = connection.createStatement()) {
            statement.execute("create schema " + APP_SCHEMA);
            schemaInitialized = true;
            try (ResultSet rows = statement.executeQuery("select n.nspname from pg_extension e join pg_namespace n "
                    + "on n.oid=e.extnamespace where e.extname='vector'")) {
                if (rows.next()) vectorSchema = rows.getString(1);
            }
        }
        String searchPath = APP_SCHEMA + (vectorSchema == null ? "" : "," + vectorSchema);
        registry.add("spring.datasource.url", () -> postgresUrl + "?currentSchema=" + searchPath);
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
        if (!schemaInitialized) return;
        DriverManagerDataSource admin = new DriverManagerDataSource(requirePostgresUrl(), "postgres", "");
        new JdbcTemplate(admin).execute("drop schema if exists " + APP_SCHEMA + " cascade");
    }

    @Autowired private JdbcTemplate jdbc;
    @Autowired private IdentityService identityService;
    @Autowired private SubjectService subjectService;
    @Autowired private OverviewGenerationCoordinator coordinator;
    @Autowired private OverviewResultCleanupListener cleanupListener;
    @Autowired private PlatformTransactionManager transactionManager;
    @Autowired private Clock clock;

    @Test
    void postgresSerializesUtf8CapacityAdmissionsAcrossCoordinatorInstances() throws Exception {
        UUID userId = createUser("capacity");
        ScheduledExecutorService heartbeatA = Executors.newSingleThreadScheduledExecutor();
        ScheduledExecutorService heartbeatB = Executors.newSingleThreadScheduledExecutor();
        OverviewGenerationCoordinator first = new OverviewGenerationCoordinator(jdbc, transactionManager, clock,
                30_000, 2_000, heartbeatA, 32, 1);
        OverviewGenerationCoordinator second = new OverviewGenerationCoordinator(jdbc, transactionManager, clock,
                30_000, 2_000, heartbeatB, 32, 1);
        var a = first.acquire(request(userId, UUID.randomUUID(), UUID.randomUUID()));
        var b = second.acquire(request(userId, UUID.randomUUID(), UUID.randomUUID()));
        CountDownLatch start = new CountDownLatch(1);
        var pool = Executors.newFixedThreadPool(2);
        try {
            var aDone = pool.submit(() -> { start.await(); return first.complete(a.lease(), "{\"value\":\"汉\"}", usage(), 0, List.of()); });
            var bDone = pool.submit(() -> { start.await(); return second.complete(b.lease(), "{\"value\":\"字\"}", usage(), 0, List.of()); });
            start.countDown();
            assertThat(aDone.get(10, TimeUnit.SECONDS)).isTrue();
            assertThat(bDone.get(10, TimeUnit.SECONDS)).isTrue();
        } finally {
            pool.shutdownNow();
            heartbeatA.shutdownNow();
            heartbeatB.shutdownNow();
        }
        assertThat(jdbc.queryForObject("select count(*) from overview_cache_capacity_guard where id=1", Integer.class)).isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from overview_generations where user_id=? and status='SUCCESS' "
                        + "and result_json is not null", Integer.class, userId)).isLessThanOrEqualTo(1);
        assertThat(jdbc.queryForObject("select coalesce(sum(octet_length(result_json)),0) from overview_generations "
                        + "where status='SUCCESS'", Long.class)).isLessThanOrEqualTo(32);
    }

    @Test
    void sourceDeletionRevokesPrivateCopiesWithoutDeletingUsageEvidenceOrAnotherOwnersCache() {
        UUID userId = createUser("source-delete");
        UUID otherUserId = createUser("other-owner");
        UUID subjectId = createSubject(userId);
        UUID otherSubjectId = createSubject(otherUserId);
        UUID sourceId = createSource(userId, subjectId, "private source text");
        UUID otherSourceId = createSource(otherUserId, otherSubjectId, "other owner text");
        UUID revision = jdbc.queryForObject("select ingestion_revision from sources where id=?", UUID.class, sourceId);
        var sourceRequest = new OverviewGenerationCoordinator.Request(userId, UUID.randomUUID(), "SOURCE", sourceId,
                revision, HASH_A, HASH_B, HASH_C, "adaptive-v1",
                List.of(new OverviewGenerationCoordinator.SourceDependency(sourceId, revision, "Source " + sourceId)));
        var generation = coordinator.acquire(sourceRequest);
        assertThat(coordinator.complete(generation.lease(), "{\"raw\":\"private result\"}", usage(), 0, List.of())).isTrue();
        UUID reservationId = seedCall(generation.lease());
        UUID sourceReceiptId = UUID.randomUUID();
        UUID subjectReceiptId = UUID.randomUUID();
        jdbc.update("insert into overview_write_receipts(id,user_id,client_write_id,scope_type,scope_id,base_version,payload_hash,response_snapshot) "
                        + "values (?,?,?,'SOURCE',?,0,?,?)",
                sourceReceiptId, userId, UUID.randomUUID(), sourceId, HASH_C,
                "{\"body\":\"private source receipt copy\"}");
        jdbc.update("insert into overview_write_receipts(id,user_id,client_write_id,scope_type,scope_id,base_version,payload_hash,response_snapshot) "
                        + "values (?,?,?,'SUBJECT',?,0,?,?)",
                subjectReceiptId, userId, UUID.randomUUID(), subjectId, HASH_B,
                "{\"sourceId\":\"" + sourceId + "\",\"body\":\"private subject receipt copy\"}");

        var budgetFailure = coordinator.acquire(new OverviewGenerationCoordinator.Request(userId, UUID.randomUUID(),
                "SOURCE", sourceId, revision, HASH_D, HASH_B, HASH_C, "adaptive-v1"));
        assertThat(coordinator.fail(budgetFailure.lease(), "AI_DAILY_QUOTA_EXCEEDED",
                new OverviewGenerationCoordinator.FailureDetails(429, 30, Instant.now().plusSeconds(30)),
                usageSummary(), 0, List.of())).isTrue();

        UUID otherRevision = jdbc.queryForObject("select ingestion_revision from sources where id=?", UUID.class, otherSourceId);
        var otherGeneration = coordinator.acquire(new OverviewGenerationCoordinator.Request(otherUserId, UUID.randomUUID(),
                "SOURCE", otherSourceId, otherRevision, HASH_A, HASH_B, HASH_C, "adaptive-v1"));
        assertThat(coordinator.complete(otherGeneration.lease(), "{\"raw\":\"other owner\"}", usage(), 0, List.of())).isTrue();

        new TransactionTemplate(transactionManager).executeWithoutResult(status -> {
            jdbc.update("update sources set deleted_at=?,version=version+1 where id=?", OffsetDateTime.now(ZoneOffset.UTC), sourceId);
            cleanupListener.onResourceDeleted(new ResourceDeletedEvent(userId, ResourceType.SOURCE, sourceId));
        });

        assertThat(jdbc.queryForObject("select status from overview_generations where id=?", String.class,
                generation.generationId())).isEqualTo("FAILED");
        assertThat(jdbc.queryForObject("select error_code from overview_generations where id=?", String.class,
                budgetFailure.generationId())).isEqualTo("OVERVIEW_SOURCE_REVOKED");
        assertThat(jdbc.queryForObject("select error_status from overview_generations where id=?", Integer.class,
                budgetFailure.generationId())).isNull();
        assertThat(jdbc.queryForObject("select result_json from overview_generations where id=?", String.class,
                generation.generationId())).isNull();
        assertThat(jdbc.queryForObject("select response_snapshot from overview_write_receipts where id=?", String.class,
                sourceReceiptId)).isEqualTo("{\"revoked\":true}");
        assertThat(jdbc.queryForObject("select payload_hash from overview_write_receipts where id=?", String.class,
                sourceReceiptId)).isEqualTo(HASH_C);
        assertThat(jdbc.queryForObject("select response_snapshot from overview_write_receipts where id=?", String.class,
                subjectReceiptId)).isEqualTo("{\"revoked\":true}");
        assertThat(jdbc.queryForObject("select payload_hash from overview_write_receipts where id=?", String.class,
                subjectReceiptId)).isEqualTo(HASH_B);
        assertThat(jdbc.queryForObject("select request_dispatched from ai_usage_reservations where id=?",
                Boolean.class, reservationId)).isTrue();
        assertThat(jdbc.queryForObject("select result_json from overview_generations where id=?", String.class,
                otherGeneration.generationId())).isEqualTo("{\"raw\":\"other owner\"}");
        assertThat(coordinator.complete(generation.lease(), "{\"raw\":\"late write\"}", usage(), 0, List.of())).isFalse();

        jdbc.update("update sources set deleted_at=null,version=version+1 where id=?", sourceId);
        assertThat(coordinator.acquire(sourceRequest).state())
                .isEqualTo(OverviewGenerationCoordinator.AcquisitionState.FAILED);
        var fresh = coordinator.acquire(new OverviewGenerationCoordinator.Request(userId, UUID.randomUUID(), "SOURCE", sourceId,
                revision, HASH_A, HASH_B, HASH_C, "adaptive-v1",
                List.of(new OverviewGenerationCoordinator.SourceDependency(sourceId, revision, "Source " + sourceId))));
        assertThat(fresh.generationId()).isNotEqualTo(generation.generationId());
    }

    private UUID createUser(String suffix) {
        String unique = suffix + "-" + UUID.randomUUID().toString().replace("-", "");
        return AuthTestAccounts.register(identityService, "m5-cache-" + unique, "correct horse battery staple",
                new DeviceCommand("m5-cache-device-" + unique, "Test", DevicePlatform.WEB)).user().id();
    }

    private UUID createSubject(UUID userId) {
        return subjectService.create(userId, new SubjectCommand("M5 subject " + UUID.randomUUID(), null, null,
                UUID.randomUUID().toString())).id();
    }

    private UUID createSource(UUID userId, UUID subjectId, String text) {
        UUID sourceId = UUID.randomUUID();
        jdbc.update("insert into sources(id,user_id,type,subject_id,title,raw_text,ingestion_status,ingestion_revision) "
                        + "values (?,?,? ,?,?,?,'READY',?)", sourceId, userId, SourceType.TEXT.name(), subjectId,
                "Source " + sourceId, text, UUID.randomUUID());
        return sourceId;
    }

    private UUID seedCall(OverviewGenerationCoordinator.GenerationLease lease) {
        UUID reservationId = UUID.randomUUID();
        UUID taskId = UUID.randomUUID();
        UUID ownerId = UUID.randomUUID();
        jdbc.update("insert into ai_usage_reservations(id,task_id,user_id,feature,stage,provider,model,state,"
                        + "estimated_input_tokens,reserved_output_tokens,request_dispatched,owner_id,lease_until) "
                        + "values (?,?,?,'OVERVIEW','WRITER','OPENAI_COMPATIBLE','test','RESERVED',1,1,true,?,?)",
                reservationId, taskId, lease.userId(), ownerId, OffsetDateTime.now(ZoneOffset.UTC).plusMinutes(5));
        jdbc.update("insert into overview_generation_invocations(id,generation_id,reservation_id,task_id,user_id,"
                        + "purpose,stage,owner_id,generation_fence) values (?,?,?,?,?,'SOURCE','INTERMEDIATE',?,?)",
                UUID.randomUUID(), lease.generationId(), reservationId, taskId, lease.userId(),
                lease.ownerId(), lease.fence());
        return reservationId;
    }

    private OverviewGenerationCoordinator.Request request(UUID userId, UUID subjectId, UUID requestId) {
        return new OverviewGenerationCoordinator.Request(userId, requestId, "SUBJECT", subjectId, null,
                HASH_A, HASH_B, HASH_C, "adaptive-v1");
    }

    private static AiProviderUsage usage() {
        return new AiProviderUsage(1, 1, 1L, 1L, 2, true);
    }

    private static com.auralis.app.ai.usage.OverviewTaskUsageSummary usageSummary() {
        return new com.auralis.app.ai.usage.OverviewTaskUsageSummary(1, 1, null, null, 2, 1, 0, false);
    }

    private static String requirePostgresUrl() {
        String url = System.getProperty("auralis.usage.postgres.url");
        if (url == null || !url.matches("jdbc:postgresql://127\\.0\\.0\\.1:\\d+/[A-Za-z0-9_]+")) {
            throw new IllegalStateException("A task-owned loopback PostgreSQL URL is required");
        }
        return url;
    }
}
