import request from './request'
import type { SyncRequestScopeTicket, SyncScopedAxiosRequestConfig } from './request'
import type { LocalMutation } from '@/types/api'
import type {
  SyncChange,
  SyncMutationRequest,
  SyncPullQuery,
  SyncPullResponse,
  SyncPushResponse,
  SyncSnapshotResponse,
} from '@/types/sync'

const RESOURCE_TYPES = new Set(['SUBJECT', 'SOURCE', 'KNOWLEDGE_BLOCK', 'TASK', 'RELATION'])
const MUTATION_TYPES = new Set(['CREATE', 'UPDATE', 'DELETE', 'RESTORE'])

function assertMutationValue<T extends string>(value: string, values: Set<string>, label: string): T {
  if (!values.has(value)) throw new Error(`Unsupported sync ${label}: ${value}`)
  return value as T
}

function toMutationRequest(mutation: LocalMutation): SyncMutationRequest {
  return {
    clientMutationId: mutation.clientMutationId,
    resourceType: assertMutationValue(mutation.resourceType, RESOURCE_TYPES, 'resourceType'),
    resourceId: mutation.resourceId,
    mutationType: assertMutationValue(mutation.mutationType, MUTATION_TYPES, 'mutationType'),
    baseVersion: mutation.baseVersion,
    payload: mutation.payload,
  }
}

function normalizeChange(change: Partial<SyncChange>): SyncChange {
  if (!change.resourceType || !RESOURCE_TYPES.has(change.resourceType)) {
    throw new Error('Sync pull returned an invalid resourceType')
  }
  if (!change.resourceId || !change.mutationType || !MUTATION_TYPES.has(change.mutationType)) {
    throw new Error('Sync pull returned an invalid resource identity or mutationType')
  }
  return {
    cursor: change.cursor ?? null,
    resourceType: change.resourceType,
    resourceId: change.resourceId,
    mutationType: change.mutationType,
    version: Number(change.version ?? 0),
    deletedAt: change.deletedAt ?? null,
    payload: change.payload ?? null,
    createdAt: change.createdAt ?? null,
  }
}

function normalizePullResponse(response: Partial<SyncPullResponse>): SyncPullResponse {
  return {
    changes: Array.isArray(response.changes) ? response.changes.map((change) => normalizeChange(change)) : [],
    nextCursor: response.nextCursor ?? null,
    hasMore: response.hasMore === true,
    resetRequired: response.resetRequired === true,
  }
}

function normalizePushResponse(response: Partial<SyncPushResponse>): SyncPushResponse {
  return {
    results: Array.isArray(response.results) ? response.results : [],
    serverCursor: response.serverCursor ?? null,
  }
}

function normalizeSnapshotResponse(response: Partial<SyncSnapshotResponse>): SyncSnapshotResponse {
  return {
    snapshotCursor: response.snapshotCursor ?? null,
    subjects: Array.isArray(response.subjects) ? response.subjects : [],
    sources: Array.isArray(response.sources) ? response.sources : [],
    knowledgeBlocks: Array.isArray(response.knowledgeBlocks) ? response.knowledgeBlocks : [],
    tasks: Array.isArray(response.tasks) ? response.tasks : [],
    relations: Array.isArray(response.relations) ? response.relations : [],
  }
}

export const useSyncApi = {
  async pullChanges(input: SyncPullQuery = {}, scope?: SyncRequestScopeTicket): Promise<SyncPullResponse> {
    const config = scope
      ? { params: input, __auralisSyncScope: scope } as SyncScopedAxiosRequestConfig
      : { params: input }
    const response = await request.get('/api/sync/pull', config) as unknown as Partial<SyncPullResponse>
    return normalizePullResponse(response)
  },

  async pushChanges(input: { serverDeviceId: string; mutations: LocalMutation[] }, scope?: SyncRequestScopeTicket): Promise<SyncPushResponse> {
    const response = await request.post('/api/sync/push', {
      serverDeviceId: input.serverDeviceId,
      mutations: input.mutations.map(toMutationRequest),
    }, scope ? { __auralisSyncScope: scope } as SyncScopedAxiosRequestConfig : undefined) as unknown as Partial<SyncPushResponse>
    return normalizePushResponse(response)
  },

  async getSnapshot(scope?: SyncRequestScopeTicket): Promise<SyncSnapshotResponse> {
    const config = scope ? { __auralisSyncScope: scope } as SyncScopedAxiosRequestConfig : undefined
    const response = await request.get('/api/sync/snapshot', config) as unknown as Partial<SyncSnapshotResponse>
    return normalizeSnapshotResponse(response)
  },
}

export const pullChanges = useSyncApi.pullChanges
export const pushChanges = useSyncApi.pushChanges
export const getSnapshot = useSyncApi.getSnapshot
