ALTER TABLE chat_attempts
    ADD COLUMN private_tool_evidence_json TEXT NOT NULL DEFAULT '[]';
