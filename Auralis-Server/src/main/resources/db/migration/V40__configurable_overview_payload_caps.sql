-- Per-installation Overview limits are enforced by the application. Keep persisted payloads
-- structurally non-empty while removing historical fixed size ceilings.
ALTER TABLE overview_generations
    DROP CONSTRAINT IF EXISTS ck_overview_generations_result_size;
ALTER TABLE overview_generations
    ADD CONSTRAINT ck_overview_generations_result_size
        CHECK (result_json IS NULL OR CHAR_LENGTH(result_json) >= 2);

ALTER TABLE overview_generation_checkpoints
    DROP CONSTRAINT IF EXISTS ck_overview_generation_checkpoints_size;
ALTER TABLE overview_generation_checkpoints
    ADD CONSTRAINT ck_overview_generation_checkpoints_size
        CHECK (CHAR_LENGTH(payload_json) >= 2);

ALTER TABLE overview_execution_plans
    DROP CONSTRAINT IF EXISTS ck_overview_execution_plan_payload;
ALTER TABLE overview_execution_plans
    ADD CONSTRAINT ck_overview_execution_plan_payload
        CHECK (CHAR_LENGTH(payload_json) >= 2);

ALTER TABLE overview_execution_nodes
    DROP CONSTRAINT IF EXISTS ck_overview_execution_node_descriptor;
ALTER TABLE overview_execution_nodes
    ADD CONSTRAINT ck_overview_execution_node_descriptor
        CHECK (CHAR_LENGTH(descriptor_json) >= 2);

ALTER TABLE overview_generation_jobs
    DROP CONSTRAINT IF EXISTS ck_overview_jobs_payload;
ALTER TABLE overview_generation_jobs
    ADD CONSTRAINT ck_overview_jobs_payload CHECK (
        CHAR_LENGTH(request_json) >= 2
        AND CHAR_LENGTH(source_manifest_json) >= 2
        AND (candidate_json IS NULL OR CHAR_LENGTH(candidate_json) >= 2)
    );

ALTER TABLE overview_results
    DROP CONSTRAINT IF EXISTS ck_overview_result_input_snapshot_size;
ALTER TABLE overview_results
    ADD CONSTRAINT ck_overview_result_input_snapshot_size CHECK (
        (outline_input_snapshot_json IS NULL OR CHAR_LENGTH(outline_input_snapshot_json) >= 2)
        AND (summary_input_snapshot_json IS NULL OR CHAR_LENGTH(summary_input_snapshot_json) >= 2)
    );
ALTER TABLE overview_results
    ALTER COLUMN title TYPE TEXT;
