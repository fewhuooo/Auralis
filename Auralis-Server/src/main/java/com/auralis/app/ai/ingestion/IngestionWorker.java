package com.auralis.app.ai.ingestion;

import com.auralis.app.ai.internal.persistence.IngestionJobEntity;
import com.auralis.app.ai.internal.persistence.IngestionJobRepository;
import com.auralis.app.shared.config.AuralisProperties;
import com.auralis.app.ai.AiProviderType;
import com.auralis.app.ai.AiSettingsService;
import com.auralis.app.ai.EmbeddingProviderPort;
import com.auralis.app.ai.EmbeddingResult;
import com.auralis.app.ai.internal.provider.EmbeddingProviderRegistry;
import com.auralis.app.ai.retrieval.SourceChunkService;
import com.auralis.app.shared.error.DomainException;
import com.auralis.app.source.SourceService;
import com.auralis.app.source.SourceView;
import com.auralis.app.source.ParsedDocumentReadView;
import com.auralis.app.source.ParsedDocumentService;
import com.auralis.app.source.SourceType;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
public class IngestionWorker {

    private final IngestionJobRepository jobRepository;
    private final IngestionJobService jobService;
    private final SourceService sourceService;
    private final List<SourceParser> parsers;
    private final AiSettingsService settingsService;
    private final EmbeddingProviderRegistry embeddingProviderRegistry;
    private final SourceChunkService chunkService;
    private final ParsedDocumentService parsedDocumentService;
    private final Clock clock;
    private final AuralisProperties properties;
    private final TextChunker chunker = new TextChunker(1200, 120);

    public IngestionWorker(
            IngestionJobRepository jobRepository,
            IngestionJobService jobService,
            SourceService sourceService,
            List<SourceParser> parsers,
            AiSettingsService settingsService,
            EmbeddingProviderRegistry embeddingProviderRegistry,
            SourceChunkService chunkService,
            ParsedDocumentService parsedDocumentService,
            Clock clock,
            AuralisProperties properties) {
        this.jobRepository = jobRepository;
        this.jobService = jobService;
        this.sourceService = sourceService;
        this.parsers = parsers;
        this.settingsService = settingsService;
        this.embeddingProviderRegistry = embeddingProviderRegistry;
        this.chunkService = chunkService;
        this.parsedDocumentService = parsedDocumentService;
        this.clock = clock;
        this.properties = properties;
    }

    public boolean processNext() {
        Instant now = clock.instant();
        Optional<IngestionJobEntity> claimed = jobService.claimNext(
                now,
                now.plusMillis(properties.ai().ingestionLeaseMillis()),
                properties.ai().ingestionMaxAttempts());
        if (claimed.isEmpty()) {
            return false;
        }
        IngestionJobEntity job = claimed.get();
        if (job.getStatus() == com.auralis.app.ai.IngestionJobStatus.FAILED) {
            try {
                sourceService.markFailed(
                        job.getUserId(), job.getSourceId(), job.getErrorCode(), job.getErrorDetail());
            } catch (DomainException ignored) {
                // The source may have been deleted after the job was selected.
            }
            return true;
        }
        processClaimed(job);
        return true;
    }

    @Transactional
    public void process(UUID userId, UUID jobId) {
        IngestionJobEntity job = jobRepository.findByIdAndUserId(jobId, userId)
                .orElseThrow(() -> new DomainException("RESOURCE_NOT_FOUND", "Ingestion job was not found"));
        if (!job.isActive()) {
            return;
        }
        Instant now = clock.instant();
        job.claim(now, now.plusMillis(properties.ai().ingestionLeaseMillis()));
        jobRepository.saveAndFlush(job);
        processClaimed(job);
    }

    private void processClaimed(IngestionJobEntity job) {
        UUID userId = job.getUserId();
        try {
            SourceView source;
            String text;
            if (job.getParsedDocumentId() != null) {
                source = sourceService.requireActiveSource(userId, job.getSourceId());
                if (source.type() != SourceType.FILE
                        || !Objects.equals(source.ingestionRevision(), job.getIngestionRevision())) {
                    throw new DomainException("INGESTION_REVISION_STALE", "Parsed document job revision is no longer current");
                }
                ParsedDocumentReadView parsed = parsedDocumentService.readAccepted(
                        userId, job.getSourceId(), job.getParsedDocumentId());
                if (!Objects.equals(parsed.generation(), job.getGeneration())) {
                    throw new DomainException("INGESTION_REVISION_STALE", "Parsed document generation is no longer current");
                }
                text = parsed.blocks().stream()
                        .map(com.auralis.app.source.ParsedDocumentValidator.ValidatedBlock::text)
                        .collect(Collectors.joining("\n"));
            } else {
                source = sourceService.markParsing(userId, job.getSourceId());
                SourceParser parser = parsers.stream()
                        .filter(candidate -> candidate.supports(source.type()))
                        .findFirst()
                        .orElseThrow(() -> new IllegalArgumentException("No parser for source type"));
                text = parser.parse(userId, source);
            }
            if (text == null || text.isBlank()) {
                throw new IllegalArgumentException("Parsed source is empty");
            }
            sourceService.markIndexing(userId, source.id());
            List<com.auralis.app.ai.ingestion.TextChunk> chunks = chunker.chunk(text);
            AiSettingsService.ResolvedSettings settings = settingsService.resolve(userId, AiProviderType.SILICONFLOW);
            EmbeddingProviderPort embeddingProvider = embeddingProviderRegistry.require(AiProviderType.SILICONFLOW);
            EmbeddingResult embeddings = embeddingProvider.embed(
                    chunks.stream().map(com.auralis.app.ai.ingestion.TextChunk::content).toList(),
                    settings.credential());
            chunkService.replace(userId, source.id(), job.getGeneration(), chunks, embeddings.vectors());
            sourceService.markReady(userId, source.id());
            job.markReady(clock.instant());
        } catch (DomainException exception) {
            handleFailure(job, exception.code(), safeDetail(exception.getMessage()));
        } catch (Exception exception) {
            handleFailure(job, "INGESTION_FAILED", safeDetail(exception.getMessage()));
        }
        jobRepository.saveAndFlush(job);
    }

    private void handleFailure(IngestionJobEntity job, String errorCode, String errorDetail) {
        Instant now = clock.instant();
        if (job.getParsedDocumentId() != null && "INGESTION_REVISION_STALE".equals(errorCode)) {
            job.markFailed(now, errorCode, errorDetail);
            return;
        }
        boolean retryable = job.getAttemptCount() < properties.ai().ingestionMaxAttempts();
        try {
            if (retryable) {
                sourceService.markPending(job.getUserId(), job.getSourceId());
                job.markRetry(now, errorCode, errorDetail);
            } else {
                sourceService.markFailed(job.getUserId(), job.getSourceId(), errorCode, errorDetail);
                job.markFailed(now, errorCode, errorDetail);
            }
        } catch (DomainException exception) {
            job.markFailed(now, "INGESTION_FAILED", "Source ingestion state could not be updated");
        }
    }

    private String safeDetail(String detail) {
        if (detail == null || detail.isBlank()) {
            return "Source ingestion failed";
        }
        return detail.length() > 500 ? detail.substring(0, 500) : detail;
    }
}
