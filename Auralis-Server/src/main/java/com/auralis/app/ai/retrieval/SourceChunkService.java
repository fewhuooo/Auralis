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
