package com.auralis.app.ai;

import com.auralis.app.ai.usage.AiProviderUsage;
import com.auralis.app.ai.usage.AiUsageLimitException;
import com.auralis.app.ai.usage.OverviewTaskUsageSummary;
import com.auralis.app.shared.error.DomainException;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.jdbc.datasource.init.ScriptUtils;

import java.sql.Connection;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class OverviewGenerationCoordinatorTests {

    private JdbcTemplate jdbc;
    private OverviewGenerationCoordinator coordinator;
    private ScheduledExecutorService heartbeat;
    private DataSourceTransactionManager transactionManager;
    private UUID userId;
    private UUID subjectId;

    @BeforeEach
    void setUp() throws Exception {
        String databaseName = "overviewgeneration" + UUID.randomUUID().toString().replace("-", "");
        DriverManagerDataSource dataSource = new DriverManagerDataSource(
                "jdbc:h2:mem:" + databaseName + ";MODE=PostgreSQL;DB_CLOSE_DELAY=-1", "sa", "");
        jdbc = new JdbcTemplate(dataSource);
        jdbc.execute("create table users (id UUID primary key, status varchar(16) not null default 'ACTIVE')");
        try (Connection connection = dataSource.getConnection()) {
            ScriptUtils.executeSqlScript(connection,
                    new ClassPathResource("db/migration/V32__overview_private_generations.sql"));
        }
        userId = UUID.randomUUID();
        subjectId = UUID.randomUUID();
        jdbc.update("insert into users(id,status) values (?, 'ACTIVE')", userId);
        heartbeat = Executors.newSingleThreadScheduledExecutor();
        transactionManager = new DataSourceTransactionManager(dataSource);
        coordinator = new OverviewGenerationCoordinator(jdbc, transactionManager,
                Clock.systemUTC(), 1_000, 100, heartbeat);
    }

    @AfterEach
    void tearDown() {
        if (heartbeat != null) heartbeat.shutdownNow();
    }

    @Test
    void mapsSameRequestIdImmutablyAndStartsFreshGenerationAfterSuccess() {
        var original = request(UUID.randomUUID(), HASH_A, HASH_B, HASH_C);
        var owner = coordinator.acquire(original);
        var waiter = coordinator.acquire(request(UUID.randomUUID(), HASH_A, HASH_B, HASH_C));
        assertThat(owner.state()).isEqualTo(OverviewGenerationCoordinator.AcquisitionState.OWNER);
        assertThat(waiter.state()).isEqualTo(OverviewGenerationCoordinator.AcquisitionState.WAITER);
        assertThat(waiter.generationId()).isEqualTo(owner.generationId());
        assertThat(coordinator.complete(owner.lease(), "{\"schemaVersion\":1}", usage(), 1,
                List.of("LOCAL_NORMALIZE"))).isTrue();
        var awaited = coordinator.await(waiter, Duration.ofSeconds(1), () -> false);
        assertThat(awaited.status()).isEqualTo("SUCCESS");
        assertThat(awaited.resultJson()).isEqualTo("{\"schemaVersion\":1}");

        var replay = coordinator.acquire(original);
        assertThat(replay.state()).isEqualTo(OverviewGenerationCoordinator.AcquisitionState.REPLAY);
        assertThat(replay.resultJson()).isEqualTo("{\"schemaVersion\":1}");

        var fresh = coordinator.acquire(request(UUID.randomUUID(), HASH_A, HASH_B, HASH_C));
        assertThat(fresh.state()).isEqualTo(OverviewGenerationCoordinator.AcquisitionState.OWNER);
        assertThat(fresh.generationId()).isNotEqualTo(owner.generationId());
        assertThat(fresh.budgetTaskId()).isNotEqualTo(owner.budgetTaskId());
    }

    @Test
    void v32FailureMetadataColumnsArePresentAndNullable() {
        assertThat(jdbc.queryForObject("select count(*) from information_schema.columns "
                        + "where table_name='OVERVIEW_GENERATIONS' and column_name in "
                        + "('ERROR_STATUS','ERROR_RETRY_AFTER_SECONDS','ERROR_RESET_AT')", Integer.class))
                .isEqualTo(3);
    }

    @Test
    void durableUsageFailureKeepsDetailsUntilTakeoverAndRejectsStaleOwnerOverwrite() {
        var original = request(UUID.randomUUID(), HASH_A, HASH_B, HASH_C);
        var owner = coordinator.acquire(original);
        var waiter = coordinator.acquire(request(UUID.randomUUID(), HASH_A, HASH_B, HASH_C));
        var details = new OverviewGenerationCoordinator.FailureDetails(429, 17,
                Instant.parse("2026-10-13T03:00:00Z"));

        assertThat(coordinator.fail(owner.lease(), "AI_DAILY_QUOTA_EXCEEDED", details,
                usageSummary(), 0, List.of())).isTrue();
        var outcome = coordinator.await(waiter, Duration.ofSeconds(1), () -> false);
        assertThat(outcome.status()).isEqualTo("FAILED");
        assertThat(outcome.errorCode()).isEqualTo("AI_DAILY_QUOTA_EXCEEDED");
        assertThat(outcome.failureDetails()).isEqualTo(details);

        var takeover = coordinator.acquire(request(UUID.randomUUID(), HASH_A, HASH_B, HASH_C));
        assertThat(takeover.state()).isEqualTo(OverviewGenerationCoordinator.AcquisitionState.OWNER);
        assertThat(jdbc.queryForObject("select error_status from overview_generations where id=?",
                Integer.class, owner.generationId())).isNull();
        assertThat(coordinator.fail(owner.lease(), "AI_GLOBAL_QUOTA_EXCEEDED",
                new OverviewGenerationCoordinator.FailureDetails(503, 5, null), usageSummary(), 0, List.of()))
                .isFalse();
        assertThat(jdbc.queryForObject("select error_status from overview_generations where id=?",
                Integer.class, owner.generationId())).isNull();
        assertThat(coordinator.complete(takeover.lease(), "{\"schemaVersion\":1}", usageSummary(), 0, List.of()))
                .isTrue();
    }

    @Test
    void failureDetailsRequireKnownCodeStatusPairAndNonNegativeRetry() {
        var owner = coordinator.acquire(request(UUID.randomUUID(), HASH_A, HASH_B, HASH_C));
        assertThatThrownBy(() -> coordinator.fail(owner.lease(), "AI_DAILY_QUOTA_EXCEEDED",
                new OverviewGenerationCoordinator.FailureDetails(503, 0, null), usageSummary(), 0, List.of()))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new OverviewGenerationCoordinator.FailureDetails(429, -1, null))
                .isInstanceOf(IllegalArgumentException.class);
        assertThat(jdbc.queryForObject("select status from overview_generations where id=?",
                String.class, owner.generationId())).isEqualTo("ACTIVE");
    }

    @Test
    void allSupportedUsageFailureCodesPersistTheirStatus() {
        String[] codes = {"AI_REQUEST_BUDGET_EXCEEDED", "AI_TASK_BUDGET_EXCEEDED", "AI_CONCURRENCY_LIMIT",
                "AI_HOURLY_QUOTA_EXCEEDED", "AI_DAILY_QUOTA_EXCEEDED", "AI_GLOBAL_QUOTA_EXCEEDED"};
        int[] statuses = {413, 422, 429, 429, 429, 503};
        for (int i = 0; i < codes.length; i++) {
            String fingerprint = String.format("%064x", i + 1);
            var request = request(UUID.randomUUID(), fingerprint, HASH_B, HASH_C);
            var owner = coordinator.acquire(request);
            var details = new OverviewGenerationCoordinator.FailureDetails(statuses[i], 0, null);
            assertThat(coordinator.fail(owner.lease(), codes[i], details, usageSummary(), 0, List.of())).isTrue();
            assertThat(jdbc.queryForObject("select error_status from overview_generations where id=?",
                    Integer.class, owner.generationId())).isEqualTo(statuses[i]);
            assertThat(jdbc.queryForObject("select error_retry_after_seconds from overview_generations where id=?",
                    Long.class, owner.generationId())).isZero();
            assertThat(jdbc.queryForObject("select error_reset_at from overview_generations where id=?",
                    Object.class, owner.generationId())).isNull();
        }
    }

    @Test
    void failureMetadataConstraintRejectsNullCodeAndNonFailedRows() {
        var owner = coordinator.acquire(request(UUID.randomUUID(), HASH_A, HASH_B, HASH_C));
        assertThat(coordinator.fail(owner.lease(), "MODEL_TIMEOUT", usage(), 0, List.of())).isTrue();
        assertThatThrownBy(() -> jdbc.update("update overview_generations set error_status=429, "
                        + "error_retry_after_seconds=1, error_code=null where id=?", owner.generationId()))
                .isInstanceOf(RuntimeException.class);
        var retry = coordinator.acquire(request(UUID.randomUUID(), HASH_A, HASH_B, HASH_C));
        assertThat(retry.state()).isEqualTo(OverviewGenerationCoordinator.AcquisitionState.OWNER);
        assertThatThrownBy(() -> jdbc.update("update overview_generations set error_code='AI_DAILY_QUOTA_EXCEEDED', "
                        + "error_status=429, error_retry_after_seconds=1 where id=?", owner.generationId()))
                .isInstanceOf(RuntimeException.class);
    }

    @Test
    void replayAndWaiterOutcomeRejectCorruptedSuccessfulPayload() {
        var original = request(UUID.randomUUID(), HASH_A, HASH_B, HASH_C);
        var owner = coordinator.acquire(original);
        var waiter = coordinator.acquire(request(UUID.randomUUID(), HASH_A, HASH_B, HASH_C));
        assertThat(coordinator.complete(owner.lease(), "{\"schemaVersion\":1}", usage(), 0, List.of())).isTrue();
        jdbc.update("update overview_generations set result_sha256=? where id=?", HASH_D, owner.generationId());

        assertThatThrownBy(() -> coordinator.acquire(original))
                .isInstanceOf(DomainException.class)
                .extracting(error -> ((DomainException) error).code())
                .isEqualTo("VALIDATION_FAILED");
        assertThatThrownBy(() -> coordinator.await(waiter, Duration.ofMillis(100), () -> false))
                .isInstanceOf(DomainException.class)
                .extracting(error -> ((DomainException) error).code())
                .isEqualTo("VALIDATION_FAILED");
    }

    @Test
    void waiterReturnsExpiredWhenOwnerLeaseExpiresBeforeItsDeadline() {
        var originalRequest = request(UUID.randomUUID(), HASH_A, HASH_B, HASH_C);
        var owner = coordinator.acquire(originalRequest);
        var waiter = coordinator.acquire(request(UUID.randomUUID(), HASH_A, HASH_B, HASH_C));
        jdbc.update("update overview_generations set lease_until=? where id=?",
                OffsetDateTime.now().minusSeconds(1), owner.generationId());

        var result = coordinator.await(waiter, Duration.ofSeconds(2), () -> false);

        assertThat(result.status()).isEqualTo("EXPIRED");
        var lookup = coordinator.lookupRequest(originalRequest).orElseThrow();
        assertThat(lookup.state()).isEqualTo(OverviewGenerationCoordinator.AcquisitionState.WAITER);
        assertThat(jdbc.queryForObject("select fence from overview_generations where id=?", Long.class,
                owner.generationId())).isEqualTo(owner.lease().fence());
        assertThat(coordinator.acquire(originalRequest).state())
                .isEqualTo(OverviewGenerationCoordinator.AcquisitionState.OWNER);
    }

    @Test
    void lookupDistinguishesActiveWaiterFromFailedRetryWithoutClaiming() {
        var originalRequest = request(UUID.randomUUID(), HASH_A, HASH_B, HASH_C);
        assertThat(coordinator.lookupRequest(originalRequest)).isEmpty();
        assertThat(jdbc.queryForObject("select count(*) from overview_generations", Integer.class)).isZero();

        var owner = coordinator.acquire(originalRequest);
        var activeLookup = coordinator.lookupRequest(originalRequest).orElseThrow();
        assertThat(activeLookup.state()).isEqualTo(OverviewGenerationCoordinator.AcquisitionState.WAITER);
        assertThat(activeLookup.generationId()).isEqualTo(owner.generationId());
        assertThat(coordinator.fail(owner.lease(), "MODEL_TIMEOUT", usage(), 0, List.of())).isTrue();
        assertThat(coordinator.await(activeLookup, Duration.ofSeconds(1), () -> false).status()).isEqualTo("FAILED");
        var failedLookup = coordinator.lookupRequest(originalRequest).orElseThrow();
        assertThat(failedLookup.state()).isEqualTo(OverviewGenerationCoordinator.AcquisitionState.FAILED);
        assertThat(failedLookup.lease()).isNull();
        assertThat(failedLookup.generationId()).isEqualTo(owner.generationId());
        assertThat(failedLookup.budgetTaskId()).isEqualTo(owner.budgetTaskId());
        assertThat(jdbc.queryForObject("select fence from overview_generations where id=?", Long.class,
                owner.generationId())).isEqualTo(owner.lease().fence());
        assertThat(coordinator.acquire(originalRequest).state()).isEqualTo(OverviewGenerationCoordinator.AcquisitionState.OWNER);
    }

    @Test
    void cleanupDropsAbandonedExpiredActiveCheckpointButRetainsBudgetLineage() {
        var originalRequest = request(UUID.randomUUID(), HASH_A, HASH_B, HASH_C);
        var original = coordinator.acquire(originalRequest);
        coordinator.saveCheckpoint(original.lease(), "MAP:1", HASH_A, HASH_C, "overview-v1", 1,
                "{\"schemaVersion\":1,\"title\":\"private map\"}");
        jdbc.update("update overview_generations set lease_until=?,updated_at=? where id=?",
                OffsetDateTime.now().minusDays(15), OffsetDateTime.now().minusDays(15), original.generationId());

        assertThat(coordinator.cleanupExpiredPayloads()).isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from overview_generations where id=?", Integer.class,
                original.generationId())).isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from overview_generation_requests where generation_id=?",
                Integer.class, original.generationId())).isEqualTo(1);

        var takeover = coordinator.acquire(request(UUID.randomUUID(), HASH_A, HASH_B, HASH_C));
        assertThat(takeover.state()).isEqualTo(OverviewGenerationCoordinator.AcquisitionState.OWNER);
        assertThat(takeover.generationId()).isEqualTo(original.generationId());
        assertThat(takeover.budgetTaskId()).isEqualTo(original.budgetTaskId());
        assertThat(coordinator.loadCheckpoint(takeover.lease(), "MAP:1", HASH_A, HASH_C, "overview-v1", 1)).isNull();
    }

    @Test
    void cleanupOfFailedCheckpointRetainsCumulativeBudgetForProviderChangeRetry() {
        var originalRequest = request(UUID.randomUUID(), HASH_A, HASH_B, HASH_C);
        var original = coordinator.acquire(originalRequest);
        coordinator.saveCheckpoint(original.lease(), "MAP:1", HASH_A, HASH_C, "overview-v1", 1,
                "{\"schemaVersion\":1,\"title\":\"private map\"}");
        var failedUsage = new OverviewTaskUsageSummary(120, 300, null, null, 420, 2, 0, false);
        assertThat(coordinator.fail(original.lease(), "MODEL_TIMEOUT", failedUsage, 1, List.of("REPACK"))).isTrue();
        jdbc.update("update overview_generations set updated_at=? where id=?",
                OffsetDateTime.now().minusDays(15), original.generationId());

        assertThat(coordinator.cleanupExpiredPayloads()).isEqualTo(1);
        assertThat(jdbc.queryForObject("select budget_task_id from overview_generations where id=?", UUID.class,
                original.generationId())).isEqualTo(original.budgetTaskId());
        assertThat(jdbc.queryForObject("select charged_tokens from overview_generations where id=?", Long.class,
                original.generationId())).isEqualTo(420L);
        assertThat(jdbc.queryForObject("select unknown_dispatched_calls from overview_generations where id=?", Long.class,
                original.generationId())).isEqualTo(2L);

        var retry = coordinator.acquire(request(UUID.randomUUID(), HASH_A, HASH_B, HASH_D));
        assertThat(retry.generationId()).isEqualTo(original.generationId());
        assertThat(retry.budgetTaskId()).isEqualTo(original.budgetTaskId());
        assertThat(coordinator.loadCheckpoint(retry.lease(), "MAP:1", HASH_A, HASH_D, "overview-v1", 1)).isNull();
    }

    @Test
    void failedRetryKeepsBudgetIdentityAndOnlyReusesCheckpointForBoundProfile() {
        var firstRequest = request(UUID.randomUUID(), HASH_A, HASH_B, HASH_C);
        var first = coordinator.acquire(firstRequest);
        coordinator.saveCheckpoint(first.lease(), "MAP:1", HASH_A, HASH_C, "overview-v1", 1,
                "{\"schemaVersion\":1,\"title\":\"map\"}");
        assertThat(coordinator.fail(first.lease(), "MODEL_TIMEOUT", usage(), 1,
                List.of("LOCAL_NORMALIZE", "REPACK"))).isTrue();

        var retry = coordinator.acquire(request(UUID.randomUUID(), HASH_A, HASH_B, HASH_D));
        assertThat(retry.state()).isEqualTo(OverviewGenerationCoordinator.AcquisitionState.OWNER);
        assertThat(retry.generationId()).isEqualTo(first.generationId());
        assertThat(retry.budgetTaskId()).isEqualTo(first.budgetTaskId());
        assertThat(retry.lease().fence()).isGreaterThan(first.lease().fence());
        assertThat(coordinator.loadCheckpoint(retry.lease(), "MAP:1", HASH_A, HASH_D, "overview-v1", 1))
                .isNull();

        assertThatThrownBy(() -> coordinator.saveCheckpoint(first.lease(), "MAP:2", HASH_A, HASH_C,
                "overview-v1", 1, "{\"schemaVersion\":1}"))
                .isInstanceOf(AiUsageLimitException.class);
        assertThat(coordinator.complete(first.lease(), "{\"schemaVersion\":1}", usage(), 0, List.of()))
                .isFalse();

        coordinator.saveCheckpoint(retry.lease(), "MAP:1", HASH_A, HASH_D, "overview-v1", 1,
                "{\"schemaVersion\":1,\"title\":\"new map\"}");
        assertThat(coordinator.complete(retry.lease(), "{\"schemaVersion\":1,\"title\":\"final\"}",
                usage(), 0, List.of())).isTrue();
        assertThatThrownBy(() -> coordinator.acquire(firstRequest))
                .isInstanceOf(DomainException.class)
                .extracting(error -> ((DomainException) error).code())
                .isEqualTo("RESOURCE_VERSION_CONFLICT");
    }

    @Test
    void recoveryMetadataAccumulatesAcrossTakeoversAndZeroRecoverySuccess() {
        var first = coordinator.acquire(request(UUID.randomUUID(), HASH_A, HASH_B, HASH_C));
        assertThat(coordinator.fail(first.lease(), "MODEL_TIMEOUT", usage(), 1,
                List.of("REDUCE_RECOVERY"))).isTrue();

        var second = coordinator.acquire(request(UUID.randomUUID(), HASH_A, HASH_B, HASH_C));
        assertThat(second.generationId()).isEqualTo(first.generationId());
        assertThat(coordinator.fail(second.lease(), "MODEL_TIMEOUT", usage(), 1,
                List.of("SPLIT"))).isTrue();

        var third = coordinator.acquire(request(UUID.randomUUID(), HASH_A, HASH_B, HASH_C));
        assertThat(third.generationId()).isEqualTo(first.generationId());
        assertThat(coordinator.complete(third.lease(), "{\"schemaVersion\":1}", usage(), 0, List.of()))
                .isTrue();
        assertThat(jdbc.queryForObject("select recovery_count from overview_generations where id=?", Integer.class,
                first.generationId())).isEqualTo(2);
        assertThat(jdbc.queryForObject("select recovery_actions_json from overview_generations where id=?",
                String.class, first.generationId())).isEqualTo("[\"REDUCE_RECOVERY\",\"SPLIT\"]");
    }

    @Test
    void exactRequestIdRejectsPayloadOrProfileReuseAndSeparatesOwners() {
        var firstRequest = request(UUID.randomUUID(), HASH_A, HASH_B, HASH_C);
        var first = coordinator.acquire(firstRequest);
        assertThatThrownBy(() -> coordinator.acquire(request(firstRequest.requestId(), HASH_A, HASH_D, HASH_C)))
                .isInstanceOf(DomainException.class)
                .extracting(error -> ((DomainException) error).code())
                .isEqualTo("RESOURCE_VERSION_CONFLICT");
        assertThatThrownBy(() -> coordinator.acquire(request(firstRequest.requestId(), HASH_A, HASH_B, HASH_D)))
                .isInstanceOf(DomainException.class)
                .extracting(error -> ((DomainException) error).code())
                .isEqualTo("RESOURCE_VERSION_CONFLICT");

        UUID secondUser = UUID.randomUUID();
        jdbc.update("insert into users(id,status) values (?, 'ACTIVE')", secondUser);
        var otherOwner = coordinator.acquire(request(secondUser, UUID.randomUUID(), HASH_A, HASH_B, HASH_C));
        assertThat(otherOwner.state()).isEqualTo(OverviewGenerationCoordinator.AcquisitionState.OWNER);
        assertThat(otherOwner.generationId()).isNotEqualTo(first.generationId());
        assertThat(otherOwner.budgetTaskId()).isNotEqualTo(first.budgetTaskId());
    }

    @Test
    void associatesEveryLocalFlightRequestAndSeparatesSourceRevisions() {
        var ownerRequest = request(UUID.randomUUID(), HASH_A, HASH_B, HASH_C);
        var owner = coordinator.acquire(ownerRequest);
        var joinedRequest = request(UUID.randomUUID(), HASH_A, HASH_B, HASH_C);
        coordinator.associateRequest(owner.lease(), joinedRequest);
        assertThat(coordinator.acquire(joinedRequest).state())
                .isEqualTo(OverviewGenerationCoordinator.AcquisitionState.WAITER);
        assertThatThrownBy(() -> coordinator.associateRequest(owner.lease(),
                request(joinedRequest.requestId(), HASH_A, HASH_D, HASH_C)))
                .isInstanceOf(DomainException.class)
                .extracting(error -> ((DomainException) error).code())
                .isEqualTo("RESOURCE_VERSION_CONFLICT");

        UUID sourceId = UUID.randomUUID();
        UUID firstRevision = UUID.randomUUID();
        UUID secondRevision = UUID.randomUUID();
        var firstSource = coordinator.acquire(new OverviewGenerationCoordinator.Request(userId, UUID.randomUUID(),
                "SOURCE", sourceId, firstRevision, HASH_A, HASH_B, HASH_C, "overview-v1"));
        var changedRevision = coordinator.acquire(new OverviewGenerationCoordinator.Request(userId, UUID.randomUUID(),
                "SOURCE", sourceId, secondRevision, HASH_A, HASH_B, HASH_C, "overview-v1"));
        assertThat(changedRevision.generationId()).isNotEqualTo(firstSource.generationId());
        assertThat(changedRevision.budgetTaskId()).isNotEqualTo(firstSource.budgetTaskId());
    }

    @Test
    void associatesAcquisitionBindingWithoutClaimingAndAllowsLateWaiterAssociation() {
        ScheduledExecutorService secondHeartbeat = Executors.newSingleThreadScheduledExecutor();
        var secondCoordinator = new OverviewGenerationCoordinator(jdbc, transactionManager,
                Clock.systemUTC(), 1_000, 100, secondHeartbeat);
        try {
            var ownerRequest = request(UUID.randomUUID(), HASH_A, HASH_B, HASH_C);
            var owner = coordinator.acquire(ownerRequest);
            var ownerParticipant = request(UUID.randomUUID(), HASH_A, HASH_B, HASH_C);
            int generationsBefore = jdbc.queryForObject("select count(*) from overview_generations", Integer.class);
            coordinator.associateRequest(owner, ownerParticipant);
            assertThat(coordinator.lookupRequest(ownerParticipant).orElseThrow().generationId())
                    .isEqualTo(owner.generationId());
            assertThat(jdbc.queryForObject("select count(*) from overview_generations", Integer.class))
                    .isEqualTo(generationsBefore);

            var waiterParticipant = request(UUID.randomUUID(), HASH_A, HASH_B, HASH_C);
            var waiter = secondCoordinator.acquire(waiterParticipant);
            assertThat(waiter.state()).isEqualTo(OverviewGenerationCoordinator.AcquisitionState.WAITER);
            assertThat(waiter.generationId()).isEqualTo(owner.generationId());
            assertThat(coordinator.complete(owner.lease(), "{\"schemaVersion\":1}", usage(), 0, List.of()))
                    .isTrue();
            // Local-flight participants can publish their association after the shared generation completes.
            secondCoordinator.associateRequest(waiter, waiterParticipant);
            assertThat(secondCoordinator.lookupRequest(waiterParticipant).orElseThrow().state())
                    .isEqualTo(OverviewGenerationCoordinator.AcquisitionState.REPLAY);
            assertThat(jdbc.queryForObject("select generation_id from overview_generation_requests where user_id=? and request_id=?",
                    UUID.class, waiterParticipant.userId(), waiterParticipant.requestId()))
                    .isEqualTo(owner.generationId());
            assertThat(jdbc.queryForObject("select count(*) from overview_generations", Integer.class))
                    .isEqualTo(generationsBefore);

            assertThatThrownBy(() -> coordinator.associateRequest(waiter,
                    request(waiterParticipant.requestId(), HASH_A, HASH_D, HASH_C)))
                    .isInstanceOf(DomainException.class)
                    .extracting(error -> ((DomainException) error).code())
                    .isEqualTo("RESOURCE_VERSION_CONFLICT");
            UUID otherUser = UUID.randomUUID();
            jdbc.update("insert into users(id,status) values (?, 'ACTIVE')", otherUser);
            var crossUser = request(otherUser, UUID.randomUUID(), HASH_A, HASH_B, HASH_C);
            assertThatThrownBy(() -> coordinator.associateRequest(waiter, crossUser))
                    .isInstanceOf(DomainException.class)
                    .extracting(error -> ((DomainException) error).code())
                    .isEqualTo("RESOURCE_VERSION_CONFLICT");

            var failedOwner = coordinator.acquire(request(UUID.randomUUID(), HASH_A, HASH_B, HASH_C));
            var lateFailedParticipant = request(UUID.randomUUID(), HASH_A, HASH_B, HASH_C);
            var failedWaiter = secondCoordinator.acquire(lateFailedParticipant);
            assertThat(failedWaiter.state()).isEqualTo(OverviewGenerationCoordinator.AcquisitionState.WAITER);
            assertThat(coordinator.fail(failedOwner.lease(), "MODEL_TIMEOUT", usage(), 0, List.of())).isTrue();
            secondCoordinator.associateRequest(failedWaiter, lateFailedParticipant);
            assertThat(secondCoordinator.lookupRequest(lateFailedParticipant).orElseThrow().state())
                    .isEqualTo(OverviewGenerationCoordinator.AcquisitionState.FAILED);
            assertThat(secondCoordinator.acquire(lateFailedParticipant).state())
                    .isEqualTo(OverviewGenerationCoordinator.AcquisitionState.OWNER);
        } finally {
            secondHeartbeat.shutdownNow();
        }
    }

    @Test
    void limitsPrivatePayloadAndRecoveryMetadataAndExpiresPayloadWithoutDeletingLineage() {
        var originalRequest = request(UUID.randomUUID(), HASH_A, HASH_B, HASH_C);
        var owner = coordinator.acquire(originalRequest);
        assertThatThrownBy(() -> coordinator.saveCheckpoint(owner.lease(), "MAP:1", HASH_A, HASH_C,
                "overview-v1", 1, "x".repeat(OverviewGenerationCoordinator.MAX_PAYLOAD_CHARS + 1)))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> coordinator.fail(owner.lease(), "MODEL_TIMEOUT", usage(), 0,
                List.of("provider secret"))).isInstanceOf(IllegalArgumentException.class);
        assertThat(coordinator.complete(owner.lease(), "{\"schemaVersion\":1}", usage(), 0, List.of())).isTrue();
        jdbc.update("update overview_generations set result_expires_at=? where id=?",
                Instant.now().minusSeconds(1), owner.generationId());

        assertThat(coordinator.cleanupExpiredPayloads()).isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from overview_generations where id=?", Integer.class,
                owner.generationId())).isEqualTo(1);
        assertThatThrownBy(() -> coordinator.acquire(originalRequest))
                .isInstanceOf(DomainException.class)
                .extracting(error -> ((DomainException) error).code())
                .isEqualTo("RESOURCE_VERSION_CONFLICT");
        var regenerated = coordinator.acquire(request(UUID.randomUUID(), HASH_A, HASH_B, HASH_C));
        assertThat(regenerated.state()).isEqualTo(OverviewGenerationCoordinator.AcquisitionState.OWNER);
        assertThat(regenerated.generationId()).isNotEqualTo(owner.generationId());
    }

    @Test
    void persistsCumulativeUnknownDispatchAndChargedUsageAcrossRetry() {
        var first = coordinator.acquire(request(UUID.randomUUID(), HASH_A, HASH_B, HASH_C));
        var incomplete = new OverviewTaskUsageSummary(120, 300, null, null, 420, 2, 1, false);
        assertThat(coordinator.fail(first.lease(), "MODEL_TIMEOUT", incomplete, 1, List.of("REPACK"))).isTrue();
        assertThat(jdbc.queryForObject("select unknown_dispatched_calls from overview_generations where id=?",
                Long.class, first.generationId())).isEqualTo(2L);
        assertThat(jdbc.queryForObject("select charged_tokens from overview_generations where id=?",
                Long.class, first.generationId())).isEqualTo(420L);

        var retry = coordinator.acquire(request(UUID.randomUUID(), HASH_A, HASH_B, HASH_C));
        var cumulative = new OverviewTaskUsageSummary(180, 450, null, null, 610, 2, 0, false);
        assertThat(coordinator.complete(retry.lease(), "{\"schemaVersion\":1}", cumulative, 1,
                List.of("REPACK"))).isTrue();
        assertThat(jdbc.queryForObject("select unknown_dispatched_calls from overview_generations where id=?",
                Long.class, first.generationId())).isEqualTo(2L);
        assertThat(jdbc.queryForObject("select active_dispatched_reservations from overview_generations where id=?",
                Long.class, first.generationId())).isZero();
        assertThat(jdbc.queryForObject("select charged_tokens from overview_generations where id=?",
                Long.class, first.generationId())).isEqualTo(610L);
        assertThat(jdbc.queryForObject("select provider_usage_complete from overview_generations where id=?",
                Boolean.class, first.generationId())).isFalse();
    }

    @Test
    void independentCoordinatorTakesExpiredLeaseAndRejectsLateOwnerWrites() {
        ScheduledExecutorService secondHeartbeat = Executors.newSingleThreadScheduledExecutor();
        var secondCoordinator = new OverviewGenerationCoordinator(jdbc, transactionManager,
                Clock.systemUTC(), 1_000, 100, secondHeartbeat);
        try {
            var originalRequest = request(UUID.randomUUID(), HASH_A, HASH_B, HASH_C);
            var original = coordinator.acquire(originalRequest);
            jdbc.update("update overview_generations set lease_until=? where id=?",
                    OffsetDateTime.now().minusSeconds(1), original.generationId());

            var takeover = secondCoordinator.acquire(request(UUID.randomUUID(), HASH_A, HASH_B, HASH_C));
            assertThat(takeover.state()).isEqualTo(OverviewGenerationCoordinator.AcquisitionState.OWNER);
            assertThat(takeover.generationId()).isEqualTo(original.generationId());
            assertThat(takeover.budgetTaskId()).isEqualTo(original.budgetTaskId());
            assertThat(takeover.lease().fence()).isGreaterThan(original.lease().fence());
            assertThat(coordinator.complete(original.lease(), "{\"schemaVersion\":1}", usage(), 0, List.of()))
                    .isFalse();
            assertThatThrownBy(() -> coordinator.saveCheckpoint(original.lease(), "MAP:1", HASH_A, HASH_C,
                    "overview-v1", 1, "{\"schemaVersion\":1}"))
                    .isInstanceOf(AiUsageLimitException.class)
                    .satisfies(error -> {
                        var limit = (AiUsageLimitException) error;
                        assertThat(limit.code()).isEqualTo("AI_CONCURRENCY_LIMIT");
                        assertThat(limit.status()).isEqualTo(429);
                        assertThat(limit.retryAfterSeconds()).isPositive();
                    });
            assertThat(secondCoordinator.complete(takeover.lease(), "{\"schemaVersion\":1}", usage(), 0,
                    List.of())).isTrue();
        } finally {
            secondHeartbeat.shutdownNow();
        }
    }

    private OverviewGenerationCoordinator.Request request(UUID requestId, String input, String payload, String profile) {
        return request(userId, requestId, input, payload, profile);
    }

    private OverviewGenerationCoordinator.Request request(UUID ownerId, UUID requestId,
                                                           String input, String payload, String profile) {
        return new OverviewGenerationCoordinator.Request(ownerId, requestId, "SUBJECT", subjectId, null,
                input, payload, profile, "overview-v1");
    }

    private AiProviderUsage usage() {
        return new AiProviderUsage(10, 20, 9L, 18L, 27, true);
    }

    private OverviewTaskUsageSummary usageSummary() {
        return new OverviewTaskUsageSummary(10, 20, null, null, 27, 1, 0, false);
    }

    private static final String HASH_A = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    private static final String HASH_B = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    private static final String HASH_C = "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";
    private static final String HASH_D = "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd";
}

