package com.auralis.app.ai;

import com.auralis.app.ai.OverviewJobDtos.Stage;

import java.time.Instant;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;

public final class OverviewJobExecution {
    private final OverviewJobRepository repository;
    private final OverviewJobInvocationJournal invocationJournal;
    private final OverviewJobRepository.JobLease lease;
    private final OverviewCancellation cancellation;
    private final AtomicInteger verified = new AtomicInteger();
    private volatile Integer total;

    public OverviewJobExecution(OverviewJobRepository repository, OverviewJobInvocationJournal invocationJournal,
                                OverviewJobRepository.JobLease lease, OverviewCancellation cancellation) {
        this.repository = repository;
        this.invocationJournal = invocationJournal;
        this.lease = lease;
        this.cancellation = cancellation;
    }

    public OverviewJobRepository.JobLease lease() { return lease; }
    public OverviewCancellation cancellation() { return cancellation; }

    public void bindGeneration(OverviewGenerationCoordinator.GenerationLease generationLease) {
        bindGeneration(generationLease.generationId(), generationLease.budgetTaskId());
    }

    public void bindGeneration(java.util.UUID generationId, java.util.UUID taskId) {
        repository.bindGeneration(lease, generationId, taskId);
    }

    public boolean matches(OverviewGenerationCoordinator.Request request) {
        return lease.inputFingerprint().equals(request.inputFingerprint())
                && lease.profileFingerprint().equals(request.profileFingerprint())
                && lease.algorithmVersion().equals(request.algorithmVersion());
    }

    public com.auralis.app.ai.usage.AiInvocationBinding invocationBinding(
            OverviewGenerationCoordinator.GenerationLease generationLease, String purpose, String stage) {
        return invocationJournal.binding(lease, generationLease, purpose, stage);
    }

    public void stage(Stage stage) {
        repository.updateProgress(lease, stage, verified.get(), total);
    }

    public void plan(List<OverviewExecutionJournal.Node> nodes) {
        total = nodes.size();
        verified.set((int) nodes.stream().filter(node -> "VERIFIED".equals(node.state())).count());
        repository.updateProgress(lease, Stage.WRITING, verified.get(), total);
    }

    public void nodeVerified() {
        int count = verified.incrementAndGet();
        repository.updateProgress(lease, Stage.WRITING, count, total);
    }

    public boolean pauseRequested() {
        OverviewJobRepository.JobRow row = repository.get(lease.userId(), lease.jobId());
        return row.pauseRequested() || row.status() == OverviewJobDtos.Status.PAUSING;
    }

    public Instant deadlineAt() { return lease.deadlineAt(); }
}
