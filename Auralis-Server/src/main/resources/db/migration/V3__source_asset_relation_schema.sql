CREATE TABLE assets (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    object_key VARCHAR(512) NOT NULL,
    original_name VARCHAR(255) NOT NULL,
    size_bytes BIGINT NOT NULL,
    mime_type VARCHAR(128) NOT NULL,
    sha256 VARCHAR(64),
    upload_status VARCHAR(16) NOT NULL DEFAULT 'UPLOADING',
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_assets_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT,
    CONSTRAINT uq_assets_user_object_key UNIQUE (user_id, object_key),
    CONSTRAINT ck_assets_size CHECK (size_bytes > 0),
    CONSTRAINT ck_assets_status CHECK (upload_status IN ('UPLOADING', 'READY', 'FAILED', 'ORPHANED')),
    CONSTRAINT ck_assets_name_not_blank CHECK (TRIM(original_name) <> '')
);

CREATE INDEX ix_assets_user_status ON assets (user_id, upload_status, updated_at, id);

CREATE TABLE sources (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    type VARCHAR(16) NOT NULL,
    subject_id UUID NOT NULL,
    title VARCHAR(240) NOT NULL,
    asset_id UUID,
    origin_url VARCHAR(2048),
    raw_text TEXT,
    outline TEXT,
    ingestion_status VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    safe_error_code VARCHAR(64),
    safe_error_detail VARCHAR(2000),
    version BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE,
    CONSTRAINT fk_sources_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT,
    CONSTRAINT fk_sources_subject FOREIGN KEY (subject_id) REFERENCES subjects (id) ON DELETE RESTRICT,
    CONSTRAINT fk_sources_asset FOREIGN KEY (asset_id) REFERENCES assets (id) ON DELETE RESTRICT,
    CONSTRAINT ck_sources_type CHECK (type IN ('FILE', 'TEXT', 'URL')),
    CONSTRAINT ck_sources_status CHECK (
        ingestion_status IN ('PENDING', 'PARSING', 'INDEXING', 'READY', 'FAILED')
    ),
    CONSTRAINT ck_sources_version CHECK (version >= 0),
    CONSTRAINT ck_sources_title_not_blank CHECK (TRIM(title) <> '')
);

CREATE INDEX ix_sources_user_active ON sources (user_id, deleted_at, updated_at, id);
CREATE INDEX ix_sources_subject_active ON sources (subject_id, deleted_at, updated_at, id);
CREATE INDEX ix_sources_status ON sources (user_id, ingestion_status, updated_at, id);

ALTER TABLE knowledge_blocks
    ADD CONSTRAINT fk_knowledge_blocks_source
        FOREIGN KEY (source_id) REFERENCES sources (id) ON DELETE RESTRICT;

CREATE INDEX ix_knowledge_blocks_source_active
    ON knowledge_blocks (source_id, deleted_at, updated_at, id);

CREATE TABLE relations (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    source_type VARCHAR(32) NOT NULL,
    source_id UUID NOT NULL,
    target_type VARCHAR(32) NOT NULL,
    target_id UUID NOT NULL,
    type VARCHAR(32) NOT NULL,
    label VARCHAR(240),
    version BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE,
    CONSTRAINT fk_relations_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT,
    CONSTRAINT ck_relations_source_type CHECK (
        source_type IN ('SUBJECT', 'SOURCE', 'KNOWLEDGE_BLOCK', 'TASK')
    ),
    CONSTRAINT ck_relations_target_type CHECK (
        target_type IN ('SUBJECT', 'SOURCE', 'KNOWLEDGE_BLOCK', 'TASK')
    ),
    CONSTRAINT ck_relations_type CHECK (
        type IN ('CONTAINS', 'REFERENCES', 'DERIVED_FROM', 'DEPENDS_ON', 'RELATED_TO')
    ),
    CONSTRAINT ck_relations_distinct_endpoints CHECK (
        source_type <> target_type OR source_id <> target_id
    ),
    CONSTRAINT ck_relations_version CHECK (version >= 0)
);

CREATE INDEX ix_relations_user_active
    ON relations (user_id, deleted_at, updated_at, id);
CREATE INDEX ix_relations_source
    ON relations (user_id, source_type, source_id, deleted_at, type);
CREATE INDEX ix_relations_target
    ON relations (user_id, target_type, target_id, deleted_at, type);
