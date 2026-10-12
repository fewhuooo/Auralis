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
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class OverviewBudgetIntegrationTests {

    @Test
    void singleBatchSourceOverviewDispatchesAndSettlesFinal6144Request() throws Exception {
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

        assertThat(service.provider().requests).singleElement().satisfies(request ->
                assertThat(request.maxTokens()).isEqualTo(6_144));
        assertThat(fixture.jdbc.queryForObject("select state from ai_usage_reservations", String.class))
                .isEqualTo("COMPLETED");
        assertThat(fixture.jdbc.queryForObject("select request_dispatched from ai_usage_reservations", Boolean.class))
                .isTrue();
        assertThat(fixture.jdbc.queryForObject("select charged_tokens from ai_usage_reservations", Long.class))
                .isEqualTo(12L);
        assertThat(fixture.jdbc.queryForObject("select owner_id from ai_usage_locks where scope_key like 'TASK:%'",
                String.class)).isNull();
        service.heartbeat().shutdownNow();
    }

    @Test
    void directSubjectOverviewDispatchesAndSettlesFinal6144Request() throws Exception {
        Fixture fixture = new Fixture();
        UUID userId = fixture.user();
        UUID sourceId = UUID.randomUUID();
        UUID subjectId = UUID.randomUUID();
        SourceService sources = mock(SourceService.class);
        when(sources.requireActiveSource(userId, sourceId)).thenReturn(source(sourceId, subjectId));
        SubjectService subjects = mock(SubjectService.class);
        when(subjects.requireActiveSubject(userId, subjectId)).thenReturn(null);
        ServiceFixture service = fixture.service(sources, subjects, mock(SourceChunkRepository.class));
        OverviewDtos.SubjectOverviewRequest request = new OverviewDtos.SubjectOverviewRequest(subjectId,
                OverviewMode.SUMMARY, null, List.of(new OverviewDtos.SubjectOverviewSourceInput(sourceId,
                "Limits", null, new OverviewDtos.OverviewSummary("A limit describes nearby behavior.",
                List.of("Values can approach a target."), List.of()))));

        service.overview().generateSubject(userId, request);

        assertThat(service.provider().requests).singleElement().satisfies(providerRequest ->
                assertThat(providerRequest.maxTokens()).isEqualTo(6_144));
        assertThat(fixture.jdbc.queryForObject("select state from ai_usage_reservations", String.class))
                .isEqualTo("COMPLETED");
        assertThat(fixture.jdbc.queryForObject("select charged_tokens from ai_usage_reservations", Long.class))
                .isEqualTo(12L);
        assertThat(fixture.jdbc.queryForObject("select owner_id from ai_usage_locks where scope_key like 'TASK:%'",
                String.class)).isNull();
        service.heartbeat().shutdownNow();
    }

    private static SourceView source(UUID sourceId, UUID subjectId) {
        Instant now = Instant.parse("2026-10-11T00:00:00Z");
        return new SourceView(sourceId, subjectId, SourceType.FILE, "Limits", null, null, null, null,
                SourceIngestionStatus.READY, UUID.randomUUID(), null, null, 1, now, now, null, null);
    }

    private static String response() {
        return "{\"schemaVersion\":1,\"title\":\"Limits\",\"outline\":null,\"summary\":{" +
                "\"overview\":\"Limits describe nearby behavior.\",\"keyPoints\":[\"Values approach a target.\"]," +
                "\"learningPath\":[]}}";
    }

    private static final class Fixture {
        private final DriverManagerDataSource dataSource = new DriverManagerDataSource(
                "jdbc:h2:mem:overview" + UUID.randomUUID().toString().replace("-", "")
                        + ";MODE=PostgreSQL;DB_CLOSE_DELAY=-1", "sa", "");
        private final JdbcTemplate jdbc = new JdbcTemplate(dataSource);
        private final DataSourceTransactionManager transactions = new DataSourceTransactionManager(dataSource);

        Fixture() throws Exception {
            jdbc.execute("create table users (id UUID primary key, status varchar(16) not null default 'ACTIVE')");
            jdbc.execute("create table ingestion_jobs (id UUID primary key, status varchar(16) not null, " +
                    "attempt_count integer not null default 0, created_at timestamp with time zone not null)");
            try (Connection connection = dataSource.getConnection()) {
                ScriptUtils.executeSqlScript(connection, new ClassPathResource("db/migration/V30__ai_usage_guard.sql"));
            }
        }

        UUID user() {
            UUID userId = UUID.randomUUID();
            jdbc.update("insert into users(id) values (?)", userId);
            return userId;
        }

        ServiceFixture service(SourceService sources, SubjectService subjects, SourceChunkRepository chunks) {
            AuralisProperties.Limits limits = new AuralisProperties.Limits(4, 2, 100_000, 200_000,
                    2_000_000, 60_000, 1_000, 4_096, 2, 32_000, 24, 524_288, 512, 16_777_216);
            AuralisProperties.Ai ai = new AuralisProperties.Ai(false, "", "DEEPSEEK",
                    new AuralisProperties.Defaults(null, null, null), 3_000, 10_000, 120_000, 240_000,
                    12_000, 8, 5_242_880, 32, 32_768, 3_000, 10_000, 3, 1_048_576,
                    List.of(), false, 1_000, 60_000, 3, limits);
            AuralisProperties properties = mock(AuralisProperties.class);
            when(properties.ai()).thenReturn(ai);
            AiSettingsService settings = mock(AiSettingsService.class);
            when(settings.resolve(any(), eq(AiProviderType.DEEPSEEK))).thenReturn(
                    new AiSettingsService.ResolvedSettings(AiProviderType.DEEPSEEK, "test-model",
                            new AiCredential("https://provider.test/v1", "synthetic-key")));
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
        private final AtomicInteger calls = new AtomicInteger();

        @Override public AiProviderType type() { return AiProviderType.DEEPSEEK; }
        @Override public AiProviderResponse complete(AiProviderRequest request, AiCredential credential) {
            return complete(request, credential, 120_000L);
        }
        @Override public AiProviderResponse complete(AiProviderRequest request, AiCredential credential,
                                                    long responseTimeoutMillis) {
            calls.incrementAndGet();
            requests.add(request);
            return new AiProviderResponse(response(), 5L, 7L);
        }
    }
}
