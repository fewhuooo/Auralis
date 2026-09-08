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

public final class V21__remove_task_color extends BaseJavaMigration {

    private final ObjectMapper mapper = new ObjectMapper();

    @Override
    public void migrate(Context context) throws Exception {
        JdbcTemplate jdbc = new JdbcTemplate(new SingleConnectionDataSource(context.getConnection(), true));
        jdbc.query("SELECT id, payload FROM change_log WHERE resource_type = 'TASK' AND payload IS NOT NULL", (org.springframework.jdbc.core.RowCallbackHandler) rs ->
                processRow(jdbc, rs, "change_log", "payload"));
        jdbc.query("SELECT id, current_payload FROM inbound_mutations WHERE resource_type = 'TASK' AND current_payload IS NOT NULL", (org.springframework.jdbc.core.RowCallbackHandler) rs ->
                processRow(jdbc, rs, "inbound_mutations", "current_payload"));
        jdbc.execute("ALTER TABLE tasks DROP COLUMN IF EXISTS color_override");
    }

    private void processRow(JdbcTemplate jdbc, ResultSet rs, String table, String column) {
        String id = rsString(rs, "id");
        String payload = rsString(rs, column);
        if (payload == null || payload.isBlank()) return;

        String cleaned;
        try {
            JsonNode tree = mapper.readTree(payload);
            if (!tree.isObject()) {
                throw new IllegalArgumentException("Expected JSON object but got " + tree.getNodeType());
            }
            ObjectNode node = (ObjectNode) tree;
            if (!node.has("colorOverride") && !node.has("color")) return;
            node.remove("colorOverride");
            node.remove("color");
            cleaned = node.toString();
        } catch (Exception e) {
            throw new FlywayException("Malformed JSON in " + table + "." + column + " for id " + id, e);
        }

        try {
            UUID rowId = UUID.fromString(id);
            jdbc.update("UPDATE " + table + " SET " + column + " = ? WHERE id = ?", cleaned, rowId);
        } catch (Exception e) {
            throw new FlywayException("Failed to update " + table + "." + column + " for id " + id, e);
        }
    }

    private String rsString(ResultSet rs, String column) {
        try {
            Object value = rs.getObject(column);
            return value == null ? null : String.valueOf(value);
        } catch (Exception e) {
            throw new FlywayException("Failed to read migration column " + column, e);
        }
    }
}
