package com.auralis.app.ai.ingestion;

import com.auralis.app.ai.internal.persistence.IngestionJobEntity;
import com.auralis.app.shared.config.AuralisProperties;
import com.auralis.app.ai.AiProviderType;
import com.auralis.app.ai.AiSettingsService;
import com.auralis.app.ai.EmbeddingResult;
import com.auralis.app.ai.usage.AiFeature;
import com.auralis.app.ai.usage.AiInvocationGateway;
import com.auralis.app.ai.usage.AiStage;
import com.auralis.app.ai.usage.AiTaskContext;
import com.auralis.app.ai.usage.AiTaskScope;
import com.auralis.app.ai.usage.AiUsageLimitException;
import com.auralis.app.shared.error.DomainException;
import com.auralis.app.source.SourceService;
import com.auralis.app.source.SourceView;
import com.auralis.app.source.ParsedDocumentReadView;
import com.auralis.app.source.ParsedDocumentService;
import com.auralis.app.source.SourceType;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.Instant;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
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
    private final AiInvocationGateway invocationGateway;
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
            AiInvocationGateway invocationGateway,
            ParsedDocumentService parsedDocumentService,
            Clock clock,
            AuralisProperties properties) {
        this.jobService = jobService;
        this.completionService = completionService;
        this.sourceService = sourceService;
        this.parsers = parsers;
        this.settingsService = settingsService;
        this.invocationGateway = invocationGateway;
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
        if (job.getFailureCount() >= maxAttempts
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
        if (job.getFailureCount() >= maxAttempts
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
        AiTaskScope taskScope = null;
        try {
            taskScope = invocationGateway.beginTask(new AiTaskContext(userId, AiFeature.INGESTION,
                    claim.jobId() + ":" + claim.generation()));
            processClaimed(taskScope, job, claim, sourceRevision);
        } catch (AiUsageLimitException exception) {
            if (isDeterministicBudgetDenial(exception)) {
                completionService.fail(claim, sourceRevision, clock.instant(), 1,
                        exception.code(), safeDetail(exception.getMessage()));
            } else {
                completionService.defer(claim, sourceRevision, retryAt(exception), exception.code());
            }
        } catch (DomainException exception) {
            completionService.fail(
                    claim, sourceRevision, clock.instant(), properties.ai().ingestionMaxAttempts(),
                    exception.code(), safeDetail(exception.getMessage()));
        } catch (Exception exception) {
            completionService.fail(
                    claim, sourceRevision, clock.instant(), properties.ai().ingestionMaxAttempts(),
                    "INGESTION_FAILED", safeDetail(exception.getMessage()));
        } finally {
            if (taskScope != null) taskScope.close();
        }
    }

    private void processClaimed(
            AiTaskScope taskScope, IngestionJobEntity job, IngestionClaim claim, UUID sourceRevision) {
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
            java.util.Map<Integer, List<Double>> checkpoint = completionService.loadCheckpoint(
                    claim, sourceRevision, chunks);
            List<List<Double>> vectors = new ArrayList<>(java.util.Collections.nCopies(chunks.size(), null));
            for (int index = 0; index < chunks.size(); index++) {
                vectors.set(index, checkpoint.get(chunks.get(index).ordinal()));
            }
            AiSettingsService.ResolvedSettings settings = null;
            for (List<com.auralis.app.ai.ingestion.TextChunk> batch : embeddingBatches(chunks)) {
                if (!renewClaim(claim)) return;
                List<com.auralis.app.ai.ingestion.TextChunk> missing = batch.stream()
                        .filter(chunk -> !checkpoint.containsKey(chunk.ordinal())).toList();
                if (missing.isEmpty()) continue;
                if (settings == null) settings = settingsService.resolveServerManagedEmbedding();
                EmbeddingResult batchEmbeddings = taskScope.embed(AiStage.INGESTION_EMBEDDING,
                        AiProviderType.SILICONFLOW, settings.credential().model(),
                        missing.stream().map(com.auralis.app.ai.ingestion.TextChunk::content).toList(),
                        settings.credential()).value();
                if (batchEmbeddings == null || batchEmbeddings.vectors().size() != missing.size()) {
                    throw new DomainException("MODEL_PROVIDER_ERROR", "Embedding provider returned an invalid vector count");
                }
                for (int index = 0; index < missing.size(); index++) {
                    vectors.set(missing.get(index).ordinal(), batchEmbeddings.vectors().get(index));
                }
                if (!completionService.stageCheckpoint(claim, sourceRevision, missing, batchEmbeddings.vectors())) {
                    return;
                }
                if (!renewClaim(claim)) return;
            }
            if (vectors.stream().anyMatch(Objects::isNull)) {
                throw new DomainException("INGESTION_FAILED", "Embedding checkpoint is incomplete");
            }
            completionService.complete(
                    claim, sourceRevision, chunks, vectors, clock.instant());
        } catch (AiUsageLimitException exception) {
            throw exception;
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

    private Instant retryAt(AiUsageLimitException exception) {
        Instant now = clock.instant();
        Instant resetAt = exception.resetAt();
        Instant retryAfter = now.plusSeconds(Math.max(1, exception.retryAfterSeconds()));
        return resetAt == null || resetAt.isBefore(retryAfter) ? retryAfter : resetAt;
    }

    private boolean isDeterministicBudgetDenial(AiUsageLimitException exception) {
        return "AI_REQUEST_BUDGET_EXCEEDED".equals(exception.code())
                || "AI_TASK_BUDGET_EXCEEDED".equals(exception.code());
    }

    private boolean renewClaim(IngestionClaim claim) {
        Instant now = clock.instant();
        return jobService.renewClaim(claim, now, now.plusMillis(properties.ai().ingestionLeaseMillis()));
    }

    List<List<com.auralis.app.ai.ingestion.TextChunk>> embeddingBatches(
            List<com.auralis.app.ai.ingestion.TextChunk> chunks) {
        int maxItems = properties.ai().ingestionEmbeddingBatchMaxItems();
        long maxBytes = properties.ai().ingestionEmbeddingBatchMaxUtf8Bytes();
        List<List<com.auralis.app.ai.ingestion.TextChunk>> batches = new ArrayList<>();
        List<com.auralis.app.ai.ingestion.TextChunk> batch = new ArrayList<>();
        long batchBytes = 0;
        for (com.auralis.app.ai.ingestion.TextChunk chunk : chunks) {
            long chunkBytes = chunk.content().getBytes(StandardCharsets.UTF_8).length;
            if (chunkBytes > maxBytes) {
                throw new DomainException("INGESTION_FAILED", "A text chunk exceeds the embedding batch byte limit");
            }
            if (!batch.isEmpty() && (batch.size() >= maxItems || batchBytes + chunkBytes > maxBytes)) {
                batches.add(List.copyOf(batch));
                batch.clear();
                batchBytes = 0;
            }
            batch.add(chunk);
            batchBytes += chunkBytes;
        }
        if (!batch.isEmpty()) batches.add(List.copyOf(batch));
        return List.copyOf(batches);
    }

    private String safeDetail(String detail) {
        if (detail == null || detail.isBlank()) {
            return "Source ingestion failed";
        }
        return detail.length() > 500 ? detail.substring(0, 500) : detail;
    }
}
