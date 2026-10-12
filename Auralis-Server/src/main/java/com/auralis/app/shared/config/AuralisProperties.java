package com.auralis.app.shared.config;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Positive;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

import java.util.List;

@Validated
@ConfigurationProperties(prefix = "auralis")
public record AuralisProperties(
        @NotBlank String environment,
        @Valid Api api,
        @Valid Upload upload,
        @Valid Identity identity,
        @Valid Ai ai
) {
    public record Api(
            @NotBlank String publicBaseUrl,
            @NotBlank String allowedOrigins) {
    }

    public record Upload(
            @Positive long maxFileSizeBytes,
            String storageProvider,
            @Valid Storage storage) {
    }

    public record Storage(
            String endpoint,
            String publicEndpoint,
            String bucket,
            String accessKey,
            String secretKey,
            @Positive long presignTtlSeconds) {

        public String presignEndpoint() {
            return publicEndpoint == null || publicEndpoint.isBlank()
                    ? endpoint
                    : publicEndpoint;
        }
    }

    public record Identity(
            String jwtSecret,
            @Positive long accessTokenTtlSeconds,
            @Positive long refreshSessionTtlSeconds) {
    }

    public record Ai(
            boolean enabled,
            String encryptionKey,
            String defaultProvider,
            @Valid Defaults defaults,
            @Positive long providerConnectTimeoutMillis,
            @Positive long requestTimeoutMillis,
            @Min(60_000) @Max(120_000) long overviewResponseTimeoutMillis,
            @Min(1_000) @Max(300_000) long overviewTaskTimeoutMillis,
            @Positive int maxPromptChars,
            @Positive int maxRetrievedChunks,
            @Positive long ingestionMaxBytes,
            @Positive int ingestionEmbeddingBatchMaxItems,
            @Positive long ingestionEmbeddingBatchMaxUtf8Bytes,
            @Positive long urlConnectTimeoutMillis,
            @Positive long urlReadTimeoutMillis,
            @jakarta.validation.constraints.PositiveOrZero int urlMaxRedirects,
            @Positive long providerMaxResponseBytes,
            List<String> allowedProviderHosts,
            boolean ingestionWorkerEnabled,
            @Positive long ingestionPollDelayMillis,
            @Positive long ingestionLeaseMillis,
            @Positive int ingestionMaxAttempts,
            @Valid Limits limits) {
    }

    public record Limits(
            @Min(1) int globalConcurrent,
            @Min(1) int perUserConcurrent,
            @Positive long perUserHourlyTokens,
            @Positive long perUserDailyTokens,
            @Positive long globalDailyTokens,
            @Min(60_000) @Max(3_600_000) long reservationLeaseMillis,
            @Min(1_000) @Max(300_000) long heartbeatMillis,
            @Min(1) @Max(16_384) int chatMaxOutputTokens,
            @Min(1) @Max(100) int chatMaxCalls,
            @Positive long chatTaskTokens,
            @Min(1) @Max(512) int overviewMaxCalls,
            @Positive long overviewTaskTokens,
            @Min(1) @Max(1_024) int ingestionMaxCalls,
            @Positive long ingestionTaskTokens) {

        @jakarta.validation.constraints.AssertTrue
        public boolean isHeartbeatWindowSafe() {
            return reservationLeaseMillis > 0 && heartbeatMillis > 0
                    && heartbeatMillis <= reservationLeaseMillis / 3;
        }

        @jakarta.validation.constraints.AssertTrue
        public boolean isQuotaWindowSafe() {
            return perUserHourlyTokens <= perUserDailyTokens
                    && perUserDailyTokens <= globalDailyTokens;
        }
    }

    public record Defaults(
            @Valid Provider deepseek,
            @Valid Provider openaiCompatible,
            @Valid Provider siliconflow) {
    }

    public record Provider(
            String baseUrl,
            String chatModel,
            String embeddingModel,
            String apiKey) {

        @Override
        public String toString() {
            return "Provider[baseUrl=" + baseUrl
                    + ", chatModel=" + chatModel
                    + ", embeddingModel=" + embeddingModel
                    + ", apiKey=<redacted>]";
        }
    }
}
