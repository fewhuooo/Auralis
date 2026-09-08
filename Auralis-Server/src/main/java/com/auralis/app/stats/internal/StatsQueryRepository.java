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
                + "where rs.user_id = ? and rs.due_at <= ? and kb.user_id = ? and kb.deleted_at is null", userId, at, userId);
    }

    public long completedReviews(UUID userId, Instant at) {
        return count("select count(*) from review_events where user_id = ? and reviewed_at <= ? and rating <> 'SKIP'", userId, at);
    }

    public long reviewed(UUID userId, Instant from, Instant to) {
        return count("select count(*) from review_events where user_id = ? and reviewed_at >= ? and reviewed_at < ? and rating <> 'SKIP'",
                userId, from, to);
    }

    public long studySeconds(UUID userId, Instant from, Instant to) {
        return count("select coalesce(sum(duration_seconds), 0) from review_events where user_id = ? and reviewed_at >= ? and reviewed_at < ?",
                userId, from, to);
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
