import type { LocalEntity, LocalMutation } from '@/types/api'
import { asTaskConflictSnapshot, type LocalRepository } from '@/services/localRepository'
import type { SyncRequestScopeTicket } from '@/api/request'
import { orderMutationsForPush } from '@/services/syncOrdering'
import type {
  SyncChange,
  SyncMutationResponse,
  SyncPullResponse,
  SyncPushResponse,
  SyncResourceType,
  SyncSnapshotResponse,
} from '@/types/sync'

const SYNC_RESOURCE_TYPES = new Set<SyncResourceType>(['SUBJECT', 'SOURCE', 'KNOWLEDGE_BLOCK', 'TASK', 'RELATION'])

type SyncRepository = Pick<LocalRepository,
  'claimPending' | 'settleMutation' | 'releaseInflight' | 'getSyncState' | 'saveCursor'
  | 'listUnresolved' | 'read' | 'upsertFromSync' | 'replaceSnapshotPreservingPending'>
  & Pick<LocalRepository, 'resolveScheduleMutation'>
  & Partial<Pick<LocalRepository, 'resolveRejectedSubjectDelete' | 'resolveRejectedTaskMutation'>>

type SyncApi = {
  pushChanges(input: { serverDeviceId: string; mutations: LocalMutation[] }, scope?: SyncRequestScopeTicket): Promise<SyncPushResponse>
  pullChanges(input: { cursor?: string; limit: number }, scope?: SyncRequestScopeTicket): Promise<SyncPullResponse>
  getSnapshot(scope?: SyncRequestScopeTicket): Promise<SyncSnapshotResponse>
}

export interface SyncCycleInput {
  repository: SyncRepository
  api: SyncApi
  serverDeviceId: string
  scope?: SyncRequestScopeTicket
  isCurrent?: () => boolean
  onScheduleSettled?: (error?: ScheduleSyncError) => void
}

type ScheduleSyncError = { clientMutationId: string; code: string }

export interface SyncCycleResult {
  changedResourceTypes: ReadonlySet<SyncResourceType>
  cursor: string | null
  ordinarySettled: number
  scheduleApplied: number
  scheduleErrors: ScheduleSyncError[]
  rejectedTaskIds: string[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function resourceVersion(value: unknown, fallback: number): number {
  return isRecord(value) && typeof value.version === 'number' ? value.version : fallback
}

function resourceKey(resourceType: string, resourceId: string): string {
  return `${resourceType}\u0000${resourceId}`
}

function assertCurrent(isCurrent?: () => boolean): void {
  if (isCurrent && !isCurrent()) {
    const error = new Error('SYNC_SCOPE_CHANGED') as Error & { code: string }
    error.code = 'SYNC_SCOPE_CHANGED'
    throw error
  }
}

function snapshotItems(snapshot: SyncSnapshotResponse): Array<{
  resourceType: SyncResourceType
  resourceId: string
  version: number
  deletedAt: string | null
  value: unknown
}> {
  const groups: Array<[SyncResourceType, unknown[]]> = [
    ['SUBJECT', snapshot.subjects],
    ['SOURCE', snapshot.sources],
    ['KNOWLEDGE_BLOCK', snapshot.knowledgeBlocks],
    ['TASK', snapshot.tasks],
    ['RELATION', snapshot.relations],
  ]
  return groups.flatMap(([resourceType, values]) => values.flatMap((value) => {
    const resourceId = isRecord(value) && typeof value.id === 'string' ? value.id : null
    if (!resourceId) return []
    return [{
      resourceType,
      resourceId,
      version: resourceVersion(value, 0),
      deletedAt: isRecord(value) && typeof value.deletedAt === 'string' ? value.deletedAt : null,
      value,
    }]
  }))
}

function changeValue(change: SyncChange, current: LocalEntity<unknown> | null): unknown {
  return change.payload ?? current?.value ?? {}
}

export function latestChangesByResource(changes: SyncChange[]): SyncChange[] {
  const latest = new Map<string, SyncChange>()
  for (const change of changes) latest.set(resourceKey(change.resourceType, change.resourceId), change)
  return [...latest.values()]
}

export async function applyPullPage(
  repository: SyncRepository,
  changes: SyncChange[],
  checkCurrent: () => void = () => {},
): Promise<Set<SyncResourceType>> {
  checkCurrent()
  const unresolved = await repository.listUnresolved()
  checkCurrent()
  const protectedResources = new Set<string>()
  const knowledgeBlockConflicts = new Set<string>()
  for (const mutation of unresolved) {
    protectedResources.add(resourceKey(mutation.resourceType, mutation.resourceId))
    if (mutation.resourceType === 'KNOWLEDGE_BLOCK' && mutation.mutationType === 'UPDATE'
      && ((mutation.status === 'conflict' && mutation.error === 'RESOURCE_VERSION_CONFLICT')
        || (mutation.status === 'error' && mutation.error === 'RESOURCE_NOT_FOUND'))) {
      knowledgeBlockConflicts.add(mutation.resourceId)
    }
    if (mutation.resourceType === 'TASK'
      && (mutation.mutationType === 'SCHEDULE_INSERTION'
        || mutation.mutationType === 'SCHEDULE_SWAP'
        || mutation.mutationType === 'SCHEDULE_UNSCHEDULE')) {
      const taskIds = mutation.payload._localAffectedTaskIds
      if (Array.isArray(taskIds)) {
        for (const taskId of taskIds) {
          if (typeof taskId === 'string') protectedResources.add(resourceKey('TASK', taskId))
        }
      }
    }
  }
  const changed = new Set<SyncResourceType>()
  for (const change of latestChangesByResource(changes)) {
    checkCurrent()
    if (protectedResources.has(resourceKey(change.resourceType, change.resourceId))
      && !(change.resourceType === 'KNOWLEDGE_BLOCK' && knowledgeBlockConflicts.has(change.resourceId))) continue
    const current = await repository.read(change.resourceType, change.resourceId)
    checkCurrent()
    const deletedAt = change.mutationType === 'DELETE'
      ? change.deletedAt ?? new Date().toISOString()
      : change.mutationType === 'RESTORE' ? null : change.deletedAt
    const applied = await repository.upsertFromSync(change.resourceType, change.resourceId, changeValue(change, current), {
      version: change.version,
      deletedAt,
      syncStatus: 'synced',
    })
    checkCurrent()
    if (applied) changed.add(change.resourceType)
  }
  return changed
}

async function settlePushResult(
  repository: SyncRepository,
  mutation: LocalMutation,
  result: SyncMutationResponse,
  checkCurrent: () => void,
): Promise<boolean> {
  checkCurrent()
  if (!result.decision || result.decision === 'PROCESSING' || result.mutationType !== mutation.mutationType) return false
  const status = result.decision === 'APPLIED' ? 'applied'
    : result.decision === 'CONFLICT' ? 'conflict' : 'error'
  const version = resourceVersion(result.current, -1)
  const settled = await repository.settleMutation({
    clientMutationId: mutation.clientMutationId,
    resourceType: mutation.resourceType,
    resourceId: mutation.resourceId,
    mutationType: mutation.mutationType,
    status,
    error: result.decision === 'APPLIED' ? undefined : result.code,
    remoteValue: result.current,
    remoteVersion: Number.isInteger(version) && version >= 0 ? version : undefined,
  })
  checkCurrent()
  return settled
}

function isScheduleMutation(mutation: LocalMutation | undefined): mutation is LocalMutation & { mutationType: 'SCHEDULE_INSERTION' | 'SCHEDULE_SWAP' | 'SCHEDULE_UNSCHEDULE' } {
  return mutation?.resourceType === 'TASK'
    && (mutation.mutationType === 'SCHEDULE_INSERTION'
      || mutation.mutationType === 'SCHEDULE_SWAP'
      || mutation.mutationType === 'SCHEDULE_UNSCHEDULE')
}

function scheduleResultItems(value: unknown): Array<{
  resourceType: SyncResourceType
  resourceId: string
  version: number
  deletedAt: string | null
  value: unknown
}> | null {
  if (!Array.isArray(value)) return null
  const items = []
  const ids = new Set<string>()
  for (const task of value) {
    if (!isRecord(task) || typeof task.id !== 'string' || !task.id
      || typeof task.version !== 'number' || !Number.isInteger(task.version) || task.version < 0
      || task.deletedAt !== undefined && task.deletedAt !== null && typeof task.deletedAt !== 'string'
      || ids.has(task.id)) return null
    ids.add(task.id)
    items.push({
      resourceType: 'TASK' as const,
      resourceId: task.id,
      version: task.version,
      deletedAt: typeof task.deletedAt === 'string' ? task.deletedAt : null,
      value: task,
    })
  }
  return items
}

async function settleSchedulePushResult(
  repository: SyncRepository,
  mutation: LocalMutation,
  result: SyncMutationResponse,
  checkCurrent: () => void,
  api: SyncApi,
  scope?: SyncRequestScopeTicket,
): Promise<{ scheduleApplied: number; scheduleError?: ScheduleSyncError } | null> {
  if (!result.clientMutationId || !result.decision || result.decision === 'PROCESSING') return null
  const expectedMutationType = mutation.mutationType === 'SCHEDULE_UNSCHEDULE' ? 'UPDATE' : mutation.mutationType
  if (result.resourceType !== 'TASK' || result.mutationType !== expectedMutationType) {
    throw new Error('SYNC_SCHEDULE_RESULT_INVALID')
  }
  const currentItems = mutation.mutationType === 'SCHEDULE_UNSCHEDULE' && isRecord(result.current) && !Array.isArray(result.current)
    ? [result.current]
    : result.current
  // Rejected TASK updates may omit the record. Recover the affected rows from the snapshot.
  const missingUnscheduleTask = mutation.mutationType === 'SCHEDULE_UNSCHEDULE'
    && result.resourceId === mutation.resourceId && result.current == null
    && (result.decision === 'REJECTED' || result.decision === 'CONFLICT')
  const items = missingUnscheduleTask ? [] : scheduleResultItems(currentItems)
  if (!items) throw new Error('SYNC_SCHEDULE_RESULT_INVALID')

  const applied = result.decision === 'APPLIED'
  const affectedIds = mutation.payload._localAffectedTaskIds
  const affectedTaskIds = Array.isArray(affectedIds)
    ? affectedIds.filter((id): id is string => typeof id === 'string')
    : []
  const responseIds = new Set(items.map((item) => item.resourceId))
  const responseMissesAffected = affectedTaskIds.some((id) => !responseIds.has(id))
  const queued = (await repository.listUnresolved('TASK')).filter((item) =>
    isScheduleMutation(item) && item.clientMutationId !== mutation.clientMutationId)
  checkCurrent()
  const expected = mutation.payload._localExpectedTasks
  const expectedTasks = Array.isArray(expected) ? expected.filter(isRecord) : []
  const expectedById = new Map(expectedTasks.map((item) => [item.id, item.value]))
  const predictionChanged = expectedTasks.length > 0 && (items.some((item) => {
    const before = expectedById.get(item.resourceId)
    if (!isRecord(before) || !isRecord(item.value)) return true
    const value = item.value
    return ['scheduledAt', 'dueAt', 'status', 'durationMinutes'].some((key) => {
      const normalize = (field: unknown) => {
        if (key === 'scheduledAt' || key === 'dueAt') {
          if (typeof field !== 'string') return null
          const timestamp = Date.parse(field)
          return Number.isFinite(timestamp) ? timestamp : field
        }
        return field ?? (key === 'durationMinutes' ? 30 : null)
      }
      return !Object.is(normalize(before[key]), normalize(value[key]))
    })
  }) || responseMissesAffected)
  // Keep the decision even when the queue currently looks empty: a local drop
  // can append while this response/snapshot is awaited. The repository checks
  // the complete affected set again inside its commit transaction.
  let cancelQueued = !applied || predictionChanged
  const recoveryIds = new Set([...affectedTaskIds,
    ...(cancelQueued ? queued.flatMap((item) => {
      const ids = item.payload._localAffectedTaskIds
      return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : []
    }) : []), ...items.map((item) => item.resourceId)])
  let snapshot: SyncSnapshotResponse | null = null
  let resolutionItems = items

  if (responseMissesAffected || cancelQueued && queued.length > 0) {
    // The mutation must remain unresolved until a complete authoritative Task
    // set is available. Otherwise a transient snapshot failure would make the
    // partial rejection terminal while leaving other optimistic rows in place.
    snapshot = await api.getSnapshot(scope)
    checkCurrent()
    const snapshotTasks = scheduleResultItems(snapshot.tasks)
    const snapshotTasksById = new Map((snapshotTasks ?? []).map((item) => [item.resourceId, item]))
    if (!snapshotTasks || [...recoveryIds].some((id) => !snapshotTasksById.has(id))) {
      throw new Error('SYNC_SCHEDULE_SNAPSHOT_INCOMPLETE')
    }
    resolutionItems = [...recoveryIds].map((id) => {
      const item = snapshotTasksById.get(id)
      if (!item) throw new Error('SYNC_SCHEDULE_SNAPSHOT_INCOMPLETE')
      return item
    })
    await repository.replaceSnapshotPreservingPending(snapshotItems(snapshot))
    checkCurrent()
  }

  let accepted: boolean
  let recoveredUnsafe = false
  try {
    accepted = await repository.resolveScheduleMutation({
      clientMutationId: mutation.clientMutationId,
      status: applied ? 'applied' : 'rejected',
      error: applied ? undefined : result.code ?? 'MUTATION_REJECTED',
      items: resolutionItems,
      cancelQueued,
    })
  } catch (error) {
    if (!(error instanceof Error) || error.message !== 'SCHEDULE_REFRESH_REQUIRED') throw error
    // A newer tombstone or ordinary local write can make the receipt unsafe.
    // Resolve it in this same cycle after obtaining recovery data, so later
    // CRUD receipts are not starved by replaying the immutable head forever.
    const pending = await repository.listUnresolved('TASK')
    for (const next of pending.filter(isScheduleMutation)) {
      const ids = next.payload._localAffectedTaskIds
      if (Array.isArray(ids)) for (const id of ids) if (typeof id === 'string') recoveryIds.add(id)
    }
    snapshot = await api.getSnapshot(scope)
    checkCurrent()
    const snapshotTasks = scheduleResultItems(snapshot.tasks)
    const byId = new Map((snapshotTasks ?? []).map((item) => [item.resourceId, item]))
    if (!snapshotTasks || [...recoveryIds].some((id) => !byId.has(id))) throw new Error('SYNC_SCHEDULE_SNAPSHOT_INCOMPLETE')
    resolutionItems = [...recoveryIds].map((id) => byId.get(id)!)
    await repository.replaceSnapshotPreservingPending(snapshotItems(snapshot))
    checkCurrent()
    cancelQueued = true
    accepted = await repository.resolveScheduleMutation({
      clientMutationId: mutation.clientMutationId, status: applied ? 'applied' : 'rejected',
      error: applied ? 'SCHEDULE_REFRESH_REQUIRED' : result.code ?? 'MUTATION_REJECTED',
      items: resolutionItems, cancelQueued: true, recoverySnapshot: true,
    })
    recoveredUnsafe = true
  }
  checkCurrent()

  const refreshRequired = !accepted || responseMissesAffected || cancelQueued && queued.length > 0 || recoveredUnsafe
  if (refreshRequired) {
    if (!snapshot) {
      snapshot = await api.getSnapshot(scope)
      checkCurrent()
      await repository.replaceSnapshotPreservingPending(snapshotItems(snapshot))
      checkCurrent()
    }
    // For incomplete mutation responses the snapshot was already merged while
    // this command was fenced as pending; persist its cursor only after the
    // complete affected Task set has been reconciled and the command resolved.
    await repository.saveCursor(snapshot.snapshotCursor, false)
    checkCurrent()
  }

  return {
    scheduleApplied: applied ? 1 : 0,
    ...(!applied || predictionChanged || recoveredUnsafe ? {
      scheduleError: { clientMutationId: mutation.clientMutationId, code: applied ? 'SCHEDULE_REFRESH_REQUIRED' : result.code ?? 'MUTATION_REJECTED' },
    } : {}),
  }
}

async function pullToCursor(
  repository: SyncRepository,
  api: SyncApi,
  scope: SyncRequestScopeTicket | undefined,
  checkCurrent: () => void,
): Promise<{ cursor: string | null; changedResourceTypes: Set<SyncResourceType> }> {
  checkCurrent()
  const state = await repository.getSyncState()
  checkCurrent()
  const changedResourceTypes = new Set<SyncResourceType>()
  if (state.resetRequired || state.cursor === null) {
    const snapshot = await api.getSnapshot(scope)
    checkCurrent()
    checkCurrent()
    await repository.replaceSnapshotPreservingPending(snapshotItems(snapshot))
    checkCurrent()
    await repository.saveCursor(snapshot.snapshotCursor, false)
    checkCurrent()
    return { cursor: snapshot.snapshotCursor, changedResourceTypes: new Set(SYNC_RESOURCE_TYPES) }
  }
  let cursor: string | null = state.cursor
  let hasMore = true
  while (hasMore) {
    checkCurrent()
    const response = await api.pullChanges({ ...(cursor ? { cursor } : {}), limit: 100 }, scope)
    checkCurrent()
    if (response.resetRequired) {
      const snapshot = await api.getSnapshot(scope)
      checkCurrent()
      await repository.replaceSnapshotPreservingPending(snapshotItems(snapshot))
      checkCurrent()
      await repository.saveCursor(snapshot.snapshotCursor, false)
      checkCurrent()
      return { cursor: snapshot.snapshotCursor, changedResourceTypes: new Set(SYNC_RESOURCE_TYPES) }
    }
    for (const resourceType of await applyPullPage(repository, response.changes, checkCurrent)) changedResourceTypes.add(resourceType)
    checkCurrent()
    const previousCursor = cursor
    cursor = response.nextCursor
    await repository.saveCursor(cursor, false)
    checkCurrent()
    hasMore = response.hasMore && cursor !== previousCursor
  }
  return { cursor, changedResourceTypes }
}

export async function runSyncCycle(input: SyncCycleInput): Promise<SyncCycleResult> {
  const checkCurrent = (): void => assertCurrent(input.isCurrent ?? input.scope?.isCurrent)
  checkCurrent()
  let claimed: LocalMutation[] = []
  let claimedScheduleIds: string[] = []
  const changedResourceTypes = new Set<SyncResourceType>()
  const rejectedTaskIds = new Set<string>()
  let ordinarySettled = 0
  let scheduleApplied = 0
  const scheduleErrors: ScheduleSyncError[] = []
  try {
    claimed = orderMutationsForPush(await input.repository.claimPending(200))
    claimedScheduleIds = claimed.filter(isScheduleMutation).map((mutation) => mutation.clientMutationId)
    checkCurrent()
    if (claimed.length > 0) {
      const pushed = await input.api.pushChanges({ serverDeviceId: input.serverDeviceId, mutations: claimed }, input.scope)
      checkCurrent()
      for (const result of pushed.results) {
        checkCurrent()
        const claimedMutation = result.clientMutationId
          ? claimed.find((mutation) => mutation.clientMutationId === result.clientMutationId)
          : undefined
        if (!claimedMutation) continue
        if (isScheduleMutation(claimedMutation)) {
          const scheduleResult = await settleSchedulePushResult(
            input.repository, claimedMutation, result, checkCurrent, input.api, input.scope,
          )
          if (scheduleResult) {
            scheduleApplied += scheduleResult.scheduleApplied
            if (scheduleResult.scheduleError) scheduleErrors.push(scheduleResult.scheduleError)
            if (input.onScheduleSettled) input.onScheduleSettled(scheduleResult.scheduleError)
            else changedResourceTypes.add('TASK')
          }
          continue
        }
        if (!result.resourceType || result.resourceType !== claimedMutation.resourceType
          || result.resourceId !== claimedMutation.resourceId) continue
        if (claimedMutation.resourceType === 'TASK' && claimedMutation.mutationType !== 'CREATE'
          && (result.decision === 'CONFLICT' || result.decision === 'REJECTED')
          && result.mutationType === claimedMutation.mutationType) {
          const isNotFoundOrDeleted = result.code === 'RESOURCE_NOT_FOUND' || result.code === 'RESOURCE_DELETED'
          if (result.decision === 'REJECTED' && !isNotFoundOrDeleted) {
            rejectedTaskIds.add(claimedMutation.resourceId)
          }
          if (!isNotFoundOrDeleted && input.repository.resolveRejectedTaskMutation) {
            const [currentRow, unresolvedForTask] = await Promise.all([
              input.repository.read('TASK', claimedMutation.resourceId),
              input.repository.listUnresolved('TASK'),
            ])
            checkCurrent()
            const inlineSnapshot = asTaskConflictSnapshot(result.current, claimedMutation.resourceId)
            const canConvergeInlineCode = (result.decision === 'CONFLICT' && result.code === 'RESOURCE_VERSION_CONFLICT')
              || (result.decision === 'REJECTED' && result.code === 'MUTATION_REJECTED')
            const hasInlineConvergence = Boolean(
              canConvergeInlineCode && inlineSnapshot && inlineSnapshot.version >= (currentRow?.version ?? 0),
            )
            const hasQueuedSuccessor = unresolvedForTask.some(
              (item) => item.resourceId === claimedMutation.resourceId && item.clientMutationId !== claimedMutation.clientMutationId,
            )
            if (!hasInlineConvergence && !hasQueuedSuccessor) {
              const snapshot = await input.api.getSnapshot(input.scope)
              checkCurrent()
              const items = snapshotItems(snapshot)
              const snapshotTask = items.find(
                (item) => item.resourceType === 'TASK' && item.resourceId === claimedMutation.resourceId,
              ) ?? null
              const reconciled = await input.repository.resolveRejectedTaskMutation({
                clientMutationId: claimedMutation.clientMutationId,
                error: result.code ?? 'MUTATION_REJECTED',
                snapshotTask,
              })
              checkCurrent()
              if (reconciled) {
                ordinarySettled += 1
                await input.repository.replaceSnapshotPreservingPending(items)
                checkCurrent()
                await input.repository.saveCursor(snapshot.snapshotCursor, false)
                checkCurrent()
                for (const type of SYNC_RESOURCE_TYPES) changedResourceTypes.add(type)
              }
              continue
            }
          }
        }
        if (!await settlePushResult(input.repository, claimedMutation, result, checkCurrent)) continue
        ordinarySettled += 1
        if (result.decision === 'APPLIED' || result.resourceType === 'TASK' || (result.resourceType === 'KNOWLEDGE_BLOCK'
          && (claimedMutation.mutationType === 'UPDATE' || claimedMutation.mutationType === 'DELETE'))) {
          changedResourceTypes.add(result.resourceType)
        }
        const rejectedSubjectDelete = claimedMutation.resourceType === 'SUBJECT'
          && claimedMutation.mutationType === 'DELETE'
          && result.decision !== 'APPLIED'
          && result.decision !== 'PROCESSING'
        if (rejectedSubjectDelete && input.repository.resolveRejectedSubjectDelete) {
          checkCurrent()
          const restored = await input.repository.resolveRejectedSubjectDelete({
            clientMutationId: claimedMutation.clientMutationId,
            remoteValue: result.current,
            remoteVersion: resourceVersion(result.current, claimedMutation.baseVersion),
          })
          checkCurrent()
          if (restored) {
            // A rejected parent cascade must be reconciled from a fresh server
            // snapshot. This repopulates remote children and prevents startup
            // hydration from immediately re-tombstoning the restored Subject.
            const snapshot = await input.api.getSnapshot(input.scope)
            checkCurrent()
            await input.repository.replaceSnapshotPreservingPending(snapshotItems(snapshot))
            checkCurrent()
            await input.repository.saveCursor(snapshot.snapshotCursor, false)
            checkCurrent()
            changedResourceTypes.add('SUBJECT')
            changedResourceTypes.add('SOURCE')
            changedResourceTypes.add('KNOWLEDGE_BLOCK')
            changedResourceTypes.add('TASK')
            changedResourceTypes.add('RELATION')
          }
        }
      }
    }
  } catch (error) {
    if (claimedScheduleIds.length > 0) await input.repository.releaseInflight(claimedScheduleIds)
    throw error
  }
  let pulled: { cursor: string | null; changedResourceTypes: Set<SyncResourceType> }
  try {
    pulled = await pullToCursor(input.repository, input.api, input.scope, checkCurrent)
  } catch (error) {
    const isCurrent = input.isCurrent ?? input.scope?.isCurrent
    if (claimedScheduleIds.length > 0 && isCurrent && !isCurrent()) {
      await input.repository.releaseInflight(claimedScheduleIds)
    }
    throw error
  }
  checkCurrent()
  for (const resourceType of pulled.changedResourceTypes) changedResourceTypes.add(resourceType)
  return {
    changedResourceTypes,
    cursor: pulled.cursor,
    ordinarySettled,
    scheduleApplied,
    scheduleErrors,
    rejectedTaskIds: [...rejectedTaskIds],
  }
}
