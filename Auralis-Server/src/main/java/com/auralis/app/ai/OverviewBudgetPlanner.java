package com.auralis.app.ai;

import com.auralis.app.ai.usage.AiInputTokenEstimator;

/** Plans Overview output for one stage. Final quota admission remains with AiUsageGuard. */
final class OverviewBudgetPlanner {
    private OverviewBudgetPlanner() {
    }

    static long minimumOutputTokens(OverviewMarkdownPipeline.Stage stage, int materialSize) {
        return switch (stage) {
            // Exclusion JSON grows with the number of separate ranges, not the bytes of each line.
            case CLEAN, CLEAN_BATCH -> 256 + 64 * Math.ceilDiv((long) materialSize, 32);
            case OUTLINE -> 512 + 256 * Math.ceilDiv((long) materialSize, 2_000);
            case OUTLINE_MAP, OUTLINE_MERGE -> Math.min(4096, 768 + 256 * Math.ceilDiv((long) materialSize, 4_000));
            case SUMMARY_MAP -> Math.min(4096, 1024 + 256 * Math.ceilDiv((long) materialSize, 4_000));
            // The caller bounds the material size by the summary's target length.
            case SUMMARY -> 512 + 2L * materialSize;
            case SUMMARY_MERGE -> Math.min(6144, 1024 + materialSize / 2L);
        };
    }

    static StagePlan planStage(AiProviderRequest request, OverviewModelBudget model,
                               long minimumOutput, long configuredOutputCap) {
        long estimatedInput = AiInputTokenEstimator.estimateOverview(request).inputTokens();
        long targetOutput = minimumOutput + Math.ceilDiv(minimumOutput, 2);
        long contextHeadroom = model.contextWindowTokens().orElseThrow()
                - model.contextSafetyMarginTokens() - estimatedInput;
        long modelOutput = model.maxOutputTokens().orElseThrow();
        long outputCap = configuredOutputCap > 0 ? Math.min(configuredOutputCap, modelOutput) : modelOutput;
        long plannedOutput = Math.min(Integer.MAX_VALUE, Math.min(targetOutput, Math.min(contextHeadroom, outputCap)));
        return new StagePlan(estimatedInput, Math.max(0, plannedOutput));
    }

    record StagePlan(long estimatedInputTokens, long outputTokens) { }
}
