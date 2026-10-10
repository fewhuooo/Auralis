package com.auralis.app;

import com.auralis.app.source.AssetRetentionCleanupService;
import com.auralis.app.source.AssetStoragePort;
import com.auralis.app.source.AssetUploadStatus;
import com.auralis.app.shared.error.DomainException;
import com.auralis.app.source.SourceCommand;
import com.auralis.app.source.SourceIngestionStatus;
import com.auralis.app.source.SourceService;
import com.auralis.app.source.SourceType;
import com.auralis.app.source.SourceView;
import com.auralis.app.source.internal.persistence.AssetEntity;
import com.auralis.app.source.internal.persistence.AssetRepository;
import com.auralis.app.source.internal.persistence.SourceEntity;
import com.auralis.app.source.internal.persistence.SourceRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Consumer;

import static org.assertj.core.api.Assertions.assertThat;

/** PostgreSQL row-lock evidence for Source restore versus Asset retention cleanup. */
@SpringBootTest(
        classes = AuralisApplication.class,
        properties = {
                "auralis.upload.asset-cleanup-delay-millis=3600000",
                "auralis.upload.asset-cleanup-initial-delay-millis=3600000",
                "spring.datasource.hikari.connection-init-sql=SET lock_timeout TO '10000ms'"
        })
@ActiveProfiles("postgres-it")
@Testcontainers
@Import(AssetRetentionConcurrencyIntegrationTests.StorageConfiguration.class)
class AssetRetentionConcurrencyIntegrationTests {

    private static final String POSTGRES_IMAGE = "pgvector/pgvector:0.8.6-pg17-bookworm";

    @Container
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>(
            DockerImageName.parse(POSTGRES_IMAGE).asCompatibleSubstituteFor("postgres"));

    @DynamicPropertySource
    static void databaseProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
    }

    @Autowired private JdbcTemplate jdbcTemplate;
    @Autowired private PlatformTransactionManager transactionManager;
    @Autowired private SourceService sourceService;
    @Autowired private SourceRepository sourceRepository;
    @Autowired private AssetRepository assetRepository;
    @Autowired private AssetRetentionCleanupService cleanupService;
    @Autowired private ControlledAssetStorage storage;

    @BeforeEach
    void clearStorage() {
        storage.clear();
    }

    @org.junit.jupiter.api.AfterEach
    void moveDeletedFixturesOutsideRetentionScans() {
        jdbcTemplate.update(
                "update sources set deleted_at = ? where deleted_at is not null "
                        + "and user_id in (select id from users where username like 'asset-retention-%')",
                OffsetDateTime.now(ZoneOffset.UTC).plusYears(1));
    }

    @Test
    void restoreThatHoldsAssetRowLockCommitsBeforeCleanupCanDeleteItsObject() throws Exception {
        Fixture fixture = createDeletedFileSource();
        storage.blockNextDelete();
        DeleteGate deleteGate = storage.nextDeleteGate();

        CountDownLatch restoreHasChangedSource = new CountDownLatch(1);
        CountDownLatch allowRestoreCommit = new CountDownLatch(1);
        AtomicReference<Integer> restoreBackendPid = new AtomicReference<>();
        ExecutorService executor = Executors.newFixedThreadPool(2);
        Future<SourceView> restore = null;
        Future<Long> cleanup = null;
        try {
            TransactionTemplate writerTransaction = new TransactionTemplate(transactionManager);
            restore = executor.submit(() -> writerTransaction.execute(status -> {
                restoreBackendPid.set(jdbcTemplate.queryForObject("select pg_backend_pid()", Integer.class));
                SourceView result = sourceService.restore(fixture.userId(), fixture.sourceId(), 0);
                restoreHasChangedSource.countDown();
                await(allowRestoreCommit, "restore transaction release");
                return result;
            }));

            assertThat(restoreHasChangedSource.await(5, TimeUnit.SECONDS))
                    .as("restore must finish its writes while keeping the PostgreSQL transaction open")
                    .isTrue();
            cleanup = executor.submit(() -> cleanupService.purgeExpired(Instant.now().plusSeconds(60)));

            CleanupInterleaving interleaving = awaitCleanupInterleaving(
                    restoreBackendPid.get(), deleteGate, cleanup);

            if (interleaving == CleanupInterleaving.DELETION_STARTED) {
                // This is the pre-fix path: cleanup passed the reference check and entered MinIO
                // while the restored Source is still uncommitted. Finish that exact interleaving.
                allowRestoreCommit.countDown();
                restore.get(5, TimeUnit.SECONDS);
                storage.releaseBlockedDelete();
                cleanup.get(5, TimeUnit.SECONDS);
            } else if (interleaving == CleanupInterleaving.WAITING_ON_RESTORE_LOCK) {
                allowRestoreCommit.countDown();
                restore.get(5, TimeUnit.SECONDS);
                assertThat(cleanup.get(5, TimeUnit.SECONDS)).isZero();
            } else {
                allowRestoreCommit.countDown();
                restore.get(5, TimeUnit.SECONDS);
                throw new AssertionError("cleanup finished without waiting on the Asset lock or reaching storage");
            }

            assertThat(sourceRepository.findByIdAndUserIdAndDeletedAtIsNull(
                    fixture.sourceId(), fixture.userId()))
                    .as("the restore must commit as an active Source")
                    .isPresent();
            assertThat(storage.contains(fixture.objectKey()))
                    .as("an active restored FILE Source must keep its object")
                    .isTrue();
            assertThat(assetRepository.findByIdAndUserId(fixture.assetId(), fixture.userId()))
                    .get()
                    .extracting(AssetEntity::getUploadStatus)
                    .isEqualTo(AssetUploadStatus.READY);
        } finally {
            allowRestoreCommit.countDown();
            storage.releaseBlockedDelete();
            if (restore != null && !restore.isDone()) {
                restore.cancel(true);
            }
            if (cleanup != null && !cleanup.isDone()) {
                cleanup.cancel(true);
            }
            executor.shutdownNow();
            assertThat(executor.awaitTermination(5, TimeUnit.SECONDS))
                    .as("concurrent database workers must terminate after releasing all gates")
                    .isTrue();
        }
    }

    @Test
    void durableCleanupClaimRejectsRestoreAndEveryNewFileReferenceBeforeDeleting() throws Exception {
        Fixture fixture = createDeletedFileSource();
        SourceEntity activeText = createActiveTextSource(fixture);
        storage.blockNextDelete();
        DeleteGate deleteGate = storage.nextDeleteGate();
        ExecutorService executor = Executors.newSingleThreadExecutor();
        Future<Long> cleanup = null;
        try {
            cleanup = executor.submit(() -> cleanupService.purgeExpired(Instant.now().plusSeconds(60)));
            assertThat(deleteGate.entered().await(5, TimeUnit.SECONDS))
                    .as("cleanup reaches object deletion after its durable Asset claim")
                    .isTrue();

            assertThat(assetRepository.findByIdAndUserId(fixture.assetId(), fixture.userId()))
                    .get()
                    .extracting(AssetEntity::getUploadStatus)
                    .isEqualTo(AssetUploadStatus.ORPHANED);
            assertMutationRejected(() -> sourceService.restore(fixture.userId(), fixture.sourceId(), 0));
            assertMutationRejected(() -> sourceService.create(fixture.userId(), new SourceCommand(
                    fixture.subjectId(), SourceType.FILE, "New reference", fixture.assetId(), null, null, null)));
            assertMutationRejected(() -> sourceService.update(fixture.userId(), activeText.getId(), 0,
                    new SourceCommand(
                            fixture.subjectId(), SourceType.FILE, "Updated reference", fixture.assetId(),
                            null, null, null)));
        } finally {
            storage.releaseBlockedDelete();
            if (cleanup != null) {
                cleanup.get(5, TimeUnit.SECONDS);
            }
            executor.shutdownNow();
            assertThat(executor.awaitTermination(5, TimeUnit.SECONDS)).isTrue();
        }

        assertThat(storage.contains(fixture.objectKey())).isFalse();
        assertThat(sourceRepository.findByIdAndUserIdAndDeletedAtIsNull(fixture.sourceId(), fixture.userId()))
                .isEmpty();
        assertThat(sourceRepository.findByIdAndUserIdAndDeletedAtIsNull(activeText.getId(), fixture.userId()))
                .isPresent();
    }

    @Test
    void activeOrRecentDeletedSourceSharingAssetPreventsRetention() {
        Fixture fixture = createDeletedFileSource();
        Instant retentionCutoff = Instant.now().minusSeconds(30L * 24 * 60 * 60);
        expireSource(fixture.sourceId());
        SourceEntity sharingSource = source(
                UUID.randomUUID(), fixture.userId(), SourceType.FILE, fixture.subjectId(),
                "Shared reference", fixture.assetId(), null);
        sourceRepository.saveAndFlush(sharingSource);

        assertThat(cleanupService.purgeExpired(retentionCutoff)).isZero();
        assertThat(storage.contains(fixture.objectKey())).isTrue();

        sharingSource.softDelete();
        sourceRepository.saveAndFlush(sharingSource);
        assertThat(cleanupService.purgeExpired(retentionCutoff)).isZero();
        assertThat(storage.contains(fixture.objectKey())).isTrue();
        assertThat(assetRepository.findByIdAndUserId(fixture.assetId(), fixture.userId()))
                .get()
                .extracting(AssetEntity::getUploadStatus)
                .isEqualTo(AssetUploadStatus.READY);
    }

    @Test
    void retentionKeepsOwnerAssetWhenOnlyForeignOwnerOrNonFileSourcesAreCandidates() {
        OwnerSubject assetOwner = createOwnerSubject();
        UUID assetId = UUID.randomUUID();
        String objectKey = "users/" + assetOwner.userId() + "/assets/" + assetId;
        assetRepository.saveAndFlush(new AssetEntity(
                assetId, assetOwner.userId(), objectKey, "fixture.pdf", 16,
                "application/pdf", null, AssetUploadStatus.READY));
        storage.put(objectKey);

        OwnerSubject sourceOwner = createOwnerSubject();
        SourceEntity foreignFile = source(
                UUID.randomUUID(), sourceOwner.userId(), SourceType.FILE, sourceOwner.subjectId(),
                "Foreign reference", assetId, null);
        foreignFile.softDelete();
        sourceRepository.saveAndFlush(foreignFile);
        SourceEntity deletedText = source(
                UUID.randomUUID(), sourceOwner.userId(), SourceType.TEXT, sourceOwner.subjectId(),
                "Text source", null, "raw text");
        deletedText.softDelete();
        sourceRepository.saveAndFlush(deletedText);
        SourceEntity deletedUrl = source(
                UUID.randomUUID(), sourceOwner.userId(), SourceType.URL, sourceOwner.subjectId(),
                "URL source", null, "https://example.test/resource");
        deletedUrl.softDelete();
        sourceRepository.saveAndFlush(deletedUrl);

        assertThat(cleanupService.purgeExpired(Instant.now().plusSeconds(60))).isZero();
        assertThat(storage.contains(objectKey)).isTrue();
        assertThat(assetRepository.findByIdAndUserId(assetId, assetOwner.userId()))
                .get()
                .extracting(AssetEntity::getUploadStatus)
                .isEqualTo(AssetUploadStatus.READY);
    }

    @Test
    void scheduledCleanupPersistsOrphanedBeforeDeleteAndRetriesFailedObjectRemoval() {
        Fixture fixture = createDeletedFileSource();
        expireSource(fixture.sourceId());
        AtomicReference<AssetUploadStatus> statusAtDelete = new AtomicReference<>();
        storage.observeNextDelete(key -> statusAtDelete.set(assetRepository
                .findByIdAndUserId(fixture.assetId(), fixture.userId())
                .orElseThrow()
                .getUploadStatus()));
        storage.failNextDelete();

        cleanupService.scheduledPurgeExpired();

        assertThat(statusAtDelete.get()).isEqualTo(AssetUploadStatus.ORPHANED);
        assertThat(assetRepository.findByIdAndUserId(fixture.assetId(), fixture.userId()))
                .get()
                .extracting(AssetEntity::getUploadStatus)
                .isEqualTo(AssetUploadStatus.ORPHANED);
        assertThat(storage.contains(fixture.objectKey())).isTrue();
        assertThat(storage.deleteAttempts()).isEqualTo(1);

        cleanupService.scheduledPurgeExpired();

        assertThat(storage.deleteAttempts()).isEqualTo(2);
        assertThat(storage.contains(fixture.objectKey())).isFalse();
        assertThat(assetRepository.findByIdAndUserId(fixture.assetId(), fixture.userId()))
                .get()
                .extracting(AssetEntity::getUploadStatus)
                .isEqualTo(AssetUploadStatus.ORPHANED);
    }

    private CleanupInterleaving awaitCleanupInterleaving(
            Integer restoreBackendPid,
            DeleteGate deleteGate,
            Future<Long> cleanup) throws Exception {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(8);
        while (System.nanoTime() < deadline) {
            if (deleteGate.entered().getCount() == 0) {
                return CleanupInterleaving.DELETION_STARTED;
            }
            String blockedQuery = blockedAssetQueryBy(restoreBackendPid);
            if (!blockedQuery.isBlank()) {
                System.out.println("ASSET_LOCK_WAIT_EVIDENCE " + blockedQuery);
                return CleanupInterleaving.WAITING_ON_RESTORE_LOCK;
            }
            if (cleanup.isDone()) {
                cleanup.get(1, TimeUnit.SECONDS);
                return CleanupInterleaving.FINISHED_WITHOUT_INTERLEAVING;
            }
            TimeUnit.MILLISECONDS.sleep(10);
        }
        throw new AssertionError("cleanup neither waited on the writer row lock nor reached storage within 8 seconds");
    }

    private String blockedAssetQueryBy(Integer blockingBackendPid) {
        return jdbcTemplate.queryForObject("""
                select coalesce((
                    select format('pid=%s query=%s', waiting.pid, waiting.query)
                    from pg_stat_activity waiting
                    where waiting.datname = current_database()
                      and waiting.wait_event_type = 'Lock'
                      and waiting.query ilike '%from assets%'
                      and waiting.query ilike '%for%'
                      and ? = any(pg_blocking_pids(waiting.pid))
                    limit 1
                )::text, '')
                """, String.class, blockingBackendPid);
    }

    private Fixture createDeletedFileSource() {
        OwnerSubject owner = createOwnerSubject();
        UUID assetId = UUID.randomUUID();
        UUID sourceId = UUID.randomUUID();
        String objectKey = "users/" + owner.userId() + "/assets/" + assetId;
        assetRepository.saveAndFlush(new AssetEntity(
                assetId, owner.userId(), objectKey, "fixture.pdf", 16,
                "application/pdf", null, AssetUploadStatus.READY));
        SourceEntity source = new SourceEntity(
                sourceId, owner.userId(), SourceType.FILE, owner.subjectId(), "Fixture", assetId,
                null, null, null, SourceIngestionStatus.AWAITING_CLIENT);
        source.softDelete();
        sourceRepository.saveAndFlush(source);
        storage.put(objectKey);
        return new Fixture(owner.userId(), owner.subjectId(), assetId, sourceId, objectKey);
    }

    private OwnerSubject createOwnerSubject() {
        UUID userId = UUID.randomUUID();
        UUID subjectId = UUID.randomUUID();
        String username = "asset-retention-" + userId;
        jdbcTemplate.update(
                "insert into users (id, username, normalized_username, password_hash, status) "
                        + "values (?, ?, ?, ?, 'ACTIVE')",
                userId, username, username.toUpperCase(), "integration-test");
        jdbcTemplate.update(
                "insert into subjects (id, user_id, name, sort_key, is_default) values (?, ?, ?, '', false)",
                subjectId, userId, "Asset retention fixture");
        return new OwnerSubject(userId, subjectId);
    }

    private SourceEntity createActiveTextSource(Fixture fixture) {
        SourceEntity source = source(
                UUID.randomUUID(), fixture.userId(), SourceType.TEXT, fixture.subjectId(),
                "Active text", null, "raw text");
        return sourceRepository.saveAndFlush(source);
    }

    private SourceEntity source(
            UUID id, UUID userId, SourceType type, UUID subjectId, String title, UUID assetId, String rawText) {
        return new SourceEntity(
                id, userId, type, subjectId, title, assetId, null, rawText, null,
                type == SourceType.FILE ? SourceIngestionStatus.AWAITING_CLIENT : SourceIngestionStatus.PENDING);
    }

    private void expireSource(UUID sourceId) {
        jdbcTemplate.update("update sources set deleted_at = ? where id = ?",
                OffsetDateTime.ofInstant(
                        Instant.now().minusSeconds(31L * 24 * 60 * 60), ZoneOffset.UTC),
                sourceId);
    }

    private void assertMutationRejected(Runnable action) {
        org.assertj.core.api.Assertions.assertThatThrownBy(action::run)
                .isInstanceOf(DomainException.class)
                .extracting(error -> ((DomainException) error).code())
                .isEqualTo("MUTATION_REJECTED");
    }

    private void await(CountDownLatch latch, String description) {
        try {
            if (!latch.await(8, TimeUnit.SECONDS)) {
                throw new AssertionError("timed out waiting for " + description);
            }
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            throw new AssertionError("interrupted while waiting for " + description, interrupted);
        }
    }

    private enum CleanupInterleaving {
        DELETION_STARTED,
        WAITING_ON_RESTORE_LOCK,
        FINISHED_WITHOUT_INTERLEAVING
    }

    private record Fixture(UUID userId, UUID subjectId, UUID assetId, UUID sourceId, String objectKey) {
    }

    private record OwnerSubject(UUID userId, UUID subjectId) {
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class StorageConfiguration {
        @Bean
        @Primary
        ControlledAssetStorage controlledAssetStorage() {
            return new ControlledAssetStorage();
        }
    }

    static class ControlledAssetStorage implements AssetStoragePort {
        private final Map<String, Boolean> objects = new java.util.concurrent.ConcurrentHashMap<>();
        private final AtomicReference<DeleteGate> nextGate = new AtomicReference<>();
        private final AtomicReference<DeleteGate> activeGate = new AtomicReference<>();
        private final AtomicReference<Consumer<String>> beforeNextDelete = new AtomicReference<>();
        private final AtomicInteger deleteAttempts = new AtomicInteger();
        private final AtomicInteger failuresRemaining = new AtomicInteger();

        @Override
        public UploadIntent createUploadIntent(String objectKey, String mimeType, long sizeBytes, String sha256) {
            return new UploadIntent("https://storage.test/" + objectKey, Map.of(), Instant.now().plusSeconds(60));
        }

        @Override
        public Optional<ObjectMetadata> headObject(String objectKey) {
            return contains(objectKey)
                    ? Optional.of(new ObjectMetadata(16, "application/pdf", null))
                    : Optional.empty();
        }

        @Override
        public DownloadUrl createDownloadUrl(String objectKey) {
            return new DownloadUrl("https://storage.test/" + objectKey, Instant.now().plusSeconds(60));
        }

        @Override
        public InputStream openObject(String objectKey) {
            return new ByteArrayInputStream(new byte[0]);
        }

        @Override
        public void deleteObject(String objectKey) {
            deleteAttempts.incrementAndGet();
            Consumer<String> observer = beforeNextDelete.getAndSet(null);
            if (observer != null) {
                observer.accept(objectKey);
            }
            DeleteGate gate = nextGate.getAndSet(null);
            if (gate != null) {
                activeGate.set(gate);
                gate.entered().countDown();
                try {
                    awaitRelease(gate);
                } finally {
                    activeGate.compareAndSet(gate, null);
                }
            }
            if (failuresRemaining.getAndUpdate(remaining -> Math.max(0, remaining - 1)) > 0) {
                throw new IllegalStateException("controlled object deletion failure");
            }
            objects.remove(objectKey);
        }

        void put(String objectKey) {
            objects.put(objectKey, Boolean.TRUE);
        }

        boolean contains(String objectKey) {
            return objects.containsKey(objectKey);
        }

        void blockNextDelete() {
            nextGate.set(new DeleteGate(new CountDownLatch(1), new CountDownLatch(1)));
        }

        void observeNextDelete(Consumer<String> observer) {
            beforeNextDelete.set(observer);
        }

        void failNextDelete() {
            failuresRemaining.incrementAndGet();
        }

        int deleteAttempts() {
            return deleteAttempts.get();
        }

        DeleteGate nextDeleteGate() {
            return nextGate.get();
        }

        void releaseBlockedDelete() {
            release(nextGate.getAndSet(null));
            release(activeGate.getAndSet(null));
        }

        private void release(DeleteGate gate) {
            if (gate != null) {
                gate.release().countDown();
            }
        }

        void clear() {
            objects.clear();
            releaseBlockedDelete();
            beforeNextDelete.set(null);
            deleteAttempts.set(0);
            failuresRemaining.set(0);
        }

        private void awaitRelease(DeleteGate gate) {
            try {
                if (!gate.release().await(8, TimeUnit.SECONDS)) {
                    throw new IllegalStateException("test did not release the controlled object deletion");
                }
            } catch (InterruptedException interrupted) {
                Thread.currentThread().interrupt();
                throw new IllegalStateException("controlled object deletion was interrupted", interrupted);
            }
        }
    }

    private record DeleteGate(CountDownLatch entered, CountDownLatch release) {
    }
}
