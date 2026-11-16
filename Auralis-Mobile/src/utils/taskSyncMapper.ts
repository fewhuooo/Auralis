import { formatLocalTimeHHmm, toLocalDateKey } from './dateKey.ts'

export interface SyncableTask {
  id?: string
  name: string
  subject: string
  desc?: string
  duration: number
  status: 'pending' | 'scheduled' | 'completed'
  startTime?: string
  scheduledAt?: string
  dueAt?: string
  sync_status?: 'synced' | 'pending_create' | 'pending_update' | 'pending_delete'
  position?: string
  sync_version?: number
  is_deleted?: boolean
  subjectId?: string
}

export function toServerTaskCommand(payload: Record<string, any> | undefined, mutationType: string) {
  const scheduledAt = payload?.scheduledAt || undefined
  const dueAt = payload?.dueAt || undefined
  const isUpdate = mutationType === 'UPDATE' || mutationType === 'update'

  return {
    subjectId: payload?.subjectId,
    title: payload?.name,
    description: payload?.desc || '',
    status: payload?.status === 'completed' ? 'DONE' : scheduledAt ? 'IN_PROGRESS' : 'TODO',
    scheduledAt: scheduledAt ?? (isUpdate ? null : undefined),
    dueAt: dueAt ?? (isUpdate ? null : undefined),
    durationMinutes: payload?.duration,
    sortKey: payload?.position,
  }
}

export function fromServerTaskPayload(payload: Record<string, any> | undefined, fallbackVersion = 0): SyncableTask {
  const scheduledAt = typeof payload?.scheduledAt === 'string' && payload.scheduledAt
    ? payload.scheduledAt
    : undefined
  const dueAt = typeof payload?.dueAt === 'string' && payload.dueAt
    ? payload.dueAt
    : undefined
  const status: SyncableTask['status'] = payload?.status === 'DONE'
    ? 'completed'
    : scheduledAt
      ? 'scheduled'
      : 'pending'

  return {
    id: payload?.id,
    subjectId: payload?.subjectId || payload?.subject_id || undefined,
    subject: payload?.subject || '',
    name: payload?.title || payload?.name || '',
    desc: payload?.description ?? payload?.desc ?? '',
    duration: Number(payload?.durationMinutes ?? payload?.duration ?? 0),
    status,
    scheduledAt,
    dueAt,
    startTime: scheduledAt ? formatLocalTimeHHmm(scheduledAt) : undefined,
    position: payload?.sortKey || payload?.position || '0',
    sync_version: Number(payload?.version ?? payload?.sync_version ?? fallbackVersion),
    is_deleted: Boolean(payload?.deletedAt || payload?.is_deleted),
  }
}

export function getScheduledTasksForLocalDate<T extends Pick<SyncableTask, 'scheduledAt' | 'position' | 'is_deleted' | 'name'>>(
  tasks: T[],
  dateKey: string,
): T[] {
  return tasks
    .filter(task => !task.is_deleted && task.scheduledAt && toLocalDateKey(task.scheduledAt) === dateKey)
    .sort((a, b) => {
      const timeDiff = Date.parse(a.scheduledAt || '') - Date.parse(b.scheduledAt || '')
      if (Number.isFinite(timeDiff) && timeDiff !== 0) return timeDiff
      return (a.position || '0').localeCompare(b.position || '0')
    })
}

export function getPendingTodos<T extends Pick<SyncableTask, 'scheduledAt' | 'status' | 'position' | 'is_deleted'>>(
  tasks: T[],
): T[] {
  return tasks
    .filter(task => !task.is_deleted && !task.scheduledAt && task.status !== 'completed')
    .sort((a, b) => (a.position || '0').localeCompare(b.position || '0'))
}
