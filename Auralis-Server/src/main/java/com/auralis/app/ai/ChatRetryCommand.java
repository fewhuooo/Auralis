package com.auralis.app.ai;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record ChatRetryCommand(@NotBlank @Size(max = 128) String requestId) {}
