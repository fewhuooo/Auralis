package com.auralis.app.sync.internal.persistence;

import java.util.UUID;

public interface InboundMutationRepositoryCustom {

    int reserve(
            UUID id,
            UUID userId,
            UUID serverDeviceId,
            String clientMutationId,
            String requestHash,
            String resourceType,
            UUID resourceId,
            String mutationType);
}
