package com.auralis.app.focus;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

import java.time.Instant;
import java.util.UUID;

public record FocusSessionCommand(
        @NotNull UUID clientSessionId,
        UUID taskId,
        @NotNull Instant startedAt,
        @NotNull Instant endedAt,
        @Min(0) @Max(86400) int durationSeconds,
        @NotNull Boolean completed) {
}
