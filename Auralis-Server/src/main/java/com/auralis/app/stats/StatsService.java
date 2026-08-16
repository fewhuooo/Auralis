package com.auralis.app.stats;

import com.auralis.app.shared.error.DomainException;
import com.auralis.app.stats.internal.StatsQueryRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;

@Service
public class StatsService {
    private final StatsQueryRepository queryRepository;

    public StatsService(StatsQueryRepository queryRepository) {
        this.queryRepository = queryRepository;
    }

    @Transactional(readOnly = true)
    public StatsOverviewView overview(UUID userId, Instant at) {
        return new StatsOverviewView(
                queryRepository.activeKnowledgeBlocks(userId),
                queryRepository.activeTasks(userId),
                queryRepository.dueReviews(userId, at),
                queryRepository.completedReviews(userId, at),
                queryRepository.activeSources(userId));
    }

    @Transactional(readOnly = true)
    public WeeklyStatsView weekly(UUID userId, LocalDate from, LocalDate to) {
        if (from == null || to == null || to.isBefore(from) || from.plusDays(6).isBefore(to)
                || to.plusDays(1).isBefore(from)) {
            throw new DomainException("VALIDATION_FAILED", "weekly range must contain at most seven days");
        }
        long days = java.time.temporal.ChronoUnit.DAYS.between(from, to) + 1;
        if (days != 7) {
            throw new DomainException("VALIDATION_FAILED", "weekly range must contain exactly seven days");
        }
        List<WeeklyStatsView.Day> values = java.util.stream.IntStream.range(0, 7).mapToObj(offset -> {
            LocalDate date = from.plusDays(offset);
            Instant start = date.atStartOfDay().toInstant(ZoneOffset.UTC);
            Instant end = date.plusDays(1).atStartOfDay().toInstant(ZoneOffset.UTC);
            return new WeeklyStatsView.Day(date,
                    queryRepository.reviewed(userId, start, end),
                    queryRepository.studySeconds(userId, start, end),
                    queryRepository.completedTasks(userId, start, end),
                    queryRepository.createdKnowledge(userId, start, end));
        }).toList();
        return new WeeklyStatsView(values);
    }
}
