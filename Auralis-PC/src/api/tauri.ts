import { invoke } from '@tauri-apps/api/core'

export function normalizeInvokeError(error: unknown): Error {
  if (error instanceof Error) return error
  if (typeof error === 'string' && error.trim()) return new Error(error.trim())
  if (error && typeof error === 'object') {
    const candidate = error as Record<string, unknown>
    for (const key of ['message', 'error', 'code']) {
      const value = candidate[key]
      if (typeof value === 'string' && value.trim()) return new Error(value.trim())
    }
  }
  return new Error('TAURI_COMMAND_FAILED')
}

/**
 * 通用 Rust 命令调用封装
 */
export const invokeRustCmd = async <T>(command: string, args?: Record<string, unknown>): Promise<T> => {
  try {
    return await invoke<T>(command, args)
  } catch (error) {
    throw normalizeInvokeError(error)
  }
}

export const MAX_OCR_IMAGE_BYTES = 20 * 1024 * 1024
export const MAX_OCR_TIMEOUT_MS = 120_000

export interface OcrPageCommand {
  taskId: string
  pageNumber: number
  imageBytes: number[]
  timeoutMs: number
}

export interface OcrPageResult {
  protocolVersion: 1
  ok: boolean
  taskId: string
  pageNumber: number
  lines: Array<{ text: string; score?: number }>
  timingMs: { det: number; rec: number; total: number }
  errorCode?: string
}

export interface OcrWarmupView {
  ready: boolean
  restartCount: number
  errorCode?: string
}

const validateOcrPageCommand = (command: OcrPageCommand): void => {
  if (!command.taskId.trim() || command.pageNumber < 1 || command.imageBytes.length > MAX_OCR_IMAGE_BYTES) {
    throw new Error('OCR_PROTOCOL_INVALID')
  }
  if (command.timeoutMs < 1 || command.timeoutMs > MAX_OCR_TIMEOUT_MS) {
    throw new Error('OCR_PROTOCOL_INVALID')
  }
}

export const ocrWarmup = (): Promise<OcrWarmupView> => {
  return invokeRustCmd<OcrWarmupView>('ocr_warmup')
}

export const ocrRecognizePage = (command: OcrPageCommand): Promise<OcrPageResult> => {
  validateOcrPageCommand(command)
  return invokeRustCmd<OcrPageResult>('ocr_recognize_page', { command })
}

export const ocrShutdown = (): Promise<void> => {
  return invokeRustCmd<void>('ocr_shutdown')
}

export interface DocumentPackageHeader {
  schemaVersion: 1
  payloadFormat: 'parsed-document-v1'
  userId: string
  serverDeviceId: string
  sourceId: string
  jobId: string
  ingestionRevision: string
  sourceAssetSha256: string
  parserId: string
  parserVersion: string
  normalizationVersion: string
  ocrModelVersion: string | null
}

export interface ParsedDocumentBlockCommand {
  ordinal: number
  kind: 'paragraph' | 'page' | 'slide' | 'ocr-page'
  text: string
  pageNumber?: number | null
  anchorIndex?: number | null
  startLine?: number | null
}

export interface DocumentCacheReceipt {
  cacheId: string
  envelopeVersion: 1
  chunkCount: number
  encryptedBytes: number
  plainTextSha256: string
  payloadSha256: string
  payloadBytes: number
  payloadFormat?: 'parsed-document-v1'
  sourceAssetSha256?: string
  parserId?: string
  parserVersion?: string
  normalizationVersion?: string
  ocrModelVersion?: string | null
}

export const DOCUMENT_PAYLOAD_FORMAT = 'parsed-document-v1' as const
export const MAX_PACKAGE_METADATA_CHARS = 200

const boundedMetadata = (value: string, optional = false): boolean =>
  (optional && value === '') || (value.trim().length > 0 && value.length <= MAX_PACKAGE_METADATA_CHARS)

export const isDocumentCacheReceiptV1 = (receipt: DocumentCacheReceipt): boolean =>
  receipt.payloadFormat === DOCUMENT_PAYLOAD_FORMAT
  && typeof receipt.sourceAssetSha256 === 'string' && /^[a-f0-9]{64}$/.test(receipt.sourceAssetSha256)
  && typeof receipt.parserId === 'string' && boundedMetadata(receipt.parserId)
  && typeof receipt.parserVersion === 'string' && boundedMetadata(receipt.parserVersion)
  && typeof receipt.normalizationVersion === 'string' && boundedMetadata(receipt.normalizationVersion)
  && (receipt.ocrModelVersion === null || (typeof receipt.ocrModelVersion === 'string' && boundedMetadata(receipt.ocrModelVersion)))

export interface DocumentCachePayloadInfo {
  payloadSha256: string
  payloadBytes: number
}

export interface DocumentUploadPutRequest {
  uploadUrl: string
  cacheId: string
  userId: string
  serverDeviceId: string
  sourceId: string
  jobId: string
  ingestionRevision: string
  headers: Record<string, string>
  expectedSize: number
  expectedPayloadSha256: string
}

export interface DocumentUploadPutReceipt {
  status: number
  bytesSent: number
  payloadSha256: string
}

export const documentPackageBegin = (header: DocumentPackageHeader): Promise<string> => {
  if (header.schemaVersion !== 1 || header.payloadFormat !== DOCUMENT_PAYLOAD_FORMAT
    || !header.userId.trim() || !header.serverDeviceId.trim() || !header.sourceId.trim() || !header.jobId.trim() || !header.ingestionRevision.trim()
    || !/^[a-f0-9]{64}$/.test(header.sourceAssetSha256)
    || !boundedMetadata(header.parserId) || !boundedMetadata(header.parserVersion)
    || !boundedMetadata(header.normalizationVersion)
    || (header.ocrModelVersion !== null && !boundedMetadata(header.ocrModelVersion))) {
    throw new Error('DOCUMENT_PACKAGE_HEADER_INVALID')
  }
  return invokeRustCmd<string>('document_package_begin', { header })
}

export const documentPackageAppend = (packageId: string, block: ParsedDocumentBlockCommand): Promise<void> => {
  if (!packageId.trim() || !Number.isInteger(block.ordinal) || block.ordinal < 0 || !block.text.trim() || block.text.length > 100_000) {
    throw new Error('DOCUMENT_PACKAGE_BLOCK_INVALID')
  }
  return invokeRustCmd<void>('document_package_append', { packageId, block })
}

export const documentPackageFinish = (packageId: string): Promise<DocumentCacheReceipt> => {
  if (!packageId.trim()) throw new Error('DOCUMENT_PACKAGE_ID_INVALID')
  return invokeRustCmd<DocumentCacheReceipt>('document_package_finish', { packageId })
}

export const documentCacheDelete = (cacheId: string): Promise<boolean> => {
  if (!cacheId.trim()) throw new Error('CACHE_ID_INVALID')
  return invokeRustCmd<boolean>('document_cache_delete', { cacheId })
}

export const documentCachePayloadInfo = (scope: {
  cacheId: string
  userId: string
  serverDeviceId: string
  sourceId: string
  jobId: string
  ingestionRevision: string
}): Promise<DocumentCachePayloadInfo> => {
  if (!scope.cacheId.trim() || !scope.userId.trim() || !scope.serverDeviceId.trim()
    || !scope.sourceId.trim() || !scope.jobId.trim() || !scope.ingestionRevision.trim()) {
    throw new Error('CACHE_SCOPE_INVALID')
  }
  return invokeRustCmd<DocumentCachePayloadInfo>('document_cache_payload_info', scope)
}

export const documentUploadPut = (request: DocumentUploadPutRequest): Promise<DocumentUploadPutReceipt> => {
  if (!request.uploadUrl.trim() || !request.cacheId.trim() || !request.userId.trim()
    || !request.serverDeviceId.trim() || !request.sourceId.trim() || !request.jobId.trim()
    || !request.ingestionRevision.trim() || request.expectedSize <= 0
    || !/^[a-f0-9]{64}$/i.test(request.expectedPayloadSha256)) {
    throw new Error('DOCUMENT_UPLOAD_REQUEST_INVALID')
  }
  return invokeRustCmd<DocumentUploadPutReceipt>('document_upload_put', { request })
}

export interface LocalResourceSnapshotItem {
  resourceType: string
  resourceId: string
  version: number
  deletedAt: string | null
  value: unknown
}

export const replaceLocalResourceSnapshot = (
  userId: string,
  items: LocalResourceSnapshotItem[],
): Promise<void> => {
  if (!userId.trim() || items.some((item) => !item.resourceType.trim() || !item.resourceId.trim()
    || !Number.isInteger(item.version) || item.version < 0)) {
    throw new Error('LOCAL_SNAPSHOT_INVALID')
  }
  return invokeRustCmd<void>('replace_local_resource_snapshot', {
    command: { userId, items },
  })
}

export interface LocalAssetDescriptor {
  localAssetId: string
  safeExtension: string
  sizeBytes: number
  sha256: string
  absolutePath: string
}

export const MAX_LOCAL_ASSET_BYTES = 52_428_800

export interface ImportLocalAssetCommand {
  userScope: string
  deviceId: string
  localAssetId: string
  sourcePath: string
  safeExtension: string
  expectedSize: number
  expectedSha256: string
}

export interface ImportLocalAssetBytesCommand {
  userScope: string
  deviceId: string
  localAssetId: string
  safeExtension: string
  expectedSize: number
  expectedSha256: string
  content: number[]
}

export interface ResolveLocalAssetCommand {
  userScope: string
  deviceId: string
  localAssetId: string
  expectedSize?: number
  expectedSha256?: string
}

export interface DownloadLocalAssetCommand {
  userScope: string
  deviceId: string
  localAssetId: string
  remoteUrl: string
  expectedSize: number
  expectedSha256: string
  safeExtension: string
}

export interface DeleteLocalAssetCommand {
  userScope: string
  deviceId: string
  localAssetId: string
}

export interface ReconcileLocalAssetsCommand {
  userScope: string
  deviceId: string
}

export interface ReconcileLocalAssetsResult {
  removedStagingFiles: number
  files: LocalAssetDescriptor[]
}

export const importLocalAsset = (command: ImportLocalAssetCommand): Promise<LocalAssetDescriptor> => {
  if (
    !command.userScope?.trim()
    || !command.deviceId?.trim()
    || !command.localAssetId?.trim()
    || !command.sourcePath?.trim()
    || !command.safeExtension?.trim()
    || typeof command.expectedSize !== 'number'
    || command.expectedSize < 0
    || command.expectedSize > MAX_LOCAL_ASSET_BYTES
    || !/^[a-f0-9]{64}$/i.test(command.expectedSha256)
  ) {
    throw new Error('LOCAL_ASSET_COMMAND_INVALID')
  }
  return invokeRustCmd<LocalAssetDescriptor>('import_local_asset', { command })
}

export const importLocalAssetBytes = (command: ImportLocalAssetBytesCommand): Promise<LocalAssetDescriptor> => {
  if (
    !command.userScope?.trim()
    || !command.deviceId?.trim()
    || !command.localAssetId?.trim()
    || !command.safeExtension?.trim()
    || typeof command.expectedSize !== 'number'
    || command.expectedSize < 0
    || command.expectedSize > MAX_LOCAL_ASSET_BYTES
    || !/^[a-f0-9]{64}$/i.test(command.expectedSha256)
    || !Array.isArray(command.content)
    || command.content.length > MAX_LOCAL_ASSET_BYTES
  ) {
    throw new Error('LOCAL_ASSET_COMMAND_INVALID')
  }
  return invokeRustCmd<LocalAssetDescriptor>('import_local_asset_bytes', { command })
}

export const resolveLocalAssetNative = (command: ResolveLocalAssetCommand): Promise<LocalAssetDescriptor> => {
  if (!command.userScope?.trim() || !command.deviceId?.trim() || !command.localAssetId?.trim()) {
    throw new Error('LOCAL_ASSET_COMMAND_INVALID')
  }
  return invokeRustCmd<LocalAssetDescriptor>('resolve_local_asset', { command })
}

export const downloadLocalAsset = (command: DownloadLocalAssetCommand): Promise<LocalAssetDescriptor> => {
  if (
    !command.userScope?.trim()
    || !command.deviceId?.trim()
    || !command.localAssetId?.trim()
    || !command.remoteUrl?.trim()
    || typeof command.expectedSize !== 'number'
    || command.expectedSize < 0
    || !/^[a-f0-9]{64}$/i.test(command.expectedSha256)
    || !command.safeExtension?.trim()
  ) {
    throw new Error('LOCAL_ASSET_COMMAND_INVALID')
  }
  return invokeRustCmd<LocalAssetDescriptor>('download_local_asset', { command })
}

export const deleteLocalAsset = (command: DeleteLocalAssetCommand): Promise<void> => {
  if (!command.userScope?.trim() || !command.deviceId?.trim() || !command.localAssetId?.trim()) {
    throw new Error('LOCAL_ASSET_COMMAND_INVALID')
  }
  return invokeRustCmd<void>('delete_local_asset', { command })
}

export const reconcileLocalAssets = (command: ReconcileLocalAssetsCommand): Promise<ReconcileLocalAssetsResult> => {
  if (!command.userScope?.trim() || !command.deviceId?.trim()) {
    throw new Error('LOCAL_ASSET_COMMAND_INVALID')
  }
  return invokeRustCmd<ReconcileLocalAssetsResult>('reconcile_local_assets', { command })
}

export interface LocalAssetUploadPutCommand {
  userScope: string
  deviceId: string
  localAssetId: string
  uploadUrl: string
  headers?: Record<string, string>
  expectedSize: number
  expectedSha256: string
}

export interface LocalAssetUploadPutReceipt {
  status: number
  bytesSent: number
  payloadSha256: string
}

export const localAssetUploadPut = (command: LocalAssetUploadPutCommand): Promise<LocalAssetUploadPutReceipt> => {
  if (
    !command.userScope?.trim() ||
    !command.deviceId?.trim() ||
    !command.localAssetId?.trim() ||
    !command.uploadUrl?.trim() ||
    typeof command.expectedSize !== 'number' ||
    command.expectedSize < 0 ||
    !/^[a-f0-9]{64}$/i.test(command.expectedSha256)
  ) {
    throw new Error('LOCAL_ASSET_COMMAND_INVALID')
  }
  return invokeRustCmd<LocalAssetUploadPutReceipt>('local_asset_upload_put', { command })
}
