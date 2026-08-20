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
import { mapTaskView, type CognitiveLoad, type TaskModel, type TaskStatus } from '@/services/domainMappers'
import { uuidv7 } from '@/utils/uuid'
import { useSyncStore } from '@/store/useSyncStore'

export const DAY_CODES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const
export type DayCode = typeof DAY_CODES[number]

export const getTodayDayCode = (): DayCode => DAY_CODES[new Date().getDay()] || 'Mon'

export type TaskPresentationStatus = 'pending' | 'scheduled' | 'completed' | 'learning' | 'to_review'
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

function isOfflineLike(error: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true
  if (error && typeof error === 'object' && 'status' in error) {
    const status = Number((error as { status?: unknown }).status)
    return !Number.isFinite(status) || status >= 500
  }
  return true
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

function scheduledAtFromLegacy(value: string | undefined, fallbackDay: DayCode = getTodayDayCode()): string | undefined {
  if (!value?.trim()) return undefined
  const trimmed = value.trim()
  if (trimmed.includes('T')) return trimmed
  const parts = trimmed.split(/\s+/)
  const day = (DAY_CODES as readonly string[]).includes(parts[0]) ? parts[0] as DayCode : fallbackDay
  const time = parts.length > 1 ? parts[1] : parts[0]
  return dateForDay(day, time).toISOString()
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

function toTaskModel(input: TaskInput, fallbackDay: DayCode = getTodayDayCode()): TaskModel {
  const scheduledAt = input.scheduledAt ?? scheduledAtFromLegacy(input.startTime, fallbackDay)
  const status = statusFromLegacy(input.status, Boolean(scheduledAt))
  return {
    id: input.id || uuidv7(),
    subjectId: input.subjectId,
    title: input.title || input.name || '未命名任务',
    description: input.description ?? input.desc ?? '',
    status,
    scheduledAt,
    dueAt: input.dueAt,
    durationMinutes: input.durationMinutes ?? input.duration ?? 25,
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
    scheduledAt: model.scheduledAt,
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
  }
}

function dtoFromLocal(value: unknown): TaskModel | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as TaskView & TaskInput
  if (typeof candidate.id !== 'string') return null
  if (typeof candidate.title === 'string' || typeof candidate.status === 'string' && String(candidate.status).toUpperCase() === candidate.status) {
    return mapTaskView(candidate)
  }
  return toTaskModel(candidate)
}

function generateTimeSlots(): TimeSlot[] {
  return Array.from({ length: 15 }, (_, index) => {
    const hour = index + 8
    return { time: `${String(hour).padStart(2, '0')}:00`, task: null, isCurrent: false }
  })
}

function clientMutation(resourceId: string, mutationType: 'CREATE' | 'UPDATE' | 'DELETE', baseVersion: number, payload: Record<string, unknown>) {
  return {
    clientMutationId: uuidv7(),
    resourceType: 'TASK' as const,
    resourceId,
    mutationType,
    baseVersion,
    payload,
  }
}

function scheduleSync(): void {
  void useSyncStore().triggerSync().catch((error) => console.warn('[TaskStore] pending mutation sync failed', error))
}

export const useTaskStore = defineStore('task', () => {
  const pendingTasks = ref<Task[]>([])
  const allTasks = ref<Task[]>([])
  const isLoading = ref(false)
  const lastError = ref<string | null>(null)
  const selectedDay = ref<string>(getTodayDayCode())
  const timeSlots = ref<TimeSlot[]>(generateTimeSlots())
  const aiSuggestions = ref<string[]>([])
  const hasOverload = ref(false)

  function updateCurrentSlot(): void {
    const currentHour = new Date().getHours()
    const currentHourStr = `${String(currentHour).padStart(2, '0')}:00`
    timeSlots.value.forEach((slot) => {
      slot.isCurrent = slot.time === currentHourStr && selectedDay.value === getTodayDayCode()
    })
  }

  if (typeof window !== 'undefined') window.setInterval(updateCurrentSlot, 60_000)

  async function repository(): Promise<LocalRepository> {
    const authStore = useAuthStore()
    if (!authStore.user?.id || !authStore.deviceId) throw new Error('Tasks require an authenticated user and device')
    return getLocalRepository(authStore.user.id, authStore.deviceId)
  }

  function rebuildSchedule(): void {
    updateCurrentSlot()
    const tasks = allTasks.value
    pendingTasks.value = tasks.filter((task) => task.status === 'pending' || task.status === 'learning' || task.status === 'to_review' || (task.status === 'completed' && !task.scheduledAt))
    timeSlots.value.forEach((slot) => { slot.task = null })
    const scheduled = tasks.filter((task) => Boolean(task.scheduledAt) && task.status !== 'completed')
    for (const slot of timeSlots.value) {
      slot.task = scheduled.find((task) => dayCodeForScheduledAt(task.scheduledAt) === selectedDay.value && timeForScheduledAt(task.scheduledAt) === slot.time) || null
    }
    analyzeSchedule()
  }

  async function loadLocalTasks(): Promise<Task[]> {
    try {
      const repo = await repository()
      const rows = await repo.list<TaskView>('TASK', { includeDeleted: false })
      const local = rows
        .map((row) => dtoFromLocal(row.value))
        .filter((value): value is TaskModel => value !== null)
      .map((model) => toPresentationTask(model, rows.find((row) => row.id === model.id)?.syncStatus === 'conflict' ? 'conflict' : 'synced'))
      allTasks.value = local
      rebuildSchedule()
      return local
    } catch (error) {
      lastError.value = error instanceof Error ? error.message : '任务本地缓存加载失败'
      allTasks.value = []
      rebuildSchedule()
      return []
    }
  }

  async function cache(view: TaskView, syncStatus: Task['sync_status'] = 'synced'): Promise<Task> {
    const model = mapTaskView(view)
    const repo = await repository()
    await repo.upsert('TASK', model.id, view, {
      version: model.version,
      deletedAt: model.deletedAt,
      syncStatus: syncStatus === 'conflict' ? 'conflict' : syncStatus === 'synced' ? 'synced' : 'pending',
    })
    return toPresentationTask(model, syncStatus)
  }

  async function loadFromApi(): Promise<Task[]> {
    const loaded: Task[] = []
    let cursor: string | undefined
    let hasMore = true
    while (hasMore) {
      const page = await useTaskApi.list({ cursor, limit: 100 })
      for (const view of page.items ?? []) {
        if (!view.id) continue
        loaded.push(await cache(view))
      }
      cursor = page.hasMore && page.nextCursor ? page.nextCursor : undefined
      hasMore = Boolean(cursor)
    }
    const repo = await repository()
    const pendingRows = await repo.list<TaskView>('TASK', { includeDeleted: false })
    const pending = pendingRows
      .filter((row) => row.syncStatus !== 'synced')
      .map((row) => dtoFromLocal(row.value))
      .filter((value): value is TaskModel => value !== null)
      .map((model) => toPresentationTask(model, 'pending_update'))
    const merged = [...loaded, ...pending.filter((item) => !loaded.some((loadedItem) => loadedItem.id === item.id))]
    allTasks.value = merged
    rebuildSchedule()
    return merged
  }

  async function fetchTasks(): Promise<Task[]> {
    isLoading.value = true
    lastError.value = null
    await loadLocalTasks()
    try {
      return await loadFromApi()
    } catch (error) {
      if (!isOfflineLike(error)) throw error
      lastError.value = error instanceof Error ? error.message : '任务服务不可用，当前使用离线缓存'
      return allTasks.value
    } finally {
      isLoading.value = false
    }
  }

  function replaceInMemory(task: Task): void {
    const index = allTasks.value.findIndex((item) => item.id === task.id)
    if (index >= 0) allTasks.value[index] = task
    else allTasks.value.push(task)
    rebuildSchedule()
  }

  async function persistOffline(model: TaskModel, mutationType: 'CREATE' | 'UPDATE' | 'DELETE', payload: Record<string, unknown>): Promise<Task> {
    const repo = await repository()
    const view = taskDto(model)
    await repo.upsert('TASK', model.id, view, {
      version: model.version,
      deletedAt: model.deletedAt,
      syncStatus: 'pending',
    })
    await repo.enqueueMutation(clientMutation(model.id, mutationType, model.version, payload))
    scheduleSync()
    const task = toPresentationTask(model, mutationType === 'CREATE' ? 'pending_create' : mutationType === 'UPDATE' ? 'pending_update' : 'pending_delete')
    replaceInMemory(task)
    return task
  }

  async function addTask(input: TaskInput): Promise<string> {
    const model = toTaskModel(input, (selectedDay.value as DayCode) || getTodayDayCode())
    if (!model.subjectId) throw new Error('Task requires a subjectId')
    const payload = createPayload(model)
    try {
      const view = await useTaskApi.create(payload)
      replaceInMemory(await cache(view))
      return String(view.id)
    } catch (error) {
      if (!isOfflineLike(error)) throw error
      await persistOffline(model, 'CREATE', payload as unknown as Record<string, unknown>)
      return model.id
    }
  }

  async function updateTaskModel(model: TaskModel): Promise<void> {
    const payload = updatePayload(model)
    try {
      const view = await useTaskApi.update(model.id, payload)
      replaceInMemory(await cache(view))
    } catch (error) {
      if (!isOfflineLike(error)) throw error
      await persistOffline(model, 'UPDATE', payload as unknown as Record<string, unknown>)
    }
  }

  function findTask(id: string): Task | undefined {
    return allTasks.value.find((task) => task.id === id)
  }

  async function updateTaskStatus(taskId: string, newStatus: TaskPresentationStatus): Promise<void> {
    const current = findTask(taskId)
    if (!current) return
    const model = toTaskModel({ ...current, status: newStatus, scheduledAt: newStatus === 'scheduled' ? current.scheduledAt : undefined })
    model.version = current.version
    await updateTaskModel(model)
    await loadLocalTasks()
  }

  async function scheduleTask(taskId: string, slotTime: string): Promise<void> {
    const task = pendingTasks.value.find((item) => item.id === taskId)
    if (!task) return
    const slot = timeSlots.value.find((item) => item.time === slotTime)
    if (!slot) return
    if (slot.task) await updateTaskStatus(slot.task.id, 'pending')
    const model = toTaskModel({ ...task, status: 'scheduled', startTime: `${selectedDay.value} ${slotTime}` })
    model.version = task.version
    await updateTaskModel(model)
    await loadLocalTasks()
  }

  async function scheduleTaskToDay(taskId: string, day: string): Promise<void> {
    const task = findTask(taskId)
    if (!task) return
    const occupied = allTasks.value
      .filter((item) => item.id !== taskId && dayCodeForScheduledAt(item.scheduledAt) === day)
      .map((item) => timeForScheduledAt(item.scheduledAt))
    let hour = 8
    while (occupied.includes(`${String(hour).padStart(2, '0')}:00`) && hour <= 22) hour += 1
    const model = toTaskModel({ ...task, status: 'scheduled', startTime: `${day} ${String(hour).padStart(2, '0')}:00` })
    model.version = task.version
    await updateTaskModel(model)
    await loadLocalTasks()
  }

  async function rescheduleTask(fromSlotTime: string, toSlotTime: string): Promise<void> {
    const from = timeSlots.value.find((slot) => slot.time === fromSlotTime)?.task
    const to = timeSlots.value.find((slot) => slot.time === toSlotTime)?.task
    if (!from) return
    if (to) {
      const toModel = toTaskModel({ ...to, status: 'scheduled', startTime: `${selectedDay.value} ${fromSlotTime}` })
      toModel.version = to.version
      await updateTaskModel(toModel)
    }
    const fromModel = toTaskModel({ ...from, status: 'scheduled', startTime: `${selectedDay.value} ${toSlotTime}` })
    fromModel.version = from.version
    await updateTaskModel(fromModel)
    await loadLocalTasks()
  }

  async function unscheduleTask(slotTime: string): Promise<void> {
    const task = timeSlots.value.find((slot) => slot.time === slotTime)?.task
    if (!task) return
    const model = toTaskModel({ ...task, status: 'pending', scheduledAt: undefined, startTime: undefined })
    model.version = task.version
    await updateTaskModel(model)
    await loadLocalTasks()
  }

  async function deleteTask(id: string): Promise<void> {
    const task = findTask(id)
    if (!task) return
    const model = toTaskModel(task)
    model.version = task.version
    try {
      await useTaskApi.delete(id, { baseVersion: model.version })
      const repo = await repository()
      await repo.tombstone('TASK', id, { version: model.version + 1, syncStatus: 'synced' })
    } catch (error) {
      if (!isOfflineLike(error)) throw error
      model.deletedAt = new Date().toISOString()
      await persistOffline(model, 'DELETE', { id })
    }
    allTasks.value = allTasks.value.filter((item) => item.id !== id)
    rebuildSchedule()
  }

  function analyzeSchedule(): void {
    aiSuggestions.value = []
    hasOverload.value = false
    let continuousHighLoad = 0
    let totalLoadScore = 0
    for (const slot of timeSlots.value) {
      if (!slot.task) {
        continuousHighLoad = 0
        continue
      }
      if (slot.task.load === 'high') {
        continuousHighLoad += 1
        totalLoadScore += 3
      } else if (slot.task.load === 'medium') {
        continuousHighLoad = 0
        totalLoadScore += 2
      } else {
        continuousHighLoad = 0
        totalLoadScore += 1
      }
      if (continuousHighLoad >= 2) {
        aiSuggestions.value.push(`⚠️ 连续的高负荷任务会导致疲劳，建议在【${slot.time}】前后插入休息或低负荷任务。`)
        continuousHighLoad = 0
      }
    }
    if (totalLoadScore > 12) {
      hasOverload.value = true
      const lastScheduled = [...timeSlots.value].reverse().find((slot) => slot.task)
      if (lastScheduled?.task) aiSuggestions.value.push(`🚨 今日认知负荷 (${totalLoadScore}) 已超出您的历史最佳承受力。建议将【${lastScheduled.task.name}】自动延后。`)
    }
    if (aiSuggestions.value.length === 0 && timeSlots.value.some((slot) => slot.task)) aiSuggestions.value.push('✨ 当前排期科学合理，符合您的心流节奏！')
  }

  async function applyAutoDelay(): Promise<void> {
    const lastScheduled = [...timeSlots.value].reverse().find((slot) => slot.task)
    if (lastScheduled) await unscheduleTask(lastScheduled.time)
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
    addTask,
    scheduleTask,
    scheduleTaskToDay,
    rescheduleTask,
    unscheduleTask,
    deleteTask,
    updateTaskStatus,
    aiSuggestions,
    hasOverload,
    analyzeSchedule,
    applyAutoDelay,
  }
})
