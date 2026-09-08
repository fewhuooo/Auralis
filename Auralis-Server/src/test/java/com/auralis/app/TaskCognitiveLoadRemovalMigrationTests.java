package com.auralis.app;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.test.context.ActiveProfiles;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(classes = AuralisApplication.class)
@ActiveProfiles("test")
class TaskCognitiveLoadRemovalMigrationTests {

    @Autowired
    private JdbcTemplate jdbcTemplate;

    private final ObjectMapper mapper = new ObjectMapper();

    @Test
    void cleanSchemaHasNoCognitiveLoad() {
        assertThat(columnExists("tasks", "cognitive_load")).isFalse();
        assertThat(tableConstraintExists("tasks", "ck_tasks_cognitive_load")).isFalse();
    }

    @Test
    void upgradeMigratesTaskCognitiveLoad() throws Exception {
        DriverManagerDataSource dataSource = new DriverManagerDataSource(
                "jdbc:h2:mem:task-upgrade-" + UUID.randomUUID() + ";MODE=PostgreSQL;DB_CLOSE_DELAY=-1",
                "sa", "");
        Flyway.configure()
                .dataSource(dataSource)
                .locations("classpath:db/migration")
                .target("19")
                .load()
                .migrate();

        JdbcTemplate jdbc = new JdbcTemplate(dataSource);
        UUID userId = UUID.randomUUID();
        UUID deviceId = UUID.randomUUID();
        UUID subjectId = UUID.randomUUID();
        UUID taskId = UUID.randomUUID();
        UUID logId1 = UUID.randomUUID();
        UUID mutId1 = UUID.randomUUID();

        jdbc.update("insert into users (id, username, normalized_username, password_hash, status) values (?, ?, ?, 'hash', 'ACTIVE')",
                userId, "u-" + userId, ("u-" + userId).toUpperCase());
        jdbc.update("insert into devices (id, user_id, device_id) values (?, ?, 'dev')",
                deviceId, userId);
        jdbc.update("insert into subjects (id, user_id, name, sort_key, is_default) values (?, ?, 'S', 'a', false)",
                subjectId, userId);
        jdbc.update("insert into tasks (id, user_id, subject_id, title, duration_minutes, status, cognitive_load, sort_key, version) values (?, ?, ?, 'T', 30, 'TODO', 'HIGH', 'a', 1)",
                taskId, userId, subjectId);

        String taskPayload = "{\"id\":\"" + taskId + "\",\"title\":\"T\",\"durationMinutes\":30,\"cognitiveLoad\":\"HIGH\",\"sortKey\":\"a\",\"resourceType\":\"TASK\"}";
        String nonTaskPayload = "{\"id\":\"" + taskId + "\",\"title\":\"NT\",\"cognitiveLoad\":\"HIGH\",\"resourceType\":\"SUBJECT\"}";

        jdbc.update("insert into change_log (id, user_id, resource_type, resource_id, mutation_type, version, payload, cursor) values (?, ?, 'TASK', ?, 'CREATE', 1, ?, 100)",
                logId1, userId, taskId, taskPayload);
        jdbc.update("insert into change_log (id, user_id, resource_type, resource_id, mutation_type, version, payload, cursor) values (?, ?, 'SUBJECT', ?, 'CREATE', 1, ?, 101)",
                UUID.randomUUID(), userId, taskId, nonTaskPayload);

        jdbc.update("insert into inbound_mutations (id, user_id, device_id, client_mutation_id, request_hash, resource_type, resource_id, mutation_type, decision, current_payload) values (?, ?, ?, ?, 'hash', 'TASK', ?, 'CREATE', 'APPLIED', ?)",
                mutId1, userId, deviceId, "cli1", taskId, taskPayload);
        jdbc.update("insert into inbound_mutations (id, user_id, device_id, client_mutation_id, request_hash, resource_type, resource_id, mutation_type, decision, current_payload) values (?, ?, ?, ?, 'hash', 'SUBJECT', ?, 'CREATE', 'APPLIED', ?)",
                UUID.randomUUID(), userId, deviceId, "cli2", taskId, nonTaskPayload);

        Flyway.configure()
                .dataSource(dataSource)
                .locations("classpath:db/migration")
                .load()
                .migrate();

        assertThat(columnExists(jdbc, "tasks", "cognitive_load")).isFalse();
        assertThat(tableConstraintExists(jdbc, "tasks", "ck_tasks_cognitive_load")).isFalse();

        JsonNode migratedTaskPayload = mapper.readTree(jdbc.queryForObject("select payload from change_log where id = ?", String.class, logId1));
        assertThat(migratedTaskPayload.has("cognitiveLoad")).isFalse();
        assertThat(migratedTaskPayload.has("title")).isTrue();
        assertThat(migratedTaskPayload.get("durationMinutes").asInt()).isEqualTo(30);

        JsonNode migratedTaskMutPayload = mapper.readTree(jdbc.queryForObject("select current_payload from inbound_mutations where id = ?", String.class, mutId1));
        assertThat(migratedTaskMutPayload.has("cognitiveLoad")).isFalse();
        assertThat(migratedTaskMutPayload.has("title")).isTrue();

        JsonNode migratedNonTaskPayload = mapper.readTree(jdbc.queryForObject("select payload from change_log where resource_type = 'SUBJECT'", String.class));
        assertThat(migratedNonTaskPayload.has("cognitiveLoad")).isTrue();

        JsonNode migratedNonTaskMutPayload = mapper.readTree(jdbc.queryForObject("select current_payload from inbound_mutations where resource_type = 'SUBJECT'", String.class));
        assertThat(migratedNonTaskMutPayload.has("cognitiveLoad")).isTrue();

        assertThat(jdbc.queryForObject("select cursor from change_log where id = ?", Long.class, logId1)).isEqualTo(100L);
        assertThat(jdbc.queryForObject("select version from tasks where id = ?", Long.class, taskId)).isEqualTo(1L);
    }

    private boolean columnExists(String tableName, String columnName) {
        return columnExists(jdbcTemplate, tableName, columnName);
    }

    private boolean columnExists(JdbcTemplate jdbc, String tableName, String columnName) {
        return Boolean.TRUE.equals(jdbc.queryForObject(
                "select count(*) > 0 from information_schema.columns "
                        + "where lower(table_schema) = 'public' and lower(table_name) = ? "
                        + "and lower(column_name) = ?",
                Boolean.class, tableName, columnName));
    }

    private boolean tableConstraintExists(String tableName, String constraintName) {
        return tableConstraintExists(jdbcTemplate, tableName, constraintName);
    }

    private boolean tableConstraintExists(JdbcTemplate jdbc, String tableName, String constraintName) {
        return Boolean.TRUE.equals(jdbc.queryForObject(
                "select count(*) > 0 from information_schema.table_constraints "
                        + "where lower(table_schema) = 'public' and lower(table_name) = ? "
                        + "and lower(constraint_name) = ?",
                Boolean.class, tableName, constraintName));
    }
}
