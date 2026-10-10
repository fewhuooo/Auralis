package com.auralis.app;

import com.auralis.app.review.ReviewEventCommand;
import com.auralis.app.review.ReviewRating;
import com.auralis.app.review.ReviewService;
import com.auralis.app.review.ReviewStateView;
import com.auralis.app.identity.AuthResult;
import com.auralis.app.identity.DeviceCommand;
import com.auralis.app.identity.DevicePlatform;
import com.auralis.app.identity.IdentityService;
import com.auralis.app.knowledge.KnowledgeBlockCommand;
import com.auralis.app.knowledge.KnowledgeBlockService;
import com.auralis.app.subject.SubjectService;
import com.auralis.app.subject.SubjectCommand;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(classes = AuralisApplication.class)
@ActiveProfiles("test")
class ReviewServiceTests {

    @Autowired
    private ReviewService reviewService;

    @Autowired
    private IdentityService identityService;

    @Autowired
    private SubjectService subjectService;

    @Autowired
    private KnowledgeBlockService knowledgeBlockService;

    @Test
    void schedulerIsDeterministicAndSkipDoesNotChangeState() {
        var fixture = fixture("review-deterministic");
        UUID userId = fixture.userId();
        UUID blockId = fixture.blockId();
        Instant reviewedAt = Instant.parse("2026-08-13T00:00:00Z");

        ReviewStateView first = reviewService.preview(userId, blockId, ReviewRating.GOOD, reviewedAt);
        ReviewStateView second = reviewService.preview(userId, blockId, ReviewRating.GOOD, reviewedAt);
        assertThat(second).isEqualTo(first);

        var skipped = reviewService.record(userId, new ReviewEventCommand(
                UUID.randomUUID(), blockId, ReviewRating.SKIP, reviewedAt, 10, 0));
        assertThat(skipped.state()).isNull();
    }

    @Test
    void clientEventIdIsIdempotentAndUserScoped() {
        var fixture = fixture("review-idempotent");
        UUID eventId = UUID.randomUUID();
        UUID blockId = fixture.blockId();
        var command = new ReviewEventCommand(eventId, blockId, ReviewRating.EASY,
                Instant.parse("2026-08-13T00:00:00Z"), 20, 0);

        var first = reviewService.record(fixture.userId(), command);
        var replay = reviewService.record(first.event().userId(), command);
        assertThat(replay.event().id()).isEqualTo(first.event().id());
        assertThat(replay.state().knowledgeBlockId()).isEqualTo(first.state().knowledgeBlockId());
    }

    @Test
    void replayReturnsTheOriginalStateAfterLaterReviews() {
        var fixture = fixture("review-replay");
        Instant reviewedAt = Instant.parse("2026-08-13T00:00:00Z");
        UUID firstEventId = UUID.randomUUID();

        var first = reviewService.record(fixture.userId(), new ReviewEventCommand(
                firstEventId, fixture.blockId(), ReviewRating.GOOD, reviewedAt, 20, 0));
        reviewService.record(fixture.userId(), new ReviewEventCommand(
                UUID.randomUUID(), fixture.blockId(), ReviewRating.EASY,
                reviewedAt.plusSeconds(60), 20, first.state().version()));

        var replay = reviewService.record(fixture.userId(), new ReviewEventCommand(
                firstEventId, fixture.blockId(), ReviewRating.GOOD, reviewedAt, 20, 0));

        assertThat(replay.state()).isEqualTo(first.state());
    }

    private Fixture fixture(String suffix) {
        AuthResult owner = identityService.register(suffix + "@example.com", "correct horse battery staple",
                suffix, new DeviceCommand("device-" + suffix, "Test", DevicePlatform.WEB));
        UUID subjectId = subjectService.create(owner.user().id(), new SubjectCommand(
                "Review Subject", null, null, "001")).id();
        UUID blockId = knowledgeBlockService.create(owner.user().id(), new KnowledgeBlockCommand(
                subjectId, null, "Review block", "body", null)).id();
        return new Fixture(owner.user().id(), blockId);
    }

    private record Fixture(UUID userId, UUID blockId) { }
}
