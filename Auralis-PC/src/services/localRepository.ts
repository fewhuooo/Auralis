import type {
  LocalEntity,
  LocalMutation,
  LocalMutationStatus,
  LocalSyncStatus,
} from '@/types/api'
import {
  createVersionedLocalSchema,
  mutationFromRow,
  resourceFromRow,
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
  schemaVersion: 2,
}

export class LocalRepository {
  readonly userId: string
  readonly deviceId: string

  private readonly storage: LocalStorageLike
  private readonly sql?: LocalSqlDatabase
  private readonly now: () => string
  private readonly idFactory: () => string
  private readonly namespace: string
  private sqlReady: Promise<void> | null = null

  constructor(userId: string, deviceId: string, options: LocalRepositoryOptions = {}) {
    if (!userId.trim()) throw new Error('LocalRepository requires a userId')
    if (!deviceId.trim()) throw new Error('LocalRepository requires a deviceId')
    if (options.sql && options.storage) {
      throw new Error('LocalRepository accepts either sql or storage, not both')
    }
    this.userId = userId
    this.deviceId = deviceId
    this.sql = options.sql
    this.storage = options.storage ?? browserStorage() ?? createMemoryStorage()
    this.now = options.now ?? (() => new Date().toISOString())
    this.idFactory = options.idFactory ?? (() => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`)
    this.namespace = `auralis:v2:${encodePart(userId)}:${encodePart(deviceId)}`
  }

  private async ensureSql(): Promise<void> {
    if (!this.sql) return
    if (!this.sqlReady) {
      this.sqlReady = createVersionedLocalSchema(this.sql)
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

  async enqueueMutation(input: LocalMutationInput): Promise<LocalMutation> {
    const mutation: LocalMutation = {
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
         WHERE user_id = $1 AND status IN ('pending', 'conflict', 'error')${typeClause}
         ORDER BY created_at ASC`,
        params,
      )
      return rows.map(mutationFromRow)
    }
    const state = this.readBrowserState()
    return state.mutations
      .filter((item) => item.userId === this.userId && ['pending', 'conflict', 'error'].includes(item.status))
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

  async getSyncState(): Promise<LocalSyncState> {
    if (this.sql) {
      await this.ensureSql()
      const rows = await this.sql.select<Record<string, unknown>>(
        `SELECT cursor, reset_required, schema_version FROM sync_metadata
         WHERE user_id = $1 AND device_id = $2`,
        [this.userId, this.deviceId],
      )
      const row = rows[0]
      return row
        ? { cursor: row.cursor == null ? null : String(row.cursor), resetRequired: Boolean(row.reset_required), schemaVersion: Number(row.schema_version ?? 2) }
        : { ...DEFAULT_SYNC_STATE }
    }
    return clone(this.readBrowserState().sync)
  }

  async saveCursor(cursor: string | null, resetRequired = false): Promise<LocalSyncState> {
    const state: LocalSyncState = { cursor, resetRequired, schemaVersion: 2 }
    if (this.sql) {
      await this.ensureSql()
      await this.sql.execute(
        `INSERT INTO sync_metadata (user_id, device_id, cursor, reset_required, schema_version)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (user_id, device_id) DO UPDATE SET
           cursor = excluded.cursor,
           reset_required = excluded.reset_required,
           schema_version = excluded.schema_version`,
        [this.userId, this.deviceId, cursor, resetRequired ? 1 : 0, 2],
      )
      return state
    }
    const browserState = this.readBrowserState()
    browserState.sync = state
    this.writeBrowserState(browserState)
    return clone(state)
  }

  async replaceSnapshotPreservingPending(snapshot: LocalSnapshotItem[]): Promise<void> {
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

export function createLocalRepository(
  userId: string,
  deviceId: string,
  options: LocalRepositoryOptions = {},
): LocalRepository {
  return new LocalRepository(userId, deviceId, options)
}
