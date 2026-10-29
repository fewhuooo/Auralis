package com.auralis.app.shared.config;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Pattern;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.ConstructorBinding;
import org.springframework.validation.annotation.Validated;

import java.util.List;
import java.util.HashSet;
import java.util.Objects;

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
            @Min(60_000) long overviewResponseTimeoutMillis,
            @Min(0) long overviewTaskTimeoutMillis,
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
            @Valid Limits limits,
            boolean shadowTokenEstimateEnabled,
            boolean overviewOutputRecoveryEnabled,
            @Pattern(regexp = "legacy-bytes|calibrated-category|mimo-byte-category-candidate")
            String overviewInputTokenEstimatorMode,
            @Valid List<@Valid OverviewModelCapacity> overviewModelCapacities,
            @Valid OverviewLimits overviewLimits,
            @Min(0) int overviewMaxRetries) {

        @ConstructorBinding
        public Ai {
            overviewModelCapacities = overviewModelCapacities == null
                    ? List.of() : List.copyOf(overviewModelCapacities);
            overviewLimits = overviewLimits == null ? OverviewLimits.withoutAdditionalCaps() : overviewLimits;
            HashSet<List<Object>> identities = new HashSet<>();
            for (OverviewModelCapacity capacity : overviewModelCapacities) {
                Objects.requireNonNull(capacity, "overview model capacity");
                List<Object> identity = List.of(capacity.provider(), capacity.endpoint(), capacity.model());
                if (!identities.add(identity)) {
                    throw new IllegalArgumentException("Overview model capacity profiles must be unique");
                }
            }
        }

        public Ai(boolean enabled, String encryptionKey, String defaultProvider, Defaults defaults,
                  long providerConnectTimeoutMillis, long requestTimeoutMillis,
                  long overviewResponseTimeoutMillis, long overviewTaskTimeoutMillis,
                  int maxPromptChars, int maxRetrievedChunks, long ingestionMaxBytes,
                  int ingestionEmbeddingBatchMaxItems, long ingestionEmbeddingBatchMaxUtf8Bytes,
                  long urlConnectTimeoutMillis, long urlReadTimeoutMillis, int urlMaxRedirects,
                  long providerMaxResponseBytes, List<String> allowedProviderHosts,
                  boolean ingestionWorkerEnabled, long ingestionPollDelayMillis,
                  long ingestionLeaseMillis, int ingestionMaxAttempts, Limits limits) {
            this(enabled, encryptionKey, defaultProvider, defaults, providerConnectTimeoutMillis,
                    requestTimeoutMillis, overviewResponseTimeoutMillis, overviewTaskTimeoutMillis,
                    maxPromptChars, maxRetrievedChunks, ingestionMaxBytes, ingestionEmbeddingBatchMaxItems,
                    ingestionEmbeddingBatchMaxUtf8Bytes, urlConnectTimeoutMillis, urlReadTimeoutMillis,
                    urlMaxRedirects, providerMaxResponseBytes, allowedProviderHosts, ingestionWorkerEnabled,
                    ingestionPollDelayMillis, ingestionLeaseMillis, ingestionMaxAttempts, limits,
                    true, true, "legacy-bytes", List.of(), OverviewLimits.withoutAdditionalCaps(), 3);
        }

        /** Convenience fixture constructor with the default estimator mode and no custom model capacities. */
        public Ai(boolean enabled, String encryptionKey, String defaultProvider, Defaults defaults,
                  long providerConnectTimeoutMillis, long requestTimeoutMillis,
                  long overviewResponseTimeoutMillis, long overviewTaskTimeoutMillis,
                  int maxPromptChars, int maxRetrievedChunks, long ingestionMaxBytes,
                  int ingestionEmbeddingBatchMaxItems, long ingestionEmbeddingBatchMaxUtf8Bytes,
                  long urlConnectTimeoutMillis, long urlReadTimeoutMillis, int urlMaxRedirects,
                  long providerMaxResponseBytes, List<String> allowedProviderHosts,
                  boolean ingestionWorkerEnabled, long ingestionPollDelayMillis,
                  long ingestionLeaseMillis, int ingestionMaxAttempts, Limits limits,
                  boolean shadowTokenEstimateEnabled, boolean overviewOutputRecoveryEnabled) {
            this(enabled, encryptionKey, defaultProvider, defaults, providerConnectTimeoutMillis,
                    requestTimeoutMillis, overviewResponseTimeoutMillis, overviewTaskTimeoutMillis,
                    maxPromptChars, maxRetrievedChunks, ingestionMaxBytes, ingestionEmbeddingBatchMaxItems,
                    ingestionEmbeddingBatchMaxUtf8Bytes, urlConnectTimeoutMillis, urlReadTimeoutMillis,
                    urlMaxRedirects, providerMaxResponseBytes, allowedProviderHosts, ingestionWorkerEnabled,
                    ingestionPollDelayMillis, ingestionLeaseMillis, ingestionMaxAttempts, limits,
                    shadowTokenEstimateEnabled, overviewOutputRecoveryEnabled, "legacy-bytes", List.of(),
                    OverviewLimits.withoutAdditionalCaps(), 3);
        }
    }

    public record OverviewModelCapacity(
            @NotBlank @Pattern(regexp = "DEEPSEEK|OPENAI_COMPATIBLE|SILICONFLOW") String provider,
            @jakarta.validation.constraints.NotBlank String endpoint,
            @jakarta.validation.constraints.NotBlank String model,
            @Positive long contextWindowTokens,
            @Positive long maxOutputTokens) {

        public OverviewModelCapacity {
            if (provider == null || !provider.matches("DEEPSEEK|OPENAI_COMPATIBLE|SILICONFLOW")
                    || endpoint == null || endpoint.isBlank()
                    || model == null || model.isBlank() || contextWindowTokens < 1
                    || maxOutputTokens < 1 || maxOutputTokens > contextWindowTokens) {
                throw new IllegalArgumentException("Overview model capacity profile is invalid");
            }
        }
    }

    /**
     * Optional Overview-only extra caps; zero means no extra static cap, while model capacity and quotas remain.
     * Positive output limits only lower the resolved model maximum and can never raise it.
     */
    public record OverviewLimits(
            @Min(0) long maxPromptChars,
            @Min(0) long maxRequestBytes,
            @Min(0) long maxInputTokens,
            @Min(0) long maxOutputTokens,
            @Min(0) long maxResponseBytes,
            @Min(0) long maxResultChars,
            @Min(0) long maxCheckpointChars,
            @Min(0) long maxPlanChars,
            @Min(0) long maxNodeDescriptorChars,
            @Min(0) int maxChapters,
            @Min(0) int maxSections,
            @Min(0) long maxProseChars,
            @Min(0) int maxGuideItems,
            @Min(0) int maxSourceIdsPerSection,
            @Min(0) int maxProvenanceSections,
            @Min(0) int maxProvenanceRefsPerSection,
            @Min(0) long maxProvenanceRefs,
            @Min(0) long maxProvenanceLocations,
            @Min(0) int maxWriterNodesPerPlan,
            @Min(0) long maxInputSnapshotChars,
            @Min(0) long maxSourceManifestChars,
            @Min(0) long maxJobRequestChars,
            @Min(0) int maxSources,
            @Min(0) int maxTitleChars,
            @Min(0) long maxIdentityChars,
            @Min(0) int maxProvenanceLocationsPerRef) {

        public static OverviewLimits withoutAdditionalCaps() {
            return new OverviewLimits(0, 0, 0, 0, 0,
                    0, 0, 0, 0, 0,
                    0, 0, 0, 0, 0,
                    0, 0, 0, 0, 0,
                    0, 0, 0,
                    0, 0, 0);
        }
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
            @Min(0) int overviewMaxCalls,
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
