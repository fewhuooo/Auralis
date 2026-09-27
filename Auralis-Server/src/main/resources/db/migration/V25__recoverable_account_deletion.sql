CREATE TABLE account_deletion_jobs (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    requested_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    not_before TIMESTAMP WITH TIME ZONE NOT NULL,
    next_object_scan_at TIMESTAMP WITH TIME ZONE,
    object_scan_after_key VARCHAR(1024),
    lease_until TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    last_error VARCHAR(64),
    CONSTRAINT uq_account_deletion_jobs_user UNIQUE (user_id),
    CONSTRAINT ck_account_deletion_jobs_status CHECK (status IN ('PENDING', 'CLEANING', 'FAILED', 'COMPLETED'))
);

CREATE TABLE account_deletion_objects (
    job_id UUID NOT NULL,
    object_key VARCHAR(1024) NOT NULL,
    deleted_at TIMESTAMP WITH TIME ZONE,
    CONSTRAINT pk_account_deletion_objects PRIMARY KEY (job_id, object_key),
    CONSTRAINT fk_account_deletion_objects_job FOREIGN KEY (job_id)
        REFERENCES account_deletion_jobs (id) ON DELETE CASCADE
);

CREATE INDEX ix_account_deletion_jobs_status ON account_deletion_jobs (status, requested_at);
CREATE INDEX ix_account_deletion_jobs_object_scan ON account_deletion_jobs (status, next_object_scan_at);
