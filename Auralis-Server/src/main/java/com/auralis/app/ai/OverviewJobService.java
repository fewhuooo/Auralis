package com.auralis.app.ai;

import com.auralis.app.shared.error.DomainException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;

import java.time.Clock;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

@Service
public class OverviewJobService {
    private final OverviewJobRepository repository;
    private final OverviewGenerationService generationService;
    private final OverviewJobInvocationJournal invocationJournal;
    private final ObjectMapper objectMapper;
    private final Clock clock;

    public OverviewJobService(OverviewJobRepository repository, OverviewGenerationService generationService,
                              OverviewJobInvocationJournal invocationJournal, ObjectMapper objectMapper, Clock clock) {
        this.repository = repository;
        this.generationService = generationService;
        this.invocationJournal = invocationJournal;
        this.objectMapper = objectMapper;
        this.clock = clock;
    }

    @Transactional
    public OverviewJobDtos.JobView start(UUID userId, OverviewJobDtos.StartRequest request) {
        validateRequest(request);
        repository.lockActiveUser(userId);
        OverviewJobRepository.Snapshot snapshot = generationService.snapshotForJob(userId, request);
        return view(repository.enqueue(userId, request, snapshot));
    }

    public OverviewJobDtos.JobView get(UUID userId, UUID id) {
        return view(repository.get(userId, id));
    }

    public OverviewJobDtos.JobList list(UUID userId, int limit, String cursor,
                                       OverviewJobDtos.Scope scope, UUID scopeId) {
        if ((scope == null) != (scopeId == null)) {
            throw new DomainException("VALIDATION_FAILED", "scope and scopeId must be supplied together");
        }
        return repository.list(userId, limit, cursor, scope, scopeId, this::view);
    }

    public OverviewJobDtos.Candidate candidate(UUID userId, UUID id) {
        OverviewJobRepository.JobRow row = repository.get(userId, id);
        if (row.status() != OverviewJobDtos.Status.COMPLETED || row.candidateJson() == null) {
            throw new DomainException("RESOURCE_VERSION_CONFLICT", "Overview job candidate is not complete");
        }
        OverviewJobDtos.StartRequest request = request(row);
        requireCurrentSnapshot(userId, request, row);
        try {
            OverviewDtos.OverviewResponse response = new OverviewDocumentValidator(objectMapper).validateProviderDocument(row.candidateJson());
            return new OverviewJobDtos.Candidate(row.id(), row.version(), response);
        } catch (Exception invalid) {
            throw new DomainException("VALIDATION_FAILED", "Stored Overview job candidate is invalid", null, invalid);
        }
    }

    public OverviewJobDtos.JobView control(UUID userId, UUID id, OverviewJobDtos.ControlRequest request,
                                           OverviewJobRepository.Control control) {
        if (request == null || request.expectedVersion() <= 0) {
            throw new DomainException("VALIDATION_FAILED", "expectedVersion is required");
        }
        OverviewJobRepository.JobRow before = repository.get(userId, id);
        if (before.version() != request.expectedVersion()) {
            throw new DomainException("RESOURCE_VERSION_CONFLICT", "Overview job version changed");
        }
        if (control == OverviewJobRepository.Control.RESUME) {
            if (before.status() == OverviewJobDtos.Status.QUEUED || before.status() == OverviewJobDtos.Status.RUNNING) {
                return view(repository.control(userId, id, request.expectedVersion(), control));
            }
            requireCurrentSnapshot(userId, request(before), before);
            if (!invocationJournal.allSafe(before)) {
                return view(repository.markRecoveryRequired(userId, id, "OVERVIEW_RECOVERY_EXHAUSTED", request.expectedVersion()));
            }
        } else if (control == OverviewJobRepository.Control.RECONCILE) {
            if (before.status() != OverviewJobDtos.Status.RECOVERY_REQUIRED) {
                throw new DomainException("RESOURCE_VERSION_CONFLICT", "Overview job does not require recovery reconciliation");
            }
            boolean safe = invocationJournal.allSafe(before);
            if (safe) requireCurrentSnapshot(userId, request(before), before);
            if (safe) repository.reconcileToQueued(userId, id, request.expectedVersion());
            return view(safe ? repository.get(userId, id)
                    : repository.holdRecoveryRequired(userId, id, request.expectedVersion()));
        }
        return view(repository.control(userId, id, request.expectedVersion(), control));
    }

    public OverviewJobRepository.JobRow claim(UUID workerId, long leaseMillis, long maxDurationMillis) {
        return repository.claimNext(workerId, leaseMillis, maxDurationMillis);
    }

    public void executeClaimed(OverviewJobRepository.JobRow row, OverviewCancellation cancellation) {
        OverviewJobRepository.JobLease lease = row.lease();
        try {
            if (row.cancelRequested() || row.status() == OverviewJobDtos.Status.CANCELLING) {
                repository.finishCancelled(row.userId(), row.id());
                return;
            }
            if (!invocationJournal.allSafe(row)) {
                repository.fail(lease, "OVERVIEW_RECOVERY_EXHAUSTED", true);
                return;
            }
            OverviewJobDtos.StartRequest request = request(row);
            requireCurrentSnapshot(row.userId(), request, row);
            if (row.pauseRequested() || row.status() == OverviewJobDtos.Status.PAUSING) {
                repository.pauseAtBoundary(lease);
                return;
            }
            long remaining = row.deadlineAt() == null ? 0
                    : row.deadlineAt().toEpochMilli() - clock.instant().toEpochMilli();
            if (row.deadlineAt() != null && remaining <= 0) {
                repository.fail(lease, "MODEL_TIMEOUT", false);
                return;
            }
            OverviewJobExecution execution = new OverviewJobExecution(repository, invocationJournal, lease, cancellation);
            OverviewDtos.OverviewResponse result = generationService.executeBackgroundJob(row.userId(), request,
                    row.generationRequestId().toString(), remaining, row.profileFingerprint(), execution);
            if (execution.pauseRequested()) repository.pauseAtBoundary(lease);
            else repository.finish(lease, objectMapper.writeValueAsString(result));
        } catch (RuntimeException failure) {
            OverviewJobRepository.JobRow current = repository.get(row.userId(), row.id());
            if (current.status() == OverviewJobDtos.Status.CANCELLING || current.cancelRequested()) {
                repository.finishCancelled(row.userId(), row.id());
                return;
            }
            if (current.pauseRequested() || current.status() == OverviewJobDtos.Status.PAUSING) {
                repository.pauseAtBoundary(lease);
                return;
            }
            boolean recovery = !invocationJournal.allSafe(current)
                    || "OVERVIEW_RECOVERY_EXHAUSTED".equals(safeCode(failure));
            repository.fail(lease, safeCode(failure), recovery);
        } catch (Exception serializationFailure) {
            repository.fail(lease, "OVERVIEW_GENERATION_FAILED", true);
        }
    }

    private void requireCurrentSnapshot(UUID userId, OverviewJobDtos.StartRequest request,
                                        OverviewJobRepository.JobRow row) {
        OverviewJobRepository.Snapshot current = generationService.snapshotForJob(userId, request);
        if (!row.requestHash().equals(current.requestHash())
                || !row.inputFingerprint().equals(current.inputFingerprint())
                || !row.profileFingerprint().equals(current.profileFingerprint())
                || !row.algorithmVersion().equals(current.algorithmVersion())
                || !row.sourceManifestJson().equals(current.sourceManifestJson())) {
            throw new DomainException("RESOURCE_VERSION_CONFLICT", "Overview job inputs, source revision, or provider profile changed");
        }
    }

    private OverviewJobDtos.JobView view(OverviewJobRepository.JobRow row) {
        OverviewJobDtos.StartRequest request = request(row);
        return new OverviewJobDtos.JobView(row.id(), row.status(), row.version(), OverviewJobDtos.Scope.valueOf(row.scopeType()),
                request.sourceId(), request.subjectId(), request.sourceIds(), OverviewJobDtos.Mode.valueOf(row.mode()), row.stage(),
                row.verifiedNodes(), row.totalNodes(), row.deadlineAt(), row.safeErrorCode(), row.createdAt(), row.updatedAt(),
                row.completedAt());
    }

    private OverviewJobDtos.StartRequest request(OverviewJobRepository.JobRow row) {
        try { return objectMapper.readValue(row.requestJson(), OverviewJobDtos.StartRequest.class); }
        catch (Exception invalid) { throw new DomainException("VALIDATION_FAILED", "Stored Overview job request is invalid", null, invalid); }
    }

    private static void validateRequest(OverviewJobDtos.StartRequest request) {
        if (request == null || request.clientRequestId() == null || request.scope() == null || request.mode() == null) {
            throw new DomainException("VALIDATION_FAILED", "clientRequestId, scope, and mode are required");
        }
        if (request.instruction() != null && request.instruction().codePointCount(0, request.instruction().length()) > 2_000) {
            throw new DomainException("VALIDATION_FAILED", "instruction exceeds 2000 characters");
        }
        if (request.scope() == OverviewJobDtos.Scope.SOURCE) {
            if (request.sourceId() == null || request.subjectId() != null || request.sourceIds() != null) {
                throw new DomainException("VALIDATION_FAILED", "SOURCE scope accepts sourceId only");
            }
        } else if (request.subjectId() == null || request.sourceId() != null || request.sourceIds() == null
                || request.sourceIds().isEmpty() || request.sourceIds().size() > 100
                || request.sourceIds().stream().anyMatch(Objects::isNull)
                || request.sourceIds().stream().distinct().count() != request.sourceIds().size()) {
            throw new DomainException("VALIDATION_FAILED", "SUBJECT scope accepts subjectId and 1..100 unique sourceIds only");
        }
    }

    private static String safeCode(RuntimeException failure) {
        if (failure instanceof DomainException domain && domain.code().matches("[A-Z0-9_]{1,64}")) return domain.code();
        return "OVERVIEW_GENERATION_FAILED";
    }
}
