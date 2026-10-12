package com.auralis.app;

import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.jdbc.datasource.init.ScriptUtils;

import java.sql.Connection;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class AiUsageSchemaTests {

    @Test
    void createsPersistentLocksReservationsAndDeferredIngestionColumns() throws Exception {
        JdbcTemplate jdbc = createSchema();

        assertThat(jdbc.queryForObject("select count(*) from ai_usage_locks where scope_key = 'GLOBAL'", Integer.class))
                .isEqualTo(1);
        assertThat(jdbc.queryForList("select column_name from information_schema.columns "
                + "where table_name = 'INGESTION_JOBS'", String.class))
                .contains("NEXT_ATTEMPT_AT", "FAILURE_COUNT");
        assertThat(jdbc.queryForObject("select count(*) from ai_usage_reservations", Integer.class)).isZero();
    }

    @Test
    void backfillsFailureBudgetWithoutResettingExistingRetries() throws Exception {
        JdbcTemplate jdbc = createSchema();

        assertThat(jdbc.queryForMap("select status, attempt_count, failure_count from ingestion_jobs where id = ?",
                UUID.fromString("00000000-0000-0000-0000-000000000001")))
                .containsEntry("STATUS", "PENDING")
                .containsEntry("ATTEMPT_COUNT", 3)
                .containsEntry("FAILURE_COUNT", 3);
        assertThat(jdbc.queryForMap("select status, attempt_count, failure_count from ingestion_jobs where id = ?",
                UUID.fromString("00000000-0000-0000-0000-000000000002")))
                .containsEntry("STATUS", "PARSING")
                .containsEntry("ATTEMPT_COUNT", 3)
                .containsEntry("FAILURE_COUNT", 2);
        assertThat(jdbc.queryForMap("select status, attempt_count, failure_count from ingestion_jobs where id = ?",
                UUID.fromString("00000000-0000-0000-0000-000000000003")))
                .containsEntry("STATUS", "READY")
                .containsEntry("ATTEMPT_COUNT", 3)
                .containsEntry("FAILURE_COUNT", 2);
        assertThat(jdbc.queryForMap("select status, attempt_count, failure_count from ingestion_jobs where id = ?",
                UUID.fromString("00000000-0000-0000-0000-000000000004")))
                .containsEntry("STATUS", "FAILED")
                .containsEntry("ATTEMPT_COUNT", 3)
                .containsEntry("FAILURE_COUNT", 3);
    }

    @Test
    void deletingAUserPreservesAnonymousChargesForTheGlobalDailyQuota() throws Exception {
        JdbcTemplate jdbc = createSchema();
        UUID userId = UUID.randomUUID();
        UUID taskId = UUID.randomUUID();
        UUID reservationId = UUID.randomUUID();
        jdbc.update("insert into users(id) values (?)", userId);
        jdbc.update("insert into ai_usage_locks(scope_key,scope_type,user_id,feature,task_key_hash,created_at,updated_at) "
                + "values (?,?,?,?,?,?,?)", "USER:" + userId, "USER", userId, null, null,
                java.time.Instant.now(), java.time.Instant.now());
        jdbc.update("insert into ai_usage_locks(scope_key,scope_type,user_id,feature,task_key_hash,created_at,updated_at) "
                + "values (?,?,?,?,?,?,?)", "TASK:hash", "TASK", userId, "CHAT", "hash",
                java.time.Instant.now(), java.time.Instant.now());
        jdbc.update("insert into ai_usage_reservations(id,task_id,user_id,feature,stage,provider,model,state,"
                        + "estimated_input_tokens,reserved_output_tokens,actual_input_tokens,actual_output_tokens,"
                        + "charged_tokens,request_dispatched,owner_id,lease_until,created_at,settled_at) "
                        + "values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                reservationId, taskId, userId, "CHAT", "CHAT_COMPLETION", "DEEPSEEK", "test-model", "COMPLETED",
                20L, 40L, 18L, 30L, 48L, true, UUID.randomUUID(), java.time.Instant.now(),
                java.time.Instant.now(), java.time.Instant.now());

        jdbc.update("delete from users where id = ?", userId);

        assertThat(jdbc.queryForObject("select user_id from ai_usage_reservations where id = ?", UUID.class,
                reservationId)).isNull();
        assertThat(jdbc.queryForObject("select count(*) from ai_usage_locks where user_id = ?", Integer.class,
                userId)).isZero();
        assertThat(jdbc.queryForObject("select sum(charged_tokens) from ai_usage_reservations", Long.class))
                .isEqualTo(48L);
    }

    private JdbcTemplate createSchema() throws Exception {
        String db = "aiusage" + UUID.randomUUID().toString().replace("-", "");
        DriverManagerDataSource dataSource = new DriverManagerDataSource(
                "jdbc:h2:mem:" + db + ";MODE=PostgreSQL;DB_CLOSE_DELAY=-1", "sa", "");
        JdbcTemplate jdbc = new JdbcTemplate(dataSource);
        jdbc.execute("create table users (id UUID primary key, status varchar(16) not null default 'ACTIVE')");
        jdbc.execute("create table ingestion_jobs (id UUID primary key, status varchar(16) not null, "
                + "attempt_count integer not null default 0, created_at timestamp with time zone not null)");
        jdbc.update("insert into ingestion_jobs(id,status,attempt_count,created_at) values(?,?,?,current_timestamp)",
                UUID.fromString("00000000-0000-0000-0000-000000000001"), "PENDING", 3);
        jdbc.update("insert into ingestion_jobs(id,status,attempt_count,created_at) values(?,?,?,current_timestamp)",
                UUID.fromString("00000000-0000-0000-0000-000000000002"), "PARSING", 3);
        jdbc.update("insert into ingestion_jobs(id,status,attempt_count,created_at) values(?,?,?,current_timestamp)",
                UUID.fromString("00000000-0000-0000-0000-000000000003"), "READY", 3);
        jdbc.update("insert into ingestion_jobs(id,status,attempt_count,created_at) values(?,?,?,current_timestamp)",
                UUID.fromString("00000000-0000-0000-0000-000000000004"), "FAILED", 3);
        try (Connection connection = dataSource.getConnection()) {
            ScriptUtils.executeSqlScript(connection, new ClassPathResource("db/migration/V30__ai_usage_guard.sql"));
        }
        return jdbc;
    }
}
