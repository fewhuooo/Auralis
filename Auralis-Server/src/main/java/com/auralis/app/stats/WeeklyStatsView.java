package com.auralis.app.stats;

import java.time.LocalDate;
import java.util.List;

public record WeeklyStatsView(List<Day> days) {
    public record Day(LocalDate date, long reviewedCount, long studySeconds, long completedTaskCount,
                      long createdKnowledgeCount, long focusSeconds, long focusCompletedCount) {
    }
}
