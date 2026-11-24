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

/** Preserves existing sourceFileId across edits unless the user intentionally changes or clears the source label. */
export function resolveEditedBlockSourceLink(params: {
  draftSource: string
  initialSourceLabel: string
  existingSource?: string
  existingSourceFileId?: string
  sources: ReadonlyArray<{ id?: string; title?: string }>
}): { source: string; sourceFileId?: string } {
  const trimmed = params.draftSource.trim() || '自主整理'
  if (trimmed !== '自主整理') {
    const matched = params.sources.find(item => (item.title || '').trim() === trimmed)
    if (matched?.id) {
      return { source: trimmed, sourceFileId: matched.id }
    }
  }
  if (params.existingSourceFileId && trimmed === params.initialSourceLabel) {
    return {
      source: trimmed === '自主整理' ? (params.existingSource || '') : trimmed,
      sourceFileId: params.existingSourceFileId,
    }
  }
  return { source: trimmed, sourceFileId: undefined }
}
