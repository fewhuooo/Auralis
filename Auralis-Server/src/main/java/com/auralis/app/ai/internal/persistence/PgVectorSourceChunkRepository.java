package com.auralis.app.ai.internal.persistence;

import com.auralis.app.ai.ingestion.TextChunk;
import com.auralis.app.ai.retrieval.EmbeddingVectorCodec;
import org.springframework.jdbc.core.ConnectionCallback;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.sql.PreparedStatement;
import java.sql.SQLException;
import java.util.List;
import java.util.UUID;

@Repository
public class PgVectorSourceChunkRepository {

    private static final String INSERT_SQL = """
            insert into source_chunks (
                id, user_id, source_id, generation, ordinal, content, content_hash,
                char_start, char_end, embedding_json, embedding, provenance_json, active, created_at, updated_at)
            values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, cast(? as vector), ?, false, current_timestamp, current_timestamp)
            """;

    private final JdbcTemplate jdbcTemplate;
    private final EmbeddingVectorCodec vectorCodec = new EmbeddingVectorCodec();

    public PgVectorSourceChunkRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public boolean isAvailable() {
        return Boolean.TRUE.equals(jdbcTemplate.execute((ConnectionCallback<Boolean>) connection ->
                "PostgreSQL".equalsIgnoreCase(connection.getMetaData().getDatabaseProductName())));
    }

    public void replace(
            UUID userId,
            UUID sourceId,
            UUID generation,
            List<TextChunk> chunks,
            List<List<Double>> vectors) {
        replace(userId, sourceId, generation, chunks, vectors, null);
    }

    public void replace(
            UUID userId,
            UUID sourceId,
            UUID generation,
            List<TextChunk> chunks,
            List<List<Double>> vectors,
            List<String> provenanceJson) {
        if (chunks.size() != vectors.size()) {
            throw new IllegalArgumentException("Chunk and embedding counts must match");
        }
        if (provenanceJson != null && provenanceJson.size() != chunks.size()) {
            throw new IllegalArgumentException("Chunk provenance count must match chunks");
        }
        vectors.forEach(vectorCodec::validate);
        jdbcTemplate.update("""
                delete from source_chunks
                 where user_id = ? and source_id = ? and generation = ?
                """, userId, sourceId, generation);
        jdbcTemplate.batchUpdate(INSERT_SQL, new org.springframework.jdbc.core.BatchPreparedStatementSetter() {
            @Override
            public void setValues(PreparedStatement statement, int index) throws SQLException {
                TextChunk chunk = chunks.get(index);
                String embeddingJson = vectorCodec.encode(vectors.get(index));
                statement.setObject(1, UUID.randomUUID());
                statement.setObject(2, userId);
                statement.setObject(3, sourceId);
                statement.setObject(4, generation);
                statement.setInt(5, chunk.ordinal());
                statement.setString(6, chunk.content());
                statement.setString(7, sha256(chunk.content()));
                statement.setInt(8, chunk.charStart());
                statement.setInt(9, chunk.charEnd());
                statement.setString(10, embeddingJson);
                statement.setString(11, vectorLiteral(vectors.get(index)));
                statement.setString(12, provenanceJson == null ? null : provenanceJson.get(index));
            }

            @Override
            public int getBatchSize() {
                return chunks.size();
            }
        });
        jdbcTemplate.update("""
                update source_chunks
                   set active = false, updated_at = current_timestamp
                 where user_id = ? and source_id = ? and active = true
                """, userId, sourceId);
        jdbcTemplate.update("""
                update source_chunks
                   set active = true, updated_at = current_timestamp
                 where user_id = ? and source_id = ? and generation = ?
                """, userId, sourceId, generation);
    }

    public String vectorLiteral(List<Double> vector) {
        vectorCodec.validate(vector);
        return vector.stream().map(String::valueOf).collect(java.util.stream.Collectors.joining(",", "[", "]"));
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
