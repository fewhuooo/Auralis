package com.auralis.app.ai;

import com.auralis.app.AuralisApplication;
import com.auralis.app.ai.usage.AiCredentialSource;
import com.auralis.app.ai.usage.AiFeature;
import com.auralis.app.ai.usage.AiInvocationState;
import com.auralis.app.ai.usage.AiOutputRole;
import com.auralis.app.ai.usage.AiStage;
import com.auralis.app.ai.usage.AiTaskContext;
import com.auralis.app.ai.usage.AiTokenUsage;
import com.auralis.app.ai.usage.AiUsageGuard;
import com.auralis.app.ai.usage.AiOperationKind;
import com.auralis.app.ai.usage.AiUsageQueryService;
import com.auralis.app.shared.error.DomainException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.PlatformTransactionManager;

import java.time.Clock;
import java.time.OffsetDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

@EnabledIfSystemProperty(named = "auralis.postgres.it", matches = "true")
@SpringBootTest(classes = AuralisApplication.class)
@ActiveProfiles("postgres-it")
class OverviewExecutionJournalPostgresIntegrationTests {
    private static final String HASH_A = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    private static final String HASH_B = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    private static final String POSTGRES_URL = requirePostgresUrl();
    private static final String APP_SCHEMA = "overview_execution_journal_it_"
            + UUID.randomUUID().toString().replace("-", "");
    private static final DriverManagerDataSource ADMIN_DATA_SOURCE =
            new DriverManagerDataSource(POSTGRES_URL, "postgres", "");

    @DynamicPropertySource
    static void databaseProperties(DynamicPropertyRegistry registry) {
        new JdbcTemplate(ADMIN_DATA_SOURCE).execute("create schema " + APP_SCHEMA);
        registry.add("spring.datasource.url", () -> scopedUrl(APP_SCHEMA, vectorExtensionSchema()));
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
        new JdbcTemplate(ADMIN_DATA_SOURCE).execute("drop schema if exists " + APP_SCHEMA + " cascade");
    }

    @Autowired private JdbcTemplate jdbc;
    @Autowired private OverviewGenerationCoordinator coordinator;
    @Autowired private OverviewExecutionJournal journal;
    @Autowired private OverviewJobInvocationJournal invocationJournal;
    @Autowired private AiUsageGuard usageGuard;
    @Autowired private PlatformTransactionManager transactionManager;
    @Autowired private Clock clock;

    @Test
    void postgresPersistsPlanAndAtomicallyVerifiesCheckpointUnderTheCurrentFence() {
        UUID userId = createUser("journal-verify");
        UUID subjectId = UUID.randomUUID();
        OverviewGenerationCoordinator.Acquisition owner = coordinator.acquire(request(userId, subjectId, UUID.randomUUID(), HASH_A));
        assertThat(owner.state()).isEqualTo(OverviewGenerationCoordinator.AcquisitionState.OWNER);
        var nodeSpec = spec("writer-node-0");
        String planJson = "{\"nodes\":[0]}";
        var opened = journal.openPlan(owner.lease(), sha256(planJson), "OUTLINE", planJson, List.of(nodeSpec));
        assertThat(opened.recoveryRequired()).isFalse();
        var attempt = journal.beginAttempt(owner.lease(), opened.nodes().getFirst());
        assertThat(attempt.number()).isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from overview_generation_checkpoints where generation_id=?",
                Integer.class, owner.generationId())).isZero();

        String payload = "{\"schemaVersion\":1,\"title\":\"verified\"}";
        journal.verifyAndSaveCheckpoint(owner.lease(), attempt, nodeSpec.checkpointStep(), payload);

        assertThat(jdbc.queryForObject("select state from overview_execution_nodes where id=?", String.class,
                attempt.nodeId())).isEqualTo("VERIFIED");
        assertThat(jdbc.queryForObject("select payload_json from overview_generation_checkpoints where generation_id=? "
                        + "and step_key=?", String.class, owner.generationId(), nodeSpec.checkpointStep())).isEqualTo(payload);
        assertThat(journal.beginAttempt(owner.lease(), opened.nodes().getFirst()).alreadyVerified()).isTrue();
        journal.markAssembled(owner.lease(), opened.planId());
        var reopened = journal.openPlan(owner.lease(), sha256(planJson), "OUTLINE", planJson, List.of(nodeSpec));
        assertThat(reopened.planId()).isEqualTo(opened.planId());
        assertThat(journal.beginAttempt(owner.lease(), reopened.nodes().getFirst()).alreadyVerified()).isTrue();
        journal.markAssembled(owner.lease(), reopened.planId());

        jdbc.update("update overview_generations set lease_until=? where id=?",
                OffsetDateTime.now().minusSeconds(1), owner.generationId());
        OverviewGenerationCoordinator.Acquisition takeover = coordinator.acquire(request(userId, subjectId, UUID.randomUUID(), HASH_A));
        assertThat(takeover.state()).isEqualTo(OverviewGenerationCoordinator.AcquisitionState.OWNER);
        assertThat(takeover.budgetTaskId()).isEqualTo(owner.budgetTaskId());
        assertThatThrownBy(() -> journal.verifyAndSaveCheckpoint(owner.lease(), attempt, nodeSpec.checkpointStep(),
                "{\"schemaVersion\":1,\"title\":\"stale\"}"))
                .isInstanceOf(DomainException.class);
        assertThat(jdbc.queryForObject("select payload_json from overview_generation_checkpoints where generation_id=? "
                        + "and step_key=?", String.class, owner.generationId(), nodeSpec.checkpointStep())).isEqualTo(payload);
        coordinator.fail(takeover.lease(), "MODEL_TIMEOUT", (com.auralis.app.ai.usage.OverviewTaskUsageSummary) null,
                0, List.of());
    }

    @Test
    void unresolvedExactReservationBlocksAChangedProfilePlan() {
        UUID userId = createUser("journal-unknown");
        UUID subjectId = UUID.randomUUID();
        OverviewGenerationCoordinator.Acquisition owner = coordinator.acquire(request(userId, subjectId, UUID.randomUUID(), HASH_A));
        AiUsageQueryService unknownUsage = mock(AiUsageQueryService.class);
        when(unknownUsage.invocationStateForOwner(org.mockito.ArgumentMatchers.any(),
                org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any(),
                org.mockito.ArgumentMatchers.anySet())).thenReturn(Optional.empty());
        OverviewExecutionJournal isolatedJournal = new OverviewExecutionJournal(jdbc, transactionManager, clock, unknownUsage);
        var firstNode = spec("first-profile-node");
        String planJson = "{\"profile\":\"first\"}";
        var firstPlan = isolatedJournal.openPlan(owner.lease(), sha256(planJson), "OUTLINE", planJson,
                List.of(firstNode));
        var attempt = isolatedJournal.beginAttempt(owner.lease(), firstPlan.nodes().getFirst());
        UUID reservationId = UUID.randomUUID();
        UUID ledgerTaskId = AiTaskContext.overviewLedgerTaskId(userId, AiFeature.SUBJECT_OVERVIEW, owner.budgetTaskId());
        jdbc.update("insert into overview_execution_calls(id,generation_id,plan_id,node_id,attempt,reservation_id,task_id,"
                        + "user_id,operation_kind) values (?,?,?,?,?,?,?,?,?)",
                UUID.randomUUID(), owner.generationId(), firstPlan.planId(), attempt.nodeId(), attempt.number(),
                reservationId, ledgerTaskId, userId, AiOperationKind.SUBJECT_OVERVIEW.name());
        assertThatThrownBy(() -> isolatedJournal.bindReservation(owner.lease(), ledgerTaskId,
                AiOperationKind.SUBJECT_OVERVIEW, attempt, UUID.randomUUID())).isInstanceOf(DomainException.class);
        assertThat(jdbc.queryForObject("select count(*) from overview_execution_calls where plan_id=?", Integer.class,
                firstPlan.planId())).isEqualTo(1);
        coordinator.fail(owner.lease(), "MODEL_TIMEOUT", (com.auralis.app.ai.usage.OverviewTaskUsageSummary) null,
                0, List.of());
        OverviewGenerationCoordinator.Acquisition changedProfile = coordinator.acquire(request(userId, subjectId,
                UUID.randomUUID(), HASH_B));
        assertThat(changedProfile.generationId()).isEqualTo(owner.generationId());
        assertThat(changedProfile.budgetTaskId()).isEqualTo(owner.budgetTaskId());

        assertThat(isolatedJournal.priorProfilesAreSafe(changedProfile.lease())).isFalse();

        assertThat(jdbc.queryForObject("select state from overview_execution_plans where id=?", String.class,
                firstPlan.planId())).isEqualTo("RECOVERY_REQUIRED");
        assertThat(jdbc.queryForObject("select state from overview_execution_nodes where id=?", String.class,
                attempt.nodeId())).isEqualTo("RECOVERY_REQUIRED");
        coordinator.fail(changedProfile.lease(), "OVERVIEW_RECOVERY_EXHAUSTED",
                (com.auralis.app.ai.usage.OverviewTaskUsageSummary) null, 0, List.of());
    }

    @Test
    void exactCompletedReservationAllowsANewNodeAttemptWithoutChangingTheParentBudget() {
        UUID userId = createUser("journal-known-terminal");
        UUID subjectId = UUID.randomUUID();
        OverviewGenerationCoordinator.Acquisition owner = coordinator.acquire(
                request(userId, subjectId, UUID.randomUUID(), HASH_A));
        AiUsageQueryService exactUsage = mock(AiUsageQueryService.class);
        AtomicReference<AiInvocationState> state = new AtomicReference<>();
        when(exactUsage.invocationStateForOwner(org.mockito.ArgumentMatchers.any(),
                org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any(),
                org.mockito.ArgumentMatchers.anySet())).thenAnswer(invocation -> Optional.ofNullable(state.get()));
        OverviewExecutionJournal isolatedJournal = new OverviewExecutionJournal(jdbc, transactionManager, clock, exactUsage);
        var nodeSpec = spec("known-terminal-node");
        String planJson = "{\"profile\":\"first\"}";
        var plan = isolatedJournal.openPlan(owner.lease(), sha256(planJson), "OUTLINE", planJson,
                List.of(nodeSpec));
        var firstAttempt = isolatedJournal.beginAttempt(owner.lease(), plan.nodes().getFirst());
        UUID reservationId = UUID.randomUUID();
        UUID ledgerTaskId = AiTaskContext.overviewLedgerTaskId(userId, AiFeature.SUBJECT_OVERVIEW, owner.budgetTaskId());
        state.set(new AiInvocationState(reservationId, ledgerTaskId, AiOperationKind.SUBJECT_OVERVIEW,
                "RESERVED", false, null, null, 0));

        isolatedJournal.bindReservation(owner.lease(), ledgerTaskId, AiOperationKind.SUBJECT_OVERVIEW,
                firstAttempt, reservationId);
        assertThat(jdbc.queryForObject("select count(*) from overview_execution_calls where reservation_id=? and "
                + "node_id=? and attempt=? and task_id=?", Integer.class, reservationId, firstAttempt.nodeId(),
                firstAttempt.number(), ledgerTaskId)).isEqualTo(1);

        state.set(new AiInvocationState(reservationId, ledgerTaskId, AiOperationKind.SUBJECT_OVERVIEW,
                "COMPLETED", true, 12L, 9L, 21));
        isolatedJournal.failNode(owner.lease(), firstAttempt, "MODEL_PROVIDER_ERROR");
        var retry = isolatedJournal.beginAttempt(owner.lease(), plan.nodes().getFirst());

        assertThat(retry.number()).isEqualTo(2);
        assertThat(retry.recoveryRequired()).isFalse();
        assertThat(ledgerTaskId).isEqualTo(jdbc.queryForObject(
                "select task_id from overview_execution_calls where reservation_id=?", UUID.class, reservationId));
    }

    @Test
    void conservativelyChargedTerminalWriterFailureResumesOnlyThatNodeAndKeepsVerifiedCheckpoints() {
        UUID userId = createUser("journal-terminal-writer-replay");
        UUID subjectId = UUID.randomUUID();
        UUID requestId = UUID.randomUUID();
        OverviewGenerationCoordinator.Acquisition owner = coordinator.acquire(
                request(userId, subjectId, requestId, HASH_A));
        UUID budgetTaskId = owner.budgetTaskId();
        AiTaskContext context = new AiTaskContext(userId, AiFeature.SUBJECT_OVERVIEW,
                owner.generationId().toString(), budgetTaskId);
        AiUsageGuard.TaskLease task = usageGuard.beginTask(context);
        UUID ledgerTaskId = AiTaskContext.overviewLedgerTaskId(userId, AiFeature.SUBJECT_OVERVIEW, budgetTaskId);

        List<OverviewExecutionJournal.NodeSpec> specs = java.util.stream.IntStream.range(0, 15)
                .mapToObj(index -> spec("replay-writer-" + index)).toList();
        String planJson = "{\"nodes\":15}";
        var plan = journal.openPlan(owner.lease(), sha256(planJson), "OUTLINE", planJson, specs);
        assertThat(plan.nodes()).hasSize(15);
        for (int index = 0; index < 13; index++) {
            var checkpointAttempt = journal.beginAttempt(owner.lease(), plan.nodes().get(index));
            journal.verifyAndSaveCheckpoint(owner.lease(), checkpointAttempt, specs.get(index).checkpointStep(),
                    "{\"verified\":" + index + "}");
        }

        var failedAttempt = journal.beginAttempt(owner.lease(), plan.nodes().get(13));
        AiUsageGuard.CallReservation unknown = usageGuard.reserve(task, AiStage.OVERVIEW_MAP,
                AiProviderType.DEEPSEEK, "deepseek-chat", AiCredentialSource.PLATFORM,
                AiOutputRole.INTERMEDIATE, 80, 120);
        var binding = invocationJournal.binding(null, owner.lease(), "ADAPTIVE_WRITE", "INTERMEDIATE");
        binding.onReserved(unknown.id());
        journal.bindReservation(owner.lease(), task.taskId(), AiOperationKind.SUBJECT_OVERVIEW,
                failedAttempt, unknown.id());
        usageGuard.markDispatched(task, unknown, () -> binding.beforeDispatch(unknown.id()));
        usageGuard.settle(task, unknown, null, false, "MODEL_UNAVAILABLE");
        journal.failNode(owner.lease(), failedAttempt, "MODEL_UNAVAILABLE");

        long originalCharge = jdbc.queryForObject("select charged_tokens from ai_usage_reservations where id=?",
                Long.class, unknown.id());
        assertThat(originalCharge).isEqualTo(200);
        assertThat(usageGuard.isConservativelyChargedTerminalFailure(userId, ledgerTaskId, unknown.id(),
                AiOperationKind.SUBJECT_OVERVIEW)).isTrue();
        assertThat(invocationJournal.allSafe(owner.lease())).isTrue();
        assertThat(jdbc.queryForObject("select count(*) from overview_generation_checkpoints where generation_id=?",
                Integer.class, owner.generationId())).isEqualTo(13);

        var retry = journal.beginAttempt(owner.lease(), plan.nodes().get(13));
        assertThat(retry.number()).isEqualTo(2);
        assertThat(retry.recoveryRequired()).isFalse();
        AiUsageGuard.CallReservation replacement = usageGuard.reserve(task, AiStage.OVERVIEW_MAP,
                AiProviderType.DEEPSEEK, "deepseek-chat", AiCredentialSource.PLATFORM,
                AiOutputRole.INTERMEDIATE, 80, 120);
        var replacementBinding = invocationJournal.binding(null, owner.lease(), "ADAPTIVE_WRITE", "INTERMEDIATE");
        replacementBinding.onReserved(replacement.id());
        journal.bindReservation(owner.lease(), task.taskId(), AiOperationKind.SUBJECT_OVERVIEW,
                retry, replacement.id());
        usageGuard.markDispatched(task, replacement, () -> replacementBinding.beforeDispatch(replacement.id()));
        assertThat(usageGuard.settleSuccessful(task, replacement, new AiTokenUsage(12L, 18L)).accepted()).isTrue();
        journal.verifyAndSaveCheckpoint(owner.lease(), retry, specs.get(13).checkpointStep(), "{\"verified\":13}");

        assertThat(jdbc.queryForObject("select charged_tokens from ai_usage_reservations where id=?",
                Long.class, unknown.id())).isEqualTo(originalCharge);
        assertThat(jdbc.queryForObject("select count(*) from overview_generation_checkpoints where generation_id=?",
                Integer.class, owner.generationId())).isEqualTo(14);
        assertThat(invocationJournal.allSafe(owner.lease())).isTrue();
        assertThat(journal.beginAttempt(owner.lease(), plan.nodes().get(14)).number()).isEqualTo(1);
        assertThat(budgetTaskId).isEqualTo(jdbc.queryForObject("select budget_task_id from overview_generations where id=?",
                UUID.class, owner.generationId()));
        assertThat(jdbc.queryForObject("select count(*) from ai_usage_reservations where task_id=?",
                Integer.class, ledgerTaskId)).isEqualTo(2);
        usageGuard.closeTask(task);
        coordinator.fail(owner.lease(), "MODEL_TIMEOUT", (com.auralis.app.ai.usage.OverviewTaskUsageSummary) null,
                0, List.of());
    }

    @Test
    void secondUnknownWriterAttemptRemainsHeldAfterTheOnePermittedReplay() {
        UUID userId = createUser("journal-second-unknown");
        UUID subjectId = UUID.randomUUID();
        OverviewGenerationCoordinator.Acquisition owner = coordinator.acquire(
                request(userId, subjectId, UUID.randomUUID(), HASH_A));
        AiTaskContext context = new AiTaskContext(userId, AiFeature.SUBJECT_OVERVIEW,
                owner.generationId().toString(), owner.budgetTaskId());
        AiUsageGuard.TaskLease task = usageGuard.beginTask(context);
        UUID ledgerTaskId = AiTaskContext.overviewLedgerTaskId(userId, AiFeature.SUBJECT_OVERVIEW,
                owner.budgetTaskId());
        String planJson = "{\"nodes\":[\"one-shot\"]}";
        var plan = journal.openPlan(owner.lease(), sha256(planJson), "OUTLINE", planJson,
                List.of(spec("one-shot-node")));

        var first = journal.beginAttempt(owner.lease(), plan.nodes().getFirst());
        AiUsageGuard.CallReservation firstUnknown = usageGuard.reserve(task, AiStage.OVERVIEW_MAP,
                AiProviderType.DEEPSEEK, "deepseek-chat", AiCredentialSource.PLATFORM,
                AiOutputRole.INTERMEDIATE, 80, 120);
        var firstBinding = invocationJournal.binding(null, owner.lease(), "ADAPTIVE_WRITE", "INTERMEDIATE");
        firstBinding.onReserved(firstUnknown.id());
        journal.bindReservation(owner.lease(), task.taskId(), AiOperationKind.SUBJECT_OVERVIEW, first,
                firstUnknown.id());
        usageGuard.markDispatched(task, firstUnknown, () -> firstBinding.beforeDispatch(firstUnknown.id()));
        usageGuard.settle(task, firstUnknown, null, false, "MODEL_UNAVAILABLE");
        journal.failNode(owner.lease(), first, "MODEL_UNAVAILABLE");

        var replay = journal.beginAttempt(owner.lease(), plan.nodes().getFirst());
        assertThat(replay.number()).isEqualTo(2);
        AiUsageGuard.CallReservation secondUnknown = usageGuard.reserve(task, AiStage.OVERVIEW_MAP,
                AiProviderType.DEEPSEEK, "deepseek-chat", AiCredentialSource.PLATFORM,
                AiOutputRole.INTERMEDIATE, 80, 120);
        var secondBinding = invocationJournal.binding(null, owner.lease(), "ADAPTIVE_WRITE", "INTERMEDIATE");
        secondBinding.onReserved(secondUnknown.id());
        journal.bindReservation(owner.lease(), task.taskId(), AiOperationKind.SUBJECT_OVERVIEW, replay,
                secondUnknown.id());
        usageGuard.markDispatched(task, secondUnknown, () -> secondBinding.beforeDispatch(secondUnknown.id()));
        usageGuard.settle(task, secondUnknown, null, false, "MODEL_UNAVAILABLE");
        journal.failNode(owner.lease(), replay, "MODEL_UNAVAILABLE");

        assertThat(usageGuard.isConservativelyChargedTerminalFailure(userId, ledgerTaskId, firstUnknown.id(),
                AiOperationKind.SUBJECT_OVERVIEW)).isTrue();
        assertThat(usageGuard.isConservativelyChargedTerminalFailure(userId, ledgerTaskId, secondUnknown.id(),
                AiOperationKind.SUBJECT_OVERVIEW)).isTrue();
        assertThat(invocationJournal.allSafe(owner.lease())).isFalse();
        var held = journal.beginAttempt(owner.lease(), plan.nodes().getFirst());
        assertThat(held.number()).isEqualTo(2);
        assertThat(held.recoveryRequired()).isTrue();
        assertThat(jdbc.queryForObject("select count(*) from overview_execution_calls where node_id=?",
                Integer.class, first.nodeId())).isEqualTo(2);
        usageGuard.closeTask(task);
        coordinator.fail(owner.lease(), "OVERVIEW_RECOVERY_EXHAUSTED",
                (com.auralis.app.ai.usage.OverviewTaskUsageSummary) null, 0, List.of());
    }

    @Test
    void terminalUnknownWithoutExactWriterAssociationOrFullConservativeChargeRemainsHeld() {
        UUID userId = createUser("journal-unbound-unknown");
        UUID subjectId = UUID.randomUUID();
        OverviewGenerationCoordinator.Acquisition owner = coordinator.acquire(
                request(userId, subjectId, UUID.randomUUID(), HASH_A));
        AiTaskContext context = new AiTaskContext(userId, AiFeature.SUBJECT_OVERVIEW,
                owner.generationId().toString(), owner.budgetTaskId());
        AiUsageGuard.TaskLease task = usageGuard.beginTask(context);
        UUID ledgerTaskId = AiTaskContext.overviewLedgerTaskId(userId, AiFeature.SUBJECT_OVERVIEW,
                owner.budgetTaskId());
        AiUsageGuard.CallReservation unknown = usageGuard.reserve(task, AiStage.OVERVIEW_MAP,
                AiProviderType.DEEPSEEK, "deepseek-chat", AiCredentialSource.PLATFORM,
                AiOutputRole.INTERMEDIATE, 80, 120);
        var binding = invocationJournal.binding(null, owner.lease(), "ADAPTIVE_INDEX", "INTERMEDIATE");
        binding.onReserved(unknown.id());
        usageGuard.markDispatched(task, unknown, () -> binding.beforeDispatch(unknown.id()));
        usageGuard.settle(task, unknown, null, false, "MODEL_UNAVAILABLE");

        assertThat(usageGuard.isConservativelyChargedTerminalFailure(userId, ledgerTaskId, unknown.id(),
                AiOperationKind.SUBJECT_OVERVIEW)).isTrue();
        assertThat(usageGuard.isConservativelyChargedTerminalFailure(UUID.randomUUID(), ledgerTaskId, unknown.id(),
                AiOperationKind.SUBJECT_OVERVIEW)).isFalse();
        assertThat(usageGuard.isConservativelyChargedTerminalFailure(userId, UUID.randomUUID(), unknown.id(),
                AiOperationKind.SUBJECT_OVERVIEW)).isFalse();
        assertThat(usageGuard.isConservativelyChargedTerminalFailure(userId, ledgerTaskId, unknown.id(),
                AiOperationKind.SOURCE_OVERVIEW)).isFalse();
        assertThat(invocationJournal.allSafe(owner.lease())).isFalse();
        jdbc.update("update ai_usage_reservations set charged_tokens=199 where id=?", unknown.id());
        assertThat(usageGuard.isConservativelyChargedTerminalFailure(userId, ledgerTaskId, unknown.id(),
                AiOperationKind.SUBJECT_OVERVIEW)).isFalse();
        assertThat(invocationJournal.allSafe(owner.lease())).isFalse();
        jdbc.update("update ai_usage_reservations set charged_tokens=200,state='EXPIRED' where id=?", unknown.id());
        assertThat(usageGuard.isConservativelyChargedTerminalFailure(userId, ledgerTaskId, unknown.id(),
                AiOperationKind.SUBJECT_OVERVIEW)).isFalse();
        usageGuard.closeTask(task);
        coordinator.fail(owner.lease(), "OVERVIEW_RECOVERY_EXHAUSTED",
                (com.auralis.app.ai.usage.OverviewTaskUsageSummary) null, 0, List.of());
    }

    @Test
    void undispatchedReservedCallAllowsRetryButDispatchedReservedCallRemainsHeld() {
        UUID userId = createUser("journal-reserved-dispatch");
        UUID subjectId = UUID.randomUUID();
        OverviewGenerationCoordinator.Acquisition owner = coordinator.acquire(
                request(userId, subjectId, UUID.randomUUID(), HASH_A));
        AiUsageQueryService exactUsage = mock(AiUsageQueryService.class);
        Map<UUID, AiInvocationState> states = new HashMap<>();
        when(exactUsage.invocationStateForOwner(org.mockito.ArgumentMatchers.any(),
                org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any(),
                org.mockito.ArgumentMatchers.anySet())).thenAnswer(invocation ->
                Optional.ofNullable(states.get(invocation.getArgument(2))));
        OverviewExecutionJournal isolatedJournal = new OverviewExecutionJournal(jdbc, transactionManager, clock, exactUsage);
        String planJson = "{\"profile\":\"reserved-dispatch\"}";
        var plan = isolatedJournal.openPlan(owner.lease(), sha256(planJson), "OUTLINE", planJson,
                List.of(spec("reserved-dispatch-node")));
        UUID budgetTaskId = owner.budgetTaskId();
        UUID ledgerTaskId = AiTaskContext.overviewLedgerTaskId(userId, AiFeature.SUBJECT_OVERVIEW, budgetTaskId);

        var firstAttempt = isolatedJournal.beginAttempt(owner.lease(), plan.nodes().getFirst());
        UUID undispatchedReservation = UUID.randomUUID();
        states.put(undispatchedReservation, new AiInvocationState(undispatchedReservation, ledgerTaskId,
                AiOperationKind.SUBJECT_OVERVIEW, "RESERVED", false, null, null, 0));
        isolatedJournal.bindReservation(owner.lease(), ledgerTaskId, AiOperationKind.SUBJECT_OVERVIEW,
                firstAttempt, undispatchedReservation);
        isolatedJournal.failNode(owner.lease(), firstAttempt, "MODEL_PROVIDER_ERROR");

        var safeRetry = isolatedJournal.beginAttempt(owner.lease(), plan.nodes().getFirst());
        assertThat(safeRetry.number()).isEqualTo(2);
        assertThat(safeRetry.recoveryRequired()).isFalse();
        assertThat(budgetTaskId).isEqualTo(owner.budgetTaskId());

        UUID dispatchedReservation = UUID.randomUUID();
        states.put(dispatchedReservation, new AiInvocationState(dispatchedReservation, ledgerTaskId,
                AiOperationKind.SUBJECT_OVERVIEW, "RESERVED", false, null, null, 0));
        isolatedJournal.bindReservation(owner.lease(), ledgerTaskId, AiOperationKind.SUBJECT_OVERVIEW,
                safeRetry, dispatchedReservation);
        states.put(dispatchedReservation, new AiInvocationState(dispatchedReservation, ledgerTaskId,
                AiOperationKind.SUBJECT_OVERVIEW, "RESERVED", true, null, null, 0));
        isolatedJournal.failNode(owner.lease(), safeRetry, "MODEL_PROVIDER_ERROR");

        var held = isolatedJournal.beginAttempt(owner.lease(), plan.nodes().getFirst());
        assertThat(held.number()).isEqualTo(2);
        assertThat(held.recoveryRequired()).isTrue();
        assertThat(jdbc.queryForObject("select state from overview_execution_nodes where id=?", String.class,
                safeRetry.nodeId())).isEqualTo("RECOVERY_REQUIRED");
        assertThat(jdbc.queryForObject("select count(*) from overview_execution_calls where plan_id=? and task_id=?",
                Integer.class, plan.planId(), ledgerTaskId)).isEqualTo(2);
        assertThat(budgetTaskId).isEqualTo(owner.budgetTaskId());
        coordinator.fail(owner.lease(), "OVERVIEW_RECOVERY_EXHAUSTED",
                (com.auralis.app.ai.usage.OverviewTaskUsageSummary) null, 0, List.of());
    }

    @Test
    void realUsageReservationBindsBothOverviewJournalsToTheLedgerTaskAndRetainsTheBudgetAcrossRetry() {
        UUID userId = createUser("journal-ledger-identity");
        UUID subjectId = UUID.randomUUID();
        OverviewGenerationCoordinator.Acquisition owner = coordinator.acquire(
                request(userId, subjectId, UUID.randomUUID(), HASH_A));
        UUID budgetTaskId = owner.budgetTaskId();
        AiTaskContext context = new AiTaskContext(userId, AiFeature.SUBJECT_OVERVIEW,
                owner.generationId().toString(), budgetTaskId);
        AiUsageGuard.TaskLease task = usageGuard.beginTask(context);
        UUID ledgerTaskId = AiTaskContext.overviewLedgerTaskId(userId, AiFeature.SUBJECT_OVERVIEW, budgetTaskId);
        assertThat(task.taskId()).isEqualTo(ledgerTaskId).isNotEqualTo(budgetTaskId);

        var plan = journal.openPlan(owner.lease(), sha256("{\"nodes\":[\"ledger\"]}"), "OUTLINE",
                "{\"nodes\":[\"ledger\"]}", List.of(spec("ledger-identity-node")));
        var attempt = journal.beginAttempt(owner.lease(), plan.nodes().getFirst());
        AiUsageGuard.CallReservation reservation = usageGuard.reserve(task, AiStage.OVERVIEW_MAP,
                AiProviderType.DEEPSEEK, "deepseek-chat", AiCredentialSource.PLATFORM,
                AiOutputRole.INTERMEDIATE, 80, 120);
        var binding = invocationJournal.binding(null, owner.lease(), "ADAPTIVE_INDEX", "INTERMEDIATE");
        binding.onReserved(reservation.id());
        journal.bindReservation(owner.lease(), task.taskId(), AiOperationKind.SUBJECT_OVERVIEW,
                attempt, reservation.id());

        assertThat(jdbc.queryForObject("select task_id from overview_generation_invocations where reservation_id=?",
                UUID.class, reservation.id())).isEqualTo(ledgerTaskId);
        assertThat(jdbc.queryForObject("select task_id from overview_execution_calls where reservation_id=?",
                UUID.class, reservation.id())).isEqualTo(ledgerTaskId);
        assertThat(jdbc.queryForObject("select budget_task_id from overview_generations where id=?",
                UUID.class, owner.generationId())).isEqualTo(budgetTaskId);

        usageGuard.markDispatched(task, reservation, () -> binding.beforeDispatch(reservation.id()));
        assertThat(usageGuard.settleSuccessful(task, reservation, new AiTokenUsage(8L, 12L)).accepted()).isTrue();
        assertThat(invocationJournal.allSafe(owner.lease())).isTrue();
        usageGuard.closeTask(task);

        AiUsageGuard.TaskLease retry = usageGuard.beginTask(context);
        assertThat(retry.taskId()).isEqualTo(ledgerTaskId).isNotEqualTo(budgetTaskId);
        assertThat(usageGuard.overviewTaskUsage(context).chargedTokens()).isGreaterThan(0);
        assertThat(jdbc.queryForObject("select state from ai_usage_reservations where id=?", String.class,
                reservation.id())).isEqualTo("COMPLETED");
        usageGuard.closeTask(retry);
        coordinator.fail(owner.lease(), "MODEL_TIMEOUT", (com.auralis.app.ai.usage.OverviewTaskUsageSummary) null,
                0, List.of());
    }

    private UUID createUser(String label) {
        UUID userId = UUID.randomUUID();
        String username = "m3-journal-" + label + "-" + userId.toString().substring(0, 8);
        jdbc.update("insert into users(id,username,normalized_username,password_hash,status) values (?,?,?,'test-hash','ACTIVE')",
                userId, username, username.toLowerCase(java.util.Locale.ROOT));
        return userId;
    }

    private OverviewGenerationCoordinator.Request request(UUID userId, UUID subjectId, UUID requestId, String profileFingerprint) {
        return new OverviewGenerationCoordinator.Request(userId, requestId, "SUBJECT", subjectId, null,
                HASH_A, HASH_B, profileFingerprint, "overview-adaptive-v4-execution-journal");
    }

    private OverviewExecutionJournal.NodeSpec spec(String value) {
        String json = "{\"key\":\"" + value + "\"}";
        return new OverviewExecutionJournal.NodeSpec(json, sha256(json), "step_" + value);
    }

    private String sha256(String value) {
        try {
            return java.util.HexFormat.of().formatHex(java.security.MessageDigest.getInstance("SHA-256")
                    .digest(value.getBytes(java.nio.charset.StandardCharsets.UTF_8)));
        } catch (java.security.NoSuchAlgorithmException exception) {
            throw new IllegalStateException(exception);
        }
    }

    private static String requirePostgresUrl() {
        String url = System.getProperty("auralis.usage.postgres.url");
        if (url == null || !url.startsWith("jdbc:postgresql://127.0.0.1:")) {
            throw new IllegalStateException("A task-owned loopback PostgreSQL URL is required");
        }
        return url;
    }

    private static String vectorExtensionSchema() {
        List<String> schemas = new JdbcTemplate(ADMIN_DATA_SOURCE).query(
                "select pg_catalog.quote_ident(namespace.nspname) "
                        + "from pg_catalog.pg_extension extension "
                        + "join pg_catalog.pg_namespace namespace on namespace.oid=extension.extnamespace "
                        + "where extension.extname='vector'",
                (resultSet, rowNumber) -> resultSet.getString(1));
        return schemas.isEmpty() ? null : schemas.getFirst();
    }

    private static String scopedUrl(String schema, String... additionalSchemas) {
        Set<String> searchPath = new LinkedHashSet<>();
        searchPath.add(schema);
        for (String additionalSchema : additionalSchemas) {
            if (additionalSchema != null && !additionalSchema.isBlank()) searchPath.add(additionalSchema);
        }
        return POSTGRES_URL + (POSTGRES_URL.contains("?") ? "&" : "?")
                + "currentSchema=" + String.join(",", searchPath);
    }
}
