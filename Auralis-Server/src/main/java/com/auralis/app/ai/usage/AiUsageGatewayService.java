package com.auralis.app.ai.usage;

import com.auralis.app.ai.AiCredential;
import com.auralis.app.ai.OverviewCancellation;
import com.auralis.app.ai.AiProviderChunk;
import com.auralis.app.ai.AiProviderPort;
import com.auralis.app.ai.AiProviderRequest;
import com.auralis.app.ai.AiProviderResponse;
import com.auralis.app.ai.AiProviderType;
import com.auralis.app.ai.EmbeddingProviderPort;
import com.auralis.app.ai.EmbeddingResult;
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

    private final AiUsageGuard guard;
    private final AiProviderRegistry providers;
    private final EmbeddingProviderRegistry embeddingProviders;
    private final AuralisProperties.Ai ai;
    private final AuralisProperties.Limits limits;
    private final ScheduledExecutorService heartbeatExecutor;
    private final TransactionTemplate providerIo;

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
        this.heartbeatExecutor = Objects.requireNonNull(heartbeatExecutor);
        this.providerIo = new TransactionTemplate(Objects.requireNonNull(transactionManager));
        this.providerIo.setPropagationBehavior(TransactionDefinition.PROPAGATION_NOT_SUPPORTED);
    }

    @Override
    public AiTaskScope beginTask(AiTaskContext context) {
        AiUsageGuard.TaskLease lease = guard.beginTask(context);
        return new Scope(lease);
    }

    private final class Scope implements AiTaskScope {
        private final AiUsageGuard.TaskLease task;
        private final AtomicBoolean closed = new AtomicBoolean();
        private final AtomicBoolean lost = new AtomicBoolean();
        private final AtomicReference<AiUsageGuard.CallReservation> activeCall = new AtomicReference<>();
        private final CopyOnWriteArrayList<AiProviderUsage> usages = new CopyOnWriteArrayList<>();
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
        public <T> AiInvocationResult<T> metadata(
                AiStage stage, AiProviderType provider, String model, Supplier<T> operation) {
            Objects.requireNonNull(operation);
            return invoke(stage, provider, model, 0, 0,
                    () -> providerIo.execute(status -> operation.get()), ignored -> new AiTokenUsage(0L, 0L));
        }

        @Override
        public AiInvocationResult<AiProviderResponse> complete(AiStage stage, AiProviderType provider,
                AiProviderRequest request, AiCredential credential, long responseTimeoutMillis) {
            return complete(stage, provider, request, credential, responseTimeoutMillis, null);
        }

        @Override
        public AiInvocationResult<AiProviderResponse> complete(AiStage stage, AiProviderType provider,
                AiProviderRequest request, AiCredential credential, long responseTimeoutMillis,
                OverviewCancellation cancellation) {
            Objects.requireNonNull(request);
            Objects.requireNonNull(credential);
            AiProviderPort port = providers.require(provider);
            AiProviderRequest bounded = boundedRequest(stage, request);
            long inputTokens = estimateRequestTokens(bounded);
            return invoke(stage, provider, bounded.model(), inputTokens, bounded.maxTokens(),
                    () -> providerIo.execute(status -> port.complete(bounded, credential, responseTimeoutMillis, cancellation)),
                    AiProviderResponse::usage);
        }

        @Override
        public AiInvocationResult<Void> stream(AiStage stage, AiProviderType provider,
                AiProviderRequest request, AiCredential credential,
                java.util.function.Consumer<AiProviderChunk> sink) {
            Objects.requireNonNull(request);
            Objects.requireNonNull(credential);
            Objects.requireNonNull(sink);
            AiProviderPort port = providers.require(provider);
            AiProviderRequest bounded = boundedRequest(stage, request);
            long inputTokens = estimateRequestTokens(bounded);
            AtomicReference<AiTokenUsage> rawUsage = new AtomicReference<>();
            return invoke(stage, provider, bounded.model(), inputTokens, bounded.maxTokens(), () -> {
                providerIo.executeWithoutResult(status -> port.streamInto(bounded, credential, chunk -> {
                    if (chunk != null && chunk.usage() != null) rawUsage.set(chunk.usage());
                    sink.accept(chunk);
                }));
                return null;
            }, ignored -> rawUsage.get());
        }

        @Override
        public AiInvocationResult<EmbeddingResult> embed(AiStage stage, AiProviderType provider,
                String model, List<String> texts, AiCredential credential) {
            Objects.requireNonNull(texts);
            Objects.requireNonNull(credential);
            EmbeddingProviderPort port = embeddingProviders.require(provider);
            long inputTokens = estimateTextsTokens(texts);
            return invoke(stage, provider, model, inputTokens, 0,
                    () -> providerIo.execute(status -> port.embed(List.copyOf(texts), credential)),
                    result -> result == null ? null : result.usage());
        }

        private <T> AiInvocationResult<T> invoke(AiStage stage, AiProviderType provider, String model,
                long estimatedInput, long reservedOutput, Supplier<T> operation,
                java.util.function.Function<T, AiTokenUsage> usageExtractor) {
            requireUsable();
            AiUsageGuard.CallReservation call = guard.reserve(task, stage, provider, model,
                    estimatedInput, reservedOutput);
            activeCall.set(call);
            boolean settledAlready = false;
            try {
                guard.markDispatched(task, call);
                T value = operation.get();
                AiTokenUsage rawUsage = usageExtractor.apply(value);
                AiUsageGuard.SettlementResult settlement = guard.settleSuccessful(task, call, rawUsage);
                settledAlready = true;
                usages.add(settlement.usage());
                if (lost.get() || !settlement.accepted()) throw new AiUsageLimitException(
                        "AI_CONCURRENCY_LIMIT", 429, 1, null);
                return new AiInvocationResult<>(value, settlement.usage());
            } catch (RuntimeException exception) {
                if (!settledAlready) {
                    AiProviderUsage settled = guard.settle(task, call, null, false, safeErrorCode(exception));
                    usages.add(settled);
                }
                throw exception;
            } finally {
                activeCall.compareAndSet(call, null);
            }
        }

        private void requireUsable() {
            if (closed.get() || lost.get()) {
                throw new AiUsageLimitException("AI_CONCURRENCY_LIMIT", 429, 1, null);
            }
        }

        private long estimateRequestTokens(AiProviderRequest request) {
            long bytes = 0;
            for (AiProviderRequest.Message message : request.messages()) {
                if (message.content() != null) bytes = Math.addExact(bytes,
                        message.content().getBytes(StandardCharsets.UTF_8).length);
            }
            long byteLimit = Math.multiplyExact((long) ai.maxPromptChars(), 4L);
            if (bytes > byteLimit) throw requestBudgetExceeded();
            return Math.addExact(bytes, Math.multiplyExact(4L, request.messages().size()));
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

        private AiProviderRequest boundedRequest(AiStage stage, AiProviderRequest request) {
            int outputLimit = switch (task.feature()) {
                case CHAT -> limits.chatMaxOutputTokens();
                case SOURCE_OVERVIEW, SUBJECT_OVERVIEW ->
                        stage == AiStage.OVERVIEW_MAP || stage == AiStage.OVERVIEW_REDUCE ? 6_144 : 4_608;
                case PROVIDER_SETUP -> limits.chatMaxOutputTokens();
                case INGESTION -> 1;
            };
            Integer requested = request.maxTokens();
            if (requested != null && (requested < 1 || requested > outputLimit)) throw requestBudgetExceeded();
            int bounded = requested == null ? outputLimit : requested;
            return new AiProviderRequest(request.model(), request.messages(), request.temperature(), bounded,
                    request.structuredJson());
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
            if (usages.isEmpty()) return new AiProviderUsage(0, 0, 0L, 0L, 0, true);
            long estimatedInput = 0;
            long reservedOutput = 0;
            long charged = 0;
            long actualInput = 0;
            long actualOutput = 0;
            boolean allComplete = true;
            for (AiProviderUsage usage : usages) {
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
    }
}
