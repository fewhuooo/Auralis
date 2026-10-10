package com.auralis.app.stats;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public record SubjectStatsView(
        UUID subjectId,
        Instant generatedAt,
        String timeZone,
        LocalDate from,
        LocalDate to,
        Overview overview,
        List<Daily> daily,
        RatingCounts ratingCounts) {

    public SubjectStatsView {
        daily = List.copyOf(daily);
    }

    public record Overview(
            long fileSourceCount,
            long textSourceCount,
            long urlSourceCount,
            long activeKnowledgeBlockCount,
            long activeTaskCount,
            long todoTaskCount,
            long inProgressTaskCount,
            long doneTaskCount,
            long cancelledTaskCount,
            long newLearningCount,
            long dueReviewCount,
            long scheduledReviewCount,
            long pendingLearningCount,
            long reviewingCount,
            long masteredCount) { }

    public record Daily(
            LocalDate date,
            long nonSkipReviewEventCount,
            long distinctReviewedKnowledgeBlockCount,
            long firstLearningKnowledgeBlockCount,
            long subsequentReviewKnowledgeBlockCount,
            long createdKnowledgeBlockCount,
            long completedTaskCount,
            long learningCompletionCount,
            long distinctStudiedKnowledgeBlockCount) { }

    public record RatingCounts(long againCount, long hardCount, long goodCount, long easyCount) { }
}
