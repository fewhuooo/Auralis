-- E2EE Migration: Add encrypted_payload column to support end-to-end encryption
-- Run this migration on your PostgreSQL database before deploying the E2EE-enabled application.

ALTER TABLE knowledge_block ADD COLUMN IF NOT EXISTS encrypted_payload TEXT;
ALTER TABLE task_block ADD COLUMN IF NOT EXISTS encrypted_payload TEXT;

COMMENT ON COLUMN knowledge_block.encrypted_payload IS 'AES-256-GCM encrypted JSON payload containing business fields (subject, title, preview, time, source, color). Null when E2EE is disabled.';
COMMENT ON COLUMN task_block.encrypted_payload IS 'AES-256-GCM encrypted JSON payload containing business fields (name, subject, desc, color, duration, load, loadText, status, startTime). Null when E2EE is disabled.';
