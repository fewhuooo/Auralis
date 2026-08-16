package com.auralis.app.ai;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record ConversationCommand(
        @Size(max = 240) String title,
        @NotNull Long baseVersion) {
}
