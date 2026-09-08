package db.migration;

import org.flywaydb.core.api.FlywayException;
import org.flywaydb.core.api.migration.BaseJavaMigration;
import org.flywaydb.core.api.migration.Context;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

import java.sql.ResultSet;
import java.util.UUID;

public final class V20__remove_task_cognitive_load extends BaseJavaMigration {

    private final ObjectMapper mapper = new ObjectMapper();

    @Override
    public void migrate(Context context) throws Exception {
        JdbcTemplate jdbc = new JdbcTemplate(new SingleConnectionDataSource(context.getConnection(), true));

        jdbc.query("SELECT id, payload FROM change_log WHERE resource_type = 'TASK'", (ResultSet rs) -> {
            UUID id = rs.getObject("id", UUID.class);
            String payload = rs.getString("payload");
            if (payload != null && !payload.isBlank()) {
                try {
                    JsonNode root = mapper.readTree(payload);
                    if (!root.isObject()) {
                        throw new FlywayException("change_log payload is not an object, id: " + id);
                    }
                    ObjectNode node = (ObjectNode) root;
                    if (node.has("cognitiveLoad")) {
                        node.remove("cognitiveLoad");
                        jdbc.update("UPDATE change_log SET payload = ? WHERE id = ?", node.toString(), id);
                    }
                } catch (FlywayException e) {
                    throw e;
                } catch (Exception e) {
                    throw new FlywayException("Failed to parse change_log JSON, id: " + id, e);
                }
            }
        });

        jdbc.query("SELECT id, current_payload FROM inbound_mutations WHERE resource_type = 'TASK' AND current_payload IS NOT NULL", (ResultSet rs) -> {
            UUID id = rs.getObject("id", UUID.class);
            String payload = rs.getString("current_payload");
            if (!payload.isBlank()) {
                try {
                    JsonNode root = mapper.readTree(payload);
                    if (!root.isObject()) {
                        throw new FlywayException("inbound_mutations current_payload is not an object, id: " + id);
                    }
                    ObjectNode node = (ObjectNode) root;
                    if (node.has("cognitiveLoad")) {
                        node.remove("cognitiveLoad");
                        jdbc.update("UPDATE inbound_mutations SET current_payload = ? WHERE id = ?", node.toString(), id);
                    }
                } catch (FlywayException e) {
                    throw e;
                } catch (Exception e) {
                    throw new FlywayException("Failed to parse inbound_mutations JSON, id: " + id, e);
                }
            }
        });

        jdbc.execute("ALTER TABLE tasks DROP CONSTRAINT IF EXISTS ck_tasks_cognitive_load");
        jdbc.execute("ALTER TABLE tasks DROP COLUMN IF EXISTS cognitive_load");
    }
}
