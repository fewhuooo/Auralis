-- Scheduling is planning data, not a second deadline validation boundary.
-- Keep overdue tasks actionable so users can place catch-up work after due_at.
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS ck_tasks_schedule_order;
