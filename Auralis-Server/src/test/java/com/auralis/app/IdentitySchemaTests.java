package com.auralis.app;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(classes = AuralisApplication.class)
@ActiveProfiles("test")
class IdentitySchemaTests {

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    void appliesIdentityMigrationAndCreatesRequiredTables() {
        assertThat(jdbcTemplate.queryForObject(
                "select version from flyway_schema_history where version = '1'", String.class))
                .isEqualTo("1");
        assertThat(jdbcTemplate.queryForObject(
                "select version from flyway_schema_history where version = '46'", String.class))
                .isEqualTo("46");

        assertThat(tableExists("users")).isTrue();
        assertThat(tableExists("devices")).isTrue();
        assertThat(tableExists("refresh_sessions")).isTrue();
        assertThat(tableExists("auth_email_codes")).isTrue();
    }

    private boolean tableExists(String tableName) {
        return Boolean.TRUE.equals(jdbcTemplate.queryForObject(
                "select count(*) > 0 from information_schema.tables "
                        + "where lower(table_schema) = 'public' and lower(table_name) = ?",
                Boolean.class,
                tableName.toLowerCase()));
    }
}
