package com.auralis.app.shared.config;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Positive;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

@Validated
@ConfigurationProperties(prefix = "auralis")
public record AuralisProperties(
        @NotBlank String environment,
        @Valid Api api,
        @Valid Upload upload,
        @Valid Identity identity
) {
    public record Api(@NotBlank String publicBaseUrl) {
    }

    public record Upload(@Positive long maxFileSizeBytes) {
    }

    public record Identity(
            String jwtSecret,
            @Positive long accessTokenTtlSeconds,
            @Positive long refreshSessionTtlSeconds) {
    }
}
