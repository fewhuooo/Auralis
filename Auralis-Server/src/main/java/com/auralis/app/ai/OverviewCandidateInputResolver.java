package com.auralis.app.ai;

import com.auralis.app.ai.OverviewDtos.OverviewResponse;
import com.auralis.app.shared.error.DomainException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;

import java.util.List;
import java.util.Objects;
import java.util.UUID;

/** Resolves a completed native job into a server-owned raw input binding for the formal editor path. */
@Service
public class OverviewCandidateInputResolver {
    private final OverviewJobRepository jobs;
    private final OverviewGenerationService generationService;
    private final JdbcTemplate jdbc;
    private final ObjectMapper mapper;

    public OverviewCandidateInputResolver(OverviewJobRepository jobs, OverviewGenerationService generationService,
                                          JdbcTemplate jdbc, ObjectMapper mapper) {
        this.jobs = jobs;
        this.generationService = generationService;
        this.jdbc = jdbc;
        this.mapper = mapper;
    }

    @Transactional(readOnly = true, noRollbackFor = DomainException.class)
    public OverviewInputDescriptor resolve(UUID userId, String scopeType, UUID scopeId, OverviewMode requestedMode,
                                           OverviewResultCommand.CandidateInput reference) {
        if (reference == null || reference.jobId() == null || reference.jobVersion() == null
                || reference.jobVersion() <= 0 || requestedMode == null
                || requestedMode == OverviewMode.SUMMARY) {
            throw conflict("Candidate input reference is invalid");
        }

        // JobRepository.get is owner-scoped. The caller already holds the active-user mutation lock.
        OverviewJobRepository.JobRow job = jobs.get(userId, reference.jobId());
        if (job.status() != OverviewJobDtos.Status.COMPLETED || job.version() != reference.jobVersion()
                || job.candidateJson() == null || job.candidateJson().isBlank() || job.generationId() == null
                || !scopeType.equals(job.scopeType()) || !scopeId.equals(job.scopeId())) {
            throw conflict("Candidate job is incomplete, stale, or outside the requested scope");
        }

        OverviewJobDtos.StartRequest request = readRequest(job.requestJson());
        OverviewJobDtos.Mode jobMode;
        try {
            jobMode = OverviewJobDtos.Mode.valueOf(job.mode());
        } catch (RuntimeException invalid) {
            throw conflict("Candidate job mode is invalid");
        }
        if (request.scope() == null || request.mode() == null || !request.scope().name().equals(scopeType)
                || !scopeId.equals(request.scope() == OverviewJobDtos.Scope.SOURCE ? request.sourceId() : request.subjectId())
                || !request.mode().equals(jobMode)
                || (jobMode != OverviewJobDtos.Mode.ALL && jobMode != OverviewJobDtos.Mode.OUTLINE)
                || requestedMode == OverviewMode.ALL && jobMode != OverviewJobDtos.Mode.ALL
                || request.scope() == OverviewJobDtos.Scope.SOURCE
                    && (request.sourceId() == null || request.subjectId() != null || request.sourceIds() != null)
                || request.scope() == OverviewJobDtos.Scope.SUBJECT
                    && (request.subjectId() == null || request.sourceId() != null || request.sourceIds() == null
                        || request.sourceIds().isEmpty() || request.sourceIds().size() > 100
                        || request.sourceIds().stream().anyMatch(Objects::isNull)
                        || request.sourceIds().stream().distinct().count() != request.sourceIds().size())) {
            throw conflict("Candidate job request does not authorize this scope and mode");
        }

        OverviewJobRepository.Snapshot current = generationService.snapshotForJob(userId, request);
        if (!job.requestHash().equals(current.requestHash())
                || !job.sourceManifestJson().equals(current.sourceManifestJson())
                || !job.inputFingerprint().equals(current.inputFingerprint())
                || !job.profileFingerprint().equals(current.profileFingerprint())
                || !job.algorithmVersion().equals(current.algorithmVersion())) {
            throw conflict("Candidate job raw inputs or generation identity changed");
        }

        try {
            OverviewResponse retained = mapper.readValue(job.candidateJson(), OverviewResponse.class);
            if (retained == null || retained.outline() == null || retained.outline().isEmpty()
                    || jobMode == OverviewJobDtos.Mode.ALL && retained.summary() == null
                    || jobMode == OverviewJobDtos.Mode.OUTLINE && retained.summary() != null) {
                throw conflict("Candidate job no longer retains a valid completed result");
            }
        } catch (DomainException invalid) {
            throw invalid;
        } catch (Exception invalid) {
            throw new DomainException("RESOURCE_VERSION_CONFLICT", "Candidate job result is invalid", null, invalid);
        }

        PlanIdentity plan = jdbc.query("select input_fingerprint,profile_fingerprint,algorithm_version,mode "
                        + "from overview_execution_plans where generation_id=? and state='ASSEMBLED' "
                        + "order by created_at desc,id desc limit 1",
                rs -> rs.next() ? new PlanIdentity(rs.getString(1).trim(), rs.getString(2).trim(), rs.getString(3), rs.getString(4)) : null,
                job.generationId());
        if (plan == null || !job.inputFingerprint().equals(plan.inputFingerprint())
                || !job.profileFingerprint().equals(plan.profileFingerprint())
                || !job.algorithmVersion().equals(plan.algorithmVersion()) || !job.mode().equals(plan.mode())) {
            throw conflict("Candidate job has no matching assembled writer plan");
        }

        List<UUID> sourceIds = request.scope() == OverviewJobDtos.Scope.SOURCE
                ? List.of(request.sourceId()) : request.sourceIds();
        OverviewInputDescriptor descriptor = generationService.currentRawInputDescriptor(userId, request.scope(), scopeId, sourceIds);
        if (!descriptor.sourceIds().equals(sourceIds)) {
            throw conflict("Candidate job selected source order changed");
        }
        return descriptor;
    }

    private OverviewJobDtos.StartRequest readRequest(String json) {
        try {
            if (json == null || json.isBlank()) throw new IllegalArgumentException("empty request");
            return mapper.readValue(json, OverviewJobDtos.StartRequest.class);
        } catch (Exception invalid) {
            throw new DomainException("RESOURCE_VERSION_CONFLICT", "Candidate job request is invalid", null, invalid);
        }
    }

    private static DomainException conflict(String detail) {
        return new DomainException("RESOURCE_VERSION_CONFLICT", detail);
    }

    private record PlanIdentity(String inputFingerprint, String profileFingerprint, String algorithmVersion, String mode) { }
}
