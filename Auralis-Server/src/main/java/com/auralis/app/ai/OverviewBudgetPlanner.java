package com.auralis.app.ai;

import com.auralis.app.ai.usage.AiInputTokenEstimator;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Optional;

/** Pure Overview budget planning utilities; final authorization remains with AiUsageGuard. */
public final class OverviewBudgetPlanner {
    /** Gateway reserves four framing tokens per message; Overview sends a system and user message. */
    public static final long MESSAGE_FRAMING_UPPER_BOUND_TOKENS = 8;
    private static final long ITEM_OUTPUT_OVERHEAD_TOKENS = 32;
    private static final long SECTION_OUTPUT_OVERHEAD_TOKENS = 64;
    private static final long STRUCTURAL_OUTPUT_OVERHEAD_TOKENS = 256;

    public enum OutputStage {
        INTERMEDIATE,
        FINAL
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

    public record RequestAssessment(long estimatedInputTokens,
                                   long outputTokenReserve,
                                   long reservedTaskTokens,
                                   Optional<Boolean> contextFit,
                                   boolean taskBudgetFit,
                                   boolean callBudgetFit,
                                   Eligibility eligibility,
                                   String reason,
                                   String estimatorProfile,
                                   String estimateStrategy,
                                   int categoryMessages,
                                   int byteMessages) {
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
        long target = planOutputTokens(bytes, stats.sourceCount(), stats.sectionCount(), stage);
        int groups = Math.max(1, stats.sourceCount());
        return new ContentPlan(target, groups);
    }

    /** Material-dependent output demand estimate for one exact request, before model/context caps. */
    public static long planOutputTokens(long serializedInputBytes, int sourceCount, int sectionCount,
                                        OutputStage stage) {
        if (serializedInputBytes < 0 || sourceCount < 0 || sectionCount < 0 || stage == null) {
            throw new IllegalArgumentException("request size, structure counts and stage are required");
        }
        long itemOverhead = saturatedMultiply(ITEM_OUTPUT_OVERHEAD_TOKENS, sourceCount);
        long sectionOverhead = saturatedMultiply(SECTION_OUTPUT_OVERHEAD_TOKENS, sectionCount);
        return saturatedAdd(serializedInputBytes,
                saturatedAdd(STRUCTURAL_OUTPUT_OVERHEAD_TOKENS, saturatedAdd(itemOverhead, sectionOverhead)));
    }

    /** Evaluates a complete candidate system/user prompt without mutating or rejecting the request. */
    public static RequestAssessment assessRequest(String systemText, String userText,
                                                   OverviewModelBudget modelBudget,
                                                   OutputStage stage, long remainingCalls,
                                                   long remainingTaskTokens) {
        long estimatedOutput = planOutputTokens(utf8Bytes(systemText) + utf8Bytes(userText), 1, 1, stage);
        if (modelBudget != null && modelBudget.maxOutputTokens().isPresent()) {
            estimatedOutput = Math.min(estimatedOutput, modelBudget.maxOutputTokens().getAsLong());
        }
        return assessRequest(systemText, userText, modelBudget, stage, remainingCalls,
                remainingTaskTokens, (int) Math.min(Integer.MAX_VALUE, estimatedOutput));
    }

    /** Evaluates with the exact per-call output cap that will be sent through the Gateway. */
    public static RequestAssessment assessRequest(String systemText, String userText,
                                                   OverviewModelBudget modelBudget,
                                                   OutputStage stage, long remainingCalls,
                                                   long remainingTaskTokens, int outputTokenBudget) {
        return assessRequest(systemText, userText, modelBudget, stage, remainingCalls,
                remainingTaskTokens, outputTokenBudget, AiInputTokenEstimator.legacyProfile());
    }

    /** Evaluates with the same resolved estimator profile used for Gateway reservation. */
    public static RequestAssessment assessRequest(String systemText, String userText,
                                                   OverviewModelBudget modelBudget,
                                                   OutputStage stage, long remainingCalls,
                                                   long remainingTaskTokens, int outputTokenBudget,
                                                   AiInputTokenEstimator.Profile inputEstimator) {
        if (modelBudget == null || stage == null) {
            throw new IllegalArgumentException("modelBudget and stage are required");
        }
        if (inputEstimator == null) throw new IllegalArgumentException("inputEstimator is required");
        if (outputTokenBudget < 1 || (modelBudget.maxOutputTokens().isPresent()
                && outputTokenBudget > modelBudget.maxOutputTokens().getAsLong())) {
            throw new IllegalArgumentException("outputTokenBudget must fit the resolved model capability");
        }
        AiInputTokenEstimator.Estimate inputEstimate = inputEstimator.estimate(List.of(
                new AiProviderRequest.Message(AiMessageRole.SYSTEM, systemText == null ? "" : systemText),
                new AiProviderRequest.Message(AiMessageRole.USER, userText == null ? "" : userText)));
        long estimatedInput = inputEstimate.inputTokens();
        long outputReserve = outputTokenBudget;
        long reservedTask = saturatedAdd(estimatedInput, outputReserve);
        boolean callsFit = remainingCalls > 0;
        boolean taskFits = remainingTaskTokens >= reservedTask;
        Optional<Boolean> contextFit = modelBudget.contextWindowTokens().isPresent()
                ? Optional.of(saturatedAdd(reservedTask, modelBudget.contextSafetyMarginTokens())
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
                taskFits, callsFit, eligibility, reason, inputEstimate.profileIdentity(),
                inputEstimate.strategy(), inputEstimate.categoryMessages(), inputEstimate.byteMessages());
    }

    private static long utf8Bytes(String value) {
        return value == null ? 0 : value.getBytes(StandardCharsets.UTF_8).length;
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
