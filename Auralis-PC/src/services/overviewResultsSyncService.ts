import { ApiProblemError } from '@/api/httpError'
import type {
  FileOverviewRecord, OverviewCacheRecord, OverviewMode,
  OverviewResultCommand, OverviewResultView, OverviewSourceManifestEntry, OverviewSyncState,
  OverviewSubjectStatusItem, OverviewSubjectStatusesResponse,
} from '@/types/overview'
import { createOutlineIdentityInput, hasCompleteOutlineIdentityInput } from './outlineIdentity.ts'
import { computeSubjectInputFingerprint, isOverviewGenerationEditConflict, type OverviewRepository, type OverviewScopeFenceToken } from './overviewRepository.ts'

export interface OverviewSyncSource {
  id: string
  type: string
  subjectId: string
  ingestionStatus: string
  ingestionRevision: string | null
  deletedAt?: string | null
}

export interface OverviewSyncOptions {
  sources: OverviewSyncSource[]
  subjectIds: string[]
  isCurrent: () => boolean
  isSourceCurrent?: (source: OverviewSyncSource) => boolean | Promise<boolean>
  isSubjectCurrent?: (subjectId: string) => boolean | Promise<boolean>
  getCurrentSources?: () => Promise<OverviewSyncSource[]>
}

export interface OverviewResultsApi {
  getFile(sourceId: string, ingestionRevision: string): Promise<OverviewResultView | null>
  putFile(sourceId: string, command: OverviewResultCommand): Promise<OverviewResultView>
  getSubject(subjectId: string): Promise<OverviewResultView | null>
  putSubject(subjectId: string, command: OverviewResultCommand): Promise<OverviewResultView>
  getSubjectStatuses(subjectIds: string[]): Promise<OverviewSubjectStatusesResponse>
}

const lazyOverviewResultsApi: OverviewResultsApi = {
  async getFile(sourceId, ingestionRevision) {
    return (await import('@/api/useOverviewResultsApi')).useOverviewResultsApi.getFile(sourceId, ingestionRevision)
  },
  async putFile(sourceId, command) {
    return (await import('@/api/useOverviewResultsApi')).useOverviewResultsApi.putFile(sourceId, command)
  },
  async getSubject(subjectId) {
    return (await import('@/api/useOverviewResultsApi')).useOverviewResultsApi.getSubject(subjectId)
  },
  async putSubject(subjectId, command) {
    return (await import('@/api/useOverviewResultsApi')).useOverviewResultsApi.putSubject(subjectId, command)
  },
  async getSubjectStatuses(subjectIds) {
    return (await import('@/api/useOverviewResultsApi')).useOverviewResultsApi.getSubjectStatuses(subjectIds)
  },
}

const MAX_SYNC_SOURCES = 500
const inFlightByScope = new Map<string, Promise<void>>()
const inFlightConflictResolutions = new Map<string, Promise<void>>()

export function runOverviewConflictResolutionOnce(key: string, resolve: () => Promise<void>): Promise<void> {
  const existing = inFlightConflictResolutions.get(key)
  if (existing) return existing

  // Defer the body so the promise is registered before cache refresh can re-enter this resolver.
  const pending = Promise.resolve().then(resolve)
  inFlightConflictResolutions.set(key, pending)
  const clear = (): void => {
    if (inFlightConflictResolutions.get(key) === pending) inFlightConflictResolutions.delete(key)
  }
  void pending.then(clear, clear)
  return pending
}

async function mapBounded<T>(items: T[], concurrency: number, task: (item: T) => Promise<void>): Promise<void> {
  let next = 0
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      const index = next++
      await task(items[index])
    }
  })
  await Promise.all(runners)
}

function validCompleteRecord(record: OverviewCacheRecord | null): record is OverviewCacheRecord {
  return Boolean(record?.status === 'READY' && Array.isArray(record.outline) && record.outline.length > 0
    && record.summary && record.summary.overview.trim())
}

function versionOrNull(value: number): number | null { return Number.isInteger(value) && value >= 0 ? value : null }

function stateFromView(view: OverviewResultView, scopeType: 'FILE' | 'SUBJECT', scopeId: string, revisionKey: string): OverviewSyncState {
  return {
    scopeType, scopeId, revisionKey, version: view.version,
    outlineVersion: versionOrNull(view.outlineVersion), summaryVersion: versionOrNull(view.summaryVersion),
    outlineSourceManifest: view.outlineSourceManifest ?? null, summarySourceManifest: view.summarySourceManifest ?? null,
    outlineInputFingerprint: view.outlineInputFingerprint ?? null, summaryInputFingerprint: view.summaryInputFingerprint ?? null,
    updatedAt: view.updatedAt,
  }
}

async function remoteCacheRecord(
  view: OverviewResultView,
  scopeType: 'FILE' | 'SUBJECT',
  scopeId: string,
  revisionKey: string,
  inputFingerprint: string | null = null,
): Promise<OverviewCacheRecord> {
  return {
    scopeType, scopeId, revisionKey, schemaVersion: 1, title: view.title,
    outline: view.outline, summary: view.summary,
    identityReady: view.identityReady === true && Boolean(view.outlineIdentity),
    outlineIdentity: view.outlineIdentity ?? null,
    outlineIdentityInput: null,
    outlineProvenance: view.outlineProvenance ?? null,
    outlineProvenanceInput: null,
    outlineGeneratedAt: view.outlineGeneratedAt ?? null,
    summaryGeneratedAt: view.summaryGeneratedAt ?? null,
    inputFingerprint, status: 'READY', errorCode: null, errorDetail: null, updatedAt: view.updatedAt,
  }
}

function matchesFileView(view: OverviewResultView, source: OverviewSyncSource): boolean {
  return view.scopeType === 'SOURCE' && view.sourceId === source.id
    && view.ingestionRevision === source.ingestionRevision
    && Array.isArray(view.outline) && view.outline.length > 0 && Boolean(view.summary)
}

function matchesSubjectView(view: OverviewResultView, subjectId: string): boolean {
  return view.scopeType === 'SUBJECT' && view.subjectId === subjectId
    && Array.isArray(view.outline) && view.outline.length > 0 && Boolean(view.summary)
}

export async function computeOverviewManifestFingerprint(entries: OverviewSourceManifestEntry[]): Promise<string> {
  const canonical = ['AURALIS-SUBJECT-OVERVIEW-MANIFEST-V1', ...[...entries].sort((left, right) => {
    const a = left.sourceId.toLowerCase()
    const b = right.sourceId.toLowerCase()
    return a < b ? -1 : a > b ? 1 : 0
  }).map(entry => [
    entry.sourceId.toLowerCase(), entry.ingestionRevision.toLowerCase(),
    entry.outlineVersion === null ? '-' : String(entry.outlineVersion),
    entry.summaryVersion === null ? '-' : String(entry.summaryVersion),
  ].join('\t'))].join('\n') + '\n'
  const subtle = globalThis.crypto?.subtle
  if (!subtle) throw new Error('OVERVIEW_CRYPTO_UNAVAILABLE')
  const digest = await subtle.digest('SHA-256', new TextEncoder().encode(canonical))
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

function projectManifest(entries: OverviewSourceManifestEntry[], mode: OverviewMode): OverviewSourceManifestEntry[] {
  return entries.map(entry => ({
    ...entry,
    outlineVersion: mode === 'SUMMARY' ? null : entry.outlineVersion,
    summaryVersion: mode === 'OUTLINE' ? null : entry.summaryVersion,
  }))
}

function modeInputsAvailable(entries: OverviewSourceManifestEntry[], mode: OverviewMode): boolean {
  return entries.length > 0 && entries.every(entry =>
    (mode === 'SUMMARY' || entry.outlineVersion !== null && entry.outlineVersion > 0)
    && (mode === 'OUTLINE' || entry.summaryVersion !== null && entry.summaryVersion > 0))
}

function errorStatus(error: unknown): 'CONFLICT' | 'ERROR' | 'PENDING' | 'STALE' {
  if (error instanceof ApiProblemError && ['INGESTION_REVISION_STALE', 'RESOURCE_DELETED'].includes(String(error.problem.code))) return 'STALE'
  if (error instanceof ApiProblemError && (error.status === 409 || error.problem.code === 'RESOURCE_VERSION_CONFLICT')) return 'CONFLICT'
  if (error instanceof ApiProblemError && (error.status === 0 || error.status >= 500)) return 'PENDING'
  return 'ERROR'
}

function isMissing(error: unknown): boolean { return error instanceof ApiProblemError && error.status === 404 }

export class OverviewResultsSyncService {
  private readonly repository: OverviewRepository
  private readonly userId: string
  private readonly serverDeviceId: string
  private readonly api: OverviewResultsApi

  constructor(repository: OverviewRepository, userId: string, serverDeviceId: string, api: OverviewResultsApi = lazyOverviewResultsApi) {
    this.repository = repository
    this.userId = userId
    this.serverDeviceId = serverDeviceId
    this.api = api
  }

  reconcile(options: OverviewSyncOptions): Promise<void> {
    const key = `${this.userId}:${this.serverDeviceId}`
    const previous = inFlightByScope.get(key)
    if (previous) return previous
    const task = this.reconcileInternal(options)
    inFlightByScope.set(key, task)
    const clear = (): void => { if (inFlightByScope.get(key) === task) inFlightByScope.delete(key) }
    void task.then(clear, clear)
    return task
  }

  async resolveConflict(
    scopeType: 'FILE' | 'SUBJECT',
    scopeId: string,
    revisionKey: string,
    choice: 'LOCAL' | 'REMOTE',
    options: OverviewSyncOptions,
  ): Promise<void> {
    if (!options.isCurrent()) throw new Error('OVERVIEW_SCOPE_CHANGED')
    const fenceToken = this.repository.captureScopeFenceToken(scopeType,scopeId)
    if (!this.repository.isScopeFenceTokenCurrent(fenceToken)) throw new Error('OVERVIEW_SCOPE_CHANGED')
    const conflicts = (await this.repository.listOverviewOutbox()).filter(item => item.scopeType === scopeType
      && item.scopeId === scopeId && item.revisionKey === revisionKey && item.state === 'CONFLICT' && !isOverviewGenerationEditConflict(item))
    if (!conflicts.length) return
    if (scopeType === 'FILE') {
      const source = options.sources.find(item => item.id === scopeId && item.type === 'FILE'
        && item.ingestionStatus === 'READY' && item.ingestionRevision === revisionKey && !item.deletedAt)
      if (!source) throw new Error('OVERVIEW_SOURCE_STALE')
      if (!await this.isSourceCurrent(source, options)) throw new Error('OVERVIEW_SOURCE_STALE')
      if (!this.repository.isScopeFenceTokenCurrent(fenceToken)) throw new Error('OVERVIEW_SCOPE_CHANGED')
      const remote = await this.api.getFile(scopeId, revisionKey)
      if (!this.repository.isScopeFenceTokenCurrent(fenceToken) || !await this.isSourceCurrent(source, options)) throw new Error('OVERVIEW_SCOPE_CHANGED')
      if (choice === 'REMOTE') {
        if (!remote || !matchesFileView(remote, source)) throw new Error('OVERVIEW_REMOTE_MISSING')
        if (!await this.repository.useRemoteOverview(await remoteCacheRecord(remote,'FILE',scopeId,revisionKey), stateFromView(remote,'FILE',scopeId,revisionKey),fenceToken)) {
          throw new Error('OVERVIEW_SCOPE_CHANGED')
        }
        return
      }
      if (remote && !matchesFileView(remote,source)) throw new Error('OVERVIEW_REMOTE_STALE')
      if (remote && matchesFileView(remote, source)) {
        if (!await this.repository.installRemoteOverview(await remoteCacheRecord(remote,'FILE',scopeId,revisionKey),stateFromView(remote,'FILE',scopeId,revisionKey),false,fenceToken)) {
          throw new Error('OVERVIEW_SCOPE_CHANGED')
        }
      } else {
        if (!await this.repository.clearOverviewSyncState('FILE',scopeId,revisionKey,fenceToken)) throw new Error('OVERVIEW_SCOPE_CHANGED')
      }
    } else {
      if (!await this.isSubjectCurrent(scopeId, options)) throw new Error('OVERVIEW_SUBJECT_STALE')
      const currentSources = options.sources.filter(source => source.subjectId === scopeId && source.type === 'FILE'
        && source.ingestionStatus === 'READY' && !source.deletedAt)
      if (!await this.subjectInputsCurrent(scopeId, currentSources, options)) throw new Error('OVERVIEW_INPUT_CHANGED')
      if (!this.repository.isScopeFenceTokenCurrent(fenceToken)) throw new Error('OVERVIEW_SCOPE_CHANGED')
      const remote = await this.api.getSubject(scopeId)
      if (!this.repository.isScopeFenceTokenCurrent(fenceToken) || !await this.isSubjectCurrent(scopeId, options)) throw new Error('OVERVIEW_SCOPE_CHANGED')
      if (!await this.subjectInputsCurrent(scopeId, currentSources, options)) throw new Error('OVERVIEW_INPUT_CHANGED')
      if (choice === 'REMOTE') {
        if (!remote || !matchesSubjectView(remote,scopeId)) throw new Error('OVERVIEW_REMOTE_MISSING')
        const fingerprint = await this.subjectContentFingerprint(currentSources)
        if (!await this.repository.useRemoteOverview(await remoteCacheRecord(remote,'SUBJECT',scopeId,'subject-v1',fingerprint),
          stateFromView(remote,'SUBJECT',scopeId,'subject-v1'),fenceToken)) throw new Error('OVERVIEW_SCOPE_CHANGED')
        return
      }
      if (remote && !matchesSubjectView(remote,scopeId)) throw new Error('OVERVIEW_REMOTE_STALE')
      const fingerprint = await this.subjectContentFingerprint(currentSources)
      if (!fingerprint || conflicts.some(intent => !intent.inputFingerprint || intent.inputFingerprint !== fingerprint)) {
        throw new Error('OVERVIEW_INPUT_CHANGED')
      }
      if (remote && matchesSubjectView(remote,scopeId)) {
        if (!await this.repository.installRemoteOverview(await remoteCacheRecord(remote,'SUBJECT',scopeId,'subject-v1',fingerprint),
          stateFromView(remote,'SUBJECT',scopeId,'subject-v1'),false,fenceToken)) throw new Error('OVERVIEW_SCOPE_CHANGED')
      } else {
        if (!await this.repository.clearOverviewSyncState('SUBJECT',scopeId,'subject-v1',fenceToken)) throw new Error('OVERVIEW_SCOPE_CHANGED')
      }
    }
    if (!await this.repository.retryOverviewConflictLocally(scopeType,scopeId,revisionKey)) throw new Error('OVERVIEW_SCOPE_CHANGED')
    await this.reconcile(options)
  }

  private async reconcileInternal(options: OverviewSyncOptions): Promise<void> {
    if (!options.isCurrent()) return
    const sources = options.sources.filter(source => source.type === 'FILE' && source.ingestionStatus === 'READY'
      && !source.deletedAt && source.ingestionRevision).slice(0, MAX_SYNC_SOURCES)
    const readyById = new Map(sources.map(source => [source.id, source]))
    const outbox = await this.repository.listOverviewOutbox()
    for (const intent of outbox) {
      if (intent.state === 'STALE') continue
      if (intent.scopeType === 'FILE') {
        const current = readyById.get(intent.scopeId)
        if (!current || current.ingestionRevision !== intent.revisionKey) {
          await this.repository.setOverviewIntentState(intent.clientWriteId, 'STALE', 'OVERVIEW_SOURCE_STALE')
        }
      } else if (!options.subjectIds.includes(intent.scopeId)) {
        await this.repository.setOverviewIntentState(intent.clientWriteId, 'STALE', 'OVERVIEW_SUBJECT_STALE')
      }
    }

    // File versions must settle before a Subject manifest can be formed.
    await mapBounded(sources,4,async source => {
      if (options.isCurrent()) await this.syncFile(source,options)
    })
    const generationConflicts = (await this.repository.listOverviewOutbox()).filter(item => item.scopeType === 'SUBJECT'
      && item.state === 'CONFLICT' && isOverviewGenerationEditConflict(item))
    for (const intent of generationConflicts) {
      if (!options.subjectIds.includes(intent.scopeId)) continue
      const files: FileOverviewRecord[] = []
      for (const source of sources.filter(item => item.type === 'FILE' && item.subjectId === intent.scopeId && item.ingestionStatus === 'READY' && !item.deletedAt)) {
        if (!source.ingestionRevision) continue
        const record = await this.repository.getFileOverview(source.id,source.ingestionRevision)
        if (record && (Array.isArray(record.outline) && record.outline.some(chapter => chapter.sections.length > 0)
          || Boolean(record.summary?.overview.trim()))) files.push(record)
      }
      const fingerprint = files.length ? await computeSubjectInputFingerprint(files) : null
      if (!fingerprint || !intent.inputFingerprint || fingerprint !== intent.inputFingerprint) {
        await this.repository.setOverviewIntentState(intent.clientWriteId,'STALE','OVERVIEW_GENERATION_INPUT_STALE')
      }
    }
    const subjectIds = [...new Set([...options.subjectIds, ...outbox.filter(item => item.scopeType === 'SUBJECT' && item.state !== 'STALE'
      && !isOverviewGenerationEditConflict(item)).map(item => item.scopeId)])]
      .filter(id => options.subjectIds.includes(id)).slice(0, MAX_SYNC_SOURCES)

    const statusMap = new Map<string, OverviewSubjectStatusItem>()
    if (subjectIds.length > 0) {
      const BATCH_SIZE = 100
      for (let i = 0; i < subjectIds.length; i += BATCH_SIZE) {
        if (!options.isCurrent()) return
        const batchIds = subjectIds.slice(i, i + BATCH_SIZE)
        const response = await this.api.getSubjectStatuses(batchIds)
        if (!options.isCurrent()) return
        for (const item of response.items) {
          statusMap.set(item.subjectId, item)
        }
      }
    }

    await mapBounded(subjectIds, 2, async subjectId => {
      if (options.isCurrent()) {
        await this.syncSubject(
          subjectId,
          sources.filter(source => source.subjectId === subjectId),
          options,
          statusMap.get(subjectId),
        )
      }
    })
  }

  private async syncFile(source: OverviewSyncSource, options: OverviewSyncOptions): Promise<void> {
    const revision = source.ingestionRevision
    if (!revision) return
    const fenceToken = this.repository.captureScopeFenceToken('FILE',source.id)
    if (!this.repository.isScopeFenceTokenCurrent(fenceToken)) return
    await this.repository.markFileRevisionStale(source.id, revision)
    let intents = (await this.repository.listOverviewOutbox()).filter(item => item.scopeType === 'FILE'
      && item.scopeId === source.id && item.revisionKey === revision && item.state !== 'STALE' && !isOverviewGenerationEditConflict(item))
    const stored = await this.repository.getFileOverview(source.id, revision)
    let state = await this.repository.getOverviewSyncState('FILE', source.id, revision)

    if (!intents.length) {
      if (!this.repository.isScopeFenceTokenCurrent(fenceToken) || !await this.isSourceCurrent(source, options)) return
      let remote: OverviewResultView | null
      try { remote = await this.api.getFile(source.id, revision) }
      catch (error) { if (isMissing(error)) remote = null; else return }
      if (!await this.isSourceCurrent(source, options)) return
      if (remote && matchesFileView(remote, source)) {
        const record = await remoteCacheRecord(remote, 'FILE', source.id, revision)
        await this.repository.installRemoteOverview(record, stateFromView(remote, 'FILE', source.id, revision),false,fenceToken)
        return
      }
      if (remote) return
      if (validCompleteRecord(stored)) await this.repository.enqueueLegacySeed(stored)
      intents = (await this.repository.listOverviewOutbox()).filter(item => item.scopeType === 'FILE'
        && item.scopeId === source.id && item.revisionKey === revision && item.state !== 'STALE' && !isOverviewGenerationEditConflict(item))
      if (!intents.length) return
      state = await this.repository.getOverviewSyncState('FILE', source.id, revision)
    } else if (!state && intents[0]?.requestBody === null) {
      if (!this.repository.isScopeFenceTokenCurrent(fenceToken) || !await this.isSourceCurrent(source, options)) return
      let remote: OverviewResultView | null
      try { remote = await this.api.getFile(source.id, revision) }
      catch (error) { if (isMissing(error)) remote = null; else return }
      if (!await this.isSourceCurrent(source, options)) return
      if (remote && matchesFileView(remote, source)) {
        const record = await remoteCacheRecord(remote, 'FILE', source.id, revision)
        for (const intent of intents) {
          if (intent.origin === 'LEGACY_SEED') await this.repository.setOverviewIntentState(intent.clientWriteId, 'STALE', 'OVERVIEW_SEED_ALREADY_EXISTS')
          else if (intent.state === 'PREPARED') await this.repository.setOverviewIntentState(intent.clientWriteId, 'CONFLICT', 'OVERVIEW_BASELINE_UNKNOWN')
        }
        await this.repository.installRemoteOverview(record, stateFromView(remote, 'FILE', source.id, revision), true,fenceToken)
        return
      }
      if (remote) return
      state = null
    }
    await this.flushFileIntents(source, state, options, fenceToken)
  }

  private async isSourceCurrent(source: OverviewSyncSource, options: OverviewSyncOptions): Promise<boolean> {
    const current = options.sources.find(item => item.id === source.id)
    if (!options.isCurrent() || !current || current.type !== 'FILE' || current.ingestionStatus !== 'READY'
      || current.ingestionRevision !== source.ingestionRevision || current.deletedAt) return false
    return options.isSourceCurrent ? Boolean(await options.isSourceCurrent(source)) : true
  }

  private async isSubjectCurrent(subjectId: string, options: OverviewSyncOptions): Promise<boolean> {
    if (!options.isCurrent() || !options.subjectIds.includes(subjectId)) return false
    return options.isSubjectCurrent ? Boolean(await options.isSubjectCurrent(subjectId)) : true
  }

  private async subjectInputsCurrent(subjectId: string, expectedSources: OverviewSyncSource[], options: OverviewSyncOptions): Promise<boolean> {
    if (!(await this.isSubjectCurrent(subjectId, options))) return false
    if (!options.getCurrentSources) return true
    const currentSources = (await options.getCurrentSources()).filter(source => source.type === 'FILE'
      && source.subjectId === subjectId && source.ingestionStatus === 'READY' && !source.deletedAt && source.ingestionRevision)
    const expected = expectedSources.map(source => `${source.id.toLowerCase()}\t${source.ingestionRevision?.toLowerCase() ?? ''}`).sort()
    const current = currentSources.map(source => `${source.id.toLowerCase()}\t${source.ingestionRevision?.toLowerCase() ?? ''}`).sort()
    return expected.length === current.length && expected.every((value, index) => value === current[index])
  }

  private async flushFileIntents(source: OverviewSyncSource, initialState: OverviewSyncState | null, options: OverviewSyncOptions,
    fenceToken: OverviewScopeFenceToken): Promise<void> {
    const revision = source.ingestionRevision
    if (!revision) return
    let state = initialState
    let intents = (await this.repository.listOverviewOutbox()).filter(item => item.scopeType === 'FILE'
      && item.scopeId === source.id && item.revisionKey === revision && item.state !== 'STALE' && !isOverviewGenerationEditConflict(item))
    for (const intent of intents) {
      if (!await this.isSourceCurrent(source, options)) return
      if (intent.state === 'CONFLICT' || intent.state === 'ERROR') return
      let requestBody = intent.requestBody
      if (!requestBody) {
        const result = { schemaVersion: 1 as const, title: intent.result.title, outline: intent.result.outline, summary: intent.result.summary }
        if (!result.outline?.length || !result.summary?.overview.trim()) return
        const mode: OverviewMode = !state ? 'ALL' : intent.mode
        if (intent.origin === 'LEGACY_SEED' && !intent.outlineIdentityInput) {
          await this.repository.setOverviewIntentState(intent.clientWriteId, 'ERROR', 'OVERVIEW_IDENTITY_INITIALIZATION_REQUIRED')
          return
        }
        const identity = mode === 'SUMMARY' ? undefined : intent.outlineIdentityInput ?? createOutlineIdentityInput(result.outline)
        if (identity && !hasCompleteOutlineIdentityInput(result.outline, identity)) {
          await this.repository.setOverviewIntentState(intent.clientWriteId, 'ERROR', 'OVERVIEW_IDENTITY_INVALID')
          return
        }
        requestBody = {
          baseVersion: state?.version ?? 0,
          clientWriteId: intent.clientWriteId,
          mode,
          ingestionRevision: revision,
          outlineGeneratedAt: intent.outlineGeneratedAt,
          summaryGeneratedAt: intent.summaryGeneratedAt,
          ...(identity ? { outlineIdentity: identity } : {}),
          ...(mode === 'SUMMARY' || !intent.outlineProvenanceInput ? {} : { outlineProvenance: intent.outlineProvenanceInput }),
          result,
        }
        const materialized = await this.repository.materializeOverviewIntent(intent.clientWriteId, requestBody)
        if (!materialized?.requestBody) continue
        requestBody = materialized.requestBody
      }
      await this.repository.setOverviewIntentState(intent.clientWriteId, 'INFLIGHT')
      if (!this.repository.isScopeFenceTokenCurrent(fenceToken) || !await this.isSourceCurrent(source, options)) {
        await this.repository.setOverviewIntentState(intent.clientWriteId, 'STALE', 'OVERVIEW_SOURCE_STALE')
        return
      }
      let response: OverviewResultView
      try {
        response = await this.api.putFile(source.id, requestBody)
      } catch (error) {
        const status = errorStatus(error)
        await this.repository.setOverviewIntentState(intent.clientWriteId, status, status === 'CONFLICT' ? 'OVERVIEW_VERSION_CONFLICT'
          : status === 'STALE' ? 'OVERVIEW_SOURCE_STALE' : status === 'PENDING' ? 'OVERVIEW_TRANSPORT_RETRY' : 'OVERVIEW_SYNC_FAILED')
        if (status === 'CONFLICT' && this.repository.isScopeFenceTokenCurrent(fenceToken) && await this.isSourceCurrent(source, options)) {
          const remote = await this.api.getFile(source.id, revision).catch(() => null)
          if (remote && await this.isSourceCurrent(source, options) && matchesFileView(remote, source)) {
            await this.repository.installRemoteOverview(await remoteCacheRecord(remote,'FILE',source.id,revision), stateFromView(remote,'FILE',source.id,revision),false,fenceToken)
          }
        }
        return
      }
      if (!await this.isSourceCurrent(source, options) || !matchesFileView(response, source)) {
        await this.repository.setOverviewIntentState(intent.clientWriteId, 'STALE', 'OVERVIEW_RESPONSE_STALE')
        return
      }
      state = stateFromView(response, 'FILE', source.id, revision)
      try {
        const record = await remoteCacheRecord(response, 'FILE', source.id, revision)
        if (!(await this.repository.completeOverviewIntent(intent.clientWriteId, record, state,fenceToken))) return
      } catch (error) {
        console.warn('[OverviewSync] File result accepted by server; local ACK will be replayed', error)
        await this.repository.setOverviewIntentState(intent.clientWriteId, 'PENDING', 'OVERVIEW_LOCAL_ACK_RETRY')
        return
      }
      state = await this.repository.getOverviewSyncState('FILE', source.id, revision)
      intents = (await this.repository.listOverviewOutbox()).filter(item => item.scopeType === 'FILE'
        && item.scopeId === source.id && item.revisionKey === revision && item.state !== 'STALE' && !isOverviewGenerationEditConflict(item))
    }
  }

  private async syncSubject(
    subjectId: string,
    subjectSources: OverviewSyncSource[],
    options: OverviewSyncOptions,
    status?: OverviewSubjectStatusItem,
  ): Promise<void> {
    if (subjectSources.length > 100) return
    const fenceToken = this.repository.captureScopeFenceToken('SUBJECT', subjectId)
    if (!this.repository.isScopeFenceTokenCurrent(fenceToken)) return
    let intents = (await this.repository.listOverviewOutbox()).filter(item => item.scopeType === 'SUBJECT'
      && item.scopeId === subjectId && item.revisionKey === 'subject-v1' && item.state !== 'STALE' && !isOverviewGenerationEditConflict(item))
    let state = await this.repository.getOverviewSyncState('SUBJECT', subjectId, 'subject-v1')
    const local = await this.repository.getSubjectOverview(subjectId)
    if (!intents.length) {
      if (!this.repository.isScopeFenceTokenCurrent(fenceToken) || !await this.isSubjectCurrent(subjectId, options)) return

      if (status?.status === 'MISSING') {
        if (validCompleteRecord(local)) await this.repository.enqueueLegacySeed(local)
        intents = (await this.repository.listOverviewOutbox()).filter(item => item.scopeType === 'SUBJECT'
          && item.scopeId === subjectId && item.revisionKey === 'subject-v1' && item.state !== 'STALE' && !isOverviewGenerationEditConflict(item))
        if (!intents.length) return
        state = await this.repository.getOverviewSyncState('SUBJECT', subjectId, 'subject-v1')
        await this.flushSubjectIntents(subjectId, subjectSources, state, options, fenceToken)
        return
      }

      if (status?.status === 'UNAVAILABLE') {
        return
      }

      if (status?.status === 'AVAILABLE') {
        const isUpToDate = Boolean(
          state
          && validCompleteRecord(local)
          && state.version === status.version
          && state.outlineVersion === status.outlineVersion
          && state.summaryVersion === status.summaryVersion
          && state.updatedAt === status.updatedAt
        )
        if (isUpToDate) {
          return
        }
      }

      let remote: OverviewResultView | null
      try { remote = await this.api.getSubject(subjectId) }
      catch (error) { if (isMissing(error)) remote = null; else return }
      if (!await this.isSubjectCurrent(subjectId, options) || !await this.subjectInputsCurrent(subjectId, subjectSources, options)) return
      if (remote && matchesSubjectView(remote, subjectId)) {
        const fingerprint = await this.subjectContentFingerprint(subjectSources)
        const record = await remoteCacheRecord(remote, 'SUBJECT', subjectId, 'subject-v1', fingerprint)
        await this.repository.installRemoteOverview(record, stateFromView(remote, 'SUBJECT', subjectId, 'subject-v1'), false, fenceToken)
        return
      }
      if (remote) return
      if (validCompleteRecord(local)) await this.repository.enqueueLegacySeed(local)
      intents = (await this.repository.listOverviewOutbox()).filter(item => item.scopeType === 'SUBJECT'
        && item.scopeId === subjectId && item.revisionKey === 'subject-v1' && item.state !== 'STALE' && !isOverviewGenerationEditConflict(item))
      if (!intents.length) return
      state = await this.repository.getOverviewSyncState('SUBJECT', subjectId, 'subject-v1')
    } else if (!state && intents[0]?.requestBody === null) {
      if (!this.repository.isScopeFenceTokenCurrent(fenceToken) || !await this.isSubjectCurrent(subjectId, options)) return
      let remote: OverviewResultView | null
      try { remote = await this.api.getSubject(subjectId) }
      catch (error) { if (isMissing(error)) remote = null; else return }
      if (!await this.isSubjectCurrent(subjectId, options) || !await this.subjectInputsCurrent(subjectId, subjectSources, options)) return
      if (remote && matchesSubjectView(remote, subjectId)) {
        const fingerprint = await this.subjectContentFingerprint(subjectSources)
        const record = await remoteCacheRecord(remote, 'SUBJECT', subjectId, 'subject-v1', fingerprint)
        for (const intent of intents) {
          if (intent.origin === 'LEGACY_SEED') await this.repository.setOverviewIntentState(intent.clientWriteId, 'STALE', 'OVERVIEW_SEED_ALREADY_EXISTS')
          else if (intent.state === 'PREPARED') await this.repository.setOverviewIntentState(intent.clientWriteId, 'CONFLICT', 'OVERVIEW_BASELINE_UNKNOWN')
        }
        await this.repository.installRemoteOverview(record, stateFromView(remote, 'SUBJECT', subjectId, 'subject-v1'), true,fenceToken)
        return
      }
      if (remote) return
      state = null
    }
    await this.flushSubjectIntents(subjectId, subjectSources, state, options, fenceToken)
  }

  private async subjectContentFingerprint(sources: OverviewSyncSource[]): Promise<string | null> {
    const files: FileOverviewRecord[] = []
    for (const source of sources) {
      if (!source.ingestionRevision) continue
      const record = await this.repository.getFileOverview(source.id, source.ingestionRevision)
      if (record && record.status === 'READY') files.push(record)
    }
    if (files.length !== sources.length || files.length === 0) return null
    return computeSubjectInputFingerprint(files)
  }

  private async flushSubjectIntents(subjectId: string, sources: OverviewSyncSource[], initialState: OverviewSyncState | null,
    options: OverviewSyncOptions, fenceToken: OverviewScopeFenceToken): Promise<void> {
    let state = initialState
    let intents = (await this.repository.listOverviewOutbox()).filter(item => item.scopeType === 'SUBJECT'
      && item.scopeId === subjectId && item.revisionKey === 'subject-v1' && item.state !== 'STALE' && !isOverviewGenerationEditConflict(item))
    for (const intent of intents) {
      if (!await this.isSubjectCurrent(subjectId, options) || !await this.subjectInputsCurrent(subjectId, sources, options)) return
      if (intent.state === 'CONFLICT' || intent.state === 'ERROR') return
      let requestBody = intent.requestBody
      if (!requestBody) {
        const result = { schemaVersion: 1 as const, title: intent.result.title, outline: intent.result.outline, summary: intent.result.summary }
        if (!result.outline?.length || !result.summary?.overview.trim()) return
        const currentContentFingerprint = await this.subjectContentFingerprint(sources)
        if (!currentContentFingerprint || !intent.inputFingerprint || intent.inputFingerprint !== currentContentFingerprint) {
          await this.repository.setOverviewIntentState(intent.clientWriteId, 'CONFLICT', 'OVERVIEW_INPUT_CHANGED')
          return
        }
        const allEntries: OverviewSourceManifestEntry[] = []
        for (const source of sources) {
          if (!source.ingestionRevision) return
          const fileState = await this.repository.getOverviewSyncState('FILE', source.id, source.ingestionRevision)
          allEntries.push({ sourceId: source.id.toLowerCase(), ingestionRevision: source.ingestionRevision.toLowerCase(),
            outlineVersion: fileState?.outlineVersion ?? null, summaryVersion: fileState?.summaryVersion ?? null })
        }
        allEntries.sort((a,b) => a.sourceId < b.sourceId ? -1 : a.sourceId > b.sourceId ? 1 : 0)
        const mode: OverviewMode = !state ? 'ALL' : intent.mode
        if (!modeInputsAvailable(allEntries, mode)) return
        const sourceManifest = projectManifest(allEntries,mode)
        const inputFingerprint = await computeOverviewManifestFingerprint(sourceManifest)
        if (intent.origin === 'LEGACY_SEED' && !intent.outlineIdentityInput) {
          await this.repository.setOverviewIntentState(intent.clientWriteId, 'ERROR', 'OVERVIEW_IDENTITY_INITIALIZATION_REQUIRED')
          return
        }
        const identity = mode === 'SUMMARY' ? undefined : intent.outlineIdentityInput ?? createOutlineIdentityInput(result.outline)
        if (identity && !hasCompleteOutlineIdentityInput(result.outline, identity)) {
          await this.repository.setOverviewIntentState(intent.clientWriteId, 'ERROR', 'OVERVIEW_IDENTITY_INVALID')
          return
        }
        requestBody = {
          baseVersion: state?.version ?? 0,
          clientWriteId: intent.clientWriteId,
          mode,
          sourceManifest,
          inputFingerprint,
          outlineGeneratedAt: intent.outlineGeneratedAt,
          summaryGeneratedAt: intent.summaryGeneratedAt,
          ...(identity ? { outlineIdentity: identity } : {}),
          ...(mode === 'SUMMARY' || !intent.outlineProvenanceInput ? {} : { outlineProvenance: intent.outlineProvenanceInput }),
          result,
        }
        const materialized = await this.repository.materializeOverviewIntent(intent.clientWriteId, requestBody)
        if (!materialized?.requestBody) continue
        requestBody = materialized.requestBody
      }
      await this.repository.setOverviewIntentState(intent.clientWriteId, 'INFLIGHT')
      if (!this.repository.isScopeFenceTokenCurrent(fenceToken) || !await this.isSubjectCurrent(subjectId, options) || !await this.subjectInputsCurrent(subjectId, sources, options)) {
        await this.repository.setOverviewIntentState(intent.clientWriteId, 'STALE', 'OVERVIEW_INPUT_CHANGED')
        return
      }
      let response: OverviewResultView
      try {
        response = await this.api.putSubject(subjectId, requestBody)
      } catch (error) {
        const status = errorStatus(error)
        await this.repository.setOverviewIntentState(intent.clientWriteId, status, status === 'CONFLICT' ? 'OVERVIEW_VERSION_CONFLICT'
          : status === 'PENDING' ? 'OVERVIEW_TRANSPORT_RETRY' : 'OVERVIEW_SYNC_FAILED')
        if (status === 'CONFLICT' && this.repository.isScopeFenceTokenCurrent(fenceToken) && await this.isSubjectCurrent(subjectId, options)
          && await this.subjectInputsCurrent(subjectId, sources, options)) {
          const remote = await this.api.getSubject(subjectId).catch(() => null)
          if (remote && await this.isSubjectCurrent(subjectId, options) && await this.subjectInputsCurrent(subjectId, sources, options)
            && matchesSubjectView(remote, subjectId)) {
            const record = await remoteCacheRecord(remote,'SUBJECT',subjectId,'subject-v1',await this.subjectContentFingerprint(sources))
            await this.repository.installRemoteOverview(record,stateFromView(remote,'SUBJECT',subjectId,'subject-v1'),false,fenceToken)
          }
        }
        return
      }
      if (!await this.isSubjectCurrent(subjectId, options) || !await this.subjectInputsCurrent(subjectId, sources, options)
        || !matchesSubjectView(response, subjectId)) {
        await this.repository.setOverviewIntentState(intent.clientWriteId, 'STALE', 'OVERVIEW_RESPONSE_STALE')
        return
      }
      state = stateFromView(response, 'SUBJECT', subjectId, 'subject-v1')
      try {
        const record = await remoteCacheRecord(response, 'SUBJECT', subjectId, 'subject-v1', await this.subjectContentFingerprint(sources))
        if (!(await this.repository.completeOverviewIntent(intent.clientWriteId, record, state,fenceToken))) return
      } catch (error) {
        console.warn('[OverviewSync] Subject result accepted by server; local ACK will be replayed', error)
        await this.repository.setOverviewIntentState(intent.clientWriteId, 'PENDING', 'OVERVIEW_LOCAL_ACK_RETRY')
        return
      }
      state = await this.repository.getOverviewSyncState('SUBJECT', subjectId, 'subject-v1')
      intents = (await this.repository.listOverviewOutbox()).filter(item => item.scopeType === 'SUBJECT'
        && item.scopeId === subjectId && item.revisionKey === 'subject-v1' && item.state !== 'STALE' && !isOverviewGenerationEditConflict(item))
    }
  }
}

export async function reconcileOverviewResults(repository: OverviewRepository, options: OverviewSyncOptions): Promise<void> {
  await new OverviewResultsSyncService(repository, repository.userId, repository.serverDeviceId).reconcile(options)
}
