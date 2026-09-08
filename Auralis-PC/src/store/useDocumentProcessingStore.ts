import { defineStore } from 'pinia'
import type { DocumentProcessingJob } from '@/types/documentProcessing'
import type { DocumentJobRunner } from '@/services/documentProcessing/DocumentJobRunner'

interface DocumentSourceScheduler {
  retry(jobId: string): Promise<unknown>
}

export const useDocumentProcessingStore = defineStore('document-processing', {
  state: () => ({
    jobs: [] as DocumentProcessingJob[],
    runner: null as DocumentJobRunner | null,
    scheduler: null as DocumentSourceScheduler | null,
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
    setJobs(jobs: DocumentProcessingJob[]): void {
      this.jobs = jobs
    },
    async refresh(): Promise<void> {
      if (!this.runner) return
      this.jobs = await this.runner.list()
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
