import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import {
  type TaskCreateRequest,
  type TaskUpdateRequest,
  type TaskView,
} from '@/api/useTaskApi'
import { useAuthStore } from '@/store/useAuthStore'
import { getLocalRepository } from '@/services/localDb'
import { LocalConflictError, type LocalRepository } from '@/services/localRepository'
import { isCanonicalTaskStatus, mapTaskView, type TaskModel, type TaskStatus } from '@/services/domainMappers'
import { uuidv7 } from '@/utils/uuid'
import { isOnline, useSyncStore } from '@/store/useSyncStore'
import { useSubjectStore } from '@/store/useSubjectStore'
import { createStableMutation, isOfflineTransportFailure } from '@/services/offlineWritePolicy'
import { findScheduleConflict, getTasksForTimeline, isCompletedScheduledTask, isCompletedTask, isSchedulableTask, isScheduledAtInPast, isScheduledCompletionLocked, isOverdueTask, taskStatusToPresentation, isScheduleWithinDeadline, parseDueTimestamp, localDateEndOfDay } from '@/services/taskViewRules'
import { subscribeProjectionChange } from '@/services/localProjectionEvents'

export const DAY_CODES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const
export type DayCode = typeof DAY_CODES[number]

export const getTodayDayCode = (): DayCode => DAY_CODES[new Date().getDay()] || 'Mon'

export type TaskPresentationStatus = 'pending' | 'scheduled' | 'completed' | 'learning' | 'to_review' | 'cancelled'
export type ScheduleInsertionResult = 'saved' | 'queued' | 'rejected'

/**
 * The old-looking fields in this interface are presentation aliases only.
 * Cloud requests are built from TaskModel and never serialize these aliases.
 */
export interface Task {
  id: string
  subjectId: string
  title: string
  description: string
  status: TaskPresentationStatus
  scheduledAt?: string
  dueAt?: string
  durationMinutes: number
  sortKey?: string
  version: number
  createdAt?: string
  updatedAt?: string
  deletedAt: string | null
  name: string
  subject: string
  desc: string
  duration: number
  startTime?: string
  position?: string
  sync_status?: 'synced' | 'pending_create' | 'pending_update' | 'pending_delete' | 'conflict'
  sync_version?: number
  is_deleted?: boolean
}

export interface TaskInput {
  id?: string
  subjectId: string
  title?: string
  description?: string
  status?: TaskPresentationStatus | TaskStatus
  scheduledAt?: string
  dueAt?: string
  durationMinutes?: number
  sortKey?: string
  version?: number
  name?: string
  subject?: string
  desc?: string
  duration?: number
  startTime?: string
  position?: string
}

export interface TimeSlot {
  time: string
  task: Task | null
  isCurrent: boolean
}

function statusFromLegacy(value: TaskInput['status'], hasSchedule: boolean): TaskStatus {
  if (value === 'TODO' || value === 'IN_PROGRESS' || value === 'DONE' || value === 'CANCELLED') return value
  if (value === 'completed') return 'DONE'
  if (value === 'learning') return 'IN_PROGRESS'
  if (value === 'scheduled' || hasSchedule) return 'TODO'
  return 'TODO'
}

function dateForDay(dayOrDateKey: string, time: string): Date {
  const [hours, minutes] = time.split(':').map(Number)
  const h = Number.isFinite(hours) ? hours : 9
  const m = Number.isFinite(minutes) ? minutes : 0

  if (/^\d{4}-\d{2}-\d{2}$/.test(dayOrDateKey.trim())) {
    const [y, mon, d] = dayOrDateKey.trim().split('-').map(Number)
    return new Date(y, mon - 1, d, h, m, 0, 0)
  }

  const day = (DAY_CODES as readonly string[]).includes(dayOrDateKey) ? (dayOrDateKey as DayCode) : getTodayDayCode()
  const now = new Date()
  const currentDay = now.getDay()
  const targetDay = DAY_CODES.indexOf(day)
  const delta = targetDay < 0 ? 0 : targetDay - currentDay
  const date = new Date(now)
  date.setDate(now.getDate() + delta)
  date.setHours(h, m, 0, 0)
  return date
}

function normalizeScheduledAtForApi(value: string | undefined, fallbackDay: DayCode = getTodayDayCode()): string | undefined {
  if (!value?.trim()) return undefined
  const trimmed = value.trim()
  const timestamp = Date.parse(trimmed)
  if (Number.isFinite(timestamp)) return new Date(timestamp).toISOString()
  const parts = trimmed.split(/\s+/)
  const day = (DAY_CODES as readonly string[]).includes(parts[0]) ? parts[0] as DayCode : fallbackDay
  const time = parts.length > 1 ? parts[1] : parts[0]
  return dateForDay(day, time).toISOString()
}

function scheduledAtFromLegacy(value: string | undefined, fallbackDay: DayCode = getTodayDayCode()): string | undefined {
  return normalizeScheduledAtForApi(value, fallbackDay)
}

function dayCodeForScheduledAt(value?: string): DayCode | undefined {
  if (!value) return undefined
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? undefined : DAY_CODES[date.getDay()]
}

function timeForScheduledAt(value?: string): string | undefined {
  if (!value) return undefined
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return undefined
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function timelineSlotTimeForScheduledAt(value?: string): string | undefined {
  const scheduledTime = timeForScheduledAt(value)
  if (!scheduledTime) return undefined
  const [hours, minutes] = scheduledTime.split(':').map(Number)
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return undefined
  const totalMinutes = hours * 60 + minutes
  return timeStringFromMinutes(Math.floor(totalMinutes / TIMELINE_SLOT_MINUTES) * TIMELINE_SLOT_MINUTES)
}



function normalizeDueAtForUserInput(value?: string | null): string | undefined {
  if (value == null) return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const localEndOfDay = localDateEndOfDay(trimmed)
    if (!localEndOfDay) throw new Error('截止日期格式无效')
    return localEndOfDay.toISOString()
  }
  const timestamp = parseDueTimestamp(trimmed)
  if (!Number.isFinite(timestamp)) throw new Error('截止时间格式无效')
  return new Date(timestamp).toISOString()
}

function toTaskModel(input: TaskInput, fallbackDay: DayCode = dayCodeForScheduledAt(input.scheduledAt) ?? getTodayDayCode()): TaskModel {
  const scheduledAt = input.startTime !== undefined
    ? scheduledAtFromLegacy(input.startTime, fallbackDay)
    : input.scheduledAt
  const status = statusFromLegacy(input.status, Boolean(scheduledAt))
  const rawDueAt = input.dueAt ?? (input as any).due
  return {
    id: input.id || uuidv7(),
    subjectId: input.subjectId,
    title: input.title || input.name || '未命名任务',
    description: input.description ?? input.desc ?? '',
    status,
    scheduledAt,
    // Preserve persisted values exactly. Date-only conversion belongs to
    // explicit user-input paths, never to reading or rescheduling old tasks.
    dueAt: rawDueAt || undefined,
    durationMinutes: input.durationMinutes ?? input.duration ?? 30,    sortKey: input.sortKey ?? input.position,
    version: input.version ?? 0,
    deletedAt: null,
  }
}

function toPresentationTask(model: TaskModel, syncStatus: Task['sync_status'] = 'synced', subjectName?: string): Task {
  const task: Partial<Task> = {
    ...model,
    status: taskStatusToPresentation(model.status, model.scheduledAt),
    name: model.title,
    desc: model.description,
    duration: model.durationMinutes,
    startTime: timeForScheduledAt(model.scheduledAt),
    position: model.sortKey,
    sync_status: syncStatus,
    sync_version: model.version,
    is_deleted: Boolean(model.deletedAt),
  }
  Object.defineProperty(task, 'subject', {
    get() {
      if (subjectName) return subjectName
      const subjStore = useSubjectStore()
      const subj = subjStore.subjects.find((s) => s.id === model.subjectId)
      return subj ? subj.name : model.subjectId
    },
    enumerable: true,
  })
  return task as Task
}

function taskDto(model: TaskModel): TaskView {
  return {
    id: model.id,
    subjectId: model.subjectId,
    title: model.title,
    description: model.description,
    status: model.status,
    scheduledAt: model.scheduledAt,
    dueAt: model.dueAt,
    durationMinutes: model.durationMinutes,    sortKey: model.sortKey,
    version: model.version,
    createdAt: model.createdAt,
    updatedAt: model.updatedAt,
    deletedAt: model.deletedAt || undefined,
  }
}

function createPayload(model: TaskModel): TaskCreateRequest {
  return {
    baseVersion: 0,
    subjectId: model.subjectId,
    title: model.title,
    description: model.description || undefined,
    status: model.status,
    scheduledAt: normalizeScheduledAtForApi(model.scheduledAt),
    dueAt: model.dueAt,
    durationMinutes: model.durationMinutes,    sortKey: model.sortKey,
  }
}

function updatePayload(model: TaskModel): TaskUpdateRequest {
  return {
    ...createPayload(model),
    baseVersion: model.version,
    scheduledAt: normalizeScheduledAtForApi(model.scheduledAt) ?? null,
    dueAt: model.dueAt ?? null,
  }
}

function dtoFromLocal(value: unknown): TaskModel | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as TaskView & TaskInput
  if (typeof candidate.id !== 'string') return null
  if (!isCanonicalTaskStatus(candidate.status)) return null
  return mapTaskView(candidate)
}

const TIMELINE_START_MINUTES = 8 * 60
const TIMELINE_END_MINUTES = 22 * 60 + 30
const TIMELINE_SLOT_MINUTES = 30

function timeStringFromMinutes(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

function generateTimeSlots(): TimeSlot[] {
  const slotCount = Math.floor((TIMELINE_END_MINUTES - TIMELINE_START_MINUTES) / TIMELINE_SLOT_MINUTES) + 1
  return Array.from({ length: slotCount }, (_, index) => ({
    time: timeStringFromMinutes(TIMELINE_START_MINUTES + index * TIMELINE_SLOT_MINUTES),
    task: null,
    isCurrent: false,
  }))
}

function clientMutation(resourceId: string, mutationType: 'CREATE' | 'UPDATE' | 'DELETE', baseVersion: number, payload: Record<string, unknown>) {
  return createStableMutation({
    clientMutationId: uuidv7(),
    resourceType: 'TASK' as const,
    resourceId,
    mutationType,
    baseVersion,
    payload,
  })
}

function scheduleSync(): void {
  useSyncStore().requestBackgroundSync('write')
}

export const useTaskStore = defineStore('task', () => {
  const pendingTasks = ref<Task[]>([])
  const allTasks = ref<Task[]>([])
  const isLoading = ref(false)
  const lastError = ref<string | null>(null)
  const selectedDay = ref<string>(getTodayDayCode())
  const timeSlots = ref<TimeSlot[]>(generateTimeSlots())
  const currentNow = ref<Date>(new Date())
  let scheduleMutationQueue: Promise<void> = Promise.resolve()

  function withScheduleMutation<T>(operation: () => Promise<T>): Promise<T> {
    const result = scheduleMutationQueue.then(operation, operation)
    scheduleMutationQueue = result.then(() => undefined, () => undefined)
    return result
  }

  function assertScheduledAtIsNotPast(scheduledAt: string | undefined): void {
    if (isScheduledAtInPast(scheduledAt)) {
      throw new Error('不能排期到过去的时间')
    }
  }

  function assertScheduleDoesNotOverlap(model: TaskModel, excludedTaskIds: ReadonlySet<string> = new Set()): void {
    const candidate = toPresentationTask(model)
    const conflict = findScheduleConflict(allTasks.value, candidate, excludedTaskIds)
    if (conflict) throw new Error(`与任务“${conflict.title}”的排期时间重叠`)
  }

  async function recoverOverdueTasks(): Promise<void> {
    if (!isLoading.value && useAuthStore().isAuthenticated) {
      const endedTaskIds = allTasks.value.filter((task) => isOverdueTask(task)).map((task) => task.id)
      for (const taskId of endedTaskIds) {
        try {
          await withScheduleMutation(async () => {
            const repo = await repository()
            const [localRow, unresolved] = await Promise.all([
              repo.read<TaskView>('TASK', taskId),
              repo.listUnresolved('TASK'),
            ])
            const existingMutation = unresolved.find((mutation) => mutation.resourceId === taskId)
            if (existingMutation && existingMutation.status !== 'pending') return

            const current = findTask(taskId)
            const localModel = localRow ? dtoFromLocal(localRow.value) : null
            if (!current || !localRow || !localModel
              || localRow.deletedAt !== null
              || localRow.version !== current.version
              || localModel.scheduledAt !== current.scheduledAt
              || localModel.dueAt !== current.dueAt) {
              void loadLocalTasks()
              return
            }

            const latestTask = toPresentationTask(localModel)
            if (!isOverdueTask(latestTask)) return
            const model = toTaskModel({ ...latestTask, status: 'completed', scheduledAt: latestTask.scheduledAt })
            model.version = localRow.version
            await updateTaskModel(model, {
              expectedLocalVersion: localRow.version,
              rejectIfNonPendingMutation: true,
              requireActiveResource: true,
            })
          })
        } catch (error) {
          if (error instanceof LocalConflictError) await loadLocalTasks()
          // Keep scanning so one local persistence failure cannot starve later tasks.
        }
      }
    }
  }

  function updateCurrentSlot(): void {
    const now = new Date()
    const currentMinutes = now.getHours() * 60 + now.getMinutes()
    const currentSlotTime = timeStringFromMinutes(
      Math.floor(currentMinutes / TIMELINE_SLOT_MINUTES) * TIMELINE_SLOT_MINUTES,
    )
    timeSlots.value.forEach((slot) => {
      slot.isCurrent = slot.time === currentSlotTime && selectedDay.value === getTodayDayCode()
    })
  }

  let lastDayCode = getTodayDayCode()
  if (typeof window !== 'undefined') {
    window.setInterval(() => {
      const now = new Date()
      currentNow.value = now
      const currentDayCode = getTodayDayCode()

      // Auto-switch timeline to today if the day rolls over and we were looking at yesterday
      if (currentDayCode !== lastDayCode) {
        if (selectedDay.value === lastDayCode) {
          selectedDay.value = currentDayCode
          rebuildSchedule()
        }
        lastDayCode = currentDayCode
      }

      updateCurrentSlot()
      void recoverOverdueTasks()
    }, 60_000)
  }

  async function repository(): Promise<LocalRepository> {
    const authStore = useAuthStore()
    if (!authStore.user?.id || !authStore.serverDeviceId) throw new Error('Tasks require an authenticated user and device')
    return getLocalRepository(authStore.user.id, authStore.serverDeviceId)
  }

  function rebuildSchedule(targetDateKey?: string): void {
    updateCurrentSlot()
    const tasks = allTasks.value
    pendingTasks.value = tasks.filter((task) => isSchedulableTask(task))
    const scheduled = getTasksForTimeline(tasks)

    const activeKey = targetDateKey || (
      /^\d{4}-\d{2}-\d{2}$/.test(selectedDay.value) ? selectedDay.value : undefined
    )
    const candidateTasks = activeKey ? tasks : scheduled

    timeSlots.value = timeSlots.value.map((slot) => {
      const matchedTask = candidateTasks.find((task) => {
        if (!task.scheduledAt || task.status === 'cancelled') return false
        const d = new Date(task.scheduledAt)
        if (Number.isNaN(d.getTime())) return false

        const slotTime = timelineSlotTimeForScheduledAt(task.scheduledAt)
        if (slotTime !== slot.time) return false

        if (activeKey) {
          const month = String(d.getMonth() + 1).padStart(2, '0')
          const dayNum = String(d.getDate()).padStart(2, '0')
          const key = `${d.getFullYear()}-${month}-${dayNum}`
          return key === activeKey
        } else {
          return dayCodeForScheduledAt(task.scheduledAt) === selectedDay.value
        }
      })
      return {
        ...slot,
        task: matchedTask || null,
      }
    })
  }

  function setSelectedDay(day: string, dateKey?: string): void {
    selectedDay.value = dateKey || day
    rebuildSchedule(dateKey || day)
  }

  async function loadLocalTasks(): Promise<Task[]> {
    try {
      const repo = await repository()
      const rows = await repo.list<TaskView>('TASK', { includeDeleted: false })
      const local = rows.flatMap((row) => {
        const model = dtoFromLocal(row.value)
        if (!model) return []
        const status = row.syncStatus === 'conflict' ? 'conflict'
          : row.syncStatus === 'pending' || row.syncStatus === 'error' ? 'pending_update'
          : 'synced'
        return [toPresentationTask(model, status)]
      })
      allTasks.value = local
      rebuildSchedule()
      return local
    } catch (error) {
      lastError.value = error instanceof Error ? error.message : '任务本地缓存加载失败'
      rebuildSchedule()
      return allTasks.value
    }
  }

  async function fetchTasks(): Promise<Task[]> {
    isLoading.value = true
    lastError.value = null
    try {
      await loadLocalTasks()
      isLoading.value = false
      await recoverOverdueTasks()
      useSyncStore().requestBackgroundSync('read')
      return allTasks.value
    } finally {
      isLoading.value = false
    }
  }

  subscribeProjectionChange((change) => {
    if (change.resourceTypes.has('TASK')) {
      void loadLocalTasks().then(() => recoverOverdueTasks())
    }
  })

  function replaceInMemory(task: Task): void {
    const index = allTasks.value.findIndex((item) => item.id === task.id)
    if (index >= 0) allTasks.value[index] = task
    else allTasks.value.push(task)
    rebuildSchedule()
  }

  async function persistOffline(
    model: TaskModel,
    mutationType: 'CREATE' | 'UPDATE' | 'DELETE',
    payload: Record<string, unknown>,
    options: { expectedLocalVersion?: number; rejectIfNonPendingMutation?: boolean; requireActiveResource?: boolean } = {},
  ): Promise<Task> {
    const assertScheduleMutationAllowed = () => {
      if (mutationType === 'DELETE') return
      const current = findTask(model.id)

      const getEffectiveTime = (t?: string | null) => t ? (Number.isFinite(parseDueTimestamp(t)) ? parseDueTimestamp(t) : null) : null
      const getDur = (d?: number | null) => { const v = d == null ? 30 : Number(d); return Number.isFinite(v) ? Math.max(0, v) : 30 }

      const isIntervalUnchanged = current && getEffectiveTime(current.scheduledAt) === getEffectiveTime(model.scheduledAt)
        && getEffectiveTime(current.dueAt) === getEffectiveTime(model.dueAt)
        && getDur(current.durationMinutes) === getDur(model.durationMinutes)

      const scheduleChanged = !current || !isIntervalUnchanged || (current.status === 'cancelled' && model.status !== 'CANCELLED')
      if (scheduleChanged && model.scheduledAt) {
        if (!isScheduleWithinDeadline(model.scheduledAt, model.durationMinutes, model.dueAt)) {
          throw new Error('任务排期结束时间不能晚于截止期限')
        }
        if (model.status !== 'CANCELLED' && model.status !== 'DONE') {
          if (!current || getEffectiveTime(current.scheduledAt) !== getEffectiveTime(model.scheduledAt)) assertScheduledAtIsNotPast(model.scheduledAt)
          assertScheduleDoesNotOverlap(model)
        }
      }
    }
    assertScheduleMutationAllowed()
    const task = toPresentationTask(model, mutationType === 'CREATE' ? 'pending_create' : mutationType === 'UPDATE' ? 'pending_update' : 'pending_delete')
    const repo = await repository()
    // Revalidate after repository initialization: another projection refresh may
    // have arrived while the local database was opening.
    assertScheduleMutationAllowed()
    await repo.commitMutation({
      resourceType: 'TASK',
      resourceId: model.id,
      value: taskDto(model),
      version: model.version,
      deletedAt: model.deletedAt,
      expectedLocalVersion: options.expectedLocalVersion,
      rejectIfNonPendingMutation: options.rejectIfNonPendingMutation,
      requireActiveResource: options.requireActiveResource,
      mutation: clientMutation(model.id, mutationType, model.version, payload),
    })
    replaceInMemory(task)
    scheduleSync()
    return task
  }

  async function addTask(input: TaskInput): Promise<string> {
    return withScheduleMutation(async () => {
      const rawDueAt = input.dueAt ?? (input as any).due
      const model = toTaskModel({
        ...input,
        dueAt: normalizeDueAtForUserInput(rawDueAt),
      }, (selectedDay.value as DayCode) || getTodayDayCode())
      if (!model.subjectId) throw new Error('Task requires a subjectId')
      const payload = createPayload(model)
      await persistOffline(model, 'CREATE', payload as unknown as Record<string, unknown>)
      return model.id
    })
  }

  async function updateTaskModel(
    model: TaskModel,
    options: { expectedLocalVersion?: number; rejectIfNonPendingMutation?: boolean; requireActiveResource?: boolean } = {},
  ): Promise<void> {
    const payload = updatePayload(model)
    try {
      await persistOffline(model, 'UPDATE', payload as unknown as Record<string, unknown>, options)
    } catch (error) {
      lastError.value = error instanceof Error ? error.message : '任务本地保存失败'
      throw error
    }
  }

  function findTask(id: string): Task | undefined {
    return allTasks.value.find((task) => task.id === id)
  }

  function localDateKey(value: string | undefined): string | undefined {
    if (!value) return undefined
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return undefined
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  }

  async function assertScheduleDaySynced(scheduledAt: string, sourceTaskId: string): Promise<void> {
    const repo = await repository()
    const [rows, pendingMutations] = await Promise.all([
      repo.list<TaskView>('TASK'),
      repo.listUnresolved(),
    ])
    const targetDate = localDateKey(scheduledAt)
    const pendingIds = new Set(pendingMutations.map((mutation) => mutation.resourceId))
    const sourceRow = rows.find((row) => row.id === sourceTaskId)
    const affected = rows.flatMap((row) => {
      const model = dtoFromLocal(row.value)
      if (!model?.scheduledAt || localDateKey(model.scheduledAt) !== targetDate) return []
      return [{ row, model }]
    })
    if (pendingIds.has(sourceTaskId)
      || (sourceRow && sourceRow.syncStatus !== 'synced')
      || affected.some(({ row, model }) => row.syncStatus !== 'synced' || pendingIds.has(model.id))) {
      throw new Error('当天排期包含尚未同步的任务，请同步后再调整')
    }
  }

  function scheduleModelAt(task: Task, scheduledAt: string): TaskModel {
    const model = toTaskModel({ ...task, status: task.status, scheduledAt, startTime: undefined })
    model.version = task.version
    return model
  }

  async function commitOfflineSchedule(
    models: TaskModel[],
    mutationType: 'SCHEDULE_INSERTION' | 'SCHEDULE_SWAP',
    sourceTaskId: string,
    payload: Record<string, unknown>,
  ): Promise<ScheduleInsertionResult> {
    if (models.length === 0) return 'saved'
    const source = models.find((model) => model.id === sourceTaskId)
    if (!source) throw new Error('排期事务缺少源任务')
    const clientMutationId = uuidv7()
    const affectedTaskIds = models.map((model) => model.id)
    const repo = await repository()
    await repo.commitScheduleMutation({
      items: models.map((model) => ({
        resourceType: 'TASK',
        resourceId: model.id,
        value: taskDto(model),
        version: model.version,
        deletedAt: model.deletedAt,
        expectedLocalVersion: model.version,
      })),
      mutation: createStableMutation({
        clientMutationId,
        resourceType: 'TASK',
        resourceId: sourceTaskId,
        mutationType,
        baseVersion: source.version,
        payload: { ...payload, _localAffectedTaskIds: affectedTaskIds },
      }),
    })
    await loadLocalTasks()
    const syncStore = useSyncStore()
    syncStore.requestBackgroundSync('write')
    try {
      await syncStore.flushNow()
    } catch (error) {
      if (!isOfflineTransportFailure(error)) throw error
      return 'queued'
    }
    const scheduleError = syncStore.scheduleSyncErrors.find(error => error.clientMutationId === clientMutationId)
    if (scheduleError) return 'rejected'
    return isOnline() ? 'saved' : 'queued'
  }

  async function insertTaskAtSlot(taskId: string, slotTime: string, day: string, targetTaskId?: string): Promise<ScheduleInsertionResult | void> {
    const task = findTask(taskId)
    if (!task) throw new Error('源任务已变化，请刷新后重试')
    if (!timeSlots.value.some((slot) => slot.time === slotTime)) {
      throw new Error('目标时间槽不存在，请拖到可见时段')
    }
    if (isCompletedScheduledTask(task)) throw new Error('已完成的排期任务已固定')
    if (task.status === 'cancelled') throw new Error('已取消的任务不能排期')
    const selectedDayOrKey = day || selectedDay.value || getTodayDayCode()
    const scheduledAt = dateForDay(selectedDayOrKey, slotTime).toISOString()
    assertScheduledAtIsNotPast(scheduledAt)
    await assertScheduleDaySynced(scheduledAt, taskId)

    const draggedStart = Date.parse(scheduledAt)
    const windowStartAtStr = dateForDay(selectedDayOrKey, timeStringFromMinutes(TIMELINE_START_MINUTES)).toISOString()
    const windowLastStartAtStr = dateForDay(selectedDayOrKey, timeStringFromMinutes(TIMELINE_END_MINUTES)).toISOString()
    const windowStartMs = Date.parse(windowStartAtStr)
    const windowLastStartMs = Date.parse(windowLastStartAtStr)
    const windowEndMs = windowLastStartMs + 30 * 60_000
    const ceilToSlot = (timeMs: number) => {
      if (timeMs <= windowStartMs) return windowStartMs
      const diff = timeMs - windowStartMs
      const remainder = diff % (30 * 60_000)
      return remainder === 0 ? timeMs : timeMs + (30 * 60_000 - remainder)
    }

    const getDur = (d: any) => d == null ? 30 : (Number.isFinite(Number(d)) ? Math.max(0, Number(d)) : 30)

    if (!isScheduleWithinDeadline(scheduledAt, task.durationMinutes, task.dueAt)) {
      throw new Error('任务排期结束时间不能晚于截止期限')
    }

    const changedModels: TaskModel[] = []
    if (!targetTaskId) {
      const candidates = allTasks.value.filter(t => {
        if (t.status === 'cancelled' || !t.scheduledAt) return false
        const tStart = Date.parse(t.scheduledAt)
        return tStart >= windowStartMs && tStart < windowEndMs
      })

      if (!candidates.some(t => t.id === taskId)) candidates.push(task)

      const roundedTarget = ceilToSlot(draggedStart)

      const items = candidates.map(t => {
        const isSource = t.id === taskId
        const oldStart = Date.parse(t.scheduledAt!)
        const dur = getDur(t.durationMinutes)
        const oldEnd = oldStart + dur * 60_000

        let priority = 2
        if (!isSource && oldEnd <= roundedTarget) priority = 0
        else if (isSource) priority = 1

        const proposedStart = isSource ? roundedTarget : oldStart
        return { task: t, isSource, dur, priority, proposedStart, uuid: t.id }
      })

      items.sort((a, b) => {
        if (a.priority !== b.priority) return a.priority - b.priority
        if (a.proposedStart !== b.proposedStart) return a.proposedStart - b.proposedStart
        return a.uuid.localeCompare(b.uuid)
      })

      let previousEnd: number | null = null
      for (const item of items) {
        let actual = item.proposedStart
        if (previousEnd !== null && actual < previousEnd) {
          if (isCompletedScheduledTask(item.task)) throw new Error('已完成的排期任务已固定')
          actual = ceilToSlot(previousEnd)
        }

        if (actual > windowLastStartMs) throw new Error('超出排期窗口')

        const originalStart = Date.parse(item.task.scheduledAt!)
        if (item.isSource || actual !== originalStart) {
          if (!isScheduleWithinDeadline(new Date(actual).toISOString(), item.task.durationMinutes, item.task.dueAt)) {
            throw new Error('任务排期结束时间不能晚于截止期限')
          }
        }
        previousEnd = actual + item.dur * 60_000
        if (actual !== Date.parse(item.task.scheduledAt ?? '') || item.isSource && actual !== draggedStart) {
          changedModels.push(scheduleModelAt(item.task, new Date(actual).toISOString()))
        }
      }
    } else {
      const targetTask = findTask(targetTaskId)
      if (!targetTask?.scheduledAt || targetTask.status === 'cancelled' || isCompletedScheduledTask(targetTask)) {
        throw new Error('目标排期已变化，请刷新后重试')
      }
      if (localDateKey(targetTask.scheduledAt) !== localDateKey(scheduledAt)) {
        throw new Error('只能插入到当天的任务后面')
      }
      const targetStart = Date.parse(targetTask.scheduledAt)
      const targetEnd = targetStart + getDur(targetTask.durationMinutes) * 60_000
      const expectedStart = ceilToSlot(targetEnd)
      if (expectedStart !== draggedStart) throw new Error('目标排期已变化，请刷新后重试')
      changedModels.push(scheduleModelAt(task, scheduledAt))
    }

    const changedIds = new Set(changedModels.map((model) => model.id))
    for (const model of changedModels) {
      if (findScheduleConflict(allTasks.value, toPresentationTask(model), changedIds)) {
        throw new Error('目标时段与其他任务冲突')
      }
    }
    if (changedModels.length === 0) return 'saved'

    return await commitOfflineSchedule(changedModels, 'SCHEDULE_INSERTION', taskId, {
      taskId,
      baseVersion: task.version,
      scheduledAt,
      windowStartAt: windowStartAtStr,
      windowLastStartAt: windowLastStartAtStr,
      ...(targetTaskId ? { targetTaskId } : {}),
    })
  }

  async function updateTaskStatus(taskId: string, newStatus: TaskPresentationStatus): Promise<void> {
    return withScheduleMutation(async () => {
      const current = findTask(taskId)
      if (!current) return
      if (newStatus !== 'completed' && isScheduledCompletionLocked(current)) {
        throw new Error('已结束的排期任务不能取消完成状态')
      }
      const model = toTaskModel({ ...current, status: newStatus, scheduledAt: current.scheduledAt })
      model.version = current.version
      await updateTaskModel(model)
    })
  }

  async function updateTaskDetails(taskId: string, changes: Pick<TaskInput, 'title' | 'description' | 'dueAt' | 'durationMinutes' | 'subjectId'>): Promise<void> {
    return withScheduleMutation(async () => {
      const current = findTask(taskId)
      if (!current) return
      const hasDueAtChange = Object.prototype.hasOwnProperty.call(changes, 'dueAt')
        && !Object.is(changes.dueAt, current.dueAt)
      const model = toTaskModel({
        ...current,
        subjectId: changes.subjectId ?? current.subjectId,
        title: changes.title ?? current.title,
        description: changes.description ?? current.description,
        dueAt: hasDueAtChange ? normalizeDueAtForUserInput(changes.dueAt) : current.dueAt,
        durationMinutes: changes.durationMinutes ?? current.durationMinutes,
        scheduledAt: current.scheduledAt,
        status: current.status,
        startTime: undefined,
      })
      model.version = current.version
      await updateTaskModel(model)
    })
  }

  async function scheduleTask(taskId: string, slotTime: string, targetTaskId?: string): Promise<ScheduleInsertionResult | void> {
    const activeDayKey = selectedDay.value || getTodayDayCode()
    const targetDateKey = localDateKey(dateForDay(activeDayKey, '00:00').toISOString())!
    return withScheduleMutation(async () => {
      const task = findTask(taskId)
      if (!task || !isSchedulableTask(task)) throw new Error('源任务已变化，请刷新后重试')
      const slot = generateTimeSlots().find((item) => item.time === slotTime)
      if (!slot) throw new Error('目标时间槽不存在：系统不可见时间')
      const expectedScheduledAt = dateForDay(targetDateKey, slotTime).toISOString()
      const existingTask = allTasks.value.find(t => t.scheduledAt === expectedScheduledAt && t.status !== 'cancelled')
      if (existingTask && isCompletedScheduledTask(existingTask)) throw new Error('已完成的排期任务已固定')
      return await insertTaskAtSlot(taskId, slotTime, targetDateKey, targetTaskId)
    })
  }

  async function scheduleTaskToDay(taskId: string, day: string): Promise<void> {
    return withScheduleMutation(async () => {
      const task = findTask(taskId)
      if (!task || task.status === 'cancelled') throw new Error('源任务已变化，请刷新后重试')
      if (isCompletedScheduledTask(task)) throw new Error('已完成的排期任务已固定')
      if (isCompletedTask(task)) throw new Error('已完成的排期任务已固定')
      let model: TaskModel | undefined
      for (let minutes = TIMELINE_START_MINUTES; minutes <= TIMELINE_END_MINUTES; minutes += TIMELINE_SLOT_MINUTES) {
        const slotTime = timeStringFromMinutes(minutes)
        const candidate = toTaskModel({ ...task, status: task.status, startTime: `${day} ${slotTime}` })
        if (isScheduledAtInPast(candidate.scheduledAt)) continue
        if (!isScheduleWithinDeadline(candidate.scheduledAt, candidate.durationMinutes, candidate.dueAt)) continue
        if (!findScheduleConflict(allTasks.value, toPresentationTask(candidate), new Set([taskId]))) {
          model = candidate
          break
        }
      }
      if (!model) throw new Error('当天没有符合任务时长和截止期限的可用排期时段')
      assertScheduledAtIsNotPast(model.scheduledAt)
      model.version = task.version
      await updateTaskModel(model)
    })
  }

  async function rescheduleTask(taskId: string, toSlotTime: string, targetTaskId?: string): Promise<ScheduleInsertionResult | void> {
    const activeDayKey = selectedDay.value || getTodayDayCode()
    const targetDateKey = localDateKey(dateForDay(activeDayKey, '00:00').toISOString())!
    return withScheduleMutation(async () => {
      const task = findTask(taskId)
      if (!task?.scheduledAt || task.status === 'cancelled') throw new Error('源排期已变化，请刷新后重试')
      if (isCompletedScheduledTask(task)) throw new Error('已完成的排期任务已固定')
      if (localDateKey(task.scheduledAt) !== targetDateKey) {
        throw new Error('源排期已变化，请刷新时间轴后重试')
      }
      const targetSlot = generateTimeSlots().find((slot) => slot.time === toSlotTime)
      if (!targetSlot) throw new Error('目标时间槽不存在：系统不可见时间')
      return await insertTaskAtSlot(taskId, toSlotTime, targetDateKey, targetTaskId)
    })
  }

  async function swapScheduledTasks(sourceTaskId: string, targetTaskId: string): Promise<ScheduleInsertionResult | void> {
    return withScheduleMutation(async () => {
      if (sourceTaskId === targetTaskId) return
      const from = findTask(sourceTaskId)
      const to = findTask(targetTaskId)
      if (!from || !to) throw new Error('交换任务已变化，请刷新后重试')
      if (isCompletedScheduledTask(from) || isCompletedScheduledTask(to)) throw new Error('已完成的排期任务已固定')
      if (!from.scheduledAt || !to.scheduledAt) throw new Error('只有两个已排期任务可以交换')
      const day = dayCodeForScheduledAt(to.scheduledAt)
      if (!day || dayCodeForScheduledAt(from.scheduledAt) !== day) throw new Error('只能交换同一天的任务')
      assertScheduledAtIsNotPast(to.scheduledAt)
      assertScheduledAtIsNotPast(from.scheduledAt)

      const getDur = (d: any) => d == null ? 30 : (Number.isFinite(Number(d)) ? Math.max(0, Number(d)) : 30)
      const fromDur = getDur(from.durationMinutes)
      const toDur = getDur(to.durationMinutes)
      const fromStart = Date.parse(from.scheduledAt)
      const toStart = Date.parse(to.scheduledAt)

      let newFromStart = toStart
      let newToStart = fromStart
      const isAdjacent = (fromStart < toStart && fromStart + fromDur * 60_000 === toStart) || (toStart < fromStart && toStart + toDur * 60_000 === fromStart)
      const referenceStartMs = Math.min(fromStart, toStart)

      if (fromStart < toStart && fromStart + fromDur * 60_000 === toStart) {
        newToStart = fromStart
        newFromStart = fromStart + toDur * 60_000
      } else if (toStart < fromStart && toStart + toDur * 60_000 === fromStart) {
        newFromStart = toStart
        newToStart = toStart + fromDur * 60_000
      }

      const checkBounds = (startMs: number) => {
        const refDate = new Date(isAdjacent ? referenceStartMs : startMs)
        const windowStartMs = new Date(refDate.getFullYear(), refDate.getMonth(), refDate.getDate(), 8, 0, 0).getTime()
        const windowEndMs = new Date(refDate.getFullYear(), refDate.getMonth(), refDate.getDate(), 22, 30, 0).getTime()
        if (startMs < windowStartMs || startMs > windowEndMs) throw new Error('超出排期窗口')
      }
      checkBounds(newFromStart)
      checkBounds(newToStart)

      if (!isScheduleWithinDeadline(new Date(newFromStart).toISOString(), from.durationMinutes, from.dueAt)) throw new Error('任务排期结束时间不能晚于截止期限')
      if (!isScheduleWithinDeadline(new Date(newToStart).toISOString(), to.durationMinutes, to.dueAt)) throw new Error('任务排期结束时间不能晚于截止期限')
      await assertScheduleDaySynced(to.scheduledAt, from.id)

      const changedModels = [
        scheduleModelAt(from, new Date(newFromStart).toISOString()),
        scheduleModelAt(to, new Date(newToStart).toISOString()),
      ]
      const changedIds = new Set(changedModels.map((model) => model.id))
      for (const model of changedModels) {
        if (findScheduleConflict(allTasks.value, toPresentationTask(model), changedIds)) {
          throw new Error('目标时段与其他任务冲突')
        }
      }
      return await commitOfflineSchedule(changedModels, 'SCHEDULE_SWAP', from.id, {
        sourceTaskId: from.id,
        sourceBaseVersion: from.version,
        targetTaskId: to.id,
        targetBaseVersion: to.version,
      })
    })
  }

  async function unscheduleTask(idOrSlotTime: string): Promise<void> {
    return withScheduleMutation(async () => {
      const task = findTask(idOrSlotTime) ?? timeSlots.value.find((slot) => slot.time === idOrSlotTime)?.task
      if (!task) return
      if (isCompletedScheduledTask(task)) throw new Error('已完成的排期任务已固定')
      const model = toTaskModel({ ...task, status: task.status, scheduledAt: undefined, startTime: undefined })
      model.version = task.version
      await updateTaskModel(model)
    })
  }

  async function deleteTask(id: string): Promise<void> {
    return withScheduleMutation(async () => {
      const task = findTask(id)
      if (!task) return
      const model = toTaskModel(task)
      model.version = task.version
      model.deletedAt = new Date().toISOString()
      await persistOffline(model, 'DELETE', { id })
      allTasks.value = allTasks.value.filter((item) => item.id !== id)
      rebuildSchedule()
    })
  }



  const completedCount = computed(() => allTasks.value.filter((task) => isCompletedTask(task)).length)
  const pendingCount = computed(() => pendingTasks.value.length)
  const totalFocusHours = computed(() => {
    const minutes = allTasks.value.filter((task) => isCompletedTask(task)).reduce((sum, task) => sum + task.durationMinutes, 0)
    return `${(minutes / 60).toFixed(1)}h`
  })

  if (typeof window !== 'undefined') window.addEventListener('online', () => { void fetchTasks() })

  return {
    pendingTasks,
    allTasks,
    isLoading,
    lastError,
    timeSlots,
    selectedDay,
    currentNow,
    completedCount,
    pendingCount,
    totalFocusHours,
    loadLocalTasks,
    fetchTasks,
    setSelectedDay,
    addTask,
    scheduleTask,
    scheduleTaskToDay,
    rescheduleTask,
    swapScheduledTasks,
    unscheduleTask,
    deleteTask,
    updateTaskStatus,
    updateTaskDetails,
  }
})
