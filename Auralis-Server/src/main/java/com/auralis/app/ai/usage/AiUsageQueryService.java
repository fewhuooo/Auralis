package com.auralis.app.ai.usage;

import java.util.UUID;

public interface AiUsageQueryService {

    AiUsageSnapshot snapshotForUser(UUID userId);
}
