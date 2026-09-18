import type { LocalEntity, LocalMutation } from '@/types/api'
import type { LocalRepository } from '@/services/localRepository'
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
  | 'listUnresolved' | 'read' | 'upsert' | 'replaceSnapshotPreservingPending'>
  & Partial<Pick<LocalRepository, 'resolveRejectedSubjectDelete'>>

type SyncApi = {
  pushChanges(input: { serverDeviceId: string; mutations: LocalMutation[] }): Promise<SyncPushResponse>
  pullChanges(input: { cursor?: string; limit: number }): Promise<SyncPullResponse>
  getSnapshot(): Promise<SyncSnapshotResponse>
}

export interface SyncCycleInput {
  repository: SyncRepository
  api: SyncApi
  serverDeviceId: string
}

export interface SyncCycleResult {
  changedResourceTypes: ReadonlySet<SyncResourceType>
  cursor: string | null
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

export async function applyPullPage(repository: SyncRepository, changes: SyncChange[]): Promise<Set<SyncResourceType>> {
  const unresolved = await repository.listUnresolved()
  const protectedResources = new Set(unresolved.map((mutation) => resourceKey(mutation.resourceType, mutation.resourceId)))
  const changed = new Set<SyncResourceType>()
  for (const change of latestChangesByResource(changes)) {
    if (protectedResources.has(resourceKey(change.resourceType, change.resourceId))) continue
    const current = await repository.read(change.resourceType, change.resourceId)
    const deletedAt = change.mutationType === 'DELETE'
      ? change.deletedAt ?? new Date().toISOString()
      : change.mutationType === 'RESTORE' ? null : change.deletedAt
    await repository.upsert(change.resourceType, change.resourceId, changeValue(change, current), {
      version: change.version,
      deletedAt,
      syncStatus: 'synced',
    })
    changed.add(change.resourceType)
  }
  return changed
}

async function settlePushResult(
  repository: SyncRepository,
  result: SyncMutationResponse,
): Promise<SyncResourceType | null> {
  if (!result.clientMutationId || !result.decision || result.decision === 'PROCESSING') return null
  const status = result.decision === 'APPLIED' ? 'applied'
    : result.decision === 'CONFLICT' ? 'conflict' : 'error'
  await repository.settleMutation({
    clientMutationId: result.clientMutationId,
    status,
    error: result.decision === 'APPLIED' ? undefined : result.code,
    remoteValue: result.current,
    remoteVersion: resourceVersion(result.current, 0),
  })
  if (result.decision !== 'APPLIED' || !result.resourceType || !result.resourceId || !SYNC_RESOURCE_TYPES.has(result.resourceType)) return null

  const unresolved = await repository.listUnresolved()
  if (unresolved.some((mutation) => mutation.resourceType === result.resourceType && mutation.resourceId === result.resourceId)) {
    return result.resourceType
  }
  if (result.current === undefined) return result.resourceType
  const current = await repository.read(result.resourceType, result.resourceId)
  await repository.upsert(result.resourceType, result.resourceId, result.current, {
    version: resourceVersion(result.current, current?.version ?? 0),
    deletedAt: isRecord(result.current) && typeof result.current.deletedAt === 'string' ? result.current.deletedAt : current?.deletedAt ?? null,
    syncStatus: 'synced',
  })
  return result.resourceType
}

async function pullToCursor(repository: SyncRepository, api: SyncApi): Promise<{ cursor: string | null; changedResourceTypes: Set<SyncResourceType> }> {
  const state = await repository.getSyncState()
  const changedResourceTypes = new Set<SyncResourceType>()
  if (state.resetRequired) {
    const snapshot = await api.getSnapshot()
    await repository.replaceSnapshotPreservingPending(snapshotItems(snapshot))
    await repository.saveCursor(snapshot.snapshotCursor, false)
    return { cursor: snapshot.snapshotCursor, changedResourceTypes }
  }
  let cursor = state.cursor
  let hasMore = true
  while (hasMore) {
    const response = await api.pullChanges({ ...(cursor ? { cursor } : {}), limit: 100 })
    if (response.resetRequired) {
      const snapshot = await api.getSnapshot()
      await repository.replaceSnapshotPreservingPending(snapshotItems(snapshot))
      await repository.saveCursor(snapshot.snapshotCursor, false)
      return { cursor: snapshot.snapshotCursor, changedResourceTypes }
    }
    for (const resourceType of await applyPullPage(repository, response.changes)) changedResourceTypes.add(resourceType)
    const previousCursor = cursor
    cursor = response.nextCursor
    await repository.saveCursor(cursor, false)
    hasMore = response.hasMore && cursor !== previousCursor
  }
  return { cursor, changedResourceTypes }
}

export async function runSyncCycle(input: SyncCycleInput): Promise<SyncCycleResult> {
  const claimed = orderMutationsForPush(await input.repository.claimPending(200))
  const changedResourceTypes = new Set<SyncResourceType>()
  try {
    if (claimed.length > 0) {
      const pushed = await input.api.pushChanges({ serverDeviceId: input.serverDeviceId, mutations: claimed })
      for (const result of pushed.results) {
        const claimedMutation = result.clientMutationId
          ? claimed.find((mutation) => mutation.clientMutationId === result.clientMutationId)
          : undefined
        const resourceType = await settlePushResult(input.repository, result)
        if (resourceType) changedResourceTypes.add(resourceType)
        const rejectedSubjectDelete = claimedMutation?.resourceType === 'SUBJECT'
          && claimedMutation.mutationType === 'DELETE'
          && result.decision !== 'APPLIED'
          && result.decision !== 'PROCESSING'
        if (rejectedSubjectDelete && input.repository.resolveRejectedSubjectDelete) {
          const restored = await input.repository.resolveRejectedSubjectDelete({
            clientMutationId: claimedMutation.clientMutationId,
            remoteValue: result.current,
            remoteVersion: resourceVersion(result.current, claimedMutation.baseVersion),
          })
          if (restored) {
            // A rejected parent cascade must be reconciled from a fresh server
            // snapshot. This repopulates remote children and prevents startup
            // hydration from immediately re-tombstoning the restored Subject.
            const snapshot = await input.api.getSnapshot()
            await input.repository.replaceSnapshotPreservingPending(snapshotItems(snapshot))
            await input.repository.saveCursor(snapshot.snapshotCursor, false)
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
    await input.repository.releaseInflight(claimed.map((mutation) => mutation.clientMutationId))
    throw error
  }
  const pulled = await pullToCursor(input.repository, input.api)
  for (const resourceType of pulled.changedResourceTypes) changedResourceTypes.add(resourceType)
  return { changedResourceTypes, cursor: pulled.cursor }
}
