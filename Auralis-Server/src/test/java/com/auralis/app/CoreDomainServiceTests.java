package com.auralis.app;

import com.auralis.app.identity.DeviceCommand;
import com.auralis.app.identity.DevicePlatform;
import com.auralis.app.identity.IdentityService;
import com.auralis.app.identity.internal.persistence.DeviceRepository;
import com.auralis.app.identity.internal.persistence.RefreshSessionRepository;
import com.auralis.app.identity.internal.persistence.UserRepository;
import com.auralis.app.knowledge.KnowledgeBlockCommand;
import com.auralis.app.knowledge.KnowledgeBlockService;
import com.auralis.app.shared.error.DomainException;
import com.auralis.app.subject.SubjectCommand;
import com.auralis.app.subject.SubjectService;
import com.auralis.app.subject.SubjectView;
import com.auralis.app.subject.internal.persistence.SubjectEntity;
import com.auralis.app.subject.internal.persistence.SubjectRepository;
import com.auralis.app.task.TaskService;
import com.auralis.app.task.TaskCommand;
import com.auralis.app.task.TaskStatus;
import com.auralis.app.task.TaskView;
import com.auralis.app.task.internal.persistence.TaskEntity;
import com.auralis.app.task.internal.persistence.TaskRepository;
import com.auralis.app.knowledge.internal.persistence.KnowledgeBlockRepository;
import com.auralis.app.relation.internal.persistence.RelationRepository;
import com.auralis.app.source.internal.persistence.AssetRepository;
import com.auralis.app.source.internal.persistence.SourceRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import java.util.List;
import java.time.Duration;
import java.time.Instant;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest(classes = AuralisApplication.class)
@ActiveProfiles("test")
class CoreDomainServiceTests {

    @Autowired
    private IdentityService identityService;

    @Autowired
    private SubjectService subjectService;

    @Autowired
    private KnowledgeBlockService knowledgeBlockService;

    @Autowired
    private TaskService taskService;

    @Autowired
    private RefreshSessionRepository refreshSessionRepository;

    @Autowired
    private DeviceRepository deviceRepository;

    @Autowired
    private KnowledgeBlockRepository knowledgeBlockRepository;

    @Autowired
    private RelationRepository relationRepository;

    @Autowired
    private SourceRepository sourceRepository;

    @Autowired
    private AssetRepository assetRepository;

    @Autowired
    private TaskRepository taskRepository;

    @Autowired
    private SubjectRepository subjectRepository;

    @Autowired
    private UserRepository userRepository;

    @BeforeEach
    void cleanData() {
        relationRepository.deleteAll();
        knowledgeBlockRepository.deleteAll();
        sourceRepository.deleteAll();
        assetRepository.deleteAll();
        taskRepository.deleteAll();
        subjectRepository.deleteAll();
        refreshSessionRepository.deleteAll();
        deviceRepository.deleteAll();
        userRepository.deleteAll();
    }

    @Test
    void registrationDoesNotCreateDefaultSubject() {
        var result = register("default");

        assertThat(subjectService.list(result.user().id())).isEmpty();
    }

    @Test
    void updateRequiresTheExactVersionAndDeleteRestoreAdvancesIt() {
        var result = register("version");
        SubjectView created = subjectService.create(result.user().id(), new SubjectCommand(
                "Physics", null, null, "001"));

        SubjectView updated = subjectService.update(result.user().id(), created.id(), created.version(),
                new SubjectCommand("Physics 2", null, null, "001"));
        assertThat(updated.version()).isEqualTo(created.version() + 1);
        assertThatThrownBy(() -> subjectService.update(result.user().id(), created.id(), created.version(),
                new SubjectCommand("Physics 3", null, null, "002")))
                .isInstanceOf(DomainException.class)
                .extracting(error -> ((DomainException) error).code())
                .isEqualTo("RESOURCE_VERSION_CONFLICT");

        subjectService.delete(result.user().id(), created.id(), updated.version());
        assertThat(subjectService.list(result.user().id())).extracting(SubjectView::id).doesNotContain(created.id());

        SubjectView restored = subjectService.restore(result.user().id(), created.id(), updated.version() + 1);
        assertThat(restored.version()).isEqualTo(updated.version() + 2);
    }

    @Test
    void childResourcesCannotReferenceAnotherUsersSubject() {
        var owner = register("owner");
        var other = register("other");
        SubjectView otherSubject = subjectService.create(other.user().id(), new SubjectCommand(
                "Other Subject", null, null, "001"));

        assertThatThrownBy(() -> knowledgeBlockService.create(owner.user().id(), new KnowledgeBlockCommand(
                otherSubject.id(), null, "Block", "Content", null)))
                .isInstanceOf(DomainException.class)
                .extracting(error -> ((DomainException) error).code())
                .isEqualTo("RESOURCE_NOT_FOUND");
    }

    @Test
    void taskScheduleRejectsOverlapAcrossSubjectsAndAllowsAdjacentIntervals() {
        var owner = register("schedule-overlap");
        SubjectView firstSubject = subjectService.create(owner.user().id(), new SubjectCommand(
                "Schedule A", null, null, "001"));
        SubjectView secondSubject = subjectService.create(owner.user().id(), new SubjectCommand(
                "Schedule B", null, null, "002"));
        Instant start = Instant.parse("2026-09-25T08:00:00Z");

        taskService.create(owner.user().id(), scheduledTask(firstSubject.id(), "First", start, 30));

        assertThatThrownBy(() -> taskService.create(owner.user().id(), scheduledTask(
                secondSubject.id(), "Overlap", start.plusSeconds(15 * 60), 30)))
                .isInstanceOf(DomainException.class)
                .extracting(error -> ((DomainException) error).code())
                .isEqualTo("VALIDATION_FAILED");

        assertThat(taskService.create(owner.user().id(), scheduledTask(
                secondSubject.id(), "Adjacent", start.plusSeconds(30 * 60), 30)).scheduledAt())
                .isEqualTo(start.plusSeconds(30 * 60));
    }

    @Test
    void taskScheduleUsesThirtyMinuteDefaultForNullDurationAndRejectsDurationExpansion() {
        var owner = register("schedule-duration");
        SubjectView subject = subjectService.create(owner.user().id(), new SubjectCommand(
                "Schedule", null, null, "001"));
        Instant start = Instant.parse("2026-09-25T08:00:00Z");
        var nullDuration = taskService.create(owner.user().id(), scheduledTask(subject.id(), "Default duration", start, null));
        var adjacent = taskService.create(owner.user().id(), scheduledTask(
                subject.id(), "Adjacent", start.plusSeconds(30 * 60), 30));

        assertThatThrownBy(() -> taskService.update(owner.user().id(), adjacent.id(), adjacent.version(),
                scheduledTask(subject.id(), "Expanded first task", start, 60)))
                .isInstanceOf(DomainException.class)
                .extracting(error -> ((DomainException) error).code())
                .isEqualTo("VALIDATION_FAILED");

        assertThat(taskService.get(owner.user().id(), nullDuration.id()).durationMinutes()).isNull();
    }

    @Test
    void taskCreationRequiresTheFullScheduledIntervalToEndByDeadline() {
        var owner = register("schedule-deadline-create");
        SubjectView subject = subjectService.create(owner.user().id(), new SubjectCommand(
                "Schedule", null, null, "001"));
        Instant start = Instant.parse("2026-09-25T08:00:00Z");

        var exactEnd = taskService.create(owner.user().id(), new TaskCommand(subject.id(), "Exact end", null,
                TaskStatus.TODO, start, start.plusSeconds(30 * 60L), 30, "exact"));
        var noDeadline = taskService.create(owner.user().id(), new TaskCommand(subject.id(), "No deadline", null,
                TaskStatus.TODO, start.plusSeconds(60 * 60L), null, 30, "none"));

        assertThat(exactEnd.scheduledAt()).isEqualTo(start);
        assertThat(noDeadline.scheduledAt()).isEqualTo(start.plusSeconds(60 * 60L));
        assertThatThrownBy(() -> taskService.create(owner.user().id(), new TaskCommand(subject.id(), "Late end", null,
                TaskStatus.TODO, start.plusSeconds(2 * 60 * 60L), start.plusSeconds(2 * 60 * 60L + 29 * 60L), 30,
                "late")))
                .isInstanceOf(DomainException.class)
                .extracting(error -> ((DomainException) error).code())
                .isEqualTo("VALIDATION_FAILED");
    }

    @Test
    void taskUpdateRejectsDeadlineAndDurationChangesThatMoveTheEndPastDueAt() {
        var owner = register("schedule-deadline-update");
        SubjectView subject = subjectService.create(owner.user().id(), new SubjectCommand(
                "Schedule", null, null, "001"));
        Instant start = Instant.parse("2026-09-25T08:00:00Z");
        var dueChange = taskService.create(owner.user().id(), new TaskCommand(subject.id(), "Due change", null,
                TaskStatus.TODO, start, start.plusSeconds(30 * 60L), 30, "due"));
        var durationChange = taskService.create(owner.user().id(), new TaskCommand(subject.id(), "Duration change", null,
                TaskStatus.TODO, start.plusSeconds(60 * 60L), start.plusSeconds(90 * 60L), 30, "duration"));

        assertThatThrownBy(() -> taskService.update(owner.user().id(), dueChange.id(), dueChange.version(),
                new TaskCommand(subject.id(), "Due change", null, TaskStatus.TODO, start,
                        start.plusSeconds(29 * 60L), 30, "due")))
                .isInstanceOf(DomainException.class)
                .extracting(error -> ((DomainException) error).code())
                .isEqualTo("VALIDATION_FAILED");
        assertThatThrownBy(() -> taskService.update(owner.user().id(), durationChange.id(), durationChange.version(),
                new TaskCommand(subject.id(), "Duration change", null, TaskStatus.TODO,
                        start.plusSeconds(60 * 60L), start.plusSeconds(90 * 60L), 60, "duration")))
                .isInstanceOf(DomainException.class)
                .extracting(error -> ((DomainException) error).code())
                .isEqualTo("VALIDATION_FAILED");

        assertThat(taskService.get(owner.user().id(), dueChange.id()).version()).isZero();
        assertThat(taskService.get(owner.user().id(), dueChange.id()).dueAt()).isEqualTo(dueChange.dueAt());
        assertThat(taskService.get(owner.user().id(), durationChange.id()).version()).isZero();
        assertThat(taskService.get(owner.user().id(), durationChange.id()).durationMinutes()).isEqualTo(30);
    }

    @Test
    void cancelledScheduledTasksValidateOnCreateAndTimeChangesButAllowStatusOnlyCancellation() {
        var owner = register("schedule-deadline-cancelled");
        SubjectView subject = subjectService.create(owner.user().id(), new SubjectCommand(
                "Schedule", null, null, "001"));
        Instant start = Instant.parse("2026-09-25T08:00:00Z");

        assertThatThrownBy(() -> taskService.create(owner.user().id(), new TaskCommand(subject.id(), "Late cancelled", null,
                TaskStatus.CANCELLED, start, start.plusSeconds(29 * 60L), 30, "late")))
                .isInstanceOf(DomainException.class)
                .extracting(error -> ((DomainException) error).code())
                .isEqualTo("VALIDATION_FAILED");

        var cancelled = taskService.create(owner.user().id(), new TaskCommand(subject.id(), "Cancelled", null,
                TaskStatus.CANCELLED, start, start.plusSeconds(60 * 60L), 30, "cancelled"));
        assertThatThrownBy(() -> taskService.update(owner.user().id(), cancelled.id(), cancelled.version(),
                new TaskCommand(subject.id(), "Cancelled", null, TaskStatus.CANCELLED, start,
                        start.plusSeconds(29 * 60L), 30, "cancelled")))
                .isInstanceOf(DomainException.class)
                .extracting(error -> ((DomainException) error).code())
                .isEqualTo("VALIDATION_FAILED");

        var active = taskService.create(owner.user().id(), new TaskCommand(subject.id(), "Active", null,
                TaskStatus.TODO, start.plusSeconds(2 * 60 * 60L), null, 30, "active"));
        TaskView statusOnlyCancellation = taskService.update(owner.user().id(), active.id(), active.version(),
                new TaskCommand(subject.id(), "Active", null, TaskStatus.CANCELLED,
                        active.scheduledAt(), active.dueAt(), active.durationMinutes(), "active"));
        assertThat(statusOnlyCancellation.status()).isEqualTo(TaskStatus.CANCELLED);
        assertThat(statusOnlyCancellation.version()).isEqualTo(active.version() + 1);
    }

    @Test
    void nonTemporalUpdatesAndEquivalentNullOrThirtyMinuteDurationPreserveLegacyOverdueTasks() {
        var owner = register("schedule-deadline-legacy-update");
        SubjectView subject = subjectService.create(owner.user().id(), new SubjectCommand(
                "Schedule", null, null, "001"));
        Instant start = Instant.parse("2026-09-25T08:00:00Z");
        var created = taskService.create(owner.user().id(), new TaskCommand(subject.id(), "Legacy", null,
                TaskStatus.TODO, start, null, null, "legacy"));
        TaskEntity legacy = taskRepository.findById(created.id()).orElseThrow();
        Instant overdueDeadline = start.plusSeconds(10 * 60L);
        legacy.update(subject.id(), legacy.getTitle(), legacy.getDescription(), legacy.getStatus(),
                legacy.getScheduledAt(), overdueDeadline, legacy.getDurationMinutes(), legacy.getSortKey());
        taskRepository.saveAndFlush(legacy);
        TaskView seeded = taskService.get(owner.user().id(), created.id());

        TaskView renamed = taskService.update(owner.user().id(), seeded.id(), seeded.version(), new TaskCommand(
                subject.id(), "Renamed", null, TaskStatus.TODO, start, overdueDeadline, null, "legacy"));
        TaskView completed = taskService.update(owner.user().id(), renamed.id(), renamed.version(), new TaskCommand(
                subject.id(), "Renamed", null, TaskStatus.DONE, start, overdueDeadline, 30, "legacy"));

        assertThat(completed.status()).isEqualTo(TaskStatus.DONE);
        assertThat(completed.scheduledAt()).isEqualTo(start);
        assertThat(completed.dueAt()).isEqualTo(overdueDeadline);
        assertThat(completed.durationMinutes()).isEqualTo(30);
    }

    @Test
    void taskRestoreRejectsRestoringAnOverlappingSchedule() {
        var owner = register("schedule-restore");
        SubjectView subject = subjectService.create(owner.user().id(), new SubjectCommand(
                "Schedule", null, null, "001"));
        Instant start = Instant.parse("2026-09-25T08:00:00Z");
        var deleted = taskService.create(owner.user().id(), scheduledTask(subject.id(), "Deleted", start, 30));
        taskService.delete(owner.user().id(), deleted.id(), deleted.version());
        taskService.create(owner.user().id(), scheduledTask(subject.id(), "Replacement", start, 30));

        assertThatThrownBy(() -> taskService.restore(owner.user().id(), deleted.id(), deleted.version() + 1))
                .isInstanceOf(DomainException.class)
                .extracting(error -> ((DomainException) error).code())
                .isEqualTo("VALIDATION_FAILED");
    }

    @Test
    void taskRestoreRejectsRestoringASchedulePastDeadlineWithoutUndeletingIt() {
        var owner = register("schedule-restore-deadline");
        SubjectView subject = subjectService.create(owner.user().id(), new SubjectCommand(
                "Schedule", null, null, "001"));
        Instant start = Instant.parse("2026-09-25T08:00:00Z");
        var created = taskService.create(owner.user().id(), new TaskCommand(subject.id(), "Legacy", null,
                TaskStatus.TODO, start, null, 30, "legacy"));
        TaskEntity legacy = taskRepository.findById(created.id()).orElseThrow();
        legacy.update(subject.id(), legacy.getTitle(), legacy.getDescription(), legacy.getStatus(),
                legacy.getScheduledAt(), start.plusSeconds(29 * 60L), legacy.getDurationMinutes(), legacy.getSortKey());
        TaskEntity seeded = taskRepository.saveAndFlush(legacy);
        taskService.delete(owner.user().id(), created.id(), seeded.getVersion());
        TaskView deleted = taskService.listIncludingDeleted(owner.user().id()).stream()
                .filter(task -> task.id().equals(created.id())).findFirst().orElseThrow();

        assertThatThrownBy(() -> taskService.restore(owner.user().id(), deleted.id(), deleted.version()))
                .isInstanceOf(DomainException.class)
                .extracting(error -> ((DomainException) error).code())
                .isEqualTo("VALIDATION_FAILED");

        TaskView stillDeleted = taskService.listIncludingDeleted(owner.user().id()).stream()
                .filter(task -> task.id().equals(created.id())).findFirst().orElseThrow();
        assertThat(stillDeleted.deletedAt()).isNotNull();
        assertThat(stillDeleted.scheduledAt()).isEqualTo(start);
        assertThat(stillDeleted.dueAt()).isEqualTo(start.plusSeconds(29 * 60L));
        assertThat(stillDeleted.version()).isEqualTo(deleted.version());
    }

    @Test
    void taskScheduleSwapKeepsAdjacentTasksInsideTheirOriginalWindow() {
        var owner = register("schedule-swap-adjacent");
        SubjectView subject = subjectService.create(owner.user().id(), new SubjectCommand(
                "Schedule", null, null, "001"));
        Instant start = Instant.parse("2026-09-25T08:00:00Z");
        Instant sourceDueAt = start.plusSeconds(3 * 60 * 60L);
        Instant targetDueAt = start.plusSeconds(3 * 60 * 60L);
        var source = taskService.create(owner.user().id(), new TaskCommand(subject.id(), "Source", null,
                TaskStatus.TODO, start, sourceDueAt, 60, "source"));
        var target = taskService.create(owner.user().id(), new TaskCommand(subject.id(), "Target", null,
                TaskStatus.TODO, start.plusSeconds(60 * 60L), targetDueAt, 90, "target"));

        var swapped = taskService.swapSchedules(owner.user().id(), source.id(), source.version(),
                target.id(), target.version());

        assertThat(swapped.target().scheduledAt()).isEqualTo(start);
        assertThat(swapped.source().scheduledAt()).isEqualTo(start.plusSeconds(90 * 60L));
        assertThat(swapped.target().durationMinutes()).isEqualTo(90);
        assertThat(swapped.source().durationMinutes()).isEqualTo(60);
        assertThat(swapped.source().dueAt()).isEqualTo(sourceDueAt);
        assertThat(swapped.target().dueAt()).isEqualTo(targetDueAt);
        assertThat(swapped.source().scheduledAt().plusSeconds(60 * 60L))
                .isEqualTo(start.plusSeconds(150 * 60L));

        Instant reverseWindowStart = start.plusSeconds(5 * 60 * 60L);
        var laterSource = taskService.create(owner.user().id(), scheduledTask(
                subject.id(), "Later source", reverseWindowStart.plusSeconds(90 * 60L), 60));
        var earlierTarget = taskService.create(owner.user().id(), scheduledTask(
                subject.id(), "Earlier target", reverseWindowStart, 90));

        var reverseSwap = taskService.swapSchedules(owner.user().id(), laterSource.id(), laterSource.version(),
                earlierTarget.id(), earlierTarget.version());

        assertThat(reverseSwap.source().scheduledAt()).isEqualTo(reverseWindowStart);
        assertThat(reverseSwap.target().scheduledAt()).isEqualTo(reverseWindowStart.plusSeconds(60 * 60L));
        assertThat(reverseSwap.target().scheduledAt().plusSeconds(90 * 60L))
                .isEqualTo(reverseWindowStart.plusSeconds(150 * 60L));

        Instant doneStart = start.plusSeconds(8 * 60 * 60L);
        var done = taskService.create(owner.user().id(), new TaskCommand(subject.id(), "Done", null,
                TaskStatus.DONE, doneStart, null, 60, "done"));
        var adjacentTodo = taskService.create(owner.user().id(), scheduledTask(
                subject.id(), "Adjacent todo", doneStart.plusSeconds(60 * 60L), 90));

        assertThatThrownBy(() -> taskService.swapSchedules(owner.user().id(), done.id(), done.version(),
                adjacentTodo.id(), adjacentTodo.version()))
                .isInstanceOf(DomainException.class)
                .extracting(error -> ((DomainException) error).code())
                .isEqualTo("VALIDATION_FAILED");
        assertThat(taskService.get(owner.user().id(), done.id()).scheduledAt()).isEqualTo(doneStart);
        assertThat(taskService.get(owner.user().id(), adjacentTodo.id()).scheduledAt())
                .isEqualTo(doneStart.plusSeconds(60 * 60L));

        Instant cancelledStart = doneStart.plusSeconds(4 * 60 * 60L);
        var cancelled = taskService.create(owner.user().id(), new TaskCommand(subject.id(), "Cancelled", null,
                TaskStatus.CANCELLED, cancelledStart, null, 60, "cancelled"));
        var adjacentActive = taskService.create(owner.user().id(), scheduledTask(
                subject.id(), "Adjacent active", cancelledStart.plusSeconds(60 * 60L), 90));

        assertThatThrownBy(() -> taskService.swapSchedules(owner.user().id(), cancelled.id(), cancelled.version(),
                adjacentActive.id(), adjacentActive.version()))
                .isInstanceOf(DomainException.class)
                .extracting(error -> ((DomainException) error).code())
                .isEqualTo("VALIDATION_FAILED");
        assertThat(taskService.get(owner.user().id(), cancelled.id()).scheduledAt()).isEqualTo(cancelledStart);
        assertThat(taskService.get(owner.user().id(), adjacentActive.id()).scheduledAt())
                .isEqualTo(cancelledStart.plusSeconds(60 * 60L));
    }

    @Test
    void taskScheduleSwapRejectsOverlapBetweenSwappedTasksAndWithThirdTask() {
        var owner = register("schedule-swap-overlap");
        SubjectView subject = subjectService.create(owner.user().id(), new SubjectCommand(
                "Schedule", null, null, "001"));
        Instant start = Instant.parse("2026-09-25T08:00:00Z");
        var shortTask = taskService.create(owner.user().id(), scheduledTask(subject.id(), "Short", start, 30));
        var longTask = taskService.create(owner.user().id(), scheduledTask(
                subject.id(), "Long", start.plusSeconds(60 * 60), 120));

        assertThatThrownBy(() -> taskService.swapSchedules(owner.user().id(), shortTask.id(), shortTask.version(),
                longTask.id(), longTask.version()))
                .isInstanceOf(DomainException.class)
                .extracting(error -> ((DomainException) error).code())
                .isEqualTo("VALIDATION_FAILED");
        assertThat(taskService.get(owner.user().id(), shortTask.id()).scheduledAt()).isEqualTo(start);
        assertThat(taskService.get(owner.user().id(), longTask.id()).scheduledAt()).isEqualTo(start.plusSeconds(3600));

        var first = taskService.create(owner.user().id(), scheduledTask(
                subject.id(), "First slot", start.plusSeconds(8 * 60 * 60), 120));
        var second = taskService.create(owner.user().id(), scheduledTask(
                subject.id(), "Second slot", start.plusSeconds(12 * 60 * 60), 30));
        taskService.create(owner.user().id(), scheduledTask(
                subject.id(), "Third slot", start.plusSeconds(13 * 60 * 60), 30));

        assertThatThrownBy(() -> taskService.swapSchedules(owner.user().id(), first.id(), first.version(),
                second.id(), second.version()))
                .isInstanceOf(DomainException.class)
                .extracting(error -> ((DomainException) error).code())
                .isEqualTo("VALIDATION_FAILED");
    }

    @Test
    void taskScheduleInsertionPushesOnlyCollidingSuccessorsAndPreservesGaps() {
        var owner = register("schedule-insert-cascade");
        SubjectView subject = subjectService.create(owner.user().id(), new SubjectCommand(
                "Schedule", null, null, "001"));
        Instant start = Instant.parse("2026-09-25T08:00:00Z");
        var predecessor = taskService.create(owner.user().id(), scheduledTask(subject.id(), "Predecessor", start, 60));
        var first = taskService.create(owner.user().id(), scheduledTask(
                subject.id(), "First successor", start.plusSeconds(60 * 60), 90));
        var second = taskService.create(owner.user().id(), scheduledTask(
                subject.id(), "Second successor", start.plusSeconds(3 * 60 * 60), 60));
        var withGap = taskService.create(owner.user().id(), scheduledTask(
                subject.id(), "Gap successor", start.plusSeconds(5 * 60 * 60), 30));
        var inserted = taskService.create(owner.user().id(), scheduledTask(subject.id(), "Inserted", null, 60));

        var changed = taskService.insertSchedule(owner.user().id(), inserted.id(), inserted.version(),
                start.plusSeconds(60 * 60), start, start.plusSeconds(14 * 60 * 60 + 30 * 60));

        assertThat(changed).extracting(view -> view.id())
                .containsExactly(inserted.id(), first.id(), second.id());
        assertThat(taskService.get(owner.user().id(), predecessor.id()).scheduledAt()).isEqualTo(start);
        assertThat(taskService.get(owner.user().id(), inserted.id()).scheduledAt()).isEqualTo(start.plusSeconds(3600));
        assertThat(taskService.get(owner.user().id(), first.id()).scheduledAt()).isEqualTo(start.plusSeconds(2 * 3600));
        assertThat(taskService.get(owner.user().id(), second.id()).scheduledAt()).isEqualTo(start.plusSeconds(3 * 3600 + 30 * 60));
        assertThat(taskService.get(owner.user().id(), withGap.id()).scheduledAt()).isEqualTo(start.plusSeconds(5 * 3600));
        assertThat(taskService.get(owner.user().id(), first.id()).version()).isEqualTo(first.version() + 1);
        assertThat(taskService.get(owner.user().id(), second.id()).version()).isEqualTo(second.version() + 1);
        assertThat(taskService.get(owner.user().id(), withGap.id()).version()).isEqualTo(withGap.version());
    }

    @Test
    void taskScheduleInsertionRoundsUpAndMovesOutOfAnOccupiedInterval() {
        var owner = register("schedule-insert-round");
        SubjectView subject = subjectService.create(owner.user().id(), new SubjectCommand(
                "Schedule", null, null, "001"));
        Instant start = Instant.parse("2026-09-25T08:00:00Z");
        var longTask = taskService.create(owner.user().id(), scheduledTask(subject.id(), "Long", start, 120));
        var covered = taskService.create(owner.user().id(), scheduledTask(
                subject.id(), "Covered", start.plusSeconds(2 * 3600), 30));
        var inserted = taskService.create(owner.user().id(), scheduledTask(subject.id(), "Inserted", null, 30));

        taskService.insertSchedule(owner.user().id(), inserted.id(), inserted.version(),
                start.plusSeconds(45 * 60), start, start.plusSeconds(14 * 60 * 60 + 30 * 60));

        assertThat(taskService.get(owner.user().id(), inserted.id()).scheduledAt()).isEqualTo(start.plusSeconds(60 * 60));
        assertThat(taskService.get(owner.user().id(), longTask.id()).scheduledAt()).isEqualTo(start.plusSeconds(90 * 60));
        assertThat(taskService.get(owner.user().id(), covered.id()).scheduledAt()).isEqualTo(start.plusSeconds(210 * 60));
    }

    @Test
    void taskScheduleInsertionPlacesDraggedTaskAtTargetEndWithoutMovingTargetOrSuccessor() {
        var owner = register("schedule-insert-mid-interval");
        SubjectView subject = subjectService.create(owner.user().id(), new SubjectCommand(
                "Schedule", null, null, "001"));
        Instant start = Instant.parse("2026-09-25T08:00:00Z");
        var containing = taskService.create(owner.user().id(), scheduledTask(
                subject.id(), "Containing", start.plusSeconds(60 * 60), 45));
        var successor = taskService.create(owner.user().id(), scheduledTask(
                subject.id(), "Successor", start.plusSeconds(4 * 60 * 60), 30));
        var inserted = taskService.create(owner.user().id(), scheduledTask(
                subject.id(), "Inserted", start.plusSeconds(6 * 60 * 60), 60));

        assertThatThrownBy(() -> taskService.insertSchedule(owner.user().id(), inserted.id(), inserted.version(),
                start.plusSeconds(90 * 60), start, start.plusSeconds(14 * 60 * 60 + 30 * 60), containing.id()))
                .isInstanceOf(DomainException.class)
                .extracting(error -> ((DomainException) error).code())
                .isEqualTo("RESOURCE_VERSION_CONFLICT");

        var changed = taskService.insertSchedule(owner.user().id(), inserted.id(), inserted.version(),
                start.plusSeconds(120 * 60), start, start.plusSeconds(14 * 60 * 60 + 30 * 60), containing.id());

        assertThat(changed).extracting(TaskView::id).containsExactly(inserted.id());
        assertThat(taskService.get(owner.user().id(), inserted.id()).scheduledAt())
                .isEqualTo(start.plusSeconds(120 * 60));
        assertThat(taskService.get(owner.user().id(), containing.id()).scheduledAt())
                .isEqualTo(start.plusSeconds(60 * 60));
        assertThat(taskService.get(owner.user().id(), successor.id()).scheduledAt())
                .isEqualTo(start.plusSeconds(4 * 60 * 60));
    }

    @Test
    void taskScheduleInsertionRejectsBodyPlacementThatWouldOverlapSuccessorWithoutMovingAnyTask() {
        var owner = register("schedule-insert-body-conflict");
        SubjectView subject = subjectService.create(owner.user().id(), new SubjectCommand(
                "Schedule", null, null, "001"));
        Instant start = Instant.parse("2026-09-25T08:00:00Z");
        var source = taskService.create(owner.user().id(), scheduledTask(
                subject.id(), "Source", start, 30));
        var target = taskService.create(owner.user().id(), scheduledTask(
                subject.id(), "Target", start.plusSeconds(60 * 60), 45));
        var successor = taskService.create(owner.user().id(), scheduledTask(
                subject.id(), "Successor", start.plusSeconds(120 * 60), 30));

        assertThatThrownBy(() -> taskService.insertSchedule(owner.user().id(), source.id(), source.version(),
                start.plusSeconds(120 * 60), start, start.plusSeconds(14 * 60 * 60 + 30 * 60), target.id()))
                .isInstanceOf(DomainException.class)
                .extracting(error -> ((DomainException) error).code())
                .isEqualTo("VALIDATION_FAILED");

        assertThat(taskService.get(owner.user().id(), source.id()).scheduledAt()).isEqualTo(start);
        assertThat(taskService.get(owner.user().id(), source.id()).version()).isEqualTo(source.version());
        assertThat(taskService.get(owner.user().id(), target.id()).scheduledAt()).isEqualTo(target.scheduledAt());
        assertThat(taskService.get(owner.user().id(), target.id()).version()).isEqualTo(target.version());
        assertThat(taskService.get(owner.user().id(), successor.id()).scheduledAt()).isEqualTo(successor.scheduledAt());
        assertThat(taskService.get(owner.user().id(), successor.id()).version()).isEqualTo(successor.version());
    }

    @Test
    void taskScheduleInsertionNeverMovesPreviousDayTaskAcrossTheWindowBoundary() {
        var owner = register("schedule-insert-prior-day");
        SubjectView subject = subjectService.create(owner.user().id(), new SubjectCommand(
                "Schedule", null, null, "001"));
        Instant windowStart = Instant.parse("2026-09-25T08:00:00Z");
        Instant previousStart = windowStart.minusSeconds(9 * 60 * 60);
        var previousDay = taskService.create(owner.user().id(), scheduledTask(
                subject.id(), "Previous day", previousStart, 600));
        var inserted = taskService.create(owner.user().id(), scheduledTask(subject.id(), "Inserted", null, 60));
        Instant windowLastStart = windowStart.plusSeconds(14 * 60 * 60 + 30 * 60);

        assertThatThrownBy(() -> taskService.insertSchedule(owner.user().id(), inserted.id(), inserted.version(),
                windowStart, windowStart, windowLastStart))
                .isInstanceOf(DomainException.class)
                .extracting(error -> ((DomainException) error).code())
                .isEqualTo("VALIDATION_FAILED");
        assertThat(taskService.get(owner.user().id(), previousDay.id()).scheduledAt()).isEqualTo(previousStart);
        assertThat(taskService.get(owner.user().id(), previousDay.id()).version()).isEqualTo(previousDay.version());
        assertThat(taskService.get(owner.user().id(), inserted.id()).scheduledAt()).isNull();

        var changed = taskService.insertSchedule(owner.user().id(), inserted.id(), inserted.version(),
                windowStart.plusSeconds(60 * 60), windowStart, windowLastStart);
        assertThat(changed).extracting(view -> view.id()).containsExactly(inserted.id());
        assertThat(taskService.get(owner.user().id(), previousDay.id()).scheduledAt()).isEqualTo(previousStart);
        assertThat(taskService.get(owner.user().id(), previousDay.id()).version()).isEqualTo(previousDay.version());
    }

    @Test
    void taskScheduleInsertionRejectsFixedDoneTasksAndWindowOverflowWithoutPartialWrites() {
        var owner = register("schedule-insert-atomic-reject");
        SubjectView subject = subjectService.create(owner.user().id(), new SubjectCommand(
                "Schedule", null, null, "001"));
        Instant start = Instant.parse("2026-09-25T08:00:00Z");
        var done = taskService.create(owner.user().id(), new TaskCommand(subject.id(), "Done", null,
                TaskStatus.DONE, start.plusSeconds(60 * 60), null, 30, "done"));
        var inserted = taskService.create(owner.user().id(), scheduledTask(subject.id(), "Inserted", null, 60));

        assertThatThrownBy(() -> taskService.insertSchedule(owner.user().id(), inserted.id(), inserted.version(),
                done.scheduledAt(), start, start.plusSeconds(14 * 60 * 60 + 30 * 60)))
                .isInstanceOf(DomainException.class)
                .extracting(error -> ((DomainException) error).code())
                .isEqualTo("VALIDATION_FAILED");
        assertThat(taskService.get(owner.user().id(), done.id()).scheduledAt()).isEqualTo(done.scheduledAt());
        assertThat(taskService.get(owner.user().id(), inserted.id()).scheduledAt()).isNull();

        var late = taskService.create(owner.user().id(), scheduledTask(
                subject.id(), "Last slot", start.plusSeconds(14 * 60 * 60 + 30 * 60), 30));
        var beforeLate = taskService.create(owner.user().id(), scheduledTask(subject.id(), "Before late", null, 60));
        assertThatThrownBy(() -> taskService.insertSchedule(owner.user().id(), beforeLate.id(), beforeLate.version(),
                start.plusSeconds(14 * 60 * 60), start, start.plusSeconds(14 * 60 * 60 + 30 * 60)))
                .isInstanceOf(DomainException.class)
                .extracting(error -> ((DomainException) error).code())
                .isEqualTo("VALIDATION_FAILED");
        assertThat(taskService.get(owner.user().id(), late.id()).scheduledAt())
                .isEqualTo(start.plusSeconds(14 * 60 * 60 + 30 * 60));
        assertThat(taskService.get(owner.user().id(), beforeLate.id()).scheduledAt()).isNull();
    }

    @Test
    void taskScheduleInsertionRejectsMovingAnAffectedTaskPastDeadlineAndRollsBack() {
        var owner = register("schedule-insert-due-rollback");
        SubjectView subject = subjectService.create(owner.user().id(), new SubjectCommand(
                "Schedule", null, null, "001"));
        Instant start = Instant.parse("2026-09-25T08:00:00Z");
        var dueTask = taskService.create(owner.user().id(), new TaskCommand(subject.id(), "Due", null,
                TaskStatus.TODO, start.plusSeconds(60 * 60), start.plusSeconds(90 * 60), 30, "due"));
        var inserted = taskService.create(owner.user().id(), scheduledTask(subject.id(), "Inserted", null, 60));

        assertThatThrownBy(() -> taskService.insertSchedule(owner.user().id(), inserted.id(), inserted.version(),
                dueTask.scheduledAt(), start, start.plusSeconds(14 * 60 * 60 + 30 * 60)))
                .isInstanceOf(DomainException.class)
                .extracting(error -> ((DomainException) error).code())
                .isEqualTo("VALIDATION_FAILED");

        TaskView unchangedDueTask = taskService.get(owner.user().id(), dueTask.id());
        TaskView unchangedInsertedTask = taskService.get(owner.user().id(), inserted.id());
        assertThat(unchangedDueTask.scheduledAt()).isEqualTo(dueTask.scheduledAt());
        assertThat(unchangedDueTask.dueAt()).isEqualTo(dueTask.dueAt());
        assertThat(unchangedDueTask.version()).isEqualTo(dueTask.version());
        assertThat(unchangedInsertedTask.scheduledAt()).isNull();
        assertThat(unchangedInsertedTask.version()).isEqualTo(inserted.version());
    }

    @Test
    void taskScheduleSwapRejectsDeadlineOverrunWithoutChangingEitherTask() {
        var owner = register("schedule-deadline-swap");
        SubjectView subject = subjectService.create(owner.user().id(), new SubjectCommand(
                "Schedule", null, null, "001"));
        Instant start = Instant.parse("2026-09-25T08:00:00Z");
        var source = taskService.create(owner.user().id(), new TaskCommand(subject.id(), "Source", null,
                TaskStatus.TODO, start, start.plusSeconds(60 * 60L), 30, "source"));
        var targetStart = start.plusSeconds(2 * 60 * 60L);
        var target = taskService.create(owner.user().id(), new TaskCommand(subject.id(), "Target", null,
                TaskStatus.TODO, targetStart, targetStart.plusSeconds(30 * 60L), 30, "target"));

        assertThatThrownBy(() -> taskService.swapSchedules(owner.user().id(), source.id(), source.version(),
                target.id(), target.version()))
                .isInstanceOf(DomainException.class)
                .extracting(error -> ((DomainException) error).code())
                .isEqualTo("VALIDATION_FAILED");

        assertThat(taskService.get(owner.user().id(), source.id()).scheduledAt()).isEqualTo(start);
        assertThat(taskService.get(owner.user().id(), source.id()).version()).isEqualTo(source.version());
        assertThat(taskService.get(owner.user().id(), target.id()).scheduledAt()).isEqualTo(targetStart);
        assertThat(taskService.get(owner.user().id(), target.id()).version()).isEqualTo(target.version());
    }

    @Test
    void concurrentTaskSchedulesForOneUserAreSerializedAcrossSubjects() throws Exception {
        var owner = register("schedule-concurrency");
        SubjectView firstSubject = subjectService.create(owner.user().id(), new SubjectCommand(
                "Schedule A", null, null, "001"));
        SubjectView secondSubject = subjectService.create(owner.user().id(), new SubjectCommand(
                "Schedule B", null, null, "002"));
        Instant start = Instant.parse("2026-09-25T08:00:00Z");
        CountDownLatch ready = new CountDownLatch(2);
        CountDownLatch startTogether = new CountDownLatch(1);

        try (ExecutorService executor = Executors.newFixedThreadPool(2)) {
            Future<Boolean> first = executor.submit(() -> tryCreateAfterGate(
                    owner.user().id(), scheduledTask(firstSubject.id(), "First", start, 60), ready, startTogether));
            Future<Boolean> second = executor.submit(() -> tryCreateAfterGate(
                    owner.user().id(), scheduledTask(secondSubject.id(), "Second", start.plusSeconds(30 * 60), 60),
                    ready, startTogether));

            assertThat(ready.await(5, TimeUnit.SECONDS)).isTrue();
            startTogether.countDown();
            assertThat(List.of(first.get(10, TimeUnit.SECONDS), second.get(10, TimeUnit.SECONDS)))
                    .containsExactlyInAnyOrder(true, false);
        }
    }

    @Test
    void concurrentTaskScheduleInsertionsAreSerializedWithoutOverlapping() throws Exception {
        var owner = register("schedule-insert-concurrency");
        SubjectView firstSubject = subjectService.create(owner.user().id(), new SubjectCommand(
                "Schedule A", null, null, "001"));
        SubjectView secondSubject = subjectService.create(owner.user().id(), new SubjectCommand(
                "Schedule B", null, null, "002"));
        Instant start = Instant.parse("2026-09-25T08:00:00Z");
        var first = taskService.create(owner.user().id(), scheduledTask(firstSubject.id(), "First", null, 60));
        var second = taskService.create(owner.user().id(), scheduledTask(secondSubject.id(), "Second", null, 60));
        CountDownLatch ready = new CountDownLatch(2);
        CountDownLatch startTogether = new CountDownLatch(1);

        try (ExecutorService executor = Executors.newFixedThreadPool(2)) {
            Future<?> firstResult = executor.submit(() -> insertAfterGate(
                    owner.user().id(), first.id(), first.version(), start, start, ready, startTogether));
            Future<?> secondResult = executor.submit(() -> insertAfterGate(
                    owner.user().id(), second.id(), second.version(), start, start, ready, startTogether));

            assertThat(ready.await(5, TimeUnit.SECONDS)).isTrue();
            startTogether.countDown();
            firstResult.get(10, TimeUnit.SECONDS);
            secondResult.get(10, TimeUnit.SECONDS);
        }

        var scheduled = List.of(taskService.get(owner.user().id(), first.id()),
                taskService.get(owner.user().id(), second.id()));
        assertThat(scheduled).extracting(view -> view.scheduledAt()).doesNotContainNull();
        assertThat(Duration.between(scheduled.get(0).scheduledAt(), scheduled.get(1).scheduledAt()).abs())
                .isGreaterThanOrEqualTo(Duration.ofHours(1));
    }

    private void insertAfterGate(UUID userId, UUID taskId, long baseVersion, Instant target,
            Instant windowStart, CountDownLatch ready, CountDownLatch startTogether) {
        ready.countDown();
        try {
            if (!startTogether.await(5, TimeUnit.SECONDS)) {
                throw new IllegalStateException("Concurrent insertion test did not start");
            }
            taskService.insertSchedule(userId, taskId, baseVersion, target,
                    windowStart, windowStart.plusSeconds(14 * 60 * 60 + 30 * 60));
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("Concurrent insertion test was interrupted", exception);
        }
    }

    private boolean tryCreateAfterGate(UUID userId, TaskCommand command, CountDownLatch ready,
            CountDownLatch startTogether) throws InterruptedException {
        ready.countDown();
        if (!startTogether.await(5, TimeUnit.SECONDS)) {
            throw new IllegalStateException("Concurrent schedule test did not start");
        }
        try {
            taskService.create(userId, command);
            return true;
        } catch (DomainException exception) {
            if ("VALIDATION_FAILED".equals(exception.code())) {
                return false;
            }
            throw exception;
        }
    }

    private TaskCommand scheduledTask(UUID subjectId, String title, Instant scheduledAt, Integer durationMinutes) {
        return new TaskCommand(subjectId, title, null, TaskStatus.TODO, scheduledAt, null, durationMinutes, title);
    }

    @Test
    void legacyDefaultSubjectCanBeDeleted() {
        var result = register("protected");
        SubjectView defaultSubject = subjectService.get(result.user().id(), subjectRepository.save(new SubjectEntity(
                java.util.UUID.randomUUID(), result.user().id(), "未分类", null, null, "0000", true)).getId());

        subjectService.delete(result.user().id(), defaultSubject.id(), defaultSubject.version());

        assertThat(subjectService.list(result.user().id())).isEmpty();
    }

    @Test
    void activeSubjectNamesAreUniqueWithinAUser() {
        var result = register("unique");
        subjectService.create(result.user().id(), new SubjectCommand("Physics", null, null, "001"));

        assertThatThrownBy(() -> subjectService.create(result.user().id(),
                new SubjectCommand(" physics ", null, null, "002")))
                .isInstanceOf(DomainException.class)
                .extracting(error -> ((DomainException) error).code())
                .isEqualTo("MUTATION_REJECTED");
    }

    private com.auralis.app.identity.AuthResult register(String suffix) {
        return identityService.register(
                suffix + "@example.com", "correct horse battery staple", suffix,
                new DeviceCommand("device-" + suffix, "Test", DevicePlatform.WEB));
    }
}
