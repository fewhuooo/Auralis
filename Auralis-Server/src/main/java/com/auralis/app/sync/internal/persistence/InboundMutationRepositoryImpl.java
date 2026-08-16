package com.auralis.app.sync.internal.persistence;

import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.UUID;

@Repository
public class InboundMutationRepositoryImpl implements InboundMutationRepositoryCustom {

    private final JdbcTemplate jdbcTemplate;
    private final boolean postgres;

    public InboundMutationRepositoryImpl(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
        this.postgres = isPostgres(jdbcTemplate);
    }

    @Override
    public int reserve(
            UUID id,
            UUID userId,
            UUID deviceId,
            String clientMutationId,
            String requestHash,
            String resourceType,
            UUID resourceId,
            String mutationType) {
        String sql = """
                INSERT INTO inbound_mutations (
                    id, user_id, device_id, client_mutation_id, request_hash, decision,
                    resource_type, resource_id, mutation_type, change_cursor, current_payload,
                    error_code, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, 'PROCESSING', ?, ?, ?, NULL, NULL, NULL,
                    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                """;
        if (postgres) {
            sql += " ON CONFLICT (user_id, device_id, client_mutation_id) DO NOTHING";
        }
        try {
            return jdbcTemplate.update(sql, id, userId, deviceId, clientMutationId, requestHash,
                    resourceType, resourceId, mutationType);
        } catch (DuplicateKeyException exception) {
            if (postgres) {
                throw exception;
            }
            Integer existing = jdbcTemplate.queryForObject("""
                    select count(*) from inbound_mutations
                    where user_id = ? and device_id = ? and client_mutation_id = ?
                    """, Integer.class, userId, deviceId, clientMutationId);
            if (existing != null && existing > 0) {
                return 0;
            }
            throw exception;
        }
    }

    private boolean isPostgres(JdbcTemplate template) {
        try (var connection = template.getDataSource().getConnection()) {
            return connection.getMetaData().getDatabaseProductName().toLowerCase().contains("postgres");
        } catch (Exception exception) {
            throw new IllegalStateException("Database product could not be determined", exception);
        }
    }
}
