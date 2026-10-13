CREATE TABLE overview_generations (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    scope_type VARCHAR(16) NOT NULL,
    scope_id UUID NOT NULL,
    source_revision UUID,
    input_fingerprint CHAR(64) NOT NULL,
    payload_fingerprint CHAR(64) NOT NULL,
    active_fingerprint CHAR(64),
    profile_fingerprint CHAR(64) NOT NULL,
    algorithm_version VARCHAR(64) NOT NULL,
    budget_task_id UUID NOT NULL,
    status VARCHAR(16) NOT NULL,
    owner_id UUID,
    fence BIGINT NOT NULL DEFAULT 0,
    lease_until TIMESTAMP WITH TIME ZONE,
    result_json TEXT,
    result_sha256 CHAR(64),
    result_expires_at TIMESTAMP WITH TIME ZONE,
    estimated_input_tokens BIGINT NOT NULL DEFAULT 0,
    reserved_output_tokens BIGINT NOT NULL DEFAULT 0,
    actual_input_tokens BIGINT,
    actual_output_tokens BIGINT,
    charged_tokens BIGINT NOT NULL DEFAULT 0,
    provider_usage_complete BOOLEAN NOT NULL DEFAULT FALSE,
    unknown_dispatched_calls BIGINT NOT NULL DEFAULT 0,
    active_dispatched_reservations BIGINT NOT NULL DEFAULT 0,
    recovery_count INTEGER NOT NULL DEFAULT 0,
    recovery_actions_json VARCHAR(8192) NOT NULL DEFAULT '[]',
    error_code VARCHAR(64),
    error_status INTEGER,
    error_retry_after_seconds BIGINT,
    error_reset_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE,
    CONSTRAINT fk_overview_generations_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT uq_overview_generations_budget_task UNIQUE (budget_task_id),
    CONSTRAINT uq_overview_generations_active_input UNIQUE (user_id, scope_type, scope_id, active_fingerprint),
    CONSTRAINT ck_overview_generations_status CHECK (status IN ('ACTIVE', 'FAILED', 'SUCCESS')),
    CONSTRAINT ck_overview_generations_scope CHECK (
        (scope_type = 'SOURCE' AND source_revision IS NOT NULL)
        OR (scope_type = 'SUBJECT' AND source_revision IS NULL)
    ),
    CONSTRAINT ck_overview_generations_fence CHECK (fence >= 0),
    CONSTRAINT ck_overview_generations_recovery_count CHECK (recovery_count >= 0),
    CONSTRAINT ck_overview_generations_estimated_tokens CHECK (estimated_input_tokens >= 0),
    CONSTRAINT ck_overview_generations_reserved_tokens CHECK (reserved_output_tokens >= 0),
    CONSTRAINT ck_overview_generations_actual_input CHECK (actual_input_tokens IS NULL OR actual_input_tokens >= 0),
    CONSTRAINT ck_overview_generations_actual_output CHECK (actual_output_tokens IS NULL OR actual_output_tokens >= 0),
    CONSTRAINT ck_overview_generations_charged_tokens CHECK (charged_tokens >= 0),
    CONSTRAINT ck_overview_generations_unknown_dispatched CHECK (unknown_dispatched_calls >= 0),
    CONSTRAINT ck_overview_generations_active_reservations CHECK (active_dispatched_reservations >= 0),
    CONSTRAINT ck_overview_generations_state CHECK (
        (status = 'ACTIVE' AND active_fingerprint IS NOT NULL AND owner_id IS NOT NULL AND lease_until IS NOT NULL)
        OR (status <> 'ACTIVE' AND active_fingerprint IS NULL AND owner_id IS NULL AND lease_until IS NULL)
    ),
    CONSTRAINT ck_overview_generations_result_size CHECK (result_json IS NULL OR CHAR_LENGTH(result_json) <= 1048576),
    CONSTRAINT ck_overview_generations_recovery_size CHECK (CHAR_LENGTH(recovery_actions_json) <= 8192),
    CONSTRAINT ck_overview_generations_failure_details CHECK (
        (error_status IS NULL AND error_retry_after_seconds IS NULL AND error_reset_at IS NULL)
        OR (status = 'FAILED' AND error_code IS NOT NULL AND error_status IS NOT NULL AND error_retry_after_seconds IS NOT NULL
            AND error_retry_after_seconds >= 0 AND (
                (error_code = 'AI_REQUEST_BUDGET_EXCEEDED' AND error_status = 413)
                OR (error_code = 'AI_TASK_BUDGET_EXCEEDED' AND error_status = 422)
                OR (error_code IN ('AI_CONCURRENCY_LIMIT','AI_HOURLY_QUOTA_EXCEEDED','AI_DAILY_QUOTA_EXCEEDED')
                    AND error_status = 429)
                OR (error_code = 'AI_GLOBAL_QUOTA_EXCEEDED' AND error_status = 503)
            ))
    )
);

CREATE INDEX ix_overview_generations_user_input_status
    ON overview_generations (user_id, scope_type, scope_id, input_fingerprint, status, updated_at);

CREATE INDEX ix_overview_generations_expired_payload
    ON overview_generations (status, result_expires_at);

CREATE TABLE overview_generation_requests (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    request_id UUID NOT NULL,
    generation_id UUID NOT NULL,
    input_fingerprint CHAR(64) NOT NULL,
    payload_fingerprint CHAR(64) NOT NULL,
    profile_fingerprint CHAR(64) NOT NULL,
    algorithm_version VARCHAR(64) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_overview_generation_requests_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_overview_generation_requests_generation FOREIGN KEY (generation_id)
        REFERENCES overview_generations(id) ON DELETE CASCADE,
    CONSTRAINT uq_overview_generation_requests_owner_request UNIQUE (user_id, request_id)
);

CREATE INDEX ix_overview_generation_requests_generation
    ON overview_generation_requests (generation_id, created_at);

CREATE TABLE overview_generation_checkpoints (
    id UUID PRIMARY KEY,
    generation_id UUID NOT NULL,
    step_key VARCHAR(160) NOT NULL,
    input_fingerprint CHAR(64) NOT NULL,
    profile_fingerprint CHAR(64) NOT NULL,
    algorithm_version VARCHAR(64) NOT NULL,
    payload_json TEXT NOT NULL,
    payload_sha256 CHAR(64) NOT NULL,
    schema_version INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_overview_generation_checkpoints_generation FOREIGN KEY (generation_id)
        REFERENCES overview_generations(id) ON DELETE CASCADE,
    CONSTRAINT uq_overview_generation_checkpoints_identity UNIQUE
        (generation_id, step_key, input_fingerprint, profile_fingerprint, algorithm_version),
    CONSTRAINT ck_overview_generation_checkpoints_step CHECK (CHAR_LENGTH(step_key) BETWEEN 1 AND 160),
    CONSTRAINT ck_overview_generation_checkpoints_version CHECK (schema_version > 0),
    CONSTRAINT ck_overview_generation_checkpoints_size CHECK (CHAR_LENGTH(payload_json) <= 1048576)
);

CREATE INDEX ix_overview_generation_checkpoints_generation
    ON overview_generation_checkpoints (generation_id, created_at);
