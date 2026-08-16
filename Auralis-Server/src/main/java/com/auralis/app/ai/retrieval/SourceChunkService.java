package com.auralis.app.ai.retrieval;

import com.auralis.app.ai.internal.persistence.SourceChunkEntity;
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
    private final EmbeddingVectorCodec vectorCodec = new EmbeddingVectorCodec();

    public SourceChunkService(SourceChunkRepository chunkRepository) {
        this.chunkRepository = chunkRepository;
    }

    @Transactional
    public void replace(UUID userId, UUID sourceId, List<TextChunk> chunks, List<List<Double>> vectors) {
        if (chunks == null || vectors == null || chunks.size() != vectors.size()) {
            throw new IllegalArgumentException("Chunk and embedding counts must match");
        }
        vectors.forEach(vectorCodec::validate);
        List<SourceChunkEntity> replacements = new java.util.ArrayList<>();
        for (int index = 0; index < chunks.size(); index++) {
            TextChunk chunk = chunks.get(index);
            replacements.add(new SourceChunkEntity(
                    UUID.randomUUID(), userId, sourceId, chunk.ordinal(), chunk.content(),
                    sha256(chunk.content()), chunk.charStart(), chunk.charEnd(), vectorCodec.encode(vectors.get(index))));
        }
        chunkRepository.deleteAllByUserIdAndSourceId(userId, sourceId);
        chunkRepository.saveAll(replacements);
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
