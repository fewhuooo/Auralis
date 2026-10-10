ALTER TABLE review_states
    ADD COLUMN needs_learning BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE review_states ADD COLUMN mastered BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE review_states ADD COLUMN stable_success_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE review_states ADD COLUMN next_review_stage VARCHAR(32);
ALTER TABLE review_states ADD COLUMN last_practice_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE review_states ADD COLUMN last_review_id UUID;
ALTER TABLE review_states ADD COLUMN pending_review_id UUID;
ALTER TABLE review_states ADD COLUMN content_hash VARCHAR(64);

ALTER TABLE review_states ADD CONSTRAINT ck_review_states_stable_success_count
    CHECK (stable_success_count BETWEEN 0 AND 3);
ALTER TABLE review_states ADD CONSTRAINT ck_review_states_next_review_stage CHECK (
    next_review_stage IS NULL OR next_review_stage IN ('EARLY_RECALL', 'CROSS_DAY', 'FINAL_VERIFICATION'));
ALTER TABLE review_states ADD CONSTRAINT ck_review_states_learning_mastery_exclusive
    CHECK (NOT (needs_learning AND mastered));
ALTER TABLE review_states ADD CONSTRAINT ck_review_states_mastered_after_three_successes
    CHECK (NOT mastered OR stable_success_count = 3);

CREATE INDEX ix_review_states_user_learning ON review_states (user_id, needs_learning, mastered, due_at);

-- Keep the lazy first-use path from racing across independent Subject locks.
-- Preserve a parameter set already configured for this scheduler/version.
INSERT INTO review_parameter_sets (id, scheduler, version, parameters)
SELECT CAST('d9926433-88cf-3779-bf8f-f57bf578276c' AS UUID), 'FSRS_LITE', 1,
       '{"againMinutes":10,"hardFactor":1.2,"goodFactor":2.0,"easyFactor":3.0}'
WHERE NOT EXISTS (
    SELECT 1 FROM review_parameter_sets WHERE scheduler = 'FSRS_LITE' AND version = 1
);

CREATE TABLE review_lifecycle_commands (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    knowledge_block_id UUID NOT NULL,
    client_command_id UUID NOT NULL,
    action VARCHAR(32) NOT NULL,
    occurred_at TIMESTAMP WITH TIME ZONE NOT NULL,
    knowledge_block_version BIGINT NOT NULL,
    base_version BIGINT NOT NULL,
    review_id UUID,
    rating VARCHAR(16),
    duration_seconds INTEGER,
    content_hash VARCHAR(64) NOT NULL,
    request_payload TEXT NOT NULL,
    response_payload TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_review_lifecycle_commands_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT fk_review_lifecycle_commands_knowledge_block FOREIGN KEY (knowledge_block_id)
        REFERENCES knowledge_blocks (id) ON DELETE CASCADE,
    CONSTRAINT ux_review_lifecycle_commands_user_client UNIQUE (user_id, client_command_id),
    CONSTRAINT ck_review_lifecycle_commands_action CHECK (
        action IN ('LEARNING_COMPLETED', 'REVIEW_SELECTED', 'REVIEW_CONFIRMED', 'REVIEW_CORRECTED', 'LEARNING_REOPENED')),
    CONSTRAINT ck_review_lifecycle_commands_versions CHECK (knowledge_block_version >= 0 AND base_version >= 0),
    CONSTRAINT ck_review_lifecycle_commands_duration CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
    CONSTRAINT ck_review_lifecycle_commands_rating CHECK (
        rating IS NULL OR rating IN ('AGAIN', 'HARD', 'GOOD'))
);

CREATE INDEX ix_review_lifecycle_commands_block_history
    ON review_lifecycle_commands (user_id, knowledge_block_id, occurred_at, id);

CREATE TABLE review_lifecycle_reviews (
    review_id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    knowledge_block_id UUID NOT NULL,
    selected_rating VARCHAR(16) NOT NULL,
    effective_rating VARCHAR(16),
    selected_at TIMESTAMP WITH TIME ZONE NOT NULL,
    resolved_at TIMESTAMP WITH TIME ZONE,
    resolution VARCHAR(32),
    duration_seconds INTEGER NOT NULL DEFAULT 0,
    knowledge_block_version BIGINT NOT NULL,
    content_hash VARCHAR(64) NOT NULL,
    before_state TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_review_lifecycle_reviews_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT fk_review_lifecycle_reviews_knowledge_block FOREIGN KEY (knowledge_block_id)
        REFERENCES knowledge_blocks (id) ON DELETE CASCADE,
    CONSTRAINT ck_review_lifecycle_reviews_selected_rating CHECK (selected_rating IN ('AGAIN', 'HARD', 'GOOD')),
    CONSTRAINT ck_review_lifecycle_reviews_effective_rating CHECK (
        effective_rating IS NULL OR effective_rating IN ('AGAIN', 'HARD', 'GOOD')),
    CONSTRAINT ck_review_lifecycle_reviews_resolution CHECK (
        resolution IS NULL OR resolution IN ('AGAIN_SELECTED', 'CONFIRMED', 'CORRECTED_AGAIN', 'SUPERSEDED')),
    CONSTRAINT ck_review_lifecycle_reviews_duration CHECK (duration_seconds >= 0),
    CONSTRAINT ck_review_lifecycle_reviews_version CHECK (knowledge_block_version >= 0)
);

CREATE INDEX ix_review_lifecycle_reviews_block_history
    ON review_lifecycle_reviews (user_id, knowledge_block_id, selected_at, review_id);
