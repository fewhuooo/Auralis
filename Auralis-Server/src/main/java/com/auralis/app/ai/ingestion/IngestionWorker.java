package com.auralis.app.ai.ingestion;

import com.auralis.app.ai.internal.persistence.IngestionJobEntity;
import com.auralis.app.ai.internal.persistence.IngestionJobRepository;
import com.auralis.app.ai.AiProviderType;
import com.auralis.app.ai.AiSettingsService;
import com.auralis.app.ai.EmbeddingProviderPort;
import com.auralis.app.ai.EmbeddingResult;
import com.auralis.app.ai.internal.provider.EmbeddingProviderRegistry;
import com.auralis.app.ai.retrieval.SourceChunkService;
import com.auralis.app.shared.error.DomainException;
import com.auralis.app.source.SourceService;
import com.auralis.app.source.SourceView;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Service
public class IngestionWorker {

    private final IngestionJobRepository jobRepository;
    private final SourceService sourceService;
    private final List<SourceParser> parsers;
    private final AiSettingsService settingsService;
    private final EmbeddingProviderRegistry embeddingProviderRegistry;
    private final SourceChunkService chunkService;
    private final TextChunker chunker = new TextChunker(1200, 120);

    public IngestionWorker(
            IngestionJobRepository jobRepository,
            SourceService sourceService,
            List<SourceParser> parsers,
            AiSettingsService settingsService,
            EmbeddingProviderRegistry embeddingProviderRegistry,
            SourceChunkService chunkService) {
        this.jobRepository = jobRepository;
        this.sourceService = sourceService;
        this.parsers = parsers;
        this.settingsService = settingsService;
        this.embeddingProviderRegistry = embeddingProviderRegistry;
        this.chunkService = chunkService;
    }

    @Transactional
    public void process(UUID userId, UUID jobId) {
        IngestionJobEntity job = jobRepository.findByIdAndUserId(jobId, userId)
                .orElseThrow(() -> new DomainException("RESOURCE_NOT_FOUND", "Ingestion job was not found"));
        if (!job.isActive()) {
            return;
        }
        Instant now = Instant.now();
        job.claim(now, now.plus(Duration.ofMinutes(5)));
        jobRepository.saveAndFlush(job);
        SourceView source = sourceService.markParsing(userId, job.getSourceId());
        try {
            SourceParser parser = parsers.stream()
                    .filter(candidate -> candidate.supports(source.type()))
                    .findFirst()
                    .orElseThrow(() -> new IllegalArgumentException("No parser for source type"));
            String text = parser.parse(userId, source);
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
            chunkService.replace(userId, source.id(), chunks, embeddings.vectors());
            sourceService.markReady(userId, source.id());
            job.markReady(Instant.now());
        } catch (DomainException exception) {
            sourceService.markFailed(userId, source.id(), exception.code(), safeDetail(exception.getMessage()));
            job.markFailed(Instant.now(), exception.code(), safeDetail(exception.getMessage()));
        } catch (Exception exception) {
            sourceService.markFailed(userId, source.id(), "INGESTION_FAILED", safeDetail(exception.getMessage()));
            job.markFailed(Instant.now(), "INGESTION_FAILED", safeDetail(exception.getMessage()));
        }
        jobRepository.saveAndFlush(job);
    }

    private String safeDetail(String detail) {
        if (detail == null || detail.isBlank()) {
            return "Source ingestion failed";
        }
        return detail.length() > 500 ? detail.substring(0, 500) : detail;
    }
}
