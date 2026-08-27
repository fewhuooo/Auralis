package com.auralis.app;

import com.auralis.app.ai.AiMessageRole;
import com.auralis.app.ai.AiMessageStatus;
import com.auralis.app.ai.AiProviderRequest;
import com.auralis.app.ai.MessageView;
import com.auralis.app.ai.PromptAssembler;
import com.auralis.app.ai.retrieval.Citation;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class PromptAssemblerTests {

    @Test
    void ordersSystemCompletedHistorySelectionRetrievedBlocksAndCurrentUser() {
        UUID firstUser = UUID.randomUUID();
        UUID secondUser = UUID.randomUUID();
        UUID currentUser = UUID.randomUUID();
        UUID sourceId = UUID.randomUUID();
        UUID chunkId = UUID.randomUUID();
        List<MessageView> history = List.of(
                message(firstUser, 1, AiMessageRole.USER, "first"),
                message(UUID.randomUUID(), 2, AiMessageRole.ASSISTANT, "first answer"),
                message(secondUser, 3, AiMessageRole.USER, "second"),
                message(UUID.randomUUID(), 4, AiMessageRole.ASSISTANT, "second answer"),
                message(currentUser, 5, AiMessageRole.USER, "current"));

        List<AiProviderRequest.Message> result = PromptAssembler.assemble(
                "system", history, currentUser, "selected", List.of(
                        new Citation(sourceId, chunkId, 0, "Notes", "retrieved", 0.9)),
                "current", 1000);

        assertThat(result).extracting(AiProviderRequest.Message::role)
                .containsExactly(AiMessageRole.SYSTEM, AiMessageRole.USER, AiMessageRole.ASSISTANT,
                        AiMessageRole.USER, AiMessageRole.ASSISTANT, AiMessageRole.SYSTEM,
                        AiMessageRole.SYSTEM, AiMessageRole.USER);
        assertThat(result).extracting(AiProviderRequest.Message::content)
                .containsExactly("system", "first", "first answer", "second", "second answer",
                        "Selected text:\nselected", "[source=" + sourceId + ", chunk=" + chunkId + "] retrieved", "current");
    }

    @Test
    void excludesFailedAndIncompleteAssistantAndCropsOldestPairsFirst() {
        UUID oldUser = UUID.randomUUID();
        UUID newestUser = UUID.randomUUID();
        List<MessageView> history = List.of(
                message(oldUser, 1, AiMessageRole.USER, "old user"),
                message(UUID.randomUUID(), 2, AiMessageRole.ASSISTANT, "old answer"),
                message(newestUser, 3, AiMessageRole.USER, "new user"),
                message(UUID.randomUUID(), 4, AiMessageRole.ASSISTANT, "new answer"),
                new MessageView(UUID.randomUUID(), 5, AiMessageRole.ASSISTANT, AiMessageStatus.FAILED,
                        "failed", null, "FAILED", null),
                message(UUID.randomUUID(), 6, AiMessageRole.ASSISTANT, "incomplete"));

        List<AiProviderRequest.Message> result = PromptAssembler.assemble(
                "system", history, null, null, List.of(), "ask", 32);

        assertThat(result).extracting(AiProviderRequest.Message::content)
                .contains("system", "new user", "new answer", "ask")
                .doesNotContain("old user", "old answer", "failed", "incomplete");
        assertThat(result.stream().mapToInt(message -> message.content().length()).sum()).isLessThanOrEqualTo(32);
    }

    private static MessageView message(UUID id, long sequence, AiMessageRole role, String content) {
        return new MessageView(id, sequence, role, AiMessageStatus.COMPLETED, content, null, null, null);
    }
}
