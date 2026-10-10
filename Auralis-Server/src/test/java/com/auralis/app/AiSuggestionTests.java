package com.auralis.app;

import com.auralis.app.ai.SuggestionCommand;
import com.auralis.app.ai.SuggestionService;
import com.auralis.app.ai.SuggestionType;
import com.auralis.app.ai.SuggestionView;
import com.auralis.app.knowledge.KnowledgeBlockService;
import com.auralis.app.knowledge.KnowledgeBlockView;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AiSuggestionTests {

    @Mock
    private KnowledgeBlockService knowledgeBlockService;

    @InjectMocks
    private SuggestionService suggestionService;

    @Test
    void returnsTypedDeterministicSuggestionsForOwnedKnowledgeBlocks() {
        UUID userId = UUID.randomUUID();
        UUID blockId = UUID.randomUUID();
        when(knowledgeBlockService.get(userId, blockId)).thenReturn(new KnowledgeBlockView(
                blockId, UUID.randomUUID(), UUID.randomUUID(), "Loops",
                "A loop repeats a bounded operation.", null, 1,
                Instant.now(), Instant.now(), null));

        SuggestionView suggestion = suggestionService.generate(userId,
                new SuggestionCommand(SuggestionType.SUMMARY, blockId, 3));

        assertThat(suggestion.type()).isEqualTo(SuggestionType.SUMMARY);
        assertThat(suggestion.title()).isNotBlank();
        assertThat(suggestion.body()).isEqualTo("A loop repeats a bounded operation.");
        assertThat(suggestion.citations()).isEmpty();
    }

    @Test
    void enforcesSuggestionTypeAndLimitBounds() {
        UUID blockId = UUID.randomUUID();
        assertThatThrownBy(() -> suggestionService.generate(UUID.randomUUID(),
                new SuggestionCommand(null, blockId, 3)))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> suggestionService.generate(UUID.randomUUID(),
                new SuggestionCommand(SuggestionType.QUESTIONS, blockId, 0)))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
