package com.auralis.app;

import com.auralis.app.ai.ingestion.TextChunk;
import com.auralis.app.ai.retrieval.Citation;
import com.auralis.app.ai.retrieval.RetrievalService;
import com.auralis.app.ai.retrieval.SourceChunkService;
import com.auralis.app.shared.error.DomainException;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest(classes = AuralisApplication.class)
@ActiveProfiles("postgres-it")
@EnabledIfSystemProperty(named = "auralis.postgres.it", matches = "true")
@Testcontainers
class PgVectorIntegrationTests {

    private static final String POSTGRES_IMAGE = "pgvector/pgvector:0.8.6-pg17-bookworm";

    @Container
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>(
            DockerImageName.parse(POSTGRES_IMAGE).asCompatibleSubstituteFor("postgres"));

    @DynamicPropertySource
    static void databaseProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
    }

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private SourceChunkService sourceChunkService;

    @Autowired
    private RetrievalService retrievalService;

    @Test
    void writesVectorsRetrievesWithIsolationAndPreservesActiveGenerationOnFailure() {
        assertThat(jdbcTemplate.queryForObject(
                "select count(*) from pg_indexes where schemaname = 'public' "
                        + "and tablename = 'source_chunks' and indexname = 'ix_source_chunks_embedding_user' "
                        + "and indexdef ilike '%using hnsw%'",
                Integer.class)).isEqualTo(1);

        UUID userId = UUID.randomUUID();
        UUID otherUserId = UUID.randomUUID();
        UUID subjectId = UUID.randomUUID();
        UUID otherSubjectId = UUID.randomUUID();
        UUID sourceId = UUID.randomUUID();
        UUID otherSourceId = UUID.randomUUID();
        UUID generation = UUID.randomUUID();
        UUID failedGeneration = UUID.randomUUID();

        insertUser(userId, "pg-it-" + userId);
        insertUser(otherUserId, "pg-it-" + otherUserId);
        insertSubject(subjectId, userId, "PG Integration");
        insertSubject(otherSubjectId, otherUserId, "Other User");
        insertSource(sourceId, userId, subjectId, "Private vector source");
        insertSource(otherSourceId, otherUserId, otherSubjectId, "Other vector source");

        List<Double> query = vector(1.0, 0.0, 0.0);
        sourceChunkService.replace(
                userId,
                sourceId,
                generation,
                List.of(new TextChunk(0, "private vector content", 0, 22)),
                List.of(query));
        sourceChunkService.replace(
                otherUserId,
                otherSourceId,
                UUID.randomUUID(),
                List.of(new TextChunk(0, "other user content", 0, 18)),
                List.of(query));

        assertThat(jdbcTemplate.queryForObject(
                "select pg_typeof(embedding)::text from source_chunks where id = "
                        + "(select id from source_chunks where user_id = ? and source_id = ? and active)",
                String.class,
                userId,
                sourceId)).isEqualTo("vector");
        assertThat(jdbcTemplate.queryForObject(
                "select count(*) from source_chunks where user_id = ? and source_id = ? and active",
                Integer.class,
                userId,
                sourceId)).isEqualTo(1);

        List<Citation> privateResults = retrievalService.retrieveWithinSources(
                userId, query, 5, List.of(sourceId), subjectId, null);
        assertThat(privateResults).singleElement()
                .extracting(Citation::sourceId, Citation::title, Citation::similarity)
                .containsExactly(sourceId, "Private vector source", 1.0);
        assertThat(retrievalService.retrieveWithinSources(
                userId, vector(0.0, 1.0, 0.0), 5, List.of(sourceId), subjectId, null)).isEmpty();
        assertThatThrownBy(() -> retrievalService.retrieveWithinSources(
                userId, query, 5, List.of(sourceId, otherSourceId), null, null))
                .isInstanceOfSatisfying(DomainException.class,
                        error -> assertThat(error.code()).isEqualTo("RESOURCE_NOT_FOUND"));

        sourceChunkService.replace(
                userId,
                sourceId,
                generation,
                List.of(new TextChunk(0, "updated private text", 0, 20)),
                List.of(query));
        assertThat(jdbcTemplate.queryForObject(
                "select count(*) from source_chunks where user_id = ? and source_id = ? and generation = ?",
                Integer.class,
                userId,
                sourceId,
                generation)).isEqualTo(1);
        assertThat(jdbcTemplate.queryForObject(
                "select content from source_chunks where user_id = ? and source_id = ? and generation = ? and active",
                String.class,
                userId,
                sourceId,
                generation)).isEqualTo("updated private text");

        assertThatThrownBy(() -> sourceChunkService.replace(
                userId,
                sourceId,
                failedGeneration,
                List.of(new TextChunk(0, "invalid replacement", 0, 0)),
                List.of(query)))
                .isInstanceOf(DataAccessException.class);

        assertThat(jdbcTemplate.queryForObject(
                "select count(*) from source_chunks where user_id = ? and source_id = ? and generation = ?",
                Integer.class,
                userId,
                sourceId,
                failedGeneration)).isZero();
        assertThat(jdbcTemplate.queryForObject(
                "select count(*) from source_chunks where user_id = ? and source_id = ? and generation = ? and active",
                Integer.class,
                userId,
                sourceId,
                generation)).isEqualTo(1);

        jdbcTemplate.update("update sources set deleted_at = current_timestamp where id = ?", sourceId);
        assertThatThrownBy(() -> retrievalService.retrieveWithinSources(
                userId, query, 5, List.of(sourceId), subjectId, null))
                .isInstanceOfSatisfying(DomainException.class,
                        error -> assertThat(error.code()).isEqualTo("RESOURCE_NOT_FOUND"));
    }

    @Test
    void deletedSourceDoesNotConsumeTopKAndRestoredSourceCanPublishANewGeneration() {
        UUID userId = UUID.randomUUID();
        UUID subjectId = UUID.randomUUID();
        UUID deletedSourceId = UUID.randomUUID();
        UUID activeSourceId = UUID.randomUUID();
        UUID originalGeneration = UUID.randomUUID();
        UUID restoredGeneration = UUID.randomUUID();
        insertUser(userId, "pg-it-rag-delete-" + userId);
        insertSubject(subjectId, userId, "RAG delete integration");
        insertSource(deletedSourceId, userId, subjectId, "Deleted source");
        insertSource(activeSourceId, userId, subjectId, "Active source");

        List<Double> exact = vector(1.0, 0.0, 0.0);
        List<Double> lower = vector(0.8, 0.6, 0.0);
        sourceChunkService.replace(userId, deletedSourceId, originalGeneration,
                List.of(new TextChunk(0, "old deleted chunk", 0, 17)), List.of(exact));
        sourceChunkService.replace(userId, activeSourceId, UUID.randomUUID(),
                List.of(new TextChunk(0, "active source chunk", 0, 19)), List.of(lower));

        jdbcTemplate.update("update sources set deleted_at = current_timestamp where id = ?", deletedSourceId);

        assertThat(retrievalService.retrieveWithinSources(
                userId, exact, 1, List.of(activeSourceId), subjectId, null)).singleElement()
                .extracting(Citation::sourceId, Citation::title, Citation::excerpt)
                .containsExactly(activeSourceId, "Active source", "active source chunk");

        jdbcTemplate.update("update sources set deleted_at = null where id = ?", deletedSourceId);
        sourceChunkService.replace(userId, deletedSourceId, restoredGeneration,
                List.of(new TextChunk(0, "restored reingest chunk", 0, 22)), List.of(exact));

        assertThat(retrievalService.retrieveWithinSources(
                userId, exact, 1, List.of(activeSourceId), subjectId, null)).singleElement()
                .extracting(Citation::sourceId)
                .isEqualTo(activeSourceId);
        assertThat(retrievalService.retrieveWithinSources(
                userId, exact, 1, List.of(activeSourceId, deletedSourceId), subjectId, null)).singleElement()
                .extracting(Citation::sourceId, Citation::excerpt)
                .containsExactly(deletedSourceId, "restored reingest chunk");
        assertThat(jdbcTemplate.queryForObject(
                "select count(*) from source_chunks where user_id = ? and source_id = ? and active",
                Integer.class, userId, deletedSourceId)).isEqualTo(1);
        assertThat(jdbcTemplate.queryForObject(
                "select count(*) from source_chunks where user_id = ? and source_id = ? "
                        + "and generation = ? and active",
                Integer.class, userId, deletedSourceId, originalGeneration)).isZero();
    }

    private void insertUser(UUID id, String username) {
        jdbcTemplate.update(
                "insert into users (id, username, normalized_username, password_hash, status) "
                        + "values (?, ?, ?, ?, 'ACTIVE')",
                id, username, username.toUpperCase(), "integration-test");
    }

    private void insertSubject(UUID id, UUID userId, String name) {
        jdbcTemplate.update(
                "insert into subjects (id, user_id, name, sort_key, is_default) values (?, ?, ?, '', false)",
                id, userId, name);
    }

    private void insertSource(UUID id, UUID userId, UUID subjectId, String title) {
        jdbcTemplate.update(
                "insert into sources (id, user_id, type, subject_id, title, raw_text, ingestion_status) "
                        + "values (?, ?, 'TEXT', ?, ?, ?, 'READY')",
                id, userId, subjectId, title, title + " content");
    }

    private List<Double> vector(double first, double second, double third) {
        List<Double> vector = new java.util.ArrayList<>(1024);
        vector.add(first);
        vector.add(second);
        vector.add(third);
        while (vector.size() < 1024) {
            vector.add(0.0);
        }
        return vector;
    }
}
