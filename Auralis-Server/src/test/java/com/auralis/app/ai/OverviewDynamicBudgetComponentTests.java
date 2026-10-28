package com.auralis.app.ai;

import com.auralis.app.shared.error.DomainException;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.ObjectMapper;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.OptionalInt;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class OverviewDynamicBudgetComponentTests {

    @Test
    void reportsSafeParserCategoryAndHashesTheExactNormalizedJson() throws Exception {
        OverviewDocumentValidator validator = new OverviewDocumentValidator(new ObjectMapper());
        String malformed = "{\"title\":\"secret-json-marker\",\"schemaVersion\":1,\"x\":@}";
        String fenced = "```json\n" + malformed + "\n```";
        OverviewDocumentValidator.ValidationDiagnostic plain = diagnosticFor(validator, malformed);
        OverviewDocumentValidator.ValidationDiagnostic wrapped = diagnosticFor(validator, fenced);

        assertThat(plain.parserCategory()).isEqualTo(OverviewDocumentValidator.ParserCategory.UNEXPECTED_CHAR);
        assertThat(wrapped.parserCategory()).isEqualTo(OverviewDocumentValidator.ParserCategory.UNEXPECTED_CHAR);
        assertThat(plain.wrapper()).isEqualTo(OverviewDocumentValidator.WrapperKind.PLAIN);
        assertThat(wrapped.wrapper()).isEqualTo(OverviewDocumentValidator.WrapperKind.FENCED);
        assertThat(plain.responseSha256()).isEqualTo(sha256(malformed));
        assertThat(plain.parseSha256()).isEqualTo(sha256(malformed));
        assertThat(wrapped.responseSha256()).isEqualTo(sha256(fenced));
        assertThat(wrapped.parseSha256()).isEqualTo(sha256(malformed));
        assertThat(wrapped.responseChars()).isEqualTo(fenced.length());
        assertThat(wrapped.parseChars()).isEqualTo(malformed.length());
        assertThat(wrapped.charOffset()).isBetween(0L, (long) malformed.length());
        assertThat(wrapped.offsetCharacterClass()).isNotEqualTo(OverviewDocumentValidator.OffsetCharacterClass.UNKNOWN);
        assertThat(wrapped.toString()).doesNotContain("secret-json-marker");
    }

    @Test
    void distinguishesControlCharactersAndInvalidEscapes() {
        OverviewDocumentValidator validator = new OverviewDocumentValidator(new ObjectMapper());
        String controlCharacter = "{\"title\":\"secret-control-marker\na\"}";
        String invalidEscape = "{\"title\":\"\\q\"}";
        OverviewDocumentValidator.ValidationDiagnostic control = diagnosticFor(validator, controlCharacter);
        OverviewDocumentValidator.ValidationDiagnostic escape = diagnosticFor(validator, invalidEscape);

        assertThat(control.parserCategory()).isEqualTo(OverviewDocumentValidator.ParserCategory.CONTROL_CHAR);
        assertThat(escape.parserCategory()).isEqualTo(OverviewDocumentValidator.ParserCategory.INVALID_ESCAPE);
        for (OverviewDocumentValidator.ValidationDiagnostic diagnostic : List.of(control, escape)) {
            assertThat(diagnostic.responseSha256()).matches("[0-9a-f]{64}");
            assertThat(diagnostic.parseSha256()).matches("[0-9a-f]{64}");
            assertThat(diagnostic.toString()).doesNotContain("secret-control-marker", "\\q");
        }
    }

    @Test
    void diagnosticCallbackFailureDoesNotReplaceValidationError() {
        OverviewDocumentValidator validator = new OverviewDocumentValidator(new ObjectMapper());
        assertThatThrownBy(() -> validator.validateProviderDocument(
                "{\"title\":\"secret\",\"x\":@}", Map.of(),
                diagnostic -> { throw new IllegalStateException("diagnostic-secret-marker"); }))
                .isInstanceOf(DomainException.class)
                .extracting(error -> ((DomainException) error).code()).isEqualTo("VALIDATION_FAILED");
    }

    private OverviewDocumentValidator.ValidationDiagnostic diagnosticFor(
            OverviewDocumentValidator validator, String response) {
        List<OverviewDocumentValidator.ValidationDiagnostic> diagnostics = new ArrayList<>();
        assertThatThrownBy(() -> validator.validateProviderDocument(response, Map.of(), diagnostics::add))
                .isInstanceOf(DomainException.class)
                .extracting(error -> ((DomainException) error).code()).isEqualTo("VALIDATION_FAILED");
        assertThat(diagnostics).hasSize(1);
        return diagnostics.get(0);
    }

    private String sha256(String value) throws Exception {
        return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                .digest(value.getBytes(StandardCharsets.UTF_8)));
    }

    @Test
    void validatorReportsFixedFenceAndObjectShapeReasonsWithoutChangingErrorCode() {
        OverviewDocumentValidator validator = new OverviewDocumentValidator(new ObjectMapper());
        List<OverviewDocumentValidator.ValidationDiagnostic> diagnostics = new ArrayList<>();

        assertThatThrownBy(() -> validator.validateProviderDocument(
                "```xml\nsecret-fence-marker\n```", Map.of(), diagnostics::add))
                .isInstanceOf(DomainException.class)
                .extracting(error -> ((DomainException) error).code()).isEqualTo("VALIDATION_FAILED");
        assertThat(diagnostics).singleElement().satisfies(diagnostic -> {
            assertThat(diagnostic.reason()).isEqualTo(OverviewDocumentValidator.ValidationReason.INVALID_FENCE_LANGUAGE);
            assertThat(diagnostic.exceptionType()).isEqualTo("none");
            assertThat(diagnostic.line()).isEqualTo(-1);
            assertThat(diagnostic.column()).isEqualTo(-1);
            assertThat(diagnostic.charOffset()).isEqualTo(-1);
        });

        diagnostics.clear();
        assertThatThrownBy(() -> validator.validateProviderDocument(
                "prefix secret-shape-marker {}", Map.of(), diagnostics::add))
                .isInstanceOf(DomainException.class)
                .extracting(error -> ((DomainException) error).code()).isEqualTo("VALIDATION_FAILED");
        assertThat(diagnostics).singleElement().satisfies(diagnostic ->
                assertThat(diagnostic.reason()).isEqualTo(OverviewDocumentValidator.ValidationReason.NOT_JSON_OBJECT));
    }

    @Test
    void validProviderDocumentDoesNotEmitFailureDiagnostic() {
        OverviewDocumentValidator validator = new OverviewDocumentValidator(new ObjectMapper());
        List<OverviewDocumentValidator.ValidationDiagnostic> diagnostics = new ArrayList<>();
        String document = "{\"schemaVersion\":1,\"title\":\"Title\",\"outline\":null,"
                + "\"summary\":{\"overview\":\"Summary\",\"keyPoints\":[],\"learningPath\":[]}}";

        var parsed = validator.validateProviderDocument(document, Map.of(), diagnostics::add);

        assertThat(parsed.title()).isEqualTo("Title");
        assertThat(diagnostics).isEmpty();
    }

    @Test
    void contentStatsEstimateUtf8BytesAndLeavePageCountUnknown() {
        OverviewContentStats stats = OverviewContentStats.fromTexts(
                List.of("标题\n正文🙂", "Chapter 2: Summary\nRésumé"), 2, "revision-1");

        assertThat(stats.sourceCount()).isEqualTo(2);
        assertThat(stats.sectionCount()).isEqualTo(2);
        assertThat(stats.estimatedEffectiveTokens()).isEqualTo(stats.effectiveUtf8Bytes());
        assertThat(stats.estimateKind()).isEqualTo(OverviewContentStats.EstimateKind.UTF8_BYTE_UPPER_ESTIMATE);
        assertThat(stats.pageCount()).isEqualTo(OptionalInt.empty());
        assertThat(stats.contentRevision()).isEqualTo("revision-1");
        assertThat(stats.sectionCountKind()).isEqualTo(OverviewContentStats.SectionCountKind.TEXT_FRAGMENT_HEURISTIC);
    }

    @Test
    void explicitStructureSectionCountOverridesSerializedTextHeuristic() {
        OverviewContentStats stats = OverviewContentStats.fromTexts(
                List.of("{\"outline\":[{\"title\":\"A\"},{\"title\":\"B\"}]}", "summary"),
                1, 7, "structured-revision");

        assertThat(stats.sectionCount()).isEqualTo(7);
        assertThat(stats.sectionCountKind())
                .isEqualTo(OverviewContentStats.SectionCountKind.EXPLICIT_STRUCTURE_METADATA);
        assertThat(stats.estimatedEffectiveTokens()).isPositive();
        assertThatThrownBy(() -> OverviewContentStats.fromTexts(List.of("x"), 1, -1, "bad"))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void repeatedBoundaryHeaderAndOcrSymbolNoiseAreRemovedOnlyFromStats() {
        List<String> fragments = List.of(
                "AURALIS ARCHIVE\n第一章 概念\n正文甲\nAURALIS ARCHIVE\n••••••",
                "AURALIS ARCHIVE\n第二章 方法\n正文乙\n••••••",
                "AURALIS ARCHIVE\n第三章 应用\n正文丙\n••••••");

        OverviewContentStats stats = OverviewContentStats.fromTexts(fragments, 3, "r");

        assertThat(stats.rawUtf8Bytes()).isGreaterThan(stats.effectiveUtf8Bytes());
        assertThat(stats.sectionCount()).isEqualTo(3);
        assertThat(stats.effectiveUtf8Bytes()).isGreaterThanOrEqualTo(
                "AURALIS ARCHIVE".getBytes(java.nio.charset.StandardCharsets.UTF_8).length);
        assertThat(fragments.getFirst()).startsWith("AURALIS ARCHIVE");
    }

    @Test
    void largeRepeatedOcrBoundaryNoiseOnlyReducesStatsWithoutChangingSourceFragments() {
        List<String> fragments = new ArrayList<>(1_000);
        long expectedEffectiveBytes = 0;
        long expectedRawBytes = 0;
        for (int index = 0; index < 1_000; index++) {
            String heading = "Chapter " + (index + 1) + ": Concept";
            String body = "Distinct theorem content for source fragment " + index;
            String fragment = "AURALIS ARCHIVE\n" + heading + "\n" + body
                    + "\n••••••\n※※※※\nAURALIS ARCHIVE FOOTER";
            fragments.add(fragment);
            expectedEffectiveBytes += heading.getBytes(StandardCharsets.UTF_8).length + 1L
                    + body.getBytes(StandardCharsets.UTF_8).length + 1L;
            expectedRawBytes += fragment.getBytes(StandardCharsets.UTF_8).length;
        }
        List<String> originalFragments = List.copyOf(fragments);

        OverviewContentStats stats = OverviewContentStats.fromTexts(fragments, fragments.size(), "large-ocr");

        assertThat(fragments).containsExactlyElementsOf(originalFragments);
        assertThat(stats.sourceCount()).isEqualTo(1_000);
        assertThat(stats.sectionCount()).isEqualTo(1_000);
        assertThat(stats.rawUtf8Bytes()).isEqualTo(expectedRawBytes);
        assertThat(stats.effectiveUtf8Bytes()).isEqualTo(expectedEffectiveBytes);
        assertThat(stats.effectiveUtf8Bytes()).isPositive().isLessThan(stats.rawUtf8Bytes());
        assertThat(stats.estimatedEffectiveTokens()).isEqualTo(stats.effectiveUtf8Bytes());
    }

    @Test
    void emptyAndInvalidSourceCountsAreHandledExplicitly() {
        OverviewContentStats empty = OverviewContentStats.fromTexts(
                java.util.Arrays.asList("", "  ", null), 0, "empty");
        assertThat(empty.estimatedEffectiveTokens()).isZero();
        assertThat(empty.sectionCount()).isZero();
        assertThat(empty.pageCount()).isEmpty();
        assertThat(empty.sourceCount()).isZero();

        assertThatThrownBy(() -> OverviewContentStats.fromTexts(List.of("x"), -1, "bad"))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void outputPlanningGrowsWithMaterialWithoutAStaticTokenOrGroupCeiling() {
        OverviewContentStats shortInput = stats("x".repeat(64), 1);
        OverviewContentStats mediumInput = stats("x".repeat(20_000), 3);
        OverviewContentStats longInput = stats("x".repeat(2_000_000), 12);
        OverviewContentStats hugeInput = stats("x".repeat(2_000_000), 100);

        OverviewBudgetPlanner.ContentPlan shortPlan = OverviewBudgetPlanner.planContent(
                shortInput, OverviewBudgetPlanner.OutputStage.INTERMEDIATE);
        OverviewBudgetPlanner.ContentPlan mediumPlan = OverviewBudgetPlanner.planContent(
                mediumInput, OverviewBudgetPlanner.OutputStage.INTERMEDIATE);
        OverviewBudgetPlanner.ContentPlan longPlan = OverviewBudgetPlanner.planContent(
                longInput, OverviewBudgetPlanner.OutputStage.INTERMEDIATE);
        OverviewBudgetPlanner.ContentPlan hugePlan = OverviewBudgetPlanner.planContent(
                hugeInput, OverviewBudgetPlanner.OutputStage.INTERMEDIATE);

        assertThat(shortPlan.targetOutputTokens()).isLessThan(mediumPlan.targetOutputTokens());
        assertThat(mediumPlan.targetOutputTokens()).isLessThan(longPlan.targetOutputTokens());
        assertThat(longPlan.targetOutputTokens()).isGreaterThan(6_144);
        assertThat(longPlan.targetOutputTokens()).isEqualTo(longInput.effectiveUtf8Bytes() + 256 + 12 * 32 + 64);
        assertThat(hugePlan.targetOutputTokens()).isGreaterThan(longPlan.targetOutputTokens());
        assertThat(hugePlan.targetOutputTokens()).isEqualTo(hugeInput.effectiveUtf8Bytes() + 256 + 100 * 32 + 64);
        assertThat(longPlan.suggestedMapGroups()).isGreaterThanOrEqualTo(12);
        assertThat(hugePlan.suggestedMapGroups()).isEqualTo(100);

        OverviewBudgetPlanner.ContentPlan finalPlan = OverviewBudgetPlanner.planContent(
                longInput, OverviewBudgetPlanner.OutputStage.FINAL);
        assertThat(finalPlan.targetOutputTokens()).isEqualTo(longPlan.targetOutputTokens());
    }

    @Test
    void linearOutputDemandUsesWholeRequestBytesAndHasNoImplicitOutputCeiling() {
        long small = OverviewBudgetPlanner.planOutputTokens(2_048, 1, 1,
                OverviewBudgetPlanner.OutputStage.INTERMEDIATE);
        long large = OverviewBudgetPlanner.planOutputTokens(100 * 1_024L, 100, 20,
                OverviewBudgetPlanner.OutputStage.INTERMEDIATE);

        assertThat(small).isEqualTo(2_400);
        assertThat(large).isEqualTo(100 * 1_024L + 256 + 100 * 32L + 20 * 64L);
        assertThat(large).isGreaterThan(6_144);
        assertThat(OverviewBudgetPlanner.planOutputTokens(100 * 1_024L, 100, 20,
                OverviewBudgetPlanner.OutputStage.FINAL)).isEqualTo(large);
    }

    @Test
    void onlyExactOfficialOpenAiEndpointAndModelReceiveKnownCapabilities() {
        OverviewModelBudget known = OverviewModelBudget.resolve(
                AiProviderType.OPENAI_COMPATIBLE, "https://api.openai.com/v1", "gpt-4o-mini");
        OverviewModelBudget customEndpoint = OverviewModelBudget.resolve(
                AiProviderType.OPENAI_COMPATIBLE, "https://gateway.example/v1", "gpt-4o-mini");
        OverviewModelBudget sameNameOtherProvider = OverviewModelBudget.resolve(
                AiProviderType.SILICONFLOW, "https://api.siliconflow.cn/v1", "gpt-4o-mini");
        OverviewModelBudget wrongScheme = OverviewModelBudget.resolve(
                AiProviderType.OPENAI_COMPATIBLE, "http://api.openai.com/v1", "gpt-4o-mini");

        assertThat(known.isTrusted()).isTrue();
        assertThat(known.contextWindowTokens()).hasValue(128_000);
        assertThat(known.maxOutputTokens()).hasValue(16_384);
        assertThat(customEndpoint.isTrusted()).isFalse();
        assertThat(customEndpoint.contextWindowTokens()).isEmpty();
        assertThat(sameNameOtherProvider.isTrusted()).isFalse();
        assertThat(wrongScheme.isTrusted()).isFalse();
    }

    @Test
    void onlyExactOfficialDeepseekFlashEndpointAndModelReceiveKnownCapabilities() {
        OverviewModelBudget rootEndpoint = OverviewModelBudget.resolve(
                AiProviderType.DEEPSEEK, "https://api.deepseek.com", "deepseek-v4-flash");
        OverviewModelBudget slashEndpoint = OverviewModelBudget.resolve(
                AiProviderType.DEEPSEEK, "https://api.deepseek.com/", "deepseek-v4-flash");
        OverviewModelBudget versionPath = OverviewModelBudget.resolve(
                AiProviderType.DEEPSEEK, "https://api.deepseek.com/v1", "deepseek-v4-flash");
        OverviewModelBudget customEndpoint = OverviewModelBudget.resolve(
                AiProviderType.DEEPSEEK, "https://gateway.example", "deepseek-v4-flash");
        OverviewModelBudget wrongModel = OverviewModelBudget.resolve(
                AiProviderType.DEEPSEEK, "https://api.deepseek.com", "deepseek-v4-flash-preview");
        OverviewModelBudget unsafeEndpoint = OverviewModelBudget.resolve(
                AiProviderType.DEEPSEEK, "https://user@api.deepseek.com:444?x=1", "deepseek-v4-flash");

        assertThat(rootEndpoint.isTrusted()).isTrue();
        assertThat(rootEndpoint.contextWindowTokens()).hasValue(1_000_000);
        assertThat(rootEndpoint.maxOutputTokens()).hasValue(384_000);
        assertThat(slashEndpoint.isTrusted()).isTrue();
        assertThat(versionPath.isTrusted()).isFalse();
        assertThat(customEndpoint.isTrusted()).isFalse();
        assertThat(wrongModel.isTrusted()).isFalse();
        assertThat(unsafeEndpoint.isTrusted()).isFalse();
    }

    @Test
    void requestAssessmentUsesCompletePromptUtf8UpperBoundAndReportsUnknownCapability() {
        String system = "SYSTEM🙂";
        String user = "正文\u00e9";
        OverviewModelBudget unknown = OverviewModelBudget.unknown(
                AiProviderType.OPENAI_COMPATIBLE, "https://custom.example/v1", "gpt-4o-mini");

        OverviewBudgetPlanner.RequestAssessment assessment = OverviewBudgetPlanner.assessRequest(
                system, user, unknown, OverviewBudgetPlanner.OutputStage.INTERMEDIATE,
                24, 524_288);

        long promptBytes = system.getBytes(java.nio.charset.StandardCharsets.UTF_8).length
                + user.getBytes(java.nio.charset.StandardCharsets.UTF_8).length;
        assertThat(assessment.estimatedInputTokens()).isEqualTo(promptBytes
                + OverviewBudgetPlanner.MESSAGE_FRAMING_UPPER_BOUND_TOKENS);
        assertThat(assessment.outputTokenReserve()).isEqualTo(OverviewBudgetPlanner.planOutputTokens(
                promptBytes, 1, 1, OverviewBudgetPlanner.OutputStage.INTERMEDIATE));
        assertThat(assessment.eligibility()).isEqualTo(OverviewBudgetPlanner.Eligibility.UNKNOWN_CAPABILITY);
        assertThat(assessment.contextFit()).isEmpty();
        assertThat(assessment.taskBudgetFit()).isTrue();
        assertThat(assessment.callBudgetFit()).isTrue();
    }

    @Test
    void knownContextAssessmentAcceptsExactBoundaryAndRejectsOneTokenOver() {
        OverviewModelBudget known = OverviewModelBudget.resolve(
                AiProviderType.OPENAI_COMPATIBLE, "https://api.openai.com/v1", "gpt-4o-mini");
        int outputReserve = 6_144;
        long fittingPromptBytes = known.contextWindowTokens().orElseThrow()
                - outputReserve - known.contextSafetyMarginTokens()
                - OverviewBudgetPlanner.MESSAGE_FRAMING_UPPER_BOUND_TOKENS;
        String fittingUser = "x".repeat(Math.toIntExact(fittingPromptBytes));

        OverviewBudgetPlanner.RequestAssessment exact = OverviewBudgetPlanner.assessRequest(
                "", fittingUser, known, OverviewBudgetPlanner.OutputStage.FINAL, 24, 524_288, outputReserve);
        OverviewBudgetPlanner.RequestAssessment over = OverviewBudgetPlanner.assessRequest(
                "", fittingUser + "x", known, OverviewBudgetPlanner.OutputStage.FINAL, 24, 524_288, outputReserve);

        assertThat(exact.contextFit()).hasValue(true);
        assertThat(exact.eligibility()).isEqualTo(OverviewBudgetPlanner.Eligibility.ELIGIBLE);
        assertThat(over.contextFit()).hasValue(false);
        assertThat(over.eligibility()).isEqualTo(OverviewBudgetPlanner.Eligibility.EXCEEDS_KNOWN_CONTEXT);
    }

    @Test
    void exhaustedCallsAndTaskTokensAreReportedWithoutArithmeticOverflow() {
        OverviewModelBudget unknown = OverviewModelBudget.unknown(
                AiProviderType.DEEPSEEK, "https://api.deepseek.com", "deepseek-chat");

        OverviewBudgetPlanner.RequestAssessment noCalls = OverviewBudgetPlanner.assessRequest(
                "s", "u", unknown, OverviewBudgetPlanner.OutputStage.FINAL, 0, Long.MAX_VALUE);
        OverviewBudgetPlanner.RequestAssessment noTokens = OverviewBudgetPlanner.assessRequest(
                "s", "u", unknown, OverviewBudgetPlanner.OutputStage.FINAL, Integer.MAX_VALUE, 1);
        OverviewBudgetPlanner.RequestAssessment largeRemaining = OverviewBudgetPlanner.assessRequest(
                "s", "u", unknown, OverviewBudgetPlanner.OutputStage.FINAL, Integer.MAX_VALUE, Long.MAX_VALUE);

        assertThat(noCalls.callBudgetFit()).isFalse();
        assertThat(noTokens.taskBudgetFit()).isFalse();
        assertThat(largeRemaining.reservedTaskTokens()).isPositive();
        assertThat(largeRemaining.reservedTaskTokens()).isLessThan(Long.MAX_VALUE);
    }

    private OverviewContentStats stats(String text, int sources) {
        return OverviewContentStats.fromTexts(List.of(text), sources, "revision");
    }

    private static org.assertj.core.api.AbstractThrowableAssert<?, ? extends Throwable> assertThatThrownBy(
            org.assertj.core.api.ThrowableAssert.ThrowingCallable callable) {
        return org.assertj.core.api.Assertions.assertThatThrownBy(callable);
    }
}
