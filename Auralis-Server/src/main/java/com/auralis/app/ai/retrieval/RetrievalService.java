package com.auralis.app.ai.retrieval;

import com.auralis.app.ai.internal.persistence.SourceChunkEntity;
import com.auralis.app.ai.internal.persistence.SourceChunkRepository;
import com.auralis.app.shared.error.DomainException;
import com.auralis.app.source.SourceService;
import com.auralis.app.source.SourceView;
import com.auralis.app.source.SourceIngestionStatus;
import com.auralis.app.subject.SubjectService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.Comparator;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
public class RetrievalService {

    private final SourceChunkRepository chunkRepository;
    private final SourceService sourceService;
    private final PgVectorRetrievalRepository pgVectorRepository;
    private final SubjectService subjectService;
    private final EmbeddingVectorCodec vectorCodec = new EmbeddingVectorCodec();

    public RetrievalService(SourceChunkRepository chunkRepository, SourceService sourceService) {
        this(chunkRepository, sourceService, null, null);
    }

    public RetrievalService(
            SourceChunkRepository chunkRepository,
            SourceService sourceService,
            PgVectorRetrievalRepository pgVectorRepository) {
        this(chunkRepository, sourceService, pgVectorRepository, null);
    }

    @Autowired
    public RetrievalService(
            SourceChunkRepository chunkRepository,
            SourceService sourceService,
            PgVectorRetrievalRepository pgVectorRepository,
            SubjectService subjectService) {
        this.chunkRepository = chunkRepository;
        this.sourceService = sourceService;
        this.pgVectorRepository = pgVectorRepository;
        this.subjectService = subjectService;
    }

    public List<Citation> retrieve(UUID userId, List<Double> queryVector, int topK) {
        return retrieve(userId, queryVector, topK, null);
    }

    public List<Citation> retrieve(
            UUID userId,
            List<Double> queryVector,
            int topK,
            ReadingContext readingContext) {
        return retrieve(userId, queryVector, topK, readingContext, null);
    }

    public List<Citation> retrieve(
            UUID userId,
            List<Double> queryVector,
            int topK,
            ReadingContext readingContext,
            String queryText) {
        vectorCodec.validate(queryVector);
        if (topK <= 0) {
            throw new IllegalArgumentException("topK must be positive");
        }
        if (readingContext != null) {
            if (readingContext.retrievalMode() == ReadingContext.RetrievalMode.SELECTED_SOURCES) {
                return retrieveSelectedSources(userId, queryVector, topK, readingContext);
            }
            if (readingContext.retrievalMode() == ReadingContext.RetrievalMode.SUBJECT) {
                return retrieveSubjectSources(userId, queryVector, topK, readingContext);
            }
        }
        SourceView currentSource = validateReadingContext(userId, readingContext);
        UUID sourceId = currentSource == null ? null : currentSource.id();
        List<Citation> currentHits = retrieveForSource(userId, queryVector, topK, sourceId);
        if (currentSource == null || queryText == null || queryText.isBlank()) return currentHits;

        List<SourceView> subjectSources = sourceService.list(userId);
        ScopeEscalationPolicy.Decision decision = ScopeEscalationPolicy.decide(
                queryText, currentSource, subjectSources == null ? List.of() : subjectSources,
                currentHits.size(), ReadingRetrievalConfig.defaults());
        if (!decision.escalated()) return currentHits;

        List<Citation> expanded = new ArrayList<>(currentHits);
        for (UUID targetId : decision.sourceIds()) {
            expanded.addAll(retrieveForSource(userId, queryVector, topK, targetId));
        }
        return expanded.stream()
                .collect(java.util.stream.Collectors.toMap(
                        citation -> citation.sourceId() + ":" + citation.chunkId(),
                        citation -> citation,
                        (first, ignored) -> first,
                        LinkedHashMap::new))
                .values().stream()
                .limit(topK)
                .toList();
    }

    private List<Citation> retrieveSelectedSources(
            UUID userId,
            List<Double> queryVector,
            int topK,
            ReadingContext readingContext) {
        requireActiveSubject(userId, readingContext.subjectId());
        List<UUID> requestedIds = readingContext.sourceIds();
        if (requestedIds.isEmpty() || requestedIds.size() > 100
                || requestedIds.stream().anyMatch(java.util.Objects::isNull)
                || new LinkedHashSet<>(requestedIds).size() != requestedIds.size()) {
            throw new DomainException("VALIDATION_FAILED", "readingContext.sourceIds must contain unique source IDs");
        }

        List<SourceView> requestedSources = sourceService.findActiveViewsByIds(userId, requestedIds);
        if (requestedSources.size() != requestedIds.size()) {
            throw new DomainException("RESOURCE_NOT_FOUND", "A selected source was not found");
        }
        for (SourceView source : requestedSources) {
            if (!readingContext.subjectId().equals(source.subjectId())) {
                throw new DomainException("VALIDATION_FAILED", "A selected source does not belong to the reading subject");
            }
            requireReady(source);
        }
        if (readingContext.currentSourceId() != null) {
            SourceView current = sourceService.get(userId, readingContext.currentSourceId());
            if (!readingContext.subjectId().equals(current.subjectId())) {
                throw new DomainException("VALIDATION_FAILED", "readingContext subject does not match the current source");
            }
            requireReady(current);
        }
        return retrieveAcrossSources(userId, queryVector, topK, requestedSources);
    }

    private List<Citation> retrieveSubjectSources(
            UUID userId,
            List<Double> queryVector,
            int topK,
            ReadingContext readingContext) {
        if (!readingContext.sourceIds().isEmpty() || readingContext.currentSourceId() != null) {
            throw new DomainException("VALIDATION_FAILED", "subject retrieval does not accept source IDs");
        }
        requireActiveSubject(userId, readingContext.subjectId());
        List<SourceView> subjectSources = sourceService.list(userId).stream()
                .filter(source -> readingContext.subjectId().equals(source.subjectId()))
                .filter(source -> source.ingestionStatus() == SourceIngestionStatus.READY)
                .toList();
        return retrieveAcrossSources(userId, queryVector, topK, subjectSources);
    }

    private void requireActiveSubject(UUID userId, UUID subjectId) {
        if (subjectService == null) {
            throw new IllegalStateException("SubjectService is required for scoped retrieval");
        }
        subjectService.get(userId, subjectId);
    }

    private List<Citation> retrieveAcrossSources(
            UUID userId,
            List<Double> queryVector,
            int topK,
            List<SourceView> sources) {
        Map<String, Citation> unique = new LinkedHashMap<>();
        for (SourceView source : sources) {
            for (Citation citation : retrieveForSource(userId, queryVector, topK, source.id())) {
                unique.putIfAbsent(citation.sourceId() + ":" + citation.chunkId(), citation);
            }
        }
        return unique.values().stream()
                .sorted(Comparator.comparingDouble(Citation::similarity).reversed()
                        .thenComparing(Citation::sourceId)
                        .thenComparing(Citation::chunkId))
                .limit(topK)
                .toList();
    }

    private void requireReady(SourceView source) {
        if (source.ingestionStatus() != SourceIngestionStatus.READY) {
            throw new DomainException("SOURCE_NOT_READY", "A selected source is not ready for AI retrieval");
        }
    }

    private List<Citation> retrieveForSource(UUID userId, List<Double> queryVector, int topK, UUID sourceId) {
        if (pgVectorRepository != null) {
            Optional<List<PgVectorRetrievalRepository.PgVectorChunk>> databaseResults =
                    sourceId == null
                            ? pgVectorRepository.search(userId, queryVector, topK)
                            : pgVectorRepository.search(userId, sourceId, queryVector, topK);
            if (databaseResults.isPresent()) {
                List<PgVectorRetrievalRepository.PgVectorChunk> hits = databaseResults.get();
                Map<UUID, SourceView> sources = activeSourcesById(userId,
                        hits.stream().map(PgVectorRetrievalRepository.PgVectorChunk::sourceId).collect(Collectors.toSet()));
                return hits.stream()
                        .filter(chunk -> sources.containsKey(chunk.sourceId()))
                        .map(chunk -> citation(chunk, sources.get(chunk.sourceId())))
                        .toList();
            }
        }
        List<SourceChunkEntity> chunks = chunkRepository.findAllByUserIdAndActiveTrue(userId).stream()
                .filter(chunk -> sourceId == null || sourceId.equals(chunk.getSourceId()))
                .toList();
        Map<UUID, SourceView> sources = activeSourcesById(userId,
                chunks.stream().map(SourceChunkEntity::getSourceId).collect(Collectors.toSet()));
        return chunks.stream()
                .filter(chunk -> sources.containsKey(chunk.getSourceId()))
                .map(chunk -> scored(chunk, queryVector))
                .filter(scored -> scored.similarity() > 0)
                .sorted(Comparator.comparingDouble(ScoredChunk::similarity).reversed()
                        .thenComparing(scored -> scored.chunk().getId()))
                .limit(topK)
                .map(scored -> citation(scored.chunk(), sources.get(scored.chunk().getSourceId()),
                        scored.similarity()))
                .toList();
    }

    private Map<UUID, SourceView> activeSourcesById(UUID userId, Set<UUID> sourceIds) {
        if (sourceIds.isEmpty()) {
            return Map.of();
        }
        return sourceService.findActiveViewsByIds(userId, sourceIds).stream()
                .collect(Collectors.toMap(SourceView::id, source -> source, (first, ignored) -> first,
                        LinkedHashMap::new));
    }

    private SourceView validateReadingContext(UUID userId, ReadingContext readingContext) {
        if (readingContext == null) return null;
        if (readingContext.currentSourceId() == null) {
            throw new DomainException("VALIDATION_FAILED", "readingContext.currentSourceId is required");
        }
        SourceView source = sourceService.get(userId, readingContext.currentSourceId());
        if (readingContext.subjectId() != null && !readingContext.subjectId().equals(source.subjectId())) {
            throw new DomainException("VALIDATION_FAILED", "readingContext subject does not match the source");
        }
        if (source.ingestionStatus() != SourceIngestionStatus.READY) {
            throw new DomainException("SOURCE_NOT_READY", "The current source is not ready for AI retrieval");
        }
        return source;
    }

    private ScoredChunk scored(SourceChunkEntity chunk, List<Double> query) {
        List<Double> vector = vectorCodec.decode(chunk.getEmbeddingJson());
        double dot = 0;
        double queryNorm = 0;
        double vectorNorm = 0;
        for (int index = 0; index < query.size(); index++) {
            double queryValue = query.get(index);
            double vectorValue = vector.get(index);
            dot += queryValue * vectorValue;
            queryNorm += queryValue * queryValue;
            vectorNorm += vectorValue * vectorValue;
        }
        double similarity = queryNorm == 0 || vectorNorm == 0
                ? 0
                : dot / (Math.sqrt(queryNorm) * Math.sqrt(vectorNorm));
        return new ScoredChunk(chunk, similarity);
    }

    private Citation citation(SourceChunkEntity chunk, SourceView source, double similarity) {
        return new Citation(
                chunk.getSourceId(), chunk.getId(), chunk.getOrdinal(), source.title(),
                excerpt(chunk.getContent()), similarity);
    }

    private Citation citation(PgVectorRetrievalRepository.PgVectorChunk chunk, SourceView source) {
        return new Citation(
                chunk.sourceId(), chunk.id(), chunk.ordinal(), source.title(), excerpt(chunk.content()),
                chunk.similarity());
    }

    private String excerpt(String content) {
        return content.length() > 400 ? content.substring(0, 400) : content;
    }

    private record ScoredChunk(SourceChunkEntity chunk, double similarity) {
    }
}
