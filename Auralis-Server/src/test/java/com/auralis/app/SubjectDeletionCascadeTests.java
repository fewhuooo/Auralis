package com.auralis.app;

import com.auralis.app.identity.DeviceCommand;
import com.auralis.app.identity.DevicePlatform;
import com.auralis.app.identity.IdentityService;
import com.auralis.app.knowledge.KnowledgeBlockCommand;
import com.auralis.app.knowledge.KnowledgeBlockService;
import com.auralis.app.relation.RelationCommand;
import com.auralis.app.relation.RelationNodeType;
import com.auralis.app.relation.RelationService;
import com.auralis.app.relation.RelationType;
import com.auralis.app.relation.internal.persistence.RelationRepository;
import com.auralis.app.shared.domain.ResourceDeletedEvent;
import com.auralis.app.shared.domain.ResourceType;
import com.auralis.app.source.SourceCommand;
import com.auralis.app.source.SourceService;
import com.auralis.app.source.SourceType;
import com.auralis.app.source.internal.persistence.SourceRepository;
import com.auralis.app.source.internal.persistence.SourceEntity;
import com.auralis.app.subject.SubjectCommand;
import com.auralis.app.subject.SubjectService;
import com.auralis.app.subject.SubjectView;
import com.auralis.app.subject.internal.persistence.SubjectRepository;
import com.auralis.app.task.TaskCommand;
import com.auralis.app.task.TaskService;
import com.auralis.app.task.internal.persistence.TaskRepository;
import com.auralis.app.knowledge.internal.persistence.KnowledgeBlockRepository;
import com.auralis.app.sync.ChangeLogService;
import com.auralis.app.sync.SyncCursor;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.reset;

@SpringBootTest(classes = AuralisApplication.class)
@ActiveProfiles("test")
class SubjectDeletionCascadeTests {

    @Autowired private IdentityService identityService;
    @Autowired private SubjectService subjectService;
    @Autowired private SourceService sourceService;
    @Autowired private KnowledgeBlockService knowledgeBlockService;
    @Autowired private TaskService taskService;
    @Autowired private RelationService relationService;
    @Autowired private ChangeLogService changeLogService;
    @Autowired private ApplicationEventPublisher eventPublisher;
    @MockitoSpyBean private SourceRepository sourceRepository;
    @Autowired private KnowledgeBlockRepository knowledgeBlockRepository;
    @Autowired private TaskRepository taskRepository;
    @Autowired private RelationRepository relationRepository;
    @Autowired private SubjectRepository subjectRepository;

    @BeforeEach
    void cleanData() {
        relationRepository.deleteAll();
        knowledgeBlockRepository.deleteAll();
        sourceRepository.deleteAll();
        taskRepository.deleteAll();
    }

    @Test
    void deletingSubjectCascadesOwnedChildrenAndTombstonesExactlyOnce() {
        var owner = register("subject-cascade-owner");
        var other = register("subject-cascade-other");
        SubjectView deletedSubject = subjectService.create(owner.user().id(),
                new SubjectCommand("Deleted", null, null, "001"));
        SubjectView retainedSubject = subjectService.create(owner.user().id(),
                new SubjectCommand("Retained", null, null, "002"));
        SubjectView otherSubject = subjectService.create(other.user().id(),
                new SubjectCommand("Other", null, null, "001"));

        var deletedSource = sourceService.create(owner.user().id(), new SourceCommand(
                deletedSubject.id(), SourceType.TEXT, "Deleted source", null, null, "text", null));
        var retainedSource = sourceService.create(owner.user().id(), new SourceCommand(
                retainedSubject.id(), SourceType.TEXT, "Retained source", null, null, "text", null));
        var otherSource = sourceService.create(other.user().id(), new SourceCommand(
                otherSubject.id(), SourceType.TEXT, "Other source", null, null, "text", null));
        var deletedBlock = knowledgeBlockService.create(owner.user().id(), new KnowledgeBlockCommand(
                deletedSubject.id(), deletedSource.id(), "Deleted block", null, "body", List.of(), null));
        var retainedBlock = knowledgeBlockService.create(owner.user().id(), new KnowledgeBlockCommand(
                retainedSubject.id(), retainedSource.id(), "Retained block", null, "body", List.of(), null));
        var otherBlock = knowledgeBlockService.create(other.user().id(), new KnowledgeBlockCommand(
                otherSubject.id(), otherSource.id(), "Other block", null, "body", List.of(), null));
        var deletedTask = taskService.create(owner.user().id(), new TaskCommand(
                deletedSubject.id(), "Deleted task", null, null, null, null, null, "001"));
        var retainedTask = taskService.create(owner.user().id(), new TaskCommand(
                retainedSubject.id(), "Retained task", null, null, null, null, null, "001"));
        var otherTask = taskService.create(other.user().id(), new TaskCommand(
                otherSubject.id(), "Other task", null, null, null, null, null, "001"));

        var deletedRelation = relationService.create(owner.user().id(), new RelationCommand(
                RelationNodeType.SUBJECT, deletedSubject.id(), RelationNodeType.SOURCE, deletedSource.id(),
                RelationType.CONTAINS, null));
        var deletedChildRelation = relationService.create(owner.user().id(), new RelationCommand(
                RelationNodeType.SOURCE, deletedSource.id(), RelationNodeType.KNOWLEDGE_BLOCK, deletedBlock.id(),
                RelationType.DERIVED_FROM, null));
        var retainedRelation = relationService.create(owner.user().id(), new RelationCommand(
                RelationNodeType.SUBJECT, retainedSubject.id(), RelationNodeType.SOURCE, retainedSource.id(),
                RelationType.CONTAINS, null));
        var otherRelation = relationService.create(other.user().id(), new RelationCommand(
                RelationNodeType.SUBJECT, otherSubject.id(), RelationNodeType.SOURCE, otherSource.id(),
                RelationType.CONTAINS, null));

        subjectService.delete(owner.user().id(), deletedSubject.id(), deletedSubject.version());

        assertThat(subjectRepository.findByIdAndUserId(deletedSubject.id(), owner.user().id()).orElseThrow().getDeletedAt())
                .isNotNull();
        assertThat(sourceRepository.findByIdAndUserId(deletedSource.id(), owner.user().id()).orElseThrow().getDeletedAt())
                .isNotNull();
        assertThat(knowledgeBlockRepository.findByIdAndUserId(deletedBlock.id(), owner.user().id()).orElseThrow().getDeletedAt())
                .isNotNull();
        assertThat(taskRepository.findByIdAndUserId(deletedTask.id(), owner.user().id()).orElseThrow().getDeletedAt())
                .isNotNull();
        assertThat(relationRepository.findByIdAndUserId(deletedRelation.id(), owner.user().id()).orElseThrow().getDeletedAt())
                .isNotNull();
        assertThat(relationRepository.findByIdAndUserId(deletedChildRelation.id(), owner.user().id()).orElseThrow().getDeletedAt())
                .isNotNull();

        assertThat(sourceRepository.findByIdAndUserId(retainedSource.id(), owner.user().id()).orElseThrow().getDeletedAt())
                .isNull();
        assertThat(knowledgeBlockRepository.findByIdAndUserId(retainedBlock.id(), owner.user().id()).orElseThrow().getDeletedAt())
                .isNull();
        assertThat(taskRepository.findByIdAndUserId(retainedTask.id(), owner.user().id()).orElseThrow().getDeletedAt())
                .isNull();
        assertThat(relationRepository.findByIdAndUserId(retainedRelation.id(), owner.user().id()).orElseThrow().getDeletedAt())
                .isNull();
        assertThat(sourceRepository.findByIdAndUserId(otherSource.id(), other.user().id()).orElseThrow().getDeletedAt())
                .isNull();
        assertThat(knowledgeBlockRepository.findByIdAndUserId(otherBlock.id(), other.user().id()).orElseThrow().getDeletedAt())
                .isNull();
        assertThat(taskRepository.findByIdAndUserId(otherTask.id(), other.user().id()).orElseThrow().getDeletedAt())
                .isNull();
        assertThat(relationRepository.findByIdAndUserId(otherRelation.id(), other.user().id()).orElseThrow().getDeletedAt())
                .isNull();

        eventPublisher.publishEvent(new ResourceDeletedEvent(owner.user().id(), ResourceType.SUBJECT, deletedSubject.id()));
        var deletes = changeLogService.pull(owner.user().id(), new SyncCursor(0), 200).changes().stream()
                .filter(change -> change.mutationType().name().equals("DELETE"))
                .toList();
        assertThat(deletes).extracting(change -> change.resourceId())
                .containsExactlyInAnyOrder(deletedSubject.id(), deletedSource.id(), deletedBlock.id(), deletedTask.id(),
                        deletedRelation.id(), deletedChildRelation.id());

        var restored = subjectService.restore(owner.user().id(), deletedSubject.id(), deletedSubject.version() + 1);
        assertThat(restored.deletedAt()).isNull();
        assertThat(sourceRepository.findByIdAndUserId(deletedSource.id(), owner.user().id()).orElseThrow().getDeletedAt())
                .isNotNull();
    }

    @Test
    void cascadeFailureRollsBackSubjectAndChildTombstones() {
        var owner = register("subject-cascade-rollback");
        SubjectView subject = subjectService.create(owner.user().id(),
                new SubjectCommand("Rollback", null, null, "001"));
        var source = sourceService.create(owner.user().id(), new SourceCommand(
                subject.id(), SourceType.TEXT, "Rollback source", null, null, "text", null));

        doThrow(new IllegalStateException("forced cascade failure"))
                .when(sourceRepository).saveAndFlush(any(SourceEntity.class));
        try {
            assertThatThrownBy(() -> subjectService.delete(owner.user().id(), subject.id(), subject.version()))
                    .isInstanceOf(IllegalStateException.class)
                    .hasMessage("forced cascade failure");
        } finally {
            reset(sourceRepository);
        }

        assertThat(subjectRepository.findByIdAndUserId(subject.id(), owner.user().id()).orElseThrow().getDeletedAt())
                .isNull();
        assertThat(sourceRepository.findByIdAndUserId(source.id(), owner.user().id()).orElseThrow().getDeletedAt())
                .isNull();
    }

    private com.auralis.app.identity.AuthResult register(String suffix) {
        return identityService.register(
                suffix + "@example.com", "correct horse battery staple", suffix,
                new DeviceCommand("device-" + suffix, "Test", DevicePlatform.WEB));
    }
}
