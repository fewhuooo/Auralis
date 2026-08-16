CREATE TABLE change_log (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    cursor BIGINT NOT NULL,
    resource_type VARCHAR(32) NOT NULL,
    resource_id UUID NOT NULL,
    mutation_type VARCHAR(16) NOT NULL,
    version BIGINT NOT NULL,
    deleted_at TIMESTAMP WITH TIME ZONE,
    payload TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_change_log_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT,
    CONSTRAINT uq_change_log_user_cursor UNIQUE (user_id, cursor),
    CONSTRAINT ck_change_log_cursor CHECK (cursor > 0),
    CONSTRAINT ck_change_log_version CHECK (version >= 0),
    CONSTRAINT ck_change_log_resource_type CHECK (
        resource_type IN ('SUBJECT', 'SOURCE', 'KNOWLEDGE_BLOCK', 'TASK', 'RELATION')
    ),
    CONSTRAINT ck_change_log_mutation_type CHECK (
        mutation_type IN ('CREATE', 'UPDATE', 'DELETE', 'RESTORE')
    )
);

CREATE INDEX ix_change_log_user_cursor ON change_log (user_id, cursor);
CREATE INDEX ix_change_log_retention ON change_log (created_at, user_id);

CREATE TABLE inbound_mutations (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    device_id UUID NOT NULL,
    client_mutation_id VARCHAR(128) NOT NULL,
    request_hash VARCHAR(64) NOT NULL,
    decision VARCHAR(16) NOT NULL,
    resource_type VARCHAR(32) NOT NULL,
    resource_id UUID NOT NULL,
    mutation_type VARCHAR(16) NOT NULL,
    change_cursor BIGINT,
    current_payload TEXT,
    error_code VARCHAR(64),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_inbound_mutations_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT,
    CONSTRAINT fk_inbound_mutations_device FOREIGN KEY (device_id) REFERENCES devices (id) ON DELETE RESTRICT,
    CONSTRAINT uq_inbound_mutations_identity UNIQUE (user_id, device_id, client_mutation_id),
    CONSTRAINT ck_inbound_mutations_decision CHECK (decision IN ('APPLIED', 'CONFLICT', 'REJECTED')),
    CONSTRAINT ck_inbound_mutations_resource_type CHECK (
        resource_type IN ('SUBJECT', 'SOURCE', 'KNOWLEDGE_BLOCK', 'TASK', 'RELATION')
    ),
    CONSTRAINT ck_inbound_mutations_mutation_type CHECK (
        mutation_type IN ('CREATE', 'UPDATE', 'DELETE', 'RESTORE')
    )
);

CREATE INDEX ix_inbound_mutations_retention ON inbound_mutations (created_at, user_id);
CREATE INDEX ix_inbound_mutations_user_updated ON inbound_mutations (user_id, updated_at);
