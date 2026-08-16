package com.auralis.app.ai.retrieval;

import com.auralis.app.ai.internal.persistence.SourceChunkEntity;
import com.auralis.app.ai.internal.persistence.SourceChunkRepository;
import com.auralis.app.source.SourceService;
import com.auralis.app.source.SourceView;
import org.springframework.stereotype.Service;

import java.util.Comparator;
import java.util.List;
import java.util.UUID;

@Service
public class RetrievalService {

    private final SourceChunkRepository chunkRepository;
    private final SourceService sourceService;
    private final EmbeddingVectorCodec vectorCodec = new EmbeddingVectorCodec();

    public RetrievalService(SourceChunkRepository chunkRepository, SourceService sourceService) {
        this.chunkRepository = chunkRepository;
        this.sourceService = sourceService;
    }

    public List<Citation> retrieve(UUID userId, List<Double> queryVector, int topK) {
        vectorCodec.validate(queryVector);
        if (topK <= 0) {
            throw new IllegalArgumentException("topK must be positive");
        }
        return chunkRepository.findAllByUserId(userId).stream()
                .map(chunk -> scored(chunk, queryVector))
                .filter(scored -> scored.similarity() > 0)
                .sorted(Comparator.comparingDouble(ScoredChunk::similarity).reversed()
                        .thenComparing(scored -> scored.chunk().getId()))
                .limit(topK)
                .map(scored -> citation(userId, scored.chunk(), scored.similarity()))
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

    private Citation citation(UUID userId, SourceChunkEntity chunk, double similarity) {
        SourceView source = sourceService.get(userId, chunk.getSourceId());
        String excerpt = chunk.getContent().length() > 400
                ? chunk.getContent().substring(0, 400)
                : chunk.getContent();
        return new Citation(chunk.getSourceId(), chunk.getId(), chunk.getOrdinal(), source.title(), excerpt, similarity);
    }

    private record ScoredChunk(SourceChunkEntity chunk, double similarity) {
    }
}
