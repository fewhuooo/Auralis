package com.auralis.app;

import com.auralis.app.source.AssetStoragePort;
import com.auralis.app.source.ParsedDocumentCleanupService;
import com.auralis.app.source.ParsedDocumentStatus;
import com.auralis.app.source.internal.persistence.ParsedDocumentEntity;
import com.auralis.app.source.internal.persistence.ParsedDocumentRepository;
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
        ParsedDocumentCleanupService cleanup = new ParsedDocumentCleanupService(repository, storage, clock, 24, 30);
        ParsedDocumentEntity uploading = document(ParsedDocumentStatus.UPLOADING, "upload-key");
        ParsedDocumentEntity superseded = document(ParsedDocumentStatus.SUPERSEDED, "old-key");
        when(repository.findAllByStatusInAndUpdatedAtBefore(anyList(), any(Instant.class)))
                .thenReturn(List.of(uploading), List.of(superseded));

        assertThat(cleanup.purgeExpired(clock.instant())).isEqualTo(2);

        verify(storage).deleteObject("upload-key");
        verify(storage).deleteObject("old-key");
        verify(repository).save(uploading);
        verify(repository).save(superseded);
    }

    @Test
    void doesNotDeleteAnObjectTwice() {
        ParsedDocumentRepository repository = mock(ParsedDocumentRepository.class);
        AssetStoragePort storage = mock(AssetStoragePort.class);
        ParsedDocumentEntity alreadyDeleted = document(ParsedDocumentStatus.REJECTED, "deleted-key");
        alreadyDeleted.markObjectDeleted();
        when(repository.findAllByStatusInAndUpdatedAtBefore(anyList(), any(Instant.class)))
                .thenReturn(List.of(alreadyDeleted), List.of());

        ParsedDocumentCleanupService cleanup = new ParsedDocumentCleanupService(
                repository, storage, Clock.systemUTC(), 24, 30);
        assertThat(cleanup.purgeExpired(Instant.now())).isZero();
        verify(storage, never()).deleteObject("deleted-key");
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
        return entity;
    }
}
