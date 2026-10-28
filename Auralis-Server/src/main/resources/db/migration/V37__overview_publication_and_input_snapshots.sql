ALTER TABLE overview_generation_jobs
    ADD COLUMN publication_base_version BIGINT NOT NULL DEFAULT 0;
ALTER TABLE overview_generation_jobs
    ADD COLUMN publication_base_result_id UUID;
ALTER TABLE overview_generation_jobs
    ADD COLUMN publication_base_result_version BIGINT;

ALTER TABLE overview_generation_jobs
    ADD CONSTRAINT ck_overview_job_publication_base CHECK (
        publication_base_version >= 0
        AND ((publication_base_result_id IS NULL AND publication_base_result_version IS NULL)
            OR (publication_base_result_id IS NOT NULL AND publication_base_result_version IS NOT NULL
                AND publication_base_result_version > 0))
    );

ALTER TABLE overview_results
    ADD COLUMN outline_input_origin VARCHAR(32);
ALTER TABLE overview_results
    ADD COLUMN summary_input_origin VARCHAR(32);
ALTER TABLE overview_results
    ADD COLUMN outline_input_snapshot_json TEXT;
ALTER TABLE overview_results
    ADD COLUMN summary_input_snapshot_json TEXT;

UPDATE overview_results SET
    outline_input_origin = CASE WHEN outline IS NULL THEN NULL
        WHEN scope_type = 'SOURCE' THEN 'SOURCE_REVISION' ELSE 'SOURCE_OVERVIEW_PARTS' END,
    summary_input_origin = CASE WHEN summary IS NULL THEN NULL
        WHEN scope_type = 'SOURCE' THEN 'SOURCE_REVISION' ELSE 'SOURCE_OVERVIEW_PARTS' END;

ALTER TABLE overview_results
    ADD CONSTRAINT ck_overview_result_outline_input_origin CHECK (
        (outline IS NULL AND outline_input_origin IS NULL AND outline_input_snapshot_json IS NULL)
        OR (outline IS NOT NULL AND outline_input_origin IS NOT NULL AND outline_input_origin IN ('SOURCE_REVISION','SOURCE_OVERVIEW_PARTS','SOURCE_CONTENT')
            AND ((outline_input_origin = 'SOURCE_CONTENT' AND outline_input_snapshot_json IS NOT NULL)
                OR (outline_input_origin IN ('SOURCE_REVISION','SOURCE_OVERVIEW_PARTS') AND outline_input_snapshot_json IS NULL)))
    );
ALTER TABLE overview_results
    ADD CONSTRAINT ck_overview_result_summary_input_origin CHECK (
        (summary IS NULL AND summary_input_origin IS NULL AND summary_input_snapshot_json IS NULL)
        OR (summary IS NOT NULL AND summary_input_origin IS NOT NULL AND summary_input_origin IN ('SOURCE_REVISION','SOURCE_OVERVIEW_PARTS','SOURCE_CONTENT')
            AND ((summary_input_origin = 'SOURCE_CONTENT' AND summary_input_snapshot_json IS NOT NULL)
                OR (summary_input_origin IN ('SOURCE_REVISION','SOURCE_OVERVIEW_PARTS') AND summary_input_snapshot_json IS NULL)))
    );
ALTER TABLE overview_results
    ADD CONSTRAINT ck_overview_result_input_snapshot_size CHECK (
        (outline_input_snapshot_json IS NULL OR CHAR_LENGTH(outline_input_snapshot_json) BETWEEN 2 AND 262144)
        AND (summary_input_snapshot_json IS NULL OR CHAR_LENGTH(summary_input_snapshot_json) BETWEEN 2 AND 262144)
    );

CREATE TABLE overview_publication_intents (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    job_id UUID NOT NULL REFERENCES overview_generation_jobs(id) ON DELETE CASCADE,
    generation_id UUID NOT NULL REFERENCES overview_generations(id) ON DELETE CASCADE,
    plan_id UUID NOT NULL REFERENCES overview_execution_plans(id) ON DELETE CASCADE,
    client_publish_id UUID NOT NULL,
    result_client_write_id UUID NOT NULL,
    expected_job_version INTEGER NOT NULL,
    request_hash CHAR(64) NOT NULL,
    candidate_sha256 CHAR(64) NOT NULL,
    input_fingerprint CHAR(64) NOT NULL,
    profile_fingerprint CHAR(64) NOT NULL,
    algorithm_version VARCHAR(64) NOT NULL,
    base_version BIGINT NOT NULL,
    base_result_id UUID,
    base_result_version BIGINT,
    status VARCHAR(16) NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    attempt_count INTEGER NOT NULL DEFAULT 0,
    retry_at TIMESTAMP WITH TIME ZONE,
    safe_error_code VARCHAR(64),
    result_id UUID,
    result_version BIGINT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    published_at TIMESTAMP WITH TIME ZONE,
    CONSTRAINT uq_overview_publication_user_client UNIQUE (user_id, client_publish_id),
    CONSTRAINT uq_overview_publication_job_plan UNIQUE (job_id, plan_id),
    CONSTRAINT uq_overview_publication_result_write UNIQUE (result_client_write_id),
    CONSTRAINT ck_overview_publication_hashes CHECK (
        CHAR_LENGTH(request_hash) = 64 AND CHAR_LENGTH(candidate_sha256) = 64
        AND CHAR_LENGTH(input_fingerprint) = 64 AND CHAR_LENGTH(profile_fingerprint) = 64
    ),
    CONSTRAINT ck_overview_publication_base CHECK (
        base_version >= 0
        AND ((base_result_id IS NULL AND base_result_version IS NULL)
            OR (base_result_id IS NOT NULL AND base_result_version IS NOT NULL AND base_result_version > 0))
    ),
    CONSTRAINT ck_overview_publication_status CHECK (status IN ('PENDING','PUBLISHED','CONFLICT','FAILED')),
    CONSTRAINT ck_overview_publication_version CHECK (version > 0 AND attempt_count BETWEEN 0 AND 3),
    CONSTRAINT ck_overview_publication_expected_job_version CHECK (expected_job_version > 0),
    CONSTRAINT ck_overview_publication_result CHECK (
        (status = 'PUBLISHED' AND result_id IS NOT NULL AND result_version IS NOT NULL AND published_at IS NOT NULL)
        OR (status <> 'PUBLISHED' AND result_id IS NULL AND result_version IS NULL AND published_at IS NULL)
    ),
    CONSTRAINT ck_overview_publication_error CHECK (safe_error_code IS NULL OR CHAR_LENGTH(safe_error_code) BETWEEN 1 AND 64)
);

CREATE INDEX ix_overview_publication_pending ON overview_publication_intents (status, retry_at, created_at, id);
CREATE INDEX ix_overview_publication_job ON overview_publication_intents (job_id, created_at, id);
