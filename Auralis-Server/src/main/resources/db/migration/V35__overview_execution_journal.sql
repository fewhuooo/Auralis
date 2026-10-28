CREATE TABLE overview_execution_plans (
    id UUID PRIMARY KEY,
    generation_id UUID NOT NULL REFERENCES overview_generations(id) ON DELETE CASCADE,
    input_fingerprint CHAR(64) NOT NULL,
    profile_fingerprint CHAR(64) NOT NULL,
    algorithm_version VARCHAR(64) NOT NULL,
    plan_fingerprint CHAR(64) NOT NULL,
    mode VARCHAR(16) NOT NULL,
    state VARCHAR(24) NOT NULL,
    payload_json TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_overview_execution_plan UNIQUE (generation_id, plan_fingerprint),
    CONSTRAINT ck_overview_execution_plan_state CHECK (state IN ('READY','WRITING','ASSEMBLED','SUPERSEDED','RECOVERY_REQUIRED')),
    CONSTRAINT ck_overview_execution_plan_mode CHECK (mode IN ('ALL','OUTLINE')),
    CONSTRAINT ck_overview_execution_plan_payload CHECK (CHAR_LENGTH(payload_json) BETWEEN 2 AND 1048576)
);

CREATE INDEX ix_overview_execution_plan_generation ON overview_execution_plans (generation_id, created_at);

CREATE TABLE overview_execution_nodes (
    id UUID PRIMARY KEY,
    plan_id UUID NOT NULL REFERENCES overview_execution_plans(id) ON DELETE CASCADE,
    generation_id UUID NOT NULL REFERENCES overview_generations(id) ON DELETE CASCADE,
    node_ordinal INTEGER NOT NULL,
    descriptor_json TEXT NOT NULL,
    descriptor_sha256 CHAR(64) NOT NULL,
    checkpoint_step VARCHAR(160) NOT NULL,
    state VARCHAR(24) NOT NULL,
    attempt INTEGER NOT NULL DEFAULT 0,
    owner_id UUID,
    fence BIGINT,
    checkpoint_sha256 CHAR(64),
    safe_error_code VARCHAR(64),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    verified_at TIMESTAMP WITH TIME ZONE,
    CONSTRAINT uq_overview_execution_node_ordinal UNIQUE (plan_id, node_ordinal),
    CONSTRAINT ck_overview_execution_node_state CHECK (state IN ('PENDING','RUNNING','VERIFIED','FAILED','RECOVERY_REQUIRED')),
    CONSTRAINT ck_overview_execution_node_ordinal CHECK (node_ordinal >= 0),
    CONSTRAINT ck_overview_execution_node_attempt CHECK (attempt BETWEEN 0 AND 8),
    CONSTRAINT ck_overview_execution_node_descriptor CHECK (CHAR_LENGTH(descriptor_json) BETWEEN 2 AND 65536),
    CONSTRAINT ck_overview_execution_node_error CHECK (safe_error_code IS NULL OR safe_error_code ~ '^[A-Z0-9_]{1,64}$')
);

CREATE INDEX ix_overview_execution_node_generation ON overview_execution_nodes (generation_id, plan_id, node_ordinal);

CREATE TABLE overview_execution_calls (
    id UUID PRIMARY KEY,
    generation_id UUID NOT NULL REFERENCES overview_generations(id) ON DELETE CASCADE,
    plan_id UUID NOT NULL REFERENCES overview_execution_plans(id) ON DELETE CASCADE,
    node_id UUID NOT NULL REFERENCES overview_execution_nodes(id) ON DELETE CASCADE,
    attempt INTEGER NOT NULL,
    reservation_id UUID NOT NULL,
    task_id UUID NOT NULL,
    user_id UUID NOT NULL,
    operation_kind VARCHAR(32) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_overview_execution_call_reservation UNIQUE (reservation_id),
    CONSTRAINT uq_overview_execution_call_attempt UNIQUE (node_id, attempt, reservation_id),
    CONSTRAINT ck_overview_execution_call_attempt CHECK (attempt BETWEEN 1 AND 8),
    CONSTRAINT ck_overview_execution_call_operation CHECK (operation_kind IN ('SOURCE_OVERVIEW','SUBJECT_OVERVIEW'))
);

CREATE INDEX ix_overview_execution_call_node ON overview_execution_calls (node_id, attempt);
CREATE INDEX ix_overview_execution_call_generation ON overview_execution_calls (generation_id);
