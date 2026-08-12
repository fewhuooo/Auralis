CREATE TABLE subjects (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    name VARCHAR(120) NOT NULL,
    description VARCHAR(2000),
    icon_key VARCHAR(64),
    color VARCHAR(32),
    sort_key VARCHAR(128) NOT NULL DEFAULT '',
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    version BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE,
    CONSTRAINT fk_subjects_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT,
    CONSTRAINT ck_subjects_version CHECK (version >= 0),
    CONSTRAINT ck_subjects_name_not_blank CHECK (TRIM(name) <> '')
);

CREATE INDEX ix_subjects_user_active ON subjects (user_id, deleted_at, sort_key, updated_at, id);
CREATE INDEX ix_subjects_user_default ON subjects (user_id, is_default, deleted_at);

CREATE TABLE knowledge_blocks (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    subject_id UUID NOT NULL,
    source_id UUID,
    title VARCHAR(240) NOT NULL,
    summary VARCHAR(4000),
    content TEXT NOT NULL,
    tags TEXT NOT NULL DEFAULT '[]',
    color_override VARCHAR(32),
    version BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE,
    CONSTRAINT fk_knowledge_blocks_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT,
    CONSTRAINT fk_knowledge_blocks_subject FOREIGN KEY (subject_id) REFERENCES subjects (id) ON DELETE RESTRICT,
    CONSTRAINT ck_knowledge_blocks_version CHECK (version >= 0),
    CONSTRAINT ck_knowledge_blocks_title_not_blank CHECK (TRIM(title) <> '')
);

CREATE INDEX ix_knowledge_blocks_user_active
    ON knowledge_blocks (user_id, deleted_at, updated_at, id);
CREATE INDEX ix_knowledge_blocks_subject_active
    ON knowledge_blocks (subject_id, deleted_at, updated_at, id);

CREATE TABLE tasks (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    subject_id UUID NOT NULL,
    title VARCHAR(240) NOT NULL,
    description VARCHAR(4000),
    status VARCHAR(32) NOT NULL DEFAULT 'TODO',
    scheduled_at TIMESTAMP WITH TIME ZONE,
    due_at TIMESTAMP WITH TIME ZONE,
    duration_minutes INTEGER,
    cognitive_load VARCHAR(16),
    sort_key VARCHAR(128) NOT NULL DEFAULT '',
    color_override VARCHAR(32),
    version BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE,
    CONSTRAINT fk_tasks_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT,
    CONSTRAINT fk_tasks_subject FOREIGN KEY (subject_id) REFERENCES subjects (id) ON DELETE RESTRICT,
    CONSTRAINT ck_tasks_version CHECK (version >= 0),
    CONSTRAINT ck_tasks_title_not_blank CHECK (TRIM(title) <> ''),
    CONSTRAINT ck_tasks_status CHECK (status IN ('TODO', 'IN_PROGRESS', 'DONE', 'CANCELLED')),
    CONSTRAINT ck_tasks_duration CHECK (duration_minutes IS NULL OR duration_minutes >= 0),
    CONSTRAINT ck_tasks_cognitive_load CHECK (
        cognitive_load IS NULL OR cognitive_load IN ('LOW', 'MEDIUM', 'HIGH')
    ),
    CONSTRAINT ck_tasks_schedule_order CHECK (
        due_at IS NULL OR scheduled_at IS NULL OR due_at >= scheduled_at
    )
);

CREATE INDEX ix_tasks_user_active ON tasks (user_id, deleted_at, updated_at, id);
CREATE INDEX ix_tasks_subject_active ON tasks (subject_id, deleted_at, sort_key);
