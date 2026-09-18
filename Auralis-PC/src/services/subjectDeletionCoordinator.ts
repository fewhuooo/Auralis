import type { OverviewRepository } from '@/services/overviewRepository'
import type { LocalAssetRepository } from '@/services/localAssetRepository'
import type { LocalAssetService } from '@/services/localAssetService'
import type { LocalRepository, LocalSubjectCascadeResource } from '@/services/localRepository'
import type { DocumentProcessingJobRepository } from '@/services/localRepository'
import { publishProjectionChange } from '@/services/localProjectionEvents'

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
    let changed = impacted.some((resource) => resource.deletedAt === null)
    // Draft cancellation belongs to the awaited durable fence. Otherwise an
    // already-claimed Asset queue could release the draft and recreate
    // SOURCE/CREATE after this method returns.
    if (this.assetRepo) {
      for (const source of impacted.filter((item) => item.resourceType === 'SOURCE')) {
        const draft = await this.assetRepo.getSourceDraft(source.id)
        if (draft && draft.state !== 'DELETED') {
          changed = true
          await this.assetRepo.deleteSourceDraft(source.id)
        }
        const assetId = recordAssetId(source)
        const asset = assetId
          ? await this.assetRepo.getAssetFile(assetId) ?? await this.assetRepo.getAssetFileByServerId(assetId)
          : null
        if (asset && !(await this.assetRepo.hasActiveSourceReferences(asset.localAssetId))) {
          await this.assetRepo.cancelSyncJobsForAsset(asset.localAssetId)
        }
      }
    }
    if (changed) {
      publishProjectionChange({
        resourceTypes: new Set(['SUBJECT', 'SOURCE', 'KNOWLEDGE_BLOCK', 'TASK', 'RELATION']),
      })
    }
    return impacted
  }

  async cleanupMarkedSubject(impacted: LocalSubjectCascadeResource[], allowPhysicalAssetDeletion = false): Promise<void> {
    for (const resource of impacted.filter((item) => item.resourceType === 'SOURCE')) {
      await this.cleanupSource(resource, allowPhysicalAssetDeletion)
    }
  }

  async reconcileDeletedSubject(subjectId: string): Promise<void> {
    const unresolved = await this.repo.listUnresolved('SUBJECT')
    const parentPending = unresolved.some((mutation) => mutation.resourceId === subjectId && mutation.mutationType === 'DELETE')
    await this.cleanupMarkedSubject(await this.markDeletedSubject(subjectId), !parentPending)
  }

  async reconcileDeletedSubjects(): Promise<void> {
    // A process can exit after sync records a terminal conflict/error but
    // before the explicit rejection resolver runs. The remote payload is the
    // durable evidence needed to finish that same auditable repair on boot.
    for (const mutation of await this.repo.listUnresolved('SUBJECT')) {
      if (mutation.mutationType !== 'DELETE' || !['conflict', 'error'].includes(mutation.status) || mutation.remoteValue === undefined) continue
      await this.repo.resolveRejectedSubjectDelete({
        clientMutationId: mutation.clientMutationId,
        remoteValue: mutation.remoteValue,
        remoteVersion: mutation.remoteVersion,
      })
    }
    const subjects = await this.repo.list('SUBJECT', { includeDeleted: true })
    for (const subject of subjects) {
      if (subject.deletedAt) await this.reconcileDeletedSubject(subject.id)
    }
  }

  private async cleanupSubjectOverview(subjectId: string): Promise<void> {
    await this.overview?.removeSubjectOverview(subjectId)
  }

  private async cleanupSource(source: LocalSubjectCascadeResource, allowPhysicalAssetDeletion: boolean): Promise<void> {
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
    if (!allowPhysicalAssetDeletion || !assetId || !this.assetService) return

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
