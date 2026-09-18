import type { LocalAssetRepository } from '@/services/localAssetRepository'
import type { LocalRepository } from '@/services/localRepository'
import type { LocalSourceDraft } from '@/types/localAsset'
import type { SourceView } from '@/api/useSourceApi'
import { createStableMutation } from '@/services/offlineWritePolicy'
import { uuidv7 } from '@/utils/uuid'
import { withLocalAssetLifecycleLock } from '@/services/localAssetLifecycleLock'

export interface CreateDraftInput {
  localSourceId: string
  localAssetId: string
  subjectId: string
  title: string
  outline?: string
  localContentRevision?: string
  assetSizeBytes?: number
}

export type LifecycleGuard = (() => void) | (() => boolean)

function checkLifecycleGuard(guard?: LifecycleGuard): void {
  if (!guard) return
  const result = guard()
  if (result === false) {
    const err = new Error('LOCAL_SOURCE_DRAFT_INTERRUPTED')
    ;(err as any).code = 'LOCAL_ASSET_QUEUE_DISPOSED'
    throw err
  }
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-7][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export class LocalSourceDraftService {
  private readonly assetRepository: LocalAssetRepository
  private readonly localRepository: LocalRepository
  private readonly now: () => string

  constructor(
    assetRepository: LocalAssetRepository,
    localRepository: LocalRepository,
    now: () => string = () => new Date().toISOString(),
  ) {
    this.assetRepository = assetRepository
    this.localRepository = localRepository
    this.now = now
  }

  async createDraft(input: CreateDraftInput): Promise<LocalSourceDraft> {
    const now = this.now()
    const localContentRevision = input.localContentRevision ?? uuidv7()
    if (!UUID_REGEX.test(localContentRevision)) {
      throw new Error('INVALID_LOCAL_CONTENT_REVISION: localContentRevision must be a valid UUID')
    }

    // 1. Create draft record in LocalAssetRepository
    const draft = await this.assetRepository.createSourceDraft({
      localSourceId: input.localSourceId,
      localAssetId: input.localAssetId,
      subjectId: input.subjectId,
      title: input.title,
      localContentRevision,
      state: 'DRAFT',
    })

    // 2. Create local Source projection in LocalRepository WITHOUT outbox mutation
    const localView: SourceView = {
      id: input.localSourceId,
      subjectId: input.subjectId,
      type: 'FILE',
      title: input.title,
      assetId: input.localAssetId,
      outline: input.outline ?? '[]',
      version: 0,
      createdAt: now,
      updatedAt: now,
      deletedAt: undefined,
      ingestionStatus: 'AWAITING_CLIENT',
      assetSizeBytes: input.assetSizeBytes,
    }

    await this.localRepository.upsert('SOURCE', input.localSourceId, localView, {
      version: 0,
      deletedAt: null,
      syncStatus: 'pending',
    })

    return draft
  }

  async getDraft(localSourceId: string): Promise<LocalSourceDraft | null> {
    return this.assetRepository.getSourceDraft(localSourceId)
  }

  async listDraftsForAsset(localAssetId: string): Promise<LocalSourceDraft[]> {
    return this.assetRepository.listSourceDrafts({ localAssetId })
  }

  async releaseDraftsForAsset(
    localAssetId: string,
    serverAssetId: string,
    lifecycleGuard?: LifecycleGuard,
  ): Promise<string[]> {
    return withLocalAssetLifecycleLock(this.assetRepository.userId, this.assetRepository.serverDeviceId, () =>
      this.releaseDraftsForAssetUnlocked(localAssetId, serverAssetId, lifecycleGuard))
  }

  /** Caller must already hold the owner/device asset lifecycle lock. */
  private async releaseDraftsForAssetUnlocked(
    localAssetId: string,
    serverAssetId: string,
    lifecycleGuard?: LifecycleGuard,
  ): Promise<string[]> {
    checkLifecycleGuard(lifecycleGuard)
    const drafts = await this.assetRepository.listSourceDrafts({
      localAssetId,
      state: 'DRAFT',
    })
    checkLifecycleGuard(lifecycleGuard)

    const releasedIds: string[] = []

    for (const draft of drafts) {
      checkLifecycleGuard(lifecycleGuard)
      const existing = await this.localRepository.read<SourceView>('SOURCE', draft.localSourceId)
      checkLifecycleGuard(lifecycleGuard)
      // A Subject/Source delete fence can run after the queue has claimed its
      // job. The shared lifecycle lock serializes this read with the fence;
      // never recreate SOURCE/CREATE for an already tombstoned projection.
      if (existing?.deletedAt) continue

      const subject = await this.localRepository.read<Record<string, unknown>>('SUBJECT', draft.subjectId)
      checkLifecycleGuard(lifecycleGuard)
      const unresolved = await this.localRepository.listUnresolved()
      checkLifecycleGuard(lifecycleGuard)
      // The parent marker is committed before the coordinator acquires this
      // lock. Re-reading both the parent projection and its unresolved fence
      // closes that ordering gap even while SOURCE is still active.
      if (subject?.deletedAt || unresolved.some((mutation) =>
        mutation.resourceType === 'SUBJECT' && mutation.resourceId === draft.subjectId && mutation.mutationType === 'DELETE')) {
        continue
      }

      if (!draft.localContentRevision || !UUID_REGEX.test(draft.localContentRevision)) {
        throw new Error(
          `DRAFT_INVALID_REVISION: localContentRevision for draft ${draft.localSourceId} must be a valid UUID`,
        )
      }

      const resourceMutations = unresolved.filter(
        (m) => m.resourceType === 'SOURCE' && m.resourceId === draft.localSourceId,
      )

      let alreadyCommitted = false
      if (resourceMutations.length > 0) {
        if (resourceMutations.length === 1) {
          const m = resourceMutations[0]
          const hasNoConflictOrError = m.status !== 'conflict' && m.status !== 'error' && !m.error
          const isMatchingCreate =
            m.resourceType === 'SOURCE' &&
            m.resourceId === draft.localSourceId &&
            m.mutationType === 'CREATE' &&
            m.clientMutationId === draft.localContentRevision &&
            m.payload &&
            typeof m.payload === 'object' &&
            (m.payload as Record<string, unknown>).assetId === serverAssetId &&
            hasNoConflictOrError

          if (isMatchingCreate) {
            alreadyCommitted = true
          } else {
            throw new Error(
              `LOCAL_SOURCE_DRAFT_CONFLICT: Mutation mismatch or conflict for draft ${draft.localSourceId}`,
            )
          }
        } else {
          throw new Error(
            `LOCAL_SOURCE_DRAFT_CONFLICT: Multiple unresolved mutations for draft ${draft.localSourceId}`,
          )
        }
      }

      const outline = existing?.value?.outline ?? '[]'
      const assetSizeBytes = existing?.value?.assetSizeBytes

      const updatedView: SourceView = {
        ...(existing?.value ?? {}),
        id: draft.localSourceId,
        subjectId: draft.subjectId,
        type: 'FILE',
        title: draft.title,
        assetId: serverAssetId,
        outline,
        version: 0,
        updatedAt: this.now(),
        ingestionStatus: 'AWAITING_CLIENT',
        assetSizeBytes,
      }

      if (!alreadyCommitted) {
        const { assetSizeBytes: _ignored, ...mutationView } = updatedView

        const mutation = createStableMutation({
          clientMutationId: draft.localContentRevision,
          resourceType: 'SOURCE',
          resourceId: draft.localSourceId,
          mutationType: 'CREATE',
          baseVersion: 0,
          payload: mutationView as unknown as Record<string, unknown>,
        })

        checkLifecycleGuard(lifecycleGuard)
        await this.localRepository.commitMutationUnlocked({
          resourceType: 'SOURCE',
          resourceId: draft.localSourceId,
          value: updatedView,
          version: 0,
          deletedAt: null,
          mutation,
        })
        checkLifecycleGuard(lifecycleGuard)
      }

      checkLifecycleGuard(lifecycleGuard)
      await this.assetRepository.updateSourceDraft(draft.localSourceId, {
        serverSourceId: draft.localSourceId,
        state: 'SYNCING',
      })
      checkLifecycleGuard(lifecycleGuard)

      releasedIds.push(draft.localSourceId)
    }

    return releasedIds
  }

  async bindServerIngestionRevision(
    localSourceId: string,
    serverIngestionRevision: string,
  ): Promise<LocalSourceDraft | null> {
    const draft = await this.assetRepository.getSourceDraft(localSourceId)
    if (!draft) return null
    return this.assetRepository.updateSourceDraft(localSourceId, {
      serverIngestionRevision,
      state: 'SYNCED',
    })
  }
}

const draftServiceCache = new Map<string, LocalSourceDraftService>()

export function getOrCreateLocalSourceDraftService(
  assetRepo: LocalAssetRepository,
  localRepo: LocalRepository,
): LocalSourceDraftService {
  const key = `${assetRepo.userId}:${assetRepo.serverDeviceId}`
  let instance = draftServiceCache.get(key)
  if (!instance) {
    instance = new LocalSourceDraftService(assetRepo, localRepo)
    draftServiceCache.set(key, instance)
  }
  return instance
}
