package com.auralis.app.source;

public enum SourceIngestionStatus {
    AWAITING_CLIENT,
    VALIDATING,
    PENDING,
    PARSING,
    INDEXING,
    READY,
    FAILED
}
