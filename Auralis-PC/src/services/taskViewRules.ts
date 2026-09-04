import type { Task } from '@/store/useTaskStore'

export type AssetTaskGroup = 'unassigned' | 'pending' | 'completed'

export interface AssetTaskGroups {
  unassigned: Task[]
  pending: Task[]
  completed: Task[]
}

type TaskStatusFields = Pick<Task, 'status' | 'dueAt' | 'scheduledAt'>

export function isCompletedTask(task: Pick<Task, 'status'>): boolean {
  return task.status === 'completed'
}

export function isCompletedScheduledTask(task: TaskStatusFields): boolean {
  return task.status === 'completed' && Boolean(task.scheduledAt)
}

function isActionableTask(task: TaskStatusFields): boolean {
  return task.status !== 'completed' && task.status !== 'cancelled'
}

export function isScheduledTaskPast(task: TaskStatusFields, now = new Date()): boolean {
  const scheduledTimestamp = task.scheduledAt ? Date.parse(task.scheduledAt) : Number.NaN
  return isActionableTask(task)
    && Boolean(task.scheduledAt)
    && Number.isFinite(scheduledTimestamp)
    && scheduledTimestamp < now.getTime()
}

export function isUnscheduledTaskPastDue(task: TaskStatusFields, now = new Date()): boolean {
  const dueTimestamp = task.dueAt ? Date.parse(task.dueAt) : Number.NaN
  return isActionableTask(task)
    && !task.scheduledAt
    && Number.isFinite(dueTimestamp)
    && dueTimestamp < now.getTime()
}

export function isScheduledAtInPast(value: string | undefined, now = new Date()): boolean {
  const scheduledTimestamp = value ? Date.parse(value) : Number.NaN
  return Number.isFinite(scheduledTimestamp) && scheduledTimestamp < now.getTime()
}

export function isOverdueTask(task: TaskStatusFields, now = new Date()): boolean {
  return isScheduledTaskPast(task, now) || isUnscheduledTaskPastDue(task, now)
}

export function isSchedulableTask(task: TaskStatusFields): boolean {
  const dueTimestamp = task.dueAt ? Date.parse(task.dueAt) : Number.NaN
  return task.status !== 'completed'
    && task.status !== 'cancelled'
    && Number.isFinite(dueTimestamp)
    && !task.scheduledAt
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

    // Unassigned takes precedence over completion/status: no deadline and no
    // schedule means the task has not entered either working bucket yet.
    if (!task.dueAt && !task.scheduledAt) {
      groups.unassigned.push(task)
    } else if (isCompletedTask(task)) {
      groups.completed.push(task)
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
