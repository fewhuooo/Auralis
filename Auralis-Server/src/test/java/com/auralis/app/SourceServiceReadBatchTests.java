package com.auralis.app;

import com.auralis.app.source.ParsedDocumentIngestionPort;
import com.auralis.app.source.SourceIngestionStatus;
import com.auralis.app.source.SourceService;
import com.auralis.app.source.SourceType;
import com.auralis.app.source.SourceView;
import com.auralis.app.source.internal.persistence.AssetEntity;
import com.auralis.app.source.internal.persistence.AssetRepository;
import com.auralis.app.source.internal.persistence.ParsedDocumentRepository;
import com.auralis.app.source.internal.persistence.SourceEntity;
import com.auralis.app.source.internal.persistence.SourceRepository;
import com.auralis.app.subject.SubjectLockCoordinator;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.ApplicationEventPublisher;

import java.util.List;
import java.util.Set;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class SourceServiceReadBatchTests {

    @Mock
    private SourceRepository sourceRepository;
    @Mock
    private AssetRepository assetRepository;
    @Mock
    private SubjectLockCoordinator subjectLockCoordinator;
    @Mock
    private ApplicationEventPublisher eventPublisher;
    @Mock
    private ParsedDocumentRepository parsedDocumentRepository;
    @Mock
    private ParsedDocumentIngestionPort ingestionJobService;

    private SourceService sourceService;

    @BeforeEach
    void setUp() {
        sourceService = new SourceService(sourceRepository, assetRepository, subjectLockCoordinator,
                eventPublisher, parsedDocumentRepository, ingestionJobService);
    }

    @Test
    void listLoadsAssetSizesInOneOwnerScopedBatchAndKeepsSourceOrdering() {
        UUID userId = UUID.randomUUID();
        UUID subjectId = UUID.randomUUID();
        UUID firstAssetId = UUID.randomUUID();
        UUID secondAssetId = UUID.randomUUID();
        SourceEntity first = source(userId, subjectId, "first", firstAssetId);
        SourceEntity second = source(userId, subjectId, "second", secondAssetId);
        when(sourceRepository.findAllByUserIdAndDeletedAtIsNullOrderByUpdatedAtDescIdAsc(userId))
                .thenReturn(List.of(first, second));
        when(assetRepository.findAllByUserIdAndIdIn(userId, List.of(firstAssetId, secondAssetId)))
                .thenReturn(List.of(asset(userId, firstAssetId, 101), asset(userId, secondAssetId, 202)));

        List<SourceView> result = sourceService.list(userId);

        assertThat(result).extracting(SourceView::title).containsExactly("first", "second");
        assertThat(result).extracting(SourceView::assetSizeBytes).containsExactly(101L, 202L);
        verify(sourceRepository).findAllByUserIdAndDeletedAtIsNullOrderByUpdatedAtDescIdAsc(userId);
        verify(assetRepository).findAllByUserIdAndIdIn(userId, List.of(firstAssetId, secondAssetId));
        verify(assetRepository, never()).findByIdAndUserId(eq(firstAssetId), eq(userId));
        verify(assetRepository, never()).findByIdAndUserId(eq(secondAssetId), eq(userId));
    }

    @Test
    void retrievalSourceLookupUsesOwnerScopedActiveQueryAndBatchesAssetMetadata() {
        UUID userId = UUID.randomUUID();
        UUID sourceId = UUID.randomUUID();
        UUID assetId = UUID.randomUUID();
        SourceEntity source = source(userId, UUID.randomUUID(), "owned", assetId);
        when(sourceRepository.findAllByUserIdAndIdInAndDeletedAtIsNull(userId, Set.of(sourceId)))
                .thenReturn(List.of(source));
        when(assetRepository.findAllByUserIdAndIdIn(userId, List.of(assetId)))
                .thenReturn(List.of(asset(userId, assetId, 303)));

        List<SourceView> result = sourceService.findActiveViewsByIds(userId, Set.of(sourceId));

        assertThat(result).singleElement().satisfies(view -> {
            assertThat(view.title()).isEqualTo("owned");
            assertThat(view.assetSizeBytes()).isEqualTo(303L);
        });
        verify(sourceRepository).findAllByUserIdAndIdInAndDeletedAtIsNull(userId, Set.of(sourceId));
        verify(assetRepository).findAllByUserIdAndIdIn(userId, List.of(assetId));
    }

    private SourceEntity source(UUID userId, UUID subjectId, String title, UUID assetId) {
        return new SourceEntity(UUID.randomUUID(), userId, SourceType.FILE, subjectId, title, assetId,
                null, null, null, SourceIngestionStatus.READY);
    }

    private AssetEntity asset(UUID userId, UUID assetId, long size) {
        return new AssetEntity(assetId, userId, "objects/" + assetId, "document.pdf", size,
                "application/pdf", null, com.auralis.app.source.AssetUploadStatus.READY);
    }
}
