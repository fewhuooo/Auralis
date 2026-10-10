package com.auralis.app.stats;

import com.auralis.app.shared.error.DomainException;
import com.auralis.app.stats.internal.StatsQueryRepository;
import com.auralis.app.stats.internal.SubjectStatsQueryRepository;
import com.auralis.app.subject.SubjectService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.DateTimeException;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;

@Service
public class StatsService {
    private final StatsQueryRepository queryRepository;
    private final SubjectStatsQueryRepository subjectStatsQueryRepository;
    private final SubjectService subjectService;

    public StatsService(StatsQueryRepository queryRepository,
                        SubjectStatsQueryRepository subjectStatsQueryRepository,
                        SubjectService subjectService) {
        this.queryRepository = queryRepository;
        this.subjectStatsQueryRepository = subjectStatsQueryRepository;
        this.subjectService = subjectService;
    }

    @Transactional(readOnly = true)
    public StatsOverviewView overview(UUID userId, Instant at) {
        return new StatsOverviewView(
                queryRepository.activeKnowledgeBlocks(userId),
                queryRepository.activeTasks(userId),
                queryRepository.dueReviews(userId, at),
                queryRepository.completedReviews(userId, at),
                queryRepository.activeSources(userId),
                queryRepository.focusSecondsUntil(userId, at),
                queryRepository.focusCompletedCountUntil(userId, at));
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
                    queryRepository.createdKnowledge(userId, start, end),
                    queryRepository.focusSeconds(userId, start, end),
                    queryRepository.focusCompletedCount(userId, start, end));
        }).toList();
        return new WeeklyStatsView(values);
    }

    @Transactional(readOnly = true, isolation = org.springframework.transaction.annotation.Isolation.REPEATABLE_READ)
    public SubjectStatsView subject(UUID userId, UUID subjectId, int days, String timeZone) {
        if (days != 7 && days != 30) {
            throw new DomainException("VALIDATION_FAILED", "days must be 7 or 30");
        }
        ZoneId zone = requireIanaTimeZone(timeZone);
        subjectService.requireActiveSubject(userId, subjectId);

        Instant generatedAt = Instant.now();
        LocalDate to = generatedAt.atZone(zone).toLocalDate();
        LocalDate from = to.minusDays(days - 1L);
        List<SubjectStatsQueryRepository.DayRange> dayRanges = java.util.stream.IntStream.range(0, days)
                .mapToObj(offset -> {
                    LocalDate date = from.plusDays(offset);
                    return new SubjectStatsQueryRepository.DayRange(date,
                            date.atStartOfDay(zone).toInstant(), date.plusDays(1).atStartOfDay(zone).toInstant());
                })
                .toList();

        var sourceCounts = subjectStatsQueryRepository.sourceCounts(userId, subjectId);
        var taskCounts = subjectStatsQueryRepository.taskCounts(userId, subjectId);
        var reviewPlanCounts = subjectStatsQueryRepository.reviewPlanCounts(userId, subjectId, generatedAt);
        List<SubjectStatsQueryRepository.ReviewDay> reviewDays =
                subjectStatsQueryRepository.reviewDays(userId, subjectId, dayRanges);
        List<SubjectStatsQueryRepository.LearningDay> learningDays =
                subjectStatsQueryRepository.learningDays(userId, subjectId, dayRanges);
        List<Long> createdKnowledgeCounts =
                subjectStatsQueryRepository.createdKnowledgeCounts(userId, subjectId, dayRanges);
        List<Long> completedTaskCounts =
                subjectStatsQueryRepository.completedTaskCounts(userId, subjectId, dayRanges);
        var ratingCounts = subjectStatsQueryRepository.ratingCounts(
                userId, subjectId, dayRanges.getFirst().start(), dayRanges.getLast().end());

        SubjectStatsView.Overview overview = new SubjectStatsView.Overview(
                sourceCounts.fileCount(), sourceCounts.textCount(), sourceCounts.urlCount(),
                reviewPlanCounts.activeKnowledgeBlockCount(), taskCounts.activeTaskCount(),
                taskCounts.todoTaskCount(), taskCounts.inProgressTaskCount(), taskCounts.doneTaskCount(),
                taskCounts.cancelledTaskCount(), reviewPlanCounts.newLearningCount(),
                reviewPlanCounts.dueReviewCount(), reviewPlanCounts.scheduledReviewCount(),
                reviewPlanCounts.pendingLearningCount(), reviewPlanCounts.reviewingCount(),
                reviewPlanCounts.masteredCount());
        List<SubjectStatsView.Daily> daily = java.util.stream.IntStream.range(0, days)
                .mapToObj(index -> {
                    var reviewDay = reviewDays.get(index);
                    return new SubjectStatsView.Daily(dayRanges.get(index).date(), reviewDay.nonSkipEventCount(),
                            reviewDay.distinctReviewedKnowledgeBlockCount(), reviewDay.firstLearningKnowledgeBlockCount(),
                            reviewDay.subsequentReviewKnowledgeBlockCount(), createdKnowledgeCounts.get(index),
                            completedTaskCounts.get(index), learningDays.get(index).learningCompletionCount(),
                            learningDays.get(index).distinctStudiedKnowledgeBlockCount());
                }).toList();
        return new SubjectStatsView(subjectId, generatedAt, zone.getId(), from, to, overview, daily,
                new SubjectStatsView.RatingCounts(ratingCounts.againCount(), ratingCounts.hardCount(),
                        ratingCounts.goodCount(), ratingCounts.easyCount()));
    }

    private ZoneId requireIanaTimeZone(String timeZone) {
        if (timeZone == null || !ZoneId.getAvailableZoneIds().contains(timeZone)) {
            throw new DomainException("VALIDATION_FAILED", "timeZone must be an IANA time zone");
        }
        try {
            return ZoneId.of(timeZone);
        } catch (DateTimeException exception) {
            throw new DomainException("VALIDATION_FAILED", "timeZone must be an IANA time zone");
        }
    }
}
