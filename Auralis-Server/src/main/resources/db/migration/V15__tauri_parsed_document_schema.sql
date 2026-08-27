ALTER TABLE sources
    ADD COLUMN ingestion_revision UUID NOT NULL
        DEFAULT '00000000-0000-0000-0000-000000000000';

-- Existing rows need a stable, non-null revision before the application starts
-- issuing new server-generated revisions.  The source id is deterministic and
-- keeps legacy READY data addressable without inventing a database-specific
-- UUID function.
UPDATE sources
SET ingestion_revision = id;

ALTER TABLE sources
    DROP CONSTRAINT ck_sources_status;

ALTER TABLE sources
    ADD CONSTRAINT ck_sources_status CHECK (
        ingestion_status IN (
            'AWAITING_CLIENT', 'VALIDATING', 'PENDING', 'PARSING', 'INDEXING', 'READY', 'FAILED'
        )
    );

-- A FILE source that was not already READY has no server-side parsed document
-- to reuse after the migration.  Leave READY sources (and their active chunks)
-- untouched; the next client parse will be fenced by a fresh revision.
UPDATE sources
SET ingestion_status = 'AWAITING_CLIENT'
WHERE type = 'FILE'
  AND ingestion_status <> 'READY';

CREATE INDEX ix_sources_user_ingestion_revision
    ON sources (user_id, id, ingestion_revision);

CREATE TABLE parsed_documents (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    source_id UUID NOT NULL,
    ingestion_revision UUID NOT NULL,
    schema_version INTEGER NOT NULL,
    parser_id VARCHAR(128) NOT NULL,
    parser_version VARCHAR(128) NOT NULL,
    normalization_version VARCHAR(128) NOT NULL,
    ocr_model_version VARCHAR(160),
    source_asset_sha256 VARCHAR(64),
    plain_text_sha256 VARCHAR(64),
    payload_sha256 VARCHAR(64) NOT NULL,
    size_bytes BIGINT NOT NULL,
    object_key VARCHAR(1024) NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'UPLOADING',
    generation UUID,
    object_deleted_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    received_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_parsed_documents_user FOREIGN KEY (user_id)
        REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT fk_parsed_documents_source FOREIGN KEY (source_id)
        REFERENCES sources (id) ON DELETE CASCADE,
    CONSTRAINT ck_parsed_documents_schema_version CHECK (schema_version > 0),
    CONSTRAINT ck_parsed_documents_size CHECK (size_bytes > 0),
    CONSTRAINT ck_parsed_documents_status CHECK (
        status IN ('UPLOADING', 'VALIDATING', 'ACCEPTED', 'REJECTED', 'SUPERSEDED', 'FAILED')
    )
);

CREATE INDEX ix_parsed_documents_user_source_revision
    ON parsed_documents (user_id, source_id, ingestion_revision);

CREATE INDEX ix_parsed_documents_status_updated
    ON parsed_documents (status, updated_at, id);

CREATE INDEX ix_parsed_documents_user_source_status
    ON parsed_documents (user_id, source_id, status, updated_at, id);

ALTER TABLE ingestion_jobs
    ADD COLUMN parsed_document_id UUID;

ALTER TABLE ingestion_jobs
    ADD COLUMN ingestion_revision UUID;

ALTER TABLE ingestion_jobs
    ADD CONSTRAINT fk_ingestion_jobs_parsed_document
        FOREIGN KEY (parsed_document_id) REFERENCES parsed_documents (id) ON DELETE SET NULL;

CREATE INDEX ix_ingestion_jobs_parsed_document
    ON ingestion_jobs (user_id, source_id, parsed_document_id, ingestion_revision);
