package com.auralis.app.source;

import com.auralis.app.source.internal.persistence.AssetEntity;
import com.auralis.app.source.internal.persistence.AssetRepository;
import com.auralis.app.source.internal.persistence.SourceEntity;
import com.auralis.app.source.internal.persistence.SourceRepository;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;

/**
 * Removes binary objects after the Source soft-delete recovery window.
 * Database rows remain auditable because sources and assets are referenced by
 * knowledge blocks and the relational schema intentionally uses RESTRICT FKs.
 */
@Service
public class AssetRetentionCleanupService {

    private static final Logger log = LoggerFactory.getLogger(AssetRetentionCleanupService.class);
    private static final long DEFAULT_RETENTION_DAYS = 30L;

    private final SourceRepository sourceRepository;
    private final AssetRepository assetRepository;
    private final AssetStoragePort assetStorage;
    private final Clock clock;
    private final TransactionTemplate assetTransactionTemplate;
    private final long retentionDays;
    private final Counter purgedObjects;
    private final Counter cleanupFailures;

    public AssetRetentionCleanupService(
            SourceRepository sourceRepository,
            AssetRepository assetRepository,
            AssetStoragePort assetStorage,
            Clock clock,
            MeterRegistry meterRegistry,
            PlatformTransactionManager transactionManager,
            @Value("${auralis.upload.asset-retention-days:30}") long retentionDays) {
        this.sourceRepository = sourceRepository;
        this.assetRepository = assetRepository;
        this.assetStorage = assetStorage;
        this.clock = clock;
        this.assetTransactionTemplate = new TransactionTemplate(transactionManager);
        this.assetTransactionTemplate.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        this.retentionDays = retentionDays > 0 ? retentionDays : DEFAULT_RETENTION_DAYS;
        this.purgedObjects = Counter.builder("auralis.asset.retention.purged_objects")
                .description("MinIO objects removed after Source retention")
                .register(meterRegistry);
        this.cleanupFailures = Counter.builder("auralis.asset.retention.cleanup_failures")
                .description("Asset retention cleanup failures")
                .register(meterRegistry);
    }

    public long purgeExpired(Instant cutoff) {
        long purged = 0;
        Set<OwnerAssetKey> processedAssets = new HashSet<>();
        for (SourceEntity source : sourceRepository.findAllByDeletedAtBefore(cutoff)) {
            if (source.getAssetId() == null
                    || !processedAssets.add(new OwnerAssetKey(source.getUserId(), source.getAssetId()))) {
                continue;
            }
            try {
                String objectKey = claimAssetForDeletion(source, cutoff);
                if (objectKey != null) {
                    assetStorage.deleteObject(objectKey);
                    purged++;
                    log.info("ASSET_RETENTION_PURGED sourceId={} assetId={} objectKey={}",
                            source.getId(), source.getAssetId(), objectKey);
                }
            } catch (RuntimeException exception) {
                cleanupFailures.increment();
                log.warn("ASSET_RETENTION_CLEANUP_FAILED sourceId={} assetId={} errorType={} message={}",
                        source.getId(), source.getAssetId(), exception.getClass().getSimpleName(), exception.getMessage());
            }
        }
        purgedObjects.increment(purged);
        return purged;
    }

    @Scheduled(
            fixedDelayString = "${auralis.upload.asset-cleanup-delay-millis:3600000}",
            initialDelayString = "${auralis.upload.asset-cleanup-initial-delay-millis:60000}")
    public void scheduledPurgeExpired() {
        purgeExpired(clock.instant().minus(Duration.ofDays(retentionDays)));
    }

    private String claimAssetForDeletion(SourceEntity source, Instant cutoff) {
        return assetTransactionTemplate.execute(status -> {
            AssetEntity asset = assetRepository.findForUpdateByIdAndUserId(
                    source.getAssetId(), source.getUserId()).orElse(null);
            if (asset == null
                    || sourceRepository.existsByAssetIdAndDeletedAtIsNull(asset.getId())
                    || sourceRepository.existsByAssetIdAndDeletedAtAfter(asset.getId(), cutoff)) {
                return null;
            }

            if (asset.getUploadStatus() != AssetUploadStatus.ORPHANED) {
                asset.markOrphaned();
                assetRepository.saveAndFlush(asset);
            }
            return asset.getObjectKey();
        });
    }

    private record OwnerAssetKey(UUID userId, UUID assetId) {
    }
}
