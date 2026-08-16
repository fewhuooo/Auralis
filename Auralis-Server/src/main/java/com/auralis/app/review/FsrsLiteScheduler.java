package com.auralis.app.review;

import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.Instant;

@Component
public class FsrsLiteScheduler implements ReviewScheduler {
    @Override
    public ScheduledReview schedule(StateSnapshot current, ReviewRating rating, Instant reviewedAt) {
        double difficulty = current == null ? 5.0 : current.difficulty();
        double stability = current == null ? 0.0 : current.stability();
        int reps = current == null ? 0 : current.reps();
        int lapses = current == null ? 0 : current.lapses();
        double days;
        switch (rating) {
            case AGAIN -> { difficulty = clamp(difficulty + 0.8); stability = Math.max(0.5, stability * 0.35); days = 10.0 / 1440.0; lapses++; }
            case HARD -> { difficulty = clamp(difficulty + 0.15); stability = Math.max(1.0, stability * 1.2 + 0.4); days = Math.max(1.0, stability * 0.8); reps++; }
            case GOOD -> { difficulty = clamp(difficulty - 0.05); stability = Math.max(2.0, stability * 2.0 + 1.0); days = Math.max(1.0, stability); reps++; }
            case EASY -> { difficulty = clamp(difficulty - 0.3); stability = Math.max(3.0, stability * 3.0 + 2.0); days = Math.max(2.0, stability * 1.5); reps++; }
            case SKIP -> { return current == null ? null : new ScheduledReview(
                    current.difficulty(), current.stability(), current.dueAt(), current.reps(), current.lapses()); }
            default -> throw new IllegalArgumentException("Unsupported review rating");
        }
        return new ScheduledReview(round(difficulty), round(stability),
                reviewedAt.plus(Duration.ofSeconds(Math.round(days * 86_400))), reps, lapses);
    }

    private double clamp(double value) { return Math.max(1.0, Math.min(10.0, value)); }
    private double round(double value) { return Math.round(value * 1000.0) / 1000.0; }
}
