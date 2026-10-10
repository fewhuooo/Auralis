package com.auralis.app.identity;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;

/** Retries object cleanup before permanently removing a disabled account. */
@Service
public class AccountDeletionCleanupService {

    private static final Logger log = LoggerFactory.getLogger(AccountDeletionCleanupService.class);
    private static final int OBJECT_PAGE_SIZE = 100;
    private static final int MAX_RECONCILIATION_PAGES_PER_RUN = 20;
    private static final long RECONCILIATION_INTERVAL_SECONDS = 24 * 60 * 60;
    private static final long RECONCILIATION_RETRY_SECONDS = 5 * 60;
    private final JdbcTemplate jdbcTemplate;
    private final AccountDeletionObjectStoragePort objectStorage;
    private final TransactionTemplate transactionTemplate;
    private final Clock clock;

    public AccountDeletionCleanupService(
            JdbcTemplate jdbcTemplate,
            AccountDeletionObjectStoragePort objectStorage,
            PlatformTransactionManager transactionManager,
            Clock clock) {
        this.jdbcTemplate = jdbcTemplate;
        this.objectStorage = objectStorage;
        this.transactionTemplate = new TransactionTemplate(transactionManager);
        this.clock = clock;
    }

    @Scheduled(
            fixedDelayString = "${auralis.identity.account-deletion-delay-millis:60000}",
            initialDelayString = "${auralis.identity.account-deletion-initial-delay-millis:60000}")
    public void scheduledCleanup() {
        processPending();
    }

    public int processPending() {
        int completed = 0;
        for (int attempts = 0; attempts < 20; attempts++) {
            UUID jobId = claimNext();
            if (jobId == null) {
                break;
            }
            if (processClaimed(jobId)) {
                completed++;
            } else {
                break;
            }
        }
        reconcileCompletedObjects();
        return completed;
    }

    private UUID claimNext() {
        return transactionTemplate.execute(status -> {
            Instant now = clock.instant();
            UUID jobId = jdbcTemplate.query(
                    "select id from account_deletion_jobs where not_before <= ? and "
                            + "(status in ('PENDING', 'FAILED') or (status = 'CLEANING' and lease_until < ?)) "
                            + "order by requested_at limit 1 for update",
                    resultSet -> resultSet.next() ? resultSet.getObject("id", UUID.class) : null,
                    toUtcOffsetDateTime(now), toUtcOffsetDateTime(now));
            if (jobId != null) {
                jdbcTemplate.update(
                        "update account_deletion_jobs set status = 'CLEANING', lease_until = ?, last_error = null where id = ?",
                        toUtcOffsetDateTime(now.plusSeconds(30 * 60)), jobId);
            }
            return jobId;
        });
    }

    private boolean processClaimed(UUID jobId) {
        try {
            while (true) {
                List<String> objectKeys = jdbcTemplate.query(
                        "select object_key from account_deletion_objects where job_id = ? and deleted_at is null "
                                + "order by object_key limit ?",
                        (resultSet, rowNum) -> resultSet.getString("object_key"), jobId, OBJECT_PAGE_SIZE);
                if (objectKeys.isEmpty()) {
                    break;
                }
                for (String objectKey : objectKeys) {
                    objectStorage.deleteObject(objectKey);
                    jdbcTemplate.update(
                            "update account_deletion_objects set deleted_at = ? where job_id = ? and object_key = ? and deleted_at is null",
                            toUtcOffsetDateTime(clock.instant()), jobId, objectKey);
                }
            }
            Boolean completed = transactionTemplate.execute(status -> finalizeDeletion(jobId));
            return Boolean.TRUE.equals(completed);
        } catch (RuntimeException exception) {
            jdbcTemplate.update(
                    "update account_deletion_jobs set status = 'FAILED', last_error = 'CLEANUP_FAILED', lease_until = null where id = ?",
                    jobId);
            log.warn("ACCOUNT_DELETION_CLEANUP_FAILED jobId={} errorType={}",
                    jobId, exception.getClass().getSimpleName());
            return false;
        }
    }

    private boolean finalizeDeletion(UUID jobId) {
        var job = jdbcTemplate.query(
                "select user_id, status, not_before from account_deletion_jobs where id = ? for update",
                resultSet -> resultSet.next()
                        ? new Object[] { resultSet.getObject("user_id", UUID.class),
                                resultSet.getString("status"), resultSet.getTimestamp("not_before").toInstant() }
                        : null,
                jobId);
        if (job == null || "COMPLETED".equals(job[1])) {
            return job != null;
        }
        if (!"CLEANING".equals(job[1]) || ((Instant) job[2]).isAfter(clock.instant())) {
            return false;
        }
        UUID userId = (UUID) job[0];
        UUID lockedUser = jdbcTemplate.query(
                "select id from users where id = ? and status = 'DISABLED' for update",
                resultSet -> resultSet.next() ? resultSet.getObject("id", UUID.class) : null,
                userId);
        if (lockedUser == null) {
            jdbcTemplate.update(
                    "update account_deletion_jobs set status = 'COMPLETED', completed_at = ?, lease_until = null, next_object_scan_at = ? "
                            + "where id = ? and status = 'CLEANING'",
                    toUtcOffsetDateTime(clock.instant()),
                    toUtcOffsetDateTime(clock.instant().plusSeconds(RECONCILIATION_INTERVAL_SECONDS)), jobId);
            return true;
        }

        String lastKey = "";
        while (true) {
            List<String> currentKeys = jdbcTemplate.query("""
                    select object_key from (
                        select object_key from assets where user_id = ?
                        union
                        select object_key from parsed_documents where user_id = ?
                    ) current_objects
                    where object_key > ? order by object_key limit ?
                    """, (resultSet, rowNum) -> resultSet.getString("object_key"),
                    userId, userId, lastKey, OBJECT_PAGE_SIZE);
            if (currentKeys.isEmpty()) {
                break;
            }
            for (String objectKey : currentKeys) {
                jdbcTemplate.update("insert into account_deletion_objects (job_id, object_key) "
                                + "select ?, ? where not exists (select 1 from account_deletion_objects where job_id = ? and object_key = ?)",
                        jobId, objectKey, jobId, objectKey);
            }
            lastKey = currentKeys.get(currentKeys.size() - 1);
            if (currentKeys.size() < OBJECT_PAGE_SIZE) {
                break;
            }
        }
        Integer pendingObjects = jdbcTemplate.queryForObject(
                "select count(*) from account_deletion_objects where job_id = ? and deleted_at is null",
                Integer.class, jobId);
        if (pendingObjects != null && pendingObjects > 0) {
            jdbcTemplate.update(
                    "update account_deletion_jobs set status = 'PENDING', lease_until = null where id = ?",
                    jobId);
            return false;
        }

        jdbcTemplate.update("delete from ingestion_jobs where user_id = ?", userId);
        jdbcTemplate.update("delete from parsed_documents where user_id = ?", userId);
        jdbcTemplate.update("delete from source_chunks where user_id = ?", userId);
        jdbcTemplate.update("delete from review_events where user_id = ?", userId);
        jdbcTemplate.update("delete from review_states where user_id = ?", userId);
        jdbcTemplate.update("delete from focus_sessions where user_id = ?", userId);
        jdbcTemplate.update("delete from overview_write_receipts where user_id = ?", userId);
        jdbcTemplate.update("delete from overview_results where user_id = ?", userId);
        jdbcTemplate.update("delete from messages where user_id = ?", userId);
        jdbcTemplate.update("delete from conversations where user_id = ?", userId);
        jdbcTemplate.update("delete from relations where user_id = ?", userId);
        jdbcTemplate.update("delete from tasks where user_id = ?", userId);
        jdbcTemplate.update("delete from knowledge_blocks where user_id = ?", userId);
        jdbcTemplate.update("delete from sources where user_id = ?", userId);
        jdbcTemplate.update("delete from assets where user_id = ?", userId);
        jdbcTemplate.update("delete from subjects where user_id = ?", userId);
        jdbcTemplate.update("delete from ai_credentials where user_id = ?", userId);
        jdbcTemplate.update("delete from change_log where user_id = ?", userId);
        jdbcTemplate.update("delete from inbound_mutations where user_id = ?", userId);
        jdbcTemplate.update("delete from sync_cursor_high_water where user_id = ?", userId);
        jdbcTemplate.update("delete from realtime_tickets where user_id = ?", userId);
        jdbcTemplate.update("delete from user_avatars where user_id = ?", userId);
        jdbcTemplate.update("update refresh_sessions set replaced_by_session_id = null where user_id = ?", userId);
        jdbcTemplate.update("delete from refresh_sessions where user_id = ?", userId);
        jdbcTemplate.update("delete from devices where user_id = ?", userId);
        int deleted = jdbcTemplate.update("delete from users where id = ? and status = 'DISABLED'", userId);
        if (deleted != 1) {
            throw new IllegalStateException("Disabled account was not removed");
        }
        jdbcTemplate.update(
                "update account_deletion_jobs set status = 'COMPLETED', completed_at = ?, last_error = null, lease_until = null, next_object_scan_at = ? where id = ?",
                toUtcOffsetDateTime(clock.instant()),
                toUtcOffsetDateTime(clock.instant().plusSeconds(RECONCILIATION_INTERVAL_SECONDS)), jobId);
        return true;
    }

    private void reconcileCompletedObjects() {
        for (int attempts = 0; attempts < 20; attempts++) {
            UUID jobId = claimCompletedReconciliation();
            if (jobId == null) {
                return;
            }
            try {
                String afterKey = jdbcTemplate.query(
                        "select object_scan_after_key from account_deletion_jobs where id = ?",
                        resultSet -> resultSet.next() ? resultSet.getString(1) : null, jobId);
                String lastKey = afterKey;
                int pages = 0;
                boolean more = false;
                while (pages < MAX_RECONCILIATION_PAGES_PER_RUN) {
                    List<String> keys = nextObjectKeys(jobId, lastKey);
                    if (keys.isEmpty()) {
                        more = false;
                        break;
                    }
                    for (String key : keys) {
                        objectStorage.deleteObject(key);
                    }
                    lastKey = keys.get(keys.size() - 1);
                    pages++;
                    more = keys.size() == OBJECT_PAGE_SIZE;
                    if (!more) {
                        break;
                    }
                }
                Instant now = clock.instant();
                Instant nextScan = more ? now.plusSeconds(60) : now.plusSeconds(RECONCILIATION_INTERVAL_SECONDS);
                jdbcTemplate.update("update account_deletion_jobs set object_scan_after_key = ?, next_object_scan_at = ?, "
                                + "lease_until = null, last_error = null where id = ? and status = 'COMPLETED'",
                        more ? lastKey : null, toUtcOffsetDateTime(nextScan), jobId);
                log.info("ACCOUNT_DELETION_OBJECT_RECONCILED jobId={} pages={} hasMore={}", jobId, pages, more);
            } catch (RuntimeException exception) {
                jdbcTemplate.update("update account_deletion_jobs set next_object_scan_at = ?, lease_until = null, "
                                + "last_error = 'OBJECT_RECONCILE_FAILED' where id = ? and status = 'COMPLETED'",
                        toUtcOffsetDateTime(clock.instant().plusSeconds(RECONCILIATION_RETRY_SECONDS)), jobId);
                log.warn("ACCOUNT_DELETION_OBJECT_RECONCILIATION_FAILED jobId={} errorType={}",
                        jobId, exception.getClass().getSimpleName());
            }
        }
    }

    private UUID claimCompletedReconciliation() {
        return transactionTemplate.execute(status -> {
            Instant now = clock.instant();
            UUID jobId = jdbcTemplate.query(
                    "select id from account_deletion_jobs where status = 'COMPLETED' and next_object_scan_at <= ? "
                            + "and (lease_until is null or lease_until < ?) order by next_object_scan_at "
                            + "limit 1 for update",
                    resultSet -> resultSet.next() ? resultSet.getObject("id", UUID.class) : null,
                    toUtcOffsetDateTime(now), toUtcOffsetDateTime(now));
            if (jobId != null) {
                jdbcTemplate.update("update account_deletion_jobs set lease_until = ? where id = ?",
                        toUtcOffsetDateTime(now.plusSeconds(30 * 60)), jobId);
            }
            return jobId;
        });
    }

    private List<String> nextObjectKeys(UUID jobId, String afterKey) {
        if (afterKey == null) {
            return jdbcTemplate.query("select object_key from account_deletion_objects where job_id = ? "
                            + "order by object_key limit ?",
                    (resultSet, rowNum) -> resultSet.getString("object_key"), jobId, OBJECT_PAGE_SIZE);
        }
        return jdbcTemplate.query("select object_key from account_deletion_objects where job_id = ? and object_key > ? "
                        + "order by object_key limit ?",
                (resultSet, rowNum) -> resultSet.getString("object_key"), jobId, afterKey, OBJECT_PAGE_SIZE);
    }

    private static OffsetDateTime toUtcOffsetDateTime(Instant instant) {
        return OffsetDateTime.ofInstant(instant, ZoneOffset.UTC);
    }
}
