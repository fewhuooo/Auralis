ALTER TABLE assets
    ADD COLUMN client_import_id UUID;

ALTER TABLE assets
    ADD CONSTRAINT uq_assets_user_client_import_id UNIQUE (user_id, client_import_id);
