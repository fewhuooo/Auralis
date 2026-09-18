import type {
  LocalEntity,
  LocalMutation,
  LocalMutationStatus,
  LocalSyncStatus,
} from '@/types/api'
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
  mutation: LocalMutationInput
}

export interface LocalSubjectCascadeResource extends LocalEntity<unknown> {
  resourceType: 'SOURCE' | 'KNOWLEDGE_BLOCK' | 'TASK' | 'RELATION'
}

export interface LocalMutationSettlement {
  clientMutationId: string
  status: Extract<LocalMutationStatus, 'applied' | 'conflict' | 'error'>
  error?: string
  remoteValue?: unknown
  remoteVersion?: number
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
  /** Replaces a server snapshot in one native SQLite transaction when available. */
  replaceSnapshot?: (snapshot: LocalSnapshotItem[]) => Promise<void>
  now?: () => string
  idFactory?: () => string
}

export class LocalConflictError extends Error {
  readonly code = 'LOCAL_VERSION_CONFLICT'
  readonly resource: LocalEntity<unknown> | null

  constructor(resource: LocalEntity<unknown> | null, message = 'Local version conflict') {
    super(message)
    this.name = 'LocalConflictError'
    this.resource = resource
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
  private readonly replaceSnapshot?: (snapshot: LocalSnapshotItem[]) => Promise<void>
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
    this.replaceSnapshot = options.replaceSnapshot
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

  private async upsertInternal<T>(
    resourceType: string,
    resourceId: string,
    value: T,
    options: LocalWriteOptions = {},
  ): Promise<LocalEntity<T>> {
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
    const state = this.readBrowserState()
    const index = state.resources.findIndex(
      (item) => item.userId === this.userId && item.resourceType === resourceType && item.id === resourceId,
    )
    if (index >= 0) state.resources[index] = entity as LocalEntity<unknown>
    else state.resources.push(entity as LocalEntity<unknown>)
    this.writeBrowserState(state)
    return clone(entity)
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
          impacted.push({ ...entity, resourceType: entity.resourceType as LocalSubjectCascadeResource['resourceType'], deletedAt })
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

    const state = this.readBrowserState()
    const impacted: LocalSubjectCascadeResource[] = []
    for (const entity of state.resources) {
      if (entity.userId !== this.userId || !childTypes.includes(entity.resourceType as typeof childTypes[number])
        || !ownsSubject(entity.resourceType, entity.value)) continue
      impacted.push({ ...clone(entity), resourceType: entity.resourceType as LocalSubjectCascadeResource['resourceType'], deletedAt })
      entity.deletedAt = deletedAt
      entity.syncStatus = 'synced'
      state.mutations = state.mutations.filter((mutation) => !(mutation.userId === this.userId
        && mutation.resourceType === entity.resourceType && mutation.resourceId === entity.id))
    }
    this.writeBrowserState(state)
    return impacted
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

  private async commitMutationInternal<T>(input: LocalCommitInput<T>): Promise<LocalEntity<T>> {
    const mutation = this.mutationFromInput(input.mutation)
    if (mutation.resourceType !== input.resourceType || mutation.resourceId !== input.resourceId) {
      throw new Error('Local mutation must target the committed resource')
    }

    if (this.sql) {
      return this.runSqlTransaction(async (database) => {
        const entity: LocalEntity<T> = {
          id: input.resourceId,
          resourceType: input.resourceType,
          userId: this.userId,
          version: input.version,
          deletedAt: input.deletedAt,
          syncStatus: 'pending',
          value: clone(input.value),
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
        const pendingRows = await database.select<LocalMutationRow>(
          `SELECT client_mutation_id, user_id, resource_type, resource_id, mutation_type, base_version,
                  payload, status, created_at, error, in_flight_at, remote_payload, remote_version
           FROM local_mutations
           WHERE user_id = $1 AND resource_type = $2 AND resource_id = $3 AND status = 'pending'
           ORDER BY created_at ASC, client_mutation_id ASC LIMIT 1`,
          [this.userId, mutation.resourceType, mutation.resourceId],
        )
        const existing = pendingRows[0] ? mutationFromRow(pendingRows[0]) : null
        const coalesced = existing && this.coalescePendingMutation(existing, mutation)
        if (coalesced) {
          await database.execute(
            `UPDATE local_mutations SET mutation_type = $1, base_version = $2, payload = $3
             WHERE user_id = $4 AND client_mutation_id = $5`,
            [coalesced.mutationType, coalesced.baseVersion, JSON.stringify(coalesced.payload), this.userId, coalesced.clientMutationId],
          )
        } else {
          await database.execute(
            `INSERT INTO local_mutations
              (client_mutation_id, user_id, resource_type, resource_id, mutation_type, base_version,
               payload, status, created_at, error, in_flight_at, remote_payload, remote_version)
             VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', $8, NULL, NULL, NULL, NULL)
             ON CONFLICT (user_id, client_mutation_id) DO NOTHING`,
            [mutation.clientMutationId, this.userId, mutation.resourceType, mutation.resourceId,
              mutation.mutationType, mutation.baseVersion, JSON.stringify(mutation.payload), mutation.createdAt],
          )
        }
        return clone(entity)
      })
    }

    const state = this.readBrowserState()
    const resourceIndex = state.resources.findIndex(
      (item) => item.userId === this.userId && item.resourceType === input.resourceType && item.id === input.resourceId,
    )
    const entity: LocalEntity<T> = {
      id: input.resourceId,
      resourceType: input.resourceType,
      userId: this.userId,
      version: input.version,
      deletedAt: input.deletedAt,
      syncStatus: 'pending',
      value: clone(input.value),
    }
    if (resourceIndex >= 0) state.resources[resourceIndex] = entity as LocalEntity<unknown>
    else state.resources.push(entity as LocalEntity<unknown>)
    const existingMutationIndex = state.mutations.findIndex(
      (item) => item.userId === this.userId && item.resourceType === mutation.resourceType
        && item.resourceId === mutation.resourceId && item.status === 'pending',
    )
    const coalesced = existingMutationIndex >= 0
      ? this.coalescePendingMutation(state.mutations[existingMutationIndex], mutation)
      : null
    if (coalesced) state.mutations[existingMutationIndex] = coalesced
    else if (!state.mutations.some((item) => item.userId === this.userId && item.clientMutationId === mutation.clientMutationId)) {
      state.mutations.push(mutation)
    }
    this.writeBrowserState(state)
    return clone(entity)
  }

  async enqueueMutation(input: LocalMutationInput): Promise<LocalMutation> {
    const mutation = this.mutationFromInput(input)
    const existingForResource = (await this.listPending(mutation.resourceType))
      .find((item) => item.resourceId === mutation.resourceId)
    const coalesced = existingForResource && this.coalescePendingMutation(existingForResource, mutation)
    if (coalesced) {
      if (this.sql) {
        await this.ensureSql()
        await this.sql.execute(
          `UPDATE local_mutations
             SET mutation_type = $1, base_version = $2, payload = $3
           WHERE client_mutation_id = $4 AND user_id = $5`,
          [coalesced.mutationType, coalesced.baseVersion, JSON.stringify(coalesced.payload),
            coalesced.clientMutationId, this.userId],
        )
        return clone(coalesced)
      }
      const state = this.readBrowserState()
      const index = state.mutations.findIndex(
        (item) => item.clientMutationId === coalesced.clientMutationId && item.userId === this.userId,
      )
      if (index >= 0) state.mutations[index] = coalesced
      this.writeBrowserState(state)
      return clone(coalesced)
    }
    if (this.sql) {
      await this.ensureSql()
      const existing = await this.sql.select<LocalMutationRow>(
        `SELECT client_mutation_id, user_id, resource_type, resource_id, mutation_type,
                base_version, payload, status, created_at, error
         FROM local_mutations WHERE client_mutation_id = $1 AND user_id = $2`,
        [mutation.clientMutationId, this.userId],
      )
      if (existing[0]) return mutationFromRow(existing[0])
      await this.sql.execute(
        `INSERT INTO local_mutations
          (client_mutation_id, user_id, resource_type, resource_id, mutation_type,
           base_version, payload, status, created_at, error)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NULL)`,
        [mutation.clientMutationId, this.userId, mutation.resourceType, mutation.resourceId,
          mutation.mutationType, mutation.baseVersion, JSON.stringify(mutation.payload),
          mutation.status, mutation.createdAt],
      )
      return clone(mutation)
    }
    const state = this.readBrowserState()
    const existing = state.mutations.find(
      (item) => item.clientMutationId === mutation.clientMutationId && item.userId === this.userId,
    )
    if (existing) return clone(existing)
    state.mutations.push(mutation)
    this.writeBrowserState(state)
    return clone(mutation)
  }

  private coalescePendingMutation(existing: LocalMutation, incoming: LocalMutation): LocalMutation | null {
    if (existing.mutationType === 'CREATE' && incoming.mutationType === 'UPDATE') {
      return { ...existing, payload: clone(incoming.payload) }
    }
    if (existing.mutationType === 'UPDATE' && ['UPDATE', 'DELETE'].includes(incoming.mutationType)) {
      return {
        ...existing,
        mutationType: incoming.mutationType,
        payload: clone(incoming.payload),
      }
    }
    return null
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
                base_version, payload, status, created_at, error
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
  }

  async claimPending(limit: number): Promise<LocalMutation[]> {
    const boundedLimit = Math.max(1, Math.min(200, Math.floor(limit)))
    if (this.sql) {
      return this.runSqlTransaction(async (database) => {
        const rows = await database.select<LocalMutationRow>(
          `SELECT client_mutation_id, user_id, resource_type, resource_id, mutation_type, base_version,
                  payload, status, created_at, error, in_flight_at, remote_payload, remote_version
           FROM local_mutations WHERE user_id = $1 AND status = 'pending'
           ORDER BY created_at ASC, client_mutation_id ASC LIMIT $2`,
          [this.userId, boundedLimit],
        )
        const claimed = rows.map(mutationFromRow)
        const claimedAt = this.now()
        for (const mutation of claimed) {
          await database.execute(
            `UPDATE local_mutations SET status = 'inflight', in_flight_at = $1
             WHERE user_id = $2 AND client_mutation_id = $3 AND status = 'pending'`,
            [claimedAt, this.userId, mutation.clientMutationId],
          )
        }
        return claimed.map((mutation) => ({ ...mutation, status: 'inflight' as const }))
      })
    }
    const state = this.readBrowserState()
    const claimed = state.mutations
      .filter((item) => item.userId === this.userId && item.status === 'pending')
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.clientMutationId.localeCompare(right.clientMutationId))
      .slice(0, boundedLimit)
    for (const mutation of claimed) mutation.status = 'inflight'
    if (claimed.length > 0) this.writeBrowserState(state)
    return claimed.map(clone)
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
    const state = this.readBrowserState()
    const ids = new Set(clientMutationIds)
    for (const mutation of state.mutations) {
      if (mutation.userId === this.userId && ids.has(mutation.clientMutationId) && mutation.status === 'inflight') mutation.status = 'pending'
    }
    this.writeBrowserState(state)
  }

  async settleMutation(input: LocalMutationSettlement): Promise<void> {
    if (this.sql) {
      await this.runSqlTransaction(async (database) => {
        const rows = await database.select<LocalMutationRow>(
          `SELECT client_mutation_id, user_id, resource_type, resource_id, mutation_type, base_version,
                  payload, status, created_at, error, in_flight_at, remote_payload, remote_version
           FROM local_mutations WHERE user_id = $1 AND client_mutation_id = $2`,
          [this.userId, input.clientMutationId],
        )
        const mutation = rows[0] ? mutationFromRow(rows[0]) : null
        if (!mutation) return
        await database.execute(
          `UPDATE local_mutations SET status = $1, error = $2, in_flight_at = NULL,
             remote_payload = $3, remote_version = $4
           WHERE user_id = $5 AND client_mutation_id = $6`,
          [input.status, input.error ?? null,
            input.remoteValue === undefined ? null : JSON.stringify(input.remoteValue), input.remoteVersion ?? null,
            this.userId, input.clientMutationId],
        )
        const unresolved = await database.select<LocalMutationRow>(
          `SELECT client_mutation_id, user_id, resource_type, resource_id, mutation_type, base_version,
                  payload, status, created_at, error, in_flight_at, remote_payload, remote_version
           FROM local_mutations
           WHERE user_id = $1 AND resource_type = $2 AND resource_id = $3
             AND status IN ('pending', 'inflight', 'conflict', 'error')`,
          [this.userId, mutation.resourceType, mutation.resourceId],
        )
        const statuses = unresolved.map((item) => item.status)
        const resourceStatus: LocalSyncStatus = statuses.includes('pending') || statuses.includes('inflight')
          ? 'pending'
          : statuses.includes('conflict') ? 'conflict'
            : statuses.includes('error') ? 'error' : 'synced'
        await database.execute(
          `UPDATE local_resource_records SET sync_status = $1
           WHERE user_id = $2 AND resource_type = $3 AND resource_id = $4`,
          [resourceStatus, this.userId, mutation.resourceType, mutation.resourceId],
        )
      })
      return
    }
    const state = this.readBrowserState()
    const mutation = state.mutations.find((item) => item.userId === this.userId && item.clientMutationId === input.clientMutationId)
    if (!mutation) return
    mutation.status = input.status
    if (input.error) mutation.error = input.error
    else delete mutation.error
    if (input.remoteValue === undefined) delete mutation.remoteValue
    else mutation.remoteValue = clone(input.remoteValue)
    if (input.remoteVersion === undefined) delete mutation.remoteVersion
    else mutation.remoteVersion = input.remoteVersion
    const statuses = state.mutations
      .filter((item) => item.userId === this.userId && item.resourceType === mutation.resourceType
        && item.resourceId === mutation.resourceId && ['pending', 'inflight', 'conflict', 'error'].includes(item.status))
      .map((item) => item.status)
    const resource = state.resources.find((item) => item.userId === this.userId && item.resourceType === mutation.resourceType && item.id === mutation.resourceId)
    if (resource) {
      resource.syncStatus = statuses.includes('pending') || statuses.includes('inflight')
        ? 'pending' : statuses.includes('conflict') ? 'conflict' : statuses.includes('error') ? 'error' : 'synced'
    }
    this.writeBrowserState(state)
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
    const browserState = this.readBrowserState()
    browserState.sync = state
    this.writeBrowserState(browserState)
    return clone(state)
  }

  async replaceSnapshotPreservingPending(snapshot: LocalSnapshotItem[]): Promise<void> {
    if (this.sql && this.replaceSnapshot) {
      await this.ensureSql()
      await this.replaceSnapshot(snapshot)
      return
    }
    const pending = await this.listUnresolved()
    const pendingKeys = new Set(pending.map((item) => resourceKey(item.resourceType, item.resourceId)))
    const current = await this.list(undefined, { includeDeleted: true })
    const preserved = current.filter((item) => pendingKeys.has(resourceKey(item.resourceType, item.id)))

    if (this.sql) {
      await this.ensureSql()
      await this.sql.execute('BEGIN')
      try {
        await this.sql.execute('DELETE FROM local_resource_records WHERE user_id = $1', [this.userId])
        for (const item of snapshot) {
          if (pendingKeys.has(resourceKey(item.resourceType, item.resourceId))) continue
          await this.upsert(item.resourceType, item.resourceId, item.value, {
            version: item.version,
            deletedAt: item.deletedAt,
            syncStatus: 'synced',
          })
        }
        for (const item of preserved) {
          await this.upsert(item.resourceType, item.id, item.value, {
            version: item.version,
            deletedAt: item.deletedAt,
            syncStatus: item.syncStatus,
          })
        }
        await this.sql.execute('COMMIT')
      } catch (error) {
        await this.sql.execute('ROLLBACK')
        throw error
      }
      return
    }
    const state = this.readBrowserState()
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
  PACKAGING: ['UPLOADING', 'FAILED_LOCAL'],
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
