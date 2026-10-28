CREATE TABLE overview_generation_jobs (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    client_request_id UUID NOT NULL,
    generation_request_id UUID NOT NULL,
    scope_type VARCHAR(16) NOT NULL,
    scope_id UUID NOT NULL,
    mode VARCHAR(16) NOT NULL,
    request_hash CHAR(64) NOT NULL,
    request_json TEXT NOT NULL,
    source_manifest_json TEXT NOT NULL,
    input_fingerprint CHAR(64) NOT NULL,
    profile_fingerprint CHAR(64) NOT NULL,
    algorithm_version VARCHAR(64) NOT NULL,
    generation_id UUID REFERENCES overview_generations(id) ON DELETE SET NULL,
    budget_task_id UUID,
    status VARCHAR(24) NOT NULL,
    stage VARCHAR(32) NOT NULL,
    verified_nodes INTEGER NOT NULL DEFAULT 0,
    total_nodes INTEGER,
    version INTEGER NOT NULL DEFAULT 1,
    worker_owner_id UUID,
    worker_fence BIGINT NOT NULL DEFAULT 0,
    lease_until TIMESTAMP WITH TIME ZONE,
    deadline_at TIMESTAMP WITH TIME ZONE,
    pause_requested BOOLEAN NOT NULL DEFAULT FALSE,
    cancel_requested BOOLEAN NOT NULL DEFAULT FALSE,
    candidate_json TEXT,
    safe_error_code VARCHAR(64),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE,
    CONSTRAINT uq_overview_jobs_owner_client_request UNIQUE (user_id, client_request_id),
    CONSTRAINT uq_overview_jobs_owner_generation_request UNIQUE (user_id, generation_request_id),
    CONSTRAINT ck_overview_jobs_scope CHECK (scope_type IN ('SOURCE','SUBJECT')),
    CONSTRAINT ck_overview_jobs_mode CHECK (mode IN ('ALL','OUTLINE')),
    CONSTRAINT ck_overview_jobs_status CHECK (status IN ('QUEUED','RUNNING','PAUSING','PAUSED','CANCELLING','CANCELLED','COMPLETED','FAILED','RECOVERY_REQUIRED','EXPIRED')),
    CONSTRAINT ck_overview_jobs_stage CHECK (stage IN ('QUEUED','VALIDATING','INDEXING','PLANNING','WRITING','ASSEMBLING','COMPLETE')),
    CONSTRAINT ck_overview_jobs_counts CHECK (verified_nodes >= 0 AND (total_nodes IS NULL OR total_nodes >= verified_nodes)),
    CONSTRAINT ck_overview_jobs_version CHECK (version > 0 AND worker_fence >= 0),
    CONSTRAINT ck_overview_jobs_payload CHECK (CHAR_LENGTH(request_json) BETWEEN 2 AND 16384
        AND CHAR_LENGTH(source_manifest_json) BETWEEN 2 AND 262144
        AND (candidate_json IS NULL OR CHAR_LENGTH(candidate_json) <= 1048576)),
    CONSTRAINT ck_overview_jobs_lease CHECK (
        (status = 'RUNNING' AND worker_owner_id IS NOT NULL AND lease_until IS NOT NULL AND deadline_at IS NOT NULL)
        OR (status <> 'RUNNING' AND (worker_owner_id IS NULL OR status IN ('PAUSING','CANCELLING')))
    )
);

CREATE INDEX ix_overview_jobs_claim ON overview_generation_jobs (status, created_at, id);
CREATE INDEX ix_overview_jobs_scope ON overview_generation_jobs (user_id, scope_type, scope_id, status, updated_at);
CREATE INDEX ix_overview_jobs_generation ON overview_generation_jobs (generation_id);

CREATE TABLE overview_generation_invocations (
    id UUID PRIMARY KEY,
    job_id UUID REFERENCES overview_generation_jobs(id) ON DELETE CASCADE,
    generation_id UUID NOT NULL REFERENCES overview_generations(id) ON DELETE CASCADE,
    task_id UUID NOT NULL,
    reservation_id UUID NOT NULL,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    purpose VARCHAR(40) NOT NULL,
    stage VARCHAR(24) NOT NULL,
    owner_id UUID NOT NULL,
    generation_fence BIGINT NOT NULL,
    job_fence BIGINT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_overview_generation_invocation_reservation UNIQUE (reservation_id),
    CONSTRAINT ck_overview_generation_invocation_purpose CHECK (CHAR_LENGTH(purpose) BETWEEN 1 AND 40),
    CONSTRAINT ck_overview_generation_invocation_stage CHECK (stage IN ('INTERMEDIATE','FINAL')),
    CONSTRAINT ck_overview_generation_invocation_fence CHECK (generation_fence > 0 AND (job_fence IS NULL OR job_fence > 0))
);

CREATE INDEX ix_overview_generation_invocations_generation ON overview_generation_invocations (generation_id, created_at, id);
CREATE INDEX ix_overview_generation_invocations_job ON overview_generation_invocations (job_id, created_at, id);
