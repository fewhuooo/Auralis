package com.auralis.app.ai;

import com.auralis.app.ai.usage.AiFeature;
import com.auralis.app.ai.usage.AiTaskContext;
import com.auralis.app.shared.error.DomainException;
import com.auralis.app.shared.config.AuralisProperties;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Base64;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

import static com.auralis.app.ai.OverviewJobDtos.Stage;
import static com.auralis.app.ai.OverviewJobDtos.Status;

@Repository
public class OverviewJobRepository {
    private static final String COLUMNS = "id,user_id,client_request_id,generation_request_id,scope_type,scope_id,mode,"
            + "request_hash,request_json,source_manifest_json,input_fingerprint,profile_fingerprint,algorithm_version,"
            + "publication_base_version,publication_base_result_id,publication_base_result_version,"
            + "generation_id,budget_task_id,status,stage,verified_nodes,total_nodes,version,worker_owner_id,worker_fence,"
            + "lease_until,deadline_at,pause_requested,cancel_requested,candidate_json,safe_error_code,created_at,updated_at,completed_at";
    private final JdbcTemplate jdbc;
    private final Clock clock;
    private final AuralisProperties.OverviewLimits overviewLimits;

    OverviewJobRepository(JdbcTemplate jdbc, Clock clock) {
        this(jdbc, clock, AuralisProperties.OverviewLimits.withoutAdditionalCaps());
    }

    @Autowired
    public OverviewJobRepository(JdbcTemplate jdbc, Clock clock, AuralisProperties properties) {
        this(jdbc, clock, properties == null ? AuralisProperties.OverviewLimits.withoutAdditionalCaps()
                : properties.ai().overviewLimits());
    }

    OverviewJobRepository(JdbcTemplate jdbc, Clock clock, AuralisProperties.OverviewLimits overviewLimits) {
        this.jdbc = jdbc;
        this.clock = clock;
        this.overviewLimits = overviewLimits == null
                ? AuralisProperties.OverviewLimits.withoutAdditionalCaps() : overviewLimits;
    }

    @Transactional
    public void lockActiveUser(UUID userId) {
        requireActiveUserLocked(userId);
    }

    @Transactional
    public JobRow enqueue(UUID userId, OverviewJobDtos.StartRequest request, Snapshot snapshot) {
        return enqueue(userId, request, snapshot, new PublicationBaseline(0, null, null));
    }

    @Transactional
    public JobRow enqueue(UUID userId, OverviewJobDtos.StartRequest request, Snapshot snapshot,
                          PublicationBaseline baseline) {
        validateSnapshotPayload(snapshot);
        requireActiveUserLocked(userId);
        JobRow replay = jdbc.query("select " + COLUMNS + " from overview_generation_jobs "
                        + "where user_id=? and client_request_id=? for update",
                (rs, row) -> map(rs), userId, request.clientRequestId()).stream().findFirst().orElse(null);
        if (replay != null) {
            if (!replay.requestHash().equals(snapshot.requestHash())) throw conflict("clientRequestId is bound to another Overview job request");
            return replay;
        }
        JobRow active = jdbc.query("select " + COLUMNS + " from overview_generation_jobs where user_id=? "
                        + "and scope_type=? and scope_id=? and status in ('QUEUED','RUNNING','PAUSING','PAUSED','CANCELLING') "
                        + "order by created_at desc,id desc limit 1 for update",
                (rs, row) -> map(rs), userId, request.scope().name(), snapshot.scopeId()).stream().findFirst().orElse(null);
        if (active != null) {
            if (active.requestHash().equals(snapshot.requestHash())) return active;
            throw conflict("An Overview job for this scope is already active");
        }
        Instant now = clock.instant();
        UUID id = UUID.randomUUID();
        UUID generationRequestId = UUID.randomUUID();
        jdbc.update("insert into overview_generation_jobs (id,user_id,client_request_id,generation_request_id,scope_type,scope_id,mode,"
                        + "request_hash,request_json,source_manifest_json,input_fingerprint,profile_fingerprint,algorithm_version,"
                        + "publication_base_version,publication_base_result_id,publication_base_result_version,"
                        + "status,stage,version,created_at,updated_at) values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'QUEUED','QUEUED',1,?,?)",
                id, userId, request.clientRequestId(), generationRequestId, request.scope().name(), snapshot.scopeId(),
                request.mode().name(), snapshot.requestHash(), snapshot.requestJson(), snapshot.sourceManifestJson(),
                snapshot.inputFingerprint(), snapshot.profileFingerprint(), snapshot.algorithmVersion(),
                baseline.logicalVersion(), baseline.resultId(), baseline.physicalVersion(), timestamp(now), timestamp(now));
        return getOwnedLocked(userId, id);
    }

    @Transactional(readOnly = true, noRollbackFor = DomainException.class)
    public JobRow get(UUID userId, UUID id) {
        return owned(userId, id);
    }

    @Transactional(readOnly = true)
    public OverviewJobDtos.JobList list(UUID userId, int limit, String cursor, OverviewJobDtos.Scope scope, UUID scopeId,
                                        java.util.function.Function<JobRow, OverviewJobDtos.JobView> view) {
        if (limit < 1 || limit > 50) throw new DomainException("VALIDATION_FAILED", "limit must be between 1 and 50");
        Cursor after = decodeCursor(cursor, userId, scope, scopeId);
        if (scope != null) {
            String table = scope == OverviewJobDtos.Scope.SOURCE ? "sources" : "subjects";
            Integer owned = jdbc.queryForObject("select count(*) from " + table + " where id=? and user_id=? and deleted_at is null",
                    Integer.class, scopeId, userId);
            if (owned == null || owned != 1) throw new DomainException("RESOURCE_NOT_FOUND", "Overview job scope was not found");
        }
        String filter = scope == null ? "" : "and scope_type=? and scope_id=? ";
        String sql = "select " + COLUMNS + " from overview_generation_jobs where user_id=? "
                + filter
                + (after == null ? "" : "and (created_at<? or (created_at=? and id<?)) ")
                + "order by created_at desc,id desc limit ?";
        List<Object> args = new java.util.ArrayList<>();
        args.add(userId);
        if (scope != null) { args.add(scope.name()); args.add(scopeId); }
        if (after != null) { args.add(timestamp(after.createdAt())); args.add(timestamp(after.createdAt())); args.add(after.id()); }
        args.add(limit + 1);
        List<JobRow> rows = jdbc.query(sql, (rs, row) -> map(rs), args.toArray());
        boolean more = rows.size() > limit;
        List<JobRow> page = more ? rows.subList(0, limit) : rows;
        String next = more && !page.isEmpty() ? encodeCursor(page.getLast(), userId, scope, scopeId) : null;
        return new OverviewJobDtos.JobList(page.stream().map(view).toList(), next);
    }

    @Transactional
    public JobRow control(UUID userId, UUID id, int expectedVersion, Control control) {
        requireActiveUserLocked(userId);
        JobRow row = getOwnedLocked(userId, id);
        if (row.version() != expectedVersion) throw conflict("Overview job version changed");
        Instant now = clock.instant();
        switch (control) {
            case PAUSE -> {
                if (row.status() == Status.PAUSED || row.status() == Status.PAUSING) return row;
                if (row.status() == Status.QUEUED) updateControl(row, Status.PAUSED, "pause_requested=true", now);
                else if (row.status() == Status.RUNNING) updateControl(row, Status.PAUSING, "pause_requested=true", now);
                else throw conflict("Overview job cannot be paused in its current state");
            }
            case RESUME -> {
                if (row.status() == Status.QUEUED || row.status() == Status.RUNNING) return row;
                if (row.status() != Status.PAUSED && row.status() != Status.FAILED) throw conflict("Overview job cannot be resumed in its current state");
                if (row.deadlineAt() != null && !row.deadlineAt().isAfter(now)) {
                    updateControl(row, Status.EXPIRED, "pause_requested=false,worker_owner_id=null,lease_until=null,worker_fence=worker_fence+1", now);
                    if (row.generationId() != null) revokeGeneration(userId, row.generationId(), now);
                } else updateControl(row, Status.QUEUED, "pause_requested=false", now);
            }
            case CANCEL -> {
                if (row.status() == Status.CANCELLED || row.status() == Status.CANCELLING) return row;
                if (row.status() == Status.COMPLETED || row.status() == Status.FAILED || row.status() == Status.EXPIRED) {
                    throw conflict("Overview job cannot be cancelled in its current state");
                }
                Status next = row.status() == Status.QUEUED || row.status() == Status.PAUSED
                        ? Status.CANCELLED : Status.CANCELLING;
                jdbc.update("update overview_generation_jobs set status=?,cancel_requested=true,worker_fence=worker_fence+1,"
                                + "worker_owner_id=null,lease_until=null,version=version+1,updated_at=? where id=? and user_id=? and version=?",
                        next.name(), timestamp(now), id, userId, expectedVersion);
                if (row.generationId() != null) revokeGeneration(userId, row.generationId(), now);
            }
            case RECONCILE -> throw new UnsupportedOperationException("Reconciliation requires exact invocation ledger checks");
        }
        return getOwnedLocked(userId, id);
    }

    @Transactional
    public JobRow claimNext(UUID workerId, long leaseMillis, long maxDurationMillis) {
        UUID candidate = jdbc.query("select id from overview_generation_jobs where status='QUEUED' or status='CANCELLING' "
                        + "or (status in ('RUNNING','PAUSING') and lease_until<=?) order by created_at,id limit 1",
                rs -> rs.next() ? rs.getObject(1, UUID.class) : null, timestamp(clock.instant()));
        if (candidate == null) return null;
        UUID userId = jdbc.query("select user_id from overview_generation_jobs where id=?", rs -> rs.next() ? rs.getObject(1, UUID.class) : null, candidate);
        if (userId == null) return null;
        requireActiveUserLocked(userId);
        JobRow row = jdbc.query("select " + COLUMNS + " from overview_generation_jobs where id=? for update",
                rs -> rs.next() ? map(rs) : null, candidate);
        if (row == null || !(row.status() == Status.QUEUED
                || row.status() == Status.CANCELLING
                || (row.status() == Status.RUNNING || row.status() == Status.PAUSING)
                && row.leaseUntil() != null && !row.leaseUntil().isAfter(clock.instant()))) return null;
        Instant now = clock.instant();
        if (row.status() == Status.CANCELLING) {
            jdbc.update("update overview_generation_jobs set status='CANCELLED',worker_owner_id=null,lease_until=null,"
                    + "completed_at=?,version=version+1,updated_at=? where id=? and status='CANCELLING'",
                    timestamp(now), timestamp(now), row.id());
            return null;
        }
        Instant deadline = row.deadlineAt() == null && maxDurationMillis != 0
                ? now.plusMillis(maxDurationMillis) : row.deadlineAt();
        if (deadline != null && !deadline.isAfter(now)) {
            jdbc.update("update overview_generation_jobs set status='EXPIRED',worker_owner_id=null,lease_until=null,"
                    + "worker_fence=worker_fence+1,version=version+1,updated_at=? where id=?", timestamp(now), row.id());
            if (row.generationId() != null) revokeGeneration(userId, row.generationId(), now);
            return null;
        }
        long nextFence = Math.addExact(row.workerFence(), 1);
        Instant until = now.plusMillis(deadline == null ? leaseMillis
                : Math.min(leaseMillis, deadline.toEpochMilli() - now.toEpochMilli()));
        int changed = jdbc.update("update overview_generation_jobs set status='RUNNING',worker_owner_id=?,worker_fence=?,"
                        + "lease_until=?,deadline_at=?,stage=case when stage='QUEUED' then 'VALIDATING' else stage end,"
                        + "version=version+1,updated_at=? where id=? and version=?",
                workerId, nextFence, timestamp(until), timestamp(deadline), timestamp(now), row.id(), row.version());
        return changed == 1 ? getOwnedLocked(userId, row.id()) : null;
    }

    @Transactional
    public void bindGeneration(JobLease lease, UUID generationId, UUID taskId) {
        requireUserLocked(lease.userId());
        JobRow current = getOwnedLocked(lease.userId(), lease.jobId());
        requireJobLease(current, lease);
        Instant now = clock.instant();
        int changed = jdbc.update("update overview_generation_jobs set generation_id=?,budget_task_id=?,updated_at=?,version=version+1 "
                        + "where id=? and user_id=? and status='RUNNING' and worker_owner_id=? and worker_fence=? "
                        + "and lease_until>? and (deadline_at is null or deadline_at>?) and generation_id is null",
                generationId, taskId, timestamp(now), lease.jobId(), lease.userId(), lease.workerId(), lease.fence(), timestamp(now), timestamp(now));
        if (changed == 0) {
            JobRow row = getOwnedLocked(lease.userId(), lease.jobId());
            if (!Objects.equals(row.generationId(), generationId) || !Objects.equals(row.budgetTaskId(), taskId)) throw stale();
        }
    }

    @Transactional
    public boolean recordInvocation(JobLease job, UUID generationId, UUID taskId, UUID reservationId,
                                    String purpose, String stage, UUID generationOwner, long generationFence) {
        UUID userId = job == null ? jdbc.query("select user_id from overview_generations where id=?", rs -> rs.next() ? rs.getObject(1, UUID.class) : null, generationId) : job.userId();
        if (userId == null) throw stale();
        requireActiveUserLocked(userId);
        if (job != null) {
            JobRow row = getOwnedLocked(userId, job.jobId());
            requireJobLease(row, job);
            if (row.deadlineAt() != null && !row.deadlineAt().isAfter(clock.instant())
                    || row.leaseUntil() == null || !row.leaseUntil().isAfter(clock.instant())) throw stale();
            if (!Objects.equals(row.generationId(), generationId) || !Objects.equals(row.budgetTaskId(), taskId)) throw stale();
        } else {
            requireGenerationOwner(generationId, userId, generationOwner, generationFence, taskId);
        }
        UUID ledgerTaskId = ledgerTaskId(generationId, userId, taskId);
        jdbc.update("insert into overview_generation_invocations (id,job_id,generation_id,task_id,reservation_id,user_id,"
                        + "purpose,stage,owner_id,generation_fence,job_fence) values (?,?,?,?,?,?,?,?,?,?,?)",
                UUID.randomUUID(), job == null ? null : job.jobId(), generationId, ledgerTaskId, reservationId, userId, purpose, stage,
                generationOwner, generationFence, job == null ? null : job.fence());
        return true;
    }

    @Transactional
    public void beforeDispatch(JobLease job, UUID generationId, UUID taskId, UUID reservationId,
                              UUID generationOwner, long generationFence) {
        UUID userId = job == null ? jdbc.query("select user_id from overview_generations where id=?", rs -> rs.next() ? rs.getObject(1, UUID.class) : null, generationId) : job.userId();
        if (userId == null) throw stale();
        requireActiveUserLocked(userId);
        if (job != null) {
            JobRow row = getOwnedLocked(userId, job.jobId());
            requireJobLease(row, job);
            if (row.deadlineAt() != null && !row.deadlineAt().isAfter(clock.instant())
                    || row.leaseUntil() == null || !row.leaseUntil().isAfter(clock.instant())) throw stale();
            if (row.pauseRequested() || row.cancelRequested() || !Objects.equals(row.generationId(), generationId)
                    || !Objects.equals(row.budgetTaskId(), taskId)) throw stale();
        }
        String generationStatus = jdbc.query("select status from overview_generations where id=? and user_id=? "
                        + "and owner_id=? and fence=? and budget_task_id=? and lease_until>? for update",
                rs -> rs.next() ? rs.getString(1) : null, generationId, userId, generationOwner,
                generationFence, taskId, timestamp(clock.instant()));
        if (!"ACTIVE".equals(generationStatus)) throw stale();
        UUID ledgerTaskId = ledgerTaskId(generationId, userId, taskId);
        Integer invocationCount = jdbc.queryForObject("select count(*) from overview_generation_invocations "
                        + "where reservation_id=? and generation_id=? and task_id=? and user_id=? "
                        + (job == null ? "and job_id is null and job_fence is null" : "and job_id=? and job_fence=?"),
                Integer.class, job == null
                        ? new Object[]{reservationId, generationId, ledgerTaskId, userId}
                        : new Object[]{reservationId, generationId, ledgerTaskId, userId, job.jobId(), job.fence()});
        if (invocationCount == null || invocationCount != 1) throw stale();
    }

    private UUID ledgerTaskId(UUID generationId, UUID userId, UUID budgetTaskId) {
        String scopeType = jdbc.query("select scope_type from overview_generations where id=? and user_id=? and budget_task_id=?",
                rs -> rs.next() ? rs.getString(1) : null, generationId, userId, budgetTaskId);
        if (scopeType == null) throw stale();
        AiFeature feature = "SOURCE".equals(scopeType) ? AiFeature.SOURCE_OVERVIEW : AiFeature.SUBJECT_OVERVIEW;
        return AiTaskContext.overviewLedgerTaskId(userId, feature, budgetTaskId);
    }

    private void requireGenerationOwner(UUID generationId, UUID userId, UUID ownerId, long fence, UUID taskId) {
        String state = jdbc.query("select status from overview_generations where id=? and user_id=? and owner_id=? "
                        + "and fence=? and budget_task_id=? and lease_until>? for update",
                rs -> rs.next() ? rs.getString(1) : null, generationId, userId, ownerId, fence, taskId, timestamp(clock.instant()));
        if (!"ACTIVE".equals(state)) throw stale();
    }

    @Transactional
    public boolean heartbeat(JobLease lease, long leaseMillis) {
        requireUserLocked(lease.userId());
        Instant now = clock.instant();
        JobRow row = getOwnedLocked(lease.userId(), lease.jobId());
        if ((row.status() != Status.RUNNING && row.status() != Status.PAUSING) || row.workerFence() != lease.fence()
                || !Objects.equals(row.workerOwnerId(), lease.workerId())
                || row.deadlineAt() != null && !row.deadlineAt().isAfter(now)) return false;
        Instant next = now.plusMillis(row.deadlineAt() == null ? leaseMillis
                : Math.min(leaseMillis, row.deadlineAt().toEpochMilli() - now.toEpochMilli()));
        return jdbc.update("update overview_generation_jobs set lease_until=?,updated_at=? where id=? and status in ('RUNNING','PAUSING') "
                        + "and worker_owner_id=? and worker_fence=? and lease_until>?",
                timestamp(next), timestamp(now), lease.jobId(), lease.workerId(), lease.fence(), timestamp(now)) == 1;
    }

    @Transactional
    public boolean expireOneOverdue() {
        Instant now = clock.instant();
        UUID id = jdbc.query("select id from overview_generation_jobs where status in "
                        + "('QUEUED','RUNNING','PAUSING','PAUSED','FAILED','RECOVERY_REQUIRED') and deadline_at<=? "
                        + "and (status not in ('RUNNING','PAUSING') or lease_until is null or lease_until<=?) order by deadline_at,id limit 1",
                rs -> rs.next() ? rs.getObject(1, UUID.class) : null, timestamp(now), timestamp(now));
        if (id == null) return false;
        UUID userId = jdbc.query("select user_id from overview_generation_jobs where id=?",
                rs -> rs.next() ? rs.getObject(1, UUID.class) : null, id);
        if (userId == null) return false;
        requireUserLocked(userId);
        JobRow row = getOwnedLocked(userId, id);
        if (row.deadlineAt() == null || row.deadlineAt().isAfter(now)
                || !List.of(Status.QUEUED, Status.RUNNING, Status.PAUSING, Status.PAUSED, Status.FAILED,
                Status.RECOVERY_REQUIRED).contains(row.status())
                || ((row.status() == Status.RUNNING || row.status() == Status.PAUSING)
                && row.leaseUntil() != null && row.leaseUntil().isAfter(now))) return false;
        int changed = jdbc.update("update overview_generation_jobs set status='EXPIRED',worker_owner_id=null,lease_until=null,"
                        + "worker_fence=worker_fence+1,version=version+1,updated_at=? where id=? and version=?",
                timestamp(now), id, row.version());
        if (changed != 1) return false;
        if (row.generationId() != null) revokeGeneration(userId, row.generationId(), now);
        return true;
    }

    @Transactional
    public boolean updateProgress(JobLease lease, Stage stage, int verified, Integer total) {
        requireUserLocked(lease.userId());
        Instant now = clock.instant();
        return jdbc.update("update overview_generation_jobs set stage=?,verified_nodes=?,total_nodes=?,version=version+1,updated_at=? "
                        + "where id=? and user_id=? and status='RUNNING' and worker_owner_id=? and worker_fence=? and lease_until>? "
                        + "and (deadline_at is null or deadline_at>?) and verified_nodes<=? and (total_nodes is null or cast(? as integer) is null "
                        + "or cast(? as integer)>=total_nodes)",
                stage.name(), verified, total, timestamp(now), lease.jobId(), lease.userId(), lease.workerId(), lease.fence(),
                timestamp(now), timestamp(now), verified, total, total) == 1;
    }

    @Transactional
    public void finish(JobLease lease, String candidateJson) {
        requireUserLocked(lease.userId());
        Instant now = clock.instant();
        JobRow row = getOwnedLocked(lease.userId(), lease.jobId());
        requireJobLease(row, lease);
        if (row.cancelRequested() || row.pauseRequested()) throw stale();
        if (candidateJson == null || candidateJson.isBlank()
                || exceeds(overviewLimits.maxResultChars(), candidateJson.length())) {
            throw new DomainException("OVERVIEW_PROVIDER_OUTPUT_TOO_LARGE", "Overview candidate exceeds the configured storage limit");
        }
        int changed = jdbc.update("update overview_generation_jobs set status='COMPLETED',stage='COMPLETE',candidate_json=?,verified_nodes=coalesce(total_nodes,verified_nodes),"
                        + "worker_owner_id=null,lease_until=null,completed_at=?,version=version+1,updated_at=? where id=? and worker_owner_id=? and worker_fence=? "
                        + "and lease_until>? and (deadline_at is null or deadline_at>?)",
                candidateJson, timestamp(now), timestamp(now), lease.jobId(), lease.workerId(), lease.fence(), timestamp(now), timestamp(now));
        if (changed != 1) throw stale();
    }

    @Transactional
    public void fail(JobLease lease, String safeErrorCode, boolean recoveryRequired) {
        requireUserLocked(lease.userId());
        Instant now = clock.instant();
        Status next = recoveryRequired ? Status.RECOVERY_REQUIRED : Status.FAILED;
        jdbc.update("update overview_generation_jobs set status=?,safe_error_code=?,worker_owner_id=null,lease_until=null,"
                        + "version=version+1,updated_at=? where id=? and user_id=? and status in ('RUNNING','PAUSING') "
                        + "and worker_owner_id=? and worker_fence=? and lease_until>? and (deadline_at is null or deadline_at>?)",
                next.name(), safeCode(safeErrorCode), timestamp(now), lease.jobId(), lease.userId(), lease.workerId(), lease.fence(), timestamp(now), timestamp(now));
    }

    @Transactional
    public void pauseAtBoundary(JobLease lease) {
        requireUserLocked(lease.userId());
        Instant now = clock.instant();
        jdbc.update("update overview_generation_jobs set status='PAUSED',pause_requested=true,worker_owner_id=null,lease_until=null,"
                        + "version=version+1,updated_at=? where id=? and user_id=? and status in ('PAUSING','RUNNING') "
                        + "and pause_requested=true and worker_owner_id=? and worker_fence=? and lease_until>? and (deadline_at is null or deadline_at>?)",
                timestamp(now), lease.jobId(), lease.userId(), lease.workerId(), lease.fence(), timestamp(now), timestamp(now));
    }

    @Transactional(readOnly = true)
    public List<InvocationRow> invocations(UUID userId, UUID jobId) {
        return jdbc.query("select reservation_id,task_id,generation_id,user_id,purpose,stage,owner_id,generation_fence,job_fence "
                        + "from overview_generation_invocations where user_id=? and job_id=? order by created_at,id",
                (rs, row) -> new InvocationRow(rs.getObject("reservation_id", UUID.class), rs.getObject("task_id", UUID.class),
                        rs.getObject("generation_id", UUID.class), rs.getObject("user_id", UUID.class), rs.getString("purpose"),
                        rs.getString("stage"), rs.getObject("owner_id", UUID.class), rs.getLong("generation_fence"),
                        rs.getObject("job_fence", Long.class)), userId, jobId);
    }

    @Transactional(readOnly = true)
    public List<InvocationRow> generationInvocations(UUID userId, UUID generationId) {
        return jdbc.query("select reservation_id,task_id,generation_id,user_id,purpose,stage,owner_id,generation_fence,job_fence "
                        + "from overview_generation_invocations where user_id=? and generation_id=? order by created_at,id",
                (rs, row) -> new InvocationRow(rs.getObject("reservation_id", UUID.class), rs.getObject("task_id", UUID.class),
                        rs.getObject("generation_id", UUID.class), rs.getObject("user_id", UUID.class), rs.getString("purpose"),
                        rs.getString("stage"), rs.getObject("owner_id", UUID.class), rs.getLong("generation_fence"),
                        rs.getObject("job_fence", Long.class)), userId, generationId);
    }

    @Transactional
    public JobRow markRecoveryRequired(UUID userId, UUID id, String code, int expectedVersion) {
        requireActiveUserLocked(userId);
        JobRow row = getOwnedLocked(userId, id);
        if (row.version() != expectedVersion) throw conflict("Overview job version changed");
        if (row.status() == Status.RECOVERY_REQUIRED) return row;
        int changed = jdbc.update("update overview_generation_jobs set status='RECOVERY_REQUIRED',safe_error_code=?,worker_owner_id=null,"
                        + "lease_until=null,worker_fence=worker_fence+1,version=version+1,updated_at=? where id=? and user_id=? "
                        + "and version=? and status in ('QUEUED','RUNNING','PAUSED','FAILED')",
                safeCode(code), timestamp(clock.instant()), id, userId, expectedVersion);
        if (changed != 1) throw conflict("Overview job recovery state changed");
        return getOwnedLocked(userId, id);
    }

    @Transactional
    public JobRow holdRecoveryRequired(UUID userId, UUID id, int expectedVersion) {
        requireActiveUserLocked(userId);
        JobRow row = getOwnedLocked(userId, id);
        if (row.version() != expectedVersion || row.status() != Status.RECOVERY_REQUIRED) {
            throw conflict("Overview job recovery state changed");
        }
        return row;
    }

    @Transactional
    public void finishCancelled(UUID userId, UUID id) {
        requireUserLocked(userId);
        Instant now = clock.instant();
        jdbc.update("update overview_generation_jobs set status='CANCELLED',worker_owner_id=null,lease_until=null,"
                        + "completed_at=coalesce(completed_at,?),version=version+1,updated_at=? where id=? and user_id=? "
                        + "and status='CANCELLING'",
                timestamp(now), timestamp(now), id, userId);
    }

    @Transactional
    public void reconcileToQueued(UUID userId, UUID id, int expectedVersion) {
        requireActiveUserLocked(userId);
        JobRow row = getOwnedLocked(userId, id);
        if (row.version() != expectedVersion || row.status() != Status.RECOVERY_REQUIRED) throw conflict("Overview job recovery state changed");
        if (row.deadlineAt() != null && !row.deadlineAt().isAfter(clock.instant())) {
            jdbc.update("update overview_generation_jobs set status='EXPIRED',worker_owner_id=null,lease_until=null,"
                            + "worker_fence=worker_fence+1,version=version+1,updated_at=? where id=? and version=?",
                    timestamp(clock.instant()), id, expectedVersion);
            if (row.generationId() != null) revokeGeneration(userId, row.generationId(), clock.instant());
            return;
        }
        jdbc.update("update overview_generation_jobs set status='QUEUED',safe_error_code=null,version=version+1,updated_at=? "
                        + "where id=? and user_id=? and status='RECOVERY_REQUIRED' and version=?",
                timestamp(clock.instant()), id, userId, expectedVersion);
    }

    private void updateControl(JobRow row, Status status, String assignments, Instant now) {
        jdbc.update("update overview_generation_jobs set status=?," + assignments + ",version=version+1,updated_at=? "
                        + "where id=? and user_id=? and version=?",
                status.name(), timestamp(now), row.id(), row.userId(), row.version());
    }

    private void revokeGeneration(UUID userId, UUID generationId, Instant now) {
        jdbc.update("update overview_generations set status='FAILED',active_fingerprint=null,owner_id=null,fence=fence+1,"
                        + "lease_until=null,error_code='OVERVIEW_GENERATION_FAILED',updated_at=? where id=? and user_id=? and status='ACTIVE'",
                timestamp(now), generationId, userId);
    }

    private JobRow owned(UUID userId, UUID id) {
        JobRow row = jdbc.query("select " + COLUMNS + " from overview_generation_jobs where user_id=? and id=?",
                rs -> rs.next() ? map(rs) : null, userId, id);
        if (row == null) throw new DomainException("RESOURCE_NOT_FOUND", "Overview job was not found");
        return row;
    }

    private JobRow getOwnedLocked(UUID userId, UUID id) {
        JobRow row = jdbc.query("select " + COLUMNS + " from overview_generation_jobs where user_id=? and id=? for update",
                rs -> rs.next() ? map(rs) : null, userId, id);
        if (row == null) throw new DomainException("RESOURCE_NOT_FOUND", "Overview job was not found");
        return row;
    }

    private void requireActiveUserLocked(UUID userId) {
        requireUserLocked(userId);
        String state = jdbc.query("select status from users where id=? for update", rs -> rs.next() ? rs.getString(1) : null, userId);
        if (!"ACTIVE".equals(state)) throw new DomainException("UNAUTHENTICATED", "The account is unavailable");
    }

    private void validateSnapshotPayload(Snapshot snapshot) {
        if (snapshot == null || snapshot.requestJson() == null || snapshot.requestJson().length() < 2
                || exceeds(overviewLimits.maxJobRequestChars(), snapshot.requestJson().length())
                || snapshot.sourceManifestJson() == null || snapshot.sourceManifestJson().length() < 2
                || exceeds(overviewLimits.maxSourceManifestChars(), snapshot.sourceManifestJson().length())) {
            throw new DomainException("VALIDATION_FAILED", "Overview job request or source manifest exceeds its configured storage limit");
        }
    }

    private static boolean exceeds(long maximum, long actual) {
        return maximum > 0 && actual > maximum;
    }

    private void requireUserLocked(UUID userId) {
        jdbc.query("select id from users where id=? for update", rs -> rs.next() ? rs.getObject(1, UUID.class) : null, userId);
    }

    private void requireJobLease(JobRow row, JobLease lease) {
        Instant now = clock.instant();
        if (row.status() != Status.RUNNING || !Objects.equals(row.workerOwnerId(), lease.workerId())
                || row.workerFence() != lease.fence() || row.deadlineAt() != null && !row.deadlineAt().isAfter(now)
                || row.leaseUntil() == null || !row.leaseUntil().isAfter(now)) throw stale();
    }

    private JobRow map(java.sql.ResultSet rs) throws java.sql.SQLException {
        return new JobRow(rs.getObject("id", UUID.class), rs.getObject("user_id", UUID.class),
                rs.getObject("client_request_id", UUID.class), rs.getObject("generation_request_id", UUID.class),
                rs.getString("scope_type"), rs.getObject("scope_id", UUID.class), rs.getString("mode"),
                rs.getString("request_hash").trim(), rs.getString("request_json"), rs.getString("source_manifest_json"),
                rs.getString("input_fingerprint").trim(), rs.getString("profile_fingerprint").trim(), rs.getString("algorithm_version"),
                rs.getObject("generation_id", UUID.class), rs.getObject("budget_task_id", UUID.class),
                Status.valueOf(rs.getString("status")), Stage.valueOf(rs.getString("stage")), rs.getInt("verified_nodes"),
                rs.getObject("total_nodes", Integer.class), rs.getInt("version"), rs.getObject("worker_owner_id", UUID.class),
                rs.getLong("worker_fence"), instant(rs, "lease_until"), instant(rs, "deadline_at"),
                rs.getBoolean("pause_requested"), rs.getBoolean("cancel_requested"), rs.getString("candidate_json"),
                rs.getString("safe_error_code"), instant(rs, "created_at"), instant(rs, "updated_at"), instant(rs, "completed_at"),
                rs.getLong("publication_base_version"), rs.getObject("publication_base_result_id", UUID.class),
                rs.getObject("publication_base_result_version", Long.class));
    }

    private Cursor decodeCursor(String value, UUID userId, OverviewJobDtos.Scope scope, UUID scopeId) {
        if (value == null || value.isBlank()) return null;
        try {
            String[] parts = new String(Base64.getUrlDecoder().decode(value), StandardCharsets.UTF_8).split("\\|", 5);
            String expectedScope = scope == null ? "-" : scope.name();
            String expectedScopeId = scopeId == null ? "-" : scopeId.toString();
            if (parts.length != 5 || !parts[0].equals(userId.toString()) || !parts[1].equals(expectedScope)
                    || !parts[2].equals(expectedScopeId)) throw new IllegalArgumentException("cursor domain");
            return new Cursor(Instant.parse(parts[3]), UUID.fromString(parts[4]));
        } catch (RuntimeException invalid) {
            throw new DomainException("VALIDATION_FAILED", "Overview job cursor is invalid");
        }
    }

    private String encodeCursor(JobRow row, UUID userId, OverviewJobDtos.Scope scope, UUID scopeId) {
        String domain = userId + "|" + (scope == null ? "-" : scope.name()) + "|"
                + (scopeId == null ? "-" : scopeId) + "|" + row.createdAt() + "|" + row.id();
        return Base64.getUrlEncoder().withoutPadding().encodeToString(domain.getBytes(StandardCharsets.UTF_8));
    }

    private static String safeCode(String value) { return value != null && value.matches("[A-Z0-9_]{1,64}") ? value : "OVERVIEW_GENERATION_FAILED"; }
    private static Instant instant(java.sql.ResultSet rs, String column) throws java.sql.SQLException {
        OffsetDateTime value = rs.getObject(column, OffsetDateTime.class);
        return value == null ? null : value.toInstant();
    }
    private static OffsetDateTime timestamp(Instant value) { return value == null ? null : value.atOffset(ZoneOffset.UTC); }
    private static DomainException conflict(String message) { return new DomainException("RESOURCE_VERSION_CONFLICT", message); }
    private static DomainException stale() { return new DomainException("OVERVIEW_RECOVERY_EXHAUSTED", "Overview job ownership or invocation authorization changed"); }

    public enum Control { PAUSE, RESUME, CANCEL, RECONCILE }
    public record Snapshot(UUID scopeId, String requestHash, String requestJson, String sourceManifestJson,
                           String inputFingerprint, String profileFingerprint, String algorithmVersion) { }
    public record PublicationBaseline(long logicalVersion, UUID resultId, Long physicalVersion) { }
    public record JobLease(UUID jobId, UUID userId, UUID workerId, long fence, Instant deadlineAt,
                           String inputFingerprint, String profileFingerprint, String algorithmVersion) { }
    public record InvocationRow(UUID reservationId, UUID taskId, UUID generationId, UUID userId, String purpose,
                                String stage, UUID generationOwner, long generationFence, Long jobFence) { }
    public record Cursor(Instant createdAt, UUID id) { }
    public record JobRow(UUID id, UUID userId, UUID clientRequestId, UUID generationRequestId, String scopeType,
                         UUID scopeId, String mode, String requestHash, String requestJson, String sourceManifestJson,
                         String inputFingerprint, String profileFingerprint, String algorithmVersion,
                         UUID generationId, UUID budgetTaskId, Status status, Stage stage, int verifiedNodes,
                         Integer totalNodes, int version, UUID workerOwnerId, long workerFence, Instant leaseUntil,
                         Instant deadlineAt, boolean pauseRequested, boolean cancelRequested, String candidateJson,
                         String safeErrorCode, Instant createdAt, Instant updatedAt, Instant completedAt,
                         long publicationBaseVersion, UUID publicationBaseResultId, Long publicationBaseResultVersion) {
        public JobLease lease() { return new JobLease(id, userId, workerOwnerId, workerFence, deadlineAt,
                inputFingerprint, profileFingerprint, algorithmVersion); }
    }
}
