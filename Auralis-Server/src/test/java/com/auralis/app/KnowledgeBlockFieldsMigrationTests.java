package com.auralis.app;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class KnowledgeBlockFieldsMigrationTests {
    private SingleConnectionDataSource dataSource;
    private JdbcTemplate jdbc;

    @AfterEach
    void teardown() {
        if (dataSource != null) dataSource.destroy();
    }

    @Test
    void latestMigrationRemovesOnlyKnowledgeBlockSummaryAndTagsColumns() {
        dataSource = new SingleConnectionDataSource(
                "jdbc:h2:mem:kbfieldsmigration" + UUID.randomUUID() + ";MODE=PostgreSQL;DB_CLOSE_DELAY=-1", "sa", "", true);
        jdbc = new JdbcTemplate(dataSource);
        Flyway flyway = Flyway.configure().dataSource(dataSource).target("27").load();
        flyway.migrate();

        assertThat(columnCount("KNOWLEDGE_BLOCKS", "SUMMARY")).isEqualTo(1);
        assertThat(columnCount("KNOWLEDGE_BLOCKS", "TAGS")).isEqualTo(1);
        assertThat(columnCount("KNOWLEDGE_BLOCKS", "COLOR_OVERRIDE")).isEqualTo(1);

        Flyway.configure().dataSource(dataSource).load().migrate();

        assertThat(columnCount("KNOWLEDGE_BLOCKS", "SUMMARY")).isZero();
        assertThat(columnCount("KNOWLEDGE_BLOCKS", "TAGS")).isZero();
        assertThat(columnCount("KNOWLEDGE_BLOCKS", "COLOR_OVERRIDE")).isEqualTo(1);
    }

    private int columnCount(String table, String column) {
        return jdbc.queryForObject("SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = ? AND COLUMN_NAME = ?",
                Integer.class, table, column);
    }
}
