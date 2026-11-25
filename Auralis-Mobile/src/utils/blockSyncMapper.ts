export interface SyncedKnowledgeBlockRecord {
  id: string
  subject: string
  title: string
  preview: string
  time: string
  source: string
  color: string
  sync_status: 'synced'
  sync_version: number
  subjectId?: string
  sourceFileId?: string
  tags: string[]
  mastery: number
  reviewAt?: string
  relatedBlockIds: string[]
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string')
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []
    } catch {
      return []
    }
  }
  return []
}

export function resolveBlockSyncVersion(payload: Record<string, unknown>, fallbackVersion = 0): number {
  const candidate = payload.version ?? payload.sync_version ?? fallbackVersion ?? 0
  const numeric = Number(candidate)
  return Number.isFinite(numeric) ? numeric : 0
}

export function fromServerBlockPayload(
  payload: Record<string, unknown>,
  fallbackVersion = 0,
): Record<string, unknown> {
  return {
    ...payload,
    subject: asString(payload.subject),
    preview: asString(payload.content ?? payload.preview),
    time: asString(payload.updatedAt) || asString(payload.createdAt) || asString(payload.time),
    source: asString(payload.source),
    color: asString(payload.colorOverride ?? payload.color),
    sourceFileId: asString(payload.sourceId ?? payload.sourceFileId) || undefined,
    sync_version: resolveBlockSyncVersion(payload, fallbackVersion),
  }
}

export function buildSyncedBlockRecord(
  entityId: string,
  payload: Record<string, unknown>,
  fallbackVersion = 0,
): SyncedKnowledgeBlockRecord {
  const resolvedVersion = resolveBlockSyncVersion(payload, fallbackVersion)
  return {
    id: entityId,
    subject: asString(payload.subject),
    title: asString(payload.title),
    preview: asString(payload.preview ?? payload.content),
    time: asString(payload.time) || asString(payload.updatedAt) || asString(payload.createdAt),
    source: asString(payload.source),
    color: asString(payload.color ?? payload.colorOverride),
    sync_status: 'synced',
    sync_version: resolvedVersion,
    subjectId: asString(payload.subjectId ?? payload.subject_id) || undefined,
    sourceFileId: asString(payload.sourceFileId ?? payload.source_file_id) || undefined,
    tags: asStringArray(payload.tags),
    mastery: Number(payload.mastery || 0),
    reviewAt: asString(payload.reviewAt ?? payload.review_at) || undefined,
    relatedBlockIds: asStringArray(payload.relatedBlockIds),
  }
}

export function toServerBlockBaseVersion(payload: Record<string, unknown>): number {
  return resolveBlockSyncVersion(payload, 0)
}

export const DEFAULT_BLOCK_THEME_COLOR = 'rgba(181,196,177,0.4)'

export const BLOCK_THEME_COLORS = [
  { name: '绿', value: 'rgba(181,196,177,0.4)' },
  { name: '沙', value: 'rgba(217,197,178,0.4)' },
  { name: '粉', value: 'rgba(212,163,163,0.4)' },
  { name: '蓝', value: 'rgba(179,192,207,0.4)' },
  { name: '黄', value: 'rgba(230,223,216,0.5)' },
] as const

/** Resolves display source label from the linked source title first, falling back to stored text. */
export function resolveBlockSourceLabel(
  block: { source?: string; sourceFileId?: string },
  sources: ReadonlyArray<{ id?: string; title?: string }>,
): string {
  if (block.sourceFileId) {
    const matched = sources.find(item => item.id === block.sourceFileId)
    const matchedTitle = matched?.title?.trim()
    if (matchedTitle) return matchedTitle
  }
  const rawSource = block.source?.trim()
  if (rawSource) return rawSource
  return '自主整理'
}

/** Normalizes legacy or blank block colors to PC's default green theme dot. */
export function normalizeBlockThemeColor(color?: string | null): string {
  const trimmed = color?.trim() || ''
  if (!trimmed || trimmed.toUpperCase() === '#8B9A6E') {
    return DEFAULT_BLOCK_THEME_COLOR
  }
  return trimmed
}

/** Matches PC workspace block creation: bind the active selected source when present, otherwise '手动创建'. */
export function resolveWorkspaceCreatedBlockSource(
  selectedSource?: { id?: string; title?: string } | null,
): { source: string; sourceFileId?: string } {
  if (selectedSource?.id) {
    return {
      source: selectedSource.title?.trim() || '手动创建',
      sourceFileId: selectedSource.id,
    }
  }
  return {
    source: '手动创建',
    sourceFileId: undefined,
  }
}
