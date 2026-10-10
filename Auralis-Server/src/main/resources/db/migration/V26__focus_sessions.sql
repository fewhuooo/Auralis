CREATE TABLE focus_sessions (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    client_session_id UUID NOT NULL,
    task_id UUID,
    started_at TIMESTAMP WITH TIME ZONE NOT NULL,
    ended_at TIMESTAMP WITH TIME ZONE NOT NULL,
    duration_seconds INTEGER NOT NULL,
    completed BOOLEAN NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_focus_sessions_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT uq_focus_sessions_owner_client_id UNIQUE (user_id, client_session_id),
    CONSTRAINT ck_focus_sessions_time CHECK (ended_at >= started_at),
    CONSTRAINT ck_focus_sessions_duration CHECK (duration_seconds BETWEEN 0 AND 86400)
);

CREATE INDEX ix_focus_sessions_user_ended ON focus_sessions (user_id, ended_at, id);
