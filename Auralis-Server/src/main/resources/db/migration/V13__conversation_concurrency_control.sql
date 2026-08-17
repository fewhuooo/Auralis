ALTER TABLE conversations ADD COLUMN version BIGINT NOT NULL DEFAULT 0;
ALTER TABLE conversations ADD COLUMN next_message_sequence BIGINT NOT NULL DEFAULT 0;

UPDATE conversations c
SET next_message_sequence = COALESCE(
    (SELECT MAX(m.message_sequence) FROM messages m WHERE m.conversation_id = c.id), 0);

ALTER TABLE conversations
    ADD CONSTRAINT ck_conversations_version CHECK (version >= 0);
ALTER TABLE conversations
    ADD CONSTRAINT ck_conversations_next_message_sequence CHECK (next_message_sequence >= 0);
