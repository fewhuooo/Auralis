package com.studycore.server.common;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.io.Serializable;

/**
 * 14.5 Sync event payload published to Redis and broadcast via WebSocket.
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class SyncEvent implements Serializable {
    /** Event type: "block_created", "block_updated", "block_deleted", "task_created", etc. */
    private String type;
    /** Entity type: "blocks" or "tasks" */
    private String entity;
    /** Entity ID */
    private String entityId;
    /** JSON payload of the entity (for create/update), null for delete */
    private String data;
    /** Timestamp in millis */
    private long timestamp;

    public static SyncEvent of(String type, String entity, String entityId, String data) {
        return new SyncEvent(type, entity, entityId, data, System.currentTimeMillis());
    }
}
