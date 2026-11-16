package com.auralis.app;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.auralis.app.ai.AiCredential;
import com.auralis.app.ai.AiProviderPort;
import com.auralis.app.ai.AiProviderRequest;
import com.auralis.app.ai.AiProviderResponse;
import com.auralis.app.ai.AiProviderType;
import com.auralis.app.ai.AiSettingsService;
import com.auralis.app.ai.OverviewDocumentValidator;
import com.auralis.app.ai.OverviewCancellation;
import com.auralis.app.ai.OverviewDtos;
import com.auralis.app.ai.OverviewGenerationService;
import com.auralis.app.ai.OverviewMode;
import com.auralis.app.ai.OverviewTaskDeadline;
import com.auralis.app.ai.diagnostics.OverviewTraceFileCollector;
import com.auralis.app.ai.internal.persistence.SourceChunkEntity;
import com.auralis.app.ai.internal.persistence.SourceChunkRepository;
import com.auralis.app.ai.internal.provider.AiProviderRegistry;
import com.auralis.app.ai.usage.AiInvocationGateway;
import com.auralis.app.ai.usage.AiInvocationResult;
import com.auralis.app.ai.usage.AiCredentialSource;
import com.auralis.app.ai.usage.AiUsageLimitException;
import com.auralis.app.ai.usage.AiTaskScope;
import com.auralis.app.ai.usage.AiStage;
import com.auralis.app.ai.usage.AiProviderUsage;
import com.auralis.app.shared.config.AuralisProperties;
import com.auralis.app.shared.error.DomainException;
import com.auralis.app.source.SourceIngestionStatus;
import com.auralis.app.source.SourceService;
import com.auralis.app.source.SourceType;
import com.auralis.app.source.SourceView;
import com.auralis.app.subject.SubjectService;
import com.auralis.app.subject.SubjectView;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.junit.jupiter.api.io.TempDir;
import org.slf4j.LoggerFactory;
import org.springframework.test.util.ReflectionTestUtils;
import tools.jackson.databind.ObjectMapper;

import java.nio.file.Path;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.ArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class AiOverviewServiceTests {

    private static final String CLEAN = "{\"exclusions\":[]}";
    private static final String OUTLINE = "## Limits\n- Explain convergence.";
    private static final String SUMMARY = "Convergence describes how a sequence approaches a limit.";

    @TempDir
    Path traceRoot;

    @Test
    void enablingOverviewTraceDoesNotChangeSyntheticProviderCallsOrResult() throws Exception {
        UUID userId = UUID.randomUUID();
        UUID sourceId = UUID.randomUUID();
        SourceView source = source(sourceId, UUID.randomUUID(), SourceIngestionStatus.READY);
        SourceService sourceService = mock(SourceService.class);
        when(sourceService.requireActiveSource(userId, sourceId)).thenReturn(source);
        List<AiProviderRequest> disabledRequests = new ArrayList<>();
        List<AiProviderRequest> enabledRequests = new ArrayList<>();
        List<SourceChunkEntity> chunks = List.of(detailedChunk(userId, sourceId, source.ingestionRevision(), "Trace comparison facts."));
        OverviewGenerationService disabledService = service(sourceService, chunks, recordingProvider(disabledRequests));
        OverviewGenerationService enabledService = service(sourceService, chunks, recordingProvider(enabledRequests));
        OverviewTraceFileCollector collector = new OverviewTraceFileCollector(traceRoot, new ObjectMapper(), false);
        try {
            ReflectionTestUtils.setField(enabledService, "overviewTrace", collector);
            var request = sourceRequest(sourceId, OverviewMode.SUMMARY, null);
            assertThat(enabledService.generateSource(userId, request))
                    .isEqualTo(disabledService.generateSource(userId, request));
            assertThat(enabledRequests).containsExactlyElementsOf(disabledRequests).hasSize(3);
        } finally {
            collector.close();
        }
    }

    @Test
    void logsKnownUsageCodesAndHidesUnknownCodesAndExceptionDetails() {
        for (String code : List.of("AI_DAILY_QUOTA_EXCEEDED", "private-code-marker")) {
            UUID userId = UUID.randomUUID();
            UUID sourceId = UUID.randomUUID();
            UUID revision = UUID.randomUUID();
            SourceService sourceService = mock(SourceService.class);
            when(sourceService.requireActiveSource(userId, sourceId))
                    .thenReturn(source(sourceId, UUID.randomUUID(), SourceIngestionStatus.READY, revision));
            AiProviderPort provider = new AiProviderPort() {
                @Override public AiProviderType type() { return AiProviderType.OPENAI_COMPATIBLE; }
                @Override public AiProviderResponse complete(AiProviderRequest request, AiCredential credential) {
                    throw new AiUsageLimitException(code, 429, 30,
                            Instant.parse("2026-10-11T00:00:00Z"));
                }
                @Override public AiProviderResponse complete(AiProviderRequest request, AiCredential credential,
                        long timeoutMillis, OverviewCancellation cancellation) {
                    return complete(request, credential);
                }
            };
            OverviewGenerationService service = serviceWithTaskTimeout(sourceService, mock(SubjectService.class),
                    List.of(detailedChunk(userId, sourceId, revision, "safe source text")), provider, 5_000);
            Logger logger = (Logger) LoggerFactory.getLogger(OverviewGenerationService.class);
            ListAppender<ILoggingEvent> appender = new ListAppender<>();
            appender.start();
            logger.addAppender(appender);
            try {
                assertThatThrownBy(() -> service.generateSource(userId,
                        sourceRequest(sourceId, OverviewMode.ALL, "secret-prompt-marker")))
                        .isInstanceOf(AiUsageLimitException.class);
            } finally {
                logger.detachAppender(appender);
                appender.stop();
            }

            List<String> failures = appender.list.stream().map(ILoggingEvent::getFormattedMessage)
                    .filter(message -> message.contains("OVERVIEW_GENERATION_FAILED")).toList();
            assertThat(failures).singleElement().satisfies(message -> {
                assertThat(message).contains("errorCode=" + (code.startsWith("AI_") ? code : "OVERVIEW_GENERATION_FAILED"));
                assertThat(message).doesNotContain("private-code-marker", "secret-prompt-marker");
            });
        }
    }

    @Test
    void rejectsFileOverviewWhenProviderResponseExceedsTotalTaskDeadline() {
        UUID userId = UUID.randomUUID();
        UUID sourceId = UUID.randomUUID();
        UUID revision = UUID.randomUUID();
        SourceService sourceService = mock(SourceService.class);
        when(sourceService.requireActiveSource(userId, sourceId))
                .thenReturn(source(sourceId, UUID.randomUUID(), SourceIngestionStatus.READY, revision));
        AiProviderPort provider = slowProvider(CLEAN, 80);
        OverviewGenerationService service = serviceWithTaskTimeout(sourceService, mock(SubjectService.class),
                List.of(detailedChunk(userId, sourceId, revision, "source facts")), provider, 10);

        assertThatThrownBy(() -> service.generateSource(userId,
                sourceRequest(sourceId, OverviewMode.ALL, null)))
                .isInstanceOf(DomainException.class)
                .extracting(error -> ((DomainException) error).code())
                .isEqualTo("MODEL_TIMEOUT");
    }

    @Test
    void zeroPersistedRemainingMillisCreatesAnUnboundedDeadlineWithBoundedProviderResponses() {
        OverviewGenerationService service = serviceWithTaskTimeout(mock(SourceService.class), mock(SubjectService.class),
                List.of(), mock(AiProviderPort.class), 0);

        OverviewTaskDeadline deadline = ReflectionTestUtils.invokeMethod(service, "newTaskDeadline", 0L);

        assertThat(deadline).isNotNull();
        assertThat(deadline.remainingMillis()).isEqualTo(Long.MAX_VALUE);
        assertThat(deadline.responseTimeoutMillis(120_000)).isEqualTo(120_000);
        deadline.finish();
    }

    @Test
    void rejectsSubjectOverviewWhenProviderResponseExceedsTotalTaskDeadline() {
        UUID userId = UUID.randomUUID();
        UUID subjectId = UUID.randomUUID();
        UUID sourceId = UUID.randomUUID();
        SourceService sourceService = mock(SourceService.class);
        when(sourceService.requireActiveSource(userId, sourceId))
                .thenReturn(source(sourceId, subjectId, SourceIngestionStatus.READY));
        AiProviderPort provider = slowProvider(CLEAN, 80);
        OverviewGenerationService service = serviceWithTaskTimeout(sourceService, subjectService(userId, subjectId),
                List.of(), provider, 10);
        OverviewDtos.SubjectOverviewSourceInput input = new OverviewDtos.SubjectOverviewSourceInput(
                sourceId, "Calculus", null, SUMMARY);

        assertThatThrownBy(() -> service.generateSubject(userId,
                new OverviewDtos.SubjectOverviewRequest(subjectId, OverviewMode.SUMMARY, null, List.of(input))))
                .isInstanceOf(DomainException.class)
                .extracting(error -> ((DomainException) error).code())
                .isEqualTo("MODEL_TIMEOUT");
    }

    @Test
    void totalDeadlineCancelsProviderCallAndReturnsWithinBudget() {
        UUID userId = UUID.randomUUID();
        UUID sourceId = UUID.randomUUID();
        UUID revision = UUID.randomUUID();
        SourceService sourceService = mock(SourceService.class);
        when(sourceService.requireActiveSource(userId, sourceId))
                .thenReturn(source(sourceId, UUID.randomUUID(), SourceIngestionStatus.READY, revision));
        AtomicInteger providerCalls = new AtomicInteger();
        java.util.concurrent.CountDownLatch providerStopped = new java.util.concurrent.CountDownLatch(1);
        AiProviderPort provider = new AiProviderPort() {
            @Override public AiProviderType type() { return AiProviderType.OPENAI_COMPATIBLE; }
            @Override public AiProviderResponse complete(AiProviderRequest request, AiCredential credential) {
                return complete(request, credential, 120_000L);
            }
            @Override public AiProviderResponse complete(
                    AiProviderRequest request, AiCredential credential, long responseTimeoutMillis) {
                providerCalls.incrementAndGet();
                try {
                    Thread.sleep(2_500);
                } catch (InterruptedException exception) {
                    Thread.currentThread().interrupt();
                    throw new IllegalStateException("test provider interrupted", exception);
                }
                return new AiProviderResponse(CLEAN, 1, 1);
            }
            @Override public AiProviderResponse complete(AiProviderRequest request, AiCredential credential,
                    long responseTimeoutMillis, com.auralis.app.ai.OverviewCancellation cancellation) {
                providerCalls.incrementAndGet();
                cancellation.onCancel(providerStopped::countDown);
                try {
                    providerStopped.await();
                } catch (InterruptedException exception) {
                    Thread.currentThread().interrupt();
                    throw new IllegalStateException("test provider interrupted", exception);
                }
                throw new DomainException("MODEL_TIMEOUT", "test provider aborted by deadline");
            }
        };
        var watchdog = java.util.concurrent.Executors.newSingleThreadScheduledExecutor();
        OverviewGenerationService service = serviceWithTaskTimeout(sourceService, mock(SubjectService.class),
                List.of(detailedChunk(userId, sourceId, revision, "source facts")), provider, 1_500, watchdog);
        AtomicReference<Long> elapsedMillis = new AtomicReference<>();

        assertThatThrownBy(() -> {
            long started = System.nanoTime();
            try {
                service.generateSource(userId, sourceRequest(sourceId, OverviewMode.ALL, null));
            } catch (RuntimeException failure) {
                elapsedMillis.set(TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - started));
                throw failure;
            }
        }).isInstanceOf(DomainException.class)
                .extracting(error -> ((DomainException) error).code())
                .isEqualTo("MODEL_TIMEOUT");

        assertThat(providerCalls).hasValue(1);
        assertThat(elapsedMillis.get()).isLessThan(2_000L);
        assertThat(providerStopped.getCount()).isZero();
        watchdog.shutdownNow();
    }

    @Test
    void capsSingleProviderResponseTimeoutAtTheRemainingTaskBudget() {
        UUID userId = UUID.randomUUID();
        UUID sourceId = UUID.randomUUID();
        UUID revision = UUID.randomUUID();
        SourceService sourceService = mock(SourceService.class);
        when(sourceService.requireActiveSource(userId, sourceId))
                .thenReturn(source(sourceId, UUID.randomUUID(), SourceIngestionStatus.READY, revision));
        AtomicReference<Long> requestedTimeout = new AtomicReference<>();
        AiProviderPort provider = new AiProviderPort() {
            @Override public AiProviderType type() { return AiProviderType.OPENAI_COMPATIBLE; }
            @Override public AiProviderResponse complete(AiProviderRequest request, AiCredential credential) {
                return new AiProviderResponse(markdownResponse(request), 1, 1);
            }
            @Override public AiProviderResponse complete(
                    AiProviderRequest request, AiCredential credential, long responseTimeoutMillis) {
                requestedTimeout.set(responseTimeoutMillis);
                return new AiProviderResponse(markdownResponse(request), 1, 1);
            }
        };
        OverviewGenerationService service = serviceWithTaskTimeout(sourceService, mock(SubjectService.class),
                List.of(detailedChunk(userId, sourceId, revision, "source facts")), provider, 5_000);

        service.generateSource(userId, sourceRequest(sourceId, OverviewMode.ALL, null));

        assertThat(requestedTimeout).hasValueSatisfying(value -> assertThat(value).isBetween(1L, 5_000L));
    }

    @Test
    void rejectsForeignDeletedAndNotReadySourcesBeforeProviderCalls() {
        UUID userId = UUID.randomUUID();
        UUID sourceId = UUID.randomUUID();
        SourceService sourceService = mock(SourceService.class);
        OverviewGenerationService service = service(sourceService, mock(SubjectService.class), List.of(), mock(AiProviderPort.class));
        when(sourceService.requireActiveSource(userId, sourceId))
                .thenThrow(new DomainException("RESOURCE_NOT_FOUND", "Source was not found"));

        assertThatThrownBy(() -> service.generateSource(userId, sourceRequest(sourceId, OverviewMode.ALL, null)))
                .isInstanceOf(DomainException.class)
                .hasMessage("Source was not found");

        doReturn(source(sourceId, UUID.randomUUID(), SourceIngestionStatus.INDEXING))
                .when(sourceService).requireActiveSource(userId, sourceId);
        assertThatThrownBy(() -> service.generateSource(userId, sourceRequest(sourceId, OverviewMode.ALL, null)))
                .isInstanceOf(DomainException.class)
                .hasMessageContaining("ready");
    }

    @Test
    void failureLogsExcludeSensitiveMessagesAndThrowableStack() {
        UUID userId = UUID.randomUUID();
        UUID sourceId = UUID.randomUUID();
        String requestId = "11111111-1111-4111-8111-111111111111";
        SourceService sourceService = mock(SourceService.class);
        String sensitiveMessage = "Authorization: Bearer bearer-secret signed URL https://storage.example.test/object?X-Amz-Signature=signed-secret prompt-content";
        DomainException failure = new DomainException("MUTATION_REJECTED", sensitiveMessage, null,
                new IllegalStateException("raw-cause-text"));
        when(sourceService.requireActiveSource(userId, sourceId)).thenThrow(failure);
        OverviewGenerationService service = service(sourceService, mock(SubjectService.class), List.of(), mock(AiProviderPort.class));
        Logger logger = (Logger) LoggerFactory.getLogger(OverviewGenerationService.class);
        ListAppender<ILoggingEvent> appender = new ListAppender<>();
        appender.start();
        logger.addAppender(appender);
        try {
            assertThatThrownBy(() -> service.generateSource(userId,
                    sourceRequest(sourceId, OverviewMode.ALL, null), requestId))
                    .isSameAs(failure);
        } finally {
            logger.detachAppender(appender);
            appender.stop();
        }

        String output = appender.list.stream()
                .map(ILoggingEvent::getFormattedMessage)
                .collect(java.util.stream.Collectors.joining("\n"));
        List<String> failureLogs = appender.list.stream()
                .filter(event -> event.getLevel() == ch.qos.logback.classic.Level.ERROR)
                .map(ILoggingEvent::getFormattedMessage)
                .toList();
        String allowedFailureLogPattern = "OVERVIEW_GENERATION_FAILED requestId=" + requestId + " generationId=[0-9a-f-]{36} "
                + "userId=[0-9a-f-]{36} sourceId=[0-9a-f-]{36} revision=null mode=ALL phase=FINAL "
                + "errorCode=MUTATION_REJECTED exceptionType=" + DomainException.class.getName()
                + " causeType=" + IllegalStateException.class.getName();
        assertThat(failureLogs).singleElement().matches(value -> value.matches(allowedFailureLogPattern));
        assertThat(output)
                .contains("OVERVIEW_GENERATION_FAILED", "requestId=" + requestId, "phase=FINAL",
                        "errorCode=MUTATION_REJECTED", "exceptionType=" + DomainException.class.getName(),
                        "causeType=" + IllegalStateException.class.getName())
                .doesNotContain("exceptionMessage=", "causeMessage=", "Authorization: Bearer",
                        "bearer-secret", "https://storage.example.test/object", "signed-secret",
                        "prompt-content", "raw-cause-text");
        assertThat(appender.list).allSatisfy(event -> assertThat(event.getThrowableProxy()).isNull());
    }

    @Test
    void failureLogsExcludeMaliciousRequestIdContent() {
        UUID userId = UUID.randomUUID();
        UUID sourceId = UUID.randomUUID();
        String maliciousRequestId = "Authorization: Bearer bearer-request-token signed URL "
                + "https://storage.example.test/object?X-Amz-Signature=request-signature prompt-like-content";
        SourceService sourceService = mock(SourceService.class);
        when(sourceService.requireActiveSource(userId, sourceId))
                .thenThrow(new DomainException("RESOURCE_NOT_FOUND", "Source was not found"));
        OverviewGenerationService service = service(sourceService, mock(SubjectService.class), List.of(), mock(AiProviderPort.class));
        Logger logger = (Logger) LoggerFactory.getLogger(OverviewGenerationService.class);
        ListAppender<ILoggingEvent> appender = new ListAppender<>();
        appender.start();
        logger.addAppender(appender);
        try {
            assertThatThrownBy(() -> service.generateSource(userId,
                    sourceRequest(sourceId, OverviewMode.ALL, null), maliciousRequestId))
                    .isInstanceOf(DomainException.class);
        } finally {
            logger.detachAppender(appender);
            appender.stop();
        }

        String output = appender.list.stream()
                .map(ILoggingEvent::getFormattedMessage)
                .collect(java.util.stream.Collectors.joining("\n"));
        assertThat(output)
                .doesNotContain("Authorization: Bearer", "bearer-request-token",
                        "https://storage.example.test/object", "request-signature", "prompt-like-content");
        assertThat(output).containsPattern("requestId=[0-9a-f-]{36}");
    }

    @Test
    void preservesPreProviderSourceDomainErrorsWithoutCallingProvider() {
        for (String code : List.of("RESOURCE_NOT_FOUND", "MUTATION_REJECTED")) {
            UUID userId = UUID.randomUUID();
            UUID sourceId = UUID.randomUUID();
            SourceService sourceService = mock(SourceService.class);
            SourceView active = source(sourceId, UUID.randomUUID(), SourceIngestionStatus.READY);
            List<AiProviderRequest> requests = new ArrayList<>();
            when(sourceService.requireActiveSource(userId, sourceId))
                    .thenReturn(active)
                    .thenThrow(new DomainException(code, "Source changed"));
            OverviewGenerationService service = service(sourceService, mock(SubjectService.class),
                    List.of(detailedChunk(userId, sourceId, active.ingestionRevision(), "Calculus content")),
                    recordingProvider(requests));

            assertThatThrownBy(() -> service.generateSource(userId, sourceRequest(sourceId, OverviewMode.ALL, null)))
                    .isInstanceOf(DomainException.class)
                    .extracting(exception -> ((DomainException) exception).code())
                    .isEqualTo(code);
            assertThat(requests).isEmpty();
        }
    }

    @Test
    void rejectsSourcesWithoutActiveChunks() {
        UUID userId = UUID.randomUUID();
        UUID sourceId = UUID.randomUUID();
        SourceService sourceService = mock(SourceService.class);
        OverviewGenerationService service = service(sourceService, mock(SubjectService.class), List.of(), mock(AiProviderPort.class));
        when(sourceService.requireActiveSource(userId, sourceId))
                .thenReturn(source(sourceId, UUID.randomUUID(), SourceIngestionStatus.READY));

        assertThatThrownBy(() -> service.generateSource(userId, sourceRequest(sourceId, OverviewMode.ALL, null)))
                .isInstanceOf(DomainException.class)
                .hasMessageContaining("active chunks");
    }

    @Test
    void concurrentSameKeySourceOverviewsShareOneGeneration() throws Exception {
        UUID userId = UUID.randomUUID();
        UUID sourceId = UUID.randomUUID();
        UUID revision = UUID.randomUUID();
        SourceService sourceService = mock(SourceService.class);
        when(sourceService.requireActiveSource(userId, sourceId))
                .thenReturn(source(sourceId, UUID.randomUUID(), SourceIngestionStatus.READY, revision));
        CountDownLatch providerEntered = new CountDownLatch(1);
        CountDownLatch releaseProvider = new CountDownLatch(1);
        AtomicInteger providerCalls = new AtomicInteger();
        AiProviderPort provider = new AiProviderPort() {
            @Override public AiProviderType type() { return AiProviderType.OPENAI_COMPATIBLE; }
            @Override public AiProviderResponse complete(AiProviderRequest request, AiCredential credential) {
                if (providerCalls.incrementAndGet() == 1) {
                    providerEntered.countDown();
                    await(releaseProvider);
                }
                return new AiProviderResponse(markdownResponse(request), 1, 1);
            }
        };
        OverviewGenerationService service = service(sourceService,
                List.of(detailedChunk(userId, sourceId, revision, "Calculus content")), provider);
        ExecutorService executor = Executors.newFixedThreadPool(2);
        AtomicReference<Thread> followerThread = new AtomicReference<>();
        try {
            Future<OverviewDtos.OverviewResponse> leader = executor.submit(() -> service.generateSource(userId,
                    sourceRequest(sourceId, OverviewMode.ALL, "focus on limits"), UUID.randomUUID().toString()));
            assertThat(providerEntered.await(5, TimeUnit.SECONDS)).isTrue();
            Future<OverviewDtos.OverviewResponse> follower = executor.submit(() -> {
                followerThread.set(Thread.currentThread());
                return service.generateSource(userId,
                        sourceRequest(sourceId, OverviewMode.ALL, "focus on limits"), UUID.randomUUID().toString());
            });

            awaitFollowerJoinOrCompletion(follower, followerThread);
            assertThat(follower.isDone()).isFalse();
            assertThat(providerCalls).hasValue(1);
            releaseProvider.countDown();

            assertThat(leader.get(5, TimeUnit.SECONDS)).isEqualTo(follower.get(5, TimeUnit.SECONDS));
            assertThat(providerCalls).hasValue(3);
        } finally {
            releaseProvider.countDown();
            executor.shutdownNow();
            assertThat(executor.awaitTermination(5, TimeUnit.SECONDS)).isTrue();
        }
    }

    @Test
    void ownerDisconnectKeepsOriginalIngressDeadlineForJoinedFollower() throws Exception {
        UUID userId = UUID.randomUUID();
        UUID sourceId = UUID.randomUUID();
        UUID revision = UUID.randomUUID();
        SourceService sourceService = mock(SourceService.class);
        when(sourceService.requireActiveSource(userId, sourceId))
                .thenReturn(source(sourceId, UUID.randomUUID(), SourceIngestionStatus.READY, revision));
        CountDownLatch providerEntered = new CountDownLatch(1);
        CountDownLatch providerExited = new CountDownLatch(1);
        AtomicInteger providerCalls = new AtomicInteger();
        AtomicReference<OverviewCancellation> operationCancellation = new AtomicReference<>();
        AiProviderPort provider = new AiProviderPort() {
            @Override public AiProviderType type() { return AiProviderType.OPENAI_COMPATIBLE; }
            @Override public AiProviderResponse complete(AiProviderRequest request, AiCredential credential) {
                throw new AssertionError("cancellable overload is required for this test");
            }
            @Override public AiProviderResponse complete(AiProviderRequest request, AiCredential credential,
                                                          long timeout, OverviewCancellation cancellation) {
                providerCalls.incrementAndGet();
                operationCancellation.set(cancellation);
                providerEntered.countDown();
                try {
                    while (!cancellation.isCancelled()) Thread.sleep(10);
                    throw new DomainException("MODEL_TIMEOUT", "test provider deadline");
                } catch (InterruptedException interrupted) {
                    Thread.currentThread().interrupt();
                    throw new IllegalStateException(interrupted);
                } finally {
                    providerExited.countDown();
                }
            }
        };
        ScheduledExecutorService watchdog = Executors.newSingleThreadScheduledExecutor();
        ExecutorService callers = Executors.newFixedThreadPool(2);
        ExecutorService generation = Executors.newSingleThreadExecutor();
        OverviewTaskDeadline ingressDeadline = new OverviewTaskDeadline(5_000, System::nanoTime);
        ingressDeadline.startWatchdog(watchdog);
        OverviewCancellation ownerRequest = new OverviewCancellation();
        OverviewGenerationService service = serviceWithTaskTimeout(sourceService, mock(SubjectService.class),
                List.of(detailedChunk(userId, sourceId, revision, "Calculus content")), provider, 12_000, watchdog, generation);
        AtomicReference<Thread> followerThread = new AtomicReference<>();
        long acceptedAt = System.nanoTime();
        try {
            Future<OverviewDtos.OverviewResponse> owner = callers.submit(() -> {
                Thread.sleep(1_500); // Simulate time already spent waiting in the request queue.
                return service.generateSource(userId, sourceRequest(sourceId, OverviewMode.ALL, null),
                        UUID.randomUUID().toString(), ownerRequest, ingressDeadline);
            });
            assertThat(providerEntered.await(2, TimeUnit.SECONDS)).isTrue();
            Future<OverviewDtos.OverviewResponse> follower = callers.submit(() -> {
                followerThread.set(Thread.currentThread());
                return service.generateSource(userId, sourceRequest(sourceId, OverviewMode.ALL, null));
            });
            awaitFollowerJoinOrCompletion(follower, followerThread);
            assertThat(providerCalls).hasValue(1);

            ownerRequest.cancel(OverviewCancellation.Reason.REQUEST_DISCONNECTED);
            assertThatThrownBy(() -> owner.get(1, TimeUnit.SECONDS))
                    .hasCauseInstanceOf(DomainException.class);
            assertThat(operationCancellation.get().isCancelled()).isFalse();
            assertThat(providerExited.await(4, TimeUnit.SECONDS)).isTrue();
            assertThat(operationCancellation.get().reason()).isEqualTo(OverviewCancellation.Reason.DEADLINE);
            assertThatThrownBy(() -> follower.get(1, TimeUnit.SECONDS))
                    .hasCauseInstanceOf(DomainException.class);
            assertThat(TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - acceptedAt)).isLessThan(5_800L);
            assertThat(providerCalls).hasValue(1);
        } finally {
            ownerRequest.cancel(OverviewCancellation.Reason.REQUEST_DISCONNECTED);
            ingressDeadline.finish();
            callers.shutdownNow();
            generation.shutdownNow();
            watchdog.shutdownNow();
            assertThat(callers.awaitTermination(5, TimeUnit.SECONDS)).isTrue();
            assertThat(generation.awaitTermination(5, TimeUnit.SECONDS)).isTrue();
        }
    }

    @Test
    void renamedSourceDoesNotJoinAnOlderTitleGeneration() throws Exception {
        UUID userId = UUID.randomUUID();
        UUID sourceId = UUID.randomUUID();
        UUID subjectId = UUID.randomUUID();
        UUID revision = UUID.randomUUID();
        SourceService sourceService = mock(SourceService.class);
        SourceView original = source(sourceId, subjectId, SourceIngestionStatus.READY, revision);
        SourceView renamed = new SourceView(sourceId, subjectId, SourceType.FILE, "Renamed", null, null,
                null, null, SourceIngestionStatus.READY, revision, null, null, 1,
                Instant.now(), Instant.now(), null, null);
        when(sourceService.requireActiveSource(userId, sourceId)).thenReturn(original);
        CountDownLatch providerEntered = new CountDownLatch(1);
        CountDownLatch releaseProvider = new CountDownLatch(1);
        AtomicInteger providerCalls = new AtomicInteger();
        AiProviderPort provider = new AiProviderPort() {
            @Override public AiProviderType type() { return AiProviderType.OPENAI_COMPATIBLE; }
            @Override public AiProviderResponse complete(AiProviderRequest request, AiCredential credential) {
                if (providerCalls.incrementAndGet() == 1) {
                    providerEntered.countDown();
                    await(releaseProvider);
                }
                return new AiProviderResponse(markdownResponse(request), 1, 1);
            }
        };
        OverviewGenerationService service = service(sourceService,
                List.of(detailedChunk(userId, sourceId, revision, "Calculus content")), provider);
        ExecutorService executor = Executors.newFixedThreadPool(2);
        try {
            Future<OverviewDtos.OverviewResponse> originalRequest = executor.submit(() -> service.generateSource(
                    userId, sourceRequest(sourceId, OverviewMode.ALL, null)));
            assertThat(providerEntered.await(5, TimeUnit.SECONDS)).isTrue();
            when(sourceService.requireActiveSource(userId, sourceId)).thenReturn(renamed);
            Future<OverviewDtos.OverviewResponse> renamedRequest = executor.submit(() -> service.generateSource(
                    userId, sourceRequest(sourceId, OverviewMode.ALL, null)));
            assertThat(renamedRequest.get(5, TimeUnit.SECONDS).title()).isEqualTo("Renamed");
            assertThat(providerCalls).hasValue(4);
            releaseProvider.countDown();
            assertThatThrownBy(() -> originalRequest.get(5, TimeUnit.SECONDS))
                    .hasCauseInstanceOf(DomainException.class);
        } finally {
            releaseProvider.countDown();
            executor.shutdownNow();
            assertThat(executor.awaitTermination(5, TimeUnit.SECONDS)).isTrue();
        }
    }

    @Test
    void concurrentSourceOverviewFailurePreservesDomainExceptionAndAllowsRetry() throws Exception {
        UUID userId = UUID.randomUUID();
        UUID sourceId = UUID.randomUUID();
        UUID revision = UUID.randomUUID();
        SourceService sourceService = mock(SourceService.class);
        when(sourceService.requireActiveSource(userId, sourceId))
                .thenReturn(source(sourceId, UUID.randomUUID(), SourceIngestionStatus.READY, revision));
        CountDownLatch providerEntered = new CountDownLatch(1);
        CountDownLatch releaseProvider = new CountDownLatch(1);
        AtomicInteger providerCalls = new AtomicInteger();
        DomainException providerFailure = new DomainException("MODEL_PROVIDER_ERROR", "provider failed");
        AiProviderPort provider = new AiProviderPort() {
            @Override public AiProviderType type() { return AiProviderType.OPENAI_COMPATIBLE; }
            @Override public AiProviderResponse complete(AiProviderRequest request, AiCredential credential) {
                providerCalls.incrementAndGet();
                providerEntered.countDown();
                await(releaseProvider);
                throw providerFailure;
            }
        };
        OverviewGenerationService service = service(sourceService,
                List.of(detailedChunk(userId, sourceId, revision, "Calculus content")), provider);
        ExecutorService executor = Executors.newFixedThreadPool(2);
        AtomicReference<Thread> followerThread = new AtomicReference<>();
        try {
            Future<OverviewDtos.OverviewResponse> leader = executor.submit(() -> service.generateSource(userId,
                    sourceRequest(sourceId, OverviewMode.ALL, null), UUID.randomUUID().toString()));
            assertThat(providerEntered.await(5, TimeUnit.SECONDS)).isTrue();
            Future<OverviewDtos.OverviewResponse> follower = executor.submit(() -> {
                followerThread.set(Thread.currentThread());
                return service.generateSource(userId,
                        sourceRequest(sourceId, OverviewMode.ALL, null), UUID.randomUUID().toString());
            });

            awaitFollowerJoinOrCompletion(follower, followerThread);
            assertThat(follower.isDone()).isFalse();
            assertThat(providerCalls).hasValue(1);
            releaseProvider.countDown();

            assertFutureFailureIs(leader, providerFailure);
            assertFutureFailureIs(follower, providerFailure);
            assertThatThrownBy(() -> service.generateSource(userId,
                    sourceRequest(sourceId, OverviewMode.ALL, null)))
                    .isSameAs(providerFailure);
            assertThat(providerCalls).hasValue(2);
        } finally {
            releaseProvider.countDown();
            executor.shutdownNow();
            assertThat(executor.awaitTermination(5, TimeUnit.SECONDS)).isTrue();
        }
    }

    @ParameterizedTest
    @ValueSource(strings = {"deleted", "revision", "status"})
    void fencesSourceMutationBeforeParsingReturnedCleanResponse(String mutation) {
        UUID userId = UUID.randomUUID();
        UUID sourceId = UUID.randomUUID();
        UUID subjectId = UUID.randomUUID();
        SourceService sources = mock(SourceService.class);
        SourceView active = source(sourceId, subjectId, SourceIngestionStatus.READY);
        SourceView changed = mutation.equals("revision")
                ? source(sourceId, subjectId, SourceIngestionStatus.READY)
                : source(sourceId, subjectId, SourceIngestionStatus.INDEXING, active.ingestionRevision());
        AtomicInteger calls = new AtomicInteger();
        when(sources.requireActiveSource(userId, sourceId)).thenAnswer(invocation -> {
            if (calls.get() == 0) return active;
            if (mutation.equals("deleted")) throw new DomainException("RESOURCE_NOT_FOUND", "Source was not found");
            return changed;
        });
        AiProviderPort provider = new AiProviderPort() {
            @Override public AiProviderType type() { return AiProviderType.OPENAI_COMPATIBLE; }
            @Override public AiProviderResponse complete(AiProviderRequest request, AiCredential credential) {
                calls.incrementAndGet();
                return new AiProviderResponse("malformed cleaning response", 1, 1);
            }
        };
        OverviewGenerationService service = service(sources,
                List.of(detailedChunk(userId, sourceId, active.ingestionRevision(), "Source facts.")), provider);

        assertThatThrownBy(() -> service.generateSource(userId, sourceRequest(sourceId, OverviewMode.ALL, null)))
                .isInstanceOfSatisfying(DomainException.class, failure -> assertThat(failure.code())
                        .isEqualTo(mutation.equals("deleted") ? "RESOURCE_NOT_FOUND" : "MUTATION_REJECTED"));
        assertThat(calls).hasValue(1);
    }

    @ParameterizedTest
    @EnumSource(value = SourceType.class, names = {"TEXT", "URL"})
    void nonFileSourcesSupportIndependentSummaryOnly(SourceType sourceType) {
        UUID userId = UUID.randomUUID();
        UUID sourceId = UUID.randomUUID();
        SourceService sources = mock(SourceService.class);
        when(sources.requireActiveSource(userId, sourceId)).thenReturn(new SourceView(sourceId, UUID.randomUUID(),
                sourceType, "Calculus", null, null, null, null, SourceIngestionStatus.READY, UUID.randomUUID(),
                null, null, 1, Instant.now(), Instant.now(), null, null));
        List<AiProviderRequest> requests = new ArrayList<>();
        OverviewGenerationService service = service(sources,
                List.of(chunk(userId, sourceId, true, "Calculus content.")), recordingProvider(requests));

        for (OverviewMode mode : List.of(OverviewMode.ALL, OverviewMode.OUTLINE)) {
            assertThatThrownBy(() -> service.generateSource(userId, sourceRequest(sourceId, mode, null)))
                    .isInstanceOfSatisfying(DomainException.class,
                            failure -> assertThat(failure.code()).isEqualTo("MODEL_UNAVAILABLE"));
        }
        assertThat(requests).isEmpty();
        var summary = service.generateSource(userId, sourceRequest(sourceId, OverviewMode.SUMMARY, null));
        assertThat(summary).isEqualTo(new OverviewDtos.OverviewResponse(2, "Calculus", null, SUMMARY));
        assertThat(requests).hasSize(3);
        assertThat(requests.getFirst().messages().getLast().content()).contains("Calculus content.");
    }

    @ParameterizedTest
    @EnumSource(OverviewMode.class)
    void directSubjectOverviewAdmitsAndGeneratesRequestedModeFromSourceMarkdown(OverviewMode mode) {
        UUID userId = UUID.randomUUID();
        UUID subjectId = UUID.randomUUID();
        UUID sourceId = UUID.randomUUID();
        SourceService sources = mock(SourceService.class);
        when(sources.requireActiveSource(userId, sourceId))
                .thenReturn(source(sourceId, subjectId, SourceIngestionStatus.READY));
        List<AiProviderRequest> requests = new ArrayList<>();
        OverviewGenerationService service = service(sources, subjectService(userId, subjectId),
                List.of(), recordingProvider(requests));
        var input = new OverviewDtos.SubjectOverviewSourceInput(sourceId, "Calculus",
                mode == OverviewMode.SUMMARY ? null : OUTLINE, mode == OverviewMode.OUTLINE ? null : SUMMARY);
        var request = new OverviewDtos.SubjectOverviewRequest(subjectId, mode, null, List.of(input));
        service.preflightSubject(userId, request);
        assertThat(requests).isEmpty();

        var result = service.generateSubject(userId, request);
        assertThat(result).isEqualTo(new OverviewDtos.OverviewResponse(2, "Mathematics",
                mode == OverviewMode.SUMMARY ? null : OUTLINE, mode == OverviewMode.OUTLINE ? null : SUMMARY));
        assertThat(requests).hasSize(mode == OverviewMode.OUTLINE ? 2 : 3);
        String cleaningInput = requests.getFirst().messages().getLast().content();
        assertThat(cleaningInput).contains("Calculus");
        if (mode != OverviewMode.SUMMARY) assertThat(cleaningInput).contains("## Limits", "- Explain convergence.");
        if (mode != OverviewMode.OUTLINE) assertThat(cleaningInput).contains(SUMMARY);
    }

    @Test
    void rejectsForeignDuplicateAndEmptySubjectSourcesBeforeProviderCalls() {
        UUID userId = UUID.randomUUID();
        UUID subjectId = UUID.randomUUID();
        UUID sourceId = UUID.randomUUID();
        UUID foreignSourceId = UUID.randomUUID();
        SourceService sources = mock(SourceService.class);
        when(sources.requireActiveSource(userId, sourceId))
                .thenReturn(source(sourceId, subjectId, SourceIngestionStatus.READY));
        when(sources.requireActiveSource(userId, foreignSourceId))
                .thenReturn(source(foreignSourceId, UUID.randomUUID(), SourceIngestionStatus.READY));
        AiProviderPort provider = mock(AiProviderPort.class);
        OverviewGenerationService service = service(sources, subjectService(userId, subjectId), List.of(), provider);
        var valid = new OverviewDtos.SubjectOverviewSourceInput(sourceId, "Calculus", null, SUMMARY);
        var empty = new OverviewDtos.SubjectOverviewSourceInput(sourceId, "Calculus", null, null);
        var foreign = new OverviewDtos.SubjectOverviewSourceInput(foreignSourceId, "Foreign", null, SUMMARY);
        for (var inputs : List.of(List.of(valid, valid), List.of(empty))) {
            assertThatThrownBy(() -> service.generateSubject(userId,
                    new OverviewDtos.SubjectOverviewRequest(subjectId, OverviewMode.SUMMARY, null, inputs)))
                    .isInstanceOfSatisfying(DomainException.class,
                            failure -> assertThat(failure.code()).isEqualTo("VALIDATION_FAILED"));
        }
        assertThatThrownBy(() -> service.generateSubject(userId,
                new OverviewDtos.SubjectOverviewRequest(subjectId, OverviewMode.SUMMARY, null, List.of(foreign))))
                .isInstanceOfSatisfying(DomainException.class,
                        failure -> assertThat(failure.code()).isEqualTo("MUTATION_REJECTED"));
        verifyNoInteractions(provider);
    }

    @Test
    void subjectCleaningReceivesAndHonorsRequestCancellation() throws Exception {
        UUID userId = UUID.randomUUID();
        UUID subjectId = UUID.randomUUID();
        UUID sourceId = UUID.randomUUID();
        SourceService sourceService = mock(SourceService.class);
        when(sourceService.requireActiveSource(userId, sourceId))
                .thenReturn(source(sourceId, subjectId, SourceIngestionStatus.READY));
        CountDownLatch providerEntered = new CountDownLatch(1);
        CountDownLatch providerExited = new CountDownLatch(1);
        AtomicReference<OverviewCancellation> providerCancellation = new AtomicReference<>();
        AtomicInteger providerCalls = new AtomicInteger();
        AiProviderPort provider = new AiProviderPort() {
            @Override public AiProviderType type() { return AiProviderType.OPENAI_COMPATIBLE; }
            @Override public AiProviderResponse complete(AiProviderRequest request, AiCredential credential) {
                throw new AssertionError("cancellable provider overload is required");
            }
            @Override public AiProviderResponse complete(AiProviderRequest request, AiCredential credential,
                    long timeoutMillis, OverviewCancellation cancellation) {
                providerCalls.incrementAndGet();
                providerCancellation.set(cancellation);
                providerEntered.countDown();
                try {
                    while (!cancellation.isCancelled()) Thread.sleep(5);
                    throw new DomainException("MODEL_TIMEOUT", "controlled cancellation");
                } catch (InterruptedException exception) {
                    Thread.currentThread().interrupt();
                    throw new IllegalStateException(exception);
                } finally {
                    providerExited.countDown();
                }
            }
        };
        OverviewGenerationService service = serviceWithTaskTimeout(sourceService, subjectService(userId, subjectId),
                List.of(), provider, 5_000);
        var input = new OverviewDtos.SubjectOverviewSourceInput(sourceId, "Calculus", null, SUMMARY);
        var request = new OverviewDtos.SubjectOverviewRequest(subjectId, OverviewMode.SUMMARY, null, List.of(input));
        OverviewCancellation externalCancellation = new OverviewCancellation();
        ExecutorService caller = Executors.newSingleThreadExecutor();
        try {
            Future<OverviewDtos.OverviewResponse> generation = caller.submit(() -> service.generateSubject(
                    userId, request, UUID.randomUUID().toString(), externalCancellation));
            assertThat(providerEntered.await(2, TimeUnit.SECONDS)).isTrue();
            externalCancellation.cancel(OverviewCancellation.Reason.REQUEST_DISCONNECTED);
            assertThatThrownBy(() -> generation.get(2, TimeUnit.SECONDS)).hasCauseInstanceOf(DomainException.class);
            assertThat(providerExited.await(2, TimeUnit.SECONDS)).isTrue();
            assertThat(providerCalls).hasValue(1);
            assertThat(providerCancellation.get().reason()).isEqualTo(OverviewCancellation.Reason.REQUEST_DISCONNECTED);
        } finally {
            externalCancellation.cancel(OverviewCancellation.Reason.REQUEST_DISCONNECTED);
            caller.shutdownNow();
            assertThat(caller.awaitTermination(5, TimeUnit.SECONDS)).isTrue();
        }
    }

    private static OverviewGenerationService service(SourceService sources, List<SourceChunkEntity> chunks,
                                                     AiProviderPort provider) {
        return service(sources, mock(SubjectService.class), chunks, provider);
    }

    private static OverviewGenerationService service(SourceService sources, SubjectService subjects,
                                                     List<SourceChunkEntity> chunks, AiProviderPort provider) {
        return serviceWithTaskTimeout(sources, subjects, chunks, provider, 0);
    }

    private static SubjectService subjectService(UUID userId, UUID subjectId) {
        SubjectService service = mock(SubjectService.class);
        when(service.requireActiveSubject(userId, subjectId)).thenReturn(new SubjectView(subjectId,
                "Mathematics", null, null, null, false, 1, Instant.now(), Instant.now(), null));
        return service;
    }

    private static AiProviderPort recordingProvider(List<AiProviderRequest> requests) {
        return new AiProviderPort() {
            @Override public AiProviderType type() { return AiProviderType.OPENAI_COMPATIBLE; }
            @Override public AiProviderResponse complete(AiProviderRequest request, AiCredential credential) {
                requests.add(request);
                return new AiProviderResponse(markdownResponse(request), 1, 1);
            }
        };
    }

    private static String markdownResponse(AiProviderRequest request) {
        if (request.structuredJson()) return CLEAN;
        return request.messages().getLast().content().startsWith("【原文开始】\n") ? SUMMARY : OUTLINE;
    }

    private static OverviewGenerationService serviceWithTaskTimeout(
            SourceService sourceService,
            SubjectService subjectService,
            List<SourceChunkEntity> chunks,
            AiProviderPort provider,
            long taskTimeoutMillis) {
        return serviceWithTaskTimeout(sourceService, subjectService, chunks, provider, taskTimeoutMillis, null);
    }

    private static OverviewGenerationService serviceWithTaskTimeout(
            SourceService sourceService,
            SubjectService subjectService,
            List<SourceChunkEntity> chunks,
            AiProviderPort provider,
            long taskTimeoutMillis,
            java.util.concurrent.ScheduledExecutorService watchdog) {
        return serviceWithTaskTimeout(sourceService, subjectService, chunks, provider, taskTimeoutMillis,
                watchdog, Runnable::run);
    }

    private static OverviewGenerationService serviceWithTaskTimeout(
            SourceService sourceService,
            SubjectService subjectService,
            List<SourceChunkEntity> chunks,
            AiProviderPort provider,
            long taskTimeoutMillis,
            java.util.concurrent.ScheduledExecutorService watchdog,
            java.util.concurrent.Executor generationExecutor) {
        SourceChunkRepository chunkRepository = mock(SourceChunkRepository.class);
        when(chunkRepository.findAllByUserIdAndSourceIdAndActiveTrueOrderByOrdinalAsc(any(), any())).thenReturn(chunks);
        AiSettingsService settingsService = mock(AiSettingsService.class);
        when(settingsService.resolve(any(), eq(AiProviderType.OPENAI_COMPATIBLE))).thenReturn(new AiSettingsService.ResolvedSettings(
                AiProviderType.OPENAI_COMPATIBLE, "test-model", new AiCredential("https://api.example.test", "key", "embed"), com.auralis.app.ai.usage.AiCredentialSource.USER_SUPPLIED));
        AiProviderRegistry providerRegistry = mock(AiProviderRegistry.class);
        when(providerRegistry.require(AiProviderType.OPENAI_COMPATIBLE)).thenReturn(provider);
        AuralisProperties properties = mock(AuralisProperties.class);
        AuralisProperties.Ai ai = mock(AuralisProperties.Ai.class);
        when(properties.ai()).thenReturn(ai);
        when(ai.overviewModelCapacities()).thenReturn(List.of(new AuralisProperties.OverviewModelCapacity(
                AiProviderType.OPENAI_COMPATIBLE.name(), "https://api.example.test", "test-model", 1_000_000, 128_000)));
        when(ai.overviewLimits()).thenReturn(AuralisProperties.OverviewLimits.withoutAdditionalCaps());
        when(ai.overviewResponseTimeoutMillis()).thenReturn(120_000L);
        when(ai.overviewTaskTimeoutMillis()).thenReturn(taskTimeoutMillis);
        return new OverviewGenerationService(sourceService, subjectService, chunkRepository, settingsService,
                invocationGateway(providerRegistry), properties, new OverviewDocumentValidator(new ObjectMapper(), properties),
                new ObjectMapper(), System::nanoTime, watchdog, generationExecutor);
    }

    private static AiProviderPort slowProvider(String document, long delayMillis) {
        return new AiProviderPort() {
            @Override public AiProviderType type() { return AiProviderType.OPENAI_COMPATIBLE; }
            @Override public AiProviderResponse complete(AiProviderRequest request, AiCredential credential) {
                return complete(request, credential, 120_000L);
            }
            @Override public AiProviderResponse complete(
                    AiProviderRequest request, AiCredential credential, long responseTimeoutMillis) {
                try {
                    Thread.sleep(delayMillis);
                } catch (InterruptedException exception) {
                    Thread.currentThread().interrupt();
                    throw new IllegalStateException("test provider interrupted", exception);
                }
                return new AiProviderResponse(document, 1, 1);
            }
        };
    }

    private static AiInvocationGateway invocationGateway(AiProviderRegistry registry) {
        return context -> new AiTaskScope() {
            private final UUID taskId = UUID.randomUUID();
            @Override public UUID taskId() { return taskId; }
            @Override public <T> AiInvocationResult<T> metadata(
                    AiStage stage, AiProviderType provider, String model, AiCredentialSource source,
                    java.util.function.Supplier<T> operation) {
                AiCredentialSource.requireKnown(source);
                return new AiInvocationResult<>(operation.get(), usage());
            }
            @Override public AiInvocationResult<AiProviderResponse> complete(
                    AiStage stage, AiProviderType providerType, AiProviderRequest request,
                    AiCredential credential, AiCredentialSource source, long timeout,
                    com.auralis.app.ai.usage.AiOutputRole role, OverviewCancellation cancellation) {
                AiCredentialSource.requireKnown(source);
                assertThat(stage).isIn(AiStage.OVERVIEW_MAP, AiStage.OVERVIEW_REDUCE);
                assertThat(role).isIn(com.auralis.app.ai.usage.AiOutputRole.INTERMEDIATE,
                        com.auralis.app.ai.usage.AiOutputRole.INTERMEDIATE);
                return new AiInvocationResult<>(registry.require(providerType)
                        .complete(request, credential, timeout, cancellation), usage());
            }
            @Override public AiInvocationResult<AiProviderResponse> complete(
                    AiStage stage, AiProviderType providerType, AiProviderRequest request,
                    AiCredential credential, AiCredentialSource source, long timeout,
                    com.auralis.app.ai.usage.AiOutputRole role, OverviewCancellation cancellation,
                    com.auralis.app.ai.usage.AiInvocationBinding binding) {
                binding.beforeReservation();
                UUID reservationId = UUID.randomUUID();
                binding.onReserved(reservationId);
                binding.beforeDispatch(reservationId);
                return complete(stage, providerType, request, credential, source,
                        binding.responseTimeoutMillis(timeout), role, cancellation);
            }
            @Override public AiInvocationResult<Void> stream(
                    AiStage stage, AiProviderType provider, AiProviderRequest request,
                    AiCredential credential, AiCredentialSource source,
                    java.util.function.Consumer<com.auralis.app.ai.AiProviderChunk> sink) {
                throw new AssertionError("Overview should use non-streaming provider calls");
            }
            @Override public AiInvocationResult<com.auralis.app.ai.EmbeddingResult> embed(
                    AiStage stage, AiProviderType provider, String model, List<String> texts,
                    AiCredential credential, AiCredentialSource source) {
                AiCredentialSource.requireKnown(source);
                throw new UnsupportedOperationException();
            }
            @Override public AiProviderUsage usage() {
                return new AiProviderUsage(0, 0, null, null, 0, false);
            }
            @Override public AiProviderUsage usage(AiCredentialSource source) {
                return new AiProviderUsage(0, 0, null, null, 0, false);
            }
            @Override public void close() { }
        };
    }

    private static OverviewDtos.SourceOverviewRequest sourceRequest(UUID sourceId, OverviewMode mode, String instruction) {
        return new OverviewDtos.SourceOverviewRequest(sourceId, mode, instruction);
    }

    private static SourceChunkEntity detailedChunk(UUID userId, UUID sourceId, UUID revision, String content) {
        var provenance = new com.auralis.app.ai.SourceChunkProvenance(
                com.auralis.app.ai.SourceChunkProvenance.SCHEMA_VERSION, revision, UUID.randomUUID(), "test-parser",
                List.of(new com.auralis.app.ai.SourceChunkProvenance.Location(0, "paragraph", 1L,
                        null, null, 0, content.length(), 0, content.length())));
        return new SourceChunkEntity(UUID.randomUUID(), userId, sourceId, 0, content, "a".repeat(64), 0,
                content.length(), "[]", UUID.randomUUID(), true,
                com.auralis.app.ai.SourceChunkProvenance.encode(List.of(provenance)).getFirst());
    }

    private static SourceChunkEntity chunk(UUID userId, UUID sourceId, boolean active, String content) {
        return new SourceChunkEntity(UUID.randomUUID(), userId, sourceId, 0, content, "a".repeat(64), 0,
                content.length(), "[]", UUID.randomUUID(), active);
    }

    private static SourceView source(UUID sourceId, UUID subjectId, SourceIngestionStatus status) {
        return source(sourceId, subjectId, status, UUID.randomUUID());
    }

    private static SourceView source(UUID sourceId, UUID subjectId, SourceIngestionStatus status, UUID revision) {
        return new SourceView(sourceId, subjectId, SourceType.FILE, "Calculus", null, null, null, null,
                status, revision, null, null, 1, Instant.now(), Instant.now(), null, null);
    }

    private static void awaitFollowerJoinOrCompletion(Future<?> follower, AtomicReference<Thread> followerThread)
            throws InterruptedException {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
        while (System.nanoTime() < deadline) {
            if (follower.isDone()) return;
            Thread thread = followerThread.get();
            if (thread != null && (thread.getState() == Thread.State.WAITING
                    || thread.getState() == Thread.State.TIMED_WAITING)) {
                return;
            }
            Thread.sleep(5);
        }
        throw new AssertionError("follower neither joined the in-flight generation nor completed");
    }

    private static void assertFutureFailureIs(Future<?> future, DomainException expected) throws Exception {
        try {
            future.get(5, TimeUnit.SECONDS);
        } catch (ExecutionException exception) {
            assertThat(exception.getCause()).isSameAs(expected);
            return;
        }
        throw new AssertionError("expected the future to fail");
    }

    private static void await(CountDownLatch latch) {
        try {
            if (!latch.await(10, TimeUnit.SECONDS)) {
                throw new IllegalStateException("timed out waiting for test latch");
            }
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("interrupted while waiting for test latch", exception);
        }
    }

}
