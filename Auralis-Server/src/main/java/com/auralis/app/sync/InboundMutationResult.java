package com.auralis.app.sync;

import java.time.Instant;
import java.util.UUID;

public record InboundMutationResult(
        UUID id,
        MutationDecision decision,
        SyncResourceType resourceType,
        UUID resourceId,
        SyncMutationType mutationType,
        SyncCursor changeCursor,
        String currentPayload,
        String errorCode,
        Instant createdAt) {
}
