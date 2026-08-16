package com.auralis.app;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(classes = AuralisApplication.class)
@ActiveProfiles("test")
class SourceAssetRelationSchemaTests {

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    void appliesSourceAssetRelationMigrationAndCreatesRequiredTables() {
        assertThat(jdbcTemplate.queryForObject(
                "select version from flyway_schema_history where version = '3'", String.class))
                .isEqualTo("3");

        assertThat(tableExists("assets")).isTrue();
        assertThat(tableExists("sources")).isTrue();
        assertThat(tableExists("relations")).isTrue();
    }

    @Test
    void sourceAndRelationResourcesHaveCommonVersionAndSoftDeleteFields() {
        assertThat(columnExists("sources", "version")).isTrue();
        assertThat(columnExists("sources", "deleted_at")).isTrue();
        assertThat(columnExists("relations", "version")).isTrue();
        assertThat(columnExists("relations", "deleted_at")).isTrue();
        assertThat(columnExists("assets", "upload_status")).isTrue();
        assertThat(columnExists("assets", "completed_at")).isTrue();
    }

    @Test
    void knowledgeBlocksSourceIdIsBackedByTheSourceTable() {
        assertThat(constraintExists("knowledge_blocks", "fk_knowledge_blocks_source")).isTrue();
        assertThat(constraintExists("sources", "fk_sources_asset")).isTrue();
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

    private boolean constraintExists(String tableName, String constraintName) {
        return Boolean.TRUE.equals(jdbcTemplate.queryForObject(
                "select count(*) > 0 from information_schema.table_constraints "
                        + "where lower(table_schema) = 'public' and lower(table_name) = ? "
                        + "and lower(constraint_name) = ?",
                Boolean.class,
                tableName.toLowerCase(),
                constraintName.toLowerCase()));
    }
}
