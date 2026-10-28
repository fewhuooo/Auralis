package com.auralis.app;

import com.auralis.app.ai.OverviewGenerationCoordinator;
import com.auralis.app.identity.AccountDeletionCleanupService;
import com.auralis.app.identity.AuthDtos;
import com.auralis.app.identity.IdentityService;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.Statement;
import java.time.Clock;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/** Verifies M5 payload and journal deletion through the actual disabled-account finalization path. */
@EnabledIfSystemProperty(named = "auralis.postgres.it", matches = "true")
@SpringBootTest(classes = {AuralisApplication.class, OverviewAccountDeletionM5PostgresIntegrationTests.ClockConfiguration.class})
@ActiveProfiles("postgres-it")
class OverviewAccountDeletionM5PostgresIntegrationTests {

    private static final String TEST_SCHEMA = "overview_acct_del_m5_it_"
            + UUID.randomUUID().toString().replace("-", "");
    private static final String PASSWORD = "m5-account-delete-test-password";
    private static final String HASH_A = "a".repeat(64);
    private static final String HASH_B = "b".repeat(64);
    private static final String HASH_C = "c".repeat(64);

    @TestConfiguration(proxyBeanMethods = false)
    static class ClockConfiguration {
        @Bean
        @Primary
        Clock testClock() {
            return Clock.fixed(java.time.Instant.parse("2026-10-23T04:00:00Z"), ZoneOffset.UTC);
        }
    }

    @Autowired private JdbcTemplate jdbc;
    @Autowired private IdentityService identityService;
    @Autowired private PasswordEncoder passwordEncoder;
    @Autowired private OverviewGenerationCoordinator coordinator;
    @Autowired private AccountDeletionCleanupService accountDeletionCleanup;

    @DynamicPropertySource
    static void databaseProperties(DynamicPropertyRegistry registry) throws Exception {
        String url = taskOwnedPostgresUrl();
        try (Connection connection = DriverManager.getConnection(url, "postgres", "");
             Statement statement = connection.createStatement()) {
            statement.execute("CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public");
            String vectorSchema;
            try (ResultSet result = statement.executeQuery(
                    "SELECT n.nspname FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace "
                            + "WHERE e.extname = 'vector'")) {
                if (!result.next()) throw new IllegalStateException("PostgreSQL vector extension was not installed");
                vectorSchema = result.getString(1);
            }
            if (!"public".equals(vectorSchema)) statement.execute("ALTER EXTENSION vector SET SCHEMA public");
            statement.execute("create schema " + TEST_SCHEMA);
        }
        registry.add("spring.datasource.url", () -> url + "?currentSchema=" + TEST_SCHEMA + ",public");
        registry.add("spring.datasource.username", () -> "postgres");
        registry.add("spring.datasource.password", () -> "");
        registry.add("spring.datasource.hikari.connection-init-sql", () -> "SET TIME ZONE 'UTC'");
        registry.add("spring.flyway.default-schema", () -> TEST_SCHEMA);
        registry.add("spring.flyway.schemas", () -> TEST_SCHEMA);
        registry.add("auralis.ai.ingestion-worker-enabled", () -> "false");
        registry.add("auralis.identity.account-deletion-delay-millis", () -> "3600000");
        registry.add("auralis.identity.account-deletion-initial-delay-millis", () -> "3600000");
        registry.add("auralis.ai.overview-jobs-poll-ms", () -> "3600000");
        registry.add("auralis.ai.overview-publication-poll-ms", () -> "3600000");
    }

    private static String taskOwnedPostgresUrl() {
        String url = System.getProperty("auralis.usage.postgres.url");
        if (url == null || !url.matches("jdbc:postgresql://127\\.0\\.0\\.1:\\d+/[A-Za-z0-9_]+")) {
            throw new IllegalStateException("A task-owned loopback PostgreSQL URL is required");
        }
        return url;
    }

    @AfterAll
    static void dropApplicationSchema() {
        try {
            new JdbcTemplate(new DriverManagerDataSource(taskOwnedPostgresUrl(), "postgres", ""))
                    .execute("drop schema if exists " + TEST_SCHEMA + " cascade");
        } catch (Exception exception) {
            throw new IllegalStateException("Unable to drop the isolated Overview account-deletion schema", exception);
        }
    }

    @Test
    void accountFinalizationRemovesAllOverviewCopiesAndCascadedLineageWithoutCrossOwnerDeletion() {
        UUID deletingUserId = insertUser("m5-delete");
        UUID retainedUserId = insertUser("m5-retain");

        OverviewRows deleting = insertOverviewRows(deletingUserId, "delete");
        OverviewRows retained = insertOverviewRows(retainedUserId, "retain");
        UUID deletingReservationId = insertReservation(deletingUserId, "delete");
        UUID retainedReservationId = insertReservation(retainedUserId, "retain");

        AuthDtos.AccountDeletionResponse response = identityService.requestAccountDeletion(deletingUserId, PASSWORD);
        assertThat(response.status()).isEqualTo("PENDING");
        assertThat(jdbc.queryForObject("select status from users where id=?", String.class, deletingUserId))
                .isEqualTo("DISABLED");
        jdbc.update("update account_deletion_jobs set not_before=? where id=?",
                OffsetDateTime.ofInstant(response.requestedAt().minusSeconds(1), ZoneOffset.UTC), response.id());

        assertThat(accountDeletionCleanup.processPending()).isEqualTo(1);

        assertThat(jdbc.queryForObject("select count(*) from users where id=?", Integer.class, deletingUserId)).isZero();
        assertThat(jdbc.queryForObject("select status from account_deletion_jobs where id=?", String.class, response.id()))
                .isEqualTo("COMPLETED");
        assertThat(jdbc.queryForObject("select count(*) from overview_cache_capacity_guard where id=1", Integer.class))
                .isEqualTo(1);
        assertThat(countById("overview_results", deleting.resultId())).isZero();
        assertThat(countById("overview_write_receipts", deleting.receiptId())).isZero();
        assertThat(countById("overview_generations", deleting.generationId())).isZero();
        assertThat(countById("overview_generation_requests", deleting.requestId())).isZero();
        assertThat(countById("overview_generation_checkpoints", deleting.checkpointId())).isZero();
        assertThat(countById("overview_generation_jobs", deleting.jobId())).isZero();
        assertThat(countById("overview_execution_plans", deleting.planId())).isZero();
        assertThat(countById("overview_execution_nodes", deleting.nodeId())).isZero();
        assertThat(countById("overview_execution_calls", deleting.callId())).isZero();
        assertThat(countById("overview_generation_invocations", deleting.invocationId())).isZero();
        assertThat(countById("overview_publication_intents", deleting.publicationIntentId())).isZero();
        assertThat(countById("sources", deleting.sourceId())).isZero();
        assertThat(countById("subjects", deleting.subjectId())).isZero();

        assertThat(jdbc.queryForObject("select user_id from ai_usage_reservations where id=?", UUID.class,
                deletingReservationId)).isNull();
        assertThat(jdbc.queryForObject("select charged_tokens from ai_usage_reservations where id=?", Long.class,
                deletingReservationId)).isEqualTo(7L);

        assertThat(countById("overview_generations", retained.generationId())).isEqualTo(1);
        assertThat(countById("overview_generation_checkpoints", retained.checkpointId())).isEqualTo(1);
        assertThat(countById("overview_generation_jobs", retained.jobId())).isEqualTo(1);
        assertThat(countById("overview_execution_plans", retained.planId())).isEqualTo(1);
        assertThat(countById("overview_execution_nodes", retained.nodeId())).isEqualTo(1);
        assertThat(countById("overview_execution_calls", retained.callId())).isEqualTo(1);
        assertThat(countById("overview_generation_invocations", retained.invocationId())).isEqualTo(1);
        assertThat(countById("overview_publication_intents", retained.publicationIntentId())).isEqualTo(1);
        assertThat(countById("overview_results", retained.resultId())).isEqualTo(1);
        assertThat(countById("sources", retained.sourceId())).isEqualTo(1);
        assertThat(countById("subjects", retained.subjectId())).isEqualTo(1);
        assertThat(jdbc.queryForObject("select user_id from ai_usage_reservations where id=?", UUID.class,
                retainedReservationId)).isEqualTo(retainedUserId);
    }

    private UUID insertUser(String prefix) {
        UUID userId = UUID.randomUUID();
        jdbc.update("insert into users (id, username, normalized_username, password_hash, status) "
                        + "values (?, ?, ?, ?, 'ACTIVE')",
                userId, prefix + "-" + userId, prefix + "-" + userId, passwordEncoder.encode(PASSWORD));
        return userId;
    }

    private OverviewRows insertOverviewRows(UUID userId, String marker) {
        UUID scopeId = UUID.randomUUID();
        UUID subjectId = UUID.randomUUID();
        UUID requestId = UUID.randomUUID();
        UUID sourceRevision = UUID.randomUUID();
        jdbc.update("insert into subjects (id,user_id,name,sort_key) values (?,?,?, '')",
                subjectId, userId, "Synthetic " + marker);
        jdbc.update("insert into sources (id,user_id,type,subject_id,title,raw_text,ingestion_status,ingestion_revision) "
                        + "values (?,?,'TEXT',?,?,'synthetic source content','READY',?)",
                scopeId, userId, subjectId, "Synthetic source " + marker, sourceRevision);
        OverviewGenerationCoordinator.Request request = new OverviewGenerationCoordinator.Request(
                userId, requestId, "SOURCE", scopeId, sourceRevision, HASH_A, HASH_B, HASH_C, "overview-m5-it");
        OverviewGenerationCoordinator.Acquisition generation = coordinator.acquire(request);
        String checkpointJson = "{\"schemaVersion\":1,\"body\":\"synthetic-" + marker + "\"}";
        coordinator.saveCheckpoint(generation.lease(), "writer_" + marker, HASH_A, HASH_C,
                "overview-m5-it", 1, checkpointJson);
        UUID checkpointId = jdbc.queryForObject(
                "select id from overview_generation_checkpoints where generation_id=? and step_key=?",
                UUID.class, generation.generationId(), "writer_" + marker);

        UUID resultId = UUID.randomUUID();
        jdbc.update("insert into overview_results (id,user_id,scope_type,scope_id,subject_id,source_id,ingestion_revision,"
                        + "version,outline_version,summary_version,title,schema_version,outline,summary,"
                        + "outline_input_origin,summary_input_origin,outline_input_snapshot_json,summary_input_snapshot_json) "
                        + "values (?,?,'SOURCE',?,?,?,?,1,1,1,'Synthetic',1,'synthetic outline',"
                        + "'synthetic summary','SOURCE_CONTENT','SOURCE_CONTENT',?,?)",
                resultId, userId, scopeId, UUID.randomUUID(), scopeId, sourceRevision,
                "{\"syntheticRawInput\":\"" + marker + "-outline\"}",
                "{\"syntheticRawInput\":\"" + marker + "-summary\"}");

        UUID receiptId = UUID.randomUUID();
        jdbc.update("insert into overview_write_receipts (id,user_id,client_write_id,scope_type,scope_id,base_version,"
                        + "payload_hash,response_snapshot) values (?,?,?,'SOURCE',?,0,?,?)",
                receiptId, userId, UUID.randomUUID(), scopeId, HASH_A, "{\"syntheticResponse\":true}");

        UUID planId = UUID.randomUUID();
        String planJson = "{\"schemaVersion\":1,\"syntheticPlan\":\"" + marker + "\"}";
        String planHash = sha256(planJson);
        jdbc.update("insert into overview_execution_plans (id,generation_id,input_fingerprint,profile_fingerprint,"
                        + "algorithm_version,plan_fingerprint,mode,state,payload_json) "
                        + "values (?,?,?,?,?,?,'ALL','ASSEMBLED',?)",
                planId, generation.generationId(), HASH_A, HASH_C, "overview-m5-it", planHash, planJson);

        UUID nodeId = UUID.randomUUID();
        String descriptorJson = "{\"syntheticDescriptor\":\"" + marker + "\"}";
        UUID reservationId = UUID.randomUUID();
        UUID taskId = UUID.randomUUID();
        jdbc.update("insert into overview_execution_nodes (id,plan_id,generation_id,node_ordinal,descriptor_json,"
                        + "descriptor_sha256,checkpoint_step,state,attempt,checkpoint_sha256,verified_at) "
                        + "values (?,?,?,0,?,?,?,'VERIFIED',1,?,CURRENT_TIMESTAMP)",
                nodeId, planId, generation.generationId(), descriptorJson, sha256(descriptorJson),
                "writer_" + marker, sha256(checkpointJson));
        UUID callId = UUID.randomUUID();
        jdbc.update("insert into overview_execution_calls (id,generation_id,plan_id,node_id,attempt,reservation_id,"
                        + "task_id,user_id,operation_kind) values (?,?,?,?,1,?,?,?,'SOURCE_OVERVIEW')",
                callId, generation.generationId(), planId, nodeId, reservationId, taskId, userId);

        UUID jobId = UUID.randomUUID();
        jdbc.update("insert into overview_generation_jobs (id,user_id,client_request_id,generation_request_id,scope_type,"
                        + "scope_id,mode,request_hash,request_json,source_manifest_json,input_fingerprint,profile_fingerprint,"
                        + "algorithm_version,generation_id,status,stage,verified_nodes,total_nodes,candidate_json) "
                        + "values (?,?,?,?,? ,?,'ALL',?,'{}','[]',?,?,?,?,'COMPLETED','COMPLETE',1,1,?)",
                jobId, userId, UUID.randomUUID(), UUID.randomUUID(), "SOURCE", scopeId, HASH_A, HASH_A, HASH_C,
                "overview-m5-it", generation.generationId(), "{\"syntheticCandidate\":\"" + marker + "\"}");

        UUID invocationId = UUID.randomUUID();
        jdbc.update("insert into overview_generation_invocations (id,job_id,generation_id,task_id,reservation_id,user_id,"
                        + "purpose,stage,owner_id,generation_fence,job_fence) values (?,?,?,?,?,?,?,'INTERMEDIATE',?,1,1)",
                invocationId, jobId, generation.generationId(), taskId, reservationId, userId,
                "ADAPTIVE_WRITER", UUID.randomUUID());

        UUID publicationIntentId = UUID.randomUUID();
        jdbc.update("insert into overview_publication_intents (id,user_id,job_id,generation_id,plan_id,client_publish_id,"
                        + "result_client_write_id,expected_job_version,request_hash,candidate_sha256,input_fingerprint,"
                        + "profile_fingerprint,algorithm_version,base_version,status) "
                        + "values (?,?,?,?,?,?,?,?,?,?,?,?,?,0,'PENDING')",
                publicationIntentId, userId, jobId, generation.generationId(), planId, UUID.randomUUID(), UUID.randomUUID(),
                1, HASH_A, HASH_B, HASH_A, HASH_C, "overview-m5-it");
        return new OverviewRows(scopeId, subjectId, generation.generationId(), requestId, checkpointId, resultId, receiptId,
                jobId, planId, nodeId, callId, invocationId, publicationIntentId);
    }

    private UUID insertReservation(UUID userId, String marker) {
        UUID id = UUID.randomUUID();
        jdbc.update("insert into ai_usage_reservations (id,task_id,user_id,feature,stage,provider,model,state,"
                        + "estimated_input_tokens,reserved_output_tokens,actual_input_tokens,actual_output_tokens,"
                        + "charged_tokens,request_dispatched,owner_id,lease_until,created_at,settled_at) "
                        + "values (?,?,?,'OVERVIEW','WRITER','DEEPSEEK','deepseek-chat','COMPLETED',2,5,2,5,7,true,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)",
                id, UUID.randomUUID(), userId, UUID.randomUUID(), OffsetDateTime.now(ZoneOffset.UTC));
        return id;
    }

    private int countById(String table, UUID id) {
        return jdbc.queryForObject("select count(*) from " + table + " where id=?", Integer.class, id);
    }

    private String sha256(String value) {
        try {
            byte[] digest = java.security.MessageDigest.getInstance("SHA-256")
                    .digest(value.getBytes(java.nio.charset.StandardCharsets.UTF_8));
            return java.util.HexFormat.of().formatHex(digest);
        } catch (java.security.NoSuchAlgorithmException impossible) {
            throw new IllegalStateException(impossible);
        }
    }

    private record OverviewRows(UUID sourceId, UUID subjectId, UUID generationId, UUID requestId,
                                UUID checkpointId, UUID resultId, UUID receiptId,
                                UUID jobId, UUID planId, UUID nodeId, UUID callId, UUID invocationId,
                                UUID publicationIntentId) { }
}
