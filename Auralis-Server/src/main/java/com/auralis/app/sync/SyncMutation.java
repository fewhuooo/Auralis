package com.auralis.app.sync;

import com.fasterxml.jackson.databind.JsonNode;

import java.util.UUID;

public record SyncMutation(
        String clientMutationId,
        SyncResourceType resourceType,
        UUID resourceId,
        SyncMutationType mutationType,
        long baseVersion,
        JsonNode payload) {
}
