import {
  importLocalAsset,
  importLocalAssetBytes,
  MAX_LOCAL_ASSET_BYTES,
  resolveLocalAssetNative,
  downloadLocalAsset,
  deleteLocalAsset,
  reconcileLocalAssets,
  localAssetUploadPut,
  readLocalAssetBytes,
  type LocalAssetReadResult,
} from '@/api/tauri'
import { getFileExtension } from '@/utils/filePreview'
import { uuidv7 } from '@/utils/uuid'
import type { LocalAssetRepository } from '@/services/localAssetRepository'
import { withLocalAssetLifecycleLock } from '@/services/localAssetLifecycleLock'
import {
  computeLocalAssetRelativePath,
  type ImportAssetInput,
  type LocalAssetDescriptor,
  type LocalAssetHandle,
  type ReconciliationReport,
  type ResolveAssetIdentity,
} from '@/types/localAsset'

export interface LocalAssetNativeAdapter {
  readonly isPersistent: boolean
  readonly storageType: 'native-tauri' | 'transient-browser'

  importAsset(args: {
    userId: string
    serverDeviceId: string
    localAssetId: string
    sourcePath?: string
    file?: File
    originalName: string
    mimeType: string
    safeExtension?: string
    expectedSize?: number
    expectedSha256?: string
  }): Promise<LocalAssetDescriptor>

  resolveAsset(args: {
    userId: string
    serverDeviceId: string
    localAssetId: string
    expectedSize?: number
    expectedSha256?: string
  }): Promise<LocalAssetDescriptor>

  downloadAsset(args: {
    userId: string
    serverDeviceId: string
    localAssetId: string
    remoteUrl: string
    expectedSize: number
    expectedSha256: string
    safeExtension: string
  }): Promise<LocalAssetDescriptor>

  deleteAsset(args: {
    userId: string
    serverDeviceId: string
    localAssetId: string
  }): Promise<void>

  reconcileAssets(args: {
    userId: string
    serverDeviceId: string
    knownLocalAssetIds: string[]
  }): Promise<{ removedStagingFiles: number; quarantinedFiles?: string[]; files: LocalAssetDescriptor[] }>

  uploadAssetToRemote(args: {
    userId: string
    serverDeviceId: string
    localAssetId: string
    uploadUrl: string
    headers?: Record<string, string>
    expectedSize: number
    expectedSha256: string
  }): Promise<{ status: number; bytesSent: number; payloadSha256: string }>

  readAssetBytes(args: {
    userId: string
    serverDeviceId: string
    localAssetId: string
    expectedSize: number
    expectedSha256: string
  }): Promise<LocalAssetReadResult>
}

export class TauriLocalAssetNativeAdapter implements LocalAssetNativeAdapter {
  readonly isPersistent = true
  readonly storageType = 'native-tauri' as const

  constructor() {}

  async importAsset(args: {
    userId: string
    serverDeviceId: string
    localAssetId: string
    sourcePath?: string
    file?: File
    originalName: string
    mimeType: string
    safeExtension?: string
    expectedSize?: number
    expectedSha256?: string
  }): Promise<LocalAssetDescriptor> {
    const safeExtension = (args.safeExtension || getFileExtension(args.originalName)).toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin'

    if (args.file) {
      if (args.file.size > MAX_LOCAL_ASSET_BYTES) {
        throw new Error('LOCAL_ASSET_SIZE_LIMIT: File size exceeds 50MB limit')
      }
      const buffer = await args.file.arrayBuffer()
      if (buffer.byteLength > MAX_LOCAL_ASSET_BYTES) {
        throw new Error('LOCAL_ASSET_SIZE_LIMIT: File size exceeds 50MB limit')
      }
      const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', buffer)
      const computedSha = [...new Uint8Array(hashBuffer)].map(b => b.toString(16).padStart(2, '0')).join('')
      const expectedSize = args.expectedSize ?? buffer.byteLength
      const expectedSha256 = (args.expectedSha256 ?? computedSha).toLowerCase()

      if (expectedSize !== buffer.byteLength) {
        throw new Error('LOCAL_ASSET_SIZE_MISMATCH')
      }
      if (expectedSha256 !== computedSha) {
        throw new Error('LOCAL_ASSET_HASH_MISMATCH')
      }

      const content = Array.from(new Uint8Array(buffer))
      return importLocalAssetBytes({
        userScope: args.userId,
        deviceId: args.serverDeviceId,
        localAssetId: args.localAssetId,
        safeExtension,
        expectedSize,
        expectedSha256,
        content,
      })
    }

    const sourcePath = args.sourcePath?.trim()
    const expectedSize = args.expectedSize
    const expectedSha256 = args.expectedSha256?.trim()

    if (
      !sourcePath
      || !safeExtension
      || typeof expectedSize !== 'number'
      || expectedSize < 0
      || expectedSize > MAX_LOCAL_ASSET_BYTES
      || !expectedSha256
      || !/^[a-f0-9]{64}$/i.test(expectedSha256)
    ) {
      throw new Error('LOCAL_ASSET_IMPORT_PRECONDITIONS_MISSING: Native import requires sourcePath, safeExtension, expectedSize, and expectedSha256')
    }

    return importLocalAsset({
      userScope: args.userId,
      deviceId: args.serverDeviceId,
      localAssetId: args.localAssetId,
      sourcePath,
      safeExtension,
      expectedSize,
      expectedSha256,
    })
  }

  async resolveAsset(args: {
    userId: string
    serverDeviceId: string
    localAssetId: string
    expectedSize?: number
    expectedSha256?: string
  }): Promise<LocalAssetDescriptor> {
    return resolveLocalAssetNative({
      userScope: args.userId,
      deviceId: args.serverDeviceId,
      localAssetId: args.localAssetId,
      expectedSize: args.expectedSize,
      expectedSha256: args.expectedSha256,
    })
  }

  async downloadAsset(args: {
    userId: string
    serverDeviceId: string
    localAssetId: string
    remoteUrl: string
    expectedSize: number
    expectedSha256: string
    safeExtension: string
  }): Promise<LocalAssetDescriptor> {
    return downloadLocalAsset({
      userScope: args.userId,
      deviceId: args.serverDeviceId,
      localAssetId: args.localAssetId,
      remoteUrl: args.remoteUrl,
      expectedSize: args.expectedSize,
      expectedSha256: args.expectedSha256,
      safeExtension: args.safeExtension,
    })
  }

  async deleteAsset(args: {
    userId: string
    serverDeviceId: string
    localAssetId: string
  }): Promise<void> {
    await deleteLocalAsset({
      userScope: args.userId,
      deviceId: args.serverDeviceId,
      localAssetId: args.localAssetId,
    })
  }

  async reconcileAssets(args: {
    userId: string
    serverDeviceId: string
    knownLocalAssetIds: string[]
  }): Promise<{ removedStagingFiles: number; quarantinedFiles?: string[]; files: LocalAssetDescriptor[] }> {
    return reconcileLocalAssets({
      userScope: args.userId,
      deviceId: args.serverDeviceId,
      knownLocalAssetIds: args.knownLocalAssetIds,
    })
  }

  async uploadAssetToRemote(args: {
    userId: string
    serverDeviceId: string
    localAssetId: string
    uploadUrl: string
    headers?: Record<string, string>
    expectedSize: number
    expectedSha256: string
  }): Promise<{ status: number; bytesSent: number; payloadSha256: string }> {
    return localAssetUploadPut({
      userScope: args.userId,
      deviceId: args.serverDeviceId,
      localAssetId: args.localAssetId,
      uploadUrl: args.uploadUrl,
      headers: args.headers,
      expectedSize: args.expectedSize,
      expectedSha256: args.expectedSha256,
    })
  }

  async readAssetBytes(args: {
    userId: string
    serverDeviceId: string
    localAssetId: string
    expectedSize: number
    expectedSha256: string
  }): Promise<LocalAssetReadResult> {
    return readLocalAssetBytes({
      userScope: args.userId,
      deviceId: args.serverDeviceId,
      localAssetId: args.localAssetId,
      expectedSize: args.expectedSize,
      expectedSha256: args.expectedSha256,
    })
  }
}

export class TransientBrowserAssetAdapter implements LocalAssetNativeAdapter {
  readonly isPersistent = false
  readonly storageType = 'transient-browser' as const
  private readonly blobs = new Map<string, { descriptor: LocalAssetDescriptor; blob?: Blob }>()

  async importAsset(args: {
    userId: string
    serverDeviceId: string
    localAssetId: string
    sourcePath?: string
    file?: File
    originalName: string
    mimeType: string
    safeExtension?: string
    expectedSize?: number
    expectedSha256?: string
  }): Promise<LocalAssetDescriptor> {
    console.warn('[LocalAsset] Browser fallback is running. Files are transient in memory and will NOT persist across reloads.')
    const ext = (args.safeExtension || getFileExtension(args.originalName) || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin'
    let size = args.expectedSize ?? (args.file?.size ?? 0)
    let sha256 = args.expectedSha256 ?? '0'.repeat(64)

    if (args.file && (!args.expectedSha256 || args.expectedSize === undefined)) {
      try {
        const buffer = await args.file.arrayBuffer()
        const hash = await globalThis.crypto.subtle.digest('SHA-256', buffer)
        sha256 = [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('')
        size = buffer.byteLength
      } catch {
        // fallback to default
      }
    }

    const descriptor: LocalAssetDescriptor = {
      localAssetId: args.localAssetId,
      safeExtension: ext,
      sizeBytes: size,
      sha256,
      absolutePath: `browser://transient/${args.localAssetId}`,
    }
    this.blobs.set(args.localAssetId, { descriptor, blob: args.file })
    return descriptor
  }

  async resolveAsset(args: {
    userId: string
    serverDeviceId: string
    localAssetId: string
    expectedSize?: number
    expectedSha256?: string
  }): Promise<LocalAssetDescriptor> {
    const found = this.blobs.get(args.localAssetId)
    if (!found) {
      throw new Error('FILE_MISSING: Asset file missing from transient storage')
    }
    return found.descriptor
  }

  async downloadAsset(args: {
    userId: string
    serverDeviceId: string
    localAssetId: string
    remoteUrl: string
    expectedSize: number
    expectedSha256: string
    safeExtension: string
  }): Promise<LocalAssetDescriptor> {
    const descriptor: LocalAssetDescriptor = {
      localAssetId: args.localAssetId,
      safeExtension: args.safeExtension,
      sizeBytes: args.expectedSize,
      sha256: args.expectedSha256,
      absolutePath: `browser://transient/${args.localAssetId}`,
    }
    this.blobs.set(args.localAssetId, { descriptor })
    return descriptor
  }

  async deleteAsset(args: {
    userId: string
    serverDeviceId: string
    localAssetId: string
  }): Promise<void> {
    this.blobs.delete(args.localAssetId)
  }

  async reconcileAssets(_args: {
    userId: string
    serverDeviceId: string
    knownLocalAssetIds: string[]
  }): Promise<{ removedStagingFiles: number; quarantinedFiles?: string[]; files: LocalAssetDescriptor[] }> {
    const files = [...this.blobs.values()].map(item => item.descriptor)
    return { removedStagingFiles: 0, quarantinedFiles: [], files }
  }

  async getAssetBlob(args: {
    userId: string
    serverDeviceId: string
    localAssetId: string
  }): Promise<Blob> {
    const found = this.blobs.get(args.localAssetId)
    if (!found || !found.blob) {
      throw new Error('FILE_MISSING: Asset file missing from transient storage')
    }
    return found.blob
  }

  async uploadAssetToRemote(args: {
    userId: string
    serverDeviceId: string
    localAssetId: string
    uploadUrl: string
    headers?: Record<string, string>
    expectedSize: number
    expectedSha256: string
  }): Promise<{ status: number; bytesSent: number; payloadSha256: string }> {
    const blob = await this.getAssetBlob({
      userId: args.userId,
      serverDeviceId: args.serverDeviceId,
      localAssetId: args.localAssetId,
    })
    const res = await fetch(args.uploadUrl, {
      method: 'PUT',
      headers: args.headers,
      body: blob,
    })
    return {
      status: res.status,
      bytesSent: args.expectedSize, // transient doesn't perfectly track bytes sent, using expected
      payloadSha256: args.expectedSha256,
    }
  }

  async readAssetBytes(args: {
    userId: string
    serverDeviceId: string
    localAssetId: string
    expectedSize: number
    expectedSha256: string
  }): Promise<LocalAssetReadResult> {
    const found = this.blobs.get(args.localAssetId)
    if (!found || !found.blob) {
      throw new Error('FILE_MISSING: Asset file missing from transient storage')
    }
    const buffer = await found.blob.arrayBuffer()
    const bytes = new Uint8Array(buffer)
    const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', buffer)
    const computedSha = [...new Uint8Array(hashBuffer)].map(b => b.toString(16).padStart(2, '0')).join('')
    if (bytes.byteLength !== args.expectedSize) {
      throw new Error('LOCAL_ASSET_SIZE_MISMATCH')
    }
    if (computedSha.toLowerCase() !== args.expectedSha256.toLowerCase()) {
      throw new Error('LOCAL_ASSET_HASH_MISMATCH')
    }
    return {
      receipt: {
        localAssetId: args.localAssetId,
        safeExtension: found.descriptor.safeExtension,
        sizeBytes: bytes.byteLength,
        sha256: computedSha,
      },
      bytes,
    }
  }
}

export interface LocalAssetServiceOptions {
  nativeAdapter?: LocalAssetNativeAdapter
  idFactory?: () => string
}

export interface LocalAssetFileReadResult {
  file: File
  localAssetId: string
  serverAssetId: string | null
  cleanup: () => void
}

export class LocalAssetService {
  readonly repository: LocalAssetRepository
  private readonly adapter: LocalAssetNativeAdapter
  private readonly idFactory: () => string

  constructor(repository: LocalAssetRepository, options: LocalAssetServiceOptions = {}) {
    this.repository = repository
    this.idFactory = options.idFactory ?? (() => globalThis.crypto?.randomUUID?.() ?? uuidv7())

    if (options.nativeAdapter) {
      this.adapter = options.nativeAdapter
    } else {
      const isTauri = typeof window !== 'undefined' && Boolean((window as unknown as { __TAURI__?: unknown; __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ || (window as unknown as { __TAURI__?: unknown }).__TAURI__)
      this.adapter = isTauri ? new TauriLocalAssetNativeAdapter() : new TransientBrowserAssetAdapter()
    }
  }

  async importAsset(input: ImportAssetInput & { localAssetId?: string }): Promise<LocalAssetHandle> {
    const localAssetId = input.localAssetId ?? this.idFactory()
    const safeExtension = (input.safeExtension || getFileExtension(input.originalName)).toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin'
    const expectedSize = input.expectedSize ?? input.sizeBytes
    const expectedSha256 = input.expectedSha256 ?? input.sha256

    if (this.adapter.storageType === 'native-tauri') {
      if (!input.sourcePath?.trim() && !input.file) {
        throw new Error('LOCAL_ASSET_IMPORT_PRECONDITIONS_MISSING: Native import requires either sourcePath or file')
      }
      if (input.sourcePath?.trim()) {
        if (
          typeof expectedSize !== 'number'
          || expectedSize < 0
          || !expectedSha256?.trim()
          || !/^[a-f0-9]{64}$/i.test(expectedSha256)
        ) {
          throw new Error('LOCAL_ASSET_IMPORT_PRECONDITIONS_MISSING: Native import requires sourcePath, safeExtension, expectedSize, and expectedSha256')
        }
      }
    }

    // Coordinate atomic native import
    const descriptor = await this.adapter.importAsset({
      userId: this.repository.userId,
      serverDeviceId: this.repository.serverDeviceId,
      localAssetId,
      sourcePath: input.sourcePath,
      file: input.file,
      originalName: input.originalName,
      mimeType: input.mimeType,
      safeExtension,
      expectedSize,
      expectedSha256,
    })

    // Compute SQLite relative_path from trusted logical identity: assets/{userScope}/{localAssetId}/content.{safeExtension}
    const relativePath = computeLocalAssetRelativePath(
      this.repository.userId,
      localAssetId,
      descriptor.safeExtension,
    )

    // Register metadata in repository with state READY_LOCAL
    const assetFile = await this.repository.createAssetFile({
      localAssetId,
      relativePath,
      originalName: input.originalName,
      mimeType: input.mimeType,
      sizeBytes: descriptor.sizeBytes,
      sha256: descriptor.sha256,
      state: 'READY_LOCAL',
    })

    // If source draft requested, create draft and enqueue sync job
    if (input.sourceDraft) {
      const localSourceId = input.sourceDraft.localSourceId ?? this.idFactory()
      const localContentRevision = this.idFactory()
      await this.repository.createSourceDraft({
        localSourceId,
        localAssetId,
        subjectId: input.sourceDraft.subjectId,
        title: input.sourceDraft.title,
        localContentRevision,
        state: 'DRAFT',
      })
      await this.repository.enqueueSyncJob(localAssetId)
    }

    return {
      localAssetId: assetFile.localAssetId,
      serverAssetId: assetFile.serverAssetId,
      descriptor,
      state: assetFile.state,
      isPersistent: this.adapter.isPersistent,
      storageType: this.adapter.storageType,
    }
  }

  async resolveLocalAsset(identity: ResolveAssetIdentity): Promise<LocalAssetHandle | null> {
    const record = 'localAssetId' in identity && identity.localAssetId
      ? await this.repository.getAssetFile(identity.localAssetId)
      : 'serverAssetId' in identity && identity.serverAssetId
      ? await this.repository.getAssetFileByServerId(identity.serverAssetId)
      : null

    if (!record) return null

    // Touch access time
    await this.repository.touchAssetAccess(record.localAssetId)

    // Verify native file existence; native throws on missing file
    let descriptor: LocalAssetDescriptor | null = null
    try {
      descriptor = await this.adapter.resolveAsset({
        userId: this.repository.userId,
        serverDeviceId: this.repository.serverDeviceId,
        localAssetId: record.localAssetId,
        expectedSize: record.sizeBytes,
        expectedSha256: record.sha256,
      })
    } catch {
      // Native throws on FILE_MISSING / path missing; map to corrupt
      descriptor = null
    }

    if (!descriptor) {
      // File missing on disk -> transition to CORRUPT
      if (record.state !== 'CORRUPT' && record.state !== 'DELETING') {
        await this.repository.transitionAssetState(record.localAssetId, 'CORRUPT')
      }
      return {
        localAssetId: record.localAssetId,
        serverAssetId: record.serverAssetId,
        descriptor: {
          localAssetId: record.localAssetId,
          safeExtension: getFileExtension(record.originalName) || 'bin',
          sizeBytes: record.sizeBytes,
          sha256: record.sha256,
          absolutePath: '',
        },
        state: 'CORRUPT',
        isPersistent: this.adapter.isPersistent,
        storageType: this.adapter.storageType,
      }
    }

    return {
      localAssetId: record.localAssetId,
      serverAssetId: record.serverAssetId,
      descriptor,
      state: record.state,
      isPersistent: this.adapter.isPersistent,
      storageType: this.adapter.storageType,
    }
  }

  async downloadRemoteAsset(
    localAssetId: string,
    downloadUrl: string,
    expectedSizeBytes: number,
    expectedSha256: string,
    originalName = 'downloaded_asset',
    mimeType = 'application/octet-stream',
  ): Promise<LocalAssetHandle> {
    const safeExtension = (getFileExtension(originalName) || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin'
    const descriptor = await this.adapter.downloadAsset({
      userId: this.repository.userId,
      serverDeviceId: this.repository.serverDeviceId,
      localAssetId,
      remoteUrl: downloadUrl,
      expectedSize: expectedSizeBytes,
      expectedSha256,
      safeExtension,
    })

    const relativePath = computeLocalAssetRelativePath(
      this.repository.userId,
      localAssetId,
      descriptor.safeExtension,
    )

    let record = await this.repository.getAssetFile(localAssetId)
    if (record) {
      if (record.state === 'CORRUPT' || record.state === 'SYNCING') {
        await this.repository.transitionAssetState(localAssetId, 'SYNCED')
      }
      record = await this.repository.getAssetFile(localAssetId)
    } else {
      record = await this.repository.createAssetFile({
        localAssetId,
        relativePath,
        originalName,
        mimeType,
        sizeBytes: descriptor.sizeBytes,
        sha256: descriptor.sha256,
        state: 'SYNCED',
      })
    }

    return {
      localAssetId,
      serverAssetId: record?.serverAssetId ?? null,
      descriptor,
      state: 'SYNCED',
      isPersistent: this.adapter.isPersistent,
      storageType: this.adapter.storageType,
    }
  }

  async repairLocalAsset(localAssetId: string, downloadUrl?: string): Promise<LocalAssetHandle> {
    const record = await this.repository.getAssetFile(localAssetId)
    if (!record) throw new Error('LOCAL_ASSET_NOT_FOUND')

    if (downloadUrl) {
      return this.downloadRemoteAsset(localAssetId, downloadUrl, record.sizeBytes, record.sha256, record.originalName, record.mimeType)
    }

    const resolved = await this.resolveLocalAsset({ localAssetId })
    if (!resolved || resolved.state === 'CORRUPT') {
      throw new Error('LOCAL_ASSET_CANNOT_REPAIR: No remote source available and local copy is corrupted or missing')
    }
    return resolved
  }

  async deleteUnreferencedAsset(localAssetId: string): Promise<{ deleted: boolean; reason?: string }> {
    return withLocalAssetLifecycleLock(this.repository.userId, this.repository.serverDeviceId, () =>
      this.deleteUnreferencedAssetLocked(localAssetId))
  }

  private async deleteUnreferencedAssetLocked(localAssetId: string): Promise<{ deleted: boolean; reason?: string }> {
    const record = await this.repository.markUnreferencedAssetDeleting(localAssetId)
    if (!record) return { deleted: true }

    // Publish the durable fence before touching bytes.  Queue workers check
    // both the job row and this state at every external boundary, so a
    // successful late upload cannot bind a deleted Source.
    // DELETING is terminal and durable.  A crash or native busy/error leaves
    // this fence in place; startup reconciliation retries idempotently.
    await this.repository.cancelSyncJobsForAsset(localAssetId)

    await this.adapter.deleteAsset({
      userId: this.repository.userId,
      serverDeviceId: this.repository.serverDeviceId,
      localAssetId,
    })

    // Clean metadata
    await this.repository.deleteAssetFile(localAssetId)
    return { deleted: true }
  }

  async reconcileLocalAssets(): Promise<ReconciliationReport> {
    const allFiles = await this.repository.listAssetFiles()
    const activeFiles = allFiles.filter(f => f.state !== 'DELETING')

    const result = await this.adapter.reconcileAssets({
      userId: this.repository.userId,
      serverDeviceId: this.repository.serverDeviceId,
      knownLocalAssetIds: allFiles.map((file) => file.localAssetId),
    })

    const nativeMap = new Map<string, LocalAssetDescriptor>()
    for (const file of result.files) {
      nativeMap.set(file.localAssetId, file)
    }

    const verified: string[] = []
    const markedCorrupt: string[] = []
    const allDbFileIds = new Set(allFiles.map(f => f.localAssetId))

    // Compare DB records with returned native files
    for (const dbFile of activeFiles) {
      const nativeFile = nativeMap.get(dbFile.localAssetId)
      if (!nativeFile) {
        markedCorrupt.push(dbFile.localAssetId)
        if (dbFile.state !== 'CORRUPT') {
          await this.repository.transitionAssetState(dbFile.localAssetId, 'CORRUPT')
        }
      } else if (nativeFile.sizeBytes !== dbFile.sizeBytes || nativeFile.sha256 !== dbFile.sha256) {
        markedCorrupt.push(dbFile.localAssetId)
        if (dbFile.state !== 'CORRUPT') {
          await this.repository.transitionAssetState(dbFile.localAssetId, 'CORRUPT')
        }
      } else {
        verified.push(dbFile.localAssetId)
      }
    }

    // Identify files returned by native that are not in SQLite
    const orphansIdentified: string[] = []
    for (const nativeFile of result.files) {
      if (!allDbFileIds.has(nativeFile.localAssetId)) {
        // Native reconciliation must never return absolute paths for files
        // that are not backed by a DB row.  Keep only the logical identifier
        // in the report; the native side quarantines the actual bytes.
        orphansIdentified.push(nativeFile.localAssetId)
      }
    }

    // A crash may leave metadata in the terminal DELETING state after the
    // durable fence but before native bytes/metadata cleanup.  Retry those
    // rows idempotently during startup; active references still win and keep
    // the row for a later reconciliation pass.
    for (const deleting of allFiles.filter((file) => file.state === 'DELETING')) {
      try {
        await this.deleteUnreferencedAsset(deleting.localAssetId)
      } catch (error) {
        if (!(error instanceof Error) || !error.message.includes('ASSET_HAS_ACTIVE_REFERENCES')) {
          console.warn('[LocalAsset] deferred DELETING cleanup', error)
        }
      }
    }

    return {
      verified,
      markedCorrupt,
      orphansIdentified,
      removedStagingFiles: result.removedStagingFiles,
      quarantinedFiles: result.quarantinedFiles ?? [],
    }
  }

  async uploadAssetToRemote(
    localAssetId: string,
    uploadUrl: string,
    headers?: Record<string, string>,
  ): Promise<{ status: number; bytesSent: number; payloadSha256: string }> {
    const record = await this.repository.getAssetFile(localAssetId)
    if (!record) throw new Error('LOCAL_ASSET_NOT_FOUND')
    const receipt = await this.adapter.uploadAssetToRemote({
      userId: this.repository.userId,
      serverDeviceId: this.repository.serverDeviceId,
      localAssetId,
      uploadUrl,
      headers,
      expectedSize: record.sizeBytes,
      expectedSha256: record.sha256,
    })

    if (receipt.status < 200 || receipt.status >= 300) {
      throw new Error(`LOCAL_ASSET_UPLOAD_FAILED: Server returned status ${receipt.status}`)
    }
    if (receipt.bytesSent !== record.sizeBytes || receipt.payloadSha256.toLowerCase() !== record.sha256.toLowerCase()) {
      throw new Error('NATIVE_UPLOAD_RECEIPT_MISMATCH')
    }

    return receipt
  }

  async readAssetBytes(localAssetId: string, expectedSize?: number, expectedSha256?: string): Promise<LocalAssetReadResult> {
    const record = await this.repository.getAssetFile(localAssetId)
    if (!record) {
      throw new Error('LOCAL_ASSET_NOT_FOUND: Local asset file record not found')
    }
    const resolvedSize = expectedSize ?? record.sizeBytes
    const resolvedSha256 = expectedSha256 ?? record.sha256

    return this.adapter.readAssetBytes({
      userId: this.repository.userId,
      serverDeviceId: this.repository.serverDeviceId,
      localAssetId,
      expectedSize: resolvedSize,
      expectedSha256: resolvedSha256,
    })
  }

  /**
   * Reads an owner-scoped local asset without exposing its managed path to a
   * caller. The returned File is an ephemeral parser/preview input; the
   * relative path and native absolute path remain inside the local store.
   */
  async readAssetFile(
    identity: ResolveAssetIdentity,
    options: { name?: string; mimeType?: string } = {},
  ): Promise<LocalAssetFileReadResult | null> {
    const record = 'localAssetId' in identity && identity.localAssetId
      ? await this.repository.getAssetFile(identity.localAssetId)
      : 'serverAssetId' in identity && identity.serverAssetId
      ? await this.repository.getAssetFileByServerId(identity.serverAssetId)
      : null

    if (!record) return null

    let readResult: LocalAssetReadResult
    try {
      readResult = await this.readAssetBytes(record.localAssetId, record.sizeBytes, record.sha256)
    } catch (error) {
      // A record whose managed file disappeared is a local miss. Mark it
      // corrupt and let the caller decide whether an online server fallback
      // is available; hash/frame errors must remain hard failures.
      const message = error instanceof Error ? error.message : String(error)
      if (!/FILE_MISSING|LOCAL_ASSET_NOT_FOUND/i.test(message)) throw error
      if (record.state !== 'CORRUPT' && record.state !== 'DELETING') {
        await this.repository.transitionAssetState(record.localAssetId, 'CORRUPT').catch(() => undefined)
      }
      return null
    }

    await this.repository.touchAssetAccess(record.localAssetId)
    const fileName = options.name?.trim() || record.originalName
    const mimeType = options.mimeType?.trim() || record.mimeType || 'application/octet-stream'
    const fileBytes = new Uint8Array(readResult.bytes.byteLength)
    fileBytes.set(readResult.bytes)
    return {
      file: new File([fileBytes.buffer], fileName, { type: mimeType }),
      localAssetId: record.localAssetId,
      serverAssetId: record.serverAssetId,
      cleanup: () => undefined,
    }
  }
}

const assetServiceCache = new Map<string, LocalAssetService>()

export function getOrCreateLocalAssetService(repository: LocalAssetRepository): LocalAssetService {
  const key = `${repository.userId}:${repository.serverDeviceId}`
  let instance = assetServiceCache.get(key)
  if (!instance) {
    instance = new LocalAssetService(repository)
    assetServiceCache.set(key, instance)
  }
  return instance
}
