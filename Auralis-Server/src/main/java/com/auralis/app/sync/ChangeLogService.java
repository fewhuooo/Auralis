package com.auralis.app.sync;

import tools.jackson.core.JacksonException;
import tools.jackson.databind.ObjectMapper;
import com.auralis.app.shared.error.DomainException;
import io.micrometer.core.instrument.Counter;
import com.auralis.app.sync.internal.persistence.ChangeLogEntity;
import com.auralis.app.sync.internal.persistence.ChangeLogRepository;
import org.springframework.jdbc.core.JdbcTemplate;
import io.micrometer.core.instrument.MeterRegistry;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Service
public class ChangeLogService {

    private static final int MAX_PULL_LIMIT = 200;
    private static final Duration RETENTION = Duration.ofDays(30);

    private final ChangeLogRepository changeLogRepository;
    private final ObjectMapper objectMapper;
    private final Clock clock;
    private final JdbcTemplate jdbcTemplate;
    private final ChangeLogCapture changeLogCapture;
    private final boolean postgres;
    private final Counter resetRequired;

    public ChangeLogService(
            ChangeLogRepository changeLogRepository,
            ObjectMapper objectMapper,
            Clock clock,
            JdbcTemplate jdbcTemplate,
            ChangeLogCapture changeLogCapture,
            MeterRegistry meterRegistry) {
        this.changeLogRepository = changeLogRepository;
        this.objectMapper = objectMapper;
        this.clock = clock;
        this.jdbcTemplate = jdbcTemplate;
        this.changeLogCapture = changeLogCapture;
        this.postgres = isPostgres(jdbcTemplate);
        this.resetRequired = Counter.builder("auralis.sync.pull.reset_required")
                .description("Sync pulls that require a snapshot reset after cursor expiry")
                .register(meterRegistry);
    }

    @Transactional
    public ChangeLogEntry record(
            UUID userId,
            SyncResourceType resourceType,
            UUID resourceId,
            SyncMutationType mutationType,
            long version,
            Instant deletedAt,
            Object payload) {
        long nextCursor = nextCursor(userId);
        ChangeLogEntity entity = changeLogRepository.saveAndFlush(new ChangeLogEntity(
                UUID.randomUUID(), userId, nextCursor, resourceType, resourceId, mutationType,
                version, deletedAt, serialize(payload)));
        ChangeLogEntry entry = view(entity);
        changeLogCapture.add(entry);
        return entry;
    }

    @Transactional(readOnly = true)
    public ChangeLogPage pull(UUID userId, SyncCursor after, int requestedLimit) {
        int limit = Math.max(1, Math.min(requestedLimit, MAX_PULL_LIMIT));
        Instant cutoff = clock.instant().minus(RETENTION);
        long latest = latestCursor(userId).value();
        boolean resetRequired = after.value() < latest
                && changeLogRepository.findFirstByUserIdAndCreatedAtGreaterThanEqualOrderByCursorAsc(
                userId, cutoff)
                .map(first -> after.value() < first.getCursor() - 1)
                .orElse(true);
        if (resetRequired) {
            this.resetRequired.increment();
            return new ChangeLogPage(List.of(), after, false, true);
        }
        List<ChangeLogEntity> rows = changeLogRepository
                .findByUserIdAndCursorGreaterThanOrderByCursorAsc(userId, after.value(), PageRequest.of(0, limit + 1));
        boolean hasMore = rows.size() > limit;
        List<ChangeLogEntity> page = hasMore ? rows.subList(0, limit) : rows;
        SyncCursor next = page.isEmpty() ? after : new SyncCursor(page.get(page.size() - 1).getCursor());
        return new ChangeLogPage(page.stream().map(this::view).toList(), next, hasMore, false);
    }

    @Transactional(readOnly = true)
    public SyncCursor latestCursor(UUID userId) {
        List<Long> values = jdbcTemplate.query(
                "select cursor from sync_cursor_high_water where user_id = ?",
                (resultSet, rowNum) -> resultSet.getLong(1), userId);
        return new SyncCursor(values.isEmpty() ? 0L : values.getFirst());
    }

    @Transactional
    public long purgeExpired() {
        return changeLogRepository.deleteByCreatedAtBefore(clock.instant().minus(RETENTION));
    }

    private long nextCursor(UUID userId) {
        if (postgres) {
            jdbcTemplate.update("""
                    insert into sync_cursor_high_water(user_id, cursor) values (?, 0)
                    on conflict (user_id) do nothing
                    """, userId);
        } else {
            try {
                jdbcTemplate.update(
                        "insert into sync_cursor_high_water(user_id, cursor) values (?, 0)", userId);
            } catch (DuplicateKeyException ignored) {
                // A concurrent H2 transaction inserted the owner row; the row lock below is authoritative.
            }
        }
        Long current = jdbcTemplate.queryForObject(
                "select cursor from sync_cursor_high_water where user_id = ? for update",
                Long.class, userId);
        long next = (current == null ? 0L : current) + 1L;
        jdbcTemplate.update("update sync_cursor_high_water set cursor = ? where user_id = ?", next, userId);
        return next;
    }

    private boolean isPostgres(JdbcTemplate template) {
        try (var connection = template.getDataSource().getConnection()) {
            return connection.getMetaData().getDatabaseProductName().toLowerCase().contains("postgres");
        } catch (Exception exception) {
            throw new IllegalStateException("Database product could not be determined", exception);
        }
    }

    private String serialize(Object payload) {
        try {
            return objectMapper.writeValueAsString(payload);
        } catch (JacksonException exception) {
            throw new DomainException("INTERNAL_ERROR", "Change payload could not be serialized");
        }
    }

    private ChangeLogEntry view(ChangeLogEntity entity) {
        return new ChangeLogEntry(entity.getId(), entity.getUserId(), entity.getCursor(), entity.getResourceType(),
                entity.getResourceId(), entity.getMutationType(), entity.getVersion(), entity.getDeletedAt(),
                entity.getPayload(), entity.getCreatedAt());
    }
}
