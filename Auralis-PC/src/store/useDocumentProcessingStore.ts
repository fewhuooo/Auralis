import { defineStore } from 'pinia'
import type { DocumentProcessingJob } from '@/types/documentProcessing'
import type { DocumentJobRunner } from '@/services/documentProcessing/DocumentJobRunner'

interface DocumentSourceScheduler {
  retry(jobId: string): Promise<unknown>
}

export interface LocalOcrPageProgress {
  currentPage: number
  totalPages: number
}

interface LocalOcrProgressReader {
  list(): Promise<Array<{
    localSourceId: string
    attempt: number
    localContentRevision: string
    checkpointJson: string | null
  }>>
}

interface LocalOcrProgressIdentity {
  attempt: number
  localContentRevision: string
  progress: LocalOcrPageProgress
}

export const useDocumentProcessingStore = defineStore('document-processing', {
  state: () => ({
    jobs: [] as DocumentProcessingJob[],
    runner: null as DocumentJobRunner | null,
    scheduler: null as DocumentSourceScheduler | null,
    localOcrProgressReader: null as LocalOcrProgressReader | null,
    localOcrReaderGeneration: 0,
    localOcrRefreshSequence: 0,
    localOcrProgressBySource: {} as Record<string, LocalOcrPageProgress>,
    localOcrProgressIdentityBySource: {} as Record<string, LocalOcrProgressIdentity>,
    loading: false,
    lastError: null as string | null,
  }),
  getters: {
    isRuntimeAvailable: (state) => Boolean(state.runner),
    activeJobs: (state) => state.jobs.filter((job) => !['READY', 'FAILED_LOCAL', 'FAILED_SERVER'].includes(job.phase)),
    hasPendingJobs: (state) => state.jobs.some((job) => !['READY', 'FAILED_LOCAL', 'FAILED_SERVER'].includes(job.phase)),
  },
  actions: {
    attachRunner(runner: DocumentJobRunner | null): void {
      this.runner = runner
    },
    attachScheduler(scheduler: DocumentSourceScheduler | null): void {
      this.scheduler = scheduler
    },
    attachLocalOcrProgressReader(reader: LocalOcrProgressReader | null): void {
      this.localOcrProgressReader = reader
      this.localOcrReaderGeneration += 1
      this.localOcrRefreshSequence += 1
      this.localOcrProgressBySource = {}
      this.localOcrProgressIdentityBySource = {}
    },
    setJobs(jobs: DocumentProcessingJob[]): void {
      this.jobs = jobs
    },
    async refresh(): Promise<void> {
      const refreshSequence = this.localOcrRefreshSequence + 1
      this.localOcrRefreshSequence = refreshSequence
      const runner = this.runner
      if (!runner) return
      const jobs = await runner.list()
      if (refreshSequence !== this.localOcrRefreshSequence || this.runner !== runner) return
      this.jobs = jobs
      const reader = this.localOcrProgressReader
      const readerGeneration = this.localOcrReaderGeneration
      if (!reader) return
      const isCurrent = (): boolean => (
        refreshSequence === this.localOcrRefreshSequence
        && this.localOcrProgressReader === reader
        && this.localOcrReaderGeneration === readerGeneration
        && this.runner === runner
      )

      try {
        const projection: Record<string, LocalOcrPageProgress> = {}
        const identityProjection: Record<string, LocalOcrProgressIdentity> = {}
        const previousProjection = this.localOcrProgressIdentityBySource
        const records = await reader.list()
        for (const record of records) {
          if (!record.checkpointJson) continue
          const hasRunIdentity = Number.isInteger(record.attempt)
            && typeof record.localContentRevision === 'string'
            && record.localContentRevision.trim().length > 0
          try {
            const parsed: unknown = JSON.parse(record.checkpointJson)
            if (!parsed || typeof parsed !== 'object') continue
            const checkpoint = parsed as {
              type?: unknown
              pageNumber?: unknown
              totalPages?: unknown
            }
            if (checkpoint.type === 'before-recognize') {
              if (
                !Number.isInteger(checkpoint.pageNumber)
                || !Number.isInteger(checkpoint.totalPages)
                || (checkpoint.pageNumber as number) < 1
                || (checkpoint.totalPages as number) < (checkpoint.pageNumber as number)
              ) continue
              const progress = {
                currentPage: checkpoint.pageNumber as number,
                totalPages: checkpoint.totalPages as number,
              }
              const previous = previousProjection[record.localSourceId]
              if (
                previous
                && hasRunIdentity
                && previous.attempt === record.attempt
                && previous.localContentRevision === record.localContentRevision
                && (
                  previous.progress.totalPages !== progress.totalPages
                  || progress.currentPage < previous.progress.currentPage
                )
              ) {
                projection[record.localSourceId] = previous.progress
                identityProjection[record.localSourceId] = previous
              } else {
                projection[record.localSourceId] = progress
                if (hasRunIdentity) {
                  identityProjection[record.localSourceId] = {
                    attempt: record.attempt,
                    localContentRevision: record.localContentRevision,
                    progress,
                  }
                }
              }
            } else if (
              ['after-recognize', 'after-normalize', 'page-result', 'empty-page'].includes(String(checkpoint.type))
              && hasRunIdentity
            ) {
              const previous = previousProjection[record.localSourceId]
              if (
                previous
                && previous.attempt === record.attempt
                && previous.localContentRevision === record.localContentRevision
                && Number.isInteger(checkpoint.pageNumber)
                && Number.isInteger(checkpoint.totalPages)
                && checkpoint.pageNumber === previous.progress.currentPage
                && checkpoint.totalPages === previous.progress.totalPages
              ) {
                projection[record.localSourceId] = previous.progress
                identityProjection[record.localSourceId] = previous
              }
            }
          } catch {
            // Malformed checkpoints are ignored; the durable Job refresh remains usable.
          }
        }
        if (!isCurrent()) return
        this.localOcrProgressIdentityBySource = identityProjection
        this.localOcrProgressBySource = projection
      } catch {
        // A local reader failure must not prevent the durable Job refresh.
        if (!isCurrent()) return
        this.localOcrProgressIdentityBySource = {}
        this.localOcrProgressBySource = {}
      }
    },
    async start(jobId: string): Promise<void> {
      if (!this.runner) throw new Error('DOCUMENT_JOB_RUNNER_UNAVAILABLE')
      this.loading = true
      this.lastError = null
      try {
        await this.runner.start(jobId)
      } catch (error) {
        this.lastError = error instanceof Error ? error.message : String(error)
        throw error
      } finally {
        this.loading = false
      }
    },
    async resumePending(): Promise<void> {
      if (!this.runner) throw new Error('DOCUMENT_JOB_RUNNER_UNAVAILABLE')
      await this.runner.resumePending()
    },
    async pauseForNetwork(jobId: string): Promise<void> {
      if (!this.runner) throw new Error('DOCUMENT_JOB_RUNNER_UNAVAILABLE')
      await this.runner.pauseForNetwork(jobId)
    },
    async retry(jobId: string): Promise<void> {
      if (!this.scheduler) throw new Error('DOCUMENT_JOB_SCHEDULER_UNAVAILABLE')
      await this.scheduler.retry(jobId)
    },
    async cancel(jobId: string): Promise<void> {
      if (!this.runner) throw new Error('DOCUMENT_JOB_RUNNER_UNAVAILABLE')
      await this.runner.cancel(jobId)
    },
  },
})
