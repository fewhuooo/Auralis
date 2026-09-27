-- due_at is an informational reminder and must not constrain scheduling.
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS ck_tasks_schedule_order;
