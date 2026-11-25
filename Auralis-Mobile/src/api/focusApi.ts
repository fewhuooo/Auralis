import type { components } from './generated/schema'
import { defaultApiCallClient, type ApiCallClient } from './apiCallClient.ts'

export type FocusSessionCommand = components['schemas']['FocusSessionCommand']
export type FocusSessionView = components['schemas']['FocusSessionView']

export function createFocusApi(client: ApiCallClient = defaultApiCallClient) {
  return {
    recordSession: (body: FocusSessionCommand) => client.request(
      '/api/focus-sessions', 'post', { body },
    ) as Promise<FocusSessionView>,
  }
}

export const focusApi = createFocusApi()
