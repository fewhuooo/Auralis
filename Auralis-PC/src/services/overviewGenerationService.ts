import { computeSubjectInputFingerprint } from './overviewRepository.ts'
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
} from '@/types/overview'

interface FileSource {
  id?: string
  type?: string
  ingestionStatus?: string
  ingestionRevision?: string
}

interface SourceApi { get(sourceId: string): Promise<FileSource | null> }
interface OverviewRepositoryLike {
  getFileOverview(sourceId: string, ingestionRevision: string): Promise<FileOverviewRecord | null>
  saveFileOverviewPart(input: { sourceId: string; ingestionRevision: string; mode: OverviewMode; response: OverviewResponse }): Promise<unknown>
  markFileOverviewFailed(sourceId: string, ingestionRevision: string, mode: OverviewMode, errorCode: string, errorDetail: string): Promise<void>
  saveSubjectOverviewPart(input: { subjectId: string; mode: OverviewMode; response: OverviewResponse; inputFingerprint: string }): Promise<unknown>
  markSubjectOverviewFailed(subjectId: string, mode: OverviewMode, errorCode: string, errorDetail: string): Promise<void>
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
  getLocalFileGenerationRevision?: (sourceId: string) => Promise<string | null>
}

interface InFlightFile {
  promise: Promise<OverviewRegenerationResult>
  requestId: string
  sourceId: string
  controller: AbortController
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

function failedResult(error: unknown): Extract<OverviewRegenerationResult, { status: 'FAILED' }> {
  const safe = classifyOverviewFailure(error)
  return { status: 'FAILED', code: safe.code as OverviewFailureCode, detail: safe.detail }
}



function withInstruction<T extends object>(request: T, instruction?: string): T & { instruction?: string } {
  const value = instruction?.trim()
  return value ? { ...request, instruction: value } : request
}

function isComplete(record: FileOverviewRecord | null): boolean {
  return Boolean(record?.status === 'READY' && record.outline && record.summary)
}

export function hasUsableOutline(outline: FileOverviewRecord['outline']): boolean {
  return Array.isArray(outline) && outline.some((chapter) => Array.isArray(chapter.sections) && chapter.sections.length > 0)
}

export function hasUsableSummary(summary: FileOverviewRecord['summary']): boolean {
  return Boolean(summary && summary.overview.trim())
}

export function hasUsableOverview(file: FileOverviewRecord): boolean {
  return hasUsableOutline(file.outline) || hasUsableSummary(file.summary)
}

export function supportsMode(file: FileOverviewRecord, mode: OverviewMode): boolean {
  if (mode === 'ALL') return hasUsableOutline(file.outline) && hasUsableSummary(file.summary)
  return mode === 'OUTLINE' ? hasUsableOutline(file.outline) : hasUsableSummary(file.summary)
}

export class OverviewGenerationService {
  private readonly api: OverviewApi
  private readonly repository: OverviewRepositoryLike
  private readonly sourceApi?: SourceApi
  private readonly listReadyFiles?: Options['listReadyFiles']
  private readonly listLocalFileOverviews?: Options['listLocalFileOverviews']
  private readonly requestIdFactory: () => string
  private readonly isFileGenerationEligibleCallback?: Options['isFileGenerationEligible']
  private readonly getLocalFileGenerationRevision?: Options['getLocalFileGenerationRevision']
  private readonly inFlight = new Map<string, InFlightFile>()
  private readonly blockedSourceIds = new Set<string>()
  private readonly subjectGenerations = new Map<string, number>()
  private readonly subjectControllers = new Map<string, AbortController>()
  private readonly subjectContexts = new Map<string, SubjectGenerationContext>()

  constructor(options: Options) {
    this.api = options.api
    this.repository = options.repository
    this.sourceApi = options.sourceApi
    this.listReadyFiles = options.listReadyFiles
    this.listLocalFileOverviews = options.listLocalFileOverviews
    this.requestIdFactory = options.requestIdFactory ?? defaultRequestId
    this.isFileGenerationEligibleCallback = options.isFileGenerationEligible
    this.getLocalFileGenerationRevision = options.getLocalFileGenerationRevision
  }

  async generateReadyFileOverview(sourceId: string, ingestionRevision: string, trigger: FileOverviewTrigger): Promise<OverviewRegenerationResult> {
    this.log({ event: 'TRIGGER', trigger, sourceId, revision: ingestionRevision, mode: 'ALL' })
    if (!(await this.isEligible(sourceId, ingestionRevision))) {
      this.log({ event: 'SKIPPED', trigger, sourceId, revision: ingestionRevision, mode: 'ALL', outcome: 'SOURCE_NOT_ELIGIBLE' })
      return skippedResult('SOURCE_NOT_ELIGIBLE')
    }
    if (!this.sourceApi || !(await this.isCurrentReady(sourceId, ingestionRevision))) {
      this.log({ event: 'SKIPPED', trigger, sourceId, revision: ingestionRevision, mode: 'ALL', outcome: 'SOURCE_NOT_READY' })
      return skippedResult('SOURCE_NOT_READY')
    }
    const existing = await this.repository.getFileOverview(sourceId, ingestionRevision)
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

  async regenerateFileOverview(sourceId: string, mode: OverviewMode, instruction?: string): Promise<OverviewRegenerationResult> {
    const trigger: FileOverviewTrigger = 'MANUAL_RETRY'
    this.log({ event: 'TRIGGER', trigger, sourceId, mode })
    if (this.blockedSourceIds.has(sourceId)) {
      this.log({ event: 'SKIPPED', trigger, sourceId, mode, outcome: 'SOURCE_NOT_ELIGIBLE' })
      return skippedResult('SOURCE_NOT_ELIGIBLE')
    }
    const localRevision = this.getLocalFileGenerationRevision
      ? await this.getLocalFileGenerationRevision(sourceId).catch(() => null)
      : null
    if (this.blockedSourceIds.has(sourceId) || this.getLocalFileGenerationRevision && !localRevision) {
      this.log({ event: 'SKIPPED', trigger, sourceId, mode, outcome: 'SOURCE_NOT_ELIGIBLE' })
      return skippedResult('SOURCE_NOT_ELIGIBLE')
    }
    let source: FileSource | null = null
    try { source = this.sourceApi ? await this.sourceApi.get(sourceId) : null } catch {
      this.log({ event: 'SKIPPED', trigger, sourceId, mode, outcome: 'SOURCE_UNAVAILABLE' })
      return skippedResult('SOURCE_UNAVAILABLE')
    }
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
      this.log({ event: 'SKIPPED', trigger, sourceId, revision, mode, outcome: 'SOURCE_NOT_ELIGIBLE' })
      return skippedResult('SOURCE_NOT_ELIGIBLE')
    }
    return this.runFile(sourceId, revision, mode, instruction, trigger)
  }

  async discardFileOverview(sourceId: string): Promise<void> {
    this.blockedSourceIds.add(sourceId)
    for (const entry of this.inFlight.values()) {
      if (entry.sourceId === sourceId) entry.controller.abort()
    }
    for (const [subjectId, context] of this.subjectContexts) {
      if (!context.sources.some((source) => source.sourceId === sourceId)) continue
      this.subjectGenerations.set(subjectId, context.generation + 1)
      this.subjectControllers.get(subjectId)?.abort()
    }
    await this.repository.removeFileOverviews(sourceId)
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

  async regenerateSubjectOverview(subjectId: string, mode: OverviewMode, instruction?: string): Promise<OverviewRegenerationResult> {
    const requestId = this.requestIdFactory()
    const generation = (this.subjectGenerations.get(subjectId) ?? 0) + 1
    this.subjectGenerations.set(subjectId, generation)
    this.subjectControllers.get(subjectId)?.abort()
    const controller = new AbortController()
    this.subjectControllers.set(subjectId, controller)
    try {
      const allFiles = (await this.listLocalFileOverviews?.(subjectId) ?? [])
        .filter(hasUsableOverview)
        .sort((a, b) => a.sourceId.localeCompare(b.sourceId))
      const files = allFiles
        .filter((file) => supportsMode(file, mode))
      if (files.length === 0) return skippedResult('NO_USABLE_INPUT')
      const context: SubjectGenerationContext = {
        generation,
        sources: files.map((file) => ({ sourceId: file.sourceId, ingestionRevision: file.ingestionRevision })),
      }
      this.subjectContexts.set(subjectId, context)
      const inputFingerprint = await computeSubjectInputFingerprint(allFiles)
      const sources: SubjectOverviewSourceInput[] = files.map((file) => ({
        sourceId: file.sourceId,
        title: file.title,
        outline: mode === 'SUMMARY' ? null : file.outline,
        summary: mode === 'OUTLINE' ? null : file.summary,
      }))
      const request = withInstruction({ subjectId, mode, sources }, instruction) as SubjectOverviewRequest
      const generated = await this.api.generateSubjectOverview(request, { requestId, signal: controller.signal })
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
      await this.repository.saveSubjectOverviewPart({ subjectId, mode, response: generated, inputFingerprint })
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

  private async isCurrentReady(sourceId: string, revision: string): Promise<boolean> {
    if (!this.sourceApi) return true
    try {
      const source = await this.sourceApi.get(sourceId)
      return Boolean(source && source.id === sourceId && source.type === 'FILE' && source.ingestionStatus === 'READY' && source.ingestionRevision === revision)
    } catch { return false }
  }

  private async isEligible(sourceId: string, revision: string): Promise<boolean> {
    if (this.blockedSourceIds.has(sourceId)) return false
    if (!this.isFileGenerationEligibleCallback) return true
    try {
      const eligible = await this.isFileGenerationEligibleCallback(sourceId, revision)
      return eligible && !this.blockedSourceIds.has(sourceId)
    } catch {
      return false
    }
  }

  private async runFile(sourceId: string, revision: string, mode: OverviewMode, instruction: string | undefined, trigger: FileOverviewTrigger): Promise<OverviewRegenerationResult> {
    const key = `${sourceId}:${revision}:${mode}:${instruction?.trim() ?? ''}`
    const running = this.inFlight.get(key)
    if (running) {
      this.log({ event: 'COALESCED', trigger, requestId: running.requestId, sourceId, revision, mode })
      return running.promise
    }
    const requestId = this.requestIdFactory()
    const controller = new AbortController()
    const startedAt = monotonicNow()
    const task: Promise<OverviewRegenerationResult> = (async () => {
      const request = withInstruction({ sourceId, mode }, instruction) as SourceOverviewRequest
      this.log({ event: 'START', trigger, requestId, sourceId, revision, mode, durationMs: elapsedSince(startedAt) })
      try {
        if (!(await this.isEligible(sourceId, revision))) {
          this.log({ event: 'SKIPPED', trigger, requestId, sourceId, revision, mode, outcome: 'SOURCE_NOT_ELIGIBLE' })
          return skippedResult('SOURCE_NOT_ELIGIBLE')
        }
        const generated = await this.api.generateSourceOverview(request, { requestId, signal: controller.signal })
        if (!(await this.isEligible(sourceId, revision)) || !(await this.isCurrentReady(sourceId, revision))) {
          this.log({ event: 'SKIPPED', trigger, requestId, sourceId, revision, mode, outcome: controller.signal.aborted ? 'ABORTED' : 'SOURCE_NOT_ELIGIBLE' })
          return skippedResult(controller.signal.aborted ? 'ABORTED' : 'SOURCE_NOT_ELIGIBLE')
        }
        await this.repository.saveFileOverviewPart({ sourceId, ingestionRevision: revision, mode, response: generated })
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
    const entry = { promise: task, requestId, sourceId, controller }
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
}
