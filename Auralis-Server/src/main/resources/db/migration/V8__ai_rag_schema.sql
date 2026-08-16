CREATE TABLE ai_credentials (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    provider VARCHAR(32) NOT NULL,
    base_url VARCHAR(2048) NOT NULL,
    chat_model VARCHAR(160) NOT NULL,
    embedding_model VARCHAR(160) NOT NULL,
    api_key_ciphertext TEXT NOT NULL,
    key_version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_ai_credentials_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT uq_ai_credentials_user_provider UNIQUE (user_id, provider),
    CONSTRAINT ck_ai_credentials_provider CHECK (provider IN ('DEEPSEEK', 'OPENAI_COMPATIBLE', 'SILICONFLOW')),
    CONSTRAINT ck_ai_credentials_key_version CHECK (key_version > 0)
);

CREATE INDEX ix_ai_credentials_user_updated ON ai_credentials (user_id, updated_at, provider);

CREATE TABLE ingestion_jobs (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    source_id UUID NOT NULL,
    status VARCHAR(16) NOT NULL,
    attempt_count INTEGER NOT NULL DEFAULT 0,
    lease_until TIMESTAMP WITH TIME ZONE,
    error_code VARCHAR(64),
    error_detail VARCHAR(2000),
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_ingestion_jobs_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT fk_ingestion_jobs_source FOREIGN KEY (source_id) REFERENCES sources (id) ON DELETE CASCADE,
    CONSTRAINT ck_ingestion_jobs_status CHECK (status IN ('PENDING', 'PARSING', 'INDEXING', 'READY', 'FAILED')),
    CONSTRAINT ck_ingestion_jobs_attempt CHECK (attempt_count >= 0)
);

CREATE INDEX ix_ingestion_jobs_pending ON ingestion_jobs (status, lease_until, created_at, id);
CREATE INDEX ix_ingestion_jobs_user_source ON ingestion_jobs (user_id, source_id, created_at, id);

CREATE TABLE source_chunks (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    source_id UUID NOT NULL,
    ordinal INTEGER NOT NULL,
    content TEXT NOT NULL,
    content_hash VARCHAR(64) NOT NULL,
    char_start INTEGER NOT NULL,
    char_end INTEGER NOT NULL,
    embedding_json TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_source_chunks_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT fk_source_chunks_source FOREIGN KEY (source_id) REFERENCES sources (id) ON DELETE CASCADE,
    CONSTRAINT uq_source_chunks_user_source_ordinal UNIQUE (user_id, source_id, ordinal),
    CONSTRAINT ck_source_chunks_ordinal CHECK (ordinal >= 0),
    CONSTRAINT ck_source_chunks_range CHECK (char_start >= 0 AND char_end > char_start)
);

CREATE INDEX ix_source_chunks_user_source ON source_chunks (user_id, source_id, ordinal);

CREATE TABLE conversations (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    title VARCHAR(240),
    deleted_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_conversations_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX ix_conversations_user_updated ON conversations (user_id, updated_at, id);

CREATE TABLE messages (
    id UUID PRIMARY KEY,
    conversation_id UUID NOT NULL,
    user_id UUID NOT NULL,
    message_sequence BIGINT NOT NULL,
    role VARCHAR(16) NOT NULL,
    status VARCHAR(16) NOT NULL,
    content TEXT NOT NULL,
    model VARCHAR(160),
    error_code VARCHAR(64),
    usage_json TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_messages_conversation FOREIGN KEY (conversation_id) REFERENCES conversations (id) ON DELETE CASCADE,
    CONSTRAINT fk_messages_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT uq_messages_conversation_sequence UNIQUE (conversation_id, message_sequence),
    CONSTRAINT ck_messages_sequence CHECK (message_sequence > 0),
    CONSTRAINT ck_messages_role CHECK (role IN ('USER', 'ASSISTANT', 'SYSTEM')),
    CONSTRAINT ck_messages_status CHECK (status IN ('COMPLETED', 'INTERRUPTED', 'FAILED'))
);

CREATE INDEX ix_messages_conversation_sequence ON messages (conversation_id, message_sequence, id);
CREATE INDEX ix_messages_user_created ON messages (user_id, created_at, id);
