package com.auralis.app.ai;

import com.auralis.app.AuralisApplication;
import com.auralis.app.ai.usage.AiCredentialSource;
import com.auralis.app.ai.usage.AiFeature;
import com.auralis.app.ai.usage.AiOutputRole;
import com.auralis.app.ai.usage.AiStage;
import com.auralis.app.ai.usage.AiTaskContext;
import com.auralis.app.ai.usage.AiTokenUsage;
import com.auralis.app.ai.usage.AiUsageGuard;
import com.auralis.app.ai.usage.AiOperationKind;
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

import java.util.List;
import java.util.LinkedHashSet;
import java.util.Set;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

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
    @Autowired private OverviewGenerationInvocationJournal invocationJournal;
    @Autowired private AiUsageGuard usageGuard;

    @Test
    void exactChargedWriterFailureAllowsPreflightAndRequiresAnIntactVerifiedCheckpoint() {
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

        UUID nodeId = insertHistoricalWriterNode(owner.lease());
        AiUsageGuard.CallReservation unknown = usageGuard.reserve(task, AiStage.OVERVIEW_MAP,
                AiProviderType.DEEPSEEK, "deepseek-chat", AiCredentialSource.PLATFORM,
                AiOutputRole.INTERMEDIATE, 80, 120);
        var binding = invocationJournal.binding(owner.lease(), "ADAPTIVE_WRITE", "INTERMEDIATE");
        binding.onReserved(unknown.id());
        bindHistoricalCall(owner.lease(), nodeId, task.taskId(), 1, unknown.id());
        usageGuard.markDispatched(task, unknown, () -> binding.beforeDispatch(unknown.id()));
        usageGuard.settle(task, unknown, null, false, "MODEL_UNAVAILABLE");

        long originalCharge = jdbc.queryForObject("select charged_tokens from ai_usage_reservations where id=?",
                Long.class, unknown.id());
        assertThat(originalCharge).isEqualTo(200);
        assertThat(usageGuard.isConservativelyChargedTerminalFailure(userId, ledgerTaskId, unknown.id(),
                AiOperationKind.SUBJECT_OVERVIEW)).isTrue();
        assertThat(invocationJournal.allSafe(owner.lease())).isTrue();
        AiUsageGuard.CallReservation replacement = usageGuard.reserve(task, AiStage.OVERVIEW_MAP,
                AiProviderType.DEEPSEEK, "deepseek-chat", AiCredentialSource.PLATFORM,
                AiOutputRole.INTERMEDIATE, 80, 120);
        var replacementBinding = invocationJournal.binding(owner.lease(), "ADAPTIVE_WRITE", "INTERMEDIATE");
        replacementBinding.onReserved(replacement.id());
        bindHistoricalCall(owner.lease(), nodeId, task.taskId(), 2, replacement.id());
        usageGuard.markDispatched(task, replacement, () -> replacementBinding.beforeDispatch(replacement.id()));
        assertThat(usageGuard.settleSuccessful(task, replacement, new AiTokenUsage(12L, 18L)).accepted()).isTrue();
        OverviewHistoricalFixtures.insertCheckpoint(jdbc, owner.lease(), "writer-step", "{\"verified\":true}");
        jdbc.update("update overview_execution_nodes set state='VERIFIED',attempt=2,checkpoint_sha256="
                        + "(select payload_sha256 from overview_generation_checkpoints where generation_id=?) where id=?",
                owner.generationId(), nodeId);

        assertThat(jdbc.queryForObject("select charged_tokens from ai_usage_reservations where id=?",
                Long.class, unknown.id())).isEqualTo(originalCharge);
        assertThat(invocationJournal.allSafe(owner.lease())).isTrue();
        jdbc.update("update overview_generation_checkpoints set payload_json='{}' where generation_id=?", owner.generationId());
        assertThat(invocationJournal.allSafe(owner.lease())).isFalse();
        assertThat(budgetTaskId).isEqualTo(jdbc.queryForObject("select budget_task_id from overview_generations where id=?",
                UUID.class, owner.generationId()));
        assertThat(jdbc.queryForObject("select count(*) from ai_usage_reservations where task_id=?",
                Integer.class, ledgerTaskId)).isEqualTo(2);
        usageGuard.closeTask(task);
        coordinator.fail(owner.lease(), "MODEL_TIMEOUT", (com.auralis.app.ai.usage.OverviewTaskUsageSummary) null,
                0, List.of());
    }

    @Test
    void preflightHoldsWhenTwoHistoricalWriterAttemptsWereUnknown() {
        UUID userId = createUser("journal-second-unknown");
        UUID subjectId = UUID.randomUUID();
        OverviewGenerationCoordinator.Acquisition owner = coordinator.acquire(
                request(userId, subjectId, UUID.randomUUID(), HASH_A));
        AiTaskContext context = new AiTaskContext(userId, AiFeature.SUBJECT_OVERVIEW,
                owner.generationId().toString(), owner.budgetTaskId());
        AiUsageGuard.TaskLease task = usageGuard.beginTask(context);
        UUID ledgerTaskId = AiTaskContext.overviewLedgerTaskId(userId, AiFeature.SUBJECT_OVERVIEW,
                owner.budgetTaskId());
        UUID nodeId = insertHistoricalWriterNode(owner.lease());
        AiUsageGuard.CallReservation firstUnknown = usageGuard.reserve(task, AiStage.OVERVIEW_MAP,
                AiProviderType.DEEPSEEK, "deepseek-chat", AiCredentialSource.PLATFORM,
                AiOutputRole.INTERMEDIATE, 80, 120);
        var firstBinding = invocationJournal.binding(owner.lease(), "ADAPTIVE_WRITE", "INTERMEDIATE");
        firstBinding.onReserved(firstUnknown.id());
        bindHistoricalCall(owner.lease(), nodeId, task.taskId(), 1, firstUnknown.id());
        usageGuard.markDispatched(task, firstUnknown, () -> firstBinding.beforeDispatch(firstUnknown.id()));
        usageGuard.settle(task, firstUnknown, null, false, "MODEL_UNAVAILABLE");
        assertThat(invocationJournal.allSafe(owner.lease())).isTrue();

        AiUsageGuard.CallReservation secondUnknown = usageGuard.reserve(task, AiStage.OVERVIEW_MAP,
                AiProviderType.DEEPSEEK, "deepseek-chat", AiCredentialSource.PLATFORM,
                AiOutputRole.INTERMEDIATE, 80, 120);
        var secondBinding = invocationJournal.binding(owner.lease(), "ADAPTIVE_WRITE", "INTERMEDIATE");
        secondBinding.onReserved(secondUnknown.id());
        bindHistoricalCall(owner.lease(), nodeId, task.taskId(), 2, secondUnknown.id());
        usageGuard.markDispatched(task, secondUnknown, () -> secondBinding.beforeDispatch(secondUnknown.id()));
        usageGuard.settle(task, secondUnknown, null, false, "MODEL_UNAVAILABLE");
        jdbc.update("update overview_execution_nodes set attempt=2 where id=?", nodeId);

        assertThat(usageGuard.isConservativelyChargedTerminalFailure(userId, ledgerTaskId, firstUnknown.id(),
                AiOperationKind.SUBJECT_OVERVIEW)).isTrue();
        assertThat(usageGuard.isConservativelyChargedTerminalFailure(userId, ledgerTaskId, secondUnknown.id(),
                AiOperationKind.SUBJECT_OVERVIEW)).isTrue();
        assertThat(invocationJournal.allSafe(owner.lease())).isFalse();
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
        var binding = invocationJournal.binding(owner.lease(), "ADAPTIVE_INDEX", "INTERMEDIATE");
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
    void generationInvocationBindsToTheLedgerTaskAndRetainsTheBudgetAcrossRetry() {
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

        AiUsageGuard.CallReservation reservation = usageGuard.reserve(task, AiStage.OVERVIEW_MAP,
                AiProviderType.DEEPSEEK, "deepseek-chat", AiCredentialSource.PLATFORM,
                AiOutputRole.INTERMEDIATE, 80, 120);
        var binding = invocationJournal.binding(owner.lease(), "ADAPTIVE_INDEX", "INTERMEDIATE");
        binding.onReserved(reservation.id());
        assertThat(jdbc.queryForObject("select task_id from overview_generation_invocations where reservation_id=?",
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

    private UUID insertHistoricalWriterNode(OverviewGenerationCoordinator.GenerationLease lease) {
        UUID planId = UUID.randomUUID();
        UUID nodeId = UUID.randomUUID();
        jdbc.update("insert into overview_execution_plans (id,generation_id,input_fingerprint,profile_fingerprint,"
                        + "algorithm_version,plan_fingerprint,mode,state,payload_json) values (?,?,?,?,?,?,'OUTLINE','WRITING','{}')",
                planId, lease.generationId(), lease.inputFingerprint(), lease.profileFingerprint(),
                lease.algorithmVersion(), HASH_A);
        jdbc.update("insert into overview_execution_nodes (id,plan_id,generation_id,node_ordinal,descriptor_json,"
                        + "descriptor_sha256,checkpoint_step,state,attempt) values (?,?,?,0,'{}',?,'writer-step','FAILED',1)",
                nodeId, planId, lease.generationId(), HASH_A);
        return nodeId;
    }

    private void bindHistoricalCall(OverviewGenerationCoordinator.GenerationLease lease, UUID nodeId,
                                    UUID taskId, int attempt, UUID reservationId) {
        jdbc.update("insert into overview_execution_calls (id,generation_id,plan_id,node_id,attempt,reservation_id,"
                        + "task_id,user_id,operation_kind) select ?,generation_id,plan_id,id,?,?,?,?,'SUBJECT_OVERVIEW'"
                        + " from overview_execution_nodes where id=?",
                UUID.randomUUID(), attempt, reservationId, taskId, lease.userId(), nodeId);
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
