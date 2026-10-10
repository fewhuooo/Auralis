CREATE TABLE overview_results (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    scope_type VARCHAR(16) NOT NULL,
    scope_id UUID NOT NULL,
    subject_id UUID NOT NULL,
    source_id UUID,
    ingestion_revision UUID,
    version BIGINT NOT NULL DEFAULT 0,
    outline_version BIGINT NOT NULL DEFAULT 0,
    summary_version BIGINT NOT NULL DEFAULT 0,
    title VARCHAR(300) NOT NULL,
    schema_version INTEGER NOT NULL,
    outline TEXT,
    summary TEXT,
    outline_source_manifest TEXT,
    summary_source_manifest TEXT,
    outline_input_fingerprint VARCHAR(64),
    summary_input_fingerprint VARCHAR(64),
    outline_generated_at TIMESTAMP WITH TIME ZONE,
    summary_generated_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_overview_results_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT uq_overview_results_scope UNIQUE (user_id, scope_type, scope_id),
    CONSTRAINT ck_overview_results_scope CHECK (scope_type IN ('SOURCE', 'SUBJECT')),
    CONSTRAINT ck_overview_results_versions CHECK (version >= 0 AND outline_version >= 0 AND summary_version >= 0),
    CONSTRAINT ck_overview_results_schema CHECK (schema_version > 0),
    CONSTRAINT ck_overview_results_full CHECK (outline IS NOT NULL AND summary IS NOT NULL),
    CONSTRAINT ck_overview_results_source_scope CHECK (
        (scope_type = 'SOURCE' AND source_id = scope_id AND ingestion_revision IS NOT NULL)
        OR (scope_type = 'SUBJECT' AND source_id IS NULL AND ingestion_revision IS NULL AND subject_id = scope_id)
    )
);

CREATE INDEX ix_overview_results_owner_subject ON overview_results (user_id, subject_id, scope_type, scope_id);

CREATE TABLE overview_write_receipts (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    client_write_id UUID NOT NULL,
    scope_type VARCHAR(16) NOT NULL,
    scope_id UUID NOT NULL,
    base_version BIGINT NOT NULL,
    payload_hash VARCHAR(64) NOT NULL,
    response_snapshot TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_overview_write_receipts_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT uq_overview_write_receipts_owner_client UNIQUE (user_id, client_write_id),
    CONSTRAINT ck_overview_write_receipts_scope CHECK (scope_type IN ('SOURCE', 'SUBJECT')),
    CONSTRAINT ck_overview_write_receipts_base_version CHECK (base_version >= 0)
);

CREATE INDEX ix_overview_write_receipts_owner_scope ON overview_write_receipts (user_id, scope_type, scope_id);
