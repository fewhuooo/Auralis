import {
  documentCacheDelete,
  documentLocalCacheDelete,
  documentPackageAppend,
  documentPackageBegin,
  documentPackageFinish,
  ocrWarmup,
} from '@/api/tauri'
import { e2ee } from '@/api/e2ee'
import { useSourceApi, type SourceView } from '@/api/useSourceApi'
import {
  getDocumentProcessingJobRepository,
  getOverviewRepository,
  getLocalAssetRepository,
  getLocalParsedDocumentRepository,
  getLocalRepository,
} from '@/services/localDb'
import {
  DocumentProcessingJobRepository,
} from '@/services/localRepository'
import { parseDocument } from '@/services/documentParser/DocumentParser'
import { TauriOcrAdapter } from '@/services/documentParser/OcrAdapter'
import { openPdfDocument } from '@/services/documentParser/PdfTextAdapter'
import { openPptxDocument } from '@/services/documentParser/PptxTextAdapter'
import { FileViewerParserBridge } from '@/services/documentParser/fileViewerBridge'
import { getBackgroundParserHost } from '@/services/documentParser/backgroundParserHost'
import { ParsedDocumentUploadCoordinator } from './ParsedDocumentUploadCoordinator'
import { LocalParsedDocumentCoordinator } from './LocalParsedDocumentCoordinator'
import { getOrCreateLocalSourceDraftService } from '@/services/localSourceDraftService'
import { getOrCreateLocalAssetService } from '@/services/localAssetService'
import type { LocalParsedDocumentRecord } from '@/types/localParsedDocument'
import { DocumentJobRunner } from './DocumentJobRunner'
import { SourceJobScheduler, type SourceInput } from './sourceJobScheduler'
import { useAssetStore } from '@/store/useAssetStore'
import { useAuthStore } from '@/store/useAuthStore'
import { useDocumentProcessingStore } from '@/store/useDocumentProcessingStore'
import { useSourceStore } from '@/store/useSourceStore'
import { attachSubjectDeletionRuntime } from '@/services/subjectDeletionCoordinator'
import { useSyncStore } from '@/store/useSyncStore'
import { useOverviewApi } from '@/api/useOverviewApi'
import { OverviewGenerationService } from '@/services/overviewGenerationService'
import type { FileOverviewRecord } from '@/types/overview'
import type { FileOverviewTrigger } from '@/types/overview'
import type { DocumentProcessingJob } from '@/types/documentProcessing'
import type { DocumentParserInput, DocumentParserProgress } from '@/services/documentParser/types'

type RuntimeFile = File & {
  arrayBuffer(): Promise<ArrayBuffer>
}

interface RuntimeWindow {
  __TAURI__?: unknown
  __TAURI_INTERNALS__?: unknown
}

function isTauriContext(): boolean {
  if (typeof window === 'undefined') return false
  const current = window as unknown as RuntimeWindow
  return Boolean(current.__TAURI__ || current.__TAURI_INTERNALS__)
}

function asRuntimeFile(file: SourceInput['file']): RuntimeFile {
  const candidate = file as Partial<RuntimeFile>
  if (!candidate || typeof candidate.arrayBuffer !== 'function') {
    throw new Error('SOURCE_INPUT_UNREADABLE')
  }
  return file as RuntimeFile
}

function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf('.')
  return dot < 0 ? '' : fileName.slice(dot + 1).toLowerCase()
}

function mimeTypeForSource(source: SourceView, assetMimeType?: string): string {
  if (assetMimeType) return assetMimeType
  const extension = extensionOf(source.title || '')
  const known: Record<string, string> = {
    pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ppt: 'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    txt: 'text/plain',
    md: 'text/markdown',
    json: 'application/json',
    xml: 'application/xml',
    csv: 'text/csv',
  }
  return known[extension] || 'application/octet-stream'
}

async function sha256File(file: SourceInput['file']): Promise<string> {
  const runtimeFile = asRuntimeFile(file)
  const subtle = globalThis.crypto?.subtle
  if (!subtle) throw new Error('CRYPTO_SUBTLE_UNAVAILABLE')
  const digest = await subtle.digest('SHA-256', await runtimeFile.arrayBuffer())
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function serialized<T>(task: () => Promise<T>): Promise<T> {
  let tail = parserTail
  const run = tail.then(task, task)
  parserTail = run.then(() => undefined, () => undefined)
  return run
}

let parserTail = Promise.resolve()

function isOfficeExtension(fileName: string): boolean {
  return ['doc', 'docx', 'ppt', 'pptx'].includes(extensionOf(fileName))
}

type ProcessingSourceStatus = 'PENDING' | 'VALIDATING' | 'PARSING' | 'INDEXING'
export type ProcessingSourceReconciliationResult = 'READY' | 'FAILED' | 'DELETED' | 'STOPPED' | 'EXHAUSTED' | 'CANCELLED'

interface ProcessingSourceSnapshot {
  id: string
  type?: string
  ingestionStatus?: string
  deletedAt?: string | null
}

export interface ProcessingSourceReconciliationOptions {
  sourceIds: readonly string[]
  getSources: () => ProcessingSourceSnapshot[] | Promise<ProcessingSourceSnapshot[]>
  requestReadSync: () => void | Promise<void>
  maxAttempts?: number
  waitMs?: number
  signal?: AbortSignal
}

export interface DocumentProcessingRuntimeOptions {
  sourceReconciliationMaxAttempts?: number
  sourceReconciliationWaitMs?: number
}

const PROCESSING_SOURCE_STATUSES = new Set<ProcessingSourceStatus>(['PENDING', 'VALIDATING', 'PARSING', 'INDEXING'])

function waitForReconciliation(ms: number, signal?: AbortSignal): Promise<boolean> {
  if (signal?.aborted) return Promise.resolve(false)
  return new Promise((resolve) => {
    let timer: ReturnType<typeof setTimeout> | null = setTimeout(() => {
      timer = null
      signal?.removeEventListener('abort', onAbort)
      resolve(!signal?.aborted)
    }, ms)
    const onAbort = (): void => {
      if (timer !== null) clearTimeout(timer)
      timer = null
      signal?.removeEventListener('abort', onAbort)
      resolve(false)
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

export async function reconcileProcessingSource(
  options: Omit<ProcessingSourceReconciliationOptions, 'sourceIds' | 'getSources'> & {
    sourceId: string
    getSource: () => ProcessingSourceSnapshot | null | Promise<ProcessingSourceSnapshot | null>
  },
): Promise<ProcessingSourceReconciliationResult> {
  const results = await reconcileProcessingSources({
    ...options,
    sourceIds: [options.sourceId],
    getSources: async () => {
      const source = await options.getSource()
      return source ? [source] : []
    },
  })
  return results.get(options.sourceId) ?? 'DELETED'
}

export async function reconcileProcessingSources(
  options: ProcessingSourceReconciliationOptions,
): Promise<Map<string, ProcessingSourceReconciliationResult>> {
  const sourceIds = new Set(options.sourceIds.filter((sourceId) => sourceId.trim()))
  const results = new Map<string, ProcessingSourceReconciliationResult>()
  const maxAttempts = Math.max(1, Math.floor(options.maxAttempts ?? 6))
  const waitMs = Math.max(0, Math.floor(options.waitMs ?? 1500))

  if (sourceIds.size === 0) return results

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (options.signal?.aborted) {
      for (const sourceId of sourceIds) if (!results.has(sourceId)) results.set(sourceId, 'CANCELLED')
      return results
    }
    const sources = await options.getSources()
    if (options.signal?.aborted) {
      for (const sourceId of sourceIds) if (!results.has(sourceId)) results.set(sourceId, 'CANCELLED')
      return results
    }
    const byId = new Map(sources.map((source) => [source.id, source]))
    for (const source of sources) {
      if (source.type === 'FILE' && PROCESSING_SOURCE_STATUSES.has(source.ingestionStatus as ProcessingSourceStatus)) {
        sourceIds.add(source.id)
      }
    }
    const activeSourceIds: string[] = []
    for (const sourceId of [...sourceIds]) {
      if (results.has(sourceId)) continue
      const source = byId.get(sourceId)
      if (!source || source.deletedAt) results.set(sourceId, 'DELETED')
      else if (source.ingestionStatus === 'READY') results.set(sourceId, 'READY')
      else if (source.ingestionStatus === 'FAILED') results.set(sourceId, 'FAILED')
      else if (!PROCESSING_SOURCE_STATUSES.has(source.ingestionStatus as ProcessingSourceStatus)) results.set(sourceId, 'STOPPED')
      else activeSourceIds.push(sourceId)
    }
    if (activeSourceIds.length === 0) return results

    await options.requestReadSync()
    if (options.signal?.aborted) {
      for (const sourceId of sourceIds) if (!results.has(sourceId)) results.set(sourceId, 'CANCELLED')
      return results
    }
    if (attempt + 1 < maxAttempts && waitMs > 0 && !(await waitForReconciliation(waitMs, options.signal))) {
      for (const sourceId of activeSourceIds) if (!results.has(sourceId)) results.set(sourceId, 'CANCELLED')
      return results
    }
  }

  for (const sourceId of sourceIds) if (!results.has(sourceId)) results.set(sourceId, 'EXHAUSTED')
  return results
}

export interface DocumentProcessingRuntimeSnapshot {
  userId: string
  serverDeviceId: string
  repository: DocumentProcessingJobRepository
  runner: DocumentJobRunner
  scheduler: SourceJobScheduler
  overviewGeneration: OverviewGenerationService
}

/**
 * Owns the production composition for the PC document pipeline. The class is
 * intentionally lifecycle-driven: App.vue starts it after auth hydration and
 * stops it on logout, while all document bytes remain in memory or the native
 * encrypted cache rather than in repository rows.
 */
export class DocumentProcessingRuntime {
  private key: string | null = null
  private snapshot: DocumentProcessingRuntimeSnapshot | null = null
  private starting: Promise<void> | null = null
  private lifecycleGeneration = 0
  private readonly parserInputs = new Map<string, RuntimeFile>()
  private sourceReconciliation: Promise<Map<string, ProcessingSourceReconciliationResult>> | null = null
  private sourceReconciliationController: AbortController | null = null
  private readonly sourceReconciliationMaxAttempts: number
  private readonly sourceReconciliationWaitMs: number
  private readonly onlineHandler = (): void => {
    void this.resumePending('RESUME_ONLINE').catch(() => console.warn('[DocumentRuntime] online resume failed'))
  }
  private readonly syncHandler = (): void => {
    const snapshot = this.snapshot
    if (!snapshot) return
    const generation = this.lifecycleGeneration
    const scope = { userId: snapshot.userId, serverDeviceId: snapshot.serverDeviceId }
    const isCurrentScope = (): boolean => this.lifecycleGeneration === generation
      && this.snapshot === snapshot
      && useAuthStore().user?.id === scope.userId
      && useAuthStore().serverDeviceId === scope.serverDeviceId
    if (!isCurrentScope()) return
    const sourceStore = useSourceStore()
    void sourceStore.refreshLocalProjection(scope)
      .then(() => {
        if (!isCurrentScope()) return
        return this.resumePending('RESUME_SYNC')
      })
      .catch(() => console.warn('[DocumentRuntime] sync resume failed'))
  }

  constructor(options: DocumentProcessingRuntimeOptions = {}) {
    this.sourceReconciliationMaxAttempts = options.sourceReconciliationMaxAttempts ?? 6
    this.sourceReconciliationWaitMs = options.sourceReconciliationWaitMs ?? 1500
  }

  async start(): Promise<void> {
    if (this.starting) return this.starting
    const generation = ++this.lifecycleGeneration
    const task = this.startInternal(generation)
    this.starting = task
    try {
      await task
    } finally {
      if (this.starting === task) this.starting = null
    }
  }

  stop(): void {
    this.lifecycleGeneration += 1
    this.starting = null
    this.clearRuntimeState()
  }

  private clearRuntimeState(): void {
    if (typeof window !== 'undefined') window.removeEventListener('online', this.onlineHandler)
    if (typeof window !== 'undefined') window.removeEventListener('auralis-sync-updated', this.syncHandler)
    if (this.snapshot) {
      attachSubjectDeletionRuntime(null)
      useSourceStore().attachDocumentScheduler(null)
      useSourceStore().attachFileOverviewGenerator(null)
      useDocumentProcessingStore().attachRunner(null)
      useDocumentProcessingStore().attachScheduler(null)
      useDocumentProcessingStore().attachLocalOcrProgressReader(null)
    }
    this.snapshot = null
    this.key = null
    this.parserInputs.clear()
    this.sourceReconciliationController?.abort()
    this.sourceReconciliationController = null
    this.sourceReconciliation = null
  }

  private startSourceReconciliation(sourceIds: string[], scope: { userId: string; serverDeviceId: string }): void {
    if (this.sourceReconciliation || sourceIds.length === 0) return
    const generation = this.lifecycleGeneration
    const controller = new AbortController()
    this.sourceReconciliationController = controller
    const isCurrent = (): boolean => this.lifecycleGeneration === generation
      && this.sourceReconciliationController === controller
      && useAuthStore().user?.id === scope.userId
      && useAuthStore().serverDeviceId === scope.serverDeviceId
    const task = reconcileProcessingSources({
      sourceIds,
      signal: controller.signal,
      maxAttempts: this.sourceReconciliationMaxAttempts,
      waitMs: this.sourceReconciliationWaitMs,
      getSources: () => {
        if (!isCurrent()) return []
        return useSourceStore().sources.map((source) => ({
          id: source.id,
          type: source.type,
          ingestionStatus: source.ingestionStatus,
          deletedAt: (source as SourceView & { deletedAt?: string | null }).deletedAt,
        }))
      },
      requestReadSync: async () => {
        if (!isCurrent()) return
        const syncStore = useSyncStore()
        await syncStore.triggerSync().catch(() => undefined)
        if (!isCurrent()) return
        await useSourceStore().refreshLocalProjection(scope).catch(() => undefined)
        if (!isCurrent()) return
      },
    })
    this.sourceReconciliation = task
    void task.then(() => undefined, () => undefined).finally(() => {
      if (this.sourceReconciliation === task) {
        this.sourceReconciliation = null
        this.sourceReconciliationController = null
      }
    })
  }

  private startProcessingSourceReconciliations(scope: { userId: string; serverDeviceId: string }): void {
    const sourceStore = useSourceStore()
    const sourceIds = sourceStore.sources
      .filter((source) => source.type === 'FILE' && PROCESSING_SOURCE_STATUSES.has(source.ingestionStatus as ProcessingSourceStatus))
      .map((source) => source.id)
    this.startSourceReconciliation(sourceIds, scope)
  }

  async resumePending(trigger: FileOverviewTrigger = 'RESUME_ONLINE'): Promise<void> {
    const snapshot = this.snapshot
    if (!snapshot) return
    const generation = this.lifecycleGeneration
    const scope = { userId: snapshot.userId, serverDeviceId: snapshot.serverDeviceId }
    const isCurrent = (): boolean => this.lifecycleGeneration === generation
      && this.snapshot === snapshot
      && useAuthStore().user?.id === scope.userId
      && useAuthStore().serverDeviceId === scope.serverDeviceId
    const jobs = await snapshot.repository.list()
    if (!isCurrent()) return
    const sourceStore = useSourceStore()
    const sourceIds = new Set<string>([
      ...jobs.map((job) => job.sourceId),
      ...sourceStore.sources.map((source) => source.id),
    ])
    await snapshot.scheduler.resume([...sourceIds])
    if (!isCurrent()) return
    void snapshot.overviewGeneration.resumePending(trigger)
      .catch(() => console.warn('[DocumentRuntime] overview resume failed'))
    const refreshedJobs = await snapshot.repository.list()
    if (!isCurrent()) return
    useDocumentProcessingStore().setJobs(refreshedJobs)
    if (!isCurrent()) return
    this.startProcessingSourceReconciliations(scope)
  }

  getSnapshot(): DocumentProcessingRuntimeSnapshot | null {
    return this.snapshot
  }

  private isCurrentStart(generation: number, userId: string, serverDeviceId: string): boolean {
    const auth = useAuthStore()
    return this.lifecycleGeneration === generation && auth.user?.id === userId && auth.serverDeviceId === serverDeviceId
  }

  private async startInternal(generation: number): Promise<void> {
    if (!isTauriContext()) return
    const authStore = useAuthStore()
    const userId = authStore.user?.id
    const serverDeviceId = authStore.serverDeviceId
    if (!userId || !serverDeviceId) {
      this.stop()
      return
    }
    const key = `${userId}:${serverDeviceId}`
    if (this.key === key && this.snapshot) return
    this.clearRuntimeState()

    const repository = await getDocumentProcessingJobRepository(userId, serverDeviceId)
    const overviewRepository = await getOverviewRepository(userId, serverDeviceId)
    const localAssetRepo = await getLocalAssetRepository(userId, serverDeviceId)
    const localParsedRepo = await getLocalParsedDocumentRepository(userId, serverDeviceId)
    const localRepo = await getLocalRepository(userId, serverDeviceId)
    const localDraftService = getOrCreateLocalSourceDraftService(localAssetRepo, localRepo)
    const localAssetService = getOrCreateLocalAssetService(localAssetRepo)

    const localParsedCoordinator = new LocalParsedDocumentCoordinator({
      repository: localParsedRepo,
      localAssetService,
      parserFactory: async (record, file) => this.createLocalParser(record, file),
    })

    await this.ensureEncryptionReady(repository)
    if (!this.isCurrentStart(generation, userId, serverDeviceId)) return
    const assetStore = useAssetStore()
    const sourceStore = useSourceStore()
    const processingStore = useDocumentProcessingStore()
    const overviewGeneration = new OverviewGenerationService({
      api: useOverviewApi,
      repository: overviewRepository,
      sourceApi: useSourceApi,
      listReadyFiles: async () => (await repository.list())
        .filter((job) => job.phase === 'READY')
        .map((job) => ({ sourceId: job.sourceId, ingestionRevision: job.ingestionRevision })),
      isFileGenerationEligible: async (sourceId, ingestionRevision) => {
        const source = sourceStore.sources.find((item) => item.id === sourceId)
        if (!source || source.type !== 'FILE' || source.ingestionRevision !== ingestionRevision) return false
        const jobs = await repository.list()
        return jobs.some((job) => job.sourceId === sourceId && job.ingestionRevision === ingestionRevision && job.phase === 'READY')
      },
      getLocalFileGenerationRevision: async (sourceId) => {
        const source = sourceStore.sources.find((item) => item.id === sourceId)
        if (!source || source.type !== 'FILE' || !source.ingestionRevision) return null
        const jobs = await repository.list()
        return jobs.some((job) => job.sourceId === sourceId && job.ingestionRevision === source.ingestionRevision && job.phase === 'READY')
          ? source.ingestionRevision
          : null
      },
      listLocalFileOverviews: async (subjectId) => {
        const records = await Promise.all(sourceStore.sources
          .filter((source) => source.subjectId === subjectId && source.type === 'FILE' && source.ingestionRevision)
          .map((source) => overviewRepository.getFileOverview(source.id, source.ingestionRevision!)))
        return records.filter((record): record is FileOverviewRecord => record !== null)
      },
    })
    const packager = {
      begin: documentPackageBegin,
      append: documentPackageAppend,
      finish: documentPackageFinish,
    }
    const runner = new DocumentJobRunner({
      repository,
      packager,
      parserFactory: async (job) => this.createParser(job),
    })
    const upload = new ParsedDocumentUploadCoordinator({
      repository,
      onCompleteAccepted: () => {
        useSyncStore().requestBackgroundSync('read')
      },
    })
    const scheduler = new SourceJobScheduler({
      repository,
      sourceApi: useSourceApi,
      upload,
      localDraftService,
      localParsedRepo,
      localAssetRepo,
      localParsedCoordinator,
      resolveLocalInput: (assetId, source) => assetStore.resolveLocalFile(
        assetId,
        source.title || `asset-${assetId}`,
        mimeTypeForSource(source),
      ),
      downloadAsset: (assetId, source) => assetStore.resolveSourceInput(
        assetId,
        source.title || `asset-${assetId}`,
        mimeTypeForSource(source),
      ),
      hashFile: sha256File,
      expectedAssetSha256: (assetId) => assetStore.getAssetSha256(assetId),
      prepareInput: async (job, _source, file) => {
        this.parserInputs.set(job.jobId, asRuntimeFile(file))
      },
      runJob: async (jobId, metadata) => {
        const input = this.parserInputs.get(jobId)
        if (!input) throw new Error('DOCUMENT_INPUT_UNAVAILABLE')
        if (!metadata || !/^[a-f0-9]{64}$/.test(metadata.sourceAssetSha256)) {
          throw new Error('SOURCE_ASSET_SHA_INVALID')
        }
        await runner.start(jobId, {
          sourceAssetSha256: metadata.sourceAssetSha256,
          ocrModelVersion: 'PP-OCRv6-small',
        })
      },
      cancelJob: (jobId) => runner.cancel(jobId),
      discardPreparedInput: (jobId) => { this.parserInputs.delete(jobId) },
      deleteCache: async (cacheId) => { await documentCacheDelete(cacheId) },
      deleteLocalCache: async (cacheId) => { await documentLocalCacheDelete(cacheId) },
      onJobChanged: async () => {
        await processingStore.refresh()
        void overviewGeneration.resumePending('JOB_CHANGED')
          .catch(() => console.warn('[DocumentRuntime] overview generation enqueue failed'))
      },
    })

    if (!this.isCurrentStart(generation, userId, serverDeviceId)) return
    this.key = key
    this.snapshot = { userId, serverDeviceId, repository, runner, scheduler, overviewGeneration }
    attachSubjectDeletionRuntime({
      discardSource: (sourceId) => scheduler.discard(sourceId),
      discardFileOverview: (sourceId) => overviewGeneration.discardFileOverview(sourceId),
    })
    sourceStore.attachDocumentScheduler(scheduler)
    sourceStore.attachFileOverviewGenerator(overviewGeneration)
    processingStore.attachRunner(runner)
    processingStore.attachScheduler(scheduler)
    processingStore.attachLocalOcrProgressReader({
      list: async () => (await localParsedRepo.listByPhase('OCR_RUNNING')).map((record) => ({
        localSourceId: record.localSourceId,
        checkpointJson: record.checkpointJson,
      })),
    })

    const warmup = await ocrWarmup().catch((error) => {
      console.warn('[DocumentRuntime] OCR warmup deferred', error)
      return null
    })
    if (warmup && !warmup.ready) {
      console.warn('[DocumentRuntime] OCR warmup deferred', warmup.errorCode)
    }
    if (!this.isCurrentStart(generation, userId, serverDeviceId)) return

    await useSyncStore().triggerSync().catch((error) => {
      console.warn('[DocumentRuntime] pending sync bootstrap deferred', error)
    })
    if (!this.isCurrentStart(generation, userId, serverDeviceId)) return

    await sourceStore.loadSources().catch((error) => {
      console.warn('[DocumentRuntime] source bootstrap deferred', error)
    })
    if (!this.isCurrentStart(generation, userId, serverDeviceId)) return
    await this.resumePending('RESUME_BOOTSTRAP')
    if (!this.isCurrentStart(generation, userId, serverDeviceId)) return

    if (typeof window !== 'undefined') window.addEventListener('online', this.onlineHandler)
    if (typeof window !== 'undefined') window.addEventListener('auralis-sync-updated', this.syncHandler)
  }

  private async ensureEncryptionReady(repository: DocumentProcessingJobRepository): Promise<void> {
    const hasMasterKey = await e2ee.isEnabled()
    if (!hasMasterKey) {
      const jobs = await repository.list()
      const hasRecoverableCache = jobs.some((job) => job.payloadCacheId !== null || job.payloadReceipt !== null)
      if (hasRecoverableCache) {
        throw new Error('DOCUMENT_ENCRYPTION_KEY_RECOVERY_REQUIRED')
      }
    }

    const initialized = await e2ee.initialize()
    if (!initialized) {
      throw new Error('DOCUMENT_ENCRYPTION_INITIALIZATION_FAILED')
    }
  }

  private async createParser(job: DocumentProcessingJob): Promise<(sink: Parameters<typeof parseDocument>[1], onProgress: (event: DocumentParserProgress) => Promise<void>) => Promise<void>> {
    const file = this.parserInputs.get(job.jobId)
    if (!file) throw new Error('DOCUMENT_INPUT_UNAVAILABLE')
    return (sink, onProgress) => serialized(async () => {
      const extension = extensionOf(file.name)
      const ocr = new TauriOcrAdapter()
      const input: DocumentParserInput = {
        file,
        taskId: job.jobId,
        ocr,
      }
      if (extension === 'pdf') {
        input.pdf = await openPdfDocument(new Uint8Array(await file.arrayBuffer()))
      } else if (extension === 'pptx') {
        input.pptx = await openPptxDocument(new Uint8Array(await file.arrayBuffer()))
      } else if (isOfficeExtension(file.name)) {
        const bridge = new FileViewerParserBridge(getBackgroundParserHost)
        input.office = {
          get pageCount() {
            const pageCount = getBackgroundParserHost()?.getPageCount?.() ?? 0
            if (!Number.isInteger(pageCount) || pageCount < 1) throw new Error('DOCUMENT_FILE_TYPE_UNSUPPORTED')
            return pageCount
          },
          bridge,
        }
      } else {
        throw new Error('DOCUMENT_FILE_TYPE_UNSUPPORTED')
      }
      try {
        await parseDocument(input, sink, { onProgress })
      } finally {
        this.parserInputs.delete(job.jobId)
      }
    })
  }

  private async createLocalParser(
    record: LocalParsedDocumentRecord,
    file: File,
  ): Promise<(sink: Parameters<typeof parseDocument>[1], onProgress: (event: DocumentParserProgress) => Promise<void>) => Promise<void>> {
    return (sink, onProgress) => serialized(async () => {
      const extension = extensionOf(file.name)
      const ocr = new TauriOcrAdapter()
      const input: DocumentParserInput = {
        file,
        taskId: record.localSourceId,
        ocr,
      }
      if (extension === 'pdf') {
        input.pdf = await openPdfDocument(new Uint8Array(await file.arrayBuffer()))
      } else if (extension === 'pptx') {
        input.pptx = await openPptxDocument(new Uint8Array(await file.arrayBuffer()))
      } else if (isOfficeExtension(file.name)) {
        const bridge = new FileViewerParserBridge(getBackgroundParserHost)
        input.office = {
          get pageCount() {
            const pageCount = getBackgroundParserHost()?.getPageCount?.() ?? 0
            if (!Number.isInteger(pageCount) || pageCount < 1) throw new Error('DOCUMENT_FILE_TYPE_UNSUPPORTED')
            return pageCount
          },
          bridge,
        }
      } else {
        throw new Error('DOCUMENT_FILE_TYPE_UNSUPPORTED')
      }
      await parseDocument(input, sink, { onProgress })
    })
  }
}

export const documentProcessingRuntime = new DocumentProcessingRuntime()
