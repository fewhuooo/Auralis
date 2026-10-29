package com.auralis.app.ai;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import io.swagger.v3.oas.annotations.media.Schema;

public record TextGenerationCommand(@NotBlank @Size(max = 32)
        @Schema(allowableValues = {"summary", "extract", "format", "transcript"}) String operation,
        @NotBlank @Size(max = 48000) String input, @Size(max = 128) String requestId) {}
