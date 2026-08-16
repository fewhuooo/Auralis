CREATE TABLE review_parameter_sets (
    id UUID PRIMARY KEY,
    scheduler VARCHAR(32) NOT NULL,
    version INTEGER NOT NULL,
    parameters TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_review_parameter_sets_scheduler_version UNIQUE (scheduler, version),
    CONSTRAINT ck_review_parameter_sets_version CHECK (version > 0)
);

CREATE TABLE review_states (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    knowledge_block_id UUID NOT NULL,
    parameter_set_id UUID NOT NULL,
    difficulty DOUBLE PRECISION NOT NULL DEFAULT 5.0,
    stability DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    due_at TIMESTAMP WITH TIME ZONE NOT NULL,
    last_reviewed_at TIMESTAMP WITH TIME ZONE,
    reps INTEGER NOT NULL DEFAULT 0,
    lapses INTEGER NOT NULL DEFAULT 0,
    version BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_review_states_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT fk_review_states_knowledge_block FOREIGN KEY (knowledge_block_id) REFERENCES knowledge_blocks (id) ON DELETE CASCADE,
    CONSTRAINT fk_review_states_parameter_set FOREIGN KEY (parameter_set_id) REFERENCES review_parameter_sets (id) ON DELETE RESTRICT,
    CONSTRAINT ux_review_states_knowledge_block UNIQUE (user_id, knowledge_block_id),
    CONSTRAINT ck_review_states_counters CHECK (difficulty >= 0 AND stability >= 0 AND reps >= 0 AND lapses >= 0 AND version >= 0)
);

CREATE INDEX ix_review_states_user_due ON review_states (user_id, due_at, knowledge_block_id);

CREATE TABLE review_events (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    knowledge_block_id UUID NOT NULL,
    client_event_id UUID NOT NULL,
    rating VARCHAR(16) NOT NULL,
    reviewed_at TIMESTAMP WITH TIME ZONE NOT NULL,
    duration_seconds INTEGER NOT NULL DEFAULT 0,
    base_version BIGINT NOT NULL DEFAULT 0,
    scheduler VARCHAR(32) NOT NULL,
    scheduler_version INTEGER NOT NULL,
    parameter_set_id UUID NOT NULL,
    before_state TEXT,
    after_state TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_review_events_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT fk_review_events_knowledge_block FOREIGN KEY (knowledge_block_id) REFERENCES knowledge_blocks (id) ON DELETE CASCADE,
    CONSTRAINT fk_review_events_parameter_set FOREIGN KEY (parameter_set_id) REFERENCES review_parameter_sets (id) ON DELETE RESTRICT,
    CONSTRAINT ux_review_events_user_client_event UNIQUE (user_id, client_event_id),
    CONSTRAINT ck_review_events_rating CHECK (rating IN ('AGAIN', 'HARD', 'GOOD', 'EASY', 'SKIP')),
    CONSTRAINT ck_review_events_duration CHECK (duration_seconds >= 0),
    CONSTRAINT ck_review_events_base_version CHECK (base_version >= 0)
);

CREATE INDEX ix_review_events_user_reviewed ON review_events (user_id, reviewed_at, id);
CREATE INDEX ix_review_events_block_history ON review_events (user_id, knowledge_block_id, reviewed_at, id);

CREATE TABLE realtime_tickets (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    device_id UUID NOT NULL,
    ticket_hash VARCHAR(128) NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    consumed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_realtime_tickets_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT fk_realtime_tickets_device FOREIGN KEY (device_id) REFERENCES devices (id) ON DELETE CASCADE,
    CONSTRAINT uq_realtime_tickets_hash UNIQUE (ticket_hash)
);

CREATE INDEX ix_realtime_tickets_hash ON realtime_tickets (ticket_hash);
CREATE INDEX ix_realtime_tickets_user_expiry ON realtime_tickets (user_id, expires_at, consumed_at);

-- Existing test and account-deletion flows remove an owner after its audit rows.
-- Keep all owner-bound phase 3/4 rows from blocking that deletion.
ALTER TABLE change_log DROP CONSTRAINT fk_change_log_user;
ALTER TABLE change_log ADD CONSTRAINT fk_change_log_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE;
ALTER TABLE inbound_mutations DROP CONSTRAINT fk_inbound_mutations_user;
ALTER TABLE inbound_mutations ADD CONSTRAINT fk_inbound_mutations_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE;
ALTER TABLE inbound_mutations DROP CONSTRAINT fk_inbound_mutations_device;
ALTER TABLE inbound_mutations ADD CONSTRAINT fk_inbound_mutations_device FOREIGN KEY (device_id) REFERENCES devices (id) ON DELETE CASCADE;
