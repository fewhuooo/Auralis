package com.auralis.app.identity;

import io.swagger.v3.oas.annotations.media.Schema;

import java.util.UUID;

public record UserView(UUID id, String username, String displayName, long version,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) boolean hasAvatar) {
}
