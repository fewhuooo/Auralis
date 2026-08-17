ALTER TABLE ingestion_jobs
    ADD COLUMN generation UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000';

ALTER TABLE source_chunks
    ADD COLUMN generation UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000';

ALTER TABLE source_chunks
    ADD COLUMN active BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE source_chunks
    DROP CONSTRAINT IF EXISTS uq_source_chunks_user_source_ordinal;

ALTER TABLE source_chunks
    ADD CONSTRAINT uq_source_chunks_user_source_generation_ordinal
        UNIQUE (user_id, source_id, generation, ordinal);

CREATE INDEX ix_source_chunks_active_user_source
    ON source_chunks (user_id, source_id, active, ordinal);
