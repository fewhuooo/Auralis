package com.auralis.app.ai;

import com.auralis.app.knowledge.KnowledgeBlockService;
import com.auralis.app.knowledge.KnowledgeBlockView;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Service
public class SuggestionService {

    private final KnowledgeBlockService knowledgeBlockService;

    public SuggestionService(KnowledgeBlockService knowledgeBlockService) {
        this.knowledgeBlockService = knowledgeBlockService;
    }

    public SuggestionView generate(UUID userId, SuggestionCommand command) {
        if (command.type() == null || command.knowledgeBlockId() == null) {
            throw new IllegalArgumentException("Suggestion type and knowledgeBlockId are required");
        }
        int limit = command.limit() == null ? 3 : command.limit();
        if (limit < 1 || limit > 20) {
            throw new IllegalArgumentException("Suggestion limit must be between 1 and 20");
        }
        KnowledgeBlockView block = knowledgeBlockService.get(userId, command.knowledgeBlockId());
        String body = switch (command.type()) {
            case SUMMARY -> block.content().trim();
            case QUESTIONS -> "What are the key questions raised by " + block.title() + "?";
            case NEXT_STEPS -> "Review the main idea in " + block.title() + " and write one concrete example.";
            case REVIEW_PROMPT -> "Explain " + block.title() + " in your own words and identify one uncertainty.";
        };
        return new SuggestionView(UUID.randomUUID(), command.type(), title(command.type()), bound(body, 2000),
                List.of(), Instant.now());
    }

    private String title(SuggestionType type) {
        return switch (type) {
            case SUMMARY -> "Summary";
            case QUESTIONS -> "Questions to explore";
            case NEXT_STEPS -> "Next steps";
            case REVIEW_PROMPT -> "Review prompt";
        };
    }

    private String bound(String value, int max) {
        return value.length() <= max ? value : value.substring(0, max);
    }
}
