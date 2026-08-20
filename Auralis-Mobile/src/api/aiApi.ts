import type { components } from './generated/schema'
import { defaultApiCallClient, type ApiCallClient } from './apiCallClient'

export type AiSettingsCommand = components['schemas']['AiSettingsCommand']
export type AiSettingsView = components['schemas']['AiSettingsView']
export type ConversationCommand = components['schemas']['ConversationCommand']
export type ConversationView = components['schemas']['ConversationView']

export function createAiApi(client: ApiCallClient = defaultApiCallClient) {
  return {
    getSettings: () => client.request('/api/ai/settings', 'get') as Promise<AiSettingsView[]>,
    updateSettings: (body: AiSettingsCommand) => client.request(
      '/api/ai/settings', 'put', { body },
    ) as Promise<AiSettingsView>,
    createConversation: (body: ConversationCommand) => client.request(
      '/api/ai/conversations', 'post', { body },
    ) as Promise<ConversationView>,
  }
}

export const aiApi = createAiApi()
