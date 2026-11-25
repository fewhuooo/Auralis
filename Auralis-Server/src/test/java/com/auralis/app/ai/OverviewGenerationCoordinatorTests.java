package com.auralis.app.ai;

import com.auralis.app.ai.usage.AiProviderUsage;
import com.auralis.app.ai.usage.OverviewTaskUsageSummary;
import com.auralis.app.shared.config.AuralisProperties;
import com.auralis.app.shared.error.DomainException;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.jdbc.datasource.init.ScriptUtils;
import org.springframework.transaction.support.TransactionTemplate;

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
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

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
        jdbc.execute("create table ai_usage_reservations (id UUID primary key, user_id UUID, request_dispatched BOOLEAN not null default false)");
        try (Connection connection = dataSource.getConnection()) {
            ScriptUtils.executeSqlScript(connection,
                    new ClassPathResource("db/migration/V32__overview_private_generations.sql"));
            ScriptUtils.executeSqlScript(connection,
                    new ClassPathResource("db/migration/V35__overview_execution_journal.sql"));
            ScriptUtils.executeSqlScript(connection,
                    new ClassPathResource("db/migration/V36__overview_background_jobs.sql"));
            ScriptUtils.executeSqlScript(connection,
                    new ClassPathResource("db/migration/V38__overview_reusable_cache_capacity_guard.sql"));
            ScriptUtils.executeSqlScript(connection,
                    new ClassPathResource("db/migration/V41__overview_retry_lineage.sql"));
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
    void acceptsAdaptiveIndexCoverageRepairRecoveryAction() {
        var owner = coordinator.acquire(request(UUID.randomUUID(), HASH_A, HASH_B, HASH_C));
        String action = "ADAPTIVE_INDEX_COVERAGE_REPAIR_0123456789ABCDEF";

        assertThat(coordinator.complete(owner.lease(), "{\"schemaVersion\":1}", usage(), 1, List.of(action)))
                .isTrue();
        assertThat(jdbc.queryForObject("select recovery_actions_json from overview_generations where id=?",
                String.class, owner.generationId())).contains(action);
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
    void directAcquireCreatesNewAttemptAfterFailedGenerationAndKeepsMappedFailureTerminal() {
        var parentRequest = request(UUID.randomUUID(), HASH_A, HASH_B, HASH_C);
        var parent = coordinator.acquire(parentRequest);
        assertThat(coordinator.fail(parent.lease(), "MODEL_PROVIDER_ERROR", usage(), 0, List.of())).isTrue();

        var directReplay = coordinator.acquire(parentRequest);
        assertThat(directReplay.state()).isEqualTo(OverviewGenerationCoordinator.AcquisitionState.FAILED);
        assertThat(directReplay.generationId()).isEqualTo(parent.generationId());

        var freshRequest = request(UUID.randomUUID(), HASH_A, HASH_B, HASH_C);
        var fresh = coordinator.acquire(freshRequest);
        assertThat(fresh.state()).isEqualTo(OverviewGenerationCoordinator.AcquisitionState.OWNER);
        assertThat(fresh.generationId()).isNotEqualTo(parent.generationId());
        assertThat(fresh.budgetTaskId()).isNotEqualTo(parent.budgetTaskId());
        assertThat(jdbc.queryForObject("select error_code from overview_generations where id=?", String.class,
                parent.generationId())).isEqualTo("MODEL_PROVIDER_ERROR");
        assertThat(jdbc.queryForObject("select retry_of_generation_id from overview_generations where id=?",
                UUID.class, fresh.generationId())).isNull();
    }

    @Test
    void directAcquireExpiresOldOwnerAndFencesLateBusinessResult() {
        var parentRequest = request(UUID.randomUUID(), HASH_A, HASH_B, HASH_C);
        var parent = coordinator.acquire(parentRequest);
        jdbc.update("update overview_generations set lease_until=? where id=?",
                OffsetDateTime.now(ZoneId.of("UTC")).minusSeconds(2), parent.generationId());

        var fresh = coordinator.acquire(request(UUID.randomUUID(), HASH_A, HASH_B, HASH_C));

        assertThat(fresh.state()).isEqualTo(OverviewGenerationCoordinator.AcquisitionState.OWNER);
        assertThat(fresh.generationId()).isNotEqualTo(parent.generationId());
        assertThat(jdbc.queryForObject("select status from overview_generations where id=?", String.class,
                parent.generationId())).isEqualTo("FAILED");
        assertThat(jdbc.queryForObject("select owner_id from overview_generations where id=?", UUID.class,
                parent.generationId())).isNull();
        assertThat(jdbc.queryForObject("select lease_until from overview_generations where id=?", OffsetDateTime.class,
                parent.generationId())).isNull();
        assertThat(jdbc.queryForObject("select fence from overview_generations where id=?", Long.class,
                parent.generationId())).isEqualTo(parent.lease().fence() + 1);
        assertThat(coordinator.complete(parent.lease(), "{\"schemaVersion\":1}", usage(), 0, List.of())).isFalse();
    }

    @Test
    void explicitDirectRetryInterruptsParentAndOnlyCreatesOneChild() {
        var parentRequest = request(UUID.randomUUID(), HASH_A, HASH_B, HASH_C);
        var parent = coordinator.acquire(parentRequest);
        var childRequest = retryRequest(UUID.randomUUID(), parentRequest.requestId(), HASH_A, HASH_B, HASH_C);

        var child = coordinator.acquire(childRequest);
        var duplicate = coordinator.acquire(retryRequest(UUID.randomUUID(), parentRequest.requestId(),
                HASH_A, HASH_B, HASH_C));

        assertThat(child.state()).isEqualTo(OverviewGenerationCoordinator.AcquisitionState.OWNER);
        assertThat(child.generationId()).isNotEqualTo(parent.generationId());
        assertThat(child.budgetTaskId()).isNotEqualTo(parent.budgetTaskId());
        assertThat(duplicate.generationId()).isEqualTo(child.generationId());
        assertThat(duplicate.state()).isEqualTo(OverviewGenerationCoordinator.AcquisitionState.WAITER);
        assertThatThrownBy(() -> coordinator.acquire(request(childRequest.requestId(), HASH_A, HASH_B, HASH_C)))
                .isInstanceOf(DomainException.class)
                .extracting(error -> ((DomainException) error).code())
                .isEqualTo("RESOURCE_VERSION_CONFLICT");
        assertThat(jdbc.queryForObject("select count(*) from overview_generations where retry_of_generation_id=?",
                Integer.class, parent.generationId())).isEqualTo(1);
        assertThat(jdbc.queryForObject("select retry_of_request_id from overview_generation_requests where user_id=? and request_id=?",
                UUID.class, userId, childRequest.requestId())).isEqualTo(parentRequest.requestId());
        assertThat(jdbc.queryForObject("select input_fingerprint from overview_generations where id=?",
                String.class, child.generationId())).isEqualTo(HASH_A);
        assertThat(jdbc.queryForObject("select status from overview_generations where id=?", String.class,
                parent.generationId())).isEqualTo("FAILED");
        assertThat(coordinator.complete(parent.lease(), "{\"schemaVersion\":1}", usage(), 0, List.of())).isFalse();

        assertThat(coordinator.fail(child.lease(), "MODEL_PROVIDER_ERROR", usage(), 0, List.of())).isTrue();
        assertThat(coordinator.acquire(childRequest).state())
                .isEqualTo(OverviewGenerationCoordinator.AcquisitionState.FAILED);
        var duplicateAfterFailure = coordinator.acquire(retryRequest(UUID.randomUUID(), parentRequest.requestId(),
                HASH_A, HASH_B, HASH_C));
        assertThat(duplicateAfterFailure.state()).isEqualTo(OverviewGenerationCoordinator.AcquisitionState.FAILED);
        assertThat(duplicateAfterFailure.generationId()).isEqualTo(child.generationId());
    }

    @Test
    void concurrentDifferentRequestIdsForSameRetryParentConvergeOnOneChild() throws Exception {
        var parentRequest = request(UUID.randomUUID(), HASH_A, HASH_B, HASH_C);
        var parent = coordinator.acquire(parentRequest);
        var firstRequest = retryRequest(UUID.randomUUID(), parentRequest.requestId(), HASH_A, HASH_B, HASH_C);
        var secondRequest = retryRequest(UUID.randomUUID(), parentRequest.requestId(), HASH_A, HASH_B, HASH_C);
        var executor = Executors.newFixedThreadPool(2);
        CountDownLatch start = new CountDownLatch(1);
        try {
            Future<OverviewGenerationCoordinator.Acquisition> first = executor.submit(() -> {
                start.await();
                return coordinator.acquire(firstRequest);
            });
            Future<OverviewGenerationCoordinator.Acquisition> second = executor.submit(() -> {
                start.await();
                return coordinator.acquire(secondRequest);
            });
            start.countDown();
            var firstResult = first.get(5, TimeUnit.SECONDS);
            var secondResult = second.get(5, TimeUnit.SECONDS);

            assertThat(firstResult.generationId()).isEqualTo(secondResult.generationId());
            assertThat(List.of(firstResult.state(), secondResult.state()))
                    .containsExactlyInAnyOrder(OverviewGenerationCoordinator.AcquisitionState.OWNER,
                            OverviewGenerationCoordinator.AcquisitionState.WAITER);
            assertThat(jdbc.queryForObject("select count(*) from overview_generations where retry_of_generation_id=?",
                    Integer.class, parent.generationId())).isEqualTo(1);
        } finally {
            executor.shutdownNow();
        }
    }

    @Test
    void changedIdentityAfterExistingRetryChildStartsIndependentDirectGeneration() {
        var parentRequest = request(UUID.randomUUID(), HASH_A, HASH_B, HASH_C);
        var parent = coordinator.acquire(parentRequest);
        var child = coordinator.acquire(retryRequest(UUID.randomUUID(), parentRequest.requestId(),
                HASH_A, HASH_B, HASH_C));
        var changed = coordinator.acquire(retryRequest(UUID.randomUUID(), parentRequest.requestId(),
                HASH_D, HASH_B, HASH_C));

        assertThat(changed.state()).isEqualTo(OverviewGenerationCoordinator.AcquisitionState.OWNER);
        assertThat(changed.generationId()).isNotEqualTo(child.generationId());
        assertThat(changed.generationId()).isNotEqualTo(parent.generationId());
        assertThat(jdbc.queryForObject("select retry_of_generation_id from overview_generations where id=?",
                UUID.class, changed.generationId())).isNull();
        assertThat(jdbc.queryForObject("select count(*) from overview_generations where retry_of_generation_id=?",
                Integer.class, parent.generationId())).isEqualTo(1);
    }

    @Test
    void profileChangeStartsIndependentDirectGenerationWithoutChangingContentIdentity() {
        var original = coordinator.acquire(request(UUID.randomUUID(), HASH_A, HASH_B, HASH_C));
        var changedProfile = coordinator.acquire(request(UUID.randomUUID(), HASH_A, HASH_B, HASH_D));

        assertThat(changedProfile.state()).isEqualTo(OverviewGenerationCoordinator.AcquisitionState.OWNER);
        assertThat(changedProfile.generationId()).isNotEqualTo(original.generationId());
        assertThat(changedProfile.budgetTaskId()).isNotEqualTo(original.budgetTaskId());
        assertThat(jdbc.queryForObject("select count(*) from overview_generations where status='ACTIVE' and input_fingerprint=?",
                Integer.class, HASH_A)).isEqualTo(2);
    }

    @Test
    void unresolvedOrForeignRetryRequestIdDoesNotAccessAnotherGeneration() {
        UUID missing = UUID.randomUUID();
        var missingTarget = coordinator.acquire(retryRequest(UUID.randomUUID(), missing,
                HASH_A, HASH_B, HASH_C));
        assertThat(missingTarget.state()).isEqualTo(OverviewGenerationCoordinator.AcquisitionState.OWNER);
        assertThat(jdbc.queryForObject("select retry_of_generation_id from overview_generations where id=?",
                UUID.class, missingTarget.generationId())).isNull();

        UUID otherUser = UUID.randomUUID();
        jdbc.update("insert into users(id,status) values (?, 'ACTIVE')", otherUser);
        var foreignRequest = request(otherUser, UUID.randomUUID(), HASH_A, HASH_B, HASH_C);
        var foreignGeneration = coordinator.acquire(foreignRequest);
        var localRequest = retryRequest(UUID.randomUUID(), foreignRequest.requestId(), HASH_A, HASH_B, HASH_C);
        var localGeneration = coordinator.acquire(localRequest);
        assertThat(localGeneration.generationId()).isNotEqualTo(foreignGeneration.generationId());
        assertThat(jdbc.queryForObject("select status from overview_generations where id=?", String.class,
                foreignGeneration.generationId())).isEqualTo("ACTIVE");
        assertThat(jdbc.queryForObject("select retry_of_generation_id from overview_generations where id=?",
                UUID.class, localGeneration.generationId())).isNull();
    }

    @Test
    void retryTargetInAnotherScopeIsRejectedBeforeParentIsFenced() {
        var parentRequest = request(UUID.randomUUID(), HASH_A, HASH_B, HASH_C);
        var parent = coordinator.acquire(parentRequest);
        UUID otherSubject = UUID.randomUUID();
        var wrongScope = new OverviewGenerationCoordinator.Request(userId, UUID.randomUUID(), "SUBJECT", otherSubject,
                null, HASH_A, HASH_B, HASH_C, "overview-v1", List.of(), parentRequest.requestId());

        assertThatThrownBy(() -> coordinator.acquire(wrongScope))
                .isInstanceOf(DomainException.class)
                .extracting(error -> ((DomainException) error).code())
                .isEqualTo("RESOURCE_VERSION_CONFLICT");
        assertThat(coordinator.owns(parent.lease())).isTrue();
        assertThat(jdbc.queryForObject("select count(*) from overview_generations where retry_of_generation_id=?",
                Integer.class, parent.generationId())).isZero();
    }


    @Test
    void waiterSupportsVeryLargeDurationsWithoutNanoDeadlineOverflow() {
        var owner = coordinator.acquire(request(UUID.randomUUID(), HASH_A, HASH_B, HASH_C));
        var waiter = coordinator.acquire(request(UUID.randomUUID(), HASH_A, HASH_B, HASH_C));
        assertThat(coordinator.complete(owner.lease(), "{\"schemaVersion\":1}", usage(), 0, List.of())).isTrue();

        var awaited = coordinator.await(waiter, Duration.ofMillis(Long.MAX_VALUE), () -> false);

        assertThat(awaited.status()).isEqualTo("SUCCESS");
        assertThat(awaited.resultJson()).isEqualTo("{\"schemaVersion\":1}");
    }

    @Test
    void reusableCacheCapacityUsesUtf8BytesAndKeepsSuccessMetadataWhenCurrentPayloadIsOversized() {
        OverviewGenerationCoordinator limited = capacityCoordinator(9, 1);
        var original = request(UUID.randomUUID(), HASH_A, HASH_B, HASH_C);
        var owner = limited.acquire(original);
        String payload = "{\"v\":\"汉\"}";
        assertThat(payload.getBytes(java.nio.charset.StandardCharsets.UTF_8).length).isGreaterThan(9);

        assertThat(limited.complete(owner.lease(), payload, usage(), 0, List.of())).isTrue();
        assertThat(jdbc.queryForObject("select status from overview_generations where id=?", String.class,
                owner.generationId())).isEqualTo("SUCCESS");
        assertThat(jdbc.queryForObject("select result_json from overview_generations where id=?", String.class,
                owner.generationId())).isNull();
        assertThatThrownBy(() -> limited.acquire(original))
                .isInstanceOf(DomainException.class)
                .extracting(error -> ((DomainException) error).code())
                .isEqualTo("RESOURCE_VERSION_CONFLICT");
    }

    @Test
    void reusableCacheEvictsOldestResultAtGenerationLimit() {
        OverviewGenerationCoordinator limited = capacityCoordinator(128, 1);
        var firstRequest = request(UUID.randomUUID(), HASH_A, HASH_B, HASH_C);
        var first = limited.acquire(firstRequest);
        assertThat(limited.complete(first.lease(), "{\"schemaVersion\":1}", usage(), 0, List.of())).isTrue();

        var second = limited.acquire(request(UUID.randomUUID(), HASH_D, HASH_B, HASH_C));
        assertThat(limited.complete(second.lease(), "{\"schemaVersion\":1}", usage(), 0, List.of())).isTrue();

        assertThat(jdbc.queryForObject("select result_json from overview_generations where id=?", String.class,
                first.generationId())).isNull();
        assertThat(jdbc.queryForObject("select count(*) from overview_generations g where g.status='SUCCESS' and "
                        + "g.result_json is not null",
                Integer.class)).isEqualTo(1);
    }

    @Test
    void reusableCacheAdmissionSkipsLockedOldestVictimAndRejectsOnlyNewPayload() throws Exception {
        OverviewGenerationCoordinator limited = capacityCoordinator(128, 1);
        var first = limited.acquire(request(UUID.randomUUID(), HASH_A, HASH_B, HASH_C));
        assertThat(limited.complete(first.lease(), "{\"schemaVersion\":1}", usage(), 0, List.of())).isTrue();
        CountDownLatch locked = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        var executor = Executors.newSingleThreadExecutor();
        try {
            Future<?> holder = executor.submit(() -> new org.springframework.transaction.support.TransactionTemplate(transactionManager)
                    .executeWithoutResult(tx -> {
                        jdbc.query("select id from overview_generations where id=? for update",
                                (org.springframework.jdbc.core.ResultSetExtractor<Boolean>) rs -> rs.next(), first.generationId());
                        locked.countDown();
                        try {
                            if (!release.await(10, TimeUnit.SECONDS)) throw new IllegalStateException("lock release timed out");
                        } catch (InterruptedException interrupted) {
                            Thread.currentThread().interrupt();
                            throw new IllegalStateException(interrupted);
                        }
                    }));
            assertThat(locked.await(10, TimeUnit.SECONDS)).isTrue();
            var second = limited.acquire(request(UUID.randomUUID(), HASH_D, HASH_B, HASH_C));
            assertThat(limited.complete(second.lease(), "{\"schemaVersion\":1}", usage(), 0, List.of())).isTrue();
            assertThat(jdbc.queryForObject("select result_json from overview_generations where id=?", String.class,
                    second.generationId())).isNull();
            assertThat(jdbc.queryForObject("select result_json from overview_generations where id=?", String.class,
                    first.generationId())).isNotNull();
            release.countDown();
            holder.get(10, TimeUnit.SECONDS);
        } finally {
            release.countDown();
            executor.shutdownNow();
        }
    }

    @Test
    void concurrentCacheAdmissionsSerializeAcrossCoordinatorInstances() throws Exception {
        OverviewGenerationCoordinator limited = capacityCoordinator(128, 1);
        var first = limited.acquire(request(UUID.randomUUID(), HASH_A, HASH_B, HASH_C));
        var second = limited.acquire(request(UUID.randomUUID(), HASH_D, HASH_B, HASH_C));
        var executor = Executors.newFixedThreadPool(2);
        CountDownLatch start = new CountDownLatch(1);
        try {
            Future<Boolean> a = executor.submit(() -> { start.await(); return limited.complete(first.lease(), "{\"schemaVersion\":1}", usage(), 0, List.of()); });
            OverviewGenerationCoordinator other = new OverviewGenerationCoordinator(jdbc, transactionManager,
                    Clock.systemUTC(), 1_000, 100, heartbeat, 128, 1);
            Future<Boolean> b = executor.submit(() -> { start.await(); return other.complete(second.lease(), "{\"schemaVersion\":1}", usage(), 0, List.of()); });
            start.countDown();
            assertThat(a.get(10, TimeUnit.SECONDS)).isTrue();
            assertThat(b.get(10, TimeUnit.SECONDS)).isTrue();
        } finally {
            executor.shutdownNow();
        }
        assertThat(jdbc.queryForObject("select count(*) from overview_generations g where g.status='SUCCESS' and "
                        + "g.result_json is not null",
                Integer.class)).isLessThanOrEqualTo(1);
    }

    @Test
    void v32FailureMetadataColumnsArePresentAndNullable() {
        assertThat(jdbc.queryForObject("select count(*) from information_schema.columns "
                        + "where table_name='OVERVIEW_GENERATIONS' and column_name in "
                        + "('ERROR_STATUS','ERROR_RETRY_AFTER_SECONDS','ERROR_RESET_AT')", Integer.class))
                .isEqualTo(3);
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
    void cleanupExpiresResultWhileKeepingRequestAndBudgetLineage() {
        var originalRequest = request(UUID.randomUUID(), HASH_A, HASH_B, HASH_C);
        var owner = coordinator.acquire(originalRequest);
        assertThat(coordinator.complete(owner.lease(), "{\"schemaVersion\":1}", usage(), 0, List.of())).isTrue();
        jdbc.update("update overview_generations set result_expires_at=? where id=?",
                Instant.now().minusSeconds(1), owner.generationId());

        UUID reservationId = UUID.randomUUID();
        jdbc.update("insert into ai_usage_reservations(id,user_id,request_dispatched) values (?,?,true)",
                reservationId, userId);

        assertThat(coordinator.cleanupExpiredPayloads()).isEqualTo(1);
        assertThat(jdbc.queryForObject("select result_json from overview_generations where id=?", String.class,
                owner.generationId())).isNull();
        assertThat(jdbc.queryForObject("select result_sha256 from overview_generations where id=?", String.class,
                owner.generationId())).isNull();
        assertThat(jdbc.queryForObject("select status from overview_generations where id=?", String.class,
                owner.generationId())).isEqualTo("SUCCESS");
        assertThat(jdbc.queryForObject("select budget_task_id from overview_generations where id=?", UUID.class,
                owner.generationId())).isEqualTo(owner.budgetTaskId());
        assertThat(jdbc.queryForObject("select charged_tokens from overview_generations where id=?", Long.class,
                owner.generationId())).isEqualTo(usage().chargedTokens());
        assertThat(jdbc.queryForObject("select generation_id from overview_generation_requests where user_id=? and request_id=?",
                UUID.class, userId, originalRequest.requestId())).isEqualTo(owner.generationId());
        assertThat(jdbc.queryForObject("select request_dispatched from ai_usage_reservations where id=?",
                Boolean.class, reservationId)).isTrue();
        assertThat(coordinator.cleanupExpiredPayloads()).isZero();
    }

    @Test
    void cleanupIsBoundedToOneHundredGenerationsPerBatchAndIdempotent() {
        for (int index = 0; index < 101; index++) {
            String distinctInput = String.format("%064x", index + 1);
            var owner = coordinator.acquire(request(UUID.randomUUID(), distinctInput, HASH_B, HASH_C));
            assertThat(coordinator.complete(owner.lease(), "{\"schemaVersion\":2}", usage(), 0, List.of())).isTrue();
            jdbc.update("update overview_generations set result_expires_at=? where id=?",
                    OffsetDateTime.now().minusDays(1), owner.generationId());
        }

        assertThat(coordinator.cleanupExpiredPayloads()).isEqualTo(100);
        assertThat(jdbc.queryForObject("select count(*) from overview_generations where result_json is not null", Integer.class)).isEqualTo(1);
        assertThat(coordinator.cleanupExpiredPayloads()).isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from overview_generations where result_json is not null", Integer.class)).isZero();
        assertThat(coordinator.cleanupExpiredPayloads()).isZero();
    }

    @Test
    void cleanupPreservesUnexpiredSuccessAndActiveGeneration() {
        var complete = coordinator.acquire(request(UUID.randomUUID(), HASH_A, HASH_B, HASH_C));
        assertThat(coordinator.complete(complete.lease(), "{}", usage(), 0, List.of())).isTrue();
        var active = coordinator.acquire(request(UUID.randomUUID(), HASH_D, HASH_B, HASH_C));

        assertThat(coordinator.cleanupExpiredPayloads()).isZero();
        assertThat(jdbc.queryForObject("select result_json from overview_generations where id=?",
                String.class, complete.generationId())).isEqualTo("{}");
        assertThat(coordinator.owns(active.lease())).isTrue();
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
    void appliesConfiguredResultCapAndKeepsRecoveryMetadataAndExpiryBehavior() {
        var originalRequest = request(UUID.randomUUID(), HASH_A, HASH_B, HASH_C);
        var limitedCoordinator = new OverviewGenerationCoordinator(jdbc, transactionManager,
                Clock.systemUTC(), 1_000, 100, heartbeat, 268_435_456L, 1_000,
                new AuralisProperties.OverviewLimits(0, 0, 0, 0, 0,
                        24, 0, 0, 0, 0));
        var owner = limitedCoordinator.acquire(originalRequest);
        assertThatThrownBy(() -> limitedCoordinator.complete(owner.lease(), "x".repeat(25), usage(), 0, List.of()))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> limitedCoordinator.fail(owner.lease(), "MODEL_TIMEOUT", usage(), 0,
                List.of("provider secret"))).isInstanceOf(IllegalArgumentException.class);
        assertThat(limitedCoordinator.complete(owner.lease(), "{\"schemaVersion\":1}", usage(), 0, List.of())).isTrue();
        jdbc.update("update overview_generations set result_expires_at=? where id=?",
                Instant.now().minusSeconds(1), owner.generationId());

        assertThat(limitedCoordinator.cleanupExpiredPayloads()).isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from overview_generations where id=?", Integer.class,
                owner.generationId())).isEqualTo(1);
        assertThatThrownBy(() -> limitedCoordinator.acquire(originalRequest))
                .isInstanceOf(DomainException.class)
                .extracting(error -> ((DomainException) error).code())
                .isEqualTo("RESOURCE_VERSION_CONFLICT");
        var regenerated = limitedCoordinator.acquire(request(UUID.randomUUID(), HASH_A, HASH_B, HASH_C));
        assertThat(regenerated.state()).isEqualTo(OverviewGenerationCoordinator.AcquisitionState.OWNER);
        assertThat(regenerated.generationId()).isNotEqualTo(owner.generationId());
    }

    private OverviewGenerationCoordinator capacityCoordinator(long maxBytes, int maxGenerations) {
        return new OverviewGenerationCoordinator(jdbc, transactionManager, Clock.systemUTC(),
                1_000, 100, heartbeat, maxBytes, maxGenerations);
    }

    private OverviewGenerationCoordinator.Request request(UUID requestId, String input, String payload, String profile) {
        return request(userId, requestId, input, payload, profile);
    }

    private OverviewGenerationCoordinator.Request request(UUID ownerId, UUID requestId,
                                                           String input, String payload, String profile) {
        return new OverviewGenerationCoordinator.Request(ownerId, requestId, "SUBJECT", subjectId, null,
                input, payload, profile, "overview-v1");
    }

    private OverviewGenerationCoordinator.Request retryRequest(UUID requestId, UUID retryOfRequestId,
                                                                 String input, String payload, String profile) {
        return new OverviewGenerationCoordinator.Request(userId, requestId, "SUBJECT", subjectId, null,
                input, payload, profile, "overview-v1", List.of(), retryOfRequestId);
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

