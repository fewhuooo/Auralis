package com.auralis.app;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.test.context.ActiveProfiles;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(classes = AuralisApplication.class)
@ActiveProfiles("test")
class ParsedDocumentSchemaTests {

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @AfterEach
    void removeStatusProbeSource() {
        jdbcTemplate.update("delete from sources where title = 'Client parsed source'");
    }

    @Test
    void cleanSchemaCreatesParsedDocumentRevisionColumnsAndOwnerIndexes() {
        assertThat(jdbcTemplate.queryForObject(
                "select version from flyway_schema_history where version = '15'", String.class))
                .isEqualTo("15");

        assertThat(tableExists("parsed_documents")).isTrue();
        assertThat(columnExists("sources", "ingestion_revision")).isTrue();
        assertThat(columnExists("ingestion_jobs", "parsed_document_id")).isTrue();
        assertThat(columnExists("ingestion_jobs", "ingestion_revision")).isTrue();
        assertThat(indexExists("parsed_documents", "ix_parsed_documents_user_source_revision")).isTrue();
        assertThat(indexExists("parsed_documents", "ix_parsed_documents_status_updated")).isTrue();
        assertThat(tableConstraintExists("parsed_documents", "fk_parsed_documents_source")).isTrue();
        assertThat(tableConstraintExists("parsed_documents", "fk_parsed_documents_user")).isTrue();
        assertThat(tableConstraintExists("ingestion_jobs", "fk_ingestion_jobs_parsed_document")).isTrue();
    }

    @Test
    void parsedDocumentsRemainOutsideSyncTablesAndConstraints() {
        assertThat(tableConstraintExists("change_log", "fk_change_log_parsed_documents")).isFalse();
        assertThat(tableConstraintExists("inbound_mutations", "fk_inbound_mutations_parsed_documents")).isFalse();
        assertThat(columnExists("change_log", "parsed_document_id")).isFalse();
        assertThat(columnExists("inbound_mutations", "parsed_document_id")).isFalse();
    }

    @Test
    void newSourceStatusesAllowClientValidationLifecycle() {
        UUID userId = createUser();
        UUID subjectId = createSubject(userId);
        UUID sourceId = UUID.randomUUID();

        jdbcTemplate.update(
                "insert into sources (id, user_id, type, subject_id, title, ingestion_status) "
                        + "values (?, ?, 'FILE', ?, 'Client parsed source', 'AWAITING_CLIENT')",
                sourceId, userId, subjectId);

        assertThat(jdbcTemplate.queryForObject(
                "select ingestion_status from sources where id = ?", String.class, sourceId))
                .isEqualTo("AWAITING_CLIENT");

        jdbcTemplate.update(
                "update sources set ingestion_status = 'VALIDATING' where id = ?", sourceId);
        assertThat(jdbcTemplate.queryForObject(
                "select ingestion_status from sources where id = ?", String.class, sourceId))
                .isEqualTo("VALIDATING");
    }

    @Test
    void upgradeMigratesLegacyFileStatesWithoutLosingReadyChunks() {
        DriverManagerDataSource dataSource = new DriverManagerDataSource(
                "jdbc:h2:mem:parsed-doc-upgrade-" + UUID.randomUUID() + ";MODE=PostgreSQL;DB_CLOSE_DELAY=-1",
                "sa", "");
        Flyway.configure()
                .dataSource(dataSource)
                .locations("classpath:db/migration")
                .target("14")
                .load()
                .migrate();

        JdbcTemplate jdbc = new JdbcTemplate(dataSource);
        UUID userId = UUID.randomUUID();
        UUID subjectId = UUID.randomUUID();
        UUID readySourceId = UUID.randomUUID();
        UUID pendingSourceId = UUID.randomUUID();
        jdbc.update("insert into users (id, username, normalized_username, password_hash, status) "
                        + "values (?, ?, ?, 'hash', 'ACTIVE')",
                userId, "upgrade-" + userId, ("upgrade-" + userId).toUpperCase());
        jdbc.update("insert into subjects (id, user_id, name, sort_key, is_default) values (?, ?, ?, '', false)",
                subjectId, userId, "Upgrade subject");
        jdbc.update("insert into sources (id, user_id, type, subject_id, title, ingestion_status) "
                        + "values (?, ?, 'FILE', ?, 'Ready legacy file', 'READY')",
                readySourceId, userId, subjectId);
        jdbc.update("insert into sources (id, user_id, type, subject_id, title, ingestion_status) "
                        + "values (?, ?, 'FILE', ?, 'Pending legacy file', 'PARSING')",
                pendingSourceId, userId, subjectId);
        jdbc.update("insert into source_chunks "
                        + "(id, user_id, source_id, generation, active, ordinal, content, content_hash, char_start, char_end, embedding_json) "
                        + "values (?, ?, ?, ?, true, 0, 'ready', 'ready-hash', 0, 5, '[]')",
                UUID.randomUUID(), userId, readySourceId,
                UUID.fromString("00000000-0000-0000-0000-000000000000"));

        Flyway.configure()
                .dataSource(dataSource)
                .locations("classpath:db/migration")
                .load()
                .migrate();

        assertThat(jdbc.queryForObject(
                "select ingestion_status from sources where id = ?", String.class, readySourceId))
                .isEqualTo("READY");
        assertThat(jdbc.queryForObject(
                "select ingestion_revision from sources where id = ?", UUID.class, readySourceId))
                .isEqualTo(readySourceId);
        assertThat(jdbc.queryForObject(
                "select count(*) from source_chunks where source_id = ? and active",
                Integer.class, readySourceId)).isEqualTo(1);
        assertThat(jdbc.queryForObject(
                "select ingestion_status from sources where id = ?", String.class, pendingSourceId))
                .isEqualTo("AWAITING_CLIENT");
        assertThat(jdbc.queryForObject(
                "select ingestion_revision from sources where id = ?", UUID.class, pendingSourceId))
                .isEqualTo(pendingSourceId);
    }

    private UUID createUser() {
        UUID id = UUID.randomUUID();
        String username = "parsed-schema-" + id;
        jdbcTemplate.update(
                "insert into users (id, username, normalized_username, password_hash, status) "
                        + "values (?, ?, ?, 'hash', 'ACTIVE')",
                id, username, username.toUpperCase());
        return id;
    }

    private UUID createSubject(UUID userId) {
        UUID id = UUID.randomUUID();
        jdbcTemplate.update(
                "insert into subjects (id, user_id, name, sort_key, is_default) values (?, ?, ?, '', false)",
                id, userId, "Parsed schema subject");
        return id;
    }

    private boolean tableExists(String tableName) {
        return Boolean.TRUE.equals(jdbcTemplate.queryForObject(
                "select count(*) > 0 from information_schema.tables "
                        + "where lower(table_schema) = 'public' and lower(table_name) = ?",
                Boolean.class, tableName));
    }

    private boolean columnExists(String tableName, String columnName) {
        return Boolean.TRUE.equals(jdbcTemplate.queryForObject(
                "select count(*) > 0 from information_schema.columns "
                        + "where lower(table_schema) = 'public' and lower(table_name) = ? "
                        + "and lower(column_name) = ?",
                Boolean.class, tableName, columnName));
    }

    private boolean indexExists(String tableName, String indexName) {
        return Boolean.TRUE.equals(jdbcTemplate.queryForObject(
                "select count(*) > 0 from information_schema.indexes "
                        + "where lower(table_name) = ? and lower(index_name) = ?",
                Boolean.class, tableName, indexName));
    }

    private boolean tableConstraintExists(String tableName, String constraintName) {
        return Boolean.TRUE.equals(jdbcTemplate.queryForObject(
                "select count(*) > 0 from information_schema.table_constraints "
                        + "where lower(table_schema) = 'public' and lower(table_name) = ? "
                        + "and lower(constraint_name) = ?",
                Boolean.class, tableName, constraintName));
    }
}
