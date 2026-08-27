ALTER TABLE conversations
    ADD COLUMN purpose VARCHAR(32) NOT NULL DEFAULT 'GENERAL';

ALTER TABLE conversations
    ADD COLUMN source_id UUID;

ALTER TABLE conversations
    ADD CONSTRAINT ck_conversations_purpose
        CHECK (purpose IN ('GENERAL', 'READING_SESSION'));

ALTER TABLE conversations
    ADD CONSTRAINT ck_reading_conversation_source
        CHECK ((purpose = 'READING_SESSION' AND source_id IS NOT NULL)
            OR (purpose = 'GENERAL' AND source_id IS NULL));

ALTER TABLE conversations
    ADD CONSTRAINT fk_conversations_source
        FOREIGN KEY (source_id) REFERENCES sources (id) ON DELETE CASCADE;

CREATE INDEX ix_conversations_reading_cleanup
    ON conversations (purpose, deleted_at, updated_at);

CREATE INDEX ix_conversations_user_source
    ON conversations (user_id, source_id, updated_at, id);
