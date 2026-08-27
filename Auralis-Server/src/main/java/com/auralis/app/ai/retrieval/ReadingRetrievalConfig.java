package com.auralis.app.ai.retrieval;

/** Fixed server-side thresholds for deterministic reading scope decisions. */
public record ReadingRetrievalConfig(
        int minimumCurrentResults,
        int maximumSubjectSources,
        int minimumTitleLength) {

    public ReadingRetrievalConfig {
        if (minimumCurrentResults < 0 || maximumSubjectSources < 1 || minimumTitleLength < 1) {
            throw new IllegalArgumentException("Reading retrieval thresholds are invalid");
        }
    }

    public static ReadingRetrievalConfig defaults() {
        return new ReadingRetrievalConfig(1, 8, 3);
    }
}
