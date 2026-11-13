package com.auralis.app.ai;

import com.auralis.app.ai.usage.AiCredentialSource;
import com.auralis.app.ai.usage.AiInputTokenEstimator;
import com.auralis.app.shared.config.AuralisProperties;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class OverviewDynamicBudgetComponentTests {

    @Test
    void stageDemandGrowsWithItsOwnMaterialSize() {
        assertThat(OverviewBudgetPlanner.minimumOutputTokens(OverviewMarkdownPipeline.Stage.CLEAN, 32)).isEqualTo(320);
        assertThat(OverviewBudgetPlanner.minimumOutputTokens(OverviewMarkdownPipeline.Stage.CLEAN, 33)).isEqualTo(384);
        assertThat(OverviewBudgetPlanner.minimumOutputTokens(OverviewMarkdownPipeline.Stage.OUTLINE, 2_000)).isEqualTo(768);
        assertThat(OverviewBudgetPlanner.minimumOutputTokens(OverviewMarkdownPipeline.Stage.OUTLINE, 2_001)).isEqualTo(1_024);
        assertThat(OverviewBudgetPlanner.minimumOutputTokens(OverviewMarkdownPipeline.Stage.SUMMARY, 180)).isEqualTo(872);
        assertThat(OverviewBudgetPlanner.minimumOutputTokens(OverviewMarkdownPipeline.Stage.SUMMARY, 1_800)).isEqualTo(4_112);
    }

    @Test
    void estimatedInputStillCountsBothMessagesAndOutputIncludesHeadroom() {
        String system = "SYSTEM🙂";
        String user = "正文é";
        var request = request(system, user, true);
        var plan = OverviewBudgetPlanner.planStage(request, model(128_000, 16_384), 1_025, 0);

        assertThat(plan.estimatedInputTokens()).isEqualTo(AiInputTokenEstimator.estimateOverview(request).inputTokens())
                .isEqualTo(124);
        assertThat(plan.outputTokens()).isEqualTo(1_538);
    }

    @Test
    void modelConfigurationAndRemainingContextLimitTheTarget() {
        var model = model(8_192, 2_048);
        assertThat(OverviewBudgetPlanner.planStage(request("", "x", false), model, 1_600, 0).outputTokens())
                .isEqualTo(2_048);
        assertThat(OverviewBudgetPlanner.planStage(request("", "x", false), model, 1_600, 1_900).outputTokens())
                .isEqualTo(1_900);

        String fittingBody = "x".repeat(8_192 - 2_048 - 80 - 1_600);
        assertThat(OverviewBudgetPlanner.planStage(request("", fittingBody, false), model, 1_600, 0).outputTokens())
                .isEqualTo(1_600);
        assertThat(OverviewBudgetPlanner.planStage(request("", fittingBody + "x", false), model, 1_600, 0).outputTokens())
                .isEqualTo(1_599);
    }

    private AiProviderRequest request(String system, String user, boolean structuredJson) {
        return new AiProviderRequest("fixture", List.of(new AiProviderRequest.Message(AiMessageRole.SYSTEM, system),
                new AiProviderRequest.Message(AiMessageRole.USER, user)), 0.1, null, structuredJson);
    }

    private OverviewModelBudget model(long context, long maxOutput) {
        AuralisProperties.Ai ai = mock(AuralisProperties.Ai.class);
        when(ai.generation()).thenReturn(new AuralisProperties.GenerationEndpoint(
                "https://generation.test/v1", "fixture", "test-key", context, maxOutput));
        return OverviewModelBudget.resolve(AiProviderType.OPENAI_COMPATIBLE, "https://generation.test/v1",
                "fixture", AiCredentialSource.PLATFORM, ai);
    }
}
