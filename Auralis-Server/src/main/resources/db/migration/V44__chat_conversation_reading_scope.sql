ALTER TABLE conversations
    ADD COLUMN chat_scope_state VARCHAR(16) NOT NULL DEFAULT 'LEGACY';

ALTER TABLE conversations
    ADD COLUMN chat_scope_json TEXT;

ALTER TABLE conversations
    ADD CONSTRAINT ck_conversations_chat_scope_state
        CHECK (chat_scope_state IN ('LEGACY', 'UNBOUND', 'BOUND'));
