ALTER TABLE conversations ADD COLUMN client_request_id VARCHAR(128);

ALTER TABLE conversations
    ADD CONSTRAINT uq_conversations_user_client_request UNIQUE (user_id, client_request_id);

CREATE INDEX ix_conversations_user_client_request ON conversations (user_id, client_request_id);

ALTER TABLE messages ADD COLUMN reply_to_message_id UUID;

ALTER TABLE messages
    ADD CONSTRAINT fk_messages_reply_to_message
    FOREIGN KEY (reply_to_message_id) REFERENCES messages(id);

CREATE INDEX ix_messages_reply_to_message ON messages (reply_to_message_id);
