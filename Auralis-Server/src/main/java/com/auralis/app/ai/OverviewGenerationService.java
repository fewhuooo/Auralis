package com.auralis.app.ai;

import com.auralis.app.ai.OverviewDtos.OverviewResponse;
import com.auralis.app.ai.OverviewDtos.SubjectOverviewRequest;
import com.auralis.app.ai.OverviewDtos.SubjectOverviewSourceInput;
import com.auralis.app.ai.OverviewDtos.SourceOverviewRequest;
import com.auralis.app.ai.diagnostics.OverviewTrace;
import com.auralis.app.ai.diagnostics.OverviewTraceRun;
import com.auralis.app.ai.diagnostics.SafeOverviewTrace;
import com.auralis.app.ai.internal.persistence.SourceChunkRepository;
import com.auralis.app.ai.internal.persistence.SourceChunkEntity;
import com.auralis.app.ai.usage.AiFeature;
import com.auralis.app.ai.usage.AiInvocationGateway;
import com.auralis.app.ai.usage.AiInvocationBinding;
import com.auralis.app.ai.usage.AiCredentialSource;
import com.auralis.app.ai.usage.AiOperationKind;
import com.auralis.app.ai.usage.AiOutputRole;
import com.auralis.app.ai.usage.AiUsageLimitException;
import com.auralis.app.ai.usage.AiStage;
import com.auralis.app.ai.usage.AiTaskContext;
import com.auralis.app.ai.usage.AiTaskScope;
import com.auralis.app.ai.usage.AiProviderUsage;
import com.auralis.app.ai.usage.AiPlatformTaskBudgetUsage;
import com.auralis.app.ai.usage.AiPolicyContractException;
import com.auralis.app.ai.usage.OverviewTaskUsageSummary;
import com.auralis.app.shared.config.AuralisProperties;
import com.auralis.app.shared.error.DomainException;
import com.auralis.app.source.SourceIngestionStatus;
import com.auralis.app.source.SourceService;
import com.auralis.app.source.SourceType;
import com.auralis.app.source.SourceView;
import com.auralis.app.subject.SubjectService;
import com.fasterxml.jackson.annotation.JsonInclude;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import tools.jackson.core.JacksonException;
import tools.jackson.core.StreamReadFeature;
import tools.jackson.core.TokenStreamLocation;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.nio.charset.StandardCharsets;
import java.text.Normalizer;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.net.URI;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionException;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.ScheduledExecutorService;
import org.springframework.beans.factory.annotation.Qualifier;
import java.util.concurrent.TimeoutException;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.Function;
import java.util.concurrent.Executor;
import java.util.function.LongSupplier;
import java.util.function.Supplier;

/** Synchronous, non-persistent structured overview generation for the PC-derived cache. */
@Service
public class OverviewGenerationService {

    private static final Logger LOGGER = LoggerFactory.getLogger(OverviewGenerationService.class);

    private static final Set<String> ALLOWED_FAILURE_CODES = Set.of(
            "VALIDATION_FAILED", "UNAUTHENTICATED", "FORBIDDEN", "RESOURCE_NOT_FOUND", "RESOURCE_DELETED",
            "RESOURCE_VERSION_CONFLICT", "MUTATION_REJECTED", "UPLOAD_VALIDATION_FAILED", "INGESTION_FAILED",
            "MODEL_PROVIDER_ERROR", "MODEL_UNAVAILABLE", "MODEL_TIMEOUT", "RATE_LIMITED",
            "OVERVIEW_PROVIDER_OUTPUT_TOO_LARGE",
            "OVERVIEW_PROMPT_BUDGET_EXCEEDED", "OVERVIEW_PROVIDER_OUTPUT_TRUNCATED",
            "OVERVIEW_RECOVERY_EXHAUSTED");
    private static final Set<String> ALLOWED_USAGE_FAILURE_CODES = Set.of(
            "AI_REQUEST_BUDGET_EXCEEDED", "AI_TASK_BUDGET_EXCEEDED", "AI_CONCURRENCY_LIMIT",
            "AI_HOURLY_QUOTA_EXCEEDED", "AI_DAILY_QUOTA_EXCEEDED", "AI_GLOBAL_QUOTA_EXCEEDED",
            "AI_POLICY_CONTRACT_VIOLATION");

    private static final java.util.regex.Pattern PAGE_NUMBER_NOISE = java.util.regex.Pattern.compile("^\\d+$");
    private static final java.util.regex.Pattern CHINESE_PAGE_NUMBER_NOISE = java.util.regex.Pattern.compile("^第[0-9一二三四五六七八九十]+页$");
    private static final String DETAILED_ALGORITHM_VERSION = "overview-markdown-v2";

    private record RawInputUnit(String alias, String sourceAlias, String sourceTitle, UUID sourceId,
                                   UUID sourceRevision, UUID chunkId, UUID generation, int ordinal,
                                   String contentHash, int charStart, int charEnd, String text,
                                   boolean writerCapacityPart) { }
    private record RawInputInventory(List<RawInputUnit> units, Map<String, String> aliases,
                                     String identityFingerprint) { }

    private final SourceService sourceService;
    private final SubjectService subjectService;
    private final SourceChunkRepository chunkRepository;
    private final AiSettingsService settingsService;
    private final AiInvocationGateway invocationGateway;
    private final AuralisProperties properties;
    private final OverviewDocumentValidator documentValidator;
    private final ObjectMapper objectMapper;
    private final OverviewMarkdownPipeline markdownPipeline;
    private final LongSupplier monotonicNanos;
    private final ScheduledExecutorService deadlineScheduler;
    private final Executor generationExecutor;
    private final OverviewGenerationCoordinator generationCoordinator;
    private final OverviewGenerationInvocationJournal generationInvocationJournal;
    @Autowired(required = false)
    private OverviewTrace overviewTrace;
    // Coalesces calls handled by this service instance; it does not coordinate across server replicas.
    private final ConcurrentMap<SourceGenerationKey, SourceGenerationFlight> inFlightSourceGenerations =
            new ConcurrentHashMap<>();

    public OverviewGenerationService(SourceService sourceService, SubjectService subjectService,
                                     SourceChunkRepository chunkRepository, AiSettingsService settingsService,
                                     AiInvocationGateway invocationGateway, AuralisProperties properties,
                                     OverviewDocumentValidator documentValidator, ObjectMapper objectMapper,
                                     @Qualifier("overviewDeadlineScheduler") ScheduledExecutorService deadlineScheduler,
                                     @Qualifier("overviewGenerationExecutor") Executor generationExecutor) {
        this(sourceService, subjectService, chunkRepository, settingsService, invocationGateway, properties,
                documentValidator, objectMapper, System::nanoTime, deadlineScheduler, generationExecutor,
                null, null);
    }

    @Autowired
    public OverviewGenerationService(SourceService sourceService, SubjectService subjectService,
                                     SourceChunkRepository chunkRepository, AiSettingsService settingsService,
                                     AiInvocationGateway invocationGateway, AuralisProperties properties,
                                     OverviewDocumentValidator documentValidator, ObjectMapper objectMapper,
                                     @Qualifier("overviewDeadlineScheduler") ScheduledExecutorService deadlineScheduler,
                                     @Qualifier("overviewGenerationExecutor") Executor generationExecutor,
                                     OverviewGenerationCoordinator generationCoordinator,
                                     OverviewGenerationInvocationJournal generationInvocationJournal) {
        this(sourceService, subjectService, chunkRepository, settingsService, invocationGateway, properties,
                documentValidator, objectMapper, System::nanoTime, deadlineScheduler, generationExecutor,
                generationCoordinator, generationInvocationJournal);
    }

    public OverviewGenerationService(SourceService sourceService, SubjectService subjectService,
                                     SourceChunkRepository chunkRepository, AiSettingsService settingsService,
                                     AiInvocationGateway invocationGateway, AuralisProperties properties,
                                     OverviewDocumentValidator documentValidator, ObjectMapper objectMapper) {
        this(sourceService, subjectService, chunkRepository, settingsService, invocationGateway, properties,
                documentValidator, objectMapper, System::nanoTime, null, Runnable::run, null, null);
    }

    public OverviewGenerationService(SourceService sourceService, SubjectService subjectService,
                                     SourceChunkRepository chunkRepository, AiSettingsService settingsService,
                                     AiInvocationGateway invocationGateway, AuralisProperties properties,
                                     OverviewDocumentValidator documentValidator, ObjectMapper objectMapper,
                                     LongSupplier monotonicNanos) {
        this(sourceService, subjectService, chunkRepository, settingsService, invocationGateway, properties,
                documentValidator, objectMapper, monotonicNanos, null, Runnable::run, null, null);
    }

    public OverviewGenerationService(SourceService sourceService, SubjectService subjectService,
                                     SourceChunkRepository chunkRepository, AiSettingsService settingsService,
                                     AiInvocationGateway invocationGateway, AuralisProperties properties,
                                     OverviewDocumentValidator documentValidator, ObjectMapper objectMapper,
                                     LongSupplier monotonicNanos, ScheduledExecutorService deadlineScheduler,
                                     Executor generationExecutor) {
        this(sourceService, subjectService, chunkRepository, settingsService, invocationGateway, properties,
                documentValidator, objectMapper, monotonicNanos, deadlineScheduler, generationExecutor, null, null);
    }

    OverviewGenerationService(SourceService sourceService, SubjectService subjectService,
                              SourceChunkRepository chunkRepository, AiSettingsService settingsService,
                              AiInvocationGateway invocationGateway, AuralisProperties properties,
                              OverviewDocumentValidator documentValidator, ObjectMapper objectMapper,
                              LongSupplier monotonicNanos, ScheduledExecutorService deadlineScheduler,
                              Executor generationExecutor, OverviewGenerationCoordinator generationCoordinator) {
        this(sourceService, subjectService, chunkRepository, settingsService, invocationGateway, properties,
                documentValidator, objectMapper, monotonicNanos, deadlineScheduler, generationExecutor,
                generationCoordinator, null);
    }

    OverviewGenerationService(SourceService sourceService, SubjectService subjectService,
                              SourceChunkRepository chunkRepository, AiSettingsService settingsService,
                              AiInvocationGateway invocationGateway, AuralisProperties properties,
                              OverviewDocumentValidator documentValidator, ObjectMapper objectMapper,
                              LongSupplier monotonicNanos, ScheduledExecutorService deadlineScheduler,
                              Executor generationExecutor, OverviewGenerationCoordinator generationCoordinator,
                              OverviewGenerationInvocationJournal generationInvocationJournal) {
        this.sourceService = sourceService;
        this.subjectService = subjectService;
        this.chunkRepository = chunkRepository;
        this.settingsService = settingsService;
        this.invocationGateway = invocationGateway;
        this.properties = properties;
        this.documentValidator = documentValidator;
        this.objectMapper = objectMapper;
        this.markdownPipeline = new OverviewMarkdownPipeline(objectMapper);
        this.monotonicNanos = Objects.requireNonNull(monotonicNanos);
        this.deadlineScheduler = deadlineScheduler;
        this.generationExecutor = Objects.requireNonNull(generationExecutor);
        this.generationCoordinator = generationCoordinator;
        this.generationInvocationJournal = generationInvocationJournal;
    }

    public OverviewResponse generateSource(UUID userId, SourceOverviewRequest request) {
        return generateSource(userId, request, null);
    }

    public OverviewResponse generateSource(UUID userId, SourceOverviewRequest request, String requestId) {
        return generateSource(userId, request, requestId, null);
    }

    public OverviewResponse generateSource(UUID userId, SourceOverviewRequest request, String requestId,
                                           OverviewCancellation requestCancellation) {
        return generateSource(userId, request, requestId, requestCancellation, null);
    }

    public OverviewResponse generateSource(UUID userId, SourceOverviewRequest request, String requestId,
                                           OverviewCancellation requestCancellation,
                                           OverviewTaskDeadline ingressDeadline) {
        return generateSourceInternal(userId, request, requestId, requestCancellation, ingressDeadline);
    }

    private OverviewResponse generateSourceInternal(UUID userId, SourceOverviewRequest request, String requestId,
                                                    OverviewCancellation requestCancellation,
                                                    OverviewTaskDeadline ingressDeadline) {
        OverviewTaskDeadline deadline = ingressDeadline == null
                ? newTaskDeadline() : ingressDeadline.retain();
        GenerationContext context = new GenerationContext(userId, request == null ? null : request.sourceId(), null,
                request == null ? null : request.mode(), normalizeRequestId(requestId), UUID.randomUUID().toString(),
                deadline, null);
        OverviewTraceRun traceRun = safeTrace().start(userId, parseUuid(context.requestId()), null, null);
        context.recoveryTracker().traceRun(traceRun);
        traceEvent(context, "REQUEST", "OVERVIEW", "STARTED", Map.of("scope", "SOURCE"), null);
        logStart(context);
        try {
        context.deadline().remainingMillis();
        requireRequest(userId, request);
        if (request.mode() == null || request.sourceId() == null) throw new DomainException("VALIDATION_FAILED", "sourceId and mode are required");
        logPhase(context, "REQUEST_VALIDATE_SUCCESS", "");
        validateInstruction(request.instruction());
        logPhase(context, "SOURCE_VALIDATE_START", "");
        SourceView source = sourceService.requireActiveSource(userId, request.sourceId());
        context = context.withSource(source.id(), source.ingestionRevision());
        logPhase(context, "SOURCE_VALIDATE_SUCCESS", "status={}", source.ingestionStatus());
        if (source.ingestionStatus() != SourceIngestionStatus.READY) {
            throw new DomainException("MUTATION_REJECTED", "Source is not ready for overview generation");
        }
        AiSettingsService.ResolvedSettings settings = resolveOverviewSettings(userId);
        context = context.withSettings(settings, resolveModelBudget(settings));
        boolean detailed = source.type() == SourceType.FILE;
        if (!detailed && request.mode() != OverviewMode.SUMMARY) throw new DomainException("MODEL_UNAVAILABLE", "Detailed Overview requires a parsed file source");
        List<SourceChunkEntity> activeChunks = findActiveChunks(userId, source.id());
        DetailedSourceInput detailedInput = detailed ? detailedSnapshot(source, activeChunks) : null;
        List<String> chunks = detailed ? List.of(detailedInput.snapshot().text()) : summaryChunks(activeChunks);
        if (chunks.isEmpty()) {
            throw new DomainException("MUTATION_REJECTED", "Source has no active chunks for overview generation");
        }
        Map<String, String> sourceAliases = Map.of("source-1", source.id().toString());
        Map<String, String> sourceReplayAliases = new LinkedHashMap<>();
        sourceReplayAliases.put(source.id().toString(), source.id().toString());
        sourceReplayAliases.putAll(sourceAliases);
        traceEvent(context, "INPUT_SNAPSHOT", "PARSED_SOURCE", "READY",
                traceMetadata(context, Map.of("scope", "SOURCE", "sourceId", source.id().toString(),
                        "sourceRevision", String.valueOf(source.ingestionRevision()),
                        "sourceTitle", Objects.toString(source.title(), ""),
                        "mode", request.mode().name(), "itemCount",
                        String.valueOf(detailed ? activeChunks.size() : chunks.size()))),
                () -> Map.of("parsedText", boundedInputText(chunks)));
        String payloadFingerprint = detailed ? detailedSourceFingerprint(source, request, activeChunks)
                : sourcePayloadFingerprint(source, request, chunks);
        String profileFingerprint = profileFingerprint(settings, context.modelBudget());
        String inputFingerprint = detailed ? payloadFingerprint
                : sha256(write(List.of("SOURCE", source.id(), source.ingestionRevision(),
                source.title(), request.mode(), Objects.toString(request.instruction(), ""), sha256(write(chunks)))));
        OverviewGenerationCoordinator.Request durableRequest = generationCoordinator == null ? null
                : new OverviewGenerationCoordinator.Request(userId, UUID.fromString(context.requestId()),
                "SOURCE", source.id(), source.ingestionRevision(), inputFingerprint, payloadFingerprint,
                profileFingerprint, DETAILED_ALGORITHM_VERSION,
                List.of(new OverviewGenerationCoordinator.SourceDependency(source.id(), source.ingestionRevision(), source.title())),
                request.retryOfRequestId());
        context = context.withSourceRequest(durableRequest, payloadFingerprint, request.instruction());
        GenerationContext generationContext = context;
        SourceGenerationKey key = new SourceGenerationKey(userId, source.id(), source.ingestionRevision(),
                source.title(), request.mode(), request.instruction() == null ? "" : request.instruction(),
                payloadFingerprint, profileFingerprint, "");
        OverviewResponse result;
        java.util.Optional<OverviewGenerationCoordinator.Acquisition> mappedRequest = durableRequest == null
                ? java.util.Optional.empty() : generationCoordinator.lookupRequest(durableRequest);
        if (mappedRequest.isPresent()) {
            OverviewGenerationCoordinator.Acquisition mapped = generationCoordinator.acquire(durableRequest);
            OverviewCancellation.Registration cancellationRegistration = requestCancellation == null ? () -> { }
                    : requestCancellation.onCancel(() -> generationContext.deadline().cancellation().cancel(
                            requestCancellation.reason() == OverviewCancellation.Reason.DEADLINE
                                    ? OverviewCancellation.Reason.DEADLINE : OverviewCancellation.Reason.REQUEST_DISCONNECTED));
            try {
                result = runDurableAcquisition(mapped, generationContext, generationContext.deadline().cancellation(), acquisition ->
                        generateSourceOverview(generationContext.withCancellation(generationContext.deadline().cancellation())
                                .withAcquisition(acquisition), request, source, chunks, detailedInput),
                        sourceReplayAliases);
            } finally {
                cancellationRegistration.close();
            }
        } else if (request.retryOfRequestId() != null && durableRequest != null) {
            OverviewGenerationCoordinator.Acquisition acquisition = generationCoordinator.acquire(durableRequest);
            OverviewCancellation cancellation = generationContext.deadline().cancellation();
            OverviewCancellation.Registration registration = requestCancellation == null ? () -> { }
                    : requestCancellation.onCancel(() -> cancellation.cancel(requestCancellation.reason()));
            try {
                result = runDurableAcquisition(acquisition, generationContext, cancellation,
                        selected -> generateSourceOverview(generationContext.withCancellation(cancellation)
                                .withAcquisition(selected), request, source, chunks, detailedInput),
                        sourceReplayAliases);
            } finally {
                registration.close();
            }
        } else {
            result = singleFlight(key, context, requestCancellation, durableRequest,
                    sourceReplayAliases,
                    (operationContext, acquisition) -> {
                        operationContext = operationContext
                                .withAcquisition(acquisition);
                        return generateSourceOverview(operationContext, request, source, chunks, detailedInput);
                    });
        }
        context.deadline().remainingMillis();
        requireCurrentSource(context);
        logSuccess(context);
        traceEvent(context, "ASSEMBLED_OUTPUT", "OVERVIEW", "SUCCESS", traceMetadata(context, Map.of()),
                () -> Map.of("overview", write(result)));
        safeTrace().finish(traceRun, "SUCCESS", null, traceMetadata(context, Map.of()));
        return result;
        } catch (RuntimeException exception) {
            logFailure(context, exception);
            safeTrace().finish(traceRun, isCancellation(exception) ? "CANCELLED" : "FAILED",
                    stableErrorCode(exception), traceMetadata(context, Map.of()));
            throw exception;
        } finally {
            context.deadline().finish();
        }
    }

    public void preflightSource(UUID userId, SourceOverviewRequest request) {
        requireRequest(userId, request);
        if (request.mode() == null || request.sourceId() == null) {
            throw new DomainException("VALIDATION_FAILED", "sourceId and mode are required");
        }
        validateInstruction(request.instruction());
        SourceView source = sourceService.requireActiveSource(userId, request.sourceId());
        if (source.ingestionStatus() != SourceIngestionStatus.READY) {
            throw new DomainException("MUTATION_REJECTED", "Source is not ready for overview generation");
        }
        List<SourceChunkEntity> chunks = findActiveChunks(userId, source.id());
        if (source.type() == SourceType.FILE || request.mode() != OverviewMode.SUMMARY) {
            detailedSnapshot(source, chunks);
            return;
        }
        if (chunks.isEmpty()) throw new DomainException("MUTATION_REJECTED", "Source has no active chunks for overview generation");
    }

    /** Rebuilds the current raw-source identity without resolving credentials, profile, or Provider state. */
    public OverviewInputDescriptor currentRawInputDescriptor(UUID userId, String scope,
                                                             UUID scopeId, List<UUID> orderedSourceIds) {
        if (!"SOURCE".equals(scope) && !"SUBJECT".equals(scope)
                || scopeId == null || orderedSourceIds == null || orderedSourceIds.isEmpty()
                || exceeded(orderedSourceIds.size(), overviewLimits().maxSources())
                || orderedSourceIds.stream().anyMatch(Objects::isNull)
                || orderedSourceIds.stream().distinct().count() != orderedSourceIds.size()) {
            throw new DomainException("RESOURCE_VERSION_CONFLICT", "Stored raw Overview input scope is invalid");
        }
        List<SourceView> sources = new ArrayList<>(orderedSourceIds.size());
        Map<UUID, String> sourceAliases = new LinkedHashMap<>();
        if ("SOURCE".equals(scope)) {
            if (orderedSourceIds.size() != 1 || !scopeId.equals(orderedSourceIds.getFirst())) {
                throw new DomainException("RESOURCE_VERSION_CONFLICT", "Stored raw Overview source scope changed");
            }
            SourceView source = sourceService.requireActiveSource(userId, scopeId);
            if (source.ingestionStatus() != SourceIngestionStatus.READY || source.ingestionRevision() == null) {
                throw new DomainException("RESOURCE_VERSION_CONFLICT", "Stored raw Overview source is no longer READY");
            }
            sources.add(source);
            sourceAliases.put(source.id(), "source-1");
        } else {
            subjectService.requireActiveSubject(userId, scopeId);
            for (int index = 0; index < orderedSourceIds.size(); index++) {
                SourceView source = sourceService.requireActiveSource(userId, orderedSourceIds.get(index));
                if (!scopeId.equals(source.subjectId()) || source.ingestionStatus() != SourceIngestionStatus.READY
                        || source.ingestionRevision() == null) {
                    throw new DomainException("RESOURCE_VERSION_CONFLICT", "Stored raw Overview source scope changed");
                }
                sources.add(source);
                sourceAliases.put(source.id(), "source-" + (index + 1));
            }
        }
        RawInputInventory inventory = loadRawInputInventory(userId, sources, sourceAliases);
        List<OverviewInputDescriptor.SourceRevision> revisions = sources.stream()
                .map(source -> new OverviewInputDescriptor.SourceRevision(source.id(), source.ingestionRevision())).toList();
        List<OverviewInputDescriptor.OverviewPartInputUnit> units = inventory.units().stream()
                .map(unit -> new OverviewInputDescriptor.OverviewPartInputUnit(unit.alias(), unit.sourceId(),
                        unit.sourceRevision(), unit.chunkId(), unit.generation(), unit.ordinal(), unit.contentHash(),
                        unit.charStart(), unit.charEnd())).toList();
        String fingerprint = sha256(write(List.of("AURALIS-OVERVIEW-SOURCE-CONTENT-V1", scope, scopeId,
                orderedSourceIds, revisions, units, inventory.identityFingerprint())));
        return new OverviewInputDescriptor(OverviewInputDescriptor.Origin.SOURCE_CONTENT, scope, scopeId,
                orderedSourceIds, revisions, units, List.of(), fingerprint);
    }

    private OverviewResponse generateSourceOverview(GenerationContext context, SourceOverviewRequest request,
                                                     SourceView source, List<String> chunks,
                                                     DetailedSourceInput detailedInput) {
        requireDetailedSourceActive(context);
        requireModelCapacity(context);
        try (AiTaskScope scope = invocationGateway.beginTask(taskContext(context, AiFeature.SOURCE_OVERVIEW))) {
            String original = detailedInput == null ? String.join("\n\n", chunks) : detailedInput.snapshot().text();
            OverviewResponse response = markdownPipeline.generate(original, source.title(), request.mode(), request.instruction(),
                    (stage, system, user, minimumOutput) -> completeDetailedStage(scope, context, stage, system, user, minimumOutput),
                    (stage, system, user, minimumOutput) -> planDetailedStage(context, stage, system, user, minimumOutput).fits());
            requireDetailedSourceActive(context);
            validateModeFields(response, request.mode());
            return documentValidator.validateProviderDocument(write(response));
        }
    }

    private String completeDetailedStage(AiTaskScope scope, GenerationContext context, OverviewMarkdownPipeline.Stage stage,
                                         String system, String user, long minimumOutput) {
        requireDetailedSourceActive(context);
        AiSettingsService.ResolvedSettings settings = context.settings();
        DetailedStagePlan planned = planDetailedStage(context, stage, system, user, minimumOutput);
        OverviewBudgetPlanner.StagePlan plan = planned.budget();
        if (!planned.fits()) {
            throw promptBudgetFailure(context, stage.name(), "Overview stage exceeds its model input and output capacity");
        }
        long outputTokens = plan.outputTokens();
        if (settings.source() == AiCredentialSource.PLATFORM) {
            var usage = scope.platformTaskBudgetUsage();
            long remaining = Math.max(0, overviewTaskTokens() - usage.chargedTokens());
            remaining = Math.max(0, remaining - usage.reservedTokens());
            long affordableOutput = remaining - plan.estimatedInputTokens();
            if (affordableOutput < minimumOutput) {
                throw new AiUsageLimitException("AI_TASK_BUDGET_EXCEEDED", 422, 0, null);
            }
            outputTokens = Math.min(outputTokens, affordableOutput);
        }
        int reservedOutput = Math.toIntExact(outputTokens);

        AiStage usageStage = stage.mapStage() ? AiStage.OVERVIEW_MAP : AiStage.OVERVIEW_REDUCE;
        AiInvocationBinding journal = context.acquisition() != null && context.acquisition().lease() != null
                && generationInvocationJournal != null
                ? generationInvocationJournal.binding(context.acquisition().lease(), stage.name(),
                        AiOutputRole.INTERMEDIATE.name())
                : null;
        AiInvocationBinding admission = new AiInvocationBinding() {
            @Override public void beforeReservation() {
                requireDetailedSourceActive(context);
                if (journal != null) journal.beforeReservation();
            }
            @Override public long responseTimeoutMillis(long requestedMillis) {
                return context.deadline().responseTimeoutMillis(requestedMillis);
            }
            @Override public void onReserved(UUID reservationId) {
                if (journal != null) journal.onReserved(reservationId);
                traceEvent(context, "PROVIDER_RESERVATION", stage.name(), "RESERVED",
                        traceMetadata(context, Map.of("reservationId", reservationId.toString())), null);
            }
            @Override public void beforeDispatch(UUID reservationId) {
                requireDetailedSourceActive(context);
                if (journal != null) journal.beforeDispatch(reservationId);
                traceEvent(context, "PROVIDER_DISPATCH", stage.name(), "DISPATCHED",
                        traceMetadata(context, Map.of("reservationId", reservationId.toString())), null);
            }
        };
        AiProviderRequest request = planned.request().withMaxTokens(reservedOutput);
        traceEvent(context, "PROVIDER_REQUEST_ATTEMPT", stage.name(), "PRE_DISPATCH",
                traceMetadata(context, Map.of("estimatedInputTokens", String.valueOf(plan.estimatedInputTokens()),
                        "outputTokenReserve", String.valueOf(reservedOutput))),
                () -> Map.of("systemPrompt", system, "userPrompt", user));
        AiProviderResponse response;
        try {
            response = scope.complete(usageStage, settings.provider(), request, settings.credential(), settings.source(),
                    context.deadline().responseTimeoutMillis(overviewResponseTimeoutMillis()), AiOutputRole.INTERMEDIATE,
                    context.cancellation(), admission).value();
        } catch (DomainException | AiUsageLimitException failure) {
            throw failure;
        } catch (RuntimeException failure) {
            throw new DomainException("MODEL_PROVIDER_ERROR", "AI provider failed to generate an overview", null, failure);
        }
        requireDetailedSourceActive(context);
        if (response == null || response.content() == null || response.content().isBlank()) {
            throw providerInvalid("stage output is empty");
        }
        traceEvent(context, "PROVIDER_RESPONSE", stage.name(), "RETURNED",
                traceMetadata(context, Map.of("inputTokens", Objects.toString(response.inputTokens(), ""),
                        "outputTokens", Objects.toString(response.outputTokens(), ""),
                        "finishReason", Objects.toString(response.finishReason(), ""))),
                () -> Map.of("providerContent", response.content()));
        if ("length".equalsIgnoreCase(Objects.toString(response.finishReason(), "").trim())
                || response.outputTokens() != null && response.outputTokens() >= reservedOutput) {
            throw new DomainException("OVERVIEW_PROVIDER_OUTPUT_TRUNCATED",
                    "AI provider stopped at its output token limit");
        }
        return response.content();
    }

    private DetailedStagePlan planDetailedStage(GenerationContext context, OverviewMarkdownPipeline.Stage stage,
                                                String system, String user, long minimumOutput) {
        checkPlanningActive(context);
        AiProviderRequest request = new AiProviderRequest(context.settings().chatModel(),
                List.of(new AiProviderRequest.Message(AiMessageRole.SYSTEM, system),
                        new AiProviderRequest.Message(AiMessageRole.USER, user)),
                0.1, null, stage.structuredJson());
        OverviewBudgetPlanner.StagePlan budget = OverviewBudgetPlanner.planStage(request,
                requireModelCapacity(context), minimumOutput, overviewLimits().maxOutputTokens());
        return new DetailedStagePlan(request, budget, budget.outputTokens() >= minimumOutput
                && withinConfiguredCapacity(system, user, budget.estimatedInputTokens()));
    }

    private record DetailedStagePlan(AiProviderRequest request, OverviewBudgetPlanner.StagePlan budget, boolean fits) { }

    private void requireDetailedSourceActive(GenerationContext context) {
        checkPlanningActive(context);
        requireCurrentSource(context);
        requireOwnerActive(context);
    }

    private OverviewResponse singleFlight(SourceGenerationKey key, GenerationContext generationContext,
                                          OverviewCancellation requestCancellation,
                                          OverviewGenerationCoordinator.Request durableRequest,
                                          Map<String, String> replayAliases,
                                          java.util.function.BiFunction<GenerationContext,
                                                  OverviewGenerationCoordinator.Acquisition, OverviewResponse> operation) {
        SourceGenerationFlight flight;
        OverviewTaskDeadline deadline = generationContext.deadline();
        Runnable detach;
        SourceGenerationFlight flightToStart = null;
        boolean owner = false;
        synchronized (inFlightSourceGenerations) {
            while (true) {
                flight = inFlightSourceGenerations.get(key);
                if (flight != null) {
                    detach = flight.tryAttachInterest();
                    if (detach != null) break;
                    inFlightSourceGenerations.remove(key, flight);
                }
                flight = new SourceGenerationFlight();
                detach = flight.tryAttachInterest();
                inFlightSourceGenerations.put(key, flight);
                owner = true;
                break;
            }
            if (owner) {
                SourceGenerationFlight ownedFlight = flight;
                flightToStart = ownedFlight;
                deadline.retain();
                Runnable ownerDetach = detach;
                ownedFlight.ownerDetach = ownerDetach;
                ownedFlight.ownerCancellation = requestCancellation == null ? () -> { }
                        : requestCancellation.onCancel(() -> {
                            if (requestCancellation.reason() == OverviewCancellation.Reason.DEADLINE) {
                                ownedFlight.cancel(OverviewCancellation.Reason.DEADLINE);
                            }
                            ownerDetach.run();
                        });
                ownedFlight.ownerDeadline = deadline.cancellation()
                        .onCancel(() -> ownedFlight.cancel(OverviewCancellation.Reason.DEADLINE));
            }
        }
        CompletableFuture<Void> participantBinding = CompletableFuture.completedFuture(null);
        if (durableRequest != null) {
            SourceGenerationFlight participantFlight = flight;
            participantBinding = participantFlight.binding.thenAccept(binding ->
                    generationCoordinator.associateRequest(binding, durableRequest));
        }
        if (owner) {
            SourceGenerationFlight ownedFlight = flightToStart;
            CompletableFuture<Void> ownerBinding = participantBinding;
            try {
                generationExecutor.execute(() -> {
                    try {
                        if (ownedFlight.cancellation.isCancelled()) {
                            throw new DomainException("MODEL_TIMEOUT", "Overview request was cancelled");
                        }
                        OverviewGenerationCoordinator.Acquisition binding = null;
                        if (durableRequest != null) {
                            binding = generationCoordinator.acquire(durableRequest);
                            ownedFlight.binding.complete(binding);
                            ownerBinding.join();
                        }
                        OverviewResponse value = durableRequest == null
                                ? operation.apply(generationContext.withCancellation(ownedFlight.cancellation)
                                        .withLocalFlight(key, ownedFlight), null)
                                : runDurableAcquisition(binding, generationContext.withCancellation(ownedFlight.cancellation)
                                        .withLocalFlight(key, ownedFlight),
                                        ownedFlight.cancellation,
                                        acquisition -> operation.apply(generationContext.withCancellation(ownedFlight.cancellation)
                                                .withLocalFlight(key, ownedFlight).withAcquisition(acquisition), acquisition),
                                        replayAliases);
                        deadline.remainingMillis();
                        ownedFlight.result.complete(value);
                    } catch (RuntimeException | Error failure) {
                        if (durableRequest != null) ownedFlight.binding.completeExceptionally(failure);
                        ownedFlight.result.completeExceptionally(failure);
                    } finally {
                        inFlightSourceGenerations.remove(key, ownedFlight);
                        ownedFlight.ownerCancellation.close();
                        ownedFlight.ownerDeadline.close();
                        deadline.finish();
                    }
                });
            } catch (RuntimeException rejected) {
                inFlightSourceGenerations.remove(key, ownedFlight);
                ownedFlight.ownerCancellation.close();
                ownedFlight.ownerDeadline.close();
                deadline.finish();
                DomainException unavailable = new DomainException(
                        "SERVICE_UNAVAILABLE", "Overview capacity is temporarily unavailable", null, rejected);
                if (durableRequest != null) ownedFlight.binding.completeExceptionally(unavailable);
                ownedFlight.result.completeExceptionally(unavailable);
            }
            return awaitOwner(flight, deadline, requestCancellation, participantBinding);
        }
        return await(flight, deadline, requestCancellation, detach, participantBinding);
    }

    private OverviewResponse awaitOwner(SourceGenerationFlight flight, OverviewTaskDeadline deadline,
                                        OverviewCancellation requestCancellation, CompletableFuture<Void> participantBinding) {
        try {
            waitForBinding(participantBinding, deadline, requestCancellation);
            return awaitResult(flight, deadline, requestCancellation);
        } finally {
            flight.ownerDetach.run();
        }
    }

    private OverviewResponse await(SourceGenerationFlight inFlight, OverviewTaskDeadline deadline,
                                   OverviewCancellation requestCancellation, Runnable detach,
                                   CompletableFuture<Void> participantBinding) {
        OverviewCancellation.Registration deadlineRegistration = deadline.cancellation().onCancel(detach);
        OverviewCancellation.Registration requestRegistration = requestCancellation == null ? () -> { }
                : requestCancellation.onCancel(detach);
        try {
            waitForBinding(participantBinding, deadline, requestCancellation);
            return awaitResult(inFlight, deadline, requestCancellation);
        } finally {
            detach.run();
            deadlineRegistration.close();
            requestRegistration.close();
        }
    }

    private void waitForBinding(CompletableFuture<Void> binding, OverviewTaskDeadline deadline,
                                OverviewCancellation requestCancellation) {
        try {
            while (true) {
                if (requestCancellation != null && requestCancellation.isCancelled()) {
                    throw new DomainException("MODEL_TIMEOUT", "Overview request was cancelled");
                }
                try {
                    binding.get(Math.min(100, deadline.remainingMillis()), TimeUnit.MILLISECONDS);
                    return;
                } catch (TimeoutException ignored) { }
            }
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new DomainException("MODEL_TIMEOUT", "Overview request was interrupted", null, exception);
        } catch (ExecutionException exception) {
            Throwable cause = exception.getCause();
            if (cause instanceof RuntimeException runtimeException) throw runtimeException;
            throw new CompletionException(cause);
        }
    }

    private OverviewResponse runDurableAcquisition(OverviewGenerationCoordinator.Acquisition initial,
                                                   GenerationContext context,
                                                   OverviewCancellation cancellation,
                                                   Function<OverviewGenerationCoordinator.Acquisition,
                                                           OverviewResponse> ownerOperation,
                                                   Map<String, String> replayAliases) {
        OverviewGenerationCoordinator.Acquisition acquisition = initial;
            context.recoveryTracker().generationId(acquisition.generationId());
            traceEvent(context, "GENERATION_ACQUISITION", "DURABLE_GENERATION", acquisition.state().name(),
                    traceMetadata(context, Map.of("generationId", Objects.toString(acquisition.generationId(), ""),
                            "budgetTaskId", acquisition.budgetTaskId() == null ? "" : acquisition.budgetTaskId().toString())), null);
            context.deadline().remainingMillis();
            if (cancellation != null && cancellation.isCancelled()) {
                throw new DomainException("MODEL_TIMEOUT", "Overview request was cancelled");
            }
            if (acquisition.state() == OverviewGenerationCoordinator.AcquisitionState.FAILED) {
                throw new DomainException("OVERVIEW_GENERATION_FAILED", "The previous overview generation failed");
            }
            if (acquisition.state() == OverviewGenerationCoordinator.AcquisitionState.REPLAY) {
                requireCurrentSource(context);
                traceEvent(context, "CACHE_REUSE", "DURABLE_GENERATION", "REQUEST_REPLAY",
                        traceMetadata(context, Map.of("generationId", Objects.toString(acquisition.generationId(), ""))), null);
                return readDurableResult(acquisition.resultJson(), replayAliases, context.mode());
            }
            if (acquisition.state() == OverviewGenerationCoordinator.AcquisitionState.WAITER) {
                traceEvent(context, "GENERATION_WAIT", "DURABLE_GENERATION", "WAITING",
                        traceMetadata(context, Map.of("generationId", Objects.toString(acquisition.generationId(), ""))), null);
                OverviewGenerationCoordinator.AwaitResult outcome = generationCoordinator.await(acquisition,
                        java.time.Duration.ofMillis(context.deadline().remainingMillis()),
                        () -> cancellation != null && cancellation.isCancelled());
                if ("SUCCESS".equals(outcome.status())) {
                    requireCurrentSource(context);
                    traceEvent(context, "CACHE_REUSE", "DURABLE_GENERATION", "WAITER_RESULT",
                            traceMetadata(context, Map.of("generationId", Objects.toString(acquisition.generationId(), ""))), null);
                    return readDurableResult(outcome.resultJson(), replayAliases, context.mode());
                }
                if ("EXPIRED".equals(outcome.status())) {
                    throw new DomainException("MODEL_TIMEOUT", "Overview generation ownership expired");
                }
                if ("FAILED".equals(outcome.status())) {
                    OverviewGenerationCoordinator.FailureDetails failureDetails = outcome.failureDetails();
                    if (failureDetails != null) {
                        throw new AiUsageLimitException(outcome.errorCode(), failureDetails.status(),
                                failureDetails.retryAfterSeconds(), failureDetails.resetAt());
                    }
                    throw new DomainException(outcome.errorCode() == null ? "OVERVIEW_GENERATION_FAILED" : outcome.errorCode(),
                            "The previous overview generation failed; submit a new request to resume it");
                }
                throw new DomainException("MODEL_TIMEOUT", "Overview generation ownership expired");
            }
            OverviewGenerationCoordinator.GenerationLease lease = acquisition.lease();
            if (lease == null) throw new DomainException("MODEL_TIMEOUT", "Overview generation lease is unavailable");
            if (lease.fence() > 1) {
                logBudgetRootEventFromDiagnostic(context, acquisition, "RESUME");
            }
            if (generationInvocationJournal != null && !generationInvocationJournal.allSafe(lease)) {
                generationCoordinator.fail(lease, "OVERVIEW_RECOVERY_EXHAUSTED",
                        invocationGateway.overviewTaskUsage(new AiTaskContext(context.userId(), context.sourceId() == null
                                ? AiFeature.SUBJECT_OVERVIEW : AiFeature.SOURCE_OVERVIEW,
                                acquisition.generationId().toString(), acquisition.budgetTaskId())),
                        context.recoveryTracker().count(), context.recoveryTracker().actions());
                throw new DomainException("OVERVIEW_RECOVERY_EXHAUSTED",
                        "An earlier Overview provider call has unresolved dispatch usage and requires recovery");
            }
            AtomicBoolean lostLease = new AtomicBoolean();
            AutoCloseable heartbeat = generationCoordinator.startHeartbeat(lease, () -> {
                lostLease.set(true);
                if (cancellation != null) cancellation.cancel(OverviewCancellation.Reason.DEADLINE);
            });
            try {
                OverviewResponse value = ownerOperation.apply(acquisition);
                context.deadline().remainingMillis();
                requireCurrentSource(context.withAcquisition(acquisition));
                if (lostLease.get() || cancellation != null && cancellation.isCancelled()
                        || !generationCoordinator.owns(lease)) {
                    throw new DomainException("MODEL_TIMEOUT", "Overview generation ownership expired");
                }
                String resultJson = write(value);
                if (context.localFlight() != null) context.localFlight().closeForNewInterests();
                OverviewTaskUsageSummary usage = invocationGateway.overviewTaskUsage(
                        new AiTaskContext(context.userId(), context.sourceId() == null
                                ? AiFeature.SUBJECT_OVERVIEW : AiFeature.SOURCE_OVERVIEW,
                                acquisition.generationId().toString(), acquisition.budgetTaskId()));
                if (!generationCoordinator.complete(lease, resultJson, usage,
                        context.recoveryTracker().count(), context.recoveryTracker().actions())) {
                    throw new DomainException("MODEL_TIMEOUT", "Overview generation ownership expired before completion");
                }
                logBudgetRootEventBestEffort(context, acquisition, "COMPLETE", null, usage);
                return value;
            } catch (RuntimeException failure) {
                String errorCode = stableErrorCode(failure);
                OverviewGenerationCoordinator.FailureDetails failureDetails = failure instanceof AiUsageLimitException usageFailure
                        && errorCode.equals(usageFailure.code())
                        ? new OverviewGenerationCoordinator.FailureDetails(usageFailure.status(),
                        usageFailure.retryAfterSeconds(), usageFailure.resetAt())
                        : null;
                OverviewTaskUsageSummary usage = invocationGateway.overviewTaskUsage(
                        new AiTaskContext(context.userId(), context.sourceId() == null
                                ? AiFeature.SUBJECT_OVERVIEW : AiFeature.SOURCE_OVERVIEW,
                                acquisition.generationId().toString(), acquisition.budgetTaskId()));
                if ("AI_TASK_BUDGET_EXCEEDED".equals(errorCode)) {
                    logBudgetRootEventBestEffort(context, acquisition, "STOP", errorCode, usage);
                }
                generationCoordinator.fail(lease, errorCode, failureDetails, usage,
                        context.recoveryTracker().count(), context.recoveryTracker().actions());
                throw failure;
            } finally {
                try { heartbeat.close(); } catch (Exception ignored) { }
            }
    }

    private OverviewResponse readDurableResult(String payload, Map<String, String> aliases, OverviewMode mode) {
        if (payload == null) throw new DomainException("VALIDATION_FAILED", "Stored overview response is missing");
        OverviewResponse response = documentValidator.validateProviderDocument(payload);
        validateModeFields(response, mode);
        return response;
    }

    private OverviewResponse awaitResult(SourceGenerationFlight inFlight, OverviewTaskDeadline deadline,
                                         OverviewCancellation requestCancellation) {
        try {
            while (true) {
                if (requestCancellation != null && requestCancellation.isCancelled()) {
                    throw new DomainException("MODEL_TIMEOUT", "Overview request was cancelled");
                }
                try {
                    return inFlight.result.get(Math.min(100, deadline.remainingMillis()), TimeUnit.MILLISECONDS);
                } catch (TimeoutException poll) {
                    // Polling keeps cancellation responsive without consuming the generation executor.
                }
            }
        } catch (CompletionException exception) {
            Throwable cause = exception.getCause();
            if (cause instanceof RuntimeException runtimeException) throw runtimeException;
            if (cause instanceof Error error) throw error;
            throw exception;
        } catch (ExecutionException exception) {
            Throwable cause = exception.getCause();
            if (cause instanceof RuntimeException runtimeException) throw runtimeException;
            if (cause instanceof Error error) throw error;
            throw new CompletionException(cause);
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new DomainException("MODEL_TIMEOUT", "Overview generation was interrupted", null, exception);
        }
    }

    public OverviewResponse generateSubject(UUID userId, SubjectOverviewRequest request) {
        return generateSubject(userId, request, null);
    }

    public OverviewResponse generateSubject(UUID userId, SubjectOverviewRequest request, String requestId) {
        return generateSubject(userId, request, requestId, null);
    }

    public OverviewResponse generateSubject(UUID userId, SubjectOverviewRequest request, String requestId,
                                            OverviewCancellation requestCancellation) {
        return generateSubject(userId, request, requestId, requestCancellation, null);
    }

    public OverviewResponse generateSubject(UUID userId, SubjectOverviewRequest request, String requestId,
                                            OverviewCancellation requestCancellation,
                                            OverviewTaskDeadline ingressDeadline) {
        return generateSubjectInternal(userId, request, requestId, requestCancellation, ingressDeadline);
    }

    private OverviewResponse generateSubjectInternal(UUID userId, SubjectOverviewRequest request, String requestId,
                                             OverviewCancellation requestCancellation,
                                             OverviewTaskDeadline ingressDeadline) {
        OverviewTaskDeadline deadline = ingressDeadline == null
                ? newTaskDeadline() : ingressDeadline.retain();
        GenerationContext baseContext = new GenerationContext(userId, null, null,
                request == null ? null : request.mode(), normalizeRequestId(requestId), UUID.randomUUID().toString(),
                deadline, null);
        OverviewTraceRun traceRun = safeTrace().start(userId, parseUuid(baseContext.requestId()), null, null);
        baseContext.recoveryTracker().traceRun(traceRun);
        traceEvent(baseContext, "REQUEST", "OVERVIEW", "STARTED", Map.of("scope", "SUBJECT"), null);
        OverviewCancellation.Registration requestRegistration = requestCancellation == null ? () -> { }
                : requestCancellation.onCancel(() -> baseContext.deadline().cancellation().cancel(
                        requestCancellation.reason() == OverviewCancellation.Reason.DEADLINE
                                ? OverviewCancellation.Reason.DEADLINE
                                : OverviewCancellation.Reason.REQUEST_DISCONNECTED));
        GenerationContext context = baseContext.withCancellation(baseContext.deadline().cancellation());
        logStart(context);
        try {
        context.deadline().remainingMillis();
        requireRequest(userId, request);
        if (request.mode() == null || request.subjectId() == null) throw new DomainException("VALIDATION_FAILED", "subjectId and mode are required");
        logPhase(context, "REQUEST_VALIDATE_SUCCESS", "");
        subjectService.requireActiveSubject(userId, request.subjectId());
        validateSubjectInputs(request);
        Map<String, String> aliases = new LinkedHashMap<>();
        List<ModelSubjectInput> safeSources = new ArrayList<>();
        List<SourceView> resolvedSources = new ArrayList<>();
        Set<UUID> seen = new LinkedHashSet<>();
        int index = 1;
        for (SubjectOverviewSourceInput input : request.sources()) {
            if (!seen.add(input.sourceId())) {
                throw new DomainException("VALIDATION_FAILED", "Subject overview contains duplicate sourceId");
            }
            SourceView source = sourceService.requireActiveSource(userId, input.sourceId());
            if (!request.subjectId().equals(source.subjectId())) {
                throw new DomainException("MUTATION_REJECTED", "Source does not belong to the requested subject");
            }
            String alias = "source-" + index++;
            aliases.put(alias, source.id().toString());
            resolvedSources.add(source);
        }
        for (int sourceIndex = 0; sourceIndex < request.sources().size(); sourceIndex++) {
            SubjectOverviewSourceInput input = request.sources().get(sourceIndex);
            SourceView source = resolvedSources.get(sourceIndex);
            String alias = "source-" + (sourceIndex + 1);
            safeSources.add(new ModelSubjectInput(alias, source.title(),
                    input.outlineMarkdown(), input.summaryMarkdown()));
        }
        if (safeSources.isEmpty()) {
            throw new DomainException("VALIDATION_FAILED", "Subject overview requires at least one usable source");
        }
        AiSettingsService.ResolvedSettings settings = resolveOverviewSettings(userId);
        context = context.withSettings(settings, resolveModelBudget(settings))
                ;
        traceEvent(context, "INPUT_SNAPSHOT", "PARSED_SOURCE", "READY",
                traceMetadata(context, Map.of("scope", "SUBJECT", "subjectId", request.subjectId().toString(),
                        "mode", request.mode().name(), "itemCount", String.valueOf(safeSources.size()))),
                () -> Map.of("parsedText", boundedInputText(safeSources.stream().flatMap(input -> java.util.stream.Stream.of(input.title(),
                        Objects.toString(input.outlineMarkdown(), ""),
                        Objects.toString(input.summaryMarkdown(), ""))).toList())));
        String payloadFingerprint = subjectPayloadFingerprint(request, resolvedSources);
        String profileFingerprint = profileFingerprint(settings, context.modelBudget());
        String inputFingerprint = sha256(write(List.of("SUBJECT", request.subjectId(), request.mode(),
                Objects.toString(request.instruction(), ""), sha256(payloadFingerprint))));
        OverviewGenerationCoordinator.Request durableRequest = generationCoordinator == null ? null
                : new OverviewGenerationCoordinator.Request(userId, UUID.fromString(context.requestId()),
                "SUBJECT", request.subjectId(), null, inputFingerprint, payloadFingerprint,
                profileFingerprint, DETAILED_ALGORITHM_VERSION,
                resolvedSources.stream().map(source -> new OverviewGenerationCoordinator.SourceDependency(
                        source.id(), source.ingestionRevision(), source.title())).toList(), request.retryOfRequestId());
        context = context.withSubjectRequest(durableRequest, payloadFingerprint, request);
        GenerationContext subjectContext = context;
        OverviewResponse result;
        if (durableRequest != null) {
            OverviewGenerationCoordinator.Acquisition initial = generationCoordinator.acquire(durableRequest);
            result = runDurableAcquisition(initial, subjectContext, subjectContext.cancellation(),
                    acquisition -> generateSubjectOverview(subjectContext.withAcquisition(acquisition), request,
                            safeSources, aliases),
                    aliases);
        } else {
            result = generateSubjectOverview(subjectContext, request, safeSources, aliases);
        }
        logPhase(context, "CACHE_RETURN", "sourceCount={}", safeSources.size());
        context.deadline().remainingMillis();
        OverviewResponse mappedResult = result;
        OverviewResponse finalResult = forMode(mappedResult, request.mode());
        context.deadline().remainingMillis();
        requireCurrentSource(context);
        logSuccess(context);
        traceEvent(context, "ASSEMBLED_OUTPUT", "OVERVIEW", "SUCCESS", traceMetadata(context, Map.of()),
                () -> Map.of("overview", write(finalResult)));
        safeTrace().finish(traceRun, "SUCCESS", null, traceMetadata(context, Map.of()));
        return finalResult;
        } catch (RuntimeException exception) {
            logFailure(context, exception);
            safeTrace().finish(traceRun, isCancellation(exception) ? "CANCELLED" : "FAILED",
                    stableErrorCode(exception), traceMetadata(context, Map.of()));
            throw exception;
        } finally {
            context.deadline().finish();
            requestRegistration.close();
        }
    }

    private OverviewResponse generateSubjectOverview(GenerationContext context, SubjectOverviewRequest request,
                                                     List<ModelSubjectInput> safeSources, Map<String, String> aliases) {
        requireOwnerActive(context);
        requireModelCapacity(context);
        try (AiTaskScope scope = invocationGateway.beginTask(taskContext(context, AiFeature.SUBJECT_OVERVIEW))) {
            String original = safeSources.stream().map(input -> "资料：" + input.title() + "\n"
                    + Objects.toString(input.outlineMarkdown(), "") + "\n" + Objects.toString(input.summaryMarkdown(), ""))
                    .collect(java.util.stream.Collectors.joining("\n\n"));
            OverviewResponse response = markdownPipeline.generate(original, subjectService.requireActiveSubject(context.userId(),
                    request.subjectId()).name(), request.mode(), request.instruction(),
                    (stage, system, user, minimumOutput) -> completeDetailedStage(scope, context, stage, system, user, minimumOutput),
                    (stage, system, user, minimumOutput) -> planDetailedStage(context, stage, system, user, minimumOutput).fits());
            requireCurrentSource(context);
            return documentValidator.validateProviderDocument(write(response));
        }
    }

    private RawInputInventory loadRawInputInventory(UUID userId, List<SourceView> sources,
                                                     Map<UUID, String> sourceAliases) {
        List<List<SourceChunkEntity>> chunksBySource = new ArrayList<>();
        for (SourceView source : sources) {
            if (sourceAliases.get(source.id()) == null || source.ingestionRevision() == null
                    || source.ingestionStatus() != SourceIngestionStatus.READY) {
                throw new DomainException("MUTATION_REJECTED", "Subject source identity is unavailable");
            }
            List<SourceChunkEntity> chunks = new ArrayList<>();
            int page = 0;
            List<SourceChunkEntity> batch;
            do {
                batch = chunkRepository.findActiveForRawOverviewInput(
                        userId, source.id(), PageRequest.of(page++, 500));
                chunks.addAll(batch);
            } while (batch.size() == 500);
            chunksBySource.add(chunks);
        }

        List<RawInputUnit> units = new ArrayList<>();
        List<Object> identity = new ArrayList<>();
        Map<String, String> aliases = new LinkedHashMap<>();
        sourceAliases.forEach((sourceId, alias) -> aliases.put(alias, sourceId.toString()));
        int unitIndex = 0;
        long snapshotChars = 0;
        long maxSnapshotChars = overviewLimits().maxInputSnapshotChars();
        for (int sourceIndex = 0; sourceIndex < sources.size(); sourceIndex++) {
            SourceView source = sources.get(sourceIndex);
            String sourceAlias = sourceAliases.get(source.id());
            List<SourceChunkEntity> chunks = chunksBySource.get(sourceIndex);
            int sourceUnitCount = units.size();
            List<Object> sourceIdentity = new ArrayList<>();
            sourceIdentity.add(List.of(userId, source.id(), Objects.toString(source.subjectId(), ""),
                    source.ingestionRevision(), Objects.toString(source.title(), "")));
            sourceIdentity.add(source.ingestionRevision());
            SourceChunkEntity previousChunk = null;
            String previousContent = null;
            for (SourceChunkEntity chunk : chunks) {
                String content = Objects.toString(chunk.getContent(), "");
                snapshotChars = saturatedAdd(snapshotChars, content.length());
                if (maxSnapshotChars > 0 && snapshotChars > maxSnapshotChars) {
                    throw sourceManifestCapacityFailure("configured source snapshot size");
                }
                sourceIdentity.add(List.of(chunk.getId(), chunk.getGeneration(), chunk.getOrdinal(),
                        Objects.toString(chunk.getContentHash(), ""), sha256(content),
                        chunk.getCharStart(), chunk.getCharEnd(), chunk.isActive()));
                int charStart = chunk.getCharStart();
                if (previousChunk != null && previousChunk.getOrdinal() + 1 == chunk.getOrdinal()
                        && Objects.equals(previousChunk.getGeneration(), chunk.getGeneration())) {
                    int overlap = previousChunk.getCharEnd() - charStart;
                    if (overlap > 0 && overlap <= previousContent.length() && overlap <= content.length()
                            && content.startsWith(previousContent.substring(previousContent.length() - overlap))) {
                        content = content.substring(overlap);
                        charStart += overlap;
                    }
                }
                previousChunk = chunk;
                previousContent = Objects.toString(chunk.getContent(), "");
                String trimmed = content.trim();
                if (trimmed.isEmpty() || PAGE_NUMBER_NOISE.matcher(trimmed).matches()
                        || CHINESE_PAGE_NUMBER_NOISE.matcher(trimmed).matches()) continue;
                unitIndex++;
                String alias = "unit" + String.format(Locale.ROOT, "%06d", unitIndex);
                aliases.put(alias, source.id().toString());
                units.add(new RawInputUnit(alias, sourceAlias, source.title(), source.id(),
                        source.ingestionRevision(), chunk.getId(), chunk.getGeneration(), chunk.getOrdinal(),
                        Objects.toString(chunk.getContentHash(), ""), charStart, chunk.getCharEnd(), content, false));
            }
            if (units.size() == sourceUnitCount) {
                throw new DomainException("MUTATION_REJECTED",
                        "A selected ready source has no usable original text for overview generation");
            }
            identity.add(List.copyOf(sourceIdentity));
        }
        if (units.isEmpty()) throw new DomainException("MUTATION_REJECTED", "Selected ready sources have no usable original text");
        return new RawInputInventory(List.copyOf(units), Collections.unmodifiableMap(new LinkedHashMap<>(aliases)),
                sha256(write(identity)));
    }

    private void logBudgetRootEventFromDiagnostic(GenerationContext context,
                                                   OverviewGenerationCoordinator.Acquisition acquisition,
                                                   String outcome) {
        try {
            OverviewTaskUsageSummary usage = invocationGateway.overviewTaskUsage(
                    new AiTaskContext(context.userId(), context.sourceId() == null
                            ? AiFeature.SUBJECT_OVERVIEW : AiFeature.SOURCE_OVERVIEW,
                            acquisition.generationId().toString(), acquisition.budgetTaskId()));
            logBudgetRootEvent(context, acquisition, outcome, null, usage);
        } catch (RuntimeException diagnosticFailure) {
            logDiagnosticReadFailure(context.withAcquisition(acquisition), "BUDGET_ROOT_" + outcome,
                    diagnosticFailure);
        }
    }

    private void logBudgetRootEventBestEffort(GenerationContext context,
                                               OverviewGenerationCoordinator.Acquisition acquisition,
                                               String outcome, String errorCode,
                                               OverviewTaskUsageSummary usage) {
        try {
            logBudgetRootEvent(context, acquisition, outcome, errorCode, usage);
        } catch (RuntimeException diagnosticFailure) {
            logDiagnosticReadFailure(context.withAcquisition(acquisition), "BUDGET_ROOT_" + outcome,
                    diagnosticFailure);
        }
    }


    private void logDiagnosticReadFailure(GenerationContext context, String diagnosticPhase,
                                         RuntimeException diagnosticFailure) {
        try {
            LOGGER.warn("OVERVIEW_GENERATION_DIAGNOSTIC_READ_FAILED requestId={} generationId={} budgetTaskId={} "
                            + "phase={} failureType={}", context.requestId(), context.generationId(),
                    context.acquisition() == null ? null : context.acquisition().budgetTaskId(), diagnosticPhase,
                    diagnosticFailure.getClass().getSimpleName());
        } catch (RuntimeException ignored) {
            // Optional diagnostics must never affect generation or owner lifecycle.
        }
    }

    private long saturatedAdd(long left, long right) {
        if (left < 0 || right < 0 || left > Long.MAX_VALUE - right) return Long.MAX_VALUE;
        return left + right;
    }

    private long utf8Length(String value) {
        return value == null ? 0 : value.getBytes(StandardCharsets.UTF_8).length;
    }

    private AuralisProperties.OverviewLimits overviewLimits() {
        AuralisProperties.Ai ai = properties == null ? null : properties.ai();
        return ai == null || ai.overviewLimits() == null
                ? AuralisProperties.OverviewLimits.withoutAdditionalCaps() : ai.overviewLimits();
    }

    private String capacityProfileFingerprint(AiCredentialSource source, OverviewModelBudget capacity) {
        return sha256(write(List.of("OVERVIEW_CAPACITY_CONTRACT_V2", source.name(), capacity.isTrusted(),
                capacity.contextWindowTokens().orElse(0), capacity.maxOutputTokens().orElse(0), overviewLimits())));
    }

    private static boolean exceeded(long value, long configuredLimit) {
        return configuredLimit > 0 && value > configuredLimit;
    }


    private OverviewModelBudget requireModelCapacity(GenerationContext context) {
        OverviewModelBudget capability = context == null ? null : context.modelBudget();
        if (capability == null || !capability.isTrusted()
                || capability.contextWindowTokens().isEmpty() || capability.maxOutputTokens().isEmpty()) {
            throw new DomainException("MODEL_UNAVAILABLE",
                    "Overview model capacity is not configured for this provider endpoint and exact model");
        }
        return capability;
    }

    private boolean withinConfiguredCapacity(String systemText, String userData,
                                             long estimatedInputTokens) {
        AuralisProperties.OverviewLimits limits = overviewLimits();
        return (limits.maxPromptChars() <= 0 || (long) systemText.length() + userData.length() <= limits.maxPromptChars())
                && (limits.maxRequestBytes() <= 0 || utf8Length(systemText) + utf8Length(userData) <= limits.maxRequestBytes())
                && (limits.maxInputTokens() <= 0 || estimatedInputTokens <= limits.maxInputTokens());
    }

    private DomainException sourceManifestCapacityFailure(String category) {
        return new DomainException("OVERVIEW_PROVIDER_OUTPUT_TOO_LARGE",
                "Overview source manifest exceeds a configured " + category + " limit");
    }

    public void preflightSubject(UUID userId, SubjectOverviewRequest request) {
        requireRequest(userId, request);
        if (request.mode() == null || request.subjectId() == null) {
            throw new DomainException("VALIDATION_FAILED", "subjectId and mode are required");
        }
        subjectService.requireActiveSubject(userId, request.subjectId());
        validateSubjectInputs(request);
        Map<String, String> aliases = new LinkedHashMap<>();
        Set<UUID> seen = new LinkedHashSet<>();
        int index = 1;
        for (SubjectOverviewSourceInput input : request.sources()) {
            if (!seen.add(input.sourceId())) {
                throw new DomainException("VALIDATION_FAILED", "Subject overview contains duplicate sourceId");
            }
            SourceView source = sourceService.requireActiveSource(userId, input.sourceId());
            if (!request.subjectId().equals(source.subjectId())) {
                throw new DomainException("MUTATION_REJECTED", "Source does not belong to the requested subject");
            }
            aliases.put("source-" + index++, source.id().toString());
        }
    }

    private void validateSubjectInputs(SubjectOverviewRequest request) {
        if (request.sources() == null || request.sources().isEmpty()
                || exceeded(request.sources().size(), overviewLimits().maxSources())) throw invalidInput("sources are required");
        validateInstruction(request.instruction());
        for (SubjectOverviewSourceInput source : request.sources()) {
            if (source == null || source.sourceId() == null) throw invalidInput("sourceId is required");
            if ((source.outlineMarkdown() == null || source.outlineMarkdown().isBlank())
                    && (source.summaryMarkdown() == null || source.summaryMarkdown().isBlank())) throw invalidInput("source Markdown is empty");
        }
    }

    private void checkText(String value, String field, long max, boolean required) {
        if (value == null || (required && value.isBlank()) || exceeded(value == null ? 0 : value.codePointCount(0, value.length()), max)) {
            throw invalidInput(field + " is invalid or exceeds its limit");
        }
    }

    private DomainException invalidInput(String detail) { return new DomainException("VALIDATION_FAILED", "Invalid subject overview input: " + detail); }
    private void validateInstruction(String instruction) {
        if (instruction != null && instruction.codePointCount(0, instruction.length()) > 2_000) {
            throw new DomainException("VALIDATION_FAILED", "instruction exceeds 2000 characters");
        }
    }

    private void requireOwnerActive(GenerationContext context) {
        if (context.acquisition() == null || context.acquisition().lease() == null) return;
        context.deadline().remainingMillis();
        if (context.cancellation() != null && context.cancellation().isCancelled()) {
            throw new DomainException("MODEL_TIMEOUT", "Overview generation was cancelled");
        }
        if (!generationCoordinator.owns(context.acquisition().lease())) {
            if (context.cancellation() != null) context.cancellation().cancel(OverviewCancellation.Reason.DEADLINE);
            throw new DomainException("MODEL_TIMEOUT", "Overview generation ownership expired");
        }
    }

    private void checkPlanningActive(GenerationContext context) {
        context.deadline().remainingMillis();
        if (context.cancellation() != null && context.cancellation().isCancelled()) {
            throw new DomainException("MODEL_TIMEOUT", "Overview generation was cancelled during planning");
        }
    }

    private DomainException promptBudgetFailure(GenerationContext context, String phase, String detail) {
        DomainException failure = new DomainException("OVERVIEW_PROMPT_BUDGET_EXCEEDED", detail);
        logFailureAtPhase(context, phase, failure);
        return failure;
    }

    private AiSettingsService.ResolvedSettings resolveOverviewSettings(UUID userId) {
        return settingsService.resolve(userId, AiProviderType.OPENAI_COMPATIBLE);
    }

    private OverviewModelBudget resolveModelBudget(AiSettingsService.ResolvedSettings settings) {
        return resolveModelBudget(settings.provider(), settings.credential().baseUrl(), settings.chatModel(),
                settings.source());
    }

    private OverviewModelBudget resolveModelBudget(AiProviderType provider, String endpoint, String model,
                                                    AiCredentialSource source) {
        return OverviewModelBudget.resolve(provider, endpoint, model, source,
                properties == null ? null : properties.ai());
    }

    private int overviewMaxCalls() {
        AuralisProperties.Ai ai = properties == null ? null : properties.ai();
        AuralisProperties.Limits limits = ai == null ? null : ai.limits();
        return limits == null ? 0 : limits.overviewMaxCalls();
    }

    private long overviewTaskTokens() {
        AuralisProperties.Ai ai = properties == null ? null : properties.ai();
        AuralisProperties.Limits limits = ai == null ? null : ai.limits();
        return limits == null || limits.overviewTaskTokens() <= 0 ? 524_288 : limits.overviewTaskTokens();
    }

    private OverviewResponse forMode(OverviewResponse response, OverviewMode mode) {
        return switch (mode) {
            case ALL -> response;
            case OUTLINE -> new OverviewResponse(2, response.title(), response.outlineMarkdown(), null);
            case SUMMARY -> new OverviewResponse(2, response.title(), null, response.summaryMarkdown());
        };
    }

    private void validateModeFields(OverviewResponse response, OverviewMode mode) {
        if (response.schemaVersion() != 2
                || mode != OverviewMode.SUMMARY && response.outlineMarkdown() == null
                || mode != OverviewMode.OUTLINE && response.summaryMarkdown() == null
                || mode == OverviewMode.SUMMARY && response.outlineMarkdown() != null
                || mode == OverviewMode.OUTLINE && response.summaryMarkdown() != null) throw providerInvalid("fields do not match requested mode");
    }

    private DomainException providerInvalid(String detail) { return new DomainException("MODEL_PROVIDER_ERROR", "AI provider returned an invalid overview: " + detail); }

    private void requireCurrentSource(GenerationContext context) {
        if (context.subjectRequest() != null) {
            SubjectOverviewRequest request = context.subjectRequest();
            subjectService.requireActiveSubject(context.userId(), request.subjectId());
            List<SourceView> currentSources = new ArrayList<>();
            for (SubjectOverviewSourceInput input : request.sources()) {
                SourceView current = sourceService.requireActiveSource(context.userId(), input.sourceId());
                if (!request.subjectId().equals(current.subjectId())
                        || current.ingestionStatus() != SourceIngestionStatus.READY) {
                    throw new DomainException("MUTATION_REJECTED", "Subject source changed during overview generation");
                }
                currentSources.add(current);
            }
            String currentPayload = subjectPayloadFingerprint(request, currentSources);
            if (!Objects.equals(context.payloadFingerprint(), currentPayload)) {
                throw new DomainException("MUTATION_REJECTED", "Subject overview inputs changed during generation");
            }
            return;
        }
        if (context.sourceId() == null) return;
        SourceView current = sourceService.requireActiveSource(context.userId(), context.sourceId());
        if (current.ingestionStatus() != SourceIngestionStatus.READY
                || !Objects.equals(current.ingestionRevision(), context.revision())) {
            throw new DomainException("MUTATION_REJECTED", "Source changed during overview generation");
        }
        if (context.payloadFingerprint() != null) {
            List<SourceChunkEntity> currentChunks = findActiveChunks(context.userId(), context.sourceId());
            SourceOverviewRequest request = new SourceOverviewRequest(context.sourceId(), context.mode(), context.instruction());
            String currentPayload = current.type() == SourceType.FILE
                    ? detailedSourceFingerprint(current, request, currentChunks)
                    : sourcePayloadFingerprint(current, request, summaryChunks(currentChunks));
            if (!context.payloadFingerprint().equals(currentPayload)) {
                throw new DomainException("MUTATION_REJECTED", "Source content changed during overview generation");
            }
        }
    }

    private List<SourceChunkEntity> findActiveChunks(UUID userId, UUID sourceId) {
        return chunkRepository.findAllByUserIdAndSourceIdAndActiveTrueOrderByOrdinalAsc(userId, sourceId);
    }

    private List<String> summaryChunks(List<SourceChunkEntity> chunks) {
        return chunks.stream().map(SourceChunkEntity::getContent).filter(content -> content != null && !content.isBlank())
                .map(String::trim).toList();
    }

    private DetailedSourceInput detailedSnapshot(SourceView source, List<SourceChunkEntity> chunks) {
        if (source.type() != SourceType.FILE) {
            throw new DomainException("MODEL_UNAVAILABLE", "Detailed Overview requires a parsed file source");
        }
        if (chunks.isEmpty()) {
            throw new DomainException("MUTATION_REJECTED", "Source has no active chunks for overview generation");
        }
        UUID generation = chunks.getFirst().getGeneration();
        if (source.ingestionRevision() == null || generation == null) {
            throw new DomainException("MUTATION_REJECTED", "Overview source snapshot identity is unavailable");
        }
        long snapshotChars = chunks.stream().mapToLong(chunk -> Objects.toString(chunk.getContent(), "").length()).sum();
        if (exceeded(snapshotChars, overviewLimits().maxInputSnapshotChars())) {
            throw sourceManifestCapacityFailure("configured source snapshot size");
        }
        OverviewSourceSnapshot snapshot = OverviewSourceSnapshot.from(source.id(), source.ingestionRevision(),
                generation, chunks);
        if (snapshot.text().isBlank()) {
            throw new DomainException("MUTATION_REJECTED", "Source has no usable original text for overview generation");
        }
        return new DetailedSourceInput(snapshot, List.copyOf(chunks));
    }

    private record DetailedSourceInput(OverviewSourceSnapshot snapshot, List<SourceChunkEntity> chunks) { }

    private String detailedSourceFingerprint(SourceView source, SourceOverviewRequest request, List<SourceChunkEntity> chunks) {
        List<List<Object>> chunkIdentities = chunks.stream()
                .map(chunk -> List.<Object>of(chunk.getId(), chunk.getGeneration(), chunk.getOrdinal(),
                        chunk.getContentHash(), sha256(chunk.getContent()), chunk.getCharStart(), chunk.getCharEnd(),
                        Objects.toString(chunk.getProvenanceJson(), "")))
                .toList();
        return sha256(write(List.of(DETAILED_ALGORITHM_VERSION, source.id(), source.ingestionRevision(), source.title(),
                request.mode(), Objects.toString(request.instruction(), ""), chunkIdentities)));
    }

    private String sourcePayloadFingerprint(SourceView source, SourceOverviewRequest request, List<String> chunks) {
        return sha256(write(List.of("SOURCE", source.id(), source.ingestionRevision(), source.title(),
                request.mode(), Objects.toString(request.instruction(), ""), chunks)));
    }

    private String subjectPayloadFingerprint(SubjectOverviewRequest request, List<SourceView> sources) {
        List<Object> ordered = new ArrayList<>(sources.size());
        for (int index = 0; index < sources.size(); index++) {
            SourceView source = sources.get(index);
            SubjectOverviewSourceInput selected = request.sources().get(index);
            ordered.add(List.of(source.id(), Objects.toString(source.subjectId(), ""), source.title(),
                    Objects.toString(source.ingestionRevision(), ""), selected.outlineMarkdown() == null ? "null" : selected.outlineMarkdown(),
                    selected.summaryMarkdown() == null ? "null" : selected.summaryMarkdown()));
        }
        return sha256(write(List.of("SUBJECT", request.subjectId(), request.mode(),
                Objects.toString(request.instruction(), ""), ordered)));
    }

    private String sourceJobPayloadFingerprint(SourceView source, SourceOverviewRequest request,
                                                    String rawIdentityFingerprint) {
        return sha256(write(List.of(DETAILED_ALGORITHM_VERSION, "SOURCE", source.id(), source.ingestionRevision(),
                source.title(), request.mode(), Objects.toString(request.instruction(), ""), rawIdentityFingerprint)));
    }

    private String subjectJobPayloadFingerprint(String subjectRequestFingerprint, String rawIdentityFingerprint) {
        return sha256(write(List.of(DETAILED_ALGORITHM_VERSION, "SUBJECT", subjectRequestFingerprint,
                rawIdentityFingerprint)));
    }


    private void requireDetailedGenerationReady(OverviewMode mode) {
        if (mode != null && mode != OverviewMode.SUMMARY) {
            throw new DomainException("MODEL_UNAVAILABLE",
                    "Detailed Overview generation is not available in this build");
        }
    }

    private String profileFingerprint(AiSettingsService.ResolvedSettings settings, OverviewModelBudget capacity) {
        String endpoint = settings.credential() == null ? "" : settings.credential().baseUrl();
        String normalizedEndpoint;
        try {
            URI uri = URI.create(Objects.toString(endpoint, "").trim()).normalize();
            normalizedEndpoint = Objects.toString(uri.getScheme(), "").toLowerCase(Locale.ROOT) + "://"
                    + Objects.toString(uri.getHost(), "").toLowerCase(Locale.ROOT)
                    + (uri.getPort() < 0 ? "" : ":" + uri.getPort())
                    + Objects.toString(uri.getRawPath(), "").replaceAll("/+$", "");
        } catch (IllegalArgumentException exception) {
            normalizedEndpoint = Objects.toString(endpoint, "").trim();
        }
        String credentialIdentity = settings.credential() == null ? ""
                : sha256(Objects.toString(settings.credential().apiKey(), ""));
        return sha256(settings.provider() + "|" + normalizedEndpoint + "|"
                + Objects.toString(settings.chatModel(), "") + "|" + credentialIdentity
                + "|" + capacityProfileFingerprint(settings.source(), capacity));
    }

    private String sha256(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is unavailable", exception);
        }
    }

    private AiTaskContext taskContext(GenerationContext context, AiFeature feature) {
        OverviewGenerationCoordinator.Acquisition binding = context.acquisition();
        return new AiTaskContext(context.userId(), feature, context.generationId(),
                binding == null ? null : binding.budgetTaskId());
    }

    private void requireRequest(UUID userId, Object request) { if (userId == null || request == null) throw new DomainException("VALIDATION_FAILED", "Overview request is required"); }
    private long maximumPromptChars() { return overviewLimits().maxPromptChars(); }

    private long overviewResponseTimeoutMillis() {
        long value = properties == null || properties.ai() == null ? 0 : properties.ai().overviewResponseTimeoutMillis();
        return value > 0 ? value : 120_000;
    }
    private long overviewTaskTimeoutMillis() {
        if (properties == null || properties.ai() == null) return 240_000;
        return Math.max(0, properties.ai().overviewTaskTimeoutMillis());
    }
    private OverviewTaskDeadline newTaskDeadline() {
        OverviewTaskDeadline deadline = new OverviewTaskDeadline(overviewTaskTimeoutMillis(), monotonicNanos);
        if (deadlineScheduler != null) deadline.startWatchdog(deadlineScheduler);
        return deadline;
    }
    private OverviewTaskDeadline newTaskDeadline(long durationMillis) {
        long remaining = durationMillis == 0 ? 0 : Math.max(1, durationMillis);
        long configured = overviewTaskTimeoutMillis();
        long timeout = remaining == 0 ? 0 : configured > 0 ? Math.min(configured, remaining) : remaining;
        OverviewTaskDeadline deadline = new OverviewTaskDeadline(timeout, monotonicNanos);
        if (deadlineScheduler != null) deadline.startWatchdog(deadlineScheduler);
        return deadline;
    }

    private String write(Object value) { try { return objectMapper.writeValueAsString(value); } catch (Exception exception) { throw new DomainException("VALIDATION_FAILED", "Overview prompt could not be constructed", null, exception); } }

    private SafeOverviewTrace safeTrace() {
        return overviewTrace == null ? SafeOverviewTrace.disabled() : SafeOverviewTrace.of(overviewTrace);
    }

    private void traceEvent(GenerationContext context, String type, String step, String outcome,
                            Map<String, String> metadata, java.util.function.Supplier<Map<String, String>> content) {
        traceEvent(context, type, step, null, outcome, metadata, content);
    }

    private void traceEvent(GenerationContext context, String type, String step, Integer attempt, String outcome,
                           Map<String, String> metadata, java.util.function.Supplier<Map<String, String>> content) {
        safeTrace().event(context.recoveryTracker().traceRun(), type, step, attempt, outcome, metadata, content);
    }

    private Map<String, String> traceMetadata(GenerationContext context, Map<String, String> values) {
        Map<String, String> result = new LinkedHashMap<>(values);
        UUID generationId = context.acquisition() == null ? context.recoveryTracker().generationId()
                : context.acquisition().generationId();
        if (generationId != null) result.put("generationId", generationId.toString());
        if (context.sourceId() != null) result.put("sourceId", context.sourceId().toString());
        if (context.revision() != null) result.put("sourceRevision", context.revision().toString());
        if (context.mode() != null) result.put("mode", context.mode().name());
        return result;
    }

    private String boundedInputText(List<String> values) {
        final int maxUtf8Bytes = 768 * 1024;
        StringBuilder result = new StringBuilder(Math.min(maxUtf8Bytes, 32 * 1024));
        long originalBytes = 0;
        int capturedBytes = 0;
        boolean truncated = false;
        for (String value : values) {
            if (value == null) continue;
            long valueBytes = utf8Length(value);
            originalBytes += valueBytes + 1L;
            int separatorBytes = result.isEmpty() ? 0 : 1;
            int remaining = maxUtf8Bytes - capturedBytes - separatorBytes;
            if (remaining <= 0) { truncated = true; continue; }
            String selected = value;
            if (valueBytes > remaining) {
                selected = clipUtf8(selected, remaining);
                truncated = true;
            }
            if (!result.isEmpty()) result.append('\n');
            result.append(selected);
            capturedBytes += separatorBytes + (int) utf8Length(selected);
        }
        if (truncated) result.append("\n[TRACE INPUT TRUNCATED; originalUtf8Bytes=").append(originalBytes).append(']');
        return result.toString();
    }

    private String clipUtf8(String value, int maximumBytes) {
        int end = 0;
        int bytes = 0;
        while (end < value.length()) {
            int codePoint = value.codePointAt(end);
            int nextBytes = codePoint <= 0x7f ? 1 : codePoint <= 0x7ff ? 2 : codePoint <= 0xffff ? 3 : 4;
            if (bytes + nextBytes > maximumBytes) break;
            end += Character.charCount(codePoint);
            bytes += nextBytes;
        }
        return value.substring(0, end);
    }

    private String traceSafeModel(String model) {
        if (model == null) return "unknown";
        String value = model.trim();
        return value.matches("[A-Za-z0-9._:/-]{1,120}") ? value : "unavailable";
    }

    private long elapsedMillis(long startedAt) {
        return Math.max(0, TimeUnit.NANOSECONDS.toMillis(monotonicNanos.getAsLong() - startedAt));
    }

    private boolean isCancellation(RuntimeException exception) {
        return exception instanceof DomainException domain
                && ("OVERVIEW_CANCELLED".equals(domain.code()) || "REQUEST_DISCONNECTED".equals(domain.code()));
    }

    private static UUID parseUuid(String value) {
        try { return value == null ? null : UUID.fromString(value); }
        catch (IllegalArgumentException exception) { return null; }
    }

    private void logStart(GenerationContext context) {
        LOGGER.info("OVERVIEW_GENERATION_START requestId={} generationId={} userId={} sourceId={} revision={} mode={}",
                context.requestId(), context.generationId(), context.userId(), context.sourceId(), context.revision(), context.mode());
    }

    private void logPhase(GenerationContext context, String phase, String template, Object... args) {
        LOGGER.info("OVERVIEW_GENERATION_PHASE requestId={} generationId={} budgetTaskId={} userId={} sourceId={} revision={} mode={} phase={} " + template,
                prepend(context, phase, args));
    }

    private Object[] prepend(GenerationContext context, String phase, Object[] args) {
        Object[] values = new Object[8 + args.length];
        values[0] = context.requestId(); values[1] = context.generationId();
        values[2] = context.acquisition() == null ? null : context.acquisition().budgetTaskId();
        values[3] = context.userId(); values[4] = context.sourceId(); values[5] = context.revision();
        values[6] = context.mode(); values[7] = phase;
        System.arraycopy(args, 0, values, 8, args.length);
        return values;
    }

    private void logBudgetRootEvent(GenerationContext context,
                                    OverviewGenerationCoordinator.Acquisition acquisition,
                                    String outcome, String errorCode, OverviewTaskUsageSummary usage) {
        GenerationContext bound = context.withAcquisition(acquisition);
        logPhase(bound, "BUDGET_ROOT_" + outcome,
                "budgetTaskId={} errorCode={} chargedActualOrEstimated={} chargeBasis={} "
                        + "providerUsageComplete={} unknownDispatchedCalls={} activeDispatchedReservations={} "
                        + "estimatedInputTokens={} reservedOutputTokens={}",
                acquisition.budgetTaskId(), errorCode,
                usage == null ? 0 : usage.chargedTokens(),
                usage == null || usage.providerUsageComplete()
                        ? "ACTUAL_FOR_COMPLETED_CALLS" : "ACTUAL_OR_CONSERVATIVE_ESTIMATE_MIXED",
                usage != null && usage.providerUsageComplete(),
                usage == null ? 0 : usage.unknownDispatchedCalls(),
                usage == null ? 0 : usage.activeDispatchedReservations(),
                usage == null ? 0 : usage.estimatedInputTokens(),
                usage == null ? 0 : usage.reservedOutputTokens());
    }

    private void logSuccess(GenerationContext context) {
        LOGGER.info("OVERVIEW_GENERATION_SUCCESS requestId={} generationId={} userId={} sourceId={} revision={} mode={}",
                context.requestId(), context.generationId(), context.userId(), context.sourceId(), context.revision(), context.mode());
    }

    private void logFailure(GenerationContext context, RuntimeException exception) {
        logFailureAtPhase(context, "FINAL", exception);
    }

    private void logFailureAtPhase(GenerationContext context, String phase, RuntimeException exception) {
        Throwable cause = exception.getCause();
        LOGGER.error("OVERVIEW_GENERATION_FAILED requestId={} generationId={} userId={} sourceId={} revision={} mode={} phase={} errorCode={} exceptionType={} causeType={}",
                context.requestId(), context.generationId(), context.userId(), context.sourceId(), context.revision(), context.mode(), phase,
                stableErrorCode(exception), exception.getClass().getName(), cause == null ? null : cause.getClass().getName());
    }

    private String stableErrorCode(RuntimeException exception) {
        if (exception instanceof com.auralis.app.ai.usage.AiUsageLimitException usageException
                && ALLOWED_USAGE_FAILURE_CODES.contains(usageException.code())) {
            return usageException.code();
        }
        if (exception instanceof DomainException domainException
                && ALLOWED_FAILURE_CODES.contains(domainException.code())) {
            return domainException.code();
        }
        return "OVERVIEW_GENERATION_FAILED";
    }

    private String normalizeRequestId(String value) {
        if (value == null || value.isBlank()) return UUID.randomUUID().toString();
        try {
            return UUID.fromString(value.trim()).toString();
        } catch (IllegalArgumentException exception) {
            return UUID.randomUUID().toString();
        }
    }

    private record GenerationContext(UUID userId, UUID sourceId, UUID revision, OverviewMode mode,
                                     String requestId, String generationId, OverviewTaskDeadline deadline,
                                     OverviewCancellation cancellation,
                                     AiSettingsService.ResolvedSettings settings,
                                     OverviewModelBudget modelBudget,
                                     AtomicInteger callsStarted,
                                     OverviewGenerationCoordinator.Request coordinatorRequest,
                                     OverviewGenerationCoordinator.Acquisition acquisition,
                                     String payloadFingerprint,
                                     String instruction,
                                     SubjectOverviewRequest subjectRequest,
                                     RecoveryTracker recoveryTracker,
                                     SourceGenerationKey localFlightKey,
                                     SourceGenerationFlight localFlight) {
        private GenerationContext(UUID userId, UUID sourceId, UUID revision, OverviewMode mode,
                                  String requestId, String generationId, OverviewTaskDeadline deadline,
                                  OverviewCancellation cancellation) {
            this(userId, sourceId, revision, mode, requestId, generationId, deadline, cancellation,
                    null, null, new AtomicInteger(), null, null, null, null, null, new RecoveryTracker(), null, null);
        }
        private GenerationContext withSource(UUID sourceId, UUID revision) {
            return new GenerationContext(userId, sourceId, revision, mode, requestId, generationId, deadline,
                    cancellation, settings, modelBudget, callsStarted,
                    coordinatorRequest, acquisition, payloadFingerprint, instruction, subjectRequest, recoveryTracker, localFlightKey, localFlight);
        }
        private GenerationContext withCancellation(OverviewCancellation cancellation) {
            return new GenerationContext(userId, sourceId, revision, mode, requestId, generationId, deadline,
                    cancellation, settings, modelBudget, callsStarted,
                    coordinatorRequest, acquisition, payloadFingerprint, instruction, subjectRequest, recoveryTracker, localFlightKey, localFlight);
        }
        private GenerationContext withSettings(AiSettingsService.ResolvedSettings settings,
                                               OverviewModelBudget modelBudget) {
            return new GenerationContext(userId, sourceId, revision, mode, requestId, generationId, deadline,
                    cancellation, settings, modelBudget, callsStarted,
                    coordinatorRequest, acquisition, payloadFingerprint, instruction, subjectRequest, recoveryTracker, localFlightKey, localFlight);
        }
        private GenerationContext withSourceRequest(OverviewGenerationCoordinator.Request request,
                                                    String payloadFingerprint, String instruction) {
            return new GenerationContext(userId, sourceId, revision, mode, requestId, generationId, deadline,
                    cancellation, settings, modelBudget, callsStarted, request,
                    acquisition, payloadFingerprint, instruction, subjectRequest, recoveryTracker, localFlightKey, localFlight);
        }
        private GenerationContext withAcquisition(OverviewGenerationCoordinator.Acquisition acquisition) {
            return new GenerationContext(userId, sourceId, revision, mode, requestId,
                    acquisition == null ? generationId : acquisition.generationId().toString(), deadline,
                    cancellation, settings, modelBudget, callsStarted,
                    coordinatorRequest, acquisition, payloadFingerprint, instruction, subjectRequest, recoveryTracker, localFlightKey, localFlight);
        }
        private GenerationContext withSubjectRequest(OverviewGenerationCoordinator.Request request,
                                                    String payloadFingerprint, SubjectOverviewRequest subjectRequest) {
            return new GenerationContext(userId, sourceId, revision, mode, requestId, generationId, deadline,
                    cancellation, settings, modelBudget, callsStarted, request,
                    acquisition, payloadFingerprint, subjectRequest.instruction(), subjectRequest, recoveryTracker, localFlightKey, localFlight);
        }
        private GenerationContext withLocalFlight(SourceGenerationKey key, SourceGenerationFlight flight) {
            return new GenerationContext(userId, sourceId, revision, mode, requestId, generationId, deadline,
                    cancellation, settings, modelBudget, callsStarted, coordinatorRequest,
                    acquisition, payloadFingerprint, instruction, subjectRequest, recoveryTracker, key, flight);
        }
    }

    private static final class RecoveryTracker {
        private final AtomicInteger count = new AtomicInteger();
        private final java.util.concurrent.CopyOnWriteArrayList<String> actions = new java.util.concurrent.CopyOnWriteArrayList<>();
        private final Set<String> recordedOnce = ConcurrentHashMap.newKeySet();
        private volatile OverviewTraceRun traceRun = OverviewTraceRun.NOOP;
        private volatile UUID generationId;
        void traceRun(OverviewTraceRun value) { traceRun = value == null ? OverviewTraceRun.NOOP : value; }
        OverviewTraceRun traceRun() { return traceRun; }
        void generationId(UUID value) { if (value != null) generationId = value; }
        UUID generationId() { return generationId; }
        void record(String action) {
            count.incrementAndGet();
            if (actions.size() < 64) actions.add(action);
        }
        boolean recordOnce(String key, String action) {
            if (!recordedOnce.add(key)) return false;
            count.incrementAndGet();
            if (actions.size() < 64) actions.addIfAbsent(action);
            return true;
        }
        boolean recordOnce(String action) {
            return recordOnce(action, action);
        }
        int count() { return count.get(); }
        List<String> actions() { return List.copyOf(actions); }
    }

    static final class SourceGenerationFlight {
        private final CompletableFuture<OverviewResponse> result = new CompletableFuture<>();
        private final CompletableFuture<OverviewGenerationCoordinator.Acquisition> binding = new CompletableFuture<>();
        private final OverviewCancellation cancellation = new OverviewCancellation();
        private int interests;
        private boolean closed;
        private volatile Runnable ownerDetach = () -> { };
        private OverviewCancellation.Registration ownerCancellation = () -> { };
        private OverviewCancellation.Registration ownerDeadline = () -> { };

        synchronized Runnable tryAttachInterest() {
            if (closed) return null;
            interests++;
            AtomicBoolean detached = new AtomicBoolean();
            return () -> {
                if (detached.compareAndSet(false, true)) detachInterest();
            };
        }

        boolean isCancelled() {
            return cancellation.isCancelled();
        }

        synchronized void closeForNewInterests() {
            closed = true;
        }

        void cancel(OverviewCancellation.Reason reason) {
            synchronized (this) {
                closed = true;
            }
            cancellation.cancel(reason);
        }

        private void detachInterest() {
            boolean cancel;
            synchronized (this) {
                if (interests <= 0) return;
                interests--;
                cancel = interests == 0;
                if (cancel) closed = true;
            }
            if (cancel) cancel(OverviewCancellation.Reason.NO_INTEREST);
        }
    }

    private record SourceGenerationKey(UUID userId, UUID sourceId, UUID revision, String title, OverviewMode mode,
                                       String instruction, String payloadFingerprint, String profileFingerprint,
                                       String capacityFingerprint) {
    }

    private record ModelSubjectInput(String sourceAlias, String title, String outlineMarkdown, String summaryMarkdown) { }
}
