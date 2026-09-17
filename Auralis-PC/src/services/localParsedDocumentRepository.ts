import {
  createVersionedLocalSchema,
  localParsedDocumentFromRow,
  sanitizeLocalCacheReceipt,
  sanitizeParsedDocumentServerReceipt,
  type LocalParsedDocumentRow,
  type LocalSqlDatabase,
} from '@/services/localSchema'
import type { LocalStorageLike } from '@/services/legacyLocalData'
import {
  type DocumentCacheReceipt,
  isDocumentCacheReceiptV1,
  type LocalCacheReceipt,
  isLocalCacheReceiptV1,
  type LocalCacheBindRequest,
} from '@/api/tauri'
import {
  type BindServerRevisionInput,
  type CreateLocalParsedDocumentInput,
  LOCAL_PARSED_DOCUMENT_PHASES,
  type LocalParsedDocumentPhase,
  type LocalParsedDocumentRecord,
  type LocalParsedDocumentTransitionOptions,
} from '@/types/localParsedDocument'

export interface LocalParsedDocumentRepositoryOptions {
  sql?: LocalSqlDatabase
  storage?: LocalStorageLike
  schemaReady?: Promise<void>
  now?: () => string
}

export const LEGAL_LOCAL_PARSED_DOCUMENT_TRANSITIONS: Record<LocalParsedDocumentPhase, readonly LocalParsedDocumentPhase[]> = {
  QUEUED: ['EXTRACTING', 'OCR_RUNNING', 'LOCAL_PARSED_READY', 'PAUSED_NETWORK', 'FAILED_LOCAL', 'CORRUPT', 'SUPERSEDED'],
  EXTRACTING: ['EXTRACTING', 'OCR_RUNNING', 'LOCAL_PARSED_READY', 'PAUSED_NETWORK', 'FAILED_LOCAL', 'CORRUPT', 'SUPERSEDED'],
  OCR_RUNNING: ['OCR_RUNNING', 'LOCAL_PARSED_READY', 'PAUSED_NETWORK', 'FAILED_LOCAL', 'CORRUPT', 'SUPERSEDED'],
  LOCAL_PARSED_READY: ['WAITING_SERVER_REVISION', 'REPACKAGING', 'CORRUPT', 'SUPERSEDED', 'FAILED_LOCAL'],
  WAITING_SERVER_REVISION: ['REPACKAGING', 'PAUSED_NETWORK', 'CORRUPT', 'SUPERSEDED', 'FAILED_LOCAL'],
  REPACKAGING: ['UPLOADING', 'PAUSED_NETWORK', 'FAILED_LOCAL', 'CORRUPT', 'SUPERSEDED'],
  UPLOADING: ['REPACKAGING', 'SERVER_VALIDATING', 'PAUSED_NETWORK', 'FAILED_LOCAL', 'CORRUPT', 'SUPERSEDED'],
  SERVER_VALIDATING: ['SERVER_INDEXING', 'PAUSED_NETWORK', 'FAILED_LOCAL', 'CORRUPT', 'SUPERSEDED'],
  SERVER_INDEXING: ['READY', 'PAUSED_NETWORK', 'FAILED_LOCAL', 'CORRUPT', 'SUPERSEDED'],
  READY: ['SUPERSEDED', 'CORRUPT'],
  FAILED_LOCAL: ['QUEUED', 'SUPERSEDED', 'CORRUPT'],
  PAUSED_NETWORK: ['UPLOADING', 'REPACKAGING', 'SERVER_VALIDATING', 'QUEUED', 'FAILED_LOCAL', 'SUPERSEDED', 'CORRUPT'],
  SUPERSEDED: ['CORRUPT'],
  CORRUPT: ['QUEUED', 'SUPERSEDED'],
}

interface BrowserStoreData {
  records: LocalParsedDocumentRecord[]
}

const browserWriteQueues = new Map<string, Promise<void>>()
const sqlWriteQueues = new WeakMap<object, Promise<void>>()

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T
const encodePart = (value: string): string => encodeURIComponent(value.trim())

function localReceiptMatchesRecord(
  receipt: NonNullable<LocalParsedDocumentRecord['localReceipt']>,
  record: LocalParsedDocumentRecord,
  localCacheId: string | null,
): boolean {
  return localCacheId === receipt.cacheId
    && receipt.localSourceId === record.localSourceId
    && receipt.localContentRevision === record.localContentRevision
    && receipt.sourceAssetSha256 === record.sourceAssetSha256
    && receipt.parserId === record.parserId
    && receipt.parserVersion === record.parserVersion
    && receipt.normalizationVersion === record.normalizationVersion
    && (receipt.ocrModelVersion ?? null) === (record.ocrModelVersion ?? null)
}

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

export class LocalParsedDocumentRepository {
  readonly userId: string
  readonly serverDeviceId: string

  private readonly sql?: LocalSqlDatabase
  private readonly storage: LocalStorageLike
  private readonly schemaReady?: Promise<void>
  private readonly now: () => string
  private readonly namespace: string
  private sqlReady: Promise<void> | null = null

  constructor(userId: string, serverDeviceId: string, options: LocalParsedDocumentRepositoryOptions = {}) {
    const trimmedUserId = userId?.trim()
    const trimmedServerDeviceId = serverDeviceId?.trim()
    if (!trimmedUserId) throw new Error('LocalParsedDocumentRepository requires a userId')
    if (!trimmedServerDeviceId) throw new Error('LocalParsedDocumentRepository requires a serverDeviceId')
    if (options.sql && options.storage) {
      throw new Error('LocalParsedDocumentRepository accepts either sql or storage, not both')
    }

    this.userId = trimmedUserId
    this.serverDeviceId = trimmedServerDeviceId
    this.sql = options.sql
    this.schemaReady = options.schemaReady
    this.storage = options.storage ?? defaultStorage()
    this.now = options.now ?? (() => new Date().toISOString())
    this.namespace = `auralis:v9:local-parsed-docs:${encodePart(trimmedUserId)}:${encodePart(trimmedServerDeviceId)}`
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

  private sanitizeBrowserRecord(record: unknown): LocalParsedDocumentRecord | null {
    if (!record || typeof record !== 'object' || Array.isArray(record)) return null
    const r = record as Record<string, unknown>
    let localReceipt: LocalCacheReceipt | null = null
    if (r.localReceipt) {
      if (typeof r.localReceipt === 'string') {
        try {
          localReceipt = sanitizeLocalCacheReceipt(JSON.parse(r.localReceipt))
        } catch {
          localReceipt = null
        }
      } else {
        localReceipt = sanitizeLocalCacheReceipt(r.localReceipt)
      }
    }

    let serverReceipt: DocumentCacheReceipt | null = null
    if (r.serverReceipt) {
      if (typeof r.serverReceipt === 'string') {
        try {
          serverReceipt = sanitizeParsedDocumentServerReceipt(JSON.parse(r.serverReceipt))
        } catch {
          serverReceipt = null
        }
      } else {
        serverReceipt = sanitizeParsedDocumentServerReceipt(r.serverReceipt)
      }
    }

    return {
      userId: typeof r.userId === 'string' ? r.userId.trim() : this.userId,
      serverDeviceId: typeof r.serverDeviceId === 'string' ? r.serverDeviceId.trim() : this.serverDeviceId,
      localSourceId: typeof r.localSourceId === 'string' ? r.localSourceId : '',
      localContentRevision: typeof r.localContentRevision === 'string' ? r.localContentRevision : '',
      localAssetId: typeof r.localAssetId === 'string' ? r.localAssetId : '',
      sourceAssetSha256: typeof r.sourceAssetSha256 === 'string' ? r.sourceAssetSha256.toLowerCase() : '',
      parserId: typeof r.parserId === 'string' ? r.parserId : '',
      parserVersion: typeof r.parserVersion === 'string' ? r.parserVersion : '',
      normalizationVersion: typeof r.normalizationVersion === 'string' ? r.normalizationVersion : '',
      ocrModelVersion: r.ocrModelVersion === null || r.ocrModelVersion === undefined ? null : String(r.ocrModelVersion),
      localCacheId: r.localCacheId === null || r.localCacheId === undefined ? null : String(r.localCacheId),
      localReceipt,
      phase: r.phase as LocalParsedDocumentPhase,
      serverSourceId: r.serverSourceId === null || r.serverSourceId === undefined ? null : String(r.serverSourceId),
      serverIngestionRevision: r.serverIngestionRevision === null || r.serverIngestionRevision === undefined ? null : String(r.serverIngestionRevision),
      serverCacheId: r.serverCacheId === null || r.serverCacheId === undefined ? null : String(r.serverCacheId),
      serverReceipt,
      safeErrorCode: r.safeErrorCode === null || r.safeErrorCode === undefined ? null : String(r.safeErrorCode),
      safeErrorDetail: r.safeErrorDetail === null || r.safeErrorDetail === undefined ? null : String(r.safeErrorDetail),
      attempt: Number(r.attempt ?? 0),
      checkpointPage: Number(r.checkpointPage ?? 0),
      checkpointOrdinal: Number(r.checkpointOrdinal ?? 0),
      checkpointJson: r.checkpointJson === null || r.checkpointJson === undefined ? null : String(r.checkpointJson),
      createdAt: typeof r.createdAt === 'string' ? r.createdAt : '',
      updatedAt: typeof r.updatedAt === 'string' ? r.updatedAt : '',
    }
  }

  private readBrowserStore(): BrowserStoreData {
    const raw = this.storage.getItem(this.namespace)
    if (!raw) return { records: [] }
    try {
      const parsed = JSON.parse(raw) as Partial<BrowserStoreData>
      const rawRecords = Array.isArray(parsed.records) ? parsed.records : []
      return {
        records: rawRecords
          .map(r => this.sanitizeBrowserRecord(r))
          .filter((r): r is LocalParsedDocumentRecord => r !== null),
      }
    } catch {
      return { records: [] }
    }
  }

  private writeBrowserStore(data: BrowserStoreData): void {
    this.storage.setItem(this.namespace, JSON.stringify(data))
  }

  async create(input: CreateLocalParsedDocumentInput): Promise<LocalParsedDocumentRecord> {
    return this.serializeWrite(async () => {
      if (!input.localSourceId?.trim()) throw new Error('localSourceId is required')
      if (!input.localContentRevision?.trim()) throw new Error('localContentRevision is required')
      if (!input.localAssetId?.trim()) throw new Error('localAssetId is required')
      if (!input.sourceAssetSha256?.trim() || !/^[a-f0-9]{64}$/i.test(input.sourceAssetSha256)) {
        throw new Error('sourceAssetSha256 must be a 64-character hex string')
      }
      if (!input.parserId?.trim()) throw new Error('parserId is required')
      if (!input.parserVersion?.trim()) throw new Error('parserVersion is required')
      if (!input.normalizationVersion?.trim()) throw new Error('normalizationVersion is required')

      const now = this.now()
      const phase: LocalParsedDocumentPhase = input.phase ?? 'QUEUED'
      if (!LOCAL_PARSED_DOCUMENT_PHASES.includes(phase)) {
        throw new Error(`Invalid local parsed document phase: ${phase}`)
      }

      let localReceipt = input.localReceipt ?? null
      if (localReceipt) {
        if (!isLocalCacheReceiptV1(localReceipt)) {
          throw new Error('LOCAL_PARSED_DOCUMENT_RECEIPT_INVALID: Invalid local receipt format')
        }
      }

      let serverReceipt = input.serverReceipt ?? null
      if (serverReceipt) {
        if (!isDocumentCacheReceiptV1(serverReceipt)) {
          throw new Error('LOCAL_PARSED_DOCUMENT_RECEIPT_INVALID: Invalid server receipt format')
        }
      }

      const record: LocalParsedDocumentRecord = {
        userId: this.userId,
        serverDeviceId: this.serverDeviceId,
        localSourceId: input.localSourceId.trim(),
        localContentRevision: input.localContentRevision.trim(),
        localAssetId: input.localAssetId.trim(),
        sourceAssetSha256: input.sourceAssetSha256.trim().toLowerCase(),
        parserId: input.parserId.trim(),
        parserVersion: input.parserVersion.trim(),
        normalizationVersion: input.normalizationVersion.trim(),
        ocrModelVersion: input.ocrModelVersion ?? null,
        localCacheId: input.localCacheId?.trim() ?? null,
        localReceipt,
        phase,
        serverSourceId: input.serverSourceId?.trim() ?? null,
        serverIngestionRevision: input.serverIngestionRevision?.trim() ?? null,
        serverCacheId: input.serverCacheId?.trim() ?? null,
        serverReceipt,
        safeErrorCode: input.safeErrorCode ?? null,
        safeErrorDetail: input.safeErrorDetail ?? null,
        attempt: 0,
        checkpointPage: 0,
        checkpointOrdinal: 0,
        checkpointJson: null,
        createdAt: now,
        updatedAt: now,
      }
      if (record.localReceipt && !localReceiptMatchesRecord(record.localReceipt, record, record.localCacheId)) {
        throw new Error('LOCAL_PARSED_DOCUMENT_RECEIPT_INVALID: Local receipt does not match record identity')
      }

      if (this.sql) {
        await this.ensureSql()
        await this.sql.execute(
          `INSERT INTO local_parsed_documents (
            user_id, device_id, local_source_id, local_content_revision,
            local_asset_id, source_asset_sha256, parser_id, parser_version, normalization_version, ocr_model_version,
            local_cache_id, local_receipt_json, phase,
            server_source_id, server_ingestion_revision, server_cache_id, server_receipt_json,
            safe_error_code, safe_error_detail,
            attempt, checkpoint_page, checkpoint_ordinal, checkpoint_json,
            created_at, updated_at
          ) VALUES (
            $1, $2, $3, $4,
            $5, $6, $7, $8, $9, $10,
            $11, $12, $13,
            $14, $15, $16, $17,
            $18, $19,
            $20, $21, $22, $23,
            $24, $25
          )`,
          [
            record.userId, record.serverDeviceId, record.localSourceId, record.localContentRevision,
            record.localAssetId, record.sourceAssetSha256, record.parserId, record.parserVersion, record.normalizationVersion, record.ocrModelVersion,
            record.localCacheId, record.localReceipt ? JSON.stringify(record.localReceipt) : null, record.phase,
            record.serverSourceId, record.serverIngestionRevision, record.serverCacheId, record.serverReceipt ? JSON.stringify(record.serverReceipt) : null,
            record.safeErrorCode, record.safeErrorDetail,
            record.attempt, record.checkpointPage, record.checkpointOrdinal, record.checkpointJson,
            record.createdAt, record.updatedAt,
          ],
        )
        return record
      }

      const store = this.readBrowserStore()
      const existing = store.records.find(
        r => r.localSourceId === record.localSourceId && r.localContentRevision === record.localContentRevision,
      )
      if (existing) {
        throw new Error('LOCAL_PARSED_DOCUMENT_DUPLICATE: Record with same localSourceId and localContentRevision already exists')
      }
      store.records.push(record)
      this.writeBrowserStore(store)
      return clone(record)
    })
  }

  async get(localSourceId: string, localContentRevision: string): Promise<LocalParsedDocumentRecord | null> {
    if (this.sql) {
      await this.ensureSql()
      const rows = await this.sql.select<LocalParsedDocumentRow>(
        `SELECT * FROM local_parsed_documents
         WHERE user_id = $1 AND device_id = $2 AND local_source_id = $3 AND local_content_revision = $4`,
        [this.userId, this.serverDeviceId, localSourceId, localContentRevision],
      )
      return rows[0] ? localParsedDocumentFromRow(rows[0]) : null
    }

    const store = this.readBrowserStore()
    const found = store.records.find(
      r => r.localSourceId === localSourceId && r.localContentRevision === localContentRevision,
    )
    return found ? clone(found) : null
  }

  async getByServerRevision(serverSourceId: string, serverIngestionRevision: string): Promise<LocalParsedDocumentRecord | null> {
    if (!serverSourceId.trim() || !serverIngestionRevision.trim()) return null
    if (this.sql) {
      await this.ensureSql()
      const rows = await this.sql.select<LocalParsedDocumentRow>(
        `SELECT * FROM local_parsed_documents
         WHERE user_id = $1 AND device_id = $2 AND server_source_id = $3 AND server_ingestion_revision = $4`,
        [this.userId, this.serverDeviceId, serverSourceId, serverIngestionRevision],
      )
      return rows[0] ? localParsedDocumentFromRow(rows[0]) : null
    }

    const store = this.readBrowserStore()
    const found = store.records.find(
      r => r.serverSourceId === serverSourceId && r.serverIngestionRevision === serverIngestionRevision,
    )
    return found ? clone(found) : null
  }

  async listBySource(localSourceId: string): Promise<LocalParsedDocumentRecord[]> {
    if (this.sql) {
      await this.ensureSql()
      const rows = await this.sql.select<LocalParsedDocumentRow>(
        `SELECT * FROM local_parsed_documents
         WHERE user_id = $1 AND device_id = $2 AND local_source_id = $3
         ORDER BY created_at DESC`,
        [this.userId, this.serverDeviceId, localSourceId],
      )
      return rows.map(localParsedDocumentFromRow)
    }

    const store = this.readBrowserStore()
    return clone(store.records.filter(r => r.localSourceId === localSourceId))
  }

  async listByAsset(localAssetId: string): Promise<LocalParsedDocumentRecord[]> {
    if (this.sql) {
      await this.ensureSql()
      const rows = await this.sql.select<LocalParsedDocumentRow>(
        `SELECT * FROM local_parsed_documents
         WHERE user_id = $1 AND device_id = $2 AND local_asset_id = $3
         ORDER BY created_at DESC`,
        [this.userId, this.serverDeviceId, localAssetId],
      )
      return rows.map(localParsedDocumentFromRow)
    }

    const store = this.readBrowserStore()
    return clone(store.records.filter(r => r.localAssetId === localAssetId))
  }

  async listByPhase(phase: LocalParsedDocumentPhase): Promise<LocalParsedDocumentRecord[]> {
    if (this.sql) {
      await this.ensureSql()
      const rows = await this.sql.select<LocalParsedDocumentRow>(
        `SELECT * FROM local_parsed_documents
         WHERE user_id = $1 AND device_id = $2 AND phase = $3
         ORDER BY updated_at ASC`,
        [this.userId, this.serverDeviceId, phase],
      )
      return rows.map(localParsedDocumentFromRow)
    }

    const store = this.readBrowserStore()
    return clone(store.records.filter(r => r.phase === phase))
  }

  async updatePhase(
    localSourceId: string,
    localContentRevision: string,
    phase: LocalParsedDocumentPhase,
    options: LocalParsedDocumentTransitionOptions = {},
  ): Promise<LocalParsedDocumentRecord> {
    return this.serializeWrite(async () => {
      const current = await this.get(localSourceId, localContentRevision)
      if (!current) throw new Error('LOCAL_PARSED_DOCUMENT_NOT_FOUND')

      if (phase !== current.phase) {
        const allowed = LEGAL_LOCAL_PARSED_DOCUMENT_TRANSITIONS[current.phase]
        if (!allowed || !allowed.includes(phase)) {
          throw new Error(`LOCAL_PARSED_DOCUMENT_ILLEGAL_TRANSITION: Cannot transition parsed document from ${current.phase} to ${phase}`)
        }
      }

      const localCacheId = options.localCacheId !== undefined ? (options.localCacheId?.trim() ?? null) : current.localCacheId
      let localReceipt = options.localReceipt !== undefined ? options.localReceipt : current.localReceipt
      if (localReceipt) {
        if (!isLocalCacheReceiptV1(localReceipt) || !localReceiptMatchesRecord(localReceipt, current, localCacheId)) {
          throw new Error('LOCAL_PARSED_DOCUMENT_RECEIPT_INVALID: Invalid local receipt format')
        }
      }

      let serverReceipt = options.serverReceipt !== undefined ? options.serverReceipt : current.serverReceipt
      if (serverReceipt) {
        if (!isDocumentCacheReceiptV1(serverReceipt)) {
          throw new Error('LOCAL_PARSED_DOCUMENT_RECEIPT_INVALID: Invalid server receipt format')
        }
      }

      const now = this.now()
      const updated: LocalParsedDocumentRecord = {
        ...current,
        phase,
        checkpointPage: options.checkpointPage !== undefined ? options.checkpointPage : current.checkpointPage,
        checkpointOrdinal: options.checkpointOrdinal !== undefined ? options.checkpointOrdinal : current.checkpointOrdinal,
        checkpointJson: options.checkpointJson !== undefined ? options.checkpointJson : current.checkpointJson,
        localCacheId,
        localReceipt,
        serverSourceId: options.serverSourceId !== undefined ? (options.serverSourceId?.trim() ?? null) : current.serverSourceId,
        serverIngestionRevision: options.serverIngestionRevision !== undefined ? (options.serverIngestionRevision?.trim() ?? null) : current.serverIngestionRevision,
        serverCacheId: options.serverCacheId !== undefined ? (options.serverCacheId?.trim() ?? null) : current.serverCacheId,
        serverReceipt,
        safeErrorCode: options.safeErrorCode !== undefined ? options.safeErrorCode : current.safeErrorCode,
        safeErrorDetail: options.safeErrorDetail !== undefined ? options.safeErrorDetail : current.safeErrorDetail,
        attempt: options.attempt !== undefined ? options.attempt : current.attempt,
        updatedAt: now,
      }

      if (this.sql) {
        await this.ensureSql()
        await this.sql.execute(
          `UPDATE local_parsed_documents
           SET phase = $1, checkpoint_page = $2, checkpoint_ordinal = $3, checkpoint_json = $4,
               local_cache_id = $5, local_receipt_json = $6,
               server_source_id = $7, server_ingestion_revision = $8, server_cache_id = $9, server_receipt_json = $10,
               safe_error_code = $11, safe_error_detail = $12, attempt = $13, updated_at = $14
           WHERE user_id = $15 AND device_id = $16 AND local_source_id = $17 AND local_content_revision = $18`,
          [
            updated.phase, updated.checkpointPage, updated.checkpointOrdinal, updated.checkpointJson,
            updated.localCacheId, updated.localReceipt ? JSON.stringify(updated.localReceipt) : null,
            updated.serverSourceId, updated.serverIngestionRevision, updated.serverCacheId, updated.serverReceipt ? JSON.stringify(updated.serverReceipt) : null,
            updated.safeErrorCode, updated.safeErrorDetail, updated.attempt, updated.updatedAt,
            this.userId, this.serverDeviceId, localSourceId, localContentRevision,
          ],
        )
        return updated
      }

      const store = this.readBrowserStore()
      const index = store.records.findIndex(
        r => r.localSourceId === localSourceId && r.localContentRevision === localContentRevision,
      )
      if (index >= 0) {
        store.records[index] = updated
        this.writeBrowserStore(store)
        return clone(updated)
      }
      throw new Error('LOCAL_PARSED_DOCUMENT_NOT_FOUND')
    })
  }

  async markFailed(
    localSourceId: string,
    localContentRevision: string,
    errorCode: string,
    errorDetail?: string,
  ): Promise<LocalParsedDocumentRecord> {
    return this.updatePhase(localSourceId, localContentRevision, 'FAILED_LOCAL', {
      safeErrorCode: errorCode,
      safeErrorDetail: errorDetail ?? null,
    })
  }

  async retry(localSourceId: string, localContentRevision: string): Promise<LocalParsedDocumentRecord> {
    const current = await this.get(localSourceId, localContentRevision)
    if (!current) throw new Error('LOCAL_PARSED_DOCUMENT_NOT_FOUND')
    return this.updatePhase(localSourceId, localContentRevision, 'QUEUED', {
      attempt: current.attempt + 1,
      safeErrorCode: null,
      safeErrorDetail: null,
    })
  }

  async restart(localSourceId: string, localContentRevision: string): Promise<LocalParsedDocumentRecord> {
    return this.updatePhase(localSourceId, localContentRevision, 'QUEUED', {
      checkpointPage: 0,
      checkpointOrdinal: 0,
      checkpointJson: null,
      safeErrorCode: null,
      safeErrorDetail: null,
    })
  }

  async bindServerRevision(input: BindServerRevisionInput): Promise<LocalParsedDocumentRecord> {
    return this.serializeWrite(async () => {
      if (!input.localSourceId?.trim()) throw new Error('localSourceId is required')
      if (!input.localContentRevision?.trim()) throw new Error('localContentRevision is required')
      if (!input.serverSourceId?.trim()) throw new Error('serverSourceId is required')
      if (!input.serverIngestionRevision?.trim()) throw new Error('serverIngestionRevision is required')
      if (!input.sourceAssetSha256?.trim() || !/^[a-f0-9]{64}$/i.test(input.sourceAssetSha256)) {
        throw new Error('sourceAssetSha256 must be a 64-character hex string')
      }

      const current = await this.get(input.localSourceId, input.localContentRevision)
      if (!current) throw new Error('LOCAL_PARSED_DOCUMENT_NOT_FOUND')

      const normalizedSha = input.sourceAssetSha256.trim().toLowerCase()
      if (current.sourceAssetSha256.toLowerCase() !== normalizedSha) {
        throw new Error(`LOCAL_PARSED_DOCUMENT_SHA_MISMATCH: Provided SHA256 ${input.sourceAssetSha256} does not match record ${current.sourceAssetSha256}`)
      }

      const nextServerSourceId = input.serverSourceId.trim()
      const nextServerRevision = input.serverIngestionRevision.trim()
      const revisionChanged = current.serverSourceId !== nextServerSourceId
        || current.serverIngestionRevision !== nextServerRevision
      let serverReceipt = input.serverReceipt !== undefined
        ? input.serverReceipt
        : revisionChanged ? null : current.serverReceipt
      if (serverReceipt) {
        if (!isDocumentCacheReceiptV1(serverReceipt)) {
          throw new Error('LOCAL_PARSED_DOCUMENT_RECEIPT_INVALID: Invalid server receipt format')
        }
      }

      const now = this.now()
      const updated: LocalParsedDocumentRecord = {
        ...current,
        serverSourceId: nextServerSourceId,
        serverIngestionRevision: nextServerRevision,
        serverCacheId: input.serverCacheId !== undefined
          ? (input.serverCacheId?.trim() ?? null)
          : revisionChanged ? null : current.serverCacheId,
        serverReceipt,
        updatedAt: now,
      }

      if (this.sql) {
        await this.ensureSql()
        await this.sql.execute(
          `UPDATE local_parsed_documents
           SET server_source_id = $1, server_ingestion_revision = $2, server_cache_id = $3, server_receipt_json = $4, updated_at = $5
           WHERE user_id = $6 AND device_id = $7 AND local_source_id = $8 AND local_content_revision = $9`,
          [
            updated.serverSourceId, updated.serverIngestionRevision, updated.serverCacheId,
            updated.serverReceipt ? JSON.stringify(updated.serverReceipt) : null, updated.updatedAt,
            this.userId, this.serverDeviceId, input.localSourceId, input.localContentRevision,
          ],
        )
        return updated
      }

      const store = this.readBrowserStore()
      const index = store.records.findIndex(
        r => r.localSourceId === input.localSourceId && r.localContentRevision === input.localContentRevision,
      )
      if (index >= 0) {
        store.records[index] = updated
        this.writeBrowserStore(store)
        return clone(updated)
      }
      throw new Error('LOCAL_PARSED_DOCUMENT_NOT_FOUND')
    })
  }

  async prepareBindRequest(
    localSourceId: string,
    localContentRevision: string,
    extra: { serverCacheId: string; jobId: string },
  ): Promise<LocalCacheBindRequest> {
    const current = await this.get(localSourceId, localContentRevision)
    if (!current) throw new Error('LOCAL_PARSED_DOCUMENT_NOT_FOUND')

    if (!current.serverIngestionRevision || !current.serverSourceId || !current.localCacheId) {
      throw new Error('LOCAL_PARSED_DOCUMENT_NO_SERVER_REVISION: Record must have serverSourceId, serverIngestionRevision, and localCacheId before preparing bind request')
    }

    if (!extra.serverCacheId?.trim() || !extra.jobId?.trim()) {
      throw new Error('serverCacheId and jobId are required')
    }

    const bindRequest: LocalCacheBindRequest = {
      localCacheId: current.localCacheId.trim(),
      serverCacheId: extra.serverCacheId.trim(),
      userId: this.userId,
      deviceId: this.serverDeviceId,
      localSourceId: current.localSourceId.trim(),
      localContentRevision: current.localContentRevision.trim(),
      serverSourceId: current.serverSourceId.trim(),
      jobId: extra.jobId.trim(),
      ingestionRevision: current.serverIngestionRevision.trim(),
      sourceAssetSha256: current.sourceAssetSha256.toLowerCase(),
    }
    return bindRequest
  }

  async claimNext(): Promise<LocalParsedDocumentRecord | null> {
    return this.serializeWrite(async () => {
      const now = this.now()

      if (this.sql) {
        await this.ensureSql()
        const candidates = await this.sql.select<LocalParsedDocumentRow>(
          `SELECT local_source_id, local_content_revision FROM local_parsed_documents
           WHERE user_id = $1 AND device_id = $2 AND phase = 'QUEUED'
           ORDER BY created_at ASC
           LIMIT 10`,
          [this.userId, this.serverDeviceId],
        )
        if (!candidates || candidates.length === 0) return null

        for (const cand of candidates) {
          const rows = await this.sql.select<LocalParsedDocumentRow>(
            `UPDATE local_parsed_documents
             SET phase = 'EXTRACTING', attempt = attempt + 1, updated_at = $1
             WHERE user_id = $2 AND device_id = $3 AND local_source_id = $4 AND local_content_revision = $5 AND phase = 'QUEUED'
             RETURNING *`,
            [now, this.userId, this.serverDeviceId, cand.local_source_id, cand.local_content_revision],
          )
          if (rows && rows.length > 0) {
            return localParsedDocumentFromRow(rows[0])
          }
        }
        return null
      }

      const store = this.readBrowserStore()
      const eligible = store.records
        .filter(r => r.phase === 'QUEUED')
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))

      if (eligible.length === 0) return null
      for (const target of eligible) {
        const index = store.records.findIndex(
          r => r.localSourceId === target.localSourceId
            && r.localContentRevision === target.localContentRevision
            && r.phase === 'QUEUED',
        )
        if (index >= 0) {
          store.records[index] = {
            ...store.records[index],
            phase: 'EXTRACTING',
            attempt: store.records[index].attempt + 1,
            updatedAt: now,
          }
          this.writeBrowserStore(store)
          return clone(store.records[index])
        }
      }
      return null
    })
  }

  async delete(localSourceId: string, localContentRevision: string): Promise<void> {
    return this.serializeWrite(async () => {
      if (this.sql) {
        await this.ensureSql()
        await this.sql.execute(
          `DELETE FROM local_parsed_documents
           WHERE user_id = $1 AND device_id = $2 AND local_source_id = $3 AND local_content_revision = $4`,
          [this.userId, this.serverDeviceId, localSourceId, localContentRevision],
        )
        return
      }

      const store = this.readBrowserStore()
      store.records = store.records.filter(
        r => !(r.localSourceId === localSourceId && r.localContentRevision === localContentRevision),
      )
      this.writeBrowserStore(store)
    })
  }

  async deleteBySource(localSourceId: string): Promise<void> {
    return this.serializeWrite(async () => {
      if (this.sql) {
        await this.ensureSql()
        await this.sql.execute(
          `DELETE FROM local_parsed_documents
           WHERE user_id = $1 AND device_id = $2 AND local_source_id = $3`,
          [this.userId, this.serverDeviceId, localSourceId],
        )
        return
      }

      const store = this.readBrowserStore()
      store.records = store.records.filter(r => r.localSourceId !== localSourceId)
      this.writeBrowserStore(store)
    })
  }
}
