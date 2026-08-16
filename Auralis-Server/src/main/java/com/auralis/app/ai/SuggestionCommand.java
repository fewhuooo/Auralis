package com.auralis.app.ai;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

import java.util.UUID;

public record SuggestionCommand(
        @NotNull SuggestionType type,
        @NotNull UUID knowledgeBlockId,
        @Min(1) @Max(20) Integer limit) {
}
