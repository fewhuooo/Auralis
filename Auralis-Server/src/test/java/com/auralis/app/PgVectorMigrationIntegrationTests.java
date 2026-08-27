package com.auralis.app;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@Testcontainers
@EnabledIfSystemProperty(named = "auralis.postgres.it", matches = "true")
class PgVectorMigrationIntegrationTests {

    private static final String POSTGRES_IMAGE = "pgvector/pgvector:0.8.6-pg17-bookworm";

    @Container
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>(
            DockerImageName.parse(POSTGRES_IMAGE).asCompatibleSubstituteFor("postgres"));

    @Test
    void upgradesAnExistingV8DatabaseAndBackfillsLegacyEmbeddings() {
        DriverManagerDataSource dataSource = new DriverManagerDataSource(
                POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword());
        Flyway.configure()
                .dataSource(dataSource)
                .locations("classpath:db/migration")
                .target("8")
                .load()
                .migrate();

        JdbcTemplate jdbc = new JdbcTemplate(dataSource);
        UUID userId = UUID.randomUUID();
        UUID subjectId = UUID.randomUUID();
        UUID sourceId = UUID.randomUUID();
        UUID pendingFileSourceId = UUID.randomUUID();
        jdbc.update("insert into users (id, username, normalized_username, password_hash, status) "
                        + "values (?, ?, ?, ?, 'ACTIVE')",
                userId, "migration-" + userId, ("migration-" + userId).toUpperCase(), "hash");
        jdbc.update("insert into subjects (id, user_id, name, sort_key, is_default) values (?, ?, ?, '', false)",
                subjectId, userId, "Migration subject");
        jdbc.update("insert into sources (id, user_id, type, subject_id, title, raw_text, ingestion_status) "
                        + "values (?, ?, 'FILE', ?, ?, ?, 'READY')",
                sourceId, userId, subjectId, "Legacy source", "Legacy source");
        jdbc.update("insert into source_chunks "
                        + "(id, user_id, source_id, ordinal, content, content_hash, char_start, char_end, embedding_json) "
                        + "values (?, ?, ?, 0, 'legacy', 'legacy-hash', 0, 6, ?)",
                UUID.randomUUID(), userId, sourceId, vectorJson());
        jdbc.update("insert into sources (id, user_id, type, subject_id, title, raw_text, ingestion_status) "
                        + "values (?, ?, 'FILE', ?, ?, ?, 'PARSING')",
                pendingFileSourceId, userId, subjectId, "Pending file", "Pending file");

        assertThat(columnExists(jdbc, "embedding")).isFalse();

        Flyway.configure()
                .dataSource(dataSource)
                .locations("classpath:db/migration")
                .load()
                .migrate();

        assertThat(columnExists(jdbc, "embedding")).isTrue();
        assertThat(jdbc.queryForObject(
                "select pg_typeof(embedding)::text from source_chunks where source_id = ?",
                String.class, sourceId)).isEqualTo("vector");
        assertThat(jdbc.queryForObject(
                "select count(*) from source_chunks where source_id = ? and embedding is not null",
                Integer.class, sourceId)).isEqualTo(1);
        assertThat(jdbc.queryForObject(
                "select count(*) from pg_indexes where indexname = 'ix_source_chunks_embedding_user' "
                        + "and indexdef ilike '%using hnsw%'",
                Integer.class)).isEqualTo(1);
        assertThat(jdbc.queryForObject(
                "select ingestion_status from sources where id = ?", String.class, sourceId))
                .isEqualTo("READY");
        assertThat(jdbc.queryForObject(
                "select ingestion_revision from sources where id = ?", UUID.class, sourceId))
                .isEqualTo(sourceId);
        assertThat(jdbc.queryForObject(
                "select count(*) from source_chunks where source_id = ? and active",
                Integer.class, sourceId)).isEqualTo(1);
        assertThat(jdbc.queryForObject(
                "select ingestion_status from sources where id = ?", String.class, pendingFileSourceId))
                .isEqualTo("AWAITING_CLIENT");
        assertThat(jdbc.queryForObject(
                "select ingestion_revision from sources where id = ?", UUID.class, pendingFileSourceId))
                .isEqualTo(pendingFileSourceId);
    }

    private boolean columnExists(JdbcTemplate jdbc, String column) {
        return jdbc.queryForObject(
                "select count(*) from information_schema.columns "
                        + "where table_schema = 'public' and table_name = 'source_chunks' and column_name = ?",
                Integer.class, column) > 0;
    }

    private String vectorJson() {
        StringBuilder vector = new StringBuilder("[");
        for (int index = 0; index < 1024; index++) {
            if (index > 0) {
                vector.append(',');
            }
            vector.append(index == 0 ? '1' : '0');
        }
        return vector.append(']').toString();
    }
}
