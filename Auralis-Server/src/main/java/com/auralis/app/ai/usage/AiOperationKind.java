package com.auralis.app.ai.usage;

/** Server-owned accounting identity for a bounded AI operation. */
public enum AiOperationKind {
    CHAT_AGENT_TURN,
    TEXT_GENERATION,
    CHAT_TURN,
    SOURCE_OVERVIEW,
    SUBJECT_OVERVIEW,
    INGESTION_EMBEDDING,
    PROVIDER_SETUP,
    LEARNING_TURN,
    LEARNING_DRAFT
}
