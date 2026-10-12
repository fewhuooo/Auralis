ALTER TABLE ingestion_jobs
    ADD COLUMN next_attempt_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE ingestion_jobs
    ADD COLUMN failure_count INTEGER NOT NULL DEFAULT 0;

-- attempt_count is monotonic and includes claims, while failure_count drives the retry budget.
-- PENDING/FAILED rows have exhausted every claimed attempt; active rows still own the latest
-- attempt, and READY rows completed their latest attempt successfully.
UPDATE ingestion_jobs
SET failure_count = CASE
    WHEN status IN ('PENDING', 'FAILED') THEN attempt_count
    WHEN status IN ('PARSING', 'INDEXING', 'READY') THEN GREATEST(attempt_count - 1, 0)
    ELSE 0
END;

ALTER TABLE ingestion_jobs
    ADD CONSTRAINT ck_ingestion_jobs_failure_count CHECK (failure_count >= 0);

CREATE INDEX ix_ingestion_jobs_claim_due
    ON ingestion_jobs (status, next_attempt_at, created_at);

CREATE TABLE ai_usage_locks (
    scope_key VARCHAR(80) PRIMARY KEY,
    scope_type VARCHAR(16) NOT NULL,
    user_id UUID,
    feature VARCHAR(32),
    task_key_hash CHAR(64),
    current_task_id UUID,
    owner_id UUID,
    lease_until TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ck_ai_usage_locks_scope_type CHECK (scope_type IN ('GLOBAL', 'USER', 'TASK')),
    CONSTRAINT fk_ai_usage_locks_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

INSERT INTO ai_usage_locks (scope_key, scope_type)
VALUES ('GLOBAL', 'GLOBAL');

CREATE TABLE ai_usage_reservations (
    id UUID PRIMARY KEY,
    task_id UUID NOT NULL,
    user_id UUID,
    feature VARCHAR(32) NOT NULL,
    stage VARCHAR(32) NOT NULL,
    provider VARCHAR(32) NOT NULL,
    model VARCHAR(160),
    state VARCHAR(16) NOT NULL,
    estimated_input_tokens BIGINT NOT NULL,
    reserved_output_tokens BIGINT NOT NULL,
    actual_input_tokens BIGINT,
    actual_output_tokens BIGINT,
    charged_tokens BIGINT NOT NULL DEFAULT 0,
    request_dispatched BOOLEAN NOT NULL DEFAULT FALSE,
    error_code VARCHAR(64),
    owner_id UUID NOT NULL,
    lease_until TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    settled_at TIMESTAMP WITH TIME ZONE,
    CONSTRAINT ck_ai_usage_reservations_state CHECK (
        state IN ('RESERVED', 'COMPLETED', 'FAILED', 'RELEASED', 'EXPIRED')),
    CONSTRAINT ck_ai_usage_reservations_estimated_input CHECK (estimated_input_tokens >= 0),
    CONSTRAINT ck_ai_usage_reservations_reserved_output CHECK (reserved_output_tokens >= 0),
    CONSTRAINT ck_ai_usage_reservations_actual_input CHECK (actual_input_tokens IS NULL OR actual_input_tokens >= 0),
    CONSTRAINT ck_ai_usage_reservations_actual_output CHECK (actual_output_tokens IS NULL OR actual_output_tokens >= 0),
    CONSTRAINT ck_ai_usage_reservations_charged CHECK (charged_tokens >= 0),
    CONSTRAINT fk_ai_usage_reservations_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
);

CREATE INDEX ix_ai_usage_reservations_active_lease
    ON ai_usage_reservations (state, lease_until);

CREATE INDEX ix_ai_usage_reservations_user_window
    ON ai_usage_reservations (user_id, created_at);

CREATE INDEX ix_ai_usage_reservations_global_window
    ON ai_usage_reservations (created_at, charged_tokens);

CREATE INDEX ix_ai_usage_reservations_task_history
    ON ai_usage_reservations (task_id, created_at);
