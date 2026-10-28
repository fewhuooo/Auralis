package com.auralis.app.ai;

import com.auralis.app.ai.ingestion.TextChunk;
import com.auralis.app.source.ParsedDocumentValidator;
import com.auralis.app.shared.error.DomainException;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.json.JsonMapper;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/** Persisted block-to-chunk mapping for accepted ParsedDocument text. */
public record SourceChunkProvenance(
        int schemaVersion,
        UUID ingestionRevision,
        UUID parsedDocumentId,
        String parserId,
        List<Location> locations) {

    public static final int SCHEMA_VERSION = 1;
    public static final int MAX_LOCATIONS_PER_CHUNK = 256;
    public static final int MAX_JSON_CHARS = 65_536;
    private static final tools.jackson.databind.ObjectMapper JSON = JsonMapper.builder().build();

    public SourceChunkProvenance {
        locations = locations == null ? null : List.copyOf(locations);
    }

    public record Location(
            long blockOrdinal,
            String kind,
            Long pageNumber,
            Long anchorIndex,
            Long startLine,
            int charStart,
            int charEnd,
            int blockCharStart,
            int blockCharEnd) {
    }

    public static List<SourceChunkProvenance> mapBlocksToChunks(
            List<ParsedDocumentValidator.ValidatedBlock> blocks,
            List<TextChunk> chunks,
            UUID ingestionRevision,
            UUID parsedDocumentId,
            String parserId) {
        if (blocks == null || chunks == null || ingestionRevision == null || parsedDocumentId == null
                || parserId == null || parserId.isBlank()) {
            throw new IllegalArgumentException("Accepted ParsedDocument mapping inputs are required");
        }
        List<BlockOffset> offsets = new ArrayList<>(blocks.size());
        StringBuilder joined = new StringBuilder();
        for (int index = 0; index < blocks.size(); index++) {
            ParsedDocumentValidator.ValidatedBlock block = blocks.get(index);
            if (index > 0) joined.append('\n');
            int start = joined.length();
            joined.append(block.text());
            offsets.add(new BlockOffset(block, start, joined.length()));
        }
        int trimStart = 0;
        while (trimStart < joined.length() && joined.charAt(trimStart) <= ' ') trimStart++;
        int trimEnd = joined.length();
        while (trimEnd > trimStart && joined.charAt(trimEnd - 1) <= ' ') trimEnd--;
        if (!joined.substring(trimStart, trimEnd).equals(joined.toString().trim())) {
            throw new IllegalStateException("TextChunker trim mapping is inconsistent");
        }

        List<SourceChunkProvenance> result = new ArrayList<>(chunks.size());
        for (TextChunk chunk : chunks) {
            int chunkStart = chunk.charStart();
            int chunkEnd = chunk.charEnd();
            List<Location> locations = new ArrayList<>();
            for (BlockOffset offset : offsets) {
                int blockStart = offset.start() - trimStart;
                int blockEnd = offset.end() - trimStart;
                int start = Math.max(chunkStart, blockStart);
                int end = Math.min(chunkEnd, blockEnd);
                if (start >= end) continue;
                if (locations.size() >= MAX_LOCATIONS_PER_CHUNK) {
                    throw new IllegalArgumentException("ParsedDocument block mapping exceeds per-chunk limit");
                }
                ParsedDocumentValidator.ValidatedBlock block = offset.block();
                locations.add(new Location(block.ordinal(), block.kind(), block.pageNumber(), block.anchorIndex(),
                        block.startLine(), start, end, start - blockStart, end - blockStart));
            }
            result.add(new SourceChunkProvenance(SCHEMA_VERSION, ingestionRevision, parsedDocumentId,
                    parserId, locations));
        }
        return List.copyOf(result);
    }

    public static List<String> encode(List<SourceChunkProvenance> provenance) {
        if (provenance == null) return null;
        try {
            List<String> encoded = new ArrayList<>(provenance.size());
            for (SourceChunkProvenance entry : provenance) {
                String json = JSON.writeValueAsString(entry);
                if (json.length() > MAX_JSON_CHARS) {
                    throw new IllegalArgumentException("ParsedDocument provenance exceeds per-chunk size limit");
                }
                encoded.add(json);
            }
            return List.copyOf(encoded);
        } catch (JacksonException exception) {
            throw new DomainException("INTERNAL_ERROR", "ParsedDocument provenance could not be encoded", null, exception);
        }
    }

    private record BlockOffset(ParsedDocumentValidator.ValidatedBlock block, int start, int end) {
    }
}
