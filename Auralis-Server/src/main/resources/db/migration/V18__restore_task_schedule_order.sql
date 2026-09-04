UPDATE tasks
SET scheduled_at = NULL
WHERE scheduled_at IS NOT NULL
  AND due_at IS NOT NULL
  AND due_at < scheduled_at;

ALTER TABLE tasks
    ADD CONSTRAINT ck_tasks_schedule_order
    CHECK (due_at IS NULL OR scheduled_at IS NULL OR due_at >= scheduled_at);
