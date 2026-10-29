package com.auralis.app.ai.usage;

import java.util.Map;
import java.util.Set;

/** Immutable operation contract separating platform quota from all-origin protocol limits. */
public record AiOperationPolicy(AiOperationKind kind, AiFeature feature,
                                int platformMaxCalls, long platformTaskTokens,
                                Map<AiStage, StageRule> stages, int allOriginMaxCalls) {
    public AiOperationPolicy(AiOperationKind kind, AiFeature feature, int platformMaxCalls,
                             long platformTaskTokens, Map<AiStage, StageRule> stages) {
        this(kind, feature, platformMaxCalls, platformTaskTokens, stages, 0);
    }

    public AiOperationPolicy {
        stages = Map.copyOf(stages);
    }

    public record StageRule(Set<AiInvocationMethod> methods, Set<AiOutputRole> outputRoles,
                            Integer allOriginMaxCalls, Integer platformMaxCalls) {
        public StageRule {
            methods = Set.copyOf(methods);
            outputRoles = Set.copyOf(outputRoles);
        }
    }
}
