package com.auralis.app;

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
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(classes = AuralisApplication.class)
@ActiveProfiles("test")
@AutoConfigureMockMvc
class SubjectStatsTests {

    private static final String PASSWORD = "correct horse battery staple";
    private static final ZoneId ZONE = ZoneId.of("America/New_York");

    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper objectMapper;
    @Autowired private IdentityService identityService;
    @Autowired private SubjectService subjectService;
    @Autowired private JdbcTemplate jdbcTemplate;

    @Test
    void aggregatesSubjectStatsByLocalDaysWithoutFanoutOrSoftDeleteLoss() throws Exception {
        Owner owner = owner("subject-stats-owner");
        Owner otherOwner = owner("subject-stats-other-owner");
        UUID subjectId = subject(owner, "Stats target");
        UUID otherSubjectId = subject(owner, "Stats other subject");
        UUID foreignSubjectId = subject(otherOwner, "Stats foreign subject");

        Instant capturedNow = Instant.now();
        LocalDate today = capturedNow.atZone(ZONE).toLocalDate();
        LocalDate firstDate = today.minusDays(6);
        Instant firstDayStart = firstDate.atStartOfDay(ZONE).toInstant();
        Instant exclusiveEnd = today.plusDays(1).atStartOfDay(ZONE).toInstant();
        UUID parameterSetId = insertParameterSet();

        insertSource(owner.userId(), subjectId, "FILE", false);
        insertSource(owner.userId(), subjectId, "TEXT", false);
        insertSource(owner.userId(), subjectId, "URL", false);
        insertSource(owner.userId(), subjectId, "FILE", true);
        insertSource(owner.userId(), otherSubjectId, "FILE", false);

        UUID firstBlock = UUID.randomUUID();
        UUID secondBlock = UUID.randomUUID();
        UUID thirdBlock = UUID.randomUUID();
        UUID fourthBlock = UUID.randomUUID();
        UUID fifthBlock = UUID.randomUUID();
        UUID foreignBlock = UUID.randomUUID();
        insertBlock(owner.userId(), subjectId, firstBlock, firstDayStart, false);
        insertBlock(owner.userId(), subjectId, secondBlock, firstDayStart.minusSeconds(10), false);
        insertBlock(owner.userId(), subjectId, thirdBlock, firstDayStart.minusSeconds(10), false);
        insertBlock(owner.userId(), subjectId, fourthBlock, firstDayStart.minusSeconds(10), false);
        insertBlock(owner.userId(), subjectId, fifthBlock, firstDayStart.minusSeconds(10), false);
        insertBlock(owner.userId(), subjectId, UUID.randomUUID(), exclusiveEnd, true);
        insertBlock(owner.userId(), otherSubjectId, UUID.randomUUID(), firstDayStart, false);
        insertBlock(otherOwner.userId(), foreignSubjectId, foreignBlock, firstDayStart, false);

        insertReviewState(owner.userId(), firstBlock, parameterSetId, capturedNow.minusSeconds(60));
        insertReviewState(owner.userId(), secondBlock, parameterSetId, capturedNow.plusSeconds(86400));
        insertReviewState(owner.userId(), thirdBlock, parameterSetId, capturedNow.plusSeconds(172800));

        insertReviewEvent(owner.userId(), firstBlock, "AGAIN", firstDayStart, 7, null, parameterSetId);
        insertReviewEvent(owner.userId(), firstBlock, "HARD", firstDayStart.plusSeconds(60), 0, "{}", parameterSetId);
        insertReviewEvent(owner.userId(), secondBlock, "GOOD", firstDayStart.plusSeconds(120), 0, null, parameterSetId);
        insertReviewEvent(owner.userId(), thirdBlock, "EASY", firstDayStart.plusSeconds(180), 0, null, parameterSetId);
        insertReviewEvent(owner.userId(), fifthBlock, "SKIP", firstDayStart.plusSeconds(240), 0, null, parameterSetId);
        insertReviewEvent(owner.userId(), firstBlock, "EASY", exclusiveEnd, 1, "{}", parameterSetId);
        insertReviewEvent(owner.userId(), foreignBlock, "GOOD", firstDayStart.plusSeconds(300), 0, null, parameterSetId);
        insertReviewEvent(owner.userId(), fourthBlock, "AGAIN", firstDayStart.minusSeconds(1), 0, null, parameterSetId);

        insertTask(owner.userId(), subjectId, "TODO", false, null);
        insertTask(owner.userId(), subjectId, "TODO", false, firstDayStart.plusSeconds(700));
        insertTask(owner.userId(), subjectId, "IN_PROGRESS", false, null);
        insertTask(owner.userId(), subjectId, "DONE", false, firstDayStart.plusSeconds(600));
        insertTask(owner.userId(), subjectId, "CANCELLED", false, null);
        insertTask(owner.userId(), subjectId, "DONE", false, exclusiveEnd);
        insertTask(owner.userId(), subjectId, "DONE", true, firstDayStart.plusSeconds(900));
        insertTask(owner.userId(), otherSubjectId, "DONE", false, firstDayStart.plusSeconds(900));

        JsonNode sevenDay = stats(owner, subjectId, 7, "America/New_York");
        assertThat(sevenDay.path("timeZone").asText()).isEqualTo("America/New_York");
        assertThat(sevenDay.path("from").asText()).isEqualTo(firstDate.toString());
        assertThat(sevenDay.path("to").asText()).isEqualTo(today.toString());
        assertThat(sevenDay.path("daily").size()).isEqualTo(7);
        assertThat(sevenDay.has("focusSeconds")).isFalse();

        JsonNode overview = sevenDay.path("overview");
        assertThat(overview.path("fileSourceCount").intValue()).isEqualTo(1);
        assertThat(overview.path("textSourceCount").intValue()).isEqualTo(1);
        assertThat(overview.path("urlSourceCount").intValue()).isEqualTo(1);
        assertThat(overview.path("activeKnowledgeBlockCount").intValue()).isEqualTo(5);
        assertThat(overview.path("newLearningCount").intValue()).isEqualTo(2);
        assertThat(overview.path("dueReviewCount").intValue()).isEqualTo(1);
        assertThat(overview.path("scheduledReviewCount").intValue()).isEqualTo(2);
        assertThat(overview.path("activeTaskCount").intValue()).isEqualTo(6);
        assertThat(overview.path("todoTaskCount").intValue()).isEqualTo(2);
        assertThat(overview.path("inProgressTaskCount").intValue()).isEqualTo(1);
        assertThat(overview.path("doneTaskCount").intValue()).isEqualTo(2);
        assertThat(overview.path("cancelledTaskCount").intValue()).isEqualTo(1);

        JsonNode firstDay = day(sevenDay, firstDate);
        assertThat(firstDay.path("nonSkipReviewEventCount").intValue()).isEqualTo(4);
        assertThat(firstDay.path("distinctReviewedKnowledgeBlockCount").intValue()).isEqualTo(3);
        assertThat(firstDay.path("firstLearningKnowledgeBlockCount").intValue()).isEqualTo(3);
        assertThat(firstDay.path("subsequentReviewKnowledgeBlockCount").intValue()).isEqualTo(1);
        assertThat(firstDay.path("createdKnowledgeBlockCount").intValue()).isEqualTo(1);
        assertThat(firstDay.path("completedTaskCount").intValue()).isEqualTo(2);
        assertThat(firstDay.has("focusSeconds")).isFalse();
        JsonNode emptyDay = day(sevenDay, firstDate.plusDays(1));
        assertThat(emptyDay.path("nonSkipReviewEventCount").intValue()).isZero();
        assertThat(emptyDay.path("createdKnowledgeBlockCount").intValue()).isZero();

        JsonNode ratings = sevenDay.path("ratingCounts");
        assertThat(ratings.path("againCount").intValue()).isEqualTo(1);
        assertThat(ratings.path("hardCount").intValue()).isEqualTo(1);
        assertThat(ratings.path("goodCount").intValue()).isEqualTo(1);
        assertThat(ratings.path("easyCount").intValue()).isEqualTo(1);

        JsonNode thirtyDay = stats(owner, subjectId, 30, "America/New_York");
        assertThat(thirtyDay.path("daily").size()).isEqualTo(30);
        assertThat(thirtyDay.path("from").asText()).isEqualTo(today.minusDays(29).toString());
        assertThat(thirtyDay.path("ratingCounts").path("againCount").intValue()).isEqualTo(2);
        assertThat(thirtyDay.path("ratingCounts").path("hardCount").intValue()).isEqualTo(1);
        assertThat(thirtyDay.path("ratingCounts").path("goodCount").intValue()).isEqualTo(1);
        assertThat(thirtyDay.path("ratingCounts").path("easyCount").intValue()).isEqualTo(1);
    }

    @Test
    void validatesSubjectScopeDayCountAndIanaTimeZone() throws Exception {
        Owner owner = owner("subject-stats-validation");
        Owner otherOwner = owner("subject-stats-foreign");
        UUID subjectId = subject(owner, "Stats validation");
        UUID foreignSubjectId = subject(otherOwner, "Stats validation foreign");

        mockMvc.perform(get("/api/stats/subjects/{subjectId}", subjectId)
                        .header("Authorization", owner.authorization())
                        .param("days", "14")
                        .param("timeZone", "UTC"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));

        mockMvc.perform(get("/api/stats/subjects/{subjectId}", subjectId)
                        .header("Authorization", owner.authorization())
                        .param("days", "7")
                        .param("timeZone", "Not/A-Time-Zone"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));

        mockMvc.perform(get("/api/stats/subjects/{subjectId}", foreignSubjectId)
                        .header("Authorization", owner.authorization())
                        .param("days", "7")
                        .param("timeZone", "UTC"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("RESOURCE_NOT_FOUND"));

        UUID deletedSubjectId = subject(owner, "Stats deleted subject");
        subjectService.delete(owner.userId(), deletedSubjectId, 0);
        mockMvc.perform(get("/api/stats/subjects/{subjectId}", deletedSubjectId)
                        .header("Authorization", owner.authorization())
                        .param("days", "7")
                        .param("timeZone", "UTC"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("RESOURCE_NOT_FOUND"));
    }

    private JsonNode stats(Owner owner, UUID subjectId, int days, String timeZone) throws Exception {
        String content = mockMvc.perform(get("/api/stats/subjects/{subjectId}", subjectId)
                        .header("Authorization", owner.authorization())
                        .param("days", Integer.toString(days))
                        .param("timeZone", timeZone))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return objectMapper.readTree(content);
    }

    private JsonNode day(JsonNode response, LocalDate date) {
        for (JsonNode item : response.path("daily")) {
            if (date.toString().equals(item.path("date").asText())) {
                return item;
            }
        }
        throw new AssertionError("Missing daily stats for " + date);
    }

    private UUID insertParameterSet() {
        var existing = jdbcTemplate.query(
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

    private void insertSource(UUID userId, UUID subjectId, String type, boolean deleted) {
        Instant now = Instant.now();
        jdbcTemplate.update(
                "insert into sources(id, user_id, type, subject_id, title, ingestion_status, ingestion_revision, version, created_at, updated_at, deleted_at) "
                        + "values (?, ?, ?, ?, ?, 'PENDING', ?, 0, ?, ?, ?)",
                UUID.randomUUID(), userId, type, subjectId, type + " source", UUID.randomUUID(), now, now,
                deleted ? now : null);
    }

    private void insertBlock(UUID userId, UUID subjectId, UUID blockId, Instant createdAt, boolean deleted) {
        Instant deletedAt = deleted ? Instant.now() : null;
        jdbcTemplate.update(
                "insert into knowledge_blocks(id, user_id, subject_id, title, content, version, created_at, updated_at, deleted_at) "
                        + "values (?, ?, ?, ?, 'body', 0, ?, ?, ?)",
                blockId, userId, subjectId, "Stats block " + blockId, createdAt, createdAt, deletedAt);
    }

    private void insertReviewState(UUID userId, UUID blockId, UUID parameterSetId, Instant dueAt) {
        Instant now = Instant.now();
        jdbcTemplate.update(
                "insert into review_states(id, user_id, knowledge_block_id, parameter_set_id, difficulty, stability, due_at, version, created_at, updated_at) "
                        + "values (?, ?, ?, ?, 5, 1, ?, 0, ?, ?)",
                UUID.randomUUID(), userId, blockId, parameterSetId, dueAt, now, now);
    }

    private void insertReviewEvent(UUID userId, UUID blockId, String rating, Instant reviewedAt, long baseVersion,
                                   String beforeState, UUID parameterSetId) {
        jdbcTemplate.update(
                "insert into review_events(id, user_id, knowledge_block_id, client_event_id, rating, reviewed_at, duration_seconds, base_version, scheduler, scheduler_version, parameter_set_id, before_state, after_state) "
                        + "values (?, ?, ?, ?, ?, ?, 30, ?, 'FSRS_LITE', 1, ?, ?, '{}')",
                UUID.randomUUID(), userId, blockId, UUID.randomUUID(), rating, reviewedAt, baseVersion,
                parameterSetId, beforeState);
    }

    private void insertTask(UUID userId, UUID subjectId, String status, boolean deleted, Instant completedAt) {
        Instant now = Instant.now();
        jdbcTemplate.update(
                "insert into tasks(id, user_id, subject_id, title, status, sort_key, version, created_at, updated_at, deleted_at, completed_at) "
                        + "values (?, ?, ?, ?, ?, '', 0, ?, ?, ?, ?)",
                UUID.randomUUID(), userId, subjectId, "Stats task " + UUID.randomUUID(), status, now, now,
                deleted ? now : null, completedAt);
    }

    private Owner owner(String prefix) {
        AuthResult result = identityService.register(
                "stats-" + UUID.randomUUID() + "@example.test", PASSWORD, "Stats Test",
                new DeviceCommand("device-" + UUID.randomUUID(), "Stats Test", DevicePlatform.WEB));
        return new Owner(result.user().id(), "Bearer " + result.tokens().accessToken());
    }

    private UUID subject(Owner owner, String name) {
        return subjectService.create(owner.userId(), new SubjectCommand(
                name + " " + UUID.randomUUID(), null, null, "001")).id();
    }

    private record Owner(UUID userId, String authorization) { }
}
