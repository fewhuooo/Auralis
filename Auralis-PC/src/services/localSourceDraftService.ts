import type { LocalAssetRepository } from '@/services/localAssetRepository'
import type { LocalRepository } from '@/services/localRepository'
import type { LocalSourceDraft } from '@/types/localAsset'
import type { SourceView } from '@/api/useSourceApi'
import { createStableMutation } from '@/services/offlineWritePolicy'
import { uuidv7 } from '@/utils/uuid'

export interface CreateDraftInput {
  localSourceId: string
  localAssetId: string
  subjectId: string
  title: string
  outline?: string
  localContentRevision?: string
  assetSizeBytes?: number
}

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

  async releaseDraftsForAsset(localAssetId: string, serverAssetId: string): Promise<string[]> {
    const drafts = await this.assetRepository.listSourceDrafts({
      localAssetId,
      state: 'DRAFT',
    })

    const releasedIds: string[] = []

    for (const draft of drafts) {
      const existing = await this.localRepository.read<SourceView>('SOURCE', draft.localSourceId)
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

      const { assetSizeBytes: _ignored, ...mutationView } = updatedView

      const mutation = createStableMutation({
        clientMutationId: uuidv7(),
        resourceType: 'SOURCE',
        resourceId: draft.localSourceId,
        mutationType: 'CREATE',
        baseVersion: 0,
        payload: mutationView as unknown as Record<string, unknown>,
      })

      await this.localRepository.commitMutation({
        resourceType: 'SOURCE',
        resourceId: draft.localSourceId,
        value: updatedView,
        version: 0,
        deletedAt: null,
        mutation,
      })

      await this.assetRepository.updateSourceDraft(draft.localSourceId, {
        serverSourceId: draft.localSourceId,
        state: 'SYNCING',
      })

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
