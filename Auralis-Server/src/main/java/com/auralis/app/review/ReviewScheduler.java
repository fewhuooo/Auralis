package com.auralis.app.review;

import java.time.Instant;

public interface ReviewScheduler {
    ScheduledReview schedule(StateSnapshot current, ReviewRating rating, Instant reviewedAt);

    record StateSnapshot(double difficulty, double stability, int reps, int lapses, Instant dueAt) {
    }

    record ScheduledReview(double difficulty, double stability, Instant dueAt, int reps, int lapses) {
    }
}
