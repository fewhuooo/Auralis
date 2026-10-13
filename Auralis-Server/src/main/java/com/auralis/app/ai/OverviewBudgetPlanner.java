package com.auralis.app.ai;

import java.nio.charset.StandardCharsets;
import java.util.Optional;

/** Pure Overview budget planning utilities; final authorization remains with AiUsageGuard. */
public final class OverviewBudgetPlanner {
    public static final int INTERMEDIATE_MAX_OUTPUT_TOKENS = 4_608;
    public static final int FINAL_MAX_OUTPUT_TOKENS = 6_144;
    public static final long CONTEXT_SAFETY_MARGIN_TOKENS = 8_192;
    public static final long MESSAGE_FRAMING_UPPER_BOUND_TOKENS = 64;
    private static final long CONTENT_SCALE_DIVISOR = 1_024;

    public enum OutputStage {
        INTERMEDIATE(INTERMEDIATE_MAX_OUTPUT_TOKENS),
        FINAL(FINAL_MAX_OUTPUT_TOKENS);

        private final int maxOutputTokens;

        OutputStage(int maxOutputTokens) {
            this.maxOutputTokens = maxOutputTokens;
        }

        public int maxOutputTokens() {
            return maxOutputTokens;
        }
    }

    public enum Eligibility {
        ELIGIBLE,
        UNKNOWN_CAPABILITY,
        EXCEEDS_KNOWN_CONTEXT,
        CALL_BUDGET_EXHAUSTED,
        TASK_BUDGET_EXCEEDED
    }

    public record ContentPlan(long targetOutputTokens, int suggestedMapGroups) {
    }

    public record RequestAssessment(long estimatedInputTokensUpperBound,
                                   long outputTokenReserve,
                                   long reservedTaskTokens,
                                   Optional<Boolean> contextFit,
                                   boolean taskBudgetFit,
                                   boolean callBudgetFit,
                                   Eligibility eligibility,
                                   String reason) {
    }

    private OverviewBudgetPlanner() {
    }

    public static ContentPlan planContent(OverviewContentStats stats, OutputStage stage) {
        if (stats == null || stage == null) {
            throw new IllegalArgumentException("stats and stage are required");
        }
        long bytes = Math.max(0, stats.effectiveUtf8Bytes());
        if (bytes == 0) {
            return new ContentPlan(0, 0);
        }
        long kibibytes = ceilDiv(bytes, CONTENT_SCALE_DIVISOR);
        long contentGrowth = saturatedMultiply(128, integerSqrt(kibibytes));
        long structureGrowth = saturatedMultiply(64, integerSqrt(Math.max(1, stats.sectionCount())));
        long sourceGrowth = saturatedMultiply(48, integerSqrt(Math.max(1, stats.sourceCount())));
        long target = saturatedAdd(256, saturatedAdd(contentGrowth, saturatedAdd(structureGrowth, sourceGrowth)));
        if (stage == OutputStage.FINAL) {
            target = saturatedAdd(target, Math.max(128, target / 4));
        }
        target = Math.min(target, stage.maxOutputTokens());

        int sourceSlots = Math.min(24, Math.max(1, stats.sourceCount()));
        long sizeGroups = ceilDiv(bytes, 32_768);
        long structureGroups = ceilDiv(Math.max(0, stats.sectionCount()), 8);
        int groups = (int) Math.min(24, Math.max(sourceSlots, Math.max(1, Math.max(sizeGroups, structureGroups))));
        return new ContentPlan(target, groups);
    }

    /** Evaluates a complete candidate system/user prompt without mutating or rejecting the request. */
    public static RequestAssessment assessRequest(String systemText, String userText,
                                                   OverviewModelBudget modelBudget,
                                                   OutputStage stage, long remainingCalls,
                                                   long remainingTaskTokens) {
        if (modelBudget == null || stage == null) {
            throw new IllegalArgumentException("modelBudget and stage are required");
        }
        long promptBytes = saturatedAdd(utf8Bytes(systemText), utf8Bytes(userText));
        long estimatedInput = saturatedAdd(promptBytes, MESSAGE_FRAMING_UPPER_BOUND_TOKENS);
        long outputReserve = stage.maxOutputTokens();
        long reservedTask = saturatedAdd(estimatedInput, outputReserve);
        boolean callsFit = remainingCalls > 0;
        boolean taskFits = remainingTaskTokens >= reservedTask;
        Optional<Boolean> contextFit = modelBudget.contextWindowTokens().isPresent()
                ? Optional.of(saturatedAdd(reservedTask, CONTEXT_SAFETY_MARGIN_TOKENS)
                        <= modelBudget.contextWindowTokens().getAsLong())
                : Optional.empty();

        Eligibility eligibility;
        String reason;
        if (!callsFit) {
            eligibility = Eligibility.CALL_BUDGET_EXHAUSTED;
            reason = "No remaining calls in the task budget.";
        } else if (!taskFits) {
            eligibility = Eligibility.TASK_BUDGET_EXCEEDED;
            reason = "Estimated input plus output reserve exceeds remaining task tokens.";
        } else if (contextFit.isPresent() && !contextFit.get()) {
            eligibility = Eligibility.EXCEEDS_KNOWN_CONTEXT;
            reason = "Estimated input, output reserve, and safety margin exceed the verified model context.";
        } else if (contextFit.isEmpty()) {
            eligibility = Eligibility.UNKNOWN_CAPABILITY;
            reason = "Model context is unknown; retain the existing conservative protections.";
        } else {
            eligibility = Eligibility.ELIGIBLE;
            reason = "Estimate fits the verified context and supplied remaining task budgets.";
        }
        return new RequestAssessment(estimatedInput, outputReserve, reservedTask, contextFit,
                taskFits, callsFit, eligibility, reason);
    }

    private static long utf8Bytes(String value) {
        return value == null ? 0 : value.getBytes(StandardCharsets.UTF_8).length;
    }

    private static long ceilDiv(long value, long divisor) {
        if (value <= 0) {
            return 0;
        }
        return 1 + (value - 1) / divisor;
    }

    private static long integerSqrt(long value) {
        if (value <= 0) {
            return 0;
        }
        long estimate = (long) Math.sqrt(value);
        while (estimate < Long.MAX_VALUE && (estimate + 1) <= value / (estimate + 1)) {
            estimate++;
        }
        while (estimate > value / estimate) {
            estimate--;
        }
        return estimate;
    }

    private static long saturatedMultiply(long value, long multiplier) {
        if (value == 0 || multiplier == 0) {
            return 0;
        }
        if (value > Long.MAX_VALUE / multiplier) {
            return Long.MAX_VALUE;
        }
        return value * multiplier;
    }

    private static long saturatedAdd(long left, long right) {
        if (Long.MAX_VALUE - left < right) {
            return Long.MAX_VALUE;
        }
        return left + right;
    }
}
