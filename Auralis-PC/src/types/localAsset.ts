/**
 * PC Local Asset Store domain types and contracts.
 * Matches docs/design/2026-09-15-pc-local-asset-store-design.md
 */

export const LOCAL_ASSET_STATES = [
  'STAGING',
  'READY_LOCAL',
  'SYNCING',
  'SYNCED',
  'SYNC_FAILED',
  'CORRUPT',
  'DELETING',
] as const

export type LocalAssetState = typeof LOCAL_ASSET_STATES[number]

export const LOCAL_ASSET_SYNC_PHASES = [
  'PENDING',
  'CREATING_REMOTE_ASSET',
  'UPLOADING',
  'COMPLETING_REMOTE_ASSET',
  'BINDING_SOURCE',
  'SYNCED',
  'FAILED',
] as const

export type LocalAssetSyncPhase = typeof LOCAL_ASSET_SYNC_PHASES[number]

export const LOCAL_SOURCE_DRAFT_STATES = [
  'DRAFT',
  'SYNCING',
  'SYNCED',
  'DELETED',
] as const

export type LocalSourceDraftState = typeof LOCAL_SOURCE_DRAFT_STATES[number]

export interface LocalAssetFile {
  userId: string
  serverDeviceId: string
  localAssetId: string
  serverAssetId: string | null
  relativePath: string
  originalName: string
  mimeType: string
  sizeBytes: number
  sha256: string
  state: LocalAssetState
  createdAt: string
  verifiedAt: string
  lastAccessedAt: string
  deletedAt: string | null
}

export interface LocalAssetSyncJob {
  jobId: string
  userId: string
  serverDeviceId: string
  localAssetId: string
  phase: LocalAssetSyncPhase
  attempt: number
  nextRetryAt: string | null
  serverAssetId: string | null
  safeErrorCode: string | null
  safeErrorDetail: string | null
  createdAt: string
  updatedAt: string
}

export interface LocalSourceDraft {
  userId: string
  serverDeviceId: string
  localSourceId: string
  serverSourceId: string | null
  localAssetId: string
  subjectId: string
  title: string
  localContentRevision: string
  serverIngestionRevision: string | null
  state: LocalSourceDraftState
  createdAt: string
  updatedAt: string
}

export interface LocalAssetDescriptor {
  localAssetId: string
  safeExtension: string
  sizeBytes: number
  sha256: string
  absolutePath: string
}

export interface LocalAssetHandle {
  localAssetId: string
  serverAssetId: string | null
  descriptor: LocalAssetDescriptor
  state: LocalAssetState
  isPersistent: boolean
  storageType: 'native-tauri' | 'transient-browser'
}

export interface ImportAssetInput {
  file?: File
  sourcePath?: string
  originalName: string
  mimeType: string
  safeExtension?: string
  expectedSize?: number
  expectedSha256?: string
  sizeBytes?: number
  sha256?: string
  sourceDraft?: {
    subjectId: string
    title: string
    localSourceId?: string
  }
}

export type ResolveAssetIdentity =
  | { localAssetId: string; serverAssetId?: never }
  | { serverAssetId: string; localAssetId?: never }

export interface ReconciliationReport {
  verified: string[]
  markedCorrupt: string[]
  orphansIdentified: string[]
  removedStagingFiles?: number
}

/**
 * Computes the canonical relative storage path for a local asset in SQLite:
 * assets/{userScope}/{localAssetId}/content.{safeExtension}
 */
export function computeLocalAssetRelativePath(
  userScope: string,
  localAssetId: string,
  safeExtension: string,
): string {
  const cleanExt = safeExtension.toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin'
  return `assets/${userScope}/${localAssetId}/content.${cleanExt}`
}

