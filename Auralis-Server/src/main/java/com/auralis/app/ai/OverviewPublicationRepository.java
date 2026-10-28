package com.auralis.app.ai;

import com.auralis.app.shared.error.DomainException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;

@Repository
public class OverviewPublicationRepository {
    private final JdbcTemplate jdbc;
    private final OverviewJobRepository jobs;
    private final Clock clock;

    public OverviewPublicationRepository(JdbcTemplate jdbc, OverviewJobRepository jobs, Clock clock) {
        this.jdbc = jdbc;
        this.jobs = jobs;
        this.clock = clock;
    }

    @Transactional
    public void lockScopeForRead(UUID userId, String scopeType, UUID scopeId, List<UUID> sourceIds) {
        jobs.lockActiveUser(userId);
        lockScope(userId, scopeType, scopeId, sourceIds);
    }

    @Transactional
    public Intent prepare(UUID userId, OverviewJobRepository.JobRow job, UUID planId, UUID clientPublishId,
                          int expectedVersion, long baseVersion, String requestHash, String candidateHash,
                          List<UUID> sourceIds) {
        jobs.lockActiveUser(userId);
        lockScope(userId, job.scopeType(), job.scopeId(), sourceIds);
        lockJob(userId, job.id());
        JobCurrent currentJob = jdbc.query("select status,version,publication_base_version,publication_base_result_id,publication_base_result_version "
                        + "from overview_generation_jobs where id=? and user_id=?",
                rs -> rs.next() ? new JobCurrent(OverviewJobDtos.Status.valueOf(rs.getString("status")), rs.getInt("version"),
                        rs.getLong("publication_base_version"), rs.getObject("publication_base_result_id", UUID.class),
                        rs.getObject("publication_base_result_version", Long.class)) : null, job.id(), userId);
        if (currentJob == null || currentJob.status() != OverviewJobDtos.Status.COMPLETED
                || currentJob.version() != expectedVersion || currentJob.publicationBaseVersion() != baseVersion
                || !java.util.Objects.equals(currentJob.publicationBaseResultId(), job.publicationBaseResultId())
                || !java.util.Objects.equals(currentJob.publicationBaseResultVersion(), job.publicationBaseResultVersion())) {
            throw conflict("Completed job version or captured baseline changed");
        }
        Integer generationLocked = jdbc.query("select id from overview_generations where id=? and user_id=? for update",
                rs -> rs.next() ? 1 : 0, job.generationId(), userId);
        String planState = jdbc.query("select state from overview_execution_plans where id=? and generation_id=? for update",
                rs -> rs.next() ? rs.getString(1) : null, planId, job.generationId());
        if (generationLocked == 0 || !"ASSEMBLED".equals(planState)) throw conflict("Completed plan is no longer publishable");
        Intent byClient = findByClient(userId, clientPublishId, true);
        Intent byJobPlan = findByJobPlan(job.id(), planId, true);
        if (byClient != null || byJobPlan != null) {
            Intent existing = byClient != null ? byClient : byJobPlan;
            if (byClient != null && byJobPlan != null && !byClient.id().equals(byJobPlan.id())) throw conflict("Publication intent identity conflicts");
            if (!existing.jobId().equals(job.id()) || !existing.planId().equals(planId)
                    || !existing.requestHash().equals(requestHash) || !existing.candidateHash().equals(candidateHash)
                    || !existing.clientPublishId().equals(clientPublishId) || existing.expectedJobVersion() != expectedVersion
                    || existing.baseVersion() != baseVersion || !java.util.Objects.equals(existing.baseResultId(), job.publicationBaseResultId())
                    || !java.util.Objects.equals(existing.baseResultVersion(), job.publicationBaseResultVersion())) {
                throw conflict("Publication intent is immutable");
            }
            return existing;
        }
        UUID id = UUID.randomUUID();
        UUID clientWriteId = UUID.randomUUID();
        Instant now = clock.instant();
        jdbc.update("insert into overview_publication_intents (id,user_id,job_id,generation_id,plan_id,client_publish_id,result_client_write_id,"
                        + "expected_job_version,request_hash,candidate_sha256,input_fingerprint,profile_fingerprint,algorithm_version,base_version,base_result_id,base_result_version,"
                        + "status,version,attempt_count,created_at,updated_at) values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'PENDING',1,0,?,?)",
                id, userId, job.id(), job.generationId(), planId, clientPublishId, clientWriteId, expectedVersion,
                requestHash, candidateHash, job.inputFingerprint(), job.profileFingerprint(), job.algorithmVersion(), baseVersion,
                job.publicationBaseResultId(), job.publicationBaseResultVersion(), timestamp(now), timestamp(now));
        return getById(userId, id, false);
    }

    @Transactional
    public Intent lockForCommit(UUID userId, UUID publicationId, UUID jobId, List<UUID> sourceIds) {
        jobs.lockActiveUser(userId);
        JobScope scope = jdbc.query("select scope_type,scope_id from overview_generation_jobs where id=? and user_id=?",
                rs -> rs.next() ? new JobScope(rs.getString(1), rs.getObject(2, UUID.class)) : null, jobId, userId);
        if (scope == null) throw new DomainException("RESOURCE_NOT_FOUND", "Overview job was not found");
        lockScope(userId, scope.scopeType(), scope.scopeId(), sourceIds);
        lockJob(userId, jobId);
        Intent observed = getById(userId, publicationId, false);
        if (observed == null || !observed.jobId().equals(jobId)) throw conflict("Publication intent belongs to another job");
        Integer generationLocked = jdbc.query("select id from overview_generations where id=? and user_id=? for update",
                rs -> rs.next() ? 1 : 0, observed.generationId(), userId);
        Integer planLocked = jdbc.query("select id from overview_execution_plans where id=? and generation_id=? for update",
                rs -> rs.next() ? 1 : 0, observed.planId(), observed.generationId());
        if (generationLocked == 0 || planLocked == 0) throw conflict("Publication generation or plan disappeared");
        Intent locked = getById(userId, publicationId, true);
        if (locked == null || !locked.jobId().equals(jobId)
                || !locked.generationId().equals(observed.generationId()) || !locked.planId().equals(observed.planId())) {
            throw conflict("Publication intent identity changed");
        }
        return locked;
    }

    @Transactional
    public void markPublished(UUID userId, UUID id, UUID resultId, long resultVersion) {
        Instant now = clock.instant();
        int changed = jdbc.update("update overview_publication_intents set status='PUBLISHED',result_id=?,result_version=?,published_at=?,"
                        + "updated_at=?,version=version+1,safe_error_code=null,retry_at=null where id=? and user_id=? and status='PENDING'",
                resultId, resultVersion, timestamp(now), timestamp(now), id, userId);
        if (changed != 1) throw conflict("Publication intent changed before commit");
    }

    @Transactional
    public void markConflict(UUID userId, UUID id, String safeCode) {
        jdbc.update("update overview_publication_intents set status='CONFLICT',safe_error_code=?,retry_at=null,updated_at=?,version=version+1 "
                        + "where id=? and user_id=? and status='PENDING'",
                safeCode, timestamp(clock.instant()), id, userId);
    }

    @Transactional
    public void markFailure(UUID userId, UUID id, String safeCode) {
        Instant now = clock.instant();
        jdbc.update("update overview_publication_intents set attempt_count=attempt_count+1,status=case when attempt_count+1>=3 then 'FAILED' else 'PENDING' end,"
                        + "safe_error_code=?,retry_at=case when attempt_count+1>=3 then null else ? end,updated_at=?,version=version+1 "
                        + "where id=? and user_id=? and status='PENDING' and attempt_count<3",
                safeCode, timestamp(now.plusSeconds(5L)), timestamp(now), id, userId);
    }

    @Transactional(readOnly = true)
    public Intent get(UUID userId, UUID jobId) {
        return jdbc.query("select id,user_id,job_id,generation_id,plan_id,client_publish_id,result_client_write_id,expected_job_version,request_hash,candidate_sha256,"
                        + "input_fingerprint,profile_fingerprint,algorithm_version,base_version,base_result_id,base_result_version,status,version,result_id,result_version,safe_error_code,retry_at,updated_at "
                        + "from overview_publication_intents where user_id=? and job_id=?",
                rs -> rs.next() ? map(rs) : null, userId, jobId);
    }

    @Transactional(readOnly = true)
    public List<Intent> pendingDue(Instant now, int limit) {
        return jdbc.query("select id,user_id,job_id,generation_id,plan_id,client_publish_id,result_client_write_id,expected_job_version,request_hash,candidate_sha256,"
                        + "input_fingerprint,profile_fingerprint,algorithm_version,base_version,base_result_id,base_result_version,status,version,result_id,result_version,safe_error_code,retry_at,updated_at "
                        + "from overview_publication_intents where status='PENDING' and attempt_count<3 and (retry_at is null or retry_at<=?) "
                        + "order by created_at,id limit ?",
                (rs, row) -> map(rs), timestamp(now), limit);
    }

    @Transactional(readOnly = true)
    public Intent getById(UUID userId, UUID id) { return getById(userId, id, false); }

    private Intent getById(UUID userId, UUID id, boolean forUpdate) {
        return jdbc.query("select id,user_id,job_id,generation_id,plan_id,client_publish_id,result_client_write_id,expected_job_version,request_hash,candidate_sha256,"
                        + "input_fingerprint,profile_fingerprint,algorithm_version,base_version,base_result_id,base_result_version,status,version,result_id,result_version,safe_error_code,retry_at,updated_at "
                        + "from overview_publication_intents where user_id=? and id=?" + (forUpdate ? " for update" : ""),
                rs -> rs.next() ? map(rs) : null, userId, id);
    }

    private Intent findByClient(UUID userId, UUID clientId, boolean lock) {
        return jdbc.query("select id,user_id,job_id,generation_id,plan_id,client_publish_id,result_client_write_id,expected_job_version,request_hash,candidate_sha256,"
                        + "input_fingerprint,profile_fingerprint,algorithm_version,base_version,base_result_id,base_result_version,status,version,result_id,result_version,safe_error_code,retry_at,updated_at "
                        + "from overview_publication_intents where user_id=? and client_publish_id=?" + (lock ? " for update" : ""),
                rs -> rs.next() ? map(rs) : null, userId, clientId);
    }

    private Intent findByJobPlan(UUID jobId, UUID planId, boolean lock) {
        return jdbc.query("select id,user_id,job_id,generation_id,plan_id,client_publish_id,result_client_write_id,expected_job_version,request_hash,candidate_sha256,"
                        + "input_fingerprint,profile_fingerprint,algorithm_version,base_version,base_result_id,base_result_version,status,version,result_id,result_version,safe_error_code,retry_at,updated_at "
                        + "from overview_publication_intents where job_id=? and plan_id=?" + (lock ? " for update" : ""),
                rs -> rs.next() ? map(rs) : null, jobId, planId);
    }

    private void lockScope(UUID userId, String scopeType, UUID scopeId, List<UUID> sourceIds) {
        List<UUID> subjects = "SOURCE".equals(scopeType)
                ? jdbc.query("select subject_id from sources where id=? and user_id=? and deleted_at is null",
                    (rs, row) -> rs.getObject(1, UUID.class), scopeId, userId)
                : List.of(scopeId);
        if (subjects.isEmpty()) throw new DomainException("RESOURCE_NOT_FOUND", "Overview scope was not found");
        for (UUID subjectId : subjects.stream().distinct().sorted().toList()) {
            Integer locked = jdbc.query("select id from subjects where id=? and user_id=? and deleted_at is null for update",
                    rs -> rs.next() ? 1 : 0, subjectId, userId);
            if (locked == 0) throw new DomainException("RESOURCE_NOT_FOUND", "Overview scope was not found");
        }
        List<UUID> ids = sourceIds == null || sourceIds.isEmpty() ? List.of(scopeId) : sourceIds;
        UUID expectedSubjectId = "SUBJECT".equals(scopeType) ? scopeId : subjects.getFirst();
        for (UUID sourceId : ids.stream().distinct().sorted().toList()) {
            Integer locked = jdbc.query("select id from sources where id=? and user_id=? and subject_id=? and deleted_at is null for update",
                    rs -> rs.next() ? 1 : 0, sourceId, userId, expectedSubjectId);
            if (locked == 0) throw new DomainException("RESOURCE_NOT_FOUND", "Overview source was not found");
        }
    }

    private void lockJob(UUID userId, UUID jobId) {
        Integer locked = jdbc.query("select id from overview_generation_jobs where id=? and user_id=? for update",
                rs -> rs.next() ? 1 : 0, jobId, userId);
        if (locked == 0) throw new DomainException("RESOURCE_NOT_FOUND", "Overview job was not found");
    }

    private Intent map(java.sql.ResultSet rs) throws java.sql.SQLException {
        OffsetDateTime retry = rs.getObject("retry_at", OffsetDateTime.class);
        OffsetDateTime updated = rs.getObject("updated_at", OffsetDateTime.class);
        return new Intent(rs.getObject("id", UUID.class), rs.getObject("user_id", UUID.class),
                rs.getObject("job_id", UUID.class), rs.getObject("generation_id", UUID.class),
                rs.getObject("plan_id", UUID.class), rs.getObject("client_publish_id", UUID.class),
                rs.getObject("result_client_write_id", UUID.class), rs.getInt("expected_job_version"), rs.getString("request_hash").trim(),
                rs.getString("candidate_sha256").trim(), rs.getString("input_fingerprint").trim(),
                rs.getString("profile_fingerprint").trim(), rs.getString("algorithm_version"),
                rs.getLong("base_version"), rs.getObject("base_result_id", UUID.class),
                rs.getObject("base_result_version", Long.class), OverviewPublicationDtos.State.valueOf(rs.getString("status")),
                rs.getInt("version"), rs.getObject("result_id", UUID.class), rs.getObject("result_version", Long.class),
                rs.getString("safe_error_code"), retry == null ? null : retry.toInstant(),
                updated == null ? null : updated.toInstant());
    }

    private static OffsetDateTime timestamp(Instant value) { return value.atOffset(ZoneOffset.UTC); }
    private static DomainException conflict(String detail) { return new DomainException("RESOURCE_VERSION_CONFLICT", detail); }
    private record JobScope(String scopeType, UUID scopeId) { }
    private record JobCurrent(OverviewJobDtos.Status status, int version, long publicationBaseVersion,
                              UUID publicationBaseResultId, Long publicationBaseResultVersion) { }

    public record Intent(UUID id, UUID userId, UUID jobId, UUID generationId, UUID planId,
                         UUID clientPublishId, UUID clientWriteId, int expectedJobVersion, String requestHash, String candidateHash,
                         String inputFingerprint, String profileFingerprint, String algorithmVersion,
                         long baseVersion, UUID baseResultId, Long baseResultVersion,
                         OverviewPublicationDtos.State state, int version,
                         UUID resultId, Long resultVersion, String safeErrorCode, Instant retryAt, Instant updatedAt) { }
}
