import { defineStore } from 'pinia'
import type { DocumentProcessingJob } from '@/types/documentProcessing'
import type { DocumentJobRunner } from '@/services/documentProcessing/DocumentJobRunner'

export const useDocumentProcessingStore = defineStore('document-processing', {
  state: () => ({
    jobs: [] as DocumentProcessingJob[],
    runner: null as DocumentJobRunner | null,
    loading: false,
    lastError: null as string | null,
  }),
  getters: {
    activeJobs: (state) => state.jobs.filter((job) => !['READY', 'FAILED_LOCAL', 'FAILED_SERVER'].includes(job.phase)),
    hasPendingJobs: (state) => state.jobs.some((job) => !['READY', 'FAILED_LOCAL', 'FAILED_SERVER'].includes(job.phase)),
  },
  actions: {
    attachRunner(runner: DocumentJobRunner | null): void {
      this.runner = runner
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
      if (!this.runner) throw new Error('DOCUMENT_JOB_RUNNER_UNAVAILABLE')
      await this.runner.retry(jobId)
    },
    async cancel(jobId: string): Promise<void> {
      if (!this.runner) throw new Error('DOCUMENT_JOB_RUNNER_UNAVAILABLE')
      await this.runner.cancel(jobId)
    },
  },
})
