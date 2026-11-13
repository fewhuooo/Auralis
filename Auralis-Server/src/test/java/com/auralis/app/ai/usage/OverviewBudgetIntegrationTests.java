package com.auralis.app.ai.usage;

import com.auralis.app.ai.AiCredential;
import com.auralis.app.ai.AiMessageRole;
import com.auralis.app.ai.AiProviderPort;
import com.auralis.app.ai.AiProviderRequest;
import com.auralis.app.ai.AiProviderResponse;
import com.auralis.app.ai.AiProviderType;
import com.auralis.app.ai.AiSettingsService;
import com.auralis.app.ai.OverviewDocumentValidator;
import com.auralis.app.ai.OverviewDtos;
import com.auralis.app.ai.OverviewGenerationService;
import com.auralis.app.ai.OverviewMode;
import com.auralis.app.ai.usage.AiUsageLimitException;
import com.auralis.app.ai.internal.persistence.SourceChunkEntity;
import com.auralis.app.ai.internal.persistence.SourceChunkRepository;
import com.auralis.app.ai.internal.provider.AiProviderRegistry;
import com.auralis.app.ai.internal.provider.EmbeddingProviderRegistry;
import com.auralis.app.shared.config.AuralisProperties;
import com.auralis.app.source.SourceIngestionStatus;
import com.auralis.app.source.SourceService;
import com.auralis.app.source.SourceType;
import com.auralis.app.source.SourceView;
import com.auralis.app.subject.SubjectService;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.jdbc.datasource.init.ScriptUtils;

import java.sql.Connection;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class OverviewBudgetIntegrationTests {

    @Test
    void zeroOverviewCallLimitStillMetersPlatformCompletion() throws Exception {
        Fixture fixture = new Fixture(0);
        UUID userId = fixture.user();
        UUID sourceId = UUID.randomUUID();
        SourceService sources = mock(SourceService.class);
        when(sources.requireActiveSource(userId, sourceId)).thenReturn(source(sourceId, UUID.randomUUID()));
        SourceChunkRepository chunks = mock(SourceChunkRepository.class);
        when(chunks.findAllByUserIdAndSourceIdAndActiveTrueOrderByOrdinalAsc(userId, sourceId))
                .thenReturn(List.of(new SourceChunkEntity(UUID.randomUUID(), userId, sourceId, 0,
                        "Current evidence.", "a".repeat(64), 0, 17, "[]", UUID.randomUUID(), true)));
        ServiceFixture service = fixture.service(sources, mock(SubjectService.class), chunks, AiCredentialSource.PLATFORM);
        try {
            service.overview().generateSource(userId,
                    new OverviewDtos.SourceOverviewRequest(sourceId, OverviewMode.SUMMARY, null));
            assertThat(service.provider().requests).extracting(AiProviderRequest::maxTokens)
                    .containsExactly(480, 1_152, 819);
            assertRequestBudgetsMatchReservations(fixture, userId, service.provider().requests);
            assertThat(fixture.jdbc.queryForObject("select min(state) from ai_usage_reservations", String.class))
                    .isEqualTo("COMPLETED");
            assertThat(fixture.jdbc.queryForObject("select sum(charged_tokens) from ai_usage_reservations", Long.class))
                    .isEqualTo(36L);
        } finally {
            service.heartbeat().shutdownNow();
        }
    }

    @Test
    void singleBatchSourceOverviewDispatchesAndSettlesDynamicOutputRequest() throws Exception {
        Fixture fixture = new Fixture();
        UUID userId = fixture.user();
        UUID sourceId = UUID.randomUUID();
        UUID subjectId = UUID.randomUUID();
        SourceService sources = mock(SourceService.class);
        when(sources.requireActiveSource(userId, sourceId)).thenReturn(source(sourceId, subjectId));
        SourceChunkRepository chunks = mock(SourceChunkRepository.class);
        when(chunks.findAllByUserIdAndSourceIdAndActiveTrueOrderByOrdinalAsc(userId, sourceId))
                .thenReturn(List.of(new SourceChunkEntity(UUID.randomUUID(), userId, sourceId, 0,
                        "Limits are approached as x tends to zero.", "a".repeat(64), 0, 38, "[]",
                        UUID.randomUUID(), true)));
        ServiceFixture service = fixture.service(sources, mock(SubjectService.class), chunks);

        service.overview().generateSource(userId,
                new OverviewDtos.SourceOverviewRequest(sourceId, OverviewMode.SUMMARY, null));

        assertThat(service.provider().requests).hasSize(3).allSatisfy(request ->
                assertThat(request.maxTokens()).isPositive().isLessThanOrEqualTo(16_384));
        assertRequestBudgetsMatchReservations(fixture, userId, service.provider().requests);
        assertThat(fixture.jdbc.queryForObject("select min(state) from ai_usage_reservations", String.class))
                .isEqualTo("COMPLETED");
        assertThat(fixture.jdbc.queryForObject("select bool_and(request_dispatched) from ai_usage_reservations", Boolean.class))
                .isTrue();
        assertThat(fixture.jdbc.queryForObject("select sum(charged_tokens) from ai_usage_reservations", Long.class))
                .isEqualTo(36L);
        assertThat(fixture.jdbc.queryForObject("select owner_id from ai_usage_locks where scope_key like 'TASK:%'",
                String.class)).isNull();
        service.heartbeat().shutdownNow();
    }

    private static SourceView source(UUID sourceId, UUID subjectId) {
        Instant now = Instant.parse("2026-10-11T00:00:00Z");
        return new SourceView(sourceId, subjectId, SourceType.TEXT, "Limits", null, null, null, null,
                SourceIngestionStatus.READY, UUID.randomUUID(), null, null, 1, now, now, null, null);
    }

    private void assertRequestBudgetsMatchReservations(Fixture fixture, UUID userId,
                                                       List<AiProviderRequest> requests) {
        List<ReservationBudget> sentBudgets = requests.stream().map(request -> new ReservationBudget(
                AiInputTokenEstimator.estimateOverview(request).inputTokens(), request.maxTokens())).toList();
        List<ReservationBudget> reservedBudgets = fixture.jdbc.query(
                "select estimated_input_tokens, reserved_output_tokens from ai_usage_reservations where user_id=?",
                (row, index) -> new ReservationBudget(row.getLong(1), row.getLong(2)), userId);
        assertThat(reservedBudgets).containsExactlyInAnyOrderElementsOf(sentBudgets);
    }

    private record ReservationBudget(long input, long output) { }

    private static final class Fixture {
        private final DriverManagerDataSource dataSource = new DriverManagerDataSource(
                "jdbc:h2:mem:overview" + UUID.randomUUID().toString().replace("-", "")
                        + ";MODE=PostgreSQL;DB_CLOSE_DELAY=-1", "sa", "");
        private final JdbcTemplate jdbc = new JdbcTemplate(dataSource);
        private final DataSourceTransactionManager transactions = new DataSourceTransactionManager(dataSource);
        private final int overviewMaxCalls;

        Fixture() throws Exception {
            this(24);
        }

        Fixture(int overviewMaxCalls) throws Exception {
            this.overviewMaxCalls = overviewMaxCalls;
            jdbc.execute("create table users (id UUID primary key, status varchar(16) not null default 'ACTIVE')");
            jdbc.execute("create table ingestion_jobs (id UUID primary key, status varchar(16) not null, " +
                    "attempt_count integer not null default 0, created_at timestamp with time zone not null)");
            try (Connection connection = dataSource.getConnection()) {
                ScriptUtils.executeSqlScript(connection, new ClassPathResource("db/migration/V30__ai_usage_guard.sql"));
                ScriptUtils.executeSqlScript(connection, new ClassPathResource("db/migration/V33__ai_usage_operation_kind_and_source.sql"));
            }
        }

        UUID user() {
            UUID userId = UUID.randomUUID();
            jdbc.update("insert into users(id) values (?)", userId);
            return userId;
        }

        ServiceFixture service(SourceService sources, SubjectService subjects, SourceChunkRepository chunks) {
            return service(sources, subjects, chunks, AiCredentialSource.USER_SUPPLIED);
        }

        ServiceFixture service(SourceService sources, SubjectService subjects, SourceChunkRepository chunks,
                               int maxPromptChars) {
            return service(sources, subjects, chunks, AiCredentialSource.USER_SUPPLIED, maxPromptChars);
        }

        ServiceFixture service(SourceService sources, SubjectService subjects, SourceChunkRepository chunks,
                               AiCredentialSource source) {
            return service(sources, subjects, chunks, source, 0);
        }

        ServiceFixture service(SourceService sources, SubjectService subjects, SourceChunkRepository chunks,
                               AiCredentialSource source, int maxPromptChars) {
            AuralisProperties.Limits limits = new AuralisProperties.Limits(4, 2, 100_000, 200_000,
                    2_000_000, 60_000, 1_000, 4_096, 2, 32_000, overviewMaxCalls, 524_288, 512, 16_777_216);
            AuralisProperties.Ai ai = new AuralisProperties.Ai(false, "", new AuralisProperties.GenerationEndpoint(
                    "https://provider.test/v1", "test-model", "test-key", 100_000, 16_384),
                    null, 3_000, 10_000, 120_000, 240_000,
                    12_000, 8, 5_242_880, 32, 32_768, 3_000, 10_000, 3, 1_048_576,
                    List.of(), false, 1_000, 60_000, 3, limits, true,
                    List.of(new AuralisProperties.OverviewModelCapacity(
                            AiProviderType.OPENAI_COMPATIBLE.name(), "https://provider.test/v1", "test-model", 100_000, 16_384)),
                    maxPromptChars > 0
                            ? new AuralisProperties.OverviewLimits(maxPromptChars, 0, 0, 0, 0,
                                    0, 0, 0, 0, 0, 0)
                            : AuralisProperties.OverviewLimits.withoutAdditionalCaps());
            AuralisProperties properties = mock(AuralisProperties.class);
            when(properties.ai()).thenReturn(ai);
            AiSettingsService settings = mock(AiSettingsService.class);
            when(settings.resolve(any(), eq(AiProviderType.OPENAI_COMPATIBLE))).thenReturn(
                    new AiSettingsService.ResolvedSettings(AiProviderType.OPENAI_COMPATIBLE, "test-model",
                            new AiCredential("https://provider.test/v1", "synthetic-key"), source));
            RecordingProvider provider = new RecordingProvider();
            ScheduledExecutorService heartbeat = Executors.newScheduledThreadPool(1);
            AiUsageGuard guard = new AiUsageGuard(jdbc, transactions,
                    Clock.fixed(Instant.parse("2026-10-11T00:00:00Z"), ZoneId.of("UTC")), limits);
            AiInvocationGateway gateway = new AiUsageGatewayService(guard,
                    new AiProviderRegistry(List.of(provider)), new EmbeddingProviderRegistry(List.of()),
                    ai, heartbeat, transactions);
            OverviewGenerationService overview = new OverviewGenerationService(sources, subjects, chunks, settings,
                    gateway, properties, new OverviewDocumentValidator(new tools.jackson.databind.ObjectMapper()),
                    new tools.jackson.databind.ObjectMapper());
            return new ServiceFixture(overview, provider, heartbeat);
        }
    }

    private record ServiceFixture(OverviewGenerationService overview, RecordingProvider provider,
                                  ScheduledExecutorService heartbeat) { }

    private static final class RecordingProvider implements AiProviderPort {
        private final List<AiProviderRequest> requests = new java.util.concurrent.CopyOnWriteArrayList<>();
        private final List<AiProviderResponse> scriptedResponses = new java.util.concurrent.CopyOnWriteArrayList<>();
        private final AtomicInteger calls = new AtomicInteger();

        @Override public AiProviderType type() { return AiProviderType.OPENAI_COMPATIBLE; }
        @Override public AiProviderResponse complete(AiProviderRequest request, AiCredential credential) {
            return complete(request, credential, 120_000L);
        }
        @Override public AiProviderResponse complete(AiProviderRequest request, AiCredential credential,
                                                    long responseTimeoutMillis) {
            calls.incrementAndGet();
            requests.add(request);
            int responseIndex = calls.get() - 1;
            return responseIndex < scriptedResponses.size()
                    ? scriptedResponses.get(responseIndex) : new AiProviderResponse(request.structuredJson() ? "{\"exclusions\":[]}" : "# Supported material\nThe source explains limits.", 5L, 7L, "stop");
        }
    }
}
