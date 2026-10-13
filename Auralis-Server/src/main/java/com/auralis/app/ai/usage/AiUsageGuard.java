package com.auralis.app.ai.usage;

import com.auralis.app.ai.AiProviderType;
import com.auralis.app.shared.config.AuralisProperties;
import com.auralis.app.shared.error.DomainException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.HexFormat;
import java.util.Objects;
import java.util.UUID;

@Service
public class AiUsageGuard implements AiUsageQueryService {

    private final JdbcTemplate jdbc;
    private final TransactionTemplate transactions;
    private final Clock clock;
    private final AuralisProperties.Limits limits;

    @Autowired
    public AiUsageGuard(JdbcTemplate jdbc, PlatformTransactionManager transactionManager,
                        Clock clock, AuralisProperties properties) {
        this(jdbc, transactionManager, clock, properties.ai().limits());
    }

    AiUsageGuard(JdbcTemplate jdbc, PlatformTransactionManager transactionManager,
                 Clock clock, AuralisProperties.Limits limits) {
        this.jdbc = Objects.requireNonNull(jdbc);
        this.transactions = new TransactionTemplate(Objects.requireNonNull(transactionManager));
        this.transactions.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        this.clock = Objects.requireNonNull(clock);
        this.limits = Objects.requireNonNull(limits);
    }

    public TaskLease beginTask(AiTaskContext context) {
        Objects.requireNonNull(context);
        if (context.budgetTaskId() != null && !isOverview(context.feature())) {
            throw new IllegalArgumentException("Stable task budget ids are supported only for Overview features");
        }
        UUID overviewBudgetTaskId = context.budgetTaskId();
        String taskIdentity = overviewBudgetTaskId == null
                ? context.taskKey() : context.taskKey() + ":budget:" + overviewBudgetTaskId;
        String taskHash = sha256(context.userId() + ":" + context.feature() + ":" + taskIdentity);
        String userKey = "USER:" + context.userId();
        String taskKey = "TASK:" + taskHash;
        return transactions.execute(status -> {
            requireActiveUserLocked(context.userId());
            lockRow("GLOBAL");
            ensureLockRow(userKey, "USER", context.userId(), null, null);
            ensureLockRow(taskKey, "TASK", context.userId(), context.feature().name(), taskHash);
            lockRow(userKey);
            LockRow task = lockRow(taskKey);
            Instant now = clock.instant();
            expireReservations(now);
            if (task.leaseUntil() != null && task.leaseUntil().isAfter(now)) {
                throw limit("AI_CONCURRENCY_LIMIT", 429, task.leaseUntil());
            }
            UUID taskId = context.feature() == AiFeature.INGESTION
                    ? UUID.nameUUIDFromBytes((context.userId() + ":" + taskHash).getBytes(StandardCharsets.UTF_8))
                    : overviewBudgetTaskId == null ? UUID.randomUUID()
                    : stableOverviewTaskId(context.userId(), context.feature(), overviewBudgetTaskId);
            UUID ownerId = UUID.randomUUID();
            Instant leaseUntil = now.plusMillis(limits.reservationLeaseMillis());
            jdbc.update("update ai_usage_locks set feature=?, task_key_hash=?, current_task_id=?, owner_id=?, "
                            + "lease_until=?, updated_at=? where scope_key=?",
                    context.feature().name(), taskHash, taskId, ownerId,
                    sqlTimestamp(leaseUntil), sqlTimestamp(now), taskKey);
            return new TaskLease(context.userId(), context.feature(), taskHash, taskKey,
                    taskId, ownerId, leaseUntil);
        });
    }

    /** Reads cumulative safe reservation metrics for one stable Overview task across all retry attempts. */
    public OverviewTaskUsageSummary overviewTaskUsage(AiTaskContext context) {
        Objects.requireNonNull(context);
        if (!isOverview(context.feature()) || context.budgetTaskId() == null) {
            throw new IllegalArgumentException("A stable budget task id is required for Overview usage summaries");
        }
        UUID taskId = stableOverviewTaskId(context.userId(), context.feature(), context.budgetTaskId());
        return jdbc.queryForObject("select coalesce(sum(estimated_input_tokens),0) estimated_input_tokens,"
                        + "coalesce(sum(reserved_output_tokens),0) reserved_output_tokens,"
                        + "coalesce(sum(case when actual_input_tokens is not null then actual_input_tokens else 0 end),0) actual_input_tokens,"
                        + "coalesce(sum(case when actual_output_tokens is not null then actual_output_tokens else 0 end),0) actual_output_tokens,"
                        + "coalesce(sum(charged_tokens),0) charged_tokens,"
                        + "coalesce(sum(case when request_dispatched=true and (actual_input_tokens is null "
                        + "or actual_output_tokens is null) then 1 else 0 end),0) unknown_dispatched_calls,"
                        + "coalesce(sum(case when state='RESERVED' and request_dispatched=true then 1 else 0 end),0) "
                        + "active_dispatched_reservations from ai_usage_reservations where task_id=? and user_id=? and feature=?",
                (rs, rowNum) -> {
                    long unknown = rs.getLong("unknown_dispatched_calls");
                    long active = rs.getLong("active_dispatched_reservations");
                    boolean complete = unknown == 0 && active == 0;
                    return new OverviewTaskUsageSummary(rs.getLong("estimated_input_tokens"),
                            rs.getLong("reserved_output_tokens"), complete ? rs.getLong("actual_input_tokens") : null,
                            complete ? rs.getLong("actual_output_tokens") : null, rs.getLong("charged_tokens"),
                            unknown, active, complete);
                }, taskId, context.userId(), context.feature().name());
    }

    public CallReservation reserve(TaskLease task, AiStage stage, AiProviderType provider, String model,
                                  long estimatedInputTokens, long reservedOutputTokens) {
        Objects.requireNonNull(task);
        Objects.requireNonNull(stage);
        Objects.requireNonNull(provider);
        if (estimatedInputTokens < 0 || reservedOutputTokens < 0) {
            throw new IllegalArgumentException("Reserved token counts cannot be negative");
        }
        return transactions.execute(status -> {
            requireActiveUserLocked(task.userId());
            lockScopes(task);
            Instant now = clock.instant();
            requireTaskOwner(task, now);
            expireReservations(now);
            int activeGlobal = count("select count(*) from ai_usage_reservations where state='RESERVED' "
                    + "and lease_until > ?", sqlTimestamp(now));
            int activeUser = count("select count(*) from ai_usage_reservations where user_id=? "
                    + "and state='RESERVED' and lease_until > ?", task.userId(), sqlTimestamp(now));
            Instant activeReset = earliestActiveLease(now);
            if (activeGlobal >= limits.globalConcurrent() || activeUser >= limits.perUserConcurrent()) {
                throw limit("AI_CONCURRENCY_LIMIT", 429,
                        activeReset == null ? now.plusSeconds(1) : activeReset);
            }

            long requestedTokens = Math.addExact(estimatedInputTokens, reservedOutputTokens);
            long taskBudget = taskTokenLimit(task.feature());
            long taskUsed = sumTaskTokens(task.taskId());
            int taskCalls = count("select count(*) from ai_usage_reservations where task_id=? "
                    + "and (state='RESERVED' or request_dispatched=true)", task.taskId());
            if (taskCalls >= taskCallLimit(task.feature()) || requestedTokens > taskBudget - taskUsed) {
                throw new AiUsageLimitException("AI_TASK_BUDGET_EXCEEDED", 422, 0, null);
            }

            if (!isWindowQuotaExempt(stage)) {
                Instant hourStart = now.truncatedTo(ChronoUnit.HOURS);
                Instant dayStart = now.truncatedTo(ChronoUnit.DAYS);
                long hourly = sumUserWindow(task.userId(), hourStart, hourStart.plus(1, ChronoUnit.HOURS), now);
                if (requestedTokens > limits.perUserHourlyTokens() - hourly) {
                    throw limit("AI_HOURLY_QUOTA_EXCEEDED", 429, hourStart.plus(1, ChronoUnit.HOURS));
                }
                long daily = sumUserWindow(task.userId(), dayStart, dayStart.plus(1, ChronoUnit.DAYS), now);
                if (requestedTokens > limits.perUserDailyTokens() - daily) {
                    throw limit("AI_DAILY_QUOTA_EXCEEDED", 429, dayStart.plus(1, ChronoUnit.DAYS));
                }
                long globalDaily = sumGlobalWindow(dayStart, dayStart.plus(1, ChronoUnit.DAYS), now);
                if (requestedTokens > limits.globalDailyTokens() - globalDaily) {
                    throw limit("AI_GLOBAL_QUOTA_EXCEEDED", 503, dayStart.plus(1, ChronoUnit.DAYS));
                }
            }

            UUID id = UUID.randomUUID();
            Instant leaseUntil = now.plusMillis(limits.reservationLeaseMillis());
            jdbc.update("insert into ai_usage_reservations (id,task_id,user_id,feature,stage,provider,model,state,"
                            + "estimated_input_tokens,reserved_output_tokens,charged_tokens,request_dispatched,owner_id,"
                            + "lease_until,created_at) values (?,?,?,?,?,?,?,'RESERVED',?,?,0,false,?,?,?)",
                    id, task.taskId(), task.userId(), task.feature().name(), stage.name(), provider.name(),
                    model, estimatedInputTokens, reservedOutputTokens, task.ownerId(),
                    sqlTimestamp(leaseUntil), sqlTimestamp(now));
            return new CallReservation(id, task.taskId(), task.userId(), task.feature(), stage,
                    task.taskKeyHash(), task.taskLockKey(), task.ownerId(), estimatedInputTokens,
                    reservedOutputTokens, leaseUntil);
        });
    }

    public void markDispatched(TaskLease task, CallReservation call) {
        transactions.executeWithoutResult(status -> {
            requireActiveUserLocked(task.userId());
            lockScopes(task);
            Instant now = clock.instant();
            requireTaskOwner(task, now);
            int changed = jdbc.update("update ai_usage_reservations set request_dispatched=true "
                            + "where id=? and task_id=? and owner_id=? and state='RESERVED' and lease_until > ?",
                    call.id(), task.taskId(), task.ownerId(), sqlTimestamp(now));
            if (changed != 1) throw limit("AI_CONCURRENCY_LIMIT", 429, now.plusSeconds(1));
        });
    }

    public AiProviderUsage settle(TaskLease task, CallReservation call, AiTokenUsage rawUsage,
                                  boolean success, String errorCode) {
        return transactions.execute(status -> {
            lockScopesAllowDeletedUser(task);
            Instant now = clock.instant();
            ReservationRow row = reservation(call.id());
            if (!"RESERVED".equals(row.state())) return row.usage();
            boolean dispatched = row.requestDispatched();
            long charged;
            boolean usageComplete = rawUsage != null
                    && rawUsage.inputTokens() != null && rawUsage.outputTokens() != null;
            if (!dispatched) {
                charged = 0;
            } else if (rawUsage != null) {
                long input = rawUsage.inputTokens() == null ? row.estimatedInputTokens() : rawUsage.inputTokens();
                long output = rawUsage.outputTokens() == null ? row.reservedOutputTokens() : rawUsage.outputTokens();
                charged = success && usageComplete
                        ? Math.addExact(input, output)
                        : Math.max(input, row.estimatedInputTokens())
                                + Math.max(output, row.reservedOutputTokens());
            } else {
                charged = Math.addExact(row.estimatedInputTokens(), row.reservedOutputTokens());
            }
            String state = !dispatched ? "RELEASED" : success ? "COMPLETED" : "FAILED";
            int changed = jdbc.update("update ai_usage_reservations set state=?,actual_input_tokens=?,"
                            + "actual_output_tokens=?,charged_tokens=?,error_code=?,settled_at=? "
                            + "where id=? and state='RESERVED'",
                    state, rawUsage == null ? null : rawUsage.inputTokens(),
                    rawUsage == null ? null : rawUsage.outputTokens(), charged, errorCode,
                    sqlTimestamp(now), call.id());
            if (changed != 1) return reservation(call.id()).usage();
            return new AiProviderUsage(row.estimatedInputTokens(), row.reservedOutputTokens(),
                    rawUsage == null ? null : rawUsage.inputTokens(),
                    rawUsage == null ? null : rawUsage.outputTokens(), charged, usageComplete);
        });
    }

    public SettlementResult settleSuccessful(TaskLease task, CallReservation call, AiTokenUsage rawUsage) {
        return transactions.execute(status -> {
            lockScopesAllowDeletedUser(task);
            Instant now = clock.instant();
            LockRow current = lockRowIfPresent(task.taskLockKey());
            expireReservations(now);
            ReservationRow row = reservation(call.id());
            if (!"RESERVED".equals(row.state())) return new SettlementResult(row.usage(), false);

            boolean accepted = owns(current, task, now)
                    && call.taskId().equals(task.taskId())
                    && call.ownerId().equals(task.ownerId())
                    && count("select count(*) from ai_usage_reservations where id=? and task_id=? and owner_id=? "
                                    + "and state='RESERVED' and request_dispatched=true and lease_until > ?",
                            call.id(), task.taskId(), task.ownerId(), sqlTimestamp(now)) == 1;
            boolean dispatched = row.requestDispatched();
            boolean usageComplete = rawUsage != null
                    && rawUsage.inputTokens() != null && rawUsage.outputTokens() != null;
            long charged = dispatched
                    ? usageCharge(row, rawUsage, accepted && usageComplete)
                    : 0;
            String state = !dispatched ? "RELEASED" : accepted ? "COMPLETED" : "FAILED";
            String errorCode = accepted ? null : "AI_CONCURRENCY_LIMIT";
            int changed = jdbc.update("update ai_usage_reservations set state=?,actual_input_tokens=?,"
                            + "actual_output_tokens=?,charged_tokens=?,error_code=?,settled_at=? "
                            + "where id=? and task_id=? and owner_id=? and state='RESERVED'",
                    state, rawUsage == null ? null : rawUsage.inputTokens(),
                    rawUsage == null ? null : rawUsage.outputTokens(), charged, errorCode,
                    sqlTimestamp(now), call.id(), task.taskId(), task.ownerId());
            if (changed != 1) return new SettlementResult(reservation(call.id()).usage(), false);
            AiProviderUsage usage = new AiProviderUsage(row.estimatedInputTokens(), row.reservedOutputTokens(),
                    rawUsage == null ? null : rawUsage.inputTokens(),
                    rawUsage == null ? null : rawUsage.outputTokens(), charged, usageComplete);
            return new SettlementResult(usage, accepted);
        });
    }

    public boolean heartbeat(TaskLease task, UUID activeReservationId) {
        return transactions.execute(status -> {
            lockScopesAllowDeletedUser(task);
            Instant now = clock.instant();
            LockRow current = lockRowIfPresent(task.taskLockKey());
            if (!owns(current, task, now)) return false;
            Instant renewedUntil = now.plusMillis(limits.reservationLeaseMillis());
            boolean renewReservation = false;
            if (activeReservationId != null) {
                renewReservation = count("select count(*) from ai_usage_reservations where id=? and task_id=? "
                        + "and owner_id=? and state='RESERVED' and lease_until > ?", activeReservationId,
                        task.taskId(), task.ownerId(), sqlTimestamp(now)) == 1;
                if (!renewReservation && count("select count(*) from ai_usage_reservations where id=? "
                        + "and task_id=? and owner_id=? and state='COMPLETED'", activeReservationId,
                        task.taskId(), task.ownerId()) != 1) return false;
            }
            int taskChanged = jdbc.update("update ai_usage_locks set lease_until=?,updated_at=? where scope_key=? "
                            + "and owner_id=? and current_task_id=? and lease_until > ?",
                    sqlTimestamp(renewedUntil), sqlTimestamp(now), task.taskLockKey(), task.ownerId(),
                    task.taskId(), sqlTimestamp(now));
            if (taskChanged != 1) return false;
            if (renewReservation) {
                int callChanged = jdbc.update("update ai_usage_reservations set lease_until=? where id=? "
                                + "and task_id=? and owner_id=? and state='RESERVED' and lease_until > ?",
                        sqlTimestamp(renewedUntil), activeReservationId, task.taskId(), task.ownerId(),
                        sqlTimestamp(now));
                if (callChanged != 1) throw new IllegalStateException("AI reservation changed during heartbeat");
            }
            return true;
        });
    }

    public boolean isCurrent(TaskLease task, CallReservation call) {
        return transactions.execute(status -> {
            lockScopesAllowDeletedUser(task);
            Instant now = clock.instant();
            LockRow current = lockRowIfPresent(task.taskLockKey());
            if (!owns(current, task, now)) return false;
            return count("select count(*) from ai_usage_reservations where id=? and task_id=? and owner_id=? "
                            + "and state='RESERVED' and lease_until > ?",
                    call.id(), task.taskId(), task.ownerId(), sqlTimestamp(now)) == 1;
        });
    }

    public void closeTask(TaskLease task) {
        transactions.executeWithoutResult(status -> {
            lockScopesAllowDeletedUser(task);
            Instant now = clock.instant();
            jdbc.update("update ai_usage_locks set owner_id=null,lease_until=null,updated_at=? "
                            + "where scope_key=? and owner_id=? and current_task_id=?",
                    sqlTimestamp(now), task.taskLockKey(), task.ownerId(), task.taskId());
        });
    }

    @Override
    public AiUsageSnapshot snapshotForUser(UUID userId) {
        Objects.requireNonNull(userId);
        return transactions.execute(status -> {
            lockRow("GLOBAL");
            lockRowIfPresent("USER:" + userId);
            Instant now = clock.instant();
            expireReservations(now);
            Instant hourStart = now.truncatedTo(ChronoUnit.HOURS);
            Instant dayStart = now.truncatedTo(ChronoUnit.DAYS);
            Instant hourEnd = hourStart.plus(1, ChronoUnit.HOURS);
            Instant dayEnd = dayStart.plus(1, ChronoUnit.DAYS);
            long hourCharged = sumUserCharged(userId, hourStart, hourEnd);
            long hourReserved = sumUserReserved(userId, hourStart, hourEnd, now);
            long dayCharged = sumUserCharged(userId, dayStart, dayEnd);
            long dayReserved = sumUserReserved(userId, dayStart, dayEnd, now);
            return new AiUsageSnapshot(
                    new AiUsageSnapshot.Window(limits.perUserHourlyTokens(), hourCharged, hourReserved,
                            Math.max(0, limits.perUserHourlyTokens() - hourCharged - hourReserved),
                            hourStart.plus(1, ChronoUnit.HOURS)),
                    new AiUsageSnapshot.Window(limits.perUserDailyTokens(), dayCharged, dayReserved,
                            Math.max(0, limits.perUserDailyTokens() - dayCharged - dayReserved),
                            dayStart.plus(1, ChronoUnit.DAYS)));
        });
    }

    private void lockScopes(TaskLease task) {
        lockRow("GLOBAL");
        lockRow("USER:" + task.userId());
        lockRow(task.taskLockKey());
    }

    private void lockScopesAllowDeletedUser(TaskLease task) {
        lockRow("GLOBAL");
        if (exists("select count(*) from ai_usage_locks where scope_key=?", "USER:" + task.userId())) {
            lockRow("USER:" + task.userId());
            lockRowIfPresent(task.taskLockKey());
        }
    }

    private void ensureLockRow(String key, String type, UUID userId, String feature, String taskHash) {
        if (!exists("select count(*) from ai_usage_locks where scope_key=?", key)) {
            jdbc.update("insert into ai_usage_locks(scope_key,scope_type,user_id,feature,task_key_hash) "
                            + "values (?,?,?,?,?)", key, type, userId, feature, taskHash);
        }
    }

    private void requireActiveUserLocked(UUID userId) {
        String userStatus = jdbc.query("select status from users where id=? for update",
                rs -> rs.next() ? rs.getString("status") : null, userId);
        if (!"ACTIVE".equals(userStatus)) {
            throw new DomainException("UNAUTHENTICATED", "Account is unavailable");
        }
    }

    private LockRow lockRow(String key) {
        return jdbc.queryForObject("select current_task_id,owner_id,lease_until from ai_usage_locks "
                        + "where scope_key=? for update", (rs, rowNum) -> new LockRow(
                        rs.getObject("current_task_id", UUID.class), rs.getObject("owner_id", UUID.class),
                        rs.getObject("lease_until", java.time.OffsetDateTime.class) == null ? null
                                : rs.getObject("lease_until", java.time.OffsetDateTime.class).toInstant()), key);
    }

    private LockRow lockRowIfPresent(String key) {
        return jdbc.query("select current_task_id,owner_id,lease_until from ai_usage_locks "
                        + "where scope_key=? for update", rs -> rs.next() ? new LockRow(
                        rs.getObject("current_task_id", UUID.class), rs.getObject("owner_id", UUID.class),
                        rs.getObject("lease_until", java.time.OffsetDateTime.class) == null ? null
                                : rs.getObject("lease_until", java.time.OffsetDateTime.class).toInstant()) : null, key);
    }

    private LockRow readTaskLock(String key) {
        return jdbc.queryForObject("select current_task_id,owner_id,lease_until from ai_usage_locks where scope_key=?",
                (rs, rowNum) -> new LockRow(rs.getObject("current_task_id", UUID.class),
                        rs.getObject("owner_id", UUID.class),
                        rs.getObject("lease_until", java.time.OffsetDateTime.class) == null ? null
                                : rs.getObject("lease_until", java.time.OffsetDateTime.class).toInstant()), key);
    }

    private void requireTaskOwner(TaskLease task, Instant now) {
        if (!owns(readTaskLock(task.taskLockKey()), task, now)) {
            throw limit("AI_CONCURRENCY_LIMIT", 429, now.plusSeconds(1));
        }
    }

    private boolean owns(LockRow row, TaskLease task, Instant now) {
        return row != null && task.taskId().equals(row.taskId()) && task.ownerId().equals(row.ownerId())
                && row.leaseUntil() != null && row.leaseUntil().isAfter(now);
    }

    private void expireReservations(Instant now) {
        jdbc.update("update ai_usage_reservations set state='EXPIRED',charged_tokens="
                        + "case when request_dispatched then estimated_input_tokens + reserved_output_tokens "
                        + "else 0 end,settled_at=? "
                        + "where state='RESERVED' and lease_until <= ?",
                sqlTimestamp(now), sqlTimestamp(now));
    }

    private ReservationRow reservation(UUID id) {
        return jdbc.queryForObject("select state,request_dispatched,estimated_input_tokens,reserved_output_tokens,"
                        + "actual_input_tokens,actual_output_tokens,charged_tokens from ai_usage_reservations where id=?",
                (rs, rowNum) -> new ReservationRow(rs.getString("state"), rs.getBoolean("request_dispatched"),
                        rs.getLong("estimated_input_tokens"), rs.getLong("reserved_output_tokens"),
                        (Long) rs.getObject("actual_input_tokens"), (Long) rs.getObject("actual_output_tokens"),
                        rs.getLong("charged_tokens")), id);
    }

    private long usageCharge(ReservationRow row, AiTokenUsage rawUsage, boolean success) {
        if (rawUsage == null) return Math.addExact(row.estimatedInputTokens(), row.reservedOutputTokens());
        long input = rawUsage.inputTokens() == null ? row.estimatedInputTokens() : rawUsage.inputTokens();
        long output = rawUsage.outputTokens() == null ? row.reservedOutputTokens() : rawUsage.outputTokens();
        return success ? Math.addExact(input, output)
                : Math.max(input, row.estimatedInputTokens()) + Math.max(output, row.reservedOutputTokens());
    }

    private boolean exists(String sql, Object... args) {
        return count(sql, args) > 0;
    }

    private int count(String sql, Object... args) {
        Integer result = jdbc.queryForObject(sql, Integer.class, args);
        return result == null ? 0 : result;
    }

    private boolean isWindowQuotaExempt(AiStage stage) {
        return stage == AiStage.INGESTION_EMBEDDING || stage == AiStage.RETRIEVAL_EMBEDDING;
    }

    private boolean isOverview(AiFeature feature) {
        return feature == AiFeature.SOURCE_OVERVIEW || feature == AiFeature.SUBJECT_OVERVIEW;
    }

    private UUID stableOverviewTaskId(UUID userId, AiFeature feature, UUID budgetTaskId) {
        return UUID.nameUUIDFromBytes((userId + ":" + feature + ":" + budgetTaskId).getBytes(StandardCharsets.UTF_8));
    }
    private long sumTaskTokens(UUID taskId) {
        Long result = jdbc.queryForObject("select coalesce(sum(charged_tokens + case when state='RESERVED' "
                        + "then estimated_input_tokens + reserved_output_tokens else 0 end),0) "
                        + "from ai_usage_reservations where task_id=?", Long.class, taskId);
        return result == null ? 0 : result;
    }

    private long sumUserWindow(UUID userId, Instant start, Instant end, Instant now) {
        Long result = jdbc.queryForObject("select coalesce(sum(charged_tokens + case when state='RESERVED' "
                        + "and lease_until > ? then estimated_input_tokens + reserved_output_tokens else 0 end),0) "
                        + "from ai_usage_reservations where stage not in ('INGESTION_EMBEDDING','RETRIEVAL_EMBEDDING') "
                        + "and user_id=? and created_at >= ? and created_at < ?",
                Long.class, sqlTimestamp(now), userId, sqlTimestamp(start), sqlTimestamp(end));
        return result == null ? 0 : result;
    }

    private long sumGlobalWindow(Instant start, Instant end, Instant now) {
        Long result = jdbc.queryForObject("select coalesce(sum(charged_tokens + case when state='RESERVED' "
                        + "and lease_until > ? then estimated_input_tokens + reserved_output_tokens else 0 end),0) "
                        + "from ai_usage_reservations where stage not in ('INGESTION_EMBEDDING','RETRIEVAL_EMBEDDING') "
                        + "and created_at >= ? and created_at < ?",
                Long.class, sqlTimestamp(now), sqlTimestamp(start), sqlTimestamp(end));
        return result == null ? 0 : result;
    }

    private long sumUserCharged(UUID userId, Instant start, Instant end) {
        Long result = jdbc.queryForObject("select coalesce(sum(charged_tokens),0) from ai_usage_reservations "
                        + "where user_id=? and created_at >= ? and created_at < ? and state <> 'RESERVED' "
                        + "and stage not in ('INGESTION_EMBEDDING','RETRIEVAL_EMBEDDING')",
                Long.class, userId, sqlTimestamp(start), sqlTimestamp(end));
        return result == null ? 0 : result;
    }

    private long sumUserReserved(UUID userId, Instant start, Instant end, Instant now) {
        Long result = jdbc.queryForObject("select coalesce(sum(estimated_input_tokens + reserved_output_tokens),0) "
                        + "from ai_usage_reservations where user_id=? and state='RESERVED' and lease_until > ? "
                        + "and created_at >= ? and created_at < ? "
                        + "and stage not in ('INGESTION_EMBEDDING','RETRIEVAL_EMBEDDING')", Long.class, userId,
                sqlTimestamp(now), sqlTimestamp(start), sqlTimestamp(end));
        return result == null ? 0 : result;
    }

    private Instant earliestActiveLease(Instant now) {
        return jdbc.query("select min(lease_until) from ai_usage_reservations where state='RESERVED' and lease_until > ?",
                rs -> {
                    if (!rs.next()) return null;
                    java.time.OffsetDateTime value = rs.getObject(1, java.time.OffsetDateTime.class);
                    return value == null ? null : value.toInstant();
                }, sqlTimestamp(now));
    }

    private int taskCallLimit(AiFeature feature) {
        return switch (feature) {
            case CHAT -> limits.chatMaxCalls();
            case SOURCE_OVERVIEW, SUBJECT_OVERVIEW -> limits.overviewMaxCalls();
            case INGESTION -> limits.ingestionMaxCalls();
            case PROVIDER_SETUP -> 2;
        };
    }

    private long taskTokenLimit(AiFeature feature) {
        return switch (feature) {
            case CHAT -> limits.chatTaskTokens();
            case SOURCE_OVERVIEW, SUBJECT_OVERVIEW -> limits.overviewTaskTokens();
            case INGESTION -> limits.ingestionTaskTokens();
            case PROVIDER_SETUP -> 8_192;
        };
    }

    private AiUsageLimitException limit(String code, int status, Instant resetAt) {
        long retry = Math.max(1, Duration.between(clock.instant(), resetAt).toSeconds());
        return new AiUsageLimitException(code, status, retry, resetAt);
    }

    private OffsetDateTime sqlTimestamp(Instant instant) {
        return instant.atOffset(ZoneOffset.UTC);
    }

    private String sha256(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is unavailable", exception);
        }
    }

    public record TaskLease(UUID userId, AiFeature feature, String taskKeyHash, String taskLockKey,
                            UUID taskId, UUID ownerId, Instant leaseUntil) {
    }

    public record CallReservation(UUID id, UUID taskId, UUID userId, AiFeature feature, AiStage stage,
                                  String taskKeyHash, String taskLockKey, UUID ownerId,
                                  long estimatedInputTokens, long reservedOutputTokens, Instant leaseUntil) {
    }

    public record SettlementResult(AiProviderUsage usage, boolean accepted) {
    }

    private record LockRow(UUID taskId, UUID ownerId, Instant leaseUntil) { }

    private record ReservationRow(String state, boolean requestDispatched, long estimatedInputTokens,
                                  long reservedOutputTokens, Long actualInputTokens,
                                  Long actualOutputTokens, long chargedTokens) {
        AiProviderUsage usage() {
            return new AiProviderUsage(estimatedInputTokens, reservedOutputTokens,
                    actualInputTokens, actualOutputTokens, chargedTokens,
                    actualInputTokens != null && actualOutputTokens != null);
        }
    }
}
