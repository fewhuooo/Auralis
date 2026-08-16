package com.auralis.app;

import com.auralis.app.realtime.RealtimeEventPublisher;
import com.auralis.app.realtime.RealtimeEventType;
import com.auralis.app.realtime.RealtimeService;
import com.auralis.app.realtime.RealtimeEventView;
import com.auralis.app.identity.AuthResult;
import com.auralis.app.identity.DeviceCommand;
import com.auralis.app.identity.DevicePlatform;
import com.auralis.app.identity.IdentityService;
import com.auralis.app.subject.SubjectCommand;
import com.auralis.app.subject.SubjectService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import java.time.Instant;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest(classes = AuralisApplication.class)
@ActiveProfiles("test")
class RealtimeServiceTests {

    @Autowired
    private RealtimeService realtimeService;

    @Autowired
    private RealtimeEventPublisher eventPublisher;

    @Autowired
    private IdentityService identityService;

    @Autowired
    private SubjectService subjectService;

    @Test
    void ticketIsUserBoundSingleUseAndEventsDoNotCrossUsers() {
        AuthResult owner = identityService.register("realtime-owner@example.com", "correct horse battery staple",
                "Realtime owner", new DeviceCommand("realtime-device", "Test", DevicePlatform.WEB));
        UUID userId = owner.user().id();
        UUID otherUserId = UUID.randomUUID();
        String rawTicket = realtimeService.issue(userId, owner.deviceId()).ticket();

        assertThatThrownBy(() -> realtimeService.consume(otherUserId, rawTicket))
                .isInstanceOf(RuntimeException.class);
        assertThat(realtimeService.consume(userId, rawTicket).userId()).isEqualTo(userId);
        assertThatThrownBy(() -> realtimeService.consume(userId, rawTicket))
                .isInstanceOf(RuntimeException.class);
    }

    @Test
    void publisherFansOutOnlyToSameUser() {
        var first = new CopyOnWriteArrayList<RealtimeEventView>();
        var second = new CopyOnWriteArrayList<RealtimeEventView>();
        UUID firstUser = UUID.randomUUID();
        UUID secondUser = UUID.randomUUID();
        AutoCloseable firstSubscription = eventPublisher.subscribe(firstUser, first::add);
        AutoCloseable secondSubscription = eventPublisher.subscribe(secondUser, second::add);
        var event = new RealtimeEventView(RealtimeEventType.REVIEW_UPDATED, "KNOWLEDGE_BLOCK",
                UUID.randomUUID(), 1L, Instant.parse("2026-08-13T00:00:00Z"));

        eventPublisher.publish(firstUser, event);
        assertThat(first).containsExactly(event);
        assertThat(second).isEmpty();
        try {
            firstSubscription.close();
            secondSubscription.close();
        } catch (Exception ignored) {
        }
    }

    @Test
    void committedDomainWritePublishesRealtimeEvent() {
        AuthResult owner = identityService.register("realtime-domain@example.com", "correct horse battery staple",
                "Realtime domain", new DeviceCommand("realtime-domain-device", "Test", DevicePlatform.WEB));
        var events = new CopyOnWriteArrayList<RealtimeEventView>();
        AutoCloseable subscription = eventPublisher.subscribe(owner.user().id(), events::add);

        try {
            var subject = subjectService.create(owner.user().id(), new SubjectCommand(
                    "Realtime subject", null, null, null, "001"));

            assertThat(events).anySatisfy(event -> {
                assertThat(event.type()).isEqualTo(RealtimeEventType.SYNC_CHANGED);
                assertThat(event.resourceType()).isEqualTo("SUBJECT");
                assertThat(event.resourceId()).isEqualTo(subject.id());
            });
        } finally {
            try {
                subscription.close();
            } catch (Exception ignored) {
            }
        }
    }
}
