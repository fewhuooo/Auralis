package com.auralis.app.ai.retrieval;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.ConnectionCallback;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public class PgVectorRetrievalRepository {

    private static final String SEARCH_SQL = """
            select sc.id,
                   sc.source_id,
                   sc.ordinal,
                   sc.content,
                   sc.char_start,
                   sc.char_end,
                   1 - (sc.embedding <=> cast(? as vector)) as similarity
              from source_chunks sc
              join sources s on s.id = sc.source_id and s.user_id = sc.user_id
             where sc.user_id = ?
               and sc.active = true
               and sc.embedding is not null
               and s.deleted_at is null
               and sc.embedding <=> cast(? as vector) < 1
             order by sc.embedding <=> cast(? as vector), sc.id
             limit ?
            """;

    private static final String SEARCH_BY_SOURCE_SQL = """
            select sc.id,
                   sc.source_id,
                   sc.ordinal,
                   sc.content,
                   sc.char_start,
                   sc.char_end,
                   1 - (sc.embedding <=> cast(? as vector)) as similarity
              from source_chunks sc
              join sources s on s.id = sc.source_id and s.user_id = sc.user_id
             where sc.user_id = ?
               and sc.source_id = ?
               and sc.active = true
               and sc.embedding is not null
               and s.deleted_at is null
               and sc.embedding <=> cast(? as vector) < 1
             order by sc.embedding <=> cast(? as vector), sc.id
             limit ?
            """;

    private final JdbcTemplate jdbcTemplate;

    public PgVectorRetrievalRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public boolean isAvailable() {
        return Boolean.TRUE.equals(jdbcTemplate.execute((ConnectionCallback<Boolean>) connection ->
                "PostgreSQL".equalsIgnoreCase(connection.getMetaData().getDatabaseProductName())));
    }

    public Optional<List<PgVectorChunk>> search(UUID userId, List<Double> queryVector, int topK) {
        return search(userId, null, queryVector, topK);
    }

    public Optional<List<PgVectorChunk>> search(UUID userId, UUID sourceId, List<Double> queryVector, int topK) {
        if (!isAvailable()) {
            return Optional.empty();
        }
        String vectorLiteral = vectorLiteral(queryVector);
        if (sourceId != null) {
            return Optional.of(jdbcTemplate.query(
                    SEARCH_BY_SOURCE_SQL,
                    (resultSet, rowNum) -> new PgVectorChunk(
                            resultSet.getObject("id", UUID.class),
                            resultSet.getObject("source_id", UUID.class),
                            resultSet.getInt("ordinal"),
                            resultSet.getString("content"),
                            resultSet.getInt("char_start"),
                            resultSet.getInt("char_end"),
                            resultSet.getDouble("similarity")),
                    vectorLiteral, userId, sourceId, vectorLiteral, vectorLiteral, topK));
        }
        List<PgVectorChunk> results = jdbcTemplate.query(
                SEARCH_SQL,
                (resultSet, rowNum) -> new PgVectorChunk(
                        resultSet.getObject("id", UUID.class),
                        resultSet.getObject("source_id", UUID.class),
                        resultSet.getInt("ordinal"),
                        resultSet.getString("content"),
                        resultSet.getInt("char_start"),
                        resultSet.getInt("char_end"),
                        resultSet.getDouble("similarity")),
                vectorLiteral, userId, vectorLiteral, vectorLiteral, topK);
        return Optional.of(results);
    }

    private String vectorLiteral(List<Double> vector) {
        return vector.stream()
                .map(String::valueOf)
                .collect(java.util.stream.Collectors.joining(",", "[", "]"));
    }

    public record PgVectorChunk(
            UUID id,
            UUID sourceId,
            int ordinal,
            String content,
            int charStart,
            int charEnd,
            double similarity) {
    }
}
