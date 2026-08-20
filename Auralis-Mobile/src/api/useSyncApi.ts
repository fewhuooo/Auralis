import type { components } from './generated/schema'
import { defaultApiCallClient, type ApiCallClient } from './apiCallClient.ts'

export type SyncMutation = components['schemas']['MutationRequest']
export type SyncPushRequest = components['schemas']['PushRequest']
export type SyncPushResponse = components['schemas']['PushResponse']
export type SyncPullResponse = components['schemas']['PullResponse']
export type SyncSnapshotResponse = components['schemas']['SnapshotResponse']
export type SyncChange = components['schemas']['ChangeResponse']

export function createSyncApi(client: ApiCallClient = defaultApiCallClient) {
  return {
    push: (body: SyncPushRequest) => client.request(
      '/api/sync/push', 'post', { body },
    ) as Promise<SyncPushResponse>,
    pull: (cursor?: string | null, limit = 200) => client.request(
      '/api/sync/pull', 'get', {
        query: { cursor: cursor || undefined, limit },
      },
    ) as Promise<SyncPullResponse>,
    snapshot: () => client.request(
      '/api/sync/snapshot', 'get',
    ) as Promise<SyncSnapshotResponse>,
  }
}

export const useSyncApi = createSyncApi()
