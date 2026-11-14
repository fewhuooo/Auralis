import type { TaskModel } from '@/services/domainMappers'
import { findScheduleConflict, isScheduleWithinDeadline } from '@/services/taskViewRules'

export const TIMELINE_START_MINUTES = 8 * 60
export const TIMELINE_END_MINUTES = 22 * 60 + 30
export const TIMELINE_SLOT_MINUTES = 30
const SLOT_MS = TIMELINE_SLOT_MINUTES * 60_000

type DropSource = {
  taskId: string
  dateKey: string
  sourceScheduledAt?: string | null
}

export type TimelineDropTarget =
  | { type: 'slot'; slotTime: string }
  | { type: 'body'; targetTaskId: string }
  | { type: 'swap'; targetTaskId: string }
  | { type: 'week' }
  | { type: 'unschedule' }

export type TimelineDropIntent = DropSource & TimelineDropTarget

type ScheduleInsertionPayload = {
  taskId: string
  baseVersion: number
  scheduledAt: string
  windowStartAt: string
  windowLastStartAt: string
  targetTaskId?: string
  placementMode?: 'STRICT'
}

type ScheduleSwapPayload = {
  sourceTaskId: string
  sourceBaseVersion: number
  targetTaskId: string
  targetBaseVersion: number
}

export type TimelineDropPlan =
  | { mutationType: 'SCHEDULE_UNSCHEDULE'; models: [TaskModel] }
  | { mutationType: 'SCHEDULE_INSERTION'; models: TaskModel[]; payload: ScheduleInsertionPayload }
  | { mutationType: 'SCHEDULE_SWAP'; models: [TaskModel, TaskModel]; payload: ScheduleSwapPayload }

export function planTimelineDrop(
  tasks: readonly TaskModel[],
  intent: TimelineDropIntent,
  now: Date,
): TimelineDropPlan | undefined {
  const source = tasks.find((task) => task.id === intent.taskId)
  if (!source || source.deletedAt !== null) throw new Error('源任务已变化，请刷新后重试')
  if (intent.sourceScheduledAt !== undefined && !sameScheduleStart(intent.sourceScheduledAt, source.scheduledAt ?? null)) {
    throw new Error('源排期已变化，请刷新时间轴后重试')
  }
  if (source.status === 'DONE') throw new Error('已完成的排期任务已固定')
  if (source.status === 'CANCELLED') throw new Error('源任务已变化，请刷新后重试')
  if (intent.type === 'unschedule') {
    if (source.scheduledAt && timelineDateKey(source.scheduledAt) !== intent.dateKey) {
      throw new Error('源排期已变化，请刷新时间轴后重试')
    }
    return source.scheduledAt
      ? { mutationType: 'SCHEDULE_UNSCHEDULE', models: [{ ...source, scheduledAt: undefined }] }
      : undefined
  }

  const windowStart = timeOnDate(intent.dateKey, TIMELINE_START_MINUTES)
  const windowLastStart = timeOnDate(intent.dateKey, TIMELINE_END_MINUTES)
  if (intent.type === 'week' && timelineDateKey(source.scheduledAt) === intent.dateKey) return
  if (intent.type !== 'week' && source.scheduledAt && timelineDateKey(source.scheduledAt) !== intent.dateKey) {
    throw new Error('源排期已变化，请刷新时间轴后重试')
  }
  if ('targetTaskId' in intent && source.id === intent.targetTaskId) return

  if (intent.type === 'swap') {
    const target = tasks.find((task) => task.id === intent.targetTaskId)
    if (!source.scheduledAt) throw new Error('待排期任务请拖到任务主体或空槽进行插入')
    if (!target?.scheduledAt || target.deletedAt !== null || target.status === 'CANCELLED') {
      throw new Error('交换任务已变化，请刷新后重试')
    }
    if (target.status === 'DONE') throw new Error('已完成的排期任务已固定')
    if (timelineDateKey(target.scheduledAt) !== intent.dateKey) throw new Error('只能交换同一天的任务')

    const sourceStart = Date.parse(source.scheduledAt)
    const targetStart = Date.parse(target.scheduledAt)
    const sourceEnd = sourceStart + source.durationMinutes * 60_000
    const targetEnd = targetStart + target.durationMinutes * 60_000
    const newSourceStart = sourceStart < targetStart && sourceEnd === targetStart
      ? sourceStart + target.durationMinutes * 60_000
      : targetStart
    const newTargetStart = targetStart < sourceStart && targetEnd === sourceStart
      ? targetStart + source.durationMinutes * 60_000
      : sourceStart
    const models: [TaskModel, TaskModel] = [
      placeTask(source, newSourceStart, windowStart, windowLastStart, now),
      placeTask(target, newTargetStart, windowStart, windowLastStart, now),
    ]
    assertNoPlacementConflict(tasks, models)
    return {
      mutationType: 'SCHEDULE_SWAP',
      models,
      payload: {
        sourceTaskId: source.id,
        sourceBaseVersion: source.version,
        targetTaskId: target.id,
        targetBaseVersion: target.version,
      },
    }
  }

  let scheduledAt: number
  let models: TaskModel[]
  if (intent.type === 'week') {
    const placement = Array.from({ length: (TIMELINE_END_MINUTES - TIMELINE_START_MINUTES) / TIMELINE_SLOT_MINUTES + 1 }, (_, index) =>
      windowStart + index * SLOT_MS)
      .filter((start) => start >= now.getTime())
      .map((start) => ({ ...source, scheduledAt: new Date(start).toISOString() }))
      .find((task) => isScheduleWithinDeadline(task.scheduledAt, task.durationMinutes, task.dueAt)
        && !findScheduleConflict(tasks, task))
    if (!placement) throw new Error('当天没有符合任务时长和截止期限的可用排期时段')
    scheduledAt = Date.parse(placement.scheduledAt)
    models = [placement]
  } else if (intent.type === 'body') {
    const target = tasks.find((task) => task.id === intent.targetTaskId)
    if (!target?.scheduledAt || target.deletedAt !== null || target.status === 'CANCELLED') {
      throw new Error('目标排期已变化，请刷新后重试')
    }
    if (target.status === 'DONE') throw new Error('已完成的排期任务已固定')
    if (timelineDateKey(target.scheduledAt) !== intent.dateKey) throw new Error('只能插入到当天的任务后面')
    const targetStart = Date.parse(target.scheduledAt)
    if (targetStart < windowStart || targetStart >= windowLastStart + SLOT_MS) {
      throw new Error('目标时间槽不存在，请拖到可见时段')
    }
    scheduledAt = ceilToSlot(targetStart + target.durationMinutes * 60_000, windowStart)
    if (scheduledAt === Date.parse(source.scheduledAt ?? '')) return
    models = [placeTask(source, scheduledAt, windowStart, windowLastStart, now)]
  } else {
    if (!/^\d{2}:(00|30)$/.test(intent.slotTime)) throw new Error('目标时间槽不存在，请拖到可见时段')
    const [hour, minute] = intent.slotTime.split(':').map(Number)
    const slotMinutes = hour * 60 + minute
    if (slotMinutes < TIMELINE_START_MINUTES || slotMinutes > TIMELINE_END_MINUTES) {
      throw new Error('目标时间槽不存在，请拖到可见时段')
    }
    scheduledAt = timeOnDate(intent.dateKey, slotMinutes)
    if (tasks.some((task) => task.id !== source.id && task.status === 'DONE' && task.deletedAt === null
      && scheduledAt === Date.parse(task.scheduledAt ?? ''))) throw new Error('已完成的排期任务已固定')
    if (scheduledAt === Date.parse(source.scheduledAt ?? '')) return
    placeTask(source, scheduledAt, windowStart, windowLastStart, now)
    models = insertAndShift(tasks, source, scheduledAt, windowStart, windowLastStart)
  }

  assertNoPlacementConflict(tasks, models)
  return {
    mutationType: 'SCHEDULE_INSERTION',
    models,
    payload: {
      taskId: source.id,
      baseVersion: source.version,
      scheduledAt: new Date(scheduledAt).toISOString(),
      windowStartAt: new Date(windowStart).toISOString(),
      windowLastStartAt: new Date(windowLastStart).toISOString(),
      ...(intent.type === 'body' ? { targetTaskId: intent.targetTaskId } : {}),
      ...(intent.type === 'week' ? { placementMode: 'STRICT' } : {}),
    },
  }
}

export function timelineDateKey(value?: string): string | undefined {
  if (!value) return
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return
  return [
    String(date.getFullYear()).padStart(4, '0'),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')
}

function sameScheduleStart(left: string | null, right: string | null): boolean {
  if (left === right) return true
  return left !== null && right !== null && Date.parse(left) === Date.parse(right)
}

function timeOnDate(dateKey: string, minutes: number): number {
  const date = new Date(dateKey + 'T00:00:00')
  if (!Number.isFinite(date.getTime()) || timelineDateKey(date.toISOString()) !== dateKey) throw new Error('目标日期无效')
  date.setHours(Math.floor(minutes / 60), minutes % 60)
  return date.getTime()
}

function ceilToSlot(timestamp: number, windowStart: number): number {
  return windowStart + Math.max(0, Math.ceil((timestamp - windowStart) / SLOT_MS)) * SLOT_MS
}

function placeTask(task: TaskModel, start: number, windowStart: number, windowLastStart: number, now?: Date): TaskModel {
  if (start < windowStart || start > windowLastStart) throw new Error('超出排期窗口')
  if (now && start < now.getTime()) throw new Error('不能排期到过去的时间')
  const scheduledAt = new Date(start).toISOString()
  if (!isScheduleWithinDeadline(scheduledAt, task.durationMinutes, task.dueAt)) {
    throw new Error('任务排期结束时间不能晚于截止期限')
  }
  return { ...task, scheduledAt }
}

function insertAndShift(
  tasks: readonly TaskModel[],
  source: TaskModel,
  requestedStart: number,
  windowStart: number,
  windowLastStart: number,
): TaskModel[] {
  const candidates = tasks.flatMap((task) => {
    if (task.id === source.id || task.status === 'CANCELLED' || task.deletedAt !== null || task.durationMinutes === 0) return []
    const start = Date.parse(task.scheduledAt ?? '')
    if (!(start >= windowStart && start <= windowLastStart)) return []
    const end = start + task.durationMinutes * 60_000
    return [{ task, start, priority: end <= requestedStart ? 0 : 2 }]
  })
  candidates.push({ task: source, start: requestedStart, priority: 1 })
  candidates.sort((left, right) => left.priority - right.priority
    || left.start - right.start || left.task.id.localeCompare(right.task.id))

  const models: TaskModel[] = []
  let previousEnd = windowStart
  for (const { task, start } of candidates) {
    const actualStart = task.durationMinutes > 0 && start < previousEnd ? ceilToSlot(previousEnd, windowStart) : start
    if (actualStart !== Date.parse(task.scheduledAt ?? '')) {
      if (task.status === 'DONE') throw new Error('已完成的排期任务已固定')
      models.push(placeTask(task, actualStart, windowStart, windowLastStart))
    }
    if (task.durationMinutes > 0) previousEnd = actualStart + task.durationMinutes * 60_000
  }
  return models
}

function assertNoPlacementConflict(tasks: readonly TaskModel[], models: TaskModel[]): void {
  const changedIds = new Set(models.map((model) => model.id))
  const fixed = tasks.filter((task) => task.deletedAt === null && !changedIds.has(task.id))
  for (const model of models) {
    if (findScheduleConflict(fixed, model) || findScheduleConflict(models, model)) {
      throw new Error('目标时段与其他任务冲突')
    }
  }
}
