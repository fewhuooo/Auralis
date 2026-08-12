CREATE TABLE users (
    id UUID PRIMARY KEY,
    username VARCHAR(64) NOT NULL,
    normalized_username VARCHAR(64) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    display_name VARCHAR(120),
    avatar_url VARCHAR(2048),
    status VARCHAR(32) NOT NULL,
    version BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ck_users_status CHECK (status IN ('ACTIVE', 'DISABLED')),
    CONSTRAINT uq_users_normalized_username UNIQUE (normalized_username)
);

CREATE INDEX ix_users_status ON users (status);

CREATE TABLE devices (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    device_id VARCHAR(128) NOT NULL,
    name VARCHAR(120),
    platform VARCHAR(32),
    last_active_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_pull_cursor BIGINT NOT NULL DEFAULT 0,
    revoked_at TIMESTAMP WITH TIME ZONE,
    version BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_devices_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT,
    CONSTRAINT uq_devices_user_device UNIQUE (user_id, device_id)
);

CREATE INDEX ix_devices_user_active ON devices (user_id, revoked_at, last_active_at);

CREATE TABLE refresh_sessions (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    device_id UUID NOT NULL,
    rotation_family_id UUID NOT NULL,
    token_hash VARCHAR(128) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    last_used_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    rotated_at TIMESTAMP WITH TIME ZONE,
    revoked_at TIMESTAMP WITH TIME ZONE,
    replaced_by_session_id UUID,
    CONSTRAINT fk_refresh_sessions_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT,
    CONSTRAINT fk_refresh_sessions_device FOREIGN KEY (device_id) REFERENCES devices (id) ON DELETE RESTRICT,
    CONSTRAINT fk_refresh_sessions_replacement FOREIGN KEY (replaced_by_session_id) REFERENCES refresh_sessions (id) ON DELETE RESTRICT,
    CONSTRAINT uq_refresh_sessions_token_hash UNIQUE (token_hash)
);

CREATE INDEX ix_refresh_sessions_user ON refresh_sessions (user_id, last_used_at);
CREATE INDEX ix_refresh_sessions_expiry ON refresh_sessions (expires_at, revoked_at);
CREATE INDEX ix_refresh_sessions_family ON refresh_sessions (rotation_family_id, revoked_at);
