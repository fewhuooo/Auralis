package com.auralis.app.ai;

import com.auralis.app.ai.usage.AiFeature;
import com.auralis.app.ai.usage.AiInvocationState;
import com.auralis.app.ai.usage.AiOperationKind;
import com.auralis.app.ai.usage.AiTaskContext;
import com.auralis.app.ai.usage.AiUsageQueryService;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

/** Verifies terminal usage evidence associated with retained writer calls. */
@Service
public class OverviewExecutionJournal {
    private static final Set<AiOperationKind> OVERVIEW_OPERATIONS = Set.of(
            AiOperationKind.SOURCE_OVERVIEW, AiOperationKind.SUBJECT_OVERVIEW);

    private final JdbcTemplate jdbc;
    private final AiUsageQueryService usageQuery;

    public OverviewExecutionJournal(JdbcTemplate jdbc, AiUsageQueryService usageQuery) {
        this.jdbc = jdbc;
        this.usageQuery = usageQuery;
    }

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
                rs -> rs.next() ? new NodeState(rs.getString("state"), rs.getInt("attempt"),
                        rs.getString("checkpoint_step"), rs.getString("checkpoint_sha256"),
                        rs.getString("safe_error_code")) : null, nodeId, lease.generationId());
        if (node == null || unresolved.attempt() < 1 || node.attempt() < unresolved.attempt()) return false;
        if ("VERIFIED".equals(node.state())) {
            return node.attempt() > unresolved.attempt()
                    && hasVerifiedCheckpoint(lease, node.checkpointStep(), node.checkpointSha256());
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

    private boolean hasVerifiedCheckpoint(OverviewGenerationCoordinator.GenerationLease lease,
                                              String step, String expectedHash) {
        return jdbc.query("select payload_json,payload_sha256 from overview_generation_checkpoints where generation_id=? "
                        + "and step_key=? and input_fingerprint=? and profile_fingerprint=? and algorithm_version=?",
                rs -> {
                    if (!rs.next()) return false;
                    String payload = rs.getString("payload_json");
                    String storedHash = rs.getString("payload_sha256");
                    return payload != null && storedHash != null
                            && storedHash.trim().equals(expectedHash) && sha256(payload).equals(storedHash.trim());
                }, lease.generationId(), step, lease.inputFingerprint(), lease.profileFingerprint(), lease.algorithmVersion());
    }

    private String sha256(String value) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8))); }
        catch (NoSuchAlgorithmException exception) { throw new IllegalStateException("SHA-256 is unavailable", exception); }
    }
    private record NodeState(String state, int attempt, String checkpointStep,
                             String checkpointSha256, String safeErrorCode) { }
    private record Call(UUID nodeId, UUID reservationId, UUID taskId, UUID userId, String operationKind, int attempt) { }
}
