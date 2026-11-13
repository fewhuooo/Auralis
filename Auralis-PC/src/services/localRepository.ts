import type {
  LocalEntity,
  LocalMutation,
  LocalMutationStatus,
  LocalSyncStatus,
} from '@/types/api'
import type { KnowledgeBlockView } from '@/api/useKnowledgeApi'
import {
  createVersionedLocalSchema,
  documentProcessingJobFromRow,
  LOCAL_SCHEMA_VERSION,
  mutationFromRow,
  normalizeDocumentJobCheckpoint,
  resourceFromRow,
  sanitizeDocumentCacheReceipt,
  type DocumentProcessingJobRow,
  type LocalMutationRow,
  type LocalResourceRow,
  type LocalSqlDatabase,
} from '@/services/localSchema'
import {
  backupLegacyUnassignedData,
  getLegacyUnassignedBackup,
  type LegacyUnassignedBackup,
  type LocalStorageLike,
} from '@/services/legacyLocalData'
import { DOCUMENT_JOB_PHASES, type CreateDocumentProcessingJobInput, type DocumentJobPhase, type DocumentJobTransitionOptions, type DocumentProcessingJob } from '@/types/documentProcessing'
import { withLocalAssetLifecycleLock } from '@/services/localAssetLifecycleLock'

export type LocalResourceKey = { resourceType: string; resourceId: string }

export interface LocalWriteOptions {
  version?: number
  baseVersion?: number
  deletedAt?: string | null
  syncStatus?: LocalSyncStatus
}

export interface LocalListOptions {
  includeDeleted?: boolean
}

export interface LocalSnapshotItem<T = unknown> extends LocalResourceKey {
  version: number
  deletedAt: string | null
  value: T
}

export interface LocalCommitInput<T = unknown> extends LocalResourceKey {
  value: T
  version: number
  deletedAt: string | null
  expectedLocalVersion?: number
  rejectIfNonPendingMutation?: boolean
  requireActiveResource?: boolean
  mutation: LocalMutationInput
}

export interface LocalScheduleBatchCommitInput<T = unknown> {
  items: Array<Omit<LocalCommitInput<T>, 'mutation'>>
  mutation: LocalMutationInput
  expectedScheduleState?: string
}

export interface LocalScheduleMutationResolution {
  clientMutationId: string
  status: 'applied' | 'rejected'
  error?: string
  items: readonly LocalSnapshotItem[]
  /** A complete authoritative snapshot is supplied before cancelling queued intentions. */
  cancelQueued?: boolean
  recoverySnapshot?: boolean
}

export interface LocalSubjectCascadeResource extends LocalEntity<unknown> {
  resourceType: 'SOURCE' | 'KNOWLEDGE_BLOCK' | 'TASK' | 'RELATION'
}

export interface LocalMutationSettlement extends LocalResourceKey {
  clientMutationId: string
  mutationType: LocalMutation['mutationType']
  status: Extract<LocalMutationStatus, 'applied' | 'conflict' | 'error'>
  error?: string
  remoteValue?: unknown
  remoteVersion?: number
}

export interface KnowledgeBlockConflictResolution {
  blockId: string
  clientMutationId: string
  local: KnowledgeBlockView
  remote: KnowledgeBlockView & { id: string; version: number; deletedAt?: string | null }
  retryId?: string
}

export interface LocalMutationInput extends LocalResourceKey {
  clientMutationId: string
  mutationType: LocalMutation['mutationType']
  baseVersion?: number
  payload: Record<string, unknown>
  createdAt?: string
}

export interface LocalSyncState {
  cursor: string | null
  resetRequired: boolean
  schemaVersion: number
}

export interface LocalRepositoryOptions {
  storage?: LocalStorageLike
  sql?: LocalSqlDatabase
  /** Resolves when the owning database facade has already created the current schema. */
  schemaReady?: Promise<void>
  now?: () => string
  idFactory?: () => string
}

export class LocalConflictError extends Error {
  readonly code = 'LOCAL_VERSION_CONFLICT'
  readonly resource: LocalEntity<unknown> | null
  readonly blockedByMutation: boolean

  constructor(resource: LocalEntity<unknown> | null, message = 'Local version conflict', blockedByMutation = false) {
    super(message)
    this.name = 'LocalConflictError'
    this.resource = resource
    this.blockedByMutation = blockedByMutation
  }
}

export function createMemoryStorage(): LocalStorageLike {
  const values = new Map<string, string>()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
    key: (index) => Array.from(values.keys())[index] ?? null,
    get length() {
      return values.size
    },
  }
}

function browserStorage(): LocalStorageLike | undefined {
  if (typeof window === 'undefined' || !window.localStorage) return undefined
  return window.localStorage
}

function clone<T>(value: T): T {
  if (value === undefined || value === null) return value
  return JSON.parse(JSON.stringify(value)) as T
}

function encodePart(value: string): string {
  return encodeURIComponent(value).replace(/%/g, '_')
}

function resourceKey(resourceType: string, resourceId: string): string {
  return `${resourceType}\u0000${resourceId}`
}

function isScheduleCommand(mutation: Pick<LocalMutation, 'mutationType'>): boolean {
  return mutation.mutationType === 'SCHEDULE_INSERTION'
    || mutation.mutationType === 'SCHEDULE_SWAP'
    || mutation.mutationType === 'SCHEDULE_UNSCHEDULE'
}

function isUnresolved(mutation: Pick<LocalMutation, 'status'>): boolean {
  return ['pending', 'inflight', 'conflict', 'error'].includes(mutation.status)
}

function isKnowledgeBlockUpdateConflict(mutation: LocalMutation): boolean {
  return mutation.resourceType === 'KNOWLEDGE_BLOCK' && mutation.mutationType === 'UPDATE'
    && ((mutation.status === 'conflict' && mutation.error === 'RESOURCE_VERSION_CONFLICT')
      || (mutation.status === 'error' && mutation.error === 'RESOURCE_NOT_FOUND'
        && Boolean(asKnowledgeBlockConflictSnapshot(mutation.remoteValue, mutation.resourceId)?.deletedAt)))
}

function canCaptureKnowledgeBlockConflict(mutation: LocalMutation, deletedAt: string | null): boolean {
  return isKnowledgeBlockUpdateConflict(mutation) || Boolean(deletedAt && mutation.resourceType === 'KNOWLEDGE_BLOCK'
    && mutation.mutationType === 'UPDATE' && mutation.status === 'error' && mutation.error === 'RESOURCE_NOT_FOUND')
}

function mutationOrder(left: LocalMutation, right: LocalMutation): number {
  return left.createdAt.localeCompare(right.createdAt) || left.clientMutationId.localeCompare(right.clientMutationId)
}

function prepareCrudMutation(mutation: LocalMutation, queue: LocalMutation[], checkedLocalVersion: boolean): LocalMutation {
  const referencedIds = new Set(queue.map((item) => item.payload._localCrudPredecessor))
  const tail = queue.filter((item) => !referencedIds.has(item.clientMutationId))
    .sort((left, right) => Number(right.status === 'pending') - Number(left.status === 'pending')
      || mutationOrder(right, left))[0]
  if (tail?.status === 'pending' && tail.payload._localCrudPredecessor !== undefined
    && (tail.baseVersion === mutation.baseVersion || checkedLocalVersion && tail.baseVersion < mutation.baseVersion)
    && (tail.mutationType === 'CREATE' && mutation.mutationType === 'UPDATE'
      || tail.mutationType === 'UPDATE' && ['UPDATE', 'DELETE'].includes(mutation.mutationType))) {
    if ('baseVersion' in mutation.payload) mutation.payload.baseVersion = tail.baseVersion
    return { ...tail, mutationType: tail.mutationType === 'CREATE' ? 'CREATE' : mutation.mutationType,
      payload: { ...mutation.payload, _localCrudPredecessor: tail.payload._localCrudPredecessor } }
  }
  // Presence marks a request as never claimed. A reference records local commit order, even within one clock tick.
  mutation.payload._localCrudPredecessor = tail?.clientMutationId ?? null
  return mutation
}

function advanceCrudVersion<T>(mutation: LocalMutation, resource: LocalEntity<T>, version: number): void {
  mutation.baseVersion = version
  if ('baseVersion' in mutation.payload) mutation.payload.baseVersion = version
  resource.version = version
  if (resource.value && typeof resource.value === 'object' && 'version' in resource.value) {
    resource.value = { ...resource.value, version }
  }
}

function isOwnReceiptBaseline<T>(current: LocalEntity<T> | null, input: LocalCommitInput<T>, mutation: LocalMutation): current is LocalEntity<T> {
  return current?.syncStatus === 'synced' && current.deletedAt === null && input.expectedLocalVersion === undefined
    && mutation.mutationType !== 'CREATE' && current.version > input.version && input.version === mutation.baseVersion
}

function projectCrudSettlement(
  input: LocalMutationSettlement,
  mutation: LocalMutation,
  unresolved: LocalMutation[],
  current: LocalEntity<unknown> | null,
): { resource: LocalEntity<unknown> | null; successor?: LocalMutation; archiveRejection?: boolean } {
  const statuses = unresolved.map((item) => item.status)
  const syncStatus: LocalSyncStatus = statuses.includes('pending') || statuses.includes('inflight')
    ? 'pending' : statuses.includes('conflict') ? 'conflict' : statuses.includes('error') ? 'error' : 'synced'
  const resource = current && { ...current, syncStatus }
  const version = input.remoteVersion
  const value = input.remoteValue
  if (mutation.resourceType === 'KNOWLEDGE_BLOCK' && mutation.mutationType === 'DELETE'
    && unresolved.length === 0 && current?.deletedAt && current.version === mutation.baseVersion) {
    if (input.status === 'error' && input.error === 'RESOURCE_NOT_FOUND') {
      return { resource: { ...current, syncStatus: 'synced' }, archiveRejection: true }
    }
    if (input.status === 'conflict' && input.error === 'RESOURCE_VERSION_CONFLICT') {
      const remote = asKnowledgeBlockConflictSnapshot(value, mutation.resourceId)
      if (remote && remote.version === version && version > current.version) {
        return { resource: { ...current, value: remote, version, deletedAt: remote.deletedAt ?? null, syncStatus: 'synced' },
          archiveRejection: true }
      }
    }
  }
  if (input.status !== 'applied' || version === undefined || !value || typeof value !== 'object'
    || Array.isArray(value) || version < (current?.version ?? 0)) return { resource }

  const deletedAt = 'deletedAt' in value && typeof value.deletedAt === 'string' ? value.deletedAt : null
  if (unresolved.length === 0) {
    if (current?.deletedAt && deletedAt === null && mutation.mutationType !== 'RESTORE') return { resource }
    return { resource: { id: mutation.resourceId, resourceType: mutation.resourceType, userId: mutation.userId,
      version, deletedAt, syncStatus, value } }
  }

  const successor = unresolved.find((item) => item.status === 'pending' && item.mutationType !== 'CREATE'
    && item.payload._localCrudPredecessor === mutation.clientMutationId && item.baseVersion === mutation.baseVersion)
  if (!resource || resource.version !== mutation.baseVersion || !successor) return { resource }
  advanceCrudVersion(successor, resource, version)
  return { resource, successor }
}

export function asKnowledgeBlockConflictSnapshot(
  value: unknown, blockId: string,
): KnowledgeBlockConflictResolution['remote'] | null {
  const block = value as KnowledgeBlockConflictResolution['remote'] | null | undefined
  return block?.id === blockId && typeof block.subjectId === 'string' && typeof block.title === 'string'
    && typeof block.content === 'string' && typeof block.version === 'number' && Number.isSafeInteger(block.version)
    && block.version >= 0 ? { ...block, id: block.id, version: block.version } : null
}

function projectKnowledgeBlockConflictResolution(
  input: KnowledgeBlockConflictResolution, unresolved: LocalMutation[], current: LocalEntity<KnowledgeBlockView> | null,
): LocalEntity<KnowledgeBlockView> {
  const selected = unresolved.find((mutation) => mutation.clientMutationId === input.clientMutationId)
  const remote = asKnowledgeBlockConflictSnapshot(input.remote, input.blockId)
  const selectedSnapshot = selected && asKnowledgeBlockConflictSnapshot(selected.remoteValue, input.blockId)
  if (!current || current.deletedAt || !selected || selected.remoteVersion === undefined
    || !remote || remote.version < selected.remoteVersion || remote.version < current.version
    || (remote.deletedAt && (input.retryId || selectedSnapshot?.deletedAt !== remote.deletedAt
      || selectedSnapshot?.version !== remote.version))
    || JSON.stringify(current.value) !== JSON.stringify(input.local)
    || unresolved.some((mutation) => !isKnowledgeBlockUpdateConflict(mutation))) {
    throw new LocalConflictError(current, '知识块状态已变化，请刷新后再处理同步冲突。')
  }
  const value = input.retryId ? {
    ...remote, title: current.value.title, content: current.value.content,
    colorOverride: current.value.colorOverride, updatedAt: current.value.updatedAt,
  } : remote
  return { ...current, value, version: remote.version, deletedAt: remote.deletedAt ?? null,
    syncStatus: input.retryId ? 'pending' : 'synced' }
}

/** Detect optimistic schedule edits too: they intentionally retain server versions. */
export function taskScheduleState(rows: ReadonlyArray<Pick<LocalEntity<unknown>, 'id' | 'version' | 'deletedAt' | 'value'>>): string {
  const instant = (value: unknown) => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? Date.parse(value) : value ?? null
  return JSON.stringify(rows.filter((row) => row.deletedAt === null).map((row) => {
    const value = row.value as Record<string, unknown>
    return [row.id, row.version, value.status, instant(value.scheduledAt), instant(value.dueAt), value.durationMinutes ?? 30]
  }).sort((left, right) => String(left[0]).localeCompare(String(right[0]))))
}

interface StoredBrowserState {
  resources: Array<LocalEntity<unknown>>
  mutations: LocalMutation[]
  sync: LocalSyncState
}

const DEFAULT_SYNC_STATE: LocalSyncState = {
  cursor: null,
  resetRequired: false,
  schemaVersion: LOCAL_SCHEMA_VERSION,
}

export class LocalRepository {
  readonly userId: string
  readonly serverDeviceId: string

  private readonly storage: LocalStorageLike
  private readonly sql?: LocalSqlDatabase
  private readonly schemaReady?: Promise<void>
  private readonly now: () => string
  private readonly idFactory: () => string
  private readonly namespace: string
  private sqlReady: Promise<void> | null = null

  constructor(userId: string, serverDeviceId: string, options: LocalRepositoryOptions = {}) {
    if (!userId.trim()) throw new Error('LocalRepository requires a userId')
    if (!serverDeviceId.trim()) throw new Error('LocalRepository requires a serverDeviceId')
    if (options.sql && options.storage) {
      throw new Error('LocalRepository accepts either sql or storage, not both')
    }
    this.userId = userId
    this.serverDeviceId = serverDeviceId
    this.sql = options.sql
    this.schemaReady = options.schemaReady
    this.storage = options.storage ?? browserStorage() ?? createMemoryStorage()
    this.now = options.now ?? (() => new Date().toISOString())
    this.idFactory = options.idFactory ?? (() => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`)
    this.namespace = `auralis:v2:${encodePart(userId)}:${encodePart(serverDeviceId)}`
  }

  private async ensureSql(): Promise<void> {
    if (!this.sql) return
    if (!this.sqlReady) {
      this.sqlReady = this.schemaReady ?? createVersionedLocalSchema(this.sql)
    }
    await this.sqlReady
  }

  private stateKey(): string {
    return `${this.namespace}:state`
  }

  private readBrowserState(): StoredBrowserState {
    const raw = this.storage.getItem(this.stateKey())
    if (!raw) {
      return { resources: [], mutations: [], sync: { ...DEFAULT_SYNC_STATE } }
    }
    try {
      const parsed = JSON.parse(raw) as Partial<StoredBrowserState>
      return {
        resources: Array.isArray(parsed.resources) ? parsed.resources : [],
        mutations: Array.isArray(parsed.mutations) ? parsed.mutations : [],
        sync: { ...DEFAULT_SYNC_STATE, ...(parsed.sync ?? {}) },
      }
    } catch {
      return { resources: [], mutations: [], sync: { ...DEFAULT_SYNC_STATE } }
    }
  }

  private writeBrowserState(state: StoredBrowserState): void {
    this.storage.setItem(this.stateKey(), JSON.stringify(state))
  }

  private withBrowserStateLock<T>(operation: () => Promise<T> | T): Promise<T> {
    // The browser fallback stores one whole repository state; every read-modify-write requires the same cross-tab lock.
    if (typeof window === 'undefined') return Promise.resolve().then(operation)
    const locks = typeof navigator === 'undefined' ? undefined : navigator.locks
    if (!locks) {
      return Promise.reject(Object.assign(
        new Error('Browser local storage writes require the Web Locks API'),
        { code: 'LOCAL_STORAGE_LOCK_UNAVAILABLE' },
      ))
    }
    return locks.request(`${this.namespace}:repository-state`, { mode: 'exclusive' }, async () => operation())
  }

  private async readSql<T>(resourceType: string, resourceId: string): Promise<LocalEntity<T> | null> {
    await this.ensureSql()
    const rows = await this.sql!.select<LocalResourceRow>(
      `SELECT resource_id, resource_type, user_id, version, deleted_at, sync_status, payload
       FROM local_resource_records
       WHERE user_id = $1 AND resource_type = $2 AND resource_id = $3`,
      [this.userId, resourceType, resourceId],
    )
    return rows[0] ? resourceFromRow<T>(rows[0]) : null
  }

  private async runSqlTransaction<T>(operation: (transaction: LocalSqlDatabase) => Promise<T>): Promise<T> {
    await this.ensureSql()
    const database = this.sql!
    if (database.transaction) return database.transaction(operation)
    await database.execute('BEGIN IMMEDIATE')
    try {
      const result = await operation(database)
      await database.execute('COMMIT')
      return result
    } catch (error) {
      await database.execute('ROLLBACK')
      throw error
    }
  }

  private mutationFromInput(input: LocalMutationInput): LocalMutation {
    return {
      clientMutationId: input.clientMutationId || this.idFactory(),
      userId: this.userId,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      mutationType: input.mutationType,
      baseVersion: input.baseVersion ?? 0,
      payload: clone(input.payload),
      createdAt: input.createdAt ?? this.now(),
      status: 'pending',
    }
  }

  private localScheduleAffectedIds(mutation: Pick<LocalMutation, 'mutationType' | 'payload'>): string[] {
    if (mutation.mutationType !== 'SCHEDULE_INSERTION' && mutation.mutationType !== 'SCHEDULE_SWAP' && mutation.mutationType !== 'SCHEDULE_UNSCHEDULE') return []
    const ids = mutation.payload?._localAffectedTaskIds
    return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : []
  }

  private async assertNoScheduleFence(database: LocalSqlDatabase, taskIds: readonly string[]): Promise<void> {
    if (taskIds.length === 0) return
    const rows = await database.select<LocalMutationRow>(
      `SELECT client_mutation_id, user_id, resource_type, resource_id, mutation_type, base_version,
              payload, status, created_at, error, in_flight_at, remote_payload, remote_version
       FROM local_mutations
       WHERE user_id = $1 AND resource_type = 'TASK'
         AND mutation_type IN ('SCHEDULE_INSERTION', 'SCHEDULE_SWAP', 'SCHEDULE_UNSCHEDULE')
         AND status IN ('pending', 'inflight', 'conflict', 'error')`,
      [this.userId],
    )
    const taskSet = new Set(taskIds)
    for (const row of rows) {
      const mutation = mutationFromRow(row)
      if (this.localScheduleAffectedIds(mutation).some((id) => taskSet.has(id))) {
        throw new LocalConflictError(null, `Task schedule is waiting to sync for ${mutation.clientMutationId}`)
      }
    }
  }

  private assertNoScheduleFenceInBrowser(state: StoredBrowserState, taskIds: readonly string[]): void {
    if (taskIds.length === 0) return
    const taskSet = new Set(taskIds)
    const mutation = state.mutations.find((item) => item.userId === this.userId
      && item.resourceType === 'TASK'
      && ['pending', 'inflight', 'conflict', 'error'].includes(item.status)
      && this.localScheduleAffectedIds(item).some((id) => taskSet.has(id)))
    if (mutation) throw new LocalConflictError(null, `Task schedule is waiting to sync for ${mutation.clientMutationId}`)
  }

  async read<T>(resourceType: string, resourceId: string): Promise<LocalEntity<T> | null> {
    if (this.sql) return this.readSql<T>(resourceType, resourceId)
    const state = this.readBrowserState()
    const found = state.resources.find(
      (item) => item.userId === this.userId && item.resourceType === resourceType && item.id === resourceId,
    )
    return found ? clone(found) as LocalEntity<T> : null
  }

  async list<T = unknown>(resourceType?: string, options: LocalListOptions = {}): Promise<LocalEntity<T>[]> {
    const includeDeleted = options.includeDeleted ?? true
    if (this.sql) {
      await this.ensureSql()
      const clauses = ['user_id = $1']
      const params: unknown[] = [this.userId]
      if (resourceType) {
        clauses.push(`resource_type = $${params.length + 1}`)
        params.push(resourceType)
      }
      if (!includeDeleted) clauses.push('deleted_at IS NULL')
      const rows = await this.sql.select<LocalResourceRow>(
        `SELECT resource_id, resource_type, user_id, version, deleted_at, sync_status, payload
         FROM local_resource_records WHERE ${clauses.join(' AND ')}
         ORDER BY resource_type ASC, resource_id ASC`,
        params,
      )
      return rows.map((row) => resourceFromRow<T>(row))
    }
    const state = this.readBrowserState()
    return state.resources
      .filter((item) => item.userId === this.userId)
      .filter((item) => !resourceType || item.resourceType === resourceType)
      .filter((item) => includeDeleted || item.deletedAt === null)
      .map((item) => clone(item) as LocalEntity<T>)
  }

  private assertBaseVersion(
    existing: LocalEntity<unknown> | null,
    baseVersion: number | undefined,
    resourceType: string,
    resourceId: string,
  ): void {
    if (baseVersion === undefined) return
    const currentVersion = existing?.version ?? 0
    if (baseVersion !== currentVersion) {
      throw new LocalConflictError(
        existing,
        `${resourceType}/${resourceId} expected baseVersion ${baseVersion}, current version is ${currentVersion}`,
      )
    }
  }

  async upsert<T>(
    resourceType: string,
    resourceId: string,
    value: T,
    options: LocalWriteOptions = {},
  ): Promise<LocalEntity<T>> {
    if (resourceType === 'SOURCE') {
      return withLocalAssetLifecycleLock(this.userId, this.serverDeviceId, () =>
        this.upsertInternal(resourceType, resourceId, value, options))
    }
    return this.upsertInternal(resourceType, resourceId, value, options)
  }

  async upsertFromSync<T>(
    resourceType: string,
    resourceId: string,
    value: T,
    options: { version: number; deletedAt: string | null; syncStatus: 'synced' },
  ): Promise<boolean> {
    if (resourceType === 'SOURCE') {
      return withLocalAssetLifecycleLock(this.userId, this.serverDeviceId, () =>
        this.upsertFromSyncInternal(resourceType, resourceId, value, options))
    }
    return this.upsertFromSyncInternal(resourceType, resourceId, value, options)
  }

  /**
   * Applies a set of server-committed resource values as one local commit.
   * Existing unresolved local mutations fence the whole batch so a remote
   * response cannot overwrite a newer offline projection.
   */
  async upsertSyncedBatch<T>(items: readonly LocalSnapshotItem<T>[]): Promise<boolean> {
    if (items.length === 0) return true
    const keys = items.map((item) => resourceKey(item.resourceType, item.resourceId))
    if (new Set(keys).size !== keys.length) throw new Error('Synced batch contains duplicate resources')

    if (this.sql) {
      return this.runSqlTransaction(async (database) => {
        const resourcePredicates = items.map((_, index) =>
          `(resource_type = $${index * 2 + 2} AND resource_id = $${index * 2 + 3})`)
        const unresolved = await database.select<Pick<LocalMutationRow, 'resource_type' | 'resource_id'>>(
          `SELECT resource_type, resource_id FROM local_mutations
           WHERE user_id = $1 AND status IN ('pending', 'inflight', 'conflict', 'error')
             AND (${resourcePredicates.join(' OR ')})`,
          [this.userId, ...items.flatMap((item) => [item.resourceType, item.resourceId])],
        )
        if (unresolved.length > 0) return false

        const currentRows = await database.select<Pick<LocalResourceRow, 'resource_type' | 'resource_id' | 'version' | 'deleted_at'>>(
          `SELECT resource_type, resource_id, version, deleted_at FROM local_resource_records
           WHERE user_id = $1 AND (${resourcePredicates.join(' OR ')})`,
          [this.userId, ...items.flatMap((item) => [item.resourceType, item.resourceId])]
        )
        const currentMap = new Map(currentRows.map(row => [resourceKey(row.resource_type, row.resource_id), row]))

        for (const item of items) {
          const current = currentMap.get(resourceKey(item.resourceType, item.resourceId))
          const staleVersion = current !== undefined && item.version < current.version
          const wouldClearTombstone = current !== undefined && current.deleted_at !== null && item.deletedAt === null
          const accept = !staleVersion && !wouldClearTombstone
          if (!accept) continue

          await database.execute(
            `INSERT INTO local_resource_records
              (user_id, resource_type, resource_id, version, deleted_at, sync_status, payload)
             VALUES ($1, $2, $3, $4, $5, 'synced', $6)
             ON CONFLICT (user_id, resource_type, resource_id) DO UPDATE SET
              version = excluded.version,
              deleted_at = excluded.deleted_at,
              sync_status = excluded.sync_status,
              payload = excluded.payload`,
            [this.userId, item.resourceType, item.resourceId, item.version, item.deletedAt, JSON.stringify(item.value)],
          )
        }
        return true
      })
    }

    return this.withBrowserStateLock(() => {
      const state = this.readBrowserState()
      const keysToWrite = new Set(keys)
      if (state.mutations.some((mutation) => mutation.userId === this.userId
        && ['pending', 'inflight', 'conflict', 'error'].includes(mutation.status)
        && keysToWrite.has(resourceKey(mutation.resourceType, mutation.resourceId)))) {
        return false
      }

      for (const item of items) {
        const index = state.resources.findIndex((resource) => resource.userId === this.userId
          && resource.resourceType === item.resourceType && resource.id === item.resourceId)
        const current = index >= 0 ? state.resources[index] : undefined

        const staleVersion = current !== undefined && item.version < current.version
        const wouldClearTombstone = current !== undefined && current.deletedAt !== null && item.deletedAt === null
        const accept = !staleVersion && !wouldClearTombstone
        if (!accept) continue

        const entity: LocalEntity<T> = {
          id: item.resourceId,
          resourceType: item.resourceType,
          userId: this.userId,
          version: item.version,
          deletedAt: item.deletedAt,
          syncStatus: 'synced',
          value: clone(item.value),
        }
        if (index >= 0) state.resources[index] = entity as LocalEntity<unknown>
        else state.resources.push(entity as LocalEntity<unknown>)
      }
      this.writeBrowserState(state)
      return true
    })
  }

  private async upsertFromSyncInternal<T>(
    resourceType: string,
    resourceId: string,
    value: T,
    options: { version: number; deletedAt: string | null; syncStatus: 'synced' },
  ): Promise<boolean> {
    if (this.sql) {
      return this.runSqlTransaction(async (database) => {
        if (resourceType === 'TASK') {
          try {
            await this.assertNoScheduleFence(database, [resourceId])
          } catch (error) {
            if (error instanceof LocalConflictError) return false
            throw error
          }
        }
        const unresolved = await database.select<LocalMutationRow>(
          `SELECT client_mutation_id, user_id, resource_type, resource_id, mutation_type, base_version,
                  payload, status, created_at, error, in_flight_at, remote_payload, remote_version
           FROM local_mutations
           WHERE user_id = $1 AND resource_type = $2 AND resource_id = $3
             AND status IN ('pending', 'inflight', 'conflict', 'error')`,
          [this.userId, resourceType, resourceId],
        )
        if (unresolved.length > 0) {
          const remote = resourceType === 'KNOWLEDGE_BLOCK' ? asKnowledgeBlockConflictSnapshot(value, resourceId) : null
          if (!remote || remote.version !== options.version) return false
          const conflicts = unresolved.map(mutationFromRow).filter((mutation) =>
            canCaptureKnowledgeBlockConflict(mutation, options.deletedAt))
          const newer = conflicts.filter((mutation) => remote.version > (mutation.remoteVersion ?? -1))
          for (const mutation of newer) {
            await database.execute(
              `UPDATE local_mutations SET remote_payload = $1, remote_version = $2
               WHERE user_id = $3 AND client_mutation_id = $4`,
              [JSON.stringify({ ...remote, deletedAt: options.deletedAt }), remote.version, this.userId, mutation.clientMutationId],
            )
          }
          return newer.length > 0
        }
        if (resourceType === 'KNOWLEDGE_BLOCK') {
          const rows = await database.select<{ version: number }>(
            `SELECT version FROM local_resource_records WHERE user_id = $1 AND resource_type = $2 AND resource_id = $3`,
            [this.userId, resourceType, resourceId],
          )
          if (rows[0] && rows[0].version > options.version) return false
        }
        await database.execute(
          `INSERT INTO local_resource_records
            (user_id, resource_type, resource_id, version, deleted_at, sync_status, payload)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (user_id, resource_type, resource_id) DO UPDATE SET
            version = excluded.version, deleted_at = excluded.deleted_at,
            sync_status = excluded.sync_status, payload = excluded.payload`,
          [this.userId, resourceType, resourceId, options.version, options.deletedAt, options.syncStatus, JSON.stringify(value)],
        )
        return true
      })
    }

    return this.withBrowserStateLock(() => {
      const state = this.readBrowserState()
      if (resourceType === 'TASK') {
        try {
          this.assertNoScheduleFenceInBrowser(state, [resourceId])
        } catch (error) {
          if (error instanceof LocalConflictError) return false
          throw error
        }
        }
      const unresolved = state.mutations.filter((item) => item.userId === this.userId && item.resourceType === resourceType
        && item.resourceId === resourceId && isUnresolved(item))
      if (unresolved.length > 0) {
        const remote = resourceType === 'KNOWLEDGE_BLOCK' ? asKnowledgeBlockConflictSnapshot(value, resourceId) : null
        if (!remote || remote.version !== options.version) return false
        const newer = unresolved.filter((mutation) =>
          canCaptureKnowledgeBlockConflict(mutation, options.deletedAt) && remote.version > (mutation.remoteVersion ?? -1))
        if (newer.length === 0) return false
        for (const mutation of newer) {
          mutation.remoteVersion = remote.version
          mutation.remoteValue = { ...remote, deletedAt: options.deletedAt }
        }
        this.writeBrowserState(state)
        return true
      }
      const entity: LocalEntity<T> = {
        id: resourceId,
        resourceType,
        userId: this.userId,
        version: options.version,
        deletedAt: options.deletedAt,
        syncStatus: options.syncStatus,
        value: clone(value),
      }
      const index = state.resources.findIndex((item) => item.userId === this.userId && item.resourceType === resourceType && item.id === resourceId)
      if (resourceType === 'KNOWLEDGE_BLOCK' && index >= 0 && state.resources[index].version > options.version) return false
      if (index >= 0) state.resources[index] = entity as LocalEntity<unknown>
      else state.resources.push(entity as LocalEntity<unknown>)
      this.writeBrowserState(state)
      return true
    })
  }

  private async upsertInternal<T>(
    resourceType: string,
    resourceId: string,
    value: T,
    options: LocalWriteOptions = {},
  ): Promise<LocalEntity<T>> {
    if (!this.sql) {
      return this.withBrowserStateLock(() => {
        const state = this.readBrowserState()
        const existing = state.resources.find((item) => item.userId === this.userId
          && item.resourceType === resourceType && item.id === resourceId) ?? null
        this.assertBaseVersion(existing, options.baseVersion, resourceType, resourceId)
        const entity: LocalEntity<T> = {
          id: resourceId,
          resourceType,
          userId: this.userId,
          version: options.version ?? existing?.version ?? 0,
          deletedAt: options.deletedAt === undefined ? existing?.deletedAt ?? null : options.deletedAt,
          syncStatus: options.syncStatus ?? existing?.syncStatus ?? 'synced',
          value: clone(value),
        }
        const index = state.resources.findIndex((item) => item.userId === this.userId
          && item.resourceType === resourceType && item.id === resourceId)
        if (index >= 0) state.resources[index] = entity as LocalEntity<unknown>
        else state.resources.push(entity as LocalEntity<unknown>)
        this.writeBrowserState(state)
        return clone(entity)
      })
    }

    const existing = await this.read<unknown>(resourceType, resourceId)
    this.assertBaseVersion(existing, options.baseVersion, resourceType, resourceId)
    const entity: LocalEntity<T> = {
      id: resourceId,
      resourceType,
      userId: this.userId,
      version: options.version ?? existing?.version ?? 0,
      deletedAt: options.deletedAt === undefined ? existing?.deletedAt ?? null : options.deletedAt,
      syncStatus: options.syncStatus ?? existing?.syncStatus ?? 'synced',
      value: clone(value),
    }

    if (this.sql) {
      await this.ensureSql()
      await this.sql.execute(
        `INSERT INTO local_resource_records
          (user_id, resource_type, resource_id, version, deleted_at, sync_status, payload)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (user_id, resource_type, resource_id) DO UPDATE SET
          version = excluded.version,
          deleted_at = excluded.deleted_at,
          sync_status = excluded.sync_status,
          payload = excluded.payload`,
        [this.userId, resourceType, resourceId, entity.version, entity.deletedAt, entity.syncStatus, JSON.stringify(entity.value)],
      )
      return entity
    }
    throw new Error('Browser repository write branch should be handled before SQL preparation')
  }

  async tombstone<T = unknown>(
    resourceType: string,
    resourceId: string,
    options: Omit<LocalWriteOptions, 'deletedAt'> & { deletedAt?: string } = {},
  ): Promise<LocalEntity<T>> {
    const existing = await this.read<T>(resourceType, resourceId)
    if (!existing) throw new Error(`Cannot tombstone missing ${resourceType}/${resourceId}`)
    return this.upsert(resourceType, resourceId, existing.value, {
      ...options,
      deletedAt: options.deletedAt ?? this.now(),
      syncStatus: options.syncStatus ?? 'pending',
    })
  }

  /**
   * Locally hides every projection owned by a deleted Subject and discards
   * child outbox entries.  The Subject mutation remains the only server
   * mutation; server-side cascade tombstones are authoritative for peers.
   */
  async tombstoneSubjectChildren(subjectId: string, deletedAt = this.now()): Promise<LocalSubjectCascadeResource[]> {
    if (!subjectId.trim()) throw new Error('SUBJECT_ID_REQUIRED')
    const childTypes = ['SOURCE', 'KNOWLEDGE_BLOCK', 'TASK', 'RELATION'] as const
    const ownsSubject = (resourceType: string, value: unknown): boolean => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return false
      const record = value as Record<string, unknown>
      if (resourceType === 'RELATION') {
        return (record.sourceType === 'SUBJECT' && record.sourceId === subjectId)
          || (record.targetType === 'SUBJECT' && record.targetId === subjectId)
      }
      return record.subjectId === subjectId
    }

    if (this.sql) {
      return this.runSqlTransaction(async (database) => {
        const rows = await database.select<LocalResourceRow>(
          `SELECT resource_id, resource_type, user_id, version, deleted_at, sync_status, payload
           FROM local_resource_records
           WHERE user_id = $1 AND resource_type IN ('SOURCE', 'KNOWLEDGE_BLOCK', 'TASK', 'RELATION')`,
          [this.userId],
        )
        const impacted: LocalSubjectCascadeResource[] = []
        for (const row of rows) {
          const entity = resourceFromRow(row)
          if (!ownsSubject(entity.resourceType, entity.value)) continue
          // Preserve the prior marker in the returned value so the coordinator
          // can distinguish a first local fence from an idempotent replay.
          impacted.push({ ...entity, resourceType: entity.resourceType as LocalSubjectCascadeResource['resourceType'] })
          await database.execute(
            `UPDATE local_resource_records SET deleted_at = $1, sync_status = 'synced'
             WHERE user_id = $2 AND resource_type = $3 AND resource_id = $4`,
            [deletedAt, this.userId, entity.resourceType, entity.id],
          )
          await database.execute(
            `DELETE FROM local_mutations WHERE user_id = $1 AND resource_type = $2 AND resource_id = $3`,
            [this.userId, entity.resourceType, entity.id],
          )
        }
        return impacted
      })
    }

    return this.withBrowserStateLock(() => {
      const state = this.readBrowserState()
      const impacted: LocalSubjectCascadeResource[] = []
      for (const entity of state.resources) {
        if (entity.userId !== this.userId || !childTypes.includes(entity.resourceType as typeof childTypes[number])
          || !ownsSubject(entity.resourceType, entity.value)) continue
        impacted.push({ ...clone(entity), resourceType: entity.resourceType as LocalSubjectCascadeResource['resourceType'] })
        entity.deletedAt = deletedAt
        entity.syncStatus = 'synced'
        state.mutations = state.mutations.filter((mutation) => !(mutation.userId === this.userId
          && mutation.resourceType === entity.resourceType && mutation.resourceId === entity.id))
      }
      this.writeBrowserState(state)
      return impacted
    })
  }

  async commitMutation<T>(input: LocalCommitInput<T>): Promise<LocalEntity<T>> {
    if (input.resourceType === 'SOURCE') {
      return withLocalAssetLifecycleLock(this.userId, this.serverDeviceId, () =>
        this.commitMutationInternal(input))
    }
    return this.commitMutationInternal(input)
  }

  /** Caller must already hold the owner-scoped lifecycle lock. */
  async commitMutationUnlocked<T>(input: LocalCommitInput<T>): Promise<LocalEntity<T>> {
    return this.commitMutationInternal(input)
  }

  async commitScheduleMutation<T>(input: LocalScheduleBatchCommitInput<T>): Promise<LocalEntity<T>[]> {
    const mutation = this.mutationFromInput(input.mutation)
    const taskIds = input.items.map((item) => item.resourceId)
    if (mutation.resourceType !== 'TASK'
      || (mutation.mutationType !== 'SCHEDULE_INSERTION'
        && mutation.mutationType !== 'SCHEDULE_SWAP'
        && mutation.mutationType !== 'SCHEDULE_UNSCHEDULE')
      || !taskIds.includes(mutation.resourceId)
      || input.items.length === 0
      || new Set(taskIds).size !== taskIds.length
      || input.items.some((item) => item.resourceType !== 'TASK'
        || item.deletedAt !== null
        || item.expectedLocalVersion === undefined
        || item.expectedLocalVersion < 0
        || item.version !== item.expectedLocalVersion)) {
      throw new Error('A schedule mutation must commit unique active Task rows with matching base versions')
    }

    const affectedTaskIds = this.localScheduleAffectedIds(mutation)
    if (affectedTaskIds.length === 0 || new Set(affectedTaskIds).size !== affectedTaskIds.length
      || !taskIds.every((taskId) => affectedTaskIds.includes(taskId))) {
      throw new Error('A schedule mutation must fence every optimistic Task row')
    }
    mutation.payload._localExpectedTasks = input.items.map((item) => ({ id: item.resourceId, value: clone(item.value) }))
    const prepareAppend = (unresolved: LocalMutation[]) => {
      const schedules = unresolved.filter(isScheduleCommand).sort(mutationOrder)
      if (unresolved.some((pending) => isScheduleCommand(pending)
        ? pending.status !== 'pending' && pending.status !== 'inflight'
        : affectedTaskIds.includes(pending.resourceId))) {
        throw new LocalConflictError(null, 'A Task in the schedule batch has an unresolved local mutation')
      }
      // Preserve the append order across same-millisecond commits and restarts.
      const last = schedules.at(-1)
      if (last && mutationOrder(mutation, last) <= 0) {
        mutation.createdAt = new Date(Date.parse(last.createdAt) + 1).toISOString()
      }
    }

    if (this.sql) {
      return this.runSqlTransaction(async (database) => {
        if (input.expectedScheduleState !== undefined) {
          const currentRows = await database.select<LocalResourceRow>(
            `SELECT resource_id, resource_type, user_id, version, deleted_at, sync_status, payload
             FROM local_resource_records WHERE user_id = $1 AND resource_type = 'TASK'`, [this.userId],
          )
          if (taskScheduleState(currentRows.map(resourceFromRow)) !== input.expectedScheduleState) {
            throw new LocalConflictError(null, '排期已在其他窗口更新，请重试')
          }
        }
        const resourcePredicates = input.items.map((_, index) =>
          `(resource_type = $${index * 2 + 2} AND resource_id = $${index * 2 + 3})`)
        const existingRows = await database.select<LocalResourceRow>(
          `SELECT resource_id, resource_type, user_id, version, deleted_at, sync_status, payload
           FROM local_resource_records WHERE user_id = $1 AND (${resourcePredicates.join(' OR ')})`,
          [this.userId, ...input.items.flatMap((item) => [item.resourceType, item.resourceId])],
        )
        const existingByKey = new Map(existingRows.map((row) => [resourceKey(row.resource_type, row.resource_id), resourceFromRow(row)]))
        for (const item of input.items) {
          const existing = existingByKey.get(resourceKey(item.resourceType, item.resourceId)) ?? null
          if (!existing || existing.deletedAt !== null) {
            throw new LocalConflictError(existing, `TASK/${item.resourceId} is not active locally`)
          }
          this.assertBaseVersion(existing, item.expectedLocalVersion, item.resourceType, item.resourceId)
        }
        const unresolvedRows = await database.select<LocalMutationRow>(
          `SELECT client_mutation_id, user_id, resource_type, resource_id, mutation_type, base_version,
                  payload, status, created_at, error, in_flight_at, remote_payload, remote_version
           FROM local_mutations
           WHERE user_id = $1 AND resource_type = 'TASK'
             AND status IN ('pending', 'inflight', 'conflict', 'error')`,
          [this.userId],
        )
        prepareAppend(unresolvedRows.map(mutationFromRow))
        const duplicateId = await database.select<Pick<LocalMutationRow, 'client_mutation_id'>>(
          'SELECT client_mutation_id FROM local_mutations WHERE user_id = $1 AND client_mutation_id = $2',
          [this.userId, mutation.clientMutationId],
        )
        if (duplicateId.length > 0) throw new LocalConflictError(null, `Mutation ${mutation.clientMutationId} already exists`)

        const entities = input.items.map((item): LocalEntity<T> => ({
          id: item.resourceId,
          resourceType: 'TASK',
          userId: this.userId,
          version: item.version,
          deletedAt: null,
          syncStatus: 'pending',
          value: clone(item.value),
        }))
        for (const entity of entities) {
          await database.execute(
            `INSERT INTO local_resource_records
              (user_id, resource_type, resource_id, version, deleted_at, sync_status, payload)
             VALUES ($1, 'TASK', $2, $3, NULL, 'pending', $4)
             ON CONFLICT (user_id, resource_type, resource_id) DO UPDATE SET
               version = excluded.version, deleted_at = NULL,
               sync_status = excluded.sync_status, payload = excluded.payload`,
            [this.userId, entity.id, entity.version, JSON.stringify(entity.value)],
          )
        }
        await database.execute(
          `INSERT INTO local_mutations
            (client_mutation_id, user_id, resource_type, resource_id, mutation_type, base_version,
             payload, status, created_at, error, in_flight_at, remote_payload, remote_version)
           VALUES ($1, $2, 'TASK', $3, $4, $5, $6, 'pending', $7, NULL, NULL, NULL, NULL)`,
          [mutation.clientMutationId, this.userId, mutation.resourceId, mutation.mutationType,
            mutation.baseVersion, JSON.stringify(mutation.payload), mutation.createdAt],
        )
        return entities.map(clone)
      })
    }

    return this.withBrowserStateLock(() => {
      const state = this.readBrowserState()
      if (input.expectedScheduleState !== undefined && taskScheduleState(state.resources.filter((row) =>
        row.userId === this.userId && row.resourceType === 'TASK')) !== input.expectedScheduleState) {
        throw new LocalConflictError(null, '排期已在其他窗口更新，请重试')
      }
      prepareAppend(state.mutations.filter((pending) => pending.userId === this.userId
        && pending.resourceType === 'TASK' && isUnresolved(pending)))
      for (const item of input.items) {
        const existing = state.resources.find((resource) => resource.userId === this.userId
          && resource.resourceType === item.resourceType && resource.id === item.resourceId) ?? null
        if (!existing || existing.deletedAt !== null) {
          throw new LocalConflictError(existing, `TASK/${item.resourceId} is not active locally`)
        }
        this.assertBaseVersion(existing, item.expectedLocalVersion, item.resourceType, item.resourceId)
      }
      if (state.mutations.some((item) => item.userId === this.userId && item.clientMutationId === mutation.clientMutationId)) {
        throw new LocalConflictError(null, `Mutation ${mutation.clientMutationId} already exists`)
      }
      const entities = input.items.map((item): LocalEntity<T> => ({
        id: item.resourceId,
        resourceType: 'TASK',
        userId: this.userId,
        version: item.version,
        deletedAt: null,
        syncStatus: 'pending',
        value: clone(item.value),
      }))
      for (const entity of entities) {
        const index = state.resources.findIndex((resource) => resource.userId === this.userId
          && resource.resourceType === 'TASK' && resource.id === entity.id)
        state.resources[index] = clone(entity) as LocalEntity<unknown>
      }
      state.mutations.push(mutation)
      this.writeBrowserState(state)
      return entities.map(clone)
    })
  }

  private reconcileScheduleResult(
    mutation: LocalMutation,
    mutations: LocalMutation[],
    resources: LocalEntity<unknown>[],
    input: LocalScheduleMutationResolution,
  ): boolean {
    if (!isScheduleCommand(mutation)) throw new Error('Only a schedule mutation can be resolved with a Task batch')
    if (mutation.status === 'applied' || mutation.status === 'rejected') return true
    const queued = mutations.filter((item) => item.clientMutationId !== mutation.clientMutationId
      && isScheduleCommand(item) && isUnresolved(item))
    // Only the oldest schedule is sent. A younger command must never be settled or
    // rebased while an older delivery is still unknown.
    if (queued.some((item) => mutationOrder(item, mutation) < 0)
      || queued.some((item) => item.payload._localScheduleSent === true)) {
      throw new Error('SCHEDULE_COMMAND_ORDER_INVALID')
    }
    const affectedIds = new Set(this.localScheduleAffectedIds(mutation))
    const cancelling = input.cancelQueued === true || input.status === 'rejected'
    if (cancelling) {
      for (const next of queued) for (const id of this.localScheduleAffectedIds(next)) affectedIds.add(id)
      const returnedIds = new Set(input.items.map((item) => item.resourceId))
      if ([...affectedIds].some((id) => !returnedIds.has(id))) throw new Error('SYNC_SCHEDULE_SNAPSHOT_INCOMPLETE')
    }
    const otherWrites = mutations.filter((item) => item.clientMutationId !== mutation.clientMutationId
      && !isScheduleCommand(item) && isUnresolved(item))
    const protectedIds = new Set(input.items.filter((item) => {
      const current = resources.find((row) => row.resourceType === 'TASK' && row.id === item.resourceId)
      return otherWrites.some((pending) => pending.resourceType === 'TASK' && pending.resourceId === item.resourceId)
        || current !== undefined && (item.version < current.version || current.deletedAt !== null && item.deletedAt === null)
    }).map((item) => item.resourceId))
    const unsafeBatch = protectedIds.size > 0
    if (unsafeBatch && queued.length > 0 && !input.recoverySnapshot) throw new Error('SCHEDULE_REFRESH_REQUIRED')
    mutation.status = input.status
    mutation.error = unsafeBatch ? input.error ?? 'SCHEDULE_REFRESH_REQUIRED' : input.error
    mutation.remoteValue = clone(input.items)
    if (cancelling) {
      for (const next of queued) {
        next.status = 'rejected'
        next.error = 'SCHEDULE_PREDECESSOR_REJECTED'
      }
    }
    if (!unsafeBatch || input.recoverySnapshot) {
      const stillQueued = cancelling ? [] : queued
      const fenced = new Set(stillQueued.flatMap((next) => this.localScheduleAffectedIds(next)))
      for (const item of input.items) {
        if (protectedIds.has(item.resourceId)) continue
        const current = resources.find((row) => row.resourceType === 'TASK' && row.id === item.resourceId)
        const keepProjection = fenced.has(item.resourceId) && current !== undefined
        const value = keepProjection ? clone(current.value) : clone(item.value)
        if (value && typeof value === 'object') (value as Record<string, unknown>).version = item.version
        const entity: LocalEntity<unknown> = {
          id: item.resourceId, resourceType: 'TASK', userId: this.userId,
          version: item.version, deletedAt: item.deletedAt,
          syncStatus: keepProjection ? 'pending' : 'synced', value,
        }
        const index = resources.findIndex((row) => row.resourceType === 'TASK' && row.id === item.resourceId)
        if (index >= 0) resources[index] = entity
        else resources.push(entity)
        for (const next of stillQueued) {
          // These commands have never left the device. Their first delivery must
          // use the authoritative predecessor versions, with the same stable ID.
          if (next.resourceId === item.resourceId) {
            next.baseVersion = item.version
            const field = next.mutationType === 'SCHEDULE_INSERTION' ? 'baseVersion'
              : next.mutationType === 'SCHEDULE_SWAP' ? 'sourceBaseVersion'
              : 'baseVersion'
            if (Object.prototype.hasOwnProperty.call(next.payload, field)) next.payload[field] = item.version
          }
          if (next.mutationType === 'SCHEDULE_SWAP' && next.payload.targetTaskId === item.resourceId
            && Object.prototype.hasOwnProperty.call(next.payload, 'targetBaseVersion')) {
            next.payload.targetBaseVersion = item.version
          }
        }
      }
    }
    for (const id of affectedIds) {
      const current = resources.find((row) => row.resourceType === 'TASK' && row.id === id)
      if (input.recoverySnapshot && protectedIds.has(id)) continue
      if (current) current.syncStatus = unsafeBatch && !input.recoverySnapshot ? 'error'
        : mutations.some((next) => next.resourceType === 'TASK' && isUnresolved(next)
          && (next.resourceId === id || this.localScheduleAffectedIds(next).includes(id)))
          ? 'pending' : 'synced'
    }
    return !unsafeBatch || input.recoverySnapshot === true
  }

  async resolveScheduleMutation(input: LocalScheduleMutationResolution): Promise<boolean> {
    const keys = input.items.map((item) => resourceKey(item.resourceType, item.resourceId))
    if (input.items.some((item) => item.resourceType !== 'TASK') || new Set(keys).size !== keys.length) {
      throw new Error('A schedule result must contain unique Task rows')
    }
    if (this.sql) {
      return this.runSqlTransaction(async (database) => {
        const mutationRows = await database.select<LocalMutationRow>(
          `SELECT client_mutation_id, user_id, resource_type, resource_id, mutation_type, base_version,
                  payload, status, created_at, error, in_flight_at, remote_payload, remote_version
           FROM local_mutations WHERE user_id = $1
             AND (client_mutation_id = $2 OR status IN ('pending', 'inflight', 'conflict', 'error'))`,
          [this.userId, input.clientMutationId],
        )
        const mutations = mutationRows.map(mutationFromRow)
        const mutation = mutations.find((item) => item.clientMutationId === input.clientMutationId)
        if (!mutation) return false
        if (!isScheduleCommand(mutation)) throw new Error('Only a schedule mutation can be resolved with a Task batch')
        if (mutation.status === 'applied' || mutation.status === 'rejected') return true
        const affected = new Set([...input.items.map((item) => item.resourceId),
          ...mutations.filter(isScheduleCommand).flatMap((next) => this.localScheduleAffectedIds(next))])
        const taskIds = [...affected]
        const rows = taskIds.length === 0 ? [] : await database.select<LocalResourceRow>(
          `SELECT resource_id, resource_type, user_id, version, deleted_at, sync_status, payload
           FROM local_resource_records WHERE user_id = $1 AND resource_type = 'TASK'
             AND resource_id IN (${taskIds.map((_, index) => `$${index + 2}`).join(', ')})`,
          [this.userId, ...taskIds],
        )
        const resources = rows.map(resourceFromRow)
        const accepted = this.reconcileScheduleResult(mutation, mutations, resources, input)
        for (const next of mutations.filter(isScheduleCommand)) {
          await database.execute(
            `UPDATE local_mutations SET status = $1, error = $2, in_flight_at = NULL,
               base_version = $3, payload = $4, remote_payload = $5, remote_version = NULL
             WHERE user_id = $6 AND client_mutation_id = $7`,
            [next.status, next.error ?? null, next.baseVersion, JSON.stringify(next.payload),
              next.remoteValue === undefined ? null : JSON.stringify(next.remoteValue), this.userId, next.clientMutationId],
          )
        }
        for (const entity of resources.filter((item) => affected.has(item.id))) {
          await database.execute(
            `INSERT INTO local_resource_records
              (user_id, resource_type, resource_id, version, deleted_at, sync_status, payload)
             VALUES ($1, 'TASK', $2, $3, $4, $5, $6)
             ON CONFLICT (user_id, resource_type, resource_id) DO UPDATE SET
               version = excluded.version, deleted_at = excluded.deleted_at,
               sync_status = excluded.sync_status, payload = excluded.payload`,
            [this.userId, entity.id, entity.version, entity.deletedAt, entity.syncStatus, JSON.stringify(entity.value)],
          )
        }
        return accepted
      })
    }
    return this.withBrowserStateLock(() => {
      const state = this.readBrowserState()
      const mutation = state.mutations.find((item) => item.userId === this.userId && item.clientMutationId === input.clientMutationId)
      if (!mutation) return false
      const accepted = this.reconcileScheduleResult(mutation,
        state.mutations.filter((item) => item.userId === this.userId), state.resources, input)
      this.writeBrowserState(state)
      return accepted
    })
  }

  private async commitMutationInternal<T>(input: LocalCommitInput<T>): Promise<LocalEntity<T>> {
    const mutation = this.mutationFromInput(input.mutation)
    if (mutation.resourceType !== input.resourceType || mutation.resourceId !== input.resourceId) {
      throw new Error('Local mutation must target the committed resource')
    }
    if (mutation.mutationType === 'SCHEDULE_INSERTION'
      || mutation.mutationType === 'SCHEDULE_SWAP'
      || mutation.mutationType === 'SCHEDULE_UNSCHEDULE') {
      throw new Error('Schedule mutations must use commitScheduleMutation')
    }

    if (this.sql) {
      return this.runSqlTransaction(async (database) => {
        if (input.resourceType === 'TASK') await this.assertNoScheduleFence(database, [input.resourceId])
        if (input.rejectIfNonPendingMutation) {
          const blocked = await database.select<LocalMutationRow>(
            `SELECT client_mutation_id, user_id, resource_type, resource_id, mutation_type, base_version,
                    payload, status, created_at, error, in_flight_at, remote_payload, remote_version
             FROM local_mutations
             WHERE user_id = $1 AND resource_type = $2 AND resource_id = $3
               AND status IN ('inflight', 'conflict', 'error')`,
            [this.userId, input.resourceType, input.resourceId],
          )
          if (blocked.length > 0) {
            throw new LocalConflictError(null, `${input.resourceType}/${input.resourceId} has a non-pending local mutation`, true)
          }
        }
        const rows = mutation.mutationType !== 'CREATE' || input.expectedLocalVersion !== undefined || input.requireActiveResource
          ? await database.select<LocalResourceRow>(
              `SELECT resource_id, resource_type, user_id, version, deleted_at, sync_status, payload
               FROM local_resource_records WHERE user_id = $1 AND resource_type = $2 AND resource_id = $3`,
              [this.userId, input.resourceType, input.resourceId],
            ) : []
        const row = rows[0]
        const existing = row ? resourceFromRow<T>(row) : null
        if (input.expectedLocalVersion !== undefined || input.requireActiveResource) {
          if (!existing) throw new LocalConflictError(null, `${input.resourceType}/${input.resourceId} no longer exists locally`)
          if (input.requireActiveResource && existing.deletedAt !== null) {
            throw new LocalConflictError(existing, `${input.resourceType}/${input.resourceId} is deleted`)
          }
          if (input.expectedLocalVersion !== undefined) {
            this.assertBaseVersion(existing, input.expectedLocalVersion, input.resourceType, input.resourceId)
          }
          if (mutation.resourceType === 'KNOWLEDGE_BLOCK' && mutation.mutationType === 'UPDATE'
            && existing.syncStatus === 'conflict') {
            throw new LocalConflictError(existing, '请先处理此知识块的同步冲突。', true)
          }
        }

        const entity: LocalEntity<T> = {
          id: input.resourceId,
          resourceType: input.resourceType,
          userId: this.userId,
          version: input.version,
          deletedAt: input.deletedAt,
          syncStatus: 'pending',
          value: clone(input.value),
        }
        if (row && isOwnReceiptBaseline(existing, input, mutation)) {
          // An edit captured before ACK may wait for this write boundary. Only a matching local receipt can supply its baseline.
          const receipts = await database.select<Record<string, unknown>>(
            `SELECT client_mutation_id FROM local_mutations
             WHERE user_id = $1 AND resource_type = $2 AND resource_id = $3 AND status = 'applied' AND error IS NULL
               AND mutation_type IN ('CREATE', 'UPDATE', 'DELETE', 'RESTORE') AND base_version = $4
               AND remote_version = $5 AND remote_payload = $6 LIMIT 1`,
            [this.userId, input.resourceType, input.resourceId, mutation.baseVersion, existing.version, row.payload],
          )
          if (receipts.length > 0) advanceCrudVersion(mutation, entity, existing.version)
        }
        await database.execute(
          `INSERT INTO local_resource_records
            (user_id, resource_type, resource_id, version, deleted_at, sync_status, payload)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (user_id, resource_type, resource_id) DO UPDATE SET
             version = excluded.version, deleted_at = excluded.deleted_at,
             sync_status = excluded.sync_status, payload = excluded.payload`,
          [this.userId, entity.resourceType, entity.id, entity.version, entity.deletedAt, entity.syncStatus, JSON.stringify(entity.value)],
        )
        await this.enqueueSqlMutation(database, mutation, input.expectedLocalVersion === mutation.baseVersion)
        return clone(entity)
      })
    }

    return this.withBrowserStateLock(() => {
    const state = this.readBrowserState()
    if (input.resourceType === 'TASK') this.assertNoScheduleFenceInBrowser(state, [input.resourceId])
    const resourceIndex = state.resources.findIndex(
      (item) => item.userId === this.userId && item.resourceType === input.resourceType && item.id === input.resourceId,
    )
    const existing = resourceIndex >= 0 ? state.resources[resourceIndex] as LocalEntity<T> : null
    if (input.expectedLocalVersion !== undefined || input.requireActiveResource) {
      if (!existing) throw new LocalConflictError(null, `${input.resourceType}/${input.resourceId} no longer exists locally`)
      if (input.requireActiveResource && existing.deletedAt !== null) {
        throw new LocalConflictError(existing, `${input.resourceType}/${input.resourceId} is deleted`)
      }
      if (input.expectedLocalVersion !== undefined) {
        this.assertBaseVersion(existing, input.expectedLocalVersion, input.resourceType, input.resourceId)
      }
      if (mutation.resourceType === 'KNOWLEDGE_BLOCK' && mutation.mutationType === 'UPDATE'
        && existing.syncStatus === 'conflict') {
        throw new LocalConflictError(existing, '请先处理此知识块的同步冲突。', true)
      }
    }
    if (input.rejectIfNonPendingMutation && state.mutations.some((item) => item.userId === this.userId
      && item.resourceType === input.resourceType && item.resourceId === input.resourceId
      && ['inflight', 'conflict', 'error'].includes(item.status))) {
      throw new LocalConflictError(null, `${input.resourceType}/${input.resourceId} has a non-pending local mutation`, true)
    }
    const entity: LocalEntity<T> = {
      id: input.resourceId,
      resourceType: input.resourceType,
      userId: this.userId,
      version: input.version,
      deletedAt: input.deletedAt,
      syncStatus: 'pending',
      value: clone(input.value),
    }
    if (isOwnReceiptBaseline(existing, input, mutation) && state.mutations.some((item) => item.userId === this.userId
      && item.resourceType === input.resourceType && item.resourceId === input.resourceId && !isScheduleCommand(item)
      && item.status === 'applied' && !item.error && item.baseVersion === mutation.baseVersion
      && item.remoteVersion === existing.version && JSON.stringify(item.remoteValue) === JSON.stringify(existing.value))) {
      advanceCrudVersion(mutation, entity, existing.version)
    }
    if (resourceIndex >= 0) state.resources[resourceIndex] = entity as LocalEntity<unknown>
    else state.resources.push(entity as LocalEntity<unknown>)
    this.enqueueBrowserMutation(state, mutation, input.expectedLocalVersion === mutation.baseVersion)
    this.writeBrowserState(state)
    return clone(entity)
    })
  }

  async enqueueMutation(input: LocalMutationInput): Promise<LocalMutation> {
    const mutation = this.mutationFromInput(input)
    if (this.sql) {
      return this.runSqlTransaction((database) => this.enqueueSqlMutation(database, mutation))
    }
    return this.withBrowserStateLock(() => {
      const state = this.readBrowserState()
      const queued = this.enqueueBrowserMutation(state, mutation)
      this.writeBrowserState(state)
      return clone(queued)
    })
  }

  private async enqueueSqlMutation(database: LocalSqlDatabase, mutation: LocalMutation, checkedLocalVersion = false): Promise<LocalMutation> {
    const rows = await database.select<LocalMutationRow>(
      `SELECT client_mutation_id, user_id, resource_type, resource_id, mutation_type, base_version,
              payload, status, created_at, error, remote_payload, remote_version
       FROM local_mutations WHERE user_id = $1 AND (client_mutation_id = $2 OR
         (resource_type = $3 AND resource_id = $4 AND status IN ('pending', 'inflight')))`,
      [this.userId, mutation.clientMutationId, mutation.resourceType, mutation.resourceId],
    )
    const existing = rows.find((row) => row.client_mutation_id === mutation.clientMutationId)
    if (existing) return mutationFromRow(existing)
    const queued = isScheduleCommand(mutation) ? mutation
      : prepareCrudMutation(mutation, rows.map(mutationFromRow).filter((item) => !isScheduleCommand(item)), checkedLocalVersion)
    await database.execute(
      `INSERT INTO local_mutations
        (client_mutation_id, user_id, resource_type, resource_id, mutation_type, base_version, payload, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', $8)
       ON CONFLICT (user_id, client_mutation_id) DO UPDATE SET
         mutation_type = excluded.mutation_type, payload = excluded.payload`,
      [queued.clientMutationId, this.userId, queued.resourceType, queued.resourceId, queued.mutationType,
        queued.baseVersion, JSON.stringify(queued.payload), queued.createdAt],
    )
    return queued
  }

  private enqueueBrowserMutation(state: StoredBrowserState, mutation: LocalMutation, checkedLocalVersion = false): LocalMutation {
    const existing = state.mutations.find((item) => item.userId === this.userId
      && item.clientMutationId === mutation.clientMutationId)
    if (existing) return existing
    const queued = isScheduleCommand(mutation) ? mutation : prepareCrudMutation(mutation, state.mutations.filter(
      (item) => item.userId === this.userId && item.resourceType === mutation.resourceType && item.resourceId === mutation.resourceId
        && (item.status === 'pending' || item.status === 'inflight') && !isScheduleCommand(item),
    ), checkedLocalVersion)
    const index = state.mutations.findIndex((item) => item.userId === this.userId && item.clientMutationId === queued.clientMutationId)
    if (index < 0) {
      state.mutations.push(queued)
      return queued
    }
    state.mutations[index] = queued
    return queued
  }

  async listPending(resourceType?: string): Promise<LocalMutation[]> {
    if (this.sql) {
      await this.ensureSql()
      const params: unknown[] = [this.userId]
      const typeClause = resourceType ? ` AND resource_type = $2` : ''
      if (resourceType) params.push(resourceType)
      const rows = await this.sql.select<LocalMutationRow>(
        `SELECT client_mutation_id, user_id, resource_type, resource_id, mutation_type,
                base_version, payload, status, created_at, error
         FROM local_mutations
         WHERE user_id = $1 AND status = 'pending'${typeClause}
         ORDER BY created_at ASC`,
        params,
      )
      return rows.map(mutationFromRow)
    }
    const state = this.readBrowserState()
    return state.mutations
      .filter((item) => item.userId === this.userId && item.status === 'pending')
      .filter((item) => !resourceType || item.resourceType === resourceType)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
      .map(clone)
  }

  async listUnresolved(resourceType?: string): Promise<LocalMutation[]> {
    if (this.sql) {
      await this.ensureSql()
      const params: unknown[] = [this.userId]
      const typeClause = resourceType ? ` AND resource_type = $2` : ''
      if (resourceType) params.push(resourceType)
      const rows = await this.sql.select<LocalMutationRow>(
        `SELECT client_mutation_id, user_id, resource_type, resource_id, mutation_type,
                base_version, payload, status, created_at, error, remote_payload, remote_version
         FROM local_mutations
          WHERE user_id = $1 AND status IN ('pending', 'inflight', 'conflict', 'error')${typeClause}
         ORDER BY created_at ASC`,
        params,
      )
      return rows.map(mutationFromRow)
    }
    const state = this.readBrowserState()
    return state.mutations
      .filter((item) => item.userId === this.userId && ['pending', 'inflight', 'conflict', 'error'].includes(item.status))
      .filter((item) => !resourceType || item.resourceType === resourceType)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
      .map(clone)
  }

  async markApplied(
    clientMutationId: string,
    status: LocalMutationStatus = 'applied',
    error?: string,
  ): Promise<LocalMutation | null> {
    if (this.sql) {
      await this.ensureSql()
      const rows = await this.sql.select<LocalMutationRow>(
        `SELECT client_mutation_id, user_id, resource_type, resource_id, mutation_type,
                base_version, payload, status, created_at, error
         FROM local_mutations WHERE client_mutation_id = $1 AND user_id = $2`,
        [clientMutationId, this.userId],
      )
      if (!rows[0]) return null
      await this.sql.execute(
        'UPDATE local_mutations SET status = $1, error = $2 WHERE client_mutation_id = $3 AND user_id = $4',
        [status, error ?? null, clientMutationId, this.userId],
      )
      return {
        ...mutationFromRow(rows[0]),
        status,
        ...(error ? { error } : {}),
      }
    }
    return this.withBrowserStateLock(() => {
      const state = this.readBrowserState()
      const mutation = state.mutations.find(
        (item) => item.clientMutationId === clientMutationId && item.userId === this.userId,
      )
      if (!mutation) return null
      mutation.status = status
      if (error) mutation.error = error
      else delete mutation.error
      this.writeBrowserState(state)
      return clone(mutation)
    })
  }

  async claimPending(limit: number): Promise<LocalMutation[]> {
    const boundedLimit = Math.max(1, Math.min(200, Math.floor(limit)))
    const selectClaimable = (mutations: LocalMutation[]) => {
      const firstSchedule = mutations.filter((item) => isScheduleCommand(item) && isUnresolved(item)).sort(mutationOrder)[0]
      const ready = mutations.filter((item) => item.status === 'pending' || item.status === 'inflight')
      const activeIds = new Set(ready.map((item) => item.clientMutationId))
      const heads = new Map<string, LocalMutation>()
      for (const mutation of ready.sort(mutationOrder)) {
        const predecessor = mutation.payload._localCrudPredecessor
        if (isScheduleCommand(mutation) || typeof predecessor === 'string' && activeIds.has(predecessor)) continue
        const key = `${mutation.resourceType}\u0000${mutation.resourceId}`
        const head = heads.get(key)
        if (!head || head.status === 'pending' && mutation.status === 'inflight') heads.set(key, mutation)
      }
      const claimed = [...heads.values(), ...ready.filter((item) => item === firstSchedule)]
        .sort(mutationOrder).slice(0, boundedLimit)
      for (const mutation of claimed) {
        if (isScheduleCommand(mutation)) mutation.payload._localScheduleSent = true
        else delete mutation.payload._localCrudPredecessor
      }
      return claimed
    }
    if (this.sql) {
      return this.runSqlTransaction(async (database) => {
        const rows = await database.select<LocalMutationRow>(
          `SELECT client_mutation_id, user_id, resource_type, resource_id, mutation_type, base_version,
                  payload, status, created_at, error, in_flight_at, remote_payload, remote_version
           FROM local_mutations WHERE user_id = $1 AND status IN ('pending', 'inflight', 'conflict', 'error')
           ORDER BY created_at ASC, client_mutation_id ASC`,
          [this.userId],
        )
        const claimed = selectClaimable(rows.map(mutationFromRow))
        const claimedAt = this.now()
        for (const mutation of claimed) {
          await database.execute(
            `UPDATE local_mutations SET status = 'inflight', in_flight_at = $1, payload = $2
              WHERE user_id = $3 AND client_mutation_id = $4 AND status IN ('pending', 'inflight')`,
            [claimedAt, JSON.stringify(mutation.payload), this.userId, mutation.clientMutationId],
          )
        }
        return claimed.map((mutation) => ({ ...mutation, status: 'inflight' as const }))
      })
    }
    return this.withBrowserStateLock(() => {
      const state = this.readBrowserState()
      const claimed = selectClaimable(state.mutations.filter((item) => item.userId === this.userId))
      for (const mutation of claimed) mutation.status = 'inflight'
      if (claimed.length > 0) this.writeBrowserState(state)
      return claimed.map(clone)
    })
  }

  async releaseInflight(clientMutationIds: string[]): Promise<void> {
    if (clientMutationIds.length === 0) return
    if (this.sql) {
      await this.runSqlTransaction(async (database) => {
        for (const clientMutationId of clientMutationIds) {
          await database.execute(
            `UPDATE local_mutations SET status = 'pending', in_flight_at = NULL
             WHERE user_id = $1 AND client_mutation_id = $2 AND status = 'inflight'`,
            [this.userId, clientMutationId],
          )
        }
      })
      return
    }
    return this.withBrowserStateLock(() => {
      const state = this.readBrowserState()
      const ids = new Set(clientMutationIds)
      for (const mutation of state.mutations) {
        if (mutation.userId === this.userId && ids.has(mutation.clientMutationId) && mutation.status === 'inflight') mutation.status = 'pending'
      }
      this.writeBrowserState(state)
    })
  }

  async settleMutation(input: LocalMutationSettlement): Promise<boolean> {
    if (input.resourceType === 'SOURCE') {
      return withLocalAssetLifecycleLock(this.userId, this.serverDeviceId, () => this.settleCrudMutation(input))
    }
    return this.settleCrudMutation(input)
  }

  private async settleCrudMutation(input: LocalMutationSettlement): Promise<boolean> {
    if (this.sql) {
      return this.runSqlTransaction(async (database) => {
        const rows = await database.select<LocalMutationRow>(
          `SELECT client_mutation_id, user_id, resource_type, resource_id, mutation_type, base_version,
                  payload, status, created_at, error, remote_payload, remote_version
           FROM local_mutations WHERE user_id = $1 AND resource_type = $2 AND resource_id = $3
             AND status IN ('pending', 'inflight', 'conflict', 'error')`,
          [this.userId, input.resourceType, input.resourceId],
        )
        const unresolved = rows.map(mutationFromRow)
        const mutation = unresolved.find((item) => item.clientMutationId === input.clientMutationId)
        if (mutation?.status !== 'inflight' || mutation.mutationType !== input.mutationType) return false
        const resources = await database.select<LocalResourceRow>(
          `SELECT resource_id, resource_type, user_id, version, deleted_at, sync_status, payload
           FROM local_resource_records WHERE user_id = $1 AND resource_type = $2 AND resource_id = $3`,
          [this.userId, input.resourceType, input.resourceId],
        )
        const { resource, successor, archiveRejection } = projectCrudSettlement(input, mutation,
          unresolved.filter((item) => item !== mutation), resources[0] ? resourceFromRow(resources[0]) : null)
        await database.execute(
          `UPDATE local_mutations SET status = $1, error = $2, in_flight_at = NULL,
             remote_payload = $3, remote_version = $4
           WHERE user_id = $5 AND client_mutation_id = $6`,
          [archiveRejection ? 'rejected' : input.status, input.error ?? null,
            input.remoteValue === undefined ? null : JSON.stringify(input.remoteValue), input.remoteVersion ?? null,
            this.userId, input.clientMutationId],
        )
        if (successor) {
          await database.execute(
            `UPDATE local_mutations SET base_version = $1, payload = $2
             WHERE user_id = $3 AND client_mutation_id = $4`,
            [successor.baseVersion, JSON.stringify(successor.payload), this.userId, successor.clientMutationId],
          )
        }
        if (resource) {
          await database.execute(
            `INSERT INTO local_resource_records (user_id, resource_type, resource_id, version, deleted_at, sync_status, payload)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             ON CONFLICT (user_id, resource_type, resource_id) DO UPDATE SET
               version = excluded.version, deleted_at = excluded.deleted_at,
               sync_status = excluded.sync_status, payload = excluded.payload`,
            [this.userId, resource.resourceType, resource.id, resource.version, resource.deletedAt,
              resource.syncStatus, JSON.stringify(resource.value)],
          )
        }
        return true
      })
    }
    return this.withBrowserStateLock(() => {
      const state = this.readBrowserState()
      const unresolved = state.mutations.filter((item) => item.userId === this.userId
        && item.resourceType === input.resourceType && item.resourceId === input.resourceId && isUnresolved(item))
      const mutation = unresolved.find((item) => item.clientMutationId === input.clientMutationId)
      if (mutation?.status !== 'inflight' || mutation.mutationType !== input.mutationType) return false
      const resourceIndex = state.resources.findIndex((item) => item.userId === this.userId
        && item.resourceType === input.resourceType && item.id === input.resourceId)
      const { resource, archiveRejection } = projectCrudSettlement(input, mutation,
        unresolved.filter((item) => item !== mutation), state.resources[resourceIndex] ?? null)
      mutation.status = archiveRejection ? 'rejected' : input.status
      if (input.error) mutation.error = input.error
      else delete mutation.error
      if (input.remoteValue === undefined) delete mutation.remoteValue
      else mutation.remoteValue = clone(input.remoteValue)
      if (input.remoteVersion === undefined) delete mutation.remoteVersion
      else mutation.remoteVersion = input.remoteVersion
      if (resource) {
        if (resourceIndex >= 0) state.resources[resourceIndex] = resource
        else state.resources.push(resource)
      }
      this.writeBrowserState(state)
      return true
    })
  }

  async resolveKnowledgeBlockConflict(input: KnowledgeBlockConflictResolution): Promise<void> {
    const makeRetry = (value: KnowledgeBlockView): LocalMutation | null => input.retryId ? this.mutationFromInput({
      clientMutationId: input.retryId, resourceType: 'KNOWLEDGE_BLOCK', resourceId: input.blockId,
      mutationType: 'UPDATE', baseVersion: input.remote.version,
      payload: { baseVersion: input.remote.version, subjectId: value.subjectId, sourceId: value.sourceId,
        title: value.title, content: value.content, colorOverride: value.colorOverride },
    }) : null
    if (this.sql) {
      await this.runSqlTransaction(async (database) => {
        const rows = await database.select<LocalMutationRow>(
          `SELECT client_mutation_id, user_id, resource_type, resource_id, mutation_type, base_version,
                  payload, status, created_at, error, remote_payload, remote_version
           FROM local_mutations WHERE user_id = $1 AND resource_type = 'KNOWLEDGE_BLOCK' AND resource_id = $2
             AND status IN ('pending', 'inflight', 'conflict', 'error')`,
          [this.userId, input.blockId],
        )
        const resources = await database.select<LocalResourceRow>(
          `SELECT resource_id, resource_type, user_id, version, deleted_at, sync_status, payload
           FROM local_resource_records WHERE user_id = $1 AND resource_type = 'KNOWLEDGE_BLOCK' AND resource_id = $2`,
          [this.userId, input.blockId],
        )
        const resource = projectKnowledgeBlockConflictResolution(input, rows.map(mutationFromRow),
          resources[0] ? resourceFromRow<KnowledgeBlockView>(resources[0]) : null)
        await database.execute(
          `UPDATE local_resource_records SET version = $1, sync_status = $2, payload = $3, deleted_at = $4
           WHERE user_id = $5 AND resource_type = 'KNOWLEDGE_BLOCK' AND resource_id = $6`,
          [resource.version, resource.syncStatus, JSON.stringify(resource.value), resource.deletedAt, this.userId, input.blockId],
        )
        await database.execute(
          `UPDATE local_mutations SET status = 'rejected'
           WHERE user_id = $1 AND resource_type = 'KNOWLEDGE_BLOCK' AND resource_id = $2
             AND status IN ('conflict', 'error')`,
          [this.userId, input.blockId],
        )
        const retry = makeRetry(resource.value)
        if (retry) await this.enqueueSqlMutation(database, retry)
      })
      return
    }
    await this.withBrowserStateLock(() => {
      const state = this.readBrowserState()
      const unresolved = state.mutations.filter((mutation) => mutation.userId === this.userId
        && mutation.resourceType === 'KNOWLEDGE_BLOCK' && mutation.resourceId === input.blockId && isUnresolved(mutation))
      const index = state.resources.findIndex((resource) => resource.userId === this.userId
        && resource.resourceType === 'KNOWLEDGE_BLOCK' && resource.id === input.blockId)
      const current = state.resources[index] as LocalEntity<KnowledgeBlockView> | undefined
      const resource = projectKnowledgeBlockConflictResolution(input, unresolved, current ?? null)
      state.resources[index] = resource
      for (const mutation of unresolved) mutation.status = 'rejected'
      const retry = makeRetry(resource.value)
      if (retry) this.enqueueBrowserMutation(state, retry)
      this.writeBrowserState(state)
    })
  }

  /**
   * Resolves a rejected Subject DELETE by restoring the server's current
   * projection and marking the rejected mutation as auditable/applied. The
   * row is no longer an unresolved local fence, so the next snapshot/pull can
   * repopulate children without the hydration tombstone loop.
   */
  async resolveRejectedSubjectDelete(input: {
    clientMutationId: string
    remoteValue?: unknown
    remoteVersion?: number
  }): Promise<boolean> {
    if (!input.clientMutationId.trim()) throw new Error('MUTATION_ID_REQUIRED')
    if (this.sql) {
      return this.runSqlTransaction(async (database) => {
        const rows = await database.select<LocalMutationRow>(
          `SELECT client_mutation_id, user_id, resource_type, resource_id, mutation_type, base_version,
                  payload, status, created_at, error, in_flight_at, remote_payload, remote_version
           FROM local_mutations WHERE user_id = $1 AND client_mutation_id = $2`,
          [this.userId, input.clientMutationId],
        )
        const mutation = rows[0] ? mutationFromRow(rows[0]) : null
        if (!mutation || mutation.resourceType !== 'SUBJECT' || mutation.mutationType !== 'DELETE'
          || (mutation.status !== 'conflict' && mutation.status !== 'error')) return false
        const newerWrites = await database.select<Record<string, unknown>>(
          `SELECT client_mutation_id FROM local_mutations WHERE user_id = $1 AND resource_type = 'SUBJECT'
             AND resource_id = $2 AND client_mutation_id <> $3 AND status IN ('pending', 'inflight', 'conflict', 'error') LIMIT 1`,
          [this.userId, mutation.resourceId, input.clientMutationId],
        )
        if (newerWrites.length > 0) return false
        const current = await database.select<LocalResourceRow>(
          `SELECT resource_id, resource_type, user_id, version, deleted_at, sync_status, payload
           FROM local_resource_records WHERE user_id = $1 AND resource_type = 'SUBJECT' AND resource_id = $2`,
          [this.userId, mutation.resourceId],
        )
        if (current[0] && current[0].version > (input.remoteVersion ?? mutation.baseVersion)) return false
        let restoredValue = input.remoteValue ?? (current[0] ? resourceFromRow(current[0]).value : { id: mutation.resourceId })
        if (!restoredValue || typeof restoredValue !== 'object' || Array.isArray(restoredValue)) restoredValue = { id: mutation.resourceId }
        await database.execute(
          `INSERT INTO local_resource_records
             (user_id, resource_type, resource_id, version, deleted_at, sync_status, payload)
           VALUES ($1, 'SUBJECT', $2, $3, NULL, 'synced', $4)
           ON CONFLICT (user_id, resource_type, resource_id) DO UPDATE SET
             version = excluded.version, deleted_at = NULL, sync_status = 'synced', payload = excluded.payload`,
          [this.userId, mutation.resourceId, input.remoteVersion ?? current[0]?.version ?? mutation.baseVersion, JSON.stringify(restoredValue)],
        )
        await database.execute(
          `UPDATE local_mutations SET status = 'applied', error = $1, in_flight_at = NULL,
             remote_payload = $2, remote_version = $3
           WHERE user_id = $4 AND client_mutation_id = $5`,
          ['SUBJECT_DELETE_REJECTED_RESTORED', JSON.stringify(restoredValue), input.remoteVersion ?? null, this.userId, input.clientMutationId],
        )
        // Keep the reset request in the same SQL transaction as restoring the
        // parent and resolving its fence. A crash or failed snapshot must
        // leave the next sync cycle on the authoritative snapshot path.
        await database.execute(
          `INSERT INTO sync_metadata (user_id, device_id, cursor, reset_required, schema_version)
           VALUES ($1, $2, NULL, 1, $3)
           ON CONFLICT (user_id, device_id) DO UPDATE SET
             reset_required = 1, schema_version = excluded.schema_version`,
          [this.userId, this.serverDeviceId, LOCAL_SCHEMA_VERSION],
        )
        return true
      })
    }
    return this.withBrowserStateLock(() => {
      const state = this.readBrowserState()
      const mutation = state.mutations.find((item) => item.userId === this.userId && item.clientMutationId === input.clientMutationId)
      if (!mutation || mutation.resourceType !== 'SUBJECT' || mutation.mutationType !== 'DELETE'
        || (mutation.status !== 'conflict' && mutation.status !== 'error')
        || state.mutations.some((item) => item.userId === this.userId && item.resourceType === 'SUBJECT'
          && item.resourceId === mutation.resourceId && item !== mutation && isUnresolved(item))) return false
      const resource = state.resources.find((item) => item.userId === this.userId && item.resourceType === 'SUBJECT' && item.id === mutation.resourceId)
      if (resource && resource.version > (input.remoteVersion ?? mutation.baseVersion)) return false
      const restoredValue = input.remoteValue && typeof input.remoteValue === 'object' && !Array.isArray(input.remoteValue)
        ? clone(input.remoteValue) : clone(resource?.value ?? { id: mutation.resourceId })
      if (resource) {
        resource.value = restoredValue
        resource.version = input.remoteVersion ?? resource.version
        resource.deletedAt = null
        resource.syncStatus = 'synced'
      } else {
        state.resources.push({ id: mutation.resourceId, resourceType: 'SUBJECT', userId: this.userId,
          version: input.remoteVersion ?? mutation.baseVersion, deletedAt: null, syncStatus: 'synced', value: restoredValue })
      }
      mutation.status = 'applied'
      mutation.error = 'SUBJECT_DELETE_REJECTED_RESTORED'
      mutation.remoteValue = restoredValue
      mutation.remoteVersion = input.remoteVersion
      state.sync = { ...state.sync, resetRequired: true }
      this.writeBrowserState(state)
      return true
    })
  }

  async getSyncState(): Promise<LocalSyncState> {
    if (this.sql) {
      await this.ensureSql()
      const rows = await this.sql.select<Record<string, unknown>>(
        `SELECT cursor, reset_required, schema_version FROM sync_metadata
         WHERE user_id = $1 AND device_id = $2`,
        [this.userId, this.serverDeviceId],
      )
      const row = rows[0]
      return row
        ? { cursor: row.cursor == null ? null : String(row.cursor), resetRequired: Boolean(row.reset_required), schemaVersion: Number(row.schema_version ?? 2) }
        : { ...DEFAULT_SYNC_STATE }
    }
    return clone(this.readBrowserState().sync)
  }

  async saveCursor(cursor: string | null, resetRequired = false): Promise<LocalSyncState> {
    const state: LocalSyncState = { cursor, resetRequired, schemaVersion: LOCAL_SCHEMA_VERSION }
    if (this.sql) {
      await this.ensureSql()
      await this.sql.execute(
        `INSERT INTO sync_metadata (user_id, device_id, cursor, reset_required, schema_version)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (user_id, device_id) DO UPDATE SET
           cursor = excluded.cursor,
           reset_required = excluded.reset_required,
           schema_version = excluded.schema_version`,
        [this.userId, this.serverDeviceId, cursor, resetRequired ? 1 : 0, LOCAL_SCHEMA_VERSION],
      )
      return state
    }
    return this.withBrowserStateLock(() => {
      const browserState = this.readBrowserState()
      browserState.sync = state
      this.writeBrowserState(browserState)
      return clone(state)
    })
  }

  async replaceSnapshotPreservingPending(snapshot: LocalSnapshotItem[]): Promise<void> {
    if (this.sql) {
      await this.runSqlTransaction(async (database) => {
        const mutationRows = await database.select<LocalMutationRow>(
          `SELECT client_mutation_id, user_id, resource_type, resource_id, mutation_type,
                  base_version, payload, status, created_at, error
           FROM local_mutations
           WHERE user_id = $1 AND status IN ('pending', 'inflight', 'conflict', 'error')
           ORDER BY created_at ASC`,
          [this.userId],
        )
        const pending = mutationRows.map(mutationFromRow)
        const pendingKeys = new Set(pending.map((item) => resourceKey(item.resourceType, item.resourceId)))
        for (const mutation of pending) {
          for (const taskId of this.localScheduleAffectedIds(mutation)) {
            pendingKeys.add(resourceKey('TASK', taskId))
          }
        }

        const currentRows = await database.select<LocalResourceRow>(
          `SELECT resource_id, resource_type, user_id, version, deleted_at, sync_status, payload
           FROM local_resource_records WHERE user_id = $1`,
          [this.userId],
        )
        const preserved = currentRows.map((row) => resourceFromRow(row))
          .filter((item) => pendingKeys.has(resourceKey(item.resourceType, item.id)))
        const replacement = [
          ...snapshot
            .filter((item) => !pendingKeys.has(resourceKey(item.resourceType, item.resourceId)))
            .map((item) => ({
              resourceType: item.resourceType,
              resourceId: item.resourceId,
              version: item.version,
              deletedAt: item.deletedAt,
              syncStatus: 'synced' as const,
              value: item.value,
            })),
          ...preserved.map((item) => ({
            resourceType: item.resourceType,
            resourceId: item.id,
            version: item.version,
            deletedAt: item.deletedAt,
            syncStatus: item.syncStatus,
            value: item.value,
          })),
        ]

        await database.execute('DELETE FROM local_resource_records WHERE user_id = $1', [this.userId])
        for (const item of replacement) {
          await database.execute(
            `INSERT INTO local_resource_records
              (user_id, resource_type, resource_id, version, deleted_at, sync_status, payload)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [this.userId, item.resourceType, item.resourceId, item.version, item.deletedAt,
              item.syncStatus, JSON.stringify(item.value)],
          )
        }
      })
      return
    }

    return this.withBrowserStateLock(() => {
      const state = this.readBrowserState()
      const pending = state.mutations
        .filter((item) => item.userId === this.userId && ['pending', 'inflight', 'conflict', 'error'].includes(item.status))
      const pendingKeys = new Set(pending.map((item) => resourceKey(item.resourceType, item.resourceId)))
      for (const mutation of pending) {
        for (const taskId of this.localScheduleAffectedIds(mutation)) {
          pendingKeys.add(resourceKey('TASK', taskId))
        }
      }
      const preserved = state.resources.filter((item) => item.userId === this.userId
        && pendingKeys.has(resourceKey(item.resourceType, item.id)))
      state.resources = [
        ...snapshot
          .filter((item) => !pendingKeys.has(resourceKey(item.resourceType, item.resourceId)))
          .map((item) => ({
            id: item.resourceId,
            resourceType: item.resourceType,
            userId: this.userId,
            version: item.version,
            deletedAt: item.deletedAt,
            syncStatus: 'synced' as const,
            value: clone(item.value),
          })),
        ...preserved.map(clone),
      ]
      this.writeBrowserState(state)
    })
  }

  async resetOfflineStorage(): Promise<void> {
    if (this.sql) {
      await this.ensureSql()
      await this.sql.execute('BEGIN')
      try {
        await this.sql.execute('DELETE FROM local_mutations WHERE user_id = $1', [this.userId])
        await this.sql.execute('DELETE FROM local_resource_records WHERE user_id = $1', [this.userId])
        await this.sql.execute(
          `INSERT INTO sync_metadata (user_id, device_id, cursor, reset_required, schema_version)
           VALUES ($1, $2, NULL, 1, $3)
           ON CONFLICT (user_id, device_id) DO UPDATE SET
             cursor = NULL,
             reset_required = 1,
             schema_version = excluded.schema_version`,
          [this.userId, this.serverDeviceId, LOCAL_SCHEMA_VERSION],
        )
        await this.sql.execute('COMMIT')
      } catch (error) {
        await this.sql.execute('ROLLBACK').catch(() => {})
        throw error
      }
      return
    }
    return this.withBrowserStateLock(() => {
      const state = this.readBrowserState()
      state.resources = []
      state.mutations = []
      state.sync = { cursor: null, resetRequired: true, schemaVersion: LOCAL_SCHEMA_VERSION }
      this.writeBrowserState(state)
    })
  }

  async backupLegacyData(): Promise<LegacyUnassignedBackup | null> {
    return backupLegacyUnassignedData(this.storage, this.now)
  }

  getLegacyBackup(): LegacyUnassignedBackup | null {
    return getLegacyUnassignedBackup(this.storage)
  }
}

const DOCUMENT_JOB_TRANSITIONS: Record<DocumentJobPhase, readonly DocumentJobPhase[]> = {
  QUEUED: ['DOWNLOADING_SOURCE', 'EXTRACTING', 'UPLOADING', 'PAUSED_NETWORK', 'FAILED_LOCAL'],
  DOWNLOADING_SOURCE: ['EXTRACTING', 'PAUSED_NETWORK', 'FAILED_LOCAL'],
  EXTRACTING: ['OCR_RUNNING', 'QUEUED', 'PACKAGING', 'PAUSED_NETWORK', 'FAILED_LOCAL'],
  OCR_RUNNING: ['QUEUED', 'PACKAGING', 'PAUSED_NETWORK', 'FAILED_LOCAL'],
  PACKAGING: ['UPLOADING', 'PAUSED_NETWORK', 'FAILED_LOCAL'],
  UPLOADING: ['SERVER_VALIDATING', 'QUEUED', 'PAUSED_NETWORK', 'FAILED_SERVER', 'FAILED_LOCAL'],
  SERVER_VALIDATING: ['SERVER_INDEXING', 'UPLOADING', 'PAUSED_NETWORK', 'FAILED_SERVER', 'FAILED_LOCAL'],
  SERVER_INDEXING: ['READY', 'UPLOADING', 'PAUSED_NETWORK', 'FAILED_SERVER', 'FAILED_LOCAL'],
  READY: [],
  FAILED_LOCAL: ['QUEUED'],
  FAILED_SERVER: ['QUEUED'],
  PAUSED_NETWORK: ['QUEUED', 'DOWNLOADING_SOURCE', 'UPLOADING', 'FAILED_LOCAL'],
}

interface DocumentJobRepositoryOptions {
  storage?: LocalStorageLike
  sql?: LocalSqlDatabase
  schemaReady?: Promise<void>
  now?: () => string
}

function documentJobClone(job: DocumentProcessingJob): DocumentProcessingJob {
  return clone(job)
}

function documentJobStorage(): LocalStorageLike {
  if (typeof window !== 'undefined' && window.localStorage) return window.localStorage
  return createMemoryStorage()
}

function documentJobKey(userId: string, serverDeviceId: string, version = 5): string {
  return `auralis:v${version}:document-jobs:${encodePart(userId)}:${encodePart(serverDeviceId)}`
}

export class DocumentProcessingJobRepository {
  readonly userId: string
  readonly serverDeviceId: string

  private readonly storage: LocalStorageLike
  private readonly sql?: LocalSqlDatabase
  private readonly schemaReady?: Promise<void>
  private readonly now: () => string
  private sqlReady: Promise<void> | null = null

  constructor(userId: string, serverDeviceId: string, options: DocumentJobRepositoryOptions = {}) {
    if (!userId.trim()) throw new Error('DocumentProcessingJobRepository requires a userId')
    if (!serverDeviceId.trim()) throw new Error('DocumentProcessingJobRepository requires a serverDeviceId')
    if (options.sql && options.storage) throw new Error('DocumentProcessingJobRepository accepts either sql or storage, not both')
    this.userId = userId
    this.serverDeviceId = serverDeviceId
    this.sql = options.sql
    this.schemaReady = options.schemaReady
    this.storage = options.storage ?? documentJobStorage()
    this.now = options.now ?? (() => new Date().toISOString())
  }

  private async ensureSql(): Promise<void> {
    if (!this.sql) return
    if (!this.sqlReady) this.sqlReady = this.schemaReady ?? createVersionedLocalSchema(this.sql)
    await this.sqlReady
  }

  private readBrowserJobs(): DocumentProcessingJob[] {
    const currentKey = documentJobKey(this.userId, this.serverDeviceId)
    let raw = this.storage.getItem(currentKey)
    let migrated = false
    if (!raw) {
      raw = this.storage.getItem(documentJobKey(this.userId, this.serverDeviceId, 4))
      migrated = Boolean(raw)
    }
    if (!raw) {
      raw = this.storage.getItem(documentJobKey(this.userId, this.serverDeviceId, 3))
      migrated = Boolean(raw)
    }
    if (!raw) return []
    try {
      const jobs = JSON.parse(raw) as unknown
      if (!Array.isArray(jobs)) return []
      const normalized = jobs.map((job) => ({
        ...(job as Record<string, unknown>),
        ingestionRevision: String((job as Record<string, unknown>).ingestionRevision ?? ''),
        checkpoint: normalizeDocumentJobCheckpoint((job as Record<string, unknown>).checkpoint),
        payloadReceipt: sanitizeDocumentCacheReceipt((job as Record<string, unknown>).payloadReceipt) ?? null,
      })) as DocumentProcessingJob[]
      if (migrated) this.storage.setItem(currentKey, JSON.stringify(normalized))
      return normalized
    } catch {
      return []
    }
  }

  private writeBrowserJobs(jobs: DocumentProcessingJob[]): void {
    this.storage.setItem(documentJobKey(this.userId, this.serverDeviceId), JSON.stringify(jobs))
  }

  async create(input: CreateDocumentProcessingJobInput): Promise<DocumentProcessingJob> {
    if (!input.jobId.trim() || !input.sourceId.trim() || !input.ingestionRevision.trim()) {
      throw new Error('DOCUMENT_JOB_INPUT_INVALID')
    }
    const createdAt = this.now()
    const job: DocumentProcessingJob = {
      jobId: input.jobId,
      userId: this.userId,
      serverDeviceId: this.serverDeviceId,
      sourceId: input.sourceId,
      ingestionRevision: input.ingestionRevision,
      phase: 'QUEUED',
      attempt: 0,
      checkpoint: { pageNumber: 0, blockOrdinal: 0 },
      payloadCacheId: null,
      payloadReceipt: null,
      errorCode: null,
      errorDetail: null,
      createdAt,
      updatedAt: createdAt,
    }
    if (this.sql) {
      await this.ensureSql()
      const duplicate = await this.sql.select<{ job_id: string }>(
        `SELECT job_id FROM document_processing_jobs
         WHERE user_id = $1 AND device_id = $2 AND source_id = $3 AND ingestion_revision = $4`,
        [this.userId, this.serverDeviceId, input.sourceId, input.ingestionRevision],
      )
      if (duplicate[0]) throw new Error('DOCUMENT_JOB_DUPLICATE_REVISION')
      await this.sql.execute(
        `INSERT INTO document_processing_jobs
          (job_id, user_id, device_id, source_id, ingestion_revision, phase, attempt,
          checkpoint_page, checkpoint_ordinal, checkpoint_json, payload_cache_id, payload_receipt_json,
           error_code, error_detail, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
        [job.jobId, job.userId, job.serverDeviceId, job.sourceId, job.ingestionRevision, job.phase, job.attempt,
          job.checkpoint.pageNumber, job.checkpoint.blockOrdinal, null, null, null, null, null, job.createdAt, job.updatedAt],
      )
      return job
    }
    const jobs = this.readBrowserJobs()
    if (jobs.some((existing) => existing.sourceId === job.sourceId && existing.ingestionRevision === job.ingestionRevision)) {
      throw new Error('DOCUMENT_JOB_DUPLICATE_REVISION')
    }
    jobs.push(job)
    this.writeBrowserJobs(jobs)
    return documentJobClone(job)
  }

  async get(jobId: string): Promise<DocumentProcessingJob | null> {
    if (this.sql) {
      await this.ensureSql()
      const rows = await this.sql.select<DocumentProcessingJobRow>(
        `SELECT job_id, user_id, device_id, source_id, ingestion_revision, phase, attempt,
                checkpoint_page, checkpoint_ordinal, checkpoint_json, payload_cache_id, payload_receipt_json,
                error_code, error_detail, created_at, updated_at
         FROM document_processing_jobs WHERE job_id = $1 AND user_id = $2 AND device_id = $3`,
        [jobId, this.userId, this.serverDeviceId],
      )
      return rows[0] ? documentProcessingJobFromRow(rows[0]) : null
    }
    const found = this.readBrowserJobs().find((job) => job.jobId === jobId)
    return found ? documentJobClone(found) : null
  }

  async list(): Promise<DocumentProcessingJob[]> {
    if (this.sql) {
      await this.ensureSql()
      const rows = await this.sql.select<DocumentProcessingJobRow>(
        `SELECT job_id, user_id, device_id, source_id, ingestion_revision, phase, attempt,
                checkpoint_page, checkpoint_ordinal, checkpoint_json, payload_cache_id, payload_receipt_json,
                error_code, error_detail, created_at, updated_at
         FROM document_processing_jobs WHERE user_id = $1 AND device_id = $2 ORDER BY updated_at ASC, job_id ASC`,
        [this.userId, this.serverDeviceId],
      )
      return rows.map(documentProcessingJobFromRow)
    }
    return this.readBrowserJobs().sort((left, right) => left.updatedAt.localeCompare(right.updatedAt) || left.jobId.localeCompare(right.jobId)).map(documentJobClone)
  }

  async removeBySource(sourceId: string): Promise<DocumentProcessingJob[]> {
    if (!sourceId.trim()) throw new Error('DOCUMENT_JOB_SOURCE_INVALID')
    if (this.sql) {
      await this.ensureSql()
      const rows = await this.sql.select<DocumentProcessingJobRow>(
        `SELECT job_id, user_id, device_id, source_id, ingestion_revision, phase, attempt,
                checkpoint_page, checkpoint_ordinal, checkpoint_json, payload_cache_id, payload_receipt_json,
                error_code, error_detail, created_at, updated_at
         FROM document_processing_jobs
         WHERE user_id = $1 AND device_id = $2 AND source_id = $3
         ORDER BY updated_at ASC, job_id ASC`,
        [this.userId, this.serverDeviceId, sourceId],
      )
      if (!rows.length) return []
      await this.sql.execute(
        `DELETE FROM document_processing_jobs
         WHERE user_id = $1 AND device_id = $2 AND source_id = $3`,
        [this.userId, this.serverDeviceId, sourceId],
      )
      return rows.map(documentProcessingJobFromRow)
    }
    const jobs = this.readBrowserJobs()
    const removed = jobs.filter((job) => job.sourceId === sourceId)
    if (removed.length) this.writeBrowserJobs(jobs.filter((job) => job.sourceId !== sourceId))
    return removed.map(documentJobClone)
  }

  async remove(jobId: string): Promise<DocumentProcessingJob | null> {
    const current = await this.get(jobId)
    if (!current) return null
    if (this.sql) {
      await this.ensureSql()
      await this.sql.execute(
        `DELETE FROM document_processing_jobs WHERE job_id = $1 AND user_id = $2 AND device_id = $3`,
        [jobId, this.userId, this.serverDeviceId],
      )
      return current
    }
    const jobs = this.readBrowserJobs()
    this.writeBrowserJobs(jobs.filter((job) => job.jobId !== jobId))
    return current
  }

  async transition(jobId: string, phase: DocumentJobPhase, options: DocumentJobTransitionOptions = {}): Promise<DocumentProcessingJob> {
    if (!DOCUMENT_JOB_PHASES.includes(phase)) throw new Error('DOCUMENT_JOB_PHASE_INVALID')
    const current = await this.get(jobId)
    if (!current) throw new Error('DOCUMENT_JOB_NOT_FOUND')
    // Parser checkpoints are persisted for every emitted block. Consecutive
    // blocks can therefore legitimately keep the same phase while advancing
    // the checkpoint; this is an update, not a state-machine transition.
    if (current.phase !== phase && !DOCUMENT_JOB_TRANSITIONS[current.phase].includes(phase)) {
      throw new Error('DOCUMENT_JOB_ILLEGAL_TRANSITION')
    }
    const checkpoint = options.checkpoint ?? current.checkpoint
    const updatedAt = this.now()
    const next: DocumentProcessingJob = {
      ...current,
      phase,
      attempt: options.attempt ?? current.attempt,
      checkpoint,
      payloadCacheId: options.payloadCacheId === undefined ? current.payloadCacheId : options.payloadCacheId,
      payloadReceipt: options.payloadReceipt === undefined
        ? current.payloadReceipt
        : (options.payloadReceipt ? sanitizeDocumentCacheReceipt(options.payloadReceipt) : null),
      errorCode: options.errorCode === undefined ? current.errorCode : options.errorCode,
      errorDetail: options.errorDetail === undefined ? current.errorDetail : options.errorDetail,
      updatedAt,
    }
    if (this.sql) {
      await this.ensureSql()
      await this.sql.execute(
        `UPDATE document_processing_jobs
         SET phase = $1, attempt = $2, checkpoint_page = $3, checkpoint_ordinal = $4,
             checkpoint_json = $5, payload_cache_id = $6, payload_receipt_json = $7, error_code = $8,
             error_detail = $9, updated_at = $10
         WHERE job_id = $11 AND user_id = $12 AND device_id = $13 AND phase = $14`,
        [next.phase, next.attempt, checkpoint.pageNumber, checkpoint.blockOrdinal,
           (checkpoint.parserState || checkpoint.diagnostic) ? JSON.stringify(checkpoint) : null, next.payloadCacheId,
          next.payloadReceipt ? JSON.stringify(next.payloadReceipt) : null,
          next.errorCode, next.errorDetail, next.updatedAt, jobId, this.userId, this.serverDeviceId, current.phase],
      )
      const persisted = await this.get(jobId)
      if (!persisted || persisted.phase !== phase) throw new Error('DOCUMENT_JOB_CONFLICT')
      return persisted
    }
    const jobs = this.readBrowserJobs()
    const index = jobs.findIndex((job) => job.jobId === jobId)
    if (index < 0) throw new Error('DOCUMENT_JOB_NOT_FOUND')
    jobs[index] = next
    this.writeBrowserJobs(jobs)
    return documentJobClone(next)
  }
}

export function createLocalRepository(
  userId: string,
  serverDeviceId: string,
  options: LocalRepositoryOptions = {},
): LocalRepository {
  return new LocalRepository(userId, serverDeviceId, options)
}
