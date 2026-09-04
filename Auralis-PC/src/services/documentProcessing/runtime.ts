import {
  documentCacheDelete,
  documentPackageAppend,
  documentPackageBegin,
  documentPackageFinish,
} from '@/api/tauri'
import { e2ee } from '@/api/e2ee'
import { useSourceApi, type SourceView } from '@/api/useSourceApi'
import { getDocumentProcessingJobRepository } from '@/services/localDb'
import {
  DocumentProcessingJobRepository,
} from '@/services/localRepository'
import { parseDocument } from '@/services/documentParser/DocumentParser'
import { TauriOcrAdapter } from '@/services/documentParser/OcrAdapter'
import { openPdfDocument } from '@/services/documentParser/PdfTextAdapter'
import { FileViewerParserBridge } from '@/services/documentParser/fileViewerBridge'
import { getBackgroundParserHost } from '@/services/documentParser/backgroundParserHost'
import { ParsedDocumentUploadCoordinator } from './ParsedDocumentUploadCoordinator'
import { DocumentJobRunner } from './DocumentJobRunner'
import { SourceJobScheduler, type SourceInput } from './sourceJobScheduler'
import { useAssetStore } from '@/store/useAssetStore'
import { useAuthStore } from '@/store/useAuthStore'
import { useDocumentProcessingStore } from '@/store/useDocumentProcessingStore'
import { useSourceStore } from '@/store/useSourceStore'
import { useSyncStore } from '@/store/useSyncStore'
import type { DocumentProcessingJob } from '@/types/documentProcessing'
import type { DocumentParserInput } from '@/services/documentParser/types'

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

export interface DocumentProcessingRuntimeSnapshot {
  userId: string
  serverDeviceId: string
  repository: DocumentProcessingJobRepository
  runner: DocumentJobRunner
  scheduler: SourceJobScheduler
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
  private readonly parserInputs = new Map<string, RuntimeFile>()
  private readonly onlineHandler = (): void => {
    void this.resumePending().catch((error) => console.warn('[DocumentRuntime] online resume failed', error))
  }
  private readonly syncHandler = (): void => {
    const sourceStore = useSourceStore()
    void sourceStore.loadSources()
      .then(() => this.resumePending())
      .catch((error) => console.warn('[DocumentRuntime] sync resume failed', error))
  }

  async start(): Promise<void> {
    if (this.starting) return this.starting
    const task = this.startInternal()
    this.starting = task
    try {
      await task
    } finally {
      if (this.starting === task) this.starting = null
    }
  }

  stop(): void {
    if (typeof window !== 'undefined') window.removeEventListener('online', this.onlineHandler)
    if (typeof window !== 'undefined') window.removeEventListener('auralis-sync-updated', this.syncHandler)
    if (this.snapshot) {
      useSourceStore().attachDocumentScheduler(null)
      useDocumentProcessingStore().attachRunner(null)
    }
    this.snapshot = null
    this.key = null
    this.parserInputs.clear()
  }

  async resumePending(): Promise<void> {
    const snapshot = this.snapshot
    if (!snapshot) return
    const jobs = await snapshot.repository.list()
    const sourceStore = useSourceStore()
    const sourceIds = new Set<string>([
      ...jobs.map((job) => job.sourceId),
      ...sourceStore.sources.map((source) => source.id),
    ])
    await snapshot.scheduler.resume([...sourceIds])
    useDocumentProcessingStore().setJobs(await snapshot.repository.list())
  }

  getSnapshot(): DocumentProcessingRuntimeSnapshot | null {
    return this.snapshot
  }

  private async startInternal(): Promise<void> {
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
    this.stop()

    const repository = await getDocumentProcessingJobRepository(userId, serverDeviceId)
    await this.ensureEncryptionReady(repository)
    const assetStore = useAssetStore()
    const sourceStore = useSourceStore()
    const processingStore = useDocumentProcessingStore()
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
    const upload = new ParsedDocumentUploadCoordinator({ repository })
    const scheduler = new SourceJobScheduler({
      repository,
      sourceApi: useSourceApi,
      upload,
      resolveLocalInput: async (assetId) => {
        const file = assetStore.getLocalFile(assetId)
        if (!file) return null
        return {
          file,
          cleanup: () => {
            if (assetStore.getLocalFile(assetId) === file) assetStore.forgetLocalFile(assetId)
          },
        }
      },
      downloadAsset: (assetId, source) => assetStore.downloadSourceInput(
        assetId,
        source.title || `asset-${assetId}`,
        mimeTypeForSource(source, assetStore.getCachedAsset(assetId)?.mimeType),
      ),
      hashFile: sha256File,
      expectedAssetSha256: async (assetId) => assetStore.getCachedAsset(assetId)?.sha256,
      prepareInput: async (job, _source, file) => {
        this.parserInputs.set(job.jobId, asRuntimeFile(file))
      },
      runJob: (jobId) => runner.start(jobId),
      cancelJob: (jobId) => runner.cancel(jobId),
      discardPreparedInput: (jobId) => { this.parserInputs.delete(jobId) },
      deleteCache: async (cacheId) => { await documentCacheDelete(cacheId) },
      onJobChanged: async () => {
        await processingStore.refresh()
        await sourceStore.loadSources()
      },
    })

    this.key = key
    this.snapshot = { userId, serverDeviceId, repository, runner, scheduler }
    sourceStore.attachDocumentScheduler(scheduler)
    processingStore.attachRunner(runner)

    await useSyncStore().triggerSync().catch((error) => {
      console.warn('[DocumentRuntime] pending sync bootstrap deferred', error)
    })

    await sourceStore.loadSources().catch((error) => {
      console.warn('[DocumentRuntime] source bootstrap deferred', error)
    })
    await this.resumePending()

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

  private async createParser(job: DocumentProcessingJob): Promise<(sink: Parameters<typeof parseDocument>[1]) => Promise<void>> {
    const file = this.parserInputs.get(job.jobId)
    if (!file) throw new Error('DOCUMENT_INPUT_UNAVAILABLE')
    return (sink) => serialized(async () => {
      const extension = extensionOf(file.name)
      const ocr = new TauriOcrAdapter()
      const input: DocumentParserInput = {
        file,
        taskId: job.jobId,
        ocr,
      }
      if (extension === 'pdf') {
        input.pdf = await openPdfDocument(new Uint8Array(await file.arrayBuffer()))
      } else if (isOfficeExtension(file.name)) {
        const bridge = new FileViewerParserBridge(getBackgroundParserHost)
        input.office = {
          get pageCount() {
            const pageCount = getBackgroundParserHost()?.getPageCount?.() ?? 0
            if (!Number.isInteger(pageCount) || pageCount < 1) throw new Error('OFFICE_PAGE_COUNT_UNAVAILABLE')
            return pageCount
          },
          bridge,
        }
      } else {
        throw new Error('DOCUMENT_FILE_TYPE_UNSUPPORTED')
      }
      try {
        await parseDocument(input, sink)
      } finally {
        this.parserInputs.delete(job.jobId)
      }
    })
  }
}

export const documentProcessingRuntime = new DocumentProcessingRuntime()
