package com.auralis.app.ai;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Clock;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.UUID;

/** Bounded retention for successful private Overview candidates and execution payload copies. */
@Service
public class OverviewPrivatePayloadRetentionService {
    private static final int BATCH_SIZE = 100;
    private static final int RETENTION_DAYS = 14;

    private final JdbcTemplate jdbc;
    private final TransactionTemplate transactions;
    private final Clock clock;

    public OverviewPrivatePayloadRetentionService(JdbcTemplate jdbc,
                                                   PlatformTransactionManager transactionManager,
                                                   Clock clock) {
        this.jdbc = jdbc;
        this.transactions = new TransactionTemplate(transactionManager);
        this.transactions.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        this.clock = clock;
    }

    public int cleanupExpiredPrivatePayloads() {
        Integer changed = transactions.execute(status -> {
            OffsetDateTime now = clock.instant().atOffset(ZoneOffset.UTC);
            OffsetDateTime cutoff = now.minus(Duration.ofDays(RETENTION_DAYS));
            List<UUID> expiredJobs = jdbc.query("select j.id from overview_generation_jobs j join overview_generations g "
                            + "on g.id=j.generation_id where j.status='COMPLETED' and j.completed_at<=? "
                            + "and g.status='SUCCESS' "
                            + "order by j.id limit ? for update of j skip locked",
                    (rs, rowNum) -> rs.getObject(1, UUID.class), cutoff, BATCH_SIZE);
            List<UUID> jobGenerationIds = new ArrayList<>();
            if (!expiredJobs.isEmpty()) {
                String jobPlaceholders = String.join(",", java.util.Collections.nCopies(expiredJobs.size(), "?"));
                jobGenerationIds.addAll(jdbc.query("select distinct j.generation_id from overview_generation_jobs "
                                + "j where j.id in (" + jobPlaceholders + ") and j.generation_id is not null "
                                + "and not exists (select 1 from overview_generation_jobs other where other.generation_id=j.generation_id "
                                + "and other.id not in (" + jobPlaceholders + ") and not "
                                + "(other.status='EXPIRED' and other.safe_error_code='OVERVIEW_PAYLOAD_EXPIRED' "
                                + "and other.candidate_json is null)) order by j.generation_id",
                        (rs, rowNum) -> rs.getObject(1, UUID.class), concat(expiredJobs, expiredJobs)));
            }

            int standaloneLimit = Math.max(0, BATCH_SIZE - jobGenerationIds.stream().distinct().toList().size());
            List<UUID> standaloneCandidates = standaloneLimit == 0 ? List.of() : jdbc.query("select g.id from overview_generations g "
                            + "where g.status='SUCCESS' and g.completed_at<=? and (exists (select 1 from overview_execution_plans p "
                            + "where p.generation_id=g.id and p.state='ASSEMBLED') or exists (select 1 from overview_execution_nodes n "
                            + "where n.generation_id=g.id and n.state='VERIFIED')) and not exists "
                            + "(select 1 from overview_generation_jobs j where j.generation_id=g.id) "
                            + "order by g.completed_at,g.id limit ?",
                    (rs, rowNum) -> rs.getObject(1, UUID.class), cutoff, standaloneLimit);
            LinkedHashSet<UUID> generations = new LinkedHashSet<>(jobGenerationIds.stream().sorted().toList());
            generations.addAll(standaloneCandidates);
            if (generations.isEmpty() && expiredJobs.isEmpty()) return 0;

            // Job parents are locked before generations, matching publication and resource-revocation order.
            List<UUID> orderedGenerations = new ArrayList<>();
            for (UUID generationId : generations.stream().sorted().toList()) {
                Integer locked = jdbc.query("select id from overview_generations where id=? for update",
                        rs -> rs.next() ? 1 : 0, generationId);
                if (locked != null && locked == 1) orderedGenerations.add(generationId);
            }

            int count = 0;
            for (UUID jobId : expiredJobs) {
                jdbc.update("update overview_publication_intents set status='FAILED',safe_error_code='OVERVIEW_PAYLOAD_EXPIRED',"
                                + "retry_at=null,version=version+1,updated_at=? where job_id=? and status='PENDING'",
                        now, jobId);
                count += jdbc.update("update overview_generation_jobs set status='EXPIRED',stage='COMPLETE',candidate_json=null,"
                                + "request_json='{}',source_manifest_json='[]',worker_owner_id=null,lease_until=null,"
                                + "worker_fence=worker_fence+1,pause_requested=false,cancel_requested=false,"
                                + "safe_error_code='OVERVIEW_PAYLOAD_EXPIRED',version=version+1,updated_at=?,completed_at=? "
                                + "where id=? and status='COMPLETED'",
                        now, now, jobId);
            }
            for (UUID generationId : orderedGenerations) {
                count += jdbc.update("update overview_generations set result_json=null,result_sha256=null,result_expires_at=null "
                                + "where id=? and status='SUCCESS'", generationId);
                count += jdbc.update("delete from overview_generation_checkpoints where generation_id=?", generationId);
                count += jdbc.update("update overview_execution_plans set state='SUPERSEDED',payload_json='{}',updated_at=? "
                                + "where generation_id=? and state='ASSEMBLED'",
                        now, generationId);
                count += jdbc.update("update overview_execution_nodes set state='FAILED',descriptor_json='{}',owner_id=null,"
                                + "fence=coalesce(fence,0)+1,safe_error_code='OVERVIEW_PAYLOAD_EXPIRED',updated_at=? "
                                + "where generation_id=? and state='VERIFIED'",
                        now, generationId);
            }
            return count;
        });
        return changed == null ? 0 : changed;
    }

    @Scheduled(fixedDelay = 3_600_000L)
    public void cleanupExpiredPrivatePayloadsScheduled() {
        cleanupExpiredPrivatePayloads();
    }

    private static Object[] concat(List<UUID> first, List<UUID> second) {
        Object[] values = new Object[first.size() + second.size()];
        for (int i = 0; i < first.size(); i++) values[i] = first.get(i);
        for (int i = 0; i < second.size(); i++) values[first.size() + i] = second.get(i);
        return values;
    }

}
