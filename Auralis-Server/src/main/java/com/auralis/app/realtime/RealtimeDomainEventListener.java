package com.auralis.app.realtime;

import com.auralis.app.shared.domain.ResourceChangeRecordedEvent;
import com.auralis.app.shared.domain.ReviewChangedEvent;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

@Component
public class RealtimeDomainEventListener {

    private final RealtimeEventPublisher eventPublisher;

    public RealtimeDomainEventListener(RealtimeEventPublisher eventPublisher) {
        this.eventPublisher = eventPublisher;
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onResourceChange(ResourceChangeRecordedEvent event) {
        eventPublisher.publish(event.userId(), new RealtimeEventView(
                RealtimeEventType.SYNC_CHANGED,
                event.resourceType().name(),
                event.resourceId(),
                event.cursor(),
                event.occurredAt()));
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onReviewChange(ReviewChangedEvent event) {
        eventPublisher.publish(event.userId(), new RealtimeEventView(
                RealtimeEventType.REVIEW_UPDATED,
                "KNOWLEDGE_BLOCK",
                event.knowledgeBlockId(),
                event.stateVersion(),
                event.occurredAt()));
    }
}
