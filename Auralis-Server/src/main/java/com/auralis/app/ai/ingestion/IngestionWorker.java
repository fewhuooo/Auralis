package com.auralis.app.ai.ingestion;

import com.auralis.app.ai.internal.persistence.IngestionJobEntity;
import com.auralis.app.shared.config.AuralisProperties;
import com.auralis.app.ai.AiProviderType;
import com.auralis.app.ai.AiSettingsService;
import com.auralis.app.ai.EmbeddingProviderPort;
import com.auralis.app.ai.EmbeddingResult;
import com.auralis.app.ai.internal.provider.EmbeddingProviderRegistry;
import com.auralis.app.shared.error.DomainException;
import com.auralis.app.source.SourceService;
import com.auralis.app.source.SourceView;
import com.auralis.app.source.ParsedDocumentReadView;
import com.auralis.app.source.ParsedDocumentService;
import com.auralis.app.source.SourceType;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
public class IngestionWorker {

    private final IngestionJobService jobService;
    private final IngestionCompletionService completionService;
    private final SourceService sourceService;
    private final List<SourceParser> parsers;
    private final AiSettingsService settingsService;
    private final EmbeddingProviderRegistry embeddingProviderRegistry;
    private final ParsedDocumentService parsedDocumentService;
    private final Clock clock;
    private final AuralisProperties properties;
    private final TextChunker chunker = new TextChunker(1200, 120);

    public IngestionWorker(
            IngestionJobService jobService,
            IngestionCompletionService completionService,
            SourceService sourceService,
            List<SourceParser> parsers,
            AiSettingsService settingsService,
            EmbeddingProviderRegistry embeddingProviderRegistry,
            ParsedDocumentService parsedDocumentService,
            Clock clock,
            AuralisProperties properties) {
        this.jobService = jobService;
        this.completionService = completionService;
        this.sourceService = sourceService;
        this.parsers = parsers;
        this.settingsService = settingsService;
        this.embeddingProviderRegistry = embeddingProviderRegistry;
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
        int maxAttempts = properties.ai().ingestionMaxAttempts();
        if (job.getAttemptCount() >= maxAttempts
                && (job.getLeaseUntil() == null || !job.getLeaseUntil().isAfter(now))) {
            completionService.failExhausted(job, clock.instant(), maxAttempts);
            return true;
        }
        processClaimed(job);
        return true;
    }

    public void process(UUID userId, UUID jobId) {
        Instant now = clock.instant();
        Optional<IngestionJobEntity> claimed = jobService.claimById(
                userId, jobId, now,
                now.plusMillis(properties.ai().ingestionLeaseMillis()),
                properties.ai().ingestionMaxAttempts());
        if (claimed.isEmpty()) {
            return;
        }
        IngestionJobEntity job = claimed.get();
        int maxAttempts = properties.ai().ingestionMaxAttempts();
        if (job.getAttemptCount() >= maxAttempts
                && (job.getLeaseUntil() == null || !job.getLeaseUntil().isAfter(now))) {
            completionService.failExhausted(job, clock.instant(), maxAttempts);
            return;
        }
        processClaimed(job);
    }

    private void processClaimed(IngestionJobEntity job) {
        UUID userId = job.getUserId();
        IngestionClaim claim = IngestionClaim.from(job);
        UUID sourceRevision = job.getIngestionRevision();
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
                SourceView current = sourceService.requireActiveSource(userId, job.getSourceId());
                if (sourceRevision == null) {
                    sourceRevision = current.ingestionRevision();
                }
                if (!Objects.equals(current.ingestionRevision(), sourceRevision)) {
                    throw new DomainException(
                            "INGESTION_REVISION_STALE", "Source revision changed before parsing started");
                }
                Optional<SourceView> parsing = sourceService.markParsingIfRevision(
                        userId, job.getSourceId(), sourceRevision);
                if (parsing.isEmpty()) {
                    throw new DomainException(
                            "INGESTION_REVISION_STALE", "Source revision changed before parsing started");
                }
                source = parsing.get();
                SourceParser parser = parsers.stream()
                        .filter(candidate -> candidate.supports(source.type()))
                        .findFirst()
                        .orElseThrow(() -> new IllegalArgumentException("No parser for source type"));
                text = parser.parse(userId, source);
            }
            if (text == null || text.isBlank()) {
                throw new IllegalArgumentException("Parsed source is empty");
            }
            if (!sourceService.markIndexingIfRevision(userId, source.id(), sourceRevision)) {
                throw new DomainException("INGESTION_REVISION_STALE", "Source revision changed during parsing");
            }
            List<com.auralis.app.ai.ingestion.TextChunk> chunks = chunker.chunk(text);
            AiSettingsService.ResolvedSettings settings = settingsService.resolveServerManagedEmbedding();
            EmbeddingProviderPort embeddingProvider = embeddingProviderRegistry.require(AiProviderType.SILICONFLOW);
            EmbeddingResult embeddings = embeddingProvider.embed(
                    chunks.stream().map(com.auralis.app.ai.ingestion.TextChunk::content).toList(),
                    settings.credential());
            completionService.complete(
                    claim, sourceRevision, chunks, embeddings.vectors(), clock.instant());
        } catch (DomainException exception) {
            completionService.fail(
                    claim, sourceRevision, clock.instant(), properties.ai().ingestionMaxAttempts(),
                    exception.code(), safeDetail(exception.getMessage()));
        } catch (Exception exception) {
            completionService.fail(
                    claim, sourceRevision, clock.instant(), properties.ai().ingestionMaxAttempts(),
                    "INGESTION_FAILED", safeDetail(exception.getMessage()));
        }
    }

    private String safeDetail(String detail) {
        if (detail == null || detail.isBlank()) {
            return "Source ingestion failed";
        }
        return detail.length() > 500 ? detail.substring(0, 500) : detail;
    }
}
