package com.auralis.app.ai;

import com.auralis.app.ai.internal.provider.AiProviderRegistry;
import com.auralis.app.ai.internal.provider.EmbeddingProviderRegistry;
import com.auralis.app.ai.retrieval.RetrievalService;
import com.auralis.app.ai.usage.AiFeature;
import com.auralis.app.ai.usage.AiInvocationGateway;
import com.auralis.app.ai.usage.AiProviderUsage;
import com.auralis.app.ai.usage.AiStage;
import com.auralis.app.ai.usage.AiTaskContext;
import com.auralis.app.ai.usage.AiUsageGatewayService;
import com.auralis.app.ai.usage.AiUsageGuard;
import com.auralis.app.ai.usage.AiTokenUsage;
import com.auralis.app.shared.config.AuralisProperties;
import com.auralis.app.shared.error.DomainException;
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
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class ChatAiExecutionSafetyTests {

    private static final AiCredential CHAT_CREDENTIAL =
            new AiCredential("https://provider.test/v1", "synthetic-key", "chat-model");
    private static final AiCredential EMBEDDING_CREDENTIAL =
            new AiCredential("https://embedding.test/v1", "synthetic-key", "embedding-model");

    @Test
    void normalRagCompletesTwoCallsAndEmitsOneAssistantAnswer() throws Exception {
        try (Fixture fixture = new Fixture(StreamMode.NORMAL, null, null)) {
            List<AiStreamEvent> events = fixture.run();

            assertThat(fixture.callStages()).containsExactlyInAnyOrder("RETRIEVAL_EMBEDDING", "CHAT_COMPLETION");
            assertThat(fixture.invocationOrder).containsExactly("RETRIEVAL_EMBEDDING", "CHAT_COMPLETION");
            assertThat(fixture.embedding.calls()).isEqualTo(1);
            assertThat(fixture.provider.streamCalls()).isEqualTo(1);
            assertThat(fixture.reservationCount()).isEqualTo(2);
            assertThat(events.stream().map(AiStreamEvent::event).toList())
                    .containsExactly("message.started", "message.delta", "message.delta", "message.completed");
            assertThat(fixture.persistedStatus()).isEqualTo(AiMessageStatus.COMPLETED);
            assertThat(fixture.persistedContent()).isEqualTo("answer");
            assertThat(fixture.persistedUsage()).contains("\"providerUsageComplete\":true");
        }
    }

    @Test
    void embeddingFailurePreventsGenerationAndStillSettlesOnlyItsDispatchedCall() throws Exception {
        try (Fixture fixture = new Fixture(StreamMode.NORMAL, null, new DomainException("MODEL_PROVIDER_ERROR", "embedding failed"))) {
            List<AiStreamEvent> events = fixture.run();

            assertThat(fixture.callStages()).containsExactly("RETRIEVAL_EMBEDDING");
            assertThat(fixture.provider.streamCalls()).isZero();
            assertThat(fixture.reservationCount()).isEqualTo(1);
            assertThat(events.stream().map(AiStreamEvent::event).toList())
                    .containsExactly("message.started", "message.error");
            assertThat(fixture.persistedStatus()).isEqualTo(AiMessageStatus.FAILED);
            assertThat(fixture.persistedContent()).isEmpty();
            assertThat(fixture.chargedTokens()).isPositive();
        }
    }

    @Test
    void completedClientRequestReplayDoesNotRepeatRagCallsOrEmitAnAdditionalAnswer() throws Exception {
        try (Fixture fixture = new Fixture(StreamMode.NORMAL, null, null)) {
            fixture.run();
            List<AiStreamEvent> replay = fixture.run();

            assertThat(fixture.reservationCount()).isEqualTo(2);
            assertThat(fixture.embedding.calls()).isEqualTo(1);
            assertThat(fixture.provider.streamCalls()).isEqualTo(1);
            assertThat(replay.stream().map(AiStreamEvent::event).toList())
                    .containsExactly("message.started", "message.delta", "message.completed");
            assertThat(replay.stream().filter(event -> event.event().equals("message.delta"))
                    .map(event -> (String) event.data()).toList()).containsExactly("answer");
        }
    }

    @Test
    void streamFailureBeforeFirstContentDoesNotRetryAndConservativelySettlesUnknownUsage() throws Exception {
        try (Fixture fixture = new Fixture(StreamMode.FAIL_BEFORE_CONTENT, null, null)) {
            List<AiStreamEvent> events = fixture.run();

            assertThat(fixture.callStages()).containsExactlyInAnyOrder("RETRIEVAL_EMBEDDING", "CHAT_COMPLETION");
            assertThat(fixture.provider.streamCalls()).isEqualTo(1);
            assertThat(fixture.reservationCount()).isEqualTo(2);
            assertThat(events.stream().map(AiStreamEvent::event).toList())
                    .containsExactly("message.started", "message.error");
            assertThat(fixture.persistedStatus()).isEqualTo(AiMessageStatus.FAILED);
            assertThat(fixture.persistedContent()).isEmpty();
            assertThat(fixture.persistedUsage()).contains("\"providerUsageComplete\":false");
            assertThat(fixture.chargedTokens()).isGreaterThan(fixture.estimatedInputTokens());
        }
    }

    @Test
    void partialOutputThenExceptionPreservesSinglePartialAnswerAndDoesNotRestartStream() throws Exception {
        try (Fixture fixture = new Fixture(StreamMode.PARTIAL_THEN_FAIL, null, null)) {
            List<AiStreamEvent> events = fixture.run();

            assertThat(fixture.provider.streamCalls()).isEqualTo(1);
            assertThat(fixture.reservationCount()).isEqualTo(2);
            assertThat(events.stream().map(AiStreamEvent::event).toList())
                    .containsExactly("message.started", "message.delta", "message.error");
            assertThat(events.stream().filter(event -> event.event().equals("message.delta"))
                    .map(event -> (String) event.data()).toList()).containsExactly("partial");
            assertThat(fixture.persistedStatus()).isEqualTo(AiMessageStatus.FAILED);
            assertThat(fixture.persistedContent()).isEqualTo("partial");
            assertThat(fixture.persistedUsage()).contains("\"actualInputTokens\":null", "\"actualOutputTokens\":null",
                    "\"providerUsageComplete\":false");
            assertThat(fixture.chargedTokens()).isGreaterThanOrEqualTo(
                    fixture.estimatedInputTokens() + fixture.reservedOutputTokens());
        }
    }

    @Test
    void streamWithoutFinishIsFailedWhileFinishedStreamCanPersistAnswer() throws Exception {
        try (Fixture fixture = new Fixture(StreamMode.NO_FINISH, null, null)) {
            List<AiStreamEvent> events = fixture.run();

            assertThat(events.stream().map(AiStreamEvent::event).toList())
                    .containsExactly("message.started", "message.delta", "message.error");
            assertThat(fixture.persistedStatus()).isEqualTo(AiMessageStatus.FAILED);
            assertThat(fixture.persistedContent()).isEqualTo("unfinished");
            assertThat(fixture.provider.streamCalls()).isEqualTo(1);
        }
    }

    @Test
    void downstreamDisconnectAfterFirstDeltaMarksInterruptedAndKeepsConservativeUsage() throws Exception {
        try (Fixture fixture = new Fixture(StreamMode.NORMAL, null, null)) {
            List<AiStreamEvent> emitted = new ArrayList<>();
            fixture.run(event -> {
                emitted.add(event);
                if (event.event().equals("message.delta")) {
                    throw new AiStreamAbortException("synthetic client disconnect");
                }
            });

            assertThat(emitted.stream().map(AiStreamEvent::event).toList())
                    .containsExactly("message.started", "message.delta");
            assertThat(fixture.provider.streamCalls()).isEqualTo(1);
            assertThat(fixture.persistedStatus()).isEqualTo(AiMessageStatus.INTERRUPTED);
            assertThat(fixture.persistedContent()).isEqualTo("ans");
            assertThat(fixture.chargedTokens()).isPositive();
            assertThat(fixture.persistedUsage()).contains("\"providerUsageComplete\":false");
        }
    }

    @Test
    void successfulStreamWithInputOnlyOrOutputOnlyUsageRecordsIncompleteUsageWithoutZeroCharge() throws Exception {
        for (AiTokenUsage usage : List.of(new AiTokenUsage(3L, null), new AiTokenUsage(null, 6L))) {
            try (Fixture fixture = new Fixture(StreamMode.NORMAL, usage, null)) {
                fixture.run();
                assertThat(fixture.persistedStatus()).isEqualTo(AiMessageStatus.COMPLETED);
                assertThat(fixture.persistedUsage()).contains("\"providerUsageComplete\":false");
                assertThat(fixture.chargedTokens()).isPositive();
            }
        }
    }

    private enum StreamMode { NORMAL, FAIL_BEFORE_CONTENT, PARTIAL_THEN_FAIL, NO_FINISH }

    private static final class Fixture implements AutoCloseable {
        private final UUID userId = UUID.randomUUID();
        private final UUID conversationId = UUID.randomUUID();
        private final UUID messageId = UUID.randomUUID();
        private final DriverManagerDataSource dataSource;
        private final JdbcTemplate jdbc;
        private final DataSourceTransactionManager transactions;
        private final ScheduledExecutorService heartbeat = Executors.newScheduledThreadPool(1);
        private final FakeEmbedding embedding;
        private final FakeProvider provider;
        private final List<String> invocationOrder = new ArrayList<>();
        private final ConversationService conversations = mock(ConversationService.class);
        private final AiStreamingService streamingService;
        private String content;
        private AiMessageStatus status;
        private String usage;

        Fixture(StreamMode mode, AiTokenUsage successUsage, RuntimeException embeddingFailure) throws Exception {
            dataSource = new DriverManagerDataSource("jdbc:h2:mem:chat" + UUID.randomUUID().toString().replace("-", "")
                    + ";MODE=PostgreSQL;DB_CLOSE_DELAY=-1", "sa", "");
            jdbc = new JdbcTemplate(dataSource);
            transactions = new DataSourceTransactionManager(dataSource);
            jdbc.execute("create table users (id UUID primary key, status varchar(16) not null default 'ACTIVE')");
            jdbc.execute("create table ingestion_jobs (id UUID primary key, status varchar(16) not null, "
                    + "attempt_count integer not null default 0, created_at timestamp with time zone not null)");
            try (Connection connection = dataSource.getConnection()) {
                ScriptUtils.executeSqlScript(connection, new ClassPathResource("db/migration/V30__ai_usage_guard.sql"));
                ScriptUtils.executeSqlScript(connection, new ClassPathResource("db/migration/V33__ai_usage_operation_kind_and_source.sql"));
            }
            jdbc.update("insert into users(id) values (?)", userId);

            AuralisProperties.Limits limits = limits();
            AiUsageGuard guard = new AiUsageGuard(jdbc, transactions,
                    Clock.fixed(Instant.parse("2026-10-13T00:00:00Z"), ZoneId.of("UTC")), properties(limits));
            AiInvocationGateway gateway = new AiUsageGatewayService(guard,
                    new AiProviderRegistry(List.of(provider = new FakeProvider(mode, successUsage, invocationOrder))),
                    new EmbeddingProviderRegistry(List.of(embedding = new FakeEmbedding(embeddingFailure, invocationOrder))),
                    properties(limits), heartbeat, transactions);

            AiSettingsService settings = mock(AiSettingsService.class);
            when(settings.resolve(any(), any())).thenReturn(
                    new AiSettingsService.ResolvedSettings(AiProviderType.DEEPSEEK, "chat-model", CHAT_CREDENTIAL, com.auralis.app.ai.usage.AiCredentialSource.USER_SUPPLIED));
            when(settings.resolveServerManagedEmbedding()).thenReturn(
                    new AiSettingsService.ResolvedSettings(AiProviderType.SILICONFLOW, "embedding-model", EMBEDDING_CREDENTIAL, com.auralis.app.ai.usage.AiCredentialSource.PLATFORM));
            RetrievalService retrieval = mock(RetrievalService.class);
            when(retrieval.retrieve(eq(userId), any(), any(Integer.class))).thenReturn(List.of());
            MessageView userMessage = new MessageView(messageId, 1, AiMessageRole.USER, AiMessageStatus.COMPLETED,
                    "question", null, null, Instant.now());
            when(conversations.reserveUserMessage(eq(userId), eq(conversationId), anyString(), anyString(), any()))
                    .thenReturn(new ConversationService.ClientRequestReservation(conversationId, userMessage, null, true),
                            new ConversationService.ClientRequestReservation(conversationId, userMessage,
                                    new MessageView(UUID.randomUUID(), 2, AiMessageRole.ASSISTANT,
                                            AiMessageStatus.COMPLETED, "answer", "chat-model", null,
                                            Instant.now()), false));
            when(conversations.get(userId, conversationId)).thenReturn(new ConversationView(
                    conversationId, "test", List.of(), Instant.now(), Instant.now(), null));
            when(conversations.appendAssistantReply(eq(userId), eq(conversationId), eq(messageId), anyString(),
                    any(AiMessageStatus.class), any(), any(), any())).thenAnswer(invocation -> {
                content = invocation.getArgument(3);
                status = invocation.getArgument(4);
                usage = invocation.getArgument(7);
                return new MessageView(UUID.randomUUID(), 2, AiMessageRole.ASSISTANT, status,
                        content, invocation.getArgument(5), invocation.getArgument(6), Instant.now());
            });
            streamingService = new AiStreamingService(conversations, settings, retrieval, properties(limits), gateway);
        }

        List<AiStreamEvent> run() {
            List<AiStreamEvent> events = new ArrayList<>();
            run(events::add);
            return events;
        }

        void run(AiStreamSink sink) {
            streamingService.stream(userId,
                    new AiMessageCommand(conversationId, "question", AiProviderType.DEEPSEEK, 3,
                            "chat-replay-request"), sink);
        }

        List<String> callStages() {
            return jdbc.query("select stage from ai_usage_reservations order by created_at, id",
                    (rs, row) -> rs.getString(1));
        }

        int reservationCount() {
            return jdbc.queryForObject("select count(*) from ai_usage_reservations", Integer.class);
        }

        long chargedTokens() {
            Long value = jdbc.queryForObject("select coalesce(sum(charged_tokens),0) from ai_usage_reservations", Long.class);
            return value == null ? 0 : value;
        }

        long estimatedInputTokens() {
            Long value = jdbc.queryForObject("select estimated_input_tokens from ai_usage_reservations "
                    + "where stage='CHAT_COMPLETION'", Long.class);
            return value == null ? 0 : value;
        }

        long reservedOutputTokens() {
            Long value = jdbc.queryForObject("select reserved_output_tokens from ai_usage_reservations "
                    + "where stage='CHAT_COMPLETION'", Long.class);
            return value == null ? 0 : value;
        }

        AiMessageStatus persistedStatus() { return status; }
        String persistedContent() { return content; }
        String persistedUsage() { return usage; }

        @Override public void close() { heartbeat.shutdownNow(); }
    }

    private static final class FakeProvider implements AiProviderPort {
        private final StreamMode mode;
        private final AiTokenUsage successUsage;
        private final List<String> invocationOrder;
        private final AtomicInteger calls = new AtomicInteger();
        FakeProvider(StreamMode mode, AiTokenUsage successUsage, List<String> invocationOrder) {
            this.mode = mode;
            this.successUsage = successUsage;
            this.invocationOrder = invocationOrder;
        }
        @Override public AiProviderType type() { return AiProviderType.DEEPSEEK; }
        @Override public AiProviderResponse complete(AiProviderRequest request, AiCredential credential) {
            throw new AssertionError("Chat scenario should use streaming");
        }
        @Override public void streamInto(AiProviderRequest request, AiCredential credential,
                java.util.function.Consumer<AiProviderChunk> sink) {
            calls.incrementAndGet();
            invocationOrder.add("CHAT_COMPLETION");
            switch (mode) {
                case FAIL_BEFORE_CONTENT -> throw new DomainException("MODEL_PROVIDER_ERROR", "before first chunk");
                case PARTIAL_THEN_FAIL -> {
                    sink.accept(new AiProviderChunk("partial", false, new AiTokenUsage(3L, null)));
                    throw new DomainException("MODEL_PROVIDER_ERROR", "connection reset");
                }
                case NO_FINISH -> sink.accept(new AiProviderChunk("unfinished", false, new AiTokenUsage(3L, 4L)));
                case NORMAL -> {
                    sink.accept(new AiProviderChunk("ans", false));
                    sink.accept(new AiProviderChunk("wer", true, successUsage == null ? new AiTokenUsage(3L, 4L) : successUsage));
                }
            }
        }
        int streamCalls() { return calls.get(); }
    }

    private static final class FakeEmbedding implements EmbeddingProviderPort {
        private final RuntimeException failure;
        private final List<String> invocationOrder;
        private final AtomicInteger calls = new AtomicInteger();
        FakeEmbedding(RuntimeException failure, List<String> invocationOrder) {
            this.failure = failure;
            this.invocationOrder = invocationOrder;
        }
        @Override public AiProviderType type() { return AiProviderType.SILICONFLOW; }
        @Override public EmbeddingResult embed(List<String> texts, AiCredential credential) {
            calls.incrementAndGet();
            invocationOrder.add("RETRIEVAL_EMBEDDING");
            if (failure != null) throw failure;
            return new EmbeddingResult(List.of(Collections.nCopies(1024, 0.1)), new AiTokenUsage(2L, 0L));
        }
        int calls() { return calls.get(); }
    }

    private static AuralisProperties.Ai ai(AuralisProperties.Limits limits) {
        return new AuralisProperties.Ai(false, "", "DEEPSEEK", new AuralisProperties.Defaults(null, null, null),
                3_000, 10_000, 120_000, 240_000, 12_000, 8, 5_242_880,
                32, 32_768, 3_000, 10_000, 3, 1_048_576, List.of(), false,
                1_000, 60_000, 3, limits);
    }

    private static AuralisProperties.Limits limits() {
        return new AuralisProperties.Limits(4, 2, 100_000, 200_000, 2_000_000,
                60_000, 1_000, 16, 2, 32_000, 24, 524_288, 512, 16_777_216);
    }

    private static AuralisProperties properties(AuralisProperties.Limits limits) {
        return new AuralisProperties("test", new AuralisProperties.Api("http://localhost", "*"),
                new AuralisProperties.Upload(1_000_000, "local", null),
                new AuralisProperties.Identity("synthetic-secret", 3_600, 86_400), ai(limits));
    }
}
