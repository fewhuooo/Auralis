package com.auralis.app.ai;

import com.auralis.app.ai.OverviewDtos.OverviewResponse;
import com.auralis.app.shared.error.DomainException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.ObjectMapper;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Clock;
import java.time.Instant;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;

@Service
public class OverviewPublicationService {
    private final OverviewPublicationRepository publications;
    private final OverviewJobRepository jobs;
    private final OverviewJobService jobService;
    private final OverviewGenerationService generationService;
    private final OverviewResultService resultService;
    private final JdbcTemplate jdbc;
    private final ObjectMapper mapper;
    private final Clock clock;
    private final TransactionTemplate transaction;

    public OverviewPublicationService(OverviewPublicationRepository publications, OverviewJobRepository jobs,
                                      OverviewJobService jobService, OverviewGenerationService generationService,
                                      OverviewResultService resultService, JdbcTemplate jdbc, ObjectMapper mapper,
                                      Clock clock, PlatformTransactionManager manager) {
        this.publications = publications;
        this.jobs = jobs;
        this.jobService = jobService;
        this.generationService = generationService;
        this.resultService = resultService;
        this.jdbc = jdbc;
        this.mapper = mapper;
        this.clock = clock;
        this.transaction = new TransactionTemplate(manager);
        this.transaction.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    }

    public OverviewPublicationDtos.PublicationView publish(UUID userId, UUID jobId,
                                                            OverviewPublicationDtos.PublishRequest request) {
        if (request == null || request.clientPublishId() == null || request.expectedVersion() <= 0 || request.baseVersion() < 0) {
            throw new DomainException("VALIDATION_FAILED", "clientPublishId, expectedVersion, and baseVersion are required");
        }
        OverviewJobRepository.JobRow job = jobs.get(userId, jobId);
        if (job.status() != OverviewJobDtos.Status.COMPLETED || job.candidateJson() == null
                || job.version() != request.expectedVersion()) {
            throw new DomainException("RESOURCE_VERSION_CONFLICT", "Only the expected completed Overview job can be published");
        }
        if (request.baseVersion() != job.publicationBaseVersion()) {
            throw new DomainException("RESOURCE_VERSION_CONFLICT", "Publication baseVersion differs from the job's captured baseline");
        }
        if (OverviewJobDtos.Mode.OUTLINE == OverviewJobDtos.Mode.valueOf(job.mode()) && request.baseVersion() == 0) {
            throw new DomainException("RESOURCE_VERSION_CONFLICT", "OUTLINE publication requires a current complete formal result");
        }
        UUID planId = activeAssembledPlan(job);
        OverviewResponse candidate = jobService.candidate(userId, jobId).result();
        String candidateHash = sha256(write(candidate));
        String requestHash = sha256(write(List.of(jobId, planId, request.clientPublishId(), request.expectedVersion(), request.baseVersion(), candidateHash)));
        OverviewJobDtos.StartRequest start = readRequest(job.requestJson());
        List<UUID> sourceIds = start.scope() == OverviewJobDtos.Scope.SOURCE ? List.of(start.sourceId()) : start.sourceIds();
        OverviewPublicationRepository.Intent intent = publications.prepare(userId, job, planId, request.clientPublishId(),
                request.expectedVersion(), request.baseVersion(), requestHash, candidateHash, sourceIds);
        if (intent.state() == OverviewPublicationDtos.State.PUBLISHED) return view(intent);
        if (intent.state() != OverviewPublicationDtos.State.PENDING
                || intent.retryAt() != null && intent.retryAt().isAfter(clock.instant())) return view(intent);
        try {
            OverviewResultView result = transaction.execute(status -> commit(userId, jobId, intent, candidateHash, sourceIds));
            OverviewPublicationRepository.Intent completed = publications.getById(userId, intent.id());
            return view(completed);
        } catch (DomainException conflict) {
            publications.markConflict(userId, intent.id(), safeCode(conflict));
            return view(publications.getById(userId, intent.id()));
        } catch (RuntimeException failure) {
            publications.markFailure(userId, intent.id(), "OVERVIEW_PUBLICATION_FAILED");
            return view(publications.getById(userId, intent.id()));
        }
    }

    public OverviewPublicationDtos.PublicationView get(UUID userId, UUID jobId) {
        jobs.get(userId, jobId);
        OverviewPublicationRepository.Intent intent = publications.get(userId, jobId);
        if (intent == null) return new OverviewPublicationDtos.PublicationView(null, jobId,
                OverviewPublicationDtos.State.PENDING, 0, null, null, null, null, clock.instant());
        return view(intent);
    }

    @Scheduled(fixedDelayString = "${auralis.ai.overview-publication-poll-ms:5000}")
    public void recoverPendingPublications() {
        for (OverviewPublicationRepository.Intent intent : publications.pendingDue(clock.instant(), 10)) {
            try {
                publish(intent.userId(), intent.jobId(), new OverviewPublicationDtos.PublishRequest(
                        intent.clientPublishId(), intent.expectedJobVersion(), intent.baseVersion()));
            } catch (RuntimeException ignored) {
                // The durable intent remains pending or reaches its bounded terminal retry state.
            }
        }
    }

    private OverviewResultView commit(UUID userId, UUID jobId, OverviewPublicationRepository.Intent intent,
                                      String candidateHash, List<UUID> sourceIds) {
        OverviewPublicationRepository.Intent locked = publications.lockForCommit(userId, intent.id(), jobId, sourceIds);
        if (locked.state() == OverviewPublicationDtos.State.PUBLISHED) return null;
        if (locked.state() != OverviewPublicationDtos.State.PENDING) throw new DomainException("RESOURCE_VERSION_CONFLICT", "Publication intent is terminal");
        OverviewJobRepository.JobRow job = jobs.get(userId, jobId);
        if (job.status() != OverviewJobDtos.Status.COMPLETED || job.candidateJson() == null
                || job.version() != locked.expectedJobVersion()
                || !job.inputFingerprint().equals(locked.inputFingerprint())
                || !job.profileFingerprint().equals(locked.profileFingerprint())
                || !job.algorithmVersion().equals(locked.algorithmVersion())
                || job.publicationBaseVersion() != locked.baseVersion()
                || !java.util.Objects.equals(job.publicationBaseResultId(), locked.baseResultId())
                || !java.util.Objects.equals(job.publicationBaseResultVersion(), locked.baseResultVersion())) {
            throw new DomainException("RESOURCE_VERSION_CONFLICT", "Completed job identity or publication baseline changed");
        }
        if (!activeAssembledPlan(job).equals(locked.planId())) throw new DomainException("RESOURCE_VERSION_CONFLICT", "Active writer plan changed");
        OverviewJobDtos.StartRequest request = readRequest(job.requestJson());
        OverviewJobRepository.Snapshot currentSnapshot = generationService.snapshotForJob(userId, request);
        if (!job.requestHash().equals(currentSnapshot.requestHash())
                || !job.inputFingerprint().equals(currentSnapshot.inputFingerprint())
                || !job.sourceManifestJson().equals(currentSnapshot.sourceManifestJson())) {
            throw new DomainException("RESOURCE_VERSION_CONFLICT", "Raw source snapshot changed before publication");
        }
        OverviewResponse candidate = jobService.candidate(userId, jobId).result();
        if (!candidateHash.equals(sha256(write(candidate))) || !candidateHash.equals(locked.candidateHash())) {
            throw new DomainException("RESOURCE_VERSION_CONFLICT", "Completed candidate changed before publication");
        }
        OverviewInputDescriptor input = generationService.currentRawInputDescriptor(userId, request.scope(),
                job.scopeId(), sourceIds);
        OverviewResultView result = resultService.publishNative(userId, job.scopeType(), job.scopeId(), locked.baseVersion(),
                job.publicationBaseResultId(), job.publicationBaseResultVersion(),
                locked.clientWriteId(), OverviewMode.valueOf(job.mode()), candidate, input);
        publications.markPublished(userId, locked.id(), result.id(), result.version());
        return result;
    }

    private UUID activeAssembledPlan(OverviewJobRepository.JobRow job) {
        ActivePlan plan = jdbc.query("select id,input_fingerprint,profile_fingerprint,algorithm_version from overview_execution_plans "
                        + "where generation_id=? and state='ASSEMBLED' order by created_at desc,id desc limit 1",
                rs -> rs.next() ? new ActivePlan(rs.getObject("id", UUID.class), rs.getString("input_fingerprint").trim(),
                        rs.getString("profile_fingerprint").trim(), rs.getString("algorithm_version")) : null, job.generationId());
        if (plan == null || !plan.inputFingerprint().equals(job.inputFingerprint())
                || !plan.profileFingerprint().equals(job.profileFingerprint())
                || !plan.algorithmVersion().equals(job.algorithmVersion())) {
            throw new DomainException("RESOURCE_VERSION_CONFLICT", "Completed job has no current assembled writer plan");
        }
        return plan.id();
    }

    private OverviewJobDtos.StartRequest readRequest(String json) {
        try { return mapper.readValue(json, OverviewJobDtos.StartRequest.class); }
        catch (Exception invalid) { throw new DomainException("VALIDATION_FAILED", "Stored Overview job request is invalid", null, invalid); }
    }

    private String write(Object value) {
        try { return mapper.writeValueAsString(value); }
        catch (Exception invalid) { throw new DomainException("INTERNAL_ERROR", "Publication data could not be encoded", null, invalid); }
    }

    private String sha256(String value) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8))); }
        catch (Exception unavailable) { throw new IllegalStateException("SHA-256 is unavailable", unavailable); }
    }

    private String safeCode(RuntimeException failure) {
        return failure instanceof DomainException domain && domain.code().matches("[A-Z0-9_]{1,64}")
                ? domain.code() : "OVERVIEW_PUBLICATION_CONFLICT";
    }

    private OverviewPublicationDtos.PublicationView view(OverviewPublicationRepository.Intent intent) {
        return new OverviewPublicationDtos.PublicationView(intent.id(), intent.jobId(), intent.state(), intent.version(),
                intent.resultId(), intent.resultVersion(), intent.safeErrorCode(), intent.retryAt(), intent.updatedAt());
    }

    private record ActivePlan(UUID id, String inputFingerprint, String profileFingerprint, String algorithmVersion) { }
}
