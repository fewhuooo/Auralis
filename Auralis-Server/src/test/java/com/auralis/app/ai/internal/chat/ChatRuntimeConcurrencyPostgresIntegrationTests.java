package com.auralis.app.ai.internal.chat;

import com.auralis.app.AuralisApplication;
import com.auralis.app.ai.AiMessageCommand;
import com.auralis.app.ai.AiProviderType;
import com.auralis.app.ai.retrieval.ReadingContext;
import com.auralis.app.shared.error.DomainException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.core.env.Environment;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;
import com.github.dockerjava.api.model.ExposedPort;
import com.github.dockerjava.api.model.PortBinding;
import com.github.dockerjava.api.model.Ports;
import tools.jackson.databind.ObjectMapper;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Duration;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** PostgreSQL row-lock evidence for Chat admission; no worker or Provider dispatch is started. */
@SpringBootTest(classes = AuralisApplication.class)
@ActiveProfiles("postgres-it")
@EnabledIfSystemProperty(named = "auralis.postgres.it", matches = "true")
@Testcontainers
class ChatRuntimeConcurrencyPostgresIntegrationTests {
    private static final String POSTGRES_IMAGE = "pgvector/pgvector:0.8.6-pg17-bookworm";
    private static final long WAIT_SECONDS = 10;

    @Container
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>(
            DockerImageName.parse(POSTGRES_IMAGE).asCompatibleSubstituteFor("postgres"))
            .withLabel("codex.task", "auralis-chat-scope-20261105")
            .withCreateContainerCmdModifier(command -> command.getHostConfig().withPortBindings(
                    new PortBinding(Ports.Binding.bindIp("127.0.0.1"), new ExposedPort(5432))));

    static {
        // Keep PostgreSQL data inside the disposable container without creating a Docker volume.
        POSTGRES.withTmpFs(Map.of("/var/lib/postgresql/data", "rw"));
    }

    @DynamicPropertySource
    static void databaseProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
    }

    @Autowired private JdbcTemplate jdbc;
    @Autowired private PlatformTransactionManager transactionManager;
    @Autowired private ChatRuntimePersistenceService persistence;
    @Autowired private ObjectMapper mapper;
    @Autowired private javax.sql.DataSource dataSource;
    @Autowired private Environment environment;

    @BeforeEach
    void databaseIsTheTaskOwnedContainerAndProviderIsDisabled() throws SQLException {
        try (Connection connection = dataSource.getConnection()) {
            assertThat(connection.getMetaData().getURL()).isEqualTo(POSTGRES.getJdbcUrl());
        }
        assertThat(POSTGRES.getMappedPort(5432)).isNotEqualTo(5432);
        assertThat(environment.getProperty("auralis.ai.enabled", Boolean.class)).isFalse();
    }

    @Test
    void concurrentTurnsOnOneConversationAdmitExactlyOneRun() throws Exception {
        Fixture fixture = seedReadyActivity();
        AiMessageCommand first = turn(fixture, "turn-a");
        AiMessageCommand second = turn(fixture, "turn-b");

        RaceResults results = race(fixture, first, second);

        assertOneAdmissionAndActiveRunConflict(results);
        assertPersistedWinner(fixture, results.winner(), false);
    }

    @Test
    void turnAndReadyActivitySubmissionOnOneConversationAdmitExactlyOneRun() throws Exception {
        Fixture fixture = seedReadyActivity();
        AiMessageCommand turn = turn(fixture, "turn-race");
        AiMessageCommand submission = submission(fixture, "submission-race");

        RaceResults results = race(fixture, turn, submission);

        assertOneAdmissionAndActiveRunConflict(results);
        assertPersistedWinner(fixture, results.winner(), true);
    }

    @Test
    void competingFirstTurnsPersistOneReadingScopeAndRejectTheDifferentScope() throws Exception {
        UnboundFixture fixture = seedUnboundConversation();
        ReadingContext subjectScope = new ReadingContext(null, fixture.subjectId(),
                ReadingContext.RetrievalMode.SUBJECT, java.util.List.of(), null);
        ReadingContext otherSubjectScope = new ReadingContext(null, fixture.otherSubjectId(),
                ReadingContext.RetrievalMode.SUBJECT, java.util.List.of(), null);
        AiMessageCommand scopedTurn = new AiMessageCommand(1, "turn", fixture.conversationId(), "scope-turn-a",
                "A subject question", subjectScope, null, null, null, null, null);
        AiMessageCommand otherScopedTurn = new AiMessageCommand(1, "turn", fixture.conversationId(), "scope-turn-b",
                "Another subject question", otherSubjectScope, null, null, null, null, null);

        RaceResults results = race(new Fixture(fixture.userId(), fixture.conversationId(), UUID.randomUUID(), UUID.randomUUID()),
                scopedTurn, otherScopedTurn);

        assertThat(results.successes()).hasSize(1);
        assertThat(results.failures()).containsExactly("CHAT_SCOPE_CONFLICT");
        assertThat(jdbc.queryForObject("select chat_scope_state from conversations where id = ?", String.class,
                fixture.conversationId())).isEqualTo("BOUND");
        assertThat(jdbc.queryForObject("select count(*) from chat_runs where conversation_id = ?", Long.class,
                fixture.conversationId())).isEqualTo(1L);
        assertThat(jdbc.queryForObject("select count(*) from messages where conversation_id = ? and role = 'USER'",
                Long.class, fixture.conversationId())).isEqualTo(1L);
        assertThat(activeRun(fixture.conversationId())).isEqualTo(results.winner().admission().run().getId());
        String boundScope = jdbc.queryForObject("select chat_scope_json from conversations where id = ?",
                String.class, fixture.conversationId());
        assertThat(boundScope).contains("\"retrievalMode\":\"SUBJECT\"", "\"sourceIds\":[]")
                .containsAnyOf("\"subjectId\":\"" + fixture.subjectId() + "\"",
                        "\"subjectId\":\"" + fixture.otherSubjectId() + "\"");
    }

    @Test
    void invalidFirstScopeDoesNotBindOrPersistUserAndRun() {
        UnboundFixture fixture = seedUnboundConversation();
        ReadingContext invalidSubjectScope = new ReadingContext(UUID.randomUUID(), fixture.subjectId(),
                ReadingContext.RetrievalMode.SUBJECT, java.util.List.of(), null);
        AiMessageCommand command = new AiMessageCommand(1, "turn", fixture.conversationId(), "invalid-scope-turn",
                "An invalid scoped question", invalidSubjectScope, null, null, null, null, null);

        assertThatThrownBy(() -> persistence.admit(fixture.userId(), command, profile()))
                .isInstanceOfSatisfying(DomainException.class,
                        exception -> assertThat(exception.code()).isEqualTo("VALIDATION_FAILED"));
        assertThat(jdbc.queryForObject("select chat_scope_state from conversations where id = ?", String.class,
                fixture.conversationId())).isEqualTo("UNBOUND");
        assertThat(jdbc.queryForObject("select count(*) from chat_runs where conversation_id = ?", Long.class,
                fixture.conversationId())).isZero();
        assertThat(jdbc.queryForObject("select count(*) from messages where conversation_id = ? and role = 'USER'",
                Long.class, fixture.conversationId())).isZero();
    }

    @Test
    void explicitUnknownRecoveryIsFencedIdempotentAndKeepsPartialContentAndUsage() throws Exception {
        UnknownFixture fixture = seedUnknownAttempt(false);
        String reservationBefore = usageRows(fixture.budgetTaskId());

        assertThatThrownBy(() -> persistence.recoverUnknown(UUID.randomUUID(), fixture.conversationId(),
                fixture.runId(), fixture.attemptId()))
                .isInstanceOfSatisfying(DomainException.class,
                        exception -> assertThat(exception.code()).isEqualTo("RESOURCE_NOT_FOUND"));
        assertThat(activeRun(fixture.conversationId())).isEqualTo(fixture.runId());

        persistence.recoverUnknown(fixture.userId(), fixture.conversationId(), fixture.runId(), fixture.attemptId());

        assertThat(jdbc.queryForObject("select status from chat_runs where id = ?", String.class, fixture.runId()))
                .isEqualTo("FAILED");
        assertThat(jdbc.queryForObject("select status from chat_attempts where id = ?", String.class,
                fixture.attemptId())).isEqualTo("FAILED");
        assertThat(jdbc.queryForObject("select safe_error_code from chat_attempts where id = ?", String.class,
                fixture.attemptId())).isEqualTo("CHAT_UNKNOWN_ABANDONED");
        assertThat(jdbc.queryForObject("select content from messages where id = ?", String.class, fixture.replyId()))
                .contains("verified partial");
        var savedParts = mapper.readTree(jdbc.queryForObject("select public_parts_json from chat_attempts where id = ?",
                String.class, fixture.attemptId()));
        assertThat(savedParts.get(0).get("text").stringValue()).isEqualTo("verified partial");
        assertThat(savedParts.get(1).get("state").stringValue()).isEqualTo("INVALID");
        assertThat(savedParts.get(1).get("items").size()).isEqualTo(1);
        assertThat(jdbc.queryForObject("select private_tool_evidence_json from chat_attempts where id = ?",
                String.class, fixture.attemptId())).isEqualTo(fixture.privateEvidenceJson());
        assertThat(activeRun(fixture.conversationId())).isNull();
        assertThat(jdbc.queryForObject("select chat_fence from conversations where id = ?", Long.class,
                fixture.conversationId())).isEqualTo(fixture.fence() + 2);
        assertThat(usageRows(fixture.budgetTaskId())).isEqualTo(reservationBefore);

        persistence.recoverUnknown(fixture.userId(), fixture.conversationId(), fixture.runId(), fixture.attemptId());
        assertThat(jdbc.queryForObject("select chat_fence from conversations where id = ?", Long.class,
                fixture.conversationId())).isEqualTo(fixture.fence() + 2);
        assertThat(usageRows(fixture.budgetTaskId())).isEqualTo(reservationBefore);

        assertThatThrownBy(() -> persistence.finish(fixture.userId(), fixture.conversationId(), fixture.runId(),
                fixture.attemptId(), fixture.fence(), Map.of(), "COMPLETED", "[]", "[]", 8,
                "late worker reply", "test-model", null))
                .isInstanceOf(DomainException.class)
                .hasMessageContaining("no longer owns");

        ChatRuntimePersistenceService.Admission retry = persistence.retry(fixture.userId(), fixture.conversationId(),
                fixture.runId(), "retry-after-unknown");
        assertThat(retry.run().getBudgetTaskId()).isEqualTo(fixture.budgetTaskId());
        assertThat(usageRows(fixture.budgetTaskId())).isEqualTo(reservationBefore);
        UUID retryAttemptId = retry.attempt().getId();

        persistence.recoverUnknown(fixture.userId(), fixture.conversationId(), fixture.runId(), fixture.attemptId());
        assertThat(jdbc.queryForObject("select current_attempt_id from chat_runs where id = ?", UUID.class,
                fixture.runId())).isEqualTo(retryAttemptId);
        assertThat(jdbc.queryForObject("select status from chat_attempts where id = ?", String.class,
                retryAttemptId)).isEqualTo("PENDING");
        assertThat(activeRun(fixture.conversationId())).isEqualTo(fixture.runId());
        assertThat(usageRows(fixture.budgetTaskId())).isEqualTo(reservationBefore);

        assertThat(persistence.claim(fixture.userId(), fixture.conversationId(), fixture.runId(), retryAttemptId,
                retry.attempt().getFenceVersion())).isEqualTo(ChatRuntimePersistenceService.ClaimResult.CLAIMED);
        persistence.finish(fixture.userId(), fixture.conversationId(), fixture.runId(), retryAttemptId,
                retry.attempt().getFenceVersion(), Map.of(), "COMPLETED", "[]", "[]", 1,
                "retry settled", "test-model", null);
        ChatRuntimePersistenceService.Admission otherRun = persistence.admit(fixture.userId(),
                turn(new Fixture(fixture.userId(), fixture.conversationId(), fixture.activityId(), UUID.randomUUID()),
                        "new-run-after-recovery"), profile());
        persistence.recoverUnknown(fixture.userId(), fixture.conversationId(), fixture.runId(), fixture.attemptId());
        assertThat(activeRun(fixture.conversationId())).isEqualTo(otherRun.run().getId());
        assertThat(otherRun.run().getId()).isNotEqualTo(fixture.runId());
        assertThat(usageRows(fixture.budgetTaskId())).isEqualTo(reservationBefore);
    }

    @Test
    void explicitUnknownRecoveryCompletesCommittedReadyActivityWithoutChangingPrivateReference() throws Exception {
        UnknownFixture fixture = seedUnknownAttempt(true);
        String privateReference = jdbc.queryForObject("select private_reference_json from chat_activities where id = ?",
                String.class, fixture.activityId());

        persistence.recoverUnknown(fixture.userId(), fixture.conversationId(), fixture.runId(), fixture.attemptId());

        assertThat(jdbc.queryForObject("select status from chat_runs where id = ?", String.class, fixture.runId()))
                .isEqualTo("COMPLETED");
        assertThat(jdbc.queryForObject("select status from chat_attempts where id = ?", String.class,
                fixture.attemptId())).isEqualTo("COMPLETED");
        assertThat(jdbc.queryForObject("select status from messages where id = ?", String.class, fixture.replyId()))
                .isEqualTo("COMPLETED");
        assertThat(jdbc.queryForObject("select state from chat_activities where id = ?", String.class,
                fixture.activityId())).isEqualTo("READY");
        assertThat(jdbc.queryForObject("select private_reference_json from chat_activities where id = ?",
                String.class, fixture.activityId())).isEqualTo(privateReference);
        assertThat(activeRun(fixture.conversationId())).isNull();
    }

    private RaceResults race(Fixture fixture, AiMessageCommand first, AiMessageCommand second) throws Exception {
        CyclicBarrier start = new CyclicBarrier(2);
        ExecutorService executor = Executors.newFixedThreadPool(2);
        Future<AdmissionResult> firstFuture = null;
        Future<AdmissionResult> secondFuture = null;
        try {
            try (Connection gate = dataSource.getConnection()) {
                gate.setAutoCommit(false);
                boolean committed = false;
                try {
                    int gatePid;
                    try (PreparedStatement statement = gate.prepareStatement("select pg_backend_pid()")) {
                        try (ResultSet result = statement.executeQuery()) {
                            result.next();
                            gatePid = result.getInt(1);
                        }
                    }
                    try (PreparedStatement statement = gate.prepareStatement(
                            "select id from conversations where id = ? for update")) {
                        statement.setObject(1, fixture.conversationId());
                        try (ResultSet result = statement.executeQuery()) {
                            assertThat(result.next()).isTrue();
                        }
                    }

                    firstFuture = executor.submit(() -> admitAfterBarrier(start, fixture, first));
                    secondFuture = executor.submit(() -> admitAfterBarrier(start, fixture, second));
                    awaitPostgresConversationLockWaiters(gatePid);
                    gate.commit();
                    committed = true;
                } finally {
                    if (!committed) gate.rollback();
                }
            }
            return new RaceResults(firstFuture.get(WAIT_SECONDS, TimeUnit.SECONDS),
                    secondFuture.get(WAIT_SECONDS, TimeUnit.SECONDS));
        } finally {
            executor.shutdownNow();
            assertThat(executor.awaitTermination(WAIT_SECONDS, TimeUnit.SECONDS)).isTrue();
        }
    }

    private void awaitPostgresConversationLockWaiters(int gatePid) throws InterruptedException {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(WAIT_SECONDS);
        long waiters = 0;
        while (System.nanoTime() < deadline) {
            waiters = jdbc.queryForObject("with recursive blocked_chain(waiter_pid, blocker_pid, path) as ("
                            + "select a.pid, b.pid, array[a.pid, b.pid] from pg_stat_activity a "
                            + "cross join lateral unnest(pg_blocking_pids(a.pid)) b(pid) "
                            + "where a.datname = current_database() and a.state = 'active' "
                            + "and a.wait_event_type = 'Lock' and a.query ilike '%conversations%' "
                            + "and a.query ~* 'for .*update' union all "
                            + "select chain.waiter_pid, b.pid, chain.path || b.pid from blocked_chain chain "
                            + "cross join lateral unnest(pg_blocking_pids(chain.blocker_pid)) b(pid) "
                            + "where not (b.pid = any(chain.path))) "
                            + "select count(distinct waiter_pid) from blocked_chain where ? = any(path)",
                    Long.class, gatePid);
            if (waiters == 2) return;
            if (waiters > 2) break;
            Thread.sleep(25);
        }
        var waitingQueries = jdbc.queryForList("select pid, state, wait_event_type, query, pg_blocking_pids(pid) "
                + "as direct_blockers from pg_stat_activity a where a.datname = current_database() "
                + "and a.wait_event_type = 'Lock'");
        throw new AssertionError("Expected exactly two Chat admissions blocked on the held conversation row; "
                + "observed " + waiters + " matching waiters: " + waitingQueries);
    }

    private AdmissionResult admitAfterBarrier(CyclicBarrier start, Fixture fixture, AiMessageCommand command)
            throws Exception {
        start.await(WAIT_SECONDS, TimeUnit.SECONDS);
        try {
            return new AdmissionResult(persistence.admit(fixture.userId(), command, profile()), null);
        } catch (DomainException exception) {
            return new AdmissionResult(null, exception.code());
        }
    }

    private void assertOneAdmissionAndActiveRunConflict(RaceResults results) {
        assertThat(results.successes()).hasSize(1);
        assertThat(results.failures()).containsExactly("CHAT_RUN_ACTIVE");
    }

    private void assertPersistedWinner(Fixture fixture, AdmissionResult winner, boolean hasSubmissionRace) {
        assertThat(winner.admission()).isNotNull();
        UUID winnerRunId = winner.admission().run().getId();
        assertThat(jdbc.queryForObject("select count(*) from chat_runs where conversation_id = ?",
                Long.class, fixture.conversationId())).isEqualTo(2L);
        assertThat(jdbc.queryForObject("select count(*) from chat_attempts a join chat_runs r on r.id = a.run_id "
                        + "where r.conversation_id = ?", Long.class, fixture.conversationId())).isEqualTo(2L);
        assertThat(jdbc.queryForObject("select count(*) from messages where conversation_id = ?",
                Long.class, fixture.conversationId())).isEqualTo(3L);
        assertThat(jdbc.queryForObject("select count(*) from messages where conversation_id = ? and role = 'USER'",
                Long.class, fixture.conversationId())).isEqualTo(2L);
        assertThat(jdbc.queryForObject("select active_chat_run_id from conversations where id = ?",
                UUID.class, fixture.conversationId())).isEqualTo(winnerRunId);
        assertThat(jdbc.queryForObject("select count(*) from chat_attempts where run_id = ? and status = 'PENDING'",
                Long.class, winnerRunId)).isEqualTo(1L);

        String winnerAction = jdbc.queryForObject("select action from chat_runs where id = ?", String.class, winnerRunId);
        String activityState = jdbc.queryForObject("select state from chat_activities where id = ?",
                String.class, fixture.activityId());
        if (hasSubmissionRace && "activity_submission".equals(winnerAction)) {
            assertThat(activityState).isEqualTo("SUBMITTED");
            assertThat(jdbc.queryForObject("select reply_run_id from chat_activities where id = ?",
                    UUID.class, fixture.activityId())).isEqualTo(winnerRunId);
            assertThat(jdbc.queryForObject("select submission_user_message_id from chat_activities where id = ?",
                    UUID.class, fixture.activityId())).isEqualTo(winner.admission().userMessageId());
            assertThat(jdbc.queryForObject("select submission_id from chat_activities where id = ?",
                    UUID.class, fixture.activityId())).isEqualTo(fixture.submissionId());
        } else {
            assertThat(activityState).isEqualTo("READY");
            assertThat(jdbc.queryForObject("select submission_id from chat_activities where id = ?",
                    UUID.class, fixture.activityId())).isNull();
            assertThat(jdbc.queryForObject("select reply_run_id from chat_activities where id = ?",
                    UUID.class, fixture.activityId())).isNull();
        }
    }

    private Fixture seedReadyActivity() throws Exception {
        UUID userId = UUID.randomUUID();
        UUID conversationId = UUID.randomUUID();
        UUID sourceRunId = UUID.randomUUID();
        UUID sourceAttemptId = UUID.randomUUID();
        UUID sourceUserMessageId = UUID.randomUUID();
        UUID sourceReplyMessageId = UUID.randomUUID();
        UUID activityId = UUID.randomUUID();
        UUID blockId = UUID.randomUUID();
        UUID sourceBudgetTaskId = UUID.randomUUID();
        String sourceRequestId = "seed-" + UUID.randomUUID();
        String parts = mapper.writeValueAsString(java.util.List.of(Map.of(
                "id", blockId.toString(), "componentId", blockId.toString(), "kind", "block",
                "component", "quiz", "state", "READY",
                "meta", Map.of("question", "Which option is correct?", "questionType", "single"),
                "items", java.util.List.of(Map.of("key", "A", "text", "Alpha"),
                        Map.of("key", "B", "text", "Beta")))));
        String payload = mapper.writeValueAsString(Map.of(
                "question", "Which option is correct?", "questionType", "single",
                "items", java.util.List.of(Map.of("key", "A", "text", "Alpha"),
                        Map.of("key", "B", "text", "Beta"))));

        new TransactionTemplate(transactionManager).executeWithoutResult(status -> {
            jdbc.update("insert into users(id, username, normalized_username, password_hash, status) "
                            + "values (?, ?, ?, ?, 'ACTIVE')",
                    userId, "chat-race-" + userId, "chat-race-" + userId, "{noop}test-password");
            jdbc.update("insert into conversations(id, user_id, title, purpose, chat_protocol_version, "
                            + "chat_scope_state, chat_scope_json, next_message_sequence) "
                            + "values (?, ?, 'Chat race', 'GENERAL', 1, 'BOUND', null, 2)",
                    conversationId, userId);
            jdbc.update("insert into messages(id, conversation_id, user_id, message_sequence, role, status, content, "
                            + "client_request_id, chat_protocol_version) values (?, ?, ?, 1, 'USER', 'COMPLETED', ?, ?, 1)",
                    sourceUserMessageId, conversationId, userId, "Original question", sourceRequestId);
            jdbc.update("insert into messages(id, conversation_id, user_id, message_sequence, role, status, content, "
                            + "reply_to_message_id, chat_protocol_version) values (?, ?, ?, 2, 'ASSISTANT', 'COMPLETED', ?, ?, 1)",
                    sourceReplyMessageId, conversationId, userId, "**Which option is correct?**", sourceUserMessageId);
            jdbc.update("insert into chat_runs(id, user_id, conversation_id, request_id, request_hash, "
                            + "request_context_json, action, user_message_id, current_attempt_id, "
                            + "current_reply_message_id, budget_task_id, status, fence_version) "
                            + "values (?, ?, ?, ?, ?, '{}', 'turn', ?, ?, ?, ?, 'COMPLETED', 0)",
                    sourceRunId, userId, conversationId, sourceRequestId, "seed-hash", sourceUserMessageId,
                    sourceAttemptId, sourceReplyMessageId, sourceBudgetTaskId);
            jdbc.update("insert into chat_attempts(id, run_id, user_id, request_id, request_hash, attempt_no, "
                            + "status, worker_instance_id, fence_version, allocated_reply_message_id, reply_message_id, "
                            + "public_parts_json, tool_trace_json, deadline_at) "
                            + "values (?, ?, ?, ?, ?, 1, 'COMPLETED', 'seed-worker', 0, ?, ?, ?, '[]', ?)",
                    sourceAttemptId, sourceRunId, userId, sourceRequestId, "seed-hash", sourceReplyMessageId,
                    sourceReplyMessageId, parts, Timestamp.from(java.time.Instant.now().plus(Duration.ofMinutes(5))));
            jdbc.update("insert into chat_activities(id, run_id, user_id, attempt_id, message_id, block_id, "
                            + "question_version, question_type, state, public_payload_json) "
                            + "values (?, ?, ?, ?, ?, ?, 1, 'single', 'READY', ?)",
                    activityId, sourceRunId, userId, sourceAttemptId, sourceReplyMessageId, blockId, payload);
        });
        return new Fixture(userId, conversationId, activityId, UUID.randomUUID());
    }

    private UnboundFixture seedUnboundConversation() {
        UUID userId = UUID.randomUUID();
        UUID conversationId = UUID.randomUUID();
        UUID subjectId = UUID.randomUUID();
        UUID otherSubjectId = UUID.randomUUID();
        new TransactionTemplate(transactionManager).executeWithoutResult(status -> {
            jdbc.update("insert into users(id, username, normalized_username, password_hash, status) "
                            + "values (?, ?, ?, ?, 'ACTIVE')",
                    userId, "chat-scope-" + userId, "chat-scope-" + userId, "{noop}test-password");
            jdbc.update("insert into subjects(id, user_id, name, sort_key) values (?, ?, ?, ?), (?, ?, ?, ?)",
                    subjectId, userId, "Subject A", "a", otherSubjectId, userId, "Subject B", "b");
            jdbc.update("insert into conversations(id, user_id, title, purpose, chat_protocol_version, "
                            + "chat_scope_state, chat_scope_json, next_message_sequence) "
                            + "values (?, ?, 'New Chat', 'GENERAL', 1, 'UNBOUND', null, 0)",
                    conversationId, userId);
        });
        return new UnboundFixture(userId, conversationId, subjectId, otherSubjectId);
    }

    private UnknownFixture seedUnknownAttempt(boolean withReadyActivity) throws Exception {
        UUID userId = UUID.randomUUID();
        UUID conversationId = UUID.randomUUID();
        UUID runId = UUID.randomUUID();
        UUID attemptId = UUID.randomUUID();
        UUID userMessageId = UUID.randomUUID();
        UUID replyId = UUID.randomUUID();
        UUID budgetTaskId = UUID.randomUUID();
        UUID activityId = UUID.randomUUID();
        UUID blockId = UUID.randomUUID();
        String requestId = "unknown-" + UUID.randomUUID();
        long fence = 7;
        String privateEvidence = "[{\"kind\":\"read\",\"content\":\"retained\"}]";
        String parts = mapper.writeValueAsString(java.util.List.of(
                Map.of("kind", "text", "text", "verified partial"),
                Map.of("kind", "block", "component", "steps", "state", "GENERATING",
                        "items", java.util.List.of(Map.of("title", "checked row")))));
        String payload = "{\"question\":\"Which option?\",\"questionType\":\"single\","
                + "\"items\":[{\"key\":\"A\",\"text\":\"Alpha\"},{\"key\":\"B\",\"text\":\"Beta\"}]}";

        new TransactionTemplate(transactionManager).executeWithoutResult(status -> {
            jdbc.update("insert into users(id, username, normalized_username, password_hash, status) "
                            + "values (?, ?, ?, ?, 'ACTIVE')",
                    userId, "chat-recovery-" + userId, "chat-recovery-" + userId, "{noop}test-password");
            jdbc.update("insert into conversations(id, user_id, title, purpose, chat_protocol_version, "
                            + "chat_scope_state, chat_scope_json, active_chat_run_id, chat_fence, next_message_sequence) "
                            + "values (?, ?, 'Chat recovery', 'GENERAL', 1, 'BOUND', null, ?, ?, 3)",
                    conversationId, userId, runId, fence);
            jdbc.update("insert into messages(id, conversation_id, user_id, message_sequence, role, status, content, "
                            + "client_request_id, chat_protocol_version) "
                            + "values (?, ?, ?, 1, 'USER', 'COMPLETED', 'Original request', ?, 1)",
                    userMessageId, conversationId, userId, requestId);
            jdbc.update("insert into messages(id, conversation_id, user_id, message_sequence, role, status, content, "
                            + "error_code, reply_to_message_id, chat_protocol_version) "
                            + "values (?, ?, ?, 2, 'ASSISTANT', 'FAILED', 'verified partial', "
                            + "'CHAT_WORKER_OWNERSHIP_UNKNOWN', ?, 1)",
                    replyId, conversationId, userId, userMessageId);
            jdbc.update("insert into chat_runs(id, user_id, conversation_id, request_id, request_hash, "
                            + "request_context_json, action, user_message_id, current_attempt_id, "
                            + "current_reply_message_id, budget_task_id, status, fence_version) "
                            + "values (?, ?, ?, ?, ?, '{}', 'turn', ?, ?, ?, ?, 'UNKNOWN', ?)",
                    runId, userId, conversationId, requestId, "unknown-hash", userMessageId, attemptId, replyId,
                    budgetTaskId, fence);
            jdbc.update("insert into chat_attempts(id, run_id, user_id, request_id, request_hash, attempt_no, "
                            + "status, worker_instance_id, fence_version, allocated_reply_message_id, reply_message_id, "
                            + "public_parts_json, tool_trace_json, private_tool_evidence_json, last_sequence, "
                            + "safe_error_code, deadline_at, ended_at) "
                            + "values (?, ?, ?, ?, ?, 1, 'UNKNOWN', 'worker-a', ?, ?, ?, ?, '[]', ?, 6, "
                            + "'CHAT_WORKER_OWNERSHIP_UNKNOWN', ?, now())",
                    attemptId, runId, userId, requestId, "unknown-hash", fence, replyId, replyId, parts,
                    privateEvidence, Timestamp.from(java.time.Instant.now().minus(Duration.ofMinutes(1))));
            jdbc.update("insert into ai_usage_reservations(id, task_id, user_id, feature, stage, provider, model, "
                            + "state, estimated_input_tokens, reserved_output_tokens, charged_tokens, "
                            + "request_dispatched, owner_id, lease_until) "
                            + "values (?, ?, ?, 'CHAT_AGENT', 'CHAT_AGENT_TURN', 'DEEPSEEK', 'test-model', "
                            + "'RESERVED', 100, 50, 0, true, ?, now() + interval '5 minutes')",
                    UUID.randomUUID(), budgetTaskId, userId, UUID.randomUUID());
            jdbc.update("insert into ai_usage_reservations(id, task_id, user_id, feature, stage, provider, model, "
                            + "state, estimated_input_tokens, reserved_output_tokens, actual_input_tokens, "
                            + "actual_output_tokens, charged_tokens, request_dispatched, owner_id, lease_until, settled_at) "
                            + "values (?, ?, ?, 'CHAT_AGENT', 'CHAT_AGENT_TURN', 'DEEPSEEK', 'test-model', "
                            + "'COMPLETED', 100, 50, 80, 20, 37, true, ?, now(), now())",
                    UUID.randomUUID(), budgetTaskId, userId, UUID.randomUUID());
            if (withReadyActivity) {
                jdbc.update("insert into chat_activities(id, run_id, user_id, attempt_id, message_id, block_id, "
                                + "question_version, question_type, state, public_payload_json, private_reference_json) "
                                + "values (?, ?, ?, ?, ?, ?, 1, 'single', 'READY', ?, ?)",
                        activityId, runId, userId, attemptId, replyId, blockId, payload,
                        "{\"answer\":[\"A\"],\"explanation\":\"private rationale\"}");
            }
        });
        return new UnknownFixture(userId, conversationId, runId, attemptId, replyId, budgetTaskId, activityId,
                fence, privateEvidence);
    }

    private UUID activeRun(UUID conversationId) {
        return jdbc.queryForObject("select active_chat_run_id from conversations where id = ?", UUID.class,
                conversationId);
    }

    private String usageRows(UUID taskId) {
        return jdbc.query("select state || ':' || charged_tokens || ':' || reserved_output_tokens "
                        + "from ai_usage_reservations where task_id = ? order by state, charged_tokens",
                result -> {
                    java.util.List<String> rows = new java.util.ArrayList<>();
                    while (result.next()) rows.add(result.getString(1));
                    return String.join(",", rows);
                }, taskId);
    }

    private AiMessageCommand turn(Fixture fixture, String requestId) {
        return new AiMessageCommand(1, "turn", fixture.conversationId(), requestId, "A concurrent question",
                null, null, null, null, null, null);
    }

    private AiMessageCommand submission(Fixture fixture, String requestId) throws Exception {
        return new AiMessageCommand(1, "activity_submission", fixture.conversationId(), requestId, null,
                null, null, fixture.activityId(), 1, fixture.submissionId(), mapper.readTree("[\"A\"]"));
    }

    private ChatRuntimePersistenceService.ExecutionProfile profile() {
        return new ChatRuntimePersistenceService.ExecutionProfile(AiProviderType.DEEPSEEK, "test-model", "test-hash");
    }

    private record Fixture(UUID userId, UUID conversationId, UUID activityId, UUID submissionId) {}
    private record UnboundFixture(UUID userId, UUID conversationId, UUID subjectId, UUID otherSubjectId) {}
    private record UnknownFixture(UUID userId, UUID conversationId, UUID runId, UUID attemptId, UUID replyId,
            UUID budgetTaskId, UUID activityId, long fence, String privateEvidenceJson) {}
    private record AdmissionResult(ChatRuntimePersistenceService.Admission admission, String errorCode) {}
    private record RaceResults(AdmissionResult first, AdmissionResult second) {
        java.util.List<AdmissionResult> successes() {
            return java.util.stream.Stream.of(first, second).filter(result -> result.admission() != null).toList();
        }
        java.util.List<String> failures() {
            return java.util.stream.Stream.of(first, second).filter(result -> result.errorCode() != null)
                    .map(AdmissionResult::errorCode).toList();
        }
        AdmissionResult winner() { return successes().getFirst(); }
    }
}
