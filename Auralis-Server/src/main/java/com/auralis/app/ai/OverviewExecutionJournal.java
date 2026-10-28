package com.auralis.app.ai;

import com.auralis.app.ai.usage.AiFeature;
import com.auralis.app.ai.usage.AiInvocationState;
import com.auralis.app.ai.usage.AiOperationKind;
import com.auralis.app.ai.usage.AiTaskContext;
import com.auralis.app.ai.usage.AiUsageQueryService;
import com.auralis.app.shared.error.DomainException;
import com.auralis.app.shared.config.AuralisProperties;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

/** Private, bounded journal for adaptive Overview writer units and their exact usage reservations. */
@Service
public class OverviewExecutionJournal {
    public static final int MAX_PLANS_PER_GENERATION = 8;
    public static final int MAX_ATTEMPTS_PER_NODE = 8;
    private static final Set<AiOperationKind> OVERVIEW_OPERATIONS = Set.of(
            AiOperationKind.SOURCE_OVERVIEW, AiOperationKind.SUBJECT_OVERVIEW);

    private final JdbcTemplate jdbc;
    private final TransactionTemplate transactions;
    private final Clock clock;
    private final AiUsageQueryService usageQuery;
    private final AuralisProperties.OverviewLimits overviewLimits;

    @Autowired
    public OverviewExecutionJournal(JdbcTemplate jdbc, PlatformTransactionManager transactionManager,
                                    Clock clock, AiUsageQueryService usageQuery, AuralisProperties properties) {
        this(jdbc, transactionManager, clock, usageQuery,
                properties == null ? AuralisProperties.OverviewLimits.withoutAdditionalCaps()
                        : properties.ai().overviewLimits());
    }

    OverviewExecutionJournal(JdbcTemplate jdbc, PlatformTransactionManager transactionManager,
                             Clock clock, AiUsageQueryService usageQuery) {
        this(jdbc, transactionManager, clock, usageQuery, AuralisProperties.OverviewLimits.withoutAdditionalCaps());
    }

    OverviewExecutionJournal(JdbcTemplate jdbc, PlatformTransactionManager transactionManager,
                             Clock clock, AiUsageQueryService usageQuery,
                             AuralisProperties.OverviewLimits overviewLimits) {
        this.jdbc = Objects.requireNonNull(jdbc);
        this.transactions = new TransactionTemplate(Objects.requireNonNull(transactionManager));
        this.transactions.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        this.clock = Objects.requireNonNull(clock);
        this.usageQuery = Objects.requireNonNull(usageQuery);
        this.overviewLimits = overviewLimits == null
                ? AuralisProperties.OverviewLimits.withoutAdditionalCaps() : overviewLimits;
    }

    public OpenResult openPlan(OverviewGenerationCoordinator.GenerationLease lease, String planFingerprint,
                               String mode, String planJson, List<NodeSpec> specs) {
        validateHash(planFingerprint);
        if (!"ALL".equals(mode) && !"OUTLINE".equals(mode)) throw invalid("mode");
        if (planJson == null || planJson.length() < 2 || exceeds(overviewLimits.maxPlanChars(), planJson.length())
                || specs == null || specs.isEmpty()
                || exceeds(overviewLimits.maxWriterNodesPerPlan(), specs.size())) throw capacity("plan");
        if (!sha256(planJson).equalsIgnoreCase(planFingerprint)) throw invalid("plan fingerprint");
        for (NodeSpec spec : specs) {
            if (spec.descriptorJson() == null || spec.descriptorJson().length() < 2
                    || exceeds(overviewLimits.maxNodeDescriptorChars(), spec.descriptorJson().length())
                    || spec.checkpointStep() == null || !spec.checkpointStep().matches("[A-Za-z0-9_.:-]{1,160}")) {
                throw invalid("node descriptor");
            }
            validateHash(spec.descriptorSha256());
            if (!sha256(spec.descriptorJson()).equalsIgnoreCase(spec.descriptorSha256())) {
                throw invalid("node descriptor hash");
            }
        }
        return transactions.execute(status -> {
            lockUserAndGeneration(lease);
            Instant now = clock.instant();
            List<PlanRow> previous = jdbc.query("select id,state from overview_execution_plans where generation_id=? "
                            + "and state<>'SUPERSEDED' order by created_at for update",
                    (rs, row) -> new PlanRow(rs.getObject("id", UUID.class), rs.getString("state")), lease.generationId());
            PlanRow same = jdbc.query("select id,state from overview_execution_plans where generation_id=? and plan_fingerprint=? for update",
                    rs -> rs.next() ? new PlanRow(rs.getObject("id", UUID.class), rs.getString("state")) : null,
                    lease.generationId(), planFingerprint);
            for (PlanRow old : previous) {
                boolean exactPlanResume = same != null && same.id().equals(old.id());
                if (!allCallsSafe(old.id(), lease, exactPlanResume)) {
                    jdbc.update("update overview_execution_plans set state='RECOVERY_REQUIRED',updated_at=? where id=?",
                            timestamp(now), old.id());
                    jdbc.update("update overview_execution_nodes set state='RECOVERY_REQUIRED',safe_error_code='UNKNOWN_DISPATCH',updated_at=? "
                                    + "where plan_id=? and state<>'VERIFIED'",
                            timestamp(now), old.id());
                    return new OpenResult(null, List.of(), true);
                }
            }
            if (same != null) {
                List<Node> nodes = readNodes(same.id());
                if (nodes.size() != specs.size()) throw corrupt("plan node count");
                for (int i = 0; i < specs.size(); i++) {
                    Node node = nodes.get(i);
                    NodeSpec spec = specs.get(i);
                    if (!node.descriptorSha256().equals(spec.descriptorSha256())
                            || !node.checkpointStep().equals(spec.checkpointStep())) throw corrupt("plan identity");
                }
                for (PlanRow old : previous) {
                    if (!old.id().equals(same.id())) {
                        jdbc.update("update overview_execution_plans set state='SUPERSEDED',updated_at=? where id=?",
                                timestamp(now), old.id());
                    }
                }
                jdbc.update("update overview_execution_plans set state='READY',updated_at=? where id=?",
                        timestamp(now), same.id());
                return new OpenResult(same.id(), nodes, false);
            }

            Long planVersions = jdbc.queryForObject("select count(*) from overview_execution_plans where generation_id=?",
                    Long.class, lease.generationId());
            if (planVersions == null || planVersions >= MAX_PLANS_PER_GENERATION) throw capacity("plan versions");
            UUID planId = UUID.randomUUID();
            jdbc.update("insert into overview_execution_plans (id,generation_id,input_fingerprint,profile_fingerprint,"
                            + "algorithm_version,plan_fingerprint,mode,state,payload_json,created_at,updated_at) "
                            + "values (?,?,?,?,?,?,?,'READY',?,?,?)",
                    planId, lease.generationId(), lease.inputFingerprint(), lease.profileFingerprint(),
                    lease.algorithmVersion(), planFingerprint, mode, planJson, timestamp(now), timestamp(now));
            List<Node> nodes = new ArrayList<>(specs.size());
            for (int index = 0; index < specs.size(); index++) {
                NodeSpec spec = specs.get(index);
                UUID nodeId = UUID.randomUUID();
                jdbc.update("insert into overview_execution_nodes (id,plan_id,generation_id,node_ordinal,descriptor_json,"
                                + "descriptor_sha256,checkpoint_step,state,created_at,updated_at) values (?,?,?,?,?,?,?,'PENDING',?,?)",
                        nodeId, planId, lease.generationId(), index, spec.descriptorJson(), spec.descriptorSha256(),
                        spec.checkpointStep(), timestamp(now), timestamp(now));
                nodes.add(new Node(nodeId, planId, index, "PENDING", 0, spec.checkpointStep(), spec.descriptorSha256(), null));
            }
            for (PlanRow old : previous) jdbc.update("update overview_execution_plans set state='SUPERSEDED',updated_at=? where id=?",
                    timestamp(now), old.id());
            return new OpenResult(planId, List.copyOf(nodes), false);
        });
    }

    /** Prevents profile/algorithm changes from planning around an old unresolved writer call. */
    public boolean priorProfilesAreSafe(OverviewGenerationCoordinator.GenerationLease lease) {
        return transactions.execute(status -> {
            lockUserAndGeneration(lease);
            List<PlanRow> prior = jdbc.query("select id,state from overview_execution_plans where generation_id=? "
                            + "and state<>'SUPERSEDED' and (profile_fingerprint<>? or algorithm_version<>? "
                            + "or input_fingerprint<>?) order by created_at for update",
                    (rs, row) -> new PlanRow(rs.getObject("id", UUID.class), rs.getString("state")),
                    lease.generationId(), lease.profileFingerprint(), lease.algorithmVersion(), lease.inputFingerprint());
            Instant now = clock.instant();
            boolean safe = true;
            for (PlanRow old : prior) {
                if (allCallsSafe(old.id(), lease)) continue;
                jdbc.update("update overview_execution_plans set state='RECOVERY_REQUIRED',updated_at=? where id=?",
                        timestamp(now), old.id());
                jdbc.update("update overview_execution_nodes set state='RECOVERY_REQUIRED',safe_error_code='UNKNOWN_DISPATCH',updated_at=? "
                                + "where plan_id=? and state<>'VERIFIED'",
                        timestamp(now), old.id());
                safe = false;
            }
            return safe;
        });
    }

    public Attempt beginAttempt(OverviewGenerationCoordinator.GenerationLease lease, Node node) {
        Objects.requireNonNull(node);
        return transactions.execute(status -> {
            lockUserAndGeneration(lease);
            Instant now = clock.instant();
            PlanState plan = jdbc.query("select state from overview_execution_plans where id=? and generation_id=? for update",
                    rs -> rs.next() ? new PlanState(rs.getString("state")) : null, node.planId(), lease.generationId());
            if (plan == null || "SUPERSEDED".equals(plan.state())) throw stale();
            NodeState current = jdbc.query("select state,attempt,descriptor_sha256,checkpoint_step,checkpoint_sha256,safe_error_code from overview_execution_nodes "
                            + "where id=? and plan_id=? for update",
                    rs -> rs.next() ? new NodeState(rs.getString("state"), rs.getInt("attempt"),
                            rs.getString("descriptor_sha256"), rs.getString("checkpoint_step"), null, null,
                            rs.getString("checkpoint_sha256"), rs.getString("safe_error_code")) : null,
                    node.id(), node.planId());
            if (current == null || !current.descriptorSha256().equals(node.descriptorSha256())
                    || !current.checkpointStep().equals(node.checkpointStep())) throw stale();
            if ("RECOVERY_REQUIRED".equals(current.state()) && "CHECKPOINT_INVALID".equals(current.safeErrorCode())) {
                return new Attempt(node.id(), node.planId(), current.attempt(), false, true);
            }
            if ("VERIFIED".equals(current.state())) {
                CheckpointStatus checkpoint = checkpointStatus(lease, node.checkpointStep(), current.checkpointSha256());
                if (checkpoint.valid()) {
                    jdbc.update("update overview_execution_plans set state='WRITING',updated_at=? where id=?",
                            timestamp(now), node.planId());
                    return new Attempt(node.id(), node.planId(), current.attempt(), true, false);
                }
                if (checkpoint.exists()) {
                    jdbc.update("update overview_execution_nodes set state='RECOVERY_REQUIRED',safe_error_code='CHECKPOINT_INVALID',updated_at=? where id=?",
                            timestamp(now), node.id());
                    jdbc.update("update overview_execution_plans set state='RECOVERY_REQUIRED',updated_at=? where id=?",
                            timestamp(now), node.planId());
                    return new Attempt(node.id(), node.planId(), current.attempt(), false, true);
                }
            }
            if (!allNodeCallsSafe(node.id(), lease)) {
                jdbc.update("update overview_execution_nodes set state='RECOVERY_REQUIRED',safe_error_code='UNKNOWN_DISPATCH',updated_at=? where id=?",
                        timestamp(now), node.id());
                jdbc.update("update overview_execution_plans set state='RECOVERY_REQUIRED',updated_at=? where id=?",
                        timestamp(now), node.planId());
                return new Attempt(node.id(), node.planId(), current.attempt(), false, true);
            }
            int attempt = current.attempt() + 1;
            if (attempt > MAX_ATTEMPTS_PER_NODE) throw capacity("node attempts");
            jdbc.update("update overview_execution_nodes set state='RUNNING',attempt=?,owner_id=?,fence=?,"
                            + "checkpoint_sha256=null,safe_error_code=null,updated_at=? where id=?",
                    attempt, lease.ownerId(), lease.fence(), timestamp(now), node.id());
            jdbc.update("update overview_execution_plans set state='WRITING',updated_at=? where id=?",
                    timestamp(now), node.planId());
            return new Attempt(node.id(), node.planId(), attempt, false, false);
        });
    }

    public void bindReservation(OverviewGenerationCoordinator.GenerationLease lease, UUID taskId,
                               AiOperationKind operationKind, Attempt attempt, UUID reservationId) {
        Objects.requireNonNull(taskId);
        Objects.requireNonNull(attempt);
        Objects.requireNonNull(reservationId);
        AiOperationKind expectedKind = "SOURCE".equals(lease.scopeType())
                ? AiOperationKind.SOURCE_OVERVIEW : AiOperationKind.SUBJECT_OVERVIEW;
        UUID expectedTaskId = ledgerTaskId(lease);
        if (!OVERVIEW_OPERATIONS.contains(operationKind) || operationKind != expectedKind
                || !expectedTaskId.equals(taskId)) throw invalid("operation identity");
        Optional<AiInvocationState> initial = usageQuery.invocationStateForOwner(lease.userId(), expectedTaskId,
                reservationId, Set.of(operationKind));
        if (initial.isEmpty() || !reservationId.equals(initial.get().reservationId())
                || !taskId.equals(initial.get().taskId())
                || operationKind != initial.get().operationKind()
                || !"RESERVED".equals(initial.get().state()) || initial.get().requestDispatched()) {
            throw new DomainException("AI_POLICY_CONTRACT_VIOLATION", "Overview invocation could not be bound before dispatch");
        }
        transactions.executeWithoutResult(status -> {
            lockUserAndGeneration(lease);
            Instant now = clock.instant();
            lockPlan(attempt.planId(), lease.generationId());
            NodeState node = jdbc.query("select state,attempt,owner_id,fence from overview_execution_nodes where id=? and plan_id=? for update",
                    rs -> rs.next() ? new NodeState(rs.getString("state"), rs.getInt("attempt"),
                            null, null, rs.getObject("owner_id", UUID.class), rs.getObject("fence", Long.class)) : null,
                    attempt.nodeId(), attempt.planId());
            if (node == null || !"RUNNING".equals(node.state()) || node.attempt() != attempt.number()
                    || !lease.ownerId().equals(node.ownerId()) || lease.fence() != node.fence()) throw stale();
            jdbc.update("insert into overview_execution_calls (id,generation_id,plan_id,node_id,attempt,reservation_id,task_id,"
                            + "user_id,operation_kind,created_at) values (?,?,?,?,?,?,?,?,?,?)",
                    UUID.randomUUID(), lease.generationId(), attempt.planId(), attempt.nodeId(), attempt.number(),
                    reservationId, taskId, lease.userId(), operationKind.name(), timestamp(now));
        });
    }

    /** Atomically stores the verified writer checkpoint and marks its node trusted. */
    public void verifyAndSaveCheckpoint(OverviewGenerationCoordinator.GenerationLease lease, Attempt attempt,
                                        String checkpointStep, String payloadJson) {
        if (payloadJson == null || payloadJson.isBlank()
                || exceeds(overviewLimits.maxCheckpointChars(), payloadJson.length())) {
            throw capacity("writer checkpoint");
        }
        String payloadHash = sha256(payloadJson);
        transactions.executeWithoutResult(status -> {
            lockUserAndGeneration(lease);
            Instant now = clock.instant();
            lockPlan(attempt.planId(), lease.generationId());
            NodeState node = jdbc.query("select state,attempt,checkpoint_step,owner_id,fence from overview_execution_nodes "
                            + "where id=? and plan_id=? for update",
                    rs -> rs.next() ? new NodeState(rs.getString("state"), rs.getInt("attempt"),
                            null, rs.getString("checkpoint_step"), rs.getObject("owner_id", UUID.class),
                            rs.getObject("fence", Long.class)) : null,
                    attempt.nodeId(), attempt.planId());
            if (node == null || !"RUNNING".equals(node.state()) || node.attempt() != attempt.number()
                    || !checkpointStep.equals(node.checkpointStep()) || !lease.ownerId().equals(node.ownerId())
                    || lease.fence() != node.fence()) throw stale();
            StoredCheckpoint existing = jdbc.query("select payload_json,payload_sha256 from overview_generation_checkpoints "
                            + "where generation_id=? and step_key=? and input_fingerprint=? and profile_fingerprint=? "
                            + "and algorithm_version=? for update",
                    rs -> rs.next() ? new StoredCheckpoint(rs.getString("payload_json"), rs.getString("payload_sha256")) : null,
                    lease.generationId(), checkpointStep, lease.inputFingerprint(), lease.profileFingerprint(), lease.algorithmVersion());
            if (existing == null) {
                jdbc.update("insert into overview_generation_checkpoints (id,generation_id,step_key,input_fingerprint,"
                                + "profile_fingerprint,algorithm_version,payload_json,payload_sha256,schema_version,created_at) "
                                + "values (?,?,?,?,?,?,?,?,?,?)",
                        UUID.randomUUID(), lease.generationId(), checkpointStep, lease.inputFingerprint(),
                        lease.profileFingerprint(), lease.algorithmVersion(), payloadJson, payloadHash, 1, timestamp(now));
            } else if (existing.payloadJson() == null || existing.payloadSha256() == null
                    || !existing.payloadSha256().trim().equals(payloadHash)
                    || !sha256(existing.payloadJson()).equals(existing.payloadSha256().trim())) {
                throw new DomainException("RESOURCE_VERSION_CONFLICT", "A different verified writer checkpoint already exists");
            }
            int changed = jdbc.update("update overview_execution_nodes set state='VERIFIED',checkpoint_sha256=?,"
                            + "safe_error_code=null,verified_at=?,updated_at=? where id=? and plan_id=? and state='RUNNING' "
                            + "and attempt=? and owner_id=? and fence=?",
                    payloadHash, timestamp(now), timestamp(now), attempt.nodeId(), attempt.planId(), attempt.number(),
                    lease.ownerId(), lease.fence());
            if (changed != 1) throw stale();
        });
    }

    public void failNode(OverviewGenerationCoordinator.GenerationLease lease, Attempt attempt, String safeCode) {
        if (safeCode == null || !safeCode.matches("[A-Z0-9_]{1,64}")) safeCode = "OVERVIEW_GENERATION_FAILED";
        String code = safeCode;
        transactions.executeWithoutResult(status -> {
            lockUserAndGeneration(lease);
            Instant now = clock.instant();
            lockPlan(attempt.planId(), lease.generationId());
            jdbc.update("update overview_execution_nodes set state='FAILED',safe_error_code=?,updated_at=? "
                            + "where id=? and plan_id=? and state='RUNNING' and attempt=? and owner_id=? and fence=?",
                    code, timestamp(now), attempt.nodeId(), attempt.planId(), attempt.number(), lease.ownerId(), lease.fence());
        });
    }

    public void markAssembled(OverviewGenerationCoordinator.GenerationLease lease, UUID planId) {
        transactions.executeWithoutResult(status -> {
            lockUserAndGeneration(lease);
            lockPlan(planId, lease.generationId());
            Long unfinished = jdbc.queryForObject("select count(*) from overview_execution_nodes where plan_id=? and state<>'VERIFIED'",
                    Long.class, planId);
            if (unfinished == null || unfinished != 0) throw stale();
            int changed = jdbc.update("update overview_execution_plans set state='ASSEMBLED',updated_at=? where id=? "
                            + "and generation_id=? and state='WRITING'",
                    timestamp(clock.instant()), planId, lease.generationId());
            if (changed != 1) throw stale();
        });
    }

    private boolean allCallsSafe(UUID planId, OverviewGenerationCoordinator.GenerationLease lease) {
        return allCallsSafe(planId, lease, false);
    }

    private boolean allCallsSafe(UUID planId, OverviewGenerationCoordinator.GenerationLease lease,
                                 boolean allowTerminalUnknownWriter) {
        if (!allowTerminalUnknownWriter) {
            List<Call> calls = jdbc.query("select node_id,reservation_id,task_id,user_id,operation_kind,attempt "
                            + "from overview_execution_calls where plan_id=? order by created_at,id",
                    (rs, row) -> new Call(rs.getObject("node_id", UUID.class), rs.getObject("reservation_id", UUID.class),
                            rs.getObject("task_id", UUID.class), rs.getObject("user_id", UUID.class),
                            rs.getString("operation_kind"), rs.getInt("attempt")), planId);
            for (Call call : calls) if (!callSafe(call, lease)) return false;
            return true;
        }
        List<UUID> nodes = jdbc.query("select distinct node_id from overview_execution_calls where plan_id=? order by node_id",
                (rs, row) -> rs.getObject("node_id", UUID.class), planId);
        for (UUID nodeId : nodes) if (!allNodeCallsSafe(nodeId, lease)) return false;
        return true;
    }

    private boolean allNodeCallsSafe(UUID nodeId, OverviewGenerationCoordinator.GenerationLease lease) {
        List<Call> calls = jdbc.query("select reservation_id,task_id,user_id,operation_kind,attempt from overview_execution_calls "
                        + "where node_id=? order by attempt,created_at",
                (rs, row) -> new Call(nodeId, rs.getObject("reservation_id", UUID.class),
                        rs.getObject("task_id", UUID.class), rs.getObject("user_id", UUID.class),
                        rs.getString("operation_kind"), rs.getInt("attempt")), nodeId);
        Call unresolved = null;
        for (Call call : calls) {
            if (callSafe(call, lease)) continue;
            if (unresolved != null || !conservativelyChargedUnknownWriterCall(call, lease)) return false;
            unresolved = call;
        }
        if (unresolved == null) return true;

        NodeState node = jdbc.query("select state,attempt,checkpoint_step,checkpoint_sha256,safe_error_code "
                        + "from overview_execution_nodes where id=? and generation_id=?",
                rs -> rs.next() ? new NodeState(rs.getString("state"), rs.getInt("attempt"), null,
                        rs.getString("checkpoint_step"), null, null, rs.getString("checkpoint_sha256"),
                        rs.getString("safe_error_code")) : null, nodeId, lease.generationId());
        if (node == null || unresolved.attempt() < 1 || node.attempt() < unresolved.attempt()) return false;
        if ("VERIFIED".equals(node.state())) {
            return node.attempt() > unresolved.attempt()
                    && checkpointStatus(lease, node.checkpointStep(), node.checkpointSha256()).valid();
        }
        if ("FAILED".equals(node.state())) {
            if (node.attempt() == unresolved.attempt()) return true;
            return jdbc.queryForObject("select count(*) from overview_execution_calls where node_id=? and attempt>?",
                    Integer.class, nodeId, unresolved.attempt()) > 0;
        }
        return "RECOVERY_REQUIRED".equals(node.state())
                && "UNKNOWN_DISPATCH".equals(node.safeErrorCode())
                && node.attempt() == unresolved.attempt();
    }

    /** Side-effect-free preflight exception; beginAttempt repeats this under the generation and node locks. */
    public boolean permitsTerminalUnknownWriterInvocation(OverviewGenerationCoordinator.GenerationLease lease,
                                                          UUID reservationId) {
        if (lease == null || reservationId == null) return false;
        List<Call> calls = jdbc.query("select node_id,reservation_id,task_id,user_id,operation_kind,attempt "
                        + "from overview_execution_calls where generation_id=? and reservation_id=?",
                (rs, row) -> new Call(rs.getObject("node_id", UUID.class), rs.getObject("reservation_id", UUID.class),
                        rs.getObject("task_id", UUID.class), rs.getObject("user_id", UUID.class),
                        rs.getString("operation_kind"), rs.getInt("attempt")), lease.generationId(), reservationId);
        if (calls.size() != 1) return false;
        Call call = calls.getFirst();
        return !callSafe(call, lease) && conservativelyChargedUnknownWriterCall(call, lease)
                && allNodeCallsSafe(call.nodeId(), lease);
    }

    private boolean conservativelyChargedUnknownWriterCall(Call call,
                                                            OverviewGenerationCoordinator.GenerationLease lease) {
        AiOperationKind expectedKind = "SOURCE".equals(lease.scopeType())
                ? AiOperationKind.SOURCE_OVERVIEW : AiOperationKind.SUBJECT_OVERVIEW;
        return lease.userId().equals(call.userId()) && ledgerTaskId(lease).equals(call.taskId())
                && expectedKind.name().equals(call.operationKind())
                && usageQuery.isConservativelyChargedTerminalFailure(lease.userId(), call.taskId(),
                        call.reservationId(), expectedKind);
    }

    private boolean callSafe(Call call, OverviewGenerationCoordinator.GenerationLease lease) {
        UUID expectedTaskId = ledgerTaskId(lease);
        if (!lease.userId().equals(call.userId()) || !expectedTaskId.equals(call.taskId())) return false;
        AiOperationKind kind;
        try { kind = AiOperationKind.valueOf(call.operationKind()); }
        catch (IllegalArgumentException | NullPointerException invalid) { return false; }
        AiOperationKind expectedKind = "SOURCE".equals(lease.scopeType())
                ? AiOperationKind.SOURCE_OVERVIEW : AiOperationKind.SUBJECT_OVERVIEW;
        if (!OVERVIEW_OPERATIONS.contains(kind) || kind != expectedKind) return false;
        Optional<AiInvocationState> found = usageQuery.invocationStateForOwner(call.userId(), call.taskId(),
                call.reservationId(), Set.of(kind));
        if (found.isEmpty()) return false;
        AiInvocationState state = found.get();
        if (!call.taskId().equals(state.taskId()) || !call.reservationId().equals(state.reservationId())
                || kind != state.operationKind()) return false;
        return switch (state.state()) {
            case "COMPLETED" -> true;
            case "FAILED" -> !state.requestDispatched()
                    || state.actualInputTokens() != null && state.actualOutputTokens() != null;
            case "RESERVED", "RELEASED", "EXPIRED" -> !state.requestDispatched();
            default -> false;
        };
    }

    private UUID ledgerTaskId(OverviewGenerationCoordinator.GenerationLease lease) {
        AiFeature feature = "SOURCE".equals(lease.scopeType()) ? AiFeature.SOURCE_OVERVIEW : AiFeature.SUBJECT_OVERVIEW;
        return AiTaskContext.overviewLedgerTaskId(lease.userId(), feature, lease.budgetTaskId());
    }

    private List<Node> readNodes(UUID planId) {
        return jdbc.query("select id,plan_id,node_ordinal,state,attempt,checkpoint_step,descriptor_sha256,checkpoint_sha256 "
                        + "from overview_execution_nodes where plan_id=? order by node_ordinal",
                (rs, row) -> new Node(rs.getObject("id", UUID.class), rs.getObject("plan_id", UUID.class),
                        rs.getInt("node_ordinal"), rs.getString("state"), rs.getInt("attempt"),
                        rs.getString("checkpoint_step"), rs.getString("descriptor_sha256"), rs.getString("checkpoint_sha256")), planId);
    }

    private CheckpointStatus checkpointStatus(OverviewGenerationCoordinator.GenerationLease lease,
                                              String step, String expectedHash) {
        return jdbc.query("select payload_json,payload_sha256 from overview_generation_checkpoints where generation_id=? "
                        + "and step_key=? and input_fingerprint=? and profile_fingerprint=? and algorithm_version=?",
                rs -> {
                    if (!rs.next()) return new CheckpointStatus(false, false);
                    String payload = rs.getString("payload_json");
                    String storedHash = rs.getString("payload_sha256");
                    return new CheckpointStatus(true, payload != null && storedHash != null
                            && storedHash.trim().equals(expectedHash) && sha256(payload).equals(storedHash.trim()));
                }, lease.generationId(), step, lease.inputFingerprint(), lease.profileFingerprint(), lease.algorithmVersion());
    }

    private void lockUserAndGeneration(OverviewGenerationCoordinator.GenerationLease lease) {
        String userState = jdbc.query("select status from users where id=? for update",
                rs -> rs.next() ? rs.getString("status") : null, lease.userId());
        if (!"ACTIVE".equals(userState)) throw stale();
        Instant now = clock.instant();
        boolean owns = jdbc.query("select id from overview_generations where id=? and user_id=? and status='ACTIVE' "
                        + "and owner_id=? and fence=? and lease_until>? for update",
                rs -> { return rs.next(); }, lease.generationId(), lease.userId(), lease.ownerId(), lease.fence(), timestamp(now));
        if (!owns) throw stale();
    }

    private void lockPlan(UUID planId, UUID generationId) {
        boolean exists = jdbc.query("select id from overview_execution_plans where id=? and generation_id=? for update",
                rs -> { return rs.next(); }, planId, generationId);
        if (!exists) throw stale();
    }

    private OffsetDateTime timestamp(Instant instant) { return instant.atOffset(ZoneOffset.UTC); }
    private void validateHash(String value) {
        if (value == null || !value.matches("(?i)[0-9a-f]{64}")) throw invalid("fingerprint");
    }
    private String sha256(String value) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8))); }
        catch (NoSuchAlgorithmException exception) { throw new IllegalStateException("SHA-256 is unavailable", exception); }
    }
    private static boolean exceeds(long maximum, long actual) {
        return maximum > 0 && actual > maximum;
    }
    private DomainException invalid(String field) { return new DomainException("VALIDATION_FAILED", "Overview execution journal " + field + " is invalid"); }
    private DomainException capacity(String field) { return new DomainException("OVERVIEW_PROVIDER_OUTPUT_TOO_LARGE", "Overview execution journal exceeds its " + field + " limit"); }
    private DomainException stale() { return new DomainException("MODEL_TIMEOUT", "Overview execution ownership changed before journal update"); }
    private DomainException corrupt(String field) { return new DomainException("VALIDATION_FAILED", "Stored Overview execution " + field + " is invalid"); }

    public record NodeSpec(String descriptorJson, String descriptorSha256, String checkpointStep) { }
    public record Node(UUID id, UUID planId, int ordinal, String state, int attempt, String checkpointStep,
                       String descriptorSha256, String checkpointSha256) { }
    public record OpenResult(UUID planId, List<Node> nodes, boolean recoveryRequired) { }
    public record Attempt(UUID nodeId, UUID planId, int number, boolean alreadyVerified, boolean recoveryRequired) { }
    private record PlanRow(UUID id, String state) { }
    private record PlanState(String state) { }
    private record NodeState(String state, int attempt, String descriptorSha256, String checkpointStep,
                             UUID ownerId, Long fence, String checkpointSha256, String safeErrorCode) {
        private NodeState(String state, int attempt, String descriptorSha256, String checkpointStep) {
            this(state, attempt, descriptorSha256, checkpointStep, null, null, null, null);
        }
        private NodeState(String state, int attempt, String descriptorSha256, String checkpointStep,
                          UUID ownerId, Long fence) {
            this(state, attempt, descriptorSha256, checkpointStep, ownerId, fence, null, null);
        }
    }
    private record Call(UUID nodeId, UUID reservationId, UUID taskId, UUID userId, String operationKind, int attempt) { }
    private record StoredCheckpoint(String payloadJson, String payloadSha256) { }
    private record CheckpointStatus(boolean exists, boolean valid) { }
}
