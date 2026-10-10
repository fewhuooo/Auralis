package com.auralis.app.ai;

import com.auralis.app.shared.domain.ResourceDeletedEvent;
import com.auralis.app.shared.domain.ResourceType;
import org.springframework.context.event.EventListener;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
public class OverviewResultCleanupListener {
    private final JdbcTemplate jdbcTemplate;

    public OverviewResultCleanupListener(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @EventListener
    @Transactional
    public void onResourceDeleted(ResourceDeletedEvent event) {
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
}
