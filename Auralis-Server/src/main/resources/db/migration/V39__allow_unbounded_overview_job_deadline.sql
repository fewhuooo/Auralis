ALTER TABLE overview_generation_jobs DROP CONSTRAINT ck_overview_jobs_lease;

ALTER TABLE overview_generation_jobs ADD CONSTRAINT ck_overview_jobs_lease CHECK (
    (status = 'RUNNING' AND worker_owner_id IS NOT NULL AND lease_until IS NOT NULL)
    OR (status <> 'RUNNING' AND (worker_owner_id IS NULL OR status IN ('PAUSING','CANCELLING')))
);
