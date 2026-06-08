import mobileRequest from './request'

export interface Mutation {
  id?: number
  clientId: string
  userId?: string
  entityType: 'block' | 'task'
  entityId: string
  action: 'create' | 'update' | 'delete'
  payload: any
  createdAt: number
}

export interface SyncPullResponse {
  mutations: Mutation[]
  truncated: boolean
  blocks: any[]
  tasks: any[]
  lastMutationId: number
}

export const useSyncApi = {
  pull(afterId = 0): Promise<SyncPullResponse> {
    return mobileRequest.get('/api/sync/pull', { afterId })
  },
  push(mutations: Mutation[]): Promise<number[]> {
    return mobileRequest.post('/api/sync/push', mutations)
  }
}
