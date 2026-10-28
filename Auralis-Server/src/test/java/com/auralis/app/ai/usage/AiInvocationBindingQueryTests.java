package com.auralis.app.ai.usage;

import com.auralis.app.ai.AiCredential;
import com.auralis.app.ai.AiMessageRole;
import com.auralis.app.ai.AiProviderPort;
import com.auralis.app.ai.AiProviderRequest;
import com.auralis.app.ai.AiProviderResponse;
import com.auralis.app.ai.AiProviderType;
import com.auralis.app.ai.EmbeddingProviderPort;
import com.auralis.app.ai.EmbeddingResult;
import com.auralis.app.ai.OverviewCancellation;
import com.auralis.app.ai.internal.provider.AiProviderRegistry;
import com.auralis.app.ai.internal.provider.EmbeddingProviderRegistry;
import com.auralis.app.shared.config.AuralisProperties;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.jdbc.datasource.init.ScriptUtils;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.sql.Connection;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class AiInvocationBindingQueryTests {
    private static final Set<AiOperationKind> OVERVIEW_KINDS = Set.of(AiOperationKind.SOURCE_OVERVIEW);

    @Test
    void bindingObservesRealUndispatchedReservationBeforeSyntheticProvider() throws Exception {
        Fixture fixture = fixture();
        UUID userId = fixture.user();
        SyntheticProvider provider = new SyntheticProvider();
        ScheduledExecutorService heartbeat = Executors.newScheduledThreadPool(1);
        AiUsageGuard guard = fixture.guard();
        AiInvocationGateway gateway = fixture.gateway(guard, provider, heartbeat);
        AtomicReference<UUID> reservationId = new AtomicReference<>();
        AtomicReference<AiInvocationState> callbackState = new AtomicReference<>();
        AtomicBoolean callbackDone = new AtomicBoolean();
        provider.beforeComplete = () -> assertThat(callbackDone.get()).isTrue();
        try (AiTaskScope scope = gateway.beginTask(new AiTaskContext(userId, AiFeature.SOURCE_OVERVIEW,
                "binding-order-" + UUID.randomUUID()))) {
            scope.complete(AiStage.OVERVIEW_MAP, AiProviderType.DEEPSEEK, request(), credential(),
                    AiCredentialSource.PLATFORM, 1_000L, AiOutputRole.INTERMEDIATE, null, id -> {
                        reservationId.set(id);
                        AiInvocationState observed = guard.invocationStateForOwner(userId, scope.taskId(), id,
                                OVERVIEW_KINDS).orElseThrow();
                        callbackState.set(observed);
                        assertThat(observed.requestDispatched()).isFalse();
                        assertThat(observed.state()).isEqualTo("RESERVED");
                        assertThat(observed.chargedTokens()).isZero();
                        callbackDone.set(true);
                    });
        } finally {
            heartbeat.shutdownNow();
        }

        assertThat(provider.completeCalls).isEqualTo(1);
        assertThat(reservationId.get()).isNotNull();
        assertThat(callbackState.get().reservationId()).isEqualTo(reservationId.get());
        AiInvocationState settled = guard.invocationStateForOwner(userId, callbackState.get().taskId(),
                reservationId.get(), OVERVIEW_KINDS).orElseThrow();
        assertThat(settled.state()).isEqualTo("COMPLETED");
        assertThat(settled.requestDispatched()).isTrue();
        assertThat(settled.actualInputTokens()).isEqualTo(4L);
        assertThat(settled.actualOutputTokens()).isEqualTo(4L);
        assertThat(settled.chargedTokens()).isEqualTo(8L);
    }

    @Test
    void beforeDispatchRunsUnderGuardTransactionAfterBindingAndBeforeProvider() throws Exception {
        Fixture fixture = fixture();
        UUID userId = fixture.user();
        SyntheticProvider provider = new SyntheticProvider();
        ScheduledExecutorService heartbeat = Executors.newScheduledThreadPool(1);
        AiUsageGuard guard = fixture.guard();
        AiInvocationGateway gateway = fixture.gateway(guard, provider, heartbeat);
        AtomicReference<UUID> reservationId = new AtomicReference<>();
        AtomicReference<UUID> taskId = new AtomicReference<>();
        AtomicBoolean beforeDispatchDone = new AtomicBoolean();
        provider.beforeComplete = () -> assertThat(beforeDispatchDone.get()).isTrue();
        AiInvocationBinding binding = new AiInvocationBinding() {
            @Override
            public void onReserved(UUID id) {
                reservationId.set(id);
            }

            @Override
            public void beforeDispatch(UUID id) {
                assertThat(TransactionSynchronizationManager.isActualTransactionActive()).isTrue();
                assertThat(id).isEqualTo(reservationId.get());
                AiInvocationState observed = guard.invocationStateForOwner(userId, taskId.get(), id,
                        OVERVIEW_KINDS).orElseThrow();
                assertThat(observed.requestDispatched()).isFalse();
                beforeDispatchDone.set(true);
            }
        };
        try (AiTaskScope scope = gateway.beginTask(new AiTaskContext(userId, AiFeature.SOURCE_OVERVIEW,
                "before-dispatch-order-" + UUID.randomUUID()))) {
            taskId.set(scope.taskId());
            scope.complete(AiStage.OVERVIEW_MAP, AiProviderType.DEEPSEEK, request(), credential(),
                    AiCredentialSource.PLATFORM, 1_000L, AiOutputRole.INTERMEDIATE, null, binding);
        } finally {
            heartbeat.shutdownNow();
        }

        assertThat(provider.completeCalls).isEqualTo(1);
        assertThat(beforeDispatchDone.get()).isTrue();
        assertThat(reservationId.get()).isNotNull();
    }

    @Test
    void beforeDispatchFailureReleasesUndispatchedReservationWithoutProviderCall() throws Exception {
        Fixture fixture = fixture();
        UUID userId = fixture.user();
        SyntheticProvider provider = new SyntheticProvider();
        ScheduledExecutorService heartbeat = Executors.newScheduledThreadPool(1);
        AiUsageGuard guard = fixture.guard();
        AiInvocationGateway gateway = fixture.gateway(guard, provider, heartbeat);
        AtomicReference<UUID> reservationId = new AtomicReference<>();
        AtomicReference<UUID> taskId = new AtomicReference<>();
        AiInvocationBinding binding = new AiInvocationBinding() {
            @Override
            public void onReserved(UUID id) {
                reservationId.set(id);
            }

            @Override
            public void beforeDispatch(UUID id) {
                throw new IllegalStateException("synthetic dispatch check failure");
            }
        };
        try (AiTaskScope scope = gateway.beginTask(new AiTaskContext(userId, AiFeature.SOURCE_OVERVIEW,
                "before-dispatch-failure-" + UUID.randomUUID()))) {
            taskId.set(scope.taskId());
            assertThatThrownBy(() -> scope.complete(AiStage.OVERVIEW_MAP, AiProviderType.DEEPSEEK,
                    request(), credential(), AiCredentialSource.PLATFORM, 1_000L,
                    AiOutputRole.INTERMEDIATE, null, binding))
                    .isInstanceOf(IllegalStateException.class)
                    .hasMessage("synthetic dispatch check failure");
        } finally {
            heartbeat.shutdownNow();
        }

        assertThat(provider.completeCalls).isZero();
        AiInvocationState state = guard.invocationStateForOwner(userId, taskId.get(), reservationId.get(),
                OVERVIEW_KINDS).orElseThrow();
        assertThat(state.state()).isEqualTo("RELEASED");
        assertThat(state.requestDispatched()).isFalse();
        assertThat(state.chargedTokens()).isZero();
    }

    @Test
    void unboundInvocationStillDispatchesAndSettles() throws Exception {
        Fixture fixture = fixture();
        UUID userId = fixture.user();
        SyntheticProvider provider = new SyntheticProvider();
        ScheduledExecutorService heartbeat = Executors.newScheduledThreadPool(1);
        AiUsageGuard guard = fixture.guard();
        AiInvocationGateway gateway = fixture.gateway(guard, provider, heartbeat);
        AtomicReference<UUID> taskId = new AtomicReference<>();
        try (AiTaskScope scope = gateway.beginTask(new AiTaskContext(userId, AiFeature.SOURCE_OVERVIEW,
                "unbound-dispatch-" + UUID.randomUUID()))) {
            taskId.set(scope.taskId());
            scope.complete(AiStage.OVERVIEW_MAP, AiProviderType.DEEPSEEK, request(), credential(),
                    AiCredentialSource.PLATFORM, 1_000L, AiOutputRole.INTERMEDIATE, null);
        } finally {
            heartbeat.shutdownNow();
        }

        assertThat(provider.completeCalls).isEqualTo(1);
        assertThat(fixture.jdbc.queryForObject("select count(*) from ai_usage_reservations where task_id=? "
                + "and state='COMPLETED' and request_dispatched=true", Integer.class, taskId.get())).isEqualTo(1);
    }

    @Test
    void bindingFailureReleasesUndispatchedReservationWithoutProviderCall() throws Exception {
        Fixture fixture = fixture();
        UUID userId = fixture.user();
        SyntheticProvider provider = new SyntheticProvider();
        ScheduledExecutorService heartbeat = Executors.newScheduledThreadPool(1);
        AiUsageGuard guard = fixture.guard();
        AiInvocationGateway gateway = fixture.gateway(guard, provider, heartbeat);
        AtomicReference<UUID> reservationId = new AtomicReference<>();
        UUID taskId;
        try (AiTaskScope scope = gateway.beginTask(new AiTaskContext(userId, AiFeature.SOURCE_OVERVIEW,
                "binding-failure-" + UUID.randomUUID()))) {
            taskId = scope.taskId();
            assertThatThrownBy(() -> scope.complete(AiStage.OVERVIEW_MAP, AiProviderType.DEEPSEEK,
                    request(), credential(), AiCredentialSource.PLATFORM, 1_000L,
                    AiOutputRole.INTERMEDIATE, null, id -> {
                        reservationId.set(id);
                        throw new IllegalStateException("synthetic binding failure");
                    })).isInstanceOf(IllegalStateException.class);
        } finally {
            heartbeat.shutdownNow();
        }

        assertThat(provider.completeCalls).isZero();
        AiInvocationState state = guard.invocationStateForOwner(userId, taskId, reservationId.get(),
                OVERVIEW_KINDS).orElseThrow();
        assertThat(state.state()).isEqualTo("RELEASED");
        assertThat(state.requestDispatched()).isFalse();
        assertThat(state.chargedTokens()).isZero();
        assertThat(state.actualInputTokens()).isNull();
        assertThat(state.actualOutputTokens()).isNull();
    }

    @Test
    void providerFailureRemainsDispatchedFailedAndConservativelyCharged() throws Exception {
        Fixture fixture = fixture();
        UUID userId = fixture.user();
        SyntheticProvider provider = new SyntheticProvider();
        provider.failNext = true;
        ScheduledExecutorService heartbeat = Executors.newScheduledThreadPool(1);
        AiUsageGuard guard = fixture.guard();
        AiInvocationGateway gateway = fixture.gateway(guard, provider, heartbeat);
        AtomicReference<UUID> reservationId = new AtomicReference<>();
        UUID taskId;
        try (AiTaskScope scope = gateway.beginTask(new AiTaskContext(userId, AiFeature.SOURCE_OVERVIEW,
                "provider-failure-" + UUID.randomUUID()))) {
            taskId = scope.taskId();
            assertThatThrownBy(() -> scope.complete(AiStage.OVERVIEW_MAP, AiProviderType.DEEPSEEK,
                    request(), credential(), AiCredentialSource.PLATFORM, 1_000L,
                    AiOutputRole.INTERMEDIATE, null, reservationId::set))
                    .isInstanceOf(IllegalStateException.class);
        } finally {
            heartbeat.shutdownNow();
        }

        assertThat(provider.completeCalls).isEqualTo(1);
        AiInvocationState state = guard.invocationStateForOwner(userId, taskId, reservationId.get(),
                OVERVIEW_KINDS).orElseThrow();
        assertThat(state.state()).isEqualTo("FAILED");
        assertThat(state.requestDispatched()).isTrue();
        assertThat(state.actualInputTokens()).isNull();
        assertThat(state.actualOutputTokens()).isNull();
        assertThat(state.chargedTokens()).isEqualTo(fixture.jdbc.queryForObject(
                "select estimated_input_tokens + reserved_output_tokens from ai_usage_reservations where id=?",
                Long.class, reservationId.get()));
    }

    @Test
    void exactQueryIsOwnerTaskReservationAndKindScopedAndDoesNotExpireRows() throws Exception {
        Fixture fixture = fixture();
        UUID owner = fixture.user();
        UUID otherOwner = fixture.user();
        AiUsageGuard guard = fixture.guard();
        AiUsageGuard.TaskLease task = guard.beginTask(new AiTaskContext(owner, AiFeature.SOURCE_OVERVIEW,
                "query-scope-" + UUID.randomUUID()));
        AiUsageGuard.CallReservation reservation = guard.reserve(task, AiStage.OVERVIEW_MAP,
                AiProviderType.DEEPSEEK, "synthetic-model", AiCredentialSource.PLATFORM,
                AiOutputRole.INTERMEDIATE, 10, 5);
        var before = guard.invocationStateForOwner(owner, task.taskId(), reservation.id(), OVERVIEW_KINDS)
                .orElseThrow();

        assertThat(guard.invocationStateForOwner(otherOwner, task.taskId(), reservation.id(), OVERVIEW_KINDS))
                .isEmpty();
        assertThat(guard.invocationStateForOwner(owner, UUID.randomUUID(), reservation.id(), OVERVIEW_KINDS))
                .isEmpty();
        assertThat(guard.invocationStateForOwner(owner, task.taskId(), UUID.randomUUID(), OVERVIEW_KINDS))
                .isEmpty();
        assertThat(guard.invocationStateForOwner(owner, task.taskId(), reservation.id(),
                Set.of(AiOperationKind.CHAT_TURN))).isEmpty();
        assertThat(guard.invocationStateForOwner(owner, task.taskId(), reservation.id(), Set.of())).isEmpty();

        fixture.clock.advanceSeconds(61);
        var afterLeaseTime = guard.invocationStateForOwner(owner, task.taskId(), reservation.id(), OVERVIEW_KINDS)
                .orElseThrow();
        assertThat(afterLeaseTime).isEqualTo(before);
        assertThat(fixture.jdbc.queryForObject("select state from ai_usage_reservations where id=?", String.class,
                reservation.id())).isEqualTo("RESERVED");

        fixture.jdbc.update("update ai_usage_reservations set credential_source=null where id=?", reservation.id());
        assertThat(guard.invocationStateForOwner(owner, task.taskId(), reservation.id(), OVERVIEW_KINDS)).isEmpty();
        assertThat(fixture.jdbc.queryForObject("select state from ai_usage_reservations where id=?", String.class,
                reservation.id())).isEqualTo("RESERVED");
    }

    private static AiProviderRequest request() {
        return new AiProviderRequest("synthetic-model",
                List.of(new AiProviderRequest.Message(AiMessageRole.USER, "synthetic")), 0.0, 1);
    }

    private static AiCredential credential() {
        return new AiCredential("https://provider.test/v1", "synthetic-test-key");
    }

    private static final class SyntheticProvider implements AiProviderPort {
        int completeCalls;
        boolean failNext;
        Runnable beforeComplete = () -> { };

        @Override public AiProviderType type() { return AiProviderType.DEEPSEEK; }

        @Override
        public AiProviderResponse complete(AiProviderRequest request, AiCredential credential) {
            return complete(request, credential, 0L);
        }

        @Override
        public AiProviderResponse complete(AiProviderRequest request, AiCredential credential, long timeoutMillis) {
            completeCalls++;
            beforeComplete.run();
            if (failNext) {
                failNext = false;
                throw new IllegalStateException("synthetic provider failure");
            }
            return new AiProviderResponse("synthetic", 4L, 4L, "stop");
        }

        @Override
        public AiProviderResponse complete(AiProviderRequest request, AiCredential credential,
                                           long timeoutMillis, OverviewCancellation cancellation) {
            return complete(request, credential, timeoutMillis);
        }

        @Override
        public void streamInto(AiProviderRequest request, AiCredential credential,
                               java.util.function.Consumer<com.auralis.app.ai.AiProviderChunk> sink) {
            throw new UnsupportedOperationException();
        }
    }

    private static final class SyntheticEmbeddingProvider implements EmbeddingProviderPort {
        @Override public AiProviderType type() { return AiProviderType.SILICONFLOW; }
        @Override public EmbeddingResult embed(List<String> texts, AiCredential credential) {
            throw new UnsupportedOperationException();
        }
    }

    private static final class Fixture {
        final DriverManagerDataSource source;
        final JdbcTemplate jdbc;
        final DataSourceTransactionManager transactions;
        final MutableClock clock;
        final AuralisProperties.Limits limits;

        Fixture() throws Exception {
            source = new DriverManagerDataSource("jdbc:h2:mem:binding" + UUID.randomUUID().toString().replace("-", "")
                    + ";MODE=PostgreSQL;DB_CLOSE_DELAY=-1", "sa", "");
            jdbc = new JdbcTemplate(source);
            jdbc.execute("create table users (id UUID primary key, status varchar(16) not null default 'ACTIVE')");
            jdbc.execute("create table ingestion_jobs (id UUID primary key, status varchar(16) not null, "
                    + "attempt_count integer not null default 0, created_at timestamp with time zone not null)");
            try (Connection connection = source.getConnection()) {
                ScriptUtils.executeSqlScript(connection, new ClassPathResource("db/migration/V30__ai_usage_guard.sql"));
                ScriptUtils.executeSqlScript(connection,
                        new ClassPathResource("db/migration/V33__ai_usage_operation_kind_and_source.sql"));
            }
            transactions = new DataSourceTransactionManager(source);
            clock = new MutableClock(Instant.parse("2026-10-19T03:00:00Z"));
            limits = new AuralisProperties.Limits(4, 2, 100_000, 200_000, 2_000_000,
                    60_000, 1_000, 16, 2, 32_000, 24, 524_288, 512, 16_777_216);
        }

        UUID user() {
            UUID id = UUID.randomUUID();
            jdbc.update("insert into users(id) values (?)", id);
            return id;
        }

        AiUsageGuard guard() {
            return new AiUsageGuard(jdbc, transactions, clock, limits);
        }

        AiInvocationGateway gateway(AiUsageGuard guard, SyntheticProvider provider,
                                    ScheduledExecutorService heartbeat) {
            AuralisProperties.Ai ai = new AuralisProperties.Ai(false, "", "DEEPSEEK",
                    new AuralisProperties.Defaults(null, null, null), 3_000, 10_000, 120_000,
                    240_000, 12_000, 8, 5_242_880, 32, 32_768, 3_000, 10_000, 3,
                    1_048_576, List.of(), false, 1_000, 60_000, 3, limits, true, true,
                    "legacy-bytes", List.of(new AuralisProperties.OverviewModelCapacity(
                    AiProviderType.DEEPSEEK.name(), "https://provider.test/v1", "synthetic-model", 100_000, 16_384)),
                    AuralisProperties.OverviewLimits.withoutAdditionalCaps());
            return new AiUsageGatewayService(guard, new AiProviderRegistry(List.of(provider)),
                    new EmbeddingProviderRegistry(List.of(new SyntheticEmbeddingProvider())), ai,
                    heartbeat, transactions);
        }
    }

    private static Fixture fixture() throws Exception {
        return new Fixture();
    }

    private static final class MutableClock extends Clock {
        private final AtomicReference<Instant> now;
        MutableClock(Instant initial) { now = new AtomicReference<>(initial); }
        void advanceSeconds(long seconds) { now.updateAndGet(value -> value.plusSeconds(seconds)); }
        @Override public ZoneId getZone() { return ZoneId.of("UTC"); }
        @Override public Clock withZone(ZoneId zone) { return this; }
        @Override public Instant instant() { return now.get(); }
    }
}
