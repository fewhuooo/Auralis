package com.auralis.app.ai.usage;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class AiFeaturePolicyParityTests {
    @Test
    void everyRegisteredKindHasOneMatchingFeatureAndAtLeastOneStage() {
        var resolver = new AiOperationPolicyResolver(AiOperationPolicyTests.limits());
        for (AiOperationKind kind : AiOperationKind.values()) {
            var policy = resolver.resolve(kind);
            assertThat(policy.kind()).isEqualTo(kind);
            assertThat(policy.feature()).isNotNull();
            assertThat(policy.stages()).isNotEmpty();
            if (kind == AiOperationKind.SOURCE_OVERVIEW || kind == AiOperationKind.SUBJECT_OVERVIEW) {
                assertThat(policy.platformMaxCalls()).isZero();
            } else if (kind == AiOperationKind.CHAT_AGENT_TURN) {
                // Chat Agent call caps are configured independently for each stage.
                assertThat(policy.platformMaxCalls()).isZero();
            } else {
                assertThat(policy.platformMaxCalls()).isPositive();
            }
            assertThat(policy.platformTaskTokens()).isPositive();
        }
    }
}
