package com.auralis.app.shared.domain;

import java.util.UUID;

public record KnowledgeBlockSubjectChangedEvent(UUID userId, UUID knowledgeBlockId) { }
