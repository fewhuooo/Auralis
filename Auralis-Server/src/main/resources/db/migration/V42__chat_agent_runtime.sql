ALTER TABLE conversations ADD COLUMN chat_protocol_version SMALLINT;
ALTER TABLE conversations ADD COLUMN active_chat_run_id UUID;
ALTER TABLE conversations ADD COLUMN chat_fence BIGINT NOT NULL DEFAULT 0;
ALTER TABLE conversations ADD CONSTRAINT ck_conversations_chat_fence CHECK (chat_fence >= 0);
ALTER TABLE conversations ADD CONSTRAINT ck_conversations_chat_protocol CHECK (
    chat_protocol_version IS NULL OR chat_protocol_version = 1);

ALTER TABLE messages ADD COLUMN chat_protocol_version SMALLINT;
ALTER TABLE messages ADD CONSTRAINT ck_messages_chat_protocol CHECK (
    chat_protocol_version IS NULL OR chat_protocol_version = 1);

CREATE TABLE chat_runs (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    conversation_id UUID NOT NULL,
    request_id VARCHAR(128) NOT NULL,
    request_hash VARCHAR(64) NOT NULL,
    request_context_json TEXT NOT NULL,
    action VARCHAR(24) NOT NULL,
    user_message_id UUID NOT NULL,
    current_attempt_id UUID,
    current_reply_message_id UUID,
    budget_task_id UUID NOT NULL,
    status VARCHAR(16) NOT NULL,
    fence_version BIGINT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE,
    CONSTRAINT fk_chat_runs_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT fk_chat_runs_conversation FOREIGN KEY (conversation_id) REFERENCES conversations (id) ON DELETE CASCADE,
    CONSTRAINT fk_chat_runs_user_message FOREIGN KEY (user_message_id) REFERENCES messages (id) ON DELETE CASCADE,
    CONSTRAINT uq_chat_runs_user_request UNIQUE (user_id, request_id),
    CONSTRAINT uq_chat_runs_user_message UNIQUE (user_message_id),
    CONSTRAINT uq_chat_runs_id_user UNIQUE (id, user_id),
    CONSTRAINT ck_chat_runs_action CHECK (action IN ('turn', 'activity_submission')),
    CONSTRAINT ck_chat_runs_status CHECK (status IN ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED', 'UNKNOWN')),
    CONSTRAINT ck_chat_runs_fence CHECK (fence_version >= 0)
);
CREATE INDEX ix_chat_runs_conversation_status_updated ON chat_runs (conversation_id, status, updated_at);

CREATE TABLE chat_attempts (
    id UUID PRIMARY KEY,
    run_id UUID NOT NULL,
    user_id UUID NOT NULL,
    request_id VARCHAR(128) NOT NULL,
    request_hash VARCHAR(64) NOT NULL,
    attempt_no INTEGER NOT NULL,
    status VARCHAR(24) NOT NULL,
    worker_instance_id VARCHAR(128) NOT NULL,
    fence_version BIGINT NOT NULL,
    allocated_reply_message_id UUID NOT NULL,
    reply_message_id UUID,
    public_parts_json TEXT NOT NULL,
    tool_trace_json TEXT NOT NULL,
    last_sequence BIGINT NOT NULL DEFAULT 0,
    cancel_requested_at TIMESTAMP WITH TIME ZONE,
    safe_error_code VARCHAR(64),
    started_at TIMESTAMP WITH TIME ZONE,
    heartbeat_at TIMESTAMP WITH TIME ZONE,
    deadline_at TIMESTAMP WITH TIME ZONE NOT NULL,
    ended_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_chat_attempts_run_user FOREIGN KEY (run_id, user_id) REFERENCES chat_runs (id, user_id) ON DELETE CASCADE,
    CONSTRAINT fk_chat_attempts_reply_message FOREIGN KEY (reply_message_id) REFERENCES messages (id) ON DELETE CASCADE,
    CONSTRAINT uq_chat_attempts_user_request UNIQUE (user_id, request_id),
    CONSTRAINT uq_chat_attempts_run_no UNIQUE (run_id, attempt_no),
    CONSTRAINT uq_chat_attempts_allocated_reply UNIQUE (allocated_reply_message_id),
    CONSTRAINT uq_chat_attempts_reply UNIQUE (reply_message_id),
    CONSTRAINT uq_chat_attempts_id_run_user UNIQUE (id, run_id, user_id),
    CONSTRAINT ck_chat_attempts_reply_id CHECK (reply_message_id IS NULL OR reply_message_id = allocated_reply_message_id),
    CONSTRAINT ck_chat_attempts_status CHECK (status IN ('PENDING', 'RUNNING', 'CANCEL_REQUESTED', 'COMPLETED', 'FAILED', 'CANCELLED', 'UNKNOWN')),
    CONSTRAINT ck_chat_attempts_no CHECK (attempt_no > 0),
    CONSTRAINT ck_chat_attempts_fence CHECK (fence_version >= 0),
    CONSTRAINT ck_chat_attempts_sequence CHECK (last_sequence >= 0)
);
CREATE INDEX ix_chat_attempts_run_no ON chat_attempts (run_id, attempt_no);
CREATE INDEX ix_chat_attempts_status_heartbeat ON chat_attempts (status, heartbeat_at);

CREATE TABLE chat_activities (
    id UUID PRIMARY KEY,
    run_id UUID NOT NULL,
    user_id UUID NOT NULL,
    attempt_id UUID NOT NULL,
    message_id UUID NOT NULL,
    block_id UUID NOT NULL,
    question_version INTEGER NOT NULL,
    question_type VARCHAR(16) NOT NULL,
    state VARCHAR(16) NOT NULL,
    public_payload_json TEXT NOT NULL,
    private_reference_json TEXT,
    submission_id UUID,
    answer_hash VARCHAR(64),
    answer_json TEXT,
    submission_user_message_id UUID,
    reply_run_id UUID,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    submitted_at TIMESTAMP WITH TIME ZONE,
    CONSTRAINT fk_chat_activities_run_user FOREIGN KEY (run_id, user_id) REFERENCES chat_runs (id, user_id) ON DELETE CASCADE,
    CONSTRAINT fk_chat_activities_attempt_run_user FOREIGN KEY (attempt_id, run_id, user_id) REFERENCES chat_attempts (id, run_id, user_id) ON DELETE CASCADE,
    CONSTRAINT fk_chat_activities_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT fk_chat_activities_submission_message FOREIGN KEY (submission_user_message_id) REFERENCES messages (id) ON DELETE CASCADE,
    CONSTRAINT fk_chat_activities_message FOREIGN KEY (message_id) REFERENCES messages (id) ON DELETE CASCADE,
    CONSTRAINT fk_chat_activities_reply_run_user FOREIGN KEY (reply_run_id, user_id) REFERENCES chat_runs (id, user_id) ON DELETE CASCADE,
    CONSTRAINT uq_chat_activities_attempt_block UNIQUE (attempt_id, block_id),
    CONSTRAINT uq_chat_activities_submission UNIQUE (submission_id),
    CONSTRAINT uq_chat_activities_reply_run UNIQUE (reply_run_id),
    CONSTRAINT ck_chat_activities_question_type CHECK (question_type IN ('single', 'multi', 'open')),
    CONSTRAINT ck_chat_activities_state CHECK (state IN ('READY', 'SUBMITTED', 'INVALID')),
    CONSTRAINT ck_chat_activities_question_version CHECK (question_version > 0),
    CONSTRAINT ck_chat_activities_submission_shape CHECK (
        (submission_id IS NULL AND answer_hash IS NULL AND answer_json IS NULL
            AND submission_user_message_id IS NULL AND reply_run_id IS NULL AND submitted_at IS NULL)
        OR (submission_id IS NOT NULL AND answer_hash IS NOT NULL AND answer_json IS NOT NULL
            AND submission_user_message_id IS NOT NULL AND reply_run_id IS NOT NULL AND submitted_at IS NOT NULL
            AND state = 'SUBMITTED'))
);
CREATE INDEX ix_chat_activities_run_created ON chat_activities (run_id, created_at);
