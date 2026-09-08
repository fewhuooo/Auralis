package com.auralis.app;

import com.auralis.app.identity.UserStatus;
import com.auralis.app.identity.internal.persistence.UserEntity;
import com.auralis.app.identity.internal.persistence.UserRepository;
import com.auralis.app.knowledge.internal.persistence.KnowledgeBlockEntity;
import com.auralis.app.knowledge.internal.persistence.KnowledgeBlockRepository;
import com.auralis.app.subject.internal.persistence.SubjectEntity;
import com.auralis.app.subject.internal.persistence.SubjectRepository;
import com.auralis.app.task.TaskStatus;
import com.auralis.app.task.internal.persistence.TaskEntity;
import com.auralis.app.task.internal.persistence.TaskRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(classes = AuralisApplication.class)
@ActiveProfiles("test")
class CoreDomainRepositoryTests {

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private SubjectRepository subjectRepository;

    @Autowired
    private KnowledgeBlockRepository knowledgeBlockRepository;

    @Autowired
    private TaskRepository taskRepository;

    @Test
    void repositoriesListOnlyActiveResourcesForTheOwningUser() {
        UserEntity owner = saveUser();
        UserEntity other = saveUser();
        SubjectEntity activeSubject = subjectRepository.save(subject(owner.getId(), false));
        SubjectEntity deletedSubject = subjectRepository.save(subject(owner.getId(), true));
        SubjectEntity otherSubject = subjectRepository.save(subject(other.getId(), false));
        KnowledgeBlockEntity activeBlock = knowledgeBlockRepository.save(block(owner.getId(), activeSubject.getId(), false));
        knowledgeBlockRepository.save(block(owner.getId(), deletedSubject.getId(), true));
        knowledgeBlockRepository.save(block(other.getId(), otherSubject.getId(), false));
        TaskEntity activeTask = taskRepository.save(task(owner.getId(), activeSubject.getId(), false));
        taskRepository.save(task(owner.getId(), deletedSubject.getId(), true));
        taskRepository.save(task(other.getId(), otherSubject.getId(), false));

        assertThat(subjectRepository.findAllByUserIdAndDeletedAtIsNullOrderBySortKeyAscUpdatedAtDescIdAsc(owner.getId()))
                .extracting(SubjectEntity::getId)
                .containsExactly(activeSubject.getId());
        assertThat(knowledgeBlockRepository.findAllByUserIdAndDeletedAtIsNullOrderByUpdatedAtDescIdAsc(owner.getId()))
                .extracting(KnowledgeBlockEntity::getId)
                .containsExactly(activeBlock.getId());
        assertThat(taskRepository.findAllByUserIdAndDeletedAtIsNullOrderByUpdatedAtDescIdAsc(owner.getId()))
                .extracting(TaskEntity::getId)
                .containsExactly(activeTask.getId());
    }

    @Test
    void repositoriesCanFindAResourceOnlyWithTheMatchingOwner() {
        UserEntity owner = saveUser();
        UserEntity other = saveUser();
        SubjectEntity subject = subjectRepository.save(subject(owner.getId(), false));
        KnowledgeBlockEntity block = knowledgeBlockRepository.save(block(owner.getId(), subject.getId(), false));
        TaskEntity task = taskRepository.save(task(owner.getId(), subject.getId(), false));

        assertThat(subjectRepository.findByIdAndUserIdAndDeletedAtIsNull(subject.getId(), owner.getId())).isPresent();
        assertThat(subjectRepository.findByIdAndUserIdAndDeletedAtIsNull(subject.getId(), other.getId())).isEmpty();
        assertThat(knowledgeBlockRepository.findByIdAndUserIdAndDeletedAtIsNull(block.getId(), other.getId())).isEmpty();
        assertThat(taskRepository.findByIdAndUserIdAndDeletedAtIsNull(task.getId(), other.getId())).isEmpty();
    }

    private UserEntity saveUser() {
        UUID id = UUID.randomUUID();
        return userRepository.save(new UserEntity(
                id,
                "user-" + id,
                id.toString(),
                "{bcrypt}hash",
                "User",
                null,
                UserStatus.ACTIVE));
    }

    private SubjectEntity subject(UUID userId, boolean deleted) {
        SubjectEntity entity = new SubjectEntity(
                UUID.randomUUID(), userId, "Mathematics", "Description", "book", "001", false);
        if (deleted) {
            entity.softDelete();
        }
        return entity;
    }

    private KnowledgeBlockEntity block(UUID userId, UUID subjectId, boolean deleted) {
        KnowledgeBlockEntity entity = new KnowledgeBlockEntity(
                UUID.randomUUID(), userId, subjectId, null, "Linear algebra", "Summary", "Content", "[\"math\"]", null);
        if (deleted) {
            entity.softDelete();
        }
        return entity;
    }

    private TaskEntity task(UUID userId, UUID subjectId, boolean deleted) {
        TaskEntity entity = new TaskEntity(
                UUID.randomUUID(), userId, subjectId, "Read chapter", "Description", TaskStatus.TODO,
                null, null, 30, "001");
        if (deleted) {
            entity.softDelete();
        }
        return entity;
    }
}
