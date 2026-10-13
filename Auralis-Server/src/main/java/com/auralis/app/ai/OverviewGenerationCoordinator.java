package com.auralis.app.ai;

import com.auralis.app.ai.usage.AiProviderUsage;
import com.auralis.app.ai.usage.OverviewTaskUsageSummary;
import com.auralis.app.ai.usage.AiUsageLimitException;
import com.auralis.app.shared.config.AuralisProperties;
import com.auralis.app.shared.error.DomainException;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.ResultSetExtractor;
import org.springframework.stereotype.Service;
import org.springframework.scheduling.annotation.Scheduled;
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
import java.util.HexFormat;
import java.util.EnumSet;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import java.util.function.BooleanSupplier;
import java.util.regex.Pattern;

/** Private durable coordination for generated Overview output; this is separate from V27 results. */
@Service
public class OverviewGenerationCoordinator {

    public static final int MAX_PAYLOAD_CHARS = 1_048_576;
    private static final int MAX_METADATA_CHARS = 8_192;
    private static final int CHECKPOINT_RETENTION_DAYS = 14;
    private static final int RESULT_RETENTION_DAYS = 14;
    private static final java.util.Map<String, Integer> USAGE_FAILURE_STATUSES = java.util.Map.of(
            "AI_REQUEST_BUDGET_EXCEEDED", 413,
            "AI_TASK_BUDGET_EXCEEDED", 422,
            "AI_CONCURRENCY_LIMIT", 429,
            "AI_HOURLY_QUOTA_EXCEEDED", 429,
            "AI_DAILY_QUOTA_EXCEEDED", 429,
            "AI_GLOBAL_QUOTA_EXCEEDED", 503);
    private static final Pattern SHA256 = Pattern.compile("[0-9a-f]{64}");
    private static final Pattern STEP_KEY = Pattern.compile("[A-Za-z0-9_.:-]{1,160}");
    private static final Pattern SAFE_ACTION = Pattern.compile("[A-Z0-9_]{1,48}");

    private final JdbcTemplate jdbc;
    private final TransactionTemplate transactions;
    private final Clock clock;
    private final long leaseMillis;
    private final long heartbeatMillis;
    private final ScheduledExecutorService heartbeatScheduler;

    @Autowired
    public OverviewGenerationCoordinator(JdbcTemplate jdbc, PlatformTransactionManager transactionManager,
                                         Clock clock, AuralisProperties properties,
                                         @Qualifier("overviewHeartbeatScheduler") ScheduledExecutorService heartbeatScheduler) {
        this(jdbc, transactionManager, clock, properties.ai().limits().reservationLeaseMillis(),
                properties.ai().limits().heartbeatMillis(), heartbeatScheduler);
    }

    OverviewGenerationCoordinator(JdbcTemplate jdbc, PlatformTransactionManager transactionManager,
                                  Clock clock, long leaseMillis, long heartbeatMillis,
                                  ScheduledExecutorService heartbeatScheduler) {
        this.jdbc = Objects.requireNonNull(jdbc);
        this.transactions = new TransactionTemplate(Objects.requireNonNull(transactionManager));
        this.transactions.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        this.clock = Objects.requireNonNull(clock);
        if (leaseMillis <= 0 || heartbeatMillis <= 0 || heartbeatMillis > leaseMillis / 3) {
            throw new IllegalArgumentException("Overview generation lease configuration is invalid");
        }
        this.leaseMillis = leaseMillis;
        this.heartbeatMillis = heartbeatMillis;
        this.heartbeatScheduler = Objects.requireNonNull(heartbeatScheduler);
    }

    /**
     * Maps a normalized request id immutably, joins same-profile active work, or takes over the newest
     * failed generation for the same logical input. A new request id after SUCCESS starts a new generation.
     */
    public Acquisition acquire(Request request) {
        validate(request);
        return transactions.execute(status -> {
            requireActiveUserLocked(request.userId());
            Instant now = clock.instant();
            RequestRow mapped = requestMapping(request.userId(), request.requestId());
            if (mapped != null) {
                requireSameRequest(mapped, request);
                GenerationRow generation = generationForUpdate(mapped.generationId());
                if (!generation.scopeType().equals(request.scopeType())
                        || !generation.scopeId().equals(request.scopeId())
                        || !Objects.equals(generation.sourceRevision(), request.sourceRevision())) {
                    throw requestConflict("The overview request id is already bound to another source revision");
                }
                if (!request.profileFingerprint().equals(generation.profileFingerprint())) {
                    throw requestConflict("The generation was resumed with a different provider profile");
                }
                if (!request.algorithmVersion().equals(generation.algorithmVersion())) {
                    throw requestConflict("The generation was resumed with a different algorithm version");
                }
                return mappedGeneration(request, generation, now);
            }

            GenerationRow active = findActive(request);
            if (active != null) {
                if (!request.payloadFingerprint().equals(active.payloadFingerprint())
                        || !request.profileFingerprint().equals(active.profileFingerprint())
                        || !request.algorithmVersion().equals(active.algorithmVersion())) {
                    throw requestConflict("An overview generation with this input is active under another payload or profile");
                }
                insertRequestMapping(request, active.id());
                if (active.leaseUntil().isAfter(now)) return waiter(active);
                return takeover(request, active, now);
            }

            GenerationRow failed = findFailed(request);
            if (failed != null) {
                if (!request.payloadFingerprint().equals(failed.payloadFingerprint())) {
                    throw requestConflict("A failed overview generation cannot resume with different input payload");
                }
                insertRequestMapping(request, failed.id());
                return takeover(request, failed, now);
            }

            UUID generationId = UUID.randomUUID();
            UUID budgetTaskId = UUID.randomUUID();
            UUID ownerId = UUID.randomUUID();
            Instant leaseUntil = now.plusMillis(leaseMillis);
            jdbc.update("insert into overview_generations (id,user_id,scope_type,scope_id,source_revision,"
                            + "input_fingerprint,payload_fingerprint,active_fingerprint,profile_fingerprint,algorithm_version,budget_task_id,"
                            + "status,owner_id,fence,lease_until,created_at,updated_at) "
                            + "values (?,?,?,?,?,?,?,?,?,?,?,'ACTIVE',?,1,?,?,?)",
                    generationId, request.userId(), request.scopeType(), request.scopeId(), request.sourceRevision(),
                    request.inputFingerprint(), request.payloadFingerprint(), activeFingerprint(request), request.profileFingerprint(),
                    request.algorithmVersion(), budgetTaskId, ownerId, sqlTimestamp(leaseUntil),
                    sqlTimestamp(now), sqlTimestamp(now));
            insertRequestMapping(request, generationId);
            return owner(generationId, request, budgetTaskId, ownerId, 1, leaseUntil);
        });
    }

    private Acquisition mappedGeneration(Request request, GenerationRow generation, Instant now) {
        return switch (generation.status()) {
            case "SUCCESS" -> {
                if (generation.resultJson() == null || generation.resultExpiresAt() == null
                        || !generation.resultExpiresAt().isAfter(now)) {
                    throw requestConflict("The stored overview response has expired; this request id cannot be reused");
                }
                verifyResult(generation.resultJson(), generation.resultSha256());
                yield new Acquisition(AcquisitionState.REPLAY, generation.id(), null,
                        generation.budgetTaskId(), generation.resultJson());
            }
            case "ACTIVE" -> {
                if (generation.leaseUntil().isAfter(now)) yield waiter(generation);
                yield takeover(request, generation, now);
            }
            case "FAILED" -> takeover(request, generation, now);
            default -> throw new IllegalStateException("Unknown overview generation status");
        };
    }

    private GenerationRow findActive(Request request) {
        return firstGeneration("select " + GENERATION_COLUMNS + " from overview_generations where user_id=? "
                        + "and scope_type=? and scope_id=? and source_revision is not distinct from ? "
                        + "and input_fingerprint=? and status='ACTIVE' for update",
                request.userId(), request.scopeType(), request.scopeId(), request.sourceRevision(), request.inputFingerprint());
    }

    private GenerationRow findFailed(Request request) {
        return firstGeneration("select " + GENERATION_COLUMNS + " from overview_generations where user_id=? "
                        + "and scope_type=? and scope_id=? and source_revision is not distinct from ? "
                        + "and input_fingerprint=? and status='FAILED' "
                        + "order by updated_at desc,id desc limit 1 for update",
                request.userId(), request.scopeType(), request.scopeId(), request.sourceRevision(), request.inputFingerprint());
    }

    private static final String GENERATION_COLUMNS = "id,user_id,scope_type,scope_id,source_revision,input_fingerprint,"
            + "payload_fingerprint,profile_fingerprint,algorithm_version,budget_task_id,status,owner_id,fence,lease_until,result_json,"
            + "result_sha256,result_expires_at,error_code,error_status,error_retry_after_seconds,error_reset_at";

    private GenerationRow firstGeneration(String sql, Object... args) {
        List<GenerationRow> rows = jdbc.query(sql, (rs, rowNum) -> generationRow(rs), args);
        return rows.isEmpty() ? null : rows.getFirst();
    }

    private GenerationRow generationForUpdate(UUID generationId) {
        return jdbc.queryForObject("select " + GENERATION_COLUMNS
                        + " from overview_generations where id=? for update",
                (rs, rowNum) -> generationRow(rs), generationId);
    }

    private GenerationRow generationRow(java.sql.ResultSet rs) throws java.sql.SQLException {
        return new GenerationRow(rs.getObject("id", UUID.class), rs.getObject("user_id", UUID.class),
                rs.getString("scope_type"), rs.getObject("scope_id", UUID.class),
                rs.getObject("source_revision", UUID.class), rs.getString("input_fingerprint").trim(),
                rs.getString("payload_fingerprint").trim(), rs.getString("profile_fingerprint").trim(), rs.getString("algorithm_version"),
                rs.getObject("budget_task_id", UUID.class), rs.getString("status"),
                rs.getObject("owner_id", UUID.class), rs.getLong("fence"), instant(rs, "lease_until"),
                rs.getString("result_json"), rs.getString("result_sha256"), instant(rs, "result_expires_at"),
                rs.getString("error_code"));
    }

    private Acquisition takeover(Request request, GenerationRow generation, Instant now) {
        UUID ownerId = UUID.randomUUID();
        Instant leaseUntil = now.plusMillis(leaseMillis);
        long nextFence = Math.addExact(generation.fence(), 1);
        int updated;
        if ("FAILED".equals(generation.status())) {
            updated = jdbc.update("update overview_generations set status='ACTIVE',active_fingerprint=?,"
                            + "profile_fingerprint=?,algorithm_version=?,owner_id=?,fence=?,lease_until=?,error_code=null,"
                            + "error_status=null,error_retry_after_seconds=null,error_reset_at=null,"
                            + "updated_at=?,completed_at=null where id=? and status='FAILED' and fence=?",
                    activeFingerprint(request), request.profileFingerprint(), request.algorithmVersion(), ownerId,
                    nextFence, sqlTimestamp(leaseUntil), sqlTimestamp(now), generation.id(), generation.fence());
        } else {
            updated = jdbc.update("update overview_generations set active_fingerprint=?,profile_fingerprint=?,algorithm_version=?,"
                            + "owner_id=?,fence=?,lease_until=?,error_code=null,error_status=null,error_retry_after_seconds=null,"
                            + "error_reset_at=null,updated_at=? where id=? and status='ACTIVE' and fence=? "
                            + "and lease_until<=?",
                    activeFingerprint(request), request.profileFingerprint(), request.algorithmVersion(), ownerId, nextFence,
                    sqlTimestamp(leaseUntil), sqlTimestamp(now), generation.id(), generation.fence(), sqlTimestamp(now));
        }
        if (updated != 1) throw leaseLost(generation.leaseUntil());
        return owner(generation.id(), request, generation.budgetTaskId(), ownerId, nextFence, leaseUntil);
    }

    private Acquisition owner(UUID generationId, Request request, UUID budgetTaskId,
                              UUID ownerId, long fence, Instant leaseUntil) {
        GenerationLease lease = new GenerationLease(generationId, request.userId(), request.scopeType(),
                request.scopeId(), request.sourceRevision(), request.inputFingerprint(), request.profileFingerprint(),
                request.algorithmVersion(), budgetTaskId, ownerId, fence, leaseUntil);
        return new Acquisition(AcquisitionState.OWNER, generationId, lease, budgetTaskId, null);
    }

    private Acquisition waiter(GenerationRow generation) {
        return new Acquisition(AcquisitionState.WAITER, generation.id(), null, generation.budgetTaskId(), null);
    }

    private void requireActiveUserLocked(UUID userId) {
        String state = jdbc.query("select status from users where id=? for update",
                rs -> rs.next() ? rs.getString(1) : null, userId);
        if (!"ACTIVE".equals(state)) throw new DomainException("UNAUTHENTICATED", "The account is unavailable");
    }

    private RequestRow requestMapping(UUID userId, UUID requestId) {
        return jdbc.query("select generation_id,input_fingerprint,payload_fingerprint,profile_fingerprint,algorithm_version "
                        + "from overview_generation_requests where user_id=? and request_id=? for update",
                rs -> rs.next() ? new RequestRow(rs.getObject("generation_id", UUID.class),
                        rs.getString("input_fingerprint").trim(), rs.getString("payload_fingerprint").trim(),
                        rs.getString("profile_fingerprint").trim(), rs.getString("algorithm_version")) : null,
                userId, requestId);
    }

    private void requireSameRequest(RequestRow stored, Request request) {
        if (!stored.inputFingerprint().equals(request.inputFingerprint())
                || !stored.payloadFingerprint().equals(request.payloadFingerprint())
                || !stored.profileFingerprint().equals(request.profileFingerprint())
                || !stored.algorithmVersion().equals(request.algorithmVersion())) {
            throw requestConflict("The overview request id is already bound to another payload or provider profile");
        }
    }

    private void insertRequestMapping(Request request, UUID generationId) {
        jdbc.update("insert into overview_generation_requests (id,user_id,request_id,generation_id,input_fingerprint,"
                        + "payload_fingerprint,profile_fingerprint,algorithm_version,created_at) values (?,?,?,?,?,?,?,?,?)",
                UUID.randomUUID(), request.userId(), request.requestId(), generationId, request.inputFingerprint(),
                request.payloadFingerprint(), request.profileFingerprint(), request.algorithmVersion(),
                sqlTimestamp(clock.instant()));
    }

    /** Adds a request id after local single-flight selection, without starting another budget task. */
    public void associateRequest(GenerationLease ownerRef, Request request) {
        Objects.requireNonNull(ownerRef);
        validate(request);
        if (!ownerRef.userId().equals(request.userId())) {
            throw requestConflict("The request owner does not match the active overview generation");
        }
        transactions.executeWithoutResult(status -> {
            requireActiveUserLocked(request.userId());
            RequestRow stored = requestMapping(request.userId(), request.requestId());
            if (stored != null) {
                requireSameRequest(stored, request);
                if (!stored.generationId().equals(ownerRef.generationId())) {
                    throw requestConflict("The overview request id is already bound to another generation");
                }
                return;
            }
            GenerationRow generation = generationForUpdate(ownerRef.generationId());
            if (!generation.userId().equals(ownerRef.userId())
                    || !generation.scopeType().equals(request.scopeType())
                    || !generation.scopeId().equals(request.scopeId())
                    || !Objects.equals(generation.sourceRevision(), request.sourceRevision())
                    || !generation.inputFingerprint().equals(request.inputFingerprint())
                    || !generation.payloadFingerprint().equals(request.payloadFingerprint())
                    || !generation.profileFingerprint().equals(request.profileFingerprint())
                    || !generation.algorithmVersion().equals(request.algorithmVersion())
                    || !generation.scopeType().equals(ownerRef.scopeType())
                    || !generation.scopeId().equals(ownerRef.scopeId())
                    || !Objects.equals(generation.sourceRevision(), ownerRef.sourceRevision())
                    || !generation.inputFingerprint().equals(ownerRef.inputFingerprint())
                    || !generation.profileFingerprint().equals(ownerRef.profileFingerprint())
                    || !generation.algorithmVersion().equals(ownerRef.algorithmVersion())
                    || !generation.budgetTaskId().equals(ownerRef.budgetTaskId())
                    || generation.fence() != ownerRef.fence()
                    || ("ACTIVE".equals(generation.status())
                        && (!ownerRef.ownerId().equals(generation.ownerId())
                            || !generation.leaseUntil().isAfter(clock.instant())))) {
                throw leaseLost(ownerRef.leaseUntil());
            }
            insertRequestMapping(request, ownerRef.generationId());
        });
    }

    /** Associates a participant with the exact generation selected by a durable acquisition handle. */
    void associateRequest(Acquisition binding, Request request) {
        Objects.requireNonNull(binding);
        validate(request);
        if (binding.generationId() == null || binding.budgetTaskId() == null
                || !EnumSet.of(AcquisitionState.OWNER, AcquisitionState.WAITER, AcquisitionState.REPLAY,
                        AcquisitionState.FAILED)
                        .contains(binding.state())) {
            throw requestConflict("The overview acquisition does not identify a generation");
        }
        if (binding.lease() != null && (!binding.lease().generationId().equals(binding.generationId())
                || !binding.lease().budgetTaskId().equals(binding.budgetTaskId()))) {
            throw requestConflict("The overview acquisition lease does not match its generation");
        }
        transactions.executeWithoutResult(status -> {
            requireActiveUserLocked(request.userId());
            RequestRow stored = requestMapping(request.userId(), request.requestId());
            if (stored != null) {
                requireSameRequest(stored, request);
                if (!stored.generationId().equals(binding.generationId())) {
                    throw requestConflict("The overview request id is already bound to another generation");
                }
            }
            GenerationRow generation = generationForUpdate(binding.generationId());
            if (!generation.userId().equals(request.userId())
                    || !generation.scopeType().equals(request.scopeType())
                    || !generation.scopeId().equals(request.scopeId())
                    || !Objects.equals(generation.sourceRevision(), request.sourceRevision())
                    || !generation.inputFingerprint().equals(request.inputFingerprint())
                    || !generation.payloadFingerprint().equals(request.payloadFingerprint())
                    || !generation.profileFingerprint().equals(request.profileFingerprint())
                    || !generation.algorithmVersion().equals(request.algorithmVersion())
                    || !generation.budgetTaskId().equals(binding.budgetTaskId())) {
                throw requestConflict("The overview acquisition does not match the request identity");
            }
            if (binding.state() == AcquisitionState.OWNER) {
                GenerationLease ownerRef = binding.lease();
                if (ownerRef == null || !ownerRef.userId().equals(generation.userId())
                        || !ownerRef.scopeType().equals(generation.scopeType())
                        || !ownerRef.scopeId().equals(generation.scopeId())
                        || !Objects.equals(ownerRef.sourceRevision(), generation.sourceRevision())
                        || !ownerRef.inputFingerprint().equals(generation.inputFingerprint())
                        || !ownerRef.profileFingerprint().equals(generation.profileFingerprint())
                        || !ownerRef.algorithmVersion().equals(generation.algorithmVersion())
                        || ownerRef.fence() != generation.fence()
                        || ("ACTIVE".equals(generation.status())
                            && (!ownerRef.ownerId().equals(generation.ownerId())
                                || !generation.leaseUntil().isAfter(clock.instant())))) {
                    throw leaseLost(ownerRef == null ? clock.instant() : ownerRef.leaseUntil());
                }
            }
            if (stored == null) insertRequestMapping(request, binding.generationId());
        });
    }

    /** Looks up an immutable request mapping without claiming, taking over, or creating a generation. */
    public Optional<Acquisition> lookupRequest(Request request) {
        validate(request);
        return transactions.execute(status -> {
            requireActiveUserLocked(request.userId());
            RequestRow mapped = requestMapping(request.userId(), request.requestId());
            if (mapped == null) return Optional.empty();
            requireSameRequest(mapped, request);
            GenerationRow generation = generationForUpdate(mapped.generationId());
            if (!generation.userId().equals(request.userId())
                    || !generation.scopeType().equals(request.scopeType())
                    || !generation.scopeId().equals(request.scopeId())
                    || !Objects.equals(generation.sourceRevision(), request.sourceRevision())) {
                throw requestConflict("The overview request id is already bound to another source revision");
            }
            if (!request.profileFingerprint().equals(generation.profileFingerprint())) {
                throw requestConflict("The generation was resumed with a different provider profile");
            }
            if (!request.algorithmVersion().equals(generation.algorithmVersion())) {
                throw requestConflict("The generation was resumed with a different algorithm version");
            }
            if ("SUCCESS".equals(generation.status())) {
                Instant now = clock.instant();
                if (generation.resultJson() == null || generation.resultExpiresAt() == null
                        || !generation.resultExpiresAt().isAfter(now)) {
                    throw requestConflict("The stored overview response has expired; this request id cannot be reused");
                }
                verifyResult(generation.resultJson(), generation.resultSha256());
                return Optional.of(new Acquisition(AcquisitionState.REPLAY, generation.id(), null,
                        generation.budgetTaskId(), generation.resultJson()));
            }
            if ("FAILED".equals(generation.status())) {
                return Optional.of(new Acquisition(AcquisitionState.FAILED, generation.id(), null,
                        generation.budgetTaskId(), null));
            }
            if ("ACTIVE".equals(generation.status())) return Optional.of(waiter(generation));
            throw requestConflict("The stored overview generation has an unsupported state");
        });
    }

    public AwaitResult await(Acquisition waiter, Duration timeout, BooleanSupplier cancelled) {
        if (waiter.state() != AcquisitionState.WAITER) throw new IllegalArgumentException("Acquisition is not a waiter");
        Objects.requireNonNull(timeout);
        Objects.requireNonNull(cancelled);
        long deadline = System.nanoTime() + timeout.toNanos();
        while (System.nanoTime() < deadline) {
            if (cancelled.getAsBoolean()) throw new DomainException("MODEL_TIMEOUT", "Overview generation wait was cancelled");
            AwaitResult current = transactions.execute(status -> readOutcome(waiter.generationId()));
            if (!"ACTIVE".equals(current.status())) return current;
            try {
                Thread.sleep(50);
            } catch (InterruptedException exception) {
                Thread.currentThread().interrupt();
                throw new DomainException("MODEL_TIMEOUT", "Overview generation wait was interrupted", null, exception);
            }
        }
        throw new DomainException("MODEL_TIMEOUT", "Overview generation wait exceeded its deadline");
    }

    private AwaitResult readOutcome(UUID generationId) {
        return jdbc.queryForObject("select status,lease_until,result_json,result_sha256,result_expires_at,error_code,"
                        + "error_status,error_retry_after_seconds,error_reset_at "
                        + "from overview_generations where id=?",
                (rs, rowNum) -> {
                    String state = rs.getString("status");
                    String result = rs.getString("result_json");
                    Instant leaseUntil = instant(rs, "lease_until");
                    Instant expiresAt = instant(rs, "result_expires_at");
                    if ("SUCCESS".equals(state) && (result == null || expiresAt == null
                            || !expiresAt.isAfter(clock.instant()))) {
                        throw requestConflict("The stored overview response has expired");
                    }
                    if ("SUCCESS".equals(state)) verifyResult(result, rs.getString("result_sha256"));
                    if ("ACTIVE".equals(state) && (leaseUntil == null || !leaseUntil.isAfter(clock.instant()))) {
                        return new AwaitResult("EXPIRED", null, null);
                    }
                    Integer errorStatus = rs.getObject("error_status", Integer.class);
                    FailureDetails failureDetails = errorStatus == null ? null
                            : new FailureDetails(errorStatus, rs.getLong("error_retry_after_seconds"),
                                instant(rs, "error_reset_at"));
                    return new AwaitResult(state, result, rs.getString("error_code"), failureDetails);
                }, generationId);
    }

    public boolean renew(GenerationLease lease) {
        Objects.requireNonNull(lease);
        return transactions.execute(status -> {
            Instant now = clock.instant();
            return jdbc.update("update overview_generations set lease_until=?,updated_at=? where id=? and user_id=? "
                            + "and status='ACTIVE' and owner_id=? and fence=? and lease_until>?",
                    sqlTimestamp(now.plusMillis(leaseMillis)), sqlTimestamp(now), lease.generationId(), lease.userId(),
                    lease.ownerId(), lease.fence(), sqlTimestamp(now)) == 1;
        });
    }

    public AutoCloseable startHeartbeat(GenerationLease lease, Runnable lostLease) {
        Objects.requireNonNull(lostLease);
        AtomicBoolean notified = new AtomicBoolean();
        ScheduledFuture<?> heartbeat = heartbeatScheduler.scheduleWithFixedDelay(() -> {
            try {
                if (!renew(lease) && notified.compareAndSet(false, true)) lostLease.run();
            } catch (RuntimeException exception) {
                if (notified.compareAndSet(false, true)) lostLease.run();
            }
        }, heartbeatMillis, heartbeatMillis, TimeUnit.MILLISECONDS);
        return () -> heartbeat.cancel(false);
    }

    public boolean owns(GenerationLease lease) {
        Objects.requireNonNull(lease);
        Instant now = clock.instant();
        return Boolean.TRUE.equals(jdbc.queryForObject("select count(*)=1 from overview_generations where id=? "
                        + "and user_id=? and status='ACTIVE' and owner_id=? and fence=? and lease_until>?",
                Boolean.class, lease.generationId(), lease.userId(), lease.ownerId(), lease.fence(), sqlTimestamp(now)));
    }

    public Checkpoint loadCheckpoint(GenerationLease lease, String stepKey, String inputFingerprint,
                                     String profileFingerprint, String algorithmVersion, int schemaVersion) {
        validateStep(stepKey, inputFingerprint, profileFingerprint, algorithmVersion, schemaVersion);
        requireLeaseBinding(lease, profileFingerprint, algorithmVersion);
        return transactions.execute(status -> {
            requireLeaseLocked(lease);
            return jdbc.query("select payload_json,payload_sha256,schema_version from overview_generation_checkpoints "
                            + "where generation_id=? and step_key=? and input_fingerprint=? and profile_fingerprint=? "
                            + "and algorithm_version=?",
                    rs -> rs.next() ? verifiedCheckpoint(rs.getString("payload_json"), rs.getString("payload_sha256"),
                            rs.getInt("schema_version"), schemaVersion) : null,
                    lease.generationId(), stepKey, inputFingerprint, profileFingerprint, algorithmVersion);
        });
    }

    public void saveCheckpoint(GenerationLease lease, String stepKey, String inputFingerprint,
                               String profileFingerprint, String algorithmVersion, int schemaVersion, String payloadJson) {
        validateStep(stepKey, inputFingerprint, profileFingerprint, algorithmVersion, schemaVersion);
        requireLeaseBinding(lease, profileFingerprint, algorithmVersion);
        String payload = requirePayload(payloadJson);
        String payloadHash = sha256(payload);
        transactions.executeWithoutResult(status -> {
            requireLeaseLocked(lease);
            Checkpoint existing = jdbc.query("select payload_json,payload_sha256,schema_version "
                            + "from overview_generation_checkpoints where generation_id=? and step_key=? "
                            + "and input_fingerprint=? and profile_fingerprint=? and algorithm_version=? for update",
                    rs -> rs.next() ? verifiedCheckpoint(rs.getString("payload_json"), rs.getString("payload_sha256"),
                            rs.getInt("schema_version"), schemaVersion) : null,
                    lease.generationId(), stepKey, inputFingerprint, profileFingerprint, algorithmVersion);
            if (existing != null) {
                if (!existing.payloadJson().equals(payload) || !existing.payloadSha256().equals(payloadHash)) {
                    throw requestConflict("A different checkpoint already exists for this generation step");
                }
                return;
            }
            jdbc.update("insert into overview_generation_checkpoints (id,generation_id,step_key,input_fingerprint,"
                            + "profile_fingerprint,algorithm_version,payload_json,payload_sha256,schema_version,created_at) "
                            + "values (?,?,?,?,?,?,?,?,?,?)",
                    UUID.randomUUID(), lease.generationId(), stepKey, inputFingerprint, profileFingerprint,
                    algorithmVersion, payload, payloadHash, schemaVersion, sqlTimestamp(clock.instant()));
        });
    }

    public boolean complete(GenerationLease lease, String resultJson, AiProviderUsage usage,
                            int recoveryCount, List<String> recoveryActions) {
        return complete(lease, resultJson, summary(usage), recoveryCount, recoveryActions);
    }

    public boolean complete(GenerationLease lease, String resultJson, OverviewTaskUsageSummary usage,
                            int recoveryCount, List<String> recoveryActions) {
        String payload = requirePayload(resultJson);
        RecoveryMetadata metadata = recoveryMetadata(recoveryCount, recoveryActions);
        OverviewTaskUsageSummary safeUsage = usage == null
                ? new OverviewTaskUsageSummary(0, 0, null, null, 0, 1, 0, false) : usage;
        return transactions.execute(status -> {
            Instant now = clock.instant();
            RecoveryMetadata combinedMetadata = combinedRecoveryMetadata(lease, metadata, now);
            if (combinedMetadata == null) return false;
            int changed = jdbc.update("update overview_generations set status='SUCCESS',active_fingerprint=null,"
                            + "owner_id=null,lease_until=null,result_json=?,result_sha256=?,result_expires_at=?,"
                            + "estimated_input_tokens=?,reserved_output_tokens=?,actual_input_tokens=?,actual_output_tokens=?,"
                            + "charged_tokens=?,provider_usage_complete=?,unknown_dispatched_calls=?,"
                            + "active_dispatched_reservations=?,recovery_count=?,recovery_actions_json=?,error_code=null,"
                            + "error_status=null,error_retry_after_seconds=null,error_reset_at=null,"
                            + "updated_at=?,completed_at=? where id=? and user_id=? and status='ACTIVE' and owner_id=? "
                            + "and fence=? and lease_until>?",
                    payload, sha256(payload), sqlTimestamp(now.plus(Duration.ofDays(RESULT_RETENTION_DAYS))),
                    safeUsage.estimatedInputTokens(), safeUsage.reservedOutputTokens(), safeUsage.actualInputTokens(),
                    safeUsage.actualOutputTokens(), safeUsage.chargedTokens(), safeUsage.providerUsageComplete(),
                    safeUsage.unknownDispatchedCalls(), safeUsage.activeDispatchedReservations(),
                    combinedMetadata.count(), combinedMetadata.actionsJson(), sqlTimestamp(now), sqlTimestamp(now),
                    lease.generationId(), lease.userId(), lease.ownerId(), lease.fence(), sqlTimestamp(now));
            return changed == 1;
        });
    }

    public boolean fail(GenerationLease lease, String safeErrorCode, AiProviderUsage usage,
                        int recoveryCount, List<String> recoveryActions) {
        return fail(lease, safeErrorCode, null, summary(usage), recoveryCount, recoveryActions);
    }

    public boolean fail(GenerationLease lease, String safeErrorCode, OverviewTaskUsageSummary usage,
                        int recoveryCount, List<String> recoveryActions) {
        return fail(lease, safeErrorCode, null, usage, recoveryCount, recoveryActions);
    }

    public boolean fail(GenerationLease lease, String safeErrorCode, FailureDetails failureDetails,
                        OverviewTaskUsageSummary usage, int recoveryCount, List<String> recoveryActions) {
        if (safeErrorCode == null || !safeErrorCode.matches("[A-Z0-9_]{1,64}")) {
            throw new IllegalArgumentException("Safe error code is invalid");
        }
        validateFailureDetails(safeErrorCode, failureDetails);
        RecoveryMetadata metadata = recoveryMetadata(recoveryCount, recoveryActions);
        OverviewTaskUsageSummary safeUsage = usage == null
                ? new OverviewTaskUsageSummary(0, 0, null, null, 0, 1, 0, false) : usage;
        return transactions.execute(status -> {
            Instant now = clock.instant();
            RecoveryMetadata combinedMetadata = combinedRecoveryMetadata(lease, metadata, now);
            if (combinedMetadata == null) return false;
            int changed = jdbc.update("update overview_generations set status='FAILED',active_fingerprint=null,"
                            + "owner_id=null,lease_until=null,result_json=null,result_sha256=null,result_expires_at=null,"
                            + "estimated_input_tokens=?,reserved_output_tokens=?,actual_input_tokens=?,actual_output_tokens=?,"
                            + "charged_tokens=?,provider_usage_complete=?,unknown_dispatched_calls=?,"
                            + "active_dispatched_reservations=?,recovery_count=?,recovery_actions_json=?,error_code=?,"
                            + "error_status=?,error_retry_after_seconds=?,error_reset_at=?,"
                            + "updated_at=?,completed_at=? where id=? and user_id=? and status='ACTIVE' and owner_id=? "
                            + "and fence=? and lease_until>?",
                    safeUsage.estimatedInputTokens(), safeUsage.reservedOutputTokens(), safeUsage.actualInputTokens(),
                    safeUsage.actualOutputTokens(), safeUsage.chargedTokens(), safeUsage.providerUsageComplete(),
                    safeUsage.unknownDispatchedCalls(), safeUsage.activeDispatchedReservations(),
                    combinedMetadata.count(), combinedMetadata.actionsJson(), safeErrorCode,
                    failureDetails == null ? null : failureDetails.status(),
                    failureDetails == null ? null : failureDetails.retryAfterSeconds(),
                    failureDetails == null || failureDetails.resetAt() == null ? null : sqlTimestamp(failureDetails.resetAt()),
                    sqlTimestamp(now), sqlTimestamp(now),
                    lease.generationId(), lease.userId(), lease.ownerId(), lease.fence(), sqlTimestamp(now));
            return changed == 1;
        });
    }

    private void validateFailureDetails(String safeErrorCode, FailureDetails failureDetails) {
        if (failureDetails == null) return;
        Integer expectedStatus = USAGE_FAILURE_STATUSES.get(safeErrorCode);
        if (expectedStatus == null || expectedStatus != failureDetails.status()) {
            throw new IllegalArgumentException("Failure status does not match its safe usage error code");
        }
    }

    private RecoveryMetadata combinedRecoveryMetadata(GenerationLease lease, RecoveryMetadata attempt,
                                                        Instant now) {
        RecoveryMetadata previous = jdbc.query("select recovery_count,recovery_actions_json from overview_generations "
                        + "where id=? and user_id=? and status='ACTIVE' and owner_id=? and fence=? and lease_until>? for update",
                rs -> rs.next() ? new RecoveryMetadata(rs.getInt("recovery_count"),
                        rs.getString("recovery_actions_json")) : null,
                lease.generationId(), lease.userId(), lease.ownerId(), lease.fence(), sqlTimestamp(now));
        if (previous == null) return null;

        int totalCount;
        try {
            totalCount = Math.addExact(previous.count(), attempt.count());
        } catch (ArithmeticException overflow) {
            throw new IllegalArgumentException("Overview recovery count exceeds its limit", overflow);
        }
        LinkedHashSet<String> actions = new LinkedHashSet<>(parseRecoveryActions(previous.actionsJson()));
        actions.addAll(parseRecoveryActions(attempt.actionsJson()));
        if (actions.size() > 64) {
            throw new IllegalArgumentException("Overview recovery actions exceed their cumulative limit");
        }
        return recoveryMetadata(totalCount, new ArrayList<>(actions));
    }

    private List<String> parseRecoveryActions(String actionsJson) {
        if (actionsJson == null || actionsJson.length() > MAX_METADATA_CHARS
                || actionsJson.length() < 2 || actionsJson.charAt(0) != '['
                || actionsJson.charAt(actionsJson.length() - 1) != ']') {
            throw new IllegalStateException("Stored overview recovery metadata is invalid");
        }
        String body = actionsJson.substring(1, actionsJson.length() - 1);
        if (body.isEmpty()) return List.of();
        String[] values = body.split(",", -1);
        if (values.length > 64) throw new IllegalStateException("Stored overview recovery metadata exceeds its limit");
        List<String> actions = new ArrayList<>(values.length);
        for (String value : values) {
            if (value.length() < 3 || value.charAt(0) != '"' || value.charAt(value.length() - 1) != '"') {
                throw new IllegalStateException("Stored overview recovery metadata is invalid");
            }
            String action = value.substring(1, value.length() - 1);
            if (!SAFE_ACTION.matcher(action).matches()) {
                throw new IllegalStateException("Stored overview recovery metadata is invalid");
            }
            actions.add(action);
        }
        return actions;
    }

    private static OverviewTaskUsageSummary summary(AiProviderUsage usage) {
        if (usage == null) return null;
        boolean complete = usage.providerUsageComplete() && usage.actualInputTokens() != null
                && usage.actualOutputTokens() != null;
        return new OverviewTaskUsageSummary(usage.estimatedInputTokens(), usage.reservedOutputTokens(),
                complete ? usage.actualInputTokens() : null, complete ? usage.actualOutputTokens() : null,
                usage.chargedTokens(), complete ? 0 : 1, 0, complete);
    }

    private void requireLeaseLocked(GenerationLease lease) {
        Instant now = clock.instant();
        boolean owned = jdbc.query("select id from overview_generations where id=? and user_id=? "
                        + "and status='ACTIVE' and owner_id=? and fence=? and lease_until>? for update",
                (ResultSetExtractor<Boolean>) rs -> rs.next(), lease.generationId(), lease.userId(), lease.ownerId(),
                lease.fence(), sqlTimestamp(now));
        if (!owned) throw leaseLost(lease.leaseUntil());
    }

    private AiUsageLimitException leaseLost(Instant leaseUntil) {
        Instant now = clock.instant();
        Instant resetAt = leaseUntil != null && leaseUntil.isAfter(now) ? leaseUntil : now.plusSeconds(1);
        long retryAfterSeconds = Math.max(1, Duration.between(now, resetAt).toSeconds());
        return new AiUsageLimitException("AI_CONCURRENCY_LIMIT", 429, retryAfterSeconds, resetAt);
    }

    private void requireLeaseBinding(GenerationLease lease, String profileFingerprint, String algorithmVersion) {
        Objects.requireNonNull(lease);
        if (!lease.profileFingerprint().equals(normalizeHash(profileFingerprint))
                || !lease.algorithmVersion().equals(algorithmVersion)) {
            throw new IllegalArgumentException("Checkpoint does not match the active generation profile");
        }
    }

    private Checkpoint verifiedCheckpoint(String payload, String hash, int storedSchemaVersion, int expectedSchemaVersion) {
        if (payload == null || payload.length() > MAX_PAYLOAD_CHARS || storedSchemaVersion != expectedSchemaVersion
                || !sha256(payload).equals(hash == null ? null : hash.trim())) {
            throw new DomainException("VALIDATION_FAILED", "Stored Overview checkpoint failed integrity validation");
        }
        return new Checkpoint(payload, hash.trim(), storedSchemaVersion);
    }

    private void verifyResult(String payload, String hash) {
        if (payload == null || payload.length() > MAX_PAYLOAD_CHARS
                || !sha256(payload).equals(hash == null ? null : hash.trim())) {
            throw new DomainException("VALIDATION_FAILED", "Stored Overview response failed integrity validation");
        }
    }

    /** Clears expired private payloads while retaining all request and budget lineage metadata. */
    public int cleanupExpiredPayloads() {
        return transactions.execute(status -> {
            Instant now = clock.instant();
            int results = jdbc.update("update overview_generations set result_json=null,result_sha256=null "
                            + "where status='SUCCESS' and result_expires_at<=? and result_json is not null",
                    sqlTimestamp(now));
            Instant checkpointCutoff = now.minus(Duration.ofDays(CHECKPOINT_RETENTION_DAYS));
            int checkpoints = jdbc.update("delete from overview_generation_checkpoints where generation_id in "
                            + "(select id from overview_generations where (status<>'ACTIVE' and updated_at<=?) "
                            + "or (status='ACTIVE' and lease_until<=?))",
                    sqlTimestamp(checkpointCutoff), sqlTimestamp(checkpointCutoff));
            return results + checkpoints;
        });
    }

    @Scheduled(fixedDelay = 3_600_000L)
    public void cleanupExpiredPayloadsScheduled() {
        cleanupExpiredPayloads();
    }

    private void validate(Request request) {
        Objects.requireNonNull(request);
        Objects.requireNonNull(request.userId());
        Objects.requireNonNull(request.requestId());
        Objects.requireNonNull(request.scopeId());
        if (!"SOURCE".equals(request.scopeType()) && !"SUBJECT".equals(request.scopeType())) {
            throw new IllegalArgumentException("Overview scope type is invalid");
        }
        if (("SOURCE".equals(request.scopeType())) != (request.sourceRevision() != null)) {
            throw new IllegalArgumentException("Overview source revision does not match scope");
        }
        normalizeHash(request.inputFingerprint());
        normalizeHash(request.payloadFingerprint());
        normalizeHash(request.profileFingerprint());
        if (request.algorithmVersion() == null || request.algorithmVersion().isBlank()
                || request.algorithmVersion().length() > 64) {
            throw new IllegalArgumentException("Overview algorithm version is invalid");
        }
    }

    private void validateStep(String stepKey, String inputHash, String profileHash, String algorithmVersion, int schemaVersion) {
        if (stepKey == null || !STEP_KEY.matcher(stepKey).matches() || schemaVersion <= 0
                || algorithmVersion == null || algorithmVersion.isBlank() || algorithmVersion.length() > 64) {
            throw new IllegalArgumentException("Overview checkpoint identity is invalid");
        }
        normalizeHash(inputHash);
        normalizeHash(profileHash);
    }

    private String normalizeHash(String hash) {
        if (hash == null) throw new IllegalArgumentException("Fingerprint is required");
        String normalized = hash.trim().toLowerCase(Locale.ROOT);
        if (!SHA256.matcher(normalized).matches()) throw new IllegalArgumentException("Fingerprint must be SHA-256");
        return normalized;
    }

    private String requirePayload(String payload) {
        if (payload == null || payload.isBlank() || payload.length() > MAX_PAYLOAD_CHARS) {
            throw new IllegalArgumentException("Overview private payload is empty or exceeds the storage limit");
        }
        return payload;
    }

    private RecoveryMetadata recoveryMetadata(int count, List<String> actions) {
        if (count < 0 || actions == null || actions.size() > 64) {
            throw new IllegalArgumentException("Overview recovery metadata is invalid");
        }
        StringBuilder json = new StringBuilder("[");
        for (int i = 0; i < actions.size(); i++) {
            String action = actions.get(i);
            if (action == null || !SAFE_ACTION.matcher(action).matches()) {
                throw new IllegalArgumentException("Overview recovery action is invalid");
            }
            if (i > 0) json.append(',');
            json.append('"').append(action).append('"');
        }
        json.append(']');
        if (json.length() > MAX_METADATA_CHARS) throw new IllegalArgumentException("Recovery metadata exceeds its limit");
        return new RecoveryMetadata(count, json.toString());
    }

    private DomainException requestConflict(String message) {
        return new DomainException("RESOURCE_VERSION_CONFLICT", message);
    }

    private String sha256(String input) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(input.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is unavailable", exception);
        }
    }

    private String activeFingerprint(Request request) {
        return sha256(request.inputFingerprint() + ":" + Objects.toString(request.sourceRevision(), ""));
    }

    private OffsetDateTime sqlTimestamp(Instant instant) { return instant.atOffset(ZoneOffset.UTC); }

    private Instant instant(java.sql.ResultSet rs, String column) throws java.sql.SQLException {
        OffsetDateTime value = rs.getObject(column, OffsetDateTime.class);
        return value == null ? null : value.toInstant();
    }

    public enum AcquisitionState { OWNER, WAITER, REPLAY, FAILED }

    public record Request(UUID userId, UUID requestId, String scopeType, UUID scopeId, UUID sourceRevision,
                          String inputFingerprint, String payloadFingerprint, String profileFingerprint,
                          String algorithmVersion) { }

    public record Acquisition(AcquisitionState state, UUID generationId, GenerationLease lease,
                              UUID budgetTaskId, String resultJson) { }

    public record GenerationLease(UUID generationId, UUID userId, String scopeType, UUID scopeId,
                                  UUID sourceRevision, String inputFingerprint, String profileFingerprint,
                                  String algorithmVersion, UUID budgetTaskId, UUID ownerId, long fence,
                                  Instant leaseUntil) { }

    public record FailureDetails(int status, long retryAfterSeconds, Instant resetAt) {
        public FailureDetails {
            if (status != 413 && status != 422 && status != 429 && status != 503) {
                throw new IllegalArgumentException("Failure status is not a supported usage limit status");
            }
            if (retryAfterSeconds < 0) throw new IllegalArgumentException("Retry after seconds cannot be negative");
        }
    }

    public record AwaitResult(String status, String resultJson, String errorCode, FailureDetails failureDetails) {
        public AwaitResult(String status, String resultJson, String errorCode) {
            this(status, resultJson, errorCode, null);
        }
    }

    public record Checkpoint(String payloadJson, String payloadSha256, int schemaVersion) { }

    private record RequestRow(UUID generationId, String inputFingerprint, String payloadFingerprint,
                              String profileFingerprint, String algorithmVersion) { }

    private record GenerationRow(UUID id, UUID userId, String scopeType, UUID scopeId, UUID sourceRevision,
                                 String inputFingerprint, String payloadFingerprint, String profileFingerprint, String algorithmVersion,
                                 UUID budgetTaskId, String status, UUID ownerId, long fence, Instant leaseUntil,
                                 String resultJson, String resultSha256, Instant resultExpiresAt, String errorCode) { }

    private record RecoveryMetadata(int count, String actionsJson) { }
}
