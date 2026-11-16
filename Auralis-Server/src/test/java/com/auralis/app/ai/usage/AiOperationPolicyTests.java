package com.auralis.app.ai.usage;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class AiOperationPolicyTests {
    private static final AiOperationPolicyResolver POLICIES = new AiOperationPolicyResolver(limits());

    @Test
    void stageMethodAndOutputRoleMismatchFailsBeforeReservation() {
        AiTaskContext text = new AiTaskContext(java.util.UUID.randomUUID(), AiFeature.CHAT,
                "text-generation", null, AiOperationKind.TEXT_GENERATION);
        assertThatThrownBy(() -> POLICIES.require(text, AiStage.RETRIEVAL_EMBEDDING,
                AiInvocationMethod.EMBED, AiOutputRole.GENERAL)).isInstanceOf(AiPolicyContractException.class);
        AiTaskContext overview = new AiTaskContext(java.util.UUID.randomUUID(), AiFeature.SOURCE_OVERVIEW, "overview");
        assertThatThrownBy(() -> POLICIES.require(overview, AiStage.OVERVIEW_MAP,
                AiInvocationMethod.COMPLETE, AiOutputRole.GENERAL)).isInstanceOf(AiPolicyContractException.class);
    }

    @Test
    void platformPoliciesKeepConfiguredQuotaAndFeatureMapping() {
        assertThat(POLICIES.resolve(AiOperationKind.CHAT_AGENT_TURN).platformTaskTokens()).isEqualTo(524_288);
        assertThat(POLICIES.resolve(AiOperationKind.INGESTION_EMBEDDING).platformMaxCalls()).isEqualTo(512);
        assertThat(POLICIES.resolve(AiOperationKind.SOURCE_OVERVIEW).feature()).isEqualTo(AiFeature.SOURCE_OVERVIEW);
        assertThat(POLICIES.resolve(AiOperationKind.SUBJECT_OVERVIEW).feature()).isEqualTo(AiFeature.SUBJECT_OVERVIEW);
    }

    @Test
    void chatAgentAndTextGenerationHaveIndependentBoundedContracts() {
        AiOperationPolicy agent = POLICIES.resolve(AiOperationKind.CHAT_AGENT_TURN);
        assertThat(agent.feature()).isEqualTo(AiFeature.CHAT);
        assertThat(agent.platformMaxCalls()).isZero();
        assertThat(agent.allOriginMaxCalls()).isZero();
        assertThat(agent.platformTaskTokens()).isEqualTo(524_288);
        assertThat(agent.stages().get(AiStage.CHAT_COMPLETION).allOriginMaxCalls()).isNull();
        assertThat(agent.stages().get(AiStage.RETRIEVAL_EMBEDDING).allOriginMaxCalls()).isNull();

        ChatAgentProperties separateLimits = new ChatAgentProperties(3, 2, 8, 12,
                65_536, 524_288, 300);
        AiOperationPolicy configuredAgent = new AiOperationPolicyResolver(limits(), separateLimits)
                .resolve(AiOperationKind.CHAT_AGENT_TURN);
        assertThat(configuredAgent.platformMaxCalls()).isZero();
        assertThat(configuredAgent.allOriginMaxCalls()).isZero();
        assertThat(configuredAgent.stages().get(AiStage.CHAT_COMPLETION).allOriginMaxCalls()).isEqualTo(3);
        assertThat(configuredAgent.stages().get(AiStage.CHAT_COMPLETION).platformMaxCalls()).isEqualTo(3);
        assertThat(configuredAgent.stages().get(AiStage.RETRIEVAL_EMBEDDING).allOriginMaxCalls()).isEqualTo(2);
        assertThat(configuredAgent.stages().get(AiStage.RETRIEVAL_EMBEDDING).platformMaxCalls()).isEqualTo(2);

        AiOperationPolicy text = POLICIES.resolve(AiOperationKind.TEXT_GENERATION);
        assertThat(text.feature()).isEqualTo(AiFeature.CHAT);
        assertThat(text.platformMaxCalls()).isEqualTo(1);
        assertThat(text.allOriginMaxCalls()).isEqualTo(1);
        assertThat(text.stages()).containsOnlyKeys(AiStage.CHAT_COMPLETION);
        assertThat(text.stages().get(AiStage.CHAT_COMPLETION).methods())
                .containsExactly(AiInvocationMethod.COMPLETE);

    }

    @Test
    void chatCallLimitsAcceptZeroAsUnlimitedAndRejectNegativeValues() {
        assertThat(new ChatAgentProperties(0, 0, 8, 12, 65_536, 524_288, 300)
                .maxEmbeddingCalls()).isZero();
        assertThatThrownBy(() -> new ChatAgentProperties(-1, 0, 8, 12, 65_536, 524_288, 300))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new ChatAgentProperties(0, -1, 8, 12, 65_536, 524_288, 300))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void chatIterationAndToolBoundsAllowTwelveAndTwentyButRejectLargerValues() {
        assertThat(new ChatAgentProperties(0, 0, 12, 20, 65_536, 524_288, 300).maxIterations()).isEqualTo(12);
        assertThatThrownBy(() -> new ChatAgentProperties(0, 0, 13, 20, 65_536, 524_288, 300))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new ChatAgentProperties(0, 0, 12, 21, 65_536, 524_288, 300))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void chatBudgetIdentityIsStableAndNamespacedByOwnerAndRun() {
        var user = java.util.UUID.randomUUID();
        var run = java.util.UUID.randomUUID();
        assertThat(AiTaskContext.chatAgentLedgerTaskId(user, run))
                .isEqualTo(AiTaskContext.chatAgentLedgerTaskId(user, run))
                .isNotEqualTo(AiTaskContext.chatAgentLedgerTaskId(java.util.UUID.randomUUID(), run));
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
                2_000_000, 300_000, 10_000, 4096, 524_288, overviewMaxCalls, 524_288,
                512, 16_777_216);
    }
}
