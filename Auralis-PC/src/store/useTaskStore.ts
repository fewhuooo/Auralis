import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import {
  type TaskCreateRequest,
  type TaskUpdateRequest,
  type TaskView,
} from '@/api/useTaskApi'
import { useAuthStore } from '@/store/useAuthStore'
import { getLocalRepository } from '@/services/localDb'
import { LocalConflictError, taskScheduleState, type LocalCommitInput, type LocalRepository, type LocalScheduleBatchCommitInput } from '@/services/localRepository'
import { isCanonicalTaskStatus, mapTaskView, type TaskModel, type TaskStatus } from '@/services/domainMappers'
import { uuidv7 } from '@/utils/uuid'
import { isOnline, useSyncStore } from '@/store/useSyncStore'
import { useSubjectStore } from '@/store/useSubjectStore'
import { createStableMutation } from '@/services/offlineWritePolicy'
import { findScheduleConflict, getTasksForTimeline, isCompletedTask, isSchedulableTask, isScheduledAtInPast, isScheduledCompletionLocked, isOverdueTask, taskStatusToPresentation, isScheduleWithinDeadline, parseDueTimestamp, localDateEndOfDay } from '@/services/taskViewRules'
import {
  planTimelineDrop,
  timelineDateKey,
  TIMELINE_START_MINUTES,
  TIMELINE_END_MINUTES,
  TIMELINE_SLOT_MINUTES,
  type TimelineDropIntent,
  type TimelineDropPlan,
} from '@/services/taskSchedulePlanner'
import { subscribeProjectionChange } from '@/services/localProjectionEvents'

export const DAY_CODES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const
export type DayCode = typeof DAY_CODES[number]

export const getTodayDayCode = (): DayCode => DAY_CODES[new Date().getDay()] || 'Mon'

export type TaskPresentationStatus = 'pending' | 'scheduled' | 'completed' | 'learning' | 'to_review' | 'cancelled'
export type ScheduleInsertionResult = 'saved' | 'queued'

type TaskWritePreconditions = Pick<LocalCommitInput,
  'expectedLocalVersion' | 'rejectIfNonPendingMutation' | 'requireActiveResource' | 'ordinaryScheduleBaseline'>

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
  subject: string
  startTime?: string
  position?: string
  sync_status?: 'synced' | 'pending_create' | 'pending_update' | 'pending_delete' | 'conflict'
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
  subject?: string
  position?: string
}

export interface TimeSlot {
  time: string
  task: Task | null
  isCurrent: boolean
}

function toTaskStatus(value: TaskInput['status']): TaskStatus {
  if (value === 'TODO' || value === 'IN_PROGRESS' || value === 'DONE' || value === 'CANCELLED') return value
  if (value === 'completed') return 'DONE'
  if (value === 'learning') return 'IN_PROGRESS'
  if (value === 'cancelled') return 'CANCELLED'
  return 'TODO'
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

function toTaskModel(input: TaskInput): TaskModel {
  const scheduledAt = input.scheduledAt
  const status = toTaskStatus(input.status)
  const rawDueAt = input.dueAt
  return {
    id: input.id || uuidv7(),
    subjectId: input.subjectId,
    title: input.title || '未命名任务',
    description: input.description ?? '',
    status,
    scheduledAt,
    // Preserve persisted values exactly. Date-only conversion belongs to
    // explicit user-input paths, never to reading or rescheduling old tasks.
    dueAt: rawDueAt || undefined,
    durationMinutes: input.durationMinutes ?? 30,    sortKey: input.sortKey ?? input.position,
    version: input.version ?? 0,
    deletedAt: null,
  }
}

function toPresentationTask(model: TaskModel, syncStatus: Task['sync_status'] = 'synced', subjectName?: string): Task {
  const task: Partial<Task> = {
    ...model,
    status: taskStatusToPresentation(model.status, model.scheduledAt),
    startTime: timeForScheduledAt(model.scheduledAt),
    position: model.sortKey,
    sync_status: syncStatus,
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
    durationMinutes: model.durationMinutes,
    sortKey: model.sortKey,
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
    sortKey: model.sortKey,
  }
}

function updatePayload(model: TaskModel): TaskUpdateRequest {
  return {
    ...createPayload(model),
    baseVersion: model.version,
    scheduledAt: model.scheduledAt ?? null,
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

  const suppressedOverdueFingerprints = new Map<string, string>()
  const pendingRejectedOverdueTokens = new Map<string, number>()
  let suppressedOverdueScopeKey = ''

  function currentOverdueScopeKey(): string {
    const auth = useAuthStore()
    return `${auth.user?.id ?? ''}:${auth.serverDeviceId ?? ''}`
  }

  function syncOverdueSuppressionScope(): string {
    const scopeKey = currentOverdueScopeKey()
    if (suppressedOverdueScopeKey !== scopeKey) {
      suppressedOverdueFingerprints.clear()
      pendingRejectedOverdueTokens.clear()
      suppressedOverdueScopeKey = scopeKey
    }
    return scopeKey
  }

  function overdueFingerprint(task: Pick<Task, 'version' | 'scheduledAt' | 'dueAt' | 'durationMinutes' | 'title'>): string {
    return JSON.stringify([task.version ?? 0, task.scheduledAt ?? null, task.dueAt ?? null, task.durationMinutes ?? 30, task.title])
  }

  function isOverdueSuppressed(task: Task): boolean {
    const expected = suppressedOverdueFingerprints.get(task.id)
    if (!expected) return false
    if (expected === overdueFingerprint(task)) return true
    suppressedOverdueFingerprints.delete(task.id)
    return false
  }

  async function recoverOverdueTasks(): Promise<void> {
    if (!isLoading.value && useAuthStore().isAuthenticated) {
      syncOverdueSuppressionScope()
      const endedTaskIds = allTasks.value
        .filter((task) => isOverdueTask(task) && !pendingRejectedOverdueTokens.has(task.id) && !isOverdueSuppressed(task))
        .map((task) => task.id)
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
            const model: TaskModel = { ...localModel, status: 'DONE', version: localRow.version }
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
    const isToday = selectedDay.value === getTodayDayCode() || selectedDay.value === timelineDateKey(now.toISOString())
    timeSlots.value.forEach((slot) => {
      slot.isCurrent = slot.time === currentSlotTime && isToday
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
    if (change.rejectedTaskIds && change.rejectedTaskIds.size > 0) {
      const eventScopeKey = syncOverdueSuppressionScope()
      const ids = [...change.rejectedTaskIds]
      for (const id of ids) {
        pendingRejectedOverdueTokens.set(id, (pendingRejectedOverdueTokens.get(id) ?? 0) + 1)
      }
      void loadLocalTasks().then(() => {
        if (syncOverdueSuppressionScope() === eventScopeKey) {
          for (const id of ids) {
            const rejectedTask = allTasks.value.find((task) => task.id === id)
            if (rejectedTask) suppressedOverdueFingerprints.set(id, overdueFingerprint(rejectedTask))
            const count = pendingRejectedOverdueTokens.get(id) ?? 0
            if (count <= 1) pendingRejectedOverdueTokens.delete(id)
            else pendingRejectedOverdueTokens.set(id, count - 1)
          }
        }
        return recoverOverdueTasks()
      })
      return
    }
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
    options: TaskWritePreconditions = {},
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
      ...options,
      mutation: clientMutation(model.id, mutationType, model.version, payload),
    })
    replaceInMemory(task)
    scheduleSync()
    return task
  }

  async function addTask(input: TaskInput): Promise<string> {
    return withScheduleMutation(async () => {
      const rawDueAt = input.dueAt
      const model = toTaskModel({
        ...input,
        dueAt: normalizeDueAtForUserInput(rawDueAt),
      })
      if (!model.subjectId) throw new Error('Task requires a subjectId')
      const payload = createPayload(model)
      await persistOffline(model, 'CREATE', payload as unknown as Record<string, unknown>)
      return model.id
    })
  }

  async function updateTaskModel(
    model: TaskModel,
    options: TaskWritePreconditions = {},
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

  async function assertScheduleDaySynced(dateKey: string, sourceTaskId: string): Promise<void> {
    const repo = await repository()
    const [rows, pendingMutations] = await Promise.all([
      repo.list<TaskView>('TASK', { includeDeleted: false }),
      repo.listUnresolved('TASK'),
    ])
    const scheduleIds = new Set(pendingMutations.flatMap((mutation) => {
      const ids = mutation.payload._localAffectedTaskIds
      return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : []
    }))
    const pendingIds = new Set(pendingMutations.filter((mutation) =>
      mutation.mutationType !== 'SCHEDULE_INSERTION' && mutation.mutationType !== 'SCHEDULE_SWAP'
      && mutation.mutationType !== 'SCHEDULE_UNSCHEDULE').map((mutation) => mutation.resourceId))
    if (pendingIds.has(sourceTaskId) || rows.some((row) => {
      if (row.id !== sourceTaskId && timelineDateKey(row.value.scheduledAt ?? undefined) !== dateKey) return false
      return pendingIds.has(row.id) || row.syncStatus !== 'synced' && !scheduleIds.has(row.id)
    })) {
      throw new Error('当天排期包含尚未同步的任务，请同步后再调整')
    }
  }

  function currentScheduleTasks(): TaskModel[] {
    return allTasks.value.map((task) => ({
      id: task.id,
      subjectId: task.subjectId,
      title: task.title,
      description: task.description,
      status: toTaskStatus(task.status),
      scheduledAt: task.scheduledAt ?? undefined,
      dueAt: task.dueAt,
      durationMinutes: task.durationMinutes,
      sortKey: task.sortKey,
      version: task.version,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      deletedAt: task.deletedAt,
    }))
  }

  function previewTimelineDrop(intent: TimelineDropIntent): { scheduledAt?: string; error?: string } {
    try {
      const plan = planTimelineDrop(currentScheduleTasks(), intent, new Date())
      return { scheduledAt: plan?.models.find((model) => model.id === intent.taskId)?.scheduledAt }
    } catch (error) {
      return { error: error instanceof Error ? error.message : '排期未保存' }
    }
  }

  async function applyTimelineDrop(intent: TimelineDropIntent): Promise<ScheduleInsertionResult | undefined> {
    return withScheduleMutation(async () => {
      const tasks = currentScheduleTasks()
      const plan = planTimelineDrop(tasks, intent, new Date())
      if (!plan) return

      const source = plan.models.find((model) => model.id === intent.taskId)
      if (!source) throw new Error('排期事务缺少源任务')
      const baselineRows = tasks.map((task) => ({
        id: task.id, version: task.version, deletedAt: task.deletedAt, value: taskDto(task),
      }))
      const expectedScheduleState = taskScheduleState(baselineRows)

      if (intent.type === 'week') {
        const pending = await (await repository()).listUnresolved('TASK')
        if (pending.some((mutation) => mutation.resourceId === source.id
          && (mutation.mutationType === 'CREATE' || mutation.mutationType === 'UPDATE')
          && (mutation.status === 'pending' || mutation.status === 'inflight'))) {
          // An ordinary write may be sent before an unresolved schedule that made this slot free.
          await updateTaskModel(source, {
            expectedLocalVersion: source.version,
            requireActiveResource: true,
            ordinaryScheduleBaseline: expectedScheduleState,
          })
          return isOnline() ? 'saved' : 'queued'
        }
      } else if (intent.type !== 'unschedule') {
        await assertScheduleDaySynced(intent.dateKey, source.id)
      }

      return commitOfflineSchedule(plan, source, {
        expectedScheduleState,
        expectedSwapScheduleState: plan.mutationType === 'SCHEDULE_SWAP' ? taskScheduleState(baselineRows, false) : undefined,
      })
    })
  }

  async function commitOfflineSchedule(
    plan: TimelineDropPlan,
    source: TaskModel,
    baseline: Pick<LocalScheduleBatchCommitInput, 'expectedScheduleState' | 'expectedSwapScheduleState'>,
  ): Promise<ScheduleInsertionResult> {
    const payload = plan.mutationType === 'SCHEDULE_UNSCHEDULE' ? updatePayload(source) : plan.payload
    const repo = await repository()
    try {
      await repo.commitScheduleMutation({
        ...baseline,
        items: plan.models.map((model) => ({
          resourceType: 'TASK',
          resourceId: model.id,
          value: taskDto(model),
          version: model.version,
          deletedAt: model.deletedAt,
          expectedLocalVersion: model.version,
        })),
        mutation: createStableMutation({
          clientMutationId: uuidv7(),
          resourceType: 'TASK',
          resourceId: source.id,
          mutationType: plan.mutationType,
          baseVersion: source.version,
          payload: { ...payload, _localAffectedTaskIds: plan.models.map((model) => model.id) },
        }),
      })
    } catch (error) {
      if (error instanceof LocalConflictError) await loadLocalTasks()
      throw error
    }
    await loadLocalTasks()
    useSyncStore().requestBackgroundSync('write')
    return isOnline() ? 'saved' : 'queued'
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
      })
      model.version = current.version
      await updateTaskModel(model)
    })
  }

  async function unscheduleTask(taskId: string): Promise<void> {
    const task = findTask(taskId)
    if (!task?.scheduledAt) return
    const dateKey = timelineDateKey(task.scheduledAt)
    if (!dateKey) throw new Error('源排期已变化，请刷新时间轴后重试')
    await applyTimelineDrop({ type: 'unschedule', taskId, dateKey, sourceScheduledAt: task.scheduledAt })
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
    previewTimelineDrop,
    applyTimelineDrop,
    unscheduleTask,
    deleteTask,
    updateTaskStatus,
    updateTaskDetails,
  }
})
