package com.auralis.app.stats.internal;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.Arrays;
import java.util.UUID;

@Repository
public class StatsQueryRepository {
    private final JdbcTemplate jdbcTemplate;

    public StatsQueryRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public long activeKnowledgeBlocks(UUID userId) {
        return count("select count(*) from knowledge_blocks where user_id = ? and deleted_at is null", userId);
    }

    public long activeTasks(UUID userId) {
        return count("select count(*) from tasks where user_id = ? and deleted_at is null", userId);
    }

    public long activeSources(UUID userId) {
        return count("select count(*) from sources where user_id = ? and deleted_at is null", userId);
    }

    public long dueReviews(UUID userId, Instant at) {
        return count("select count(*) from review_states rs join knowledge_blocks kb on kb.id = rs.knowledge_block_id "
                + "where rs.user_id = ? and rs.due_at <= ? and rs.needs_learning = false and rs.mastered = false "
                + "and kb.user_id = ? and kb.deleted_at is null", userId, at, userId);
    }

    public long completedReviews(UUID userId, Instant at) {
        return count("select count(*) from review_lifecycle_reviews where user_id = ? and selected_at <= ? and effective_rating is not null", userId, at);
    }

    public long reviewed(UUID userId, Instant from, Instant to) {
        return count("select count(*) from review_lifecycle_reviews where user_id = ? and selected_at >= ? and selected_at < ? and effective_rating is not null",
                userId, from, to);
    }

    public long studySeconds(UUID userId, Instant from, Instant to) {
        return count("select coalesce(sum(duration_seconds), 0) from review_lifecycle_reviews where user_id = ? and selected_at >= ? and selected_at < ? and effective_rating is not null",
                userId, from, to);
    }

    public long focusSeconds(UUID userId, Instant from, Instant to) {
        return count("select coalesce(sum(duration_seconds), 0) from focus_sessions where user_id = ? and ended_at >= ? and ended_at < ?",
                userId, from, to);
    }

    public long focusCompletedCount(UUID userId, Instant from, Instant to) {
        return count("select count(*) from focus_sessions where user_id = ? and ended_at >= ? and ended_at < ? and completed = true",
                userId, from, to);
    }

    public long focusSecondsUntil(UUID userId, Instant at) {
        return count("select coalesce(sum(duration_seconds), 0) from focus_sessions where user_id = ? and ended_at <= ?",
                userId, at);
    }

    public long focusCompletedCountUntil(UUID userId, Instant at) {
        return count("select count(*) from focus_sessions where user_id = ? and ended_at <= ? and completed = true",
                userId, at);
    }

    public long completedTasks(UUID userId, Instant from, Instant to) {
        return count("select count(*) from tasks where user_id = ? and status = 'DONE' and completed_at >= ? and completed_at < ?",
                userId, from, to);
    }

    public long createdKnowledge(UUID userId, Instant from, Instant to) {
        return count("select count(*) from knowledge_blocks where user_id = ? and created_at >= ? and created_at < ?",
                userId, from, to);
    }

    private long count(String sql, Object... args) {
        Number value = jdbcTemplate.queryForObject(sql, Number.class, normalizeJdbcArguments(args));
        return value == null ? 0L : value.longValue();
    }

    private Object[] normalizeJdbcArguments(Object... args) {
        return Arrays.stream(args)
                .map(argument -> argument instanceof Instant instant ? Timestamp.from(instant) : argument)
                .toArray();
    }
}
