import type { OverviewRepository } from '@/services/overviewRepository'
import type { LocalAssetRepository } from '@/services/localAssetRepository'
import type { LocalAssetService } from '@/services/localAssetService'
import type { LocalRepository, LocalSubjectCascadeResource } from '@/services/localRepository'
import type { DocumentProcessingJobRepository } from '@/services/localRepository'

export interface SubjectDeletionRuntimeHooks {
  discardSource?: (sourceId: string) => Promise<void>
  discardFileOverview?: (sourceId: string) => Promise<void>
}

let runtimeHooks: SubjectDeletionRuntimeHooks = {}

export function attachSubjectDeletionRuntime(hooks: SubjectDeletionRuntimeHooks | null): void {
  runtimeHooks = hooks ?? {}
}

export interface SubjectDeletionCoordinatorOptions {
  repo: LocalRepository
  assetRepo?: LocalAssetRepository
  assetService?: LocalAssetService
  overview?: Pick<OverviewRepository, 'removeSubjectOverview' | 'removeFileOverviews'>
  jobs?: Pick<DocumentProcessingJobRepository, 'removeBySource'>
  hooks?: SubjectDeletionRuntimeHooks
}

function recordAssetId(resource: LocalSubjectCascadeResource): string | null {
  if (!resource.value || typeof resource.value !== 'object' || Array.isArray(resource.value)) return null
  const value = resource.value as Record<string, unknown>
  return typeof value.assetId === 'string' && value.assetId.trim() ? value.assetId : null
}

/** Coordinates the local half of Subject deletion after the parent marker commits. */
export class SubjectDeletionCoordinator {
  private readonly repo: LocalRepository
  private readonly assetRepo?: LocalAssetRepository
  private readonly assetService?: LocalAssetService
  private readonly overview?: SubjectDeletionCoordinatorOptions['overview']
  private readonly jobs?: SubjectDeletionCoordinatorOptions['jobs']
  private readonly hooks: SubjectDeletionRuntimeHooks

  constructor(options: SubjectDeletionCoordinatorOptions) {
    this.repo = options.repo
    this.assetRepo = options.assetRepo
    this.assetService = options.assetService
    this.overview = options.overview
    this.jobs = options.jobs
    this.hooks = { ...runtimeHooks, ...options.hooks }
  }

  /** Commits the local-only child fences before the sync scheduler is released. */
  async markDeletedSubject(subjectId: string): Promise<LocalSubjectCascadeResource[]> {
    const subject = await this.repo.read('SUBJECT', subjectId)
    if (!subject?.deletedAt) return []
    const impacted = await this.repo.tombstoneSubjectChildren(subjectId, subject.deletedAt)
    await this.cleanupSubjectOverview(subjectId)
    return impacted
  }

  async cleanupMarkedSubject(impacted: LocalSubjectCascadeResource[]): Promise<void> {
    for (const resource of impacted.filter((item) => item.resourceType === 'SOURCE')) {
      await this.cleanupSource(resource)
    }
  }

  async reconcileDeletedSubject(subjectId: string): Promise<void> {
    await this.cleanupMarkedSubject(await this.markDeletedSubject(subjectId))
  }

  async reconcileDeletedSubjects(): Promise<void> {
    const subjects = await this.repo.list('SUBJECT', { includeDeleted: true })
    for (const subject of subjects) {
      if (subject.deletedAt) await this.reconcileDeletedSubject(subject.id)
    }
  }

  private async cleanupSubjectOverview(subjectId: string): Promise<void> {
    await this.overview?.removeSubjectOverview(subjectId)
  }

  private async cleanupSource(source: LocalSubjectCascadeResource): Promise<void> {
    const sourceId = source.id
    // Runtime hooks cancel active parser/cache work before the durable job rows
    // are removed. The repository-level cleanup remains restart-idempotent.
    await this.hooks.discardSource?.(sourceId)
    if (!this.hooks.discardSource) await this.jobs?.removeBySource(sourceId)
    await this.hooks.discardFileOverview?.(sourceId)
    if (!this.hooks.discardFileOverview) await this.overview?.removeFileOverviews(sourceId)

    if (!this.assetRepo) return
    const draft = await this.assetRepo.getSourceDraft(sourceId)
    const assetId = recordAssetId(source)
    if (draft && draft.state !== 'DELETED') await this.assetRepo.deleteSourceDraft(sourceId)
    if (!assetId || !this.assetService) return

    const localAsset = await this.assetRepo.getAssetFile(assetId) ?? await this.assetRepo.getAssetFileByServerId(assetId)
    if (!localAsset) return
    try {
      await this.assetService.deleteUnreferencedAsset(localAsset.localAssetId)
    } catch (error) {
      // An active Source outside the deleted Subject is the explicit fence;
      // startup reconciliation will retry after that Source is deleted.
      if (!(error instanceof Error) || !error.message.includes('ASSET_HAS_ACTIVE_REFERENCES')) throw error
    }
  }
}
