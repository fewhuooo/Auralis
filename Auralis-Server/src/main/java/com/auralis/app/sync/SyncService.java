package com.auralis.app.sync;

import com.auralis.app.identity.IdentityService;
import com.auralis.app.knowledge.KnowledgeBlockService;
import com.auralis.app.relation.RelationService;
import com.auralis.app.source.SourceService;
import com.auralis.app.subject.SubjectService;
import com.auralis.app.task.TaskService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Service
public class SyncService {

    private final IdentityService identityService;
    private final ChangeLogService changeLogService;
    private final SyncMutationProcessor mutationProcessor;
    private final SubjectService subjectService;
    private final SourceService sourceService;
    private final KnowledgeBlockService knowledgeBlockService;
    private final TaskService taskService;
    private final RelationService relationService;

    public SyncService(
            IdentityService identityService,
            ChangeLogService changeLogService,
            SyncMutationProcessor mutationProcessor,
            SubjectService subjectService,
            SourceService sourceService,
            KnowledgeBlockService knowledgeBlockService,
            TaskService taskService,
            RelationService relationService) {
        this.identityService = identityService;
        this.changeLogService = changeLogService;
        this.mutationProcessor = mutationProcessor;
        this.subjectService = subjectService;
        this.sourceService = sourceService;
        this.knowledgeBlockService = knowledgeBlockService;
        this.taskService = taskService;
        this.relationService = relationService;
    }

    public List<SyncDtos.MutationResponse> push(UUID userId, UUID serverDeviceId, List<SyncMutation> mutations) {
        requireDevice(userId, serverDeviceId);
        return mutations.stream().map(mutation -> mutationProcessor.process(userId, serverDeviceId, mutation)).toList();
    }

    @Transactional(readOnly = true)
    public ChangeLogPage pull(UUID userId, String encodedCursor, int limit) {
        SyncCursor cursor = encodedCursor == null || encodedCursor.isBlank()
                ? new SyncCursor(0)
                : SyncCursor.decode(encodedCursor);
        return changeLogService.pull(userId, cursor, limit);
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public SyncDtos.SnapshotResponse snapshot(UUID userId) {
        return new SyncDtos.SnapshotResponse(
                changeLogService.latestCursor(userId).encode(),
                subjectService.listIncludingDeleted(userId),
                sourceService.listIncludingDeleted(userId),
                knowledgeBlockService.listIncludingDeleted(userId),
                taskService.listIncludingDeleted(userId),
                relationService.listIncludingDeleted(userId));
    }

    @Transactional(readOnly = true)
    public SyncCursor latestCursor(UUID userId) {
        return changeLogService.latestCursor(userId);
    }

    private void requireDevice(UUID userId, UUID serverDeviceId) {
        identityService.requireActiveDevice(userId, serverDeviceId);
    }

}
