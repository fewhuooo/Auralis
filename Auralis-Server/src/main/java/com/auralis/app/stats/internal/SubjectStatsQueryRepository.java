package com.auralis.app.stats.internal;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Repository
public class SubjectStatsQueryRepository {
    private final JdbcTemplate jdbcTemplate;

    public SubjectStatsQueryRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public SourceCounts sourceCounts(UUID userId, UUID subjectId) {
        return jdbcTemplate.queryForObject("select "
                        + "coalesce(sum(case when src.type = 'FILE' then 1 else 0 end), 0), "
                        + "coalesce(sum(case when src.type = 'TEXT' then 1 else 0 end), 0), "
                        + "coalesce(sum(case when src.type = 'URL' then 1 else 0 end), 0) "
                        + "from sources src join subjects s on s.id = src.subject_id and s.user_id = src.user_id "
                        + "where src.user_id = ? and src.subject_id = ? and src.deleted_at is null and s.deleted_at is null",
                (resultSet, row) -> new SourceCounts(resultSet.getLong(1), resultSet.getLong(2), resultSet.getLong(3)),
                userId, subjectId);
    }

    public TaskCounts taskCounts(UUID userId, UUID subjectId) {
        return jdbcTemplate.queryForObject("select count(*), "
                        + "coalesce(sum(case when t.status = 'TODO' then 1 else 0 end), 0), "
                        + "coalesce(sum(case when t.status = 'IN_PROGRESS' then 1 else 0 end), 0), "
                        + "coalesce(sum(case when t.status = 'DONE' then 1 else 0 end), 0), "
                        + "coalesce(sum(case when t.status = 'CANCELLED' then 1 else 0 end), 0) "
                        + "from tasks t join subjects s on s.id = t.subject_id and s.user_id = t.user_id "
                        + "where t.user_id = ? and t.subject_id = ? and t.deleted_at is null and s.deleted_at is null",
                (resultSet, row) -> new TaskCounts(resultSet.getLong(1), resultSet.getLong(2), resultSet.getLong(3),
                        resultSet.getLong(4), resultSet.getLong(5)), userId, subjectId);
    }

    public ReviewPlanCounts reviewPlanCounts(UUID userId, UUID subjectId, Instant at) {
        return jdbcTemplate.queryForObject("select count(*), "
                        + "coalesce(sum(case when rs.id is null then 1 else 0 end), 0), "
                        + "coalesce(sum(case when rs.id is null or rs.needs_learning = true then 1 else 0 end), 0), "
                        + "coalesce(sum(case when rs.id is not null and rs.needs_learning = false and rs.mastered = false then 1 else 0 end), 0), "
                        + "coalesce(sum(case when rs.mastered = true then 1 else 0 end), 0), "
                        + "coalesce(sum(case when rs.id is not null and rs.needs_learning = false and rs.mastered = false and rs.due_at <= ? then 1 else 0 end), 0), "
                        + "coalesce(sum(case when rs.id is not null and rs.needs_learning = false and rs.mastered = false and rs.due_at > ? then 1 else 0 end), 0) "
                        + "from knowledge_blocks kb "
                        + "join subjects s on s.id = kb.subject_id and s.user_id = kb.user_id "
                        + "left join review_states rs on rs.user_id = kb.user_id and rs.knowledge_block_id = kb.id "
                        + "where kb.user_id = ? and kb.subject_id = ? and kb.deleted_at is null and s.deleted_at is null",
                (resultSet, row) -> new ReviewPlanCounts(resultSet.getLong(1), resultSet.getLong(2),
                        resultSet.getLong(3), resultSet.getLong(4), resultSet.getLong(5),
                        resultSet.getLong(6), resultSet.getLong(7)), Timestamp.from(at), Timestamp.from(at),
                userId, subjectId);
    }

    public List<ReviewDay> reviewDays(UUID userId, UUID subjectId, List<DayRange> dayRanges) {
        StringBuilder sql = new StringBuilder("select ");
        List<Object> arguments = new ArrayList<>();
        for (int index = 0; index < dayRanges.size(); index++) {
            DayRange range = dayRanges.get(index);
            appendReviewMetric(sql, arguments, range, "count(case when %s then 1 end)");
            appendReviewMetric(sql, arguments, range,
                    "count(distinct case when %s then ri.knowledge_block_id end)");
            sql.append(", 0");
            appendReviewMetric(sql, arguments, range,
                    "count(distinct case when %s then ri.knowledge_block_id end)");
        }
        Instant rangeStart = dayRanges.getFirst().start();
        Instant rangeEnd = dayRanges.getLast().end();
        sql.append(" from review_lifecycle_reviews ri join knowledge_blocks kb "
                + "on kb.id = ri.knowledge_block_id and kb.user_id = ri.user_id "
                + "join subjects s on s.id = kb.subject_id and s.user_id = kb.user_id "
                + "where ri.user_id = ? and kb.user_id = ? and kb.subject_id = ? "
                + "and s.deleted_at is null and ri.effective_rating is not null and ri.selected_at >= ? and ri.selected_at < ?");
        arguments.add(userId);
        arguments.add(userId);
        arguments.add(subjectId);
        arguments.add(Timestamp.from(rangeStart));
        arguments.add(Timestamp.from(rangeEnd));

        return jdbcTemplate.query(sql.toString(), resultSet -> {
            resultSet.next();
            List<ReviewDay> values = new ArrayList<>(dayRanges.size());
            for (int index = 0; index < dayRanges.size(); index++) {
                int firstColumn = index * 4 + 1;
                values.add(new ReviewDay(resultSet.getLong(firstColumn), resultSet.getLong(firstColumn + 1),
                        resultSet.getLong(firstColumn + 2), resultSet.getLong(firstColumn + 3)));
            }
            return List.copyOf(values);
        }, arguments.toArray());
    }

    public List<Long> createdKnowledgeCounts(UUID userId, UUID subjectId, List<DayRange> dayRanges) {
        StringBuilder sql = new StringBuilder("select ");
        List<Object> arguments = new ArrayList<>();
        appendDailyCounts(sql, arguments, dayRanges, "kb.created_at");
        sql.append(" from knowledge_blocks kb join subjects s on s.id = kb.subject_id and s.user_id = kb.user_id "
                + "where kb.user_id = ? and kb.subject_id = ? and s.deleted_at is null "
                + "and kb.created_at >= ? and kb.created_at < ?");
        addDailyOuterRange(arguments, userId, subjectId, dayRanges);
        return dailyValues(sql.toString(), arguments, dayRanges.size());
    }

    public List<Long> completedTaskCounts(UUID userId, UUID subjectId, List<DayRange> dayRanges) {
        StringBuilder sql = new StringBuilder("select ");
        List<Object> arguments = new ArrayList<>();
        appendDailyCounts(sql, arguments, dayRanges, "t.completed_at");
        sql.append(" from tasks t join subjects s on s.id = t.subject_id and s.user_id = t.user_id "
                + "where t.user_id = ? and t.subject_id = ? and t.status = 'DONE' and s.deleted_at is null "
                + "and t.completed_at is not null and t.completed_at >= ? and t.completed_at < ?");
        addDailyOuterRange(arguments, userId, subjectId, dayRanges);
        return dailyValues(sql.toString(), arguments, dayRanges.size());
    }

    public RatingCounts ratingCounts(UUID userId, UUID subjectId, Instant from, Instant to) {
        return jdbcTemplate.queryForObject("select "
                        + "coalesce(sum(case when re.effective_rating = 'AGAIN' then 1 else 0 end), 0), "
                        + "coalesce(sum(case when re.effective_rating = 'HARD' then 1 else 0 end), 0), "
                        + "coalesce(sum(case when re.effective_rating = 'GOOD' then 1 else 0 end), 0), "
                        + "0 "
                        + "from review_lifecycle_reviews re join knowledge_blocks kb "
                        + "on kb.id = re.knowledge_block_id and kb.user_id = re.user_id "
                        + "join subjects s on s.id = kb.subject_id and s.user_id = kb.user_id "
                        + "where re.user_id = ? and kb.user_id = ? and kb.subject_id = ? and s.deleted_at is null "
                        + "and re.effective_rating is not null and re.selected_at >= ? and re.selected_at < ?",
                (resultSet, row) -> new RatingCounts(resultSet.getLong(1), resultSet.getLong(2),
                        resultSet.getLong(3), resultSet.getLong(4)),
                userId, userId, subjectId, Timestamp.from(from), Timestamp.from(to));
    }

    public List<LearningDay> learningDays(UUID userId, UUID subjectId, List<DayRange> dayRanges) {
        StringBuilder sql = new StringBuilder("select ");
        List<Object> arguments = new ArrayList<>();
        for (int index = 0; index < dayRanges.size(); index++) {
            if (index > 0) sql.append(", ");
            DayRange range = dayRanges.get(index);
            sql.append("count(case when cmd.occurred_at >= ? and cmd.occurred_at < ? then 1 end), ")
                    .append("count(distinct case when cmd.occurred_at >= ? and cmd.occurred_at < ? then cmd.knowledge_block_id end)");
            arguments.add(Timestamp.from(range.start()));
            arguments.add(Timestamp.from(range.end()));
            arguments.add(Timestamp.from(range.start()));
            arguments.add(Timestamp.from(range.end()));
        }
        sql.append(" from review_lifecycle_commands cmd join knowledge_blocks kb "
                + "on kb.id = cmd.knowledge_block_id and kb.user_id = cmd.user_id "
                + "join subjects s on s.id = kb.subject_id and s.user_id = kb.user_id "
                + "where cmd.user_id = ? and kb.user_id = ? and kb.subject_id = ? "
                + "and cmd.action = 'LEARNING_COMPLETED' and s.deleted_at is null "
                + "and cmd.occurred_at >= ? and cmd.occurred_at < ?");
        arguments.add(userId);
        arguments.add(userId);
        arguments.add(subjectId);
        arguments.add(Timestamp.from(dayRanges.getFirst().start()));
        arguments.add(Timestamp.from(dayRanges.getLast().end()));
        return jdbcTemplate.query(sql.toString(), resultSet -> {
            resultSet.next();
            List<LearningDay> values = new ArrayList<>(dayRanges.size());
            for (int index = 0; index < dayRanges.size(); index++) {
                values.add(new LearningDay(resultSet.getLong(index * 2 + 1), resultSet.getLong(index * 2 + 2)));
            }
            return List.copyOf(values);
        }, arguments.toArray());
    }

    private void appendReviewMetric(StringBuilder sql, List<Object> arguments, DayRange range, String template) {
        if (!arguments.isEmpty()) {
            sql.append(", ");
        }
        sql.append(template.formatted("ri.selected_at >= ? and ri.selected_at < ?"));
        arguments.add(Timestamp.from(range.start()));
        arguments.add(Timestamp.from(range.end()));
    }

    private void appendDailyCounts(StringBuilder sql, List<Object> arguments,
                                   List<DayRange> dayRanges, String timestampColumn) {
        for (int index = 0; index < dayRanges.size(); index++) {
            if (index > 0) {
                sql.append(", ");
            }
            sql.append("count(case when ").append(timestampColumn).append(" >= ? and ")
                    .append(timestampColumn).append(" < ? then 1 end)");
            arguments.add(Timestamp.from(dayRanges.get(index).start()));
            arguments.add(Timestamp.from(dayRanges.get(index).end()));
        }
    }

    private void addDailyOuterRange(List<Object> arguments, UUID userId, UUID subjectId,
                                   List<DayRange> dayRanges) {
        arguments.add(userId);
        arguments.add(subjectId);
        arguments.add(Timestamp.from(dayRanges.getFirst().start()));
        arguments.add(Timestamp.from(dayRanges.getLast().end()));
    }

    private List<Long> dailyValues(String sql, List<Object> arguments, int dayCount) {
        return jdbcTemplate.query(sql, resultSet -> {
            resultSet.next();
            List<Long> values = new ArrayList<>(dayCount);
            for (int index = 1; index <= dayCount; index++) {
                values.add(resultSet.getLong(index));
            }
            return List.copyOf(values);
        }, arguments.toArray());
    }

    public record DayRange(LocalDate date, Instant start, Instant end) { }
    public record SourceCounts(long fileCount, long textCount, long urlCount) { }
    public record TaskCounts(long activeTaskCount, long todoTaskCount, long inProgressTaskCount,
                             long doneTaskCount, long cancelledTaskCount) { }
    public record ReviewPlanCounts(long activeKnowledgeBlockCount, long newLearningCount,
                                   long pendingLearningCount, long reviewingCount, long masteredCount,
                                   long dueReviewCount, long scheduledReviewCount) { }
    public record ReviewDay(long nonSkipEventCount, long distinctReviewedKnowledgeBlockCount,
                            long firstLearningKnowledgeBlockCount, long subsequentReviewKnowledgeBlockCount) { }
    public record LearningDay(long learningCompletionCount, long distinctStudiedKnowledgeBlockCount) { }
    public record RatingCounts(long againCount, long hardCount, long goodCount, long easyCount) { }
}
