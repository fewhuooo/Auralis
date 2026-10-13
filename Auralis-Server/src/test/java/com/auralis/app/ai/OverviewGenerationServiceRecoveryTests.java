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
import com.auralis.app.ai.usage.AiInvocationGateway;
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
import org.springframework.test.context.bean.override.mockito.MockitoBean;
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
import java.util.concurrent.Executor;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ScheduledExecutorService;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

@Testcontainers
@EnabledIfSystemProperty(named = "auralis.postgres.it", matches = "true")
@SpringBootTest(classes = AuralisApplication.class)
@ActiveProfiles("postgres-it")
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
    private UUID revision;
    private SourceView source;
    private AtomicInteger providerCalls;
    private AtomicInteger failAtCall;
    private volatile CountDownLatch providerEntered;
    private volatile CountDownLatch providerRelease;
    private volatile String providerContent;
    private volatile List<String> providerResponses;
    private volatile List<AiProviderRequest> providerRequests;
    private volatile AiUsageLimitException providerFailure;

    @BeforeEach
    void prepare() {
        userId = UUID.randomUUID();
        sourceId = UUID.randomUUID();
        revision = UUID.randomUUID();
        providerCalls = new AtomicInteger();
        failAtCall = new AtomicInteger(-1);
        providerEntered = null;
        providerRelease = null;
        providerResponses = List.of();
        providerRequests = new java.util.concurrent.CopyOnWriteArrayList<>();
        providerContent = "{\"schemaVersion\":1,\"title\":\"Durable source\",\"outline\":[{\"title\":\"Chapter\","
                + "\"sections\":[{\"title\":\"Section\",\"summary\":\"A durable fact.\","
                + "\"sourceIds\":[\"source-1\"],\"locator\":null}]}],\"summary\":null}";
        String username = "overview-service-it-" + userId;
        jdbc.update("insert into users(id,username,normalized_username,password_hash,status) "
                        + "values (?,?,?,'synthetic-hash','ACTIVE')",
                userId, username, username.toLowerCase(java.util.Locale.ROOT));
        source = new SourceView(sourceId, null, SourceType.FILE, "Durable source", null, null, null, null,
                SourceIngestionStatus.READY, revision, null, null, 1, Instant.now(), Instant.now(), null, null);
        when(sourceService.requireActiveSource(userId, sourceId)).thenReturn(source);
        when(settingsService.resolve(eq(userId), any())).thenReturn(new AiSettingsService.ResolvedSettings(
                AiProviderType.DEEPSEEK, "deepseek-v4-flash", new AiCredential("https://api.deepseek.com", "test-key")));
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
            List<String> responses = providerResponses;
            String content = callNumber <= responses.size() ? responses.get(callNumber - 1) : providerContent;
            return new AiProviderResponse(content, 100, 100);
        });
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
        SourceView changedTitle = new SourceView(sourceId, null, SourceType.FILE, "Renamed source", null, null, null, null,
                SourceIngestionStatus.READY, revision, null, null, 2, Instant.now(), Instant.now(), null, null);
        when(sourceService.requireActiveSource(userId, sourceId)).thenReturn(changedTitle);

        assertThatThrownBy(() -> service.generateSource(userId, request, firstRequestId))
                .hasMessageContaining("already bound");
        assertThat(providerCalls).hasValue(1);

        SourceView changedRevision = new SourceView(sourceId, null, SourceType.FILE, "Renamed source", null, null, null, null,
                SourceIngestionStatus.READY, UUID.randomUUID(), null, null, 3, Instant.now(), Instant.now(), null, null);
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
    void retryAfterReduceFailureReusesValidatedMapCheckpointsAndStableGatewayBudget() {
        when(chunkRepository.findAllByUserIdAndSourceIdAndActiveTrueOrderByOrdinalAsc(userId, sourceId))
                .thenReturn(List.of(
                        new SourceChunkEntity(UUID.randomUUID(), userId, sourceId, 0,
                                "A".repeat(7_000), "c".repeat(64), 0, 7_000, null),
                        new SourceChunkEntity(UUID.randomUUID(), userId, sourceId, 1,
                                "B".repeat(7_000), "d".repeat(64), 7_000, 14_000, null)));
        failAtCall.set(3);
        SourceOverviewRequest request = new SourceOverviewRequest(sourceId, OverviewMode.OUTLINE, null);
        assertThatThrownBy(() -> service.generateSource(userId, request, UUID.randomUUID().toString()))
                .hasMessageContaining("AI provider failed");
        UUID generationId = jdbc.queryForObject("select id from overview_generations where user_id=?", UUID.class, userId);
        UUID budgetTaskId = jdbc.queryForObject("select budget_task_id from overview_generations where id=?", UUID.class, generationId);
        assertThat(jdbc.queryForObject("select count(*) from overview_generation_checkpoints where generation_id=?",
                Integer.class, generationId)).isEqualTo(2);

        failAtCall.set(-1);
        service.generateSource(userId, request, UUID.randomUUID().toString());

        assertThat(providerCalls).hasValue(4);
        assertThat(jdbc.queryForObject("select id from overview_generations where user_id=?", UUID.class, userId))
                .isEqualTo(generationId);
        assertThat(jdbc.queryForObject("select budget_task_id from overview_generations where id=?", UUID.class, generationId))
                .isEqualTo(budgetTaskId);
        assertThat(jdbc.queryForObject("select count(*) from ai_usage_reservations where user_id=?", Integer.class, userId))
                .isEqualTo(4);
        assertThat(jdbc.queryForObject("select count(distinct task_id) from ai_usage_reservations where user_id=?", Integer.class, userId))
                .isEqualTo(1);
    }

    @Test
    void failedNoProgressCompactionDoesNotPoisonTheNextDurableRecoveryAttempt() {
        when(chunkRepository.findAllByUserIdAndSourceIdAndActiveTrueOrderByOrdinalAsc(userId, sourceId))
                .thenReturn(List.of(
                        new SourceChunkEntity(UUID.randomUUID(), userId, sourceId, 0,
                                "A".repeat(7_000), "c".repeat(64), 0, 7_000, null),
                        new SourceChunkEntity(UUID.randomUUID(), userId, sourceId, 1,
                                "B".repeat(7_000), "d".repeat(64), 7_000, 14_000, null),
                        new SourceChunkEntity(UUID.randomUUID(), userId, sourceId, 2,
                                "C".repeat(7_000), "e".repeat(64), 14_000, 21_000, null),
                        new SourceChunkEntity(UUID.randomUUID(), userId, sourceId, 3,
                                "D".repeat(7_000), "f".repeat(64), 21_000, 28_000, null)));
        String mapOutput = "{\"schemaVersion\":1,\"title\":\"Durable source\",\"outline\":[{\"title\":\"Chapter\","
                + "\"sections\":[{\"title\":\"Section\",\"summary\":\"A fact\",\"sourceIds\":[\"source-1\"],"
                + "\"locator\":null}]}],\"summary\":{\"overview\":\"" + "x".repeat(4_000)
                + "\",\"keyPoints\":[],\"learningPath\":[]}}";
        String noShrink = "{\"schemaVersion\":1,\"title\":\"Durable source\",\"outline\":[{\"title\":\"Chapter\","
                + "\"sections\":[{\"title\":\"Section\",\"summary\":\"A fact\",\"sourceIds\":[\"source-1\"],"
                + "\"locator\":null}]}],\"summary\":{\"overview\":\"" + "x".repeat(3_000)
                + "\",\"keyPoints\":[\"" + "y".repeat(1_753) + "\"],\"learningPath\":[]}}";
        providerResponses = List.of(mapOutput, mapOutput, mapOutput, mapOutput, noShrink, noShrink);
        SourceOverviewRequest request = new SourceOverviewRequest(sourceId, OverviewMode.ALL, null);
        String requestId = UUID.randomUUID().toString();

        assertThatThrownBy(() -> service.generateSource(userId, request, requestId))
                .isInstanceOf(com.auralis.app.shared.error.DomainException.class)
                .extracting(error -> ((com.auralis.app.shared.error.DomainException) error).code())
                .isEqualTo("OVERVIEW_REDUCE_NO_PROGRESS");
        UUID generationId = jdbc.queryForObject("select id from overview_generations where user_id=?", UUID.class, userId);
        UUID budgetTaskId = jdbc.queryForObject("select budget_task_id from overview_generations where id=?", UUID.class, generationId);
        assertThat(providerCalls).hasValue(6);

        AiProviderRequest legacyCompactionRequest = providerRequests.getLast();
        String legacySystem = legacyCompactionRequest.messages().get(0).content();
        String legacyUser = legacyCompactionRequest.messages().get(1).content();
        String legacyStepKey = "step_" + sha256Hex("REDUCE|INTERMEDIATE|" + sha256Hex(legacySystem)
                + "|" + sha256Hex(legacyUser));
        int checkpointsBeforeLegacySeed = jdbc.queryForObject("select count(*) from overview_generation_checkpoints where generation_id=?",
                Integer.class, generationId);
        int legacyRowsBeforeSeed = jdbc.queryForObject("select count(*) from overview_generation_checkpoints where generation_id=? and step_key=?",
                Integer.class, generationId, legacyStepKey);
        assertThat(legacyRowsBeforeSeed).isBetween(0, 1);
        assertThat(checkpointsBeforeLegacySeed).isEqualTo(legacyRowsBeforeSeed == 0 ? 5 : 6);
        String poisonPayload = jdbc.queryForObject("select payload_json from overview_generation_checkpoints "
                + "where generation_id=? order by char_length(payload_json) desc limit 1", String.class, generationId);
        int inserted = jdbc.update("insert into overview_generation_checkpoints (id,generation_id,step_key,input_fingerprint,"
                        + "profile_fingerprint,algorithm_version,payload_json,payload_sha256,schema_version) "
                        + "select ?,id,?,input_fingerprint,profile_fingerprint,algorithm_version,?,?,1 "
                        + "from overview_generations where id=? on conflict do nothing",
                UUID.randomUUID(), legacyStepKey, poisonPayload, sha256Hex(poisonPayload), generationId);
        assertThat(inserted).isBetween(0, 1);
        assertThat(jdbc.queryForObject("select count(*) from overview_generation_checkpoints where generation_id=? and step_key=?",
                Integer.class, generationId, legacyStepKey)).isEqualTo(1);

        providerContent = "{\"schemaVersion\":1,\"title\":\"Durable source\",\"outline\":[{\"title\":\"Chapter\","
                + "\"sections\":[{\"title\":\"Section\",\"summary\":\"Recovered fact\","
                + "\"sourceIds\":[\"source-1\"],\"locator\":null}]}],\"summary\":{\"overview\":\"Recovered summary\","
                + "\"keyPoints\":[],\"learningPath\":[]}}";
        assertThat(service.generateSource(userId, request, requestId)).isNotNull();

        assertThat(providerCalls).hasValue(8);
        assertThat(jdbc.queryForObject("select id from overview_generations where user_id=?", UUID.class, userId))
                .isEqualTo(generationId);
        assertThat(jdbc.queryForObject("select budget_task_id from overview_generations where id=?", UUID.class, generationId))
                .isEqualTo(budgetTaskId);
        assertThat(jdbc.queryForObject("select count(*) from overview_generation_checkpoints where generation_id=? and step_key=?",
                Integer.class, generationId, legacyStepKey)).isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from ai_usage_reservations where user_id=?", Integer.class, userId))
                .isEqualTo(8);
        assertThat(jdbc.queryForObject("select count(distinct task_id) from ai_usage_reservations where user_id=?",
                Integer.class, userId)).isEqualTo(1);
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
                AiProviderType.DEEPSEEK, "deepseek-v4-flash", new AiCredential("https://api.deepseek.com", "rotated-key")));

        assertThatThrownBy(() -> service.generateSource(userId, request, requestId))
                .hasMessageContaining("provider profile");
        assertThat(providerCalls).hasValue(1);
    }

    @Test
    void finalSubjectAllRequiresEverySelectedAliasAndRetryReusesFailedGeneration() {
        UUID subjectId = UUID.randomUUID();
        UUID secondSourceId = UUID.randomUUID();
        SourceView first = new SourceView(sourceId, subjectId, SourceType.FILE, "First", null, null, null, null,
                SourceIngestionStatus.READY, revision, null, null, 1, Instant.now(), Instant.now(), null, null);
        SourceView second = new SourceView(secondSourceId, subjectId, SourceType.FILE, "Second", null, null, null, null,
                SourceIngestionStatus.READY, UUID.randomUUID(), null, null, 1, Instant.now(), Instant.now(), null, null);
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
        var completed = service.generateSubject(userId, request, requestId);

        assertThat(completed.outline().getFirst().sections().getFirst().sourceIds())
                .containsExactly(sourceId.toString(), secondSourceId.toString());
        assertThat(providerCalls).hasValue(2);
        assertThat(jdbc.queryForObject("select id from overview_generations where user_id=?", UUID.class, userId))
                .isEqualTo(generationId);
        assertThat(jdbc.queryForObject("select budget_task_id from overview_generations where id=?", UUID.class, generationId))
                .isEqualTo(budgetTaskId);
    }

    @Test
    void subjectSummaryGenerationTracksSelectedInputWithoutRequiringSummaryAliases() {
        UUID subjectId = UUID.randomUUID();
        SourceView subjectSource = new SourceView(sourceId, subjectId, SourceType.FILE, "Summary source", null, null, null, null,
                SourceIngestionStatus.READY, revision, null, null, 1, Instant.now(), Instant.now(), null, null);
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
