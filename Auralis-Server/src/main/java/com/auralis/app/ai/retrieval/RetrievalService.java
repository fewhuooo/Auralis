package com.auralis.app.ai.retrieval;

import com.auralis.app.ai.internal.persistence.SourceChunkEntity;
import com.auralis.app.ai.internal.persistence.SourceChunkRepository;
import com.auralis.app.source.SourceService;
import com.auralis.app.source.SourceView;
import com.auralis.app.shared.error.DomainException;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Service
public class RetrievalService {

    private final SourceChunkRepository chunkRepository;
    private final SourceService sourceService;
    private final PgVectorRetrievalRepository pgVectorRepository;
    private final EmbeddingVectorCodec vectorCodec = new EmbeddingVectorCodec();

    public RetrievalService(SourceChunkRepository chunkRepository, SourceService sourceService) {
        this(chunkRepository, sourceService, null);
    }

    @Autowired
    public RetrievalService(
            SourceChunkRepository chunkRepository,
            SourceService sourceService,
            PgVectorRetrievalRepository pgVectorRepository) {
        this.chunkRepository = chunkRepository;
        this.sourceService = sourceService;
        this.pgVectorRepository = pgVectorRepository;
    }

    public List<Citation> retrieve(UUID userId, List<Double> queryVector, int topK) {
        vectorCodec.validate(queryVector);
        if (topK <= 0) {
            throw new IllegalArgumentException("topK must be positive");
        }
        if (pgVectorRepository != null) {
            Optional<List<PgVectorRetrievalRepository.PgVectorChunk>> databaseResults =
                    pgVectorRepository.search(userId, queryVector, topK);
            if (databaseResults.isPresent()) {
                return databaseResults.get().stream()
                        .map(chunk -> citation(userId, chunk))
                        .flatMap(Optional::stream)
                        .toList();
            }
        }
        return chunkRepository.findAllByUserIdAndActiveTrue(userId).stream()
                .map(chunk -> scored(chunk, queryVector))
                .filter(scored -> scored.similarity() > 0)
                .sorted(Comparator.comparingDouble(ScoredChunk::similarity).reversed()
                        .thenComparing(scored -> scored.chunk().getId()))
                .limit(topK)
                .map(scored -> citation(userId, scored.chunk(), scored.similarity()))
                .flatMap(Optional::stream)
                .toList();
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

    private Optional<Citation> citation(UUID userId, SourceChunkEntity chunk, double similarity) {
        try {
            SourceView source = sourceService.get(userId, chunk.getSourceId());
            String excerpt = excerpt(chunk.getContent());
            return Optional.of(new Citation(
                    chunk.getSourceId(), chunk.getId(), chunk.getOrdinal(), source.title(), excerpt, similarity));
        } catch (DomainException exception) {
            return Optional.empty();
        }
    }

    private Optional<Citation> citation(UUID userId, PgVectorRetrievalRepository.PgVectorChunk chunk) {
        try {
            SourceView source = sourceService.get(userId, chunk.sourceId());
            return Optional.of(new Citation(
                    chunk.sourceId(), chunk.id(), chunk.ordinal(), source.title(), excerpt(chunk.content()),
                    chunk.similarity()));
        } catch (DomainException exception) {
            return Optional.empty();
        }
    }

    private String excerpt(String content) {
        return content.length() > 400 ? content.substring(0, 400) : content;
    }

    private record ScoredChunk(SourceChunkEntity chunk, double similarity) {
    }
}
