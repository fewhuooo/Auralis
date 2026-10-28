package com.auralis.app.ai.usage;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class AiOperationPolicyTests {
    private static final AiOperationPolicyResolver POLICIES = new AiOperationPolicyResolver(limits());

    @Test
    void syntheticLearningKindsHaveBoundedMethodAndStageContracts() {
        AiOperationPolicy turn = POLICIES.resolve(AiOperationKind.LEARNING_TURN);
        assertThat(turn.platformMaxCalls()).isEqualTo(2);
        assertThat(turn.stages().get(AiStage.RETRIEVAL_EMBEDDING).allOriginMaxCalls()).isEqualTo(1);
        assertThat(turn.stages().get(AiStage.CHAT_COMPLETION).allOriginMaxCalls()).isEqualTo(1);
        AiOperationPolicy draft = POLICIES.resolve(AiOperationKind.LEARNING_DRAFT);
        assertThat(draft.platformMaxCalls()).isEqualTo(1);
        assertThat(draft.stages()).containsOnlyKeys(AiStage.CHAT_COMPLETION);
    }

    @Test
    void stageMethodAndOutputRoleMismatchFailsBeforeReservation() {
        AiTaskContext learning = new AiTaskContext(java.util.UUID.randomUUID(), AiFeature.CHAT,
                "synthetic-learning", null, AiOperationKind.LEARNING_DRAFT);
        assertThatThrownBy(() -> POLICIES.require(learning, AiStage.RETRIEVAL_EMBEDDING,
                AiInvocationMethod.EMBED, AiOutputRole.GENERAL)).isInstanceOf(AiPolicyContractException.class);
        AiTaskContext overview = new AiTaskContext(java.util.UUID.randomUUID(), AiFeature.SOURCE_OVERVIEW, "overview");
        assertThatThrownBy(() -> POLICIES.require(overview, AiStage.OVERVIEW_MAP,
                AiInvocationMethod.COMPLETE, AiOutputRole.GENERAL)).isInstanceOf(AiPolicyContractException.class);
    }

    @Test
    void platformPoliciesKeepConfiguredQuotaAndFeatureMapping() {
        assertThat(POLICIES.resolve(AiOperationKind.CHAT_TURN).platformTaskTokens()).isEqualTo(524_288);
        assertThat(POLICIES.resolve(AiOperationKind.INGESTION_EMBEDDING).platformMaxCalls()).isEqualTo(512);
        assertThat(POLICIES.resolve(AiOperationKind.SOURCE_OVERVIEW).feature()).isEqualTo(AiFeature.SOURCE_OVERVIEW);
        assertThat(POLICIES.resolve(AiOperationKind.SUBJECT_OVERVIEW).feature()).isEqualTo(AiFeature.SUBJECT_OVERVIEW);
    }

    @Test
    void overviewStageCallLimitDefaultsToUnlimitedAndRespectsExplicitConfiguration() {
        for (AiOperationKind kind : java.util.List.of(
                AiOperationKind.SOURCE_OVERVIEW, AiOperationKind.SUBJECT_OVERVIEW)) {
            AiOperationPolicy policy = POLICIES.resolve(kind);
            assertThat(policy.platformMaxCalls()).isZero();
            assertThat(policy.stages().get(AiStage.OVERVIEW_MAP).platformMaxCalls()).isNull();
            assertThat(policy.stages().get(AiStage.OVERVIEW_REDUCE).platformMaxCalls()).isNull();
        }
        AiOperationPolicyResolver expandedPolicies = new AiOperationPolicyResolver(limits(64));
        assertOverviewCaps(expandedPolicies, 64);

        assertThat(expandedPolicies.resolve(AiOperationKind.CHAT_TURN).platformMaxCalls()).isEqualTo(2);
        assertThat(expandedPolicies.resolve(AiOperationKind.INGESTION_EMBEDDING).platformMaxCalls()).isEqualTo(512);
        assertThat(expandedPolicies.resolve(AiOperationKind.PROVIDER_SETUP).platformMaxCalls()).isEqualTo(2);
        assertThat(expandedPolicies.resolve(AiOperationKind.SOURCE_OVERVIEW).platformTaskTokens()).isEqualTo(524_288);
        assertThat(expandedPolicies.resolve(AiOperationKind.SUBJECT_OVERVIEW).platformTaskTokens()).isEqualTo(524_288);
    }

    @Test
    void zeroOverviewCallLimitRemovesOnlyOverviewCallCaps() {
        AiOperationPolicyResolver policies = new AiOperationPolicyResolver(limits(0));
        for (AiOperationKind kind : java.util.List.of(AiOperationKind.SOURCE_OVERVIEW, AiOperationKind.SUBJECT_OVERVIEW)) {
            AiOperationPolicy policy = policies.resolve(kind);
            assertThat(policy.platformMaxCalls()).isZero();
            assertThat(policy.stages().get(AiStage.OVERVIEW_MAP).platformMaxCalls()).isNull();
            assertThat(policy.stages().get(AiStage.OVERVIEW_REDUCE).platformMaxCalls()).isNull();
            assertThat(policy.platformTaskTokens()).isEqualTo(524_288);
        }
        assertThat(policies.resolve(AiOperationKind.CHAT_TURN).platformMaxCalls()).isEqualTo(2);
        assertThat(policies.resolve(AiOperationKind.INGESTION_EMBEDDING).platformMaxCalls()).isEqualTo(512);
    }

    private static void assertOverviewCaps(int expectedCalls) {
        assertOverviewCaps(POLICIES, expectedCalls);
    }

    private static void assertOverviewCaps(AiOperationPolicyResolver policies, int expectedCalls) {
        for (AiOperationKind kind : java.util.List.of(AiOperationKind.SOURCE_OVERVIEW, AiOperationKind.SUBJECT_OVERVIEW)) {
            AiOperationPolicy policy = policies.resolve(kind);
            assertThat(policy.platformMaxCalls()).isEqualTo(expectedCalls);
            assertThat(policy.stages().get(AiStage.OVERVIEW_MAP).platformMaxCalls()).isEqualTo(expectedCalls);
            assertThat(policy.stages().get(AiStage.OVERVIEW_REDUCE).platformMaxCalls()).isEqualTo(expectedCalls);
        }
    }

    static com.auralis.app.shared.config.AuralisProperties.Limits limits() {
        return limits(0);
    }

    static com.auralis.app.shared.config.AuralisProperties.Limits limits(int overviewMaxCalls) {
        return new com.auralis.app.shared.config.AuralisProperties.Limits(4, 2, 1_000_000, 2_000_000,
                2_000_000, 300_000, 10_000, 4096, 2, 524_288, overviewMaxCalls, 524_288,
                512, 16_777_216);
    }
}
