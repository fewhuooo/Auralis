package com.auralis.app.ai;

import com.auralis.app.shared.domain.ResourceDeletedEvent;
import com.auralis.app.shared.domain.ResourceType;
import org.springframework.context.event.EventListener;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.UUID;

@Component
public class OverviewResultCleanupListener {
    private final JdbcTemplate jdbcTemplate;

    public OverviewResultCleanupListener(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @EventListener
    @Transactional
    public void onResourceDeleted(ResourceDeletedEvent event) {
        if (event.resourceType() != ResourceType.SUBJECT && event.resourceType() != ResourceType.SOURCE) return;
        List<UUID> sourceIds = event.resourceType() == ResourceType.SUBJECT
                ? jdbcTemplate.query("select id from sources where user_id=? and subject_id=? order by id",
                    (rs, rowNum) -> rs.getObject(1, UUID.class), event.userId(), event.resourceId())
                : List.of(event.resourceId());
        UUID subjectId = event.resourceType() == ResourceType.SUBJECT ? event.resourceId()
                : owningSubject(event.userId(), event.resourceId());
        revokeOverviewPayloads(event.userId(), subjectId, sourceIds);

        if (event.resourceType() == ResourceType.SUBJECT) {
            jdbcTemplate.update("delete from overview_results where user_id = ? "
                            + "and scope_type = 'SUBJECT' and scope_id = ?",
                    event.userId(), event.resourceId());
            return;
        }
        if (event.resourceType() != ResourceType.SOURCE) return;

        String sourceId = event.resourceId().toString();
        var subjectIds = jdbcTemplate.query("select subject_id from sources where id = ? and user_id = ?",
                (rs, rowNum) -> rs.getObject(1, java.util.UUID.class), event.resourceId(), event.userId());
        jdbcTemplate.update("delete from overview_results where user_id = ? and scope_type = 'SOURCE' and scope_id = ?",
                event.userId(), event.resourceId());
        if (!subjectIds.isEmpty()) {
            jdbcTemplate.update("delete from overview_results where user_id = ? and scope_type = 'SUBJECT' and scope_id = ?",
                    event.userId(), subjectIds.getFirst());
        }
        // A Source can already have been physically removed; invalidate any saved Subject result whose
        // manifest still names it, without depending on the Source module's internal persistence types.
        jdbcTemplate.update("delete from overview_results where user_id = ? and scope_type = 'SUBJECT' "
                        + "and (outline_source_manifest like ? or summary_source_manifest like ?)",
                event.userId(), "%" + sourceId + "%", "%" + sourceId + "%");
    }

    private UUID owningSubject(UUID userId, UUID sourceId) {
        return jdbcTemplate.query("select subject_id from sources where id=? and user_id=?",
                rs -> rs.next() ? rs.getObject(1, UUID.class) : null, sourceId, userId);
    }

    private void revokeOverviewPayloads(UUID userId, UUID subjectId, List<UUID> sourceIds) {
        List<UUID> scopeSourceIds = sourceIds == null ? List.of() : sourceIds.stream().distinct().sorted().toList();
        List<UUID> jobIds = new ArrayList<>();
        if (!scopeSourceIds.isEmpty()) {
            String placeholders = String.join(",", java.util.Collections.nCopies(scopeSourceIds.size(), "?"));
            List<Object> args = new ArrayList<>();
            args.add(userId);
            args.addAll(scopeSourceIds);
            jobIds.addAll(jdbcTemplate.query("select id from overview_generation_jobs where user_id=? "
                            + "and scope_type='SOURCE' and scope_id in (" + placeholders + ") order by id",
                    (rs, rowNum) -> rs.getObject(1, UUID.class), args.toArray()));
            if (scopeSourceIds.size() == 1) {
                String sourceId = scopeSourceIds.getFirst().toString();
                jobIds.addAll(jdbcTemplate.query("select id from overview_generation_jobs where user_id=? "
                                + "and scope_type='SUBJECT' and source_manifest_json like ? order by id",
                        (rs, rowNum) -> rs.getObject(1, UUID.class), userId, "%" + sourceId + "%"));
            }
        }
        if (subjectId != null) {
            jobIds.addAll(jdbcTemplate.query("select id from overview_generation_jobs where user_id=? "
                            + "and scope_type='SUBJECT' and scope_id=? order by id",
                    (rs, rowNum) -> rs.getObject(1, UUID.class), userId, subjectId));
        }
        List<UUID> orderedJobs = jobIds.stream().distinct().sorted(Comparator.naturalOrder()).toList();
        for (UUID jobId : orderedJobs) {
            jdbcTemplate.query("select id from overview_generation_jobs where id=? and user_id=? for update",
                    (org.springframework.jdbc.core.ResultSetExtractor<Boolean>) rs -> rs.next(), jobId, userId);
        }

        List<UUID> generationIds = new ArrayList<>();
        if (!scopeSourceIds.isEmpty()) {
            String placeholders = String.join(",", java.util.Collections.nCopies(scopeSourceIds.size(), "?"));
            List<Object> args = new ArrayList<>();
            args.add(userId);
            args.addAll(scopeSourceIds);
            generationIds.addAll(jdbcTemplate.query("select id from overview_generations where user_id=? "
                            + "and scope_type='SOURCE' and scope_id in (" + placeholders + ") order by id",
                    (rs, rowNum) -> rs.getObject(1, UUID.class), args.toArray()));
            if (scopeSourceIds.size() == 1) {
                String sourceId = scopeSourceIds.getFirst().toString();
                generationIds.addAll(jdbcTemplate.query("select distinct g.id from overview_generations g "
                                + "where g.user_id=? and g.scope_type='SUBJECT' and (exists (select 1 from overview_execution_plans p "
                                + "where p.generation_id=g.id and p.payload_json like ?) or exists "
                                + "(select 1 from overview_execution_nodes n where n.generation_id=g.id and n.descriptor_json like ?)) "
                                + "order by g.id",
                        (rs, rowNum) -> rs.getObject(1, UUID.class), userId, "%" + sourceId + "%", "%" + sourceId + "%"));
            }
        }
        if (subjectId != null) {
            generationIds.addAll(jdbcTemplate.query("select id from overview_generations where user_id=? "
                            + "and scope_type='SUBJECT' and scope_id=? order by id",
                    (rs, rowNum) -> rs.getObject(1, UUID.class), userId, subjectId));
        }
        if (!orderedJobs.isEmpty()) {
            String placeholders = String.join(",", java.util.Collections.nCopies(orderedJobs.size(), "?"));
            generationIds.addAll(jdbcTemplate.query("select distinct generation_id from overview_generation_jobs "
                            + "where user_id=? and id in (" + placeholders + ") and generation_id is not null order by generation_id",
                    (rs, rowNum) -> rs.getObject(1, UUID.class), prepend(userId, orderedJobs)));
        }
        List<UUID> orderedGenerations = generationIds.stream().filter(java.util.Objects::nonNull).distinct()
                .sorted().toList();
        for (UUID generationId : orderedGenerations) {
            jdbcTemplate.query("select id from overview_generations where id=? and user_id=? for update",
                    (org.springframework.jdbc.core.ResultSetExtractor<Boolean>) rs -> rs.next(), generationId, userId);
        }

        java.time.OffsetDateTime now = java.time.OffsetDateTime.now(java.time.ZoneOffset.UTC);
        for (UUID jobId : orderedJobs) {
            jdbcTemplate.update("update overview_publication_intents set status='FAILED',safe_error_code='OVERVIEW_SOURCE_REVOKED',"
                            + "retry_at=null,version=version+1,updated_at=? where job_id=? and status='PENDING'",
                    now, jobId);
            jdbcTemplate.update("update overview_generation_jobs set status='EXPIRED',stage='COMPLETE',candidate_json=null,"
                            + "request_json='{}',source_manifest_json='[]',worker_owner_id=null,lease_until=null,"
                            + "worker_fence=worker_fence+1,pause_requested=false,cancel_requested=false,"
                            + "safe_error_code='OVERVIEW_SOURCE_REVOKED',version=version+1,updated_at=?,completed_at=? "
                            + "where id=? and user_id=?",
                    now, now, jobId, userId);
        }
        for (UUID generationId : orderedGenerations) {
            jdbcTemplate.update("update overview_generations set status='FAILED',active_fingerprint=null,owner_id=null,"
                            + "fence=fence+1,lease_until=null,result_json=null,result_sha256=null,result_expires_at=null,"
                            + "error_code='OVERVIEW_SOURCE_REVOKED',error_status=null,error_retry_after_seconds=null,error_reset_at=null,"
                            + "updated_at=?,completed_at=? where id=? and user_id=?",
                    now, now, generationId, userId);
            jdbcTemplate.update("delete from overview_generation_checkpoints where generation_id=?", generationId);
            jdbcTemplate.update("update overview_execution_plans set state='RECOVERY_REQUIRED',payload_json='{}',updated_at=? "
                    + "where generation_id=?", now, generationId);
            jdbcTemplate.update("update overview_execution_nodes set state='RECOVERY_REQUIRED',descriptor_json='{}',"
                            + "owner_id=null,fence=coalesce(fence,0)+1,"
                            + "safe_error_code='OVERVIEW_SOURCE_REVOKED',updated_at=? where generation_id=?",
                    now, generationId);
        }
        scrubWriteReceipts(userId, subjectId, scopeSourceIds);
    }

    private void scrubWriteReceipts(UUID userId, UUID subjectId, List<UUID> sourceIds) {
        List<String> predicates = new ArrayList<>();
        List<Object> arguments = new ArrayList<>();
        if (!sourceIds.isEmpty()) {
            String placeholders = String.join(",", java.util.Collections.nCopies(sourceIds.size(), "?"));
            predicates.add("(scope_type='SOURCE' and scope_id in (" + placeholders + "))");
            sourceIds.forEach(arguments::add);
            List<String> sourceSnapshotMatches = new ArrayList<>();
            for (UUID sourceId : sourceIds) {
                sourceSnapshotMatches.add("response_snapshot like ?");
                arguments.add("%" + sourceId + "%");
            }
            String subjectScope = subjectId == null ? "" : "scope_id=? or ";
            if (subjectId != null) arguments.add(sourceIds.size(), subjectId);
            predicates.add("(scope_type='SUBJECT' and (" + subjectScope + String.join(" or ", sourceSnapshotMatches) + "))");
        } else if (subjectId != null) {
            predicates.add("(scope_type='SUBJECT' and scope_id=?)");
            arguments.add(subjectId);
        }
        if (predicates.isEmpty()) return;
        arguments.add(0, userId);
        jdbcTemplate.update("update overview_write_receipts set response_snapshot='{" + "\"revoked\":true" + "}' "
                + "where user_id=? and (" + String.join(" or ", predicates) + ")", arguments.toArray());
    }

    private static Object[] prepend(UUID userId, List<UUID> ids) {
        Object[] values = new Object[ids.size() + 1];
        values[0] = userId;
        for (int i = 0; i < ids.size(); i++) values[i + 1] = ids.get(i);
        return values;
    }

}
