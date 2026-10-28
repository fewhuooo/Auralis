ALTER TABLE overview_generations
    ADD COLUMN retry_of_generation_id UUID;

ALTER TABLE overview_generations
    ADD CONSTRAINT fk_overview_generations_retry_parent
        FOREIGN KEY (retry_of_generation_id) REFERENCES overview_generations(id) ON DELETE SET NULL;

ALTER TABLE overview_generations
    ADD CONSTRAINT ck_overview_generations_retry_not_self
        CHECK (retry_of_generation_id IS NULL OR retry_of_generation_id <> id);

CREATE UNIQUE INDEX uq_overview_generations_retry_successor
    ON overview_generations (retry_of_generation_id);

ALTER TABLE overview_generation_requests
    ADD COLUMN retry_of_request_id UUID;
