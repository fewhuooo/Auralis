package com.auralis.app;

import com.auralis.app.source.AssetStoragePort;
import com.auralis.app.source.ParsedDocumentCleanupService;
import com.auralis.app.source.ParsedDocumentStatus;
import com.auralis.app.source.internal.persistence.ParsedDocumentEntity;
import com.auralis.app.source.internal.persistence.ParsedDocumentRepository;
import com.auralis.app.source.internal.persistence.SourceRepository;
import com.auralis.app.source.internal.persistence.SourceEntity;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.SimpleTransactionStatus;
import org.springframework.test.util.ReflectionTestUtils;
import java.util.Optional;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ParsedDocumentCleanupTests {

    @Test
    void removesExpiredUploadAndSupersededObjectsButKeepsRows() {
        ParsedDocumentRepository repository = mock(ParsedDocumentRepository.class);
        AssetStoragePort storage = mock(AssetStoragePort.class);
        Clock clock = Clock.fixed(Instant.parse("2026-08-24T00:00:00Z"), ZoneOffset.UTC);
        ParsedDocumentCleanupService cleanup = cleanup(repository, storage, clock);
        ParsedDocumentEntity uploading = document(ParsedDocumentStatus.UPLOADING, "upload-key");
        ParsedDocumentEntity superseded = document(ParsedDocumentStatus.SUPERSEDED, "old-key");
        when(repository.findAllByStatusInAndUpdatedAtBefore(anyList(), any(Instant.class)))
                .thenReturn(List.of(uploading), List.of(superseded));
        when(repository.findByIdAndUserId(uploading.getId(), uploading.getUserId())).thenReturn(Optional.of(uploading));
        when(repository.findByIdAndUserId(superseded.getId(), superseded.getUserId())).thenReturn(Optional.of(superseded));

        assertThat(cleanup.purgeExpired(clock.instant())).isEqualTo(2);

        verify(storage).deleteObject("upload-key");
        verify(storage).deleteObject("old-key");
        verify(repository, org.mockito.Mockito.times(2)).saveAndFlush(uploading);
        verify(repository).saveAndFlush(superseded);
    }

    @Test
    void doesNotDeleteAnObjectTwice() {
        ParsedDocumentRepository repository = mock(ParsedDocumentRepository.class);
        AssetStoragePort storage = mock(AssetStoragePort.class);
        ParsedDocumentEntity alreadyDeleted = document(ParsedDocumentStatus.REJECTED, "deleted-key");
        alreadyDeleted.markObjectDeleted();
        when(repository.findByIdAndUserId(alreadyDeleted.getId(), alreadyDeleted.getUserId())).thenReturn(Optional.of(alreadyDeleted));
        when(repository.findAllByStatusInAndUpdatedAtBefore(anyList(), any(Instant.class)))
                .thenReturn(List.of(alreadyDeleted), List.of());

        ParsedDocumentCleanupService cleanup = cleanup(repository, storage, Clock.systemUTC());
        assertThat(cleanup.purgeExpired(Instant.now())).isZero();
        verify(storage, never()).deleteObject("deleted-key");
    }

    private ParsedDocumentCleanupService cleanup(ParsedDocumentRepository repository, AssetStoragePort storage, Clock clock) {
        SourceRepository sources = mock(SourceRepository.class);
        when(sources.findForUpdateByIdAndUserId(any(), any())).thenReturn(Optional.of(mock(SourceEntity.class)));
        PlatformTransactionManager manager = mock(PlatformTransactionManager.class);
        when(manager.getTransaction(any())).thenAnswer(invocation -> new SimpleTransactionStatus());
        return new ParsedDocumentCleanupService(repository, storage, clock, sources, manager, 24, 30);
    }

    private ParsedDocumentEntity document(ParsedDocumentStatus status, String key) {
        ParsedDocumentEntity entity = new ParsedDocumentEntity(
                UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(),
                1, "pdfjs", "1", "1", null, "a".repeat(64), "b".repeat(64), 10, key);
        if (status == ParsedDocumentStatus.SUPERSEDED) {
            entity.supersede();
        } else if (status == ParsedDocumentStatus.REJECTED) {
            entity.reject();
        }
        ReflectionTestUtils.setField(entity, "updatedAt", Instant.parse("2026-01-01T00:00:00Z"));
        return entity;
    }
}
