import {
  createVersionedLocalSchema,
  localAssetFileFromRow,
  localAssetSyncJobFromRow,
  localSourceDraftFromRow,
  type LocalAssetFileRow,
  type LocalAssetSyncJobRow,
  type LocalResourceRow,
  type LocalMutationRow,
  type LocalSourceDraftRow,
  type LocalSqlDatabase,
} from '@/services/localSchema'
import type { LocalStorageLike } from '@/services/legacyLocalData'
import { withLocalAssetLifecycleLock } from '@/services/localAssetLifecycleLock'
import {
  computeLocalAssetRelativePath,
  type LocalAssetFile,
  type LocalAssetState,
  type LocalAssetSyncJob,
  type LocalAssetSyncPhase,
  type LocalSourceDraft,
  type LocalSourceDraftState,
} from '@/types/localAsset'

export { computeLocalAssetRelativePath }

export interface CreateAssetFileInput {
  localAssetId: string
  serverAssetId?: string | null
  relativePath?: string
  safeExtension?: string
  originalName: string
  mimeType: string
  sizeBytes: number
  sha256: string
  state?: LocalAssetState
}

export interface CreateSourceDraftInput {
  localSourceId: string
  serverSourceId?: string | null
  localAssetId: string
  subjectId: string
  title: string
  localContentRevision: string
  serverIngestionRevision?: string | null
  state?: LocalSourceDraftState
}

export interface LocalAssetRepositoryOptions {
  sql?: LocalSqlDatabase
  storage?: LocalStorageLike
  schemaReady?: Promise<void>
  now?: () => string
  idFactory?: () => string
}

const LEGAL_ASSET_TRANSITIONS: Record<LocalAssetState, readonly LocalAssetState[]> = {
  STAGING: ['READY_LOCAL', 'CORRUPT', 'DELETING'],
  READY_LOCAL: ['SYNCING', 'SYNCED', 'CORRUPT', 'DELETING'],
  SYNCING: ['SYNCED', 'SYNC_FAILED', 'CORRUPT', 'DELETING'],
  SYNC_FAILED: ['SYNCING', 'SYNCED', 'CORRUPT', 'DELETING'],
  SYNCED: ['CORRUPT', 'DELETING'],
  CORRUPT: ['READY_LOCAL', 'SYNCED', 'DELETING'],
  // DELETING is a durable terminal fence.  A failed native delete is retried
  // by startup reconciliation; it is never rolled back in metadata.
  DELETING: [],
}

const LEGAL_SYNC_PHASE_TRANSITIONS: Record<LocalAssetSyncPhase, readonly LocalAssetSyncPhase[]> = {
  PENDING: ['CREATING_REMOTE_ASSET', 'FAILED'],
  CREATING_REMOTE_ASSET: ['UPLOADING', 'COMPLETING_REMOTE_ASSET', 'BINDING_SOURCE', 'SYNCED', 'PENDING', 'FAILED'],
  UPLOADING: ['COMPLETING_REMOTE_ASSET', 'BINDING_SOURCE', 'SYNCED', 'PENDING', 'FAILED'],
  COMPLETING_REMOTE_ASSET: ['BINDING_SOURCE', 'SYNCED', 'PENDING', 'FAILED'],
  BINDING_SOURCE: ['SYNCED', 'PENDING', 'FAILED'],
  SYNCED: [],
  FAILED: ['PENDING'],
}

const LEGAL_DRAFT_TRANSITIONS: Record<LocalSourceDraftState, readonly LocalSourceDraftState[]> = {
  DRAFT: ['SYNCING', 'SYNCED', 'DELETED'],
  SYNCING: ['SYNCED', 'DRAFT', 'DELETED'],
  SYNCED: ['DELETED'],
  DELETED: [],
}

interface BrowserStoreData {
  files: LocalAssetFile[]
  drafts: LocalSourceDraft[]
  jobs: LocalAssetSyncJob[]
}

const browserWriteQueues = new Map<string, Promise<void>>()
const sqlWriteQueues = new WeakMap<object, Promise<void>>()

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T
const encodePart = (value: string): string => encodeURIComponent(value.trim())

const fallbackMemoryStorage = new Map<string, string>()

function defaultStorage(): LocalStorageLike {
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage
  }
  return {
    getItem: (key: string) => fallbackMemoryStorage.get(key) ?? null,
    setItem: (key: string, value: string) => { fallbackMemoryStorage.set(key, String(value)) },
    removeItem: (key: string) => { fallbackMemoryStorage.delete(key) },
  }
}

export class LocalAssetRepository {
  readonly userId: string
  readonly serverDeviceId: string

  private readonly sql?: LocalSqlDatabase
  private readonly storage: LocalStorageLike
  private readonly schemaReady?: Promise<void>
  private readonly now: () => string
  private readonly idFactory: () => string
  private readonly namespace: string
  private sqlReady: Promise<void> | null = null

  constructor(userId: string, serverDeviceId: string, options: LocalAssetRepositoryOptions = {}) {
    if (!userId.trim()) throw new Error('LocalAssetRepository requires a userId')
    if (!serverDeviceId.trim()) throw new Error('LocalAssetRepository requires a serverDeviceId')
    if (options.sql && options.storage) {
      throw new Error('LocalAssetRepository accepts either sql or storage, not both')
    }

    this.userId = userId
    this.serverDeviceId = serverDeviceId
    this.sql = options.sql
    this.schemaReady = options.schemaReady
    this.storage = options.storage ?? defaultStorage()
    this.now = options.now ?? (() => new Date().toISOString())
    this.idFactory = options.idFactory ?? (() => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`)
    this.namespace = `auralis:v8:local-assets:${encodePart(userId)}:${encodePart(serverDeviceId)}`
  }

  private async ensureSql(): Promise<void> {
    if (!this.sql) return
    if (!this.sqlReady) {
      this.sqlReady = this.schemaReady ?? createVersionedLocalSchema(this.sql)
    }
    await this.sqlReady
  }

  private serializeWrite<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.sql
      ? (sqlWriteQueues.get(this.sql) ?? Promise.resolve())
      : (browserWriteQueues.get(this.namespace) ?? Promise.resolve())
    const result = previous.then(operation, operation)
    const settled = result.then(() => undefined, () => undefined)
    if (this.sql) sqlWriteQueues.set(this.sql, settled)
    else browserWriteQueues.set(this.namespace, settled)
    return result
  }

  private readBrowserStore(): BrowserStoreData {
    const raw = this.storage.getItem(this.namespace)
    if (!raw) return { files: [], drafts: [], jobs: [] }
    try {
      const parsed = JSON.parse(raw) as Partial<BrowserStoreData>
      return {
        files: Array.isArray(parsed.files) ? parsed.files : [],
        drafts: Array.isArray(parsed.drafts) ? parsed.drafts : [],
        jobs: Array.isArray(parsed.jobs) ? parsed.jobs : [],
      }
    } catch {
      return { files: [], drafts: [], jobs: [] }
    }
  }

  private writeBrowserStore(data: BrowserStoreData): void {
    this.storage.setItem(this.namespace, JSON.stringify(data))
  }

  // --- Local Asset Files ---

  async createAssetFile(input: CreateAssetFileInput): Promise<LocalAssetFile> {
    return this.serializeWrite(async () => {
      const now = this.now()
      const state: LocalAssetState = input.state ?? 'READY_LOCAL'
      const safeExtension = input.safeExtension || (input.originalName.includes('.') ? input.originalName.split('.').pop()! : 'bin')
      const relativePath = input.relativePath?.trim()
        ? input.relativePath.trim()
        : computeLocalAssetRelativePath(this.userId, input.localAssetId, safeExtension)

      if (/^([a-zA-Z]:|[\\/]{2}|[\\/])/.test(relativePath)) {
        throw new Error('LOCAL_ASSET_RELATIVE_PATH_INVALID: absolute paths must never be persisted in SQLite')
      }

      const file: LocalAssetFile = {
        userId: this.userId,
        serverDeviceId: this.serverDeviceId,
        localAssetId: input.localAssetId,
        serverAssetId: input.serverAssetId ?? null,
        relativePath,
        originalName: input.originalName,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        sha256: input.sha256,
        state,
        createdAt: now,
        verifiedAt: now,
        lastAccessedAt: now,
        deletedAt: null,
      }

      if (this.sql) {
        await this.ensureSql()
        await this.sql.execute(
          `INSERT INTO local_asset_files (
            user_id, device_id, local_asset_id, server_asset_id, relative_path,
            original_name, mime_type, size_bytes, sha256, state,
            created_at, verified_at, last_accessed_at, deleted_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
          [
            file.userId, file.serverDeviceId, file.localAssetId, file.serverAssetId, file.relativePath,
            file.originalName, file.mimeType, file.sizeBytes, file.sha256, file.state,
            file.createdAt, file.verifiedAt, file.lastAccessedAt, file.deletedAt,
          ],
        )
        return file
      }

      const store = this.readBrowserStore()
      const existing = store.files.find(f => f.localAssetId === input.localAssetId)
      if (existing) {
        throw new Error('LOCAL_ASSET_DUPLICATE')
      }
      store.files.push(file)
      this.writeBrowserStore(store)
      return clone(file)
    })
  }

  async getAssetFile(localAssetId: string): Promise<LocalAssetFile | null> {
    if (this.sql) {
      await this.ensureSql()
      const rows = await this.sql.select<LocalAssetFileRow>(
        'SELECT * FROM local_asset_files WHERE user_id = $1 AND device_id = $2 AND local_asset_id = $3',
        [this.userId, this.serverDeviceId, localAssetId],
      )
      return rows[0] ? localAssetFileFromRow(rows[0]) : null
    }

    const store = this.readBrowserStore()
    const found = store.files.find(f => f.localAssetId === localAssetId)
    return found ? clone(found) : null
  }

  async getAssetFileByServerId(serverAssetId: string): Promise<LocalAssetFile | null> {
    if (!serverAssetId.trim()) return null
    if (this.sql) {
      await this.ensureSql()
      const rows = await this.sql.select<LocalAssetFileRow>(
        'SELECT * FROM local_asset_files WHERE user_id = $1 AND device_id = $2 AND server_asset_id = $3',
        [this.userId, this.serverDeviceId, serverAssetId],
      )
      return rows[0] ? localAssetFileFromRow(rows[0]) : null
    }

    const store = this.readBrowserStore()
    const found = store.files.find(f => f.serverAssetId === serverAssetId)
    return found ? clone(found) : null
  }

  async listAssetFiles(filter?: { state?: LocalAssetState }): Promise<LocalAssetFile[]> {
    if (this.sql) {
      await this.ensureSql()
      let query = 'SELECT * FROM local_asset_files WHERE user_id = $1 AND device_id = $2'
      const params: unknown[] = [this.userId, this.serverDeviceId]
      if (filter?.state) {
        query += ' AND state = $3'
        params.push(filter.state)
      }
      query += ' ORDER BY created_at DESC'
      const rows = await this.sql.select<LocalAssetFileRow>(query, params)
      return rows.map(localAssetFileFromRow)
    }

    const store = this.readBrowserStore()
    let results = store.files
    if (filter?.state) {
      results = results.filter(f => f.state === filter.state)
    }
    return clone(results)
  }

  async transitionAssetState(
    localAssetId: string,
    toState: LocalAssetState,
    extra?: { verifiedAt?: string; lastAccessedAt?: string; deletedAt?: string | null },
  ): Promise<LocalAssetFile> {
    return this.serializeWrite(() => this.transitionAssetStateUnsafe(localAssetId, toState, extra))
  }

  private async transitionAssetStateUnsafe(
    localAssetId: string,
    toState: LocalAssetState,
    extra?: { verifiedAt?: string; lastAccessedAt?: string; deletedAt?: string | null },
  ): Promise<LocalAssetFile> {
    const current = await this.getAssetFile(localAssetId)
    if (!current) throw new Error('LOCAL_ASSET_NOT_FOUND')

    const allowed = LEGAL_ASSET_TRANSITIONS[current.state]
    if (!allowed.includes(toState)) {
      throw new Error(`LOCAL_ASSET_ILLEGAL_TRANSITION: Cannot transition asset from ${current.state} to ${toState}`)
    }

    const now = this.now()
    const verifiedAt = extra?.verifiedAt ?? current.verifiedAt
    const lastAccessedAt = extra?.lastAccessedAt ?? current.lastAccessedAt
    const deletedAt = extra?.deletedAt !== undefined ? extra.deletedAt : (toState === 'DELETING' ? now : current.deletedAt)

    if (this.sql) {
      await this.ensureSql()
      await this.sql.execute(
        `UPDATE local_asset_files
         SET state = $1, verified_at = $2, last_accessed_at = $3, deleted_at = $4
         WHERE user_id = $5 AND device_id = $6 AND local_asset_id = $7`,
        [toState, verifiedAt, lastAccessedAt, deletedAt, this.userId, this.serverDeviceId, localAssetId],
      )
      return {
        ...current,
        state: toState,
        verifiedAt,
        lastAccessedAt,
        deletedAt,
      }
    }

    const store = this.readBrowserStore()
    const index = store.files.findIndex(f => f.localAssetId === localAssetId)
    if (index >= 0) {
      store.files[index] = {
        ...store.files[index],
        state: toState,
        verifiedAt,
        lastAccessedAt,
        deletedAt,
      }
      this.writeBrowserStore(store)
      return clone(store.files[index])
    }
    throw new Error('LOCAL_ASSET_NOT_FOUND')
  }

  /**
   * Atomically re-check Source references and publish the terminal delete
   * fence under the repository's serialized write boundary.  Source writes
   * use the owner lifecycle mutex before entering this method, so a new
   * reference cannot land between the count and DELETING transition.
   */
  async markUnreferencedAssetDeleting(localAssetId: string): Promise<LocalAssetFile | null> {
    return this.serializeWrite(async () => {
      if (await this.hasActiveSourceReferences(localAssetId)) {
        throw new Error('ASSET_HAS_ACTIVE_REFERENCES: Cannot delete asset while active source drafts, records, or mutations still reference it')
      }
      const current = await this.getAssetFile(localAssetId)
      if (!current || current.state === 'DELETING') return current
      return this.transitionAssetStateUnsafe(localAssetId, 'DELETING')
    })
  }

  async mapServerAssetId(localAssetId: string, serverAssetId: string): Promise<LocalAssetFile> {
    return this.serializeWrite(async () => {
      const existingWithServerId = await this.getAssetFileByServerId(serverAssetId)
      if (existingWithServerId && existingWithServerId.localAssetId !== localAssetId) {
        throw new Error('LOCAL_ASSET_SERVER_ID_DUPLICATE')
      }

      const current = await this.getAssetFile(localAssetId)
      if (!current) throw new Error('LOCAL_ASSET_NOT_FOUND')

      if (this.sql) {
        await this.ensureSql()
        await this.sql.execute(
          'UPDATE local_asset_files SET server_asset_id = $1 WHERE user_id = $2 AND device_id = $3 AND local_asset_id = $4',
          [serverAssetId, this.userId, this.serverDeviceId, localAssetId],
        )
        return { ...current, serverAssetId }
      }

      const store = this.readBrowserStore()
      const index = store.files.findIndex(f => f.localAssetId === localAssetId)
      if (index >= 0) {
        store.files[index] = { ...store.files[index], serverAssetId }
        this.writeBrowserStore(store)
        return clone(store.files[index])
      }
      throw new Error('LOCAL_ASSET_NOT_FOUND')
    })
  }

  async touchAssetAccess(localAssetId: string): Promise<void> {
    const now = this.now()
    if (this.sql) {
      await this.ensureSql()
      await this.sql.execute(
        'UPDATE local_asset_files SET last_accessed_at = $1 WHERE user_id = $2 AND device_id = $3 AND local_asset_id = $4',
        [now, this.userId, this.serverDeviceId, localAssetId],
      )
      return
    }

    const store = this.readBrowserStore()
    const index = store.files.findIndex(f => f.localAssetId === localAssetId)
    if (index >= 0) {
      store.files[index].lastAccessedAt = now
      this.writeBrowserStore(store)
    }
  }

  async deleteAssetFile(localAssetId: string): Promise<void> {
    return this.serializeWrite(async () => {
      if (this.sql) {
        await this.ensureSql()
        await this.sql.execute(
          'DELETE FROM local_asset_files WHERE user_id = $1 AND device_id = $2 AND local_asset_id = $3',
          [this.userId, this.serverDeviceId, localAssetId],
        )
        return
      }

      const store = this.readBrowserStore()
      store.files = store.files.filter(f => f.localAssetId !== localAssetId)
      this.writeBrowserStore(store)
    })
  }

  /**
   * Fence an asset upload before a user-driven Source deletion.  Removing the
   * durable job row is intentional: an already-running queue observes the
   * missing row and must not recreate it during its error recovery path.
   */
  async cancelSyncJobsForAsset(localAssetId: string): Promise<number> {
    return this.serializeWrite(async () => {
      if (this.sql) {
        await this.ensureSql()
        const rows = await this.sql.select<{ count: number }>(
          `SELECT COUNT(*) AS count FROM local_asset_sync_jobs
           WHERE user_id = $1 AND device_id = $2 AND local_asset_id = $3 AND phase <> 'SYNCED'`,
          [this.userId, this.serverDeviceId, localAssetId],
        )
        await this.sql.execute(
          `DELETE FROM local_asset_sync_jobs
           WHERE user_id = $1 AND device_id = $2 AND local_asset_id = $3 AND phase <> 'SYNCED'`,
          [this.userId, this.serverDeviceId, localAssetId],
        )
        return Number(rows[0]?.count ?? 0)
      }

      const store = this.readBrowserStore()
      const before = store.jobs.length
      store.jobs = store.jobs.filter((job) => !(job.localAssetId === localAssetId && job.phase !== 'SYNCED'))
      this.writeBrowserStore(store)
      return before - store.jobs.length
    })
  }

  // --- Local Source Drafts ---

  async createSourceDraft(input: CreateSourceDraftInput): Promise<LocalSourceDraft> {
    return withLocalAssetLifecycleLock(this.userId, this.serverDeviceId, () => this.serializeWrite(async () => {
      const asset = await this.getAssetFile(input.localAssetId)
      if (!asset) throw new Error('LOCAL_ASSET_NOT_FOUND')
      if (asset.state === 'DELETING') throw new Error('LOCAL_ASSET_DELETE_FENCED')
      const now = this.now()
      const state: LocalSourceDraftState = input.state ?? 'DRAFT'
      const draft: LocalSourceDraft = {
        userId: this.userId,
        serverDeviceId: this.serverDeviceId,
        localSourceId: input.localSourceId,
        serverSourceId: input.serverSourceId ?? null,
        localAssetId: input.localAssetId,
        subjectId: input.subjectId,
        title: input.title,
        localContentRevision: input.localContentRevision,
        serverIngestionRevision: input.serverIngestionRevision ?? null,
        state,
        createdAt: now,
        updatedAt: now,
      }

      if (this.sql) {
        await this.ensureSql()
        await this.sql.execute(
          `INSERT INTO local_source_drafts (
            user_id, device_id, local_source_id, server_source_id, local_asset_id,
            subject_id, title, local_content_revision, server_ingestion_revision, state,
            created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
          [
            draft.userId, draft.serverDeviceId, draft.localSourceId, draft.serverSourceId, draft.localAssetId,
            draft.subjectId, draft.title, draft.localContentRevision, draft.serverIngestionRevision, draft.state,
            draft.createdAt, draft.updatedAt,
          ],
        )
        return draft
      }

      const store = this.readBrowserStore()
      const existing = store.drafts.find(d => d.localSourceId === input.localSourceId)
      if (existing) throw new Error('LOCAL_SOURCE_DRAFT_DUPLICATE')
      store.drafts.push(draft)
      this.writeBrowserStore(store)
      return clone(draft)
    }))
  }

  async getSourceDraft(localSourceId: string): Promise<LocalSourceDraft | null> {
    if (this.sql) {
      await this.ensureSql()
      const rows = await this.sql.select<LocalSourceDraftRow>(
        'SELECT * FROM local_source_drafts WHERE user_id = $1 AND device_id = $2 AND local_source_id = $3',
        [this.userId, this.serverDeviceId, localSourceId],
      )
      return rows[0] ? localSourceDraftFromRow(rows[0]) : null
    }

    const store = this.readBrowserStore()
    const found = store.drafts.find(d => d.localSourceId === localSourceId)
    return found ? clone(found) : null
  }

  async listSourceDrafts(filter?: { localAssetId?: string; state?: LocalSourceDraftState }): Promise<LocalSourceDraft[]> {
    if (this.sql) {
      await this.ensureSql()
      let query = 'SELECT * FROM local_source_drafts WHERE user_id = $1 AND device_id = $2'
      const params: unknown[] = [this.userId, this.serverDeviceId]
      if (filter?.localAssetId) {
        query += ` AND local_asset_id = $${params.length + 1}`
        params.push(filter.localAssetId)
      }
      if (filter?.state) {
        query += ` AND state = $${params.length + 1}`
        params.push(filter.state)
      }
      query += ' ORDER BY created_at DESC'
      const rows = await this.sql.select<LocalSourceDraftRow>(query, params)
      return rows.map(localSourceDraftFromRow)
    }

    const store = this.readBrowserStore()
    let results = store.drafts
    if (filter?.localAssetId) {
      results = results.filter(d => d.localAssetId === filter.localAssetId)
    }
    if (filter?.state) {
      results = results.filter(d => d.state === filter.state)
    }
    return clone(results)
  }

  async updateSourceDraft(localSourceId: string, updates: Partial<LocalSourceDraft>): Promise<LocalSourceDraft> {
    return this.serializeWrite(async () => {
      const current = await this.getSourceDraft(localSourceId)
      if (!current) throw new Error('LOCAL_SOURCE_DRAFT_NOT_FOUND')

      if (updates.state && updates.state !== current.state) {
        const allowed = LEGAL_DRAFT_TRANSITIONS[current.state]
        if (!allowed.includes(updates.state)) {
          throw new Error(`LOCAL_SOURCE_DRAFT_ILLEGAL_TRANSITION: Cannot transition draft from ${current.state} to ${updates.state}`)
        }
      }

      const now = this.now()
      const updated: LocalSourceDraft = {
        ...current,
        ...updates,
        userId: this.userId,
        serverDeviceId: this.serverDeviceId,
        localSourceId,
        updatedAt: now,
      }

      if (this.sql) {
        await this.ensureSql()
        await this.sql.execute(
          `UPDATE local_source_drafts
           SET server_source_id = $1, subject_id = $2, title = $3, local_content_revision = $4,
               server_ingestion_revision = $5, state = $6, updated_at = $7
           WHERE user_id = $8 AND device_id = $9 AND local_source_id = $10`,
          [
            updated.serverSourceId, updated.subjectId, updated.title, updated.localContentRevision,
            updated.serverIngestionRevision, updated.state, updated.updatedAt,
            this.userId, this.serverDeviceId, localSourceId,
          ],
        )
        return updated
      }

      const store = this.readBrowserStore()
      const index = store.drafts.findIndex(d => d.localSourceId === localSourceId)
      if (index >= 0) {
        store.drafts[index] = updated
        this.writeBrowserStore(store)
        return clone(updated)
      }
      throw new Error('LOCAL_SOURCE_DRAFT_NOT_FOUND')
    })
  }

  async bindServerSource(
    localSourceId: string,
    serverSourceId: string,
    serverIngestionRevision: string,
  ): Promise<LocalSourceDraft> {
    return this.updateSourceDraft(localSourceId, {
      serverSourceId,
      serverIngestionRevision,
      state: 'SYNCED',
    })
  }

  async deleteSourceDraft(localSourceId: string): Promise<void> {
    await this.updateSourceDraft(localSourceId, { state: 'DELETED' })
  }

  // --- Source Reference Counting ---

  async countActiveSourceReferences(localAssetId: string, excludedSourceIds: ReadonlySet<string> = new Set()): Promise<number> {
    const sourceIds = new Set<string>()
    const asset = await this.getAssetFile(localAssetId)
    const serverAssetId = asset?.serverAssetId ?? null
    const allDrafts = await this.listSourceDrafts({ localAssetId })
    const draftsBySource = new Map(allDrafts.map((draft) => [draft.localSourceId, draft]))

    // 1. Active drafts referencing localAssetId.  Drafts and their eventual
    // SOURCE resource/mutation all represent the same logical Source, so use
    // the same key here to avoid counting one Source twice during the
    // draft->resource hand-off.
    for (const draft of allDrafts.filter(d => d.state !== 'DELETED' && !excludedSourceIds.has(d.localSourceId))) sourceIds.add(`source:${draft.localSourceId}`)

    // 2. Active SOURCE records in local_resource_records
    if (this.sql) {
      await this.ensureSql()
      const resourceRows = await this.sql.select<LocalResourceRow>(
        "SELECT * FROM local_resource_records WHERE user_id = $1 AND resource_type = 'SOURCE'",
        [this.userId],
      )
      for (const row of resourceRows) {
        try {
          const payload = JSON.parse(row.payload) as Record<string, unknown>
          // A tombstone is still a server-side reference until its SOURCE
          // mutation is settled.  Once synced, it is safe to release it.
          const deletedDraft = draftsBySource.get(row.resource_id)
          // A never-released local draft has no server Source to protect.  A
          // released/synced draft keeps the server-side reference until its
          // tombstone is acknowledged.
          const localOnlyDraftTombstone = row.deleted_at !== null
            && deletedDraft?.state === 'DELETED'
            && !deletedDraft.serverSourceId
          const isReference = !localOnlyDraftTombstone && (row.deleted_at === null || row.sync_status !== 'synced')
          if (!excludedSourceIds.has(row.resource_id) && isReference && (
            (payload.assetId && (payload.assetId === localAssetId || (serverAssetId && payload.assetId === serverAssetId))) ||
            (payload.localAssetId && payload.localAssetId === localAssetId)
          )) {
            sourceIds.add(`source:${row.resource_id}`)
          }
        } catch {
          // ignore malformed payload
        }
      }

      // 3. Pending/inflight SOURCE mutations
      const mutationRows = await this.sql.select<LocalMutationRow>(
        "SELECT * FROM local_mutations WHERE user_id = $1 AND resource_type = 'SOURCE' AND status IN ('pending', 'inflight', 'conflict', 'error')",
        [this.userId],
      )
      for (const row of mutationRows) {
        try {
          const payload = JSON.parse(row.payload) as Record<string, unknown>
          if (!excludedSourceIds.has(row.resource_id) && (
            (payload.assetId && (payload.assetId === localAssetId || (serverAssetId && payload.assetId === serverAssetId))) ||
            (payload.localAssetId && payload.localAssetId === localAssetId)
          )) {
            sourceIds.add(`source:${row.resource_id}`)
          }
        } catch {
          // ignore malformed payload
        }
      }
    } else {
      // Browser storage check against local_resource_records / state
      const v2StateKey = `auralis:v2:${encodePart(this.userId)}:${encodePart(this.serverDeviceId)}:state`
      const raw = this.storage.getItem(v2StateKey)
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as {
            resources?: Array<{ resourceType: string; id: string; deletedAt: string | null; syncStatus?: string; value: Record<string, unknown> }>
            mutations?: Array<{ resourceType: string; resourceId?: string; status: string; payload?: Record<string, unknown> }>
          }
          if (Array.isArray(parsed.resources)) {
            for (const rec of parsed.resources) {
              const isReference = rec.deletedAt === null || rec.syncStatus !== 'synced'
              if (!excludedSourceIds.has(rec.id) && rec.resourceType === 'SOURCE' && isReference && rec.value) {
                if (
                  (rec.value.assetId && (rec.value.assetId === localAssetId || (serverAssetId && rec.value.assetId === serverAssetId))) ||
                  (rec.value.localAssetId && rec.value.localAssetId === localAssetId)
                ) {
                  sourceIds.add(`source:${rec.id}`)
                }
              }
            }
          }
          if (Array.isArray(parsed.mutations)) {
            for (const mut of parsed.mutations) {
              if ((!mut.resourceId || !excludedSourceIds.has(mut.resourceId)) && mut.resourceType === 'SOURCE' && ['pending', 'inflight'].includes(mut.status) && mut.payload) {
                if (
                  (mut.payload.assetId && (mut.payload.assetId === localAssetId || (serverAssetId && mut.payload.assetId === serverAssetId))) ||
                  (mut.payload.localAssetId && mut.payload.localAssetId === localAssetId)
                ) {
                  sourceIds.add(`source:${mut.resourceId ?? mut.payload?.id ?? 'mutation'}`)
                }
              }
            }
          }
        } catch {
          // ignore
        }
      }
    }

    return sourceIds.size
  }

  async hasActiveSourceReferences(localAssetId: string, excludedSourceIds: ReadonlySet<string> = new Set()): Promise<boolean> {
    const count = await this.countActiveSourceReferences(localAssetId, excludedSourceIds)
    return count > 0
  }

  // --- Local Asset Sync Jobs ---

  async enqueueSyncJob(localAssetId: string, options?: { serverAssetId?: string }): Promise<LocalAssetSyncJob> {
    return this.serializeWrite(async () => {
      const active = await this.getActiveSyncJobForAsset(localAssetId)
      if (active) return active

      const now = this.now()
      const job: LocalAssetSyncJob = {
        jobId: this.idFactory(),
        userId: this.userId,
        serverDeviceId: this.serverDeviceId,
        localAssetId,
        phase: 'PENDING',
        attempt: 0,
        nextRetryAt: null,
        serverAssetId: options?.serverAssetId ?? null,
        safeErrorCode: null,
        safeErrorDetail: null,
        createdAt: now,
        updatedAt: now,
      }

      if (this.sql) {
        await this.ensureSql()
        await this.sql.execute(
          `INSERT INTO local_asset_sync_jobs (
            job_id, user_id, device_id, local_asset_id, phase, attempt,
            next_retry_at, server_asset_id, safe_error_code, safe_error_detail,
            created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
          [
            job.jobId, job.userId, job.serverDeviceId, job.localAssetId, job.phase, job.attempt,
            job.nextRetryAt, job.serverAssetId, job.safeErrorCode, job.safeErrorDetail,
            job.createdAt, job.updatedAt,
          ],
        )
        return job
      }

      const store = this.readBrowserStore()
      store.jobs.push(job)
      this.writeBrowserStore(store)
      return clone(job)
    })
  }

  async getSyncJob(jobId: string): Promise<LocalAssetSyncJob | null> {
    if (this.sql) {
      await this.ensureSql()
      const rows = await this.sql.select<LocalAssetSyncJobRow>(
        'SELECT * FROM local_asset_sync_jobs WHERE user_id = $1 AND device_id = $2 AND job_id = $3',
        [this.userId, this.serverDeviceId, jobId],
      )
      return rows[0] ? localAssetSyncJobFromRow(rows[0]) : null
    }

    const store = this.readBrowserStore()
    const found = store.jobs.find(j => j.jobId === jobId)
    return found ? clone(found) : null
  }

  async getActiveSyncJobForAsset(localAssetId: string): Promise<LocalAssetSyncJob | null> {
    if (this.sql) {
      await this.ensureSql()
      const rows = await this.sql.select<LocalAssetSyncJobRow>(
        "SELECT * FROM local_asset_sync_jobs WHERE user_id = $1 AND device_id = $2 AND local_asset_id = $3 AND phase <> 'SYNCED'",
        [this.userId, this.serverDeviceId, localAssetId],
      )
      return rows[0] ? localAssetSyncJobFromRow(rows[0]) : null
    }

    const store = this.readBrowserStore()
    const found = store.jobs.find(j => j.localAssetId === localAssetId && j.phase !== 'SYNCED')
    return found ? clone(found) : null
  }

  async claimNextSyncJob(now?: string): Promise<LocalAssetSyncJob | null> {
    return this.serializeWrite(async () => {
      const currentTime = now ?? this.now()

      if (this.sql) {
        await this.ensureSql()
        const rows = await this.sql.select<LocalAssetSyncJobRow>(
          `SELECT * FROM local_asset_sync_jobs
           WHERE user_id = $1 AND device_id = $2 AND phase = 'PENDING'
             AND (next_retry_at IS NULL OR next_retry_at <= $3)
           ORDER BY created_at ASC
           LIMIT 1`,
          [this.userId, this.serverDeviceId, currentTime],
        )
        if (!rows[0]) return null
        const job = localAssetSyncJobFromRow(rows[0])
        const nextAttempt = job.attempt + 1
        await this.sql.execute(
          `UPDATE local_asset_sync_jobs
           SET phase = 'CREATING_REMOTE_ASSET', attempt = $1, updated_at = $2
           WHERE user_id = $3 AND device_id = $4 AND job_id = $5`,
          [nextAttempt, currentTime, this.userId, this.serverDeviceId, job.jobId],
        )
        return {
          ...job,
          phase: 'CREATING_REMOTE_ASSET',
          attempt: nextAttempt,
          updatedAt: currentTime,
        }
      }

      const store = this.readBrowserStore()
      const eligible = store.jobs
        .filter(j => j.phase === 'PENDING' && (j.nextRetryAt === null || j.nextRetryAt <= currentTime))
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))

      if (eligible.length === 0) return null
      const target = eligible[0]
      const index = store.jobs.findIndex(j => j.jobId === target.jobId)
      if (index >= 0) {
        store.jobs[index] = {
          ...store.jobs[index],
          phase: 'CREATING_REMOTE_ASSET',
          attempt: store.jobs[index].attempt + 1,
          updatedAt: currentTime,
        }
        this.writeBrowserStore(store)
        return clone(store.jobs[index])
      }
      return null
    })
  }

  async updateSyncJobPhase(
    jobId: string,
    phase: LocalAssetSyncPhase,
    extra?: { serverAssetId?: string },
  ): Promise<LocalAssetSyncJob> {
    return this.serializeWrite(async () => {
      const current = await this.getSyncJob(jobId)
      if (!current) throw new Error('LOCAL_ASSET_SYNC_JOB_NOT_FOUND')

      const allowed = LEGAL_SYNC_PHASE_TRANSITIONS[current.phase]
      if (!allowed.includes(phase)) {
        throw new Error(`LOCAL_ASSET_SYNC_ILLEGAL_TRANSITION: Cannot transition job from ${current.phase} to ${phase}`)
      }

      const now = this.now()
      const serverAssetId = extra?.serverAssetId ?? current.serverAssetId
      const updated: LocalAssetSyncJob = {
        ...current,
        phase,
        serverAssetId,
        updatedAt: now,
      }

      if (this.sql) {
        await this.ensureSql()
        await this.sql.execute(
          `UPDATE local_asset_sync_jobs
           SET phase = $1, server_asset_id = $2, updated_at = $3
           WHERE user_id = $4 AND device_id = $5 AND job_id = $6`,
          [phase, serverAssetId, now, this.userId, this.serverDeviceId, jobId],
        )
        return updated
      }

      const store = this.readBrowserStore()
      const index = store.jobs.findIndex(j => j.jobId === jobId)
      if (index >= 0) {
        store.jobs[index] = updated
        this.writeBrowserStore(store)
        return clone(updated)
      }
      throw new Error('LOCAL_ASSET_SYNC_JOB_NOT_FOUND')
    })
  }

  async scheduleRetry(
    jobId: string,
    errorCode: string,
    errorDetail: string,
    nextRetryAt: string,
  ): Promise<LocalAssetSyncJob> {
    return this.serializeWrite(async () => {
      const current = await this.getSyncJob(jobId)
      if (!current) throw new Error('LOCAL_ASSET_SYNC_JOB_NOT_FOUND')

      const now = this.now()
      const safeCode = /^[A-Z0-9_]{1,64}$/.test(errorCode) ? errorCode : 'SYNC_FAILED'
      const safeDetail = errorDetail.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 500)

      const updated: LocalAssetSyncJob = {
        ...current,
        phase: 'PENDING',
        safeErrorCode: safeCode,
        safeErrorDetail: safeDetail,
        nextRetryAt,
        updatedAt: now,
      }

      if (this.sql) {
        await this.ensureSql()
        await this.sql.execute(
          `UPDATE local_asset_sync_jobs
           SET phase = 'PENDING', safe_error_code = $1, safe_error_detail = $2, next_retry_at = $3, updated_at = $4
           WHERE user_id = $5 AND device_id = $6 AND job_id = $7`,
          [safeCode, safeDetail, nextRetryAt, now, this.userId, this.serverDeviceId, jobId],
        )
        return updated
      }

      const store = this.readBrowserStore()
      const index = store.jobs.findIndex(j => j.jobId === jobId)
      if (index >= 0) {
        store.jobs[index] = updated
        this.writeBrowserStore(store)
        return clone(updated)
      }
      throw new Error('LOCAL_ASSET_SYNC_JOB_NOT_FOUND')
    })
  }

  async completeSyncJob(jobId: string): Promise<LocalAssetSyncJob> {
    return this.updateSyncJobPhase(jobId, 'SYNCED')
  }

  async recoverInflightJobs(): Promise<number> {
    return this.serializeWrite(async () => {
      const now = this.now()
      if (this.sql) {
        await this.ensureSql()
        const rows = await this.sql.select<{ count: number }>(
          `SELECT COUNT(*) as count FROM local_asset_sync_jobs
           WHERE user_id = $1 AND device_id = $2
             AND phase IN ('CREATING_REMOTE_ASSET', 'UPLOADING', 'COMPLETING_REMOTE_ASSET', 'BINDING_SOURCE')`,
          [this.userId, this.serverDeviceId],
        )
        const count = rows[0]?.count ?? 0
        if (count > 0) {
          await this.sql.execute(
            `UPDATE local_asset_sync_jobs
             SET phase = 'PENDING', updated_at = $1
             WHERE user_id = $2 AND device_id = $3
               AND phase IN ('CREATING_REMOTE_ASSET', 'UPLOADING', 'COMPLETING_REMOTE_ASSET', 'BINDING_SOURCE')`,
            [now, this.userId, this.serverDeviceId],
          )
        }
        return Number(count)
      }

      const store = this.readBrowserStore()
      let recovered = 0
      for (const job of store.jobs) {
        if (['CREATING_REMOTE_ASSET', 'UPLOADING', 'COMPLETING_REMOTE_ASSET', 'BINDING_SOURCE'].includes(job.phase)) {
          job.phase = 'PENDING'
          job.updatedAt = now
          recovered++
        }
      }
      if (recovered > 0) {
        this.writeBrowserStore(store)
      }
      return recovered
    })
  }
}
