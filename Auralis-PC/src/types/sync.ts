import type { components } from '@/api/generated/schema'

export type SyncResourceType = components['schemas']['MutationRequest']['resourceType']
export type SyncMutationType = components['schemas']['MutationRequest']['mutationType']
export type SyncChangeMutationType = components['schemas']['ChangeResponse']['mutationType']
export type SyncMutationDecision = NonNullable<components['schemas']['MutationResponse']['decision']>

export type SyncMutationRequest = components['schemas']['MutationRequest']

export interface SyncPullQuery {
  cursor?: string
  limit?: number
}

export interface SyncChange {
  cursor: string | null
  resourceType: SyncResourceType
  resourceId: string
  mutationType: SyncChangeMutationType
  version: number
  deletedAt: string | null
  payload: unknown
  createdAt: string | null
}

export interface SyncPullResponse {
  changes: SyncChange[]
  nextCursor: string | null
  hasMore: boolean
  resetRequired: boolean
}

export type SyncMutationResponse = components['schemas']['MutationResponse']

export interface SyncPushResponse {
  results: SyncMutationResponse[]
  serverCursor: string | null
}

export interface SyncSnapshotResponse {
  snapshotCursor: string | null
  subjects: unknown[]
  sources: unknown[]
  knowledgeBlocks: unknown[]
  tasks: unknown[]
  relations: unknown[]
}
