package com.auralis.app;

import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.FlywayException;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class TaskColorRemovalMigrationTests {

    private SingleConnectionDataSource dataSource;
    private JdbcTemplate jdbc;
    private final ObjectMapper objectMapper = new ObjectMapper();

    @AfterEach
    void teardown() {
        if (dataSource != null) dataSource.destroy();
    }

    private Flyway startBeforeV21() {
        dataSource = new SingleConnectionDataSource(
                "jdbc:h2:mem:migrationtest" + UUID.randomUUID() + ";MODE=PostgreSQL;DB_CLOSE_DELAY=-1", "sa", "", true);
        jdbc = new JdbcTemplate(dataSource);
        Flyway.configure().dataSource(dataSource).target("20").load().migrate();
        return Flyway.configure().dataSource(dataSource).load();
    }

    private Flyway startFresh() {
        dataSource = new SingleConnectionDataSource(
                "jdbc:h2:mem:migrationclean" + UUID.randomUUID() + ";MODE=PostgreSQL;DB_CLOSE_DELAY=-1", "sa", "", true);
        jdbc = new JdbcTemplate(dataSource);
        return Flyway.configure().dataSource(dataSource).load();
    }

    private void createFixture(UUID userId, UUID deviceId, UUID subjectId, UUID taskId, UUID blockId) {
        jdbc.update("INSERT INTO users (id, username, normalized_username, password_hash, status) VALUES (?, 'user1', 'user1', 'hash', 'ACTIVE')", userId);
        jdbc.update("INSERT INTO devices (id, user_id, device_id, name, platform) VALUES (?, ?, 'dev1', 'device 1', 'IOS')", deviceId, userId);
        jdbc.update("INSERT INTO subjects (id, user_id, name, sort_key, is_default) VALUES (?, ?, 'subject 1', '', true)", subjectId, userId);
        if (taskId != null) {
            jdbc.update("INSERT INTO tasks (id, user_id, subject_id, title, description, status, sort_key) VALUES (?, ?, ?, 'task 1', 'description', 'TODO', '')", taskId, userId, subjectId);
        }
        if (blockId != null) {
            jdbc.update("INSERT INTO knowledge_blocks (id, user_id, subject_id, title, content) VALUES (?, ?, ?, 'block 1', 'content')", blockId, userId, subjectId);
        }
    }

    @Test
    void cleanSchemaValidationRunsFreshDatabaseThroughLatest() {
        Flyway flyway = startFresh();
        flyway.migrate();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'TASKS' AND COLUMN_NAME = 'COLOR_OVERRIDE'", Integer.class)).isZero();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'KNOWLEDGE_BLOCKS' AND COLUMN_NAME = 'COLOR_OVERRIDE'", Integer.class)).isEqualTo(1);
        assertThat(flyway.info().current().getVersion().getVersion()).isEqualTo("21");
    }

    @Test
    void preV21UpgradeRemovesOnlyTaskColorsAndPreservesKnowledgeBlockColors() throws Exception {
        Flyway flyway = startBeforeV21();
        UUID userId = UUID.randomUUID();
        UUID deviceId = UUID.randomUUID();
        UUID subjectId = UUID.randomUUID();
        UUID taskId = UUID.randomUUID();
        UUID blockId = UUID.randomUUID();
        createFixture(userId, deviceId, subjectId, taskId, blockId);
        String taskPayload = "{\"id\":\"" + taskId + "\",\"title\":\"Keep\",\"durationMinutes\":30,\"colorOverride\":\"#112233\",\"color\":\"#445566\",\"resourceType\":\"TASK\"}";
        String blockPayload = "{\"id\":\"" + blockId + "\",\"title\":\"Block\",\"colorOverride\":\"#abcdef\",\"color\":\"#fedcba\",\"resourceType\":\"KNOWLEDGE_BLOCK\"}";
        jdbc.update("INSERT INTO change_log (id, user_id, cursor, resource_type, resource_id, mutation_type, payload, version) VALUES (?, ?, 100, 'TASK', ?, 'CREATE', ?, 1)", UUID.randomUUID(), userId, taskId, taskPayload);
        jdbc.update("INSERT INTO inbound_mutations (id, user_id, device_id, client_mutation_id, request_hash, decision, resource_type, resource_id, mutation_type, current_payload) VALUES (?, ?, ?, 'mut1', 'hash1', 'APPLIED', 'TASK', ?, 'CREATE', ?)", UUID.randomUUID(), userId, deviceId, taskId, taskPayload);
        jdbc.update("INSERT INTO change_log (id, user_id, cursor, resource_type, resource_id, mutation_type, payload, version) VALUES (?, ?, 101, 'KNOWLEDGE_BLOCK', ?, 'CREATE', ?, 1)", UUID.randomUUID(), userId, blockId, blockPayload);
        jdbc.update("INSERT INTO inbound_mutations (id, user_id, device_id, client_mutation_id, request_hash, decision, resource_type, resource_id, mutation_type, current_payload) VALUES (?, ?, ?, 'mut2', 'hash2', 'APPLIED', 'KNOWLEDGE_BLOCK', ?, 'CREATE', ?)", UUID.randomUUID(), userId, deviceId, blockId, blockPayload);
        flyway.migrate();
        assertTaskPayload(jdbc.queryForMap("SELECT payload FROM change_log WHERE resource_id = ?", taskId).get("payload").toString(), taskId);
        assertTaskPayload(jdbc.queryForMap("SELECT current_payload FROM inbound_mutations WHERE resource_id = ?", taskId).get("current_payload").toString(), taskId);
        assertKnowledgeBlockPayload(jdbc.queryForMap("SELECT payload FROM change_log WHERE resource_id = ?", blockId).get("payload").toString(), blockId);
        assertKnowledgeBlockPayload(jdbc.queryForMap("SELECT current_payload FROM inbound_mutations WHERE resource_id = ?", blockId).get("current_payload").toString(), blockId);
    }

    private void assertTaskPayload(String payload, UUID taskId) throws Exception {
        JsonNode node = objectMapper.readTree(payload);
        assertThat(node.get("id").asString()).isEqualTo(taskId.toString());
        assertThat(node.get("title").asString()).isEqualTo("Keep");
        assertThat(node.get("durationMinutes").asInt()).isEqualTo(30);
        assertThat(node.has("color")).isFalse();
        assertThat(node.has("colorOverride")).isFalse();
    }

    private void assertKnowledgeBlockPayload(String payload, UUID blockId) throws Exception {
        JsonNode node = objectMapper.readTree(payload);
        assertThat(node.get("id").asString()).isEqualTo(blockId.toString());
        assertThat(node.get("colorOverride").asString()).isEqualTo("#abcdef");
        assertThat(node.get("color").asString()).isEqualTo("#fedcba");
    }

    @Test
    void failsOnMalformedChangeLogJson() {
        Flyway flyway = startBeforeV21();
        UUID userId = UUID.randomUUID();
        UUID badId = UUID.randomUUID();
        createFixture(userId, UUID.randomUUID(), UUID.randomUUID(), null, null);
        jdbc.update("INSERT INTO change_log (id, user_id, cursor, resource_type, resource_id, mutation_type, payload, version) VALUES (?, ?, 100, 'TASK', ?, 'CREATE', '{bad', 1)", badId, userId, UUID.randomUUID());
        assertThatThrownBy(flyway::migrate).isInstanceOf(FlywayException.class).hasStackTraceContaining("change_log.payload").hasStackTraceContaining(badId.toString());
    }

    @Test
    void failsOnMalformedInboundMutationJson() {
        Flyway flyway = startBeforeV21();
        UUID userId = UUID.randomUUID();
        UUID deviceId = UUID.randomUUID();
        UUID badId = UUID.randomUUID();
        createFixture(userId, deviceId, UUID.randomUUID(), null, null);
        jdbc.update("INSERT INTO inbound_mutations (id, user_id, device_id, client_mutation_id, request_hash, decision, resource_type, resource_id, mutation_type, current_payload) VALUES (?, ?, ?, 'mut_bad', 'hash_bad', 'APPLIED', 'TASK', ?, 'CREATE', '{bad')", badId, userId, deviceId, UUID.randomUUID());
        assertThatThrownBy(flyway::migrate).isInstanceOf(FlywayException.class).hasStackTraceContaining("inbound_mutations.current_payload").hasStackTraceContaining(badId.toString());
    }

    @Test
    void failsOnNonObjectChangeLogJson() {
        Flyway flyway = startBeforeV21();
        UUID userId = UUID.randomUUID();
        UUID badId = UUID.randomUUID();
        createFixture(userId, UUID.randomUUID(), UUID.randomUUID(), null, null);
        jdbc.update("INSERT INTO change_log (id, user_id, cursor, resource_type, resource_id, mutation_type, payload, version) VALUES (?, ?, 100, 'TASK', ?, 'CREATE', '[]', 1)", badId, userId, UUID.randomUUID());
        assertThatThrownBy(flyway::migrate).isInstanceOf(FlywayException.class).hasStackTraceContaining("change_log.payload").hasStackTraceContaining(badId.toString());
    }

    @Test
    void failsOnNonObjectInboundMutationJson() {
        Flyway flyway = startBeforeV21();
        UUID userId = UUID.randomUUID();
        UUID deviceId = UUID.randomUUID();
        UUID badId = UUID.randomUUID();
        createFixture(userId, deviceId, UUID.randomUUID(), null, null);
        jdbc.update("INSERT INTO inbound_mutations (id, user_id, device_id, client_mutation_id, request_hash, decision, resource_type, resource_id, mutation_type, current_payload) VALUES (?, ?, ?, 'mut_bad', 'hash_bad', 'APPLIED', 'TASK', ?, 'CREATE', '\"string\"')", badId, userId, deviceId, UUID.randomUUID());
        assertThatThrownBy(flyway::migrate).isInstanceOf(FlywayException.class).hasStackTraceContaining("inbound_mutations.current_payload").hasStackTraceContaining(badId.toString());
    }
}
