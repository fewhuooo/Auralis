package com.auralis.app.ai.internal.chat;

import com.auralis.app.ai.internal.persistence.ChatAttemptEntity;
import com.auralis.app.ai.internal.persistence.ChatAttemptRepository;
import com.auralis.app.ai.internal.persistence.ChatRunRepository;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Component;

import java.util.List;

/** Reconciles only persisted attempts whose process-local execution cannot survive this boot. */
@Component
public class ChatRuntimeRecoveryService {
    private final ChatAttemptRepository attempts;
    private final ChatRunRepository runs;
    private final ChatRuntimePersistenceService persistence;

    public ChatRuntimeRecoveryService(ChatAttemptRepository attempts, ChatRunRepository runs,
            ChatRuntimePersistenceService persistence) {
        this.attempts = attempts; this.runs = runs; this.persistence = persistence;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void recoverAfterRestart() {
        reconcileCandidates();
    }

    @Scheduled(fixedDelay = 5000L)
    public void reconcileExpiredAttempts() {
        reconcileCandidates();
    }

    private void reconcileCandidates() {
        List<ChatAttemptEntity> candidates = attempts.findExpiredForeignAttempts(
                List.of("PENDING", "RUNNING", "CANCEL_REQUESTED"), java.time.Instant.now(),
                persistence.workerInstanceId(), PageRequest.of(0, 100));
        for (ChatAttemptEntity attempt : candidates) {
            runs.findById(attempt.getRunId()).ifPresent(run -> persistence.recoverAfterRestart(
                    attempt.getUserId(), run.getConversationId(), run.getId(), attempt.getId()));
        }
    }
}
