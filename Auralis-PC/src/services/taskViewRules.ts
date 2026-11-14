import type { Task } from '@/store/useTaskStore'
import type { TaskStatus } from '@/services/domainMappers'

export type AssetTaskGroup = 'unassigned' | 'pending' | 'completed'

export interface AssetTaskGroups {
  unassigned: Task[]
  pending: Task[]
  completed: Task[]
}

type TaskStatusFields = Pick<Task, 'status' | 'dueAt' | 'scheduledAt' | 'durationMinutes'>

export function isCompletedTask(task: Pick<Task, 'status'>): boolean {
  if ((task.status as any) === 'DONE') return true
  return task.status === 'completed'
}

export function taskStatusToPresentation(status: 'TODO' | 'IN_PROGRESS' | 'DONE' | 'CANCELLED', scheduledAt?: string): Task['status'] {
  if (status === 'DONE') return 'completed'
  if (status === 'IN_PROGRESS') return 'learning'
  if (status === 'CANCELLED') return 'cancelled'
  return scheduledAt ? 'scheduled' : 'pending'
}

export function isCompletedScheduledTask(task: TaskStatusFields): boolean {
  if ((task.status as any) === 'DONE') return Boolean(task.scheduledAt)
  return task.status === 'completed' && Boolean(task.scheduledAt)
}

export function isScheduledIntervalEnded(
  task: Pick<Task, 'scheduledAt' | 'durationMinutes'>,
  now = new Date(),
): boolean {
  const scheduledTimestamp = task.scheduledAt ? Date.parse(task.scheduledAt) : Number.NaN
  const durationMinutes = Number(task.durationMinutes)
  const duration = Number.isFinite(durationMinutes) ? Math.max(0, durationMinutes) : 0
  return Boolean(task.scheduledAt)
    && Number.isFinite(scheduledTimestamp)
    && scheduledTimestamp + duration * 60_000 <= now.getTime()
}

export function isScheduledCompletionLocked(task: TaskStatusFields | null | undefined, now = new Date()): boolean {
  if (!task) return false
  return isCompletedTask(task) && isScheduledIntervalEnded(task, now)
}

function isActionableTask(task: TaskStatusFields): boolean {
  return !isCompletedTask(task) && task.status !== 'cancelled'
}

export function isScheduledTaskPast(task: TaskStatusFields, now = new Date()): boolean {
  return isActionableTask(task) && isScheduledIntervalEnded(task, now)
}

export function localDateEndOfDay(value?: string | null): Date | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value?.trim() ?? '')
  if (!match) return undefined

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(0)
  date.setFullYear(year, month - 1, day)
  date.setHours(23, 59, 59, 999)
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return undefined
  return date
}

export function parseDueTimestamp(dueAt?: string | null): number {
  if (!dueAt) return Number.NaN
  const trimmed = dueAt.trim()
  if (!trimmed) return Number.NaN

  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/i.test(trimmed)) return Number.NaN

  return Date.parse(trimmed)
}

export function isUnscheduledTaskPastDue(task: TaskStatusFields, now = new Date()): boolean {
  const dueTimestamp = task.dueAt ? parseDueTimestamp(task.dueAt) : Number.NaN
  return isActionableTask(task)
    && !task.scheduledAt
    && Number.isFinite(dueTimestamp)
    && dueTimestamp <= now.getTime()
}

export function isScheduledAtInPast(value: string | undefined, now = new Date()): boolean {
  const scheduledTimestamp = value ? Date.parse(value) : Number.NaN
  return Number.isFinite(scheduledTimestamp) && scheduledTimestamp < now.getTime()
}

export function isOverdueTask(task: TaskStatusFields, now = new Date()): boolean {
  return isScheduledTaskPast(task, now) || isUnscheduledTaskPastDue(task, now)
}

export function isSchedulableTask(task: TaskStatusFields): boolean {
  return !isCompletedTask(task)
    && task.status !== 'cancelled'
    && !task.scheduledAt
}

type ScheduleIntervalTask = Pick<Task, 'id' | 'scheduledAt' | 'durationMinutes' | 'title'> & {
  status: Task['status'] | TaskStatus
}

export function findScheduleConflict(
  tasks: readonly ScheduleIntervalTask[],
  candidate: ScheduleIntervalTask,
  excludedTaskIds: ReadonlySet<string> = new Set(),
): ScheduleIntervalTask | undefined {
  if (candidate.status === 'cancelled' || candidate.status === 'CANCELLED' || !candidate.scheduledAt) return undefined

  const start = Date.parse(candidate.scheduledAt)
  const duration = Number(candidate.durationMinutes)
  if (!Number.isFinite(start) || !Number.isFinite(duration) || duration <= 0) return undefined
  const end = start + duration * 60_000

  return tasks.find((task) => {
    if (task.id === candidate.id || excludedTaskIds.has(task.id)
      || task.status === 'cancelled' || task.status === 'CANCELLED' || !task.scheduledAt) return false
    const otherStart = Date.parse(task.scheduledAt)
    const otherDuration = Number(task.durationMinutes)
    if (!Number.isFinite(otherStart) || !Number.isFinite(otherDuration) || otherDuration <= 0) return false
    const otherEnd = otherStart + otherDuration * 60_000
    return start < otherEnd && otherStart < end
  })
}

function timestamp(value?: string): number {
  if (!value) return Number.POSITIVE_INFINITY
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY
}

function compareTasks(left: Task, right: Task): number {
  const dueDifference = timestamp(left.dueAt) - timestamp(right.dueAt)
  if (dueDifference !== 0) return dueDifference

  const scheduledDifference = timestamp(left.scheduledAt) - timestamp(right.scheduledAt)
  if (scheduledDifference !== 0) return scheduledDifference

  const updatedDifference = timestamp(right.updatedAt) - timestamp(left.updatedAt)
  if (updatedDifference !== 0) return updatedDifference

  const createdDifference = timestamp(left.createdAt) - timestamp(right.createdAt)
  if (createdDifference !== 0) return createdDifference

  return left.id.localeCompare(right.id)
}

export function getTasksForAssetGroups(tasks: Task[]): AssetTaskGroups {
  const groups: AssetTaskGroups = {
    unassigned: [],
    pending: [],
    completed: [],
  }

  for (const task of tasks) {
    if (task.status === 'cancelled') continue

    if (isCompletedTask(task)) {
      groups.completed.push(task)
    } else if (!task.dueAt && !task.scheduledAt) {
      groups.unassigned.push(task)
    } else {
      groups.pending.push(task)
    }
  }

  groups.unassigned.sort(compareTasks)
  groups.pending.sort(compareTasks)
  groups.completed.sort(compareTasks)
  return groups
}

export function getTimelineRange(now = new Date()): { start: Date; end: Date } {
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  start.setDate(start.getDate() - start.getDay())
  const end = new Date(start)
  end.setDate(end.getDate() + 7)
  return { start, end }
}

export interface VisibleDay {
  dateKey: string
  dayCode: string
  weekdayLabel: string
  weekdayShort: string
  monthDayLabel: string
  monthLabel: string
  dayLabel: string
  isToday: boolean
}

const DAY_NAMES = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
const DAY_CODES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function getTimelineDays(now = new Date()): VisibleDay[] {
  const { start } = getTimelineRange(now)
  const days: VisibleDay[] = []

  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  const todayTime = today.getTime()

  for (let index = 0; index < 7; index += 1) {
    const date = new Date(start)
    date.setDate(date.getDate() + index)

    const monthNum = date.getMonth() + 1
    const month = String(monthNum).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const dayOfWeek = date.getDay()

    days.push({
      dateKey: `${date.getFullYear()}-${month}-${day}`,
      dayCode: DAY_CODES[dayOfWeek],
      weekdayLabel: DAY_NAMES[dayOfWeek],
      weekdayShort: DAY_CODES[dayOfWeek],
      monthDayLabel: `${month}/${day}`,
      monthLabel: `${monthNum}月`,
      dayLabel: String(date.getDate()),
      isToday: date.getTime() === todayTime,
    })
  }

  return days
}

// Kept as a descriptive alias for callers that already use the visible-day name.
export const getVisibleDays = getTimelineDays

export function getTasksForTimeline(tasks: Task[], now = new Date()): Task[] {
  const { start, end } = getTimelineRange(now)
  const startTimestamp = start.getTime()
  const endTimestamp = end.getTime()

  return tasks
    .filter((task) => {
      if (task.status === 'cancelled' || !task.scheduledAt) return false
      const scheduledTimestamp = timestamp(task.scheduledAt)
      return scheduledTimestamp >= startTimestamp && scheduledTimestamp < endTimestamp
    })
    .sort((left, right) => timestamp(left.scheduledAt) - timestamp(right.scheduledAt) || left.id.localeCompare(right.id))
}

export function comparePendingTasks(
  a: Pick<Task, 'dueAt' | 'duration' | 'durationMinutes' | 'name' | 'title'>,
  b: Pick<Task, 'dueAt' | 'duration' | 'durationMinutes' | 'name' | 'title'>
): number {
  // 1. 有 DDL 时间优先
  const hasDueA = Boolean(a.dueAt)
  const hasDueB = Boolean(b.dueAt)
  if (hasDueA !== hasDueB) {
    return hasDueA ? -1 : 1
  }

  // 2. DDL 时间近优先（时间戳升序）
  if (hasDueA && hasDueB && a.dueAt && b.dueAt) {
    const timeA = parseDueTimestamp(a.dueAt)
    const timeB = parseDueTimestamp(b.dueAt)
    if (Number.isFinite(timeA) && Number.isFinite(timeB) && timeA !== timeB) {
      return timeA - timeB
    }
  }

  // 3. 持续时间短优先（时长升序）
  const durA = Number(a.duration ?? a.durationMinutes) || 0
  const durB = Number(b.duration ?? b.durationMinutes) || 0
  if (durA !== durB) {
    return durA - durB
  }

  // 4. 兜底稳定名称比较
  const nameA = a.name ?? a.title ?? ''
  const nameB = b.name ?? b.title ?? ''
  return nameA.localeCompare(nameB)
}

export function isScheduleWithinDeadline(scheduledAt?: string | null, durationMinutes?: number | null, dueAt?: string | null): boolean {
  if (!scheduledAt || !dueAt) return true
  const start = Date.parse(scheduledAt)
  const due = parseDueTimestamp(dueAt)
  if (!Number.isFinite(due)) return false
  if (!Number.isFinite(start)) return true

  const duration = durationMinutes == null ? 30 : Number(durationMinutes)
  const effectiveDuration = Number.isFinite(duration) ? Math.max(0, duration) : 30

  const end = start + effectiveDuration * 60_000
  return end <= due
}
