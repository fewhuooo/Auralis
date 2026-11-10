package com.auralis.app.ai.usage;

import com.auralis.app.shared.config.AuralisProperties;

import java.util.EnumMap;
import java.util.Map;
import java.util.Set;

/** Central immutable operation matrix. Policy limits use explicit token/call units. */
public final class AiOperationPolicyResolver {
    private final Map<AiOperationKind, AiOperationPolicy> policies;

    public AiOperationPolicyResolver(AuralisProperties.Limits limits) {
        this(limits, ChatAgentProperties.defaults());
    }

    public AiOperationPolicyResolver(AuralisProperties.Limits limits, ChatAgentProperties chatAgent) {
        EnumMap<AiOperationKind, AiOperationPolicy> matrix = new EnumMap<>(AiOperationKind.class);
        add(matrix, AiOperationKind.CHAT_AGENT_TURN, AiFeature.CHAT,
                0, limits.chatTaskTokens(),
                Map.of(AiStage.RETRIEVAL_EMBEDDING, rule(method(AiInvocationMethod.EMBED), roles(),
                                boundedCalls(chatAgent.maxEmbeddingCalls()), boundedCalls(chatAgent.maxEmbeddingCalls())),
                        AiStage.CHAT_COMPLETION, rule(method(AiInvocationMethod.STREAM, AiInvocationMethod.COMPLETE),
                                roles(), boundedCalls(chatAgent.maxModelCalls()), boundedCalls(chatAgent.maxModelCalls()))),
                0);
        add(matrix, AiOperationKind.TEXT_GENERATION, AiFeature.CHAT, 1, limits.chatTaskTokens(),
                Map.of(AiStage.CHAT_COMPLETION, rule(method(AiInvocationMethod.COMPLETE),
                        roles(), 1, 1)), 1);
        add(matrix, AiOperationKind.CHAT_TURN, AiFeature.CHAT, limits.chatMaxCalls(), limits.chatTaskTokens(),
                Map.of(AiStage.RETRIEVAL_EMBEDDING, rule(method(AiInvocationMethod.EMBED), roles(), null, 1),
                        AiStage.CHAT_COMPLETION, rule(method(AiInvocationMethod.STREAM, AiInvocationMethod.COMPLETE), roles(), null, 1)));
        add(matrix, AiOperationKind.SOURCE_OVERVIEW, AiFeature.SOURCE_OVERVIEW, limits.overviewMaxCalls(), limits.overviewTaskTokens(), overviewRules(limits.overviewMaxCalls()));
        add(matrix, AiOperationKind.SUBJECT_OVERVIEW, AiFeature.SUBJECT_OVERVIEW, limits.overviewMaxCalls(), limits.overviewTaskTokens(), overviewRules(limits.overviewMaxCalls()));
        add(matrix, AiOperationKind.INGESTION_EMBEDDING, AiFeature.INGESTION, limits.ingestionMaxCalls(), limits.ingestionTaskTokens(),
                Map.of(AiStage.INGESTION_EMBEDDING, rule(method(AiInvocationMethod.EMBED), roles(), null, limits.ingestionMaxCalls())));
        add(matrix, AiOperationKind.PROVIDER_SETUP, AiFeature.PROVIDER_SETUP, 2, 8_192,
                Map.of(AiStage.PROVIDER_METADATA, rule(method(AiInvocationMethod.METADATA), roles(), null, 1),
                        AiStage.PROVIDER_TEST, rule(method(AiInvocationMethod.COMPLETE), roles(), null, 1)));
        add(matrix, AiOperationKind.LEARNING_TURN, AiFeature.CHAT, Math.min(limits.chatMaxCalls(), 2), limits.chatTaskTokens(),
                Map.of(AiStage.RETRIEVAL_EMBEDDING, rule(method(AiInvocationMethod.EMBED), roles(), 1, 1),
                        AiStage.CHAT_COMPLETION, rule(method(AiInvocationMethod.COMPLETE, AiInvocationMethod.STREAM), roles(), 1, 1)));
        add(matrix, AiOperationKind.LEARNING_DRAFT, AiFeature.CHAT, 1, limits.chatTaskTokens(),
                Map.of(AiStage.CHAT_COMPLETION, rule(method(AiInvocationMethod.COMPLETE), roles(), 1, 1)));
        this.policies = Map.copyOf(matrix);
        if (policies.size() != AiOperationKind.values().length) throw new IllegalStateException("Operation policy matrix is incomplete");
    }

    public AiOperationPolicy resolve(AiOperationKind kind) {
        AiOperationPolicy policy = kind == null ? null : policies.get(kind);
        if (policy == null) throw new AiPolicyContractException();
        return policy;
    }

    public void require(AiTaskContext context, AiStage stage, AiInvocationMethod method, AiOutputRole role) {
        AiOperationPolicy policy = resolve(context.operationKind());
        AiOperationPolicy.StageRule rule = policy.stages().get(stage);
        if (policy.feature() != context.feature() || rule == null || !rule.methods().contains(method)
                || !rule.outputRoles().contains(role)) throw new AiPolicyContractException();
    }

    private static Map<AiStage, AiOperationPolicy.StageRule> overviewRules(int maxCalls) {
        return Map.of(AiStage.OVERVIEW_MAP, rule(method(AiInvocationMethod.COMPLETE),
                        Set.of(AiOutputRole.INTERMEDIATE, AiOutputRole.FINAL), null, maxCalls == 0 ? null : maxCalls),
                AiStage.OVERVIEW_REDUCE, rule(method(AiInvocationMethod.COMPLETE),
                        Set.of(AiOutputRole.INTERMEDIATE, AiOutputRole.FINAL), null, maxCalls == 0 ? null : maxCalls));
    }
    private static void add(Map<AiOperationKind, AiOperationPolicy> out, AiOperationKind kind, AiFeature feature,
                            int calls, long tokens, Map<AiStage, AiOperationPolicy.StageRule> stages) {
        add(out, kind, feature, calls, tokens, stages, 0);
    }
    private static void add(Map<AiOperationKind, AiOperationPolicy> out, AiOperationKind kind, AiFeature feature,
                            int calls, long tokens, Map<AiStage, AiOperationPolicy.StageRule> stages,
                            int allOriginMaxCalls) {
        out.put(kind, new AiOperationPolicy(kind, feature, calls, tokens, stages, allOriginMaxCalls));
    }
    private static AiOperationPolicy.StageRule rule(Set<AiInvocationMethod> methods, Set<AiOutputRole> roles, Integer allCalls) {
        return new AiOperationPolicy.StageRule(methods, roles, allCalls, null);
    }
    private static AiOperationPolicy.StageRule rule(Set<AiInvocationMethod> methods, Set<AiOutputRole> roles,
                                                     Integer allCalls, Integer platformCalls) {
        return new AiOperationPolicy.StageRule(methods, roles, allCalls, platformCalls);
    }
    private static Integer boundedCalls(int calls) { return calls == 0 ? null : calls; }
    private static Set<AiInvocationMethod> method(AiInvocationMethod... methods) { return Set.of(methods); }
    private static Set<AiOutputRole> roles() { return Set.of(AiOutputRole.GENERAL); }
}
