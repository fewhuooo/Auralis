import { formatLocalTimeHHmm, toLocalDateKey } from './dateKey.ts'

export interface SyncableTask {
  id?: string
  name: string
  subject: string
  desc?: string
  duration: number
  status: 'pending' | 'scheduled' | 'completed' | 'cancelled'
  startTime?: string
  scheduledAt?: string
  dueAt?: string
  sync_status?: 'synced' | 'pending_create' | 'pending_update' | 'pending_delete'
  position?: string
  sync_version?: number
  is_deleted?: boolean
  subjectId?: string
}

export function normalizeTaskPosition(value: unknown): string {
  if (value === undefined || value === null) return '0'
  const text = String(value)
  return text.length > 0 ? text : '0'
}

export function compareTaskPosition(left: unknown, right: unknown): number {
  const a = normalizeTaskPosition(left)
  const b = normalizeTaskPosition(right)
  if (a < b) return -1
  if (a > b) return 1
  return 0
}

function isCancelledStatus(status: unknown): boolean {
  return status === 'cancelled' || status === 'CANCELLED'
}

function isCompletedStatus(status: unknown): boolean {
  return status === 'completed' || status === 'DONE'
}

export function parseDueTimestamp(dueAt?: string | null): number {
  if (!dueAt) return Number.NaN
  const trimmed = dueAt.trim()
  if (!trimmed) return Number.NaN
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/i.test(trimmed)) return Number.NaN
  return Date.parse(trimmed)
}

export function isScheduledIntervalEnded(
  task: Pick<SyncableTask, 'scheduledAt' | 'duration'>,
  now = new Date(),
): boolean {
  const scheduledTimestamp = task.scheduledAt ? Date.parse(task.scheduledAt) : Number.NaN
  const durationMinutes = Number(task.duration)
  const duration = Number.isFinite(durationMinutes) ? Math.max(0, durationMinutes) : 0
  return Boolean(task.scheduledAt)
    && Number.isFinite(scheduledTimestamp)
    && scheduledTimestamp + duration * 60_000 <= now.getTime()
}

export function isScheduledCompletionLocked(
  task: (Pick<SyncableTask, 'scheduledAt' | 'duration'> & { status?: string }) | null | undefined,
  now = new Date(),
): boolean {
  if (!task) return false
  return isCompletedStatus(task.status) && isScheduledIntervalEnded(task, now)
}

function isActionableSyncableTask(
  task: Pick<SyncableTask, 'is_deleted'> & { status?: string },
): boolean {
  return !task.is_deleted && !isCompletedStatus(task.status) && !isCancelledStatus(task.status)
}

export function isScheduledTaskPast(
  task: Pick<SyncableTask, 'scheduledAt' | 'duration' | 'is_deleted'> & { status?: string },
  now = new Date(),
): boolean {
  return isActionableSyncableTask(task) && isScheduledIntervalEnded(task, now)
}

export function isUnscheduledTaskPastDue(
  task: Pick<SyncableTask, 'scheduledAt' | 'dueAt' | 'is_deleted'> & { status?: string },
  now = new Date(),
): boolean {
  const dueTimestamp = parseDueTimestamp(task.dueAt)
  return isActionableSyncableTask(task)
    && !task.scheduledAt
    && Number.isFinite(dueTimestamp)
    && dueTimestamp <= now.getTime()
}

export function isOverdueTask(
  task: Pick<SyncableTask, 'scheduledAt' | 'dueAt' | 'duration' | 'is_deleted'> & { status?: string },
  now = new Date(),
): boolean {
  return isScheduledTaskPast(task, now) || isUnscheduledTaskPastDue(task, now)
}

export function toServerTaskCommand(payload: Record<string, any> | undefined, mutationType: string) {
  const scheduledAt = payload?.scheduledAt || undefined
  const dueAt = payload?.dueAt || undefined
  const isUpdate = mutationType === 'UPDATE' || mutationType === 'update'

  const rawDuration = Number(payload?.duration)
  const durationMinutes = Number.isFinite(rawDuration) && rawDuration >= 0 ? rawDuration : undefined

  return {
    subjectId: payload?.subjectId,
    title: payload?.name,
    description: payload?.desc || '',
    status: payload?.status === 'completed'
      ? 'DONE'
      : isCancelledStatus(payload?.status)
        ? 'CANCELLED'
        : scheduledAt
          ? 'IN_PROGRESS'
          : 'TODO',
    scheduledAt: scheduledAt ?? (isUpdate ? null : undefined),
    dueAt: dueAt ?? (isUpdate ? null : undefined),
    durationMinutes,
    sortKey: payload?.position !== undefined && payload?.position !== null ? String(payload.position) : undefined,
  }
}

export function fromServerTaskPayload(payload: Record<string, any> | undefined, fallbackVersion = 0): SyncableTask {
  const scheduledAt = typeof payload?.scheduledAt === 'string' && payload.scheduledAt
    ? payload.scheduledAt
    : undefined
  const dueAt = typeof payload?.dueAt === 'string' && payload.dueAt
    ? payload.dueAt
    : undefined
  const status: SyncableTask['status'] = payload?.status === 'DONE' || payload?.status === 'completed'
    ? 'completed'
    : isCancelledStatus(payload?.status)
      ? 'cancelled'
      : scheduledAt
        ? 'scheduled'
        : 'pending'

  return {
    id: payload?.id,
    subjectId: payload?.subjectId || payload?.subject_id || undefined,
    subject: payload?.subject != null ? String(payload.subject) : '',
    name: payload?.title != null ? String(payload.title) : (payload?.name != null ? String(payload.name) : ''),
    desc: payload?.description != null ? String(payload.description) : (payload?.desc != null ? String(payload.desc) : ''),
    duration: Number(payload?.durationMinutes ?? payload?.duration ?? 0),
    status,
    scheduledAt,
    dueAt,
    startTime: scheduledAt ? formatLocalTimeHHmm(scheduledAt) : undefined,
    position: normalizeTaskPosition(payload?.sortKey ?? payload?.position),
    sync_version: Number(payload?.version ?? payload?.sync_version ?? fallbackVersion),
    is_deleted: Boolean(payload?.deletedAt || payload?.is_deleted),
  }
}

export function getScheduledTasksForLocalDate<
  T extends Pick<SyncableTask, 'scheduledAt' | 'position' | 'is_deleted' | 'name'> & { status?: string },
>(
  tasks: T[],
  dateKey: string,
): T[] {
  return tasks
    .filter(task => (
      !task.is_deleted
      && !isCancelledStatus(task.status)
      && task.scheduledAt
      && toLocalDateKey(task.scheduledAt) === dateKey
    ))
    .sort((a, b) => {
      const timeDiff = Date.parse(a.scheduledAt || '') - Date.parse(b.scheduledAt || '')
      if (Number.isFinite(timeDiff) && timeDiff !== 0) return timeDiff
      return compareTaskPosition(a.position, b.position)
    })
}

export function getVisiblePendingTodos<
  T extends Pick<SyncableTask, 'id' | 'scheduledAt' | 'status' | 'position' | 'is_deleted'>,
>(
  tasks: T[],
  retainedCompletedIds: ReadonlySet<string> = new Set(),
): T[] {
  return tasks
    .filter(task => (
      !task.is_deleted
      && !isCancelledStatus(task.status)
      && !task.scheduledAt
      && (task.status !== 'completed' || (Boolean(task.id) && retainedCompletedIds.has(task.id as string)))
    ))
    .sort((a, b) => compareTaskPosition(a.position, b.position))
}

export function getPendingTodos<T extends Pick<SyncableTask, 'id' | 'scheduledAt' | 'status' | 'position' | 'is_deleted'>>(
  tasks: T[],
): T[] {
  return getVisiblePendingTodos(tasks)
}

function effectiveScheduleDurationMinutes(duration: unknown): number {
  const numeric = Number(duration)
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : 30
}

export function findOverlappingScheduledTask<
  T extends Pick<SyncableTask, 'id' | 'name' | 'scheduledAt' | 'duration' | 'is_deleted'> & { status?: string },
>(
  tasks: readonly T[],
  candidate: { scheduledAtIso: string; durationMinutes?: number; excludeTaskId?: string },
): T | null {
  const leftStart = Date.parse(candidate.scheduledAtIso)
  if (!Number.isFinite(leftStart)) return null
  const leftEnd = leftStart + effectiveScheduleDurationMinutes(candidate.durationMinutes) * 60_000
  if (leftStart >= leftEnd) return null

  for (const task of tasks) {
    if (task.is_deleted || isCancelledStatus(task.status) || !task.scheduledAt) continue
    if (candidate.excludeTaskId && task.id === candidate.excludeTaskId) continue
    const rightStart = Date.parse(task.scheduledAt)
    if (!Number.isFinite(rightStart)) continue
    const rightEnd = rightStart + effectiveScheduleDurationMinutes(task.duration) * 60_000
    if (rightStart < rightEnd && leftStart < rightEnd && rightStart < leftEnd) {
      return task
    }
  }
  return null
}
