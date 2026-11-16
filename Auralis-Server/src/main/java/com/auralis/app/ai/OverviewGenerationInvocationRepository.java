package com.auralis.app.ai;

import com.auralis.app.ai.usage.AiFeature;
import com.auralis.app.ai.usage.AiTaskContext;
import com.auralis.app.shared.error.DomainException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;

@Repository
public class OverviewGenerationInvocationRepository {
    private final JdbcTemplate jdbc;
    private final Clock clock;

    public OverviewGenerationInvocationRepository(JdbcTemplate jdbc, Clock clock) {
        this.jdbc = jdbc;
        this.clock = clock;
    }

    @Transactional
    public void record(OverviewGenerationCoordinator.GenerationLease generation, UUID reservationId,
                       String purpose, String stage) {
        lockActiveUser(generation.userId());
        requireGenerationOwner(generation);
        UUID ledgerTaskId = ledgerTaskId(generation);
        jdbc.update("insert into overview_generation_invocations (id,job_id,generation_id,task_id,reservation_id,user_id,"
                        + "purpose,stage,owner_id,generation_fence,job_fence) values (?,?,?,?,?,?,?,?,?,?,?)",
                UUID.randomUUID(), null, generation.generationId(), ledgerTaskId, reservationId, generation.userId(),
                purpose, stage, generation.ownerId(), generation.fence(), null);
    }

    @Transactional
    public void beforeDispatch(OverviewGenerationCoordinator.GenerationLease generation, UUID reservationId) {
        lockActiveUser(generation.userId());
        requireGenerationOwner(generation);
        UUID ledgerTaskId = ledgerTaskId(generation);
        Integer count = jdbc.queryForObject("select count(*) from overview_generation_invocations "
                        + "where reservation_id=? and generation_id=? and task_id=? and user_id=? "
                        + "and job_id is null and job_fence is null",
                Integer.class, reservationId, generation.generationId(), ledgerTaskId, generation.userId());
        if (count == null || count != 1) throw stale();
    }

    @Transactional(readOnly = true)
    public List<InvocationRow> findByGeneration(UUID userId, UUID generationId) {
        return jdbc.query("select reservation_id,task_id,generation_id,user_id,purpose,stage,owner_id,generation_fence,job_fence "
                        + "from overview_generation_invocations where user_id=? and generation_id=? order by created_at,id",
                (rs, row) -> new InvocationRow(rs.getObject("reservation_id", UUID.class),
                        rs.getObject("task_id", UUID.class), rs.getObject("generation_id", UUID.class),
                        rs.getObject("user_id", UUID.class), rs.getString("purpose"), rs.getString("stage"),
                        rs.getObject("owner_id", UUID.class), rs.getLong("generation_fence"),
                        rs.getObject("job_fence", Long.class)), userId, generationId);
    }

    private void lockActiveUser(UUID userId) {
        String status = jdbc.query("select status from users where id=? for update",
                rs -> rs.next() ? rs.getString(1) : null, userId);
        if (!"ACTIVE".equals(status)) throw new DomainException("UNAUTHENTICATED", "The account is unavailable");
    }

    private void requireGenerationOwner(OverviewGenerationCoordinator.GenerationLease generation) {
        String status = jdbc.query("select status from overview_generations where id=? and user_id=? and owner_id=? "
                        + "and fence=? and budget_task_id=? and lease_until>? for update",
                rs -> rs.next() ? rs.getString(1) : null, generation.generationId(), generation.userId(),
                generation.ownerId(), generation.fence(), generation.budgetTaskId(), timestamp());
        if (!"ACTIVE".equals(status)) throw stale();
    }

    private UUID ledgerTaskId(OverviewGenerationCoordinator.GenerationLease generation) {
        String scopeType = jdbc.query("select scope_type from overview_generations where id=? and user_id=? and budget_task_id=?",
                rs -> rs.next() ? rs.getString(1) : null, generation.generationId(), generation.userId(),
                generation.budgetTaskId());
        if (scopeType == null) throw stale();
        AiFeature feature = "SOURCE".equals(scopeType) ? AiFeature.SOURCE_OVERVIEW : AiFeature.SUBJECT_OVERVIEW;
        return AiTaskContext.overviewLedgerTaskId(generation.userId(), feature, generation.budgetTaskId());
    }

    private OffsetDateTime timestamp() {
        return clock.instant().atOffset(ZoneOffset.UTC);
    }

    private static DomainException stale() {
        return new DomainException("MODEL_TIMEOUT", "Overview generation ownership expired");
    }

    public record InvocationRow(UUID reservationId, UUID taskId, UUID generationId, UUID userId, String purpose,
                                String stage, UUID generationOwner, long generationFence, Long jobFence) { }
}
