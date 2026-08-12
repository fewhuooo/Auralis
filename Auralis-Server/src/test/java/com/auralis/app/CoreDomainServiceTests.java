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
import com.auralis.app.subject.internal.persistence.SubjectRepository;
import com.auralis.app.task.TaskService;
import com.auralis.app.task.internal.persistence.TaskRepository;
import com.auralis.app.knowledge.internal.persistence.KnowledgeBlockRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import java.util.List;

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
    private TaskRepository taskRepository;

    @Autowired
    private SubjectRepository subjectRepository;

    @Autowired
    private UserRepository userRepository;

    @BeforeEach
    void cleanData() {
        knowledgeBlockRepository.deleteAll();
        taskRepository.deleteAll();
        subjectRepository.deleteAll();
        refreshSessionRepository.deleteAll();
        deviceRepository.deleteAll();
        userRepository.deleteAll();
    }

    @Test
    void registrationCreatesAProtectedDefaultSubject() {
        var result = register("default");

        var defaultSubject = subjectRepository
                .findByUserIdAndDefaultSubjectTrueAndDeletedAtIsNull(result.user().id())
                .orElseThrow();

        assertThat(subjectService.get(result.user().id(), defaultSubject.getId()).defaultSubject()).isTrue();
        assertThat(subjectService.list(result.user().id())).extracting(SubjectView::name).containsExactly("未分类");
    }

    @Test
    void updateRequiresTheExactVersionAndDeleteRestoreAdvancesIt() {
        var result = register("version");
        SubjectView created = subjectService.create(result.user().id(), new SubjectCommand(
                "Physics", null, null, null, "001"));

        SubjectView updated = subjectService.update(result.user().id(), created.id(), created.version(),
                new SubjectCommand("Physics 2", null, null, null, "001"));
        assertThat(updated.version()).isEqualTo(created.version() + 1);
        assertThatThrownBy(() -> subjectService.update(result.user().id(), created.id(), created.version(),
                new SubjectCommand("Physics 3", null, null, null, "002")))
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
        var otherSubject = subjectRepository
                .findByUserIdAndDefaultSubjectTrueAndDeletedAtIsNull(other.user().id())
                .orElseThrow();

        assertThatThrownBy(() -> knowledgeBlockService.create(owner.user().id(), new KnowledgeBlockCommand(
                otherSubject.getId(), null, "Block", null, "Content", List.of("tag"), null)))
                .isInstanceOf(DomainException.class)
                .extracting(error -> ((DomainException) error).code())
                .isEqualTo("RESOURCE_NOT_FOUND");
    }

    @Test
    void defaultSubjectCannotBeDeleted() {
        var result = register("protected");
        SubjectView defaultSubject = subjectService.list(result.user().id()).getFirst();

        assertThatThrownBy(() -> subjectService.delete(result.user().id(), defaultSubject.id(), defaultSubject.version()))
                .isInstanceOf(DomainException.class)
                .extracting(error -> ((DomainException) error).code())
                .isEqualTo("MUTATION_REJECTED");
    }

    @Test
    void activeSubjectNamesAreUniqueWithinAUser() {
        var result = register("unique");
        subjectService.create(result.user().id(), new SubjectCommand("Physics", null, null, null, "001"));

        assertThatThrownBy(() -> subjectService.create(result.user().id(),
                new SubjectCommand(" physics ", null, null, null, "002")))
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
