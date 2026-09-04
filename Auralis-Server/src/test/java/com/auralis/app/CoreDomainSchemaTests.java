package com.auralis.app;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(classes = AuralisApplication.class)
@ActiveProfiles("test")
class CoreDomainSchemaTests {

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    void appliesCoreDomainMigrationAndCreatesRequiredTables() {
        assertThat(jdbcTemplate.queryForObject(
                "select version from flyway_schema_history where version = '2'", String.class))
                .isEqualTo("2");

        assertThat(tableExists("subjects")).isTrue();
        assertThat(tableExists("knowledge_blocks")).isTrue();
        assertThat(tableExists("tasks")).isTrue();
    }

    @Test
    void coreResourcesHaveCommonVersionAndSoftDeleteFields() {
        assertThat(columnExists("subjects", "version")).isTrue();
        assertThat(columnExists("subjects", "deleted_at")).isTrue();
        assertThat(columnExists("knowledge_blocks", "version")).isTrue();
        assertThat(columnExists("knowledge_blocks", "deleted_at")).isTrue();
        assertThat(columnExists("tasks", "version")).isTrue();
        assertThat(columnExists("tasks", "deleted_at")).isTrue();
    }

    @Test
    void removesSubjectColorButPreservesResourceColorOverrides() {
        assertThat(jdbcTemplate.queryForObject(
                "select version from flyway_schema_history where version = '19'", String.class))
                .isEqualTo("19");
        assertThat(columnExists("subjects", "color")).isFalse();
        assertThat(columnExists("knowledge_blocks", "color_override")).isTrue();
        assertThat(columnExists("tasks", "color_override")).isTrue();
    }

    private boolean tableExists(String tableName) {
        return Boolean.TRUE.equals(jdbcTemplate.queryForObject(
                "select count(*) > 0 from information_schema.tables "
                        + "where lower(table_schema) = 'public' and lower(table_name) = ?",
                Boolean.class,
                tableName.toLowerCase()));
    }

    private boolean columnExists(String tableName, String columnName) {
        return Boolean.TRUE.equals(jdbcTemplate.queryForObject(
                "select count(*) > 0 from information_schema.columns "
                        + "where lower(table_schema) = 'public' and lower(table_name) = ? "
                        + "and lower(column_name) = ?",
                Boolean.class,
                tableName.toLowerCase(),
                columnName.toLowerCase()));
    }
}
