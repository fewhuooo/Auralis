package com.auralis.app;

import com.auralis.app.ai.AiMessageRole;
import com.auralis.app.ai.AiMessageStatus;
import com.auralis.app.ai.ConversationCommand;
import com.auralis.app.ai.ConversationService;
import com.auralis.app.ai.ConversationView;
import com.auralis.app.ai.MessageView;
import com.auralis.app.shared.error.DomainException;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

import java.util.UUID;
import java.util.concurrent.Executors;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest(classes = AuralisApplication.class)
@ActiveProfiles("test")
class R1ConcurrencyTests {

    @Autowired
    private ConversationService conversationService;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    void conversationDeleteRequiresExactVersion() {
        UUID userId = insertUser("r1-version-" + UUID.randomUUID());
        ConversationView conversation = conversationService.create(
                userId, new ConversationCommand("Versioned", 0L));

        assertThatThrownBy(() -> conversationService.delete(userId, conversation.id(), 1L))
                .isInstanceOfSatisfying(DomainException.class, exception -> {
                    assertThat(exception.code()).isEqualTo("RESOURCE_VERSION_CONFLICT");
                    assertThat(exception.current()).isInstanceOf(ConversationView.class);
                    assertThat(((ConversationView) exception.current()).version()).isZero();
                });

        conversationService.delete(userId, conversation.id(), 0L);
        assertThatThrownBy(() -> conversationService.get(userId, conversation.id()))
                .isInstanceOfSatisfying(DomainException.class,
                        exception -> assertThat(exception.code()).isEqualTo("RESOURCE_NOT_FOUND"));
    }

    @Test
    void concurrentAppendsAllocateUniqueSequences() throws Exception {
        UUID userId = insertUser("r1-message-" + UUID.randomUUID());
        ConversationView conversation = conversationService.create(
                userId, new ConversationCommand("Concurrent", 0L));

        try (var executor = Executors.newFixedThreadPool(2)) {
            var first = executor.submit(() -> append(userId, conversation.id(), "first"));
            var second = executor.submit(() -> append(userId, conversation.id(), "second"));
            assertThat(first.get().messageSequence()).isNotEqualTo(second.get().messageSequence());
        }
        markMessagesAsProtocolOne(conversation.id());

        assertThat(conversationService.get(userId, conversation.id()).messages())
                .extracting(MessageView::messageSequence)
                .containsExactly(1L, 2L);
    }

    @Test
    void conversationCreateReplaysTheSameClientRequestIdAfterLostResponse() {
        UUID userId = insertUser("r1-conversation-retry-" + UUID.randomUUID());
        ConversationCommand command = new ConversationCommand("Recovered", 0L, "conversation-retry");

        ConversationView first = conversationService.create(userId, command);
        ConversationView retry = conversationService.create(userId, command);

        assertThat(retry.id()).isEqualTo(first.id());
        assertThat(conversationService.list(userId)).hasSize(1);
    }

    @Test
    void concurrentDuplicateAiRequestReservesOneUserMessageAndOneProviderOwner() throws Exception {
        UUID userId = insertUser("r1-ai-idempotency-" + UUID.randomUUID());
        ConversationView conversation = conversationService.create(
                userId, new ConversationCommand("Idempotent", 0L));

        try (var executor = Executors.newFixedThreadPool(2)) {
            var first = executor.submit(() -> conversationService.reserveUserMessage(
                    userId, conversation.id(), "Idempotent", "hello", "request-concurrent"));
            var second = executor.submit(() -> conversationService.reserveUserMessage(
                    userId, conversation.id(), "Idempotent", "hello", "request-concurrent"));

            assertThat(first.get().started()).isNotEqualTo(second.get().started());
        }
        markMessagesAsProtocolOne(conversation.id());

        assertThat(conversationService.get(userId, conversation.id()).messages())
                .filteredOn(message -> message.role() == AiMessageRole.USER)
                .hasSize(1);
    }

    private MessageView append(UUID userId, UUID conversationId, String content) {
        return conversationService.appendMessage(
                userId, conversationId, AiMessageRole.USER, content,
                AiMessageStatus.COMPLETED, null, null);
    }

    private UUID insertUser(String username) {
        UUID id = UUID.randomUUID();
        jdbcTemplate.update(
                "insert into users(id, username, normalized_username, password_hash, status) "
                        + "values (?, ?, ?, ?, 'ACTIVE')",
                id, username, username, "{noop}r1-test-password");
        return id;
    }

    private void markMessagesAsProtocolOne(UUID conversationId) {
        jdbcTemplate.update("update messages set chat_protocol_version = 1 where conversation_id = ?", conversationId);
    }
}
