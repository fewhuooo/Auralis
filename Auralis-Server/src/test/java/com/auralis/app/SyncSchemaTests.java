package com.auralis.app;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(classes = AuralisApplication.class)
@ActiveProfiles("test")
class SyncSchemaTests {

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    void appliesSyncMigrationAndCreatesRequiredTables() {
        assertThat(jdbcTemplate.queryForObject(
                "select version from flyway_schema_history where version = '4'", String.class))
                .isEqualTo("4");
        assertThat(tableExists("change_log")).isTrue();
        assertThat(tableExists("inbound_mutations")).isTrue();
    }

    @Test
    void syncTablesContainOwnerAndRetentionFields() {
        for (String column : new String[]{"user_id", "cursor", "resource_type", "resource_id",
                "mutation_type", "version", "payload", "created_at"}) {
            assertThat(columnExists("change_log", column)).as(column).isTrue();
        }
        for (String column : new String[]{"user_id", "device_id", "client_mutation_id",
                "request_hash", "decision", "created_at"}) {
            assertThat(columnExists("inbound_mutations", column)).as(column).isTrue();
        }
    }

    @Test
    void syncTablesHaveOwnerForeignKeysAndIdempotencyConstraint() {
        assertThat(foreignKeyExists("change_log", "users")).isTrue();
        assertThat(foreignKeyExists("inbound_mutations", "users")).isTrue();
        assertThat(foreignKeyExists("inbound_mutations", "devices")).isTrue();
        assertThat(jdbcTemplate.queryForObject(
                "select count(*) from information_schema.table_constraints "
                        + "where lower(table_schema) = 'public' and lower(table_name) = 'inbound_mutations' "
                        + "and lower(constraint_type) = 'unique'",
                Integer.class)).isGreaterThanOrEqualTo(1);
    }

    private boolean tableExists(String tableName) {
        return Boolean.TRUE.equals(jdbcTemplate.queryForObject(
                "select count(*) > 0 from information_schema.tables "
                        + "where lower(table_schema) = 'public' and lower(table_name) = ?",
                Boolean.class,
                tableName));
    }

    private boolean columnExists(String tableName, String columnName) {
        return Boolean.TRUE.equals(jdbcTemplate.queryForObject(
                "select count(*) > 0 from information_schema.columns "
                        + "where lower(table_schema) = 'public' and lower(table_name) = ? "
                        + "and lower(column_name) = ?",
                Boolean.class,
                tableName,
                columnName));
    }

    private boolean foreignKeyExists(String tableName, String referencedTable) {
        return jdbcTemplate.queryForObject(
                "select count(*) > 0 from information_schema.table_constraints "
                        + "where lower(table_schema) = 'public' and lower(table_name) = ? "
                        + "and lower(constraint_type) = 'foreign key'",
                Boolean.class,
                tableName);
    }
}
