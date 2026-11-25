package com.auralis.app.ai;

import com.auralis.app.ai.internal.persistence.SourceChunkEntity;
import com.auralis.app.shared.error.DomainException;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.json.JsonMapper;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;

/** Immutable UTF-16 source view for detailed Overview generation. */
public record OverviewSourceSnapshot(
        UUID sourceId,
        UUID ingestionRevision,
        UUID generation,
        String text,
        List<ChunkRange> chunks) {

    private static final tools.jackson.databind.ObjectMapper JSON = JsonMapper.builder().build();

    public OverviewSourceSnapshot {
        if (sourceId == null || ingestionRevision == null || generation == null || text == null
                || chunks == null) {
            throw new IllegalArgumentException("Overview source snapshot fields are required");
        }
        chunks = List.copyOf(chunks);
        int coveredEnd = 0;
        for (int ordinal = 0; ordinal < chunks.size(); ordinal++) {
            ChunkRange chunk = chunks.get(ordinal);
            if (chunk == null || chunk.generation() == null || !generation.equals(chunk.generation())
                    || chunk.chunkId() == null
                    || chunk.ordinal() != ordinal || chunk.start() < 0 || chunk.start() > coveredEnd
                    || chunk.end() <= chunk.start() || chunk.ownedStart() != coveredEnd
                    || chunk.ownedEnd() != Math.max(coveredEnd, chunk.end())) {
                throw new IllegalArgumentException("Overview source chunk ranges are invalid");
            }
            coveredEnd = chunk.ownedEnd();
        }
        if (chunks.isEmpty() || chunks.getFirst().start() != 0 || coveredEnd != text.length()) {
            throw new IllegalArgumentException("Overview source chunk ranges do not cover the snapshot");
        }

    }

    public static OverviewSourceSnapshot from(UUID sourceId, UUID ingestionRevision, UUID generation,
                                              List<SourceChunkEntity> sourceChunks) {
        if (sourceId == null || ingestionRevision == null || generation == null
                || sourceChunks == null || sourceChunks.isEmpty()) {
            throw new IllegalArgumentException("Current source identity and chunks are required");
        }
        List<SourceChunkEntity> ordered = sourceChunks.stream()
                .sorted(Comparator.comparingInt(SourceChunkEntity::getOrdinal)).toList();
        StringBuilder text = new StringBuilder();
        List<ChunkRange> chunkRanges = new ArrayList<>(ordered.size());
        List<SourceChunkProvenance.Location> locations = new ArrayList<>();
        String parserId = null;
        UUID parsedDocumentId = null;
        int coveredEnd = 0;
        int expectedOrdinal = 0;
        for (SourceChunkEntity chunk : ordered) {
            if (!sourceId.equals(chunk.getSourceId()) || !generation.equals(chunk.getGeneration())
                    || !chunk.isActive() || chunk.getOrdinal() != expectedOrdinal++
                    || chunk.getCharStart() < 0 || chunk.getCharEnd() <= chunk.getCharStart()
                    || chunk.getContent() == null
                    || chunk.getContent().length() != chunk.getCharEnd() - chunk.getCharStart()) {
                throw staleSnapshot();
            }
            SourceChunkProvenance provenance = decode(chunk.getProvenanceJson());
            if (!ingestionRevision.equals(provenance.ingestionRevision())
                    || (parserId != null && !parserId.equals(provenance.parserId()))
                    || (parsedDocumentId != null && !parsedDocumentId.equals(provenance.parsedDocumentId()))) {
                throw staleSnapshot();
            }
            parserId = provenance.parserId();
            parsedDocumentId = provenance.parsedDocumentId();
            locations.addAll(provenance.locations());

            int overlapEnd = Math.min(coveredEnd, chunk.getCharEnd());
            int overlap = overlapEnd - chunk.getCharStart();
            if (overlap < 0 || overlap > 0 && !text.substring(chunk.getCharStart(), overlapEnd)
                    .equals(chunk.getContent().substring(0, overlap))) {
                throw staleSnapshot();
            }
            int ownedStart = coveredEnd;
            text.append(chunk.getContent(), overlap, chunk.getContent().length());
            coveredEnd = Math.max(coveredEnd, chunk.getCharEnd());
            chunkRanges.add(new ChunkRange(chunk.getId(), chunk.getGeneration(), chunk.getOrdinal(),
                    chunk.getCharStart(), chunk.getCharEnd(), ownedStart, coveredEnd));
        }
        if (chunkRanges.getFirst().start() != 0 || text.length() != coveredEnd) throw staleSnapshot();
        if (locations.stream().anyMatch(location -> location.charStart() < 0
                || location.charEnd() < location.charStart() || location.charEnd() > text.length())) {
            throw staleSnapshot();
        }
        return new OverviewSourceSnapshot(sourceId, ingestionRevision, generation, text.toString(),
                chunkRanges);
    }

    private static SourceChunkProvenance decode(String json) {
        if (json == null || json.isBlank()) throw staleSnapshot();
        try {
            SourceChunkProvenance provenance = JSON.readValue(json, SourceChunkProvenance.class);
            if (provenance == null || provenance.schemaVersion() != SourceChunkProvenance.SCHEMA_VERSION
                    || provenance.ingestionRevision() == null || provenance.parsedDocumentId() == null
                    || provenance.parserId() == null || provenance.locations() == null) throw staleSnapshot();
            return provenance;
        } catch (JacksonException exception) {
            throw staleSnapshot();
        }
    }

    private static DomainException staleSnapshot() {
        return new DomainException("RESOURCE_VERSION_CONFLICT", "Overview source snapshot is stale or inconsistent");
    }

    public record ChunkRange(UUID chunkId, UUID generation, int ordinal, int start, int end,
                             int ownedStart, int ownedEnd) { }


}
