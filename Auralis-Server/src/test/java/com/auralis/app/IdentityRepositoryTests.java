package com.auralis.app;

import com.auralis.app.identity.DevicePlatform;
import com.auralis.app.identity.UserStatus;
import com.auralis.app.identity.internal.persistence.DeviceEntity;
import com.auralis.app.identity.internal.persistence.DeviceRepository;
import com.auralis.app.identity.internal.persistence.RefreshSessionEntity;
import com.auralis.app.identity.internal.persistence.RefreshSessionRepository;
import com.auralis.app.identity.internal.persistence.UserEntity;
import com.auralis.app.identity.internal.persistence.UserRepository;
import com.auralis.app.knowledge.internal.persistence.KnowledgeBlockRepository;
import com.auralis.app.subject.internal.persistence.SubjectRepository;
import com.auralis.app.task.internal.persistence.TaskRepository;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(classes = AuralisApplication.class)
@ActiveProfiles("test")
class IdentityRepositoryTests {

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private KnowledgeBlockRepository knowledgeBlockRepository;

    @Autowired
    private TaskRepository taskRepository;

    @Autowired
    private SubjectRepository subjectRepository;

    @Autowired
    private DeviceRepository deviceRepository;

    @Autowired
    private RefreshSessionRepository refreshSessionRepository;

    @Autowired
    private EntityManager entityManager;

    @BeforeEach
    void cleanIdentityData() {
        knowledgeBlockRepository.deleteAll();
        taskRepository.deleteAll();
        subjectRepository.deleteAll();
        refreshSessionRepository.deleteAll();
        deviceRepository.deleteAll();
        userRepository.deleteAll();
    }

    @Test
    void ownerScopedSessionLookupDoesNotCrossUsers() {
        UserEntity firstUser = saveUser("first-user");
        UserEntity secondUser = saveUser("second-user");
        DeviceEntity firstDevice = saveDevice(firstUser, "shared-device");
        DeviceEntity secondDevice = saveDevice(secondUser, "shared-device");
        RefreshSessionEntity session = saveSession(firstUser, firstDevice, UUID.randomUUID(), "first-token");

        assertThat(refreshSessionRepository.findByIdAndUserId(session.getId(), firstUser.getId()))
                .isPresent();
        assertThat(refreshSessionRepository.findByIdAndUserId(session.getId(), secondUser.getId()))
                .isEmpty();
        assertThat(deviceRepository.findByUserIdAndClientDeviceKey(firstUser.getId(), "shared-device"))
                .get()
                .extracting(DeviceEntity::getId)
                .isEqualTo(firstDevice.getId());
        assertThat(deviceRepository.findByUserIdAndClientDeviceKey(secondUser.getId(), "shared-device"))
                .get()
                .extracting(DeviceEntity::getId)
                .isEqualTo(secondDevice.getId());
    }

    @Test
    void familyRevocationDoesNotTouchAnotherUsersFamily() {
        UserEntity firstUser = saveUser("first-user");
        UserEntity secondUser = saveUser("second-user");
        DeviceEntity firstDevice = saveDevice(firstUser, "first-device");
        DeviceEntity secondDevice = saveDevice(secondUser, "second-device");
        UUID firstFamily = UUID.randomUUID();
        UUID secondFamily = UUID.randomUUID();
        RefreshSessionEntity firstSession = saveSession(firstUser, firstDevice, firstFamily, "first-token");
        RefreshSessionEntity secondSession = saveSession(secondUser, secondDevice, secondFamily, "second-token");
        Instant revokedAt = Instant.parse("2026-08-12T00:00:00Z");

        assertThat(refreshSessionRepository.revokeFamily(firstFamily, revokedAt)).isEqualTo(1);
        entityManager.clear();

        assertThat(refreshSessionRepository.findByIdAndUserId(firstSession.getId(), firstUser.getId()))
                .get()
                .extracting(RefreshSessionEntity::getRevokedAt)
                .isEqualTo(revokedAt);
        assertThat(refreshSessionRepository.findByIdAndUserId(secondSession.getId(), secondUser.getId()))
                .get()
                .extracting(RefreshSessionEntity::getRevokedAt)
                .isNull();
    }

    private UserEntity saveUser(String username) {
        return userRepository.save(new UserEntity(
                UUID.randomUUID(), username, username, "{bcrypt}hash", username, null, UserStatus.ACTIVE));
    }

    private DeviceEntity saveDevice(UserEntity user, String clientDeviceKey) {
        return deviceRepository.save(new DeviceEntity(
                UUID.randomUUID(), user.getId(), clientDeviceKey, "Test device", DevicePlatform.WEB));
    }

    private RefreshSessionEntity saveSession(
            UserEntity user, DeviceEntity device, UUID familyId, String tokenHash) {
        return refreshSessionRepository.save(new RefreshSessionEntity(
                UUID.randomUUID(), user.getId(), device.getId(), familyId, tokenHash,
                Instant.parse("2026-08-12T00:00:00Z"),
                Instant.parse("2026-09-11T00:00:00Z")));
    }
}
