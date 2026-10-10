package com.auralis.app.shared.domain;

import java.util.UUID;

public record KnowledgeBlockContentChangedEvent(UUID userId, UUID knowledgeBlockId, String contentHash) { }
