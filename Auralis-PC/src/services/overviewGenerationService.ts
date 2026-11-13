import { computeSubjectInputFingerprint, isOverviewSaveNotCurrent } from './overviewRepository.ts'
import { classifyOverviewFailure } from './overviewFailurePolicy.ts'
import type {
  FileOverviewRecord,
  OverviewApi,
  OverviewMode,
  OverviewResponse,
  FileOverviewTrigger,
  SubjectOverviewSourceInput,
  SourceOverviewRequest,
  SubjectOverviewRequest,
  OverviewRegenerationResult,
  OverviewSkipCode,
  OverviewFailureCode,
  OverviewOperationHandle,
} from '@/types/overview'

interface FileSource {
  id?: string
  type?: string
  ingestionStatus?: string
  ingestionRevision?: string
}

interface SourceApi { get(sourceId: string): Promise<FileSource | null> }
interface OverviewRepositoryLike {
  captureScopeFenceToken(scopeType: 'FILE' | 'SUBJECT', scopeId: string): { userId: string; serverDeviceId: string; scopeType: 'FILE' | 'SUBJECT'; scopeId: string; generation: number }
  isScopeFenceTokenCurrent(token: { userId: string; serverDeviceId: string; scopeType: 'FILE' | 'SUBJECT'; scopeId: string; generation: number }): boolean
  getFileOverview(sourceId: string, ingestionRevision: string): Promise<FileOverviewRecord | null>
  captureGenerationBaseline?(scopeType: 'FILE' | 'SUBJECT', scopeId: string, revisionKey: string, mode: OverviewMode): Promise<string>
  saveFileOverviewPart(input: { sourceId: string; ingestionRevision: string; mode: OverviewMode; response: OverviewResponse; generationBaseline?: string; isStillCurrent?: () => boolean }): Promise<unknown>
  markFileOverviewFailed(sourceId: string, ingestionRevision: string, mode: OverviewMode, errorCode: string, errorDetail: string): Promise<void>
  saveSubjectOverviewPart(input: { subjectId: string; mode: OverviewMode; response: OverviewResponse; inputFingerprint: string; generationBaseline?: string; isStillCurrent?: () => boolean }): Promise<unknown>
  markSubjectOverviewFailed(subjectId: string, mode: OverviewMode, errorCode: string, errorDetail: string): Promise<void>
  removeSubjectOverview(subjectId: string): Promise<void>
  removeFileOverviews(sourceId: string): Promise<void>
}

interface ReadyFile { sourceId: string; ingestionRevision: string }
interface Options {
  api: OverviewApi
  repository: OverviewRepositoryLike
  sourceApi?: SourceApi
  listReadyFiles?: () => Promise<ReadyFile[]>
  listLocalFileOverviews?: (subjectId: string) => Promise<FileOverviewRecord[]>
  requestIdFactory?: () => string
  isFileGenerationEligible?: (sourceId: string, ingestionRevision: string) => Promise<boolean>
  isFileScopeRestorable?: (sourceId: string) => Promise<boolean>
  getLocalFileGenerationRevision?: (sourceId: string) => Promise<string | null>
}

interface InFlightFile {
  promise: Promise<OverviewRegenerationResult>
  requestId: string
  sourceId: string
  ingestionRevision: string
  controller: AbortController
  automaticOwner: boolean
  manualConsumers: Set<string>
}

interface ManualFileConsumer {
  id: string
  stopped: boolean
  serviceGeneration: number
  entry?: InFlightFile
}

interface SubjectGenerationContext {
  generation: number
  sources: ReadyFile[]
}

const DIAGNOSTIC_PREFIX = '[FILE_OVERVIEW_TRIGGER]'
const DIAGNOSTIC_FIELDS = new Set(['event', 'trigger', 'requestId', 'sourceId', 'revision', 'mode', 'outcome', 'errorCode', 'durationMs'])

function defaultRequestId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `overview-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function monotonicNow(): number {
  const value = globalThis.performance?.now?.()
  return typeof value === 'number' && Number.isFinite(value) ? value : Date.now()
}

function elapsedSince(start: number): number {
  const value = monotonicNow() - start
  return Number.isFinite(value) && value >= 0 ? value : 0
}

function skippedResult(code: OverviewSkipCode): OverviewRegenerationResult {
  return { status: 'SKIPPED', code }
}

function raceWithAbort<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason || new DOMException('Operation aborted', 'AbortError'))
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      signal.removeEventListener('abort', onAbort)
      reject(signal.reason || new DOMException('Operation aborted', 'AbortError'))
    }
    signal.addEventListener('abort', onAbort, { once: true })
    Promise.resolve(operation).then(
      (value) => { signal.removeEventListener('abort', onAbort); resolve(value) },
      (error) => { signal.removeEventListener('abort', onAbort); reject(error) },
    )
  })
}

function stoppable<T extends OverviewRegenerationResult>(
  promise: Promise<T>,
  consumerId: string,
  stopWork: () => void,
): OverviewOperationHandle<T> {
  let stopConsumer: ((result: T) => void) | null = null
  let stopped = false
  const stoppedResult = new Promise<T>((resolve) => { stopConsumer = resolve })
  const handle = Promise.race([promise, stoppedResult]) as unknown as OverviewOperationHandle<T>
  Object.defineProperties(handle, {
    consumerId: { value: consumerId, enumerable: true },
    stop: {
      value: () => {
        if (stopped) return
        stopped = true
        stopWork()
        stopConsumer?.(skippedResult('ABORTED') as T)
      },
    },
  })
  return handle
}

function failedResult(error: unknown): Extract<OverviewRegenerationResult, { status: 'FAILED' }> {
  const safe = classifyOverviewFailure(error)
  return {
    status: 'FAILED',
    code: safe.code as OverviewFailureCode,
    detail: safe.detail,
    ...(safe.status !== undefined ? { httpStatus: safe.status } : {}),
    ...(safe.retryAfterSeconds !== undefined ? { retryAfterSeconds: safe.retryAfterSeconds } : {}),
    ...(safe.resetAt !== undefined ? { resetAt: safe.resetAt } : {}),
  }
}

function withInstruction<T extends object>(request: T, instruction?: string): T & { instruction?: string } {
  const value = instruction?.trim()
  return value ? { ...request, instruction: value } : request
}

function isComplete(record: FileOverviewRecord | null): boolean {
  return Boolean(
    record?.status === 'READY'
    && record.schemaVersion === 2
    && typeof record.outlineMarkdown === 'string' && record.outlineMarkdown.trim().length > 0
    && typeof record.summaryMarkdown === 'string' && record.summaryMarkdown.trim().length > 0
  )
}

export function hasUsableOutline(outlineMarkdown: string | null | undefined): boolean {
  return typeof outlineMarkdown === 'string' && outlineMarkdown.trim().length > 0
}

export function hasUsableSummary(summaryMarkdown: string | null | undefined): boolean {
  return typeof summaryMarkdown === 'string' && summaryMarkdown.trim().length > 0
}

export function hasUsableOverview(file: FileOverviewRecord): boolean {
  return hasUsableOutline(file.outlineMarkdown) || hasUsableSummary(file.summaryMarkdown)
}

export function supportsMode(file: FileOverviewRecord, mode: OverviewMode): boolean {
  if (mode === 'ALL') return hasUsableOutline(file.outlineMarkdown) && hasUsableSummary(file.summaryMarkdown)
  return mode === 'OUTLINE' ? hasUsableOutline(file.outlineMarkdown) : hasUsableSummary(file.summaryMarkdown)
}

export class OverviewGenerationService {
  private readonly api: OverviewApi
  private readonly repository: OverviewRepositoryLike
  private readonly sourceApi?: SourceApi
  private readonly listReadyFiles?: Options['listReadyFiles']
  private readonly listLocalFileOverviews?: Options['listLocalFileOverviews']
  private readonly requestIdFactory: () => string
  private readonly isFileGenerationEligibleCallback?: Options['isFileGenerationEligible']
  private readonly isFileScopeRestorableCallback?: Options['isFileScopeRestorable']
  private readonly getLocalFileGenerationRevision?: Options['getLocalFileGenerationRevision']
  private readonly inFlight = new Map<string, InFlightFile>()
  private readonly currentSourceRevisions = new Map<string, string | null>()
  private cancellationGeneration = 0
  private readonly blockedSourceIds = new Set<string>()
  private readonly subjectGenerations = new Map<string, number>()
  private readonly subjectControllers = new Map<string, AbortController>()
  private readonly subjectContexts = new Map<string, SubjectGenerationContext>()
  private readonly dispatchedRequestIds = new Map<string, string>()

  constructor(options: Options) {
    this.api = options.api
    this.repository = options.repository
    this.sourceApi = options.sourceApi
    this.listReadyFiles = options.listReadyFiles
    this.listLocalFileOverviews = options.listLocalFileOverviews
    this.requestIdFactory = options.requestIdFactory ?? defaultRequestId
    this.isFileGenerationEligibleCallback = options.isFileGenerationEligible
    this.isFileScopeRestorableCallback = options.isFileScopeRestorable
    this.getLocalFileGenerationRevision = options.getLocalFileGenerationRevision
  }

  async generateReadyFileOverview(sourceId: string, ingestionRevision: string, trigger: FileOverviewTrigger): Promise<OverviewRegenerationResult> {
    const serviceGeneration = this.cancellationGeneration
    this.log({ event: 'TRIGGER', trigger, sourceId, revision: ingestionRevision, mode: 'ALL' })
    if (!(await this.isEligible(sourceId, ingestionRevision))) {
      if (serviceGeneration !== this.cancellationGeneration) return skippedResult('ABORTED')
      this.log({ event: 'SKIPPED', trigger, sourceId, revision: ingestionRevision, mode: 'ALL', outcome: 'SOURCE_NOT_ELIGIBLE' })
      return skippedResult('SOURCE_NOT_ELIGIBLE')
    }
    if (!this.sourceApi || !(await this.isCurrentReady(sourceId, ingestionRevision))) {
      if (serviceGeneration !== this.cancellationGeneration) return skippedResult('ABORTED')
      this.log({ event: 'SKIPPED', trigger, sourceId, revision: ingestionRevision, mode: 'ALL', outcome: 'SOURCE_NOT_READY' })
      return skippedResult('SOURCE_NOT_READY')
    }
    const existing = await this.repository.getFileOverview(sourceId, ingestionRevision)
    if (serviceGeneration !== this.cancellationGeneration) return skippedResult('ABORTED')
    if (isComplete(existing)) {
      this.log({ event: 'SKIPPED', trigger, sourceId, revision: ingestionRevision, mode: 'ALL', outcome: 'CACHE_COMPLETE' })
      return skippedResult('CACHE_COMPLETE')
    }
    if (existing?.status === 'FAILED') {
      this.log({ event: 'SKIPPED', trigger, sourceId, revision: ingestionRevision, mode: 'ALL', outcome: 'SKIPPED_FAILED_REQUIRES_MANUAL_RETRY' })
      return skippedResult('SKIPPED_FAILED_REQUIRES_MANUAL_RETRY')
    }
    if (existing?.status === 'READY') {
      this.log({ event: 'SKIPPED', trigger, sourceId, revision: ingestionRevision, mode: 'ALL', outcome: 'PARTIAL_REQUIRES_MANUAL_RETRY' })
      return skippedResult('PARTIAL_REQUIRES_MANUAL_RETRY')
    }
    return this.runFile(sourceId, ingestionRevision, 'ALL', undefined, trigger)
  }

  regenerateFileOverview(sourceId: string, mode: OverviewMode, instruction?: string): OverviewOperationHandle {
    const consumer: ManualFileConsumer = { id: this.requestIdFactory(), stopped: false, serviceGeneration: this.cancellationGeneration }
    const promise = this.startManualFileOverview(sourceId, mode, instruction, consumer)
    return stoppable(promise, consumer.id, () => {
      consumer.stopped = true
      const entry = consumer.entry
      if (!entry) return
      entry.manualConsumers.delete(consumer.id)
      if (!entry.automaticOwner && entry.manualConsumers.size === 0) entry.controller.abort()
    })
  }

  private async startManualFileOverview(sourceId: string, mode: OverviewMode, instruction: string | undefined, consumer: ManualFileConsumer): Promise<OverviewRegenerationResult> {
    const trigger: FileOverviewTrigger = 'MANUAL_RETRY'
    this.log({ event: 'TRIGGER', trigger, sourceId, mode })
    if (this.blockedSourceIds.has(sourceId)) {
      this.log({ event: 'SKIPPED', trigger, sourceId, mode, outcome: 'SOURCE_NOT_ELIGIBLE' })
      return skippedResult('SOURCE_NOT_ELIGIBLE')
    }
    const localRevision = this.getLocalFileGenerationRevision
      ? await this.getLocalFileGenerationRevision(sourceId).catch(() => null)
      : null
    if (consumer.stopped || consumer.serviceGeneration !== this.cancellationGeneration) return skippedResult('ABORTED')
    if (this.blockedSourceIds.has(sourceId) || this.getLocalFileGenerationRevision && !localRevision) {
      this.log({ event: 'SKIPPED', trigger, sourceId, mode, outcome: 'SOURCE_NOT_ELIGIBLE' })
      return skippedResult('SOURCE_NOT_ELIGIBLE')
    }
    let source: FileSource | null = null
    try { source = this.sourceApi ? await this.sourceApi.get(sourceId) : null } catch {
      if (consumer.stopped || consumer.serviceGeneration !== this.cancellationGeneration) return skippedResult('ABORTED')
      this.log({ event: 'SKIPPED', trigger, sourceId, mode, outcome: 'SOURCE_UNAVAILABLE' })
      return skippedResult('SOURCE_UNAVAILABLE')
    }
    if (consumer.stopped || consumer.serviceGeneration !== this.cancellationGeneration) return skippedResult('ABORTED')
    const revision = source?.ingestionRevision
    if (!source || !revision || source.type && source.type !== 'FILE' || source.ingestionStatus && source.ingestionStatus !== 'READY') {
      this.log({ event: 'SKIPPED', trigger, sourceId, revision, mode, outcome: 'SOURCE_NOT_READY' })
      return skippedResult('SOURCE_NOT_READY')
    }
    if (localRevision && revision !== localRevision) {
      this.log({ event: 'SKIPPED', trigger, sourceId, revision, mode, outcome: 'SOURCE_NOT_ELIGIBLE' })
      return skippedResult('SOURCE_NOT_ELIGIBLE')
    }
    if (!(await this.isEligible(sourceId, revision))) {
      if (consumer.stopped || consumer.serviceGeneration !== this.cancellationGeneration) return skippedResult('ABORTED')
      this.log({ event: 'SKIPPED', trigger, sourceId, revision, mode, outcome: 'SOURCE_NOT_ELIGIBLE' })
      return skippedResult('SOURCE_NOT_ELIGIBLE')
    }
    if (consumer.stopped || consumer.serviceGeneration !== this.cancellationGeneration) return skippedResult('ABORTED')
    return this.runFile(sourceId, revision, mode, instruction, trigger, consumer)
  }

  invalidateSourceRevision(sourceId: string, ingestionRevision: string | null): void {
    this.currentSourceRevisions.set(sourceId, ingestionRevision)
    for (const entry of this.inFlight.values()) {
      if (entry.sourceId === sourceId && entry.ingestionRevision !== ingestionRevision) entry.controller.abort()
    }
    for (const [subjectId, context] of this.subjectContexts) {
      if (!context.sources.some((source) => source.sourceId === sourceId && source.ingestionRevision !== ingestionRevision)) continue
      this.subjectGenerations.set(subjectId, context.generation + 1)
      this.subjectControllers.get(subjectId)?.abort()
    }
  }

  cancelAll(): void {
    this.cancellationGeneration += 1
    for (const entry of this.inFlight.values()) entry.controller.abort()
    for (const [subjectId, controller] of this.subjectControllers) {
      this.subjectGenerations.set(subjectId, (this.subjectGenerations.get(subjectId) ?? 0) + 1)
      controller.abort()
    }
    this.dispatchedRequestIds.clear()
  }

  async discardFileOverview(sourceId: string): Promise<void> {
    this.blockedSourceIds.add(sourceId)
    const affectedSubjects = new Set<string>()
    for (const entry of this.inFlight.values()) {
      if (entry.sourceId === sourceId) entry.controller.abort()
    }
    for (const [subjectId, context] of this.subjectContexts) {
      if (!context.sources.some((source) => source.sourceId === sourceId)) continue
      affectedSubjects.add(subjectId)
      this.subjectGenerations.set(subjectId, context.generation + 1)
      this.subjectControllers.get(subjectId)?.abort()
    }
    await this.repository.removeFileOverviews(sourceId)
    await Promise.all([...affectedSubjects].map((subjectId) => this.repository.removeSubjectOverview(subjectId)))
    this.clearDispatchedRequestIds('FILE', sourceId)
    for (const subjectId of affectedSubjects) this.clearDispatchedRequestIds('SUBJECT', subjectId)
  }

  async restoreFileOverview(sourceId: string): Promise<boolean> {
    if (!this.isFileScopeRestorableCallback) return false
    const token = this.repository.captureScopeFenceToken('FILE',sourceId)
    if (!this.repository.isScopeFenceTokenCurrent(token)) return false
    let restorable = false
    try { restorable = await this.isFileScopeRestorableCallback(sourceId) } catch { return false }
    if (!restorable || !this.repository.isScopeFenceTokenCurrent(token)) return false
    this.blockedSourceIds.delete(sourceId)
    return true
  }

  async resumePending(trigger: FileOverviewTrigger): Promise<OverviewRegenerationResult[]> {
    if (!this.listReadyFiles) return []
    let files: ReadyFile[]
    try { files = await this.listReadyFiles() } catch {
      console.warn('[OverviewGeneration] ready-file scan failed')
      return []
    }
    const results: OverviewRegenerationResult[] = []
    for (const file of files) {
      try {
        results.push(await this.generateReadyFileOverview(file.sourceId, file.ingestionRevision, trigger))
      } catch (error) {
        const failed = failedResult(error)
        console.warn('[OverviewGeneration] resume failed', failed.code)
        results.push(failed)
      }
    }
    return results
  }

  regenerateSubjectOverview(subjectId: string, mode: OverviewMode, instruction?: string): OverviewOperationHandle {
    const requestId = this.requestIdFactory()
    const generation = (this.subjectGenerations.get(subjectId) ?? 0) + 1
    this.subjectGenerations.set(subjectId, generation)
    this.subjectControllers.get(subjectId)?.abort()
    const controller = new AbortController()
    this.subjectControllers.set(subjectId, controller)
    const promise = this.runSubjectOverview(subjectId, mode, instruction, requestId, generation, controller)
    return stoppable(promise, requestId, () => {
      if (this.subjectControllers.get(subjectId) === controller) {
        this.subjectGenerations.set(subjectId, generation + 1)
        controller.abort()
      }
    })
  }

  private async runSubjectOverview(subjectId: string, mode: OverviewMode, instruction: string | undefined, requestId: string, generation: number, controller: AbortController): Promise<OverviewRegenerationResult> {
    try {
      const allFiles = (await this.listLocalFileOverviews?.(subjectId) ?? [])
        .filter(hasUsableOverview)
        .sort((a, b) => a.sourceId.localeCompare(b.sourceId))
      if (controller.signal.aborted || this.subjectGenerations.get(subjectId) !== generation) return skippedResult('ABORTED')
      const files = allFiles
        .filter((file) => supportsMode(file, mode))
      if (files.length === 0) return skippedResult('NO_USABLE_INPUT')
      const context: SubjectGenerationContext = {
        generation,
        sources: files.map((file) => ({ sourceId: file.sourceId, ingestionRevision: file.ingestionRevision })),
      }
      this.subjectContexts.set(subjectId, context)
      const inputFingerprint = await computeSubjectInputFingerprint(allFiles)
      if (controller.signal.aborted || this.subjectGenerations.get(subjectId) !== generation) return skippedResult('ABORTED')
      const sources: SubjectOverviewSourceInput[] = files.map((file) => ({
        sourceId: file.sourceId,
        title: file.title,
        outlineMarkdown: mode === 'SUMMARY' ? null : file.outlineMarkdown,
        summaryMarkdown: mode === 'OUTLINE' ? null : file.summaryMarkdown,
      }))
      const retryKey = this.dispatchedRequestKey('SUBJECT', subjectId, JSON.stringify([inputFingerprint, mode, instruction?.trim() ?? '']))
      const previousRequestId = this.dispatchedRequestIds.get(retryKey)
      const request = withInstruction({ subjectId, mode, sources,
        ...(previousRequestId ? { retryOfRequestId: previousRequestId } : {}) }, instruction) as SubjectOverviewRequest
      if (!(await this.areSubjectSourcesCurrent(context.sources))) return skippedResult('SOURCE_NOT_ELIGIBLE')
      if (controller.signal.aborted || this.subjectGenerations.get(subjectId) !== generation) return skippedResult('ABORTED')
      const generationBaseline = await this.repository.captureGenerationBaseline?.('SUBJECT',subjectId,'subject-v1',mode)
      if (controller.signal.aborted || this.subjectGenerations.get(subjectId) !== generation) return skippedResult('ABORTED')
      const generated = await raceWithAbort(this.api.generateSubjectOverview(request, {
        requestId, signal: controller.signal,
        onRequestDispatched: () => this.dispatchedRequestIds.set(retryKey, requestId),
      }), controller.signal)
      if (controller.signal.aborted || this.subjectGenerations.get(subjectId) !== generation) {
        return skippedResult('ABORTED')
      }
      if (!(await this.areSubjectSourcesCurrent(context.sources))) {
        return skippedResult('SOURCE_NOT_ELIGIBLE')
      }
      const latestFiles = (await this.listLocalFileOverviews?.(subjectId) ?? [])
        .filter(hasUsableOverview)
        .sort((a, b) => a.sourceId.localeCompare(b.sourceId))
      const latestFingerprint = await computeSubjectInputFingerprint(latestFiles)
      if (latestFingerprint !== inputFingerprint) {
        return skippedResult('SOURCE_NOT_ELIGIBLE')
      }
      if (!(await this.canCommitSubjectGeneration(subjectId, generation, controller, context.sources))) {
        return skippedResult(this.subjectGenerationSkipCode(subjectId, generation, controller))
      }
      const response = generated
      try {
        const saved = await this.repository.saveSubjectOverviewPart({
          subjectId,
          mode,
          response,
          inputFingerprint,
          generationBaseline,
          isStillCurrent: () => this.isSubjectGenerationCurrent(subjectId, generation, controller, context.sources),
        })
        const conflict = (saved as { generationConflicts?: Array<{ clientWriteId?: string }> } | null)?.generationConflicts?.[0]
        if (conflict?.clientWriteId) return { status: 'LOCAL_EDIT_CONFLICT', requestId, clientWriteId: conflict.clientWriteId }
      } catch (error) {
        if (isOverviewSaveNotCurrent(error)) return skippedResult(this.subjectGenerationSkipCode(subjectId, generation, controller))
        throw error
      }
      if (!(await this.canCommitSubjectGeneration(subjectId, generation, controller, context.sources))) {
        return skippedResult(this.subjectGenerationSkipCode(subjectId, generation, controller))
      }
      return { status: 'STARTED', requestId }
    } catch (error) {
      if (controller.signal.aborted || this.subjectGenerations.get(subjectId) !== generation) return skippedResult('ABORTED')
      const failed = failedResult(error)
      await this.repository.markSubjectOverviewFailed(subjectId, mode, failed.code, failed.detail ?? '').catch(() => undefined)
      return failed
    } finally {
      if (this.subjectControllers.get(subjectId) === controller) this.subjectControllers.delete(subjectId)
      if (this.subjectContexts.get(subjectId)?.generation === generation) this.subjectContexts.delete(subjectId)
    }
  }

  private async areSubjectSourcesCurrent(sources: ReadyFile[]): Promise<boolean> {
    for (const source of sources) {
      if (!(await this.isEligible(source.sourceId, source.ingestionRevision))) return false
      if (!(await this.isCurrentReady(source.sourceId, source.ingestionRevision))) return false
    }
    return true
  }

  private subjectGenerationSkipCode(subjectId: string, generation: number, controller: AbortController): OverviewSkipCode {
    return controller.signal.aborted || this.subjectGenerations.get(subjectId) !== generation ? 'ABORTED' : 'SOURCE_NOT_ELIGIBLE'
  }

  private isSubjectGenerationCurrent(subjectId: string, generation: number, controller: AbortController, sources: ReadyFile[]): boolean {
    if (controller.signal.aborted || this.subjectGenerations.get(subjectId) !== generation
      || this.subjectContexts.get(subjectId)?.generation !== generation) return false
    return sources.every(source => !this.blockedSourceIds.has(source.sourceId)
      && (!this.currentSourceRevisions.has(source.sourceId) || this.currentSourceRevisions.get(source.sourceId) === source.ingestionRevision))
  }

  private async canCommitSubjectGeneration(subjectId: string, generation: number, controller: AbortController, sources: ReadyFile[]): Promise<boolean> {
    if (controller.signal.aborted || this.subjectGenerations.get(subjectId) !== generation) return false
    return this.areSubjectSourcesCurrent(sources)
  }

  private async isCurrentReady(sourceId: string, revision: string): Promise<boolean> {
    if (!this.sourceApi) return true
    try {
      const source = await this.sourceApi.get(sourceId)
      return Boolean(source && source.id === sourceId && source.type === 'FILE' && source.ingestionStatus === 'READY' && source.ingestionRevision === revision)
    } catch { return false }
  }

  private async isEligible(sourceId: string, revision: string): Promise<boolean> {
    if (this.blockedSourceIds.has(sourceId)) return false
    if (this.currentSourceRevisions.has(sourceId) && this.currentSourceRevisions.get(sourceId) !== revision) return false
    if (!this.isFileGenerationEligibleCallback) return true
    try {
      const eligible = await this.isFileGenerationEligibleCallback(sourceId, revision)
      return eligible && !this.blockedSourceIds.has(sourceId)
        && (!this.currentSourceRevisions.has(sourceId) || this.currentSourceRevisions.get(sourceId) === revision)
    } catch {
      return false
    }
  }

  private async runFile(sourceId: string, revision: string, mode: OverviewMode, instruction: string | undefined, trigger: FileOverviewTrigger, manualConsumer?: ManualFileConsumer): Promise<OverviewRegenerationResult> {
    const key = `${sourceId}:${revision}:${mode}:${instruction?.trim() ?? ''}`
    const running = this.inFlight.get(key)
    if (running) {
      if (trigger !== 'MANUAL_RETRY') running.automaticOwner = true
      if (manualConsumer) {
        if (manualConsumer.stopped) return skippedResult('ABORTED')
        running.manualConsumers.add(manualConsumer.id)
        manualConsumer.entry = running
      }
      this.log({ event: 'COALESCED', trigger, requestId: running.requestId, sourceId, revision, mode })
      return running.promise
    }
    const requestId = this.requestIdFactory()
    const retryKey = this.dispatchedRequestKey('FILE', sourceId, JSON.stringify([revision, mode, instruction?.trim() ?? '']))
    const previousRequestId = this.dispatchedRequestIds.get(retryKey)
    const controller = new AbortController()
    const startedAt = monotonicNow()
    const task: Promise<OverviewRegenerationResult> = (async () => {
      const request = withInstruction({ sourceId, mode,
        ...(trigger === 'MANUAL_RETRY' && previousRequestId ? { retryOfRequestId: previousRequestId } : {}) }, instruction) as SourceOverviewRequest
      this.log({ event: 'START', trigger, requestId, sourceId, revision, mode, durationMs: elapsedSince(startedAt) })
      try {
        if (!(await this.isEligible(sourceId, revision))) {
          this.log({ event: 'SKIPPED', trigger, requestId, sourceId, revision, mode, outcome: 'SOURCE_NOT_ELIGIBLE' })
          return skippedResult('SOURCE_NOT_ELIGIBLE')
        }
        const generationBaseline = await this.repository.captureGenerationBaseline?.('FILE',sourceId,revision,mode)
        if (controller.signal.aborted || !(await this.isEligible(sourceId,revision))) return skippedResult(controller.signal.aborted ? 'ABORTED' : 'SOURCE_NOT_ELIGIBLE')
        const generated = await raceWithAbort(this.api.generateSourceOverview(request, {
          requestId, signal: controller.signal,
          onRequestDispatched: () => this.dispatchedRequestIds.set(retryKey, requestId),
        }), controller.signal)
        if (controller.signal.aborted || !(await this.isEligible(sourceId, revision)) || !(await this.isCurrentReady(sourceId, revision))) {
          this.log({ event: 'SKIPPED', trigger, requestId, sourceId, revision, mode, outcome: controller.signal.aborted ? 'ABORTED' : 'SOURCE_NOT_ELIGIBLE' })
          return skippedResult(controller.signal.aborted ? 'ABORTED' : 'SOURCE_NOT_ELIGIBLE')
        }
        const response = generated
        try {
          const saved = await this.repository.saveFileOverviewPart({
            sourceId,
            ingestionRevision: revision,
            mode,
            response,
            generationBaseline,
            isStillCurrent: () => !controller.signal.aborted && !this.blockedSourceIds.has(sourceId)
              && (!this.currentSourceRevisions.has(sourceId) || this.currentSourceRevisions.get(sourceId) === revision)
              && this.inFlight.get(key)?.controller === controller,
          })
          const conflict = (saved as { generationConflicts?: Array<{ clientWriteId?: string }> } | null)?.generationConflicts?.[0]
          if (conflict?.clientWriteId) return { status: 'LOCAL_EDIT_CONFLICT', requestId, clientWriteId: conflict.clientWriteId }
        } catch (error) {
          if (isOverviewSaveNotCurrent(error)) return skippedResult(controller.signal.aborted || this.blockedSourceIds.has(sourceId) ? 'ABORTED' : 'SOURCE_NOT_ELIGIBLE')
          throw error
        }
        return { status: 'STARTED', requestId }
      } catch (error) {
        if (controller.signal.aborted || this.blockedSourceIds.has(sourceId)) {
          this.log({ event: 'SKIPPED', trigger, requestId, sourceId, revision, mode, outcome: 'ABORTED', durationMs: elapsedSince(startedAt) })
          return skippedResult('ABORTED')
        }
        const failed = failedResult(error)
        this.log({ event: 'FAILED', trigger, requestId, sourceId, revision, mode, errorCode: failed.code, durationMs: elapsedSince(startedAt) })
        await this.repository.markFileOverviewFailed(sourceId, revision, mode, failed.code, failed.detail ?? '').catch(() => undefined)
        return failed
      }
    })()
    const entry: InFlightFile = {
      promise: task,
      requestId,
      sourceId,
      ingestionRevision: revision,
      controller,
      automaticOwner: trigger !== 'MANUAL_RETRY',
      manualConsumers: new Set(manualConsumer ? [manualConsumer.id] : []),
    }
    if (manualConsumer) manualConsumer.entry = entry
    this.inFlight.set(key, entry)
    try { return await task } finally {
      if (this.inFlight.get(key) === entry) {
        this.inFlight.delete(key)
        this.log({ event: 'RELEASED', trigger, requestId, sourceId, revision, mode, durationMs: elapsedSince(startedAt) })
      }
    }
  }

  private log(fields: Record<string, unknown>): void {
    try {
      const payload = Object.fromEntries(Object.entries(fields).filter(([key, value]) => DIAGNOSTIC_FIELDS.has(key) && value !== undefined))
      console.info(DIAGNOSTIC_PREFIX, payload)
    } catch {
      // Diagnostics are best effort and must never affect generation behavior.
    }
  }

  private dispatchedRequestKey(scopeType: 'FILE' | 'SUBJECT', scopeId: string, inputIdentity: string): string {
    const scope = this.repository.captureScopeFenceToken(scopeType, scopeId)
    return `${JSON.stringify([scope.userId, scope.serverDeviceId, scopeType, scopeId, scope.generation])}|${inputIdentity}`
  }

  private clearDispatchedRequestIds(scopeType: 'FILE' | 'SUBJECT', scopeId: string): void {
    const scope = this.repository.captureScopeFenceToken(scopeType, scopeId)
    for (const key of this.dispatchedRequestIds.keys()) {
      const identity = key.slice(0, key.indexOf('|'))
      try {
        const [userId, serverDeviceId, type, id] = JSON.parse(identity)
        if (userId === scope.userId && serverDeviceId === scope.serverDeviceId && type === scopeType && id === scopeId) {
          this.dispatchedRequestIds.delete(key)
        }
      } catch {
        // A malformed in-memory key cannot be used for a retry.
      }
    }
  }
}
