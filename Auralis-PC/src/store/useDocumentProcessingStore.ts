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
    checkpointJson: string | null
  }>>
}

export const useDocumentProcessingStore = defineStore('document-processing', {
  state: () => ({
    jobs: [] as DocumentProcessingJob[],
    runner: null as DocumentJobRunner | null,
    scheduler: null as DocumentSourceScheduler | null,
    localOcrProgressReader: null as LocalOcrProgressReader | null,
    localOcrProgressBySource: {} as Record<string, LocalOcrPageProgress>,
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
      this.localOcrProgressBySource = {}
    },
    setJobs(jobs: DocumentProcessingJob[]): void {
      this.jobs = jobs
    },
    async refresh(): Promise<void> {
      if (!this.runner) return
      this.jobs = await this.runner.list()
      this.localOcrProgressBySource = {}
      if (!this.localOcrProgressReader) return

      try {
        const projection: Record<string, LocalOcrPageProgress> = {}
        const records = await this.localOcrProgressReader.list()
        for (const record of records) {
          if (!record.checkpointJson) continue
          try {
            const parsed: unknown = JSON.parse(record.checkpointJson)
            if (!parsed || typeof parsed !== 'object') continue
            const checkpoint = parsed as {
              type?: unknown
              pageNumber?: unknown
              totalPages?: unknown
            }
            if (
              checkpoint.type !== 'before-recognize'
              || !Number.isInteger(checkpoint.pageNumber)
              || !Number.isInteger(checkpoint.totalPages)
              || (checkpoint.pageNumber as number) < 1
              || (checkpoint.totalPages as number) < (checkpoint.pageNumber as number)
            ) continue
            projection[record.localSourceId] = {
              currentPage: checkpoint.pageNumber as number,
              totalPages: checkpoint.totalPages as number,
            }
          } catch {
            // Malformed checkpoints are ignored; the durable Job refresh remains usable.
          }
        }
        this.localOcrProgressBySource = projection
      } catch {
        // A local reader failure must not prevent the durable Job refresh.
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
