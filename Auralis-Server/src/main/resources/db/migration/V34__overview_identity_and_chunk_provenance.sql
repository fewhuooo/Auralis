ALTER TABLE overview_results
    ADD COLUMN outline_identity_json TEXT;

ALTER TABLE source_chunks
    ADD COLUMN provenance_json TEXT;
