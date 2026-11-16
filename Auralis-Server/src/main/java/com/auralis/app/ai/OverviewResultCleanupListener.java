package com.auralis.app.ai;

import com.auralis.app.shared.domain.ResourceDeletedEvent;
import com.auralis.app.shared.domain.ResourceType;
import org.springframework.context.event.EventListener;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
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
        List<UUID> generationIds = new ArrayList<>();
        if (!scopeSourceIds.isEmpty()) {
            String placeholders = String.join(",", java.util.Collections.nCopies(scopeSourceIds.size(), "?"));
            List<Object> args = new ArrayList<>();
            args.add(userId);
            args.addAll(scopeSourceIds);
            generationIds.addAll(jdbcTemplate.query("select id from overview_generations where user_id=? "
                            + "and scope_type='SOURCE' and scope_id in (" + placeholders + ") order by id",
                    (rs, rowNum) -> rs.getObject(1, UUID.class), args.toArray()));
        }
        if (subjectId != null) {
            generationIds.addAll(jdbcTemplate.query("select id from overview_generations where user_id=? "
                            + "and scope_type='SUBJECT' and scope_id=? order by id",
                    (rs, rowNum) -> rs.getObject(1, UUID.class), userId, subjectId));
        }
        List<UUID> orderedGenerations = generationIds.stream().filter(java.util.Objects::nonNull).distinct()
                .sorted().toList();
        for (UUID generationId : orderedGenerations) {
            jdbcTemplate.query("select id from overview_generations where id=? and user_id=? for update",
                    (org.springframework.jdbc.core.ResultSetExtractor<Boolean>) rs -> rs.next(), generationId, userId);
        }

        java.time.OffsetDateTime now = java.time.OffsetDateTime.now(java.time.ZoneOffset.UTC);
        for (UUID generationId : orderedGenerations) {
            jdbcTemplate.update("update overview_generations set status='FAILED',active_fingerprint=null,owner_id=null,"
                            + "fence=fence+1,lease_until=null,result_json=null,result_sha256=null,result_expires_at=null,"
                            + "error_code='OVERVIEW_SOURCE_REVOKED',error_status=null,error_retry_after_seconds=null,error_reset_at=null,"
                            + "updated_at=?,completed_at=? where id=? and user_id=?",
                    now, now, generationId, userId);
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

}
