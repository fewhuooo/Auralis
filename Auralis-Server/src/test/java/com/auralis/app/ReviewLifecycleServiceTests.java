package com.auralis.app;

import com.auralis.app.identity.AuthResult;
import com.auralis.app.identity.DeviceCommand;
import com.auralis.app.identity.DevicePlatform;
import com.auralis.app.identity.IdentityService;
import com.auralis.app.knowledge.KnowledgeBlockCommand;
import com.auralis.app.knowledge.KnowledgeBlockContentHash;
import com.auralis.app.knowledge.KnowledgeBlockService;
import com.auralis.app.review.ReviewLifecycleDtos;
import com.auralis.app.review.ReviewLifecycleRating;
import com.auralis.app.subject.SubjectCommand;
import com.auralis.app.subject.SubjectService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(classes = AuralisApplication.class)
@ActiveProfiles("test")
@AutoConfigureMockMvc
class ReviewLifecycleServiceTests {
    private static final String PASSWORD = "correct horse battery staple";

    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper objectMapper;
    @Autowired private IdentityService identityService;
    @Autowired private SubjectService subjectService;
    @Autowired private KnowledgeBlockService knowledgeBlockService;
    @Autowired private JdbcTemplate jdbcTemplate;

    @Test
    void firstLearningCompletionStartsThreeDayScheduleWithoutStableProgress() throws Exception {
        Owner owner = owner("review-lifecycle-first-learning");
        UUID subjectId = subjectService.create(owner.userId(), new SubjectCommand(
                "Lifecycle subject", null, null, "001")).id();
        var block = knowledgeBlockService.create(owner.userId(), new KnowledgeBlockCommand(
                subjectId, null, "Lifecycle block", "body", null));
        UUID commandId = UUID.randomUUID();

        JsonNode response = postCommand(owner, "/api/reviews/lifecycle/learning-completions",
                learningCompletion(commandId, block.id(), block.version(), 0, block.content(), null));

        assertThat(response.path("clientCommandId").asText()).isEqualTo(commandId.toString());
        assertThat(response.path("action").asText()).isEqualTo("LEARNING_COMPLETED");
        assertThat(response.path("knowledgeBlockVersion").longValue()).isEqualTo(block.version());
        assertThat(response.path("effectiveReview").isNull()).isTrue();
        JsonNode state = response.path("state");
        assertThat(state.path("needsLearning").booleanValue()).isFalse();
        assertThat(state.path("mastered").booleanValue()).isFalse();
        assertThat(state.path("stableSuccessCount").intValue()).isZero();
        assertThat(state.path("nextReviewStage").asText()).isEqualTo("CROSS_DAY");
        assertThat(Duration.between(Instant.parse(response.path("occurredAt").asText()),
                Instant.parse(state.path("dueAt").asText()))).isEqualTo(Duration.ofDays(3));
        JsonNode stats = subjectStats(owner, subjectId);
        JsonNode today = day(stats, Instant.now());
        assertThat(today.path("learningCompletionCount").longValue()).isEqualTo(1);
        assertThat(today.path("distinctStudiedKnowledgeBlockCount").longValue()).isEqualTo(1);

        JsonNode states = subjectStates(owner, subjectId);
        assertThat(states.path("items").size()).isEqualTo(1);
        assertThat(Instant.parse(states.path("items").get(0).path("dueAt").asText()))
                .isEqualTo(Instant.parse(state.path("dueAt").asText()));
    }

    @Test
    void lifecycleVersionFieldsAreRequiredAtTheHttpBoundary() throws Exception {
        Owner owner = owner("lifecycle-required-versions");
        String commonFields = "\"clientCommandId\":\"" + UUID.randomUUID() + "\","
                + "\"knowledgeBlockId\":\"" + UUID.randomUUID() + "\","
                + "\"contentHash\":\"" + "0".repeat(64) + "\"";

        mockMvc.perform(post("/api/reviews/lifecycle/learning-completions")
                        .header("Authorization", owner.authorization())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{" + commonFields + ",\"baseVersion\":0}"))
                .andExpect(status().isBadRequest());
        mockMvc.perform(post("/api/reviews/lifecycle/learning-completions")
                        .header("Authorization", owner.authorization())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{" + commonFields + ",\"knowledgeBlockVersion\":0}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void rejectsAStaleContentHashWhenTheKnowledgeBlockVersionMatches() throws Exception {
        Owner owner = owner("stale-content-hash");
        UUID subjectId = subjectService.create(owner.userId(), new SubjectCommand(
                "Stale hash subject", null, null, "001")).id();
        var block = knowledgeBlockService.create(owner.userId(), new KnowledgeBlockCommand(
                subjectId, null, "Stale hash block", "current body", null));

        mockMvc.perform(post("/api/reviews/lifecycle/learning-completions")
                        .header("Authorization", owner.authorization())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new ReviewLifecycleDtos.LearningCompletionRequest(
                                UUID.randomUUID(), block.id(), block.version(), 0L, "0".repeat(64),
                                null, null, true))))
                .andExpect(status().isConflict())
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("$.code")
                        .value("RESOURCE_VERSION_CONFLICT"));
        assertThat(jdbcTemplate.queryForObject("select count(*) from review_lifecycle_commands "
                        + "where user_id = ? and knowledge_block_id = ?", Long.class, owner.userId(), block.id()))
                .isZero();
        assertThat(jdbcTemplate.queryForObject("select count(*) from review_states "
                + "where user_id = ? and knowledge_block_id = ?", Long.class, owner.userId(), block.id())).isZero();
    }

    @Test
    void lifecycleAttemptRejectsLegacyOnlyRatings() throws Exception {
        Owner owner = owner("lifecycle-rating-boundary");
        UUID subjectId = subjectService.create(owner.userId(), new SubjectCommand(
                "Rating subject", null, null, "001")).id();
        var block = knowledgeBlockService.create(owner.userId(), new KnowledgeBlockCommand(
                subjectId, null, "Rating block", "body", null));
        JsonNode learning = postCommand(owner, "/api/reviews/lifecycle/learning-completions",
                learningCompletion(UUID.randomUUID(), block.id(), block.version(), 0, block.content(), null));

        String easyRatingRequest = objectMapper.writeValueAsString(attempt(UUID.randomUUID(), block.id(), block.version(),
                learning.path("state").path("version").longValue(), block.content(), UUID.randomUUID(),
                ReviewLifecycleRating.GOOD)).replace("\"rating\":\"GOOD\"", "\"rating\":\"EASY\"");
        mockMvc.perform(post("/api/reviews/lifecycle/attempts")
                        .header("Authorization", owner.authorization())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(easyRatingRequest))
                .andExpect(status().isBadRequest());
    }

    @Test
    void completionReplayIsFrozenAndDuplicateFirstLearningRequiresReopen() throws Exception {
        Owner owner = owner("first-learning-replay");
        UUID subjectId = subjectService.create(owner.userId(), new SubjectCommand(
                "Replay subject", null, null, "001")).id();
        var block = knowledgeBlockService.create(owner.userId(), new KnowledgeBlockCommand(
                subjectId, null, "Replay block", "body", null));
        UUID commandId = UUID.randomUUID();
        var request = learningCompletion(commandId, block.id(), block.version(), 0, block.content(), null);

        JsonNode first = postCommand(owner, "/api/reviews/lifecycle/learning-completions", request);
        JsonNode replay = postCommand(owner, "/api/reviews/lifecycle/learning-completions", request);
        assertThat(replay).isEqualTo(first);

        var changedPayload = learningCompletion(commandId, block.id(), block.version(), 1, block.content(), null);
        mockMvc.perform(post("/api/reviews/lifecycle/learning-completions")
                        .header("Authorization", owner.authorization())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(changedPayload)))
                .andExpect(status().isConflict())
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("$.code")
                        .value("MUTATION_REJECTED"));

        var newCommand = learningCompletion(UUID.randomUUID(), block.id(), block.version(), 0, block.content(), null);
        mockMvc.perform(post("/api/reviews/lifecycle/learning-completions")
                        .header("Authorization", owner.authorization())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(newCommand)))
                .andExpect(status().isConflict())
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("$.code")
                        .value("MUTATION_REJECTED"));
    }

    @Test
    void explicitOccurredAtControlsLearningScheduleAndDailyStats() throws Exception {
        Owner owner = owner("offline-learning-time");
        UUID subjectId = subjectService.create(owner.userId(), new SubjectCommand(
                "Offline subject", null, null, "001")).id();
        var block = knowledgeBlockService.create(owner.userId(), new KnowledgeBlockCommand(
                subjectId, null, "Offline block", "body", null));
        Instant studiedAt = Instant.now().truncatedTo(ChronoUnit.MICROS).minus(36, ChronoUnit.HOURS);
        UUID commandId = UUID.randomUUID();
        Instant receiptWindowStart = Instant.now().minusSeconds(1);

        JsonNode completed = postCommand(owner, "/api/reviews/lifecycle/learning-completions",
                offline(learningCompletion(commandId, block.id(), block.version(), 0, block.content(), null),
                        studiedAt, true));
        Instant receiptWindowEnd = Instant.now().plusSeconds(1);

        assertThat(Instant.parse(completed.path("occurredAt").asText())).isEqualTo(studiedAt);
        assertThat(Instant.parse(completed.path("state").path("lastPracticeAt").asText())).isEqualTo(studiedAt);
        assertThat(Instant.parse(completed.path("state").path("dueAt").asText()))
                .isEqualTo(studiedAt.plus(3, ChronoUnit.DAYS));
        Instant commandCreatedAt = jdbcTemplate.queryForObject("select created_at from review_lifecycle_commands "
                        + "where user_id = ? and client_command_id = ?", java.sql.Timestamp.class,
                owner.userId(), commandId).toInstant();
        Instant stateCreatedAt = Instant.parse(completed.path("state").path("createdAt").asText());
        assertThat(commandCreatedAt).isBetween(receiptWindowStart, receiptWindowEnd)
                .isAfter(studiedAt);
        assertThat(stateCreatedAt).isBetween(receiptWindowStart, receiptWindowEnd)
                .isAfter(studiedAt);
        JsonNode stats = subjectStats(owner, subjectId);
        assertThat(day(stats, studiedAt).path("learningCompletionCount").longValue()).isEqualTo(1);
        assertThat(day(stats, Instant.now()).path("learningCompletionCount").longValue()).isZero();
    }

    @Test
    void explicitOccurredAtCannotBeTooFarInFutureOrBeforePriorCommand() throws Exception {
        Owner owner = owner("offline-time-validation");
        UUID subjectId = subjectService.create(owner.userId(), new SubjectCommand(
                "Time validation subject", null, null, "001")).id();
        var futureBlock = knowledgeBlockService.create(owner.userId(), new KnowledgeBlockCommand(
                subjectId, null, "Future block", "body", null));
        Instant tooFarAhead = Instant.now().plus(10, ChronoUnit.MINUTES);
        mockMvc.perform(post("/api/reviews/lifecycle/learning-completions")
                        .header("Authorization", owner.authorization())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(offline(learningCompletion(
                                UUID.randomUUID(), futureBlock.id(), futureBlock.version(), 0,
                                futureBlock.content(), null), tooFarAhead, true))))
                .andExpect(status().isBadRequest())
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("$.code")
                        .value("VALIDATION_FAILED"));
        assertThat(jdbcTemplate.queryForObject("select count(*) from review_lifecycle_commands where user_id = ?",
                Long.class, owner.userId())).isZero();

        var block = knowledgeBlockService.create(owner.userId(), new KnowledgeBlockCommand(
                subjectId, null, "Causal block", "body", null));
        Instant firstAt = Instant.now().truncatedTo(ChronoUnit.MICROS).minus(2, ChronoUnit.HOURS);
        JsonNode first = postCommand(owner, "/api/reviews/lifecycle/learning-completions", offline(
                learningCompletion(UUID.randomUUID(), block.id(), block.version(), 0, block.content(), null),
                firstAt, true));
        Instant earlierAt = firstAt.minus(1, ChronoUnit.SECONDS);
        mockMvc.perform(post("/api/reviews/lifecycle/learning-reopens")
                        .header("Authorization", owner.authorization())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(offline(new ReviewLifecycleDtos.LearningReopenRequest(
                                UUID.randomUUID(), block.id(), block.version(),
                                first.path("state").path("version").longValue(),
                                KnowledgeBlockContentHash.sha256(block.content()), null, null, null), earlierAt, false))))
                .andExpect(status().isConflict())
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("$.code")
                        .value("RESOURCE_VERSION_CONFLICT"));
        assertThat(jdbcTemplate.queryForObject("select count(*) from review_lifecycle_commands "
                        + "where user_id = ? and knowledge_block_id = ?", Long.class, owner.userId(), block.id()))
                .isEqualTo(1);
    }

    @Test
    void expectedStatePresenceDistinguishesAbsentFromExistingVersionZero() throws Exception {
        Owner owner = owner("offline-state-presence");
        UUID subjectId = subjectService.create(owner.userId(), new SubjectCommand(
                "Presence subject", null, null, "001")).id();
        var existingBlock = knowledgeBlockService.create(owner.userId(), new KnowledgeBlockCommand(
                subjectId, null, "Existing block", "body", null));
        JsonNode learned = postCommand(owner, "/api/reviews/lifecycle/learning-completions",
                learningCompletion(UUID.randomUUID(), existingBlock.id(), existingBlock.version(), 0,
                        existingBlock.content(), null));
        assertThat(learned.path("state").path("version").longValue()).isZero();

        mockMvc.perform(post("/api/reviews/lifecycle/learning-reopens")
                        .header("Authorization", owner.authorization())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(offline(new ReviewLifecycleDtos.LearningReopenRequest(
                                UUID.randomUUID(), existingBlock.id(), existingBlock.version(), 0L,
                                KnowledgeBlockContentHash.sha256(existingBlock.content()), null, null, null),
                                Instant.now().truncatedTo(ChronoUnit.MICROS), true))))
                .andExpect(status().isConflict())
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("$.code")
                        .value("RESOURCE_VERSION_CONFLICT"));

        var absentBlock = knowledgeBlockService.create(owner.userId(), new KnowledgeBlockCommand(
                subjectId, null, "Absent block", "body", null));
        mockMvc.perform(post("/api/reviews/lifecycle/learning-completions")
                        .header("Authorization", owner.authorization())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(offline(learningCompletion(
                                UUID.randomUUID(), absentBlock.id(), absentBlock.version(), 0,
                                absentBlock.content(), null), Instant.now().truncatedTo(ChronoUnit.MICROS), false))))
                .andExpect(status().isConflict())
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("$.code")
                        .value("RESOURCE_VERSION_CONFLICT"));
        assertThat(jdbcTemplate.queryForObject("select count(*) from review_states where user_id = ? "
                + "and knowledge_block_id = ?", Long.class, owner.userId(), absentBlock.id())).isZero();

        var reopenBlock = knowledgeBlockService.create(owner.userId(), new KnowledgeBlockCommand(
                subjectId, null, "Offline reopen block", "body", null));
        Instant reopenedAt = Instant.now().truncatedTo(ChronoUnit.MICROS).minus(1, ChronoUnit.HOURS);
        JsonNode reopened = postCommand(owner, "/api/reviews/lifecycle/learning-reopens", offline(
                new ReviewLifecycleDtos.LearningReopenRequest(UUID.randomUUID(), reopenBlock.id(),
                        reopenBlock.version(), 0L, KnowledgeBlockContentHash.sha256(reopenBlock.content()), null, null, null),
                reopenedAt, true));
        assertThat(Instant.parse(reopened.path("occurredAt").asText())).isEqualTo(reopenedAt);
        assertThat(Instant.parse(reopened.path("state").path("dueAt").asText())).isEqualTo(reopenedAt);
        assertThat(reopened.path("state").path("needsLearning").booleanValue()).isTrue();
    }

    @Test
    void explicitCommandTimeParticipatesInReceiptFingerprintButLegacyShapeStaysStable() throws Exception {
        Owner owner = owner("offline-time-idempotency");
        UUID subjectId = subjectService.create(owner.userId(), new SubjectCommand(
                "Idempotency subject", null, null, "001")).id();
        var legacyBlock = knowledgeBlockService.create(owner.userId(), new KnowledgeBlockCommand(
                subjectId, null, "Legacy request block", "body", null));
        UUID legacyCommandId = UUID.randomUUID();
        var legacyRequest = learningCompletion(legacyCommandId, legacyBlock.id(), legacyBlock.version(),
                0, legacyBlock.content(), null);
        JsonNode legacyResponse = postCommand(owner, "/api/reviews/lifecycle/learning-completions", legacyRequest);
        assertThat(postCommand(owner, "/api/reviews/lifecycle/learning-completions", legacyRequest))
                .isEqualTo(legacyResponse);
        String storedLegacyFingerprint = jdbcTemplate.queryForObject("select request_payload from "
                        + "review_lifecycle_commands where user_id = ? and client_command_id = ?",
                String.class, owner.userId(), legacyCommandId);
        JsonNode legacyFingerprint = objectMapper.readTree(storedLegacyFingerprint);
        assertThat(legacyFingerprint.has("occurredAt")).isFalse();
        assertThat(legacyFingerprint.has("expectedStateAbsent")).isFalse();

        var block = knowledgeBlockService.create(owner.userId(), new KnowledgeBlockCommand(
                subjectId, null, "Explicit request block", "body", null));
        UUID commandId = UUID.randomUUID();
        Instant firstAt = Instant.now().truncatedTo(ChronoUnit.MICROS).minus(1, ChronoUnit.HOURS);
        var request = offline(learningCompletion(commandId, block.id(), block.version(), 0, block.content(), null),
                firstAt, true);
        JsonNode response = postCommand(owner, "/api/reviews/lifecycle/learning-completions", request);
        assertThat(postCommand(owner, "/api/reviews/lifecycle/learning-completions", request)).isEqualTo(response);

        mockMvc.perform(post("/api/reviews/lifecycle/learning-completions")
                        .header("Authorization", owner.authorization())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(offline(learningCompletion(commandId, block.id(),
                                block.version(), 0, block.content(), null), firstAt.plusSeconds(1), true))))
                .andExpect(status().isConflict())
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("$.code")
                        .value("MUTATION_REJECTED"));
    }

    @Test
    void pendingReviewHistoryAndReceiptExposePreSelectionSchedulingBaseline() throws Exception {
        Owner owner = owner("review-scheduling-baseline");
        UUID subjectId = subjectService.create(owner.userId(), new SubjectCommand(
                "Baseline subject", null, null, "001")).id();
        var block = knowledgeBlockService.create(owner.userId(), new KnowledgeBlockCommand(
                subjectId, null, "Baseline block", "body", null));
        Instant learningAt = Instant.now().truncatedTo(ChronoUnit.MICROS).minus(35, ChronoUnit.DAYS);
        JsonNode learned = postCommand(owner, "/api/reviews/lifecycle/learning-completions", offline(
                learningCompletion(UUID.randomUUID(), block.id(), block.version(), 0, block.content(), null),
                learningAt, true));
        Instant dueAt = learningAt.minus(1, ChronoUnit.DAYS);
        Instant lastPracticeAt = learningAt.minus(31, ChronoUnit.DAYS);
        jdbcTemplate.update("update review_states set stable_success_count = 2, next_review_stage = 'CROSS_DAY', "
                        + "due_at = ?, last_practice_at = ?, stability = ? where user_id = ? and knowledge_block_id = ?",
                java.sql.Timestamp.from(dueAt), java.sql.Timestamp.from(lastPracticeAt), 12.5,
                owner.userId(), block.id());
        UUID reviewId = UUID.randomUUID();
        Instant selectedAt = Instant.now().truncatedTo(ChronoUnit.MICROS);
        JsonNode selected = postCommand(owner, "/api/reviews/lifecycle/attempts", offline(attempt(
                UUID.randomUUID(), block.id(), block.version(), learned.path("state").path("version").longValue(),
                block.content(), reviewId, ReviewLifecycleRating.GOOD), selectedAt, false));

        JsonNode baseline = selected.path("effectiveReview").path("schedulingBaseline");
        assertThat(baseline.path("dueAt").asText()).isEqualTo(dueAt.toString());
        assertThat(baseline.path("mastered").booleanValue()).isFalse();
        assertThat(baseline.path("stableSuccessCount").intValue()).isEqualTo(2);
        assertThat(baseline.path("nextReviewStage").asText()).isEqualTo("CROSS_DAY");
        assertThat(Instant.parse(baseline.path("lastPracticeAt").asText())).isEqualTo(lastPracticeAt);
        assertThat(baseline.path("stability").doubleValue()).isEqualTo(12.5);

        JsonNode history = history(owner, block.id());
        assertThat(history.path("protocolVersion").intValue()).isEqualTo(2);
        assertThat(history.path("effectiveReviews").get(0).path("schedulingBaseline")).isEqualTo(baseline);

        Instant confirmedAt = selectedAt.plusSeconds(5);
        JsonNode confirmed = postCommand(owner, "/api/reviews/lifecycle/attempts/" + reviewId + "/confirmations",
                offline(resolution(UUID.randomUUID(), block.id(), block.version(),
                        selected.path("state").path("version").longValue(), block.content()), confirmedAt, false));
        assertThat(Instant.parse(confirmed.path("occurredAt").asText())).isEqualTo(confirmedAt);
        assertThat(Instant.parse(confirmed.path("effectiveReview").path("resolvedAt").asText()))
                .isEqualTo(confirmedAt);
        assertThat(confirmed.path("state").path("stableSuccessCount").intValue()).isEqualTo(3);
        assertThat(confirmed.path("state").path("mastered").booleanValue()).isFalse();
        assertThat(confirmed.path("state").path("nextReviewStage").asText()).isEqualTo("FINAL_VERIFICATION");
        assertThat(confirmed.path("effectiveReview").path("schedulingBaseline")).isEqualTo(baseline);

        Instant correctedAt = confirmedAt.plusSeconds(5);
        JsonNode corrected = postCommand(owner, "/api/reviews/lifecycle/attempts/" + reviewId + "/corrections",
                offline(resolution(UUID.randomUUID(), block.id(), block.version(),
                        confirmed.path("state").path("version").longValue(), block.content()), correctedAt, false));
        assertThat(Instant.parse(corrected.path("occurredAt").asText())).isEqualTo(correctedAt);
        assertThat(Instant.parse(corrected.path("effectiveReview").path("resolvedAt").asText()))
                .isEqualTo(correctedAt);
        assertThat(Instant.parse(corrected.path("state").path("dueAt").asText()))
                .isEqualTo(correctedAt.plus(10, ChronoUnit.MINUTES));
        assertThat(corrected.path("effectiveReview").path("effectiveRating").asText()).isEqualTo("AGAIN");
    }

    @Test
    void exportsSchedulingParityFixturesWhenRequested() throws Exception {
        if (!Boolean.getBoolean("auralis.review.fixture.export")) return;

        Owner owner = owner("scheduling-parity-fixture");
        UUID subjectId = subjectService.create(owner.userId(), new SubjectCommand(
                "Scheduling fixture subject", null, null, "001")).id();
        var fixtures = objectMapper.createArrayNode();

        var firstBlock = knowledgeBlockService.create(owner.userId(), new KnowledgeBlockCommand(
                subjectId, null, "First learning fixture", "body", null));
        Instant firstAt = Instant.now().truncatedTo(ChronoUnit.MICROS).minus(1, ChronoUnit.HOURS);
        JsonNode first = postCommand(owner, "/api/reviews/lifecycle/learning-completions", offline(
                learningCompletion(UUID.randomUUID(), firstBlock.id(), firstBlock.version(), 0,
                        firstBlock.content(), null), firstAt, true));
        fixtures.add(fixtureScenario("first-learning", fixtureEvent("LEARNING_COMPLETED", null, firstAt,
                null, null, first)));

        for (int stableCount = 0; stableCount <= 3; stableCount++) {
            fixtures.add(fixtureAttempt(owner, subjectId, "due-good-stable-" + stableCount,
                    stableCount, stableCount == 3 ? "FINAL_VERIFICATION" : "CROSS_DAY",
                    false, -1, ReviewLifecycleRating.GOOD));
        }
        fixtures.add(fixtureAttempt(owner, subjectId, "early-good", 1, "EARLY_RECALL",
                false, 86_400, ReviewLifecycleRating.GOOD));
        fixtures.add(fixtureAttempt(owner, subjectId, "ahead-of-due-good", 1, "CROSS_DAY",
                false, 7 * 86_400, ReviewLifecycleRating.GOOD));
        fixtures.add(fixtureAttempt(owner, subjectId, "mastered-good", 3, null,
                true, 30 * 86_400, ReviewLifecycleRating.GOOD));
        fixtures.add(fixtureAttempt(owner, subjectId, "hard", 1, "CROSS_DAY",
                false, -1, ReviewLifecycleRating.HARD));
        fixtures.add(fixtureAttempt(owner, subjectId, "again", 1, "CROSS_DAY",
                false, -1, ReviewLifecycleRating.AGAIN));
        fixtures.add(fixtureResolutionFlow(owner, subjectId));
        fixtures.add(fixtureRelearnFlow(owner, subjectId));
        fixtures.add(fixtureReopenFlow(owner, subjectId));

        Path output = Path.of(System.getProperty("auralis.review.fixture.path"));
        Files.createDirectories(output.toAbsolutePath().normalize().getParent());
        Files.writeString(output, objectMapper.writerWithDefaultPrettyPrinter()
                .writeValueAsString(fixtures) + System.lineSeparator());
        assertThat(Files.exists(output)).isTrue();
    }

    private ObjectNode fixtureAttempt(Owner owner, UUID subjectId, String name, int stableCount,
                                      String nextStage, boolean mastered, long dueOffsetSeconds,
                                      ReviewLifecycleRating rating) throws Exception {
        var block = knowledgeBlockService.create(owner.userId(), new KnowledgeBlockCommand(
                subjectId, null, "Fixture " + name, "body", null));
        Instant selectedAt = Instant.now().truncatedTo(ChronoUnit.MICROS).minus(1, ChronoUnit.HOURS);
        Instant learnedAt = selectedAt.minus(40, ChronoUnit.DAYS);
        JsonNode learned = postCommand(owner, "/api/reviews/lifecycle/learning-completions", offline(
                learningCompletion(UUID.randomUUID(), block.id(), block.version(), 0, block.content(), null),
                learnedAt, true));
        Instant dueAt = selectedAt.plusSeconds(dueOffsetSeconds);
        jdbcTemplate.update("update review_states set stable_success_count = ?, next_review_stage = ?, mastered = ?, "
                        + "due_at = ?, last_practice_at = ?, stability = ? where user_id = ? and knowledge_block_id = ?",
                stableCount, nextStage, mastered, java.sql.Timestamp.from(dueAt),
                java.sql.Timestamp.from(learnedAt), 12.5, owner.userId(), block.id());
        JsonNode inputState = history(owner, block.id()).path("state");
        UUID reviewId = UUID.randomUUID();
        JsonNode selected = postCommand(owner, "/api/reviews/lifecycle/attempts", offline(attempt(
                UUID.randomUUID(), block.id(), block.version(), inputState.path("version").longValue(),
                block.content(), reviewId, rating), selectedAt, false));
        JsonNode baseline = selected.path("effectiveReview").path("schedulingBaseline");
        return fixtureScenario(name, fixtureEvent("REVIEW_SELECTED", rating.name(), selectedAt,
                inputState, baseline, selected));
    }

    private ObjectNode fixtureResolutionFlow(Owner owner, UUID subjectId) throws Exception {
        var block = knowledgeBlockService.create(owner.userId(), new KnowledgeBlockCommand(
                subjectId, null, "Fixture confirmation correction", "body", null));
        Instant selectedAt = Instant.now().truncatedTo(ChronoUnit.MICROS).minus(1, ChronoUnit.HOURS);
        Instant learnedAt = selectedAt.minus(40, ChronoUnit.DAYS);
        JsonNode learned = postCommand(owner, "/api/reviews/lifecycle/learning-completions", offline(
                learningCompletion(UUID.randomUUID(), block.id(), block.version(), 0, block.content(), null),
                learnedAt, true));
        jdbcTemplate.update("update review_states set stable_success_count = 2, next_review_stage = 'CROSS_DAY', "
                        + "due_at = ?, last_practice_at = ?, stability = ? where user_id = ? and knowledge_block_id = ?",
                java.sql.Timestamp.from(selectedAt.minusSeconds(1)), java.sql.Timestamp.from(learnedAt),
                12.5, owner.userId(), block.id());
        JsonNode inputState = history(owner, block.id()).path("state");
        UUID reviewId = UUID.randomUUID();
        JsonNode selected = postCommand(owner, "/api/reviews/lifecycle/attempts", offline(attempt(
                UUID.randomUUID(), block.id(), block.version(), inputState.path("version").longValue(),
                block.content(), reviewId, ReviewLifecycleRating.GOOD), selectedAt, false));
        JsonNode baseline = selected.path("effectiveReview").path("schedulingBaseline");
        var events = objectMapper.createArrayNode();
        events.add(fixtureEvent("REVIEW_SELECTED", "GOOD", selectedAt, inputState, baseline, selected));

        Instant confirmedAt = selectedAt.plusSeconds(1);
        JsonNode confirmed = postCommand(owner, "/api/reviews/lifecycle/attempts/" + reviewId + "/confirmations",
                offline(resolution(UUID.randomUUID(), block.id(), block.version(),
                        selected.path("state").path("version").longValue(), block.content()), confirmedAt, false));
        events.add(fixtureEvent("REVIEW_CONFIRMED", null, confirmedAt, selected.path("state"), baseline, confirmed));

        Instant correctedAt = selectedAt.plusSeconds(2);
        JsonNode corrected = postCommand(owner, "/api/reviews/lifecycle/attempts/" + reviewId + "/corrections",
                offline(resolution(UUID.randomUUID(), block.id(), block.version(),
                        confirmed.path("state").path("version").longValue(), block.content()), correctedAt, false));
        events.add(fixtureEvent("REVIEW_CORRECTED", "AGAIN", correctedAt,
                confirmed.path("state"), baseline, corrected));
        return fixtureScenario("confirmation-and-correction-same-review-id", events);
    }

    private ObjectNode fixtureRelearnFlow(Owner owner, UUID subjectId) throws Exception {
        var block = knowledgeBlockService.create(owner.userId(), new KnowledgeBlockCommand(
                subjectId, null, "Fixture relearn", "body", null));
        Instant selectedAt = Instant.now().truncatedTo(ChronoUnit.MICROS).minus(1, ChronoUnit.HOURS);
        Instant learnedAt = selectedAt.minus(40, ChronoUnit.DAYS);
        JsonNode learned = postCommand(owner, "/api/reviews/lifecycle/learning-completions", offline(
                learningCompletion(UUID.randomUUID(), block.id(), block.version(), 0, block.content(), null),
                learnedAt, true));
        jdbcTemplate.update("update review_states set due_at = ?, last_practice_at = ? "
                        + "where user_id = ? and knowledge_block_id = ?",
                java.sql.Timestamp.from(selectedAt.minusSeconds(1)), java.sql.Timestamp.from(learnedAt),
                owner.userId(), block.id());
        JsonNode inputState = history(owner, block.id()).path("state");
        UUID reviewId = UUID.randomUUID();
        JsonNode again = postCommand(owner, "/api/reviews/lifecycle/attempts", offline(attempt(
                UUID.randomUUID(), block.id(), block.version(), inputState.path("version").longValue(),
                block.content(), reviewId, ReviewLifecycleRating.AGAIN), selectedAt, false));
        JsonNode baseline = again.path("effectiveReview").path("schedulingBaseline");
        var events = objectMapper.createArrayNode();
        events.add(fixtureEvent("REVIEW_SELECTED", "AGAIN", selectedAt, inputState, baseline, again));

        Instant relearnedAt = selectedAt.plusSeconds(1);
        JsonNode relearned = postCommand(owner, "/api/reviews/lifecycle/learning-completions", offline(
                learningCompletion(UUID.randomUUID(), block.id(), block.version(),
                        again.path("state").path("version").longValue(), block.content(), reviewId),
                relearnedAt, false));
        events.add(fixtureEvent("LEARNING_COMPLETED", null, relearnedAt,
                again.path("state"), baseline, relearned));
        return fixtureScenario("again-then-relearn", events);
    }

    private ObjectNode fixtureReopenFlow(Owner owner, UUID subjectId) throws Exception {
        var block = knowledgeBlockService.create(owner.userId(), new KnowledgeBlockCommand(
                subjectId, null, "Fixture reopen", "body", null));
        Instant selectedAt = Instant.now().truncatedTo(ChronoUnit.MICROS).minus(1, ChronoUnit.HOURS);
        Instant learnedAt = selectedAt.minus(40, ChronoUnit.DAYS);
        JsonNode learned = postCommand(owner, "/api/reviews/lifecycle/learning-completions", offline(
                learningCompletion(UUID.randomUUID(), block.id(), block.version(), 0, block.content(), null),
                learnedAt, true));
        jdbcTemplate.update("update review_states set due_at = ?, last_practice_at = ? "
                        + "where user_id = ? and knowledge_block_id = ?",
                java.sql.Timestamp.from(selectedAt.minusSeconds(1)), java.sql.Timestamp.from(learnedAt),
                owner.userId(), block.id());
        JsonNode inputState = history(owner, block.id()).path("state");
        UUID reviewId = UUID.randomUUID();
        JsonNode again = postCommand(owner, "/api/reviews/lifecycle/attempts", offline(attempt(
                UUID.randomUUID(), block.id(), block.version(), inputState.path("version").longValue(),
                block.content(), reviewId, ReviewLifecycleRating.AGAIN), selectedAt, false));
        JsonNode baseline = again.path("effectiveReview").path("schedulingBaseline");
        var events = objectMapper.createArrayNode();
        events.add(fixtureEvent("REVIEW_SELECTED", "AGAIN", selectedAt, inputState, baseline, again));

        Instant reopenedAt = selectedAt.plusSeconds(1);
        JsonNode reopened = postCommand(owner, "/api/reviews/lifecycle/learning-reopens", offline(
                new ReviewLifecycleDtos.LearningReopenRequest(UUID.randomUUID(), block.id(), block.version(),
                        again.path("state").path("version").longValue(),
                        KnowledgeBlockContentHash.sha256(block.content()), reviewId, null, null), reopenedAt, false));
        events.add(fixtureEvent("LEARNING_REOPENED", null, reopenedAt,
                again.path("state"), baseline, reopened));
        return fixtureScenario("again-then-reopen", events);
    }

    private ObjectNode fixtureScenario(String name, ObjectNode event) {
        return fixtureScenario(name, objectMapper.createArrayNode().add(event));
    }

    private ObjectNode fixtureScenario(String name, tools.jackson.databind.node.ArrayNode events) {
        ObjectNode scenario = objectMapper.createObjectNode();
        scenario.put("name", name);
        scenario.set("events", events);
        return scenario;
    }

    private ObjectNode fixtureEvent(String action, String rating, Instant occurredAt, JsonNode inputState,
                                    JsonNode schedulingBaseline, JsonNode response) {
        ObjectNode event = objectMapper.createObjectNode();
        ObjectNode input = objectMapper.createObjectNode();
        input.put("action", action);
        if (rating != null) input.put("rating", rating);
        input.put("occurredAt", occurredAt.toString());
        input.set("state", inputState == null ? objectMapper.getNodeFactory().nullNode()
                : fixtureCoreState(inputState));
        input.set("schedulingBaseline", schedulingBaseline == null
                ? objectMapper.getNodeFactory().nullNode() : schedulingBaseline.deepCopy());
        event.set("input", input);

        ObjectNode expected = objectMapper.createObjectNode();
        expected.set("state", fixtureCoreState(response.path("state")));
        JsonNode effectiveReview = response.path("effectiveReview");
        expected.set("effectiveReview", effectiveReview.isObject() ? effectiveReview.deepCopy()
                : objectMapper.getNodeFactory().nullNode());
        event.set("expected", expected);
        return event;
    }

    private ObjectNode fixtureCoreState(JsonNode state) {
        ObjectNode result = objectMapper.createObjectNode();
        for (String property : new String[]{"dueAt", "lastReviewedAt", "lastPracticeAt", "needsLearning",
                "mastered", "stableSuccessCount", "nextReviewStage", "stability", "reps", "lapses"}) {
            result.set(property, state.path(property).deepCopy());
        }
        return result;
    }

    @Test
    void confirmedReviewCanBeCorrectedOnceAndCorrectionKeepsOriginalReviewDate() throws Exception {
        Owner owner = owner("review-correction");
        UUID subjectId = subjectService.create(owner.userId(), new SubjectCommand(
                "Correction subject", null, null, "001")).id();
        var block = knowledgeBlockService.create(owner.userId(), new KnowledgeBlockCommand(
                subjectId, null, "Correction block", "body", null));
        JsonNode learning = postCommand(owner, "/api/reviews/lifecycle/learning-completions",
                learningCompletion(UUID.randomUUID(), block.id(), block.version(), 0, block.content(), null));
        long initialVersion = learning.path("state").path("version").longValue();
        jdbcTemplate.update("update review_states set due_at = ? where user_id = ? and knowledge_block_id = ?",
                java.sql.Timestamp.from(Instant.now().minus(1, ChronoUnit.DAYS)), owner.userId(), block.id());

        UUID reviewId = UUID.randomUUID();
        JsonNode attempt = postCommand(owner, "/api/reviews/lifecycle/attempts", attempt(
                UUID.randomUUID(), block.id(), block.version(), initialVersion, block.content(), reviewId,
                ReviewLifecycleRating.GOOD));
        assertThat(attempt.path("state").path("pendingReviewId").asText()).isEqualTo(reviewId.toString());
        assertThat(attempt.path("state").path("stableSuccessCount").intValue()).isZero();
        assertThat(attempt.path("effectiveReview").path("effectiveRating").isNull()).isTrue();

        JsonNode beforeConfirm = subjectStats(owner, subjectId);
        assertThat(beforeConfirm.path("ratingCounts").path("goodCount").longValue()).isZero();
        assertThat(day(beforeConfirm, Instant.now()).path("nonSkipReviewEventCount").longValue()).isZero();

        JsonNode confirmed = postCommand(owner, "/api/reviews/lifecycle/attempts/" + reviewId + "/confirmations",
                resolution(UUID.randomUUID(), block.id(), block.version(),
                        attempt.path("state").path("version").longValue(), block.content()));
        assertThat(confirmed.path("state").path("pendingReviewId").isNull()).isTrue();
        assertThat(confirmed.path("state").path("stableSuccessCount").intValue()).isEqualTo(1);

        JsonNode corrected = postCommand(owner, "/api/reviews/lifecycle/attempts/" + reviewId + "/corrections",
                resolution(UUID.randomUUID(), block.id(), block.version(),
                        confirmed.path("state").path("version").longValue(), block.content()));
        assertThat(corrected.path("state").path("needsLearning").booleanValue()).isTrue();
        assertThat(corrected.path("state").path("stableSuccessCount").intValue()).isZero();
        assertThat(corrected.path("effectiveReview").path("effectiveRating").asText()).isEqualTo("AGAIN");
        assertThat(Instant.parse(corrected.path("state").path("dueAt").asText())
                .isAfter(Instant.now().plus(9, ChronoUnit.MINUTES))).isTrue();

        JsonNode stats = subjectStats(owner, subjectId);
        assertThat(stats.path("ratingCounts").path("goodCount").longValue()).isZero();
        assertThat(stats.path("ratingCounts").path("againCount").longValue()).isEqualTo(1);
        JsonNode today = day(stats, Instant.now());
        assertThat(today.path("nonSkipReviewEventCount").longValue()).isEqualTo(1);
        assertThat(today.path("distinctReviewedKnowledgeBlockCount").longValue()).isEqualTo(1);
        JsonNode history = history(owner, block.id());
        assertThat(history.path("effectiveReviews").size()).isEqualTo(1);
        assertThat(history.path("effectiveReviews").get(0).path("resolution").asText())
                .isEqualTo("CORRECTED_AGAIN");
        assertThat(history.path("commands").size()).isEqualTo(4);
        assertThat(history.path("commands").get(0).path("action").asText()).isEqualTo("LEARNING_COMPLETED");
        assertThat(history.path("commands").get(1).path("action").asText()).isEqualTo("REVIEW_SELECTED");
        assertThat(history.path("commands").get(2).path("action").asText()).isEqualTo("REVIEW_CONFIRMED");
        assertThat(history.path("commands").get(3).path("action").asText()).isEqualTo("REVIEW_CORRECTED");
    }

    @Test
    void againLearningAndTailFailureKeepOneEffectiveAgainResult() throws Exception {
        Owner owner = owner("again-learning");
        UUID subjectId = subjectService.create(owner.userId(), new SubjectCommand(
                "Again subject", null, null, "001")).id();
        var block = knowledgeBlockService.create(owner.userId(), new KnowledgeBlockCommand(
                subjectId, null, "Again block", "body", null));
        JsonNode learning = postCommand(owner, "/api/reviews/lifecycle/learning-completions",
                learningCompletion(UUID.randomUUID(), block.id(), block.version(), 0, block.content(), null));
        UUID reviewId = UUID.randomUUID();
        JsonNode again = postCommand(owner, "/api/reviews/lifecycle/attempts", attempt(
                UUID.randomUUID(), block.id(), block.version(), learning.path("state").path("version").longValue(),
                block.content(), reviewId, ReviewLifecycleRating.AGAIN));
        assertThat(again.path("state").path("needsLearning").booleanValue()).isTrue();
        assertThat(again.path("effectiveReview").path("effectiveRating").asText()).isEqualTo("AGAIN");

        JsonNode completed = postCommand(owner, "/api/reviews/lifecycle/learning-completions", learningCompletion(
                UUID.randomUUID(), block.id(), block.version(), again.path("state").path("version").longValue(),
                block.content(), reviewId));
        assertThat(completed.path("state").path("needsLearning").booleanValue()).isFalse();
        assertThat(completed.path("state").path("nextReviewStage").asText()).isEqualTo("EARLY_RECALL");
        assertThat(Duration.between(Instant.parse(completed.path("occurredAt").asText()),
                Instant.parse(completed.path("state").path("dueAt").asText())))
                .isEqualTo(Duration.ofMinutes(10));

        JsonNode reopened = postCommand(owner, "/api/reviews/lifecycle/attempts/" + reviewId + "/corrections",
                resolution(UUID.randomUUID(), block.id(), block.version(),
                        completed.path("state").path("version").longValue(), block.content()));
        assertThat(reopened.path("state").path("needsLearning").booleanValue()).isTrue();
        JsonNode stats = subjectStats(owner, subjectId);
        assertThat(stats.path("ratingCounts").path("againCount").longValue()).isEqualTo(1);
        assertThat(day(stats, Instant.now()).path("nonSkipReviewEventCount").longValue()).isEqualTo(1);
    }

    @Test
    void contentChangesInvalidateProgressButMetadataEditsDoNot() throws Exception {
        Owner owner = owner("content-invalidation");
        UUID subjectId = subjectService.create(owner.userId(), new SubjectCommand(
                "Content subject", null, null, "001")).id();
        var block = knowledgeBlockService.create(owner.userId(), new KnowledgeBlockCommand(
                subjectId, null, "Content block", "body", null));
        postCommand(owner, "/api/reviews/lifecycle/learning-completions",
                learningCompletion(UUID.randomUUID(), block.id(), block.version(), 0, block.content(), null));
        jdbcTemplate.update("update review_states set stable_success_count = 3, mastered = true, next_review_stage = null "
                        + "where user_id = ? and knowledge_block_id = ?", owner.userId(), block.id());

        var metadata = knowledgeBlockService.update(owner.userId(), block.id(), block.version(),
                new KnowledgeBlockCommand(subjectId, null, "Renamed block", "body", null));
        JsonNode afterMetadata = history(owner, block.id()).path("state");
        assertThat(afterMetadata.path("mastered").booleanValue()).isTrue();
        assertThat(afterMetadata.path("stableSuccessCount").intValue()).isEqualTo(3);

        knowledgeBlockService.update(owner.userId(), block.id(), metadata.version(),
                new KnowledgeBlockCommand(subjectId, null, "Renamed block", "  new body  ", null));
        assertThat(knowledgeBlockService.get(owner.userId(), block.id()).content()).isEqualTo("new body");
        assertThat(jdbcTemplate.queryForObject(
                "select content_hash from review_states where user_id = ? and knowledge_block_id = ?",
                String.class, owner.userId(), block.id()))
                .isEqualTo("ae907ab9a383483e5c37beee966723544b9e6f12148a7dcd56ceea7ad44c5a7b");
        JsonNode afterContent = history(owner, block.id()).path("state");
        assertThat(afterContent.path("needsLearning").booleanValue()).isTrue();
        assertThat(afterContent.path("mastered").booleanValue()).isFalse();
        assertThat(afterContent.path("stableSuccessCount").intValue()).isZero();
        assertThat(afterContent.path("lastReviewId").isNull()).isTrue();
        JsonNode states = subjectStates(owner, subjectId);
        assertThat(states.path("items").get(0).path("needsLearning").booleanValue()).isTrue();
    }

    @Test
    void titleEditKeepsReviewTargetAndReplaysOnlyAnAcceptedOldRequest() throws Exception {
        Owner owner = owner("title-edit-review");
        UUID subjectId = subjectService.create(owner.userId(), new SubjectCommand("Title edit", null, null, "001")).id();
        var block = knowledgeBlockService.create(owner.userId(), new KnowledgeBlockCommand(
                subjectId, null, "Before title edit", "body", null));
        JsonNode learned = postCommand(owner, "/api/reviews/lifecycle/learning-completions",
                learningCompletion(UUID.randomUUID(), block.id(), block.version(), 0, block.content(), null));
        UUID reviewId = UUID.randomUUID();
        var select = attempt(UUID.randomUUID(), block.id(), block.version(), learned.path("state").path("version").longValue(),
                block.content(), reviewId, ReviewLifecycleRating.HARD);
        JsonNode selected = postCommand(owner, "/api/reviews/lifecycle/attempts", select);
        long selectedVersion = selected.path("state").path("version").longValue();
        var renamed = knowledgeBlockService.update(owner.userId(), block.id(), block.version(), new KnowledgeBlockCommand(
                subjectId, null, "After title edit", block.content(), null));

        assertThat(postCommand(owner, "/api/reviews/lifecycle/attempts", select)).isEqualTo(selected);
        String confirmPath = "/api/reviews/lifecycle/attempts/" + reviewId + "/confirmations";
        UUID confirmId = UUID.randomUUID();
        mockMvc.perform(post(confirmPath).header("Authorization", owner.authorization())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(resolution(confirmId, block.id(), block.version(),
                                selectedVersion, block.content()))))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("RESOURCE_VERSION_CONFLICT"));
        assertThat(history(owner, block.id()).path("state").path("pendingReviewId").asText()).isEqualTo(reviewId.toString());
        assertThat(history(owner, block.id()).path("commands").size()).isEqualTo(2);

        JsonNode confirmed = postCommand(owner, confirmPath,
                resolution(confirmId, block.id(), renamed.version(), selectedVersion, block.content()));
        assertThat(confirmed.path("effectiveReview").path("effectiveRating").asText()).isEqualTo("HARD");
        assertThat(confirmed.path("state").path("pendingReviewId").isNull()).isTrue();
        assertThat(history(owner, block.id()).path("commands").get(2).path("rating").asText()).isEqualTo("HARD");

        knowledgeBlockService.update(owner.userId(), block.id(), renamed.version(), new KnowledgeBlockCommand(
                subjectId, null, renamed.title(), "new body", null));
        mockMvc.perform(post("/api/reviews/lifecycle/attempts").header("Authorization", owner.authorization())
                        .contentType(MediaType.APPLICATION_JSON).content(objectMapper.writeValueAsString(select)))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("RESOURCE_VERSION_CONFLICT"));
    }

    @Test
    void movingAReviewedBlockBackDoesNotRestoreAnOldConfirmationTarget() throws Exception {
        Owner owner = owner("move-pending-review");
        UUID subjectId = subjectService.create(owner.userId(), new SubjectCommand("From", null, null, "001")).id();
        UUID destinationId = subjectService.create(owner.userId(), new SubjectCommand("To", null, null, "001")).id();
        var block = knowledgeBlockService.create(owner.userId(), new KnowledgeBlockCommand(
                subjectId, null, "Moving block", "body", null));
        JsonNode learned = postCommand(owner, "/api/reviews/lifecycle/learning-completions",
                learningCompletion(UUID.randomUUID(), block.id(), block.version(), 0, block.content(), null));
        UUID reviewId = UUID.randomUUID();
        JsonNode selected = postCommand(owner, "/api/reviews/lifecycle/attempts", attempt(UUID.randomUUID(), block.id(),
                block.version(), learned.path("state").path("version").longValue(), block.content(), reviewId, ReviewLifecycleRating.GOOD));
        var moved = knowledgeBlockService.update(owner.userId(), block.id(), block.version(), new KnowledgeBlockCommand(
                destinationId, null, block.title(), block.content(), null));
        var movedBack = knowledgeBlockService.update(owner.userId(), block.id(), moved.version(), new KnowledgeBlockCommand(
                subjectId, null, block.title(), block.content(), null));
        JsonNode history = history(owner, block.id());
        JsonNode current = history.path("state");
        assertThat(current.path("dueAt")).isEqualTo(selected.path("state").path("dueAt"));
        assertThat(current.path("pendingReviewId").isNull()).isTrue();
        assertThat(current.path("lastReviewId").isNull()).isTrue();
        assertThat(history.path("effectiveReviews").get(0).path("resolution").asText()).isEqualTo("SUPERSEDED");
        mockMvc.perform(post("/api/reviews/lifecycle/attempts/" + reviewId + "/confirmations")
                        .header("Authorization", owner.authorization()).contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(resolution(UUID.randomUUID(), block.id(), movedBack.version(),
                                current.path("version").longValue(), block.content()))))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("MUTATION_REJECTED"));
    }

    @Test
    void finalVerificationRequiresThirtyDaysSinceLatestRecordedPractice() throws Exception {
        Owner owner = owner("final-verification");
        UUID subjectId = subjectService.create(owner.userId(), new SubjectCommand(
                "Final subject", null, null, "001")).id();
        var block = knowledgeBlockService.create(owner.userId(), new KnowledgeBlockCommand(
                subjectId, null, "Final block", "body", null));
        JsonNode learning = postCommand(owner, "/api/reviews/lifecycle/learning-completions",
                learningCompletion(UUID.randomUUID(), block.id(), block.version(), 0, block.content(), null));
        Instant lastPractice = Instant.now().minus(31, ChronoUnit.DAYS);
        jdbcTemplate.update("update review_states set stable_success_count = 3, next_review_stage = 'FINAL_VERIFICATION', "
                        + "due_at = ?, last_practice_at = ? where user_id = ? and knowledge_block_id = ?",
                java.sql.Timestamp.from(lastPractice), java.sql.Timestamp.from(lastPractice), owner.userId(), block.id());

        UUID reviewId = UUID.randomUUID();
        JsonNode attempt = postCommand(owner, "/api/reviews/lifecycle/attempts", attempt(
                UUID.randomUUID(), block.id(), block.version(), learning.path("state").path("version").longValue(),
                block.content(), reviewId, ReviewLifecycleRating.GOOD));
        JsonNode graduated = postCommand(owner, "/api/reviews/lifecycle/attempts/" + reviewId + "/confirmations",
                resolution(UUID.randomUUID(), block.id(), block.version(),
                        attempt.path("state").path("version").longValue(), block.content()));
        assertThat(graduated.path("state").path("mastered").booleanValue()).isTrue();
        assertThat(graduated.path("state").path("nextReviewStage").isNull()).isTrue();
        JsonNode states = subjectStates(owner, subjectId);
        assertThat(states.path("items").get(0).path("mastered").booleanValue()).isTrue();
        JsonNode stats = subjectStats(owner, subjectId);
        assertThat(stats.path("overview").path("masteredCount").longValue()).isEqualTo(1);
        assertThat(stats.path("overview").path("reviewingCount").longValue()).isZero();
        assertThat(stats.path("overview").path("pendingLearningCount").longValue()).isZero();
    }

    private JsonNode postCommand(Owner owner, String path, String json) throws Exception {
        String body = mockMvc.perform(post(path)
                        .header("Authorization", owner.authorization())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return objectMapper.readTree(body);
    }

    private JsonNode postCommand(Owner owner, String path, Object request) throws Exception {
        return postCommand(owner, path, objectMapper.writeValueAsString(request));
    }

    private JsonNode history(Owner owner, UUID blockId) throws Exception {
        String content = mockMvc.perform(get("/api/reviews/lifecycle/history")
                        .header("Authorization", owner.authorization())
                        .param("knowledgeBlockId", blockId.toString()))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return objectMapper.readTree(content);
    }

    private JsonNode subjectStats(Owner owner, UUID subjectId) throws Exception {
        String content = mockMvc.perform(get("/api/stats/subjects/{subjectId}", subjectId)
                        .header("Authorization", owner.authorization())
                        .param("days", "7")
                        .param("timeZone", "UTC"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return objectMapper.readTree(content);
    }

    private JsonNode subjectStates(Owner owner, UUID subjectId) throws Exception {
        String content = mockMvc.perform(get("/api/reviews/states")
                        .header("Authorization", owner.authorization())
                        .param("subjectId", subjectId.toString()))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return objectMapper.readTree(content);
    }

    private JsonNode day(JsonNode stats, Instant instant) {
        String date = instant.atZone(java.time.ZoneOffset.UTC).toLocalDate().toString();
        for (JsonNode item : stats.path("daily")) {
            if (date.equals(item.path("date").asText())) return item;
        }
        throw new AssertionError("Missing stats day " + date);
    }

    private ReviewLifecycleDtos.LearningCompletionRequest learningCompletion(
            UUID commandId, UUID blockId, long blockVersion, long baseVersion, String content, UUID reviewId) {
        return new ReviewLifecycleDtos.LearningCompletionRequest(commandId, blockId, blockVersion,
                baseVersion, KnowledgeBlockContentHash.sha256(content), reviewId, null, null);
    }

    private ObjectNode offline(Object request, Instant occurredAt, Boolean expectedStateAbsent) {
        ObjectNode node = (ObjectNode) objectMapper.valueToTree(request);
        if (occurredAt != null) node.put("occurredAt", occurredAt.toString());
        if (expectedStateAbsent != null) node.put("expectedStateAbsent", expectedStateAbsent);
        return node;
    }

    private ReviewLifecycleDtos.ReviewAttemptRequest attempt(UUID commandId, UUID blockId, long blockVersion,
                                                              long baseVersion, String content, UUID reviewId,
                                                              ReviewLifecycleRating rating) {
        return new ReviewLifecycleDtos.ReviewAttemptRequest(commandId, blockId, blockVersion, baseVersion,
                KnowledgeBlockContentHash.sha256(content), reviewId, rating, 0, null, null);
    }

    private ReviewLifecycleDtos.ReviewResolutionRequest resolution(UUID commandId, UUID blockId, long blockVersion,
                                                                    long baseVersion, String content) {
        return new ReviewLifecycleDtos.ReviewResolutionRequest(commandId, blockId, blockVersion, baseVersion,
                KnowledgeBlockContentHash.sha256(content), null, null);
    }

    private Owner owner(String prefix) {
        AuthResult result = identityService.register(
                "lifecycle-" + UUID.randomUUID().toString().replace("-", "") + "@example.test",
                PASSWORD, "Lifecycle Test",
                new DeviceCommand("device-" + UUID.randomUUID(), "Lifecycle Test", DevicePlatform.WEB));
        return new Owner(result.user().id(), "Bearer " + result.tokens().accessToken());
    }

    private record Owner(UUID userId, String authorization) { }
}
