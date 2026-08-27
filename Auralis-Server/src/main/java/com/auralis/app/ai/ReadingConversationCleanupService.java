package com.auralis.app.ai;

import com.auralis.app.ai.internal.persistence.ConversationEntity;
import com.auralis.app.ai.internal.persistence.ConversationRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;

/** Soft-deletes abandoned reading sessions so they never become chat history. */
@Service
public class ReadingConversationCleanupService {

    static final Duration INACTIVITY_WINDOW = Duration.ofHours(24);

    private final ConversationRepository conversationRepository;

    public ReadingConversationCleanupService(ConversationRepository conversationRepository) {
        this.conversationRepository = conversationRepository;
    }

    @Transactional
    public int cleanupInactive(Instant now) {
        Instant cutoff = (now == null ? Instant.now() : now).minus(INACTIVITY_WINDOW);
        var sessions = conversationRepository.findAllByPurposeAndDeletedAtIsNullAndUpdatedAtBefore(
                ConversationPurpose.READING_SESSION, cutoff);
        sessions.forEach(ConversationEntity::softDelete);
        if (!sessions.isEmpty()) {
            conversationRepository.saveAllAndFlush(sessions);
        }
        return sessions.size();
    }

    @Transactional
    public int cleanupInactive() {
        return cleanupInactive(Instant.now());
    }
}
