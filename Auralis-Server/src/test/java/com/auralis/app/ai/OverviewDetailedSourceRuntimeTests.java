package com.auralis.app.ai;

import com.auralis.app.ai.OverviewDtos.SourceOverviewRequest;
import com.auralis.app.ai.internal.persistence.SourceChunkEntity;
import com.auralis.app.ai.internal.persistence.SourceChunkRepository;
import com.auralis.app.ai.usage.AiCredentialSource;
import com.auralis.app.ai.usage.AiFeature;
import com.auralis.app.ai.usage.AiInputTokenEstimator;
import com.auralis.app.ai.usage.AiInvocationBinding;
import com.auralis.app.ai.usage.AiInvocationGateway;
import com.auralis.app.ai.usage.AiInvocationResult;
import com.auralis.app.ai.usage.AiPlatformTaskBudgetUsage;
import com.auralis.app.ai.usage.AiUsageLimitException;
import com.auralis.app.ai.usage.AiStage;
import com.auralis.app.ai.usage.AiTaskScope;
import com.auralis.app.shared.config.AuralisProperties;
import com.auralis.app.shared.error.DomainException;
import com.auralis.app.source.SourceIngestionStatus;
import com.auralis.app.source.SourceService;
import com.auralis.app.source.SourceType;
import com.auralis.app.source.SourceView;
import com.auralis.app.subject.SubjectService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import tools.jackson.databind.json.JsonMapper;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import java.util.stream.IntStream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class OverviewDetailedSourceRuntimeTests {
    private static final String CONTENT = "Publication details.\nA material fact appears in the original text.";
    private static final String CLEAN = """
            {"exclusions":[{"startLine":1,"endLine":1,"category":"COVER_COPYRIGHT","reason":"Publication details"}]}
            """;
    private static final String OUTLINE = """
            ## Material fact

            - Evidence from the original text.
            """;
    private static final String SUMMARY = "The material fact is described in the original text.";

    private final UUID userId = UUID.randomUUID();
    private final UUID sourceId = UUID.randomUUID();
    private final UUID revision = UUID.randomUUID();
    private final UUID generation = UUID.randomUUID();
    private final UUID chunkId = UUID.randomUUID();
    private final UUID parsedDocumentId = UUID.randomUUID();
    private final SourceService sources = mock(SourceService.class);
    private final SourceChunkRepository chunks = mock(SourceChunkRepository.class);
    private final AiSettingsService settings = mock(AiSettingsService.class);
    private final AiInvocationGateway gateway = mock(AiInvocationGateway.class);
    private final AiTaskScope scope = mock(AiTaskScope.class);
    private final AuralisProperties properties = mock(AuralisProperties.class);
    private final AuralisProperties.Ai ai = mock(AuralisProperties.Ai.class);
    private final JsonMapper mapper = JsonMapper.builder().build();

    @ParameterizedTest
    @EnumSource(OverviewMode.class)
    void directFileUsesOneTaskAndReturnsRequestedMarkdown(OverviewMode mode) {
        OverviewGenerationService service = service(128_000);
        List<AiStage> stages = new ArrayList<>();
        List<AiProviderRequest> requests = new ArrayList<>();
        List<String> responses = mode == OverviewMode.OUTLINE ? List.of(CLEAN, OUTLINE)
                : List.of(CLEAN, OUTLINE, SUMMARY);
        when(complete()).thenAnswer(invocation -> {
            AiInvocationBinding binding = invocation.getArgument(8);
            assertThat(invocation.<Long>getArgument(5)).isEqualTo(60_000L);
            UUID reservation = UUID.randomUUID();
            binding.beforeReservation();
            binding.onReserved(reservation);
            binding.beforeDispatch(reservation);
            stages.add(invocation.getArgument(0));
            requests.add(invocation.getArgument(2));
            return response(responses.get(requests.size() - 1), "stop");
        });

        SourceOverviewRequest request = new SourceOverviewRequest(sourceId, mode, "Explain the original facts");
        service.preflightSource(userId, request);
        var result = service.generateSource(userId, request);

        assertThat(stages).hasSize(responses.size()).startsWith(AiStage.OVERVIEW_MAP);
        assertThat(stages.subList(1, stages.size())).containsOnly(AiStage.OVERVIEW_REDUCE);
        assertThat(requests.getFirst().structuredJson()).isTrue();
        assertThat(requests.getFirst().messages().getLast().content())
                .contains("[L1] Publication details.", "[L2] A material fact appears in the original text.");
        assertThat(requests.subList(1, requests.size())).allSatisfy(call -> {
            assertThat(call.structuredJson()).isFalse();
            assertThat(call.maxTokens()).isPositive();
            assertThat(call.messages().getFirst().content()).contains("Explain the original facts");
            assertThat(call.messages().getLast().content()).contains("A material fact appears in the original text.")
                    .doesNotContain("Publication details.", "[L1]", "[L2]");
        });
        if (mode != OverviewMode.OUTLINE) {
            assertThat(requests.getLast().messages().getLast().content()).contains(OUTLINE);
        }
        assertThat(result).isEqualTo(new OverviewDtos.OverviewResponse(2, "Fixture",
                mode == OverviewMode.SUMMARY ? null : OUTLINE,
                mode == OverviewMode.OUTLINE ? null : SUMMARY));
        verify(gateway).beginTask(org.mockito.ArgumentMatchers.argThat(context ->
                context.feature() == AiFeature.SOURCE_OVERVIEW && userId.equals(context.userId())));
        verify(scope).close();
    }

    @Test
    void longFileBatchesAllStagesWithinOneTaskAndKeepsAdjacentBody() {
        int contextWindow = 16_384;
        int lineCount = 300;
        OverviewGenerationService service = service(contextWindow, contextWindow);
        String content = IntStream.rangeClosed(1, lineCount)
                .mapToObj(line -> "正文样本%d号。".formatted(line) + "数据库事务保留一致性。".repeat(9))
                .collect(Collectors.joining("\n"));
        when(chunks.findAllByUserIdAndSourceIdAndActiveTrueOrderByOrdinalAsc(userId, sourceId))
                .thenReturn(List.of(chunk(chunkId, generation, revision, content)));

        List<Integer> excluded = new ArrayList<>();
        List<Integer> outlineLines = new ArrayList<>();
        List<Integer> summaryLines = new ArrayList<>();
        List<String> summaryPoints = new ArrayList<>();
        List<String> phases = new ArrayList<>();
        Pattern cleanCore = Pattern.compile("本窗核心 L(\\d+)–L(\\d+)");
        Pattern newBody = Pattern.compile("窗口 W\\d+，新正文 L(\\d+)–L(\\d+)");
        Pattern bodyLine = Pattern.compile("(?m)^\\[L\\d+\\] 正文样本(\\d+)号。");
        Pattern evidenceId = Pattern.compile("W\\d+\\.T\\d+");
        when(complete()).thenAnswer(invocation -> {
            AiProviderRequest call = invocation.getArgument(2);
            String system = call.messages().getFirst().content();
            String user = call.messages().getLast().content();
            long inputTokens = AiInputTokenEstimator.estimateOverview(call).inputTokens();
            assertThat(inputTokens + call.maxTokens()).isLessThanOrEqualTo(contextWindow);
            var cleanRange = cleanCore.matcher(user);
            if (cleanRange.find()) {
                phases.add("clean");
                assertThat(call.structuredJson()).isTrue();
                assertThat(invocation.<AiStage>getArgument(0)).isEqualTo(AiStage.OVERVIEW_MAP);
                if (excluded.isEmpty()) {
                    int lastCore = Integer.parseInt(cleanRange.group(2));
                    assertThat(user).contains("正文样本%d号。".formatted(lastCore + 1));
                    excluded.add(lastCore);
                    return response("""
                            {"exclusions":[{"startLine":%d,"endLine":%d,"category":"COVER_COPYRIGHT","reason":"Fixture"}]}
                            """.formatted(lastCore, lastCore + 1), "stop");
                }
                return response("{\"exclusions\":[]}", "stop");
            }
            var outlineRange = newBody.matcher(user);
            if (outlineRange.find()) {
                phases.add("outline map");
                assertThat(call.structuredJson()).isTrue();
                assertThat(invocation.<AiStage>getArgument(0)).isEqualTo(AiStage.OVERVIEW_MAP);
                bodyLine.matcher(user.substring(user.indexOf("【本窗口新正文】"))).results()
                        .forEach(line -> outlineLines.add(Integer.parseInt(line.group(1))));
                return response("""
                        {"topics":[{"title":"事务","scope":"一致性","ranges":[[%s,%s]]}]}
                        """.formatted(outlineRange.group(1), outlineRange.group(2)), "stop");
            }
            if (system.contains("局部提取 ID")) {
                phases.add("outline merge");
                assertThat(call.structuredJson()).isTrue();
                assertThat(invocation.<AiStage>getArgument(0)).isEqualTo(AiStage.OVERVIEW_REDUCE);
                String evidence = evidenceId.matcher(user).results().map(match -> "\"" + match.group() + "\"")
                        .distinct().collect(Collectors.joining(","));
                assertThat(evidence).contains("W01.T01", "W02.T01");
                return response("""
                        {"title":"数据库","topics":[{"title":"事务","items":["一致性"],"evidence":[%s]}]}
                        """.formatted(evidence), "stop");
            }
            if (system.contains("\"sections\"")) {
                phases.add("summary map");
                assertThat(call.structuredJson()).isTrue();
                assertThat(invocation.<AiStage>getArgument(0)).isEqualTo(AiStage.OVERVIEW_MAP);
                assertThat(user).contains("G01");
                bodyLine.matcher(user.substring(user.indexOf("【本窗口新正文】"))).results()
                        .forEach(line -> summaryLines.add(Integer.parseInt(line.group(1))));
                String point = "事务保留一致性，样本%d。".formatted(summaryLines.getLast());
                summaryPoints.add(point);
                return response("""
                        {"sections":[{"topicId":"G01","points":[{"keyPoint":"%s","explanation":""}]}]}
                        """.formatted(point), "stop");
            }
            phases.add("summary merge");
            assertThat(call.structuredJson()).isFalse();
            assertThat(invocation.<AiStage>getArgument(0)).isEqualTo(AiStage.OVERVIEW_REDUCE);
            summaryPoints.forEach(point -> assertThat(user).contains(point));
            return response("## 事务\n\n数据库事务保留一致性。", "stop");
        });

        var result = service.generateSource(userId, new SourceOverviewRequest(sourceId, OverviewMode.ALL, null));

        assertThat(result.schemaVersion()).isEqualTo(2);
        assertThat(result.title()).isEqualTo("Fixture");
        assertThat(result.outlineMarkdown()).contains("# 数据库", "## 事务", "- 一致性");
        assertThat(result.summaryMarkdown()).isEqualTo("## 事务\n\n数据库事务保留一致性。");
        assertThat(phases).startsWith("clean", "clean").endsWith("summary merge");
        assertThat(phases.stream().distinct()).containsExactly("clean", "outline map", "outline merge",
                "summary map", "summary merge");
        assertThat(phases.stream().filter("outline map"::equals).count()).isGreaterThan(1L);
        assertThat(phases.stream().filter("summary map"::equals).count()).isGreaterThan(1L);
        List<Integer> retained = IntStream.rangeClosed(1, lineCount)
                .filter(line -> !excluded.contains(line)).boxed().toList();
        assertThat(outlineLines).containsExactlyElementsOf(retained);
        assertThat(summaryLines).containsExactlyElementsOf(retained);
        verify(gateway).beginTask(org.mockito.ArgumentMatchers.argThat(context ->
                context.feature() == AiFeature.SOURCE_OVERVIEW && userId.equals(context.userId())));
        verify(scope).close();
    }

    @Test
    void identicalTextFromAnotherGenerationCannotDispatchAfterAdmission() {
        OverviewGenerationService service = service(128_000);
        when(complete()).thenAnswer(invocation -> {
            AiInvocationBinding binding = invocation.getArgument(8);
            binding.beforeReservation();
            UUID reservation = UUID.randomUUID();
            binding.onReserved(reservation);
            when(chunks.findAllByUserIdAndSourceIdAndActiveTrueOrderByOrdinalAsc(userId, sourceId))
                    .thenReturn(List.of(chunk(UUID.randomUUID(), revision)));
            binding.beforeDispatch(reservation);
            throw new AssertionError("Stale content was allowed to dispatch");
        });

        assertThatThrownBy(() -> service.generateSource(userId, request()))
                .isInstanceOfSatisfying(DomainException.class,
                        failure -> assertThat(failure.code()).isEqualTo("MUTATION_REJECTED"));
        verifyStageCalls(1);
        verify(scope).close();
    }

    @Test
    void identicalTextWithAnotherChunkIdDiscardsAnAlreadyReturnedResponse() {
        OverviewGenerationService service = service(128_000);
        when(complete()).thenAnswer(invocation -> {
            when(chunks.findAllByUserIdAndSourceIdAndActiveTrueOrderByOrdinalAsc(userId, sourceId))
                    .thenReturn(List.of(chunk(UUID.randomUUID(), generation, revision)));
            return response("unparseable response", "stop");
        });

        assertThatThrownBy(() -> service.generateSource(userId, request()))
                .isInstanceOfSatisfying(DomainException.class,
                        failure -> assertThat(failure.code()).isEqualTo("MUTATION_REJECTED"));
        verifyStageCalls(1);
        verify(scope).close();
    }

    @Test
    void preflightRejectsMismatchedSnapshotBeforeProviderAdmission() {
        OverviewGenerationService service = service(128_000);
        when(chunks.findAllByUserIdAndSourceIdAndActiveTrueOrderByOrdinalAsc(userId, sourceId))
                .thenReturn(List.of(chunk(generation, UUID.randomUUID())));

        assertThatThrownBy(() -> service.preflightSource(userId, request()))
                .isInstanceOfSatisfying(DomainException.class,
                        failure -> assertThat(failure.code()).isEqualTo("RESOURCE_VERSION_CONFLICT"));
        verifyNoInteractions(gateway);
    }

    @Test
    void minimumCleanBatchExceedsModelCapacityBeforeGatewayDispatch() {
        OverviewGenerationService service = service(512, 512);
        String content = "A material fact.\n".repeat(300);
        when(chunks.findAllByUserIdAndSourceIdAndActiveTrueOrderByOrdinalAsc(userId, sourceId))
                .thenReturn(List.of(chunk(chunkId, generation, revision, content)));

        assertThatThrownBy(() -> service.generateSource(userId, request()))
                .isInstanceOfSatisfying(DomainException.class,
                        failure -> assertThat(failure.code()).isEqualTo("OVERVIEW_PROMPT_BUDGET_EXCEEDED"));
        verifyStageCalls(0);
        verify(scope).close();
    }

    @Test
    void platformTaskRemainderTrimsHeadroomButPreservesCleanMinimum() {
        OverviewGenerationService service = service(128_000);
        when(scope.platformTaskBudgetUsage()).thenReturn(new AiPlatformTaskBudgetUsage(0, 521_788, 800),
                new AiPlatformTaskBudgetUsage(1, 524_288, 0));
        when(complete()).thenAnswer(invocation -> {
            AiProviderRequest request = invocation.getArgument(2);
            long input = com.auralis.app.ai.usage.AiInputTokenEstimator.estimateOverview(request).inputTokens();
            assertThat(request.maxTokens()).isEqualTo(Math.toIntExact(1_700 - input)).isBetween(320, 479);
            return response(CLEAN, "stop");
        });

        assertThatThrownBy(() -> service.generateSource(userId, request()))
                .isInstanceOfSatisfying(AiUsageLimitException.class,
                        failure -> assertThat(failure.code()).isEqualTo("AI_TASK_BUDGET_EXCEEDED"));
        verifyStageCalls(1);
        verify(scope).close();
    }

    @Test
    void reportedTruncationStopsEvenWhenReturnedCleanJsonIsComplete() {
        OverviewGenerationService service = service(128_000);
        when(complete()).thenReturn(response(CLEAN, "length"));

        assertThatThrownBy(() -> service.generateSource(userId, request()))
                .isInstanceOfSatisfying(DomainException.class,
                        failure -> assertThat(failure.code()).isEqualTo("OVERVIEW_PROVIDER_OUTPUT_TRUNCATED"));
        verifyStageCalls(1);
        verify(scope).close();
    }

    @Test
    void emptyOutlineStopsBeforeSummaryDispatch() {
        OverviewGenerationService service = service(128_000);
        when(complete()).thenReturn(response(CLEAN, "stop"), response(" ", "stop"));

        assertThatThrownBy(() -> service.generateSource(userId,
                new SourceOverviewRequest(sourceId, OverviewMode.SUMMARY, null)))
                .isInstanceOfSatisfying(DomainException.class,
                        failure -> assertThat(failure.code()).isEqualTo("MODEL_PROVIDER_ERROR"));
        verifyStageCalls(2);
        verify(scope).close();
    }

    private OverviewGenerationService service(long maxOutputTokens) {
        return service(maxOutputTokens, 1_000_000);
    }

    private OverviewGenerationService service(long maxOutputTokens, long contextWindow) {
        when(properties.ai()).thenReturn(ai);
        when(ai.overviewResponseTimeoutMillis()).thenReturn(60_000L);
        when(ai.overviewLimits()).thenReturn(AuralisProperties.OverviewLimits.withoutAdditionalCaps());
        when(ai.generation()).thenReturn(new AuralisProperties.GenerationEndpoint(
                "https://example.test", "fixture", "key", contextWindow, maxOutputTokens));
        when(sources.requireActiveSource(userId, sourceId)).thenReturn(new SourceView(sourceId, UUID.randomUUID(),
                SourceType.FILE, "Fixture", null, null, null, null, SourceIngestionStatus.READY, revision,
                null, null, 0, null, null, null, null));
        when(chunks.findAllByUserIdAndSourceIdAndActiveTrueOrderByOrdinalAsc(userId, sourceId))
                .thenReturn(List.of(chunk(generation, revision)));
        when(settings.resolve(userId, AiProviderType.OPENAI_COMPATIBLE)).thenReturn(new AiSettingsService.ResolvedSettings(
                AiProviderType.OPENAI_COMPATIBLE, "fixture", new AiCredential("https://example.test", "test"),
                AiCredentialSource.PLATFORM));
        when(gateway.beginTask(any())).thenReturn(scope);
        when(scope.platformTaskBudgetUsage()).thenReturn(new AiPlatformTaskBudgetUsage(0, 0, 0));
        return new OverviewGenerationService(sources, mock(SubjectService.class), chunks, settings, gateway, properties,
                new OverviewDocumentValidator(mapper, properties), mapper);
    }

    private SourceOverviewRequest request() {
        return new SourceOverviewRequest(sourceId, OverviewMode.OUTLINE, null);
    }

    private SourceChunkEntity chunk(UUID chunkGeneration, UUID chunkRevision) {
        return chunk(chunkId, chunkGeneration, chunkRevision);
    }

    private SourceChunkEntity chunk(UUID id, UUID chunkGeneration, UUID chunkRevision) {
        return chunk(id, chunkGeneration, chunkRevision, CONTENT);
    }

    private SourceChunkEntity chunk(UUID id, UUID chunkGeneration, UUID chunkRevision, String content) {
        String provenance = SourceChunkProvenance.encode(List.of(new SourceChunkProvenance(
                SourceChunkProvenance.SCHEMA_VERSION, chunkRevision, parsedDocumentId, "fixture-pdf",
                List.of(new SourceChunkProvenance.Location(0, "paragraph", 1L, null, null,
                        0, content.length(), 0, content.length()))))).getFirst();
        return new SourceChunkEntity(id, userId, sourceId, 0, content, "hash", 0, content.length(),
                "[]", chunkGeneration, true, provenance);
    }

    private AiInvocationResult<AiProviderResponse> complete() {
        return scope.complete(any(), eq(AiProviderType.OPENAI_COMPATIBLE), any(), any(), eq(AiCredentialSource.PLATFORM),
                anyLong(), any(), any(), any());
    }

    private void verifyStageCalls(int count) {
        verify(scope, times(count)).complete(any(), any(), any(), any(), any(), anyLong(), any(), any(), any());
    }

    private AiInvocationResult<AiProviderResponse> response(String content, String finish) {
        return new AiInvocationResult<>(new AiProviderResponse(content, 200L, 20L, finish), null);
    }
}
