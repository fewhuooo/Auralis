package com.auralis.app;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
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
import com.auralis.app.shared.config.AuralisProperties;
import com.auralis.app.shared.error.DomainException;
import com.auralis.app.source.SourceIngestionStatus;
import com.auralis.app.source.SourceService;
import com.auralis.app.source.SourceType;
import com.auralis.app.source.SourceView;
import com.auralis.app.subject.SubjectService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.slf4j.LoggerFactory;
import tools.jackson.databind.ObjectMapper;

import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.ArrayList;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class AiOverviewServiceTests {

    @Test
    void rejectsForeignDeletedAndNotReadySourcesBeforeProviderCalls() {
        UUID userId = UUID.randomUUID();
        UUID sourceId = UUID.randomUUID();
        SourceService sourceService = mock(SourceService.class);
        OverviewGenerationService service = service(sourceService, mock(SubjectService.class), List.of(), 12_000,
                validDocument("source-1"));
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
        OverviewGenerationService service = service(sourceService, mock(SubjectService.class), List.of(), 12_000,
                validDocument("source-1"));
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
        OverviewGenerationService service = service(sourceService, mock(SubjectService.class), List.of(), 12_000,
                validDocument("source-1"));
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
    void fencesDeletedSourceAfterProviderResponseBeforeAnyLaterWork() {
        UUID userId = UUID.randomUUID();
        UUID sourceId = UUID.randomUUID();
        SourceService sourceService = mock(SourceService.class);
        SourceView active = source(sourceId, UUID.randomUUID(), SourceIngestionStatus.READY);
        List<AiProviderRequest> requests = new ArrayList<>();
        when(sourceService.requireActiveSource(userId, sourceId))
                .thenReturn(active, active)
                .thenThrow(new DomainException("RESOURCE_NOT_FOUND", "Source was not found"));
        OverviewGenerationService service = service(sourceService, mock(SubjectService.class),
                List.of(chunk(userId, sourceId, true, "a".repeat(400)),
                        chunk(userId, sourceId, true, "b".repeat(400))), 2_000,
                validDocument("source-1"), requests);

        assertThatThrownBy(() -> service.generateSource(userId, sourceRequest(sourceId, OverviewMode.ALL, null)))
                .isInstanceOf(DomainException.class)
                .extracting(exception -> ((DomainException) exception).code())
                .isEqualTo("RESOURCE_NOT_FOUND");
        assertThat(requests).hasSize(1);
    }

    @Test
    void fencesRevisionChangeAfterProviderResponseBeforeAnyLaterWork() {
        UUID userId = UUID.randomUUID();
        UUID sourceId = UUID.randomUUID();
        SourceService sourceService = mock(SourceService.class);
        UUID subjectId = UUID.randomUUID();
        SourceView active = source(sourceId, subjectId, SourceIngestionStatus.READY);
        SourceView changed = source(sourceId, subjectId, SourceIngestionStatus.READY);
        List<AiProviderRequest> requests = new ArrayList<>();
        when(sourceService.requireActiveSource(userId, sourceId))
                .thenReturn(active, active, changed);
        OverviewGenerationService service = service(sourceService, mock(SubjectService.class),
                List.of(chunk(userId, sourceId, true, "a".repeat(400)),
                        chunk(userId, sourceId, true, "b".repeat(400))), 2_000,
                validDocument("source-1"), requests);

        assertThatThrownBy(() -> service.generateSource(userId, sourceRequest(sourceId, OverviewMode.ALL, null)))
                .isInstanceOf(DomainException.class)
                .extracting(exception -> ((DomainException) exception).code())
                .isEqualTo("MUTATION_REJECTED");
        assertThat(requests).hasSize(1);
    }

    @Test
    void fencesStatusChangeAfterProviderResponseBeforeParsingOrLaterWork() {
        UUID userId = UUID.randomUUID();
        UUID sourceId = UUID.randomUUID();
        SourceService sourceService = mock(SourceService.class);
        SourceView active = source(sourceId, UUID.randomUUID(), SourceIngestionStatus.READY);
        SourceView changed = source(sourceId, active.subjectId(), SourceIngestionStatus.INDEXING,
                active.ingestionRevision());
        List<AiProviderRequest> requests = new ArrayList<>();
        when(sourceService.requireActiveSource(userId, sourceId))
                .thenReturn(active, active, changed);
        OverviewGenerationService service = service(sourceService, mock(SubjectService.class),
                List.of(chunk(userId, sourceId, true, "a".repeat(400)),
                        chunk(userId, sourceId, true, "b".repeat(400))), 2_000,
                "not-json", requests);

        assertThatThrownBy(() -> service.generateSource(userId, sourceRequest(sourceId, OverviewMode.ALL, null)))
                .isInstanceOf(DomainException.class)
                .extracting(exception -> ((DomainException) exception).code())
                .isEqualTo("MUTATION_REJECTED");
        assertThat(requests).hasSize(1);
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
                    List.of(chunk(userId, sourceId, true, "Calculus content")), 12_000,
                    validDocument("source-1"), requests);

            assertThatThrownBy(() -> service.generateSource(userId, sourceRequest(sourceId, OverviewMode.ALL, null)))
                    .isInstanceOf(DomainException.class)
                    .extracting(exception -> ((DomainException) exception).code())
                    .isEqualTo(code);
            assertThat(requests).isEmpty();
        }
    }

    @Test
    void generatesSubjectOverviewWithoutSourceGenerationFenceCalls() {
        UUID userId = UUID.randomUUID();
        UUID subjectId = UUID.randomUUID();
        UUID sourceId = UUID.randomUUID();
        SourceService sourceService = mock(SourceService.class);
        SourceView source = source(sourceId, subjectId, SourceIngestionStatus.READY);
        when(sourceService.requireActiveSource(userId, sourceId)).thenReturn(source);
        OverviewGenerationService service = service(sourceService, mock(SubjectService.class), List.of(), 12_000,
                validDocument("source-1"));
        OverviewDtos.OverviewSummary summary = new OverviewDtos.OverviewSummary("summary", List.of(), List.of());
        OverviewDtos.OverviewSection section = new OverviewDtos.OverviewSection("Section", "summary",
                List.of(sourceId.toString()), null);
        OverviewDtos.SubjectOverviewSourceInput input = new OverviewDtos.SubjectOverviewSourceInput(sourceId,
                "Calculus", List.of(new OverviewDtos.OverviewChapter("Chapter", List.of(section))), summary);

        OverviewDtos.OverviewResponse result = service.generateSubject(userId,
                new OverviewDtos.SubjectOverviewRequest(subjectId, OverviewMode.ALL, null, List.of(input)));

        assertThat(result.summary()).isNotNull();
        verify(sourceService, org.mockito.Mockito.times(1)).requireActiveSource(userId, sourceId);
    }

    @Test
    void rejectsSourcesWithoutActiveChunks() {
        UUID userId = UUID.randomUUID();
        UUID sourceId = UUID.randomUUID();
        SourceService sourceService = mock(SourceService.class);
        OverviewGenerationService service = service(sourceService, mock(SubjectService.class), List.of(), 12_000,
                validDocument("source-1"));
        when(sourceService.requireActiveSource(userId, sourceId))
                .thenReturn(source(sourceId, UUID.randomUUID(), SourceIngestionStatus.READY));

        assertThatThrownBy(() -> service.generateSource(userId, sourceRequest(sourceId, OverviewMode.ALL, null)))
                .isInstanceOf(DomainException.class)
                .hasMessageContaining("active chunks");
    }

    @Test
    void generatesEachModeAndSendsCustomInstructionWithoutPersistingAnything() {
        UUID userId = UUID.randomUUID();
        UUID sourceId = UUID.randomUUID();
        SourceService sourceService = mock(SourceService.class);
        List<SourceChunkEntity> chunks = List.of(chunk(userId, sourceId, true, "Calculus content"));
        OverviewGenerationService service = service(sourceService, mock(SubjectService.class), chunks, 12_000,
                validDocument("source-1"));
        when(sourceService.requireActiveSource(userId, sourceId))
                .thenReturn(source(sourceId, UUID.randomUUID(), SourceIngestionStatus.READY));

        OverviewDtos.OverviewResponse all = service.generateSource(
                userId, sourceRequest(sourceId, OverviewMode.ALL, "Emphasize worked examples"));
        OverviewDtos.OverviewResponse outline = service.generateSource(
                userId, sourceRequest(sourceId, OverviewMode.OUTLINE, null));
        OverviewDtos.OverviewResponse summary = service.generateSource(
                userId, sourceRequest(sourceId, OverviewMode.SUMMARY, null));

        assertThat(all.outline()).isNotNull();
        assertThat(all.summary()).isNotNull();
        assertThat(outline.outline()).isNotNull();
        assertThat(outline.summary()).isNull();
        assertThat(summary.outline()).isNull();
        assertThat(summary.summary()).isNotNull();
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("missingModeFields")
    void rejectsMissingModeFieldsAtSchemaValidationBeforeCacheReturn(OverviewMode mode, String document) {
        UUID userId = UUID.randomUUID();
        UUID sourceId = UUID.randomUUID();
        SourceService sourceService = mock(SourceService.class);
        when(sourceService.requireActiveSource(userId, sourceId))
                .thenReturn(source(sourceId, UUID.randomUUID(), SourceIngestionStatus.READY));
        OverviewGenerationService service = service(sourceService, mock(SubjectService.class),
                List.of(chunk(userId, sourceId, true, "Calculus content")), 12_000, document);
        Logger logger = (Logger) LoggerFactory.getLogger(OverviewGenerationService.class);
        ListAppender<ILoggingEvent> appender = new ListAppender<>();
        appender.start();
        logger.addAppender(appender);
        try {
            assertThatThrownBy(() -> service.generateSource(userId, sourceRequest(sourceId, mode, null)))
                    .isInstanceOf(DomainException.class)
                    .extracting(e -> ((DomainException) e).code())
                    .isEqualTo("MODEL_PROVIDER_ERROR");
        } finally {
            logger.detachAppender(appender);
            appender.stop();
        }
        List<String> messages = appender.list.stream()
                .map(ILoggingEvent::getFormattedMessage)
                .toList();
        List<String> failureLogs = messages.stream()
                .filter(message -> message.contains("OVERVIEW_GENERATION_FAILED"))
                .toList();
        assertThat(failureLogs).hasSize(2);
        assertThat(failureLogs.get(0)).contains("phase=SCHEMA_VALIDATE", "errorCode=MODEL_PROVIDER_ERROR");
        assertThat(failureLogs.get(1)).contains("phase=FINAL", "errorCode=MODEL_PROVIDER_ERROR");
        assertThat(messages).noneMatch(message -> message.contains("CACHE_RETURN"));
    }

    private static Stream<Arguments> missingModeFields() {
        return Stream.of(
                Arguments.of(OverviewMode.ALL, summaryOnlyDocument("source-1")),
                Arguments.of(OverviewMode.OUTLINE, summaryOnlyDocument("source-1")),
                Arguments.of(OverviewMode.SUMMARY, outlineOnlyDocument("source-1")));
    }

    @Test
    void addsIntermediateCompactDirectiveOnlyToIntermediateSystemPrompt() {
        UUID userId = UUID.randomUUID();
        UUID sourceId = UUID.randomUUID();
        SourceService sourceService = mock(SourceService.class);
        when(sourceService.requireActiveSource(userId, sourceId))
                .thenReturn(source(sourceId, UUID.randomUUID(), SourceIngestionStatus.READY));
        List<AiProviderRequest> requests = new ArrayList<>();
        OverviewGenerationService service = service(sourceService, mock(SubjectService.class), List.of(
                        chunk(userId, sourceId, true, "a".repeat(250)),
                        chunk(userId, sourceId, true, "b".repeat(250)),
                        chunk(userId, sourceId, true, "c".repeat(250)),
                        chunk(userId, sourceId, true, "d".repeat(250)),
                        chunk(userId, sourceId, true, "e".repeat(250)),
                        chunk(userId, sourceId, true, "f".repeat(250)),
                        chunk(userId, sourceId, true, "g".repeat(250)),
                        chunk(userId, sourceId, true, "h".repeat(250))), 3_000,
                validDocument("source-1"), requests);

        service.generateSource(userId, sourceRequest(sourceId, OverviewMode.ALL, null));

        List<String> systemInstructions = requests.stream()
                .map(request -> {
                    assertThat(request.maxTokens()).isIn(4_608, 6_144);
                    return request.messages().getFirst().content();
                })
                .toList();
        List<AiProviderRequest> reduceRequests = requests.stream()
                .filter(request -> request.messages().get(1).content().contains("\"mapJson\""))
                .toList();
        List<AiProviderRequest> mapRequests = requests.stream()
                .filter(request -> request.messages().get(1).content().contains("\"chunks\""))
                .toList();
        assertThat(reduceRequests).isNotEmpty().allSatisfy(request -> assertThat(request.messages().getFirst().content())
                .contains("already-compressed overview JSON")
                .contains("synthesize into one cohesive overview")
                .contains("do not summarize each input separately")
                .contains("duplicate, overlapping, adjacent, or equivalent topics")
                .contains("do not create one chapter or section per input document")
                .contains("each fact once in the most appropriate field")
                .contains("definitions, conceptual relationships, causal chains, key conclusions")
                .contains("only evidence required to understand concepts/conclusions")
                .contains("examples, rhetoric, procedural narration")
                .contains("fewer, denser chapters and sections")
                .contains("short titles")
                .contains("concise sentences")
                .contains("2500 and 3000 characters")
                .contains("do not pad"));

        List<String> intermediateInstructions = mapRequests.stream()
                .map(request -> request.messages().getFirst().content())
                .filter(instruction -> instruction.contains("Intermediate JSON"))
                .toList();
        assertThat(mapRequests).isNotEmpty();
        assertThat(intermediateInstructions).isNotEmpty().allSatisfy(instruction -> assertThat(instruction)
                .contains("preserve every distinct topic/section and retain independent content while shortening wording")
                .contains("Merge only duplicate/equivalent nodes")
                .contains("Shorten title, section.summary, summary.overview, keyPoints, learningPath")
                .contains("remove redundant examples, rhetoric, and repetition")
                .contains("Target compact serialized JSON <=3600 chars")
                .doesNotContain("at most 6 chapters", "at most 12 sections"));
    }

    @Test
    void keepsSingleBatchMapAndSubjectDirectOnBasePrompt() {
        UUID userId = UUID.randomUUID();
        UUID sourceId = UUID.randomUUID();
        UUID subjectId = UUID.randomUUID();
        SourceService sourceService = mock(SourceService.class);
        SubjectService subjectService = mock(SubjectService.class);
        when(sourceService.requireActiveSource(userId, sourceId))
                .thenReturn(source(sourceId, subjectId, SourceIngestionStatus.READY));
        List<AiProviderRequest> mapRequests = new ArrayList<>();
        OverviewGenerationService service = service(sourceService, subjectService,
                List.of(chunk(userId, sourceId, true, "Calculus content")), 12_000,
                validDocument("source-1"), mapRequests);

        service.generateSource(userId, sourceRequest(sourceId, OverviewMode.ALL, null));

        assertThat(mapRequests).singleElement().satisfies(request -> {
            assertThat(request.messages().get(1).content()).contains("\"chunks\"");
            assertThat(request.messages().getFirst().content())
                    .contains("Compact JSON")
                    .doesNotContain("already-compressed overview JSON")
                    .doesNotContain("do not summarize each input separately");
        });

        mapRequests.clear();
        OverviewDtos.OverviewSummary summary = new OverviewDtos.OverviewSummary("summary", List.of(), List.of());
        OverviewDtos.OverviewSection section = new OverviewDtos.OverviewSection("Section", "summary",
                List.of(sourceId.toString()), null);
        OverviewDtos.SubjectOverviewSourceInput input = new OverviewDtos.SubjectOverviewSourceInput(sourceId,
                "Calculus", List.of(new OverviewDtos.OverviewChapter("Chapter", List.of(section))), summary);
        service.generateSubject(userId, new OverviewDtos.SubjectOverviewRequest(subjectId, OverviewMode.ALL, null,
                List.of(input)));

        assertThat(mapRequests).singleElement().satisfies(request -> {
            assertThat(request.messages().get(1).content()).contains("\"sources\"");
            assertThat(request.messages().getFirst().content())
                    .contains("Compact JSON")
                    .doesNotContain("already-compressed overview JSON")
                    .doesNotContain("do not summarize each input separately");
        });
    }

    @Test
    void rejectsMalformedUnknownAliasAndExcessiveProviderDocuments() {
        UUID userId = UUID.randomUUID();
        UUID sourceId = UUID.randomUUID();
        SourceService sourceService = mock(SourceService.class);
        when(sourceService.requireActiveSource(userId, sourceId))
                .thenReturn(source(sourceId, UUID.randomUUID(), SourceIngestionStatus.READY));
        List<SourceChunkEntity> chunks = List.of(chunk(userId, sourceId, true, "Calculus content"));

        for (String unsafeDocument : List.of(
                "Here is your JSON: {}",
                validDocument("unknown-alias"),
                excessiveChaptersDocument())) {
            OverviewGenerationService service = service(sourceService, mock(SubjectService.class), chunks, 12_000,
                    unsafeDocument);
            assertThatThrownBy(() -> service.generateSource(userId, sourceRequest(sourceId, OverviewMode.ALL, null)))
                    .isInstanceOf(DomainException.class)
                    .hasMessageContaining("overview");
        }
    }

    @Test
    void rejectsSubjectSourcesOutsideTheOwnedSubjectAndPromptOverflow() {
        UUID userId = UUID.randomUUID();
        UUID subjectId = UUID.randomUUID();
        UUID sourceId = UUID.randomUUID();
        SourceService sourceService = mock(SourceService.class);
        SubjectService subjectService = mock(SubjectService.class);
        when(sourceService.requireActiveSource(userId, sourceId))
                .thenReturn(source(sourceId, UUID.randomUUID(), SourceIngestionStatus.READY));
        OverviewGenerationService service = service(sourceService, subjectService, List.of(), 100, validDocument("source-1"));
        when(sourceService.requireActiveSource(userId, sourceId))
                .thenReturn(source(sourceId, UUID.randomUUID(), SourceIngestionStatus.READY));

        OverviewDtos.SubjectOverviewRequest request = new OverviewDtos.SubjectOverviewRequest(subjectId, OverviewMode.ALL,
                null, List.of(new OverviewDtos.SubjectOverviewSourceInput(sourceId, "Calculus",
                        List.of(), new OverviewDtos.OverviewSummary("x".repeat(200), List.of(), List.of()))));

        assertThatThrownBy(() -> service.generateSubject(userId, request))
                .isInstanceOf(DomainException.class)
                .hasMessageContaining("usable all");

        when(sourceService.requireActiveSource(userId, sourceId))
                .thenReturn(source(sourceId, subjectId, SourceIngestionStatus.READY));
        assertThatThrownBy(() -> service.generateSubject(userId, request))
                .isInstanceOf(DomainException.class)
                .hasMessageContaining("usable all");
        verify(subjectService, org.mockito.Mockito.times(2)).requireActiveSubject(userId, subjectId);
    }

    @Test
    void surfacesSafeProviderFailures() {
        UUID userId = UUID.randomUUID();
        UUID sourceId = UUID.randomUUID();
        SourceService sourceService = mock(SourceService.class);
        when(sourceService.requireActiveSource(userId, sourceId))
                .thenReturn(source(sourceId, UUID.randomUUID(), SourceIngestionStatus.READY));
        OverviewGenerationService service = service(sourceService, mock(SubjectService.class),
                List.of(chunk(userId, sourceId, true, "Calculus content")), 12_000, null);

        assertThatThrownBy(() -> service.generateSource(userId, sourceRequest(sourceId, OverviewMode.ALL, null)))
                .isInstanceOf(DomainException.class)
                .hasMessageContaining("provider");
    }

    @Test
    void usesConfiguredOverviewResponseTimeoutForEveryNonStreamingProviderCall() {
        UUID userId = UUID.randomUUID();
        UUID sourceId = UUID.randomUUID();
        SourceService sourceService = mock(SourceService.class);
        when(sourceService.requireActiveSource(userId, sourceId))
                .thenReturn(source(sourceId, UUID.randomUUID(), SourceIngestionStatus.READY));
        List<Long> responseTimeouts = new ArrayList<>();
        OverviewGenerationService service = service(sourceService, mock(SubjectService.class), List.of(
                        chunk(userId, sourceId, true, "a".repeat(250)),
                        chunk(userId, sourceId, true, "b".repeat(250)),
                        chunk(userId, sourceId, true, "c".repeat(250)),
                        chunk(userId, sourceId, true, "d".repeat(250)),
                        chunk(userId, sourceId, true, "e".repeat(250)),
                        chunk(userId, sourceId, true, "f".repeat(250)),
                        chunk(userId, sourceId, true, "g".repeat(250)),
                        chunk(userId, sourceId, true, "h".repeat(250))), 3_000,
                validDocument("source-1"), new ArrayList<>(), null, responseTimeouts);

        service.generateSource(userId, sourceRequest(sourceId, OverviewMode.ALL, null));

        assertThat(responseTimeouts).hasSizeGreaterThan(1).allMatch(timeout -> timeout == 120_000L);
    }

    @Test
    void appliesIntermediateAndFinalOverviewTokenBudgets() {
        UUID userId = UUID.randomUUID();
        UUID sourceId = UUID.randomUUID();
        SourceService sourceService = mock(SourceService.class);
        when(sourceService.requireActiveSource(userId, sourceId))
                .thenReturn(source(sourceId, UUID.randomUUID(), SourceIngestionStatus.READY));
        List<AiProviderRequest> requests = new ArrayList<>();
        OverviewGenerationService service = service(sourceService, mock(SubjectService.class), List.of(
                        chunk(userId, sourceId, true, "a".repeat(250)),
                        chunk(userId, sourceId, true, "b".repeat(250)),
                        chunk(userId, sourceId, true, "c".repeat(250)),
                        chunk(userId, sourceId, true, "d".repeat(250)),
                        chunk(userId, sourceId, true, "e".repeat(250)),
                        chunk(userId, sourceId, true, "f".repeat(250)),
                        chunk(userId, sourceId, true, "g".repeat(250)),
                        chunk(userId, sourceId, true, "h".repeat(250))), 3_000,
                validDocument("source-1"), requests);

        Logger logger = (Logger) LoggerFactory.getLogger(OverviewGenerationService.class);
        ListAppender<ILoggingEvent> appender = new ListAppender<>();
        appender.start();
        logger.addAppender(appender);
        try {
            service.generateSource(userId, sourceRequest(sourceId, OverviewMode.ALL, null));
        } finally {
            logger.detachAppender(appender);
            appender.stop();
        }

        assertThat(requests).extracting(AiProviderRequest::maxTokens)
                .contains(4_608, 6_144)
                .doesNotContainNull();
        assertThat(requests).allMatch(AiProviderRequest::structuredJson);
        List<String> logs = appender.list.stream().map(ILoggingEvent::getFormattedMessage).toList();
        List<Integer> finalJsonCheckIndexes = java.util.stream.IntStream.range(0, logs.size())
                .filter(index -> logs.get(index).contains("phase=FINAL_JSON_CHECK"))
                .boxed().toList();
        assertThat(finalJsonCheckIndexes).hasSize(1);
        int finalJsonCheckIndex = finalJsonCheckIndexes.get(0);
        assertThat(logs.subList(0, finalJsonCheckIndex))
                .anyMatch(log -> log.contains("phase=INTERMEDIATE_BUDGET_CHECK"))
                .noneMatch(log -> log.contains("phase=FINAL_JSON_CHECK"));
    }

    @Test
    void singleBatchSourceAndSubjectUseFinalOutputBudget() {
        UUID userId = UUID.randomUUID();
        UUID sourceId = UUID.randomUUID();
        UUID subjectId = UUID.randomUUID();
        SourceService sourceService = mock(SourceService.class);
        SubjectService subjectService = mock(SubjectService.class);
        when(sourceService.requireActiveSource(userId, sourceId))
                .thenReturn(source(sourceId, subjectId, SourceIngestionStatus.READY));
        List<AiProviderRequest> requests = new ArrayList<>();
        OverviewGenerationService service = service(sourceService, subjectService,
                List.of(chunk(userId, sourceId, true, "Calculus content")), 12_000,
                validDocument("source-1"), requests);

        service.generateSource(userId, sourceRequest(sourceId, OverviewMode.ALL, null));
        OverviewDtos.OverviewSummary summary = new OverviewDtos.OverviewSummary("summary", List.of(), List.of());
        OverviewDtos.OverviewSection section = new OverviewDtos.OverviewSection("Section", "summary",
                List.of(sourceId.toString()), null);
        OverviewDtos.SubjectOverviewSourceInput input = new OverviewDtos.SubjectOverviewSourceInput(sourceId,
                "Calculus", List.of(new OverviewDtos.OverviewChapter("Chapter", List.of(section))), summary);
        service.generateSubject(userId, new OverviewDtos.SubjectOverviewRequest(subjectId, OverviewMode.ALL,
                null, List.of(input)));

        assertThat(requests).allMatch(request -> request.maxTokens() == 6_144);
        assertThat(requests).allMatch(AiProviderRequest::structuredJson);
    }

    @Test
    void subjectOutlineCanReferenceLaterRequestedSource() {
        UUID userId = UUID.randomUUID();
        UUID subjectId = UUID.randomUUID();
        UUID firstId = UUID.randomUUID();
        UUID secondId = UUID.randomUUID();
        SourceService sourceService = mock(SourceService.class);
        when(sourceService.requireActiveSource(userId, firstId))
                .thenReturn(source(firstId, subjectId, SourceIngestionStatus.READY));
        when(sourceService.requireActiveSource(userId, secondId))
                .thenReturn(source(secondId, subjectId, SourceIngestionStatus.READY));
        List<AiProviderRequest> requests = new ArrayList<>();
        OverviewGenerationService service = service(sourceService, mock(SubjectService.class), List.of(),
                12_000, validDocument("source-1"), requests);
        OverviewDtos.OverviewSummary summary = new OverviewDtos.OverviewSummary("summary", List.of(), List.of());
        OverviewDtos.OverviewSection firstSection = new OverviewDtos.OverviewSection("Section", "summary",
                List.of(secondId.toString()), null);
        OverviewDtos.SubjectOverviewSourceInput first = new OverviewDtos.SubjectOverviewSourceInput(firstId,
                "First", List.of(new OverviewDtos.OverviewChapter("Chapter", List.of(firstSection))), summary);
        OverviewDtos.SubjectOverviewSourceInput second = new OverviewDtos.SubjectOverviewSourceInput(secondId,
                "Second", List.of(new OverviewDtos.OverviewChapter("Chapter", List.of(
                        new OverviewDtos.OverviewSection("Section", "summary", List.of(secondId.toString()), null)))),
                summary);

        service.generateSubject(userId, new OverviewDtos.SubjectOverviewRequest(subjectId, OverviewMode.ALL,
                null, List.of(first, second)));

        assertThat(requests).singleElement().satisfies(request -> assertThat(request.messages().get(1).content())
                .contains("\"sourceIds\":[\"source-2\"]")
                .doesNotContain(secondId.toString()));
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
            @Override public AiProviderType type() { return AiProviderType.DEEPSEEK; }
            @Override public AiProviderResponse complete(AiProviderRequest request, AiCredential credential) {
                if (providerCalls.incrementAndGet() == 1) {
                    providerEntered.countDown();
                    await(releaseProvider);
                }
                return new AiProviderResponse(validDocument("source-1"), 1, 1);
            }
        };
        OverviewGenerationService service = service(sourceService,
                List.of(chunk(userId, sourceId, true, "Calculus content")), 12_000, provider);
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
            assertThat(providerCalls).hasValue(1);
        } finally {
            releaseProvider.countDown();
            executor.shutdownNow();
            assertThat(executor.awaitTermination(5, TimeUnit.SECONDS)).isTrue();
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
        when(sourceService.requireActiveSource(userId, sourceId)).thenReturn(original, renamed);
        CountDownLatch providerEntered = new CountDownLatch(1);
        CountDownLatch releaseProvider = new CountDownLatch(1);
        AtomicInteger providerCalls = new AtomicInteger();
        AiProviderPort provider = new AiProviderPort() {
            @Override public AiProviderType type() { return AiProviderType.DEEPSEEK; }
            @Override public AiProviderResponse complete(AiProviderRequest request, AiCredential credential) {
                if (providerCalls.incrementAndGet() == 1) {
                    providerEntered.countDown();
                    await(releaseProvider);
                }
                return new AiProviderResponse(validDocument("source-1"), 1, 1);
            }
        };
        OverviewGenerationService service = service(sourceService,
                List.of(chunk(userId, sourceId, true, "Calculus content")), 12_000, provider);
        ExecutorService executor = Executors.newFixedThreadPool(2);
        try {
            Future<OverviewDtos.OverviewResponse> originalRequest = executor.submit(() -> service.generateSource(
                    userId, sourceRequest(sourceId, OverviewMode.ALL, null)));
            assertThat(providerEntered.await(5, TimeUnit.SECONDS)).isTrue();
            Future<OverviewDtos.OverviewResponse> renamedRequest = executor.submit(() -> service.generateSource(
                    userId, sourceRequest(sourceId, OverviewMode.ALL, null)));
            assertThat(renamedRequest.get(5, TimeUnit.SECONDS)).isNotNull();
            assertThat(providerCalls).hasValue(2);
            releaseProvider.countDown();
            assertThat(originalRequest.get(5, TimeUnit.SECONDS)).isNotNull();
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
            @Override public AiProviderType type() { return AiProviderType.DEEPSEEK; }
            @Override public AiProviderResponse complete(AiProviderRequest request, AiCredential credential) {
                providerCalls.incrementAndGet();
                providerEntered.countDown();
                await(releaseProvider);
                throw providerFailure;
            }
        };
        OverviewGenerationService service = service(sourceService,
                List.of(chunk(userId, sourceId, true, "Calculus content")), 12_000, provider);
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

    @Test
    void acceptsIntermediateOutputAbovePreviousTokenGuardWhenDocumentLimitsHold() {
        UUID userId = UUID.randomUUID();
        UUID sourceId = UUID.randomUUID();
        SourceService sourceService = mock(SourceService.class);
        when(sourceService.requireActiveSource(userId, sourceId))
                .thenReturn(source(sourceId, UUID.randomUUID(), SourceIngestionStatus.READY));
        List<AiProviderRequest> requests = new ArrayList<>();
        OverviewGenerationService service = serviceWithResponses(sourceService, List.of(
                new AiProviderResponse(validDocument("source-1"), 1, 1_025),
                new AiProviderResponse(validDocument("source-1"), 1, 1_025),
                new AiProviderResponse(validDocument("source-1"), 1, 4_096)),
                List.of(chunk(userId, sourceId, true, "a".repeat(1_200)),
                        chunk(userId, sourceId, true, "b".repeat(1_200))), 2_800, requests);
        Logger logger = (Logger) LoggerFactory.getLogger(OverviewGenerationService.class);
        ListAppender<ILoggingEvent> appender = new ListAppender<>();
        appender.start();
        logger.addAppender(appender);
        try {
            assertThat(service.generateSource(userId,
                    sourceRequest(sourceId, OverviewMode.ALL, null))).isNotNull();
        } finally {
            logger.detachAppender(appender);
            appender.stop();
        }
        assertThat(requests).hasSize(3);
        assertThat(requests).extracting(AiProviderRequest::maxTokens)
                .containsExactly(4_608, 4_608, 6_144);
        List<String> budgetLogs = appender.list.stream()
                .map(ILoggingEvent::getFormattedMessage)
                .filter(log -> log.contains("phase=INTERMEDIATE_BUDGET_CHECK"))
                .toList();
        assertThat(budgetLogs).hasSize(2);
        assertThat(budgetLogs).allSatisfy(log -> {
            assertThat(log).contains("normalizedChars=")
                    .contains("normalizedLimit=5200")
                    .contains("selfPairPromptChars=")
                    .contains("promptLimit=2800")
                    .contains("characterOverflow=false")
                    .contains("selfPairOverflow=false");
            assertThat(log).doesNotContain("mapJson", "sourceTitle", "chunks",
                    "https://api.example.test", "key");
        });
    }

    @Test
    void rejectsIntermediateOutputThatExceedsNormalizedJsonBudgetBeforeReduce() {
        UUID userId = UUID.randomUUID();
        UUID sourceId = UUID.randomUUID();
        SourceService sourceService = mock(SourceService.class);
        when(sourceService.requireActiveSource(userId, sourceId))
                .thenReturn(source(sourceId, UUID.randomUUID(), SourceIngestionStatus.READY));
        List<AiProviderRequest> requests = new ArrayList<>();
        OverviewGenerationService service = serviceWithResponses(sourceService, List.of(
                new AiProviderResponse(balancedLargeValidDocument("source-1", 3_000, 1_976), 1, 1_000)),
                List.of(
                        chunk(userId, sourceId, true, "a".repeat(2_000)),
                        chunk(userId, sourceId, true, "b".repeat(2_000)),
                        chunk(userId, sourceId, true, "c".repeat(2_000)),
                        chunk(userId, sourceId, true, "d".repeat(2_000)),
                        chunk(userId, sourceId, true, "e".repeat(2_000)),
                        chunk(userId, sourceId, true, "f".repeat(2_000))), 12_000, requests);

        assertThatThrownBy(() -> service.generateSource(userId, sourceRequest(sourceId, OverviewMode.ALL, null)))
                .isInstanceOf(DomainException.class)
                .extracting(e -> ((DomainException) e).code())
                .isEqualTo("OVERVIEW_PROVIDER_OUTPUT_TOO_LARGE");
        assertThat(requests).hasSize(1);
    }

    @Test
    void acceptsIntermediateOutputAtNormalizedJsonBudgetBoundary() {
        UUID userId = UUID.randomUUID();
        UUID sourceId = UUID.randomUUID();
        SourceService sourceService = mock(SourceService.class);
        when(sourceService.requireActiveSource(userId, sourceId))
                .thenReturn(source(sourceId, UUID.randomUUID(), SourceIngestionStatus.READY));
        List<AiProviderRequest> requests = new ArrayList<>();
        String boundary = balancedLargeValidDocument("source-1", 3_000, 1_975);
        OverviewGenerationService service = serviceWithResponses(sourceService, List.of(
                new AiProviderResponse(boundary, 1, 1),
                new AiProviderResponse(boundary, 1, 1),
                new AiProviderResponse(validDocument("source-1"), 1, 4_096)),
                List.of(
                        chunk(userId, sourceId, true, "a".repeat(2_000)),
                        chunk(userId, sourceId, true, "b".repeat(2_000)),
                        chunk(userId, sourceId, true, "c".repeat(2_000)),
                        chunk(userId, sourceId, true, "d".repeat(2_000)),
                        chunk(userId, sourceId, true, "e".repeat(2_000)),
                        chunk(userId, sourceId, true, "f".repeat(2_000))), 12_500, requests);

        assertThat(service.generateSource(userId,
                sourceRequest(sourceId, OverviewMode.ALL, null))).isNotNull();
        assertThat(requests).extracting(AiProviderRequest::maxTokens)
                .contains(4_608, 6_144).doesNotContainNull();
    }

    @Test
    void enforcesSelfPairBoundaryIndependentlyOfNormalizedJsonBoundary() {
        UUID userId = UUID.randomUUID();
        UUID sourceId = UUID.randomUUID();
        SourceService sourceService = mock(SourceService.class);
        when(sourceService.requireActiveSource(userId, sourceId))
                .thenReturn(source(sourceId, UUID.randomUUID(), SourceIngestionStatus.READY));
        String boundaryDocument = balancedLargeValidDocument("source-1", 3_000, 1_753);
        List<SourceChunkEntity> chunks = List.of(
                chunk(userId, sourceId, true, "a".repeat(2_000)),
                chunk(userId, sourceId, true, "b".repeat(2_000)),
                chunk(userId, sourceId, true, "c".repeat(2_000)),
                chunk(userId, sourceId, true, "d".repeat(2_000)),
                chunk(userId, sourceId, true, "e".repeat(2_000)),
                chunk(userId, sourceId, true, "f".repeat(2_000)));
        List<AiProviderResponse> responses = List.of(
                new AiProviderResponse(boundaryDocument, 1, 3_073),
                new AiProviderResponse(boundaryDocument, 1, 3_073),
                new AiProviderResponse(validDocument("source-1"), 1, 4_096));

        Logger logger = (Logger) LoggerFactory.getLogger(OverviewGenerationService.class);
        ListAppender<ILoggingEvent> baselineAppender = new ListAppender<>();
        baselineAppender.start();
        logger.addAppender(baselineAppender);
        try {
            List<AiProviderRequest> baselineRequests = new ArrayList<>();
            OverviewGenerationService baselineService = serviceWithResponses(sourceService, responses, chunks,
                    12_000, baselineRequests);
            assertThat(baselineService.generateSource(userId,
                    sourceRequest(sourceId, OverviewMode.ALL, null))).isNotNull();
        } finally {
            logger.detachAppender(baselineAppender);
            baselineAppender.stop();
        }
        int baselineSelfPairChars = budgetValue(baselineAppender, "selfPairPromptChars=");
        int instructionPadding = 12_000 - baselineSelfPairChars;
        assertThat(instructionPadding).isGreaterThanOrEqualTo(0);
        String boundaryInstruction = "i".repeat(instructionPadding);

        List<AiProviderRequest> acceptedRequests = new ArrayList<>();
        OverviewGenerationService acceptedService = serviceWithResponses(sourceService, responses, chunks,
                12_000, acceptedRequests);
        ListAppender<ILoggingEvent> acceptedAppender = new ListAppender<>();
        acceptedAppender.start();
        logger.addAppender(acceptedAppender);
        try {
            assertThat(acceptedService.generateSource(userId,
                    sourceRequest(sourceId, OverviewMode.ALL, boundaryInstruction))).isNotNull();
        } finally {
            logger.detachAppender(acceptedAppender);
            acceptedAppender.stop();
        }
        assertThat(acceptedAppender.list.stream().map(ILoggingEvent::getFormattedMessage)
                .filter(log -> log.contains("phase=INTERMEDIATE_BUDGET_CHECK")))
                .anySatisfy(log -> assertThat(log)
                        .contains("normalizedChars=4978", "selfPairPromptChars=12000",
                                "characterOverflow=false", "selfPairOverflow=false"));

        List<AiProviderRequest> rejectedRequests = new ArrayList<>();
        OverviewGenerationService rejectedService = serviceWithResponses(sourceService, responses.subList(0, 1),
                chunks, 12_000, rejectedRequests);
        ListAppender<ILoggingEvent> rejectedAppender = new ListAppender<>();
        rejectedAppender.start();
        logger.addAppender(rejectedAppender);
        try {
            assertThatThrownBy(() -> rejectedService.generateSource(userId,
                    sourceRequest(sourceId, OverviewMode.ALL, boundaryInstruction + "i")))
                    .isInstanceOf(DomainException.class)
                    .extracting(error -> ((DomainException) error).code())
                    .isEqualTo("OVERVIEW_PROVIDER_OUTPUT_TOO_LARGE");
        } finally {
            logger.detachAppender(rejectedAppender);
            rejectedAppender.stop();
        }
        assertThat(rejectedAppender.list.stream().map(ILoggingEvent::getFormattedMessage)
                .filter(log -> log.contains("phase=INTERMEDIATE_BUDGET_CHECK")))
                .anySatisfy(log -> assertThat(log)
                        .contains("normalizedChars=4978", "selfPairPromptChars=12001",
                                "characterOverflow=false", "selfPairOverflow=true"));
        assertThat(acceptedRequests).extracting(AiProviderRequest::maxTokens)
                .contains(4_608, 6_144).doesNotContainNull();
    }

    @Test
    void acceptsIntermediateOutputAboveTokenBudgetWhenNormalizedAndSelfPairFit() {
        UUID userId = UUID.randomUUID();
        UUID sourceId = UUID.randomUUID();
        SourceService sourceService = mock(SourceService.class);
        when(sourceService.requireActiveSource(userId, sourceId))
                .thenReturn(source(sourceId, UUID.randomUUID(), SourceIngestionStatus.READY));
        List<AiProviderRequest> requests = new ArrayList<>();
        String valid = validDocument("source-1");
        OverviewGenerationService service = serviceWithResponses(sourceService, List.of(
                new AiProviderResponse(valid, 1, 3_073),
                new AiProviderResponse(valid, 1, 3_073),
                new AiProviderResponse(valid, 1, 4_096)),
                List.of(chunk(userId, sourceId, true, "a".repeat(1_200)),
                        chunk(userId, sourceId, true, "b".repeat(1_200))), 2_800, requests);

        assertThat(service.generateSource(userId,
                sourceRequest(sourceId, OverviewMode.ALL, null))).isNotNull();
        assertThat(requests).extracting(AiProviderRequest::maxTokens)
                .containsExactly(4_608, 4_608, 6_144);
    }

    @Test
    void appliesIntermediateBudgetToNonFinalMultiGroupReduceAndFinalBudgetToLastReduce() {
        UUID userId = UUID.randomUUID();
        UUID sourceId = UUID.randomUUID();
        SourceService sourceService = mock(SourceService.class);
        when(sourceService.requireActiveSource(userId, sourceId))
                .thenReturn(source(sourceId, UUID.randomUUID(), SourceIngestionStatus.READY));
        List<AiProviderRequest> requests = new ArrayList<>();
        String valid = validDocument("source-1");
        List<AiProviderResponse> responses = new ArrayList<>();
        String largeIntermediate = balancedLargeValidDocument("source-1", 3_000, 1_753);
        for (int i = 0; i < 4; i++) {
            responses.add(new AiProviderResponse(largeIntermediate, 1, 3_072));
        }
        for (int i = 0; i < 2; i++) {
            responses.add(new AiProviderResponse(valid, 1, 3_072));
        }
        responses.add(new AiProviderResponse(valid, 1, 4_096));
        OverviewGenerationService service = serviceWithResponses(sourceService, responses,
                List.of(chunk(userId, sourceId, true, "a".repeat(7_000)),
                        chunk(userId, sourceId, true, "b".repeat(7_000)),
                        chunk(userId, sourceId, true, "c".repeat(7_000)),
                        chunk(userId, sourceId, true, "d".repeat(7_000))), 12_000, requests);

        assertThat(service.generateSource(userId,
                sourceRequest(sourceId, OverviewMode.ALL, null))).isNotNull();
        assertThat(requests).extracting(AiProviderRequest::maxTokens)
                .containsExactly(4_608, 4_608, 4_608, 4_608, 4_608, 4_608, 6_144);
    }

    @Test
    void rejectsIntermediateOutputThatCannotFitSelfPairBeforeReduce() {
        UUID userId = UUID.randomUUID();
        UUID sourceId = UUID.randomUUID();
        SourceService sourceService = mock(SourceService.class);
        when(sourceService.requireActiveSource(userId, sourceId))
                .thenReturn(source(sourceId, UUID.randomUUID(), SourceIngestionStatus.READY));
        List<AiProviderRequest> requests = new ArrayList<>();
        OverviewGenerationService service = serviceWithResponses(sourceService, List.of(
                new AiProviderResponse(validDocument("source-1"), 1, 1)),
                List.of(chunk(userId, sourceId, true, "a".repeat(400)),
                        chunk(userId, sourceId, true, "b".repeat(400))), 2_000, requests);

        assertThatThrownBy(() -> service.generateSource(userId, sourceRequest(sourceId, OverviewMode.ALL, null)))
                .isInstanceOf(DomainException.class)
                .extracting(e -> ((DomainException) e).code())
                .isEqualTo("OVERVIEW_PROVIDER_OUTPUT_TOO_LARGE");
        assertThat(requests).hasSize(1);
    }

    @Test
    void groupsTwoDifferentBoundaryIntermediatesIntoOneFinalReduceRequest() {
        UUID userId = UUID.randomUUID();
        UUID sourceId = UUID.randomUUID();
        SourceService sourceService = mock(SourceService.class);
        when(sourceService.requireActiveSource(userId, sourceId))
                .thenReturn(source(sourceId, UUID.randomUUID(), SourceIngestionStatus.READY));
        List<AiProviderRequest> requests = new ArrayList<>();
                OverviewGenerationService service = serviceWithResponses(sourceService, List.of(
                        new AiProviderResponse(markedDocument("source-1", "BOUNDARY_A"), 1, 1_024),
                        new AiProviderResponse(markedDocument("source-1", "BOUNDARY_B"), 1, 1_024),
                        new AiProviderResponse(validDocument("source-1"), 1, 4_096)),
                List.of(chunk(userId, sourceId, true, "a".repeat(800)),
                        chunk(userId, sourceId, true, "b".repeat(800))), 2_800, requests);

        OverviewDtos.OverviewResponse result = service.generateSource(
                userId, sourceRequest(sourceId, OverviewMode.ALL, null));

        assertThat(result).isNotNull();
        assertThat(requests).hasSize(3);
        assertThat(requests).extracting(AiProviderRequest::maxTokens)
                .containsExactly(4_608, 4_608, 6_144);
        assertThat(requests).allMatch(AiProviderRequest::structuredJson);
        assertThat(requests.get(2).messages().get(1).content())
                .contains("\"mapJson\"", "BOUNDARY_A", "BOUNDARY_B");
    }

    @Test
    void keepsRealSourceIdsOutOfEveryMapAndReducePromptAndUsesUserDataMessage() {
        UUID userId = UUID.randomUUID();
        UUID sourceId = UUID.randomUUID();
        SourceService sourceService = mock(SourceService.class);
        when(sourceService.requireActiveSource(userId, sourceId))
                .thenReturn(source(sourceId, UUID.randomUUID(), SourceIngestionStatus.READY));
        List<SourceChunkEntity> chunks = List.of(
                chunk(userId, sourceId, true, "a".repeat(250)),
                chunk(userId, sourceId, true, "b".repeat(250)),
                chunk(userId, sourceId, true, "c".repeat(250)),
                chunk(userId, sourceId, true, "d".repeat(250)),
                chunk(userId, sourceId, true, "e".repeat(250)),
                chunk(userId, sourceId, true, "f".repeat(250)),
                chunk(userId, sourceId, true, "g".repeat(250)),
                chunk(userId, sourceId, true, "h".repeat(250)));
        List<AiProviderRequest> requests = new ArrayList<>();
        OverviewGenerationService service = service(sourceService, mock(SubjectService.class), chunks, 3_000,
                validDocument("source-1"), requests);

        OverviewDtos.OverviewResponse result = service.generateSource(
                userId, sourceRequest(sourceId, OverviewMode.ALL, "prefer examples"));

        assertThat(result.outline().getFirst().sections().getFirst().sourceIds())
                .containsExactly(sourceId.toString());
        assertThat(requests).hasSizeGreaterThan(1);
        for (AiProviderRequest request : requests) {
            assertThat(request.messages()).hasSize(2);
            assertThat(request.messages().getFirst().role()).isEqualTo(AiMessageRole.SYSTEM);
            assertThat(request.messages().getFirst().content()).doesNotContain(sourceId.toString());
            assertThat(request.messages().get(1).role()).isEqualTo(AiMessageRole.USER);
            assertThat(request.messages().get(1).content()).doesNotContain(sourceId.toString());
        }
    }

    @Test
    void stopsReducingWhenEveryDocumentFitsAloneButNoPairFits() {
        UUID userId = UUID.randomUUID();
        UUID sourceId = UUID.randomUUID();
        SourceService sourceService = mock(SourceService.class);
        when(sourceService.requireActiveSource(userId, sourceId))
                .thenReturn(source(sourceId, UUID.randomUUID(), SourceIngestionStatus.READY));
        List<AiProviderRequest> requests = new ArrayList<>();
        OverviewGenerationService service = service(sourceService, mock(SubjectService.class), List.of(
                        chunk(userId, sourceId, true, "a".repeat(400)),
                        chunk(userId, sourceId, true, "b".repeat(400))), 2_000,
                validDocument("source-1"), requests, 4);

        assertThatThrownBy(() -> service.generateSource(userId, sourceRequest(sourceId, OverviewMode.ALL, null)))
                .isInstanceOf(DomainException.class)
                .extracting(e -> ((DomainException) e).code())
                .isEqualTo("OVERVIEW_PROVIDER_OUTPUT_TOO_LARGE");
        assertThat(requests).hasSize(1);
    }

    @Test
    void exposesStableNoProgressCodeAtGroupingGuard() {
        assertThatThrownBy(() -> {
            var method = OverviewGenerationService.class.getDeclaredMethod("requireReduceProgress", int.class, int.class);
            method.setAccessible(true);
            try {
                method.invoke(null, 2, 2);
            } catch (java.lang.reflect.InvocationTargetException exception) {
                throw exception.getCause();
            }
        })
                .isInstanceOf(DomainException.class)
                .extracting(e -> ((DomainException) e).code())
                .isEqualTo("OVERVIEW_REDUCE_NO_PROGRESS");
    }

    @Test
    void wrapsProviderSchemaFailureBeforePhaseAndFinalLogging() {
        UUID userId = UUID.randomUUID();
        UUID sourceId = UUID.randomUUID();
        SourceService sourceService = mock(SourceService.class);
        when(sourceService.requireActiveSource(userId, sourceId))
                .thenReturn(source(sourceId, UUID.randomUUID(), SourceIngestionStatus.READY));
        OverviewGenerationService service = service(sourceService, mock(SubjectService.class),
                List.of(chunk(userId, sourceId, true, "Calculus content")), 12_000,
                "not-json");
        Logger logger = (Logger) LoggerFactory.getLogger(OverviewGenerationService.class);
        ListAppender<ILoggingEvent> appender = new ListAppender<>();
        appender.start();
        logger.addAppender(appender);
        try {
            assertThatThrownBy(() -> service.generateSource(userId,
                    sourceRequest(sourceId, OverviewMode.ALL, null)))
                    .isInstanceOf(DomainException.class)
                    .extracting(e -> ((DomainException) e).code())
                    .isEqualTo("MODEL_PROVIDER_ERROR");
        } finally {
            logger.detachAppender(appender);
            appender.stop();
        }

        List<String> failureLogs = appender.list.stream()
                .filter(event -> event.getLevel() == ch.qos.logback.classic.Level.ERROR)
                .map(ILoggingEvent::getFormattedMessage)
                .toList();
        assertThat(failureLogs).hasSize(2).allMatch(log -> log.contains("errorCode=MODEL_PROVIDER_ERROR"));
    }

    @Test
    void logsSafeProviderResponseScaleAtJsonParseStart() {
        UUID userId = UUID.randomUUID();
        UUID sourceId = UUID.randomUUID();
        SourceService sourceService = mock(SourceService.class);
        when(sourceService.requireActiveSource(userId, sourceId))
                .thenReturn(source(sourceId, UUID.randomUUID(), SourceIngestionStatus.READY));
        String document = validDocument("source-1");
        List<AiProviderRequest> requests = new ArrayList<>();
        OverviewGenerationService service = serviceWithResponses(sourceService, List.of(
                new AiProviderResponse(document, 11, 987, "length\ninjected")),
                List.of(chunk(userId, sourceId, true, "Calculus content")), 12_000, requests);
        Logger logger = (Logger) LoggerFactory.getLogger(OverviewGenerationService.class);
        ListAppender<ILoggingEvent> appender = new ListAppender<>();
        appender.start();
        logger.addAppender(appender);
        try {
            service.generateSource(userId, sourceRequest(sourceId, OverviewMode.ALL, null));
        } finally {
            logger.detachAppender(appender);
            appender.stop();
        }

        assertThat(appender.list.stream().map(ILoggingEvent::getFormattedMessage))
                .anyMatch(log -> log.contains("JSON_PARSE_START")
                        && log.contains("responseChars=" + document.length())
                        && log.contains("outputTokens=987")
                        && log.contains("finishReason=other"))
                .allMatch(log -> !log.contains(document) && !log.contains("injected"));
    }

    @Test
    void logsFinalJsonCheckForValidOverviewWithoutContent() {
        UUID userId = UUID.randomUUID();
        UUID sourceId = UUID.randomUUID();
        SourceService sourceService = mock(SourceService.class);
        when(sourceService.requireActiveSource(userId, sourceId))
                .thenReturn(source(sourceId, UUID.randomUUID(), SourceIngestionStatus.READY));
        String document = validDocument("source-1");
        OverviewGenerationService service = serviceWithResponses(sourceService, List.of(
                new AiProviderResponse(document, 11, 987, "stop")),
                List.of(chunk(userId, sourceId, true, "Calculus content")), 12_000, new ArrayList<>());
        Logger logger = (Logger) LoggerFactory.getLogger(OverviewGenerationService.class);
        ListAppender<ILoggingEvent> appender = new ListAppender<>();
        appender.start();
        logger.addAppender(appender);
        try {
            service.generateSource(userId, sourceRequest(sourceId, OverviewMode.ALL, null));
        } finally {
            logger.detachAppender(appender);
            appender.stop();
        }

        assertThat(appender.list.stream().map(ILoggingEvent::getFormattedMessage))
                .anyMatch(log -> log.contains("FINAL_JSON_CHECK")
                        && log.contains("valid=true")
                        && log.contains("chars=" + document.length()))
                .allMatch(log -> !log.contains(document));
    }

    @Test
    void finalJsonCheckUsesRawContentBeforeFenceNormalization() {
        UUID userId = UUID.randomUUID();
        UUID sourceId = UUID.randomUUID();
        SourceService sourceService = mock(SourceService.class);
        when(sourceService.requireActiveSource(userId, sourceId))
                .thenReturn(source(sourceId, UUID.randomUUID(), SourceIngestionStatus.READY));
        String document = validDocument("source-1");
        String fenced = "```json\n" + document + "\n```";
        OverviewGenerationService service = serviceWithResponses(sourceService, List.of(
                new AiProviderResponse(fenced, 11, 987, "stop")),
                List.of(chunk(userId, sourceId, true, "Calculus content")), 12_000, new ArrayList<>());
        Logger logger = (Logger) LoggerFactory.getLogger(OverviewGenerationService.class);
        ListAppender<ILoggingEvent> appender = new ListAppender<>();
        appender.start();
        logger.addAppender(appender);
        try {
            assertThat(service.generateSource(userId,
                    sourceRequest(sourceId, OverviewMode.ALL, null))).isNotNull();
        } finally {
            logger.detachAppender(appender);
            appender.stop();
        }

        assertThat(appender.list.stream().map(ILoggingEvent::getFormattedMessage))
                .anyMatch(log -> log.contains("FINAL_JSON_CHECK")
                        && log.contains("valid=false")
                        && log.contains("chars=" + fenced.length())
                        && log.contains("line=1")
                        && log.contains("column=1"));
    }

    @Test
    void logsSafeFinalJsonCheckForInvalidOverviewWithoutContentOrExceptionMessage() {
        UUID userId = UUID.randomUUID();
        UUID sourceId = UUID.randomUUID();
        SourceService sourceService = mock(SourceService.class);
        when(sourceService.requireActiveSource(userId, sourceId))
                .thenReturn(source(sourceId, UUID.randomUUID(), SourceIngestionStatus.READY));
        String invalid = "not-json-secret-marker";
        OverviewGenerationService service = serviceWithResponses(sourceService, List.of(
                new AiProviderResponse(invalid, 11, 987, "stop")),
                List.of(chunk(userId, sourceId, true, "Calculus content")), 12_000, new ArrayList<>());
        Logger logger = (Logger) LoggerFactory.getLogger(OverviewGenerationService.class);
        ListAppender<ILoggingEvent> appender = new ListAppender<>();
        appender.start();
        logger.addAppender(appender);
        try {
            assertThatThrownBy(() -> service.generateSource(userId,
                    sourceRequest(sourceId, OverviewMode.ALL, "prompt-secret-marker")))
                    .isInstanceOf(DomainException.class);
        } finally {
            logger.detachAppender(appender);
            appender.stop();
        }

        assertThat(appender.list.stream().map(ILoggingEvent::getFormattedMessage))
                .anyMatch(log -> log.contains("FINAL_JSON_CHECK")
                        && log.contains("valid=false")
                        && log.contains("chars=" + invalid.length())
                        && log.contains("line=1")
                        && log.contains("column=1")
                        && log.contains("exceptionType="))
                .allMatch(log -> !log.contains(invalid)
                        && !log.contains("prompt-secret-marker")
                        && !log.contains("getOriginalMessage")
                        && !log.contains("https://api.example.test")
                        && !log.contains("provider-key-marker")
                        && !log.contains("apiKey"));
        assertThat(appender.list.stream().map(ILoggingEvent::getFormattedMessage))
                .noneMatch(log -> log.contains("FINAL_JSON_CHECK") && log.contains("INTERMEDIATE"));
    }

    @ParameterizedTest
    @NullAndEmptySource
    void rejectsBlankIntermediateOutputAfterContentValidation(String content) {
        UUID userId = UUID.randomUUID();
        UUID sourceId = UUID.randomUUID();
        SourceService sourceService = mock(SourceService.class);
        when(sourceService.requireActiveSource(userId, sourceId))
                .thenReturn(source(sourceId, UUID.randomUUID(), SourceIngestionStatus.READY));
        List<AiProviderRequest> requests = new ArrayList<>();
        OverviewGenerationService service = serviceWithResponses(sourceService, List.of(
                new AiProviderResponse(content, 1, 1_025)),
                List.of(chunk(userId, sourceId, true, "a".repeat(400)),
                        chunk(userId, sourceId, true, "b".repeat(400))), 2_000, requests);
        Logger logger = (Logger) LoggerFactory.getLogger(OverviewGenerationService.class);
        ListAppender<ILoggingEvent> appender = new ListAppender<>();
        appender.start();
        logger.addAppender(appender);
        try {
            assertThatThrownBy(() -> service.generateSource(userId, sourceRequest(sourceId, OverviewMode.ALL, null)))
                    .isInstanceOf(DomainException.class)
                    .extracting(e -> ((DomainException) e).code())
                    .isEqualTo("MODEL_PROVIDER_ERROR");
        } finally {
            logger.detachAppender(appender);
            appender.stop();
        }
        assertThat(requests).hasSize(1);
        List<String> failureLogs = appender.list.stream()
                .filter(event -> event.getLevel() == ch.qos.logback.classic.Level.ERROR)
                .map(ILoggingEvent::getFormattedMessage)
                .toList();
        assertThat(failureLogs).hasSize(1).allMatch(log -> log.contains("errorCode=MODEL_PROVIDER_ERROR"));
    }

    @Test
    void rejectsOutlinesWithOnlyEmptySectionsWithoutCallingProvider() {
        UUID userId = UUID.randomUUID();
        UUID subjectId = UUID.randomUUID();
        UUID sourceId = UUID.randomUUID();
        SourceService sourceService = mock(SourceService.class);
        when(sourceService.requireActiveSource(userId, sourceId))
                .thenReturn(source(sourceId, subjectId, SourceIngestionStatus.READY));
        List<AiProviderRequest> requests = new ArrayList<>();
        OverviewGenerationService service = service(sourceService, mock(SubjectService.class), List.of(), 12_000,
                validDocument("source-1"), requests);
        OverviewDtos.OverviewSummary summary = new OverviewDtos.OverviewSummary("summary", List.of(), List.of());
        OverviewDtos.OverviewChapter emptyChapter = new OverviewDtos.OverviewChapter("Empty", List.of());

        for (OverviewMode mode : List.of(OverviewMode.OUTLINE, OverviewMode.ALL)) {
            OverviewDtos.SubjectOverviewSourceInput input = new OverviewDtos.SubjectOverviewSourceInput(
                    sourceId, "Calculus", List.of(emptyChapter), summary);
            assertThatThrownBy(() -> service.generateSubject(userId,
                    new OverviewDtos.SubjectOverviewRequest(subjectId, mode, null, List.of(input))))
                    .isInstanceOf(DomainException.class)
                    .extracting(e -> ((DomainException) e).code())
                    .isEqualTo("VALIDATION_FAILED");
        }
        assertThat(requests).isEmpty();
    }

    @Test
    void rejectsProviderLocatorAsModelProviderError() {
        UUID userId = UUID.randomUUID();
        UUID sourceId = UUID.randomUUID();
        SourceService sourceService = mock(SourceService.class);
        when(sourceService.requireActiveSource(userId, sourceId))
                .thenReturn(source(sourceId, UUID.randomUUID(), SourceIngestionStatus.READY));
        String locatorDocument = validDocument("source-1").replace("\"locator\":null", "\"locator\":{\"page\":2,\"blockId\":null}");
        OverviewGenerationService service = service(sourceService, mock(SubjectService.class),
                List.of(chunk(userId, sourceId, true, "content")), 12_000, locatorDocument);

        assertThatThrownBy(() -> service.generateSource(userId, sourceRequest(sourceId, OverviewMode.ALL, null)))
                .isInstanceOf(DomainException.class)
                .extracting(e -> ((DomainException) e).code())
                .isEqualTo("MODEL_PROVIDER_ERROR");
    }

    @Test
    void rejectsDuplicateSubjectSourcesAndUnavailableRequestedPart() {
        UUID userId = UUID.randomUUID();
        UUID subjectId = UUID.randomUUID();
        UUID sourceId = UUID.randomUUID();
        SourceService sourceService = mock(SourceService.class);
        SubjectService subjectService = mock(SubjectService.class);
        when(sourceService.requireActiveSource(userId, sourceId))
                .thenReturn(source(sourceId, subjectId, SourceIngestionStatus.READY));
        OverviewGenerationService service = service(sourceService, subjectService, List.of(), 12_000,
                validDocument("source-1"));
        OverviewDtos.SubjectOverviewSourceInput input = new OverviewDtos.SubjectOverviewSourceInput(
                sourceId, "Calculus", null, new OverviewDtos.OverviewSummary("summary", List.of(), List.of()));

        assertThatThrownBy(() -> service.generateSubject(userId,
                new OverviewDtos.SubjectOverviewRequest(subjectId, OverviewMode.OUTLINE, null,
                        List.of(input))))
                .isInstanceOf(DomainException.class)
                .hasMessageContaining("outline");
        assertThatThrownBy(() -> service.generateSubject(userId,
                new OverviewDtos.SubjectOverviewRequest(subjectId, OverviewMode.SUMMARY, null,
                        List.of(input, input))))
                .isInstanceOf(DomainException.class)
                .hasMessageContaining("duplicate");
    }

    private static OverviewGenerationService service(
            SourceService sourceService,
            SubjectService subjectService,
            List<SourceChunkEntity> chunks,
            int maxPromptChars,
            String providerDocument) {
        return service(sourceService, subjectService, chunks, maxPromptChars, providerDocument, null);
    }

    private static OverviewGenerationService service(
            SourceService sourceService,
            List<SourceChunkEntity> chunks,
            int maxPromptChars,
            AiProviderPort provider) {
        SourceChunkRepository chunkRepository = mock(SourceChunkRepository.class);
        when(chunkRepository.findAllByUserIdAndSourceIdAndActiveTrueOrderByOrdinalAsc(any(), any())).thenReturn(chunks);
        AiSettingsService settingsService = mock(AiSettingsService.class);
        when(settingsService.resolve(any(), eq(AiProviderType.DEEPSEEK))).thenReturn(new AiSettingsService.ResolvedSettings(
                AiProviderType.DEEPSEEK, "test-model", new AiCredential("https://api.example.test", "key", "embed")));
        AiProviderRegistry providerRegistry = mock(AiProviderRegistry.class);
        when(providerRegistry.require(AiProviderType.DEEPSEEK)).thenReturn(provider);
        AuralisProperties properties = mock(AuralisProperties.class);
        AuralisProperties.Ai ai = mock(AuralisProperties.Ai.class);
        when(properties.ai()).thenReturn(ai);
        when(ai.defaultProvider()).thenReturn("DEEPSEEK");
        when(ai.maxPromptChars()).thenReturn(maxPromptChars);
        when(ai.overviewResponseTimeoutMillis()).thenReturn(120_000L);
        return new OverviewGenerationService(sourceService, mock(SubjectService.class), chunkRepository, settingsService,
                providerRegistry, properties, new OverviewDocumentValidator(new ObjectMapper()), new ObjectMapper());
    }

    private static OverviewGenerationService service(
            SourceService sourceService,
            SubjectService subjectService,
            List<SourceChunkEntity> chunks,
            int maxPromptChars,
            String providerDocument,
            List<AiProviderRequest> requests) {
        return service(sourceService, subjectService, chunks, maxPromptChars, providerDocument, requests, null);
    }

    private static OverviewGenerationService service(
            SourceService sourceService,
            SubjectService subjectService,
            List<SourceChunkEntity> chunks,
            int maxPromptChars,
            String providerDocument,
            List<AiProviderRequest> requests,
            Integer failProviderAfterCalls,
            List<Long> responseTimeouts) {
        SourceChunkRepository chunkRepository = mock(SourceChunkRepository.class);
        when(chunkRepository.findAllByUserIdAndSourceIdAndActiveTrueOrderByOrdinalAsc(any(), any())).thenReturn(chunks);
        AiSettingsService settingsService = mock(AiSettingsService.class);
        when(settingsService.resolve(any(), eq(AiProviderType.DEEPSEEK))).thenReturn(new AiSettingsService.ResolvedSettings(
                AiProviderType.DEEPSEEK, "test-model", new AiCredential("https://api.example.test", "key", "embed")));
        AiProviderPort provider = new AiProviderPort() {
            @Override public AiProviderType type() { return AiProviderType.DEEPSEEK; }
            @Override public AiProviderResponse complete(AiProviderRequest request, AiCredential credential) {
                return complete(request, credential, 10_000L);
            }
            @Override public AiProviderResponse complete(AiProviderRequest request, AiCredential credential,
                                                           long responseTimeoutMillis) {
                if (responseTimeouts != null) responseTimeouts.add(responseTimeoutMillis);
                if (requests != null) requests.add(request);
                if (failProviderAfterCalls != null && requests != null && requests.size() > failProviderAfterCalls) {
                    throw new DomainException("MODEL_PROVIDER_ERROR", "provider call guard");
                }
                if (providerDocument == null) {
                    throw new DomainException("MODEL_PROVIDER_ERROR", "provider failed");
                }
                return new AiProviderResponse(providerDocument, 1, 1);
            }
        };
        AiProviderRegistry providerRegistry = mock(AiProviderRegistry.class);
        when(providerRegistry.require(AiProviderType.DEEPSEEK)).thenReturn(provider);
        AuralisProperties properties = mock(AuralisProperties.class);
        AuralisProperties.Ai ai = mock(AuralisProperties.Ai.class);
        when(properties.ai()).thenReturn(ai);
        when(ai.defaultProvider()).thenReturn("DEEPSEEK");
        when(ai.maxPromptChars()).thenReturn(maxPromptChars);
        when(ai.overviewResponseTimeoutMillis()).thenReturn(120_000L);
        return new OverviewGenerationService(sourceService, subjectService, chunkRepository, settingsService,
                providerRegistry, properties, new OverviewDocumentValidator(new ObjectMapper()), new ObjectMapper());
    }

    private static OverviewGenerationService serviceWithResponses(
            SourceService sourceService,
            List<AiProviderResponse> responses,
            List<SourceChunkEntity> chunks,
            int maxPromptChars,
            List<AiProviderRequest> requests) {
        SourceChunkRepository chunkRepository = mock(SourceChunkRepository.class);
        when(chunkRepository.findAllByUserIdAndSourceIdAndActiveTrueOrderByOrdinalAsc(any(), any())).thenReturn(chunks);
        AiSettingsService settingsService = mock(AiSettingsService.class);
        when(settingsService.resolve(any(), eq(AiProviderType.DEEPSEEK))).thenReturn(new AiSettingsService.ResolvedSettings(
                AiProviderType.DEEPSEEK, "test-model", new AiCredential("https://api.example.test", "key", "embed")));
        AiProviderPort provider = new AiProviderPort() {
            private int index;

            @Override public AiProviderType type() { return AiProviderType.DEEPSEEK; }

            @Override public AiProviderResponse complete(AiProviderRequest request, AiCredential credential) {
                return complete(request, credential, 10_000L);
            }

            @Override public AiProviderResponse complete(AiProviderRequest request, AiCredential credential,
                                                           long responseTimeoutMillis) {
                requests.add(request);
                if (index >= responses.size()) {
                    throw new DomainException("MODEL_PROVIDER_ERROR", "provider response queue exhausted");
                }
                return responses.get(index++);
            }
        };
        AiProviderRegistry providerRegistry = mock(AiProviderRegistry.class);
        when(providerRegistry.require(AiProviderType.DEEPSEEK)).thenReturn(provider);
        AuralisProperties properties = mock(AuralisProperties.class);
        AuralisProperties.Ai ai = mock(AuralisProperties.Ai.class);
        when(properties.ai()).thenReturn(ai);
        when(ai.defaultProvider()).thenReturn("DEEPSEEK");
        when(ai.maxPromptChars()).thenReturn(maxPromptChars);
        when(ai.overviewResponseTimeoutMillis()).thenReturn(120_000L);
        return new OverviewGenerationService(sourceService, mock(SubjectService.class), chunkRepository, settingsService,
                providerRegistry, properties, new OverviewDocumentValidator(new ObjectMapper()), new ObjectMapper());
    }

    private static OverviewGenerationService service(
            SourceService sourceService,
            SubjectService subjectService,
            List<SourceChunkEntity> chunks,
            int maxPromptChars,
            String providerDocument,
            List<AiProviderRequest> requests,
            Integer failProviderAfterCalls) {
        SourceChunkRepository chunkRepository = mock(SourceChunkRepository.class);
        when(chunkRepository.findAllByUserIdAndSourceIdAndActiveTrueOrderByOrdinalAsc(any(), any())).thenReturn(chunks);
        AiSettingsService settingsService = mock(AiSettingsService.class);
        when(settingsService.resolve(any(), eq(AiProviderType.DEEPSEEK))).thenReturn(new AiSettingsService.ResolvedSettings(
                AiProviderType.DEEPSEEK, "test-model", new AiCredential("https://api.example.test", "key", "embed")));
        AiProviderPort provider = new AiProviderPort() {
            @Override public AiProviderType type() { return AiProviderType.DEEPSEEK; }
            @Override public AiProviderResponse complete(AiProviderRequest request, AiCredential credential) {
                if (requests != null) requests.add(request);
                if (failProviderAfterCalls != null && requests != null && requests.size() > failProviderAfterCalls) {
                    throw new DomainException("MODEL_PROVIDER_ERROR", "provider call guard");
                }
                if (providerDocument == null) {
                    throw new DomainException("MODEL_PROVIDER_ERROR", "provider failed");
                }
                return new AiProviderResponse(providerDocument, 1, 1);
            }
        };
        AiProviderRegistry providerRegistry = mock(AiProviderRegistry.class);
        when(providerRegistry.require(AiProviderType.DEEPSEEK)).thenReturn(provider);
        AuralisProperties properties = mock(AuralisProperties.class);
        AuralisProperties.Ai ai = mock(AuralisProperties.Ai.class);
        when(properties.ai()).thenReturn(ai);
        when(ai.defaultProvider()).thenReturn("DEEPSEEK");
        when(ai.maxPromptChars()).thenReturn(maxPromptChars);
        return new OverviewGenerationService(sourceService, subjectService, chunkRepository, settingsService,
                providerRegistry, properties, new OverviewDocumentValidator(new ObjectMapper()), new ObjectMapper());
    }

    private static OverviewDtos.SourceOverviewRequest sourceRequest(UUID sourceId, OverviewMode mode, String instruction) {
        return new OverviewDtos.SourceOverviewRequest(sourceId, mode, instruction);
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
            if (thread != null && thread.getState() == Thread.State.WAITING) {
                boolean joinedFuture = java.util.Arrays.stream(thread.getStackTrace())
                        .anyMatch(frame -> frame.getClassName().equals(CompletableFuture.class.getName())
                                && (frame.getMethodName().equals("join") || frame.getMethodName().equals("waitingGet")));
                if (joinedFuture) return;
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

    private static String validDocument(String alias) {
        return "{\"schemaVersion\":1,\"title\":\"Calculus\",\"outline\":[{\"title\":\"Limits\"," 
                + "\"sections\":[{\"title\":\"Sequences\",\"summary\":\"A limit\",\"sourceIds\":[\""
                + alias + "\"],\"locator\":null}]}],\"summary\":{\"overview\":\"Study\"," 
                + "\"keyPoints\":[\"Limits\"],\"learningPath\":[\"Limits\"]}}";
    }

    private static String markedDocument(String alias, String marker) {
        return validDocument(alias).replace("\"title\":\"Calculus\"", "\"title\":\"Calculus " + marker + "\"");
    }

    private static String summaryOnlyDocument(String alias) {
        return "{\"schemaVersion\":1,\"title\":\"Calculus\",\"outline\":null,\"summary\":{\"overview\":\"Study\"," 
                + "\"keyPoints\":[\"Limits\"],\"learningPath\":[\"Limits\"]}}";
    }

    private static String outlineOnlyDocument(String alias) {
        return "{\"schemaVersion\":1,\"title\":\"Calculus\",\"outline\":[{\"title\":\"Limits\"," 
                + "\"sections\":[{\"title\":\"Sequences\",\"summary\":\"A limit\",\"sourceIds\":[\""
                + alias + "\"],\"locator\":null}]}],\"summary\":null}";
    }

    private static String excessiveChaptersDocument() {
        String chapter = "{\"title\":\"C\",\"sections\":[]}";
        return "{\"schemaVersion\":1,\"title\":\"Calculus\",\"outline\":["
                + String.join(",", java.util.Collections.nCopies(61, chapter))
                + "],\"summary\":{\"overview\":\"Study\",\"keyPoints\":[],\"learningPath\":[]}}";
    }

    private static String largeValidDocument(String alias) {
        return largeValidDocument(alias, 4_000);
    }

    private static String largeValidDocument(String alias, int overviewChars) {
        return "{\"schemaVersion\":1,\"title\":\"Calculus\",\"outline\":[{\"title\":\"Limits\"," 
                + "\"sections\":[{\"title\":\"Sequences\",\"summary\":\"A limit\",\"sourceIds\":[\""
                + alias + "\"],\"locator\":null}]}],\"summary\":{\"overview\":\""
                + "x".repeat(overviewChars) + "\",\"keyPoints\":[],\"learningPath\":[]}}";
    }

    private static String balancedLargeValidDocument(String alias, int overviewChars, int keyPointChars) {
        return "{\"schemaVersion\":1,\"title\":\"Calculus\",\"outline\":[{\"title\":\"Limits\"," 
                + "\"sections\":[{\"title\":\"Sequences\",\"summary\":\"A limit\",\"sourceIds\":[\""
                + alias + "\"],\"locator\":null}]}],\"summary\":{\"overview\":\""
                + "x".repeat(overviewChars) + "\",\"keyPoints\":[\""
                + "y".repeat(keyPointChars) + "\"],\"learningPath\":[]}}";
    }

    private static int budgetValue(ListAppender<ILoggingEvent> appender, String field) {
        String log = appender.list.stream()
                .map(ILoggingEvent::getFormattedMessage)
                .filter(message -> message.contains("phase=INTERMEDIATE_BUDGET_CHECK"))
                .findFirst()
                .orElseThrow();
        int start = log.indexOf(field) + field.length();
        int end = log.indexOf(' ', start);
        return Integer.parseInt(log.substring(start, end));
    }
}
