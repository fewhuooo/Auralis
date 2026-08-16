package com.auralis.app.sync;

import com.auralis.app.shared.domain.ResourceChangedEvent;
import com.auralis.app.shared.domain.ResourceChangeRecordedEvent;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

@Component
public class ChangeLogEventListener {

    private final ChangeLogService changeLogService;
    private final ApplicationEventPublisher eventPublisher;

    public ChangeLogEventListener(ChangeLogService changeLogService, ApplicationEventPublisher eventPublisher) {
        this.changeLogService = changeLogService;
        this.eventPublisher = eventPublisher;
    }

    @EventListener
    public void onResourceChanged(ResourceChangedEvent event) {
        var entry = changeLogService.record(
                event.userId(),
                SyncResourceType.valueOf(event.resourceType().name()),
                event.resourceId(),
                SyncMutationType.valueOf(event.mutationType()),
                event.version(),
                event.deletedAt(),
                event.payload());
        eventPublisher.publishEvent(new ResourceChangeRecordedEvent(
                event.userId(), event.resourceType(), event.resourceId(), event.version(),
                entry.cursor(), entry.createdAt()));
    }
}
