package com.auralis.app;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(classes = AuralisApplication.class)
@ActiveProfiles("test")
class AiSchemaTests {

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    void appliesAiRagMigrationsAndCreatesRequiredTables() {
        assertThat(jdbcTemplate.queryForObject(
                "select version from flyway_schema_history where version = '8'", String.class))
                .isEqualTo("8");
        assertThat(jdbcTemplate.queryForObject(
                "select version from flyway_schema_history where version = '9'", String.class))
                .isEqualTo("9");
        assertThat(jdbcTemplate.queryForObject(
                "select version from flyway_schema_history where version = '10'", String.class))
                .isEqualTo("10");
        assertThat(jdbcTemplate.queryForObject(
                "select version from flyway_schema_history where version = '11'", String.class))
                .isEqualTo("11");
        assertThat(jdbcTemplate.queryForObject(
                "select version from flyway_schema_history where version = '13'", String.class))
                .isEqualTo("13");
        assertThat(jdbcTemplate.queryForObject(
                "select version from flyway_schema_history where version = '34'", String.class))
                .isEqualTo("34");
        assertThat(jdbcTemplate.queryForObject(
                "select version from flyway_schema_history where version = '40'", String.class))
                .isEqualTo("40");
        for (String table : new String[]{
                "ai_credentials", "ingestion_jobs", "source_chunks", "conversations", "messages"}) {
            assertThat(tableExists(table)).as(table).isTrue();
        }
    }

    @Test
    void overviewResultTitleUsesUnboundedTextStorage() {
        var titleColumn = jdbcTemplate.queryForMap(
                "select data_type, character_maximum_length, is_nullable "
                        + "from information_schema.columns where lower(table_schema)='public' "
                        + "and lower(table_name)='overview_results' and lower(column_name)='title'");
        assertThat(titleColumn.get("data_type").toString()).isNotBlank();
        assertThat(titleColumn.get("is_nullable").toString()).isEqualToIgnoringCase("NO");
        Object maximumLength = titleColumn.get("character_maximum_length");
        assertThat(maximumLength == null || ((Number) maximumLength).longValue() > 300).isTrue();
    }

    @Test
    void aiTablesHaveOwnerFieldsAndSensitiveCredentialShape() {
        for (String column : new String[]{
                "user_id", "provider", "base_url", "chat_model",
                "embedding_model", "api_key_ciphertext", "key_version"}) {
            assertThat(columnExists("ai_credentials", column)).as(column).isTrue();
        }
        assertThat(columnExists("ai_credentials", "api_key")).isFalse();
        for (String column : new String[]{"user_id", "source_id", "status", "attempt_count", "lease_until"}) {
            assertThat(columnExists("ingestion_jobs", column)).as(column).isTrue();
        }
        for (String column : new String[]{
                "user_id", "source_id", "generation", "active", "ordinal", "content", "content_hash", "embedding_json"}) {
            assertThat(columnExists("source_chunks", column)).as(column).isTrue();
        }
        assertThat(columnExists("source_chunks", "provenance_json")).isTrue();
        assertThat(columnExists("overview_results", "outline_identity_json")).isTrue();
        assertThat(columnExists("messages", "conversation_id")).isTrue();
        assertThat(columnExists("messages", "message_sequence")).isTrue();
        assertThat(columnExists("conversations", "version")).isTrue();
        assertThat(columnExists("conversations", "next_message_sequence")).isTrue();
    }

    @Test
    void aiTablesExposeOwnerIndexesAndIdempotencyConstraints() {
        assertThat(constraintExists("ai_credentials", "uq_ai_credentials_user_provider")).isTrue();
        assertThat(constraintExists("source_chunks", "uq_source_chunks_user_source_generation_ordinal")).isTrue();
        assertThat(constraintExists("messages", "uq_messages_conversation_sequence")).isTrue();
        assertThat(indexExists("ingestion_jobs", "ix_ingestion_jobs_pending")).isTrue();
        assertThat(indexExists("source_chunks", "ix_source_chunks_user_source")).isTrue();
        assertThat(indexExists("source_chunks", "ix_source_chunks_active_user_source")).isTrue();
        assertThat(indexExists("conversations", "ix_conversations_user_updated")).isTrue();
    }

    private boolean tableExists(String table) {
        return Boolean.TRUE.equals(jdbcTemplate.queryForObject(
                "select count(*) > 0 from information_schema.tables "
                        + "where lower(table_schema) = 'public' and lower(table_name) = ?",
                Boolean.class, table));
    }

    private boolean columnExists(String table, String column) {
        return Boolean.TRUE.equals(jdbcTemplate.queryForObject(
                "select count(*) > 0 from information_schema.columns "
                        + "where lower(table_schema) = 'public' and lower(table_name) = ? "
                        + "and lower(column_name) = ?",
                Boolean.class, table, column));
    }

    private boolean indexExists(String table, String index) {
        return Boolean.TRUE.equals(jdbcTemplate.queryForObject(
                "select count(*) > 0 from information_schema.indexes "
                        + "where lower(table_name) = ? and lower(index_name) = ?",
                Boolean.class, table, index));
    }

    private boolean constraintExists(String table, String constraint) {
        return Boolean.TRUE.equals(jdbcTemplate.queryForObject(
                "select count(*) > 0 from information_schema.table_constraints "
                        + "where lower(table_schema) = 'public' and lower(table_name) = ? "
                        + "and lower(constraint_name) = ?",
                Boolean.class, table, constraint));
    }
}
