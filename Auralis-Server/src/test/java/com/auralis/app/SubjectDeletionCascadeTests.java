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
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;

import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.reset;

@SpringBootTest(classes = AuralisApplication.class)
@ActiveProfiles("test")
class SubjectDeletionCascadeTests {

    @Autowired private IdentityService identityService;
    @MockitoSpyBean private SubjectService subjectService;
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
    @MockitoSpyBean private SubjectRepository subjectRepository;
    @Autowired private PlatformTransactionManager transactionManager;

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

        var deletedSubjectRow = subjectRepository.findByIdAndUserId(deletedSubject.id(), owner.user().id()).orElseThrow();
        var deletedSourceRow = sourceRepository.findByIdAndUserId(deletedSource.id(), owner.user().id()).orElseThrow();
        var deletedBlockRow = knowledgeBlockRepository.findByIdAndUserId(deletedBlock.id(), owner.user().id()).orElseThrow();
        var deletedTaskRow = taskRepository.findByIdAndUserId(deletedTask.id(), owner.user().id()).orElseThrow();
        var deletedRelationRow = relationRepository.findByIdAndUserId(deletedRelation.id(), owner.user().id()).orElseThrow();
        var deletedChildRelationRow = relationRepository.findByIdAndUserId(deletedChildRelation.id(), owner.user().id()).orElseThrow();
        assertThat(deletedSubjectRow.getDeletedAt()).isNotNull();
        assertThat(deletedSourceRow.getDeletedAt()).isNotNull();
        assertThat(deletedBlockRow.getDeletedAt()).isNotNull();
        assertThat(deletedTaskRow.getDeletedAt()).isNotNull();
        assertThat(deletedRelationRow.getDeletedAt()).isNotNull();
        assertThat(deletedChildRelationRow.getDeletedAt()).isNotNull();
        assertThat(deletedSubjectRow.getVersion()).isGreaterThan(deletedSubject.version());
        assertThat(deletedSourceRow.getVersion()).isGreaterThan(deletedSource.version());
        assertThat(deletedBlockRow.getVersion()).isGreaterThan(deletedBlock.version());
        assertThat(deletedTaskRow.getVersion()).isGreaterThan(deletedTask.version());
        assertThat(deletedRelationRow.getVersion()).isGreaterThan(deletedRelation.version());
        assertThat(deletedChildRelationRow.getVersion()).isGreaterThan(deletedChildRelation.version());
        assertThat(deletedSubjectRow.getUpdatedAt()).isAfter(deletedSubject.updatedAt());
        assertThat(deletedSourceRow.getUpdatedAt()).isAfter(deletedSource.updatedAt());
        assertThat(deletedBlockRow.getUpdatedAt()).isAfter(deletedBlock.updatedAt());
        assertThat(deletedTaskRow.getUpdatedAt()).isAfter(deletedTask.updatedAt());
        assertThat(deletedRelationRow.getUpdatedAt()).isAfter(deletedRelation.updatedAt());
        assertThat(deletedChildRelationRow.getUpdatedAt()).isAfter(deletedChildRelation.updatedAt());

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
        assertThat(deletes).allSatisfy(change -> {
            assertThat(change.version()).isGreaterThan(0);
            assertThat(change.deletedAt()).isNotNull();
            assertThat(change.payload()).isNotBlank();
        });
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
        var block = knowledgeBlockService.create(owner.user().id(), new KnowledgeBlockCommand(
                subject.id(), source.id(), "Rollback block", null, "body", List.of(), null));
        var task = taskService.create(owner.user().id(), new TaskCommand(
                subject.id(), "Rollback task", null, null, null, null, null, "001"));
        var subjectRelation = relationService.create(owner.user().id(), new RelationCommand(
                RelationNodeType.SUBJECT, subject.id(), RelationNodeType.SOURCE, source.id(),
                RelationType.CONTAINS, null));
        var childRelation = relationService.create(owner.user().id(), new RelationCommand(
                RelationNodeType.SOURCE, source.id(), RelationNodeType.KNOWLEDGE_BLOCK, block.id(),
                RelationType.DERIVED_FROM, null));

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
        assertThat(knowledgeBlockRepository.findByIdAndUserId(block.id(), owner.user().id()).orElseThrow().getDeletedAt())
                .isNull();
        assertThat(taskRepository.findByIdAndUserId(task.id(), owner.user().id()).orElseThrow().getDeletedAt())
                .isNull();
        assertThat(relationRepository.findByIdAndUserId(subjectRelation.id(), owner.user().id()).orElseThrow().getDeletedAt())
                .isNull();
        assertThat(relationRepository.findByIdAndUserId(childRelation.id(), owner.user().id()).orElseThrow().getDeletedAt())
                .isNull();
        assertThat(subjectRepository.findByIdAndUserId(subject.id(), owner.user().id()).orElseThrow().getVersion())
                .isZero();
        assertThat(sourceRepository.findByIdAndUserId(source.id(), owner.user().id()).orElseThrow().getVersion())
                .isZero();
        assertThat(knowledgeBlockRepository.findByIdAndUserId(block.id(), owner.user().id()).orElseThrow().getVersion())
                .isZero();
        assertThat(taskRepository.findByIdAndUserId(task.id(), owner.user().id()).orElseThrow().getVersion())
                .isZero();
        assertThat(relationRepository.findByIdAndUserId(subjectRelation.id(), owner.user().id()).orElseThrow().getVersion())
                .isZero();
        assertThat(relationRepository.findByIdAndUserId(childRelation.id(), owner.user().id()).orElseThrow().getVersion())
                .isZero();
        assertThat(changeLogService.pull(owner.user().id(), new SyncCursor(0), 200).changes())
                .filteredOn(change -> change.mutationType().name().equals("DELETE"))
                .isEmpty();
    }

    @Test
    void subjectDeleteSerializesConcurrentChildCreateBeforeCascadeScan() throws Exception {
        var owner = register("subject-cascade-lock");
        SubjectView subject = subjectService.create(owner.user().id(),
                new SubjectCommand("Lock", null, null, "001"));
        CountDownLatch childStarted = new CountDownLatch(1);
        CountDownLatch childReachedSave = new CountDownLatch(1);
        AtomicBoolean childReachedSaveBeforeDelete = new AtomicBoolean();
        ExecutorService executor = Executors.newSingleThreadExecutor();
        TransactionTemplate template = new TransactionTemplate(transactionManager);

        doAnswer(invocation -> {
            childReachedSave.countDown();
            return invocation.callRealMethod();
        }).when(sourceRepository).save(any(SourceEntity.class));
        try {
            CompletableFuture<Throwable> child = CompletableFuture.supplyAsync(() -> {
                try {
                    childStarted.countDown();
                    template.executeWithoutResult(status -> sourceService.create(owner.user().id(), new SourceCommand(
                            subject.id(), SourceType.TEXT, "Late source", null, null, "text", null)));
                    return null;
                } catch (Throwable failure) {
                    return failure;
                }
            }, executor);

            template.executeWithoutResult(status -> {
                subjectRepository.findForUpdateByIdAndUserId(subject.id(), owner.user().id()).orElseThrow();
                try {
                    assertThat(childStarted.await(1, TimeUnit.SECONDS))
                            .as("concurrent child mutation must start before the delete scan")
                            .isTrue();
                    childReachedSaveBeforeDelete.set(childReachedSave.await(1, TimeUnit.SECONDS));
                } catch (InterruptedException interrupted) {
                    Thread.currentThread().interrupt();
                    throw new AssertionError(interrupted);
                }
                subjectService.delete(owner.user().id(), subject.id(), subject.version());
            });

            assertThat(childReachedSaveBeforeDelete).as("child mutation must wait for the Subject row lock")
                    .isFalse();
            Throwable childFailure = child.get(5, TimeUnit.SECONDS);
            assertThat(childFailure).isInstanceOf(com.auralis.app.shared.error.DomainException.class)
                    .extracting(failure -> ((com.auralis.app.shared.error.DomainException) failure).code())
                    .isEqualTo("RESOURCE_NOT_FOUND");
            assertThat(sourceRepository.findAllByUserIdAndSubjectIdAndDeletedAtIsNullOrderByIdAsc(
                    owner.user().id(), subject.id())).isEmpty();
        } finally {
            reset(sourceRepository);
            executor.shutdownNow();
        }
    }

    @Test
    void multiSubjectMutationLocksSubjectsInCanonicalUuidOrder() {
        var owner = register("subject-cascade-lock-order");
        UUID first = UUID.fromString("00000000-0000-0000-0000-000000000001");
        UUID second = UUID.fromString("00000000-0000-0000-0000-000000000002");
        subjectService.create(owner.user().id(), first, new SubjectCommand("First", null, null, "001"));
        subjectService.create(owner.user().id(), second, new SubjectCommand("Second", null, null, "002"));
        clearInvocations(subjectRepository);

        subjectService.requireActiveSubjectsForMutation(owner.user().id(), List.of(second, first));

        var order = inOrder(subjectRepository);
        order.verify(subjectRepository).findForUpdateByIdAndUserId(first, owner.user().id());
        order.verify(subjectRepository).findForUpdateByIdAndUserId(second, owner.user().id());
    }

    @Test
    void relationEndpointRevalidatesChildAfterOwnerLockWait() throws Exception {
        var owner = register("subject-cascade-endpoint-race");
        SubjectView subject = subjectService.create(owner.user().id(),
                new SubjectCommand("Endpoint", null, null, "001"));
        var source = sourceService.create(owner.user().id(), new SourceCommand(
                subject.id(), SourceType.TEXT, "Endpoint source", null, null, "text", null));
        CountDownLatch childStarted = new CountDownLatch(1);
        CountDownLatch endpointRead = new CountDownLatch(1);
        ExecutorService executor = Executors.newSingleThreadExecutor();
        TransactionTemplate template = new TransactionTemplate(transactionManager);
        AtomicReference<CompletableFuture<Throwable>> relationCreateRef = new AtomicReference<>();
        doAnswer(invocation -> {
            endpointRead.countDown();
            return invocation.callRealMethod();
        }).when(subjectService).requireActiveSubjectsForMutation(
                org.mockito.ArgumentMatchers.eq(owner.user().id()), org.mockito.ArgumentMatchers.anyList());
        try {
            template.executeWithoutResult(status -> {
                subjectRepository.findForUpdateByIdAndUserId(subject.id(), owner.user().id()).orElseThrow();
                CompletableFuture<Throwable> relationCreate = CompletableFuture.supplyAsync(() -> {
                    try {
                        childStarted.countDown();
                        template.executeWithoutResult(inner -> relationService.create(owner.user().id(),
                                new RelationCommand(RelationNodeType.SOURCE, source.id(),
                                        RelationNodeType.SUBJECT, subject.id(), RelationType.CONTAINS, null)));
                        return null;
                    } catch (Throwable failure) {
                        return failure;
                    }
                }, executor);
                relationCreateRef.set(relationCreate);
                try {
                    assertThat(childStarted.await(1, TimeUnit.SECONDS)).isTrue();
                    assertThat(endpointRead.await(1, TimeUnit.SECONDS)).isTrue();
                    var sourceRow = sourceRepository.findByIdAndUserId(source.id(), owner.user().id()).orElseThrow();
                    sourceRow.softDelete();
                    sourceRepository.saveAndFlush(sourceRow);
                } catch (InterruptedException interrupted) {
                    Thread.currentThread().interrupt();
                    throw new AssertionError(interrupted);
                }
            });
        } finally {
            reset(subjectService);
            executor.shutdownNow();
        }

        Throwable relationFailure = relationCreateRef.get().get(5, TimeUnit.SECONDS);
        assertThat(relationFailure).isInstanceOf(com.auralis.app.shared.error.DomainException.class)
                .extracting(failure -> ((com.auralis.app.shared.error.DomainException) failure).code())
                .isEqualTo("RESOURCE_NOT_FOUND");
        assertThat(relationRepository.findAllByUserIdAndDeletedAtIsNullOrderByUpdatedAtDescIdAsc(owner.user().id()))
                .isEmpty();
    }

    private com.auralis.app.identity.AuthResult register(String suffix) {
        return identityService.register(
                suffix + "@example.com", "correct horse battery staple", suffix,
                new DeviceCommand("device-" + suffix, "Test", DevicePlatform.WEB));
    }
}
