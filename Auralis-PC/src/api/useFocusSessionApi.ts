import request from './request.ts'
import type { SyncRequestScopeTicket, SyncScopedAxiosRequestConfig } from './request.ts'
import type { FocusSessionEvent } from '@/services/pomodoroSessionRuntime'

export const useFocusSessionApi = {
  create(event: FocusSessionEvent, scope?: SyncRequestScopeTicket): Promise<void> {
    const config = scope ? { __auralisSyncScope: scope } as SyncScopedAxiosRequestConfig : undefined
    return request.post('/api/focus-sessions', event, config) as unknown as Promise<void>
  },
}

export const createFocusSession = useFocusSessionApi.create
