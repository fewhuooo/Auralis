package com.auralis.app;

import com.auralis.app.support.AuthTestAccounts;
import com.auralis.app.identity.AuthResult;
import com.auralis.app.identity.DeviceCommand;
import com.auralis.app.identity.DevicePlatform;
import com.auralis.app.identity.IdentityService;
import com.auralis.app.subject.SubjectCommand;
import com.auralis.app.subject.SubjectService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(classes = AuralisApplication.class)
@ActiveProfiles("test")
@AutoConfigureMockMvc
class SubjectReviewQueryTests {

    private static final String PASSWORD = "correct horse battery staple";

    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper objectMapper;
    @Autowired private IdentityService identityService;
    @Autowired private SubjectService subjectService;
    @Autowired private JdbcTemplate jdbcTemplate;

    @Test
    void pagesAllOwnerAndSubjectStatesAfterFilteringActiveKnowledgeBlocks() throws Exception {
        Owner owner = owner("review-states-owner");
        Owner otherOwner = owner("review-states-other-owner");
        UUID targetSubject = subject(owner, "Review states target");
        UUID otherSubject = subject(owner, "Review states other");
        UUID foreignSubject = subject(otherOwner, "Review states foreign");
        UUID parameterSetId = insertParameterSet();
        long namespace = UUID.randomUUID().getMostSignificantBits() & 0xFFFFFFFFFFFF0000L;

        List<UUID> expectedIds = new ArrayList<>();
        for (int index = 1; index <= 205; index++) {
            UUID unrelatedId = blockId(namespace, 1, index);
            insertBlockAndState(owner.userId(), otherSubject, unrelatedId, parameterSetId, null);

            UUID targetId = blockId(namespace, 2, index);
            insertBlockAndState(owner.userId(), targetSubject, targetId, parameterSetId, null);
            expectedIds.add(targetId);
        }

        UUID deletedBlock = blockId(namespace, 2, 999);
        insertBlockAndState(owner.userId(), targetSubject, deletedBlock, parameterSetId, Instant.now());
        insertBlockAndState(otherOwner.userId(), foreignSubject, blockId(namespace, 3, 1), parameterSetId, null);

        List<String> actualIds = new ArrayList<>();
        JsonNode page = states(owner, targetSubject, null, 100);
        assertThat(page.path("items").size()).isEqualTo(100);
        assertThat(page.path("hasMore").booleanValue()).isTrue();
        String firstCursor = page.path("nextCursor").asText();
        assertThat(firstCursor).isNotBlank();
        appendBlockIds(actualIds, page, owner.userId(), expectedIds);

        JsonNode secondPage = states(owner, targetSubject, firstCursor, 100);
        assertThat(secondPage.path("items").size()).isEqualTo(100);
        assertThat(secondPage.path("hasMore").booleanValue()).isTrue();
        appendBlockIds(actualIds, secondPage, owner.userId(), expectedIds);

        JsonNode thirdPage = states(owner, targetSubject, secondPage.path("nextCursor").asText(), 100);
        assertThat(thirdPage.path("items").size()).isEqualTo(5);
        assertThat(thirdPage.path("hasMore").booleanValue()).isFalse();
        assertThat(thirdPage.path("nextCursor").isNull()).isTrue();
        appendBlockIds(actualIds, thirdPage, owner.userId(), expectedIds);

        assertThat(actualIds).hasSize(205).doesNotHaveDuplicates().isSorted();
        assertThat(actualIds).containsExactlyElementsOf(expectedIds.stream().map(UUID::toString).sorted().toList());

        mockMvc.perform(get("/api/reviews/states")
                        .header("Authorization", owner.authorization())
                        .param("subjectId", otherSubject.toString())
                        .param("cursor", firstCursor)
                        .param("limit", "100"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));
    }

    @Test
    void rejectsUnauthenticatedAndForeignSubjectStateReads() throws Exception {
        Owner owner = owner("review-states-owner-scope");
        Owner otherOwner = owner("review-states-foreign-scope");
        UUID foreignSubject = subject(otherOwner, "Review states inaccessible");

        mockMvc.perform(get("/api/reviews/states").param("subjectId", foreignSubject.toString()))
                .andExpect(status().isUnauthorized());

        mockMvc.perform(get("/api/reviews/states")
                        .header("Authorization", owner.authorization())
                        .param("subjectId", foreignSubject.toString()))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("RESOURCE_NOT_FOUND"));

        UUID deletedSubject = subject(owner, "Review states deleted");
        subjectService.delete(owner.userId(), deletedSubject, 0);
        mockMvc.perform(get("/api/reviews/states")
                        .header("Authorization", owner.authorization())
                        .param("subjectId", deletedSubject.toString()))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("RESOURCE_NOT_FOUND"));
    }

    @Test
    void pagesDueReviewsAcrossActiveSubjectsWithCursorBoundToTheQuery() throws Exception {
        Owner owner = owner("review-queue");
        Owner otherOwner = owner("review-queue-other");
        UUID firstSubject = subject(owner, "Queue first");
        UUID secondSubject = subject(owner, "Queue second");
        UUID deletedSubject = subject(owner, "Queue deleted");
        UUID foreignSubject = subject(otherOwner, "Queue foreign");
        UUID parameterSetId = insertParameterSet();
        long namespace = UUID.randomUUID().getMostSignificantBits();
        Instant persistedDueAt = Instant.parse("2026-11-15T11:00:00.123456Z");
        Instant at = persistedDueAt.plusNanos(900);
        List<UUID> ids = java.util.stream.LongStream.rangeClosed(1, 9)
                .mapToObj(sequence -> new UUID(namespace, sequence)).toList();
        List<UUID> subjects = List.of(firstSubject, secondSubject, firstSubject, firstSubject, firstSubject,
                firstSubject, deletedSubject, foreignSubject, secondSubject);
        for (int index = 0; index < ids.size(); index++) {
            insertBlockAndState(index == 7 ? otherOwner.userId() : owner.userId(), subjects.get(index), ids.get(index),
                    parameterSetId, index == 5 ? at : null);
            jdbcTemplate.update("update review_states set due_at = ? where knowledge_block_id = ?",
                    index == 8 ? persistedDueAt.minusSeconds(1) : persistedDueAt, ids.get(index));
        }
        jdbcTemplate.update("update review_states set needs_learning = true where knowledge_block_id = ?", ids.get(2));
        jdbcTemplate.update("update review_states set mastered = true, stable_success_count = 3 where knowledge_block_id = ?", ids.get(3));
        jdbcTemplate.update("update review_states set due_at = ? where knowledge_block_id = ?",
                persistedDueAt.plusNanos(1000), ids.get(4));
        jdbcTemplate.update("update subjects set deleted_at = ? where id = ?", at, deletedSubject);
        jdbcTemplate.update("update knowledge_blocks set version = 7 where id = ?", ids.getFirst());

        var response = mockMvc.perform(get("/api/reviews/queue").header("Authorization", owner.authorization())
                        .param("at", at.toString()).param("limit", "2"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(2))
                .andExpect(jsonPath("$.items[0].knowledgeBlockId").value(ids.getLast().toString()))
                .andExpect(jsonPath("$.items[1].knowledgeBlockId").value(ids.getFirst().toString()))
                .andExpect(jsonPath("$.items[1].knowledgeBlockVersion").value(7))
                .andExpect(jsonPath("$.hasMore").value(true))
                .andReturn().getResponse();
        String cursor = objectMapper.readTree(response.getContentAsString()).path("nextCursor").asText();
        mockMvc.perform(get("/api/reviews/queue").header("Authorization", owner.authorization())
                        .param("at", at.toString()).param("cursor", cursor))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(1))
                .andExpect(jsonPath("$.items[0].knowledgeBlockId").value(ids.get(1).toString()))
                .andExpect(jsonPath("$.hasMore").value(false));
        mockMvc.perform(get("/api/reviews/queue").header("Authorization", owner.authorization())
                        .param("at", at.toString()).param("subjectId", firstSubject.toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(1))
                .andExpect(jsonPath("$.items[0].knowledgeBlockId").value(ids.getFirst().toString()));
        mockMvc.perform(get("/api/reviews/queue").header("Authorization", owner.authorization())
                        .param("at", at.toString()).param("subjectId", firstSubject.toString()).param("cursor", cursor))
                .andExpect(status().isBadRequest());
        mockMvc.perform(get("/api/reviews/queue").header("Authorization", owner.authorization())
                        .param("at", at.plusSeconds(1).toString()).param("cursor", cursor))
                .andExpect(status().isBadRequest());
        mockMvc.perform(get("/api/reviews/queue").header("Authorization", otherOwner.authorization())
                        .param("at", at.toString()).param("cursor", cursor))
                .andExpect(status().isBadRequest());
        mockMvc.perform(get("/api/reviews/queue").header("Authorization", owner.authorization())
                        .param("at", at.toString()).param("subjectId", foreignSubject.toString()))
                .andExpect(status().isNotFound());
    }

    private JsonNode states(Owner owner, UUID subjectId, String cursor, int limit) throws Exception {
        var request = get("/api/reviews/states")
                .header("Authorization", owner.authorization())
                .param("subjectId", subjectId.toString())
                .param("limit", Integer.toString(limit));
        if (cursor != null) {
            request.param("cursor", cursor);
        }
        String content = mockMvc.perform(request)
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return objectMapper.readTree(content);
    }

    private void appendBlockIds(List<String> ids, JsonNode page, UUID expectedUserId, List<UUID> expectedBlockIds) {
        page.path("items").forEach(item -> {
            assertThat(item.path("userId").asText()).isEqualTo(expectedUserId.toString());
            String blockId = item.path("knowledgeBlockId").asText();
            assertThat(expectedBlockIds).contains(UUID.fromString(blockId));
            ids.add(blockId);
        });
    }

    private UUID insertParameterSet() {
        List<UUID> existing = jdbcTemplate.query(
                "select id from review_parameter_sets where scheduler = 'FSRS_LITE' and version = 1",
                (resultSet, row) -> resultSet.getObject("id", UUID.class));
        if (!existing.isEmpty()) {
            return existing.getFirst();
        }
        UUID id = UUID.nameUUIDFromBytes("auralis-review-fsrs-lite-v1".getBytes(java.nio.charset.StandardCharsets.UTF_8));
        jdbcTemplate.update(
                "insert into review_parameter_sets(id, scheduler, version, parameters) values (?, 'FSRS_LITE', 1, '{}')",
                id);
        return id;
    }

    private void insertBlockAndState(UUID userId, UUID subjectId, UUID blockId, UUID parameterSetId, Instant deletedAt) {
        Instant now = Instant.now();
        jdbcTemplate.update(
                "insert into knowledge_blocks(id, user_id, subject_id, title, content, version, created_at, updated_at, deleted_at) "
                        + "values (?, ?, ?, ?, 'body', 0, ?, ?, ?)",
                blockId, userId, subjectId, "Block " + blockId, now, now, deletedAt);
        jdbcTemplate.update(
                "insert into review_states(id, user_id, knowledge_block_id, parameter_set_id, difficulty, stability, due_at, version, created_at, updated_at) "
                        + "values (?, ?, ?, ?, 5, 1, ?, 0, ?, ?)",
                UUID.randomUUID(), userId, blockId, parameterSetId, now, now, now);
    }

    private UUID blockId(long namespace, int group, int sequence) {
        return new UUID(namespace | group, Integer.toUnsignedLong(sequence));
    }

    private Owner owner(String prefix) {
        AuthResult result = AuthTestAccounts.register(identityService, "review-" + UUID.randomUUID() + "@example.test", PASSWORD,
                new DeviceCommand("device-" + UUID.randomUUID(), "Review Test", DevicePlatform.WEB));
        return new Owner(result.user().id(), "Bearer " + result.tokens().accessToken());
    }

    private UUID subject(Owner owner, String name) {
        return subjectService.create(owner.userId(), new SubjectCommand(
                name + " " + UUID.randomUUID(), null, null, "001")).id();
    }

    private record Owner(UUID userId, String authorization) { }
}
