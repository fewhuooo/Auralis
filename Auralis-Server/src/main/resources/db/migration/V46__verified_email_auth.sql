ALTER TABLE users ADD COLUMN email VARCHAR(254);
ALTER TABLE users ADD CONSTRAINT uq_users_email UNIQUE (email);
ALTER TABLE users ADD COLUMN credential_generation BIGINT NOT NULL DEFAULT 0;

CREATE TABLE auth_email_codes (
    email_key VARCHAR(64) NOT NULL,
    purpose VARCHAR(20) NOT NULL,
    code_hash VARCHAR(64),
    expires_at TIMESTAMP WITH TIME ZONE,
    last_sent_at TIMESTAMP WITH TIME ZONE,
    send_window_at TIMESTAMP WITH TIME ZONE NOT NULL,
    sends INTEGER NOT NULL DEFAULT 0,
    failed_attempts INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (email_key, purpose)
);

CREATE INDEX ix_auth_email_codes_send_window ON auth_email_codes (send_window_at);
