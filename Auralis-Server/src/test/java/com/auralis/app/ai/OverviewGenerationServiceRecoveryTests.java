package com.auralis.app.ai;

import com.auralis.app.AuralisApplication;
import com.auralis.app.ai.OverviewDtos.SourceOverviewRequest;
import com.auralis.app.ai.OverviewDtos.SubjectOverviewRequest;
import com.auralis.app.ai.OverviewDtos.SubjectOverviewSourceInput;
import com.auralis.app.ai.OverviewDtos.OverviewChapter;
import com.auralis.app.ai.OverviewDtos.OverviewSection;
import com.auralis.app.ai.OverviewDtos.OverviewSummary;
import com.auralis.app.ai.internal.persistence.SourceChunkEntity;
import com.auralis.app.ai.internal.persistence.SourceChunkRepository;
import com.auralis.app.ai.internal.provider.AiProviderRegistry;
import com.auralis.app.ai.usage.AiFeature;
import com.auralis.app.ai.usage.AiInvocationGateway;
import com.auralis.app.ai.usage.AiOperationPolicyResolver;
import com.auralis.app.ai.usage.AiUsageGuard;
import com.auralis.app.ai.usage.AiTaskContext;
import com.auralis.app.ai.usage.AiUsageLimitException;
import com.auralis.app.shared.config.AuralisProperties;
import com.auralis.app.source.SourceIngestionStatus;
import com.auralis.app.source.SourceService;
import com.auralis.app.source.SourceType;
import com.auralis.app.source.SourceView;
import com.auralis.app.subject.SubjectService;
import com.auralis.app.subject.SubjectView;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.util.ReflectionTestUtils;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;
import tools.jackson.databind.ObjectMapper;

import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.Executor;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ScheduledExecutorService;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.doAnswer;

@Testcontainers
@EnabledIfSystemProperty(named = "auralis.postgres.it", matches = "true")
@SpringBootTest(classes = AuralisApplication.class)
@ActiveProfiles("postgres-it")
// Recovery call positions use a deliberate fixture cap; production defaults add no prompt-size cap.
@TestPropertySource(properties = "auralis.ai.overview-limits.max-prompt-chars=12000")
class OverviewGenerationServiceRecoveryTests {

    @Container
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>(
            DockerImageName.parse("pgvector/pgvector:0.8.6-pg17-bookworm").asCompatibleSubstituteFor("postgres"));

    @DynamicPropertySource
    static void databaseProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
    }

    @Autowired private JdbcTemplate jdbc;
    @Autowired private OverviewGenerationService service;
    @Autowired private OverviewGenerationCoordinator coordinator;
    @Autowired private AiInvocationGateway invocationGateway;
    @MockitoSpyBean private AiUsageGuard usageGuard;
    @Autowired private AuralisProperties properties;
    @Autowired private OverviewDocumentValidator documentValidator;
    @Autowired private ObjectMapper objectMapper;
    @Autowired @Qualifier("overviewDeadlineScheduler") private ScheduledExecutorService deadlineScheduler;
    @MockitoBean private SourceService sourceService;
    @MockitoBean private SubjectService subjectService;
    @MockitoBean private SourceChunkRepository chunkRepository;
    @MockitoBean private AiSettingsService settingsService;
    @MockitoBean private AiProviderRegistry providerRegistry;

    private UUID userId;
    private UUID sourceId;
    private UUID subjectId;
    private UUID revision;
    private SourceView source;
    private AtomicInteger providerCalls;
    private AtomicInteger failAtCall;
    private volatile CountDownLatch providerEntered;
    private volatile CountDownLatch providerRelease;
    private volatile String providerContent;
    private volatile List<String> providerResponses;
    private volatile List<AiProviderResponse> providerResponseDetails;
    private volatile List<AiProviderRequest> providerRequests;
    private volatile AiUsageLimitException providerFailure;
    private volatile boolean adaptiveBudgetScenario;
    private volatile boolean adaptiveBudgetSaturateReservation;
    private volatile AtomicBoolean failNextAdaptiveBudgetDiagnostic;
    private volatile UUID adaptiveBudgetReservationId;
    private volatile long adaptiveBudgetOriginalCharge;

    @BeforeEach
    void prepare() {
        ReflectionTestUtils.setField(service, "adaptiveGenerationEnabled", false);
        ReflectionTestUtils.setField(service, "properties", properties);
        ReflectionTestUtils.setField(usageGuard, "limits", properties.ai().limits());
        ReflectionTestUtils.setField(usageGuard, "policies",
                new AiOperationPolicyResolver(properties.ai().limits()));
        userId = UUID.randomUUID();
        sourceId = UUID.randomUUID();
        subjectId = UUID.randomUUID();
        revision = UUID.randomUUID();
        providerCalls = new AtomicInteger();
        failAtCall = new AtomicInteger(-1);
        providerEntered = null;
        providerRelease = null;
        providerResponses = List.of();
        providerResponseDetails = List.of();
        adaptiveBudgetScenario = false;
        adaptiveBudgetSaturateReservation = false;
        failNextAdaptiveBudgetDiagnostic = null;
        adaptiveBudgetReservationId = null;
        adaptiveBudgetOriginalCharge = 0L;
        providerRequests = new java.util.concurrent.CopyOnWriteArrayList<>();
        providerContent = "{\"schemaVersion\":1,\"title\":\"Durable source\",\"outline\":[{\"title\":\"Chapter\","
                + "\"sections\":[{\"title\":\"Section\",\"summary\":\"A durable fact.\","
                + "\"sourceIds\":[\"source-1\"],\"locator\":null}]}],\"summary\":null}";
        String username = "overview-service-it-" + userId;
        jdbc.update("insert into users(id,username,normalized_username,password_hash,status) "
                        + "values (?,?,?,'synthetic-hash','ACTIVE')",
                userId, username, username.toLowerCase(java.util.Locale.ROOT));
        source = new SourceView(sourceId, subjectId, SourceType.FILE, "Durable source", null, null, null, null,
                SourceIngestionStatus.READY, revision, null, null, 1, Instant.now(), Instant.now(), null, null);
        persistCurrentSource(source);
        when(sourceService.requireActiveSource(userId, sourceId)).thenReturn(source);
        when(settingsService.resolve(eq(userId), any())).thenReturn(new AiSettingsService.ResolvedSettings(
                AiProviderType.DEEPSEEK, "deepseek-v4-flash", new AiCredential("https://api.deepseek.com", "test-key"), com.auralis.app.ai.usage.AiCredentialSource.USER_SUPPLIED));
        when(chunkRepository.findAllByUserIdAndSourceIdAndActiveTrueOrderByOrdinalAsc(userId, sourceId))
                .thenReturn(List.of(new SourceChunkEntity(UUID.randomUUID(), userId, sourceId, 0,
                        "Durable content paragraph.", "a".repeat(64), 0, 27, null)));
        AiProviderPort provider = mock(AiProviderPort.class);
        when(providerRegistry.require(AiProviderType.DEEPSEEK)).thenReturn(provider);
        when(provider.complete(any(AiProviderRequest.class), any(AiCredential.class), anyLong(), any()))
                .thenAnswer(call -> {
            int callNumber = providerCalls.incrementAndGet();
            providerRequests.add(call.getArgument(0));
            CountDownLatch entered = providerEntered;
            CountDownLatch release = providerRelease;
            if (entered != null && release != null) {
                entered.countDown();
                if (!release.await(10, TimeUnit.SECONDS)) throw new IllegalStateException("provider test barrier timed out");
            }
            AiUsageLimitException usageFailure = providerFailure;
            if (usageFailure != null) throw usageFailure;
            if (callNumber == failAtCall.get()) throw new IllegalStateException("injected provider failure");
            if (adaptiveBudgetSaturateReservation && callNumber == 3) saturatePriorAdaptiveReservation();
            AtomicBoolean failDiagnostic = failNextAdaptiveBudgetDiagnostic;
            if (failDiagnostic != null && callNumber == 3) failDiagnostic.set(true);
            if (adaptiveBudgetScenario) {
                return new AiProviderResponse(adaptiveBudgetResponse(call.getArgument(0)), 100L, 100L);
            }
            List<AiProviderResponse> detailedResponses = providerResponseDetails;
            if (callNumber <= detailedResponses.size()) return detailedResponses.get(callNumber - 1);
            List<String> responses = providerResponses;
            String content = callNumber <= responses.size() ? responses.get(callNumber - 1) : providerContent;
            return new AiProviderResponse(content, 100, 100);
        });
    }

    private void persistCurrentSource(SourceView current) {
        jdbc.update("insert into subjects(id,user_id,name) values (?,?,?) on conflict (id) do update "
                        + "set user_id=excluded.user_id,name=excluded.name,deleted_at=null",
                current.subjectId(), userId, "Durable subject");
        jdbc.update("insert into sources(id,user_id,type,subject_id,title,ingestion_status,ingestion_revision) "
                        + "values (?,?,?,?,?,?,?) on conflict (id) do update set user_id=excluded.user_id,"
                        + "type=excluded.type,subject_id=excluded.subject_id,title=excluded.title,"
                        + "ingestion_status=excluded.ingestion_status,ingestion_revision=excluded.ingestion_revision,deleted_at=null",
                current.id(), userId, current.type().name(), current.subjectId(), current.title(),
                current.ingestionStatus().name(), current.ingestionRevision());
    }

    @Test
    void truncationRecoveryPersistsSafeGenerationAuditAndReplaysWithoutNewGeneration() {
        when(chunkRepository.findAllByUserIdAndSourceIdAndActiveTrueOrderByOrdinalAsc(userId, sourceId))
                .thenReturn(List.of(
                        new SourceChunkEntity(UUID.randomUUID(), userId, sourceId, 0,
                                "First durable source fact.", "a".repeat(64), 0, 26, null),
                        new SourceChunkEntity(UUID.randomUUID(), userId, sourceId, 1,
                                "Second durable source fact.", "b".repeat(64), 0, 27, null)));
        String summary = "{\"schemaVersion\":1,\"title\":\"Durable source\",\"outline\":null,"
                + "\"summary\":{\"overview\":\"Durable summary.\",\"keyPoints\":[],\"learningPath\":[]}}";
        providerResponseDetails = List.of(
                new AiProviderResponse(summary, 100L, 6_144L, "length"),
                new AiProviderResponse("{\"schemaVersion\":1,\"title\":", 100L, 100L),
                new AiProviderResponse(summary, 100L, 100L),
                new AiProviderResponse(summary, 100L, 100L),
                new AiProviderResponse(summary, 100L, 100L));
        String requestId = UUID.randomUUID().toString();
        SourceOverviewRequest request = new SourceOverviewRequest(sourceId, OverviewMode.SUMMARY, null);

        service.generateSource(userId, request, requestId);

        UUID generationId = jdbc.queryForObject("select id from overview_generations where user_id=?",
                UUID.class, userId);
        UUID budgetTaskId = jdbc.queryForObject("select budget_task_id from overview_generations where id=?",
                UUID.class, generationId);
        assertThat(jdbc.queryForObject("select recovery_count from overview_generations where id=?",
                Integer.class, generationId)).isEqualTo(2);
        assertThat(jdbc.queryForObject("select recovery_actions_json from overview_generations where id=?",
                String.class, generationId)).contains("PROVIDER_TRUNCATION_SPLIT", "PROVIDER_JSON_REPAIR");

        service.generateSource(userId, request, requestId);

        assertThat(jdbc.queryForObject("select count(*) from overview_generations where user_id=?", Integer.class, userId))
                .isEqualTo(1);
        assertThat(jdbc.queryForObject("select id from overview_generations where user_id=?", UUID.class, userId))
                .isEqualTo(generationId);
        assertThat(jdbc.queryForObject("select budget_task_id from overview_generations where id=?", UUID.class, generationId))
                .isEqualTo(budgetTaskId);
        assertThat(jdbc.queryForObject("select recovery_count from overview_generations where id=?",
                Integer.class, generationId)).isEqualTo(2);
        assertThat(jdbc.queryForObject("select recovery_actions_json from overview_generations where id=?",
                String.class, generationId)).contains("PROVIDER_TRUNCATION_SPLIT", "PROVIDER_JSON_REPAIR");
    }

    @Test
    void springServicePersistsAndReplaysRequestIdAndCreatesNewGenerationForNewRequestId() {
        String firstRequestId = UUID.randomUUID().toString();
        SourceOverviewRequest request = new SourceOverviewRequest(sourceId, OverviewMode.OUTLINE, "keep definitions");

        var first = service.generateSource(userId, request, firstRequestId);
        var replay = service.generateSource(userId, request, firstRequestId);

        assertThat(replay).isEqualTo(first);
        assertThat(providerCalls).hasValue(1);
        assertThat(jdbc.queryForObject("select count(*) from overview_generations where user_id=?", Integer.class, userId))
                .isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from overview_generation_requests where user_id=?", Integer.class, userId))
                .isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from ai_usage_reservations where user_id=?", Integer.class, userId))
                .isEqualTo(1);

        service.generateSource(userId, request, UUID.randomUUID().toString());
        assertThat(providerCalls).hasValue(2);
        assertThat(jdbc.queryForObject("select count(*) from overview_generations where user_id=?", Integer.class, userId))
                .isEqualTo(2);
        assertThat(jdbc.queryForObject("select count(*) from ai_usage_reservations where user_id=?", Integer.class, userId))
                .isEqualTo(2);
    }

    @Test
    void sameRequestIdRejectsChangedActiveChunkPayloadEvenWhenRevisionIsUnchanged() {
        String requestId = UUID.randomUUID().toString();
        SourceOverviewRequest request = new SourceOverviewRequest(sourceId, OverviewMode.OUTLINE, null);
        service.generateSource(userId, request, requestId);
        when(chunkRepository.findAllByUserIdAndSourceIdAndActiveTrueOrderByOrdinalAsc(userId, sourceId))
                .thenReturn(List.of(new SourceChunkEntity(UUID.randomUUID(), userId, sourceId, 0,
                        "Changed active chunk under same revision.", "b".repeat(64), 0, 40, null)));

        assertThatThrownBy(() -> service.generateSource(userId, request, requestId))
                .hasMessageContaining("already bound");
        assertThat(providerCalls).hasValue(1);
    }

    @Test
    void sourceTitleAndRevisionParticipateInDurableInputIdentity() {
        SourceOverviewRequest request = new SourceOverviewRequest(sourceId, OverviewMode.OUTLINE, null);
        String firstRequestId = UUID.randomUUID().toString();
        service.generateSource(userId, request, firstRequestId);
        SourceView changedTitle = new SourceView(sourceId, subjectId, SourceType.FILE, "Renamed source", null, null, null, null,
                SourceIngestionStatus.READY, revision, null, null, 2, Instant.now(), Instant.now(), null, null);
        persistCurrentSource(changedTitle);
        when(sourceService.requireActiveSource(userId, sourceId)).thenReturn(changedTitle);

        assertThatThrownBy(() -> service.generateSource(userId, request, firstRequestId))
                .hasMessageContaining("already bound");
        assertThat(providerCalls).hasValue(1);

        SourceView changedRevision = new SourceView(sourceId, subjectId, SourceType.FILE, "Renamed source", null, null, null, null,
                SourceIngestionStatus.READY, UUID.randomUUID(), null, null, 3, Instant.now(), Instant.now(), null, null);
        persistCurrentSource(changedRevision);
        when(sourceService.requireActiveSource(userId, sourceId)).thenReturn(changedRevision);
        service.generateSource(userId, request, UUID.randomUUID().toString());
        assertThat(providerCalls).hasValue(2);
        assertThat(jdbc.queryForObject("select count(*) from overview_generations where user_id=?", Integer.class, userId))
                .isEqualTo(2);
    }

    @Test
    void deletedSourceCannotBeServedFromDurableReplay() {
        SourceOverviewRequest request = new SourceOverviewRequest(sourceId, OverviewMode.OUTLINE, null);
        String requestId = UUID.randomUUID().toString();
        service.generateSource(userId, request, requestId);
        when(sourceService.requireActiveSource(userId, sourceId)).thenThrow(
                new com.auralis.app.shared.error.DomainException("RESOURCE_DELETED", "Source was deleted"));

        assertThatThrownBy(() -> service.generateSource(userId, request, requestId))
                .isInstanceOf(com.auralis.app.shared.error.DomainException.class)
                .hasMessageContaining("Source was deleted");
        assertThat(providerCalls).hasValue(1);
    }

    @Test
    void explicitRetryCreatesFreshGenerationAndRerunsLegacyMapSteps() {
        when(chunkRepository.findAllByUserIdAndSourceIdAndActiveTrueOrderByOrdinalAsc(userId, sourceId))
                .thenReturn(List.of(
                        new SourceChunkEntity(UUID.randomUUID(), userId, sourceId, 0,
                                "A".repeat(7_000), "c".repeat(64), 0, 7_000, null),
                        new SourceChunkEntity(UUID.randomUUID(), userId, sourceId, 1,
                                "B".repeat(7_000), "d".repeat(64), 7_000, 14_000, null)));
        failAtCall.set(3);
        SourceOverviewRequest request = new SourceOverviewRequest(sourceId, OverviewMode.OUTLINE, null);
        String failedRequestId = UUID.randomUUID().toString();
        assertThatThrownBy(() -> service.generateSource(userId, request, failedRequestId))
                .hasMessageContaining("AI provider failed");
        UUID generationId = jdbc.queryForObject("select id from overview_generations where user_id=?", UUID.class, userId);
        UUID budgetTaskId = jdbc.queryForObject("select budget_task_id from overview_generations where id=?", UUID.class, generationId);
        assertThat(jdbc.queryForObject("select count(*) from overview_generation_checkpoints where generation_id=?",
                Integer.class, generationId)).isEqualTo(2);

        recordTrustedFinalUsageForInjectedFailure(userId, generationId);

        failAtCall.set(-1);
        SourceOverviewRequest retry = new SourceOverviewRequest(sourceId, OverviewMode.OUTLINE, null,
                UUID.fromString(failedRequestId));
        service.generateSource(userId, retry, UUID.randomUUID().toString());

        // Legacy MAP checkpoints do not have the adaptive INDEX identity contract used for cross-generation reuse.
        assertThat(providerCalls).hasValue(6);
        UUID retryGenerationId = jdbc.queryForObject("select id from overview_generations where retry_of_generation_id=?",
                UUID.class, generationId);
        UUID retryBudgetTaskId = jdbc.queryForObject("select budget_task_id from overview_generations where id=?",
                UUID.class, retryGenerationId);
        assertThat(retryBudgetTaskId).isNotEqualTo(budgetTaskId);
        assertThat(jdbc.queryForObject("select status from overview_generations where id=?", String.class,
                generationId)).isEqualTo("FAILED");
        assertThat(jdbc.queryForObject("select count(*) from ai_usage_reservations where user_id=?", Integer.class, userId))
                .isEqualTo(6);
        assertThat(jdbc.queryForObject("select count(distinct task_id) from ai_usage_reservations where user_id=?", Integer.class, userId))
                .isEqualTo(2);
    }

    @Test
    void unresolvedDispatchedUsageBlocksSameRequestRetryWithoutAnotherProviderCall() {
        when(chunkRepository.findAllByUserIdAndSourceIdAndActiveTrueOrderByOrdinalAsc(userId, sourceId))
                .thenReturn(List.of(
                        new SourceChunkEntity(UUID.randomUUID(), userId, sourceId, 0,
                                "A".repeat(7_000), "c".repeat(64), 0, 7_000, null),
                        new SourceChunkEntity(UUID.randomUUID(), userId, sourceId, 1,
                                "B".repeat(7_000), "d".repeat(64), 7_000, 14_000, null)));
        failAtCall.set(3);
        SourceOverviewRequest request = new SourceOverviewRequest(sourceId, OverviewMode.OUTLINE, null);
        String requestId = UUID.randomUUID().toString();

        assertThatThrownBy(() -> service.generateSource(userId, request, requestId))
                .isInstanceOf(com.auralis.app.shared.error.DomainException.class)
                .extracting(error -> ((com.auralis.app.shared.error.DomainException) error).code())
                .isEqualTo("MODEL_PROVIDER_ERROR");
        UUID generationId = jdbc.queryForObject("select id from overview_generations where user_id=?", UUID.class, userId);
        UUID budgetTaskId = jdbc.queryForObject("select budget_task_id from overview_generations where id=?", UUID.class, generationId);
        assertThat(providerCalls).hasValue(3);
        assertThat(jdbc.queryForObject("select count(*) from overview_generation_checkpoints where generation_id=?",
                Integer.class, generationId)).isEqualTo(2);
        UUID unresolvedReservationId = requireSingleUnknownDispatchedInvocation(userId, generationId);

        failAtCall.set(-1);
        assertThatThrownBy(() -> service.generateSource(userId, request, requestId))
                .isInstanceOf(com.auralis.app.shared.error.DomainException.class)
                .extracting(error -> ((com.auralis.app.shared.error.DomainException) error).code())
                .isEqualTo("OVERVIEW_GENERATION_FAILED");
        assertThat(providerCalls).hasValue(3);
        assertThat(jdbc.queryForObject("select id from overview_generations where user_id=?", UUID.class, userId))
                .isEqualTo(generationId);
        assertThat(jdbc.queryForObject("select budget_task_id from overview_generations where id=?", UUID.class, generationId))
                .isEqualTo(budgetTaskId);
        assertThat(requireSingleUnknownDispatchedInvocation(userId, generationId)).isEqualTo(unresolvedReservationId);
    }

    @Test
    void terminalUnknownWriterRetryResumesAtFailedNodeThroughTheServiceGate() {
        ReflectionTestUtils.setField(service, "adaptiveGenerationEnabled", true);
        adaptiveBudgetScenario = true;
        failAtCall.set(4);
        when(settingsService.resolve(eq(userId), any())).thenReturn(new AiSettingsService.ResolvedSettings(
                AiProviderType.DEEPSEEK, "deepseek-v4-flash",
                new AiCredential("https://api.deepseek.com", "test-key"),
                com.auralis.app.ai.usage.AiCredentialSource.PLATFORM));
        String firstChunk = "SERVICE_RECOVERY_FIRST_VERIFIED_INPUT";
        String secondChunk = "SERVICE_RECOVERY_SECOND_FAILED_INPUT";
        List<SourceChunkEntity> chunks = List.of(
                new SourceChunkEntity(UUID.randomUUID(), userId, sourceId, 0,
                        firstChunk, "e".repeat(64), 0, firstChunk.length(), null),
                new SourceChunkEntity(UUID.randomUUID(), userId, sourceId, 1,
                        secondChunk, "f".repeat(64), firstChunk.length(),
                        firstChunk.length() + secondChunk.length(), null));
        when(chunkRepository.findAllByUserIdAndSourceIdAndActiveTrueOrderByOrdinalAsc(userId, sourceId))
                .thenReturn(chunks);
        when(chunkRepository.findActiveForAdaptiveOverview(eq(userId), eq(sourceId),
                any(org.springframework.data.domain.Pageable.class))).thenReturn(chunks);
        SourceOverviewRequest request = new SourceOverviewRequest(sourceId, OverviewMode.OUTLINE, null);
        String requestId = UUID.randomUUID().toString();

        assertThatThrownBy(() -> service.generateSource(userId, request, requestId))
                .isInstanceOf(com.auralis.app.shared.error.DomainException.class)
                .extracting(error -> ((com.auralis.app.shared.error.DomainException) error).code())
                .isEqualTo("MODEL_PROVIDER_ERROR");
        UUID generationId = jdbc.queryForObject("select id from overview_generations where user_id=?",
                UUID.class, userId);
        UUID budgetTaskId = jdbc.queryForObject("select budget_task_id from overview_generations where id=?",
                UUID.class, generationId);
        UUID ledgerTaskId = AiTaskContext.overviewLedgerTaskId(userId, AiFeature.SOURCE_OVERVIEW, budgetTaskId);
        assertThat(jdbc.queryForObject("select count(*) from overview_execution_nodes where generation_id=? and state='VERIFIED'",
                Integer.class, generationId)).isEqualTo(1);
        UUID unknownReservationId = jdbc.queryForObject("select id from ai_usage_reservations where user_id=? and task_id=? "
                        + "and credential_source='PLATFORM' and request_dispatched=true "
                        + "and actual_input_tokens is null and actual_output_tokens is null",
                UUID.class, userId, ledgerTaskId);
        long originalUnknownCharge = jdbc.queryForObject("select charged_tokens from ai_usage_reservations where id=?",
                Long.class, unknownReservationId);
        assertThat(originalUnknownCharge).isGreaterThan(0);
        int callsBeforeRetry = providerCalls.get();
        int reservationsBeforeRetry = jdbc.queryForObject("select count(*) from ai_usage_reservations where user_id=? and task_id=?",
                Integer.class, userId, ledgerTaskId);
        int requestsBeforeRetry = providerRequests.size();

        failAtCall.set(-1);
        SourceOverviewRequest retry = new SourceOverviewRequest(sourceId, OverviewMode.OUTLINE, null,
                UUID.fromString(requestId));
        assertThat(service.generateSource(userId, retry, UUID.randomUUID().toString())).isNotNull();

        assertThat(providerCalls.get() - callsBeforeRetry).isEqualTo(2);
        List<String> resumedWriterPrompts = providerRequests.subList(requestsBeforeRetry, providerRequests.size())
                .stream().map(this::providerUserData).filter(data -> data.contains("write_one_section")).toList();
        assertThat(resumedWriterPrompts).hasSize(1).allMatch(data -> data.contains(secondChunk))
                .noneMatch(data -> data.contains(firstChunk));
        assertThat(providerRequests.subList(requestsBeforeRetry, providerRequests.size()).stream()
                .map(this::providerUserData).filter(data -> data.contains("adaptive_boundary_edit"))).hasSize(1);
        UUID retryGenerationId = jdbc.queryForObject("select id from overview_generations where retry_of_generation_id=?",
                UUID.class, generationId);
        UUID retryBudgetTaskId = jdbc.queryForObject("select budget_task_id from overview_generations where id=?",
                UUID.class, retryGenerationId);
        UUID retryLedgerTaskId = AiTaskContext.overviewLedgerTaskId(userId, AiFeature.SOURCE_OVERVIEW, retryBudgetTaskId);
        assertThat(retryBudgetTaskId).isNotEqualTo(budgetTaskId);
        assertThat(jdbc.queryForObject("select status from overview_generations where id=?", String.class,
                generationId)).isEqualTo("FAILED");
        assertThat(jdbc.queryForObject("select charged_tokens from ai_usage_reservations where id=?",
                Long.class, unknownReservationId)).isEqualTo(originalUnknownCharge);
        assertThat(jdbc.queryForObject("select count(*) from ai_usage_reservations where user_id=? and task_id=?",
                Integer.class, userId, ledgerTaskId)).isEqualTo(reservationsBeforeRetry);
        assertThat(jdbc.queryForObject("select count(*) from ai_usage_reservations where user_id=? and task_id=?",
                Integer.class, userId, retryLedgerTaskId)).isEqualTo(2);
        assertThat(jdbc.queryForObject("select count(*) from overview_execution_nodes where generation_id=? and state='VERIFIED'",
                Integer.class, retryGenerationId)).isEqualTo(2);
    }




    @Test
    void terminalUnknownAdaptiveWriterRetryUsesVerifiedCheckpointInFreshGeneration() {
        ReflectionTestUtils.setField(service, "adaptiveGenerationEnabled", true);
        adaptiveBudgetScenario = true;
        failAtCall.set(4);
        when(settingsService.resolve(eq(userId), any())).thenReturn(new AiSettingsService.ResolvedSettings(
                AiProviderType.DEEPSEEK, "deepseek-v4-flash",
                new AiCredential("https://api.deepseek.com", "test-key"),
                com.auralis.app.ai.usage.AiCredentialSource.PLATFORM));
        String firstChunk = "FIRST_UNKNOWN_WRITER_REPLAY_INPUT";
        String secondChunk = "SECOND_UNKNOWN_WRITER_REPLAY_INPUT";
        List<SourceChunkEntity> chunks = List.of(
                new SourceChunkEntity(UUID.randomUUID(), userId, sourceId, 0,
                        firstChunk, "e".repeat(64), 0, firstChunk.length(), null),
                new SourceChunkEntity(UUID.randomUUID(), userId, sourceId, 1,
                        secondChunk, "f".repeat(64), firstChunk.length(),
                        firstChunk.length() + secondChunk.length(), null));
        when(chunkRepository.findAllByUserIdAndSourceIdAndActiveTrueOrderByOrdinalAsc(userId, sourceId))
                .thenReturn(chunks);
        when(chunkRepository.findActiveForAdaptiveOverview(eq(userId), eq(sourceId),
                any(org.springframework.data.domain.Pageable.class))).thenReturn(chunks);
        SourceOverviewRequest request = new SourceOverviewRequest(sourceId, OverviewMode.OUTLINE, null);
        String requestId = UUID.randomUUID().toString();

        assertThatThrownBy(() -> service.generateSource(userId, request, requestId))
                .isInstanceOf(com.auralis.app.shared.error.DomainException.class)
                .extracting(error -> ((com.auralis.app.shared.error.DomainException) error).code())
                .isEqualTo("MODEL_PROVIDER_ERROR");
        UUID generationId = jdbc.queryForObject("select id from overview_generations where user_id=?",
                UUID.class, userId);
        UUID budgetTaskId = jdbc.queryForObject("select budget_task_id from overview_generations where id=?",
                UUID.class, generationId);
        UUID ledgerTaskId = AiTaskContext.overviewLedgerTaskId(userId, AiFeature.SOURCE_OVERVIEW, budgetTaskId);
        assertThat(jdbc.queryForObject("select count(*) from overview_execution_nodes where generation_id=? and state='VERIFIED'",
                Integer.class, generationId)).isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from overview_execution_nodes where generation_id=? and state='FAILED'",
                Integer.class, generationId)).isEqualTo(1);
        UUID unknownReservation = jdbc.queryForObject("select id from ai_usage_reservations where task_id=? "
                + "and request_dispatched=true and actual_input_tokens is null and actual_output_tokens is null",
                UUID.class, ledgerTaskId);
        long unknownCharge = jdbc.queryForObject("select charged_tokens from ai_usage_reservations where id=?",
                Long.class, unknownReservation);
        assertThat(unknownCharge).isGreaterThan(0);
        int callsBeforeRetry = providerCalls.get();
        int reservationsBeforeRetry = jdbc.queryForObject("select count(*) from ai_usage_reservations where task_id=?",
                Integer.class, ledgerTaskId);
        int requestsBeforeRetry = providerRequests.size();

        failAtCall.set(-1);
        SourceOverviewRequest retry = new SourceOverviewRequest(sourceId, OverviewMode.OUTLINE, null,
                UUID.fromString(requestId));
        assertThat(service.generateSource(userId, retry, UUID.randomUUID().toString())).isNotNull();

        assertThat(providerCalls.get() - callsBeforeRetry).isEqualTo(2);
        assertThat(providerRequests.subList(requestsBeforeRetry, providerRequests.size()).stream()
                .map(this::providerUserData).filter(data -> data.contains("write_one_section")))
                .hasSize(1).allMatch(data -> data.contains(secondChunk)).noneMatch(data -> data.contains(firstChunk));
        UUID retryGenerationId = jdbc.queryForObject("select id from overview_generations where retry_of_generation_id=?",
                UUID.class, generationId);
        UUID retryBudgetTaskId = jdbc.queryForObject("select budget_task_id from overview_generations where id=?",
                UUID.class, retryGenerationId);
        UUID retryLedgerTaskId = AiTaskContext.overviewLedgerTaskId(userId, AiFeature.SOURCE_OVERVIEW, retryBudgetTaskId);
        assertThat(retryBudgetTaskId).isNotEqualTo(budgetTaskId);
        assertThat(jdbc.queryForObject("select status from overview_generations where id=?", String.class,
                generationId)).isEqualTo("FAILED");
        assertThat(jdbc.queryForObject("select count(*) from overview_execution_nodes where generation_id=? and state='VERIFIED'",
                Integer.class, retryGenerationId)).isEqualTo(2);
        assertThat(jdbc.queryForObject("select charged_tokens from ai_usage_reservations where id=?",
                Long.class, unknownReservation)).isEqualTo(unknownCharge);
        assertThat(jdbc.queryForObject("select count(*) from ai_usage_reservations where task_id=?",
                Integer.class, ledgerTaskId)).isEqualTo(reservationsBeforeRetry);
        assertThat(jdbc.queryForObject("select count(*) from ai_usage_reservations where task_id=?",
                Integer.class, retryLedgerTaskId)).isEqualTo(2);
    }

    @Test
    void writerProgressBudgetDiagnosticFailureDoesNotFailCompletionOrCacheReturn() {
        ReflectionTestUtils.setField(service, "adaptiveGenerationEnabled", true);
        adaptiveBudgetScenario = true;
        failNextAdaptiveBudgetDiagnostic = new AtomicBoolean(false);
        AtomicBoolean failOnce = failNextAdaptiveBudgetDiagnostic;
        doAnswer(invocation -> {
            if (failOnce.compareAndSet(true, false)) {
                throw new IllegalStateException("injected writer progress diagnostic read failure");
            }
            return invocation.callRealMethod();
        }).when(usageGuard).platformTaskBudgetUsage(any(AiUsageGuard.TaskLease.class));

        String firstChunk = "FIRST_DIAGNOSTIC_CHILD_INPUT";
        String secondChunk = "SECOND_DIAGNOSTIC_CHILD_INPUT";
        when(settingsService.resolve(eq(userId), any())).thenReturn(new AiSettingsService.ResolvedSettings(
                AiProviderType.DEEPSEEK, "deepseek-v4-flash",
                new AiCredential("https://api.deepseek.com", "test-key"),
                com.auralis.app.ai.usage.AiCredentialSource.PLATFORM));
        List<SourceChunkEntity> budgetChunks = List.of(
                new SourceChunkEntity(UUID.randomUUID(), userId, sourceId, 0,
                        firstChunk, "c".repeat(64), 0, firstChunk.length(), null),
                new SourceChunkEntity(UUID.randomUUID(), userId, sourceId, 1,
                        secondChunk, "d".repeat(64), firstChunk.length(),
                        firstChunk.length() + secondChunk.length(), null));
        when(chunkRepository.findAllByUserIdAndSourceIdAndActiveTrueOrderByOrdinalAsc(userId, sourceId))
                .thenReturn(budgetChunks);
        when(chunkRepository.findActiveForAdaptiveOverview(eq(userId), eq(sourceId),
                any(org.springframework.data.domain.Pageable.class))).thenReturn(budgetChunks);
        SourceOverviewRequest request = new SourceOverviewRequest(sourceId, OverviewMode.OUTLINE, null);
        String requestId = UUID.randomUUID().toString();

        var response = service.generateSource(userId, request, requestId);

        assertThat(response).isNotNull();
        assertThat(failOnce).isFalse();
        assertThat(providerCalls).hasValue(5);
        UUID generationId = jdbc.queryForObject("select id from overview_generations where user_id=?",
                UUID.class, userId);
        assertThat(jdbc.queryForObject("select status from overview_generations where id=?",
                String.class, generationId)).isEqualTo("SUCCESS");
        assertThat(jdbc.queryForObject("select count(*) from overview_execution_nodes "
                + "where generation_id=? and state='VERIFIED'", Integer.class, generationId)).isEqualTo(2);

        assertThat(service.generateSource(userId, request, requestId)).isNotNull();
        assertThat(providerCalls).hasValue(5);
    }

    private void saturatePriorAdaptiveReservation() {
        UUID budgetTaskId = jdbc.queryForObject("select budget_task_id from overview_generations where user_id=?",
                UUID.class, userId);
        UUID ledgerTaskId = AiTaskContext.overviewLedgerTaskId(userId, AiFeature.SOURCE_OVERVIEW, budgetTaskId);
        UUID reservationId = jdbc.queryForObject("select id from ai_usage_reservations where user_id=? and task_id=? "
                        + "and state='COMPLETED' order by created_at,id limit 1", UUID.class, userId, ledgerTaskId);
        adaptiveBudgetReservationId = reservationId;
        adaptiveBudgetOriginalCharge = jdbc.queryForObject("select charged_tokens from ai_usage_reservations where id=?",
                Long.class, reservationId);
        jdbc.update("update ai_usage_reservations set charged_tokens=524288 where id=?", reservationId);
    }

    private void raiseOverviewTaskTokenLimit() {
        AuralisProperties.Limits current = properties.ai().limits();
        AuralisProperties.Limits raised = new AuralisProperties.Limits(current.globalConcurrent(),
                current.perUserConcurrent(), current.perUserHourlyTokens(), current.perUserDailyTokens(),
                current.globalDailyTokens(), current.reservationLeaseMillis(), current.heartbeatMillis(),
                current.chatMaxOutputTokens(), current.chatMaxCalls(), current.chatTaskTokens(),
                current.overviewMaxCalls(), 1_048_576L, current.ingestionMaxCalls(), current.ingestionTaskTokens());
        AuralisProperties.Ai currentAi = properties.ai();
        AuralisProperties.Ai raisedAi = new AuralisProperties.Ai(currentAi.enabled(), currentAi.encryptionKey(),
                currentAi.defaultProvider(), currentAi.defaults(), currentAi.providerConnectTimeoutMillis(),
                currentAi.requestTimeoutMillis(), currentAi.overviewResponseTimeoutMillis(),
                currentAi.overviewTaskTimeoutMillis(), currentAi.maxPromptChars(), currentAi.maxRetrievedChunks(),
                currentAi.ingestionMaxBytes(), currentAi.ingestionEmbeddingBatchMaxItems(),
                currentAi.ingestionEmbeddingBatchMaxUtf8Bytes(), currentAi.urlConnectTimeoutMillis(),
                currentAi.urlReadTimeoutMillis(), currentAi.urlMaxRedirects(), currentAi.providerMaxResponseBytes(),
                currentAi.allowedProviderHosts(), currentAi.ingestionWorkerEnabled(), currentAi.ingestionPollDelayMillis(),
                currentAi.ingestionLeaseMillis(), currentAi.ingestionMaxAttempts(), raised,
                currentAi.shadowTokenEstimateEnabled(), currentAi.overviewOutputRecoveryEnabled(),
                currentAi.overviewInputTokenEstimatorMode(), currentAi.overviewModelCapacities(),
                currentAi.overviewLimits(), currentAi.overviewMaxRetries());
        ReflectionTestUtils.setField(service, "properties", new AuralisProperties(properties.environment(),
                properties.api(), properties.upload(), properties.identity(), raisedAi));
        ReflectionTestUtils.setField(usageGuard, "limits", raised);
        ReflectionTestUtils.setField(usageGuard, "policies", new AiOperationPolicyResolver(raised));
    }

    private String adaptiveBudgetResponse(AiProviderRequest request) {
        String userData = providerUserData(request);
        if (userData.contains("adaptive_boundary_edit")) {
            try {
                var payload = objectMapper.readTree(userData.substring(userData.indexOf('\n') + 1));
                String hash = payload.path("snapshot").path("baseDocumentHash").asText();
                String guide = payload.path("guideRequired").asBoolean()
                        ? "{\"overview\":\"Completed guide\",\"keyPoints\":[\"Completed section\"],"
                                + "\"learningPath\":[\"Read sections\"]}"
                        : "null";
                return "{\"schemaVersion\":1,\"baseDocumentHash\":\"" + hash
                        + "\",\"guide\":" + guide + ",\"segment_patches\":[],\"terminology_map\":[]}";
            } catch (Exception exception) {
                throw new IllegalStateException("Unable to read boundary-edit snapshot", exception);
            }
        }
        if (userData.contains("write_one_section")) {
            return "{\"schemaVersion\":1,\"detailedContent\":\"Writer output\"}";
        }
        Matcher matcher = Pattern.compile("unit\\d{6}").matcher(userData);
        List<String> aliases = new java.util.ArrayList<>();
        while (matcher.find()) {
            String alias = matcher.group();
            if (!aliases.contains(alias)) aliases.add(alias);
        }
        if (userData.contains("lightweight_index")) {
            return adaptiveIndexResponse(aliases);
        }
        if (userData.contains("topic_directory")) {
            Matcher topicMatcher = Pattern.compile("topic\\d{6}").matcher(userData);
            List<String> routeIds = new java.util.ArrayList<>();
            if (userData.contains("\"authorizedTopicIds\"")) {
                while (topicMatcher.find()) if (!routeIds.contains(topicMatcher.group())) routeIds.add(topicMatcher.group());
            } else {
                Matcher planMatcher = Pattern.compile("plan[0-9]_[0-9]{6}").matcher(userData);
                while (planMatcher.find()) if (!routeIds.contains(planMatcher.group())) routeIds.add(planMatcher.group());
            }
            List<String> sections = routeIds.stream().map(alias -> "{\"title\":\"Route\",\"summary\":\"Writing goal\","
                    + "\"sourceIds\":[\"" + alias + "\"],\"locator\":null}").toList();
            return "{\"schemaVersion\":1,\"title\":\"Directory\",\"outline\":[{\"title\":\"Chapter\","
                    + "\"sections\":[" + String.join(",", sections) + "]}],\"summary\":null}";
        }
        return adaptiveSectionResponse("Writer output", aliases);
    }

    private String adaptiveSectionResponse(String summary, List<String> aliases) {
        String sourceIds = aliases.stream().map(alias -> "\"" + alias + "\"")
                .collect(java.util.stream.Collectors.joining(","));
        return "{\"schemaVersion\":1,\"title\":\"Budget recovery\",\"outline\":[{\"title\":\"Chapter\","
                + "\"sections\":[{\"title\":\"Section\",\"summary\":\"" + summary
                + "\",\"sourceIds\":[" + sourceIds + "],\"locator\":null}]}],\"summary\":null}";
    }

    private String adaptiveIndexResponse(List<String> aliases) {
        List<String> sections = aliases.stream().map(alias -> "{\"title\":\"Indexed fact\",\"summary\":\"Indexed facts\","
                + "\"sourceIds\":[\"" + alias + "\"],\"sourceRoles\":[{\"unitAlias\":\"" + alias
                + "\",\"role\":\"BODY\"}],\"locator\":null}").toList();
        return "{\"schemaVersion\":1,\"title\":\"Budget recovery\",\"outline\":[{\"title\":\"Chapter\","
                + "\"sections\":[" + String.join(",", sections) + "]}],\"summary\":null}";
    }

    private String providerUserData(AiProviderRequest request) {
        return request.messages().stream().filter(message -> message.role() == AiMessageRole.USER)
                .map(AiProviderRequest.Message::content).findFirst().orElse("");
    }




    @Test
    void identicalReduceGroupsDoNotRedispatchParentAfterSiblingSavedSameChildCheckpoint() {
        when(chunkRepository.findAllByUserIdAndSourceIdAndActiveTrueOrderByOrdinalAsc(userId, sourceId))
                .thenReturn(java.util.stream.IntStream.range(0, 4)
                        .mapToObj(index -> {
                            String chunk = "REPEATED_MAP_INPUT_" + index + "_"
                                    + String.valueOf((char) ('A' + index)).repeat(7_000);
                            return new SourceChunkEntity(UUID.randomUUID(), userId, sourceId, index,
                                    chunk, Integer.toHexString(index).repeat(64).substring(0, 64),
                                    index * chunk.length(), (index + 1) * chunk.length(), null);
                        })
                        .toList());
        String repeatedMap = providerContent.replace("A durable fact.", "R".repeat(3_800));
        providerResponseDetails = List.of(
                new AiProviderResponse(repeatedMap, 100L, 100L),
                new AiProviderResponse(repeatedMap, 100L, 100L),
                new AiProviderResponse(repeatedMap, 100L, 100L),
                new AiProviderResponse(repeatedMap, 100L, 100L),
                new AiProviderResponse("{\"schemaVersion\":1,\"title\":", 100L, 4_608L, "length"),
                new AiProviderResponse(providerContent, 100L, 100L),
                new AiProviderResponse(providerContent, 100L, 100L));
        SourceOverviewRequest request = new SourceOverviewRequest(sourceId, OverviewMode.OUTLINE, null);

        assertThat(service.generateSource(userId, request, UUID.randomUUID().toString())).isNotNull();

        UUID generationId = jdbc.queryForObject("select id from overview_generations where user_id=?", UUID.class, userId);
        assertThat(jdbc.queryForObject("select count(*) from ai_usage_reservations where user_id=?", Integer.class, userId))
                .isEqualTo(7);
        assertThat(providerCalls).hasValue(7);
        assertThat(providerRequests).hasSize(7);
        assertThat(providerRequests.get(4).messages().get(1).content()).contains("R".repeat(3_800));
        assertThat(providerRequests.get(6).messages().get(1).content()).contains("A durable fact.")
                .doesNotContain("R".repeat(3_800));
        String failedParentInput = providerRequests.get(4).messages().get(1).content();
        assertThat(providerRequests.stream()
                .filter(providerRequest -> providerRequest.messages().get(1).content().equals(failedParentInput))
                .count()).isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from overview_generation_checkpoints where generation_id=?",
                Integer.class, generationId)).isEqualTo(6);
        assertThat(jdbc.queryForObject("select count(distinct task_id) from ai_usage_reservations where user_id=?",
                Integer.class, userId)).isEqualTo(1);
    }

    private UUID requireSingleUnknownDispatchedInvocation(UUID userId, UUID generationId) {
        UUID budgetTaskId = jdbc.queryForObject("select budget_task_id from overview_generations where id=? and user_id=?",
                UUID.class, generationId, userId);
        String scopeType = jdbc.queryForObject("select scope_type from overview_generations where id=? and user_id=?",
                String.class, generationId, userId);
        AiFeature feature = switch (scopeType) {
            case "SOURCE" -> AiFeature.SOURCE_OVERVIEW;
            case "SUBJECT" -> AiFeature.SUBJECT_OVERVIEW;
            default -> throw new AssertionError("Unexpected Overview scope type " + scopeType);
        };
        UUID ledgerTaskId = AiTaskContext.overviewLedgerTaskId(userId, feature, budgetTaskId);
        List<UUID> unresolved = jdbc.query("select ledger.id from overview_generation_invocations inv "
                        + "join ai_usage_reservations ledger on ledger.id=inv.reservation_id "
                        + "and ledger.task_id=inv.task_id and ledger.user_id=inv.user_id "
                        + "where inv.generation_id=? and inv.user_id=? and inv.task_id=? "
                        + "and ledger.state='FAILED' and ledger.request_dispatched=true "
                        + "and ledger.actual_input_tokens is null and ledger.actual_output_tokens is null "
                        + "order by ledger.created_at desc,ledger.id desc",
                (rs, row) -> rs.getObject(1, UUID.class), generationId, userId, ledgerTaskId);
        assertThat(unresolved).as("the injected failure has one exact unresolved invocation").hasSize(1);
        UUID reservationId = unresolved.getFirst();
        Map<String, Object> row = jdbc.queryForMap("select id,task_id,user_id,owner_id,operation_kind,credential_source,state,"
                + "request_dispatched,actual_input_tokens,actual_output_tokens,charged_tokens from ai_usage_reservations where id=?", reservationId);
        assertThat(row.get("id")).isEqualTo(reservationId);
        assertThat(row.get("task_id")).isEqualTo(ledgerTaskId);
        assertThat(row.get("user_id")).isEqualTo(userId);
        assertThat(row.get("operation_kind")).isEqualTo(feature == AiFeature.SOURCE_OVERVIEW
                ? "SOURCE_OVERVIEW" : "SUBJECT_OVERVIEW");
        assertThat(row.get("credential_source")).isEqualTo("USER_SUPPLIED");
        assertThat(row.get("state")).isEqualTo("FAILED");
        assertThat(row.get("request_dispatched")).isEqualTo(true);
        assertThat(row.get("actual_input_tokens")).isNull();
        assertThat(row.get("actual_output_tokens")).isNull();
        assertThat(((Number) row.get("charged_tokens")).longValue()).isGreaterThan(0);
        return reservationId;
    }

    private void recordTrustedFinalUsageForInjectedFailure(UUID userId, UUID generationId) {
        UUID reservationId = requireSingleUnknownDispatchedInvocation(userId, generationId);
        Map<String, Object> before = jdbc.queryForMap("select id,task_id,user_id,owner_id,operation_kind,credential_source,state,"
                + "request_dispatched,actual_input_tokens,actual_output_tokens,charged_tokens from ai_usage_reservations where id=?", reservationId);
        UUID taskId = (UUID) before.get("task_id");
        long chargedBefore = ((Number) before.get("charged_tokens")).longValue();
        // Simulate a trusted terminal Provider usage result for this exact synthetic reservation only.
        int changed = jdbc.update("update ai_usage_reservations set actual_input_tokens=?,actual_output_tokens=? "
                        + "where id=? and task_id=? and user_id=? and state='FAILED' and request_dispatched=true "
                        + "and actual_input_tokens is null and actual_output_tokens is null",
                100L, 100L, reservationId, taskId, userId);
        assertThat(changed).isEqualTo(1);
        Map<String, Object> after = jdbc.queryForMap("select id,task_id,user_id,owner_id,operation_kind,credential_source,state,"
                + "request_dispatched,actual_input_tokens,actual_output_tokens,charged_tokens from ai_usage_reservations where id=?", reservationId);
        assertThat(after.get("id")).isEqualTo(before.get("id"));
        assertThat(after.get("task_id")).isEqualTo(before.get("task_id"));
        assertThat(after.get("user_id")).isEqualTo(before.get("user_id"));
        assertThat(after.get("owner_id")).isEqualTo(before.get("owner_id"));
        assertThat(after.get("operation_kind")).isEqualTo(before.get("operation_kind"));
        assertThat(after.get("credential_source")).isEqualTo(before.get("credential_source"));
        assertThat(after.get("state")).isEqualTo("FAILED");
        assertThat(after.get("request_dispatched")).isEqualTo(true);
        assertThat(((Number) after.get("actual_input_tokens")).longValue()).isEqualTo(100L);
        assertThat(((Number) after.get("actual_output_tokens")).longValue()).isEqualTo(100L);
        assertThat(((Number) after.get("charged_tokens")).longValue()).isEqualTo(chargedBefore);
    }

    private String overviewWithSections(String... sections) {
        return "{\"schemaVersion\":1,\"title\":\"Durable source\",\"outline\":[{\"title\":\"Chapter\",\"sections\":["
                + String.join(",", sections) + "]}],\"summary\":null}";
    }


    private static String sha256Hex(String value) {
        try {
            byte[] digest = java.security.MessageDigest.getInstance("SHA-256")
                    .digest(value.getBytes(java.nio.charset.StandardCharsets.UTF_8));
            return java.util.HexFormat.of().formatHex(digest);
        } catch (java.security.NoSuchAlgorithmException exception) {
            throw new IllegalStateException(exception);
        }
    }

    @Test
    void disconnectedOwnerStillBindsFollowerRequestAndFinishesSharedGeneration() throws Exception {
        providerEntered = new CountDownLatch(1);
        providerRelease = new CountDownLatch(1);
        OverviewCancellation ownerCancellation = new OverviewCancellation();
        String ownerRequestId = UUID.randomUUID().toString();
        String followerRequestId = UUID.randomUUID().toString();
        SourceOverviewRequest request = new SourceOverviewRequest(sourceId, OverviewMode.OUTLINE, null);
        ExecutorService callers = Executors.newFixedThreadPool(2);
        try {
            Future<?> owner = callers.submit(() -> service.generateSource(userId, request, ownerRequestId, ownerCancellation));
            assertThat(providerEntered.await(5, TimeUnit.SECONDS)).isTrue();
            Future<?> follower = callers.submit(() -> service.generateSource(userId, request, followerRequestId, null));
            long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
            while (System.nanoTime() < deadline
                    && jdbc.queryForObject("select count(*) from overview_generation_requests where user_id=?", Integer.class, userId) < 2) {
                Thread.sleep(10);
            }
            assertThat(jdbc.queryForObject("select count(*) from overview_generation_requests where user_id=?", Integer.class, userId))
                    .isEqualTo(2);
            ownerCancellation.cancel(OverviewCancellation.Reason.REQUEST_DISCONNECTED);
            Thread.sleep(150);
            providerRelease.countDown();
            assertThat(follower.get(10, TimeUnit.SECONDS)).isNotNull();
            assertThatThrownBy(() -> owner.get(10, TimeUnit.SECONDS))
                    .hasCauseInstanceOf(com.auralis.app.shared.error.DomainException.class);
            assertThat(providerCalls).hasValue(1);
            assertThat(jdbc.queryForObject("select count(distinct generation_id) from overview_generation_requests where user_id=?",
                    Integer.class, userId)).isEqualTo(1);
        } finally {
            providerRelease.countDown();
            callers.shutdownNow();
        }
    }

    @Test
    void differentServiceInstanceAwaitsDurableOwnerAndReplaysSourceAliases() throws Exception {
        providerEntered = new CountDownLatch(1);
        providerRelease = new CountDownLatch(1);
        String ownerRequestId = UUID.randomUUID().toString();
        String secondRequestId = UUID.randomUUID().toString();
        SourceOverviewRequest request = new SourceOverviewRequest(sourceId, OverviewMode.OUTLINE, null);
        OverviewGenerationService secondInstance = new OverviewGenerationService(sourceService, subjectService,
                chunkRepository, settingsService, invocationGateway, properties, documentValidator, objectMapper,
                System::nanoTime, deadlineScheduler, Runnable::run, coordinator);
        ExecutorService callers = Executors.newFixedThreadPool(2);
        try {
            Future<?> owner = callers.submit(() -> service.generateSource(userId, request, ownerRequestId));
            assertThat(providerEntered.await(5, TimeUnit.SECONDS)).isTrue();
            Future<?> waiter = callers.submit(() -> secondInstance.generateSource(userId, request, secondRequestId));
            long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
            while (System.nanoTime() < deadline
                    && jdbc.queryForObject("select count(*) from overview_generation_requests where user_id=?", Integer.class, userId) < 2) {
                Thread.sleep(10);
            }
            assertThat(jdbc.queryForObject("select count(*) from overview_generation_requests where user_id=?", Integer.class, userId))
                    .isEqualTo(2);
            providerRelease.countDown();
            assertThat(waiter.get(10, TimeUnit.SECONDS)).isEqualTo(owner.get(10, TimeUnit.SECONDS));
            assertThat(providerCalls).hasValue(1);
            assertThat(jdbc.queryForObject("select count(distinct generation_id) from overview_generation_requests where user_id=?",
                    Integer.class, userId)).isEqualTo(1);
        } finally {
            providerRelease.countDown();
            callers.shutdownNow();
        }
    }

    @ParameterizedTest
    @CsvSource({
            "AI_REQUEST_BUDGET_EXCEEDED,413,0,false",
            "AI_TASK_BUDGET_EXCEEDED,422,0,false",
            "AI_CONCURRENCY_LIMIT,429,17,true",
            "AI_HOURLY_QUOTA_EXCEEDED,429,23,true",
            "AI_DAILY_QUOTA_EXCEEDED,429,31,true",
            "AI_GLOBAL_QUOTA_EXCEEDED,503,41,true"
    })
    void crossInstanceWaiterReceivesOriginalUsageFailureDetails(String code, int status, long retryAfter,
                                                                 boolean hasResetAt) throws Exception {
        providerEntered = new CountDownLatch(1);
        providerRelease = new CountDownLatch(1);
        Instant resetAt = hasResetAt ? Instant.parse("2026-10-14T00:00:00Z") : null;
        providerFailure = new AiUsageLimitException(code, status, retryAfter, resetAt);
        String ownerRequestId = UUID.randomUUID().toString();
        String waiterRequestId = UUID.randomUUID().toString();
        SourceOverviewRequest request = new SourceOverviewRequest(sourceId, OverviewMode.OUTLINE, null);
        OverviewGenerationService secondInstance = new OverviewGenerationService(sourceService, subjectService,
                chunkRepository, settingsService, invocationGateway, properties, documentValidator, objectMapper,
                System::nanoTime, deadlineScheduler, Runnable::run, coordinator);
        ExecutorService callers = Executors.newFixedThreadPool(2);
        try {
            Future<?> owner = callers.submit(() -> service.generateSource(userId, request, ownerRequestId));
            assertThat(providerEntered.await(5, TimeUnit.SECONDS)).isTrue();
            Future<?> waiter = callers.submit(() -> secondInstance.generateSource(userId, request, waiterRequestId));
            long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
            while (System.nanoTime() < deadline
                    && jdbc.queryForObject("select count(*) from overview_generation_requests where user_id=?",
                    Integer.class, userId) < 2) {
                Thread.sleep(10);
            }
            assertThat(jdbc.queryForObject("select count(*) from overview_generation_requests where user_id=?",
                    Integer.class, userId)).isEqualTo(2);

            providerRelease.countDown();
            assertThatThrownBy(() -> owner.get(10, TimeUnit.SECONDS))
                    .isInstanceOf(java.util.concurrent.ExecutionException.class)
                    .hasCauseInstanceOf(AiUsageLimitException.class)
                    .satisfies(failure -> assertUsageFailure((AiUsageLimitException) failure.getCause(),
                            code, status, retryAfter, resetAt));
            assertThatThrownBy(() -> waiter.get(10, TimeUnit.SECONDS))
                    .isInstanceOf(java.util.concurrent.ExecutionException.class)
                    .hasCauseInstanceOf(AiUsageLimitException.class)
                    .satisfies(failure -> assertUsageFailure((AiUsageLimitException) failure.getCause(),
                            code, status, retryAfter, resetAt));
            assertThat(providerCalls).hasValue(1);
            assertThat(jdbc.queryForObject("select count(distinct generation_id) from overview_generation_requests where user_id=?",
                    Integer.class, userId)).isEqualTo(1);
            assertThat(jdbc.queryForObject("select count(distinct budget_task_id) from overview_generations where user_id=?",
                    Integer.class, userId)).isEqualTo(1);
        } finally {
            providerRelease.countDown();
            callers.shutdownNow();
        }
    }

    private void assertUsageFailure(AiUsageLimitException failure, String code, int status,
                                   long retryAfter, Instant resetAt) {
        assertThat(failure.code()).isEqualTo(code);
        assertThat(failure.status()).isEqualTo(status);
        assertThat(failure.retryAfterSeconds()).isEqualTo(retryAfter);
        assertThat(failure.resetAt()).isEqualTo(resetAt);
    }

    @Test
    void profileChangeForMappedRequestIdConflictsBeforeProviderCall() {
        SourceOverviewRequest request = new SourceOverviewRequest(sourceId, OverviewMode.OUTLINE, null);
        String requestId = UUID.randomUUID().toString();
        service.generateSource(userId, request, requestId);
        when(settingsService.resolve(eq(userId), any())).thenReturn(new AiSettingsService.ResolvedSettings(
                AiProviderType.DEEPSEEK, "deepseek-v4-flash", new AiCredential("https://api.deepseek.com", "rotated-key"), com.auralis.app.ai.usage.AiCredentialSource.USER_SUPPLIED));

        assertThatThrownBy(() -> service.generateSource(userId, request, requestId))
                .isInstanceOf(com.auralis.app.shared.error.DomainException.class)
                .satisfies(error -> assertThat(((com.auralis.app.shared.error.DomainException) error).code())
                        .isEqualTo("RESOURCE_VERSION_CONFLICT"));
        assertThat(providerCalls).hasValue(1);
    }

    @Test
    void finalSubjectAllRequiresEverySelectedAliasAndExplicitRetryUsesFreshGeneration() {
        UUID subjectId = UUID.randomUUID();
        UUID secondSourceId = UUID.randomUUID();
        SourceView first = new SourceView(sourceId, subjectId, SourceType.FILE, "First", null, null, null, null,
                SourceIngestionStatus.READY, revision, null, null, 1, Instant.now(), Instant.now(), null, null);
        SourceView second = new SourceView(secondSourceId, subjectId, SourceType.FILE, "Second", null, null, null, null,
                SourceIngestionStatus.READY, UUID.randomUUID(), null, null, 1, Instant.now(), Instant.now(), null, null);
        persistCurrentSource(first);
        persistCurrentSource(second);
        Map<UUID, SourceView> sources = new ConcurrentHashMap<>(Map.of(sourceId, first, secondSourceId, second));
        when(sourceService.requireActiveSource(eq(userId), any(UUID.class))).thenAnswer(call ->
                sources.get(call.getArgument(1)));
        when(subjectService.requireActiveSubject(eq(userId), eq(subjectId))).thenReturn(
                new SubjectView(subjectId, "Durable subject", null, null, "a", false, 1,
                        Instant.now(), Instant.now(), null));
        OverviewSummary inputSummary = new OverviewSummary("source summary", List.of(), List.of());
        List<OverviewChapter> firstOutline = List.of(new OverviewChapter("First chapter", List.of(
                new OverviewSection("First section", "First fact", List.of(sourceId.toString()), null))));
        List<OverviewChapter> secondOutline = List.of(new OverviewChapter("Second chapter", List.of(
                new OverviewSection("Second section", "Second fact", List.of(secondSourceId.toString()), null))));
        SubjectOverviewRequest request = new SubjectOverviewRequest(subjectId, OverviewMode.ALL, null, List.of(
                new SubjectOverviewSourceInput(sourceId, "First", firstOutline, inputSummary),
                new SubjectOverviewSourceInput(secondSourceId, "Second", secondOutline, inputSummary)));
        String requestId = UUID.randomUUID().toString();
        providerContent = "{\"schemaVersion\":1,\"title\":\"Subject\",\"outline\":[{\"title\":\"Chapter\","
                + "\"sections\":[{\"title\":\"Section\",\"summary\":\"Combined fact\","
                + "\"sourceIds\":[\"source-1\"],\"locator\":null}]}],"
                + "\"summary\":{\"overview\":\"Combined\",\"keyPoints\":[],\"learningPath\":[]}}";
        assertThatThrownBy(() -> service.generateSubject(userId, request, requestId))
                .hasMessageContaining("invalid overview");
        UUID generationId = jdbc.queryForObject("select id from overview_generations where user_id=?", UUID.class, userId);
        UUID budgetTaskId = jdbc.queryForObject("select budget_task_id from overview_generations where id=?", UUID.class, generationId);

        providerContent = providerContent.replace("[\"source-1\"]", "[\"source-1\",\"source-2\"]");
        SubjectOverviewRequest retry = new SubjectOverviewRequest(subjectId, OverviewMode.ALL, null,
                request.sources(), UUID.fromString(requestId));
        var completed = service.generateSubject(userId, retry, UUID.randomUUID().toString());

        assertThat(completed.outline().getFirst().sections().getFirst().sourceIds())
                .containsExactly(sourceId.toString(), secondSourceId.toString());
        assertThat(providerCalls).hasValue(2);
        UUID retryGenerationId = jdbc.queryForObject("select id from overview_generations where retry_of_generation_id=?",
                UUID.class, generationId);
        assertThat(jdbc.queryForObject("select budget_task_id from overview_generations where id=?",
                UUID.class, retryGenerationId)).isNotEqualTo(budgetTaskId);
        assertThat(jdbc.queryForObject("select status from overview_generations where id=?", String.class,
                generationId)).isEqualTo("FAILED");
    }

    @Test
    void subjectSummaryGenerationTracksSelectedInputWithoutRequiringSummaryAliases() {
        UUID subjectId = UUID.randomUUID();
        SourceView subjectSource = new SourceView(sourceId, subjectId, SourceType.FILE, "Summary source", null, null, null, null,
                SourceIngestionStatus.READY, revision, null, null, 1, Instant.now(), Instant.now(), null, null);
        persistCurrentSource(subjectSource);
        when(sourceService.requireActiveSource(userId, sourceId)).thenReturn(subjectSource);
        when(subjectService.requireActiveSubject(eq(userId), eq(subjectId))).thenReturn(
                new SubjectView(subjectId, "Durable subject", null, null, "a", false, 1,
                        Instant.now(), Instant.now(), null));
        providerContent = "{\"schemaVersion\":1,\"title\":\"Subject summary\",\"outline\":null,"
                + "\"summary\":{\"overview\":\"Selected facts\",\"keyPoints\":[\"Fact\"],\"learningPath\":[]}}";
        SubjectOverviewRequest request = new SubjectOverviewRequest(subjectId, OverviewMode.SUMMARY, null, List.of(
                new SubjectOverviewSourceInput(sourceId, "Summary source", null,
                        new OverviewSummary("Selected facts", List.of("Fact"), List.of()))));

        var result = service.generateSubject(userId, request, UUID.randomUUID().toString());

        assertThat(result.outline()).isNull();
        assertThat(result.summary().overview()).isEqualTo("Selected facts");
        assertThat(providerCalls).hasValue(1);
    }

    @Test
    void executorRejectionCompletesDurableParticipantBindingImmediately() {
        Executor rejecting = task -> { throw new RejectedExecutionException("test executor full"); };
        OverviewGenerationService rejectingService = new OverviewGenerationService(sourceService, subjectService,
                chunkRepository, settingsService, invocationGateway, properties, documentValidator, objectMapper,
                System::nanoTime, deadlineScheduler, rejecting, coordinator);
        SourceOverviewRequest request = new SourceOverviewRequest(sourceId, OverviewMode.OUTLINE, null);

        assertThatThrownBy(() -> rejectingService.generateSource(userId, request, UUID.randomUUID().toString()))
                .hasMessageContaining("capacity is temporarily unavailable");
        assertThat(providerCalls).hasValue(0);
        assertThat(jdbc.queryForObject("select count(*) from overview_generations where user_id=?", Integer.class, userId))
                .isZero();
    }
}
