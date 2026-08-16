ALTER TABLE inbound_mutations DROP CONSTRAINT ck_inbound_mutations_decision;
ALTER TABLE inbound_mutations
    ADD CONSTRAINT ck_inbound_mutations_decision
        CHECK (decision IN ('PROCESSING', 'APPLIED', 'CONFLICT', 'REJECTED'));

CREATE TABLE sync_cursor_high_water (
    user_id UUID PRIMARY KEY,
    cursor BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT fk_sync_cursor_high_water_user
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT ck_sync_cursor_high_water_cursor CHECK (cursor >= 0)
);
