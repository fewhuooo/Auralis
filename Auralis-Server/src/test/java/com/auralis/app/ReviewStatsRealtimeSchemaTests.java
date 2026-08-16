package com.auralis.app;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(classes = AuralisApplication.class)
@ActiveProfiles("test")
class ReviewStatsRealtimeSchemaTests {

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    void appliesV5AndCreatesReviewStatsAndRealtimeTables() {
        assertThat(jdbcTemplate.queryForObject(
                "select version from flyway_schema_history where version = '5'", String.class))
                .isEqualTo("5");
        assertThat(tableExists("review_parameter_sets")).isTrue();
        assertThat(tableExists("review_states")).isTrue();
        assertThat(tableExists("review_events")).isTrue();
        assertThat(tableExists("realtime_tickets")).isTrue();
    }

    @Test
    void reviewAndTicketTablesHaveOwnerIndexesAndStableConstraints() {
        assertThat(columnExists("review_states", "knowledge_block_id")).isTrue();
        assertThat(columnExists("review_states", "due_at")).isTrue();
        assertThat(columnExists("review_events", "client_event_id")).isTrue();
        assertThat(columnExists("realtime_tickets", "ticket_hash")).isTrue();
        assertThat(constraintExists("review_events", "ux_review_events_user_client_event")).isTrue();
        assertThat(indexExists("realtime_tickets", "ix_realtime_tickets_hash")).isTrue();
        assertThat(constraintExists("review_states", "ux_review_states_knowledge_block")).isTrue();
    }

    private boolean tableExists(String name) {
        return Boolean.TRUE.equals(jdbcTemplate.queryForObject(
                "select count(*) > 0 from information_schema.tables where lower(table_schema) = 'public' and lower(table_name) = ?",
                Boolean.class, name));
    }

    private boolean columnExists(String table, String column) {
        return Boolean.TRUE.equals(jdbcTemplate.queryForObject(
                "select count(*) > 0 from information_schema.columns where lower(table_schema) = 'public' and lower(table_name) = ? and lower(column_name) = ?",
                Boolean.class, table, column));
    }

    private boolean indexExists(String table, String index) {
        return Boolean.TRUE.equals(jdbcTemplate.queryForObject(
                "select count(*) > 0 from information_schema.indexes where lower(table_name) = ? and lower(index_name) = ?",
                Boolean.class, table, index));
    }

    private boolean constraintExists(String table, String constraint) {
        return Boolean.TRUE.equals(jdbcTemplate.queryForObject(
                "select count(*) > 0 from information_schema.table_constraints where lower(table_schema) = 'public' and lower(table_name) = ? and lower(constraint_name) = ?",
                Boolean.class, table, constraint));
    }
}
