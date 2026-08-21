import type { components } from './generated/schema'
import { defaultApiCallClient, type ApiCallClient } from './apiCallClient.ts'

export type AiSettingsCommand = components['schemas']['AiSettingsCommand']
export type AiSettingsView = components['schemas']['AiSettingsView']
export type ConversationCommand = components['schemas']['ConversationCommand']
export type ConversationView = components['schemas']['ConversationView']

export function createAiApi(client: ApiCallClient = defaultApiCallClient) {
  return {
    getSettings: () => client.request('/api/ai/settings', 'get') as Promise<AiSettingsView[]>,
    listConversations: () => client.request('/api/ai/conversations', 'get') as Promise<ConversationView[]>,
    updateSettings: (body: AiSettingsCommand) => client.request(
      '/api/ai/settings', 'put', { body },
    ) as Promise<AiSettingsView>,
    createConversation: (body: ConversationCommand) => client.request(
      '/api/ai/conversations', 'post', { body },
    ) as Promise<ConversationView>,
    getConversation: (conversationId: string) => client.request(
      '/api/ai/conversations/{conversationId}', 'get', { pathParams: { conversationId } },
    ) as Promise<ConversationView>,
    deleteConversation: (conversationId: string, baseVersion: number) => client.request(
      '/api/ai/conversations/{conversationId}', 'delete', {
        pathParams: { conversationId },
        query: { baseVersion },
      },
    ) as Promise<void>,
  }
}

export const aiApi = createAiApi()
