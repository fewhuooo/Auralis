package com.auralis.app;

import com.auralis.app.identity.DeviceCommand;
import com.auralis.app.identity.DevicePlatform;
import com.auralis.app.identity.IdentityService;
import com.auralis.app.identity.internal.persistence.DeviceRepository;
import com.auralis.app.identity.internal.persistence.RefreshSessionRepository;
import com.auralis.app.identity.internal.persistence.UserRepository;
import com.auralis.app.knowledge.internal.persistence.KnowledgeBlockRepository;
import com.auralis.app.relation.RelationNodeType;
import com.auralis.app.relation.RelationType;
import com.auralis.app.relation.internal.persistence.RelationEntity;
import com.auralis.app.relation.internal.persistence.RelationRepository;
import com.auralis.app.source.AssetUploadStatus;
import com.auralis.app.source.SourceIngestionStatus;
import com.auralis.app.source.SourceType;
import com.auralis.app.source.internal.persistence.AssetEntity;
import com.auralis.app.source.internal.persistence.AssetRepository;
import com.auralis.app.source.internal.persistence.SourceEntity;
import com.auralis.app.source.internal.persistence.SourceRepository;
import com.auralis.app.subject.SubjectCommand;
import com.auralis.app.subject.SubjectService;
import com.auralis.app.subject.internal.persistence.SubjectRepository;
import com.auralis.app.task.internal.persistence.TaskRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(classes = AuralisApplication.class)
@ActiveProfiles("test")
class SourceAssetRelationRepositoryTests {

    @Autowired
    private IdentityService identityService;

    @Autowired
    private AssetRepository assetRepository;

    @Autowired
    private SourceRepository sourceRepository;

    @Autowired
    private RelationRepository relationRepository;

    @Autowired
    private KnowledgeBlockRepository knowledgeBlockRepository;

    @Autowired
    private TaskRepository taskRepository;

    @Autowired
    private SubjectRepository subjectRepository;

    @Autowired
    private SubjectService subjectService;

    @Autowired
    private RefreshSessionRepository refreshSessionRepository;

    @Autowired
    private DeviceRepository deviceRepository;

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
    void repositoriesRequireTheOwningUserForAssetSourceAndRelation() {
        var owner = register("owner");
        var other = register("other");
        UUID subjectId = subjectService.create(owner.user().id(), new SubjectCommand(
                "Owner Subject", null, null, null, "001")).id();

        AssetEntity asset = assetRepository.save(new AssetEntity(
                UUID.randomUUID(), owner.user().id(), "users/" + owner.user().id() + "/assets/object",
                "notes.md", 20L, "text/markdown", null, AssetUploadStatus.UPLOADING));
        SourceEntity source = sourceRepository.save(new SourceEntity(
                UUID.randomUUID(), owner.user().id(), SourceType.TEXT, subjectId, "Notes", null,
                null, "text", null, SourceIngestionStatus.PENDING));
        RelationEntity relation = relationRepository.save(new RelationEntity(
                UUID.randomUUID(), owner.user().id(), RelationNodeType.SUBJECT, subjectId,
                RelationNodeType.SOURCE, source.getId(), RelationType.REFERENCES, null));

        assertThat(assetRepository.findByIdAndUserId(asset.getId(), other.user().id())).isEmpty();
        assertThat(sourceRepository.findByIdAndUserId(source.getId(), other.user().id())).isEmpty();
        assertThat(relationRepository.findByIdAndUserId(relation.getId(), other.user().id())).isEmpty();
        assertThat(sourceRepository.findAllByUserIdAndDeletedAtIsNullOrderByUpdatedAtDescIdAsc(other.user().id()))
                .isEmpty();
    }

    @Test
    void activeSourceAndRelationQueriesExcludeTombstones() {
        var owner = register("tombstone");
        UUID subjectId = subjectService.create(owner.user().id(), new SubjectCommand(
                "Owner Subject", null, null, null, "001")).id();
        SourceEntity source = sourceRepository.save(new SourceEntity(
                UUID.randomUUID(), owner.user().id(), SourceType.TEXT, subjectId, "Notes", null,
                null, "text", null, SourceIngestionStatus.PENDING));
        RelationEntity relation = relationRepository.save(new RelationEntity(
                UUID.randomUUID(), owner.user().id(), RelationNodeType.SUBJECT, subjectId,
                RelationNodeType.SOURCE, source.getId(), RelationType.REFERENCES, null));

        source.softDelete();
        relation.softDelete();
        sourceRepository.saveAndFlush(source);
        relationRepository.saveAndFlush(relation);

        assertThat(sourceRepository.findByIdAndUserIdAndDeletedAtIsNull(source.getId(), owner.user().id()))
                .isEmpty();
        assertThat(relationRepository.findByIdAndUserIdAndDeletedAtIsNull(relation.getId(), owner.user().id()))
                .isEmpty();
    }

    private com.auralis.app.identity.AuthResult register(String suffix) {
        return identityService.register(
                suffix + "@example.com", "correct horse battery staple", suffix,
                new DeviceCommand("device-" + suffix, "Test", DevicePlatform.WEB));
    }
}
