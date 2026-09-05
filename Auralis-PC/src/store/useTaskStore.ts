import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import {
  useTaskApi,
  type TaskCreateRequest,
  type TaskUpdateRequest,
  type TaskView,
} from '@/api/useTaskApi'
import { useAuthStore } from '@/store/useAuthStore'
import { getLocalRepository } from '@/services/localDb'
import type { LocalRepository } from '@/services/localRepository'
import { isCanonicalTaskStatus, mapTaskView, type CognitiveLoad, type TaskModel, type TaskStatus } from '@/services/domainMappers'
import { uuidv7 } from '@/utils/uuid'
import { useSyncStore } from '@/store/useSyncStore'
import { createStableMutation } from '@/services/offlineWritePolicy'
import { getTasksForTimeline, isCompletedScheduledTask, isSchedulableTask, isScheduledAtInPast, isScheduledTaskPast, isUnscheduledTaskPastDue } from '@/services/taskViewRules'
import { subscribeProjectionChange } from '@/services/localProjectionEvents'

export const DAY_CODES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const
export type DayCode = typeof DAY_CODES[number]

export const getTodayDayCode = (): DayCode => DAY_CODES[new Date().getDay()] || 'Mon'

export type TaskPresentationStatus = 'pending' | 'scheduled' | 'completed' | 'learning' | 'to_review' | 'cancelled'
export type TaskLoad = 'low' | 'medium' | 'high'

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
  cognitiveLoad: CognitiveLoad
  sortKey?: string
  colorOverride?: string
  version: number
  createdAt?: string
  updatedAt?: string
  deletedAt: string | null
  name: string
  subject: string
  desc: string
  color: string
  duration: number
  load: TaskLoad
  loadText: string
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
  cognitiveLoad?: CognitiveLoad
  sortKey?: string
  colorOverride?: string
  version?: number
  name?: string
  subject?: string
  desc?: string
  color?: string
  duration?: number
  load?: TaskLoad
  loadText?: string
  startTime?: string
  position?: string
}

export interface TimeSlot {
  time: string
  task: Task | null
  isCurrent: boolean
}

function loadFromLegacy(value: TaskInput['load']): CognitiveLoad {
  if (value === 'low') return 'LOW'
  if (value === 'high') return 'HIGH'
  return 'MEDIUM'
}

function loadToPresentation(value: CognitiveLoad): TaskLoad {
  return value.toLowerCase() as TaskLoad
}

function loadLabel(value: CognitiveLoad): string {
  if (value === 'LOW') return '低负荷'
  if (value === 'HIGH') return '高负荷'
  return '中负荷'
}

function statusFromLegacy(value: TaskInput['status'], hasSchedule: boolean): TaskStatus {
  if (value === 'TODO' || value === 'IN_PROGRESS' || value === 'DONE' || value === 'CANCELLED') return value
  if (value === 'completed') return 'DONE'
  if (value === 'learning') return 'IN_PROGRESS'
  if (value === 'scheduled' || hasSchedule) return 'TODO'
  return 'TODO'
}

function statusToPresentation(value: TaskStatus, scheduledAt?: string): TaskPresentationStatus {
  if (value === 'DONE') return 'completed'
  if (value === 'IN_PROGRESS') return 'learning'
  if (value === 'CANCELLED') return 'cancelled'
  if (value === 'TODO' && scheduledAt) return 'scheduled'
  return 'pending'
}

function dateForDay(day: DayCode, time: string): Date {
  const [hours, minutes] = time.split(':').map(Number)
  const now = new Date()
  const currentDay = now.getDay()
  const targetDay = DAY_CODES.indexOf(day)
  const delta = targetDay - currentDay
  const date = new Date(now)
  date.setDate(now.getDate() + delta)
  date.setHours(Number.isFinite(hours) ? hours : 9, Number.isFinite(minutes) ? minutes : 0, 0, 0)
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

function toTaskModel(input: TaskInput, fallbackDay: DayCode = dayCodeForScheduledAt(input.scheduledAt) ?? getTodayDayCode()): TaskModel {
  const scheduledAt = input.startTime !== undefined
    ? scheduledAtFromLegacy(input.startTime, fallbackDay)
    : input.scheduledAt
  const status = statusFromLegacy(input.status, Boolean(scheduledAt))
  return {
    id: input.id || uuidv7(),
    subjectId: input.subjectId,
    title: input.title || input.name || '未命名任务',
    description: input.description ?? input.desc ?? '',
    status,
    scheduledAt,
    dueAt: input.dueAt,
    durationMinutes: input.durationMinutes ?? input.duration ?? 30,
    cognitiveLoad: input.cognitiveLoad ?? loadFromLegacy(input.load),
    sortKey: input.sortKey ?? input.position,
    colorOverride: input.colorOverride ?? input.color,
    version: input.version ?? 0,
    deletedAt: null,
  }
}

function toPresentationTask(model: TaskModel, syncStatus: Task['sync_status'] = 'synced', subjectName?: string): Task {
  const load = loadToPresentation(model.cognitiveLoad)
  return {
    ...model,
    status: statusToPresentation(model.status, model.scheduledAt),
    name: model.title,
    subject: subjectName || model.subjectId,
    desc: model.description,
    color: model.colorOverride || '#7D9372',
    duration: model.durationMinutes,
    load,
    loadText: loadLabel(model.cognitiveLoad),
    startTime: timeForScheduledAt(model.scheduledAt),
    position: model.sortKey,
    sync_status: syncStatus,
    sync_version: model.version,
    is_deleted: Boolean(model.deletedAt),
  }
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
    durationMinutes: model.durationMinutes,
    cognitiveLoad: model.cognitiveLoad,
    sortKey: model.sortKey,
    colorOverride: model.colorOverride,
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
    durationMinutes: model.durationMinutes,
    cognitiveLoad: model.cognitiveLoad,
    sortKey: model.sortKey,
    colorOverride: model.colorOverride,
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

  function assertScheduledAtIsNotPast(scheduledAt: string | undefined): void {
    if (isScheduledAtInPast(scheduledAt)) {
      throw new Error('不能排期到过去的时间')
    }
  }

  async function recoverOverdueTasks(): Promise<void> {
    if (!isLoading.value && useAuthStore().isAuthenticated) {
      for (const task of allTasks.value) {
        if (isScheduledTaskPast(task)) {
          const model = toTaskModel({ ...task, status: 'completed', scheduledAt: task.scheduledAt })
          model.version = task.version
          await updateTaskModel(model)
        } else if (isUnscheduledTaskPastDue(task)) {
          const model = toTaskModel({ ...task, dueAt: undefined, scheduledAt: undefined, startTime: undefined })
          model.version = task.version
          model.dueAt = model.dueAt ?? null
          await updateTaskModel(model)
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

  if (typeof window !== 'undefined') {
    window.setInterval(() => {
      updateCurrentSlot()
      void recoverOverdueTasks()
    }, 60_000)
  }

  async function repository(): Promise<LocalRepository> {
    const authStore = useAuthStore()
    if (!authStore.user?.id || !authStore.serverDeviceId) throw new Error('Tasks require an authenticated user and device')
    return getLocalRepository(authStore.user.id, authStore.serverDeviceId)
  }

  function rebuildSchedule(): void {
    updateCurrentSlot()
    const tasks = allTasks.value
    // Array.prototype.filter passes an index as its second argument; keep the
    // view-rule clock parameter explicit so it can never receive that index.
    pendingTasks.value = tasks.filter((task) => isSchedulableTask(task))
    const scheduled = getTasksForTimeline(tasks)
    timeSlots.value = timeSlots.value.map((slot) => ({
      ...slot,
      task: scheduled.find((task) => dayCodeForScheduledAt(task.scheduledAt) === selectedDay.value && timelineSlotTimeForScheduledAt(task.scheduledAt) === slot.time) || null
    }))
  }

  function setSelectedDay(day: string): void {
    selectedDay.value = day
    rebuildSchedule()
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
      useSyncStore().requestBackgroundSync('read')
      return allTasks.value
    } finally {
      isLoading.value = false
    }
  }

  subscribeProjectionChange((change) => {
    if (change.resourceTypes.has('TASK')) void loadLocalTasks()
  })

  function replaceInMemory(task: Task): void {
    const index = allTasks.value.findIndex((item) => item.id === task.id)
    if (index >= 0) allTasks.value[index] = task
    else allTasks.value.push(task)
    rebuildSchedule()
  }

  async function persistOffline(model: TaskModel, mutationType: 'CREATE' | 'UPDATE' | 'DELETE', payload: Record<string, unknown>): Promise<Task> {
    const task = toPresentationTask(model, mutationType === 'CREATE' ? 'pending_create' : mutationType === 'UPDATE' ? 'pending_update' : 'pending_delete')
    const repo = await repository()
    await repo.commitMutation({
      resourceType: 'TASK',
      resourceId: model.id,
      value: taskDto(model),
      version: model.version,
      deletedAt: model.deletedAt,
      mutation: clientMutation(model.id, mutationType, model.version, payload),
    })
    replaceInMemory(task)
    scheduleSync()
    return task
  }

  async function addTask(input: TaskInput): Promise<string> {
    const model = toTaskModel(input, (selectedDay.value as DayCode) || getTodayDayCode())
    if (!model.subjectId) throw new Error('Task requires a subjectId')
    const payload = createPayload(model)
    await persistOffline(model, 'CREATE', payload as unknown as Record<string, unknown>)
    return model.id
  }

  async function updateTaskModel(model: TaskModel): Promise<void> {
    const payload = updatePayload(model)
    try {
      await persistOffline(model, 'UPDATE', payload as unknown as Record<string, unknown>)
    } catch (error) {
      lastError.value = error instanceof Error ? error.message : '任务本地保存失败'
      throw error
    }
  }

  function findTask(id: string): Task | undefined {
    return allTasks.value.find((task) => task.id === id)
  }

  async function updateTaskStatus(taskId: string, newStatus: TaskPresentationStatus): Promise<void> {
    const current = findTask(taskId)
    if (!current) return
    const model = toTaskModel({ ...current, status: newStatus, scheduledAt: current.scheduledAt })
    model.version = current.version
    await updateTaskModel(model)
  }

  async function updateTaskDetails(taskId: string, changes: Pick<TaskInput, 'title' | 'description' | 'dueAt' | 'durationMinutes'>): Promise<void> {
    const current = findTask(taskId)
    if (!current) return
    const hasDueAtChange = Object.prototype.hasOwnProperty.call(changes, 'dueAt')
    const model = toTaskModel({
      ...current,
      title: changes.title ?? current.title,
      description: changes.description ?? current.description,
      dueAt: hasDueAtChange ? changes.dueAt : current.dueAt,
      durationMinutes: changes.durationMinutes ?? current.durationMinutes,
      scheduledAt: current.scheduledAt,
      status: current.status,
    })
    model.version = current.version
    await updateTaskModel(model)
  }

  async function scheduleTask(taskId: string, slotTime: string): Promise<void> {
    const task = pendingTasks.value.find((item) => item.id === taskId)
    if (!task) return
    const slot = timeSlots.value.find((item) => item.time === slotTime)
    if (!slot) return
    if (slot.task && isCompletedScheduledTask(slot.task)) throw new Error('已完成的排期任务已固定')
    if (slot.task) await unscheduleTask(slotTime)
    const model = toTaskModel({ ...task, status: task.status, startTime: `${selectedDay.value} ${slotTime}` })
    assertScheduledAtIsNotPast(model.scheduledAt)
    model.version = task.version
    await updateTaskModel(model)
  }

  async function scheduleTaskToDay(taskId: string, day: string): Promise<void> {
    const task = findTask(taskId)
    if (!task) return
    if (isCompletedScheduledTask(task)) throw new Error('已完成的排期任务已固定')
    const occupied = allTasks.value
      .filter((item) => item.id !== taskId && dayCodeForScheduledAt(item.scheduledAt) === day)
      .map((item) => timeForScheduledAt(item.scheduledAt))
    let hour = 8
    while (occupied.includes(`${String(hour).padStart(2, '0')}:00`) && hour <= 22) hour += 1
    const model = toTaskModel({ ...task, status: task.status, startTime: `${day} ${String(hour).padStart(2, '0')}:00` })
    assertScheduledAtIsNotPast(model.scheduledAt)
    model.version = task.version
    await updateTaskModel(model)
  }

  async function rescheduleTask(fromSlotTime: string, toSlotTime: string): Promise<void> {
    const from = timeSlots.value.find((slot) => slot.time === fromSlotTime)?.task
    const to = timeSlots.value.find((slot) => slot.time === toSlotTime)?.task
    if (!from) return
    if (isCompletedScheduledTask(from) || (to && isCompletedScheduledTask(to))) throw new Error('已完成的排期任务已固定')

    const fromModel = toTaskModel({ ...from, status: from.status, startTime: `${selectedDay.value} ${toSlotTime}` })
    assertScheduledAtIsNotPast(fromModel.scheduledAt)

    if (to) {
      const toModel = toTaskModel({ ...to, status: to.status, startTime: `${selectedDay.value} ${fromSlotTime}` })
      assertScheduledAtIsNotPast(toModel.scheduledAt)
      await useTaskApi.swapSchedules({
        fromId: fromModel.id,
        fromVersion: from.version,
        fromTargetTime: fromModel.scheduledAt!,
        toId: toModel.id,
        toVersion: to.version,
        toTargetTime: toModel.scheduledAt!
      })
      toModel.version = to.version + 1
      fromModel.version = from.version + 1
      replaceInMemory(toPresentationTask(toModel, 'synced'))
      replaceInMemory(toPresentationTask(fromModel, 'synced'))
    } else {
      await useTaskApi.swapSchedules({
        fromId: fromModel.id,
        fromVersion: from.version,
        fromTargetTime: fromModel.scheduledAt!
      })
      fromModel.version = from.version + 1
      replaceInMemory(toPresentationTask(fromModel, 'synced'))
    }
    useSyncStore().requestBackgroundSync('read')
  }

  async function unscheduleTask(slotTime: string): Promise<void> {
    const task = timeSlots.value.find((slot) => slot.time === slotTime)?.task
    if (!task) return
    if (isCompletedScheduledTask(task)) throw new Error('已完成的排期任务已固定')
    const model = toTaskModel({ ...task, status: task.status, scheduledAt: undefined, startTime: undefined })
    model.version = task.version
    await updateTaskModel(model)
  }

  async function deleteTask(id: string): Promise<void> {
    const task = findTask(id)
    if (!task) return
    const model = toTaskModel(task)
    model.version = task.version
    model.deletedAt = new Date().toISOString()
    await persistOffline(model, 'DELETE', { id })
    allTasks.value = allTasks.value.filter((item) => item.id !== id)
    rebuildSchedule()
  }



  const completedCount = computed(() => allTasks.value.filter((task) => task.status === 'completed').length)
  const pendingCount = computed(() => pendingTasks.value.length)
  const totalFocusHours = computed(() => {
    const minutes = allTasks.value.filter((task) => task.status === 'completed').reduce((sum, task) => sum + task.durationMinutes, 0)
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
    unscheduleTask,
    deleteTask,
    updateTaskStatus,
    updateTaskDetails,
  }
})
