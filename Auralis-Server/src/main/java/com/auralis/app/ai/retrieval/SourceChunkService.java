package com.auralis.app.ai.retrieval;

import com.auralis.app.ai.internal.persistence.SourceChunkEntity;
import com.auralis.app.ai.internal.persistence.PgVectorSourceChunkRepository;
import com.auralis.app.ai.internal.persistence.SourceChunkRepository;
import com.auralis.app.ai.ingestion.TextChunk;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.List;
import java.util.Map;
import java.util.HashMap;
import java.util.stream.Collectors;
import java.util.UUID;

@Service
public class SourceChunkService {

    private final SourceChunkRepository chunkRepository;
    private final PgVectorSourceChunkRepository pgVectorRepository;
    private final EmbeddingVectorCodec vectorCodec = new EmbeddingVectorCodec();

    public SourceChunkService(
            SourceChunkRepository chunkRepository,
            PgVectorSourceChunkRepository pgVectorRepository) {
        this.chunkRepository = chunkRepository;
        this.pgVectorRepository = pgVectorRepository;
    }

    @Transactional
    public void replace(UUID userId, UUID sourceId, List<TextChunk> chunks, List<List<Double>> vectors) {
        replace(userId, sourceId, UUID.randomUUID(), chunks, vectors);
    }

    @Transactional
    public void replace(
            UUID userId,
            UUID sourceId,
            UUID generation,
            List<TextChunk> chunks,
            List<List<Double>> vectors) {
        if (chunks == null || vectors == null || chunks.size() != vectors.size()) {
            throw new IllegalArgumentException("Chunk and embedding counts must match");
        }
        if (generation == null || chunks.isEmpty()) {
            throw new IllegalArgumentException("A non-empty generation is required");
        }
        vectors.forEach(vectorCodec::validate);
        if (pgVectorRepository.isAvailable()) {
            pgVectorRepository.replace(userId, sourceId, generation, chunks, vectors);
            return;
        }
        chunkRepository.deleteGeneration(userId, sourceId, generation);
        List<SourceChunkEntity> replacements = new java.util.ArrayList<>();
        for (int index = 0; index < chunks.size(); index++) {
            TextChunk chunk = chunks.get(index);
            replacements.add(new SourceChunkEntity(
                    UUID.randomUUID(), userId, sourceId, chunk.ordinal(), chunk.content(),
                    sha256(chunk.content()), chunk.charStart(), chunk.charEnd(),
                    vectorCodec.encode(vectors.get(index)), generation, false));
        }
        chunkRepository.saveAll(replacements);
        chunkRepository.flush();
        chunkRepository.deactivateActive(userId, sourceId);
        chunkRepository.activateGeneration(userId, sourceId, generation);
    }

    @Transactional(readOnly = true)
    public Map<Integer, List<Double>> loadCheckpoint(
            UUID userId, UUID sourceId, UUID generation, List<TextChunk> expectedChunks) {
        Map<Integer, TextChunk> expected = expectedChunks.stream()
                .collect(Collectors.toMap(TextChunk::ordinal, chunk -> chunk));
        Map<Integer, List<Double>> result = new HashMap<>();
        for (SourceChunkEntity row : chunkRepository.findAllByUserIdAndSourceIdAndGenerationOrderByOrdinalAsc(
                userId, sourceId, generation)) {
            TextChunk chunk = expected.get(row.getOrdinal());
            if (chunk == null || !matches(row, chunk) || row.isActive()) {
                throw new IllegalStateException("Stored ingestion checkpoint does not match the current document");
            }
            result.put(row.getOrdinal(), vectorCodec.decode(row.getEmbeddingJson()));
        }
        return Map.copyOf(result);
    }

    @Transactional
    public void stageCheckpoint(
            UUID userId, UUID sourceId, UUID generation, List<TextChunk> chunks, List<List<Double>> vectors) {
        if (chunks == null || vectors == null || chunks.isEmpty() || chunks.size() != vectors.size()) {
            throw new IllegalArgumentException("Checkpoint chunk and vector counts must match");
        }
        vectors.forEach(vectorCodec::validate);
        List<SourceChunkEntity> existing = chunkRepository
                .findAllByUserIdAndSourceIdAndGenerationOrderByOrdinalAsc(userId, sourceId, generation);
        Map<Integer, SourceChunkEntity> byOrdinal = existing.stream()
                .collect(Collectors.toMap(SourceChunkEntity::getOrdinal, row -> row));
        List<SourceChunkEntity> additions = new java.util.ArrayList<>();
        for (int index = 0; index < chunks.size(); index++) {
            TextChunk chunk = chunks.get(index);
            SourceChunkEntity row = byOrdinal.get(chunk.ordinal());
            if (row != null) {
                if (row.isActive() || !matches(row, chunk)
                        || !vectorCodec.decode(row.getEmbeddingJson()).equals(vectors.get(index))) {
                    throw new IllegalStateException("Stored ingestion checkpoint conflicts with the current batch");
                }
                continue;
            }
            additions.add(new SourceChunkEntity(UUID.randomUUID(), userId, sourceId, chunk.ordinal(),
                    chunk.content(), sha256(chunk.content()), chunk.charStart(), chunk.charEnd(),
                    vectorCodec.encode(vectors.get(index)), generation, false));
        }
        if (!additions.isEmpty()) {
            chunkRepository.saveAll(additions);
            chunkRepository.flush();
        }
    }

    private boolean matches(SourceChunkEntity row, TextChunk chunk) {
        return row.getOrdinal() == chunk.ordinal()
                && row.getContent().equals(chunk.content())
                && row.getContentHash().equals(sha256(chunk.content()))
                && row.getCharStart() == chunk.charStart()
                && row.getCharEnd() == chunk.charEnd();
    }

    private String sha256(String text) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                    .digest(text.getBytes(StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder(64);
            for (byte value : digest) {
                hex.append(String.format("%02x", value));
            }
            return hex.toString();
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is unavailable", exception);
        }
    }
}
