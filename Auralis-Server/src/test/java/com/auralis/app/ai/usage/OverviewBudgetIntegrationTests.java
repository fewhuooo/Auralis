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
            assertThat(service.provider().requests).hasSize(1);
            assertThat(fixture.jdbc.queryForObject("select state from ai_usage_reservations", String.class))
                    .isEqualTo("COMPLETED");
            assertThat(fixture.jdbc.queryForObject("select charged_tokens from ai_usage_reservations", Long.class))
                    .isEqualTo(12L);
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

        assertThat(service.provider().requests).singleElement().satisfies(request ->
                assertThat(request.maxTokens()).isPositive().isLessThanOrEqualTo(16_384));
        assertRequestBudgetsMatchReservations(fixture, userId, service.provider().requests);
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
    void directSubjectOverviewDispatchesAndSettlesDynamicOutputRequest() throws Exception {
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
                assertThat(providerRequest.maxTokens()).isPositive().isLessThanOrEqualTo(16_384));
        assertRequestBudgetsMatchReservations(fixture, userId, service.provider().requests);
        assertThat(fixture.jdbc.queryForObject("select state from ai_usage_reservations", String.class))
                .isEqualTo("COMPLETED");
        assertThat(fixture.jdbc.queryForObject("select charged_tokens from ai_usage_reservations", Long.class))
                .isEqualTo(12L);
        assertThat(fixture.jdbc.queryForObject("select owner_id from ai_usage_locks where scope_key like 'TASK:%'",
                String.class)).isNull();
        service.heartbeat().shutdownNow();
    }

    @Test
    void truncatedSourceRecoveryUsesFourRealGuardReservationsAndSharedTaskBudget() throws Exception {
        Fixture fixture = new Fixture();
        UUID userId = fixture.user();
        UUID sourceId = UUID.randomUUID();
        SourceService sources = mock(SourceService.class);
        when(sources.requireActiveSource(userId, sourceId)).thenReturn(source(sourceId, UUID.randomUUID()));
        SourceChunkRepository chunks = mock(SourceChunkRepository.class);
        when(chunks.findAllByUserIdAndSourceIdAndActiveTrueOrderByOrdinalAsc(userId, sourceId)).thenReturn(List.of(
                new SourceChunkEntity(UUID.randomUUID(), userId, sourceId, 0,
                        "Limits approach their target from the first direction.", "a".repeat(64), 0, 52, "[]",
                        UUID.randomUUID(), true),
                new SourceChunkEntity(UUID.randomUUID(), userId, sourceId, 1,
                        "Limits approach their target from the second direction.", "b".repeat(64), 0, 53, "[]",
                        UUID.randomUUID(), true)));
        ServiceFixture service = fixture.service(sources, mock(SubjectService.class), chunks);
        service.provider().scriptedResponses.addAll(List.of(
                new AiProviderResponse(response(), 100L, 6_144L, "length"),
                new AiProviderResponse(response(), 100L, 100L),
                new AiProviderResponse(response(), 100L, 100L),
                new AiProviderResponse(response(), 100L, 100L)));

        service.overview().generateSource(userId,
                new OverviewDtos.SourceOverviewRequest(sourceId, OverviewMode.SUMMARY, null));

        assertThat(service.provider().requests).extracting(AiProviderRequest::maxTokens)
                .hasSize(4).allSatisfy(value -> assertThat(value).isPositive().isLessThanOrEqualTo(16_384));
        assertRequestBudgetsMatchReservations(fixture, userId, service.provider().requests);
        assertThat(fixture.jdbc.queryForObject("select count(*) from ai_usage_reservations", Integer.class)).isEqualTo(4);
        assertThat(fixture.jdbc.queryForObject("select count(*) from ai_usage_reservations where state='COMPLETED'",
                Integer.class)).isEqualTo(4);
        assertThat(fixture.jdbc.queryForObject("select count(*) from ai_usage_reservations where request_dispatched=true",
                Integer.class)).isEqualTo(4);
        assertThat(fixture.jdbc.queryForObject("select count(distinct task_id) from ai_usage_reservations",
                Integer.class)).isEqualTo(1);
        assertThat(fixture.jdbc.queryForObject("select sum(actual_output_tokens) from ai_usage_reservations",
                Long.class)).isEqualTo(6_444L);
        assertThat(fixture.jdbc.queryForObject("select sum(charged_tokens) from ai_usage_reservations",
                Long.class)).isEqualTo(6_844L);
        assertThat(fixture.jdbc.queryForObject("select owner_id from ai_usage_locks where scope_key like 'TASK:%'",
                String.class)).isNull();
        service.heartbeat().shutdownNow();
    }

    @Test
    void multiBatchRecoveryKeepsEarlierMapAndUsesRealGuardLedgerForChildrenAndMerge() throws Exception {
        // Fixed Clock plus a one-call platform cap proves BYOK recovery terminates
        // from finite work/progress rules rather than elapsed time or platform quota.
        Fixture fixture = new Fixture(1);
        UUID userId = fixture.user();
        UUID sourceId = UUID.randomUUID();
        SourceService sources = mock(SourceService.class);
        when(sources.requireActiveSource(userId, sourceId)).thenReturn(source(sourceId, UUID.randomUUID()));
        SourceChunkRepository chunks = mock(SourceChunkRepository.class);
        String firstBatch = "FIRST_BATCH_" + "a".repeat(6_000);
        String failingBatch = "FAILING_BATCH_" + "b".repeat(6_000);
        when(chunks.findAllByUserIdAndSourceIdAndActiveTrueOrderByOrdinalAsc(userId, sourceId)).thenReturn(List.of(
                new SourceChunkEntity(UUID.randomUUID(), userId, sourceId, 0,
                        firstBatch, "a".repeat(64), 0, firstBatch.length(), "[]", UUID.randomUUID(), true),
                new SourceChunkEntity(UUID.randomUUID(), userId, sourceId, 1,
                        failingBatch, "b".repeat(64), 0, failingBatch.length(), "[]", UUID.randomUUID(), true)));
        ServiceFixture service = fixture.service(sources, mock(SubjectService.class), chunks, 10_000);
        service.provider().scriptedResponses.addAll(List.of(
                new AiProviderResponse(response(), 100L, 100L),
                new AiProviderResponse(response(), 100L, 4_608L, "length"),
                new AiProviderResponse(response(), 100L, 100L),
                new AiProviderResponse(response(), 100L, 100L),
                new AiProviderResponse(response(), 100L, 100L)));

        service.overview().generateSource(userId,
                new OverviewDtos.SourceOverviewRequest(sourceId, OverviewMode.SUMMARY, null));

        assertThat(service.provider().requests).extracting(AiProviderRequest::maxTokens)
                .hasSize(5).allSatisfy(value -> assertThat(value).isPositive().isLessThanOrEqualTo(16_384));
        assertRequestBudgetsMatchReservations(fixture, userId, service.provider().requests);
        assertThat(service.provider().requests.get(0).messages().stream()
                .filter(message -> message.role() == AiMessageRole.USER).findFirst().orElseThrow().content())
                .contains(firstBatch).doesNotContain(failingBatch);
        assertThat(service.provider().requests.get(1).messages().stream()
                .filter(message -> message.role() == AiMessageRole.USER).findFirst().orElseThrow().content())
                .contains(failingBatch);
        assertThat(service.provider().requests.get(2).messages().stream()
                .filter(message -> message.role() == AiMessageRole.USER).findFirst().orElseThrow().content())
                .contains("FAILING_BATCH_").doesNotContain(firstBatch);
        assertThat(service.provider().requests.get(3).messages().stream()
                .filter(message -> message.role() == AiMessageRole.USER).findFirst().orElseThrow().content())
                .contains("\"chunks\":[\"b").doesNotContain(firstBatch);
        assertThat(service.provider().requests.get(4).messages().stream()
                .filter(message -> message.role() == AiMessageRole.USER).findFirst().orElseThrow().content())
                .contains("mapJson");
        assertThat(fixture.jdbc.queryForObject("select count(*) from ai_usage_reservations", Integer.class)).isEqualTo(5);
        assertThat(fixture.jdbc.queryForList("select distinct credential_source from ai_usage_reservations", String.class))
                .containsExactly("USER_SUPPLIED");
        assertThat(fixture.jdbc.queryForObject("select count(*) from ai_usage_reservations where state='COMPLETED'",
                Integer.class)).isEqualTo(5);
        assertThat(fixture.jdbc.queryForObject("select count(*) from ai_usage_reservations where request_dispatched=true",
                Integer.class)).isEqualTo(5);
        assertThat(fixture.jdbc.queryForObject("select count(distinct task_id) from ai_usage_reservations",
                Integer.class)).isEqualTo(1);
        assertThat(fixture.jdbc.queryForObject("select sum(actual_output_tokens) from ai_usage_reservations",
                Long.class)).isEqualTo(5_008L);
        assertThat(fixture.jdbc.queryForObject("select sum(actual_input_tokens) from ai_usage_reservations",
                Long.class)).isEqualTo(500L);
        assertThat(fixture.jdbc.queryForObject("select sum(charged_tokens) from ai_usage_reservations",
                Long.class)).isEqualTo(5_508L);
        assertThat(fixture.jdbc.queryForObject("select owner_id from ai_usage_locks where scope_key like 'TASK:%'",
                String.class)).isNull();
        service.heartbeat().shutdownNow();
    }

    @Test
    void truncatedSubjectMapRecoveryPreservesSelectedAliasesThroughRealGuardAndMerge() throws Exception {
        Fixture fixture = new Fixture();
        UUID userId = fixture.user();
        UUID subjectId = UUID.randomUUID();
        UUID firstSource = UUID.randomUUID();
        UUID secondSource = UUID.randomUUID();
        SourceService sources = mock(SourceService.class);
        when(sources.requireActiveSource(userId, firstSource)).thenReturn(source(firstSource, subjectId));
        when(sources.requireActiveSource(userId, secondSource)).thenReturn(source(secondSource, subjectId));
        SubjectService subjects = mock(SubjectService.class);
        when(subjects.requireActiveSubject(userId, subjectId)).thenReturn(null);
        ServiceFixture service = fixture.service(sources, subjects, mock(SourceChunkRepository.class));
        service.provider().scriptedResponses.addAll(List.of(
                new AiProviderResponse("truncated", 100L, 6_144L, "length"),
                new AiProviderResponse(subjectResponse("source-1"), 100L, 100L),
                new AiProviderResponse(subjectResponse("source-2"), 100L, 100L),
                new AiProviderResponse(subjectResponse("source-1", "source-2"), 100L, 100L)));
        OverviewDtos.SubjectOverviewRequest request = new OverviewDtos.SubjectOverviewRequest(subjectId,
                OverviewMode.ALL, null, List.of(
                new OverviewDtos.SubjectOverviewSourceInput(firstSource, "First", sourceOutline(firstSource),
                        new OverviewDtos.OverviewSummary("FIRST_FACT", List.of(), List.of())),
                new OverviewDtos.SubjectOverviewSourceInput(secondSource, "Second", sourceOutline(secondSource),
                        new OverviewDtos.OverviewSummary("SECOND_FACT", List.of(), List.of()))));

        OverviewDtos.OverviewResponse result = service.overview().generateSubject(userId, request);

        assertThat(service.provider().requests).extracting(AiProviderRequest::maxTokens)
                .hasSize(4).allSatisfy(value -> assertThat(value).isPositive().isLessThanOrEqualTo(16_384));
        assertRequestBudgetsMatchReservations(fixture, userId, service.provider().requests);
        assertThat(userContent(service.provider().requests.get(0))).contains("source-1", "source-2", "FIRST_FACT", "SECOND_FACT");
        assertThat(userContent(service.provider().requests.get(1))).contains("source-1", "FIRST_FACT")
                .doesNotContain("source-2", "SECOND_FACT");
        assertThat(userContent(service.provider().requests.get(2))).contains("source-2", "SECOND_FACT")
                .doesNotContain("source-1", "FIRST_FACT");
        assertThat(result.outline()).flatExtracting(chapter -> chapter.sections())
                .extracting(section -> section.sourceIds())
                .containsExactlyInAnyOrder(List.of(firstSource.toString()), List.of(secondSource.toString()));
        assertThat(fixture.jdbc.queryForObject("select count(*) from ai_usage_reservations", Integer.class)).isEqualTo(4);
        assertThat(fixture.jdbc.queryForObject("select count(*) from ai_usage_reservations where state='COMPLETED' and request_dispatched=true",
                Integer.class)).isEqualTo(4);
        assertThat(fixture.jdbc.queryForObject("select count(distinct task_id) from ai_usage_reservations", Integer.class)).isEqualTo(1);
        assertThat(fixture.jdbc.queryForObject("select sum(actual_output_tokens) from ai_usage_reservations", Long.class)).isEqualTo(6_444L);
        assertThat(fixture.jdbc.queryForObject("select sum(charged_tokens) from ai_usage_reservations", Long.class)).isEqualTo(6_844L);
        assertThat(fixture.jdbc.queryForObject("select owner_id from ai_usage_locks where scope_key like 'TASK:%'", String.class)).isNull();
        service.heartbeat().shutdownNow();
    }

    @Test
    void truncatedReduceRecoveryKeepsBothMapPartialsThroughRealGuardAndFinalCoverage() throws Exception {
        Fixture fixture = new Fixture();
        UUID userId = fixture.user();
        UUID sourceId = UUID.randomUUID();
        SourceService sources = mock(SourceService.class);
        when(sources.requireActiveSource(userId, sourceId)).thenReturn(source(sourceId, UUID.randomUUID()));
        SourceChunkRepository chunks = mock(SourceChunkRepository.class);
        String firstBatch = "REDUCE_FIRST_" + "a".repeat(6_000);
        String secondBatch = "REDUCE_SECOND_" + "b".repeat(6_000);
        when(chunks.findAllByUserIdAndSourceIdAndActiveTrueOrderByOrdinalAsc(userId, sourceId)).thenReturn(List.of(
                new SourceChunkEntity(UUID.randomUUID(), userId, sourceId, 0,
                        firstBatch, "a".repeat(64), 0, firstBatch.length(), "[]", UUID.randomUUID(), true),
                new SourceChunkEntity(UUID.randomUUID(), userId, sourceId, 1,
                        secondBatch, "b".repeat(64), 0, secondBatch.length(), "[]", UUID.randomUUID(), true)));
        ServiceFixture service = fixture.service(sources, mock(SubjectService.class), chunks, 10_000);
        service.provider().scriptedResponses.addAll(List.of(
                new AiProviderResponse(sourceAllResponse("MAP_FIRST_FACT"), 100L, 100L),
                new AiProviderResponse(sourceAllResponse("MAP_SECOND_FACT"), 100L, 100L),
                new AiProviderResponse("truncated reduce", 100L, 6_144L, "length"),
                new AiProviderResponse(sourceAllResponse("REDUCE_FIRST_PART"), 100L, 100L),
                new AiProviderResponse(sourceAllResponse("REDUCE_SECOND_PART"), 100L, 100L),
                new AiProviderResponse(sourceAllResponse("REDUCE_FIRST_PART REDUCE_SECOND_PART"), 100L, 100L)));

        OverviewDtos.OverviewResponse result = service.overview().generateSource(userId,
                new OverviewDtos.SourceOverviewRequest(sourceId, OverviewMode.ALL, null));

        assertThat(service.provider().requests).extracting(AiProviderRequest::maxTokens)
                .hasSize(6).allSatisfy(value -> assertThat(value).isPositive().isLessThanOrEqualTo(16_384));
        assertRequestBudgetsMatchReservations(fixture, userId, service.provider().requests);
        assertThat(userContent(service.provider().requests.get(3))).contains("MAP_FIRST_FACT")
                .doesNotContain("MAP_SECOND_FACT");
        assertThat(userContent(service.provider().requests.get(4))).contains("MAP_SECOND_FACT")
                .doesNotContain("MAP_FIRST_FACT");
        assertThat(userContent(service.provider().requests.get(5))).contains("REDUCE_FIRST_PART", "REDUCE_SECOND_PART");
        assertThat(result.summary().overview()).contains("REDUCE_FIRST_PART", "REDUCE_SECOND_PART");
        assertThat(result.outline()).flatExtracting(chapter -> chapter.sections())
                .extracting(section -> section.sourceIds()).containsExactly(List.of(sourceId.toString()));
        assertThat(fixture.jdbc.queryForObject("select count(*) from ai_usage_reservations", Integer.class)).isEqualTo(6);
        assertThat(fixture.jdbc.queryForObject("select count(*) from ai_usage_reservations where state='COMPLETED' and request_dispatched=true",
                Integer.class)).isEqualTo(6);
        assertThat(fixture.jdbc.queryForObject("select count(distinct task_id) from ai_usage_reservations", Integer.class)).isEqualTo(1);
        assertThat(fixture.jdbc.queryForObject("select sum(actual_output_tokens) from ai_usage_reservations", Long.class)).isEqualTo(6_644L);
        assertThat(fixture.jdbc.queryForObject("select sum(charged_tokens) from ai_usage_reservations", Long.class)).isEqualTo(7_244L);
        assertThat(fixture.jdbc.queryForObject("select owner_id from ai_usage_locks where scope_key like 'TASK:%'", String.class)).isNull();
        service.heartbeat().shutdownNow();
    }

    @Test
    void jsonRepairPropagatesRealGuardCallLimitFailure() throws Exception {
        Fixture fixture = new Fixture(1);
        UUID userId = fixture.user();
        UUID sourceId = UUID.randomUUID();
        SourceService sources = mock(SourceService.class);
        when(sources.requireActiveSource(userId, sourceId)).thenReturn(source(sourceId, UUID.randomUUID()));
        SourceChunkRepository chunks = mock(SourceChunkRepository.class);
        when(chunks.findAllByUserIdAndSourceIdAndActiveTrueOrderByOrdinalAsc(userId, sourceId)).thenReturn(List.of(
                new SourceChunkEntity(UUID.randomUUID(), userId, sourceId, 0,
                        "A short source fact.", "a".repeat(64), 0, 20, "[]", UUID.randomUUID(), true)));
        ServiceFixture service = fixture.service(sources, mock(SubjectService.class), chunks,
                AiCredentialSource.PLATFORM);
        service.provider().scriptedResponses.add(new AiProviderResponse("{\"schemaVersion\":1,\"title\":", 5L, 7L));

        assertThatThrownBy(() -> service.overview().generateSource(userId,
                new OverviewDtos.SourceOverviewRequest(sourceId, OverviewMode.SUMMARY, null)))
                .isInstanceOf(AiUsageLimitException.class)
                .extracting(error -> ((AiUsageLimitException) error).code())
                .isEqualTo("AI_TASK_BUDGET_EXCEEDED");

        assertThat(service.provider().requests).hasSize(1);
        assertThat(fixture.jdbc.queryForObject("select count(*) from ai_usage_reservations", Integer.class)).isEqualTo(1);
        assertThat(fixture.jdbc.queryForObject("select count(*) from ai_usage_reservations where request_dispatched=true",
                Integer.class)).isEqualTo(1);
        assertThat(fixture.jdbc.queryForObject("select count(*) from ai_usage_reservations where state='COMPLETED'",
                Integer.class)).isEqualTo(1);
        service.heartbeat().shutdownNow();
    }

    private static SourceView source(UUID sourceId, UUID subjectId) {
        Instant now = Instant.parse("2026-10-11T00:00:00Z");
        return new SourceView(sourceId, subjectId, SourceType.FILE, "Limits", null, null, null, null,
                SourceIngestionStatus.READY, UUID.randomUUID(), null, null, 1, now, now, null, null);
    }

    private void assertRequestBudgetsMatchReservations(Fixture fixture, UUID userId,
                                                       List<AiProviderRequest> requests) {
        List<Long> sentBudgets = requests.stream().map(request -> (long) request.maxTokens()).sorted().toList();
        List<Long> reservedBudgets = fixture.jdbc.queryForList(
                        "select reserved_output_tokens from ai_usage_reservations where user_id=?",
                        Long.class, userId).stream().sorted().toList();
        assertThat(sentBudgets).containsExactlyElementsOf(reservedBudgets);
    }

    private static String response() {
        return "{\"schemaVersion\":1,\"title\":\"Limits\",\"outline\":null,\"summary\":{" +
                "\"overview\":\"Limits describe nearby behavior.\",\"keyPoints\":[\"Values approach a target.\"]," +
                "\"learningPath\":[]}}";
    }

    private static String subjectResponse(String... aliases) {
        String sections = java.util.Arrays.stream(aliases)
                .map(alias -> "{\"title\":\"" + alias + "\",\"summary\":\"subject fact\",\"sourceIds\":[\"" + alias + "\"],\"locator\":null}")
                .collect(java.util.stream.Collectors.joining(","));
        return "{\"schemaVersion\":1,\"title\":\"Subject\",\"outline\":[{\"title\":\"Selected sources\",\"sections\":[" + sections + "]}]," +
                "\"summary\":{\"overview\":\"Combined subject facts.\",\"keyPoints\":[],\"learningPath\":[]}}";
    }

    private static List<OverviewDtos.OverviewChapter> sourceOutline(UUID sourceId) {
        return List.of(new OverviewDtos.OverviewChapter("Source outline", List.of(
                new OverviewDtos.OverviewSection("Source fact", "Source-specific outline fact.",
                        List.of(sourceId.toString()), null))));
    }

    private static String sourceAllResponse(String fact) {
        return "{\"schemaVersion\":1,\"title\":\"Limits\",\"outline\":[{\"title\":\"Mapped facts\",\"sections\":[{" +
                "\"title\":\"" + fact + "\",\"summary\":\"" + fact + "\",\"sourceIds\":[\"source-1\"],\"locator\":null}]}]," +
                "\"summary\":{\"overview\":\"" + fact + "\",\"keyPoints\":[],\"learningPath\":[]}}";
    }

    private static String userContent(AiProviderRequest request) {
        return request.messages().stream().filter(message -> message.role() == AiMessageRole.USER)
                .findFirst().orElseThrow().content();
    }

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
            AuralisProperties.Ai ai = new AuralisProperties.Ai(false, "", "DEEPSEEK",
                    new AuralisProperties.Defaults(null, null, null), 3_000, 10_000, 120_000, 240_000,
                    12_000, 8, 5_242_880, 32, 32_768, 3_000, 10_000, 3, 1_048_576,
                    List.of(), false, 1_000, 60_000, 3, limits, true, true,
                    "legacy-bytes", List.of(new AuralisProperties.OverviewModelCapacity(
                            AiProviderType.DEEPSEEK.name(), "https://provider.test/v1", "test-model", 100_000, 16_384)),
                    maxPromptChars > 0
                            ? new AuralisProperties.OverviewLimits(maxPromptChars, 0, 0, 0, 0,
                                    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0)
                            : AuralisProperties.OverviewLimits.withoutAdditionalCaps(), 0);
            AuralisProperties properties = mock(AuralisProperties.class);
            when(properties.ai()).thenReturn(ai);
            AiSettingsService settings = mock(AiSettingsService.class);
            when(settings.resolve(any(), eq(AiProviderType.DEEPSEEK))).thenReturn(
                    new AiSettingsService.ResolvedSettings(AiProviderType.DEEPSEEK, "test-model",
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

        @Override public AiProviderType type() { return AiProviderType.DEEPSEEK; }
        @Override public AiProviderResponse complete(AiProviderRequest request, AiCredential credential) {
            return complete(request, credential, 120_000L);
        }
        @Override public AiProviderResponse complete(AiProviderRequest request, AiCredential credential,
                                                    long responseTimeoutMillis) {
            calls.incrementAndGet();
            requests.add(request);
            int responseIndex = calls.get() - 1;
            return responseIndex < scriptedResponses.size()
                    ? scriptedResponses.get(responseIndex) : new AiProviderResponse(response(), 5L, 7L);
        }
    }
}
