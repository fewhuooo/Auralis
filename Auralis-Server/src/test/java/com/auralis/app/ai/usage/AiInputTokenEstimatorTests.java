package com.auralis.app.ai.usage;

import com.auralis.app.ai.AiMessageRole;
import com.auralis.app.ai.AiProviderRequest;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class AiInputTokenEstimatorTests {

    @Test
    void countsCategoryWeightsAndRoundsEachMessageBeforeAddingStructure() {
        var messages = List.of(new AiProviderRequest.Message(AiMessageRole.SYSTEM, "A1 中!"),
                new AiProviderRequest.Message(AiMessageRole.USER, "B"));
        var plain = AiInputTokenEstimator.estimateOverview(request("provider-one-model", messages, false));
        var json = AiInputTokenEstimator.estimateOverview(request("provider-two-model", messages, true));

        assertThat(plain.inputTokens()).isEqualTo(85);
        assertThat(plain.safetyMarginTokens()).isEqualTo(80);
        assertThat(plain.categoryMessages()).isEqualTo(2);
        assertThat(plain.byteMessages()).isZero();
        assertThat(plain.strategy()).isEqualTo("category-only");
        assertThat(json.inputTokens()).isEqualTo(plain.inputTokens() + 32);
        assertThat(json.legacyBytesEstimate()).isEqualTo(plain.legacyBytesEstimate());
        assertThat(AiInputTokenEstimator.estimateOverview(request("provider-two-model", messages, false)))
                .isEqualTo(plain);
    }

    @Test
    void fencedAndStructurallyDenseLinesUseBytesWithoutAffectingAdjacentProse() {
        String literal = "  {\"a\":[1,2]}\r\n"
                + "\u00A0```java\r\n"
                + "literal 中🙂\r\n"
                + "```\r\n";
        var estimate = estimate(literal + "普通 text");

        assertThat(estimate.inputTokens()).isEqualTo(72 + literal.getBytes(StandardCharsets.UTF_8).length + 6);
        assertThat(estimate.categoryMessages()).isEqualTo(1);
        assertThat(estimate.byteMessages()).isEqualTo(1);
        assertThat(estimate.strategy()).isEqualTo("mixed-category-and-bytes");
    }

    @Test
    void longOpaqueRunsAndUnknownUnicodeUseBytesLocally() {
        String opaque = "a".repeat(24) + "==";
        var estimate = estimate("A " + opaque + "👩‍💻️Ж");

        assertThat(estimate.inputTokens()).isEqualTo(72 + 1 + 26 + 4 + 3 + 4 + 3 + 2);
        assertThat(estimate.byteMessages()).isEqualTo(1);
        assertThat(estimate.categoryMessages()).isEqualTo(1);
    }

    @Test
    void rejectsNonOverviewRequestShapeInsteadOfIgnoringAssistantOrToolContent() {
        var assistant = request("fixture", List.of(
                new AiProviderRequest.Message(AiMessageRole.ASSISTANT, "assistant output")), false);

        assertThatThrownBy(() -> AiInputTokenEstimator.estimateOverview(assistant))
                .isInstanceOf(AiPolicyContractException.class);
    }

    private AiInputTokenEstimator.Estimate estimate(String content) {
        return AiInputTokenEstimator.estimateOverview(request("fixture", List.of(
                new AiProviderRequest.Message(AiMessageRole.USER, content)), false));
    }

    private AiProviderRequest request(String model, List<AiProviderRequest.Message> messages, boolean structuredJson) {
        return new AiProviderRequest(model, messages, 0.1, 100, structuredJson);
    }
}
