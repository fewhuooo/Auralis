package com.auralis.app.ai.usage;

import com.auralis.app.ai.AiCredential;
import com.auralis.app.ai.OverviewCancellation;
import com.auralis.app.ai.AiProviderChunk;
import com.auralis.app.ai.AiProviderPort;
import com.auralis.app.ai.AiProviderModelIdentity;
import com.auralis.app.ai.AiProviderRequest;
import com.auralis.app.ai.AiProviderResponse;
import com.auralis.app.ai.AiProviderType;
import com.auralis.app.ai.EmbeddingProviderPort;
import com.auralis.app.ai.EmbeddingResult;
import com.auralis.app.ai.OverviewModelBudget;
import com.auralis.app.ai.internal.provider.AiProviderRegistry;
import com.auralis.app.ai.internal.provider.EmbeddingProviderRegistry;
import com.auralis.app.shared.config.AuralisProperties;
import com.auralis.app.shared.error.DomainException;
import org.springframework.stereotype.Service;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Supplier;

@Service
public class AiUsageGatewayService implements AiInvocationGateway {
    private static final Logger LOGGER = LoggerFactory.getLogger(AiUsageGatewayService.class);
    private static final String SHADOW_ESTIMATOR_VERSION = "char-category-v1-uncalibrated";
    private static final long COMPLETION_MESSAGE_FRAMING_TOKENS = 4L;

    private final AiUsageGuard guard;
    private final AiProviderRegistry providers;
    private final EmbeddingProviderRegistry embeddingProviders;
    private final AuralisProperties.Ai ai;
    private final AuralisProperties.Limits limits;
    private final ScheduledExecutorService heartbeatExecutor;
    private final TransactionTemplate providerIo;
    private final AiTokenShadowEstimator shadowEstimator = new AiTokenShadowEstimator();
    private final AiOperationPolicyResolver policies;

    @Autowired
    public AiUsageGatewayService(AiUsageGuard guard, AiProviderRegistry providers,
                                 EmbeddingProviderRegistry embeddingProviders,
                                 AuralisProperties properties,
                                 @Qualifier("aiUsageHeartbeatExecutor") ScheduledExecutorService heartbeatExecutor,
                                 PlatformTransactionManager transactionManager) {
        this(guard, providers, embeddingProviders, properties.ai(), heartbeatExecutor, transactionManager);
    }

    AiUsageGatewayService(AiUsageGuard guard, AiProviderRegistry providers,
                          EmbeddingProviderRegistry embeddingProviders,
                          AuralisProperties.Ai ai,
                          ScheduledExecutorService heartbeatExecutor,
                          PlatformTransactionManager transactionManager) {
        this.guard = Objects.requireNonNull(guard);
        this.providers = Objects.requireNonNull(providers);
        this.embeddingProviders = Objects.requireNonNull(embeddingProviders);
        this.ai = Objects.requireNonNull(ai);
        this.limits = ai.limits();
        this.policies = new AiOperationPolicyResolver(this.limits);
        this.heartbeatExecutor = Objects.requireNonNull(heartbeatExecutor);
        this.providerIo = new TransactionTemplate(Objects.requireNonNull(transactionManager));
        this.providerIo.setPropagationBehavior(TransactionDefinition.PROPAGATION_NOT_SUPPORTED);
    }

    @Override
    public AiTaskScope beginTask(AiTaskContext context) {
        AiUsageGuard.TaskLease lease = guard.beginTask(context);
        return new Scope(lease);
    }

    @Override
    public OverviewTaskUsageSummary overviewTaskUsage(AiTaskContext context) {
        return guard.overviewTaskUsage(context);
    }

    private final class Scope implements AiTaskScope {
        private final AiUsageGuard.TaskLease task;
        private final AtomicBoolean closed = new AtomicBoolean();
        private final AtomicBoolean lost = new AtomicBoolean();
        private final AtomicReference<AiUsageGuard.CallReservation> activeCall = new AtomicReference<>();
        private final CopyOnWriteArrayList<AttributedUsage> usages = new CopyOnWriteArrayList<>();
        private final ScheduledFuture<?> heartbeat;

        private Scope(AiUsageGuard.TaskLease task) {
            this.task = task;
            long heartbeatMillis = limits.heartbeatMillis();
            this.heartbeat = heartbeatExecutor.scheduleWithFixedDelay(() -> {
                if (closed.get() || lost.get()) return;
                try {
                    AiUsageGuard.CallReservation call = activeCall.get();
                    if (!guard.heartbeat(task, call == null ? null : call.id())) lost.set(true);
                } catch (RuntimeException exception) {
                    lost.set(true);
                }
            }, heartbeatMillis, heartbeatMillis, TimeUnit.MILLISECONDS);
        }

        @Override
        public java.util.UUID taskId() {
            return task.taskId();
        }

        @Override
        public AiPlatformTaskBudgetUsage platformTaskBudgetUsage() {
            return guard.platformTaskBudgetUsage(task);
        }

        @Override
        public <T> AiInvocationResult<T> metadata(
                AiStage stage, AiProviderType provider, String model, Supplier<T> operation) {
            throw new AiPolicyContractException();
        }

        @Override
        public <T> AiInvocationResult<T> metadata(AiStage stage, AiProviderType provider, String model,
                AiCredentialSource source, Supplier<T> operation) {
            requirePolicy(stage, AiInvocationMethod.METADATA, AiOutputRole.GENERAL, source);
            Objects.requireNonNull(operation);
            return invoke(stage, provider, model, source, AiOutputRole.GENERAL, 0, 0,
                    () -> providerIo.execute(status -> operation.get()), ignored -> new AiTokenUsage(0L, 0L),
                    ignored -> AiProviderModelIdentity.missing(), null, "METADATA", 0, null, null);
        }

        @Override
        public AiInvocationResult<AiProviderResponse> complete(AiStage stage, AiProviderType provider,
                AiProviderRequest request, AiCredential credential, long responseTimeoutMillis) {
            throw new AiPolicyContractException();
        }

        @Override
        public AiInvocationResult<AiProviderResponse> complete(AiStage stage, AiProviderType provider,
                AiProviderRequest request, AiCredential credential, long responseTimeoutMillis,
                OverviewCancellation cancellation) {
            throw new AiPolicyContractException();
        }

        @Override
        public AiInvocationResult<AiProviderResponse> complete(AiStage stage, AiProviderType provider,
                AiProviderRequest request, AiCredential credential, AiCredentialSource source,
                long responseTimeoutMillis, AiOutputRole role) {
            return complete(stage, provider, request, credential, source, responseTimeoutMillis, role, null);
        }

        @Override
        public AiInvocationResult<AiProviderResponse> complete(AiStage stage, AiProviderType provider,
                AiProviderRequest request, AiCredential credential, AiCredentialSource source,
                long responseTimeoutMillis, AiOutputRole role, OverviewCancellation cancellation) {
            return completeInternal(stage, provider, request, credential, source,
                    responseTimeoutMillis, role, cancellation, null);
        }

        @Override
        public AiInvocationResult<AiProviderResponse> complete(AiStage stage, AiProviderType provider,
                AiProviderRequest request, AiCredential credential, AiCredentialSource source,
                long responseTimeoutMillis, AiOutputRole role, OverviewCancellation cancellation,
                AiInvocationBinding binding) {
            Objects.requireNonNull(binding);
            return completeInternal(stage, provider, request, credential, source,
                    responseTimeoutMillis, role, cancellation, binding);
        }

        private AiInvocationResult<AiProviderResponse> completeInternal(AiStage stage, AiProviderType provider,
                AiProviderRequest request, AiCredential credential, AiCredentialSource source,
                long responseTimeoutMillis, AiOutputRole role, OverviewCancellation cancellation,
                AiInvocationBinding binding) {
            requirePolicy(stage, AiInvocationMethod.COMPLETE, role, source);
            Objects.requireNonNull(request);
            Objects.requireNonNull(credential);
            AiProviderPort port = providers.require(provider);
            OverviewModelBudget overviewCapability = isOverviewCompletion(stage)
                    && isOverviewFeature(task.feature())
                    ? requireOverviewCapability(provider, credential.baseUrl(), request.model()) : null;
            AiProviderRequest bounded = boundedRequest(stage, provider, credential.baseUrl(), request, role,
                    overviewCapability);
            boolean overview = bounded.overviewCapacityRequest();
            if (!overview) enforceRequestByteLimit(bounded);
            AiInputTokenEstimator.Estimate admissionEstimate = null;
            long inputTokens;
            if (overview) {
                AiInputTokenEstimator.Profile estimatorProfile = AiInputTokenEstimator.resolve(provider,
                        credential.baseUrl(), bounded.model(), ai.overviewInputTokenEstimatorMode());
                admissionEstimate = estimatorProfile.estimate(bounded.messages());
                inputTokens = admissionEstimate.inputTokens();
                enforceOverviewContext(overviewCapability, bounded, inputTokens);
                enforceOverviewConfiguredCaps(bounded, inputTokens);
            } else {
                inputTokens = estimateRequestTokens(bounded);
            }
            List<String> contents = bounded.messages().stream().map(AiProviderRequest.Message::content).toList();
            AiTokenShadowEstimator.Estimate shadow = shadowEstimator.estimate(contents,
                    Math.multiplyExact(COMPLETION_MESSAGE_FRAMING_TOKENS, bounded.messages().size()));
            logEffectiveModel(provider, bounded.model(), credential.baseUrl(), stage, bounded.structuredJson());
            return invoke(stage, provider, bounded.model(), source, role, inputTokens, bounded.maxTokens(),
                    () -> providerIo.execute(status -> port.complete(bounded, credential, responseTimeoutMillis, cancellation)),
                    AiProviderResponse::usage,
                    response -> response == null ? AiProviderModelIdentity.missing() : response.modelIdentity(),
                    shadow, shadow.textType(), contents.size(), binding, admissionEstimate);
        }

        @Override
        public AiInvocationResult<Void> stream(AiStage stage, AiProviderType provider,
                AiProviderRequest request, AiCredential credential,
                java.util.function.Consumer<AiProviderChunk> sink) {
            throw new AiPolicyContractException();
        }

        @Override
        public AiInvocationResult<Void> stream(AiStage stage, AiProviderType provider,
                AiProviderRequest request, AiCredential credential, AiCredentialSource source,
                java.util.function.Consumer<AiProviderChunk> sink) {
            requirePolicy(stage, AiInvocationMethod.STREAM, AiOutputRole.GENERAL, source);
            Objects.requireNonNull(request);
            Objects.requireNonNull(credential);
            Objects.requireNonNull(sink);
            AiProviderPort port = providers.require(provider);
            AiProviderRequest bounded = boundedRequest(stage, provider, credential.baseUrl(), request,
                    AiOutputRole.GENERAL, null);
            long inputTokens = estimateRequestTokens(bounded);
            List<String> contents = bounded.messages().stream().map(AiProviderRequest.Message::content).toList();
            AiTokenShadowEstimator.Estimate shadow = shadowEstimator.estimate(contents,
                    Math.multiplyExact(COMPLETION_MESSAGE_FRAMING_TOKENS, bounded.messages().size()));
            logEffectiveModel(provider, bounded.model(), credential.baseUrl(), stage, bounded.structuredJson());
            AtomicReference<AiTokenUsage> rawUsage = new AtomicReference<>();
            AtomicReference<AiProviderModelIdentity> modelIdentity = new AtomicReference<>(
                    AiProviderModelIdentity.missing());
            return invoke(stage, provider, bounded.model(), source, AiOutputRole.GENERAL, inputTokens, bounded.maxTokens(), () -> {
                providerIo.executeWithoutResult(status -> port.streamInto(bounded, credential, chunk -> {
                    if (chunk != null) {
                        if (chunk.usage() != null) rawUsage.set(chunk.usage());
                        modelIdentity.updateAndGet(current -> current.merge(chunk.modelIdentity()));
                    }
                    if (chunk == null || chunk.content() == null || !chunk.content().isEmpty()
                            || chunk.complete() || chunk.usage() != null
                            || chunk.modelIdentity().status() == AiProviderModelIdentity.Status.MISSING) {
                        sink.accept(chunk);
                    }
                }));
                return null;
            }, ignored -> rawUsage.get(), ignored -> modelIdentity.get(),
                    shadow, shadow.textType(), contents.size(), null, null);
        }

        @Override
        public AiInvocationResult<EmbeddingResult> embed(AiStage stage, AiProviderType provider,
                String model, List<String> texts, AiCredential credential) {
            throw new AiPolicyContractException();
        }

        @Override
        public AiInvocationResult<EmbeddingResult> embed(AiStage stage, AiProviderType provider,
                String model, List<String> texts, AiCredential credential, AiCredentialSource source) {
            requirePolicy(stage, AiInvocationMethod.EMBED, AiOutputRole.GENERAL, source);
            Objects.requireNonNull(texts);
            Objects.requireNonNull(credential);
            EmbeddingProviderPort port = embeddingProviders.require(provider);
            long inputTokens = estimateTextsTokens(texts);
            AiTokenShadowEstimator.Estimate shadow = shadowEstimator.estimate(texts);
            return invoke(stage, provider, model, source, AiOutputRole.GENERAL, inputTokens, 0,
                    () -> providerIo.execute(status -> port.embed(List.copyOf(texts), credential)),
                    result -> result == null ? null : result.usage(),
                    result -> result == null ? AiProviderModelIdentity.missing() : result.modelIdentity(),
                    shadow, "EMBEDDING_TEXT", texts.size(), null, null);
        }

        private <T> AiInvocationResult<T> invoke(AiStage stage, AiProviderType provider, String model,
                AiCredentialSource source, AiOutputRole role,
                long estimatedInput, long reservedOutput, Supplier<T> operation,
                java.util.function.Function<T, AiTokenUsage> usageExtractor,
                java.util.function.Function<T, AiProviderModelIdentity> modelIdentityExtractor,
                AiTokenShadowEstimator.Estimate shadow, String textType, int messageCount,
                AiInvocationBinding binding, AiInputTokenEstimator.Estimate admissionEstimate) {
            requireUsable();
            AiUsageGuard.CallReservation call = guard.reserve(task, stage, provider, model, source, role,
                    estimatedInput, reservedOutput);
            activeCall.set(call);
            boolean settledAlready = false;
            try {
                if (admissionEstimate != null) logAdmissionEstimate(call, stage, provider, model, admissionEstimate);
                if (binding != null) binding.onReserved(call.id());
                if (binding == null) {
                    guard.markDispatched(task, call);
                } else {
                    guard.markDispatched(task, call, () -> binding.beforeDispatch(call.id()));
                }
                T value = operation.get();
                AiTokenUsage rawUsage = usageExtractor.apply(value);
                AiUsageGuard.SettlementResult settlement = guard.settleSuccessful(task, call, rawUsage);
                settledAlready = true;
                usages.add(new AttributedUsage(source, settlement.usage()));
                AiProviderModelIdentity responseModel = modelIdentityExtractor.apply(value);
                logShadow(call, stage, provider, model, estimatedInput, reservedOutput, shadow, textType,
                        messageCount, settlement.usage(), responseModel);
                if (lost.get() || !settlement.accepted()) throw new AiUsageLimitException(
                        "AI_CONCURRENCY_LIMIT", 429, 1, null);
                return new AiInvocationResult<>(value, settlement.usage());
            } catch (RuntimeException exception) {
                if (!settledAlready) {
                    AiProviderUsage settled = guard.settle(task, call, null, false, safeErrorCode(exception));
                    usages.add(new AttributedUsage(source, settled));
                    logShadow(call, stage, provider, model, estimatedInput, reservedOutput, shadow, textType,
                            messageCount, settled, modelIdentityExtractor.apply(null));
                }
                throw exception;
            } finally {
                activeCall.compareAndSet(call, null);
            }
        }

        private void logShadow(AiUsageGuard.CallReservation call, AiStage stage, AiProviderType provider,
                               String model, long oldEstimate, long reservedOutput,
                               AiTokenShadowEstimator.Estimate shadow, String textType, int messageCount,
                               AiProviderUsage actual, AiProviderModelIdentity responseModel) {
            if (!ai.shadowTokenEstimateEnabled() || shadow == null) return;
            boolean complete = actual.providerUsageComplete() && actual.actualInputTokens() != null
                    && actual.actualOutputTokens() != null;
            Long actualInput = complete ? actual.actualInputTokens() : null;
            Long oldDelta = complete ? oldEstimate - actualInput : null;
            Long shadowDelta = complete ? shadow.tokens() - actualInput : null;
            Double oldRelativeError = relativeError(oldDelta, actualInput);
            Double shadowRelativeError = relativeError(shadowDelta, actualInput);
            String calibration = complete && actualInput != 0 ? "OBSERVED_ACTUAL" :
                    complete ? "ACTUAL_ZERO" : "UNKNOWN";
            AiProviderModelIdentity safeIdentity = responseModel == null
                    ? AiProviderModelIdentity.missing() : responseModel;
            String requestedModel = AiProviderModelIdentity.safeRequestedModel(model);
            LOGGER.info("AI_TOKEN_ESTIMATE_SHADOW requestId={} feature={} stage={} provider={} model={} "
                            + "requestedModel={} observedModel={} observedModelStatus={} "
                            + "textType={} estimatorVersion={} mode=shadow usage={} oldEstimate={} shadowEstimate={} "
                            + "actualInput={} reservedOutput={} actualOutput={} oldError={} shadowError={} "
                            + "oldRelativeErrorPct={} shadowRelativeErrorPct={} codePoints={} utf8Bytes={} "
                            + "latinChars={} cjkChars={} digitChars={} whitespaceChars={} punctuationChars={} "
                            + "otherChars={} messageCount={} messageFramingTokens={} calibration={}",
                    call.id(), task.feature(), stage, provider, requestedModel, requestedModel,
                    safeIdentity.modelId(), safeIdentity.status(), textType,
                    SHADOW_ESTIMATOR_VERSION, complete ? "complete" : "unknown", oldEstimate,
                    shadow.tokens(), actualInput, reservedOutput,
                    complete ? actual.actualOutputTokens() : null, oldDelta, shadowDelta,
                    oldRelativeError, shadowRelativeError, shadow.codePoints(), shadow.utf8Bytes(),
                    shadow.categoryCount(0), shadow.categoryCount(1), shadow.categoryCount(2),
                    shadow.categoryCount(3), shadow.categoryCount(4), shadow.categoryCount(5),
                    messageCount, shadow.framingTokens(), calibration);
        }

        private Double relativeError(Long delta, Long actualInput) {
            return delta == null || actualInput == null || actualInput == 0
                    ? null : delta * 100.0 / actualInput;
        }

        private void logAdmissionEstimate(AiUsageGuard.CallReservation call, AiStage stage,
                                          AiProviderType provider, String model,
                                          AiInputTokenEstimator.Estimate estimate) {
            LOGGER.info("AI_INPUT_TOKEN_ESTIMATE requestId={} feature={} stage={} provider={} model={} "
                            + "profile={} strategy={} estimatedInput={} legacyBytesEstimate={} "
                            + "categoryMessages={} byteMessages={} safetyMarginTokens={}",
                    call.id(), task.feature(), stage, provider, safeModel(model), estimate.profileIdentity(),
                    estimate.strategy(), estimate.inputTokens(), estimate.legacyBytesEstimate(),
                    estimate.categoryMessages(), estimate.byteMessages(), estimate.safetyMarginTokens());
        }

        private void logEffectiveModel(AiProviderType provider, String model, String baseUrl,
                                       AiStage stage, boolean structuredJson) {
            OverviewModelBudget capability = OverviewModelBudget.resolve(
                    provider, baseUrl, model, ai.overviewModelCapacities());
            String context = capability.contextWindowTokens().isPresent()
                    ? Long.toString(capability.contextWindowTokens().getAsLong()) : "unknown";
            String output = capability.maxOutputTokens().isPresent()
                    ? Long.toString(capability.maxOutputTokens().getAsLong()) : "unknown";
            LOGGER.info("AI_MODEL_CONFIG_EFFECTIVE provider={} model={} capability={} contextTokens={} "
                            + "maxOutputTokens={} thinking={}", provider, safeModel(model),
                    capability.isTrusted() ? "verified" : "unknown", context, output,
                    provider == AiProviderType.DEEPSEEK && structuredJson
                            && (stage == AiStage.OVERVIEW_MAP || stage == AiStage.OVERVIEW_REDUCE)
                            ? "disabled" : "provider-default-or-unknown");
        }

        private String safeModel(String model) {
            return AiProviderModelIdentity.safeRequestedModel(model);
        }

        private void requireUsable() {
            if (closed.get() || lost.get()) {
                throw new AiUsageLimitException("AI_CONCURRENCY_LIMIT", 429, 1, null);
            }
        }

        private long estimateRequestTokens(AiProviderRequest request) {
            enforceRequestByteLimit(request);
            long bytes = 0;
            for (AiProviderRequest.Message message : request.messages()) {
                if (message.content() != null) bytes = Math.addExact(bytes,
                        message.content().getBytes(StandardCharsets.UTF_8).length);
            }
            long byteLimit = Math.multiplyExact((long) ai.maxPromptChars(), 4L);
            if (bytes > byteLimit) throw requestBudgetExceeded();
            return Math.addExact(bytes, Math.multiplyExact(4L, request.messages().size()));
        }

        private void enforceRequestByteLimit(AiProviderRequest request) {
            long bytes = 0;
            for (AiProviderRequest.Message message : request.messages()) {
                if (message.content() != null) bytes = Math.addExact(bytes,
                        message.content().getBytes(StandardCharsets.UTF_8).length);
            }
            long byteLimit = Math.multiplyExact((long) ai.maxPromptChars(), 4L);
            if (bytes > byteLimit) throw requestBudgetExceeded();
        }

        private boolean overviewCompletion(AiStage stage) {
            return stage == AiStage.OVERVIEW_MAP || stage == AiStage.OVERVIEW_REDUCE;
        }

        private boolean isOverviewCompletion(AiStage stage) {
            return overviewCompletion(stage);
        }

        private boolean isOverviewFeature(AiFeature feature) {
            return feature == AiFeature.SOURCE_OVERVIEW || feature == AiFeature.SUBJECT_OVERVIEW;
        }

        private void enforceOverviewContext(OverviewModelBudget capability,
                                            AiProviderRequest request, long estimatedInput) {
            long requestedOutput = request.maxTokens();
            long estimatedTotal;
            try {
                estimatedTotal = Math.addExact(Math.addExact(estimatedInput, requestedOutput),
                        capability.contextSafetyMarginTokens());
            } catch (ArithmeticException overflow) {
                throw requestBudgetExceeded();
            }
            if (capability.contextWindowTokens().isEmpty()
                    || estimatedTotal > capability.contextWindowTokens().getAsLong()) {
                throw requestBudgetExceeded();
            }
        }

        private void enforceOverviewConfiguredCaps(AiProviderRequest request, long estimatedInput) {
            AuralisProperties.OverviewLimits overviewLimits = ai.overviewLimits();
            long messageBytes = 0;
            long messageChars = 0;
            try {
                for (AiProviderRequest.Message message : request.messages()) {
                    if (message == null || message.content() == null) throw requestBudgetExceeded();
                    messageBytes = Math.addExact(messageBytes,
                            message.content().getBytes(StandardCharsets.UTF_8).length);
                    messageChars = Math.addExact(messageChars, message.content().length());
                }
            } catch (ArithmeticException overflow) {
                throw requestBudgetExceeded();
            }
            if ((overviewLimits.maxPromptChars() > 0 && messageChars > overviewLimits.maxPromptChars())
                    || (overviewLimits.maxRequestBytes() > 0 && messageBytes > overviewLimits.maxRequestBytes())
                    || (overviewLimits.maxInputTokens() > 0 && estimatedInput > overviewLimits.maxInputTokens())) {
                throw requestBudgetExceeded();
            }
        }

        private OverviewModelBudget requireOverviewCapability(AiProviderType provider, String endpoint,
                                                              String model) {
            OverviewModelBudget capability = OverviewModelBudget.resolve(
                    provider, endpoint, model, ai.overviewModelCapacities());
            if (!capability.isTrusted()) {
                throw new DomainException("MODEL_UNAVAILABLE",
                        "Overview model capacity is not configured for this provider endpoint and exact model");
            }
            return capability;
        }

        private long estimateTextsTokens(List<String> texts) {
            long bytes = 0;
            for (String text : texts) {
                if (text == null) throw requestBudgetExceeded();
                bytes = Math.addExact(bytes, text.getBytes(StandardCharsets.UTF_8).length);
            }
            long byteLimit = Math.multiplyExact((long) ai.maxPromptChars(), 4L);
            if (bytes > byteLimit) throw requestBudgetExceeded();
            return bytes;
        }

        private AiProviderRequest boundedRequest(AiStage stage, AiProviderType provider, String endpoint,
                                                 AiProviderRequest request, AiOutputRole role,
                                                 OverviewModelBudget overviewCapability) {
            boolean overview = isOverviewCompletion(stage) && isOverviewFeature(task.feature());
            long outputLimit;
            if (overview) {
                long modelOutputLimit = Objects.requireNonNull(overviewCapability)
                        .maxOutputTokens().orElseThrow();
                long configuredOutputLimit = ai.overviewLimits().maxOutputTokens();
                outputLimit = configuredOutputLimit > 0
                        ? Math.min(modelOutputLimit, configuredOutputLimit) : modelOutputLimit;
            } else {
                outputLimit = switch (task.feature()) {
                        case CHAT -> limits.chatMaxOutputTokens();
                        case SOURCE_OVERVIEW, SUBJECT_OVERVIEW -> role == AiOutputRole.FINAL ? 6_144 : 4_608;
                        case PROVIDER_SETUP -> limits.chatMaxOutputTokens();
                        case INGESTION -> 1;
                    };
            }
            Integer requested = request.maxTokens();
            if (overview && requested == null) throw requestBudgetExceeded();
            if (requested != null && (requested < 1 || requested > outputLimit)) throw requestBudgetExceeded();
            int bounded = requested == null ? Math.toIntExact(outputLimit) : requested;
            return new AiProviderRequest(request.model(), request.messages(), request.temperature(), bounded,
                    request.structuredJson(), overview,
                    overview ? ai.overviewLimits().maxResponseBytes() : 0);
        }

        private void requirePolicy(AiStage stage, AiInvocationMethod method, AiOutputRole role,
                                   AiCredentialSource source) {
            AiCredentialSource.requireKnown(source);
            policies.require(new AiTaskContext(task.userId(), task.feature(), "gateway", null, task.operationKind()),
                    stage, method, role);
        }

        private AiUsageLimitException requestBudgetExceeded() {
            return new AiUsageLimitException("AI_REQUEST_BUDGET_EXCEEDED", 413, 0, null);
        }

        private String safeErrorCode(RuntimeException exception) {
            if (exception instanceof AiUsageLimitException usage) return usage.code();
            if (exception instanceof DomainException domain) return domain.code();
            return "MODEL_PROVIDER_ERROR";
        }

        @Override
        public AiProviderUsage usage() {
            return usage(null);
        }

        @Override
        public AiProviderUsage usage(AiCredentialSource source) {
            List<AiProviderUsage> selected = usages.stream()
                    .filter(attributed -> source == null || attributed.source() == source)
                    .map(AttributedUsage::usage).toList();
            if (selected.isEmpty()) return new AiProviderUsage(0, 0, 0L, 0L, 0, true);
            long estimatedInput = 0;
            long reservedOutput = 0;
            long charged = 0;
            long actualInput = 0;
            long actualOutput = 0;
            boolean allComplete = true;
            for (AiProviderUsage usage : selected) {
                estimatedInput = Math.addExact(estimatedInput, usage.estimatedInputTokens());
                reservedOutput = Math.addExact(reservedOutput, usage.reservedOutputTokens());
                charged = Math.addExact(charged, usage.chargedTokens());
                allComplete &= usage.providerUsageComplete();
                if (usage.actualInputTokens() == null || usage.actualOutputTokens() == null) {
                    allComplete = false;
                } else {
                    actualInput = Math.addExact(actualInput, usage.actualInputTokens());
                    actualOutput = Math.addExact(actualOutput, usage.actualOutputTokens());
                }
            }
            return new AiProviderUsage(estimatedInput, reservedOutput,
                    allComplete ? actualInput : null, allComplete ? actualOutput : null,
                    charged, allComplete);
        }

        @Override
        public void close() {
            if (!closed.compareAndSet(false, true)) return;
            heartbeat.cancel(false);
            guard.closeTask(task);
        }

        private record AttributedUsage(AiCredentialSource source, AiProviderUsage usage) { }
    }
}
