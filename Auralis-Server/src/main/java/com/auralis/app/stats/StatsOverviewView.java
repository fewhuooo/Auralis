package com.auralis.app.stats;

public record StatsOverviewView(
        long activeKnowledgeBlocks,
        long activeTasks,
        long dueReviews,
        long completedReviewEvents,
        long activeSources) {
}
