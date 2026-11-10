package com.auralis.app.ai;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.List;
import java.util.UUID;

@Schema(description = "Subject IDs whose current Overview result status should be checked")
public record OverviewSubjectStatusesRequest(
        @NotNull
        @Size(min = 1, max = 100)
        List<@NotNull UUID> subjectIds) {
}
