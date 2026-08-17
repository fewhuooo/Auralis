ALTER TABLE messages ADD COLUMN client_request_id VARCHAR(128);

ALTER TABLE messages
    ADD CONSTRAINT uq_messages_user_client_request UNIQUE (user_id, client_request_id);

CREATE INDEX ix_messages_user_client_request ON messages (user_id, client_request_id);
